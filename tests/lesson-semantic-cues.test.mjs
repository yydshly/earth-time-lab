import test from 'node:test';
import assert from 'node:assert/strict';
import {globeLessons} from '../dist/globe-lessons-data.mjs';
import {lessonCueTarget} from '../dist/lesson-semantic-cues.mjs';
import {partsAt} from '../dist/time-engine.mjs';

const lesson=id=>globeLessons.find(l=>l.id===id);

test('the first three scenes point at place, date and clock as independent short speech clips',()=>{
  const stages=lesson('clock-reading').stages;
  assert.deepEqual(stages[0].voiceCues.map(c=>c.target.field),['teaching','date','time']);
  assert.deepEqual(stages[0].voiceCues.map(c=>c.target.cityId),['beijing','beijing','beijing']);
  for(const stage of stages){
    assert.ok(stage.voiceCues.length>=3);
    assert.equal(stage.narration,stage.voiceCues.map(c=>c.narration).join('\n\n'));
    assert.equal(new Set(stage.voiceCues.map(c=>c.id)).size,stage.voiceCues.length);
    for(const cue of stage.voiceCues){
      assert.ok(cue.narration.length>10&&cue.narration.length<120);
      assert.ok(cue.caption&&cue.caption.length<50);
      assert.ok(lessonCueTarget(stage,cue));
    }
    assert.doesNotMatch(stage.narration,/UTC|偏移/,'the first lesson must not require later terminology');
  }
});

test('different local dates are narrated on their actual city records without moving the shared instant',()=>{
  const stage=lesson('clock-reading').stages[2];
  const dates=stage.voiceCues.filter(c=>c.target.field==='date');
  assert.deepEqual(dates.map(c=>c.target.cityId),['beijing','la']);
  assert.equal(partsAt(stage.instant,'Asia/Shanghai').date,'2026-01-16');
  assert.equal(partsAt(stage.instant,'America/Los_Angeles').date,'2026-01-15');
  assert.ok(stage.voiceCues.every(c=>!c.instant),'camera and target changes must not invent a new event time');
});

test('UTC speech points to the common ruler rather than inventing a geographical UTC city',()=>{
  for(const stage of lesson('utc-offsets').stages){
    assert.ok(stage.voiceCues.length>=3);
    for(const cue of stage.voiceCues){
      const target=lessonCueTarget(stage,cue);
      assert.ok(target);
      if(target.reference)assert.equal(target.cityId,undefined);
      if(target.cityId)assert.ok(stage.cities.includes(target.cityId));
    }
  }
  const common=lesson('utc-offsets').stages[0];
  assert.equal(common.voiceCues[0].target.reference,'utc');
  assert.equal(common.voiceCues.at(-1).target.cityId,'london');
  assert.equal(partsAt(common.instant,'UTC').time,'07:30');
});

test('turning off follow or changing the teaching instant clears semantic emphasis',()=>{
  const stage=lesson('clock-reading').stages[0],cue=stage.voiceCues[1];
  assert.equal(lessonCueTarget(stage,cue,{follow:false}),null);
  assert.equal(lessonCueTarget(stage,cue,{modifiedTime:true}),null);
  assert.equal(lessonCueTarget(stage,{target:{cityId:'la',field:'date'}}),null);
  assert.equal(lessonCueTarget(stage,{target:{reference:'ocean',field:'time'}}),null);
  assert.equal(lessonCueTarget(stage,{target:{cityId:'beijing',field:'unknown'}}),null);
});

test('existing day-cycle and skipped-clock cues retain their timed semantics',()=>{
  const day=lesson('earth-turns').stages[0],transition=lesson('season-and-pt').stages[2];
  assert.deepEqual(day.voiceCues.map(c=>[c.fromMinutes,c.toMinutes]),[[0,360],[360,720],[720,1080],[1080,1440]]);
  assert.deepEqual(transition.voiceCues.map(c=>c.phase),['before','gap','after']);
  assert.ok([...day.voiceCues,...transition.voiceCues].every(c=>c.caption));
  assert.ok([...day.voiceCues,...transition.voiceCues].every(c=>lessonCueTarget(day,c)===null));
});
