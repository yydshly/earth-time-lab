const classroomTopics={
  'clock-reading':'read-time','earth-turns':'one-moment','utc-offsets':'utc',
  'calculate-time':'utc','real-boundaries':'zones','season-and-pt':'dst',
  'daily-rhythms':'communicate','meet-together':'communicate'
};
const course=(lesson,label)=>({label,route:{view:'tour',mode:'classroom',lesson,step:0}});

export const theoryApplications={
  'read-time':[course('clock-reading','读时间的地球演示'),{label:'沟通指南',route:{view:'phrases'}}],
  'one-moment':[{label:'时间怎样服务人',route:{view:'explore',mode:'human',step:0}},course('earth-turns','地球自转演示')],
  utc:[course('utc-offsets','UTC 与偏移演示'),{label:'手动换算时间',route:{view:'explore',mode:'manual'}}],
  zones:[course('real-boundaries','实际时区演示'),{label:'此刻全球时间',route:{view:'explore',mode:'live',region:'pt'}}],
  dst:[course('season-and-pt','PT 与夏令时演示'),{label:'沟通指南',route:{view:'phrases'}}],
  'date-line':[{label:'换算我的公告',route:{view:'explore',mode:'reset',type:'announcement'}},{label:'固定钟点与计时窗口',route:{view:'explore',mode:'reset',type:'window'}}],
  communicate:[{label:'世界作息双环',route:{view:'routines',mode:'classroom',lesson:'daily-rhythms',step:0}},{label:'找个好时间',route:{view:'planner'}},{label:'沟通指南',route:{view:'phrases'}}]
};

export function theoryTopicForRoute(route={}){
  if(route.view==='learn')return null;
  if(route.view==='tour')return route.mode==='library'?'zones':classroomTopics[route.lesson]||'read-time';
  if(route.view==='routines'||route.view==='planner')return 'communicate';
  if(route.view==='phrases')return 'dst';
  if(route.view==='explore'){
    if(route.mode==='human')return route.step===4?'communicate':'one-moment';
    if(route.mode==='reset')return 'date-line';
    return route.mode==='live'&&route.region==='pt'?'dst':'utc';
  }
  return null;
}

export function theorySourceLabel(route={}){
  if(route.view==='tour')return route.mode==='library'?'国家与城市巡游':'地球入门课';
  if(route.view==='routines')return '世界作息';
  if(route.view==='planner')return '约时间工具';
  if(route.view==='phrases')return '沟通指南';
  return {live:'实时全球时间',manual:'手动换算',human:'原因讲解',reset:route.type==='announcement'?'公告换算':'重置规则'}[route.mode]||'原来的工具';
}
