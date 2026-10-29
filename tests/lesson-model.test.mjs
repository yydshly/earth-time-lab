import test from 'node:test';
import assert from 'node:assert/strict';
import {twelveHour,compareClocks,routineAt,stageAtProgress,stageProgress,dayCycleInstant,localClockWords,lessonPresentation} from '../dist/lesson-model.mjs';
import {partsAt} from '../dist/time-engine.mjs';
const beijing={name:'北京',zone:'Asia/Shanghai'},la={name:'洛杉矶',zone:'America/Los_Angeles'};
test('12-hour notation handles midnight and noon without zero-hour ambiguity',()=>{
  assert.equal(twelveHour({hour:0,minute:0}),'12:00 a.m.');
  assert.equal(twelveHour({hour:12,minute:0}),'12:00 p.m.');
  assert.equal(twelveHour({hour:15,minute:30}),'3:30 p.m.');
});
test('globe conversion retains previous dates and seasonal offsets',()=>{
  const winter=compareClocks('2026-01-15T18:00Z',beijing,la);
  assert.equal(winter.difference,-960);assert.equal(winter.days,-1);assert.equal(winter.to.time,'10:00');
  const summer=compareClocks('2026-07-15T16:00Z',la,beijing);
  assert.equal(summer.difference,900);assert.equal(summer.days,1);assert.equal(summer.to.time,'00:00');
});
test('routine examples use local weekday and preserve overnight origin day',()=>{
  const s={start:'22:00',end:'06:00',weekdays:[5]};
  assert.equal(routineAt('2026-01-16T16:30Z',beijing,s).tone,'work');
  assert.equal(routineAt('2026-01-17T16:30Z',beijing,s).tone,'sleep');
  assert.equal(routineAt('2026-01-16T22:00Z',beijing,s).tone,'sleep');
});
test('audio scene boundaries use narration weight and include exact ending',()=>{
  const stages=[{narration:'aaa'},{narration:'b'},{narration:'cccc'}];
  assert.equal(stageProgress(stages,1),3/8);assert.equal(stageProgress(stages,2),.5);
  assert.equal(stageAtProgress(stages,.374),0);assert.equal(stageAtProgress(stages,.375),1);
  assert.equal(stageAtProgress(stages,.5),2);assert.equal(stageAtProgress(stages,1),2);
});
test('one Earth day advances real dates across local midnight and stops after 24 hours',()=>{
  const start='2026-03-20T22:00:00Z';
  assert.equal(partsAt(dayCycleInstant(start,0),'Asia/Shanghai').time,'06:00');
  const midnight=partsAt(dayCycleInstant(start,18*60),'Asia/Shanghai');
  assert.equal(midnight.date,'2026-03-22');assert.equal(midnight.time,'00:00');
  const end=partsAt(dayCycleInstant(start,1440),'Asia/Shanghai');
  assert.equal(end.date,'2026-03-22');assert.equal(end.time,'06:00');
  assert.equal(dayCycleInstant(start,1500).getTime()-Date.parse(start),86400000);
  assert.equal(dayCycleInstant(start,-1).toISOString(),new Date(start).toISOString());
});
test('first lesson reveals notation separately and defers UTC and geographic layers',()=>{
  const local=lessonPresentation({mode:'clocks'},{presentation:'local'});
  assert.equal(local.showUtc,false);assert.equal(local.showNotation,false);assert.equal(local.showLayers,false);
  assert.equal(lessonPresentation({mode:'clocks'},{presentation:'notation'}).showNotation,true);
  assert.equal(lessonPresentation({mode:'clocks'},{presentation:'comparison'}).showNotation,false);
  assert.equal(lessonPresentation({mode:'offsets'},{}).showUtc,true);
  assert.equal(lessonPresentation({mode:'rotation'},{dayCycle:true}).showLayers,false);
  assert.equal(localClockWords({hour:15,minute:30}),'下午 3:30');
  assert.equal(localClockWords({hour:0,minute:0}),'午夜 0:00');
});
