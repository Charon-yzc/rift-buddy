import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildAugmentDescriptions} from './augments.mjs';

export const DD = 'https://ddragon.leagueoflegends.com';
export const CN = 'https://game.gtimg.cn/images/lol/act/img/js';
export async function getJSON(url, timeout = 20000) {
  let last;
  for(let attempt=0;attempt<3;attempt++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (!r.ok) throw new Error(`数据源返回 ${r.status}`);
      return await r.json();
    } catch(e) { last=e; }
  }
  throw new Error(`${new URL(url).hostname} 暂时不可用：${last.message}`);
}
export function cleanText(text = '') {
  return String(text).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
export async function collectSnapshot(progress = () => {}, previous = null) {
  progress('正在检查官方资料版本');
  const versions = await getJSON(`${DD}/api/versions.json`);
  const version = versions.find(v => /^\d+\.\d+\.\d+$/.test(v));
  if (!version) throw new Error('官方版本号不可用');
  if(previous?.version===version&&previous.contentRevision===4&&previous.augments?.length&&previous.augments.every(a=>a.description)&&previous.sources?.augmentDescriptions){
    progress('当前已是最新资料版本');
    return {...previous,checkedAt:new Date().toISOString()};
  }
  const base = `${DD}/cdn/${version}/data/zh_CN`;
  const [champions, items, runes, spells, cnResult] = await Promise.all([
    getJSON(`${base}/champion.json`), getJSON(`${base}/item.json`),
    getJSON(`${base}/runesReforged.json`), getJSON(`${base}/summoner.json`),
    getJSON(`${CN}/heroList/hero_list.js`).catch(() => null),
  ]);
  if (Object.keys(champions.data || {}).length < 150 || runes.length !== 5 || !items.data) throw new Error('官方资料不完整，已保留原数据');
  const cnHeroes = new Map((cnResult?.hero || []).map(h => [h.alias.toLowerCase(), h]));
  const patch = version.split('.').slice(0,2).join('.');
  const cd = `https://raw.communitydragon.org/${patch}`;
  progress('正在读取海克斯资料清单');
  let augments = [], augmentSource = null, augmentError = null;
  try {
    const [lists, catalog, bin, dictionary] = await Promise.all([
      getJSON(`${cd}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/augment-lists.json`),
      getJSON(`${cd}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/cherry-augments.json`),
      getJSON(`${cd}/game/maps/modespecificdata/kiwi.bin.json`,35000),
      getJSON(`${cd}/game/zh_cn/data/menu/en_us/lol.stringtable.json`,35000),
    ]);
    const pool = lists.find(l => l.modeName === 'KIWI');
    if (!pool?.augmentList?.length) throw new Error('未找到海克斯大乱斗清单');
    const keys = new Set(pool.augmentList.map(s => s.split('/').at(-1).toLowerCase()));
    augments = catalog.filter(a => keys.has(a.augmentNameId?.toLowerCase())).map(a => {
      return { id:a.id, key:a.augmentNameId, name:a.nameTRA, rarity: a.rarity,
        description:'',
        icon: `${cd}/plugins/rcp-be-lol-game-data/global/default/${a.augmentSmallIconPath.replace('/lol-game-data/assets/', '').toLowerCase()}` };
    });
    augments=buildAugmentDescriptions(augments,bin,dictionary.entries);
    augmentSource = `${cd}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/augment-lists.json`;
  } catch (e) { augmentError = e.message; }
  return {
    schema: 1, contentRevision:4, version, patch, fetchedAt: new Date().toISOString(),checkedAt:new Date().toISOString(),
    sources: { champions:`${base}/champion.json`, items:`${base}/item.json`, runes:`${base}/runesReforged.json`,
      names:`${CN}/heroList/hero_list.js`, augments:augmentSource,
      augmentDescriptions:augmentSource?`${cd}/game/maps/modespecificdata/kiwi.bin.json`:null },
    cnVersion:cnResult?.version || null, augmentError,
    champions:Object.values(champions.data).map(c => ({
      id:c.id, key:Number(c.key), name:cnHeroes.get(c.id.toLowerCase())?.title || c.name,
      title:cnHeroes.get(c.id.toLowerCase())?.name || c.title, tags:c.tags, info:c.info, stats:c.stats,
      keywords:cnHeroes.get(c.id.toLowerCase())?.keywords || `${c.id},${c.name},${c.title}`,
      icon:`${DD}/cdn/${version}/img/champion/${c.image.full}`,
    })),
    items:Object.fromEntries(Object.entries(items.data).map(([id,i]) => [id, {
      id:Number(id), name:i.name, description:cleanText(i.description), tags:i.tags, gold:i.gold, maps:i.maps,
      from:i.from || [], into:i.into || [], inStore:i.inStore !== false, requiredAlly:i.requiredAlly,specialRecipe:i.specialRecipe||null,
      icon:`${DD}/cdn/${version}/img/item/${i.image.full}`,
    }])),
    runes, spells:spells.data, augments,
  };
}
const writeQueues=new Map();
export function atomicJSON(filename, value) {
  const key=path.resolve(filename),content=JSON.stringify(value);
  const pending=(writeQueues.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{
    await fs.mkdir(path.dirname(key),{recursive:true});
    const tmp=`${key}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try{await fs.writeFile(tmp,content,'utf8');await fs.rename(tmp,key);}
    catch(error){await fs.unlink(tmp).catch(()=>{});throw error;}
  });
  writeQueues.set(key,pending);
  pending.finally(()=>{if(writeQueues.get(key)===pending)writeQueues.delete(key);}).catch(()=>{});
  return pending;
}
export function validSnapshot(d){
 return !!(d&&d.schema===1&&/^\d+\.\d+\.\d+$/.test(d.version)&&d.patch===d.version.split('.').slice(0,2).join('.')&&
  Array.isArray(d.champions)&&d.champions.length>=150&&new Set(d.champions.map(c=>c.id)).size===d.champions.length&&
  d.champions.every(c=>/^[A-Za-z][A-Za-z0-9]+$/.test(c.id)&&Number.isInteger(c.key)&&typeof c.name==='string'&&Array.isArray(c.tags))&&
  d.items&&typeof d.items==='object'&&Object.keys(d.items).length>=100&&Object.values(d.items).every(i=>Number.isInteger(i.id)&&typeof i.name==='string'&&i.gold&&i.maps&&Array.isArray(i.tags))&&
  Array.isArray(d.runes)&&d.runes.length===5&&d.runes.every(t=>Number.isInteger(t.id)&&Array.isArray(t.slots)&&t.slots.length===4&&t.slots.every(s=>Array.isArray(s.runes)&&s.runes.length&&s.runes.every(r=>Number.isInteger(r.id)&&typeof r.name==='string')))&&
  d.spells?.SummonerFlash?.image?.full&&Array.isArray(d.augments)&&d.augments.every(a=>Number.isInteger(a.id)&&typeof a.name==='string')&&d.sources);
}
export async function loadSnapshot(root, fallbackRoot) {
  const candidates=[];
  for (const base of [root, fallbackRoot].filter(Boolean)) {
    try { const d = JSON.parse(await fs.readFile(path.join(base,'game.json'),'utf8'));
      if(validSnapshot(d))candidates.push(d);
    } catch { /* Use the bundled snapshot when the user cache is incomplete. */ }
  }
  candidates.sort((a,b)=>{
    const av=a.version.split('.').map(Number),bv=b.version.split('.').map(Number);
    for(let i=0;i<3;i++)if(av[i]!==bv[i])return bv[i]-av[i];
    return (b.contentRevision||0)-(a.contentRevision||0);
  });
  if(candidates.length)return candidates[0];
  throw new Error('资料文件缺失，请重新解压完整程序');
}
