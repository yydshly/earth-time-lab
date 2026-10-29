import test from 'node:test';
import assert from 'node:assert/strict';
import {parseResetAnnouncement,resolveAnnouncementReading,resolveAnnouncementContext,calculateAnnouncementReading} from '../dist/reset-announcement-model.mjs';
import {partsAt} from '../dist/time-engine.mjs';

function read(text,interpretation='local'){
  return resolveAnnouncementReading(parseResetAnnouncement(text),{text,interpretation});
}
function calculate(parsed,extra={}){
  return calculateAnnouncementReading({kind:parsed.kind,...parsed.fields,...extra},{reading:parsed.reading});
}

test('an ordinary PST post defaults to local PT and keeps literal PST as the supplement',()=>{
  const parsed=read('Reset before 2026-10-28 00:00 PST');
  assert.equal(parsed.fields.source,'PT');assert.equal(parsed.reading.originalSource,'PST');assert.equal(parsed.reading.mode,'local');
  const result=calculate(parsed);
  assert.equal(result.source.id,'PT');assert.equal(result.instant.toISOString(),'2026-10-28T07:00:00.000Z');
  assert.equal(partsAt(result.instant,'Asia/Shanghai').time,'15:00');
  assert.equal(result.supplement.source.id,'PST');assert.equal(result.supplement.instant.toISOString(),'2026-10-28T08:00:00.000Z');
  assert.equal(result.reading.differenceMinutes,60);assert.equal(result.alternatives[0].interpretation,'strict');
});

test('switching to strict PST keeps the same date and reverses the explicit comparison',()=>{
  const local=read('Reset before 2026-10-28 00:00 PST');
  const strict=resolveAnnouncementReading(local,{text:'Reset before 2026-10-28 00:00 PST',interpretation:'strict'});
  assert.equal(strict.fields.source,'PST');assert.equal(strict.fields.date,local.fields.date);
  const result=calculate(strict);assert.equal(result.instant.toISOString(),'2026-10-28T08:00:00.000Z');
  assert.equal(result.reading.mode,'strict');assert.equal(result.reading.differenceMinutes,-60);
  assert.equal(result.supplement.source.id,'PT');assert.equal(result.alternatives[0].interpretation,'local');
});

test('winter PT and PST coincide without inventing a one-hour difference',()=>{
  const result=calculate(read('Reset before 2026-12-02 00:00 PST'));
  assert.equal(result.source.id,'PT');assert.equal(result.reading.sameInstant,true);
  assert.equal(result.reading.differenceMinutes,0);assert.deepEqual(result.alternatives,[]);
  assert.equal(result.supplement.instant.toISOString(),result.instant.toISOString());
});

test('explicit fixed/strict PST wording, numeric offsets and timestamps retain their rule',()=>{
  for(const text of ['2026-10-28 09:00 fixed PST','2026-10-28 09:00 strictly Pacific Standard Time','2026-10-28 09:00 严格按PST','2026-10-28 09:00 固定太平洋标准时间']){
    const parsed=read(text);assert.equal(parsed.fields.source,'PST',text);assert.equal(parsed.reading.switchable,false,text);
    assert.equal(calculate(parsed).instant.toISOString(),'2026-10-28T17:00:00.000Z');
  }
  const numeric=read('Reset 2026-10-28 09:00 PST (UTC-08:00)');
  assert.equal(numeric.fields.source,'UTC-08:00');assert.equal(numeric.status,'recognized');assert.equal(numeric.reading.mode,'explicit');
  assert.equal(calculate(numeric).instant.toISOString(),'2026-10-28T17:00:00.000Z');
  const timestamp=read('Reset at 2026-10-28T00:00:30-08:00 PST');
  assert.equal(calculate(timestamp).instant.toISOString(),'2026-10-28T08:00:30.000Z');assert.equal(timestamp.reading.switchable,false);
});

test('manually supplied PST remains literal and stale metadata cannot override another selected source',()=>{
  const fields={kind:'event',date:'2026-10-28',time:'09:00',source:'PST'};
  const manual=calculateAnnouncementReading(fields);
  assert.equal(manual.source.id,'PST');assert.equal(manual.instant.toISOString(),'2026-10-28T17:00:00.000Z');
  assert.equal(manual.reading.switchable,false);assert.deepEqual(manual.alternatives,[]);
  const previous=read('2026-10-28 09:00 PST').reading;
  const changed=calculateAnnouncementReading({...fields,source:'ET'},{reading:previous});
  assert.equal(changed.source.id,'ET');assert.equal(changed.reading.switchable,false);assert.equal(changed.reading.mode,'explicit');
});

test('assumed today is chosen from PT before context resolution, including its date boundary',()=>{
  const raw='Today lands before midnight PST.';
  const selected=read(raw),reference=new Date('2026-10-28T07:30:00Z');
  // PT is already Oct 28; fixed PST is still Oct 27 at this reference instant.
  const local=resolveAnnouncementContext(selected,{asOf:reference,defaultPublication:true});
  assert.equal(local.fields.date,'2026-10-28');assert.equal(local.fields.boundary,'end-of-day');
  const result=calculate(local);assert.equal(result.instant.toISOString(),'2026-10-29T07:00:00.000Z');
  const persisted=JSON.parse(JSON.stringify(local));
  const strict=resolveAnnouncementReading(persisted,{text:raw,interpretation:'strict'});
  assert.equal(strict.fields.date,'2026-10-28');assert.equal(calculate(strict).instant.toISOString(),'2026-10-29T08:00:00.000Z');
});

test('an ordinary PST post mapped to a nonexistent or repeated PT time requires resolution',()=>{
  const gap=calculate(read('2026-03-08 02:30 PST'));
  assert.equal(gap.status,'gap');assert.equal(gap.instant,undefined);assert.deepEqual(gap.alternatives,[]);
  assert.equal(gap.supplement.status,'ready');
  const parsed=read('2026-11-01 01:30 PST'),fold=calculate(parsed);
  assert.equal(fold.status,'fold');assert.equal(fold.instant,undefined);assert.equal(fold.candidates.length,2);
  const first=calculate(parsed,{foldPick:0}),second=calculate(parsed,{foldPick:1});
  assert.equal(first.instant.toISOString(),'2026-11-01T08:30:00.000Z');assert.equal(first.reading.differenceMinutes,60);
  assert.equal(second.instant.toISOString(),'2026-11-01T09:30:00.000Z');assert.equal(second.reading.sameInstant,true);
});

test('daily-rule comparison stays on the selected next event date instead of choosing a different day',()=>{
  const parsed=read('Resets daily at 00:00 PST');
  const result=calculate(parsed,{asOf:'2026-10-28T07:30:00Z'});
  assert.equal(result.instant.toISOString(),'2026-10-29T07:00:00.000Z');
  assert.equal(result.supplement.instant.toISOString(),'2026-10-29T08:00:00.000Z');
  assert.equal(result.reading.differenceMinutes,60);
});

test('daily interpretation switching stays on one occurrence between the two midnight boundaries',()=>{
  const local=read('Resets daily at 00:00 PST'),reference='2026-10-28T07:30:00Z';
  const first=calculate(local,{asOf:reference});assert.equal(first.localDate,'2026-10-29');
  const strict=resolveAnnouncementReading(local,{interpretation:'strict'});
  const switched=calculateAnnouncementReading({kind:'daily',...strict.fields,asOf:reference},{reading:strict.reading,occurrenceDate:first.localDate});
  assert.equal(switched.kind,'daily');assert.equal(switched.localDate,'2026-10-29');
  assert.equal(switched.reference.toISOString(),reference.replace('Z','.000Z'));
  assert.equal(switched.instant.toISOString(),'2026-10-29T08:00:00.000Z');
  assert.equal(switched.supplement.instant.toISOString(),'2026-10-29T07:00:00.000Z');
  // The selected strict occurrence remains the same after a stored-view restore.
  const restored=JSON.parse(JSON.stringify({reading:switched.reading,occurrenceDate:switched.localDate}));
  const refreshed=calculateAnnouncementReading({kind:'daily',...strict.fields,asOf:'2026-10-29T08:15:00Z'},restored);
  assert.equal(refreshed.instant.toISOString(),switched.instant.toISOString());
  assert.throws(()=>calculateAnnouncementReading({kind:'daily',...strict.fields,asOf:reference},{reading:strict.reading,occurrenceDate:'2026-02-30'}),/日期/);
});

test('the actual English Tibo phrase resolves today before midnight using local PT by default',()=>{
  const text='Lands by midnight PST.',parsed=read(text);
  assert.equal(parsed.relation,'before');assert.equal(parsed.midnightBefore,true);assert.equal(parsed.fields.source,'PT');
  const contextual=resolveAnnouncementContext(parsed,{asOf:'2026-10-28T16:00:00Z',defaultPublication:true});
  const result=calculate(contextual);assert.equal(result.relation,'before');assert.equal(result.contextDate,'2026-10-28');
  assert.equal(partsAt(result.instant,'Asia/Shanghai').date,'2026-10-29');assert.equal(partsAt(result.instant,'Asia/Shanghai').time,'15:00');
  assert.equal(partsAt(result.supplement.instant,'Asia/Shanghai').time,'16:00');
});

test('by noon and numeric clocks are bounded deadlines while by-author attribution is not',()=>{
  for(const text of ['Lands by noon 2026-10-28 PT','Reset by 09:30 on 2026-10-28 PT','We will reset by 9 AM on 2026-10-28 PT']){
    const parsed=read(text);assert.equal(parsed.relation,'before',text);assert.equal(parsed.status,'recognized',text);
    assert.equal(calculate(parsed).relation,'before',text);
  }
  for(const text of ['Posted by Tibo on 2026-10-28 at 9 AM PST','Reset announcement by @thsottiaux: 2026-10-28 09:30 PT','Built by OpenAI, reset at 2026-10-28 09:00 PT']){
    const parsed=read(text);assert.equal(parsed.relation,undefined,text);assert.equal(calculate(parsed).relation,'at',text);
  }
});

test('PT and explicitly named PDT keep their distinct meaning',()=>{
  assert.equal(read('2026-10-28 09:00 PT').fields.source,'PT');
  const pdt=read('2026-12-02 09:00 PDT');assert.equal(pdt.fields.source,'PDT');assert.equal(pdt.reading.switchable,false);
  assert.equal(calculate(pdt).instant.toISOString(),'2026-12-02T16:00:00.000Z');
});
