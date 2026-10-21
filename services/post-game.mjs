import {discoverClient,lcuRequest} from './lcu.mjs';
import {calculatePerformanceScores} from './post-game-scoring.mjs';
import {queueName} from '../src/core/match-history/model.mjs';
const stat=(s,...keys)=>{for(const key of keys){const v=s[key];if((typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))&&Number(v)>=0)return Number(v);}return null;};
const id=value=>/^[1-9]\d{0,19}$/.test(String(value??''))?String(value):'';
const samePlayer=(p,own)=>!!(own.puuid&&p.puuid===own.puuid||id(own.summonerId)&&id(p.summonerId)===id(own.summonerId));

// Raw results never leave the authenticated local connection. No match is saved.
// Only complete, standard two-team Rift games are eligible for this local model.
export function parsePostGameReport(raw,{own,game={},champions=[]}={}){
 if(!raw||!id(raw.gameId)||game.gameId!==undefined&&id(game.gameId)!==id(raw.gameId))return null;
 const mode=raw.gameMode??game.gameMode,queue=raw.queueId??game.queueId,map=raw.mapId??game.mapId;
 if(mode!=='CLASSIC'||![400,420,430,440,480,490,700].includes(Number(queue))||map!==undefined&&Number(map)!==11||raw.queueId!==undefined&&game.queueId!==undefined&&Number(raw.queueId)!==Number(game.queueId))return null;
 const duration=stat(raw,'gameLength','gameDuration');
 if(duration===null||duration<300||duration>21600||!Array.isArray(raw.teams)||raw.teams.length!==2)return null;
 const teams=raw.teams;
 if(!teams.every(t=>[100,200].includes(t.teamId)&&typeof t.isWinningTeam==='boolean'&&Array.isArray(t.players)&&t.players.length===5)||new Set(teams.map(t=>t.teamId)).size!==2||teams.filter(t=>t.isWinningTeam).length!==1)return null;
 if(!own||!own.puuid&&!id(own.summonerId))return null;
 const champs=new Map(champions.map(c=>[Number(c.key),c])),players=[];
 for(const team of teams)for(const p of team.players){
  if(!p||!Number.isInteger(p.championId)||p.championId<=0||!p.stats||typeof p.stats!=='object'||Array.isArray(p.stats))return null;
  const s=p.stats,champ=champs.get(p.championId);
  const row={puuid:typeof p.puuid==='string'?p.puuid:'',summonerId:id(p.summonerId),summonerName:String(p.riotIdGameName||p.gameName||p.summonerName||'玩家').slice(0,96),championId:p.championId,championKey:champ?.id||'',championName:champ?.name||'英雄',teamId:team.teamId,isSelf:samePlayer(p,own),level:stat(p,'level')??stat(s,'LEVEL','CHAMP_LEVEL'),position:String(s.POSITION||p.selectedPosition||p.detectedTeamPosition||'').toUpperCase(),
   kills:stat(s,'CHAMPIONS_KILLED','kills'),deaths:stat(s,'NUM_DEATHS','deaths'),assists:stat(s,'ASSISTS','assists'),
   damageDealt:stat(s,'TOTAL_DAMAGE_DEALT_TO_CHAMPIONS','totalDamageDealtToChampions'),damageTaken:stat(s,'TOTAL_DAMAGE_TAKEN','totalDamageTaken'),goldEarned:stat(s,'GOLD_EARNED','goldEarned'),
   cs:stat(s,'MINIONS_KILLED','minionsKilled','totalMinionsKilled'),visionScore:stat(s,'VISION_SCORE','visionScore'),
   turretDamage:stat(s,'DAMAGE_DEALT_TO_TURRETS','damageDealtToTurrets'),heal:stat(s,'TOTAL_HEAL','totalHeal'),ccTime:stat(s,'TIME_CCING_OTHERS','timeCCingOthers'),isAfk:p.leaver===true||p.isLeaver===true||p.wasAfk===true||stat(s,'WAS_AFK')===1,
   items:Array.from({length:7},(_,i)=>Array.isArray(p.items)&&Number.isSafeInteger(p.items[i])&&p.items[i]>=0?p.items[i]:stat(s,'ITEM'+i,'item'+i))};
  if(['kills','deaths','assists','damageDealt','damageTaken','goldEarned','cs','visionScore'].some(k=>row[k]===null))return null;
  const neutral=stat(s,'NEUTRAL_MINIONS_KILLED','neutralMinionsKilled');if(neutral!==null)row.cs+=neutral;
  players.push(row);
 }
 if(players.filter(p=>p.isSelf).length!==1)return null;
 const winningTeamId=teams.find(t=>t.isWinningTeam).teamId;
 const scored=calculatePerformanceScores({players,winningTeamId,gameDuration:duration});
 return {gameId:raw.gameId,gameMode:mode,queueId:Number(queue),queueName:queueName(Number(queue)),gameDuration:duration,isWin:scored.find(p=>p.isSelf).teamId===winningTeamId,
  teams:teams.map(t=>{const rows=scored.filter(p=>p.teamId===t.teamId);return {teamId:t.teamId,isWin:t.isWinningTeam,totalKills:rows.reduce((n,p)=>n+p.kills,0),totalDamage:rows.reduce((n,p)=>n+p.damageDealt,0),totalGold:rows.reduce((n,p)=>n+p.goldEarned,0),objectives:{dragon:stat(t.stats||{},'DRAGON_KILLS','dragonKills'),baron:stat(t.stats||{},'BARON_KILLS','baronKills'),tower:stat(t.stats||{},'TURRETS_KILLED','towerKills')},players:rows};})};
}
export async function fetchPostGameReport({installPath='',own,game={},ownPuuid='',champions=[]}={}, {discover=discoverClient,request=lcuRequest}={}){
 try{
  const auth=await discover(installPath);if(!auth?.port)return null;
  const current=await request(auth,'/lol-summoner/v1/current-summoner');
  const expected=own||(ownPuuid?{puuid:ownPuuid}:null);
  if(!current||expected&&!samePlayer(current,expected))return null;
  const raw=await request(auth,'/lol-end-of-game/v1/eog-stats-block');
  const after=await request(auth,'/lol-summoner/v1/current-summoner');
  if(!after||!samePlayer(after,current))return null;
  return parsePostGameReport(raw,{own:current,game,champions});
 }catch{return null;}
}
