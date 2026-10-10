import {duoPlay} from './duo-plays.mjs';
import {comboMembers} from './combo-members.mjs';

const key=m=>m.role+':'+m.champion;
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const identifier=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(v);

// Store the accepted catalog text and loadout bindings. A catalog ID alone
// cannot recover the original instructions after that entry is edited.
export function curatedDescriptor(combo,data){
 if(!combo)return null;
 const members=comboMembers(combo).map(({role,champion})=>({role,champion})),play=members.length===2?duoPlay(combo,data):null;
 const ordered=members.map(m=>({role:m.role,champion:m.champion,job:combo.members?.find(p=>key(p)===key(m))?.job||duoPlay(combo,data,m)?.ownJob}));
 const early=play?.early||combo.early,economy=play?.economy||combo.economy;
 if(![2,3].includes(members.length)||ordered.some(m=>!m.job)||!early||!economy)return null;
 const sources=[...(combo.sources||[]),...(play?.sources||[])].filter((s,i,a)=>a.findIndex(p=>p.url===s.url)===i);
 return {archetype:'curated',archetypeName:'已整理组合',name:combo.name,tempo:combo.tempo,members,ordered,
  why:combo.why,plan:combo.plan,steps:play?.steps||combo.steps,window:play?.window||combo.window,caution:play?.risk||combo.risk,
  feasibility:'人工整理的技能配合与分工，未经组合对局验证；不代表统计优势。',patch:combo.patch,dataVersion:data.version,rulesVersion:data.catalog?.version||combo.reviewedAt,
  curated:{id:combo.id,kind:members.length===3?'trio':'duo',reviewedAt:combo.reviewedAt,early,economy,sources,
   members:members.map(m=>({...m,loadoutId:combo.members?.find(p=>key(p)===key(m))?.loadoutId||combo.loadouts?.[m.role]||'default'}))}};
}

export function validateSavedCurated(value,members){
 if(!value||!identifier(value.id)||value.kind!==(members.length===3?'trio':'duo')||!Array.isArray(value.members)||value.members.length!==members.length)throw Error('整理组合与保存成员不一致');
 const result={id:value.id,kind:value.kind};
 for(const [field,max] of [['reviewedAt',40],['early',1000],['economy',1000]]){if(!text(value[field],max))throw Error('整理组合的前期与经济说明不完整');result[field]=value[field];}
 result.members=value.members.map((m,i)=>{if(key(m)!==key(members[i])||!identifier(m.loadoutId))throw Error('整理组合的配置关联不一致');return {...members[i],loadoutId:m.loadoutId};});
 if(!Array.isArray(value.sources)||value.sources.length>20)throw Error('整理组合来源不正确');
 result.sources=value.sources.map(s=>{
  if(!s||!text(s.name,200)||!text(s.url,1200))throw Error('整理组合来源不完整');
  let url;try{url=new URL(s.url);}catch{throw Error('整理组合来源地址不正确');}
  if(url.protocol!=='https:'||url.username||url.password)throw Error('整理组合来源地址不正确');
  const source={name:s.name,url:s.url};
  for(const field of ['kind','checkedAt'])if(s[field]!==undefined){if(!text(s[field],80))throw Error('整理组合来源说明不正确');source[field]=s[field];}
  return source;
 });
 return result;
}
