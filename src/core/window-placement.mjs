// Coordinates here are Electron DIPs. Native rectangles must be converted at
// the boundary; never mix display scaling with game/client resolution.
const clamp=(n,low,high)=>Math.max(low,Math.min(n,high));
export function fitWindow(bounds,area,{width=400,height=740,minWidth=280,minHeight=220,maxWidth=640,maxHeight=1000}={}){
 const w=Math.min(area.width,clamp(bounds?.width||width,minWidth,maxWidth));
 const h=Math.min(area.height,clamp(bounds?.height||height,minHeight,maxHeight));
 return {x:Math.round(clamp(bounds?.x??area.x+area.width-w-12,area.x,area.x+area.width-w)),y:Math.round(clamp(bounds?.y??area.y+24,area.y,area.y+area.height-h)),width:Math.round(w),height:Math.round(h)};
}
export function companionPlacement(client,area){
 const gap=8,right=area.x+area.width-client.x-client.width-gap,left=client.x-area.x-gap;
 const side=right>=280?'right':left>=280?'left':'edge';
 const room=side==='right'?right:side==='left'?left:400;
 const width=Math.min(440,room,area.width),height=Math.min(Math.max(client.height,520),area.height);
 const x=side==='right'?client.x+client.width+gap:side==='left'?client.x-gap-width:area.x+area.width-width;
 return {...fitWindow({x,y:client.y,width,height},area,{minWidth:280,minHeight:480,maxWidth:440}),side,overlap:side==='edge'};
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
 return fitWindow({...bounds,...(ball?{width:76,height:76}:collapsed?{height:220}:{})},area,{minWidth,minHeight,maxWidth:ball?76:640,maxHeight:ball?76:1000});
}
