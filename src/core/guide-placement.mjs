import {fitWindow} from './window-placement.mjs';
const scaleOf=value=>[1,1.1,1.25].includes(value)?value:1;
export const compactGuideSize=scale=>({width:Math.ceil(360*scaleOf(scale)),height:Math.ceil(236*scaleOf(scale))});
export function compactGuidePlacement(saved,area,game,scale=1){
 const size=compactGuideSize(scale),anchor=game||area;
 return fitWindow({...size,x:saved?.x??anchor.x+anchor.width-size.width-12,y:saved?.y??anchor.y+24},area,{...size,minWidth:size.width,maxWidth:size.width,minHeight:size.height,maxHeight:size.height});
}
export function skillWidgetPlacement(offset,area,game,scale=1){
 const width=Math.ceil(232*scaleOf(scale)),height=Math.ceil(54*scaleOf(scale)),anchor=game||area;
 return fitWindow({width,height,x:anchor.x+anchor.width/2+(offset?.x??-width/2),y:anchor.y+anchor.height+(offset?.y??-anchor.height*.15-height)},area,{width,height,minWidth:width,maxWidth:width,minHeight:height,maxHeight:height});
}
export function skillWidgetOffset(bounds,area,game){const anchor=game||area;return {x:Math.round(bounds.x-anchor.x-anchor.width/2),y:Math.round(bounds.y-anchor.y-anchor.height)};}
