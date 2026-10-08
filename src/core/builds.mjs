import {validMatchups} from './matchups.mjs';
import {validBuildSource,buildSourceLabel,selectedBuildReference} from './build-source.mjs';
import {profile, RULES_PATCH, RULES_VERSION, DUOS, TRIOS} from './rules.mjs';
import {LOADOUT_DATE,LOADOUT_PATCH,RUNE_PLANS,loadoutOptions,comboLoadout,comboSources,mechanismRuneKeys} from './loadouts.mjs';
import {itemConflicts,runeMechanicIssue} from './mechanics.mjs';
import {adaptEquipment} from './adaptive-build.mjs';
import {legalSkillOrder,orderPriority,skillMechanismNote} from './skill-advice.mjs';

export const BUILD_PARSER_VERSION=8;
export function isFreshBuildReference(ref,patch,mode='rift',now=Date.now()){
 const age=now-Date.parse(ref?.fetchedAt);
 return !!ref&&ref.patch===patch&&['rift','hex'].includes(mode)&&(mode==='hex'||ref.parserVersion===BUILD_PARSER_VERSION)&&Number.isFinite(age)&&age>=0&&age<86400000;
}
const rune = (primary,secondary,ids,shards=[5008,5008,5001])=>({primaryStyleId:primary,subStyleId:secondary,selectedPerkIds:[...ids,...shards]});
const ENERGY_USERS=new Set('Akali Kennen LeeSin Shen Zed'.split(' '));
export const SHARDS={5008:'适应之力',5005:'攻击速度',5007:'技能急速',5001:'成长生命值',5010:'移动速度',5011:'生命值',5013:'韧性与减速抗性'};
export function featuredRuneOptions(options,limit=3){
 const source=options.filter(o=>o.source==='OP.GG'),pool=source.length?source:options,selected=[],keystones=new Set(),families=new Set();
 for(const option of pool){const key=option.page.selectedPerkIds[0];if(!keystones.has(key)){selected.push(option);keystones.add(key);families.add(key+':'+option.page.subStyleId);}if(selected.length===limit)break;}
 for(const option of pool){if(selected.length===limit)break;const key=option.page.selectedPerkIds[0]+':'+option.page.subStyleId;if(!families.has(key)){selected.push(option);families.add(key);}}
 for(const option of pool){if(selected.length===limit)break;if(!selected.includes(option))selected.push(option);}
 return selected;
}
const templates={
 crit:{name:'普攻暴击',items:[6672,3031,3046],boots:3006,late:[3036,3072],start:[1055,2003],runes:rune(8000,8200,[8008,9101,9104,8014,8233,8236],[5005,5008,5001]),tips:'依靠普攻持续输出。先保持安全距离，核心装备成型后再主动接团。'},
 jhin:{name:'暴击与爆发',items:[6676,3031,3094],boots:3009,late:[3036,3072],start:[1055,2003],runes:rune(8000,8200,[8021,8009,9103,8014,8233,8236],[5008,5008,5001]),tips:'用第四发子弹换血，W 跟进队友控制；换弹时拉开距离。'},
 onhit:{name:'攻速特效',items:[3153,3124,3085],boots:3006,late:[3091,3026],start:[1055,2003],runes:rune(8000,8400,[8008,9111,9104,8017,8473,8451],[5005,5008,5001]),tips:'重点是连续攻击。对手突进很多时，先增加生存再追求输出。'},
 meleeCrit:{name:'近战持续输出',items:[3153,6673,3031],boots:3006,late:[6333,3026],start:[1055,2003],runes:rune(8000,8400,[8008,9111,9104,8299,8444,8451],[5005,5008,5001]),tips:'先保证能贴近并持续输出，跟队友的控制进场；不要在关键技能空档硬拼。'},
 ezreal:{name:'技能穿插普攻',items:[3078,3004,6694],boots:3158,late:[3072,3026],start:[1055,2003],runes:rune(8000,8300,[8005,8009,9105,8014,8304,8345],[5005,5008,5001]),tips:'尽早开始叠女神之泪。Q 之间穿插普攻，E 优先留给关键躲避。'},
 mage:{name:'法术消耗与爆发',items:[6655,4645,3089],boots:3020,late:[3135,3157],start:[1056,2003,2003],runes:rune(8200,8300,[8229,8226,8210,8237,8345,8347]),tips:'用清线和消耗建立空间。控制命中后再补输出；中娅用于应对关键突进。'},
 burn:{name:'持续法术伤害',items:[6653,3116,3157],boots:3020,late:[3135,3089],start:[1056,2003,2003],runes:rune(8200,8000,[8229,8226,8210,8237,8009,8017]),tips:'让伤害持续覆盖目标。先稳定命中与保持距离，再考虑追击。'},
 apAssassin:{name:'法术切入',items:[3152,4645,3157],boots:3020,late:[3089,3135],start:[1056,2003,2003],runes:rune(8100,8200,[8112,8143,8140,8106,8210,8237]),tips:'等队友先交控制或对手关键技能结束后再切入。保留退出战场的手段。'},
 adAssassin:{name:'物理爆发',items:[3142,6697,3814],boots:3158,late:[6694,3026],start:[1055,2003],runes:rune(8100,8300,[8112,8143,8140,8106,8304,8347],[5008,5008,5001]),tips:'从侧翼接近后排。对手抱团且保护齐全时，先寻找落单目标。'},
 fighter:{name:'战士持续作战',items:[3078,3053,6333],boots:3047,late:[3071,3026],start:[1055,2003],runes:rune(8000,8400,[8010,9111,9105,8299,8473,8451],[5005,5008,5001]),tips:'围绕技能和普攻穿插打持续战。状态不足时先撤，不要只靠冲进去换人。'},
 tank:{name:'前排承伤',items:[3068,2504,6665],boots:3047,late:[3075,3083],start:[1054,2003],runes:rune(8400,8300,[8437,8446,8444,8451,8304,8347],[5005,5008,5001]),tips:'装备抗性跟随对方主要伤害类型调整；先占位置，为队友留输出空间。'},
 supportTank:{name:'辅助开团与保护',items:[3190,3109,3050],boots:3158,late:[3075],start:[3865,2003,2003],runes:rune(8400,8300,[8439,8463,8473,8242,8306,8347],[5007,5008,5001]),tips:'保留辅助装升级位。控制命中后确认队友跟得上，必要时把控制留给保护后排。'},
 enchanter:{name:'增益与保护',items:[6620,6617,3107],boots:3158,late:[3504,3222],start:[3865,2003,2003],runes:rune(8200,8400,[8214,8226,8210,8237,8463,8453],[5007,5008,5001]),tips:'保留辅助装升级位。优先让核心队友活下来，增益要在输出窗口前给到。'},
 senna:{name:'射程与支援',items:[3071,3094,3031],boots:3009,late:[3026,3072],start:[3865,2003,2003],runes:rune(8000,8400,[8021,8009,9104,8014,8473,8453],[5005,5008,5001]),tips:'辅助位保留工资装升级位。利用射程换血，不为追击走进对方开团范围。'},
 pokeSupport:{name:'消耗型辅助',items:[4005,3004,6694],boots:3158,late:[3179],start:[3865,2003,2003],runes:rune(8200,8100,[8229,8226,8210,8237,8126,8106],[5007,5008,5001]),tips:'这是娱乐辅助思路，经济优先保证视野和功能。用远程技能消耗，控制留给关键机会。'},
};
const skillOrders={
 // Mechanism fallback priorities checked against the bundled 16.20 OP.GG pages;
 // source pages still take precedence, and this fallback has no statistical sample.
 Aatrox:'QEW',Akshan:'QEW',Ambessa:'QEW',Anivia:'EQW',AurelionSol:'QEW',Aurora:'QEW',Azir:'WQE',Belveth:'QEW',Briar:'WQE',Evelynn:'QEW',Gnar:'QWE',Illaoi:'EQW',Irelia:'QWE',Jayce:'QWE',Kayn:'QWE',Kled:'QWE',KSante:'QWE',Leblanc:'WQE',Locke:'QEW',Mel:'QEW',Naafiri:'QEW',Qiyana:'QWE',Quinn:'WQE',RekSai:'QEW',Skarner:'QWE',Yunara:'QWE',Zaahen:'QEW',
 Ahri:'QWE',Akali:'QEW',Alistar:'QWE',Amumu:'EQW',Annie:'QWE',Ashe:'WQE',Bard:'QWE',Blitzcrank:'QWE',Brand:'WEQ',Braum:'QEW',Caitlyn:'QWE',Camille:'QEW',Cassiopeia:'EQW',Chogath:'EWQ',Corki:'QEW',Darius:'QEW',Diana:'QWE',Draven:'QWE',DrMundo:'QEW',Ekko:'QEW',Elise:'QWE',Ezreal:'QEW',Fiddlesticks:'WQE',Fiora:'QEW',Fizz:'EWQ',Galio:'QWE',Gangplank:'QEW',Garen:'EQW',Gragas:'QEW',Graves:'QEW',Gwen:'QEW',Hecarim:'QWE',Heimerdinger:'WQE',Hwei:'QEW',Ivern:'EQW',Janna:'EWQ',JarvanIV:'QEW',Jax:'WEQ',Jhin:'QWE',Jinx:'QWE',Kaisa:'QEW',Kalista:'EQW',Karma:'QEW',Karthus:'QEW',Kassadin:'EQW',Katarina:'QEW',Kayle:'QEW',Kennen:'QWE',Khazix:'QWE',Kindred:'QWE',KogMaw:'WQE',LeeSin:'QWE',Leona:'WEQ',Lillia:'QWE',Lissandra:'QWE',Lucian:'QEW',Lulu:'EWQ',Lux:'EQW',Malphite:'QEW',Malzahar:'EQW',Maokai:'QWE',MasterYi:'QEW',Milio:'EWQ',MissFortune:'QWE',Mordekaiser:'QEW',Morgana:'QWE',Nami:'WEQ',Nasus:'QEW',Nautilus:'QWE',Neeko:'QEW',Nidalee:'QEW',Nilah:'QEW',Nocturne:'QEW',Nunu:'QEW',Olaf:'QEW',Orianna:'QWE',Ornn:'WQE',Pantheon:'QEW',Poppy:'QEW',Pyke:'QEW',Rakan:'WQE',Rammus:'QEW',Rell:'WEQ',Renata:'EWQ',Renekton:'QEW',Rengar:'QEW',Riven:'QEW',Rumble:'QEW',Ryze:'QEW',Samira:'QEW',Sejuani:'WQE',Senna:'QWE',Seraphine:'QWE',Sett:'QWE',Shaco:'EWQ',Shen:'QEW',Shyvana:'EWQ',Singed:'QEW',Sion:'QWE',Sivir:'QWE',Smolder:'QWE',Sona:'QWE',Soraka:'WQE',Swain:'QWE',Sylas:'WEQ',Syndra:'QEW',TahmKench:'QWE',Taliyah:'QEW',Talon:'WQE',Taric:'EQW',Teemo:'EQW',Thresh:'QWE',Tristana:'EQW',Trundle:'QWE',Tryndamere:'QEW',TwistedFate:'QWE',Twitch:'EQW',Udyr:'RWQ',Urgot:'WQE',Varus:'WQE',Vayne:'WQE',Veigar:'QWE',Velkoz:'QWE',Vex:'QWE',Vi:'QEW',Viego:'QEW',Viktor:'EQW',Vladimir:'QEW',Volibear:'WQE',Warwick:'WQE',MonkeyKing:'QEW',Xayah:'EWQ',Xerath:'QWE',XinZhao:'WEQ',Yasuo:'QEW',Yone:'QEW',Yorick:'QEW',Yuumi:'EQW',Zac:'EWQ',Zed:'QEW',Zeri:'QEW',Ziggs:'QEW',Zilean:'QWE',Zoe:'QEW',Zyra:'EQW',
};
const firstLevels={Aatrox:'QEW',Akshan:'EQQ',Ambessa:'QWE',Anivia:'QEE',AurelionSol:'EQW',Aurora:'QEW',Azir:'WQE',Belveth:'QEW',Briar:'WEQ',Evelynn:'QEW',Gnar:'QWE',Illaoi:'QWE',Irelia:'QEW',Jayce:'QWE',Kayn:'QEW',Kled:'QEW',KSante:'QEW',Leblanc:'WQE',Locke:'QEW',Mel:'QEW',Naafiri:'QEW',Qiyana:'WQE',Quinn:'EQW',RekSai:'QWE',Skarner:'QWE',Yunara:'QWE',Zaahen:'QEW',Yasuo:'QEW',Yone:'QWE',Jinx:'QWE',Jhin:'QWE',Ashe:'WQE',Caitlyn:'QWE',Corki:'EQW',Lux:'EQW',MissFortune:'QWE',Alistar:'QWE',Malphite:'QEW',Amumu:'QEW',Nautilus:'QWE',Leona:'EQW',Rell:'WQE',Ezreal:'QEW',Lucian:'QEW',Nami:'WEQ',Lulu:'EQW',KogMaw:'WQE',Twitch:'EQW',Samira:'QEW',Nilah:'QEW',Taric:'EQW',Seraphine:'QEW',Sona:'QWE',Zyra:'EQW',Veigar:'QEW',Chogath:'EQW',TahmKench:'QWE',Senna:'QWE',Heimerdinger:'QWE',Ziggs:'QEW',Swain:'EQW',Kalista:'EQW',Pyke:'QEW',Xayah:'WQE',Rakan:'WQE'};

export function validateRunePage(page, trees) {
 if(!page||!Array.isArray(page.selectedPerkIds)||page.selectedPerkIds.length!==9) return false;
 const primary=trees.find(t=>t.id===page.primaryStyleId),secondary=trees.find(t=>t.id===page.subStyleId);
 if(!primary||!secondary||primary.id===secondary.id)return false;
 const ids=page.selectedPerkIds;
 if(!primary.slots.every((s,i)=>s.runes.some(r=>r.id===ids[i])))return false;
 const s1=secondary.slots.findIndex(s=>s.runes.some(r=>r.id===ids[4])),s2=secondary.slots.findIndex(s=>s.runes.some(r=>r.id===ids[5]));
 if(s1<=0||s2<=0||s1===s2)return false;
 return [[5008,5005,5007],[5008,5010,5001],[5011,5013,5001]].every((allowed,i)=>allowed.includes(ids[i+6]));
}
function validSourceRows(rows,data,map,older=false){return Array.isArray(rows)&&rows.length<=30&&rows.every(row=>row&&Array.isArray(row.items)&&row.items.length<=12&&row.items.every(id=>Number.isSafeInteger(id)&&id>0&&(older||data.items[id]?.maps?.[map]))&&Number.isFinite(row.samples)&&row.samples>=0);}
function validSourceMetadata(ref,data,older=false){return Number.isFinite(Date.parse(ref.fetchedAt))&&typeof ref.sourceUrl==='string'&&ref.sourceUrl.startsWith('https://op.gg/')&&
 (ref.summoners===null||Array.isArray(ref.summoners)&&ref.summoners.length===2&&ref.summoners.every(id=>typeof id==='string'&&(older||data.spells[id])))&&
 (ref.priority===null||typeof ref.priority==='string'&&/^[QWER]{3}$/.test(ref.priority)&&new Set(ref.priority).size===3);}
function storedRunePage(page){return !!(page&&Number.isSafeInteger(page.primaryStyleId)&&page.primaryStyleId>0&&Number.isSafeInteger(page.subStyleId)&&page.subStyleId>0&&page.primaryStyleId!==page.subStyleId&&Array.isArray(page.selectedPerkIds)&&page.selectedPerkIds.length===9&&page.selectedPerkIds.every(id=>Number.isSafeInteger(id)&&id>0));}
export function compareBuildPatches(a,b){
 const parts=patch=>/^[1-9]\d*\.[1-9]\d*$/.test(patch||'')?patch.split('.').map(Number):null;
 const left=parts(a),right=parts(b);
 return left&&right?Math.sign(left[0]-right[0]||left[1]-right[1]):null;
}
export function usableBuildPatch(patch,current,allowOlder=false){const order=compareBuildPatches(patch,current);return order===0||allowOlder&&order===-1;}
export function previousPatch(patch){
 const match=/^(\d+)\.(\d+)$/.exec(patch||'');
 return match&&Number(match[2])>1?`${Number(match[1])}.${Number(match[2])-1}`:null;
}
export function validReference(ref,champion,role,data,{allowOlder=false}={}) {
 const older=allowOlder&&compareBuildPatches(ref?.patch,data.patch)===-1;
 return !!(ref&&ref.schema===1&&ref.champion===champion.id&&ref.role===role&&usableBuildPatch(ref.patch,data.patch,allowOlder)&&
  validBuildSource(ref)&&Array.isArray(ref.core)&&ref.core.length&&
  ref.core.every(c=>Array.isArray(c.items)&&c.items.length===3&&c.items.every((id,i)=>Number.isSafeInteger(id)&&id>0&&(older||data.items[id]?.maps?.['11']&&!itemConflicts(id,c.items.slice(0,i)))))&&
  validSourceMetadata(ref,data,older)&&validSourceRows(ref.core,data,'11',older)&&validSourceRows(ref.boots,data,'11',older)&&validSourceRows(ref.start,data,'11',older)&&Array.isArray(ref.later)&&ref.later.every(rows=>validSourceRows(rows,data,'11',older))&&(older?storedRunePage(ref.runePage):validateRunePage(ref.runePage,data.runes))&&
  (ref.runeOptions===undefined||Array.isArray(ref.runeOptions)&&ref.runeOptions.length>0&&ref.runeOptions.length<=18&&ref.runeOptions.every(o=>typeof o.id==='string'&&/^[a-z0-9-]{1,150}$/.test(o.id)&&Number.isFinite(o.samples)&&o.samples>=0&&(older?storedRunePage(o.page):validateRunePage(o.page,data.runes))))&&
  (ref.matchups===undefined||validMatchups(ref.matchups))&&
  (ref.skillOptions===undefined||Array.isArray(ref.skillOptions)&&ref.skillOptions.length<=5&&ref.skillOptions.every(o=>typeof o.id==='string'&&/^[a-z0-9-]{1,150}$/.test(o.id)&&legalSkillOrder(o.order,champion.id)&&Number.isSafeInteger(o.samples)&&o.samples>0)));
}
export function validHexReference(ref,champion,data,{allowOlder=false}={}){
 const older=allowOlder&&compareBuildPatches(ref?.patch,data.patch)===-1;
 return !!(ref&&ref.schema===1&&ref.mode==='hex'&&ref.champion===champion.id&&usableBuildPatch(ref.patch,data.patch,allowOlder)&&ref.region==='global'&&ref.tier==='all'&&
  Array.isArray(ref.core)&&ref.core.length&&ref.core.every(c=>Array.isArray(c.items)&&c.items.length===3&&c.items.every(id=>Number.isSafeInteger(id)&&id>0&&(older||data.items[id]?.maps?.['12'])))&&
  validSourceMetadata(ref,data,older)&&validSourceRows(ref.core,data,'12',older)&&validSourceRows(ref.boots,data,'12',older)&&validSourceRows(ref.start,data,'12',older)&&Array.isArray(ref.later)&&ref.later.every(rows=>validSourceRows(rows,data,'12',older))&&Array.isArray(ref.augmentIds)&&ref.augmentIds.every(Number.isInteger));
}
const conflicts=itemConflicts;
export function getBuild(champion,role,data,{mode='rift',variant='default',conditions=[],coreIndex=0,coreId,loadoutId,comboId,runeId,skillId,laterIds=[]}={}) {
 coreIndex=Number.isInteger(coreIndex)&&coreIndex>=0?coreIndex:0;
 if(!Array.isArray(conditions))conditions=[];
 const p=profile(champion,mode==='hex'?undefined:role);let key=p.build;
 const mechanismRunePage=page=>{const adjusted=structuredClone(page);if(p.manaFree)adjusted.selectedPerkIds=adjusted.selectedPerkIds.map(id=>id===8226?8275:id===8009&&!ENERGY_USERS.has(champion.id)?9111:id);return adjusted;};
 if(champion.id==='Ashe'&&role==='support'&&mode==='rift')key='pokeSupport';
 // Solo-lane Karma/Zilean need an AP route; selected dedicated loadouts still override this base.
 if(['Karma','Zilean'].includes(champion.id)&&role==='mid')key='mage';
 if(variant==='ap'&&['Malphite','Gragas','Chogath','Amumu'].includes(champion.id))key='apAssassin';
 if(variant==='tank')key=role==='support'?'supportTank':'tank';
 const availableLoadouts=loadoutOptions(champion,role,mode).filter(l=>[...l.items,l.boots,...l.late,...(l.early||[])].every(id=>{const i=data.items[id],base=data.items[i?.specialRecipe];return i?.maps?.['11']&&(i.inStore&&i.gold?.purchasable!==false||base?.maps?.['11']&&base.inStore&&base.gold?.purchasable!==false);})&&l.runes.every(k=>validateRunePage(RUNE_PLANS[k]?.page,data.runes)));
 const duo=mode==='rift'?[...TRIOS,...DUOS].find(d=>d.id===comboId&&comboLoadout(d,champion,role)!==null):null;
 const preferred=comboLoadout(duo,champion,role);
 const requested=!loadoutId||loadoutId==='auto'?preferred||'default':loadoutId;
 const config=availableLoadouts.find(c=>c.id===requested);
 const selectionWarnings=[];
 if(comboId&&!duo)selectionWarnings.push('原组合已移出当前库，或不适用于这个英雄位置；请重新确认玩法。');
 if(duo?.patch&&duo.patch!==data.patch)selectionWarnings.push(`这套组合整理于 ${duo.patch}，当前资料 ${data.patch}；机制与专用配置待复核。`);
 if(requested!=='default'&&!config)selectionWarnings.push('原玩法不适用于当前英雄或位置，已使用通用配置。');
 if(config)key=config.base;
 if(config&&data.catalogInfo?.loadoutStatus?.[config.id]?.stale)selectionWarnings.push('这套专用配置关联的资料已变化，请在资料依赖复核中检查后再使用。');
 const t=structuredClone(templates[key]||templates.mage);
 if(champion.id==='Samira'||champion.id==='Nilah'){t.items=[6676,3031,3072];t.late=[3036,3026];t.runes=rune(8000,8100,[8010,9111,9103,8014,8139,8135],[5005,5008,5001]);}
 if(champion.id==='Yasuo'||champion.id==='Yone')t.runes=rune(8000,8400,[8008,9111,9104,8299,8444,8451],[5005,5008,5001]);
 if(config){t.items=[...config.items];t.boots=config.boots;t.late=[...config.late];t.name=config.name;t.tips=config.why;t.runes=structuredClone(RUNE_PLANS[config.runes[0]].page);}
 t.runes=mechanismRunePage(t.runes);
 const support=role==='support'&&mode==='rift';
 if(support)t.start=[3865,2003,2003];
 else if(role==='jungle'&&mode==='rift')t.start=[1103,2003];
 else if(['enchanter','senna','supportTank','pokeSupport'].includes(key))t.start=[p.damage==='ap'?1056:1055,2003];
 const candidate=selectedBuildReference(data,champion.id,role);
 const hexCandidate=data.hexBuilds?.[champion.id];
 const standardRef=validReference(candidate,champion,role,data,{allowOlder:true})?candidate:null;
 const ref=variant!=='default'||config?null:mode==='hex'?(validHexReference(hexCandidate,champion,data,{allowOlder:true})?hexCandidate:null):standardRef;
 const referenceStale=!!ref&&ref.patch!==data.patch;
 if(referenceStale)selectionWarnings.push(`OP.GG ${ref.patch} 旧版本参考 · 当前资料 ${data.patch}；可继续使用，出装按实际局势调整。`);
 if(!standardRef&&mode==='rift'&&!config)selectionWarnings.push('该英雄这个位置暂无可用的 OP.GG 常用统计，当前为机制备选，请核对后使用。');
 if(ref&&coreId){const index=ref.core.findIndex(c=>'core-'+c.items.join('-')===coreId);if(index>=0)coreIndex=index;else{coreIndex=0;selectionWarnings.push('原核心路线不在当前来源中，已回到默认路线，请重新确认。');}}
 coreIndex=ref?Math.min(coreIndex,ref.core.length-1):0;
 if(ref){
  const core=ref.core[Math.max(0,Math.min(ref.core.length-1,coreIndex))];
  t.items=[...core.items];if(ref.runePage)t.runes=structuredClone(ref.runePage);t.late=[];
  t.boots=ref.boots[0]?.items?.[0]||null;
  if(ref.start[0]?.items?.length)t.start=[...ref.start[0].items];
  const selected=[...t.items,...(t.boots?[t.boots]:[])],lateLimit=(support?5:6)-selected.length;
  const laterAvailable=id=>{
   const record=data.items[id],purchase=record?.inStore&&record.gold?.purchasable!==false?record:data.items[record?.specialRecipe];
   const map=mode==='hex'?'12':'11';
   const component=record?.into?.some(childId=>{const child=data.items[childId];return child?.maps?.[map]&&child.inStore&&child.gold?.purchasable!==false&&!child.requiredAlly&&(!child.requiredChampion||child.requiredChampion===champion.id)&&!child.specialRecipe;});
   return record?.maps?.[map]&&purchase?.maps?.[map]&&purchase.inStore&&purchase.gold?.purchasable!==false&&!component&&
    !record.requiredAlly&&(!record.requiredChampion||record.requiredChampion===champion.id)&&!record.tags?.some(t=>['Boots','Consumable','Trinket','Lane','Jungle'].includes(t));
  };
  // JSON provides one pool across all later purchases; HTML snapshots instead
  // provide separate fourth/fifth/sixth purchase groups. Keep that distinction.
  // A pooled item table does not identify the chosen core's later purchases.
  // Keep it as alternatives rather than manufacturing a six-item source build.
  const groups=ref.laterBasis==='all-orders'?[]:ref.later;
  if(ref.laterBasis==='all-orders')for(const id of Array.isArray(laterIds)?[...new Set(laterIds)].slice(0,lateLimit):[]){
   if(ref.later.flat().some(row=>row.items.includes(id))&&laterAvailable(id)&&!conflicts(id,selected)){t.late.push(id);selected.push(id);}
   else selectionWarnings.push('原后期备选不适用于当前核心路线，请重新选择。');
  }
  for(const options of groups){
   do{
    const next=options.flatMap(row=>row.items||[]).find(id=>!conflicts(id,selected)&&laterAvailable(id));
    if(!next)break;t.late.push(next);selected.push(next);
   }while(ref.laterBasis==='all-orders'&&t.late.length<lateLimit);
   if(t.late.length>=lateLimit)break;
  }
 }
 if(ref?.filteredCoreCount)selectionWarnings.push(`来源中 ${ref.filteredCoreCount} 条路线含互斥装备，已过滤，保留其他完整配置。`);
 const map=mode==='hex'?'12':'11';
 const adaptive=adaptEquipment({items:t.items,boots:t.boots,late:t.late,key,support,champion:champion.id,conditions,data,map});
 const {boots,adjustments}=adaptive;
 const resolve=id=>{
  const i=data.items[String(id)];
  if(!i?.maps?.[map])return null;
  if(i.inStore&&i.gold?.purchasable!==false)return i;
  const base=data.items[i.specialRecipe];
  return base?.maps?.[map]&&base.inStore&&base.gold?.purchasable!==false?{...i,purchaseBase:base}:null;
 };
 const sequence=adaptive.sequence;
 const missing=sequence.filter(id=>!resolve(id));
 if(ref){
  const unavailable=[...new Set([...missing,...t.start.filter(id=>!resolve(id))])];
  if(unavailable.length)selectionWarnings.push(`来源中的装备 ${unavailable.map(id=>data.items[id]?.name||id).join('、')} 在当前模式不可购买，已跳过这些装备，其余路线保留。`);
  if(mode==='rift'&&(ref.runeOptions||[{page:ref.runePage}]).some(o=>!validateRunePage(o.page,data.runes)))selectionWarnings.push('部分来源符文已调整或移除，仅列出当前可用的符文，旧出装继续保留。');
 }
 const seen=new Set();const equipment=sequence.map(resolve).filter(i=>{if(!i||seen.has(i.id))return false;seen.add(i.id);return true;});
 const runeOptions=[],runeSeen=new Set();
 const addRune=(option)=>{const page=option.source==='OP.GG'?structuredClone(option.page):mechanismRunePage(option.page);
  if(!validateRunePage(page,data.runes)||runeMechanicIssue(champion.id,page))return;const identity=page.selectedPerkIds.join('-');if(runeSeen.has(identity))return;runeSeen.add(identity);runeOptions.push({...option,page});};
 const addMechanisms=()=>{const plans=champion.id==='DrMundo'&&key==='tank'?['grasp','phase']:config?.runes||mechanismRuneKeys(key,champion,role);for(const id of plans){
  if(['aftershock','glacial'].includes(id)&&['DrMundo'].includes(champion.id))continue;
  const plan=RUNE_PLANS[id];if(plan)addRune({id:`curated-${id}`,name:plan.name,when:plan.when,source:'机制整理',samples:null,page:plan.page});}
 };
 const addSource=()=>{for(const option of standardRef?.runeOptions|| (standardRef?[{id:`source-${standardRef.runePage.selectedPerkIds.join('-')}`,samples:standardRef.runeSamples||0,page:standardRef.runePage}]:[])){
  const keystone=data.runes.flatMap(tree=>tree.slots[0].runes).find(r=>r.id===option.page.selectedPerkIds[0]);
  const secondary=data.runes.find(tree=>tree.id===option.page.subStyleId);
  const explanation=Object.values(RUNE_PLANS).find(p=>p.page.selectedPerkIds[0]===option.page.selectedPerkIds[0])?.when;
  addRune({...option,patch:standardRef.patch,name:`${keystone?.name||'来源符文'} · ${secondary?.name||''}`,when:(explanation?explanation+' ':'')+(config?`${buildSourceLabel(standardRef)}同英雄同位置参考，未验证适合这套娱乐组合。`:`${buildSourceLabel(standardRef)}完整方案；按对线与打法选择。`),source:'OP.GG'});
 }};
 if(mode==='rift'){if(config){addMechanisms();addSource();}else{addSource();addMechanisms();}if(!runeOptions.length)addRune({id:'curated-base',name:'机制基础方案',when:t.tips,source:'机制整理',samples:null,page:t.runes});}
 const chosenRune=runeOptions.find(o=>o.id===runeId)||runeOptions[0];
 if(runeId&&mode==='rift'&&!runeOptions.some(o=>o.id===runeId))selectionWarnings.push('原符文方案已不在当前列表，请重新核对选择。');
 const skillChoices=mode==='rift'?(standardRef?.skillOptions||[]).filter(o=>legalSkillOrder(o.order,champion.id)).map(o=>({...o,name:`来源加点 · ${orderPriority(o.order,champion.id).split('').join(' › ')}`,when:`${buildSourceLabel(standardRef)}样本 ${o.samples} 场${o.samples<200?'，样本较少':''}；仅覆盖前 ${o.order.length} 个技能点，不代表这套组合的最优加点。`,source:'OP.GG'})):[];
 if(config?.skillOrder)skillChoices.unshift({id:'curated-skill-'+config.id,name:config.name+' · 节点加点',order:config.skillOrder,when:config.skillReason||config.why,source:'机制整理',samples:null});
 const defaultSkill=(!config?skillChoices[0]:skillChoices.find(o=>o.source==='机制整理'))||null;
 const selectedSkill=skillChoices.find(o=>o.id===skillId)||defaultSkill;
 if(skillId&&!skillChoices.some(o=>o.id===skillId))selectionWarnings.push('原加点序列已移出当前资料，已回到默认方案。');
 const runePage={...(chosenRune?.page||t.runes),name:`开黑搭子 · ${champion.name}`,current:true};
 const valid=validateRunePage(runePage,data.runes);
 const sampleCount=ref?.core[Math.min(ref.core.length-1,coreIndex)]?.samples||0;
 const sampleText=adaptive.adapted?'原始配置的样本不代表当前调整路线':sampleCount>0?`核心三件套样本 ${sampleCount} 场${sampleCount<200?'，样本较少':''}`:'当前来源未提供这套三件装的样本数';
 const summoners=ref?.summoners||config?.summoners|| (config&&['rengar-bush','pantheon-stun','ap-dive','naafiri-dive'].includes(config.id)?['SummonerFlash','SummonerDot']:config?.id==='farm-tank'?['SummonerFlash','SummonerTeleport']:mode==='hex'?['SummonerFlash','SummonerSnowball']:role==='jungle'?['SummonerFlash','SummonerSmite']:role==='top'?['SummonerFlash','SummonerTeleport']:role==='support'?['SummonerFlash','SummonerExhaust']:role==='bottom'?['SummonerFlash','SummonerBarrier']:['SummonerFlash','SummonerTeleport']);
 const fitsRoute=item=>{
  const ap=item.stats?.FlatMagicDamageMod>0,ad=item.stats?.FlatPhysicalDamageMod>0,defense=item.tags?.some(t=>['Armor','SpellBlock'].includes(t)),utility=item.tags?.includes('ManaRegen');
  const kind=adaptive.routeProfile.kind;
  if(kind==='tank')return !ap&&!ad;
  if(kind==='magic')return !ad&&(!utility||support);
  if(kind==='physical')return (!ap||ad||item.tags?.includes('AttackSpeed'))&&(!utility||support);
  if(kind==='enchanter')return utility||defense;
  return true;
 };
 const laterOptions=ref?.laterBasis==='all-orders'?ref.later.flat().filter(row=>row.items.length===1&&row.items.every(id=>{
  const item=data.items[id];return item&&!conflicts(id,t.items)&&id!==t.boots&&!item.tags?.some(t=>['Boots','Consumable','Trinket','Lane','Jungle'].includes(t))&&!item.requiredAlly&&(!item.requiredChampion||item.requiredChampion===champion.id)&&!item.into?.some(child=>data.items[child]?.maps?.['11']&&data.items[child]?.inStore&&!data.items[child]?.specialRecipe);
 })).map(row=>({...row,items:row.items.map(resolve).filter(Boolean)})).filter(row=>row.items.length).map(row=>({...row,fitsRoute:fitsRoute(row.items[0])})).sort((a,b)=>Number(b.fitsRoute)-Number(a.fitsRoute)||b.samples-a.samples).slice(0,12):[];
 return {key,title:ref?(referenceStale?'旧版本常用参考':mode==='hex'?'海克斯常用配置':'本版本常用配置'):t.name,champion:champion.id,role,mode,selectedCoreIndex:coreIndex,selectedCoreId:ref?'core-'+ref.core[coreIndex].items.join('-'):null,items:equipment,laterOptions,selectedLaterIds:ref?.laterBasis==='all-orders'?t.late.filter(id=>equipment.some(i=>Number(i.id)===id)):[],start:t.start.filter(id=>id!==3865).map(resolve).filter(Boolean),granted:support?[data.items[3865]].filter(Boolean):[],boots,adapted:adaptive.adapted,
  loadoutId:config?.id||'default',loadoutOptions:availableLoadouts,combo:duo?{id:duo.id,title:duo.name,patch:duo.patch,reviewedAt:duo.reviewedAt,plan:duo.plan,risk:duo.risk,sources:comboSources(duo),preferred,members:duo.members?.filter(m=>m.champion!==champion.id),ownJob:duo.members?.find(m=>m.champion===champion.id&&m.role===role)?.job||null,steps:duo.steps||[],window:duo.window||null,early:duo.early||null,economy:duo.economy||null}:null,runeOptions,selectedRuneId:chosenRune?.id||null,selectedRune:chosenRune||null,selectionWarnings,
  support,early:[...new Set([...(config?.early||ref?.core[Math.min(ref.core.length-1,coreIndex)]?.early||[]),...adaptive.early])].filter(id=>!t.start.includes(id)).map(resolve).filter(Boolean),runePage:valid&&mode==='rift'?runePage:null,runeValid:valid,summoners:summoners.filter(id=>data.spells[id]),
  skillChoices,defaultSkillId:defaultSkill?.id||null,selectedSkillId:selectedSkill?.id||null,selectedSkill,skillOrder:selectedSkill?.order||null,skillMechanism:skillMechanismNote(champion.id),priority:selectedSkill?orderPriority(selectedSkill.order,champion.id):config?.priority||ref?.priority||skillOrders[champion.id]||null,first:selectedSkill?.order.slice(0,3)||config?.first||(champion.id==='Qiyana'&&role==='jungle'?'QWE':firstLevels[champion.id])||null,tips:mode==='hex'||!support?t.tips.replace(/保留辅助装升级位。|辅助位保留工资装升级位。/g,''):t.tips,adjustments,
  rulesDate:config?(config.reviewedAt||LOADOUT_DATE):RULES_VERSION,rulesPatch:ref?.patch||(config?(config.patch||LOADOUT_PATCH):RULES_PATCH),stale:!ref&&(data.patch!==(config?(config.patch||LOADOUT_PATCH):RULES_PATCH)||!!data.catalogInfo?.loadoutStatus?.[config?.id]?.stale),
  source:adaptive.adapted?'局势调整路线':ref?(referenceStale?'旧版本 OP.GG 参考':'OP.GG 常用配置'):config?'组合玩法参考':'机制基础方案',reference:ref,referenceStale,
  sourceNote:ref?(mode==='hex'?`OP.GG · 全球海克斯大乱斗 · ${ref.patch}。${sampleText}。后续装备按已选强化调整；不是竞技场或普通大乱斗的配置。`:`OP.GG · ${buildSourceLabel(ref)} · ${ref.patch}。${sampleText}；${chosenRune?.source==='OP.GG'?`${chosenRune.samples>0?'所选符文样本 '+chosenRune.samples+' 场':'来源未提供所选完整符文页的样本数'}`:'所选符文为机制整理，无统计样本'}。核心装与完整符文分别统计，不代表配套胜率；后期装备为独立备选，按局势选入计划。娱乐下路分工可能与常规排位不同。`):config?`按 ${config.patch||LOADOUT_PATCH} 装备与符文整理的玩法参考，复核于 ${config.reviewedAt||LOADOUT_DATE}；社区来源用于玩法启发，不代表国服匹配胜率或最优配置。${chosenRune?.source==='OP.GG'?'当前符文来自同英雄同位置的排位参考，未验证适合这套组合。':''}`:'按英雄定位与技能机制整理；不是统计胜率榜。装备和符文名称随资料版本更新，搭配规则需要独立复核。',
  missing,routeProfile:adaptive.routeProfile,
 };
}
export function buildAsText(build, champion, data) {
 const runeNames=new Map(data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r.name]))));
 return [
  `${champion.name} · ${build.title} · 资料 ${data.version}`,
  build.combo?`组合：${build.combo.title}；${build.combo.plan}`:'',
  `出门购买：${build.start.map(i=>i.name).join('、')}`,
  build.granted?.length?`位置任务：${build.granted.map(i=>i.name).join('、')}由峡谷辅助任务自动给予，以客户端正式位置为准。`:'',
  `装备：${build.items.map(i=>i.name+(i.purchaseBase?`（购买${i.purchaseBase.name}后升级）`:'')).join(' → ')}${build.support?'（另保留辅助装升级位）':''}`,
  build.early?.length?`提前购买：${build.early.map(i=>i.name).join('、')}`:'',
  build.runePage?`符文：${build.runePage.selectedPerkIds.map(id=>runeNames.get(id)||SHARDS[id]).join(' / ')}`:build.mode==='hex'?'海克斯模式请以局内强化选择和实际规则为准。':'符文暂不可用，请核对当前资料版本。',
  build.selectedRune?`符文选择：${build.selectedRune.name}；${build.selectedRune.when}`:'',
  build.summoners.length?`召唤师技能：${build.summoners.map(id=>data.spells[id].name).join(' / ')}`:'',
  build.skillOrder?`加点节点（前 ${build.skillOrder.length} 个技能点）：${build.skillOrder.split('').join(' > ')}；${build.selectedSkill?.when||'根据实时已点技能继续补齐。'}`:build.priority?`加点优先：${build.priority.split('').join(' > ')}；常规英雄通常优先 R，一级技能按对线或入侵调整。`:'',
  build.skillMechanism?`加点机制：${build.skillMechanism}`:'',
  ...build.adjustments.map(a=>`${a.title}：${a.text}`),
  build.tips,
  `${build.source}，参考版本 ${build.rulesPatch}。`,build.sourceNote,
 ].filter(Boolean).join('\n');
}
