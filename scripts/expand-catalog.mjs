import fs from 'node:fs/promises';
import {EXPANDED_DUOS,EXPANDED_TRIOS,EXPANDED_LOADOUTS,EXPANSION_DATE} from '../src/core/expanded-combos.mjs';
import {validateCatalog} from '../src/core/catalog.mjs';
import {reviewBaseline} from '../src/core/catalog-review.mjs';
import {atomicJSON} from '../services/data.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8')),c=JSON.parse(await fs.readFile('src/core/catalog-data.json','utf8'));
if(data.patch!=='16.19')throw Error('这份人工扩充只复核了 16.19；请先更新并复核 expanded-combos.mjs，不能给旧方案自动盖新版本日期。');
const official=id=>({name:'Riot · '+data.champions.find(h=>h.id===id).name+'技能资料',url:`https://ddragon.leagueoflegends.com/cdn/${data.version}/data/zh_CN/champion/${id}.json`,kind:'技能依据',checkedAt:EXPANSION_DATE});
const taricSource={name:'MOBAFire · 26.19 塔里克指南',url:'https://www.mobafire.com/league-of-legends/build/patch-26-19-quick-taric-guide-613270',kind:'社区玩法参考',checkedAt:EXPANSION_DATE};
for(const l of EXPANDED_LOADOUTS){const old=c.loadouts.findIndex(x=>x.id===l.id);const next={...l,patch:data.patch,reviewedAt:EXPANSION_DATE,...(old>=0&&c.loadouts[old].reviewBaseline?{reviewBaseline:c.loadouts[old].reviewBaseline}:{})};if(old>=0)c.loadouts[old]=next;else c.loadouts.push(next);}
const specific={Taric:'taric-guardian',Nilah:'nilah-sustain',Samira:'samira-reset',Nami:'nami-empower',Lulu:'lulu-onhit',Milio:'milio-range',Rakan:'rakan-engage',Braum:'braum-peel',Renata:'renata-rescue',Lucian:'lucian-trade',Jhin:'jhin-control',Swain:'swain-brawl'};
const resolve=(id,role)=>{const target=specific[id];return target&&c.loadouts.find(l=>l.id===target&&l.roles.includes(role))?target:c.loadouts.find(l=>l.champions.includes(id)&&l.roles.includes(role))?.id||'default';};
for(const d of EXPANDED_DUOS)if(!c.duos.some(x=>x.carry===d.carry&&x.support===d.support))c.duos.push({...d,patch:data.patch,reviewedAt:EXPANSION_DATE,sources:[official(d.carry),official(d.support),...(d.support==='Taric'?[taricSource]:[])],loadouts:{bottom:resolve(d.carry,'bottom'),support:resolve(d.support,'support')}});
for(const t of EXPANDED_TRIOS){const signature=t.members.map(m=>m.champion+':'+m.role).sort().join('|');if(!c.trios.some(x=>x.members.map(m=>m.champion+':'+m.role).sort().join('|')===signature))c.trios.push({...t,patch:data.patch,reviewedAt:EXPANSION_DATE,sources:t.members.map(m=>official(m.champion)),members:t.members.map(m=>({...m,loadoutId:resolve(m.champion,m.role)}))});}
// Improve existing bindings, while retaining their original review dates.
for(const d of c.duos){for(const [role,id] of [['bottom',d.carry],['support',d.support]])if(specific[id]&&c.loadouts.find(l=>l.id===specific[id]&&l.roles.includes(role)))d.loadouts[role]=specific[id];if(d.support==='Taric'){if(!d.sources.some(s=>s.url===taricSource.url))d.sources.push(taricSource);if(d.carry==='Kalista')d.loadouts.support='taric-glacial';}}
for(const entry of [...c.loadouts,...c.duos,...c.trios]){entry.reviewBaseline||=reviewBaseline(entry,c,data);if(!entry.champions&&!entry.sources.length)entry.sources=(entry.members?.map(m=>m.champion)||[entry.carry,entry.support]).map(official);if(!entry.champions&&!entry.tempo)entry.tempo=/保护|养成|养龙|救援|长射/.test(entry.tags.join(' ')+' '+entry.name)?'protect':/消耗|远程|推线/.test(entry.tags.join(' '))?'poke':'teamfight';}
c.version='2026.10.06.1';c.notes='扩充可执行的下路与三人配合、明确经济分工和失败条件；新增保护/接控/增益配置与技能节点。资料依赖基线用于提醒未来复核，不代表对局验证。';c.reviewedAt=EXPANSION_DATE;
c.source={...c.source,date:EXPANSION_DATE,patch:data.patch,version:data.version};
validateCatalog(c,data);await atomicJSON('src/core/catalog-data.json',c,{space:2});
console.log(JSON.stringify({duos:c.duos.length,trios:c.trios.length,loadouts:c.loadouts.length,runes:Object.keys(c.runes).length}));
