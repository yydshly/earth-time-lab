import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {globeLessons} from './dist/globe-lessons-data.mjs';

const port=Number(process.env.PORT||4318);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid local port.');
const base=`http://127.0.0.1:${port}`;
const manifest=JSON.parse(await readFile(new URL('./dist/globe-lessons-audio.json',import.meta.url),'utf8'));
const statusResponse=await fetch(`${base}/api/voice/status`,{signal:AbortSignal.timeout(10000)});
if(!statusResponse.ok)throw new Error('Local voice service is unavailable.');
const status=await statusResponse.json();
const errors=[],ids=new Set();let totalSeconds=0,totalBytes=0;
const stages=globeLessons.flatMap(lesson=>lesson.stages.map((stage,index)=>({lesson,stage,index,key:`${lesson.id}:${index}`})));
const audioItems=stages.flatMap(item=>[item,...(item.stage.voiceCues||[]).map((cue,cueIndex)=>({...item,cue,cueIndex,key:`${item.key}:${cue.id}`}))]);
for(const {lesson,stage,index,key,cue,cueIndex} of audioItems){
  if(ids.has(key))errors.push(`Duplicate stage: ${key}`);
  ids.add(key);
  const narration=cue?.narration||stage.narration;
  if(typeof narration!=='string'||!narration.trim()){errors.push(`Empty narration: ${key}`);continue;}
  const stageEntry=manifest.stages?.[`${lesson.id}:${index}`];
  const audio=cue?stageEntry?.cues?.[cueIndex]:stageEntry;
  if(!audio){errors.push(`Missing audio: ${key}`);continue;}
  if(audio.textHash!==createHash('sha256').update(narration).digest('hex'))errors.push(`Narration changed: ${key}`);
  if(audio.lessonId!==lesson.id||audio.stageId!==stage.id||audio.stageIndex!==index)errors.push(`Scene identity mismatch: ${key}`);
  if(cue&&(audio.id!==cue.id||audio.fromMinutes!==cue.fromMinutes||audio.toMinutes!==cue.toMinutes))errors.push(`Cue timeline mismatch: ${key}`);
  if(!cue&&stage.voiceCues&&audio.cues?.length!==stage.voiceCues.length)errors.push(`Cue count mismatch: ${key}`);
  if(audio.model!==status.model||audio.voiceId!==status.voiceId)errors.push(`Voice settings differ: ${key}`);
  if(!/^\/audio\/[a-f0-9]{64}\.mp3$/.test(audio.audioUrl)){errors.push(`Unexpected audio path: ${key}`);continue;}
  try{
    const response=await fetch(`${base}${audio.audioUrl}`,{headers:{Range:'bytes=0-2047'},signal:AbortSignal.timeout(10000)});
    const bytes=new Uint8Array(await response.arrayBuffer());
    const mp3=bytes.length>=3&&((bytes[0]===73&&bytes[1]===68&&bytes[2]===51)||(bytes[0]===255&&(bytes[1]&224)===224));
    if(response.status!==206||!response.headers.get('content-type')?.startsWith('audio/mpeg')||!mp3)errors.push(`HTTP audio/range check failed: ${key}`);
    const file=fileURLToPath(new URL(`./.voice-cache/${audio.audioUrl.split('/').pop()}`,import.meta.url));
    const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_name','-of','json',file],{encoding:'utf8',windowsHide:true}));
    const duration=Number(info.format.duration),size=Number(info.format.size);
    if(!Number.isFinite(duration)||duration<5||info.streams[0]?.codec_name!=='mp3')errors.push(`Invalid audio encoding: ${key}`);
    if(Math.abs(duration-audio.durationMs/1000)>3)errors.push(`Duration mismatch: ${key}`);
    totalSeconds+=duration;totalBytes+=size;
  }catch{errors.push(`Cannot retrieve or decode audio: ${key}`);}
}
const playbackMs=stages.reduce((sum,{stage,key})=>sum+(stage.voiceCues?(manifest.stages?.[key]?.cues||[]).reduce((n,cue)=>n+(cue.durationMs||0),0):(manifest.stages?.[key]?.durationMs||0)),0);
console.log(JSON.stringify({lessons:globeLessons.length,stages:stages.length,audioFiles:audioItems.length,cueFiles:audioItems.length-stages.length,minutes:Math.round(playbackMs/60000),decodedMinutes:Math.round(totalSeconds/60),megabytes:Number((totalBytes/1024/1024).toFixed(2)),errors},null,2));
if(errors.length)process.exitCode=1;
