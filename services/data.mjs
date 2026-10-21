import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildAugmentDescriptions} from './augments.mjs';
import {enrichChampionStats,hasCurrentCombatStats} from './champion-stats.mjs';
import {enrichItemDescriptions} from './item-descriptions.mjs';
import {captureChampionMechanicSource} from './champion-mechanics.mjs';
import {mechanicSourceInput} from '../src/core/mechanic-source.mjs';

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
export async function collectSnapshot(progress = () => {}, previous = null, {readJSON=getJSON,recheckVersion=false,clock=()=>Date.now()}={}) {
  progress('正在检查官方资料版本');
  const versions = await readJSON(`${DD}/api/versions.json`);
  const version = versions.find(v => /^\d+\.\d+\.\d+$/.test(v));
  if (!version) throw new Error('官方版本号不可用');
  const checkAge=clock()-Date.parse(previous?.contentCheckedAt||previous?.fetchedAt),recentCheck=Number.isFinite(checkAge)&&checkAge>=0&&checkAge<86400000;
  if(!recheckVersion&&recentCheck&&previous?.version===version&&previous.itemTooltipRevision===1&&previous.contentRevision>=8&&previous.mechanicSourceRevision===1&&previous.champions?.every(c=>hasCurrentCombatStats(c,previous.patch)&&mechanicSourceInput(c,previous.patch)?.version===version)&&previous.augments?.length&&previous.augments.every(a=>a.description)&&previous.sources?.augmentDescriptions){
    // Tencent's names can catch up after Data Dragon has already shipped this
    // patch. Checking the same static version must not pin that older CN data.
    const cn=await readJSON(`${CN}/heroList/hero_list.js`).catch(()=>null);
    const names=new Map((Array.isArray(cn?.hero)?cn.hero:[]).filter(h=>typeof h?.alias==='string'&&typeof h.title==='string'&&h.title.trim()&&typeof h.name==='string'&&h.name.trim()&&typeof h.keywords==='string').map(h=>[h.alias.toLowerCase(),h]));
    if(cn?.version===previous.patch&&previous.champions.every(c=>names.has(c.id.toLowerCase()))){
      progress('已核对同补丁国服英雄名称资料');
      previous={...previous,cnVersion:cn.version,champions:previous.champions.map(c=>{const h=names.get(c.id.toLowerCase());return {...c,name:h.title,title:h.name,keywords:h.keywords};})};
    }else progress('国服名称来源尚未提供完整同补丁资料，保留既有名称与版本记录');
    if(previous.contentRevision<9){
      try{
        const cd=`https://raw.communitydragon.org/${previous.patch}`,[bin,strings]=await Promise.all([readJSON(`${cd}/game/items.cdtb.bin.json`,35000),readJSON(`${cd}/game/zh_cn/data/menu/en_us/lol.stringtable.json`,35000)]);
        if(!bin||!Object.keys(bin).length||!strings?.entries||!Object.keys(strings.entries).length)throw Error('装备公式来源不完整');
        const items=enrichItemDescriptions(previous.items,bin,strings,previous.patch);
        if(!Object.entries(items).some(([id,item])=>item!==previous.items[id])||Object.entries(previous.items).some(([id,item])=>item.tooltip?.patch===previous.patch&&items[id]===item))throw Error('装备公式来源未覆盖已有记录');
        const bundled=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
        if(bundled.version!==previous.version||bundled.contentRevision<9)throw Error('缺少同版本公式复核基线');
        const count=(description,pattern)=>(description?.match(pattern)||[]).length;
        for(const [id,item]of Object.entries(previous.items)){
          const next=items[id]?.tooltip,known=bundled.items[id]?.tooltip;if(known?.patch!==previous.patch)continue;
          if(item.tooltip?.status==='complete'&&next?.status!=='complete'||count(next?.description,/%法术强度/g)<count(known.description,/%法术强度/g)||count(next?.description,/〔数值未解析〕/g)>count(known.description,/〔数值未解析〕/g))throw Error('已核对的装备公式未补齐');
        }
        previous={...previous,items,contentRevision:9};
        progress('已补齐当前版本法强装备公式');
      }catch{progress('装备公式暂未补齐，保留原公式并等待重试');}
    }
    progress('当前已是最新资料版本');
    return {...previous,checkedAt:new Date(clock()).toISOString()};
  }
  const base = `${DD}/cdn/${version}/data/zh_CN`;
  const [champions, items, runes, spells, cnResult] = await Promise.all([
    readJSON(`${base}/championFull.json`), readJSON(`${base}/item.json`),
    readJSON(`${base}/runesReforged.json`), readJSON(`${base}/summoner.json`),
    readJSON(`${CN}/heroList/hero_list.js`).catch(() => null),
  ]);
  if (Object.keys(champions.data || {}).length < 150 || runes.length !== 5 || !items.data) throw new Error('官方资料不完整，已保留原数据');
  const cnHeroes = new Map((cnResult?.hero || []).map(h => [h.alias.toLowerCase(), h]));
  const patch = version.split('.').slice(0,2).join('.');
  const cd = `https://raw.communitydragon.org/${patch}`;
  const enrichedChampions=await enrichChampionStats(Object.values(champions.data),patch,readJSON,progress);
  let itemDescriptions=null;
  try{const [bin,strings]=await Promise.all([readJSON(`${cd}/game/items.cdtb.bin.json`,35000),readJSON(`${cd}/game/zh_cn/data/menu/en_us/lol.stringtable.json`,35000)]);itemDescriptions=enrichItemDescriptions(items.data,bin,strings,patch);progress('已解析当前版本装备数值与条件公式');}
  catch{progress('装备详细公式暂不可用，保留官方基础描述');}
  progress('正在读取海克斯资料清单');
  let augments = [], augmentSource = null, augmentError = null;
  try {
    const [lists, catalog, bin, dictionary] = await Promise.all([
      readJSON(`${cd}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/augment-lists.json`),
      readJSON(`${cd}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/cherry-augments.json`),
      readJSON(`${cd}/game/maps/modespecificdata/kiwi.bin.json`,35000),
      readJSON(`${cd}/game/zh_cn/data/menu/en_us/lol.stringtable.json`,35000),
    ]);
    const pool = lists.find(l => l.modeName === 'KIWI');
    if (!pool?.augmentList?.length) throw new Error('未找到海克斯大乱斗清单');
    const listKeys=pool.augmentList.map(s=>s.split('/').at(-1).toLowerCase()),keys=new Set(listKeys);
    if(keys.has('')||keys.size!==listKeys.length)throw Error('海克斯清单含有重复或不完整记录');
    const selected=catalog.filter(a=>keys.has(a.augmentNameId?.toLowerCase())),found=new Set(selected.map(a=>a.augmentNameId.toLowerCase()));
    if(found.size!==keys.size||selected.length!==keys.size||new Set(selected.map(a=>a.id)).size!==selected.length)throw Error('海克斯目录缺失或重复，保留完整本地资料');
    augments = selected.map(a => {
      return { id:a.id, key:a.augmentNameId, name:a.nameTRA, rarity: a.rarity,
        description:'',
        icon: `${cd}/plugins/rcp-be-lol-game-data/global/default/${a.augmentSmallIconPath.replace('/lol-game-data/assets/', '').toLowerCase()}` };
    });
    augments=buildAugmentDescriptions(augments,bin,dictionary.entries);
    augmentSource = `${cd}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/augment-lists.json`;
  } catch (e) { augmentError = e.message; }
  return {
    schema: 1, contentRevision:10, mechanicSourceRevision:1,itemTooltipRevision:itemDescriptions?1:0,version, patch, fetchedAt: new Date(clock()).toISOString(),checkedAt:new Date(clock()).toISOString(),contentCheckedAt:new Date(clock()).toISOString(),
    sources: { champions:`${base}/championFull.json`, items:`${base}/item.json`, runes:`${base}/runesReforged.json`,
      names:`${CN}/heroList/hero_list.js`, augments:augmentSource,
      augmentDescriptions:augmentSource?`${cd}/game/maps/modespecificdata/kiwi.bin.json`:null,
      championCombatStats:`${cd}/game/data/characters` },
    cnVersion:cnResult?.version || null, augmentError,
    champions:enrichedChampions.map(c => ({
      id:c.id, key:Number(c.key), name:cnHeroes.get(c.id.toLowerCase())?.title || c.name,
      title:cnHeroes.get(c.id.toLowerCase())?.name || c.title, tags:c.tags, info:c.info, stats:c.stats,
      combatStatsSource:c.combatStatsSource,
      mechanicSource:captureChampionMechanicSource(c,patch,version,new Date(clock()).toISOString()),
      mechanics:{passive:{name:c.passive?.name,description:cleanText(c.passive?.description)},spells:c.spells.map(s=>({name:s.name,description:cleanText(s.description),maxrank:s.maxrank,cooldown:s.cooldown,cost:s.cost,effect:s.effect}))},
      keywords:cnHeroes.get(c.id.toLowerCase())?.keywords || `${c.id},${c.name},${c.title}`,
      icon:`${DD}/cdn/${version}/img/champion/${c.image.full}`,
    })),
    items:Object.fromEntries(Object.entries(items.data).map(([id,i]) => [id, {
      id:Number(id), name:i.name, description:cleanText(i.description), tags:i.tags, gold:i.gold, maps:i.maps,
      from:i.from || [], into:i.into || [], inStore:i.inStore !== false, requiredAlly:i.requiredAlly,requiredChampion:i.requiredChampion,stats:i.stats,specialRecipe:i.specialRecipe||null,
      icon:`${DD}/cdn/${version}/img/item/${i.image.full}`, ...(itemDescriptions?.[id]?.tooltip?{tooltip:itemDescriptions[id].tooltip}:{}),
    }])),
    runes, spells:spells.data, augments,
  };
}
const writeQueues=new Map();
export function atomicJSON(filename, value, {space=0,mode}={}) {
  const key=path.resolve(filename),content=JSON.stringify(value,null,space);
  const pending=(writeQueues.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{
    await fs.mkdir(path.dirname(key),{recursive:true});
    const tmp=`${key}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try{
      await fs.writeFile(tmp,content,'utf8');
      if(mode!==undefined)await fs.chmod(tmp,mode);
      // Windows readers/indexers can briefly hold the destination open. Keep
      // the old file intact and the write queue ordered while retrying rename;
      // never delete the destination or replace it with a non-atomic write.
      const delays=[25,50,100,200,400,800];
      for(let attempt=0;;attempt++){
        try{await fs.rename(tmp,key);break;}
        catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=delays.length)throw error;await new Promise(resolve=>setTimeout(resolve,delays[attempt]));}
      }
    }
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
  (d.contentRevision<8||d.contentRevision===undefined||d.mechanicSourceRevision===1&&d.champions.every(c=>mechanicSourceInput(c,d.patch)?.version===d.version))&&
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
