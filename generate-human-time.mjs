import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {humanTimeSteps} from './dist/human-time-data.mjs';

const port=Number(process.env.PORT||4318);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid local port.');
const base=`http://127.0.0.1:${port}`;
const manifestPath=new URL('./dist/human-time-audio.json',import.meta.url);
const temporaryPath=new URL(`./dist/human-time-audio.json.${process.pid}.tmp`,import.meta.url);
const hash=text=>createHash('sha256').update(text).digest('hex');
const isAudioPath=value=>typeof value==='string'&&/^\/audio\/[a-f0-9]{64}\.mp3$/.test(value);
let manifest={version:1,provider:'MiniMax',steps:{}};
try {
  const saved=JSON.parse(await readFile(manifestPath,'utf8'));
  if(saved.version!==1||saved.provider!=='MiniMax'||!saved.steps||typeof saved.steps!=='object'||Array.isArray(saved.steps))throw new Error('Unsupported human-time audio manifest.');
  manifest=saved;
} catch(error) {
  if(error.code!=='ENOENT')throw new Error('Cannot read human-time audio manifest.');
}

async function requestJson(url,options={}) {
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(240000)});
  let result;
  try{result=await response.json();}catch{throw new Error('Local voice service did not return JSON.');}
  if(!response.ok)throw new Error(typeof result.error==='string'?result.error:result.error?.message||result.message||'Local voice request failed.');
  return result;
}
async function available(entry) {
  if(!isAudioPath(entry?.audioUrl)||!(entry.durationMs>0))return false;
  try {
    const response=await fetch(`${base}${entry.audioUrl}`,{method:'HEAD',signal:AbortSignal.timeout(10000)});
    return response.ok&&response.headers.get('content-type')?.startsWith('audio/mpeg')&&Number(response.headers.get('content-length'))>100;
  }catch{return false;}
}

if(!Array.isArray(humanTimeSteps)||!humanTimeSteps.length)throw new Error('No human-time steps.');
if(new Set(humanTimeSteps.map(p=>p.id)).size!==humanTimeSteps.length)throw new Error('Duplicate human-time step ids.');
const filters=process.argv.slice(2),unknown=filters.filter(id=>!humanTimeSteps.some(p=>p.id===id));
if(unknown.length)throw new Error(`Unknown step ids: ${unknown.join(', ')}`);
const steps=filters.length?humanTimeSteps.filter(p=>filters.includes(p.id)):humanTimeSteps;
for(const p of steps)if(!/^[a-z0-9-]+$/.test(p.id)||typeof p.title!=='string'||!p.title.trim()||typeof p.narration!=='string'||!p.narration.trim()||p.narration.length>9000)throw new Error('Invalid human-time narration.');
for(const step of steps){
  if(!step.voiceCues)continue;
  if(!Array.isArray(step.voiceCues)||!step.voiceCues.length||new Set(step.voiceCues.map(cue=>cue.id)).size!==step.voiceCues.length)throw new Error(`Invalid voice cues: ${step.id}`);
  for(const cue of step.voiceCues)if(!/^[a-z0-9-]+$/.test(cue.id)||typeof cue.narration!=='string'||!cue.narration.trim()||cue.narration.length>9000||!Number.isFinite(cue.fromMinutes)||!Number.isFinite(cue.toMinutes)||cue.toMinutes<=cue.fromMinutes)throw new Error(`Invalid voice cue: ${step.id}:${cue.id}`);
}
const status=await requestJson(`${base}/api/voice/status`);
if(!status.configured)throw new Error('MiniMax is not configured.');
console.log(JSON.stringify({event:'start',steps:steps.length,cues:steps.reduce((n,p)=>n+(p.voiceCues?.length||0),0),characters:steps.reduce((n,p)=>n+[...p.narration].length+(p.voiceCues||[]).reduce((sum,cue)=>sum+[...cue.narration].length,0),0),model:status.model,voiceId:status.voiceId}));

async function generateAudio({id,narration,chapterId,existing,metadata}){
  const textHash=hash(narration);
  if(existing?.textHash===textHash&&existing.model===status.model&&existing.voiceId===status.voiceId&&await available(existing)) {
    console.log(JSON.stringify({event:'step',id:id,seconds:Math.round(existing.durationMs/1000),cached:true}));
    return {...existing,...metadata};
  }
  const started=Date.now();
  const result=await requestJson(`${base}/api/voice/synthesize`,{
    method:'POST',headers:{'content-type':'application/json',origin:base},
    body:JSON.stringify({chapterId,text:narration,model:status.model,voiceId:status.voiceId})
  });
  if(!isAudioPath(result.audioUrl)||!(result.durationMs>0)||result.model!==status.model||result.voiceId!==status.voiceId)throw new Error(`Invalid audio result: ${id}`);
  console.log(JSON.stringify({event:'step',id:id,seconds:Math.round(result.durationMs/1000),cached:result.cached,elapsed:Math.round((Date.now()-started)/1000)}));
  return {...result,...metadata,textHash,generatedAt:new Date().toISOString()};
}
async function saveManifest(){
  manifest.updatedAt=new Date().toISOString();
  await writeFile(temporaryPath,JSON.stringify(manifest,null,2));
  await rename(temporaryPath,manifestPath);
}
for(const step of steps) {
  const previous=manifest.steps[step.id];
  manifest.steps[step.id]=await generateAudio({id:step.id,narration:step.narration,chapterId:`human-time-${step.id}`,existing:previous,metadata:{id:step.id,title:step.title}});
  if(step.voiceCues)manifest.steps[step.id].cues=previous?.cues||[];
  await saveManifest();
  if(step.voiceCues){
    const cueEntries=[];
    for(const cue of step.voiceCues){
      const entry=await generateAudio({id:`${step.id}:${cue.id}`,narration:cue.narration,chapterId:`human-${step.id}-${cue.id}`,existing:previous?.cues?.find(item=>item.id===cue.id),metadata:{id:cue.id,stepId:step.id,title:cue.label,fromMinutes:cue.fromMinutes,toMinutes:cue.toMinutes}});
      cueEntries.push(entry);manifest.steps[step.id].cues=[...cueEntries];await saveManifest();
    }
  }
}
const entries=humanTimeSteps.map(p=>manifest.steps[p.id]).filter(Boolean);
const cueEntries=entries.flatMap(entry=>entry.cues||[]);
console.log(JSON.stringify({event:'complete',ready:entries.length,cueFiles:cueEntries.length,seconds:Math.round(entries.reduce((n,e)=>n+e.durationMs,0)/1000),cueSeconds:Math.round(cueEntries.reduce((n,e)=>n+e.durationMs,0)/1000)}));
