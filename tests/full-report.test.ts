import test from 'node:test';
import assert from 'node:assert/strict';
import {demos} from '../lib/demo';
import {createChapters,buildPrompt} from '../lib/research';
import {researchPacket,importedSources} from '../lib/portable-research';
import {runFullReport,validatedChapter,fullChapterPrompt,researchContext,chapterSaved} from '../lib/full-report';
import {parseAssetResolution,identityPrompt} from '../lib/asset-identity';
import {readChatResponse,type ChatMessage} from '../lib/chat-client';
import {sourceKind} from '../lib/evidence-policy';
import type {AssetType,Report,Chapter} from '../lib/types';
const fixture=(type:AssetType='crypto'):Report=>({...demos[0],id:'test-report',demo:false,type,chapters:createChapters(type)});
const answer=(chapter:Chapter):ChatMessage=>({id:chapter.id,role:'assistant',createdAt:'2026-10-19',status:'completed',text:`## ${chapter.title}\n\n${'Evidence with limitations. '.repeat(65)}[Original](https://example.com/research)`});
const signal=()=>new AbortController().signal;
test('one action completes every asset-specific chapter, preserves prior work and supplies it to the final memo',async()=>{
 for(const type of ['equity','crypto','private'] as const){
  const report=fixture(type);report.chapters[0]={...report.chapters[0],status:'completed',body:'Previously reviewed identity',sources:[]};
  let calls=0,saves=0;const events:string[]=[];
  const result=await runFullReport({report,signal:signal(),shouldPause:()=>false,generate:async(prompt,context)=>{calls++;const chapter=report.chapters[calls];assert.ok(prompt.includes(`## ${chapter.title}`));assert.ok(context.includes('Previously reviewed identity'));if(chapter.id==='memo')assert.ok(context.includes('## Evidence gaps & diligence requests'));return answer(chapter);},save:async(_,chapter)=>{saves++;events.push(chapter.id);},onProgress:p=>events.push(p.phase)});
  assert.equal(calls,report.chapters.length-1);assert.equal(saves,calls);assert.ok(result.chapters.every(chapterSaved));assert.equal(result.chapters[0].body,'Previously reviewed identity');assert.equal(result.status,'completed');assert.equal(events.at(-1),'complete');assert.equal(report.chapters[1].body,'');
 }
});
test('pause saves the current chapter and resume only generates missing chapters',async()=>{
 const report=fixture();report.chapters=report.chapters.slice(0,3);let paused=false,calls=0;
 const partial=await runFullReport({report,signal:signal(),shouldPause:()=>paused,generate:async()=>answer(report.chapters[calls++]),save:async()=>{paused=true;},onProgress:()=>{}});
 assert.equal(calls,1);assert.equal(partial.chapters.filter(chapterSaved).length,1);
 const result=await runFullReport({report:partial,signal:signal(),shouldPause:()=>false,generate:async()=>answer(report.chapters[calls++]),save:async()=>{},onProgress:()=>{}});
 assert.equal(calls,3);assert.ok(result.chapters.every(chapterSaved));
});
test('save failure stops advancement and a completed chat answer can be recovered without another inference',async()=>{
 const report=fixture();report.chapters=report.chapters.slice(0,2);let calls=0;
 await assert.rejects(runFullReport({report,signal:signal(),shouldPause:()=>false,generate:async()=>{calls++;return answer(report.chapters[0]);},save:async()=>{throw new Error('Storage offline');},onProgress:()=>{}}),/Storage offline/);
 assert.equal(calls,1);let saved=0;
 await runFullReport({report,signal:signal(),shouldPause:()=>saved>0,recover:c=>answer(c),generate:async()=>{throw new Error('Must not regenerate');},save:async()=>{saved++;},onProgress:()=>{}});
 assert.equal(saved,1);
});
test('interruption, provider limits and wrong or partial chapters never advance or save',async()=>{
 const report=fixture(),chapter=report.chapters[0];let saves=0;
 for(const bad of [{...answer(chapter),status:'interrupted' as const},answer(report.chapters[1]),{...answer(chapter),text:`## ${chapter.title}\n\nShort fragment`},{...answer(chapter),text:answer(chapter).text+'\n'+answer(report.chapters[1]).text}])assert.throws(()=>validatedChapter(report,chapter,bad));
 await assert.rejects(runFullReport({report,signal:signal(),shouldPause:()=>false,generate:async()=>{throw new Error('Plan allowance reached');},save:async()=>{saves++;},onProgress:()=>{}}),/Plan allowance/);assert.equal(saves,0);
 const abort=new AbortController();await assert.rejects(runFullReport({report,signal:abort.signal,shouldPause:()=>false,generate:async()=>{abort.abort();return answer(chapter);},save:async()=>{saves++;},onProgress:()=>{}}));assert.equal(saves,0);
});
test('report context stays bounded and identifies excerpts',()=>{const report=fixture();for(const c of report.chapters){c.status='completed';c.body='Evidence '.repeat(10000);}const context=researchContext(report);assert.equal(context.text.length,175000);assert.equal(context.truncated,true);});
test('identity classification accepts evidence-backed public, crypto and private identities without user class selection',()=>{
 for(const [type,name] of [['equity','Apple Inc.'],['crypto','Sui Network'],['private','Example Private Company']] as const){const result=parseAssetResolution(JSON.stringify({status:'resolved',candidates:[{name,symbol:name,type,description:'Exact investment identity',sources:[{title:'Primary record',url:'https://example.com/official'}]}]}));assert.equal(result.candidates[0].type,type);}
 assert.match(identityPrompt('Sui','','2026-10-19'),/Verify public\/private status/);
 assert.match(identityPrompt('Sui','','2026-10-19'),/Do not ask the user to classify/);
});
test('ambiguous identity stays unresolved; invalid classifications and unsafe evidence are rejected',()=>{
 assert.deepEqual(parseAssetResolution('{"status":"ambiguous","candidates":[]}'),{status:'ambiguous',candidates:[]});
 const candidate={name:'Mercury',symbol:'Mercury',type:'private',description:'A company',sources:[{title:'Official',url:'https://example.com'}]};
 assert.equal(parseAssetResolution(JSON.stringify({status:'ambiguous',candidates:[candidate,{...candidate,type:'crypto'}]})).candidates.length,2);
 for(const bad of ['Not JSON',JSON.stringify({status:'resolved',candidates:[]}),JSON.stringify({status:'resolved',candidates:[{...candidate,type:'unknown'}]}),JSON.stringify({status:'resolved',candidates:[{...candidate,sources:[{title:'Bad',url:'javascript:alert(1)'}]}]})])assert.throws(()=>parseAssetResolution(bad));
});
const frames=(events:unknown[])=>events.map(event=>`data: ${JSON.stringify(event)}\n\n`).join('');
function response(text:string){const bytes=new TextEncoder().encode(text);return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close();}}));}
test('fragmented streaming requires an explicit completed answer and propagates errors',async()=>{
 const message=answer(fixture().chapters[0]),events:string[]=[];
 assert.equal((await readChatResponse(response(frames([{type:'delta',text:'café'},{type:'done',message}])),event=>events.push(event.type))).id,message.id);assert.deepEqual(events,['delta','done']);
 await assert.rejects(readChatResponse(response(frames([{type:'delta',text:'Partial'}])),()=>{}),/before completion/);
 await assert.rejects(readChatResponse(response(frames([{type:'error',message:'Allowance reached'}])),()=>{}),/Allowance reached/);
 await assert.rejects(readChatResponse(response(frames([{type:'done',message:{...message,status:'interrupted'}}])),()=>{}),/before completion/);
});
test('YouTube and social evidence standards reach automatic, manual and paid research paths',()=>{
 const report=fixture();for(const prompt of [researchPacket(report),buildPrompt(report,report.chapters[4]),fullChapterPrompt(report,report.chapters[4])+researchContext(report).text]){assert.match(prompt,/YouTube/);assert.match(prompt,/public social/);assert.match(prompt,/permalinks/);assert.match(prompt,/timestamp only when verified/);assert.match(prompt,/what was accessible/);assert.match(prompt,/Corroborate/);assert.match(prompt,/inaccessible/);}
});
test('video and social links survive import and classify exact domains without spoofing',()=>{
 const sources=importedSources('[Interview](https://www.youtube.com/watch?v=abc&t=120) [Post](https://x.com/founder/status/123) [Discussion](https://www.reddit.com/r/sui/comments/abc)');assert.equal(sources.length,3);assert.equal(sourceKind(sources[0].url),'video');assert.equal(sourceKind(sources[1].url),'social');assert.equal(sourceKind(sources[2].url),'social');assert.equal(sourceKind('https://youtu.be/abc'),'video');assert.equal(sourceKind('https://youtube.com.evil.example/watch'),'web');assert.equal(sourceKind('https://notx.com/post'),'web');assert.equal(sourceKind('invalid'),'web');
});
