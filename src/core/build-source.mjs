// Deliberately limited to combinations verified against OP.GG's public ranked
// endpoint. The vendor does not publish a stable API contract.
export const BUILD_REGIONS=[{id:'global',name:'全球'},{id:'kr',name:'韩国'}];
export const BUILD_TIERS=[{id:'gold_plus',name:'黄金及以上'},{id:'emerald_plus',name:'翡翠及以上'},{id:'diamond_plus',name:'钻石及以上'}];
export const DEFAULT_BUILD_SOURCE=Object.freeze({region:'global',tier:'emerald_plus'});
export function validBuildSource(source){return !!source&&BUILD_REGIONS.some(r=>r.id===source.region)&&BUILD_TIERS.some(t=>t.id===source.tier);}
export function normalizeBuildSource(source){return validBuildSource(source)?{region:source.region,tier:source.tier}:{...DEFAULT_BUILD_SOURCE};}
export function requireBuildSource(source){if(!validBuildSource(source))throw Error('出装来源筛选不受支持');return {region:source.region,tier:source.tier};}
export function sameBuildSource(a,b){return validBuildSource(a)&&validBuildSource(b)&&a.region===b.region&&a.tier===b.tier;}
export function buildSourceLabel(source){return validBuildSource(source)?`${BUILD_REGIONS.find(r=>r.id===source.region).name}${BUILD_TIERS.find(t=>t.id===source.tier).name}排位`:'来源未确认';}
export function buildSourceKey(champion,role,source,patch){const s=requireBuildSource(source);return [champion,role,s.region,s.tier,patch].join(':');}
export function buildSourcePendingKey(patch,champion,role,source){return role==='hex'?[patch,champion,'hex'].join(':'):buildSourceKey(champion,role,source,patch);}
const patchParts=p=>/^[1-9]\d*\.[1-9]\d*$/.test(p||'')?p.split('.').map(Number):null;
const patchOrder=(a,b)=>{const left=patchParts(a),right=patchParts(b);return left&&right?Math.sign(left[0]-right[0]||left[1]-right[1]):null;};
export function preferBuildReference(next,current){
 if(!current)return true;
 const order=patchOrder(next.patch,current.patch);if(order!==0)return order===1;
 const revision=Number(next.parserVersion)||3,currentRevision=Number(current.parserVersion)||3;
 return revision>currentRevision||revision===currentRevision&&Date.parse(next.fetchedAt)>Date.parse(current.fetchedAt);
}
export function collectBuildSources(data){
 const entries={...(data.buildSources||{})};
 for(const ref of Object.values(data.builds||{}))if(validBuildSource(ref)&&ref.scope===undefined&&ref.opponent===undefined){
  const key=buildSourceKey(ref.champion,ref.role,ref,ref.patch);
  if(preferBuildReference(ref,entries[key]))entries[key]=ref;
 }
 return entries;
}
export function projectBuildSources(entries,source,patch){
 const selected=normalizeBuildSource(source),result={};
 for(const ref of Object.values(entries||{}))if(ref.scope===undefined&&ref.opponent===undefined&&sameBuildSource(ref,selected)&&[0,-1].includes(patchOrder(ref.patch,patch))){
  const key=`${ref.champion}:${ref.role}`;if(preferBuildReference(ref,result[key]))result[key]=ref;
 }
 return result;
}
export function selectBuildSource(data,source){
 const entries=collectBuildSources(data),selected=normalizeBuildSource(source);
 data.buildSources=entries;data.buildSource=selected;data.builds=projectBuildSources(entries,selected,data.patch);
 return selected;
}
export function selectedBuildReference(data,champion,role){
 const selected=normalizeBuildSource(data.buildSource),candidate=data.builds?.[`${champion}:${role}`];
 if(candidate?.scope===undefined&&candidate?.opponent===undefined&&sameBuildSource(candidate,selected))return candidate;
 return projectBuildSources(data.buildSources,selected,data.patch)[`${champion}:${role}`];
}
