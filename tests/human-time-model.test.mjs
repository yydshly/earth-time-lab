import test from 'node:test';
import assert from 'node:assert/strict';
import {partsAt, offsetMinutes} from '../dist/time-engine.mjs';
import {
  meanSolarMinutes, formatSolarTime, solarNoonOnCivilClock,
  longitudeTimeDifference, teachingPlaces,
  humanDayInstant,humanCueMinute,humanCueAtMinute,humanObserverLight,humanClockMessage,
} from '../dist/human-time-model.mjs';
import {humanTimeSteps} from '../dist/human-time-data.mjs';

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);

test('solar clocks advance eastward while Chengdu and Shanghai share one civil clock', () => {
  const instant = '2026-03-20T04:00:00Z';
  const [chengdu, shanghai] = teachingPlaces;
  assert.equal(partsAt(instant, chengdu.zone).time, '12:00');
  assert.equal(partsAt(instant, shanghai.zone).time, '12:00');
  assert.equal(formatSolarTime(meanSolarMinutes(instant, chengdu.lon)), '10:56');
  assert.equal(formatSolarTime(meanSolarMinutes(instant, shanghai.lon)), '12:06');
  closeTo(longitudeTimeDifference(chengdu.lon, shanghai.lon), 69.6);
  closeTo(meanSolarMinutes(instant, shanghai.lon) - meanSolarMinutes(instant, chengdu.lon), 69.6);
});

test('mean solar noon uses longitude and the date-specific civil UTC offset', () => {
  assert.equal(formatSolarTime(solarNoonOnCivilClock(120, 480)), '12:00');
  assert.equal(formatSolarTime(solarNoonOnCivilClock(104.07, 480)), '13:04');
  assert.equal(formatSolarTime(solarNoonOnCivilClock(121.47, 480)), '11:54');
  const nyLongitude = -74;
  const winter = offsetMinutes('2026-01-15T12:00:00Z', 'America/New_York');
  const summer = offsetMinutes('2026-07-15T12:00:00Z', 'America/New_York');
  assert.equal(formatSolarTime(solarNoonOnCivilClock(nyLongitude, winter)), '11:56');
  assert.equal(formatSolarTime(solarNoonOnCivilClock(nyLongitude, summer)), '12:56');
});

test('solar minute values wrap across midnight and preserve seconds without mutating Dates', () => {
  const instant = new Date('2026-03-20T00:00:30.000Z');
  const original = instant.getTime();
  closeTo(meanSolarMinutes(instant, 0), 0.5);
  closeTo(meanSolarMinutes('2026-03-20T00:00:00Z', -15), 1380);
  closeTo(meanSolarMinutes('2026-03-20T23:30:00Z', 15), 30);
  closeTo(meanSolarMinutes('2026-03-20T00:00:00Z', -180), 720);
  closeTo(meanSolarMinutes('2026-03-20T00:00:00Z', 180), 720);
  assert.equal(instant.getTime(), original);
  assert.equal(longitudeTimeDifference(180, -180), -1440);
});

test('rounded solar labels never show 24:00 or negative hours', () => {
  assert.equal(formatSolarTime(1439.49), '23:59');
  assert.equal(formatSolarTime(1439.5), '00:00');
  assert.equal(formatSolarTime(1440), '00:00');
  assert.equal(formatSolarTime(-1), '23:59');
  assert.equal(formatSolarTime(-0.4), '00:00');
});

test('invalid instants, longitudes and numeric inputs are rejected', () => {
  for (const value of ['bad-date', new Date(NaN), NaN, Infinity, null, undefined]) {
    assert.throws(() => meanSolarMinutes(value, 0), RangeError);
  }
  for (const longitude of [-181, 181, NaN, Infinity, '120', null]) {
    assert.throws(() => meanSolarMinutes('2026-03-20T00:00:00Z', longitude), RangeError);
    assert.throws(() => solarNoonOnCivilClock(longitude, 480), RangeError);
    assert.throws(() => longitudeTimeDifference(0, longitude), RangeError);
  }
  assert.throws(() => formatSolarTime(Infinity), RangeError);
  assert.throws(() => formatSolarTime('720'), RangeError);
  assert.throws(() => solarNoonOnCivilClock(120, NaN), RangeError);
});

test('the observer completes one local day and crosses the local date at midnight',()=>{
  assert.deepEqual([0,360,720,1080,1440].map(minute=>{const p=partsAt(humanDayInstant(minute),'Asia/Shanghai');return `${p.date} ${p.time}`;}),[
    '2026-03-20 06:00','2026-03-20 12:00','2026-03-20 18:00','2026-03-21 00:00','2026-03-21 06:00'
  ]);
  assert.equal(humanObserverLight(humanDayInstant(360)).state,'day');
  assert.equal(humanObserverLight(humanDayInstant(1080)).state,'night');
});

test('four independent voice clips cover the day and seeking remains in the selected semantic interval',()=>{
  const cues=humanTimeSteps[0].voiceCues;
  assert.equal(cues.length,4);assert.equal(cues[0].fromMinutes,0);assert.equal(cues.at(-1).toMinutes,1440);
  assert.equal(new Set(cues.map(c=>c.id)).size,cues.length);
  cues.forEach((cue,index)=>{
    if(index)assert.equal(cue.fromMinutes,cues[index-1].toMinutes);
    assert.ok(cue.caption&&cue.narration);
    assert.equal(humanCueMinute(cue,0,20),cue.fromMinutes);
    assert.equal(humanCueMinute(cue,10,20),(cue.fromMinutes+cue.toMinutes)/2);
    assert.equal(humanCueMinute(cue,40,20),cue.toMinutes);
    assert.equal(humanCueMinute(cue,0,NaN),cue.fromMinutes);
    assert.equal(humanCueAtMinute(cues,cue.fromMinutes),index);
  });
  assert.equal(humanCueAtMinute(cues,1440),3);
});

test('civil clock selection replaces solar coordination messages as well as clock values',()=>{
  const solar=humanClockMessage(true).join(' '),civil=humanClockMessage(false).join(' ');
  assert.match(solar,/每地各看太阳/);assert.match(civil,/共用北京时间/);assert.doesNotMatch(civil,/协作要换钟/);
});
