import {createHash} from 'node:crypto';
import {createReadStream,constants} from 'node:fs';
import {copyFile,lstat,mkdir,readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const PUBLIC_AUDIO_MANIFESTS=Object.freeze([
  'tour-audio.json','globe-lessons-audio.json','routine-atlas-audio.json',
  'human-time-audio.json','reset-time-audio.json'
]);
const projectRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const reference=/^\/audio\/([a-f\d]{64}\.mp3)$/;

export class AudioExportError extends Error{
  constructor(code,message){super(message);this.name='AudioExportError';this.code=code;}
}
const fail=(code,message)=>{throw new AudioExportError(code,message);};
function within(candidate,base){const relative=path.relative(base,candidate);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
function overlaps(a,b){return within(a,b)||within(b,a);}
async function inspect(file){try{return await lstat(file);}catch(error){if(error.code==='ENOENT')return null;fail('PATH_UNAVAILABLE','无法检查文件或目录，请核对权限。');}}
async function plainDirectory(directory,label){const info=await inspect(directory);if(!info?.isDirectory()||info.isSymbolicLink())fail('INVALID_SOURCE',`${label}必须是实际目录，不能是目录链接。`);}

// Resolve every existing ancestor. Directory links and junctions must not bypass
// the protected source boundary, even when the final output directory is new.
async function outputLocation(value){
  const absolute=path.resolve(value);let cursor=absolute,nearest=null;const suffix=[];
  for(;;){
    const info=await inspect(cursor);
    if(info){
      if(info.isSymbolicLink())fail('OUTPUT_LINK','输出路径不能经过符号链接或目录联接。');
      if(!info.isDirectory())fail('OUTPUT_NOT_DIRECTORY','输出路径或其父路径不是目录。');
      if(!nearest)nearest={directory:cursor,suffix:[...suffix]};
    }else if(!nearest)suffix.unshift(path.basename(cursor));
    const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;
  }
  if(!nearest)fail('OUTPUT_UNAVAILABLE','无法解析输出位置。');
  try{return path.resolve(await realpath(nearest.directory),...nearest.suffix);}catch{fail('OUTPUT_UNAVAILABLE','无法解析输出位置。');}
}
function protectOutput(out,root){
  if(within(root,out)||within(out,root)&&!within(out,path.join(root,'.release'))
    ||[path.join(root,'dist'),path.join(root,'.voice-cache')].some(source=>overlaps(out,source)))
    fail('PROTECTED_OUTPUT','输出不得覆盖项目、源码、dist 或原音频缓存；项目内请使用 .release 下的独立目录。');
}
async function checksum(file){
  try{const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');}
  catch{fail('READ_FAILED','无法读取音频进行完整性校验。');}
}
function collectReferences(value,names){
  if(!value||typeof value!=='object')return;
  if(Object.hasOwn(value,'audioUrl')){
    const match=typeof value.audioUrl==='string'&&reference.exec(value.audioUrl);
    if(!match)fail('INVALID_REFERENCE','固定课程索引中有无效的音频引用，已停止导出。');
    names.add(match[1]);
  }
  for(const child of Object.values(value))collectReferences(child,names);
}

/** Export only fixed-course MP3s. Source metadata and dynamic cache entries stay local. */
export async function exportPublicAudio({projectDir=projectRoot,outDir=path.join(projectDir,'.release','public-audio','audio')}={}){
  let root;try{root=await realpath(path.resolve(projectDir));}catch{fail('INVALID_PROJECT','无法读取项目目录。');}
  const dist=path.join(root,'dist'),cache=path.join(root,'.voice-cache');
  await plainDirectory(dist,'课程索引目录');await plainDirectory(cache,'原音频缓存目录');
  const out=await outputLocation(outDir);protectOutput(out,root);
  const names=new Set();
  for(const manifest of PUBLIC_AUDIO_MANIFESTS){
    const file=path.join(dist,manifest),info=await inspect(file);
    if(!info?.isFile()||info.isSymbolicLink()||info.size>10*1024*1024)fail('INVALID_MANIFEST',`固定课程索引不可用：${manifest}`);
    let document;try{document=JSON.parse(await readFile(file,'utf8'));}catch{fail('INVALID_MANIFEST',`固定课程索引无法解析：${manifest}`);}
    const ownNames=new Set();collectReferences(document,ownNames);
    if(!ownNames.size)fail('EMPTY_MANIFEST',`固定课程索引没有音频引用：${manifest}`);
    for(const name of ownNames)names.add(name);
  }
  const plan=[];
  // Preflight every source and destination before creating or copying anything.
  for(const name of [...names].sort()){
    const source=path.join(cache,name),target=path.join(out,name),info=await inspect(source);
    if(!info?.isFile()||info.isSymbolicLink()||info.size<4)fail('MISSING_AUDIO',`固定课程音频缺失或不是实际文件：${name}`);
    const hash=await checksum(source),existing=await inspect(target);
    if(existing&&(!existing.isFile()||existing.isSymbolicLink()||existing.size!==info.size||await checksum(target)!==hash))
      fail('OUTPUT_CONFLICT',`输出中存在不同内容，未覆盖：${name}`);
    plan.push({source,target,name,hash,bytes:info.size,reuse:Boolean(existing)});
  }
  try{await mkdir(out,{recursive:true});}catch{fail('OUTPUT_UNAVAILABLE','无法创建输出目录，请核对权限和磁盘空间。');}
  if(await outputLocation(out)!==out)fail('OUTPUT_CHANGED','输出位置发生变化，已停止导出。');
  let copied=0,reused=0;
  for(const item of plan){
    if(item.reuse){reused++;continue;}
    try{await copyFile(item.source,item.target,constants.COPYFILE_EXCL);}
    catch(error){
      if(error.code==='EEXIST'){
        const existing=await inspect(item.target);
        if(existing?.isFile()&&!existing.isSymbolicLink()&&existing.size===item.bytes&&await checksum(item.target)===item.hash){reused++;continue;}
        fail('OUTPUT_CONFLICT',`输出中出现同名冲突，未覆盖：${item.name}`);
      }
      fail('COPY_FAILED','无法复制固定课程音频，请核对权限和磁盘空间；已有文件未删除。');
    }
    if(await checksum(item.target)!==item.hash)fail('COPY_VERIFICATION_FAILED',`复制后校验失败：${item.name}；已有文件未删除。`);
    copied++;
  }
  return {files:plan.length,copied,reused,bytes:plan.reduce((sum,item)=>sum+item.bytes,0)};
}

export function parseExportArgs(args){
  let outDir;
  for(let index=0;index<args.length;index++){
    const arg=args[index];
    if(arg==='--help'||arg==='-h')return {help:true};
    const value=arg==='--out'?args[++index]:arg.startsWith('--out=')?arg.slice(6):null;
    if(value===null||!value||value.startsWith('--')||outDir!==undefined)fail('INVALID_ARGUMENTS','用法：node scripts/export-public-audio.mjs [--out 输出目录]');
    outDir=path.resolve(value);
  }
  return outDir===undefined?{}:{outDir};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const options=parseExportArgs(process.argv.slice(2));
    if(options.help)console.log('用法：node scripts/export-public-audio.mjs [--out 输出目录]\n默认导出到项目内 .release/public-audio/audio；仅复制五份固定课程索引引用的 MP3，不删除或覆盖不同内容。');
    else console.log(JSON.stringify(await exportPublicAudio(options)));
  }catch(error){
    console.error(error instanceof AudioExportError?`${error.code}: ${error.message}`:'EXPORT_FAILED: 音频导出未完成，请核对权限和磁盘空间。');process.exitCode=1;
  }
}
