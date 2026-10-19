import fs from 'node:fs/promises';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {loadServerSeed,serverBuildJobs} from '../services/server-data-collector.mjs';
import {createGenerationRecipe,projectGenerationBundle,packGenerationBundle,generationRelease,generationBaseIdentity} from '../services/data-generation.mjs';
import {BUNDLED_CATALOG} from '../src/core/catalog.mjs';
import {createSlots} from '../src/core/recommend.mjs';

const root=await fs.mkdtemp(path.resolve('.local/data-generation-smoke-')),seed=await loadServerSeed('data'),pair=generateKeyPairSync('ed25519'),keyId='isolated-generation-smoke';
const fixtures=[];
for(const sequence of [1,2]){
 const value=structuredClone(seed),hero=value.game.champions.find(c=>c.id==='Ahri');hero.mechanicSource.character.sha256=String(sequence).repeat(64);hero.name='阿狸·资料'+sequence;
 const recipe=createGenerationRecipe(value,serverBuildJobs(value)),packed=packGenerationBundle(projectGenerationBundle(value,recipe),recipe),publishedAt=new Date(Date.now()-60000).toISOString();
 const manifest={schema:2,version:value.game.version,patch:value.game.patch,sequence,publishedAt,checkedAt:publishedAt,files:packed.files,recipe};manifest.release=generationRelease(manifest);
 const payload=Buffer.from(JSON.stringify(manifest)),envelope={keyId,payload:payload.toString('base64'),signature:sign(null,payload,pair.privateKey).toString('base64')};
 fixtures.push({manifest,envelope,assets:Object.fromEntries(Object.entries(packed.assets).map(([hash,bytes])=>[hash,bytes.toString('base64')])),identity:generationBaseIdentity(value.game)});
}
const manual=structuredClone(seed.game),manualHero=manual.champions.find(c=>c.id==='Ahri');manualHero.mechanicSource.character.sha256='f'.repeat(64);manualHero.name='阿狸·手动';
await fs.mkdir(path.join(root,'data'),{recursive:true});await fs.writeFile(path.join(root,'data/game.json'),JSON.stringify(manual));
const state=defaultState();Object.assign(state.preferences,{autoSync:false,autoCheck:false,appUpdateCheck:false,roomAuto:false,guideAutoShow:false,autoLive:false,installPath:path.join(root,'fake-client')});await saveState(root,state);
state.draft={slots:createSlots().map(slot=>({...slot,champion:slot.role==='mid'?'Ahri':null,partyManual:true})),scope:'party',style:'fun',soloRole:'mid'};await saveState(root,state);
await fs.mkdir(state.preferences.installPath,{recursive:true});await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:0:23456:isolated-generation-only:https');
const personal={...structuredClone(BUNDLED_CATALOG.duos[0]),id:'local-generation-preserved'};await fs.writeFile(path.join(root,'combinations.json'),JSON.stringify({schema:1,personal:{duos:[personal],trios:[],loadouts:[]}}));
await fs.writeFile(path.join(root,'fixtures.json'),JSON.stringify({keys:{[keyId]:pair.publicKey.export({type:'spki',format:'pem'})},fixtures,manualIdentity:generationBaseIdentity(manual)}));
const manualBytes=await fs.readFile(path.join(root,'data/game.json')),personalBytes=await fs.readFile(path.join(root,'combinations.json'));
for(const phase of ['adopt','restart']){
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-data-generation.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_GENERATION_PHASE:phase,TEMP:root,TMP:root},windowsHide:true,stdio:'inherit'}),timer=setTimeout(()=>child.kill(),120000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error(`Packaged generation ${phase} failed (${code}); ${root}`);}finally{clearTimeout(timer);}
}
if(!(await fs.readFile(path.join(root,'data/game.json'))).equals(manualBytes)||!(await fs.readFile(path.join(root,'combinations.json'))).equals(personalBytes))throw Error('Personal or manual source bytes changed');
await fs.writeFile('.local/latest-data-generation-smoke.json',JSON.stringify({root,passed:true,actualClientAccess:false,actualRuneWrites:false},null,2));
