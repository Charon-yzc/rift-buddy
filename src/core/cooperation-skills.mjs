// Conditional actions checked against Riot's 16.20.1 English champion JSON.
// These general follow-ups expand beyond hand-authored pairs. They are not
// unique synergies, measured advantages, or a claim that every pairing works.
export const SKILL_COOPERATION_PATCH='16.20';
export const SKILL_COOPERATION_REVIEWED_AT='2026-10-10';
// [follow-up, prerequisite, stop condition, optional opener + its prerequisite]
export const COOPERATION_SKILLS={
 Ahri:['接已命中的限制从小兵侧面 E，再 Q/W，留 R 接应退出。','E 路线无遮挡，R 若使用须已学会。','魅惑被挡就停止强接，别预交全部位移。','E 魅惑实际命中后报同一目标。','E 路线无遮挡且目标实际被魅惑。'],
 Annie:['先确认被动可眩晕，再 Q/W 接控，R 已可用时补范围伤害。','被动眩晕状态已就绪，相关技能可用。','被动未就绪不要把普通 Q 当眩晕。','被动就绪的 Q 或 W 实际眩晕后报目标。','被动眩晕已就绪，施法距离内实际命中。'],
 Amumu:['Q 错开已有控制再接，贴身 W/E；R 可用才继续范围控制。','Q 路线与落点安全，R 若使用须已学会。','绷带被挡或队友接不到落点就退出。','Q 实际命中并眩晕，再报自己落点。','Q 路线不被其他单位挡住，队友能到达落点。'],
 Jax:['已有控制后 Q/普攻接 W，E 留反击，预留可 Q 回撤单位。','有安全接近角度和可用的回撤目标。','没有退路不为接伤害跳进敌后。','安全 Q 接近，E 实际眩晕后报目标。','E 已可用并实际眩晕，仍有可 Q 回撤单位。'],
 Lillia:['先用 Q 外圈或 E 挂梦尘；R 若可用报入睡时间，W 中心留实际睡眠后。','目标有实际梦尘，R 已学会可用才安排睡眠。','昏昏欲睡阶段先等，未入睡不提前当作定身。','已有梦尘再 R，等目标实际入睡才报唤醒轮次。','R 已学会可用，目标实际带梦尘且已入睡。'],
 Lux:['Q 接实际控制，E 覆盖同一位置，R 可用时跟伤害，W 留反击。','Q 的前方单位不会耗尽两目标命中数。','Q 被前排单位挡住或目标离开就停。','Q 实际禁锢后报同一目标。','Q 实际命中目标，不能只确认飞弹已放出。'],
 Morgana:['Q 错开已有控制，W 铺实际落点，E 留给会吃限制的队友。','Q 路线无遮挡，E 不提前无目的交掉。','Q 落空不为 R 锁链硬走进多人范围。','Q 实际禁锢后报同一目标。','Q 路线无遮挡，双方能跟进该位置。'],
 Pantheon:['W 接在实际控制之后，Q 跟伤害，E 朝主要反击方向留退路。','W 能到达，E 方向覆盖实际威胁。','E 不防背后伤害，队友没到先退。','W 到达并实际眩晕后报目标。','目标在 W 实际施法范围内，落点有人接应。'],
 Renekton:['接控制 W/普攻与 Q，E 预留退出；按实际怒气决定强化技能。','能近身同一目标，强化效果要看实际怒气。','怒气不足不按强化 W 的控制时长安排。','W 实际眩晕后报目标，说明当前怒气。','W 已可用并能近身，不预设强化怒气。'],
 Sett:['已有控制后普攻/Q，W 按实际豪意调整中心，E 留反击。','W 伤害看实际豪意，能保持安全近身。','不为攒豪意主动承受多人伤害。','E 两侧有敌方单位，实际眩晕才报接力。','E 两侧实际都有敌方单位；只有一侧时仅减速。'],
 Syndra:['已有控制后 Q 球接 E 推球，W/Q 跟伤害，推球方向留队友接触空间。','实际存在可推的球，E 与球路径覆盖目标。','普通 E 推开不等于球命中眩晕，别推离近战队友。','Q 球被 E 推中目标并实际眩晕后报接力。','有实际 Q 球，目标被推球命中而非只被 E 推开。'],
 Taliyah:['E 铺实际落点再 W 抬过岩场，Q 跟伤害，留开阔退路。','E/W 可用且能让目标实际经过岩场。','W 落空就退，不把岩场区域当必定眩晕。','E 铺区后 W 抬过岩场，实际眩晕才报接力。','E/W 已学会可用，位移实际触发岩场眩晕。'],
 Veigar:['E 区域限制退路，W 对准实际控制落点再 Q，保持安全距离。','W 落点覆盖目标实际停留位置。','站在 E 圈内不等于被眩晕，不为补伤害近身。','目标实际触碰 E 边缘眩晕后报接力。','E 已成形，目标实际碰到边缘而非只站在圈内。'],
 Vex:['恐惧就绪才用基础技能接控，Q/E 跟伤害；R 实际命中后再评估二段。','被动恐惧状态实际就绪，R 若用须命中且落点安全。','恐惧未就绪不按硬控衔接，R 落点失去接应就不二段。','恐惧就绪的基础技能实际命中后报目标。','被动恐惧实际就绪，基础技能命中并触发恐惧。'],
 Vi:['Q 或已可用 R 错开已有控制，普攻/E 跟进，落点留队友输出距离。','Q/R 实际可用，选定落点在队友接应范围。','目标被带到队友够不到处就停止追进。','Q 实际击退，或已可用 R 实际击飞后报落点。','使用的 Q/R 已学会可用，控制实际发生。'],
 Volibear:['Q 错开已有控制，E 覆盖自身与目标，W 接触后等实际二次使用窗口。','Q/E 可用，二次 W 必须仍是已标记目标。','不因有 R 就预设能够安全越塔。','Q 强化普攻实际眩晕后报目标。','Q 已可用，强化普攻实际命中且队友能接触。'],
 Warwick:['接近后 Q/普攻，E 留承接反击；R 可用且方向安全才补压制。','R 需实际命中，E 恐惧需目标仍在附近。','目标离开 E 范围或 R 跳不到就退出。','附近 E 实际恐惧，或可用 R 实际压制后报目标。','使用的技能已学会可用，控制实际发生并有人接应。'],
 Graves:['确认弹药与无遮挡普攻线，再普攻/Q；靠墙可安排 Q 回弹，E 留调整或退出。','弹药实际可用，普攻弹丸不会被前方单位挡住。','换弹或目标被单位遮挡就收缩，不把 E 当魔抗保护。'],
 Khazix:['接实际控制后 Q/普攻，先看孤立再判断收益，E 留安全进退。','是否孤立、技能进化与可用跳跃均以当前状态为准。','无孤立不按孤立伤害追击；未进化 E 不预设击杀刷新。'],
 Belveth:['W 错开已有控制再 Q/普攻接触，E 留承接反击，保留可用 Q 方向退出。','Q 方向实际可用，E 会优先攻击范围内低血量单位。','不预设已有珊瑚或真形，E 无法自由锁定指定英雄。','W 实际击飞后报同一目标，保留 Q 退出方向。','W 已可用并实际命中，队友能接近落点。'],
 Gwen:['接控制后 E/普攻叠当前 Q 层数，Q 中心跟伤害，W 留自身输出空间。','Q 按实际层数与中心命中安排，W 只保护格温自己。','队友不会被 W 一起保护，无法接触目标就退。'],
 AurelionSol:['E 铺实际控制落点，再在安全距离 Q 持续输出；W 留安全飞行路线。','有可持续引导 Q 的空间，R 形态看实际星尘状态。','不预设强化 R，目标离开区域或被逼近就停止站桩。'],
 Aurora:['Q 命中后安排回收，E 留后撤，R 可用时覆盖减速区并利用自身换边。','Q 实际命中，R 已学会可用才安排区域。','R 是减速区域，不把它当困住敌人的不可逃离墙体。'],
 Garen:['接实际控制后 Q/普攻沉默，再 E 持续接触，W 留反击。','能安全近身并保持 E 接触距离。','Q 沉默不阻止目标走开，无法接触就退出。'],
 Viktor:['W 铺实际落点，E/Q 与已可用 R 从安全侧覆盖，保持持续输出距离。','目标实际停留在 W 才可能眩晕，强化看当前状态。','目标离开 W 就不等必定眩晕，不为追 R 走入近战。'],
 Zed:['从安全影子角度 Q/E 接伤害，R 可用才考虑进场，保留可交换的影子退出。','能量足够，影子与 R 返回点仍能安全使用。','不预设印记必杀，影子退路消失就停止深入。'],
 Yone:['已有控制后普攻/Q/W；Q 三段按实际层数，E 原身放安全位置再短轮次进场。','Q 层数与 E 原身退路实际安全，R 若用须已可用。','原身被包围就不强进，不预设 Q 已叠好。'],
 Nocturne:['接近后 Q/普攻，E 保持距离等恐惧，W 留挡关键技能；R 可用再看范围。','E 连接未断，R 目标在实际施法范围且落点可接应。','R 不是全地图飞行，落点没人接应就不飞。'],
 Kayn:['控制命中后 W/Q 短轮次跟伤害，E 留安全地形路线，R 若用先确认目标可进入。','实际形态与技能可用为准，不预设已变身。','普通或蓝形态 W 不按红形态击飞安排；退路断开就停。'],
 Katarina:['接控制后 Q/W 布匕首，E 只选安全落点；敌方关键打断已交才考虑可用 R。','匕首实际落地，敌方打断与 E 回撤目标已确认。','没有实际击杀不预设刷新，R 会被打断时先停。'],
 Darius:['接控制 W/普攻与 Q 外圈，E 留反击，按实际出血层数继续短轮次。','能持续接触目标且 Q 外圈可命中。','不要求两位队友等满五层，更不为凑层数越塔。'],
 Fiora:['从可接触破绽侧 Q/普攻接伤害，W 留关键限制，R 可用再看绕破绽空间。','实际破绽方向与退出路线可到达。','不把普通 W 当眩晕，不为四破强留或穿过多人。'],
 Camille:['已有控制后 E 从安全墙体接近，Q 等二段，R 可用才留同一目标。','有可用墙体与队友接应，Q 二段按实际等待时间。','墙体落点没人接应就不跳，不为 Q 二段硬扛。','R 已可用时实际留住同一目标，再报区域与接应位置。','R 已学会可用，卡蜜尔仍在有效区域且队友能到位。'],
 Aatrox:['接实际控制用 Q 剑锋与 W 限制同一目标，E 留调整与退出。','Q 剑锋可覆盖，W 目标仍需留在拉回区域。','不把 W 挂上当必定拉回，无法接触就回兵线。'],
};

const memberKey=m=>m.role+':'+m.champion;
const source=id=>`https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/champion/${id}.json`;
export function createSkillCooperation(byId){
 const cache=new Map(),name=id=>byId.get(id).name;
 function edges(members){
  if(members.some(m=>!COOPERATION_SKILLS[m.champion]||!byId.has(m.champion)))return null;
  const leader=[...members].filter(m=>COOPERATION_SKILLS[m.champion][3]).sort((a,b)=>Number(a.champion==='Lillia')-Number(b.champion==='Lillia')||['jungle','top','mid','support','bottom'].indexOf(a.role)-['jungle','top','mid','support','bottom'].indexOf(b.role)||memberKey(a).localeCompare(memberKey(b)))[0];
  if(!leader)return null;
  return members.filter(m=>m!==leader).map(ally=>{
   const identity=memberKey(leader)+'|'+memberKey(ally);if(cache.has(identity))return cache.get(identity);
   const setup=COOPERATION_SKILLS[leader.champion],follow=COOPERATION_SKILLS[ally.champion];
   const edge={id:'skills:'+leader.champion+':'+ally.champion,family:'skills:'+leader.champion,name:'同目标控制与跟进',a:leader.champion,b:ally.champion,
    step:`${name(leader.champion)}：${setup[3]} ${name(ally.champion)}：${follow[0]}`,
    condition:`相关技能已学会可用，双方实际到位。${setup[4]} ${name(ally.champion)}：${follow[1]}`,
    failure:`${setup[2]} ${name(ally.champion)}：${follow[2]} 先手未实际成功就取消跟进。`,
    current:true,control:true,tempo:'teamfight',patch:SKILL_COOPERATION_PATCH,reviewedAt:SKILL_COOPERATION_REVIEWED_AT,sourceUrls:[source(leader.champion),source(ally.champion)]};cache.set(identity,edge);return edge;
  });
 }
 function coordination(members,edges){
  const leader=members.find(m=>m.champion===edges[0].a),ordered=[leader,...members.filter(m=>m!==leader)];
  const jobs=ordered.map((m,i)=>({...m,job:i?`等${name(leader.champion)}实际控制成功，再${COOPERATION_SKILLS[m.champion][0]}`:`先确认所有人能跟到同一目标，${COOPERATION_SKILLS[m.champion][3]} ${COOPERATION_SKILLS[m.champion][2]}`}));
  return {memberJobs:members.map(m=>jobs.find(j=>memberKey(j)===memberKey(m))),relaySteps:jobs.map(m=>name(m.champion)+'：'+m.job),
   opening:members.map(m=>`${name(m.champion)}${m.role==='jungle'?'先保安全营地，报告抓人路线；':m.role==='support'?'围绕搭档经验与安全补刀，游走前说明去向；':'先处理自己的兵线与回撤路线；'}`).join('')+'先约好同一目标与跟进距离，关键技能未学会、未就绪或成员赶不到就先发育。',
   economy:(members.some(m=>['top','mid','bottom'].includes(m.role))?members.filter(m=>['top','mid','bottom'].includes(m.role)).map(m=>name(m.champion)).join('、')+'保留各自兵线经济；':'')+(members.some(m=>m.role==='jungle')?'打野保留安全营地，不空等抓人。':'')+'转资源先报清线与到位时间，失败就各回兵线或营地，不为补损失连续追击。'};
 }
 return {edges,coordination};
}
