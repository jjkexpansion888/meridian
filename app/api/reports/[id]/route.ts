import { env } from "cloudflare:workers";
import { advance,body,guard,handleError,HttpError,json,provider,readReport,saveReport } from "../../../../lib/server";
import {importMarkdown} from "../../../../lib/portable-research";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,ctx:Context){try{const owner=await guard(request);return json((await readReport((await ctx.params).id,owner)).report);}catch(e){return handleError(e);}}
export async function POST(request:Request,ctx:Context){try{
  const owner=await guard(request);const {id}=await ctx.params;const input=await body(request,800000);
  if(input.action==="advance")return json(await advance(id,owner));
  const {report,revision}=await readReport(id,owner);
  if(input.action==="import"){
    if(report.chapters.some(c=>c.status==="running"))throw new HttpError(409,"Cancel any current API research before importing.");
    if(typeof input.text!=="string"||input.text.trim().length<100||input.text.length>700000)throw new HttpError(400,"Import between 100 and 700,000 characters of Markdown report text.");
    const imported=importMarkdown(report,input.text);
    report.chapters=imported.chapters;report.researchMode="manual";report.model="Imported research";report.status=report.chapters.every(c=>c.status==="completed")?"completed":"draft";
    await saveReport(report,owner,revision);return json({...report,importResult:{matched:imported.matched,fallback:imported.fallback}});
  }
  if(input.action==="resume"&&report.researchMode==="manual")throw new HttpError(409,"This report uses the no-API research workflow.");
  if(input.action==="mode"&&input.value==="manual"){
    if(report.chapters.some(c=>c.status==="running"))throw new HttpError(409,"Cancel current research before switching workflows.");
    report.researchMode="manual";report.model="Imported research";report.status=report.chapters.every(c=>c.status==="completed")?"completed":"draft";
  }
  else if(input.action==="pause")report.status="paused";
  else if(input.action==="resume"){if(report.status!=="completed"){report.status="running";const c=report.chapters.find(c=>c.status==="failed");if(c){c.status="pending";delete c.responseId;delete c.error;}}}
  else if(input.action==="cancel"){const current=report.chapters.find(c=>c.status==="running"&&c.responseId);if(current){await provider(`responses/${encodeURIComponent(current.responseId!)}/cancel`,{method:"POST"});current.status="pending";delete current.responseId;}report.status="paused";}
  else if(input.action==="star"&&typeof input.value==="boolean")report.starred=input.value;
  else if(input.action==="notes"&&typeof input.value==="string"&&input.value.length<=50000)report.notes=input.value;
  else throw new HttpError(400,"Unknown report action.");
  await saveReport(report,owner,revision);return json(report);
}catch(e){return handleError(e);}}
export async function DELETE(request:Request,ctx:Context){try{const owner=await guard(request);const {id}=await ctx.params;const {report}=await readReport(id,owner);if(report.chapters.some(c=>c.status==="running"))throw new HttpError(409,"Cancel the active chapter before deleting this report.");await env.DB!.prepare("DELETE FROM reports WHERE id = ? AND owner_id = ?").bind(id,owner).run();return json({ok:true});}catch(e){return handleError(e);}}
