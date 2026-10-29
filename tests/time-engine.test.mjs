import test from 'node:test';
import assert from 'node:assert/strict';
import { partsAt, offsetMinutes, formatOffset, zonedToInstants, addDays, timeLabel, findOverlap } from '../dist/time-engine.mjs';

const allDays = [1, 2, 3, 4, 5, 6, 7];
const iso = dates => dates.map(date => date.toISOString());

test('IANA offsets follow New York winter/summer and Nepal quarter-hour offset', () => {
  assert.equal(offsetMinutes('2026-01-15T12:00:00Z', 'America/New_York'), -300);
  assert.equal(offsetMinutes('2026-07-15T12:00:00Z', 'America/New_York'), -240);
  assert.equal(offsetMinutes('2026-10-28T12:00:00Z', 'Asia/Kathmandu'), 345);
  assert.equal(formatOffset(345), 'UTC+05:45');
  assert.equal(formatOffset(-300), 'UTC−05:00');
});

test('parts preserve date crossing, midnight, seconds and ISO weekday', () => {
  assert.deepEqual(partsAt('2026-10-28T16:00:03Z', 'Asia/Shanghai'), {
    year: 2026, month: 10, day: 29, hour: 0, minute: 0, second: 3,
    weekday: 4, date: '2026-10-29', time: '00:00',
  });
  assert.equal(timeLabel('2026-10-28T16:00:00Z', 'Asia/Shanghai'), '2026-10-29 00:00 (UTC+08:00)');
});

test('DST spring gap rejects a nonexistent New York time', () => {
  assert.deepEqual(zonedToInstants('2026-03-08', '02:30', 'America/New_York'), []);
  assert.deepEqual(iso(zonedToInstants('2026-03-08', '03:30', 'America/New_York')), ['2026-03-08T07:30:00.000Z']);
});

test('DST autumn overlap exposes both occurrences instead of silently selecting one', () => {
  assert.deepEqual(iso(zonedToInstants('2026-11-01', '01:30', 'America/New_York')), [
    '2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z',
  ]);
});

test('local conversion uses quarter-hour offsets and rejects invalid inputs', () => {
  assert.deepEqual(iso(zonedToInstants('2026-10-28', '09:00', 'Asia/Kathmandu')), ['2026-10-28T03:15:00.000Z']);
  assert.throws(() => zonedToInstants('2026-02-30', '09:00', 'UTC'), RangeError);
  assert.throws(() => zonedToInstants('2026-10-28', '24:00', 'UTC'), RangeError);
  assert.throws(() => partsAt('invalid', 'UTC'), RangeError);
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('overlap checks the entire meeting, permits finishing exactly at availability end', () => {
  const result = findOverlap({ date: '2026-10-28', baseZone: 'Asia/Shanghai', durationMinutes: 30, people: [
    { zone: 'Asia/Shanghai', start: '16:00', end: '18:00', weekdays: allDays },
    { zone: 'Europe/London', start: '09:00', end: '10:00', weekdays: allDays },
  ] });
  assert.deepEqual(result.map(x => x.start), ['2026-10-28T09:00:00.000Z', '2026-10-28T09:15:00.000Z', '2026-10-28T09:30:00.000Z']);
  assert.equal(result.at(-1).end, '2026-10-28T10:00:00.000Z');
});

test('non-overlapping working hours and empty participants yield no candidates', () => {
  assert.deepEqual(findOverlap({ date: '2026-10-28', baseZone: 'Asia/Shanghai', people: [
    { zone: 'Asia/Shanghai', start: '09:00', end: '18:00' },
    { zone: 'America/New_York', start: '09:00', end: '17:00' },
  ] }), []);
  assert.deepEqual(findOverlap({ date: '2026-10-28', baseZone: 'UTC', people: [] }), []);
});

test('overnight schedules use their starting weekday and meetings may cross base midnight', () => {
  const result = findOverlap({ date: '2026-10-30', baseZone: 'UTC', durationMinutes: 60, people: [
    { zone: 'UTC', start: '23:00', end: '02:00', weekdays: [5] },
  ] });
  assert.equal(result.length, 4);
  assert.equal(result.at(-1).start, '2026-10-30T23:45:00.000Z');
  assert.equal(result.at(-1).end, '2026-10-31T00:45:00.000Z');
  const saturday = findOverlap({ date: '2026-10-31', baseZone: 'UTC', durationMinutes: 60, people: [
    { zone: 'UTC', start: '23:00', end: '02:00', weekdays: [5] },
  ] });
  assert.equal(saturday.length, 5);
  assert.equal(saturday.at(-1).start, '2026-10-31T01:00:00.000Z');
});

test('each participant uses their own local weekday across the date line', () => {
  const result = findOverlap({ date: '2026-10-29', baseZone: 'Asia/Shanghai', durationMinutes: 30, people: [
    { zone: 'Asia/Shanghai', start: '00:00', end: '01:00', weekdays: [4] },
    { zone: 'America/Los_Angeles', start: '09:00', end: '10:00', weekdays: [3] },
  ] });
  assert.equal(result.length, 3);
  assert.equal(result[0].start, '2026-10-28T16:00:00.000Z');
});

test('repeated DST times appear as separate overlap candidates', () => {
  const result = findOverlap({ date: '2026-11-01', baseZone: 'America/New_York', durationMinutes: 15, people: [
    { zone: 'America/New_York', start: '01:00', end: '02:00', weekdays: allDays },
  ] });
  assert.equal(result.length, 8);
  assert.equal(result[0].start, '2026-11-01T05:00:00.000Z');
  assert.equal(result.at(-1).start, '2026-11-01T06:45:00.000Z');
});

test('whole-day date-line jumps return no false local instants', () => {
  assert.deepEqual(zonedToInstants('2011-12-30', '12:00', 'Pacific/Apia'), []);
});

test('meeting validation follows every minute through a backward DST clock change', () => {
  const result = findOverlap({ date: '2026-11-01', baseZone: 'America/New_York', durationMinutes: 45, people: [
    { zone: 'America/New_York', start: '01:30', end: '02:30', weekdays: allDays },
  ] });
  // The first 01:30 occurrence would run through 01:00 after the rollback,
  // which is outside availability. Only second-occurrence starts qualify.
  assert.deepEqual(result.map(slot => slot.start), ['2026-11-01T06:30:00.000Z', '2026-11-01T06:45:00.000Z']);
});

test('meeting duration remains elapsed time through a forward DST clock change', () => {
  const result = findOverlap({ date: '2026-03-08', baseZone: 'America/New_York', durationMinutes: 90, people: [
    { zone: 'America/New_York', start: '01:00', end: '04:00', weekdays: allDays },
  ] });
  assert.equal(result[0].start, '2026-03-08T06:00:00.000Z');
  assert.equal(result[0].end, '2026-03-08T07:30:00.000Z');
  assert.equal(partsAt(result[0].end, 'America/New_York').time, '03:30');
  assert.equal(result.length, 3);
});

test('optional sleep blocks override overlapping availability on both sides of midnight', () => {
  const person={zone:'UTC',start:'22:00',end:'06:00',sleepStart:'23:30',sleepEnd:'00:30',weekdays:[5]};
  const friday=findOverlap({date:'2026-10-30',baseZone:'UTC',people:[person],durationMinutes:30});
  assert.equal(friday.length,5);
  assert.equal(friday.at(-1).start,'2026-10-30T23:00:00.000Z');
  assert.equal(friday.at(-1).end,'2026-10-30T23:30:00.000Z');
  const saturday=findOverlap({date:'2026-10-31',baseZone:'UTC',people:[person],durationMinutes:30});
  assert.equal(saturday[0].start,'2026-10-31T00:30:00.000Z');
  assert.equal(saturday.at(-1).start,'2026-10-31T05:30:00.000Z');
  assert.equal(saturday.length,21);
});

test('sleep exclusions apply to both repeated DST hours and every minute of a meeting', () => {
  const person={zone:'America/New_York',start:'00:00',end:'04:00',sleepStart:'01:00',sleepEnd:'01:30',weekdays:allDays};
  const slots=findOverlap({date:'2026-11-01',baseZone:person.zone,people:[person],durationMinutes:30});
  const starts=slots.map(slot=>slot.start);
  assert.ok(!starts.includes('2026-11-01T05:00:00.000Z'));
  assert.ok(!starts.includes('2026-11-01T06:00:00.000Z'));
  assert.ok(starts.includes('2026-11-01T05:30:00.000Z'));
  assert.ok(!starts.includes('2026-11-01T05:45:00.000Z'),'a meeting crossing back into the sleeping repeated hour is excluded');
  assert.ok(starts.includes('2026-11-01T06:30:00.000Z'));
});

test('a sleep window wholly inside the spring clock gap does not exclude nonexistent instants', () => {
  const person={zone:'America/New_York',start:'01:00',end:'04:00',weekdays:allDays};
  const args={date:'2026-03-08',baseZone:person.zone,durationMinutes:60};
  assert.deepEqual(findOverlap({...args,people:[{...person,sleepStart:'02:00',sleepEnd:'03:00'}]}),findOverlap({...args,people:[person]}));
  assert.throws(()=>findOverlap({...args,people:[{...person,sleepStart:'23:00'}]}),RangeError);
  assert.throws(()=>findOverlap({...args,people:[{...person,sleepStart:'23:00',sleepEnd:'23:00'}]}),RangeError);
});
