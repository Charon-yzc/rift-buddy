import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {BUNDLED_CATALOG,validateCatalog,configureCatalog,catalogIssues,mergePersonal,catalogDiff,safeSourceURL} from '../src/core/catalog.mjs';
import {createCatalogStore,downloadCatalog,publicAddress} from '../services/catalog-store.mjs';
import {createSlots,recommend,replaceMember} from '../src/core/recommend.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {DUOS,TRIOS} from '../src/core/rules.mjs';
import {validateState,defaultState,mergeState} from '../services/storage.mjs';
import {comboSourceLinks} from '../src/build-options-view.mjs';
import {combinationDialog} from '../src/draft-library-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8')),clone=()=>structuredClone(BUNDLED_CATALOG),hero=id=>data.champions.find(h=>h.id===id);
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const store=async options=>createCatalogStore({root:await fs.mkdtemp(path.join(os.tmpdir(),'buddy-catalog-')),getData:()=>data,...options});
test('bundled pack has validated independent content and complete playable trio configs',()=>{
 const c=validateCatalog(clone(),data);assert.equal(c.duos.length,155);assert.equal(c.trios.length,50);
 for(const t of c.trios)for(const m of t.members){const b=getBuild(hero(m.champion),m.role,data,{comboId:t.id});assert.equal(b.combo.id,t.id);assert.equal(b.loadoutId,m.loadoutId);assert.equal(b.missing.length,0);assert.ok(b.runeOptions.length>=2,`${t.id}:${m.champion}`);}
});
test('pack rejects duplicate heroes, incompatible configs, bad items, rune pages and unsafe sources',()=>{
 for(const edit of [c=>c.duos.push(c.duos[0]),c=>c.trios[0].members[1].role=c.trios[0].members[0].role,c=>c.trios[0].members[0].loadoutId='trio-ball',c=>c.loadouts[0].items[0]=123456789,c=>c.runes.lethal.page.selectedPerkIds[0]=999,c=>c.duos[0].sources=[{name:'x',url:'javascript:alert(1)'}],c=>c.links.push(c.links[0])]){const c=clone();edit(c);assert.throws(()=>validateCatalog(c,data),/组合库/);}
 assert.equal(safeSourceURL('https://user:secret@site.example/file.json'),false);
});
test('patch review is per combo and invalid equipment marks only affected configs',()=>{
 const next={...data,patch:'16.20',items:{...data.items}};delete next.items[3142];const combo=BUNDLED_CATALOG.duos.find(d=>d.carry==='Varus'&&d.support==='Ashe');const issues=catalogIssues(clone(),next);assert.equal(issues.stale,205);assert.ok(issues.status[combo.id].invalid);assert.equal(issues.status['jarvan-galio-mf'].invalid,false);assert.ok(issues.errors.length);
 const b=getBuild(hero('Varus'),'bottom',next,{comboId:combo.id});assert.equal(b.loadoutId,'default');assert.ok(b.selectionWarnings.length);
});
test('preview is inert, apply/rollback survive restart and retain custom combos',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-pack-')),s=await store({root});const local={...clone().trios[0],id:'local-mine',name:'自己练的接力'};await s.savePersonal(local);
 const pack=clone();pack.version='test-next';pack.trios[1].risk+=' 新提醒';const p=s.preview(pack);assert.equal(s.summary().info.version,BUNDLED_CATALOG.version);assert.ok(p.changes.some(c=>c.type==='changed'));
 await s.apply(p.token);const restarted=await store({root});assert.equal(restarted.summary().info.version,pack.version);assert.equal(restarted.summary().info.personalCount,1);await restarted.rollback();assert.equal(restarted.summary().info.version,BUNDLED_CATALOG.version);assert.ok(restarted.summary().catalog.trios.some(c=>c.id===local.id));
});
test('failed disk writes and stale previews never change active recommendations',async()=>{
 const s=await store({write:async()=>{throw Error('disk full');}}),pack=clone();pack.version='changed';const p=s.preview(pack);await assert.rejects(s.apply(p.token),/disk full/);assert.equal(s.summary().info.version,BUNDLED_CATALOG.version);
 const good=await store();const staged=good.preview(pack);await good.setSource('https://example.com/data.json');await assert.rejects(good.apply(staged.token),/已变化/);
});
test('malformed store recovers to offline bundle and retains a recovery copy',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-recovery-'));await fs.writeFile(path.join(root,'combinations.json'),'{broken');const s=await store({root});assert.equal(s.summary().info.version,BUNDLED_CATALOG.version);assert.ok(s.summary().info.recovery);assert.ok((await fs.readdir(root)).some(n=>n.includes('.recovery-')));
});
test('online checks preview only, offline errors preserve installed content and source settings',async()=>{
 const c=clone();c.version='online-new';const s=await store({download:async()=>c});await s.setSource('https://example.com/data.json');const p=await s.check();assert.equal(p.version,c.version);assert.equal(s.summary().info.version,BUNDLED_CATALOG.version);await s.apply(p.token);assert.equal(s.summary().info.version,c.version);
 const offline=await store({download:async()=>{throw Error('offline');}});await offline.setSource('https://example.com/data.json');await assert.rejects(offline.check(),/offline/);assert.equal(offline.summary().info.version,BUNDLED_CATALOG.version);assert.equal(offline.summary().info.sourceUrl,'https://example.com/data.json');
});
test('downloads reject loopback, private/reserved DNS, credentials, redirects and oversized bodies',async()=>{
 for(const address of ['127.0.0.1','10.1.0.4','169.254.1.2','192.168.1.5','172.20.0.1','::1','::ffff:127.0.0.1','2001:db8::1','0.0.0.0','100.64.1.2'])assert.equal(publicAddress(address),false,address);assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
 await assert.rejects(downloadCatalog('https://a.example/x',{lookup:async()=>[{address:'10.0.0.2',family:4}]}),/内网/);await assert.rejects(downloadCatalog('https://a:b@a.example/x'),/HTTPS/);
 const request=(status,body)=>(url,options,callback)=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=status;res.resume=()=>{};callback(res);res.emit('data',Buffer.from(body));res.emit('end');req.emit('close');});req.destroy=e=>{req.emit('error',e);req.emit('close');};return req;};
 const lookup=async()=>[{address:'8.8.8.8',family:4}];await assert.rejects(downloadCatalog('https://a.example/x',{lookup,request:request(302,'{}')}),/跳转/);await assert.rejects(downloadCatalog('https://a.example/x',{lookup,request:request(200,'x'.repeat(2_000_001))}),/2 MB/);assert.deepEqual(await downloadCatalog('https://a.example/x',{lookup,request:request(200,'{"schema":1}')}),{schema:1});
});
test('a newly applied pack changes recommendation and member builds in the same process',()=>{
 const c=clone();c.trios[0].name='新名称';configureCatalog(c);try{assert.equal(TRIOS[0].name,'新名称');const slots=createSlots().map(s=>({...s,party:['top','jungle','mid'].includes(s.role)}));for(const m of TRIOS[0].members)Object.assign(slots.find(s=>s.role===m.role),{champion:m.champion,locked:true});const r=recommend({slots,champions:data.champions});assert.equal(r[0].title,'新名称');assert.equal(getBuild(hero('Orianna'),'mid',data,{comboId:TRIOS[0].id}).combo.title,'新名称');}finally{configureCatalog(BUNDLED_CATALOG);}
});
test('two fixed friends anchor a curated trio while the other two teammates stay fixed',()=>{
 const slots=createSlots().map(s=>({...s,party:['top','jungle','mid'].includes(s.role)}));for(const [role,id] of [['top','Malphite'],['jungle','JarvanIV'],['bottom','Ashe'],['support','Nami']])Object.assign(slots.find(s=>s.role===role),{champion:id,locked:true});const list=recommend({slots,champions:data.champions,limit:30});const match=list.find(r=>r.trio?.id==='ball-delivery');assert.ok(match);assert.equal(match.targets.join(','),'mid');assert.equal(match.slots.find(s=>s.role==='bottom').champion,'Ashe');assert.equal(match.slots.find(s=>s.role==='support').champion,'Nami');
});
test('role pools and unconventional-role preference constrain seeds as well as generated candidates',()=>{
 const slots=createSlots().map(s=>({...s,party:['mid','bottom','support'].includes(s.role)}));for(const [role,id] of [['top','Garen'],['jungle','LeeSin'],['mid','Ahri']])Object.assign(slots.find(s=>s.role===role),{champion:id,locked:true});const results=recommend({slots,champions:data.champions,scope:'bot',rolePools:{bottom:{mode:'only',heroes:['Jhin']},support:{mode:'only',heroes:['Nami','Lux']}}});assert.ok(results.length);for(const r of results){assert.equal(r.slots.find(s=>s.role==='bottom').champion,'Jhin');assert.ok(['Nami','Lux'].includes(r.slots.find(s=>s.role==='support').champion));}
 const conventional=recommend({slots,champions:data.champions,scope:'bot',play:{unusual:false},limit:40});assert.ok(conventional.every(r=>!['Rengar','Teemo','Katarina'].includes(r.slots.find(s=>s.role==='bottom').champion)));
});
test('partial replacement changes only one recommended position and reports lost combo',()=>{
 const slots=createSlots();slots[0]={...slots[0],champion:'Garen',locked:true};slots[1]={...slots[1],champion:'LeeSin',locked:true};const input={slots,champions:data.champions,scope:'bot'},r=recommend(input)[0],next=replaceMember(r,'bottom',input);assert.ok(next.length);for(const n of next){for(const old of r.slots.filter(s=>s.role!=='bottom'))assert.equal(n.slots.find(s=>s.role===old.role).champion,old.champion);assert.notEqual(n.slots.find(s=>s.role==='bottom').champion,r.slots.find(s=>s.role==='bottom').champion);assert.ok(n.replacementNote);}assert.throws(()=>replaceMember(r,'top',input),/只能替换/);
});
test('personal variants of an existing pair survive base updates without inflating pair counts',()=>{
 const c=clone(),duo={...c.duos[0],id:'local-wind',name:'我们练的风牛'};const merged=mergePersonal(c,{duos:[duo]});assert.equal(merged.duos.length,c.duos.length);assert.equal(merged.duos.find(x=>x.carry===duo.carry&&x.support===duo.support).id,duo.id);assert.ok(catalogDiff(c,merged).some(x=>x.type==='removed'));
});
test('update preview describes the effective merged library and discloses preserved personal changes',async()=>{
 const s=await store({write:async()=>{}}),local={...clone().duos[0],id:'local-preview-consistency',name:'我们保存的名称'};
 await s.savePersonal(local);const pack=s.export();pack.duos.find(c=>c.id===local.id).name='数据包里另一个名称';
 const preview=s.preview(pack);assert.ok(!preview.changes.some(c=>c.name==='数据包里另一个名称'),'Preview promised a change overridden by personal content');
 assert.ok(preview.preservedPersonal.some(c=>c.id===local.id));
 const after=await s.apply(preview.token);assert.equal(after.catalog.duos.find(c=>c.id===local.id).name,'我们保存的名称');
 assert.equal(preview.changes.length,0);assert.equal(preview.same,true);
});
test('a pending maintenance check does not invalidate a newer edit preview',async()=>{
 let release;const s=await store({write:async()=>{},download:()=>new Promise(r=>release=r)}),checking=s.check();
 await new Promise(r=>setImmediate(r));const pack=clone();pack.version='newer-preview';const latest=s.preview(pack);release(['16.19.1']);
 await checking;assert.equal((await s.apply(latest.token)).catalog.version,'newer-preview');
});
test('top-level library title, notes and source changes can be applied without changing the version',async()=>{
 const s=await store({write:async()=>{}}),pack=s.export();pack.name='只修改库名称';pack.notes='仅修改维护说明';pack.source={...pack.source,name:'新的来源说明'};
 const preview=s.preview(pack);assert.equal(preview.same,false);assert.ok(preview.changes.some(c=>c.kind==='metadata'));assert.equal((await s.apply(preview.token)).catalog.name,pack.name);
});
test('changing an online source while its download is pending cannot stage the old source package',async()=>{
 let release;const s=await store({write:async()=>{},download:()=>new Promise(r=>release=r)});await s.setSource('https://example.com/old.json');const checking=assert.rejects(s.check(),/来源.*变化|地址.*变化/);
 await new Promise(r=>setImmediate(r));await s.setSource('https://example.com/new.json');release(clone());await checking;assert.equal(s.summary().info.sourceUrl,'https://example.com/new.json');
});
test('a rollback during maintenance rejects an obsolete diff instead of changing its baseline',async()=>{
 let release;const s=await store({write:async()=>{},download:()=>new Promise(r=>release=r)}),a=clone(),b=clone();a.version='a';a.duos[0].plan+=' 我们修改的计划';b.version='b';
 await s.apply(s.preview(a).token);await s.apply(s.preview(b).token);const checking=assert.rejects(s.check(),/内容.*变化/);await new Promise(r=>setImmediate(r));await s.rollback();release(['16.19.1']);await checking;
 assert.equal(s.summary().catalog.duos[0].plan,a.duos[0].plan);assert.equal(s.summary().catalog.version,'a');
});
test('preferences normalize old settings and backup restores new play and role pools',()=>{
 const original=defaultState(),backup=validateState({...original,preferences:{...original.preferences,play:{tempo:'poke',unusual:false},rolePools:{mid:{mode:'only',heroes:['Ahri']}}}});const merged=mergeState(original,backup,data.champions);assert.equal(merged.preferences.play.tempo,'poke');assert.equal(merged.preferences.play.unusual,false);assert.deepEqual(merged.preferences.rolePools.mid.heroes,['Ahri']);assert.equal(validateState(original).preferences.rolePools.top.mode,'off');
});
test('imported source names and URLs render as escaped data and never become executable markup',()=>{
 const html=comboSourceLinks([{name:'<img src=x onerror=alert(1)>',url:'https://example.com/" onmouseover="x',kind:'<b>x</b>'}]);assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&quot;'));assert.equal(html.includes('<img src=x'),false);assert.equal(html.includes('<b>x</b>'),false);
 const c=clone();c.source.url='https://example.com/" onclick="x';configureCatalog(c);try{const dialog=combinationDialog(data,{kind:'trios',query:'',style:'all'},createSlots());assert.ok(dialog.includes('&quot;'));assert.equal(dialog.includes(' onclick="x'),false);}finally{configureCatalog(BUNDLED_CATALOG);}
});
