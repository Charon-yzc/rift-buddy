import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {sanitizeSession} from '../services/lcu.mjs';
import {hexDraft} from '../src/core/hex-draft.mjs';
import {pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {hexDraftView} from '../src/hex-draft-view.mjs';
import {companionView} from '../src/companion-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8')),key=id=>data.champions.find(c=>c.id===id).key;
const client=()=>({connected:true,phase:'ChampSelect',mode:{id:'hex'},session:sanitizeSession({localPlayerCellId:0,myTeam:['Lux','Ashe','Veigar','Sona','Jinx'].map((id,cellId)=>({cellId,championId:key(id)})),benchEnabled:true,benchChampions:['Malphite','Xerath','Lux'].map(id=>({championId:key(id),puuid:'private'}))})});
test('Hex team alternatives use only public bench, retain teammates and explain coverage changes without lanes',()=>{
 const c=client(),before=structuredClone(c),model=hexDraft({data,client:c});
 assert.equal(model.team.length,5);assert.equal(model.candidates[0].hero.id,'Malphite');assert.deepEqual(model.candidates[0].added,['补承伤手段']);assert.equal(model.candidates.length,2);
 for(const row of model.candidates){assert.equal(row.lineup[0].hero.id,row.hero.id);assert.deepEqual(row.lineup.slice(1).map(p=>p.hero.id),['Ashe','Veigar','Sona','Jinx']);}
 assert.deepEqual(c,before);assert(!JSON.stringify(c).includes('private'));
 const html=hexDraftView({data,client:c});assert.match(html,/我 · 墨菲特，查看配置/);assert.doesNotMatch(html,/上路|中路|打野|data-action="(?:client-prepare|preselect)/);
});
test('missing or stale bench never invents candidates; unknown patches never apply old coverage sorting',()=>{
 const c=client();delete c.session.bench;assert.equal(hexDraft({data,client:c}).candidates.length,0);assert.match(hexDraftView({data,client:c}),/暂未提供可换英雄/);
 const missing=client();missing.session.localPlayerCellId=99;assert.equal(hexDraft({data,client:missing}).candidates.length,0);
 for(const next of [{...client(),phase:'InProgress'},{...client(),connected:false},{...client(),mode:{id:'rift'}}]){const m=hexDraft({data,client:next});assert.equal(m.team.length,0);assert.equal(m.candidates.length,0);}
 const m=hexDraft({data:{...data,patch:'99.1'},client:client()});assert.equal(m.reviewed,false);assert.equal(m.coverage.length,0);assert(m.candidates.every(c=>!c.comparable&&!c.added.length&&!c.lost.length));
});
test('bench projection is bounded, deduplicated and drops all private fields',()=>{
 const s=sanitizeSession({benchEnabled:true,benchChampions:Array.from({length:80},(_,i)=>({championId:i+1,private:'secret'}))});assert.equal(s.bench.championIds.length,50);assert(!JSON.stringify(s).includes('secret'));
 assert.equal(sanitizeSession({benchEnabled:false,benchChampions:[{championId:1}]}).bench,undefined);
});
test('Hex lineup and configuration pages have separate content and preserve round context',()=>{
 const c=client(),round={hero:'Lux',context:'one',revision:2,gameId:'1',options:[],owned:[]},props={data,client:c,hexRound:round,tab:'recommend',configurationStatus:{},preferences:{}};
 const lineup=companionView(props);assert.match(lineup,/我的阵容/);assert.match(lineup,/海克斯阵容/);assert.doesNotMatch(lineup,/本轮强化三选一|data-hex-option-input|英雄强化建议/);
 const plan=companionView({...props,tab:'plan'});assert.match(plan,/data-hex-option-input/);assert.match(plan,/强化池/);assert.doesNotMatch(plan,/海克斯阵容|阵容备选/);assert.match(plan,/data-hex-context="one"/);assert.doesNotMatch(plan,/hex-current-hero|本局指引|companion-persistent/);
});

test('same-patch hero source changes withdraw mechanical claims without hiding the real bench',()=>{
 for(const id of ['Malphite','Ashe'])for(const change of [h=>{h.mechanicSource.character.sha256='0'.repeat(64);},h=>{delete h.mechanicSource;}]){
  const changed=structuredClone(data);change(changed.champions.find(c=>c.id===id));const m=hexDraft({data:changed,client:client()}),row=m.candidates.find(c=>c.hero.id==='Malphite');assert.equal(row.comparable,false);assert.deepEqual(row.added,[]);assert.deepEqual(row.lost,[]);assert.equal(row.priority,0);assert.equal(m.candidates.length,2);
  if(id==='Ashe'){assert.equal(m.reviewed,false);assert.equal(m.coverage.length,0);assert(m.candidates.every(c=>!c.comparable));}
 }
 const transport=structuredClone(data);transport.champions.find(c=>c.id==='Malphite').mechanicSource.observedAt='2026-10-21T00:00:00Z';assert.deepEqual(hexDraft({data:transport,client:client()}).candidates.map(c=>[c.hero.id,c.priority]),hexDraft({data,client:client()}).candidates.map(c=>[c.hero.id,c.priority]));
 const partial=client();partial.session.myTeam[4].championId=0;const m=hexDraft({data,client:partial});assert(m.candidates.every(c=>!c.comparable&&!c.added.length&&!c.lost.length));assert.doesNotMatch(hexDraftView({data,client:partial}),/承伤手段 缺/);
});
test('fresh own availability removes unowned and disabled bench heroes; stale eligibility is never reused',()=>{
 const c=client();c.eligibility={context:pickEligibilityContext(c.session),localPlayerCellId:0,receivedAt:new Date().toISOString(),pickable:[key('Xerath')],disabled:[]};assert.deepEqual(hexDraft({data,client:c}).candidates.map(c=>c.hero.id),['Xerath']);
 c.eligibility.pickable=null;c.eligibility.disabled=[key('Malphite')];assert.deepEqual(hexDraft({data,client:c}).candidates.map(c=>c.hero.id),['Xerath']);
 c.eligibility.receivedAt=new Date(Date.now()-60000).toISOString();assert.equal(hexDraft({data,client:c}).candidates.length,2);
});
