import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const handler=source.split('\n').find(line=>line.startsWith("document.addEventListener('keydown',event=>{if(event.key==='Escape'"));
assert(handler);
function fixture({empty=false}={}){
 let listener,closed=0,open=false;const document={activeElement:null,addEventListener(name,fn){if(name==='keydown')listener=fn;}};
 const node=(tag,label,visible=true)=>({tag,label,visible,tabIndex:0,getClientRects:()=>[{}],checkVisibility(){return this.visible;},focus(){if(this.visible)document.activeElement=this;}});
 const background=node('button','开黑推荐'),dialog=node('section','提示'),close=node('button','关闭'),first=node('button','经典海克斯'),last=node('button','黎明圣殿'),summary=node('summary','其他配色'),otherFirst=node('button','其他首项',false),otherLast=node('button','其他末项',false);
 const nodes=empty?[]:[close,first,last,summary,otherFirst,otherLast];dialog.tabIndex=-1;dialog.hasAttribute=name=>name==='tabindex';
 const overlay={firstElementChild:dialog,contains:el=>el===dialog||nodes.includes(el),querySelector:()=>dialog,querySelectorAll:selector=>nodes.filter(el=>el.tag==='button'||el.tag==='summary'&&selector.includes('summary'))};
 const context={document,overlay,activeOverlaySelect:null,activeAppSelect:null,closeRecommendationMenus:()=>false,deferOverlaySelect(){},closeOverlay(){closed++;overlay.firstElementChild=null;}};
 vm.runInNewContext(handler,context);
 function press(key,{shiftKey=false,defaultPrevented=false}={}){
  const event={key,shiftKey,defaultPrevented,preventDefault(){this.defaultPrevented=true;}};listener(event);
  if(!event.defaultPrevented&&key==='Tab'){
   // Native order excludes collapsed details descendants even when they retain layout rects.
   const native=nodes.filter(el=>el.visible),index=native.indexOf(document.activeElement),next=index+(shiftKey?-1:1);document.activeElement=native[next]||background;
  }else if(!event.defaultPrevented&&['Enter',' '].includes(key)&&document.activeElement===summary){open=!open;otherFirst.visible=otherLast.visible=open;}
  return event;
 }
 return {document,overlay,background,dialog,close,first,last,summary,otherFirst,otherLast,press,get open(){return open;},get closed(){return closed;}};
}

test('collapsed theme choices are skipped while summary remains the forward and reverse Tab boundary',()=>{
 const f=fixture();f.last.focus();f.press('Tab');assert.equal(f.document.activeElement,f.summary);f.press('Tab');assert.equal(f.document.activeElement,f.close);
 f.press('Tab',{shiftKey:true});assert.equal(f.document.activeElement,f.summary);f.press('Tab',{shiftKey:true});assert.equal(f.document.activeElement,f.last);
 assert.equal(f.otherLast.getClientRects().length,1,'Closed details can retain layout rects without being keyboard focusable');
});

test('summary keeps its native Enter and Space disclosure controls and expanded choices join the loop',()=>{
 const f=fixture();f.summary.focus();f.press('Enter');assert.equal(f.open,true);f.press('Tab');assert.equal(f.document.activeElement,f.otherFirst);
 f.otherLast.focus();f.press('Tab');assert.equal(f.document.activeElement,f.close);f.press('Tab',{shiftKey:true});assert.equal(f.document.activeElement,f.otherLast);
 f.summary.focus();f.press(' ');assert.equal(f.open,false);f.press('Tab');assert.equal(f.document.activeElement,f.close);
});

for(const shiftKey of [false,true])test(`${shiftKey?'reverse':'forward'} Tab loops never focus the background or collapsed theme descendants`,()=>{
 const f=fixture();f.close.focus();for(let i=0;i<20;i++){f.press('Tab',{shiftKey});assert.equal(f.overlay.contains(f.document.activeElement),true);assert.notEqual(f.document.activeElement,f.otherFirst);assert.notEqual(f.document.activeElement,f.otherLast);}
});

for(const start of ['inside','background'])for(const shiftKey of [false,true])test(`an empty-control modal keeps ${shiftKey?'reverse':'forward'} Tab inside when focus starts ${start}`,()=>{
 const f=fixture({empty:true});(start==='inside'?f.dialog:f.background).focus();const event=f.press('Tab',{shiftKey});assert.equal(event.defaultPrevented,true);assert.equal(f.document.activeElement,f.dialog);
});

test('ordinary Escape closes once while an already handled Escape leaves the modal intact',()=>{
 const f=fixture();f.summary.focus();f.press('Escape',{defaultPrevented:true});assert.equal(f.closed,0);f.press('Escape');assert.equal(f.closed,1);assert.equal(f.overlay.firstElementChild,null);
});
