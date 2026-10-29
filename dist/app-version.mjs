import {observeAppVersion} from './app-version-model.mjs';

/** Loaded once after application initialization. Never reloads automatically. */
export function initAppVersionNotice({beforeReload,onReload=()=>location.reload()}={}){
  const element=document.createElement('section');element.className='app-version-notice';element.hidden=true;
  element.setAttribute('role','status');element.setAttribute('aria-live','polite');element.setAttribute('aria-label','应用版本更新');
  const message=document.createElement('p');message.textContent='有新版本，可刷新使用最新功能。';
  const reload=document.createElement('button');reload.type='button';reload.textContent='保留当前页面设置后刷新';
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='app-version-dismiss';dismiss.textContent='稍后';
  const detail=document.createElement('small');detail.hidden=true;element.append(message,reload,dismiss,detail);(document.querySelector('main')||document.body).prepend(element);
  const badge=document.createElement('span');badge.className='app-version-badge';badge.hidden=true;document.querySelector('footer')?.append(badge);
  let state=observeAppVersion(),dismissedVersion=null,pending=null,disposed=false,lastCheck=0;
  function render(){
    if(disposed)return;
    element.hidden=!state.updateAvailable||dismissedVersion===state.availableVersion;
    if(state.loadedVersion){badge.hidden=false;badge.textContent=`页面版本 ${state.loadedVersion.slice(0,6)}`;badge.title=`当前页面载入版本：${state.loadedVersion}`;}
  }
  async function check({force=true}={}){
    if(disposed)return {...state};
    if(pending)return pending;
    if(!force&&(document.hidden||Date.now()-lastCheck<5000))return {...state};
    lastCheck=Date.now();
    pending=(async()=>{
      try{
        const response=await fetch('/api/app-version',{cache:'no-store',headers:{accept:'application/json'}});
        if(!response.ok)return {...state};
        const data=await response.json();if(disposed)return {...state};state=observeAppVersion(state,data);render();
      }catch{/* A local service restart or offline moment is not a new release. */}
      return {...state};
    })().finally(()=>{pending=null;});
    return pending;
  }
  reload.addEventListener('click',async()=>{
    if(reload.disabled)return;reload.disabled=true;detail.hidden=true;
    try{
      const saved=await beforeReload?.();if(disposed)return;
      if(saved===false){detail.textContent='当前页面设置未能保存，暂未刷新。请先保留正在填写的内容后再试。';detail.hidden=false;return;}
      await onReload();
    }catch{detail.textContent='未能保存当前页面设置，暂未刷新。请保留正在填写的内容后再试。';detail.hidden=false;}
    finally{if(!disposed)reload.disabled=false;}
  });
  dismiss.addEventListener('click',()=>{dismissedVersion=state.availableVersion;element.hidden=true;});
  const onFocus=()=>void check({force:false}),onVisibility=()=>{if(!document.hidden)void check({force:false});};
  window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onVisibility);
  const timer=setInterval(()=>void check({force:false}),60000);void check();
  return {check,getState:()=>({...state}),destroy(){disposed=true;clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisibility);element.remove();badge.remove();}};
}
