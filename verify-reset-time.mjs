import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resetLessons} from './dist/reset-time-data.mjs';

const port=Number(process.env.PORT||4318);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid local port.');
const base=`http://127.0.0.1:${port}`;
const manifest=JSON.parse(await readFile(new URL('./dist/reset-time-audio.json',import.meta.url),'utf8'));
if(manifest.version!==1||manifest.provider!=='MiniMax'||!manifest.lessons)throw new Error('Invalid reset-time audio manifest.');
const statusResponse=await fetch(`${base}/api/voice/status`,{signal:AbortSignal.timeout(10000)});
if(!statusResponse.ok)throw new Error('Local voice service is unavailable.');
const status=await statusResponse.json(),errors=[],ids=new Set();let totalSeconds=0,totalBytes=0;
for(const lesson of resetLessons) {
  const id=lesson.id,entry=manifest.lessons[id];
  if(ids.has(id))errors.push(`Duplicate lesson: ${id}`);ids.add(id);
  if(!entry){errors.push(`Missing audio: ${id}`);continue;}
  if(entry.id!==id)errors.push(`Lesson identity mismatch: ${id}`);
  if(entry.textHash!==createHash('sha256').update(lesson.narration).digest('hex'))errors.push(`Narration changed: ${id}`);
  if(entry.model!==status.model||entry.voiceId!==status.voiceId)errors.push(`Voice settings differ: ${id}`);
  if(entry.title!==lesson.title)errors.push(`Lesson title mismatch: ${id}`);
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
console.log(JSON.stringify({lessons:resetLessons.length,seconds:Number(totalSeconds.toFixed(3)),megabytes:Number((totalBytes/1024/1024).toFixed(2)),errors},null,2));
if(errors.length)process.exitCode=1;
