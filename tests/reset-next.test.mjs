import test from 'node:test';
import assert from 'node:assert/strict';
import {nextDailyReset,resetEventTiming,nextKnownRollingRelease} from '../dist/reset-time-model.mjs';
import {partsAt} from '../dist/time-engine.mjs';

test('next daily reset starts from the source date and rolls past an elapsed occurrence',()=>{
  const next=nextDailyReset({time:'00:00',zone:'America/Los_Angeles',asOf:'2026-10-28T13:44:00Z'});
  assert.equal(next.status,'ready');
  assert.equal(next.localDate,'2026-10-29');
  assert.equal(next.instant.toISOString(),'2026-10-29T07:00:00.000Z');
  assert.equal(partsAt(next.instant,'Asia/Shanghai').time,'15:00');
  // The viewer may already be on tomorrow while the source is still today.
  const crossing=nextDailyReset({time:'23:00',zone:'America/Los_Angeles',asOf:'2026-10-28T23:00:00Z'});
  assert.equal(crossing.localDate,'2026-10-28');
  assert.equal(crossing.instant.toISOString(),'2026-10-29T06:00:00.000Z');
  assert.equal(partsAt(crossing.instant,'Asia/Shanghai').date,'2026-10-29');
});

test('next PT midnight follows seasonal offsets, while literal PST stays fixed',()=>{
  const daylight=nextDailyReset({time:'00:00',zone:'America/Los_Angeles',asOf:'2026-10-31T20:00:00Z'});
  const standard=nextDailyReset({time:'00:00',zone:'America/Los_Angeles',asOf:'2026-11-01T20:00:00Z'});
  assert.equal(daylight.instant.toISOString(),'2026-11-01T07:00:00.000Z');
  assert.equal(standard.instant.toISOString(),'2026-11-02T08:00:00.000Z');
  assert.equal(nextDailyReset({time:'00:00',fixedOffset:-480,asOf:'2026-10-31T20:00:00Z'}).instant.toISOString(),'2026-11-01T08:00:00.000Z');
});

test('the next skipped occurrence is unresolved rather than silently skipping a day',()=>{
  for(const asOf of ['2026-03-08T06:00:00Z','2026-03-08T09:00:00Z','2026-03-08T11:00:00Z']){
    const next=nextDailyReset({time:'02:30',zone:'America/Los_Angeles',asOf});
    assert.equal(next.status,'gap');assert.equal(next.localDate,'2026-03-08');assert.deepEqual(next.candidates,[]);
  }
});

test('a repeated next clock requires policy before or between candidates, but not after both have elapsed',()=>{
  for(const asOf of ['2026-11-01T07:00:00Z','2026-11-01T09:00:00Z']){
    const next=nextDailyReset({time:'01:30',zone:'America/Los_Angeles',asOf});
    assert.equal(next.status,'fold');
    assert.deepEqual(next.candidates.map(at=>at.toISOString()),['2026-11-01T08:30:00.000Z','2026-11-01T09:30:00.000Z']);
  }
  const after=nextDailyReset({time:'01:30',zone:'America/Los_Angeles',asOf:'2026-11-01T10:00:00Z'});
  assert.equal(after.status,'ready');assert.equal(after.instant.toISOString(),'2026-11-02T09:30:00.000Z');
});

test('an occurrence exactly now is due and explicit event timing never invents another cycle',()=>{
  const at='2026-10-28T07:00:00Z';
  assert.equal(nextDailyReset({time:'00:00',zone:'America/Los_Angeles',asOf:at}).instant.toISOString(),'2026-10-28T07:00:00.000Z');
  assert.deepEqual(resetEventTiming(at,at),{status:'due',deltaMs:0});
  assert.deepEqual(resetEventTiming(at,'2026-10-28T08:00:00Z'),{status:'past',deltaMs:-3_600_000});
  assert.deepEqual(resetEventTiming(at,'2026-10-28T06:00:00Z'),{status:'future',deltaMs:3_600_000});
});

test('rolling next release uses only already observed records, and does not forecast future usage',()=>{
  const events=[{instant:'2026-10-28T00:00:00Z',amount:10},{instant:'2026-10-28T03:00:00Z',amount:20}];
  const next=nextKnownRollingRelease({events,hours:5,asOf:'2026-10-28T02:00:00Z'});
  assert.equal(next.status,'ready');assert.equal(next.release.instant.toISOString(),'2026-10-28T05:00:00.000Z');
  assert.equal(next.release.amount,10);assert.equal(next.observedCount,1);assert.equal(next.unobservedCount,1);
  assert.equal(nextKnownRollingRelease({events,hours:5,asOf:'2026-10-27T23:00:00Z'}).status,'no-observed-events');
  assert.equal(nextKnownRollingRelease({events,hours:5,asOf:'2026-10-28T08:00:00Z'}).status,'no-upcoming');
  assert.equal(events[0].instant,'2026-10-28T00:00:00Z');
});

test('next reset calculations reject ambiguous inputs and malformed rules',()=>{
  assert.throws(()=>nextDailyReset({time:'00:00',zone:'UTC',asOf:'2026-10-28T12:00:00'}),/偏移/);
  assert.throws(()=>nextDailyReset({time:'24:00',zone:'UTC',asOf:'2026-10-28T12:00:00Z'}));
  assert.throws(()=>nextDailyReset({time:'00:00',fixedOffset:999,asOf:'2026-10-28T12:00:00Z'}));
  assert.throws(()=>nextKnownRollingRelease({events:[{instant:'2026-10-28T03:00:00Z',amount:0}],hours:5,asOf:'2026-10-28T02:00:00Z'}));
});
