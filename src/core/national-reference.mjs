import {validateRunePage} from './rune-page.mjs';

export const NATIONAL_PROVIDER='tencent101';
export const NATIONAL_ORIGIN='https://mlol.qt.qq.com';
export const NATIONAL_TIERS=Object.freeze([{id:'gold_plus',name:'黄金+',code:24},{id:'emerald_plus',name:'翡翠+',code:26},{id:'diamond_plus',name:'钻石+',code:27}]);
const lanes={TOP:'top',JUNGLE:'jungle',MIDDLE:'mid',BOTTOM:'bottom',SUPPORT:'support'};
export const NATIONAL_VERSION_URL=NATIONAL_ORIGIN+'/go/database/versionlist?zone=lol&from=h5';
const patchPattern=/^\d{1,3}\.\d{1,3}$/;
const sampleScope='腾讯101公开国服参考，未确认全区、队列及完整样本覆盖';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
export function nationalRequest(input,data){
 const kind=input?.kind,tier=input?.tier||'emerald_plus',choice=NATIONAL_TIERS.find(t=>t.id===tier);
 if(!['rankings','build'].includes(kind)||!choice||!patchPattern.test(data?.patch||''))throw Error('国服资料筛选不正确');
 const request={kind,tier,patch:data.patch};
 if(kind==='build'){
  const hero=data.champions.find(h=>h.id===input.champion),lane=Object.keys(lanes).find(k=>lanes[k]===input.role);
  if(!hero||!lane)throw Error('国服英雄或分路不正确');
  Object.assign(request,{champion:hero.id,role:input.role,championKey:Number(hero.key),lane});
 }
 return request;
}
export function nationalKey(input,data){const r=nationalRequest(input,data);return [NATIONAL_PROVIDER,r.patch,r.tier,r.kind,r.champion||'',r.role||''].join(':');}
export function nationalURL(input,data,part='rankings'){
 const r=nationalRequest(input,data),tier=NATIONAL_TIERS.find(t=>t.id===r.tier);
 if(r.kind==='rankings'&&part!=='rankings'||r.kind==='build'&&!['build','runes'].includes(part))throw Error('国服资料类型不正确');
 const endpoint=part==='rankings'?'lol_101strategy':part==='runes'?'lol_101strategy_runeinfo':'lol_101strategy_build';
 const params=new URLSearchParams({itier:String(tier.code),version_id:r.patch,lane:r.lane||'ALL'});
 if(r.kind==='rankings'){params.set('sort_metric','1');params.set('sort_order','2');}else params.set('championid',String(r.championKey));
 return NATIONAL_ORIGIN+'/go/battle_info/odp_proxy/'+endpoint+'?'+params;
}
function unpack(raw){
 if(raw?.code!==0)throw Error('腾讯国服来源未返回有效资料');
 const fields=raw.data?._fieldValues,values=fields?Object.values(fields).filter(v=>v!==''&&v!==null):[];
 if(values.length>1)throw Error('国服来源响应字段已变化');
 let value=values[0]??raw.data?.result??raw.result??raw.data;
 if(typeof value==='string'){if(!value)throw Error('该补丁或筛选暂未提供国服资料');value=JSON.parse(value);}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('国服资料格式已变化');return value;
}
export function requireNationalVersion(raw,patch){
 if(raw?.code!==0||!Array.isArray(raw.data)||!raw.data.some(v=>v?.name===patch&&typeof v.public_date==='string'))throw Error('腾讯来源尚未确认当前补丁，不使用旧版本代替');
 return patch;
}
function date(value,fetchedAt){
 if(typeof value!=='string'||!/^\d{8}$/.test(value))throw Error('国服数据日期缺失');
 const day=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6),parsed=Date.parse(day+'T00:00:00+08:00');
 if(!Number.isFinite(parsed)||new Date(parsed+8*3600000).toISOString().slice(0,10)!==day||!Number.isFinite(Date.parse(fetchedAt))||parsed>Date.parse(fetchedAt))throw Error('国服数据日期无效');return day;
}
const percent=value=>{if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value)||Number(value)>100)throw Error('国服百分比无效');return Number(value)/100;};
const positive=value=>{if(!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(Number(value)))throw Error('国服名次或场次无效');return Number(value);};
function metadata(input,data,fetchedAt,sourceDate){const r=nationalRequest(input,data);return {schema:1,provider:NATIONAL_PROVIDER,key:nationalKey(r,data),kind:r.kind,patch:r.patch,tier:r.tier,...(r.kind==='build'?{champion:r.champion,role:r.role}:{}),sourceDate,fetchedAt,sourceURL:'https://101.qq.com/',sampleScope};}
export function parseNationalRankings(raw,{data,tier='emerald_plus',fetchedAt=new Date().toISOString()}){
 const body=unpack(raw),sourceDate=date(body.dtstatdate,fetchedAt),heroes=new Map(data.champions.map(h=>[Number(h.key),h.id])),seen=new Set(),boards=Object.fromEntries(Object.values(lanes).map(role=>[role,[]]));
 if(typeof body.datadetails!=='string'||!body.datadetails||body.datadetails.length>2e6)throw Error('国服榜单为空或过大');
 for(const encoded of body.datadetails.split('#').filter(Boolean)){
  const parts=encoded.split('_');if(parts.length<8)throw Error('国服榜单字段缺失');
  const [rank,key,tierName,lane,win,pick,ban]=parts,role=lanes[lane],champion=heroes.get(positive(key)),identity=champion+':'+role;
  if(!champion||!role||!/^T[0-4]$/.test(tierName)||seen.has(identity))throw Error('国服英雄、分路、梯级或重复记录不正确');seen.add(identity);
  boards[role].push({champion,role,rank:positive(rank),tier:Number(tierName.slice(1)),winRate:percent(win),pickRate:percent(pick),banRate:percent(ban),samples:null});
 }
 if(Object.values(boards).some(rows=>!rows.length))throw Error('国服榜单没有覆盖五路');
 for(const rows of Object.values(boards))rows.sort((a,b)=>a.rank-b.rank||a.champion.localeCompare(b.champion));
 return {...metadata({kind:'rankings',tier},data,fetchedAt,sourceDate),boards};
}
export function parseNationalBuild(rawBuild,rawRunes,{data,tier='emerald_plus',champion,role,fetchedAt=new Date().toISOString()}){
 const input={kind:'build',tier,champion,role},build=unpack(rawBuild),runes=unpack(rawRunes),sourceDate=date(build.dtstatdate,fetchedAt);
 if(date(runes.dtstatdate,fetchedAt)!==sourceDate)throw Error('国服装备与符文的数据日期不一致');
 const sections={};
 for(const [name,field] of Object.entries({start:'starting_details',boots:'shoes_details',core:'core_details',fourth:'forth_details',fifth:'fifth_details',sixth:'sixth_details'})){
  if(typeof build[field]!=='string'||build[field].length>100000)throw Error('国服装备字段缺失');
  const seen=new Set();sections[name]=build[field].split('#').filter(Boolean).map(encoded=>{
   const parts=encoded.split('_');if(parts.length!==4)throw Error('国服装备行格式已变化');
   const items=parts[0].split(',').map(positive),rank=positive(parts[1]);
   if(items.length>6||name==='core'&&items.length!==3||seen.has(rank)||items.some(id=>!data.items[id]?.maps?.['11']))throw Error('国服装备不存在或不适用于峡谷');seen.add(rank);
   return {items,rank,pickRate:percent(parts[2]),winRate:percent(parts[3]),samples:null};
  }).sort((a,b)=>a.rank-b.rank);
 }
 if(!sections.core.length||!sections.boots.length||!sections.start.length)throw Error('国服核心装备、鞋或出门装缺失');
 if(typeof runes.rune_top_details!=='string'||runes.rune_top_details.length>200000)throw Error('国服完整符文缺失');
 const trees=new Map(data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,t.id])))),seenPages=new Set(),seenRanks=new Set();
 const pages=runes.rune_top_details.split('#').filter(Boolean).map(encoded=>{
  const p=encoded.split('_');if(p.length!==7)throw Error('国服符文行格式已变化');
  const rank=positive(p[0]),ids=p[3].split(',').map(positive),page={primaryStyleId:trees.get(ids[0]),subStyleId:trees.get(ids[4]),selectedPerkIds:ids},identity=ids.join('-');
  if(Number(p[1])!==ids[0]||!validateRunePage(page,data.runes)||seenPages.has(identity)||seenRanks.has(rank))throw Error('国服符文页不完整、重复或与当前版本不符');seenPages.add(identity);seenRanks.add(rank);
  return {rank,page,pickRate:percent(p[4]),winRate:percent(p[5]),samples:positive(p[6])};
 }).sort((a,b)=>a.rank-b.rank);
 if(!pages.length)throw Error('国服完整符文为空');
 return {...metadata(input,data,fetchedAt,sourceDate),sections,runes:pages};
}
export function validNationalReference(ref,data){
 try{
  const keys=['schema','provider','key','kind','patch','tier','sourceDate','fetchedAt','sourceURL','sampleScope',...(ref?.kind==='rankings'?['boards']:['champion','role','sections','runes'])];
  if(!exact(ref,keys)||ref.schema!==1||ref.provider!==NATIONAL_PROVIDER||ref.patch!==data.patch||ref.key!==nationalKey(ref,data)||ref.sourceURL!=='https://101.qq.com/'||ref.sampleScope!==sampleScope||!/^\d{4}-\d{2}-\d{2}$/.test(ref.sourceDate)||!Number.isFinite(Date.parse(ref.fetchedAt)))return false;
  const rawDate=ref.sourceDate.replaceAll('-','');date(rawDate,ref.fetchedAt);
  const rate=x=>Number.isFinite(x)&&x>=0&&x<=1,hero=new Set(data.champions.map(h=>h.id));
  if(ref.kind==='rankings')return exact(ref.boards,Object.values(lanes))&&Object.values(lanes).every(role=>Array.isArray(ref.boards[role])&&ref.boards[role].length&&ref.boards[role].length<=data.champions.length&&new Set(ref.boards[role].map(r=>r.champion)).size===ref.boards[role].length&&ref.boards[role].every(r=>exact(r,['champion','role','rank','tier','winRate','pickRate','banRate','samples'])&&hero.has(r.champion)&&r.role===role&&Number.isSafeInteger(r.rank)&&r.rank>0&&Number.isInteger(r.tier)&&r.tier>=0&&r.tier<=4&&r.samples===null&&['winRate','pickRate','banRate'].every(k=>rate(r[k]))));
  const sections=['start','boots','core','fourth','fifth','sixth'],ordered=rows=>rows.every((r,i)=>!i||r.rank>rows[i-1].rank);
  return exact(ref.sections,sections)&&sections.every(k=>Array.isArray(ref.sections[k])&&ref.sections[k].length<=30&&ordered(ref.sections[k])&&ref.sections[k].every(r=>exact(r,['items','rank','pickRate','winRate','samples'])&&Number.isSafeInteger(r.rank)&&r.rank>0&&r.samples===null&&rate(r.pickRate)&&rate(r.winRate)&&Array.isArray(r.items)&&r.items.length>0&&r.items.length<=6&&(k!=='core'||r.items.length===3)&&r.items.every(id=>Number.isSafeInteger(id)&&data.items[id]?.maps?.['11'])))&&ref.sections.start.length>0&&ref.sections.boots.length>0&&ref.sections.core.length>0&&Array.isArray(ref.runes)&&ref.runes.length>0&&ref.runes.length<=30&&ordered(ref.runes)&&new Set(ref.runes.map(r=>r.page?.selectedPerkIds?.join('-'))).size===ref.runes.length&&ref.runes.every(r=>exact(r,['rank','page','pickRate','winRate','samples'])&&exact(r.page,['primaryStyleId','subStyleId','selectedPerkIds'])&&Number.isSafeInteger(r.rank)&&r.rank>0&&Number.isSafeInteger(r.samples)&&r.samples>0&&rate(r.pickRate)&&rate(r.winRate)&&validateRunePage(r.page,data.runes));
 }catch{return false;}
}
