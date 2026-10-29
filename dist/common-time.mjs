import {voiceFetch,voiceProviderLabel} from './recorded-voice.mjs';
import {partsAt,offsetMinutes,formatOffset,zonedToInstants} from './time-engine.mjs';
import {recordedText} from './recorded-voice.mjs';

export const timeExpressions=[
  {id:'PT',label:'PT · 美国太平洋时间',city:'Los Angeles',zone:'America/Los_Angeles'},
  {id:'PST',label:'PST · 固定 UTC−08:00',city:'PST',offset:-480},
  {id:'PDT',label:'PDT · 固定 UTC−07:00',city:'PDT',offset:-420},
  {id:'ET',label:'ET · 美国东部时间',city:'New York',zone:'America/New_York'},
  {id:'CT',label:'CT · 美国中部时间',city:'Chicago',zone:'America/Chicago'},
  {id:'MT',label:'MT · 美国山地时间（丹佛）',city:'Denver',zone:'America/Denver'},
  {id:'London',label:'London time · 伦敦时间',city:'London',zone:'Europe/London'},
  {id:'Paris',label:'Central European time · 巴黎当地时间',city:'Paris',zone:'Europe/Paris'},
  {id:'Beijing',label:'Beijing time · 北京时间',city:'Beijing',zone:'Asia/Shanghai'},
  {id:'Tokyo',label:'JST · 东京时间',city:'Tokyo',zone:'Asia/Tokyo'},
  {id:'India',label:'India time · 印度时间',city:'New Delhi',zone:'Asia/Kolkata'},
  {id:'UTC',label:'UTC / Z · 协调世界时',city:'UTC',zone:'UTC'},
  {id:'Sydney',label:'Sydney time · 悉尼当地时间',city:'Sydney',zone:'Australia/Sydney'},
  {id:'SaoPaulo',label:'São Paulo time · 圣保罗当地时间',city:'São Paulo',zone:'America/Sao_Paulo'},
  {id:'EastAfrica',label:'EAT · 东非时间（内罗毕）',city:'Nairobi',zone:'Africa/Nairobi'},
  {id:'Dubai',label:'Dubai time · 迪拜当地时间',city:'Dubai',zone:'Asia/Dubai'},
];
export function resolveTimeExpression(id,date,time){
  const term=timeExpressions.find(t=>t.id===id);
  if(!term)throw new Error('请选择一种时间说法。');
  return term.zone?zonedToInstants(date,time,term.zone):zonedToInstants(date,time,'UTC').map(d=>new Date(d.getTime()-term.offset*60000));
}
const expressionCities={PT:'la',PST:'la',PDT:'la',ET:'newyork',CT:'chicago',MT:'denver',London:'london',Paris:'paris',Beijing:'beijing',Tokyo:'tokyo',India:'delhi',Sydney:'sydney',SaoPaulo:'saopaulo',EastAfrica:'nairobi',Dubai:'dubai'};
/** Preserve the selected occurrence, including fixed-offset expressions and DST folds. */
export function buildCommonTimeCase(id,date,time,instant){
  const term=timeExpressions.find(t=>t.id===id),matches=resolveTimeExpression(id,date,time);
  const at=instant===undefined&&matches.length===1?matches[0]:new Date(instant);
  if(!matches.some(value=>value.getTime()===at.getTime()))throw new Error(matches.length>1?'请先选择重复钟点的第一次或第二次。':'请先填写一个有效的完整时刻。');
  const offset=term.zone?offsetMinutes(at,term.zone):term.offset;
  const mismatch=term.offset!==undefined&&offsetMinutes(at,'America/Los_Angeles')!==term.offset;
  return {cityIds:[...new Set(['beijing',expressionCities[id]].filter(Boolean))],instant:at.toISOString(),durationMinutes:30,sourceView:'phrases',sourceTitle:`沟通指南 · ${date} ${time} ${term.label}（${formatOffset(offset)}）`,...(mismatch?{sourceNote:`原输入严格按 ${id} 固定偏移解释；下方洛杉矶时钟按当天实际当地规则显示，钟点可能不同，代表的仍是同一个瞬间。`}:{}),expression:{id,label:term.label,date,time,offset,zone:term.zone},beijing:partsAt(at,'Asia/Shanghai'),utc:partsAt(at,'UTC'),mismatch};
}
export function buildCommonTimeNarration(context){
  const {expression:s,beijing:bj,utc}=context||{};
  if(!s||!bj||!utc)throw new Error('请先完成当前时间换算。');
  const date=value=>{const [year,month,day]=value.split('-').map(Number);return `${year}年${month}月${day}日`;};
  const clock=value=>{const [h,m]=value.split(':').map(Number);return `${h}点${m?m+'分':'整'}`;};
  const amount=value=>{const n=Math.abs(value),h=Math.floor(n/60),m=n%60;return `${h?h+'小时':''}${m?m+'分钟':''}`||'零分钟';};
  const operation=value=>value===0?'保持钟点不变':`${value<0?'减去':'加上'}${amount(value)}`;
  return [
    {id:'source',label:'① 先读对方的日期、钟点与时间说法',text:`我们只解释你刚才选定的这个案例。对方说的是${s.label.split(' · ')[0]}，${date(s.date)}${clock(s.time)}。${s.id==='PT'?`这里按洛杉矶在这一天的规则，使用${s.offset===-420?'PDT，夏令时':'PST，标准时间'}。`:s.id==='PST'||s.id==='PDT'?`这里严格按${s.id}的固定UTC偏移换算。`:''}${context.mismatch?'请注意，这个固定偏移与当天洛杉矶实际当地时间不同，需要确认作者的意思。':''}`},
    {id:'utc',label:'② 换到共同参照 UTC',text:`把对方的钟点${operation(-s.offset)}，得到UTC的${date(utc.date)}${clock(utc.time)}。UTC是共同参照，这一步仍然是同一个瞬间。`},
    {id:'target',label:'③ 同一瞬间，看北京时间',text:`再从UTC加上八小时，得到北京时间${date(bj.date)}${clock(bj.time)}。${bj.date!==s.date?'注意，北京的日期与对方不同，约时间时要把双方日期都写出来。':'这个案例中，双方日历日期相同，钟点按各自规则显示。'}`},
    {id:'confirm',label:'④ 确认完整日期，并继续约时间',text:`因此，对方${date(s.date)}${clock(s.time)}，对应北京${date(bj.date)}${clock(bj.time)}。可以复制下方确认句，或者带着这个相同的瞬间进入约时间工具，继续检查双方是否方便。`},
  ].map(cue=>({...cue,text:recordedText('common-'+cue.id,cue.text)}));
}
/** The full walkthrough has already taught offsets; this stop practises confirmation. */
export function buildCommonTimePracticeNarration(context){
  const {expression:s,beijing:bj}=context||{};
  if(!s||!bj)throw new Error('请先完成当前时间换算。');
  const date=value=>{const [year,month,day]=value.split('-').map(Number);return `${year}年${month}月${day}日`;};
  const clock=value=>{const [h,m]=value.split(':').map(Number);return `${h}点${m?m+'分':'整'}`;};
  const basis=s.id==='PT'?'洛杉矶当地时间':s.label;
  return [
    {id:'source',label:'① 实际沟通，先问清日期与地点',text:`现在把前面学过的知识用在一次实际沟通里。先问对方：你说的是哪座城市、哪一天、上午还是下午？当前示例是${date(s.date)}${clock(s.time)}，按${basis}理解。${context.mismatch?'这里的固定偏移与当天洛杉矶当地钟表不同，先确认作者究竟采用哪一种。':'先把这些条件确认完整，再核对双方读数。'}`},
    {id:'confirm',label:'② 同时确认双方时间与是否方便',text:`可以这样回复：确认一下，你说的${date(s.date)}${clock(s.time)}，对应北京时间${date(bj.date)}${clock(bj.time)}，对吗？把双方完整日期写在同一句话里，再问通话多久、这个时段是否方便。下方可以复制确认句，或者带这个时刻去约时间，核对个人窗口，最后使用带时区的日历邀请。`},
  ].map(cue=>({...cue,text:recordedText('common-practice-'+cue.id,cue.text)}));
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tables=[
 ['PT · 太平洋时间','洛杉矶 / 旧金山 / 西雅图','PST −08:00 → PDT −07:00','北京快 16 / 15 小时'],
 ['MT · 山地时间','丹佛','MST −07:00 → MDT −06:00','北京快 15 / 14 小时'],
 ['CT · 中部时间','芝加哥','CST −06:00 → CDT −05:00','北京快 14 / 13 小时'],
 ['ET · 东部时间','纽约 / 华盛顿','EST −05:00 → EDT −04:00','北京快 13 / 12 小时'],
 ['London time','伦敦','GMT +00:00 → BST +01:00','北京快 8 / 7 小时'],
 ['中欧当地时间','巴黎 / 柏林','CET +01:00 → CEST +02:00','北京快 7 / 6 小时'],
 ['Beijing / Singapore time','北京 / 新加坡','全年 +08:00','与北京相同'],
 ['JST / KST','东京 / 首尔','全年 +09:00','北京慢 1 小时'],
 ['India time','新德里','全年 +05:30','北京快 2 小时 30 分'],
 ['UTC / Z（Zulu）','全球共同参照','固定 +00:00','北京快 8 小时'],
];

export function initCommonTime({toast,openPlannerCase}){
 const root=document.querySelector('#common-time');if(!root)return;
 root.innerHTML=`<div class="common-heading"><div><div class="eyebrow">WHEN THEY SAY “PACIFIC”…</div><h2>他说「太平洋时间」，我该看几点？</h2><p>在美国科技活动的语境里，先想到洛杉矶、旧金山、西雅图的当地时间，再看活动是哪一天。</p></div><button class="secondary-button" id="common-listen-case">♫ 听懂当前换算</button></div>
 <div class="pacific-story"><div><span class="common-code">PT</span><h3>Pacific Time · 太平洋时间</h3><p>PT 是地区时间的统称。它按当地日期采用标准时间或夏令时；并不是整个太平洋共用一个时区。</p><small>这里以美国洛杉矶规则换算。其他国家或地区也可能使用相似名称，请确认具体地点。</small></div><div class="pacific-seasons"><div><b>PST</b><span>标准时间 · UTC−08:00</span><strong>北京比这里快 16 小时</strong></div><div><b>PDT</b><span>夏令时 · UTC−07:00</span><strong>北京比这里快 15 小时</strong></div></div></div>
 <div class="common-converter"><div class="section-title"><h3>把一句话换成双方的时间</h3><span>改日期，看看时差为什么变</span></div><div class="common-controls"><label>对方说的时间<select id="common-zone">${timeExpressions.map(t=>`<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select></label><label>对方当地日期<input id="common-date" type="date" aria-label="对方当地日期"></label><label>对方当地钟点<input id="common-clock" type="time" value="09:00" aria-label="对方当地钟点"></label></div><div class="common-presets"><span>试一试</span><button data-common-example="2026-10-28">10 月 28 日 · 9 a.m. PT</button><button data-common-example="2026-11-02">11 月 2 日 · 9 a.m. PT</button></div><select id="common-fold" aria-label="选择重复时刻" hidden></select><p id="common-error" class="field-error" role="status"></p><div id="common-result" aria-live="polite"></div><div id="common-confirm" hidden><label for="common-copy-text">可以这样回复确认</label><textarea id="common-copy-text" readonly aria-label="双方时间确认句"></textarea><button id="common-copy" class="secondary-button">复制英文确认句</button></div></div>
 <div class="common-case-actions"><button id="common-open-planner" class="secondary-button" disabled>带这个时刻去约时间 ↗</button><button class="text-button" data-listen-common="common-pacific">♫ 完整太平洋时间介绍 ↗</button></div>
 <div id="common-case-voice" class="common-case-voice" hidden><strong id="common-case-voice-title"></strong><p id="common-case-transcript" aria-live="polite"></p><audio id="common-case-audio" controls preload="metadata" aria-label="MiniMax 当前换算案例分段讲解" hidden></audio><div><button id="common-case-prev" class="text-button">← 上一段</button><button id="common-case-next" class="text-button">下一段 →</button><button id="common-case-stop" class="text-button">结束讲解</button></div><small id="common-case-voice-status" role="status"></small></div>
 <div class="common-heading common-secondary"><div><div class="eyebrow">A SMALL TIME VOCABULARY</div><h2>先认地区，再认字母</h2><p>S = Standard（标准时间），D = Daylight（夏令时）。PT / ET 等统称随当地日期变化。</p></div><button class="text-button" data-listen-common="common-expressions">♫ 听常用时间表达 ↗</button></div>
 <div class="common-table-wrap" tabindex="0" aria-label="常用时区速查表，可横向滚动"><table class="common-table"><thead><tr><th>常听到的说法</th><th>用这些城市理解</th><th>标准时间 → 夏令时（UTC 偏移）</th><th>相对北京时间</th></tr></thead><tbody>${tables.map(row=>`<tr>${row.map((v,i)=>`<${i?'td':'th'}${i?'':' scope="row"'}>${v}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div><p class="common-footnote">上表以列出的城市为例；箭头表示季节规则，不是当前状态。美国与欧洲的拨钟日期不同；亚利桑那州大部分地区也不随丹佛切换。未来安排请按城市和具体日期换算。</p>
 <div class="common-cautions"><article><h3>缩写不一定唯一</h3><p>CST 可以指中国标准时间，也可指美国中部标准时间。IST 可能指印度、爱尔兰或以色列的时间说法。遇到这种缩写，先问城市。</p></article><article><h3>口头说 PST，可能只是想说 PT</h3><p>严格的 PST 固定为 UTC−08:00。但有人全年都习惯写 PST；如果活动在夏令时期间，先确认是洛杉矶当地时间，还是固定 UTC−08:00。</p></article><article><h3>GMT 不等于全年伦敦时间</h3><p>日常换算中 GMT 按 UTC+00:00 理解；伦敦夏令时使用 BST（UTC+01:00）。看到 UTC 时间戳末尾的 Z，表示零偏移。</p></article><article><h3>my / your / local time</h3><p>“my time” 是说话者当地时间；“your time” 是对方当地时间；“local time” 要看指的是哪座城市。航班信息通常按各机场当地时间显示。</p></article><article><h3>12 a.m. 与 12 p.m.</h3><p>通常 12 a.m. 为午夜 00:00，12 p.m. 为正午 12:00。为了避免误会，写 noon 或完整日期加 00:00；“周五午夜”还要确认是哪一天的开始。</p></article><article><h3>EOD / COB / tomorrow</h3><p>EOD 是一天结束前，COB 是下班前，具体截止钟点因团队而异；tomorrow 则取决于谁的日期。直接确认年月日、几点、城市时区，别默认都是 17:00。</p></article></div>
 <div class="common-final-tip"><strong>固定一个瞬间，还是固定一方的钟点？</strong><p>单次会议确认双方完整日期与时间即可；“每周二 9 a.m. PT”固定的是美国西海岸钟点，换季后你的北京时间可能移动一小时。应在日历里选择城市时区，并复查切换周。</p></div><p class="common-footnote">资料：<a href="https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst" target="_blank" rel="noreferrer">NIST 美国夏令时规则 ↗</a> · <a href="https://www.time.gov/" target="_blank" rel="noreferrer">美国官方时间 ↗</a> · <a href="https://www.gov.uk/when-do-the-clocks-change" target="_blank" rel="noreferrer">英国时钟规则 ↗</a> · <a href="https://data.iana.org/time-zones/tzdb/theory.html" target="_blank" rel="noreferrer">IANA 时区与缩写 ↗</a></p>`;
 const $=id=>root.querySelector(id);let candidates=[],selectedInstant=null;
 const audio=$('#common-case-audio'),voiceCache=new Map();let voiceToken=0,voiceSegments=[],voiceIndex=0,voiceBusy=false;
 const voiceVisible=()=>root.getClientRects().length>0&&!document.hidden;
 function clearHighlight(){root.querySelectorAll('.is-speaking').forEach(el=>el.classList.remove('is-speaking'));}
 function pauseVoice({clear=false}={}){voiceToken++;voiceBusy=false;audio.pause();$('#common-listen-case').disabled=false;$('#common-listen-case').textContent=clear?'♫ 听懂当前换算':'▶ 继续当前换算';if(clear){audio.removeAttribute('src');audio.load();audio.hidden=true;$('#common-case-voice').hidden=true;voiceSegments=[];clearHighlight();}}
 function paintVoice(){const segment=voiceSegments[voiceIndex];if(!segment)return;clearHighlight();const selector={source:'.common-result-grid>div:first-child',utc:'[data-common-utc]',target:'.common-result-grid>div:last-child',confirm:'#common-confirm'}[segment.id];$(selector)?.classList.add('is-speaking');$('#common-case-voice-title').textContent=`${segment.label} · ${voiceIndex+1} / ${voiceSegments.length}`;$('#common-case-transcript').textContent=segment.text;$('#common-case-prev').disabled=voiceIndex===0;$('#common-case-next').disabled=voiceIndex===voiceSegments.length-1;}
 async function voiceJson(url,options){const response=await voiceFetch(url,options);let data;try{data=await response.json();}catch{throw new Error('语音服务暂时无法读取，请重试。');}if(!response.ok)throw new Error(data.error?.message||'语音暂时无法播放，请重试。');return data;}
 async function playSegment(index){
   if(!voiceVisible()||!voiceSegments[index])return;pauseVoice();audio.removeAttribute('src');audio.load();audio.hidden=true;voiceIndex=index;paintVoice();const token=++voiceToken;voiceBusy=true;$('#common-listen-case').disabled=true;$('#common-case-voice').hidden=false;$('#common-case-voice-status').textContent='正在准备本段 MiniMax 讲解…';
   try{const config=await voiceJson('/api/voice/status');if(token!==voiceToken)return;if(!config.configured)throw new Error('MiniMax 暂未连接，请检查已有语音配置。');const segment=voiceSegments[index],key=[config.model,config.voiceId,segment.text].join('|');let clip=voiceCache.get(key);if(!clip){clip=await voiceJson('/api/voice/synthesize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chapterId:`common-case-${segment.id}`,text:segment.text,model:config.model,voiceId:config.voiceId})});voiceCache.set(key,clip);}if(token!==voiceToken||!voiceVisible())return;document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});audio.src=clip.audioUrl;audio.hidden=false;await audio.play();if(token===voiceToken)$('#common-case-voice-status').textContent=`${voiceProviderLabel()} · 只讲解当前选定的案例，强调区域与本段对应`;}
   catch(error){if(token===voiceToken){audio.removeAttribute('src');audio.hidden=true;$('#common-case-voice-status').textContent=error.message;}}
   finally{if(token===voiceToken){voiceBusy=false;$('#common-listen-case').disabled=false;$('#common-listen-case').textContent=audio.paused?'▶ 重听当前段':'Ⅱ 暂停当前换算';}}
 }
 function currentCase(){if(!selectedInstant)throw new Error('请先完成换算；若钟点重复，请选择第一次或第二次。');return buildCommonTimeCase($('#common-zone').value,$('#common-date').value,$('#common-clock').value,selectedInstant);}
 function handoff(){try{const context=currentCase();if(typeof openPlannerCase==='function')return openPlannerCase(context);return false;}catch(error){$('#common-error').textContent=error.message;return false;}}
 $('#common-date').value=partsAt(new Date(),'America/Los_Angeles').date;
 function show(instant){
   selectedInstant=new Date(instant).toISOString();$('#common-open-planner').disabled=false;
   const term=timeExpressions.find(t=>t.id===$('#common-zone').value),offset=term.zone?offsetMinutes(instant,term.zone):term.offset;
   const bj=partsAt(instant,'Asia/Shanghai'),date=$('#common-date').value,time=$('#common-clock').value;
   const suffix=term.id==='PT'?(offset===-420?'PDT · 夏令时':'PST · 标准时间'):formatOffset(offset);
   const mismatch=term.offset!==undefined&&offsetMinutes(instant,'America/Los_Angeles')!==term.offset;
   $('#common-result').innerHTML=`<div class="common-result-grid"><div><small>对方 · ${esc(term.city)} · ${esc(suffix)}</small><strong>${esc(date)}<b>${esc(time)}</b></strong><span>${formatOffset(offset)}</span></div><div><small>你 · 北京时间${bj.date!==date?' · 注意跨日':''}</small><strong>${bj.date}<b>${bj.time}</b></strong><span>UTC+08:00</span></div></div><p class="common-result-note">${mismatch?'此处严格按 '+term.id+' 的固定偏移理解；这一天与洛杉矶当地时间不一致。请向对方确认是否其实想说 PT。':term.id==='PT'?`这一天美国太平洋时间采用 ${suffix}。北京时间快 ${(480-offset)/60} 小时。`:'这是同一个瞬间，双方日期和钟点可以不同。'}<br><span data-common-utc>UTC：${instant.toISOString().slice(0,16).replace('T',' ')}Z</span></p>`;
   $('#common-copy-text').value=`Just to confirm: ${date} at ${time} ${term.city==='PST'||term.city==='PDT'?term.city:term.city+' time'} (${formatOffset(offset)}) — that's ${bj.date} at ${bj.time} Beijing time (UTC+08:00). Is that correct?`;
   $('#common-confirm').hidden=false;
 }
 function update(){
   pauseVoice({clear:true});selectedInstant=null;$('#common-open-planner').disabled=true;
   $('#common-error').textContent='';$('#common-fold').hidden=true;$('#common-fold').innerHTML='';$('#common-result').innerHTML='';$('#common-confirm').hidden=true;
   try{candidates=resolveTimeExpression($('#common-zone').value,$('#common-date').value,$('#common-clock').value);if(!candidates.length){$('#common-error').textContent='这个当地钟点因夏令时向前拨钟而不存在。请换一个时刻。';return;}if(candidates.length>1){$('#common-error').textContent='这个钟点因回拨出现两次，请先确认是哪一次。';$('#common-fold').innerHTML='<option value="">选择第一次或第二次…</option>'+candidates.map((d,i)=>`<option value="${i}">第 ${i+1} 次 · ${formatOffset(offsetMinutes(d,timeExpressions.find(t=>t.id===$('#common-zone').value).zone))} · ${d.toISOString().slice(11,16)} UTC</option>`).join('');$('#common-fold').hidden=false;return;}show(candidates[0]);}catch(e){$('#common-error').textContent=e.message;}
 }
 function getNavigationState(){return {zoneId:$('#common-zone').value,date:$('#common-date').value,time:$('#common-clock').value,...(selectedInstant?{instant:selectedInstant}:{})};}
 function setContext(saved){
   if(!saved||typeof saved!=='object'||typeof saved.date!=='string'||typeof saved.time!=='string')return false;
   if(saved.zoneId!==undefined?typeof saved.zoneId!=='string'||!saved.zoneId:typeof saved.zone!=='string'||!saved.zone)return false;
   const term=saved.zoneId!==undefined
     ?timeExpressions.find(t=>t.id===saved.zoneId)
     :timeExpressions.find(t=>t.zone===saved.zone||t.id===saved.zone);
   if(!term)return false;
   try{resolveTimeExpression(term.id,saved.date,saved.time);}catch{return false;}
   // A valid wall-clock request may still be skipped or repeated. Let update()
   // display that unresolved state instead of guessing an occurrence.
   $('#common-zone').value=term.id;$('#common-date').value=saved.date;$('#common-clock').value=saved.time;update();if(saved.instant&&candidates.some(d=>d.toISOString()===saved.instant)){$('#common-fold').value=String(candidates.findIndex(d=>d.toISOString()===saved.instant));$('#common-error').textContent='';show(new Date(saved.instant));}return true;
 }
 window.addEventListener('timeatlas:expression-context',event=>setContext(event.detail));
 for(const id of ['#common-zone','#common-date','#common-clock'])$(id).addEventListener('change',update);
 $('#common-fold').onchange=()=>{pauseVoice({clear:true});if($('#common-fold').value===''){update();return;}$('#common-error').textContent='';show(candidates[Number($('#common-fold').value)]);};
 root.querySelectorAll('[data-common-example]').forEach(b=>b.onclick=()=>{$('#common-zone').value='PT';$('#common-date').value=b.dataset.commonExample;$('#common-clock').value='09:00';update();});
 root.querySelectorAll('[data-listen-common]').forEach(b=>b.onclick=()=>window.dispatchEvent(new CustomEvent('timeatlas:chaptertour',{detail:{chapterId:b.dataset.listenCommon,autoplay:true}})));
 $('#common-listen-case').onclick=()=>{if(voiceBusy)return;if(!audio.paused){pauseVoice();return;}if(audio.src&&!audio.ended){void audio.play().catch(()=>{$('#common-case-voice-status').textContent='请点击音频播放器继续。';});return;}try{if(!voiceSegments.length){voiceSegments=buildCommonTimeNarration(currentCase());voiceIndex=0;}else if(audio.ended&&voiceIndex===voiceSegments.length-1)voiceIndex=0;void playSegment(voiceIndex);}catch(error){$('#common-error').textContent=error.message;}};
 $('#common-open-planner').onclick=handoff;$('#common-case-prev').onclick=()=>void playSegment(voiceIndex-1);$('#common-case-next').onclick=()=>void playSegment(voiceIndex+1);$('#common-case-stop').onclick=()=>pauseVoice({clear:true});
 audio.addEventListener('play',()=>{if(!voiceVisible()){pauseVoice();return;}document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});paintVoice();$('#common-listen-case').textContent='Ⅱ 暂停当前换算';});audio.addEventListener('pause',()=>{$('#common-listen-case').textContent='▶ 继续当前换算';});audio.addEventListener('ended',()=>{if(voiceIndex<voiceSegments.length-1)void playSegment(voiceIndex+1);else{$('#common-listen-case').textContent='↺ 重听当前换算';$('#common-case-voice-status').textContent='当前案例讲解结束 · 可以带这个时刻去约时间';queueMicrotask(()=>window.dispatchEvent(new CustomEvent('timeatlas:common-voice-ended')));}});
 audio.addEventListener('error',()=>{if(!audio.hasAttribute('src'))return;audio.removeAttribute('src');audio.hidden=true;$('#common-case-voice-status').textContent='本段音频读取失败，请点击重听。';$('#common-listen-case').textContent='▶ 重听当前段';});
 window.addEventListener('timeatlas:view',event=>{if(event.detail.view!=='phrases')pauseVoice({clear:true});});document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseVoice();});
 $('#common-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#common-copy-text').value);toast('已复制双方时间确认句。');}catch{$('#common-copy-text').focus();$('#common-copy-text').select();toast('请按 Ctrl+C 复制已选中的内容。');}};
 update();
 async function playGuidedPractice(){
   pauseVoice({clear:true});
   try{voiceSegments=buildCommonTimePracticeNarration(currentCase());voiceIndex=0;return await playSegment(0);}
   catch(error){$('#common-error').textContent=error.message;throw error;}
 }
 return {getNavigationState,setContext,openPlannerCase:handoff,pause:()=>pauseVoice({clear:true}),play:()=>$('#common-listen-case').click(),playGuidedPractice};
}
