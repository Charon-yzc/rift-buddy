import {isCurrentHexData} from './hex-data-current.mjs';
import itemsReview from './hex-route-items.json' with {type:'json'};
import {hexRouteItemFingerprint,communityHexItemFingerprint,validCommunityItemReview} from './community-item-review.mjs';
export {hexRouteItemFingerprint} from './community-item-review.mjs';
import {currentHexReview,hexChampionReview} from './hex-review.mjs';
import {reviewedHexMechanic,hexUltimateRequirement} from './hex-mechanics.mjs';
import {hexCatalogDisabled} from './hex-catalog.mjs';
import communityRoutes from './hex-community-routes.json' with {type:'json'};
import {mechanicReview} from './mechanic-review.mjs';
import {communitySourceLabel,communitySourceMedium} from './community-source.mjs';

const augmentComplements={1118:'提供25%暴击几率；治疗护盾实际暴击时多40%效果。',1141:'用于友军的治疗和护盾增强。',
 1047:'获得50%暴击几率；按当前暴击率重新比较装备。',1077:'暴击伤害的12%治疗自身，获得25%暴击几率。',1080:'以暴击几率进行会心防御，触发几率最多50%；获得25%暴击几率。',
 1030:'获得相当于30%法术强度的技能急速；不是固定大招冷却。',3132:'参与击杀叠加属性，同时降低移动速度；阵亡损失一半层数。',1205:'额外攻击力转为法术强度；获得15%法术强度，不改变技能的伤害类型。',
 1019:'位移类英雄技能获得175急速；不同时缩短全部技能或召唤师技能。',1187:'闪现引发伤害与减速爆炸；阵亡时重置，不补未解析伤害值。',
 1348:'获得第二个闪现和70召唤师技能急速；不推定两个闪现各有三层充能。',1347:'获得同时施放屏障与幽灵疾步的召唤师技能；不按两次W触发计算。',
 1022:'获得60%攻击速度。',1328:'普攻暴击叠加攻速，获得25%暴击几率。',1011:'施放终极技能后短暂免伤；仍须安全站位。',1088:'施放终极技能后刷新；有75秒自身冷却，阵亡可重置。',1112:'施放终极技能后免控3秒；8秒自身冷却。',1194:'终极技能伤害可触发变形。',
 1029:'技能命中可施加攻击特效；同一目标每1秒一次。',1058:'实际攻击特效使技能冷却缩短1.25秒；没有命中就没有收益。',
 1996:'获得250金币；强化已有咒刃的伤害与自疗，先具备咒刃装备。',
 1004:'强化基础技能，但禁用终极技能；接受不能使用R再考虑。',1214:'旋转类基础技能30急速、增伤30%；不覆盖其他技能。',
 1305:'获得50移动速度和50%减速抗性；不解除眩晕或禁锢。',2132:'获得（10＋0.035×法术强度）%全能吸血；不保证伤害全部转为治疗。',
 1311:'法力消耗翻倍；技能增效取决于最大法力值，缺蓝时无法持续收益。',1056:'增加最大生命值，数额为法力值的一半；没有直接减冷却。',
 1018:'定身或缚地敌方英雄后获得护盾；不是每次伤害都触发。',1375:'定身敌方英雄增加最大生命值；如果它是你的第二个强化，另有额外生命奖励。',
 1323:'定身或缚地敌方英雄后延迟造成范围魔法伤害；每次施法与同一目标都有触发限制。',1318:'具备中娅时，原文冷却45秒；相应凝滞期间可移动并获50%移速，其他急速另核。',
 3004:'替换一个召唤师技能为飞弹；命中英雄、建筑或墙体后爆炸，未取得时不套用飞弹玩法。',3116:'普攻和技能命中英雄叠层；满层消耗后按伤害回血，不是每次命中都治疗。',
 3131:'损失生命值时获得攻速与生命偷取；仍须命中，不为增益刻意压低血量。',3078:'施法后下一次实际攻击加速；攻击后移速持续衰减。',1068:'获得60技能急速；不是直接刷新技能，仍须支付法力并等待实际冷却。',
 1053:'重生后变大：30%适应之力、20%生命值；或变小：70急速、40%移速。两种状态互斥，不是同时获得。',
 1344:'施放R：10秒50%最大生命值护盾、20%全能吸血、30%额外移速；20秒自身冷却。'};
const jhinComplements={1022:'60%攻速经被动提高攻击力和暴击后的移速；射速仍固定。',1328:'25%暴击，普攻暴击叠攻速；以被动增益攻击力和暴击后移速，射速仍固定。'};
const camilleComplements={1022:'60%攻速用于普攻衔接；Q2 至少1.5秒的等待不能省略。'};

// Authored mechanism routes, not creator builds or statistical rankings. Each
// route requires the exact reviewed hero kit, augment effect and item effects.
const routes=[
 {hero:'Camille',patch:'16.21',augment:1996,optional:[1058,1004,1029,1022],coreItems:[3078],title:'咒刃穿插续战',summary:'先有咒刃，利用两段 Q 与走位穿插普攻。',play:['先有咒刃装备；获得250金币不代表咒刃已生效，Q1 后至少等1.5秒再用强化 Q2。','用 Q 的移速调整位置，W 外沿命中英雄恢复；E 借墙体进退，避免交完技能后被集火。'],caution:'咒刃有自身冷却；强化没有取消 Q2 等待，不把所有附加伤害或技能增幅都按等比例真伤计算。',gear:[['咒刃骨架',[3078],'需要可触发的咒刃效果；三相保留攻击力与普攻衔接，施法后下一次攻击仍需命中，咒刃有自身冷却。'],['物理交战压力',[6333],'面对物理伤害且有参与击杀机会时比较死舞；延后承伤不是免伤。'],['需要魔抗与恢复',[3065],'有魔法压力且能兑现 W 外圈恢复或自身护盾时比较振奋，仍须实际命中和安全距离。']]},
 {hero:'Camille',patch:'16.21',augment:1058,optional:[1996,1004,1029,1022],title:'攻击特效轮转',summary:'普攻衔接 Q 缩短空档，保留 Q2 的等待节奏。',play:['攻击特效使技能冷却缩短1.25秒；普攻衔接 Q，Q2 仍至少等1.5秒再打。','E 利用墙体调整进退，W 外沿寻找英雄；技能未命中时先保住下一次攻击机会。'],caution:'没有攻击特效命中就没有强化减冷却；不保证无缝 Q 或无限蓝量，也不把每次技能伤害都当作攻击特效。',gear:[['技能接普攻',[3078],'有安全普攻窗口时比较三相的咒刃；不把每次 Q 都算成一次额外咒刃。'],['需要生命与基础急速',[3161],'需要生命值并能持续施放基础技能时比较朔极之矛；急速不会缩短 Q2 的蓄力等待。'],['需要抗爆发',[3053],'需要生命值与低血护盾时比较血手；护盾不是免伤，仍要保留退路。']]},
 {hero:'Camille',patch:'16.21',augment:1004,optional:[1996,1058,1029,1022],title:'基础技能拉扯',summary:'接受失去大招，围绕两段 Q、W 外沿与 E 进退。',play:['Q1 后至少等1.5秒再 Q2；W 外沿命中英雄才恢复自己，靠走位留住下一轮技能。','E 借墙体进退，普攻触发的被动护盾仍有类型与冷却；不要把护盾当作常驻免伤。'],caution:'失去 R 的锁定区域、不可选取窗口与区域内额外攻击伤害；不能沿用原来的大招进场。',gear:[['技能接普攻',[3078],'仍有安全攻击窗口时比较三相；失去大招后需要自己保证能接近并撤离。'],['基础技能与生命值',[3161],'需要基础技能急速和生命值时比较朔极之矛；不据此承诺真伤等比例增幅。'],['魔法压力与自身恢复',[3065],'有魔法压力且能利用 W 外圈恢复和自身护盾时比较振奋；打小兵不能代替 W 命中英雄的恢复条件。']]},
 {hero:'Jhin',patch:'16.21',augment:1328,family:'jhin-crit',optional:[1047,1077,1022,1080],title:'四发暴击走位',summary:'围绕四发节奏与暴击后移速，以被动利用额外攻速。',play:['获得25%暴击几率；普攻暴击叠攻速，经被动提高攻击力和暴击后的移速，射速仍固定。','在射击间隔调整位置，第四发寻找收尾；换弹期间用 Q、W 衔接，别站住等下一轮。'],caution:'强化由普攻暴击叠层；射速保持固定，换弹不能跳过，堆攻速不代表连续扫射。',gear:[['攻击力与暴击',[3031],'需要攻击力并能继续普攻时比较无尽；最终暴击收益仍受烬自身被动规则影响。'],['需要安全射程',[3094],'等待盈能后寻找安全的普攻窗口；火炮的攻击距离收益不延长技能射程。'],['护甲压力',[3036],'敌方有护甲与额外生命值时比较多米尼克，仍须保证能命中并安全离开。']]},
 {hero:'Jhin',patch:'16.21',augment:1047,family:'jhin-crit',optional:[1328,1077,1022,1080],title:'暴击穿插',summary:'保留固定射击节奏，利用暴击与被动的攻击力收益。',play:['获得50%暴击几率；利用暴击后的移速调整位置，四发后换弹并以技能衔接。','先比较当前暴击率，再安排攻击力与护甲穿透；不要只为几率牺牲安全距离。'],caution:'烬的射速仍固定，暴击伤害有自身修正；按当前面板与实际装备比较收益。',gear:[['需要攻击力',[3031],'保留攻击力和暴击方向，但按烬自身的暴击规则结算。'],['安全普攻距离',[3094],'能等待盈能并利用额外普攻距离时比较火炮，技能射程保持原样。'],['护甲压力',[3036],'面对护甲与额外生命值时比较多米尼克；不代替走位和命中。']]},
 {hero:'Jhin',patch:'16.21',augment:1211,optional:[1011,1112,1194,1088,1047],title:'远程谢幕收尾',summary:'先保住大招的射击位置，再利用实际伤害积累收尾。',play:['在安全位置开 R，瞄准能命中的英雄；只有实际造成的伤害会被储存。','前方有敌方英雄挡枪时调整目标，保留撤退方向；强化按自身规则引爆。'],caution:'引导期间要防贴身突进；终极技能被封印时这条路线不可用。',gear:[['需要大招回转',[6696],'伤害命中后，目标在3秒内阵亡才满足公理圆弧的返还条件；返还不是每次命中都触发。'],['护甲压力',[3036],'对护甲与额外生命值目标比较多米尼克；R 仍需实际命中目标。'],['收尾与攻击力',[6676],'伤害使英雄生命值低于5%才满足处决条件；按实际血量寻找收尾。']]},
 {hero:'Jhin',patch:'16.21',augment:1004,optional:[1047,1328,1077,1022,1080],title:'基础技能穿插',summary:'接受失去大招，用 Q、W 和陷阱衔接四发普攻。',play:['用 Q 的弹跳寻找收尾，W 先确认目标有标记；换弹时保留安全距离。','E 放在进退路径，等待延迟爆炸；基础技能仍要实际命中。'],caution:'失去 R 的远程收尾；强化按基础技能实际命中兑现，普攻仍遵循固定射速和换弹。',gear:[['攻击力与普攻',[3031],'需要攻击力并能继续普攻时比较无尽，技能段与暴击段分别结算。'],['持续施法缺蓝',[3004],'频繁使用基础技能缺蓝时考虑魔宗；按法力流实际层数安排升级。'],['护甲压力',[3036],'需要处理护甲与额外生命值时比较多米尼克，先保证命中与站位。']]},
 {hero:'Hecarim',patch:'16.21',augment:1058,optional:[1029,1214,1004,1311,1056],title:'攻击特效循环',summary:'用实际命中缩短技能空档，保持 Q 层数与贴身距离。',play:['攻击特效减冷却1.25秒；在安全窗口普攻衔接 Q，E 强化攻击也要命中。','W 留在能贴近敌人交战时使用，E 用于进退；被拉开时先保住自己。'],caution:'没有攻击特效命中就没有强化减冷却；不保证无缝 Q，也不保证一直有蓝。',community:'https://arammayhem.com/zh-cn/combo/hecarim-ethereal-weapon-706/',gear:[['技能接普攻',[3078],'能持续穿插普攻时比较三相；咒刃有自身冷却，不能把每次 Q 都算作额外触发。'],['需要法力',[3004],'频繁施法缺蓝时考虑魔宗；法力流仍需叠层，按实际层数安排升级。'],['物理交战压力',[6333],'需要护甲并有参与击杀机会时比较死舞；延后承伤不是免伤。'],['魔法交战压力',[3065],'需要魔抗且能利用 W 恢复时比较振奋；无法贴近敌人时不能承诺持续治疗。']]},
 {hero:'Hecarim',patch:'16.21',augment:1004,optional:[1214,1058,1029,1311,1056],title:'基础技能续战',summary:'接受失去大招，围绕 Q 层数、W 恢复与 E 进退作战。',play:['Q 命中维持层数；在能持续接触敌人时开启 W，保留 E 调整位置。','基础技能仍有空档和法力消耗，无法贴住时先撤出，不追求原来的大招进场。'],caution:'选择后不能使用 R 的突进和恐惧；不要照搬原来的进场连招。',community:'https://arammayhem.com/zh-cn/combo/hecarim-back-to-basics-703/',gear:[['基础技能轮转',[3161],'接受失去大招后比较朔极之矛的基础技能方向；急速不提供无敌或无限蓝量。'],['持续施法缺蓝',[3004],'考虑魔宗补法力，法力流仍需叠层；不要为追求轮转丢掉生存。'],['需要抗爆发',[3053],'需要生命值与低血护盾时比较血手；护盾不等于免疫伤害。'],['需要魔抗',[3065],'有魔法压力且能利用 W 恢复时比较振奋；保住进退空间。']]},
 {hero:'Hecarim',patch:'16.21',augment:1311,optional:[1056,1004,1058,1029,1214],title:'法力增效续战',summary:'围绕最大法力与持续交战，先保证技能还能放出来。',play:['法力消耗翻倍；先确认蓝量够用，再以 Q 和 W 持续交战。','E 留作进退手段，别为追伤害耗光下一次 W 的法力。'],caution:'法力消耗翻倍；更大的法力上限不等于无限回蓝，也不保证更高胜率。',gear:[['法力与攻击力',[3004],'以魔宗补法力并保留攻击力方向；法力流需要叠层，按实际层数安排升级。'],['能持续施法',[3161],'法力足够并能以技能持续命中时比较朔极之矛；先处理断蓝问题。'],['需要魔抗与恢复',[3065],'有魔法压力且能通过 W 恢复时考虑振奋；不要只堆法力而忽略承伤。']]},
 {hero:'Gwen',augment:1129,title:'法强普攻',summary:'E 后穿插普攻，法强同时服务技能与强化。',play:['用 E 接近后普攻叠 Q，Q 中心命中；别只放技能。','W 留给关键反击，能持续贴身时再考虑续航装。'],caution:'强化附加的是物理伤害；不能把这部分按技能魔法伤害计算。',gear:[['输出骨架',[3115,3089],'纳什补攻速与攻击特效，帽子补法强；这是方向，不是固定购买顺序。'],['能持续作战',[4633],'有足够交战时间再考虑裂隙。'],['需要自保',[3157],'对物理爆发或关键伤害考虑中娅；凝滞时不能继续普攻。']]},
 {hero:'Kayle',augment:1129,title:'成长型法强普攻',summary:'等攻击形态成型，用安全距离兑现法强普攻。',play:['前期先保住发育，不为触发强化强行走近。','获得远程攻击后持续普攻，E 留给合适的攻击窗口。'],caution:'强化不会让你提前获得远程形态；没有安全输出空间时先保命。',gear:[['法强与攻速',[3115,3089],'纳什与法强装备兼顾普通攻击和强化；不据此承诺固定六神装。'],['需要自保',[3157],'有法强路线且需要规避爆发时再考虑中娅。']]},
 {hero:'Teemo',augment:1129,title:'普攻提莫',summary:'有普攻空间才转，别照搬只放蘑菇的打法。',play:['先用 Q 限制对方普攻，再以攻击触发强化。','蘑菇负责区域限制；只依赖蘑菇不能兑现这项攻击强化。'],caution:'对手能持续强开、自己无法安全攻击时，这条路线不成立。',gear:[['普攻法强',[3115,3089],'纳什提供攻击频率，法强同时提高强化附加伤害。'],['需要自保',[3157],'需要规避突进爆发时考虑中娅；不要把它当持续输出装。']]},
 {hero:'Sona',augment:1141,family:'healing',optional:[1118],title:'治疗护盾保核心',summary:'围绕 W 和队友站位，把强化用在友军身上。',play:['让需要保护的队友进入 W 光环范围，别只给自己恢复。','保留安全站位与蓝量；频繁施法不等于可以无限施法。'],caution:'别因为强化治疗护盾就放弃生存，死亡期间无法持续保护。',gear:[['团队治疗',[6617],'月石提供友军治疗/护盾连锁；具体收益取决于队友位置。'],['队友靠普攻',[3504],'香炉用于实际依赖普攻的队友，不能当作所有阵容必出。'],['需要蓝量',[3003],'提前考虑女神泪叠层；购买大天使不等于立即获得炽天使护盾。']]},
 {hero:'Sona',augment:1118,family:'healing',optional:[1141],title:'会心治疗与护盾',summary:'围绕 W 的治疗和光环护盾，保住友军的持续作战。',play:['站在需要保护的队友附近施放 W，让治疗和光环护盾覆盖友军。','留好下一次 W 的蓝量与安全距离；暴击没有触发时仍需能持续保护。'],caution:'暴击并非必定触发；额外40%效果只在实际暴击时获得。',gear:[['团队治疗',[6617],'能持续给友军治疗或护盾时比较月石；不把连锁与暴击重复算成固定收益。'],['队友靠普攻',[3504],'队友依赖持续普攻，并能获得你的治疗或护盾时比较香炉。'],['需要蓝量',[3003],'频繁 W 缺蓝时考虑女神泪叠层；按实际叠层进度安排升级。']]},
 {hero:'Soraka',augment:1141,family:'healing',optional:[1118],title:'持续治疗',summary:'先维持自身状态，再给队友稳定治疗。',play:['有机会用 Q 命中恢复自己，再给需要保护的队友 W。','E 留给关键接近或持续施法；保持不会被先手击杀的位置。'],caution:'W 有自身生命代价，强化不会取消这个代价。',gear:[['团队治疗',[6617],'月石服务友军治疗；仍须满足距离与站位条件。'],['队友靠普攻',[3504],'队友确实能持续普攻时，再比较香炉的收益。']]},
 {hero:'Soraka',augment:1118,family:'healing',optional:[1141],title:'会心治疗续战',summary:'先维持自己的状态，再把治疗留给需要保护的队友。',play:['先以 Q 命中维持自身状态，再在安全距离内 W 治疗友军。','E 留给接近自己的敌人；队友倒下前保持还能继续治疗的位置。'],caution:'暴击并非必定触发；强化不取消 W 的自身生命代价，也不保证每次治疗都多40%。',gear:[['团队治疗',[6617],'持续治疗队友时比较月石，保留距离与自身生命；不把暴击与连锁治疗重复记成固定收益。'],['队友靠普攻',[3504],'需要保护的队友确实能持续普攻时，再考虑香炉。']]},
 {hero:'Jax',augment:1058,title:'普攻循环',summary:'靠实际攻击减冷却，技能之间继续普攻。',play:['在攻击窗口穿插 W，再继续普攻，别把减冷却理解为自动连招。','E 处理对方普攻压力；结束后根据实际冷却决定是否继续追击。'],caution:'被控制、缴械或拉开距离时，攻击减冷却会中断，不承诺无缝 E。',gear:[['技能接普攻',[3078],'三相的咒刃需要施法后再攻击；不是每次攻击都额外触发咒刃。'],['需要抗爆发',[3053],'需要生命值与低血护盾时比较血手，避免只追求输出。']]},
 {hero:'Volibear',augment:1058,title:'贴身普攻续战',summary:'普攻减冷却，围绕同一目标维持 W 标记。',play:['能安全贴身时持续普攻，缩短技能空档。','W 尽量留在已标记目标，E 落点照顾自身护盾；不要为追击脱离队友。'],caution:'不要仅凭有减冷却就强行开团；无法攻击时没有这条路线的持续收益。',gear:[['技能接普攻',[3078],'需要普攻与技能轮转时比较三相；仍需考虑实际坦度。'],['对魔法压力',[3065],'有魔法伤害压力且能利用自身治疗护盾时考虑振奋。']]},
 {hero:'Brand',augment:1045,title:'技能灼烧循环',summary:'技能命中挂强化灼烧，再利用基础技能回转。',play:['先以技能挂被动，再用 Q 寻找眩晕机会。','拉开安全距离持续命中，不为叠灼烧强行近身普攻。'],caution:'不要把英雄被动、装备灼烧的每一跳都当成额外减冷却触发。',gear:[['持续伤害',[6653],'能持续命中与交战时比较兰德里。'],['需要留人',[3116],'瑞莱以伤害技能附加减速，不替代 Q 的眩晕条件。'],['需要自保',[3157],'被突进或关键爆发威胁时比较中娅。']]},
 {hero:'Jinx',augment:1328,title:'暴击普攻叠攻速',summary:'先找到安全的普攻窗口，再靠暴击叠攻速。',play:['近处安全输出用机枪，远处或多人聚集时比较火箭；切火箭要留意蓝量与攻击速度差异。','参与击杀后再利用被动追击；没有启动时，不为叠强化越过队友。'],caution:'只靠 W、R 消耗不能代替普攻暴击；不要把一次火箭爆炸的多个目标直接算作多次普攻。',gear:[['普攻暴伤',[3031],'无尽兼顾攻击力、暴击率与暴击伤害；不因强化给了攻速就忽略前期攻击频率。'],['对护甲前排',[3036],'需要处理高护甲目标时比较领主的护甲穿透，不是所有对局必出。'],['需要普攻续航',[3072],'饮血的生命偷取服务实际普攻；没有安全攻击机会时不能靠它解决被秒杀。']]},
 {hero:'Caitlyn',augment:1328,title:'拉开距离持续暴击',summary:'用射程保住普攻机会，暴击叠速延续输出。',play:['陷阱限制接近路线，绳网留作拉开距离；优先攻击自己能安全触及的目标。','利用爆头窗口继续普攻，不要在可以持续攻击时只等 Q 或 R。'],caution:'爆头与普攻暴击是不同条件；有陷阱或绳网爆头，不等于每次攻击都必定触发强化。',gear:[['攻击力与暴伤',[3031],'无尽服务暴击普攻；爆头还会随暴击率成长，但不据此承诺每次必暴。'],['对护甲前排',[3036],'普攻难以处理高护甲目标时比较领主，不把穿甲当作对所有目标等额增伤。'],['需要普攻续航',[3072],'能安全攻击时再比较饮血，保留绳网应对近身威胁。']]},
 {hero:'Veigar',augment:1048,title:'法强技能暴击',summary:'继续叠法强，利用强化提供的技能暴击条件。',play:['Q 收兵叠法强，技能命中英雄也利用被动成长；先看蓝量与安全距离。','用 E 限制走位，再找 Q、W 命中窗口；R 根据目标血量决定时机，不为一次暴击强行交掉。'],basicPlay:['Q 收兵叠法强，技能命中英雄也利用被动成长；先看蓝量与安全距离。','用 E 限制走位，反复寻找 Q、W 命中窗口；不要等待大招收尾。'],caution:'E 是控制技能，不能因为有珠光就算成伤害；技能暴击也不代表要把法强装换成 AD 暴击装。',gear:[['保留法强成长',[3089],'帽子提升总法强，同时服务原有技能与强化中随法强增长的暴击率。'],['对魔抗目标',[3135],'对手魔抗较高时比较虚空的法术穿透；技能可暴击没有把魔法伤害变成物理伤害。'],['需要自保',[3157],'面对物理爆发或需要躲关键伤害时比较中娅；凝滞期间不能继续施法。']]},
 {hero:'Lux',augment:1048,title:'控制接技能暴击',summary:'保持法强与命中率，先控住再找爆发窗口。',play:['Q 命中后衔接 E、R，先判断目标是否仍在技能范围；不要把技能暴击当成必定命中。','E 可先减速再引爆；只在安全距离内考虑普攻触发被动，不为补一次攻击走入危险。'],basicPlay:['Q 命中后衔接 E，引爆后利用基础技能的下一轮冷却继续消耗；不要等待大招爆发。','W 留给自己与需要保护的队友；只在安全距离内普攻触发被动，不为补一次攻击走入危险。'],caution:'W 的护盾不是伤害，不能按暴击伤害计算；强化不要求整套改买 AD 暴击装备。',gear:[['法强爆发',[3089],'帽子保留技能法强路线，并利用珠光随法强增长的暴击率；不是固定第一件。'],['对魔抗目标',[3135],'需要处理魔抗时比较虚空；法术穿透仍按技能原有伤害类型判断。'],['需要自保',[3157],'被物理突进或关键爆发威胁时比较中娅，保住下一轮施法机会。']]},
];

export function hexCommunitySourceURLs(data){
 const community=data.communityHexRoutes||communityRoutes;
 return [...new Set([...new Set(community.routes.map(r=>r.hero))].flatMap(hero=>hexPlayerRoutes({data,hero}).flatMap(r=>communitySourceMedium(r.communitySource)?[r.communitySource.url]:[])))];
}
export function hexPlayerRoutes({data,hero,owned=[],options=[]}){
 if(!isCurrentHexData(data))return [];
 const champion=data.champions.find(c=>c.id===hero);
 const itemReview=currentHexReview(data.patch);
 if(!champion||!itemReview)return [];
 const baseReviewed=hexChampionReview(champion,data.patch)==='current';
 const community=data.communityHexRoutes||communityRoutes;
 const communityReviewed=community.patch===data.patch&&mechanicReview(champion,data.patch,community.championReview)==='current';
 if(!baseReviewed&&!communityReviewed)return [];
 const noUltimate=owned.includes(1004)&&reviewedHexMechanic(data.augments.find(a=>a.id===1004),data.patch);
 const authored=(baseReviewed?routes:[]).concat(communityReviewed?community.routes:[]);
 return authored.filter(route=>route.hero===hero&&(!route.patch||route.patch===data.patch)).flatMap(route=>{
  if(itemReview.communityPolicy==='current-source-only'&&route.community&&!route.communitySource)return [];
  if(route.requiresUltimate&&noUltimate)return [];
  const scopedItems=community.routes.includes(route)&&route.itemReview!==undefined;
  if(scopedItems&&!validCommunityItemReview(route.itemReview,route,data.patch,community.reviewedAt))return [];
  const reviewedItems=scopedItems?route.itemReview.items:itemReview.items,itemFingerprint=scopedItems?communityHexItemFingerprint:hexRouteItemFingerprint;
  const augment=data.augments.find(a=>a.id===route.augment);
  if(augment?.descriptionStatus!=='complete'||!reviewedHexMechanic(augment,data.patch)||noUltimate&&hexUltimateRequirement(augment,data.patch)||hexCatalogDisabled(data,augment)&&!owned.includes(augment.id)||options.length&&!owned.includes(augment.id)&&!options.includes(augment.id))return [];
  const optionalAugments=(route.optional||[]).flatMap(id=>{
   const a=data.augments.find(a=>a.id===id),disabled=hexCatalogDisabled(data,a);
   return a?.descriptionStatus==='complete'&&reviewedHexMechanic(a,data.patch)&&!(noUltimate&&hexUltimateRequirement(a,data.patch))&&(!disabled||owned.includes(id))?[{id,name:a.name,core:false,owned:owned.includes(id),catalogDisabled:disabled,brief:(disabled?'目录禁用；本局已选。':'')+((hero==='Jhin'&&jhinComplements[id])||(hero==='Camille'&&camilleComplements[id])||augmentComplements[id])}]:[];
  });
  let pendingItems=0;
  const gear=route.gear.flatMap(([when,ids,why,requires=[]])=>{
   if(requires.some(id=>{const a=data.augments.find(a=>a.id===id);return a?.descriptionStatus!=='complete'||!reviewedHexMechanic(a,data.patch)||noUltimate&&hexUltimateRequirement(a,data.patch)||hexCatalogDisabled(data,a)&&!owned.includes(id);}))return [];
   const items=ids.flatMap(id=>{
    const item=data.items[id];
    if(!item?.maps?.['12']||!item.inStore||item.gold?.purchasable===false||reviewedItems[id]!==itemFingerprint(item,data.patch)){pendingItems++;return [];}
    return [{id,name:item.name,description:item.description,...(route.coreItems?.includes(id)?{core:true}:{})}];
   });
   // A group explanation can depend on every listed item. Never leave old
   // combined claims behind when one of those item effects changes.
   return items.length===ids.length?[{when,why,items}]:[];
  });
  if(route.coreItems?.some(id=>!gear.some(group=>group.items.some(item=>item.id===id))))return [];
  return [{id:hero+'-'+augment.id,hero,family:route.family,optionalAugments,title:route.title,summary:route.summary,play:noUltimate&&route.basicPlay?route.basicPlay:route.play,caution:(noUltimate?'已选回归基本功，终极技能不可使用。':'')+route.caution,gear,pendingItems,ultimateUnavailable:!!noUltimate,catalogDisabled:hexCatalogDisabled(data,augment),augment:{id:augment.id,name:augment.name},state:owned.includes(augment.id)?'owned':options.includes(augment.id)?'offered':'preview',patch:data.patch,
   ...(route.communitySource?{communitySource:route.communitySource}:{}),...(route.skillPriority?{skillPriority:route.skillPriority}:{}),
   sources:[{name:'英雄技能',url:`https://ddragon.leagueoflegends.com/cdn/${data.version}/data/zh_CN/champion/${hero}.json`},{name:'海克斯强化',url:`https://raw.communitydragon.org/${data.patch}/game/maps/modespecificdata/kiwi.bin.json`},{name:'装备效果',url:`https://ddragon.leagueoflegends.com/cdn/${data.version}/data/zh_CN/item.json`},...(['Jhin','Camille'].includes(hero)?[{name:'技能完整资料',url:champion.mechanicSource.character.url}]:[]),...(route.communitySource?[{name:communitySourceLabel(route.communitySource),url:route.communitySource.url}]:[]),...(route.community?[{name:'社区思路（未标注版本日期）',url:route.community}]:[])],basis:route.communitySource?route.communitySource.adaptation:route.community?'社区思路，经项目按16.21机制改编；原组合未标注版本和日期，不是胜率或固定购买顺序。':'按当前技能、强化与装备效果推导，不是胜率或固定购买顺序。'}];
 }).sort((a,b)=>Number(b.state==='owned')-Number(a.state==='owned')||Number(b.state==='offered')-Number(a.state==='offered')).filter((route,index,all)=>!route.family||!all.slice(0,index).some(other=>other.family===route.family));
}
