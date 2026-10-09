import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getBuild,validateRunePage} from '../src/core/builds.mjs';
import {matchupPreparation,selectMatchupPreparation,MATCHUP_PRESSURE_GROUPS} from '../src/core/matchup-preparation.mjs';
import {matchupPreparationView} from '../src/matchup-preparation-view.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id);
const args=(id,role,targetId)=>({data,selection:{id,role,mode:'rift'},enemyIds:[targetId],targetId,publicContext:'fixture:game:1520'});

test('pressure rules reference real champion IDs and a public LeBlanc reaches its full-page tradeoffs',()=>{
 for(const ids of Object.values(MATCHUP_PRESSURE_GROUPS))for(const id of ids.split(' '))assert.ok(hero(id),`Unknown opponent ${id}`);
 const model=matchupPreparation(args('Ahri','mid','Leblanc'));
 assert.equal(model.enemy.id,'Leblanc');
 assert.ok(model.runes.some(o=>o.matched&&o.page.selectedPerkIds.includes(8473)));
 assert.ok(model.runes.some(o=>o.matched&&o.page.selectedPerkIds[0]===8112));
 assert.ok(model.cores.some(o=>o.title==='带中娅的核心路线'&&o.items.some(i=>Number(i.id)===3157)));
});

test('continuous damage is not evidence of healing pressure; dedicated healers retain conditional grievous-wound comparisons',()=>{
 for(const [own,role] of [['Rammus','jungle'],['Malphite','top'],['Shen','top'],['Ornn','top'],['Zac','jungle'],['Chogath','top']]){
  for(const enemy of ['Jax','Vayne']){
   const model=matchupPreparation(args(own,role,enemy));assert.ok(model);
   assert.ok(model.cores.every(o=>o.title!=='带重伤的核心路线'),`${own} vs ${enemy}: damage tags cannot imply healing`);
  }
 }
 const healer=matchupPreparation(args('Rammus','jungle','Soraka'));
 const grievous=healer.cores.find(o=>o.title==='带重伤的核心路线'&&o.items.some(i=>Number(i.id)===3075));assert.ok(grievous);
 assert.match(grievous.why,/实际回复/);assert.match(grievous.cost,/实际施加/);
});

test('public selected opponents lead to actual legal full pages and complete source cores for each representative role',()=>{
 for(const [id,role,enemy] of [['Ahri','mid','Zed'],['Nautilus','support','Morgana'],['Jinx','bottom','Nautilus'],['Ezreal','bottom','Caitlyn'],['Aatrox','top','Fiora'],['LeeSin','jungle','Khazix']]){
  const input=args(id,role,enemy),model=matchupPreparation(input),b=getBuild(hero(id),role,data,input.selection);assert.ok(model.runes.length);assert.ok(model.cores.length);
  assert.equal(model.role,role);assert.equal(model.enemy.id,enemy);assert.deepEqual(model.current.page,b.runePage);
  for(const option of model.runes){assert.equal(validateRunePage(option.page,data.runes),true);assert.equal(option.page.selectedPerkIds.length,9);assert.deepEqual(option.page,b.runeOptions.find(o=>o.id===option.id).page);assert.ok(option.triggers.length);assert.ok(option.cost);assert.equal(option.winRate,undefined);}
  for(const option of model.cores){assert.deepEqual(option.items.map(i=>Number(i.id)),b.reference.core[option.index].items);assert.equal(option.items.length,3);assert.ok(option.items.every(i=>i.maps['11']));assert.ok(option.cost);}
  const html=matchupPreparationView(model,data);assert.match(html,/data-matchup-build/);assert.match(html,/六枚符文与三枚属性碎片/);assert.match(html,/不是针对所选对手的样本/);assert.match(html,/data-action="matchup-rune"/);assert.doesNotMatch(html,/\[object Object\]/);
 }
 const ahri=matchupPreparation(args('Ahri','mid','Zed'));assert.ok(ahri.runes[0].page.selectedPerkIds.includes(8473));assert.ok(ahri.cores[0].items.some(i=>Number(i.id)===3157));
 const naut=matchupPreparation(args('Nautilus','support','Morgana'));assert.equal(naut.runes[0].page.selectedPerkIds[0],8465);assert.ok(naut.cores.some(o=>o.items.some(i=>Number(i.id)===3222)));
 const jinx=matchupPreparation(args('Jinx','bottom','Nautilus'));assert.equal(jinx.runes[0].page.selectedPerkIds[0],8021);assert.match(jinx.runes[0].cost,/不能解除/);
 const ez=matchupPreparation(args('Ezreal','bottom','Caitlyn'));assert.ok(ez.cores.some(o=>o.items.some(i=>Number(i.id)===3110)));assert.ok(ez.runes.every(o=>o.page.selectedPerkIds[0]!==8021));
});

test('an explicit complete-page or core selection propagates into reusable preparations and guide without an opponent history',()=>{
 const input=args('Ahri','mid','Zed'),model=matchupPreparation(input),choice=model.runes[0];
 const selected=selectMatchupPreparation({...input,context:model.context,kind:'rune',id:choice.id}),store=createPreparationStore();store.remember(selected);
 const remembered=store.recall(selected),b=getBuild(hero('Ahri'),'mid',data,remembered);assert.deepEqual(b.runePage.selectedPerkIds,choice.page.selectedPerkIds);assert.equal(remembered.enemyId,undefined);assert.equal(remembered.targetId,undefined);
 const selectedModel=matchupPreparation({...input,selection:remembered});assert.ok(selectedModel.runes.some(o=>o.id===choice.id&&o.selected));assert.match(matchupPreparationView(selectedModel,data),/当前已选完整符文/);
 let guide=createGuideModel(data,selectGuide(null,remembered));assert.deepEqual(guide.runes.map(r=>r.id),choice.page.selectedPerkIds);
 const nextInput={...input,selection:remembered},nextModel=matchupPreparation(nextInput),core=nextModel.cores.find(o=>!o.selected);assert.ok(core);
 const next=selectMatchupPreparation({...nextInput,context:nextModel.context,kind:'core',id:core.id});assert.equal(next.runeId,choice.id);assert.deepEqual(next.laterIds,[]);assert.equal(next.coreId,core.id);
 guide=createGuideModel(data,selectGuide(null,next));assert.deepEqual(guide.route.slice(0,3).map(i=>Number(i.id)),core.items.map(i=>Number(i.id)));assert.deepEqual(guide.runes.map(r=>r.id),choice.page.selectedPerkIds);
});

test('stale public opponents, own hero/position, source, current choice and game context cannot apply a previous candidate',()=>{
 const input=args('Ahri','mid','Zed'),model=matchupPreparation(input),request={...input,context:model.context,kind:'rune',id:model.runes[0].id};
 for(const change of [{enemyIds:[]},{enemyIds:['Ahri'],targetId:'Ahri'},{selection:{id:'Lux',role:'mid',mode:'rift'}},{selection:{id:'Ahri',role:'top',mode:'rift'}},{publicContext:'fixture:game:1521'},{data:{...data,version:'16.20.2'}},{data:{...data,buildSource:{region:'na',tier:'gold'}}},{selection:{...input.selection,runeId:model.runes[0].id}}])assert.throws(()=>selectMatchupPreparation({...request,...change}),/已变化/);
 assert.throws(()=>selectMatchupPreparation({...request,id:'removed-page'}),/已变化/);assert.throws(()=>selectMatchupPreparation({...request,kind:'unknown'}),/已变化/);
 assert.equal(matchupPreparation({...input,targetId:''}),null);assert.equal(matchupPreparation({...input,enemyIds:['Morgana']}),null);assert.equal(matchupPreparation({...input,selection:{...input.selection,mode:'hex'}}),null);
 assert.equal(matchupPreparationView(null,data),'');
});

test('all stored role records use only their own legal pages and exact selected source cores',()=>{
 let checked=0;
 for(const ref of Object.values(data.builds)){
  const input=args(ref.champion,ref.role,'Morgana'),model=matchupPreparation(input),b=getBuild(hero(ref.champion),ref.role,data,input.selection);assert.ok(model);checked++;
  for(const option of model.runes){assert.ok(b.runeOptions.some(o=>o.id===option.id));assert.equal(validateRunePage(option.page,data.runes),true);}
  for(const option of model.cores){assert.equal(option.items.map(i=>Number(i.id)).join('-'),b.reference.core[option.index].items.join('-'));assert.ok(option.items.every(i=>i.maps['11']));}
 }
 assert.ok(checked>=300,'Expected every stored champion-role record');
});

test('a missing selected source cannot borrow another region or tier and old versions retain their actual labels',()=>{
 const input=args('Ahri','mid','Zed'),missing=matchupPreparation({...input,data:{...data,buildSource:{region:'kr',tier:'diamond_plus'}}});
 assert.deepEqual(missing.cores,[]);assert.ok(missing.runes.every(o=>o.source.kind==='机制完整页'));
 const oldData={...data,version:'17.1.1',patch:'17.1'},old=matchupPreparation({...input,data:oldData});assert.equal(old.stale,true);assert.ok(old.cores.length);assert.ok(old.cores.every(o=>o.source.patch==='16.20'));
 assert.match(matchupPreparationView(old,oldData),/与当前资料不同/);assert.match(matchupPreparationView(old,oldData),/OP.GG · 16\.20/);
});

test('switching a special loadout to a source core previews its resulting page and preserves the chosen hero position',()=>{
 const input=args('Nautilus','support','Morgana');input.selection={...input.selection,loadoutId:'tank-engage',laterIds:[3110]};
 const model=matchupPreparation(input),core=model.cores[0];assert.ok(core.switchesLoadout);assert.equal(core.page.selectedPerkIds.length,9);assert.match(matchupPreparationView(model,data),/将切换到常规位置配置/);
 const next=selectMatchupPreparation({...input,context:model.context,kind:'core',id:core.id}),b=getBuild(hero('Nautilus'),'support',data,next);
 assert.equal(next.id,'Nautilus');assert.equal(next.role,'support');assert.equal(b.loadoutId,'default');assert.deepEqual(b.runePage.selectedPerkIds,core.page.selectedPerkIds);assert.equal(b.selectedCoreId,core.id);assert.deepEqual(next.laterIds,[]);
});

test('Garen can compare current Stormraider pages against the five mechanisms without automatic configuration changes',()=>{
 const cases=[['Jax',/反击风暴/,/闪避/],['Tryndamere',/R 免死/,/R 免死/],['Vayne',/隐身/,/真实伤害/],['Renekton',/强化 W/,/破坏护盾/],['Tristana',/E 炸弹/,/W 刷新/]];
 for(const [enemyId,runeCondition,equipmentCondition] of cases){
  const input=args('Garen','top',enemyId),before=structuredClone(input.selection),build=getBuild(hero('Garen'),'top',data,input.selection),model=matchupPreparation({...input,build});
  assert.deepEqual(input.selection,before);assert.deepEqual(model.current.page,build.runePage);assert.equal(model.runes[0].page.selectedPerkIds[0],8230);assert.equal(model.runes[0].matched,true);assert.equal(model.runes[0].selected,false);
  for(const row of model.runes){assert.equal(validateRunePage(row.page,data.runes),true);assert.ok(build.runeOptions.some(o=>o.id===row.id));assert.match(row.triggers.join(' '),runeCondition);}
  for(const row of model.cores)assert.match(row.cost,equipmentCondition);
  const choice=model.runes[0],selected=selectMatchupPreparation({...input,context:model.context,kind:'rune',id:choice.id}),guide=createGuideModel(data,selectGuide(null,selected));
  assert.deepEqual(guide.runes.map(r=>r.id),choice.page.selectedPerkIds);assert.equal(selected.role,'top');assert.equal(selected.threatId,undefined);
  const html=matchupPreparationView(model,data,{compact:true});assert.match(html,/风暴掠袭者的狂涌/);assert.match(html,runeCondition);assert.match(html,equipmentCondition);assert.match(html,/不是针对所选对手的样本/);
 }
});

test('the legacy PhaseRush key uses the current Stormraider damage threshold from Riot data',()=>{
 const rune=data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes)).find(r=>r.id===8230);
 assert.equal(rune.name,'风暴掠袭者的狂涌');assert.match(rune.longDesc,/3秒/);assert.match(rune.longDesc,/25%/);
 const model=matchupPreparation(args('Garen','top','Jax')),choice=model.runes.find(o=>o.page.selectedPerkIds[0]===8230);
 assert.ok(choice);assert.match(choice.triggers.join(' '),/3 秒.*25% 最大生命值/);assert.match(choice.cost,/无法安全达标就不能依赖加速/);
 assert.doesNotMatch(choice.triggers.join(' '),/独立攻击或技能/);
});

test('real Q healing is distinct from invulnerability and bonus health when comparing these opponents',()=>{
 for(const enemyId of ['Tryndamere','Renekton']){
  assert.ok(MATCHUP_PRESSURE_GROUPS.healing.split(' ').includes(enemyId));
  const model=matchupPreparation(args('Garen','top',enemyId)),row=model.cores.find(o=>o.title==='带重伤的核心路线');assert.ok(row);assert.match(row.why,/实际回复/);assert.match(row.cost,enemyId==='Tryndamere'?/不能解除 R 免死/:/重伤不削减 R 增加的生命/);
 }
 for(const enemyId of ['Jax','Vayne','Tristana'])assert.ok(!MATCHUP_PRESSURE_GROUPS.healing.split(' ').includes(enemyId));
});
