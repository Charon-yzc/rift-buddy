// Fixed-width placement in Electron DIPs, independent of available side room.
// When there is too little room, overlap is explicit and the client is untouched.
module.exports=function companionPlacement(client,area,desired=440){
 const width=Math.min(Number.isInteger(desired)&&desired>=280&&desired<=800?desired:440,area.width),height=Math.min(client.height,area.height),gap=8;
 const right=area.x+area.width-client.x-client.width-gap,left=client.x-area.x-gap;
 const side=right>=width?'right':left>=width?'left':right>=left?'right':'left';
 const x=side==='right'?client.x+client.width+gap:client.x-gap-width;
 const clamp=(n,low,high)=>Math.round(Math.max(low,Math.min(n,high)));
 return {x:clamp(x,area.x,area.x+area.width-width),y:clamp(client.y,area.y,area.y+area.height-height),width,height,side,overlap:Math.max(right,left)<width};
};
