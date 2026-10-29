import test from 'node:test';
import assert from 'node:assert/strict';
import {plannerSettingsKey,writePlannerSettings} from '../dist/planner-settings-store.mjs';

const settings={selected:['beijing','newyork'],base:'beijing',schedules:{beijing:{start:'09:00',end:'18:00',weekdays:[1,2,3,4,5],sleepStart:'23:00',sleepEnd:'07:00'}}};

test('planner writes the existing settings key and retains contact, weekdays and sleep fields',()=>{
  const data=new Map();
  assert.equal(writePlannerSettings({setItem:(key,value)=>data.set(key,value)},settings),true);
  assert.deepEqual(JSON.parse(data.get(plannerSettingsKey)),settings);
});

test('quota failures report failure without removing the last saved settings or changing the working settings',()=>{
  const originalSaved=JSON.stringify({selected:['london'],base:'london',schedules:{}}),working=structuredClone(settings);
  const storage={getItem:()=>originalSaved,setItem(){throw new DOMException('full','QuotaExceededError');},removeItem(){assert.fail('must not remove the previous value');}};
  assert.equal(writePlannerSettings(storage,working),false);
  assert.equal(storage.getItem(plannerSettingsKey),originalSaved);
  assert.deepEqual(working,settings);
});

test('denied storage access returns failure and a later successful retry can save the same working settings',()=>{
  assert.equal(writePlannerSettings(()=>{throw new DOMException('blocked','SecurityError');},settings),false);
  assert.equal(writePlannerSettings(undefined,settings),false);
  let saved;
  assert.equal(writePlannerSettings(()=>({setItem:(_,value)=>{saved=value;}}),settings),true);
  assert.deepEqual(JSON.parse(saved),settings);
});
