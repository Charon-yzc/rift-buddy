import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,mergeClientSession,recommend} from '../src/core/recommend.mjs';
import {lineupFit,roomBallotBoard} from '../src/core/room-ballot.mjs';
import {clientContextDraft} from '../src/core/client-context-draft.mjs';
import {recommendationDraft} from '../src/core/draft-intents.mjs';

const {champions}=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const key=id=>champions.find(c=>c.id===id).key;
const session=()=>({localPlayerCellId:3,myTeam:['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'].map((assignedPosition,cellId)=>({cellId,assignedPosition,championId:0,championPickIntent:0})),bans:[]});
const saved=(champion='Nami',role='support')=>createSlots().map(s=>({...s,party:s.role==='bottom',champion:s.role===role?champion:null,locked:s.role===role}));
const merge=(slots,clientSession)=>mergeClientSession(slots,clientSession,champions,{autoParty:true,party:{status:'known',lobbyCount:1,members:[{cellId:3,local:true}]}}).slots;
const input=(slots,clientSession,extra={})=>({slots,clientSession,champions,scope:'party',pool:['Ashe','Jinx','Kaisa'],poolMode:'only',limit:3,...extra});
const ranked=results=>results.map(r=>[r.slots.find(s=>s.party).champion,r.score,r.compositionFit.score,r.analysis.members.map(m=>[m.role,m.champion])]);

test('blank public draft does not turn an unbound saved teammate into ranking or displayed fit evidence',()=>{
 const current=session(),slots=merge(saved(),current),before=structuredClone(slots),clean=merge(createSlots(),current);
 assert.equal(slots.find(s=>s.role==='support').champion,'Nami');
 assert.equal(slots.find(s=>s.role==='support').clientCellId,undefined);
 const results=recommend(input(slots,current));
 assert.deepEqual(ranked(results),ranked(recommend(input(clean,current))));
 for(const result of results){
  assert.deepEqual(result.targets,['bottom']);assert.equal(result.analysis.known,1);assert.equal(result.compositionFit.score,null);
  assert.equal(result.slots.find(s=>s.role==='support').champion,null);
  const fit=lineupFit(result.slots,slots,champions,{clientSession:current});
  assert.equal(fit.known,1);assert.equal(fit.score,null);
 }
 const proposal={lineup:[{role:'bottom',champion:'Ashe'}],mode:'rift'};
 const [row]=roomBallotBoard({members:[{nick:'我',share:{ballot:{proposal}}}]},slots,champions,{clientSession:current});
 assert.equal(row.fit.score,null);assert.equal(row.fit.known,1);
 assert.deepEqual(slots,before,'Saved offline picks remain available for editing');
});

test('real teammate hovers supersede saved locks and share the same evidence in ranking and ballot fit',()=>{
 const current=session();current.myTeam[4].championPickIntent=key('Lulu');
 const slots=merge(saved(),current),before=structuredClone(slots);
 const rendererDraft=recommendationDraft(slots,current,champions);
 assert.equal(rendererDraft.find(s=>s.role==='support').champion,'Nami','The saved lock previously prevented the real hover overlay');
 const results=recommend(input(rendererDraft,current)),clean=recommend(input(merge(createSlots(),current),current));
 assert.deepEqual(ranked(results),ranked(clean));
 for(const result of results){
  assert.deepEqual(result.targets,['bottom']);assert.equal(result.analysis.known,2);
  assert.equal(result.slots.find(s=>s.role==='support').champion,'Lulu');
  assert.equal(result.slots.find(s=>s.role==='support').publicIntent,true);
  assert.equal(result.slots.find(s=>s.role==='support').locked,false);
  assert.equal(lineupFit(result.slots,slots,champions,{clientSession:current}).score,result.compositionFit.score);
 }
 assert.deepEqual(slots,before);
});

test('saved teammate heroes neither block controllable picks nor raise stale ban conflicts',()=>{
 const current=session(),slots=merge(saved('Ashe','mid'),current),before=structuredClone(slots);
 const [result]=recommend(input(slots,current,{pool:['Ashe']}));
 assert.equal(result.slots.find(s=>s.role==='bottom').champion,'Ashe');
 assert.equal(result.slots.find(s=>s.role==='mid').champion,null);assert.deepEqual(slots,before);
 const nami=merge(saved(),current);
 assert.doesNotThrow(()=>recommend(input(nami,current,{publicBans:['Nami'],enemy:['Nami']})));
});

test('actual client picks and explicit player positions survive contextual normalization',()=>{
 const current=session();current.myTeam[1].championId=key('Nami');current.myTeam[1].assignedPosition='UTILITY';
 const original=saved().map(s=>s.role==='jungle'?{...s,manualPosition:true,clientCellId:3}:s.role==='mid'?{...s,manualPosition:true,clientCellId:1}:s);
 const slots=merge(original,current),before=structuredClone(slots),results=recommend(input(slots,current,{pool:['Vi','Amumu']}));
 for(const result of results){
  assert.deepEqual(result.targets,['jungle']);
  const ally=result.slots.find(s=>s.clientCellId===1);
  assert.equal(ally.role,'mid');assert.equal(ally.champion,'Nami');assert.equal(ally.manualPosition,true);assert.equal(ally.locked,true);
  assert.equal(result.analysis.known,2);
  assert.equal(lineupFit(result.slots,slots,champions,{clientSession:current}).score,result.compositionFit.score);
 }
 assert.equal(slots.find(s=>s.clientCellId===3).role,'jungle');assert.equal(slots.find(s=>s.clientCellId===3).manualPosition,true);
 assert.deepEqual(slots,before);
 const hovered=structuredClone(current);hovered.myTeam[1].championId=0;hovered.myTeam[1].championPickIntent=key('Nami');
 const temporary=clientContextDraft(merge(original,hovered),champions,hovered);
 assert.equal(temporary.find(s=>s.role==='mid').champion,'Nami');assert.equal(temporary.find(s=>s.role==='mid').publicIntent,true);
 assert.equal(temporary.find(s=>s.role==='support').champion,null);
});

test('known but unpicked own lane still receives solo recommendations, and a confirmed own pick stays fixed',()=>{
 const current=session(),slots=merge(saved(),current),before=structuredClone(slots);
 const results=recommend(input(slots,current,{scope:'solo',soloRole:'bottom'}));
 assert.equal(results.length,3);
 for(const result of results){assert.deepEqual(result.targets,['bottom']);assert.equal(result.analysis.known,1);assert.equal(result.compositionFit.score,null);}
 current.myTeam[3].championId=key('Ashe');
 const fixed=merge(slots,current),[result]=recommend(input(fixed,current,{scope:'solo',soloRole:'bottom',soloChampion:'Ashe'}));
 assert.deepEqual(result.targets,[]);assert.equal(result.slots.find(s=>s.role==='bottom').champion,'Ashe');assert.equal(result.analysis.known,1);
 assert.equal(result.slots.find(s=>s.role==='support').champion,null);assert.deepEqual(slots,before);
});

test('offline lineup editing and multi-player party grading retain their existing behavior',()=>{
 const slots=saved(),before=structuredClone(slots),[offline]=recommend(input(slots,null));
 assert.equal(offline.analysis.known,2);assert.ok(offline.compositionFit.score>0);
 assert.equal(lineupFit(offline.slots,slots,champions).score,offline.compositionFit.score);
 assert.deepEqual(clientContextDraft(slots,champions,null),slots);
 const party=slots.map(s=>({...s,party:['bottom','support'].includes(s.role)}));
 const [group]=recommend(input(party,session()));
 assert.equal(group.scope,'party');assert.equal(group.analysis.known,2);assert.equal(group.slots.find(s=>s.role==='support').champion,'Nami');
 assert.deepEqual(slots,before);
});

test('normalizing a public hover retains bans and current own pick eligibility',()=>{
 const current=session();current.myTeam[4].championPickIntent=key('Lulu');current.myTeam[3].championPickIntent=key('Jinx');
 const results=recommend(input(merge(saved(),current),current,{publicBans:['Lulu'],eligibleByRole:{bottom:['Ashe']}}));
 assert.equal(results.length,1);assert.deepEqual(results[0].targets,['bottom']);
 assert.equal(results[0].slots.find(s=>s.role==='bottom').champion,'Ashe');assert.equal(results[0].analysis.known,1);
});

test('a manually marked single recommendation lane does not move the public local hover out of its declared lane',()=>{
 const current=session();current.myTeam[3].championPickIntent=key('Ashe');
 const slots=createSlots().map(s=>({...s,party:s.role==='support'}));
 const normalized=clientContextDraft(slots,champions,current);
 assert.equal(normalized.find(s=>s.role==='bottom').champion,'Ashe');assert.equal(normalized.find(s=>s.role==='support').champion,null);
});

test('solo recommendations with an unknown own lane retain public blind-pick hovers across lane recursion',()=>{
 const current=session();current.myTeam.forEach(p=>p.assignedPosition='');current.myTeam[4].championPickIntent=key('Nami');
 const slots=merge(saved(),current),before=structuredClone(slots);
 const results=recommend(input(slots,current,{scope:'solo',soloRole:'',pool:[],poolMode:'off',limit:6}));
 assert.equal(results.length,6);assert.equal(new Set(results.slice(0,4).map(r=>r.soloRole)).size,4);
 for(const result of results){
  assert.notEqual(result.soloRole,'support');assert.deepEqual(result.targets,[result.soloRole]);assert.equal(result.analysis.known,2);
  const ally=result.slots.find(s=>s.role==='support');assert.equal(ally.champion,'Nami');assert.equal(ally.publicIntent,true);
 }
 assert.deepEqual(slots,before);
});
