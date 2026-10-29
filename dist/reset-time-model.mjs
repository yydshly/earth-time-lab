import {addDays,partsAt,offsetMinutes,zonedToInstants} from './time-engine.mjs';

const HOUR=3_600_000;
const DAY=24*HOUR;

function validateHours(hours){
  if(typeof hours!=='number'||!Number.isFinite(hours)||hours<=0||hours>1000)throw new RangeError('窗口时长应大于 0 且不超过 1000 小时。');
  return hours;
}

/** Require an explicit UTC offset instead of interpreting a host-local date. */
function explicitInstant(value,label='时间点'){
  if(typeof value!=='string')throw new RangeError(`${label}需要带 Z 或 UTC 偏移的完整时间戳。`);
  const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::([0-5]\d)(?:\.(\d{1,3}))?)?(Z|[+-](\d{2}):(\d{2}))$/i.exec(value);
  if(!match)throw new RangeError(`${label}需要带 Z 或 UTC 偏移的完整时间戳。`);
  zonedToInstants(match[1],match[2],'UTC');
  if(match[6]&&(Number(match[6])>23||Number(match[7])>59))throw new RangeError(`${label}的 UTC 偏移无效。`);
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new RangeError(`${label}无效。`);
  return date;
}

function instant(value,label='时间点'){
  if(value instanceof Date){if(!Number.isFinite(value.getTime()))throw new RangeError(`${label}无效。`);return new Date(value);}
  return explicitInstant(value,label);
}

function validateWall(date,time){
  if(typeof date!=='string'||typeof time!=='string')throw new RangeError('请提供当地日期和钟点。');
  return zonedToInstants(date,time,'UTC')[0];
}

/**
 * A civil-clock rule can resolve to zero, one, or two actual instants.
 * A supplied fixedOffset is minutes east of UTC and overrides zone.
 * No product-specific decision about skipped/repeated wall times is inferred.
 */
export function resolveDailyReset({date,time,zone,fixedOffset}={}){
  const utcWall=validateWall(date,time);
  if(fixedOffset!==undefined){
    if(!Number.isInteger(fixedOffset)||Math.abs(fixedOffset)>14*60)throw new RangeError('固定 UTC 偏移应为 −14 至 +14 小时内的整分钟。');
    return [new Date(utcWall.getTime()-fixedOffset*60_000)];
  }
  if(typeof zone!=='string'||!zone.trim())throw new RangeError('请明确产品采用的城市时区。');
  return zonedToInstants(date,time,zone);
}

/** Dates belong to the source/product's calendar, not to the viewer's date. */
export function dailyResetSeries({date,time,zone,fixedOffset,count=3}={}){
  if(!Number.isInteger(count)||count<1||count>14)throw new RangeError('演示日期数量应为 1–14 天。');
  validateWall(date,time);
  return Array.from({length:count},(_,index)=>{
    const localDate=addDays(date,index);
    const candidates=resolveDailyReset({date:localDate,time,zone,fixedOffset});
    return {localDate,candidates,status:candidates.length===0?'gap':candidates.length===1?'ok':'fold'};
  });
}

/**
 * Find the next civil-clock occurrence from the source's date, never the
 * viewer's. A missing/repeated occurrence is a policy question, not a reason
 * to silently choose an offset or jump to another day.
 */
export function nextDailyReset({time,zone,fixedOffset,asOf}={}){
  const reference=instant(asOf,'当前参照时间');
  let localDate;
  if(fixedOffset!==undefined){
    if(!Number.isInteger(fixedOffset)||Math.abs(fixedOffset)>14*60)throw new RangeError('固定 UTC 偏移应为 −14 至 +14 小时内的整分钟。');
    localDate=new Date(reference.getTime()+fixedOffset*60_000).toISOString().slice(0,10);
  }else{
    if(typeof zone!=='string'||!zone.trim())throw new RangeError('请明确产品采用的城市时区。');
    localDate=partsAt(reference,zone).date;
  }
  for(let day=0;day<2;day++){
    const date=addDays(localDate,day),candidates=resolveDailyReset({date,time,zone,fixedOffset});
    if(!candidates.length)return {status:'gap',localDate:date,time,candidates};
    if(candidates.length>1){
      if(candidates.at(-1).getTime()<reference.getTime())continue;
      return {status:'fold',localDate:date,time,candidates};
    }
    if(candidates[0].getTime()>=reference.getTime())return {status:'ready',localDate:date,time,candidates,instant:candidates[0]};
  }
  throw new Error('无法确定下一次规则时刻，请重新核对产品规则。');
}

/** Relation to a real observation time; it does not assert account state. */
export function resetEventTiming(value,asOf){
  const deltaMs=instant(value,'事件时间').getTime()-instant(asOf,'当前参照时间').getTime();
  return {status:deltaMs>0?'future':deltaMs<0?'past':'due',deltaMs};
}

/** Only already observed usage can inform a next rolling release. */
export function nextKnownRollingRelease({events,hours,asOf}={}){
  const reference=instant(asOf,'当前参照时间');validateHours(hours);
  if(!Array.isArray(events))throw new RangeError('请提供使用记录列表。');
  const normalized=events.map(event=>{
    if(!event||typeof event.amount!=='number'||!Number.isFinite(event.amount)||event.amount<=0)throw new RangeError('每笔使用量应为正数。');
    return {instant:instant(event.instant,'使用时间'),amount:event.amount};
  });
  const observed=normalized.filter(event=>event.instant<=reference),releases=rollingReleases({events:observed,hours,asOf:reference});
  return {status:releases.length?'ready':observed.length?'no-upcoming':'no-observed-events',release:releases[0]||null,observedCount:observed.length,unobservedCount:normalized.length-observed.length};
}

/** An explicitly anchored duration is elapsed time, even across a DST change. */
export function anchoredWindowEnd({start,hours}={}){
  const anchor=explicitInstant(start,'窗口开始时间');
  return new Date(anchor.getTime()+validateHours(hours)*HOUR);
}

/**
 * An event leaves a trailing window at event.instant + hours, independently.
 * Return future release events only; a release exactly at asOf is already out.
 * This is not a quota balance calculator or a single whole-account reset.
 */
export function rollingReleases({events,hours,asOf}={}){
  const duration=validateHours(hours)*HOUR,reference=instant(asOf,'观察时间').getTime();
  if(!Array.isArray(events))throw new RangeError('请提供使用记录列表。');
  return events.map(event=>{
    if(!event||typeof event.amount!=='number'||!Number.isFinite(event.amount)||event.amount<=0)throw new RangeError('每笔使用量应为正数。');
    const usedAt=instant(event.instant,'使用时间').getTime();
    if(usedAt>reference)throw new RangeError('使用记录不能晚于观察时间。');
    return {instant:new Date(usedAt+duration),amount:event.amount};
  }).filter(event=>event.instant.getTime()>reference).sort((a,b)=>a.instant-b.instant);
}

/** World clocks all describe one instant; dateDelta is relative to the UTC date. */
export function globalResetSnapshot(value,cities){
  const at=instant(value);
  if(!Array.isArray(cities))throw new RangeError('请提供城市列表。');
  const utc=partsAt(at,'UTC'),utcDate=Date.parse(`${utc.date}T00:00:00Z`);
  return cities.map(city=>{
    if(!city||typeof city.id!=='string'||typeof city.name!=='string'||typeof city.zone!=='string')throw new RangeError('城市需要 id、名称与明确时区。');
    const local=partsAt(at,city.zone);
    return {id:city.id,name:city.name,zone:city.zone,...local,offset:offsetMinutes(at,city.zone),dateDelta:Math.round((Date.parse(`${local.date}T00:00:00Z`)-utcDate)/DAY)};
  });
}
