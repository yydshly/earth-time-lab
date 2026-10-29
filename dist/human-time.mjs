import {voiceFetch,voiceProviderLabel} from './recorded-voice.mjs';
import {humanTimeSteps,humanTimeSources} from './human-time-data.mjs';
import {teachingPlaces,meanSolarMinutes,formatSolarTime,solarNoonOnCivilClock,meanSolarModelNote,humanDayObserver,humanDayInstant,humanCueMinute,humanCueAtMinute,humanObserverLight,humanClockMessage} from './human-time-model.mjs';
import {partsAt,offsetMinutes} from './time-engine.mjs';
import {createTimeContext} from './time-context.mjs';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const example=new Date('2026-03-20T04:00:00Z');
const sha=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');

export function initHumanTime({globe,getInstant,navigate,onClose,onOpen}){
  const defaultGlobeLabel=document.querySelector('#globe').getAttribute('aria-label');
  const root=document.querySelector('#explore'),earth=root.querySelector('.earth-panel'),surface=earth.querySelector('.globe-surface');
  const timeContext=createTimeContext({id:'human-time-context',onNow:()=>navigate('explore',{mode:'live'})});earth.before(timeContext.element);
  let active=false,index=0,solarClock=false,instant=new Date(example),savedGlobe=null,frame=0,started=0,progress=0,token=0,busy=false,cueIndex=0,loadedKey='',completed=false,lastPaint=0,observerKey='';
  const voiceEntries=new Map();
  const switcher=document.createElement('div');switcher.className='human-mode-switch';
  switcher.innerHTML='<button id="human-open" aria-pressed="true">先理解原因：时间怎样服务人</button><button id="human-free" aria-pressed="false">手动换算时间</button>';
  root.querySelector('.page-heading').after(switcher);
  const lesson=document.createElement('section');lesson.className='human-lesson';lesson.hidden=true;
  lesson.innerHTML=`<nav class="human-path" aria-label="时间与人的因果关系">${humanTimeSteps.map((s,i)=>`<button data-human-step="${i}" aria-current="false"><small>0${i+1}</small>${esc(s.label)}${i<4?'<span aria-hidden="true">→</span>':''}</button>`).join('')}</nav><div class="human-heading"><div><span id="human-count"></span><h2 id="human-title"></h2></div><button id="human-listen">▶ 听这一步为什么</button></div>`;
  switcher.after(lesson);
  const visual=document.createElement('div');visual.className='human-orbit';visual.hidden=true;
  visual.innerHTML='<div class="human-top-note" id="human-visual-note"></div><div id="human-observer-readout" class="human-observer-readout" hidden><small>始终跟踪同一个观察点 · 北京</small><strong id="human-observer-clock"></strong><span id="human-observer-light"></span></div><div class="human-sun" aria-hidden="true">☀<span>← 阳光</span></div><div id="human-orbit-message" class="human-orbit-message"></div>';
  surface.append(visual);
  const detail=document.createElement('section');detail.className='human-under-earth';detail.hidden=true;
  detail.innerHTML=`<div class="human-compare" id="human-compare" hidden><div class="human-clock-switch"><span>同一个瞬间，切换钟表的约定</span><div><button data-clock="solar" aria-pressed="false">各按当地太阳读时</button><button data-clock="civil" aria-pressed="true">一起使用北京时间</button></div></div><div class="human-place-clocks" id="human-place-clocks"></div><p id="human-comparison-result"></p><small>${esc(meanSolarModelNote)}</small></div><div class="human-day" id="human-day" hidden><button id="human-day-play">▶ 看地球转过一天</button><label>一天的进度 <output id="human-day-output"></output><input id="human-day-range" type="range" min="0" max="1440" step="15" value="0" aria-label="原因演示一天的进度"></label><small>固定跟踪北京；语音分四段走过一天，可点分段重听。独立演示压缩为 32 秒，昼夜为教学近似。</small></div><div class="human-reason"><div><span>因为</span><p id="human-cause"></p></div><b aria-hidden="true">→</b><div><span>所以</span><p id="human-effect"></p></div></div><p class="human-principle" id="human-principle"></p><div class="human-navigation"><button id="human-prev">← 上一个原因</button><button id="human-next">接着看为什么 →</button><button id="human-routines" hidden>带着原因看各地作息 ↗</button></div><div class="human-audio-row"><audio id="human-audio" controls preload="metadata" hidden aria-label="MiniMax 时间与人的关系讲解"></audio><span id="human-voice-status">MiniMax · 逐步解释因果，播放结束后停留供观察</span></div><details class="human-transcript"><summary>阅读讲稿与依据</summary><p id="human-transcript"></p><div id="human-sources"></div></details>`;
  earth.querySelector('.globe-toolbar').before(detail);
  const voicePanel=document.createElement('div');voicePanel.className='human-cue-panel';voicePanel.id='human-cue-panel';voicePanel.hidden=true;
  voicePanel.innerHTML=`<div class="human-cue-heading"><span>看着同一个地点，听完它的一天</span><small id="human-cue-count"></small></div><div class="human-cue-steps" aria-label="一天讲解分段">${humanTimeSteps[0].voiceCues.map((cue,i)=>`<button type="button" data-human-cue="${i}" aria-pressed="false">${i+1} · ${esc(cue.label)}</button>`).join('')}</div><p id="human-current-caption" aria-live="polite"></p><p id="human-current-speech"></p>`;
  detail.querySelector('.human-day').after(voicePanel);
  // Keep the existing globe as the main view; explanations live in a compact in-page side rail.
  const heading=lesson.querySelector('.human-heading');detail.prepend(heading,timeContext.element,detail.querySelector('.human-audio-row'));
  const currentSpeech=voicePanel.querySelector('#human-current-speech'),cueTranscript=document.createElement('details');cueTranscript.className='human-cue-transcript';cueTranscript.innerHTML='<summary>当前分段讲稿</summary>';currentSpeech.before(cueTranscript);cueTranscript.append(currentSpeech);
  const reason=detail.querySelector('.human-reason'),principle=detail.querySelector('.human-principle'),explanation=document.createElement('details');explanation.className='human-explanation-details';explanation.innerHTML='<summary>原因与结论</summary>';reason.before(explanation);explanation.append(reason,principle);

  const $=s=>lesson.querySelector(s)||visual.querySelector(s)||detail.querySelector(s)||switcher.querySelector(s),audio=$('#human-audio');
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  function stopDay(){cancelAnimationFrame(frame);frame=0;$('#human-day-play').textContent='▶ 看地球转过一天';}
  function pause(){token++;busy=false;audio.pause();audio.removeAttribute('src');audio.load();audio.hidden=true;loadedKey='';$('#human-listen').disabled=false;$('#human-listen').textContent='▶ 听这一步为什么';$('#human-voice-status').textContent=`${voiceProviderLabel()} · 逐段解释因果，播放结束后停留供观察`;}
  function paintTime(){globe?.setInstant(instant);timeContext.update({kind:'example',instant,zone:'Asia/Shanghai',label:'北京时间',detail:'固定日期用于解释原因；拨动或播放演示不会改变真实现在。'});$('#human-visual-note').textContent=`教学示例 · ${instant.toISOString().slice(0,10)} · ${instant.toISOString().slice(11,16)} UTC`;if(index===2||index===3)paintClocks();}
  function paintClocks(){
    $('#human-place-clocks').innerHTML=teachingPlaces.map(place=>{const civil=partsAt(instant,place.zone),solar=formatSolarTime(meanSolarMinutes(instant,place.lon)),noon=formatSolarTime(solarNoonOnCivilClock(place.lon,offsetMinutes(instant,place.zone)));return `<div><span>${place.name}<small>${place.lon.toFixed(2)}°E</small></span><strong>${solarClock?solar:civil.time}</strong><p>${solarClock?'按经度估算的平太阳时':'共同采用的北京时间'}</p><small>${solarClock?'各地自然进程分别计时':`平太阳正午约在钟表 ${noon}`}</small></div>`;}).join('');
    globe?.setAnnotations?.(teachingPlaces.map(place=>({...place,text:`${place.name} ${solarClock?formatSolarTime(meanSolarMinutes(instant,place.lon)):partsAt(instant,place.zone).time}`,detail:solarClock?'地方太阳钟（估算）':'共同的北京时间',active:true})));
    const [a,b,c]=humanClockMessage(solarClock);$('#human-orbit-message').innerHTML=`<span>${a}</span><span>${b}</span><strong>${c}</strong>`;
    detail.querySelectorAll('[data-clock]').forEach(b=>b.setAttribute('aria-pressed',String(solarClock===(b.dataset.clock==='solar'))));
    $('#human-comparison-result').textContent=solarClock?'两地相差约 70 分钟。如果车次、通信各用一套地方太阳钟，就得反复换算。':'两地都读 12:00，约定更容易；太阳进程仍差约 70 分钟。统一钟表不会把太阳或生活节奏搬到同一位置。';
  }
  function paintCue(selected){
    const cues=humanTimeSteps[0].voiceCues,c=cues[selected];if(!c)return;
    detail.querySelectorAll('[data-human-cue]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.humanCue)===selected)));
    $('#human-cue-count').textContent=`第 ${selected+1} / ${cues.length} 段`;
    if($('#human-current-caption').textContent!==c.caption)$('#human-current-caption').textContent=c.caption;
    if($('#human-current-speech').textContent!==c.narration)$('#human-current-speech').textContent=c.narration;
    const message=`<span>固定观察点 · 北京</span><span>${esc(humanObserverLight(instant).label)}</span><strong>${esc(c.caption)}</strong>`;if($('#human-orbit-message').innerHTML!==message)$('#human-orbit-message').innerHTML=message;
  }
  function dayAt(minute,{paint=true}={}){
    progress=Math.max(0,Math.min(1440,minute));instant=humanDayInstant(progress);globe?.setInstant(instant);if(!paint)return;
    const local=partsAt(instant,humanDayObserver.zone),light=humanObserverLight(instant);
    $('#human-day-range').value=progress;$('#human-day-output').textContent=`北京 ${local.month} 月 ${local.day} 日 ${local.time} · 已过 ${Math.floor(progress/60)} 小时`;
    $('#human-observer-clock').textContent=`${local.month} 月 ${local.day} 日 ${local.time}`;$('#human-observer-light').textContent=light.label;
    $('#human-observer-readout').dataset.light=light.state;
    const key=`${local.date}:${local.time}:${light.state}`;
    if(key!==observerKey){observerKey=key;globe?.setAnnotations?.([{...humanDayObserver,text:`固定观察点 · 北京 ${local.time}`,detail:`${local.month} 月 ${local.day} 日 · ${light.label}`,active:true}]);}
    paintCue(audio.src&&!audio.ended?cueIndex:Math.max(0,humanCueAtMinute(humanTimeSteps[0].voiceCues,progress)));paintTime();
  }
  function tick(now){if(!active||index!==0||document.hidden){stopDay();return;}const minute=Math.min(1440,(now-started)/32000*1440),paint=now-lastPaint>=100||minute>=1440;if(paint)lastPaint=now;dayAt(minute,{paint});if(progress>=1440){stopDay();return;}frame=requestAnimationFrame(tick);}
  function tickVoice(now){if(!active||index!==0||audio.paused){frame=0;return;}if(Number.isFinite(audio.duration)&&audio.duration>0){const paint=now-lastPaint>=100;if(paint)lastPaint=now;dayAt(humanCueMinute(humanTimeSteps[0].voiceCues[cueIndex],audio.currentTime,audio.duration),{paint});}frame=requestAnimationFrame(tickVoice);}
  function stage(next){
    stopDay();pause();index=Math.max(0,Math.min(humanTimeSteps.length-1,next));cueIndex=0;completed=false;observerKey='';solarClock=index===2;instant=new Date(example);const s=humanTimeSteps[index];root.dataset.humanStage=s.visual;
    lesson.querySelectorAll('[data-human-step]').forEach(b=>b.setAttribute('aria-current',Number(b.dataset.humanStep)===index?'step':'false'));
    $('#human-count').textContent=`原因 ${index+1} / ${humanTimeSteps.length}`;$('#human-title').textContent=s.title;$('#human-cause').textContent=s.cause;$('#human-effect').textContent=s.effect;$('#human-principle').textContent=s.principle;
    $('#human-transcript').textContent=s.narration;$('#human-sources').innerHTML=s.sources.map(id=>humanTimeSources.find(source=>source.id===id)).filter(Boolean).map(source=>`<p><a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source.title)} ↗</a><small>${esc(source.note)}</small></p>`).join('');
    $('#human-prev').disabled=index===0;$('#human-next').hidden=index===4;$('#human-routines').hidden=index!==4;$('#human-day').hidden=index!==0;$('#human-compare').hidden=!(index===2||index===3);
    visual.querySelector('.human-sun').hidden=index!==0;$('#human-observer-readout').hidden=index!==0;voicePanel.hidden=index!==0;
    const messages=[['夜','昼','地球转动，让每个地方轮流迎向太阳'],['光暗线索','身体节律','身体有自己的节律，也受环境与安排影响'],['每地各看太阳','协作要换钟','先保持同一瞬间，再改变计时约定'],['共用一套钟表','方便协作','改变的是钟表约定，太阳进程保持原样'],['自然的昼夜','社会的钟表','联系一个人，还要问他的实际作息']];
    const [a,b,c]=messages[index];$('#human-orbit-message').innerHTML=`<span>${a}</span><span>${b}</span><strong>${c}</strong>${index===4?'<small>夜班 · 育儿 · 弹性工作 · 个人偏好</small>':''}`;
    document.querySelector('#globe').tabIndex=index===0?-1:0;document.querySelector('#globe').setAttribute('aria-label',index===0?'昼夜原因演示地球：用下方的一天进度观察光照变化。':'原因演示地球：可拖动旋转，标注对应城市的位置与时间。');globe?.setAutoRotate?.(false);globe?.setNight(true);globe?.setLabels?.(false);globe?.setGrid?.(index===2||index===3);globe?.setAnnotations?.([]);void globe?.setZoneLayer?.(index===3?'legal':'none');
    globe?.setLabelLayout?.({reservedSelectors:['.human-top-note','.human-observer-readout','.human-sun','.human-orbit-message']});
    globe?.setDayView?.(index===0);if(index!==0)globe?.focusLocation?.({lat:25,lon:105},false);
    if(index===2||index===3)globe?.setAnnotations?.(teachingPlaces.map(p=>({...p,text:p.name,detail:`${p.lon.toFixed(2)}°E`,active:true})));paintTime();if(index===0)dayAt(0);
  }
  function open(){onOpen?.();root.querySelector('h1').textContent='时区，怎样服务于人的一天？';root.querySelector('.page-heading p').textContent='从昼夜与作息，理解人为什么需要公共时间规则。';if(!active){savedGlobe=globe?.getState?.();active=true;}root.classList.add('human-explaining');lesson.hidden=visual.hidden=detail.hidden=false;$('#human-open').setAttribute('aria-pressed','true');$('#human-free').setAttribute('aria-pressed','false');stage(index);}
  function close(){if(!active)return;root.querySelector('h1').textContent='按指定日期，手动换算世界时间';root.querySelector('.page-heading p').textContent='这是手动换算视图；查看实时钟表，请切回“此刻全球时间”。';stopDay();pause();active=false;document.querySelector('#globe').tabIndex=0;document.querySelector('#globe').setAttribute('aria-label',defaultGlobeLabel);root.classList.remove('human-explaining');lesson.hidden=visual.hidden=detail.hidden=true;$('#human-open').setAttribute('aria-pressed','false');$('#human-free').setAttribute('aria-pressed','true');globe?.setDayView?.(false);globe?.setAnnotations?.([]);globe?.setLabelLayout?.({density:'default',reservedSelectors:[]});globe?.setCityLabels?.(null);globe?.setLabels?.(savedGlobe?.labels??true);globe?.setNight(savedGlobe?.night??true);globe?.setGrid?.(savedGlobe?.grid??true);void globe?.setZoneLayer?.(savedGlobe?.zoneLayer||'none');globe?.setAutoRotate?.(savedGlobe?.autoRotate??false);globe?.setInstant(getInstant());onClose?.();}
  async function json(url,options={}){const response=await voiceFetch(url,options),result=await response.json();if(!response.ok)throw new Error(result.error?.message||result.error||'语音读取失败');return result;}
  async function listen(){
    if(!active||busy)return;if(!audio.paused){audio.pause();return;}if(audio.src&&!audio.ended){try{await audio.play();}catch{$('#human-voice-status').textContent='请在播放器中点击播放。';}return;}
    if(index===0&&completed){cueIndex=0;completed=false;}
    stopDay();document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});
    const s=humanTimeSteps[index],voiceCue=s.voiceCues?.[cueIndex],text=voiceCue?.narration||s.narration,requestToken=++token,targetKey=`${s.id}:${voiceCue?.id||'full'}`;
    busy=true;$('#human-listen').disabled=true;$('#human-voice-status').textContent=voiceCue?`正在准备 MiniMax 第 ${cueIndex+1} / ${s.voiceCues.length} 段…`:'正在准备 MiniMax 因果讲解…';
    try{
      const [status,manifest]=await Promise.all([json('/api/voice/status'),json('./human-time-audio.json',{cache:'no-store'}).catch(()=>({steps:{}}))]);
      if(requestToken!==token)return;if(!status.configured)throw new Error('MiniMax 暂未连接。');
      const textHash=await sha(text),cacheKey=`${status.model}:${status.voiceId}:${textHash}`;
      let entry=voiceEntries.get(cacheKey)||(voiceCue?manifest.steps?.[s.id]?.cues?.[cueIndex]:manifest.steps?.[s.id]);
      if(!entry||entry.textHash!==textHash||entry.model!==status.model||entry.voiceId!==status.voiceId){entry=await json('/api/voice/synthesize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chapterId:`human-${s.id}${voiceCue?'-'+voiceCue.id:''}`,text,model:status.model,voiceId:status.voiceId})});entry={...entry,textHash};}
      voiceEntries.set(cacheKey,entry);if(requestToken!==token||!active)return;
      loadedKey=targetKey;audio.src=entry.audioUrl;audio.hidden=false;if(voiceCue)dayAt(voiceCue.fromMinutes);
      await audio.play();if(requestToken!==token)return;
      $('#human-voice-status').textContent=voiceCue?`${voiceProviderLabel()} · 第 ${cueIndex+1} / ${s.voiceCues.length} 段 · ${voiceCue.label} · 可点分段重听`:`${voiceProviderLabel()} · 正在解释这一步的原因；听完后可亲手试一试`;
    }catch(error){if(requestToken===token)$('#human-voice-status').textContent=error.message;}finally{if(requestToken===token){busy=false;$('#human-listen').disabled=false;}}
  }
  $('#human-open').onclick=open;$('#human-free').onclick=close;lesson.querySelectorAll('[data-human-step]').forEach(b=>b.onclick=()=>stage(Number(b.dataset.humanStep)));$('#human-next').onclick=()=>stage(index+1);$('#human-prev').onclick=()=>stage(index-1);$('#human-routines').onclick=()=>{close();navigate('routines');};detail.querySelectorAll('[data-clock]').forEach(b=>b.onclick=()=>{pause();solarClock=b.dataset.clock==='solar';paintClocks();});
  detail.querySelectorAll('[data-human-cue]').forEach(b=>b.onclick=()=>{stopDay();pause();cueIndex=Number(b.dataset.humanCue);completed=false;dayAt(humanTimeSteps[0].voiceCues[cueIndex].fromMinutes);void listen();});
  $('#human-day-range').oninput=e=>{stopDay();pause();dayAt(Number(e.target.value));cueIndex=Math.max(0,humanCueAtMinute(humanTimeSteps[0].voiceCues,progress));completed=false;};
  $('#human-day-play').onclick=()=>{if(!audio.paused){audio.pause();return;}if(frame){stopDay();return;}pause();if(reduced.matches){dayAt(progress>=1440?0:Math.min(1440,progress+360));return;}if(progress>=1440)progress=0;started=performance.now()-progress/1440*32000;$('#human-day-play').textContent='Ⅱ 暂停一天演示';frame=requestAnimationFrame(tick);};
  $('#human-listen').onclick=()=>void listen();
  audio.addEventListener('play',()=>{document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});$('#human-listen').textContent='Ⅱ 暂停这一步讲解';if(index===0){stopDay();$('#human-day-play').textContent='Ⅱ 暂停语音与一天演示';globe?.setDayView?.(true);frame=requestAnimationFrame(tickVoice);}});
  audio.addEventListener('pause',()=>{if(index===0)stopDay();$('#human-listen').textContent=audio.src?'▶ 继续这一步讲解':'▶ 听这一步为什么';});
  function syncVoice(){if(active&&index===0&&audio.duration>0&&loadedKey===`sun:${humanTimeSteps[0].voiceCues[cueIndex].id}`)dayAt(humanCueMinute(humanTimeSteps[0].voiceCues[cueIndex],audio.currentTime,audio.duration));}
  audio.addEventListener('timeupdate',()=>{if(!audio.paused)syncVoice();});audio.addEventListener('seeked',syncVoice);
  audio.addEventListener('ended',()=>{
    if(index===0){stopDay();const cues=humanTimeSteps[0].voiceCues;dayAt(cues[cueIndex].toMinutes);if(active&&cueIndex<cues.length-1){cueIndex++;audio.removeAttribute('src');audio.load();loadedKey='';void listen();return;}completed=true;}
    $('#human-listen').textContent='↺ 再听这一步为什么';$('#human-voice-status').textContent='讲解完成 · 点击分段可重听，或进入下一个原因';const endedStep=index;queueMicrotask(()=>window.dispatchEvent(new CustomEvent('timeatlas:human-voice-ended',{detail:{step:endedStep}})));
  });
  audio.addEventListener('error',()=>{if(audio.getAttribute('src')){$('#human-voice-status').textContent='这段音频暂时无法读取，请重新点分段播放。';audio.removeAttribute('src');loadedKey='';}});
  window.addEventListener('timeatlas:view',e=>{if(e.detail.view!=='explore'){stopDay();pause();}else if(active){globe?.setDayView?.(index===0);paintTime();}});document.addEventListener('visibilitychange',()=>{if(document.hidden){stopDay();pause();}});
  document.addEventListener('click',e=>{if(e.target.closest('[data-human-open]')){navigate('explore',{mode:'human',step:0});index=0;open();}});
  const courseHeading=document.querySelector('.classroom-heading');if(courseHeading){const button=document.createElement('button');button.className='human-course-entry';button.dataset.humanOpen='';button.textContent='为什么要有时区？先看时间怎样服务人 ↗';courseHeading.append(button);}
  window.addEventListener('timeatlas:voice-settings-changed',pause);
  open();return {open,close,pause,play:listen,getNavigationState:()=>({step:index,instant:instant.toISOString(),progress,solarClock}),restoreNavigationState(saved){index=Number.isInteger(saved?.step)&&saved.step>=0&&saved.step<humanTimeSteps.length?saved.step:0;open();if(index===0&&Number.isFinite(saved?.progress)&&saved.progress>=0&&saved.progress<=1440)dayAt(saved.progress);else if(saved?.instant&&Number.isFinite(new Date(saved.instant).getTime())){instant=new Date(saved.instant);paintTime();}if((index===2||index===3)&&typeof saved?.solarClock==='boolean'){solarClock=saved.solarClock;paintClocks();}return true;},get active(){return active;}};
}
