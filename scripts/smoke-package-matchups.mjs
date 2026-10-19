import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {BUNDLED_CATALOG} from '../src/core/catalog.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';

const teamOrder=process.argv.includes('--team-order'),phases=teamOrder?['team-order','team-order-restart']:['side','guide'];
const root=await fs.mkdtemp(path.resolve(teamOrder?'.local/team-order-smoke-':'.local/matchups-smoke-'));
for(const phase of phases){
 const directory=path.join(root,phase),state=defaultState();
 await fs.mkdir(directory);Object.assign(state.preferences,{autoSync:false,autoCheck:false,appUpdateCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,installPath:path.join(directory,'client-fixture')});
 if(phase==='side'){
  const game=JSON.parse(await fs.readFile('data/game.json','utf8'));game.catalog=BUNDLED_CATALOG;
  const duo=BUNDLED_CATALOG.duos.find(row=>row.id==='naut-samira'),slots=createSlots().map(slot=>({...slot,champion:slot.role==='bottom'?'Samira':slot.role==='support'?'Nautilus':null,party:['bottom','support'].includes(slot.role),locked:['bottom','support'].includes(slot.role)}));
  const creativePlan=captureCreativePlan({duo,slots,scope:'party',targets:['bottom','support']},game);
  if(creativePlan?.curated?.id!=='naut-samira')throw Error('Historical matchup fixture is incomplete');
  // Exercise explicit restoration; a pending old plan must not auto-adopt.
  state.favorites=[{id:'legacy-naut-samira-matchups',type:'team',title:'历史泰坦莎弥拉对位方案',slots,scope:'party',style:'fun',creativePlan,configurations:[],version:game.version}];
 }
 await fs.mkdir(state.preferences.installPath);await saveState(directory,state);
 const log=await fs.open(path.join(directory,'smoke.log'),'wx');
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-matchups.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:directory,RIFT_BUDDY_MATCHUP_PHASE:phase},windowsHide:true,stdio:['ignore',log.fd,log.fd]});
 const timer=setTimeout(()=>child.kill(),60000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error(phase+' matchup smoke failed: '+await fs.readFile(path.join(directory,'smoke.log'),'utf8'));}
 finally{clearTimeout(timer);await log.close();}
}
const reports=Object.fromEntries(await Promise.all(phases.map(async phase=>[phase,JSON.parse(await fs.readFile(path.join(root,phase,'result.json'),'utf8'))])));
const result={root,...reports};await fs.writeFile(teamOrder?'.local/latest-team-order-smoke.json':'.local/latest-matchups-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
