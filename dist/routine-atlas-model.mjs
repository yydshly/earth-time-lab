import {partsAt, zonedToInstants, addDays} from './time-engine.mjs';

const MINUTE = 60_000;
const DAY_MINUTES = 1440;
const weekdaysDefault = [1, 2, 3, 4, 5];
const dateOccurrences = new Map();
const pad = value => String(value).padStart(2, '0');

function clockMinutes(value, allow24 = false) {
  if (allow24 && value === '24:00') return DAY_MINUTES;
  const match = /^(\d{2}):(\d{2})$/.exec(String(value));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new RangeError('时间应为 00:00–23:59 的 HH:MM 格式。');
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function minuteClock(minute) {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

/** Validation does not change the supplied profile or guess an invalid interval. */
export function validatePerson(person = {}) {
  const value = {
    ...person,
    name: String(person.name ?? '示例朋友'),
    start: person.start ?? '09:00',
    end: person.end ?? '18:00',
    sleepStart: person.sleepStart ?? '23:00',
    sleepEnd: person.sleepEnd ?? '07:00',
    weekdays: Array.isArray(person.weekdays) ? [...person.weekdays] : [...weekdaysDefault],
  };
  const errors = [], warnings = [];
  for (const field of ['start', 'end', 'sleepStart', 'sleepEnd']) {
    try { clockMinutes(value[field]); }
    catch { errors.push({field, message:'请填写有效的 24 小时制钟点。'}); }
  }
  if (person.weekdays !== undefined && !Array.isArray(person.weekdays)) {
    errors.push({field:'weekdays', message:'请选择可联系的星期。'});
  } else if (value.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) {
    errors.push({field:'weekdays', message:'星期应为 1（周一）到 7（周日）。'});
  }
  value.weekdays = [...new Set(value.weekdays)];
  if (value.sleepStart === value.sleepEnd) {
    errors.push({field:'sleepEnd', message:'睡眠开始与结束请设为不同钟点，避免零小时与全天的歧义。'});
  }
  if (value.start === value.end) warnings.push('开始和结束相同，表示没有可联系时段。');
  if (!value.weekdays.length) warnings.push('尚未选择可联系的星期。');
  return {valid:errors.length === 0, errors, warnings, value};
}

function scheduleFor(person) {
  const validation = validatePerson(person);
  if (!validation.valid) throw new RangeError(validation.errors.map(error => error.message).join(' '));
  const p = validation.value;
  return {
    person:p,
    start:clockMinutes(p.start), end:clockMinutes(p.end),
    sleepStart:clockMinutes(p.sleepStart), sleepEnd:clockMinutes(p.sleepEnd),
    weekdays:new Set(p.weekdays),
  };
}

function inWindow(minute, start, end) {
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function wallState(minute, weekday, schedule) {
  // Sleep is a personal daily interval; it blocks contact even if windows overlap.
  if (inWindow(minute, schedule.sleepStart, schedule.sleepEnd)) return 'sleep';
  const {start, end, weekdays} = schedule;
  const previousWeekday = weekday === 1 ? 7 : weekday - 1;
  const available = start < end
    ? minute >= start && minute < end && weekdays.has(weekday)
    : start > end && ((minute >= start && weekdays.has(weekday)) || (minute < end && weekdays.has(previousWeekday)));
  return available ? 'available' : 'outside';
}

function stateAt(instant, zone, schedule) {
  const local = partsAt(instant, zone);
  return wallState(local.hour * 60 + local.minute, local.weekday, schedule);
}

function illustrativeActivity(local, profile) {
  const minute = local.hour * 60 + local.minute;
  const segment = (profile?.segments || []).find(item => {
    const start = clockMinutes(item.start), end = clockMinutes(item.end, true);
    return inWindow(minute, start, end);
  });
  return segment
    ? {...segment, isIllustration:true}
    : {kind:'free', label:'生活示意未设置', isIllustration:true};
}

/**
 * Regional activity is only the authored illustration. Personal availability
 * checks every elapsed minute, with seconds at the start/end respected.
 */
export function routineSnapshot(instant, city, profile, person = profile?.person, durationMinutes = 30) {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > DAY_MINUTES) {
    throw new RangeError('联系时长应为 1–1440 分钟的整数。');
  }
  const at = new Date(instant), local = partsAt(at, city.zone);
  const schedule = scheduleFor(person);
  const state = wallState(local.hour * 60 + local.minute, local.weekday, schedule);
  const endMs = at.getTime() + durationMinutes * MINUTE;
  let canContact = state === 'available';
  // Advancing to actual UTC minute boundaries includes local midnight, both
  // occurrences of a repeated hour, and the minute after a forward clock jump.
  for (let ms = Math.floor(at.getTime() / MINUTE) * MINUTE + MINUTE; ms < endMs && canContact; ms += MINUTE) {
    canContact = stateAt(ms, city.zone, schedule) === 'available';
  }
  const reason = state === 'sleep' ? 'sleep' : state === 'outside' ? 'outside' : canContact ? 'available' : 'too-short';
  const text = reason === 'sleep'
    ? '在此人的睡眠设置内，先留言、不要默认即时联系'
    : reason === 'outside'
      ? '不在此人的可联系时段内，先确认或异步留言'
      : canContact
        ? `完整 ${durationMinutes} 分钟符合此人的设置，仍需本人确认`
        : `此刻在可联系窗口，但后续 ${durationMinutes} 分钟未全部符合设置`;
  return {
    local,
    activity:illustrativeActivity(local, profile),
    personal:{state, reason, text, canContact, name:schedule.person.name, durationMinutes,
      window:`${schedule.person.start}–${schedule.person.end}`,
      end:partsAt(endMs, city.zone),
    },
  };
}

function occurrencesOnDate(date, zone) {
  const key = `${zone}|${date}`;
  if (!dateOccurrences.has(key)) {
    const counts = new Uint8Array(DAY_MINUTES);
    for (let minute = 0; minute < DAY_MINUTES; minute++) {
      counts[minute] = zonedToInstants(date, minuteClock(minute), zone).length;
    }
    if (dateOccurrences.size >= 48) dateOccurrences.delete(dateOccurrences.keys().next().value);
    dateOccurrences.set(key, counts);
  }
  return dateOccurrences.get(key);
}

/**
 * A civil-clock ring always spans 00:00–24:00. A skipped span is `kind:'gap'`;
 * repeated clock spans have `occurrences:2`. Availability here describes each
 * clock position, not a promise that a full meeting fits from that position.
 */
export function buildPersonalSegments(person, instant, city) {
  const schedule = scheduleFor(person), local = partsAt(instant, city.zone);
  const occurrences = occurrencesOnDate(local.date, city.zone);
  const segments = [];
  const labels = {available:'个人可联系时段', sleep:'个人睡眠设置', free:'个人时间 / 需确认', gap:'此日因调钟跳过'};
  for (let minute = 0; minute < DAY_MINUTES; minute++) {
    const count = occurrences[minute];
    const state = wallState(minute, local.weekday, schedule);
    const kind = count === 0 ? 'gap' : state === 'outside' ? 'free' : state;
    const last = segments.at(-1);
    if (last && last.kind === kind && last.occurrences === count) {
      last.endMinutes = minute + 1;
      last.end = minuteClock(minute + 1);
    } else {
      segments.push({startMinutes:minute, endMinutes:minute + 1,
        start:minuteClock(minute), end:minuteClock(minute + 1), kind,
        label:labels[kind], occurrences:count,
      });
    }
  }
  return segments;
}

/** Returns [] for skipped time, two instants for a repeated hour; 1440 means next-day 00:00. */
export function instantAtLocalMinute(referenceInstant, city, minute) {
  if (!Number.isInteger(minute) || minute < 0 || minute > DAY_MINUTES) throw new RangeError('钟点位置应为 0–1440 的整数分钟。');
  const local = partsAt(referenceInstant, city.zone);
  const date = minute === DAY_MINUTES ? addDays(local.date, 1) : local.date;
  return zonedToInstants(date, minuteClock(minute % DAY_MINUTES), city.zone);
}

function checkGeometry(minutes, radius, cx, cy) {
  if (![minutes, radius, cx, cy].every(Number.isFinite) || radius <= 0) {
    throw new RangeError('圆环坐标和分钟必须为有限数值，半径必须大于零。');
  }
}

/** 00:00 is at 12 o'clock; 06:00 is on the right. */
export function clockPoint(minutes, radius, cx = 250, cy = 250) {
  checkGeometry(minutes, radius, cx, cy);
  const angle = minutes / DAY_MINUTES * Math.PI * 2 - Math.PI / 2;
  return {x:cx + Math.cos(angle) * radius, y:cy + Math.sin(angle) * radius};
}

const coordinate = value => Number(value.toFixed(5));

/** Open SVG stroke path, clockwise. Equal ends mean an empty interval; 0→1440 is a full ring. */
export function ringArcPath(startMinutes, endMinutes, radius, cx = 250, cy = 250) {
  checkGeometry(startMinutes, radius, cx, cy);
  if (!Number.isFinite(endMinutes)) throw new RangeError('圆环终点必须为有限分钟。');
  let span = endMinutes - startMinutes;
  if (span === 0) return '';
  if (Math.abs(span) > DAY_MINUTES) throw new RangeError('一个圆环区间最多覆盖 24 小时。');
  if (span < 0) span += DAY_MINUTES;
  // A reverse full turn is still a full circle, not an empty midnight interval.
  if (span === 0) span = DAY_MINUTES;
  const start = clockPoint(startMinutes, radius, cx, cy);
  const xy = p => `${coordinate(p.x)} ${coordinate(p.y)}`;
  if (span === DAY_MINUTES) {
    const middle = clockPoint(startMinutes + DAY_MINUTES / 2, radius, cx, cy);
    return `M ${xy(start)} A ${radius} ${radius} 0 1 1 ${xy(middle)} A ${radius} ${radius} 0 1 1 ${xy(start)}`;
  }
  const end = clockPoint(startMinutes + span, radius, cx, cy);
  return `M ${xy(start)} A ${radius} ${radius} 0 ${span > DAY_MINUTES / 2 ? 1 : 0} 1 ${xy(end)}`;
}
