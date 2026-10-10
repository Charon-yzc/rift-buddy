import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots} from '../src/core/recommend.mjs';
import {TRIOS} from '../src/core/rules.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {createRoomService} from '../services/room.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {fillSkillOrder} from '../src/core/skill-advice.mjs';
import {captureRoomStrategy,captureRoomConfigurations,roomPreparation,roomPlayerRole} from '../src/core/room-configuration.mjs';
import {sanitizeRoomConfiguration,sanitizeShare,encodeFrame,decodeFrame,MAX_FRAME} from '../src/core/room.mjs';
import {roomConfigurationDialog,roomConfigurationText} from '../src/room-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;
const slots=createSlots();for(const [role,champion]of [['jungle','Diana'],['mid','Yasuo'],['support','Rakan']])slots.find(s=>s.role===role).champion=champion;
const store=createPreparationStore();

const ownClient=(champion='Yasuo',assignedPosition='mid')=>({connected:true,session:{localPlayerCellId:4,myTeam:[{cellId:4,championId:champion?data.champions.find(c=>c.id===champion).key:0,assignedPosition}]}});
test('a current local champion overrides a stale saved solo role in room sharing',()=>{
 assert.equal(roomPlayerRole(slots,data.champions,ownClient(),'support'),'mid');
 assert.equal(roomPlayerRole(slots,data.champions,ownClient(),'bottom'),'mid');
});
test('a manually moved local champion keeps its chosen position in room sharing',()=>{
 const moved=slots.map(s=>({...s,champion:s.role==='top'?'Yasuo':s.role==='mid'?null:s.champion,...(s.role==='top'?{manualPosition:true,clientCellId:4}:{})}));
 assert.equal(roomPlayerRole(moved,data.champions,ownClient(),'bottom'),'top');
});
test('a known local champion absent from the lineup cannot borrow the saved solo role',()=>{
 assert.equal(roomPlayerRole(slots,data.champions,ownClient('Ashe','bottom'),'support'),'');
 const unknownPosition=slots.map(s=>({...s,...(s.champion==='Yasuo'?{clientCellId:4}:{})}));
 assert.equal(roomPlayerRole(unknownPosition,data.champions,ownClient('Yasuo',''),'support'),'');
});
test('before the local pick, room sharing uses the current assigned or manual slot and never another cell',()=>{
 assert.equal(roomPlayerRole(slots,data.champions,ownClient(null),'support'),'mid');
 const occupied=slots.map(s=>({...s,...(s.role==='mid'?{clientCellId:9}:{})}));
 assert.equal(roomPlayerRole(occupied,data.champions,ownClient(null),'support'),'');
 const manual=slots.map(s=>({...s,...(s.role==='support'?{clientCellId:4,manualPosition:true}:{})}));
 assert.equal(roomPlayerRole(manual,data.champions,ownClient(null),'bottom'),'support');
});
test('offline room sharing keeps the explicit local role and ignores a disconnected client session',()=>{
 assert.equal(roomPlayerRole(slots,data.champions,{...ownClient(),connected:false},'support'),'support');
 assert.equal(roomPlayerRole(slots,data.champions,null,''),'');
});

test('a directly loaded catalog duo freezes its public instructions and exact recommended runes',()=>{
 const team=createSlots().map(s=>({...s,champion:s.role==='bottom'?'Seraphine':s.role==='support'?'Sona':null}));
 const plan=captureRoomStrategy(team,data);assert.equal(plan.curated.id,'double-song');assert.equal(plan.members.length,2);
 const config=captureRoomConfigurations(team,data,createPreparationStore(),{creativePlan:plan}).find(c=>c.champion==='Seraphine');
 const next=getBuild(data.champions.find(c=>c.id==='Seraphine'),'bottom',data,roomPreparation(config,data,plan));
 assert.deepEqual(next.runePage.selectedPerkIds,config.runes.selectedPerkIds);assert.equal(next.combo.creativePlan.curated.id,'double-song');
 assert.equal(captureRoomStrategy(team,data,plan,'hex'),null);
});

test('shared concrete trio configurations preserve selected runes, skill levels and spells across a wire round trip',()=>{
 const champion=data.champions.find(c=>c.id==='Diana'),base=getBuild(champion,'jungle',data,{mode:'rift'});
 const page=base.runeOptions.at(-1).page,skill=fillSkillOrder(base.skillChoices.at(-1).order,'Diana');
 const chosen={id:'Diana',role:'jungle',mode:'rift',customRunePage:{...page,patch:data.patch},customSkillOrder:{order:skill,patch:data.patch},summonerIds:['SummonerSmite','SummonerFlash']};
 store.remember(chosen);
 const configs=captureRoomConfigurations(slots,data,store),diana=configs.find(c=>c.champion==='Diana');
 assert.equal(configs.length,3);assert.deepEqual(diana.runes.selectedPerkIds,page.selectedPerkIds);assert.equal(diana.skills,skill);assert.deepEqual(diana.spells,chosen.summonerIds);
 const dirty={kind:'state',v:1,from:'队友',at:1,lineup:slots,configurations:configs.map(c=>({...c,riotId:'private',auth:'secret'})),auth:'secret'};
 const wire=encodeFrame(sanitizeShare(dirty)),received=sanitizeShare(decodeFrame(wire));
 assert.deepEqual(received.configurations,configs);assert(!wire.includes('private')&&!wire.includes('secret'));
 const next=roomPreparation(received.configurations.find(c=>c.champion==='Diana'),data);
 const local=getBuild(champion,'jungle',data,next);
 assert.deepEqual(local.runePage.selectedPerkIds,page.selectedPerkIds);assert.equal(local.skillOrder,skill);assert.deepEqual(local.summoners,chosen.summonerIds);
 const html=roomConfigurationDialog(diana,data,'<队友>'),text=roomConfigurationText(diana,data,'队友');
 for(const id of page.selectedPerkIds)assert(html.includes('#'+id));
 assert(html.includes('&lt;队友&gt;')&&!html.includes('<队友>'));assert(html.includes('data-action="room-adopt-configuration"'));
 assert.equal((html.match(/<li>/g)||[]).length,18);assert(text.includes('18级')&&text.includes('发送方配置快照'));
});

test('untrusted configurations are bounded, role-bound and cannot substitute unknown or old runes',()=>{
 const c=captureRoomConfigurations(slots,data,store)[0];assert(c);
 for(const bad of [null,[],{...c,patch:[data.patch]},{...c,items:Array(8).fill(1001)},{...c,spells:['SummonerFlash','SummonerFlash']},{...c,runes:{...c.runes,selectedPerkIds:[1]}}])assert.equal(sanitizeRoomConfiguration(bad),null);
 const frame={kind:'state',v:1,from:'甲',at:1,lineup:slots,configurations:[c]};
 assert.equal(sanitizeShare({...frame,configurations:[c,c]}),null);assert.equal(sanitizeShare({...frame,configurations:[{...c,champion:'Garen'}]}),null);
 assert.throws(()=>roomPreparation({...c,patch:'25.1'},data),/版本不一致/);
 assert.throws(()=>roomPreparation({...c,runes:{...c.runes,selectedPerkIds:Array(9).fill(99999)}},data),/不可用/);
 const legacy=sanitizeShare({...frame,configurations:undefined});assert(!Object.hasOwn(legacy,'configurations'));
 assert.equal(encodeFrame({text:'中'.repeat(Math.ceil(MAX_FRAME/3))}),null);
});

test('a late room member receives the original accepted trio, concrete configurations and all saved stages over loopback',async()=>{
 const trio=TRIOS.find(t=>t.members.some(m=>m.champion==='Orianna')),team=createSlots().map(s=>({...s,champion:trio.members.find(m=>m.role===s.role)?.champion||null,party:trio.members.some(m=>m.role===s.role)}));
 const strategy=captureCreativePlan({trio,slots:team,scope:'party'},data),configs=captureRoomConfigurations(team,data,createPreparationStore(),{creativePlan:strategy});
 const a=createRoomService({nick:'房主',listenHost:'127.0.0.1',discovery:false}),b=createRoomService({nick:'客人',listenHost:'127.0.0.1',discovery:false});
 try{
  const address=await a.host();a.publish({lineup:team,configurations:configs,strategy:{...strategy,riotId:'private',auth:'secret'}});
  await b.join({host:'127.0.0.1',port:address.port,room:address.room,pin:address.pin});
  let received;for(let i=0;i<50;i++){received=b.snapshot().members.find(m=>m.nick==='房主')?.share;if(received?.strategy)break;await new Promise(r=>setTimeout(r,20));}
  assert.deepEqual(received.strategy,strategy);assert.deepEqual(received.configurations,configs);assert(!JSON.stringify(received).includes('secret'));
  for(const config of configs){const selected=roomPreparation(config,data,received.strategy),build=getBuild(data.champions.find(c=>c.id===config.champion),config.role,data,selected);assert.equal(build.combo.creativePlan.id,strategy.id);assert.equal(build.combo.ownJob,strategy.ordered.find(m=>m.role===config.role).job);const html=roomConfigurationDialog(config,data,'房主',received.strategy);assert(html.includes('data-duo-stage="key"'));assert(html.includes('data-duo-stage="later"'));}
 }finally{a.dispose();b.dispose();}
});

test('clearing an accepted trio member publishes the current lineup and can restore the original plan',async()=>{
 const trio=TRIOS.find(t=>t.id==='ball-delivery'),team=createSlots().map(s=>({...s,champion:trio.members.find(m=>m.role===s.role)?.champion||null,party:trio.members.some(m=>m.role===s.role)}));
 const original=captureCreativePlan({trio,slots:team,scope:'party'},data),before=JSON.stringify(original);
 const a=createRoomService({nick:'房主',listenHost:'127.0.0.1',discovery:false}),b=createRoomService({nick:'客人',listenHost:'127.0.0.1',discovery:false});
 const publish=lineup=>{const strategy=captureRoomStrategy(lineup,data,original);a.publish({lineup,configurations:captureRoomConfigurations(lineup,data,createPreparationStore(),{creativePlan:strategy}),...(strategy?{strategy}:{})});return strategy;};
 const received=async predicate=>{for(let i=0;i<50;i++){const share=b.snapshot().members.find(m=>m.nick==='房主')?.share;if(predicate(share))return share;await new Promise(r=>setTimeout(r,20));}assert.fail('current lineup did not reach the room');};
 try{
  const address=await a.host();publish(team);await b.join({host:'127.0.0.1',port:address.port,room:address.room,pin:address.pin});await received(s=>s?.strategy?.id===original.id);
  for(const member of original.members){
   const partial=team.map(s=>s.role===member.role?{...s,champion:null}:s);assert.equal(publish(partial),null);
   const share=await received(s=>s?.lineup.find(p=>p.role===member.role)?.champion===null);
   assert(!share.strategy);assert.equal(share.configurations.length,2);assert(!share.configurations.some(c=>c.role===member.role));
   assert.equal(publish(team).id,original.id);await received(s=>s?.strategy?.id===original.id);
  }
  const empty=team.map(s=>({...s,champion:null}));assert.equal(publish(empty),null);
  const cleared=await received(s=>s?.lineup.every(p=>p.champion===null));assert(!cleared.strategy);assert.deepEqual(cleared.configurations,[]);
  assert.equal(publish(team).id,original.id);await received(s=>s?.strategy?.id===original.id);
  assert.equal(JSON.stringify(original),before,'sharing must preserve the local restorable plan');
 }finally{a.dispose();b.dispose();}
});

test('an open build overrides a shared configuration only in the same mode and combination context',()=>{
 const team=createSlots().map(s=>({...s,champion:s.role==='mid'?'Ahri':null})),champion=data.champions.find(c=>c.id==='Ahri'),empty=createPreparationStore();
 const base=getBuild(champion,'mid',data,{mode:'rift'}),page=base.runeOptions.at(-1).page;
 const current={id:'Ahri',role:'mid',mode:'rift',customRunePage:{...page,patch:data.patch},summonerIds:['SummonerFlash','SummonerBarrier']};
 const capture=(mode,selection)=>captureRoomConfigurations(team,data,empty,{mode,current:selection})[0];
 assert.equal(capture('hex',current).mode,'hex');assert.equal(capture('hex',current).runes,null);
 const rift=capture('rift',{...current,mode:'hex'});assert.equal(rift.mode,'rift');assert(rift.runes);
 const matched=capture('rift',current);assert.deepEqual(matched.runes.selectedPerkIds,page.selectedPerkIds);assert.deepEqual(matched.spells,current.summonerIds);
 const wrongCombo=capture('rift',{...current,comboId:'different-preview'});assert.deepEqual(wrongCombo.spells,base.summoners);
});

test('two, four and five members retain their own configurations and Hex does not become a Rift page',()=>{
 const full=createSlots().map((s,i)=>({...s,champion:['Garen','Diana','Yasuo','Ashe','Rakan'][i]}));
 for(const size of [2,4,5]){const team=full.map((s,i)=>i<size?s:{...s,champion:null}),configs=captureRoomConfigurations(team,data,createPreparationStore());assert.equal(configs.length,size);assert(configs.every(c=>c.mode==='rift'));assert(encodeFrame(sanitizeShare({kind:'state',v:1,from:'甲',at:1,lineup:team,configurations:configs})));}
 const configs=captureRoomConfigurations(full,data,createPreparationStore(),{mode:'hex'});assert.equal(configs.length,5);assert(configs.every(c=>c.mode==='hex'&&c.runes===null));assert.throws(()=>roomPreparation(configs[0],data),/海克斯/);
});

test('a late trio peer keeps attribute guidance and a three-point opening without inventing QWER ranks',async()=>{
 const team=createSlots().map(s=>({...s,champion:({jungle:'Ivern',bottom:'Aphelios',support:'Lulu'})[s.role]||null}));
 const strategy=captureRoomStrategy(team,data),configs=captureRoomConfigurations(team,data,createPreparationStore(),{creativePlan:strategy});
 const a=createRoomService({nick:'属性房主',listenHost:'127.0.0.1',discovery:false}),b=createRoomService({nick:'晚加入队友',listenHost:'127.0.0.1',discovery:false});
 try{
  const address=await a.host();a.publish({lineup:team,configurations:configs,strategy});
  await b.join({host:'127.0.0.1',port:address.port,room:address.room,pin:address.pin});
  let received;for(let i=0;i<50;i++){received=b.snapshot().members.find(m=>m.nick==='属性房主')?.share;if(received?.configurations?.length===3)break;await new Promise(r=>setTimeout(r,20));}
  assert.deepEqual(received.configurations,configs);
  const aphelios=received.configurations.find(c=>c.champion==='Aphelios'),lulu=received.configurations.find(c=>c.champion==='Lulu');
  const original=getBuild(data.champions.find(c=>c.id==='Aphelios'),'bottom',data);
  assert.deepEqual(aphelios.attributePlan,original.attributePlan);assert.equal(aphelios.skills,null);assert.equal(aphelios.first,null);
  const text=roomConfigurationText(aphelios,data,'房主'),html=roomConfigurationDialog(aphelios,data,'房主');
  for(const detail of [original.attributePlan.action,original.attributePlan.note,original.attributePlan.sourceUrl,...original.attributePlan.mechanismUrls])assert(text.includes(detail)&&html.includes(detail));
  assert.match(text,/攻击力 > 穿甲 > 攻速/);assert.match(html,/属性方案供查看与复制/);assert.doesNotMatch(html,/<li>|采用符文、加点/);
  assert(!roomPreparation(aphelios,data).customSkillOrder);
  assert.equal(lulu.skills,null);assert.equal(lulu.first,'EQW');
  const adopted=roomPreparation(lulu,data,received.strategy),build=getBuild(data.champions.find(c=>c.id==='Lulu'),'support',data,adopted);
  assert.equal(adopted.customSkillOrder.order,'EQW');assert.equal(build.skillOrder,'EQW');assert.equal(build.first,'EQW');
  assert.equal(adopted.customSkillOrder.priority,'EWQ');assert.equal(build.priority,'EWQ','opening order must not replace the later maxing priority');
  const remembered=createPreparationStore();remembered.remember(adopted);
  const sharedAgain=captureRoomConfigurations(team,data,remembered,{creativePlan:strategy}).find(c=>c.champion==='Lulu');
  assert.equal(sharedAgain.skills,'EQW');assert.equal(sharedAgain.priority,'EWQ');
  assert.equal(roomPreparation(sharedAgain,data).customSkillOrder.priority,'EWQ','re-sharing an adopted opening must retain its later priority');
  const luluHtml=roomConfigurationDialog(lulu,data,'房主'),luluText=roomConfigurationText(lulu,data,'房主');
  assert.match(luluHtml,/采用符文、开局三点与召唤师技能/);assert.equal((luluHtml.match(/<li>/g)||[]).length,3);
  assert.match(luluText,/1级 E → 2级 Q → 3级 W/);assert.match(luluText,/仅覆盖前 3 个技能点/);assert.doesNotMatch(luluText,/18级/);
 }finally{a.dispose();b.dispose();}
});

test('attribute snapshots strip unknown fields and reject oversized, conflicting or wrongly bound advice',()=>{
 const team=createSlots().map(s=>({...s,champion:s.role==='bottom'?'Aphelios':null}));
 const c=captureRoomConfigurations(team,data,createPreparationStore())[0],plan=c.attributePlan;
 const clean=sanitizeRoomConfiguration({...c,attributePlan:{...plan,auth:'secret',runePageId:123}});
 assert.deepEqual(clean.attributePlan,plan);assert(!JSON.stringify(clean).includes('secret'));
 for(const bad of [
  {...c,champion:'Ashe'},{...c,skills:'QWE'},{...c,first:'QWE'},{...c,priority:'QWE'},
  {...c,attributePlan:{...plan,priority:['攻击力','攻击力','攻速']}},
  {...c,attributePlan:{...plan,action:'x'.repeat(1001)}},
  {...c,attributePlan:{...plan,sourceUrl:'javascript:alert(1)'}},
  {...c,attributePlan:{...plan,mechanismUrls:Array(5).fill(plan.sourceUrl)}},
 ])assert.equal(sanitizeRoomConfiguration(bad),null);
 const normal=captureRoomConfigurations(slots,data,createPreparationStore())[0];
 assert.equal(sanitizeRoomConfiguration({...normal,first:'RRR'}),null,'opening must agree with a supplied sequence');
 const {first,attributePlan,...legacy}=normal;assert(sanitizeRoomConfiguration(legacy));
 const invalid=sanitizeRoomConfiguration({...legacy,skills:null,first:'RRR'});assert(invalid);
 assert.throws(()=>roomPreparation(invalid,data),/等级规则/);
});
