// PC Summoner's Rift rules. Swiftplay and unconfirmed queues have different
// objectives: do not silently apply this schedule to them.
export const OBJECTIVE_RULES={patch:'16.20',reviewedAt:'2026-10-08',sources:[
 'https://www.leagueoflegends.com/en-us/news/game-updates/patch-9-23-notes/',
 'https://www.leagueoflegends.com/en-au/news/game-updates/patch-25-09-notes/',
 'https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/'
]};
const normalQueues=new Set([400,420,430,440,490]);
export function clockLabel(seconds){if(!Number.isFinite(seconds)||seconds<0)return '—';const n=Math.ceil(seconds);return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
const prepare={jungle:'先规划刷野方向和惩戒，确认队友能否先到；不要独自开资源。',support:'先与队友处理兵线，再一起布置河道视野；避免独自探草。',top:'先处理边线，确认传送与队友是否需要你；不要为了资源白丢整波线。',mid:'先处理兵线，再和打野一起进入河道；确认对方是否先到。',bottom:'提前补给并处理兵线，跟队友进入河道；先保证安全输出位置。'};
export function objectiveRhythm({live,role,patch}={}){
 const time=live?.gameTime;
 if(!live?.matched||!Number.isFinite(time)||time<0)return {available:false,reason:'进入本局并读取游戏时间后显示资源准备。',rows:[],recent:[]};
 const feed=live.objectives,events=feed?.available&&Array.isArray(feed.events)?feed.events.filter(e=>Number.isFinite(e.time)&&e.time<=time+2):[];
 const recent=events.filter(e=>e.kind!=='GameStart').slice(-5).reverse().map(e=>({...e,label:e.kind==='DragonKill'?e.dragon==='Elder'?'远古巨龙':'元素亚龙':e.kind==='BaronKill'?'纳什男爵':'峡谷先锋'}));
 if(live.mapId!==11||!normalQueues.has(live.queueId))return {available:false,reason:live.queueId===480?'快速模式资源规则不同，当前只显示已读取的资源击杀事件。':'当前队列规则尚未确认，只显示已读取的资源击杀事件。',rows:[],recent};
 const rows=[],stale=patch!==OBJECTIVE_RULES.patch;
 const row=(id,name,spawn,basis)=>{
  const remaining=Math.max(0,spawn-time),due=time>=spawn;
  rows.push({id,name,spawn,remaining,state:due?'check':remaining<=60?'prepare':'waiting',basis,
   label:due?'计时已到 · 看游戏内资源状态':`还有 ${clockLabel(remaining)}`,
   action:due?'计时到达不代表资源仍在；先看小地图与队友，再决定是否争夺。':remaining<=90?(prepare[role]||prepare.mid):`在 ${clockLabel(spawn)} 前安排补给与兵线。`});
 };
 const drakes=events.filter(e=>e.kind==='DragonKill'),last=drakes.at(-1),elder=drakes.some(e=>e.dragon==='Elder');
 const history=feed?.historyComplete===true;
 const completeSides=history&&drakes.every(e=>e.side&&e.dragon);
 const counts={ally:0,enemy:0};for(const e of drakes)if(e.dragon!=='Elder'&&e.side)counts[e.side]++;
 const soul=completeSides&&(counts.ally>=4||counts.enemy>=4);
 if(last&&(last.dragon==='Elder'||soul))row('elder','远古巨龙',last.time+360,'公开击杀事件 + 6 分钟');
 else if(last&&completeSides&&!elder)row('dragon','元素亚龙',last.time+300,'公开击杀事件 + 5 分钟');
 else if(history&&!last)row('dragon','元素亚龙',300,'首次出现时间');
 else rows.push({id:'dragon',name:'龙区',state:'unknown',label:'龙魂阶段待确认',action:'事件未完整读取或击杀队伍不明，请看游戏内龙区计时；不会把远古龙误算成元素龙。',basis:'公开事件不足'});
 if(!events.some(e=>e.kind==='HeraldKill')&&time<1200){if(time<885)row('grubs','虚空巢虫',480,'首次出现时间 · 14:45 前窗口');if(time<1200)row('herald','峡谷先锋',900,'首次出现时间');}
 const baron=events.filter(e=>e.kind==='BaronKill').at(-1);
 // First-spawn timing is authoritative here; after a kill, show the observed
 // event rather than claiming an unverified respawn timer.
 if(!baron)row('baron','纳什男爵',1200,'首次出现时间');
 else rows.push({id:'baron',name:'纳什男爵',state:'observed',label:`上次击杀 ${clockLabel(baron.time)}`,action:'下一次出现请看游戏内大龙计时，回城后提前与队友一起排视野。',basis:'公开击杀事件'});
 rows.sort((a,b)=>(a.remaining??Infinity)-(b.remaining??Infinity));
 return {available:true,rows,recent,counts:completeSides?counts:null,soul:completeSides?soul:null,stale,rules:OBJECTIVE_RULES,reason:!feed?.available?'资源事件暂不可读，仅保留首次出现时间参考。':!history?'事件历史不完整，龙魂与未观测的击杀待确认。':''};
}
const transformed=new Set(['Elise','Jayce','Nidalee','Udyr','Karma']);
const itemTips={
 '3153':'破败适合持续攻击同一目标；先用普攻与可触发攻击特效的技能消耗，别把满血特效当成固定斩杀伤害。',
 '3031':'无尽强化暴击输出；先确认实际暴击率，团战保留持续普攻的位置。',
 '3078':'三相需要在技能之间穿插普攻；不要为了触发咒刃追进无视野区域。',
 '6653':'兰德里的折磨适合持续接触；用技能续上灼烧，面对回复仍要考虑重伤。',
 '3115':'纳什之牙需要技能与普攻结合；安全持续输出比一次交完技能更能发挥装备。',
 '3089':'灭世者的死亡之帽放大法强；围绕主要技能命中争取消耗或爆发，仍需确认对手魔抗。',
 '6672':'海妖杀手围绕连续攻击发挥作用；团战先打能安全攻击的目标。',
 '3157':'中娅沙漏提供主动保命；开战前确认主动是否可用，结束金身后需要队友接应。',
 '3140':'水银饰带提供主动解控；先核对可以解除的效果，不能代替走位。',
 '3109':'骑士之誓需要在游戏内选择要保护的队友；与你实际跟随的核心一起行动。',
 '3190':'钢铁烈阳之匣围绕队友承伤窗口使用；先确认主动状态与队友范围。'
};
export function powerWindows({champion,role,live,data,route=[]}={}){
 if(!live?.matched)return {available:false,current:[],upcoming:[]};
 const level=live.level,current=[],upcoming=[];
 if(Number.isInteger(level)&&!transformed.has(champion)){
  if([5,10,15].includes(level))upcoming.push({id:'level',name:`${level+1} 级技能节点`,text:level===5?'升到6级后先确认R已学习，再找配合窗口；升级前先保证经验获取。':'下一等级通常可提升R，先确认技能点与当前英雄的升级规则。'});
  if(level>=6&&live.skills?.R>0)current.push({id:'ultimate',name:`R ${live.skills.R} 级已学习`,text:champion==='Kayle'?'凯尔6级后转为远程攻击，11级与16级继续强化；先保证等级与安全输出位置。':champion==='Yone'?'永恩可用R接队友控制；E回身位置先留安全距离，未确认R就绪时不要按整套伤害进场。':'有大招后的配合方式已解锁；开战前仍需在游戏中确认冷却、资源和命中条件。'});
 }
 if(live.inventoryKnown!==false&&Array.isArray(live.inventory)){
  const held=new Set(live.inventory.filter(i=>i.count>0).map(i=>String(i.id))),seen=new Set();
  for(const entry of live.inventory){const id=String(entry.id),item=data?.items?.[id];if(!held.has(id)||seen.has(id)||!item)continue;seen.add(id);
   const knownTip=itemTips[id],routeCore=route.slice(0,3).some(i=>String(i.id)===id);
   if(knownTip||routeCore&&Number(item.gold?.total)>=2000)current.push({id,name:item.name,text:knownTip||(role==='support'?'首件路线成装已在背包；先确认装备主动与保护对象，围绕队友行动。':'路线核心已在背包；可以围绕装备补足的输出或生存能力寻找窗口，先核对对手装备与兵线。')});
  }
  const next=route.find(i=>!held.has(String(i.id))&&Number(i.cost)>=2000);if(next)upcoming.push({id:next.id,name:`下个成装节点 · ${next.name}`,text:'沿购买计划合成后再评估打法；组件齐全与已经完成成装的强度不同。'});
 }
 return {available:true,current,upcoming};
}
