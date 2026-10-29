import test from 'node:test';
import assert from 'node:assert/strict';
import {routineSnapshot, buildPersonalSegments, instantAtLocalMinute, clockPoint, ringArcPath, validatePerson} from '../dist/routine-atlas-model.mjs';

const beijing = {id:'beijing', name:'北京', zone:'Asia/Shanghai'};
const ny = {id:'newyork', name:'纽约', zone:'America/New_York'};
const allDays = [1, 2, 3, 4, 5, 6, 7];
const person = {name:'虚构朋友', start:'09:00', end:'18:00', sleepStart:'23:00', sleepEnd:'07:00', weekdays:[1, 2, 3, 4, 5]};
const profile = {person, segments:[
  {start:'00:00', end:'07:00', kind:'sleep', label:'睡眠示意'},
  {start:'07:00', end:'09:00', kind:'commute', label:'早餐与通勤示意'},
  {start:'09:00', end:'18:00', kind:'work', label:'工作示意'},
  {start:'18:00', end:'23:00', kind:'free', label:'个人生活示意'},
  {start:'23:00', end:'24:00', kind:'sleep', label:'睡眠示意'},
]};

test('illustrated regional activity remains separate from personal contact permission', () => {
  const custom = {...person, start:'11:00', end:'15:00'};
  const snapshot = routineSnapshot('2026-01-15T01:30:00Z', beijing, profile, custom);
  assert.equal(snapshot.local.time, '09:30');
  assert.equal(snapshot.activity.kind, 'work');
  assert.equal(snapshot.activity.isIllustration, true);
  assert.equal(snapshot.personal.state, 'outside');
  assert.equal(snapshot.personal.canContact, false);
});

test('a full contact duration must fit, including sub-minute boundaries', () => {
  assert.equal(routineSnapshot('2026-01-15T09:30:00Z', beijing, profile).personal.canContact, true);
  const late = routineSnapshot('2026-01-15T09:30:30Z', beijing, profile);
  assert.equal(late.personal.state, 'available');
  assert.equal(late.personal.canContact, false);
  assert.equal(late.personal.reason, 'too-short');
  assert.equal(routineSnapshot('2026-01-15T10:00:00Z', beijing, profile).personal.canContact, false);
});

test('sleep blocks an overlapping contact window and weekends use the local date', () => {
  const custom = {...person, start:'22:00', end:'08:00'};
  const asleep = routineSnapshot('2026-01-15T15:00:00Z', beijing, profile, custom);
  assert.equal(asleep.personal.state, 'sleep');
  assert.equal(asleep.personal.canContact, false);
  assert.equal(routineSnapshot('2026-01-17T02:00:00Z', beijing, profile).personal.canContact, false);
});

test('overnight availability belongs to the day on which it began', () => {
  const overnight = {name:'夜班示例', start:'22:00', end:'06:00', sleepStart:'08:00', sleepEnd:'16:00', weekdays:[5]};
  const saturday = routineSnapshot('2026-01-16T17:00:00Z', beijing, profile, overnight);
  assert.equal(saturday.local.date, '2026-01-17');
  assert.equal(saturday.personal.canContact, true);
  assert.equal(routineSnapshot('2026-01-17T17:00:00Z', beijing, profile, overnight).personal.canContact, false);
  assert.equal(routineSnapshot('2026-01-16T21:45:00Z', beijing, profile, overnight).personal.canContact, false);
});

test('actual elapsed duration follows both DST occurrences and the spring jump', () => {
  const autumn = {...person, start:'01:30', end:'02:00', sleepStart:'08:00', sleepEnd:'16:00', weekdays:allDays};
  // The earlier 01:50 rolls back into 01:00, which is outside this contact window.
  assert.equal(routineSnapshot('2026-11-01T05:50:00Z', ny, profile, autumn, 20).personal.canContact, false);
  assert.equal(routineSnapshot('2026-11-01T06:30:00Z', ny, profile, autumn, 30).personal.canContact, true);
  const spring = {...autumn, start:'01:30', end:'03:30'};
  assert.equal(routineSnapshot('2026-03-08T06:30:00Z', ny, profile, spring, 60).personal.canContact, true);
  assert.equal(routineSnapshot('2026-03-08T06:30:00Z', ny, profile, spring, 61).personal.canContact, false);
});

test('local-minute conversion exposes DST ambiguity and fractional UTC offsets', () => {
  assert.equal(instantAtLocalMinute('2026-03-08T12:00:00Z', ny, 150).length, 0);
  assert.deepEqual(instantAtLocalMinute('2026-11-01T12:00:00Z', ny, 90).map(d => d.toISOString()), [
    '2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z',
  ]);
  const delhi = {zone:'Asia/Kolkata'};
  assert.equal(instantAtLocalMinute('2026-01-15T12:00:00Z', delhi, 540)[0].toISOString(), '2026-01-15T03:30:00.000Z');
  const kathmandu = {zone:'Asia/Kathmandu'};
  assert.equal(instantAtLocalMinute('2026-01-15T12:00:00Z', kathmandu, 540)[0].toISOString(), '2026-01-15T03:15:00.000Z');
  assert.equal(instantAtLocalMinute('2026-01-15T12:00:00Z', beijing, 1440)[0].toISOString(), '2026-01-15T16:00:00.000Z');
});

test('personal ring covers the full clock day and marks skipped or repeated hours', () => {
  const normal = buildPersonalSegments(person, '2026-01-15T12:00:00Z', beijing);
  assert.equal(normal[0].startMinutes, 0);
  assert.equal(normal.at(-1).endMinutes, 1440);
  assert.equal(normal.reduce((sum,s) => sum + s.endMinutes - s.startMinutes, 0), 1440);
  assert.deepEqual(normal.map(s => [s.start,s.end,s.kind]), [
    ['00:00','07:00','sleep'], ['07:00','09:00','free'], ['09:00','18:00','available'],
    ['18:00','23:00','free'], ['23:00','24:00','sleep'],
  ]);
  const spring = buildPersonalSegments(person, '2026-03-08T12:00:00Z', ny);
  assert.deepEqual(spring.filter(s => s.kind === 'gap').map(s => [s.start,s.end,s.occurrences]), [['02:00','03:00',0]]);
  const autumn = buildPersonalSegments(person, '2026-11-01T12:00:00Z', ny);
  assert.deepEqual(autumn.filter(s => s.occurrences === 2).map(s => [s.start,s.end]), [['01:00','02:00']]);
});

test('validation distinguishes no availability from ambiguous all-day sleep', () => {
  const none = validatePerson({...person, start:'09:00', end:'09:00'});
  assert.equal(none.valid, true);
  assert.equal(none.warnings.length, 1);
  assert.equal(routineSnapshot('2026-01-15T02:00:00Z', beijing, profile, none.value).personal.canContact, false);
  assert.equal(validatePerson({...person, sleepStart:'23:00', sleepEnd:'23:00'}).valid, false);
  assert.equal(validatePerson({...person, weekdays:[]}).valid, true);
  assert.equal(validatePerson({...person, weekdays:[0]}).valid, false);
  assert.equal(validatePerson({...person, start:'24:00'}).valid, false);
  assert.throws(() => routineSnapshot('2026-01-15T00:00:00Z', beijing, profile, person, 0), RangeError);
});

test('ring geometry starts at the top, advances clockwise, and renders full circles', () => {
  const top = clockPoint(0, 254, 300, 300), right = clockPoint(360, 254, 300, 300);
  assert.ok(Math.abs(top.x - 300) < 1e-8);assert.equal(top.y, 46);
  assert.equal(right.x, 554);assert.equal(right.y, 300);
  assert.equal(ringArcPath(0,0,254,300,300), '');
  const full = ringArcPath(0,1440,254,300,300);
  assert.equal((full.match(/ A /g) || []).length, 2);
  assert.ok(!full.includes('NaN'));
  const overnight = ringArcPath(23*60,7*60,224,300,300);
  assert.match(overnight, / A 224 224 0 0 1 /);
  assert.throws(() => ringArcPath(0, 1500, 254), RangeError);
  assert.throws(() => clockPoint(0, 0), RangeError);
});
