import test from 'node:test';
import assert from 'node:assert/strict';
import {announcementTimingLabel,announcementDurationLabel} from '../dist/reset-announcement.mjs';

test('a deadline describes time until its boundary without claiming the event completed',()=>{
  const boundary=new Date('2026-10-29T08:00:00Z');
  assert.match(announcementTimingLabel(boundary,new Date('2026-10-29T07:00:00Z'),'before'),/^距截止还有/);
  const expired=announcementTimingLabel(boundary,new Date('2026-10-29T09:00:00Z'),'before');
  assert.match(expired,/截止边界已过/);
  assert.doesNotMatch(expired,/已重置|已完成|已抵达/);
  assert.match(announcementTimingLabel(boundary,boundary,'before'),/截止边界/);
  assert.match(announcementTimingLabel(boundary,new Date('2026-10-29T07:00:00Z'),'at'),/^还需等待/);
});

test('duration explanations retain minutes and manually supplied seconds',()=>{
  assert.equal(announcementDurationLabel(5.5),'5 小时 30 分钟');
  assert.equal(announcementDurationLabel(.5),'30 分钟');
  assert.equal(announcementDurationLabel(5+30/3600),'5 小时 30 秒');
});
