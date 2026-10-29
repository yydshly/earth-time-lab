import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoutineVoiceCues,routineVoiceArcFocus} from '../dist/routine-voice-model.mjs';
import {routineProfiles} from '../dist/routine-atlas-data.mjs';
import {routineSnapshot} from '../dist/routine-atlas-model.mjs';

const city={id:'beijing',name:'北京',zone:'Asia/Shanghai'},profile=routineProfiles.find(p=>p.cityId===city.id);
function cues(at='2026-01-15T12:00:00Z',person=profile.person,custom=false){return buildRoutineVoiceCues({city,profile,person,state:routineSnapshot(at,city,profile,person),custom});}

test('routine narration separates the date, clock, outer activity and inner personal settings',()=>{
  const speech=cues();
  assert.deepEqual(speech.map(c=>c.highlight.field),['date','time','regional','personal','sleep','background']);
  assert.match(speech[0].text,/2026年1月15日，周四/);
  assert.match(speech[1].text,/北京当地是20点整/);
  assert.match(speech[2].text,/20:00到23:00，是家务与个人时间/);
  assert.match(speech[3].text,/不在此人的可联系时段内/);
  assert.equal(speech.at(-1).text,profile.narration);
  assert.ok(speech.every(c=>c.caption&&c.text&&c.highlight));
});

test('the date and clock are taken from the same selected local instant, including midnight',()=>{
  const speech=cues('2026-01-15T16:00:00Z');
  assert.match(speech[0].text,/2026年1月16日，周五/);
  assert.match(speech[1].text,/北京当地是0点整/);
  assert.match(speech[2].text,/00:00到07:00，是睡眠示意/);
  assert.match(speech[3].text,/在此人的睡眠设置内/);
});

test('custom schedules are spoken as one person rather than attributed to a region',()=>{
  const person={...profile.person,name:'夜班朋友',start:'22:00',end:'06:00',sleepStart:'08:00',sleepEnd:'16:00',weekdays:[5]};
  const speech=cues('2026-01-16T17:00:00Z',person,true);
  assert.match(speech[3].text,/夜班朋友的个人设置/);
  assert.match(speech[3].text,/周五、22:00到06:00/);
  assert.match(speech[3].text,/完整 30 分钟符合此人的设置，仍需本人确认/);
  assert.match(speech[4].text,/08:00到16:00/);
  assert.match(speech[2].text,/今天是周末/);
  assert.doesNotMatch(speech[3].text,/夜班朋友的虚构人物示例/);
});

test('no selected weekdays does not invent a personal contact window',()=>{
  const speech=cues(undefined,{...profile.person,weekdays:[]});
  assert.match(speech[3].text,/没有选择任何可联系的星期/);
  assert.match(speech[3].text,/如果没有绿色区段/);
  assert.match(speech[3].text,/不在此人的可联系时段内/);
});

test('outer activity cues never illuminate personal arcs and inner sleep cues never illuminate regional sleep',()=>{
  const speech=cues(),regional=speech[2].highlight,personal=speech[3].highlight,sleep=speech[4].highlight;
  assert.equal(routineVoiceArcFocus(regional,{layer:'regional',kind:'free',current:true}),true);
  assert.equal(routineVoiceArcFocus(regional,{layer:'regional',kind:'free',current:false}),false);
  assert.equal(routineVoiceArcFocus(regional,{layer:'personal',kind:'free',current:true}),false);
  assert.equal(routineVoiceArcFocus(personal,{layer:'personal',kind:'available',current:false}),true);
  assert.equal(routineVoiceArcFocus(personal,{layer:'personal',kind:'sleep',current:true}),false);
  assert.equal(routineVoiceArcFocus(sleep,{layer:'personal',kind:'sleep',current:false}),true);
  assert.equal(routineVoiceArcFocus(sleep,{layer:'regional',kind:'sleep',current:true}),false);
  assert.equal(routineVoiceArcFocus(speech[0].highlight,{layer:'personal',kind:'available',current:true}),false);
  assert.equal(routineVoiceArcFocus(null,{layer:'personal',kind:'available',current:true}),false);
});
