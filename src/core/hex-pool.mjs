import observations from '../../data/hex-hero-observations.json' with {type:'json'};
import {hexCatalogDisabled} from './hex-catalog.mjs';
export {hexCatalogDisabled} from './hex-catalog.mjs';
import {validHexReference} from './builds.mjs';
import {hexAcquisitionRules} from './hex-mode-rules.mjs';
import {validHexPoolRecord} from './hex-pool-evidence.mjs';
import {hexAugmentAcquisition,hexHandbookAugments} from './hex-acquisition.mjs';
import {isCurrentHexData} from './hex-data-current.mjs';

// A reference table can be truncated; absence never proves exclusion.
// AugmentLevelData describes augment upgrades, not selection rounds.
export function hexHeroPool({data,hero,round=0,mechanism='unknown'}){
 const rules=hexAcquisitionRules({patch:data.patch,mechanism});
 const path=rules.paths.find(stage=>stage.id===round);round=path?round:0;
 const champion=data.champions.find(c=>c.id===hero),ref=data.hexBuilds?.[hero];
 const compatible=isCurrentHexData(data),current=compatible&&!!champion&&validHexReference(ref,champion,data)&&ref.patch===data.patch;
 const reference=new Set(current?ref.augmentIds:[]),bundled=compatible?validHexPoolEvidence(data.hexPoolObservations||observations,hero,data.patch):null,remote=current?validHexPoolRecord(ref.poolEvidence,hero,data.patch):null,evidence=remote&&(!bundled||Date.parse(remote.fetchedAt)>Date.parse(bundled.fetchedAt))?remote:bundled,selected=new Map((evidence?.rows||[]).map(r=>[r.id,r]));
 const source=`https://raw.communitydragon.org/${data.patch}/game/maps/modespecificdata/kiwi.bin.json`;
 const rows=hexHandbookAugments(data).map(a=>{
  const acquisition=hexAugmentAcquisition(data,a);
  const disabled=hexCatalogDisabled(data,a);
  const record=selected.get(a.id),status=disabled?'disabled':record?.games>0?'observed':record?.games===0?'unobserved':reference.has(a.id)?'reference':'unknown';
  if(acquisition.kind==='headliner-skill')return {id:a.id,status:'special',label:'主秀技能增强',reason:acquisition.note,sourceUrl:acquisition.sourceUrl,acquisition};
  const row={id:a.id,status,label:disabled?'资料禁用':round?path.kind==='regular'?'该轮未确认':'该来源未确认':status==='observed'?'有选取记录':status==='unobserved'?'样本未观察':status==='reference'?'来源有列':'英雄池待确认',
   reason:disabled?'当前补丁客户端目录显式禁用；不作为普通抽取候选。服务器热更新、转化及任务赠予另算。'+(record?.games>0?'站点仍有选取记录，不据此断言本局绝对拿不到。':''):round?(path.condition||'')+'现有来源没有该英雄在这条获取途径的完整池，不能用全局目录或推荐榜代替。':status==='observed'?'该英雄的站点样本中有 '+record.games+' 局选取记录；可能含转化／赠予，不证明具体轮次或直接抽取资格。':status==='unobserved'?'该来源的本补丁样本未观察到选取；不等于服务器禁止。':status==='reference'?'本版本该英雄来源页面列出此项；榜单可能截断，不是完整可获取池。':'尚无完整英雄资格规则；未上榜、零样本或不适合都不代表拿不到。',sourceUrl:disabled?source:record?evidence.sourceUrl:status==='reference'?ref.sourceUrl:null,...(record?{games:record.games,withheld:record.withheld}:{})};
  if(acquisition.unlock){row.acquisition=acquisition;row.reason+=' '+acquisition.note;if(!row.sourceUrl)row.sourceUrl=acquisition.sourceUrl;}
  return row;
 });
 return {hero:champion?{id:champion.id,name:champion.name}:null,patch:data.patch,round,rules,rows,evidence:evidence?{source:evidence.source,sourceUrl:evidence.sourceUrl,fetchedAt:evidence.fetchedAt,records:evidence.rows.length}:null,
  counts:Object.fromEntries(['disabled','observed','unobserved','reference','unknown','special'].map(status=>[status,rows.filter(r=>r.status===status).length])),complete:false,roundsComplete:false};
}

export function validHexPoolEvidence(snapshot,hero,patch){
 return snapshot?.schema===1&&snapshot.patch===patch&&snapshot.kind==='selected-game-counts'?validHexPoolRecord(snapshot.entries?.[hero],hero,patch):null;
}
