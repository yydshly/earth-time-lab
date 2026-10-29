import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {globeLessons} from './dist/globe-lessons-data.mjs';

const port=Number(process.env.PORT||4318);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid local port.');
const base=`http://127.0.0.1:${port}`;
const manifestPath=new URL('./dist/globe-lessons-audio.json',import.meta.url);
const temporaryPath=new URL(`./dist/globe-lessons-audio.json.${process.pid}.tmp`,import.meta.url);
const hash=text=>createHash('sha256').update(text).digest('hex');
const isAudioPath=value=>typeof value==='string'&&/^\/audio\/[a-f0-9]{64}\.mp3$/.test(value);
let manifest={version:1,provider:'MiniMax',chapters:{},stages:{}};
try{
  const saved=JSON.parse(await readFile(manifestPath,'utf8'));
  if(saved.version===1&&saved.chapters&&typeof saved.chapters==='object')manifest={...saved,stages:saved.stages||{}};
}catch(error){if(error.code!=='ENOENT')throw new Error('Cannot read globe lesson audio manifest.');}

async function requestJson(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(240000)});
  let result;
  try{result=await response.json();}catch{throw new Error('Local voice service did not return JSON.');}
  if(!response.ok)throw new Error(typeof result.error==='string'?result.error:result.error?.message||result.message||'Local voice request failed.');
  return result;
}
async function available(entry){
  if(!isAudioPath(entry?.audioUrl)||!(entry.durationMs>0))return false;
  try{
    const response=await fetch(`${base}${entry.audioUrl}`,{method:'HEAD',signal:AbortSignal.timeout(10000)});
    return response.ok&&response.headers.get('content-type')?.startsWith('audio/mpeg')&&Number(response.headers.get('content-length'))>100;
  }catch{return false;}
}

const filters=process.argv.slice(2);
const unknown=filters.filter(id=>!globeLessons.some(lesson=>lesson.id===id));
if(unknown.length)throw new Error(`Unknown lesson ids: ${unknown.join(', ')}`);
const lessons=filters.length?globeLessons.filter(lesson=>filters.includes(lesson.id)):globeLessons;
const stages=lessons.flatMap(lesson=>lesson.stages.map((stage,index)=>({lesson,stage,index,key:`${lesson.id}:${index}`})));
if(!stages.length)throw new Error('No globe lesson stages to generate.');
if(new Set(globeLessons.map(lesson=>lesson.id)).size!==globeLessons.length)throw new Error('Duplicate globe lesson ids.');
for(const {stage,key} of stages){
  if(typeof stage.narration!=='string'||!stage.narration.trim()||stage.narration.length>9000)throw new Error(`Invalid narration: ${key}`);
}
const status=await requestJson(`${base}/api/voice/status`);
if(!status.configured)throw new Error('MiniMax is not configured.');
console.log(JSON.stringify({event:'start',lessons:lessons.length,stages:stages.length,characters:stages.reduce((n,{stage})=>n+[...stage.narration].length,0),model:status.model,voiceId:status.voiceId}));

async function generateAudio({narration,chapterId,existing,metadata,key}){
  const textHash=hash(narration);
  if(existing?.textHash===textHash&&existing.model===status.model&&existing.voiceId===status.voiceId&&await available(existing)){
    console.log(JSON.stringify({event:'audio',id:key,seconds:Math.round(existing.durationMs/1000),cached:true,elapsed:0}));
    return {...existing,...metadata};
  }
  const started=Date.now();
  const result=await requestJson(`${base}/api/voice/synthesize`,{
    method:'POST',headers:{'content-type':'application/json',origin:base},
    body:JSON.stringify({chapterId,text:narration,model:status.model,voiceId:status.voiceId})
  });
  if(!isAudioPath(result.audioUrl)||!(result.durationMs>0)||result.model!==status.model||result.voiceId!==status.voiceId)throw new Error(`Invalid audio result: ${key}`);
  console.log(JSON.stringify({event:'audio',id:key,seconds:Math.round(result.durationMs/1000),cached:result.cached,elapsed:Math.round((Date.now()-started)/1000)}));
  return {...result,...metadata,textHash,generatedAt:new Date().toISOString()};
}
async function saveManifest(){
  manifest.updatedAt=new Date().toISOString();
  await writeFile(temporaryPath,JSON.stringify(manifest,null,2));
  await rename(temporaryPath,manifestPath);
}
for(const {lesson,stage,index,key} of stages){
  const previous=manifest.stages[key];
  const metadata={lessonId:lesson.id,stageId:stage.id,stageIndex:index,title:stage.label};
  manifest.stages[key]=await generateAudio({narration:stage.narration,chapterId:`${lesson.id}-stage-${index}`,existing:previous,metadata,key});
  if(stage.voiceCues)manifest.stages[key].cues=previous?.cues||[];
  await saveManifest();
  if(stage.voiceCues){
    const cueEntries=[];
    for(const cue of stage.voiceCues){
      const existing=previous?.cues?.find(entry=>entry.id===cue.id);
      const entry=await generateAudio({narration:cue.narration,chapterId:`${lesson.id}-stage-${index}-${cue.id}`,existing,metadata:{...metadata,id:cue.id,fromMinutes:cue.fromMinutes,toMinutes:cue.toMinutes},key:`${key}:${cue.id}`});
      cueEntries.push(entry);
      manifest.stages[key].cues=[...cueEntries];
      await saveManifest();
    }
  }
}
const ready=globeLessons.flatMap(lesson=>lesson.stages.map((stage,index)=>manifest.stages[`${lesson.id}:${index}`])).filter(Boolean);
console.log(JSON.stringify({event:'complete',ready:ready.length,minutes:Math.round(ready.reduce((n,entry)=>n+entry.durationMs,0)/60000)}));
