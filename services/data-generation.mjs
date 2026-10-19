import {createPublicKey,verify} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {DATA_FEED_KEYS,DATA_FEED_NAMES,DATA_FEED_MAX_PACKED,DATA_FEED_MAX_RAW,feedHash,validFeedPatch,decodeFeedFile,validateFeedBundle} from './data-feed.mjs';
import {validSnapshot} from './data.mjs';
import {hasCurrentCombatStats} from './champion-stats.mjs';
import {mechanicSourceInput} from '../src/core/mechanic-source.mjs';
import {validReference,validHexReference,BUILD_PARSER_VERSION} from '../src/core/builds.mjs';
import {BUILD_REGIONS,BUILD_TIERS,DEFAULT_BUILD_SOURCE,buildSourceKey,sameBuildSource} from '../src/core/build-source.mjs';
import {rankingKey} from '../src/core/rankings.mjs';
import {defaultBuildJobs} from '../src/core/default-build-jobs.mjs';

export const GENERATION_NAMES=Object.freeze(['game',...DATA_FEED_NAMES]);
export const GENERATION_MAX_MANIFEST=192*1024,GENERATION_MAX_PACKED=24*1024*1024,GENERATION_MAX_RAW=48*1024*1024;
const hash=/^[a-f0-9]{64}$/,hero=/^[A-Za-z][A-Za-z0-9]+$/;
const baseFields=new Set('schema contentRevision mechanicSourceRevision itemTooltipRevision version patch fetchedAt checkedAt contentCheckedAt sources cnVersion augmentVersion augmentError champions items runes spells augments'.split(' '));
export const pureGameSnapshot=game=>structuredClone(Object.fromEntries([...baseFields].filter(key=>Object.hasOwn(game,key)).map(key=>[key,game[key]])));
// Source observations and transport checks do not order two different manual
// and automatic snapshots. Compare their actual base content separately from
// the raw local-file token identifying an explicit manual update.
export function generationBaseIdentity(game){
 const base=Object.fromEntries([...baseFields].filter(key=>Object.hasOwn(game,key)&&!['fetchedAt','checkedAt','contentCheckedAt'].includes(key)).map(key=>[key,game[key]]));
 base.champions=base.champions.map(champion=>{const value={...champion};if(value.mechanicSource){value.mechanicSource={...value.mechanicSource};delete value.mechanicSource.observedAt;}return value;});
 const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
 return feedHash(JSON.stringify(stable(base)));
}
const exact=(value,fields)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===fields.length&&fields.every(key=>Object.hasOwn(value,key));
const dated=value=>typeof value==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
const sortedUnique=(values,max,valid)=>Array.isArray(values)&&values.length>0&&values.length<=max&&values.every((value,index)=>valid(value)&&(index===0||values[index-1]<value));
const rankingKeys=patch=>BUILD_REGIONS.flatMap(region=>BUILD_TIERS.map(tier=>rankingKey(patch,{region:region.id,tier:tier.id}))).sort();
const sameKeys=(entries,expected)=>Object.keys(entries).sort().join('\n')===expected.join('\n');
const validVersion=value=>typeof value==='string'&&/^[1-9]\d{0,2}\.[1-9]\d{0,2}\.\d{1,4}$/.test(value);
export function compareGenerationVersions(left,right){
 if(!validVersion(left)||!validVersion(right))throw Error('整套资料版本无效');
 const a=left.split('.').map(Number),b=right.split('.').map(Number);return Math.sign(a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
}
export const generationRelease=value=>feedHash(JSON.stringify({version:value.version,patch:value.patch,files:value.files,recipe:value.recipe}));

export function validateGenerationRecipe(value,patch){
 const key=new RegExp('^[A-Za-z][A-Za-z0-9]+:(?:top|jungle|mid|bottom|support):global:emerald_plus:'+patch.replace('.','\\.')+'$');
 if(!exact(value,['schema','baseSha256','builds','rankings','hex'])||value.schema!==1||!hash.test(value.baseSha256||'')||!sortedUnique(value.builds,5000,v=>typeof v==='string'&&key.test(v))||!sortedUnique(value.hex,1000,v=>typeof v==='string'&&hero.test(v))||!sortedUnique(value.rankings,6,v=>typeof v==='string')||value.rankings.join('\n')!==rankingKeys(patch).join('\n'))throw Error('整套资料采集范围无效');
 return value;
}
export function validateGenerationManifest(value){
 if(!exact(value,['schema','version','patch','sequence','publishedAt','checkedAt','files','recipe','release'])||value.schema!==2||!validFeedPatch(value.patch)||!validVersion(value.version)||value.version.split('.').slice(0,2).join('.')!==value.patch||!Number.isSafeInteger(value.sequence)||value.sequence<1||!dated(value.publishedAt)||!dated(value.checkedAt)||!hash.test(value.release||'')||!exact(value.files,GENERATION_NAMES))throw Error('整套资料清单无效');
 let packed=0,raw=0;
 for(const name of GENERATION_NAMES){
  const file=value.files[name];
  if(!exact(file,['file','sha256','bytes','rawSha256','rawBytes'])||!hash.test(file.sha256||'')||!hash.test(file.rawSha256||'')||file.file!==file.sha256+'.json.gz'||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>DATA_FEED_MAX_PACKED||!Number.isSafeInteger(file.rawBytes)||file.rawBytes<1||file.rawBytes>DATA_FEED_MAX_RAW)throw Error('整套资料文件无效');
  packed+=file.bytes;raw+=file.rawBytes;
 }
 if(packed>GENERATION_MAX_PACKED||raw>GENERATION_MAX_RAW)throw Error('整套资料超过总大小限制');
 validateGenerationRecipe(value.recipe,value.patch);
 if(value.recipe.baseSha256!==value.files.game.rawSha256||generationRelease(value)!==value.release)throw Error('整套资料身份不匹配');
 return value;
}
export function verifyGenerationEnvelope(envelope,{keys=DATA_FEED_KEYS}={}){
 if(!exact(envelope,['keyId','payload','signature'])||typeof envelope.keyId!=='string'||!Object.hasOwn(keys,envelope.keyId)||typeof envelope.payload!=='string'||envelope.payload.length>176*1024||typeof envelope.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature))throw Error('整套资料签名格式无效');
 const payload=Buffer.from(envelope.payload,'base64'),key=createPublicKey(keys[envelope.keyId]);
 if(payload.toString('base64')!==envelope.payload||key.asymmetricKeyType!=='ed25519'||!verify(null,payload,key,Buffer.from(envelope.signature,'base64')))throw Error('整套资料签名校验失败');
 return validateGenerationManifest(JSON.parse(payload));
}
function localIcon(value){return typeof value==='string'&&/^[A-Za-z0-9_/-]+\.(?:png|svg|webp)$/.test(value)&&!value.startsWith('/')&&!value.split('/').includes('..');}
const iconAt=(value,prefix)=>typeof value==='string'&&value.startsWith(prefix)&&localIcon(value.slice(prefix.length));
export function validateGenerationGame(game){
 if(!game||Object.keys(game).some(key=>!baseFields.has(key)))throw Error('整套资料含有非基础字段');
 if(!validSnapshot(game)||game.augmentError||!game.augments.length||!game.sources.augmentDescriptions||game.contentRevision<8||game.mechanicSourceRevision!==1||game.itemTooltipRevision!==1||!game.champions.every(c=>hasCurrentCombatStats(c,game.patch)&&mechanicSourceInput(c,game.patch)?.version===game.version))throw Error('整套基础资料来源不完整');
 const dd='https://ddragon.leagueoflegends.com/cdn/'+game.version+'/data/zh_CN/',cd='https://raw.communitydragon.org/'+game.patch;
 const expected={champions:dd+'championFull.json',items:dd+'item.json',runes:dd+'runesReforged.json',names:'https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js',augments:cd+'/plugins/rcp-be-lol-game-data/global/zh_cn/v1/augment-lists.json',augmentDescriptions:cd+'/game/maps/modespecificdata/kiwi.bin.json',championCombatStats:cd+'/game/data/characters'};
 if(!exact(game.sources,Object.keys(expected))||Object.entries(expected).some(([key,url])=>game.sources[key]!==url))throw Error('基础资料来源地址不匹配');
 const images='https://ddragon.leagueoflegends.com/cdn/'+game.version+'/img/';
 if(!game.champions.every(c=>iconAt(c.icon,images+'champion/'))||!Object.values(game.items).every(item=>iconAt(item.icon,images+'item/'))||!Object.values(game.spells).every(spell=>localIcon(spell.image?.full))||!game.runes.every(tree=>localIcon(tree.icon)&&tree.slots.every(slot=>slot.runes.every(rune=>localIcon(rune.icon))))||!game.augments.every(augment=>iconAt(augment.icon,cd+'/plugins/rcp-be-lol-game-data/global/default/assets/')))throw Error('基础资料图片地址无效');
 return game;
}
export function createGenerationRecipe(bundle,jobs){
 validateGenerationGame(bundle.game);
 return validateGenerationRecipe({schema:1,baseSha256:feedHash(JSON.stringify(bundle.game)),builds:jobs.map(({champion,role})=>buildSourceKey(champion.id,role,DEFAULT_BUILD_SOURCE,bundle.game.patch)).sort(),rankings:rankingKeys(bundle.game.patch),hex:bundle.game.champions.map(c=>c.id).sort()},bundle.game.patch);
}
// This projection consumes a recipe frozen independently before collection;
// missing entries remain missing and fail validation rather than shrinking it.
export function projectGenerationBundle(bundle,recipe){
 return {game:bundle.game,...Object.fromEntries(DATA_FEED_NAMES.map(name=>[name,{schema:name==='builds'?2:1,entries:Object.fromEntries((name==='builds'?recipe.builds:name==='rankings'?recipe.rankings:recipe.hex).map(key=>[key,bundle[name].entries[key]]))}]))};
}
export function validateGenerationBundle(bundle,recipe){
 if(!exact(bundle,GENERATION_NAMES))throw Error('整套资料文件不完整');
 const game=validateGenerationGame(bundle.game);validateGenerationRecipe(recipe,game.patch);
 if(recipe.baseSha256!==feedHash(JSON.stringify(game))||recipe.hex.join('\n')!==game.champions.map(c=>c.id).sort().join('\n'))throw Error('整套基础资料或英雄范围不匹配');
 for(const [name,expected] of [['rankings',recipe.rankings],['builds',recipe.builds],['hex-builds',recipe.hex]])if(!bundle[name]?.entries||!sameKeys(bundle[name].entries,expected)||expected.some(key=>!bundle[name].entries[key]))throw Error('整套资料未覆盖预定采集范围');
 validateFeedBundle(bundle,game);
 const expected=new Set(recipe.builds);
 for(const {champion,role} of defaultBuildJobs(game,bundle.rankings.entries,{}))if(!expected.has(buildSourceKey(champion.id,role,DEFAULT_BUILD_SOURCE,game.patch)))throw Error('整套资料缺少基础分路配置');
 const heroes=new Map(game.champions.map(c=>[c.id,c]));
 for(const ref of Object.values(bundle.builds.entries))if(ref.parserVersion!==BUILD_PARSER_VERSION||!sameBuildSource(ref,DEFAULT_BUILD_SOURCE)||!validReference(ref,heroes.get(ref.champion),ref.role,game))throw Error('整套配置不是当前补丁有效来源');
 for(const [id,ref] of Object.entries(bundle['hex-builds'].entries))if(ref.parserVersion!==3||!validHexReference(ref,heroes.get(id),game))throw Error('整套海克斯资料不是当前补丁有效来源');
 return bundle;
}
export function packGenerationBundle(bundle,recipe){
 validateGenerationBundle(bundle,recipe);const files={},assets={};let rawTotal=0,packedTotal=0;
 for(const name of GENERATION_NAMES){
  const raw=Buffer.from(JSON.stringify(bundle[name]));rawTotal+=raw.length;if(raw.length>DATA_FEED_MAX_RAW||rawTotal>GENERATION_MAX_RAW)throw Error('整套资料超过原始大小限制');
  const packed=gzipSync(raw);packedTotal+=packed.length;if(packed.length>DATA_FEED_MAX_PACKED||packedTotal>GENERATION_MAX_PACKED)throw Error('整套资料超过压缩大小限制');
  const sha256=feedHash(packed);files[name]={file:sha256+'.json.gz',sha256,bytes:packed.length,rawSha256:feedHash(raw),rawBytes:raw.length};assets[sha256]=packed;
 }
 return {files,assets};
}
export async function decodeGenerationAssets(manifest,assets){
 validateGenerationManifest(manifest);const bundle={};
 for(const name of GENERATION_NAMES)bundle[name]=await decodeFeedFile(assets[manifest.files[name].sha256],manifest.files[name]);
 if(bundle.game.version!==manifest.version||bundle.game.patch!==manifest.patch)throw Error('整套资料补丁不匹配');
 return validateGenerationBundle(bundle,manifest.recipe);
}
