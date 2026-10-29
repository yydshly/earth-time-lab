import {voiceFetch,voiceProviderLabel} from './recorded-voice.mjs';
import {routineProfiles} from './routine-atlas-data.mjs';
import {routineSnapshot,buildPersonalSegments,ringArcPath,clockPoint,validatePerson} from './routine-atlas-model.mjs';
import {partsAt,formatOffset,offsetMinutes,zonedToInstants} from './time-engine.mjs';
import {loadRoutinePeople,saveRoutinePerson,resetRoutinePerson,normalizeRoutinePerson} from './routine-person-store.mjs';
import {buildRoutineVoiceCues,routineVoiceArcFocus} from './routine-voice-model.mjs';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const minutes=s=>s.split(':').reduce((a,n)=>a*60+Number(n),0);
const week=['','周一','周二','周三','周四','周五','周六','周日'];
const colors={sleep:'#8797ce',work:'#8cb8a7',meal:'#e4b574',commute:'#76accc',free:'#c7c3a0',available:'#bde19b',gap:'#586c77'};
const profileById=id=>routineProfiles.find(p=>p.cityId===id);
const sha=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');

export function createRoutineAtlas({observatory,cities,getGlobe,onSelectCity,onSetInstant,onPersonChange,onVoiceStart,onClockPending}){
  let personStorage;try{personStorage=window.localStorage;}catch{}
  const restoredPeople=loadRoutinePeople(personStorage,routineProfiles);
  const byId=id=>cities.find(c=>c.id===id),people=restoredPeople.people,savedIds=restoredPeople.savedIds,customIds=new Set(savedIds),saveStates=new Map([...savedIds].map(id=>[id,'saved']));
  let enabled=false,selectedId='beijing',instant=new Date(),sceneId='',paintKey='',voiceToken=0,voiceBusy=false,voicePhase='',voiceCues=[],cueIndex=0,loadedCue=-1,voiceConfig=null,voiceManifest=null,finished=false,requestedLocal=null,pendingClock=false,annotationGlobe=null,annotationKey='',savedLabels=true;
  const clips=new Map();
  const picker=document.createElement('section');picker.className='routine-atlas-picker';picker.hidden=true;
  picker.innerHTML=`<div class="routine-atlas-intro"><strong>沿着地球，看看各地的一天</strong><span>外环看地域生活 · 内环看个人窗口</span><button class="human-routine-entry" data-human-open>先理解作息与时间的关系 ↗</button></div><div class="routine-atlas-cities" aria-label="选择作息城市">${routineProfiles.map(p=>`<button data-routine-city="${p.cityId}" aria-pressed="false">${esc(byId(p.cityId).name)}<small>${esc(p.country)}</small></button>`).join('')}</div>`;
  observatory.before(picker);
  const overlay=document.createElement('div');overlay.className='routine-atlas-overlay';overlay.hidden=true;
  overlay.innerHTML=`<svg viewBox="0 0 600 600" class="routine-atlas-ring" aria-label="24 小时作息双环：外环为生活示意，内环为个人窗口"><defs><pattern id="routine-gap-stripe" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><rect width="8" height="8" fill="#334650"/><rect width="3" height="8" fill="#b4bec2"/></pattern></defs><g class="routine-hour-ticks">${Array.from({length:24},(_,h)=>{const a=clockPoint(h*60,270,300,300),b=clockPoint(h*60,h%3===0?277:274,300,300),label=clockPoint(h*60,289,300,300);return `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}"/>${h%3===0?`<text x="${label.x}" y="${label.y}" dominant-baseline="central" text-anchor="middle">${String(h).padStart(2,'0')}</text>`:''}`;}).join('')}</g><g id="routine-region-arcs"></g><g id="routine-person-arcs"></g><g class="routine-clock-pointer"><line id="routine-clock-hand"/><circle id="routine-clock-dot" r="6"/></g></svg><div class="routine-city-readout"><span id="routine-city-name"></span><strong id="routine-city-clock"></strong><small id="routine-city-date"></small><small id="routine-ring-activity"></small><small id="routine-ring-contact"></small><small id="routine-ring-sleep" hidden></small></div>`;
  observatory.append(overlay);
  const voiceFocus=document.createElement('small');voiceFocus.id='routine-voice-focus';voiceFocus.hidden=true;overlay.querySelector('.routine-city-readout').prepend(voiceFocus);
  const panel=document.createElement('section');panel.className='routine-atlas-panel';panel.hidden=true;
  panel.innerHTML=`
    <div class="routine-ring-key"><span><b>外环</b> 地域生活示意</span><span><b>内环</b> 个人联系窗口</span><small>点击环上的一段，查看那时的当地生活</small></div>
    <div class="routine-colour-key"><span><i style="background:${colors.sleep}"></i>睡眠</span><span><i style="background:${colors.work}"></i>工作 / 学习示意</span><span><i style="background:${colors.meal}"></i>用餐</span><span><i style="background:${colors.commute}"></i>通勤</span><span><i style="background:${colors.free}"></i>个人时间</span><span><i style="background:${colors.available}"></i>个人可联系</span></div>
    <p class="routine-scope" id="routine-scope"></p>
    <div class="routine-now"><div><span>当地生活示意</span><strong id="routine-activity"></strong><small id="routine-activity-scope"></small></div><div><span id="routine-person-title"></span><strong id="routine-contact-title"></strong><small id="routine-contact-detail"></small></div></div>
    <div class="routine-clock-control"><div><label for="routine-local-time">拨动所选城市的钟表</label><output id="routine-local-output"></output></div><input id="routine-local-time" type="range" min="0" max="1439" step="15" aria-label="调整所选城市的当地时间"><div class="routine-clock-marks"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div><label class="routine-date-field">当地日期<input id="routine-local-date" type="date" aria-label="作息演示的当地日期"></label><p id="routine-clock-error" role="status"></p><div id="routine-fold-choices"></div></div>
    <div class="routine-voice-row"><button id="routine-city-listen">▶ 听所选时刻与城市介绍</button><span id="routine-cue-controls" class="routine-cue-controls" hidden><button type="button" id="routine-cue-prev">← 上一句</button><small id="routine-cue-position"></small><button type="button" id="routine-cue-next">下一句 →</button></span><audio id="routine-city-audio" controls preload="metadata" aria-label="MiniMax 城市作息逐句介绍" hidden></audio><span id="routine-city-voice-status" role="status">MiniMax · 逐句看钟点、外环生活与内环个人窗口</span></div>
    <p class="routine-spoken-context" id="routine-spoken-context" hidden></p>
    <div class="routine-facts"><div><span class="routine-section-tag">地域线索 · 有出处，也有范围</span><h3 id="routine-region-headline"></h3></div><ul id="routine-region-facts"></ul><details><summary>查看资料来源与适用范围</summary><div id="routine-region-sources"></div></details></div>
    <details class="routine-person-editor"><summary>修改这个人的联系与睡眠时间 <span id="routine-person-save-note">初始人物为虚构示例；地域示意不变，个人设置保存到本机</span></summary><form id="routine-person-form"><div class="routine-person-fields"><label>人物称呼<input id="routine-person-name" maxlength="24" required></label><div class="routine-field-pair"><label>可联系开始<input id="routine-person-start" type="time" required></label><label>可联系结束<input id="routine-person-end" type="time" required></label></div><div class="routine-field-pair"><label>睡眠开始<input id="routine-person-sleepStart" type="time" required></label><label>起床时间<input id="routine-person-sleepEnd" type="time" required></label></div></div><fieldset><legend>可联系的星期 · 按当地日期</legend>${week.slice(1).map((w,i)=>`<label><input type="checkbox" name="routine-weekday" value="${i+1}">${w}</label>`).join('')}</fieldset><p>这些设置只代表这个人，独立保存到本机。跨午夜窗口归开始当天；睡眠优先避让。</p><div class="routine-person-actions"><button type="submit">应用并保存到本机</button><button type="button" id="routine-person-reset">恢复示例人物</button></div><p id="routine-person-error" role="status"></p></form></details>
  `;
  panel.prepend(panel.querySelector('.routine-voice-row'),panel.querySelector('.routine-spoken-context'));
  observatory.after(panel);
  let voiceArea=null;
  const $=s=>panel.querySelector(s)||overlay.querySelector(s)||picker.querySelector(s)||observatory.closest('.planet-lesson')?.querySelector(s),audio=$('#routine-city-audio');
  const currentProfile=()=>profileById(selectedId),currentCity=()=>byId(selectedId);
  function syncLocation(){
    if(!enabled)return;const g=getGlobe?.();if(!g)return;
    if(annotationGlobe!==g){annotationGlobe=g;savedLabels=g.getState?.().labels??true;annotationKey='';}
    g.setLabels?.(false);const city=currentCity(),key=`${selectedId}:${voicePhase}`;
    if(annotationKey!==key){annotationKey=key;g.setAnnotations?.([{id:'routine-selected-location',lat:city.lat,lon:city.lon,text:city.name,detail:voicePhase?'正在讲解的城市':'选中的城市位置',active:true}]);}
  }
  function clearLocation(){if(annotationGlobe){annotationGlobe.setAnnotations?.([]);annotationGlobe.setLabels?.(savedLabels);}annotationGlobe=null;annotationKey='';}
  function emitVoiceState(){window.dispatchEvent(new CustomEvent('timeatlas:routine-voice-state',{detail:{playing:!audio.paused,busy:voiceBusy,active:enabled,hasAudio:audio.hasAttribute('src'),caption:voiceCues[cueIndex]?.caption||'',index:cueIndex,total:voiceCues.length,finished}}));}
  function paintVoiceFocus(){
    const cue=voicePhase?voiceCues[cueIndex]:null,h=cue?.highlight;
    overlay.dataset.voicePhase=voicePhase;voiceFocus.hidden=!cue;
    voiceFocus.textContent=cue?`${voiceBusy?'准备 · ':audio.paused?'暂停 · ':'正在讲 · '}${cue.caption}`:'';
    for(const node of [...overlay.querySelectorAll('.is-speaking-field'),...panel.querySelectorAll('.is-speaking-field')])node.classList.remove('is-speaking-field');
    const mark=selector=>$(selector)?.classList.add('is-speaking-field');
    if(h?.field==='date')mark('#routine-city-date');
    if(h?.field==='time'){mark('#routine-city-clock');overlay.querySelector('.routine-clock-pointer').classList.add('is-speaking-pointer');}else overlay.querySelector('.routine-clock-pointer').classList.remove('is-speaking-pointer');
    if(h?.field==='regional'){mark('#routine-ring-activity');mark('#routine-activity');}
    if(h?.field==='personal'){mark('#routine-ring-contact');mark('#routine-contact-title');}
    $('#routine-ring-sleep').hidden=h?.field!=='sleep';if(h?.field==='sleep'){const person=people.get(selectedId);$('#routine-ring-sleep').textContent=`内环 · 本人睡眠 ${person.sleepStart}–${person.sleepEnd}`;mark('#routine-ring-sleep');}
    if(h?.field==='background'){const background=$('#routine-background-details');if(background)background.open=true;mark('#routine-region-headline');}
    overlay.querySelectorAll('.routine-arc').forEach(arc=>arc.classList.toggle('is-speaking-arc',routineVoiceArcFocus(h,{layer:arc.dataset.layer,kind:arc.dataset.kind,current:arc.classList.contains('is-current')})));
    $('#routine-cue-controls').hidden=!voiceCues.length;$('#routine-cue-prev').disabled=cueIndex<=0;$('#routine-cue-next').disabled=cueIndex>=voiceCues.length-1;$('#routine-cue-position').textContent=voiceCues.length?`${cueIndex+1} / ${voiceCues.length}`:'';
    syncLocation();emitVoiceState();
  }
  function snapshot(at,id=selectedId){const c=byId(id),p=profileById(id);return c&&p?routineSnapshot(at,c,p,people.get(id),30):null;}
  function personScope(){return customIds.has(selectedId)?currentProfile().scopeNote.replace('个人窗口属于虚构人物，可自行修改。','内环采用你设置的个人窗口，仍需向本人确认。'):currentProfile().scopeNote;}
  function saveNote(){const state=saveStates.get(selectedId);return state==='saved'?'已保存到本机；刷新后仍保留。地域示意不变。':state==='failed'?'本页已更新，但保存失败；刷新后修改会丢失。':state==='reset'?'已恢复虚构示例；刷新后仍为示例。地域示意不变。':state==='reset-failed'?'本页已恢复示例，但保存失败；刷新可能恢复此前设置。':restoredPeople.readable?'初始人物为虚构示例；地域示意不变，个人设置保存到本机。':'初始人物为虚构示例；当前无法保存，本页修改刷新后会丢失。';}
  function refreshSaveNote(){$('#routine-person-save-note').textContent=saveNote();}
  function renderFacts(){const profile=currentProfile(),city=currentCity();picker.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.routineCity===selectedId)));$('#routine-city-name').textContent=`${city.name} · ${profile.country}`;$('#routine-scope').textContent=personScope();$('#routine-region-headline').textContent=profile.headline;$('#routine-region-facts').innerHTML=profile.facts.map(f=>{const source=profile.sources.find(s=>s.id===f.sourceId);return `<li>${esc(f.text)}${source?` <a href="${esc(source.url)}" target="_blank" rel="noreferrer" aria-label="${esc(source.title)}">来源 ↗</a>`:''}</li>`;}).join('');$('#routine-region-sources').innerHTML=profile.sources.map(s=>`<p><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)} ↗</a><small>${esc(s.scope)}${s.year?` · ${esc(s.year)}`:''}</small></p>`).join('');fillPersonForm();paintKey='';}
  function fillPersonForm(){const p=people.get(selectedId);for(const k of ['name','start','end','sleepStart','sleepEnd'])$('#routine-person-'+k).value=p[k];panel.querySelectorAll('[name="routine-weekday"]').forEach(input=>input.checked=p.weekdays.includes(Number(input.value)));$('#routine-person-error').textContent='';refreshSaveNote();}
  function arcMarkup(segment,radius,layer){const start=segment.startMinutes??minutes(segment.start),end=segment.endMinutes??minutes(segment.end),mid=Math.min(1439,Math.floor((start+end)/2));const color=segment.kind==='gap'?'url(#routine-gap-stripe)':colors[segment.kind]||colors.free;const name=`${layer} ${segment.start}–${segment.end} ${segment.label}${segment.occurrences===2?'，此日重复一次':''}`,personal=layer==='个人窗口',shortLabel=personal?({available:'可联系',sleep:'睡眠',free:'需确认',gap:'跳过'}[segment.kind]):({sleep:'睡眠',work:'工作',meal:'用餐',commute:'通勤',free:'个人'}[segment.kind]),point=clockPoint((start+end)/2,radius,300,300);const angle=(start+end)/2/4;const rotation=angle>90&&angle<270?angle+180:angle;const label=end-start>=(personal?90:60)&&shortLabel?`<text class="routine-ring-label ${personal?'personal':'regional'}" x="${point.x}" y="${point.y}" dominant-baseline="central" text-anchor="middle" transform="rotate(${rotation} ${point.x} ${point.y})" pointer-events="none" aria-hidden="true">${shortLabel}</text>`:'';return `<path class="routine-arc ${segment.kind}" d="${ringArcPath(start,end,radius,300,300)}" stroke="${color}" role="button" tabindex="0" data-minute="${mid}" data-start="${start}" data-end="${end}" data-layer="${personal?'personal':'regional'}" data-kind="${esc(segment.kind)}" aria-label="${esc(name)}"><title>${esc(name)}</title></path>${label}`;}
  function paintRings(){const profile=currentProfile(),city=currentCity(),person=people.get(selectedId),date=partsAt(instant,city.zone).date;const nextKey=selectedId+'|'+date+'|'+JSON.stringify(person);if(nextKey===paintKey)return;paintKey=nextKey;$('#routine-region-arcs').innerHTML=profile.segments.map(s=>arcMarkup(s,254,'地域示意')).join('');const personal=buildPersonalSegments(person,instant,city);$('#routine-person-arcs').innerHTML=personal.map(s=>arcMarkup(s,224,'个人窗口')).join('');overlay.querySelectorAll('[data-minute]').forEach(path=>{path.onclick=()=>selectMinute(Number(path.dataset.minute));path.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectMinute(Number(path.dataset.minute));}};});}
  function setClockPending(pending){pendingClock=pending;$('#routine-city-listen').disabled=pending||voiceBusy;onClockPending?.(pending);}
  function clearClockChoices(){$('#routine-clock-error').textContent='';$('#routine-fold-choices').replaceChildren();setClockPending(false);}
  function update(at){instant=new Date(at);clearClockChoices();if(!enabled)return;const state=snapshot(instant),p=state.local,person=people.get(selectedId);$('#routine-city-clock').textContent=p.time;$('#routine-city-date').textContent=`${p.year}.${p.month}.${p.day} ${week[p.weekday]}`;$('#routine-activity').textContent=state.activity.label;$('#routine-ring-activity').textContent='外环 · 地域示意：'+state.activity.label.replace('示意','');$('#routine-ring-contact').textContent='内环 · '+person.name+'：'+(state.personal.canContact?'30 分钟在窗口内':state.personal.state==='sleep'?'睡眠，先别打扰':'先留言确认');$('#routine-activity-scope').textContent=p.weekday>5?'工作日示意；今天是周末，实际节奏可能不同。':'工作日教学示意，不能据此判断某个人此刻的活动。';$('#routine-person-title').textContent=`${person.name} · ${customIds.has(selectedId)?savedIds.has(selectedId)?'个人设置（本机）':'本页个人设置':'虚构人物示例'}`;$('#routine-scope').textContent=personScope();refreshSaveNote();$('#routine-contact-title').textContent=state.personal.canContact?'这 30 分钟在窗口内':state.personal.state==='sleep'?'睡眠时间，先别打扰':state.personal.reason==='too-short'?'窗口剩余时间不足':'窗口外，先留言确认';$('#routine-contact-title').dataset.contact=String(state.personal.canContact);$('#routine-contact-detail').textContent=state.personal.text;const m=p.hour*60+p.minute;requestedLocal={date:p.date,minute:m};$('#routine-local-time').value=m;$('#routine-local-output').textContent=`${currentCity().name} ${p.time}`;$('#routine-local-date').value=p.date;const from=clockPoint(m,204,300,300),to=clockPoint(m,268,300,300);$('#routine-clock-hand').setAttribute('x1',from.x);$('#routine-clock-hand').setAttribute('y1',from.y);$('#routine-clock-hand').setAttribute('x2',to.x);$('#routine-clock-hand').setAttribute('y2',to.y);$('#routine-clock-dot').setAttribute('cx',to.x);$('#routine-clock-dot').setAttribute('cy',to.y);paintRings();overlay.querySelectorAll('.routine-arc').forEach(arc=>arc.classList.toggle('is-current',m>=Number(arc.dataset.start)&&m<Number(arc.dataset.end)));paintVoiceFocus();}
  function applyMatches(matches){const error=$('#routine-clock-error'),choices=$('#routine-fold-choices');clearClockChoices();if(matches.length!==1)setClockPending(true);if(!matches.length){error.textContent='这个当地钟点因调钟不存在，请选前后时间。地球仍显示上次有效时刻。';return;}if(matches.length>1){error.textContent='这个钟点出现两次，请选清楚是哪一次。地球仍显示上次有效时刻。';for(const at of matches){const button=document.createElement('button');button.textContent=`${partsAt(at,currentCity().zone).time} · ${formatOffset(offsetMinutes(at,currentCity().zone))} · ${at.toISOString().slice(11,16)} UTC`;button.onclick=()=>{clearClockChoices();onSetInstant(at);};choices.append(button);}return;}onSetInstant(matches[0]);}
  function requestLocalTime(date,minute){pause();onVoiceStart?.();clearClockChoices();requestedLocal={date,minute};const time=`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;$('#routine-local-date').value=date;$('#routine-local-time').value=minute;$('#routine-local-output').textContent=`${currentCity().name} ${time} · 待确认`;try{applyMatches(zonedToInstants(date,time,currentCity().zone));}catch(error){setClockPending(true);$('#routine-clock-error').textContent=`${error.message} 地球仍显示上次有效时刻。`;}}
  function selectMinute(minute){requestLocalTime(requestedLocal?.date||partsAt(instant,currentCity().zone).date,minute);}
  function selectCity(id){if(!profileById(id))return;pause();onVoiceStart?.();clearClockChoices();selectedId=id;renderFacts();update(instant);onSelectCity(selectedId);}
  picker.querySelectorAll('button').forEach(button=>button.onclick=()=>selectCity(button.dataset.routineCity));
  $('#routine-local-time').oninput=e=>selectMinute(Number(e.target.value));
  $('#routine-local-date').onchange=e=>{if(!e.target.value)return;const local=partsAt(instant,currentCity().zone);requestLocalTime(e.target.value,requestedLocal?.minute??local.hour*60+local.minute);};
  $('#routine-person-form').onsubmit=e=>{e.preventDefault();const draft={...people.get(selectedId)};for(const k of ['name','start','end','sleepStart','sleepEnd'])draft[k]=$('#routine-person-'+k).value.trim();draft.weekdays=[...panel.querySelectorAll('[name="routine-weekday"]:checked')].map(i=>Number(i.value));const result=validatePerson(draft),value=result.valid?normalizeRoutinePerson(result.value):null;if(!value){$('#routine-person-error').textContent=result.valid?'人物称呼不能为空，且最多 24 个字符。':result.errors.map(err=>err.message).join(' ');return;}pause();onVoiceStart?.();people.set(selectedId,value);customIds.add(selectedId);const saved=saveRoutinePerson(personStorage,routineProfiles,selectedId,value);saveStates.set(selectedId,saved.saved?'saved':'failed');if(saved.saved)savedIds.add(selectedId);else savedIds.delete(selectedId);update(instant);$('#routine-person-error').textContent=[...result.warnings,saveNote()].join(' ');onPersonChange?.(selectedId,value);};
  $('#routine-person-reset').onclick=()=>{pause();onVoiceStart?.();people.set(selectedId,structuredClone(currentProfile().person));customIds.delete(selectedId);savedIds.delete(selectedId);const saved=resetRoutinePerson(personStorage,routineProfiles,selectedId);saveStates.set(selectedId,saved.saved?'reset':'reset-failed');fillPersonForm();update(instant);$('#routine-person-error').textContent=saveNote();onPersonChange?.(selectedId,people.get(selectedId));};
  function pause(){
    voiceToken++;voiceBusy=false;voiceCues=[];cueIndex=0;loadedCue=-1;finished=false;voicePhase='';
    audio.pause();audio.hidden=true;audio.removeAttribute('src');audio.load();
    $('#routine-spoken-context').hidden=true;$('#routine-spoken-context').textContent='';$('#routine-city-listen').disabled=pendingClock;$('#routine-city-listen').textContent='▶ 听所选时刻与城市介绍';$('#routine-city-voice-status').textContent=`${voiceProviderLabel()} · 逐句看钟点、外环生活与内环个人窗口`;paintVoiceFocus();
  }
  async function fetchJson(url,options={}){const response=await voiceFetch(url,options),result=await response.json();if(!response.ok)throw new Error(result.error?.message||result.error||'语音暂时无法读取，请重试。');return result;}
  async function prepareClip(cue,config,id){
    if(cue.id==='background'){
      const cached=voiceManifest?.profiles?.[id],hash=await sha(cue.text);
      if(cached&&cached.textHash===hash&&cached.model===config.model&&cached.voiceId===config.voiceId)return cached;
    }
    const key=[config.model,config.voiceId,cue.text].join('|');
    if(!clips.has(key))clips.set(key,fetchJson('/api/voice/synthesize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chapterId:`routine-${id}-${cue.id}`,text:cue.text,model:config.model,voiceId:config.voiceId})}).catch(error=>{clips.delete(key);throw error;}));
    return clips.get(key);
  }
  function showCue(index){
    const cue=voiceCues[index];if(!cue)return;cueIndex=index;voicePhase=cue.id;
    $('#routine-spoken-context').hidden=false;$('#routine-spoken-context').textContent=cue.caption;
    $('#routine-city-voice-status').textContent=`${voiceProviderLabel()} · 第 ${index+1} / ${voiceCues.length} 句 · ${cue.caption}`;paintVoiceFocus();
  }
  async function playCue(index){
    if(!enabled||pendingClock||!voiceCues[index])return;
    const token=++voiceToken,id=selectedId;voiceBusy=true;finished=false;
    audio.pause();audio.removeAttribute('src');audio.load();audio.hidden=true;loadedCue=-1;showCue(index);
    $('#routine-city-listen').disabled=true;$('#routine-city-listen').textContent='正在准备这一句…';
    try{
      onVoiceStart?.();paintVoiceFocus();
      const config=voiceConfig||await fetchJson('/api/voice/status');if(token!==voiceToken||!enabled)return;
      if(!config.configured)throw new Error('MiniMax 尚未连接，请在国家与城市巡游的音色设置中检查。');voiceConfig=config;
      if(!voiceManifest)voiceManifest=await fetchJson('./routine-atlas-audio.json',{cache:'no-store'}).catch(()=>({}));
      if(token!==voiceToken||!enabled)return;
      const cue=voiceCues[index],clip=await prepareClip(cue,config,id);
      if(token!==voiceToken||!enabled||id!==selectedId)return;
      if(typeof clip?.audioUrl!=='string')throw new Error('这一句音频暂时无法读取，请重试。');
      loadedCue=index;audio.src=clip.audioUrl;audio.hidden=false;await audio.play();
      if(token!==voiceToken)return;showCue(index);
      if(index+1<voiceCues.length)void prepareClip(voiceCues[index+1],config,id).catch(()=>{});
    }catch(error){if(token===voiceToken){voicePhase='';audio.pause();audio.removeAttribute('src');audio.load();audio.hidden=true;loadedCue=-1;$('#routine-city-voice-status').textContent=error.message;paintVoiceFocus();}}
    finally{if(token===voiceToken){voiceBusy=false;$('#routine-city-listen').disabled=pendingClock;$('#routine-city-listen').textContent=audio.paused?'▶ 听这一句':'Ⅱ 暂停城市讲解';paintVoiceFocus();}}
  }
  async function sayCurrent(){
    if(!enabled||pendingClock||voiceBusy)return;if(!audio.paused){audio.pause();return;}
    if(audio.hasAttribute('src')&&!audio.ended&&loadedCue===cueIndex){onVoiceStart?.();showCue(cueIndex);try{await audio.play();}catch{$('#routine-city-voice-status').textContent='请点击音频播放器继续。';}return;}
    if(!voiceCues.length||finished){
      onVoiceStart?.();onSelectCity?.(selectedId);finished=false;
      voiceCues=buildRoutineVoiceCues({city:currentCity(),profile:currentProfile(),person:people.get(selectedId),state:snapshot(instant),custom:customIds.has(selectedId)});cueIndex=0;
    }
    await playCue(cueIndex);
  }
  $('#routine-city-listen').onclick=()=>void sayCurrent();
  $('#routine-cue-prev').onclick=()=>void playCue(cueIndex-1);$('#routine-cue-next').onclick=()=>void playCue(cueIndex+1);
  audio.addEventListener('play',()=>{
    if(!enabled||loadedCue!==cueIndex){audio.pause();return;}finished=false;onVoiceStart?.();
    document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});
    showCue(cueIndex);$('#routine-city-listen').textContent='Ⅱ 暂停城市讲解';
  });
  audio.addEventListener('pause',()=>{paintVoiceFocus();$('#routine-city-listen').textContent=audio.hasAttribute('src')?'▶ 继续城市讲解':'▶ 听所选时刻与城市介绍';});
  audio.addEventListener('seeked',()=>{if(loadedCue===cueIndex&&voicePhase)showCue(cueIndex);});
  audio.addEventListener('ended',()=>{
    if(!enabled||loadedCue!==cueIndex||!voiceCues.length)return;
    if(cueIndex<voiceCues.length-1){void playCue(cueIndex+1);return;}
    finished=true;voicePhase='';paintVoiceFocus();$('#routine-city-listen').textContent='↺ 再听城市介绍';$('#routine-city-voice-status').textContent='讲解完成 · 可以改时间、换城市或修改这个人的内环';
    window.dispatchEvent(new CustomEvent('timeatlas:routine-voice-ended',{detail:{cityId:selectedId,total:voiceCues.length}}));
  });
  audio.addEventListener('error',()=>{if(!audio.hasAttribute('src'))return;voiceToken++;voiceBusy=false;audio.removeAttribute('src');audio.load();audio.hidden=true;loadedCue=-1;voicePhase='';$('#routine-city-listen').disabled=pendingClock;$('#routine-city-voice-status').textContent='音频读取失败，可点击当前句重试。';paintVoiceFocus();});
  window.addEventListener('timeatlas:voice-settings-changed',()=>{voiceConfig=null;voiceManifest=null;clips.clear();pause();});
  return {update,pause,snapshot,selectCity,listen:sayCurrent,get speaking(){return !audio.paused;},get busy(){return voiceBusy;},get hasAudio(){return audio.hasAttribute('src');},get caption(){return voiceCues[cueIndex]?.caption||'';},get selectedCityId(){return selectedId;},getPerson:id=>people.get(id),getProfile:profileById,
    mountWorkspace(main,assist){
      voiceArea=document.createElement('section');voiceArea.className='routine-inline-voice';voiceArea.hidden=!enabled;
      voiceArea.append(panel.querySelector('.routine-voice-row'),panel.querySelector('.routine-spoken-context'));main.prepend(picker);main.append(voiceArea);assist.append(panel);
      panel.prepend(picker.querySelector('.routine-atlas-intro'));
      const wrap=(className,title,nodes,id)=>{const detail=document.createElement('details');detail.className=className;if(id)detail.id=id;const summary=document.createElement('summary');summary.textContent=title;detail.append(summary,...nodes);panel.append(detail);return detail;};
      wrap('routine-auxiliary','图例与适用范围',[panel.querySelector('.routine-colour-key'),panel.querySelector('.routine-scope')]);
      wrap('routine-auxiliary','调整当地日期与钟点',[panel.querySelector('.routine-clock-control')]);
      wrap('routine-auxiliary','地域背景与资料',[panel.querySelector('.routine-facts')],'routine-background-details');
    },
    setScene({active,stage,at}){const changed=sceneId!==stage.id;pause();clearClockChoices();enabled=active;picker.hidden=overlay.hidden=panel.hidden=!enabled;if(voiceArea)voiceArea.hidden=!enabled;observatory.classList.toggle('routine-observatory',enabled);if(!enabled){clearLocation();emitVoiceState();return;}if(changed){sceneId=stage.id;selectedId=profileById(stage.cities?.[0])?stage.cities[0]:'beijing';renderFacts();}update(at);},
  };
}
