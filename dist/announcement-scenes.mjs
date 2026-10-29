import {partsAt,offsetMinutes,formatOffset} from './time-engine.mjs';
import {recordedText} from './recorded-voice.mjs';

const beijing={id:'beijing',name:'北京',zone:'Asia/Shanghai',lat:39.9042,lon:116.4074};
const dateWords=value=>String(value).replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1年$2月$3日');
const spoken=p=>`${dateWords(p.date)} ${p.time}`;
const clockParts=(at,zone)=>{const p=partsAt(at,zone);return {...p,time:p.second?`${p.time}:${String(p.second).padStart(2,'0')}`:p.time};};
function durationWords(hours){const ms=Math.round(hours*3600000),h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=ms%60000/1000;return [h?`${h} 小时`:'',m?`${m} 分钟`:'',s?`${s} 秒`:''].filter(Boolean).join(' ')||'0 秒';}
export function announcementSourceReading(at,source={id:'UTC',offset:0}){
  const offset=source.zone?offsetMinutes(at,source.zone):source.offset??0;
  const p=source.zone?clockParts(at,source.zone):clockParts(new Date(new Date(at).getTime()+offset*60000),'UTC');
  return {...p,offset,label:source.id||'UTC',offsetLabel:formatOffset(offset)};
}

export function announcementReadingLabel(source,at){
  if(source?.id==='PT')return `当地 PT · ${offsetMinutes(at,'America/Los_Angeles')===-420?'PDT':'PST'}`;
  if(['PST','PDT'].includes(source?.id))return `严格 ${source.id}`;
  return source?.id||'UTC';
}

/** Real, independently spoken cues; no guessed word timings inside a long clip. */
export function buildAnnouncementScenes(result,{contextDate,assumptions=[],publication=false,includeSupplement=false}={}){
  if(!result||!Number.isFinite(new Date(result.instant).getTime()))return [];
  const at=new Date(result.instant),source=result.source||{id:'UTC',offset:0},deadline=result.relation==='before',duration=result.kind==='duration'&&result.start;
  const make=(id,group,title,text,{instant=at,interpretation='primary',focus='source',sceneSource=source,highlight={},caption=title}={})=>({id,group,title,text:recordedText('announcement-'+(id.startsWith('alternative-')?'alternative':id==='meaning'?(deadline?'meaning-before':'meaning-at'):id),text),caption,highlight:{concept:null,clock:null,field:null,deadline:false,...highlight},instant:new Date(instant),interpretation,readingMode:sceneSource.id==='PT'?'local':['PST','PDT'].includes(sceneSource.id)?'strict':'explicit',readingLabel:announcementReadingLabel(sceneSource,instant),focus,source:sceneSource,sourceClock:announcementSourceReading(instant,sceneSource),target:beijing,targetClock:clockParts(instant,beijing.zone),relation:deadline?'before':'at',primaryInstant:at});
  const local=announcementSourceReading(at,source),bj=clockParts(at,beijing.zone),utc=clockParts(at,'UTC'),originDate=result.contextDate||contextDate||local.date;
  const pacific=['PT','PST','PDT'].includes(source.id),variant=source.id==='PT'?(local.offset===-420?'PDT':'PST'):source.id;
  const readingNotice=result.reading?.originalSource==='PST'&&result.reading?.mode==='local'?'原文写了 PST，这里暂按太平洋当地时间 PT 理解；严格 PST 放在补充提示中。':source.id==='PT'?'这里按太平洋当地时间 PT 换算。':['PST','PDT'].includes(source.id)?`本次明确采用固定的 ${source.id}，不随当地夏令时改变。`:'';
  const scenes=[];
  if(pacific){
    scenes.push(make('source','source','认识 PT',`${readingNotice}先看亮起的 PT。这里以美国西海岸为例，PT 是太平洋当地时间的统称，要按公告日期采用对应规则。`,{highlight:{concept:'PT'},caption:result.reading?.switchable&&result.reading.mode==='local'?'原文 PST，暂按当地 PT 理解':'PT：太平洋当地时间的统称'}));
    scenes.push(make('concept-pst','source','认识 PST','现在看 PST。PST 是太平洋标准时间，固定比 UTC 慢八小时；换到北京要加十六小时。',{highlight:{concept:'PST'},caption:'PST：标准时间 · UTC−8'}));
    scenes.push(make('concept-pdt','source','认识 PDT','现在看 PDT。PDT 是太平洋夏令时间，比 UTC 慢七小时；换到北京要加十五小时。',{highlight:{concept:'PDT'},caption:'PDT：夏令时间 · UTC−7'}));
  }else scenes.push(make('source','source',duration?'先看计时起点':'确认来源规则',duration?'先看公告给出的计时起点。下面先读这个起点的日期和钟点，再加上经过的时长。':`先确认公告采用 ${source.id||'UTC'}。我们会使用这条规则读取来源钟表。`,{instant:duration?new Date(result.start):at,focus:source.zone==='UTC'||duration?'comparison':'source',highlight:{clock:source.zone==='UTC'||duration?'utc':'source',field:'teaching'},caption:duration?'先读起点，再加经过的时长':`采用 ${source.id||'UTC'} 的时间规则`}));
  const sourceAt=duration?new Date(result.start):at,sourceLocal=duration?clockParts(sourceAt,'UTC'):local,sourceOptions=duration?{instant:sourceAt,sceneSource:{id:'UTC',zone:'UTC'},focus:'comparison'}:{};
  const resolution=result.dateResolution,relative=resolution?.raw?`原文的“${resolution.raw}”，按公告地区在所选发布时间的日历，理解为${dateWords(resolution.resolvedDate)}。`:'';
  const context=!relative&&(result.assumptions||assumptions).length?`${publication?'按填写的发布时间':'未给发布时间，按现在发布'}理解。`:'';
  const midnight=deadline&&result.boundary==='end-of-day';
  scenes.push(make('source-date','source','看来源日期',duration?`计时起点的 UTC 日期是${dateWords(sourceLocal.date)}。先看亮起的日期。`:`${relative}${context}${midnight?`所指的是当地${dateWords(originDate)}结束前；结束后的午夜，日历已经翻到${dateWords(local.date)}。`:`来源钟表的完整日期是${dateWords(local.date)}。`}现在看亮起的日期。`,{...sourceOptions,highlight:{clock:duration?'utc':'source',field:'date'},caption:midnight?`${originDate} 结束 → ${local.date} 午夜`:resolution?.label||`来源日期 · ${sourceLocal.date}`}));
  scenes.push(make('source-clock','source',duration?'看起点钟点':'看来源钟点',duration?`这个起点的 UTC 钟点是 ${sourceLocal.time}。`:`${source.id==='PT'?`公告这一天，当地采用 ${variant}。`:''}现在只看来源钟表的 ${local.time}。${midnight?'午夜就是当地钟表的零点，旁边的“前”表示截止之前。':''}`,{...sourceOptions,highlight:{clock:duration?'utc':'source',field:'time'},caption:`${duration?'UTC 起点':source.id||'UTC'} ${sourceLocal.time}${deadline?' 前':''}`}));
  const elapsed=duration?`从刚才的起点经过 ${durationWords(result.hours??(at-new Date(result.start))/3600000)}，到达这个结束瞬间。`:'';
  scenes.push(make('conversion','conversion','对齐 UTC',`${elapsed}现在看亮起的 UTC。这是全球共同的时间标尺，同一个${deadline?'截止边界':'事件'}对应 UTC ${spoken(utc)}。`,{focus:'comparison',highlight:{clock:'utc',field:'time'},caption:`同一瞬间 · UTC ${utc.date} ${utc.time}`}));
  scenes.push(make('target-date','conversion','看北京日期',`接着看北京的日历。此刻北京时间的日期是${dateWords(bj.date)}。${bj.date!==local.date?'两地日期不同，也仍然指向同一个瞬间。':''}`,{focus:'target',highlight:{clock:'target',field:'date'},caption:`北京日期 · ${bj.date}`}));
  scenes.push(make('target-clock','conversion','看北京钟点',`现在看北京亮起的钟点：${bj.time}${deadline?'之前':'。'}${deadline?'。':''}请把这只钟与刚才的来源钟表看作同一个瞬间的两种读数。`,{focus:'target',highlight:{clock:'target',field:'time'},caption:`北京时间 ${bj.time}${deadline?' 前':''}`}));
  const supplements=includeSupplement?(result.supplement?.status==='ready'&&!result.reading?.sameInstant?[result.supplement]:Array.isArray(result.alternatives)?result.alternatives:[]):[];
  for(const [index,other]of supplements.entries()){
    const otherAt=new Date(other.instant),otherBj=clockParts(otherAt,beijing.zone),difference=Math.abs(at-otherAt)/3600000,otherSource=other.source||{id:other.sourceId||'PT',zone:'America/Los_Angeles'},label=announcementReadingLabel(otherSource,otherAt);
    scenes.push(make(`alternative-${index}`,'conversion',`补充：${label}`,`现在切到补充解释：${label}。对应北京时间${spoken(otherBj)}${deadline?'之前':''}，比所选解释${otherAt<at?'早':'晚'}${difference}小时。`,{instant:otherAt,interpretation:'alternative',sceneSource:otherSource,focus:'target',highlight:{clock:'target',field:'time'},caption:`补充解释 · 北京 ${otherBj.time}${deadline?' 前':''}`}));
  }
  scenes.push(make('meaning','meaning',deadline?'理解“之前”':'确认这一刻',deadline?'最后看截止边界。亮起的“前”表示在这个时刻之前，实际可能更早；公告没有给出实际完成时刻，也不能据此认定额度已经重置。':`最后确认，双方完整日期、钟点与时区指向同一个事件。${result.kind==='daily'?'每日当地钟点规则换季时，要重新按事件日期计算。':''}具体额度怎样变化，以产品说明为准。`,{focus:'target',highlight:{clock:'target',field:'time',deadline},caption:deadline?'“之前”是截止边界，实际可能更早':'日期 + 钟点 + 时区，确认同一个瞬间'}));
  return scenes;
}
