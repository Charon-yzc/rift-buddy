import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRecommendationRunner} from '../src/recommendation-runner.mjs';
import {orderRecommendationPage} from '../src/core/recommendation-policy.mjs';

function fixture(){
 const workers=[],timers=new Map();let timerId=0,constructionError=false;
 const runner=createRecommendationRunner(()=>{
  if(constructionError)throw Error('worker construction failed');
  const worker={sent:[],terminated:0,postMessage(value){if(this.sendError)throw Error('cannot clone');this.sent.push(structuredClone(value));},terminate(){this.terminated++;}};workers.push(worker);return worker;
 },{setTimer:callback=>{const id=++timerId;timers.set(id,callback);return id;},clearTimer:id=>timers.delete(id)});
 const input={catalog:{version:'same',duos:[{name:'original'}]},slots:[{role:'mid',champion:'Ahri'}],offset:0};
 const reply=(worker,index=worker.sent.length-1,results=[{id:'candidate'}])=>worker.onmessage({data:{requestId:worker.sent[index].requestId,results}});
 return {runner,workers,timers,input,reply,failConstruction:()=>constructionError=true,allowConstruction:()=>constructionError=false};
}
test('successful calculations reuse one worker and initialize an unchanged catalog once',async t=>{
 const f=fixture();t.after(()=>f.runner.dispose());
 const first=f.runner.run(f.input);f.reply(f.workers[0]);await first.promise;
 const second=f.runner.run({...f.input,offset:6,slots:[{role:'mid',champion:'Lux'}],catalog:structuredClone(f.input.catalog)});
 assert.equal(f.workers.length,1);const message=f.workers[0].sent[1];assert.equal(message.initialize,false);assert.equal(Object.hasOwn(message.input,'catalog'),false);assert.equal(message.input.offset,6);assert.equal(message.input.slots[0].champion,'Lux');
 f.reply(f.workers[0]);await second.promise;assert.equal(f.workers[0].sent[0].initialize,true);assert.equal(f.workers[0].terminated,0);assert.equal(f.timers.size,1);
});
test('same-version in-place catalog edits initialize again, and every request carries fresh builds',async t=>{
 const f=fixture();t.after(()=>f.runner.dispose());const first=f.runner.run({...f.input,builds:{revision:1}});f.reply(f.workers[0]);await first.promise;
 f.input.catalog.duos[0].name='edited without version bump';const second=f.runner.run({...f.input,builds:{revision:2}}),message=f.workers[0].sent[1];
 assert.equal(message.initialize,true);assert.equal(message.input.catalog.duos[0].name,'edited without version bump');assert.equal(message.input.builds.revision,2);f.reply(f.workers[0]);await second.promise;
});
test('active cancellation terminates CPU work and late results/errors cannot settle its replacement',async t=>{
 const f=fixture();t.after(()=>f.runner.dispose());const first=f.runner.run(f.input),old=f.workers[0],lateMessage=old.onmessage,lateError=old.onerror,oldId=old.sent[0].requestId;
 const rejected=assert.rejects(first.promise,error=>error.cancelled===true);first.cancel();await rejected;assert.equal(old.terminated,1);
 const second=f.runner.run(f.input),current=f.workers[1];let settled=false;second.promise.then(()=>settled=true);
 lateMessage({data:{requestId:oldId,results:[{id:'old'}]}});lateError({message:'late crash'});current.onmessage({data:{requestId:oldId,results:[{id:'wrong request'}]}});await Promise.resolve();assert.equal(settled,false);assert.equal(current.terminated,0);
 f.reply(current,0,[{id:'latest'}]);assert.deepEqual(await second.promise,[{id:'latest'}]);first.cancel();assert.equal(current.terminated,0);
});
test('a replacement run cancels unfinished work and duplicate successful messages are ignored',async t=>{
 const f=fixture();t.after(()=>f.runner.dispose());const first=f.runner.run(f.input),rejected=assert.rejects(first.promise,error=>error.cancelled===true);
 const second=f.runner.run({...f.input,replace:{role:'mid',result:{id:'previous'}}});await rejected;assert.equal(f.workers[0].terminated,1);assert.equal(f.workers[1].sent[0].input.replace.role,'mid');
 const done=f.workers[1].onmessage,oldId=f.workers[1].sent[0].requestId;f.reply(f.workers[1]);await second.promise;
 const third=f.runner.run({...f.input,offset:12});let settled=false;third.promise.then(()=>settled=true);done({data:{requestId:oldId,results:[{id:'duplicate'}]}});await Promise.resolve();assert.equal(settled,false);f.reply(f.workers[1]);await third.promise;
});
test('construction, postMessage, worker and decode errors reject once and permit a clean retry',async t=>{
 const f=fixture();t.after(()=>f.runner.dispose());f.failConstruction();await assert.rejects(f.runner.run(f.input).promise,/construction/);f.allowConstruction();
 const first=f.runner.run(f.input),old=f.workers[0];old.onerror({message:'worker failed'});await assert.rejects(first.promise,/未完成/);assert.equal(old.terminated,1);
 const second=f.runner.run(f.input),current=f.workers[1];current.onmessageerror({});await assert.rejects(second.promise,/未完成/);assert.equal(current.terminated,1);
 const third=f.runner.run(f.input);f.reply(f.workers[2]);await third.promise;f.workers[2].sendError=true;await assert.rejects(f.runner.run(f.input).promise,/cannot clone/);assert.equal(f.workers[2].terminated,1);
 const fourth=f.runner.run(f.input);f.workers[3].onmessage({data:{requestId:f.workers[3].sent[0].requestId,error:'invalid catalog'}});await assert.rejects(fourth.promise,/invalid catalog/);assert.equal(f.workers[3].terminated,1);
 const fifth=f.runner.run(f.input);assert.equal(f.workers[4].sent[0].initialize,true);f.reply(f.workers[4]);await fifth.promise;
});
test('idle expiry and disposal release the only worker; disposal settles active work',async()=>{
 const f=fixture();const first=f.runner.run(f.input);f.reply(f.workers[0]);await first.promise;assert.equal(f.timers.size,1);[...f.timers.values()][0]();assert.equal(f.workers[0].terminated,1);
 const second=f.runner.run(f.input),rejected=assert.rejects(second.promise,error=>error.cancelled===true);f.runner.dispose();await rejected;assert.equal(f.workers[1].terminated,1);assert.equal(f.timers.size,0);
});
test('a worker that crashes while idle is discarded before the next calculation',async t=>{
 const f=fixture();t.after(()=>f.runner.dispose());const first=f.runner.run(f.input);f.reply(f.workers[0]);await first.promise;f.workers[0].onerror({message:'idle worker crashed'});assert.equal(f.workers[0].terminated,1);assert.equal(f.timers.size,0);
 const next=f.runner.run(f.input);assert.equal(f.workers.length,2);assert.equal(f.workers[1].sent[0].initialize,true);f.reply(f.workers[1]);await next.promise;
});
test('an unserializable catalog rejects without leaving a pending task or reusable old worker',async t=>{
 const f=fixture();t.after(()=>f.runner.dispose());const first=f.runner.run(f.input);f.reply(f.workers[0]);await first.promise;
 const cycle={};cycle.self=cycle;await assert.rejects(f.runner.run({...f.input,catalog:cycle}).promise,/circular/i);assert.equal(f.workers[0].terminated,1);
 const next=f.runner.run(f.input);assert.equal(f.workers[1].sent[0].initialize,true);f.reply(f.workers[1]);await next.promise;
});
test('actual worker entry configures a changed catalog and preserves request identity on errors',async()=>{
 const source=await fs.readFile(new URL('../src/recommend-worker.mjs',import.meta.url),'utf8'),messages=[],calls=[];
 const context=vm.createContext({orderRecommendationPage,self:{postMessage:message=>messages.push(message)},BUNDLED_CATALOG:{version:'bundled'},configureCatalog:catalog=>{calls.push(catalog);if(catalog.invalid)throw Error('invalid catalog');},recommend:input=>{assert.equal(input.minimumFitScore,60);assert.equal(input.stylePolicy,true);return [{id:input.offset}];},replaceMember:(result,role,input)=>[{id:result.id,role,offset:input.offset}]});
 vm.runInContext(source.replace(/^import .*;\r?\n/gm,''),context);
 context.self.onmessage({data:{requestId:1,initialize:true,input:{catalog:{version:'one'},offset:0}}});context.self.onmessage({data:{requestId:2,initialize:false,input:{offset:6}}});
 assert.equal(calls.length,1);assert.equal(messages[1].requestId,2);assert.equal(messages[1].results[0].id,6);
 context.self.onmessage({data:{requestId:3,initialize:true,input:{catalog:{invalid:true}}}});assert.equal(messages[2].requestId,3);assert.equal(messages[2].error,'invalid catalog');
 context.self.onmessage({data:{requestId:4,initialize:true,input:{catalog:{version:'two'},replace:{result:{id:'chosen'},role:'support'},offset:12}}});assert.equal(calls.length,3);assert.equal(messages[3].results[0].id,'chosen');assert.equal(messages[3].results[0].role,'support');
});
test('application calculation and cancellation keep the latest task through old promise cleanup',async t=>{
 const f=fixture();t.after(()=>f.runner.dispose());const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
 const calculate=source.slice(source.indexOf('function calculateRecommendation(input){'),source.indexOf('async function generate(next=false,automatic=false)'));
 const cancel=source.match(/function cancelRecommendation\(\)\{[^\n]+\}/)[0];
 const context=vm.createContext({recommendationRunner:f.runner,activeRecommendation:null,recommendationRun:0,autoRecommendationKey:'old',generating:true,cancelRecommendationReveal:()=>{}});vm.runInContext(calculate+cancel,context);
 const first=context.calculateRecommendation(f.input),rejected=assert.rejects(first,error=>error.cancelled===true);context.cancelRecommendation();
 const second=context.calculateRecommendation({...f.input,replace:{role:'support',result:{id:'proposal'}}}),active=context.activeRecommendation;await rejected;assert.equal(context.activeRecommendation,active);assert.equal(context.generating,false);
 f.reply(f.workers[1],0,[{id:'replacement'}]);assert.deepEqual(await second,[{id:'replacement'}]);assert.equal(context.activeRecommendation,null);
 const third=context.calculateRecommendation(f.input);assert.equal(f.workers.length,2);f.reply(f.workers[1]);await third;assert.equal(context.activeRecommendation,null);
});
