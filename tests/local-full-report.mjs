// Run npm test first. Uses only synthetic research and deletes its own local fixture.
import assert from 'node:assert/strict';
import {runFullReport} from '../.sites-runtime/tests/lib/full-report.js';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Loopback development only.');
const login=await fetch(`${base}/signin-with-chatgpt?return_to=/`,{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
assert.ok(cookie);
async function request(path,method='GET',body){const response=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
const id=crypto.randomUUID(),input={id,name:'Disposable full-report verification',symbol:'TEST',type:'crypto',depth:'deep',researchMode:'manual',asOf:'2026-10-19'};
assert.equal((await request('/api/reports','POST',{...input,id:'../invalid'})).status,400);
const created=await request('/api/reports','POST',input);assert.equal(created.status,201);assert.equal(created.data.id,id);
try{
 let report=created.data,calls=0;
 const previous='Existing reviewed identity. '.repeat(70);
 await request(`/api/reports/${id}`,'POST',{action:'import',text:`## ${report.chapters[0].title}\n\n${previous}`});
 report=(await request(`/api/reports/${id}`)).data;
 const result=await runFullReport({report,signal:new AbortController().signal,shouldPause:()=>false,onProgress:()=>{},generate:async(prompt,context)=>{
  calls++;const chapter=report.chapters[calls];assert.ok(prompt.includes(`## ${chapter.title}`));assert.ok(context.includes('Existing reviewed identity.'));
  return {id:chapter.id,role:'assistant',status:'completed',createdAt:new Date().toISOString(),text:`## ${chapter.title}\n\n${'Synthetic test evidence, no investment assertions. '.repeat(40)}\n[Video fixture](https://www.youtube.com/watch?v=fixture) [Social fixture](https://x.com/example/status/123)`};
 },save:async text=>{const saved=await request(`/api/reports/${id}`,'POST',{action:'import',text});assert.equal(saved.status,200);}});
 const persisted=(await request(`/api/reports/${id}`)).data;
 assert.equal(calls,15);assert.equal(result.status,'completed');assert.equal(persisted.status,'completed');assert.equal(persisted.chapters[0].body,previous.trim());
 assert.ok(persisted.chapters.every(c=>c.status==='completed'&&c.body));assert.equal(persisted.chapters.at(-1).id,'memo');assert.equal(persisted.chapters[4].sources.length,2);assert.ok(persisted.chapters[4].sources.every(s=>s.imported));
 console.log('PASS: full crypto report persists all 16 chapters, preserves existing work and YouTube/social links; no provider calls.');
}finally{assert.equal((await request(`/api/reports/${id}`,'DELETE')).status,200);console.log('PASS: disposable report removed.');}
