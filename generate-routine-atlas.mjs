import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {routineProfiles} from './dist/routine-atlas-data.mjs';

const port=Number(process.env.PORT||4318);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid local port.');
const base=`http://127.0.0.1:${port}`;
const manifestPath=new URL('./dist/routine-atlas-audio.json',import.meta.url);
const temporaryPath=new URL(`./dist/routine-atlas-audio.json.${process.pid}.tmp`,import.meta.url);
const hash=text=>createHash('sha256').update(text).digest('hex');
const isAudioPath=value=>typeof value==='string'&&/^\/audio\/[a-f0-9]{64}\.mp3$/.test(value);
let manifest={version:1,provider:'MiniMax',profiles:{}};
try {
  const saved=JSON.parse(await readFile(manifestPath,'utf8'));
  if(saved.version!==1||!saved.profiles||typeof saved.profiles!=='object')throw new Error('Unsupported routine audio manifest.');
  manifest=saved;
} catch(error) {
  if(error.code!=='ENOENT')throw new Error('Cannot read routine audio manifest.');
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

if(!Array.isArray(routineProfiles)||!routineProfiles.length)throw new Error('No routine profiles.');
if(new Set(routineProfiles.map(p=>p.cityId)).size!==routineProfiles.length)throw new Error('Duplicate routine profile ids.');
const filters=process.argv.slice(2),unknown=filters.filter(id=>!routineProfiles.some(p=>p.cityId===id));
if(unknown.length)throw new Error(`Unknown city ids: ${unknown.join(', ')}`);
const profiles=filters.length?routineProfiles.filter(p=>filters.includes(p.cityId)):routineProfiles;
for(const p of profiles)if(!/^[a-z0-9-]+$/.test(p.cityId)||typeof p.narration!=='string'||!p.narration.trim()||p.narration.length>9000)throw new Error('Invalid routine narration.');
const status=await requestJson(`${base}/api/voice/status`);
if(!status.configured)throw new Error('MiniMax is not configured.');
console.log(JSON.stringify({event:'start',profiles:profiles.length,characters:profiles.reduce((n,p)=>n+[...p.narration].length,0),model:status.model,voiceId:status.voiceId}));

for(const profile of profiles) {
  const id=profile.cityId,textHash=hash(profile.narration),existing=manifest.profiles[id];
  if(existing?.textHash===textHash&&existing.model===status.model&&existing.voiceId===status.voiceId&&await available(existing)) {
    console.log(JSON.stringify({event:'profile',cityId:id,seconds:Math.round(existing.durationMs/1000),cached:true}));
    continue;
  }
  const started=Date.now();
  const result=await requestJson(`${base}/api/voice/synthesize`,{
    method:'POST',headers:{'content-type':'application/json',origin:base},
    body:JSON.stringify({chapterId:`routine-atlas-${id}`,text:profile.narration,model:status.model,voiceId:status.voiceId})
  });
  if(!isAudioPath(result.audioUrl)||!(result.durationMs>0)||result.model!==status.model||result.voiceId!==status.voiceId)throw new Error(`Invalid audio result: ${id}`);
  manifest.profiles[id]={...result,cityId:id,title:profile.headline,textHash,generatedAt:new Date().toISOString()};
  manifest.updatedAt=new Date().toISOString();
  await writeFile(temporaryPath,JSON.stringify(manifest,null,2));
  await rename(temporaryPath,manifestPath);
  console.log(JSON.stringify({event:'profile',cityId:id,seconds:Math.round(result.durationMs/1000),cached:result.cached,elapsed:Math.round((Date.now()-started)/1000)}));
}
const entries=routineProfiles.map(p=>manifest.profiles[p.cityId]).filter(Boolean);
console.log(JSON.stringify({event:'complete',ready:entries.length,seconds:Math.round(entries.reduce((n,e)=>n+e.durationMs,0)/1000)}));
