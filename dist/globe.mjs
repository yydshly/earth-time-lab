import {attachGlobeControls} from './globe-controls.mjs';
export async function createGlobe(canvas,options={}){
 let ui,api,lastState;
 const onStateChange=state=>{lastState=state;ui?.update(state);options.onStateChange?.(state);};
 try{
   const {createGlobe3D}=await import('./globe-3d.mjs');
   api=await createGlobe3D(canvas,{...options,onStateChange});
 }catch(error){
   console.warn('三维地球暂不可用，已切换兼容视图。');
   const replacement=canvas.cloneNode(false);canvas.parentElement.querySelector('.globe-label-layer')?.remove();canvas.parentElement.querySelector('.globe-annotation-layer')?.remove();canvas.replaceWith(replacement);canvas=replacement;
   const {createGlobe:createCanvasGlobe}=await import('./globe-canvas.mjs');
   let state={style:'atlas',night:true,grid:true,labels:true,autoRotate:false,dayView:false,zoom:1,renderer:'canvas'};
   const fallback=await createCanvasGlobe(canvas,{...options,onStateChange:update=>{state={...state,...update};onStateChange({...state});}});
   api={...fallback,getState:()=>({...state}),setStyle(){},setGrid(value){fallback.setGrid(value);state.grid=Boolean(value);onStateChange({...state});},setLabels(value){fallback.setLabels(value);state.labels=Boolean(value);onStateChange({...state});},setAutoRotate(){},zoomBy(){},resetView(){fallback.focusCity({lat:20,lon:65});},setNight(value){fallback.setNight(value);state.night=Boolean(value);onStateChange({...state});}};
 }
 ui=attachGlobeControls(canvas,api,api.getState?.()||lastState);
 const destroy=api.destroy.bind(api);api.destroy=()=>{ui?.destroy();destroy();};
 return api;
}
