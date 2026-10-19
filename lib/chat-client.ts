export type ChatMessage={id:string;role:"user"|"assistant";text:string;status:"completed"|"interrupted";createdAt:string;model?:string};
export type ChatConnection={sessionOnly?:boolean;available:boolean;connected:boolean;planEnabled:boolean;account:{id:string;email:string}|null;profiles:{id:string;email:string}[];pending:boolean;error?:string};
export type ChatModel={id:string;name:string};
export type ChatEvent={type:'start';user:ChatMessage;message:ChatMessage}|{type:'delta'|'progress';text:string}|{type:'done';message:ChatMessage}|{type:'error';message:string};
const headers={"Content-Type":"application/json","X-Meridian-Chat":"1"};
export async function chatRequest<T={ok:boolean}>(path:string,body?:unknown):Promise<T>{
 const response=await fetch('/__meridian/chat/'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Research chat is available in the local Meridian app. Start Meridian and connect your ChatGPT plan.');
 const data=await response.json() as T & {error?:string};if(!response.ok)throw new Error(data.error||'Chat request failed.');return data;
}
export async function readChatResponse(response:Response,onEvent:(event:ChatEvent)=>void,signal?:AbortSignal):Promise<ChatMessage>{
 if(!response.ok){const data=await response.json() as {error?:string};throw new Error(data.error||'Chat request failed.');}
 if(!response.body)throw new Error('The response stream was unavailable.');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',completed:ChatMessage|undefined;
 try{
  while(true){
   signal?.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;
   buffer+=decoder.decode(chunk.value,{stream:true});if(buffer.length>4000000)throw new Error('The response exceeded the stream limit.');
   let boundary;
   while((boundary=buffer.indexOf('\n\n'))!==-1){
    const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
    const raw=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!raw)continue;
    const event=JSON.parse(raw) as ChatEvent;onEvent(event);
    if(event.type==='error')throw new Error(String(event.message||'Research was interrupted.'));
    if(event.type==='done'&&event.message.status==='completed')completed=event.message;
   }
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(!completed)throw new Error('The response stopped before completion. Partial text has not been saved to the report.');
 return completed;
}
export async function streamChat(input:{reportId:string;text:string;context:string;model:string;webSearch:boolean},signal:AbortSignal,onEvent:(event:ChatEvent)=>void=()=>{}):Promise<ChatMessage>{
 return readChatResponse(await fetch('/__meridian/chat/send',{method:'POST',headers,body:JSON.stringify(input),signal}),onEvent,signal);
}
