import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { handleError,json,guard,provider } from "../../../lib/server";
export async function GET(){const user=await getChatGPTUser();return json({configured:!!env.OPENAI_API_KEY,storage:!!env.DB,authenticated:!!user,user:user?.displayName||user?.email||null,model:env.OPENAI_MODEL||"gpt-5.5"});}
export async function POST(request:Request){try{await guard(request);const result=await provider(`models/${encodeURIComponent(env.OPENAI_MODEL||"gpt-5.5")}`);return json({ok:!!result.id,model:result.id});}catch(e){return handleError(e);}}
