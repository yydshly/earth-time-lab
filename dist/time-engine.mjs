/** Calendar calculations use named IANA zones and the runtime's time-zone data. */
const formatters = new Map();
const offsetSets = new Map();
const MINUTE = 60_000;
const DAY = 86_400_000;
const pad = n => String(n).padStart(2, '0');

function instantDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('无效的时间点');
  return date;
}

function utcDate(year, month, day, hour = 0, minute = 0, second = 0) {
  const result = new Date(0);
  result.setUTCFullYear(year, month - 1, day);
  result.setUTCHours(hour, minute, second, 0);
  return result;
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError('日期格式应为 YYYY-MM-DD');
  const [, y, m, d] = match.map(Number);
  const date = utcDate(y, m, d);
  if (y < 1 || date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) {
    throw new RangeError('无效的日期');
  }
  return { year: y, month: m, day: d, date };
}

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new RangeError('时间格式应为 HH:mm，范围为 00:00–23:59');
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function formatter(zone) {
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
      timeZone: zone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }));
  }
  return formatters.get(zone);
}

/** weekday is ISO 1 (Monday) through 7 (Sunday). */
export function partsAt(instant, zone) {
  const fields = Object.fromEntries(formatter(zone).formatToParts(instantDate(instant))
    .filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  const { year, month, day, hour, minute, second } = fields;
  const weekday = utcDate(year, month, day).getUTCDay() || 7;
  return {
    year, month, day, hour, minute, second, weekday,
    date: `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
  };
}

export function offsetMinutes(instant, zone) {
  const date = instantDate(instant);
  const p = partsAt(date, zone);
  const asUTC = utcDate(p.year, p.month, p.day, p.hour, p.minute, p.second).getTime();
  return (asUTC - Math.floor(date.getTime() / 1000) * 1000) / MINUTE;
}

export function formatOffset(minutes) {
  if (!Number.isFinite(minutes)) throw new RangeError('无效的 UTC 偏移量');
  const rounded = Math.round(Math.abs(minutes));
  return `UTC${minutes < 0 ? '−' : '+'}${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`;
}

function possibleOffsets(dateString, zone) {
  const key = `${zone}|${dateString}`;
  if (!offsetSets.has(key)) {
    const anchor = parseDate(dateString).date.getTime();
    const offsets = new Set();
    // Sample both sides of a date to include standard/daylight offsets and
    // whole-day date-line changes, then verify every returned candidate below.
    for (let hours = -72; hours <= 72; hours += 6) {
      offsets.add(offsetMinutes(anchor + hours * 60 * MINUTE, zone));
    }
    if (offsetSets.size >= 512) offsetSets.delete(offsetSets.keys().next().value);
    offsetSets.set(key, [...offsets]);
  }
  return offsetSets.get(key);
}

/** Returns [] for a skipped clock time, and two Dates for a repeated DST time. */
export function zonedToInstants(dateString, timeString, zone) {
  const d = parseDate(dateString);
  const t = parseTime(timeString);
  const wall = utcDate(d.year, d.month, d.day, t.hour, t.minute).getTime();
  const matches = new Set();
  for (const offset of possibleOffsets(dateString, zone)) {
    const candidate = wall - offset * MINUTE;
    const p = partsAt(candidate, zone);
    if (p.date === dateString && p.time === timeString && p.second === 0) matches.add(candidate);
  }
  return [...matches].sort((a, b) => a - b).map(ms => new Date(ms));
}

export function addDays(dateString, days) {
  if (!Number.isInteger(days)) throw new RangeError('天数应为整数');
  const result = new Date(parseDate(dateString).date.getTime() + days * DAY);
  return `${String(result.getUTCFullYear()).padStart(4, '0')}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
}

export function timeLabel(instant, zone) {
  const p = partsAt(instant, zone);
  return `${p.date} ${p.time} (${formatOffset(offsetMinutes(instant, zone))})`;
}

/**
 * Each result starts on a 15-minute wall-clock boundary of the base date.
 * All minutes of the meeting must be available to every person.
 * Overnight shifts belong to the weekday on which the shift starts.
 * Equal start/end means no available hours. Missing weekdays defaults to Mon–Fri.
 * Optional sleepStart/sleepEnd form a daily exclusion and take precedence.
 */
export function findOverlap({ date, baseZone, people, durationMinutes = 30 }) {
  parseDate(date);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) {
    throw new RangeError('会议时长应为 1–1440 分钟的整数');
  }
  if (!Array.isArray(people) || people.length === 0) return [];
  const schedules = people.map(person => {
    const start = parseTime(person.start);
    const end = parseTime(person.end);
    const weekdays = person.weekdays ?? [1, 2, 3, 4, 5];
    if (!Array.isArray(weekdays) || weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) {
      throw new RangeError('星期应使用 1（周一）到 7（周日）');
    }
    formatter(person.zone); // Validate even if the selected day has no candidates.
    let sleep = null;
    if (person.sleepStart !== undefined || person.sleepEnd !== undefined) {
      const sleepStart = parseTime(person.sleepStart), sleepEnd = parseTime(person.sleepEnd);
      sleep = {start:sleepStart.hour * 60 + sleepStart.minute, end:sleepEnd.hour * 60 + sleepEnd.minute};
      if (sleep.start === sleep.end) throw new RangeError('睡眠开始与结束应为不同钟点。');
    }
    return {
      zone: person.zone, weekdays: new Set(weekdays),
      start: start.hour * 60 + start.minute,
      end: end.hour * 60 + end.minute,
      sleep,
      cache: new Map(),
    };
  });
  const available = (schedule, ms) => {
    if (schedule.cache.has(ms)) return schedule.cache.get(ms);
    const p = partsAt(ms, schedule.zone);
    const minute = p.hour * 60 + p.minute;
    const day = p.weekday;
    const sleep = schedule.sleep;
    if (sleep && (sleep.start < sleep.end ? minute >= sleep.start && minute < sleep.end : minute >= sleep.start || minute < sleep.end)) {
      schedule.cache.set(ms, false);
      return false;
    }
    let result;
    if (schedule.start <= schedule.end) {
      result = minute >= schedule.start && minute < schedule.end && schedule.weekdays.has(day);
    } else {
      result = (minute >= schedule.start && schedule.weekdays.has(day))
        || (minute < schedule.end && schedule.weekdays.has(day === 1 ? 7 : day - 1));
    }
    schedule.cache.set(ms, result);
    return result;
  };
  const candidates = [];
  for (let minute = 0; minute < 1440; minute += 15) {
    for (const start of zonedToInstants(date, `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`, baseZone)) {
      const startMs = start.getTime();
      const endMs = startMs + durationMinutes * MINUTE;
      let fits = true;
      for (let ms = startMs; ms < endMs && fits; ms += MINUTE) {
        fits = schedules.every(schedule => available(schedule, ms));
      }
      if (fits) candidates.push({ start: start.toISOString(), end: new Date(endMs).toISOString() });
    }
  }
  return candidates.sort((a, b) => a.start.localeCompare(b.start));
}
