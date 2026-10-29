import {timeExpressions} from './common-time.mjs';
import {zonedToInstants,addDays,partsAt,offsetMinutes} from './time-engine.mjs';
import {resolveDailyReset,nextDailyReset,anchoredWindowEnd} from './reset-time-model.mjs';
import {hasAnnouncementDeadline,hasAnnouncementMidnight,announcementTimeQualifier,parseAnnouncementRelativeDate,resolveAnnouncementRelativeDate} from './announcement-relative-date.mjs';

const pad=value=>String(value).padStart(2,'0');
const missingLabels={date:'完整日期（含年份）',time:'当地钟点',source:'明确时区或城市',start:'倒计时起点（带 UTC 偏移）',asOf:'当前计算基准（带 UTC 偏移）',hours:'经过多少小时'};
const ruleChoiceMessage='确认这是指定日期的一次事件，还是从该日生效的每日规则';
const contextDateMessage='帖子所指当地日期（含年份）';
const boundaryChoiceMessage='确认午夜指所填日期的开始还是结束';
const aliasRules=[
  ['PST',/\bPST\b|\bPacific\s+Standard\s+Time\b|太平洋标准(?:时间|时)/iu],['PDT',/\bPDT\b|\bPacific\s+Daylight\s+Time\b|太平洋夏令(?:时间|时)/iu],
  ['PT',/\bPT\b|\bPacific\s+Time\b|太平洋时间|洛杉矶|旧金山|西雅图|\b(?:Los\s+Angeles|San\s+Francisco|Seattle)\b|America\/Los_Angeles/iu],
  ['ET',/\bET\b|\bEastern\s+Time\b|纽约|\bNew\s+York\b|America\/New_York/iu],
  ['CT',/\bCT\b|\bCentral\s+Time\b|芝加哥|\bChicago\b|America\/Chicago/iu],
  ['MT',/\bMT\b|\bMountain\s+Time\b|丹佛|\bDenver\b|America\/Denver/iu],
  ['London',/伦敦|\bLondon(?:\s+time)?\b|Europe\/London/iu],
  ['Paris',/巴黎|柏林|中欧当地时间|\b(?:Paris|Berlin)(?:\s+time)?\b|Europe\/Paris/iu],
  ['Beijing',/北京时间|北京|上海|新加坡|\b(?:Beijing|Shanghai|Singapore)(?:\s+time)?\b|Asia\/Shanghai/iu],
  ['Tokyo',/东京|首尔|\bJST\b|\b(?:Tokyo|Seoul)(?:\s+time)?\b|Asia\/Tokyo/iu],
  ['India',/印度时间|新德里|\bIndia(?:n)?\s+(?:Standard\s+)?Time\b|\bNew\s+Delhi\b|Asia\/Kolkata/iu],
  ['Sydney',/悉尼|\bSydney(?:\s+time)?\b|Australia\/Sydney/iu],
  ['SaoPaulo',/圣保罗|\bS[aã]o\s+Paulo(?:\s+time)?\b|America\/Sao_Paulo/iu],
  ['EastAfrica',/内罗毕|东非时间|\bEAT\b|\bNairobi(?:\s+time)?\b|Africa\/Nairobi/iu],
  ['Dubai',/迪拜|\bDubai(?:\s+time)?\b|Asia\/Dubai/iu],
];

function offsetSource(value){
  const match=/^UTC([+−-])(\d{1,2})(?::?(\d{2}))?$/iu.exec(String(value));
  if(!match)return null;
  const hour=Number(match[2]),minute=Number(match[3]||0);
  if(hour>14||minute>59||(hour===14&&minute!==0))throw new RangeError('UTC 偏移应在 −14:00 至 +14:00 之间。');
  const offset=(match[1]==='+'?1:-1)*(hour*60+minute),id=`UTC${offset<0?'-':'+'}${pad(hour)}:${pad(minute)}`;
  return {id,label:id,offset};
}

export function announcementTimeSource(value){
  const term=timeExpressions.find(item=>item.id===value);
  if(term)return {...term};
  const numeric=offsetSource(value);
  if(numeric)return numeric;
  throw new RangeError('请选择公告明确写出的时区或城市；CST、IST 等缩写需要先确认。');
}

function sourceWarnings(source){
  return ['PST','PDT'].includes(source?.id)?[`${source.id} 按固定 UTC${source.offset<0?'−':'+'}${pad(Math.floor(Math.abs(source.offset)/60))}:${pad(Math.abs(source.offset)%60)} 换算；若作者泛指洛杉矶当地时间，请改选 PT 后重新核对。`]:[];
}

/** Never let Date.parse normalize an invalid date or assume the machine's zone. */
function explicitInstant(value,label){
  if(value instanceof Date){if(!Number.isFinite(value.getTime()))throw new RangeError(`${label}无效。`);return new Date(value);}
  if(typeof value!=='string')throw new RangeError(`${label}需要带 Z 或 UTC 偏移的完整时间戳。`);
  const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::([0-5]\d)(?:\.(\d{1,3}))?)?(Z|[+-](\d{2}):(\d{2}))$/iu.exec(value);
  if(!m)throw new RangeError(`${label}需要带 Z 或 UTC 偏移的完整时间戳。`);
  zonedToInstants(m[1],m[2],'UTC');
  if(m[6]&&(Number(m[6])>14||Number(m[7])>59||(Number(m[6])===14&&Number(m[7])!==0)))throw new RangeError(`${label}的 UTC 偏移应在 −14:00 至 +14:00 之间。`);
  const result=new Date(value);
  if(!Number.isFinite(result.getTime()))throw new RangeError(`${label}无效。`);
  return result;
}

function missingResult(kind,keys,warnings=[],extra={}){
  return {status:'incomplete',kind,candidates:[],missing:keys.map(key=>missingLabels[key]||key),warnings,...extra};
}

/**
 * Calculation only follows fields explicitly supplied by the caller. It does
 * not inspect account state, infer a subscription period, or choose DST policy.
 */
export function calculateResetAnnouncement({kind='event',date,time,source,timestamp,hours,start,asOf,foldPick,needsRuleChoice=false,relation='at',boundary,needsBoundaryChoice=false,assumptions=[],dateResolution}={}){
  if(!['event','daily','duration'].includes(kind))throw new RangeError('请选择明确时刻、每日规则或有起点的倒计时。');
  if(!['at','before'].includes(relation))throw new RangeError('请选择明确时刻或截止之前。');
  if(boundary!==undefined&&!['start-of-day','end-of-day'].includes(boundary))throw new RangeError('午夜日界应明确选为该日开始或该日结束。');
  const resolvedDate=dateResolution?.status==='resolved'&&dateResolution.resolvedDate===date&&typeof dateResolution.label==='string'?{...dateResolution}:null;
  const meaning={relation,...(boundary?{boundary}:{}),assumptions:Array.isArray(assumptions)?assumptions.filter(item=>typeof item==='string'):[],...(resolvedDate?{dateResolution:resolvedDate}:{})};
  if(needsRuleChoice)return missingResult(kind,[ruleChoiceMessage],[],{needsRuleChoice:true,...meaning});
  if(needsBoundaryChoice)return missingResult(kind,[boundaryChoiceMessage],[],{needsBoundaryChoice:true,...meaning});
  if(boundary&&(kind!=='event'||timestamp||time!=='00:00'))throw new RangeError('午夜日界只适用于单次事件的 00:00；不能将其它钟点静默移到次日。');
  if(kind==='duration'){
    const missing=[];if(hours===undefined||hours===null||hours==='')missing.push('hours');if(!start)missing.push('start');
    if(missing.length)return missingResult(kind,missing,[],meaning);
    const reference=explicitInstant(start,'倒计时起点'),duration=typeof hours==='number'?hours:Number(hours);
    const instant=anchoredWindowEnd({start:reference.toISOString(),hours:duration});
    return {status:'ready',kind,instant,candidates:[instant],missing:[],warnings:[],start:reference,reference,hours:duration,source:{id:'UTC',label:'UTC · 倒计时的明确起点',zone:'UTC'},...meaning};
  }
  if(kind==='event'&&timestamp){
    const instant=explicitInstant(timestamp,'公告时间戳');
    const suffix=/Z$/iu.test(timestamp)?'UTC':`UTC${timestamp.slice(-6)}`;
    return {status:'ready',kind,instant,candidates:[instant],missing:[],warnings:[],source:announcementTimeSource(suffix),...meaning};
  }
  const keys=[];if(kind==='event'&&!date)keys.push('date');if(!time)keys.push('time');if(!source)keys.push('source');if(kind==='daily'&&!asOf)keys.push('asOf');
  if(keys.length)return missingResult(kind,keys,[],meaning);
  const term=announcementTimeSource(source),warnings=sourceWarnings(term),options={time,zone:term.zone,fixedOffset:term.offset};
  if(kind==='daily'){
    const reference=explicitInstant(asOf,'当前计算基准'),next=nextDailyReset({...options,asOf:reference});
    return {...next,kind,source:term,reference,missing:[],warnings,...meaning};
  }
  const effectiveDate=boundary==='end-of-day'?addDays(date,1):date;
  const candidates=resolveDailyReset({...options,date:effectiveDate});
  const status=candidates.length===0?'gap':candidates.length===1?'ready':'fold';
  const detail={source:term,localDate:effectiveDate,time,...(boundary?{contextDate:date}:{}),...meaning};
  const alternativesFor=at=>{
    if(relation!=='before'||!['PST','PDT'].includes(term.id)||offsetMinutes(at,'America/Los_Angeles')===term.offset)return [];
    const alternative=resolveDailyReset({date:effectiveDate,time,zone:'America/Los_Angeles'});
    if(alternative.length!==1)return [];
    return [{label:'若原文泛指美国太平洋当地时间（PT）',instant:alternative[0],sourceId:'PT',source:{...timeExpressions.find(item=>item.id==='PT')},relation:'before',...(boundary?{boundary,contextDate:date}:{}),localDate:effectiveDate,time,note:'按同一所指当地日期与钟点改用洛杉矶规则，仅供核对；主结果仍严格采用原文的固定偏移。'}];
  };
  if(status==='fold'&&foldPick!==undefined&&foldPick!==null){
    if(foldPick!==0&&foldPick!==1)throw new RangeError('重复钟点需要明确选择第一次或第二次。');
    return {status:'ready',kind,instant:candidates[foldPick],candidates,missing:[],warnings,...detail,foldPick,alternatives:alternativesFor(candidates[foldPick])};
  }
  return {status,kind,...(status==='ready'?{instant:candidates[0],alternatives:alternativesFor(candidates[0])}:{}),candidates,missing:[],warnings,...detail};
}

const pstSpelling=/(?:\bPST\b|\bPacific\s+Standard\s+Time\b|太平洋标准(?:时间|时))/iu;
const fixedPstSpelling=/(?:\b(?:fixed|strict|strictly|literal|literally)\b[^.!?\n]{0,35}(?:\bPST\b|\bPacific\s+Standard\s+Time\b)|(?:\bPST\b|\bPacific\s+Standard\s+Time\b)[^.!?\n]{0,25}\b(?:fixed|strict|strictly|literal|literally)\b|(?:严格|固定|字面)[^。！？\n]{0,15}(?:PST|太平洋标准(?:时间|时))|(?:PST|太平洋标准(?:时间|时))[^。！？\n]{0,15}(?:严格|固定))/iu;
function plainReading(source,{originalSource=source,reason='stated-source'}={}){
  return {version:1,originalSource:originalSource||null,activeSource:source||null,mode:source==='PT'?'local':'explicit',switchable:false,reason,notice:source==='PT'?'按太平洋当地时间 PT，随公告日期采用 PST 或 PDT。':source==='PST'?'当前采用固定 PST（UTC−08:00）。':''};
}
const applicableReading=(reading,fields)=>Boolean(reading&&reading.version===1&&reading.originalSource==='PST'&&reading.switchable===true&&['local','strict'].includes(reading.mode)&&reading.activeSource===(reading.mode==='local'?'PT':'PST')&&fields.source===reading.activeSource&&!fields.timestamp);

/**
 * A reading preference for ordinary social posts, applied before resolving
 * "today". The strict calculator above continues to respect supplied fields.
 */
export function resolveAnnouncementReading(parsed,{text='',interpretation='local'}={}){
  if(!parsed||typeof parsed!=='object')throw new RangeError('请先提供公告提取结果。');
  if(!['local','strict'].includes(interpretation))throw new RangeError('请选择太平洋当地时间或严格 PST。');
  const fields={...(parsed.fields||{})},previous=parsed.reading,raw=String(text||'');
  const statedSource=applicableReading(previous,fields)?'PST':fields.source;
  const numeric=/^UTC[+−-]/iu.test(String(fields.source||''));
  const originalSource=numeric&&pstSpelling.test(raw)?'PST':statedSource;
  const explicit=Boolean(fields.timestamp)||numeric||fixedPstSpelling.test(raw);
  if(statedSource!=='PST'||explicit){
    return {...parsed,fields,reading:plainReading(fields.source,{originalSource,reason:fields.timestamp?'explicit-timestamp':numeric?'explicit-offset':explicit?'explicit-pst':'stated-source'})};
  }
  fields.source=interpretation==='strict'?'PST':'PT';
  const reading={version:1,originalSource:'PST',activeSource:fields.source,mode:interpretation,switchable:true,reason:'ordinary-pst',notice:interpretation==='local'?'原文写 PST，暂按太平洋当地时间 PT 理解；可查看严格 PST。':'当前严格按原文 PST（固定 UTC−08:00）换算；可返回当地 PT。'};
  const warnings=(parsed.warnings||[]).filter(message=>!/^PST 按固定 UTC/u.test(message));
  return {...parsed,fields,warnings,reading};
}

/** Calculate the chosen reading and an explicitly labelled comparison only. */
export function calculateAnnouncementReading(fields={}, {reading,occurrenceDate}={}){
  const supplied=applicableReading(reading,fields);
  const activeReading=supplied?{version:1,originalSource:'PST',activeSource:reading.activeSource,mode:reading.mode,switchable:true,reason:'ordinary-pst',notice:reading.mode==='local'?'原文写 PST，暂按太平洋当地时间 PT 理解；可查看严格 PST。':'当前严格按原文 PST（固定 UTC−08:00）换算；可返回当地 PT。'}:plainReading(fields.source,{originalSource:reading?.originalSource||fields.source,reason:fields.timestamp?'explicit-timestamp':'supplied-fields'});
  let result;
  if(fields.kind==='daily'&&occurrenceDate!==undefined&&occurrenceDate!==null&&occurrenceDate!==''){
    // Switching interpretations compares the same local calendar occurrence,
    // rather than independently finding another upcoming occurrence.
    if(fields.boundary!==undefined)throw new RangeError('午夜日界只适用于单次事件的 00:00；不能将其它钟点静默移到次日。');
    if(!fields.asOf)result=calculateResetAnnouncement(fields);
    else{
      const reference=explicitInstant(fields.asOf,'当前计算基准');
      const fixed=calculateResetAnnouncement({...fields,kind:'event',date:occurrenceDate});
      result={...fixed,kind:'daily',reference,localDate:occurrenceDate,occurrenceDate};
    }
  }else result=calculateResetAnnouncement(fields);
  activeReading.activeSource=result.source?.id||fields.source||null;
  if(!supplied)return {...result,reading:activeReading,alternatives:[]};
  const comparisonSource=activeReading.mode==='local'?'PST':'PT';
  // Do not carry a choice between repeated local times into the other rule.
  const comparisonFields={...fields,source:comparisonSource,foldPick:undefined};
  if(fields.kind==='daily'&&result.localDate){comparisonFields.kind='event';comparisonFields.date=result.localDate;delete comparisonFields.boundary;}
  const comparison=calculateResetAnnouncement(comparisonFields);
  const ready=result.status==='ready'&&comparison.status==='ready';
  const differenceMinutes=ready?(comparison.instant-result.instant)/60000:null,sameInstant=ready?differenceMinutes===0:null;
  const interpretation=activeReading.mode==='local'?'strict':'local';
  const supplement={...comparison,alternatives:[],interpretation,label:interpretation==='strict'?'严格 PST（固定 UTC−08:00）':'太平洋当地时间 PT',sameInstant,differenceMinutes};
  const alternatives=ready&&!sameInstant?[{...supplement,sourceId:comparison.source.id,note:interpretation==='strict'?'补充解释：严格按 PST 固定 UTC−08:00，主结果采用太平洋当地时间。':'补充解释：按洛杉矶在同一当地日期的规则，主结果当前严格采用 PST。'}]:[];
  return {...result,reading:{...activeReading,sameInstant,differenceMinutes},supplement,alternatives};
}

function parseDate(text){
  const dates=[];
  for(const match of text.matchAll(/(?<!\d)(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?!\d)/gu))dates.push({value:`${match[1]}-${pad(match[2])}-${pad(match[3])}`,raw:match[0]});
  const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const monthName='(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  for(const match of text.matchAll(new RegExp(`\\b(${monthName})\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})\\b`,'giu')))dates.push({value:`${match[3]}-${pad(months[match[1].slice(0,3).toLowerCase()])}-${pad(match[2])}`,raw:match[0]});
  return dates;
}

function clockFrom(text){
  const clocks=[];
  for(const m of text.matchAll(/(?<![\d:])([0-9]{1,2})(?::([0-9]{2}))?\s*([ap])\.?m\.?(?!\w)/giu)){
    const h=Number(m[1]),minute=Number(m[2]||0);if(h<1||h>12||minute>59)throw new RangeError('12 小时制的钟点应在 1–12 点、分钟 00–59 之间。');
    clocks.push({value:`${pad(h%12+(m[3].toLowerCase()==='p'?12:0))}:${pad(minute)}`,raw:m[0]});
  }
  let remaining=text;for(const clock of clocks)remaining=remaining.replace(clock.raw,' ');
  for(const m of remaining.matchAll(/(?<![\d:])([0-9]{1,2}):([0-9]{2})(?![\d:])/gu)){
    const h=Number(m[1]),minute=Number(m[2]);if(h>23||minute>59)throw new RangeError('钟点应在 00:00–23:59 之间。');
    clocks.push({value:`${pad(h)}:${pad(minute)}`,raw:m[0]});
  }
  if(/\bnoon\b|正午/iu.test(remaining))clocks.push({value:'12:00',raw:'noon'});
  for(const m of remaining.matchAll(/(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|晚间|午夜|半夜)?\s*(?<!\d)(\d{1,2})\s*(?:点|时)(?:(半)|([0-5]?\d)\s*分?)?(?![\d分])/gu)){
    let hour=Number(m[2]);const minute=m[3]?30:Number(m[4]||0),period=m[1];
    if(hour>23||minute>59)throw new RangeError('钟点应在 00:00–23:59 之间。');
    if(period&&hour>12)throw new RangeError('带上午／下午的钟点应在 0–12 点之间。');
    if(['下午','傍晚','晚上','晚间'].includes(period))hour=hour%12+12;
    if(['晚上','晚间'].includes(period)&&Number(m[2])===12)hour=0;
    if(['凌晨','清晨','早上','午夜','半夜'].includes(period)&&hour===12)hour=0;
    if(period==='中午'&&hour<11)hour=hour%12+12;
    clocks.push({value:`${pad(hour)}:${pad(minute)}`,raw:m[0]});
  }
  if(/零点/u.test(remaining))clocks.push({value:'00:00',raw:'零点'});
  return clocks;
}

function parsedResult(kind,fields,missing,warnings,message){
  return {status:missing.length?'incomplete':'recognized',kind,fields,missing:missing.map(key=>missingLabels[key]||key),warnings,message,...(fields.relation?{relation:fields.relation}:{}),...(fields.boundary?{boundary:fields.boundary}:{})};
}

/** Resolve relative civil dates against the chosen source clock and publication instant. */
export function resolveAnnouncementContext(parsed,{asOf,defaultPublication=false}={}){
  if(!parsed||typeof parsed!=='object')throw new RangeError('请先提供公告提取结果。');
  const reference=explicitInstant(asOf,'公告发布／查看参照时间'),fields={...(parsed.fields||{})};
  const assumptions=Array.isArray(parsed.assumptions)?[...parsed.assumptions]:[];
  let needsBoundaryChoice=parsed.needsBoundaryChoice===true,dateResolution=parsed.dateResolution||null,dateCandidates=[],dateResolutionBlocked=false;
  let source=null,local=null;
  if(fields.source){source=announcementTimeSource(fields.source);local=source.zone?partsAt(reference,source.zone):partsAt(new Date(reference.getTime()+source.offset*60_000),'UTC');}
  if(!fields.date&&parsed.relativeDate&&local){
    dateResolution=resolveAnnouncementRelativeDate(parsed.relativeDate,{sourceDate:local.date,sourceId:source.id});
    if(dateResolution.status==='resolved'){fields.date=dateResolution.resolvedDate;fields.dateResolution=dateResolution;assumptions.push(dateResolution.label);}
    else{dateResolutionBlocked=true;dateCandidates=dateResolution.candidates||[];}
  }
  const canDefault=defaultPublication&&parsed.midnightBefore===true&&!dateResolutionBlocked;
  if(defaultPublication&&!dateResolutionBlocked&&(parsed.midnightBefore||parsed.timeQualifier)&&!fields.date&&local&&!parsed.relativeDate){
    fields.date=local.date;
    assumptions.push(`按给定的发布／查看参照时刻 ${reference.toISOString()}，公告所指的当地当天按 ${source.id} 的 ${local.date} 理解；这是默认发布日，可修改。`);
    dateResolution={status:'resolved',raw:'当天',sourceDate:local.date,sourceId:source.id,resolvedDate:local.date,assumed:true,canEdit:true,label:`按 ${source.id} 发布参照日 ${local.date} 理解，可修改。`};fields.dateResolution=dateResolution;
  }
  if(canDefault&&fields.date&&needsBoundaryChoice&&fields.time==='00:00'){
    fields.boundary='end-of-day';needsBoundaryChoice=false;
    assumptions.push(`“午夜前”默认指 ${fields.date} 这一天结束前，即当地 ${addDays(fields.date,1)} 00:00 之前；它是截止边界，不是已经确认的到达时刻，可改为这一天开始。`);
  }
  const missing=(parsed.missing||[]).filter(item=>!((item===contextDateMessage||item===missingLabels.date)&&fields.date)&&!(item===boundaryChoiceMessage&&!needsBoundaryChoice));
  const relativeDaily=parsed.kind==='daily'&&Boolean(parsed.relativeDate)&&Boolean(fields.date);
  if(relativeDaily&&!missing.includes(ruleChoiceMessage))missing.push(ruleChoiceMessage);
  if(dateResolutionBlocked&&!missing.includes(contextDateMessage))missing.push(contextDateMessage);
  const unresolved=Boolean(parsed.relativeDate&&!fields.date);
  return {...parsed,kind:relativeDaily?'event':parsed.kind,...(relativeDaily?{needsRuleChoice:true}:{}),fields,missing,status:parsed.status==='unsupported'?'unsupported':missing.length?'incomplete':'recognized',relation:fields.relation||parsed.relation,boundary:fields.boundary||parsed.boundary,needsBoundaryChoice,needsDateContext:!fields.date&&Boolean(parsed.midnightBefore||parsed.relativeDate),hasUnresolvedRelativeDate:unresolved,dateResolution,dateResolutionBlocked,dateCandidates,assumptions:[...new Set(assumptions)],reference};
}

function hasDailyRule(text){
  // In "daily quota", daily describes the allowance, not the reset verb.
  // Remove those noun phrases before looking for an actual recurrence word.
  const withoutAllowanceNames=text
    .replace(/\bdaily\s+(?:(?:usage|token|request|api|message|remaining|available|free|subscription|total|model)\s+)*(?:quotas?|limits?|allowances?|allocations?|budgets?|caps?|credits?|tokens?|usage)\b/giu,' ')
    .replace(/每日\s*(?:(?:免费|订阅|基础|剩余|可用|总|使用|模型|token)\s*)*(?:额度|配额|限额|用量|积分|次数|使用量|请求量)/giu,' ');
  return /\b(?:daily|every\s+day|each\s+day)\b|每天|每日/iu.test(withoutAllowanceNames);
}

function elapsedExpression(text){
  // Calendar dates are not elapsed quantities ("将在2026年11月2日…").
  // Keep the original text for the later civil-date extractor.
  for(const date of parseDate(text))text=text.replace(date.raw,' ');
  text=text.replace(/\d{1,2}月\d{1,2}日/gu,' ');
  const number='-?\\d+(?:\\.\\d+)?';
  const alternative='(?:or|to|或|或者|至|到|[-–~／/])';
  const numberChoice=`${number}(?:\\s*${alternative}\\s*${number})*`;
  const unit='(?:hours?|hrs?|h|minutes?|mins?|m|milliseconds?|ms|seconds?|secs?|s|days?|d|weeks?|months?|years?)(?![a-z])|(?:(?:个)?小时|分钟|分|毫秒|秒钟|秒|星期|周|天|日|个月|月|年)';
  const quantity=`${numberChoice}\\s*(?:${unit})`;
  const separator='\\s*(?:(?:and|or|to)\\b|或者|和|又|零|或|至|到|[+,-–~／/，])?\\s*';
  const chain=`${quantity}(?:${separator}${quantity})*`;
  const matches=[];
  const collect=(pattern,kind)=>{
    for(const match of text.matchAll(pattern))matches.push({raw:match[1],kind,index:match.index});
  };
  collect(new RegExp(`\\b(?:in|after)\\s+(${chain})`,'giu'),'countdown');
  collect(new RegExp(`\\bevery\\s+(${chain})`,'giu'),'frequency');
  collect(new RegExp(`(${chain})\\s*(?:之后|以后|后)`,'giu'),'countdown');
  collect(new RegExp(`每\\s*(${chain})`,'giu'),'frequency');
  collect(new RegExp(`(?:还有|剩余|剩下|倒计时|将在)\\s*(${chain})`,'giu'),'countdown');
  if(!matches.length){const bare=new RegExp(`^\\s*(${chain})\\s*$`,'iu').exec(text);if(bare)matches.push({raw:bare[1],kind:'countdown',index:0});}
  if(!matches.length)return null;
  const values=[],unsupported=[];
  let ambiguous=false;
  for(const match of matches){
    if(/\bor\b|\bto\b|或者|或|至|到|[–~／/]|\d\s*-\s*\d/iu.test(match.raw))ambiguous=true;
    let total=0;
    for(const token of match.raw.matchAll(new RegExp(`(${number})\\s*(${unit})`,'giu'))){
      const amount=Number(token[1]),name=token[2].toLowerCase().replace(/^个/u,'');
      if(amount<0)throw new RangeError('时长不能为负数。');
      if(/^(?:hours?|hrs?|h|小时)$/u.test(name))total+=amount;
      else if(/^(?:minutes?|mins?|m|分钟|分)$/u.test(name))total+=amount/60;
      else unsupported.push(name);
    }
    if(total>1000)throw new RangeError('窗口时长应大于 0 且不超过 1000 小时。');
    if(total===0&&!unsupported.length&&!ambiguous)throw new RangeError('窗口时长应大于 0 且不超过 1000 小时。');
    values.push(total);
  }
  const unique=[...new Set(values.map(value=>Math.round(value*3_600_000)/3_600_000))];
  return {hours:unique.length===1?unique[0]:undefined,ambiguous:ambiguous||unique.length>1,unsupported:[...new Set(unsupported)],frequency:matches.some(match=>match.kind==='frequency')};
}

/**
 * Small, deterministic extractor for documented numeric/English date, clock,
 * city/zone and duration formats. Unsupported prose stays editable in the UI.
 */
export function parseResetAnnouncement(value){
  const text=String(value??'').trim();
  if(!text)return {status:'unsupported',kind:'event',fields:{},missing:[],warnings:[],message:'粘贴带日期、钟点和时区的公告，或直接填写结构化字段。'};
  const before=hasAnnouncementDeadline(text),midnightBefore=before&&hasAnnouncementMidnight(text),relativeDate=parseAnnouncementRelativeDate(text),timeQualifier=announcementTimeQualifier(text);
  const hasUnresolvedRelativeDate=Boolean(relativeDate);
  const fields=before?{relation:'before'}:{},warnings=[];
  if(before)warnings.push('原文表示截止边界之前；只能换算这个边界，不能据此认定实际到达或重置恰好发生在该时刻。');
  const duration=elapsedExpression(text),daily=hasDailyRule(text);
  if(duration){
    if(duration.frequency)warnings.push('“每几小时”只给出周期长度，还需要产品明确的周期起点；不能据此认定所有额度同时恢复。');
    warnings.push('起点应是这句倒计时所依据的发布或查看时刻；粘贴旧公告时不要默认从现在开始。');
    if(duration.unsupported.length)return parsedResult('duration',fields,['请用小时和分钟明确时长（暂不支持天、周、月、年或秒）','start'],warnings,'原文包含尚不支持的时长单位，未丢弃其中任何部分。');
    if(duration.ambiguous)return parsedResult('duration',fields,['选择明确的倒计时时长','start'],warnings,'原文包含多个时长方案，请确认采用哪一个后手动填写。');
    fields.hours=duration.hours;
    return parsedResult('duration',fields,['start'],warnings,'已提取时长；补上明确起点后才能算出结束时刻。');
  }
  const isoMatches=[...text.matchAll(/(?<![\d-])\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})(?![\d:])/giu)];
  if(isoMatches.length>1)return parsedResult('event',fields,['需要选择公告中哪一个完整时间戳'],warnings,'公告含多个时间戳，请手动选定要换算的事件。');
  if(isoMatches.length===1){
    const timestamp=isoMatches[0][0];explicitInstant(timestamp,'公告时间戳');
    if(daily)return {...parsedResult('event',{...fields,timestamp},[ruleChoiceMessage],warnings,'原文同时写了每日规则和明确时间戳，请先确认它表示哪一次或何时生效。'),needsRuleChoice:true};
    return parsedResult('event',{...fields,timestamp},[],warnings,before?'已提取带 UTC 偏移的截止边界；原文说的是在此之前。':'已提取带 UTC 偏移的完整时间戳。请核对它确实是额度更新时间。');
  }
  const dates=parseDate(text);
  const kind=daily&&!dates.length?'daily':'event';
  if(dates.length>1)return parsedResult(kind,fields,['需要选择公告中哪一个日期'],warnings,'公告含多个日期，请手动选定要换算的那一次。');
  let remainder=text;
  if(dates.length){fields.date=dates[0].value;zonedToInstants(fields.date,'00:00','UTC');remainder=remainder.replace(dates[0].raw,' ');}
  const offsets=[...remainder.matchAll(/\b(?:UTC|GMT)\s*([+−-])\s*(\d{1,2})(?::?(\d{2}))?(?!\d)/giu)];
  if(offsets.length>1)return parsedResult(kind,fields,['需要选择公告采用的 UTC 偏移'],[],'公告含多个偏移，请手动选定原公告采用的时区。');
  if(offsets.length){const m=offsets[0];fields.source=offsetSource(`UTC${m[1]}${m[2]}:${m[3]||'00'}`).id;remainder=remainder.replace(m[0],' ');}
  const ambiguous=/\b(?:CST|IST)\b/iu.exec(remainder);
  if(ambiguous){warnings.push(`${ambiguous[0].toUpperCase()} 可指多个地区，请确认城市后手动选择时区。`);delete fields.source;}
  else{
    const hits=aliasRules.filter(([,pattern])=>pattern.test(remainder));
    // A named city's explicit spelling may accompany its own abbreviation.
    const normalized=hits.map(([id])=>id),unique=[...new Set(normalized.filter(id=>!(id==='PT'&&normalized.some(other=>other==='PST'||other==='PDT'))))];
    const bareUtc=/\b(?:UTC|GMT|Zulu)\b/iu.test(remainder);
    const matchingFixedOffset=fields.source&&unique.length===1&&['PST','PDT'].includes(unique[0])&&announcementTimeSource(fields.source).offset===announcementTimeSource(unique[0]).offset;
    if(unique.length>1||(unique.length&&Boolean(fields.source||bareUtc)&&!matchingFixedOffset)){
      delete fields.source;warnings.push('原文提到多个地区或 UTC 偏移；请手动选择公告原始钟点采用的时区。');
    }else if(!fields.source&&unique.length===1)fields.source=unique[0];
    else if(!fields.source&&bareUtc)fields.source='UTC';
  }
  const clocks=clockFrom(remainder);
  if(timeQualifier&&!clocks.length)warnings.push(`${timeQualifier.toUpperCase()} 的具体截止钟点需确认；未默认 17:00 或午夜，请填写原公告或团队约定的钟点。`);
  if(clocks.length===1)fields.time=clocks[0].value;
  else if(clocks.length>1)warnings.push('原文含多个钟点；请手动选择需要换算的那个钟点。');
  if(midnightBefore&&(!clocks.length||clocks.every(clock=>clock.value==='00:00'))){fields.time='00:00';fields.boundary='end-of-day';}
  else if(midnightBefore&&clocks.length){delete fields.time;warnings.push('原文同时包含午夜和数字钟点，请先选定要换算的截止边界。');}
  if(/\bmidnight\b|午夜/iu.test(remainder)&&!fields.time)warnings.push('“午夜”容易混淆一天的开始和结束；请补全日期并明确填写 00:00。');
  if(/\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|今天|明天|后天|周[一二三四五六日天]/iu.test(remainder)&&!fields.date&&!daily)warnings.push('相对日期属于公告所指地区；请根据发布时刻确认完整年月日。');
  if(fields.source)warnings.push(...sourceWarnings(announcementTimeSource(fields.source)));
  const missing=[];if(kind==='event'&&!fields.date)missing.push(midnightBefore?contextDateMessage:'date');if(!fields.time)missing.push('time');if(!fields.source)missing.push('source');
  if(midnightBefore){
    missing.push(boundaryChoiceMessage);
    const result=parsedResult('event',fields,missing,warnings,'已识别“午夜前”的截止意思和时间说法；还需确定帖子所指当地日期，并核对午夜日界。');
    return {...result,relativeDate,timeQualifier,dateResolutionBlocked:false,midnightBefore:clocks.length===0||clocks.every(clock=>clock.value==='00:00'),needsBoundaryChoice:true,needsDateContext:!fields.date,hasTodayContext:/\b(?:today|tonight)\b|今天|今晚|今日/iu.test(text),hasUnresolvedRelativeDate,...(daily&&fields.date?{needsRuleChoice:true,missing:[...result.missing,ruleChoiceMessage]}:{})};
  }
  if(daily&&fields.date)return {...parsedResult(kind,fields,[...missing,ruleChoiceMessage],warnings,'原文同时写了每日规则和具体日期，已保留日期；请确认是换算这一次，还是规则从该日生效。'),needsRuleChoice:true};
  if(!Object.keys(fields).length&&!daily&&!warnings.length)return {status:'unsupported',kind,fields,missing:[],warnings,message:'未提取到可换算的时间。请使用下方字段填写日期、钟点和时区。'};
  return {...parsedResult(kind,fields,missing,warnings,missing.length?'已提取可识别部分；补齐缺少的信息后再换算。':'已提取公告钟点，请核对字段后换算。'),relativeDate,timeQualifier,hasUnresolvedRelativeDate,dateResolutionBlocked:false};
}
