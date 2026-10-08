import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {changePresentation,normalizePresentation} from '../src/core/presentation.mjs';
import {defaultState,validateState,mergeState,saveState,readState} from '../services/storage.mjs';
import {publicEquipment} from '../src/core/scoreboard.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
import {sanitizeLive} from '../services/live-client.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));
data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
test('existing settings migrate without losing favorites; presentation order survives save and import',async()=>{
 const state=validateState({...defaultState(),preferences:{autoCheck:false}});
 let p=changePresentation(state.preferences.presentation,{field:'textScale',value:1.25});
 p=changePresentation(p,{field:'toggleModule',value:'purchase'});
 p=changePresentation(p,{field:'moveUp',value:'scoreboard'});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-presentation-'));
 await saveState(root,{...state,preferences:{...state.preferences,presentation:p}});
 const restored=await readState(root);assert.deepEqual(restored.preferences.presentation,p);assert.equal(restored.preferences.autoCheck,false);
 assert.deepEqual(mergeState(restored,{schema:1,favorites:[],excluded:[],preferences:{}},[]).preferences.presentation,p);
 assert.deepEqual(mergeState(restored,{...defaultState(),preferences:{presentation:{textScale:1.1,guideModules:[]}}},[]).preferences.presentation,{textScale:1.1,guideModules:[]});
});
test('presentation rejects unsupported operations and bounded migration drops unknown modules',()=>{
 assert.deepEqual(normalizePresentation({textScale:99,guideModules:['skills','bad','skills','purchase']}),{textScale:1,guideModules:['skills','purchase']});
 for(const change of [{field:'textScale',value:0},{field:'toggleModule',value:'hidden-enemy'},{field:'openFile',value:'skills'},null])assert.throws(()=>changePresentation(null,change));
 const one={textScale:1,guideModules:['skills']};assert.deepEqual(changePresentation(one,{field:'moveUp',value:'skills'}),one);
});
const player=(id,side,inventory=[],itemsKnown=true)=>({champion:id,side,inventory,itemsKnown});
test('public equipment compares complete inventories and identifies recovery and anti-heal sources',()=>{
 const ally=['Ashe','Volibear','Ahri','Leona','Garen'].map((id,n)=>player(id,'ally',[{id:n===0?'3123':'1001',count:1}]));
 const enemy=['Soraka','Jhin','Jinx','Zed','Malphite'].map((id,n)=>player(id,'enemy',[{id:n===0?'6617':'1001',count:1}]));
 const result=publicEquipment(data,{teamKnown:true,roster:[...ally,...enemy]});
 assert.equal(result.ally.complete,true);assert.equal(result.enemy.complete,true);
 assert.equal(result.difference,data.items['3123'].gold.total-data.items['6617'].gold.total);
 assert.deepEqual(result.recoveryEnemies.map(p=>p.id),['Soraka']);assert.deepEqual(result.grievousAllies.map(p=>p.id),['Ashe']);
 assert.match(result.caution,/不含未花金币/);
});
test('unread, partial, unknown-price and unknown-team equipment never becomes a fabricated economy lead',()=>{
 for(const roster of [[player('Ashe','ally')],[player('Ashe','ally',[],false)],[player('Ashe','ally',[{id:'999999',count:1}])]]){
  const result=publicEquipment(data,{teamKnown:true,roster});assert.equal(result.difference,null);assert.equal(result.coverageKnown,false);
 }
 const unknown=publicEquipment(data,{teamKnown:true,roster:[player('Ashe','ally',[{id:'999999',count:1}])]});assert.equal(unknown.ally.players[0].value,null);
 assert.equal(publicEquipment(data,{teamKnown:false,roster:[player('Ashe','ally')]}).available,false);
});
test('public equipment without stack counts remains visible; malformed entries invalidate inventory totals',()=>{
 const own={summonerName:'self',rawChampionName:'Ashe',team:'ORDER',items:[]};
 const enemy={summonerName:'unretained',rawChampionName:'Soraka',team:'CHAOS',items:[{itemID:6617}]};
 const read=p=>sanitizeLive({summonerName:'self'},[own,p],{mapNumber:11},data.champions);
 const live=read(enemy),equipment=publicEquipment(data,live);
 assert.equal(equipment.recoveryEnemies[0].name,'索拉卡');assert.equal(equipment.enemy.players[0].value,data.items['6617'].gold.total);
 const invalid=read({...enemy,items:[{itemID:6617,count:'bad'}]});assert.equal(invalid.roster[1].itemsKnown,false);
 assert.equal(publicEquipment(data,invalid).enemy.players[0].value,null);
 assert.doesNotMatch(JSON.stringify(live.roster),/unretained|summonerName/);
});
test('overview obeys saved module order and visibility while stale live data cannot leak a scoreboard',()=>{
 const live={available:true,champion:'Ashe',mode:'rift',at:Date.now(),level:6,gold:900,inventory:[],skills:{Q:2,W:2,E:1,R:1},teamKnown:true,roster:[player('Ashe','ally',[])],gameTime:400};
 const m=createGuideModel(data,selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'}),live);
 assert.equal(m.equipment.available,true);
 const html=renderGuide({model:m,presentation:{guideModules:['scoreboard','skills']}},'overview',false,()=>'<img>');
 assert.ok(html.indexOf('data-overview-module="scoreboard"')<html.indexOf('data-overview-module="skills"'));
 assert.doesNotMatch(html,/data-overview-module="purchase"|data-overview-module="situation"/);
 const stale=createGuideModel(data,selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'}),{...live,at:Date.now()-20000});assert.equal(stale.equipment.available,false);
 const mismatch=createGuideModel(data,selectGuide(null,{id:'Jinx',role:'bottom',mode:'rift'}),live);assert.equal(mismatch.equipment.available,false);
});
