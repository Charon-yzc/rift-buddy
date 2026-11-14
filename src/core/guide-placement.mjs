import {fitWindow} from './window-placement.mjs';
import {hexMicroPlacement} from './hex-micro.mjs';
const scaleOf=value=>[1,1.1,1.25].includes(value)?value:1;
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
// Leave room for three conditional choices with Windows fallback fonts and at
// 100% DPI. The previous height only fit when native rounding added a few pixels.
export const compactGuideSize=scale=>({width:Math.ceil(320*scaleOf(scale)),height:Math.ceil(236*scaleOf(scale))});
export function guideWindowLimits(kind,area,scale=1){
 const s=scaleOf(scale),[w,h]=kind==='skill'?[208,26]:kind==='jungle'?[230,144]:kind==='compact'?[280,214]:kind==='strip'?[280,160]:[360,480];
 return {minWidth:Math.min(Math.ceil(w*s),area.width),minHeight:Math.min(Math.ceil(h*s),area.height),maxWidth:Math.min(kind==='skill'?640:kind==='compact'?400*s:1000,area.width),maxHeight:Math.min(kind==='skill'?200:kind==='compact'?320*s:1200,area.height)};
}
export function compactGuidePlacement(saved,area,game,scale=1){
 const size=compactGuideSize(scale),anchor=game||area;
 return fitWindow({...size,...saved,x:saved?.x??anchor.x+anchor.width-(saved?.width||size.width)-12,y:saved?.y??anchor.y+56},area,{...size,...guideWindowLimits('compact',area,scale)});
}
export function skillWidgetPlacement(offset,area,game,scale=1,size){
 const width=size?.width||Math.ceil(286*scaleOf(scale)),height=Math.ceil(28*scaleOf(scale)),anchor=game||area;
 const limits={width,height,...guideWindowLimits('skill',area,scale)},next=fitWindow({width,height,x:anchor.x+anchor.width/2+(offset?.x??-width/2),y:anchor.y+anchor.height+(offset?.y??-anchor.height*.15-height)},area,limits);
 if(offset)return next;
 const jungle=jungleWidgetPlacement(null,area,game,scale);
 if(!overlaps(next,jungle))return next;
 for(const x of [jungle.x+jungle.width+12,jungle.x-next.width-12]){
  const beside=fitWindow({...next,x},area,limits);
  if(!overlaps(beside,jungle)&&!overlaps(beside,compactGuidePlacement(null,area,game,scale)))return beside;
 }
 return next;
}
export function skillWidgetOffset(bounds,area,game){const anchor=game||area;return {x:Math.round(bounds.x-anchor.x-anchor.width/2),y:Math.round(bounds.y-anchor.y-anchor.height)};}
export function jungleWidgetPlacement(offset,area,game,scale=1,size){
 const width=size?.width||Math.ceil(250*scaleOf(scale)),height=size?.height||Math.ceil(144*scaleOf(scale)),anchor=game||area;
 const equipment=compactGuidePlacement(null,area,game,scale),defaultY=Math.max(anchor.y+anchor.height*.75-height-16,equipment.y+equipment.height+12);
 const limits={width,height,...guideWindowLimits('jungle',area,scale)},next=fitWindow({width,height,x:anchor.x+anchor.width+(offset?.x??-width-12),y:offset?.y!==undefined?anchor.y+anchor.height+offset.y:defaultY},area,limits);
 if(offset||!overlaps(next,equipment))return next;
 const economy=hexMicroPlacement('economy',null,area,game,scale);
 const left=fitWindow({...next,x:economy.x,y:economy.y+economy.height+12},area,limits);
 return !overlaps(left,equipment)&&!overlaps(left,economy)?left:next;
}
export function jungleWidgetOffset(bounds,area,game){const anchor=game||area;return {x:Math.round(bounds.x-anchor.x-anchor.width),y:Math.round(bounds.y-anchor.y-anchor.height)};}
