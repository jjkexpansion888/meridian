import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {meridianChat} from '../scripts/chat-plugin.mjs';

test('local chat streams, persists by account/report, marks provider failures, and never calls API-key billing',async()=>{
 const history=new Map(),requests=[];let handler,mode='success';
 const profile={id:'account1',accessToken:'synthetic-oauth-token',expiresAt:Date.now()+600000,scopes:['chatgpt.tokens.use.direct','resource.invoke']};
 const storage={credentials:{account1:profile},settings:{active:'account1',profiles:[{id:'account1',email:'test@example.invalid'}]},save:async()=>{},history:async(a,r)=>structuredClone(history.get(a+'/'+r)||[]),saveHistory:async(a,r,m)=>history.set(a+'/'+r,structuredClone(m))};
 const server=createServer((req,res)=>handler(req,res,()=>{res.writeHead(404);res.end();}));
 meridianChat({storage}).configureServer({middlewares:{use(fn){handler=fn;}},httpServer:server});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const nativeFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  requests.push({url,options});assert.equal(options.headers.Authorization,'Bearer synthetic-oauth-token');
  if(url.endsWith('/models'))return Response.json({models:[{slug:'model-test',display_name:'Test model',visibility:'list'}]});
  assert.equal(url,'https://api.openai.com/v1/responses');
  const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(body.model,'model-test');
  const events=mode==='success'?[{type:'response.output_text.delta',delta:'Sui analysis'},{type:'response.completed',response:{output:[{type:'message',content:[{type:'output_text',text:'## Token economics & value accrual\n\nSui analysis with a [primary source](https://www.sui.io/).',annotations:[]}]}]}}]:[{type:'response.output_text.delta',delta:'Partial answer'},{type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}];
  return new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
 };
 try{
  const headers={'X-Meridian-Chat':'1','Content-Type':'application/json',Origin:origin};
  const body={reportId:'sui-report',text:'Research SUI',context:'Sui network brief',model:'model-test',webSearch:true};
  const blocked=await nativeFetch(origin+'/__meridian/chat/send',{method:'POST',headers:{...headers,Origin:'https://evil.invalid'},body:JSON.stringify(body)});assert.equal(blocked.status,403);assert.equal(requests.length,0);
  const first=await nativeFetch(origin+'/__meridian/chat/send',{method:'POST',headers,body:JSON.stringify(body)});
  const stream=await first.text();assert.match(stream,/"type":"done"/);assert.match(stream,/primary source/);
  assert.equal(history.get('account1/sui-report').length,2);assert.equal(history.get('account1/sui-report')[1].status,'completed');
  mode='failure';const second=await nativeFetch(origin+'/__meridian/chat/send',{method:'POST',headers,body:JSON.stringify({...body,text:'Follow up'})});
  const failed=await second.text();assert.match(failed,/No API fallback/);assert.doesNotMatch(failed,/"type":"done"/);
  assert.equal(history.get('account1/sui-report').at(-1).status,'interrupted');assert.equal(history.get('account1/sui-report').at(-1).text,'Partial answer');
  const third=await nativeFetch(origin+'/__meridian/chat/history?reportId=other-report',{headers});assert.deepEqual((await third.json()).messages,[]);
  storage.settings.active='account2';storage.credentials.account2={...profile,id:'account2'};
  const otherAccount=await nativeFetch(origin+'/__meridian/chat/history?reportId=sui-report',{headers});assert.deepEqual((await otherAccount.json()).messages,[]);
 }finally{globalThis.fetch=nativeFetch;await new Promise(resolve=>server.close(resolve));}
});
