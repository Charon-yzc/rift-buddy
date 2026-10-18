// Adapted from League Akari 60f1584c predicates/combinators.ts (MIT).
// Public mapping: normalized participant key -> LCU stats / SGP participant key.
export const HISTORY_FILTER_METRICS=Object.freeze({kills:'kills',deaths:'deaths',assists:'assists',cs:null,level:'champLevel',damage:'totalDamageDealtToChampions',physicalDamage:'physicalDamageDealtToChampions',magicDamage:'magicDamageDealtToChampions',trueDamage:'trueDamageDealtToChampions',damageTaken:'totalDamageTaken',physicalTaken:'physicalDamageTaken',magicTaken:'magicDamageTaken',trueTaken:'trueDamageTaken',gold:'goldEarned',goldSpent:'goldSpent',vision:'visionScore',heal:'totalHeal',towerDamage:'damageDealtToTurrets',cc:'timeCCingOthers',soloKills:'soloKills',doubleKills:'doubleKills',tripleKills:'tripleKills',quadraKills:'quadraKills',pentaKills:'pentaKills',shield:'totalDamageShieldedOnTeammates',allyHeal:'totalHealsOnTeammates',wardsPlaced:'wardsPlaced',wardsKilled:'wardsKilled',controlWards:'visionWardsBoughtInGame',timeDead:'totalTimeSpentDead'});
export const RULE_FIELDS=Object.freeze({kills:'击杀',deaths:'死亡',assists:'助攻',kda:'KDA',cs:'补刀',level:'等级',damage:'英雄伤害',physicalDamage:'物理英雄伤害',magicDamage:'魔法英雄伤害',trueDamage:'真实英雄伤害',damageTaken:'承伤',physicalTaken:'物理承伤',magicTaken:'魔法承伤',trueTaken:'真实承伤',gold:'金币',goldSpent:'已花金币',vision:'视野分',heal:'治疗',allyHeal:'友军治疗',shield:'友军护盾',towerDamage:'推塔伤害',cc:'控制时长（秒）',kp:'参团率 %',dgr:'伤害 / 金币 %',soloKills:'单杀',doubleKills:'双杀',tripleKills:'三杀',quadraKills:'四杀',pentaKills:'五杀',wardsPlaced:'放置守卫',wardsKilled:'摧毁守卫',controlWards:'购买控制守卫',timeDead:'死亡时长（秒）',duration:'时长（秒）',created:'开始时间（毫秒）',queue:'队列 ID',map:'地图 ID',mode:'游戏模式',gameType:'游戏类型',pve:'人机 / PVE',matched:'匹配对局',champion:'英雄 ID',position:'分路',result:'结果',surrender:'投降',item:'装备 ID',rune:'符文 ID',style:'符文系 ID',augment:'强化 ID',spell:'召唤师技能 ID',player:'玩家标识'});
export const HISTORY_FILTER_LIMITS=Object.freeze({depth:8,nodes:100,children:20,rules:20,text:32768,operations:10000});
const SCOPES=new Set(['self','any','anyone','everyone','all','ally','allies','enemy','enemies','named','player']);
const MEASURES=new Set(['value','teamShare','teamMaxShare','gameShare','gameMaxShare']);
const OPERATORS=new Set(['=','!=','>','>=','<','<=']);
const TEXT_FIELDS=new Set(['player','position','result','mode','gameType']);
const BOOLEAN_FIELDS=new Set(['pve','matched','surrender']);
const GAME_FIELDS=new Set(['queue','duration','created','map','mode','gameType','pve','matched']);
const LIST_FIELDS={item:'items',rune:'runes',style:'styles',augment:'augments',spell:'spells'};
const SLOT_LIMITS={item:6,rune:8,style:1,augment:7,spell:1};
const compare=(a,op,b)=>op==='='?a===b:op==='!='?a!==b:op==='>'?a>b:op==='>='?a>=b:op==='<'?a<b:op==='<='?a<=b:false;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const numeric=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));
const fail=message=>{throw new Error('筛选树：'+message);};
const safeText=value=>typeof value==='string'&&value.length>0&&value.length<=160&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);

// Return a fresh whitelisted JSON object. Never compile expressions or execute imported text.
export function validateHistoryFilterTree(tree){
 const seen=new Set();let count=0;
 function visit(node,depth){
  if(depth>HISTORY_FILTER_LIMITS.depth||++count>HISTORY_FILTER_LIMITS.nodes)fail('超过深度或节点上限');
  if(!plain(node)||seen.has(node))fail('节点格式不正确或存在循环');seen.add(node);
  const type=Object.hasOwn(node,'type')?node.type:'rule',keys=type==='and'||type==='or'?['type','children']:type==='not'?['type','child']:type==='scope'?['type','scope','player','quantifier','child']:type==='rule'?['type','field','operator','value','scope','player','quantifier','measure','minQuantity','slot']:[];
  if(!keys.length||Object.keys(node).some(key=>!keys.includes(key)))fail('包含未知节点或字段');
  if(type==='and'||type==='or'){
   if(!Array.isArray(node.children)||!node.children.length||node.children.length>HISTORY_FILTER_LIMITS.children)fail('AND / OR 需要 1–20 个子条件');
   return {type,children:node.children.map(child=>visit(child,depth+1))};
  }
  if(type==='not')return {type,child:visit(node.child,depth+1)};
  const result=type==='scope'?{type}:node.type?{type:'rule'}:{};
  for(const key of ['scope','player','quantifier'])if(Object.hasOwn(node,key)){
   if(key==='scope'&&!SCOPES.has(node[key])||key==='player'&&!safeText(node[key])||key==='quantifier'&&!['any','all'].includes(node[key]))fail('玩家范围不正确');
   result[key]=node[key];
  }
  if(['named','player'].includes(node.scope)&&!safeText(node.player))fail('指定玩家需要完整标识');
  if(type==='scope'){
   if(!SCOPES.has(node.scope))fail('缺少玩家范围');
   result.child=visit(node.child,depth+1);return result;
  }
  if(!Object.hasOwn(RULE_FIELDS,node.field)||!OPERATORS.has(node.operator))fail('条件或比较方式不正确');
  result.field=node.field;result.operator=node.operator;
  const list=Object.hasOwn(LIST_FIELDS,node.field);
  if(TEXT_FIELDS.has(node.field)){
   if(!safeText(node.value)||!['=','!='].includes(node.operator))fail('文字条件需要非空文字和 = / !=');
   result.value=node.value;
  }else if(BOOLEAN_FIELDS.has(node.field)){
   if(![true,false,'true','false',0,1,'0','1'].includes(node.value)||!['=','!='].includes(node.operator))fail('布尔条件需要 true / false');
   result.value=[true,'true',1,'1'].includes(node.value);
  }else{
   if(!numeric(node.value))fail('数值必须是有限数字');result.value=Number(node.value);
   if(list&&(!Number.isSafeInteger(result.value)||result.value<=0||!['=','!='].includes(node.operator)))fail('装备、符文、强化和技能需要有效 ID 和 = / !=');
  }
  if(Object.hasOwn(node,'measure')){
   if(!MEASURES.has(node.measure)||node.measure!=='value'&&(list||TEXT_FIELDS.has(node.field)||BOOLEAN_FIELDS.has(node.field)||GAME_FIELDS.has(node.field)||['kp','dgr','champion'].includes(node.field)))fail('此条件不支持占比');
   result.measure=node.measure;
  }
  for(const key of ['minQuantity','slot'])if(Object.hasOwn(node,key)){
   if(!list||!numeric(node[key])||!Number.isSafeInteger(Number(node[key])))fail('数量或槽位不正确');
   const value=Number(node[key]);
   if(key==='minQuantity'&&(value<1||value>30)||key==='slot'&&(value< -1||value>SLOT_LIMITS[node.field]))fail('数量或槽位超出范围');
   result[key]=value;
  }
  return result;
 }
 return tree===null?null:visit(tree,1);
}
export function parseHistoryFilterTree(value){
 if(typeof value!=='string'||value.length>HISTORY_FILTER_LIMITS.text)fail('JSON 文本不能超过 32768 字符');
 if(!value.trim())return null;
 let tree;try{tree=JSON.parse(value);}catch{fail('JSON 格式不正确');}
 return validateHistoryFilterTree(tree);
}

// Three-valued evaluation keeps unknown data unknown even underneath NOT.
const combine=(values,all)=>all?values.includes(false)?false:values.includes(null)?null:true:values.includes(true)?true:values.includes(null)?null:false;
const teamKnown=player=>typeof player?.team==='string'&&!!player.team&&!player.team.endsWith('unknown');
function selectedPlayers(game,node,context){
 const participants=game.participants||[],scope=node.scope||'self',pool=context.players||participants;
 if(scope==='self')return context.participant?[context.participant]:game.self?[game.self]:[];
 if(['named','player'].includes(scope))return pool.filter(p=>p.puuid===node.player||p.name===node.player);
 if(['ally','allies','enemy','enemies'].includes(scope)){
  const anchor=node.player?participants.find(p=>p.puuid===node.player||p.name===node.player):game.self;
  if(!teamKnown(anchor))return [];
  return pool.filter(p=>teamKnown(p)&&(['ally','allies'].includes(scope)?p.team===anchor.team:p.team!==anchor.team));
 }
 return pool;
}
function participantNumber(player,field){
 if(field==='dgr')return Number.isFinite(player.damage)&&Number.isFinite(player.gold)&&player.gold>0?player.damage/player.gold*100:null;
 const value=player[field];return Number.isFinite(value)?field==='kp'?value*100:value:null;
}
function listMatch(player,rule){
 let source=player[LIST_FIELDS[rule.field]];
 if(rule.field==='rune'&&player.styles?.some(v=>v.selections?.length))source=player.styles.flatMap(v=>(v.selections||[]).map(r=>r.perk));
 if(rule.field==='augment'&&Array.isArray(player.augmentSlots))source=player.augmentSlots;
 if(!Array.isArray(source))return null;
 let list=rule.field==='style'?source.map(v=>typeof v==='number'?v:v?.style):source;
 if(rule.field==='item'&&Number.isSafeInteger(player.roleBoundItem)&&player.roleBoundItem>0&&!list.includes(player.roleBoundItem)&&!(rule.slot>=0))list=[...list,player.roleBoundItem];
 if(rule.slot>=0)list=[list[rule.slot]];
 const count=list.filter(v=>v===rule.value).length,unknown=list.some(v=>!Number.isSafeInteger(v)||v<0),minimum=rule.minQuantity||1;
 const found=count>=minimum?true:unknown?null:false;
 return rule.operator==='!='?(found===null?null:!found):found;
}
function participantMatch(game,player,rule){
 if(Object.hasOwn(LIST_FIELDS,rule.field))return listMatch(player,rule);
 if(rule.field==='player'){const identities=[player.puuid,player.name].filter(Boolean);return identities.length?(rule.operator==='='?identities.includes(rule.value):!identities.includes(rule.value)):null;}
 if(TEXT_FIELDS.has(rule.field))return player[rule.field]&&player[rule.field]!=='unknown'?compare(player[rule.field],rule.operator,rule.value):null;
 if(BOOLEAN_FIELDS.has(rule.field))return typeof player[rule.field]==='boolean'?compare(player[rule.field],rule.operator,rule.value):null;
 let value=participantNumber(player,rule.field);if(value===null)return null;
 if(rule.measure&&rule.measure!=='value'){
  if(game.completeTeams===false||rule.measure.startsWith('team')&&!teamKnown(player))return null;
  const group=rule.measure.startsWith('team')?(game.participants||[]).filter(p=>p.team===player.team):game.participants||[],values=group.map(p=>participantNumber(p,rule.field));
  if(!values.length||values.some(v=>v===null))return null;
  const baseline=rule.measure.includes('Max')?Math.max(...values):values.reduce((sum,v)=>sum+v,0);
  if(!baseline)return null;value=value/baseline*100;
 }
 return compare(value,rule.operator,rule.value);
}
function evaluate(game,node,context,budget){
 if(--budget.left<0)fail('嵌套玩家范围的计算量超过上限');
 if(node.type==='and'||node.type==='or')return combine(node.children.map(child=>evaluate(game,child,context,budget)),node.type==='and');
 if(node.type==='not'){const value=evaluate(game,node.child,context,budget);return value===null?null:!value;}
 if(node.type!=='scope'&&GAME_FIELDS.has(node.field)){
  const value=node.field==='matched'?(game.gameType?game.gameType==='MATCHED_GAME':null):game[node.field];
  return value===null||value===undefined||typeof value==='string'&&!value?null:compare(value,node.operator,node.value);
 }
 if(node.type!=='scope'&&!node.scope&&context.participant)return participantMatch(game,context.participant,node);
 const players=selectedPlayers(game,node,context),all=node.quantifier==='all'||['everyone','all'].includes(node.scope);
 if(!players.length||all&&game.completeTeams===false&&node.scope!=='self'&&!['named','player'].includes(node.scope))return null;
 const values=players.map(participant=>node.type==='scope'?evaluate(game,node.child,{participant,players},budget):participantMatch(game,participant,node));
 const value=combine(values,all);
 return value===false&&game.completeTeams===false&&node.scope&&node.scope!=='self'&&!['named','player'].includes(node.scope)?null:value;
}
export function matchesRules(game,advanced={}){
 if(!plain(advanced))return false;
 const {rules=[],mode='all',tree=null}=advanced;
 if(!Array.isArray(rules)||rules.length>HISTORY_FILTER_LIMITS.rules||!['all','any'].includes(mode))return false;
 try{
  const budget={left:HISTORY_FILTER_LIMITS.operations};
  const flat=rules.length?combine(rules.map(rule=>evaluate(game,validateHistoryFilterTree(rule),{},budget)),mode==='all'):true;
  return flat===true&&(tree===null||evaluate(game,validateHistoryFilterTree(tree),{},budget)===true);
 }catch{return false;}
}
