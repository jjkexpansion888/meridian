// Runs only against loopback development. Creates and deletes its own fixture.
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Local API tests require loopback.');
const anonymous=await fetch(`${base}/api/reports`);assert.equal(anonymous.status,401);
const login=await fetch(`${base}/signin-with-chatgpt?return_to=/`,{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
assert.ok(cookie,'mock sign-in cookie');
const request=async(path,method='GET',data,origin=base)=>{const r=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const raw=await r.text();let parsed;try{parsed=JSON.parse(raw);}catch{parsed={error:raw};}return {status:r.status,data:parsed};};
assert.equal((await request('/api/status')).data.authenticated,true);
assert.equal((await request('/api/reports','POST',{name:'x'})).status,400);
const input={name:'Disposable local API fixture',symbol:'TEST',researchMode:'api',type:'private',depth:'deep',asOf:'2026-10-19',focus:'test only'};
assert.equal((await request('/api/reports','POST',input,'https://unrelated.example')).status,403);
assert.equal((await request('/api/reports','POST',{...input,asOf:'2999-01-01'})).status,400);
const created=await request('/api/reports','POST',input);assert.equal(created.status,201);const id=created.data.id;
try{
 assert.equal(created.data.chapters.length,16);
 const notes=await request(`/api/reports/${id}`,'POST',{action:'notes',value:'Persisted local test note'});assert.equal(notes.status,200);
 const star=await request(`/api/reports/${id}`,'POST',{action:'star',value:true});assert.equal(star.status,200);
 const saved=await request(`/api/reports/${id}`);assert.equal(saved.data.notes,'Persisted local test note');assert.equal(saved.data.starred,true);
 assert.equal((await fetch(`${base}/api/reports/${id}`)).status,401);
 assert.equal((await fetch(`${base}/api/reports/${id}`,{headers:{'oai-authenticated-user-id':'other-test-owner','oai-authenticated-user-email':'other@example.test'}})).status,401);
 assert.equal((await request('/api/reports/nonexistent')).status,404);
 const config=(await request('/api/status')).data;
 if(!config.configured){const failed=await request(`/api/reports/${id}`,'POST',{action:'advance'});assert.equal(failed.data.status,'failed');assert.match(failed.data.chapters[0].error,/API key/);await request(`/api/reports/${id}`,'POST',{action:'resume'});await request(`/api/reports/${id}`,'POST',{action:'pause'});assert.equal((await request(`/api/reports/${id}`)).data.status,'paused');}
 await request(`/api/reports/${id}`,'POST',{action:'mode',value:'manual'});
 assert.equal((await request(`/api/reports/${id}`,'POST',{action:'advance'})).status,409);
 assert.equal((await request(`/api/reports/${id}`,'POST',{action:'resume'})).status,409);
 const imported=await request(`/api/reports/${id}`,'POST',{action:'import',text:'## Financial statements & earnings quality\n\nA sufficiently detailed test of a report import. This source is supplied by the user and has not been independently fetched or verified. [Test source](https://example.com/report).'});
 assert.equal(imported.status,200);assert.equal(imported.data.researchMode,'manual');assert.equal(imported.data.chapters.find(c=>c.id==='financials').sources[0].imported,true);assert.equal(imported.data.importResult.matched,1);
 console.log('PASS: no-API mode blocks paid calls and imports chapter text plus source links.');
 console.log('PASS: authentication, origin enforcement, input validation, persistence, notes, watchlist, missing-key failure, pause/resume and spoofed-identity rejection.');
}finally{const removed=await request(`/api/reports/${id}`,'DELETE');assert.equal(removed.status,200);assert.equal((await request(`/api/reports/${id}`)).status,404);console.log('PASS: fixture deletion.');}


