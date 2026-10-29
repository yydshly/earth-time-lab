import {partsAt,offsetMinutes,formatOffset} from './time-engine.mjs';

/**
 * Representative city rules for common time names, rather than a claim that
 * every place on a continent uses one clock. Active labels come from the
 * instant's actual UTC offset; Intl's ambiguous abbreviation output is unused.
 */
const region=value=>Object.freeze({...value,variantRules:Object.freeze(value.variantRules)});
export const liveRegions=Object.freeze([
  region({id:'pt',cityId:'la',name:'美国太平洋时间',short:'PT',zone:'America/Los_Angeles',city:'洛杉矶',cities:'洛杉矶、旧金山、西雅图',continent:'北美洲',lat:34.05,lon:-118.24,variantRules:{'-480':'PST','-420':'PDT'}}),
  region({id:'mt',cityId:null,name:'美国山地时间',short:'MT',zone:'America/Denver',city:'丹佛',cities:'以丹佛为例；亚利桑那州大部分地区规则不同',continent:'北美洲',lat:39.74,lon:-104.99,variantRules:{'-420':'MST','-360':'MDT'}}),
  region({id:'ct',cityId:'chicago',name:'美国中部时间',short:'CT',zone:'America/Chicago',city:'芝加哥',cities:'以芝加哥为例',continent:'北美洲',lat:41.88,lon:-87.63,variantRules:{'-360':'CST','-300':'CDT'}}),
  region({id:'et',cityId:'newyork',name:'美国东部时间',short:'ET',zone:'America/New_York',city:'纽约',cities:'纽约、华盛顿',continent:'北美洲',lat:40.71,lon:-74,variantRules:{'-300':'EST','-240':'EDT'}}),
  region({id:'london',cityId:'london',name:'英国伦敦当地时间',short:'London',zone:'Europe/London',city:'伦敦',cities:'以伦敦为例；GMT 不等于全年伦敦时间',continent:'欧洲',lat:51.5,lon:-.12,variantRules:{'0':'GMT','60':'BST'}}),
  region({id:'central-europe',cityId:'paris',name:'中欧当地时间',short:'CET / CEST',zone:'Europe/Paris',city:'巴黎',cities:'巴黎、柏林等地的当前规则',continent:'欧洲',lat:48.86,lon:2.35,variantRules:{'60':'CET','120':'CEST'}}),
  region({id:'utc',cityId:null,name:'协调世界时',short:'UTC',zone:'UTC',city:'全球共同参照',cities:'UTC / Z 是共同时间标尺，不是单个地区的地方时',continent:'全球',lat:0,lon:0,variantRules:{'0':'UTC'}}),
  region({id:'beijing',cityId:'beijing',name:'北京时间',short:'北京时间',zone:'Asia/Shanghai',city:'北京',cities:'北京、上海；全年采用 UTC+08:00',continent:'亚洲',lat:39.9,lon:116.4,variantRules:{'480':'UTC+08:00'}}),
  region({id:'india',cityId:'delhi',name:'印度标准时间',short:'IST（印度）',zone:'Asia/Kolkata',city:'新德里',cities:'印度时间；IST 还可能指其他地区，须带地点理解',continent:'亚洲',lat:28.61,lon:77.21,variantRules:{'330':'IST（印度）'}}),
  region({id:'japan',cityId:'tokyo',name:'日本标准时间',short:'JST',zone:'Asia/Tokyo',city:'东京',cities:'东京、大阪',continent:'亚洲',lat:35.68,lon:139.69,variantRules:{'540':'JST'}}),
  region({id:'sydney',cityId:'sydney',name:'澳大利亚悉尼当地时间',short:'Sydney',zone:'Australia/Sydney',city:'悉尼',cities:'以悉尼为例；澳大利亚各州规则不同',continent:'大洋洲',lat:-33.87,lon:151.21,variantRules:{'600':'AEST','660':'AEDT'}}),
  region({id:'sao-paulo',cityId:'saopaulo',name:'巴西圣保罗当地时间',short:'BRT',zone:'America/Sao_Paulo',city:'圣保罗',cities:'以圣保罗为例；巴西横跨多个时区',continent:'南美洲',lat:-23.55,lon:-46.63,variantRules:{'-180':'BRT'}}),
  region({id:'east-africa',cityId:'nairobi',name:'东非时间',short:'EAT',zone:'Africa/Nairobi',city:'内罗毕',cities:'以内罗毕为例',continent:'非洲',lat:-1.29,lon:36.82,variantRules:{'180':'EAT'}}),
  region({id:'dubai',cityId:'dubai',name:'阿联酋当地时间',short:'GST',zone:'Asia/Dubai',city:'迪拜',cities:'迪拜、阿布扎比；GST 在此指海湾标准时间',continent:'亚洲',lat:25.2,lon:55.27,variantRules:{'240':'GST'}}),
]);

function validInstant(value){
  if(!(value instanceof Date)&&typeof value!=='string'&&typeof value!=='number')throw new RangeError('需要有效的时间点。');
  const date=value instanceof Date?new Date(value.getTime()):new Date(value);
  if(!Number.isFinite(date.getTime()))throw new RangeError('需要有效的时间点。');
  return date;
}
function calendarDay(local){
  const result=new Date(0);result.setUTCFullYear(local.year,local.month-1,local.day);result.setUTCHours(0,0,0,0);return result.getTime()/86400000;
}
function duration(minutes){
  const value=Math.abs(minutes),hours=Math.floor(value/60),rest=value%60;
  return `${hours?`${hours} 小时`:''}${hours&&rest?' ':''}${rest?`${rest} 分钟`:''}`||'0 分钟';
}

/** All rows describe the exact same instant; delta is region minus reference. */
export function liveSnapshot(value,referenceZone='Asia/Shanghai'){
  const instant=validInstant(value),reference=partsAt(instant,referenceZone),referenceOffset=offsetMinutes(instant,referenceZone);
  const referenceName=referenceZone==='Asia/Shanghai'?'北京时间':referenceZone==='UTC'?'UTC':'参照时间';
  return liveRegions.map(r=>{
    const local=partsAt(instant,r.zone),offset=offsetMinutes(instant,r.zone),deltaMinutes=offset-referenceOffset,dayDelta=calendarDay(local)-calendarDay(reference);
    const variant=r.variantRules[String(offset)]||formatOffset(offset);
    const adjustment=deltaMinutes?` ${deltaMinutes<0?'−':'+'} ${duration(deltaMinutes)}`:'';
    const dateNote=dayDelta?`（${dayDelta<0?'前':'后'} ${Math.abs(dayDelta)} 天）`:'';
    return {...r,local,offset,variant,reference,deltaMinutes,dayDelta,conversionText:`${referenceName} ${reference.time}${adjustment} = ${r.short} ${local.time}${dateNote}`};
  });
}
