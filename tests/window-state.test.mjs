import test from 'node:test';
import assert from 'node:assert/strict';
import {rebaseWindowState,equalWindowState} from '../src/core/window-state.mjs';

const hero=(id,extra={})=>({id,role:'mid',mode:'rift',runeId:'old',...extra});
const state=()=>({preferences:{buildSource:{region:'global',tier:'emerald_plus'},play:{tempo:'any'}},draft:{soloRole:'mid',slots:[{role:'mid',champion:'Ahri',party:true},{role:'support',champion:null,party:false}]},preparations:[hero('Ahri'),hero('Annie')],favorites:[{id:'old',title:'Old',type:'build'}],excluded:['Zed'],ownedPageId:1});

test('normalized key order is the same draft but changed members and plan duties remain changes',()=>{
 const local={slots:[{role:'mid',champion:'Ahri',party:true}],style:'balanced',scope:'party',soloRole:'',creativePlan:{id:'plan',steps:['保留控制'],members:[{champion:'Ahri',role:'mid'}]}};
 const accepted={slots:[{party:true,champion:'Ahri',role:'mid'}],creativePlan:{members:[{role:'mid',champion:'Ahri'}],steps:['保留控制'],id:'plan'},style:'balanced',scope:'party',soloRole:''};
 assert.notEqual(JSON.stringify(local),JSON.stringify(accepted));assert(equalWindowState(local,accepted));
 for(const changed of [(()=>{const x=structuredClone(accepted);x.slots[0].champion='Annie';return x;})(),(()=>{const x=structuredClone(accepted);x.creativePlan.steps=['先交控制'];return x;})()])assert(!equalWindowState(local,changed));
});

test('idle window accepts the complete confirmed snapshot without mutating it',()=>{
 const base=state(),accepted=state();accepted.preferences.play.tempo='growth';accepted.ownedPageId=8;
 const merged=rebaseWindowState(base,base,accepted);assert.deepEqual(merged,accepted);merged.preferences.play.tempo='changed';assert.equal(accepted.preferences.play.tempo,'growth');
});
test('queued save retains another window hero edits while replaying its own later choices',()=>{
 const base=state(),local=state(),accepted=state();local.preparations[0].laterIds=['3102'];local.preparations[1].runeId='local';accepted.preparations.reverse();accepted.preparations.find(p=>p.id==='Ahri').runeId='remote';accepted.preparations.push(hero('Lux'));accepted.ownedPageId=9;
 const merged=rebaseWindowState(base,local,accepted);assert.deepEqual(merged.preparations.find(p=>p.id==='Ahri'),hero('Ahri',{runeId:'remote',laterIds:['3102']}));assert.equal(merged.preparations.find(p=>p.id==='Annie').runeId,'local');assert.ok(merged.preparations.some(p=>p.id==='Lux'));assert.equal(merged.ownedPageId,9);assert.equal(base.preparations[0].runeId,'old');
});
test('later same-field local edit survives rebase and deletion is explicit',()=>{
 const base=state(),local=state(),accepted=state();local.preparations[0].runeId='latest-local';accepted.preparations[0].runeId='remote';local.preparations=local.preparations.filter(p=>p.id!=='Annie');
 const merged=rebaseWindowState(base,local,accepted);assert.equal(merged.preparations[0].runeId,'latest-local');assert.ok(!merged.preparations.some(p=>p.id==='Annie'));
});
test('favorite and exclusion additions from both windows survive independently',()=>{
 const base=state(),local=state(),accepted=state();local.favorites.push({id:'local',title:'Mine',type:'build'});accepted.favorites.push({id:'remote',title:'Theirs',type:'build'});local.favorites[0].title='Renamed';accepted.favorites[0].version='16.20';local.excluded=['Ahri'];accepted.excluded.push('Lux');
 const merged=rebaseWindowState(base,local,accepted);assert.deepEqual(new Set(merged.favorites.map(f=>f.id)),new Set(['old','local','remote']));assert.deepEqual(merged.favorites.find(f=>f.id==='old'),{id:'old',title:'Renamed',type:'build',version:'16.20'});assert.deepEqual(new Set(merged.excluded),new Set(['Lux','Ahri']));
});
test('draft slots replay by position and preserve remote source/preferences',()=>{
 const base=state(),local=state(),accepted=state();local.draft.slots[0].party=false;accepted.draft.slots[1].champion='Lulu';local.draft.soloRole='top';accepted.preferences.buildSource.region='kr';
 const merged=rebaseWindowState(base,local,accepted);assert.equal(merged.draft.slots[0].party,false);assert.equal(merged.draft.slots[1].champion,'Lulu');assert.equal(merged.draft.soloRole,'top');assert.equal(merged.preferences.buildSource.region,'kr');
});
test('a queued snapshot rebased after another save does not delete remote additions on the next rebase',()=>{
 const submitted=state(),queued=state(),accepted=state();queued.preparations[0].runeId='next';accepted.favorites.push({id:'remote',title:'Other',type:'build'});
 const rebased=rebaseWindowState(submitted,queued,accepted),latest=structuredClone(rebased);latest.preferences.play.tempo='growth';const nextAccepted=structuredClone(rebased);nextAccepted.preparations[1].laterIds=['3102'];
 const next=rebaseWindowState(rebased,latest,nextAccepted);assert.ok(next.favorites.some(f=>f.id==='remote'));assert.deepEqual(next.preparations[1].laterIds,['3102']);assert.equal(next.preferences.play.tempo,'growth');
});

test('concurrent creation of the same hero or favorite preserves independently added fields',()=>{
 const base=state(),local=state(),accepted=state();local.preparations.push({id:'Galio',role:'mid',mode:'rift',summonerIds:['SummonerTeleport','SummonerFlash']});accepted.preparations.push({id:'Galio',role:'mid',mode:'rift',runeId:'aftershock'});local.favorites.push({id:'new',title:'Our lineup',type:'team'});accepted.favorites.push({id:'new',title:'Original title',type:'team',version:'16.20'});
 const merged=rebaseWindowState(base,local,accepted);assert.deepEqual(merged.preparations.find(p=>p.id==='Galio'),{id:'Galio',role:'mid',mode:'rift',runeId:'aftershock',summonerIds:['SummonerTeleport','SummonerFlash']});assert.deepEqual(merged.favorites.find(f=>f.id==='new'),{id:'new',title:'Our lineup',type:'team',version:'16.20'});
});
