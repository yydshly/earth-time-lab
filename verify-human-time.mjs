import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {humanTimeSteps} from './dist/human-time-data.mjs';

const port=Number(process.env.PORT||4318);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid local port.');
const base=`http://127.0.0.1:${port}`;
const manifest=JSON.parse(await readFile(new URL('./dist/human-time-audio.json',import.meta.url),'utf8'));
if(manifest.version!==1||manifest.provider!=='MiniMax'||!manifest.steps)throw new Error('Invalid human-time audio manifest.');
const filters=process.argv.slice(2),unknown=filters.filter(id=>!humanTimeSteps.some(step=>step.id===id));
if(unknown.length)throw new Error(`Unknown step ids: ${unknown.join(', ')}`);
const steps=filters.length?humanTimeSteps.filter(step=>filters.includes(step.id)):humanTimeSteps;
const statusResponse=await fetch(`${base}/api/voice/status`,{signal:AbortSignal.timeout(10000)});
if(!statusResponse.ok)throw new Error('Local voice service is unavailable.');
const status=await statusResponse.json(),errors=[],ids=new Set();let totalSeconds=0,totalBytes=0;
const audioItems=steps.flatMap(step=>[{step},...(step.voiceCues||[]).map((cue,cueIndex)=>({step,cue,cueIndex}))]);
for(const {step,cue,cueIndex} of audioItems) {
  const id=cue?`${step.id}:${cue.id}`:step.id,stepEntry=manifest.steps[step.id],entry=cue?stepEntry?.cues?.[cueIndex]:stepEntry,narration=cue?.narration||step.narration;
  if(ids.has(id))errors.push(`Duplicate step: ${id}`);ids.add(id);
  if(!entry){errors.push(`Missing audio: ${id}`);continue;}
  if(entry.id!==(cue?.id||step.id)||cue&&entry.stepId!==step.id)errors.push(`Step identity mismatch: ${id}`);
  if(entry.textHash!==createHash('sha256').update(narration).digest('hex'))errors.push(`Narration changed: ${id}`);
  if(entry.model!==status.model||entry.voiceId!==status.voiceId)errors.push(`Voice settings differ: ${id}`);
  if(entry.title!==(cue?.label||step.title))errors.push(`Step title mismatch: ${id}`);
  if(cue&&(entry.fromMinutes!==cue.fromMinutes||entry.toMinutes!==cue.toMinutes))errors.push(`Cue timeline mismatch: ${id}`);
  if(!cue&&step.voiceCues&&entry.cues?.length!==step.voiceCues.length)errors.push(`Cue count mismatch: ${id}`);
  if(!/^\/audio\/[a-f0-9]{64}\.mp3$/.test(entry.audioUrl)){errors.push(`Unexpected audio path: ${id}`);continue;}
  try {
    const response=await fetch(`${base}${entry.audioUrl}`,{headers:{Range:'bytes=0-2047'},signal:AbortSignal.timeout(10000)});
    const bytes=new Uint8Array(await response.arrayBuffer());
    const mp3=bytes.length>=3&&((bytes[0]===73&&bytes[1]===68&&bytes[2]===51)||(bytes[0]===255&&(bytes[1]&224)===224));
    if(response.status!==206||!response.headers.get('content-type')?.startsWith('audio/mpeg')||!mp3)errors.push(`HTTP audio/range check failed: ${id}`);
    const file=fileURLToPath(new URL(`./.voice-cache/${entry.audioUrl.split('/').pop()}`,import.meta.url));
    const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_name','-of','json',file],{encoding:'utf8',windowsHide:true}));
    const duration=Number(info.format.duration),size=Number(info.format.size);
    if(!Number.isFinite(duration)||duration<5||info.streams[0]?.codec_name!=='mp3')errors.push(`Invalid audio encoding: ${id}`);
    if(Math.abs(duration-entry.durationMs/1000)>3)errors.push(`Duration mismatch: ${id}`);
    execFileSync('ffmpeg',['-v','error','-xerror','-i',file,'-f','null','-'],{encoding:'utf8',windowsHide:true,stdio:['ignore','ignore','pipe']});
    totalSeconds+=duration;totalBytes+=size;
  }catch{errors.push(`Cannot retrieve or decode audio: ${id}`);}
}
console.log(JSON.stringify({steps:steps.length,audioFiles:audioItems.length,cueFiles:audioItems.length-steps.length,seconds:Number(totalSeconds.toFixed(3)),megabytes:Number((totalBytes/1024/1024).toFixed(2)),errors},null,2));
if(errors.length)process.exitCode=1;
