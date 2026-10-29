import test from 'node:test';
import assert from 'node:assert/strict';
import {routineProfiles} from '../dist/routine-atlas-data.mjs';
import {routineSnapshot} from '../dist/routine-atlas-model.mjs';
import {routinePeopleStorageKey,normalizeRoutinePerson,loadRoutinePeople,saveRoutinePerson,resetRoutinePerson} from '../dist/routine-person-store.mjs';

const profile=id=>routineProfiles.find(p=>p.cityId===id);
const custom={...profile('beijing').person,name:'  早班朋友  ',start:'06:00',end:'09:00',sleepStart:'22:00',sleepEnd:'07:00',weekdays:[1,2,3,4,5,5]};
const memory=(entries=[])=>{
  const data=new Map(entries);return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
};

test('a saved personal schedule survives reload without changing its contact and sleep semantics',()=>{
  const storage=memory();
  assert.equal(saveRoutinePerson(storage,routineProfiles,'beijing',custom).saved,true);
  const restored=loadRoutinePeople(storage,routineProfiles);
  const person=restored.people.get('beijing');
  assert.equal(person.name,'早班朋友');assert.deepEqual(person.weekdays,[1,2,3,4,5]);
  assert.equal(restored.savedIds.has('beijing'),true);
  const state=routineSnapshot('2026-01-14T22:45:00Z',{zone:'Asia/Shanghai'},profile('beijing'),person);
  assert.equal(state.local.time,'06:45');assert.equal(state.personal.state,'sleep');assert.equal(state.personal.canContact,false);
  person.weekdays.push(7);
  assert.deepEqual(loadRoutinePeople(storage,routineProfiles).people.get('beijing').weekdays,[1,2,3,4,5]);
});

test('invalid city records are isolated and unknown IDs do not enter the people map',()=>{
  const storage=memory([[routinePeopleStorageKey,JSON.stringify({version:1,people:{beijing:custom,tokyo:{...profile('tokyo').person,sleepStart:'99:00'},newyork:{name:'incomplete'},unknown:custom}})]]);
  const result=loadRoutinePeople(storage,routineProfiles);
  assert.equal(result.people.size,routineProfiles.length);
  assert.equal(result.people.get('beijing').name,'早班朋友');
  assert.deepEqual(result.people.get('tokyo'),profile('tokyo').person);
  assert.deepEqual(result.people.get('newyork'),profile('newyork').person);
  assert.deepEqual([...result.savedIds],['beijing']);assert.equal(result.people.has('unknown'),false);
  const before=storage.getItem(routinePeopleStorageKey);loadRoutinePeople(storage,routineProfiles);
  assert.equal(storage.getItem(routinePeopleStorageKey),before,'reading must not rewrite stored input');
});

test('save and reset merge only the selected city and never alter planner data',()=>{
  const storage=memory([['time-atlas-v1','existing planner preferences']]);
  saveRoutinePerson(storage,routineProfiles,'beijing',custom);
  saveRoutinePerson(storage,routineProfiles,'tokyo',{...profile('tokyo').person,name:'东京朋友',start:'12:00',end:'16:00'});
  assert.equal(resetRoutinePerson(storage,routineProfiles,'beijing').saved,true);
  const result=loadRoutinePeople(storage,routineProfiles);
  assert.deepEqual(result.people.get('beijing'),profile('beijing').person);
  assert.equal(result.people.get('tokyo').name,'东京朋友');
  assert.deepEqual([...result.savedIds],['tokyo']);
  assert.equal(storage.getItem('time-atlas-v1'),'existing planner preferences');
});

test('blocked storage fails honestly and cannot overwrite a previous saved schedule',()=>{
  const storage=memory();saveRoutinePerson(storage,routineProfiles,'beijing',custom);
  const previous=storage.getItem(routinePeopleStorageKey);
  const blocked={getItem:storage.getItem,setItem(){throw new Error('quota exceeded');}};
  assert.deepEqual(saveRoutinePerson(blocked,routineProfiles,'beijing',{...custom,start:'08:00'}),{saved:false,reason:'unavailable'});
  assert.deepEqual(resetRoutinePerson(blocked,routineProfiles,'beijing'),{saved:false,reason:'unavailable'});
  assert.equal(storage.getItem(routinePeopleStorageKey),previous);
  const denied={getItem(){throw new Error('blocked');},setItem(){assert.fail('must not overwrite unreadable storage');}};
  assert.equal(loadRoutinePeople(denied,routineProfiles).readable,false);
  assert.deepEqual(saveRoutinePerson(denied,routineProfiles,'beijing',custom),{saved:false,reason:'unavailable'});
});

test('malformed saved roots fall back without mutation; invalid names and partial schedules are not persisted',()=>{
  for(const raw of ['broken JSON','null','[]','{"version":2,"people":{}}']){
    const storage=memory([[routinePeopleStorageKey,raw]]),result=loadRoutinePeople(storage,routineProfiles);
    assert.equal(result.savedIds.size,0);assert.deepEqual(result.people.get('beijing'),profile('beijing').person);
    assert.equal(storage.getItem(routinePeopleStorageKey),raw);
  }
  assert.equal(normalizeRoutinePerson({...custom,name:'   '}),null);
  assert.equal(normalizeRoutinePerson({...custom,name:'x'.repeat(25)}),null);
  assert.equal(normalizeRoutinePerson({name:'缺少钟点'}),null);
  const storage=memory();
  assert.deepEqual(saveRoutinePerson(storage,routineProfiles,'unknown',custom),{saved:false,reason:'invalid'});
  assert.equal(storage.data.size,0);
  assert.equal(saveRoutinePerson(storage,routineProfiles,'beijing',{...custom,start:'09:00',end:'09:00',weekdays:[]}).saved,true,'no availability remains a valid personal choice');
});
