import {JUNGLE_PROFILES,junglePlan} from './jungle-plans.mjs';
export const JUNGLE_GUIDANCE_PATCH='16.20';
export const JUNGLE_SOURCES=Object.fromEntries(Object.entries(JUNGLE_PROFILES).map(([id,p])=>[id,p.sources]));
const lanes=['top','mid','bottom'],fields=['pushed','follow','control','safe'];
const labels={top:'上路',mid:'中路',bottom:'下路'};
const situations=['invaded','recalled','no-window'];
const freshAt=(at,time)=>Number.isFinite(at)&&Number.isFinite(time)&&time>=at&&time-at<=90;
export function validateJungleNotes(value){
 if(!value||typeof value!=='object')return undefined;
 const notes={...(value.start==='red'||value.start==='blue'?{start:value.start}:{}),...(['red','blue'].includes(value.side)?{side:value.side}:{}),...(['red','blue'].includes(value.half)?{half:value.half}:{}),...(['opening','rotation'].includes(value.stage)?{stage:value.stage}:{})};
 if(situations.includes(value.situation)&&Number.isFinite(value.situationAt)&&value.situationAt>=0&&value.situationAt<1e6){notes.situation=value.situation;notes.situationAt=value.situationAt;}
 if(lanes.includes(value.lane)&&Number.isFinite(value.at)&&value.at>=0&&value.at<1e6){notes.lane=value.lane;notes.at=value.at;for(const key of fields)if(value[key]===true)notes[key]=true;}
 return Object.keys(notes).length?notes:undefined;
}
export function changeJungleNotes(current,field,value,gameTime){
 let notes=validateJungleNotes(current)||{};
 if(field==='start'){if(!['red','blue'].includes(value))throw Error('起手营地不正确');return {...notes,start:value};}
 if(field==='side'){if(!['red','blue'].includes(value))throw Error('出生方不正确');return {...notes,side:value};}
 if(field==='half'){if(!['red','blue'].includes(value))throw Error('刷野半区不正确');return {...notes,half:value};}
 if(field==='stage'){if(!['opening','rotation'].includes(value))throw Error('路线阶段不正确');return {...notes,stage:value};}
 const plan=Object.fromEntries(['start','side','half','stage'].filter(k=>notes[k]).map(k=>[k,notes[k]]));
 if(field==='clear')return Object.keys(plan).length?plan:undefined;
 if(field==='resume')return {...plan};
 if(!Number.isFinite(gameTime)||gameTime<0)throw Error('进入本局后再确认兵线；助手不自动读取兵线位置');
 if(field==='situation'){if(!situations.includes(value))throw Error('中断原因不正确');return {...plan,situation:value,situationAt:gameTime};}
 if(notes.lane&&!freshAt(notes.at,gameTime))notes={...plan,lane:notes.lane};
 if(field==='lane'){if(!lanes.includes(value))throw Error('路线不正确');return {...plan,lane:value,at:gameTime};}
 if(!fields.includes(field)||!notes.lane)throw Error('先选一条要自己观察的路线');
 return {...notes,at:notes.at??gameTime,[field]:!notes[field]};
}
export function jungleGuidance({champion,role,mode,patch,live,notes,combo}={}){
 if(role!=='jungle'||mode!=='rift')return null;
 const checked=validateJungleNotes(notes)||{},matched=live?.matched===true;
 const autoSide=matched&&['blue','red'].includes(live.teamSide)?live.teamSide:null,side=autoSide||checked.side||null;
 const start=checked.start||(side==='blue'?'red':'blue'),plan=junglePlan(champion,start,side),{opening,special,profile}=plan;
 const mechanics=profile?.mechanics||'通用路线参考：先完成同半区营地，再检查邻近兵线；没有可靠机会就沿另一半区刷到等级与回城节点。本英雄尚未补专属清野手法。';
 const half=checked.half||start,rotation=junglePlan(champion,half,side).rotationRoute;
 const fresh=matched&&freshAt(checked.at,live.gameTime);
 const validQueue=live?.mapId===11&&[400,420,430,440].includes(live?.queueId),stale=patch!==JUNGLE_GUIDANCE_PATCH;
 const hp=matched&&Number.isFinite(live?.stats?.maxHp)&&live.stats.maxHp>0&&Number.isFinite(live?.stats?.hp)&&live.stats.hp>=0?live.stats.hp/live.stats.maxHp:null;
 const r=matched&&Number.isInteger(live?.skills?.R)&&live.skills.R>=0&&live.skills.R<=3?live.skills.R:null;
 const low=hp!==null&&hp<.4,dependsOnR=!!profile?.farmUntilR||['Nocturne','Diana','Fiddlesticks','Evelynn'].includes(champion),unlearnedR=dependsOnR&&r===0;
 const rawResource=matched?live?.stats?.resource:null,resource=rawResource&&['MANA','ENERGY'].includes(rawResource.type)&&Number.isFinite(rawResource.max)&&rawResource.max>0&&Number.isFinite(rawResource.value)&&rawResource.value>=0&&rawResource.value<=rawResource.max?rawResource:null;
 const lowResource=!!resource&&(resource.type==='MANA'?resource.value/resource.max<.2:resource.value<50);
 const recovery=matched&&freshAt(checked.situationAt,live.gameTime)?checked.situation:null;
 const recoveryHalf=recovery==='invaded'?(half==='red'?'blue':'red'):half;
 const recoveryRoute=recovery?[
  `${recovery==='invaded'?'另一半区候选：':'安全续刷候选：'}${junglePlan(champion,recoveryHalf,side).rotationRoute[0]}`,
  recovery==='invaded'?'入口已确认安全才走；退路不清先回城':special?'按实际成熟情况回收；不要沿旧圈序盲走':'只刷实际存活营地；近处没窗口就补给'
 ]:null;
 const basicSkillsKnown=matched&&['Q','W','E'].every(k=>Number.isInteger(live?.skills?.[k])&&live.skills[k]>0);
 const ready=!!(fresh&&checked.pushed&&checked.follow&&checked.control&&checked.safe&&basicSkillsKnown&&hp!==null&&!low&&!lowResource&&!stale&&validQueue&&!recovery);
 const routeStage=checked.stage||(!matched||!Number.isFinite(live.gameTime)||live.gameTime<210?'opening':'rotation'),openingPhase=routeStage==='opening';
 const farming=openingPhase?plan.checkpoint:profile?.rotation||'连刷同侧安全营地并计划回城；先和邻线约好控制，再比较抓人或资源，不跨图追旧机会。';
 const choices=[{id:'farm',title:'继续刷野 / 补给',text:low?'自身生命不足四成：先考虑补给或安全营地；有续航也要核对法力和敌方动向。':unlearnedR?`大招尚未学会：优先保住经验节奏，已确认的近处好机会再考虑抓。${farming}`:dependsOnR&&r===null?`大招等级未知：先在游戏内确认是否已学会、是否可用，再比较抓人机会；没有确认的近处机会就刷安全营地。${farming}`:farming},
 {id:'gank',title:ready?`${labels[checked.lane]}可比较抓人机会`:'抓人条件待核对',text:ready?`${labels[checked.lane]}：你刚确认敌方压出、队友能跟、有可靠控制和安全进退。${unlearnedR?'当前仍没有R，不按6级连招进场。':''}${r===null?'大招等级未知，不能按有R方案进场。':r>0?profile?.afterR||'和队友约好同一目标，再接控制与伤害。':profile?.beforeR||'先等队友控制，再跟进伤害。'}进场前自己确认技能就绪；目标缩回、队友回城或入口被看见就取消。`:'自己检查敌方是否压出、队友血蓝与兵线、控制和安全进退；自身基础技能未学齐或未知时不推抓人候选。不能仅凭阵容或击杀数指定要抓哪条路。'},
 {id:'resource',title:'资源 / 反蹲',text:'邻线先推、自己惩戒与队友支援都确认后再比较开资源；对方多人未露面时先保退路。反蹲依据游戏内实际看到的动向，不根据计时猜敌方位置。'}];
 const recoveries={invaded:{title:'先撤离，再改线',text:'撤向队友能接应的一侧；退路不清就回城，不等被入侵营地。'},recalled:{title:'补给后重新接路线',text:special?'从安全入口重新检查画圈和成熟营地，按实际成熟情况回收；不要照旧圈序盲走。':'从安全入口检查实际还在的营地，连刷同半区；近处有已确认机会再转抓，不跨图追旧路线。'},'no-window':{title:'停止蹲等，先补经验',text:'目标退回或队友跟不上就结束这次抓人，转同侧安全营地；先问队友下一次能接什么控制。'}};
 let lead=ready?{title:choices[1].title,text:r===null?'先确认自己技能是否可用，再和队友比较这次机会。':r>0?profile?.afterR||'约好同一目标，先手命中再跟进；技能是否就绪请自己确认。':profile?.beforeR||'等队友先控，再接伤害；技能是否就绪请自己确认。'}:{title:unlearnedR?'先补经验，近处机会再抓':special&&openingPhase?'先画圈，再回收成熟营地':profile?.early&&openingPhase?'三营后看近处，没机会继续刷':'安全营地优先，顺路看机会',text:unlearnedR?`R尚未学会；先保经验。${farming}`:farming};
 if(recovery){
  const detail=profile?.recovery?.[recovery]||'',safeRotation=recovery==='invaded'?junglePlan(champion,half==='red'?'blue':'red',side).rotationRoute[0]:rotation[0];
  lead={...recoveries[recovery],text:`${detail}${recoveries[recovery].text}${recovery==='invaded'?'另一半区入口已确认安全才改线：':'实际存活且安全才续刷：'}${safeRotation}。`};
 }
 if(lowResource)lead=resource.type==='MANA'?{title:'先恢复法力，暂停进场',text:'自身法力低于两成；先比较补给或安全续航，不开抓人或资源。恢复后也须核对整套技能消耗。'}:{title:'先回能量，别急着进场',text:'自身能量不足50；先等能量恢复并核对技能消耗，不因血量充足就继续追。'};
 if(low)lead={title:'先补给，暂停进场',text:'自身生命不足四成；不要继续抓人或争资源，先比较回城与可安全续航的营地。'};
 if(!matched||hp===null)lead={title:'等待本局自身状态',text:'健康与技能信息不全，暂不指定抓人；路线仅作开局示例。'};
 if(!validQueue&&matched)lead={title:'当前模式尚未核对',text:'专属行动只用于峡谷常规队列；此处仅保留路线参考。'};
 if(stale)lead={title:'本版路线待复核',text:'当前资料版本与机制参考不同，暂不生成抓人候选；以游戏内状态为准。'};
 const skillState=!basicSkillsKnown?'基础技能未学齐或不可读 · 冷却自行核对':r===null?'R等级未知 · 技能冷却自行核对':profile?.transformR?'R为变形，不以6级解锁 · 形态与冷却自行核对':r>0?'R已学会 ≠ 已就绪 · 冷却自行核对':'R未学会 · 技能冷却自行核对';
 const skillNote=`${profile?.resourceFree?'本体无蓝耗 · ':!resource?'血蓝/能量需核对 · ':''}${skillState}`;
 return {patch:JUNGLE_GUIDANCE_PATCH,stale,notes:checked,fresh,opening,start,side,autoSide,special,mechanics,choices,ready,recovery,recoveryRoute,lead,skillNote,openingPhase,routeStage,rotationRoute:rotation,half,
  routeTitle:profile?plan.routeTitle:'通用六营示例 · 无专属手法',finish:plan.finish,compactRoute:plan.compactRoute,checkpoint:plan.checkpoint,
  combo:combo?.ownJob||null,sources:JUNGLE_SOURCES[champion]||[],
  caution:'开局顺序是可调整的机制参考，没有16.20最优清野时间证据。兵线条件由你确认，90秒后作废；助手不读取敌方坐标、视野、施法或实际冷却。'};
}
