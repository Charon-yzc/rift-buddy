import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {DEFAULT_BUILD_SOURCE,projectBuildSources} from '../src/core/build-source.mjs';

const root=await fs.mkdtemp(path.resolve('.local/player-selection-smoke-')),state=defaultState();
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=projectBuildSources(JSON.parse(await fs.readFile('data/builds.json','utf8')).entries,DEFAULT_BUILD_SOURCE,data.patch);
const heroes=['Ashe','Jinx'],role='bottom',sources={};
for(const id of heroes){
 const build=getBuild(data.champions.find(hero=>hero.id===id),role,data,{id,role,mode:'rift'});
 assert.ok(build.reference&&build.reference.source==='OP.GG'&&build.reference.patch===data.patch&&build.missing.length===0,'The pointer fixture requires a complete real current OP.GG source: '+id);
 const other=build.runeOptions.find(option=>JSON.stringify(option.page.selectedPerkIds)!==JSON.stringify(build.runePage.selectedPerkIds));assert.ok(other);
 state.preparations.push({id,role,mode:'rift',loadoutId:'default',runeId:other.id,summonerIds:['SummonerTeleport','SummonerFlash']});
 sources[id]={patch:build.reference.patch,fetchedAt:build.reference.fetchedAt};
}
state.preparations.push({...state.preparations[0],comboId:'ashe-braum'});
const fixed={top:'Ornn',jungle:'Vi',mid:'Ahri',support:'Braum'};
state.draft={slots:createSlots().map((slot,clientCellId)=>({...slot,party:slot.role===role,partyManual:true,...(slot.role===role?{}:{champion:fixed[slot.role],locked:true,clientCellId,manualPosition:true})})),scope:'party',style:'balanced',soloRole:role,playerPosition:{role,cellId:3}};
Object.assign(state.preferences,{autoSync:false,autoCheck:false,appUpdateCheck:false,autoLive:false,roomAuto:false,chatNotice:false,clientCompanion:true,guideAutoShow:false,clickPrepare:true,companionWidth:440,flashSlot:'d',rolePools:{[role]:{mode:'only',heroes}}});
state.preferences.installPath=path.join(root,'client-fixture','LeagueClient');
await fs.mkdir(state.preferences.installPath,{recursive:true});await fs.mkdir(path.join(root,'client-fixture','Game'),{recursive:true});
await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:1:23456:isolated-pointer-fixture-only:https');
await fs.writeFile(path.join(state.preferences.installPath,'LeagueClient.exe'),'isolated fixture marker');await fs.writeFile(path.join(root,'client-fixture','Game','League of Legends.exe'),'isolated fixture marker');
await saveState(root,state);await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify({heroes,role,patch:data.patch,sources},null,2));
console.log('PLAYER SELECTION ROOT '+root);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-player-selection.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SOURCE:process.argv.includes('--source')?'1':'0'},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),120000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error('Player selection smoke failed ('+code+'); '+root);await fs.writeFile('.local/latest-player-selection-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
