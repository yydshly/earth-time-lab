import {validatePerson} from './routine-atlas-model.mjs';

export const routinePeopleStorageKey='time-atlas-routine-people-v1';
const fields=['name','start','end','sleepStart','sleepEnd','weekdays'];
const clone=person=>({...person,weekdays:[...person.weekdays]});

/** Stored input is untrusted: do not silently fill missing schedule fields. */
export function normalizeRoutinePerson(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||fields.some(key=>!Object.hasOwn(input,key)))return null;
  if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>24)return null;
  if(['start','end','sleepStart','sleepEnd'].some(key=>typeof input[key]!=='string')||!Array.isArray(input.weekdays))return null;
  const value=Object.fromEntries(fields.map(key=>[key,key==='name'?input.name.trim():input[key]]));
  const result=validatePerson(value);
  return result.valid?clone(result.value):null;
}

function readSaved(storage,profiles){
  const saved=new Map(),known=new Set(profiles.map(p=>p.cityId));
  let raw;
  try{raw=storage?.getItem(routinePeopleStorageKey);}catch{return {saved,readable:false};}
  if(!storage)return {saved,readable:false};
  if(!raw)return {saved,readable:true};
  let parsed;
  try{parsed=JSON.parse(raw);}catch{return {saved,readable:true};}
  if(parsed?.version!==1||!parsed.people||typeof parsed.people!=='object'||Array.isArray(parsed.people))return {saved,readable:true};
  for(const [id,value]of Object.entries(parsed.people)){
    if(!known.has(id))continue;
    const person=normalizeRoutinePerson(value);
    if(person)saved.set(id,person);
  }
  return {saved,readable:true};
}

/** A corrupt city never prevents another valid city from being restored. */
export function loadRoutinePeople(storage,profiles){
  const {saved,readable}=readSaved(storage,profiles);
  return {
    people:new Map(profiles.map(profile=>[profile.cityId,clone(saved.get(profile.cityId)||profile.person)])),
    savedIds:new Set(saved.keys()),readable,
  };
}

/** Merge one edited city; do not touch planner settings or unrelated storage. */
export function saveRoutinePerson(storage,profiles,cityId,input){
  if(!profiles.some(profile=>profile.cityId===cityId))return {saved:false,reason:'invalid'};
  const person=normalizeRoutinePerson(input);
  if(!person)return {saved:false,reason:'invalid'};
  const {saved,readable}=readSaved(storage,profiles);
  if(!readable)return {saved:false,reason:'unavailable'};
  saved.set(cityId,person);
  try{storage.setItem(routinePeopleStorageKey,JSON.stringify({version:1,people:Object.fromEntries(saved)}));}
  catch{return {saved:false,reason:'unavailable'};}
  return {saved:true,person};
}

/** Removing only this override means future default-profile fixes still apply. */
export function resetRoutinePerson(storage,profiles,cityId){
  if(!profiles.some(profile=>profile.cityId===cityId))return {saved:false,reason:'invalid'};
  const {saved,readable}=readSaved(storage,profiles);
  if(!readable)return {saved:false,reason:'unavailable'};
  saved.delete(cityId);
  try{storage.setItem(routinePeopleStorageKey,JSON.stringify({version:1,people:Object.fromEntries(saved)}));}
  catch{return {saved:false,reason:'unavailable'};}
  return {saved:true};
}
