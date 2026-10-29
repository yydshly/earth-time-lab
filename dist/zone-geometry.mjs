// Visual geography only: offsets are calculated from IANA rules, not polygons.
const formats = new Map();
export function idealOffsetForLongitude(longitude) {
  if (!Number.isFinite(longitude)) throw new RangeError('经度无效');
  const lon = ((longitude + 180) % 360 + 360) % 360 - 180;
  return Math.floor((lon + 7.5) / 15) * 60;
}

export function formatZoneOffset(minutes) {
  if (!Number.isFinite(minutes)) return '规则待更新';
  const sign = minutes < 0 ? '−' : '+';
  const value = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function offsetMinutesAt(timeZone, instant) {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new RangeError('时间无效');
  try {
    if (!formats.has(timeZone)) formats.set(timeZone, new Intl.DateTimeFormat('en-US', {timeZone, timeZoneName: 'longOffset'}));
    const label = formats.get(timeZone).formatToParts(date).find(part => part.type === 'timeZoneName')?.value;
    if (label === 'GMT' || label === 'UTC') return 0;
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(label || '');
    return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0)) : null;
  } catch { return null; }
}

export function zoneColor(minutes) {
  if (!Number.isFinite(minutes)) return '#98a6ac';
  const hue = ((minutes / 60 + 12) * 31 + 25) % 360;
  return `hsl(${hue} 61% 62%)`;
}

export function geometryRings(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

const regionBounds = new WeakMap();
function containsRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Used only to explain a clicked, simplified display region. A point near a
// boundary must not be treated as a precise legal location/time-zone lookup.
export function findTimezoneRegion(regions, lon, lat) {
  if (!regions || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (!regionBounds.has(regions)) {
    const index = [];
    for (const feature of regions.features || []) {
      if (feature.properties.tzid === 'Asia/Urumqi') continue;
      for (const polygon of geometryRings(feature.geometry)) {
        let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
        for (const [x, y] of polygon[0]) {west=Math.min(west,x);east=Math.max(east,x);south=Math.min(south,y);north=Math.max(north,y);}
        index.push({tzid:feature.properties.tzid, polygon, west, east, south, north});
      }
    }
    regionBounds.set(regions,index);
  }
  for (const region of regionBounds.get(regions)) {
    if(lon<region.west||lon>region.east||lat<region.south||lat>region.north)continue;
    if(containsRing(region.polygon[0],lon,lat)&&!region.polygon.slice(1).some(ring=>containsRing(ring,lon,lat)))return region.tzid;
  }
  return null;
}

let regionsPromise;
export async function loadTimezoneRegions() {
  if (!regionsPromise) regionsPromise = fetch(new URL('./assets/timezones-2026e.geojson', import.meta.url)).then(response => {
    if (!response.ok) throw new Error('时区边界暂时无法读取');
    return response.json();
  }).catch(error => { regionsPromise = null; throw error; });
  return regionsPromise;
}

export function paintZoneMap(context, mode, regions, instant) {
  const {width, height} = context.canvas;
  context.clearRect(0, 0, width, height);
  if (mode === 'none') return;
  const x = lon => (lon + 180) * width / 360;
  const y = lat => (90 - lat) * height / 180;
  context.lineJoin = 'round';
  if (mode === 'ideal') {
    for (let offset = -12; offset <= 12; offset++) {
      const left = Math.max(-180, offset * 15 - 7.5), right = Math.min(180, offset * 15 + 7.5);
      context.globalAlpha = .48;
      context.fillStyle = zoneColor(offset * 60);
      context.fillRect(x(left), 0, x(right) - x(left), height);
      context.globalAlpha = .8;
      context.strokeStyle = '#e9eedc';
      context.lineWidth = 2;
      context.beginPath(); context.moveTo(x(left), 0); context.lineTo(x(left), height); context.stroke();
    }
    context.globalAlpha = 1;
    return;
  }
  for (const feature of regions?.features || []) {
    // Beijing-time teaching view: the upstream Xinjiang-time polygon overlaps
    // Asia/Shanghai. Keep the source feature, but do not overwrite the standard
    // Beijing-time surface with the separate regional UTC+06 practice.
    if (feature.properties.tzid === 'Asia/Urumqi') continue;
    const offset = offsetMinutesAt(feature.properties.tzid, instant);
    context.fillStyle = zoneColor(offset);
    context.strokeStyle = '#f1edce';
    context.lineWidth = 2.4;
    for (const polygon of geometryRings(feature.geometry)) {
      context.beginPath();
      for (const ring of polygon) {
        ring.forEach(([lon, lat], index) => index ? context.lineTo(x(lon), y(lat)) : context.moveTo(x(lon), y(lat)));
        context.closePath();
      }
      context.globalAlpha = .52; context.fill('evenodd');
      context.globalAlpha = .72; context.stroke();
    }
  }
  context.globalAlpha = 1;
}
