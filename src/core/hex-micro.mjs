import {fitWindow} from './window-placement.mjs';

export const HEX_WINDOWS=['economy','routes'];
const scaleOf=value=>[1,1.1,1.25].includes(value)?value:1;
export function validateHexWindows(value){
 if(!value||typeof value!=='object')return undefined;
 const result={};for(const kind of HEX_WINDOWS){const p=value[kind];if(p&&Number.isInteger(p.x)&&Math.abs(p.x)<30000&&Number.isInteger(p.y)&&Math.abs(p.y)<30000)result[kind]={x:p.x,y:p.y};}
 return Object.keys(result).length?result:undefined;
}
export function hexMicroPlacement(kind,offset,area,game,scale=1,routes=[],expanded=false,layout='full'){
 const visible=routes.slice(0,expanded?30:3);
 const rowWidth=(r,controls=0,caption=72)=>Math.max(Math.max(0,r.augments.length*39-3)+controls,Math.max(0,r.items.length*27-3)+6+caption);
 // The compact view keeps the first complete recipe in two rows, with the
 // controls beside the augment row. Full cards use the same icon geometry.
 const lineWidth=routes.length?Math.max(282,12+rowWidth(routes[0],58)):282;
 const routeWidth=visible.length?Math.max(282,...visible.map(r=>20+rowWidth(r,0,110)+(expanded?18:0))):64;
 const routeHeight=visible.length?34+visible.reduce((height,route)=>height+(route.augments.length?81:45),0)+(visible.length-1)*7+(routes.length>3?20:0):64;
 // Native frameless windows can have a 64 DIP minimum. fitWindow caps width
 // to the working area; the renderer provides horizontal scrolling if needed.
 const s=scaleOf(scale),anchor=game||area,[w,h]=layout==='line'?[kind==='economy'?356:lineWidth,kind==='economy'?54:92]:kind==='economy'?[168,134]:[routeWidth,Math.min(routeHeight,Math.min(480,area.height*.65/s))],width=Math.ceil(w*s),height=Math.max(64,Math.ceil(h*s));
 return fitWindow({x:anchor.x+(offset?.x??(kind==='economy'?12:anchor.width-width-12)),y:anchor.y+(offset?.y??56),width,height},area,{minWidth:width,minHeight:height,maxWidth:width,maxHeight:height});
}
export function hexMicroOffset(bounds,area,game){const anchor=game||area;return {x:Math.round(bounds.x-anchor.x),y:Math.round(bounds.y-anchor.y)};}
export function hexMicroPayload(value,kind){
 const m=value?.model,session=JSON.stringify([m?.mode,m?.champion?.id,m?.matchId||null,m?.hexRound?.context||null]),context=JSON.stringify([session,value?.referenceRevision]);
 if(!['hex','rift'].includes(m?.mode)||kind==='routes'&&m.mode!=='hex')return {kind,context,active:false};
 const mismatch=['champion','mode','role','combo'].includes(m.live?.kind);
 const side=name=>({value:m.equipment?.[name]?.value??null,players:(m.equipment?.[name]?.players||[]).slice(0,5).map(p=>({id:p.id,name:p.name,known:p.known,value:p.value}))});
 return {kind,context,session,active:true,scale:scaleOf(value?.presentation?.textScale),hero:{id:m.champion?.id,name:m.champion?.name},images:m.imageOverrides||{},
  ...(kind==='economy'?{equipment:{available:m.equipment?.available===true,ally:side('ally'),enemy:side('enemy'),difference:m.equipment?.difference??null}}:{routes:mismatch?[]:m.hexMicroRoutes||[],pending:mismatch?'当前游戏与方案不符，请从完整助手换入当前英雄与模式。':m.hexMicroPending||'配套路线正在核对'})};
}
