import test from 'node:test';
import assert from 'node:assert/strict';
import {liveRegions,liveSnapshot} from '../dist/live-time-model.mjs';
import {primaryLiveRegions,liveGlobeClocks,liveRegionForCity,liveOverviewFocus} from '../dist/live-globe-model.mjs';
import {geographicVector} from '../dist/globe-3d.mjs';

test('global clocks keep ten representative cities with their own date and phase',()=>{
  const {clocks,annotations}=liveGlobeClocks(liveSnapshot('2026-10-28T23:30:00Z'),'pt');
  assert.equal(clocks.length,10);assert.equal(annotations.length,0);
  const get=id=>clocks.find(clock=>clock.id===id);
  assert.equal(get('beijing').headline,'07:30');assert.match(get('beijing').detail,/当地清晨\n2026-10-29/);
  assert.equal(get('la').headline,'16:30');assert.match(get('la').detail,/当地下午\n2026-10-28 · PDT/);
  assert.equal(get('la').selected,true);assert.ok(get('la').priority>get('beijing').priority);
  assert.ok(['london','newyork','tokyo','sydney','dubai','delhi','saopaulo','nairobi'].every(id=>get(id)));
});

test('pair mode retains Beijing and exactly the chosen local clock',()=>{
  const rows=liveSnapshot('2026-11-02T12:00:00Z');
  const {clocks}=liveGlobeClocks(rows,'pt','compare');
  assert.deepEqual(clocks.map(clock=>clock.id),['la','beijing']);
  assert.match(clocks.find(clock=>clock.id==='la').detail,/PST/);
  assert.equal(liveGlobeClocks(rows,'beijing','compare').clocks.length,1);
});

test('less common selections stay present without replacing the ten-city overview',()=>{
  const rows=liveSnapshot('2026-10-28T12:00:00Z');
  const paris=liveGlobeClocks(rows,'central-europe');
  assert.equal(paris.clocks.length,11);assert.equal(paris.clocks.find(clock=>clock.id==='paris').selected,true);
  const denver=liveGlobeClocks(rows,'mt');
  assert.equal(denver.clocks.length,10);assert.equal(denver.annotations.length,1);
  assert.match(denver.annotations[0].text,/丹佛 · MT/);assert.match(denver.annotations[0].detail,/当地清晨/);
});

test('UTC remains a common scale with no invented human phase on a city',()=>{
  const result=liveGlobeClocks(liveSnapshot('2026-10-28T12:00:00Z'),'utc','compare');
  assert.deepEqual(result.clocks.map(clock=>clock.id),['beijing']);assert.deepEqual(result.annotations,[]);
});

test('city clicks map only to known representative time rules',()=>{
  const rows=liveSnapshot('2026-10-28T12:00:00Z');
  assert.equal(liveRegionForCity(rows,'la'),'pt');assert.equal(liveRegionForCity(rows,'paris'),'central-europe');
  assert.equal(liveRegionForCity(rows,'unknown-city'),null);
});

test('regional overviews keep every selected representative city in front with its neighbors',()=>{
  const primary=liveRegions.filter(row=>primaryLiveRegions.includes(row.id));
  for(const selected of liveRegions.filter(row=>row.id!=='utc')){
    const focus=liveOverviewFocus(selected),direction=geographicVector(focus.lat,focus.lon);
    assert.ok(geographicVector(selected.lat,selected.lon).dot(direction)>.16,`${selected.id} must remain on the front of its overview`);
    const visible=primary.filter(row=>geographicVector(row.lat,row.lon).dot(direction)>.16);
    assert.ok(visible.length>=3,`${selected.id} overview needs multiple global clocks`);
  }
  const pt=liveOverviewFocus(liveRegions.find(row=>row.id==='pt')),direction=geographicVector(pt.lat,pt.lon);
  assert.ok(['pt','et','sao-paulo'].every(id=>{const row=liveRegions.find(row=>row.id===id);return geographicVector(row.lat,row.lon).dot(direction)>.16;}));
});
