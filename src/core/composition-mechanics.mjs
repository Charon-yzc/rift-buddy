import {mechanicSourceInput} from './mechanic-source.mjs';

// Rift review pins recorded on 16.22.1. An unchanged pair of source hashes
// also covers another Rift patch when both sources identify that patch.
const PROOFS={
 Ahri:['e4656df5a2cc81d8','7c53539d053f4bc18d564247c1bf33cd969637e151b5409fd23476a5a5c3598c'],
 Anivia:['d7796f24d403cc8c','c0a7fec988a4af4386b82c5eca35a7c895461a4c30f6af5bb772f199387eef79'],
 Braum:['e136059064aa1034','14ba3f22becfa225f217102f4a3afefbda7342212a388624b799162df15a68ef'],
 Diana:['d9313d8c48c88394','fb9d9bc84621daf0df393c08c655f8798c75baecc7bd6f871867126813e4925f'],
 Elise:['000ddd3584c2cf29','8a721ee2df45d859bc047662d4283847469f95ce62595a3a2e97f30390e52a55'],
 Ivern:['a8c07de58a4e8f6d','0a12c85032011c969b5c63fa88c7cb478af2cebfe54fe5ac707c20488e3fc74a'],
 Leona:['7ff3b8a69842091d','9064d034ca61a09ed84bff5f9f907af1d6e08ecf7a54ec2c58b1baa658480fd0'],
 LeeSin:['ff3d80024e24db09','80d40c52770b5741edfb5d7ee192ef43fa17126f2afe8bcfcd557754eaed081a'],
 Poppy:['984283b0f66ff725','b05a5e1a84242d49aff20c87430fed1cc06b081f6ae1b62103ae574e6dc2b508'],
 Rengar:['a340ab4d1d71dccd','e2e97e8e3cb202d4aaa9481df841c8040e1b8c7356d870a84760fabd5ede9f6b'],
 Taliyah:['b2732603887d7e5f','9bef888ff2c5445a27f2a7673a9ac194ee0305de7aa8a797fdc38f4ae50e9409'],
 Galio:['e3a8cfa71c0b2970','7aa1e6e5b363ddcf43803eb25cc09aa80b8bbb39e563ae9d37443a83d08b2df5'],
 Nocturne:['7e6432fe64cf372b','8de4d928ce7dee799b759c87a7114069b297f9228ef8e51c21ba9f1da5b0ab49'],
 Lissandra:['f6bc405fcfcae9d6','a6ec51003dc0dd7956bc6f5aad1e6e6d61cd0d506eb59e91e651b7866cb4cbfe'],
 JarvanIV:['62ea4f1e9467d2b7','aa9591a707369ff6352cbb4f21e8fd8d10657e83bb690ba462cecdeb898e4ca0'],
 Malphite:['998655a1cdd4352a','5a179a096f00299a2fbe60453c0b2b14aec2fbb1f93d0a6da3f1f43515c44d34'],
 Ornn:['3b1b1c0431079787','05269a1bc1d2b9eabe5036dde9306ebb3b8684dc56f9eebfb28a9c41434c0d29'],
 Orianna:['b761493a33a91024','c4c8d45a2747f2c75e09e82185fd862a7424198fd34da2037389a4ab8409abc7'],
 Sejuani:['7cc5989bda48fb2b','e5a19fab33de3cc6693e2e963c0a2cdd2277a5dd6bdade2d17880f6a1b00c948'],
 Vi:['8c5f2d227a1d26cb','39ab18fb02a711038ea11b42a89b8d69a8d5e61f0d3257def025935e78340269'],
 Yasuo:['5c4d9aa5346ca2f7','d71e9cb941157590d2d537505d1cef1844c2136627e6c8934e7eb7d3e284137e'],
 Yone:['165686224e19c3fc','686924ad8cd0bf22941513230c18e6acdc5f9ac2d02755e8d369a51155d70112'],
 Zac:['cf22bab2f64d09f2','40df6abd439891c7e6733966c1ec367a15392cb8b52754a7df145b6b854f0ff5'],
 Brand:['12112af12e321441','6fa48fcc58833650750981e3f64657fdd6ba8392741ee11947fd48d6a7da96d4'],
 Pyke:['2fc94ca452c59007','86f12c6d02089846d871822760da759289bc2a1a4907782ba8e53372afb5c041'],
 Bard:['20f447261a6d2716','4b73426120b4a794709001352620eeb7b5644f1b7c78d674aee68a5e2b0ac692'],
 Caitlyn:['6c728252e5826813','c20fc63ea58106641698a0ae236659329540b0a824d82469602ac0ba2a57dbf6'],
 Morgana:['57d5f698304a1f45','063a6e6093dbeec416babbbe415461322fb20d02f249abf93e6ac885e31f2828'],
 Jhin:['3aaa1bcaed04d760','b7ccf25b3929cfff4413d8ac6c87d22c29e47f849ddadd2618332c5948e949ee'],
 TwistedFate:['f83bddbc2f7bb85b','ec60137c806e0ca6e86bad8bcf6a216b8295761503dbb7a61eddc6b7e82bf4f4'],
 Renekton:['1b5d01b58ae2dfac','20447bf1a1f2867c12442110f5430443a7dab367dea231831cb7d5092987004d'],
 Rakan:['14165b7ab2f27514','c4e16a57f1a6f13ba5c08e1fe861629afca5435b0a3154c4c444fe89aaa17d6a'],
 Leblanc:['4b02fbdb42c5987e','889d0275962fac17c4c8ce0536d4930548acabccfe0a122f7fe979a6e1f9d357'],
 Kennen:['8217ba3a90c36528','1f304430b94732440506d967be3a786532dbcfb840ef8e08c76200f74f6f8553'],
 Viktor:['ef737928ffc1b9ac','78e4afed5555bd1f9d0416c472b3693b5da0efdcca03b950acdcf6f910bdb731'],
 Zyra:['e6ad7484cbc1effe','18f1cd91897b66a60a6c5c3b7205668e4c2ceb6305ce5e1e4e86d0cf649f89d3'],
 Xerath:['fe85c3d422f63fd0','aef22fe15a5dfae05f3871bfc36bb3090fee429753500f2d2a04a638cac76d08'],
};
// The bundled 16.21 snapshot has different source hashes for these heroes.
// Its relevant skill conditions were independently checked against its text.
const BUNDLED_PROOFS={
 LeeSin:['ff3d80024e24db09','dedb71d6b7311cb46c30a5ab8160d9a6fce2abc2eedff722a7dd18b1f59df8a3'],
 Nocturne:['7e6432fe64cf372b','93338da160b2ed4c8ff61ee45eac0e21363f69939f6202524c29910e7beabf58'],
 JarvanIV:['62ea4f1e9467d2b7','6dfa4b87b045841df8ae4ffb982baf6308b5b5e34108ed8cfd3ae73141f9d141'],
 Ornn:['3b1b1c0431079787','933e1f225d9230fe272c8978a8b3f586e07780a0909181d18b13ebd288306060'],
 Orianna:['032f33bbd9d369d4','b1c48967c70298c50b2324aed6a5c501348eac8811984027ba7598fd54801573'],
 Yasuo:['5c4d9aa5346ca2f7','5ba9fbc24ac284698c7067f178bcf75781be14e58febbae0bd75fe15d25a69f6'],
 Jhin:['3aaa1bcaed04d760','8a8ab1af1ce47b0b95605ac535aa2e118c9ea15b494a4bd91b167ae39fe1cbc1'],
 Renekton:['1b5d01b58ae2dfac','c5a2ab3b185afe8f3477592ac9137808dd1f315d4fb407143c25c2e528aaf152'],
 Viktor:['ef737928ffc1b9ac','adff371fb352f4765fe4360f7451fe77a0f8312275ccdc41d0b325c6fb0c7e09'],
};
const SLOT_INDEX={Q:0,W:1,E:2,R:3};

// [slot, spell id or passive image, capability, condition, failure, extra gate]
const CHANNELS={
 Ahri:[
  ['E','AhriE','aimed-charm','E 的第一个敌方命中单位必须是共同目标，实际命中后才魅惑。','射线被挡、目标超距或已经脱离控制时，不按魅惑已接上处理。','line-of-fire'],
 ],
 Anivia:[
  ['W','Crystallize','temporary-terrain','W 在目标预计被推行的路径上形成冰墙，冰墙要在碰撞时仍然存在。','墙体只封住退路但没有截住推行路径时，不算已经接控。','wall'],
 ],
 Braum:[
  ['R','BraumRWrapper','airborne','R 的裂隙实际击飞共同目标，按命中位置判断浮空窗口。','只有裂隙残留减速、未命中或浮空已结束时，不能按击飞跟进。','ultimate'],
 ],
 Diana:[
  ['E','DianaTeleport','close-entry','E 选择可达的敌人并实际到达共同目标附近。只有冲到带月光的目标，E 才会刷新。','冲刺目标与队友的覆盖区域错开，或者落点过深时，停止追加。'],
 ],
 Elise:[
  ['E','EliseHumanE','immobilize','人形 E 的结茧实际命中第一个敌人并晕眩共同目标。','被其他单位挡住、落空或当前是蜘蛛形态时，按没有这段晕眩处理。','human'],
  ['E','EliseHumanE','aimed-stun','切到人形后，从没有其他敌人挡住的角度用 E 接同一个目标。','E 未命中该目标或队友已无法接应时，放弃原控制计划。','human'],
 ],
 Ivern:[
  ['W','IvernW','brush-creation','W 在队友可用的位置生成草丛，先确认草丛实际存在。','草丛已消失、队友够不到合适位置或附近没有安全目标时，停止原计划。'],
 ],
 Leona:[
  ['E','LeonaZenithBlade','immobilize','共同目标是 E 最后命中的敌方英雄，实际被禁锢，蕾欧娜向其冲刺。','E 只打到其他单位、命中的是不同英雄或落点过深时，按实际情况重整。'],
  ['Q','LeonaShieldOfDaybreak','close-stun','蕾欧娜已在普攻距离内，用强化普攻实际命中同一目标才晕眩。','目标脱离普攻范围或不能安全接近时，不追着补控制。','attack-range'],
 ],
 LeeSin:[
  ['R','LeeSinR','collision-airborne','R 踢出第一名敌方英雄，只有被其实际撞飞的后方敌方英雄属于这条接力。','没有发生后方碰撞、该英雄未浮空或队友够不到落点时，取消这条接力。','ultimate-collision'],
 ],
 Poppy:[
  ['E','PoppyE','forced-move','E 擒抱可选中的敌人，目标随波比实际移动，朝向按站位决定。','推行路径偏离后续覆盖区域时取消联动；只有撞地形才由波比 E 额外晕眩。'],
  ['E','PoppyE','terrain-collision','从可以把目标推向墙体的角度使用 E，只有实际撞上地形才晕眩并造成追加伤害。','推行距离不够、方向错开或墙体已经消失时，不按晕眩跟进。','collision'],
 ],
 Rengar:[
  ['P','Rengar_P.png','brush-leap','雷恩加尔在草丛内且目标在可跳跃距离内，以普攻触发跳跃。','没进入草丛、目标超距或落点不安全时，先保持退路；草丛本身不会自动跳跃。','attack-range'],
 ],
 Taliyah:[
  ['E','TaliyahE','displacement-trap','E 先铺在目标实际会经过的位置，敌人被强制位移经过石块时才触发这段晕眩。','目标没有经过石块或碎石阵未在场时，不能按已触发处理。','minefield'],
 ],
 Galio:[
  ['R','GalioR','ally-landing','R 可支援时选择进场友军当时的位置，落地范围实际覆盖敌人才有击飞。','施放前队友不在范围内、敌人走出落区或友军无法撑到落地时，停止按原落点接团。','ultimate'],
 ],
 Nocturne:[
  ['R','NocturneParanoia','close-entry','二段 R 选定可达的敌方英雄，并实际到达共同目标附近。','一段关灯没有进场；尚未到达、落点过深或队友不能覆盖时，放弃原接力。','ultimate-recast'],
 ],
 Lissandra:[
  ['R','LissandraR','target-stun','在范围内对同一个敌方英雄施放 R，错开前段控制。','自施 R 让自身凝滞，扩散区域造成伤害和减速，无法提供这段定点晕眩。','ultimate'],
 ],
 JarvanIV:[
  ['Q','JarvanIVDragonStrike','airborne','Q 接上已布置的军旗并完成突进，冲刺路径实际击飞共同目标。','单独的 Q 伤害、护甲削减或 R 的地形均不能代替 E Q 的实际击飞。','flag'],
  ['R','JarvanIVCataclysm','close-entry','R 选定可达的敌方英雄，嘉文实际落到共同目标附近。','落点过深、敌人离开队友覆盖或无法安全退场时，停止追加。','ultimate'],
 ],
 Malphite:[
  ['R','UFSlash','airborne','R 冲刺结束时实际击飞覆盖范围内的共同目标。','R 没有击飞该目标或队友无法安全接应时，重新判断。','ultimate'],
  ['R','UFSlash','close-entry','R 实际落到共同目标附近，且后续施法范围能够覆盖。','冲刺落点偏离或队友无法覆盖该位置时，停止按原计划接团。','ultimate'],
 ],
 Ornn:[
  ['W','OrnnW','brittle','W 的最后一道炎息实际命中共同目标并施加易碎。','只有前段命中、易碎已消耗或过期时，不能按易碎跟进。','last-tick'],
  ['E','OrnnE','airborne','E 冲锋撞到地形产生冲击波，实际击飞共同目标。','只有冲锋伤害、没有撞地形或目标在冲击波之外时，没有击飞。','terrain'],
 ],
 Orianna:[
  ['R','OrianaDetonateCommand','carried-zone','先用 E 让魔偶实际附着在进场友军身上；R 可用且魔偶仍在有效落点时再释放。','魔偶尚未到达、脱离或返回，或敌人已经退出魔偶范围时，停止按原计划接 R。','ultimate'],
 ],
 Sejuani:[
  ['Q','SejuaniQ','airborne','Q 冲锋实际命中并击飞共同目标，撞到首个敌方英雄即停止。','共同目标没有被冲锋击飞，或浮空已结束时，不能按击飞跟进。'],
  ['R','SejuaniR','target-stun','R 实际命中的第一个敌方英雄就是共同目标，并使其晕眩。','目标不是第一个命中的敌方英雄，或只受到冰风暴减速时，没有这段晕眩。','ultimate'],
 ],
 Vi:[
  ['R','ViR','airborne','R 到达选定的敌方英雄并实际击飞该目标。','尚未触碰目标或队友无法安全接应时，不能把已施放当成已击飞。','ultimate'],
  ['R','ViR','close-entry','R 选定可达敌方英雄，蔚实际到达共同目标附近。','冲刺落点超出队友覆盖或进场后无退路时，停止追加。','ultimate'],
 ],
 Yasuo:[
  ['R','YasuoR','airborne-follow','R 可用时，只对范围内仍浮空的敌方英雄衔接，并先确认落点能接应。','只有减速、禁锢、眩晕或地形围困，或者浮空已结束时，不能用这一段接 R。','ultimate'],
 ],
 Yone:[
  ['Q','YoneQ','airborne','Q 已积攒两层效果，下一次 Q 的旋风实际击飞共同目标。','普通 Q、层数过期或旋风没有击飞时，不能按击飞跟进。','stacks'],
 ],
 Zac:[
  ['E','ZacE','airborne','E 蓄力后跳到能够接应的位置，只有落点实际命中的目标才被击飞。','蓄力被打断、跳短或目标走出落点时，不能按已击飞跟进。','charge'],
  ['E','ZacE','close-entry','E 蓄力后实际落到共同目标附近，并确认队友能够覆盖该落点。','起跳未完成或落点超出队友能接应的范围时，停止追加。','charge'],
 ],
 Brand:[
  ['Q','BrandQ','self-primed','先用自己的技能（例如 E 或 W）使同一目标灼烧，Q 在灼烧仍在时实际命中该目标才会眩晕。','队友控制不会施加灼烧；目标没被灼烧、灼烧过期或 Q 先命中其他单位都不能按眩晕接力。'],
 ],
 Pyke:[
  ['Q','PykeQ','pull','Q 蓄力掷出鱼叉，第一个可命中目标确为共同目标并被实际拉回。','短刺只有减速，没有拉回；鱼叉被挡、落空或拉出队友覆盖时停止。'],
  ['E','PykeE','immobilize','E 冲刺留下的幻影必须在回程实际命中共同目标，才会眩晕。','冲刺本身没有这段眩晕；目标躲开回程路线就不要按已控到跟进。','return'],
 ],
 Bard:[
  ['Q','BardQ','ally-damage','Q 实际命中共同目标并造成伤害。','共同目标没有受到巴德伤害时，不能按烬的友方伤害标记跟进。'],
  ['R','BardR','stasis','R 实际让敌方英雄进入凝滞，且队友可安全接近落点。','也可能冻住准备跟进的队友；凝滞期间不能按已经能伤害目标处理。','ultimate'],
 ],
 Caitlyn:[
  ['W','CaitlynW','ground-trap','W 放在预期落点，须来得及激活并由该敌方英雄实际踩中才禁锢。','夹子尚未激活、目标已经移开或被另一名英雄先触发时，按实际命中结果处理。','arming'],
 ],
 Morgana:[
  ['Q','MorganaQ','immobilize','Q 的第一个敌方命中单位是共同目标并被实际禁锢。','落空或先命中其他单位就取消这段接力。'],
  ['Q','MorganaQ','ally-damage','Q 实际命中共同目标并造成伤害。','未造成伤害就不能凭 Q 已释放认为友方伤害标记成立。'],
 ],
 Jhin:[
  ['W','JhinW','marked-root','W 须命中仍处于友方伤害标记时限内的第一个敌方英雄才禁锢。','未实际造成友方伤害、标记过期或先命中其他英雄时，取消这段接力。','mark'],
 ],
 TwistedFate:[
  ['W','PickACard','immobilize','锁定金牌后，强化普攻实际命中共同目标才眩晕。','锁牌本身无眩晕；距离不够、打到其他目标或普攻未命中就停止。','attack-range'],
  ['W','PickACard','ally-damage','锁定金牌后，强化普攻实际命中共同目标并造成伤害。','锁牌本身不造成伤害；打到其他目标、未命中或未造成伤害时，不能按友军伤害标记跟进。','attack-range'],
 ],
 Renekton:[
  ['W','RenektonPreExecute','immobilize','强化普攻实际近身命中才眩晕，按当前怒气判断时长。','未近身或未命中，不能按已晕眩接力。','attack-range'],
  ['W','RenektonPreExecute','close-stun','已在可攻击距离时用 W 强化普攻实际命中同一个目标。','目标脱离距离或队友需要撤退时，不追着补控制。','attack-range'],
 ],
 Rakan:[
  ['W','RakanW','airborne','W 到达落点后实际覆盖共同目标才击飞。','没有覆盖目标、未实际浮空或友军无法接应时，取消这段接力。','landing'],
  ['W','RakanW','immobilize','W 到达后实际覆盖共同目标并使其浮空。','只有位移、落点偏离或目标逃离范围时，按没有这段控制处理。','landing'],
 ],
 Leblanc:[
  ['E','LeblancE','tether-root','E 命中共同目标后须保持连接 1.5 秒才禁锢。','被其他单位挡住、连线提前断开或无法安全维持距离时，不能按已禁锢处理。','tether'],
 ],
 Kennen:[
  ['P','Kennen_Passive.png','immobilize','共同目标实际吃满三层雷缚印并进入晕眩。','印记层数不足、分给不同目标或未实际晕眩时，取消控制接力。','stacks'],
 ],
 Viktor:[
  ['W','ViktorW','zone-stun','预铺或跟铺 W 覆盖共同目标；目标在力场内驻留 1.25 秒才晕眩。','目标提前离开或只吃到减速时，不能按接上晕眩处理。','residence'],
 ],
 Zyra:[
  ['Q','ZyraQ','ally-damage','Q 本体尖刺实际对共同敌方英雄造成伤害。','Q 未伤及该英雄或只有植物攻击时，这条直接技能伤害路径未确认。'],
  ['E','ZyraE','ally-damage','E 本体藤蔓实际对共同敌方英雄造成伤害。','E 未伤及该英雄或只有植物攻击时，这条直接技能伤害路径未确认。'],
  ['E','ZyraE','immobilize','E 本体藤蔓实际命中并禁锢共同敌方英雄。','目标没有实际被禁锢，或只受到植物减速时，不能按这段定身接力。'],
 ],
 Xerath:[
  ['Q','XerathArcanopulseChargeUp','ally-damage','Q 蓄力后释放的光束实际对共同敌方英雄造成伤害。','仅蓄力、释放落空或只伤到其他目标时，这条直接技能伤害路径未确认。'],
 ],
};

// A setup and a follow-up each have to succeed on the same target or area.
// Values are rules for fit, independent of win-rate and catalog authorship.
const MATCHES={
 brittle:{
  'target-stun':[.86,.83,'易碎接晕眩','确认同一目标仍易碎，再用晕眩触发额外伤害与控制延长。'],
  'close-stun':[.83,.79,'易碎接贴身晕眩','在易碎未被消耗且可以安全近身时，用强化普攻实际命中同一目标。'],
 },
 'brush-creation':{
  'brush-leap':[.90,.88,'造草接普攻跳跃','先确认草丛和目标位置，再由队友自行决定是否进场。'],
 },
 'forced-move':{
  'displacement-trap':[.88,.85,'推送接碎石阵','先铺石，再按推行的实际方向与石块重合处跟进。'],
 },
 'temporary-terrain':{
  'terrain-collision':[.91,.89,'造墙接撞墙晕眩','确认墙体已经生成且能截住推行路径，等目标实际撞墙后再接后续。'],
 },
 airborne:{
  'airborne-follow':[.93,.91,'击飞接狂风绝息斩','先确认同一个敌方英雄实际浮空，再决定是否接 R。'],
  'aimed-charm':[.84,.81,'击飞接魅惑','确认共同目标已浮空，留出技能飞行时间，并确保射线不会先碰到其他敌人。'],
 },
 'collision-airborne':{
  'airborne-follow':[.85,.80,'回旋踢碰撞接大','按真正被撞飞的敌方英雄和浮空窗口跟进。'],
 },
 'close-entry':{
  'carried-zone':[.90,.89,'带球进场接冲击波','先确认魔偶已经附着，进场后以魔偶当前所在位置判断。'],
  'ally-landing':[.87,.85,'进场接落点支援','在支援距离内确定落点，按敌人是否还在落区决定后续。'],
 },
 pull:{
  'displacement-trap':[.87,.83,'拉回接碎石阵','先确认拉动路径实际穿过石块；只看落点在阵内还不够。'],
  'self-primed':[.74,.56,'拉回接有前置的控制','先确认目标被拉到队友可接应的位置，再衔接同一目标。'],
 },
 immobilize:{
  'aimed-stun':[.82,.80,'定身接定向晕眩','等第一段实际命中，在目标能被接到时错开两段控制。'],
  'target-stun':[.83,.80,'定身接定点晕眩','确认第一段命中，在同一目标可选中且仍在施法距离内时错开控制。'],
  'aimed-charm':[.82,.79,'控制接魅惑','确认第一段控制命中，再找无遮挡的角度对同一目标接魅惑。'],
  'close-stun':[.81,.79,'定身接贴身晕眩','先确认第一段命中及近身路线，再用实际攻击接控。'],
  'self-primed':[.73,.55,'定身接有前置的控制','等第一段控制实际发生，再判断能否接下一段。'],
  'ground-trap':[.74,.57,'定身接陷阱','对准受控位置布夹，确认夹子能及时激活，按实际踩中结果跟进。'],
  'zone-stun':[.79,.65,'控制接驻留力场','让已受控制的目标留在力场内，按实际驻留时间判断是否接上第二段控制。'],
  'tether-root':[.78,.65,'控制接锁链禁锢','第一段实际命中后才尝试接链，禁锢取决于能否维持连接。'],
 },
 stasis:{
  'ground-trap':[.75,.59,'凝滞后接陷阱','在安全位置利用凝滞窗口布夹，等目标脱离凝滞后核对实际触发。'],
 },
 'ally-damage':{
  'marked-root':[.72,.55,'友军伤害接标记禁锢','先确认友军对同一目标造成伤害，再按标记有效时间和射线跟进。'],
 },
};
const POSITIONS=new Set(['top','jungle','mid','bottom','support']);

export function createCompositionMechanics(byId,patch){
 const proofs=new Map();
 function proof(id){
  if(!Object.hasOwn(PROOFS,id))return null;
  if(proofs.has(id))return proofs.get(id);
  const c=byId.get(id),source=mechanicSourceInput(c,patch);
  const matchesPin=pin=>pin&&source.character.sha256===pin[1]&&source.dataDragon.fingerprint===pin[0];
  const exact=source&&(matchesPin(PROOFS[id])||patch==='16.21'&&matchesPin(BUNDLED_PROOFS[id]));
  const channels=exact?CHANNELS[id].filter(([slot,spell])=>slot==='P'?c.mechanicSource.passive.image?.full===spell:c.mechanicSource.spells[SLOT_INDEX[slot]].id===spell):[];
  const result=channels.length?{channels,sourceUrls:[source.character.url,source.dataDragon.url]}:null;
  proofs.set(id,result);return result;
 }
 function match(a,b,details){
  if(a.champion===b.champion||a.role===b.role||!POSITIONS.has(a.role)||!POSITIONS.has(b.role))return null;
  const ap=proof(a.champion),bp=proof(b.champion);if(!ap||!bp)return null;
  let bestRelation=null,bestTactic=null;
  for(const [lead,follow,leadProof,followProof] of [[a,b,ap,bp],[b,a,bp,ap]])for(const setup of leadProof.channels)for(const answer of followProof.channels){
   const match=MATCHES[setup[2]]?.[answer[2]];if(!match)continue;
   const [baseQuality,baseTactic,label,step]=match;
   // Extra gates lower confidence in an executable route. A pair may have
   // different winners for relationship and tactics, with evidence for each.
   const cost=(setup[5] ? .03 : 0)+(answer[5] ? .03 : 0),quality=baseQuality-cost,tactic=baseTactic-cost;
   const relationWins=!bestRelation||quality>bestRelation.quality||quality===bestRelation.quality&&tactic>bestRelation.tactic;
   const tacticWins=!bestTactic||tactic>bestTactic.tactic||tactic===bestTactic.tactic&&quality>bestTactic.quality;
   if(!relationWins&&!tacticWins)continue;
   const route={quality,tactic,label};
   if(details){
    const memberName=m=>byId.get(m.champion)?.name||m.champion;
    const sharedLane=[a.role,b.role].includes('bottom')&&[a.role,b.role].includes('support');
    route.evidence={from:lead.champion,to:follow.champion,mechanicLabel:label,step,setupSpell:setup[1],followSpell:answer[1],
     condition:`${sharedLane?'双方都能接触同一目标':'先确认双方能在技能范围内接应同一场战斗'}，相关主动技能已学会且可用。${memberName(lead)}：${setup[3]} ${memberName(follow)}：${answer[3]}`,
     failure:`${memberName(lead)}：${setup[4]} ${memberName(follow)}：${answer[4]}`,
     patch,sourceUrls:[...new Set([...leadProof.sourceUrls,...followProof.sourceUrls])],
    };
   }
   if(relationWins)bestRelation=route;
   if(tacticWins)bestTactic=route;
  }
  return bestRelation?{relation:bestRelation,tactic:bestTactic}:null;
 }
 return {match,has:id=>!!proof(id),clear:()=>proofs.clear()};
}
