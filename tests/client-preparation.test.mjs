import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareClientSelection,validateClientPreparation} from '../services/client-preparation.mjs';
import {getBuild} from '../src/core/builds.mjs';import {createItemSet} from '../src/core/item-sets.mjs';
import {runeWriteContext} from '../src/core/rune-context.mjs';import {lcuRequest} from '../services/lcu.mjs';
import io from 'node:fs/promises';import path from 'node:path';
import {importItemSet} from '../services/item-sets.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));data.builds=JSON.parse(fs.readFileSync(new URL('../data/builds.json',import.meta.url))).entries;
const hero=data.champions.find(c=>c.id==='Ashe'),build=getBuild(hero,'bottom',data);
function fixture({locked=false,gameflow}={}){
 const own={cellId:0,championId:locked?22:0,championPickIntent:0,assignedPosition:'bottom',spell1Id:1,spell2Id:3};
 const action={id:4,type:'pick',actorCellId:0,championId:locked?22:0,completed:locked,isInProgress:!locked};
 const session={gameId:777,localPlayerCellId:0,myTeam:[own],theirTeam:[],actions:[[action]],allowDuplicatePicks:false,bans:{myTeamBans:[],theirTeamBans:[]},timer:{phase:locked?'FINALIZATION':'PLANNING'}};
 const game=gameflow?structuredClone(gameflow):{gameData:{gameId:777,mapId:11,queue:{id:420,gameMode:'CLASSIC'}}},calls=[],pages=[{id:2,current:false,isEditable:false},{id:11,current:true,isEditable:true}];let phase='ChampSelect',items=0;
 const value={champion:'Ashe',role:'bottom',mode:'rift',sessionGameId:'777',context:runeWriteContext({connected:true,phase,game:{gameId:'777'},session}),page:build.runePage,summoners:build.summoners,itemSet:createItemSet(hero,build,data)};
 const request=async(auth,route,method='GET',body)=>{
  calls.push({route,method,body});
  if(route==='/lol-gameflow/v1/gameflow-phase')return phase;
  if(route==='/lol-gameflow/v1/session')return structuredClone(game);
  if(route==='/lol-champ-select/v1/session')return structuredClone(session);
  if(route.endsWith('/pickable-champion-ids'))return [22,1];if(route.endsWith('/disabled-champion-ids'))return [];
  if(route==='/lol-champ-select/v1/session/actions/4'&&method==='PATCH'){assert.deepEqual(body,{championId:22,completed:false});action.championId=22;own.championPickIntent=22;return;}
  if(route==='/lol-perks/v1/pages'&&method==='GET')return structuredClone(pages);
  if(route==='/lol-perks/v1/pages/11'&&method==='PUT'){Object.assign(pages[1],body);return;}
  if(route==='/lol-champ-select/v1/session/my-selection'){if(method==='PATCH'){Object.assign(own,body);return;}return {spell1Id:own.spell1Id,spell2Id:own.spell2Id};}
  throw Error('Unexpected mock route '+method+' '+route);
 };
 const deps={discover:async()=>({port:1234,password:'mock-never-logged'}),request,writeItems:async({itemSet})=>{items++;return {title:itemSet.title};}};
 return {own,action,session,game,calls,pages,value,deps,setPhase:p=>phase=p,get items(){return items;},run:()=>prepareClientSelection({value,data,ownedPageId:11},deps)};
}
test('explicit client preparation previews only own pick and verifies actual rune replacement, summoners and own equipment set',async()=>{
 const f=fixture(),before=structuredClone(f.value),result=await f.run();assert.equal(result.complete,true);assert(Object.values(result.steps).every(s=>s.status==='done'));assert.equal(f.action.completed,false);assert.equal(f.own.championPickIntent,22);assert.equal(result.steps.runes.pageId,11);assert.equal(f.items,1);assert.deepEqual(f.pages[0],{id:2,current:false,isEditable:false});assert.deepEqual(f.value,before);
 assert.deepEqual(f.calls.filter(c=>c.method==='PATCH').map(c=>c.route),['/lol-champ-select/v1/session/actions/4','/lol-champ-select/v1/session/my-selection']);assert(!f.calls.some(c=>c.body?.completed===true));
});
test('explicit lane claim only preselects a representative, leaves runes/spells/items and lock untouched',async()=>{
 const f=fixture();f.value.preselectOnly=true;const before=structuredClone(f.pages),spells=[f.own.spell1Id,f.own.spell2Id];const result=await f.run();
 assert.equal(result.preselectOnly,true);assert.equal(result.steps.hover.status,'done');assert.equal(f.action.completed,false);assert.equal(f.items,0);assert.deepEqual(f.pages,before);assert.deepEqual([f.own.spell1Id,f.own.spell2Id],spells);
 assert.deepEqual(f.calls.filter(c=>c.method!=='GET').map(c=>c.route),['/lol-champ-select/v1/session/actions/4']);
});
test('locked same hero applies configuration without selecting or unlocking, locked other hero rejects before writes',async()=>{
 const f=fixture({locked:true});assert.equal((await f.run()).complete,true);assert(!f.calls.some(c=>c.route.includes('/actions/')));assert.equal(f.action.completed,true);
 const other=fixture({locked:true});other.own.championId=1;other.value.context.championId=1;await assert.rejects(other.run(),/锁定其他英雄/);assert(!other.calls.some(c=>c.method!=='GET'));
});
test('default preparation preserves the latest client Flash key, including a change while runes are applied',async()=>{
 for(const flashSlot of [0,1]){
  const f=fixture();f.value.summoners=['SummonerFlash','SummonerBarrier'];f.own.spell1Id=4;f.own.spell2Id=7;
  const request=f.deps.request;
  f.deps.request=async(auth,route,method,body)=>{const result=await request(auth,route,method,body);if(method==='PUT'){f.own.spell1Id=flashSlot===0?4:7;f.own.spell2Id=flashSlot===1?4:7;}return result;};
  const result=await f.run();assert.equal(result.complete,true);
  const patch=f.calls.find(c=>c.method==='PATCH'&&c.route.endsWith('/my-selection')).body;
  assert.equal([patch.spell1Id,patch.spell2Id][flashSlot],4);assert.equal([patch.spell1Id,patch.spell2Id][1-flashSlot],Number(data.spells.SummonerBarrier.key));
  assert.equal(result.steps.spells.summoners[flashSlot],'SummonerFlash');
 }
 const explicit=fixture();explicit.own.spell1Id=7;explicit.own.spell2Id=4;explicit.value.summoners=['SummonerFlash','SummonerBarrier'];explicit.value.preserveFlashSlot=false;
 assert.equal((await explicit.run()).complete,true);assert.equal(explicit.own.spell1Id,4);assert.equal(explicit.own.spell2Id,Number(data.spells.SummonerBarrier.key));
 const noFlash=fixture();noFlash.own.spell1Id=4;noFlash.own.spell2Id=7;noFlash.value.summoners=['SummonerSmite','SummonerHaste'];
 assert.equal((await noFlash.run()).complete,true);assert.equal(noFlash.own.spell1Id,Number(data.spells.SummonerSmite.key));assert.equal(noFlash.own.spell2Id,Number(data.spells.SummonerHaste.key));
});

test('custom Rift map metadata completes explicit preview, editable runes, spells and equipment without locking',async()=>{
 for(const gameflow of [{gameData:{gameId:0,isCustomGame:true,queue:{id:0,gameMode:''}},map:{id:11,gameMode:'CLASSIC'}},{gameData:{gameId:0,isCustomGame:true,queue:{id:0,mapId:11,gameMode:'CLASSIC'}}}]){
  const f=fixture({gameflow}),result=await f.run();assert(result.complete);assert.equal(f.action.completed,false);assert.equal(f.own.championPickIntent,22);assert.equal(f.items,1);assert.equal(result.steps.runes.pageId,11);assert.equal(f.pages[0].isEditable,false);
  assert.deepEqual(f.calls.filter(c=>c.method==='PATCH').map(c=>c.route),['/lol-champ-select/v1/session/actions/4','/lol-champ-select/v1/session/my-selection']);
 }
});
test('custom status alone never authorizes configuration on unknown maps, URF, ARAM or Swiftplay',async()=>{
 for(const [map,queue] of [[{id:11},{id:0}],[{gameMode:'CLASSIC'},{id:0}],[{id:11,gameMode:'URF'},{id:0}],[{id:12,gameMode:'ARAM'},{id:0}],[{id:11,gameMode:'CLASSIC'},{id:480}]]){
  const f=fixture({gameflow:{gameData:{gameId:777,isCustomGame:true,queue},map}});await assert.rejects(f.run(),/当前模式/);assert(!f.calls.some(c=>c.method!=='GET'));assert.equal(f.items,0);
 }
});

test('contradictory mode metadata stops custom and ranked preparation before every write',async()=>{
 const variants=[
  {gameData:{gameId:777,queue:{id:0,mapId:11,gameMode:'CLASSIC'}},map:{id:11,gameMode:'URF'}},
  {gameData:{gameId:777,gameMode:'CLASSIC',queue:{id:0}},map:{id:11,gameMode:'ARAM'}},
  {gameData:{gameId:777,mapId:11,queue:{id:0,gameMode:'CLASSIC'}},map:{id:12,gameMode:'ARAM'}},
  {gameData:{gameId:777,mapId:11,queue:{id:420,gameMode:'URF'}}}
 ];
 for(const gameflow of variants){const f=fixture({gameflow});await assert.rejects(f.run(),/当前模式/);assert(!f.calls.some(c=>c.method!=='GET'));assert.equal(f.items,0);}
});
test('a new mode conflict after explicit preview stops runes, summoners and equipment',async()=>{
 const f=fixture(),request=f.deps.request;f.deps.request=async(...args)=>{const result=await request(...args);if(args[1]==='/lol-perks/v1/pages'&&(args[2]||'GET')==='GET')f.game.map={id:12,gameMode:'ARAM'};return result;};
 const result=await f.run();assert.equal(result.complete,false);assert.equal(result.steps.hover.status,'done');assert.equal(f.action.completed,false);assert.equal(f.items,0);assert.deepEqual(f.calls.filter(c=>c.method!=='GET').map(c=>c.route),['/lol-champ-select/v1/session/actions/4']);
});

test('current champ-select ID authorizes the click while gameflow is empty, zero or from the previous game',async()=>{
 for(const gameId of [undefined,0,776]){
  const f=fixture();f.game.gameData.gameId=gameId;
  f.value.context=runeWriteContext({connected:true,phase:'ChampSelect',session:f.session,game:{gameId}});
  assert.equal(f.value.context.gameId,'777');
  const result=await f.run();assert.equal(result.complete,true);
  assert.equal(f.action.completed,false);assert.equal(f.items,1);
 }
});

test('a new selection session is rejected even when stale gameflow still matches the clicked game',async()=>{
 const f=fixture();f.session.gameId=778;
 await assert.rejects(f.run(),/选人会话已变化/);
 assert.equal(f.calls.filter(c=>c.method!=='GET').length,0);
 const g=fixture(),read=g.deps.request;
 g.deps.request=async(auth,route,method,body)=>{const result=await read(auth,route,method,body);if(method==='PUT')g.session.gameId=778;return result;};
 const result=await g.run();assert.equal(result.steps.spells.status,'failed');assert.equal(g.items,0);
});
test('a new game during installation lookup or temporary-file I/O cannot commit the previous selection’s equipment set',async()=>{
 for(const edge of ['install-dir','temporary']){
  const f=fixture(),root=await io.mkdtemp(path.resolve('.local/preparation-item-')),install=path.join(root,'LeagueClient'),game=path.join(root,'Game');
  await io.mkdir(install);await io.mkdir(game);await io.writeFile(path.join(install,'LeagueClient.exe'),'mock');await io.writeFile(path.join(game,'League of Legends.exe'),'mock');
  const changeGame=()=>{f.session.gameId=778;f.game.gameData.gameId=778;},request=f.deps.request;
  f.deps.request=async(auth,route,...args)=>{if(route==='/data-store/v1/install-dir'){if(edge==='install-dir')changeGame();return install;}return request(auth,route,...args);};
  let renames=0;const disk={...io,writeFile:async(...args)=>{await io.writeFile(...args);if(edge==='temporary'&&String(args[0]).endsWith('.tmp'))changeGame();},rename:async(...args)=>{renames++;return io.rename(...args);}};
  f.deps.writeItems=(args,deps)=>importItemSet(args,{...deps,io:disk});
  const result=await f.run();assert.equal(result.complete,false,edge);assert.equal(result.steps.items.status,'failed');assert.match(result.steps.items.message,/选人会话已变化/);assert.equal(result.steps.spells.status,'done');assert.equal(renames,0);
  assert.deepEqual(await io.readdir(path.join(game,'Config','Global','Recommended')),[],'Failed selection must leave no visible or temporary item set');
 }
});

test('unavailable heroes, missing availability and non-player turn produce no writes',async()=>{
 for(const mode of ['banned','taken','disabled','missing','turn']){const f=fixture();if(mode==='banned')f.session.bans.myTeamBans=[22];if(mode==='taken')f.session.myTeam.push({cellId:1,championId:22});if(mode==='turn'){f.session.timer.phase='BAN_PICK';f.action.isInProgress=false;}
  const request=f.deps.request;f.deps.request=(auth,route,...args)=>route.endsWith('/disabled-champion-ids')&&mode==='disabled'?[22]:route.endsWith('/pickable-champion-ids')&&mode==='missing'?null:request(auth,route,...args);
  await assert.rejects(f.run());assert(!f.calls.some(c=>c.method!=='GET'));assert.equal(f.items,0);
 }
});
test('new bans while reading eligibility cancel before hover and a new game before a later step stops its writes',async()=>{
 const f=fixture(),request=f.deps.request;f.deps.request=async(auth,route,...args)=>{const result=await request(auth,route,...args);if(route.endsWith('/disabled-champion-ids'))f.session.bans.theirTeamBans=[22];return result;};const r=await f.run();assert.equal(r.steps.hover.status,'failed');assert.equal(r.steps.runes.status,'skipped');assert(!f.calls.some(c=>c.method!=='GET'));
 const g=fixture(),read=g.deps.request;g.deps.request=async(auth,route,method,body)=>{const result=await read(auth,route,method,body);if(method==='PUT'){g.session.gameId=778;g.game.gameData.gameId=778;}return result;};const p=await g.run();assert.equal(p.steps.spells.status,'failed');assert.equal(p.steps.items.status,'skipped');assert(!g.calls.some(c=>c.method==='PATCH'&&c.route.endsWith('my-selection')));
});
test('unrelated teammate selections and bans during eligibility reads still prepare the clicked hero',async()=>{
 for(const change of [f=>f.session.myTeam.push({cellId:1,championId:103,assignedPosition:'MIDDLE'}),f=>f.session.bans.theirTeamBans=[1]]){
  const f=fixture(),request=f.deps.request;let eligibilityReads=0;
  f.deps.request=async(auth,route,...args)=>{const result=await request(auth,route,...args);if(route.endsWith('/disabled-champion-ids')&&++eligibilityReads===1)change(f);return result;};
  const result=await f.run();assert.equal(result.complete,true);assert.equal(eligibilityReads,2);assert.equal(f.own.championPickIntent,22);assert.equal(f.action.completed,false);assert.equal(f.items,1);
  assert.deepEqual(f.calls.filter(c=>c.method==='PATCH').map(c=>c.route),['/lol-champ-select/v1/session/actions/4','/lol-champ-select/v1/session/my-selection']);
 }
});
test('target availability, own action, game, mode and turn changes during eligibility reads stop before every write',async()=>{
 const changes={
  banned:f=>{f.session.bans.theirTeamBans=[22];},
  teammate:f=>{f.session.myTeam.push({cellId:1,championId:22});},
  opponent:f=>{f.session.theirTeam.push({cellId:5,championId:22});},
  disabled:()=>{},unpickable:()=>{},missing:()=>{},
  game:f=>{f.session.gameId=778;},
  action:f=>{f.action.id=5;},
  player:f=>{f.session.localPlayerCellId=1;},
  locked:f=>{f.own.championId=1;f.action.championId=1;f.action.completed=true;},
  mode:f=>{f.game.gameData.queue={id:450,gameMode:'ARAM'};},
  phase:f=>{f.setPhase('ReadyCheck');},
  turn:f=>{f.session.timer.phase='BAN_PICK';f.action.isInProgress=false;},
 };
 for(const [kind,change] of Object.entries(changes)){
  const f=fixture(),request=f.deps.request;let changed=false;
  f.deps.request=async(auth,route,...args)=>{
   const result=await request(auth,route,...args);
   if(changed&&route.endsWith('/pickable-champion-ids')&&kind==='unpickable')return [];
   if(route.endsWith('/disabled-champion-ids')){
    if(changed&&kind==='disabled')return [22];
    if(changed&&kind==='missing')return null;
    if(!changed){changed=true;change(f);}
   }
   return result;
  };
  const result=await f.run();assert.equal(result.complete,false,kind);assert.equal(result.steps.hover.status,'failed',kind);assert.equal(result.steps.runes.status,'skipped',kind);assert.equal(f.items,0,kind);assert(!f.calls.some(c=>c.method!=='GET'),kind);
 }
});
test('unconfirmed hover or spell readback cannot report complete; failed items retain the successfully written rune page id',async()=>{
 const f=fixture(),request=f.deps.request;f.deps.request=(auth,route,method,body)=>method==='PATCH'&&route.includes('/actions/')?null:request(auth,route,method,body);const r=await f.run();assert.equal(r.steps.hover.status,'failed');assert.equal(r.steps.runes.status,'skipped');
 const g=fixture(),read=g.deps.request;g.deps.request=(auth,route,method,body)=>method==='PATCH'&&route.endsWith('my-selection')?null:read(auth,route,method,body);const p=await g.run();assert.equal(p.complete,false);assert.equal(p.steps.spells.status,'failed');assert.equal(p.steps.runes.pageId,11);assert.equal(g.items,0);
 const h=fixture();h.deps.writeItems=async()=>{throw Error('没有目录写入权限');};const s=await h.run();assert.equal(s.steps.items.status,'failed');assert.equal(s.steps.runes.pageId,11);assert.equal(s.steps.spells.status,'done');assert.equal(s.complete,false);
});
test('stale intent cannot authorize configuration after another champion is selected or locked',async()=>{
 for(const change of [
  f=>{f.own.championId=1;f.action.championId=1;f.action.completed=true;},
  f=>{f.own.championId=1;},
  f=>{f.action.championId=1;},
  f=>{f.action.completed=true;},
 ]){
  const f=fixture(),request=f.deps.request;
  f.deps.request=async(auth,route,method,body)=>{const result=await request(auth,route,method,body);if(method==='PATCH'&&route.includes('/actions/'))change(f);return result;};
  const result=await f.run();assert.equal(result.complete,false);assert.equal(result.steps.hover.status,'failed');assert.equal(result.steps.runes.status,'skipped');assert.equal(f.items,0);
  assert(!f.calls.some(c=>c.method==='PUT'||c.method==='POST'||c.route.endsWith('my-selection')));
 }
});
test('rune dispatch rejects action changes even while the public own hero and intent remain unchanged',async()=>{
 const f=fixture(),request=f.deps.request;
 f.deps.request=async(auth,route,method,body)=>{const result=await request(auth,route,method,body);if(route==='/lol-perks/v1/pages'&&method===undefined)f.action.championId=1;return result;};
 const result=await f.run();assert.equal(result.complete,false);assert.equal(result.steps.hover.status,'done');assert.equal(result.steps.runes.status,'failed');assert.equal(f.items,0);assert(!f.calls.some(c=>c.method==='PUT'||c.method==='POST'||c.route.endsWith('my-selection')));
});
test('wrong session, unsupported mode and mismatched item-set identity reject before writes; low-level allowlist cannot lock or ban',async()=>{
 for(const mutate of [f=>f.value.sessionGameId='778',f=>f.game.gameData.queue={id:450,gameMode:'ARAM'},f=>f.value.itemSet.associatedChampions=[1]]){const f=fixture();mutate(f);await assert.rejects(f.run());assert(!f.calls.some(c=>c.method!=='GET'));}
 const f=fixture();assert(validateClientPreparation(f.value,data));
 for(const [route,body] of [['/lol-champ-select/v1/session/actions/4',{championId:22,completed:true}],['/lol-champ-select/v1/session/actions/4',{championId:22,completed:false,type:'ban'}],['/lol-champ-select/v1/session/actions/4/complete',{championId:22}],['/lol-champ-select/v1/session/my-selection',{championPickIntent:22}]])assert.throws(()=>lcuRequest({port:1,password:'mock'},route,'PATCH',body),/不支持/);
});
