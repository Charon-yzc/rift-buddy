import {independentCooperationAction} from './shared-cooperation.mjs';

// A conditional map plan, not a claim about winning a duel or observed vision.
// The player must confirm side-lane pressure, spell ranges and every arrival.
const sidelanes=new Set(['Fiora','Camille','Jax','Tryndamere','Yorick','Trundle']);
const supportMoves={
 TwistedFate:'先用 Q/普攻清中线，锁好实际黄牌；R 可用且边线在实际传送范围内、落点安全时才支援，黄牌命中后接 Q/普攻，不预设亮牌就能抓到。',
 Shen:'先管自己的兵线，R 可用且目标能承接引导时再支援；落地 E 实际嘲讽后 Q/普攻，W 按剑的位置保护，不把护盾当必定完成传送。',
 Nocturne:'先保安全营地，R 可用且目标在实际距离内时才支援；Q/普攻维持 E 到实际恐惧，W 留反击，不把飞到当已经留人。',
 Galio:'先用 Q/被动处理兵线，R 可用且边线友军在实际范围内才选落点；延迟落地后 E/W 错开接控，不把魔法盾当通用免伤。',
 Taliyah:'先清线再看 R 墙体的实际路径与落点，安全才转场；到场 E/W 接同一目标，不让墙挡住己方回撤，也不把墙当伤害。',
 Pantheon:'先处理本局兵线或营地，R 可用且实际落点安全才转场；落地 W 实际眩晕后 Q/普攻，E 留反击，不单凭大招覆盖决定越塔。',
};
export function sidePressureRoute(members,graph){
 const side=members.find(m=>m.role==='top'&&sidelanes.has(m.champion));
 const mover=members.find(m=>m!==side&&supportMoves[m.champion])||members.find(m=>m!==side&&m.role==='jungle');
 if(!side||!mover)return null;
 const name=m=>graph.byId.get(m.champion).name;
 const memberJobs=members.map(m=>({role:m.role,champion:m.champion,job:m===side?
  `${independentCooperationAction(m.champion)} 本轮负责安全边线，先报兵线到达与退出方向；只在公开敌人动向和队友接应允许时前推，多人消失就收线回撤，不把单挑能力当已确认能赢。`:
  m===mover?`${supportMoves[m.champion]||independentCooperationAction(m.champion)+' 先保安全营地，报实际步行到场时间；只沿已确认安全入口接应边线，不假定有全图转场技能。'} 本轮在边线接应与中路留守之间先约定；技能、路径或落点条件缺失就留守，不要求边线空等。`:
  `${independentCooperationAction(m.champion)} ${m.role==='jungle'?'本轮保安全营地并照看中路与边线之间的入口，报能到哪侧；不与边线抢整波兵，也不越过视野独自先开。':m.role==='support'?'本轮跟留守成员守中路与撤退口，先有同行保护才布入口视野；接应者离开后减少前压，不独自追边线。':'本轮处理安全中线，保持与留守成员的保护距离；接应者离开时退到能清线的位置，不先开人数不足的团。'}`}));
 return {id:'side-pressure',label:'边线牵制与抓边',tempo:'early',memberJobs,
  step:`${name(side)}处理安全边线并报退出方向；${name(mover)}先处理本局资源，再按实际到场时间与技能距离接应；其他成员守中线与入口。边线出现可确认的单个目标才决定抓边，资源争夺前先约继续牵制还是取消分线会合，不同时要求两边深入。`,
  condition:'玩家确认边线兵线、公开敌人动向、接应者实际到场时间与技能范围、安全路径和回撤方向；留守成员能安全清线。分区行动是本轮约定，不要求全员同时到同侧；助手没有读取视野或敌方即时位置。',
  failure:'多人消失、边线遭包夹、支援无法及时到场或中路守不住时，边线先撤、接应者取消危险转场，留守者收缩。资源窗口逼近时重新约定分线或会合，不让留守成员硬开等边线赶到。'};
}
