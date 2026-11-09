import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {normalizeMirrorBase} from '../src/core/app-update.mjs';
import {feedbackDialog} from '../src/feedback-view.mjs';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const deferred=()=>Promise.withResolvers();

for(const id of ['update-mirror','catalog-url'])test(`background data status preserves unfinished ${id} and its caret`,()=>{
 const typed='https://editing.example/path',old='https://saved.example';let field,focused;
 const document={activeElement:null,getElementById:key=>key===id?field:null};
 const input=value=>({tagName:'INPUT',id,type:'url',dataset:{},value,selectionStart:12,selectionEnd:19,disabled:false,matches:()=>true,focus(){document.activeElement=this;focused=this;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}});
 field=input(typed);document.activeElement=field;
 const capture=source.slice(source.indexOf(' const formFocus='),source.indexOf(' const rankingFocus='));
 const restore=source.slice(source.indexOf('  if(formFocus){'),source.indexOf('  restoreItemReferenceFocus('));
 const accept=source.slice(source.indexOf('function acceptDataState('),source.indexOf('function acceptSharedData('));
 const context={document,app:{contains:node=>node===field},route:'settings',history:{state:{current:'own'}},dataReady:true,bindPlayerBuildPreferences(){},render(){vm.runInContext(`(function(){${capture}\nreplaceInput();${restore}})()`,context);},replaceInput(){field=input(old);field.selectionStart=field.selectionEnd=0;document.activeElement=null;}};
 vm.createContext(context);vm.runInContext(accept,context);context.change={origin:'remote',statusOnly:true,keys:['dataFeed'],data:{dataFeed:{phase:'checking'}}};vm.runInContext('acceptDataState(change)',context);
 assert.equal(field.value,typed);assert.equal(focused,field);assert.equal(field.selectionStart,12);assert.equal(field.selectionEnd,19);
});

test('replacing settings ignores the native URL change emitted during DOM removal',()=>{
 let field,saves=0,nestedRenders=0;const document={activeElement:null,getElementById:()=>field},input=value=>({tagName:'INPUT',id:'update-mirror',type:'url',dataset:{},value,selectionStart:23,selectionEnd:23,disabled:false,matches:()=>true,closest:()=>null,focus(){document.activeElement=this;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}});
 field=input('https://example.test/draft');document.activeElement=field;
 const context={document,replacingApp:false,app:{contains:node=>node===field,querySelector:()=>null},route:'settings',history:{state:{current:'own'}},saved:{preferences:{updateMirror:'https://old.example'}},normalizeMirrorBase,render(){nestedRenders++;},persist(){saves++;return Promise.resolve();},toast(){},captureScroll:()=>new Map(),historyTooltips:{close(){}},ongoingTooltips:{close(){}},icon:()=>'',mainNavigation:()=>'',mainWindowActions:()=>'',clientConnectionNotice:()=>'',client:{},syncing:false,nav:[['settings','数据与连接']],e:String,stateRecoveryView:()=>'',stateRecovery:null,boot:{version:'0.59.56'},renderSettings:()=>'',vueRoutes:{render(){context.onMirrorChange(field);field=input('https://old.example');document.activeElement=null;}}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function checkAppUpdate('),source.indexOf('async function installAppUpdate(')),context);
 const changeStart=source.indexOf("if(el.id==='update-mirror')"),changeEnd=source.indexOf("if(['play-difficulty'",changeStart);vm.runInContext('function onMirrorChange(el){'+source.slice(changeStart,changeEnd)+'}',context);
 const capture=source.slice(source.indexOf(' const formFocus='),source.indexOf(' const rankingFocus=')),paintStart=source.indexOf('   const keptScroll=captureScroll(app);'),paint=source.slice(paintStart,source.indexOf(' const navigation=app.querySelector',paintStart)),restore=source.slice(source.indexOf('  if(formFocus){'),source.indexOf('  restoreItemReferenceFocus('));assert(paintStart>0);
 vm.runInContext('(function(){'+capture+paint+restore+'})()',context);
 assert.equal(saves,0,'background painting must not commit an unfinished URL');assert.equal(nestedRenders,0,'the removal change must not reenter rendering');assert.equal(document.activeElement,field);assert.equal(field.value,'https://example.test/draft');assert.equal(field.selectionStart,23);assert.equal(field.selectionEnd,23);
});

test('a held source select resumes painting after selection and keeps the accepted choice',()=>{
 const select={isConnected:true,value:'global'},timers=[],listeners=new Map();let paints=0;
 const context={activeAppSelect:select,pendingAppRender:false,renderedSelectContext:'settings',selectContext:'settings',appSelectVersion:0,app:{contains:node=>node===select},currentMatchupSelect:()=>true,setTimeout:fn=>timers.push(fn),document:{addEventListener:(name,fn)=>listeners.set(name,fn)},render(){vm.runInContext('(function(){'+guard+'activeAppSelect=null;pendingAppRender=false;paint();})()',context);},paint(){paints++;}};
 const guard=source.slice(source.indexOf(' if(activeAppSelect?.isConnected'),source.indexOf(' const itemReferenceFocus=',source.indexOf(' if(activeAppSelect?.isConnected')));
 vm.createContext(context);context.render();assert.equal(paints,0);assert.equal(context.pendingAppRender,true);
 const listener=source.split('\n').find(line=>line.startsWith("document.addEventListener('change',event=>{if(event.target===activeAppSelect)"));vm.runInContext(listener,context);
 select.value='kr';listeners.get('change')({target:select});assert.equal(context.activeAppSelect,null);assert.equal(timers.length,1);timers.shift()();assert.equal(paints,1);assert.equal(context.pendingAppRender,false);assert.equal(select.value,'kr');
 context.render();assert.equal(paints,2,'background status must continue painting after selection');
});

function updateFixture(){
 let gate=deferred(),mainMirror='https://old.example';const downloads=[],notices=[];
 const context={replacingApp:false,appUpdate:{phase:'available',release:{version:'0.59.57'}},saved:{preferences:{updateMirror:mainMirror}},normalizeMirrorBase,render(){},toast:(...args)=>notices.push(args),persist:()=>{const requested=context.saved.preferences.updateMirror,waiting=gate;return waiting.promise.then(()=>{mainMirror=requested;});},api:{downloadAppUpdate:async()=>downloads.push(mainMirror)}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('async function checkAppUpdate('),source.indexOf('async function installAppUpdate(')),context);
 const start=source.indexOf("else if(action==='app-update-mirror-preset')"),end=source.indexOf("else if(action==='app-update-mirror-clear')",start);
 const branch=source.slice(start,end).replace(/^else if\(action==='app-update-mirror-preset'\)/,'');
 vm.runInContext('async function chooseMirror(value){const el={dataset:{url:value}};'+branch+'}',context);
 const clearStart=source.indexOf("else if(action==='app-update-mirror-clear')"),clearEnd=source.indexOf("else if(action==='refresh-pairs')",clearStart),clearBranch=source.slice(clearStart,clearEnd).replace(/^else if\(action==='app-update-mirror-clear'\)/,'');vm.runInContext('async function clearMirror(){'+clearBranch+'}',context);
 const inputStart=source.indexOf("if(el.id==='update-mirror')"),inputEnd=source.indexOf("if(['play-difficulty'",inputStart);vm.runInContext('function typeMirror(value){const el={id:"update-mirror",value};'+source.slice(inputStart,inputEnd)+'}',context);
 return {context,downloads,notices,gate:()=>gate,nextGate(){gate=deferred();return gate;}};
}

test('download waits for the selected source to finish saving before invoking IPC',async()=>{
 const f=updateFixture(),choice=f.context.chooseMirror('https://gitee.com/legender134/rift-buddy'),download=f.context.downloadAppUpdate();
 await Promise.resolve();assert.deepEqual(f.downloads,[]);
 f.gate().resolve();await choice;await download;
 assert.deepEqual(f.downloads,['https://gitee.com/legender134/rift-buddy']);
});

for(const action of ['clearMirror','typeMirror'])test(`download also waits for ${action} saving`,async()=>{
 const f=updateFixture(),choice=f.context[action]('https://typed.example/'),download=f.context.downloadAppUpdate();await Promise.resolve();assert.deepEqual(f.downloads,[]);f.gate().resolve();await choice;await download;assert.deepEqual(f.downloads,[action==='clearMirror'?'':'https://typed.example']);
});

test('failed source saving blocks that download and does not poison a later choice',async()=>{
 const f=updateFixture(),choice=f.context.chooseMirror('https://new.example'),choiceFailure=assert.rejects(choice,/disk unavailable/),download=f.context.downloadAppUpdate();
 await Promise.resolve();assert.deepEqual(f.downloads,[]);f.gate().reject(Error('disk unavailable'));await choiceFailure;await download;
 assert.deepEqual(f.downloads,[]);assert.equal(f.context.appUpdate.phase,'error');assert.match(f.context.appUpdate.error,/disk unavailable/);assert(f.notices.some(([message])=>message.includes('disk unavailable')));
 const gate=f.nextGate(),next=f.context.chooseMirror('https://working.example');gate.resolve();await next;f.context.appUpdate.phase='available';await f.context.downloadAppUpdate();assert.deepEqual(f.downloads,['https://working.example']);
});

for(const destination of ['closed','feedback'])test(`late window reset keeps the ${destination} overlay instead of reopening settings`,async()=>{
 const gate=deferred(),entered=deferred(),overlay={firstElementChild:{kind:'settings'},html:'settings',set innerHTML(value){this.html=value;this.firstElementChild=value?{}:null;},get innerHTML(){return this.html;}};
 const context={action:'window-reset-side',overlay,saveChain:Promise.resolve(),saved:{preferences:{}},savedBase:{preferences:{}},windowLayout:{custom:true},api:{windowLayoutControl:()=>{entered.resolve();return gate.promise;}},acceptWindowLayout(value){context.windowLayout=value;},playerFlowSettings:()=>'<section>settings reopened</section>',toast(){}};
 const start=source.indexOf(" if(['window-follow','window-reset-side','window-reset-all'].includes(action))"),end=source.indexOf(" if(action==='player-flow-toggle')",start);assert(start>0&&end>start);vm.createContext(context);vm.runInContext('async function reset(){'+source.slice(start,end)+'}',context);
 const request=context.reset();await entered.promise;overlay.innerHTML=destination==='closed'?'':feedbackDialog({text:'保留图文草稿',images:[{id:'selected-image',preview:'data:image/png;base64,AAAA'}]});const expected=overlay.innerHTML;
 gate.resolve({custom:false});await request;assert.equal(context.windowLayout.custom,false,'the requested window operation still takes effect');assert.equal(overlay.innerHTML,expected);
});
