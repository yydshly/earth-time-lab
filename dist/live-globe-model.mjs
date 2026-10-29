import {dayPhase} from './local-time-reference.mjs';

// These are representative cities, not a claim of one clock per continent.
export const primaryLiveRegions=Object.freeze(['beijing','pt','et','london','india','japan','sydney','dubai','east-africa','sao-paulo']);

// A regional overview shows neighboring clocks, rather than centering each
// selected city so tightly that its neighbors disappear around the horizon.
export function liveOverviewFocus(region){
  if(region.lon< -30)return {lat:10,lon:-85};
  if(region.lon<60)return {lat:15,lon:25};
  return {lat:10,lon:110};
}

export function liveGlobeClocks(rows,selectedId,view='overview'){
  const selected=rows.find(row=>row.id===selectedId);
  const regionIds=view==='compare'?new Set(['beijing',selectedId]):new Set([...primaryLiveRegions,selectedId]);
  const clocks=rows.filter(row=>regionIds.has(row.id)&&row.cityId).map(row=>({
    id:row.cityId,
    name:row.id==='beijing'?'北京 · 我们这里':`${row.city} · ${row.id==='pt'?'PT':row.id==='et'?'ET':row.variant}`,
    headline:row.local.time,
    detail:`当地${dayPhase(row.local).label}\n${row.local.date} · ${row.variant}`,
    selected:row.id===selectedId,
    priority:row.id===selectedId?100:row.id==='beijing'?80:20,
  }));
  const annotations=selected&&!selected.cityId&&selected.id!=='utc'?[{
    lat:selected.lat,lon:selected.lon,text:`${selected.city} · ${selected.short} ${selected.local.time}`,
    detail:`当地${dayPhase(selected.local).label}\n${selected.local.date} · ${selected.variant}`,
  }]:[];
  return {clocks,annotations};
}

export function liveRegionForCity(rows,cityId){return rows.find(row=>row.cityId===cityId)?.id||null;}
