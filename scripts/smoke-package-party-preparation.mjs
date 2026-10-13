import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,selectPartyRoute,creativeMemberCombo,creativeComboContext} from '../src/core/creative-plan.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {clientPreparationPlan} from '../src/client-preparation-view.mjs';
import {validatePreparation} from '../src/core/preparation.mjs';

const customGame=process.argv.includes('--custom'),loadingNewGame=process.argv.includes('--loading-new-game'),loadingTransition=process.argv.includes('--loading-transition')||loadingNewGame,unadopted=process.argv.includes('--unadopted')||loadingTransition,root=await fs.mkdtemp(path.resolve('.local/party-preparation-smoke-')),state=defaultState();
const picks={top:'Camille',jungle:'Vi',mid:'Galio'},data=JSON.parse(await fs.readFile('data/game.json'));
const rolePools=Object.fromEntries(Object.entries(picks).map(([role,id])=>[role,{heroes:[id],mode:'only'}]));
const slots=createSlots().map(s=>({...s,party:!!picks[s.role],champion:unadopted?null:picks[s.role]||null,locked:!unadopted&&!!picks[s.role],...(!unadopted?(s.role==='top'?{clientCellId:0,manualPosition:true}:s.role==='jungle'?{clientCellId:1,manualPosition:true}:s.role==='mid'?{automaticPosition:true}:{}):{})}));
const result=recommend({slots,champions:data.champions,scope:'party',limit:1,...(unadopted?{rolePools,style:'balanced'}:{})})[0],plan=captureCreativePlan(result,data,'2026-10-12T00:00:00Z');
const alternativePlan=selectPartyRoute(captureCreativePlan({...result,trio:null,duo:null},data,'2026-10-12T00:00:00Z'),'side-pressure');
data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const alternativeSelection={id:'Galio',role:'mid',mode:'rift',...creativeComboContext(creativeMemberCombo(alternativePlan,'Galio','mid'))};
const alternativeValue=clientPreparationPlan(data,{selection:alternativeSelection,build:getBuild(data.champions.find(c=>c.id==='Galio'),'mid',data,alternativeSelection)}).value;
const fixture={unadopted,alternativePlan,alternativeValue};
if(unadopted){
 const champion=data.champions.find(c=>c.id==='Galio'),ordinaryBuild=getBuild(champion,'mid',data,{id:'Galio',role:'mid',mode:'rift'}),ordinaryRune=ordinaryBuild.runeOptions.find(option=>option.page.selectedPerkIds[0]===8230);
 assert.ok(ordinaryRune,'The unadopted regression needs a distinct saved solo rune page');
 const oldSolo=validatePreparation({id:'Galio',role:'mid',mode:'rift',runeId:ordinaryRune.id,summonerIds:['SummonerTeleport','SummonerFlash']}),candidateSelection={id:'Galio',role:'mid',mode:'rift',...creativeComboContext(creativeMemberCombo(plan,'Galio','mid'))};
 const oldSoloBuild=getBuild(champion,'mid',data,oldSolo),candidateBuild=getBuild(champion,'mid',data,candidateSelection);
 assert.equal(result.trio?.id,'camille-galio-vi');assert.equal(oldSoloBuild.items.length,4);assert.equal(candidateBuild.items.length,6);
 assert.notDeepEqual(oldSoloBuild.runePage,candidateBuild.runePage);assert.notDeepEqual(oldSoloBuild.summoners,candidateBuild.summoners);
 Object.assign(fixture,{candidateValue:clientPreparationPlan(data,{selection:candidateSelection,build:candidateBuild}).value,oldSolo,oldSoloValue:clientPreparationPlan(data,{selection:oldSolo,build:oldSoloBuild}).value});
 state.preparations=[oldSolo];state.preferences.rolePools=rolePools;
}
await fs.writeFile(path.join(root,'party-fixture.json'),JSON.stringify(fixture,null,2));
state.draft={slots,style:'balanced',scope:'party',...(!unadopted?{creativePlan:plan}:{}),playerPosition:{role:'mid',cellId:2}};
const installPath=path.join(root,'client-fixture','LeagueClient'),game=path.join(root,'client-fixture','Game');
Object.assign(state.preferences,{autoSync:false,autoCheck:false,appUpdateCheck:false,autoLive:false,clientCompanion:true,guideAutoShow:false,companionWidth:440,installPath});
// Leave clickPrepare absent: the application default must prepare on a hero click.
await fs.mkdir(installPath,{recursive:true});await fs.mkdir(game,{recursive:true});
await fs.writeFile(path.join(installPath,'lockfile'),'LeagueClient:1:23456:isolated-fixture-only:https');
await fs.writeFile(path.join(installPath,'LeagueClient.exe'),'isolated fixture marker');await fs.writeFile(path.join(game,'League of Legends.exe'),'isolated fixture marker');
await saveState(root,state);
console.log('PARTY PREPARATION ROOT '+root);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-party-preparation.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SOURCE:process.argv.includes('--source')?'1':'0',RIFT_BUDDY_UNADOPTED:unadopted?'1':'0',RIFT_BUDDY_LOADING_TRANSITION:loadingTransition?'1':'0',RIFT_BUDDY_LOADING_NEW_GAME:loadingNewGame?'1':'0',RIFT_BUDDY_CUSTOM_GAME:customGame?'1':'0'},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),150000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error('Party preparation smoke failed ('+code+'); '+root);await fs.writeFile('.local/latest-party-preparation-smoke.json',JSON.stringify({root,unadopted},null,2));}finally{clearTimeout(timer);}
