import {COOPERATION_SKILLS} from './cooperation-skills.mjs';

export const PARTY_COUNTERPLAY_PATCH='16.20',PARTY_COUNTERPLAY_REVIEWED_AT='2026-10-10';
const source=id=>`https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/champion/${id}.json`;
// Explicitly reviewed dashes. Vi R is unstoppable and Yasuo R is a blink:
// neither is included in Poppy W's dash interruption instruction.
const dash={Gragas:'E',Rakan:'W / E',Yasuo:'E',Vi:'Q',Ornn:'E',Sejuani:'Q'};
const key=m=>m.role+':'+m.champion;
const names={Poppy:'波比',Janna:'风女',Morgana:'莫甘娜'};
const own={
 Poppy:{
  Gragas:'若本局仍有波比，W 领域未处理时先留 E；E 被挡就取消这轮击飞，不能催洛 W 补进同一领域。',
  Rakan:'若本局仍有波比，W 领域未处理时不补 W 进场；E 回友军也是突进，退路穿过领域时不能当必能回去。',
  Yasuo:'若本局仍有波比，W 领域未处理时不 E 试探；R 是闪现到实际被击飞的目标，仍须一次 R 可用、落点安全与队友接应。',
  Vi:'若本局仍有波比，W 领域未处理时先留 Q；R 的不可阻挡突进另行确认实际到达、目标与接应，不把 R 当全队都能跟进的凭证。',
  Ornn:'若本局仍有波比，W 领域未处理时不按 E 能撞到地形安排击飞；实际停在半途就取消带球与后续控制接力。',
  Sejuani:'若本局仍有波比，W 领域未处理时先留 Q；实际没有到场或击飞就停，不让队友把预定落点当已成立。'
 },
 Janna:{
  Gragas:'若本局仍有风女，先用安全 Q 或走位试探 Q/R 的反开方向；E 被打断或成员被推散就停，不独自补 R 追第二个落点。',
  Rakan:'若本局仍有风女，保留实际能到的 E 接应友军；W 被 Q/R 打断就取消接力，友军被推离 E 范围时不能假定能回跳。',
  Yasuo:'若本局仍有风女，只跟实际击飞且安全的同一目标接一次 R；队友被 Q/R 推散就停 E 追进，不为补连招离开接应范围。'
 },
 Morgana:{
  Gragas:'若本局仍有莫甘娜，黑盾仍在时留 E/R 控制，改找可安全触及的无盾目标；盾破或结束后也须确认实际击飞，才报亚索接大。',
  Rakan:'若本局仍有莫甘娜，黑盾仍在时不预交 W/R 控制；W 没有实际击飞就取消备用接大，R 魅惑本身不提供击飞。',
  Yasuo:'若本局仍有莫甘娜，黑盾目标没有实际击飞就不接 R；队友报先手也不等于击飞已发生，改目标前重新核对一次 R 与安全落点。'
 }
};

export function createPartyCounterplay(members,enemyIds,champions){
 if(!Array.isArray(members)||members.length<2||members.length>5)return null;
 members=members.map(({role,champion})=>({role,champion}));
 const byId=new Map(champions.map(c=>[c.id,c]));
 const enemies=[...new Set((Array.isArray(enemyIds)?enemyIds:[]).filter(id=>byId.has(id)))].slice(0,5);
 const dashes=members.filter(m=>dash[m.champion]),control=members.some(m=>COOPERATION_SKILLS[m.champion]?.[3]);
 const rules=[];
 const add=(opponent,title,window,stop,action)=>{
  if(!enemies.includes(opponent))return;
  const has=id=>members.some(m=>m.champion===id);
  rules.push({opponent,name:names[opponent],title,window,stop,members:members.map(m=>{
   let instruction=own[opponent]?.[m.champion]||action(m,byId.get(m.champion)?.name||m.champion);
   if(opponent==='Poppy'&&m.champion==='Gragas'&&!has('Rakan'))instruction=instruction.replace('不能催洛 W 补进同一领域','不让队友接一个未成立的击飞');
   if(opponent==='Poppy'&&m.champion==='Ornn'&&!has('Orianna'))instruction=instruction.replace('取消带球与后续控制接力','取消后续控制接力');
   if(opponent==='Morgana'&&m.champion==='Gragas'&&!has('Yasuo'))instruction=instruction.replace('才报亚索接大','才报后续控制可以接力');
   if(opponent==='Morgana'&&m.champion==='Rakan'&&!has('Yasuo'))instruction=instruction.replace('取消备用接大','取消后续控制接力');
   return {...m,action:instruction};
  }),sources:[source(opponent),...(opponent==='Poppy'?dashes.map(m=>source(m.champion)):[])]});
 };
 if(dashes.length)add('Poppy','先处理 W 领域，再决定主线或备用进场',
  `遇到波比时，${dashes.map(m=>(byId.get(m.champion)?.name||m.champion)+' '+dash[m.champion]).join('、')}先留住；玩家确认路径不经过实际生效的 W 领域，或领域已结束，且目标、接应与退路成立才行动。不从英雄已选推算 W 是否就绪。`,
  '成员被领域拦下、缚地或无法到位就先取消这轮。'+(members.some(m=>m.champion==='Gragas')&&members.some(m=>m.champion==='Rakan')?'本套酒桶 E / 洛 W 的主线与备用都受同一领域限制；':'仍依赖上述可中断突进的主线与备用，在同一领域未处理前都取消；')+'不能换另一段同样会被拦的突进硬补。不可阻挡或闪现另行确认实际到达、目标与接应，不据此判定被拦。',
  (m,name)=>`若本局仍有波比，${name}按自己的安全距离行动；队友突进被 W 拦下就留输出与保护接应，不追到原定落点。`);
 if(control||dashes.length)add('Janna','试探反开方向，被推散就取消接力',
  '遇到风女时先从各自安全距离试探 Q 路径与 R 反开范围，成员分角度保持接应；进场者实际到位、目标仍在同一输出覆盖内才接原计划。看到一项技能用过不等于其余反开或下一次技能已不可用。',
  'Q 打断到场、R 把成员或目标推离共同覆盖时，主线与备用都先取消；留保护接应被分开的人，重新确认目标、距离与退路后再行动，不为补齐原连招分别追进。',
  (m,name)=>`若本局仍有风女，${name}保留安全的独立输出或接应；Q/R 改变实际位置后重新看覆盖，跟不上就停，不因队友已进场而强追。`);
 if(control)add('Morgana','黑盾未解除时换目标或留控制',
  '遇到莫甘娜时先确认本轮目标是否有黑盾；盾仍在就把关键控制留给可安全触及的无盾目标，或安全消耗等待。黑盾破裂或结束后，也要看到所需控制实际生效才接后续，不能把物理伤害当已破魔法盾。',
  '黑盾阻止原定控制、目标换了或控制没有实际生效时，主线与备用一并取消；重新选择能共同覆盖的无盾目标或接应退出。黑盾吸收魔法伤害与限制效果，不是全伤害免疫。',
  (m,name)=>COOPERATION_SKILLS[m.champion]?.[3]?`若本局仍有莫甘娜，${name}把控制留给可安全触及的无盾目标；盾未解除或控制未实际生效就不报接力成立。`:`若本局仍有莫甘娜，${name}可继续安全的独立消耗与输出；需要队友控制的后续另等实际生效，不为等破盾强行靠近。`);
 if(!rules.length)return null;
 return validatePartyCounterplay({schema:1,patch:PARTY_COUNTERPLAY_PATCH,reviewedAt:PARTY_COUNTERPLAY_REVIEWED_AT,enemies,rules},members);
}

const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);
export function validatePartyCounterplay(value,members){
 if(!value||value.schema!==1||typeof value.patch!=='string'||!/^\d+\.\d+$/.test(value.patch)||typeof value.reviewedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.reviewedAt)||!Array.isArray(value.enemies)||value.enemies.length<1||value.enemies.length>5||new Set(value.enemies).size!==value.enemies.length||value.enemies.some(id=>typeof id!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(id)))throw Error('共同反制条件的公开对手范围不正确');
 if(!Array.isArray(value.rules)||!value.rules.length||value.rules.length>3)throw Error('共同反制条件不完整');
 const seen=new Set(),rules=value.rules.map(row=>{
  if(!Object.hasOwn(names,row?.opponent)||!value.enemies.includes(row.opponent)||seen.has(row.opponent)||!text(row.name,80)||!text(row.title,100)||!text(row.window,600)||!text(row.stop,600))throw Error('共同反制行动条件不正确');seen.add(row.opponent);
  if(!Array.isArray(row.members)||row.members.length!==members.length)throw Error('共同反制成员不完整');
  const actions=row.members.map((m,i)=>{if(key(m)!==key(members[i])||!text(m.action,400))throw Error('共同反制行动与成员不一致');return {...members[i],action:m.action};});
  if(!Array.isArray(row.sources)||!row.sources.length||row.sources.length>7||new Set(row.sources).size!==row.sources.length||row.sources.some(url=>{const id=typeof url==='string'&&url.match(/^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/[0-9.]+\/data\/en_US\/champion\/([A-Za-z][A-Za-z0-9]{0,39})\.json$/)?.[1];return !id||id!==row.opponent&&!members.some(m=>m.champion===id);})||!row.sources.some(url=>url.endsWith('/'+row.opponent+'.json')))throw Error('共同反制技能来源不正确');
  return {opponent:row.opponent,name:row.name,title:row.title,window:row.window,stop:row.stop,members:actions,sources:[...row.sources]};
 });
 return {schema:1,patch:value.patch,reviewedAt:value.reviewedAt,enemies:[...value.enemies],rules};
}

export const resultCounterplay=result=>result.creativePlan?.counterplay||result.counterplay||null;
export const counterplayMemberAction=(context,champion,role)=>context?.rules.map(rule=>rule.members.find(m=>m.champion===champion&&m.role===role)?.action).filter(Boolean).join(' ')||'';
export const counterplayWindow=context=>context?.rules.map(rule=>rule.window).join(' ')||'';
export const counterplayStop=context=>context?.rules.map(rule=>rule.stop).join(' ')||'';
export function counterplayMemberJobs(jobs,context){return context?jobs.map(m=>({...m,job:[counterplayMemberAction(context,m.champion,m.role),m.job].filter(Boolean).join(' ')})):jobs;}
export function counterplayStage(stage,context,champion,role){
 if(!context)return stage;
 return {...stage,ownAction:[counterplayMemberAction(context,champion,role),stage.ownAction].filter(Boolean).join(' '),steps:[counterplayWindow(context),...stage.steps],window:[counterplayWindow(context),stage.window].filter(Boolean).join(' '),exit:[counterplayStop(context),stage.exit].filter(Boolean).join(' ')};
}
export function partyCounterplayText(context){return context?['采用时公开对手的共同条件；若本局仍有这些对手才适用，技能与位置须玩家重新确认。',...context.rules.flatMap(rule=>[rule.name+'：'+rule.title,'先确认：'+rule.window,'取消与接应：'+rule.stop,...rule.members.map(m=>m.champion+'：'+m.action),...rule.sources]),`反制条件 ${context.patch} · ${context.reviewedAt}；未经组合对局验证。`].join('\n'):'';}
