import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLessonNavigation,createLessonRestoreGuard} from '../dist/lesson-navigation.mjs';
import {globeLessons} from '../dist/globe-lessons-data.mjs';

const initial=()=>({mode:'classroom',lessonId:globeLessons[0].id,step:1,instant:globeLessons[0].stages[1].instant});
test('navigation keeps the exact selected lesson, scene, and explicit instant',()=>{
  const input={...initial(),instant:'2026-10-28T20:13:00+08:00'};
  const state=normalizeLessonNavigation(input);
  assert.equal(state.lessonId,input.lessonId);assert.equal(state.step,1);
  assert.equal(state.instant,'2026-10-28T12:13:00.000Z');assert.equal(state.mode,'classroom');
  assert.equal(normalizeLessonNavigation({...input,mode:'library'}).mode,'library');
});
test('navigation rejects unknown lessons, scenes, locations, and unqualified clocks',()=>{
  for(const invalid of [{mode:'other'},{lessonId:'removed'},{step:-1},{step:99},{step:1.5},{instant:'2026-10-28T20:13'},{instant:'2026-02-30T20:13:00Z'},{routineCityId:'unknown'}]){
    assert.equal(normalizeLessonNavigation({...initial(),...invalid}),null,JSON.stringify(invalid));
  }
});
test('a saved day demonstration stays within its defined 24-hour cycle',()=>{
  const lesson=globeLessons.find(l=>l.stages.some(s=>s.dayCycle)),step=lesson.stages.findIndex(s=>s.dayCycle),start=new Date(lesson.stages[step].instant);
  const nav={mode:'classroom',lessonId:lesson.id,step,instant:new Date(+start+9*3600000).toISOString()};
  assert.equal(normalizeLessonNavigation(nav).instant,nav.instant);
  assert.equal(normalizeLessonNavigation({...nav,instant:new Date(+start+24*3600000).toISOString()}).instant,new Date(+start+24*3600000).toISOString());
  assert.equal(normalizeLessonNavigation({...nav,instant:new Date(+start-1).toISOString()}),null);
  assert.equal(normalizeLessonNavigation({...nav,instant:new Date(+start+24*3600000+1).toISOString()}),null);
});
test('a routine lesson can restore an explicitly selected supported city',()=>{
  const lesson=globeLessons.find(l=>l.mode==='routines');
  const nav={mode:'classroom',lessonId:lesson.id,step:2,instant:lesson.stages[2].instant,routineCityId:'tokyo'};
  assert.equal(normalizeLessonNavigation(nav).routineCityId,'tokyo');
  assert.equal(normalizeLessonNavigation(nav).timeKind,'example');
  assert.equal(normalizeLessonNavigation({...nav,timeKind:'manual',instant:'2026-10-28T13:00:00Z'}).timeKind,'manual');
  assert.equal(normalizeLessonNavigation({...initial(),timeKind:'manual'}).timeKind,'example');
});

test('an older scene load cannot overwrite the newer restored instant',async()=>{
  const guard=createLessonRestoreGuard();let resolveOld,instant='initial';
  const delayed=new Promise(resolve=>{resolveOld=resolve;});
  const old=guard.begin();
  const oldRestore=(async()=>{try{await delayed;if(old.isCurrent())instant='old lesson';}finally{old.finish();}})();
  const recent=guard.begin();instant='new routine';recent.finish();
  resolveOld();await oldRestore;
  assert.equal(instant,'new routine');assert.equal(guard.active,false);
});

test('the old restore finally cannot unblock notifications owned by a pending new restore',()=>{
  const guard=createLessonRestoreGuard(),old=guard.begin(),recent=guard.begin();
  old.finish();
  assert.equal(old.isCurrent(),false);assert.equal(recent.isCurrent(),true);assert.equal(guard.active,true);
  recent.finish();assert.equal(guard.active,false);
});

test('normal navigation or a scene interaction cancels delayed saved-state writes',async()=>{
  const guard=createLessonRestoreGuard();let resolveLoad,instant='loading scene';
  const loading=new Promise(resolve=>{resolveLoad=resolve;}),request=guard.begin();
  const restoring=(async()=>{try{await loading;if(request.isCurrent())instant='saved clock';}finally{request.finish();}})();
  guard.invalidate();instant='user selected clock';
  assert.equal(guard.active,false);
  resolveLoad();await restoring;
  assert.equal(instant,'user selected clock');
  const next=guard.begin();request.finish();assert.equal(next.isCurrent(),true);next.finish();
});
import {lessonNavigationForRoute} from '../dist/lesson-navigation.mjs';

test('world routines and the main lesson retain independent positions',()=>{
  const course={mode:'classroom',lessonId:'clock-reading',step:1,instant:'2026-10-28T04:00:00.000Z',timeKind:'example'};
  const routineCourse={mode:'classroom',lessonId:'daily-rhythms',step:2,instant:'2026-10-28T12:30:00.000Z',timeKind:'manual',routineCityId:'la'};
  const snapshot={course,routineCourse};
  assert.deepEqual(lessonNavigationForRoute({view:'tour',mode:'classroom'},snapshot,routineCourse),course);
  assert.deepEqual(lessonNavigationForRoute({view:'routines',mode:'classroom'},snapshot,course),routineCourse);
  const initial=lessonNavigationForRoute({view:'tour',mode:'classroom'},{},routineCourse);
  assert.equal(initial.lessonId,'clock-reading');assert.equal(initial.step,0);
});

test('the nonexistent local-hour explanation preserves its position without inventing an instant',()=>{
  const lesson=globeLessons.find(l=>l.stages.some(s=>s.transition)),step=lesson.stages.findIndex(s=>s.transition),stage=lesson.stages[step];
  const saved={mode:'classroom',lessonId:lesson.id,step,instant:stage.transition.beforeInstant,timeKind:'example',transitionPhase:'gap'};
  assert.equal(normalizeLessonNavigation(saved).transitionPhase,'gap');
  assert.equal(lessonNavigationForRoute({view:'tour',mode:'classroom'},{course:saved}).transitionPhase,'gap');
  assert.equal(normalizeLessonNavigation({...saved,instant:stage.transition.afterInstant}).transitionPhase,undefined);
  assert.equal(normalizeLessonNavigation({...saved,transitionPhase:'unknown'}).transitionPhase,undefined);
  assert.equal(normalizeLessonNavigation({...initial(),transitionPhase:'gap'}).transitionPhase,undefined);
});
