import test from 'node:test';
import assert from 'node:assert/strict';
import {parseResetAnnouncement,calculateResetAnnouncement,announcementTimeSource,resolveAnnouncementContext} from '../dist/reset-announcement-model.mjs';
import {partsAt} from '../dist/time-engine.mjs';

test('a dated PT announcement resolves the seasonal rule, with full Beijing date',()=>{
  const summer=parseResetAnnouncement('Quota resets on 2026-10-28 at 9 a.m. PT.');
  assert.equal(summer.status,'recognized');assert.deepEqual(summer.fields,{date:'2026-10-28',source:'PT',time:'09:00'});
  const at=calculateResetAnnouncement({...summer.fields,kind:summer.kind}).instant;
  assert.equal(at.toISOString(),'2026-10-28T16:00:00.000Z');
  assert.deepEqual([partsAt(at,'Asia/Shanghai').date,partsAt(at,'Asia/Shanghai').time],['2026-10-29','00:00']);
  const winter=parseResetAnnouncement('Quota resets Nov 2, 2026 at 9AM Pacific Time');
  assert.equal(calculateResetAnnouncement({...winter.fields,kind:winter.kind}).instant.toISOString(),'2026-11-02T17:00:00.000Z');
});

test('Chinese dates, common named cities and fixed offsets are extracted',()=>{
  const local=parseResetAnnouncement('额度将在2026年11月2日 18:30 东京时间更新');
  assert.equal(local.status,'recognized');assert.equal(local.fields.source,'Tokyo');
  assert.equal(calculateResetAnnouncement(local.fields).instant.toISOString(),'2026-11-02T09:30:00.000Z');
  const fixed=parseResetAnnouncement('Reset: 2026/11/2 09:00 UTC+05:30');
  assert.equal(fixed.fields.source,'UTC+05:30');assert.equal(fixed.fields.time,'09:00');
  assert.equal(calculateResetAnnouncement(fixed.fields).instant.toISOString(),'2026-11-02T03:30:00.000Z');
});

test('12am and 12pm have distinct meanings',()=>{
  assert.equal(parseResetAnnouncement('2026-11-02 12AM ET').fields.time,'00:00');
  assert.equal(parseResetAnnouncement('2026-11-02 12 p.m. ET').fields.time,'12:00');
  assert.throws(()=>parseResetAnnouncement('2026-11-02 13PM ET'),/12 小时制/);
});

test('ISO timestamps retain explicit seconds and numeric offsets',()=>{
  const parsed=parseResetAnnouncement('Your next reset: 2026-11-02T09:00:30+05:30');
  assert.equal(parsed.status,'recognized');assert.deepEqual(parsed.fields,{timestamp:'2026-11-02T09:00:30+05:30'});
  const result=calculateResetAnnouncement(parsed.fields);
  assert.equal(result.instant.toISOString(),'2026-11-02T03:30:30.000Z');assert.equal(result.source.id,'UTC+05:30');
  assert.equal(calculateResetAnnouncement({timestamp:'2026-11-02T09:00Z'}).source.id,'UTC');
});

test('missing dates and zones remain incomplete instead of assuming the viewer date',()=>{
  const noDate=parseResetAnnouncement('Resets at 9AM PT');assert.equal(noDate.status,'incomplete');assert.deepEqual(noDate.missing,['完整日期（含年份）']);
  const noZone=parseResetAnnouncement('Resets at 2026-11-02 09:00');assert.equal(noZone.status,'incomplete');assert.deepEqual(noZone.missing,['明确时区或城市']);
  assert.equal(parseResetAnnouncement('tomorrow 9AM PT').status,'incomplete');
  assert.match(parseResetAnnouncement('tomorrow 9AM PT').warnings.join(''),/发布时刻/);
  assert.equal(calculateResetAnnouncement(noDate.fields).status,'incomplete');
});

test('ambiguous abbreviations and multiple candidate times are not silently chosen',()=>{
  for(const abbreviation of ['CST','IST']){
    const parsed=parseResetAnnouncement(`2026-11-02 09:00 ${abbreviation}`);
    assert.equal(parsed.status,'incomplete');assert.equal(parsed.fields.source,undefined);assert.match(parsed.warnings.join(''),/多个地区/);
  }
  const multiple=parseResetAnnouncement('2026-11-02 at 9AM PT or 10AM PT');
  assert.equal(multiple.fields.time,undefined);assert.ok(multiple.missing.includes('当地钟点'));
  const times=parseResetAnnouncement('2026-11-02T09:00Z or 2026-11-03T09:00Z');
  assert.equal(times.status,'incomplete');assert.equal(times.fields.timestamp,undefined);
  for(const text of ['2026-11-02 9AM PT UTC+00:00','2026-11-02 9AM PT / UTC','2026-11-02 9AM London / Paris']){
    const zones=parseResetAnnouncement(text);assert.equal(zones.status,'incomplete');assert.equal(zones.fields.source,undefined);assert.match(zones.warnings.join(''),/多个地区/);
  }
});

test('literal PST is fixed and warns about colloquial PT use',()=>{
  const parsed=parseResetAnnouncement('2026-10-28 9AM PST');
  assert.equal(parsed.fields.source,'PST');assert.match(parsed.warnings.join(''),/固定/);
  const result=calculateResetAnnouncement(parsed.fields);
  assert.equal(result.instant.toISOString(),'2026-10-28T17:00:00.000Z');assert.match(result.warnings.join(''),/PT/);
  assert.equal(parseResetAnnouncement('2026-10-28 9AM Pacific Standard Time').fields.source,'PST');
  assert.equal(parseResetAnnouncement('2026-10-28 9AM Pacific Daylight Time').fields.source,'PDT');
});

test('duration notices require an explicit original starting instant',()=>{
  const parsed=parseResetAnnouncement('Usage resets in 5 hours');
  assert.equal(parsed.kind,'duration');assert.equal(parsed.status,'incomplete');assert.equal(parsed.fields.hours,5);
  assert.equal(calculateResetAnnouncement({kind:parsed.kind,...parsed.fields}).status,'incomplete');
  const result=calculateResetAnnouncement({kind:'duration',hours:5,start:'2026-11-01T00:00:00-07:00'});
  assert.equal(result.instant.toISOString(),'2026-11-01T12:00:00.000Z');
  assert.match(parseResetAnnouncement('5小时后重置').warnings.join(''),/旧公告/);
  assert.match(parseResetAnnouncement('每5小时重置').warnings.join(''),/周期起点/);
  const withAnchorText=parseResetAnnouncement('Starting 2026-11-01T00:00:00-07:00, resets after 5 hours');
  assert.equal(withAnchorText.kind,'duration');assert.equal(withAnchorText.fields.timestamp,undefined);assert.equal(withAnchorText.status,'incomplete');
});

test('daily notices start with the product city date and need an as-of snapshot',()=>{
  const parsed=parseResetAnnouncement('Resets every day at 00:00 PT');assert.equal(parsed.kind,'daily');assert.equal(parsed.status,'recognized');
  assert.equal(calculateResetAnnouncement({...parsed.fields,kind:'daily'}).status,'incomplete');
  const result=calculateResetAnnouncement({...parsed.fields,kind:'daily',asOf:'2026-10-28T23:00:00Z'});
  assert.equal(result.localDate,'2026-10-29');assert.equal(result.instant.toISOString(),'2026-10-29T07:00:00.000Z');
});

test('daily quota names do not replace a dated event with the next recurring reset',()=>{
  for(const text of ['Your daily quota resets on 2026-11-02 at 9AM PT.','The daily token limit resets 2026-11-02 09:00 PT.','The daily free quota resets 2026-11-02 09:00 PT.','每日额度将在2026年11月2日 09:00 PT更新','每日免费额度将在2026年11月2日 09:00 PT更新']){
    const parsed=parseResetAnnouncement(text);
    assert.equal(parsed.kind,'event');assert.equal(parsed.status,'recognized');assert.equal(parsed.fields.date,'2026-11-02');
    assert.equal(calculateResetAnnouncement({...parsed.fields,kind:parsed.kind}).instant.toISOString(),'2026-11-02T17:00:00.000Z');
  }
  assert.equal(parseResetAnnouncement('Your daily quota resets at 9AM PT').kind,'event');
  assert.equal(parseResetAnnouncement('Your daily quota resets at 9AM PT').status,'incomplete');
  assert.equal(parseResetAnnouncement('每日额度在09:00 PT更新').kind,'event');
  assert.equal(parseResetAnnouncement('Your daily quota resets daily at 9AM PT').kind,'daily');
  assert.equal(parseResetAnnouncement('额度每日09:00 PT重置').kind,'daily');
});

test('a stated date plus a real daily rule preserves the date and requires a choice',()=>{
  for(const text of ['Resets daily at 9AM PT starting on 2026-11-02.','从2026年11月2日起，每天09:00 PT重置']){
    const parsed=parseResetAnnouncement(text);
    assert.equal(parsed.status,'incomplete');assert.equal(parsed.kind,'event');assert.equal(parsed.fields.date,'2026-11-02');assert.equal(parsed.needsRuleChoice,true);
    const guarded=calculateResetAnnouncement({...parsed.fields,kind:parsed.kind,needsRuleChoice:parsed.needsRuleChoice});
    assert.equal(guarded.status,'incomplete');assert.equal(guarded.instant,undefined);
    assert.equal(calculateResetAnnouncement({...parsed.fields,kind:'event',needsRuleChoice:false}).instant.toISOString(),'2026-11-02T17:00:00.000Z');
  }
  const timestamp=parseResetAnnouncement('Daily resets start at 2026-11-02T09:00:00-08:00');
  assert.equal(timestamp.needsRuleChoice,true);assert.equal(timestamp.fields.timestamp,'2026-11-02T09:00:00-08:00');
  assert.equal(parseResetAnnouncement('Your daily quota resets at 2026-11-02T09:00:00-08:00').status,'recognized');
});

test('hour and minute countdowns retain the entire elapsed duration',()=>{
  const samples=[['Resets in 5 hours 30 minutes',5.5],['Resets in 5h30min',5.5],['Resets in 5h30m',5.5],['After 1 hour and 15 minutes',1.25],['Resets in 30 minutes',0.5],['5小时30分钟后重置',5.5],['5小时30分钟以后恢复',5.5],['5个小时30分钟之后恢复',5.5],['30分钟后更新',0.5],['剩余5小时30分钟',5.5],['每5小时30分钟重置',5.5],['5h30m',5.5]];
  for(const [text,hours]of samples){
    const parsed=parseResetAnnouncement(text);assert.equal(parsed.kind,'duration',text);assert.equal(parsed.fields.hours,hours,text);
    assert.equal(parsed.status,'incomplete');
    const result=calculateResetAnnouncement({kind:'duration',hours:parsed.fields.hours,start:'2026-11-01T07:00:00Z'});
    assert.equal(result.instant.getTime()-Date.parse('2026-11-01T07:00:00Z'),hours*3_600_000,text);
  }
});

test('alternative durations remain unspecified and unsupported units are never discarded',()=>{
  for(const text of ['Resets in 5 or 10 hours','Resets in 5 hours or 10 hours','5或10小时后重置','5小时或10小时后重置','Resets in 5h or in 10h']){
    const parsed=parseResetAnnouncement(text);assert.equal(parsed.status,'incomplete',text);assert.equal(parsed.kind,'duration',text);assert.equal(parsed.fields.hours,undefined,text);assert.match(parsed.missing.join(''),/选择明确/);
  }
  for(const text of ['Resets in 5h30s','Resets in 5h30ms','Resets in 1 day 5 hours','5小时30秒后重置','1天5小时后重置','Resets in 30 seconds']){
    const parsed=parseResetAnnouncement(text);assert.equal(parsed.kind,'duration',text);assert.equal(parsed.fields.hours,undefined,text);assert.match(parsed.missing.join(''),/暂不支持/,text);
  }
});

test('DST gaps and folds require policy, while an explicit occurrence resolves a single event',()=>{
  const gap=calculateResetAnnouncement({date:'2026-03-08',time:'02:30',source:'PT'});assert.equal(gap.status,'gap');assert.equal(gap.instant,undefined);
  const fields={date:'2026-11-01',time:'01:30',source:'PT'};
  const fold=calculateResetAnnouncement(fields);assert.equal(fold.status,'fold');assert.equal(fold.instant,undefined);
  assert.deepEqual(fold.candidates.map(at=>at.toISOString()),['2026-11-01T08:30:00.000Z','2026-11-01T09:30:00.000Z']);
  assert.equal(calculateResetAnnouncement({...fields,foldPick:1}).instant.toISOString(),'2026-11-01T09:30:00.000Z');
  assert.equal(calculateResetAnnouncement({kind:'daily',time:'01:30',source:'PT',asOf:'2026-11-01T07:00:00Z',foldPick:0}).status,'fold');
});

test('invalid dates, offsets, naive instants and durations fail explicitly',()=>{
  for(const text of ['2026-02-30 09:00 PT','2026-11-02 25:00 UTC','2026-11-02 09:00 UTC+14:30','2026-02-30T09:00Z'])assert.throws(()=>parseResetAnnouncement(text));
  for(const timestamp of ['2026-11-02T09:00','2026-02-30T09:00Z','2026-11-02T09:00+15:00'])assert.throws(()=>calculateResetAnnouncement({timestamp}));
  assert.throws(()=>calculateResetAnnouncement({kind:'duration',hours:5,start:'2026-11-02T09:00'}),/偏移/);
  assert.throws(()=>calculateResetAnnouncement({kind:'duration',hours:-1,start:'2026-11-02T09:00Z'}),/时长/);
  assert.throws(()=>announcementTimeSource('CST'),/确认/);
});

test('unsupported prose and midnight without a precise boundary remain editable',()=>{
  assert.equal(parseResetAnnouncement('Quota has been reset').status,'unsupported');
  assert.equal(parseResetAnnouncement('').status,'unsupported');
  const midnight=parseResetAnnouncement('Friday midnight PT');assert.equal(midnight.status,'incomplete');assert.match(midnight.warnings.join(''),/开始和结束/);
});

test('the actual Tibo post extracts a before-midnight PST deadline without inventing a publication date',()=>{
  const text='第 23 天/ 呼声很高的 iCloud 主界面和日历插件。开玩笑啦，今天是重置日。不过呼声依然很高！ 太平洋标准时间午夜前抵达。';
  const parsed=parseResetAnnouncement(text);
  assert.equal(parsed.kind,'event');assert.equal(parsed.status,'incomplete');assert.equal(parsed.relation,'before');
  assert.equal(parsed.fields.source,'PST');assert.equal(parsed.fields.time,'00:00');assert.equal(parsed.fields.boundary,'end-of-day');assert.equal(parsed.fields.date,undefined);assert.equal(parsed.fields.hours,undefined);
  assert.equal(parsed.needsBoundaryChoice,true);assert.equal(parsed.needsDateContext,true);assert.equal(parsed.hasTodayContext,true);
  const resolved=resolveAnnouncementContext(parsed,{asOf:'2026-10-28T16:17:00Z',defaultPublication:true});
  assert.equal(resolved.status,'recognized');assert.equal(resolved.fields.date,'2026-10-28');assert.equal(resolved.needsBoundaryChoice,false);assert.equal(resolved.assumptions.length,2);
  const result=calculateResetAnnouncement({...resolved.fields,kind:resolved.kind,needsBoundaryChoice:resolved.needsBoundaryChoice,assumptions:resolved.assumptions});
  assert.equal(result.relation,'before');assert.equal(result.contextDate,'2026-10-28');assert.equal(result.localDate,'2026-10-29');assert.equal(result.instant.toISOString(),'2026-10-29T08:00:00.000Z');
  assert.deepEqual([partsAt(result.instant,'Asia/Shanghai').date,partsAt(result.instant,'Asia/Shanghai').time],['2026-10-29','16:00']);
  assert.equal(result.assumptions.length,2);assert.match(result.warnings.join(''),/固定/);
  assert.equal(result.alternatives.length,1);assert.equal(result.alternatives[0].sourceId,'PT');assert.equal(result.alternatives[0].instant.toISOString(),'2026-10-29T07:00:00.000Z');
});

test('Chinese Pacific names retain literal standard or daylight meanings',()=>{
  for(const [name,source]of [['太平洋标准时间','PST'],['太平洋标准时','PST'],['太平洋夏令时间','PDT'],['太平洋夏令时','PDT'],['太平洋时间','PT']]){
    const parsed=parseResetAnnouncement(`今天 ${name}午夜前抵达`);assert.equal(parsed.fields.source,source,name);
  }
  const literal=calculateResetAnnouncement({date:'2026-12-01',time:'00:00',source:'PST',relation:'before',boundary:'end-of-day'});
  assert.deepEqual(literal.alternatives,[]);
});

test('publication-day defaults use the source clock and remain explicit assumptions',()=>{
  const before=parseResetAnnouncement('Arrives before midnight PST.');
  const resolved=resolveAnnouncementContext(before,{asOf:'2026-10-29T02:00:00Z',defaultPublication:true});
  assert.equal(resolved.fields.date,'2026-10-28');
  const kept=resolveAnnouncementContext(parseResetAnnouncement('2026-10-25 before midnight PST'),{asOf:'2026-10-29T02:00:00Z',defaultPublication:true});
  assert.equal(kept.fields.date,'2026-10-25');assert.equal(kept.assumptions.length,1);
  const manual=resolveAnnouncementContext(before,{asOf:'2026-10-29T02:00:00Z'});
  assert.equal(manual.fields.date,undefined);assert.equal(manual.needsBoundaryChoice,true);assert.equal(manual.status,'incomplete');
  const noDate=resolveAnnouncementContext(parseResetAnnouncement('Resets at 9AM PT'),{asOf:'2026-10-29T02:00:00Z',defaultPublication:true});
  assert.equal(noDate.fields.date,undefined);assert.equal(noDate.status,'incomplete');
});

test('relative midnight deadlines use their source-date wording while multiple clocks stay unresolved',()=>{
  for(const [text,date]of [['Arrives before Friday midnight PST','2026-10-30'],['Arrives before midnight tomorrow PST','2026-10-29'],['明天太平洋标准时间午夜前抵达','2026-10-29']]){
    const result=resolveAnnouncementContext(parseResetAnnouncement(text),{asOf:'2026-10-28T16:17:00Z',defaultPublication:true});
    assert.equal(result.fields.date,date,text);assert.equal(result.status,'recognized',text);assert.equal(result.needsBoundaryChoice,false,text);assert.equal(result.fields.relation,'before',text);
  }
  const multiple=resolveAnnouncementContext(parseResetAnnouncement('Today at 9AM PST or before midnight PST'),{asOf:'2026-10-28T16:17:00Z',defaultPublication:true});
  assert.equal(multiple.fields.time,undefined);assert.equal(multiple.status,'incomplete');assert.equal(multiple.needsBoundaryChoice,true);
});

test('start and end boundaries require midnight and preserve the before relation',()=>{
  const base={date:'2026-10-28',time:'00:00',source:'PST',relation:'before'};
  const start=calculateResetAnnouncement({...base,boundary:'start-of-day'}),end=calculateResetAnnouncement({...base,boundary:'end-of-day'});
  assert.equal(start.instant.toISOString(),'2026-10-28T08:00:00.000Z');assert.equal(end.instant.toISOString(),'2026-10-29T08:00:00.000Z');
  assert.equal(calculateResetAnnouncement({...base,boundary:'end-of-day',needsBoundaryChoice:true}).status,'incomplete');
  assert.throws(()=>calculateResetAnnouncement({...base,time:'09:00',boundary:'end-of-day'}),/00:00/);
  const exact=calculateResetAnnouncement({date:'2026-10-28',time:'09:00',source:'PST'});assert.equal(exact.relation,'at');
  const before=calculateResetAnnouncement(parseResetAnnouncement('Before 2026-10-28 09:00 PST').fields);assert.equal(before.relation,'before');
  const timestamp=calculateResetAnnouncement(parseResetAnnouncement('Before 2026-10-28T09:00:00-08:00').fields);assert.equal(timestamp.relation,'before');
});
