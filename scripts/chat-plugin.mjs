import {createServer} from 'node:http';
import {join} from 'node:path';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {localStore} from './chat-storage.mjs';
import {ISSUER,RESOURCE,accountKey,allowLocalRequest,makeAuthorization,validateCallback,planEnabled,newMessage,answerText,streamEvents,providerError,validateTurn,responseRequest} from './chat-core.mjs';

const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
async function bodyJson(req) {
  let size=0;const chunks=[];
  for await(const chunk of req) {size+=chunk.length;if(size>220000) throw new Error('The chat request is too large.');chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString());} catch {throw new Error('Invalid chat request.');}
}
async function fetchJson(url,options={}) {
  const res=await fetch(url,{...options,signal:options.signal || AbortSignal.timeout(25000)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) {const error=new Error(providerError(data.error?.code || data.error,res.status));error.status=res.status;throw error;}
  return data;
}

export function meridianChat({storage:providedStorage}={}) {
  let storagePromise, pending, authError='', refreshing, modelCache, activeTurn;
  const controllers=new Set();
  const store=()=>storagePromise ||= providedStorage?Promise.resolve(providedStorage):localStore(join(process.cwd(),'.meridian-local'));
  const jwks=createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
  const stopLogin=()=>{if(pending){clearTimeout(pending.timer);pending.server.close();pending=null;}};
  async function access(profile) {
    if(!planEnabled(profile)) throw new Error('Connect ChatGPT and enable plan usage before sending a message.');
    if(profile.expiresAt>Date.now()+60000) return profile.accessToken;
    if(!profile.refreshToken) throw new Error('Your ChatGPT session expired. Sign in again.');
    if(!refreshing) refreshing=(async()=>{
      const data=await fetchJson(`${ISSUER}/api/accounts/oauth/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:profile.clientId,refresh_token:profile.refreshToken,resource:RESOURCE})});
      if(typeof data.access_token!=='string'||!Number.isFinite(data.expires_in)) throw new Error('ChatGPT returned an incomplete renewal. Sign in again.');
      Object.assign(profile,{accessToken:data.access_token,refreshToken:data.refresh_token || profile.refreshToken,expiresAt:Date.now()+data.expires_in*1000,scopes:typeof data.scope==='string'?data.scope.split(' '):profile.scopes});
      await (await store()).save();
    })().finally(()=>{refreshing=null;});
    await refreshing;
    if(!planEnabled(profile)) throw new Error('ChatGPT plan usage is no longer enabled. Reconnect your account.');
    return profile.accessToken;
  }
  async function models(profile) {
    if(modelCache?.id===profile.id && modelCache.until>Date.now()) return modelCache.data;
    const data=await fetchJson(`${RESOURCE}/models`,{headers:{Authorization:`Bearer ${await access(profile)}`}});
    const list=(data.models || []).filter(m=>m.visibility==='list'&&typeof m.slug==='string').map(m=>({id:m.slug,name:m.display_name || m.slug}));
    modelCache={id:profile.id,until:Date.now()+300000,data:list};return list;
  }
  async function signIn(profile,origin) {
    stopLogin();authError='';
    const storage=await store();
    const callbackServer=createServer(async(req,res)=>{
      let transaction=pending?.transaction;
      const safeHtml=(ok,message)=>{res.writeHead(ok?200:400,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'",'Referrer-Policy':'no-referrer'});res.end(`<!doctype html><title>Meridian · ChatGPT connection</title><body style="font:18px system-ui;background:#f6f8f1;color:#29432b;padding:70px;max-width:650px"><h1>${ok?'You’re connected.':'Connection needs attention.'}</h1><p>${message}</p><a href="${origin}" style="color:#29432b">Return to Meridian</a></body>`);};
      try {
        if(req.method!=='GET'||req.headers.host!==new URL(transaction?.redirectUri || 'http://127.0.0.1').host) {res.writeHead(404);res.end();return;}
        const url=new URL(req.url,transaction.redirectUri);
        if(url.pathname!=='/auth/callback') {res.writeHead(404);res.end();return;}
        const {clientId,code}=validateCallback(url,transaction);
        // Consume before exchange. No replay or racing callback can reuse the code.
        stopLogin();
        const tokens=await fetchJson(`${ISSUER}/api/accounts/oauth/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code,code_verifier:transaction.verifier,redirect_uri:transaction.redirectUri,resource:RESOURCE})});
        const {payload}=await jwtVerify(tokens.id_token,jwks,{issuer:ISSUER,audience:clientId,requiredClaims:['sub','exp','iat'],clockTolerance:5});
        if(payload.nonce!==transaction.nonce || typeof payload.sub!=='string'||!payload.sub) throw new Error('ChatGPT identity could not be verified.');
        if(profile && profile.subject!==payload.sub) throw new Error('This sign-in belongs to another account. Add it as a new connection.');
        if(typeof tokens.access_token!=='string'||!Number.isFinite(tokens.expires_in)) throw new Error('ChatGPT returned an incomplete connection.');
        const id=accountKey(payload.sub,clientId);
        const saved={id,clientId,subject:payload.sub,email:typeof payload.email==='string'?payload.email:'ChatGPT account'};
        storage.credentials[id]={...saved,accessToken:tokens.access_token,refreshToken:tokens.refresh_token,idToken:tokens.id_token,expiresAt:Date.now()+tokens.expires_in*1000,scopes:typeof tokens.scope==='string'?tokens.scope.split(' '):[]};
        storage.settings.profiles=storage.settings.profiles.filter(p=>p.id!==id).concat(saved);storage.settings.active=id;
        try {await storage.save();} catch(e) {delete storage.credentials[id];storage.settings.active=null;throw e;}
        modelCache=null;
        safeHtml(true,planEnabled(storage.credentials[id])?'Your ChatGPT plan is connected to Meridian. Return to the Research chat to send your first message.':'You are signed in, but ChatGPT plan usage was not granted. Review Meridian access in ChatGPT settings before sending a message.');
      } catch {
        stopLogin();authError='Sign-in could not be completed. Please try again from Meridian. If access was declined, review your ChatGPT plan settings.';
        // Do not render provider errors, codes, or tokens in the callback page.
        safeHtml(false,authError);
      }
    });
    await new Promise((resolve,reject)=>{callbackServer.once('error',reject);callbackServer.listen(0,'127.0.0.1',resolve);});
    const redirectUri=`http://127.0.0.1:${callbackServer.address().port}/auth/callback`;
    const {transaction,url}=makeAuthorization({hostId:storage.settings.hostId,redirectUri,profile});
    const timer=setTimeout(()=>{authError='Sign-in expired. Click Continue with ChatGPT to try again.';stopLogin();},600000);timer.unref();
    pending={transaction,server:callbackServer,timer};return {url};
  }

  async function middleware(req,res,next) {
    if(!req.url?.startsWith('/__meridian/chat/')) return next();
    if(!allowLocalRequest(req)) return json(res,403,{error:'Local, same-origin access is required.'});
    try {
      const storage=await store();
      const url=new URL(req.url,`http://${req.headers.host}`), path=url.pathname.slice('/__meridian/chat/'.length);
      const profile=storage.credentials[storage.settings.active];
      if(req.method==='GET'&&path==='status') return json(res,200,{available:true,connected:!!profile?.accessToken,planEnabled:planEnabled(profile),sessionOnly:storage.sessionOnly,account:storage.settings.profiles.find(p=>p.id===storage.settings.active) || null,profiles:storage.settings.profiles.map(({id,email})=>({id,email})),pending:!!pending,error:authError});
      if(req.method==='GET'&&path==='models') return json(res,200,{models:await models(profile)});
      if(req.method==='GET'&&path==='history') {
        const id=url.searchParams.get('reportId');if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id || '')) return json(res,400,{error:'Invalid report.'});
        return json(res,200,{messages:profile?await storage.history(profile.id,id):[]});
      }
      if(req.method!=='POST') return json(res,404,{error:'Chat route not found.'});
      const input=await bodyJson(req);
      if(path==='login') {
        if(activeTurn || refreshing) return json(res,409,{error:'Wait for the current response to finish before connecting another account.'});
        const selected=input.profileId?storage.settings.profiles.find(p=>p.id===input.profileId):undefined;
        if(input.profileId&&!selected) return json(res,400,{error:'Unknown connection.'});
        return json(res,200,await signIn(selected,`http://${req.headers.host}`));
      }
      if(path==='cancel-login') {stopLogin();authError='';return json(res,200,{ok:true});}
      if(path==='logout') {
        if(activeTurn || refreshing) return json(res,409,{error:'Stop the current response before disconnecting.'});
        stopLogin();let revoked=!profile?.refreshToken;
        if(profile?.refreshToken) {
          try {
            const discovery=await fetchJson(`${ISSUER}/.well-known/openid-configuration`);
            const endpoint=new URL(discovery.revocation_endpoint);if(endpoint.origin!==ISSUER) throw new Error('Invalid revocation endpoint.');
            for(let attempt=0;attempt<2&&!revoked;attempt++) {
              const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:profile.refreshToken,token_type_hint:'refresh_token',client_id:profile.clientId}),signal:AbortSignal.timeout(10000)});
              revoked=r.status===200;if(!revoked&&r.status<500) break;
              if(!revoked) await new Promise(resolve=>setTimeout(resolve,500));
            }
          } catch {}
        }
        delete storage.credentials[storage.settings.active];storage.settings.active=null;await storage.save();modelCache=null;
        return json(res,200,{message:revoked?'Disconnected from ChatGPT.':'Disconnected locally. Remote revocation was not confirmed; disconnect Meridian in ChatGPT Settings.'});
      }
      if(path!=='send') return json(res,404,{error:'Chat route not found.'});
      validateTurn(input);
      if(activeTurn) return json(res,409,{error:'Another response is in progress. Wait for it to finish.'});
      if(!planEnabled(profile)) return json(res,401,{error:'Connect your ChatGPT plan to send a message.'});
      activeTurn=true;
      const controller=new AbortController();controllers.add(controller);
      const timeout=setTimeout(()=>controller.abort(),900000);
      const disconnected=()=>{if(!res.writableEnded) controller.abort();};res.on('close',disconnected);
      let messages,user,assistant;
      try {
        const catalog=await models(profile);if(!catalog.some(m=>m.id===input.model)) throw new Error('Choose a model available to this ChatGPT account.');
        messages=await storage.history(profile.id,input.reportId);
        if(messages.reduce((sum,m)=>sum+m.text.length,0)>1200000) throw new Error('This conversation is full. Export it and start another report.');
        user=newMessage('user',input.text.trim());messages.push(user);
        await storage.saveHistory(profile.id,input.reportId,messages);
        const recent=messages.filter(m=>m.status==='completed').slice(-30);
        while(recent.length>1&&recent.reduce((n,m)=>n+m.text.length,0)>120000) recent.shift();
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});
        const emit=value=>{if(!res.destroyed) res.write(`data: ${JSON.stringify(value)}\n\n`);};
        assistant=newMessage('assistant','','interrupted');assistant.model=input.model;assistant.webSearch=!!input.webSearch;
        emit({type:'start',user,message:assistant});
        const upstream=await fetch(`${RESOURCE}/responses`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await access(profile)}`},body:JSON.stringify(responseRequest({...input,messages:recent})),signal:controller.signal});
        if(!upstream.ok){const data=await upstream.json().catch(()=>({}));throw new Error(providerError(data.error?.code,upstream.status));}
        let completed=false;
        for await(const event of streamEvents(upstream.body)) {
          if(event.type==='response.output_text.delta') {assistant.text+=event.delta;emit({type:'delta',text:event.delta});}
          if(event.type?.startsWith('response.web_search_call.')) emit({type:'progress',text:event.type.endsWith('.completed')?'Reading the evidence…':'Searching the web…'});
          if(event.type==='response.completed') {assistant.text=answerText(event.response)||assistant.text;assistant.status='completed';completed=true;break;}
          if(['response.failed','error','response.incomplete'].includes(event.type)) throw new Error(providerError(event.response?.error?.code || event.code));
          if(assistant.text.length>700000) throw new Error('The response reached the report size limit. Ask for one chapter at a time.');
        }
        if(!completed) throw new Error('The connection ended before ChatGPT finished. The partial answer is saved as interrupted.');
        messages.push(assistant);await storage.saveHistory(profile.id,input.reportId,messages);
        emit({type:'done',message:assistant});res.end();
      } catch(e) {
        const message=controller.signal.aborted?'Response stopped. Any partial answer is saved as interrupted.':e.message;
        if(assistant && !messages.some(m=>m.id===assistant.id)) {assistant.status='interrupted';messages.push(assistant);await storage.saveHistory(profile.id,input.reportId,messages).catch(()=>{});}
        if(!res.headersSent) json(res,400,{error:message});
        else if(!res.destroyed) {res.write(`data: ${JSON.stringify({type:'error',message})}\n\n`);res.end();}
      } finally {clearTimeout(timeout);controllers.delete(controller);activeTurn=false;res.off('close',disconnected);}
    } catch(e) {if(!res.headersSent) json(res,400,{error:e.message || 'Meridian chat is unavailable.'});else res.end();}
  }
  return {name:'meridian-local-chat',apply:'serve',configureServer(server) {
    server.middlewares.use(middleware);
    server.httpServer?.once('close',()=>{stopLogin();for(const c of controllers)c.abort();});
  }};
}
