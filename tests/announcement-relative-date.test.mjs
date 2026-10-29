import test from 'node:test';
import assert from 'node:assert/strict';
import {parseResetAnnouncement,resolveAnnouncementReading,resolveAnnouncementContext,calculateAnnouncementReading} from '../dist/reset-announcement-model.mjs';
import {partsAt} from '../dist/time-engine.mjs';

const reference='2026-10-29T02:00:00Z'; // Beijing Thursday, Pacific still Wednesday.
function resolve(text,asOf=reference,interpretation='local'){
  const parsed=resolveAnnouncementReading(parseResetAnnouncement(text),{text,interpretation});
  return resolveAnnouncementContext(parsed,{asOf,defaultPublication:true});
}
function calculate(parsed,extra={}){return calculateAnnouncementReading({...parsed.fields,kind:parsed.kind,needsBoundaryChoice:parsed.needsBoundaryChoice,needsRuleChoice:parsed.needsRuleChoice,assumptions:parsed.assumptions,...extra},{reading:parsed.reading});}

test('weekday and EOD deadlines keep before even before all fields can be resolved',()=>{
  for(const text of ['By Friday midnight PT.','By EOD PT.','By close of business PT.','周五午夜前PT','周五前PT','最晚周五PT'])assert.equal(parseResetAnnouncement(text).fields.relation,'before',text);
  const friday=resolve('By Friday midnight PT.');assert.equal(friday.fields.date,'2026-10-30');assert.equal(friday.fields.boundary,'end-of-day');assert.equal(friday.needsBoundaryChoice,false);
  const result=calculate(friday);assert.equal(result.relation,'before');assert.equal(result.instant.toISOString(),'2026-10-31T07:00:00.000Z');
});

test('a weekday without a clock and EOD/COB keep the missing clock instead of inventing midnight or 17:00',()=>{
  for(const text of ['By EOD PT.','By COB PT.','By Friday PT.','周五前PT']){
    const parsed=resolve(text);assert.equal(parsed.fields.relation,'before',text);assert.equal(parsed.fields.time,undefined,text);assert.equal(parsed.fields.boundary,undefined,text);assert.ok(parsed.missing.includes('当地钟点'),text);assert.equal(calculate(parsed).status,'incomplete',text);
  }
  const eod=resolve('By EOD PT.');assert.equal(eod.fields.date,'2026-10-28');assert.match(eod.warnings.join(''),/具体截止钟点需确认/);
  assert.equal(calculate(eod,{time:'17:00'}).relation,'before');
});

test('author attributions and Chinese 前往 do not become deadline markers',()=>{
  for(const text of ['Posted by Tibo on Friday at 9 AM PT.','Announcement by @Friday: 2026-10-28 09:00 PT.','Built by OpenAI, reset 2026-10-28 09:00 PT.','周五前往上海'])assert.equal(parseResetAnnouncement(text).fields.relation,undefined,text);
});

test('tomorrow and Chinese morning clocks use the source publication day, not the Beijing date',()=>{
  for(const text of ['Tomorrow before 10 AM PST.','明天上午10点前太平洋时间']){
    const parsed=resolve(text);assert.equal(parsed.fields.date,'2026-10-29',text);assert.equal(parsed.fields.time,'10:00',text);assert.equal(parsed.fields.relation,'before',text);
    const result=calculate(parsed);assert.equal(result.instant.toISOString(),'2026-10-29T17:00:00.000Z');assert.equal(partsAt(result.instant,'Asia/Shanghai').date,'2026-10-30');assert.equal(partsAt(result.instant,'Asia/Shanghai').time,'01:00');assert.equal(result.dateResolution.resolvedDate,'2026-10-29');
  }
});

test('Chinese relative evening clocks keep their PM meaning and source calendar date',()=>{
  const samples=[
    ['今晚9点 PT','2026-10-28','21:00','2026-10-29T04:00:00.000Z'],
    ['明晚9点 PT','2026-10-29','21:00','2026-10-30T04:00:00.000Z'],
    ['今夜9点半 PT','2026-10-28','21:30','2026-10-29T04:30:00.000Z'],
    ['昨晚9时15分 PT','2026-10-27','21:15','2026-10-28T04:15:00.000Z'],
  ];
  for(const [text,date,time,instant]of samples){
    const parsed=resolve(text);assert.equal(parsed.status,'recognized',text);
    assert.equal(parsed.fields.date,date,text);assert.equal(parsed.fields.time,time,text);
    assert.equal(calculate(parsed).instant.toISOString(),instant,text);
  }
  const deadline=resolve('明晚9点之前 PT');assert.equal(calculate(deadline).relation,'before');
  assert.equal(calculate(deadline).instant.toISOString(),'2026-10-30T04:00:00.000Z');
});

test('relative evening dates do not override explicit AM/PM or silently choose a midnight boundary',()=>{
  assert.equal(resolve('今晚 9 AM PT').fields.time,'09:00');
  assert.equal(resolve('明晚 9 PM PT').fields.time,'21:00');
  const ambiguousZone=resolve('今晚9点 CST');assert.equal(ambiguousZone.status,'incomplete');
  assert.equal(ambiguousZone.fields.source,undefined);
  for(const text of ['今晚12点 PT','明晚12点前 PT','今夜12点半 PT','昨晚12时 PT','今晚0点 PT','明晚0点半 PT'])assert.throws(()=>resolve(text),/跨日.*完整日期/,text);
});

test('today, yesterday and day-after-tomorrow resolve in the selected source clock',()=>{
  for(const [text,date]of [['Today at 10 AM PST.','2026-10-28'],['昨天 09:00 PT','2026-10-27'],['后天上午10点 PT','2026-10-30'],['The day after tomorrow at 09:00 PT','2026-10-30']])assert.equal(resolve(text).fields.date,date,text);
  const local=resolve('Tomorrow at 9 AM PST.','2026-10-29T07:30:00Z');
  const strict=resolve('Tomorrow at 9 AM PST.','2026-10-29T07:30:00Z','strict');
  assert.equal(local.fields.date,'2026-10-30');assert.equal(strict.fields.date,'2026-10-29');
});

test('relative dates cross year and leap-day boundaries without using host timezone',()=>{
  assert.equal(resolve('Tomorrow at 09:00 PT','2026-12-31T23:30:00Z').fields.date,'2027-01-01');
  assert.equal(resolve('后天上午10点 PT','2028-02-28T18:00:00Z').fields.date,'2028-03-01');
});

test('a bare weekday includes today and does not silently move a passed clock to next week',()=>{
  const friday=resolve('By Friday 10 AM PT.','2026-10-30T22:00:00Z');
  assert.equal(friday.fields.date,'2026-10-30');assert.match(friday.dateResolution.label,/含当天/);assert.equal(calculate(friday).instant.toISOString(),'2026-10-30T17:00:00.000Z');
});

test('this-week and next-week words use the source calendar week Monday through Sunday',()=>{
  assert.equal(resolve('By this Friday 09:00 PT.','2026-10-31T18:00:00Z').fields.date,'2026-10-30');
  const next=resolve('下周五下午3点前 PT');assert.equal(next.fields.date,'2026-11-06');assert.match(next.dateResolution.label,/周一至周日/);
  assert.equal(calculate(next).instant.toISOString(),'2026-11-06T23:00:00.000Z'); // November rule is PST.
  assert.equal(resolve('Next week Friday at 09:00 PT.').fields.date,'2026-11-06');
  assert.equal(resolve('Next week on Friday at 09:00 PT.').fields.date,'2026-11-06');
  assert.equal(resolve('Friday next week at 09:00 PT.').fields.date,'2026-11-06');
});

test('ambiguous next Friday exposes date choices and keeps the cutoff relation',()=>{
  const parsed=resolve('By next Friday midnight PT.');assert.equal(parsed.status,'incomplete');assert.equal(parsed.fields.date,undefined);assert.equal(parsed.fields.relation,'before');assert.equal(parsed.dateResolutionBlocked,true);
  assert.deepEqual(parsed.dateCandidates.map(c=>c.date),['2026-10-30','2026-11-06']);assert.equal(calculate(parsed).status,'incomplete');
  const unique=resolve('Next Friday at 09:00 PT.','2026-10-31T18:00:00Z');assert.equal(unique.fields.date,'2026-11-06');
});

test('explicit dates take priority over relative phrases, while conflicting relative choices remain unresolved',()=>{
  const explicit=resolve('By next Friday midnight on 2026-11-06 PT.');assert.equal(explicit.fields.date,'2026-11-06');assert.equal(explicit.status,'recognized');
  const conflicting=resolve('By tomorrow or Friday at 9 AM PT.');assert.equal(conflicting.fields.date,undefined);assert.equal(conflicting.dateResolution.status,'blocked');assert.equal(conflicting.fields.relation,'before');
});

test('relative DST gap and repeated-clock events still require actual resolution',()=>{
  const gap=calculate(resolve('Tomorrow at 02:30 PT.','2026-03-07T18:00:00Z'));assert.equal(gap.status,'gap');assert.equal(gap.instant,undefined);
  const fold=calculate(resolve('Tomorrow at 01:30 PT.','2026-10-31T18:00:00Z'));assert.equal(fold.status,'fold');assert.equal(fold.instant,undefined);assert.equal(fold.candidates.length,2);
});

test('resolved relative dates and their explanation survive snapshot restore without following a later now',()=>{
  const parsed=resolve('Tomorrow before 10 AM PST.'),snapshot=JSON.parse(JSON.stringify(parsed));
  const restored=resolveAnnouncementContext(snapshot,{asOf:'2026-11-20T18:00:00Z',defaultPublication:true});assert.equal(restored.fields.date,'2026-10-29');
  assert.equal(calculate(restored).instant.toISOString(),calculate(parsed).instant.toISOString());assert.equal(calculate(restored).dateResolution.resolvedDate,'2026-10-29');
  assert.equal(calculate(parsed,{date:'2026-11-20'}).dateResolution,undefined);
});

test('a future start date for a daily rule cannot be silently discarded',()=>{
  const parsed=resolve('Daily resets start tomorrow at 09:00 PT.');assert.equal(parsed.needsRuleChoice,true);assert.equal(parsed.kind,'event');assert.equal(parsed.fields.date,'2026-10-29');assert.equal(calculate(parsed).status,'incomplete');
});
