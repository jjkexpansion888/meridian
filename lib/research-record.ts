import {z} from 'zod';
import type {Report} from './types';
import {financialModelsSchema,computeFinancialModels,type FinancialResult} from './financial-reasoning';

const text=z.string().trim().min(1).max(2000);
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Use an actual calendar date');
const url=z.string().url().max(2000).refine(v=>/^https?:\/\//i.test(v),'Use HTTP(S) source links');
export const dossierSchema=z.object({
 sources:z.array(z.object({id,title:text,url,author:text,publishedAt:date.nullable(),kind:z.enum(['filing','official','independent','youtube','social']),access:z.enum(['full-text','transcript','excerpt','unavailable']),limitation:z.string().max(1500)})).max(30),
 claims:z.array(z.object({id,statement:text,kind:z.enum(['reported','assertion','inference','assumption','gap']),material:z.boolean(),sourceIds:z.array(id).max(8),caveat:z.string().max(2000),counterEvidence:z.string().max(2000),decisionImpact:text})).max(24),
 metrics:z.array(z.object({id,label:text,entity:text,period:date,unit:text,currency:z.string().max(12).nullable(),scale:z.union([z.literal(1),z.literal(1000),z.literal(1000000),z.literal(1000000000)]),value:z.number().finite().nullable(),basis:z.enum(['reported','estimate','assumption']),sourceIds:z.array(id).max(8)})).max(40),
 calculations:z.array(z.object({id,label:text,operation:z.enum(['add','subtract','divide','growthPct','marginPct','rollForward']),inputIds:z.array(id).min(2).max(40),expected:z.number().finite().nullable()})).max(20),
 gaps:z.array(text).max(20),
 financialModels:financialModelsSchema.optional(),
}).strict();
export type Dossier=z.infer<typeof dossierSchema>;
export const reviewSchema=z.object({
 verdict:z.enum(['pass','revise','insufficient']),
 findings:z.array(z.object({severity:z.enum(['material','minor']),issue:text,fix:text})).max(20),
 sourceChecks:z.array(z.object({claimId:id,sourceId:id,result:z.enum(['supports','contradicts','unavailable','not-checked']),explanation:text})).max(24),
 opposingCase:text,decisionSensitivity:text,
}).strict();
export type ResearchReview=z.infer<typeof reviewSchema>;
export type ResearchFlag={severity:'material'|'notice';code:string;message:string};
export type CalculationResult={id:string;label:string;value:number|null;unit:string;inputs:string[];status:'computed'|'mismatch'|'blocked';explanation:string};
export type ResearchRecord={version:'2026.10';chapterId:string;asOf:string;completedAt:string;model:string;dossier:Dossier;calculations:CalculationResult[];financialCalculations?:FinancialResult[];flags:ResearchFlag[];review:ResearchReview;revisionCount:number;outcome:'reviewed'|'needs-review'};

export function parseResearchJSON<T>(raw:string,schema:z.ZodType<T>):T{
 if(raw.length>160000)throw new Error('Research evidence exceeded its size limit.');
 const fenced=raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
 let value:unknown;try{value=JSON.parse(fenced||raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));}catch{throw new Error('The evidence or review response was not valid JSON. Saved chapters are safe.');}
 const parsed=schema.safeParse(value);if(!parsed.success)throw new Error(`Research structure needs correction: ${parsed.error.issues.slice(0,3).map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')}`);
 return parsed.data;
}

export function calculateEvidence(dossier:Dossier,asOf:string):CalculationResult[]{
 const metrics=new Map(dossier.metrics.map(m=>[m.id,m]));
 return dossier.calculations.map(check=>{
  const result:CalculationResult={id:check.id,label:check.label,value:null,unit:'',inputs:check.inputIds,status:'blocked',explanation:''};
  const inputs=check.inputIds.map(key=>metrics.get(key));
  if(inputs.some(m=>!m||m.value===null))return {...result,explanation:'A required input is missing; no value was imputed.'};
  const valid=inputs as Dossier['metrics'];
  if(valid.some(m=>m.period>asOf))return {...result,explanation:'An input period is later than the report as-of date.'};
  if(new Set(valid.map(m=>m.entity.toLowerCase().trim())).size!==1)return {...result,explanation:'Inputs describe different entities or economic exposures.'};
  if(new Set(valid.map(m=>m.currency).filter(Boolean)).size>1||(check.operation!=='divide'&&new Set(valid.map(m=>`${m.currency||''}|${m.unit.toLowerCase().trim()}`)).size!==1))return {...result,explanation:'Units or currencies differ. An explicit sourced conversion is required.'};
  if(!['growthPct','rollForward'].includes(check.operation)&&new Set(valid.map(m=>m.period)).size!==1)return {...result,explanation:'Inputs use different reporting dates.'};
  if(check.operation==='rollForward'&&(new Set(valid.slice(1).map(m=>m.period)).size!==1||valid[0].period>=valid[1].period))return {...result,explanation:'A roll-forward requires an opening balance first, then signed changes for one later closing period. The source must establish the complete interval.'};
  if(check.operation==='growthPct'&&(valid.length!==2||valid[0].period<=valid[1].period))return {...result,explanation:'Growth requires current and earlier comparable periods, in that order.'};
  if(valid.some(m=>m.sourceIds.some(key=>dossier.sources.find(s=>s.id===key)?.publishedAt&&dossier.sources.find(s=>s.id===key)!.publishedAt!>asOf)))return {...result,explanation:'An input cites evidence published after the as-of date.'};
  const values=valid.map(m=>m.value!*m.scale);let value:number;
  if(check.operation==='add'||check.operation==='rollForward')value=values.reduce((sum,v)=>sum+v,0);
  else if(check.operation==='subtract'&&values.length===2)value=values[0]-values[1];
  else if(['divide','marginPct','growthPct'].includes(check.operation)&&values.length===2){
   if(values[1]===0)return {...result,explanation:'Division by zero; the ratio is undefined.'};
   if(check.operation==='growthPct'&&values[1]<0)return {...result,explanation:'Percentage growth from a negative base is not a meaningful conventional growth rate.'};
   value=check.operation==='growthPct'?(values[0]/values[1]-1)*100:values[0]/values[1]*(check.operation==='marginPct'?100:1);
  }else return {...result,explanation:'This operation requires exactly two inputs.'};
  if(!Number.isFinite(value))return {...result,explanation:'The result is not finite.'};
  const unit=['growthPct','marginPct'].includes(check.operation)?'%':check.operation==='divide'?(valid[0].unit===valid[1].unit?'ratio':`${valid[0].currency||''} ${valid[0].unit}/${valid[1].unit}`.trim()):`${valid[0].currency||''} ${valid[0].unit} (base units)`.trim();
  const mismatch=check.expected!==null&&Math.abs(value-check.expected)>Math.max(1e-6,Math.abs(value)*1e-4);
  return {...result,value,unit,status:mismatch?'mismatch':'computed',explanation:`${mismatch?'The proposed result disagrees with recomputed arithmetic. ':'Arithmetic recomputed from supplied inputs. '}${valid.some(m=>m.basis!=='reported')?'Includes estimates/assumptions; this is not a reported fact. ':'Input accuracy still requires source review.'}`};
 });
}

export function auditEvidence(dossier:Dossier,asOf:string):ResearchFlag[]{
 const flags:ResearchFlag[]=[];
 const flag=(severity:ResearchFlag['severity'],code:string,message:string)=>flags.push({severity,code,message});
 if(!dossier.claims.length||!dossier.sources.length)flag('material','insufficient-evidence','No substantive claim/source ledger is available; independent research is still required.');
 for(const [name,rows] of [['source',dossier.sources],['claim',dossier.claims],['metric',dossier.metrics],['calculation',dossier.calculations]] as const){if(new Set(rows.map(r=>r.id)).size!==rows.length)flag('material','duplicate-id',`Duplicate ${name} identifiers make provenance ambiguous.`);}
 const sources=new Map(dossier.sources.map(s=>[s.id,s]));
 for(const source of dossier.sources){
  if(source.publishedAt&&source.publishedAt>asOf)flag('material','future-source',`${source.id}: published after ${asOf}; exclude it from point-in-time conclusions.`);
  if(!source.publishedAt)flag('notice','undated-source',`${source.id}: publication date is unknown; historical availability is not established.`);
  if(source.access==='excerpt'||source.access==='unavailable')flag('notice','limited-access',`${source.id}: only ${source.access} access was reported; do not imply full review.`);
 }
 for(const claim of dossier.claims){
  if(claim.sourceIds.some(key=>!sources.has(key)))flag('material','unknown-source',`${claim.id}: references a source missing from the evidence ledger.`);
  const eligible=claim.sourceIds.map(key=>sources.get(key)).filter(s=>s&&s.access!=='unavailable'&&(!s.publishedAt||s.publishedAt<=asOf));
  if(claim.material&&['reported','assertion'].includes(claim.kind)&&!eligible.length)flag('material','unsupported-claim',`${claim.id}: a material factual claim lacks accessible, date-eligible support.`);
  if(claim.material&&eligible.length&&eligible.every(s=>s!.kind==='youtube'||s!.kind==='social'))flag('material','social-only',`${claim.id}: material fact relies only on video/social evidence; corroborate or label it unverified.`);
 }
 for(const metric of dossier.metrics){if(metric.period>asOf&&metric.basis==='reported')flag('material','future-metric',`${metric.id}: a reported observation has a period after the as-of date.`);if(metric.value!==null&&metric.basis==='reported'&&!metric.sourceIds.some(key=>sources.has(key)&&sources.get(key)!.access!=='unavailable'))flag('material','unsourced-number',`${metric.id}: reported number has no accessible source.`);if(metric.sourceIds.some(key=>!sources.has(key)))flag('material','unknown-source',`${metric.id}: numeric provenance references a missing source.`);}
 for(const result of calculateEvidence(dossier,asOf))if(result.status!=='computed')flag('material','calculation',`${result.id}: ${result.explanation}`);
 for(const model of dossier.financialModels||[]){if(!model.sourceIds.length||model.sourceIds.some(key=>!sources.has(key)||sources.get(key)!.access==='unavailable'||!!sources.get(key)!.publishedAt&&sources.get(key)!.publishedAt!>asOf))flag('material','financial-model-provenance',`${model.id}: model inputs need accessible, date-eligible original evidence and explicit assumption review.`);}
 for(const result of computeFinancialModels(dossier.financialModels||[],asOf))if(result.status==='blocked')flag('material','financial-model',`${result.id}: ${result.issues.join(' ')}`);
 return flags;
}

export function finalizeResearch(input:{chapterId:string;asOf:string;model:string;dossier:Dossier;review:ResearchReview;revisionCount:number}):ResearchRecord{
 const flags=auditEvidence(input.dossier,input.asOf),claims=new Set(input.dossier.claims.map(c=>c.id)),sources=new Set(input.dossier.sources.map(s=>s.id));
 for(const check of input.review.sourceChecks)if(!claims.has(check.claimId)||!sources.has(check.sourceId))flags.push({severity:'material',code:'invalid-review-reference',message:'A review check references missing evidence.'});
 const material=input.dossier.claims.filter(c=>c.material&&['reported','assertion'].includes(c.kind));
 const checked=new Set(input.review.sourceChecks.filter(c=>material.some(m=>m.id===c.claimId)&&['supports','contradicts'].includes(c.result)).map(c=>c.claimId));
 if(checked.size<Math.min(3,material.length))flags.push({severity:'material',code:'missing-source-checks',message:'The review did not check enough material claims against original sources.'});
 for(const check of input.review.sourceChecks){if(check.result==='contradicts'&&material.some(c=>c.id===check.claimId))flags.push({severity:'material',code:'contradicted-claim',message:`${check.claimId}: review found contradictory source evidence.`});if(check.result==='supports'&&input.dossier.sources.find(s=>s.id===check.sourceId)?.access==='unavailable')flags.push({severity:'material',code:'inaccessible-support',message:`${check.sourceId}: an unavailable source was marked as supporting a claim.`});}
 const needsReview=flags.some(f=>f.severity==='material')||input.review.verdict!=='pass'||input.review.findings.some(f=>f.severity==='material');
 return {...input,version:'2026.10',completedAt:new Date().toISOString(),calculations:calculateEvidence(input.dossier,input.asOf),financialCalculations:computeFinancialModels(input.dossier.financialModels||[],input.asOf),flags,outcome:needsReview?'needs-review':'reviewed'};
}

export function validateResearchRecord(raw:unknown,report:Report):ResearchRecord{
 const parsed=z.object({version:z.literal('2026.10'),chapterId:id,asOf:date,model:z.string().min(1).max(120),dossier:dossierSchema,review:reviewSchema,revisionCount:z.number().int().min(0).max(3)}).safeParse(raw);
 if(!parsed.success||parsed.data.asOf!==report.asOf||!report.chapters.some(c=>c.id===parsed.data.chapterId)||JSON.stringify(raw).length>180000)throw new Error('Invalid research review record.');
 return finalizeResearch(parsed.data);
}
