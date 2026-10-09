// Preparation checkpoints, not a time-based strength ranking. The player must
// confirm levels/items/stacks/skills in game; none of these are observed here.
const groups=[
 ['growth','Kayle','先保经验；确认当前等级的攻击形态再决定射程，R 已学会且可用才安排免伤接力。'],
 ['growth','Nasus','先用 Q 补刀积累实际层数；R 可用且能持续接触目标时才安排近身输出，不默认高层数。'],
 ['growth','Veigar','Q 补刀和实际被动成长先于游走；E 限制路线后再 W/Q，不把围栏中央当成已眩晕。'],
 ['growth','Smolder','先确认实际被动层数和 Q 的当前效果；不到对应成长条件不按升级后的范围/收尾能力作战。'],
 ['growth','AurelionSol','先保证兵线与实际星尘成长；Q 有安全引导角度、W 有退路时再向资源移动。'],
 ['growth','Senna','先确认当前射程和灵魂成长；按本局位置承担经济，不能默认已有远距离持续输出。'],
 ['items','Jinx KogMaw Vayne Twitch Yunara','核心装备与保护到位后持续攻击安全目标；保护交掉或无法持续接触就退出，不凭游戏分钟数判断成型。'],
 ['base','LeeSin','Q 命中且二段落点安全才跟；每次技能后普攻回能。R 已学会且可用才安排踢回/踢飞。'],
 ['base','Darius','E/W 能留人且 Q 外圈有空间时找短轮次；持续接触后才可能叠满出血，R 另行确认。'],
 ['base','Warwick','Q/普攻能持续接触、E 能承接反击时作战；低血续航不是免伤，R 就绪才安排压制。'],
 ['base','XinZhao','W 刺击命中再 E 接近，能实际完成 Q 三击才有击飞；R 就绪不等于能扛圈内集火。'],
 ['base','Renekton','先确认实际怒气再决定强化技能；E 保留回撤路线，不把未储存的怒气算入换血。'],
 ['base','Elise Nidalee','先核对当前形态技能与资源，远程技能实际命中、近身落点安全才切换跟进；不等一个不存在的六级大招。'],
 ['ultimate','Malphite Amumu Orianna Galio Nocturne','关键 R 已学会且可用、队友在跟进/支援距离内才约一波；R 未就绪先清线发育或用基础技能反打。'],
 ['ultimate','Zed','R 已学会且可用、能量与影子回撤位置可靠才安排切入；六级前用 W/E/Q 短换血。'],
 ['ultimate','Kindred','R 已学会且可用才安排不死区域；印记与装备按实际状态确认，R 同样保护范围内敌人。'],
 ['ultimate','Yasuo','Q 旋风可先提供自己的击飞；队友实际击飞且 R 可用时才接大，不把没有兵线的场景当 E 可自由突进。'],
];
const windows=new Map(groups.flatMap(([kind,ids,condition])=>ids.split(' ').map(id=>[id,{kind,condition,patch:'16.20'}])));
export const championWindow=id=>windows.has(id)?{...windows.get(id)}:null;

export const SUSTAIN_CONDITIONS={
 Darius:'能持续近身同一目标，以普攻/伤害技能叠出血；距离断开时不能兑现满层。',
 Nasus:'实际 Q 层数、R 就绪和持续接触同时影响输出，不默认高层数。',
 Warwick:'持续普攻/Q 接触目标，低生命目标的攻速条件由玩家确认。',
 XinZhao:'持续普攻/Q 完成三击与冷却推进，目标脱离时中断。',
 Udyr:'持续普攻配合当前姿态，觉醒与姿态状态另行确认。',
 Volibear:'普攻叠被动，W 重复命中同一目标；换目标不沿用原收益。',
 Nocturne:'Q 影径内持续普攻，E 需保持连接；不能把只飞入一次当持续输出。',
 Graves:'保持普攻距离并管理弹药/装填，不把每一刻都当满弹。',
 Urgot:'W 与被动腿炮依实际方向和状态持续输出，不默认所有腿炮可用。',
 Teemo:'安全普攻兑现 E 持续伤害，不能为保持输出走进控制。',
 Brand:'技能实际命中维持被动燃烧与叠层，脱离命中条件不能持续刷新。',
 Lillia:'技能命中维持被动灼烧并保留移动空间，不按站桩攻击规划。',
 Malzahar:'E 持续伤害与虚灵需要实际目标和存活空间，R 被打断时不预设完整收益。',
 Mordekaiser:'实际触发被动并维持近身范围；无法接触目标时收益下降。',
 Rumble:'Q/大招区域实际覆盖，过热与热量由玩家核对，不保证全程命中。',
 Singed:'毒径实际覆盖目标的路径，不能靠直线追击保证持续伤害。',
 Swain:'R 已学会且可用、能维持与敌人接触时持续作战；断开后不能预设维持。',
 Zyra:'技能激活植物且植物仍存活、目标在射程内，不能把植物当可追击单位。',
 Heimerdinger:'炮台实际存在且目标在覆盖区内，离开阵地后不能照搬持续火力。',
};
