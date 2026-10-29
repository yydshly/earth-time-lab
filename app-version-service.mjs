import {createHash} from 'node:crypto';
import {readdir,stat,readFile} from 'node:fs/promises';
import path from 'node:path';

// Release-facing modules, styles and entry documents only. Audio manifests,
// configuration, generated audio and assets are intentionally outside this ID.
export function isVersionedAppFile(entry){
  return entry?.isFile?.()===true&&!entry.name.startsWith('.')&&/\.(?:html|mjs|css)$/i.test(entry.name);
}

export function appContentVersion(files){
  const hash=createHash('sha256');
  for(const {name,content}of [...files].sort((a,b)=>a.name.localeCompare(b.name,'en'))){
    const bytes=Buffer.isBuffer(content)?content:Buffer.from(content);
    hash.update(name);hash.update('\0');hash.update(String(bytes.length));hash.update('\0');hash.update(bytes);hash.update('\0');
  }
  return hash.digest('hex').slice(0,12);
}

export function createAppVersionService({root,files={readdir,stat,readFile}}={}){
  if(typeof root!=='string'||!root)throw new TypeError('A published application directory is required.');
  const resolvedRoot=path.resolve(root);
  let cachedFingerprint='',cachedVersion='',pending=null;
  async function readVersion(){
    const entries=(await files.readdir(resolvedRoot,{withFileTypes:true})).filter(isVersionedAppFile).sort((a,b)=>a.name.localeCompare(b.name,'en'));
    const infos=await Promise.all(entries.map(async entry=>({name:entry.name,...await files.stat(path.join(resolvedRoot,entry.name))})));
    const fingerprint=infos.map(info=>`${info.name}:${info.size}:${info.mtimeMs}`).join('|');
    if(cachedVersion&&fingerprint===cachedFingerprint)return cachedVersion;
    const contents=await Promise.all(entries.map(async entry=>({name:entry.name,content:await files.readFile(path.join(resolvedRoot,entry.name))})));
    cachedVersion=appContentVersion(contents);cachedFingerprint=fingerprint;
    return cachedVersion;
  }
  return {async getVersion(){
    if(!pending)pending=readVersion().finally(()=>{pending=null;});
    return pending;
  }};
}
