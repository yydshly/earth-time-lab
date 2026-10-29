/** A dependency-free orthographic globe. Coastlines: Natural Earth, public domain. */
import {createGlobeAnnotations} from './globe-annotations.mjs';
import {splitGlobeLabelDetails} from './globe-label-model.mjs';
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = (v) => ((v + 180) % 360 + 360) % 360 - 180;

function solarPosition(date) {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = (date.getTime() - yearStart) / 86400000 + 1;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const gamma = (2 * Math.PI / 365.2425) * (day - 1);
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const longitude = wrap(180 - (minutes + equation) / 4) * DEG;
  return [Math.cos(declination) * Math.cos(longitude), Math.cos(declination) * Math.sin(longitude), Math.sin(declination)];
}

export function dayViewPose(value) {
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new RangeError('地球时间无效');
  const sun=solarPosition(date);
  return {lat:12,lon:wrap(Math.atan2(sun[1],sun[0])/DEG-90)};
}

function landTexture(geojson) {
  const texture = document.createElement('canvas');
  texture.width = 1440;
  texture.height = 720;
  const ctx = texture.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, texture.width, texture.height);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#b9b9b9';
  ctx.lineWidth = 0.65;
  const polygon = (rings) => {
    ctx.beginPath();
    for (const ring of rings) {
      ring.forEach(([lon, lat], i) => {
        const x = (lon + 180) * 4;
        const y = (90 - lat) * 4;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fill('evenodd');
    ctx.stroke();
  };
  for (const feature of geojson.features) {
    if (feature.geometry.type === 'Polygon') polygon(feature.geometry.coordinates);
    if (feature.geometry.type === 'MultiPolygon') feature.geometry.coordinates.forEach(polygon);
  }
  return ctx.getImageData(0, 0, texture.width, texture.height).data;
}

export async function createGlobe(canvas, { cities = [], onSelectCity, onStateChange } = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('createGlobe needs a canvas element');
  const response = await fetch(new URL('./assets/land.geojson', import.meta.url));
  if (!response.ok) throw new Error('无法读取地球地图，请通过本地启动器打开软件。');
  const texture = landTexture(await response.json());
  const size = 560;
  canvas.width = size;
  canvas.height = size;
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '交互地球：拖动或使用方向键旋转，点击城市查看当地时间。昼夜为教学近似。');
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  const ctx = canvas.getContext('2d');
  const layer = document.createElement('canvas');
  layer.width = size;
  layer.height = size;
  const layerCtx = layer.getContext('2d');
  const pixels = layerCtx.createImageData(size, size);
  const center = size / 2;
  const radius = 231;
  const normals = new Float32Array(size * size * 3);
  const masks = new Float32Array(size * size);
  const depths = new Float32Array(size * size);
  let viewLon = 65, viewLat = 20, instant = new Date(), showNight = true,labelsVisible=true,gridVisible=true;
  const annotations=createGlobeAnnotations(canvas.parentElement);
  let selectedId = null, frame = 0, disposed = false, geometryDirty = true;
  let hitTargets = [], pointer = null, dayView = false, savedView = null, cityOverrides = null,labelLayout={density:'default',reservedSelectors:[]};

  function leaveDayView(restore=false) {
    if(!dayView)return;
    dayView=false;
    if(restore&&savedView){viewLon=savedView.lon;viewLat=savedView.lat;geometryDirty=true;}
    savedView=null;onStateChange?.({dayView});requestRender();
  }
  function applyDayView() {
    const view=dayViewPose(instant);viewLon=view.lon;viewLat=view.lat;geometryDirty=true;
  }

  function basis() {
    const lo = viewLon * DEG, la = viewLat * DEG;
    return { e: [-Math.sin(lo), Math.cos(lo), 0],
      n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)],
      f: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)] };
  }

  function project(lat, lon, b) {
    const la = lat * DEG, lo = lon * DEG;
    const p = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    const dot = (v) => p[0] * v[0] + p[1] * v[1] + p[2] * v[2];
    return { x: center + radius * dot(b.e), y: center - radius * dot(b.n), z: dot(b.f) };
  }

  function updateGeometry(b) {
    for (let py = 0; py < size; py++) {
      const sy = (center - py - 0.5) / radius;
      for (let px = 0; px < size; px++) {
        const sx = (px + 0.5 - center) / radius;
        const rr = sx * sx + sy * sy;
        const i = py * size + px;
        if (rr > 1) { depths[i] = -1; continue; }
        const z = Math.sqrt(1 - rr);
        const xw = sx * b.e[0] + sy * b.n[0] + z * b.f[0];
        const yw = sx * b.e[1] + sy * b.n[1] + z * b.f[1];
        const zw = sx * b.e[2] + sy * b.n[2] + z * b.f[2];
        normals[i * 3] = xw; normals[i * 3 + 1] = yw; normals[i * 3 + 2] = zw;
        const tx = clamp(Math.floor((Math.atan2(yw, xw) / DEG + 180) * 4), 0, 1439);
        const ty = clamp(Math.floor((90 - Math.asin(clamp(zw, -1, 1)) / DEG) * 4), 0, 719);
        masks[i] = texture[(ty * 1440 + tx) * 4] / 255;
        depths[i] = z;
      }
    }
    geometryDirty = false;
  }

  function drawGrid(b) {
    ctx.save();
    ctx.strokeStyle = 'rgba(92, 126, 126, 0.19)';
    ctx.lineWidth = 0.6;
    function line(points) {
      ctx.beginPath();
      let moving = false;
      for (const [lat, lon] of points) {
        const p = project(lat, lon, b);
        if (p.z < 0.012) { moving = false; continue; }
        if (!moving) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
        moving = true;
      }
      ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const points = [];
      for (let lon = -180; lon <= 180; lon += 2) points.push([lat, lon]);
      if (lat === 0) { ctx.strokeStyle = 'rgba(86, 118, 118, 0.34)'; ctx.lineWidth = 0.8; }
      line(points);
      ctx.strokeStyle = 'rgba(92, 126, 126, 0.19)'; ctx.lineWidth = 0.6;
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const points = [];
      for (let lat = -90; lat <= 90; lat += 2) points.push([lat, lon]);
      line(points);
    }
    ctx.restore();
  }

  function drawCities(b) {
    const rects = [],bounds=canvas.getBoundingClientRect();
    const scope=canvas.parentElement.closest('.planet-observatory,.earth-panel,.tour-stage')||canvas.parentElement;
    for(const selector of labelLayout.reservedSelectors)for(const element of scope.querySelectorAll(selector)){
      if(element.getClientRects().length===0||!bounds.width||!bounds.height)continue;
      const box=element.getBoundingClientRect();rects.push({x:(box.left-bounds.left)*size/bounds.width,y:(box.top-bounds.top)*size/bounds.height,w:box.width*size/bounds.width,h:box.height*size/bounds.height});
    }
    let shown=0;
    hitTargets = [];
    const visible = cities.filter(city=>labelsVisible&&(cityOverrides===null||cityOverrides.has(city.id))).map(city => ({ city, p: project(city.lat, city.lon, b) }))
      .filter(({ p }) => p.z > 0.08)
      .sort((a,b)=>Number(cityOverrides?.get(b.city.id)?.selected??(b.city.id===selectedId))-Number(cityOverrides?.get(a.city.id)?.selected??(a.city.id===selectedId))||(cityOverrides?.get(b.city.id)?.priority||0)-(cityOverrides?.get(a.city.id)?.priority||0)||b.p.z-a.p.z);
    ctx.font = '500 12px "Microsoft YaHei", "PingFang SC", sans-serif';
    for (const { city, p } of visible) {
      const selected = cityOverrides?.get(city.id)?.selected??(city.id===selectedId);
      ctx.beginPath(); ctx.arc(p.x, p.y, selected ? 6 : 4.2, 0, Math.PI * 2);
      ctx.fillStyle = selected ? '#dc7f43' : '#fcf4df'; ctx.fill();
      ctx.strokeStyle = selected ? '#fff9e8' : '#416c70'; ctx.lineWidth = selected ? 2 : 1.6; ctx.stroke();
      hitTargets.push({ city, x: p.x, y: p.y, radius: 13 });
      if (shown >= (labelLayout.density==='global'?8:7) && !selected) continue;
      const entry=cityOverrides?.get(city.id),{date,detail:remaining}=splitGlobeLabelDetails(entry),details=remaining.split('\n'),emphasis=new Set(entry?.highlightFields||[]);
      const rows=[{text:entry?.name||city.name,field:'name'},...(entry?.headline?[{text:String(entry.headline),field:'time'}]:[]),...(entry?.teaching?String(entry.teaching).split('\n').map(text=>({text,field:'teaching'})):[]),...(date?[{text:String(date),field:'date'}]:[]),...details.filter(Boolean).map(text=>({text,field:'detail'}))],lines=rows.map(row=>row.text);
      const w = Math.min(180,Math.max(...lines.map(line=>ctx.measureText(line).width))+18), h = entry?lines.length*16+12:25;
      const options = [
        { x: p.x + 10, y: p.y - 12 }, { x: p.x - w - 10, y: p.y - 12 },
        { x: p.x - w / 2, y: p.y - h - 12 }, { x: p.x - w / 2, y: p.y + 12 },
      ];
      if(cityOverrides)for(const gap of [35,65,95])options.push({x:p.x-w/2,y:p.y-h-gap},{x:p.x-w/2,y:p.y+gap},{x:p.x+gap,y:p.y-h/2},{x:p.x-w-gap,y:p.y-h/2});
      const chosen = options.find(r => r.x > 10 && r.x + w < size - 10 && r.y > 10 && r.y + h < size - 10
        && !rects.some(o => r.x < o.x + o.w + 4 && r.x + w + 4 > o.x && r.y < o.y + o.h + 4 && r.y + h + 4 > o.y));
      if (!chosen) continue;
      rects.push({ ...chosen, w, h });shown++;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(clamp(p.x,chosen.x,chosen.x+w),clamp(p.y,chosen.y,chosen.y+h));ctx.strokeStyle='rgba(214,230,208,.6)';ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath(); ctx.roundRect(chosen.x, chosen.y, w, h, 5);
      ctx.fillStyle = selected ? '#1a4e52' : 'rgba(250,248,239,0.94)';
      ctx.fill();
      ctx.strokeStyle = selected ? '#51817c' : 'rgba(82,119,115,0.18)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = selected ? '#fff7e6' : '#234e50';
      ctx.textBaseline = 'middle';rows.forEach((row,index)=>{const y=chosen.y+(entry?14+index*16:h/2+.5);if(emphasis.has(row.field)){ctx.fillStyle='#f2e4b1';ctx.fillRect(chosen.x+5,y-8,w-10,16);ctx.fillStyle='#24483d';}else ctx.fillStyle=selected?'#fff7e6':'#234e50';ctx.fillText(row.text,chosen.x+9,y,w-18);});
      hitTargets.push({ city, x: chosen.x + w / 2, y: chosen.y + h / 2, w, h });
    }
    return rects;
  }

  function render() {
    frame = 0;
    if (disposed) return;
    const b = basis();
    if (geometryDirty) updateGeometry(b);
    const sun = solarPosition(instant), data = pixels.data;
    for (let i = 0; i < depths.length; i++) {
      const z = depths[i], di = i * 4;
      if (z < 0) { data[di + 3] = 0; continue; }
      const land = masks[i];
      const cosine = normals[i * 3] * sun[0] + normals[i * 3 + 1] * sun[1] + normals[i * 3 + 2] * sun[2];
      const mix = showNight ? clamp((cosine + 0.12) / 0.27, 0, 1) : 1;
      const smooth = mix * mix * (3 - 2 * mix);
      const shade = 0.76 + 0.24 * Math.pow(z, 0.5);
      const twilight = showNight ? Math.max(0, 1 - Math.abs(cosine) / 0.12) : 0;
      data[di] = (13 + land * 28 + (167 + land * 38) * smooth) * shade + twilight * 9;
      data[di + 1] = (39 + land * 28 + (172 - land * 6) * smooth) * shade + twilight * 3;
      data[di + 2] = (47 + land * 23 + (161 - land * 19) * smooth) * shade;
      data[di + 3] = clamp(z * radius * 2, 0, 1) * 255;
    }
    layerCtx.putImageData(pixels, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const aura = ctx.createRadialGradient(center, center, radius - 2, center, center, radius + 22);
    aura.addColorStop(0, 'rgba(110,165,160,0.21)');
    aura.addColorStop(0.4, 'rgba(142,181,171,0.10)');
    aura.addColorStop(1, 'rgba(142,181,171,0)');
    ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(center, center, radius + 22, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(layer, 0, 0);
    if(gridVisible)drawGrid(b);
    ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(211,232,216,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    const occupied=drawCities(b),box=canvas.getBoundingClientRect(),sx=box.width/size,sy=box.height/size;
    annotations.draw({width:box.width,height:box.height,radius:radius*Math.min(sx,sy),occupied:occupied.map(r=>({x:r.x*sx,y:r.y*sy,w:r.w*sx,h:r.h*sy})),project:(lat,lon)=>{const p=project(lat,lon,b);return {x:p.x*sx,y:p.y*sy,z:p.z};}});
  }

  function requestRender() { if (!frame && !disposed) frame = requestAnimationFrame(render); }
  function rotate(lon, lat) {
    viewLon = wrap(lon); viewLat = clamp(lat, -70, 70); geometryDirty = true; requestRender();
  }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * size / rect.width, y: (event.clientY - rect.top) * size / rect.height };
  }
  function down(event) {
    if (event.button !== 0) return;
    leaveDayView();
    const p = point(event);
    pointer = { id: event.pointerId, ...p, originX: p.x, originY: p.y, lon: viewLon, lat: viewLat, moved: false };
    canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing';
  }
  function move(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const p = point(event);
    if (Math.hypot(p.x - pointer.originX, p.y - pointer.originY) > 4) pointer.moved = true;
    if (pointer.moved) rotate(pointer.lon - (p.x - pointer.originX) * 0.3, pointer.lat + (p.y - pointer.originY) * 0.24);
  }
  function up(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!pointer.moved) {
      const p = point(event);
      const hit = hitTargets.find(t => t.w ? Math.abs(p.x - t.x) < t.w / 2 && Math.abs(p.y - t.y) < t.h / 2
        : Math.hypot(p.x - t.x, p.y - t.y) < t.radius);
      if (hit) { selectedId = hit.city.id; requestRender(); onSelectCity?.(hit.city.id);canvas.dispatchEvent(new CustomEvent('timeatlas:globe-city-select',{bubbles:true,detail:{cityId:hit.city.id}})); }
    }
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    pointer = null; canvas.style.cursor = 'grab';
  }
  function cancel() { pointer = null; canvas.style.cursor = 'grab'; }
  function key(event) {
    const changes = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 10], ArrowDown: [0, -10] };
    const change = changes[event.key];
    if (!change) return;
    event.preventDefault();leaveDayView();rotate(viewLon + change[0], viewLat + change[1]);
  }
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('keydown', key);
  render();
  return {
    setInstant(value) {
      const next = new Date(value);
      if (Number.isNaN(next.getTime())) throw new RangeError('地球时间无效');
      instant = next;if(dayView)applyDayView();requestRender();
    },
    setDayView(value) {
      const enabled=Boolean(value);if(enabled===dayView)return;
      if(!enabled){leaveDayView(true);return;}
      savedView={lon:viewLon,lat:viewLat};dayView=true;applyDayView();onStateChange?.({dayView});requestRender();
    },
    setCityLabels(entries) {
      cityOverrides=Array.isArray(entries)?new Map(entries.filter(entry=>entry&&typeof entry.id==='string').slice(0,24).map(entry=>[entry.id,entry])):null;
      requestRender();
    },
    setLabelLayout(value={}){labelLayout={density:value.density==='global'?'global':'default',reservedSelectors:Array.isArray(value.reservedSelectors)?value.reservedSelectors.filter(x=>typeof x==='string'):[]};requestRender();},
    setAnnotations(entries=[]){annotations.set(entries);requestRender();},
    setLabels(value){labelsVisible=Boolean(value);requestRender();},
    setGrid(value){gridVisible=Boolean(value);requestRender();},
    focusLocation(value){if(!value||!Number.isFinite(value.lat)||!Number.isFinite(value.lon))return;leaveDayView();selectedId=null;rotate(value.lon,value.lat);},
    setNight(value) { showNight = Boolean(value); requestRender(); },
    focusCity(value) {
      const city = typeof value === 'string' ? cities.find(c => c.id === value) : value;
      if (!city) return;
      leaveDayView();
      selectedId = city.id;
      rotate(city.lon, clamp(city.lat - 5, -70, 70));
    },
    destroy() {
      annotations.destroy();
      disposed = true; if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('keydown', key);
    },
  };
}
