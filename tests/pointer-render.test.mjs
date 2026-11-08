import test from 'node:test';
import assert from 'node:assert/strict';
import {holdRenderDuringPointer} from '../src/pointer-render.mjs';
function fixture(action='build'){
 const listeners=new Map(),tasks=new Map();let id=0,painted=0;
 const button={isConnected:true,disabled:false};button.closest=selector=>selector.split(',').some(part=>part.includes(`[data-action="${action}"]`))?button:null;
 const document={addEventListener:(name,fn)=>listeners.set(name,fn),defaultView:{addEventListener:(name,fn)=>listeners.set(name,fn)}};
 const gate=holdRenderDuringPointer({document,root:{contains:value=>value===button},render:()=>painted++,setTimer:fn=>{tasks.set(++id,fn);return id;},clearTimer:key=>tasks.delete(key)});
 return {gate,button,emit:(name,extra={})=>listeners.get(name)?.({target:button,button:0,...extra}),flush(){const due=[...tasks.values()];tasks.clear();due.forEach(fn=>fn());},get painted(){return painted;}};
}
test('client and recommendation paints cannot remove the pressed hero before its click runs',()=>{
 const f=fixture();f.emit('pointerdown');assert.equal(f.gate.defer(),true);assert.equal(f.gate.defer(),true);
 f.emit('pointerup');assert.equal(f.painted,0);f.emit('click');assert.equal(f.painted,0,'Normal click handlers still see the original target');
 f.flush();assert.equal(f.painted,1);assert.equal(f.gate.defer(),false);
});
test('cancel, release outside and window blur cannot leave painting frozen',()=>{
 for(const action of ['pointercancel','pointerup','blur','dragend']){const f=fixture();f.emit('pointerdown');f.gate.defer();f.emit(action);f.flush();assert.equal(f.painted,1,action);assert.equal(f.gate.defer(),false);}
});
test('right clicks and disabled heroes never hold rendering',()=>{
 const f=fixture();f.emit('pointerdown',{button:2});assert.equal(f.gate.defer(),false);
 f.button.disabled=true;f.emit('pointerdown');assert.equal(f.gate.defer(),false);
});
test('docked candidate portraits are protected; proposal buttons keep their ordinary lifecycle',()=>{
 const docked=fixture('companion-preview');docked.emit('pointerdown');assert.equal(docked.gate.defer(),true);docked.emit('click');docked.flush();assert.equal(docked.painted,1);
 const proposal=fixture('propose-result');proposal.emit('pointerdown');assert.equal(proposal.gate.defer(),false);
});
