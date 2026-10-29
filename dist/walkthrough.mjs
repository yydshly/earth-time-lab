import {voiceFetch,voiceProviderLabel} from './recorded-voice.mjs';
import {walkthroughStops as stops,walkthroughProgressKey,normalizeWalkthroughProgress,nextWalkthroughPosition,matchesWalkthroughCompletion} from './walkthrough-model.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const returnKey='time-atlas-walkthrough-return-v1';

export function initWalkthrough({capture,prepare,play,pause,restore}){
  let progress;try{progress=normalizeWalkthroughProgress(JSON.parse(localStorage.getItem(walkthroughProgressKey)||'null'));}catch{progress=normalizeWalkthroughProgress();}
  let active=false,paused=true,entering=false,generation=0,nextTimer=0,returnState=null,finishedPart=false,storageFailed=false,returnPromise=null,resumable=null,menuScroll=null;
  const entry=document.querySelector('#walkthrough-open');
  const dialog=document.createElement('section');dialog.id='walkthrough-dialog';dialog.hidden=true;dialog.setAttribute('aria-label','完整导览目录');dialog.innerHTML=`<div class="dialog-top"><div><span class="eyebrow">FOLLOW THE EARTH</span><h2>跟着地球，把整个产品看一遍</h2></div><button id="walkthrough-close-menu" aria-label="关闭导览目录">×</button></div><details class="walkthrough-scope"><summary>20 站 · 从当前时间到实际沟通</summary><p>从此刻全球时间开始，串起原因、八节入门课、作息、公告、重置规则、约时间与城市巡游。每段讲完自动继续，可随时暂停、跳过和续看。国家与城市 62 章另有完整连续收听。</p></details><div class="walkthrough-start-actions"><button id="walkthrough-start" class="primary-button">▶ 从头开始完整导览</button><button id="walkthrough-resume" class="secondary-button">继续上次</button></div><p id="walkthrough-summary"></p><nav id="walkthrough-catalog" aria-label="完整导览目录"></nav>`;
  const bar=document.createElement('section');bar.id='walkthrough-bar';bar.hidden=true;bar.setAttribute('aria-label','完整导览播放控制');bar.innerHTML='<div class="walkthrough-current"><small id="walkthrough-position"></small><strong id="walkthrough-title"></strong><span id="walkthrough-status" role="status"></span></div><div class="walkthrough-controls"><button id="walkthrough-prev">← 上一步</button><button id="walkthrough-play" class="walkthrough-primary">Ⅱ 暂停导览</button><button id="walkthrough-next">下一步 →</button><button id="walkthrough-menu">目录</button><button id="walkthrough-exit">退出</button><details class="walkthrough-more"><summary>更多</summary><div><button id="walkthrough-skip">跳过本站</button><label><input id="walkthrough-auto" type="checkbox" checked>讲完自动继续</label></div></details></div><audio id="walkthrough-audio" preload="metadata" hidden></audio>';
  document.body.append(dialog,bar);const $=id=>document.getElementById(id),audio=$('walkthrough-audio');
  const currentStop=()=>stops[progress.stop],currentPart=()=>currentStop().parts[progress.part];
  const playerSelectors={lesson:'#lesson-audio',routine:'#routine-city-audio',live:'.live-voice-audio',human:'#human-audio',reset:'#reset-audio',announcement:'#announcement-audio',common:'#common-case-audio',guide:'#walkthrough-audio'};
  document.body.style.setProperty('--walkthrough-inset','0px');
  function activeView(){return document.querySelector('.view.active')||document.querySelector('main');}
  function pageHead(view){return [...view.children].find(node=>node.matches('.page-heading,.classroom-heading,.tour-mode-switch'));}
  function placeMenu(){const view=activeView(),head=pageHead(view);if(head)head.after(dialog);else view.prepend(dialog);}
  function placeBar(){
    const view=activeView(),player=currentPart().player;
    if(['lesson','routine'].includes(player)){
      const workspace=view.querySelector('.lesson-workspace');if(workspace){workspace.after(bar);return;}
      const lesson=view.querySelector('.planet-lesson');if(lesson){lesson.append(bar);return;}
    }
    if(['live','human','reset','announcement'].includes(player)){
      const earth=view.querySelector('.earth-panel');if(earth){earth.after(bar);return;}
    }
    const head=pageHead(view);if(head)head.after(bar);else view.prepend(bar);
  }
  function closeMenu({restoreScroll=false}={}){dialog.hidden=true;if(restoreScroll&&menuScroll!==null)window.scrollTo({top:menuScroll,behavior:'instant'});}
  function openMenu({scroll=false}={}){if(dialog.hidden)menuScroll=window.scrollY;placeMenu();dialog.hidden=false;if(scroll)dialog.scrollIntoView({block:'start',behavior:'instant'});}

  function save(){try{localStorage.setItem(walkthroughProgressKey,JSON.stringify(progress));}catch{storageFailed=true;}}
  function status(text){$('walkthrough-status').textContent=text+(storageFailed?' · 进度仅本次有效':'');}
  function render(){
    const stop=currentStop(),part=currentPart();$('walkthrough-position').textContent=`完整导览 ${progress.stop+1} / ${stops.length} · ${stop.group}${stop.parts.length>1?` · 第 ${progress.part+1} / ${stop.parts.length} 步`:''}`;
    $('walkthrough-title').textContent=stop.parts.length>1?`${stop.title} · ${part.label}`:stop.title;
    $('walkthrough-prev').disabled=progress.stop===0&&progress.part===0;$('walkthrough-play').textContent=paused?'▶ 继续本站':'Ⅱ 暂停导览';
    $('walkthrough-resume').hidden=!progress.heard.length&&progress.stop===0&&progress.part===0;$('walkthrough-resume').textContent=`▶ ${active?'回到当前站':'继续上次'} · 第 ${progress.stop+1} 站`;
    $('walkthrough-summary').textContent=progress.finished?`路线已走完 · 已完整听完 ${progress.completed.length} / ${stops.length} 站。未听完的站可以从目录补听。`:`已完整听完 ${progress.completed.length} / ${stops.length} 站 · ${active?'点目录可直接跳站':'可以从任何一站开始'}`;
    $('walkthrough-catalog').innerHTML=stops.map((row,index)=>`<button data-walkthrough-stop="${index}" ${active&&index===progress.stop?'aria-current="step"':''}><small>${progress.completed.includes(row.id)?'✓':String(index+1).padStart(2,'0')}</small><span>${esc(row.title)}<small>${esc(row.group)}</small></span></button>`).join('');
    $('walkthrough-catalog').querySelectorAll('button').forEach(button=>button.onclick=()=>void start(Number(button.dataset.walkthroughStop)));
    entry.textContent=progress.finished?'↺ 复习完整导览':progress.heard.length||progress.stop?'▶ 完整导览 · 继续观看':'▶ 跟着地球看一遍';entry.dataset.shortLabel='导览';
  }
  function clearNext(){clearTimeout(nextTimer);nextTimer=0;}
  function stopAudio(){generation++;clearNext();resumable=null;audio.pause();audio.removeAttribute('src');audio.load();pause();}
  function suspend(message='已暂停，继续时从当前句的位置播放。',{keepPosition=false}={}){
    if(!active)return;const currentAudio=document.querySelector(playerSelectors[currentPart().player]);paused=true;entering=false;
    if(keepPosition&&currentAudio?.hasAttribute('src')&&!currentAudio.ended){generation++;clearNext();resumable={element:currentAudio,src:currentAudio.getAttribute('src')};currentAudio.pause();}
    else{stopAudio();delete document.body.dataset.walkthroughPlayer;}
    render();status(message);save();
  }
  async function resume(){
    if(resumable?.element.isConnected&&resumable.src===resumable.element.getAttribute('src')){const element=resumable.element;resumable=null;paused=false;render();try{await element.play();status(currentStop().goal+' · 正在讲解');}catch{suspend('请点继续本站重试，或手动下一步。');}}
    else await enter();
  }
  async function json(url,options){const response=await voiceFetch(url,options);const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'语音暂时无法读取');return data;}
  async function playGuide(part,token){
    const config=await json('/api/voice/status');if(token!==generation)return;if(!config.configured)throw new Error('MiniMax 尚未连接，可以阅读画面并手动继续。');
    const clip=await json('/api/voice/synthesize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chapterId:`walkthrough-${currentStop().id}`,text:part.text,model:config.model,voiceId:config.voiceId})});
    if(token!==generation||paused||!active)return;audio.src=clip.audioUrl;await audio.play();if(token===generation)status(part.text);
  }
  async function enter(){
    stopAudio();const token=generation;entering=true;paused=false;finishedPart=false;progress.finished=false;document.body.dataset.walkthroughPlayer=currentPart().player;document.body.dataset.walkthroughStop=currentStop().id;bar.querySelector('.walkthrough-more').open=false;render();status('正在带你到这一站…');save();
    try{
      await prepare(currentStop(),currentPart());if(token!==generation||!active||paused)return;placeBar();
      entering=false;status(currentStop().goal);
      if(currentPart().player==='guide')await playGuide(currentPart(),token);else{const config=await json('/api/voice/status');if(token!==generation||!active||paused)return;if(!config.configured)throw new Error('MiniMax 尚未连接，可以阅读画面并手动继续。');await play(currentPart().player);}
      if(token===generation&&active&&!paused)status(currentStop().goal+' · 正在讲解');
    }catch(error){if(token===generation){paused=true;entering=false;render();status(`${error.message} 可点“继续本站”重试，或下一步。`);}}
  }
  async function start(index){
    if(returnPromise)await returnPromise;
    closeMenu();
    if(!active){try{const saved=JSON.parse(sessionStorage.getItem(returnKey)||'null');returnState=saved?.navigation?.route?saved:null;}catch{}if(!returnState){returnState=capture();if(menuScroll!==null)returnState.scrollY=menuScroll;try{sessionStorage.setItem(returnKey,JSON.stringify(returnState));}catch{}}active=true;bar.hidden=false;document.body.classList.add('walkthrough-active');}
    if(Number.isInteger(index))progress={...normalizeWalkthroughProgress({...progress,stop:index,part:0}),finished:false};
    await enter();
  }
  async function restoreReturn(){
    if(returnPromise)return returnPromise;const backup=returnState;returnState=null;entry.disabled=true;
    returnPromise=(async()=>{try{await restore(backup);try{sessionStorage.removeItem(returnKey);}catch{}}catch(error){returnState=backup;$('walkthrough-summary').textContent=`原页面尚未恢复：${error.message}。你的原输入快照仍保留在本次会话。`;}finally{entry.disabled=false;returnPromise=null;}})();
    return returnPromise;
  }
  async function finish(){
    stopAudio();active=false;paused=true;entering=false;progress.finished=true;save();bar.hidden=true;document.body.classList.remove('walkthrough-active');delete document.body.dataset.walkthroughPlayer;document.body.style.setProperty('--walkthrough-inset','0px');
    await restoreReturn();render();if(!active)openMenu({scroll:true});
  }
  async function advance(options={}){if(!active)return;const next=nextWalkthroughPosition(progress,options);if(next.finished&&!options.back){await finish();return;}progress=next;await enter();}
  function complete(type,detail={}){
    if(!active||paused||entering||finishedPart||!matchesWalkthroughCompletion(currentStop(),currentPart(),type,detail))return;
    finishedPart=true;const key=`${currentStop().id}:${progress.part}`;if(!progress.heard.includes(key))progress.heard.push(key);
    if(currentStop().parts.every((_,index)=>progress.heard.includes(`${currentStop().id}:${index}`))&&!progress.completed.includes(currentStop().id))progress.completed.push(currentStop().id);
    save();render();status('本步已讲完。'+($('walkthrough-auto').checked?'稍后自动继续；也可以先暂停。':'点击“下一步”继续。'));
    if($('walkthrough-auto').checked){const token=generation;nextTimer=setTimeout(()=>{if(active&&!paused&&token===generation)void advance();},2200);}
  }
  for(const [event,type]of [['live-voice-complete','live'],['human-voice-ended','human'],['lesson-voice-ended','lesson'],['routine-voice-ended','routine'],['announcement-voice-ended','announcement'],['reset-voice-ended','reset'],['common-voice-ended','common']])window.addEventListener('timeatlas:'+event,e=>complete(type,e.detail));
  audio.addEventListener('ended',()=>complete('guide'));
  audio.addEventListener('error',()=>{if(active&&currentPart().player==='guide'&&audio.hasAttribute('src'))suspend('语音未能加载，可继续本站重试或手动下一步。');});
  $('walkthrough-play').onclick=()=>{if(paused)void resume();else suspend(undefined,{keepPosition:true});};$('walkthrough-next').onclick=()=>void advance();$('walkthrough-prev').onclick=()=>void advance({back:true});$('walkthrough-skip').onclick=()=>void advance({skipStop:true});
  $('walkthrough-auto').onchange=()=>{clearNext();if($('walkthrough-auto').checked&&finishedPart&&!paused){const token=generation;nextTimer=setTimeout(()=>{if(active&&!paused&&token===generation)void advance();},2200);}};
  function menu(){if(active)suspend('目录已打开，选择一站或继续观看。');render();openMenu({scroll:true});}
  entry.onclick=menu;document.querySelectorAll('[data-walkthrough-open]').forEach(button=>button.onclick=menu);$('walkthrough-menu').onclick=menu;$('walkthrough-close-menu').onclick=()=>closeMenu({restoreScroll:true});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeMenu({restoreScroll:true});entry.focus({preventScroll:true});}});
  $('walkthrough-start').onclick=()=>{progress=normalizeWalkthroughProgress();void start(0);};$('walkthrough-resume').onclick=()=>void start();
  $('walkthrough-exit').onclick=async()=>{if(!active)return;active=false;paused=true;stopAudio();bar.hidden=true;document.body.classList.remove('walkthrough-active');delete document.body.dataset.walkthroughPlayer;document.body.style.setProperty('--walkthrough-inset','0px');save();await restoreReturn();render();};
  window.addEventListener('timeatlas:view',()=>{if(active&&!entering)suspend('已切换页面，导览暂停；继续本站会回到刚才的位置。');if(!entering){if(active)placeBar();if(!dialog.hidden)placeMenu();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)suspend('已暂停，回来后可以继续本站。',{keepPosition:true});});
  document.addEventListener('pause',e=>{if(active&&!paused&&!entering&&e.target?.matches?.(playerSelectors[currentPart().player])&&e.target.hasAttribute('src')&&!e.target.ended)suspend('已暂停，继续时从当前句的位置播放。',{keepPosition:true});},true);
  document.addEventListener('error',e=>{const selectors={lesson:'#lesson-audio',routine:'#routine-city-audio',live:'.live-voice-audio',human:'#human-audio',reset:'#reset-audio',announcement:'#announcement-audio',common:'#common-case-audio'};if(active&&!paused&&!entering&&e.target?.matches?.(selectors[currentPart().player]||'audio#walkthrough-audio'))suspend('本段音频未能加载，可继续本站重试，或手动下一步。');},true);
  window.addEventListener('timeatlas:lesson-voice-state',e=>{if(active&&!paused&&!entering&&currentPart().player==='lesson'&&e.detail.lessonId===currentPart().route.lesson&&e.detail.step===currentPart().route.step&&e.detail.error){const token=generation;queueMicrotask(()=>{if(token===generation&&!paused)suspend(e.detail.error+' 可继续本站重试。');});}});
  document.addEventListener('change',e=>{if(e.isTrusted&&active&&!entering&&!bar.contains(e.target)&&!dialog.contains(e.target))suspend('已保留当前操作，自动导览暂停；可继续本站或下一步。');});
  window.addEventListener('pagehide',save);render();return {get active(){return active;},pause:suspend};
}
