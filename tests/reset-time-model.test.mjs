import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyResetSeries,resolveDailyReset,anchoredWindowEnd,rollingReleases,globalResetSnapshot} from '../dist/reset-time-model.mjs';
import {partsAt} from '../dist/time-engine.mjs';

test('a midnight PT daily rule stays on local midnight while UTC and Beijing shift',()=>{
  const rows=dailyResetSeries({date:'2026-10-31',time:'00:00',zone:'America/Los_Angeles'});
  assert.deepEqual(rows.map(row=>row.localDate),['2026-10-31','2026-11-01','2026-11-02']);
  assert.deepEqual(rows.map(row=>row.status),['ok','ok','ok']);
  assert.deepEqual(rows.map(row=>row.candidates[0].toISOString()),['2026-10-31T07:00:00.000Z','2026-11-01T07:00:00.000Z','2026-11-02T08:00:00.000Z']);
  assert.deepEqual(rows.map(row=>partsAt(row.candidates[0],'Asia/Shanghai').time),['15:00','15:00','16:00']);
  assert.equal((rows[2].candidates[0]-rows[1].candidates[0])/3_600_000,25);
});

test('a civil daily schedule can span 23 actual hours rather than 24',()=>{
  const rows=dailyResetSeries({date:'2026-03-08',time:'00:00',zone:'America/Los_Angeles',count:2});
  assert.equal((rows[1].candidates[0]-rows[0].candidates[0])/3_600_000,23);
  assert.deepEqual(rows.map(row=>partsAt(row.candidates[0],'America/Los_Angeles').time),['00:00','00:00']);
});

test('skipped and repeated product-clock times remain explicit instead of choosing a policy',()=>{
  const spring=dailyResetSeries({date:'2026-03-08',time:'02:30',zone:'America/Los_Angeles',count:2});
  assert.equal(spring[0].status,'gap');assert.deepEqual(spring[0].candidates,[]);
  assert.equal(spring[1].status,'ok');
  const autumn=dailyResetSeries({date:'2026-11-01',time:'01:30',zone:'America/Los_Angeles',count:1});
  assert.equal(autumn[0].status,'fold');
  assert.deepEqual(autumn[0].candidates.map(d=>d.toISOString()),['2026-11-01T08:30:00.000Z','2026-11-01T09:30:00.000Z']);
});

test('fixed PST and zero UTC offsets do not inherit the seasonal PT rule',()=>{
  assert.equal(resolveDailyReset({date:'2026-10-28',time:'00:00',fixedOffset:-480})[0].toISOString(),'2026-10-28T08:00:00.000Z');
  assert.equal(resolveDailyReset({date:'2026-10-28',time:'00:00',fixedOffset:0})[0].toISOString(),'2026-10-28T00:00:00.000Z');
  assert.equal(resolveDailyReset({date:'2026-03-08',time:'02:30',fixedOffset:-480})[0].toISOString(),'2026-03-08T10:30:00.000Z');
});

test('an anchored five-hour window uses elapsed time across a clock rollback',()=>{
  const end=anchoredWindowEnd({start:'2026-11-01T00:30:00-07:00',hours:5});
  assert.equal(end.toISOString(),'2026-11-01T12:30:00.000Z');
  assert.equal(partsAt(end,'America/Los_Angeles').time,'04:30');
  assert.throws(()=>anchoredWindowEnd({start:'2026-11-01T00:30:00',hours:5}),/偏移/);
});

test('a rolling window releases each usage separately and excludes already expired usage',()=>{
  const events=[{instant:'2026-10-28T01:00:00Z',amount:20},{instant:'2026-10-27T23:00:00Z',amount:10},{instant:'2026-10-27T21:00:00Z',amount:5}];
  const releases=rollingReleases({events,hours:5,asOf:'2026-10-28T02:00:00Z'});
  assert.deepEqual(releases.map(row=>[row.instant.toISOString(),row.amount]),[['2026-10-28T04:00:00.000Z',10],['2026-10-28T06:00:00.000Z',20]]);
  assert.equal(events.length,3);
  assert.throws(()=>rollingReleases({events:[{instant:'2026-10-28T03:00:00Z',amount:2}],hours:5,asOf:'2026-10-28T02:00:00Z'}),/晚于/);
});

test('world clocks share one reset instant while dates can lie before and after the UTC date',()=>{
  const rows=globalResetSnapshot('2026-10-28T07:00:00Z',[
    {id:'la',name:'洛杉矶',zone:'America/Los_Angeles'},
    {id:'honolulu',name:'檀香山',zone:'Pacific/Honolulu'},
    {id:'beijing',name:'北京',zone:'Asia/Shanghai'},
    {id:'kiritimati',name:'圣诞岛',zone:'Pacific/Kiritimati'},
  ]);
  assert.deepEqual(rows.map(row=>[row.time,row.dateDelta]),[['00:00',0],['21:00',-1],['15:00',0],['21:00',0]]);
  assert.equal(rows[0].offset,-420);assert.equal(rows[2].offset,480);
  assert.equal(globalResetSnapshot('2026-10-28T12:00:00Z',[{id:'k',name:'圣诞岛',zone:'Pacific/Kiritimati'}])[0].dateDelta,1);
});

test('invalid clocks, anchors, durations and amounts are rejected explicitly',()=>{
  assert.throws(()=>dailyResetSeries({date:'2026-02-30',time:'00:00',zone:'UTC'}));
  assert.throws(()=>dailyResetSeries({date:'2026-10-28',time:'24:00',zone:'UTC'}));
  assert.throws(()=>dailyResetSeries({date:'2026-10-28',time:'00:00',count:0,zone:'UTC'}));
  assert.throws(()=>resolveDailyReset({date:'2026-10-28',time:'00:00'}));
  assert.throws(()=>resolveDailyReset({date:'2026-10-28',time:'00:00',fixedOffset:999}));
  assert.throws(()=>anchoredWindowEnd({start:'2026-02-30T00:00:00Z',hours:5}));
  for(const hours of [0,-1,Infinity,1001])assert.throws(()=>anchoredWindowEnd({start:'2026-10-28T00:00:00Z',hours}));
  assert.throws(()=>rollingReleases({events:[{instant:'2026-10-28T00:00:00Z',amount:0}],hours:5,asOf:'2026-10-28T01:00:00Z'}));
});
