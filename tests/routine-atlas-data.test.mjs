import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routineProfiles,routineProfileByCity} from '../dist/routine-atlas-data.mjs';

const minutes=value=>{
  assert.match(value,/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/);
  const [h,m]=value.split(':').map(Number);return h*60+m;
};

test('nine routine profiles resolve real app city IDs and keep people explicitly fictional',()=>{
  assert.equal(routineProfiles.length,9);
  assert.equal(new Set(routineProfiles.map(p=>p.cityId)).size,9);
  const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
  for(const p of routineProfiles){
    assert.ok(app.includes(`['${p.cityId}',`),p.cityId);
    assert.equal(routineProfileByCity(p.cityId),p);
    assert.match(p.scopeNote,/示意/);assert.match(p.scopeNote,/不是人口统计/);assert.match(p.scopeNote,/虚构/);
    assert.ok(p.country&&p.headline);
    assert.ok(p.narration.length>=100&&p.narration.length<=180,`${p.cityId}: ${p.narration.length}`);
    assert.match(p.narration,/示意/);assert.match(p.narration,/虚构/);
    assert.ok(p.person.weekdays.every(d=>Number.isInteger(d)&&d>=1&&d<=7));
    for(const name of ['start','end','sleepStart','sleepEnd'])assert.ok(minutes(p.person[name])<1440);
  }
});

test('each authored local-clock ring covers all 1440 minutes without gaps or overlaps',()=>{
  for(const p of routineProfiles){
    let next=0;
    for(const segment of p.segments){
      const start=minutes(segment.start),end=minutes(segment.end);
      assert.equal(start,next,`${p.cityId}: gap/overlap before ${segment.start}`);
      assert.ok(end>start,`${p.cityId}: nonpositive segment`);
      assert.ok(['sleep','work','meal','commute','free'].includes(segment.kind));
      assert.ok(segment.label);next=end;
    }
    assert.equal(next,1440,p.cityId);
  }
});

test('every regional fact links to a scoped, dated primary source',()=>{
  const allowed=new Set(['www.bjmoa.cn','www.japan.travel','www.mospi.gov.in','u.ae','www.spain.info','www.ons.gov.uk','www.mta.info','www.bls.gov','www.sydney.com','www.abs.gov.au']);
  for(const p of routineProfiles){
    assert.ok(p.facts.length>=1&&p.facts.length<=2);
    const ids=new Set(p.sources.map(s=>s.id));
    for(const fact of p.facts){assert.ok(fact.text);assert.ok(ids.has(fact.sourceId));}
    for(const s of p.sources){const url=new URL(s.url);assert.equal(url.protocol,'https:');assert.ok(allowed.has(url.hostname));assert.ok(s.title&&s.scope&&s.year);assert.equal(s.checkedAt,'2026-10-28');}
  }
});
