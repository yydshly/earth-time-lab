import { partsAt, offsetMinutes, formatOffset, zonedToInstants, addDays, timeLabel, findOverlap } from './time-engine.mjs';
import { lessons, quiz, sources, routineNotes } from './learning-data.mjs';
import { createGlobe } from './globe.mjs';
import { initTour } from './tour.mjs';
import { initCommonTime } from './common-time.mjs';
import { initGlobeLessons } from './globe-lessons.mjs';
import { createPlannerHandoff } from './planner-handoff.mjs';
import { initHumanTime } from './human-time.mjs';
import { initResetTime } from './reset-time.mjs';
import { initLiveTime } from './live-time.mjs';
import {createTimeContext} from './time-context.mjs';
import {globeLessons} from './globe-lessons-data.mjs';
import {routeFromHash,routeToHash,normalizeRoute,readNavigationState,writeNavigationState,mergeNavigationSnapshot} from './navigation-state.mjs';
import {writePlannerSettings} from './planner-settings-store.mjs';
import {initAppVersionNotice} from './app-version.mjs';
import {lessonNavigationForRoute} from './lesson-navigation.mjs';
import {initWalkthrough} from './walkthrough.mjs';
import {theoryApplications,theoryTopicForRoute,theorySourceLabel} from './theory-links.mjs';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const cities = [
  ['beijing','北京','Beijing','中国','Asia/Shanghai',39.9,116.4,'CN'],
  ['london','伦敦','London','英国','Europe/London',51.5,-.12,'GB'],
  ['newyork','纽约','New York','美国','America/New_York',40.71,-74,'US'],
  ['tokyo','东京','Tokyo','日本','Asia/Tokyo',35.68,139.69,'JP'],
  ['paris','巴黎','Paris','法国','Europe/Paris',48.86,2.35,'FR'],
  ['berlin','柏林','Berlin','德国','Europe/Berlin',52.52,13.4,'DE'],
  ['madrid','马德里','Madrid','西班牙','Europe/Madrid',40.42,-3.7,'ES'],
  ['la','洛杉矶','Los Angeles','美国','America/Los_Angeles',34.05,-118.24,'US'],
  ['chicago','芝加哥','Chicago','美国','America/Chicago',41.88,-87.63,'US'],
  ['denver','丹佛','Denver','美国','America/Denver',39.74,-104.99,'US'],
  ['toronto','多伦多','Toronto','加拿大','America/Toronto',43.65,-79.38,'CA'],
  ['stjohns','圣约翰斯','St. John’s','加拿大','America/St_Johns',47.56,-52.71,'CA'],
  ['saopaulo','圣保罗','São Paulo','巴西','America/Sao_Paulo',-23.55,-46.63,'BR'],
  ['singapore','新加坡','Singapore','新加坡','Asia/Singapore',1.35,103.82,'SG'],
  ['seoul','首尔','Seoul','韩国','Asia/Seoul',37.57,126.98,'KR'],
  ['delhi','新德里','New Delhi','印度','Asia/Kolkata',28.61,77.21,'IN'],
  ['kathmandu','加德满都','Kathmandu','尼泊尔','Asia/Kathmandu',27.72,85.32,'NP'],
  ['dubai','迪拜','Dubai','阿联酋','Asia/Dubai',25.2,55.27,'AE'],
  ['bangkok','曼谷','Bangkok','泰国','Asia/Bangkok',13.76,100.5,'TH'],
  ['johannesburg','约翰内斯堡','Johannesburg','南非','Africa/Johannesburg',-26.2,28.04,'ZA'],
  ['nairobi','内罗毕','Nairobi','肯尼亚','Africa/Nairobi',-1.29,36.82,'KE'],
  ['sydney','悉尼','Sydney','澳大利亚','Australia/Sydney',-33.87,151.21,'AU'],
  ['adelaide','阿德莱德','Adelaide','澳大利亚','Australia/Adelaide',-34.93,138.6,'AU'],
  ['auckland','奥克兰','Auckland','新西兰','Pacific/Auckland',-36.85,174.76,'NZ'],
  ['honolulu','檀香山','Honolulu','美国','Pacific/Honolulu',21.31,-157.86,'US'],
  ['kiritimati','圣诞岛','Kiritimati','基里巴斯','Pacific/Kiritimati',1.87,-157.43,'KI'],
].map(([id,name,en,country,zone,lat,lon,code]) => ({id,name,en,country,zone,lat,lon,code}));
const byId = id => cities.find(c => c.id === id);
const initial = {selected:['beijing','london','newyork','tokyo'],base:'beijing',schedules:{}};
let saved;
try { saved = JSON.parse(localStorage.getItem('time-atlas-v1') || 'null'); } catch {}
const selected = Array.isArray(saved?.selected) ? [...new Set(saved.selected.filter(id => byId(id)))].slice(0,6) : initial.selected;
const state = {selected:selected.length ? selected : initial.selected,base:byId(saved?.base) ? saved.base : initial.base,schedules:{},instant:new Date(),view:'explore',lesson:Math.max(0,lessons.findIndex(row=>row.id===routeFromHash(location.hash).topic)),quizIndex:0,answers:[],meeting:null};
for (const city of cities) {
  const stored = saved?.schedules?.[city.id];
  const validTime = s => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
  state.schedules[city.id] = stored && validTime(stored.start) && validTime(stored.end) && Array.isArray(stored.weekdays)
    ? {start:stored.start,end:stored.end,weekdays:stored.weekdays.filter(d => Number.isInteger(d) && d>=1 && d<=7)}
    : {start:'09:00',end:'18:00',weekdays:[1,2,3,4,5]};
  if(stored&&validTime(stored.sleepStart)&&validTime(stored.sleepEnd)&&stored.sleepStart!==stored.sleepEnd){
    state.schedules[city.id].sleepStart=stored.sleepStart;state.schedules[city.id].sleepEnd=stored.sleepEnd;
  }
}
let globe, classroom, humanTime, resetTime, liveTime, commonTime, manualTimeContext, toastTimer, syncFrame, foldChoices = [], meetingFoldChoices = [], plannerCase = null;
let navigationReady=false,restoringNavigation=false,routeTransition=0,currentRoute=routeFromHash(location.hash),lastRouteHash='',navigationTimer;
let navigationStorage;try{navigationStorage=sessionStorage;}catch{}
let storedNavigation=readNavigationState(navigationStorage);
const coursePositions={course:storedNavigation?.course,routineCourse:storedNavigation?.routineCourse};
const hydratedNavigation=new Set();
let theoryReturnRoute=null,theoryReturnState=null;
const weekdays = ['','周一','周二','周三','周四','周五','周六','周日'];
const baseCity = () => byId(state.base);
const selectedCities = () => state.selected.map(byId);
let plannerStorageFailed=false;
function persist({includeCase=false,explicit=false}={}) {
  if(plannerCase&&!includeCase)return false;
  const ok=writePlannerSettings(()=>localStorage,state);
  let notice=$('#planner-storage-status');
  if(ok){notice?.remove();plannerStorageFailed=false;return true;}
  if(!notice){notice=document.createElement('p');notice.id='planner-storage-status';notice.className='field-error';notice.setAttribute('role','status');$('.topbar').after(notice);}
  notice.textContent='城市与作息未能保存到本机，仅本次可用；刷新或关闭页面后可能丢失本次更改。原有已保存设置未被替换。';
  if(explicit||!plannerStorageFailed)toast('未能保存到本机，当前更改仅本次可用。');
  plannerStorageFailed=true;return false;
}
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>$('#toast').classList.remove('show'),3200); }
const paths = {globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',book:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2"/>',message:'<path d="M21 11a9 9 0 0 1-9 9H3l1.5-4.5A9 9 0 1 1 21 11Z"/><path d="M8 10h8m-8 4h5"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',sliders:'<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'};
paths.headphones='<path d="M4 13v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/><path d="M17 19c0 2-2 3-5 3"/>';
function icons(root=document) { root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[el.dataset.icon] || paths.globe}</svg>`); }
function asleepAt(instant,id) {
  const s=state.schedules[id];if(!s.sleepStart||!s.sleepEnd)return false;
  const p=partsAt(instant,byId(id).zone),m=p.hour*60+p.minute;
  const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
  const start=minute(s.sleepStart),end=minute(s.sleepEnd);
  return start<end?m>=start&&m<end:start>end&&(m>=start||m<end);
}
function availableAt(instant,id) {
  if(asleepAt(instant,id))return false;
  const s=state.schedules[id], p=partsAt(instant,byId(id).zone), m=p.hour*60+p.minute;
  const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
  const start=minute(s.start),end=minute(s.end);
  if(start<=end) return m>=start && m<end && s.weekdays.includes(p.weekday);
  return (m>=start && s.weekdays.includes(p.weekday)) || (m<end && s.weekdays.includes(p.weekday===1?7:p.weekday-1));
}
function statusAt(instant,id) { const p=partsAt(instant,byId(id).zone),hasSleep=Boolean(state.schedules[id].sleepStart);return availableAt(instant,id)?{type:'work',text:'可用时段',symbol:'◦'}:(hasSleep?asleepAt(instant,id):p.hour>=23||p.hour<7)?{type:'sleep',text:hasSleep?'睡眠避让':'睡眠示例',symbol:'☾'}:{type:'free',text:'个人时间',symbol:'☀'}; }
function dayDifference(a,b) { return Math.round((Date.parse(`${a}T00:00Z`)-Date.parse(`${b}T00:00Z`))/86400000); }
function readableDate(p) { return `${p.month} 月 ${p.day} 日 ${weekdays[p.weekday]}`; }
function differenceText(minutes) { if(!minutes) return '没有时差'; const abs=Math.abs(minutes);return `${minutes>0?'快':'慢'} ${Math.floor(abs/60)?`${Math.floor(abs/60)} 小时`:''}${abs%60?` ${abs%60} 分钟`:''}`; }
function renderCities() {
  const bp=partsAt(state.instant,baseCity().zone), bo=offsetMinutes(state.instant,baseCity().zone);
  $('#world-date-label').textContent=`以${baseCity().name}为参照 · ${bp.date}`;
  $('#city-cards').innerHTML=selectedCities().map(c=>{
    const p=partsAt(state.instant,c.zone),off=offsetMinutes(state.instant,c.zone),s=statusAt(state.instant,c.id),diff=dayDifference(p.date,bp.date);
    return `<article class="city-card"><div><button class="city-focus" data-focus="${c.id}" aria-label="在地球上查看${c.name}"><span class="city-name">${c.name}${c.id===state.base?'<span class="home-tag">参照</span>':''}</span><div class="city-en">${c.en.toUpperCase()} · ${formatOffset(off)}</div></button></div><div><div class="city-clock">${p.time}</div><div class="city-day">${p.month}/${p.day} ${weekdays[p.weekday]}${diff?` · ${diff>0?'后':'前'}${Math.abs(diff)}天`:''}</div></div><div class="city-bottom"><span class="status-pill ${s.type}">${s.symbol} ${s.text}</span><span>${c.id===state.base?'你的参照时钟':`比${baseCity().name}${differenceText(off-bo)}`}</span></div>${state.selected.length>1?`<button class="city-remove" data-remove="${c.id}" aria-label="移除${c.name}">×</button>`:''}</article>`;
  }).join('');
  $('#city-cards').querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>globe?.focusCity(byId(b.dataset.focus)));
  $('#city-cards').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>removeCity(b.dataset.remove));
  $('#city-cards').querySelectorAll('.city-card').forEach((el,i)=>{const b=document.createElement('button');b.className='city-listen';b.textContent='♫ 听听这座城市';b.setAttribute('aria-label',`收听${selectedCities()[i].name}讲解`);b.onclick=()=>window.dispatchEvent(new CustomEvent('timeatlas:citytour',{detail:{cityId:selectedCities()[i].id}}));el.appendChild(b);});
  const other=selectedCities().find(c=>c.id!==state.base);
  $('#explore-insight').innerHTML=other?`此刻${baseCity().name}是 <strong>${bp.time}</strong>，${other.name}是 <strong>${partsAt(state.instant,other.zone).time}</strong>。钟面不同，但我们正在经历<strong>同一个瞬间</strong>。`:'添加一座远方的城市，看看同一个瞬间的不同钟面。';
}
function syncTime() {
  const p=partsAt(state.instant,baseCity().zone);
  manualTimeContext?.update({kind:'manual',instant:state.instant,zone:baseCity().zone,label:baseCity().name,detail:'这是你指定的瞬间，钟表不会跟随真实现在自动走动。'});
  $('#explore-date').value=p.date;$('#explore-time').value=p.time;$('#time-slider').value=p.hour*60+p.minute;
  $('#base-offset').textContent=formatOffset(offsetMinutes(state.instant,baseCity().zone));
  $('#earth-utc').textContent=`${state.instant.toISOString().slice(0,10)} · ${state.instant.toISOString().slice(11,16)} UTC`;
  renderCities();globe?.setInstant(state.instant);
  if(state.view==='routines')renderRoutines();
}
function setInstant(date) { state.instant=new Date(date);syncTime(); }
function clearExploreError() { $('#explore-error').textContent='';$('#explore-fold').hidden=true;foldChoices=[]; }
function applyWallTime() {
  clearExploreError();
  try {
    const date=$('#explore-date').value,time=$('#explore-time').value;
    if(!date||!time)throw new Error('请填写完整日期和时间。');
    const matches=zonedToInstants(date,time,baseCity().zone);
    if(!matches.length)throw new Error('这个当地时间因时钟调整而不存在。地球仍显示上一个有效时刻，请重新选择。');
    if(matches.length>1) {
      foldChoices=matches;$('#explore-error').textContent='这个时间因时钟回拨出现两次，请选择偏移；地球仍显示上一个有效时刻。';
      $('#explore-fold').innerHTML='<option value="">选择第一次或第二次…</option>'+matches.map((d,i)=>`<option value="${i}">第 ${i+1} 次 · ${formatOffset(offsetMinutes(d,baseCity().zone))} · ${d.toISOString().slice(11,16)} UTC</option>`).join('');
      $('#explore-fold').hidden=false;return;
    }
    setInstant(matches[0]);
  } catch(e) {$('#explore-error').textContent=e.message;}
}
function showView(logicalView){
  const view=logicalView==='routines'?'tour':logicalView;
  if(plannerCase&&view!=='planner')restorePlannerSettings();
  state.view=view;$$('.view').forEach(el=>el.classList.toggle('active',el.id===view));
  $$('.nav-item').forEach(el=>{const active=el.dataset.view===logicalView;el.classList.toggle('active',active);el.setAttribute('aria-current',active?'page':'false');});
  if(view==='planner')renderPeople();
  window.dispatchEvent(new CustomEvent('timeatlas:view',{detail:{view,route:logicalView}}));
  window.scrollTo({top:0,behavior:'instant'});
}
function routeFromUI(){
  if(state.view==='explore'){
    if(humanTime?.active)return {view:'explore',mode:'human',step:humanTime.getNavigationState().step};
    if(resetTime?.active)return {view:'explore',mode:'reset',type:resetTime.getNavigationState().type};
    if(liveTime?.active)return {view:'explore',mode:'live',region:liveTime.getNavigationState().region};
    return {view:'explore',mode:'manual'};
  }
  if(state.view==='tour'&&classroom){const c=classroom.getNavigationState();return {view:currentRoute.view==='routines'&&c.mode==='classroom'&&globeLessons.find(l=>l.id===c.lessonId)?.mode==='routines'?'routines':'tour',mode:c.mode,lesson:c.lessonId,step:c.step};}
  if(state.view==='learn')return {view:'learn',topic:lessons[state.lesson].id};
  return {view:state.view};
}
function navigationSnapshot(){
  if(state.view==='tour'&&classroom)coursePositions[currentRoute.view==='routines'?'routineCourse':'course']=classroom.getNavigationState();
  const duration=Number($('#meeting-duration').value),selectedSchedules=Object.fromEntries(state.selected.map(id=>[id,{...state.schedules[id],weekdays:[...state.schedules[id].weekdays]}]));
  return mergeNavigationSnapshot(storedNavigation,{version:1,route:currentRoute,live:liveTime?.getNavigationState(),human:humanTime?.getNavigationState(),reset:resetTime?.getNavigationState(),...coursePositions,theory:{topic:lessons[state.lesson].id,returnRoute:theoryReturnRoute,returnNavigation:theoryReturnState},common:commonTime?.getNavigationState(),manual:{instant:state.instant.toISOString(),base:state.base},planner:{date:$('#meeting-date').value,time:$('#meeting-time').value,duration,meeting:state.meeting?.toISOString()||null,caseData:plannerCase?{cityIds:[...state.selected],instant:(state.meeting||state.instant).toISOString(),durationMinutes:duration,sourceTitle:plannerCase.sourceTitle,sourceView:plannerCase.sourceView,sourceNote:plannerCase.sourceNote,schedules:selectedSchedules}:null}},hydratedNavigation);
}
function commitNavigation(push=false){
  if(!navigationReady||restoringNavigation)return false;
  currentRoute=normalizeRoute(routeFromUI());renderTheoryHelp(currentRoute);const snapshot=navigationSnapshot(),hash=routeToHash(currentRoute);
  storedNavigation=snapshot;const saved=writeNavigationState(navigationStorage,snapshot);
  const value={...(history.state&&typeof history.state==='object'?history.state:{}),timeAtlas:snapshot};
  if(push&&hash!==location.hash)history.pushState(value,'',hash);else history.replaceState(value,'',hash);
  lastRouteHash=hash;
  return saved;
}
function lessonStateFor(route,saved){
  return lessonNavigationForRoute(route,saved,classroom.getNavigationState());
}
async function applyRoute(value,{restore=false,snapshot=storedNavigation,push=true}={}){
  const route=normalizeRoute(value),previousRoute=currentRoute,transition=++routeTransition;restoringNavigation=true;currentRoute=route;lastRouteHash=routeToHash(route);
  try{
    showView(route.view);
    if(route.view==='explore'){
      const loadSaved=restore||!hydratedNavigation.has(route.mode);
      if(route.mode==='human'){const old=snapshot?.human||{};humanTime.restoreNavigationState(loadSaved?{...(route.step===undefined||route.step===old.step?old:{}),...(route.step!==undefined?{step:route.step}:{})}:{step:route.step??humanTime.getNavigationState().step});}
      else if(route.mode==='reset'){const old=snapshot?.reset||{};resetTime.restoreNavigationState(loadSaved?{...(!route.type||route.type===old.type?old:{}),...(route.type?{type:route.type}:{})}:{...resetTime.getNavigationState(),...(route.type?{type:route.type}:{})});}
      else if(route.mode==='manual'){
        liveTime.close();humanTime.close();resetTime.close();$('#human-free').setAttribute('aria-pressed','true');$('#explore-title').textContent='按指定日期，手动换算世界时间';$('#explore .page-heading p').textContent='这是手动换算视图；查看实时钟表，请切回“此刻全球时间”。';
        if(loadSaved&&snapshot?.manual){if(byId(snapshot.manual.base))state.base=snapshot.manual.base;if(Number.isFinite(new Date(snapshot.manual.instant).getTime()))state.instant=new Date(snapshot.manual.instant);renderBaseSelect();syncTime();}
      }else liveTime.restoreNavigationState({...(loadSaved?snapshot?.live:{}),...(route.region?{region:route.region}:{})});
      hydratedNavigation.add(route.mode);
    }else if(route.view==='tour'||route.view==='routines'){
      await classroom.restoreNavigationState(lessonStateFor(route,snapshot));
      hydratedNavigation.add(route.view==='routines'?'routineCourse':'course');
    }else if(route.view==='phrases'){
      if((restore||!hydratedNavigation.has('common'))&&snapshot?.common)commonTime.setContext(snapshot.common);
      hydratedNavigation.add('common');
    }else if(route.view==='learn'){
      const old=snapshot?.theory||{},topic=route.topic||((restore||!hydratedNavigation.has('theory'))?old.topic:lessons[state.lesson].id);
      const index=lessons.findIndex(row=>row.id===topic);state.lesson=index<0?0:index;
      const source=!restore&&previousRoute.view!=='learn'?previousRoute:restore&&snapshot?.route?.view!=='learn'?snapshot?.route:null;
      if(source?.view&&source.view!=='learn'){
        theoryReturnRoute=normalizeRoute(source);theoryReturnState=structuredClone({...snapshot,route:theoryReturnRoute});delete theoryReturnState.theory;
      }else if(restore||!hydratedNavigation.has('theory')){
        theoryReturnRoute=old.returnRoute?.view&&old.returnRoute.view!=='learn'?normalizeRoute(old.returnRoute):null;
        theoryReturnState=theoryReturnRoute&&old.returnNavigation?.route?old.returnNavigation:null;
      }
      hydratedNavigation.add('theory');renderLessons();
    }else if(route.view==='planner'){
      if((restore||!hydratedNavigation.has('planner'))&&snapshot?.planner){
        const plan=snapshot.planner;if(plan.caseData)openPlannerCase(plan.caseData);else if(plannerCase)restorePlannerSettings();
        invalidateMeeting();
        if(/^\d{4}-\d{2}-\d{2}$/.test(plan.date||''))$('#meeting-date').value=plan.date;
        if(/^\d{2}:\d{2}$/.test(plan.time||''))$('#meeting-time').value=plan.time;
        if([30,60,90,120].includes(plan.duration))$('#meeting-duration').value=String(plan.duration);
        if(plan.meeting&&Number.isFinite(new Date(plan.meeting).getTime()))selectMeeting(new Date(plan.meeting));
      }
      hydratedNavigation.add('planner');
    }
  }finally{if(transition===routeTransition){restoringNavigation=false;commitNavigation(push);}}
}
function navigate(view,options={}){
  const target=typeof view==='object'?view:{view,...options};
  if(!navigationReady){currentRoute=normalizeRoute(target);showView(currentRoute.view);history.replaceState(null,'',routeToHash(currentRoute));return;}
  // A restored planner case re-enters its own view. A user choosing another
  // page must start a new transition so a pending course cannot win later.
  if(restoringNavigation&&normalizeRoute(target).view===currentRoute.view){showView(currentRoute.view);return;}
  commitNavigation(false);void applyRoute(target,{push:options.push!==false});
}
function restoreFromURL(){
  if(!navigationReady||location.hash===lastRouteHash)return;
  void applyRoute(routeFromHash(location.hash),{restore:true,snapshot:history.state?.timeAtlas||storedNavigation,push:false});
}
function renderBaseSelect() { $('#base-city').innerHTML=cities.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');$('#base-city').value=state.base; }
function addCity(id) {
  if(state.selected.includes(id)){globe?.focusCity(byId(id));return;}
  if(state.selected.length>=6){toast('一次最多比较 6 座城市，请先移除一座。');return;}
  state.selected.push(id);changedSelection();toast(`已添加${byId(id).name}`);
}
function removeCity(id) { if(state.selected.length<2)return;state.selected=state.selected.filter(v=>v!==id);changedSelection(); }
function changedSelection() { persist();renderCities();renderPeople();renderRoutines();invalidateMeeting();renderCityOptions(); }
function renderCityOptions() {
  const query=$('#city-search').value.trim().toLowerCase();
  const filtered=cities.filter(c=>`${c.name} ${c.en} ${c.country} ${c.zone}`.toLowerCase().includes(query));
  $('#city-options').innerHTML=filtered.length?filtered.map(c=>`<button class="city-option ${state.selected.includes(c.id)?'selected':''}" data-city="${c.id}" ${state.selected.includes(c.id)||state.selected.length>=6?'disabled':''}><span>${c.name}<small>${c.country} · ${c.en}</small></span><span>${state.selected.includes(c.id)?'✓':'＋'}</span></button>`).join(''):'<p class="small-note">没有找到城市，试试国家或英文名称。</p>';
  $$('#city-options [data-city]').forEach(b=>b.onclick=()=>addCity(b.dataset.city));
}
function openCities() { $('#city-search').value='';renderCityOptions();$('#city-dialog').showModal();$('#city-search').focus(); }
function renderTheoryHelp(route){
  const topic=theoryTopicForRoute(route);let link=$('#context-theory-help');
  if(!topic){link?.remove();return;}
  let host;
  if(route.view==='tour'||route.view==='routines')host=route.mode==='library'?$('.tour-mode-switch'):$('#globe-classroom .planet-heading-tools');
  else if(route.view==='explore'&&route.mode==='live')host=$('#explore .live-workspace-tools');
  else if(route.view==='explore'&&route.mode==='human')host=$('#explore .human-heading');
  host||=$(`#${route.view==='routines'?'tour':route.view} .page-heading`);
  if(!host)return;
  if(!link){link=document.createElement('a');link.id='context-theory-help';link.className='theory-help';link.textContent='查理论 ↗';}
  link.href=routeToHash({view:'learn',topic});link.dataset.theoryTopic=topic;link.setAttribute('aria-label',`查理论：${lessons.find(row=>row.id===topic).navTitle}`);link.title=lessons.find(row=>row.id===topic).navTitle;
  if(link.parentElement!==host)host.append(link);
}
function renderLessons() {
  state.lesson=Math.max(0,Math.min(lessons.length-1,Number.isInteger(state.lesson)?state.lesson:0));
  const tabs=$('#lesson-tabs');
  if(!tabs.childElementCount)tabs.innerHTML=lessons.map((l,i)=>`<button class="lesson-tab" aria-controls="lesson-detail" data-lesson="${i}"><span>${pad(i+1)}</span>${esc(l.navTitle)}</button>`).join('');
  const l=lessons[state.lesson];
  const sectionHtml=section=>`<section class="theory-section"><h3>${esc(section.title)}</h3>${(section.paragraphs||[]).map(p=>`<p>${esc(p)}</p>`).join('')}${section.terms?`<dl class="theory-terms">${section.terms.map(t=>`<div><dt>${esc(t.term)}</dt><dd>${esc(t.meaning)}</dd></div>`).join('')}</dl>`:''}${section.steps?`<ol class="theory-steps">${section.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>`:''}${section.table?`<div class="theory-table-wrap" role="region" aria-label="${esc(section.title)}对照表" tabindex="0"><table class="theory-table"><thead><tr>${section.table.headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map(row=>`<tr>${row.map((cell,i)=>i===0?`<th scope="row">${esc(cell)}</th>`:`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}</section>`;
  $('#lesson-detail').innerHTML=`<div class="theory-chapter-label">${esc(l.kicker)}</div><h2 id="theory-title" tabindex="-1">${esc(l.title)}</h2><p class="theory-summary">${esc(l.summary)}</p>${l.sections.map(sectionHtml).join('')}<aside class="lesson-example"><strong>${esc(l.example.title)}</strong><p>${esc(l.example.text)}</p></aside><p class="lesson-tip"><strong>记住这一点</strong>${esc(l.tip)}</p><nav class="theory-pagination" aria-label="切换理论主题"><button class="text-button" id="theory-previous" ${state.lesson===0?'disabled':''}>← 上一个主题</button><span>${state.lesson+1} / ${lessons.length}</span><button class="text-button" id="theory-next" ${state.lesson===lessons.length-1?'disabled':''}>下一个主题 →</button></nav>`;
  $('#theory-connections').innerHTML='<span>应用这一主题</span>'+(theoryApplications[l.id]||[]).map(item=>`<a href="${esc(routeToHash(item.route))}">${esc(item.label)} ↗</a>`).join('');
  $('.theory-return').hidden=!theoryReturnRoute;
  $('#theory-return').textContent=theoryReturnRoute?`← 返回${theorySourceLabel(theoryReturnRoute)}`:'';
  $('#theory-return').onclick=()=>{if(!theoryReturnRoute)return;commitNavigation(false);void applyRoute(theoryReturnRoute,{restore:true,snapshot:theoryReturnState||storedNavigation,push:true});};
  const selectTopic=(index,focus=false)=>{navigate('learn',{topic:lessons[index].id});const heading=$('#theory-title');if(focus)heading.focus();else if(matchMedia('(max-width:760px)').matches||heading.getBoundingClientRect().top<0)heading.scrollIntoView({block:'start'});};
  $$('#lesson-tabs button').forEach(b=>{
    const selected=Number(b.dataset.lesson)===state.lesson;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));
    b.onclick=()=>selectTopic(Number(b.dataset.lesson));
  });
  const move=delta=>selectTopic(state.lesson+delta,true);
  $('#theory-previous').onclick=()=>move(-1);$('#theory-next').onclick=()=>move(1);
}
function renderQuiz() {
  const q=quiz[state.quizIndex],answered=state.answers[state.quizIndex];
  $('#quiz-progress').textContent=`${state.quizIndex+1} / ${quiz.length}`;
  $('#quiz-body').innerHTML=`<h3>${esc(q.question)}</h3><div class="quiz-options">${q.options.map((text,i)=>`<button data-answer="${i}" ${answered!==undefined?'disabled':''} class="${answered!==undefined&&i===q.correctIndex?'correct':answered===i?'wrong':''}">${String.fromCharCode(65+i)}. ${esc(text)}</button>`).join('')}</div>${answered!==undefined?`<div class="quiz-feedback"><strong>${answered===q.correctIndex?'答对了。':'再想一步。'}</strong> ${esc(q.explanation)}<br><button class="text-button" id="quiz-next">${state.quizIndex<quiz.length-1?'下一题 →':`完成 ${state.answers.filter((v,i)=>v===quiz[i].correctIndex).length}/${quiz.length} · 重新练习 ↻`}</button></div>`:''}`;
  $$('#quiz-body [data-answer]').forEach(b=>b.onclick=()=>{state.answers[state.quizIndex]=Number(b.dataset.answer);renderQuiz();});
  if($('#quiz-next'))$('#quiz-next').onclick=()=>{if(state.quizIndex<quiz.length-1)state.quizIndex++;else{state.quizIndex=0;state.answers=[];}renderQuiz();};
}
function renderRoutines() {
  const p=partsAt(state.instant,baseCity().zone);
  $('#routine-reference').textContent=`${p.date} · 横轴参照 ${baseCity().name} · 每格显示这一小时起点的当地时间`;
  const instants=Array.from({length:24},(_,h)=>zonedToInstants(p.date,`${pad(h)}:00`,baseCity().zone));
  $('#routine-chart').innerHTML=`<div class="routine-row"><span class="row-title">城市 / 当地时间</span>${Array.from({length:24},(_,h)=>`<span class="routine-hour">${pad(h)}</span>`).join('')}</div>`+selectedCities().map(c=>`<div class="routine-row"><div class="row-title">${c.name}<small>${formatOffset(offsetMinutes(state.instant,c.zone))}</small></div>${instants.map((matches,h)=>{if(!matches.length)return '<span class="routine-cell sleep" title="此小时因夏令时跳过">—</span>';const at=partsAt(matches[0],c.zone),s=statusAt(matches[0],c.id);return `<button class="routine-cell ${s.type} ${p.hour===h?'current':''}" data-instant="${matches[0].toISOString()}" title="${c.name} ${at.date} ${at.time} · ${s.text}${matches.length>1?'（参照时钟重复小时，显示第一次）':''}" aria-label="${c.name} ${at.date} ${at.time} ${s.text}">${at.minute?`${pad(at.hour)}:${pad(at.minute)}`:pad(at.hour)}${matches.length>1?'*':''}</button>`;}).join('')}</div>`).join('');
  $$('#routine-chart [data-instant]').forEach(b=>b.onclick=()=>{clearExploreError();setInstant(new Date(b.dataset.instant));navigate('explore');});
  $('#routine-notes').innerHTML=routineNotes.map(n=>`<article class="routine-note"><div class="eyebrow">${esc(n.region)}</div><h3>${esc(n.title)}</h3><p>${esc(n.body.replace('下方的','本页的'))}</p>${n.sourceUrl?`<a href="${esc(n.sourceUrl)}" target="_blank" rel="noreferrer">查看原始来源 ↗</a>`:''}</article>`).join('');
}
function renderPeople() {
  $('#planner-base-label').textContent=baseCity().name;$('#manual-base-label').textContent=baseCity().name;
  $('#people-settings').innerHTML=selectedCities().map(c=>{const s=state.schedules[c.id];return `<div class="person-setting"><div class="person-setting-head"><strong>${c.name}</strong><small>${c.zone}</small></div><div class="availability"><label class="sr-only" for="start-${c.id}">${c.name}可用开始时间</label><input id="start-${c.id}" type="time" data-person="${c.id}" data-field="start" value="${s.start}"><span>—</span><label class="sr-only" for="end-${c.id}">${c.name}可用结束时间</label><input id="end-${c.id}" type="time" data-person="${c.id}" data-field="end" value="${s.end}"><span>当地时间</span></div><div class="weekday-options">${[1,2,3,4,5,6,7].map(day=>`<label><input type="checkbox" data-person="${c.id}" data-day="${day}" ${s.weekdays.includes(day)?'checked':''} aria-label="${c.name}${weekdays[day]}可用"><span>${weekdays[day]}</span></label>`).join('')}</div>${s.sleepStart&&s.sleepEnd?`<p class="small-note">睡眠避让 · 按当地钟点每天生效</p><div class="availability"><label class="sr-only" for="sleep-start-${c.id}">${c.name}睡眠开始时间</label><input id="sleep-start-${c.id}" type="time" data-person="${c.id}" data-field="sleepStart" value="${s.sleepStart}"><span>—</span><label class="sr-only" for="sleep-end-${c.id}">${c.name}睡眠结束时间</label><input id="sleep-end-${c.id}" type="time" data-person="${c.id}" data-field="sleepEnd" value="${s.sleepEnd}"><span>避开联系</span></div>`:''}</div>`;}).join('');
  $$('#people-settings input').forEach(input=>input.onchange=()=>{
    const s=state.schedules[input.dataset.person];
    if(input.dataset.field){if(!input.value){input.value=s[input.dataset.field];toast('请填写完整时间，已恢复原时段。');return;}const next={...s,[input.dataset.field]:input.value};if(next.sleepStart&&next.sleepStart===next.sleepEnd){input.value=s[input.dataset.field];toast('睡眠开始与结束请设为不同钟点，已恢复原设置。');return;}s[input.dataset.field]=input.value;}
    else {const d=Number(input.dataset.day);s.weekdays=input.checked?[...new Set([...s.weekdays,d])]:s.weekdays.filter(v=>v!==d);}
    persist();invalidateMeeting();renderCities();
  });
}
function restorePlannerSettings() {
  if(!plannerCase)return;
  const previous=plannerCase.previous;
  plannerCase=null;
  state.selected=previous.selected;state.base=previous.base;state.schedules=previous.schedules;state.instant=previous.instant;
  if(!previous.storageFailed){$('#planner-storage-status')?.remove();plannerStorageFailed=false;}
  $('#meeting-date').value=previous.date;$('#meeting-time').value=previous.time;$('#meeting-duration').value=previous.duration;
  $('#planner-case-note')?.remove();
  renderBaseSelect();syncTime();renderPeople();renderCityOptions();invalidateMeeting();
  if(previous.meeting)selectMeeting(previous.meeting);
}
function openPlannerCase(caseData) {
  let context;
  try {context=createPlannerHandoff({...caseData,sourceView:caseData.sourceView||(currentRoute.view==='routines'?'routines':'tour')},cities);}catch(error){toast(error.message);return false;}
  const previous=plannerCase?.previous||{
    selected:[...state.selected],base:state.base,schedules:state.schedules,instant:new Date(state.instant),meeting:state.meeting?new Date(state.meeting):null,
    date:$('#meeting-date').value,time:$('#meeting-time').value,duration:$('#meeting-duration').value,storageFailed:plannerStorageFailed,
  };
  plannerCase={...context,previous};
  hydratedNavigation.add('planner');
  state.selected=[...context.cityIds];state.base=context.baseCityId;
  state.schedules=Object.fromEntries(Object.entries(previous.schedules).map(([id,schedule])=>[id,{...schedule,weekdays:[...schedule.weekdays]}]));
  Object.assign(state.schedules,context.schedules);
  state.instant=new Date(context.instant);
  renderBaseSelect();syncTime();navigate('planner');
  $('#meeting-date').value=context.date;$('#meeting-time').value=context.time;$('#meeting-duration').value=String(context.durationMinutes);
  invalidateMeeting();
  $('#meeting-results').innerHTML='<p class="meeting-result-note">已把地球上的同一个瞬间带到这里。先核对双方日期和钟点，再检查个人可用时间。</p>';
  selectMeeting(new Date(context.instant));
  let banner=$('#planner-case-note');
  if(!banner){banner=document.createElement('div');banner.id='planner-case-note';banner.className='lesson-example';$('#planner .planner-grid').before(banner);}
  banner.innerHTML=`<strong>继续时间案例 · ${esc(context.sourceTitle)}</strong>${context.sourceNote?`<p class="small-note">${esc(context.sourceNote)}</p>`:''}<p>${context.clocks.map(clock=>`${esc(byId(clock.cityId).name)} ${clock.date} ${clock.time}`).join(' ↔ ')} · ${context.durationMinutes} 分钟</p><p class="small-note">这是临时时间案例；离开会恢复原有个人配置。确认这些时段适合自己后，可保存为本机个人设置。</p><div class="meeting-actions"><button class="secondary-button" id="planner-back-lesson">${context.sourceView==='phrases'?'返回刚才的换算':'返回地球课堂'}</button><button class="secondary-button" id="planner-save-settings">保存当前城市与作息为我的设置</button><button class="text-button" id="planner-restore-settings">恢复我的城市与设置</button></div>`;
  $('#planner-back-lesson').onclick=()=>navigate(context.sourceView);
  $('#planner-save-settings').onclick=()=>{if(!persist({includeCase:true,explicit:true})){commitNavigation(false);return;}plannerCase=null;$('#planner-case-note')?.remove();commitNavigation(false);toast('已将当前城市、联系窗口与睡眠设置保存到本机。');};
  $('#planner-restore-settings').onclick=()=>{restorePlannerSettings();toast('已恢复进入课程案例前的城市与设置。');};
  return true;
}
function invalidateMeeting() {
  state.meeting=null;$('#meeting-summary').hidden=true;$('#meeting-error').textContent='';$('#meeting-fold').hidden=true;
  $('#meeting-results').innerHTML='<div class="empty-state"><h3>按你设定的时间，寻找共同的空档</h3><p>点击「寻找共同可用时间」，或直接输入一个当地时刻。</p></div>';
}
function peopleForSearch(waking=false) { return selectedCities().map(c=>{const s=state.schedules[c.id];return {zone:c.zone,...(waking?{start:'08:00',end:'22:00',weekdays:[1,2,3,4,5,6,7],...(s.sleepStart&&s.sleepEnd?{sleepStart:s.sleepStart,sleepEnd:s.sleepEnd}:{})}:s)};}); }
function searchMeetings(waking=false) {
  $('#meeting-error').textContent='';$('#meeting-fold').hidden=true;$('#meeting-summary').hidden=true;state.meeting=null;
  const button=$('#find-meeting');button.disabled=true;button.textContent='正在比较各地时间…';
  setTimeout(()=>{
    try {
      const slots=findOverlap({date:$('#meeting-date').value,baseZone:baseCity().zone,people:peopleForSearch(waking),durationMinutes:Number($('#meeting-duration').value)});
      if(!slots.length){$('#meeting-results').innerHTML=`<div class="empty-state"><span data-icon="clock"></span><h3>这一天没有${waking?'共同的 08:00–22:00 时段':'共同可用的时段'}</h3><p>${waking?'可以改日期、缩短会议，或使用异步留言。':'这很正常，地球两端的工作时间未必重叠。可以调整个人时段、日期或时长。'}</p>${!waking?'<button class="secondary-button" id="waking-search">试看 08:00–22:00 清醒时段示例</button>':''}</div>`;icons($('#meeting-results'));if($('#waking-search'))$('#waking-search').onclick=()=>searchMeetings(true);return;}
      $('#meeting-results').innerHTML=`<p class="meeting-result-note">${waking?'以下仅为每天 08:00–22:00 的清醒时段示例，忽略工作日设置，并不表示对方已同意。':'所有参与者的完整会议时长都落在设定的可用时段内。'}<br>共 ${slots.length} 个起点 · 下列为${baseCity().name}时间</p><div class="meeting-slots">${slots.map((slot,i)=>{const p=partsAt(slot.start,baseCity().zone);return `<button class="meeting-slot" data-slot="${i}">${p.time}<small>${formatOffset(offsetMinutes(slot.start,baseCity().zone))}</small></button>`;}).join('')}</div>`;
      $$('#meeting-results [data-slot]').forEach(b=>b.onclick=()=>{$$('#meeting-results [data-slot]').forEach(x=>x.classList.toggle('active',x===b));selectMeeting(new Date(slots[Number(b.dataset.slot)].start));});
    } catch(e){$('#meeting-error').textContent=e.message;}
    finally {button.disabled=false;button.innerHTML='寻找共同可用时间 <span>↗</span>';}
  },30);
}
function manualMeeting() {
  $('#meeting-error').textContent='';$('#meeting-fold').hidden=true;state.meeting=null;$('#meeting-summary').hidden=true;
  try {
    const matches=zonedToInstants($('#meeting-date').value,$('#meeting-time').value,baseCity().zone);
    if(!matches.length)throw new Error('这个当地时间因夏令时调整而不存在，请换一个时刻。');
    if(matches.length>1){meetingFoldChoices=matches;$('#meeting-error').textContent='这个时间出现两次，请选定明确的 UTC 偏移。';$('#meeting-fold').innerHTML='<option value="">选择第一次或第二次…</option>'+matches.map((d,i)=>`<option value="${i}">第 ${i+1} 次 · ${formatOffset(offsetMinutes(d,baseCity().zone))} · ${d.toISOString().slice(11,16)} UTC</option>`).join('');$('#meeting-fold').hidden=false;return;}
    selectMeeting(matches[0]);
  } catch(e){$('#meeting-error').textContent=e.message;}
}
function meetingFits(id,start,end) { if(!availableAt(start,id))return false;for(let t=Math.floor(start.getTime()/60000)*60000+60000;t<end.getTime();t+=60000)if(!availableAt(new Date(t),id))return false;return true; }
function buildInvitation() {
  const start=state.meeting, end=new Date(start.getTime()+Number($('#meeting-duration').value)*60000), duration=$('#meeting-duration').value;
  const lines=selectedCities().map(c=>`${c.name} / ${c.en}: ${timeLabel(start,c.zone)} → ${timeLabel(end,c.zone)} [${c.zone}]`);
  return `我们约在以下同一个时刻，时长 ${duration} 分钟。你方便吗？\nWould this time work for you? (${duration} minutes)\n\n${lines.join('\n')}\n\nUTC: ${start.toISOString().slice(0,16).replace('T',' ')}Z → ${end.toISOString().slice(0,16).replace('T',' ')}Z\n请确认你的当地日期、时间和时区。\nPlease confirm your local date, time, and time zone.`;
}
function selectMeeting(start) {
  state.meeting=start;const end=new Date(start.getTime()+Number($('#meeting-duration').value)*60000);
  const outside=selectedCities().filter(c=>!meetingFits(c.id,start,end));
  $('#meeting-time').value=partsAt(start,baseCity().zone).time;
  $('#meeting-summary').hidden=false;$('#meeting-summary').innerHTML=`<div class="meeting-summary"><h3>同一场约定 · ${$('#meeting-duration').value} 分钟</h3>${selectedCities().map(c=>{const p=partsAt(start,c.zone),e=partsAt(end,c.zone);return `<div class="meeting-city"><span>${c.name}</span><span>${p.date} ${p.time} → ${e.date!==p.date?`${e.date} `:''}${e.time}</span></div><div class="city-en" style="text-align:right">${formatOffset(offsetMinutes(start,c.zone))}${offsetMinutes(start,c.zone)!==offsetMinutes(end,c.zone)?` → ${formatOffset(offsetMinutes(end,c.zone))}`:''} · ${c.zone}</div>`;}).join('')}${outside.length?`<p class="meeting-warning">${outside.map(c=>c.name).join('、')}的会议未完整落在已设可用时段，请先确认对方是否方便。</p>`:'<p class="meeting-warning" style="color:#6f8b5f">✓ 完整时长符合全部已设可用时段。</p>'}<textarea class="invite-text" readonly aria-label="中英文会议邀请内容">${esc(buildInvitation())}</textarea><div class="meeting-actions"><button class="primary-button" id="copy-invite">复制中英邀请</button><button class="secondary-button" id="download-ics">下载日历 .ics</button></div><p class="small-note">下载一次性日历文件，导入日历后按该日历时区显示。下载不会自动向任何人发送邀请。</p></div>`;
  $('#copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(buildInvitation());toast('已复制，粘贴给朋友前再确认一次。');}catch{const text=$('.invite-text');text.focus();text.select();toast('请按 Ctrl+C 复制已选中的邀请内容。');}};
  $('#download-ics').onclick=downloadICS;
}
function downloadICS() {
  if(!state.meeting)return;
  const utc=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const icsEscape=s=>s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  // Fold by UTF-8 octets (RFC 5545), preserving multibyte characters.
  const fold=line=>{let out='',part='',bytes=0;const enc=new TextEncoder();for(const char of line){const size=enc.encode(char).length;if(bytes+size>73){out+=part+'\r\n ';part='';bytes=1;}part+=char;bytes+=size;}return out+part;};
  const text=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Time Atlas//Earth Time Lab//ZH','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${crypto.randomUUID()}@time-atlas.local`,`DTSTAMP:${utc(new Date())}`,`DTSTART:${utc(state.meeting)}`,`DTEND:${utc(new Date(state.meeting.getTime()+Number($('#meeting-duration').value)*60000))}`,'SUMMARY:同刻 · 跨时区会面',`DESCRIPTION:${icsEscape(buildInvitation())}`,'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
  const url=URL.createObjectURL(new Blob([text],{type:'text/calendar;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`同刻-会面-${partsAt(state.meeting,baseCity().zone).date}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('日历文件已生成，请导入自己的日历。');
}

manualTimeContext=createTimeContext({id:'manual-time-context',onNow:()=>navigate('explore',{mode:'live'}),nowLabel:'回到实时现在'});
$('#explore .explore-grid').before(manualTimeContext.element);
icons();renderBaseSelect();renderLessons();renderQuiz();renderRoutines();renderPeople();syncTime();
$('#meeting-date').value=partsAt(state.instant,baseCity().zone).date;
$('#source-list').innerHTML=sources.map(s=>`<div class="source-item"><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)} ↗</a><small>${esc(s.note)}</small></div>`).join('');
$$('.nav-item').forEach(b=>b.onclick=()=>navigate(b.dataset.view));$$('[data-goto]').forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
document.addEventListener('click',event=>{const link=event.target.closest('[data-theory-topic]');if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate('learn',{topic:link.dataset.theoryTopic});});
window.addEventListener('hashchange',restoreFromURL);window.addEventListener('popstate',restoreFromURL);
$('#go-now').onclick=()=>{navigate('explore',{mode:'live'});clearExploreError();setInstant(new Date());toast('已返回实时全球时间首页');};
$('#explore-date').onchange=applyWallTime;$('#explore-time').onchange=applyWallTime;
$('#time-slider').oninput=()=>{const n=Number($('#time-slider').value);$('#explore-time').value=`${pad(Math.floor(n/60))}:${pad(n%60)}`;cancelAnimationFrame(syncFrame);syncFrame=requestAnimationFrame(applyWallTime);};
$('#base-city').onchange=()=>{state.base=$('#base-city').value;clearExploreError();syncTime();renderPeople();$('#meeting-date').value=partsAt(state.instant,baseCity().zone).date;invalidateMeeting();persist();};
$('#explore-fold').onchange=()=>{if($('#explore-fold').value==='')return;const d=foldChoices[Number($('#explore-fold').value)];clearExploreError();setInstant(d);};
$('#night-toggle').onchange=()=>globe?.setNight($('#night-toggle').checked);
$('#add-city').onclick=openCities;$('#planner-add-city').onclick=openCities;$('#city-close').onclick=()=>$('#city-dialog').close();$('#city-search').oninput=renderCityOptions;
$('#sources-open').onclick=()=>$('#sources-dialog').showModal();$('#sources-close').onclick=()=>$('#sources-dialog').close();
$('#footer-sources').onclick=()=>$('#sources-dialog').showModal();
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const rect=d.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)d.close();}}));
$('#find-meeting').onclick=()=>searchMeetings(false);$('#set-meeting').onclick=manualMeeting;
$('#meeting-date').onchange=invalidateMeeting;$('#meeting-duration').onchange=invalidateMeeting;
$('#meeting-time').oninput=()=>{state.meeting=null;$('#meeting-summary').hidden=true;$('#meeting-fold').hidden=true;$('#meeting-error').textContent='';};
$('#meeting-fold').onchange=()=>{if($('#meeting-fold').value==='')return;selectMeeting(meetingFoldChoices[Number($('#meeting-fold').value)]);$('#meeting-error').textContent='';$('#meeting-fold').hidden=true;};
const startupHash=location.hash;showView(routeFromHash(startupHash).view);
try {globe=await createGlobe($('#globe'),{cities,onSelectCity:id=>{if(humanTime?.active||resetTime?.active||liveTime?.active)return;if(!state.selected.includes(id))addCity(id);globe?.focusCity(byId(id));}});globe.setInstant(state.instant);}catch(e){$('#earth-utc').textContent=e.message;}
await initTour({cities,navigate,toast});
classroom=await initGlobeLessons({cities,navigate,toast,openPlannerCase,onNavigationChange:()=>commitNavigation(true)});
commonTime=initCommonTime({toast,openPlannerCase});
$$('#phrases [data-goto="planner"]').forEach(button=>button.onclick=()=>commonTime.openPlannerCase());
humanTime=initHumanTime({globe,getInstant:()=>state.instant,navigate,onClose:syncTime,onOpen:()=>{resetTime?.close();liveTime?.close();}});
resetTime=initResetTime({globe,humanTime,getInstant:()=>state.instant,navigate,onClose:syncTime,onOpen:()=>liveTime?.close()});
liveTime=initLiveTime({globe,humanTime,resetTime,getInstant:()=>state.instant,navigate,onClose:syncTime});
for(const [id,mode]of [['live-open','live'],['human-open','human'],['reset-open','reset'],['human-free','manual']])$('#'+id).onclick=()=>navigate('explore',{mode});
window.addEventListener('timeatlas:expression-context',()=>hydratedNavigation.add('common'));
navigationReady=true;await applyRoute(routeFromHash(location.hash||startupHash),{restore:true,snapshot:storedNavigation,push:false});
for(const event of ['click','change','input'])document.addEventListener(event,e=>{if(!e.target.closest('#explore,#tour,#planner,#common-time'))return;clearTimeout(navigationTimer);navigationTimer=setTimeout(()=>commitNavigation(event==='click'),event==='input'?160:0);});
window.addEventListener('pagehide',()=>commitNavigation(false));
window.addEventListener('timeatlas:compare',e=>{liveTime?.close();resetTime?.close();humanTime?.close();if(!state.selected.includes(e.detail.cityId))addCity(e.detail.cityId);navigate('explore');globe?.focusCity(byId(e.detail.cityId));});

initWalkthrough({
  capture(){return {navigation:navigationSnapshot(),classroom:classroom.getNavigationState(),common:commonTime.getNavigationState(),follow:$('#lesson-follow').checked,continuous:$('#lesson-continuous').checked,scrollY:window.scrollY};},
  pause(){classroom.pause();humanTime.pause();resetTime.pause();liveTime.pause();commonTime.pause();document.querySelectorAll('.walkthrough-target').forEach(node=>node.classList.remove('walkthrough-target'));document.querySelectorAll('audio').forEach(audio=>audio.pause());},
  async prepare(stop,part){
    classroom.setGuidedPlayback(true);$('#lesson-follow').checked=true;$('#lesson-continuous').checked=false;
    const snapshot={...storedNavigation};
    if(part.player==='lesson'||part.player==='routine'){
      const lesson=globeLessons.find(row=>row.id===part.route.lesson),step=part.route.step;
      snapshot[part.player==='routine'?'routineCourse':'course']={mode:'classroom',lessonId:lesson.id,step,instant:lesson.stages[step].instant,timeKind:'example'};
    }
    if(part.player==='human')snapshot.human={step:part.route.step};
    if(part.player==='reset')snapshot.reset={type:part.route.type,inputMode:'lesson',source:'PT',date:'2026-10-28',time:'00:00',start:'2026-10-28T22:00',hours:'5',billing:'2026-11-02T08:00',nextEnabled:false};
    if(part.setup==='announcement')snapshot.reset={type:'announcement',inputMode:'announcement',viewer:'beijing',announcement:{text:'今天是重置日。太平洋标准时间午夜前抵达。',flowVersion:4,understandingVersion:1}};
    await applyRoute(part.route,{restore:true,snapshot});
    if(part.setup==='announcement')resetTime.loadAnnouncementExample('今天是重置日。太平洋标准时间午夜前抵达。');
    if(part.setup==='common')commonTime.setContext({zoneId:'PT',date:addDays(partsAt(new Date(),'America/Los_Angeles').date,1),time:'09:00'});
    if(stop.id==='planner'){
      const date=addDays(partsAt(new Date(),'America/Los_Angeles').date,1),at=zonedToInstants(date,'09:00','America/Los_Angeles')[0];
      openPlannerCase({cityIds:['beijing','la'],instant:at.toISOString(),durationMinutes:30,sourceView:'phrases',sourceTitle:'完整导览 · 两地约时间示例',sourceNote:'这是导览临时案例；各自是否方便需要核对个人窗口。'});
    }
    const target=part.target||({human:'#explore .earth-panel',announcement:'#announcement-result',reset:'#explore .earth-panel',common:'#common-time',lesson:'#planet-title',routine:'.routine-observatory',live:'.live-voice-entry'}[part.player]);
    const node=target?document.querySelector(target):null;if(node&&part.player==='guide')node.classList.add('walkthrough-target');
    // Keep the current page's primary globe in view; narration does not open a separate stage.
    window.scrollTo({top:0,behavior:'instant'});
  },
  play(player){return {live:()=>liveTime.play(),human:()=>humanTime.play(),lesson:()=>classroom.play(),routine:()=>classroom.play(),reset:()=>resetTime.play(),announcement:()=>resetTime.play(),common:()=>commonTime.playGuidedPractice()}[player]?.();},
  async restore(backup){
    classroom.setGuidedPlayback(false);if(!backup?.navigation)return;
    clearTimeout(navigationTimer);restoringNavigation=true;const snapshot=backup.navigation;
    try{
      commonTime.setContext(snapshot.common||backup.common);resetTime.restoreNavigationState(snapshot.reset||{});humanTime.restoreNavigationState(snapshot.human||{});liveTime.restoreNavigationState(snapshot.live||{});
      liveTime.close();humanTime.close();resetTime.close();if(backup.classroom)await classroom.restoreNavigationState(backup.classroom);
      coursePositions.course=snapshot.course;coursePositions.routineCourse=snapshot.routineCourse;storedNavigation=snapshot;
      await applyRoute(snapshot.route,{restore:true,snapshot,push:false});
      $('#lesson-follow').checked=backup.follow!==false;$('#lesson-continuous').checked=backup.continuous===true;
      window.scrollTo({top:backup.scrollY||0,behavior:'instant'});
    }finally{restoringNavigation=false;commitNavigation(false);}
  }
});
initAppVersionNotice({beforeReload:()=>{clearTimeout(navigationTimer);return commitNavigation(false);}});
