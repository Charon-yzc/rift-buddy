import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJSON} from './data.mjs';
import {validateGuideState,validateLoadoutSelection} from '../src/core/guide.mjs';
import {normalizePresentation} from '../src/core/presentation.mjs';
import {normalizeBuildSource} from '../src/core/build-source.mjs';
import {validatePreparations,storedPreparation,PREPARATION_LIMIT} from '../src/core/preparation.mjs';
import {validateTeamConfigurations} from '../src/core/team-favorites.mjs';
import {validateCreativePlan} from '../src/core/creative-plan.mjs';
export const defaultState=()=>({schema:1,favorites:[],excluded:[],preparations:[],preferences:{style:'fun',autoCheck:true,buildSource:normalizeBuildSource(null),presentation:normalizePresentation(null),installPath:'C:/WeGameApps/英雄联盟'},draft:null,ownedPageId:null,guide:null});
const roles=['top','jungle','mid','bottom','support'],styles=['balanced','fun','wild'];
const conditions=['ad','ap','control','heal','burst'];
// Complete cooperation plans include saved member configurations. Use the
// same UTF-8 budget for local settings and portable backups.
export const STATE_MAX_BYTES=64*1024*1024;
const checkSize=value=>{if(Buffer.byteLength(JSON.stringify(value),'utf8')>STATE_MAX_BYTES)throw new Error('收藏与配置已超过保存空间，请先移出不需要的收藏');};
const hero=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(id);
const text=(v,max)=>typeof v==='string'&&v.length<=max;
function slots(value,preserveClientMetadata=false){
 if(!Array.isArray(value)||value.length!==5||new Set(value.map(s=>s?.role)).size!==5)throw Error('阵容位置格式不正确');
 const picked=new Set();
 return value.map(s=>{
  if(!roles.includes(s.role)||s.champion!==null&&!hero(s.champion)||typeof s.party!=='boolean'||typeof s.locked!=='boolean')throw Error('阵容内容格式不正确');
  if(s.champion&&picked.has(s.champion))throw Error('阵容中有重复英雄');if(s.champion)picked.add(s.champion);
  return {role:s.role,champion:s.champion,party:s.party,locked:!!s.champion&&s.locked,
   ...(preserveClientMetadata&&(s.champion||s.manualPosition===true)&&Number.isInteger(s.clientCellId)&&s.clientCellId>=0&&s.clientCellId<30?{clientCellId:s.clientCellId,...(s.manualPosition===true?{manualPosition:true}:{})}:{})};
 });
}
function favorite(f){
 if(!f||!text(f.id,250)||!f.id||!text(f.title,200)||!['team','build','hex'].includes(f.type))throw Error('收藏内容格式不正确');
 const base={id:f.id,title:f.title,type:f.type,version:text(f.version,30)?f.version:'未知',createdAt:Number.isFinite(Date.parse(f.createdAt))?f.createdAt:new Date(0).toISOString()};
 if(f.type==='team'){
  const lineup=slots(f.slots);
  return {...base,slots:lineup,...(f.creativePlan?{creativePlan:validateCreativePlan(f.creativePlan,lineup)}:{}),configurations:validateTeamConfigurations(f.configurations,lineup),style:styles.includes(f.style)?f.style:'fun',scope:['solo','context','party','bot'].includes(f.scope)?f.scope:'context',...(roles.includes(f.soloRole)?{soloRole:f.soloRole}:{})};
 }
 if(f.type==='hex'){
  if(f.champion!==null&&!hero(f.champion)||!Array.isArray(f.augments)||f.augments.length>5||!f.augments.every(Number.isInteger))throw Error('强化收藏格式不正确');
  const augList=(v,max)=>Array.isArray(v)?[...new Set(v.filter(Number.isInteger))].slice(0,max):[];
  return {...base,champion:f.champion,augments:[...new Set(f.augments)],compareIds:augList(f.compareIds,3),ownedAugmentIds:augList(f.ownedAugmentIds,6)};
 }
 if(!hero(f.champion)||!roles.includes(f.role)||!['rift','hex'].includes(f.mode))throw Error('英雄配置收藏格式不正确');
 const hexAug=v=>Array.isArray(v)?[...new Set(v.filter(Number.isInteger))]:[];
 return {...base,champion:f.champion,role:f.role,mode:f.mode,...validateLoadoutSelection({...f,id:f.champion}),coreIndex:Number.isInteger(f.coreIndex)&&f.coreIndex>=0&&f.coreIndex<15?f.coreIndex:0,conditions:Array.isArray(f.conditions)?[...new Set(f.conditions.filter(c=>conditions.includes(c)))]:[],...(f.mode==='hex'?{augmentIds:hexAug(f.augmentIds).slice(0,5),compareIds:hexAug(f.compareIds).slice(0,3),ownedAugmentIds:hexAug(f.ownedAugmentIds).slice(0,6)}:{})};
}
export function validateState(value) {
 if(!value||typeof value!=='object'||value.schema!==1)throw new Error('保存内容格式不正确');
 checkSize(value);
 if(!Array.isArray(value.favorites)||value.favorites.length>500||!Array.isArray(value.excluded)||value.excluded.length>300)throw new Error('收藏或排除列表格式不正确');
 if(!value.excluded.every(hero))throw Error('排除英雄格式不正确');
 const p=value.preferences||{};
 if(p.installPath!==undefined&&(!text(p.installPath,500)||/[\r\n\0]/.test(p.installPath)))throw Error('游戏目录格式不正确');
 const normalized={schema:1,favorites:value.favorites.map(favorite),excluded:[...new Set(value.excluded)],preparations:validatePreparations(value.preparations),
  preferences:{buildSource:normalizeBuildSource(p.buildSource),presentation:normalizePresentation(p.presentation),style:styles.includes(p.style)?p.style:'fun',autoCheck:p.autoCheck!==false,autoSync:p.autoSync!==false,installPath:p.installPath??defaultState().preferences.installPath,
   clientCompanion:p.clientCompanion!==false,guideAutoShow:p.guideAutoShow!==false,guideAfterGame:['hide','collapse','keep'].includes(p.guideAfterGame)?p.guideAfterGame:'hide',
   autoLive:p.autoLive!==false,pool:Array.isArray(p.pool)?[...new Set(p.pool.filter(hero))].slice(0,200):[],poolMode:['off','prefer','only'].includes(p.poolMode)?p.poolMode:'off',
   play:{difficulty:p.play?.difficulty==='easy'?'easy':'any',tempo:['early','teamfight','protect','poke'].includes(p.play?.tempo)?p.play.tempo:'any',unusual:p.play?.unusual!==false,meleeBottom:p.play?.meleeBottom!==false},
   rolePools:Object.fromEntries(roles.map(role=>[role,{heroes:Array.isArray(p.rolePools?.[role]?.heroes)?[...new Set(p.rolePools[role].heroes.filter(hero))].slice(0,180):[],mode:['prefer','only'].includes(p.rolePools?.[role]?.mode)?p.rolePools[role].mode:'off'}])),
   ...(Number.isFinite(Date.parse(p.lastCheck))?{lastCheck:p.lastCheck}:{})},
  draft:value.draft?{slots:slots(value.draft.slots,true),...(value.draft.creativePlan?{creativePlan:validateCreativePlan(value.draft.creativePlan,slots(value.draft.slots,true),{allowUnknown:true})}:{}),...(typeof value.draft.clientGameId==='string'&&/^\d{1,20}$/.test(value.draft.clientGameId)&&Number(value.draft.clientGameId)>0?{clientGameId:value.draft.clientGameId}:{}),style:styles.includes(value.draft.style)?value.draft.style:'fun',scope:['solo','context','party','bot'].includes(value.draft.scope)?value.draft.scope:'context',...(value.draft.scope==='solo'||Object.hasOwn(value.draft,'soloRole')?{soloRole:roles.includes(value.draft.soloRole)?value.draft.soloRole:''}:{})}:null,
  ownedPageId:Number.isInteger(value.ownedPageId)&&value.ownedPageId>0?value.ownedPageId:null,guide:validateGuideState(value.guide)};
 checkSize(normalized);return normalized;
}
export async function readState(root) {
 const filename=path.join(root,'settings.json');
 try{if((await fs.stat(filename)).size>STATE_MAX_BYTES)throw Error('保存文件过大');const raw=JSON.parse(await fs.readFile(filename,'utf8'));
  // Recover optional guide damage without losing valid favorites or preferences.
  try{validateGuideState(raw.guide);}catch{await fs.copyFile(filename,`${filename}.recovery-${Date.now()}`).catch(()=>{});raw.guide=null;}
  try{validatePreparations(raw.preparations);}catch{await fs.copyFile(filename,`${filename}.recovery-${Date.now()}`).catch(()=>{});raw.preparations=[];}
  return {...defaultState(),...validateState(raw)};}
 catch(e){if(e.code!=='ENOENT'){try{await fs.copyFile(filename,`${filename}.recovery-${Date.now()}`);}catch{}}
  return defaultState();}
}
export async function saveState(root,state) {await atomicJSON(path.join(root,'settings.json'),validateState(state));}
export function createBackup(state){
 const valid=validateState(state);
 return JSON.stringify({...valid,ownedPageId:null,preferences:{...valid.preferences,installPath:''}});
}
export async function readBackup(filename){
 if((await fs.stat(filename)).size>STATE_MAX_BYTES)throw Error('备份文件超过收藏与配置的保存空间');
 const incoming=JSON.parse(await fs.readFile(filename,'utf8'));validateState(incoming);
 // Preserve omitted legacy preferences so mergeState can keep local choices.
 return incoming;
}
export function mergeState(current,backup,champions){
 const incoming=validateState(backup),favorites=[...current.favorites];
 for(const favorite of incoming.favorites)if(!favorites.some(f=>f.id===favorite.id))favorites.push(favorite);
 const explicit=key=>Object.hasOwn(backup.preferences||{},key);
 const style=explicit('style')?incoming.preferences.style:current.preferences.style;
 const preparations=[...(current.preparations||[])];
 for(const configuration of incoming.preparations)if(!storedPreparation(preparations,configuration)&&preparations.length<PREPARATION_LIMIT)preparations.push(configuration);
 return validateState({...current,favorites:favorites.slice(0,500),preparations,
  excluded:[...new Set([...current.excluded,...incoming.excluded])].filter(id=>champions.some(c=>c.id===id)),
  preferences:{...current.preferences,style,...(explicit('buildSource')?{buildSource:incoming.preferences.buildSource}:{}),...(explicit('presentation')?{presentation:incoming.preferences.presentation}:{}),...(explicit('autoCheck')?{autoCheck:incoming.preferences.autoCheck}:{}),...(explicit('autoSync')?{autoSync:incoming.preferences.autoSync}:{}),
   ...(Object.hasOwn(backup.preferences||{},'play')?{play:incoming.preferences.play}:{}),
   ...(Object.hasOwn(backup.preferences||{},'rolePools')?{rolePools:incoming.preferences.rolePools}:{}),
   ...(Object.hasOwn(backup.preferences||{},'autoLive')?{autoLive:incoming.preferences.autoLive}:{}),
   ...(Object.hasOwn(backup.preferences||{},'guideAutoShow')?{guideAutoShow:incoming.preferences.guideAutoShow}:{}),
   ...(Object.hasOwn(backup.preferences||{},'guideAfterGame')?{guideAfterGame:incoming.preferences.guideAfterGame}:{}),
   ...(Object.hasOwn(backup.preferences||{},'clientCompanion')?{clientCompanion:incoming.preferences.clientCompanion}:{}),
   ...(explicit('pool')?{pool:incoming.preferences.pool.filter(id=>champions.some(c=>c.id===id))}:{}),...(explicit('poolMode')?{poolMode:incoming.preferences.poolMode}:{})},
  draft:current.draft?{...current.draft,style}:null,
 });
}
