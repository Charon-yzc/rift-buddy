// Coordinates here are Electron DIPs. Native rectangles must be converted at
// the boundary; never mix display scaling with game/client resolution.
const clamp=(n,low,high)=>Math.max(low,Math.min(n,high));
export function savedWindowBounds(value,{minWidth=1,minHeight=1,maxWidth=10000,maxHeight=10000}={}){
 if(!value||!['x','y','width','height'].every(k=>Number.isInteger(value[k])))return null;
 if(Math.abs(value.x)>=30000||Math.abs(value.y)>=30000||value.width<minWidth||value.width>maxWidth||value.height<minHeight||value.height>maxHeight)return null;
 return {x:value.x,y:value.y,width:value.width,height:value.height};
}
export function fitWindow(bounds,area,{width=400,height=740,minWidth=280,minHeight=220,maxWidth=640,maxHeight=1000}={}){
 const w=Math.min(area.width,clamp(bounds?.width||width,minWidth,maxWidth));
 const h=Math.min(area.height,clamp(bounds?.height||height,minHeight,maxHeight));
 return {x:Math.round(clamp(bounds?.x??area.x+area.width-w-12,area.x,area.x+area.width-w)),y:Math.round(clamp(bounds?.y??area.y+24,area.y,area.y+area.height-h)),width:Math.round(w),height:Math.round(h)};
}
// Keep hover content outside its source, including a small cursor clearance.
// All inputs use the same space: renderer CSS pixels or native window DIPs.
export function tooltipPlacement(source,area,{width,height,pointer,prefer='right',gap=12}={}){
 const margin=Math.min(8,area.width/4,area.height/4),left=area.x+margin,top=area.y+margin,right=area.x+area.width-margin,bottom=area.y+area.height-margin;
 width=Math.min(width,right-left);height=Math.min(height,bottom-top);
 const near=pointer&&pointer.x>=source.x&&pointer.x<=source.x+source.width&&pointer.y>=source.y&&pointer.y<=source.y+source.height;
 const avoid={left:Math.max(left,Math.min(source.x,near?pointer.x-12:source.x)),right:Math.min(right,Math.max(source.x+source.width,near?pointer.x+12:source.x+source.width)),top:Math.max(top,Math.min(source.y,near?pointer.y-12:source.y)),bottom:Math.min(bottom,Math.max(source.y+source.height,near?pointer.y+12:source.y+source.height))};
 const y=clamp(source.y,top,bottom-height),x=clamp(source.x,left,right-width);
 const candidates={right:{x:avoid.right+gap,y,width:Math.min(width,right-avoid.right-gap),height},left:{x:avoid.left-gap-width,y,width:Math.min(width,avoid.left-left-gap),height},bottom:{x,y:avoid.bottom+gap,width,height:Math.min(height,bottom-avoid.bottom-gap)},top:{x,y:avoid.top-gap-height,width,height:Math.min(height,avoid.top-top-gap)}};
 const order=[prefer,...['right','left','bottom','top'].filter(side=>side!==prefer)],full=order.find(side=>candidates[side]?.width>=width&&candidates[side].height>=height);
 // A short guide window needs a scrolling card, not one clamped over its icon.
 const side=full||order.filter(side=>candidates[side]?.width>=width&&candidates[side].height>0).sort((a,b)=>candidates[b].height-candidates[a].height)[0]||order.filter(side=>candidates[side]?.width>0&&candidates[side].height>0).sort((a,b)=>candidates[b].width*candidates[b].height-candidates[a].width*candidates[a].height)[0];
 if(!side)return null;
 const next=candidates[side];if(side==='left')next.x=avoid.left-gap-next.width;if(side==='top')next.y=avoid.top-gap-next.height;
 return {x:Math.round(clamp(next.x,left,right-next.width)),y:Math.round(clamp(next.y,top,bottom-next.height)),width:Math.floor(next.width),height:Math.floor(next.height)};
}
export function companionPlacement(client,area,desired=520){
 desired=[400,520,600].includes(desired)?desired:520;
 const gap=8,right=area.x+area.width-client.x-client.width-gap,left=client.x-area.x-gap;
 const side=right>=desired?'right':left>=desired?'left':Math.max(right,left)>=280?(right>=left?'right':'left'):'edge';
 const room=side==='right'?right:side==='left'?left:desired;
 const width=Math.min(desired,room,area.width),height=Math.min(Math.max(client.height,520),area.height);
 const x=side==='right'?client.x+client.width+gap:side==='left'?client.x-gap-width:area.x+area.width-width;
 return {...fitWindow({x,y:client.y,width,height},area,{minWidth:280,minHeight:480,maxWidth:600}),side,overlap:side==='edge'};
}
export function guidePlacement(saved,area,game,{ball=false,collapsed=false,recover=false}={}){
 const minWidth=ball?76:Math.min(360,area.width),minHeight=ball?76:collapsed?280:Math.min(480,area.height);
 let bounds=saved;
 // A disconnected monitor, game display change or recovery must not preserve
 // off-screen coordinates. Keep a user's valid same-display placement.
 if(recover||!bounds||game&&(bounds.x+Math.min(bounds.width,100)<=area.x||bounds.x>=area.x+area.width||bounds.y+Math.min(bounds.height,100)<=area.y||bounds.y>=area.y+area.height)){
  const anchor=game||area;
  bounds={x:anchor.x+anchor.width-(ball?76:saved?.width||400)-12,y:anchor.y+24,width:ball?76:saved?.width||400,height:ball?76:collapsed?280:saved?.height||740};
 }
 return fitWindow({...bounds,...(ball?{width:76,height:76}:collapsed?{height:220}:{})},area,{minWidth,minHeight,maxWidth:ball?76:1000,maxHeight:ball?76:1200});
}
