import {partsAt} from './time-engine.mjs';

const modes={
  live:{title:'实时现在',status:'持续更新',detail:'读取真实现在，各地钟表标记同一个瞬间。'},
  example:{title:'教学示例',status:'演示时刻',detail:'这是为了讲解而选定的示例时刻，不是真实现在。'},
  manual:{title:'手动指定',status:'时间已定格',detail:'这是你指定的时刻，不会随真实时间自动前进。'},
};
function instantMillis(value){
  const millis=value instanceof Date?value.getTime():typeof value==='string'?Date.parse(value):NaN;
  if(!Number.isFinite(millis))throw new RangeError('时间状态需要有效的 Date 或 ISO 时间。');
  return millis;
}

/** Text-only model, shared by teaching surfaces and testable without a DOM. */
export function describeTimeContext({kind,instant,zone='Asia/Shanghai',label='北京时间',detail,showUtc=true}={}){
  if(!Object.hasOwn(modes,kind))throw new RangeError('未知的时间状态。');
  const at=new Date(instantMillis(instant)),local=partsAt(at,zone),utc=showUtc?partsAt(at,'UTC'):null;
  return {kind,...modes[kind],label:String(label),localDate:local.date,localTime:local.time,
    utcDate:utc?.date,utcTime:utc?.time,showUtc:Boolean(showUtc),
    detail:typeof detail==='string'?detail:modes[kind].detail};
}

export function createTimeContext({id,onNow,nowLabel='对照真实现在'}={}){
  const element=document.createElement('div');element.className='time-context';
  if(id)element.id=id;
  element.setAttribute('role','group');element.setAttribute('aria-label','当前地球的时间状态');
  const main=document.createElement('div');main.className='time-context-main';
  const mode=document.createElement('div');mode.className='time-context-mode';
  const title=document.createElement('strong'),status=document.createElement('span');mode.append(title,status);
  const clocks=document.createElement('div');clocks.className='time-context-clocks';
  const local=document.createElement('span'),utc=document.createElement('span');
  local.className='time-context-local';utc.className='time-context-utc';clocks.append(local,utc);main.append(mode,clocks);
  if(typeof onNow==='function'){
    const button=document.createElement('button');button.type='button';button.className='time-context-now';
    button.textContent=nowLabel;button.addEventListener('click',onNow);main.append(button);
  }
  const description=document.createElement('p');description.className='time-context-detail';element.append(main,description);
  let previous;
  return {element,update(value){
    const {kind,instant,zone='Asia/Shanghai',label='北京时间',detail,showUtc=true}=value||{};
    const millis=instantMillis(instant),key=[kind,Math.floor(millis/60000),zone,label,detail,Boolean(showUtc)];
    // Day demonstrations call on animation frames; format and touch the DOM only
    // when the displayed minute or its meaning changes. No live-region spam.
    if(previous&&key.every((part,i)=>part===previous[i]))return;
    const model=describeTimeContext({kind,instant:new Date(millis),zone,label,detail,showUtc});
    element.dataset.kind=model.kind;title.textContent=model.title;status.textContent=model.status;
    local.textContent=`${model.label} · ${model.localDate} ${model.localTime}`;
    utc.hidden=!model.showUtc;utc.textContent=model.showUtc?`UTC · ${model.utcDate} ${model.utcTime}`:'';
    description.textContent=model.detail;description.hidden=!model.detail;previous=key;
  }};
}
