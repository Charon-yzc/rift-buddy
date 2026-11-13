import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {sanitizeNick} from '../src/core/room.mjs';import {normalizeRelayUrl} from '../src/core/room-relay.mjs';
import {holdRenderDuringPointer} from '../src/pointer-render.mjs';
const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const slice=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const capture=slice(' const formFocus=',' const rankingFocus='),restore=slice('  if(formFocus){','  restoreItemReferenceFocus(');
const mainPaint=slice(' historyTooltips.close();ongoingTooltips.close();replacingApp=true;', ' renderedItemReference=itemReference;').replace(/vueRoutes\.render.*;\}finally/,'replaceInput();}finally');
const sidePaint=source.split('\n').find(line=>line.includes('app.innerHTML=companionView(')).replace(/companionView\(.*\)\.replaceAll\('loading="lazy"','loading="eager"'\)/,'roomMarkup()');
const sideCapture=slice('  const focused=document.activeElement,focus=','  const preparation='),sideRestore=source.split('\n').find(line=>line.startsWith('  if(focus&&'));
const change=slice("if(el.id==='room-nick')",'\n').replace(/\}\);\s*$/,'');
function fixture(surface,id,{missing=false,readonly=false}={}){
 let field,saves=0;const listeners=new Map(),document={activeElement:null,getElementById:key=>key===id?field:null,addEventListener(type,handler){listeners.set(type,handler);}};
 const input=value=>({tagName:'INPUT',id,type:id==='room-pin'?'password':'text',dataset:{},value,selectionStart:3,selectionEnd:5,disabled:false,readOnly:false,isConnected:true,matches:()=>true,closest:()=>null,focus(){document.activeElement=this;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},dispatchEvent(event){if(event.type==='change')context.onRoomChange(this);}});
 const typed=id==='room-relay-url'?'wss://edited.example/':id==='room-nick'?'Draft nickname':'482913';field=input(typed);document.activeElement=field;
 const context={document,app:{contains:node=>node===field,querySelectorAll:()=>[]},route:surface==='main'?'room':'draft',companionTab:'room',windowLayout:{docked:surface==='side'},history:{state:{current:'own'}},replacingApp:false,
  saved:{preferences:{roomNick:'Saved nickname',relayUrl:'wss://saved.example'}},roomRelayUrl:typed,sanitizeNick,normalizeRelayUrl,Event,persist(){saves++;},
  old:{dataset:{focusScope:'same'}},focusScope:'same',client:{},clientRenderIdentity:()=>'',historyTooltips:{close(){}},ongoingTooltips:{close(){}},roomMarkup:()=>'',
  replaceInput(){const old=field;context.onRoomChange(old);old.isConnected=false;field=missing?null:input(id==='room-nick'?context.saved.preferences.roomNick:typed);if(field){field.selectionStart=field.selectionEnd=0;if(readonly){field.value='Detected#Game';field.readOnly=true;}}document.activeElement=null;},
 };
 Object.defineProperty(context.app,'innerHTML',{set(){context.replaceInput();}});vm.createContext(context);vm.runInContext('function onRoomChange(el){'+change+'}',context);
 const draftEvents=source.split('\n').find(line=>line.startsWith("for(const type of ['focusout','keydown'])document.addEventListener")&&line.includes('restoredChangeDraft'));if(draftEvents)vm.runInContext(draftEvents,context);
 const render=()=>vm.runInContext('(function(){'+capture+(surface==='side'?sideCapture+sidePaint+sideRestore:mainPaint+restore)+'})()',context);
 return {context,render,typed,emit(type,extra={}){let prevented=false;listeners.get(type)?.({type,key:'Enter',target:field,preventDefault(){prevented=true;},...extra});return {prevented};},get field(){return field;},get saves(){return saves;}};
}
for(const surface of ['main','side'])for(const id of ['room-nick','room-relay-url','room-relay-room','room-invite','room-pin'])test(`${surface} room update preserves unfinished ${id}, focus and caret without saving`,()=>{
 const f=fixture(surface,id);f.render();assert.equal(f.field.value,f.typed);assert.equal(f.context.document.activeElement,f.field);assert.equal(f.field.selectionStart,3);assert.equal(f.field.selectionEnd,5);assert.equal(f.saves,0);assert.equal(f.context.saved.preferences.roomNick,'Saved nickname');assert.equal(f.context.saved.preferences.relayUrl,'wss://saved.example');
});
for(const surface of ['main','side'])test(`${surface} does not recreate room fields after a successful join`,()=>{
 const f=fixture(surface,'room-nick',{missing:true});f.render();assert.equal(f.field,null);assert.equal(f.context.document.activeElement,null);assert.equal(f.saves,0);
});
for(const surface of ['main','side'])test(`${surface} nickname drafts never replace a newly detected readonly game name`,()=>{
 const f=fixture(surface,'room-nick',{readonly:true});f.render();assert.equal(f.field.value,'Detected#Game');assert.equal(f.saves,0);
});
for(const id of ['room-nick','room-relay-url'])test(`a connected ${id} normal change still saves the explicit edit`,()=>{
 const f=fixture('main',id);f.context.onRoomChange(f.field);assert.equal(f.saves,1);assert.equal(id==='room-nick'?f.context.saved.preferences.roomNick:f.context.saved.preferences.relayUrl,id==='room-nick'?f.typed:normalizeRelayUrl(f.typed));
});
for(const surface of ['main','side'])for(const id of ['room-nick','room-relay-url'])for(const type of ['focusout','keydown'])test(`${surface} restored ${id} commits once on ${type==='focusout'?'real blur':'Enter'}`,()=>{
 const f=fixture(surface,id);f.render();assert.equal(f.saves,0);f.emit(type);assert.equal(f.saves,1,'The explicit event must commit the retained draft');f.emit('focusout');f.context.onRoomChange(f.field);
 assert.equal(f.saves,1);assert.equal(id==='room-nick'?f.context.saved.preferences.roomNick:f.context.saved.preferences.relayUrl,id==='room-nick'?f.typed:normalizeRelayUrl(f.typed));
});
for(const surface of ['main','side'])for(const id of ['room-nick','room-relay-url'])for(const ime of [{isComposing:true},{keyCode:229}])test(`${surface} restored ${id} leaves IME ${ime.isComposing?'composition':'key 229'} Enter untouched`,()=>{
 const f=fixture(surface,id);f.render();const event=f.emit('keydown',ime);assert.equal(event.prevented,false);assert.equal(f.saves,0);assert.equal(f.field.restoredChangeDraft,true);
 f.emit('keydown',{isComposing:false,keyCode:13});f.emit('focusout');assert.equal(f.saves,1);
});
for(const dirty of [true,false])test(`a restored draft ${dirty?'preserves the following action through blur saving':'does not hold unrelated button paints'}`,()=>{
 const handlers=new Map(),timers=new Map(),button={isConnected:true,disabled:false,closest:()=>button};let sequence=0,captured=0;
 const document={activeElement:{restoredChangeDraft:dirty},addEventListener(type,handler){handlers.set(type,handler);},defaultView:{addEventListener(){}}},context={document,app:{contains:node=>node===button},renderInteraction:{defer:()=>false},holdRenderDuringPointer:options=>holdRenderDuringPointer({...options,setTimer:handler=>{timers.set(++sequence,handler);return sequence;},clearTimer:key=>timers.delete(key)}),paint(){button.isConnected=false;}};
 vm.createContext(context);const guard=slice('function render(){',' const poolTab=').replace('function render(){','');context.render=()=>vm.runInContext('(function(){'+guard+'paint();})()',context);
 const binding=source.split('\n').find(line=>line.startsWith('const restoredDraftRenderInteraction='));if(binding)vm.runInContext(binding,context);
 handlers.get('pointerdown')?.({target:button,button:0,isPrimary:true});context.render();assert.equal(button.isConnected,dirty);
 if(dirty){handlers.get('pointerup')?.({target:button});handlers.get('click')?.({target:button});if(button.isConnected)captured++;for(const timer of timers.values())timer();assert.equal(captured,1);assert.equal(button.isConnected,false);}
});
