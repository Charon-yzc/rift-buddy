// Mechanism references: Riot Data Dragon 16.19.1 champion spell descriptions.
// These are curated options, not a claim that a rank order is statistically best.
const special=new Set(['Aphelios','Udyr','Elise','Jayce','Nidalee','Karma']);
const keys=['Q','W','E','R'];
export function legalSkillOrder(order){
 if(typeof order!=='string'||!/^([QWER]){3,18}$/.test(order))return false;
 const ranks={Q:0,W:0,E:0,R:0};
 for(let i=0;i<order.length;i++){const k=order[i],level=i+1;ranks[k]++;const cap=k==='R'?[6,11,16].filter(n=>level>=n).length:Math.min(5,Math.ceil(level/2));if(ranks[k]>cap)return false;}
 return true;
}
export function orderPriority(order){const ranks={Q:0,W:0,E:0},full=[];for(const k of order||''){if(k in ranks&&++ranks[k]===5)full.push(k);}return [...full,...['Q','W','E'].filter(k=>!full.includes(k)).sort((a,b)=>ranks[b]-ranks[a])].join('');}
export function skillOptions(champion,live){
 if(!live?.matched||special.has(champion)||!Number.isInteger(live.level)||live.level<1||live.level>30)return null;
 const ranks=live.skills;
 if(!keys.every(k=>Number.isInteger(ranks?.[k])&&ranks[k]>=0&&ranks[k]<=(k==='R'?3:5)))return null;
 const cap=k=>k==='R'?[6,11,16].filter(n=>live.level>=n).length:Math.min(5,Math.ceil(live.level/2));
 if(keys.some(k=>ranks[k]>cap(k)))return null;
 const spent=keys.reduce((n,k)=>n+ranks[k],0),points=Math.min(18,live.level)-spent;
 if(points<0)return null;
 return {ranks,spent,points,allowed:points?keys.filter(k=>ranks[k]<cap(k)):[]};
}
export function nextSkill(champion,priority,first,live,order=null){
 const options=skillOptions(champion,live);if(!options?.points)return null;
 const {allowed,spent,ranks}=options;
 if(legalSkillOrder(order)&&spent<order.length){
  const expected={Q:0,W:0,E:0,R:0};for(const k of order.slice(0,spent+1))expected[k]++;
  const wanted=[order[spent],...(priority||''),'Q','W','E','R'].find(k=>allowed.includes(k)&&ranks[k]<expected[k]);
  if(wanted)return wanted;
 }
 if(allowed.includes('R'))return 'R';
 // Banked points must not skip earlier unlocks merely because the player is now level 3+.
 const opening=typeof first==='string'&&spent<3?first[spent]:null;
 if(opening&&allowed.includes(opening))return opening;
 const unlearned=[...(first||''),...(priority||'')].find(k=>'QWE'.includes(k)&&ranks[k]===0&&allowed.includes(k));
 return unlearned||[...(priority||'')].find(k=>'QWE'.includes(k)&&allowed.includes(k))||null;
}
const protection={
 Lux:{priority:'WEQ',skill:'W',why:'W 曲光屏障可保护友军，提高等级会缩短冷却，适合频繁接团时补保护。',tradeoff:'会推迟 E 的消耗与清线；护盾需要命中队友。'},
 Morgana:{priority:'EQW',skill:'E',why:'E 黑暗之盾吸收魔法伤害，护盾存在时阻止限制效果；提高等级会缩短冷却。',tradeoff:'会推迟 Q 的控制与伤害成长；它不吸收物理伤害，不能在被控后解除控制。'},
 Lulu:{priority:'EWQ',skill:'E',why:'E 帮忙，皮克斯！对友军提供保护，提高等级会缩短冷却。',tradeoff:'相应推迟 Q 的消耗或 W 的成长，需要把 E 留给被集火的队友。'},
 Janna:{priority:'EWQ',skill:'E',why:'E 风暴之眼为友军提供护盾与攻击力，提高等级会缩短冷却。',tradeoff:'会推迟 W 的对线消耗，Q 的打断时机仍需自己判断。'},
 Nami:{priority:'WEQ',skill:'W',why:'W 冲击之潮能治疗友军并伤害敌军，适合反复换血时维持血量。',tradeoff:'需要在安全距离内施放，不应为了弹射走进对方控制范围。'},
 Soraka:{priority:'WQE',skill:'W',why:'W 星之灌注治疗友军，提高等级会缩短冷却，适合持续保护。',tradeoff:'施放消耗自己的生命值，要先保证安全并利用 Q 回复。'},
};
export function recommendSkill({champion,role,priority,first,order=null,orderReason='',live,signals=[],custom=false,reviewed=true}){
 const base=nextSkill(champion,priority,first,live,order),options=skillOptions(champion,live);
 if(!options)return {next:null,base:null,changed:false,priority,reason:special.has(champion)?'该英雄使用特殊技能加点机制，请按游戏内可升级选项判断。':'技能等级尚未完整读取或不符合普通加点规则，暂展示原方案。',caution:'以游戏内可升级技能为准。'};
 if(!options.points)return {next:null,base:null,changed:false,priority,reason:'当前技能点已用完；升级后按新的等级重新计算。',caution:''};
 if(base==='R')return {next:'R',base,changed:false,priority,reason:`当前 ${live.level} 级，R 可以升级；${order?'所选加点序列到达 R 节点。':'沿常规方案优先提升大招。'}`,caution:'这是普通英雄的等级规则；施放时机由你判断。'};
 const relevant=reviewed?signals.filter(s=>s.source==='manual'&&['physical','magic','survival','control','teamProtection'].includes(s.kind)):[];
 let rule=role==='support'&&relevant.length?protection[champion]:null;
 if(['Malphite','Amumu'].includes(champion)&&relevant.some(s=>s.kind==='physical')&&!custom)rule={priority:'EWQ',skill:'E',why:champion==='Malphite'?'E 大地震颤降低附近敌人的攻击速度，适合贴身应对普攻压力。':'E 阿木木的愤怒被动减少物理承伤，受到普攻还会缩短其冷却。',tradeoff:'仅在你需要贴身承伤时考虑；会推迟原方案主技能的成长。'};
 // Keep explicit combo / alternative play styles. Explain instead of silently replacing them.
 if(custom&&rule)return {next:base,base,changed:false,priority,reason:`保留你选择的专用玩法加点。局势备选：${rule.why}`,caution:rule.tradeoff};
 const dynamic=rule&&options.spent>=3?nextSkill(champion,rule.priority,null,live):base;
 const changed=!!dynamic&&dynamic!==base;
 return {next:dynamic,base,changed,priority:rule&&options.spent>=3?rule.priority:priority,
  reason:rule?`${relevant[0].evidence}。${options.spent<3?'先补齐原方案前三级技能。':''}${rule.why}`:base?`${order&&options.spent<order.length?'沿你选择的加点序列，按已点技能补齐后续节点；已排除满级或等级不足的技能。'+orderReason:`按当前方案 ${priority?.split('').join(' › ')}，${base} 仍可升级；已排除满级或等级不足的技能。`}`:'当前方案未给出可用的加点顺序，请按游戏内提示判断。',
  caution:rule?rule.tradeoff:!reviewed?'机制规则与当前资料不同，已停止自动改加点；请核对游戏内说明。':'已有技能等级不会重置；来源序列结束后按优先级补点，以游戏内可升级选项为准。'};
}
