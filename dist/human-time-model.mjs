/**
 * Mean solar time is a teaching model: 360° of longitude correspond to 24 hours.
 * It ignores the equation of time. These helpers do not calculate sunrise,
 * observed apparent solar noon, a person's body clock, or their availability.
 */
const DAY_MINUTES = 1440;
const wrapDay = minutes => ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${label}需要有限数值。`);
  }
  return value;
}

function validLongitude(value) {
  finiteNumber(value, '经度');
  if (value < -180 || value > 180) throw new RangeError('经度范围为 −180° 至 180°。');
  return value;
}

function validInstant(value) {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') {
    throw new RangeError('需要有效的时间点。');
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('需要有效的时间点。');
  return date;
}

/** Local mean solar minute of day; east longitude is positive. */
export function meanSolarMinutes(instant, longitude) {
  const date = validInstant(instant);
  validLongitude(longitude);
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes()
    + date.getUTCSeconds() / 60 + date.getUTCMilliseconds() / 60_000;
  return wrapDay(utcMinutes + longitude * 4);
}

/** Round a minute-of-day value to the nearest minute and display 00:00–23:59. */
export function formatSolarTime(minutes) {
  finiteNumber(minutes, '太阳时分钟数');
  const rounded = wrapDay(Math.round(wrapDay(minutes)));
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

/**
 * Civil clock minute at local mean solar noon, for the supplied UTC offset.
 * The caller must obtain the offset for the example's actual date (DST included).
 */
export function solarNoonOnCivilClock(longitude, offsetMinutes) {
  validLongitude(longitude);
  finiteNumber(offsetMinutes, 'UTC 偏移分钟数');
  return wrapDay(720 + offsetMinutes - longitude * 4);
}

/**
 * Signed solar-clock lead of b over a, using their coordinate difference.
 * This is not the shortest path across the antimeridian; −180° to +180° is 1440 min.
 */
export function longitudeTimeDifference(a, b) {
  validLongitude(a);
  validLongitude(b);
  return (b - a) * 4;
}

export const teachingPlaces = Object.freeze([
  Object.freeze({id:'chengdu', name:'成都', lat:30.67, lon:104.07, zone:'Asia/Shanghai'}),
  Object.freeze({id:'shanghai', name:'上海', lat:31.23, lon:121.47, zone:'Asia/Shanghai'}),
]);

export const meanSolarModelNote = '平太阳时按经度每 1° 相差 4 分钟估算，未计均时差；不是日出预报、真实太阳过中天时刻或个人作息判断。';

export const humanDayObserver = Object.freeze({id:'human-observer',name:'北京',lat:39.9042,lon:116.4074,zone:'Asia/Shanghai'});
export const humanDayStart = '2026-03-19T22:00:00Z';

/** This lesson starts at Beijing 06:00 and ends at the next day's 06:00. */
export function humanDayInstant(minute) {
  finiteNumber(minute,'一天进度');
  return new Date(Date.parse(humanDayStart)+Math.max(0,Math.min(DAY_MINUTES,minute))*60000);
}

/** Each real voice clip owns one semantic interval; seeking never leaves it. */
export function humanCueMinute(cue,currentTime,duration) {
  if(!cue||!Number.isFinite(cue.fromMinutes)||!Number.isFinite(cue.toMinutes)||cue.toMinutes<cue.fromMinutes)throw new RangeError('讲解时间段无效。');
  const ratio=Number.isFinite(duration)&&duration>0&&Number.isFinite(currentTime)?Math.max(0,Math.min(1,currentTime/duration)):0;
  return cue.fromMinutes+(cue.toMinutes-cue.fromMinutes)*ratio;
}

export function humanCueAtMinute(cues,minute) {
  finiteNumber(minute,'一天进度');
  if(!Array.isArray(cues)||!cues.length)return -1;
  return cues.findIndex((cue,index)=>minute>=cue.fromMinutes&&(minute<cue.toMinutes||index===cues.length-1&&minute<=cue.toMinutes));
}

/** Same solar approximation as the globe surface, returned as a teaching state. */
export function humanObserverLight(value,observer=humanDayObserver) {
  const date=validInstant(value),radians=Math.PI/180;
  const day=(date.getTime()-Date.UTC(date.getUTCFullYear(),0,1))/86400000+1;
  const g=2*Math.PI/365.2425*(day-1);
  const declination=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g);
  const equation=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g));
  const minutes=date.getUTCHours()*60+date.getUTCMinutes()+date.getUTCSeconds()/60;
  const sunLongitude=180-(minutes+equation)/4;
  const latitude=observer.lat*radians;
  const illumination=Math.sin(latitude)*Math.sin(declination)+Math.cos(latitude)*Math.cos(declination)*Math.cos((observer.lon-sunLongitude)*radians);
  return {illumination,state:illumination>.10?'day':illumination<-.10?'night':'edge',label:illumination>.10?'朝向太阳 · 白昼':illumination<-.10?'背向太阳 · 黑夜':'经过晨昏交界'};
}

export function humanClockMessage(solarClock) {
  return solarClock?['每地各看太阳','协作要换钟','先保持同一瞬间，再改变计时约定']:['共用北京时间','方便跨城协作','改变的是钟表约定，太阳进程保持原样'];
}
