import {partsAt, offsetMinutes, formatOffset} from './time-engine.mjs';

export function twelveHour(parts) {
  return `${parts.hour % 12 || 12}:${String(parts.minute).padStart(2,'0')} ${parts.hour < 12 ? 'a.m.' : 'p.m.'}`;
}
export function localClockWords(parts) {
  const h=parts.hour, period=h===0&&parts.minute===0?'午夜':h<6?'凌晨':h<12?'上午':h===12?'中午':h<18?'下午':'晚上';
  return `${period} ${h===0?0:h%12||12}:${String(parts.minute).padStart(2,'0')}`;
}
export function lessonPresentation(lesson,stage) {
  const beginner=lesson.mode==='clocks',dayCycle=Boolean(stage.dayCycle);
  return {beginner,dayCycle,showUtc:!beginner&&lesson.mode!=='rotation',showNotation:beginner&&stage.presentation==='notation',showLayers:!beginner&&!dayCycle};
}
export function dayCycleInstant(origin,minutes) {
  const time=new Date(origin).getTime();
  if(!Number.isFinite(time)||!Number.isFinite(minutes))throw new RangeError('Invalid day cycle time');
  return new Date(time+Math.max(0,Math.min(1440,minutes))*60000);
}
export function signedDuration(minutes) {
  const n=Math.abs(minutes), hours=Math.floor(n/60), rest=n%60;
  return `${minutes<0?'−':'+'}${hours?`${hours} 小时`:''}${rest?` ${rest} 分钟`:''}${!n?'0 小时':''}`;
}
export function compareClocks(instant, from, to) {
  const a=partsAt(instant,from.zone),b=partsAt(instant,to.zone);
  const diff=offsetMinutes(instant,to.zone)-offsetMinutes(instant,from.zone);
  const days=Math.round((Date.parse(`${b.date}T00:00Z`)-Date.parse(`${a.date}T00:00Z`))/86400000);
  return {from:a,to:b,difference:diff,days,
    formula:`${from.name} ${a.time} ${signedDuration(diff)} = ${to.name} ${b.time}`,
    dateNote:days?`${to.name}是${days>0?'后':'前'} ${Math.abs(days)} 天 · ${b.date}`:`同一天 · ${b.date}`,
    offsets:`${formatOffset(offsetMinutes(instant,from.zone))} → ${formatOffset(offsetMinutes(instant,to.zone))}`};
}
export function routineAt(instant,city,profile={}) {
  const p=partsAt(instant,city.zone),m=p.hour*60+p.minute;
  const toMinute=v=>typeof v==='number'?v:String(v).split(':').reduce((h,n)=>h*60+Number(n),0);
  const start=toMinute(profile.start||'09:00'),end=toMinute(profile.end||'18:00');
  const days=profile.weekdays||[1,2,3,4,5];
  const previous=p.weekday===1?7:p.weekday-1;
  const work=start<=end ? days.includes(p.weekday)&&m>=start&&m<end : m>=start&&days.includes(p.weekday)||m<end&&days.includes(previous);
  if(work)return {text:'工作 / 可联系',tone:'work'};
  if(p.hour>=23||p.hour<7)return {text:'睡眠示例',tone:'sleep'};
  return {text:'个人时间',tone:'free'};
}
export function stageAtProgress(stages,progress) {
  const weights=stages.map(s=>Math.max(1,(s.narration||s.label||'').length));
  const total=weights.reduce((a,b)=>a+b,0),point=Math.max(0,Math.min(1,progress))*total;
  let sum=0;
  for(let i=0;i<weights.length;i++){sum+=weights[i];if(point<sum)return i;}
  return weights.length-1;
}
export function stageProgress(stages,index) {
  const weights=stages.map(s=>Math.max(1,(s.narration||s.label||'').length));
  return weights.slice(0,index).reduce((a,b)=>a+b,0)/weights.reduce((a,b)=>a+b,0);
}
