import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync,renameSync} from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import {createCommunityFeedCache,downloadCommunityFeed} from '../services/community-feed-cache.mjs';
import {createCatalogStore} from '../services/catalog-store.mjs';
import {BUNDLED_CATALOG} from '../src/core/catalog.mjs';
import {feedHash,createDataFeedActivationGate} from '../services/data-feed.mjs';
import {atomicJSON} from '../services/data.mjs';
import {hexPlayerRoutes,hexCommunitySourceURLs} from '../src/core/hex-routes.mjs';
import {preserveGameContext} from '../services/data-generation-cache.mjs';

const original=JSON.parse(readFileSync(new URL('../data/game.json',import.meta.url))),routes=JSON.parse(readFileSync(new URL('../src/core/hex-community-routes.json',import.meta.url)));
const pair=generateKeyPairSync('ed25519'),keys={isolated:pair.publicKey.export({type:'spki',format:'pem'})},now=Date.parse('2026-10-25T00:00:00Z');
function signed({version='2026.10.25.3',sequence=now-1000,minimumApp='0.59.28',patch=original.patch,publishedAt=new Date(now-1000).toISOString(),title='在线导管路线',editCatalog=()=>{}}={}){
 const catalog=structuredClone(BUNDLED_CATALOG);catalog.version=version;editCatalog(catalog);
 const hexRoutes=structuredClone(routes);hexRoutes.routes[0].title=title;
 const value={schema:1,kind:'community-snapshot',patch,version,reviewedAt:routes.reviewedAt,catalog,hexRoutes},raw=Buffer.from(JSON.stringify(value)),packed=gzipSync(raw);
 const manifest={schema:1,kind:value.kind,patch,version,reviewedAt:value.reviewedAt,minimumApp,sequence,publishedAt,file:feedHash(packed)+'.json.gz',sha256:feedHash(packed),bytes:packed.length,rawSha256:feedHash(raw),rawBytes:raw.length},payload=Buffer.from(JSON.stringify(manifest)),envelope={keyId:'isolated',payload:payload.toString('base64'),signature:sign(null,payload,pair.privateKey).toString('base64')};
 return {value,packed,manifest,envelope};
}
async function fixture(t,options={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-community-feed-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let data=structuredClone(original),source=signed(),allowed=false,commits=0,failingPromotion=false;const gate=createDataFeedActivationGate({requireIdleConfirmation:true}),requests=[],states=[];
 if(options.state)await atomicJSON(path.join(root,'combinations.json'),options.state);
 const store=await createCatalogStore({root,getData:()=>data,...(options.storeWrite?{write:options.storeWrite}:{})});Object.assign(data,{catalog:store.summary().catalog,catalogInfo:store.summary().info});
 const prepare=(value,current)=>{const staged=store.prepareCommunity(value?.catalog||null,value?.patch,current);return ()=>{staged.commit();current.catalog=staged.catalog;current.catalogInfo=staged.info;current.communityHexRoutes=value?.hexRoutes||null;commits++;};};
 const download=async(relative,limits)=>{requests.push({relative,...limits});if(options.download)return options.download(relative,limits,()=>source);if(relative.endsWith('/latest.json'))return Buffer.from(JSON.stringify(source.envelope));assert.equal(relative,'/community/v1/assets/'+source.manifest.file);return source.packed;};
 const base={root:path.join(root,'data'),getData:()=>data,prepare,getContext:()=>store.revision(),canActivate:()=>allowed&&!store.isMutating(),currentVersion:'0.59.28',keys,clock:()=>now,download,onChange:s=>states.push(s),promote:(a,b)=>{if(failingPromotion&&b.endsWith('community-feed.json'))throw Error('synthetic promotion failure');renameSync(a,b);},...options};
 const cache=await createCommunityFeedCache(base);
 return {root,store,cache,states,requests,prepare,base,data:()=>data,replace:next=>{data=next;},phase:(phase,connected=true)=>{allowed=gate({connected,phase});},source:next=>{source=next;},failPromotion:value=>{failingPromotion=value;},commits:()=>commits,currentFile:path.join(root,'data/community-feed.json'),pendingFile:path.join(root,'data/community-feed.pending.json')};
}

test('signed community data activates once at idle and drives runtime Hex routes',async t=>{
 const f=await fixture(t);f.phase('Lobby');const result=await f.cache.check();assert.equal(result.phase,'ready');assert.equal(f.commits(),1);assert.equal(f.data().catalog.version,'2026.10.25.3');assert.equal(hexPlayerRoutes({data:f.data(),hero:'Lillia'})[0].title,'在线导管路线');
 assert.equal(f.cache.activate(),false);await f.cache.check();assert.equal(f.commits(),1);assert.equal(f.requests.length,2);assert.equal(JSON.parse(await fs.readFile(f.currentFile)).schema,1);
 const changed=structuredClone(f.data());changed.augments.find(a=>a.id===1045).description+=' changed';assert.equal(hexPlayerRoutes({data:changed,hero:'Lillia'}).length,0,'Downloaded prose cannot bypass core mechanism review');
});

test('accepted text and new video sources reach runtime routes without bypassing mechanism gates',async t=>{
 const f=await fixture(t),s=signed(),route=s.value.hexRoutes.routes.find(r=>r.hero==='TahmKench');route.communitySource.url='https://www.bilibili.com/video/BV1TestFeed29/';const raw=Buffer.from(JSON.stringify(s.value)),packed=gzipSync(raw),m={...s.manifest,file:feedHash(packed)+'.json.gz',sha256:feedHash(packed),bytes:packed.length,rawSha256:feedHash(raw),rawBytes:raw.length},payload=Buffer.from(JSON.stringify(m));s.manifest=m;s.packed=packed;s.envelope={keyId:'isolated',payload:payload.toString('base64'),signature:sign(null,payload,pair.privateKey).toString('base64')};
 f.source(s);f.phase('Lobby');await f.cache.check();assert.equal(f.cache.summary().phase,'ready');assert(hexCommunitySourceURLs(f.data()).includes(route.communitySource.url));const text=hexPlayerRoutes({data:f.data(),hero:'Malphite'}).find(r=>r.augment.id===3049);assert.equal(text.communitySource.medium,'text');assert.deepEqual(text.skillPriority,['W']);
 const changed=structuredClone(f.data());changed.augments.find(a=>a.id===3094).description+=' effect drift';assert.equal(hexCommunitySourceURLs(changed).includes(route.communitySource.url),false);
});

test('a current civil review day is accepted before UTC midnight while future publication is still rejected',async t=>{
 const earlier=now-6*60*60*1000,f=await fixture(t,{clock:()=>earlier}),current=signed({publishedAt:new Date(earlier-1000).toISOString(),sequence:earlier-1000});f.source(current);f.phase('Lobby');assert.equal((await f.cache.check()).phase,'ready');
 const future=signed({version:'2026.10.25.4',sequence:earlier,publishedAt:new Date(earlier+600000).toISOString()});f.source(future);assert.equal((await f.cache.check({force:true})).phase,'offline');assert.equal(f.data().catalog.version,current.value.version);
});

test('draft, game and transient disconnect keep the displayed data until confirmed idle',async t=>{
 const f=await fixture(t),before=f.data().catalog;f.phase('ChampSelect');assert.equal((await f.cache.check()).phase,'pending');assert.equal(f.commits(),0);assert.equal(f.data().catalog,before);
 for(const phase of ['ChampSelect','GameStart','InProgress','Reconnect']){f.phase(phase);assert.equal(f.cache.activate(),false);}
 f.phase('Offline',false);assert.equal(f.cache.activate(),false);assert.equal(f.commits(),0);assert.equal(await fs.stat(f.currentFile).catch(()=>null),null);assert.ok(await fs.stat(f.pendingFile));
 f.phase('EndOfGame');assert.equal(f.cache.activate(),true);assert.equal(f.commits(),1);
});

test('entering draft during cache staging writes only pending content',async t=>{
 let f;f=await fixture(t,{write:async(file,value)=>{await atomicJSON(file,value);f.phase('ChampSelect');}});f.phase('Lobby');await f.cache.check();assert.equal(f.commits(),0);assert.equal(await fs.stat(f.currentFile).catch(()=>null),null);assert.ok(await fs.stat(f.pendingFile));f.phase('Lobby');assert.equal(f.cache.activate(),true);
});

test('custom installed catalog and personal entries survive automatic updates without disk changes',async t=>{
 const f=await fixture(t),personal={...structuredClone(BUNDLED_CATALOG.duos.find(d=>d.id==='xayah-kayle-guard')),id:'local-protection',name:'我的保护组合'};await f.store.savePersonal(personal);
 const custom=structuredClone(BUNDLED_CATALOG);custom.name='用户手动组合库';custom.version='2026.10.24.99';await f.store.apply(f.store.preview(custom).token);const filename=path.join(f.root,'combinations.json'),before=await fs.readFile(filename);
 f.phase('Lobby');await f.cache.check();assert.equal(f.data().catalog.name,custom.name);assert.ok(f.data().catalog.duos.some(d=>d.id===personal.id));assert.ok((await fs.readFile(filename)).equals(before));assert.equal(hexPlayerRoutes({data:f.data(),hero:'Lillia'})[0].title,'在线导管路线');
});

test('automatic base keeps personal entries when no manual catalog is installed',async t=>{
 const f=await fixture(t),personal={...structuredClone(BUNDLED_CATALOG.duos.find(d=>d.id==='xayah-kayle-guard')),id:'local-protection',name:'我的保护组合'};await f.store.savePersonal(personal);const before=await fs.readFile(path.join(f.root,'combinations.json'));f.phase('Lobby');await f.cache.check();assert.equal(f.data().catalog.version,'2026.10.25.3');assert.ok(f.data().catalog.duos.some(d=>d.id===personal.id));assert.ok((await fs.readFile(path.join(f.root,'combinations.json'))).equals(before));
});

test('activated cache restores offline while a later pending snapshot waits across restart',async t=>{
 const f=await fixture(t);f.phase('Lobby');await f.cache.check();f.phase('ChampSelect');f.source(signed({version:'2026.10.25.4',sequence:now,title:'仍待空闲的新路线'}));await f.cache.check({force:true});
 const fresh=structuredClone(original);f.replace(fresh);const gate=createDataFeedActivationGate({requireIdleConfirmation:true});let idle=false;
 const restarted=await createCommunityFeedCache({...f.base,getData:()=>fresh,prepare:f.prepare,restoreAtStartup:true,canActivate:()=>idle,download:async()=>{throw Error('offline');}});
 assert.equal(fresh.catalog.version,'2026.10.25.3');assert.equal(restarted.summary().phase,'pending');await restarted.check({force:true});assert.equal(fresh.catalog.version,'2026.10.25.3');idle=gate({connected:false});assert.equal(restarted.activate(),false);idle=gate({connected:true,phase:'Lobby'});assert.equal(restarted.activate(),true);assert.equal(fresh.catalog.version,'2026.10.25.4');
});

test('atomic promotion failure preserves accepted disk and memory and can retry at idle',async t=>{
 const f=await fixture(t);f.phase('Lobby');await f.cache.check();const before=await fs.readFile(f.currentFile),catalog=f.data().catalog;f.source(signed({version:'2026.10.25.4',sequence:now}));f.failPromotion(true);await f.cache.check({force:true});assert.equal(f.data().catalog,catalog);assert.ok((await fs.readFile(f.currentFile)).equals(before));assert.equal(f.cache.summary().phase,'pending');f.failPromotion(false);assert.equal(f.cache.activate(),false,'Do not retry a locked file on every client poll');assert.equal(f.cache.activate({force:true}),true);assert.equal(f.data().catalog.version,'2026.10.25.4');
});

test('replayed sequence and same-sequence equivocation never overwrite accepted data',async t=>{
 const f=await fixture(t);f.phase('Lobby');f.source(signed({version:'2026.10.25.4',sequence:now}));await f.cache.check();const before=await fs.readFile(f.currentFile),catalog=f.data().catalog;
 for(const incoming of [signed(),signed({version:'2026.10.25.4',sequence:now,title:'相同序列篡改内容'})]){f.source(incoming);assert.equal((await f.cache.check({force:true})).phase,'offline');assert.equal(f.data().catalog,catalog);assert.ok((await fs.readFile(f.currentFile)).equals(before));}
});

for(const [name,change] of [
 ['old bundled version',()=>signed({version:'2026.10.23.9'})],
 ['wrong patch',()=>signed({patch:'16.20'})],
 ['requires newer app',()=>signed({minimumApp:'0.60.0'})],
 ['future publication',()=>signed({publishedAt:new Date(now+600000).toISOString()})],
 ['bad signature',()=>{const s=signed();s.envelope.signature='A'.repeat(86)+'==';return s;}],
 ['corrupt packed bytes',()=>{const s=signed();s.packed=Buffer.from(s.packed);s.packed[100]^=1;return s;}],
])test('rejects '+name+' and keeps usable bundled data',async t=>{const f=await fixture(t);f.source(change());f.phase('Lobby');const before=f.data().catalog;assert.equal((await f.cache.check()).phase,'offline');assert.equal(f.data().catalog,before);assert.equal(f.commits(),0);assert.equal(await fs.stat(f.currentFile).catch(()=>null),null);});

test('game generation change during download discards the prepared snapshot and permits next check',async t=>{
 let f;f=await fixture(t,{download:async(relative,limits,getSource)=>{const s=getSource();if(relative.endsWith('latest.json'))return Buffer.from(JSON.stringify(s.envelope));f.replace(structuredClone(original));return s.packed;}});f.phase('Lobby');await f.cache.check();assert.equal(f.commits(),0);assert.equal(await fs.stat(f.pendingFile).catch(()=>null),null);
});

test('new base invalidates changed community dependencies once without recalculation on every poll',async t=>{
 const f=await fixture(t);f.phase('Lobby');await f.cache.check();const next=structuredClone(f.data());next.champions.find(c=>c.id==='Lillia').mechanicSource.character.sha256='a'.repeat(64);f.replace(next);const before=f.commits();f.cache.reconcile();const once=f.commits();assert.equal(once,before+1);for(let i=0;i<10;i++)f.cache.activate();assert.equal(f.commits(),once);assert.equal(next.communityHexRoutes,null);
});

test('fixed-origin community transport rejects arbitrary paths and bounds chunked bytes',async()=>{
 let calls=0,cancelled=false;const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://data.riftbuddy.dpdns.org/community/v1/latest.json');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.deepEqual(Object.keys(options.headers),['Accept']);return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(300));c.enqueue(new Uint8Array(300));},cancel(){cancelled=true;}}));};
 for(const name of ['https://evil.test/data','/community/v1/../latest.json','/community/v1/assets/x.json.gz'])await assert.rejects(downloadCommunityFeed(name,{limit:500,fetcher}),/地址/);assert.equal(calls,0);await assert.rejects(downloadCommunityFeed('/community/v1/latest.json',{limit:500,fetcher}),/过大/);assert.equal(cancelled,true);
});

test('new signed metadata for identical content does not replace data or recalculate routes',async t=>{
 const f=await fixture(t);f.phase('Lobby');await f.cache.check();const catalog=f.data().catalog,routes=f.data().communityHexRoutes;f.source(signed({sequence:now}));f.phase('ChampSelect');await f.cache.check({force:true});assert.equal(f.commits(),1);assert.equal(f.data().catalog,catalog);assert.equal(f.data().communityHexRoutes,routes);assert.equal(f.requests.filter(r=>r.relative.includes('/assets/')).length,1);assert.equal(JSON.parse(Buffer.from(JSON.parse(await fs.readFile(f.currentFile)).envelope.payload,'base64')).sequence,now);
});

test('a manually staged preview is invalidated by an intervening automatic official update',async t=>{
 const f=await fixture(t),preview=f.store.preview(BUNDLED_CATALOG);f.phase('Lobby');await f.cache.check();await assert.rejects(f.store.apply(preview.token),/组合库已变化/);assert.equal(f.store.summary().catalog.version,'2026.10.25.3');
});

test('semantic inspection is deferred during draft and invalid candidates are not retried every poll',async t=>{
 const f=await fixture(t),changed=structuredClone(f.data());changed.champions.find(c=>c.id==='Lillia').mechanicSource.character.sha256='a'.repeat(64);f.replace(changed);f.phase('ChampSelect');await f.cache.check();assert.ok(await fs.stat(f.pendingFile));assert.equal(f.commits(),0);f.phase('Lobby');assert.equal(f.cache.activate(),false);assert.match(f.cache.summary().message,/待机制复核/);const notices=f.states.length;for(let i=0;i<100;i++)assert.equal(f.cache.activate(),false);assert.equal(f.states.length,notices);assert.equal(f.commits(),0);
});

test('corrupt cached bytes retain the signed watermark and are repaired from the public asset',async t=>{
 const f=await fixture(t);f.phase('Lobby');await f.cache.check();const record=JSON.parse(await fs.readFile(f.currentFile));record.packed='AAAA';await atomicJSON(f.currentFile,record);const fresh=structuredClone(original);f.replace(fresh);
 const restarted=await createCommunityFeedCache({...f.base,restoreAtStartup:true});assert.equal(fresh.communityHexRoutes,undefined);const requests=f.requests.length;await restarted.check({force:true});assert.equal(f.requests.length,requests+2);assert.equal(fresh.catalog.version,'2026.10.25.3');assert.equal(hexPlayerRoutes({data:fresh,hero:'Lillia'})[0].title,'在线导管路线');
});

test('status progress cannot cancel a base-data transaction but a community content swap can',async t=>{
 const f=await fixture(t),before=preserveGameContext(f.data,f.data());f.data().communityFeed={phase:'checking'};assert.equal(before(),true);f.data().dataFeed={phase:'checking'};assert.equal(before(),true);f.phase('Lobby');await f.cache.check();assert.equal(before(),false);
});


const removePersonalDependency=c=>{c.duos=c.duos.filter(d=>d.id!=='xayah-kayle-guard');c.loadouts=c.loadouts.filter(l=>l.id!=='xayah-kayle-feathers');c.skillPlans=c.skillPlans.filter(p=>p.loadoutId!=='xayah-kayle-feathers');};
const reassignPersonalDependency=c=>{c.duos=c.duos.filter(d=>d.id!=='xayah-kayle-guard');c.loadouts.find(l=>l.id==='xayah-kayle-feathers').roles=['mid'];c.skillPlans=c.skillPlans.filter(p=>p.loadoutId!=='xayah-kayle-feathers');};
test('a held personal save cannot be crossed by an official snapshot removing its dependency',async t=>{
 let entered,release;const entering=new Promise(r=>entered=r),held=new Promise(r=>release=r),f=await fixture(t,{storeWrite:async(...args)=>{entered();await held;return atomicJSON(...args);}}),personal={...structuredClone(BUNDLED_CATALOG.duos.find(d=>d.id==='xayah-kayle-guard')),id:'local-guard',name:'保留个人组合'};
 f.source(signed({editCatalog:removePersonalDependency}));f.phase('Lobby');const saving=f.store.savePersonal(personal);await entering;await f.cache.check();assert.equal(f.commits(),0);release();const saved=await saving,expected=saved.catalog.duos.find(d=>d.id===personal.id);Object.assign(f.data(),{catalog:saved.catalog,catalogInfo:saved.info});const bytes=await fs.readFile(path.join(f.root,'combinations.json'));assert.match(expected.members[0].loadoutId,/^local-snapshot-/);assert.equal(f.cache.activate(),true);assert.equal(f.data().catalog.version,'2026.10.25.3');assert.deepEqual(f.data().catalog.duos.find(d=>d.id===personal.id),expected);assert.ok((await fs.readFile(path.join(f.root,'combinations.json'))).equals(bytes));
});

test('correcting a legacy personal dependency retries the same pending signed snapshot offline',async t=>{
 const personal={...structuredClone(BUNDLED_CATALOG.duos.find(d=>d.id==='xayah-kayle-guard')),id:'local-guard',name:'保留旧版个人组合'},f=await fixture(t,{state:{schema:1,installed:null,previous:null,personal:{duos:[personal],trios:[],loadouts:[],runes:{}},sourceUrl:'',lastCheckedAt:null}});f.source(signed({editCatalog:reassignPersonalDependency}));f.phase('Lobby');await f.cache.check();assert.match(f.cache.summary().message,/个人组合依赖/);const notices=f.states.length;for(let i=0;i<30;i++)assert.equal(f.cache.activate(),false);assert.equal(f.states.length,notices);
 const fixed=structuredClone(personal);for(const m of fixed.members)m.loadoutId='default';const saved=await f.store.savePersonal(fixed);Object.assign(f.data(),{catalog:saved.catalog,catalogInfo:saved.info});const requests=f.requests.length,bytes=await fs.readFile(path.join(f.root,'combinations.json'));assert.equal(f.cache.activate(),true);assert.equal(f.requests.length,requests);assert.deepEqual(f.data().catalog.duos.find(d=>d.id===fixed.id),fixed);assert.ok((await fs.readFile(path.join(f.root,'combinations.json'))).equals(bytes));
});

for(const sameId of [false,true])test('private '+(sameId?'same-ID expanded role':'new loadout/runes')+' reference survives fresh-store offline restart and withdrawal',async t=>{
 const f=await fixture(t);f.source(signed({editCatalog:c=>{const original=c.loadouts.find(l=>l.id==='xayah-kayle-feathers');if(sameId)original.roles.push('mid');else{const loadout=structuredClone(original);loadout.id='online-feathers';c.runes['online-feathers-rune']=structuredClone(c.runes[loadout.runes[0]]);loadout.runes=['online-feathers-rune'];c.loadouts.push(loadout);c.duos.find(d=>d.id==='xayah-kayle-guard').members[0].loadoutId=loadout.id;}}}));f.phase('Lobby');await f.cache.check();const personal={...structuredClone(f.data().catalog.duos.find(d=>d.id==='xayah-kayle-guard')),id:'local-online',name:'个人引用在线配置'};if(sameId)personal.members[0].role='mid';const saved=await f.store.savePersonal(personal),expected=saved.catalog.duos.find(d=>d.id===personal.id),selected=saved.catalog.loadouts.find(l=>l.id===expected.members[0].loadoutId);assert.match(selected.id,/^local-snapshot-/);assert.equal(selected.patch,'16.21');assert(selected.runes.every(id=>id.startsWith('local-rune-')));
 const file=path.join(f.root,'combinations.json'),before=await fs.readFile(file);let fresh=structuredClone(original);const store=await createCatalogStore({root:f.root,getData:()=>fresh}),initial=store.summary();assert.equal(initial.info.recovery,'');assert.deepEqual(initial.catalog.duos.find(d=>d.id===personal.id),expected);Object.assign(fresh,{catalog:initial.catalog,catalogInfo:initial.info});
 const restarted=await createCommunityFeedCache({...f.base,getData:()=>fresh,getContext:()=>store.revision(),restoreAtStartup:true,download:async()=>{throw Error('offline');},prepare:(value,current)=>{const staged=store.prepareCommunity(value?.catalog||null,value?.patch,current);return ()=>{staged.commit();current.catalog=staged.catalog;current.catalogInfo=staged.info;current.communityHexRoutes=value?.hexRoutes||null;};}});assert.equal(restarted.summary().phase,'ready');assert.deepEqual(fresh.catalog.duos.find(d=>d.id===personal.id),expected);assert.ok((await fs.readFile(file)).equals(before));
 fresh=structuredClone(fresh);fresh.champions.find(c=>c.id==='Lillia').mechanicSource.character.sha256='a'.repeat(64);assert.doesNotThrow(()=>restarted.reconcile());assert.equal(fresh.communityHexRoutes,null);assert.deepEqual(fresh.catalog.duos.find(d=>d.id===personal.id),expected);assert.deepEqual(fresh.catalog.loadouts.find(l=>l.id===selected.id),selected);assert.ok((await fs.readFile(file)).equals(before));assert.equal((await fs.readdir(f.root)).some(n=>n.includes('.recovery-')),false);
 const record=JSON.parse(await fs.readFile(f.currentFile)),cached=JSON.parse(gunzipSync(Buffer.from(record.packed,'base64')));assert.ok(!cached.catalog.duos.some(d=>d.id===personal.id));assert.ok(!cached.catalog.loadouts.some(l=>l.id===selected.id));
});

test('independent skill updates create distinct personal snapshots across restart and community withdrawal',async t=>{
 const f=await fixture(t),addPlan=(c,changed=false)=>{const loadout=c.loadouts.find(l=>l.id==='xayah-kayle-feathers'),order=loadout.skillOrder;c.skillPlans.push({id:'online-xayah-order',name:'独立加点',champion:'Xayah',role:'bottom',loadoutId:loadout.id,order:changed?order[0]+order[2]+order[1]+order.slice(3):order,reason:changed?'先W换血':'先E收羽',patch:c.patch,reviewedAt:'2026-10-24',sources:loadout.sources});};
 f.source(signed({editCatalog:c=>addPlan(c)}));f.phase('Lobby');await f.cache.check();const save=async id=>{const entry={...structuredClone(BUNDLED_CATALOG.duos.find(d=>d.id==='xayah-kayle-guard')),id,name:id};if(id==='local-after-skill'){entry.members[1]={champion:'Janna',role:'support',loadoutId:'default',job:'保护接应'};delete entry.reviewBaseline;delete entry.reviewSourceAnchors;}const saved=await f.store.savePersonal(entry);Object.assign(f.data(),{catalog:saved.catalog,catalogInfo:saved.info});return saved.catalog.duos.find(d=>d.id===id).members[0].loadoutId;};
 const first=await save('local-before-skill');f.source(signed({version:'2026.10.25.4',sequence:now,editCatalog:c=>addPlan(c,true)}));await f.cache.check({force:true});const second=await save('local-after-skill');assert.notEqual(first,second);
 let data=structuredClone(original);const store=await createCatalogStore({root:f.root,getData:()=>data});assert.equal(store.summary().info.recovery,'');const before=await fs.readFile(path.join(f.root,'combinations.json'));const staged=store.prepareCommunity(null,original.patch);staged.commit();const result=store.summary(),a=result.catalog.skillPlans.find(p=>p.loadoutId===first),b=result.catalog.skillPlans.find(p=>p.loadoutId===second);assert(a&&b);assert.notEqual(a.order,b.order);assert.equal(a.reason,'先E收羽');assert.equal(b.reason,'先W换血');assert.ok((await fs.readFile(path.join(f.root,'combinations.json'))).equals(before));
});

for(const budget of ['loadouts','runes','bytes'])test('saving validates the complete fallback '+budget+' budget before touching personal files',async t=>{
 const installed=structuredClone(BUNDLED_CATALOG),originalLoadout=installed.loadouts.find(l=>l.id==='xayah-kayle-feathers'),key=originalLoadout.runes[0],rune=structuredClone(installed.runes[key]),template={id:originalLoadout.id,name:'预算配置',base:originalLoadout.base,why:'预算验证',champions:['Xayah'],roles:['bottom'],items:originalLoadout.items,late:[],boots:originalLoadout.boots,runes:[key]};installed.duos=[];installed.trios=[];installed.links=[];installed.skillPlans=[];installed.runes={[key]:rune};installed.loadouts=[template];const personal={duos:[],trios:[],loadouts:[],runes:{},skillPlans:[]};
 if(budget==='loadouts')for(let n=0;n<501-BUNDLED_CATALOG.loadouts.length;n++)personal.loadouts.push({...structuredClone(template),id:'local-budget-'+n});
 if(budget==='runes')for(let n=0;n<101-Object.keys(BUNDLED_CATALOG.runes).length;n++)personal.runes['local-budget-'+n]=structuredClone(rune);
 if(budget==='bytes')personal.loadouts.push({...structuredClone(template),id:'local-large',extra:'x'.repeat(1500000)});
 const state={schema:1,installed,previous:null,personal,sourceUrl:'',lastCheckedAt:null},f=await fixture(t,{state}),filename=path.join(f.root,'combinations.json'),before=await fs.readFile(filename),entry={...structuredClone(BUNDLED_CATALOG.duos.find(d=>d.id==='xayah-kayle-guard')),id:'local-over-budget'};for(const m of entry.members)m.loadoutId='default';assert.equal(f.store.summary().info.recovery,'');await assert.rejects(f.store.savePersonal(entry),/组合库检查失败/);assert.ok((await fs.readFile(filename)).equals(before));const restarted=await createCatalogStore({root:f.root,getData:()=>f.data()});assert.equal(restarted.summary().info.recovery,'');assert.equal(restarted.summary().catalog.duos.some(d=>d.id===entry.id),false);
});
