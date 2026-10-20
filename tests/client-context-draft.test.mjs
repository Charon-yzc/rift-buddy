import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,mergeClientSession,recommend} from '../src/core/recommend.mjs';
import {lineupFit,roomBallotBoard} from '../src/core/room-ballot.mjs';
import {clientContextDraft} from '../src/core/client-context-draft.mjs';
import {recommendationDraft} from '../src/core/draft-intents.mjs';
import {sanitizeSession} from '../services/lcu.mjs';

const {champions}=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const key=id=>champions.find(c=>c.id===id).key;
const session=()=>({localPlayerCellId:3,myTeam:['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'].map((assignedPosition,cellId)=>({cellId,assignedPosition,championId:0,championPickIntent:0})),bans:[]});
const saved=(champion='Nami',role='support')=>createSlots().map(s=>({...s,party:s.role==='bottom',champion:s.role===role?champion:null,locked:s.role===role}));
const merge=(slots,clientSession)=>mergeClientSession(slots,clientSession,champions,{autoParty:true,party:{status:'known',lobbyCount:1,members:[{cellId:3,local:true}]}}).slots;
const input=(slots,clientSession,extra={})=>({slots,clientSession,champions,scope:'party',pool:['Ashe','Jinx','Kaisa'],poolMode:'only',limit:3,...extra});
const ranked=results=>results.map(r=>[r.slots.find(s=>s.party).champion,r.score,r.compositionFit.score,r.analysis.members.map(m=>[m.role,m.champion])]);

test('whole-team displayed fit preserves explicit locks and labels actionless public references without promoting intents',()=>{
 const ids=['Garen','Amumu','TwistedFate','Ashe',null],positions=['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'];
 const raw={localPlayerCellId:4,myTeam:ids.map((id,cellId)=>({cellId,assignedPosition:positions[cellId],championId:id?key(id):0})),actions:[]};
 const visible=createSlots().map((s,i)=>({...s,champion:ids[i],party:s.role==='support',clientCellId:i})),candidate=visible.map(s=>({...s,champion:s.role==='support'?'Pyke':null}));
 const get=value=>lineupFit(candidate,visible,champions,{scope:'context',soloRole:'support',clientSession:sanitizeSession(value)}),before=structuredClone({raw,visible,candidate});
 const unconfirmed=get(raw);assert.equal(unconfirmed.known,5);assert.equal(unconfirmed.referenceCount,4);assert.ok(Number.isFinite(unconfirmed.score));assert.match(unconfirmed.reason,/含 4 位未确认/);
 const locked=structuredClone(raw);locked.myTeam.slice(0,4).forEach(p=>p.pickState='locked');const confirmed=get(locked);assert.equal(confirmed.known,5);assert.equal(confirmed.referenceCount,0);assert.equal(confirmed.score,unconfirmed.score);
 for(const kind of ['intent','unfinished']){
  const value=structuredClone(raw);if(kind==='intent')value.myTeam.forEach(p=>{p.championPickIntent=p.championId;p.championId=0;});
  else value.actions=value.myTeam.slice(0,4).map(p=>({type:'pick',actorCellId:p.cellId,championId:p.championId,completed:false}));
  const fit=get(value);assert.equal(fit.referenceCount,0,kind);assert.equal(fit.score,null,kind);
 }
 const duplicate=candidate.map(s=>s.role==='support'?{...s,champion:'Garen'}:s),conflict=lineupFit(duplicate,visible,champions,{scope:'context',soloRole:'support',clientSession:sanitizeSession(raw)});assert.equal(conflict.compatible,false);assert.ok(conflict.score<=20);assert.equal(conflict.known,4,'The same hero must never count as two members');
 const unknown=structuredClone(raw);unknown.myTeam.forEach(p=>p.assignedPosition='');const fit=get(unknown);assert.equal(fit.known,5);assert.ok(fit.gaps.some(text=>/分路未知/.test(text)));
 assert.deepEqual({raw,visible,candidate},before);
});

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

test('real teammate hovers remain visible without entering ranking or ballot fit',()=>{
 const current=session();current.myTeam[4].championPickIntent=key('Lulu');
 const slots=merge(saved(),current),before=structuredClone(slots);
 const rendererDraft=recommendationDraft(slots,current,champions);
 assert.equal(rendererDraft.find(s=>s.role==='support').champion,'Lulu','The real public hover is visible before ranking and fit normalization');
 const results=recommend(input(rendererDraft,current)),clean=recommend(input(merge(createSlots(),current),current));
 assert.deepEqual(ranked(results),ranked(clean));
 for(const result of results){
  assert.deepEqual(result.targets,['bottom']);assert.equal(result.analysis.known,1);
  assert.equal(result.slots.find(s=>s.role==='support').champion,null);
  assert.equal(result.slots.find(s=>s.role==='support').publicIntent,undefined);
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
 const current=session();current.myTeam[1].championId=key('Nami');current.myTeam[1].pickState='locked';current.myTeam[1].assignedPosition='UTILITY';
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
 const hovered=structuredClone(current);hovered.myTeam[1].championId=0;delete hovered.myTeam[1].pickState;hovered.myTeam[1].championPickIntent=key('Nami');
 const temporary=clientContextDraft(merge(original,hovered),champions,hovered);
 assert.equal(temporary.find(s=>s.role==='mid').champion,null);assert.equal(temporary.find(s=>s.role==='mid').publicIntent,undefined);
 assert.equal(temporary.find(s=>s.role==='support').champion,null);
});

test('known but unpicked own lane still receives solo recommendations, and a confirmed own pick stays fixed',()=>{
 const current=session(),slots=merge(saved(),current),before=structuredClone(slots);
 const results=recommend(input(slots,current,{scope:'solo',soloRole:'bottom'}));
 assert.equal(results.length,3);
 for(const result of results){assert.deepEqual(result.targets,['bottom']);assert.equal(result.analysis.known,1);assert.equal(result.compositionFit.score,null);}
 current.myTeam[3].championId=key('Ashe');current.myTeam[3].pickState='locked';
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
 assert.equal(group.scope,'party');assert.equal(group.analysis.known,2);assert.ok(group.slots.find(s=>s.role==='support').champion);assert.deepEqual(ranked([group]),ranked(recommend(input(party.map(s=>({...s,champion:null,locked:false})),session())).slice(0,1)));
 assert.deepEqual(slots,before);
});

test('unplaced public allies affect solo team fit without inventing their lanes or making them editable',()=>{
 for(const scope of ['party','solo']){
  const current=session();current.myTeam.forEach(p=>{p.assignedPosition='';});
  ['Malphite','Amumu','Orianna',null,'Lulu'].forEach((id,cell)=>{current.myTeam[cell].championId=id?key(id):0;if(id)current.myTeam[cell].pickState='locked';});
  const initial=createSlots().map(s=>({...s,party:s.role==='bottom',...(s.role==='bottom'?{manualPosition:true,clientCellId:3}:{})}));
  const merged=mergeClientSession(initial,current,champions,{autoArrange:false,autoParty:false}),before=structuredClone(merged.slots);
  assert.equal(merged.unassigned.length,4);
  const [result]=recommend(input(merged.slots,current,{scope,soloRole:'bottom',pool:['Jinx']}));
  const [blank]=recommend(input(merged.slots,session(),{scope,soloRole:'bottom',pool:['Jinx']}));
  assert.deepEqual(result.targets,['bottom']);assert.equal(result.analysis.known,5);assert.notEqual(result.score,blank.score);
  const allies=result.analysis.members.filter(m=>m.positionUnknown);assert.equal(allies.length,4);assert.ok(allies.every(m=>m.role===''));
  assert.ok(result.slots.filter(s=>s.role!=='bottom').every(s=>s.champion===null),'Unknown ally lanes must remain empty');
  assert.ok(result.compositionFit.gaps.some(text=>/4 位公开队友分路未知/.test(text)));assert.ok(!result.compositionFit.gaps.some(text=>/成员位置冲突/.test(text)));
  assert.equal(lineupFit(result.slots,merged.slots,champions,{scope,soloRole:'bottom',clientSession:current}).score,result.compositionFit.score);
  const conflicting=result.slots.map(s=>s.role==='bottom'?{...s,champion:'Malphite'}:s);
  assert.equal(lineupFit(conflicting,merged.slots,champions,{scope,soloRole:'bottom',clientSession:current}).compatible,false,'An unplaced real ally is not a replacement for the local player');
  assert.deepEqual(merged.slots,before,'Scoring must not persist inferred lanes');
  const pools=['Jinx','Malphite','Amumu','Orianna','Lulu'],choices=recommend(input(merged.slots,current,{scope,soloRole:'bottom',pool:pools}));
  assert.ok(choices.every(r=>r.slots.find(s=>s.role==='bottom').champion==='Jinx'),'Actual public allied heroes cannot become selectable candidates');
  current.myTeam[3].championId=key('Jinx');current.myTeam[3].assignedPosition='BOTTOM';current.actions=[[{type:'pick',actorCellId:3,completed:true}]];
  const selected=mergeClientSession(merged.slots,current,champions,{autoArrange:false,autoParty:false}).slots;
  const [fixed]=recommend(input(selected,current,{scope:'solo',soloRole:'bottom',soloChampion:'Jinx'}));
  assert.deepEqual(fixed.targets,[]);assert.equal(fixed.analysis.known,5);assert.equal(fixed.slots.find(s=>s.role==='bottom').champion,'Jinx');
 }
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
 assert.equal(normalized.find(s=>s.role==='bottom').champion,null);assert.equal(normalized.find(s=>s.role==='support').champion,null);
});

test('solo recommendations with an unknown own lane ignore public blind-pick hovers across lane recursion',()=>{
 const current=session();current.myTeam.forEach(p=>p.assignedPosition='');current.myTeam[4].championPickIntent=key('Nami');
 const slots=merge(saved(),current),before=structuredClone(slots);
 const results=recommend(input(slots,current,{scope:'solo',soloRole:'',pool:[],poolMode:'off',limit:6}));
 assert.equal(results.length,6);assert.equal(new Set(results.slice(0,4).map(r=>r.soloRole)).size,4);
 for(const result of results){
  assert.deepEqual(result.targets,[result.soloRole]);assert.equal(result.analysis.known,1);
  assert.equal(result.slots.some(s=>s.publicIntent),false);
 }
 assert.deepEqual(slots,before);
});
