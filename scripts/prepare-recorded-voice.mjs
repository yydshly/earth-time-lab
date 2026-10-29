import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {copyFile,lstat,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {exportPublicAudio,PUBLIC_AUDIO_MANIFESTS} from './export-public-audio.mjs';
import {tourChapters,narrationText} from '../dist/tour-data.mjs';
import {globeLessons} from '../dist/globe-lessons-data.mjs';
import {humanTimeSteps} from '../dist/human-time-data.mjs';
import {resetLessons} from '../dist/reset-time-data.mjs';
import {routineProfiles} from '../dist/routine-atlas-data.mjs';
import {walkthroughStops} from '../dist/walkthrough-model.mjs';
import {recordedNarrations} from '../dist/recorded-narrations.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const audioDir=path.join(root,'public','audio');
const sha=text=>createHash('sha256').update(text).digest('hex');
const localOrigin='http://127.0.0.1:4318';
const fileName=url=>{
  const match=/^\/?(?:\.\/)?audio\/([a-f\d]{64}\.mp3)$/.exec(url||'');
  if(!match)throw new Error('音频引用不符合公开发布格式。');return match[1];
};
async function plainDirectory(directory){
  let cursor=directory;while(path.relative(root,cursor)!==''){
    try{const info=await lstat(cursor);if(info.isSymbolicLink()||!info.isDirectory())throw new Error('公开音频输出不能经过目录链接或文件。');}catch(error){if(error.code!=='ENOENT')throw error;}
    const parent=path.dirname(cursor);if(parent===cursor)throw new Error('输出越过项目边界。');cursor=parent;
  }
  await mkdir(directory,{recursive:true});
}
async function copyVerified(source,target){
  const info=await lstat(source);if(!info.isFile()||info.isSymbolicLink())throw new Error('公开音频必须是普通文件。');
  let existing;try{existing=await lstat(target);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(existing){
    if(!existing.isFile()||existing.isSymbolicLink()||sha(await readFile(source))!==sha(await readFile(target)))throw new Error('公开输出存在不同内容或目录链接，已停止。');
    return;
  }
  await copyFile(source,target,constants.COPYFILE_EXCL);
}
async function json(endpoint,options){
  for(let attempt=0;attempt<3;attempt++){
    const response=await fetch(new URL(endpoint,localOrigin),options);const data=await response.json();
    if(response.ok)return data;
    const providerRateLimit=data.code==='MINIMAX_REJECTED'&&/状态\s*1002/.test(String(data.error?.message||data.error||''));
    const retryable=providerRateLimit||['MINIMAX_CONNECTION_FAILED','MINIMAX_HTTP_ERROR','MINIMAX_RATE_LIMIT'].includes(data.code)||response.status===429;
    if(retryable&&attempt<2){console.log(`Retrying public recording after transient ${data.code||response.status}`);await new Promise(resolve=>setTimeout(resolve,(providerRateLimit?5000:2000)*(attempt+1)));continue;}
    throw new Error(`${data.code||response.status}: ${data.error?.message||data.error||'本机语音服务未能完成准备。'}`);
  }
}
const fixed=[];
function collect(value,id){
  if(!value||typeof value!=='object')return;
  if(typeof value.audioUrl==='string'&&/^[a-f\d]{64}$/.test(value.textHash||''))fixed.push({id:`fixed:${id}`,textHash:value.textHash,audioUrl:`audio/${fileName(value.audioUrl)}`,durationMs:value.durationMs,model:value.model,voiceId:value.voiceId});
  for(const [key,child]of Object.entries(value))if(child&&typeof child==='object')collect(child,`${id}/${key}`);
}
const requests=[];
const add=(id,text)=>{if(typeof text==='string'&&text.trim())requests.push({id,text:text.trim()});};
for(const chapter of tourChapters)add(`tour:${chapter.id}`,narrationText(chapter));
for(const lesson of globeLessons)for(const stage of lesson.stages){
  for(const cue of stage.voiceCues||[stage])add(`lesson:${lesson.id}/${stage.id}/${cue.id||'full'}`,cue.narration);
}
for(const step of humanTimeSteps)for(const cue of step.voiceCues||[step])add(`human:${step.id}/${cue.id||'full'}`,cue.narration);
for(const lesson of resetLessons)add(`reset:${lesson.id}`,lesson.narration);
for(const profile of routineProfiles)add(`routine-background:${profile.cityId}`,profile.narration);
for(const stop of walkthroughStops)for(const part of stop.parts)if(part.player==='guide')add(`walkthrough:${stop.id}`,part.text);
for(const recording of recordedNarrations)add(recording.id,recording.text);

await exportPublicAudio();
await plainDirectory(audioDir);
for(const name of PUBLIC_AUDIO_MANIFESTS)collect(JSON.parse(await readFile(path.join(root,'dist',name),'utf8')),name);
for(const entry of fixed)await copyVerified(path.join(root,'.release','public-audio','audio',fileName(entry.audioUrl)),path.join(audioDir,fileName(entry.audioUrl)));
const config=await json('/api/voice/status');
if(!config.configured)throw new Error('请先在本机配置 MiniMax，再进行一次性预录；不会把密钥写入公开文件。');
const byHash=new Map(fixed.filter(entry=>entry.model===config.model&&entry.voiceId===config.voiceId).map(entry=>[entry.textHash,entry]));
const recordings=[...fixed];let generated=0;
for(const [index,request]of requests.entries()){
  const textHash=sha(request.text);let entry=byHash.get(textHash);
  if(!entry){
    const clip=await json('/api/voice/synthesize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chapterId:`public-recording-${request.id}`,text:request.text,model:config.model,voiceId:config.voiceId})});
    const name=fileName(clip.audioUrl);await copyVerified(path.join(root,'.voice-cache',name),path.join(audioDir,name));
    entry={textHash,audioUrl:`audio/${name}`,durationMs:clip.durationMs,model:config.model,voiceId:config.voiceId};byHash.set(textHash,entry);generated++;
  }
  recordings.push({...entry,id:request.id,text:request.text});
  const output={version:1,provider:'MiniMax',model:config.model,voiceId:config.voiceId,region:config.region,recordings};
  // Save verified progress after each public recording, so reruns reuse it safely.
  await writeFile(path.join(root,'public','recorded-voice.json'),JSON.stringify(output,null,2)+'\n');
  if((index+1)%10===0||index>=requests.length-recordedNarrations.length)console.log(`Prepared ${index+1}/${requests.length}; newly resolved ${generated}`);
}
console.log(`Public recorded speech ready: ${byHash.size} text hashes; no runtime key required.`);
