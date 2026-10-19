// Explicit opt-in: uses the local connected ChatGPT subscription, never an API key.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {developmentCases,holdoutCases} from '../research/reasoning-cases.mjs';
import {scorePredictions} from '../lib/training-workflow.mjs';
const [mode,split,output]=process.argv.slice(2);
if(!['baseline','candidate'].includes(mode)||!['development','holdout'].includes(split)||!output)throw new Error('Usage: node scripts/evaluate-connected-reasoning.mjs baseline|candidate development|holdout output-directory');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5174';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Connected-plan evaluation requires loopback.');
const headers={'Content-Type':'application/json','X-Meridian-Chat':'1',Origin:base};
const status=await (await fetch(base+'/__meridian/chat/status',{headers})).json();if(!status.planEnabled)throw new Error('Connect a ChatGPT plan. No API-key fallback will be used.');
const catalog=await (await fetch(base+'/__meridian/chat/models',{headers})).json(),model=catalog.models?.[0]?.id;if(!model)throw new Error('No connected-plan model is available.');
const cases=split==='development'?developmentCases:holdoutCases;
let context='Original synthetic financial reasoning evaluation. No live investment data. As of 2026-10-19.';
if(mode==='candidate'){
 const {computeFinancialModels,financialReasoningMandate}=await import('../.sites-runtime/tests/lib/financial-reasoning.js');
 context+='\n'+['equity','crypto','private'].map(financialReasoningMandate).join('\n')+'\nDeterministic checks on supplied hypothetical inputs; verify their relevance.\n'+JSON.stringify(cases.map(c=>({id:c.id,checks:computeFinancialModels(c.financialModels,'2026-10-19')})));
}
const prompt='Solve each independent original synthetic case using only its supplied evidence. Return ONLY a JSON object {"predictions":[{"id":"case id","answer":number|string|null,"unit":"specified unit","abstain":boolean,"usedSourceIds":["s1"]}]}. Preserve numerical precision to at least six decimals where needed. Use null and abstain when the question lacks defensible inputs. No web research is needed.\n'+JSON.stringify(cases.map(c=>({id:c.id,prompt:c.prompt,unit:c.expected.unit})));
const response=await fetch(base+'/__meridian/chat/send',{method:'POST',headers,body:JSON.stringify({reportId:'eval-'+randomUUID(),text:prompt,context,model,webSearch:false})});
if(!response.ok)throw new Error('Connected-plan request failed: '+response.status);
const raw=await response.text();let message;
for(const frame of raw.split('\n\n')){const line=frame.split('\n').find(x=>x.startsWith('data: '));if(!line)continue;const event=JSON.parse(line.slice(6));if(event.type==='error')throw new Error(event.message);if(event.type==='done')message=event.message;}
if(message?.status!=='completed')throw new Error('No completed evaluation response.');
const parsed=JSON.parse(message.text.slice(message.text.indexOf('{'),message.text.lastIndexOf('}')+1));
if(!Array.isArray(parsed.predictions))throw new Error('Malformed prediction output.');
const result={...scorePredictions(cases,parsed.predictions),mode,split,model,createdAt:new Date().toISOString(),casesSha256:createHash('sha256').update(JSON.stringify(cases)).digest('hex'),promptSha256:createHash('sha256').update(prompt+context).digest('hex'),apiCreditsUsed:false,subscriptionUsage:true};
await mkdir(output,{recursive:true});await writeFile(output+'/predictions.jsonl',parsed.predictions.map(p=>JSON.stringify(p)).join('\n')+'\n',{flag:'wx'});await writeFile(output+'/result.json',JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({mode,split,model,passed:result.passed,cases:result.cases,failed:result.results.filter(r=>!r.passed).map(r=>r.id),output,limitation:result.limitations}));
