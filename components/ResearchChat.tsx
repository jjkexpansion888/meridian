"use client";
import {useState,useEffect,useRef,useCallback} from "react";
import {MessageSquare,ArrowUpRight,ArrowUp,BookOpen,Globe,Square,Check,LoaderCircle,Download,Copy,ShieldCheck,X,LogOut,RefreshCw,Plus,Play,Pause} from "lucide-react";
import type {Report} from "../lib/types";
import {wordCount} from "../lib/types";
import {importMarkdown} from "../lib/portable-research";
import {chatRequest as request,streamChat,type ChatMessage as Message,type ChatConnection as Connection,type ChatModel as Model} from "../lib/chat-client";
import {chapterSaved,researchContext,fullChapterPrompt,runFullReport,validatedChapter,type ReportProgress} from "../lib/full-report";
import {Markdown} from "./Markdown";

function downloadChat(name:string,text:string){const url=URL.createObjectURL(new Blob([text],{type:"text/markdown"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function ResearchChat({report,onImport,notify,autoStart=false,onAutoStart,onOpenReport}:{report:Report;onImport:(text:string)=>Promise<void>;notify:(text:string)=>void;autoStart?:boolean;onAutoStart?:()=>void;onOpenReport?:()=>void}){
 const [connection,setConnection]=useState<Connection|null>(null),[models,setModels]=useState<Model[]>([]),[model,setModel]=useState("");
 const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(""),[web,setWeb]=useState(true),[busy,setBusy]=useState(false),[connecting,setConnecting]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[progress,setProgress]=useState("");
 const [saveText,setSaveText]=useState(""),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState("");
 const [fullProgress,setFullProgress]=useState<ReportProgress|null>(null),[pauseRequested,setPauseRequested]=useState(false),[historyReady,setHistoryReady]=useState(false);
 const pause=useRef(false),messagesRef=useRef<Message[]>([]),started=useRef(false);
 const controller=useRef<AbortController|null>(null),bottom=useRef<HTMLDivElement>(null),composer=useRef<HTMLTextAreaElement>(null),dialog=useRef<HTMLDialogElement>(null),mounted=useRef(true),accountId=useRef<string|undefined>(undefined);
 const ready=connection?.planEnabled&&!!model&&!loading&&historyReady;
 const completed=report.chapters.filter(chapterSaved).length;
 const {text:context,truncated}=researchContext(report);
 const fullBusy=busy&&!!fullProgress;
 const preview=saveText?importMarkdown(report,saveText):null;

 const refresh=useCallback(async()=>{
  try{
   const state=await request<Connection>("status");if(!mounted.current)return;setConnection(state);
   if(accountId.current!==state.account?.id){controller.current?.abort();accountId.current=state.account?.id;setModels([]);setModel("");setMessages([]);messagesRef.current=[];setHistoryReady(false);}
   if(!state.pending)setConnecting(false);
   if(state.error)setError(state.error);
   if(state.planEnabled){
    const catalog=await request<{models:Model[]}>("models");if(!mounted.current)return;setModels(catalog.models);setModel(old=>catalog.models.some((m:Model)=>m.id===old)?old:catalog.models[0]?.id||"");
    if(!catalog.models.length)setError("No models are currently available for this connection. Review your ChatGPT usage settings.");
   }
  }catch(e){if(mounted.current)setError((e as Error).message);}
  finally{if(mounted.current)setLoading(false);}
 },[]);
 useEffect(()=>{mounted.current=true;const refreshOnFocus=()=>void refresh();const timer=setTimeout(refreshOnFocus,0);window.addEventListener("focus",refreshOnFocus);return()=>{clearTimeout(timer);window.removeEventListener("focus",refreshOnFocus);mounted.current=false;controller.current?.abort();};},[refresh]);
 useEffect(()=>{let live=true;request<{messages:Message[]}>(`history?reportId=${encodeURIComponent(report.id)}`).then(data=>{if(live){setMessages(data.messages);messagesRef.current=data.messages;setHistoryReady(true);}}).catch(e=>{if(live){setError((e as Error).message);setHistoryReady(true);}});return()=>{live=false;};},[report.id,connection?.account?.id]);
 useEffect(()=>{if(!connecting)return;const timer=setInterval(()=>void refresh(),2500);return()=>clearInterval(timer);},[connecting,refresh]);
 useEffect(()=>{if(saveText)dialog.current?.showModal();else dialog.current?.close();},[saveText]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:"nearest",behavior:"instant"});},[messages,busy]);
 useEffect(()=>{if(!autoStart||!ready||busy||started.current)return;const timer=setTimeout(()=>{if(started.current)return;started.current=true;onAutoStart?.();void generateFullReport();},0);return()=>clearTimeout(timer);});
 useEffect(()=>{if(!busy)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);

 async function connect(profileId?:string){
  setError("");setConnecting(true);
  // Open immediately within the click gesture, then navigate to the server-generated OAuth URL.
  const popup=window.open("about:blank","meridian-chatgpt-connect");
  try{const data=await request<{url:string}>("login",{profileId});if(popup)popup.location.href=data.url;else{setError("Your browser blocked the sign-in tab. Allow pop-ups for Meridian, then try again.");setConnecting(false);await request("cancel-login",{});}}
  catch(e){popup?.close();setConnecting(false);setError((e as Error).message);}
 }
 function prepare(text:string){setDraft(text);composer.current?.focus();}
 function chapterPrompt(title:string){const chapter=report.chapters.find(c=>c.title===title);if(chapter)prepare(fullChapterPrompt(report,chapter));}
 async function runMessage(text:string,attachedContext:string,abort:AbortController,search:boolean){
  let messageId='';
  setProgress(search?'Looking for evidence…':'Thinking through your question…');
  return streamChat({reportId:report.id,text,context:attachedContext,model,webSearch:search},abort.signal,event=>{
   if(!mounted.current)return;
   if(event.type==='start'){messageId=event.message.id;messagesRef.current=[...messagesRef.current,event.user,event.message];setMessages(messagesRef.current);}
   if(event.type==='delta'){setProgress('Writing your answer…');messagesRef.current=messagesRef.current.map(m=>m.id===messageId?{...m,text:m.text+event.text}:m);setMessages(messagesRef.current);}
   if(event.type==='progress')setProgress(event.text);
   if(event.type==='done'){messagesRef.current=messagesRef.current.map(m=>m.id===messageId?event.message:m);setMessages(messagesRef.current);}
  });
 }
 async function send(){
  if(!draft.trim()||!ready||busy||controller.current)return;
  const text=draft.trim();setDraft("");setBusy(true);setFullProgress(null);setError("");
  const abort=new AbortController();controller.current=abort;
  try{
   await runMessage(text,context,abort,web);
  }catch(e){if(mounted.current)setError(abort.signal.aborted?"Response stopped. Partial text is preserved; it has not been added to your report.":(e as Error).message);}
  finally{if(mounted.current){setBusy(false);setProgress("");}controller.current=null;}
 }
 async function generateFullReport(){
  if(!ready||busy||controller.current||completed===report.chapters.length)return;
  const abort=new AbortController();controller.current=abort;pause.current=false;setPauseRequested(false);setBusy(true);setError('');
  setFullProgress({saved:completed,total:report.chapters.length,title:'Preparing research',phase:'researching'});
  try{
   const result=await runFullReport({report,signal:abort.signal,shouldPause:()=>pause.current,
    generate:(prompt,attached)=>runMessage(prompt,attached,abort,true),
    save:async markdown=>{await onImport(markdown);},
    recover:(chapter,snapshot)=>[...messagesRef.current].reverse().find(message=>{if(message.role!=='assistant'||message.status!=='completed')return false;try{validatedChapter(snapshot,chapter,message);return true;}catch{return false;}}),
    onProgress:value=>{if(mounted.current)setFullProgress(value);}
   });
   if(mounted.current)notify(result.chapters.every(chapterSaved)?'Your full diligence report is saved. Review the evidence and conclusions.':'Research paused. Saved chapters are ready to read.');
  }catch(e){if(mounted.current){setFullProgress(previous=>previous?{...previous,phase:'paused'}:null);setError(abort.signal.aborted?'Research paused. Completed chapters are saved; continue whenever you are ready.':`${(e as Error).message} Completed chapters are saved. Continue to resume the report.`);}}
  finally{controller.current=null;if(mounted.current){setBusy(false);setProgress('');setPauseRequested(false);}}
 }
 async function copy(text:string){try{await navigator.clipboard.writeText(text);notify("Answer copied.");}catch{downloadChat(`${report.name}-answer.md`,text);notify("Answer downloaded.");}}

 return <section className="research-chat">
  <div className="chat-heading"><div><span className="eyebrow">YOUR RESEARCH PARTNER</span><h2>Follow the evidence. Ask the next question.</h2><p>A conversation with your brief and research close at hand.</p></div><span className="chat-plan-badge"><ShieldCheck size={14}/>No API key</span></div>
  <div className="full-report-card">
   <div className="full-report-copy"><span className="eyebrow">THE COMPLETE PICTURE</span><h3>{completed===report.chapters.length?'Your full report is ready to review.':'Every chapter. One investigation.'}</h3><p>{fullBusy?(fullProgress?.phase==='saving'?'Saving: ':'Researching: ')+fullProgress?.title:fullProgress?.phase==='paused'?'Research paused. Continue from your saved progress.':`Financials, business quality, YouTube and social evidence, risks and the investment case — across all ${report.chapters.length} chapters.`}</p></div>
   <div className="full-report-actions">{completed===report.chapters.length?<button className="primary" onClick={onOpenReport}><BookOpen size={16}/>Read full report</button>:fullBusy?<button className="secondary" disabled={pauseRequested} onClick={()=>{pause.current=true;setPauseRequested(true);}}><Pause size={15}/>{pauseRequested?'Pausing after this chapter…':'Pause after this chapter'}</button>:<button className="primary" disabled={!ready||busy||saving||!!saveText||report.status==='running'} onClick={()=>void generateFullReport()}><Play size={16}/>{completed?'Continue full report':'Generate full report'}</button>}<span>{completed} / {report.chapters.length} chapters saved</span></div>
   <div className="full-report-meter" role="progressbar" aria-label="Full report progress" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={report.chapters.length}><i style={{width:`${completed/report.chapters.length*100}%`}}/></div>
   <small>Keep this report open while researching. You can read saved chapters as the report grows. ChatGPT plan limits apply.</small>
  </div>
  <div className="chat-layout"><div className="chat-main">
   <div className="chat-connection"><span className={`connection-dot ${connection?.planEnabled?"online":""}`}/><div><strong>{connection?.planEnabled?"Using ChatGPT plan":connection?.connected?"Plan permission needed":"Connect your ChatGPT plan"}</strong><small>{connection?.account?.email||"Use an eligible subscription in Meridian. Plan limits apply."}</small></div>{connection?.connected?<button className="icon-btn" aria-label="Disconnect ChatGPT" disabled={busy} onClick={async()=>{try{const data=await request<{message:string}>("logout",{});notify(data.message);await refresh();}catch(e){setError((e as Error).message);}}}><LogOut size={16}/></button>:<button className="chat-signin" disabled={connecting||loading} onClick={()=>connect()}>{connecting?<LoaderCircle size={15} className="spin"/>:<MessageSquare size={15}/>}Continue with ChatGPT</button>}</div>
   {!connection?.connected&&connection?.profiles.length?<div className="chat-saved-accounts"><span>Saved connections</span>{connection.profiles.map((p,i)=><button disabled={connecting} key={p.id} onClick={()=>connect(p.id)}>{p.email} · Connection {i+1}</button>)}</div>:null}
   {connection?.connected&&connection.sessionOnly&&<div className="chat-session-note">Connected for this session. Sign in again after restarting Meridian.</div>}{connecting&&<div className="chat-signin-pending" role="status">Finish sign-in and approve plan usage in the ChatGPT tab.<button onClick={async()=>{await request("cancel-login",{});setConnecting(false);}}>Cancel</button></div>}
   <div className="chat-messages" aria-label="Research conversation" aria-busy={busy}>
    {!messages.length?<div className="chat-welcome"><span className="chat-mark">m·</span><h3>Let’s understand {report.name}.</h3><p>Your mandate is attached. Start with the investment case, challenge an assumption, or generate every chapter automatically.</p><div className="chat-suggestions"><button onClick={()=>prepare(`Map the bull and bear investment cases for ${report.name}. Research current primary sources, distinguish facts from claims, and identify the five questions that matter most.`)}><MessageSquare size={17}/><span>Map the investment case<small>Find the questions that matter.</small></span><ArrowUpRight size={15}/></button><button onClick={()=>chapterPrompt(report.chapters.find(c=>!c.body)?.title||report.chapters[0].title)}><BookOpen size={17}/><span>Research the next chapter<small>Build a detailed, cited report.</small></span><ArrowUpRight size={15}/></button><button onClick={()=>prepare(`Make the strongest opposing case for ${report.name}. Seek independent criticism, security and governance issues, weak economics and dilution. Cite original sources and identify what could cause permanent loss.`)}><ShieldCheck size={17}/><span>Pressure-test the thesis<small>Look for evidence that disagrees.</small></span><ArrowUpRight size={15}/></button></div></div>:messages.map(m=><article key={m.id} className={`chat-message ${m.role}`}><div className="chat-message-meta"><span>{m.role==="user"?"YOU":"MERIDIAN"}</span>{m.role==="assistant"&&<small>{m.status==="interrupted"?(busy&&m.id===messages.at(-1)?.id?"Researching":"Interrupted · not complete"):m.model}</small>}</div>{m.role==="assistant"?<Markdown text={m.text||(busy?"Following the evidence…":"No answer was generated.")}/>:<p>{m.text}</p>}{m.role==="assistant"&&m.text&&!busy&&<div className="chat-answer-actions"><button onClick={()=>copy(m.text)}><Copy size={13}/>Copy</button>{m.status==="completed"&&m.text.length>=100&&<button onClick={()=>{setSaveError("");setSaveText(m.text);}}><BookOpen size={13}/>Save to report</button>}</div>}</article>)}
    {busy&&<div className="chat-progress" role="status"><LoaderCircle size={14} className="spin"/>{progress}</div>}<div ref={bottom}/>
   </div>
   {error&&<div className="chat-error" role="alert"><span>{error}</span><button className="icon-btn" aria-label="Dismiss chat error" onClick={()=>setError("")}><X size={14}/></button></div>}
   <form className="chat-composer" onSubmit={e=>{e.preventDefault();void send();}}><div className="chat-context-chip"><BookOpen size={12}/>{report.name} · brief attached{truncated?" · report excerpt":""}</div><textarea ref={composer} aria-label="Message Meridian" placeholder={`Ask about ${report.name}, or choose a chapter…`} value={draft} maxLength={16000} rows={3} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><div className="chat-composer-tools"><label className={`chat-web-toggle ${web?"active":""}`}><input type="checkbox" checked={web} onChange={e=>setWeb(e.target.checked)} disabled={busy}/><Globe size={14}/>Web research</label><select aria-label="Research model" value={model} onChange={e=>setModel(e.target.value)} disabled={!models.length||busy}><option value="" disabled>{loading?"Connecting…":"Choose model"}</option>{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>{busy?<button className="chat-send stop" type="button" aria-label="Stop response" onClick={()=>controller.current?.abort()}><Square size={15}/></button>:<button className="chat-send" type="submit" aria-label="Send message" disabled={!ready||!draft.trim()}><ArrowUp size={19}/></button>}</div></form>
   <div className="chat-footnote"><span>{connection?.planEnabled?"Using ChatGPT plan":"Connect ChatGPT to send"} · No API billing fallback</span><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">Manage usage <ArrowUpRight size={11}/></a></div>
  </div><aside className="chat-brief"><span className="eyebrow">ON THE DESK</span><h3>{report.name}</h3><p>{report.focus||"Evidence-led investment diligence."}</p><div className="chat-report-progress"><span>{completed} / {report.chapters.length} chapters saved</span><div><i style={{width:`${completed/report.chapters.length*100}%`}}/></div></div><h4>Build your report</h4><div className="chat-chapter-list">{report.chapters.map((c,i)=><button key={c.id} onClick={()=>chapterPrompt(c.title)} disabled={busy}><span>{c.body?<Check size={12}/>:String(i+1).padStart(2,"0")}</span>{c.title}<Plus size={12}/></button>)}</div><div className="chat-privacy"><ShieldCheck size={17}/><p>Chats stay on this computer. Your messages, brief, report excerpt and recent history are sent to OpenAI when you send a message or generate a report. Review saved chapters against their sources.</p></div><div className="chat-utility"><button disabled={busy} onClick={()=>void refresh()}><RefreshCw size={13}/>Refresh connection</button>{messages.length>0&&<button onClick={()=>downloadChat(`${report.name}-conversation.md`,messages.map(m=>`## ${m.role==="user"?"You":"Meridian"}${m.status==="interrupted"?" (interrupted)":""}\n\n${m.text}`).join("\n\n---\n\n"))}><Download size={13}/>Export conversation</button>}{connection?.connected&&<button disabled={busy||connecting} onClick={()=>connect()}><Plus size={13}/>Connect another account</button>}</div></aside></div>
  <dialog ref={dialog} className="modal import-modal" onCancel={()=>setSaveText("")}><div className="modal-top"><div><span className="eyebrow">REVIEW BEFORE SAVING</span><h2>Add this answer to your report</h2></div><button className="icon-btn" aria-label="Close save dialog" onClick={()=>setSaveText("")}><X size={20}/></button></div><p className="modal-intro">{preview?.fallback?"No chapter headings matched. This answer will replace the Investment committee memo chapter.":`${preview?.matched||0} chapters recognized. Saving replaces those chapters; other chapters stay as they are.`}</p><p className="chat-save-summary">{wordCount(saveText).toLocaleString()} words · Sources are preserved as supplied. Review them against the originals.</p><textarea aria-label="Answer to save" value={saveText} onChange={e=>setSaveText(e.target.value)} maxLength={700000} rows={12}/>{saveError&&<p className="error-box">{saveError}</p>}<div className="confirm-actions"><button className="secondary" onClick={()=>setSaveText("")}>Cancel</button><button className="primary" disabled={saving||saveText.trim().length<100} onClick={async()=>{setSaving(true);try{await onImport(saveText);setSaveText("");notify("Answer saved to your report. Review its chapter and sources.");}catch(e){setSaveError((e as Error).message);}finally{setSaving(false);}}}>{saving?<LoaderCircle size={15} className="spin"/>:<Check size={15}/>}Save to report</button></div></dialog>
 </section>;
}
