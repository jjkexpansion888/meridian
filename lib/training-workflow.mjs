import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex');
const normalized=text=>String(text).toLowerCase().replace(/\s+/g,' ').trim();
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const secret=/(?:sk-(?:proj-|live-)?[a-zA-Z0-9_-]{16,}|-----BEGIN [^-]*PRIVATE KEY-----|Bearer\s+[a-zA-Z0-9._-]{25,})/i;
const rights=new Set(['original','CC0-1.0','CC-BY-4.0','licensed']);
export function prepareTraining(rows,{validationAfter,testAfter,minTrain=50,minValidation=5,minTest=5}){
 if(!date(validationAfter)||!date(testAfter)||validationAfter>=testAfter)throw new Error('Provide ordered validation/test cutoff dates.');
 if(!Array.isArray(rows)||rows.length>10000)throw new Error('Supply at most 10,000 example records.');
 const rejected=[],accepted=[],ids=new Set();
 for(let index=0;index<rows.length;index++){
  const row=rows[index],reason=(()=>{
   if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id))return 'Missing or duplicate example ID.';
   ids.add(row.id);
   if(!date(row.asOf)||typeof row.entityGroup!=='string'||!row.entityGroup.trim()||!['equity','crypto','private'].includes(row.assetType))return 'Missing valid date, asset type or entity group.';
   if(!row.rights||row.rights.trainingAllowed!==true||!rights.has(row.rights.basis)||typeof row.rights.evidence!=='string'||row.rights.evidence.length<10)return 'Training rights need an explicit permitted basis and evidence; public accessibility is insufficient.';
   if(row.rights.basis==='CC-BY-4.0'&&!row.rights.attribution)return 'CC-BY attribution is required.';
   if(row.review?.approved!==true||row.review?.independent!==true||!row.review?.reviewer||!date(row.review?.reviewedAt))return 'Independent human approval is required; model self-review is insufficient.';
   if(!Array.isArray(row.review?.checks)||!['source-fidelity','arithmetic','opposing-case','uncertainty'].every(c=>row.review.checks.includes(c)))return 'The required diligence review checks are incomplete.';
   if(row.benchmarkIds?.length||row.purpose==='evaluation')return 'Held-out benchmark/evaluation material is never admitted to training.';
   if(!Array.isArray(row.sources)||!row.sources.length||row.sources.some(s=>!s.documentGroup||!date(s.availableAt)||s.availableAt>row.asOf))return 'Source provenance must be grouped and available as of the example date.';
   if(typeof row.prompt!=='string'||row.prompt.length<20||typeof row.answer!=='string'||row.answer.length<100||row.prompt.length+row.answer.length>100000)return 'Prompt/answer is missing, too short or too large.';
   if(secret.test(JSON.stringify(row)))return 'Potential credential material detected; remove it before export.';
   return '';
  })();
  if(reason){rejected.push({index,id:typeof row?.id==='string'&&!secret.test(row.id)&&row.id.length<=120?row.id:'redacted-or-invalid',reason});continue;}
  accepted.push({...row,fingerprint:hash(normalized(row.prompt)+'\n'+normalized(row.answer))});
 }
 // Connected components keep an issuer, source document or identical example out of multiple splits.
 const parent=accepted.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
 const groups=new Map();accepted.forEach((row,index)=>{const keys=['entity:'+normalized(row.entityGroup),'content:'+row.fingerprint,...row.sources.map(s=>'document:'+normalized(s.documentGroup))];for(const key of keys){if(groups.has(key))parent[find(index)]=find(groups.get(key));else groups.set(key,index);}});
 const bucket=d=>d>=testAfter?'test':d>=validationAfter?'validation':'train';
 const newest=new Map();accepted.forEach((row,index)=>{const group=find(index);newest.set(group,[newest.get(group)||'',row.asOf].sort().at(-1));});
 const datasets={train:[],validation:[],test:[]},excluded=[],seen=new Set();
 for(let index=0;index<accepted.length;index++){
  const row=accepted[index],split=bucket(newest.get(find(index)));
  if(bucket(row.asOf)!==split){excluded.push({id:row.id,reason:'Earlier record withheld because its issuer/source group belongs to a later split.'});continue;}
  if(seen.has(row.fingerprint)){excluded.push({id:row.id,reason:'Duplicate prompt/answer.'});continue;}seen.add(row.fingerprint);
  datasets[split].push(row);
 }
 const jsonl=Object.fromEntries(Object.entries(datasets).map(([split,examples])=>[split,examples.map(row=>JSON.stringify({messages:[{role:'system',content:'Produce evidence-grounded investment diligence. Preserve accounting conventions, source caveats, opposing evidence and uncertainty. Never fabricate unavailable facts.'},{role:'user',content:row.prompt},{role:'assistant',content:row.answer}]})).join('\n')+(examples.length?'\n':'')]));
 const manifest={version:'2026.10',createdAt:new Date().toISOString(),weightsTrained:false,uploadsPerformed:false,cutoffs:{validationAfter,testAfter},counts:Object.fromEntries(Object.entries(datasets).map(([key,values])=>[key,values.length])),minimums:{train:minTrain,validation:minValidation,test:minTest},readyForTrainingReview:datasets.train.length>=minTrain&&datasets.validation.length>=minValidation&&datasets.test.length>=minTest,rejected,excluded,files:Object.fromEntries(Object.entries(jsonl).map(([key,value])=>[key,{sha256:hash(value)}])),examples:Object.entries(datasets).flatMap(([split,values])=>values.map(r=>({id:r.id,split,entityGroup:r.entityGroup,asOf:r.asOf,fingerprint:r.fingerprint,rights:r.rights,sources:r.sources,review:r.review}))),limitations:['Human approval declarations are provided by the dataset owner; this tool cannot authenticate reviewers.','Exact duplicates and shared entity/document groups are isolated. Semantic near-duplicate review is still required.','These exports do not measure model skill or certify investment performance.']};
 return {jsonl,manifest};
}

export function scorePredictions(cases,predictions){
 const byId=new Map();for(const prediction of predictions){if(byId.has(prediction.id))throw new Error('Duplicate prediction ID.');byId.set(prediction.id,prediction);}
 const results=cases.map(item=>{
  const p=byId.get(item.id),answerCorrect=!!p&&(typeof item.expected.answer==='number'?typeof p.answer==='number'&&Number.isFinite(p.answer)&&Math.abs(p.answer-item.expected.answer)<=item.expected.tolerance:p.answer===item.expected.answer);
  const abstentionCorrect=!!p&&p.abstain===item.expected.abstain;
  const sourceCorrect=!!p&&Array.isArray(p.usedSourceIds)&&item.expected.requiredSources.every(s=>p.usedSourceIds.includes(s))&&p.usedSourceIds.every(s=>item.allowedSourceIds.includes(s));
  const unitCorrect=!!p&&p.unit===item.expected.unit;
  return {id:item.id,dimension:item.dimension,missing:!p,answerCorrect,abstentionCorrect,sourceCorrect,unitCorrect,passed:answerCorrect&&abstentionCorrect&&sourceCorrect&&unitCorrect};
 });
 return {suite:'Meridian original diagnostic fixtures; not a published benchmark',cases:cases.length,submitted:predictions.length,unknownPredictionIds:predictions.filter(p=>!cases.some(c=>c.id===p.id)).map(p=>p.id),passed:results.filter(r=>r.passed).length,strictPassRate:cases.length?results.filter(r=>r.passed).length/cases.length:null,results,limitations:'Small synthetic diagnostic suite. Passing is not evidence of institutional investment skill, live research quality or alpha.'};
}
