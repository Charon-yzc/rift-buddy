import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';
const root=await fs.mkdtemp(path.resolve('.local/pick-eligibility-smoke-'));
const phases=['owned','restart','empty','banned','enemy','mirror','position','position-solo','position-restart','offline','locked','library','library-solo'];
for(const phase of phases){
 const profile=path.join(root,phase==='restart'?'owned':phase==='position-restart'?'position':phase);await fs.mkdir(profile,{recursive:true});
 if(!phase.endsWith('restart')){
  const state=defaultState();Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,installPath:path.join(profile,'client-fixture'),pool:['Ahri','Lux','Vi','JarvanIV'],poolMode:'only'});
  state.draft={slots:createSlots().map(s=>({...s,party:phase.startsWith('library')||['jungle','mid'].includes(s.role),champion:phase==='library'?(s.role==='mid'?'Lux':s.role==='bottom'?'Ashe':null):s.role==='mid'&&['banned','enemy','mirror','locked'].includes(phase)?phase==='locked'?'Lux':'Ahri':null,locked:phase==='library'?['mid','bottom'].includes(s.role):s.role==='mid'&&['banned','enemy','mirror','locked'].includes(phase)})),scope:['position-solo','library-solo'].includes(phase)?'solo':'party',style:'fun'};
  const slots=createSlots().map(s=>({...s,party:['jungle','mid'].includes(s.role),champion:s.role==='mid'?'Ahri':s.role==='jungle'?'Vi':null,locked:['jungle','mid'].includes(s.role)}));
  state.favorites=[{id:'old-pair',type:'team',title:'旧蔚阿狸计划',scope:'party',style:'fun',slots,configurations:[]}];
  await saveState(profile,state);
 }
 const log=await fs.open(path.join(root,phase+'.log'),'wx'),child=spawn(electronExecutable(),[path.resolve('scripts/smoke-pick-eligibility.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:profile,RIFT_BUDDY_PICK_PHASE:phase},windowsHide:true,stdio:['ignore',log.fd,log.fd]}),timer=setTimeout(()=>child.kill(),95000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Pick eligibility package smoke failed ('+phase+'): '+await fs.readFile(path.join(root,phase+'.log'),'utf8'));}
 finally{clearTimeout(timer);await log.close();}
}
const release=JSON.parse(await fs.readFile('release/latest.json')),results=[];
for(const phase of phases)results.push(JSON.parse(await fs.readFile(path.join(root,phase==='restart'?'owned':phase==='position-restart'?'position':phase,phase+'-result.json'))));
const record={root,archiveSha256:release.archiveSha256,results};await fs.writeFile('.local/latest-pick-eligibility-smoke.json',JSON.stringify(record,null,2));console.log(JSON.stringify(record,null,2));
