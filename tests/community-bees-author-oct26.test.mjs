// Historical 16.21 Hex provenance and withdrawal contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {hexMechanismMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {hexRouteCard} from '../src/core/hex-route-card.mjs';
import {validCommunitySkillPriority} from '../src/core/community-source.mjs';
import {validateCommunityData,verifyCommunityEnvelope,decodeCommunityData} from '../services/community-data.mjs';
import {publishCommunityData} from '../services/community-data-publish.mjs';
import {createCommunityFeedCache} from '../services/community-feed-cache.mjs';
const read=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url)));
const game=await read('./fixtures/snapshot-16.21/game.json'),routes=await read('./fixtures/community-2026.10.26/hex-community-routes.json'),catalog=await read('./fixtures/community-2026.10.26/catalog-data.json');
const snapshot=hexRoutes=>({schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog,hexRoutes});
const data=()=>({...structuredClone(game),communityHexRoutes:structuredClone(routes)});
const find=(d,hero,owned=[])=>hexPlayerRoutes({data:d,hero,owned}).find(r=>r.augment.id===3086);

test('new BEES recipes preserve named author purchases and keep project completion separate',()=>{
 const d=data(),tahm=find(d,'TahmKench'),viego=find(d,'Viego');assert(tahm);assert(viego);
 assert.deepEqual(tahm.gear.slice(0,3).map(g=>g.items.map(i=>i.id)),[[3084,3083],[4633],[2502]]);
 assert.deepEqual(viego.gear[0].items.map(i=>i.id),[6676]);
 for(const r of [tahm,viego]){
  assert.equal(r.communitySource.author,'驻韩研究员');assert.equal(r.communitySource.url,'https://www.bilibili.com/video/BV1kQHP6zEvx/');assert.equal(r.communitySource.publishedAt,'2026-10-24T07:11:52Z');assert.equal(r.communitySource.sourcePatch,null);
  assert.equal(r.optionalAugments.length,0);assert.equal(r.pendingItems,0);assert.equal(r.skillPriorityOrigin,'project');assert.match(r.communitySource.adaptation,/非作者|不是作者/);
  const micro=hexMechanismMicroRoutes([r])[0],card=hexRouteCard(micro,{priority:'WQ',source:'generic'});
  assert.equal(micro.skillPriorityOrigin,'project');assert.equal(card.priority,'主Q副E');assert.equal(card.skillSource,'开黑搭子 · 机制改编');assert.match(card.skillNote,/不是作者原配/);
 }
 assert.match(tahm.communitySource.adaptation,/116\/118秒/);assert.match(viego.communitySource.adaptation,/200秒/);
 assert.match(tahm.caution,/2000额外生命值.*8秒/);assert.match(viego.caution,/低于5%/);assert.match(viego.gear[2].why,/不提升蜂巢.*魔法伤害/);
 assert.deepEqual(find(d,'Gnar').gear.flatMap(g=>g.items.map(i=>i.id)),[3100,3115,4645,3089,3135,4646],'Do not replace the separately sourced AP Gnar recipe');
});

test('BEES recipes withdraw changed core dependencies but retain unrelated conditional choices',()=>{
 for(const [hero,core]of [['TahmKench',[3084,3083,4633]],['Viego',[6676]]]){
  for(const change of [d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===3086).effectSourceHash='0'.repeat(64),...core.map(id=>d=>d.items[id].modeTooltips.hex.basisHash='0'.repeat(64))]){const d=data();change(d);assert.equal(find(d,hero),undefined);}
  for(const group of find(data(),hero).gear.filter(g=>g.items.every(i=>!i.core))){const d=data(),id=group.items[0].id;d.items[id].description+=' changed';const r=find(d,hero);assert(r);assert(!r.gear.some(g=>g.items.some(i=>i.id===id)));}
  const r=find(data(),hero,[3086,1004]);assert(r?.ultimateUnavailable);assert.match(r.play[0],/已失去R/);assert.doesNotMatch(r.play.join(' '),/开R|施放R|大招收尾/);
 }
});

test('invalid skill provenance cannot be signed or projected as author advice',()=>{
 assert(validCommunitySkillPriority({}));assert(validCommunitySkillPriority({skillPriority:['Q']}));assert(validCommunitySkillPriority({skillPriority:['Q','E'],skillPriorityOrigin:'project'}));
 for(const fields of [{skillPriorityOrigin:'project'},{skillPriority:['Q'],skillPriorityOrigin:'author'},{skillPriority:[]},{skillPriority:['Q','Q']},{skillPriority:['R']},{skillPriority:null},{skillPriority:['Q'],skillPriorityOrigin:1}]){
  assert.equal(validCommunitySkillPriority(fields),false);const d=data(),r=d.communityHexRoutes.routes.find(r=>r.hero==='Viego'&&r.augment===3086);delete r.skillPriority;delete r.skillPriorityOrigin;Object.assign(r,fields);
  assert.equal(find(d,'Viego'),undefined);assert.throws(()=>validateCommunityData(snapshot(d.communityHexRoutes),d),/加点/);
 }
 const original=routes.routes.find(r=>r.hero==='TahmKench'&&r.augment===3086),authored={...original};delete authored.skillPriorityOrigin;
 assert.equal(hexRouteCard(authored).skillSource,'驻韩研究员');
 const unknown={...original};delete unknown.skillPriority;delete unknown.skillPriorityOrigin;assert.equal(hexRouteCard(unknown,{priority:'WQ',source:'generic'}).priority,'');
});

test('project-completed skills require client39 before signing and remain correctly attributed after feed activation',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'community-bees-author-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const opts={publicRoot:path.join(root,'public'),keyFile:path.join(root,'key.pem'),game,catalog,hexRoutes:routes,clock:()=>Date.parse(routes.reviewedAt+'T06:00:00Z')};
 for(const minimumApp of ['0.59.33','0.59.38'])await assert.rejects(publishCommunityData({...opts,minimumApp}),/需要支持/);await assert.rejects(fs.access(opts.publicRoot));
 const pair=generateKeyPairSync('ed25519'),keys={isolated:pair.publicKey.export({type:'spki',format:'pem'})};await fs.writeFile(opts.keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}));
 const manifest=await publishCommunityData({...opts,keys,keyId:'isolated'});assert.equal(manifest.minimumApp,'0.59.39');
 const envelope=JSON.parse(await fs.readFile(path.join(opts.publicRoot,'community/v1/latest.json'))),packed=await fs.readFile(path.join(opts.publicRoot,'community/v1/assets',manifest.file));
 assert.deepEqual(verifyCommunityEnvelope(envelope,{keys}),manifest);const decoded=decodeCommunityData(manifest,packed,game);assert.equal(decoded.hexRoutes.routes.find(r=>r.hero==='Viego').skillPriorityOrigin,'project');
 for(const currentVersion of ['0.59.38','0.59.39']){
  let active=null,downloads=0;const cache=await createCommunityFeedCache({root:path.join(root,currentVersion),getData:()=>game,currentVersion,bundledVersion:catalog.version,keys,clock:opts.clock,canActivate:()=>true,prepare:value=>()=>{active=value;},download:async relative=>{downloads++;return relative.endsWith('latest.json')?Buffer.from(JSON.stringify(envelope)):packed;}});
  const result=await cache.check();assert.equal(result.phase,currentVersion==='0.59.39'?'ready':'offline');assert.equal(downloads,currentVersion==='0.59.39'?2:1);
  if(active){const r=find({...game,communityHexRoutes:active.hexRoutes},'Viego');assert.equal(hexRouteCard(hexMechanismMicroRoutes([r])[0]).skillSource,'开黑搭子 · 机制改编');}else assert.equal(currentVersion,'0.59.38');
 }
});
