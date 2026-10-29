import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLiveTimeNarration,buildLiveTimeCues,createLiveSpeechClock,createLiveTimeVoice} from '../dist/live-time-voice.mjs';
import {liveSnapshot} from '../dist/live-time-model.mjs';
import {buildTimeReference} from '../dist/local-time-reference.mjs';

function snapshot(instant,id='pt',quietStart='00:00',quietEnd='06:00'){
  const selected=liveSnapshot(instant).find(row=>row.id===id);
  return {instant,selected,reference:{zone:'Asia/Shanghai',name:'北京'},quietStart,quietEnd,
    referenceModel:buildTimeReference({instant,region:selected,quietStart,quietEnd})};
}

test('spoken PT comparison includes each concrete UTC step and both dated window endpoints',()=>{
  const speech=buildLiveTimeNarration(snapshot('2026-10-28T12:00:00Z'));
  assert.match(speech.text,/第一步，从北京时间2026年10月28日20点整，减去8小时，得到协调世界时，UTC的2026年10月28日12点整/);
  assert.match(speech.text,/第二步，从UTC的2026年10月28日12点整，减去7小时，得到美国太平洋时间的2026年10月28日5点整/);
  assert.match(speech.text,/本次按所选日期采用PDT/);
  assert.match(speech.text,/当地从2026年10月28日0点整到2026年10月28日6点整，对应北京时间从2026年10月28日15点整到2026年10月28日21点整/);
  assert.match(speech.text,/不是完整睡眠时间，也不是本人确认的联系窗口/);
  assert.match(speech.text,/实际经过6小时/);
});

test('the spoken chain preserves a different local date and two Beijing endpoint dates',()=>{
  const speech=buildLiveTimeNarration(snapshot('2026-10-28T15:30:00Z','sydney'));
  assert.match(speech.text,/得到澳大利亚悉尼当地时间的2026年10月29日2点30分/);
  assert.match(speech.text,/对应北京时间从2026年10月28日21点整到2026年10月29日3点整/);
});

test('half-hour and quarter-hour UTC offsets are spoken without rounding them to whole hours',()=>{
  const india=buildLiveTimeNarration(snapshot('2026-10-28T12:00:00Z','india'));
  assert.match(india.text,/加上5小时30分钟，得到印度标准时间的2026年10月28日17点30分/);
  const instant='2026-10-28T12:00:00Z',selected={id:'kathmandu',name:'加德满都当地时间',short:'NPT',variant:'NPT',zone:'Asia/Kathmandu'};
  const nepal=buildLiveTimeNarration({instant,selected,reference:{zone:'Asia/Shanghai'},referenceModel:buildTimeReference({instant,region:selected})});
  assert.match(nepal.text,/加上5小时45分钟，得到加德满都当地时间的2026年10月28日17点45分/);
});

test('clock changes speak actual elapsed length, while ambiguous or absent endpoints remain unresolved',()=>{
  const shortDay=buildLiveTimeNarration(snapshot('2026-03-08T12:00:00Z'));
  const longDay=buildLiveTimeNarration(snapshot('2026-11-01T12:00:00Z'));
  assert.match(shortDay.text,/实际经过5小时/);assert.match(shortDay.text,/跨越了时钟调整/);
  assert.match(longDay.text,/实际经过7小时/);
  const fold=buildLiveTimeNarration(snapshot('2026-11-01T12:00:00Z','pt','01:30','03:30'));
  assert.match(fold.text,/端点钟点重复出现/);assert.match(fold.text,/第一次还是第二次/);
  assert.doesNotMatch(fold.text,/对应北京时间从/);
  const gap=buildLiveTimeNarration(snapshot('2026-03-08T12:00:00Z','pt','02:30','04:00'));
  assert.match(gap.text,/端点钟点因时钟调整而不存在/);
  assert.doesNotMatch(gap.text,/对应北京时间从/);
});

test('a user-defined afternoon interval is a reference interval, not a claim about local sleep',()=>{
  const speech=buildLiveTimeNarration(snapshot('2026-10-28T12:00:00Z','central-europe','14:00','17:00'));
  assert.match(speech.text,/当地14点整到17点整，是可调整的粗略避扰参考段/);
  assert.doesNotMatch(speech.text,/14点整到17点整[^。]*深夜/);
  assert.doesNotMatch(speech.text,/对方正在睡觉|当地人正在睡觉/);
});

test('UTC narration remains a shared-clock explanation and makes no lifestyle inference',()=>{
  const speech=buildLiveTimeNarration(snapshot('2026-10-28T12:00:00Z','utc'));
  assert.match(speech.text,/UTC是全球共同的时间标尺/);
  assert.doesNotMatch(speech.text,/深夜|睡眠|生活|作息|联系窗口|参考段/);
});

test('explicitly invalid or stale UI models cannot silently turn into the default reference interval',()=>{
  const valid=snapshot('2026-10-28T12:00:00Z');
  assert.throws(()=>buildLiveTimeNarration({...valid,referenceModel:null,referenceError:'起止不能相同'}),/起止不能相同/);
  assert.throws(()=>buildLiveTimeNarration({...valid,instant:'2026-10-28T12:01:00Z'}),/时间推算已变化/);
  const {referenceModel,...legacy}=valid;
  assert.match(buildLiveTimeNarration(legacy).text,/第一步/);
  assert.throws(()=>buildLiveTimeNarration({...legacy,quietStart:'00:00',quietEnd:'00:00'}));
});

test('legacy snapshots preserve empty input errors instead of speaking the default interval',()=>{
  const {referenceModel,...legacy}=snapshot('2026-10-28T12:00:00Z');
  assert.throws(()=>buildLiveTimeNarration({...legacy,quietStart:''}));
  assert.throws(()=>buildLiveTimeNarration({...legacy,quietEnd:''}));
  assert.match(buildLiveTimeNarration({...legacy,quietStart:undefined,quietEnd:undefined}).text,/当地0点整到6点整/);
});

test('a model built with a different reference zone cannot be mislabeled as Beijing time',()=>{
  const input=snapshot('2026-10-28T12:00:00Z');
  const other=buildTimeReference({instant:input.instant,region:input.selected,referenceZone:'UTC'});
  assert.throws(()=>buildLiveTimeNarration({...input,referenceModel:other}),/时间推算已变化/);
});

test('snapshot narration explicitly promises matching frozen clocks while the legacy text stays compatible',()=>{
  const input=snapshot('2026-10-28T15:59:59Z');
  const speech=buildLiveTimeNarration(input,{freezeScene:true});
  assert.match(speech.text,/地球、各地钟表和换算都定格为这次讲解快照，暂停时也会保留/);
  assert.match(speech.text,/讲解结束会回到实时/);
  assert.doesNotMatch(speech.text,/页面时钟会继续更新/);
  assert.match(buildLiveTimeNarration(input).text,/页面时钟会继续更新/);
  assert.equal(speech.model.instant,'2026-10-28T15:59:59.000Z');
});

test('the globe and comparisons keep the same instant across midnight until the snapshot is released',()=>{
  const clock=createLiveSpeechClock(),captured='2026-10-28T15:59:59Z',later='2026-10-28T16:02:00Z';
  assert.equal(clock.at(captured).toISOString(),new Date(captured).toISOString());
  clock.hold(captured);assert.equal(clock.frozen,true);
  const at=clock.at(later);assert.equal(at.toISOString(),new Date(captured).toISOString());
  assert.equal(liveSnapshot(at).find(row=>row.id==='beijing').local.date,'2026-10-28');
  at.setUTCFullYear(2000);
  assert.equal(clock.at(later).toISOString(),new Date(captured).toISOString());
  clock.release();assert.equal(clock.frozen,false);
  assert.equal(liveSnapshot(clock.at(later)).find(row=>row.id==='beijing').local.date,'2026-10-29');
});

test('snapshot clocks retain their original seasonal rule instead of following a later real tick',()=>{
  const clock=createLiveSpeechClock();clock.hold('2026-11-01T08:59:00Z');
  const before=liveSnapshot(clock.at('2026-11-01T09:01:00Z')).find(row=>row.id==='pt');
  assert.equal(before.variant,'PDT');assert.equal(before.local.time,'01:59');
  clock.release();const after=liveSnapshot(clock.at('2026-11-01T09:01:00Z')).find(row=>row.id==='pt');
  assert.equal(after.variant,'PST');assert.equal(after.local.time,'01:01');
  assert.throws(()=>clock.hold('invalid'),RangeError);
});

test('semantic live clips keep one instant and independently target date, clock, UTC and all Pacific concepts',()=>{
  const speech=buildLiveTimeCues(snapshot('2026-10-28T15:59:59Z'));
  assert.ok(speech.cues.every(cue=>cue.instant==='2026-10-28T15:59:59.000Z'));
  assert.deepEqual(speech.cues.slice(0,5).map(c=>c.id),['reference-date','reference-time','utc','target-date','target-time']);
  assert.equal(speech.cues[0].highlight.field,'date');assert.equal(speech.cues[1].highlight.field,'time');assert.equal(speech.cues[2].focus,'utc');
  for(const concept of ['PT','PST','PDT'])assert.ok(speech.cues.some(cue=>cue.highlight.concept===concept));
  assert.match(speech.cues.find(cue=>cue.id==='current-rule').text,/采用 PDT/);
  assert.ok(speech.cues.every(cue=>typeof cue.caption==='string'&&cue.caption.length>0));
});

test('semantic clips explain cross-date clocks without losing half-hour and quarter-hour offsets',()=>{
  const india=buildLiveTimeCues(snapshot('2026-10-28T22:30:00Z','india'));
  assert.match(india.cues.find(cue=>cue.id==='target-time').text,/加上5小时30分钟/);
  assert.match(india.cues.find(cue=>cue.id==='target-date').text,/2026年10月29日/);
  assert.ok(!india.cues.some(cue=>cue.id==='concept-pst'));
});

test('semantic reference-window clips preserve DST gap/fold uncertainty and avoid false contact claims',()=>{
  const fold=buildLiveTimeCues(snapshot('2026-11-01T12:00:00Z','pt','01:30','03:30'));
  assert.match(fold.cues.find(cue=>cue.id==='quiet-unresolved').text,/出现两次/);
  assert.deepEqual(fold.cues.find(cue=>cue.id==='quiet-reference').highlight,{clock:'target',field:'teaching',window:true});
  assert.ok(!fold.cues.some(cue=>cue.id==='quiet-conversion'));
  const gap=buildLiveTimeCues(snapshot('2026-03-08T12:00:00Z','pt','02:30','04:00'));
  assert.match(gap.cues.find(cue=>cue.id==='quiet-unresolved').text,/不存在/);
  assert.match(gap.cues.at(-1).text,/仍需确认实际日程/);
});

test('UTC semantic clips stay on the common reference and never introduce Pacific or lifestyle targets',()=>{
  const speech=buildLiveTimeCues(snapshot('2026-10-28T12:00:00Z','utc'));
  assert.ok(!speech.cues.some(cue=>cue.focus==='target'||cue.highlight.window||cue.highlight.concept));
  assert.doesNotMatch(speech.text,/睡眠|避扰|PST|PDT/);
});

// The controller uses native audio events; a small event-capable DOM lets the
// tests hold a synthesis response and exercise the real cancellation boundary.
function playerHarness(t,{deferFirstClip=false}={}){
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.listeners=new Map();this.attributes=new Map();this.isConnected=true;this.hidden=false;this.paused=true;this.ended=false;this._src='';this.currentTime=0;}
    append(...nodes){this.children.push(...nodes);}
    setAttribute(key,value){this.attributes.set(key,String(value));}
    hasAttribute(key){return this.attributes.has(key);}
    removeAttribute(key){this.attributes.delete(key);if(key==='src')this._src='';}
    getClientRects(){return this.hidden?[]:[{}];}
    addEventListener(name,callback){const list=this.listeners.get(name)||[];list.push(callback);this.listeners.set(name,list);}
    dispatch(name,event={}){for(const callback of this.listeners.get(name)||[])callback(event);}
    pause(){const changed=!this.paused;this.paused=true;if(changed)this.dispatch('pause');}
    load(){this.currentTime=0;this.ended=false;}
    async play(){this.paused=false;this.dispatch('play');}
    set src(value){this._src=value;this.attributes.set('src',value);}
    get src(){return this._src;}
  }
  const elements=[],windowEvents=new Map(),saved=new Map();
  let resolveFirst,clipNumber=0,snapshotCalls=0;
  const deferred=new Promise(resolve=>{resolveFirst=resolve;}),root=new Element(),reads=[],released=[],cues=[],requests=[];
  const replace=(name,value)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});};
  replace('HTMLElement',Element);
  replace('document',{hidden:false,createElement(tag){const element=new Element(tag);elements.push(element);return element;},querySelectorAll(selector){return selector==='audio'?elements.filter(e=>e.tagName==='AUDIO'):[];},addEventListener(){}});
  replace('window',{addEventListener(name,callback){windowEvents.set(name,callback);}});
  replace('fetch',async(url,options)=>{
    if(url==='/api/voice/status')return {ok:true,json:async()=>({configured:true,model:'test-model',voiceId:'test-voice'})};
    const input=JSON.parse(options.body);requests.push(input);const number=++clipNumber;
    if(deferFirstClip&&number===1)await deferred;
    return {ok:true,json:async()=>({audioUrl:`/audio/clip-${number}.mp3`})};
  });
  t.after(()=>{for(const [name,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  const player=createLiveTimeVoice({root,freezeScene:true,getSnapshot:()=>{snapshotCalls++;return snapshot('2026-10-28T15:59:59Z');},onRead:model=>reads.push(model.instant),onRelease:reason=>released.push(reason),onCue:cue=>cues.push(cue?.id??null)});
  const find=predicate=>elements.find(predicate),main=find(e=>e.className==='live-voice-button'),audio=find(e=>e.tagName==='AUDIO'),next=find(e=>e.id==='live-voice-next'),prev=find(e=>e.id==='live-voice-prev');
  return {player,main,audio,next,prev,cues,reads,released,requests,resolveFirst,get snapshotCalls(){return snapshotCalls;},viewExit(){windowEvents.get('timeatlas:view')?.({detail:{view:'tour'}});}};
}
const settlePlayer=()=>new Promise(resolve=>setImmediate(resolve));

test('guided playback starts the existing player without toggling it off and cancellation permits a fresh snapshot',async t=>{
  const h=playerHarness(t);await h.player.play();
  assert.equal(h.audio.paused,false);assert.equal(h.cues.at(-1),'reference-date');assert.equal(h.snapshotCalls,1);
  await h.player.play();assert.equal(h.audio.paused,false);assert.equal(h.snapshotCalls,1);
  h.player.pause();assert.equal(h.audio.src,'');assert.deepEqual(h.released,['cancel']);
  await h.player.play();assert.equal(h.audio.paused,false);assert.equal(h.snapshotCalls,2);assert.equal(h.cues.at(-1),'reference-date');
  h.player.pause();
});

test('native pause, next, previous and seek preserve the spoken cue and original snapshot',async t=>{
  const h=playerHarness(t);h.main.onclick();await settlePlayer();
  assert.equal(h.audio.paused,false);assert.equal(h.cues.at(-1),'reference-date');assert.equal(h.snapshotCalls,1);
  h.main.onclick();assert.equal(h.audio.paused,true);assert.deepEqual(h.released,[]);
  h.next.onclick();await settlePlayer();assert.equal(h.audio.paused,false);assert.equal(h.cues.at(-1),'reference-time');
  h.audio.pause();h.audio.currentTime=3;h.audio.dispatch('seeked');assert.equal(h.cues.at(-1),'reference-time');
  h.prev.onclick();await settlePlayer();assert.equal(h.cues.at(-1),'reference-date');assert.equal(h.audio.src,'/audio/clip-1.mp3');
  assert.equal(h.snapshotCalls,1);assert.ok(h.reads.every(instant=>instant==='2026-10-28T15:59:59.000Z'));
  h.viewExit();assert.equal(h.audio.src,'');assert.equal(h.audio.hidden,true);assert.equal(h.cues.at(-1),null);assert.deepEqual(h.released,['cancel']);
});

test('a late synthesis result cannot overwrite the newer spoken cue',async t=>{
  const h=playerHarness(t,{deferFirstClip:true});h.main.onclick();await settlePlayer();
  assert.equal(h.requests[0].chapterId,'live-cue-reference-date');assert.equal(h.audio.src,'');
  h.next.onclick();await settlePlayer();assert.equal(h.cues.at(-1),'reference-time');assert.equal(h.audio.src,'/audio/clip-2.mp3');
  h.resolveFirst();await settlePlayer();assert.equal(h.cues.at(-1),'reference-time');assert.equal(h.audio.src,'/audio/clip-2.mp3');
  h.player.pause();await settlePlayer();assert.equal(h.audio.src,'');assert.equal(h.audio.paused,true);assert.equal(h.cues.at(-1),null);assert.deepEqual(h.released,['cancel']);
});

test('leaving the view while a clip is being synthesized prevents late audio and highlighting',async t=>{
  const h=playerHarness(t,{deferFirstClip:true});h.main.onclick();await settlePlayer();h.viewExit();
  h.resolveFirst();await settlePlayer();
  assert.equal(h.audio.src,'');assert.equal(h.audio.hidden,true);assert.equal(h.audio.paused,true);assert.equal(h.cues.at(-1),null);assert.deepEqual(h.released,['cancel']);
});

test('finishing releases realtime while native replay restores the matching original snapshot',async t=>{
  const h=playerHarness(t);h.main.onclick();await settlePlayer();
  const count=buildLiveTimeCues(snapshot('2026-10-28T15:59:59Z')).cues.length;
  for(let index=1;index<count;index++){h.next.onclick();await settlePlayer();}
  assert.equal(h.cues.at(-1),'individual');h.audio.ended=true;h.audio.paused=true;h.audio.dispatch('ended');
  assert.equal(h.cues.at(-1),null);assert.deepEqual(h.released,['ended']);
  await h.audio.play();assert.equal(h.cues.at(-1),'individual');assert.equal(h.snapshotCalls,1);assert.equal(h.reads.at(-1),'2026-10-28T15:59:59.000Z');
  h.player.pause();
});
