const views=new Set(['explore','tour','routines','learn','planner','phrases']);
const exploreModes=new Set(['live','human','manual','reset']);
const theoryTopics=new Set(['read-time','one-moment','utc','zones','dst','date-line','communicate']);
const safeId=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,70}$/.test(value)?value:undefined;
const step=value=>Number.isInteger(Number(value))&&String(value)!==''&&Number(value)>=0&&Number(value)<100?Number(value):undefined;

export function normalizeRoute(value={}){
  const view=views.has(value.view)?value.view:'explore',result={view};
  if(view==='explore'){
    result.mode=exploreModes.has(value.mode)?value.mode:'live';
    if(result.mode==='live'&&safeId(value.region))result.region=safeId(value.region);
    if(result.mode==='human'&&step(value.step)!==undefined&&step(value.step)<5)result.step=step(value.step);
    if(result.mode==='reset'&&['announcement','daily','window','rolling','billing'].includes(value.type))result.type=value.type;
  }else if(view==='tour'||view==='routines'){
    result.mode=view==='routines'?'classroom':value.mode==='library'?'library':'classroom';
    if(safeId(value.lesson))result.lesson=safeId(value.lesson);
    if(step(value.step)!==undefined)result.step=step(value.step);
  }else if(view==='learn'&&theoryTopics.has(value.topic)){
    result.topic=value.topic;
  }
  return result;
}

export function routeFromHash(hash=''){
  const [path,query='']=String(hash).replace(/^#/,'').split('?',2),params=new URLSearchParams(query);
  return normalizeRoute({view:path,mode:params.get('mode'),region:params.get('region'),type:params.get('type'),lesson:params.get('lesson'),step:params.has('step')?params.get('step'):undefined,topic:params.get('topic')});
}

export function routeToHash(value){
  const route=normalizeRoute(value),params=new URLSearchParams();
  for(const key of ['mode','region','type','lesson','step','topic'])if(route[key]!==undefined)params.set(key,String(route[key]));
  return '#'+route.view+(params.size?'?'+params:'');
}

export const navigationStorageKey='time-atlas-navigation-v1';
const navigationModules=['live','human','reset','course','routineCourse','common','manual','planner','theory'];

/** Keep inactive modules until their saved state has actually been loaded. */
export function mergeNavigationSnapshot(previous,current,hydratedModules){
  const result={...current};
  for(const name of navigationModules){
    if(!hydratedModules.has(name)&&previous?.[name]!==undefined)result[name]=previous[name];
  }
  return result;
}

export function readNavigationState(storage){
  try{const raw=storage.getItem(navigationStorageKey);if(!raw||raw.length>150000)return null;const value=JSON.parse(raw);return value?.version===1&&value.route&&typeof value.route==='object'?value:null;}catch{return null;}
}
export function writeNavigationState(storage,value){
  try{storage.setItem(navigationStorageKey,JSON.stringify({...value,version:1,route:normalizeRoute(value.route)}));return true;}catch{return false;}
}
