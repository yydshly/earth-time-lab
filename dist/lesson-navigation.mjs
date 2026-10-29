import {globeLessons} from './globe-lessons-data.mjs';
import {routineProfiles} from './routine-atlas-data.mjs';
import {zonedToInstants} from './time-engine.mjs';

function transitionNavigation(stage,value,instant){
  const phase=value?.transitionPhase;
  if(!stage.transition||!['before','gap','after'].includes(phase))return {};
  const expected=stage.transition[phase==='after'?'afterInstant':'beforeInstant'];
  return Date.parse(instant)===Date.parse(expected)?{transitionPhase:phase}:{};
}

/** Own both delayed scene writes and restoration's notification suppression. */
export function createLessonRestoreGuard(){
  let generation=0,activeGeneration=null;
  return {
    begin(){
      const claimed=++generation;activeGeneration=claimed;
      return {
        isCurrent:()=>claimed===generation&&activeGeneration===claimed,
        finish(){if(activeGeneration===claimed)activeGeneration=null;},
      };
    },
    invalidate(){generation++;activeGeneration=null;},
    get active(){return activeGeneration!==null;},
  };
}

/** Accept a complete persisted classroom location without inventing a clock instant. */
export function normalizeLessonNavigation(value){
  if(!value||typeof value!=='object'||!['classroom','library'].includes(value.mode))return null;
  const lessonIndex=globeLessons.findIndex(lesson=>lesson.id===value.lessonId);
  if(lessonIndex<0)return null;
  const lesson=globeLessons[lessonIndex];
  if(!Number.isInteger(value.step)||value.step<0||value.step>=lesson.stages.length)return null;
  if(typeof value.instant!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.instant))return null;
  const at=new Date(value.instant);
  if(!Number.isFinite(at.getTime()))return null;
  try{zonedToInstants(value.instant.slice(0,10),value.instant.slice(11,16),'UTC');}catch{return null;}
  const stage=lesson.stages[value.step];
  if(stage.dayCycle){
    const elapsed=(at-new Date(stage.instant))/60000;
    if(elapsed<0||elapsed>1440)return null;
  }
  let routineCityId;
  if(value.routineCityId!==undefined){
    if(!routineProfiles.some(profile=>profile.cityId===value.routineCityId))return null;
    routineCityId=value.routineCityId;
  }
  const timeKind=lesson.mode==='routines'&&value.timeKind==='manual'?'manual':'example';
  return {mode:value.mode,lessonId:lesson.id,lessonIndex,step:value.step,instant:at.toISOString(),timeKind,...(routineCityId?{routineCityId}:{}),...transitionNavigation(stage,value,at.toISOString())};
}

/** The atlas and the main classroom share a renderer, but own separate places. */
export function lessonNavigationForRoute(route,snapshot={},current){
  const routines=route.view==='routines',saved=routines?snapshot?.routineCourse:snapshot?.course;
  const previous=saved||(!routines&&current&&globeLessons.find(l=>l.id===current.lessonId)?.mode!=='routines'?current:{});
  const lesson=(routines?globeLessons.find(l=>l.mode==='routines'):globeLessons.find(l=>l.id===route.lesson)||globeLessons.find(l=>l.id===previous.lessonId))||globeLessons[0];
  const requested=route.step??(previous.lessonId===lesson.id?previous.step:0),step=Number.isInteger(requested)&&lesson.stages[requested]?requested:0;
  const same=previous.lessonId===lesson.id&&previous.step===step;
  return {mode:route.mode||'classroom',lessonId:lesson.id,step,instant:same?previous.instant:lesson.stages[step].instant,timeKind:same?previous.timeKind:'example',...(lesson.mode==='routines'&&previous.routineCityId?{routineCityId:previous.routineCityId}:{}),...(same?transitionNavigation(lesson.stages[step],previous,previous.instant):{})};
}
