/** Scene copy belongs to its teaching instant. Never carry sample clock values
 * over a user's manually selected time or editable personal schedule. */
export function cityTeachingCopy(stage,cityId,{modifiedTime=false,mode=''}={}) {
  if(modifiedTime||stage.dayCycle||mode==='routines')return {teaching:'',detail:''};
  const callout=(stage.callouts||[]).find(item=>item.city===cityId);
  return {teaching:callout?.text||'',detail:callout?.detail||''};
}

export function geographicLessonAnnotations(stage,{modifiedTime=false}={}) {
  if(modifiedTime)return [];
  return (stage.callouts||[]).filter(item=>!item.city&&item.kind!=='reference')
    .map((entry,index)=>({...entry,id:`scene-${index}`,active:index===0}));
}

export function transitionScene(stage,phase='after') {
  const transition=stage.transition;
  if(!transition)return null;
  const selected=['before','gap','after'].includes(phase)?phase:'after';
  return {phase:selected,instant:selected==='after'?transition.afterInstant:transition.beforeInstant,
    caption:selected==='before'?'洛杉矶仍是 01:59 PST；UTC 为 09:59。':selected==='gap'?
      '02:00–02:59 没有出现；02:30 找不到对应瞬间。球上保留跳时前的真实时刻。':
      '再过 1 分钟：洛杉矶是 03:00 PDT；UTC 连续走到 10:00。',
    teaching:selected==='gap'?'02:30 不存在':'01:59 → 03:00'};
}
