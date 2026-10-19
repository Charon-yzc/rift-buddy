import {validateGuideSelection} from './guide.mjs';
import {ROLES,profile} from './rules.mjs';
import {roleClaimChoice,activeRoleClaim} from './role-claim.mjs';
import {CLIENT_POSITION_ROLES} from './draft.mjs';
import {rankedDraftPolicy} from './ranked-draft.mjs';

export const pregamePhase=phase=>['None','Lobby','Matchmaking','ReadyCheck'].includes(phase);
export function validatePregameIntent(value){
 if(!value||!['',...ROLES.map(role=>role.id)].includes(value.role)||value.champion!==null&&!(typeof value.champion==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(value.champion)))throw Error('请选择分路或英雄');
 const attemptedGameId=typeof value.attemptedGameId==='string'&&/^[1-9]\d{0,19}$/.test(value.attemptedGameId)?value.attemptedGameId:'';
 const hoveredCellId=attemptedGameId&&Number.isInteger(value.hoveredCellId)&&value.hoveredCellId>=0&&value.hoveredCellId<30?value.hoveredCellId:null;
 const kind=['position','hero'].includes(value.kind)?value.kind:null;
 if(kind==='hero'&&!value.champion)throw Error('请先选择预选英雄');
 const selection=kind==='hero'&&value.selection?validateGuideSelection(value.selection):null;
 if(selection&&(selection.id!==value.champion||selection.mode!=='rift'||value.role&&selection.role!==value.role))throw Error('预选配置与英雄不一致');
 return {role:value.role,champion:value.champion,...(kind?{kind}:{}),...(selection?{selection}:{}),...(attemptedGameId?{attemptedGameId}:{}),...(hoveredCellId!==null?{hoveredCellId}:{})};
}
// Restore only a confirmed placeholder for this exact public game/player/hero.
// This is display state, not permission to repeat a write after restarting.
export function restoredRoleClaim(intent,client,champions){
 const champion=champions.find(value=>value.id===intent?.champion);
 if(intent?.kind==='hero'||!champion||client?.mode?.id!=='rift'||!Number.isInteger(intent.hoveredCellId)||!intent.attemptedGameId)return null;
 const claim={gameId:intent.attemptedGameId,cellId:intent.hoveredCellId,championId:champion.key,role:intent.role,pending:false};
 return activeRoleClaim(claim,client)?claim:null;
}
// Legacy and position-only intents only hover. An explicit hero choice may
// prepare its complete configuration once in the same public party/game.
export function pregameIntentChoice(intent,client,data){
 const own=client.session?.myTeam?.find(player=>player.cellId===client.session.localPlayerCellId);
 const unavailable=reason=>({champion:null,role:intent?.role||'',reason});
 if(rankedDraftPolicy(client).ranked)return unavailable('排位按客户端选人，不使用大厅预选');
 if(!rankedDraftPolicy(client).consumePreselection)return {...unavailable('等待确认本局队列'),waiting:true};
 if(!client.connected||client.phase!=='ChampSelect'||client.mode?.id!=='rift'||!own)return unavailable('等待进入峡谷选人');
 if(intent?.kind!=='hero'&&(own.championId||own.championPickIntent))return unavailable('客户端已有选择，保留当前英雄');
 if(!intent?.champion)return {...roleClaimChoice(client,intent?.role,data.champions,data),role:intent?.role||''};
 const champion=data.champions.find(value=>value.id===intent.champion);
 if(!champion)return unavailable('预选英雄暂不可用，请重新选择');
 const pickable=client.eligibility?.pickable,blocked=[...(client.eligibility?.disabled||[]),...(client.session.bans||[]),...client.session.myTeam.filter(player=>player.cellId!==own.cellId).flatMap(player=>[player.championId,player.championPickIntent]),...(client.session.allowDuplicatePicks===false?client.session.theirTeam||[]:[]).map(player=>player.championId)];
 if(!Array.isArray(pickable)||!pickable.some(value=>value===champion.id||Number(value)===champion.key)||blocked.some(value=>value===champion.id||Number(value)===champion.key))return unavailable('预选英雄本局不可选，请直接选择其他英雄');
 const role=intent.selection?.role||intent.role||CLIENT_POSITION_ROLES[String(own.assignedPosition||'').toUpperCase()]||profile(champion).roles[0];
 return {champion:champion.id,role,reason:''};
}

// A shared intent is a hint only. Match unique, already-public party names;
// never use assistant room size or a nickname to invent group membership.
export function partyWithPregameIntents(party,room,localIntent){
 if(!party||!['known','lobby'].includes(party.status))return party;
 const position={top:'TOP',jungle:'JUNGLE',mid:'MIDDLE',bottom:'BOTTOM',support:'UTILITY'};
 const name=value=>String(value||'').normalize('NFKC').trim().split('#')[0];
 return {...party,members:(party.members||[]).map(member=>{
  const publicName=name(member.displayName),matches=(room?.members||[]).filter(peer=>peer.online&&!peer.self&&name(peer.nick)===publicName);
  const unambiguous=publicName&&(party.members||[]).filter(peer=>name(peer.displayName)===publicName).length===1&&matches.length===1;
  const intent=member.local?localIntent:unambiguous?matches[0].share?.intent:null;
  return intent?.role&&position[intent.role]?{...member,firstPosition:position[intent.role],intentRole:intent.role}:member;
 })};
}
