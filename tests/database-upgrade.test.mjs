import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BUNDLED_CATALOG,catalogIssues,validateCatalog} from '../src/core/catalog.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {createGuideModel,selectGuide,validateGuideSelection,reconcileGuide} from '../src/core/guide.mjs';
import {legalSkillOrder,nextSkill,recommendSkill} from '../src/core/skill-advice.mjs';
import {sanitizeLive} from '../services/live-client.mjs';
import {reviewBaseline} from '../src/core/catalog-review.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id),selection={id:'Ashe',role:'bottom',mode:'rift'};
const p=(champion,side,items=[])=>({champion,side,inventory:items.map(id=>({id:String(id),count:1})),itemsKnown:true,scores:{kills:0}});
const live=(extra={})=>({available:true,at:Date.now(),champion:'Ashe',mode:'rift',mapId:11,gold:800,level:7,skills:{Q:1,W:3,E:1,R:1},inventory:[],teamKnown:true,roster:[p('Jhin','enemy',[3031]),p('Jinx','enemy',[6672])],...extra});
test('new database contains executable sourced plans with multiple builds rather than duplicate pair inflation',()=>{
 validateCatalog(BUNDLED_CATALOG,data);assert.equal(new Set(BUNDLED_CATALOG.duos.map(d=>d.carry+':'+d.support)).size,BUNDLED_CATALOG.duos.length);
 assert.ok(BUNDLED_CATALOG.duos.every(d=>d.sources.length&&d.plan&&d.risk));assert.ok(data.builds['Ashe:bottom'].core.length>3);assert.ok(data.builds['Ashe:bottom'].runeOptions.length>6);
 const b=getBuild(hero('Taric'),'support',data,{comboId:BUNDLED_CATALOG.duos.find(d=>d.carry==='Nilah'&&d.support==='Taric').id});assert.equal(b.loadoutId,'taric-guardian');assert.equal(b.skillOrder[3],'Q');assert.ok(b.runeOptions.some(r=>r.page.selectedPerkIds[0]===8465));
});
test('a refreshed source preserves the exact selected core when sample sorting changes',()=>{
 const b=getBuild(hero('Ashe'),'bottom',data,{coreIndex:8}),ref=structuredClone(data.builds['Ashe:bottom']);ref.core.reverse();
 const changed={...data,builds:{...data.builds,'Ashe:bottom':ref}},after=getBuild(hero('Ashe'),'bottom',changed,{coreIndex:8,coreId:b.selectedCoreId});assert.equal(after.selectedCoreId,b.selectedCoreId);assert.deepEqual(after.items.slice(0,3),b.items.slice(0,3));
 ref.core=ref.core.filter(r=>'core-'+r.items.join('-')!==b.selectedCoreId);const removed=getBuild(hero('Ashe'),'bottom',changed,{coreId:b.selectedCoreId});assert.ok(removed.selectionWarnings.some(s=>s.includes('原核心路线')));
 assert.equal(validateGuideSelection({...selection,coreIndex:14,coreId:b.selectedCoreId}).coreIndex,14);
});
test('same-patch recipe and skill changes flag their dependents without changing any review date',()=>{
 const baseline={...data,patch:BUNDLED_CATALOG.patch},next=structuredClone(baseline),c=structuredClone(BUNDLED_CATALOG);
 // Isolate these changes from legitimate differences between the bundled
 // historical review and today's source data (including corrected growth).
 for(const row of [...c.loadouts,...c.duos,...c.trios])row.reviewBaseline=reviewBaseline(row,c,baseline);
 const entry=c.duos.find(d=>d.carry==='Nilah'&&d.support==='Taric');
 next.items[3190].gold.total+=100;next.champions.find(c=>c.id==='Taric').mechanics.spells[2].cooldown[0]+=1;
 const issue=catalogIssues(c,next);assert.equal(issue.status[entry.id].stale,true);assert.ok(issue.status[entry.id].changedDependencies.some(d=>d.kind==='item'&&d.id==='3190'));assert.ok(issue.status[entry.id].changedDependencies.some(d=>d.kind==='champion'&&d.id==='Taric'));
 assert.equal(issue.status[entry.id].reviewedAt,entry.reviewedAt);assert.equal(issue.status[c.duos.find(d=>d.carry==='Caitlyn'&&d.support==='Lux').id].stale,false);
 assert.ok(issue.reviewTasks.some(t=>t.id===entry.id));assert.equal(catalogIssues(c,baseline).status[entry.id].stale,false);
});
test('stale rules stop automatic shopping, and public attack investment alone never changes Malphite E priority',()=>{
 const m=createGuideModel({...data,patch:'16.21'},selectGuide(null,selection),live());assert.equal(m.situation.automatic,false);assert.equal(m.automaticTarget,false);assert.match(m.situation.summary,/停止自动/);
 const advice=recommendSkill({champion:'Malphite',role:'top',priority:'QEW',first:'QEW',live:{matched:true,level:7,skills:{Q:3,W:1,E:1,R:1}},signals:[{kind:'physical',source:'scoreboard',evidence:'对方购买攻击力装备'}]});assert.equal(advice.next,'Q');assert.equal(advice.changed,false);
});
test('delayed ultimate and Taric Q2 remain explicit nodes instead of unconditional R upgrades',()=>{
 const taric=BUNDLED_CATALOG.loadouts.find(l=>l.id==='taric-guardian'),trynd=BUNDLED_CATALOG.loadouts.find(l=>l.id==='trynd-delayed-r');assert.ok(legalSkillOrder(trynd.skillOrder));assert.equal(legalSkillOrder('QQQ'),false);
 assert.equal(nextSkill('Taric','EQW','EQW',{matched:true,level:4,skills:{Q:1,W:1,E:1,R:0}},taric.skillOrder),'Q');
 assert.equal(nextSkill('Tryndamere','QEW','EQQ',{matched:true,level:11,skills:{Q:5,W:1,E:3,R:1}},trynd.skillOrder),'E');
 assert.equal(nextSkill('Ashe','WQE','WQE',{matched:true,level:20,skills:{Q:5,W:5,E:5,R:3}}),null);
});
test('lane targets must be selected, new games clear focus, and confirmed teammates can be chosen for protection',()=>{
 const guide=selectGuide(null,{...selection,combatFocus:'lane'}),m=createGuideModel(data,guide,live());assert.equal(m.situation.signals.length,0);assert.match(m.situation.summary,/不会.*猜/);
 const focused=createGuideModel(data,selectGuide(null,{...selection,combatFocus:'lane',threatId:'Jhin'}),live());assert.ok(focused.situation.signals.every(s=>s.evidence.includes('烬')));
 const support=selectGuide(null,{id:'Lulu',role:'support',mode:'rift',protectId:'Ashe'}),protectedModel=createGuideModel(data,support,live({champion:'Lulu',roster:[p('Ashe','ally')]}));assert.ok(protectedModel.situation.candidates.some(c=>c.id==='3190'));assert.match(protectedModel.situation.candidates.find(c=>c.id==='3190').reason,/艾希/);
 const reset=reconcileGuide({...guide,selection:{...guide.selection,threatId:'Jhin',protectId:'Jinx'},match:{phase:'InProgress',entered:true,gameId:'1'}},{phase:'ChampSelect',gameId:'2'}).guide;assert.equal(reset.selection.threatId,undefined);assert.equal(reset.selection.protectId,undefined);
});
test('public slots are retained without player identity and a dedicated footwear slot does not fill the six main slots',()=>{
 const player={riotId:'private-only',rawChampionName:'game_character_displayname_Ashe',team:'ORDER',items:[0,1,2,3,4,7].map((slot,i)=>({slot,itemID:[1055,1038,1037,1042,2003,3006][i],count:1}))};
 const read=sanitizeLive({riotId:'private-only',currentGold:800,level:7},[player],{gameMode:'CLASSIC',mapNumber:11},data.champions,{queueId:430});assert.equal(read.queueId,430);assert.equal(read.inventory.at(-1).slot,7);assert.equal(JSON.stringify(read).includes('private-only'),false);
 const m=createGuideModel(data,selectGuide(null,selection),{...live(),inventory:read.inventory});assert.equal(m.situation.caution.includes('六个装备格'),false);
});
