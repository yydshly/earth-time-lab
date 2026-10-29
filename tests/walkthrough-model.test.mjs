import test from 'node:test';
import assert from 'node:assert/strict';
import {walkthroughStops,normalizeWalkthroughProgress,nextWalkthroughPosition,matchesWalkthroughCompletion} from '../dist/walkthrough-model.mjs';
import {globeLessons} from '../dist/globe-lessons-data.mjs';
import {humanTimeSteps} from '../dist/human-time-data.mjs';
import {normalizeRoute,routeFromHash,routeToHash} from '../dist/navigation-state.mjs';

const stopIndex=id=>walkthroughStops.findIndex(stop=>stop.id===id);
const partAt=(id,part=0)=>walkthroughStops[stopIndex(id)].parts[part];

test('the feature walkthrough reaches each real tool and preserves routable links for resume',()=>{
  assert.equal(new Set(walkthroughStops.map(stop=>stop.id)).size,walkthroughStops.length);
  for(const id of ['live','human','daily-rhythms','manual','knowledge','announcement','reset-daily','reset-window','reset-rolling','reset-billing','common','planner','library'])assert.ok(stopIndex(id)>=0,`Missing capability: ${id}`);
  assert.equal(partAt('library').route.mode,'library');
  assert.equal(partAt('planner').route.view,'planner');
  assert.equal(partAt('announcement').setup,'announcement');
  for(const stop of walkthroughStops){
    assert.ok(stop.title&&stop.goal&&stop.parts.length,stop.id);
    for(const part of stop.parts){
      assert.deepEqual(normalizeRoute(part.route),part.route,`${stop.id}: unsupported route field`);
      assert.deepEqual(routeFromHash(routeToHash(part.route)),part.route,`${stop.id}: lost resume location`);
      if(part.player==='guide')assert.ok(part.text?.length>0,`${stop.id}: narration absent`);
    }
  }
});

test('the guided foundation uses valid current lesson scenes and all five cause-and-effect steps',()=>{
  const human=walkthroughStops[stopIndex('human')];
  assert.deepEqual(human.parts.map(part=>part.route.step),humanTimeSteps.map((_,index)=>index));
  for(const lesson of globeLessons){
    const stop=walkthroughStops[stopIndex(lesson.id)];assert.ok(stop,`Missing lesson ${lesson.id}`);
    const steps=stop.parts.map(part=>part.route.step);
    assert.ok(steps.every(index=>lesson.stages[index]),`Invalid scene in ${lesson.id}`);
    if(lesson.mode!=='routines')assert.deepEqual(steps,lesson.stages.map((_,index)=>index));
    else assert.equal(stop.parts[0].player,'routine');
  }
});

test('following next visits every narrated part exactly once before reaching the end',()=>{
  let progress=normalizeWalkthroughProgress();const visited=[];
  for(let safety=0;safety<200;safety++){
    visited.push(`${walkthroughStops[progress.stop].id}:${progress.part}`);
    progress=nextWalkthroughPosition(progress);if(progress.finished)break;
  }
  const expected=walkthroughStops.flatMap(stop=>stop.parts.map((_,index)=>`${stop.id}:${index}`));
  assert.deepEqual(visited,expected);assert.equal(progress.finished,true);
  assert.equal(progress.stop,walkthroughStops.length-1);
  assert.deepEqual(progress.completed,[]);assert.deepEqual(progress.heard,[]);
});

test('previous crosses a real course boundary and stays at the beginning when already there',()=>{
  const current=stopIndex('calculate-time'),previous=walkthroughStops[current-1];
  const back=nextWalkthroughPosition({version:1,stop:current,part:0},{back:true});
  assert.equal(back.stop,current-1);assert.equal(back.part,previous.parts.length-1);
  const forward=nextWalkthroughPosition(back);assert.equal(forward.stop,current);assert.equal(forward.part,0);
  const first=normalizeWalkthroughProgress(),stayed=nextWalkthroughPosition(first,{back:true});
  assert.equal(stayed.stop,0);assert.equal(stayed.part,0);assert.deepEqual(stayed.heard,[]);assert.deepEqual(stayed.completed,[]);assert.equal(Boolean(stayed.finished),false);
});

test('skipping a multi-part station goes to the next station without claiming it was heard',()=>{
  const progress=normalizeWalkthroughProgress({version:1,stop:stopIndex('human'),part:2,heard:['live:0','human:0'],completed:['live']});
  const before=structuredClone(progress),next=nextWalkthroughPosition(progress,{skipStop:true});
  assert.equal(walkthroughStops[next.stop].id,'clock-reading');assert.equal(next.part,0);
  assert.deepEqual(next.heard,before.heard);assert.deepEqual(next.completed,['live']);assert.deepEqual(progress,before);
  const last=normalizeWalkthroughProgress({version:1,stop:walkthroughStops.length-1,part:0});
  assert.equal(nextWalkthroughPosition(last,{skipStop:true}).finished,true);
});

test('resume tolerates corrupt or obsolete progress without retaining unknown completion claims',()=>{
  assert.deepEqual(normalizeWalkthroughProgress({version:0,stop:99,completed:['live']}),normalizeWalkthroughProgress());
  const restored=normalizeWalkthroughProgress({version:1,stop:999,part:999,completed:['live','unknown','live'],heard:['live:0','live:99','unknown:0','live:0'],finished:true});
  assert.equal(restored.stop,walkthroughStops.length-1);assert.equal(restored.part,walkthroughStops.at(-1).parts.length-1);
  assert.deepEqual(restored.completed,['live']);assert.deepEqual(restored.heard,['live:0']);assert.equal(restored.finished,true);
  const valid=normalizeWalkthroughProgress({version:1,stop:stopIndex('human'),part:3,heard:['live:0'],completed:['live']});
  assert.equal(valid.stop,stopIndex('human'));assert.equal(valid.part,3);
});

test('natural completion must match the actual module, lesson scene, human step or reset rule',()=>{
  const lesson=partAt('clock-reading',1),human=partAt('human',2),reset=partAt('reset-window');
  assert.equal(matchesWalkthroughCompletion(null,lesson,'lesson',{lessonId:'clock-reading',step:1}),true);
  assert.equal(matchesWalkthroughCompletion(null,lesson,'lesson',{lessonId:'clock-reading',step:0}),false);
  assert.equal(matchesWalkthroughCompletion(null,lesson,'lesson',{lessonId:'utc-offsets',step:1}),false);
  assert.equal(matchesWalkthroughCompletion(null,human,'human',{step:2}),true);
  assert.equal(matchesWalkthroughCompletion(null,human,'human',{step:1}),false);
  assert.equal(matchesWalkthroughCompletion(null,reset,'reset',{type:'window'}),true);
  assert.equal(matchesWalkthroughCompletion(null,reset,'reset',{type:'daily'}),false);
  for(const id of ['live','daily-rhythms','announcement','common','manual']){
    const part=partAt(id),stop=walkthroughStops[stopIndex(id)];
    assert.equal(matchesWalkthroughCompletion(stop,part,part.player),true,id);
    for(const wrong of ['lesson','human','reset','live','routine','announcement','common','guide'].filter(type=>type!==part.player))assert.equal(matchesWalkthroughCompletion(stop,part,wrong),false,`${id} accepted ${wrong}`);
  }
});
