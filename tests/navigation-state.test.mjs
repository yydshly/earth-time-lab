import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRoute,routeFromHash,routeToHash,readNavigationState,writeNavigationState,navigationStorageKey,mergeNavigationSnapshot} from '../dist/navigation-state.mjs';

test('mode and classroom deep links survive an encode/decode round trip',()=>{
  for(const route of [{view:'explore',mode:'reset',type:'announcement'},{view:'explore',mode:'human',step:3},{view:'explore',mode:'reset',type:'rolling'},{view:'explore',mode:'live',region:'et'},{view:'tour',mode:'library'},{view:'routines',mode:'classroom',lesson:'daily-rhythms',step:2}])assert.deepEqual(routeFromHash(routeToHash(route)),route);
});
test('legacy links remain valid and malformed locations cannot introduce arbitrary states',()=>{
  assert.deepEqual(routeFromHash('#tour'),{view:'tour',mode:'classroom'});
  assert.deepEqual(routeFromHash('#routines'),{view:'routines',mode:'classroom'});
  assert.deepEqual(routeFromHash('#not-a-view?mode=bad&step=-1&region=<script>'),{view:'explore',mode:'live'});
  assert.deepEqual(routeFromHash('#explore?mode=human&step=9'),{view:'explore',mode:'human'});
});

test('each theory topic is directly addressable without breaking the legacy learn link',()=>{
  for(const topic of ['read-time','one-moment','utc','zones','dst','date-line','communicate']){
    const route={view:'learn',topic};
    assert.equal(routeToHash(route),'#learn?topic='+topic);
    assert.deepEqual(routeFromHash(routeToHash(route)),route);
  }
  assert.deepEqual(routeFromHash('#learn'),{view:'learn'});
  assert.equal(routeToHash({view:'learn'}),'#learn');
  assert.deepEqual(routeFromHash('#learn?topic=%64st'),{view:'learn',topic:'dst'});
});

test('theory deep links accept only known topics on the learn view',()=>{
  for(const topic of ['',null,undefined,'unknown','DST','../dst','<script>','dst&view=planner',0,{}]){
    assert.deepEqual(normalizeRoute({view:'learn',topic}),{view:'learn'});
  }
  assert.deepEqual(routeFromHash('#learn?topic=%3Cscript%3E'),{view:'learn'});
  assert.deepEqual(routeFromHash('#learn?topic=not-a-topic&step=5&lesson=dst'),{view:'learn'});
  assert.deepEqual(routeFromHash('#planner?topic=dst'),{view:'planner'});
  assert.deepEqual(routeFromHash('#explore?mode=live&topic=dst'),{view:'explore',mode:'live'});
});
test('session snapshots tolerate corrupt or unavailable browser storage',()=>{
  let data='broken';const storage={getItem:()=>data,setItem:(key,value)=>{assert.equal(key,navigationStorageKey);data=value;}};
  assert.equal(readNavigationState(storage),null);
  assert.equal(writeNavigationState(storage,{route:{view:'planner'},planner:{date:'2026-11-02',time:'16:00'}}),true);
  assert.equal(readNavigationState(storage).planner.time,'16:00');
  assert.equal(writeNavigationState({setItem(){throw Error('blocked');}},{route:{view:'explore'}}),false);
  assert.equal(readNavigationState({getItem(){throw Error('blocked');}}),null);
});

test('refreshing one page preserves unvisited tools instead of saving their initialization defaults',()=>{
  const previous={route:{view:'tour',mode:'library'},common:{zoneId:'ET',date:'2026-11-02',time:'19:30'},live:{region:'et'},human:{step:3},reset:{type:'window',hours:'8'},manual:{instant:'2026-11-03T12:00:00Z',base:'london'},planner:{date:'2026-11-04',time:'21:00',duration:60,caseData:{sourceTitle:'原课程案例'}},course:{mode:'library',lessonId:'daily-rhythms',step:2}};
  const defaults={route:{view:'tour',mode:'library'},common:{zoneId:'PT',time:'09:00'},live:{region:'pt'},human:{step:0},reset:{type:'daily',hours:'5'},manual:{instant:'2026-10-28T00:00:00Z',base:'beijing'},planner:{date:'2026-10-28',time:'16:00',duration:30,caseData:null},course:{mode:'library',lessonId:'daily-rhythms',step:3}};
  const result=mergeNavigationSnapshot(previous,defaults,new Set(['course']));
  for(const module of ['common','live','human','reset','manual','planner'])assert.deepEqual(result[module],previous[module]);
  assert.deepEqual(result.course,defaults.course);
  assert.deepEqual(result.route,defaults.route);
  assert.equal(previous.course.step,2);
});

test('a hydrated tool replaces saved values including explicitly cleared planner cases',()=>{
  const previous={common:{zoneId:'ET',time:'19:30'},planner:{caseData:{sourceTitle:'old'}}};
  const current={route:{view:'planner'},common:{zoneId:'UTC',time:'12:00'},planner:{caseData:null,time:'13:00'},manual:{base:'beijing'}};
  const result=mergeNavigationSnapshot(previous,current,new Set(['common','planner']));
  assert.deepEqual(result,current);
  assert.deepEqual(mergeNavigationSnapshot(null,current,new Set()),current);
});

test('theory snapshots survive unvisited-page refreshes without replacing an explicit topic route',()=>{
  const previous={route:{view:'learn',topic:'dst'},theory:{topic:'dst',returnRoute:{view:'explore',mode:'reset',type:'announcement'}}};
  const current={route:{view:'learn',topic:'utc'},theory:{topic:'read-time',returnRoute:null}};
  const retained=mergeNavigationSnapshot(previous,current,new Set());
  assert.deepEqual(retained.theory,previous.theory);
  assert.deepEqual(retained.route,{view:'learn',topic:'utc'});
  assert.deepEqual(previous.theory.returnRoute,{view:'explore',mode:'reset',type:'announcement'});
  const hydrated=mergeNavigationSnapshot(previous,current,new Set(['theory']));
  assert.deepEqual(hydrated,current);
  assert.equal(routeToHash(retained.route),'#learn?topic=utc');
});
