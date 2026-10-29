import {voiceFetch,voiceProviderLabel} from './recorded-voice.mjs';
import {buildTimeReference} from './local-time-reference.mjs';
import {recordedText} from './recorded-voice.mjs';

const initialLabel='▶ 听此刻的时间对照';
const durationText=minutes=>{
  const value=Math.abs(minutes),hours=Math.floor(value/60),rest=value%60;
  return `${hours?`${hours}小时`:''}${rest?`${rest}分钟`:''}`||'零分钟';
};
const offsetText=minutes=>minutes===0?'零偏移':`${minutes<0?'负':'正'}${durationText(minutes)}`;
const localDateText=local=>{const [year,month,day]=String(local.date||'').split('-').map(Number);if(!year||!month||!day)throw new Error('当前日期暂未准备好。');return `${year}年${month}月${day}日`;};
const wallClockText=time=>{const match=/^(\d{2}):(\d{2})$/.exec(String(time||''));if(!match)throw new Error('当前钟点暂未准备好。');return `${Number(match[1])}点${Number(match[2])?`${Number(match[2])}分`:'整'}`;};
const clockText=local=>wallClockText(local.time);
const dateTimeText=local=>`${localDateText(local)}${clockText(local)}`;
const operationText=minutes=>minutes===0?'保持钟点不变':`${minutes<0?'减去':'加上'}${durationText(minutes)}`;

/** Produce the exact text sent to MiniMax, without touching the player or DOM. */
export function buildLiveTimeNarration(snapshot,{freezeScene=false}={}){
  const at=new Date(snapshot?.instant);if(!Number.isFinite(at.getTime())||!snapshot?.selected?.zone)throw new Error('当前时间对照暂未准备好。');
  const selected=snapshot.selected,referenceZone=snapshot.reference?.zone||'Asia/Shanghai';
  if(Object.hasOwn(snapshot,'referenceModel')&&!snapshot.referenceModel)throw new Error(snapshot.referenceError||'请先填写有效的深夜参考起止钟点，再读取时间推算。');
  const model=snapshot.referenceModel||buildTimeReference({instant:at,region:selected,referenceZone,quietStart:snapshot.quietStart??'00:00',quietEnd:snapshot.quietEnd??'06:00'});
  const reference=model.reference,utc=model.utc,local=model.selected;
  if(!reference||!utc||!local)throw new Error('当前时间推算暂未准备好。');
  if(new Date(model.instant).getTime()!==at.getTime()||local.zone!==selected.zone||reference.zone!==referenceZone)throw new Error('时间推算已变化，请重新读取当前时刻。');
  const referenceName=referenceZone==='Asia/Shanghai'?'北京时间':referenceZone==='UTC'?'UTC':snapshot.reference?.name||'参照城市时间';
  const name=selected.name||selected.city||selected.short||selected.zone,code=selected.short||'',variant=selected.variant||code;
  const toUtc=Number(model.calculation?.toUtcMinutes),fromUtc=Number(model.calculation?.fromUtcMinutes),delta=Number(model.calculation?.deltaMinutes);
  if(![toUtc,fromUtc,delta].every(Number.isFinite))throw new Error('当前 UTC 推算暂未准备好。');
  const first=`第一步，从${referenceName}${dateTimeText(reference)}，${operationText(toUtc)}，得到协调世界时，UTC的${dateTimeText(utc)}。`;
  const second=`第二步，从UTC的${dateTimeText(utc)}，${operationText(fromUtc)}，得到${name}的${dateTimeText(local)}。`;
  const expression=selected.id==='utc'||selected.zone==='UTC'?'UTC是全球共同的时间标尺，不是某一个人的当地时间。':code==='PT'?`这里的PT是美国太平洋当地时间的统称，本次按所选日期采用${variant}，UTC偏移为${offsetText(fromUtc)}；换季后要重新按日期计算。`:`这里本次采用${variant||name}，UTC偏移为${offsetText(fromUtc)}；使用的是所选日期的规则。`;
  const phase=typeof model.phase==='string'?model.phase:model.phase?.label||model.phase?.name||model.phase?.title;
  let life='';
  if(model.applicable){
    if(phase)life+=`按当地钟点，此刻属于${phase}。这只描述一天中的时段，不是在判断对方此刻的活动。`;
    const quiet=model.quiet;
    if(!quiet?.applicable)throw new Error('深夜参考时段暂未准备好。');
    life+=`你设置的当地${wallClockText(quiet.startTime)}到${wallClockText(quiet.endTime)}，是可调整的粗略避扰参考段，不是完整睡眠时间，也不是本人确认的联系窗口。`;
    if(quiet.status==='ready'){
      if(!quiet.start?.source||!quiet.end?.source||!quiet.start?.reference||!quiet.end?.reference||!Number.isFinite(quiet.actualMinutes))throw new Error('深夜参考时段的换算暂未准备好。');
      life+=`当地从${dateTimeText(quiet.start.source)}到${dateTimeText(quiet.end.source)}，对应${referenceName}从${dateTimeText(quiet.start.reference)}到${dateTimeText(quiet.end.reference)}。这段实际经过${durationText(quiet.actualMinutes)}。`;
      if(quiet.hasOffsetChange)life+='这段跨越了时钟调整，所以要区分钟面范围和实际经过的时长。';
      if(typeof quiet.containsLocalClock==='boolean')life+=quiet.containsLocalClock?'按每天重复的钟面参考，当前当地钟点落在避扰范围里，可以先选择异步留言。':'按每天重复的钟面参考，当前当地钟点在避扰范围之外，但不能据此认定对方方便联系。';
    }else if(quiet.status==='gap')life+='参考段有端点钟点因时钟调整而不存在，暂时不能给出唯一的对应区间；请先确认采用什么处理规则。';
    else if(quiet.status==='fold')life+='参考段有端点钟点重复出现，暂时不能给出唯一的对应区间；必须先确认第一次还是第二次，这里不替你选择。';
    else throw new Error('请先确认有效的深夜参考起止钟点。');
  }
  const ending=model.applicable?'这些钟表描述的是同一个瞬间；联系具体的人，还要确认他的实际日程。':'这些钟表描述的是同一个瞬间；这一步只用于对齐全球时间标尺。';
  const introduction=freezeScene?'我们读取你点击播放时的同一个瞬间。地球、各地钟表和换算都定格为这次讲解快照，暂停时也会保留。讲解结束会回到实时，也可以点击回到实时。':'我们读取你点击播放时的同一个瞬间，页面时钟会继续更新。';
  return {text:`${introduction}现在按参照时间到UTC，再到对方的顺序推算。${first}${second}${expression}${life}${ending}`,reference,name,code,at,referenceName,model};
}

/** Short independently spoken cues keep the visible target aligned with each sentence. */
export function buildLiveTimeCues(snapshot){
  const speech=buildLiveTimeNarration(snapshot,{freezeScene:true}),{model}=speech,reference=model.reference,utc=model.utc,local=model.selected,selected=snapshot.selected;
  const city=selected.city||speech.name,referenceName=speech.referenceName,code=selected.short||'',variant=selected.variant||code;
  const cue=(id,caption,text,focus,highlight)=>({id,caption,text:recordedText('live-'+id,text),focus,highlight,instant:speech.at.toISOString()});
  const cues=[
    cue('reference-date','先看北京的日期',`先固定你点击时的同一个瞬间。画面中的${referenceName}日期是${localDateText(reference)}；播放和暂停都使用这份讲解快照。`,'reference',{clock:'reference',field:'date'}),
    cue('reference-time','再读北京时间',`${referenceName}的钟点是${clockText(reference)}。接下来换的是各地钟表的读数，这个瞬间保持相同。`,'reference',{clock:'reference',field:'time'}),
    cue('utc','北京 → UTC：共同标尺',`从${referenceName}${dateTimeText(reference)}，${operationText(model.calculation.toUtcMinutes)}，得到 UTC 的${dateTimeText(utc)}。UTC 是全球共同的时间标尺，放在画面上的参照位置，不代表某个居民地点。`,'utc',{clock:'utc',field:'time'}),
  ];
  if(selected.zone!=='UTC'){
    cues.push(cue('target-date',`看${city}的日期`,`同一个瞬间，${city}的当地日期是${localDateText(local)}。${reference.date===local.date?'两地此刻是同一个日历日期。':'它与北京的日历日期不同，不能只比较钟点。'}`,'target',{clock:'target',field:'date'}));
    cues.push(cue('target-time',`UTC → ${city}的钟点`,`从 UTC 的${dateTimeText(utc)}，${operationText(model.calculation.fromUtcMinutes)}，得到${city}当地${dateTimeText(local)}。看球面上对应地点的钟点和日期。`,'target',{clock:'target',field:'time'}));
  }
  if(code==='PT'){
    cues.push(cue('concept-pt','PT：当地时间的统称','这里以美国西海岸为例。PT 是太平洋当地时间的统称，指洛杉矶等地按日期采用规则的钟表。','target',{concept:'PT',clock:'target',field:'teaching'}));
    cues.push(cue('concept-pst','PST：标准时间，UTC−8','PST 是太平洋标准时间，固定比 UTC 慢八小时，北京比这套标准钟快十六小时。这是在解释规则名称，球面仍保持本次快照。','target',{concept:'PST',clock:'target',field:'teaching'}));
    cues.push(cue('concept-pdt','PDT：夏令时间，UTC−7','PDT 是太平洋夏令时间，比 UTC 慢七小时，北京比这套夏令钟快十五小时。','target',{concept:'PDT',clock:'target',field:'teaching'}));
  }
  if(selected.zone!=='UTC')cues.push(cue('current-rule',`这次采用 ${variant}`,`本次快照中，${city}采用 ${variant}，UTC 偏移为${offsetText(model.calculation.fromUtcMinutes)}。${model.calculation.deltaMinutes===0?'它和北京时间没有时差。':`北京比这里${model.calculation.deltaMinutes<0?'快':'慢'}${durationText(model.calculation.deltaMinutes)}。`}未来活动要按活动日期重新计算。`,'target',{concept:code==='PT'?variant:null,clock:'target',field:'teaching'}));
  if(model.applicable){
    const q=model.quiet,phase=typeof model.phase==='string'?model.phase:model.phase?.label||'';
    cues.push(cue('quiet-reference','当地时段与避扰参考',`按当地钟点，${city}现在属于${phase}。你设置的${wallClockText(q.startTime)}到${wallClockText(q.endTime)}是可调整的避扰参考段，不能据此判断本人正在睡觉。`,'target',{clock:'target',field:'teaching',window:true}));
    if(q.status==='ready')cues.push(cue('quiet-conversion','同一段时间，换到北京',`当地从${dateTimeText(q.start.source)}到${dateTimeText(q.end.source)}，对应${referenceName}从${dateTimeText(q.start.reference)}到${dateTimeText(q.end.reference)}。实际经过${durationText(q.actualMinutes)}。${q.hasOffsetChange?'这段跨越调钟，钟面范围和实际时长需要区分。':''}`,'comparison',{window:true}));
    else cues.push(cue('quiet-unresolved','先确认调钟边界',q.status==='fold'?'参考段的端点钟点因回拨出现两次；应先确认第一次还是第二次，暂不画出唯一对应范围。':'参考段的端点钟点因调钟不存在；请先确认处理规则，暂不画出唯一对应范围。','comparison',{window:true}));
    cues.push(cue('individual','最终联系的是具体的人','钟点和时区帮助我们对齐同一个瞬间。参考段不是本人确认的联系窗口；夜班、家庭安排和个人习惯都可能不同，联系前仍需确认实际日程。','comparison',{window:true}));
  }else cues.push(cue('shared-instant','同一个瞬间，统一参照','这些钟表对应同一个瞬间。UTC 是共同时间标尺，这一步只用于换算，不据此推断任何人的作息。','utc',{clock:'utc',field:'time'}));
  return {...speech,cues,text:cues.map(item=>item.text).join('\n\n')};
}

/** Keep the displayed instant stable across ticks, pauses and date boundaries. */
export function createLiveSpeechClock(){
  let held=null;
  return {hold(value){const at=new Date(value);if(!Number.isFinite(at.getTime()))throw new RangeError('讲解快照需要有效时刻。');held=at.getTime();},release(){held=null;},at(now=new Date()){return new Date(held??new Date(now).getTime());},get frozen(){return held!==null;}};
}

/** Each native audio clip owns one semantic target and one held instant. */
export function createLiveTimeVoice({root,getSnapshot,onRead,onRelease,onCue,freezeScene=false}){
  if(!(root instanceof HTMLElement)||typeof getSnapshot!=='function')throw new TypeError('实时语音需要显示容器与时间快照。');
  const row=document.createElement('div');row.className='live-voice';
  const button=document.createElement('button');button.type='button';button.className='live-voice-button';button.textContent=initialLabel;
  const audio=document.createElement('audio');audio.className='live-voice-audio';audio.controls=true;audio.preload='metadata';audio.hidden=true;audio.setAttribute('aria-label','MiniMax 此刻全球时间逐句对照');
  const status=document.createElement('span');status.className='live-voice-status';status.setAttribute('role','status');status.textContent=`${voiceProviderLabel()} · 逐句对应地球上的日期、钟点与规则`;
  const captured=document.createElement('small');captured.className='live-voice-captured';captured.hidden=true;
  const transcript=document.createElement('details');transcript.className='live-voice-transcript';transcript.hidden=true;
  const transcriptSummary=document.createElement('summary');transcriptSummary.textContent='本次播报讲稿';
  const transcriptText=document.createElement('p');transcript.append(transcriptSummary,transcriptText);
  const returnLive=document.createElement('button');returnLive.type='button';returnLive.className='live-voice-button';returnLive.id='live-voice-now';returnLive.textContent='结束讲解，回到实时';returnLive.hidden=true;
  const cueControls=document.createElement('span');cueControls.className='live-voice-cue-controls';cueControls.hidden=true;
  const prev=document.createElement('button'),next=document.createElement('button');prev.type=next.type='button';prev.textContent='← 上一句';next.textContent='下一句 →';prev.id='live-voice-prev';next.id='live-voice-next';cueControls.append(prev,next);
  row.append(button,returnLive,cueControls,audio,status,captured,transcript);root.append(row);
  let voiceToken=0,busy=false,capturedSpeech=null,holdingSnapshot=false,cueIndex=0,loadedCue=-1,voiceConfig=null;
  const clips=new Map(),visible=()=>root.isConnected&&root.getClientRects().length>0&&!document.hidden;
  function releaseSnapshot(reason){if(!holdingSnapshot)return;holdingSnapshot=false;returnLive.hidden=true;onRelease?.(reason);}
  function readSnapshot(speech){capturedSpeech=speech;if(freezeScene){holdingSnapshot=true;returnLive.hidden=false;}onRead?.(speech.model);}
  function applyCue(index){
    const cue=capturedSpeech?.cues?.[index];if(!cue)return;
    cueIndex=index;cueControls.hidden=false;prev.disabled=index===0;next.disabled=index===capturedSpeech.cues.length-1;
    status.textContent=`${voiceProviderLabel()} · ${index+1} / ${capturedSpeech.cues.length} · ${cue.caption}`;onCue?.(cue,capturedSpeech.model);
  }
  function clearAudio(){audio.pause();audio.removeAttribute('src');audio.load();audio.hidden=true;loadedCue=-1;}
  function pause(){
    voiceToken++;busy=false;clearAudio();button.disabled=false;button.textContent=initialLabel;status.textContent=`${voiceProviderLabel()} · 逐句对应地球上的日期、钟点与规则`;captured.textContent='';captured.hidden=true;transcriptText.textContent='';transcript.hidden=true;transcript.open=false;cueControls.hidden=true;capturedSpeech=null;cueIndex=0;onCue?.(null);releaseSnapshot('cancel');
  }
  async function json(url,options={}){
    const response=await voiceFetch(url,options);let result;try{result=await response.json();}catch{throw new Error('语音服务暂时无法读取，请重试。');}
    if(!response.ok)throw new Error(result.error?.message||result.error||'语音服务暂时无法读取，请重试。');return result;
  }
  async function prepareClip(index,config){
    const cue=capturedSpeech?.cues?.[index];if(!cue)return null;const key=[config.model,config.voiceId,cue.text].join('|');
    if(!clips.has(key))clips.set(key,json('/api/voice/synthesize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chapterId:`live-cue-${cue.id}`,text:cue.text,model:config.model,voiceId:config.voiceId})}).catch(error=>{clips.delete(key);throw error;}));
    return clips.get(key);
  }
  async function playCue(index){
    if(!visible()||!capturedSpeech?.cues?.[index])return;
    const requestToken=++voiceToken;busy=true;clearAudio();readSnapshot(capturedSpeech);applyCue(index);button.disabled=true;button.textContent='正在准备这一句…';
    captured.hidden=false;captured.textContent=`讲解快照：${capturedSpeech.referenceName} ${capturedSpeech.reference.date} ${capturedSpeech.reference.time}；地球和所有比较钟已定格，暂停仍保留。`;
    document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});
    try{
      const config=voiceConfig||await json('/api/voice/status');if(requestToken!==voiceToken)return;if(!config.configured)throw new Error('MiniMax 暂未连接，请检查已有语音配置。');voiceConfig=config;
      const clip=await prepareClip(index,config);if(requestToken!==voiceToken||!visible())return;if(typeof clip?.audioUrl!=='string')throw new Error('语音结果暂时无法播放，请重试。');
      loadedCue=index;audio.src=clip.audioUrl;audio.hidden=false;await audio.play();if(requestToken!==voiceToken)return;applyCue(index);
      if(index+1<capturedSpeech.cues.length)void prepareClip(index+1,config).catch(()=>{});
    }catch(error){if(requestToken===voiceToken){clearAudio();capturedSpeech=null;cueControls.hidden=true;onCue?.(null);releaseSnapshot('error');captured.textContent='本次讲解未能播放，画面已回到实时。';status.textContent=error.message;}}
    finally{if(requestToken===voiceToken){busy=false;button.disabled=false;if(audio.paused)button.textContent='▶ 继续这次对照';}}
  }
  async function listen(){
    if(busy||!visible())return;if(!audio.paused){audio.pause();return;}
    if(audio.src&&!audio.ended&&loadedCue===cueIndex){applyCue(cueIndex);try{await audio.play();}catch{status.textContent='请点击音频播放器继续。';}return;}
    if(!holdingSnapshot||!capturedSpeech){
      try{capturedSpeech=buildLiveTimeCues(getSnapshot());cueIndex=0;readSnapshot(capturedSpeech);transcriptText.textContent=capturedSpeech.text;transcript.hidden=false;transcript.open=false;}catch(error){releaseSnapshot('error');status.textContent=error.message;return;}
    }
    await playCue(cueIndex);
  }
  async function moveCue(delta){if(!capturedSpeech)return;const index=cueIndex+delta;if(index<0||index>=capturedSpeech.cues.length)return;await playCue(index);}
  button.onclick=()=>void listen();prev.onclick=()=>void moveCue(-1);next.onclick=()=>void moveCue(1);returnLive.onclick=pause;
  audio.addEventListener('play',()=>{
    if(!visible()){audio.pause();return;}if(capturedSpeech){readSnapshot(capturedSpeech);applyCue(loadedCue);}
    document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});button.textContent='Ⅱ 暂停此刻对照';
  });
  audio.addEventListener('pause',()=>{button.textContent=audio.src?'▶ 继续这次对照':initialLabel;});
  audio.addEventListener('seeked',()=>{if(loadedCue===cueIndex)applyCue(cueIndex);});
  audio.addEventListener('ended',()=>{
    if(capturedSpeech&&cueIndex<capturedSpeech.cues.length-1){void playCue(cueIndex+1);return;}
    onCue?.(null);releaseSnapshot('ended');button.textContent='↺ 重新读取此刻对照';status.textContent='本次播报结束 · 地球与比较钟已回到实时';captured.textContent='再次点击会读取新的讲解快照；上一句可以重听原快照。';
  });
  audio.addEventListener('error',()=>{if(audio.hasAttribute('src')){clearAudio();capturedSpeech=null;cueControls.hidden=true;onCue?.(null);releaseSnapshot('error');status.textContent='音频读取失败，请重新播放。';button.textContent=initialLabel;}});
  window.addEventListener('timeatlas:view',event=>{if(event.detail.view!=='explore')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.pause();});
  window.addEventListener('timeatlas:voice-settings-changed',()=>{voiceConfig=null;clips.clear();pause();});
  return {pause,listen,play:()=>audio.paused?listen():undefined};
}
