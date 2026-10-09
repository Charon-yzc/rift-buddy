import {getBuild,validateRunePage} from './builds.mjs';
import {changeCompanionPlan} from './companion-plan.mjs';
import {publicMatchupOpponent,matchupPlan} from './matchup-plans.mjs';
import {profile} from './rules.mjs';
import {fingerprint} from './catalog-review.mjs';

export const MATCHUP_PREPARATION_PATCH='16.20';
export const MATCHUP_PREPARATION_REVIEWED_AT='2026-10-09';
// These describe possible pressures to confirm in-game, never an observed
// enemy build, assigned position, available cooldown or matchup win rate.
export const MATCHUP_PRESSURE_GROUPS={
 burst:'Zed Khazix Rengar Talon Qiyana Naafiri Nocturne Leblanc Fizz Akali Annie Syndra Veigar Renekton Tristana',
 poke:'Caitlyn Ezreal Ashe Varus Jayce Kennen Teemo Xerath Velkoz Ziggs Lux Zyra Brand Karma Vayne Tristana',
 dive:'Nautilus Leona Blitzcrank Thresh Alistar Rell Malphite Vi JarvanIV Hecarim Zac',
 control:'Morgana Janna Ahri Nautilus Leona Thresh Blitzcrank Lux Neeko Maokai Rell Jax Renekton Vayne Tristana',
 blockedControl:'Morgana Sivir Fiora Gwen',
 short:'Fiora Khazix Ahri Leblanc Akali Zed Janna Poppy Jax Renekton',
 chasing:'Jax Tryndamere Vayne Renekton Tristana',
 attacks:'Jax Tryndamere Vayne Renekton Tristana',
 healing:'Soraka Yuumi Sona Nami Vladimir Aatrox Warwick DrMundo Swain Tryndamere Renekton',
 armor:'Malphite Rammus Ornn Sion Shen Sejuani Nautilus Leona Rell',
};
const pressures=new Map();
for(const [tag,ids] of Object.entries(MATCHUP_PRESSURE_GROUPS))for(const id of ids.split(' '))pressures.set(id,[...(pressures.get(id)||[]),tag]);
const has=(page,id)=>page.selectedPerkIds.includes(id);
const clean=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const runeTriggers={
 8112:'电刑需要不同攻击或技能实际命中；无法安全接续时不预支爆发。',
 8010:'征服者需要持续攻击或技能命中来叠层；对手退出、回击或隐身时停止追击。',
 8008:'致命节奏需要持续安全普攻；被控或失去攻击距离时不能预支叠层收益。',
 8005:'强攻需要对同一英雄连续触发攻击；只做一次试探或切换目标时可能无法兑现。',
 8021:'迅捷步法需要先积累充能并命中攻击，提供续航和移动帮助；不会解除或免疫控制。',
 8439:'余震需要定身实际生效；控制被黑盾、法术盾或回击处理时不能预设触发。',
 8351:'冰川增幅需要定身实际生效，其减伤保护友军而非自己；控制落空时没有这项保护。',
 8465:'守护者需要与受保护友军保持触发条件，并达到伤害触发条件；独自追击时不能预支护盾。',
 8229:'奥术彗星偏向技能消耗，但彗星仍可能被走位躲掉。',
 8369:'先攻要求先造成伤害；被对手先手消耗时不能预支收益。',
 8230:'风暴掠袭者的狂涌需要在 3 秒内对一名英雄造成相当于其 25% 最大生命值的伤害；达不到伤害门槛时不能依赖加速撤离，移速也不能解除击退或定身。',
};
function triggerNotes(page,data){
 const rune=data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes)).find(r=>r.id===page.selectedPerkIds[0]);
 const notes=[runeTriggers[page.selectedPerkIds[0]]||clean(rune?.shortDesc||rune?.longDesc).slice(0,260)];
 if(has(page,8473))notes.push('骸骨镀层针对触发后的短时间多段伤害，可能先被消耗掉；不覆盖整场战斗。');
 if(has(page,8444))notes.push('复苏之风用于受到英雄伤害后的续航，不能代替即时抗爆发或躲避控制。');
 if(has(page,8453))notes.push('复苏强化治疗与护盾，需要实际产生对应效果；不是伤害减免。');
 return notes.filter(Boolean);
}
const runeRules=[
 {key:'phase',perk:8230,tags:['chasing'],score:12,title:'达到伤害门槛后的移动完整页',why:'对手有追击、击退或反打手段时，可比较当前英雄位置已有的风暴掠袭者的狂涌完整页，只有在短时间伤害达到触发门槛后才争取退出。',cost:'放弃征服者等持续战斗基石或其他收益；必须在 3 秒内造成相当于同一英雄 25% 最大生命值的伤害；无法安全达标就不能依赖加速，移速不解除定身、击退或撞墙。'},
 {key:'guardian',perk:8465,tags:['blockedControl','short','dive','control'],role:'support',score:15,title:'保护搭档的完整页',why:'对手有格挡控制、反开或进场手段时，可把一部分开团收益换成贴近搭档的保护。',cost:'放弃余震定身后的承伤或冰川的减速区域；仍需满足守护者的友军与伤害触发条件。'},
 {key:'fleet',perk:8021,tags:['poke','dive'],score:12,title:'续航与短换血完整页',why:'实际难以维持攻击距离时，比较充能后的续航与移动帮助，先保留安全补刀和撤退机会。',cost:'改变持续输出基石；移动帮助不能解除束缚、击飞或追踪大招。'},
 {key:'bone',perk:8473,tags:['burst','dive','short'],score:10,title:'比较含骸骨镀层的完整页',why:'对手能在短时间衔接多段伤害时，可比较已有坚决副系完整页。',cost:'原副系的法力、急速、经济或成长收益可能被换掉；先手消耗会影响骸骨镀层是否可用。'},
 {key:'wind',perk:8444,tags:['poke'],score:10,title:'反复消耗下的续航完整页',why:'经常受到小段英雄伤害时，可比较包含复苏之风的已有完整页。',cost:'偏向受伤后的恢复，放弃该位置其他副系收益；不能按它提供即时护盾计算。'},
 {key:'short',perk:8112,tags:['short'],score:8,title:'短接触爆发完整页',why:'对手容易换位、隐身或反开时，比较能在安全短接触里兑现的攻击与技能衔接。',cost:'放弃持续输出或其他基石；必须完成实际命中，不能为了触发追进危险位置。'},
 {key:'press',perk:8005,tags:['poke'],score:7,title:'同目标换血完整页',why:'只有能对同一目标连续兑现攻击时，才考虑这套换血页。',cost:'射程压制下不一定能完成触发；只用远距离试探时收益会下降。'},
 {key:'conqueror',perk:8010,tags:['armor','healing'],score:7,title:'持续接触完整页',why:'对手偏向承伤或持续回复时，可比较持续接触需要的完整页。',cost:'需要实际叠层和安全输出时间；不把前排标签当敌方已经购买护甲，也不因此强行长打。'},
];
const coreRules=[
 {key:'stasis',ids:[3157],tags:['burst'],score:14,title:'带中娅的核心路线',why:'实际物理爆发或延迟标记压力大时，比较带护甲和主动停滞的来源路线。',cost:'主动停滞时机由你掌握；占用纯伤害或其他功能成装的位置，不会自动躲掉技能。'},
 {key:'armor',ids:[3110,3143,3075,6333,3026],tags:['burst','poke','attacks'],score:10,title:'带护甲的核心路线',why:'实际普攻或物理伤害压力大时，可比较当前来源中已经存在的护甲路线。',cost:'防御功能会替换另一件输出或功能装备；护甲不处理所有伤害，复活与伤害延迟也不是无条件保命。'},
 {key:'cleanse',ids:[3222],tags:['control'],role:'support',score:14,title:'带米凯尔的保护路线',why:'搭档经常受到可移除控制时，比较带米凯尔的完整来源核心。',cost:'需要主动选择友军与使用时机；不解除滞空和压制，且会占用另一件坦度或团队功能装备的位置。'},
 {key:'shield',ids:[3190,3109],tags:['dive','blockedControl','short'],role:'support',score:9,title:'保留团队保护的核心路线',why:'接近或开团容易被处理时，可先比较护盾或保护友军的团队路线。',cost:'需要与搭档保持有效距离并掌握主动时机；不会让被格挡的控制重新生效。'},
 {key:'magic',ids:[3156,3102,2504,4401,3065],tags:['magic'],score:11,title:'带魔抗的核心路线',why:'实际魔法爆发或持续法术压力大时，比较当前来源里的魔抗路线。',cost:'会占用输出或其他防御功能的位置；魔法护盾与法术盾不处理全部伤害或全部控制。'},
 {key:'heal',ids:[3033,3165,3075],tags:['healing'],score:10,title:'带重伤的核心路线',why:'对手实际回复影响换血时，比较当前来源中已有的重伤路线。',cost:'需要按装备条件实际施加重伤，会推迟另一件输出或功能装备；只看英雄标签不足以决定购买时机。'},
 {key:'penetration',ids:[3036,3071,6694],tags:['armor'],score:8,title:'穿透与持续输出路线',why:'对方已经购买护甲、并且你能安全持续输出时，可比较已有穿透或削甲核心。',cost:'不会自动解决接近和自保问题；不要只凭前排英雄标签提早放弃生存或其他功能。'},
];
function enemyPressures(enemy){
 const tags=new Set(pressures.get(enemy.id)||[]),p=profile(enemy);
 if(!tags.size){if(p.poke)tags.add('poke');if(p.engage)tags.add('dive');if(p.frontline)tags.add('armor');}
 if(p.damage==='ap')tags.add('magic');
 return tags;
}
function matchingRule(rules,eligible,tags,role){return rules.filter(r=>(!r.role||r.role===role)&&r.tags.some(t=>tags.has(t))&&eligible(r)).sort((a,b)=>b.score-a.score)[0];}
function sourcePage(option){return {kind:option.source==='OP.GG'?'OP.GG 同位置完整页':'机制完整页',patch:option.patch||MATCHUP_PREPARATION_PATCH,samples:option.samples||0};}
function coreSelection(data,selection,core,index){
 const next={...selection,variant:'default',loadoutId:'default',coreIndex:index,coreId:'core-'+core.items.join('-'),laterIds:[]};
 const b=getBuild(data.champions.find(c=>c.id===selection.id),selection.role,data,next);
 if(!b.reference||b.selectedCoreId!==next.coreId||!core.items.every(id=>b.items.some(i=>Number(i.id)===id)))return null;
 return {selection:{...next,runeId:b.selectedRuneId,skillId:b.selectedSkillId||undefined},build:b};
}

export function matchupPreparation({data,selection,enemyIds=[],targetId='',publicContext='',build=null}={}){
 const enemy=publicMatchupOpponent(data,enemyIds,targetId),champion=data?.champions.find(c=>c.id===selection?.id);
 if(!enemy||!champion||selection.mode!=='rift')return null;
 const b=build||getBuild(champion,selection.role,data,selection),tags=enemyPressures(enemy),mechanism=matchupPlan({data,champion,role:selection.role,enemyId:enemy.id});
 let base=b;if(!b.reference){try{base=getBuild(champion,selection.role,data,{...selection,variant:'default',loadoutId:'default',coreIndex:0,coreId:undefined,laterIds:[]});}catch{base=null;}}
 const context=fingerprint([selection,publicContext,enemyIds,targetId,data.version,data.buildSource,b.selectedRuneId,b.selectedCoreId,b.loadoutId,b.runeOptions.map(o=>[o.id,o.page,o.patch,o.samples]),base?.reference]);
 const ranked=b.runeOptions.filter(o=>validateRunePage(o.page,data.runes)).map(option=>{const rule=matchingRule(runeRules,r=>has(option.page,r.perk),tags,selection.role);return {option,rule,score:rule?.score||0};}).sort((a,c)=>c.score-a.score||(c.option.id===b.selectedRuneId)-(a.option.id===b.selectedRuneId)||(c.option.source==='OP.GG')-(a.option.source==='OP.GG')||(c.option.samples||0)-(a.option.samples||0));
 const runes=[],families=new Set();
 for(const row of ranked){
  if(runes.length===2)break;const {option,rule}=row,family=rule?.key||[option.page.selectedPerkIds[0],option.page.subStyleId,'reference'].join(':');if(families.has(family))continue;families.add(family);
  runes.push({id:option.id,name:option.name,page:option.page,selected:option.id===b.selectedRuneId,title:rule?.title||'同位置的另一套完整页',why:rule?.why||'当前没有命中这套完整页的专门对位取舍，可按实际触发条件比较；不是对位排名。',cost:rule?.cost||'更换基石、副系或碎片会改变收益；请核对与当前页的全部差异。',triggers:[...triggerNotes(option.page,data),...(mechanism?.runeCondition?[mechanism.runeCondition]:[])],source:sourcePage(option),matched:!!rule,selection:{...selection,runeId:option.id}});
 }
 const coreRows=(base?.reference?.core||[]).map((core,index)=>{const rule=matchingRule(coreRules,r=>r.ids.some(id=>core.items.includes(id)),tags,selection.role);return {core,index,rule,score:rule?.score||0};}).sort((a,c)=>c.score-a.score||(c.core.samples||0)-(a.core.samples||0));
 const cores=[],coreSeen=new Set();
 for(const {core,index,rule} of coreRows){
  if(cores.length===2)break;const id='core-'+core.items.join('-');if(coreSeen.has(id))continue;
  const preview=coreSelection(data,selection,core,index);if(!preview)continue;coreSeen.add(id);
  cores.push({id,index,items:core.items.map(id=>data.items[id]),title:rule?.title||'同位置常用核心路线',why:rule?.why||'当前没有命中专门的对位装备取舍；保留常用核心或按实际局势比较其他路线。',cost:[rule?.cost||'当前三件来源不代表固定后期六件，核心与符文样本不是联合统计。',mechanism?.equipmentCondition,'选择核心会清除旧的后期装备计划。'].filter(Boolean).join(' '),source:{kind:base.reference.source,patch:base.reference.patch,samples:core.samples||0},selected:b.selectedCoreId===id&&b.loadoutId==='default',switchesLoadout:b.loadoutId!=='default',page:preview.build.runePage,priority:preview.build.priority,selection:preview.selection});
 }
 return {context,enemy:{id:enemy.id,name:enemy.name},champion:{id:champion.id,name:champion.name},role:selection.role,current:{page:b.runePage,runeName:b.selectedRune?.name,coreId:b.selectedCoreId,loadoutId:b.loadoutId,items:b.items.slice(0,3),triggers:b.runePage?triggerNotes(b.runePage,data):[]},runes,cores,
  patch:MATCHUP_PREPARATION_PATCH,reviewedAt:MATCHUP_PREPARATION_REVIEWED_AT,stale:data.patch!==MATCHUP_PREPARATION_PATCH,sourceUrl:base?.reference?.sourceUrl||null,
  sourceNote:'取舍按英雄、装备和符文机制整理；完整页与核心取自当前英雄位置的数据。来源样本不是针对所选对手的样本，也不是符文与核心联合胜率。',sourceUrls:[`https://ddragon.leagueoflegends.com/cdn/${encodeURIComponent(data.version)}/data/zh_CN/champion/${enemy.id}.json`,`https://ddragon.leagueoflegends.com/cdn/${encodeURIComponent(data.version)}/data/zh_CN/runesReforged.json`,`https://ddragon.leagueoflegends.com/cdn/${encodeURIComponent(data.version)}/data/zh_CN/item.json`]};
}

export function selectMatchupPreparation({data,selection,enemyIds,targetId,publicContext,context,kind,id}={}){
 const model=matchupPreparation({data,selection,enemyIds,targetId,publicContext});
 if(!model||model.context!==context)throw Error('英雄、位置、对手或来源已变化，请重新比较配置');
 const choice=(kind==='rune'?model.runes:kind==='core'?model.cores:[]).find(o=>o.id===id);
 if(!choice)throw Error('这套对手备选已变化，请重新比较');
 if(kind==='rune')return changeCompanionPlan(data,selection,'rune',id);
 return changeCompanionPlan(data,choice.selection,'core',choice.index);
}
