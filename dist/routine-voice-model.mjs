import {recordedText} from './recorded-voice.mjs';
const week=['','周一','周二','周三','周四','周五','周六','周日'];

/** One independent audio clip owns one readout field or one ring layer. */
export function buildRoutineVoiceCues({city,profile,person,state,custom=false}){
  if(!city?.name||!profile?.narration||!state?.local||!state?.activity||!state?.personal||!person)throw new TypeError('作息讲解需要同一瞬间的城市、生活示意与个人窗口。');
  const p=state.local,kind=custom?'个人设置':'虚构人物示例',cue=(id,caption,text,highlight)=>({id,caption,text:id==='background'?text:recordedText('routine-'+id,text),highlight});
  const schedule=person.weekdays.length?`当地${person.weekdays.map(day=>week[day]).join('、')}、${person.start}到${person.end}`:'没有选择任何可联系的星期';
  return [
    cue('local-date',`先看日期 · ${city.name} ${p.date}`,`先看地球旁亮起的日期。这是你选择的同一瞬间，${city.name}当地是${p.year}年${p.month}月${p.day}日，${week[p.weekday]}。这里读的是当地日历。`,{field:'date'}),
    cue('local-clock',`再看钟点 · ${city.name} ${p.time}`,`再看亮起的钟点。${city.name}当地是${p.hour}点${p.minute?`${p.minute}分`:'整'}。两条环都按这座城市的当地零点到二十四点排列，亮起的指针标出现在读到的位置。`,{field:'time'}),
    cue('regional',`外环 · 生活示意：${state.activity.label}`,`现在只看外环亮起的一段：${state.activity.start||''}到${state.activity.end||''}，是${state.activity.label}。外环是人为编排的普通工作日生活示意，不是人口统计，也不是判断每个人此刻在做什么。${p.weekday>5?'今天是周末，实际生活可能与这张工作日示意不同。':''}`,{field:'regional',kind:'current'}),
    cue('personal',`内环 · ${person.name}的联系窗口 ${person.start}–${person.end}`,`接着看内环。它属于${person.name}的${kind}，可联系设置为${schedule}，跨午夜的窗口归开始当天。亮起的绿色区段是这一天按设置可联系的钟面范围；如果没有绿色区段，表示这一天没有这样的窗口。所选时刻的判断是：${state.personal.text}。内环是这个人的设置，不是整座城市的规定。`,{field:'personal',kind:'available'}),
    cue('sleep',`内环 · 本人睡眠避让 ${person.sleepStart}–${person.sleepEnd}`,`现在看内环亮起的睡眠区段。${person.name}设置${person.sleepStart}到${person.sleepEnd}避开联系，跨过零点时会分布在环的两端。睡眠优先于可联系窗口。这只是${kind}，不能代表所有当地人的睡眠；联系前仍要向本人确认。`,{field:'sleep',kind:'sleep'}),
    cue('background',`地域背景 · ${city.name}`,profile.narration,{field:'background'}),
  ];
}

export function routineVoiceArcFocus(highlight,arc){
  if(!highlight)return false;
  if(highlight.field==='regional')return arc.layer==='regional'&&arc.current===true;
  if(highlight.field==='personal'||highlight.field==='sleep')return arc.layer==='personal'&&arc.kind===highlight.kind;
  return false;
}
