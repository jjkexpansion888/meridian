// Loopback-only integration: creates and deletes its own synthetic fixture, never calls a model.
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Use loopback only.');
const login=await fetch(`${base}/signin-with-chatgpt?return_to=/`,{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');assert.ok(cookie);
const request=async(path,method='GET',data)=>{const r=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json()};};
const created=await request('/api/reports','POST',{name:'Disposable structured research fixture',symbol:'TEST',researchMode:'manual',type:'equity',depth:'deep',asOf:'2026-10-19'});assert.equal(created.status,201);const id=created.data.id;
try{
 const coverage=['identity','business','competition','financial-quality','governance','qualitative','valuation','risks','opposing-case','monitoring'];
 const plan={rationale:'An original synthetic plan for integration verification; no provider is used.',summaryTitle:'Consolidated investment judgment',sections:Array.from({length:6},(_,i)=>({id:`test-${i}`,title:`Synthetic question ${i+1}`,brief:'Use original source evidence to test this investment question and expose the consequences of missing information.',coverage:i===0?coverage:['business']}))};
 assert.equal((await request(`/api/reports/${id}`,'POST',{action:'plan',plan:{...plan,sections:[]}})).status,400);
 const planned=await request(`/api/reports/${id}`,'POST',{action:'plan',plan});assert.equal(planned.status,200);assert.equal(planned.data.chapters.length,7);
 const first=planned.data.chapters[0],text=`## ${first.title}\n\n${'Synthetic source-informed statement with an unresolved limitation. '.repeat(30)}`;
 const research={version:'2026.10',chapterId:first.id,asOf:'2026-10-19',model:'synthetic-test',dossier:{sources:[],claims:[],metrics:[],calculations:[],gaps:['No real evidence in this synthetic fixture.']},review:{verdict:'pass',findings:[],sourceChecks:[],opposingCase:'No real investment judgment can be made.',decisionSensitivity:'Obtain actual dated financial records.'},revisionCount:0,outcome:'reviewed',flags:[]};
 assert.equal((await request(`/api/reports/${id}`,'POST',{action:'import',text,research:{...research,chapterId:'absent'}})).status,400);
 const saved=await request(`/api/reports/${id}`,'POST',{action:'import',text,research});assert.equal(saved.status,200);assert.equal(saved.data.chapters[0].research.outcome,'needs-review');assert.equal(saved.data.status,'draft');
 assert.equal((await request(`/api/reports/${id}`,'POST',{action:'plan',plan})).status,409);
 const replaced=await request(`/api/reports/${id}`,'POST',{action:'import',text:text+' Updated manually.'});assert.equal(replaced.status,200);assert.equal(replaced.data.chapters[0].research,undefined);
 await request(`/api/reports/${id}`,'POST',{action:'notes',value:'Synthetic saved notes.'});
 for(const chapter of planned.data.chapters.slice(1)){assert.equal((await request(`/api/reports/${id}`,'POST',{action:'import',text:`## ${chapter.title}\n\n${'Synthetic section content with source limitations. '.repeat(30)}`})).status,200);}
 assert.equal((await request(`/api/reports/${id}`)).data.status,'completed');
 assert.equal((await fetch(`${base}/api/reports/${id}`,{method:'DELETE',headers:{Origin:base}})).status,401);
 const crossOrigin=await fetch(`${base}/api/reports/${id}`,{method:'DELETE',headers:{Cookie:cookie,Origin:'https://unrelated.example'}});assert.equal(crossOrigin.status,403);
}finally{assert.equal((await request(`/api/reports/${id}`,'DELETE')).status,200);assert.equal((await request(`/api/reports/${id}`)).status,404);}
console.log('Adaptive plan, review persistence, derived-check validation, full completion and owner-scoped deletion passed. No model calls.');
