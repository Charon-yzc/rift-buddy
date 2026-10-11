// Curated mechanism-based examples, not measured fastest clears or win-rate data.
// Champion mechanics checked against Riot pages and the bundled 16.20 spell data.
const profile=(slug,mechanics,beforeR,afterR,early=false)=>({
 mechanics,beforeR,afterR,early,
 sources:[`https://www.leagueoflegends.com/en-us/champions/${slug}/`,`https://mobalytics.gg/lol/champions/${slug}/guide`]
});
export const JUNGLE_PROFILES={
 Nocturne:profile('nocturne','Q覆盖营地后在影径穿插普攻，被动帮助范围清野与续航；6级前优先经验。','让队友先控住，再用Q贴近接E；目标离开恐惧范围就别深追。','先和队友确认目标与跟进距离，再用R切入接E；W留给关键控制。'),
 Diana:profile('diana','技能后穿插普攻，Q覆盖多目标、W贴营地吸收伤害；6级R解锁后才按拉拽团战找配合。','先等队友控制，再Q命中接E；没有R时别按多人拉拽方案进场。','先沟通队友伤害能否跟上；Q命中接E近身，再用R留人，别独自冲入多人。'),
 Ivern:profile('ivern','翠神靠被动画圈与成熟释放野怪，不套普通攻击六营路线；画圈消耗生命与法力，惩戒可立即释放，成熟以游戏内显示为准。','队友能接时Q留人，E套给贴近目标的队友；不要让远处队友为了跟Q强行进场。','先让黛西和队友接触目标，Q留人、E给进场者；别为了追击把队友留在后面。'),
 JarvanIV:profile('jarvaniv','E旗帜提供攻速，Q尽量覆盖营地；被动首击帮助清野。前三营后可检查近处兵线，没有窗口继续清。','队友就位后EQ挑起接W；EQ也是撤离手段，不要空交后继续追。','先确认队友能进场，再EQ或R留人；R地形别挡住己方输出和退路。',true),
 Vi:profile('vi','技能命中触发被动护盾，普攻叠W、E覆盖多目标；清野与抓人之间保住经验节奏。','先让队友控住或走近，再用Q；Q落空就撤，不把唯一进场技能空掉后硬追。','R可以锁定目标接控制；进场前确认队友距离，别越过整队独自追后排。'),
 LeeSin:profile('leesin','技能后穿插被动强化普攻回能量，W帮助续航；前三营后检查近处机会，没有窗口就接着清。','先走近或W接近再Q；Q命中也不必立刻二段飞入，保留退路。','先沟通把目标踢向谁，避免把敌方前排踢进己方后排；缺少跟进就留R保护队友。',true)
};
export function junglePlan(champion,start,side){
 const p=JUNGLE_PROFILES[champion],special=champion==='Ivern';
 const camps=start==='blue'?['蓝BUFF','魔沼蛙','三狼','锋喙鸟','红BUFF','石甲虫']:['红BUFF','石甲虫','锋喙鸟','三狼','蓝BUFF','魔沼蛙'];
 const opening=special?[`${start==='blue'?'蓝BUFF → 魔沼蛙 → 三狼':'红BUFF → 锋喙鸟'}依次画圈；血蓝不足可缩短`,`${start==='blue'?'转红BUFF → 锋喙鸟':'转蓝BUFF → 魔沼蛙 → 三狼'}画圈；惩戒可立即释放选定营地`,'沿安全方向回收实际已成熟的营地，不盲等','回收后比较邻线配合或补给','石甲虫按实际状态与成熟情况补']:camps;
 const end=side?(side==='blue'?(start==='blue'?'下路':'上路'):(start==='blue'?'上路':'下路')):null;
 return {opening,special,profile:p,routeTitle:special?'画圈与回收示例':p?.early?'三营检查 → 无机会接着刷':'六营发育示例',
  finish:special?'回收方向按实际安全与成熟情况调整':end?`完整示例结束靠近${end}；中路机会顺路比较`:'出生方未知：暂不指定结束靠近哪条边路',
  compactRoute:special?['画圈 → 转半区 → 安全回收']: [camps.slice(0,3).join(' → '),camps.slice(3).join(' → ')],
  checkpoint:p?.early?'前三营后自己检查邻线；没有可靠机会就继续后三营，不蹲等。':'保住经验与回城节奏；遇到近处可靠机会可以提前停刷，不强行刷满。'};
}
