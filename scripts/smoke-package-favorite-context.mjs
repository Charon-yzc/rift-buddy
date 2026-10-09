import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {selectedBuildFields} from '../src/core/build-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {captureTeamConfigurations} from '../src/core/team-favorites.mjs';

const root=await fs.mkdtemp(path.resolve('.local/favorite-context-smoke-'));
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const oldSlots=createSlots().map((slot,index)=>({...slot,champion:['Garen','LeeSin','Ahri','Ashe','Nami'][index],locked:true}));
const result={scope:'context',slots:oldSlots},store=createPreparationStore();
for(const selection of captureTeamConfigurations(result,data,store)){
 const hero=data.champions.find(c=>c.id===selection.id),build=getBuild(hero,selection.role,data,selection);
 const choice={...selection,coreIndex:1,runeId:build.runeOptions[1]?.id||build.selectedRuneId};delete choice.coreId;
 const selected=getBuild(hero,selection.role,data,choice);
 store.remember({...choice,...selectedBuildFields({...choice,build:selected})});
}
const favorite={id:'old-context',type:'team',title:'保存的三位开黑成员与旧队友',slots:oldSlots,scope:'context',style:'fun',configurations:captureTeamConfigurations(result,data,store),version:data.version};
const phaseNames=['standard','restart','manual','blind','offline','failed','solo','changed'];
for(const phase of phaseNames){
 const profile=path.join(root,phase==='restart'?'standard':phase);await fs.mkdir(profile,{recursive:true});
 if(phase!=='restart'){
  const state=defaultState();Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,installPath:path.join(profile,'client-fixture')});
  state.favorites=[structuredClone(favorite)];state.preparations=[{id:'Ahri',role:'mid',mode:'rift',runeId:'previous-ahri-choice'},{id:'Lux',role:'support',mode:'rift',runeId:'unrelated-lux-choice'}];
  state.draft={slots:createSlots(),scope:'context',style:'balanced'};
  if(phase==='manual')Object.assign(state.draft.slots[2],{champion:'Darius',locked:true,clientCellId:2,manualPosition:true});
  if(phase==='solo'){state.favorites[0].scope='solo';state.favorites[0].soloRole='top';}
  await saveState(profile,state);
 }
 const log=await fs.open(path.join(root,phase+'.log'),'wx');
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-favorite-context.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:profile,RIFT_BUDDY_FAVORITE_PHASE:phase},windowsHide:true,stdio:['ignore',log.fd,log.fd]});
 const timer=setTimeout(()=>child.kill(),60000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Favorite context smoke failed ('+phase+'): '+await fs.readFile(path.join(root,phase+'.log'),'utf8'));}
 finally{clearTimeout(timer);await log.close();}
}
const phases=[];for(const phase of phaseNames)phases.push(JSON.parse(await fs.readFile(path.join(root,phase==='restart'?'standard':phase,phase+'-result.json'),'utf8')));
const release=JSON.parse(await fs.readFile('release/latest.json','utf8')),record={root,archiveSha256:release.archiveSha256,phases};
await fs.writeFile('.local/latest-favorite-context-smoke.json',JSON.stringify(record,null,2));console.log(JSON.stringify(record,null,2));
