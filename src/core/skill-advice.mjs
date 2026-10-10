// Mechanism references: Riot Data Dragon and same-patch 16.20 character
// SpellLevelUpInfoList. Udyr/Jayce sixth basic rank unlocks at level 11;
// Elise/Nidalee/Karma start with a free R rank. Aphelios' live ability ranks
// cannot identify his invested stat points, so his advice remains descriptive.
// These are curated options, not a claim that a rank order is statistically best.
const special=new Set(['Aphelios','Udyr','Elise','Jayce','Nidalee','Karma']);
const freeUltimate=new Set(['Elise','Nidalee','Karma']);
const keys=['Q','W','E','R'];
const initialRanks=champion=>({Q:0,W:0,E:0,R:freeUltimate.has(champion)||champion==='Jayce'?1:0});
// OP.GG's 16.20 bottom priority is Q > E > W. This is an attribute
// preparation reference, never an ordinary ability-rank sequence (the source
// also renders automatic R entries, which cannot identify stat investments).
export function attributePreparation(champion){
 return champion==='Aphelios'?{kind:'attributes',title:'厄斐琉斯属性加点',priority:['攻击力','穿甲','攻速'],
  action:'默认优先攻击力，再穿甲，最后攻速；每次升级在游戏内属性面板确认当前已投点和可用选项，再按此顺序补点。',
  note:'下路静态准备参考，可按出装与普攻手感调整；Q 与 R 随等级自动学习和成长。助手未读取已投属性点，不提示本次必须点哪一项。',
  patch:'16.20',reviewedAt:'2026-10-10',source:'OP.GG 下路优先级；Riot 特殊升级机制',sourceUrl:'https://op.gg/lol/champions/aphelios/build',
  mechanismUrls:['https://www.leagueoflegends.com/en-au/news/game-updates/aphelios-kit-primer/','https://www.leagueoflegends.com/en-us/news/game-updates/patch-10-8-notes/']}:null;
}
function rankCap(champion,key,level){
 if(champion==='Udyr'||champion==='Jayce'&&key!=='R')return Math.min(6,Math.ceil(level/2));
 if(champion==='Jayce')return 1;
 if(key==='R')return (freeUltimate.has(champion)?1:0)+[6,11,16].filter(n=>level>=n).length;
 return Math.min(5,Math.ceil(level/2));
}
export function skillMechanismNote(champion){
 return champion==='Udyr'?'四种姿态都可从一级学习，第六级在英雄11级解锁；R不是普通大招。':champion==='Jayce'?'R自动学习，不消耗技能点；Q / W / E各可升六级，第六级在英雄11级解锁。':freeUltimate.has(champion)?'R在一级自带一级，不消耗技能点；后续R在6 / 11 / 16级升级。':champion==='Aphelios'?'技能自动成长，升级点用于攻击力、攻速与穿甲；请按游戏内属性加点，实时技能等级不能还原已投属性点。':'';
}
export function legalSkillOrder(order,champion=null){
 if(typeof order!=='string'||!/^([QWER]){3,18}$/.test(order))return false;
 if(champion==='Aphelios')return false;
 const ranks=initialRanks(champion);
 for(let i=0;i<order.length;i++){const k=order[i],level=i+1;if(champion==='Jayce'&&k==='R')return false;ranks[k]++;if(ranks[k]>rankCap(champion,k,level))return false;}
 return true;
}
export function orderPriority(order,champion=null){const slots=champion==='Udyr'?keys:['Q','W','E'],ranks=Object.fromEntries(slots.map(k=>[k,0])),full=[],max=champion==='Udyr'||champion==='Jayce'?6:5;for(const k of order||''){if(k in ranks&&++ranks[k]===max)full.push(k);}return [...full,...slots.filter(k=>!full.includes(k)).sort((a,b)=>ranks[b]-ranks[a])].join('');}
export function skillOptions(champion,live){
 if(!live?.matched||champion==='Aphelios'||!Number.isInteger(live.level)||live.level<1||live.level>30)return null;
 const ranks=live.skills;
 const initial=initialRanks(champion),cap=k=>rankCap(champion,k,live.level);
 if(!keys.every(k=>Number.isInteger(ranks?.[k])&&ranks[k]>=initial[k]&&ranks[k]<=cap(k)))return null;
 const spent=keys.reduce((n,k)=>n+ranks[k]-initial[k],0),points=Math.min(18,live.level)-spent;
 if(points<0)return null;
 return {ranks,initial,spent,points,standardUltimate:champion!=='Udyr',allowed:points?keys.filter(k=>(champion!=='Jayce'||k!=='R')&&ranks[k]<cap(k)):[]};
}
export function nextSkill(champion,priority,first,live,order=null){
 const options=skillOptions(champion,live);if(!options?.points)return null;
 const {allowed,spent,ranks}=options;
 if(legalSkillOrder(order,champion)&&spent<order.length){
  const expected={...options.initial};for(const k of order.slice(0,spent+1))expected[k]++;
  const wanted=[order[spent],...(priority||''),'Q','W','E','R'].find(k=>allowed.includes(k)&&ranks[k]<expected[k]);
  if(wanted)return wanted;
 }
 if(options.standardUltimate&&allowed.includes('R'))return 'R';
 // Banked points must not skip earlier unlocks merely because the player is now level 3+.
 const opening=typeof first==='string'&&spent<3?first[spent]:null;
 if(opening&&allowed.includes(opening))return opening;
 const slots=champion==='Udyr'?'QWER':'QWE';
 const unlearned=[...(first||''),...(priority||'')].find(k=>slots.includes(k)&&ranks[k]===0&&allowed.includes(k));
 return unlearned||[...(priority||'')].find(k=>slots.includes(k)&&allowed.includes(k))||null;
}
const protection={
 Lux:{priority:'WEQ',skill:'W',why:'W 曲光屏障可保护友军，提高等级会缩短冷却，适合频繁接团时补保护。',tradeoff:'会推迟 E 的消耗与清线；护盾需要命中队友。'},
 Morgana:{priority:'EQW',skill:'E',why:'E 黑暗之盾吸收魔法伤害，护盾存在时阻止限制效果；提高等级会缩短冷却。',tradeoff:'会推迟 Q 的控制与伤害成长；它不吸收物理伤害，不能在被控后解除控制。'},
 Lulu:{priority:'EWQ',skill:'E',why:'E 帮忙，皮克斯！对友军提供保护，提高等级会缩短冷却。',tradeoff:'相应推迟 Q 的消耗或 W 的成长，需要把 E 留给被集火的队友。'},
 Janna:{priority:'EWQ',skill:'E',why:'E 风暴之眼为友军提供护盾与攻击力，提高等级会缩短冷却。',tradeoff:'会推迟 W 的对线消耗，Q 的打断时机仍需自己判断。'},
 Nami:{priority:'WEQ',skill:'W',why:'W 冲击之潮能治疗友军并伤害敌军，适合反复换血时维持血量。',tradeoff:'需要在安全距离内施放，不应为了弹射走进对方控制范围。'},
 Soraka:{priority:'WQE',skill:'W',why:'W 星之灌注治疗友军，提高等级会缩短冷却，适合持续保护。',tradeoff:'施放消耗自己的生命值，要先保证安全并利用 Q 回复。'},
};
export function recommendSkill({champion,role,priority,first,order=null,live,signals=[],custom=false,reviewed=true}){
 const base=nextSkill(champion,priority,first,live,order),options=skillOptions(champion,live);
 if(!options||!reviewed&&special.has(champion))return {next:null,base:null,changed:false,priority,reason:champion==='Aphelios'?skillMechanismNote(champion):!reviewed&&special.has(champion)?'特殊英雄加点规则与当前资料不同，暂保留所选序列，请核对游戏内可升级选项。':'技能等级尚未完整读取或不符合该英雄加点规则，暂展示原方案。',caution:'以游戏内可升级技能为准。'};
 if(!options.points)return {next:null,base:null,changed:false,priority,reason:'当前技能点已用完；升级后按新的等级重新计算。',caution:''};
 if(base==='R'&&options.standardUltimate)return {next:'R',base,changed:false,priority,reason:`当前 ${live.level} 级，R 可以升级；${order?'所选加点序列到达 R 节点。':'沿常规方案优先提升大招。'}`,caution:skillMechanismNote(champion)||'这是普通英雄的等级规则；施放时机由你判断。'};
 const relevant=reviewed?signals.filter(s=>s.source==='manual'&&['physical','magic','survival','control','teamProtection'].includes(s.kind)):[];
 let rule=role==='support'&&relevant.length?protection[champion]:null;
 if(['Malphite','Amumu'].includes(champion)&&relevant.some(s=>s.kind==='physical')&&!custom)rule={priority:'EWQ',skill:'E',why:champion==='Malphite'?'E 大地震颤降低附近敌人的攻击速度，适合贴身应对普攻压力。':'E 阿木木的愤怒被动减少物理承伤，受到普攻还会缩短其冷却。',tradeoff:'仅在你需要贴身承伤时考虑；会推迟原方案主技能的成长。'};
 // Keep explicit combo / alternative play styles. Explain instead of silently replacing them.
 if(custom&&rule)return {next:base,base,changed:false,priority,reason:`保留你选择的专用玩法加点。局势备选：${rule.why}`,caution:rule.tradeoff};
 const dynamic=rule&&options.spent>=3?nextSkill(champion,rule.priority,null,live):base;
 const changed=!!dynamic&&dynamic!==base;
 return {next:dynamic,base,changed,priority:rule&&options.spent>=3?rule.priority:priority,
  reason:rule?`${relevant[0].evidence}。${options.spent<3?'先补齐原方案前三级技能。':''}${rule.why}`:base?`${order&&options.spent<order.length?'按所选序列继续补点，保留已学技能。':`按当前方案 ${priority?.split('').join(' › ')}，${base} 仍可升级。`}`:'当前方案未给出可用的加点顺序，请按游戏内提示判断。',
  caution:rule?rule.tradeoff:!reviewed?'机制规则与当前资料不同，已停止自动改加点；请核对游戏内说明。':skillMechanismNote(champion)||'已有技能等级不会重置；来源序列结束后按优先级补点，以游戏内可升级选项为准。'};
}
