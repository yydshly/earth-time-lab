import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {copyFile,lstat,mkdir,readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PUBLIC_AUDIO_MANIFESTS} from './export-public-audio.mjs';

const projectRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const staticExtensions=new Set(['.html','.css','.mjs','.js','.json','.geojson','.svg','.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2','.ttf','.otf','.txt']);
const textExtensions=new Set(['.html','.css','.mjs','.js','.json','.geojson','.svg','.txt']);
const audioReference=/^(?:\/|\.\/|)audio\/([a-f\d]{64}\.mp3)$/;
const hiddenOrSensitive=name=>name.startsWith('.')||/(?:^|[._-])(?:secrets?|credentials?)(?:[._-]|$)|voice-settings|\.(?:pem|key|pfx|p12)$/i.test(name);
const machinePath=/(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|file:\/\/\/)|\/(?:Users|home|tmp|var\/tmp)\//;
const secretLiteral=/(?:^|["'\s])(?:sk-proj-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9_-]{24,}|eyJ[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,})/;
const secretJsonKey=/^(?:api[_-]?key|MINIMAX_API_KEY|OPENAI_API_KEY|secret|access[_-]?token|authorization|configPath)$/i;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const within=(candidate,base)=>{const relative=path.relative(base,candidate);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
export class PagesBuildError extends Error{constructor(code,message){super(message);this.name='PagesBuildError';this.code=code;}}
const fail=(code,message)=>{throw new PagesBuildError(code,message);};
async function inspect(file){try{return await lstat(file);}catch(error){if(error.code==='ENOENT')return null;fail('PATH_UNAVAILABLE','无法检查发布路径，请核对权限。');}}
async function directory(file,label){const info=await inspect(file);if(!info?.isDirectory()||info.isSymbolicLink())fail('INVALID_SOURCE',`${label}必须是实际目录。`);}
async function outputLocation(value,root){
  const absolute=path.resolve(value);let cursor=absolute,nearest=null;const suffix=[];
  for(;;){
    const info=await inspect(cursor);
    if(info){if(info.isSymbolicLink())fail('OUTPUT_LINK','构建输出路径不能经过符号链接或目录联接。');if(!info.isDirectory())fail('OUTPUT_NOT_DIRECTORY','构建输出或其父路径不是目录。');if(!nearest)nearest={directory:cursor,suffix:[...suffix]};}
    else if(!nearest)suffix.unshift(path.basename(cursor));
    const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;
  }
  if(!nearest)fail('OUTPUT_UNAVAILABLE','无法解析构建输出目录。');
  let result;try{result=path.resolve(await realpath(nearest.directory),...nearest.suffix);}catch{fail('OUTPUT_UNAVAILABLE','无法解析构建输出目录。');}
  const release=path.join(root,'.release');if(result===release||!within(result,release))fail('PROTECTED_OUTPUT','Pages 构建只能写入本项目 .release 下的独立目录。');
  return result;
}
async function fileHash(file){try{const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}catch{fail('READ_FAILED','无法读取发布文件进行完整性校验。');}}
function checkText(text,name){if(machinePath.test(text))fail('MACHINE_PATH',`发布文件含绝对机器路径：${name}`);if(secretLiteral.test(text))fail('SECRET_CONTENT',`发布文件疑似含凭据：${name}`);}
function checkJson(value,name){
  if(!value||typeof value!=='object')return;
  for(const [key,item]of Object.entries(value)){if(secretJsonKey.test(key)&&item!==null&&item!=='')fail('SECRET_CONTENT',`发布 JSON 含私有配置字段：${name}`);checkJson(item,name);}
}
function rewriteAudio(value,names,name){
  if(!value||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(item=>rewriteAudio(item,names,name));
  return Object.fromEntries(Object.entries(value).map(([key,item])=>{
    if(key==='audioUrl'){
      const match=typeof item==='string'&&audioReference.exec(item);if(!match)fail('INVALID_AUDIO_REFERENCE',`发布索引存在无效音频引用：${name}`);
      names.add(match[1]);return [key,'./audio/'+match[1]];
    }
    return [key,rewriteAudio(item,names,name)];
  }));
}
function recordedHtml(text){
  text=text.replace(/<meta\b(?=[^>]*\bname=["']time-atlas-deployment["'])[^>]*>\s*/gi,'');
  const marker='<meta name="time-atlas-deployment" content="recorded">';
  const style='<style id="recorded-deployment-style">.recorded-deployment-note{font-size:10px;line-height:1.4;color:#697e68;min-width:0;max-width:24em}@media(max-width:640px){.recorded-deployment-note{font-size:8px;max-width:15em;flex:1}.topbar{gap:5px}}</style>';
  if(!/<\/head>/i.test(text))fail('INVALID_HTML','发布入口缺少 head。');
  text=text.replace(/<\/head>/i,`${marker}\n  ${style}\n</head>`);
  if(!text.includes('id="recorded-deployment-note"')){
    const note='<span id="recorded-deployment-note" class="recorded-deployment-note">预录讲解，具体数字以画面为准</span>';
    const topbar=/(<(?:header|div)\b[^>]*\bclass=["'][^"']*\btopbar\b[^"']*["'][^>]*>)/i;
    if(topbar.test(text))text=text.replace(topbar,'$1'+note);else text=text.replace(/(<body\b[^>]*>)/i,'$1'+note);
  }
  return text;
}
async function sourceFiles(root){
  const result=[];
  async function walk(directoryPath,relative=''){
    for(const item of (await readdir(directoryPath,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      if(hiddenOrSensitive(item.name))continue;
      if(item.isSymbolicLink())fail('SOURCE_LINK','发布源码不能通过目录链接或符号链接读取。');
      const file=path.join(directoryPath,item.name),name=relative?relative+'/'+item.name:item.name;
      if(item.isDirectory())await walk(file,name);else if(item.isFile()&&staticExtensions.has(path.extname(item.name).toLowerCase()))result.push({file,name});
    }
  }
  await walk(root);return result;
}
async function planPages(projectDir,outDir){
  let root;try{root=await realpath(path.resolve(projectDir));}catch{fail('INVALID_PROJECT','无法读取项目目录。');}
  const out=await outputLocation(outDir||path.join(root,'.release','site'),root),dist=path.join(root,'dist'),publicDir=path.join(root,'public');
  await directory(dist,'页面源码');await directory(publicDir,'公开发布资源');await directory(path.join(publicDir,'audio'),'公开音频');
  const plan=new Map(),audioNames=new Set(),foundManifests=new Set();
  for(const {file,name}of await sourceFiles(dist)){
    let data;try{data=await readFile(file);}catch{fail('READ_FAILED',`无法读取页面资源：${name}`);}
    if(textExtensions.has(path.extname(name).toLowerCase())){
      let text=data.toString('utf8').replace(/\r\n/g,'\n');checkText(text,name);
      if(path.extname(name).toLowerCase()==='.json'){
        let json;try{json=JSON.parse(text);}catch{fail('INVALID_JSON',`页面 JSON 无法解析：${name}`);}
        checkJson(json,name);
        const manifestAudio=new Set();json=rewriteAudio(json,manifestAudio,name);for(const audioName of manifestAudio)audioNames.add(audioName);text=JSON.stringify(json,null,2)+'\n';
        if(PUBLIC_AUDIO_MANIFESTS.includes(name)){if(!manifestAudio.size)fail('EMPTY_MANIFEST',`固定课程索引没有音频引用：${name}`);foundManifests.add(name);}
      }
      // Rewrite complete MP3 literals, not '/audio/' prefix comparisons used by
      // the recorded voice adapter to recognize legacy paths.
      text=text.replace(/(["'`])\/audio\/([^"'`\r\n]+\.mp3)\1/g,(_all,quote,fileName)=>{if(!/^[a-f\d]{64}\.mp3$/.test(fileName))fail('INVALID_AUDIO_REFERENCE',`页面资源存在无效音频引用：${name}`);audioNames.add(fileName);return `${quote}./audio/${fileName}${quote}`;});
      if(name==='app-version.mjs')text=text.replace(/(["'])\/api\/app-version\1/g,(_all,quote)=>`${quote}./app-version.json${quote}`);
      if(name==='index.html')text=recordedHtml(text);
      data=Buffer.from(text);
    }
    plan.set(name,{name,data,hash:sha(data),bytes:data.length});
  }
  if(!plan.has('index.html'))fail('MISSING_ENTRY','页面入口 index.html 不存在。');
  for(const name of PUBLIC_AUDIO_MANIFESTS)if(!foundManifests.has(name))fail('MISSING_MANIFEST',`固定课程索引缺失：${name}`);
  const recordingFile=path.join(publicDir,'recorded-voice.json'),info=await inspect(recordingFile);if(!info?.isFile()||info.isSymbolicLink())fail('MISSING_RECORDINGS','公开预录语音清单不存在或不是实际文件。');
  let recorded;try{recorded=JSON.parse(await readFile(recordingFile,'utf8'));}catch{fail('INVALID_RECORDINGS','公开预录语音清单无法解析。');}
  checkText(JSON.stringify(recorded),'recorded-voice.json');checkJson(recorded,'recorded-voice.json');
  if(recorded.version!==1||typeof recorded.model!=='string'||!recorded.model||typeof recorded.voiceId!=='string'||!recorded.voiceId||!['cn','global'].includes(recorded.region)||!Array.isArray(recorded.recordings)||!recorded.recordings.length)
    fail('INVALID_RECORDINGS','公开预录语音清单不符合版本 1 格式。');
  for(const recording of recorded.recordings)if(!recording||typeof recording.id!=='string'||!recording.id||!/^([a-f\d]{64})$/.test(recording.textHash||'')||typeof recording.audioUrl!=='string'||!audioReference.test(recording.audioUrl))fail('INVALID_RECORDINGS','预录语音条目缺少标识、正文哈希或有效音频引用。');
  const recordedData=Buffer.from(JSON.stringify(rewriteAudio(recorded,audioNames,'recorded-voice.json'),null,2)+'\n');
  plan.set('recorded-voice.json',{name:'recorded-voice.json',data:recordedData,hash:sha(recordedData),bytes:recordedData.length});
  for(const name of [...audioNames].sort()){
    const source=path.join(publicDir,'audio',name),audioInfo=await inspect(source);
    if(!audioInfo?.isFile()||audioInfo.isSymbolicLink()||audioInfo.size<4)fail('MISSING_AUDIO',`公开音频缺失：${name}`);
    const relative='audio/'+name;plan.set(relative,{name:relative,source,hash:await fileHash(source),bytes:audioInfo.size});
  }
  const empty=Buffer.alloc(0);plan.set('.nojekyll',{name:'.nojekyll',data:empty,hash:sha(empty),bytes:0});
  const versionHash=createHash('sha256');versionHash.update('time-atlas-recorded-pages-v1\0');
  for(const item of [...plan.values()].sort((a,b)=>a.name.localeCompare(b.name,'en')))versionHash.update(item.name+'\0'+item.hash+'\0');
  const version=versionHash.digest('hex').slice(0,12),versionData=Buffer.from(JSON.stringify({app:'earth-time-lab',version})+'\n');
  plan.set('app-version.json',{name:'app-version.json',data:versionData,hash:sha(versionData),bytes:versionData.length});
  return {root,out,plan,version,audioFiles:audioNames.size};
}
async function existingOutputs(out,plan){
  const existing=new Map();if(!await inspect(out))return existing;
  const directories=new Set([...plan.keys()].flatMap(name=>{const parts=name.split('/');return parts.slice(0,-1).map((_part,index)=>parts.slice(0,index+1).join('/'));}));
  async function walk(directoryPath,relative=''){
    for(const item of await readdir(directoryPath,{withFileTypes:true})){
      const name=relative?relative+'/'+item.name:item.name,file=path.join(directoryPath,item.name);
      if(item.isSymbolicLink())fail('OUTPUT_LINK','构建输出含目录链接或符号链接，已停止。');
      if(item.isDirectory()){if(!directories.has(name))fail('UNEXPECTED_OUTPUT',`输出目录含非本次构建内容，未删除：${name}`);await walk(file,name);}
      else if(item.isFile()){
        if(!plan.has(name))fail('UNEXPECTED_OUTPUT',`输出目录含非本次构建文件，未删除：${name}`);
        const info=await inspect(file);if(info.nlink>1)fail('OUTPUT_HARDLINK','构建输出不能含硬链接。');existing.set(name,{file,info});
      }else fail('INVALID_OUTPUT','构建输出中存在特殊文件，已停止。');
    }
  }
  await walk(out);return existing;
}
const summary=prepared=>({version:prepared.version,files:prepared.plan.size,audioFiles:prepared.audioFiles,bytes:[...prepared.plan.values()].reduce((sum,item)=>sum+item.bytes,0)});

export async function buildPages({projectDir=projectRoot,outDir}={}){
  const prepared=await planPages(projectDir,outDir),existing=await existingOutputs(prepared.out,prepared.plan);
  try{await mkdir(prepared.out,{recursive:true});}catch{fail('OUTPUT_UNAVAILABLE','无法创建 Pages 构建目录。');}
  if(await outputLocation(prepared.out,prepared.root)!==prepared.out)fail('OUTPUT_CHANGED','Pages 构建目录发生变化，已停止。');
  for(const item of prepared.plan.values()){
    const previous=existing.get(item.name);if(previous&&previous.info.size===item.bytes&&await fileHash(previous.file)===item.hash)continue;
    const target=path.join(prepared.out,...item.name.split('/'));
    try{await mkdir(path.dirname(target),{recursive:true});if(item.data)await writeFile(target,item.data);else await copyFile(item.source,target);}
    catch{fail('WRITE_FAILED',`无法写入发布文件：${item.name}；没有删除源文件或输出目录。`);}
  }
  await verifyPrepared(prepared);return summary(prepared);
}
async function verifyPrepared(prepared){
  const existing=await existingOutputs(prepared.out,prepared.plan);
  for(const item of prepared.plan.values()){
    const actual=existing.get(item.name);if(!actual||actual.info.size!==item.bytes||await fileHash(actual.file)!==item.hash)fail('VERIFY_FAILED',`发布文件缺失或内容不一致：${item.name}`);
  }
}
export async function verifyPages({projectDir=projectRoot,outDir}={}){const prepared=await planPages(projectDir,outDir);await verifyPrepared(prepared);return summary(prepared);}
export function parsePagesArgs(args){
  let outDir,verify=false;
  for(let index=0;index<args.length;index++){
    const arg=args[index];if(arg==='--help'||arg==='-h')return {help:true};if(arg==='--verify'&&!verify){verify=true;continue;}
    const value=arg==='--out'?args[++index]:arg.startsWith('--out=')?arg.slice(6):null;
    if(value===null||!value||value.startsWith('--')||outDir!==undefined)fail('INVALID_ARGUMENTS','用法：node scripts/build-pages.mjs [--verify] [--out .release/目录]');outDir=path.resolve(value);
  }
  return {verify,...(outDir?{outDir}:{})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const options=parsePagesArgs(process.argv.slice(2));if(options.help)console.log('用法：node scripts/build-pages.mjs [--verify] [--out .release/目录]\n默认输出 .release/site；不删除目录，不修改 dist、public 或原音频缓存。');else console.log(JSON.stringify(await (options.verify?verifyPages:buildPages)(options)));}
  catch(error){console.error(error instanceof PagesBuildError?`${error.code}: ${error.message}`:'BUILD_FAILED: Pages 构建未完成，请检查权限和输入文件。');process.exitCode=1;}
}
