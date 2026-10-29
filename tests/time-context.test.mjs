import test from 'node:test';
import assert from 'node:assert/strict';
import {describeTimeContext} from '../dist/time-context.mjs';

test('the shared context keeps opposite local and UTC dates explicit',()=>{
  const model=describeTimeContext({kind:'example',instant:'2026-01-15T20:00:42Z'});
  assert.equal(model.localDate,'2026-01-16');assert.equal(model.localTime,'04:00');
  assert.equal(model.utcDate,'2026-01-15');assert.equal(model.utcTime,'20:00');
  assert.equal(model.title,'教学示例');assert.match(model.detail,/不是真实现在/);
});
test('live and manual contexts say whether the clock advances',()=>{
  const instant=new Date('2026-10-28T13:00:59Z');
  const live=describeTimeContext({kind:'live',instant,zone:'America/Los_Angeles',label:'洛杉矶当地时间'});
  assert.equal(live.title,'实时现在');assert.equal(live.status,'持续更新');assert.equal(live.localTime,'06:00');
  const manual=describeTimeContext({kind:'manual',instant});
  assert.equal(manual.status,'时间已定格');assert.match(manual.detail,/不会随真实时间自动前进/);
});
test('the first reading lesson can omit UTC while preserving a complete local date',()=>{
  const model=describeTimeContext({kind:'example',instant:'2026-01-15T20:00Z',showUtc:false,detail:'先看日期、钟点与地点。'});
  assert.equal(model.showUtc,false);assert.equal(model.utcDate,undefined);assert.equal(model.utcTime,undefined);
  assert.equal(model.localDate,'2026-01-16');assert.equal(model.detail,'先看日期、钟点与地点。');
});
test('invalid time context cannot silently become a different mode or instant',()=>{
  assert.throws(()=>describeTimeContext({kind:'unknown',instant:'2026-01-15T20:00Z'}),RangeError);
  assert.throws(()=>describeTimeContext({kind:'live',instant:'invalid'}),RangeError);
});
