import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/item-set-workflow-')),state=defaultState(),installPath=path.join(root,'client-fixture','LeagueClient'),game=path.join(root,'client-fixture','Game'),target=path.join(game,'Config','Champions','Volibear','Recommended');
const globalSets=path.join(game,'Config','Global','Recommended');
Object.assign(state.preferences,{autoSync:false,autoCheck:false,appUpdateCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,clickPrepare:false,installPath});
state.preparations=[{id:'Volibear',role:'top',mode:'rift',startId:'start-1054-2003',bootsId:'boots-3158'}];
await fs.mkdir(installPath,{recursive:true});await fs.mkdir(target,{recursive:true});await fs.writeFile(path.join(installPath,'lockfile'),'LeagueClient:1:23456:isolated-fixture-only:https');await fs.writeFile(path.join(installPath,'LeagueClient.exe'),'isolated fixture marker');await fs.writeFile(path.join(game,'League of Legends.exe'),'isolated fixture marker');
for(const name of ['user-build.json','akari1-106.json','rift-buddy-22-bottom-rift.json'])await fs.writeFile(path.join(target,name),'preserve user file '+name);
await fs.mkdir(globalSets,{recursive:true});
const competing={type:'custom',map:'SR',mode:'any',priority:true,sortrank:2000000000,blocks:[{type:'出门装',items:[{id:'1054',count:1}]}],associatedChampions:[106],associatedMaps:[11]};
await fs.writeFile(path.join(target,'personal-shop-set.json'),JSON.stringify({...competing,uid:'my-own-set',title:'我的沃利贝尔配装'}));
await fs.writeFile(path.join(globalSets,'third-party-shop-set.json'),JSON.stringify({...competing,uid:'another-tool',title:'另一套装备集'}));
const oldAshe=path.join(game,'Config','Champions','Ashe','Recommended');await fs.mkdir(oldAshe,{recursive:true});
const {champions}=JSON.parse(await fs.readFile('data/game.json','utf8')),ashe=champions.find(hero=>hero.id==='Ashe'),volibear=champions.find(hero=>hero.id==='Volibear');
const previousSets=[
 [oldAshe,{...competing,uid:'rift-buddy-22-bottom-rift',title:`开黑搭子 · ${ashe.name} · 下路 · 峡谷 · 16.21`,associatedChampions:[22]}],
 [globalSets,{...competing,uid:'rift-buddy-106-top-hex',title:`开黑搭子 · ${volibear.name} · 上路 · 海克斯 · 16.21`,map:'HA',associatedMaps:[12]}],
];
for(const [folder,set] of previousSets)await fs.writeFile(path.join(folder,set.uid+'.json'),JSON.stringify(set));
await saveState(root,state);
for(const phase of ['select','restart']){
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-item-sets.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_ITEM_SET_PHASE:phase},windowsHide:true,stdio:'inherit'}),timer=setTimeout(()=>child.kill(),120000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error(`Item set ${phase} smoke failed: ${root}`);}finally{clearTimeout(timer);}
}
await fs.writeFile('.local/latest-item-set-smoke.json',JSON.stringify({root},null,2));
