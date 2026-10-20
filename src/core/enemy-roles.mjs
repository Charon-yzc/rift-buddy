import {ROLES} from './rules.mjs';
import {publicClientGameId} from './draft.mjs';
import {publicRankedDraft} from './ranked-draft.mjs';
import {estimateEnemyRoles} from './ranked-statistics.mjs';
const roles=ROLES.map(role=>role.id),game=value=>typeof value==='string'&&/^\d{1,20}$/.test(value)&&Number(value)>0;
// Bounded local role constraints only. These never alter the client snapshot,
// room membership, champion ownership or a selectable-player binding.
export function validateEnemyRoles(value){
 if(!Array.isArray(value))return [];
 const rows=value.slice(0,5).filter(row=>row&&game(row.gameId)&&Number.isInteger(row.cellId)&&row.cellId>=0&&row.cellId<30&&typeof row.champion==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(row.champion)&&roles.includes(row.role));
 return rows.filter(row=>rows.filter(other=>other.cellId===row.cellId).length===1&&rows.filter(other=>other.role===row.role).length===1).map(({gameId,cellId,champion,role})=>({gameId,cellId,champion,role})).sort((a,b)=>a.cellId-b.cellId);
}
export function currentEnemyRoles(client,champions,bindings){
 const draft=publicRankedDraft(client,champions),id=publicClientGameId(client);
 if(!draft.ranked||!client.connected||client.phase!=='ChampSelect'||!id)return [];
 return validateEnemyRoles(bindings).filter(row=>row.gameId===id&&draft.enemies.some(player=>player.cellId===row.cellId&&player.champion===row.champion));
}
export function resolvedRankedDraft(client,data,bindings=[]){
 const draft=publicRankedDraft(client,data.champions);if(!draft.ranked||!client.connected||client.phase!=='ChampSelect')return draft;
 const active=currentEnemyRoles(client,data.champions,bindings),players=draft.enemies.map(player=>{const row=active.find(row=>row.cellId===player.cellId);return row?{...player,role:row.role,manualRole:true}:player;});
 const enemies=estimateEnemyRoles(players,data.builds,{patch:data.patch,source:data.buildSource});
 // Placeholder positions stay local to inference and never become public picks.
 return {...draft,enemies:enemies.filter(player=>Number.isInteger(player.cellId))};
}
export const enemyRolesSignature=draft=>(draft.enemies||[]).map(player=>[player.cellId,player.champion,player.role,player.estimatedRole,player.roleWeights,player.roleSource,player.pickState]).sort((a,b)=>a[0]-b[0]);
export function enemyRoleContext(client,data,bindings=[]){
 const draft=publicRankedDraft(client,data.champions);
 return JSON.stringify([publicClientGameId(client),draft.ranked,data.patch,data.buildSource,enemyRolesSignature(resolvedRankedDraft(client,data,bindings)),currentEnemyRoles(client,data.champions,bindings)]);
}
export function changeEnemyRole(client,data,bindings,change){
 const draft=resolvedRankedDraft(client,data,bindings),id=publicClientGameId(client),player=draft.enemies.find(player=>player.cellId===change?.cellId&&player.champion===change?.champion&&player.champion);
 if(!draft.ranked||!client.connected||client.phase!=='ChampSelect'||!id||change?.gameId!==id||change.context!==enemyRoleContext(client,data,bindings)||!['reset','auto',...roles].includes(change.role)||change.role!=='reset'&&!player)throw Error('敌方选人已变化，请按当前页面重新调整分路');
 if(change.role==='reset')return [];
 let next=currentEnemyRoles(client,data.champions,bindings).filter(row=>row.cellId!==player.cellId);
 if(change.role==='auto')return next;
 const from=player.estimatedRole,other=draft.enemies.find(row=>row.cellId!==player.cellId&&row.champion&&row.estimatedRole===change.role);
 next=next.filter(row=>row.role!==change.role&&row.cellId!==other?.cellId);
 next.push({gameId:id,cellId:player.cellId,champion:player.champion,role:change.role});
 if(other&&from&&from!==change.role)next.push({gameId:id,cellId:other.cellId,champion:other.champion,role:from});
 return validateEnemyRoles(next);
}
