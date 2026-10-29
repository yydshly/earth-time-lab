import {globeLessons} from './globe-lessons-data.mjs';
import {humanTimeSteps} from './human-time-data.mjs';

const lesson=(id,group='看懂钟表')=>{const data=globeLessons.find(row=>row.id===id);return {id,group,title:data.title,goal:data.takeaway,parts:data.stages.map((stage,step)=>({label:stage.label,route:{view:'tour',mode:'classroom',lesson:id,step},player:'lesson'}))};};
const own=(id,group,title,goal,route,text,target)=>({id,group,title,goal,parts:[{label:title,route,player:'guide',text,target}]});

/** The route visits every major capability; the 62-chapter library remains its own full course. */
export const walkthroughStops=[
  {id:'live',group:'先看现在',title:'此刻，全球分别几点？',goal:'先建立北京与世界各地的当前时间参照。',parts:[{label:'北京与太平洋时间',route:{view:'explore',mode:'live',region:'pt'},player:'live'}]},
  {id:'human',group:'理解原因',title:'时间怎样服务人',goal:'从光照、人的生活，到共同的公共时间。',parts:humanTimeSteps.map((step,index)=>({label:step.label,route:{view:'explore',mode:'human',step:index},player:'human'}))},
  lesson('clock-reading'),lesson('earth-turns'),lesson('utc-offsets'),lesson('calculate-time'),lesson('real-boundaries'),lesson('season-and-pt'),
  {id:'daily-rhythms',group:'回到人的生活',title:'读懂城市作息双环',goal:'外环看生活示意，内环看具体人的联系与睡眠设置。',parts:[{label:'当地钟点、生活与个人窗口',route:{view:'routines',mode:'classroom',lesson:'daily-rhythms',step:0},player:'routine'}]},
  lesson('meet-together','回到人的生活'),
  own('manual','亲手试一试','拨动一个时间，观察全球一起变化','试着改日期和钟点；所有城市始终读取同一个瞬间。',{view:'explore',mode:'manual'},'这里是手动换算。先选参照城市，再选择日期和当地钟点，地球与城市时钟会一起变化。拖动一天的时间滑块，可以观察各地进入白昼和黑夜。它显示你指定的瞬间，不会冒充实时现在。遇到调钟造成的不存在或重复时间，页面会请你确认。你可以暂停导览亲手试一下，再继续。','#explore .time-console'),
  own('knowledge','查阅基础','时区基础理论与速查','按七个主题查概念、换算方法与公告用语。',{view:'learn'},'这里是时区的基础理论汇总，供你按主题阅读和随时查阅。七个主题从日期和钟点开始，依次解释时区、UTC换算、全球划分、太平洋时间与夏令时、公告日期，以及作息和沟通。每个主题都有要点、解释和固定日期的教学例子。页面下方可以按需要展开复习题，或打开资料来源。理解原理后，实时对照、公告换算和约时间分别在对应工具中使用。','#learn .learn-layout'),
  {id:'announcement',group:'读懂真实公告',title:'把“太平洋时间午夜前”换到北京',goal:'区分截止与准点，核对来源日期、PT 解释和严格 PST 补充。',parts:[{label:'使用导览示例，不覆盖你的公告',route:{view:'explore',mode:'reset',type:'announcement'},player:'announcement',setup:'announcement'}]},
  ...['daily','window','rolling','billing'].map((id,index)=>({id:'reset-'+id,group:'读懂真实公告',title:['每天固定钟点','从明确起点经过时长','滚动用量逐笔释放','订阅与账单周期'][index],goal:['固定当地钟点，换季后重新按日期计算。','先找计时起点，再加真实经过的时长。','不同使用记录可以在不同瞬间退出窗口。','优先读取产品明确给出的下次时间戳。'][index],parts:[{label:'重置规则教学示例',route:{view:'explore',mode:'reset',type:id},player:'reset'}]})),
  {id:'common',group:'实际沟通',title:'把双方时间说清楚，再确认是否方便',goal:'用当前案例练习确认日期、地点、双方钟点与个人窗口。',parts:[{label:'实际问答与双方时间确认',route:{view:'phrases'},player:'common',setup:'common'}]},
  own('planner','实际沟通','找到共同时间，生成双方都能读懂的邀请','调整个人窗口，查看交集，复制双语邀请或下载日历。',{view:'planner'},'这是约时间工具。左边填写具体人的当地可用时间、星期和睡眠避让，右边把同一个约定显示成双方各自的日期和钟点。点击寻找共同可用时间，可以检查交集；没有交集时，也需要商量新的窗口。下方可以复制中英文邀请，或者下载日历文件。下载只生成本机文件，不会替你向别人发送邀请。导览使用临时案例，退出后会恢复你原来的配置。','#planner .planner-grid'),
  own('library','继续探索世界','从地球到国家与城市的 62 章巡游','按目录、搜索或点城市收听；也可以从头连续听。',{view:'tour',mode:'library'},'最后是国家与城市巡游。这里按地球基础、大洲、国家和著名城市组织了六十二章内容，可以搜索、点目录，也可以在地球上点城市。播放器支持连续收听、语速选择和音色设置。完整功能导览到这里结束，六十二章的内容巡游可以另外从头连续听。以后你可以直接进入需要的工具，也可以从本次进度继续复习。','#tour-library .tour-intro-actions')
];

export const walkthroughProgressKey='time-atlas-walkthrough-v1';
export function normalizeWalkthroughProgress(value){
  if(!value||value.version!==1)return {version:1,stop:0,part:0,completed:[],heard:[]};
  const stop=Math.max(0,Math.min(walkthroughStops.length-1,Number.isInteger(value.stop)?value.stop:0));
  const part=Math.max(0,Math.min(walkthroughStops[stop].parts.length-1,Number.isInteger(value.part)?value.part:0));
  const keys=new Set(walkthroughStops.flatMap(row=>row.parts.map((_,index)=>`${row.id}:${index}`)));
  return {version:1,stop,part,completed:[...new Set(Array.isArray(value.completed)?value.completed:[])].filter(id=>walkthroughStops.some(row=>row.id===id)),heard:[...new Set(Array.isArray(value.heard)?value.heard:[])].filter(key=>keys.has(key)),finished:value.finished===true};
}
export function nextWalkthroughPosition(position,{skipStop=false,back=false}={}){
  const p=normalizeWalkthroughProgress({...position,version:1}),stop=walkthroughStops[p.stop];
  if(back)return p.part>0?{...p,part:p.part-1}:p.stop>0?{...p,stop:p.stop-1,part:walkthroughStops[p.stop-1].parts.length-1}:p;
  if(!skipStop&&p.part<stop.parts.length-1)return {...p,part:p.part+1};
  return p.stop<walkthroughStops.length-1?{...p,stop:p.stop+1,part:0}:{...p,finished:true};
}
export function matchesWalkthroughCompletion(stop,part,type,detail={}){
  const player=part?.player;
  if(player==='lesson')return type==='lesson'&&detail.lessonId===part.route.lesson&&detail.step===part.route.step;
  if(player==='human')return type==='human'&&detail.step===part.route.step;
  if(player==='reset')return type==='reset'&&detail.type===part.route.type;
  return player===type;
}
