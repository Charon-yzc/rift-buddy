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

function returnFocusFixture(){
 const start=source.indexOf('let overlayReturnFocus='),end=source.indexOf('async function showWindowInfo(',start);assert(start>=0&&end>start);
 let click;const document={body:{},activeElement:null,addEventListener(name,listener){if(name==='click')click=listener;}};document.activeElement=document.body;
 const nodes=[],app={contains:element=>nodes.includes(element),querySelectorAll:()=>nodes.filter(node=>node.tagName==='SUMMARY')};
 function node(action,{visible=true,summary=null,label=''}={}){
  const element={tagName:action?'BUTTON':'SUMMARY',dataset:action?{action}:{},isConnected:true,disabled:false,visible,textContent:label,
   closest:selector=>selector==='details'?summary?{querySelector:()=>summary}:null:element,
   checkVisibility(){return this.visible;},focus(){document.activeElement=this;}};nodes.push(element);return element;
 }
 let layer=null;const overlay={get firstElementChild(){return layer;},querySelector:()=>null,set innerHTML(value){assert.equal(value,'');layer=null;document.activeElement=document.body;}};
 const context=vm.createContext({document,app,overlay,route:'draft',windowLayout:{docked:false},queueMicrotask,catalogRequest:0,
  client:{gameId:'101',role:'mid',hero:'Ahri'},data:{champions:[]},slots:[],saved:{draft:null},lastTaskSelection:null,
  preparationGameId:client=>client.gameId,taskOwnRole:()=>context.client.role,currentPlayerSelection:()=>({id:context.client.hero,role:context.client.role}),
  disclosureState:{captureButtonFocus(_root,element){return element?.dataset.action||null;},restoreFocus(key){const matches=nodes.filter(node=>node.isConnected&&node.dataset.action===key);const target=matches.length===1?matches[0]:null;if(!target||target.disabled||!target.visible)return false;target.focus();return true;}}});
 vm.runInContext(source.slice(start,end),context);
 const opener=node('pregame-hero');
 return {context,document,overlay,opener,node,
  open(element=opener){element.focus();click({target:element});layer={};document.activeElement={tagName:'INPUT'};},
  replace(){layer={};document.activeElement={tagName:'INPUT'};},
  close(){context.closeOverlay();},flush:()=>new Promise(resolve=>queueMicrotask(resolve))};
}

test('closing a picker returns to its original available opening button',async()=>{
 const f=returnFocusFixture();f.open();f.close();await f.flush();assert.equal(f.document.activeElement,f.opener);
});

test('replacing a dialog keeps focus inside it and retains the original opener for its eventual close',async()=>{
 const f=returnFocusFixture();f.open();f.close();f.replace();const inside=f.document.activeElement;await f.flush();assert.equal(f.document.activeElement,inside);
 f.close();await f.flush();assert.equal(f.document.activeElement,f.opener);
});

test('a background render can rebuild the same logical opener before the picker closes',async()=>{
 const f=returnFocusFixture();f.open();f.opener.isConnected=false;const replacement=f.node('pregame-hero');f.close();await f.flush();assert.equal(f.document.activeElement,replacement);
});

for(const unavailable of ['hidden','disabled','ambiguous'])test(`closing a picker never redirects focus to an ${unavailable} opener`,async()=>{
 const f=returnFocusFixture();f.open();f.close();
 if(unavailable==='hidden')f.opener.visible=false;else if(unavailable==='disabled')f.opener.disabled=true;else{f.opener.isConnected=false;f.node('pregame-hero');f.node('pregame-hero');}
 await f.flush();assert.equal(f.document.activeElement,f.document.body);
});

for(const moved of ['focus','route','layout','game','role','hero'])test(`closing a picker does not override a newer ${moved} choice`,async()=>{
 const f=returnFocusFixture();f.open();f.close();const other=f.node('another-action');
 if(moved==='focus')other.focus();else if(moved==='route')f.context.route='settings';else if(moved==='layout')f.context.windowLayout.docked=true;
 else{f.opener.isConnected=false;f.node('pregame-hero');f.context.client[moved==='game'?'gameId':moved]=moved==='game'?'102':moved==='role'?'jungle':'Jinx';}
 const active=f.document.activeElement;await f.flush();assert.equal(f.document.activeElement,active);
});

test('opening another picker before the previous close finishes does not restore the previous button',async()=>{
 const f=returnFocusFixture();f.open();f.close();const newer=f.node('pick-hex');f.open(newer);const inside=f.document.activeElement;await f.flush();assert.equal(f.document.activeElement,inside);
 f.close();await f.flush();assert.equal(f.document.activeElement,newer);
});

test('closing an already empty overlay leaves the current page focus alone',async()=>{
 const f=returnFocusFixture();f.close();await f.flush();assert.equal(f.document.activeElement,f.document.body);
});
