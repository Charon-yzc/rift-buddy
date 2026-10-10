import {requireBuildSource,normalizeBuildSource,sameBuildSource,preferBuildReference} from './build-source.mjs';

export const OPPONENT_SCOPE_EVIDENCE='source-item-section-query-and-core-sample-match';
export function opponentBuildKey(champion,role,opponent,source,patch){
 const s=requireBuildSource(source);return [champion,role,opponent,s.region,s.tier,patch].join(':');
}
export function selectedOpponentBuild(data,champion,role,opponent){
 const source=normalizeBuildSource(data.buildSource),parts=p=>/^\d+\.\d+$/.test(p||'')?p.split('.').map(Number):null,current=parts(data.patch);
 let selected=null;
 for(const [key,ref] of Object.entries(data.opponentBuildSources||{})){
  const patch=parts(ref?.patch);
  if(!ref||ref.champion!==champion||ref.role!==role||ref.opponent!==opponent||ref.scope!=='specific-opponent'||!sameBuildSource(ref,source)||!patch||!current||patch[0]>current[0]||patch[0]===current[0]&&patch[1]>current[1])continue;
  if(key===opponentBuildKey(champion,role,opponent,ref,ref.patch)&&preferBuildReference(ref,selected))selected=ref;
 }
 return selected;
}
export function validOpponentScope(ref,champion,role,opponent,data){
 const target=data.champions.find(c=>c.id===opponent),positions={top:'top',jungle:'jungle',mid:'mid',bottom:'adc',support:'support'};
 if(!target||target.id===champion.id||ref?.opponent!==opponent||ref.scope!=='specific-opponent'||ref.scopeEvidence!==OPPONENT_SCOPE_EVIDENCE||ref.roleSamples!==null||ref.matchups!==undefined)return false;
 try{const u=new URL(ref.sourceUrl);return u.origin==='https://op.gg'&&u.pathname===`/lol/champions/${champion.id.toLowerCase()}/build/${positions[role]}`&&['region','tier','patch'].every(k=>u.searchParams.get(k)===ref[k])&&u.searchParams.get('target_champion')===opponent.toLowerCase();}catch{return false;}
}
