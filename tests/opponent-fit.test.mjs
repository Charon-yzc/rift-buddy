import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend,replaceMember} from '../src/core/recommend.mjs';
import {recommendationKey} from '../src/core/preparation.mjs';
import {opponentFitView} from '../src/opponent-fit-view.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';

const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
const input=(role,heroes)=>({slots:createSlots().map(s=>({...s,party:s.role===role})),champions:data.champions,scope:'solo',soloRole:role,style:'balanced',rolePools:{[role]:{mode:'only',heroes}},limit:heroes.length});
const picked=(row,role)=>row.slots.find(s=>s.role===role).champion;

test('a lone mid pick is evaluated for its role rather than completing an unknown whole team',()=>{
 const rows=recommend(input('mid',['Galio','Ahri','Lux','Cassiopeia']));
 const galio=rows.find(row=>picked(row,'mid')==='Galio'),ahri=rows.find(row=>picked(row,'mid')==='Ahri');
 assert.ok(galio.score-ahri.score<10,'Whole-team coverage must not dominate an otherwise eligible solo lane');
 assert.ok(rows.every(row=>row.reasonPoints.some(point=>point.includes('暂不判断全队短板'))));
 assert.ok(rows.every(row=>!row.reasonPoints.some(point=>point.startsWith('短板：'))));
});

test('a single public enemy affects single-player scores with no allies known',()=>{
 const base=input('top',['Gwen','Malphite','Mordekaiser','Aatrox']);
 const plain=recommend(base),versusFrontline=recommend({...base,visibleEnemies:['Sion']});
 const original=new Map(plain.map(row=>[picked(row,'top'),row.score]));
 const gwen=versusFrontline.find(row=>picked(row,'top')==='Gwen'),malphite=versusFrontline.find(row=>picked(row,'top')==='Malphite');
 assert.ok(gwen.score>original.get('Gwen'));
 assert.equal(malphite.score,original.get('Malphite'));
 assert.equal(gwen.score-original.get('Gwen'),gwen.opponentFit.adjustment);
 assert.deepEqual(gwen.opponentFit.factors[0].enemies,['Sion']);
 assert.deepEqual(gwen.opponentFit.factors[0].heroes,['Gwen']);
 assert.ok(gwen.reasonPoints.some(point=>point.includes('赛恩')));
 const unknown=recommend({...base,visibleEnemies:['Unknown',null]});
 assert.deepEqual(unknown.map(row=>[picked(row,'top'),row.score]),plain.map(row=>[picked(row,'top'),row.score]));
 assert.ok(unknown.every(row=>row.opponentFit.count===0));
});

test('mirror eligibility is independent of visible-enemy fit and survives replacement',()=>{
 const base=input('mid',['Galio','Annie','Lux']);
 const mirror=recommend({...base,visibleEnemies:['Galio','Galio',null,'Unknown']});
 assert.ok(mirror.some(row=>picked(row,'mid')==='Galio'));
 assert.ok(mirror.every(row=>row.opponentFit.count===1));
 const noMirror=recommend({...base,enemy:['Galio'],visibleEnemies:['Galio']});
 assert.ok(noMirror.every(row=>picked(row,'mid')!=='Galio'));
 for(const row of noMirror){
  const same=mirror.find(other=>picked(other,'mid')===picked(row,'mid'));
  assert.equal(row.score,same.score);
  assert.deepEqual(row.opponentFit,same.opponentFit);
 }
 const changed=replaceMember(mirror[0],'mid',{...base,visibleEnemies:['Galio']});
 assert.ok(changed.length&&changed.every(row=>row.opponentFit.enemies[0].id==='Galio'));
 const legacy=recommend({...base,enemy:['Galio']});
 assert.deepEqual(legacy.map(row=>[picked(row,'mid'),row.score]),noMirror.map(row=>[picked(row,'mid'),row.score]));
});

test('enemy mechanism changes alter relative ordering rather than just explanatory text',()=>{
 const heroes=['Annie','Lux','Galio','Gragas','Diana','Yasuo','Cassiopeia','Lissandra','Azir','Seraphine'];
 const base=input('mid',heroes);
 const frontline=recommend({...base,visibleEnemies:['DrMundo','Chogath','Garen']});
 const engage=recommend({...base,visibleEnemies:['Ashe','Hecarim','Fiddlesticks']});
 const ids=rows=>rows.map(row=>picked(row,'mid'));
 assert.notDeepEqual(ids(frontline),ids(engage));
 const cassio=frontline.find(row=>picked(row,'mid')==='Cassiopeia');
 assert.ok(cassio.opponentFit.factors.some(f=>f.id==='damage-frontline'));
 const galio=engage.find(row=>picked(row,'mid')==='Galio');
 assert.ok(galio.opponentFit.factors.some(f=>f.id==='guard-engage'));
});

test('pool, manual positions and fixed selections remain authoritative with opponents',()=>{
 const base=input('top',['Gwen','Malphite']);
 const own=base.slots.find(s=>s.role==='mid');Object.assign(own,{champion:'Ahri',locked:true,manualPosition:true});
 const rows=recommend({...base,visibleEnemies:['Sion'],excluded:['Malphite']});
 assert.equal(rows.length,1);assert.equal(picked(rows[0],'top'),'Gwen');
 assert.deepEqual(rows[0].slots.find(s=>s.role==='mid'),own);
 const signature=recommendationKey(base);
 assert.notEqual(signature,recommendationKey({...base,visibleEnemies:['Sion']}));
 assert.notEqual(recommendationKey({...base,visibleEnemies:['Sion']}),recommendationKey({...base,visibleEnemies:[]}));
 assert.notEqual(recommendationKey({...base,visibleEnemies:['Sion']}),recommendationKey({...base,visibleEnemies:['Sion'],enemy:['Sion']}));
});

test('cards and details explain the factors used by scoring without inventing a lane matchup',()=>{
 const row=recommend({...input('top',['Gwen']),visibleEnemies:['Sion']})[0];
 for(const html of [renderResultCard(row,0,data,{favorites:[],preferences:{}}),resultPlayCard(row,0,data)]){
  assert.ok(html.includes('data-opponent-fit'));assert.ok(html.includes('赛恩'));assert.ok(html.includes('持续输出'));
  assert.ok(html.includes('敌方分路、出装和技能状态未确认'));
 }
 assert.equal(opponentFitView(recommend(input('top',['Gwen']))[0].opponentFit),'');
 assert.ok(row.reasonPoints.length<=5);
 assert.ok(!row.opponentFit.factors.some(f=>/对线胜率|必赢|克制|counter/i.test(f.note)));
 assert.ok(row.opponentFit.adjustment<=12);
});
