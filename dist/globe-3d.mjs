import * as THREE from './vendor/three.module.js';
import {loadTimezoneRegions, paintZoneMap, findTimezoneRegion} from './zone-geometry.mjs';
import {createGlobeAnnotations} from './globe-annotations.mjs';
import {splitGlobeLabelDetails} from './globe-label-model.mjs';

// NASA Blue Marble is a historical visual composite, not live satellite imagery.
// Spherical coordinates match Three's default SphereGeometry UVs.
const DEG = Math.PI / 180;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const wrap = n => ((n + 180) % 360 + 360) % 360 - 180;
export function geographicVector(lat, lon, radius = 1) {
  const a = lat * DEG, b = lon * DEG;
  return new THREE.Vector3(radius * Math.cos(a) * Math.cos(b), radius * Math.sin(a), -radius * Math.cos(a) * Math.sin(b));
}
export function solarVector(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('地球时间无效');
  const day = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000 + 1;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const g = 2 * Math.PI / 365.2425 * (day - 1);
  const dec = .006918 - .399912 * Math.cos(g) + .070257 * Math.sin(g) - .006758 * Math.cos(2*g) + .000907 * Math.sin(2*g) - .002697 * Math.cos(3*g) + .00148 * Math.sin(3*g);
  const eq = 229.18 * (.000075 + .001868 * Math.cos(g) - .032077 * Math.sin(g) - .014615 * Math.cos(2*g) - .040849 * Math.sin(2*g));
  return geographicVector(dec / DEG, wrap(180 - (minutes + eq) / 4));
}

// Observe from a quarter turn west of the Sun. Advancing the instant turns
// the surface eastward across a stable, right-lit day/night boundary. This is
// a Sun-relative educational view; camera orbit alone never advances time.
export function dayViewPose(value) {
  const sun=solarVector(value);
  return {lat:12,lon:wrap(Math.atan2(-sun.z,sun.x)/DEG-90)};
}

let imageryPromise;
function loadImagery() {
  if (!imageryPromise) imageryPromise = new THREE.TextureLoader().loadAsync(new URL('./assets/earth-blue-marble.jpg', import.meta.url).href).then(texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }).catch(error => { imageryPromise = null; throw error; });
  return imageryPromise;
}
let atlasPromise;
function loadAtlas() {
  if (!atlasPromise) atlasPromise = fetch(new URL('./assets/land.geojson', import.meta.url)).then(r => {
    if (!r.ok) throw new Error('无法读取地球地图。');
    return r.json();
  }).then(data => {
    const surface = document.createElement('canvas'); surface.width = 2880; surface.height = 1440;
    const c = surface.getContext('2d'); c.fillStyle = '#749caa'; c.fillRect(0,0,2880,1440);
    c.fillStyle = '#e1dcc0'; c.strokeStyle = '#b3ba9c'; c.lineWidth = .7;
    function polygon(rings) {
      c.beginPath();
      for (const ring of rings) { ring.forEach(([lon,lat],i) => { const x=(lon+180)*8,y=(90-lat)*8; if(i)c.lineTo(x,y); else c.moveTo(x,y); }); c.closePath(); }
      c.fill('evenodd'); c.stroke();
    }
    for (const feature of data.features) {
      if(feature.geometry.type==='Polygon')polygon(feature.geometry.coordinates);
      if(feature.geometry.type==='MultiPolygon')feature.geometry.coordinates.forEach(polygon);
    }
    const texture = new THREE.CanvasTexture(surface); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }).catch(error => { atlasPromise = null; throw error; });
  return atlasPromise;
}

const earthVertex = `varying vec2 texUV; varying vec3 sphereNormal; varying vec3 worldPoint;
void main(){texUV=uv;sphereNormal=normalize(mat3(modelMatrix)*normal);worldPoint=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const earthFragment = `uniform sampler2D earthMap;uniform sampler2D zoneMap;uniform float zoneEnabled;uniform vec3 sunDirection;uniform float night;
varying vec2 texUV;varying vec3 sphereNormal;varying vec3 worldPoint;
void main(){
 vec3 n=normalize(sphereNormal), eye=normalize(cameraPosition-worldPoint);
 vec3 base=texture2D(earthMap,texUV).rgb;
 vec4 zone=texture2D(zoneMap,texUV);base=mix(base,zone.rgb,zone.a*zoneEnabled);
 float s=dot(n,sunDirection), daylight=smoothstep(-.10,.18,s);
 float studio=.64+.43*pow(max(dot(n,eye),0.),.65);
 float natural=.075+daylight*(.61+.47*pow(max(s,0.),.5));
 vec3 color=base*mix(studio,natural,night);
 float rim=pow(1.-max(dot(n,eye),0.),3.7);
 color+=vec3(.025,.10,.17)*rim*mix(.30,.2+.8*daylight,night);
 gl_FragColor=vec4(color,1.);
 #include <colorspace_fragment>
}`;
const atmosphereVertex=`varying vec3 n;varying vec3 eye;varying vec3 worldNormal;
void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);eye=normalize(-p.xyz);worldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*p;}`;
const atmosphereFragment=`uniform vec3 sunDirection;uniform float night;varying vec3 n;varying vec3 eye;varying vec3 worldNormal;
void main(){float fresnel=pow(1.-max(dot(normalize(n),normalize(eye)),0.),3.0);float light=mix(1.,.35+.65*smoothstep(-.15,.15,dot(normalize(worldNormal),sunDirection)),night);gl_FragColor=vec4(.28,.64,.87,fresnel*.36*light);}`;

export async function createGlobe3D(canvas, {cities=[],onSelectCity,onStateChange,onSelectZone}={}) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('createGlobe3D needs a canvas element');
  const parent = canvas.parentElement;
  // Retain the last frame while idle: this globe renders on demand, and its
  // canvas is also captured by the desktop browser's preview/screenshot path.
  const renderer = new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  renderer.setClearColor(0,0); renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1.2,1.2,1.2,-1.2,.1,20),raycaster=new THREE.Raycaster();
  const status={style:'realistic',night:true,grid:false,labels:true,autoRotate:false,dayView:false,zoom:1,renderer:'webgl',zoneLayer:'none'};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let lon=80,lat=22,instant=new Date(),frame=0,lastFrame=0,disposed=false,intersects=true;
  let width=1,height=1,target=null,velocity={lon:0,lat:0},drag=null,selectedId=null,atlasToken=0,zoneToken=0;
  let cityOverrides=null,zoneRegions=null,zoneCanvas=null,zoneTexture=null,labelLayout={density:'default',reservedSelectors:[]};
  const pointerPositions=new Map(); let pinchDistance=null;
  const emptyZoneTexture=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1);emptyZoneTexture.needsUpdate=true;
  const uniforms={earthMap:{value:null},zoneMap:{value:emptyZoneTexture},zoneEnabled:{value:0},sunDirection:{value:solarVector(instant)},night:{value:1}};
  const earthMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:earthVertex,fragmentShader:earthFragment});
  const earth=new THREE.Mesh(new THREE.SphereGeometry(1,128,80),earthMaterial);scene.add(earth);
  const auraMaterial=new THREE.ShaderMaterial({uniforms:{sunDirection:uniforms.sunDirection,night:uniforms.night},vertexShader:atmosphereVertex,fragmentShader:atmosphereFragment,transparent:true,depthWrite:false});
  const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.026,80,56),auraMaterial);scene.add(atmosphere);
  const grid=new THREE.Group();grid.visible=false;scene.add(grid);
  const gridMaterial=new THREE.LineBasicMaterial({color:0xb5cbd1,transparent:true,opacity:.22,depthWrite:false});
  const equatorMaterial=new THREE.LineBasicMaterial({color:0xeadbb4,transparent:true,opacity:.62,depthWrite:false});
  function addLine(points,material=gridMaterial){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),material);grid.add(line);}
  for(let a=-60;a<=60;a+=30){const p=[];for(let b=-180;b<=180;b+=2)p.push(geographicVector(a,b,1.003));addLine(p,a===0?equatorMaterial:gridMaterial);}
  for(let b=-180;b<180;b+=30){const p=[];for(let a=-90;a<=90;a+=2)p.push(geographicVector(a,b,1.003));addLine(p);}
  const pinGeometry=new THREE.SphereGeometry(.008,12,8),pinMaterial=new THREE.MeshBasicMaterial({color:0xe9e5ce});
  const selectedMaterial=new THREE.MeshBasicMaterial({color:0xffdba1});
  const pins=cities.map(city=>{const pin=new THREE.Mesh(pinGeometry,pinMaterial);pin.position.copy(geographicVector(city.lat,city.lon,1.008));scene.add(pin);return {city,pin};});
  const ring=new THREE.Mesh(new THREE.RingGeometry(.020,.025,64),new THREE.MeshBasicMaterial({color:0xfbe2a6,transparent:true,opacity:.95,side:THREE.DoubleSide,depthWrite:false}));ring.visible=false;scene.add(ring);
  const labels=document.createElement('div');labels.className='globe-label-layer';labels.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden;';parent.append(labels);
  const annotations=createGlobeAnnotations(parent);
  const labelItems=cities.map(city=>{
    const leader=document.createElement('span');leader.className='globe-city-leader';leader.style.cssText='position:absolute;height:1px;transform-origin:0 50%;pointer-events:none;background:rgba(226,235,218,.65);';labels.append(leader);
    const button=document.createElement('button');button.className='globe-city-label';button.type='button';button.textContent=city.name;button.setAttribute('aria-label',`查看${city.name}当地时间`);button.style.cssText='position:absolute;pointer-events:auto;font-size:12px;white-space:nowrap;';button.hidden=true;leader.hidden=true;
    button.addEventListener('click',()=>selectCity(city));labels.append(button);return {city,button,leader};
  });
  canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','三维地球：拖动旋转，滚轮或加减号缩放，方向键旋转，Home 复位；点击城市查看当地时间。');
  canvas.style.touchAction='none';canvas.style.cursor='grab';canvas.dataset.renderer='webgl';
  function emit(){onStateChange?.({...status});}
  function stateChanged(){emit();requestDraw();}
  function isVisible(){if(document.hidden||canvas.getClientRects().length===0||width<=0||height<=0)return false;if(intersects)return true;const box=canvas.getBoundingClientRect();return box.bottom>0&&box.top<window.innerHeight&&box.right>0&&box.left<window.innerWidth;}
  function requestDraw(){if(!disposed&&!frame&&isVisible())frame=requestAnimationFrame(draw);}
  function size(){
    const box=canvas.getBoundingClientRect();width=box.width;height=box.height;
    if(width<1||height<1)return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(width,height,false);
    const aspect=width/height,v=Math.max(1.13,1.13/aspect)/status.zoom;
    camera.left=-v*aspect;camera.right=v*aspect;camera.top=v;camera.bottom=-v;camera.updateProjectionMatrix();
    // Resizing clears the WebGL drawing buffer. Paint it immediately as an
    // observer callback may run while requestAnimationFrame is throttled.
    pose();scene.updateMatrixWorld(true);renderer.render(scene,camera);drawLabels();requestDraw();
  }
  function pose(){const view=status.dayView?dayViewPose(instant):{lat,lon};camera.position.copy(geographicVector(view.lat,view.lon,4));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);}
  function leaveDayView(restore=false){
    if(!status.dayView)return;
    // A direct gesture starts at the currently visible orientation. A normal
    // programmatic exit restores the latitude/longitude saved on entry.
    if(!restore){const view=dayViewPose(instant);lon=view.lon;lat=view.lat;}
    status.dayView=false;stateChanged();
  }
  function paintZones(){
    if(status.zoneLayer==='none'){uniforms.zoneEnabled.value=0;return;}
    if(!zoneCanvas){zoneCanvas=document.createElement('canvas');zoneCanvas.width=2880;zoneCanvas.height=1440;zoneTexture=new THREE.CanvasTexture(zoneCanvas);zoneTexture.colorSpace=THREE.SRGBColorSpace;uniforms.zoneMap.value=zoneTexture;}
    paintZoneMap(zoneCanvas.getContext('2d'),status.zoneLayer,zoneRegions,instant);zoneTexture.needsUpdate=true;uniforms.zoneEnabled.value=1;
  }
  function selectedForLesson(city){return cityOverrides===null||cityOverrides.has(city.id);}
  function refreshPins(){for(const {city,pin}of pins)pin.visible=status.labels&&selectedForLesson(city);ring.visible=status.labels&&selectedId!==null&&(cityOverrides===null||cityOverrides.has(selectedId));}
  function labelContent(item,entry){
    const button=item.button;button.replaceChildren();button.classList.toggle('globe-city-clock',Boolean(entry));
    button.style.whiteSpace=entry?'normal':'nowrap';button.style.maxWidth=entry?'142px':'';
    if(!entry){button.textContent=item.city.name;button.setAttribute('aria-label',`查看${item.city.name}当地时间`);delete button.dataset.tone;return;}
    button.dataset.tone=entry.tone||'neutral';
    const name=document.createElement('span');name.className='globe-label-name';name.textContent=entry.name||item.city.name;name.style.cssText='display:block;font-size:11px;line-height:1.4;';button.append(name);
    const emphasis=new Set(Array.isArray(entry.highlightFields)?entry.highlightFields:[]);
    if(entry.headline){const headline=document.createElement('strong');headline.className='globe-label-headline';headline.classList.toggle('is-speaking-field',emphasis.has('time'));headline.textContent=String(entry.headline);headline.style.cssText='display:block;font-size:20px;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.3;';button.append(headline);}
    if(entry.teaching){const teaching=document.createElement('span');teaching.className='globe-label-teaching';teaching.classList.toggle('is-speaking-field',emphasis.has('teaching'));teaching.textContent=String(entry.teaching);button.append(teaching);}
    const {date,detail:remaining}=splitGlobeLabelDetails(entry);if(date){const label=document.createElement('small');label.className='globe-label-date';label.classList.toggle('is-speaking-field',emphasis.has('date'));label.textContent=date;button.append(label);}
    if(remaining){const detail=document.createElement('small');detail.className='globe-label-detail';detail.textContent=remaining;detail.style.cssText='display:block;font-size:10px;line-height:1.5;white-space:pre-line;';button.append(detail);}
    button.setAttribute('aria-label',`${item.city.name}，${entry.headline||''}，${entry.teaching||''}，${date||''}，${remaining}`);
  }
  function drawAnnotations(occupied,direction){
    annotations.draw({width,height,radius:height/(camera.top-camera.bottom),occupied,project:(a,b)=>{const point=geographicVector(a,b,1.018),z=point.clone().normalize().dot(direction),p=point.project(camera);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2,z};}});
  }
  function hideItem(item){item.button.hidden=true;item.button.style.display='none';item.leader.hidden=true;item.leader.style.display='none';}
  function labelObstacles(){
    const bounds=canvas.getBoundingClientRect(),rects=[];
    const scope=parent.closest('.planet-observatory,.earth-panel,.tour-stage')||parent;
    for(const selector of labelLayout.reservedSelectors)for(const element of scope.querySelectorAll(selector)){
      if(element.getClientRects().length===0)continue;
      const box=element.getBoundingClientRect();if(box.width&&box.height)rects.push({x:box.left-bounds.left,y:box.top-bounds.top,w:box.width,h:box.height});
    }
    return rects;
  }
  function drawLabels(){
    const occupied=labelObstacles(),direction=camera.position.clone().normalize(),maxLabels=labelLayout.density==='global'?(width<420?4:width<720?6:8):cityOverrides?4:width<300?3:width<450?5:7;
    let shown=0;
    for(const item of labelItems)hideItem(item);
    drawAnnotations(occupied,direction);
    if(!status.labels)return;
    const isSelected=item=>cityOverrides?.get(item.city.id)?.selected??(item.city.id===selectedId);
    const visible=labelItems.filter(item=>selectedForLesson(item.city)).map(item=>({item,point:geographicVector(item.city.lat,item.city.lon,1.015)})).filter(({point})=>point.clone().normalize().dot(direction)>.16).sort((a,b)=>Number(isSelected(b.item))-Number(isSelected(a.item))||(cityOverrides?.get(b.item.city.id)?.priority||0)-(cityOverrides?.get(a.item.city.id)?.priority||0)||b.point.dot(direction)-a.point.dot(direction));
    for(const {item,point} of visible){
      if(shown>=maxLabels&&!isSelected(item))continue;
      const projected=point.project(camera),x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;
      if(x<5||y<5||x>width-5||y>height-5)continue;
      const b=item.button;b.hidden=false;b.style.display='';b.classList.toggle('is-selected',isSelected(item));b.setAttribute('aria-pressed',String(isSelected(item)));
      const w=Math.max(b.offsetWidth,32),h=Math.max(b.offsetHeight,24);
      const options=[{x:x+13,y:y-h/2},{x:x-w-13,y:y-h/2},{x:x-w/2,y:y-h-14},{x:x-w/2,y:y+14}];
      // Teaching clocks are taller than city names. Keep nearby examples visible
      // by extending their leader lines before dropping a comparison label.
      if(cityOverrides)for(const gap of [40,70,100])options.push({x:x-w/2,y:y-h-gap},{x:x-w/2,y:y+gap},{x:x+w/2+gap,y:y-h/2},{x:x-w*1.5-gap,y:y-h/2});
      const fit=options.find(r=>r.x>6&&r.y>6&&r.x+w<width-6&&r.y+h<height-6&&!occupied.some(o=>r.x<o.x+o.w+6&&r.x+w+6>o.x&&r.y<o.y+o.h+5&&r.y+h+5>o.y));
      if(!fit){hideItem(item);continue;}
      occupied.push({...fit,w,h});shown++;b.style.left=`${fit.x}px`;b.style.top=`${fit.y}px`;
      const endX=clamp(x,fit.x,fit.x+w),endY=clamp(y,fit.y,fit.y+h),dx=endX-x,dy=endY-y;
      item.leader.hidden=false;item.leader.style.display='';item.leader.style.left=`${x}px`;item.leader.style.top=`${y}px`;item.leader.style.width=`${Math.hypot(dx,dy)}px`;item.leader.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;
    }
  }
  function draw(now){
    frame=0;if(disposed||!isVisible()){lastFrame=0;return;}
    const dt=lastFrame?Math.min((now-lastFrame)/1000,.04):.016;lastFrame=now;let moving=false;
    if(target){const t=clamp((now-target.started)/target.duration,0,1),e=t*t*(3-2*t);lon=target.lon+target.delta*e;lat=target.lat+(target.toLat-target.lat)*e;if(t===1){lon=wrap(lon);target=null;}else moving=true;}
    else if(!drag&&Math.hypot(velocity.lon,velocity.lat)>.02&&!reduced.matches){lon=wrap(lon+velocity.lon*dt);lat=clamp(lat+velocity.lat*dt,-82,82);velocity.lon*=Math.exp(-5*dt);velocity.lat*=Math.exp(-5*dt);moving=true;}
    else if(status.autoRotate&&!drag&&!reduced.matches){lon=wrap(lon+3*dt);moving=true;}
    pose();scene.updateMatrixWorld(true);renderer.render(scene,camera);drawLabels();
    if(moving)requestDraw();else lastFrame=0;
  }
  function stopMotion(){target=null;velocity.lon=0;velocity.lat=0;if(status.autoRotate){status.autoRotate=false;emit();}}
  function moveTo(toLon,toLat,animated=true){
    leaveDayView();stopMotion();const delta=wrap(toLon-lon),finalLat=clamp(toLat,-82,82);
    if(reduced.matches||!animated){lon=wrap(toLon);lat=finalLat;}
    else target={lon,lat,delta,toLat:finalLat,started:performance.now(),duration:950};
    requestDraw();
  }
  function highlight(city){
    selectedId=city?.id||null;
    for(const {city:c,pin} of pins){const selected=c.id===selectedId;pin.material=selected?selectedMaterial:pinMaterial;pin.scale.setScalar(selected?1.4:1);}
    ring.visible=Boolean(city)&&status.labels&&(cityOverrides===null||cityOverrides.has(city.id));
    if(city){const point=geographicVector(city.lat,city.lon,1.013);ring.position.copy(point);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),point.clone().normalize());}
  }
  function selectCity(city){highlight(city);moveTo(city.lon,city.lat);onSelectCity?.(city.id);canvas.dispatchEvent(new CustomEvent('timeatlas:globe-city-select',{bubbles:true,detail:{cityId:city.id}}));stateChanged();}
  function setZoom(value){const next=clamp(value,1,1.75);if(next!==status.zoom){status.zoom=next;size();emit();}}
  function down(event){
    if(event.button!==0)return;
    leaveDayView();
    pointerPositions.set(event.pointerId,{x:event.clientX,y:event.clientY});canvas.setPointerCapture(event.pointerId);stopMotion();
    if(pointerPositions.size>1){const pts=[...pointerPositions.values()];pinchDistance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);drag=null;return;}
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,lon,lat,moved:false,time:performance.now()};canvas.style.cursor='grabbing';
  }
  function move(event){
    if(!pointerPositions.has(event.pointerId))return;
    pointerPositions.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointerPositions.size>1){const pts=[...pointerPositions.values()],distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);if(pinchDistance&&distance>0)setZoom(status.zoom*distance/pinchDistance);pinchDistance=distance;return;}
    if(!drag||event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y,sensitivity=180/Math.max(Math.min(width,height),180)/status.zoom;
    if(Math.hypot(dx,dy)>4)drag.moved=true;
    if(drag.moved){lon=wrap(drag.lon-dx*sensitivity);lat=clamp(drag.lat+dy*sensitivity,-82,82);const dt=Math.max((performance.now()-drag.time)/1000,.016);velocity.lon=clamp(-(event.clientX-drag.lastX)*sensitivity/dt,-80,80);velocity.lat=clamp((event.clientY-drag.lastY)*sensitivity/dt,-45,45);drag.lastX=event.clientX;drag.lastY=event.clientY;drag.time=performance.now();requestDraw();}
  }
  function up(event){
    pointerPositions.delete(event.pointerId);if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(drag&&drag.id===event.pointerId&&!drag.moved){const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,dir=camera.position.clone().normalize();let hit=null,best=18;
      if(status.labels)for(const {city} of pins){if(!selectedForLesson(city))continue;const p=geographicVector(city.lat,city.lon,1.01);if(p.clone().normalize().dot(dir)<.12)continue;const screen=p.project(camera),distance=Math.hypot((screen.x+1)*width/2-x,(1-screen.y)*height/2-y);if(distance<best){best=distance;hit=city;}}
      if(hit)selectCity(hit);
      else if(status.zoneLayer==='legal'&&zoneRegions&&onSelectZone){
        raycaster.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
        const surface=raycaster.intersectObject(earth,false)[0];
        if(surface){const p=surface.point.clone().normalize(),pointLat=Math.asin(clamp(p.y,-1,1))/DEG,pointLon=Math.atan2(-p.z,p.x)/DEG,tzid=findTimezoneRegion(zoneRegions,pointLon,pointLat);if(tzid)onSelectZone({tzid,lat:pointLat,lon:pointLon});}
      }
    }
    if(drag&&performance.now()-drag.time>120){velocity.lon=0;velocity.lat=0;}
    drag=null;pinchDistance=null;canvas.style.cursor='grab';requestDraw();
  }
  function cancel(event){pointerPositions.delete(event.pointerId);drag=null;pinchDistance=null;velocity.lon=0;velocity.lat=0;canvas.style.cursor='grab';}
  function wheel(event){event.preventDefault();setZoom(status.zoom*Math.exp(-event.deltaY*.001));}
  function key(event){
    const delta={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,10],ArrowDown:[0,-10]}[event.key];
    if(delta){event.preventDefault();leaveDayView();moveTo(lon+delta[0],lat+delta[1],false);}
    else if(event.key==='+'||event.key==='='){event.preventDefault();setZoom(status.zoom*1.15);}
    else if(event.key==='-'||event.key==='_'){event.preventDefault();setZoom(status.zoom/1.15);}
    else if(event.key==='Home'){event.preventDefault();api.resetView();}
  }
  function visibility(){if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;lastFrame=0;}else{size();requestDraw();}}
  function motionPreference(){if(reduced.matches){status.autoRotate=false;velocity.lon=0;velocity.lat=0;if(target){lon=wrap(target.lon+target.delta);lat=target.toLat;target=null;}emit();requestDraw();}}
  const resizeObserver=new ResizeObserver(size);resizeObserver.observe(canvas);
  const intersectionObserver=new IntersectionObserver(entries=>{intersects=entries[0]?.isIntersecting!==false;if(intersects){size();requestDraw();}else{if(frame)cancelAnimationFrame(frame);frame=0;lastFrame=0;}},{threshold:0});intersectionObserver.observe(canvas);
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('keydown',key);document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',motionPreference);
  const api={
    setInstant(value){instant=new Date(value);uniforms.sunDirection.value.copy(solarVector(instant));if(status.zoneLayer==='legal')paintZones();stateChanged();},
    setDayView(value){
      const enabled=Boolean(value);if(enabled===status.dayView)return;
      if(!enabled){leaveDayView(true);return;}
      status.dayView=true;stopMotion();stateChanged();
    },
    setNight(value){status.night=Boolean(value);uniforms.night.value=status.night?1:0;stateChanged();},
    focusCity(value){const city=typeof value==='string'?cities.find(c=>c.id===value):value;if(!city||!Number.isFinite(city.lat)||!Number.isFinite(city.lon))return;highlight(city);moveTo(city.lon,city.lat);stateChanged();},
    focusLocation(value,animated=true){if(!value||!Number.isFinite(value.lat)||!Number.isFinite(value.lon))return;highlight(null);moveTo(value.lon,value.lat,animated);stateChanged();},
    async setZoneLayer(value){
      if(!['none','ideal','legal'].includes(value))return;
      const token=++zoneToken;
      try{const regions=value==='legal'?await loadTimezoneRegions():null;if(disposed||token!==zoneToken)return;if(regions)zoneRegions=regions;status.zoneLayer=value;paintZones();stateChanged();}
      catch{if(!disposed&&token===zoneToken)throw new Error('时区边界暂时无法读取，请重试。');}
    },
    setCityLabels(entries){
      cityOverrides=Array.isArray(entries)?new Map(entries.filter(entry=>entry&&typeof entry.id==='string').slice(0,24).map(entry=>[entry.id,entry])):null;
      for(const item of labelItems)labelContent(item,cityOverrides?.get(item.city.id));refreshPins();stateChanged();
    },
    setLabelLayout(value={}){labelLayout={density:value.density==='global'?'global':'default',reservedSelectors:Array.isArray(value.reservedSelectors)?value.reservedSelectors.filter(x=>typeof x==='string'):[]};requestDraw();},
    setAnnotations(entries=[]){
      annotations.set(entries);
      requestDraw();
    },
    async setStyle(value){if(!['realistic','atlas'].includes(value))return;const token=++atlasToken;try{const texture=value==='realistic'?await loadImagery():await loadAtlas();if(disposed||token!==atlasToken)return;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());uniforms.earthMap.value=texture;status.style=value;stateChanged();}catch{if(!disposed)throw new Error('地球图层暂时无法读取，请重试。');}},
    setGrid(value){status.grid=Boolean(value);grid.visible=status.grid;stateChanged();},
    setLabels(value){status.labels=Boolean(value);labels.hidden=!status.labels;refreshPins();stateChanged();},
    setAutoRotate(value){if(value)leaveDayView();status.autoRotate=Boolean(value)&&!reduced.matches;target=null;velocity.lon=0;velocity.lat=0;stateChanged();},
    zoomBy(factor){if(Number.isFinite(factor)&&factor>0)setZoom(status.zoom*factor);},
    resetView(){highlight(null);status.zoom=1;moveTo(80,22);size();stateChanged();},
    getState(){return {...status};},
    destroy(){if(disposed)return;disposed=true;atlasToken++;zoneToken++;if(frame)cancelAnimationFrame(frame);resizeObserver.disconnect();intersectionObserver.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',motionPreference);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('keydown',key);labels.remove();annotations.destroy();const geometries=new Set(),materials=new Set();scene.traverse(obj=>{if(obj.geometry)geometries.add(obj.geometry);if(obj.material)materials.add(obj.material);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();selectedMaterial.dispose();zoneTexture?.dispose();emptyZoneTexture.dispose();renderer.dispose();},
  };
  try{const texture=await loadImagery();if(disposed)return api;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());uniforms.earthMap.value=texture;size();pose();emit();requestDraw();return api;}catch(error){api.destroy();throw error;}
}
