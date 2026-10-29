/** Geographic teaching labels shared by WebGL and the compatibility globe. */
export function createGlobeAnnotations(parent){
  const layer=document.createElement('div');layer.className='globe-annotation-layer';layer.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2;';parent.append(layer);
  let items=[];
  const hide=item=>{for(const node of [item.element,item.dot,item.leader])node.hidden=true;};
  return {
    set(entries=[]){
      layer.replaceChildren();items=[];
      for(const entry of entries.filter(e=>e&&Number.isFinite(e.lat)&&Number.isFinite(e.lon)).sort((a,b)=>Number(Boolean(b.active))-Number(Boolean(a.active))).slice(0,4)){
        const dot=document.createElement('span');dot.className='globe-annotation-dot';
        const leader=document.createElement('span');leader.className='globe-annotation-leader';
        const element=document.createElement('div');element.className='globe-annotation';element.dataset.active=String(Boolean(entry.active));element.dataset.annotationId=String(entry.id||'');
        const status=document.createElement('span');status.className='globe-annotation-side';status.textContent='地球背面 · 方向提示';status.hidden=true;
        const text=document.createElement('strong');text.textContent=String(entry.text||'');element.append(status,text);
        if(entry.detail){const detail=document.createElement('small');detail.textContent=String(entry.detail);element.append(detail);}
        layer.append(leader,dot,element);const item={entry,element,dot,leader,status};hide(item);items.push(item);
      }
    },
    draw({width,height,radius,project,occupied=[]}){
      for(const item of items){
        hide(item);const {entry,element,dot,leader,status}=item,p=project(entry.lat,entry.lon),behind=p.z<0;
        if((p.z<.08&&!entry.active)||width<80||height<80)continue;
        let {x,y}=p;
        if(behind){const dx=x-width/2,dy=y-height/2,length=Math.hypot(dx,dy)||1,r=Math.min(radius,width/2-12,height/2-12);x=width/2+(length===1?1:dx/length)*r;y=height/2+dy/length*r;}
        status.hidden=!behind;element.dataset.side=behind?'back':'front';element.hidden=false;
        element.style.maxWidth=`${Math.min(190,width-24)}px`;const w=element.offsetWidth,h=element.offsetHeight;
        const options=[{x:x+17,y:y-h/2},{x:x-w-17,y:y-h/2},{x:x-w/2,y:y-h-18},{x:x-w/2,y:y+18}];
        if(entry.active)for(const gap of [45,80,110])options.push({x:x-w/2,y:y-h-gap},{x:x-w/2,y:y+gap});
        const fits=r=>r.x>=7&&r.y>=7&&r.x+w<=width-7&&r.y+h<=height-7&&!occupied.some(o=>r.x<o.x+o.w+6&&r.x+w+6>o.x&&r.y<o.y+o.h+6&&r.y+h+6>o.y);
        // Keep the spoken object in view before considering lower-priority labels.
        if(entry.active)for(const row of [8,height-h-8])for(const column of [8,width-w-8,width/2-w/2])options.push({x:column,y:row});
        const fit=options.find(fits);if(!fit){hide(item);continue;}
        element.style.left=`${fit.x}px`;element.style.top=`${fit.y}px`;occupied.push({...fit,w,h});
        dot.hidden=false;dot.dataset.side=behind?'back':'front';dot.dataset.active=String(Boolean(entry.active));dot.style.left=`${x}px`;dot.style.top=`${y}px`;
        const endX=Math.max(fit.x,Math.min(x,fit.x+w)),endY=Math.max(fit.y,Math.min(y,fit.y+h)),dx=endX-x,dy=endY-y;
        leader.hidden=false;leader.dataset.side=behind?'back':'front';leader.style.left=`${x}px`;leader.style.top=`${y}px`;leader.style.width=`${Math.hypot(dx,dy)}px`;leader.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;
      }
    },
    destroy(){layer.remove();items=[];}
  };
}
