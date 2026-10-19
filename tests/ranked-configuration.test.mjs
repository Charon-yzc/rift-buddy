import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {getBuild} from '../src/core/builds.mjs';
import {rankedConfigurationAdvice,adoptRankedConfigurationAdvice} from '../src/core/ranked-configuration.mjs';
import {rankedConfigurationAdviceView} from '../src/ranked-configuration-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;
const key=id=>data.champions.find(champion=>champion.id===id).key,selection={id:'Nami',role:'support',mode:'rift',laterIds:[3107],summonerIds:['SummonerFlash','SummonerHeal'],bootsId:'boots-3158',conditions:['ap']};
const fixture=()=>({connected:true,phase:'ChampSelect',game:{queueId:420,mapId:11,gameMode:'CLASSIC',gameId:'800'},session:{gameId:'800',localPlayerCellId:0,myTeam:[{cellId:0,championId:key('Nami'),assignedPosition:'UTILITY'}],theirTeam:['Vladimir','Zed','Tristana','Morgana','Soraka'].map((id,i)=>({cellId:i+5,championId:key(id)})),actions:[]}});
test('public draft updates produce read-only configuration suggestions without changing personal fields or choosing a hidden lane',()=>{
 const client=fixture(),before=structuredClone({client,data,selection});
 for(let i=0;i<10;i++){client.session.theirTeam[0].championId=key(i%2?'Vladimir':'Swain');const advice=rankedConfigurationAdvice(client,data,selection);assert(advice);assert(advice.suggestions.some(row=>row.kind==='core'));assert(advice.suggestions.every(row=>!row.fields.sourceOpponent&&!row.fields.threatId));}
 client.session.theirTeam[0].championId=before.client.session.theirTeam[0].championId;assert.deepEqual({client,data,selection},before);
});
test('adopting an exact current suggestion changes only its fields, retains manual later items, spells and shoes, and rejects stale snapshots',()=>{
 const client=fixture(),advice=rankedConfigurationAdvice(client,data,selection),suggestion=advice.suggestions.find(row=>row.kind==='core');assert(suggestion);
 const args={client,data,selection,token:advice.token,kind:suggestion.kind,id:suggestion.id},adopted=adoptRankedConfigurationAdvice(args);
 assert.equal(adopted.coreId,suggestion.id);for(const field of ['laterIds','summonerIds','bootsId','conditions'])assert.deepEqual(adopted[field],selection[field]);assert.equal(adopted.sourceOpponent,undefined);
 for(const change of [()=>{client.session.gameId='801';},()=>{client.session.theirTeam[0].championId=key('Garen');}]){const current=fixture();args.client=current;change();args.client=client;assert.throws(()=>adoptRankedConfigurationAdvice(args),/已变化/);client.session=fixture().session;}
 assert.throws(()=>adoptRankedConfigurationAdvice({...args,client:fixture(),selection:{...selection,conditions:['heal']}}),/已变化/);
});
test('ranked advice remains compact, is absent in matching/read-only views and never labels mechanism choices as opponent statistics',()=>{
 const client=fixture(),advice=rankedConfigurationAdvice(client,data,selection),html=rankedConfigurationAdviceView(advice,data,selection);assert.match(html,/选人应对/);assert.match(html,/不是对位胜率/);assert.match(html,/点击应用才写入/);
 assert.equal(rankedConfigurationAdvice({...client,game:{...client.game,queueId:430}},data,selection),null);
 assert.equal(rankedConfigurationAdviceView(advice,data,{...selection,readOnly:true}),'');
 const build=getBuild(data.champions.find(champion=>champion.id==='Nami'),'support',data,selection);assert.equal(rankedConfigurationAdvice(client,data,{...selection,readOnly:true},build).suggestions.length,0);
});
