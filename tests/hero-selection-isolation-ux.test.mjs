import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
function extract(from,to){const start=source.indexOf(from),end=source.indexOf(to,start);assert(start>=0&&end>start,from);return source.slice(start,end);}
function selectionFixture(){
 const pending=[],accepted=[],paints=[];
 const context=vm.createContext({hexHero:'Ashe',hexPoolRound:2,hexPoolFilter:'all',hexMechanism:'unknown',
  api:{hexRound:input=>new Promise(resolve=>pending.push({input,resolve}))},
  acceptHexRound:snapshot=>accepted.push(snapshot),refreshHexNotes:()=>paints.push('notes')});
 vm.runInContext(extract('let hexHeroSelectionRevision=','async function changeHexRound('),context);
 return {context,pending,accepted,paints,select:id=>context.chooseHexHero(id),finish(index){pending[index].resolve({revision:index+1,manual:{hero:pending[index].input.hero}});}};
}

for(const order of [[0,1],[1,0]])test(`the latest hex hero remains selected when replies finish ${order.join(' then ')}`,async()=>{
 const f=selectionFixture(),first=f.select('Ahri'),latest=f.select('Jinx'),promises=[first,latest];
 f.finish(order[0]);await promises[order[0]];
 if(order[0]===0){assert.equal(f.context.hexHero,'Ashe');assert.equal(f.accepted.length,0,'An obsolete response must not publish its old hero');}
 f.finish(order[1]);assert.equal(await first,false);assert.equal(await latest,true);
 assert.equal(f.context.hexHero,'Jinx');assert.equal(f.accepted.length,1);assert.equal(f.accepted[0].manual.hero,'Jinx');assert.deepEqual(f.paints,['notes']);
});

function pickerFixture(){
 const f=selectionFixture(),picker={kind:'hex'},layer={};let closed=0;
 Object.assign(f.context,{picker,overlay:{firstElementChild:layer},profile:()=>({roles:['mid']}),champ:id=>({id}),closeOverlay(){closed++;f.context.overlay.firstElementChild=null;f.context.picker=null;},render:()=>f.paints.push('app'),maybeRefreshBuild:id=>f.paints.push('build:'+id)});
 const branch=extract("else if(picker.kind==='hex'){const sourcePicker=", "\n else if(action==='solo-role')").replace(/^else if/,'if');
 vm.runInContext('async function pick(id){'+branch+'\n',f.context);
 return {...f,pick:id=>f.context.pick(id),closed:()=>closed,replace({samePicker=false}={}){f.context.overlay.firstElementChild={draft:'keep'};if(!samePicker)f.context.picker={kind:'hex'};}};
}

test('one completed hex choice closes its original picker and refreshes the chosen hero',async()=>{
 const f=pickerFixture(),picking=f.pick('Ahri');f.finish(0);await picking;assert.equal(f.closed(),1);assert.equal(f.context.hexHero,'Ahri');assert.deepEqual(f.paints,['notes','app','build:Ahri']);
});

for(const next of ['closed','different-picker','replaced-layer'])test(`a delayed hex choice leaves the ${next} dialog state intact`,async()=>{
 const f=pickerFixture(),picking=f.pick('Ahri');
 if(next==='closed'){f.context.overlay.firstElementChild=null;f.context.picker=null;}
 else f.replace({samePicker:next==='replaced-layer'});
 const current=f.context.overlay.firstElementChild;f.finish(0);await picking;
 assert.equal(f.context.overlay.firstElementChild,current);assert.equal(f.closed(),0);assert.deepEqual(f.paints,['notes']);
});

for(const order of [[0,1],[1,0]])test(`rapid hex hero choices keep the last hero and close once with reply order ${order.join(',')}`,async()=>{
 const f=pickerFixture(),choices=[f.pick('Ahri'),f.pick('Jinx')];f.finish(order[0]);await choices[order[0]];f.finish(order[1]);await Promise.all(choices);
 assert.equal(f.context.hexHero,'Jinx');assert.equal(f.closed(),1);assert.deepEqual(f.paints,['notes','app','build:Jinx']);
});

function choiceViewFixture(){
 const f=selectionFixture(),builds=[];let closed=0;
 Object.assign(f.context,{route:'draft',windowLayout:{docked:false},companionTab:'recommend',overlay:{firstElementChild:null},requestContext:'game-101',
  selectionRequestContext:()=>f.context.requestContext,champ:id=>id?{id}:null,profile:()=>({roles:['mid']}),heroClickSelection:(_data,selection)=>selection,data:{},
  companionScroll:new Map(),closeOverlay(){closed++;f.context.overlay.firstElementChild=null;},render:()=>f.paints.push('app'),showBuild:id=>builds.push(id)});
 return {...f,builds,closed:()=>closed};
}

for(const destination of ['modal','route','layout','tab','game'])test(`the local hero entry respects a newer ${destination} owner while its choice waits`,async()=>{
 const f=choiceViewFixture();if(destination==='tab')f.context.windowLayout.docked=true;
 const branch=extract(" if(action==='hex-local-pick'){"," if(action==='hex-reference-preview')");
 vm.runInContext("async function local(id){const action='hex-local-pick',el={dataset:{id}};"+branch+'}',f.context);
 const choosing=f.context.local('Ahri');
 if(destination==='modal')f.context.overlay.firstElementChild={kind:'theme'};else if(destination==='route')f.context.route='settings';else if(destination==='layout')f.context.windowLayout.docked=true;else if(destination==='tab')f.context.companionTab='room';else f.context.requestContext='game-102';
 const current=f.context.overlay.firstElementChild;f.finish(0);await choosing;
 assert.equal(f.context.overlay.firstElementChild,current);assert.equal(f.closed(),0);assert.deepEqual(f.builds,[]);assert.deepEqual(f.paints,['notes']);
});

function favoriteFixture(){
 const f=choiceViewFixture();Object.assign(f.context,{route:'favorites',hexSelected:[7],hexSelectedOnly:false,hexForHero:true,hexQuery:'prior query',hexRarity:'gold',hexCurrentAugmentIds:(_data,ids)=>ids});
 const branch=extract('else{const ownsView=hexChoiceOwner();if(champ(f.champion))','\n else if(action===\'auto-sync\')').replace(/^else/,'');
 vm.runInContext('async function favorite(f){'+branch,f.context);return {...f,favorite:value=>f.context.favorite(value)};
}

test('an ordinary Hex favorite still adopts its hero and saved augment choices',async()=>{
 const f=favoriteFixture(),choosing=f.favorite({champion:'Ahri',augments:[11]});f.finish(0);await choosing;
 assert.equal(f.context.hexHero,'Ahri');assert.equal(f.context.route,'hex');assert.deepEqual(f.context.hexSelected,[11]);assert.equal(f.context.hexQuery,'');
});

for(const destination of ['modal','route'])test(`a waiting Hex favorite respects a newer ${destination}`,async()=>{
 const f=favoriteFixture(),choosing=f.favorite({champion:'Ahri',augments:[11]});
 if(destination==='modal')f.context.overlay.firstElementChild={kind:'configuration'};else f.context.route='settings';
 const current=f.context.overlay.firstElementChild;f.finish(0);await choosing;assert.equal(f.context.overlay.firstElementChild,current);assert.deepEqual(f.context.hexSelected,[7]);assert.equal(f.context.hexQuery,'prior query');if(destination==='route')assert.equal(f.context.route,'settings');
});

test('an explicit all-hero favorite cancels a pending older hero choice',async()=>{
 const f=favoriteFixture(),older=f.select('Ahri');await f.favorite({champion:null,augments:[]});f.finish(0);assert.equal(await older,false);assert.equal(f.context.hexHero,null);
});

test('opening a different hero source explicitly supersedes an earlier pending choice',async()=>{
 const f=choiceViewFixture();Object.assign(f.context,{data:{augments:[]},document:{querySelectorAll:()=>[]}});
 f.context.api.onMainPage=listener=>{f.context.openMainPage=listener;};
 const registration=source.split('\n').find(line=>line.includes('api.onMainPage?.(destination=>'));assert(registration);vm.runInContext(registration,f.context);
 const older=f.select('Ahri');f.context.openMainPage({route:'hex-source',id:'Jinx'});f.finish(0);assert.equal(await older,false);assert.equal(f.context.hexHero,'Jinx');assert.equal(f.accepted.length,0);assert.equal(f.context.route,'hex');
});
