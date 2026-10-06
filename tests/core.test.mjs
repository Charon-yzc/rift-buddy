import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend,validateSlots,mergeClientSession,clearClientPicks} from '../src/core/recommend.mjs';
import {getBuild,buildAsText,validReference,validateRunePage} from '../src/core/builds.mjs';
import {profile,matchesSearch} from '../src/core/rules.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id);
test('three-person recommendations preserve the two other players and fill every requested role',()=>{
 const slots=createSlots();slots[0]={...slots[0],champion:'Garen',locked:true};slots[1]={...slots[1],champion:'LeeSin',locked:true};
 const results=recommend({slots,champions:data.champions,limit:3});assert.equal(results.length,3);
 for(const result of results){assert.deepEqual(result.slots.slice(0,2),slots.slice(0,2));assert.equal(result.slots.filter(s=>s.champion).length,5);validateSlots(result.slots,data.champions);}
 assert.equal(slots[2].champion,null,'does not mutate the original draft');
});
test('one remaining party player gets advice across all five roles',()=>{
 for(const role of ['top','jungle','mid','bottom','support']){
  const slots=createSlots().map(s=>({...s,party:s.role===role}));
  const results=recommend({slots,champions:data.champions,excluded:['Yasuo','Alistar'],enemy:['Ashe'],limit:3});
  assert.equal(results.length,3);for(const r of results){const pick=r.slots.find(s=>s.role===role).champion;assert.ok(pick);assert.ok(!['Yasuo','Alistar','Ashe'].includes(pick));assert.equal(r.slots.filter(s=>s.champion).length,1);}
 }
});
test('locked unusual positions survive recommendations and client sync',()=>{
 const slots=createSlots();slots[2]={...slots[2],champion:'Yasuo',locked:true};
 const merged=mergeClientSession(slots,{myTeam:[{championId:hero('Yasuo').key,assignedPosition:'BOTTOM',cellId:1},{championId:hero('Lux').key,assignedPosition:'',cellId:2}],localPlayerCellId:2},data.champions);
 assert.equal(merged.slots[2].champion,'Yasuo');assert.equal(merged.slots[3].champion,null);assert.deepEqual(merged.unassigned,[{champion:'Lux',cellId:2,local:true}]);
 for(const result of recommend({slots,champions:data.champions,limit:3}))assert.equal(result.slots[2].champion,'Yasuo');
});
test('small candidate pool remains fully reachable by reroll',()=>{
 const slots=createSlots().map(s=>({...s,party:s.role==='mid'}));
 const keep=['Ahri','Annie','Lux','Veigar'];const excluded=data.champions.filter(c=>!keep.includes(c.id)).map(c=>c.id);
 const first=recommend({slots,champions:data.champions,excluded,limit:3});
 const next=recommend({slots,champions:data.champions,excluded,limit:3,offset:3});
 assert.equal(first.length,3);assert.equal(next.length,1);assert.ok(!first.some(r=>r.id===next[0].id));
});
test('automatic imports track changed picks and role swaps without displacing manual choices',()=>{
 const session={myTeam:[{cellId:1,championId:hero('Ashe').key,assignedPosition:'BOTTOM'},{cellId:2,championId:hero('Lux').key,assignedPosition:'UTILITY'}]};
 let draft=mergeClientSession(createSlots(),session,data.champions).slots;
 assert.equal(draft[3].clientCellId,1);
 session.myTeam[0].championId=hero('Jhin').key;draft=mergeClientSession(draft,session,data.champions).slots;
 assert.equal(draft[3].champion,'Jhin');assert.ok(!draft.some(s=>s.champion==='Ashe'));
 session.myTeam[0].assignedPosition='UTILITY';session.myTeam[1].assignedPosition='BOTTOM';draft=mergeClientSession(draft,session,data.champions).slots;
 assert.equal(draft[3].champion,'Lux');assert.equal(draft[4].champion,'Jhin');
 delete draft[3].clientCellId;session.myTeam[1].championId=hero('Lulu').key;
 const result=mergeClientSession(draft,session,data.champions);assert.equal(result.slots[3].champion,'Lux');assert.equal(result.unassigned[0].champion,'Lulu');
 const cleared=clearClientPicks(result.slots);assert.equal(cleared[3].champion,'Lux');assert.equal(cleared[4].champion,null);assert.equal(cleared[4].locked,false);
});
test('duplicate heroes and an impossible pool are rejected clearly',()=>{
 const slots=createSlots();slots[0].champion='Lux';slots[1].champion='Lux';assert.throws(()=>validateSlots(slots,data.champions),/同一英雄/);
 assert.throws(()=>recommend({slots:createSlots(),champions:data.champions,excluded:data.champions.map(c=>c.id)}),/没有可选英雄/);
});
test('all cached role references are current, champion-specific and structurally valid',()=>{
 assert.ok(Object.keys(data.builds).length>=175);
 for(const [key,ref] of Object.entries(data.builds))assert.ok(validReference(ref,hero(ref.champion),ref.role,data),key);
});
test('every champion and declared role has a legal rune page and no duplicated equipment',()=>{
 for(const c of data.champions)for(const role of profile(c).roles){
  const build=getBuild(c,role,data);assert.ok(validateRunePage(build.runePage,data.runes),`${c.id}:${role}`);
  assert.equal(new Set(build.items.map(i=>i.id)).size,build.items.length);assert.ok(build.items.length>0,`${c.id}:${role} equipment`);
 }
});
test('outdated and wrong-role source references never masquerade as current recommendations',()=>{
 const ref=data.builds['Ashe:bottom'];assert.ok(ref);
 assert.equal(getBuild(hero('Ashe'),'bottom',data).reference,ref);
 const stale={...data,builds:{'Ashe:bottom':{...ref,patch:'16.18'}}};assert.equal(getBuild(hero('Ashe'),'bottom',stale).reference,null);
 const wrong={...data,builds:{'Ashe:bottom':{...ref,role:'support'}}};assert.equal(getBuild(hero('Ashe'),'bottom',wrong).reference,null);
 const hex=getBuild(hero('Ashe'),'bottom',data,{mode:'hex'});assert.equal(hex.reference,null);assert.equal(hex.runePage,null);assert.ok(hex.items.every(i=>i.maps['12']));
});
test('rune validation rejects duplicate secondary slots, invalid shards and mismatched trees',()=>{
 const valid=getBuild(hero('Ashe'),'bottom',data).runePage;assert.ok(validateRunePage(valid,data.runes));
 const invalid=structuredClone(valid);invalid.selectedPerkIds[5]=invalid.selectedPerkIds[4];assert.equal(validateRunePage(invalid,data.runes),false);
 invalid.selectedPerkIds[8]=5005;assert.equal(validateRunePage(invalid,data.runes),false);
 assert.equal(validateRunePage({...valid,subStyleId:valid.primaryStyleId},data.runes),false);
});
test('Chinese names, nicknames and pinyin are searchable',()=>{
 assert.ok(matchesSearch(hero('Yasuo'),'亚索'));assert.ok(matchesSearch(hero('MissFortune'),'女枪'));assert.ok(matchesSearch(hero('MissFortune'),'mf'));
});

test('common default positions and champions without boots keep their intended behavior',()=>{
 assert.equal(profile(hero('Zed')).roles[0],'mid');
 assert.equal(profile(hero('MonkeyKing')).roles[0],'jungle');
 assert.ok(profile(hero('MonkeyKing')).roles.includes('top'));
 for(const mode of ['rift','hex'])for(const conditions of [[],['ad'],['control']]){
  const build=getBuild(hero('Cassiopeia'),'mid',data,{mode,conditions});
  assert.ok(build.items.every(i=>!i.tags.includes('Boots')));
  assert.equal(build.missing.length,0);
 }
});

test('stable suggestions favor an established support while preserving both chosen friends',()=>{
 const slots=createSlots();slots[2]={...slots[2],champion:'Zed',locked:true};slots[3]={...slots[3],champion:'Kaisa',locked:true};
 const result=recommend({slots,champions:data.champions,builds:data.builds,style:'balanced',limit:3});
 assert.equal(result[0].slots[4].champion,'Alistar');
 for(const r of result){assert.equal(r.slots[2].champion,'Zed');assert.equal(r.slots[3].champion,'Kaisa');}
 assert.ok(!result[0].analysis.warnings.some(w=>w.includes('法术伤害偏少')));
});

test('Hex later items use the mode map and malformed core selections fall back safely',async()=>{
 const hex=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url),'utf8')).entries;
 const hexItem=Object.values(data.items).find(i=>i.maps?.['12']&&!i.maps?.['11']&&i.inStore&&i.gold?.purchasable!==false&&!i.tags?.includes('Boots'));
 assert.ok(hexItem);
 const ref=structuredClone(hex.Ahri);ref.later=[[{items:[Number(hexItem.id)],samples:1}]];
 const fixture={...data,hexBuilds:{Ahri:ref}};
 const build=getBuild(hero('Ahri'),'mid',fixture,{mode:'hex',coreIndex:-3});
 assert.ok(build.reference);assert.ok(build.items.some(i=>i.id===hexItem.id));
 assert.equal(getBuild(hero('Ahri'),'mid',fixture,{mode:'hex',coreIndex:NaN}).items[0].id,build.items[0].id);
});

test('copied configurations retain chosen situational advice and summoner spells',()=>{
 const champion=hero('Ashe'),build=getBuild(champion,'bottom',data,{conditions:['heal','burst']});
 const text=buildAsText(build,champion,data);
 for(const id of build.summoners)assert.ok(text.includes(data.spells[id].name));
 assert.ok(text.includes('对手回复多'));assert.ok(text.includes('容易被秒'));assert.ok(text.includes(build.sourceNote));
});

test('client sync marks the local declared lane as ours without clearing premades',()=>{
 const hero=id=>data.champions.find(c=>c.id===id);
 // Solo top: top flips to party, mid/bot/sup premade flags untouched.
 const solo=mergeClientSession(createSlots(),{myTeam:[{cellId:1,championId:hero('Garen').key,assignedPosition:'TOP'}],localPlayerCellId:1},data.champions);
 assert.equal(solo.slots.find(s=>s.role==='top').party,true);
 assert.equal(solo.markedLocalRole,'top');assert.equal(solo.markedLocalChanged,true);
 assert.deepEqual(createSlots().filter(s=>s.party).map(s=>s.role),solo.slots.filter(s=>s.party&&s.role!=='top').map(s=>s.role));
 // Already marked: no change reported, flags stable.
 const again=mergeClientSession(solo.slots,{myTeam:[{cellId:1,championId:hero('Garen').key,assignedPosition:'TOP'}],localPlayerCellId:1},data.champions);
 assert.equal(again.markedLocalChanged,false);
 // Blind pick without a declared position: nothing touched.
 const blind=mergeClientSession(createSlots(),{myTeam:[{cellId:1,championId:hero('Garen').key,assignedPosition:''}],localPlayerCellId:1},data.champions);
 assert.equal(blind.slots.find(s=>s.role==='top').party,false);
 assert.equal(blind.markedLocalRole,null);assert.equal(blind.markedLocalChanged,false);
});
