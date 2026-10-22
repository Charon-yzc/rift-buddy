import {fitWindow} from './window-placement.mjs';

export const HEX_WINDOWS=['economy','routes'];
const scaleOf=value=>[1,1.1,1.25].includes(value)?value:1;
export function validateHexWindows(value){
 if(!value||typeof value!=='object')return undefined;
 const result={};for(const kind of HEX_WINDOWS){const p=value[kind];if(p&&Number.isInteger(p.x)&&Math.abs(p.x)<30000&&Number.isInteger(p.y)&&Math.abs(p.y)<30000)result[kind]={x:p.x,y:p.y};}
 return Object.keys(result).length?result:undefined;
}
export function hexMicroPlacement(kind,offset,area,game,scale=1,routes=[]){
 const count=routes.slice(0,3),rows=(n,size,unit)=>n?Math.ceil(n/size)*(unit+3)-3:0;
 const routeHeight=count.length?16+14*(count.length-1)+count.reduce((h,r)=>h+rows(r.augments.length,7,36)+4+rows(r.items.length,8,32),0):42;
 const rowWidth=(n,size,unit)=>Math.min(n,size)*(unit+3)-3;
 const routeWidth=Math.max(64,...count.map(r=>12+Math.max(rowWidth(r.augments.length,7,36),rowWidth(r.items.length,8,32))));
 // Windows gives these frameless windows at least64px. Repeatedly fitting a
 // requested60px route to its actual64px bounds keeps closing hover cards.
 const s=scaleOf(scale),anchor=game||area,[w,h]=kind==='economy'?[168,104]:[routeWidth,routeHeight],width=Math.ceil(w*s),height=Math.max(64,Math.ceil(h*s));
 return fitWindow({x:anchor.x+(offset?.x??(kind==='economy'?12:anchor.width-width-12)),y:anchor.y+(offset?.y??(kind==='economy'?12:Math.round(anchor.height*.26))),width,height},area,{minWidth:width,minHeight:height,maxWidth:width,maxHeight:height});
}
export function hexMicroOffset(bounds,area,game){const anchor=game||area;return {x:Math.round(bounds.x-anchor.x),y:Math.round(bounds.y-anchor.y)};}
export function hexMicroPayload(value,kind){
 const m=value?.model,context=JSON.stringify([m?.mode,m?.champion?.id,m?.matchId||null,value?.referenceRevision]);
 if(!['hex','rift'].includes(m?.mode)||kind==='routes'&&m.mode!=='hex')return {kind,context,active:false};
 const mismatch=['champion','mode','role','combo'].includes(m.live?.kind);
 const side=name=>({players:(m.equipment?.[name]?.players||[]).slice(0,5).map(p=>({id:p.id,name:p.name,known:p.known,value:p.value}))});
 return {kind,context,active:true,scale:scaleOf(value?.presentation?.textScale),hero:{id:m.champion?.id,name:m.champion?.name},images:m.imageOverrides||{},
  ...(kind==='economy'?{equipment:{available:m.equipment?.available===true,ally:side('ally'),enemy:side('enemy')}}:{routes:mismatch?[]:m.hexMicroRoutes||[],pending:mismatch?'当前游戏与方案不符，请从完整助手换入当前英雄与模式。':m.hexMicroPending||'配套路线正在核对'})};
}
