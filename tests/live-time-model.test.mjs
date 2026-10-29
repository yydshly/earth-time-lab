import test from 'node:test';
import assert from 'node:assert/strict';
import {liveRegions,liveSnapshot} from '../dist/live-time-model.mjs';

const get=(instant,id,referenceZone)=>liveSnapshot(instant,referenceZone).find(row=>row.id===id);

test('common region labels resolve 14 city rules across six inhabited continents',()=>{
  assert.equal(liveRegions.length,14);
  assert.equal(new Set(liveRegions.map(r=>r.id)).size,14);
  assert.equal(new Set(liveRegions.filter(r=>r.continent!=='全球').map(r=>r.continent)).size,6);
  const rows=liveSnapshot('2026-10-28T12:00:00Z');
  for(const row of rows){
    assert.match(row.local.time,/^\d{2}:\d{2}$/);
    assert.ok(Number.isFinite(row.offset));assert.ok(row.variant);
    assert.ok(Number.isFinite(row.lat)&&Number.isFinite(row.lon));
  }
  assert.equal(get('2026-10-28T12:00:00Z','beijing').variant,'UTC+08:00');
  assert.equal(liveRegions.find(r=>r.id==='utc').cityId,null);
  assert.equal(liveRegions.find(r=>r.id==='mt').cityId,null);
});

test('PT uses the current date to choose PDT or PST and Beijing 15 or 16 hour difference',()=>{
  const before=get('2026-10-28T12:34:56Z','pt'),after=get('2026-11-02T12:34:56Z','pt');
  assert.equal(before.variant,'PDT');assert.equal(before.offset,-420);assert.equal(before.deltaMinutes,-900);
  assert.equal(before.reference.time,'20:34');assert.equal(before.local.time,'05:34');assert.equal(before.local.second,56);
  assert.equal(before.conversionText,'北京时间 20:34 − 15 小时 = PT 05:34');
  assert.equal(after.variant,'PST');assert.equal(after.offset,-480);assert.equal(after.deltaMinutes,-960);
  assert.equal(after.local.time,'04:34');assert.equal(after.conversionText,'北京时间 20:34 − 16 小时 = PT 04:34');
});

test('US and European switch weeks are independent, including the spring mismatch',()=>{
  const instant='2026-03-20T12:00:00Z';
  const et=get(instant,'et'),uk=get(instant,'london'),europe=get(instant,'central-europe');
  assert.equal(et.variant,'EDT');assert.equal(et.deltaMinutes,-720);assert.equal(et.local.time,'08:00');
  assert.equal(uk.variant,'GMT');assert.equal(uk.deltaMinutes,-480);assert.equal(uk.local.time,'12:00');
  assert.equal(europe.variant,'CET');assert.equal(europe.local.time,'13:00');
  assert.equal(get('2026-07-20T12:00:00Z','london').variant,'BST');
  assert.equal(get('2026-07-20T12:00:00Z','central-europe').variant,'CEST');
});

test('nonwhole-hour clocks and the Southern Hemisphere summer are shown correctly',()=>{
  const instant='2026-10-28T12:00:00Z',india=get(instant,'india'),sydney=get(instant,'sydney');
  assert.equal(india.offset,330);assert.equal(india.deltaMinutes,-150);assert.equal(india.local.time,'17:30');
  assert.equal(india.variant,'IST（印度）');
  assert.equal(india.conversionText,'北京时间 20:00 − 2 小时 30 分钟 = IST（印度） 17:30');
  assert.equal(sydney.variant,'AEDT');assert.equal(sydney.deltaMinutes,180);assert.equal(sydney.local.time,'23:00');
  assert.equal(get('2026-07-20T12:00:00Z','sydney').variant,'AEST');
});

test('calendar-day difference follows local dates, including previous year and next day',()=>{
  const instant='2026-01-01T00:30:00Z',pt=get(instant,'pt'),tokyo=get(instant,'japan');
  assert.equal(pt.reference.date,'2026-01-01');assert.equal(pt.local.date,'2025-12-31');assert.equal(pt.dayDelta,-1);
  assert.match(pt.conversionText,/前 1 天/);assert.equal(tokyo.dayDelta,0);
  const sydney=get('2026-10-28T15:30:00Z','sydney');
  assert.equal(sydney.reference.date,'2026-10-28');assert.equal(sydney.local.date,'2026-10-29');assert.equal(sydney.dayDelta,1);
});

test('UTC remains a fixed shared reference and custom reference changes only comparisons',()=>{
  for(const instant of ['2026-01-15T12:00:00Z','2026-07-15T12:00:00Z']){
    const utc=get(instant,'utc');assert.equal(utc.offset,0);assert.equal(utc.variant,'UTC');assert.equal(utc.deltaMinutes,-480);
  }
  const instant='2026-10-28T12:00:00Z',bj=get(instant,'beijing','UTC');
  assert.equal(bj.reference.time,'12:00');assert.equal(bj.local.time,'20:00');assert.equal(bj.deltaMinutes,480);
  assert.equal(bj.conversionText,'UTC 12:00 + 8 小时 = 北京时间 20:00');
});

test('invalid inputs fail and caller Date objects remain unchanged',()=>{
  for(const invalid of [null,undefined,new Date(NaN),'bad-date',NaN,Infinity,false])assert.throws(()=>liveSnapshot(invalid),RangeError);
  assert.throws(()=>liveSnapshot('2026-10-28T12:00:00Z','invalid-zone'),RangeError);
  const instant=new Date('2026-10-28T12:34:56.123Z'),original=instant.getTime();
  liveSnapshot(instant);assert.equal(instant.getTime(),original);
});
