import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {allowLocalRequest,makeAuthorization,validateCallback,planEnabled,answerText,streamEvents,validateTurn,responseRequest,providerError,signInError} from '../scripts/chat-core.mjs';
import {localStore} from '../scripts/chat-storage.mjs';

const local={method:'POST',socket:{remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:5173',origin:'http://127.0.0.1:5173','x-meridian-chat':'1'}};
test('local chat rejects remote clients, cross-origin posts, DNS rebinding and missing headers',()=>{
 assert.equal(allowLocalRequest(local),true);
 for(const request of [
  {...local,socket:{remoteAddress:'192.168.1.7'}},
  {...local,headers:{...local.headers,origin:'https://evil.example'}},
  {...local,headers:{...local.headers,host:'evil.example:5173'}},
  {...local,headers:{...local.headers,'x-meridian-chat':undefined}},
  {...local,headers:{...local.headers,'sec-fetch-site':'cross-site'}},
 ])assert.equal(allowLocalRequest(request),false);
});
test('OAuth uses unique state, nonce, PKCE and stable host identity',()=>{
 const args={hostId:'urn:uuid:1234',redirectUri:'http://127.0.0.1:1455/auth/callback'};
 const one=makeAuthorization(args),two=makeAuthorization(args),url=new URL(one.url);
 assert.notEqual(one.transaction.state,two.transaction.state);assert.notEqual(one.transaction.nonce,two.transaction.nonce);
 assert.equal(url.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(url.searchParams.get('agent_name_hint'),'Meridian');
 assert.equal(url.searchParams.get('ext_agent_host_id'),args.hostId);assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 const returning=new URL(makeAuthorization({...args,profile:{id:'a',clientId:'oaiapp_saved',idToken:'never-return-to-browser'}}).url);
 assert.equal(returning.searchParams.get('client_id'),'oaiapp_saved');assert.equal(returning.searchParams.has('agent_name_hint'),false);assert.equal(returning.searchParams.has('id_token_hint'),false);
});
test('OAuth rejects wrong state, expired transaction, denied consent, missing or changed client',()=>{
 const {transaction}=makeAuthorization({hostId:'test',redirectUri:'http://127.0.0.1:1455/auth/callback'});
 const callback=new URL(`http://127.0.0.1:1455/auth/callback?state=${transaction.state}&code=code&client_id=oaiapp_new`);
 assert.deepEqual(validateCallback(callback,transaction),{clientId:'oaiapp_new',code:'code'});
 assert.throws(()=>validateCallback(callback,{...transaction,state:'wrong'}));
 assert.throws(()=>validateCallback(callback,{...transaction,expiresAt:0}));
 assert.throws(()=>validateCallback(callback,{...transaction,clientId:'different'}));
 callback.searchParams.set('error','access_denied');assert.throws(()=>validateCallback(callback,transaction));callback.searchParams.delete('error');
 callback.searchParams.delete('client_id');assert.throws(()=>validateCallback(callback,transaction));
});
test('identity alone does not authorize plan usage',()=>{
 assert.equal(planEnabled({accessToken:'token',scopes:['openid']}),false);
 assert.equal(planEnabled({accessToken:'token',scopes:['chatgpt.tokens.use.direct','resource.invoke']}),true);
});

test('sign-in errors identify recovery steps without leaking provider payloads',()=>{
 const secret='SYNTHETIC_PRIVATE_TOKEN';
 for(const stage of ['callback','exchange','identity','response','storage']) assert.ok(!signInError({message:secret,providerCode:secret},stage).includes(secret));
 assert.match(signInError({cause:{code:'EACCES'}},'exchange'),/network permission/);
 assert.match(signInError({providerCode:'invalid_grant'},'exchange'),/expired or was already used/);
 assert.match(signInError({status:503},'exchange'),/temporarily/);
 assert.match(signInError({name:'TimeoutError'},'identity'),/could not reach/);
});
test('provider request uses subscription-compatible streaming and does not include API keys',()=>{
 const body=responseRequest({model:'test-model',context:'SUI brief',messages:[{role:'user',text:'Question',status:'completed'},{role:'assistant',text:'unfinished',status:'interrupted'}],webSearch:true});
 assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(body.input.length,1);
 assert.deepEqual(body.tools,[{type:'web_search'}]);assert.equal('previous_response_id' in body,false);assert.equal('background' in body,false);assert.equal('max_output_tokens' in body,false);
 assert.equal('tools' in responseRequest({model:'test',context:'',messages:[],webSearch:false}),false);
});
test('citations are linked, unsafe URL annotations excluded, uncited tail preserved',()=>{
 const text=answerText({output:[{type:'message',content:[{type:'output_text',text:'Claim [1]. Tail.',annotations:[{type:'url_citation',start_index:6,end_index:9,url:'https://example.com/evidence',title:'Original'},{type:'url_citation',url:'javascript:alert(1)',title:'Bad'}]}]}]});
 assert.equal(text,'Claim [Original](https://example.com/evidence). Tail.');
});
test('SSE parser handles fragmented UTF-8 and CRLF frames',async()=>{
 const encoded=new TextEncoder().encode('data: {"type":"delta","text":"Sui →"}\r\n\r\ndata: {"type":"done"}\n\n');
 async function* chunks(){for(let i=0;i<encoded.length;i+=3)yield encoded.slice(i,i+3);}
 const events=[];for await(const e of streamEvents(chunks()))events.push(e);
 assert.deepEqual(events,[{type:'delta',text:'Sui →'},{type:'done'}]);
});
test('chat turn validation refuses path traversal and oversized prompts',()=>{
 const good={reportId:'report-1',text:'Research SUI',context:'brief',model:'test'};assert.equal(validateTurn(good),good);
 assert.throws(()=>validateTurn({...good,reportId:'../../secrets'}));assert.throws(()=>validateTurn({...good,text:'x'.repeat(16001)}));assert.throws(()=>validateTurn({...good,context:'x'.repeat(180001)}));
 assert.match(providerError('subscription_sharing_usage_limit_exceeded'),/No API fallback/);
});
test('local storage encrypts credentials or keeps them only in memory; histories stay account-scoped',async()=>{
 const root=await mkdtemp(join(tmpdir(),'meridian-chat-test-'));
 try{
  const first=await localStore(root);first.credentials.example={accessToken:'SYNTHETIC_TEST_TOKEN'};first.settings.active='example';await first.save();
  await first.saveHistory('one','report',[{text:'private test note'}]);
  const second=await localStore(root);assert.equal(second.settings.hostId,first.settings.hostId);
  if(first.sessionOnly) {assert.equal(first.credentials.example.accessToken,'SYNTHETIC_TEST_TOKEN');assert.equal(second.credentials.example,undefined);}
  else assert.equal(second.credentials.example.accessToken,'SYNTHETIC_TEST_TOKEN');
  assert.deepEqual(await second.history('two','report'),[]);assert.equal((await second.history('one','report'))[0].text,'private test note');
  if(process.platform==='win32')assert.equal((await readFile(join(root,'credentials.json'),'utf8').catch(()=>'' )).includes('SYNTHETIC_TEST_TOKEN'),false);
 }finally{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'meridian-chat-test-'));await rm(root,{recursive:true,force:true});}
});
