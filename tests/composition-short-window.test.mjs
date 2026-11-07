import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import {profile} from '../src/core/rules.mjs';
import {compositionFit} from '../src/core/composition-fit.mjs';

const member=(role,champion,p={},range=550)=>({role,champion,c:{id:champion,name:champion,stats:{attackrange:range}},p:{reviewed:true,roles:[role],build:'mage',damageWeights:{ad:0,ap:1},window:{kind:'base'},...p}});
const guard=()=>member('support','Guard',{build:'enchanter',peel:true});
const damagePoints=fit=>fit.breakdown.find(row=>row.key==='damage').points;

test('a mage can execute a covered short window without being relabelled sustained output',()=>{
 const output=member('mid','WindowMage'),protector=guard();
 const fit=compositionFit({members:[output,protector]});
 assert.equal(fit.tactic.id,'covered-window');
 assert.match(fit.tactic.name,/技能空档退出/);
 assert.match(fit.relationships[0].kind,/短轮/);
 assert.equal(output.p.sustain,undefined);
 assert.ok(fit.score>=60&&fit.score<100);
 assert.ok(fit.score>compositionFit({members:[output,member('support','OtherMage')]}).score);
});

test('two-player damage responsibility does not reward incidental opposite-type support damage',()=>{
 const protector=guard(),physical=member('mid','Physical',{sustain:true,damageWeights:{ad:1,ap:0}});
 const magical={...physical,p:{...physical.p,damageWeights:{ad:0,ap:1}}};
 const a=compositionFit({members:[physical,protector]}),b=compositionFit({members:[magical,protector]});
 assert.equal(damagePoints(a),10);
 assert.equal(damagePoints(b),10);
 assert.equal(a.rawScore,b.rawScore);
 const tank=member('top','Tank',{build:'tank',frontline:true},125);
 const noOutput=compositionFit({members:[tank,protector]});
 assert.equal(damagePoints(noOutput),0);
 assert.notEqual(noOutput.tactic.id,'covered-window');
 assert.ok(noOutput.gaps.some(gap=>gap.includes('缺少能接控制兑现伤害')));
});

test('the real Viktor and Zilean profiles retain their roles and receive a conditional window',()=>{
 const members=[['mid','Viktor'],['support','Zilean']].map(([role,id])=>{
  const c=game.champions.find(hero=>hero.id===id);return {role,champion:id,c,p:profile(c,role)};
 });
 const fit=compositionFit({members});
 assert.equal(fit.tactic.id,'covered-window');
 assert.ok(fit.score>=60);
 assert.ok(members.every(m=>!m.p.sustain));
 assert.ok(!fit.relationships[0].sourceUrls,'generic jobs must not acquire authored-mechanism evidence');
});

test('an assassin is neither excluded by class nor granted entry by a protector',()=>{
 const melee=member('jungle','MeleeAssassin',{build:'apAssassin'},125);
 assert.notEqual(compositionFit({members:[melee,guard()]}).tactic.id,'covered-window');
 for(const output of [{...melee,p:{...melee.p,engage:true}},{...melee,c:{...melee.c,stats:{attackrange:550}}}]){
  const fit=compositionFit({members:[output,guard()]});
  assert.ok(fit.relationships.some(link=>link.kind==='短轮输出与接应'));
 }
});

test('extra teammates contribute by their jobs and a single guard cannot cover a whole damage stack',()=>{
 const output=member('mid','Window'),support=guard(),extra=member('top','OtherWindow');
 const crowded=compositionFit({members:[output,support,extra]});
 const covered=compositionFit({members:[output,support,{...extra,p:{...extra.p,build:'tank',frontline:true}}]});
 assert.equal(crowded.tactic.id,'covered-window');
 assert.equal(covered.tactic.id,'covered-window');
 assert.ok(covered.tactic.quality>crowded.tactic.quality);
 assert.ok(crowded.gaps.some(gap=>gap.includes('持续输出缺口')));
 const full=[output,support,extra,member('jungle','Fourth'),member('bottom','Fifth')];
 const fit=compositionFit({members:full});
 assert.ok(fit.tactic.quality<.6);
 assert.ok(fit.gaps.some(gap=>gap.includes('持续输出缺口')));
});

test('generic coverage cannot replace a skill-conditional tactic with its own evidence',()=>{
 const members=[member('mid','Window'),guard()];
 const tacticEvidence={mechanicLabel:'控制接驻留力场',step:'实际禁锢后，目标仍须驻留足够时间。'};
 const graph={edge:()=>null,mechanics:{match:()=>({relation:{quality:.79,label:'控制接驻留力场',evidence:{}},tactic:{tactic:.49,evidence:tacticEvidence}})}};
 const fit=compositionFit({members},graph);
 assert.equal(fit.tactic.id,'conditional-mechanics');
 assert.equal(fit.tactic.quality,.49);
 assert.deepEqual(fit.tacticEvidence,tacticEvidence);
 assert.equal(fit.rawScore,compositionFit({members},graph,{details:false}).rawScore);
});

test('larger groups retain mixed-damage requirements and unknown-member ceilings',()=>{
 const rows=[member('mid','Window'),guard(),member('top','Front',{build:'tank',frontline:true},125)];
 const mono=compositionFit({members:rows});
 const mixed=compositionFit({members:rows.map(m=>m.role==='mid'?{...m,p:{...m.p,damageWeights:{ad:1,ap:0}}}:m)});
 assert.ok(damagePoints(mixed)>damagePoints(mono));
 assert.ok(mono.gaps.some(gap=>gap.includes('伤害类型明显集中')));
 const unknown=compositionFit({members:[...rows,{role:'jungle',champion:'Unknown',p:{reviewed:false}}]});
 assert.ok(unknown.score<mono.score);
 assert.equal(unknown.known,3);
 assert.equal(unknown.size,4);
});

test('scalar caches include window eligibility and scoring agrees with detailed and reordered paths',()=>{
 const output=member('mid','Changing',{},125),members=[output,guard()],graph={edge:()=>null,fitCache:new Map()};
 const before=compositionFit({members},graph,{details:false});
 output.c.stats.attackrange=550;
 const after=compositionFit({members},graph,{details:false});
 assert.ok(after.rawScore>before.rawScore);
 assert.deepEqual(after,compositionFit({members},{...graph,fitCache:null},{details:false}));
 const detailed=compositionFit({members},graph);
 assert.equal(after.rawScore,detailed.rawScore);
 assert.deepEqual(detailed,compositionFit({members:[...members].reverse()},graph));
 assert.equal(detailed.score,detailed.breakdown.reduce((sum,row)=>sum+row.points,0));
});
