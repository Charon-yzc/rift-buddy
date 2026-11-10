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
