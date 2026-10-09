import bundled from './catalog-data.json' with {type:'json'};
import {configureRuleCatalog} from './rules.mjs';
import {configureLoadoutCatalog} from './loadouts.mjs';
import {validateRunePage} from './builds.mjs';
import {loadoutMechanicIssues} from './mechanics.mjs';
import {dependencyChanges} from './catalog-review.mjs';
import {legalSkillOrder} from './skill-advice.mjs';
import {comboMembers,comboKey} from './combo-members.mjs';

export const BUNDLED_CATALOG=bundled;
export const CATALOG_LIMIT=2_000_000;
const roles=['top','jungle','mid','bottom','support'],styles=['balanced','fun','wild'];
const bases=['crit','jhin','onhit','meleeCrit','ezreal','mage','burn','apAssassin','adAssassin','fighter','tank','supportTank','enchanter','senna','pokeSupport'];
const id=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(v);
const hero=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(v);
const str=(v,max=1500)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!v.includes('\0');
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const assert=(ok,msg)=>{if(!ok)throw Error('组合库检查失败：'+msg);};
const baseline=value=>assert(value===undefined||value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=300&&Object.entries(value).every(([id,hash])=>/^(champion:[A-Za-z][A-Za-z0-9]{0,39}|(?:item|rune):\d{1,8})$/.test(id)&&/^[a-f0-9]{16}$/.test(hash)),'资料依赖基线');
export function safeSourceURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&value.length<=1000;}catch{return false;}}
const list=(v,max,check,label)=>{assert(Array.isArray(v)&&v.length<=max&&v.every(check),label);};
function unique(v,key,label){assert(new Set(v.map(key)).size===v.length,label+'重复');}
function sources(v){list(v,12,s=>s&&str(s.name,100)&&safeSourceURL(s.url)&&(s.checkedAt===undefined||date(s.checkedAt))&&(s.kind===undefined||str(s.kind,100)),'来源格式');}
function metadata(c){assert(c&&id(c.id)&&str(c.name,120)&&styles.includes(c.style)&&str(c.why)&&str(c.plan)&&str(c.risk)&&str(c.difficulty,20),'组合内容');list(c.tags,15,v=>str(v,40),'标签');assert(/^\d{2}\.\d{1,2}$/.test(c.patch)&&date(c.reviewedAt),'复核版本与日期');sources(c.sources||[]);assert(c.tempo===undefined||['early','teamfight','protect','poke','growth'].includes(c.tempo),'玩法类型');}
export function validateCatalog(value,data){
 assert(value&&value.schema===1&&JSON.stringify(value).length<=CATALOG_LIMIT,'文件格式或大小');
 const c=structuredClone(value);assert(id(c.id)&&typeof c.version==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/.test(c.version)&&str(c.name,120)&&str(c.notes,4000)&&/^\d{2}\.\d{1,2}$/.test(c.patch)&&date(c.reviewedAt),'库信息');
 assert(c.source&&str(c.source.description,1200)&&safeSourceURL(c.source.url),'库来源');
 list(c.duos,1000,v=>!!v,'双人组合');list(c.trios,500,v=>!!v,'三人组合');list(c.links,3000,v=>Array.isArray(v)&&v.length===3&&hero(v[0])&&hero(v[1])&&v[0]!==v[1]&&str(v[2]),'跨位置联动');
 unique([...c.duos,...c.trios],v=>v.id,'组合 ID');unique(c.duos,comboKey,'双人英雄位置');unique(c.links,v=>v.slice(0,2).sort().join(':'),'联动');
 unique(c.trios,v=>Array.isArray(v.members)?v.members.map(m=>m.role+':'+m.champion).sort().join('|'):String(v.id),'三人英雄位置');
 list(c.loadouts,500,v=>!!v,'出装');unique(c.loadouts,v=>v.id,'出装 ID');
 assert(c.runes&&typeof c.runes==='object'&&!Array.isArray(c.runes)&&Object.keys(c.runes).length<=100,'符文');
 for(const [key,r] of Object.entries(c.runes)){assert(id(key)&&str(r?.name,120)&&str(r.when)&&r.page&&Number.isInteger(r.page.primaryStyleId)&&Number.isInteger(r.page.subStyleId),'符文说明');list(r.page.selectedPerkIds,9,Number.isInteger,'符文页');assert(r.page.selectedPerkIds.length===9,'完整符文页');}
 const configs=new Map(c.loadouts.map(l=>[l.id,l]));
 for(const entry of [...c.loadouts,...c.duos,...c.trios])baseline(entry.reviewBaseline);
 for(const l of c.loadouts){assert(id(l.id)&&str(l.name,120)&&bases.includes(l.base)&&str(l.why),'出装内容');list(l.champions,180,hero,'出装英雄');list(l.roles,5,v=>roles.includes(v),'出装位置');assert(l.champions.length&&l.roles.length,'出装适用范围');
  for(const field of ['items','late'])list(l[field],6,v=>Number.isInteger(v)&&v>0,'装备列表');assert(l.items.length===3&&Number.isInteger(l.boots)&&l.boots>0,'核心装与鞋子');
  list(l.runes,8,v=>Object.hasOwn(c.runes,v),'出装符文');assert(l.runes.length,'出装需要符文');if(l.early)list(l.early,5,v=>Number.isInteger(v)&&v>0,'过渡装备');assert(l.damage===undefined||['ad','ap','mixed'].includes(l.damage),'伤害类型');assert(l.priority===undefined||/^(?!.*(.).*\1)[QWE]{3}$/.test(l.priority),'加点顺序');
  assert(l.patch===undefined||/^\d{2}\.\d{1,2}$/.test(l.patch),'配置复核版本');assert(l.reviewedAt===undefined||date(l.reviewedAt),'配置复核日期');
  assert(l.first===undefined||/^[QWE]{3}$/.test(l.first),'前三级技能');
  assert(l.skillOrder===undefined||l.champions.every(champion=>legalSkillOrder(l.skillOrder,champion)),'技能加点序列');assert(l.skillReason===undefined||str(l.skillReason),'技能加点用途');
  assert(l.summoners===undefined||Array.isArray(l.summoners)&&l.summoners.length===2&&l.summoners.every(v=>typeof v==='string'&&/^Summoner[A-Za-z]+$/.test(v))&&new Set(l.summoners).size===2,'召唤师技能');
  if(data&&l.summoners)assert(l.summoners.every(v=>data.spells[v]),'召唤师技能与资料不符');
  assert(!loadoutMechanicIssues(l,c.runes).length,l.name+'：'+loadoutMechanicIssues(l,c.runes).join('；'));
 }
 const configRef=(key,champion,role)=>{const l=configs.get(key);assert(key==='default'||l&&l.champions.includes(champion)&&l.roles.includes(role),'玩法配置与英雄位置不对应');};
 for(const d of c.duos){metadata(d);list(d.partners||[],30,hero,'第三人参考');
  if(d.members){list(d.members,2,m=>m&&hero(m.champion)&&roles.includes(m.role)&&str(m.job,500)&&id(m.loadoutId),'双人分工');assert(d.members.length===2,'双人需要两个成员');unique(d.members,m=>m.role,'双人位置');unique(d.members,m=>m.champion,'双人英雄');for(const m of d.members)configRef(m.loadoutId,m.champion,m.role);list(d.steps,6,s=>str(s,600),'配合步骤');assert(d.steps.length>=1&&str(d.early)&&str(d.window,500)&&str(d.economy,500),'双人执行卡');assert(d.carry===undefined&&d.support===undefined&&d.loadouts===undefined,'双人位置请使用 members，不能混用下路字段');}
  else{assert(hero(d.carry)&&hero(d.support)&&d.carry!==d.support,'下路英雄');assert(d.loadouts&&typeof d.loadouts==='object','下路玩法配置');configRef(d.loadouts.bottom,d.carry,'bottom');configRef(d.loadouts.support,d.support,'support');}
 }
 for(const t of c.trios){metadata(t);list(t.members,3,m=>m&&hero(m.champion)&&roles.includes(m.role)&&str(m.job,500)&&id(m.loadoutId),'三人分工');assert(t.members.length===3,'三人需要三个成员');unique(t.members,m=>m.role,'三人位置');unique(t.members,m=>m.champion,'三人英雄');for(const m of t.members)configRef(m.loadoutId,m.champion,m.role);list(t.steps,6,s=>str(s,600),'配合步骤');assert(t.steps.length>=2&&str(t.early)&&str(t.window,500)&&str(t.economy,500),'三人执行卡');}
 if(data){const issues=catalogIssues(c,data);assert(!issues.errors.length,issues.errors.slice(0,3).join('；'));}
 return c;
}
export function catalogIssues(c,data){
 const errors=[],status={},loadoutStatus={};const heroes=new Set(data.champions.map(h=>h.id));
 const itemValid=id=>{const i=data.items[id];return i?.maps?.['11']&&(i.inStore&&i.gold?.purchasable!==false||data.items[i.specialRecipe]?.maps?.['11']&&data.items[i.specialRecipe]?.inStore&&data.items[i.specialRecipe]?.gold?.purchasable!==false);};
 const badConfigs=new Set();
 for(const l of c.loadouts){const missing=[...l.items,l.boots,...l.late,...(l.early||[])].filter(id=>!itemValid(id));const badRunes=l.runes.filter(k=>!validateRunePage(c.runes[k]?.page,data.runes));const mechanics=loadoutMechanicIssues(l,c.runes);if(missing.length||badRunes.length||mechanics.length){badConfigs.add(l.id);errors.push(`${l.name}：装备、符文或触发条件失效（${[...missing,...badRunes,...mechanics].join('、')}）`);}for(const h of l.champions)if(!heroes.has(h))errors.push(`${l.name}：英雄 ${h} 不存在`);loadoutStatus[l.id]={invalid:badConfigs.has(l.id),stale:(l.patch||c.patch)!==data.patch,patch:l.patch||c.patch,reviewedAt:l.reviewedAt||c.reviewedAt};}
 for(const [k,r] of Object.entries(c.runes))if(!validateRunePage(r.page,data.runes))errors.push(`符文 ${k} 与当前资料不符`);
 for(const [a,b] of c.links)if(!heroes.has(a)||!heroes.has(b))errors.push(`联动英雄不存在：${a} / ${b}`);
 for(const x of [...c.duos,...c.trios]){const members=comboMembers(x);const reasons=[];
  if(members.some(m=>!heroes.has(m.champion))||(x.partners||[]).some(h=>!heroes.has(h))){reasons.push('含当前资料不存在的英雄');errors.push(x.name+'：英雄不存在');}
  if(members.some(m=>badConfigs.has(m.loadoutId)))reasons.push('专用出装或符文失效');
  const invalid=reasons.length>0,staleConfig=members.some(m=>loadoutStatus[m.loadoutId]?.stale);if(x.patch!==data.patch)reasons.push(`整理版本 ${x.patch}，当前资料 ${data.patch}，待复核`);if(staleConfig)reasons.push('关联配置版本待复核');
  status[x.id]={invalid,stale:x.patch!==data.patch||staleConfig,reasons,reviewedAt:x.reviewedAt,patch:x.patch};
 }
 for(const l of c.loadouts){const changed=dependencyChanges(l,c,data);Object.assign(loadoutStatus[l.id],{changedDependencies:changed,stale:loadoutStatus[l.id].stale||changed.length>0});}
 const reviewTasks=[];
 for(const entry of [...c.duos,...c.trios]){const changed=dependencyChanges(entry,c,data),s=status[entry.id];s.changedDependencies=changed;if(changed.length){s.stale=true;s.reasons.push('关联资料变化：'+changed.map(x=>x.name).join('、'));}const members=entry.members||[{loadoutId:entry.loadouts.bottom},{loadoutId:entry.loadouts.support}];if(members.some(m=>loadoutStatus[m.loadoutId]?.stale)){s.stale=true;if(!s.reasons.includes('关联配置版本待复核'))s.reasons.push('关联配置资料待复核');}if(s.stale||s.invalid)reviewTasks.push({id:entry.id,name:entry.name,reasons:s.reasons,changedDependencies:changed});}
 return {errors:[...new Set(errors)],status,loadoutStatus,reviewTasks,staleLoadouts:Object.values(loadoutStatus).filter(s=>s.stale).length,stale:Object.values(status).filter(s=>s.stale).length,invalid:Object.values(status).filter(s=>s.invalid).length};
}
export function configureCatalog(c){const catalog=validateCatalog(c);configureRuleCatalog(catalog);configureLoadoutCatalog(catalog);return catalog;}
export function mergePersonal(base,personal={duos:[],trios:[],loadouts:[],runes:{}}){
 const result=structuredClone(base);for(const key of ['duos','trios','loadouts']){const additions=personal[key]||[];const ids=new Set(additions.map(x=>x.id));result[key]=result[key].filter(x=>!ids.has(x.id)&&!(['duos','trios'].includes(key)&&additions.some(a=>comboKey(a)===comboKey(x)))).concat(structuredClone(additions));}
 result.runes={...result.runes,...structuredClone(personal.runes||{})};return validateCatalog(result);
}
export function catalogDiff(before,after){const changes=[];for(const [id,name] of Object.entries({name:"组合库名称",notes:"维护说明",source:"来源说明",version:"组合库版本",patch:"整理版本",reviewedAt:"复核日期"}))if(JSON.stringify(before[id])!==JSON.stringify(after[id]))changes.push({kind:"metadata",type:"changed",id,name});for(const key of ['duos','trios','loadouts','runes','links']){const rows=c=>key==='runes'?Object.entries(c.runes).map(([id,v])=>({id,...v})):key==='links'?c.links.map(v=>({id:v.slice(0,2).sort().join(':'),name:v[2],value:v})):c[key];const old=new Map(rows(before).map(v=>[v.id,v])),next=new Map(rows(after).map(v=>[v.id,v]));for(const [id,v] of next)if(!old.has(id)||JSON.stringify(old.get(id))!==JSON.stringify(v))changes.push({kind:key,type:old.has(id)?'changed':'added',id,name:v.name||id});for(const [id,v] of old)if(!next.has(id))changes.push({kind:key,type:'removed',id,name:v.name||id});}return changes;}
