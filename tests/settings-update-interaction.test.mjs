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
 const context={document,replacingApp:false,app:{contains:node=>node===field,querySelector:()=>null},route:'settings',history:{state:{current:'own'}},saved:{preferences:{updateMirror:'https://old.example'}},normalizeMirrorBase,render(){nestedRenders++;},persist(){saves++;return Promise.resolve();},toast(){},captureScroll:()=>new Map(),historyTooltips:{close(){}},ongoingTooltips:{close(){}},icon:()=>'',mainNavigation:()=>'',mainWindowActions:()=>'',clientConnectionNotice:()=>'',client:{},syncing:false,manualSyncing:false,nav:[['settings','数据与连接']],e:String,stateRecoveryView:()=>'',stateRecovery:null,boot:{version:'0.59.56'},renderSettings:()=>'',vueRoutes:{render(){context.onMirrorChange(field);field=input('https://old.example');document.activeElement=null;}}};
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
test('a source failure that settled before the download click still blocks the old source until a new choice succeeds',async()=>{
 const f=updateFixture(),choice=f.context.chooseMirror('https://broken.example'),failed=assert.rejects(choice,/settled disk failure/);f.gate().reject(Error('settled disk failure'));await failed;
 await f.context.downloadAppUpdate();assert.deepEqual(f.downloads,[]);assert.match(f.context.appUpdate.error,/settled disk failure/);
 const gate=f.nextGate(),next=f.context.chooseMirror('https://recovered.example');gate.resolve();await next;f.context.appUpdate.phase='available';await f.context.downloadAppUpdate();assert.deepEqual(f.downloads,['https://recovered.example']);
});
test('a reported source failure does not permanently block a new explicit download after recovery',async()=>{
 const f=updateFixture(),choice=f.context.chooseMirror('https://broken.example'),failed=assert.rejects(choice,/disk failed/);f.gate().reject(Error('disk failed'));await failed;
 await f.context.downloadAppUpdate();assert.deepEqual(f.downloads,[]);assert.equal(f.context.appUpdate.phase,'error');
 f.context.saved.preferences.updateMirror='https://old.example';f.context.appUpdate={phase:'available',release:{version:'0.59.57'}};await f.context.downloadAppUpdate();assert.deepEqual(f.downloads,['https://old.example']);
});

function restoredMirrorFixture(){
 const f=updateFixture(),c=f.context,listeners=new Map();let field;
 const input=value=>({id:'update-mirror',tagName:'INPUT',type:'url',dataset:{},value,selectionStart:12,selectionEnd:12,isConnected:true,readOnly:false,disabled:false,matches:()=>true,focus(){c.document.activeElement=this;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},dispatchEvent(event){if(event.type==='change')c.onRestoredMirrorChange(this);}});
 field=input('https://new-source.example');Object.assign(c,{route:'settings',history:{state:{current:'own'}},windowLayout:{docked:false},Event,document:{activeElement:field,getElementById:()=>field,addEventListener:(type,handler)=>listeners.set(type,handler)},app:{contains:node=>node===field},replaceInput(){field.isConnected=false;field=input('https://old.example');c.document.activeElement=null;}});
 const start=source.indexOf("if(el.id==='update-mirror')"),end=source.indexOf("if(['play-difficulty'",start);vm.runInContext('function onRestoredMirrorChange(el){'+source.slice(start,end)+'}',c);
 const listener=source.split('\n').find(line=>line.startsWith("for(const type of ['focusout','keydown'])document.addEventListener"));if(listener)vm.runInContext(listener,c);
 const capture=source.slice(source.indexOf(' const formFocus='),source.indexOf(' const rankingFocus=')),restore=source.slice(source.indexOf('  if(formFocus){'),source.indexOf('  restoreItemReferenceFocus('));
 vm.runInContext('(function(){'+capture+'replaceInput();'+restore+'})()',c);
 return {...f,field,emit(type,extra={}){let prevented=false;listeners.get(type)?.({type,key:'Enter',target:field,preventDefault(){prevented=true;},...extra});return {prevented};}};
}
for(const ime of [{isComposing:true},{keyCode:229}])test(`restored update source leaves IME ${ime.isComposing?'composition':'key 229'} Enter untouched`,async()=>{
 const f=restoredMirrorFixture(),event=f.emit('keydown',ime);assert.equal(event.prevented,false);assert.equal(f.context.saved.preferences.updateMirror,'https://old.example');assert.equal(f.field.restoredChangeDraft,true);assert.deepEqual(f.downloads,[]);
 f.emit('keydown',{isComposing:false,keyCode:13});assert.equal(f.context.saved.preferences.updateMirror,'https://new-source.example');f.gate().resolve();await f.gate().promise;
});
for(const type of ['focusout','keydown'])test(`restored update source commits on ${type==='focusout'?'blur before download':'Enter'} and download waits for that source save`,async()=>{
 const f=restoredMirrorFixture(),c=f.context;assert.equal(c.saved.preferences.updateMirror,'https://old.example');f.emit(type);assert.equal(c.saved.preferences.updateMirror,'https://new-source.example');
 const download=c.downloadAppUpdate();await Promise.resolve();assert.deepEqual(f.downloads,[]);f.gate().resolve();await download;assert.deepEqual(f.downloads,['https://new-source.example']);
});
test('a failed restored-source blur save still blocks the next download',async()=>{
 const f=restoredMirrorFixture();f.gate().promise.catch(()=>{});f.emit('focusout');const download=f.context.downloadAppUpdate();f.gate().reject(Error('restored source save failed'));await download;
 assert.deepEqual(f.downloads,[]);assert.equal(f.context.appUpdate.phase,'error');assert.match(f.context.appUpdate.error,/restored source save failed/);
});
test('restored catalog URL keeps its explicit save-button boundary and uses the new DOM draft',async()=>{
 let field,calls=[];const typed='https://catalog-draft.example/catalog.json',c={route:'settings',windowLayout:{docked:false},history:{state:{current:'own'}},document:{activeElement:null,getElementById:()=>field,querySelector:()=>field},app:{contains:node=>node===field},catalogRequest:0,dataOperation:value=>value,useCatalogResult(){},toast(){},api:{catalogSource:async value=>{calls.push(value);return {};}}};
 const input=value=>({tagName:'INPUT',type:'url',id:'catalog-url',dataset:{},value,disabled:false,matches:()=>true,focus(){c.document.activeElement=this;},setSelectionRange(){}});field=input(typed);c.document.activeElement=field;c.replaceInput=()=>{field=input('https://saved.example');c.document.activeElement=null;};
 vm.createContext(c);const capture=source.slice(source.indexOf(' const formFocus='),source.indexOf(' const rankingFocus=')),restore=source.slice(source.indexOf('  if(formFocus){'),source.indexOf('  restoreItemReferenceFocus('));vm.runInContext('(function(){'+capture+'replaceInput();'+restore+'})()',c);assert.deepEqual(calls,[]);assert.equal(field.value,typed);
 const start=source.indexOf("else if(action==='catalog-source')"),end=source.indexOf("else if(action===",start+10);vm.runInContext('async function saveCatalog(){const action="catalog-source";if(false){}'+source.slice(start,end)+'}',c);await c.saveCatalog();assert.deepEqual(calls,[typed]);
});

for(const destination of ['closed','feedback'])test(`late window reset keeps the ${destination} overlay instead of reopening settings`,async()=>{
 const gate=deferred(),entered=deferred(),overlay={firstElementChild:{kind:'settings'},html:'settings',set innerHTML(value){this.html=value;this.firstElementChild=value?{}:null;},get innerHTML(){return this.html;}};
 const context={action:'window-reset-side',overlay,saveChain:Promise.resolve(),saved:{preferences:{}},savedBase:{preferences:{}},windowLayout:{custom:true},api:{windowLayoutControl:()=>{entered.resolve();return gate.promise;}},acceptWindowLayout(value){context.windowLayout=value;},playerFlowSettings:()=>'<section>settings reopened</section>',toast(){}};
 const start=source.indexOf(" if(['window-follow','window-reset-side','window-reset-all'].includes(action))"),end=source.indexOf(" if(action==='player-flow-toggle')",start);assert(start>0&&end>start);vm.createContext(context);vm.runInContext('async function reset(){'+source.slice(start,end)+'}',context);
 const request=context.reset();await entered.promise;overlay.innerHTML=destination==='closed'?'':feedbackDialog({text:'保留图文草稿',images:[{id:'selected-image',preview:'data:image/png;base64,AAAA'}]});const expected=overlay.innerHTML;
 gate.resolve({custom:false});await request;assert.equal(context.windowLayout.custom,false,'the requested window operation still takes effect');assert.equal(overlay.innerHTML,expected);
});

function startupUpdateFixture(){
 const timers=[],checks=[],save=deferred(),context={boot:{desktop:true},appUpdate:{phase:'idle'},saved:{preferences:{appUpdateCheck:true}},route:'settings',Date,render(){},toast(){},persist:()=>save.promise,api:{checkAppUpdate:silent=>new Promise((resolve,reject)=>checks.push({silent,resolve,reject}))},setTimeout:(run,ms)=>timers.push({run,ms})};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('async function checkAppUpdate('),source.indexOf('let updateMirrorSave=')),context);
 const start=source.indexOf(' if(boot.desktop&&saved.preferences.appUpdateCheck'),end=source.indexOf('\n}catch(err)',start);assert(start>0&&end>start);vm.runInContext(source.slice(start,end),context);
 assert.equal(timers.length,1);assert.equal(timers[0].ms,2600);
 return {context,checks,save,fire:()=>timers[0].run()};
}

test('turning off startup update checks before the delay prevents a silent request',()=>{
 const f=startupUpdateFixture();f.context.saved.preferences.appUpdateCheck=false;f.fire();assert.equal(f.checks.length,0);assert.equal(f.context.appUpdate.phase,'idle');
});

test('a completed manual check supersedes the old startup timer while its timestamp save is still pending',async()=>{
 const f=startupUpdateFixture(),manual=f.context.checkAppUpdate(false);f.checks[0].resolve({phase:'available',release:{version:'99.0.0'}});await manual;
 assert.equal(f.context.appUpdate.phase,'available');assert.ok(f.context.saved.preferences.lastAppUpdateCheck);
 f.fire();assert.deepEqual(f.checks.map(check=>check.silent),[false]);assert.equal(f.context.appUpdate.phase,'available');assert.equal(f.context.appUpdate.release.version,'99.0.0');f.save.resolve();
});

test('the startup timer cannot duplicate a pending manual check or prevent a later explicit retry',async()=>{
 const f=startupUpdateFixture(),manual=f.context.checkAppUpdate(false);f.fire();assert.deepEqual(f.checks.map(check=>check.silent),[false]);
 f.checks[0].reject(Error('模拟离线'));await manual;assert.equal(f.context.appUpdate.phase,'error');
 const retry=f.context.checkAppUpdate(false);assert.deepEqual(f.checks.map(check=>check.silent),[false,false]);f.checks[1].resolve({phase:'current'});await retry;assert.equal(f.context.appUpdate.phase,'current');f.save.resolve();
});

test('an unchanged overdue idle startup still checks automatically once',async()=>{
 const f=startupUpdateFixture(),automatic=f.fire();assert.deepEqual(f.checks.map(check=>check.silent),[true]);f.checks[0].resolve({phase:'current'});await automatic;assert.equal(f.context.appUpdate.phase,'current');f.save.resolve();
});
