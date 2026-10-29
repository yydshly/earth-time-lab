import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveTimeExpression,buildCommonTimeCase,buildCommonTimeNarration,buildCommonTimePracticeNarration} from '../dist/common-time.mjs';
import {createPlannerHandoff} from '../dist/planner-handoff.mjs';
import {partsAt} from '../dist/time-engine.mjs';

test('Pacific examples cross the Beijing date and change after DST ends',()=>{
  const summer=partsAt(resolveTimeExpression('PT','2026-10-28','09:00')[0],'Asia/Shanghai');
  const winter=partsAt(resolveTimeExpression('PT','2026-11-02','09:00')[0],'Asia/Shanghai');
  assert.deepEqual([summer.date,summer.time],['2026-10-29','00:00']);
  assert.deepEqual([winter.date,winter.time],['2026-11-03','01:00']);
});
test('literal PST is an hour later than seasonal PT during daylight time',()=>{
  assert.equal(resolveTimeExpression('PST','2026-10-28','09:00')[0]-resolveTimeExpression('PT','2026-10-28','09:00')[0],3600000);
  assert.equal(+resolveTimeExpression('PDT','2026-10-28','09:00')[0],+resolveTimeExpression('PT','2026-10-28','09:00')[0]);
});
test('Pacific skipped and repeated hours remain explicit',()=>{
  assert.equal(resolveTimeExpression('PT','2026-03-08','02:30').length,0);
  assert.deepEqual(resolveTimeExpression('PT','2026-11-01','01:30').map(d=>d.toISOString()),['2026-11-01T08:30:00.000Z','2026-11-01T09:30:00.000Z']);
});
test('fixed offsets do not create seasonal gaps and malformed dates are rejected',()=>{
  assert.equal(resolveTimeExpression('PST','2026-03-08','02:30').length,1);
  assert.throws(()=>resolveTimeExpression('PST','2026-02-30','09:00'));
  assert.throws(()=>resolveTimeExpression('CST','2026-10-28','09:00'));
});

test('the selected converter case carries its exact instant and origin into the planner',()=>{
  const context=buildCommonTimeCase('PT','2026-11-02','09:00');
  const plan=createPlannerHandoff(context,[{id:'beijing',zone:'Asia/Shanghai'},{id:'la',zone:'America/Los_Angeles'}]);
  assert.equal(plan.instant,'2026-11-02T17:00:00.000Z');
  assert.equal(plan.date,'2026-11-03');assert.equal(plan.time,'01:00');
  assert.equal(plan.sourceView,'phrases');assert.match(plan.sourceTitle,/2026-11-02 09:00/);
  assert.deepEqual(plan.cityIds,['beijing','la']);
});

test('fixed PST preserves its meaning when the actual city is using PDT',()=>{
  const context=buildCommonTimeCase('PST','2026-10-28','09:00');
  assert.equal(context.instant,'2026-10-28T17:00:00.000Z');assert.equal(context.beijing.time,'01:00');assert.equal(context.mismatch,true);
  assert.match(context.sourceTitle,/固定 UTC−08:00/);
  const segments=buildCommonTimeNarration(context);
  assert.deepEqual(segments.map(s=>s.id),['source','utc','target','confirm']);
  assert.match(segments[0].text,/固定偏移与当天洛杉矶实际当地时间不同/);
  assert.match(segments[2].text,/2026年10月29日1点整/);
});

test('a repeated time cannot hand off until its exact occurrence has been selected',()=>{
  assert.throws(()=>buildCommonTimeCase('PT','2026-11-01','01:30'),/第一次或第二次/);
  const first=buildCommonTimeCase('PT','2026-11-01','01:30','2026-11-01T08:30:00Z');
  const second=buildCommonTimeCase('PT','2026-11-01','01:30','2026-11-01T09:30:00Z');
  assert.equal(first.expression.offset,-420);assert.equal(second.expression.offset,-480);
  assert.notEqual(first.instant,second.instant);
  assert.throws(()=>buildCommonTimeCase('PT','2026-03-08','02:30'),/有效的完整时刻/);
  assert.throws(()=>buildCommonTimeCase('PT','2026-11-01','01:30','2026-11-01T10:30:00Z'));
});

test('the guided communication practice confirms the actual dates without repeating offset calculation',()=>{
  const context=buildCommonTimeCase('PT','2026-10-28','09:00');
  const practice=buildCommonTimePracticeNarration(context);
  assert.equal(practice.length,2);
  assert.match(practice[0].text,/哪座城市、哪一天、上午还是下午/);
  assert.match(practice[0].text,/2026年10月28日9点整/);
  assert.match(practice[1].text,/北京时间2026年10月29日0点整/);
  assert.match(practice[1].text,/通话多久、这个时段是否方便/);
  assert.doesNotMatch(practice.map(part=>part.text).join(''),/UTC|PST|PDT|标准时间|夏令时/);
});

test('guided confirmation keeps fixed-offset ambiguity explicit and rejects an unresolved case',()=>{
  const practice=buildCommonTimePracticeNarration(buildCommonTimeCase('PST','2026-10-28','09:00'));
  assert.match(practice[0].text,/固定偏移与当天洛杉矶当地钟表不同/);
  assert.match(practice[1].text,/北京时间2026年10月29日1点整/);
  assert.throws(()=>buildCommonTimePracticeNarration(null),/先完成/);
});
