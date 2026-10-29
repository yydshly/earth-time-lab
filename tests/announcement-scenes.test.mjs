import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAnnouncementScenes} from '../dist/announcement-scenes.mjs';
import {calculateResetAnnouncement,parseResetAnnouncement,resolveAnnouncementReading,resolveAnnouncementContext,calculateAnnouncementReading} from '../dist/reset-announcement-model.mjs';

test('an explicitly requested supplementary clip uses the other rule and returns to the chosen boundary',()=>{
  const result=calculateResetAnnouncement({kind:'event',date:'2026-10-28',time:'00:00',source:'PST',relation:'before',boundary:'end-of-day',asOf:new Date('2026-10-28T16:00:00Z')});
  assert.equal(result.status,'ready');
  const scenes=buildAnnouncementScenes(result,{includeSupplement:true});
  assert.equal(scenes[0].sourceClock.time,'00:00');
  assert.equal(scenes[0].sourceClock.date,'2026-10-29');
  assert.equal(scenes.find(s=>s.id==='target-clock').targetClock.time,'16:00');
  const other=scenes.find(s=>s.interpretation==='alternative');assert.ok(other);
  assert.equal(other.sourceClock.time,'00:00');assert.equal(other.targetClock.time,'15:00');
  assert.equal(other.source.zone,'America/Los_Angeles');
  assert.equal(scenes.at(-1).instant.toISOString(),result.instant.toISOString());
  assert.match(scenes.at(-1).text,/实际完成时刻/);assert.equal(scenes.at(-1).relation,'before');
});

function socialReading(interpretation='local'){
  const text='今天太平洋标准时间午夜前抵达。';
  const parsed=resolveAnnouncementContext(resolveAnnouncementReading(parseResetAnnouncement(text),{text,interpretation}),{asOf:'2026-10-28T16:00:00Z',defaultPublication:true});
  return calculateAnnouncementReading({kind:parsed.kind,...parsed.fields,assumptions:parsed.assumptions},{reading:parsed.reading});
}

test('default social PST speech stays on local PT and teaches all three names without jumping to the supplement',()=>{
  const result=socialReading(),scenes=buildAnnouncementScenes(result);assert.deepEqual([...new Set(scenes.map(s=>s.group))],['source','conversion','meaning']);
  assert.equal(result.source.id,'PT');assert.ok(scenes.every(s=>s.source.id==='PT'&&s.interpretation==='primary'&&s.instant.getTime()===result.instant.getTime()));
  assert.equal(scenes[0].sourceClock.time,'00:00');assert.equal(scenes.find(s=>s.id==='target-clock').targetClock.time,'15:00');
  assert.match(scenes[0].text,/原文写了 PST/);assert.match(scenes[0].text,/PT 是太平洋当地时间的统称/);assert.match(scenes.find(s=>s.highlight.concept==='PST').text,/PST 是太平洋标准时间/);assert.match(scenes.find(s=>s.highlight.concept==='PDT').text,/PDT 是太平洋夏令时间/);
  assert.equal(scenes[0].readingLabel,'当地 PT · PDT');assert.doesNotMatch(scenes.map(s=>s.text).join(''),/16:00/);
});

test('selecting strict PST changes every speech scene and clock to the strict result',()=>{
  const result=socialReading('strict'),scenes=buildAnnouncementScenes(result);
  assert.ok(scenes.every(s=>s.source.id==='PST'&&s.instant.getTime()===result.instant.getTime()));assert.equal(scenes.find(s=>s.id==='target-clock').targetClock.time,'16:00');
  assert.equal(scenes[0].readingLabel,'严格 PST');assert.match(scenes[0].text,/明确采用固定的 PST/);
});

test('a same-date PST boundary in winter does not invent a PT alternative',()=>{
  const result=calculateResetAnnouncement({kind:'event',date:'2026-12-02',time:'00:00',source:'PST',relation:'before',boundary:'end-of-day',asOf:new Date('2026-12-02T10:00:00Z')});
  const scenes=buildAnnouncementScenes(result);assert.ok(scenes.every(s=>s.interpretation==='primary'));assert.equal(scenes.find(s=>s.id==='target-clock').targetClock.time,'16:00');
});

test('a countdown starts the visual at its explicit anchor, then converts the ending instant',()=>{
  const result=calculateResetAnnouncement({kind:'duration',start:'2026-10-28T22:00:00Z',hours:5.5,asOf:new Date('2026-10-28T22:00:00Z')});
  assert.equal(result.status,'ready');const scenes=buildAnnouncementScenes(result);
  assert.equal(scenes[0].instant.toISOString(),'2026-10-28T22:00:00.000Z');
  const conversion=scenes.find(s=>s.id==='conversion');assert.equal(conversion.instant.toISOString(),'2026-10-29T03:30:00.000Z');
  assert.equal(conversion.targetClock.time,'11:30');assert.match(conversion.text,/5 小时 30 分钟/);
});

test('countdown speech retains supplied seconds instead of rounding to a minute',()=>{
  const result=calculateResetAnnouncement({kind:'duration',start:'2026-10-28T22:00:00Z',hours:30/3600,asOf:new Date('2026-10-28T22:00:00Z')});
  const scenes=buildAnnouncementScenes(result);const conversion=scenes.find(s=>s.id==='conversion');assert.match(conversion.text,/经过 30 秒/);assert.equal(conversion.targetClock.time,'06:00:30');
});

test('each concept, date and clock gets an independently replayable caption and exact visual target',()=>{
  const scenes=buildAnnouncementScenes(socialReading());assert.equal(new Set(scenes.map(s=>s.id)).size,scenes.length);
  for(const scene of scenes){assert.ok(scene.caption.trim());assert.ok(scene.text.trim());assert.ok(['source','conversion','meaning'].includes(scene.group));}
  assert.deepEqual(scenes.filter(s=>s.highlight.concept).map(s=>s.highlight.concept),['PT','PST','PDT']);
  for(const [id,clock,field]of [['source-date','source','date'],['source-clock','source','time'],['conversion','utc','time'],['target-date','target','date'],['target-clock','target','time']]){
    const cue=scenes.find(s=>s.id===id);assert.equal(cue.highlight.clock,clock,id);assert.equal(cue.highlight.field,field,id);
  }
  assert.ok(scenes.find(s=>s.id==='meaning').highlight.deadline);
  assert.ok(scenes.filter(s=>s.id!=='meaning').every(s=>!s.highlight.deadline));
});
