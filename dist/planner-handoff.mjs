import {partsAt, offsetMinutes} from './time-engine.mjs';

/** Carry an exact moment into the planner; never reinterpret its wall-clock time. */
export function createPlannerHandoff(caseData, cities) {
  const cityIds=[...new Set(Array.isArray(caseData?.cityIds)?caseData.cityIds:[])];
  const participants=cityIds.map(id=>cities.find(city=>city.id===id));
  if(cityIds.length<1||cityIds.length>6||participants.some(city=>!city)) {
    throw new RangeError('课程案例需要 1–6 座有效城市。');
  }
  const value=caseData?.instant;
  if(typeof value!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new RangeError('课程案例需要带时区的明确时刻。');
  }
  const instant=new Date(value);
  if(!Number.isFinite(instant.getTime()))throw new RangeError('课程案例的时刻无效。');
  const durationMinutes=caseData.durationMinutes??30;
  if(![30,60,90,120].includes(durationMinutes))throw new RangeError('请选择 30、60、90 或 120 分钟。');
  const clocks=participants.map(city=>({cityId:city.id,...partsAt(instant,city.zone),offsetMinutes:offsetMinutes(instant,city.zone)}));
  const schedules={};
  for(const id of cityIds) {
    const schedule=caseData.schedules?.[id];
    if(!schedule)continue;
    const validTime=value=>typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    if(!validTime(schedule.start)||!validTime(schedule.end)||!Array.isArray(schedule.weekdays)||schedule.weekdays.some(day=>!Number.isInteger(day)||day<1||day>7)) {
      throw new RangeError('课程案例的个人可用时间无效。');
    }
    schedules[id]={start:schedule.start,end:schedule.end,weekdays:[...new Set(schedule.weekdays)]};
    if(schedule.sleepStart!==undefined||schedule.sleepEnd!==undefined){
      if(!validTime(schedule.sleepStart)||!validTime(schedule.sleepEnd)||schedule.sleepStart===schedule.sleepEnd){
        throw new RangeError('课程案例的睡眠避让时段无效，请同时填写不同的开始与结束钟点。');
      }
      schedules[id].sleepStart=schedule.sleepStart;
      schedules[id].sleepEnd=schedule.sleepEnd;
    }
  }
  return {
    cityIds,baseCityId:cityIds[0],instant:instant.toISOString(),
    date:clocks[0].date,time:clocks[0].time,durationMinutes,clocks,schedules,
    sourceTitle:typeof caseData.sourceTitle==='string'?caseData.sourceTitle.slice(0,500):'地球入门课',
    sourceView:['phrases','tour','routines'].includes(caseData.sourceView)?caseData.sourceView:'tour',
    ...(typeof caseData.sourceNote==='string'?{sourceNote:caseData.sourceNote.slice(0,500)}:{}),
  };
}
