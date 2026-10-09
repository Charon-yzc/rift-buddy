const grievous=new Set(['3123','3916','3076','3033','3165','3075','6609']);
const recovery=new Set(['3065','3083','2502','3107','6617']);
const positions=['top','jungle','mid','bottom','support'];
const score=value=>Number.isInteger(value)&&value>=0&&value<=10000?value:null;
// Public inventories only. Equipment price is neither total earned gold nor
// a power rating: sold items, unspent gold and free upgrades are not recovered.
export function publicEquipment(data,live){
 if(!live?.teamKnown||!Array.isArray(live.roster))return {available:false,reason:'双方公开装备尚未读取'};
 const seen=new Set(),rows=[];
 for(const p of live.roster){
  const champion=data.champions.find(c=>c.id===p.champion),key=p.side+':'+p.champion;
  if(!champion||!['ally','enemy'].includes(p.side)||seen.has(key))continue;
  seen.add(key);
  const inventory=(p.inventory||[]).filter(i=>Number.isInteger(i.count)&&i.count>0);
  const items=inventory.map(i=>{const item=data.items[String(i.id)];return {id:String(i.id),name:item?.name||'未知装备',count:i.count,cost:Number.isFinite(item?.gold?.total)?item.gold.total:null,
   recovery:!!item&&(recovery.has(String(i.id))||item.tags?.some(t=>['LifeSteal','SpellVamp'].includes(t))),grievous:grievous.has(String(i.id))};});
  const known=p.itemsKnown===true&&items.every(i=>i.cost!==null);
  const scores=Object.fromEntries(['kills','deaths','assists','creepScore'].map(key=>[key,score(p.scores?.[key])]));
  const csPerMinute=scores.creepScore!==null&&Number.isFinite(live.gameTime)&&live.gameTime>0?Math.round(scores.creepScore*600/live.gameTime)/10:null;
  rows.push({id:champion.id,name:champion.name,side:p.side,self:p.self===true,level:Number.isInteger(p.level)&&p.level>=1&&p.level<=30?p.level:null,
   position:positions.includes(p.position)?p.position:null,scores,csPerMinute,items,known,value:known?items.reduce((n,i)=>n+i.cost*i.count,0):null,
   recovery:items.filter(i=>i.recovery),grievous:items.filter(i=>i.grievous)});
 }
 const team=side=>{const players=rows.filter(p=>p.side===side),complete=players.length===5&&players.every(p=>p.known);return {players,complete,value:complete?players.reduce((n,p)=>n+p.value,0):null};};
 const ally=team('ally'),enemy=team('enemy');
 return {available:rows.length>0,reason:rows.length?'':'双方公开装备尚未读取',ally,enemy,gameTime:Number.isFinite(live.gameTime)&&live.gameTime>=0?live.gameTime:null,
  difference:ally.complete&&enemy.complete?ally.value-enemy.value:null,
  recoveryEnemies:enemy.players.filter(p=>p.recovery.length),grievousAllies:ally.players.filter(p=>p.grievous.length),
  coverageKnown:ally.complete&&enemy.complete,
  caution:'装备价值按资料价格估算，含升级装备的标价；不含未花金币、已出售装备与真实累计经济。回血与重伤仅统计公开装备，英雄技能、符文和效果触发条件需自行确认。'};
}
