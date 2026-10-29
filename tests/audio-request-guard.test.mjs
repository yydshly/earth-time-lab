import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioRequestGuard} from '../dist/audio-request-guard.mjs';

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

test('a delayed voice result cannot commit after leaving and re-entering its player',async()=>{
  let owner=true;
  const guard=createAudioRequestGuard(()=>owner),response=deferred(),request=guard.begin(),played=[];
  const pending=response.promise.then(clip=>{if(request.isCurrent())played.push(clip);});
  owner=false;guard.invalidate();owner=true;
  response.resolve('old voice');await pending;
  assert.deepEqual(played,[]);
  assert.equal(guard.begin().isCurrent(),true);
});

test('changing visible ownership prevents playback even before a request is invalidated',()=>{
  let page='tour',mode='library';
  const guard=createAudioRequestGuard(()=>page==='tour'&&mode==='library'),request=guard.begin();
  assert.equal(request.isCurrent(),true);
  mode='classroom';assert.equal(request.isCurrent(),false);
  mode='library';page='explore';assert.equal(request.isCurrent(),false);
});

test('a newer request wins when responses complete in the opposite order',async()=>{
  const guard=createAudioRequestGuard(()=>true),first=deferred(),second=deferred(),played=[];
  const old=guard.begin(),oldPending=first.promise.then(x=>{if(old.isCurrent())played.push(x);});
  const current=guard.begin(),currentPending=second.promise.then(x=>{if(current.isCurrent())played.push(x);});
  second.resolve('new');await currentPending;
  first.resolve('old');await oldPending;
  assert.deepEqual(played,['new']);
});
