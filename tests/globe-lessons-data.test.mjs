import test from 'node:test';
import assert from 'node:assert/strict';
import {globeLessons,globeLessonSources} from '../dist/globe-lessons-data.mjs';
import {partsAt,offsetMinutes,zonedToInstants} from '../dist/time-engine.mjs';

const byLesson=id=>globeLessons.find(lesson=>lesson.id===id);
const scene=(lesson,id)=>byLesson(lesson).stages.find(stage=>stage.id===id);
const clock=(stage,zone)=>partsAt(stage.instant,zone);
const assertClock=(stage,zone,date,time)=>{
  const p=clock(stage,zone);
  assert.equal(p.date,date,`${stage.id}: ${zone} date`);
  assert.equal(p.time,time,`${stage.id}: ${zone} clock`);
};

test('the beginner route has eight ordered lessons and 24 renderable narrated scenes',()=>{
  assert.equal(globeLessons.length,8);
  assert.equal(new Set(globeLessons.map(l=>l.id)).size,8);
  assert.equal(globeLessons.flatMap(l=>l.stages).length,24);
  assert.deepEqual(globeLessons.map(l=>l.mode),['clocks','rotation','offsets','conversion','boundaries','dst','routines','meeting']);
  const sourceIds=new Set(globeLessonSources.map(s=>s.id));
  for(const [index,lesson]of globeLessons.entries()){
    assert.equal(lesson.number,index+1);
    assert.ok(lesson.title&&lesson.takeaway&&lesson.question);
    assert.equal(lesson.narration,lesson.stages.map(s=>s.narration).join('\n\n'),'voice must narrate the same scene copy that the interface displays');
    assert.ok(lesson.sources.length>0&&lesson.sources.every(id=>sourceIds.has(id)),'all source links resolve');
    assert.ok(lesson.quiz.options.length>=2&&lesson.quiz.options.length<=4);
    assert.ok(Number.isInteger(lesson.quiz.answer)&&lesson.quiz.answer>=0&&lesson.quiz.answer<lesson.quiz.options.length);
    assert.equal(new Set(lesson.stages.map(s=>s.id)).size,lesson.stages.length);
    for(const stage of lesson.stages){
      assert.match(stage.instant,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      assert.equal(new Date(stage.instant).toISOString().slice(0,19)+'Z',stage.instant);
      assert.ok(['none','ideal','legal'].includes(stage.layer));
      assert.ok(stage.cities.length<=3&&new Set(stage.cities).size===stage.cities.length);
      assert.ok(stage.narration.length>=60&&stage.narration.length<=(stage.voiceCues?400:180),'scene audio remains a short, complete teaching step');
      for(const p of [stage.focus,...stage.callouts]){
        assert.ok(Number.isFinite(p.lat)&&p.lat>=-90&&p.lat<=90);
        assert.ok(Number.isFinite(p.lon)&&p.lon>=-180&&p.lon<=180);
      }
    }
  }
});

test('the first lesson distinguishes a written clock from a shared instant and date',()=>{
  const read=scene('clock-reading','read-date');
  assertClock(read,'Asia/Shanghai','2026-01-15','15:30');
  const shared=scene('clock-reading','same-instant');
  assertClock(shared,'Asia/Shanghai','2026-01-16','00:00');
  assertClock(shared,'America/Los_Angeles','2026-01-15','08:00');
  assertClock(shared,'America/New_York','2026-01-15','11:00');
  const notation=scene('clock-reading','two-clocks');
  assert.equal(notation.instant,read.instant,'changing the written notation must not move time');
  assert.equal(notation.clockFormat,'both');
  assert.match(notation.callouts[0].text,/15:30.*3:30 PM/);
  assert.deepEqual(byLesson('clock-reading').stages.map(s=>s.presentation),['local','notation','comparison']);
  for(const s of byLesson('clock-reading').stages)assert.doesNotMatch(s.caption+s.narration,/UTC|偏移|协调世界时/,'the first lesson does not require terms introduced later');
});

test('the day demonstration starts at Beijing dawn and carries a next-day endpoint',()=>{
  const day=scene('earth-turns','sun-and-earth');
  assert.equal(day.dayCycle,true);
  assert.ok(day.cities.includes('beijing'));
  assertClock(day,'Asia/Shanghai','2026-03-21','06:00');
  const next={...day,instant:new Date(Date.parse(day.instant)+86_400_000).toISOString()};
  assertClock(next,'Asia/Shanghai','2026-03-22','06:00');
  assert.match(day.narration,/移动视角.*推进时间/);
  assert.ok(globeLessons.every(l=>l.stages.every(s=>s.caption?.trim())),'each scene has a visible caption tied to its own narration');
});

test('day voice cues cover consecutive six-hour phases without gaps or duplicate dates',()=>{
  const day=scene('earth-turns','sun-and-earth');
  assert.deepEqual(day.voiceCues.map(c=>[c.fromMinutes,c.toMinutes]),[[0,360],[360,720],[720,1080],[1080,1440]]);
  assert.equal(new Set(day.voiceCues.map(c=>c.id)).size,4);
  assert.equal(day.narration,day.voiceCues.map(c=>c.narration).join('\n\n'));
  assert.doesNotMatch(day.voiceCues.slice(0,2).map(c=>c.narration).join(''),/午夜|翻页|下一天/,'morning/afternoon narration must not announce the date rollover');
  const expected=[['2026-03-21','06:00'],['2026-03-21','12:00'],['2026-03-21','18:00'],['2026-03-22','00:00']];
  for(const [index,cue] of day.voiceCues.entries()){
    assert.ok(cue.narration.length>=40&&cue.narration.length<100);
    const start={...day,instant:new Date(Date.parse(day.instant)+cue.fromMinutes*60_000).toISOString()};
    assertClock(start,'Asia/Shanghai',...expected[index]);
  }
});

test('the UTC scene teaches real half-hour and quarter-hour offsets',()=>{
  const stage=scene('utc-offsets','fractional-offsets');
  assert.equal(offsetMinutes(stage.instant,'Asia/Kolkata'),330);
  assert.equal(offsetMinutes(stage.instant,'Asia/Kathmandu'),345);
  assertClock(stage,'Asia/Kolkata','2026-01-15','13:00');
  assertClock(stage,'Asia/Kathmandu','2026-01-15','13:15');
  assertClock(stage,'Asia/Shanghai','2026-01-15','15:30');
  assert.equal(offsetMinutes(stage.instant,'Asia/Kathmandu')-offsetMinutes(stage.instant,'Asia/Kolkata'),15);
});

test('the conversion journey preserves one instant while crossing midnight',()=>{
  const stages=byLesson('calculate-time').stages;
  assert.equal(new Set(stages.map(s=>s.instant)).size,1,'moving the camera through UTC must not move the actual meeting time');
  assertClock(stages[0],'Asia/Shanghai','2026-01-16','02:00');
  assertClock(stages[1],'UTC','2026-01-15','18:00');
  assertClock(stages[2],'America/Los_Angeles','2026-01-15','10:00');
  assertClock(stages[2],'America/New_York','2026-01-15','13:00');
  const [reconstructed]=zonedToInstants('2026-01-16','02:00','Asia/Shanghai');
  assert.equal(reconstructed.toISOString(),new Date(stages[2].instant).toISOString());
});

test('the real-boundary scenes separate shared offsets from nationality',()=>{
  const standard=scene('real-boundaries','one-standard');
  assertClock(standard,'Asia/Shanghai','2026-01-15','20:00');
  assertClock(standard,'Asia/Singapore','2026-01-15','20:00');
  const many=scene('real-boundaries','many-zones');
  assert.equal(many.layer,'legal');
  assertClock(many,'America/Los_Angeles','2026-01-15','09:00');
  assertClock(many,'America/Chicago','2026-01-15','11:00');
  assertClock(many,'America/New_York','2026-01-15','12:00');
  assert.equal(scene('real-boundaries','ideal-versus-legal').layer,'ideal');
});

test('PT scenes retain LA 09:00 while changing Beijing difference with the season',()=>{
  const winter=scene('season-and-pt','winter-pst'),summer=scene('season-and-pt','summer-pdt');
  assertClock(winter,'America/Los_Angeles','2026-01-15','09:00');
  assertClock(summer,'America/Los_Angeles','2026-07-15','09:00');
  assertClock(winter,'Asia/Shanghai','2026-01-16','01:00');
  assertClock(summer,'Asia/Shanghai','2026-07-16','00:00');
  assert.equal(offsetMinutes(winter.instant,'America/Los_Angeles'),-480);
  assert.equal(offsetMinutes(summer.instant,'America/Los_Angeles'),-420);
  const transition=scene('season-and-pt','clock-transition');
  assertClock(transition,'America/Los_Angeles','2026-03-08','03:00');
  const before={instant:new Date(Date.parse(transition.instant)-60_000).toISOString()};
  assertClock(before,'America/Los_Angeles','2026-03-08','01:59');
  assert.equal(zonedToInstants('2026-03-08','02:30','America/Los_Angeles').length,0);
});

test('routine examples identify personal schedules and show the intended local windows',()=>{
  const lesson=byLesson('daily-rhythms');
  assert.match(lesson.routineNote,/虚构/);
  for(const stage of lesson.stages){
    assert.deepEqual(stage.routines.map(p=>p.cityId).sort(),[...stage.cities].sort());
    for(const p of stage.routines){
      assert.ok(p.name);
      assert.match(p.start,/^\d{2}:\d{2}$/);assert.match(p.end,/^\d{2}:\d{2}$/);
      assert.ok(p.weekdays.every(d=>d>=1&&d<=7));
    }
  }
  const overlap=scene('daily-rhythms','availability-example');
  assertClock(overlap,'Asia/Shanghai','2026-01-15','17:00');
  assertClock(overlap,'Europe/Madrid','2026-01-15','10:00');
  assertClock(overlap,'America/New_York','2026-01-15','04:00');
  const later=scene('daily-rhythms','not-all-overlap');
  assertClock(later,'Asia/Shanghai','2026-01-15','22:00');
  assertClock(later,'America/New_York','2026-01-15','09:00');
});

test('the final invitation names opposite local dates but one start instant',()=>{
  const stages=byLesson('meet-together').stages;
  assert.equal(new Set(stages.map(s=>s.instant)).size,1);
  const stage=stages[0];
  assertClock(stage,'Asia/Shanghai','2026-01-15','09:00');
  assertClock(stage,'America/Los_Angeles','2026-01-14','17:00');
  const [beijing]=zonedToInstants('2026-01-15','09:00','Asia/Shanghai');
  const [la]=zonedToInstants('2026-01-14','17:00','America/Los_Angeles');
  assert.equal(beijing.getTime(),la.getTime());
  assert.equal(la.getTime(),Date.parse(stage.instant));
});
