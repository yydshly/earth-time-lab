import {addDays,partsAt} from './time-engine.mjs';

const weekNames=['周一','周二','周三','周四','周五','周六','周日'];
const weekdayPattern='(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue(?:s)?|Wed|Thu(?:rs)?|Fri|Sat|Sun)';
const englishWeekdays={mon:1,tue:2,wed:3,thu:4,fri:5,sat:6,sun:7};
const chineseWeekdays={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,'天':7};

/** Preserve a deadline even when its calendar date or clock still needs input. */
export function hasAnnouncementDeadline(text){
  if(/\bbefore\b|\b(?:no|not)\s+later\s+than\b/iu.test(text)||/之前|以前|不晚于|最晚|截至|截止/iu.test(text))return true;
  const byTemporal=new RegExp(`\\bby\\s+(?:(?:the\\s+)?end\\s+of\\s+(?:the\\s+)?(?:day|${weekdayPattern})\\b|close\\s+of\\s+business\\b|(?:EOD|COB|midnight|noon|today|tonight|tomorrow|yesterday)\\b|(?:(?:this|next|last)(?:\\s+week)?\\s+)?${weekdayPattern}\\b|\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}\\b|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+\\d{1,2}\\b|(?:[01]?\\d|2[0-3]):[0-5]\\d(?!\\d)|(?:1[0-2]|0?[1-9])\\s*[ap]\\.?m\\.?(?!\\w))`,'iu');
  if(byTemporal.test(text))return true;
  return /(?:(?:本|这|下|上)?(?:周|星期|礼拜)[一二三四五六日天]|今天|今日|明天|明日|后天|昨天|午夜|零点|正午|\bEOD\b|\bCOB\b|\d{1,2}(?::\d{2}|[点时](?:半|\d{1,2}分?)?)|\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)(?:\s*(?:PST|PDT|PT|ET|UTC(?:[+−-]\d{1,2}(?::\d{2})?)?))?\s*前(?!往|进|来|去|端|线|景)/iu.test(text);
}

export const hasAnnouncementMidnight=text=>/\bmidnight\b|午夜|零点|(?:晚上|晚间)\s*12\s*(?:点|时)/iu.test(text);

export function announcementTimeQualifier(text){
  if(/\b(?:EOD|end\s+of\s+(?:the\s+)?day)\b|日终|当天结束|当日结束/iu.test(text))return 'eod';
  if(/\b(?:COB|close\s+of\s+business)\b|下班前|营业结束|工作日结束/iu.test(text))return 'cob';
  return null;
}

/** Extract relative wording; resolving it never uses the machine's local date. */
export function parseAnnouncementRelativeDate(text){
  const tokens=[];
  const offsets={today:0,tonight:0,tomorrow:1,yesterday:-1,'day after tomorrow':2,'the day after tomorrow':2,'day before yesterday':-2,'the day before yesterday':-2};
  for(const m of text.matchAll(/\b(the\s+day\s+after\s+tomorrow|day\s+after\s+tomorrow|the\s+day\s+before\s+yesterday|day\s+before\s+yesterday|today|tonight|tomorrow|yesterday)\b/giu))tokens.push({kind:'offset',offsetDays:offsets[m[0].toLowerCase().replace(/\s+/g,' ')],raw:m[0]});
  const zhOffsets={'今天':0,'今日':0,'今晚':0,'今夜':0,'明天':1,'明日':1,'明晚':1,'后天':2,'昨天':-1,'昨日':-1,'昨晚':-1,'前天':-2};
  for(const m of text.matchAll(/今天|今日|今晚|今夜|明天|明日|明晚|后天|昨天|昨日|昨晚|前天/gu))tokens.push({kind:'offset',offsetDays:zhOffsets[m[0]],raw:m[0]});
  const en=new RegExp(`\\b(?:(next\\s+week|this\\s+week|last\\s+week|next|this|last)\\s+(?:on\\s+)?)?(${weekdayPattern})(?:\\s+(next\\s+week|this\\s+week|last\\s+week))?\\b`,'giu');
  for(const m of text.matchAll(en)){
    for(const wording of [m[1]||m[3]||'',...(m[1]&&m[3]&&m[1]!==m[3]?[m[3]]:[])]){
      const word=wording.toLowerCase().replace(/\s+/g,' '),modifier=word==='next week'?'next-week':word==='this'||word==='this week'?'this-week':word==='last week'?'last-week':word==='last'?'previous':word==='next'?'next-ambiguous':'nearest';
      tokens.push({kind:'weekday',weekday:englishWeekdays[m[2].slice(0,3).toLowerCase()],modifier,raw:m[0]});
    }
  }
  for(const m of text.matchAll(/(?:(下一个|本|这|下|上)(?:个)?(?:周|星期|礼拜)|(?:周|星期|礼拜))([一二三四五六日天])/gu))tokens.push({kind:'weekday',weekday:chineseWeekdays[m[2]],modifier:m[1]==='下一个'?'next-ambiguous':m[1]==='下'?'next-week':m[1]==='上'?'last-week':['本','这'].includes(m[1])?'this-week':'nearest',raw:m[0]});
  const unique=[...new Map(tokens.map(token=>[`${token.kind}:${token.offsetDays??token.weekday}:${token.modifier||''}`,token])).values()];
  return unique.length===0?null:unique.length===1?unique[0]:{kind:'multiple',items:unique,raw:unique.map(t=>t.raw).join(' / ')};
}

function resolveToken(token,sourceDate){
  if(token.kind==='offset')return [{date:addDays(sourceDate,token.offsetDays),label:token.raw}];
  const today=partsAt(`${sourceDate}T12:00:00Z`,'UTC').weekday,nearest=(token.weekday-today+7)%7,name=weekNames[token.weekday-1];
  const offsets={nearest,'this-week':token.weekday-today,'next-week':7+token.weekday-today,'last-week':-7+token.weekday-today,previous:-((today-token.weekday+7)%7||7)};
  if(token.modifier==='next-ambiguous'){
    const candidates=[{date:addDays(sourceDate,nearest||7),label:`最近的下一个${name}`},{date:addDays(sourceDate,7+token.weekday-today),label:`下一日历周的${name}`}];
    return [...new Map(candidates.map(c=>[c.date,c])).values()];
  }
  return [{date:addDays(sourceDate,offsets[token.modifier]??nearest),label:token.modifier==='nearest'?`最近的${name}（含当天）`:token.modifier==='this-week'?`本日历周的${name}`:token.modifier==='next-week'?`下一日历周的${name}`:token.modifier==='last-week'?`上一日历周的${name}`:`上一个${name}`}];
}

export function resolveAnnouncementRelativeDate(relative,{sourceDate,sourceId}){
  if(!relative)return null;
  const common={raw:relative.raw,sourceDate,sourceId,assumed:true,canEdit:true};
  if(relative.kind==='multiple'){
    const results=relative.items.map(token=>resolveToken(token,sourceDate));
    if(results.every(items=>items.length===1)&&new Set(results.map(items=>items[0].date)).size===1){const resolvedDate=results[0][0].date;return {...common,status:'resolved',resolvedDate,label:`按 ${sourceId} 当地 ${sourceDate}，${relative.raw}均指 ${resolvedDate}，可修改。`};}
    return {...common,status:'blocked',label:'原文包含多种相对日期，请确认所指日期。',candidates:[...new Map(results.flat().map(c=>[c.date,c])).values()]};
  }
  const candidates=resolveToken(relative,sourceDate);
  if(candidates.length>1)return {...common,status:'ambiguous',label:`“${relative.raw}”可能指 ${candidates.map(c=>c.date).join(' 或 ')}，请选定。`,candidates};
  const resolvedDate=candidates[0].date;
  let explanation=relative.kind==='weekday'?candidates[0].label:relative.raw;
  if(relative.modifier==='this-week'||relative.modifier==='next-week'||relative.modifier==='last-week')explanation+='（周一至周日）';
  return {...common,status:'resolved',resolvedDate,label:`按 ${sourceId} 当地 ${sourceDate}，${explanation}为 ${resolvedDate}，可修改。`};
}
