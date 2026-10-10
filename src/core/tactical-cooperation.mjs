import {COOPERATION_SKILLS,SKILL_COOPERATION_PATCH,SKILL_COOPERATION_REVIEWED_AT} from './cooperation-skills.mjs';

// Independently usable kit actions, not a control relay or measured synergy.
// Only the explicitly reviewed functions below can establish these plans.
// The player confirms resources, forms, stacks and safety; we observe none.
const actions={
 Jayce:{poke:'先确认炮形 Q/E 可用及弹道，炮形 Q 穿过加速门做远程消耗；锤形 E 留给被近身后的击退，不能把炮形消耗当作先手击退。'},
 Nidalee:{poke:'人形 Q 从无遮挡方向投标枪，W 陷阱观察入口，E 按实际需要回复友军；只有标枪或陷阱实际触发狩猎且豹形落点安全，才考虑切豹形跟进，落空就继续远程接应。'},
 Lux:{poke:'E 覆盖可触及位置消耗，Q 只投可靠角度，不要求队友等它命中才开始消耗；W 留给回撤的友军，R 已学会且可用才从安全位置补伤害。',guard:'W 覆盖约定核心及回撤路线，Q/E 留给实际靠近的追击者；Q 落空就缩短接触，护盾不等于能挡住所有控制。'},
 Galio:{guard:'站在输出与突进入口之间，用 W/E 阻止实际靠近的敌人；R 仅在已学会、可用且友军处于范围时接应其当时位置，不要求远程搭档先冲进去，也不独自 E 开团。'},
 Gragas:{poke:'Q 覆盖实际入口做远程试探，W 完成准备才短换血；E 留反突进，R 使用前报方向，不把敌人炸出队友覆盖区。',guard:'E 留给靠近核心的突进，R 已可用时先报击退方向；保护退路，不把目标炸到核心身边或队友够不到的位置。'},
 Ezreal:{poke:'Q 从不被小兵挡住的方向消耗，W 要实际触发才兑现；E 留回撤，Q 落空不前移补偿，不把被动攻速当无条件满层。',carry:'Q/普攻只打安全距离内的同一目标，E 留调整与退出；与保护者保持可接应距离，不为触发 W 追进。'},
 Karma:{poke:'Q 或实际可用的 RQ 先消耗，E 留给搭档进退；RQ 与 RE 共享当前 R 的选择，不把两种强化同时预交，W 需要维持连接。',guard:'E 给约定核心调整距离，需要群体撤退时才用当前可用的 RE；W 留限制近身目标，维持不了连接就先退，不同时预设 RQ 和 RE。'},
 Varus:{poke:'Q 从安全位置蓄力消耗，E 覆盖可触及路线，W 按实际可用状态和枯萎层数决定；R 已学会且可用时留防近身，蔓延禁锢也须实际发生，不因一发 Q 命中就追入。',carry:'普攻只打安全可触及目标，Q/E 按实际枯萎层数安排；R 已学会且可用时留打断靠近，蔓延禁锢也须实际发生，保护离开时先收缩输出距离。'},
 Zyra:{poke:'Q/E 配合实际种子生成植物覆盖入口，植物须存活且目标在范围内；E 留可靠限制，植物不能替队友探完所有视野，也不能追着目标移动。',guard:'E 对准实际突进入口，种子与技能在可覆盖位置生成植物；R 已可用时留核心附近反打，不为放植物离开接应距离。'},
 Ziggs:{poke:'Q 从安全角度试探，E 铺入口，W 留自己和队友撤退空间；目标离开覆盖就停，R 已学会且可用才补远程区域。'},
 Xerath:{poke:'Q/W 在安全站位做远程消耗，E 留实际靠近者；R 引导前先确认身边与退路，队友无法保护就不站定开大。'},
 Velkoz:{poke:'Q 选实际能命中的角度，W 铺可触及路线，E 留接近者；R 已可用且有安全引导空间才开，被迫走位就退出引导计划。'},
 Hwei:{poke:'Q 画作按实际目标距离与区域选择，E 留反突进，W 按实际需要支持进退；确认当前画作，不把不同画作的效果同时安排。'},
 Zoe:{poke:'Q 从安全角度拉开再改向，E 实际入睡才约定首次唤醒伤害；R 必须回原处，消耗前保起点，W 只用实际拾到的碎片，不提前普攻唤醒。'},
 Seraphine:{poke:'Q 从安全方向消耗，E 依目标当前减速或定身与自身回声决定效果；W 留回撤，不把单次 E 一律当禁锢。',guard:'W 围绕核心提供实际护盾与移速，E 限制追击路径，R 已可用才反打；治疗另看实际盾状态和延迟，不假定即时抬满血。'},
 Orianna:{poke:'Q/W 围绕球的实际位置消耗，E 留给受压友军；球离开有效位置就重布，R 未就绪不把消耗当大招进场。',guard:'E 把球交给实际受压核心，W 按球的位置帮助进退；R 仅在已可用且球覆盖追击者时反打，不把球默认留在核心身上。'},
 Morgana:{poke:'W 覆盖实际可触及区域，Q 找可靠弹道，E 留给会被限制的友军；Q 落空不要求队友继续近身追击。',guard:'E 提前留给将吃限制的核心，Q 阻断实际追击；黑盾只吸收魔法伤害，盾存在才免限制，不能当通用免伤。'},
 Ashe:{poke:'W 从能覆盖目标的角度试探，普攻减速只在安全距离兑现；R 已可用才找可靠路径，未命中不追着补先手。',carry:'普攻/Q 只打安全可触及目标，W 减速后随保护者调整距离；R 可用于拦追击，不为开远处目标离开接应。'},
 Caitlyn:{poke:'Q 选实际弹道消耗，W 陷阱先布可接触入口，E 留撤退；只有目标实际踩陷阱或被网命中才安排对应爆头，不为触发追进。',carry:'用实际射程普攻安全目标，W 布突进入口，E 留回撤；陷阱与网的强化攻击须实际触发，不站定追求每次强化。'},
 Jhin:{poke:'Q/W 从安全位置消耗，W 要确认目标已有对应标记才禁锢；保留装填后的退出距离，R 引导前先确认保护与退路。',carry:'按实际四发子弹与装填做短轮次，W 确认已有标记再限制目标；装填时向保护者收缩，R 不在无人保护的位置引导。'},
 Senna:{poke:'Q/普攻按实际射程安全消耗，W 延迟限制需实际命中并等效果；E 帮队友转场，不能把伪装当完全不可见。',guard:'Q 支持实际受压友军，W 拦追击，E 掩护一起转场；R 已学会可用才安排远程盾，不把延迟控制当即时救命。',carry:'按实际射程与灵魂成长普攻安全目标，Q 兼顾友军，E 留同行撤退；不假定已经获得长射程。',growth:'先保实际灵魂与本局位置的经济分工，按当前射程安全接触；游走前报兵线，不要求搭档让出全部补刀。'},
 Braum:{guard:'站在核心与飞行弹体之间，W 有友军或友方小兵才可跳，E 朝实际来向举盾；Q/普攻先挂第一层后才能接力叠层，不追离保护范围。'},
 Janna:{guard:'E 留约定核心承伤时，Q 用于打断可靠路径上的突进，R 已可用时按方向击退并治疗；引导被迫中断就先撤，不为消耗交掉全部保护。'},
 Lulu:{guard:'E 给约定核心护盾，W 按实际威胁选择对敌变形或友军增益，不能一次两用；R 已可用且核心被接近时反打，保护交掉就报收缩。'},
 Milio:{guard:'W 篝火跟核心且保持有效范围，E 留盾与移动，Q 拦接近者；R 已可用且友军在范围才解除可解除的限制，不假定能处理压制或击飞。'},
 Nami:{guard:'W 在实际可弹跳距离支持核心，E 给安全输出友军，Q 拦接近路线；R 已可用再反打，气泡落空不继续前压。'},
 Soraka:{guard:'W 按自身生命与实际友军距离回复，Q 可靠命中才利用对应回复，E 留核心脚下沉默追击者，区域结束时目标仍在才禁锢；先保自己退路，R 未就绪不许诺救下远处队友。'},
 Taric:{guard:'W 实际连接核心，E 按双方位置限制追击，Q 按当前充能治疗；R 有生效延迟，已可用才提前沟通，不能等濒死才当即时无敌。'},
 Thresh:{guard:'W 灯笼放核心实际能点击的位置，E 拦靠近者；Q 命中后不强制二段离开保护，R 已可用才封近身区域。'},
 Rakan:{guard:'E 需要实际友军与可达距离，W 用于反突进或接应，Q 命中后还需回友军附近兑现治疗；别交光接近技能后让核心独自被追。'},
 Ivern:{guard:'E 给实际承伤核心，Q 命中不要求全员突入，W 草丛按真实位置布置；R 已学会才用小菊接应，不假定草丛能隔绝所有视野。'},
 Poppy:{guard:'W 留拦符合条件的实际位移，E 仅有可靠墙体才安排眩晕；R 已可用时先约好击退目的，别把可安全攻击的目标送走。'},
 Alistar:{guard:'W/Q 留给实际靠近核心的威胁，注意 W 击退方向；E 需要实际叠层才有后续眩晕，R 已可用再承接反击，不强求搭档追入。'},
 Jinx:{carry:'普攻按实际枪形和射程打安全目标，E 布突进入口，W 留限制；没有实际击杀或参与就不预设被动加速，保护收缩时一起退。',growth:'先保兵线与实际装备，别为了等抓人漏掉整波经验；枪形、射程与被动触发依实际状态确认，保护未到不急着接团。'},
 KogMaw:{carry:'W 当前可用才按增强射程持续普攻，Q/E 从安全位置辅助；W 结束就报输出距离收缩，R 保留法力，不追着补伤害。',growth:'先保兵线、实际装备和 W 窗口，约好保护者再转资源；缺少可持续攻击空间时先清安全线，不凭分钟数认定成型。'},
 Kaisa:{carry:'普攻叠实际电浆，Q 看附近分摊，W 从可靠弹道补标记，E 留调整；R 只有实际可选标记与安全落点才用，不能把保护者甩在后面。'},
 Vayne:{carry:'普攻持续打安全可触及目标，Q 留调整，E 按实际方向击退突进；同一目标三击须实际完成，不为叠环离开保护。'},
 Xayah:{carry:'普攻与 Q/W 先布实际羽毛，E 至少三根羽毛真实穿过同一目标才禁锢，R 已可用时留自保；别为了多收羽毛走出接应范围。'},
 Sivir:{carry:'Q/W 围绕安全普攻范围输出，E 留会命中自己的关键技能；R 已可用时约同行进退，不把移速当无条件追击。'},
 Aphelios:{carry:'按当前主副武器、弹药和可用技能安全输出，武器切换先报可攻击距离；没有实际武器与层数不安排臆测连招，保护离开就退。'},
 Kayle:{carry:'按当前等级的实际攻击形态安全输出，Q 帮调整距离，W 留进退；R 已可用才按约定保护核心，不假定低等级已有远程形态。',growth:'经验与安全补刀优先，先确认当前等级的实际攻击形态；R 已可用才约免伤接力，队友不能到位就继续安全线。'},
 Nasus:{growth:'Q 补刀积累实际层数，先处理能回撤的兵线；W 留实际近身机会，R 当前可用且能持续接触才会合，不默认高层数。'},
 Veigar:{poke:'Q/W 从安全位置覆盖目标，E 先限制入口；碰到围栏边缘才眩晕，不把站在中央当控制成立。',growth:'Q 补刀与实际被动成长先于游走，E 留退出入口；没有可靠兵线与到位时间就取消会合，不默认已积累高法强。'},
 Smolder:{poke:'W 从安全方向消耗，Q 按实际被动层数决定当前效果，E 留退出；未达到成长条件不安排升级后的范围或收尾能力。',carry:'按当前 Q 效果与射程安全攻击，W 调整距离，E 留退出；只按实际被动层数作战，不预设已解锁后期效果。',growth:'先保安全补刀与实际被动层数，核对 Q 已有的当前效果；成长条件未到不按升级技能接团，E 留安全回撤。'},
 AurelionSol:{poke:'E 覆盖实际路线，Q 在安全角度引导，W 留可行退出；星尘与技能升级按实际状态，不在无接应时站定硬喷。',growth:'兵线与实际星尘优先，Q 有安全引导角度、W 有可行退路才移动会合；对手进入危险距离就取消引导先退。'},
 Vladimir:{growth:'保自身兵线与当前生命，Q 强化按实际循环，E 蓄力按安全接触，W 留自身退出；自疗与血池不能当给队友的保护。'},
 Kassadin:{growth:'先保等级、兵线与法力，E 按实际可用状态，R 已学会才用当前层数安排短位移；回撤法力不足就不继续叠 R 追击。'},
 MasterYi:{growth:'保安全营地与实际装备，Q 只去结束位置有接应的目标，W 留自身承接反击；不预设击杀刷新，也不让线上为了陪等丢兵。'},
};
const source=id=>`https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/champion/${id}.json`;
const key=m=>m.role+':'+m.champion;
const choose=(members,tempo)=>{
 const kits=members.map(m=>actions[m.champion]||{});
 const possible={poke:kits.filter(k=>k.poke).length>=2,protect:kits.some(k=>k.guard)&&kits.some(k=>k.carry),growth:kits.some(k=>k.growth)};
 if(['poke','protect','growth'].includes(tempo)&&possible[tempo])return tempo;
 return possible.poke?'poke':possible.protect?'protect':null;
};
export function tacticalCooperationPlan(members,graph,{tempo='any'}={}){
 if(![2,3].includes(members.length)||members.some(m=>!graph.byId.has(m.champion)||!COOPERATION_SKILLS[m.champion])||new Set(members.map(key)).size!==members.length||new Set(members.map(m=>m.champion)).size!==members.length||new Set(members.map(m=>m.role)).size!==members.length)return null;
 const mode=choose(members,tempo);if(!mode)return null;
 const name=id=>graph.byId.get(id).name,labels={poke:'消耗与拉扯',protect:'保护与持续输出',growth:'成长与约定会合'};
 const functions=members.map(m=>{const kit=actions[m.champion]||{};return mode==='poke'?(kit.poke?'poke':kit.guard?'guard':kit.carry?'carry':'growth'):mode==='protect'?(kit.guard?'guard':kit.carry?'carry':kit.poke?'poke':'growth'):(kit.growth?'growth':kit.guard?'guard':kit.carry?'carry':'poke');});
 const memberJobs=members.map((m,i)=>{const row=COOPERATION_SKILLS[m.champion];return {...m,job:actions[m.champion]?.[functions[i]]||`先守远程队友能接应的位置与退路，不独自进场；本轮短接触安全条件成立才${row[0]} 玩家确认：${row[1]} 退出条件：${row[2]}`};});
 const opening=members.map(m=>`${name(m.champion)}${m.role==='jungle'?'先保安全营地，报路线与到位时间':m.role==='support'?'先保搭档补刀与经验，离线前报去向':'先处理安全兵线，报可离线时间'}`).join('；')+'。玩家先确认实际技能、法力、形态与退路，有人赶不到就取消会合。';
 const economy=(members.some(m=>['top','mid','bottom'].includes(m.role))?members.filter(m=>['top','mid','bottom'].includes(m.role)).map(m=>name(m.champion)).join('、')+'保各自兵线；':'')+(members.some(m=>m.role==='jungle')?'打野保安全营地，不空等抓人；':'')+(members.some(m=>m.role==='support')?'辅助不抢搭档补刀；':'')+'先报清线与到位时间，技能落空或状态不足就各回资源，不为一轮消耗、叠层或追回损失让全员丢经济。';
 const scripts={
  poke:{why:'先从安全距离做独立消耗，保护与退出技能留给被近身的一轮；命中消耗不等于可以全员突入。',
   steps:['先处理各自资源，约同一可触及区域；核对弹道、法力、形态、视野及撤退路线，不要求先手控制命中才开始。','从安全距离分角度做短轮次消耗，保留回撤与反突进；只有玩家确认目标状态、队友距离及安全落点，才决定是否接近。','弹道被挡、技能落空、法力不足或敌人近身就停止前压，一起收回保护范围；无法安全消耗则回兵线或营地。'],
   conditions:['玩家确认消耗技能、资源与当前形态可用，弹道和共同区域可触及，视野与退路已核对；不自动推测就绪。','不以硬控为统一开场条件；近身跟进仍要满足各自标记、实际命中与安全落点，被近身时先保护回撤。'],
   failures:['一发消耗命中不等于必定击杀或必须开团；被小兵挡住、对手退出覆盖或队友赶不到就停。','保护或回撤技能交掉、状态不足或侧翼失去视野就收缩，别用连续前移补偿技能落空。']},
  protect:{why:'先约定谁承担当前安全输出，保护者留在可接应距离；限制追击和承接反击优先于分头追人。',
   steps:['先约好本轮保护对象与站位，各自处理兵线或营地；玩家报实际射程、保护技能与回撤条件。','输出者攻击能安全触及的同一目标，保护者把技能留给实际突进与承伤；其他成员覆盖入口，不独自开远处目标。','保护交掉、核心无法持续接触或敌人绕侧就一起收缩；重新安排兵线、营地和下一次会合，不分头追回损失。'],
   conditions:['玩家确认保护技能、目标距离、实际射程与输出窗口；护盾、延迟治疗、无敌等效果按各自真实条件使用。','至少一人能承担安全输出，另一人能实际保护；自保不替代给友军的保护，没有接应距离就不接团。'],
   failures:['保护者被迫自保、关键保护交掉或核心攻击距离断开就停，不让核心独自留在前面。','控制落空或目标离开安全范围时转接应；不为了追击离开保护距离，也不预设击杀后的刷新与加速。']},
  growth:{why:'把实际等级、层数与装备准备放在一起约定；先保各自资源，有可兑现的安全窗口再会合。',
   steps:['各自保安全兵线、经验或营地，成长成员报实际等级、层数、形态与装备；不凭分钟数认定成型。','先报兵线处理和到位时间，再核对当前技能与退路；准备满足也只接安全可触及目标，不要求为了叠层全员让经济。','成长或到场条件未满足就继续各自资源；被逼退或关键技能交掉就取消会合，下一轮重新确认。'],
   conditions:['成长成员实际等级、层数、形态或装备已由玩家核对；相关技能当前可用，不把未来强化当现在已有。','其他成员处理好兵线或安全营地并确认可到位，视野、接触空间与退出路线可靠；有人不能到就继续发育。'],
   failures:['没有达到当前需要的成长条件、法力不足或成员赶不到就取消这一轮，不空等、不为叠层冒险入侵。','成长不保证后期必胜；自疗与自保不当队友保护，接触被切断就一起退回安全资源。']},
 };
 const script=scripts[mode],steps=script.steps;
 return {kind:'shared',name:'共同分工 · '+labels[mode],members:members.map(m=>({role:m.role,champion:m.champion})),edges:[],memberJobs,relaySteps:steps,steps,opening,economy,conditions:script.conditions,failures:script.failures,tempo:mode,bonus:0,
  why:members.map(m=>name(m.champion)).join('、')+'：'+script.why,
  sourceNote:'共同分工：按已核对技能安排当前战术的独立职责、准备与退出；没有确认独特组合协同，未经组合对局验证，不代表统计优势。',patch:SKILL_COOPERATION_PATCH,reviewedAt:SKILL_COOPERATION_REVIEWED_AT,sourceUrls:members.map(m=>source(m.champion))};
}
