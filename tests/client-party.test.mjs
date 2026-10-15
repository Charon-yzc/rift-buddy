import test from 'node:test';import assert from 'node:assert/strict';
import {publicPlayerIdentity,normalizePartyIds,sanitizeLobbyParty,resolveClientParty,clientRenderIdentity} from '../src/core/client-party.mjs';
const self={puuid:'public-own-identity-0001',summonerId:10,gameName:'本人',tagLine:'CN'},friend={puuid:'public-friend-identity-002',summonerId:11,gameName:'队友',tagLine:'CN'};
const session={localPlayerCellId:0,myTeam:[{...self,cellId:0},{...friend,cellId:1},{cellId:2,summonerId:12}]};
test('only current public lobby members survive sanitization; no chat tokens or hidden recovery',()=>{
 const lobby=sanitizeLobbyParty({localMember:self,members:[self,friend],multiUserChatPassword:'PRIVATE',mucJwtDto:{jwt:'PRIVATE'}},100);
 assert(!JSON.stringify(lobby).includes('PRIVATE'));assert.equal(lobby.members.length,2);
 assert.deepEqual(publicPlayerIdentity({...friend,nameVisibilityType:'HIDDEN',obfuscatedPuuid:'decode-me'}),{});
 assert.deepEqual(publicPlayerIdentity({puuid:'00000000-0000-0000-0000-000000000000',summonerId:0}),{});
 assert.equal(publicPlayerIdentity({puuid:'public-own-identity-0001',summonerId:10,summonerName:'本人召唤师'}).summonerName,'本人召唤师');
 assert.equal(publicPlayerIdentity({puuid:'public-own-identity-0001',summonerId:10,summonerName:'本人召唤师'}).riotId,undefined);
 assert.equal(sanitizeLobbyParty({localMember:{puuid:'public-own-identity-0001',summonerId:10,summonerName:'本人召唤师'},members:[{puuid:'public-own-identity-0001',summonerId:10,summonerName:'本人召唤师'}],partyId:'party-aaaaaa'}).local.summonerName,'本人召唤师');
 assert.equal(sanitizeLobbyParty({localMember:self,members:[self],gameConfig:{isCustom:true}}),null);
 assert.equal(sanitizeLobbyParty({localMember:self,members:[friend]}),null);
});
test('party matching requires this local player, expires, never guesses unknown teammates, accepts manual public IDs',()=>{
 const lobby=sanitizeLobbyParty({localMember:self,members:[self,friend]},100);
 assert.deepEqual(resolveClientParty(session,lobby,[],101).members.map(m=>m.cellId),[0,1]);
 assert.equal(resolveClientParty(session,lobby,[],3600101).status,'unknown');
 const other={...session,myTeam:[{cellId:0,summonerId:99},session.myTeam[1]]};
 assert.deepEqual(resolveClientParty(other,lobby,[],101).members.map(m=>m.cellId),[0]);
 assert.deepEqual(resolveClientParty(session,null,['队友#CN'],101).members.map(m=>m.cellId),[0,1]);
 assert.deepEqual(resolveClientParty(session,null,['12'],101).members.map(m=>m.cellId),[0,2]);
 const hidden={...session,myTeam:[session.myTeam[0],{...friend,cellId:1,nameVisibilityType:'HIDDEN'}]};
 assert.deepEqual(resolveClientParty(hidden,lobby,['队友#CN','11'],101).members.map(m=>m.cellId),[0]);
 assert.deepEqual(normalizePartyIds('队友#CN\n12\n无标签名字\n12'),['队友#CN','12']);
});
test('unchanged polling does not rebuild sidebar, while public selection or stale transition does',()=>{
 const a={connected:true,receivedAt:new Date(100000).toISOString(),session:{...session,timer:{phase:'PLANNING',remainingMs:10000}},eligibility:{receivedAt:new Date(100000).toISOString(),pickable:[1,2]}};
 const b={...a,receivedAt:new Date(101000).toISOString(),session:{...a.session,timer:{...a.session.timer,remainingMs:9000}},eligibility:{...a.eligibility,receivedAt:new Date(101000).toISOString()}};
 assert.equal(clientRenderIdentity(a,101000),clientRenderIdentity(b,101000));
 assert.notEqual(clientRenderIdentity(a,116000),clientRenderIdentity(b,116000));
 assert.notEqual(clientRenderIdentity(a,101000),clientRenderIdentity({...a,session:{...a.session,myTeam:[{...self,cellId:0,championId:22}]}},101000));
});
