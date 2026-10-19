import { env } from "cloudflare:workers";
import { body,guard,handleError,HttpError,json } from "../../../lib/server";
import { createChapters } from "../../../lib/research";
import type { Report } from "../../../lib/types";
export async function GET(request:Request){try{const owner=await guard(request);const result=await env.DB!.prepare("SELECT data FROM reports WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100").bind(owner).all<{data:string}>();return json(result.results.map(r=>JSON.parse(r.data)));}catch(e){return handleError(e);}}
export async function POST(request:Request){try{
  const owner=await guard(request);const input=await body(request);
  if(typeof input.name!=="string"||input.name.trim().length<2||input.name.length>150||!["equity","crypto","private"].includes(input.type)||!["deep","exhaustive"].includes(input.depth))throw new HttpError(400,"Enter a company or asset and select a research depth.");
  for(const [key,limit] of [["symbol",100],["focus",4000],["context",60000]] as const)if(input[key]!==undefined&&(typeof input[key]!=="string"||input[key].length>limit))throw new HttpError(400,`${key} is too long or invalid.`);
  if(typeof input.asOf!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)||!Number.isFinite(Date.parse(input.asOf))||input.asOf>new Date().toISOString().slice(0,10))throw new HttpError(400,"Choose a valid as-of date that is not in the future.");
  const count=await env.DB!.prepare("SELECT COUNT(*) AS count FROM reports WHERE owner_id = ?").bind(owner).first<{count:number}>();if((count?.count||0)>=100)throw new HttpError(400,"This workspace holds up to 100 reports. Delete an old report to create another.");
  const now=new Date().toISOString();const report:Report={id:crypto.randomUUID(),name:input.name.trim(),symbol:input.symbol?.trim()||"",type:input.type,depth:input.depth,focus:input.focus||"",context:input.context||"",asOf:input.asOf,status:"draft",starred:false,notes:"",chapters:createChapters(input.type),createdAt:now,updatedAt:now,model:input.researchMode==="api"?(env.OPENAI_MODEL||"gpt-5.5"):"Imported research",researchMode:input.researchMode==="api"?"api":"manual"};
  await env.DB!.prepare("INSERT INTO reports (id, owner_id, data, updated_at) VALUES (?, ?, ?, ?)").bind(report.id,owner,JSON.stringify(report),now).run();return json(report,201);
}catch(e){return handleError(e);}}
