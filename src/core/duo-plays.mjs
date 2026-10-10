import {rolePlay,ROLE_PLAYS_PATCH,ROLE_PLAYS_REVIEWED_AT} from './role-plays.mjs';
import {partyCounterplayText} from './party-counterplay.mjs';

// Windows are conditions to confirm in the game, never inferred cooldowns.
const windows={
 Alistar:'双方距离能跟上，牛头 Q/W 可用且兵线不会让两人独自承受整波反击',
 Malphite:'石头人 R 实际就绪，落点在搭档能输出的距离内；六级前不套用击飞大招',
 Amumu:'Q 路径能命中英雄，队友可跟进；使用 R 前确认实际等级和就绪',
 Zyra:'E 禁锢能命中，植物已被技能激活且能覆盖输出区；R 延迟击飞仍需目标留在区域',
 Lux:'Q 已命中目标或已有可靠队友控制，搭档在可输出距离内',
 Seraphine:'已有减速/禁锢或可靠 R 命中角度，自己回响与双方跟进距离已确认',
 Nami:'搭档可实际触及目标并能兑现 E，Q/R 命中条件或撤退手段已确认',
 Rell:'W/Q 能实际控制目标，搭档跟得上，进场后仍有回到队伍的路线',
 Nautilus:'Q/被动普攻/R 有可靠控制入口，搭档能跟进，Q 不被单位或地形改变目标',
 Rakan:'W/R 控制能命中，搭档跟得上且 E 有可用的返回友军',
 Lulu:'搭档能持续普攻，E/W 或 R 的保护窗口能覆盖实际承伤，双方退路没有脱节',
 Taric:'已联结搭档，E 方向约好，使用 R 时确认引导结束后的实际无敌生效',
 Senna:'搭档能补刀和短换血，W/Q 的命中与双方射程成立；经济分工已约定',
 Sona:'双方在光环可受益范围，当前和弦与 R 就绪自己确认，搭档能接上控制',
 Veigar:'围栏可限制目标退路；确认目标实际撞到边缘或有其它控制，不能把站在笼子中央当眩晕',
 Pyke:'Q/E 实际控制能命中且有退路；使用 R 时以游戏内处决提示和目标变化为准',
 Ashe:'W 减速或 R 已命中，双方能在控制结束前赶到可输出位置',
 Swain:'E 实际禁锢，搭档可跟；用 R 时目标能留在可持续接触的战区',
 Karma:'搭档在护盾与移速支持下能打一轮再退；W 需要实际维持连接，强化技能目的已沟通',
 Morgana:'Q 已命中且搭档可接续，E 用于实际魔法控制威胁；不把黑盾当全类型免疫',
 Bard:'Q 第二碰撞眩晕条件实际成立，或 R 停滞结束的接续已经约好',
 Thresh:'Q/E 实际命中，搭档可输出，灯笼在能点到的位置；Q 二段不是必选动作',
 Xerath:'Q/W/E 有可靠角度，E 不被前方单位挡住，搭档能短输出并退回安全距离',
 Velkoz:'Q/E 能限制目标，双方可安全施法；使用 R 时先处理打断和侧翼',
 Leona:'E/Q 或 R 实际命中，搭档能跟上；控制与后续输出要落在同一目标',
 Braum:'同一目标已挂被动，搭档能安全普攻补层，盾墙方向与退出路线成立',
 Milio:'搭档能在 W/E 覆盖下连续攻击；增加攻击射程不代表技能射程也增加',
 Janna:'Q 可限制接近、E 可支持搭档换血，或 R 能把真正的突进威胁推离核心',
 Yuumi:'附身者可接触目标并有退路，E 保护和 R 引导能覆盖实际承伤；挚友状态自己确认',
 Renata:'搭档能继续命中同一目标，W 救援后的击杀参与机会真实可行；否则准备退出',
 Soraka:'索拉卡自身生命与法力能支持治疗，双方仍在可保护距离，E 区域能覆盖反击者',
 Gragas:'E 控制路径可靠，R 落点与搭档输出区方向一致；不能把集火目标炸走',
 Blitzcrank:'Q 能拉到双方可处理的位置；目标不是会直接威胁脆弱搭档的危险前排',
 Pantheon:'W 可用、当前强化层数自己确认，搭档能在短控制内输出；E 有可防护方向',
 Ivern:'Q 命中或 E 可支持换血，草丛与 Daisy 位置实际确认；搭档不必因 Q 命中就近身',
 Singed:'W/E 的方向能让搭档接输出，自己仍有退出路线；不把目标甩向己方脆弱核心',
 Poppy:'目标与地形方向能形成 E 控制，或 W 可限制实际突进；没有墙时不套用壁咚',
 Zilean:'两次 Q 能落到同一实际载体，E 的进退目的约好；R 在承伤前生效而非事后猜测',
 Neeko:'E/R 可靠控制能命中，搭档跟得上；伪装不代表侧翼已安全',
 Taliyah:'已有控制能支撑 E/W 方向，双方在施法距离内；不把 E 放下当敌人已经触发',
 Trundle:'柱子能限制退路且不挡己方路径，搭档可接技能；柱子不提供持续眩晕',
 Nidalee:'目标已受控制或 Q 有不被单位阻挡的角度，E 可支持搭档实际普攻窗口',
 Zac:'E 落点有队友接应，Q 可连接两个不同目标；粘液与被动不当作必定存活的保证',
 Shaco:'盒子已实际就位且能触发，搭档可安全输出；刚放下不当成立即恐惧',
 Sejuani:'目标实际叠到四层且可冻结，或 R 可靠命中；近战友军普攻与 W 叠层，Q 不算叠层',
 Twitch:'可安全普攻叠毒、W 限制目标，搭档能跟；伪装不是进入敌阵的安全凭证',
 Teemo:'双方有安全普攻距离，Q 对准实际普攻威胁；致盲不封掉所有技能',
 Anivia:'Q 命中或 R 已形成冰冻条件，W 方向不挡队友，法力支持这一轮施法',
 Yasuo:'实际击飞已经发生且 R 可用，落地位置有搭档接应；风墙只针对能挡的飞行道具'
};
// Overrides preserve interactions that cannot be explained by two solo notes.
const interactions={
 'Yasuo:Alistar':{steps:['牛头先确认双方距离与 Q/W 就绪，再实际击飞目标','亚索确认击飞已发生且 R 可用后接大，不在牛头还没命中时前冲','落地普攻/Q 兑现输出，牛头留控制或承伤支持回撤'],exit:'击飞落空、亚索无 R 或两人距离断开就结束这一轮；六级前先短换血与补刀。'},
 'Yasuo:Malphite':{steps:['六级前先保双方状态与兵线，不把这套当有完整大招链','石头人 R 的落点先选在亚索能接 R 的位置，实际击飞后再接大','两人落地后看退路与后续火力，别把一次命中当需要追到底'],exit:'任一大招不可用、击飞落空或辅助承伤不足就回到守线与保护。'},
 'MissFortune:Amumu':{steps:['女枪先占能安全引导 R 的角度，阿木木确认 Q/R 就绪与输出距离','阿木木实际限制目标后，女枪再按战区方向铺弹幕','阿木木照看侧翼打断者，女枪看到近身威胁时中止引导撤离'],exit:'控制落空、女枪需移位或打断威胁尚未处理时，不开启完整弹幕承诺。'},
 'Caitlyn:Lux':{steps:['拉克丝 Q 命中后报同一目标，女警保持可输出距离','女警 W 放到目标能实际触发的位置，再兑现对应爆头','拉克丝 E/R 接可靠控制，W/E 回撤手段不同时空交'],exit:'Q 落空、夹子未触发或两人射程脱节就退，不为一次爆头强靠近。'},
 'Caitlyn:Morgana':{steps:['莫甘娜 Q 实际禁锢后，女警把 W 放到能触发的目标位置','夹子实际触发后女警接爆头，莫甘娜 W 跟同一目标','黑盾给承受关键魔法控制的队友，女警 E 保留退出'],exit:'黑盾不能覆盖所有伤害；Q/夹子未命中就停止持续追击。'},
 'Jhin:Zyra':{steps:['婕拉从安全区域用植物或技能实际伤害同一目标，烬确认伤害标记','烬 W 命中后婕拉 E 接控制与植物，别同时把控制全部交空','烬按当前弹药接普攻，装填时两人回到植物可保护区域'],exit:'没有伤害标记、W/E 落空或目标离开植物区就结束这一轮。'},
 'Ashe:Seraphine':{steps:['寒冰用 W 或普攻实际减速同一目标','萨勒芬妮先确认减速和回响，再 E 接对应控制；大招另行确认命中','寒冰在安全距离持续普攻，萨勒芬妮 W 保护双方而非独自追进'],exit:'减速没有落到目标或 E/R 落空时不把控制升级当已经发生。'},
 'Lucian:Nami':{steps:['娜美 E 给能实际攻击的卢锡安，两人先约好短换血方向','卢锡安技能与被动普攻打一轮，娜美按实际减速找 Q 或接可靠控制','卢锡安留 E 退出，娜美 W 支持承伤，不为泡泡落空继续追'],exit:'增益窗口结束、卢锡安位移要用于逃生或 Q 落空时结束短换血。'},
 'Samira:Nautilus':{steps:['泰坦确认莎弥拉能跟，再用 Q 或被动普攻实际控制同一目标','莎弥拉等控制生效再跟，普攻与不同技能建立评价，W 留关键飞行道具','S 和安全近身条件都成立才 R，泰坦留一段控制照看打断者'],exit:'钩子落空、评价未到 S、可靠打断未处理或两人距离断开就不继续 E/R。'},
 'Samira:Rell':{steps:['芮尔确认莎弥拉能跟，W/Q 实际控制同一目标','莎弥拉跟已生效控制并建立评价，芮尔 R 覆盖同一战区而非假定长期眩晕','确认 S 与安全引导条件后 R，保留一手处理侧翼和反打'],exit:'进场没有控制命中或打断威胁未处理时，莎弥拉停在安全输出距离。'},
 'Xayah:Rakan':{steps:['洛先确认霞的羽毛与输出方向，W/R 命中后霞再持续攻击','霞调整位置让至少三根羽毛回程穿过目标，再 E','洛 E 回到可接应友军，霞 R 保留给突进威胁；双方不同时离开退路'],exit:'羽毛路径不成立、洛无安全回跳友军或霞必须 R 自保时结束追击。'},
 'Nilah:Taric':{steps:['宝石提前 W 联结尼菈，双方报 E 方向和预计进场落点','尼菈有安全退出路线才接近，宝石 R 提前引导，确认无敌真正生效','尼菈在保护期输出，W 与宝石保护错开，结束前回到可接应距离'],exit:'联结或 E 方向脱节、无敌尚未生效或缺少退出目标就不深进。'},
 'Kalista:Taric':{steps:['先确认卡莉丝塔的誓约者、宝石 W 联结与双方大招就绪','卡莉丝塔 R 的进退落点先沟通，宝石 E/R 按实际落点与引导衔接','卡莉丝塔集中同一目标叠矛，保护结束前保留普攻移动空间'],exit:'誓约者/联结未确认、大招条件不齐或落点危险就保留 R 救援，不强行开。'},
 'Seraphine:Sona':{steps:['萨勒芬妮负责补刀，娑娜辅助光环支持，双方先保法力与状态','一人 R 或可靠 E 控制实际命中后，另一人接续；不要同时交掉两段大招','双人 W/光环覆盖队友承伤与输出，自己先保持安全后排距离'],exit:'两人法力不足、控制都交空或侧翼突破时退，不以双治疗假定免疫爆发。'},
 'Ziggs:Veigar':{steps:['维迦 E 先限制退路，吉格斯保留 W 自保并从安全角度施法','目标实际撞到围栏或被其它控制限制后，吉格斯 Q/E/R 跟同一区域','维迦 W/Q 接续，控制落空时两人恢复远程清线而非一起贴近'],exit:'笼中目标没有被控、法力不足或侧翼逼近就停止追加，不把围栏中央当眩晕。'},
 'Heimerdinger:Zyra':{steps:['大头先布炮台，婕拉种子由 Q/E 激活，双方确认实际植物覆盖区','婕拉 E 或大头 E 命中后，让目标留在炮台/植物可攻击区域','输出从阵地区域兑现，控制留一段限制反打，植物被清就重新布置'],exit:'炮台/植物已被清或目标离开区域就不追出阵地，不能把既有布置当一直存在。'},
 'Draven:Pyke':{steps:['德莱文先确认安全接斧路径，派克从可撤离角度 Q/E 控制','控制实际命中后德莱文持续普攻，派克不把人带离接斧与输出区','派克 R 按实际处决提示使用；德莱文不为接斧或收尾踏入控制区'],exit:'控制没中、斧子落到危险处或处决条件变化就停止追击，不预设共享击杀一定发生。'},
 'Chogath:Senna':{economy:'科加斯负责下路补刀和经验，赛娜按辅助分工支持与收魂；不把赛娜移到补刀位，也不默认双方都买辅助装。',steps:['科加斯先安全补刀，赛娜从可回撤距离 Q/普攻消耗与收魂','赛娜 W 实际控制后科加斯接 Q/W，或科加斯先命中再让赛娜接续','科加斯 R 单独核对目标生命，赛娜保留保护与退出空间'],exit:'控制落空或远程持续压制时先守线；不为灵魂或 R 层数牺牲安全位置。'},
 'TahmKench:Senna':{economy:'塔姆负责补刀，赛娜按辅助分工收魂与支援；这是明确的双人经济安排，不能自动套到其它赛娜组合。',steps:['塔姆守补刀与退出路线，赛娜安全 Q/普攻换血与收魂','赛娜 W 或塔姆 Q 的实际限制成立后，两人集中同一目标','塔姆 R 先判断是救队友还是处理敌人，放出位置避开敌方集火'],exit:'双方距离脱节、塔姆实际层数不够或赛娜被突进时优先救援，不追第二个目标。'},
 'Rengar:Ivern':{steps:['翠神先放实际草丛并报位置，狮子狗确认草丛、怒气和跳跃目标','狮子狗从双方可跟的位置接近，翠神 E 提供护盾并 Q 限制退路','狮子狗按实际怒气选择强化技能，Daisy 跟同一战区；双方预留返回路径'],exit:'草丛未成立、目标超出接应距离或退出路线被堵时不跳入。'},
 'Cassiopeia:Singed':{steps:['炼金先用 W/E 限制目标方向并保留退出路线，不把人甩向蛇女脸前','蛇女确认目标中毒，必要时自己 Q/W 建立毒状态，再连续 E','炼金 Q 限制追击路线，蛇女保持施法距离，R 眩晕还要看对手朝向'],exit:'毒或法力不足、目标脱离 E 射程或蛇女被突进时退出；不把任何持续伤害都当毒。'},
 'Orianna:Malphite':{steps:['发条 E 将球放到准备进场的石头人身上，双方确认球没有因距离返回','石头人 R 实际击飞后，发条按球的实际位置接 R/W','发条保安全施法位置，石头人不追出球与队友的接应距离'],exit:'球已回身、大招不可用或石头人落点没有后续火力就停止送球进场。'},
 'Anivia:Poppy':{steps:['冰鸟 W 前先报墙与目标方向，波比确认实际地形能支持 E 控制','波比 E 真正形成控制后，冰鸟 Q/R/E 跟同一目标','波比 W 留突进威胁，冰鸟墙不要截断队友退路'],exit:'墙方向不成立、E 没形成控制或冰鸟法力不足就取消壁咚计划。'},
 'Sion:Zilean':{steps:['双方先报挂弹载体，基兰 Q 放到实际敌方小兵上，别立即清掉载体','赛恩 E 踢挂弹小兵的方向先确认，基兰后续炸弹只跟能实际命中的载体','赛恩 Q 接可靠限制，基兰 E/R 保留退出与实际承伤保护'],exit:'载体已死、踢兵方向或双弹命中不成立就恢复常规换血；R 不当无条件复活保证。'},
 'Pantheon:Braum':{steps:['潘森先确认实际强化层数与 W 就绪，布隆对同一目标挂被动','W 控制命中后双方安全普攻补布隆被动；不把未强化 W 当同样叠层速度','潘森 E 与布隆 E/W 分担反击方向，控制结束前留退出路径'],exit:'目标不可持续接触、强化未准备或双盾方向脱节时结束短换血。'},
 'Kindred:Taric':{steps:['千珏先报 R 区域与预计承伤，宝石保持 W 联结和实际施法距离','千珏 R 防止区域内生命降到下限；宝石 R 提前引导，衔接结束后的保护','按实际无敌是否生效再继续输出，保护结束前看双方生命与退出方向'],exit:'任一大招未就绪、联结距离脱节或引导被破坏时不把保护链当必定成立。'},
 'Yone:Soraka':{steps:['永恩先给 E 本体留安全位置，索拉卡站在能治疗又不先被突进的位置','永恩跟可靠控制打一轮，索拉卡 Q/W 根据实际生命支持，E 限制追击','永恩按时回身后再补回复，索拉卡不跟到敌阵为追治疗丢掉站位'],exit:'回身点被守、索拉卡生命/法力不足或两人治疗距离断开就不延长追击。'},
 'Ekko:Zilean':{steps:['艾克先报 W 与 R 影子所在位置，基兰留 E/R 接应而非一起深入','艾克跟可靠控制打三环，基兰 Q/E 限制反击，R 在实际承伤前给','艾克按实际影子与退路返回，基兰不用为了追救援跟进敌阵'],exit:'回身点危险、复活位置会被守或双方距离断开时取消深入。'}
};
export function duoPlay(duo,data,{champion,role}={}){
 if(duo?.members?.length===2){
  const own=duo.members.find(m=>m.champion===champion&&m.role===role),jobs=duo.members.map(m=>`${data?.champions?.find(c=>c.id===m.champion)?.name||m.champion}：${m.job}`);
  const stages={opening:{label:'开局 / 对线',ownAction:duo.early,steps:[duo.early],window:duo.window,exit:duo.risk},
   key:{label:'关键配合',ownAction:own?.job||null,steps:[...duo.steps],window:duo.window,exit:duo.risk},
   later:{label:'后期团战',ownAction:own?.job||null,steps:jobs,window:duo.window,exit:duo.risk}};
  return {kind:'duo',id:duo.id,patch:duo.patch,reviewedAt:duo.reviewedAt,stale:data.patch!==duo.patch,stages,window:duo.window,economy:duo.economy,early:duo.early,ownJob:own?.job||null,steps:[...duo.steps],risk:duo.risk,source:(duo.id.startsWith('local-')?'个人整理':'组合库整理')+' · 未经组合对局统计验证',sources:duo.sources||[]};
 }
 if(!duo?.carry||!duo?.support)return null;
 const carry=data?.champions?.find(c=>c.id===duo.carry),support=data?.champions?.find(c=>c.id===duo.support);
 const carryTask=rolePlay(duo.carry,'bottom'),supportTask=rolePlay(duo.support,'support');
 if(!carry||!support||!carryTask||!supportTask||!windows[duo.support])return null;
 const interaction=interactions[duo.carry+':'+duo.support]||{};
 const validOwn=champion===duo.carry&&role==='bottom'||champion===duo.support&&role==='support';
 const ownTask=validOwn?(role==='bottom'?carryTask:supportTask):null;
 const window=duo.window||'玩家确认：'+windows[duo.support]+'；搭档状态、技能就绪和命中条件均需自行核对。';
 const economy=duo.economy||interaction.economy||`${carry.name}负责下路补刀和经验，${support.name}按辅助分工支援；辅助消耗别抢整波兵线，回城与游走先沟通搭档能否安全接线。`;
 const exit=[interaction.exit,duo.risk,'关键控制落空、搭档无法继续输出或退出路线被堵时结束这一轮；先一起回到可接应的距离。'].filter(Boolean).join(' ');
 const stages={
  opening:{label:'开局 / 对线',ownAction:ownTask?.opening||null,steps:duo.early?[duo.early]:[`${carry.name}：${carryTask.opening}`,`${support.name}：${supportTask.opening}`],window:'先确认双方等级、已学技能、兵线、法力和安全距离，小技能换血后退出；未学到大招时不套用完整连招。',exit:duo.risk||'技能空了或兵线不利时结束换血，先保双方经验。'},
  key:{label:'关键配合',ownAction:ownTask?.key||null,steps:duo.steps?.length?[...duo.steps]:interaction.steps||[`${support.name}：${supportTask.key}`,`${carry.name}：${carryTask.key}`,'双方集中同一可安全触及的目标，留一手处理反击；跟不上就一起退出。'],window,exit},
  later:{label:'后期团战',ownAction:ownTask?.later||null,steps:[`${carry.name}：${carryTask.later}`,`${support.name}：${supportTask.later}`,'先处理进入己方输出区的威胁，安全后再向同一目标推进；不能同时追到两个方向。'],window:'先确认核心能输出、保护与进场手段实际可用，兵线与资源方向已经约好；先手后仍需有人照看反打。',exit:'核心被迫位移、保护已交空或双方分到不同战区就退回接应范围；不为第二个目标丢掉站位。'}
 };
 return {kind:'duo',id:duo.id,patch:ROLE_PLAYS_PATCH,reviewedAt:ROLE_PLAYS_REVIEWED_AT,stale:data.patch!==ROLE_PLAYS_PATCH,stages,window,economy,
  early:duo.early||stages.opening.steps.join('；'),ownJob:ownTask?.key||null,steps:stages.key.steps,risk:exit,
  source:'Riot 英雄机制 · 人工分工与条件顺序，未经组合对局统计验证',
  sources:[carry,support].map(c=>({name:'Riot · '+c.name+'技能机制',url:`https://ddragon.leagueoflegends.com/cdn/${encodeURIComponent(data.version)}/data/zh_CN/champion/${c.id}.json`,kind:'技能依据',checkedAt:ROLE_PLAYS_REVIEWED_AT}))};
}
export function duoPlayText(play){
 if(!play)return '';
 return [...(play.counterplay?[partyCounterplayText(play.counterplay)]:[]),...Object.values(play.stages).map(stage=>`${stage.label}：\n${stage.steps.map((step,index)=>(index+1)+'. '+step).join('\n')}\n玩家确认的窗口：${stage.window}\n何时停：${stage.exit}`),`经济分工：${play.economy}`,`${play.source} · ${play.patch}${play.stale?' · 旧版本需核对':''}`].join('\n');
}
