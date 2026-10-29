import test from 'node:test';
import assert from 'node:assert/strict';
import {announcementReadingSummary,migrateAnnouncementState,announcementPublicationDateDiffers,announcementCueGroups,announcementCuePosition,announcementDateSummary} from '../dist/reset-announcement.mjs';
import {resolveAnnouncementReading,parseResetAnnouncement,calculateAnnouncementReading} from '../dist/reset-announcement-model.mjs';

function readingAt(date,mode='local'){
  const text=`Quota resets on ${date} before midnight PST.`,parsed=resolveAnnouncementReading(parseResetAnnouncement(text),{text,interpretation:mode});
  return calculateAnnouncementReading({...parsed.fields,date,time:'00:00',relation:'before',boundary:'end-of-day'},{reading:parsed.reading});
}

test('the compact result presents PT as the adopted reading and strict PST as a later supplement',()=>{
  const summary=announcementReadingSummary(readingAt('2026-10-28'));
  assert.match(summary.notice,/原文 PST，暂按当地 PT/);assert.match(summary.notice,/PDT/);
  assert.match(summary.supplement,/严格 PST.*16:00 前.*晚 1 小时/);assert.doesNotMatch(summary.supplement,/2026-10-29/);
  assert.equal(summary.toggleMode,'strict');assert.equal(summary.toggleLabel,'查看严格 PST');
});

test('strict view offers the same-date local reading and winter does not invent a one-hour difference',()=>{
  const strict=announcementReadingSummary(readingAt('2026-10-28','strict'));
  assert.match(strict.notice,/当前查看严格 PST/);assert.match(strict.supplement,/当地 PT.*15:00 前.*早 1 小时/);assert.equal(strict.toggleMode,'local');
  const winter=announcementReadingSummary(readingAt('2026-12-02'));
  assert.match(winter.supplement,/相同/);assert.doesNotMatch(winter.supplement,/晚 1 小时|早 1 小时/);
});

test('a strict supplement keeps its date when the extra hour crosses Beijing midnight',()=>{
  const text='Quota resets on 2026-10-28 at 8:30 AM PST.',parsed=resolveAnnouncementReading(parseResetAnnouncement(text),{text}),result=calculateAnnouncementReading(parsed.fields,{reading:parsed.reading});
  assert.match(announcementReadingSummary(result).supplement,/2026-10-29 00:30/);
});

test('upgrading an extracted PST snapshot recalculates today in PT using its saved publication instant',()=>{
  const state={flowVersion:3,hasExtraction:true,text:'Today lands by midnight PST.',source:'PST',date:'2026-10-28',contextReference:'2026-10-29T07:30:00Z',assumptions:['default publication day'],boundary:'end-of-day'};
  const migrated=migrateAnnouncementState(state);
  assert.equal(migrated.source,'PT');assert.equal(migrated.date,'2026-10-29');assert.equal(migrated.reading.mode,'local');assert.equal(migrated.contextReference,state.contextReference);
  assert.equal(state.date,'2026-10-28');
});

test('upgrading preserves an explicitly edited date and never rewrites explicit fixed PST or a saved v4 choice',()=>{
  const saved={flowVersion:3,hasExtraction:true,text:'Today lands by midnight PST.',source:'PST',date:'2026-10-20',contextReference:'2026-10-29T07:30:00Z',assumptions:[]};
  assert.equal(migrateAnnouncementState(saved).date,'2026-10-20');
  const explicit={...saved,text:'Lands by midnight fixed PST.'};assert.equal(migrateAnnouncementState(explicit),explicit);
  const chosen={...saved,flowVersion:4,reading:{mode:'strict'}};assert.equal(migrateAnnouncementState(chosen),chosen);
});

test('publication-date ambiguity is detected only in the PT/PST midnight gap',()=>{
  assert.equal(announcementPublicationDateDiffers('2026-10-29T07:30:00Z'),true);
  assert.equal(announcementPublicationDateDiffers('2026-10-29T16:00:00Z'),false);
  assert.equal(announcementPublicationDateDiffers('2026-12-02T07:30:00Z'),false);
});

test('short speech clips remain behind three navigation groups and retain exact sentence position',()=>{
  const scenes=[
    ...['pt','pst','pdt','local-date'].map(id=>({id,group:'source'})),
    ...['local-clock','utc-clock','beijing-clock'].map(id=>({id,group:'conversion'})),
    {id:'deadline',group:'meaning'}
  ];
  assert.deepEqual(announcementCueGroups(scenes).map(({id,index,count})=>({id,index,count})),[{id:'source',index:0,count:4},{id:'conversion',index:4,count:3},{id:'meaning',index:7,count:1}]);
  assert.deepEqual(announcementCuePosition(scenes,3),{group:'source',index:4,count:4,total:8});
  assert.deepEqual(announcementCuePosition(scenes,4),{group:'conversion',index:1,count:3,total:8});
  assert.equal(announcementCuePosition(scenes,-1),null);assert.equal(announcementCuePosition(scenes,8),null);
});

test('date guidance uses the resolved source-date explanation and keeps EOD clock confirmation explicit',()=>{
  const label='按 PT 当地明天理解为 2026-10-30，可修改。';
  assert.equal(announcementDateSummary({dateResolution:{label},date:'2026-10-30'}),label);
  assert.match(announcementDateSummary({dateResolution:{label},timeQualifier:'eod'}),/EOD 的具体截止钟点需确认/);
  assert.doesNotMatch(announcementDateSummary({dateResolution:{label},timeQualifier:'eod',hasClock:true}),/需确认/);
  assert.match(announcementDateSummary({dateResolution:{label},differentPublicationDates:true}),/两种解释沿用此日期/);
});

test('a resolved weekday midnight states the next-day boundary without adding it to ordinary clock times',()=>{
  const dateResolution={status:'resolved',resolvedDate:'2026-10-30',label:'按 PT 当地最近的周五理解为 2026-10-30，可修改。'};
  assert.match(announcementDateSummary({dateResolution,date:'2026-10-30',boundary:'end-of-day'}),/这一天结束，即 10\/31 00:00 前/);
  assert.doesNotMatch(announcementDateSummary({dateResolution,date:'2026-10-30'}),/这一天结束|10\/31/);
  const yearEnd={...dateResolution,resolvedDate:'2026-12-31'};
  assert.match(announcementDateSummary({dateResolution:yearEnd,date:'2026-12-31',boundary:'end-of-day'}),/2027-01-01 00:00 前/);
});

test('an old extracted at-result for a newly recognized deadline requires reanalysis without changing its input',()=>{
  const saved={flowVersion:4,hasExtraction:true,text:'By Friday midnight PT.',source:'PT',relation:'at',date:'2026-10-30',time:'00:00',calculated:true};
  const migrated=migrateAnnouncementState(saved);assert.equal(migrated.legacyReview,true);assert.equal(migrated.calculated,false);assert.equal(migrated.text,saved.text);assert.equal(migrated.date,saved.date);assert.equal(saved.calculated,true);
  const manual={...saved,hasExtraction:false};assert.equal(migrateAnnouncementState(manual),manual);
  const current={...saved,understandingVersion:1};assert.equal(migrateAnnouncementState(current),current);
});
