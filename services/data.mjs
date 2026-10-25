import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildAugmentDescriptions,AUGMENT_TOOLTIP_PARSER_REVISION} from './augments.mjs';
import {enrichChampionStats,hasCurrentCombatStats} from './champion-stats.mjs';
import {enrichItemDescriptions,enrichItemModeDescriptions,hasCurrentItemDescription} from './item-descriptions.mjs';
import {hasItemModeTooltip} from '../src/core/item-mode-tooltip.mjs';
import {captureChampionMechanicSource} from './champion-mechanics.mjs';
import {mechanicSourceInput} from '../src/core/mechanic-source.mjs';
import {AUGMENT_COUNTER_BASIS_REVISION,validAugmentCounterBasis} from '../src/core/augment-counter-basis.mjs';

export const DD = 'https://ddragon.leagueoflegends.com';
export const CN = 'https://game.gtimg.cn/images/lol/act/img/js';
const hasAugmentDetails=a=>a.tooltip?.revision===1&&!!a.tooltip.description&&Number.isSafeInteger(a.tooltipParserRevision)&&a.tooltipParserRevision>=AUGMENT_TOOLTIP_PARSER_REVISION&&(a.tooltipParserRevision>AUGMENT_TOOLTIP_PARSER_REVISION||/^[a-f0-9]{64}$/.test(a.effectSourceHash||''));
const hasCounterCompletion=a=>Number.isSafeInteger(a.tooltipParserRevision)&&a.tooltipParserRevision>AUGMENT_TOOLTIP_PARSER_REVISION||Number.isSafeInteger(a.tooltipCounterBasis?.revision)&&a.tooltipCounterBasis.revision>AUGMENT_COUNTER_BASIS_REVISION||validAugmentCounterBasis(a);
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
  let itemSources;
  const readItemSources=patch=>itemSources??=Promise.all([readJSON(`https://raw.communitydragon.org/${patch}/game/items.cdtb.bin.json`,35000),readJSON(`https://raw.communitydragon.org/${patch}/game/zh_cn/data/menu/en_us/lol.stringtable.json`,35000)]);
  const completeItemModes=(items,patch)=>Object.values(items).some(i=>i.tooltip?.patch===patch)&&Object.values(items).every(i=>hasItemModeTooltip(i,patch));
  const completeItemDescriptions=(items,patch)=>Object.values(items).some(i=>i.tooltip?.patch===patch)&&Object.values(items).every(i=>hasCurrentItemDescription(i,patch));
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
        const [bin,strings]=await readItemSources(previous.patch);
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
    const pendingDescriptions=previous.contentRevision>=9?Object.entries(previous.items).filter(([,item])=>!hasCurrentItemDescription(item,previous.patch)):[];
    const pendingModes=Object.entries(previous.items).filter(([,item])=>!hasItemModeTooltip(item,previous.patch));
    if(pendingDescriptions.length||pendingModes.length){
      try{
        const [bin,strings]=await readItemSources(previous.patch);
        if(!bin||!Object.keys(bin).length||!strings?.entries||!Object.keys(strings.entries).length)throw Error('海克斯装备参数来源不完整');
        const bases=pendingDescriptions.length?enrichItemDescriptions(Object.fromEntries(pendingDescriptions),bin,strings,previous.patch):{};
        if(pendingDescriptions.some(([id,item])=>bases[id]===item||!hasCurrentItemDescription(bases[id],previous.patch)))throw Error('装备基础字段未覆盖待核对记录');
        for(const [id,item]of pendingDescriptions){const old=item.tooltip,next=bases[id].tooltip,count=text=>(text?.match(/〔数值未解析〕/g)||[]).length;if(old.description?.trim()&&!next.description?.trim()||old.status==='complete'&&next.status!=='complete'||count(next.description)>count(old.description))throw Error('已有装备说明未完整保留');}
        const items={...previous.items,...bases},pending=Object.entries(items).filter(([,item])=>!hasItemModeTooltip(item,previous.patch)),parsed=enrichItemModeDescriptions(Object.fromEntries(pending),bin,strings,previous.patch);
        if(pending.some(([id,item])=>parsed[id]===item||!hasItemModeTooltip(parsed[id],previous.patch)))throw Error('海克斯装备参数未覆盖待核对记录');
        previous={...previous,items:{...items,...parsed}};
        progress('已核对同版本装备基础字段与公开海克斯参数');
      }catch{progress('装备基础字段或海克斯参数暂未补齐，保留原资料并等待重试');}
    }
    const needsAugmentRepair=a=>!hasAugmentDetails(a)||!hasCounterCompletion(a);
    if(previous.augments.some(needsAugmentRepair)){
      try{
        const cd=`https://raw.communitydragon.org/${previous.patch}`,[bin,strings]=await Promise.all([readJSON(`${cd}/game/maps/modespecificdata/kiwi.bin.json`,35000),readJSON(`${cd}/game/zh_cn/data/menu/en_us/lol.stringtable.json`,35000)]);
        const pending=previous.augments.filter(needsAugmentRepair),parsed=buildAugmentDescriptions(pending,bin,strings?.entries||{});
        if(parsed.some(a=>!a.description||a.descriptionStatus==='missing'||!hasAugmentDetails(a)||!hasCounterCompletion(a)))throw Error('强化完整说明或计数来源未覆盖已有清单');
        for(let i=0;i<pending.length;i++){
          const old=pending[i],next=parsed[i];if(!hasAugmentDetails(old))continue;
          if(old.descriptionStatus==='complete'&&next.descriptionStatus!=='complete'||old.tooltip.status==='complete'&&next.tooltip.status!=='complete'||(next.unresolved||[]).some(key=>!(old.unresolved||[]).includes(key))||(next.tooltip.unresolved||[]).some(key=>!(old.tooltip.unresolved||[]).includes(key)))throw Error('强化计数来源不能降低已完整解析的说明');
        }
        // Preserve already completed records, including newer parser results
        // received from the signed feed, when repairing a mixed older cache.
        let index=0;const augments=previous.augments.map(a=>needsAugmentRepair(a)?parsed[index++]:a);
        previous={...previous,augments};
        progress('已补齐同版本强化详细数值与动态计数资料');
      }catch{progress('强化详细数值或计数资料暂未补齐，保留原资料并等待重试');}
    }
    // Parser completion lives on each augment, so it cannot skip an unfinished
    // revision-8 item migration or force the detail sources to be read again.
    if(previous.contentRevision>=9&&previous.augments.every(hasAugmentDetails))previous={...previous,contentRevision:Math.max(completeItemModes(previous.items,previous.patch)?completeItemDescriptions(previous.items,previous.patch)?previous.augments.every(hasCounterCompletion)?18:17:16:15,previous.contentRevision)};
    progress(previous.augments.every(a=>hasAugmentDetails(a)&&hasCounterCompletion(a))?'当前已是最新资料版本':'部分强化资料待补齐，保留既有可用内容');
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
  try{const [bin,strings]=await readItemSources(patch);itemDescriptions=enrichItemModeDescriptions(enrichItemDescriptions(items.data,bin,strings,patch),bin,strings,patch);progress('已解析当前版本装备数值与公开海克斯参数');}
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
    schema: 1, contentRevision:itemDescriptions&&augments.length&&augments.every(hasAugmentDetails)?completeItemModes(itemDescriptions,patch)?completeItemDescriptions(itemDescriptions,patch)?augments.every(hasCounterCompletion)?18:17:16:15:11, mechanicSourceRevision:1,itemTooltipRevision:itemDescriptions?1:0,version, patch, fetchedAt: new Date(clock()).toISOString(),checkedAt:new Date(clock()).toISOString(),contentCheckedAt:new Date(clock()).toISOString(),
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
      icon:`${DD}/cdn/${version}/img/item/${i.image.full}`, ...(itemDescriptions?.[id]?.tooltip?{tooltip:itemDescriptions[id].tooltip,tooltipParserRevision:itemDescriptions[id].tooltipParserRevision}:{}),
      ...(itemDescriptions?.[id]?.modeTooltips?{modeTooltips:itemDescriptions[id].modeTooltips}:{}),
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
