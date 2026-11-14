import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
function fixture(){
 const listeners=new Map();let modalClosed=0;
 function trigger(){
  const tip={open:false,style:{},offsetWidth:230,offsetHeight:120,matches:()=>tip.open,showPopover(){tip.open=true;},hidePopover(){tip.open=false;},closest:()=>number};
  const number={querySelector:()=>tip,getBoundingClientRect:()=>({right:320,bottom:220}),closest:()=>number,contains:node=>node===number||node===child||node===tip};
  const child={closest:()=>number};return {tip,number,child};
 }
 const {tip,number,child}=trigger(),second=trigger(),outside={closest:()=>null};
 const document={activeElement:number,addEventListener(name,fn,options){const callbacks=listeners.get(name)||[];callbacks.push({fn,capture:options===true||options?.capture===true});listeners.set(name,callbacks);},querySelectorAll:()=>[tip,second.tip].filter(tip=>tip.open)};
 const overlay={firstElementChild:{},contains:()=>false},context={document,overlay,innerWidth:1050,innerHeight:720,activeOverlaySelect:null,activeAppSelect:null,deferOverlaySelect(){},closeRecommendationMenus:()=>false,closeOverlay(){modalClosed++;overlay.firstElementChild=null;}};
 const tooltipStart=source.indexOf('function positionFitTooltip('),tooltipEnd=source.indexOf("document.addEventListener('change'",tooltipStart);
 const escape=source.split('\n').find(line=>line.startsWith("document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented)"));
 assert.ok(tooltipStart>=0&&tooltipEnd>tooltipStart&&escape);
 vm.runInNewContext(escape+'\n'+source.slice(tooltipStart,tooltipEnd),context);
 const emit=(name,target=number,extra={})=>{
  const event={target,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};
  for(const {fn}of [...listeners.get(name)||[]].sort((a,b)=>Number(b.capture)-Number(a.capture)))fn(event);
  return event;
 };
 return {tip,number,child,second,outside,emit,modalClosed:()=>modalClosed};
}

test('Escape dismisses the fit explanation first and leaves the dialog for a second Escape',()=>{
 const f=fixture();f.emit('focusin');assert.equal(f.tip.open,true);
 const first=f.emit('keydown',f.number,{key:'Escape'});assert.equal(f.tip.open,false);assert.equal(first.defaultPrevented,true);assert.equal(f.modalClosed(),0);
 const second=f.emit('keydown',f.number,{key:'Escape'});assert.equal(second.defaultPrevented,false);assert.equal(f.modalClosed(),1);
});

test('fit explanation keeps pointer and focus lifecycle; ordinary Escape keeps its existing behavior',()=>{
 const f=fixture();f.emit('pointerover');assert.equal(f.tip.open,true);f.emit('pointerout',f.number,{relatedTarget:f.child});assert.equal(f.tip.open,true);
 f.emit('pointerout',f.number,{relatedTarget:f.outside});assert.equal(f.tip.open,false);
 f.emit('focusin');assert.equal(f.tip.open,true);f.emit('keydown',f.number,{key:'ArrowDown'});assert.equal(f.tip.open,true);assert.equal(f.modalClosed(),0);
 f.emit('focusout',f.number,{relatedTarget:f.outside});assert.equal(f.tip.open,false);f.emit('keydown',f.number,{key:'Escape'});assert.equal(f.modalClosed(),1);
});

test('Escape stays dismissed while moving inside the same trigger, then pointer reentry can reopen',()=>{
 const f=fixture();f.emit('pointerover');f.emit('keydown',f.number,{key:'Escape'});
 f.emit('pointermove',f.child);assert.equal(f.tip.open,false);f.emit('pointerover',f.child);assert.equal(f.tip.open,false);
 f.emit('pointerout',f.child,{relatedTarget:f.number});f.emit('pointermove');assert.equal(f.tip.open,false,'Internal trigger transitions do not clear dismissal');
 f.emit('pointerout',f.number,{relatedTarget:f.outside});f.emit('pointerover');assert.equal(f.tip.open,true);
});

test('leaving keyboard focus and entering another trigger reset only the dismissed explanation',()=>{
 const f=fixture();f.emit('focusin');f.emit('keydown',f.number,{key:'Escape'});f.emit('focusin',f.child);assert.equal(f.tip.open,false);
 f.emit('focusout',f.number,{relatedTarget:f.outside});f.emit('focusin');assert.equal(f.tip.open,true,'A new keyboard focus interaction can reopen');
 f.emit('keydown',f.number,{key:'Escape'});f.emit('pointerover',f.second.child);assert.equal(f.second.tip.open,true);assert.equal(f.tip.open,false);
 f.emit('keydown',f.second.number,{key:'Escape'});f.emit('pointermove',f.second.child);assert.equal(f.second.tip.open,false);
 f.emit('pointerover',f.child);assert.equal(f.tip.open,true,'A different trigger is not blocked by the previous dismissal');assert.equal(f.second.tip.open,false);
});
