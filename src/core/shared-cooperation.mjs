import {COOPERATION_SKILLS,SKILL_COOPERATION_PATCH,SKILL_COOPERATION_REVIEWED_AT} from './cooperation-skills.mjs';

// Independent kit actions for groups without a reviewed relay. These do not
// assume a teammate has immobilized the target. Other reviewed actions already
// state their own prerequisites and can be reused without a control trigger.
const ACTIONS={
 Khazix:'先看目标是否实际孤立，能安全接触才 Q/普攻，E 留安全进退。',
 Gwen:'能安全接触时 E/普攻叠当前 Q 层数，Q 中心跟伤害，W 留自身输出空间。',
 AurelionSol:'E 铺实际可覆盖的位置，在安全距离 Q 持续输出；W 留安全飞行路线。',
 Garen:'能安全近身时 Q/普攻沉默，再 E 保持接触，W 留反击；沉默不会把敌人定在原地。',
 Yone:'能安全接触才普攻/Q/W；Q 三段按实际层数，E 原身放安全位置再短轮次进场。',
 Kayn:'按实际形态 W/Q 做短轮次，E 留安全地形路线，R 若用先确认目标可进入。',
 Katarina:'Q/W 布实际匕首，E 只选安全落点；敌方关键打断已交才考虑可用 R。',
 Darius:'能安全近身才 W/普攻与 Q 外圈，E 留反击，按实际出血层数继续短轮次。',
 KogMaw:'W 实际可用时在安全攻击距离普攻，Q 命中后跟同一目标，E 铺退出路线，R 保留法力。',
 MissFortune:'E 覆盖实际可触及区域，Q/普攻做安全短轮次；R 可用且有安全引导空间时再使用。',
 Sivir:'Q 对准实际可触及目标，W 普攻利用实际弹射目标，E 留给会命中自己的关键技能。',
 Kaisa:'安全普攻叠实际电浆，Q 看附近分摊目标，W 从无遮挡方向补标记，E 留调整。',
 Samira:'普攻与不同技能交替接当前连招，W 留拦实际飞行弹体，E 只去能接应的落点；没有友军实际控制就不安排控制后的被动跟进。',
 Yunara:'Q 当前可开启时保持安全普攻接触，W 覆盖实际可触及位置，E 留调整与退出。',
 MasterYi:'能安全持续接触才普攻/E，Q 只去结束位置有接应的目标，W 留自己承接反击。',
};
const key=m=>m.role+':'+m.champion;
export function sharedCooperationPlan(members,graph){
 if(![2,3].includes(members.length)||members.some(m=>!graph.byId.has(m.champion)||!COOPERATION_SKILLS[m.champion]||COOPERATION_SKILLS[m.champion][3])||new Set(members.map(key)).size!==members.length||new Set(members.map(m=>m.champion)).size!==members.length||new Set(members.map(m=>m.role)).size!==members.length)return null;
 const name=id=>graph.byId.get(id).name;
 const opening=members.map(m=>`${name(m.champion)}${m.role==='jungle'?'先按安全营地发育，报清野与到位时间':m.role==='support'?'围绕搭档安全补刀与经验，离线前报去向':'先处理自己的兵线，报可离线时间'}`).join('；')+'。会合前先确认实际技能、资源与退路，任何人不能到场就继续各自发育。';
 const economy=(members.some(m=>['top','mid','bottom'].includes(m.role))?members.filter(m=>['top','mid','bottom'].includes(m.role)).map(m=>name(m.champion)).join('、')+'保留各自兵线；':'')+(members.some(m=>m.role==='jungle')?'打野保留安全营地，不空等抓人；':'')+(members.some(m=>m.role==='support')?'辅助不与搭档争抢补刀；':'')+'转资源前先报兵线、营地与到场时间，不要求队友为了个人叠层、标记或猜测的强势期让出经济。';
 const conditions=['没有已核对的稳定控制衔接；先由每位玩家确认当前技能、层数、形态与退出路线，不按时间推算就绪。','只有成员确实到位、共同目标可安全接触且退路可用时，才在约定位置做短轮次；会合不等于必须开团。'];
 const failures=['任何成员无法到位、目标离开可接触距离或退出路线被封，就取消这轮会合，回各自兵线或安全营地。','自保与自疗不当作给队友的保护；不要把减速、沉默或预期击杀当成已成立的硬控与刷新。'];
 const steps=['先各自处理兵线或安全营地，报能到场的时间；等待成员实际确认自己的技能与资源。','确认共同目标、实际到场位置和退路，按各自技能条件做短轮次；没有安全接触机会就不交位移深入。','有人赶不到、技能落空或目标退出覆盖就一起停止追击，各回资源；下一次会合重新确认条件。'];
 const memberJobs=members.map(m=>{const row=COOPERATION_SKILLS[m.champion];return {...m,job:`${ACTIONS[m.champion]||row[0]} 成立前先确认：${row[1]} 停止条件：${row[2]}`};});
 return {kind:'shared',name:'共同分工 · 发育与会合',members:members.map(m=>({role:m.role,champion:m.champion})),edges:[],memberJobs,relaySteps:steps,steps,opening,economy,conditions,failures,tempo:'growth',bonus:0,
  why:members.map(m=>name(m.champion)).join('、')+'先保各自资源，再按实际到位与技能条件会合；这套没有已核对的稳定控制接力。',
  sourceNote:'共同分工：按已核对的各自技能安排发育、会合与退出；没有确认独特组合协同，未经组合对局验证，不代表统计优势。',patch:SKILL_COOPERATION_PATCH,reviewedAt:SKILL_COOPERATION_REVIEWED_AT,sourceUrls:members.map(m=>`https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/champion/${m.champion}.json`)};
}
