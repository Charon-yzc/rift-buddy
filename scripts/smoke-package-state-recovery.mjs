import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {selectGuide} from '../src/core/guide.mjs';
const root=await fs.mkdtemp(path.resolve('.local/state-recovery-smoke-'));
const oldSlots=createSlots().map((s,i)=>({...s,champion:['Garen','LeeSin','Ahri','Ashe','Nami'][i],locked:true}));
const oldFavorite={id:'old-party',title:'旧开黑组合',type:'team',slots:oldSlots,scope:'party',style:'fun',configurations:[]};
for(const phase of ['recovery','restart','tempo','blocked']){
 const profile=path.join(root,phase==='restart'?'recovery':phase);await fs.mkdir(profile,{recursive:true});
 if(phase!=='restart'){
  const state=defaultState();Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,installPath:path.join(profile,'client-fixture'),pool:['Ahri','Vi'],poolMode:'only',play:{tempo:'early'}});
  state.favorites=[oldFavorite,{id:'good-build',type:'build',title:'保留的艾希配置',champion:'Ashe',role:'bottom',mode:'rift',runeId:'retained-rune-choice'}];
  state.preparations=[{id:'Lux',role:'mid',mode:'rift',runeId:'manual-lux-choice'}];
  state.draft={slots:createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),champion:s.role==='mid'?'Lux':null,locked:s.role==='mid'})),scope:'party',style:'fun'};
  if(phase==='tempo')state.draft.slots=createSlots().map(s=>({...s,party:['mid','jungle'].includes(s.role),champion:s.role==='mid'?'Ahri':s.role==='jungle'?'Vi':null,locked:['mid','jungle'].includes(s.role)}));
  if(phase==='blocked')state.guide={...selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'}),ball:true,collapsed:true};
  await saveState(profile,state);
  if(['recovery','blocked'].includes(phase)){const raw=JSON.parse(await fs.readFile(path.join(profile,'settings.json'),'utf8'));raw.favorites.push({id:'bad',type:'build',title:'损坏的旧记录',champion:'Ashe',mode:'rift'});const bytes=JSON.stringify(raw);await fs.writeFile(path.join(profile,'settings.json'),bytes);await fs.writeFile(path.join(profile,'original-fixture.json'),bytes);}
 }
 const log=await fs.open(path.join(root,phase+'.log'),'wx'),child=spawn(electronExecutable(),[path.resolve('scripts/smoke-state-recovery.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:profile,RIFT_BUDDY_RECOVERY_PHASE:phase},windowsHide:true,stdio:['ignore',log.fd,log.fd]}),timer=setTimeout(()=>child.kill(),80000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('State recovery package smoke failed ('+phase+'): '+await fs.readFile(path.join(root,phase+'.log'),'utf8'));}
 finally{clearTimeout(timer);await log.close();}
}
const release=JSON.parse(await fs.readFile('release/latest.json','utf8')),phases=[];
for(const phase of ['recovery','restart','tempo','blocked'])phases.push(JSON.parse(await fs.readFile(path.join(root,phase==='restart'?'recovery':phase,phase+'-result.json'),'utf8')));
const record={root,archiveSha256:release.archiveSha256,phases};await fs.writeFile('.local/latest-state-recovery-smoke.json',JSON.stringify(record,null,2));console.log(JSON.stringify(record,null,2));
