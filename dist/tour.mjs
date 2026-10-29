import {voiceFetch,voiceProviderLabel,isRecordedDeployment,configureRecordedVoiceUi} from './recorded-voice.mjs';
import {tourChapters as chapters,tourSources,tourTypes,narrationText,estimatedSeconds} from './tour-data.mjs';
import {createGlobe} from './globe.mjs';
import {partsAt,offsetMinutes,formatOffset} from './time-engine.mjs';
import {createAudioRequestGuard} from './audio-request-guard.mjs';
import {createTimeContext} from './time-context.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=n=>`${Math.floor((n||0)/60)}:${String(Math.floor((n||0)%60)).padStart(2,'0')}`;
const wave='<span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';

export async function initTour({cities,navigate,toast}){
  configureRecordedVoiceUi();
  const audio=$('#tour-audio');let atlas,atlasPromise,status={},manifest={chapters:{}},current=0,type='all',query='',loading=false,activeView=location.hash.slice(1).split('?')[0],libraryActive=false,readyId=null,savedPosition=0;
  const textHashes=new Map(await Promise.all(chapters.map(async c=>[c.id,[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(narrationText(c))))].map(b=>b.toString(16).padStart(2,'0')).join('')])));
  const localAudio=new Map();let completed=new Set(),lastSaved=0,locationTimer=0;
  try{const saved=JSON.parse(localStorage.getItem('time-atlas-tour-v1')||'null');if(saved){const i=chapters.findIndex(c=>c.id===saved.chapterId);if(i>=0)current=i;savedPosition=Number(saved.position)||0;completed=new Set((saved.completed||[]).filter(id=>chapters.some(c=>c.id===id)));if([.75,1,1.25,1.5].includes(saved.rate))$('#tour-rate').value=String(saved.rate);}}catch{}
  audio.playbackRate=Number($('#tour-rate').value);
  const currentChapter=()=>chapters[current];
  const timeContext=createTimeContext({id:'tour-time-context'});$('#tour-globe').closest('.tour-stage').prepend(timeContext.element);
  const ownsAudio=()=>activeView==='tour'&&libraryActive&&!document.hidden;
  const requests=createAudioRequestGuard(ownsAudio);
  function cancelPreparation(){requests.invalidate();loading=false;audio.pause();save();updatePlayer();}
  function openLibrary(){navigate('tour');window.dispatchEvent(new CustomEvent('timeatlas:library-request'));}
  function ensureLibrary(){if(!ownsAudio())openLibrary();return ownsAudio();}
  const keyFor=c=>`${c.id}|${status.model}|${status.voiceId}`;
  const cachedFor=c=>{const local=localAudio.get(keyFor(c)),saved=manifest.chapters?.[c.id];return [local,saved].find(entry=>entry&&entry.model===status.model&&entry.voiceId===status.voiceId&&entry.textHash===textHashes.get(c.id))||null;};
  function save(){try{localStorage.setItem('time-atlas-tour-v1',JSON.stringify({chapterId:currentChapter().id,position:readyId===currentChapter().id?(audio.currentTime||0):savedPosition,completed:[...completed],rate:audio.playbackRate}));}catch{}}
  function setMessage(message){$('#tour-error').textContent=message;}
  function updatePlayer(){
    const playing=!audio.paused&&!audio.ended;
    $('#tour-play').innerHTML=loading?'…':playing?'Ⅱ':'▶';$('#tour-play').setAttribute('aria-label',loading?'正在准备语音':playing?'暂停讲解':'播放本章');$('#tour-play').disabled=loading;
    $('#tour-player').classList.toggle('playing',playing);$('#tour-mini-play').textContent=playing?'Ⅱ':'▶';$('#tour-mini-play').setAttribute('aria-label',playing?'暂停讲解':'继续讲解');
    $('#tour-playing-label').textContent=loading?'MiniMax 正在准备本章语音':playing?'正在讲述':readyId===currentChapter().id?'已暂停 · 随时继续':savedPosition>0?`上次听到 ${clock(savedPosition)} · 点击继续`:'按下播放，开始这一站';
    $('#tour-mini-title').textContent=currentChapter().title;$('#tour-mini').hidden=activeView==='tour'||!readyId;
    $('#tour-previous').disabled=current===0||loading;$('#tour-next').disabled=current===chapters.length-1||loading;
  }
  function updateProgress(){const d=Number.isFinite(audio.duration)?audio.duration:0,known=cachedFor(currentChapter())?.durationMs/1000,elapsed=readyId===currentChapter().id?audio.currentTime:savedPosition;$('#tour-seek').disabled=!d;$('#tour-seek').value=(d||known)?Math.round(elapsed/(d||known)*1000):0;$('#tour-elapsed').textContent=clock(elapsed);$('#tour-total').textContent=d?clock(d):known?clock(known):`约 ${Math.ceil(estimatedSeconds(currentChapter())/60)} 分钟`;if(Date.now()-lastSaved>4000){save();lastSaved=Date.now();}}
  function chapterDuration(c){const entry=cachedFor(c);return entry?.durationMs?clock(entry.durationMs/1000):`约${Math.ceil(estimatedSeconds(c)/60)}分`;}
  function renderStats(){
    const ready=chapters.filter(c=>cachedFor(c)).length,total=chapters.reduce((n,c)=>n+(cachedFor(c)?.durationMs/1000||estimatedSeconds(c)),0);
    $('#tour-stats').innerHTML=`<div><strong>${chapters.length}</strong><span>章完整导览</span></div><div><strong>7</strong><span>大洲</span></div><div><strong>${chapters.filter(c=>c.type==='country').length}</strong><span>个国家</span></div><div><strong>${chapters.filter(c=>c.type==='city').length}</strong><span>个城市与地区</span></div><div><strong>${Math.round(total/60)}</strong><span>${ready===chapters.length?'分钟音频':'分钟左右'}</span></div>`;
    $('#tour-ready-count').textContent=`${ready}/${chapters.length} 章音频已备好`;
    $('#tour-completed').textContent=`已听完 ${completed.size} 章`;
  }
  function renderList(){let lastType='';const filtered=chapters.filter(c=>(type==='all'||c.type===type)&&`${c.title} ${c.subtitle} ${c.region} ${c.country||''}`.toLowerCase().includes(query));
    $('#tour-list').innerHTML=filtered.length?filtered.map(c=>{const i=chapters.indexOf(c),heading=c.type!==lastType?`<div class="tour-list-group">${tourTypes[c.type]}</div>`:'';lastType=c.type;return heading+`<button class="chapter-item ${i===current?'active':''}" data-chapter="${i}" aria-pressed="${i===current}"><span class="chapter-index">${String(i+1).padStart(2,'0')}</span><span class="chapter-title-wrap"><strong>${esc(c.title)}</strong><small>${esc(c.region||tourTypes[c.type])} · ${chapterDuration(c)}</small></span><span class="chapter-ready" title="${completed.has(c.id)?'已听完':cachedFor(c)?'音频已就绪':'点击按需生成'}">${completed.has(c.id)?'✓':cachedFor(c)?'♪':''}</span></button>`;}).join(''):'<p class="small-note">没有找到这站，试试国家、城市或大洲名称。</p>';
    $$('#tour-list [data-chapter]').forEach(b=>b.onclick=()=>choose(Number(b.dataset.chapter),false));
    $('#tour-filter-count').textContent=`${filtered.length} 章`;
  }
  function updateLocation(){
    const c=currentChapter(),city=c.cityId?cities.find(x=>x.id===c.cityId):null,now=new Date(),p=city?partsAt(now,city.zone):null;
    timeContext.update({kind:'live',instant:now,zone:city?.zone||'Asia/Shanghai',label:city?`${city.name}当地时间`:'北京时间',...(!city?{detail:'本章地球用于地理定位；当前钟点以北京时间作为参照。'}:{})});
    $('#tour-location').textContent=city?`${city.name}现在 ${p.date} ${p.time} · ${formatOffset(offsetMinutes(now,city.zone))}`:c.focus?`${Math.abs(c.focus.lat).toFixed(1)}°${c.focus.lat>=0?'N':'S'} · ${Math.abs(c.focus.lon).toFixed(1)}°${c.focus.lon>=0?'E':'W'} · 地理定位`:c.region;
  }
  function stopLocationClock(){clearTimeout(locationTimer);locationTimer=0;}
  function syncLocationClock(){
    stopLocationClock();if(!ownsAudio())return;
    updateLocation();
    locationTimer=setTimeout(syncLocationClock,60000-Date.now()%60000+20);
  }
  function renderChapter(){const c=currentChapter();$('#tour-stage-type').textContent=`${String(current+1).padStart(2,'0')} / ${String(chapters.length).padStart(2,'0')} · ${tourTypes[c.type]}`;$('#tour-stage-title').textContent=c.title;$('#tour-stage-summary').textContent=c.summary;$('#tour-stage-subtitle').textContent=c.subtitle;$('#tour-chapter-title').textContent=c.title;
    const city=c.cityId?cities.find(x=>x.id===c.cityId):null;updateLocation();syncLocationClock();
    $('#tour-transcript').innerHTML=`<div class="section-title"><div><div class="eyebrow">READ ALONG</div><h2 style="margin-top:8px">这一站，慢慢听懂</h2></div><button class="text-button" id="tour-save-text">下载讲稿 ↙</button></div>${c.paragraphs.map(p=>`<h3>${esc(p.heading)}</h3><p>${esc(p.text)}</p>`).join('')}<div class="tour-takeaways"><h3>带走这几个认识</h3><ul>${c.takeaways.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div><div class="tour-related">${city?'<button id="tour-compare">把这座城市放进世界时钟 ↗</button>':''}${c.type==='city'&&chapters.some(x=>x.type==='country'&&x.country===c.country)?'<button id="tour-parent">回到这个国家的全貌 ↗</button>':''}</div><details class="tour-references"><summary>本章资料来源与说明</summary>${c.sourceIds.map(id=>tourSources.find(s=>s.id===id)).filter(Boolean).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)} ↗</a>`).join('')}<p class="small-note">讲稿中的作息是情境说明；时区规则可能调整，实际约会请使用日期换算。地球显示陆地，不表示法定时区边界。MiniMax 合成语音。</p></details>`;
    $('#tour-save-text').onclick=()=>{const blob=new Blob([c.title+'\n\n'+c.paragraphs.map(p=>p.heading+'\n'+p.text).join('\n\n')+'\n\n要点\n'+c.takeaways.join('\n')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`同刻-${c.title.replace(/[\\/:*?"<>|]/g,'-')}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
    if($('#tour-compare'))$('#tour-compare').onclick=()=>window.dispatchEvent(new CustomEvent('timeatlas:compare',{detail:{cityId:c.cityId}}));
    if($('#tour-parent'))$('#tour-parent').onclick=()=>choose(chapters.findIndex(x=>x.type==='country'&&x.country===c.country),false);
    const related=c.type==='continent'?chapters.filter(x=>x.type==='country'&&x.region===c.region):c.type==='country'?chapters.filter(x=>x.type==='city'&&x.country===c.country):[];
    for(const item of related){const button=document.createElement('button');button.textContent=`${item.type==='city'?'走进城市':'走进国家'} · ${item.title.split(/[：:·]/)[0]} ↗`;button.onclick=()=>choose(chapters.indexOf(item));$('#tour-transcript .tour-related').appendChild(button);}
    atlas?.focusCity(city||{id:c.id,...c.focus});renderList();renderStats();updatePlayer();updateProgress();
  }
  function choose(index,autoplay=false){if(index<0||index>=chapters.length)return;save();requests.invalidate();audio.pause();audio.removeAttribute('src');audio.load();current=index;loading=false;readyId=null;savedPosition=0;setMessage('');$('#tour-download').hidden=true;renderChapter();save();if(autoplay)void play();}
  async function requestJson(path,body){const r=await voiceFetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await r.json();}catch{throw new Error('语音服务未启动，请重新启动同刻。');}if(!r.ok)throw new Error(data.error?.message||data.message||data.error||'语音准备失败，请稍后再试。');return data;}
  async function refreshStatus(){try{status=await requestJson('/api/voice/status');$('#voice-status').textContent=status.recorded?'MiniMax 预录讲解':status.configured?'MiniMax 已连接':'MiniMax 尚未连接';$('#voice-config-state').textContent=status.recorded?'线上版只读取预录讲解，不收集密钥，也不实时生成语音。':status.configured?'已连接 MiniMax · 密钥仅由本地服务使用':'填写 MiniMax 密钥即可开启语音';$('#voice-model').innerHTML=(status.models||['speech-2.8-hd','speech-2.8-turbo']).map(m=>`<option value="${esc(typeof m==='string'?m:m.id)}">${esc(typeof m==='string'?m:m.name||m.id)}</option>`).join('');$('#voice-model').value=status.model;$('#voice-id').innerHTML=(status.voices||[]).map(v=>`<option value="${esc(v.id||v.voiceId||v.voice_id)}">${esc(v.name||v.label||v.id)}</option>`).join('');$('#voice-id').value=status.voiceId;$('#voice-region').value=status.region||'cn';$('#tour-voice-name').textContent=`${voiceProviderLabel()} · ${(status.voices||[]).find(v=>(v.id||v.voiceId||v.voice_id)===status.voiceId)?.name||'中文讲述'}`;}catch(e){$('#voice-status').textContent=isRecordedDeployment()?'预录语音暂不可用':'语音服务待启动';setMessage(e.message);}configureRecordedVoiceUi();renderStats();renderList();}
  async function refreshManifest(){try{const r=await voiceFetch('./tour-audio.json',{cache:'no-store'});if(r.ok){manifest=await r.json();renderStats();renderList();updateProgress();}}catch{}}
  async function play(){
    if(loading)return;if(!ensureLibrary())return;
    const request=requests.begin();
    if(readyId===currentChapter().id&&audio.src){try{if(!request.isCurrent())return;await audio.play();}catch{if(request.isCurrent())setMessage('浏览器需要你再点一次播放。');}return;}
    const c=currentChapter(),cacheKey=keyFor(c),model=status.model,voiceId=status.voiceId;loading=true;setMessage('');updatePlayer();
    try{let entry=cachedFor(c);if(!entry){if(!status.configured){if(!isRecordedDeployment())$('#voice-dialog').showModal();throw new Error(isRecordedDeployment()?'预录音频清单尚未就绪，请稍后重试或阅读讲稿。':'连接 MiniMax 后即可播放这一章。');}entry=await requestJson('/api/voice/synthesize',{chapterId:c.id,text:narrationText(c),model,voiceId});if(!request.isCurrent())return;entry.textHash=textHashes.get(c.id);localAudio.set(cacheKey,entry);}if(!request.isCurrent())return;
      audio.src=entry.audioUrl;audio.playbackRate=Number($('#tour-rate').value);readyId=c.id;const resume=savedPosition;savedPosition=0;audio.addEventListener('loadedmetadata',()=>{if(request.isCurrent()&&resume>0&&resume<audio.duration-2)audio.currentTime=resume;},{once:true});
      const download=$('#tour-download');download.href=entry.audioUrl;download.download=`同刻-${String(current+1).padStart(2,'0')}-${c.title.replace(/[\\/:*?"<>|]/g,'-')}.mp3`;download.hidden=false;
      if(!request.isCurrent())return;await audio.play();if(!request.isCurrent())return;renderList();renderStats();
    }catch(e){if(request.isCurrent())setMessage(e.message||'语音播放失败，请重试。');}finally{if(request.isCurrent()){loading=false;updatePlayer();}}
  }
  function toggle(){if(!audio.paused&&!audio.ended)audio.pause();else void play();}
  audio.addEventListener('play',()=>{if(!ownsAudio()){audio.pause();return;}document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});updatePlayer();if('mediaSession'in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:currentChapter().title,artist:'同刻 · MiniMax 中文导览',album:'从地球到城市'});}});
  audio.addEventListener('pause',()=>{save();updatePlayer();});audio.addEventListener('timeupdate',updateProgress);audio.addEventListener('loadedmetadata',updateProgress);
  audio.addEventListener('error',()=>{if(readyId){setMessage('音频暂时无法读取，请重新启动同刻后再试。');readyId=null;loading=false;updatePlayer();}});
  audio.addEventListener('ended',()=>{completed.add(currentChapter().id);savedPosition=0;save();renderStats();renderList();if(ownsAudio()&&$('#tour-continuous').checked&&current<chapters.length-1)choose(current+1,true);else{updatePlayer();if(current===chapters.length-1)toast('你已经听到旅程的最后一站。');}});
  $('#tour-play').onclick=toggle;$('#tour-mini-play').onclick=toggle;$('#tour-mini-open').onclick=openLibrary;$('#tour-previous').onclick=()=>choose(current-1,!audio.paused);$('#tour-next').onclick=()=>choose(current+1,!audio.paused);
  $('#tour-from-start').onclick=()=>{choose(0,true);$('#tour-continuous').checked=true;};$('#tour-resume').onclick=()=>void play();
  $('#tour-seek').oninput=()=>{if(Number.isFinite(audio.duration))audio.currentTime=Number($('#tour-seek').value)/1000*audio.duration;};$('#tour-rate').onchange=()=>{audio.playbackRate=Number($('#tour-rate').value);save();};
  $('#tour-search').oninput=()=>{query=$('#tour-search').value.trim().toLowerCase();renderList();};$$('[data-tour-type]').forEach(b=>b.onclick=()=>{type=b.dataset.tourType;$$('[data-tour-type]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderList();});
  $('#voice-settings-open').onclick=()=>{if(isRecordedDeployment())return;$('#voice-error').textContent='';$('#voice-dialog').showModal();};$('#voice-settings-close').onclick=()=>$('#voice-dialog').close();
  $('#voice-save').onclick=async()=>{if(isRecordedDeployment())return;const b=$('#voice-save');b.disabled=true;$('#voice-error').textContent='';try{const apiKey=$('#voice-key').value.trim();if(!apiKey&&$('#voice-region').value===status.region&&$('#voice-model').value===status.model&&$('#voice-id').value===status.voiceId){$('#voice-dialog').close();return;}await requestJson('/api/voice/config',{...(apiKey?{apiKey}:{}),region:$('#voice-region').value,model:$('#voice-model').value,voiceId:$('#voice-id').value});$('#voice-key').value='';requests.invalidate();audio.pause();audio.removeAttribute('src');audio.load();readyId=null;loading=false;savedPosition=0;$('#tour-download').hidden=true;await refreshStatus();window.dispatchEvent(new CustomEvent('timeatlas:voice-settings-changed',{detail:{source:'tour',model:status.model,voiceId:status.voiceId,region:status.region}}));$('#voice-dialog').close();setMessage('');updatePlayer();toast('语音设置已更新。切换音色后，首次播放会重新生成。');}catch(e){$('#voice-error').textContent=e.message;}finally{b.disabled=false;}};
  window.addEventListener('timeatlas:view',e=>{activeView=e.detail.view;if(activeView!=='tour')cancelPreparation();else updatePlayer();syncLocationClock();if(activeView==='tour'&&!atlas)void ensureAtlas();});
  window.addEventListener('timeatlas:tourmode',e=>{libraryActive=e.detail.mode==='library';if(!libraryActive)cancelPreparation();else updatePlayer();syncLocationClock();});
  window.addEventListener('timeatlas:voice-settings-changed',e=>{if(e.detail?.source==='tour')return;cancelPreparation();audio.removeAttribute('src');audio.load();readyId=null;savedPosition=0;$('#tour-download').hidden=true;void refreshStatus();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelPreparation();syncLocationClock();});
  window.addEventListener('timeatlas:citytour',e=>{const i=chapters.findIndex(c=>c.type==='city'&&c.cityId===e.detail.cityId);if(i>=0){openLibrary();choose(i);}});
  window.addEventListener('timeatlas:chaptertour',e=>{const i=chapters.findIndex(c=>c.id===e.detail.chapterId);if(i>=0){openLibrary();choose(i,Boolean(e.detail.autoplay));}});
  function ensureAtlas(){if(atlasPromise)return atlasPromise;atlasPromise=(async()=>{try{atlas=await createGlobe($('#tour-globe'),{cities,onSelectCity:id=>{const i=chapters.findIndex(c=>c.type==='city'&&c.cityId===id);if(i>=0)choose(i);}});atlas.setNight(false);const c=currentChapter();atlas.focusCity(c.cityId?cities.find(x=>x.id===c.cityId):{id:c.id,...c.focus});}catch(e){setMessage(e.message);atlasPromise=null;}})();return atlasPromise;}
  if('mediaSession'in navigator){try{navigator.mediaSession.setActionHandler('play',()=>void play());navigator.mediaSession.setActionHandler('pause',()=>audio.pause());navigator.mediaSession.setActionHandler('nexttrack',()=>choose(Math.min(current+1,chapters.length-1),true));navigator.mediaSession.setActionHandler('previoustrack',()=>choose(Math.max(current-1,0),true));}catch{}}
  window.addEventListener('pagehide',()=>{save();stopLocationClock();});window.addEventListener('pageshow',syncLocationClock);renderChapter();await Promise.all([refreshStatus(),refreshManifest()]);if(activeView==='tour')void ensureAtlas();
  const polling=setInterval(()=>{if(Object.keys(manifest.chapters||{}).length>=chapters.length){clearInterval(polling);return;}void refreshManifest();},15000);
  return {openCity:id=>window.dispatchEvent(new CustomEvent('timeatlas:citytour',{detail:{cityId:id}}))};
}
