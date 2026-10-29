import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {narrationText} from './dist/tour-narration.mjs';
const base=`http://127.0.0.1:${process.env.PORT||4318}`;
const manifestPath=new URL('./dist/tour-audio.json',import.meta.url);
let manifest={version:1,provider:'MiniMax',chapters:{}};
try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch{}
const status=await (await fetch(`${base}/api/voice/status`)).json();
if(!status.configured)throw new Error('MiniMax is not configured.');
const filters=process.argv.slice(2).filter(v=>!v.startsWith('--'));
const {tourChapters}=await import('./dist/tour-data.mjs');
const chapters=filters.length?tourChapters.filter(c=>filters.includes(c.id)||filters.includes(c.type)):tourChapters;
console.log(JSON.stringify({event:'start',chapters:chapters.length,characters:chapters.reduce((n,c)=>n+narrationText(c).length,0),model:status.model,voiceId:status.voiceId}));
for(const [i,c] of chapters.entries()){
  const text=narrationText(c);
  if(text.length>9000)throw new Error(`Chapter too long: ${c.id}`);
  const started=Date.now();
  const response=await fetch(`${base}/api/voice/synthesize`,{method:'POST',headers:{'content-type':'application/json','origin':base},body:JSON.stringify({chapterId:c.id,text,model:status.model,voiceId:status.voiceId}),signal:AbortSignal.timeout(240000)});
  const result=await response.json();
  if(!response.ok)throw new Error(`Chapter ${c.id}: ${typeof result.error==='string'?result.error:result.error?.message||result.message||'synthesis failed'}`);
  if(!result.audioUrl||!(result.durationMs>0))throw new Error(`Invalid audio result: ${c.id}`);
  manifest.chapters[c.id]={...result,title:c.title,textHash:createHash('sha256').update(text).digest('hex'),generatedAt:new Date().toISOString()};
  manifest.updatedAt=new Date().toISOString();
  await writeFile(new URL('./dist/tour-audio.json.tmp',import.meta.url),JSON.stringify(manifest,null,2));
  await rename(new URL('./dist/tour-audio.json.tmp',import.meta.url),manifestPath);
  console.log(JSON.stringify({event:'chapter',number:i+1,total:chapters.length,id:c.id,title:c.title,seconds:Math.round(result.durationMs/1000),cached:result.cached,elapsed:Math.round((Date.now()-started)/1000)}));
}
console.log(JSON.stringify({event:'complete',ready:Object.keys(manifest.chapters).length,minutes:Math.round(Object.values(manifest.chapters).reduce((n,c)=>n+c.durationMs,0)/60000)}));
