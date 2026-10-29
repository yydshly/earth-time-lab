import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlannerHandoff} from '../dist/planner-handoff.mjs';

const cities=[{id:'beijing',zone:'Asia/Shanghai'},{id:'la',zone:'America/Los_Angeles'}];
const handoff=overrides=>createPlannerHandoff({cityIds:['beijing','la'],instant:'2026-01-15T01:00:00Z',durationMinutes:30,sourceTitle:'一起约时间',...overrides},cities);

test('winter lesson retains Beijing date and Los Angeles previous-day date',()=>{
  const result=handoff();
  assert.equal(result.baseCityId,'beijing');
  assert.equal(result.date,'2026-01-15');
  assert.equal(result.time,'09:00');
  assert.deepEqual(result.clocks.map(({cityId,date,time,offsetMinutes})=>({cityId,date,time,offsetMinutes})),[
    {cityId:'beijing',date:'2026-01-15',time:'09:00',offsetMinutes:480},
    {cityId:'la',date:'2026-01-14',time:'17:00',offsetMinutes:-480},
  ]);
});

test('summer 9 a.m. PT arrives as next-day midnight in Beijing',()=>{
  const result=handoff({instant:'2026-07-15T09:00:00-07:00'});
  assert.equal(result.instant,'2026-07-15T16:00:00.000Z');
  assert.equal(result.date,'2026-07-16');
  assert.equal(result.time,'00:00');
  assert.equal(result.clocks[1].date,'2026-07-15');
  assert.equal(result.clocks[1].time,'09:00');
  assert.equal(result.clocks[1].offsetMinutes,-420);
});

test('an exact moment is preserved even when reference clock repeats during DST fall-back',()=>{
  const first=handoff({cityIds:['la','beijing'],instant:'2026-11-01T08:30:00Z'});
  const second=handoff({cityIds:['la','beijing'],instant:'2026-11-01T09:30:00Z'});
  assert.equal(first.time,'01:30');
  assert.equal(second.time,'01:30');
  assert.notEqual(first.instant,second.instant);
  assert.equal(first.clocks[0].offsetMinutes,-420);
  assert.equal(second.clocks[0].offsetMinutes,-480);
});

test('copying personal example schedules does not alias the caller data',()=>{
  const schedules={beijing:{start:'23:00',end:'01:00',weekdays:[5]}};
  const result=handoff({schedules});
  result.schedules.beijing.weekdays.push(6);
  assert.deepEqual(schedules.beijing.weekdays,[5]);
});

test('atlas handoff preserves personal sleep exclusions without adding them to legacy schedules',()=>{
  const source={start:'22:00',end:'06:00',sleepStart:'23:00',sleepEnd:'04:00',weekdays:[5]};
  const result=handoff({schedules:{beijing:source,la:{start:'09:00',end:'18:00',weekdays:[1]}}});
  assert.deepEqual(result.schedules.beijing,source);
  assert.equal('sleepStart' in result.schedules.la,false);
  result.schedules.beijing.sleepStart='23:30';
  assert.equal(source.sleepStart,'23:00');
});

test('invalid or ambiguous handoffs are rejected before touching planner state',()=>{
  assert.throws(()=>handoff({cityIds:['beijing','unknown']}),RangeError);
  assert.throws(()=>handoff({instant:'2026-01-15T09:00:00'}),RangeError);
  assert.throws(()=>handoff({instant:'invalidZ'}),RangeError);
  assert.throws(()=>handoff({durationMinutes:0}),RangeError);
  assert.throws(()=>handoff({schedules:{la:{start:'25:00',end:'17:00',weekdays:[1]}}}),RangeError);
  assert.throws(()=>handoff({schedules:{la:{start:'09:00',end:'17:00',weekdays:[1],sleepStart:'23:00'}}}),RangeError);
  assert.throws(()=>handoff({schedules:{la:{start:'09:00',end:'17:00',weekdays:[1],sleepStart:'23:00',sleepEnd:'23:00'}}}),RangeError);
});
