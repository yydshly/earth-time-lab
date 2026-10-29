import {readFile,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {tourChapters,tourSources,narrationText} from './dist/tour-data.mjs';
const manifest=JSON.parse(await readFile(new URL('./dist/tour-audio.json',import.meta.url),'utf8'));
const sourceIds=new Set(tourSources.map(s=>s.id)),ids=new Set(),errors=[];
let totalSeconds=0,totalBytes=0;
for(const c of tourChapters){
  if(ids.has(c.id))errors.push(`Duplicate chapter: ${c.id}`);ids.add(c.id);
  if(!c.sourceIds?.length||c.sourceIds.some(id=>!sourceIds.has(id)))errors.push(`Unresolved sources: ${c.id}`);
  if(!c.paragraphs?.every(p=>p.heading&&p.text)||!narrationText(c).trim())errors.push(`Empty narration: ${c.id}`);
  const audio=manifest.chapters[c.id];
  if(!audio){errors.push(`Missing audio: ${c.id}`);continue;}
  if(audio.textHash!==createHash('sha256').update(narrationText(c)).digest('hex'))errors.push(`Narration changed: ${c.id}`);
  if(!/^\/audio\/[a-f0-9]{64}\.mp3$/.test(audio.audioUrl)){errors.push(`Unexpected audio path: ${c.id}`);continue;}
  const file=fileURLToPath(new URL(`./.voice-cache/${audio.audioUrl.split('/').pop()}`,import.meta.url));
  try{const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_name,sample_rate,channels','-of','json',file],{encoding:'utf8',windowsHide:true}));
    const duration=Number(info.format.duration),size=Number(info.format.size);
    if(!Number.isFinite(duration)||duration<10||info.streams[0]?.codec_name!=='mp3')errors.push(`Invalid audio: ${c.id}`);
    if(Math.abs(duration-audio.durationMs/1000)>3)errors.push(`Duration mismatch: ${c.id}`);
    totalSeconds+=duration;totalBytes+=size;
  }catch{errors.push(`Cannot decode audio: ${c.id}`);}
}
console.log(JSON.stringify({chapters:tourChapters.length,audioFiles:Object.keys(manifest.chapters).length,sources:tourSources.length,minutes:Math.round(totalSeconds/60),megabytes:Math.round(totalBytes/1024/1024),errors},null,2));
if(errors.length)process.exitCode=1;
