import test from 'node:test';
import assert from 'node:assert/strict';
import {lessons} from '../dist/learning-data.mjs';
import {globeLessons} from '../dist/globe-lessons-data.mjs';
import {theoryApplications,theoryTopicForRoute} from '../dist/theory-links.mjs';
import {routeFromHash,routeToHash} from '../dist/navigation-state.mjs';

test('each theory topic links to existing tools and valid classroom scenes',()=>{
  assert.deepEqual(Object.keys(theoryApplications).sort(),lessons.map(row=>row.id).sort());
  for(const links of Object.values(theoryApplications))for(const {label,route} of links){
    assert.ok(label);assert.deepEqual(routeFromHash(routeToHash(route)),route);
    if(route.lesson){const lesson=globeLessons.find(row=>row.id===route.lesson);assert.ok(lesson,route.lesson);assert.ok(lesson.stages[route.step]);}
  }
});

test('tool help routes to the matching foundation rather than always opening the first topic',()=>{
  for(const lesson of globeLessons)assert.ok(lessons.some(row=>row.id===theoryTopicForRoute({view:'tour',mode:'classroom',lesson:lesson.id})),lesson.id);
  assert.equal(theoryTopicForRoute({view:'tour',mode:'classroom',lesson:'season-and-pt'}),'dst');
  assert.equal(theoryTopicForRoute({view:'explore',mode:'reset',type:'announcement'}),'date-line');
  assert.equal(theoryTopicForRoute({view:'explore',mode:'manual'}),'utc');
  assert.equal(theoryTopicForRoute({view:'routines',mode:'classroom'}),'communicate');
  assert.equal(theoryTopicForRoute({view:'learn',topic:'dst'}),null);
});
