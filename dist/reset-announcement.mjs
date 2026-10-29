import {voiceFetch,voiceProviderLabel} from './recorded-voice.mjs';
import {parseResetAnnouncement,calculateAnnouncementReading,resolveAnnouncementReading,resolveAnnouncementContext,announcementTimeSource} from './reset-announcement-model.mjs';
import {timeExpressions} from './common-time.mjs';
import {partsAt,offsetMinutes,formatOffset,addDays} from './time-engine.mjs';
import {buildAnnouncementScenes} from './announcement-scenes.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=at=>at.toISOString().replace('.000Z','Z');
const stamp=at=>iso(at).replace('T',' ').replace('Z',' UTC');
const initialVoice='▶ 听这次换算';
const variants={PT:{'-480':'PST','-420':'PDT'},ET:{'-300':'EST','-240':'EDT'},CT:{'-360':'CST','-300':'CDT'},MT:{'-420':'MST','-360':'MDT'},London:{0:'GMT',60:'BST'},Paris:{60:'CET',120:'CEST'}};
const examples={event:'Quota resets on 2026-11-02 at 9:00 AM PT.',daily:'Quota resets daily at 00:00 UTC.',duration:'Resets in 5 hours and 30 minutes.',deadline:'第23天 / 今天是重置日。太平洋标准时间午夜前抵达。'};
const deadlineText=text=>/\b(?:before|by)\s+(?:midnight|noon|\d)|(?:午夜|零点|凌晨|半夜)\s*(?:之|以)?前|(?:\d{1,2}(?::\d{2})?\s*(?:AM|PM|PT|PST|PDT|UTC|点|时))\s*(?:之|以)?前|最晚|截止/iu.test(String(text||''));

function sourceClock(at,source){
  const offset=source?.zone?offsetMinutes(at,source.zone):source?.offset??0;
  const local=source?.zone?partsAt(at,source.zone):partsAt(new Date(at.getTime()+offset*60_000),'UTC');
  const variant=variants[source?.id]?.[offset];
  return {...local,offset,label:[source?.id||'UTC',variant&&variant!==source?.id?variant:'',formatOffset(offset)].filter(Boolean).join(' · ')};
}
function relative(at,now){
  const delta=at.getTime()-now.getTime(),minutes=Math.ceil(Math.abs(delta)/60_000);
  const days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),rest=minutes%60;
  const amount=[days?`${days} 天`:'',hours?`${hours} 小时`:'',rest?`${rest} 分钟`:''].filter(Boolean).join(' ')||'不足 1 分钟';
  return Math.abs(delta)<1000?'此刻到达公告时刻':`${delta<0?'已过去':'还需等待'} ${Math.abs(delta)<60_000?'不足 1 分钟':`约 ${amount}`}`;
}
export function announcementTimingLabel(at,now,relation='at'){
  const label=relative(at,now);return relation==='before'?label.replace(/^还需等待/,'距截止还有').replace(/^已过去/,'截止边界已过').replace('此刻到达公告时刻','此刻到达截止边界'):label;
}
export function announcementDurationLabel(value){
  const hours=Number(value);if(!Number.isFinite(hours)||hours<0)return '未填写时长';
  const total=Math.round(hours*3600000),h=Math.floor(total/3600000),m=Math.floor(total%3600000/60000),s=(total%60000)/1000;
  return [h?`${h} 小时`:'',m?`${m} 分钟`:'',s?`${s} 秒`:''].filter(Boolean).join(' ')||'0 秒';
}

export function announcementReadingSummary(model){
  if(!model)return {notice:'',supplement:'',toggleMode:null,toggleLabel:''};
  const source=model.source||{},reading=model.reading,local=sourceClock(model.instant,source);
  let notice=source.id==='PT'?`太平洋当地时间 PT · 当天采用 ${variants.PT[local.offset]||'当地规则'}（${formatOffset(local.offset)}）`:`采用 ${source.id||'UTC'}（${formatOffset(local.offset)}）`;
  if(reading?.switchable)notice=reading.mode==='strict'?`当前查看严格 ${reading.originalSource} · 固定 ${formatOffset(local.offset)}`:`原文 ${reading.originalSource}，暂按当地 PT 理解 · 当天 ${variants.PT[local.offset]||'当地规则'}`;
  else if(reading?.mode==='explicit'&&['PST','PDT'].includes(source.id))notice=`按原文明确的 ${source.id} · 固定 ${formatOffset(local.offset)}`;
  const other=model.supplement,ready=other?.status==='ready'&&other.instant;
  if(!reading?.switchable||!ready)return {notice,supplement:'',toggleMode:null,toggleLabel:''};
  const delta=(new Date(other.instant)-new Date(model.instant))/60000,otherClock=partsAt(other.instant,'Asia/Shanghai'),mainDate=partsAt(model.instant,'Asia/Shanghai').date,otherName=reading.mode==='strict'?'当地 PT':`严格 ${reading.originalSource}`,relation=model.relation==='before'?' 前':'',date=otherClock.date===mainDate?'':`${otherClock.date} `;
  const supplement=delta===0?`该日期当地 PT 与严格 ${reading.originalSource} 相同，无一小时时差。`:`${otherName}：${date}${otherClock.time}${relation}（${delta>0?'晚':'早'} ${announcementDurationLabel(Math.abs(delta)/60)}）`;
  return {notice,supplement,toggleMode:reading.mode==='strict'?'local':'strict',toggleLabel:reading.mode==='strict'?'返回当地 PT':`查看严格 ${reading.originalSource}`};
}

export function announcementPublicationDateDiffers(reference){
  const at=new Date(reference);return Number.isFinite(at.getTime())&&sourceClock(at,{id:'PT',zone:'America/Los_Angeles'}).date!==sourceClock(at,{id:'PST',offset:-480}).date;
}

const cueGroupLabels={source:'看公告当地',conversion:'换到北京',meaning:'理解结果'};
export function announcementCueGroups(scenes=[]){
  const groups=[];
  scenes.forEach((scene,index)=>{const id=scene.group||(['source','conversion','meaning'].includes(scene.id)?scene.id:'source');let group=groups.find(item=>item.id===id);if(!group){group={id,label:cueGroupLabels[id]||scene.title||id,index,count:0};groups.push(group);}group.count++;});
  return groups;
}
export function announcementCuePosition(scenes=[],index=-1){
  if(!scenes[index])return null;
  const groupId=scenes[index].group||(['source','conversion','meaning'].includes(scenes[index].id)?scenes[index].id:'source'),members=scenes.map((scene,i)=>({scene,i})).filter(({scene})=>(scene.group||(['source','conversion','meaning'].includes(scene.id)?scene.id:'source'))===groupId);
  return {group:groupId,index:members.findIndex(item=>item.i===index)+1,count:members.length,total:scenes.length};
}

export function announcementDateSummary({dateResolution,date='',assumptions=[],publication=false,boundary,differentPublicationDates=false,timeQualifier,hasClock=false}={}){
  const parts=[];
  if(dateResolution?.label)parts.push(dateResolution.label);
  else if(assumptions.length)parts.push(`${publication?'采用填写的发布时间':'未给发布时间，按现在发布'} · 所指当地日期 ${date}${boundary==='end-of-day'?'，午夜指这一天结束':''}。`);
  if(dateResolution?.status==='resolved'&&dateResolution.resolvedDate===date&&boundary==='end-of-day'){
    const next=addDays(date,1),nextLabel=next.slice(0,4)===date.slice(0,4)?next.slice(5).replace('-','/'):next;
    parts.push(`这一天结束，即 ${nextLabel} 00:00 前。`);
  }
  if(timeQualifier&&!hasClock)parts.push(`${String(timeQualifier).toUpperCase()} 的具体截止钟点需确认。`);
  if(differentPublicationDates&&parts.length)parts.push('两种解释沿用此日期，可修改。');
  return parts.join(' ');
}

/** Preserve the saved publication snapshot when applying the new PST default. */
export function migrateAnnouncementState(saved={}){
  if(saved.flowVersion===4&&saved.understandingVersion!==1&&saved.hasExtraction&&saved.relation==='at'&&typeof saved.text==='string'){
    try{if(parseResetAnnouncement(saved.text).relation==='before')return {...saved,calculated:false,legacyReview:true};}catch{}
  }
  if(saved.flowVersion!==3||!saved.hasExtraction||typeof saved.text!=='string')return saved;
  try{
    const parsed=resolveAnnouncementReading(parseResetAnnouncement(saved.text),{text:saved.text});
    if(!parsed.reading?.switchable||!['PST','PT'].includes(saved.source))return saved;
    const next={...saved,flowVersion:4,source:'PT',reading:parsed.reading,parseWarnings:parsed.warnings||[]};
    if(Array.isArray(saved.assumptions)&&saved.assumptions.length&&typeof saved.contextReference==='string'&&Number.isFinite(Date.parse(saved.contextReference))){
      const contextual=resolveAnnouncementContext(parsed,{asOf:new Date(saved.contextReference),defaultPublication:true});
      if(contextual.fields.date)next.date=contextual.fields.date;
      next.assumptions=contextual.assumptions||[];
    }
    return next;
  }catch{return saved;}
}

/** Local notice extraction, with explicit missing-field and rule confirmation steps. */
export function createResetAnnouncement({onResult,onPending,onChange,onPause,onVoiceScene,getViewer}={}){
  const element=document.createElement('section');element.className='reset-announcement';element.hidden=true;
  element.setAttribute('aria-labelledby','announcement-heading');
  element.innerHTML=`<div class="announcement-heading"><div><h2 id="announcement-heading">公告说的时间，换到北京是几点？</h2></div></div>
    <div class="announcement-input-row"><label for="announcement-text">粘贴公告里的时间原话<textarea id="announcement-text" rows="2" maxlength="6000" placeholder="例如：Quota resets on 2026-11-02 at 9:00 AM PT."></textarea></label><button type="button" id="announcement-extract" class="announcement-primary">识别并换算</button></div>
    <div class="announcement-examples"><span>试填</span><button type="button" data-announcement-example="event">某天 9 AM PT</button><button type="button" data-announcement-example="daily">每天 00:00 UTC</button><button type="button" data-announcement-example="duration">5 小时 30 分钟后</button><button type="button" data-announcement-example="deadline">今天 PST 午夜前</button><small>原话在本机识别</small></div>
    <p id="announcement-parse-status" class="announcement-note" role="status">缺少日期、时区或计时起点时，会在这里引导补齐。</p>
    <div id="announcement-rule-choice" class="announcement-rule-choice" hidden><p>原文同时包含每日规则和具体日期。请确认：这次先只换算原文写明日期的那一次。</p><button type="button" id="announcement-confirm-event">只换算公告写明日期的这一次</button><small>从哪天生效、以后每天怎样执行，需要产品另行明确；不会把写明的日期忽略掉。</small></div>
    <div id="announcement-context" class="announcement-context" hidden><span id="announcement-context-lines"></span><button type="button" id="announcement-edit-context">改日期</button></div>
    <details id="announcement-editor" class="announcement-editor"><summary id="announcement-editor-summary">手动填写或修正时间信息</summary><div class="announcement-editor-top"><p id="announcement-needed" class="announcement-note"></p><button type="button" id="announcement-show-all" hidden>显示全部字段</button></div>
    <div id="announcement-date-choices" class="announcement-date-choices" hidden aria-label="选择公告所指日期"></div><div class="announcement-fields"><label id="announcement-kind-wrap">公告说的是<select id="announcement-kind"><option value="event">某个明确日期的一次事件</option><option value="daily">每天固定的当地钟点</option><option value="duration">从明确起点经过一段时长</option></select></label>
      <label id="announcement-format-wrap">时间写法<select id="announcement-format"><option value="clock">日期 + 钟点 + 时区</option><option value="timestamp">完整时间戳（Z / UTC 偏移）</option></select></label>
      <label id="announcement-relation-wrap">公告给出的是<select id="announcement-relation"><option value="at">明确发生时刻</option><option value="before">在某个截止边界之前</option></select></label>
      <label id="announcement-date-wrap"><span id="announcement-date-label">公告采用的当地日期</span><input id="announcement-date" type="date"><small id="announcement-date-hint" hidden>这是公告所指地区的日历日期，可按原帖发布时间修正。</small></label>
      <label id="announcement-clock-wrap"><span id="announcement-clock-label">公告采用的当地钟点</span><input id="announcement-clock" type="time"></label>
      <label id="announcement-boundary-wrap" hidden>“午夜前”指哪一个日界<select id="announcement-boundary"><option value="">需要确认开始还是结束</option><option value="end-of-day">这一天结束前（翌日 00:00 边界）</option><option value="start-of-day">这一天开始前（当天 00:00 边界）</option></select></label>
      <label id="announcement-source-wrap">公告采用的时区<select id="announcement-source"><option value="">请选择原文写明的时间名称</option>${timeExpressions.map(term=>`<option value="${esc(term.id)}">${esc(term.label)}</option>`).join('')}<option value="__offset">明确的 UTC 偏移…</option></select></label>
      <label id="announcement-offset-wrap" hidden>公告写明的 UTC 偏移<input id="announcement-offset" placeholder="UTC+05:30" autocomplete="off"></label>
      <label id="announcement-timestamp-wrap" class="announcement-wide" hidden>带时区偏移的完整时间戳<input id="announcement-timestamp" placeholder="2026-11-02T09:00:00-08:00" autocomplete="off"><small>末尾 Z 表示 UTC；没有 Z 或偏移时仍缺时区。</small></label>
      <label id="announcement-publication-wrap" class="announcement-wide" hidden>实际发布／截图时刻（UTC，可选）<input id="announcement-publication" type="datetime-local" step="1"><small>未提供时按本次点击的现在发布来分析；“今天”仍属于公告所用时区。</small><button type="button" id="announcement-apply-publication">按这个发布时间重新分析原文</button></label>
      <fieldset id="announcement-hours-wrap" class="announcement-duration" hidden><legend>经过多长时间</legend><input id="announcement-hours" type="hidden"><div><label>小时<input id="announcement-duration-hours" type="number" min="0" max="1000" step="any" placeholder="0"></label><label>分钟<input id="announcement-duration-minutes" type="number" min="0" step="any" placeholder="0"></label><label>秒<input id="announcement-duration-seconds" type="number" min="0" step="any" placeholder="0"></label></div></fieldset>
      <label id="announcement-start-wrap" class="announcement-wide" hidden>这句倒计时对应的起点（UTC）<input id="announcement-start" type="datetime-local" step="1"><small>旧公告应填当时的发布／截图时间；刚看到的倒计时可以用下面的按钮。</small><button id="announcement-start-now" type="button">以我现在看到公告的时刻为起点</button></label>
    </div><p id="announcement-daily-note" class="announcement-note" hidden>按真实现在寻找每日规则的下一次，使用事件日期当天的时区规则。</p>
    <button type="button" id="announcement-confirm-fields" hidden>我已核对这些字段，按填写值换算</button>
    <div class="announcement-actions"><button type="button" id="announcement-calculate" class="announcement-primary">换算补齐后的时间</button><span id="announcement-pending"></span></div></details>
    <div id="announcement-error" class="announcement-error" role="status"></div><div id="announcement-fold" class="announcement-fold"></div>
    <section id="announcement-result" class="announcement-result" aria-label="我的公告换算结果" hidden tabindex="-1">
      <div class="announcement-result-title"><strong id="announcement-result-heading"></strong><span id="announcement-countdown"></span></div>
      <p id="announcement-policy" class="announcement-policy" hidden></p>
      <div id="announcement-clocks" class="announcement-clocks"></div>
      <div id="announcement-deadline-note" class="announcement-deadline-note" hidden></div><div id="announcement-alternatives" class="announcement-alternatives" hidden></div>
      <details class="announcement-concepts"><summary><span data-announcement-concept="PT"><b>PT</b> 当地时间统称</span> · <span data-announcement-concept="PST"><b>PST</b> 标准时 UTC−8</span> · <span data-announcement-concept="PDT"><b>PDT</b> 夏令时 UTC−7</span></summary><p>PT 按洛杉矶在事件日期使用的规则换算：标准时间叫 PST，北京快 16 小时；夏令时间叫 PDT，北京快 15 小时。午夜始终是所采用钟表的 00:00。普通帖子写 PST 时，本工具暂按当地 PT 理解；明确固定偏移时按原文。</p></details>
      <div class="announcement-result-actions"><button id="announcement-voice" type="button">${initialVoice}</button><button id="announcement-copy" type="button">复制确认句</button><button id="announcement-edit-result" type="button">修改</button><button id="announcement-next" type="button" hidden>按现在找下一次</button></div>
      <nav id="announcement-scene-nav" class="announcement-scene-nav" aria-label="跟着地球逐步理解这次公告"></nav><div id="announcement-current-cue" class="announcement-current-cue" hidden><strong></strong><p aria-live="polite"></p><div id="announcement-inline-utc" class="announcement-inline-utc" data-announcement-clock="utc" hidden></div><div class="announcement-cue-controls"><button type="button" id="announcement-cue-prev">← 上一句</button><span id="announcement-cue-position"></span><button type="button" id="announcement-cue-next">下一句 →</button></div></div>
      <audio id="announcement-audio" controls preload="metadata" hidden aria-label="MiniMax 我的公告时间换算，当前讲解段"></audio><p id="announcement-voice-status" class="announcement-note" role="status">MiniMax · 分段讲解，地球随每段同步</p>
      <details id="announcement-result-more"><summary>UTC、采用的日期与计算依据</summary><p id="announcement-utc-detail" class="announcement-note"></p><div id="announcement-recognized" class="announcement-recognized" hidden aria-label="本次采用的时间信息"></div><p id="announcement-result-detail" class="announcement-note"></p><div id="announcement-warnings" class="announcement-warnings"></div><p class="announcement-note">公告是否涉及额度恢复、功能上线或订阅更新，以公告实际说明为准。</p></details>
      <details id="announcement-transcript" hidden><summary>本次播报讲稿</summary><p></p></details>
    </section>`;
  const resultElement=element.querySelector('#announcement-result');
  const $=selector=>element.querySelector(selector)||resultElement.querySelector(selector),audio=$('#announcement-audio'),editor=$('#announcement-editor');
  let result=null,foldPick=null,voiceToken=0,busy=false,opened=false,restoring=false,renderedMinute='',parseWarnings=[],needsRuleChoice=false,needsBoundaryChoice=false,needsDateContext=false,assumptions=[],contextReference=null,contextNeedsReanalysis=false,legacyReview=false,missingOnly=false,missingKeys=new Set(),hasExtraction=false;
  let scenes=[],sceneIndex=-1,sceneResult=null,clipScene=-1,voiceConfig=null;
  let reading=null,lockedOccurrenceDate=null,dateResolution=null,dateCandidates=[],timeQualifier=null;
  const clips=new Map();
  const viewer=()=>getViewer?.()||{id:'beijing',name:'北京',zone:'Asia/Shanghai'};
  const fieldMap={text:'announcement-text',kind:'announcement-kind',format:'announcement-format',date:'announcement-date',time:'announcement-clock',source:'announcement-source',offset:'announcement-offset',timestamp:'announcement-timestamp',hours:'announcement-hours',start:'announcement-start',relation:'announcement-relation',boundary:'announcement-boundary',publication:'announcement-publication'};
  function pause(){
    voiceToken++;busy=false;audio.pause();audio.removeAttribute('src');audio.load();audio.hidden=true;
    $('#announcement-voice').disabled=false;$('#announcement-voice').textContent=initialVoice;
    $('#announcement-voice-status').textContent=`${voiceProviderLabel()} · 分段讲解，地球随每段同步`;
    $('#announcement-transcript').hidden=true;$('#announcement-transcript').open=false;$('#announcement-transcript p').textContent='';
    sceneIndex=-1;clipScene=-1;$('#announcement-current-cue').hidden=true;onVoiceScene?.(null);paintSceneNav();markScene();
  }
  function pending({notify=true}={}){
    pause();onPause?.();result=null;sceneResult=null;scenes=[];paintSceneNav();foldPick=null;lockedOccurrenceDate=null;renderedMinute='';resultElement.hidden=true;
    resultElement.querySelector('[data-announcement-fallback-copy]')?.remove();
    $('#announcement-fold').replaceChildren();$('#announcement-error').textContent='';
    $('#announcement-needed').textContent='';
    $('#announcement-pending').textContent='补齐后换算；修改输入会清除旧结果。';$('#announcement-copy').textContent='复制时间确认句';
    if(notify){onPending?.();onChange?.();}
  }
  function setDuration(value){
    $('#announcement-hours').value=value===undefined||value===null?'':String(value);
    const n=Number(value),blank=value===undefined||value===null||value==='';
    const ms=blank||!Number.isFinite(n)?null:Math.round(n*3600000);
    $('#announcement-duration-hours').value=ms===null?'':String(Math.floor(ms/3600000));
    $('#announcement-duration-minutes').value=ms===null?'':String(Math.floor(ms%3600000/60000));
    $('#announcement-duration-seconds').value=ms===null?'':String(ms%60000/1000);
  }
  function readDuration(){
    const inputs=['hours','minutes','seconds'].map(part=>$('#announcement-duration-'+part));
    if(inputs.some(input=>input.validity.badInput))throw new RangeError('请完整填写时长数字。');
    const values=inputs.map(input=>input.value);
    if(values.every(value=>value===''))return '';
    const numbers=values.map(value=>value===''?0:Number(value));
    if(numbers.some(value=>!Number.isFinite(value)||value<0))throw new RangeError('时长的小时、分钟和秒都应是非负数。');
    return numbers[0]+numbers[1]/60+numbers[2]/3600;
  }
  function fields(){
    const kind=$('#announcement-kind').value,timestamp=kind==='event'&&$('#announcement-format').value==='timestamp'?$('#announcement-timestamp').value.trim():undefined;
    const source=$('#announcement-source').value==='__offset'?$('#announcement-offset').value.trim():$('#announcement-source').value;
    const start=$('#announcement-start').value,hours=kind==='duration'?readDuration():$('#announcement-hours').value;
    if(kind==='duration')$('#announcement-hours').value=String(hours);
    return {kind,date:kind==='event'?$('#announcement-date').value:undefined,time:$('#announcement-clock').value,source,timestamp,hours,start:start?`${start}Z`:undefined,asOf:new Date(),foldPick,needsRuleChoice,relation:$('#announcement-relation').value,boundary:$('#announcement-boundary').value||undefined,needsBoundaryChoice,assumptions,dateResolution};
  }
  function collectMissing(){
    const kind=$('#announcement-kind').value,keys=[];
    if(kind==='duration'){
      if(!$('#announcement-hours').value)keys.push('hours');if(!$('#announcement-start').value)keys.push('start');
    }else if(kind==='event'&&$('#announcement-format').value==='timestamp'){
      if(!$('#announcement-timestamp').value.trim())keys.push('timestamp');
    }else{
      if(kind==='event'&&!$('#announcement-date').value)keys.push('date');
      if(!$('#announcement-clock').value)keys.push('clock');
      if(!$('#announcement-source').value)keys.push('source');
      else if($('#announcement-source').value==='__offset'&&!$('#announcement-offset').value.trim())keys.push('offset');
      if(needsBoundaryChoice&&!$('#announcement-boundary').value)keys.push('boundary');
    }
    return new Set(keys);
  }
  function summary(){
    const f={kind:$('#announcement-kind').value,date:$('#announcement-date').value,time:$('#announcement-clock').value,timestamp:$('#announcement-timestamp').value.trim(),hours:$('#announcement-hours').value};
    const source=$('#announcement-source').value==='__offset'?$('#announcement-offset').value.trim():timeExpressions.find(term=>term.id===$('#announcement-source').value)?.label;
    const bits=[];if($('#announcement-relation').value==='before')bits.push('截止边界之前');
    if(f.kind==='duration'){if(f.hours!=='')bits.push(`经过 ${announcementDurationLabel(f.hours)}`);if($('#announcement-start').value)bits.push(`起点 ${$('#announcement-start').value.replace('T',' ')} UTC`);}
    else if(f.kind==='event'&&$('#announcement-format').value==='timestamp'){if(f.timestamp)bits.push(f.timestamp);}
    else{if(f.kind==='daily')bits.push('每天');else if(f.date)bits.push(f.date);if(f.time)bits.push(f.time);if(source)bits.push(source);}
    if($('#announcement-boundary').value==='end-of-day')bits.push('所指日期结束前（翌日 00:00 边界）');
    if($('#announcement-boundary').value==='start-of-day')bits.push('所指日期开始前（当天 00:00 边界）');
    $('#announcement-recognized').hidden=!bits.length;
    $('#announcement-recognized').textContent=bits.length?`本次采用：${bits.join(' · ')}`:'';
    const differentPublicationDates=reading?.switchable&&contextReference&&announcementPublicationDateDiffers(contextReference);
    const contextText=announcementDateSummary({dateResolution,date:$('#announcement-date').value,assumptions,publication:!!$('#announcement-publication').value,boundary:$('#announcement-boundary').value,differentPublicationDates,timeQualifier,hasClock:!!$('#announcement-clock').value});
    $('#announcement-context').hidden=!contextText;$('#announcement-context-lines').textContent=contextText;
  }
  function layout(){
    const kind=$('#announcement-kind').value,isEvent=kind==='event',isDuration=kind==='duration',timestamp=isEvent&&$('#announcement-format').value==='timestamp',clock=!isDuration&&!timestamp;
    const show=(id,applicable,key)=>{$('#'+id).hidden=!applicable||(missingOnly&&!missingKeys.has(key));};
    show('announcement-kind-wrap',true,'kind');show('announcement-format-wrap',isEvent,'format');show('announcement-relation-wrap',!isDuration,'relation');
    show('announcement-date-wrap',isEvent&&!timestamp,'date');show('announcement-clock-wrap',clock,'clock');show('announcement-source-wrap',clock,'source');
    show('announcement-offset-wrap',clock&&$('#announcement-source').value==='__offset','offset');
    show('announcement-timestamp-wrap',timestamp,'timestamp');show('announcement-hours-wrap',isDuration,'hours');show('announcement-start-wrap',isDuration,'start');
    show('announcement-boundary-wrap',!isDuration&&$('#announcement-relation').value==='before'&&(needsBoundaryChoice||Boolean($('#announcement-boundary').value)),'boundary');
    $('#announcement-publication-wrap').hidden=!needsDateContext||missingOnly;
    $('#announcement-date-label').textContent=needsDateContext?'帖子所指的当地日期':'公告采用的当地日期';$('#announcement-date-hint').hidden=!needsDateContext;
    $('#announcement-clock-label').textContent=timeQualifier?`请确认 ${timeQualifier.toUpperCase()} 的截止钟点`:'公告采用的当地钟点';
    $('#announcement-daily-note').hidden=kind!=='daily';$('#announcement-show-all').hidden=!missingOnly;
    $('#announcement-rule-choice').hidden=!needsRuleChoice;$('#announcement-confirm-fields').hidden=!legacyReview;
    $('#announcement-editor-summary').textContent=missingOnly?'补充缺少的时间信息':'手动填写或修正时间信息';paintDateChoices();summary();
  }
  function paintDateChoices(){
    const choices=$('#announcement-date-choices');choices.replaceChildren();choices.hidden=!dateCandidates.length||!!$('#announcement-date').value;
    if(choices.hidden)return;
    for(const candidate of dateCandidates){if(!/^\d{4}-\d{2}-\d{2}$/.test(candidate?.date||''))continue;const button=document.createElement('button');button.type='button';button.textContent=candidate.label&&!candidate.label.includes(candidate.date)?`${candidate.label} · ${candidate.date}`:candidate.label||candidate.date;button.onclick=()=>{pending();$('#announcement-date').value=candidate.date;dateResolution={...(dateResolution||{}),status:'resolved',resolvedDate:candidate.date,label:`已选择公告当地 ${candidate.date}，可修改。`,assumed:false,canEdit:true};dateCandidates=[];missingKeys=collectMissing();missingOnly=missingKeys.size>0;layout();if(!missingKeys.size)calculate();};choices.append(button);}
  }
  function openMissing(message){
    missingKeys=collectMissing();missingOnly=missingKeys.size>0;
    $('#announcement-needed').textContent=message||'核对下面的字段，补齐后即可换算。';
    editor.open=!needsRuleChoice||missingKeys.size>0;layout();
  }
  function extract(){
    pending();reading=null;dateResolution=null;dateCandidates=[];timeQualifier=null;parseWarnings=[];needsRuleChoice=false;needsBoundaryChoice=false;needsDateContext=false;assumptions=[];contextReference=null;contextNeedsReanalysis=false;legacyReview=false;hasExtraction=true;
    for(const key of ['date','time','source','offset','timestamp','hours','start'])$('#'+fieldMap[key]).value='';setDuration('');
    $('#announcement-relation').value='at';$('#announcement-boundary').value='';
    let parsed;
    try{const publication=$('#announcement-publication').value,asOf=publication?new Date(`${publication}Z`):new Date(),text=$('#announcement-text').value,selected=resolveAnnouncementReading(parseResetAnnouncement(text),{text});reading=selected.reading||null;parsed=resolveAnnouncementContext(selected,{asOf,defaultPublication:true});contextReference=parsed.reference||asOf;dateResolution=parsed.dateResolution||null;dateCandidates=Array.isArray(parsed.dateCandidates)?parsed.dateCandidates:[];timeQualifier=parsed.timeQualifier||null;if(parsed.assumptions?.length)assumptions=[publication?`发布时间采用你填写的 UTC 时刻 ${stamp(asOf)}。`:`未提供发布时间，暂按本次点击时的现在发布（${stamp(asOf)}）。`,...parsed.assumptions];}catch(error){$('#announcement-parse-status').textContent=`未能识别：${error.message}`;missingOnly=false;editor.open=true;layout();onChange?.();return false;}
    $('#announcement-kind').value=parsed.kind||'event';$('#announcement-format').value=parsed.fields?.timestamp?'timestamp':'clock';
    for(const key of ['date','time','timestamp'])if(parsed.fields?.[key]!==undefined)$('#'+fieldMap[key]).value=String(parsed.fields[key]);
    setDuration(parsed.fields?.hours);
    const source=parsed.fields?.source;
    if(source){if(timeExpressions.some(term=>term.id===source))$('#announcement-source').value=source;else{$('#announcement-source').value='__offset';$('#announcement-offset').value=source;}}
    $('#announcement-relation').value=parsed.relation||parsed.fields?.relation||'at';$('#announcement-boundary').value=parsed.boundary||parsed.fields?.boundary||'';
    parseWarnings=parsed.warnings||[];needsRuleChoice=parsed.needsRuleChoice===true;needsBoundaryChoice=parsed.needsBoundaryChoice===true;needsDateContext=parsed.needsDateContext===true||Boolean(parsed.boundary||parsed.fields?.boundary)||Boolean(parsed.relativeDate)||Boolean(dateResolution);
    if(needsBoundaryChoice)$('#announcement-boundary').value='';
    const missing=parsed.missing?.length?`还需：${parsed.missing.join('、')}。`:'';
    $('#announcement-parse-status').textContent=[parsed.message,missing,...parseWarnings].filter(Boolean).join(' ');
    summary();
    if(parsed.status==='recognized'&&!needsRuleChoice&&!needsBoundaryChoice){missingOnly=false;layout();return calculate();}
    if(parsed.status==='unsupported'){missingOnly=false;editor.open=true;$('#announcement-needed').textContent='这段文字还不能自动识别，请直接填写公告给出的时间。';layout();}
    else openMissing(missing||'请先确认公告采用哪条时间规则。');
    onChange?.();return false;
  }
  function describe(model){return model.relation==='before'?'最晚在这个截止边界之前':model.kind==='daily'?'每日规则的下一次':model.kind==='duration'?'倒计时结束时刻':'公告指定的这一次';}
  function clockCard(label,local,note='',primary=false,role='source'){
    const time=local.second&&local.time.length===5?`${local.time}:${String(local.second).padStart(2,'0')}`:local.time;
    return `<div data-announcement-clock="${esc(role)}"${primary?' class="announcement-clock-primary"':''}><small>${esc(label)}</small><strong><b data-announcement-field="time">${esc(time)}</b><em data-announcement-field="date">${esc(local.date)}</em></strong><span>${esc(note)}</span></div>`;
  }
  function render(now=new Date()){
    if(!result)return;
    const model=result,at=model.instant,bj=partsAt(at,'Asia/Shanghai'),utc=partsAt(at,'UTC'),local=sourceClock(at,model.source),target=viewer(),deadline=model.relation==='before';
    resultElement.hidden=!opened;resultElement.dataset.kind=model.kind;$('#announcement-result-heading').textContent=deadline?'在这个时间之前':describe(model);$('#announcement-countdown').textContent=announcementTimingLabel(at,now,model.relation);
    resultElement.querySelector('.announcement-concepts').hidden=!['PT','PST','PDT'].includes(model.source?.id)&&model.reading?.originalSource!=='PST';
    const policy=announcementReadingSummary(model);$('#announcement-policy').textContent=policy.notice;$('#announcement-policy').hidden=!policy.notice;
    const cards=[];
    if(model.kind==='duration')cards.push(clockCard('计时起点 · UTC',partsAt(model.start,'UTC'),`经过 ${announcementDurationLabel(model.hours??$('#announcement-hours').value)}`));
    else cards.push(clockCard(`${model.source?.id==='PT'?'太平洋当地':model.source?.id||'公告当地'}${deadline?' · 在此之前':''}`,local,local.label));
    cards.push(clockCard(deadline?'对应北京 · 在此之前':'对应北京时间',bj,'UTC+08:00',true,'target'));
    if(target.zone!=='Asia/Shanghai'&&target.zone!=='UTC')cards.push(clockCard(`${deadline?'在此之前':'显示城市'} · ${target.name}`,partsAt(at,target.zone),formatOffset(offsetMinutes(at,target.zone)),false,'viewer'));
    $('#announcement-clocks').innerHTML=cards.join('');$('#announcement-utc-detail').innerHTML=`<span data-announcement-clock="utc">同一瞬间 · UTC <span data-announcement-field="date">${esc(utc.date)}</span> <b data-announcement-field="time">${esc(utc.time)}</b></span> · ${esc(iso(at))}`;
    $('#announcement-result-detail').textContent=`比较基准：北京时间 ${partsAt(now,'Asia/Shanghai').date} ${partsAt(now,'Asia/Shanghai').time}。${deadline?`地球定格在截止边界；原文只承诺此前抵达，没有给出实际完成时刻。所指当地日期为 ${model.contextDate||$('#announcement-date').value}。${(model.assumptions||assumptions).join(' ')}`:model.kind==='daily'?`本次寻找下一次的基准为 ${stamp(model.reference||now)}；到达后可点击“按现在找下一次”。`:model.kind==='duration'?`起点为 ${stamp(model.start)}，经过 ${announcementDurationLabel(model.hours??$('#announcement-hours').value)}。`:'日期与钟点已同步到旁边的地球和全球城市钟。'}`;
    if(model.reading?.switchable)$('#announcement-result-detail').textContent+=' 两种解释沿用已确定的同一当地日期，仅比较 PT/PST 规则；若原帖的“今天”另有所指，可改日期。';
    $('#announcement-deadline-note').hidden=!deadline;$('#announcement-deadline-note').textContent=deadline?'这是截止边界，实际可能更早；不代表恰在零点重置。':'';
    $('#announcement-alternatives').hidden=!policy.supplement;$('#announcement-alternatives').replaceChildren();
    if(policy.supplement){const p=document.createElement('p');p.innerHTML=esc(policy.supplement).replace(/(\d{2}:\d{2}(?::\d{2})?)/g,'<strong>$1</strong>');$('#announcement-alternatives').append(p);if(policy.toggleMode){const button=document.createElement('button');button.type='button';button.id='announcement-switch-reading';button.textContent=policy.toggleLabel;button.onclick=()=>switchReading(policy.toggleMode);$('#announcement-alternatives').append(button);}}
    $('#announcement-warnings').replaceChildren(...[...new Set([...(model.warnings||[]),...parseWarnings])].map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
    $('#announcement-next').hidden=model.kind!=='daily'&&!(deadline&&needsDateContext&&!$('#announcement-publication').value);$('#announcement-next').textContent=deadline?'按现在重新分析':'按现在找下一次';renderedMinute=now.toISOString().slice(0,16)+'|'+target.zone;
    ensureScenes();paintSceneNav();markScene();
  }
  function calculate(){
    pause();onPause?.();$('#announcement-error').textContent='';$('#announcement-fold').replaceChildren();
    try{
      if(legacyReview)throw new Error('旧版识别结果需要重新核对。请重新识别原公告，或展开字段并确认填写值。');
      if(contextNeedsReanalysis)throw new Error('发布时间已修改。请点击“按这个发布时间重新分析原文”，以重新确定帖子所指的当地日期。');
      if($('#announcement-kind').value==='event'&&$('#announcement-format').value==='timestamp'&&!$('#announcement-timestamp').value.trim())throw new Error('请填写末尾带 Z 或 UTC 偏移的完整时间戳。');
      const model=calculateAnnouncementReading(fields(),{reading,occurrenceDate:lockedOccurrenceDate});
      if(model.status!=='ready'){
        result=null;resultElement.hidden=true;onPending?.();
        if(model.status==='incomplete'){$('#announcement-error').textContent=`还不能确定同一个瞬间，请补充：${model.missing.join('、')}。`;openMissing(model.missing.join('、'));}
        else if(model.status==='gap'){$('#announcement-error').textContent='这个当地钟点因调钟不存在。请确认公告的实际时间或产品如何处理这次调钟。';$('#announcement-needed').textContent='请核对当天的当地钟点；也可以改填产品给出的明确 UTC 时间戳。';missingOnly=false;editor.open=true;layout();}
        else{
          $('#announcement-error').textContent=model.kind==='daily'?'这条每日规则的下一次钟点会出现两次。请先确认产品采用哪次，再以明确日期或 UTC 时间戳换算。':'这个钟点出现两次，请确认是哪一次，再选择：';
          $('#announcement-needed').textContent=model.kind==='daily'?'确认产品怎样处理重复钟点后，再用明确日期或 UTC 时间戳换算。':'这天同一个钟点出现两次，请确认公告采用第一次还是第二次。';
          for(const [index,at]of model.candidates.entries()){
            const button=document.createElement('button');button.type='button';button.textContent=`第 ${index+1} 次 · ${stamp(at)}`;
            if(model.kind==='daily')button.disabled=true;else button.onclick=()=>{foldPick=index;calculate();};$('#announcement-fold').append(button);
          }
          missingOnly=false;editor.open=true;layout();
        }
        $('#announcement-pending').textContent='信息尚未唯一，地球暂不显示旧结果。';onChange?.();return false;
      }
      result=model;reading=model.reading||reading;editor.open=false;missingOnly=false;render(new Date());summary();$('#announcement-pending').textContent='换算已同步到地球。';
      $('#announcement-parse-status').textContent='';
      const source=model.source||{};onResult?.({instant:model.instant,description:describe(model),sourceZone:source.zone,sourceId:source.id,sourceLabel:source.label,relation:model.relation,boundary:model.boundary,model});
      if(opened&&!restoring)resultElement.scrollIntoView({block:'nearest',behavior:'instant'});
      onChange?.();return true;
    }catch(error){result=null;resultElement.hidden=true;$('#announcement-error').textContent=error.message;$('#announcement-pending').textContent='请核对输入后重新换算。';missingOnly=false;editor.open=true;layout();onPending?.();onChange?.();return false;}
  }
  function switchReading(mode){
    if(!reading?.switchable)return;
    if(result?.kind==='daily')lockedOccurrenceDate=result.localDate||null;
    const text=$('#announcement-text').value,selected=resolveAnnouncementReading({kind:$('#announcement-kind').value,fields:{...fields(),source:reading.originalSource},reading},{text,interpretation:mode});
    reading=selected.reading;$('#announcement-source').value=reading.activeSource;foldPick=null;calculate();
  }
  async function json(url,options={}){const response=await voiceFetch(url,options);let data;try{data=await response.json();}catch{throw new Error('语音服务暂时无法读取。');}if(!response.ok)throw new Error(data.error?.message||data.error||'语音生成失败。');return data;}
  const visible=()=>opened&&element.isConnected&&resultElement.isConnected&&resultElement.getClientRects().length>0&&!document.hidden;
  function ensureScenes(){if(sceneResult===result)return;sceneResult=result;scenes=buildAnnouncementScenes(result,{contextDate:$('#announcement-date').value,assumptions,publication:!!$('#announcement-publication').value});sceneIndex=-1;clipScene=-1;}
  function jumpCue(index){
    if(!scenes[index])return;const resume=!audio.paused||busy;voiceToken++;busy=false;audio.pause();audio.removeAttribute('src');audio.load();audio.hidden=true;clipScene=-1;
    if(resume)void playScene(index);else{applyScene(index);$('#announcement-voice').disabled=false;$('#announcement-voice').textContent='▶ 听这一句';}
  }
  function paintSceneNav(){
    const nav=$('#announcement-scene-nav');nav.replaceChildren();nav.hidden=!scenes.length;const current=announcementCuePosition(scenes,sceneIndex);
    for(const [order,group]of announcementCueGroups(scenes).entries()){const button=document.createElement('button');button.type='button';button.textContent=`${order+1} ${group.label}`;button.setAttribute('aria-pressed',String(current?.group===group.id));button.onclick=()=>jumpCue(group.index);nav.append(button);}
    $('#announcement-cue-prev').disabled=sceneIndex<=0;$('#announcement-cue-next').disabled=sceneIndex<0||sceneIndex>=scenes.length-1;
    $('#announcement-cue-position').textContent=current?`第 ${sceneIndex+1} / ${scenes.length} 句`:'';
  }
  function markScene(){
    const scene=scenes[sceneIndex],highlight=scene?.highlight||{};resultElement.dataset.interpretation=scene?.interpretation||'primary';
    resultElement.querySelectorAll('.is-speaking').forEach(node=>node.classList.remove('is-speaking'));$('#announcement-inline-utc').hidden=highlight.clock!=='utc';
    if(['PT','PST','PDT'].includes(highlight.concept))resultElement.querySelector(`[data-announcement-concept="${highlight.concept}"]`)?.classList.add('is-speaking');
    if(['source','utc','target'].includes(highlight.clock)){
      const clock=resultElement.querySelector(`[data-announcement-clock="${highlight.clock}"]`);
      if(['date','time'].includes(highlight.field))clock?.querySelector(`[data-announcement-field="${highlight.field}"]`)?.classList.add('is-speaking');else clock?.classList.add('is-speaking');
    }
    if(highlight.deadline)$('#announcement-deadline-note').classList.add('is-speaking');
    if(scene?.interpretation==='alternative')$('#announcement-alternatives').classList.add('is-speaking');
    const countdown=$('#announcement-countdown');countdown.textContent=(scene?.interpretation==='alternative'?'主解释 · ':'')+countdown.textContent.replace(/^主解释 · /,'');
  }
  function applyScene(index){
    if(!scenes[index])return;sceneIndex=index;const scene=scenes[index],position=announcementCuePosition(scenes,index);
    $('#announcement-current-cue').hidden=false;$('#announcement-current-cue strong').textContent=`${cueGroupLabels[position?.group]||scene.title} · ${position?.index||1} / ${position?.count||1}`;
    const caption=scene.caption||scene.text||scene.title;$('#announcement-current-cue p').textContent=caption;$('#announcement-current-cue p').hidden=!caption;
    const utc=partsAt(scene.instant,'UTC'),utcTime=utc.time+(utc.second?':'+String(utc.second).padStart(2,'0'):'');$('#announcement-inline-utc').innerHTML=`UTC <span data-announcement-field="date">${esc(utc.date)}</span> <b data-announcement-field="time">${esc(utcTime)}</b>`;
    $('#announcement-transcript').hidden=false;$('#announcement-transcript p').textContent=scenes.map(s=>s.text).join('\n\n');
    paintSceneNav();markScene();onVoiceScene?.(scene);
  }
  async function prepareClip(index,config){
    const scene=scenes[index];if(!scene)return null;const cacheKey=[config.model,config.voiceId,scene.text].join('|');
    if(!clips.has(cacheKey))clips.set(cacheKey,json('/api/voice/synthesize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chapterId:`my-announcement-${scene.id}`,text:scene.text,model:config.model,voiceId:config.voiceId})}).catch(error=>{clips.delete(cacheKey);throw error;}));
    return clips.get(cacheKey);
  }
  async function playScene(index){
    if(!visible()||!result)return;ensureScenes();if(!scenes[index])return;
    const token=++voiceToken;busy=true;audio.pause();audio.removeAttribute('src');audio.load();audio.hidden=true;clipScene=-1;applyScene(index);$('#announcement-voice').disabled=true;$('#announcement-voice').textContent='正在准备这一句…';$('#announcement-voice-status').textContent=`${voiceProviderLabel()} · 正在准备第 ${index+1} / ${scenes.length} 句`;
    document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});
    try{
      const config=voiceConfig||await json('/api/voice/status');if(token!==voiceToken)return;if(!config.configured)throw new Error('MiniMax 暂未连接，请检查已有语音配置。');voiceConfig=config;
      const clip=await prepareClip(index,config);if(token!==voiceToken||!visible())return;if(typeof clip?.audioUrl!=='string')throw new Error('语音结果暂时无法播放。');
      clipScene=index;audio.src=clip.audioUrl;audio.hidden=false;await audio.play();if(token!==voiceToken)return;
      $('#announcement-voice-status').textContent=`${voiceProviderLabel()} · 第 ${index+1} / ${scenes.length} 句 · 对应标注已高亮`;
      if(index+1<scenes.length)void prepareClip(index+1,config).catch(()=>{});
    }catch(error){if(token===voiceToken){audio.removeAttribute('src');audio.hidden=true;clipScene=-1;$('#announcement-voice-status').textContent=error.message;}}
    finally{if(token===voiceToken){busy=false;$('#announcement-voice').disabled=false;if(audio.paused)$('#announcement-voice').textContent='▶ 听这一句';}}
  }
  async function listen(){
    if(busy||!visible()||!result)return;
    if(!audio.paused){audio.pause();return;}
    ensureScenes();
    if(audio.src&&!audio.ended&&clipScene===sceneIndex){applyScene(sceneIndex);try{await audio.play();}catch{$('#announcement-voice-status').textContent='请点击音频播放器继续。';}return;}
    await playScene(audio.ended&&sceneIndex===scenes.length-1?0:Math.max(0,sceneIndex));
  }
  $('#announcement-extract').onclick=extract;$('#announcement-calculate').onclick=calculate;
  element.querySelectorAll('[data-announcement-example]').forEach(button=>button.onclick=()=>{$('#announcement-text').value=examples[button.dataset.announcementExample];extract();});
  $('#announcement-show-all').onclick=()=>{missingOnly=false;layout();};
  $('#announcement-confirm-event').onclick=()=>{pending();needsRuleChoice=false;legacyReview=false;$('#announcement-kind').value='event';layout();calculate();};
  $('#announcement-confirm-fields').onclick=()=>{legacyReview=false;calculate();};
  $('#announcement-edit-result').onclick=()=>{missingOnly=false;editor.open=true;layout();editor.scrollIntoView({block:'nearest',behavior:'instant'});};
  $('#announcement-edit-context').onclick=()=>{missingOnly=false;editor.open=true;layout();editor.scrollIntoView({block:'nearest',behavior:'instant'});};
  $('#announcement-apply-publication').onclick=extract;
  $('#announcement-next').onclick=()=>{lockedOccurrenceDate=null;return result?.relation==='before'?extract():calculate();};
  for(const input of element.querySelectorAll('input,select,textarea'))if(input.type!=='hidden')input.addEventListener('input',()=>{
    parseWarnings=[];
    if(input.id==='announcement-text'){
      reading=null;dateResolution=null;dateCandidates=[];timeQualifier=null;
      for(const key of ['date','time','source','offset','timestamp','hours','start','publication'])$('#'+fieldMap[key]).value='';setDuration('');
      $('#announcement-kind').value='event';$('#announcement-format').value='clock';$('#announcement-relation').value='at';$('#announcement-boundary').value='';needsRuleChoice=false;needsBoundaryChoice=false;needsDateContext=false;assumptions=[];contextReference=null;contextNeedsReanalysis=false;legacyReview=false;hasExtraction=false;missingOnly=false;editor.open=false;
      $('#announcement-parse-status').textContent='原话已修改，点击“识别并换算”，或手动填写新信息。';
    }else{
      legacyReview=false;
      if(['announcement-date','announcement-source','announcement-offset','announcement-format','announcement-timestamp','announcement-publication'].includes(input.id)){dateResolution=null;dateCandidates=[];}
      if(['announcement-source','announcement-offset','announcement-format','announcement-timestamp'].includes(input.id))reading=null;
      if(['announcement-date','announcement-clock','announcement-source','announcement-offset','announcement-boundary','announcement-relation','announcement-publication'].includes(input.id))assumptions=[];
      if(input.id==='announcement-publication'){contextNeedsReanalysis=true;$('#announcement-parse-status').textContent='发布时间已修改，请按这个发布时间重新分析原文，重新确定公告所指的当地日期。';}
      if(input.id==='announcement-boundary')needsBoundaryChoice=!$('#announcement-boundary').value;
      if(input.id==='announcement-clock'&&$('#announcement-clock').value!=='00:00'){$('#announcement-boundary').value='';needsBoundaryChoice=false;}
      if(input.id==='announcement-clock'&&timeQualifier&&$('#announcement-clock').value==='00:00'&&$('#announcement-relation').value==='before'&&!$('#announcement-boundary').value){needsBoundaryChoice=true;missingKeys.add('boundary');}
      if(input.id==='announcement-relation'&&$('#announcement-relation').value==='at'){$('#announcement-boundary').value='';needsBoundaryChoice=false;needsDateContext=false;}
      if(input.id.startsWith('announcement-duration-')){try{$('#announcement-hours').value=String(readDuration());}catch{$('#announcement-hours').value='';}}
      if(input.id==='announcement-kind'){
        if(needsRuleChoice){$('#announcement-kind').value='event';$('#announcement-parse-status').textContent='原文含明确日期。请先按上方按钮确认只换算写明日期的这一次。';}
        missingOnly=false;
      }
      if(input.id==='announcement-format')missingOnly=false;
      if(input.id==='announcement-source'&&$('#announcement-source').value==='__offset')missingKeys.add('offset');
    }
    pending();layout();
  });
  $('#announcement-start-now').onclick=()=>{pending();legacyReview=false;$('#announcement-start').value=new Date().toISOString().slice(0,19);$('#announcement-parse-status').textContent='你已选择从现在看到公告的时刻起算；旧公告请改成当时的 UTC 时刻。';calculate();};
  $('#announcement-copy').onclick=async()=>{
    if(!result)return;const target=viewer(),local=partsAt(result.instant,target.zone);
    const interpretation=result.reading?.switchable?(result.reading.mode==='strict'?'Using literal PST (fixed UTC-08:00). ':`Interpreting the post's PST as Pacific local time in America/Los_Angeles (${sourceClock(result.instant,result.source).label}). `):'';
    const text=interpretation+(result.relation==='before'?`Just to confirm: is ${iso(result.instant)} the deadline, meaning the update should arrive before this instant (${local.date} ${local.time} in ${target.name}, ${target.zone}, ${formatOffset(offsetMinutes(result.instant,target.zone))}), with no exact completion time stated?`:`Just to confirm: the update is at ${iso(result.instant)}, which is ${local.date} at ${local.time} in ${target.name} (${target.zone}, ${formatOffset(offsetMinutes(result.instant,target.zone))}). Is this a full quota reset or only part of the usage becoming available?`);
    try{await navigator.clipboard.writeText(text);$('#announcement-copy').textContent='已复制确认句';}catch{resultElement.querySelector('[data-announcement-fallback-copy]')?.remove();const copy=document.createElement('textarea');copy.dataset.announcementFallbackCopy='';copy.value=text;copy.setAttribute('aria-label','时间确认句，请按 Ctrl+C 复制');resultElement.append(copy);copy.focus();copy.select();}
  };
  $('#announcement-cue-prev').onclick=()=>jumpCue(sceneIndex-1);$('#announcement-cue-next').onclick=()=>jumpCue(sceneIndex+1);
  $('#announcement-voice').onclick=()=>void listen();
  audio.addEventListener('play',()=>{if(!visible()){pause();return;}document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});$('#announcement-voice').textContent='Ⅱ 暂停讲解';});
  audio.addEventListener('pause',()=>$('#announcement-voice').textContent=audio.src?'▶ 继续讲解':initialVoice);
  audio.addEventListener('seeked',()=>{if(clipScene===sceneIndex)applyScene(sceneIndex);});
  audio.addEventListener('ended',()=>{if(sceneIndex<scenes.length-1){void playScene(sceneIndex+1);return;}$('#announcement-voice').textContent='↺ 从第一步再听';$('#announcement-voice-status').textContent='讲解结束，画面保留当前解释。可点步骤重听。';queueMicrotask(()=>window.dispatchEvent(new CustomEvent('timeatlas:announcement-voice-ended')));});
  audio.addEventListener('error',()=>{if(audio.hasAttribute('src')){audio.removeAttribute('src');audio.hidden=true;$('#announcement-voice-status').textContent='音频读取失败，请重新播放。';}});
  editor.addEventListener('toggle',()=>{if(editor.open&&!hasExtraction){missingOnly=false;layout();}onChange?.();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('timeatlas:voice-settings-changed',()=>{voiceConfig=null;clips.clear();pause();});layout();
  return {element,resultElement,calculate,extract,pause,play:listen,open(){opened=true;element.hidden=false;resultElement.hidden=!result;if(result)render();},close(){opened=false;element.hidden=true;resultElement.hidden=true;pause();},refresh(now=new Date()){if(!result)return;if(now.toISOString().slice(0,16)+'|'+viewer().zone!==renderedMinute)render(now);else $('#announcement-countdown').textContent=announcementTimingLabel(result.instant,now,result.relation);markScene();},getState(){return {...Object.fromEntries(Object.entries(fieldMap).map(([key,id])=>[key,$('#'+id).value])),durationParts:Object.fromEntries(['hours','minutes','seconds'].map(part=>[part,$('#announcement-duration-'+part).value])),flowVersion:4,understandingVersion:1,dateResolution:dateResolution?{...dateResolution}:null,dateCandidates:dateCandidates.map(item=>({...item})),timeQualifier,reading:reading?{...reading}:null,lockedOccurrenceDate,contextReference:contextReference?.toISOString()||null,contextNeedsReanalysis,assumptions:[...assumptions],needsBoundaryChoice,needsDateContext,calculated:!!result,foldPick,parseWarnings:[...parseWarnings],needsRuleChoice,legacyReview,missingOnly,missingKeys:[...missingKeys],hasExtraction,editorOpen:editor.open};},restore(state={}){
    state=migrateAnnouncementState(state);reading=null;dateResolution=state.dateResolution&&typeof state.dateResolution.label==='string'?{...state.dateResolution,label:state.dateResolution.label.slice(0,600)}:null;dateCandidates=Array.isArray(state.dateCandidates)?state.dateCandidates.filter(item=>item&&/^\d{4}-\d{2}-\d{2}$/.test(item.date||'')).slice(0,4):[];timeQualifier=['eod','cob'].includes(state.timeQualifier)?state.timeQualifier:null;pending({notify:false});for(const [key,id]of Object.entries(fieldMap))$('#'+id).value=key==='kind'?'event':key==='format'?'clock':key==='relation'?'at':'';
    for(const [key,id]of Object.entries(fieldMap)){if(typeof state[key]!=='string')continue;const field=$('#'+id);if(field.tagName==='SELECT'&&![...field.options].some(option=>option.value===state[key]))continue;field.value=state[key].slice(0,6000);}
    setDuration($('#announcement-hours').value);if(state.flowVersion>=2&&state.durationParts&&typeof state.durationParts==='object')for(const part of ['hours','minutes','seconds'])if(typeof state.durationParts[part]==='string')$('#announcement-duration-'+part).value=state.durationParts[part].slice(0,40);parseWarnings=Array.isArray(state.parseWarnings)?state.parseWarnings.filter(value=>typeof value==='string').slice(0,10):[];
    foldPick=[0,1].includes(state.foldPick)?state.foldPick:null;needsRuleChoice=state.needsRuleChoice===true;hasExtraction=state.hasExtraction===true;needsBoundaryChoice=state.needsBoundaryChoice===true;needsDateContext=state.needsDateContext===true;contextNeedsReanalysis=state.contextNeedsReanalysis===true;contextReference=typeof state.contextReference==='string'&&Number.isFinite(Date.parse(state.contextReference))?new Date(state.contextReference):null;assumptions=Array.isArray(state.assumptions)?state.assumptions.filter(value=>typeof value==='string').slice(0,12):[];
    legacyReview=state.legacyReview===true||(state.calculated===true&&(![2,3,4].includes(state.flowVersion)||(state.flowVersion===2&&deadlineText(state.text))));missingOnly=state.missingOnly===true;
    missingKeys=new Set(Array.isArray(state.missingKeys)?state.missingKeys.filter(value=>['kind','format','relation','boundary','date','clock','source','offset','timestamp','hours','start'].includes(value)):[]);
    if(state.flowVersion===4&&state.reading?.version===1){const selectedSource=$('#announcement-source').value==='__offset'?$('#announcement-offset').value.trim():$('#announcement-source').value;reading=resolveAnnouncementReading({fields:{source:selectedSource,timestamp:$('#announcement-format').value==='timestamp'?$('#announcement-timestamp').value:undefined},reading:state.reading},{text:$('#announcement-text').value,interpretation:state.reading.mode==='strict'?'strict':'local'}).reading;}
    lockedOccurrenceDate=state.flowVersion===4&&/^\d{4}-\d{2}-\d{2}$/.test(state.lockedOccurrenceDate||'')?state.lockedOccurrenceDate:null;
    editor.open=state.editorOpen===true;
    if(legacyReview){if($('#announcement-kind').value==='daily'&&$('#announcement-date').value){needsRuleChoice=true;$('#announcement-kind').value='event';}missingOnly=false;$('#announcement-parse-status').textContent='换算器已更新，旧结果已停用。请重新识别原公告，或展开字段核对后再算。';}
    else $('#announcement-parse-status').textContent=needsRuleChoice?'请确认是原文写明日期的这一次，还是仍需向产品确认的每日生效规则。':'缺少日期、时区或计时起点时，会在这里引导补齐。';
    layout();if(state.calculated===true&&!legacyReview){restoring=true;try{calculate();}finally{restoring=false;}}
  }};
}
