import {partsAt,offsetMinutes,formatOffset,zonedToInstants,addDays} from './time-engine.mjs';

const MINUTE=60_000;
const phases=Object.freeze([
  {id:'late-night',label:'凌晨',startMinutes:0,endMinutes:360},
  {id:'early-morning',label:'清晨',startMinutes:360,endMinutes:540},
  {id:'morning',label:'上午',startMinutes:540,endMinutes:720},
  {id:'afternoon',label:'下午',startMinutes:720,endMinutes:1080},
  {id:'evening',label:'晚上',startMinutes:1080,endMinutes:1440},
]);

function clockMinute(value){
  if(typeof value==='number'){
    if(!Number.isInteger(value)||value<0||value>=1440)throw new RangeError('钟点应为 0–1439 的整分钟。');
    return value;
  }
  if(value&&typeof value==='object'&&Number.isInteger(value.hour)&&Number.isInteger(value.minute)){
    if(value.hour<0||value.hour>23||value.minute<0||value.minute>59)throw new RangeError('当地钟点无效。');
    return value.hour*60+value.minute;
  }
  if(typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))return Number(value.slice(0,2))*60+Number(value.slice(3));
  throw new RangeError('请使用有效的当地钟点 HH:mm。');
}

function validInstant(value){
  if(typeof value==='string'){
    const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.exec(value);
    if(!match)throw new RangeError('时间点必须包含有效日期及 Z 或 UTC 偏移。');
    zonedToInstants(match[1],match[2],'UTC');
  }
  if(!(value instanceof Date)&&typeof value!=='string'&&typeof value!=='number')throw new RangeError('需要有效的明确时间点。');
  const at=new Date(value);if(!Number.isFinite(at.getTime()))throw new RangeError('需要有效的明确时间点。');return at;
}

/** A clock-reading description, never a claim about a person's activity. */
export function dayPhase(localOrMinute){
  const minute=clockMinute(localOrMinute),phase=phases.find(item=>minute>=item.startMinutes&&minute<item.endMinutes);
  return {...phase,minute};
}

function adjustmentText(minutes){
  if(!minutes)return '+ 0 分钟';
  const total=Math.abs(minutes),hours=Math.floor(total/60),rest=total%60;
  return `${minutes<0?'−':'+'} ${hours?hours+' 小时':''}${hours&&rest?' ':''}${rest?rest+' 分钟':''}`;
}

function clockRecord(at,zone,label,name=label,variantRules){
  const local=partsAt(at,zone),offset=offsetMinutes(at,zone);
  return {...local,instant:at.toISOString(),zone,label,name,offset,offsetLabel:formatOffset(offset),variant:variantRules?.[String(offset)]||formatOffset(offset)};
}

function endpointStatus(candidates){return candidates.length===0?'gap':candidates.length===1?'ready':'fold';}

/**
 * Compare one instant and one source-calendar reference window.
 * The chosen window starts on the selected region's current local date.
 * An overnight window belongs to that start date and ends on the next date.
 * No missing/repeated clock endpoint is silently moved or selected.
 */
export function buildTimeReference({instant,region,referenceZone='Asia/Shanghai',quietStart='00:00',quietEnd='06:00'}={}){
  const at=validInstant(instant);
  if(!region||typeof region.zone!=='string'||!region.zone)throw new RangeError('请提供带 IANA 时区的地域。');
  const applicable=region.id!=='utc'&&!['UTC','Etc/UTC'].includes(region.zone);
  const startMinute=applicable?clockMinute(quietStart):0,endMinute=applicable?clockMinute(quietEnd):0;
  if(applicable&&startMinute===endMinute)throw new RangeError('避扰参考段的开始与结束不能相同。');
  const referenceLabel=referenceZone==='Asia/Shanghai'?'北京时间':referenceZone==='UTC'?'UTC':'参照时间';
  const selectedLabel=region.short||region.name||region.city||region.zone;
  const reference=clockRecord(at,referenceZone,referenceLabel),utc=clockRecord(at,'UTC','UTC');
  const selected=clockRecord(at,region.zone,selectedLabel,region.name||selectedLabel,region.variantRules);
  const steps=[
    {id:'to-utc',from:reference,to:utc,adjustmentMinutes:-reference.offset,expression:`${reference.label} ${reference.date} ${reference.time} ${adjustmentText(-reference.offset)} = UTC ${utc.date} ${utc.time}`},
    {id:'from-utc',from:utc,to:selected,adjustmentMinutes:selected.offset,expression:`UTC ${utc.date} ${utc.time} ${adjustmentText(selected.offset)} = ${selected.label} ${selected.date} ${selected.time}`},
  ];
  const calculation={toUtcMinutes:-reference.offset,fromUtcMinutes:selected.offset,deltaMinutes:selected.offset-reference.offset,steps};
  const phase=applicable?dayPhase(selected):null;
  const quiet={applicable,status:applicable?'ready':'not-applicable',startTime:quietStart,endTime:quietEnd,
    sourceStartDate:selected.date,sourceEndDate:endMinute<startMinute?addDays(selected.date,1):selected.date,
    crossesMidnight:endMinute<startMinute,wallMinutes:(endMinute-startMinute+1440)%1440,
    containsLocalClock:applicable&&(startMinute<endMinute?phase.minute>=startMinute&&phase.minute<endMinute:phase.minute>=startMinute||phase.minute<endMinute),
    scope:'仅按当地钟点划定的可调整避扰参考，不是睡眠统计，也不代表某个人正在休息。',
    startCandidates:[],endCandidates:[],startStatus:'not-applicable',endStatus:'not-applicable',
  };
  if(applicable){
    const candidate=value=>({instant:value.toISOString(),source:clockRecord(value,region.zone,selectedLabel,region.name||selectedLabel,region.variantRules),reference:clockRecord(value,referenceZone,referenceLabel),utc:clockRecord(value,'UTC','UTC')});
    quiet.startCandidates=zonedToInstants(quiet.sourceStartDate,quietStart,region.zone).map(candidate);
    quiet.endCandidates=zonedToInstants(quiet.sourceEndDate,quietEnd,region.zone).map(candidate);
    quiet.startStatus=endpointStatus(quiet.startCandidates);quiet.endStatus=endpointStatus(quiet.endCandidates);
    quiet.status=quiet.startStatus==='gap'||quiet.endStatus==='gap'?'gap':quiet.startStatus==='fold'||quiet.endStatus==='fold'?'fold':'ready';
    if(quiet.status==='ready'){
      quiet.start=quiet.startCandidates[0];quiet.end=quiet.endCandidates[0];
      quiet.actualMinutes=(Date.parse(quiet.end.instant)-Date.parse(quiet.start.instant))/MINUTE;
      if(quiet.actualMinutes<=0)throw new RangeError('这段当地钟点不能组成向前的有效时段，请重新选择。');
      quiet.actualHours=quiet.actualMinutes/60;quiet.hasOffsetChange=quiet.start.source.offset!==quiet.end.source.offset;
      quiet.containsInstant=at>=new Date(quiet.start.instant)&&at<new Date(quiet.end.instant);
    }
  }
  return {instant:at.toISOString(),applicable,reference,utc,selected,phase,calculation,quiet};
}
