import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createVoiceFetch,isRecordedDeployment,recordedText,configureRecordedVoiceUi} from '../dist/recorded-voice.mjs';
import {recordedNarrations} from '../dist/recorded-narrations.mjs';
import {buildLiveTimeCues} from '../dist/live-time-voice.mjs';
import {liveSnapshot} from '../dist/live-time-model.mjs';
import {buildTimeReference} from '../dist/local-time-reference.mjs';
import {buildRoutineVoiceCues} from '../dist/routine-voice-model.mjs';
import {routineProfiles} from '../dist/routine-atlas-data.mjs';
import {routineSnapshot} from '../dist/routine-atlas-model.mjs';
import {buildCommonTimeCase,buildCommonTimeNarration,buildCommonTimePracticeNarration} from '../dist/common-time.mjs';
import {buildAnnouncementScenes} from '../dist/announcement-scenes.mjs';
import {calculateResetAnnouncement} from '../dist/reset-announcement-model.mjs';

const text='这是公开的预录读屏说明。';
const textHash=createHash('sha256').update(text).digest('hex');
const manifest={version:1,model:'speech-2.8-hd',voiceId:'public-voice',region:'cn',recordings:[{id:'example',textHash,audioUrl:'audio/example.mp3',durationMs:1200}]};
const metaDoc={querySelector:selector=>selector==='meta[name="time-atlas-deployment"]'?{content:'recorded'}:null};

test('local mode preserves the original request and does not load a static manifest',async()=>{
  const calls=[],original=new Response('local');
  const voiceFetch=createVoiceFetch({recorded:()=>false,fetchImpl:(...args)=>{calls.push(args);return original;}});
  const options={method:'POST',body:'local-data'};
  assert.equal(await voiceFetch('/api/voice/synthesize',options),original);
  assert.deepEqual(calls,[['/api/voice/synthesize',options]]);
  assert.equal(isRecordedDeployment(null),false);
  assert.equal(isRecordedDeployment(metaDoc),true);
  assert.equal(recordedText('live-reference-date','original',false),'original');
});

test('Pages matches exact text hashes and resolves audio under the repository path without a network POST',async()=>{
  const calls=[];
  const voiceFetch=createVoiceFetch({recorded:()=>true,moduleUrl:'https://example.github.io/time-atlas/recorded-voice.mjs',fetchImpl:async(url,options)=>{calls.push({url:String(url),method:options.method});return Response.json(manifest);}});
  const status=await(await voiceFetch('/api/voice/status')).json();assert.equal(status.recorded,true);assert.equal(status.readOnly,true);
  const clip=await(await voiceFetch('/api/voice/synthesize',{method:'POST',body:JSON.stringify({text,model:manifest.model,voiceId:manifest.voiceId})})).json();
  assert.equal(clip.audioUrl,'https://example.github.io/time-atlas/audio/example.mp3');assert.equal(clip.textHash,textHash);assert.equal(clip.recorded,true);
  assert.deepEqual(calls,[{url:'https://example.github.io/time-atlas/recorded-voice.json',method:'GET'}]);
});

test('missing recordings and attempted configuration changes fail explicitly without transmitting data',async()=>{
  const calls=[];const voiceFetch=createVoiceFetch({recorded:()=>true,moduleUrl:'https://example.github.io/time-atlas/recorded-voice.mjs',fetchImpl:async(url,options)=>{calls.push({url:String(url),method:options.method});return Response.json(manifest);}});
  assert.equal((await voiceFetch('/api/voice/config',{method:'POST',body:'private-settings'})).status,403);
  assert.equal((await voiceFetch('https://outside.invalid/submit',{method:'POST',body:'private-text'})).status,405);
  assert.equal(calls.length,0);
  const missing=await voiceFetch('/api/voice/synthesize',{method:'POST',body:JSON.stringify({text:'not in the release'})});
  assert.equal(missing.status,404);assert.equal((await missing.json()).code,'RECORDING_NOT_FOUND');
  assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');
});

test('legacy course manifest audio paths are rebased for a GitHub Pages subdirectory',async()=>{
  const voiceFetch=createVoiceFetch({recorded:()=>true,moduleUrl:'https://example.github.io/time-atlas/recorded-voice.mjs',fetchImpl:async()=>Response.json({stages:{sample:{audioUrl:'/audio/old.mp3',cues:[{audioUrl:'./audio/new.mp3'}]}}})});
  const data=await(await voiceFetch('./globe-lessons-audio.json')).json();
  assert.equal(data.stages.sample.audioUrl,'https://example.github.io/time-atlas/audio/old.mp3');
  assert.equal(data.stages.sample.cues[0].audioUrl,'https://example.github.io/time-atlas/audio/new.mp3');
});

test('recorded mode disables credential and voice controls while leaving local controls untouched',()=>{
  const fields=Object.fromEntries(['voice-settings-open','voice-key','voice-id','voice-model','voice-region','voice-save','voice-config-state'].map(id=>[id,{hidden:false,disabled:false,textContent:''}]));
  const doc={...metaDoc,getElementById:id=>fields[id],querySelector:selector=>selector==='#voice-settings-open'?fields['voice-settings-open']:metaDoc.querySelector(selector)};
  configureRecordedVoiceUi(doc);assert.equal(fields['voice-settings-open'].hidden,true);assert.equal(fields['voice-key'].disabled,true);assert.match(fields['voice-config-state'].textContent,/预录/);
  assert.equal(new Set(recordedNarrations.map(row=>row.id)).size,recordedNarrations.length);
  for(const row of recordedNarrations){assert.ok(row.text);assert.equal(recordedText(row.id,'private',true),row.text);}
  assert.throws(()=>recordedText('missing','private',true),/预录讲稿/);
});

test('changing dates and personal settings changes the screen data but keeps recorded dynamic speech public and reusable',()=>{
  const previous=globalThis.document;globalThis.document=metaDoc;
  try{
    const live=at=>{const selected=liveSnapshot(at).find(row=>row.id==='pt');return buildLiveTimeCues({instant:at,selected,reference:{zone:'Asia/Shanghai',name:'北京'},referenceModel:buildTimeReference({instant:at,region:selected})});};
    const first=live('2026-10-28T12:00:00Z'),second=live('2027-01-15T21:30:00Z');
    assert.equal(first.text,second.text);assert.notEqual(first.model.selected.time,second.model.selected.time);
    const city={id:'beijing',name:'北京',zone:'Asia/Shanghai'},profile=routineProfiles.find(row=>row.cityId===city.id),person={...profile.person,name:'PRIVATE_NAME',start:'22:00',end:'05:00'};
    const cues=buildRoutineVoiceCues({city,profile,person,state:routineSnapshot('2027-01-15T21:30:00Z',city,profile,person),custom:true});
    assert.ok(cues[3].caption.includes('PRIVATE_NAME'));assert.ok(cues.every(cue=>!cue.text.includes('PRIVATE_NAME')));
    const common=buildCommonTimeNarration(buildCommonTimeCase('PT','2026-10-28','09:00'));
    const other=buildCommonTimeNarration(buildCommonTimeCase('UTC','2027-03-12','17:45'));
    assert.deepEqual(common.map(row=>row.text),other.map(row=>row.text));
    assert.equal(buildCommonTimePracticeNarration(buildCommonTimeCase('PT','2026-10-28','09:00')).length,2);
    const result=calculateResetAnnouncement({kind:'event',date:'2027-01-15',time:'09:00',source:'PT',relation:'before',asOf:new Date('2027-01-14T12:00:00Z')});
    const scenes=buildAnnouncementScenes(result);assert.ok(scenes.some(scene=>scene.highlight.clock==='target'));
    assert.ok(scenes.every(scene=>!scene.text.includes('2027')));assert.ok(scenes.at(-1).text.includes('截止边界'));
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
