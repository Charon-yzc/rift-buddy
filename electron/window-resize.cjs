// Transparent Windows overlays cannot rely on native edge resizing. The
// visible corner grip uses OS cursor DIPs, independently of renderer zoom.
module.exports=function windowResize({getWindow,getArea,getLimits,onStart=()=>{},onEnd=()=>{},getCursor=()=>require('electron').screen.getCursorScreenPoint()}){
 let start=null;
 const active=()=>!!start;
 function resize(width,height){const win=getWindow();if(!win||win.isDestroyed())return;const a=getArea(),l=getLimits(a),b=win.getBounds();
  width=Math.min(l.maxWidth,Math.max(l.minWidth,Math.round(width)));height=Math.min(l.maxHeight,Math.max(l.minHeight,Math.round(height)));
  win.setBounds({x:Math.max(a.x,Math.min(b.x,a.x+a.width-width)),y:Math.max(a.y,Math.min(b.y,a.y+a.height-height)),width,height});
 }
 async function control(action,value){
  const win=getWindow();if(!win||win.isDestroyed())throw Error('窗口暂不可用');
  if(action==='resize-start'){if(start)return true;onStart();start={bounds:win.getBounds(),cursor:getCursor()};return true;}
  if(action==='resize'){if(start){const p=getCursor();resize(start.bounds.width+p.x-start.cursor.x,start.bounds.height+p.y-start.cursor.y);}return true;}
  if(action==='resize-end'){if(start){start=null;await onEnd();}return true;}
  if(action==='resize-key'){if(!value||!['width','height'].includes(value.axis)||![10,-10].includes(value.delta))throw Error('调整尺寸格式不正确');onStart();const b=win.getBounds();resize(b.width+(value.axis==='width'?value.delta:0),b.height+(value.axis==='height'?value.delta:0));await onEnd();return true;}
  throw Error('调整窗口操作不正确');
 }
 return {active,control,cancel:()=>{start=null;}};
};
