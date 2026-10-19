import type {Report,Chapter} from './types';
import {wordCount} from './types';
import {researchPacket,importMarkdown} from './portable-research';
import type {ChatMessage} from './chat-client';
import {researchChapter,type ResearchStage,type ResearchGenerate} from './institutional-research';
import type {ResearchRecord} from './research-record';
import {planningPrompt,parseResearchPlan,planChapters,type ResearchPlan} from './research-plan';

export const chapterSaved=(chapter:Chapter)=>chapter.status==='completed'&&!!chapter.body.trim();
export function researchContext(report:Report){
 const packet=researchPacket(report),chapters=report.chapters.filter(chapterSaved).map(c=>`## ${c.title}\n${c.body}`).join('\n\n');
 const prefix=packet+'\n\nSAVED REPORT CHAPTERS (draft evidence, not verified):\n';
 return {text:prefix+chapters.slice(0,Math.max(0,175000-prefix.length)),truncated:prefix.length+chapters.length>175000};
}
export function fullChapterPrompt(report:Report,chapter:Chapter){
 return `Build the complete diligence report for ${report.name}, automatically, one substantive chapter per response. This turn must contain ONLY the exact chapter heading ## ${chapter.title}, followed by the complete chapter. Use ### for subsections. Do not write another chapter or ask the user to continue.\n\nChapter mandate: ${chapter.brief}\n\nAim for ${report.depth==='exhaustive'?'1,500–2,200':'800–1,200'} substantive words, without padding. Research primary documents and independent qualitative evidence on the web. Include dated inline Markdown source links, financial tables and calculations where relevant, opposing evidence and unresolved gaps. Never invent missing statements, private data, interviews or sources. Follow the attached research brief and asset-specific reporting boundaries. Cross-check the previously saved chapters for consistent periods, units, assumptions and definitions. The final investment committee memo must synthesize the entire investigation, including disagreements and confidence limits. If identity remains ambiguous, explicitly explain that limitation and avoid entity-specific financial assertions.`;
}
export function validatedChapter(report:Report,chapter:Chapter,message:ChatMessage){
 if(message.status!=='completed')throw new Error('The chapter did not finish. Saved chapters are safe; resume to try again.');
 const parsed=importMarkdown(report,message.text),target=parsed.chapters.find(c=>c.id===chapter.id);
 if(parsed.fallback||parsed.matched!==1||!target||target.body===chapter.body||wordCount(target.body)<150)throw new Error(`The answer did not contain a complete “${chapter.title}” chapter. Review the chat answer before resuming.`);
 return {text:`## ${chapter.title}\n\n${target.body}`,chapters:parsed.chapters};
}
export type ReportProgress={saved:number;total:number;title:string;phase:'researching'|'saving'|'paused'|'complete';stage?:ResearchStage|'planning'};
export async function runFullReport(options:{report:Report;signal:AbortSignal;shouldPause:()=>boolean;generate:ResearchGenerate;save:(markdown:string,chapter:Chapter,research?:ResearchRecord)=>Promise<void>;recover?:(chapter:Chapter,report:Report)=>ChatMessage|undefined;onProgress:(progress:ReportProgress)=>void;research?:{model:string};savePlan?:(plan:ResearchPlan)=>Promise<void>}){
 let report=structuredClone(options.report);
 if(options.research&&options.savePlan&&!report.researchPlan&&!report.chapters.some(c=>c.body)){
  options.signal.throwIfAborted();options.onProgress({saved:0,total:0,title:'Designing the investigation',phase:'researching',stage:'planning'});
  const message=await options.generate(planningPrompt(report),researchPacket(report),'evidence');options.signal.throwIfAborted();
  if(message.status!=='completed')throw new Error('Research planning was interrupted.');
  const plan=parseResearchPlan(message.text);await options.savePlan(plan);report={...report,researchPlan:plan,chapters:planChapters(plan)};
 }
 const progress=(title:string,phase:ReportProgress['phase'])=>options.onProgress({saved:report.chapters.filter(chapterSaved).length,total:report.chapters.length,title,phase});
 for(const chapter of report.chapters.filter(c=>!chapterSaved(c))){
  options.signal.throwIfAborted();if(options.shouldPause()){progress('', 'paused');return report;}
  progress(chapter.title,'researching');
  const reviewed=options.research?await researchChapter({report,chapter,model:options.research.model,signal:options.signal,generate:options.generate,onStage:stage=>options.onProgress({saved:report.chapters.filter(chapterSaved).length,total:report.chapters.length,title:chapter.title,phase:'researching',stage})}):undefined;
  const message=reviewed?.message||options.recover?.(chapter,report)||await options.generate(fullChapterPrompt(report,chapter),researchContext(report).text);
  options.signal.throwIfAborted();const parsed=validatedChapter(report,chapter,message);
  progress(chapter.title,'saving');await options.save(parsed.text,chapter,reviewed?.research);
  report={...report,chapters:parsed.chapters.map(c=>c.id===chapter.id&&reviewed?{...c,research:reviewed.research}:c)};
 }
 report.status='completed';progress('','complete');return report;
}
