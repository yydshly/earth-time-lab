import test from 'node:test';
import assert from 'node:assert/strict';
import {globeLessons} from '../dist/globe-lessons-data.mjs';
import {cityTeachingCopy,geographicLessonAnnotations,transitionScene} from '../dist/lesson-visual-model.mjs';
import {partsAt,zonedToInstants} from '../dist/time-engine.mjs';

const stage=(lesson,id)=>globeLessons.find(l=>l.id===lesson).stages.find(s=>s.id===id);

test('teaching meaning accompanies clocks, but example clock copy cannot leak into manual time',()=>{
  const s=stage('clock-reading','two-clocks');
  assert.match(cityTeachingCopy(s,'beijing').teaching,/15:30 = 3:30 PM/);
  assert.match(cityTeachingCopy(s,'beijing').detail,/00:00.*12 AM/);
  assert.deepEqual(cityTeachingCopy(s,'beijing',{modifiedTime:true}),{teaching:'',detail:''});
  assert.deepEqual(cityTeachingCopy(stage('earth-turns','sun-and-earth'),'beijing'),{teaching:'',detail:''});
  assert.deepEqual(cityTeachingCopy(stage('daily-rhythms','availability-example'),'beijing',{mode:'routines'}),{teaching:'',detail:''});
});

test('UTC common reference is kept out of geographical annotations while longitude anchors remain',()=>{
  for(const s of [stage('utc-offsets','common-ruler'),stage('calculate-time','back-to-utc')]){
    assert.ok(s.callouts.some(c=>c.kind==='reference'));
    assert.deepEqual(geographicLessonAnnotations(s),[]);
  }
  const geography=stage('earth-turns','fifteen-degrees');
  assert.equal(geographicLessonAnnotations(geography).length,3);
  assert.equal(geographicLessonAnnotations(geography)[0].active,true);
  assert.deepEqual(geographicLessonAnnotations(geography,{modifiedTime:true}),[]);
});

test('DST semantic scenes preserve the continuous instant while explicitly displaying a nonexistent local interval',()=>{
  const s=stage('season-and-pt','clock-transition');
  const before=transitionScene(s,'before'),gap=transitionScene(s,'gap'),after=transitionScene(s,'after');
  assert.equal(partsAt(before.instant,'America/Los_Angeles').time,'01:59');
  assert.equal(partsAt(after.instant,'America/Los_Angeles').time,'03:00');
  assert.equal(Date.parse(after.instant)-Date.parse(before.instant),60_000);
  assert.equal(gap.instant,before.instant,'the missing local clock must not invent a physical instant');
  assert.match(gap.caption,/02:30.*找不到/);
  assert.match(after.caption,/UTC.*10:00/);
  assert.equal(zonedToInstants(s.transition.date,'02:30','America/Los_Angeles').length,0);
  assert.deepEqual(s.voiceCues.map(c=>c.phase),['before','gap','after']);
  for(const cue of s.voiceCues)assert.equal(cue.instant,transitionScene(s,cue.phase).instant);
  assert.equal(transitionScene(stage('clock-reading','read-date')),null);
});
