import {RULES_PATCH,RULES_VERSION} from './rules.mjs';
export function dataStatus(data,build,{refreshing=false,error=''}={}){
 const catalog=data.catalog;
 const patch=build?.combo?.patch||catalog?.patch||RULES_PATCH,date=build?.combo?.reviewedAt||catalog?.reviewedAt||RULES_VERSION;
 const comboStale=patch!==data.patch||data.catalogInfo?.status?.[build?.combo?.id]?.stale;
 return {
  base:`基础资料 ${data.version} · 国服版本未核实`,
  build:refreshing?'当前配置正在刷新':error?`配置刷新未完成：${error}`:build?.reference?`当前配置 ${build.reference.patch} · 获取 ${new Date(build.reference.fetchedAt).toLocaleDateString('zh-CN')}`:build?`配置整理 ${build.rulesPatch} · ${build.rulesDate}${build.stale?' · 待复核':' · 机制参考'}`:'配置按英雄与位置获取',
  combo:`组合规则 ${patch} · 整理 ${date}${comboStale?' · 待复核':' · 机制参考'}`,
  ...(build?.sourceOpponent?{sourceScope:`配置来源筛选：对 ${data.champions.find(c=>c.id===build.sourceOpponent)?.name||build.sourceOpponent}；这只是参考条件，本局实际对手仍需确认。`}:{}),
 };
}
