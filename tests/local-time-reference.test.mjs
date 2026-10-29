import test from 'node:test';
import assert from 'node:assert/strict';
import {dayPhase,buildTimeReference} from '../dist/local-time-reference.mjs';
import {liveRegions} from '../dist/live-time-model.mjs';

const region=id=>liveRegions.find(item=>item.id===id);
const build=(instant,id='pt',extra={})=>buildTimeReference({instant,region:region(id),...extra});

test('day phases describe clock ranges and preserve boundary minutes',()=>{
  assert.equal(dayPhase('00:00').id,'late-night');assert.equal(dayPhase({hour:5,minute:59}).label,'凌晨');
  assert.equal(dayPhase(360).label,'清晨');assert.equal(dayPhase('09:00').label,'上午');
  assert.equal(dayPhase('12:00').label,'下午');assert.equal(dayPhase('18:00').label,'晚上');
  assert.throws(()=>dayPhase(1440),RangeError);assert.throws(()=>dayPhase('24:00'),RangeError);
});

test('Beijing to UTC to PT preserves the full dates of one instant',()=>{
  const value=build('2026-10-28T01:30:00+08:00');
  assert.equal(value.reference.time,'01:30');assert.equal(value.utc.date,'2026-10-27');assert.equal(value.utc.time,'17:30');
  assert.equal(value.selected.date,'2026-10-27');assert.equal(value.selected.time,'10:30');
  assert.equal(value.selected.variant,'PDT');assert.equal(value.calculation.toUtcMinutes,-480);assert.equal(value.calculation.fromUtcMinutes,-420);
  assert.equal(value.calculation.deltaMinutes,-900);assert.equal(value.calculation.steps.length,2);
  assert.equal(value.calculation.steps[1].from.instant,value.selected.instant);
});

test('the whole local deep-night reference changes its Beijing time with PT seasons',()=>{
  const summer=build('2026-07-15T12:00:00Z'),winter=build('2026-01-15T12:00:00Z');
  assert.equal(summer.quiet.start.reference.time,'15:00');assert.equal(summer.quiet.end.reference.time,'21:00');
  assert.equal(winter.quiet.start.reference.time,'16:00');assert.equal(winter.quiet.end.reference.time,'22:00');
  assert.equal(summer.quiet.actualMinutes,360);assert.equal(winter.selected.variant,'PST');
  assert.equal(summer.quiet.containsLocalClock,true);assert.equal(summer.quiet.containsInstant,true);
  assert.equal(build('2026-07-15T13:00:00Z').quiet.containsLocalClock,false);
});

test('overnight references belong to their source start date and show both Beijing dates',()=>{
  const value=build('2026-10-28T18:00:00Z','central-europe',{quietStart:'22:00',quietEnd:'06:00'});
  assert.equal(value.quiet.sourceStartDate,'2026-10-28');assert.equal(value.quiet.sourceEndDate,'2026-10-29');
  assert.equal(value.quiet.crossesMidnight,true);assert.equal(value.quiet.wallMinutes,480);
  assert.equal(value.quiet.start.reference.date,'2026-10-29');assert.equal(value.quiet.start.reference.time,'05:00');
  assert.equal(value.quiet.end.reference.date,'2026-10-29');assert.equal(value.quiet.end.reference.time,'13:00');
  assert.equal(value.quiet.actualHours,8);
  const afterMidnight=build('2026-10-28T01:00:00Z','central-europe',{quietStart:'22:00',quietEnd:'06:00'});
  assert.equal(afterMidnight.quiet.containsLocalClock,true);assert.equal(afterMidnight.quiet.containsInstant,false);
});

test('a six-hour wall window can last five or seven elapsed hours across US DST',()=>{
  const spring=build('2026-03-08T12:00:00Z'),autumn=build('2026-11-01T12:00:00Z');
  assert.equal(spring.quiet.wallMinutes,360);assert.equal(spring.quiet.actualHours,5);assert.equal(spring.quiet.hasOffsetChange,true);
  assert.equal(autumn.quiet.actualHours,7);assert.equal(autumn.quiet.start.source.variant,'PDT');assert.equal(autumn.quiet.end.source.variant,'PST');
});

test('European transition windows also retain actual elapsed duration and endpoint offsets',()=>{
  const spring=build('2026-03-29T12:00:00Z','central-europe'),autumn=build('2026-10-25T12:00:00Z','central-europe');
  assert.equal(spring.quiet.actualHours,5);assert.equal(spring.quiet.start.source.variant,'CET');assert.equal(spring.quiet.end.source.variant,'CEST');
  assert.equal(autumn.quiet.actualHours,7);
});

test('missing and repeated endpoint clocks expose candidates without inventing one interval',()=>{
  const missing=build('2026-03-08T12:00:00Z','pt',{quietStart:'02:30',quietEnd:'06:00'});
  assert.equal(missing.quiet.status,'gap');assert.equal(missing.quiet.startStatus,'gap');assert.equal(missing.quiet.startCandidates.length,0);
  assert.equal(missing.quiet.start,undefined);assert.equal(missing.quiet.actualMinutes,undefined);
  const repeated=build('2026-11-01T12:00:00Z','pt',{quietStart:'01:30',quietEnd:'06:00'});
  assert.equal(repeated.quiet.status,'fold');assert.equal(repeated.quiet.startCandidates.length,2);
  assert.equal(repeated.quiet.startCandidates[0].source.offset,-420);assert.equal(repeated.quiet.startCandidates[1].source.offset,-480);
  assert.equal(repeated.quiet.start,undefined);
  const missingEnd=build('2026-03-08T12:00:00Z','pt',{quietEnd:'02:30'});
  assert.equal(missingEnd.quiet.endStatus,'gap');assert.equal(missingEnd.quiet.status,'gap');
});

test('half-hour and quarter-hour offsets survive every conversion step',()=>{
  const india=build('2026-10-28T12:00:00Z','india');
  assert.equal(india.selected.offset,330);assert.equal(india.selected.time,'17:30');
  assert.equal(india.quiet.start.reference.time,'02:30');assert.equal(india.quiet.end.reference.time,'08:30');
  const nepal=buildTimeReference({instant:'2026-10-28T12:00:00Z',region:{id:'nepal',short:'Nepal',name:'加德满都当地时间',zone:'Asia/Kathmandu'}});
  assert.equal(nepal.selected.offset,345);assert.equal(nepal.selected.time,'17:45');assert.equal(nepal.quiet.start.reference.time,'02:15');
  assert.match(nepal.calculation.steps[1].expression,/5 小时 45 分钟/);
});

test('UTC is a shared scale and does not receive a human phase or quiet window',()=>{
  const value=build('2026-10-28T02:00:00Z','utc');
  assert.equal(value.applicable,false);assert.equal(value.phase,null);assert.equal(value.quiet.status,'not-applicable');
  assert.equal(value.quiet.containsLocalClock,false);assert.deepEqual(value.quiet.startCandidates,[]);
  assert.equal(value.calculation.steps[1].adjustmentMinutes,0);
  const unrelatedInvalid=build('2026-10-28T02:00:00Z','utc',{quietStart:'',quietEnd:''});
  assert.equal(unrelatedInvalid.quiet.status,'not-applicable');assert.equal(unrelatedInvalid.phase,null);
});

test('invalid or empty reference clocks fail explicitly',()=>{
  for(const extra of [{quietStart:'06:00',quietEnd:'06:00'},{quietStart:'24:00'},{quietEnd:'wrong'}])assert.throws(()=>build('2026-10-28T12:00:00Z','pt',extra),RangeError);
  assert.throws(()=>build('2026-10-28T12:00:00'),RangeError);
  assert.throws(()=>build('2026-02-30T12:00:00Z'),RangeError);
  assert.throws(()=>buildTimeReference({instant:'2026-10-28T12:00:00Z',region:{zone:'unknown'}}),RangeError);
});
