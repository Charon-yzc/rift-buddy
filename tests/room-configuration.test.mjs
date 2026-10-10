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
import {captureRoomStrategy,captureRoomConfigurations,roomPreparation} from '../src/core/room-configuration.mjs';
import {sanitizeRoomConfiguration,sanitizeShare,encodeFrame,decodeFrame,MAX_FRAME} from '../src/core/room.mjs';
import {roomConfigurationDialog,roomConfigurationText} from '../src/room-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;
const slots=createSlots();for(const [role,champion]of [['jungle','Diana'],['mid','Yasuo'],['support','Rakan']])slots.find(s=>s.role===role).champion=champion;
const store=createPreparationStore();

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

test('two, four and five members retain their own configurations and Hex does not become a Rift page',()=>{
 const full=createSlots().map((s,i)=>({...s,champion:['Garen','Diana','Yasuo','Ashe','Rakan'][i]}));
 for(const size of [2,4,5]){const team=full.map((s,i)=>i<size?s:{...s,champion:null}),configs=captureRoomConfigurations(team,data,createPreparationStore());assert.equal(configs.length,size);assert(configs.every(c=>c.mode==='rift'));assert(encodeFrame(sanitizeShare({kind:'state',v:1,from:'甲',at:1,lineup:team,configurations:configs})));}
 const configs=captureRoomConfigurations(full,data,createPreparationStore(),{mode:'hex'});assert.equal(configs.length,5);assert(configs.every(c=>c.mode==='hex'&&c.runes===null));assert.throws(()=>roomPreparation(configs[0],data),/海克斯/);
});
