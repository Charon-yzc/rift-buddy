import {profile} from './rules.mjs';
import {hexCatalogDisabled} from './hex-catalog.mjs';
import {validHexReference} from './builds.mjs';
import {compareAugments} from './hex-compare.mjs';
import {hexAugmentReference} from './hex-augment-reference.mjs';
import {currentHexReview,hexChampionReview} from './hex-review.mjs';
import {hexRouteItemFingerprint} from './hex-routes.mjs';
import {reviewedHexMechanic as reviewed,hexMechanicIds,hexUltimateRequirement} from './hex-mechanics.mjs';

// These are reviewed mechanic prerequisites, not occurrence eligibility or a
// win-rate model. Unknown versions/keys remain browsable without these claims.
const allyHealers=new Set('Alistar Bard Ivern Janna Karma Kayle Lulu Lux Milio Nami Nidalee Orianna Rakan Renata Senna Seraphine Shen Sona Soraka Taric Yuumi'.split(' '));
const sustainedAttackers=new Set('Ashe Belveth Ezreal Gwen Jax Jinx Kalista Kayle KogMaw Lucian MasterYi Tristana Tryndamere Varus Vayne Viego Volibear Warwick Xayah Yasuo Yone Zeri'.split(' '));
const apAttackers=new Set('Azir Diana Ekko Fizz Gwen Kayle Nidalee Shyvana Teemo TwistedFate'.split(' '));
const labels={preferred:'优先参考',conditional:'看条件选',reference:'资料参考',conflict:'机制冲突',owned:'已标记选过'};
const activeRecord=(data,id)=>{
 const raw=data.augments.find(a=>a.id===id);return raw?hexAugmentReference(raw,{patch:data.patch}):null;
};
const itemRows=(data,ids)=>ids.flatMap(id=>{const item=data.items[id],review=currentHexReview(data.patch);return item?.maps?.['12']&&item.inStore&&item.gold?.purchasable!==false&&(!review||review.items[id]===hexRouteItemFingerprint(item))?[{id,name:item.name}]:[];});

function mechanicAdvice(data,champion,a,owned){
 const kitCurrent=hexChampionReview(champion,data.patch)==='current',p=kitCurrent?profile(champion):null,reasons=[],cautions=[];let affinity=0,conflict=false,conditional=false;
 if(!reviewed(a,data.patch))return {affinity,reasons,cautions,conflict,reviewed:false};
 const has=id=>owned.some(other=>other.id===id&&reviewed(other,data.patch));
 const requirement=hexUltimateRequirement(a,data.patch),dependencies=a.id===1004?owned.filter(other=>hexUltimateRequirement(other,data.patch)):requirement&&has(1004)?[a]:[];
 if(dependencies.length){conflict=true;cautions.push(...dependencies.map(other=>`回归基本功禁用终极技能，${other.name}的主要收益将无法利用。`));}
 if(requirement)reasons.push(requirement);
 if(p&&a.id===1141){
  if(allyHealers.has(champion.id)){affinity+=p.build==='enchanter'?4:1;conditional=p.build!=='enchanter';reasons.push('英雄有已核实的友方治疗或护盾，可满足强化的对象条件；收益取决于实际保护队友的频率。');}
  else cautions.push('英雄自身未核实友方治疗或护盾；自身吸血不能替代这个条件，需要另有可用手段。');
 }
 if(p&&a.id===1045){
  if(p.build==='burn'||p.damageWeights.ap>=.5&&p.sustain){affinity+=3;reasons.push('适合反复施法命中，利用强化灼烧降低基础技能冷却；不把脱战或未命中算作持续收益。');}
 }
 if(p&&a.id===1058){
  if(champion.id==='Camille'&&a.descriptionStatus==='complete'){
   affinity+=2;conditional=true;reasons.push('用实际普攻与 Q 的强化攻击触发攻击特效减冷却；Q2 仍须至少等待1.5秒，技能冷却缩短不会取消这段等待。');
  }
  else if(champion.id==='Hecarim'){
   const partner=owned.find(other=>other.id===1029&&other.descriptionStatus==='complete'&&reviewed(other,data.patch));
   if(a.descriptionStatus==='complete'&&partner){affinity+=4;reasons.push('已拿到虚幻武器，技能命中可施加攻击特效，再联动秘术冲拳；同一目标仍有1秒间隔，不保证无限循环。');}
   else{conditional=true;reasons.push('先靠实际普攻或 E 的强化攻击触发；没有虚幻武器时，不能把所有技能伤害都算作攻击特效。');}
  }
  else if(sustainedAttackers.has(champion.id)){affinity+=3;reasons.push('当前英雄有持续普攻打法，可用实际攻击特效衔接基础技能；仍需安全攻击距离。');}
  else cautions.push('需要实际触发攻击特效；当前技能是否能触发不能只看技能造成伤害。');
 }
 if(p&&champion.id==='Camille'&&a.id===1996&&a.descriptionStatus==='complete'){
  affinity+=2;conditional=true;reasons.push('先有咒刃装备才能利用强化的额外伤害与自疗；获得250金币不等于已经触发咒刃。');
  cautions.push('咒刃有自身冷却，Q2 等待时间仍保留；不把额外伤害或技能增幅直接当作等比例真伤。');
 }
 if(p&&a.id===1129){
  if(p.damageWeights.ap>=.5&&apAttackers.has(champion.id)){affinity+=3;reasons.push('法强与穿插普攻的打法能同时利用；新增伤害是普攻上的物理伤害。');}
  else cautions.push('需要法强和安全普攻机会；纯技能消耗或纯攻击力路线不能直接兑现。');
 }
 if(a.id===1047){
  if(p&&['crit','meleeCrit','jhin','senna'].includes(p.build)){affinity+=2;reasons.push('原有装备方向包含暴击，获得暴击率后再比较攻击力、攻速和暴伤，不只堆几率。');}
  if(has(1048)){affinity+=3;reasons.push('已选珠光护手使适用技能能暴击，新增暴击率可共用；具体技能仍须核对。');}
 }
 if(a.id===1048&&has(1047)){affinity+=3;reasons.push('已选关键暴击提供暴击率，可供适用技能暴击使用；不保证每种技能都适用。');}
 if(p&&a.id===1328&&['Jinx','Caitlyn'].includes(champion.id)){
  affinity+=3;reasons.push('这个英雄已核实有持续暴击普攻路线，可利用普攻暴击叠攻速；只用技能消耗不能替代触发。');
  if(champion.id==='Caitlyn')cautions.push('爆头和暴击不是同一条件；陷阱或绳网提供爆头，不代表普攻必定暴击。');
 }
 if(p&&champion.id==='Jhin'&&[1328,1022].includes(a.id)&&a.descriptionStatus==='complete'){
  affinity+=1;conditional=true;reasons.push((a.id===1328?'先靠普攻暴击叠加攻速。':'获得额外攻速后，')+'按被动提高攻击力与暴击后的移速；固定射速和四发换弹仍然保留。');
 }
 if(p&&a.id===1048&&['Veigar','Lux'].includes(champion.id)){
  affinity+=3;reasons.push('保留已核实的法强伤害技能路线，法强还会提高珠光提供的暴击率；无需为技能暴击整套改买AD装备。');
  cautions.push(champion.id==='Lux'?'W 护盾不是伤害，不能按暴击伤害计算。':'E 控制没有伤害，不能按暴击伤害计算。');
 }
 if(a.id===1004){
  cautions.push('代价是不能使用终极技能，别把基础技能收益理解为保留原来的大招连招。');
  if(p?.window?.kind==='ultimate')cautions.push('这个英雄的已核实主要窗口依赖终极技能，选择前要接受玩法改变。');
 }
 if(a.id===1002)cautions.push('先有可受装备急速影响的装备效果，才有对应收益；不缩短英雄技能冷却。');
 if(a.id===1205)cautions.push('额外攻击力转为法强，需同时核对装备属性和技能加成；不要照搬原有纯AD路线。');
 if(!kitCurrent)cautions.push('本英雄技能源有变动或缺失，英雄适配待复核；仍可核对强化本身效果。');
 return {affinity,reasons,cautions,conflict,conditional,reviewed:true};
}

export function hexEquipmentImpact({data,hero,owned=[]}){
 const champion=data.champions.find(c=>c.id===hero);if(!champion)return [];
 const p=hexChampionReview(champion,data.patch)==='current'?profile(champion):null,records=[...new Set(owned)].slice(0,6).map(id=>activeRecord(data,id)).filter(a=>reviewed(a,data.patch)),has=id=>records.some(a=>a.id===id),rows=[];
 const add=(id,title,why,ids=[])=>rows.push({augment:id,title,why,items:itemRows(data,ids),patch:data.patch,kind:'mechanic'});
 if(has(1002))add(1002,'优先检查装备效果冷却','装备急速只影响可适用的装备效果。法强路线可把中娅作为自保备选，不能据此认为所有装备都值得买。',p?.damageWeights.ap>=.5?[3157]:[]);
 if(has(1129))add(1129,'保留法强，确认普攻空间','强化收益来自法强与实际普攻。当前本来就穿插普攻的法强英雄可比较纳什；纯远程施法不要为此强行近身。',p?.damageWeights.ap>=.5&&apAttackers.has(champion.id)?[3115]:[]);
 if(has(1047))add(1047,'重新比较暴击属性','已经获得暴击几率后，再比较攻击力、攻速和暴击伤害。英雄被动的暴击、溢出与转化规则需要分别核对。');
 if(has(1048))add(1048,'技能暴击不等于必须换AD装','先保住技能所需的伤害属性，再利用已具备的暴击条件。不要因为技能能暴击就把法强英雄整套换成攻击力装备。');
 if(has(1205))add(1205,'额外AD转为AP，先核对加成','这会改变攻击力装备的收益；当前英雄的AP加成、普攻伤害与装备特效仍要分别判断，不自动替换已有方案。');
 if(has(1004))add(1004,'围绕基础技能重新规划','终极技能无法使用。若已有终极刷新或大招工具人，先处理强化冲突，再考虑基础技能伤害与生存。');
 return rows;
}

export function hexRecommendations({data,hero,options=[],owned=[],limit=6}){
 const champion=data.champions.find(c=>c.id===hero);if(!champion)return {rows:compareAugments({options,owned,augments:data.augments,patch:data.patch}).map(row=>({...row,level:'reference',label:labels.reference,priority:0,fromSource:false,mechanicReviewed:false})),bestChoice:null,equipment:[],source:null};
 const ref=data.hexBuilds?.[hero],current=validHexReference(ref,champion,data)&&ref.patch===data.patch;
 const sourceIds=new Set(current?ref.augmentIds:[]),ownedIds=new Set(owned),actual=options.length>0;
 const ids=actual?[...new Set(options)].slice(0,3):sourceIds.size?[...sourceIds]:hexMechanicIds;
 const ownedRecords=[...ownedIds].slice(0,6).map(id=>activeRecord(data,id)).filter(Boolean);
 const rows=ids.map(id=>{
  const a=activeRecord(data,id);if(!a)return null;
  if(hexCatalogDisabled(data,a)&&!actual&&!ownedIds.has(id))return null;
  const advice=mechanicAdvice(data,champion,a,ownedRecords),[base]=compareAugments({champion,options:[id],owned,augments:data.augments,patch:data.patch});
  const unknownSkill=a.unresolved?.includes('SpellName')||/适用技能/.test(a.description||'');
  const level=advice.conflict?'conflict':ownedIds.has(id)?'owned':unknownSkill||advice.conditional?'conditional':advice.affinity>0?'preferred':sourceIds.has(id)?'reference':'conditional';
  const reasons=[...advice.reasons],cautions=[...advice.cautions];
  if(hexCatalogDisabled(data,a))cautions.push('当前目录标记禁用；这里保留你录入的实际选项，以本局服务器提供的选项为准。');
  if(sourceIds.has(id))reasons.push('当前版本 OP.GG 该英雄的强化参考清单包含此项；来源未提供该项正样本数。');
  if(unknownSkill)cautions.push('尚未核实本英雄具体适用哪项技能，先核对局内技能标记，不当作全技能生效。');
  if(!actual&&!sourceIds.has(id)&&advice.affinity<=0)return null;
  const priority=level==='preferred'?10+advice.affinity+(sourceIds.has(id)?1:0):level==='reference'?4:level==='conditional'?1:-1;
  return {...base,reasons:[...new Set([...reasons,...base.reasons])],cautions:[...new Set([...cautions,...base.cautions])],level,label:labels[level],priority,fromSource:sourceIds.has(id),mechanicReviewed:advice.reviewed};
 }).filter(Boolean);
 const ordered=[...rows].sort((a,b)=>b.priority-a.priority||a.id-b.id),first=ordered[0],second=ordered[1];
 return {rows:actual?rows:ordered.slice(0,Math.max(0,Math.min(12,limit))),bestChoice:actual&&first?.level==='preferred'&&first.priority>(second?.priority??-Infinity)?first.id:null,
  equipment:hexEquipmentImpact({data,hero,owned}),source:current?{patch:ref.patch,name:ref.source,url:ref.sourceUrl,fetchedAt:ref.fetchedAt}:null};
}

export function resolveHexAugmentInput(value,augments){
 const text=String(value||'').normalize('NFKC').trim();
 if(!text||text.length>128)throw Error('从列表选择局内实际出现的强化');
 const match=text.match(/^(.*) · #(\d+)$/),records=match?augments.filter(a=>a.id===Number(match[2])&&a.name.normalize('NFKC')===match[1]):augments.filter(a=>a.name.normalize('NFKC')===text);
 if(records.length!==1)throw Error('从列表选择局内实际出现的强化');
 return records[0].id;
}
