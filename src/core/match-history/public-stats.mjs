// Public match-card fields adapted from League Akari 60f1584c (MIT, Hanxven).
// Only these named scalar fields cross the history boundary. Never spread raw
// participants/challenges/PlayerBehavior or retain undocumented fields here.
const group=(id,label,entries)=>Object.freeze({id,label,fields:Object.freeze(entries.map(([key,name,format='number'])=>Object.freeze({key,label:name,format,group:id})))});
export const PUBLIC_STAT_GROUPS=Object.freeze([
 group('combat','战斗',[
  ['kills','击杀'],['deaths','死亡'],['assists','助攻'],['firstBloodKill','一血击杀','boolean'],['firstBloodAssist','一血助攻','boolean'],['doubleKills','双杀'],['tripleKills','三杀'],['quadraKills','四杀'],['pentaKills','五杀'],['unrealKills','超五杀'],['killingSprees','连杀次数'],['largestKillingSpree','最大连杀'],['largestMultiKill','最高多杀'],['longestTimeSpentLiving','最长存活时间','seconds'],['largestCriticalStrike','最大暴击'],['legendaryCount','超神次数'],['highestChampionDamage','最高英雄伤害','boolean'],['damageGoldEfficiency','伤害 / 金币','ratio']
 ]),
 group('state','对局状态',[
  ['gameEndedInEarlySurrender','重开','boolean'],['gameEndedInIGNBSurrender','干预提前结束','boolean'],['gameEndedInSurrender','投降结束','boolean'],['causedGameEndFromIGNBSurrender','触发干预结束','boolean'],['teamEarlySurrendered','本队提前投降','boolean'],['teamIGNBSurrendered','本队干预提前结束','boolean'],['wasPremadeWithIGNBGameEndCauser','与干预结束玩家组队','boolean'],['wasPremadeWithSevereTransgressor','与严重违规玩家组队','boolean'],['wasSevereTransgressor','严重违规标记','boolean'],['hadAfkTeammate','挂机队友标记','boolean'],['PlayerBehavior_IsHeroInCombat','战斗行为标记','boolean']
 ]),
 group('misc','等级与时间',[
  ['champLevel','英雄等级'],['champExperience','英雄经验'],['timePlayed','游戏时间','seconds'],['totalTimeSpentDead','死亡总时长','seconds'],['unseenRecalls','未被发现回城'],['perfectGame','完美对局'],['gameLength','对局时长','seconds']
 ]),
 group('damage','伤害',[
  ['totalDamageDealtToChampions','英雄伤害'],['physicalDamageDealtToChampions','物理英雄伤害'],['magicDamageDealtToChampions','魔法英雄伤害'],['trueDamageDealtToChampions','真实英雄伤害'],['totalDamageDealt','总伤害'],['physicalDamageDealt','总物理伤害'],['magicDamageDealt','总魔法伤害'],['trueDamageDealt','总真实伤害'],['damageDealtToObjectives','目标伤害'],['damageDealtToTurrets','防御塔伤害'],['damageDealtToBuildings','建筑伤害'],['damageDealtToEpicMonsters','史诗野怪伤害'],['totalDamageTaken','承受伤害'],['physicalDamageTaken','物理承伤'],['magicDamageTaken','魔法承伤'],['magicalDamageTaken','魔法承伤（历史字段）'],['trueDamageTaken','真实承伤'],['damageSelfMitigated','自我减免伤害'],['totalDamageShieldedOnTeammates','队友护盾']
 ]),
 group('cc','控制',[
  ['timeCCingOthers','控制敌人时间','seconds'],['totalTimeCCDealt','控制总时长','seconds'],['totalTimeCrowdControlDealt','群控总时长','seconds'],['enemyChampionImmobilizations','定身敌人次数'],['immobilizeAndKillWithAlly','控制后协同击杀'],['knockEnemyIntoTeamAndKill','击退进己方后击杀'],['survivedThreeImmobilizesInFight','承受三次定身后存活'],['highestCrowdControlScore','最高控制分']
 ]),
 group('vision','视野',[
  ['visionScore','视野分'],['wardsPlaced','放置守卫'],['wardsKilled','摧毁守卫'],['sightWardsBoughtInGame','购买侦查守卫'],['visionWardsBoughtInGame','购买控制守卫'],['detectorWardsPlaced','放置真眼'],['visionScorePerMinute','分均视野'],['wardTakedowns','守卫参与摧毁'],['wardTakedownsBefore20M','20 分钟前排眼'],['wardsGuarded','保护守卫'],['twoWardsOneSweeperCount','一次扫描排两眼'],['controlWardsPlaced','放置控制守卫'],['stealthWardsPlaced','放置隐形守卫'],['visionScoreAdvantageLaneOpponent','对线视野优势','percentage']
 ]),
 group('buildings','建筑',[
  ['turretKills','摧毁防御塔'],['turretTakedowns','参与摧毁防御塔'],['soloTurretsLategame','后期单拆防御塔'],['turretsLost','损失防御塔'],['firstTowerKill','首塔击杀','boolean'],['firstTowerAssist','首塔助攻','boolean'],['firstTurretKilled','首塔记录'],['firstTurretKilledTime','首塔时间','seconds'],['turretPlatesTaken','镀层'],['kTurretsDestroyedBeforePlatesFall','镀层消失前拆塔'],['outerTurretExecutesBefore10Minutes','10 分钟前外塔处决'],['quickFirstTurret','快速首塔'],['takedownOnFirstTurret','首塔参与'],['turretsTakenWithRiftHerald','先锋拆塔'],['multiTurretRiftHeraldCount','先锋拆多塔'],['inhibitorKills','摧毁水晶'],['inhibitorTakedowns','参与摧毁水晶'],['inhibitorsLost','损失水晶'],['firstInhibitorKill','首水晶击杀','boolean'],['firstInhibitorAssist','首水晶助攻','boolean'],['lostAnInhibitor','失去水晶'],['nexusKills','摧毁主堡'],['nexusLost','主堡损失'],['nexusTakedowns','参与摧毁主堡'],['hadOpenNexus','主堡裸露','boolean'],['outnumberedNexusKill','少打多摧毁主堡'],['objectivesStolen','抢夺目标'],['objectivesStolenAssists','抢夺目标助攻']
 ]),
 group('objectives','地图目标',[
  ['baronTakedowns','参与击杀大龙'],['baronBuffGoldAdvantageOverThreshold','大龙增益经济优势'],['earliestBaron','最早大龙时间','seconds'],['earliestDragonTakedown','最早小龙时间','seconds'],['dragonTakedowns','参与击杀小龙'],['riftHeraldTakedowns','参与击杀先锋'],['teamBaronKills','团队大龙'],['teamElderDragonKills','团队远古龙'],['teamRiftHeraldKills','团队先锋'],['soloBaronKills','单杀大龙'],['elderDragonKillsWithOpposingSoul','敌方龙魂时击杀远古龙'],['elderDragonMultikills','远古龙增益多杀'],['perfectDragonSoulsTaken','完美龙魂'],['epicMonsterSteals','抢夺史诗野怪'],['epicMonsterStolenWithoutSmite','无惩戒抢夺史诗野怪'],['epicMonsterKillsNearEnemyJungler','敌方打野附近击杀史诗野怪'],['epicMonsterKillsWithin30SecondsOfSpawn','刷新 30 秒内击杀史诗野怪'],['junglerTakedownsNearDamagedEpicMonster','争夺史诗野怪击杀打野'],['voidMonsterKill','虚空野怪击杀'],['alliedJungleMonsterKills','己方野怪'],['enemyJungleMonsterKills','敌方野怪'],['scuttleCrabKills','河蟹'],['buffsStolen','抢夺增益'],['jungleCsBefore10Minutes','10 分钟前野怪补刀'],['initialBuffCount','开局增益'],['initialCrabCount','开局河蟹'],['moreEnemyJungleThanOpponent','敌方野区压制'],['baronKills','击杀大龙'],['dragonKills','击杀小龙']
 ]),
 group('economy','经济与补刀',[
  ['goldEarned','获得金币'],['goldSpent','花费金币'],['bountyGold','赏金'],['totalMinionsKilled','小兵补刀'],['laneMinionsFirst10Minutes','10 分钟前线上补刀'],['twentyMinionsIn3SecondsCount','3 秒内击杀 20 小兵'],['neutralMinionsKilled','野怪补刀'],['neutralMinionsKilledEnemyJungle','敌方野区补刀'],['neutralMinionsKilledTeamJungle','己方野区补刀'],['totalAllyJungleMinionsKilled','己方野区总补刀'],['totalEnemyJungleMinionsKilled','敌方野区总补刀'],['consumablesPurchased','购买消耗品'],['itemsPurchased','购买装备'],['earlyLaningPhaseGoldExpAdvantage','前期对线经济经验优势'],['laningPhaseGoldExpAdvantage','对线经济经验优势'],['maxCsAdvantageOnLaneOpponent','最大对线补刀优势'],['completeSupportQuestInTime','及时完成辅助任务'],['mejaisFullStackInTime','及时叠满杀人书']
 ]),
 group('healing','治疗与护盾',[
  ['totalHeal','治疗'],['totalUnitsHealed','治疗单位'],['totalHealsOnTeammates','队友治疗'],['effectiveHealAndShielding','有效治疗与护盾'],['HealFromMapSources','地图来源治疗']
 ]),
 group('pings','信号',[
  ['allInPings','全力进攻信号'],['assistMePings','协助信号'],['basicPings','基础信号'],['commandPings','指挥信号'],['dangerPings','危险信号'],['enemyMissingPings','敌人消失信号'],['enemyVisionPings','敌方视野信号'],['getBackPings','撤退信号'],['holdPings','坚守信号'],['needVisionPings','需要视野信号'],['onMyWayPings','正在路上信号'],['pushPings','推线信号'],['retreatPings','后撤信号'],['visionClearedPings','视野已清除信号']
 ]),
 group('advanced','进阶战斗',[
  ['soloKills','单杀'],['quickSoloKills','快速单杀'],['takedowns','参与击杀'],['outnumberedKills','少打多击杀'],['multikills','多杀次数'],['multikillsAfterAggressiveFlash','进攻闪现后多杀'],['multiKillOneSpell','单技能多杀'],['killAfterHiddenWithAlly','与队友埋伏击杀'],['pickKillWithAlly','与队友抓单'],['killsWithHelpFromEpicMonster','史诗野怪协助击杀'],['takedownsBeforeJungleMinionSpawn','野怪刷新前参与击杀'],['takedownsFirstXMinutes','前期参与击杀'],['takedownsAfterGainingLevelAdvantage','取得等级优势后参与击杀'],['maxKillDeficit','最大击杀落后'],['maxLevelLeadLaneOpponent','最大对线等级领先'],['takedownsInAlcove','凹室参与击杀'],['takedownsInEnemyFountain','敌方泉水参与击杀'],['killsNearEnemyTurret','敌方塔下击杀'],['killsUnderOwnTurret','己方塔下击杀'],['killsOnOtherLanesEarlyJungleAsLaner','对线期跨线击杀'],['getTakedownsInAllLanesEarlyJungleAsLaner','前期全路参与击杀'],['killsOnRecentlyHealedByAramPack','击杀刚吃血包的敌人']
 ]),
 group('statistics','比率与效率',[
  ['kda','KDA'],['killParticipation','参团率','percentage'],['damagePerMinute','分均英雄伤害'],['goldPerMinute','分均金币'],['damageTakenOnTeamPercentage','承伤占比','percentage'],['teamDamagePercentage','伤害占比','percentage']
 ]),
 group('abilities','技能',[
  ['abilityUses','技能使用次数'],['spell1Casts','Q 施放次数'],['spell2Casts','W 施放次数'],['spell3Casts','E 施放次数'],['spell4Casts','R 施放次数'],['summoner1Casts','召唤师技能 1 次数'],['summoner2Casts','召唤师技能 2 次数']
 ]),
 group('survival','生存与操作',[
  ['deathsByEnemyChamps','被敌方英雄击杀'],['survivedSingleDigitHpCount','个位数生命值存活'],['tookLargeDamageSurvived','承受大量伤害后存活'],['killedChampTookFullTeamDamageSurvived','承受全队伤害击杀并存活'],['saveAllyFromDeath','挽救队友'],['skillshotsDodged','躲避非指向技能'],['skillshotsHit','命中非指向技能'],['snowballsHit','雪球命中'],['dodgeSkillShotsSmallWindow','短时间躲避技能'],['landSkillShotsEarlyGame','前期技能命中'],['blastConeOppositeOpponentCount','爆炸果实反向弹开敌人'],['quickCleanse','快速净化'],['dancedWithRiftHerald','与先锋共舞'],['fistBumpParticipation','碰拳次数']
 ]),
 group('teamfight','团战',[
  ['flawlessAces','无损团灭'],['doubleAces','双重团灭'],['acesBefore15Minutes','15 分钟前团灭'],['fullTeamTakedown','全队参与击杀'],['shortestTimeToAceFromFirstTakedown','团灭最短用时','seconds'],['12AssistStreakCount','连续 12 次助攻'],['teleportTakedowns','传送参与击杀']
 ])
]);
export const PUBLIC_STAT_FIELDS=Object.freeze(Object.fromEntries(PUBLIC_STAT_GROUPS.flatMap(g=>g.fields.map(f=>[f.key,f]))));
// Akari's SGP types declare these flags as numbers, despite boolean rendering.
// Preserve their actual 0/1 wire values; do not coerce strings or other fields.
const NUMERIC_FLAGS=new Set(['highestChampionDamage','hadOpenNexus','PlayerBehavior_IsHeroInCombat']);
const scalar=(value,field)=>field.format==='boolean'?(typeof value==='boolean'||NUMERIC_FLAGS.has(field.key)&&(value===0||value===1)?value:null):(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e12?value:null);
const own=(object,key)=>object&&typeof object==='object'&&Object.hasOwn(object,key)?object[key]:undefined;
export function cleanPublicStats(participant,source='lcu'){
 const stats=source==='sgp'?participant:participant?.stats;
 const values={};
 for(const field of Object.values(PUBLIC_STAT_FIELDS)){
  // Akari explicitly reads these two public SGP subobjects; missions and all
  // other nested objects are intentionally excluded. Only primitives survive.
  let value=scalar(own(stats,field.key),field);
  if(source==='sgp'){
   const behavior=scalar(own(own(stats,'PlayerBehavior'),field.key),field),challenge=scalar(own(own(stats,'challenges'),field.key),field),nested=challenge??behavior;
   if(nested!==null)value=nested;
  }
  values[field.key]=value;
 }
 if(values.damageGoldEfficiency===null&&values.totalDamageDealtToChampions!==null&&values.goldEarned>0)values.damageGoldEfficiency=scalar(values.totalDamageDealtToChampions/values.goldEarned,PUBLIC_STAT_FIELDS.damageGoldEfficiency);
 return values;
}
// Exact aliases support already-normalized cards while the normalizer adopts
// publicStats. Never infer a component or a missing total from other fields.
const ALIASES=Object.freeze({kills:'kills',deaths:'deaths',assists:'assists',champLevel:'level',totalDamageDealtToChampions:'damage',physicalDamageDealtToChampions:'physicalDamage',magicDamageDealtToChampions:'magicDamage',trueDamageDealtToChampions:'trueDamage',totalDamageTaken:'damageTaken',physicalDamageTaken:'physicalTaken',magicDamageTaken:'magicTaken',trueDamageTaken:'trueTaken',goldEarned:'gold',goldSpent:'goldSpent',totalHeal:'heal',visionScore:'vision',damageDealtToTurrets:'towerDamage',timeCCingOthers:'cc',totalDamageShieldedOnTeammates:'shield',totalHealsOnTeammates:'allyHeal',soloKills:'soloKills',doubleKills:'doubleKills',tripleKills:'tripleKills',quadraKills:'quadraKills',pentaKills:'pentaKills',wardsPlaced:'wardsPlaced',wardsKilled:'wardsKilled',visionWardsBoughtInGame:'controlWards',totalTimeSpentDead:'timeDead',kda:'kda',killParticipation:'kp',damagePerMinute:'damagePerMinute',teamDamagePercentage:'damageShare'});
export function publicStatValue(participant,key){
 if(!Object.hasOwn(PUBLIC_STAT_FIELDS,key))return null;
 const field=PUBLIC_STAT_FIELDS[key],value=scalar(own(participant?.publicStats,key),field);
 if(value!==null)return value;
 const alias=ALIASES[key];if(alias)return scalar(own(participant,alias),field);
 if(key==='damageGoldEfficiency'){
  const damage=publicStatValue(participant,'totalDamageDealtToChampions'),gold=publicStatValue(participant,'goldEarned');
  return damage!==null&&gold>0?scalar(damage/gold,field):null;
 }
 return null;
}
