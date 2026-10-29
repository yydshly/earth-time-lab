import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {idealOffsetForLongitude, offsetMinutesAt, formatZoneOffset, geometryRings, zoneColor, findTimezoneRegion} from '../dist/zone-geometry.mjs';

test('ideal meridian bands have 15 degree spacing and explicit date-line halves', () => {
  assert.equal(idealOffsetForLongitude(0), 0);
  assert.equal(idealOffsetForLongitude(7.49), 0);
  assert.equal(idealOffsetForLongitude(7.5), 60);
  assert.equal(idealOffsetForLongitude(-7.51), -60);
  assert.equal(idealOffsetForLongitude(120), 480);
  assert.equal(idealOffsetForLongitude(179), 720);
  assert.equal(idealOffsetForLongitude(-179), -720);
  assert.equal(idealOffsetForLongitude(360), 0);
  assert.throws(() => idealOffsetForLongitude(NaN), RangeError);
});

test('legal zone colours follow the selected date, including fractions and daylight saving', () => {
  const winter = '2026-01-15T12:00:00Z', summer = '2026-07-15T12:00:00Z';
  assert.equal(offsetMinutesAt('America/Los_Angeles', winter), -480);
  assert.equal(offsetMinutesAt('America/Los_Angeles', summer), -420);
  assert.equal(offsetMinutesAt('Asia/Kolkata', winter), 330);
  assert.equal(offsetMinutesAt('Asia/Kathmandu', summer), 345);
  assert.equal(formatZoneOffset(345), 'UTC+05:45');
  assert.equal(formatZoneOffset(-210), 'UTC−03:30');
  assert.notEqual(zoneColor(-480), zoneColor(-420));
  assert.equal(offsetMinutesAt('Not/A_Zone', winter), null);
});

test('simplified real boundary data retains named zones and valid geographic rings', async () => {
  const data = JSON.parse(await readFile(new URL('../dist/assets/timezones-2026e.geojson', import.meta.url), 'utf8'));
  assert.equal(data.type, 'FeatureCollection');
  assert.ok(data.features.length > 350);
  const ids = new Set(data.features.map(feature => feature.properties.tzid));
  for (const id of ['Asia/Shanghai', 'Asia/Kolkata', 'Asia/Kathmandu', 'America/Los_Angeles', 'Europe/London', 'Australia/Sydney']) assert.ok(ids.has(id), id);
  for (const feature of data.features) {
    const polygons = geometryRings(feature.geometry);
    assert.ok(polygons.length > 0, feature.properties.tzid);
    for (const polygon of polygons) for (const ring of polygon) {
      assert.ok(ring.length >= 4);
      assert.deepEqual(ring[0], ring.at(-1));
      for (const [lon, lat] of ring) assert.ok(Number.isFinite(lon) && Math.abs(lon) <= 180 && Number.isFinite(lat) && Math.abs(lat) <= 90);
    }
  }
});

test('clicking representative land regions resolves real IANA identifiers and leaves ocean unassigned', async () => {
  const data = JSON.parse(await readFile(new URL('../dist/assets/timezones-2026e.geojson', import.meta.url), 'utf8'));
  for(const [lon,lat,tzid]of [[116.4,39.9,'Asia/Shanghai'],[87.62,43.82,'Asia/Shanghai'],[85.32,27.71,'Asia/Kathmandu'],[77.21,28.61,'Asia/Kolkata'],[-118.24,34.05,'America/Los_Angeles'],[151.21,-33.87,'Australia/Sydney']]) assert.equal(findTimezoneRegion(data,lon,lat),tzid);
  assert.equal(findTimezoneRegion(data,-140,0),null);
  assert.equal(findTimezoneRegion(data,NaN,0),null);
});
