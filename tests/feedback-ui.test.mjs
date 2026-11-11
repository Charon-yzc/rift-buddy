import test from 'node:test';import assert from 'node:assert/strict';
import {createFeedbackUI} from '../src/feedback-view.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
class Overlay{
 listeners={};html='';ownerDocument={body:{}};controls=[];
 constructor(){this.ownerDocument.activeElement=this.ownerDocument.body;}
 set innerHTML(value){
  if(this.contains(this.ownerDocument.activeElement))this.ownerDocument.activeElement=this.ownerDocument.body;
  this.html=value;const focus=element=>{if(!element.disabled)this.ownerDocument.activeElement=element;};
  const field=value.match(/<textarea([^>]*)>([^<]*)<\/textarea>/);
  this.field=field?{owner:this,id:'feedback-text',value:field[2],disabled:field[1].includes('disabled'),selectionStart:0,selectionEnd:0,selectionDirection:'forward',scrollTop:0,focus(){focus(this);},setSelectionRange(start,end,direction){Object.assign(this,{selectionStart:start,selectionEnd:end,selectionDirection:direction});}}:null;
  this.controls=Array.from(value.matchAll(/<button\b([^>]*)>/g),match=>{const attrs=match[1];return {owner:this,dataset:{action:attrs.match(/data-action="([^"]*)"/)?.[1],id:attrs.match(/data-id="([^"]*)"/)?.[1]},disabled:/\bdisabled\b/.test(attrs),focus(){focus(this);}};});
  this.send=this.controls.find(element=>element.dataset.action==='feedback-send');
 }
 get innerHTML(){return this.html;}
 contains(element){return element?.owner===this;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 querySelector(selector){if(!this.html.includes('feedback-dialog'))return null;if(selector==='.feedback-dialog')return {};if(selector==='#feedback-text'||selector==='textarea')return this.field;const action=selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];return this.controls.find(element=>element.dataset.action===action)||null;}
 querySelectorAll(selector){return selector==='[data-action]'?this.controls:[];}
 type(value){this.field.value=value;this.field.setSelectionRange(value.length,value.length,'forward');this.listeners.input({target:this.field});}
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

test('failed feedback shows its remaining cooldown without replacing the editable draft',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});
 const overlay=new Overlay();let sends=0,retryAt=0;
 const ui=createFeedbackUI({overlay,api:{feedbackClear:async()=>{},feedbackImages:async()=>[],feedbackStatus:async()=>({retryAfterMs:Math.max(0,retryAt-Date.now())}),feedbackSend:async()=>{sends++;retryAt=Date.now()+30000;throw Error('发送未完成，请稍后重试');}}});
 await ui.action('feedback-open');overlay.type('请保留这个问题');await ui.action('feedback-send');
 assert.equal(overlay.send.disabled,true);assert.match(overlay.html,/30 秒后重试/);assert.equal(overlay.field.value,'请保留这个问题');
 const field=overlay.field;overlay.type('继续补充');assert.equal(overlay.send.disabled,true);
 await ui.action('feedback-send');assert.equal(sends,1);
 t.mock.timers.tick(29000);assert.equal(overlay.field,field);assert.equal(overlay.field.value,'继续补充');assert.equal(overlay.send.disabled,true);assert.equal(overlay.send.textContent,'1 秒后重试');
 t.mock.timers.tick(1000);assert.equal(overlay.send.disabled,false);assert.equal(overlay.send.textContent,'发送反馈');
});

test('reopening feedback retains the service cooldown and closing stops its timer',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});
 const overlay=new Overlay(),ui=createFeedbackUI({overlay,api:{feedbackClear:async()=>{},feedbackImages:async()=>[],feedbackStatus:async()=>({retryAfterMs:7000})}});
 await ui.action('feedback-open');overlay.type('still waiting');assert.equal(overlay.send.disabled,true);assert.match(overlay.html,/7 秒后重试/);
 overlay.innerHTML='';t.mock.timers.tick(10000);assert.equal(overlay.innerHTML,'');
});

test('feedback failure shows the player reason without the Electron IPC prefix',async()=>{
 const overlay=new Overlay(),ui=createFeedbackUI({overlay,api:{feedbackClear:async()=>{},feedbackImages:async()=>[],feedbackStatus:async()=>({retryAfterMs:0}),feedbackSend:async()=>{throw new Error("Error invoking remote method 'feedback-send': Error: 发送未完成，请稍后重试");}}});
 await ui.action('feedback-open');overlay.type('保留原始问题');await ui.action('feedback-send');
 assert.match(overlay.html,/<p class="feedback-error" role="alert">发送未完成，请稍后重试<\/p>/);assert.doesNotMatch(overlay.html,/Error invoking remote method|feedback-send&#39;: Error:/);assert.equal(overlay.field.value,'保留原始问题');
});

test('a delayed cooldown reply cannot change a reopened editor or its new draft',async()=>{
 const overlay=new Overlay(),oldStatus=deferred(),entered=deferred();let calls=0;
 const ui=createFeedbackUI({overlay,api:{feedbackClear:async()=>{},feedbackImages:async()=>[],feedbackStatus:()=>{if(++calls===1){entered.resolve();return oldStatus.promise;}return Promise.resolve({retryAfterMs:0});}}});
 const first=ui.action('feedback-open');await entered.promise;overlay.innerHTML='';await ui.action('feedback-open');overlay.type('新弹窗的草稿');const field=overlay.field;
 oldStatus.resolve({retryAfterMs:30000});await first;
 assert.equal(overlay.field,field);assert.equal(overlay.field.value,'新弹窗的草稿');assert.equal(overlay.send.disabled,false);assert.doesNotMatch(overlay.html,/秒后重试/);
});

test('cancelling the screenshot chooser preserves the editor range and returns focus to the chooser button',async()=>{
 const overlay=new Overlay(),images=deferred(),ui=createFeedbackUI({overlay,api:{feedbackClear:async()=>{},feedbackImages:()=>images.promise}});
 await ui.action('feedback-open');overlay.type('继续补充这里的问题');overlay.field.setSelectionRange(2,5,'backward');overlay.field.scrollTop=24;
 overlay.querySelector('[data-action="feedback-images"]').focus();const pending=ui.action('feedback-images');assert.equal(overlay.ownerDocument.activeElement,overlay.ownerDocument.body);
 images.resolve(null);await pending;
 assert.equal(overlay.field.value,'继续补充这里的问题');assert.deepEqual([overlay.field.selectionStart,overlay.field.selectionEnd,overlay.field.selectionDirection,overlay.field.scrollTop],[2,5,'backward',24]);
 assert.equal(overlay.ownerDocument.activeElement,overlay.querySelector('[data-action="feedback-images"]'));
});

test('removing the focused screenshot keeps focus in feedback and retains the editor selection',async()=>{
 const overlay=new Overlay(),ui=createFeedbackUI({overlay,api:{feedbackClear:async()=>{},feedbackImages:async()=>[{id:'selected',preview:'data:image/png;base64,'}]}});
 await ui.action('feedback-open');overlay.type('仅移除截图');await ui.action('feedback-images');overlay.field.setSelectionRange(1,3,'forward');
 const remove=overlay.querySelector('[data-action="feedback-remove"]');remove.focus();await ui.action('feedback-remove',remove);
 assert.doesNotMatch(overlay.html,/<figure>/);assert.equal(overlay.field.value,'仅移除截图');assert.deepEqual([overlay.field.selectionStart,overlay.field.selectionEnd],[1,3]);
 assert.equal(overlay.ownerDocument.activeElement,overlay.querySelector('[data-action="feedback-images"]'));assert.equal(overlay.send.disabled,false);
});

for(const target of ['close','outside'])test(`screenshot completion respects focus moved to ${target} while waiting`,async()=>{
 const overlay=new Overlay(),images=deferred(),ui=createFeedbackUI({overlay,api:{feedbackClear:async()=>{},feedbackImages:()=>images.promise}});
 await ui.action('feedback-open');overlay.querySelector('[data-action="feedback-images"]').focus();const pending=ui.action('feedback-images');
 const outside={};if(target==='close')overlay.querySelector('[data-action="close"]').focus();else overlay.ownerDocument.activeElement=outside;
 images.resolve(null);await pending;
 assert.equal(overlay.ownerDocument.activeElement,target==='close'?overlay.querySelector('[data-action="close"]'):outside);
});

test('failed submission restores the editor selection when cooldown disables the send button',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const overlay=new Overlay(),ui=createFeedbackUI({overlay,api:{feedbackClear:async()=>{},feedbackImages:async()=>[],feedbackStatus:async()=>({retryAfterMs:1000}),feedbackSend:async()=>{throw Error('稍后重试');}}});
 await ui.action('feedback-open');t.mock.timers.tick(1000);overlay.type('补充失败的反馈');overlay.field.setSelectionRange(1,4,'backward');overlay.send.focus();await ui.action('feedback-send');
 const field=overlay.field;assert.equal(overlay.ownerDocument.activeElement,field);assert.equal(overlay.send.disabled,true);assert.deepEqual([field.selectionStart,field.selectionEnd,field.selectionDirection],[1,4,'backward']);
 t.mock.timers.tick(1000);assert.equal(overlay.field,field);assert.equal(overlay.ownerDocument.activeElement,field);assert.equal(overlay.send.disabled,false);
});

test('successful feedback focuses its remaining close control',async()=>{
 const overlay=new Overlay(),ui=createFeedbackUI({overlay,api:{feedbackClear:async()=>{},feedbackImages:async()=>[],feedbackSend:async()=>({id:'receipt'})}});
 await ui.action('feedback-open');overlay.type('已发送的问题');overlay.send.focus();await ui.action('feedback-send');
 assert.match(overlay.html,/已收到/);assert.equal(overlay.ownerDocument.activeElement,overlay.querySelector('[data-action="close"]'));
});

for(const phase of ['clear','status'])for(const destination of ['close','outside','launcher','replacement','closed'])test(`opening after delayed ${phase} respects ${destination} focus`,async()=>{
 const overlay=new Overlay(),gate=deferred(),entered=deferred(),launcher={id:'feedback-launcher'},outside={id:'outside'},replacement='<section class="other-dialog">another editor</section>';
 overlay.ownerDocument.activeElement=launcher;
 const ui=createFeedbackUI({overlay,api:{feedbackImages:async()=>[],feedbackClear:()=>{if(phase==='clear'){entered.resolve();return gate.promise;}},feedbackStatus:()=>{if(phase==='status'){entered.resolve();return gate.promise;}return Promise.resolve({retryAfterMs:0});}}});
 const opening=ui.action('feedback-open');await entered.promise;
 if(destination==='close')overlay.querySelector('[data-action="close"]').focus();
 if(destination==='outside')overlay.ownerDocument.activeElement=outside;
 if(destination==='replacement'){overlay.innerHTML=replacement;overlay.ownerDocument.activeElement=outside;}
 if(destination==='closed')overlay.innerHTML='';
 gate.resolve(phase==='status'?{retryAfterMs:0}:undefined);await opening;
 if(destination==='close')assert.equal(overlay.ownerDocument.activeElement,overlay.querySelector('[data-action="close"]'));
 if(destination==='outside'||destination==='replacement')assert.equal(overlay.ownerDocument.activeElement,outside);
 if(destination==='launcher')assert.equal(overlay.ownerDocument.activeElement,overlay.field);
 if(destination==='replacement'||destination==='closed')assert.equal(overlay.innerHTML,destination==='replacement'?replacement:'');
});
