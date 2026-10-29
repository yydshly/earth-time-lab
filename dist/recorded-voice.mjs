import {recordedNarrations} from './recorded-narrations.mjs';

const narrationById=new Map(recordedNarrations.map(row=>[row.id,row.text]));
export function isRecordedDeployment(doc=typeof document==='undefined'?null:document){
  return doc?.querySelector?.('meta[name="time-atlas-deployment"]')?.content==='recorded';
}
export function recordedText(id,original,recorded=isRecordedDeployment()){
  if(!recorded)return original;
  const text=narrationById.get(id);
  if(!text)throw new Error('这一步的预录讲稿尚未准备好，请阅读页面结果。');
  return text;
}
export const voiceProviderLabel=()=>isRecordedDeployment()?'MiniMax 预录':'MiniMax';

const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const error=(status,code,message)=>response(status,{error:{message},code,recorded:true,readOnly:true});
function audioUrl(value,base){
  if(typeof value!=='string'||!value)throw new Error('预录音频地址无效。');
  // Old local manifests used /audio/...; Pages publishes under /repository/.
  const relative=value.startsWith('/audio/')?'.'+value:value;
  const resolved=new URL(relative,base);
  if(!['http:','https:','file:'].includes(resolved.protocol))throw new Error('预录音频地址无效。');
  return resolved.href;
}
function normalizeAudioReferences(value,base){
  if(Array.isArray(value))return value.map(row=>normalizeAudioReferences(row,base));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='audioUrl'&&typeof item==='string'?audioUrl(item,base):normalizeAudioReferences(item,base)]));
  return value;
}

/** The recorded deployment reads immutable assets only; it never sends synthesis
 * text, keys, or mutation requests to a network endpoint. */
export function createVoiceFetch({fetchImpl=(...args)=>fetch(...args),recorded=()=>isRecordedDeployment(),moduleUrl=import.meta.url}={}){
  const base=new URL('.',moduleUrl),manifestUrl=new URL('recorded-voice.json',base);let pendingManifest;
  function manifest(){
    if(!pendingManifest)pendingManifest=(async()=>{
      const result=await fetchImpl(manifestUrl,{method:'GET',cache:'no-cache'});
      if(!result.ok)throw new Error('预录音频清单暂时无法读取，请稍后重试。');
      const data=await result.json();
      if(data?.version!==1||!Array.isArray(data.recordings)||!data.recordings.length||typeof data.model!=='string'||typeof data.voiceId!=='string')throw new Error('预录音频清单不完整，请阅读页面结果。');
      return data;
    })().catch(reason=>{pendingManifest=null;throw reason;});
    return pendingManifest;
  }
  return async function voiceFetch(input,options={}){
    if(!recorded())return fetchImpl(input,options);
    const raw=typeof input==='string'||input instanceof URL?String(input):input?.url;
    const url=new URL(raw,base),method=String(options.method||input?.method||'GET').toUpperCase();
    if(url.pathname==='/api/voice/config')return error(403,'RECORDED_READ_ONLY','线上版使用预录讲解，不能在网页中提交密钥、切换音色或更改语音配置。');
    if(url.pathname==='/api/voice/status'){
      if(method!=='GET')return error(405,'RECORDED_READ_ONLY','预录语音状态仅支持读取。');
      try{const data=await manifest();return response(200,{configured:true,provider:'MiniMax',recorded:true,readOnly:true,model:data.model,voiceId:data.voiceId,region:data.region||'cn',models:[data.model],voices:[{id:data.voiceId,name:'预录中文讲解'}],recordingCount:data.recordings.length});}
      catch(reason){return error(503,'RECORDED_MANIFEST_UNAVAILABLE',reason.message);}
    }
    if(url.pathname==='/api/voice/synthesize'){
      if(method!=='POST')return error(405,'RECORDED_READ_ONLY','此入口只用于在本机浏览器中查找对应预录片段。');
      let body;try{body=typeof options.body==='string'?JSON.parse(options.body):await input.clone().json();}catch{return error(400,'INVALID_RECORDED_REQUEST','无法读取预录讲稿请求。');}
      if(typeof body?.text!=='string'||!body.text.trim())return error(400,'INVALID_RECORDED_TEXT','请选择一段可播放的预录讲解。');
      try{
        const data=await manifest();
        if((body.model&&body.model!==data.model)||(body.voiceId&&body.voiceId!==data.voiceId))return error(409,'RECORDED_VOICE_FIXED','线上版使用已发布的固定音色与模型。');
        const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.text));
        const textHash=[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
        const entry=data.recordings.find(row=>row.textHash===textHash);
        if(!entry)return error(404,'RECORDING_NOT_FOUND','这段预录音频尚未发布，请阅读屏幕结果；线上版不会实时生成语音。');
        return response(200,{...entry,audioUrl:audioUrl(entry.audioUrl,base),model:data.model,voiceId:data.voiceId,provider:'MiniMax',recorded:true,cached:true});
      }catch(reason){return error(503,'RECORDING_UNAVAILABLE',reason.message||'预录音频暂时不可用。');}
    }
    if(method!=='GET'&&method!=='HEAD')return error(405,'RECORDED_READ_ONLY','线上预录版只读取静态资源，不发送修改请求。');
    const result=await fetchImpl(input,options);
    if(result.ok&&/-audio\.json$/.test(url.pathname))return response(result.status,normalizeAudioReferences(await result.json(),base));
    return result;
  };
}
export const voiceFetch=createVoiceFetch();

export function configureRecordedVoiceUi(doc=typeof document==='undefined'?null:document){
  if(!isRecordedDeployment(doc))return;
  const open=doc.querySelector('#voice-settings-open');if(open){open.hidden=true;open.disabled=true;}
  for(const id of ['voice-key','voice-id','voice-model','voice-region','voice-save']){const field=doc.getElementById(id);if(field)field.disabled=true;}
  const status=doc.getElementById('voice-config-state');if(status)status.textContent='线上版使用 MiniMax 预录讲解，不收集密钥，也不实时生成语音。';
}
