import {readFile,writeFile} from 'node:fs/promises';
import {scorePredictions} from '../lib/training-workflow.mjs';
const args=process.argv.slice(2);
if(args.length!==2)throw new Error('Usage: node scripts/evaluate-research.mjs predictions.jsonl result.json');
const cases=JSON.parse(await readFile(new URL('../research/evaluation-cases.json',import.meta.url),'utf8'));
const predictions=(await readFile(args[0],'utf8')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
const result=scorePredictions(cases,predictions);await writeFile(args[1],JSON.stringify(result,null,2),{flag:'wx'});
console.log(`${result.passed}/${result.cases} original diagnostic cases passed. No published benchmark or investment-performance claim is implied.`);
