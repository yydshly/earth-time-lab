import {liveRegions,liveSnapshot} from './live-time-model.mjs';
import {partsAt,formatOffset} from './time-engine.mjs';
import {createLiveTimeVoice,createLiveSpeechClock} from './live-time-voice.mjs';
import {createTimeContext} from './time-context.mjs';
import {dayPhase,buildTimeReference} from './local-time-reference.mjs';
import {primaryLiveRegions,liveGlobeClocks,liveRegionForCity,liveOverviewFocus} from './live-globe-model.mjs';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const week=['','周一','周二','周三','周四','周五','周六','周日'];
const pad=n=>String(n).padStart(2,'0');
const duration=n=>{const m=Math.abs(n);return `${Math.floor(m/60)?Math.floor(m/60)+' 小时':''}${m%60?' '+m%60+' 分钟':''}`.trim();};
const clockMinute=p=>p.hour*60+p.minute;
const daySpan=(a,b)=>(Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`))/86400000;
function clockBand(start,end,now,label,nowTitle='此刻钟点'){
  const first=clockMinute(start),last=clockMinute(end),span=daySpan(start.date,end.date)*1440+last-first;
  const ranges=span>=1440?[[0,1440]]:first+span<=1440?[[first,first+span]]:[[first,1440],[0,last]];
  const x=m=>12+m/1440*696,pointer=x(clockMinute(now));
  return `<svg viewBox="0 0 720 68" role="img" aria-label="${esc(label)}钟面位置，${esc(start.date)} ${start.time} 到 ${esc(end.date)} ${end.time}${span>=1440?'，超过或等于24小时，钟面会重叠':''}"><rect class="live-band-track" x="12" y="27" width="696" height="12" rx="6"/>${ranges.map(([a,b])=>`<rect class="live-band-range" x="${x(a)}" y="27" width="${Math.max(0,x(b)-x(a))}" height="12" rx="4"/>`).join('')}${[0,360,720,1080,1440].map(m=>`<text x="${x(m)}" y="15" text-anchor="${m===0?'start':m===1440?'end':'middle'}">${String(m/60).padStart(2,'0')}:00</text>`).join('')}<line class="live-band-now" x1="${pointer}" x2="${pointer}" y1="22" y2="45"/><text class="live-band-now-label" x="${Math.max(58,Math.min(662,pointer))}" y="61" text-anchor="middle">${esc(nowTitle)} ${now.time}</text></svg>`;
}

export function initLiveTime({globe,humanTime,resetTime,getInstant,navigate,onClose}){
  const root=document.querySelector('#explore'),earth=root.querySelector('.earth-panel'),surface=earth.querySelector('.globe-surface'),switcher=root.querySelector('.human-mode-switch');
  const speechClock=createLiveSpeechClock();
  const timeContext=createTimeContext({id:'live-time-context',onNow:()=>voice.pause(),nowLabel:'结束讲解，回到实时'});timeContext.element.classList.add('time-context--dark');timeContext.element.querySelector('button').hidden=true;earth.prepend(timeContext.element);
  let active=false,selectedId='pt',globeView='overview',rows=[],instant=new Date(),timer=0,labelKey='',savedGlobe=null,quietStart='00:00',quietEnd='06:00',stepsOpen=false,referenceKey='',referenceModel=null,referenceError='',voiceCue=null,lastVoiceFocusKey='';
  const mode=document.createElement('button');mode.id='live-open';mode.textContent='此刻全球时间';mode.setAttribute('aria-pressed','false');switcher.prepend(mode);
  const header=document.createElement('section');header.className='live-header';header.hidden=true;
  header.innerHTML='<div class="live-home"><span><i></i> 我们这里 · 北京时间</span><strong id="live-beijing-clock"></strong><small id="live-beijing-date"></small></div><div class="live-read"><span id="live-header-region"></span><strong id="live-header-region-clock"></strong><p id="live-header-equation"></p><small id="live-update"></small></div>';
  switcher.after(header);
  const orbit=document.createElement('div');orbit.className='live-orbit';orbit.hidden=true;
  orbit.innerHTML='<div class="live-utc"><span>全球共同标尺 UTC</span><strong id="live-utc-clock"></strong><small id="live-utc-date"></small></div><div class="live-phase-callout"><span id="live-phase-place"></span><strong id="live-phase-name"></strong><small id="live-phase-guidance"></small></div><div class="live-earth-caption">现在，这些地方正处于同一个瞬间</div>';
  surface.append(orbit);
  const viewBar=document.createElement('div');viewBar.className='live-globe-viewbar';viewBar.hidden=true;
  viewBar.innerHTML='<div role="group" aria-label="实时地球展示方式"><button data-live-globe-view="overview" aria-pressed="true">全球总览</button><button data-live-globe-view="compare" aria-pressed="false">两地对照</button></div><span>钟点、当地阶段和日期，都写在城市标注内</span>';
  surface.before(viewBar);
  const cityDock=document.createElement('section');cityDock.className='live-city-dock';cityDock.hidden=true;cityDock.setAttribute('aria-label','紧邻地球的主要城市实时时钟');
  cityDock.innerHTML=`<div class="live-dock-heading"><strong>同一瞬间 · 全球速览</strong><span>球背面的城市可转动地球查看，或点下面的时钟直达</span></div><div class="live-dock-clocks">${primaryLiveRegions.map(id=>{const region=liveRegions.find(row=>row.id===id);return `<button data-live-dock-region="${id}" aria-pressed="false"><span>${esc(region.city)}${id==='pt'?' · PT':id==='et'?' · ET':''}</span><strong data-dock-clock></strong><small data-dock-phase></small></button>`;}).join('')}</div>`;
  surface.after(cityDock);
  const referencePanel=document.createElement('section');referencePanel.className='live-reference-panel';referencePanel.hidden=true;
  referencePanel.innerHTML=`<div class="live-reference-heading"><div><span>从一个钟点，看到一整段时间</span><h2 id="live-reference-title">当地避扰参考段 ↔ 北京时间</h2></div><span id="live-quiet-hit" class="live-quiet-hit"></span></div><div id="live-quiet-section"><div class="live-window-controls"><span id="live-window-source"></span><label>当地开始<input id="live-quiet-start" type="time" value="00:00" aria-label="当地避扰参考开始时间"></label><span aria-hidden="true">→</span><label>当地结束<input id="live-quiet-end" type="time" value="06:00" aria-label="当地避扰参考结束时间"></label></div><p class="live-window-scope">初始用当地 00:00–06:00 作深夜参考，可自行调整。这里指<strong>所选地区的当地钟表，不是 UTC</strong>；这是粗略避扰参考，不代表完整睡眠或本人状态。</p><p id="live-reference-error" class="live-reference-error" role="status"></p><div id="live-window-result"></div></div><p id="live-utc-only" hidden>UTC 是全球共同时间标尺，没有对应居民的作息；这里展示换算，不判断生活阶段。</p><details id="live-utc-steps" class="live-utc-steps"><summary>展开：北京 → UTC → 对方，怎样算出来？</summary><div id="live-calculation-clocks"></div><ol id="live-calculation-steps"></ol><p>换算的是同一个瞬间。先减去北京相对 UTC 的偏移，再加上对方当天的偏移；日期跨过午夜也要一起变化。</p></details><div id="live-reference-voice"></div>`;
  earth.querySelector('.globe-toolbar').before(referencePanel);
  const panel=document.createElement('section');panel.className='live-panel';panel.hidden=true;
  panel.innerHTML=`<div class="live-selected"><div><span id="live-selected-name"></span><p id="live-selected-cities"></p></div><div class="live-two-clocks"><div><small>我们 · 北京时间</small><strong id="live-compare-beijing"></strong><span id="live-compare-beijing-date"></span></div><b aria-hidden="true">↔</b><div><small id="live-selected-code"></small><strong id="live-compare-region"></strong><span id="live-compare-region-date"></span></div></div><div class="live-inference"><strong id="live-equation"></strong><span id="live-date-difference"></span></div><p id="live-current-rule"></p><div id="live-rule-terms" class="live-rule-terms" hidden><span data-live-concept="PT"><b>PT</b> 当地时间统称</span><span data-live-concept="PST"><b>PST</b> 标准时 UTC−8</span><span data-live-concept="PDT"><b>PDT</b> 夏令时 UTC−7</span></div></div><div id="live-voice-slot"></div><div class="live-world-heading"><h2>此刻，世界各地怎样说时间？</h2><span>点击一个地域，在地球上看它与北京的对应关系</span></div><div class="live-world" aria-label="当前全球地域时间">${liveRegions.filter(r=>r.id!=='beijing').map(r=>`<button data-live-region="${r.id}" aria-label="查看${esc(r.name)}" aria-pressed="false"><div><b>${esc(r.short)}</b><span>${esc(r.name)}</span></div><strong data-live-clock></strong><span data-live-date></span><span data-live-phase class="live-card-phase"></span><small data-live-variant></small><em data-live-difference></em></button>`).join('')}</div><p class="live-footnote">各地时钟都读取当前同一瞬间。阶段名称只描述当地钟点；避扰参考不代表某个人正在睡觉。PT 等统称按当地日期采用相应规则，当前名称和 UTC 偏移已标出；未来活动请按活动日期换算。城市用于说明地域规则，不代表整洲只有一个时区。</p><div class="live-next"><span>有了此刻的参照，再继续：</span><button data-human-open>理解时间与人的关系 ↗</button><button data-reset-open>读懂额度重置公告 ↗</button><button id="live-phrases">查全球常用时间表达 ↗</button></div>`;
  panel.prepend(panel.querySelector('#live-voice-slot'),panel.querySelector('.live-world-heading'),panel.querySelector('.live-world'));
  earth.querySelector('.globe-toolbar').before(panel);
  const voiceSlot=panel.querySelector('#live-voice-slot');voiceSlot.hidden=true;surface.before(voiceSlot);
  const workspaceTop=document.createElement('div');workspaceTop.className='live-workspace-top';workspaceTop.hidden=true;
  const workspaceTools=document.createElement('div');workspaceTools.className='live-workspace-tools';
  workspaceTools.append(viewBar,timeContext.element);workspaceTop.append(header,workspaceTools);earth.prepend(workspaceTop);
  const narration=document.createElement('section');narration.className='live-inline-narration';narration.hidden=true;
  narration.innerHTML='<div class="live-inline-cue"><p class="live-stage-current" aria-live="polite">同一瞬间，不同城市的钟表。</p><button type="button" id="live-stage-close" hidden>结束讲解</button></div>';
  narration.append(voiceSlot);earth.append(surface,cityDock,narration);earth.classList.add('live-voice-entry');
  const auxiliary=document.createElement('div');auxiliary.className='live-auxiliary';auxiliary.hidden=true;
  const referenceDetails=document.createElement('details');referenceDetails.className='live-auxiliary-section';referenceDetails.innerHTML='<summary>联系与避扰参考 <span>展开设置时段与查看 UTC 换算</span></summary>';referenceDetails.append(referencePanel);
  const regionDetails=document.createElement('details');regionDetails.className='live-auxiliary-section';regionDetails.innerHTML='<summary>更多地域与时间说法 <span>PT、ET、UTC 等规则与完整对照</span></summary>';regionDetails.append(panel);
  auxiliary.append(referenceDetails,regionDetails);earth.after(auxiliary);
  const endSpeech=narration.querySelector('#live-stage-close'),currentCue=narration.querySelector('.live-stage-current');
  function fitWorkspaceSurface(){if(!active||!root.classList.contains('active'))return;const available=earth.clientHeight-workspaceTop.offsetHeight-cityDock.offsetHeight-narration.offsetHeight;surface.style.setProperty('--live-surface-height',`${Math.max(140,available)}px`);}
  const workspaceResize=new ResizeObserver(fitWorkspaceSurface);for(const node of [earth,workspaceTop,cityDock,narration])workspaceResize.observe(node);
  function enterSpeechStage(){root.classList.add('live-speech-active');endSpeech.hidden=false;}
  function exitSpeechStage(){root.classList.remove('live-speech-active');endSpeech.hidden=true;currentCue.textContent='同一瞬间，不同城市的钟表。';}
  endSpeech.onclick=()=>voice.pause();narration.addEventListener('keydown',event=>{if(event.key==='Escape'&&speechClock.frozen){event.preventDefault();voice.pause();}});
  const $=s=>root.querySelector(s),cards=new Map([...panel.querySelectorAll('[data-live-region]')].map(b=>[b.dataset.liveRegion,b])),dockClocks=new Map([...cityDock.querySelectorAll('[data-live-dock-region]')].map(b=>[b.dataset.liveDockRegion,b]));
  const selected=()=>rows.find(r=>r.id===selectedId);
  function modelAt(at,region){try{return {model:buildTimeReference({instant:at,region,quietStart,quietEnd}),error:''};}catch(error){return {model:null,error:error.message};}}
  const voice=createLiveTimeVoice({root:$('#live-voice-slot'),freezeScene:true,getSnapshot:()=>{const at=new Date(),snapshot=liveSnapshot(at),region=snapshot.find(r=>r.id===selectedId),built=modelAt(at,region);return {instant:at.toISOString(),reference:{...partsAt(at,'Asia/Shanghai'),name:'北京',zone:'Asia/Shanghai'},selected:region,rows:snapshot,referenceModel:built.model,referenceError:built.error,quietStart,quietEnd};},onRead:model=>{speechClock.hold(model.instant);enterSpeechStage();labelKey='';referenceKey='';applyGlobeView();tick();},onCue:cue=>{
    voiceCue=cue;currentCue.textContent=cue?.caption||'同一瞬间，不同城市的钟表。';labelKey='';applyGlobeView();tick();
    if(!cue)return;
    if(cue.focus==='utc')$('#live-utc-steps').open=true;
    const key=cue.focus==='reference'?'beijing':cue.focus==='target'?selectedId:cue.focus;
    if(key!==lastVoiceFocusKey){
      const r=liveRegions.find(row=>row.id===selectedId);
      if(cue.focus==='reference')globe?.focusLocation?.({lat:39.9,lon:116.4},false);
      else if(cue.focus==='target'&&r.id!=='utc')globe?.focusLocation?.({lat:r.lat,lon:r.lon},false);
      else if(cue.focus==='comparison'&&r.id!=='utc'){const delta=((r.lon-116.4+540)%360)-180;globe?.focusLocation?.({lat:(r.lat+39.9)/2,lon:116.4+delta/2},false);}
      lastVoiceFocusKey=key;
    }
  },onRelease:reason=>{exitSpeechStage();voiceCue=null;lastVoiceFocusKey='';speechClock.release();labelKey='';referenceKey='';applyGlobeView();tick();focus();if(reason==='ended')queueMicrotask(()=>window.dispatchEvent(new CustomEvent('timeatlas:live-voice-complete')));}});
  const voiceTranscript=voiceSlot.querySelector('.live-voice-transcript');if(voiceTranscript)regionDetails.append(voiceTranscript);
  function markVoiceFields(){
    for(const node of root.querySelectorAll('[data-live-speaking]')){node.classList.remove('is-speaking');delete node.dataset.liveSpeaking;}
    if(!voiceCue)return;const h=voiceCue.highlight||{},mark=selector=>{for(const node of root.querySelectorAll(selector)){node.classList.add('is-speaking');node.dataset.liveSpeaking='true';}};
    if(h.clock==='reference')mark(h.field==='date'?'#live-beijing-date,#live-compare-beijing-date,[data-live-dock-region="beijing"] [data-dock-date]':'#live-beijing-clock,#live-compare-beijing,[data-live-dock-region="beijing"] [data-dock-clock]');
    if(h.clock==='utc')mark('#live-utc-clock,#live-utc-date,.live-utc,[data-live-chain="utc"]');
    if(h.clock==='target'){
      if(h.field==='date'||h.field==='time'){
        mark(`[data-live-region="${selectedId}"] ${h.field==='date'?'[data-live-date]':'[data-live-clock]'}`);
        mark(h.field==='date'?'#live-compare-region-date':'#live-compare-region');
        mark(`[data-live-dock-region="${selectedId}"] ${h.field==='date'?'[data-dock-date]':'[data-dock-clock]'}`);
      }else if(voiceCue.id==='current-rule')mark(`[data-live-region="${selectedId}"] [data-live-variant],#live-current-rule`);
    }
    if(h.clock&&(h.field==='date'||h.field==='time'))mark(`[data-live-chain="${h.clock}"] ${h.field==='date'?'small':'strong'}`);
    if(h.concept)mark(`[data-live-concept="${h.concept}"]`);
    if(h.window)mark('#live-window-result,#live-quiet-hit');
  }
  function renderReference(r){
    const key=[selectedId,Math.floor(instant.getTime()/60000),quietStart,quietEnd].join('|');if(key===referenceKey)return;referenceKey=key;
    const built=modelAt(instant,r);referenceModel=built.model;referenceError=built.error;
    // An invalid reference window must not erase the valid clocks or UTC chain.
    const display=referenceModel||buildTimeReference({instant,region:r});
    const applicable=display.applicable,phase=display.phase;
    $('#live-phase-place').textContent=applicable?`${r.short} · ${r.local.date} ${r.local.time}`:'UTC · 全球共同标尺';
    $('#live-phase-name').textContent=applicable?`当地${phase.label}`:'同一个瞬间';
    $('#live-phase-guidance').textContent=!applicable?'UTC 不是居民生活时区，不据此判断作息。':phase.id==='late-night'?'深夜可先避免即时打扰；这不表示本人一定在睡觉。':'这里描述当地钟点；是否方便联系仍需向本人确认。';
    $('#live-reference-title').textContent=applicable?`${r.short} 当地避扰参考段 ↔ 北京时间`:'北京 → UTC：共同的换算标尺';
    $('#live-quiet-section').hidden=!applicable;$('#live-utc-only').hidden=applicable;$('#live-quiet-hit').hidden=!applicable;
    $('#live-window-source').textContent=`${r.city}当地钟表 · 按开始日期 ${r.local.date}`;
    $('#live-reference-error').textContent=referenceError?`${referenceError} 时间带暂不显示，也不会用旧参数播报。`:'';
    const clocks=[display.reference,display.utc,display.selected];
    $('#live-calculation-clocks').innerHTML=clocks.map((c,i)=>`<div data-live-chain="${['reference','utc','target'][i]}"><span>${i===0?'我们 · ':i===1?'共同标尺 · ':'对方 · '}${esc(c.label)}</span><strong>${c.time}</strong><small>${c.date} · ${esc(c.offsetLabel)}</small></div>`).join('<b aria-hidden="true">→</b>');
    $('#live-calculation-steps').innerHTML=display.calculation.steps.map(s=>`<li>${esc(s.expression)}</li>`).join('');
    $('#live-utc-steps').querySelector('summary').textContent=`${stepsOpen?'收起':'展开'}：北京 → UTC → ${r.short}，怎样算出来？`;
    const result=$('#live-window-result');
    if(!referenceModel){$('#live-quiet-hit').textContent='参考段待修正';$('#live-quiet-hit').dataset.inside='false';result.replaceChildren();return;}
    if(!applicable){result.replaceChildren();return;}
    const q=referenceModel.quiet;
    $('#live-quiet-hit').textContent=q.containsLocalClock?'当前钟点落在所设避扰范围':'当前钟点在参考范围外';
    $('#live-quiet-hit').dataset.inside=String(q.containsLocalClock);
    if(q.status!=='ready'){
      const endpoint=(title,date,time,status,candidates)=>`<div><strong>${title} · ${date} ${time}</strong><p>${status==='gap'?'这个当地钟点因调钟不存在。':status==='fold'?'这个当地钟点因回拨出现两次。':'这个端点可明确换算。'}</p>${candidates.map((c,i)=>`<p>${candidates.length>1?'候选 '+(i+1)+'：':''}${c.source.offsetLabel} → 北京 ${c.reference.date} ${c.reference.time} · UTC ${c.utc.date} ${c.utc.time}</p>`).join('')}</div>`;
      result.innerHTML=`<div class="live-window-pending"><strong>调钟边界待确认，暂不画出唯一时间段</strong><p>请调整起止钟点，或确认具体采用哪一个 UTC 偏移；这里不会自动挪动或选择。</p>${endpoint('当地开始',q.sourceStartDate,q.startTime,q.startStatus,q.startCandidates)}${endpoint('当地结束',q.sourceEndDate,q.endTime,q.endStatus,q.endCandidates)}</div>`;return;
    }
    const format=c=>`${c.date} ${c.time}`,overDay=q.actualMinutes>=1440;
    const relation=q.containsInstant?'今天开始的这一段尚在进行；这只是参考范围。':Date.parse(q.end.instant)<=instant.getTime()?'所选地区今天开始的这一段已经结束。':'所选地区今天开始的这一段尚未开始。';
    result.innerHTML=`<div class="live-window-dates"><strong>同一段时间，两套当地钟表</strong><span>所选地区今天开始的一段：${q.sourceStartDate}${q.crossesMidnight?' · 跨午夜，结束在次日':''}</span></div><div class="live-clock-band"><div><b>${esc(r.short)} 当地参考段</b><span>${format(q.start.source)} → ${format(q.end.source)}</span></div>${clockBand(q.start.source,q.end.source,display.selected,r.short,speechClock.frozen?'快照钟点':'此刻钟点')}</div><div class="live-clock-band live-clock-band-reference"><div><b>对应北京时间</b><span>${format(q.start.reference)} → ${format(q.end.reference)}</span></div>${clockBand(q.start.reference,q.end.reference,display.reference,'北京时间',speechClock.frozen?'快照钟点':'此刻钟点')}</div><p class="live-window-duration">实际经过 <strong>${duration(q.actualMinutes)}</strong>${q.hasOffsetChange?` · 当地钟面跨度 ${duration(q.wallMinutes)}，调钟使实际时长不同`:''}${overDay?' · 超过或等于 24 小时，钟面会重叠，请以起止日期为准':''}</p><p class="live-window-relation">${relation} 当前钟点是否命中每日参考范围，见上方提示。</p><small class="live-band-note">同色表示同一段时间；横轴是各自 24 小时钟面位置，不是人口作息统计。日期和真实时长以端点为准。</small>`;
  }
  function tick(){
    if(!active||!root.classList.contains('active')||document.hidden)return;
    instant=speechClock.at();rows=liveSnapshot(instant);const beijing=rows.find(r=>r.id==='beijing').local,utc=rows.find(r=>r.id==='utc').local,r=selected();
    timeContext.update({kind:speechClock.frozen?'manual':'live',instant,zone:'Asia/Shanghai',label:speechClock.frozen?'讲解快照 · 北京时间':'北京时间',detail:speechClock.frozen?'地球、全球城市钟与下方换算都读取本次快照；暂停仍保留，讲解结束会回到实时。':''});timeContext.element.querySelector('button').hidden=!speechClock.frozen;if(speechClock.frozen)timeContext.element.querySelector('.time-context-mode strong').textContent='讲解快照';root.dataset.liveTimeMode=speechClock.frozen?'snapshot':'live';renderReference(r);
    $('#live-beijing-clock').textContent=`${beijing.time}:${pad(beijing.second)}`;$('#live-beijing-date').textContent=`${beijing.date} ${week[beijing.weekday]} · UTC+08:00`;
    $('#live-header-region').textContent=`对方 · ${r.short}${r.variant===r.short?'':` · ${r.variant}`}（${formatOffset(r.offset)}）`;$('#live-header-region-clock').textContent=`${r.local.time} · ${r.local.date}`;$('#live-header-equation').textContent=r.conversionText;$('#live-update').textContent=`${speechClock.frozen?'讲解快照 · 已定格于':'同一瞬间 · 实时更新至'} ${beijing.time}:${pad(beijing.second)}`;header.querySelector('.live-home>span').innerHTML=`<i></i> ${speechClock.frozen?'讲解快照 · 北京时间':'我们这里 · 北京时间'}`;cityDock.querySelector('.live-dock-heading strong').textContent=speechClock.frozen?'讲解快照 · 全球速览':'同一瞬间 · 全球速览';panel.querySelector('.live-world-heading h2').textContent=speechClock.frozen?'讲解快照：世界各地怎样说时间？':'此刻，世界各地怎样说时间？';$('#live-utc-clock').textContent=utc.time;$('#live-utc-date').textContent=utc.date;
    $('#live-selected-name').textContent=`${r.short} · ${r.name}`;$('#live-selected-cities').textContent=r.cities;
    $('#live-compare-beijing').textContent=beijing.time;$('#live-compare-beijing-date').textContent=`${beijing.date} ${week[beijing.weekday]}`;
    $('#live-selected-code').textContent=`对方 · ${r.short}（${speechClock.frozen?'快照':'当前'} ${r.variant}）`;$('#live-compare-region').textContent=r.local.time;$('#live-compare-region-date').textContent=`${r.local.date} ${week[r.local.weekday]}`;
    $('#live-equation').textContent=r.conversionText;$('#live-date-difference').textContent=r.dayDelta===0?`${speechClock.frozen?'快照中双方':'双方现在'}是同一个日期。`:`对方${speechClock.frozen?'快照中':'现在'}的日期比北京${r.dayDelta<0?'早':'晚'} ${Math.abs(r.dayDelta)} 天，读钟点时也要一起读日期。`;
    $('#live-rule-terms').hidden=r.id!=='pt';$('#live-current-rule').textContent=r.id==='pt'?`你听到“太平洋时间 / PT”，就先看洛杉矶这一侧的钟。${speechClock.frozen?'快照时刻':'此刻'}采用 ${r.variant}（${formatOffset(r.offset)}），北京比这里快 ${duration(r.deltaMinutes)}；PT 的时差会随标准时间与夏令时变化。`:`${speechClock.frozen?'快照时刻':'此刻'} ${r.name}使用 ${r.variant}（${formatOffset(r.offset)}）。${r.deltaMinutes===0?'与北京时间没有时差。':`北京比这里${r.deltaMinutes<0?'快':'慢'} ${duration(r.deltaMinutes)}。`}`;
    for(const row of rows){const b=cards.get(row.id);if(!b)continue;b.setAttribute('aria-pressed',String(row.id===selectedId));b.querySelector('[data-live-clock]').textContent=row.local.time;b.querySelector('[data-live-date]').textContent=`${row.local.date} ${week[row.local.weekday]}`;b.querySelector('[data-live-phase]').textContent=row.id==='utc'?'全球共同标尺':`当地${dayPhase(row.local).label}`;b.querySelector('[data-live-variant]').textContent=`${speechClock.frozen?'快照':'现在'} ${row.variant} · ${formatOffset(row.offset)}`;b.querySelector('[data-live-difference]').textContent=`${row.deltaMinutes===0?'与北京相同':`比北京${row.deltaMinutes<0?'慢':'快'} ${duration(row.deltaMinutes)}`}${row.dayDelta?` · ${row.dayDelta<0?'前':'后'} ${Math.abs(row.dayDelta)} 天`:''}`;}
    for(const row of rows){const b=dockClocks.get(row.id);if(!b)continue;const phase=dayPhase(row.local).label;b.setAttribute('aria-pressed',String(row.id===selectedId));b.setAttribute('aria-label',`查看${row.city}，${row.local.date} ${row.local.time}，当地${phase}，${row.variant}，${formatOffset(row.offset)}`);b.querySelector('[data-dock-clock]').textContent=row.local.time;b.querySelector('[data-dock-phase]').innerHTML=`当地${phase} · <span data-dock-date>${row.local.month}/${row.local.day}</span>`;}
    globe?.setInstant(instant);const key=[globeView,selectedId,beijing.date,beijing.time,r.local.time,r.variant,voiceCue?.id||''].join('|');
    if(key!==labelKey){
      labelKey=key;const labels=liveGlobeClocks(rows,selectedId,voiceCue?'compare':globeView),h=voiceCue?.highlight||{},targetId=liveRegions.find(row=>row.id===selectedId)?.cityId;
      for(const entry of labels.clocks){
        const row=rows.find(item=>item.cityId===entry.id);entry.date=row?.local.date;
        if(voiceCue){entry.selected=voiceCue.focus==='reference'?entry.id==='beijing':voiceCue.focus==='target'?entry.id===targetId:false;entry.priority=entry.selected?150:80;}
        const spoken=h.clock==='reference'&&entry.id==='beijing'||h.clock==='target'&&entry.id===targetId;
        if(spoken&&h.field)entry.highlightFields=[h.field];
        if(entry.id===targetId&&h.field==='teaching')entry.teaching=voiceCue.id==='quiet-reference'?`当地${dayPhase(r.local).label} · 参考 ${quietStart}–${quietEnd}`:voiceCue.id==='current-rule'?`本次采用 ${r.variant}`:h.concept==='PST'?'概念 · PST 标准时 UTC−08:00':h.concept==='PDT'?'概念 · PDT 夏令时 UTC−07:00':h.concept==='PT'?'PT · 当地时间统称':`本次采用 ${r.variant}`;
        if(h.window&&voiceCue.focus==='comparison'){
          const q=referenceModel?.quiet,stamp=c=>`${c.date.slice(5).replace('-','/')} ${c.time}`,target=entry.id===targetId;
          entry.teaching=voiceCue.id==='individual'?(target?'粗略参考 ≠ 本人日程':'联系前确认实际日程'):q?.status==='ready'?`${stamp(target?q.start.source:q.start.reference)} → ${stamp(target?q.end.source:q.end.reference)}`:(target?'调钟边界待确认':'暂不能给出唯一区间');
          entry.highlightFields=['teaching'];
        }
      }
      for(const annotation of labels.annotations){annotation.active=!!voiceCue&&(voiceCue.focus==='target'||h.window);if(h.window)annotation.detail=voiceCue.id==='individual'?'粗略参考 ≠ 本人日程':`当地参考 ${quietStart}–${quietEnd}\n不代表本人正在睡觉`;}
      globe?.setCityLabels?.(labels.clocks);globe?.setAnnotations?.(labels.annotations);
    }
    if(voiceCue)orbit.querySelector('.live-earth-caption').textContent=voiceCue.caption;
    markVoiceFields();
  }
  function focus(){const r=liveRegions.find(x=>x.id===selectedId);if(r.id==='utc'){globe?.focusLocation?.({lat:30,lon:116.4},false);return;}if(globeView==='overview'){globe?.focusLocation?.(liveOverviewFocus(r),false);return;}const delta=((r.lon-116.4+540)%360)-180;globe?.focusLocation?.({lat:(r.lat+39.9)/2,lon:116.4+delta/2},false);}
  function applyGlobeView(){root.dataset.liveGlobeView=globeView;for(const b of viewBar.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.liveGlobeView===globeView));globe?.setLabelLayout?.({density:globeView==='overview'?'global':'default',reservedSelectors:['.live-utc','.live-phase-callout','.live-earth-caption']});orbit.querySelector('.live-earth-caption').textContent=voiceCue?voiceCue.caption:speechClock.frozen?'讲解快照 · 地球与各地钟表已定格，暂停仍保留':globeView==='overview'?'拖动地球看各地；每个时钟都是同一个瞬间':'同一个瞬间：北京与所选地区，用各自的钟表表示';}
  function choose(id){if(!liveRegions.some(r=>r.id===id))return;voice.pause();selectedId=id;labelKey='';referenceKey='';tick();focus();}
  function start(){clearInterval(timer);timer=0;tick();if(root.classList.contains('active')&&!document.hidden)timer=setInterval(tick,1000);}
  function open(){voice.pause();if(!active){humanTime.close();resetTime.close();savedGlobe=globe?.getState?.();active=true;}root.classList.add('live-explaining');workspaceTop.hidden=auxiliary.hidden=narration.hidden=header.hidden=orbit.hidden=referencePanel.hidden=panel.hidden=viewBar.hidden=cityDock.hidden=voiceSlot.hidden=false;applyGlobeView();root.querySelector('h1').textContent='现在，我们与世界各地分别几点？';root.querySelector('.page-heading p').textContent='以当前北京时间为参照，直接认识 PT、ET、UTC 等说法，以及对应地域此刻的钟点。';switcher.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===mode)));globe?.setAutoRotate?.(false);globe?.setDayView?.(false);globe?.setNight(true);globe?.setLabels?.(true);globe?.setGrid?.(true);void globe?.setZoneLayer?.('none');labelKey='';referenceKey='';start();fitWorkspaceSurface();focus();}
  function close(){if(!active)return;voice.pause();clearInterval(timer);timer=0;active=false;root.classList.remove('live-explaining');workspaceTop.hidden=auxiliary.hidden=narration.hidden=header.hidden=orbit.hidden=referencePanel.hidden=panel.hidden=viewBar.hidden=cityDock.hidden=voiceSlot.hidden=true;delete root.dataset.liveGlobeView;delete root.dataset.liveTimeMode;globe?.setLabelLayout?.();mode.setAttribute('aria-pressed','false');root.querySelector('#human-free').setAttribute('aria-pressed','true');root.querySelector('h1').textContent='按指定日期，手动换算世界时间';root.querySelector('.page-heading p').textContent='这是手动换算视图；查看实时钟表，请切回“此刻全球时间”。';globe?.setAnnotations?.([]);globe?.setCityLabels?.(null);globe?.setLabels?.(savedGlobe?.labels??true);globe?.setGrid?.(savedGlobe?.grid??false);globe?.setNight(savedGlobe?.night??true);globe?.setAutoRotate?.(savedGlobe?.autoRotate??false);void globe?.setZoneLayer?.(savedGlobe?.zoneLayer||'none');globe?.setInstant(getInstant());onClose?.();}
  for(const [id,b]of dockClocks)b.onclick=()=>choose(id);
  for(const b of viewBar.querySelectorAll('button'))b.onclick=()=>{globeView=b.dataset.liveGlobeView;labelKey='';applyGlobeView();tick();focus();};
  surface.addEventListener('timeatlas:globe-city-select',e=>{if(!active||!root.classList.contains('active'))return;const id=liveRegionForCity(liveRegions,e.detail?.cityId);if(!id||id===selectedId)return;choose(id);surface.dispatchEvent(new Event('change',{bubbles:true}));});
  mode.onclick=open;root.querySelector('#human-free').addEventListener('click',close);for(const [id,b]of cards)b.onclick=()=>choose(id);$('#live-phrases').onclick=()=>{voice.pause();const row=liveSnapshot(new Date()).find(r=>r.id===selectedId);window.dispatchEvent(new CustomEvent('timeatlas:expression-context',{detail:{zone:row.zone,date:row.local.date,time:row.local.time}}));navigate('phrases');};
  window.addEventListener('timeatlas:view',e=>{clearInterval(timer);timer=0;if(e.detail.view==='explore'&&active){labelKey='';start();}else voice.pause();});document.addEventListener('visibilitychange',()=>{clearInterval(timer);timer=0;if(!document.hidden&&active&&root.classList.contains('active'))start();});
  window.addEventListener('timeatlas:voice-settings-changed',voice.pause);
  function changeQuiet(){voice.pause();quietStart=$('#live-quiet-start').value;quietEnd=$('#live-quiet-end').value;referenceKey='';tick();}
  $('#live-quiet-start').addEventListener('input',changeQuiet);$('#live-quiet-end').addEventListener('input',changeQuiet);
  $('#live-utc-steps').addEventListener('toggle',()=>{stepsOpen=$('#live-utc-steps').open;const r=liveRegions.find(row=>row.id===selectedId);$('#live-utc-steps').querySelector('summary').textContent=`${stepsOpen?'收起':'展开'}：北京 → UTC → ${r.short}，怎样算出来？`;if(active)$('#live-utc-steps').dispatchEvent(new Event('change',{bubbles:true}));});
  return {open,close,choose,play:()=>active?voice.play():undefined,pause:()=>voice.pause(),startNarration:()=>active?voice.play():undefined,pauseNarration:()=>voice.pause(),getNavigationState:()=>({region:selectedId,globeView,quietStart,quietEnd,stepsOpen}),restoreNavigationState(saved){if(['overview','compare'].includes(saved?.globeView))globeView=saved.globeView;if(liveRegions.some(r=>r.id===saved?.region))selectedId=saved.region;for(const field of ['quietStart','quietEnd'])if(typeof saved?.[field]==='string'&&(saved[field]===''||/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(saved[field]))){if(field==='quietStart')quietStart=saved[field];else quietEnd=saved[field];}stepsOpen=saved?.stepsOpen===true;$('#live-quiet-start').value=quietStart;$('#live-quiet-end').value=quietEnd;$('#live-utc-steps').open=stepsOpen;open();return true;},get active(){return active;}};
}
