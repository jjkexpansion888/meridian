import ts from 'typescript';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
for(const file of ['lib/types.ts','lib/research.ts','lib/portable-research.ts','lib/demo.ts','lib/evidence-policy.ts','lib/research-record.ts','lib/financial-reasoning.ts','lib/research-plan.ts','lib/institutional-research.ts','lib/research-literature.ts','lib/report-export.ts','lib/chat-client.ts','lib/full-report.ts','lib/asset-identity.ts','tests/research.test.ts','tests/full-report.test.ts','tests/institutional-research.test.ts','tests/financial-reasoning.test.ts']){
  const output=path.join('.sites-runtime/tests',file.replace(/\.ts$/,'.js'));
  await mkdir(path.dirname(output),{recursive:true});
  const source=await readFile(file,'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  await writeFile(output,compiled.replace(/from (["'])(\.\.?\/[^"']+)\1/g,(_,quote,specifier)=>`from ${quote}${specifier}.js${quote}`));
}
const result=spawnSync(process.execPath,['--test','.sites-runtime/tests/tests/research.test.js','.sites-runtime/tests/tests/full-report.test.js','.sites-runtime/tests/tests/institutional-research.test.js','.sites-runtime/tests/tests/financial-reasoning.test.js','tests/training.test.mjs','tests/chat.test.mjs','tests/chat-integration.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status??1;
