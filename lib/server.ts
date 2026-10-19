import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { buildPrompt, extractResponse } from "./research";
import type { Report } from "./types";
import {providerFailure} from "./portable-research";
export class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
export const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function guard(request:Request){
  const origin=request.headers.get("origin");
  if(!["GET","HEAD"].includes(request.method)&&origin&&origin!==new URL(request.url).origin) throw new HttpError(403,"Cross-origin requests are not allowed.");
  const user=await getChatGPTUser(); if(!user) throw new HttpError(401,"Sign in to save or run research.");
  if(!env.DB) throw new HttpError(503,"Research storage is not configured."); return user.userId;
}
export async function body(request:Request,limit=180000){const content=await request.text();if(content.length>limit)throw new HttpError(413,"This request is too large.");try{const parsed=JSON.parse(content);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error();return parsed;}catch{throw new HttpError(400,"Enter valid request data.");}}
export async function readReport(id:string,owner:string){
  const row=await env.DB!.prepare("SELECT data, revision FROM reports WHERE id = ? AND owner_id = ?").bind(id,owner).first<{data:string;revision:number}>();
  if(!row)throw new HttpError(404,"Report not found.");return {report:JSON.parse(row.data) as Report,revision:row.revision};
}
export async function saveReport(report:Report,owner:string,revision:number){
  report.updatedAt=new Date().toISOString();
  const result=await env.DB!.prepare("UPDATE reports SET data = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND revision = ?").bind(JSON.stringify(report),report.updatedAt,report.id,owner,revision).run();
  if(!result.meta.changes)throw new HttpError(409,"This report changed in another tab. Refresh and try again.");
}
export async function provider(path:string,init:RequestInit={}){
  if(!env.OPENAI_API_KEY)throw new HttpError(503,"Connect an OpenAI API key in the server settings to run live research.");
  const response=await fetch(`https://api.openai.com/v1/${path}`,{...init,headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(45000)});
  const data:any=await response.json();
  if(!response.ok){const messages:Record<number,string>={401:"The research API key was rejected. Update the server secret.",403:"The API project does not have access to the research model.",429:"The provider is rate limited or out of credits. Check billing and retry.",404:"The configured model or request is unavailable."};throw new HttpError(response.status===429?429:502,messages[response.status]||"The research provider is temporarily unavailable. Retry shortly.");}return data;
}
export async function advance(id:string,owner:string){
  const {report,revision}=await readReport(id,owner);
  if(report.researchMode==="manual")throw new HttpError(409,"Use the research packet and import workflow for this report. No API call was made.");
  if(report.demo||["completed","paused"].includes(report.status))return report;
  const chapter=report.chapters.find(c=>c.status!=="completed");
  if(!chapter){report.status="completed";await saveReport(report,owner,revision);return report;}
  if(chapter.status==="failed")return report;
  if(chapter.status==="running"&&!chapter.responseId){
    if(Date.now()-Date.parse(chapter.startedAt||"")<65000)return report;
    chapter.status="failed";chapter.error="The provider launch could not be confirmed. Retry this chapter; check provider usage for any orphaned request.";report.status="failed";await saveReport(report,owner,revision);return report;
  }
  if(chapter.responseId){
    const response=await provider(`responses/${encodeURIComponent(chapter.responseId)}`);
    if(["queued","in_progress"].includes(response.status))return report;
    Object.assign(chapter,extractResponse(response));
    if(response.status==="completed"&&chapter.body.trim()){chapter.status="completed";chapter.usage=response.usage;report.status=report.chapters.every(c=>c.status==="completed")?"completed":"running";}
    else{chapter.status="failed";chapter.error=providerFailure(response);report.status="failed";}
    await saveReport(report,owner,revision);return report;
  }
  // Reserve atomically before a billable launch; concurrent tabs cannot start twice.
  chapter.status="running";chapter.startedAt=new Date().toISOString();report.status="running";delete report.error;
  await saveReport(report,owner,revision);
  try{
    const response=await provider("responses",{method:"POST",body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-5.5",background:true,store:true,reasoning:{effort:"high"},tools:[{type:"web_search"}],tool_choice:"required",include:["web_search_call.action.sources"],max_output_tokens:report.depth==="exhaustive"?16000:10000,input:buildPrompt(report,chapter)})});
    const latest=await readReport(id,owner);const target=latest.report.chapters.find(c=>c.id===chapter.id)!;target.responseId=response.id;
    if(response.status==="completed"){Object.assign(target,extractResponse(response));target.status=target.body?"completed":"failed";}
    await saveReport(latest.report,owner,latest.revision);return latest.report;
  }catch(error){
    const latest=await readReport(id,owner);const target=latest.report.chapters.find(c=>c.id===chapter.id)!;target.status="failed";target.error=error instanceof Error?error.message:"Research could not start.";latest.report.status="failed";await saveReport(latest.report,owner,latest.revision);return latest.report;
  }
}
export function handleError(error:unknown){return json({error:error instanceof HttpError?error.message:"Something went wrong. Your saved research is safe; try again."},error instanceof HttpError?error.status:500);}
