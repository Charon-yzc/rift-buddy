import {RULES_PATCH,RULES_VERSION} from './rules.mjs';
import {catalogPlanCurrent,catalogPlanGroups} from './catalog-choice.mjs';
import {comboMembers} from './combo-members.mjs';
import {reviewedCatalogEntry} from './mechanic-review.mjs';
export function dataStatus(data,build,{refreshing=false,error=''}={}){
 const catalog=data.catalog;
 const patch=build?.combo?.patch||catalog?.patch||RULES_PATCH,date=build?.combo?.reviewedAt||catalog?.reviewedAt||RULES_VERSION;
 const plan=build?.combo?.creativePlan,groups=catalogPlanGroups(plan),group=plan?.curated||plan?.shared?.routes?.[0]?.loadoutGroup;
 const hasBinding=!!plan&&(plan.archetype==='curated'||groups.length>0);
 const planCurrent=!hasBinding||catalogPlanCurrent(plan,catalog,data.catalogInfo?.status,data.patch);
 const direct=!plan&&build?.combo?.id?[...(catalog?.duos||[]),...(catalog?.trios||[])].find(entry=>entry.id===build.combo.id):null;
 const directCurrent=direct&&reviewedCatalogEntry(direct,data.catalogInfo?.status,data.patch)&&comboMembers(direct).some(member=>member.champion===build.champion&&member.role===build.role);
 const comboState=data.catalogInfo?.status?.[group?.id||direct?.id];
 const optionalCompatible=!!comboState?.optionalCompatible&&(plan?!!group&&planCurrent:!!directCurrent);
 const comboStale=patch!==data.patch||!planCurrent||comboState?.stale&&!optionalCompatible;
 return {
  base:`基础资料 ${data.version} · 国服版本未核实`,
  build:refreshing?'当前配置正在刷新':error?`配置刷新未完成：${error}`:build?.reference?`当前配置 ${build.reference.patch} · 获取 ${new Date(build.reference.fetchedAt).toLocaleDateString('zh-CN')}`:build?`配置整理 ${build.rulesPatch} · ${build.rulesDate}${build.stale?' · 待复核':' · 机制参考'}`:'配置按英雄与位置获取',
  combo:`组合规则 ${patch} · 整理 ${date}${optionalCompatible?' · 备选需调整':comboStale?' · 待复核':' · 机制参考'}`,
  ...(build?.sourceOpponent?{sourceScope:`配置来源筛选：对 ${data.champions.find(c=>c.id===build.sourceOpponent)?.name||build.sourceOpponent}；这只是参考条件，本局实际对手仍需确认。`}:{}),
 };
}
