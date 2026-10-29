import {voiceFetch,voiceProviderLabel} from './recorded-voice.mjs';
import {globeLessons,globeLessonSources} from './globe-lessons-data.mjs';
import {createGlobe} from './globe.mjs';
import {partsAt,offsetMinutes,formatOffset,zonedToInstants} from './time-engine.mjs';
import {twelveHour,compareClocks,dayCycleInstant,localClockWords,lessonPresentation} from './lesson-model.mjs';
import {zoneColor,offsetMinutesAt,formatZoneOffset} from './zone-geometry.mjs';
import {createRoutineAtlas} from './routine-atlas.mjs';
import {normalizeLessonNavigation,createLessonRestoreGuard} from './lesson-navigation.mjs';
import {createTimeContext} from './time-context.mjs';
import {cityTeachingCopy,geographicLessonAnnotations,transitionScene} from './lesson-visual-model.mjs';
import {lessonCueTarget} from './lesson-semantic-cues.mjs';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels=['读懂时间','地球自转','UTC 标尺','时差计算','时区边界','夏令时','世界作息','约同一刻'];
const formatDate=d=>`${d.slice(0,4)} 年 ${Number(d.slice(5,7))} 月 ${Number(d.slice(8,10))} 日`;

export async function initGlobeLessons({cities,navigate,toast,openPlannerCase,onNavigationChange}) {
  const tour=document.querySelector('#tour'),library=document.createElement('div');
  library.id='tour-library';while(tour.firstChild)library.append(tour.firstChild);tour.append(library);library.hidden=true;
  const shell=document.createElement('div');shell.id='globe-classroom';
  shell.innerHTML=`
    <header class="classroom-heading"><div><div class="eyebrow">TIME, FROM THE GROUND UP.</div><h1 id="classroom-title">让地球，把时间讲清楚。</h1></div><span class="classroom-tag">零基础 · 8 个小实验</span></header>
    <nav id="classroom-route" class="classroom-route" aria-label="入门学习路线"></nav>
    <article class="planet-lesson" aria-labelledby="planet-title">
      <div class="planet-heading"><div><span id="planet-count"></span><h2 id="planet-title"></h2><p id="planet-question"></p></div><div class="planet-heading-tools"><button id="lesson-listen" class="lesson-listen">▶ 听讲解</button><button id="lesson-help" aria-label="查看地球操作说明">?</button></div></div>
      <div class="lesson-hint" id="lesson-help-text" hidden>拖动地球看另一面；点击城市时钟定位。滚轮或 ＋ / − 缩放。方向键可旋转地球。每课点选场景，或让语音带着演示走。</div>
      <div class="planet-stagebar" id="planet-stagebar" aria-label="本课演示场景"></div>
      <div class="planet-observatory">
        <div class="planet-reference"><span id="lesson-reference-title">同一个瞬间 · UTC</span><strong id="lesson-utc"></strong><small id="lesson-date"></small><small id="lesson-reference-note" hidden></small></div>
        <div id="lesson-sun-direction" class="lesson-sun-direction" hidden><span>☀</span><strong>← 阳光</strong><small>太阳方向保持不变</small></div>
        <div class="planet-layer-status" id="planet-layer-status" role="status"></div>
        <div class="globe-surface lesson-surface"><canvas id="lesson-globe"></canvas></div>
        <div class="planet-tools" aria-label="地球操作"><button id="lesson-zoom-out" aria-label="缩小入门课地球">−</button><button id="lesson-zoom-in" aria-label="放大入门课地球">＋</button><button id="lesson-reset" aria-label="返回本场景视角">↺</button><button id="lesson-spin" aria-pressed="false" title="只转动观察视角，时间保持不变">转动视角</button></div>
      </div>
      <div class="lesson-transition" id="lesson-transition" hidden aria-label="洛杉矶夏令时跳时时间轴"><div class="lesson-transition-title">洛杉矶 · 2026 年 3 月 8 日 · 当地钟面</div><div class="lesson-transition-track"><button data-transition-phase="before"><small>跳时前 · PST</small><strong>01:59</strong></button><span aria-hidden="true">→</span><button data-transition-phase="gap"><small>缺失区间</small><strong>02:00–02:59</strong><small>02:30 不存在</small></button><span aria-hidden="true">→</span><button data-transition-phase="after"><small>跳时后 · PDT</small><strong>03:00</strong></button></div><div class="lesson-transition-utc">共同标尺 UTC：<b>09:59 → 10:00</b> · 只过了 1 分钟</div><p id="lesson-transition-caption" role="status"></p></div>
      <div id="lesson-current-voice" class="lesson-current-voice" hidden><span id="lesson-current-voice-title"></span><p id="lesson-current-voice-text" aria-live="polite"></p><div class="lesson-cue-controls"><button id="lesson-cue-prev" type="button">← 上一句</button><button id="lesson-cue-next" type="button">下一句 →</button></div></div>
      <div class="lesson-day-control" id="lesson-day-control" hidden><div class="lesson-day-heading"><button id="lesson-day-play" aria-pressed="false">▶ 播放地球的一天</button><button id="lesson-day-reset">↺ 从早晨开始</button><output id="lesson-day-elapsed">已过 0 小时</output></div><label class="sr-only" for="lesson-day-progress">地球一天的进度，0 到 24 小时</label><input id="lesson-day-progress" type="range" min="0" max="1440" step="1" value="0"><div class="lesson-day-marks"><span>早晨 · 出发</span><span>6 小时</span><span>12 小时</span><span>18 小时</span><span>24 小时 · 次日</span></div><p id="lesson-day-observation" role="status"></p></div>
      <div class="planet-city-dock" id="planet-city-dock" aria-label="定位本场景城市"></div>
      <div class="planet-equation"><span id="lesson-equation-label"></span><strong id="lesson-formula"></strong><small id="lesson-formula-note"></small></div>
      <div class="lesson-scene-footer"><span id="lesson-scene-caption"></span><button id="lesson-scene-next">下一步 →</button><button id="lesson-case" hidden>用这个案例约时间 ↗</button></div>
      <div id="lesson-zone-legend" class="lesson-zone-legend"></div>
      <div class="planet-time-control"><label for="lesson-time"><span id="lesson-time-title">拨动同一个瞬间</span> <output id="lesson-time-output"></output></label><input id="lesson-time" type="range" min="0" max="1439" step="1" aria-label="调整演示的时间"><div><span id="lesson-time-zero">00:00 UTC</span><span>12:00</span><span>23:59</span></div></div>
      <div class="planet-bottom"><p id="lesson-instruction"></p><div class="planet-layer-picker" aria-label="时区图层"><button data-lesson-layer="none">地表</button><button data-lesson-layer="ideal">15° 示意带</button><button data-lesson-layer="legal">实际时区</button></div></div>
      <div class="planet-voice"><audio id="lesson-audio" controls preload="metadata" aria-label="MiniMax 当前步骤讲解" hidden></audio><label><input id="lesson-follow" type="checkbox" checked> 跟随讲解演示</label><label><input id="lesson-continuous" type="checkbox">连听下一课</label><span id="lesson-voice-status">MiniMax 中文讲述</span></div>
      <p id="lesson-error" class="lesson-error" role="status"></p>
    </article>
    <div class="lesson-check"><div><span class="eyebrow">试着判断一下</span><h3 id="lesson-quiz-question"></h3></div><div id="lesson-quiz-options"></div><p id="lesson-quiz-result" role="status"></p></div>
    <div class="lesson-navigation"><button id="lesson-prev">← 上一课</button><span id="lesson-takeaway"></span><button id="lesson-next">下一课 →</button></div>
    <details class="lesson-details"><summary>查看本课讲稿与资料来源</summary><div id="lesson-transcript"></div><div id="lesson-sources"></div><p>城市时钟按所选日期与 IANA 规则计算。15° 色带是理想模型；实际时区来自经过简化的开源地域数据，不作为精确行政或法律边界。中国区域以全国标准时间 UTC+08:00 展示；原始数据中的新疆地区 UTC+06:00 习惯用时重叠区域不单独着色。地域作息环是工作日教学示意，来源事实另标适用范围；个人联系与睡眠窗口可独立修改。</p><a href="https://github.com/evansiroky/timezone-boundary-builder" target="_blank" rel="noreferrer">时区地域：Timezone Boundary Builder 2026e / OpenStreetMap · ODbL ↗</a><a href="assets/timezones-DATA-LICENSE.txt" target="_blank">边界数据许可</a></details>
  `;
  const modes=document.createElement('div');modes.className='tour-mode-switch';modes.innerHTML='<button data-tour-mode="classroom" aria-pressed="true">地球入门课</button><button data-tour-mode="library" aria-pressed="false">国家与城市巡游 · 62 章</button>';
  tour.prepend(modes,shell);
  const $=s=>shell.querySelector(s),byId=id=>cities.find(c=>c.id===id),audio=$('#lesson-audio');
  $('.planet-observatory').append($('#lesson-current-voice'));
  let current=0,step=0,instant,globe,globePromise,loadToken=0,sceneToken=0,voiceStatus={},manifest={chapters:{},stages:{}},activeMode='classroom',playingRequest=false,sceneLayer='none',modifiedTime=false,timeKind='example';
  let audioKey='',audioCue=0,dayPlaying=false,dayFrame=0,dayElapsed=0,dayLastFrame=0,dayDrawTime=0,audioDriven=false,voiceFrame=0,focusedCityId=null,transitionPhase='after';
  let voiceCueTarget=null,guidedPlayback=false;
  const navigationRestore=createLessonRestoreGuard();
  const lesson=()=>globeLessons[current],stage=()=>lesson().stages[step];
  const key=()=>`${lesson().id}:${step}`;
  const cue=()=>stage().voiceCues?.[audioCue];
  const voiceKey=()=>cue()?`${key()}:cue:${audioCue}`:key();
  function emitVoiceState(){window.dispatchEvent(new CustomEvent('timeatlas:lesson-voice-state',{detail:{lessonId:lesson().id,step,playing:!audio.paused,busy:playingRequest,active:activeMode==='classroom'&&tour.classList.contains('active'),hasAudio:Boolean(audio.getAttribute('src')),caption:cue()?.caption||stage().caption,index:audioCue,total:stage().voiceCues?.length||1,error:$('#lesson-error').textContent}}));}
  const voiceTexts=globeLessons.flatMap(c=>c.stages.flatMap((s,i)=>[[`${c.id}:${i}`,s.narration],...(s.voiceCues||[]).map((v,j)=>[`${c.id}:${i}:cue:${j}`,v.narration])]));
  const hashes=new Map(await Promise.all(voiceTexts.map(async([id,text])=>[id,[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('')])));
  const routineAtlas=createRoutineAtlas({observatory:$('.planet-observatory'),cities,getGlobe:()=>globe,
    onVoiceStart:()=>suspendVoice(),
    onClockPending:pending=>{$('#lesson-case').disabled=pending;},
    onSelectCity:id=>{modifiedTime=true;updateClockLabels();globe?.focusCity(byId(id));emitNavigation();},
    onSetInstant:at=>{suspendVoice();timeKind='manual';modifiedTime=true;instant=new Date(at);updateClockLabels();emitNavigation();},
    onPersonChange:()=>{modifiedTime=true;updateClockLabels();emitNavigation();}
  });
  const timeContext=createTimeContext({id:'lesson-time-context',onNow:()=>{
    if(lesson().mode!=='routines'){navigate('explore',{mode:'live'});return;}
    cancelNavigationRestore();suspendVoice();routineAtlas.pause();timeKind='manual';modifiedTime=true;instant=new Date();updateClockLabels();emitNavigation();
  }});
  $('#planet-stagebar').after(timeContext.element);
  // Keep the globe in the page. Explanations and adjustments sit beside it,
  // while speech always uses the same canvas and the same audio controls.
  const workspace=document.createElement('div');workspace.className='lesson-workspace';
  const mainScene=document.createElement('div');mainScene.className='lesson-main';
  const assistance=document.createElement('aside');assistance.className='lesson-assist';assistance.setAttribute('aria-label','本课时间与辅助操作');
  $('.planet-heading').after(workspace);workspace.append(mainScene,assistance);
  mainScene.append($('.planet-observatory'),$('#planet-city-dock'),$('#lesson-zone-legend'),$('#lesson-current-voice'),$('.planet-voice'),$('#lesson-error'));
  assistance.append(timeContext.element,$('#planet-question'),$('#planet-stagebar'),$('.planet-equation'),$('#lesson-transition'),$('#lesson-day-control'),$('.lesson-scene-footer'));
  const settings=document.createElement('details');settings.className='lesson-settings';settings.innerHTML='<summary>时间、图层与播放设置</summary>';
  settings.append($('.planet-time-control'),$('.planet-bottom'));
  const playbackSettings=document.createElement('div');playbackSettings.className='lesson-playback-settings';
  for(const label of [...$('.planet-voice').querySelectorAll('label')])playbackSettings.append(label);
  settings.append(playbackSettings);assistance.append(settings);
  const contextNotes=document.createElement('details');contextNotes.className='lesson-context-notes';contextNotes.innerHTML='<summary>示例说明</summary>';
  contextNotes.append(timeContext.element.querySelector('.time-context-detail'));timeContext.element.append(contextNotes);
  routineAtlas.mountWorkspace(mainScene,assistance);
  function getNavigationState(){return {mode:activeMode,lessonId:lesson().id,step,instant:new Date(instant||stage().instant).toISOString(),routineCityId:routineAtlas.selectedCityId,timeKind,...(stage().transition&&!modifiedTime?{transitionPhase}:{})};}
  function emitNavigation(){if(!navigationRestore.active)onNavigationChange?.(getNavigationState());}
  function cancelNavigationRestore(){navigationRestore.invalidate();}
  let completed=new Set();try{completed=new Set(JSON.parse(localStorage.getItem('time-atlas-lessons-done')||'[]'));}catch{}
  function setMode(mode,{notify=true,restoreRequest}={}){
    if(restoreRequest){if(!restoreRequest.isCurrent())return;}else cancelNavigationRestore();
    activeMode=mode;shell.hidden=mode!=='classroom';library.hidden=mode!=='library';
    tour.setAttribute('aria-labelledby',mode==='classroom'?'classroom-title':'tour-title');
    modes.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tourMode===mode)));
    if(mode==='classroom'){document.querySelector('#tour-audio')?.pause();void ensureGlobe();}else {suspendVoice();routineAtlas.pause();}
    window.dispatchEvent(new CustomEvent('timeatlas:tourmode',{detail:{mode}}));
    if(notify)emitNavigation();
  }
  modes.querySelectorAll('button').forEach(b=>b.onclick=()=>setMode(b.dataset.tourMode));
  function renderRoute(){
    $('#classroom-route').innerHTML=globeLessons.map((l,i)=>`<button data-lesson="${i}" aria-current="${i===current?'step':'false'}" title="${esc(l.title)}"><span>${completed.has(l.id)?'✓':String(i+1).padStart(2,'0')}</span>${labels[i]||esc(l.title)}</button>`).join('');
    $('#classroom-route').querySelectorAll('button').forEach(b=>b.onclick=()=>choose(Number(b.dataset.lesson)));
  }
  function renderLesson(){
    const l=lesson();renderRoute();$('#planet-count').textContent=`第 ${current+1} / ${globeLessons.length} 课`;
    $('#planet-title').textContent=l.title;$('#planet-question').textContent=l.question;$('#lesson-takeaway').textContent=l.takeaway;
    $('#lesson-prev').disabled=current===0;$('#lesson-next').textContent=current===globeLessons.length-1?'用这个案例继续 ↗':'下一课 →';
    $('#planet-stagebar').innerHTML=l.stages.map((s,i)=>`<button data-scene="${i}" aria-pressed="${i===step}"><span>${i+1}</span>${esc(s.label)}</button>`).join('');
    $('#planet-stagebar').querySelectorAll('button').forEach(b=>b.onclick=()=>void selectStage(Number(b.dataset.scene)));
    $('#lesson-transcript').innerHTML=l.stages.map(s=>`<h3>${esc(s.label)}</h3><p>${esc(s.narration||'')}</p>`).join('');
    const ids=l.sources||l.sourceIds||[];
    $('#lesson-sources').innerHTML=ids.map(id=>typeof id==='object'?id:globeLessonSources.find(s=>s.id===id)).filter(Boolean).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)} ↗</a>`).join('');
    renderQuiz();
  }
  function renderQuiz(){
    const q=lesson().quiz;$('#lesson-quiz-question').textContent=q.question;$('#lesson-quiz-result').textContent='';
    $('#lesson-quiz-options').innerHTML=q.options.map((o,i)=>`<button data-answer="${i}">${esc(o)}</button>`).join('');
    $('#lesson-quiz-options').querySelectorAll('button').forEach(b=>b.onclick=()=>{
      const correct=Number(b.dataset.answer)===q.answer;
      $('#lesson-quiz-result').textContent=`${correct?'✓ 对了。':'再看一眼地球。'}${q.explanation}`;
      b.dataset.result=correct?'correct':'retry';
      if(correct){completed.add(lesson().id);try{localStorage.setItem('time-atlas-lessons-done',JSON.stringify([...completed]));}catch{}renderRoute();}
    });
  }
  function activeCities(){const ids=lesson().mode==='routines'?[routineAtlas.selectedCityId,...(stage().cities||[])]:stage().cities||[];return [...new Set(ids)].map(byId).filter(Boolean);}
  function renderZoneLegend(){
    const legend=$('#lesson-zone-legend');legend.hidden=sceneLayer==='none'||!lessonPresentation(lesson(),stage()).showUtc;
    const values=sceneLayer==='ideal'?[-60,0,60,120]:[...new Set(activeCities().map(c=>offsetMinutes(instant,c.zone)))];
    legend.innerHTML=values.map(n=>`<span><i style="background:${zoneColor(n)}"></i>${formatOffset(n)}</span>`).join('')+(sceneLayer==='legal'?'<small>点选陆地，查看这里的时区</small>':'');
  }
  function updateClockLabels(){
    const l=lesson(),s=stage(),cs=activeCities(),presentation=lessonPresentation(l,s);
    const reference=cs[0];
    timeContext.update({kind:timeKind,instant,zone:reference?.zone||'UTC',label:reference?.name||'全球共同时间',showUtc:presentation.showUtc,detail:timeKind==='manual'?'这是你选定并定格的时刻；作息环只显示生活示意，联系前仍需向本人确认。':'这是课程选定的教学日期，不代表真实现在；切换场景会回到对应示例。'});
    timeContext.element.querySelector('button').textContent=l.mode==='routines'?'用现在试一次':'对照真实现在';
    routineAtlas.update(instant);
    const records=cs.map(c=>{
      const p=partsAt(instant,c.zone),offset=formatOffset(offsetMinutes(instant,c.zone)),personal=l.mode==='routines'?routineAtlas.snapshot(instant,c.id)?.personal:null,routine=personal?{text:personal.canContact?'30 分钟在个人窗口内':personal.state==='sleep'?'个人睡眠设置':'先留言确认',tone:personal.canContact?'work':personal.state==='sleep'?'sleep':'free'}:null;
      const notation=presentation.showNotation?twelveHour(p):presentation.beginner?localClockWords(p):null;
      const teaching=cityTeachingCopy(s,c.id,{modifiedTime,mode:l.mode}),transition=transitionScene(s,transitionPhase),semantic=s.voiceCues?.some(v=>v.target),target=voiceCueTarget?.cityId===c.id?voiceCueTarget:null,selected=c.id===(l.mode==='routines'?routineAtlas.selectedCityId:focusedCityId||cs[0]?.id);
      return {id:c.id,headline:p.time,...(semantic?{date:p.date}:{}),teaching:target?.field==='teaching'?target.text:transition&&!modifiedTime?transition.teaching:semantic?'':teaching.teaching,detail:`${semantic?'':`${p.month} 月 ${p.day} 日`}${presentation.showUtc?(semantic?'':' · ')+offset:''}${notation?'\n'+notation:''}${!semantic&&teaching.detail?'\n'+teaching.detail:''}${routine?'\n'+routine.text+' · 示例':''}${l.mode==='meeting'?'\n'+c.zone:''}`,highlightFields:target?[target.field]:[],selected,priority:selected?100:10,tone:routine?.tone||'clock'};
    });
    globe?.setInstant(instant);globe?.setCityLabels?.(records);
    const primary=cs[0]?partsAt(instant,cs[0].zone):null;
    $('#lesson-reference-title').textContent=presentation.showUtc?'同一个瞬间 · UTC':presentation.dayCycle?'跟着北京过一天':presentation.beginner?(step===2?'同一瞬间':'北京的这一天'):'经度与阳光';
    $('#lesson-utc').textContent=presentation.showUtc?instant.toISOString().slice(11,16):presentation.dayCycle?primary.time:presentation.beginner?(step===2?'一起看':`${primary.month} 月 ${primary.day} 日`):'15° ≈ 1 小时';
    $('#lesson-date').textContent=presentation.showUtc?formatDate(instant.toISOString().slice(0,10)):presentation.dayCycle?`${primary.month} 月 ${primary.day} 日 · ${localClockWords(primary)}`:presentation.beginner?(step===2?'钟点、日期都可以不同':`${primary.year} 年 · 日期`):'理想太阳时模型';
    const referenceNote=(s.callouts||[]).find(c=>c.kind==='reference');$('#lesson-reference-note').hidden=!referenceNote;$('#lesson-reference-note').textContent=referenceNote?modifiedTime?'全球共同参照 · 不属于某一座城市':referenceNote.detail:'';
    const mins=presentation.beginner?primary.hour*60+primary.minute:instant.getUTCHours()*60+instant.getUTCMinutes();$('#lesson-time').value=mins;$('#lesson-time-output').textContent=presentation.beginner?`${cs[0].name} ${primary.time}`:`${instant.toISOString().slice(11,16)} UTC`;
    $('#lesson-time-title').textContent=presentation.beginner?`拨动${cs[0].name}的钟表`:'拨动同一个瞬间';$('#lesson-time-zero').textContent=presentation.beginner?'00:00':'00:00 UTC';
    $('#lesson-time').setAttribute('aria-label',presentation.beginner?`调整${cs[0].name}的当地钟点`:'调整演示的 UTC 时间');
    $('#planet-city-dock').innerHTML=cs.map((c,i)=>`<button data-locate="${c.id}"><span class="dock-pin">●</span>${esc(c.name)} <strong>${records[i].headline}</strong><small>${esc(partsAt(instant,c.zone).date.slice(5))}</small><span aria-hidden="true">↗</span></button>`).join('')+(!cs.length?(s.callouts||[]).map((c,i)=>`<button data-anchor="${i}">${esc(c.text)} ↗</button>`).join(''):'');
    $('#planet-city-dock').querySelectorAll('[data-locate]').forEach(b=>b.onclick=()=>{if(l.mode==='routines')routineAtlas.selectCity(b.dataset.locate);else{focusedCityId=b.dataset.locate;updateClockLabels();globe?.focusCity(byId(b.dataset.locate));}});
    $('#planet-city-dock').querySelectorAll('[data-anchor]').forEach(b=>b.onclick=()=>globe?.focusLocation?.(s.callouts[Number(b.dataset.anchor)]));
    let formula=s.formula||l.takeaway,note=s.instruction||'',label='看着地球，记住这一点';
    if(['conversion','meeting'].includes(l.mode)&&cs.length>1&&modifiedTime){const pair=compareClocks(instant,cs[0],cs[cs.length-1]);formula=pair.formula;note=`${pair.offsets} · ${pair.dateNote}`;label='目标时间 = 已知时间 + 两地 UTC 偏移之差';}
    if(l.mode==='offsets'&&cs.length){const c=cs[0],p=partsAt(instant,c.zone);formula=`UTC ${instant.toISOString().slice(11,16)} ${formatOffset(offsetMinutes(instant,c.zone)).replace('UTC','')} = ${c.name} ${p.time}`;label='当地钟点 = UTC + 当天的偏移';note=modifiedTime?`${c.name}当地日期 ${p.date} · 偏移依据本场景日期计算`:s.formula||s.instruction||'';}
    if(modifiedTime&&l.mode==='conversion'&&cs.length===1){const c=cs[0],p=partsAt(instant,c.zone);formula=`UTC ${instant.toISOString().slice(11,16)} ↔ ${c.name} ${p.time}`;note=`UTC 日期 ${instant.toISOString().slice(0,10)} · ${c.name}日期 ${p.date} · ${formatOffset(offsetMinutes(instant,c.zone))}`;}
    if(presentation.beginner&&cs.length===1){const p=partsAt(instant,cs[0].zone);formula=presentation.showNotation?`${p.time} = ${twelveHour(p)}`:`${cs[0].name} · ${p.month} 月 ${p.day} 日 · ${localClockWords(p)}`;note=presentation.showNotation?`${s.callouts?.[0]?.detail||''}；正式约定优先写 24 小时制。`:'先读日期，再读钟点，最后确认是哪座城市。';label=presentation.showNotation?'同一钟点的两种写法':'一个完整的时刻：日期 + 钟点 + 地点';}
    if(presentation.dayCycle){const elapsed=Math.floor(dayElapsed),hours=Math.floor(elapsed/60),minutes=elapsed%60;$('#lesson-day-elapsed').textContent=`已过 ${hours} 小时${minutes?' '+minutes+' 分':''}`;$('#lesson-day-progress').value=elapsed;$('#lesson-day-play').textContent=dayPlaying?'Ⅱ 暂停这一天':elapsed>=1440?'↺ 再看一天':'▶ 播放地球的一天';$('#lesson-day-play').setAttribute('aria-pressed',String(dayPlaying));const before=partsAt(s.instant,cs[0].zone),nextDate=before.date!==primary.date;formula=`北京 ${primary.month} 月 ${primary.day} 日 ${primary.time}${nextDate?' · 日历已翻到次日':''}`;label='同一个城市，随着地球转动经历一天';note='城市转到背面时，可在下方继续读它的钟点。';const observation=elapsed>=1440?'一天走完：回到早晨，日历已经多了一天。':nextDate?'经过午夜：日期翻到下一天，钟点从 00:00 重新开始。':elapsed<360?'从早晨出发，看北京进入明亮的一侧。':elapsed<720?'钟点继续向前，北京正走过白天。':'北京转入黑夜，地球和钟表继续向前。';if($('#lesson-day-observation').textContent!==observation)$('#lesson-day-observation').textContent=observation;}
    if(l.mode==='routines'){formula=cs.map(c=>{const p=routineAtlas.snapshot(instant,c.id).personal;return `${c.name} ${p.canContact?'窗口内':p.state==='sleep'?'睡眠':'需确认'}`;}).join(' · ');label='同一瞬间 · 比较这几位示例人物的 30 分钟窗口';note='点击城市切换作息双环；内环的联系与睡眠设置会一起带入约时间工具。';}
    if(modifiedTime&&l.mode==='dst'){formula=cs.map(c=>`${c.name} ${partsAt(instant,c.zone).time} ${formatOffset(offsetMinutes(instant,c.zone))}`).join(' · ');note='你正在探索本场景的日期；切换场景可比较季节。';}
    const transition=transitionScene(s,transitionPhase);$('#lesson-transition').hidden=!transition;
    if(transition){for(const b of $('#lesson-transition').querySelectorAll('[data-transition-phase]'))b.setAttribute('aria-pressed',String(!modifiedTime&&b.dataset.transitionPhase===transition.phase));$('#lesson-transition-caption').textContent=modifiedTime?'你正在手动探索另一时刻；点选时间轴回到跳时示例。':transition.caption;if(!modifiedTime){formula='当地钟面 01:59 → 03:00；UTC 09:59 → 10:00';label='同一个连续的时间，发生改变的是当地钟面的写法';note='2026 年 3 月 8 日 · 洛杉矶；两边的真实时刻只相隔 1 分钟。';}}
    $('#lesson-formula').textContent=formula;$('#lesson-equation-label').textContent=label;$('#lesson-formula-note').textContent=note;renderZoneLegend();markVoiceTarget();
  }
  function markVoiceTarget(){
    for(const node of shell.querySelectorAll('.is-cue-speaking'))node.classList.remove('is-cue-speaking');
    if(!voiceCueTarget?.reference)return;
    const target=voiceCueTarget,selectors=target.reference==='formula'?['.planet-equation','#lesson-current-voice-text']:target.field==='date'?['#lesson-date']:target.field==='time'?['#lesson-utc']:['.planet-reference'];
    for(const selector of selectors)$(selector)?.classList.add('is-cue-speaking');
  }
  function showVoiceCue(){
    const currentCue=cue();if(!currentCue)return;
    $('#lesson-current-voice').hidden=false;$('#lesson-current-voice-title').textContent=`${audio.paused?'当前讲解':'正在讲解'} · 第 ${audioCue+1} / ${stage().voiceCues.length} 句`;$('#lesson-current-voice-text').textContent=currentCue.caption||currentCue.narration;$('#lesson-cue-prev').disabled=audioCue<=0;$('#lesson-cue-next').disabled=audioCue>=stage().voiceCues.length-1;
  }
  function applyVoiceCue(){
    const currentCue=cue();if(!currentCue)return;voiceCueTarget=lessonCueTarget(stage(),currentCue,{follow:$('#lesson-follow').checked});showVoiceCue();markVoiceTarget();
    if(!$('#lesson-follow').checked)return;
    if(stage().dayCycle){seekDay(currentCue.fromMinutes);return;}
    if(currentCue.instant){instant=new Date(currentCue.instant);transitionPhase=currentCue.phase||'after';modifiedTime=false;timeKind='example';focusedCityId=stage().transition?.cityId||activeCities()[0]?.id;updateClockLabels();globe?.focusCity(byId(focusedCityId));}
    else if(voiceCueTarget){if(voiceCueTarget.cityId)focusedCityId=voiceCueTarget.cityId;updateClockLabels();if(voiceCueTarget.cityId)globe?.focusCity(byId(voiceCueTarget.cityId));}
  }
  function jumpVoiceCue(index){if(!Number.isInteger(index)||index<0||index>=(stage().voiceCues?.length||0))return;const resume=!audio.paused;clearAudio();audioCue=index;modifiedTime=false;timeKind='example';instant=new Date(stage().instant);applyVoiceCue();if(resume)void play();else emitVoiceState();}
  function stopDay(){dayPlaying=false;cancelAnimationFrame(dayFrame);dayFrame=0;dayLastFrame=0;if(stage()?.dayCycle)$('#lesson-day-play').textContent=dayElapsed>=1440?'↺ 再看一天':'▶ 播放地球的一天';$('#lesson-day-play').setAttribute('aria-pressed','false');}
  function seekDay(minutes,{labels=true}={}){dayElapsed=Math.max(0,Math.min(1440,minutes));instant=dayCycleInstant(stage().instant,dayElapsed);globe?.setDayView?.(true);$('#lesson-sun-direction').hidden=false;if(labels)updateClockLabels();else globe?.setInstant(instant);}
  function tickDay(now){if(!dayPlaying)return;if(dayLastFrame){dayElapsed=Math.min(1440,dayElapsed+(now-dayLastFrame)*1440/48000);}dayLastFrame=now;const labels=now-dayDrawTime>=100||dayElapsed>=1440;if(labels)dayDrawTime=now;seekDay(dayElapsed,{labels});if(dayElapsed>=1440){stopDay();return;}dayFrame=requestAnimationFrame(tickDay);}
  function voiceDayMinute(){const c=cue(),from=c?.fromMinutes||0,to=c?.toMinutes??1440;return from+(to-from)*Math.max(0,Math.min(1,audio.currentTime/audio.duration));}
  function syncVoiceDay(now){if(audio.paused||!audioDriven||!stage().dayCycle||!$('#lesson-follow').checked)return;if(Number.isFinite(audio.duration)&&audio.duration>0){const labels=now-dayDrawTime>=100;if(labels)dayDrawTime=now;seekDay(voiceDayMinute(),{labels});}voiceFrame=requestAnimationFrame(syncVoiceDay);}
  async function toggleDay(){const wasPlaying=dayPlaying;suspendVoice();modifiedTime=true;if(wasPlaying){emitNavigation();return;}const token=loadToken;await ensureGlobe();if(token!==loadToken||!stage().dayCycle||activeMode!=='classroom'||!tour.classList.contains('active'))return;if(dayElapsed>=1440)dayElapsed=0;globe?.setAutoRotate(false);seekDay(dayElapsed);dayPlaying=true;$('#lesson-day-play').textContent='Ⅱ 暂停这一天';$('#lesson-day-play').setAttribute('aria-pressed','true');dayLastFrame=0;dayFrame=requestAnimationFrame(tickDay);emitNavigation();}
  function suspendVoice(){loadToken++;audioDriven=false;audio.pause();cancelAnimationFrame(voiceFrame);stopDay();playingRequest=false;voiceCueTarget=null;markVoiceTarget();if(instant)updateClockLabels();$('#lesson-current-voice').hidden=true;$('#lesson-listen').disabled=false;$('#lesson-listen').textContent=audio.src?'▶ 继续讲解':'▶ 听讲解';emitVoiceState();}
  function clearAudio(){suspendVoice();routineAtlas.pause();audio.removeAttribute('src');audio.hidden=true;audio.load();audioKey='';$('#lesson-current-voice').hidden=true;$('#lesson-listen').textContent='▶ 听讲解';$('#lesson-voice-status').textContent=`${voiceProviderLabel()} · 每步独立讲解，与场景同步`;emitVoiceState();}
  async function selectStage(n,{resume=!audio.paused}={}){clearAudio();audioCue=0;const token=loadToken,scene=sceneToken+1;await setStage(n);if(resume&&token===loadToken&&scene===sceneToken)void play();}
  async function setLayer(layer){
    sceneLayer=layer;renderZoneLegend();shell.querySelectorAll('[data-lesson-layer]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lessonLayer===layer)));
    const status=$('#planet-layer-status');
    if(layer!=='none'&&globe&&!globe.setZoneLayer){status.textContent='当前为兼容视图；三维时区图层需要支持 WebGL 的浏览器。';return;}
    status.textContent=layer==='legal'?'正在铺开实际时区…':layer==='ideal'?'15° / 小时 · 理想分带示意':'地表与昼夜';
    try{if(globe?.setZoneLayer)await globe.setZoneLayer(layer);if(layer!==sceneLayer)return;status.textContent=layer==='legal'?'实际时区地域 · 同色表示本刻偏移相同':layer==='ideal'?'15° / 小时 · 示意，不是法定边界':'NASA 地表 · 昼夜教学演示';}
    catch{if(layer===sceneLayer)status.textContent='时区图层加载失败，请重新点选。';}
  }
  async function setStage(n,{focus=true,restoreRequest}={}){
    if(restoreRequest){if(!restoreRequest.isCurrent())return;}else cancelNavigationRestore();
    stopDay();audioDriven=false;globe?.setDayView?.(false);globe?.setAutoRotate(false);
    step=Math.max(0,Math.min(lesson().stages.length-1,n));modifiedTime=false;timeKind='example';dayElapsed=0;instant=new Date(stage().instant);focusedCityId=stage().cities?.[0]||null;transitionPhase='after';const token=++sceneToken;
    const presentation=lessonPresentation(lesson(),stage());shell.dataset.presentation=stage().presentation||lesson().mode;
    routineAtlas.setScene({active:lesson().mode==='routines',stage:stage(),at:instant});
    $('.lesson-check').hidden=step<lesson().stages.length-1;
    $('#lesson-day-control').hidden=!presentation.dayCycle;$('#lesson-sun-direction').hidden=!presentation.dayCycle;
    $('.planet-time-control').hidden=lesson().mode==='routines'||!presentation.showUtc&&!presentation.beginner;$('.planet-layer-picker').hidden=lesson().mode==='routines'||!presentation.showLayers;
    $('#lesson-scene-caption').textContent=stage().caption||stage().instruction||'';
    $('#lesson-scene-next').textContent=step<lesson().stages.length-1?'下一步 →':current<globeLessons.length-1?'进入下一课 →':'用这个案例继续 ↗';
    $('#lesson-case').hidden=!['dst','conversion','meeting','routines'].includes(lesson().mode)||activeCities().length<2;
    $('#lesson-case').textContent=lesson().mode==='routines'?'带这些个人设置约时间 ↗':'用这个案例约时间 ↗';
    $('#planet-stagebar').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.scene)===step)));
    $('#lesson-instruction').textContent=stage().instruction||'拖动地球，看看同一刻不同地方的时间。';
    updateClockLabels();
    await ensureGlobe();if(token!==sceneToken)return;
    if(focus){const zoom=globe?.getState?.().zoom;if(Number.isFinite(zoom)&&Math.abs(zoom-1)>.005)globe?.zoomBy?.(1/zoom);}
    const s=stage();globe?.setNight(lesson().mode==='rotation'||lesson().mode==='routines'||lesson().mode==='clocks');
    globe?.setGrid(lesson().mode==='rotation');globe?.setAnnotations?.(geographicLessonAnnotations(s));
    globe?.setLabelLayout?.({reservedSelectors:['.planet-reference','.planet-layer-status','.planet-tools','.lesson-sun-direction','#lesson-current-voice']});
    updateClockLabels();if(lesson().mode==='routines')globe?.focusCity(byId(routineAtlas.selectedCityId));else if(focus&&s.focus){if(globe?.focusLocation)globe.focusLocation(s.focus);else globe?.focusCity(s.focus);}
    if(presentation.dayCycle)globe?.setDayView?.(true);
    await setLayer(lesson().mode==='routines'?'none':s.layer||(['rotation'].includes(lesson().mode)?'ideal':['boundaries','offsets'].includes(lesson().mode)?'legal':'none'));
    if(token===sceneToken)emitNavigation();
  }
  function choose(n){
    if(n<0||n>=globeLessons.length)return;cancelNavigationRestore();clearAudio();stopDay();
    current=n;step=0;audioCue=0;$('#lesson-error').textContent='';$('#lesson-listen').disabled=false;$('#lesson-listen').textContent='▶ 听讲解';renderLesson();void setStage(0);shell.scrollIntoView({block:'start',behavior:'instant'});
  }
  function ensureGlobe(){
    if(globe)return Promise.resolve(globe);if(globePromise)return globePromise;
    globePromise=createGlobe($('#lesson-globe'),{cities,onSelectCity:id=>{const c=byId(id);if(c){if(lesson().mode==='routines'&&routineAtlas.getProfile(id))routineAtlas.selectCity(id);else{focusedCityId=id;updateClockLabels();globe?.focusCity(c);}}},onSelectZone:({tzid,lat,lon})=>{
      const offset=offsetMinutesAt(tzid,instant);let local='规则待更新';try{const p=partsAt(instant,tzid);local=`${p.date} ${p.time}`;}catch{}
      globe?.setAnnotations?.([{id:'selected-zone',lat,lon,text:`${local} · ${formatZoneOffset(offset)}`,detail:tzid}]);
      $('#lesson-instruction').textContent=`已选 ${tzid} · ${formatZoneOffset(offset)}。继续点其他区域比较，或点击 ↺ 返回本场景。`;
    },onStateChange:s=>{
      $('#lesson-spin').setAttribute('aria-pressed',String(s.autoRotate));$('#lesson-zoom-out').disabled=s.zoom<=1.005;$('#lesson-zoom-in').disabled=s.zoom>=1.745;
      if(s.dayView===false){if(dayPlaying)stopDay();if(audioDriven&&stage().dayCycle)suspendVoice();$('#lesson-sun-direction').hidden=true;}else if(s.dayView)$('#lesson-sun-direction').hidden=false;
    }}).then(g=>{globe=g;return g;}).catch(e=>{$('#lesson-error').textContent='地球暂时无法显示，请刷新页面重试。';globePromise=null;return null;});return globePromise;
  }
  async function loadVoiceInfo(){
    const results=await Promise.allSettled([voiceFetch('/api/voice/status').then(r=>r.json()),voiceFetch('./globe-lessons-audio.json',{cache:'no-store'}).then(r=>r.ok?r.json():null)]);
    if(results[0].status==='fulfilled')voiceStatus=results[0].value;
    if(results[1].status==='fulfilled'&&results[1].value)manifest=results[1].value;
    $('#lesson-voice-status').textContent=voiceStatus.configured?`${voiceProviderLabel()} · 每步独立讲解，与场景同步`:'MiniMax 连接可在巡游设置中调整';
  }
  async function play(){
    if(lesson().mode==='routines'){await routineAtlas.listen();return;}
    routineAtlas.pause();
    if(!audio.paused){audio.pause();return;}if(playingRequest)return;
    if(audio.ended&&cue()){clearAudio();audioCue=0;}
    stopDay();if(modifiedTime&&$('#lesson-follow').checked){clearAudio();audioCue=0;}
    if(audio.src&&audioKey===voiceKey()){try{await audio.play();}catch{$('#lesson-error').textContent='请点击音频播放器的播放按钮。';}return;}
    const token=++loadToken,l=lesson(),s=stage(),targetKey=key(),targetVoiceKey=voiceKey(),voiceCue=cue(),cueIndex=audioCue;playingRequest=true;$('#lesson-listen').disabled=true;$('#lesson-listen').textContent='准备讲解…';$('#lesson-error').textContent='';emitVoiceState();
    try{
      await loadVoiceInfo();if(token!==loadToken)return;let entry=voiceCue?manifest.stages?.[targetKey]?.cues?.[cueIndex]:manifest.stages?.[targetKey];
      if(!entry||entry.textHash!==hashes.get(targetVoiceKey)||entry.model!==voiceStatus.model||entry.voiceId!==voiceStatus.voiceId){
        if(!voiceStatus.configured)throw new Error('请在「国家与城市巡游 → 音色与设置」连接 MiniMax。');
        const response=await voiceFetch('/api/voice/synthesize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chapterId:`${l.id}-${s.id}${voiceCue?'-'+voiceCue.id:''}`,text:voiceCue?.narration||s.narration,model:voiceStatus.model,voiceId:voiceStatus.voiceId})});
        entry=await response.json();if(!response.ok)throw new Error(entry.error?.message||'讲解暂时生成失败，请重试。');
        manifest.stages??={};if(voiceCue){manifest.stages[targetKey]??={};manifest.stages[targetKey].cues??=[];manifest.stages[targetKey].cues[cueIndex]={...entry,textHash:hashes.get(targetVoiceKey)};}else manifest.stages[targetKey]={...entry,textHash:hashes.get(targetVoiceKey)};
      }
      if(token!==loadToken)return;document.querySelector('#tour-audio')?.pause();audioKey=targetVoiceKey;audio.src=entry.audioUrl;audio.hidden=false;
      if($('#lesson-follow').checked){if(!voiceCue||cueIndex===0)await setStage(step);if(token!==loadToken)return;}
      if(voiceCue){applyVoiceCue();$('#lesson-voice-status').textContent=`${voiceProviderLabel()} · ${s.dayCycle?'一天演示':s.transition?'跳时演示':'逐句指向'} · 第 ${cueIndex+1} / ${s.voiceCues.length} 句`;}
      await audio.play();
    }catch(e){if(token===loadToken)$('#lesson-error').textContent=e.message;}finally{if(token===loadToken){playingRequest=false;$('#lesson-listen').disabled=false;$('#lesson-listen').textContent=audio.paused?'▶ 听讲解':'Ⅱ 暂停讲解';emitVoiceState();}}
  }
  audio.addEventListener('play',()=>{routineAtlas.pause();if(modifiedTime&&$('#lesson-follow').checked){audio.pause();void play();return;}document.querySelector('#tour-audio')?.pause();stopDay();audioDriven=true;if(cue()?.target)applyVoiceCue();else showVoiceCue();$('#lesson-listen').textContent='Ⅱ 暂停讲解';cancelAnimationFrame(voiceFrame);if(stage().dayCycle&&$('#lesson-follow').checked){globe?.setDayView?.(true);voiceFrame=requestAnimationFrame(syncVoiceDay);}emitVoiceState();});
  audio.addEventListener('pause',()=>{cancelAnimationFrame(voiceFrame);if(!$('#lesson-current-voice').hidden)$('#lesson-current-voice-title').textContent=`已暂停 · 第 ${audioCue+1} / ${stage().voiceCues?.length||1} 句`;$('#lesson-listen').textContent=audio.src?'▶ 继续讲解':'▶ 听讲解';emitVoiceState();});
  audio.addEventListener('seeked',()=>{if(audioKey!==voiceKey()||!audioDriven||!$('#lesson-follow').checked)return;if(stage().dayCycle&&audio.duration>0)seekDay(voiceDayMinute());else if(cue())applyVoiceCue();});
  audio.addEventListener('error',()=>{$('#lesson-error').textContent='音频读取失败，请重新点播放。';audio.removeAttribute('src');emitVoiceState();});
  audio.addEventListener('ended',()=>{
    if(audioKey!==voiceKey())return;
    $('#lesson-listen').textContent='↺ 再听一步';if(!$('#lesson-current-voice').hidden)$('#lesson-current-voice-title').textContent=`已讲完 · 第 ${audioCue+1} / ${stage().voiceCues?.length||1} 句`;
    if(cue()&&audioCue<stage().voiceCues.length-1){if($('#lesson-follow').checked&&stage().dayCycle)seekDay(cue().toMinutes);clearAudio();audioCue++;void play();return;}
    const detail={lessonId:lesson().id,step},last=step===lesson().stages.length-1;
    if(stage().dayCycle&&$('#lesson-follow').checked){seekDay(1440);audioDriven=false;}
    emitVoiceState();
    if(!guidedPlayback){
      if(step<lesson().stages.length-1&&$('#lesson-follow').checked){if(stage().dayCycle)toast('一天走完了。拖动进度再看一遍，或点下一步继续。');else void selectStage(step+1,{resume:true});}
      else if($('#lesson-continuous').checked&&current<globeLessons.length-1){choose(current+1);void play();}
      else toast('这一段听完了，可以亲手拨动时间，再进入下一步。');
    }
    window.dispatchEvent(new CustomEvent('timeatlas:lesson-voice-ended',{detail}));window.dispatchEvent(new CustomEvent('timeatlas:lesson-stage-complete',{detail}));
    if(last)window.dispatchEvent(new CustomEvent('timeatlas:lesson-voice-complete',{detail:{lessonId:detail.lessonId}}));
  });
  document.querySelector('#tour-audio')?.addEventListener('play',()=>audio.pause());
  function useCase(){suspendVoice();routineAtlas.pause();const cs=activeCities();if(openPlannerCase)openPlannerCase({cityIds:cs.map(c=>c.id),instant:instant.toISOString(),durationMinutes:30,sourceTitle:`${lesson().title} · ${stage().label}`,schedules:lesson().mode==='routines'?Object.fromEntries(cs.map(c=>[c.id,routineAtlas.getPerson(c.id)])):undefined});else navigate('planner');}
  $('#lesson-listen').onclick=()=>void play();$('#lesson-prev').onclick=()=>choose(current-1);$('#lesson-next').onclick=()=>current<globeLessons.length-1?choose(current+1):useCase();
  $('#lesson-cue-prev').onclick=()=>jumpVoiceCue(audioCue-1);$('#lesson-cue-next').onclick=()=>jumpVoiceCue(audioCue+1);
  $('#lesson-follow').onchange=()=>{cancelAnimationFrame(voiceFrame);if(!$('#lesson-follow').checked){voiceCueTarget=null;updateClockLabels();}else if(!audio.paused){audioDriven=true;if(stage().dayCycle){globe?.setDayView?.(true);voiceFrame=requestAnimationFrame(syncVoiceDay);}else if(cue())applyVoiceCue();}};
  window.addEventListener('timeatlas:routine-voice-state',e=>{if(lesson().mode!=='routines'||activeMode!=='classroom')return;const state=e.detail||{};$('#lesson-listen').disabled=Boolean(state.busy);$('#lesson-listen').textContent=state.busy?'准备讲解…':state.playing?'Ⅱ 暂停讲解':state.hasAudio?'▶ 继续讲解':'▶ 听讲解';});
  $('#lesson-scene-next').onclick=()=>step<lesson().stages.length-1?void selectStage(step+1):current<globeLessons.length-1?choose(current+1):useCase();$('#lesson-case').onclick=useCase;
  $('#lesson-day-play').onclick=()=>void toggleDay();$('#lesson-day-reset').onclick=()=>{suspendVoice();modifiedTime=true;seekDay(0);emitNavigation();};$('#lesson-day-progress').oninput=e=>{suspendVoice();modifiedTime=true;seekDay(Number(e.target.value));emitNavigation();};
  $('#lesson-transition').querySelectorAll('[data-transition-phase]').forEach(b=>b.onclick=()=>{
    clearAudio();transitionPhase=b.dataset.transitionPhase;const view=transitionScene(stage(),transitionPhase);if(!view)return;
    audioCue=Math.max(0,stage().voiceCues.findIndex(c=>c.phase===transitionPhase));instant=new Date(view.instant);modifiedTime=false;timeKind='example';focusedCityId=stage().transition.cityId;updateClockLabels();globe?.focusCity(byId(focusedCityId));emitNavigation();
  });
  $('#lesson-help').onclick=()=>{$('#lesson-help-text').hidden=!$('#lesson-help-text').hidden;};
  $('#lesson-reset').onclick=()=>{suspendVoice();globe?.zoomBy(1/1.75);void setStage(step);};
  $('#lesson-spin').onclick=()=>{suspendVoice();globe?.setDayView?.(false);globe?.setAutoRotate(!globe.getState().autoRotate);};$('#lesson-zoom-in').onclick=()=>globe?.zoomBy(1.16);$('#lesson-zoom-out').onclick=()=>globe?.zoomBy(1/1.16);
  shell.querySelectorAll('[data-lesson-layer]').forEach(b=>b.onclick=()=>void setLayer(b.dataset.lessonLayer));
  $('#lesson-time').oninput=e=>{suspendVoice();modifiedTime=true;const n=Number(e.target.value);if(lesson().mode==='clocks'){const c=activeCities()[0],date=partsAt(stage().instant,c.zone).date,time=`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;instant=zonedToInstants(date,time,c.zone)[0];}else{instant=new Date(stage().instant);instant.setUTCHours(0,n,0,0);}globe?.setAnnotations?.([]);updateClockLabels();emitNavigation();};
  for(const name of ['timeatlas:citytour','timeatlas:chaptertour'])window.addEventListener(name,()=>setMode('library'));
  window.addEventListener('timeatlas:library-request',()=>setMode('library'));
  window.addEventListener('timeatlas:voice-settings-changed',clearAudio);
  window.addEventListener('timeatlas:view',e=>{if(e.detail.view!=='tour'){cancelNavigationRestore();suspendVoice();routineAtlas.pause();}else if(activeMode==='classroom')void ensureGlobe();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){suspendVoice();routineAtlas.pause();}});
  for(const event of ['pointerdown','wheel','keydown','click','input','change','submit'])shell.addEventListener(event,cancelNavigationRestore,{capture:true});
  async function restoreNavigationState(saved){
    const restored=normalizeLessonNavigation(saved);if(!restored)return false;
    const request=navigationRestore.begin();
    try{
      clearAudio();current=restored.lessonIndex;step=restored.step;audioCue=0;renderLesson();setMode(restored.mode,{restoreRequest:request});
      await setStage(restored.step,{restoreRequest:request});if(!request.isCurrent())return false;
      instant=new Date(restored.instant);timeKind=restored.timeKind;modifiedTime=instant.getTime()!==new Date(stage().instant).getTime();
      if(stage().transition){transitionPhase=restored.transitionPhase||(instant.getTime()===Date.parse(stage().transition.beforeInstant)?'before':'after');const view=transitionScene(stage(),transitionPhase);if(instant.getTime()===Date.parse(view.instant))modifiedTime=false;}
      if(stage().dayCycle)seekDay((instant-new Date(stage().instant))/60000);else updateClockLabels();
      if(lesson().mode==='routines'&&restored.routineCityId)routineAtlas.selectCity(restored.routineCityId);
      return true;
    }finally{request.finish();}
  }
  renderLesson();void setStage(0);void loadVoiceInfo();tour.setAttribute('aria-labelledby','classroom-title');
  return {setMode,getNavigationState,restoreNavigationState,play,pause(){suspendVoice();routineAtlas.pause();},setGuidedPlayback(enabled){guidedPlayback=Boolean(enabled);},
    openClassroom({reset=false}={}){setMode('classroom',{notify:false});if(reset)choose(0);else emitNavigation();},
    openRoutines({navigate:shouldNavigate=true}={}){if(shouldNavigate)navigate('tour');setMode('classroom',{notify:false});if(lesson().mode==='routines'){updateClockLabels();emitNavigation();}else choose(6);}
  };
}

