import test from 'node:test';
import assert from 'node:assert/strict';
import {geographicVector,solarVector,dayViewPose} from '../dist/globe-3d.mjs';
import {dayViewPose as canvasDayViewPose} from '../dist/globe-canvas.mjs';
import {SphereGeometry} from '../dist/vendor/three.module.js';

const degrees=180/Math.PI;
const location=vector=>({latitude:Math.asin(vector.y/vector.length())*degrees,longitude:Math.atan2(-vector.z,vector.x)*degrees});
const longitudeError=(a,b)=>Math.abs(((a-b+540)%360)-180);

test('near equinoxes the noon sun faces Greenwich and midnight faces the date line',()=>{
  for(const day of ['2026-03-20','2026-09-23']){
    const noon=location(solarVector(day+'T12:00:00Z'));
    const midnight=location(solarVector(day+'T00:00:00Z'));
    // Approximate solar model includes the equation of time, so the exact
    // subsolar longitude need not be 0/180 and declination need not be zero.
    assert.ok(longitudeError(noon.longitude,0)<5,JSON.stringify(noon));
    assert.ok(longitudeError(midnight.longitude,180)<5,JSON.stringify(midnight));
    assert.ok(Math.abs(noon.latitude)<2,JSON.stringify(noon));
  }
});

test('solstice daylight shifts toward the correct hemisphere',()=>{
  const june=location(solarVector('2026-06-21T12:00:00Z'));
  const december=location(solarVector('2026-12-21T12:00:00Z'));
  assert.ok(june.latitude>22&&june.latitude<24);
  assert.ok(december.latitude< -22&&december.latitude> -24);
  assert.ok(Math.abs(solarVector('2026-06-21T12:00:00Z').length()-1)<1e-12);
  assert.throws(()=>solarVector('not a date'),RangeError);
});

test('Los Angeles uses the northern, western position matching the image map',()=>{
  const la=geographicVector(34.05,-118.24),decoded=location(la);
  assert.ok(la.x<0&&la.y>0&&la.z>0);
  assert.ok(Math.abs(decoded.latitude-34.05)<1e-10);
  assert.ok(longitudeError(decoded.longitude,-118.24)<1e-10);
});

test('city vectors agree with the actual Three sphere UV seam and equator',()=>{
  const sphere=new SphereGeometry(1,16,8),positions=sphere.attributes.position,uv=sphere.attributes.uv;
  // Equirectangular image: u=(longitude+180)/360, v=(latitude+90)/180.
  // Check the geometry vertices, not a second copy of the conversion formula.
  for(let i=0;i<positions.count;i++){
    const v=uv.getY(i);
    if(v<.01||v>.99)continue; // Pole UVs intentionally have a seam offset.
    const expected=geographicVector(v*180-90,uv.getX(i)*360-180);
    assert.ok(Math.hypot(expected.x-positions.getX(i),expected.y-positions.getY(i),expected.z-positions.getZ(i))<1e-6);
  }
  sphere.dispose();
});

test('day playback keeps sunlight on the right as the surface advances across midnight',()=>{
  for(const season of ['2026-03-20','2026-06-21','2026-12-21']){
    for(let hour=0;hour<=24;hour+=3){
      const instant=new Date(new Date(season+'T00:00:00Z').getTime()+hour*3600000);
      const view=dayViewPose(instant),sun=solarVector(instant);
      const right=geographicVector(0,view.lon+90),forward=geographicVector(view.lat,view.lon);
      // Seasonal tilt remains visible, while the Sun stays on the same side
      // and the terminator remains close to the middle of the visible globe.
      assert.ok(sun.dot(right)>.90,`${season} ${hour}: Sun must stay right`);
      assert.ok(Math.abs(sun.dot(forward))<.09);
      const fallback=canvasDayViewPose(instant);
      assert.ok(longitudeError(fallback.lon,view.lon)<1e-9);
      assert.equal(fallback.lat,view.lat);
    }
  }
});

test('six elapsed hours advance the day view by a quarter turn, including the date boundary',()=>{
  const city=geographicVector(0,0);
  const start=new Date('2026-03-20T23:00:00Z');
  const before=dayViewPose(start),after=dayViewPose(new Date(start.getTime()+6*3600000));
  const delta=((after.lon-before.lon+540)%360)-180;
  assert.ok(delta> -91&&delta< -89,`view longitude changed ${delta}`);
  // A fixed land point travels eastward in the Sun-relative picture. The
  // result depends on the requested instant, not on the number of frames.
  assert.deepEqual(dayViewPose(start),before);
  const rightBefore=geographicVector(0,before.lon+90);
  const rightAfter=geographicVector(0,after.lon+90);
  assert.ok(city.dot(rightAfter)>city.dot(rightBefore));
  assert.throws(()=>dayViewPose('invalid'),RangeError);
  assert.throws(()=>canvasDayViewPose('invalid'),RangeError);
});
