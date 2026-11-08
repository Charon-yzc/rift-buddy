import test from 'node:test';import assert from 'node:assert/strict';
import {createFeedbackUI} from '../src/feedback-view.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
class Overlay{
 listeners={};html='';
 set innerHTML(value){this.html=value;this.field={id:'feedback-text',value:value.match(/<textarea[^>]*>([^<]*)<\/textarea>/)?.[1]||'',focus(){}};this.send={disabled:/data-action="feedback-send"[^>]*disabled/.test(value)};}
 get innerHTML(){return this.html;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 querySelector(selector){if(!this.html.includes('feedback-dialog'))return null;if(selector==='.feedback-dialog')return {};if(selector==='#feedback-text'||selector==='textarea')return this.field;if(selector==='[data-action="feedback-send"]')return this.send;return null;}
 type(value){this.field.value=value;this.listeners.input({target:this.field});}
}
test('empty feedback cannot be submitted and typing updates availability without replacing the editor',async()=>{
 const overlay=new Overlay();let sent=0;const ui=createFeedbackUI({overlay,api:{feedbackClear:async()=>{},feedbackImages:async()=>[],feedbackSend:async()=>{sent++;return {id:'local'};}}});
 await ui.action('feedback-open');assert.equal(overlay.send.disabled,true);await ui.action('feedback-send');assert.equal(sent,0);
 const field=overlay.field;overlay.type('message');assert.equal(overlay.field,field);assert.equal(overlay.send.disabled,false);overlay.type('  ');assert.equal(overlay.send.disabled,true);await ui.action('feedback-send');assert.equal(sent,0);
});
test('closing while feedback prepares cannot reopen it after the delayed clear finishes',async()=>{
 const overlay=new Overlay(),clear=deferred(),ui=createFeedbackUI({overlay,api:{feedbackClear:()=>clear.promise,feedbackImages:async()=>[]}});
 const opened=ui.action('feedback-open');overlay.innerHTML='';clear.resolve();await opened;assert.equal(overlay.innerHTML,'');
});
test('a late earlier open cannot replace the latest editor or its typed draft',async()=>{
 const overlay=new Overlay(),a=deferred(),b=deferred();let calls=0;const ui=createFeedbackUI({overlay,api:{feedbackClear:()=>++calls===1?a.promise:b.promise,feedbackImages:async()=>[]}});
 const first=ui.action('feedback-open'),second=ui.action('feedback-open');b.resolve();await second;overlay.type('new draft');a.resolve();await first;assert.equal(overlay.field.value,'new draft');assert.equal(overlay.send.disabled,false);
});
test('waiting for a screenshot chooser does not claim feedback is being sent',async()=>{
 const overlay=new Overlay(),images=deferred(),ui=createFeedbackUI({overlay,api:{feedbackClear:async()=>{},feedbackImages:()=>images.promise}});
 await ui.action('feedback-open');overlay.type('draft');const pending=ui.action('feedback-images');assert.equal(overlay.send.disabled,true);assert.ok(!overlay.innerHTML.includes('发送中'));images.resolve([]);await pending;assert.equal(overlay.field.value,'draft');assert.equal(overlay.send.disabled,false);
});
