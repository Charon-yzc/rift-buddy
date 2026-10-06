import https from 'node:https';
import {identifyMode} from '../src/core/game-mode.mjs';
const routes=new Set(['/liveclientdata/activeplayer','/liveclientdata/playerlist','/liveclientdata/gamestats']);
export function liveRequest(route){
 if(!routes.has(route))throw Error('不支持此局内读取');
 return new Promise((resolve,reject)=>{
  const request=https.get({hostname:'127.0.0.1',port:2999,path:route,rejectUnauthorized:false,timeout:1800,headers:{Accept:'application/json'}},response=>{
   let raw='',size=0;response.on('error',()=>reject(Error('局内读取已中断')));response.on('data',chunk=>{size+=chunk.length;if(size>1_000_000)request.destroy(new Error('局内数据过大'));else raw+=chunk;});
   response.on('end',()=>{if(response.statusCode!==200)return reject(Error('局内接口暂不可用'));try{resolve(JSON.parse(raw));}catch{reject(Error('局内数据格式异常'));}});
  });request.on('timeout',()=>request.destroy(Error('局内读取超时')));request.on('error',()=>reject(Error('局内接口暂不可用')));
 });
}
export function enemiesFromPlayers(own,players,champions){if(!Array.isArray(players)||!own)return[];const ownTeam=own.team||own.teamId||own.teamType;return players.filter(p=>p&&p!==own&&(ownTeam&&(p.team||p.teamId||p.teamType)?(p.team||p.teamId||p.teamType)!==ownTeam:false)&&String(p.rawChampionName||'').length>0).map(p=>{const enemyRaw=String(p.rawChampionName||'').replace(/^game_character_displayname_/,'');const enemy=champions.find(c=>c.id.toLowerCase()===enemyRaw.toLowerCase());return enemy?{id:enemy.id,name:enemy.name,level:Number.isInteger(p.level)&&p.level>=1&&p.level<=30?p.level:null,items:filterEnemyItems(p.items)}:null;}).filter(Boolean).slice(0,5);}
// Same-team public scoreboard feed, same shape and privacy posture as
// enemies: champion, level and visible items only, no identities. When our
// own team tag is unknown we cannot tell allies apart, so report none
// rather than guessing.
export function alliesFromPlayers(own,players,champions){if(!Array.isArray(players)||!own)return[];const ownTeam=own.team||own.teamId||own.teamType;if(!ownTeam)return[];return players.filter(p=>p&&p!==own&&(p.team||p.teamId||p.teamType)===ownTeam&&String(p.rawChampionName||'').length>0).map(p=>{const allyRaw=String(p.rawChampionName||'').replace(/^game_character_displayname_/,'');const ally=champions.find(c=>c.id.toLowerCase()===allyRaw.toLowerCase());return ally?{id:ally.id,name:ally.name,level:Number.isInteger(p.level)&&p.level>=1&&p.level<=30?p.level:null,items:filterEnemyItems(p.items)}:null;}).filter(Boolean).slice(0,5);}
// Enemy holdings come from the public scoreboard feed, so a missing count
// means "shown without a stack number", not a phantom read: treat it as one.
// (Own inventory keeps the strict positive-count rule for purchase marking.)
function filterEnemyItems(items){
 if(!Array.isArray(items))return [];
 return items.filter(i=>Number.isInteger(i.itemID)&&i.itemID>0&&!(Number.isInteger(i.count)&&i.count<=0))
  .map(i=>({id:String(i.itemID),count:Number.isInteger(i.count)&&i.count>0?Math.min(i.count,6):1})).slice(0,12);
}
// The live client publishes the active player's real panel (runes, buffs and
// all). Allowlist numerics only; anything else stays out.
export function panelStats(raw){
 if(!raw||typeof raw!=='object')return null;
 const num=v=>Number.isFinite(v)?v:null;
 const ad=num(raw.attackDamage),ap=num(raw.abilityPower);
 if(ad===null&&ap===null)return null;
 const ratio=v=>v===null?null:(v>1&&v<=100?v/100:v);
 return {ad,ap,armor:num(raw.armor),mr:num(raw.magicResist),
  atkSpeed:num(raw.attackSpeed),crit:ratio(num(raw.critChance)),ms:num(raw.moveSpeed),
  hp:num(raw.currentHealth),maxHp:num(raw.maxHealth),regen:num(raw.healthRegenRate)};
}
export function sanitizeLive(active,players,stats,champions,game={}){
 // Identity is used only to select the active player, then discarded with every other player.
 const identity=active?.riotId||active?.summonerName;
 if(typeof identity!=='string'||!identity||!Array.isArray(players))return {available:false,reason:'暂未确认当前英雄'};
 const matches=players.filter(p=>(p.riotId||p.summonerName)===identity);
 if(matches.length!==1)return {available:false,reason:'暂未确认当前英雄'};
 const own=matches[0],raw=String(own.rawChampionName||'').replace(/^game_character_displayname_/,'');
 const champion=champions.find(c=>c.id.toLowerCase()===raw.toLowerCase());
 if(!champion||!Array.isArray(own.items))return {available:false,reason:'当前英雄或装备暂不可读'};
// Only positively-evidenced holdings enter the bag: entries without a valid
// positive count are dropped instead of assumed owned, so a partial or
// placeholder read at game start can never mark route items as purchased.
const inventory=own.items.filter(i=>Number.isInteger(i.itemID)&&i.itemID>0&&Number.isInteger(i.count)&&i.count>0).map(i=>({id:String(i.itemID),count:Math.min(i.count,6)})).slice(0,12);
const liveMap=Number(stats?.mapNumber),lobbyMap=Number(game?.mapId);
const mapId=Number.isInteger(liveMap)&&liveMap>0?liveMap:Number.isInteger(lobbyMap)&&lobbyMap>0?lobbyMap:null;
const gameMode=String(game?.gameMode||'').trim()||String(stats?.gameMode||'');
const mode=identifyMode({...stats,...game,...(mapId===null?{}:{mapId}),gameMode}).id;
return {available:true,champion:champion.id,inventory,gold:Number.isFinite(active.currentGold)?Math.max(0,Math.floor(active.currentGold)):null,
  level:Number.isInteger(active.level)&&active.level>=1&&active.level<=30?active.level:null,
  skills:Object.fromEntries(['Q','W','E','R'].map(key=>{const level=active.abilities?.[key]?.abilityLevel;return [key,Number.isInteger(level)&&level>=0&&level<=10?level:null];})),
  gameTime:Number.isFinite(stats?.gameTime)?stats.gameTime:null,mapId,mode,at:Date.now(),stats:panelStats(active.championStats),
  enemies:enemiesFromPlayers(own,players,champions),allies:alliesFromPlayers(own,players,champions)};
}
export async function liveSnapshot(champions,game={},request=liveRequest){
 try{const [active,players,stats]=await Promise.all(['/liveclientdata/activeplayer','/liveclientdata/playerlist','/liveclientdata/gamestats'].map(request));return sanitizeLive(active,players,stats,champions,game);}
 catch{return {available:false,reason:'尚未进入游戏，或国服局内接口不可用'};}
}
