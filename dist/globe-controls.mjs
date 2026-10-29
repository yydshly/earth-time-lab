/** Controls shared by exploration and narration. */
export function attachGlobeControls(canvas,api,initial){
 const card=canvas.closest('[data-globe-card]');
 if(!card)return {update(){},destroy(){}};
 const toolbar=card.querySelector('[data-globe-toolbar]');
 const isTour=canvas.id==='tour-globe';
 toolbar.innerHTML=`<div class="globe-style-switch" aria-label="地球外观"><button data-globe-style="realistic">真实地表</button><button data-globe-style="atlas">简约地图</button></div><div class="globe-layer-switch"><button data-globe-action="labels">城市</button><button data-globe-action="grid">经纬线</button>${isTour?'<button data-globe-action="night">昼夜</button>':''}<button data-globe-action="rotate">自转</button></div><div class="globe-view-switch"><button data-globe-action="out" aria-label="缩小地球">−</button><span data-globe-zoom aria-label="地球放大比例"></span><button data-globe-action="in" aria-label="放大地球">＋</button><button data-globe-action="reset">复位</button><button data-globe-action="expand" aria-expanded="false">放大查看</button></div>`;
 let state=initial,expanded=false,oldOverflow='',returnFocus=null;
 function update(next){
   state=next;canvas.dataset.renderer=next.renderer;canvas.dataset.globeStyle=next.style;canvas.dataset.zoom=String(next.zoom);card.dataset.globeStyle=next.style;
   toolbar.querySelectorAll('[data-globe-style]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.globeStyle===next.style));b.disabled=next.renderer!=='webgl';});
   const states={labels:next.labels,grid:next.grid,night:next.night,rotate:next.autoRotate};
   for(const [id,value]of Object.entries(states)){const b=toolbar.querySelector(`[data-globe-action="${id}"]`);if(b){b.setAttribute('aria-pressed',String(value));b.disabled=next.renderer!=='webgl';}}
   toolbar.querySelector('[data-globe-zoom]').textContent=`${Math.round(next.zoom*100)}%`;
   toolbar.querySelector('[data-globe-action="out"]').disabled=next.renderer!=='webgl'||next.zoom<=1.005;
   toolbar.querySelector('[data-globe-action="in"]').disabled=next.renderer!=='webgl'||next.zoom>=1.745;
   const night=card.querySelector('#night-toggle');if(night)night.checked=next.night;
   const status=card.querySelector('[data-globe-caption]');if(status)status.textContent=next.renderer==='webgl'?(next.style==='realistic'?'NASA 地表合成影像 · 非实时':'Natural Earth · 简约地理底图'):'兼容视图 · 当前环境不支持三维渲染';
 }
 function expand(value){
   if(value===expanded)return;expanded=value;
   const b=toolbar.querySelector('[data-globe-action="expand"]');b.textContent=value?'退出放大':'放大查看';b.setAttribute('aria-expanded',String(value));card.classList.toggle('globe-expanded',value);
   if(value){returnFocus=document.activeElement;oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label','地球放大视图');b.focus();}
   else{document.body.style.overflow=oldOverflow;card.removeAttribute('role');card.removeAttribute('aria-modal');card.removeAttribute('aria-label');returnFocus?.focus();}
 }
 function key(e){
   if(!expanded)return;
   if(e.key==='Escape'){e.preventDefault();expand(false);return;}
   if(e.key==='Tab'){const list=[...card.querySelectorAll('button:not(:disabled),input:not(:disabled),canvas[tabindex]')].filter(el=>el.getClientRects().length&&!el.hidden),first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }
 toolbar.querySelectorAll('[data-globe-style]').forEach(b=>b.onclick=async()=>{b.disabled=true;let failure='';try{await api.setStyle(b.dataset.globeStyle);}catch(error){failure=error.message;}finally{update(api.getState());if(failure){const note=card.querySelector('[data-globe-caption]');if(note){note.setAttribute('role','status');note.textContent=failure;}}}});
 toolbar.querySelectorAll('[data-globe-action]').forEach(b=>b.onclick=()=>{
   const a=b.dataset.globeAction;
   if(a==='labels')api.setLabels(!state.labels);if(a==='grid')api.setGrid(!state.grid);if(a==='night')api.setNight(!state.night);if(a==='rotate')api.setAutoRotate(!state.autoRotate);
   if(a==='out')api.zoomBy(1/1.16);if(a==='in')api.zoomBy(1.16);if(a==='reset')api.resetView();if(a==='expand')expand(!expanded);
 });
 document.addEventListener('keydown',key);
 const onView=()=>{if(expanded)expand(false);};window.addEventListener('timeatlas:view',onView);update(initial);
 return {update,destroy(){expand(false);document.removeEventListener('keydown',key);window.removeEventListener('timeatlas:view',onView);toolbar.innerHTML='';}};
}
