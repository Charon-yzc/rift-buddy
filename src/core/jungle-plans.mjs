// Curated mechanism-based examples, not measured fastest clears or win-rate data.
// Mechanisms and source scope: docs/jungle-planning.md. Camp orders are editorial
// candidates, not copied route maps or a promise about camp XP / clear times.
const profile=(slug,mechanics,beforeR,afterR,early=false,options={})=>({
 mechanics,beforeR,afterR,early,
 sources:[`https://www.leagueoflegends.com/en-us/champions/${slug}/`,`https://mobalytics.gg/lol/champions/${slug}/guide${options.guideQuery||''}`],
 ...options
});
const recover=(invaded,recalled,noWindow)=>({invaded,recalled,'no-window':noWindow});
const fullRoutes={red:['红BUFF','石甲虫','锋喙鸟','三狼','蓝BUFF','魔沼蛙'],blue:['蓝BUFF','魔沼蛙','三狼','锋喙鸟','红BUFF','石甲虫']};
// Single-target opening trades a cross-half walk for an earlier lane check.
// The remaining camps are optional continuation, never assumed alive or cleared.
const singleRoutes={red:['红BUFF','蓝BUFF','魔沼蛙','三狼','锋喙鸟','石甲虫'],blue:['蓝BUFF','魔沼蛙','红BUFF','锋喙鸟','石甲虫','三狼']};
const campHalf=camp=>['红BUFF','石甲虫','锋喙鸟'].includes(camp)?'red':'blue';
const edgeLane=(half,side)=>side==='blue'?(half==='red'?'下路':'上路'):(half==='red'?'上路':'下路');
export const JUNGLE_PROFILES={
 Nocturne:profile('nocturne','Q覆盖营地后在影径穿插普攻，被动帮助范围清野与续航；6级前优先经验。','让队友先控住，再用Q贴近接E；目标离开恐惧范围就别深追。','先和队友确认目标与跟进距离，再用R切入接E；W留给关键控制。'),
 Diana:profile('diana','技能后穿插普攻，Q覆盖多目标、W贴营地吸收伤害；6级R解锁后才按拉拽团战找配合。','先等队友控制，再Q命中接E；没有R时别按多人拉拽方案进场。','先沟通队友伤害能否跟上；Q命中接E近身，再用R留人，别独自冲入多人。'),
 Ivern:profile('ivern','翠神靠被动画圈与成熟释放野怪，不套普通攻击六营路线；画圈消耗生命与法力，惩戒可立即释放，成熟以游戏内显示为准。','队友能接时Q留人，E套给贴近目标的队友；不要让远处队友为了跟Q强行进场。','先让黛西和队友接触目标，Q留人、E给进场者；别为了追击把队友留在后面。'),
 JarvanIV:profile('jarvaniv','E旗帜提供攻速，Q尽量覆盖营地；被动首击帮助清野。前三营后可检查近处兵线，没有窗口继续清。','队友就位后EQ挑起接W；EQ也是撤离手段，不要空交后继续追。','先确认队友能进场，再EQ或R留人；R地形别挡住己方输出和退路。',true),
 Vi:profile('vi','技能命中触发被动护盾，普攻叠W、E覆盖多目标；清野与抓人之间保住经验节奏。','先让队友控住或走近，再用Q；Q落空就撤，不把唯一进场技能空掉后硬追。','R可以锁定目标接控制；进场前确认队友距离，别越过整队独自追后排。'),
 LeeSin:profile('leesin','技能后穿插被动强化普攻回能量，W帮助续航；前三营后检查近处机会，没有窗口就接着清。','先走近或W接近再Q；Q命中也不必立刻二段飞入，保留退路。','先沟通把目标踢向谁，避免把敌方前排踢进己方后排；缺少跟进就留R保护队友。',true),
 Sejuani:profile('sejuani','W两段覆盖小怪，普攻与W叠霜冻，大怪满足E条件后冻结再击碎；冰霜护甲消失后别硬扛入侵。','优先配合能先控或近战跟进的队友，Q接近后W叠层、满足条件才E；别把Q交掉后追到无退路。','与队友约好R命中目标，再Q/W接控制；R未命中就不继续冲，别默认同一目标能立刻再吃E。',false,{
  farmUntilR:true,checkpoint:'W适合连刷群怪：先按六营保经验，R未学会时只比较队友能先控的近处机会；不要为等抓人停刷。',
  rotation:'W覆盖同半区群怪，边刷边等冰霜护甲恢复；有R且队友能跟时再约控制，R不可用就保经验。',
  recovery:recover('冰霜护甲掉了先拉开，Q留给撤离；不为叠E回头硬拼。','先核对冰霜护甲和血蓝，用W清安全群怪接回经验。','Q或W落空就结束追击，转安全群怪；下次先约队友控制。')
 }),
 Poppy:profile('poppy','Q两段覆盖营地，调整站位让大怪留在第二段；圆盾落点安全才捡，E有墙才追加晕眩。','先从侧面找E撞墙角度，Q封退路；W留给敌方突进，没墙不要把E当必定晕眩。','近身短按R可衔接控制；需要撤离时蓄力R击退追兵，别把队友正集火的目标送走。',true,{
  checkpoint:'前三营后检查近处墙边机会，Q/W/E须实际学齐且可用；没有E撞墙角度或队友接应就继续后三营。',
  rotation:'Q清同半区群怪，顺路比较墙边E角度；没墙、目标已退或W不可用时继续刷，不在河道等碰撞。',
  recovery:recover('W留给追兵突进，E仅对可见且安全的目标使用；别为圆盾回头。','用Q清安全同半区，圆盾落点安全才捡，再找墙边路线。','没有撞墙角度就撤回营地；R击退用于脱身，不用它把残血目标送远。')
 }),
 Kindred:profile('kindred','W区域内穿插Q和走A拉野，攻击与移动积累续航；E接后续普攻处理单体大怪，别把野怪拉脱。','队友先控后E减速，W内Q调整输出位置；Q别只往前跳，给自己留撤离角度。','R保护圈也保护敌方：先和队友约好停手与圈结束后的输出，别用R救下正被集火的敌人。',true,{
  routes:singleRoutes,checkpoint:'单体三营候选后核对实际等级与Q/W/E，再看近处机会；跨半区入口不安全就留同侧补营，不为印记强闯敌区。',
  rotation:'W内Q走A刷安全营地，再看已确认的邻线；印记只在游戏内核对，不为未知敌区印记断掉经验与退路。',
  recovery:recover('Q向安全方向拉开；放弃危险印记，不因刷新标记就闯敌区。','先接安全单体营地，用W内Q走A；重新核对印记与队友支援。','E无法接后续普攻就撤，回安全营地；不要追印记目标把Q交进死路。')
 }),
 Amumu:profile('amumu','普攻挂被动诅咒，W/E覆盖群怪，受普攻缩短E冷却；离开营地关W保蓝，别双拉到血蓝失控。','队友先控或目标明显压出再Q接W/E；Q没有命中就取消，不因还有一次Q就盲追。','Q命中或安全走近后R接控制，确保队友能打到；R未就绪就按无R方案，不独自冲多人。',false,{
  farmUntilR:true,checkpoint:'W/E适合连刷六营保经验；到R学会后再约多人控制。前三营只有近处控制可靠且血蓝够才提前停刷。',
  rotation:'W/E清同半区群怪，营地间关W保蓝；R可用再约队友抓，R冷却时优先续经验。',
  recovery:recover('关W保蓝，Q只借实际可见的安全目标撤离，不向追兵强拉自己。','从安全群怪接W/E清野，离开营地关W，留够下一次Q与R法力。','Q落空或队友跟不上就停止蹲等，关W回安全群怪补经验。')
 }),
 Maokai:profile('maokai','Q覆盖群怪，被动就绪穿插普攻回血；E投安全草丛帮助清野与看入口，别为树苗把营地拉脱。','队友先靠近，W锁定后调整Q方向把目标留给队友，E限制退路；W进场没有原路返回。','R沿敌方退路逼位，队友能接再W/Q衔接；R很慢，不把远处R当已经控住。',true,{
  checkpoint:'先连刷同半区三营，Q/W/E实际学齐后看近处W接Q机会；W距离够、队友能接才停刷，否则继续另一半区。',
  rotation:'Q清同半区群怪，E先探安全入口；顺路有W距离和队友跟进再抓，不靠树苗推断敌方营地。',
  recovery:recover('E先看撤离入口，Q击退追兵；W别朝敌人越陷越深。','从安全入口Q清群怪，被动就绪再普攻回血；E检查下一入口。','W距离不够或队友没跟就撤，Q留给追兵，转安全群怪恢复经验。')
 }),
 Elise:profile('elise','人形Q按当前生命值先打，W命中准备小蜘蛛；切蜘蛛形态W加速普攻续航，蜘蛛Q适合收尾单体大怪。','人形E先命中再Q/W，切蜘蛛W普攻接Q收尾；盘丝先留作躲技能或撤离，别空E后强飞。','R是变形，1级就有，不是6级才解锁的抓人按钮；仍先人形E再切蜘蛛输出，留意对手6级多出的战斗大招。',true,{
  routes:singleRoutes,transformR:true,checkpoint:'先比较两个BUFF与魔沼蛙的单体三营候选，实际等级和Q/W/E学齐才抓；没有近处窗口就补剩余营地，不等6级变形。',
  rotation:'人形Q/W转蜘蛛普攻清安全营地，保留人形E找近处机会；盘丝撤离要有游戏内可见落点，不能当无条件逃生。',
  recovery:recover('盘丝可躲伤害，但落点须实际可见且安全；没有退路就尽早回城。','先接安全单体营地，人形Q/W转蜘蛛形态续航；补经验后再核对E机会。','人形E空了就撤，保留盘丝；补安全单体营地，不反复蹲等也不等6级才变形。')
 }),
 Nunu:profile('nunu','Q咬大怪回血，W雪球覆盖群怪，E命中后贴住触发禁锢；被动强化普攻能扫小怪，Q与惩戒数值游戏内核对。','先确认雪球路线无障碍且队友能接，W撞到后E跟住；雪球偏了或目标退回就取消，不绕塔追。','W/E控住后再找不易被打断的位置开R，队友接伤害；R减速引导不等于目标会留到结束。',true,{
  checkpoint:'Q续航、W扫群怪，先同半区三营后检查雪球进线角度；没有已确认窗口就继续清另一半区，不用反复滚空雪球。',
  rotation:'Q处理大怪、W清群怪接同半区；雪球线路和队友跟进确认才转抓。开资源前另核对Q、惩戒和邻线支援。',
  recovery:recover('雪球撞墙不算退路；朝队友方向撤，Q只咬安全可达目标，不回头抢被占营地。','Q先用于安全营地续航，再接群怪；回血不代表够蓝滚雪球。','雪球空了或入口被看见就转安全营地，用Q续航后再找新的进线角度。')
 }),
 Zac:profile('zac','W覆盖群怪，技能命中后安全拾取粘液回血；Q抓一个目标再普攻另一个把它们相撞，不为捡粘液追进危险区。','确认当前E等级的射程与队友距离，从安全位置蓄E，落地接Q双目标控制；E交掉后撤离能力差。','E落地接Q/W再R衔接击飞，确保队友跟得上；不要弹向深处把己方输出甩开。',false,{
  resourceFree:true,
  checkpoint:'W/Q清群怪、拾粘液保血，先连刷六营积累E等级；近处若E现有射程够且队友能接可提前停，不预设满级跳跃距离。',
  rotation:'W/Q清安全群怪，粘液只在安全位置拾取；按当前E等级找跳点，E还在冷却就继续补营或回城。',
  recovery:recover('E保留给安全撤离，放弃危险粘液；被动是否可用自行核对，不把复活当退路。','W/Q接安全群怪并拾粘液回血，先核对E当前射程与冷却再找跳点。','E空了就撤向队友，别靠被动赌命；安全群怪回血后再找下一次跳点。')
 }),
 Graves:profile('graves','近距离让多颗弹丸命中大怪并走A击退，E衔接装弹；Q朝贴墙营地打回弹，别让小怪挡住主目标。','先等队友控制，W封视野后侧向E找不被小兵挡住的射线；自身没有稳定硬控，E别只用来追。','控制后Q/普攻接R补伤害，保留安全射线和退路；没有队友留人时不把R当先手控制。',false,{
  checkpoint:'先按六营发育，用Q贴墙回弹与E装弹保清野节奏；前三营只有队友能先控、射线不被兵挡时才提前转抓。',
  rotation:'贴墙Q、E装弹连刷同半区；抓人先看队友控制与射线，没控制就补经验，不凭单挑机制盲闯敌区。',
  recovery:recover('E留撤离、W遮追兵视野，别为维持防御层数硬接战；子弹会被单位挡住。','先刷能贴墙Q的安全营地，E衔接装弹；重新核对装备与队友控制。','敌人缩进兵堆或队友控空就撤，用E拉开；回安全营地保经验。')
 }),
 Viego:profile('viego','Q穿透营地，技能后穿插普攻触发Q双击与回复；E沿安全地形展开提供攻速，W蓄力命中接普攻。','用E从安全侧靠近，等队友控制后W接Q/普攻；W不能穿墙，别当作越墙退路。','跟队友先集火一个目标，R用于收尾或撤离；确认击杀后的幽魂位置安全再附身，不为重置独自深入。',false,{
  resourceFree:true,
  checkpoint:'Q双击与E攻速适合连刷六营保经验，W控制短且会被挡；前三营仅比较队友先控的近处机会，不为等重置丢营地。',
  rotation:'技能接普攻连刷同半区，E覆盖安全清野区；有W且队友先控再比较抓人，不默认会有幽魂重置。',
  recovery:recover('W不能穿墙，E移速向队友撤；不为幽魂回头，R撤离先核对可用。','Q/技能接普攻恢复清野，E铺安全地形；确认R与W后再找配合。','W被挡或拿不到首个击杀就结束追击，不赌附身回血；回安全营地补经验。')
 }),
 Trundle:profile('trundle','普攻接Q咬击，W区域内利用攻速与治疗加成处理单体大怪；周围单位死亡的被动续航不代表可硬拼入侵。','W接近、E柱子放在敌方退路侧，再普攻接Q；别把柱子堵住队友，目标走出W就停止硬追。','先对队友正在集火且双抗高的目标R抽取，再W/E限制退路；R不能代替接近和队友跟进。',true,{
  guideQuery:'?role=jungle',routes:singleRoutes,checkpoint:'Q/W偏重单体，先比较双BUFF与蛙的三营候选；实际技能齐、E能封退路才抓，没有窗口就补剩余营地，不盲目入侵。',
  rotation:'Q/W先处理安全单体营地，再补同半区群怪；E柱子与队友伤害能衔接才转抓，目标脱离W范围就回营地。',
  recovery:recover('E柱子隔开追兵，W向安全方向加速；别把己方退路堵住，也不因有R就回头硬拼。','先接安全单体营地，W内普攻接Q；群怪按实际状态补，不把单挑能力当营地证据。','柱子没封住退路或目标走出W就撤回安全营地，不跨半图追人。')
 }),
 Lillia:profile('lillia','Q外圈与被动持续伤害覆盖群怪，W中心打大怪；用技能维持移速并走位拉野，别为了保层数拉脱营地。','先以E减速或跟队友控制，再Q外圈输出；没有R时缺少可靠硬控，W只在目标难躲且退路安全时交。','先用Q/E实际挂上梦尘，再R睡眠；和队友约好醒来后的爆发，别在队友太远时独自冲进人群。',false,{
  farmUntilR:true,checkpoint:'Q范围伤害与移速适合连刷六营积累经验，R前优先发育；近处有队友硬控才提前抓，不为续移速强行跨危险入口。',
  rotation:'Q外圈清同半区群怪、W中心打大怪；R就绪再约梦尘睡眠，R不可用时先刷，保移速也不能冒险进敌区。',
  recovery:recover('E减速追兵，Q命中维持移速帮助拉开，别W跳向追兵；层数掉了也不回头续。','从安全群怪重新叠移速、Q外圈清野；不能预设回城后仍有移速层数。','E空了或没有梦尘目标就撤回营地重新叠移速，R留待下一次可靠配合。')
 })
};
export function junglePlan(champion,start,side){
 const p=JUNGLE_PROFILES[champion],special=champion==='Ivern';
 const camps=[...(p?.routes||fullRoutes)[start==='blue'?'blue':'red']];
 const opening=special?[`${start==='blue'?'蓝BUFF → 魔沼蛙 → 三狼':'红BUFF → 锋喙鸟'}依次画圈；血蓝不足可缩短`,`${start==='blue'?'转红BUFF → 锋喙鸟':'转蓝BUFF → 魔沼蛙 → 三狼'}画圈；惩戒可立即释放选定营地`,'沿安全方向回收实际已成熟的营地，不盲等','回收后比较邻线配合或补给','石甲虫按实际状态与成熟情况补']:camps;
 const end=side?edgeLane(campHalf(camps.at(-1)),side):null;
 const rotationRoute=special?['安全半区画圈 → 转另一半区画圈','沿安全方向回收已成熟营地']:start==='blue'?['三狼 → 魔沼蛙 → 蓝BUFF（实际可刷时）','检查中/邻线 → 转锋喙鸟/石甲虫']:['锋喙鸟 → 石甲虫 → 红BUFF（实际可刷时）','检查中/邻线 → 转三狼/魔沼蛙'];
 if(p?.rotation)rotationRoute[1]+=`；${p.rotation}`;
 return {opening,special,profile:p,routeTitle:special?'画圈与回收示例':p?.early?'三营检查 → 无机会接着刷':'六营发育示例',
  rotationRoute,
  finish:special?'回收方向按实际安全与成熟情况调整':end?`完整示例结束靠近${end}；中路机会顺路比较`:'出生方未知：暂不指定结束靠近哪条边路',
  compactRoute:special?[start==='blue'?'蓝→蛙→三狼画圈；转红→锋喙鸟画圈':'红→锋喙鸟画圈；转蓝→蛙→三狼画圈','成熟后安全回收；惩戒可立即释放']: [camps.slice(0,3).join(' → '),camps.slice(3).join(' → ')],
  checkpoint:special?'先画起手半区，再转半区画圈；按实际成熟状态回收，血蓝不足可缩短路线。':p?.checkpoint|| (p?.early?'前三营后自己检查邻线；没有可靠机会就继续后三营，不蹲等。':'保住经验与回城节奏；遇到近处可靠机会可以提前停刷，不强行刷满。')};
}
