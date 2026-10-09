import bundledCatalog from "./catalog-data.json" with {type:"json"};
import {championWindow,SUSTAIN_CONDITIONS} from './champion-windows.mjs';
export let COMBINATION_SOURCE=bundledCatalog.source;
export const ROLES = [
 {id:'top',name:'上路',short:'上',hint:'抗压 · 边线'}, {id:'jungle',name:'打野',short:'野',hint:'节奏 · 支援'},
 {id:'mid',name:'中路',short:'中',hint:'支援 · 输出'}, {id:'bottom',name:'下路',short:'下',hint:'发育 · 持续输出'},
 {id:'support',name:'辅助',short:'辅',hint:'开团 · 保护'},
];
export const STYLES = {
 balanced:{name:'稳定配合',sub:'简单好配合，阵容更完整'},
 fun:{name:'娱乐实用',sub:'有配合、有乐趣，也能认真打'},
 wild:{name:'整活尝鲜',sub:'试试非常规搭配，看看能擦出什么火花'},
};
export let RULES_VERSION = bundledCatalog.reviewedAt;
export let RULES_PATCH = bundledCatalog.patch;

// Common starting positions for the library, not a ranking of patch strength.
// All declared positions remain selectable and participate in recommendations.
export const PRIMARY_ROLES={
 Akali:'mid',Aurora:'mid',Cassiopeia:'mid',Corki:'bottom',Diana:'jungle',Ekko:'mid',
 Fiddlesticks:'jungle',Galio:'mid',Ivern:'jungle',Karthus:'jungle',Karma:'support',
 Kennen:'top',Lucian:'bottom',Lulu:'support',Maokai:'support',Morgana:'support',
 Naafiri:'mid',Nautilus:'support',Nami:'support',Pantheon:'top',Poppy:'jungle',
 Qiyana:'mid',Rakan:'support',Rell:'support',Rengar:'jungle',Ryze:'mid',Senna:'support',
 Seraphine:'bottom',Shaco:'jungle',Smolder:'bottom',Swain:'mid',Sylas:'mid',
 TahmKench:'top',Taliyah:'jungle',Talon:'mid',Tristana:'bottom',Udyr:'jungle',
 Vayne:'bottom',Vladimir:'mid',Warwick:'jungle',MonkeyKing:'jungle',Yasuo:'mid',Yone:'mid',
 Zac:'jungle',Zed:'mid',Zilean:'support',Zyra:'support',Ashe:'bottom',Brand:'support',
 Amumu:'jungle',Bard:'support',Janna:'support',Milio:'support',
 Locke:'mid',Mel:'mid',Yunara:'bottom',Zaahen:'top',
};

const ROLE_GROUPS = {
 top:'Aatrox Akali Ambessa Aurora Camille Cassiopeia Chogath Darius DrMundo Fiora Gangplank Garen Gnar Gragas Gwen Heimerdinger Illaoi Irelia Jax Jayce KSante Kayle Kennen Kled Malphite Mordekaiser Nasus Olaf Ornn Pantheon Poppy Quinn Renekton Rengar Riven Rumble Ryze Sett Shen Singed Sion Smolder Teemo Trundle Tryndamere Udyr Urgot Vayne Vladimir Volibear Warwick MonkeyKing Yasuo Yone Yorick Zac',
 jungle:'Amumu Belveth Brand Briar Chogath Diana DrMundo Ekko Elise Evelynn Fiddlesticks Gragas Graves Gwen Hecarim Ivern JarvanIV Jax Karthus Kayn Khazix Kindred LeeSin Lillia MasterYi Maokai Morgana Naafiri Nidalee Nocturne Nunu Olaf Pantheon Poppy Qiyana Rammus RekSai Rell Rengar Rumble Sejuani Shaco Shen Shyvana Skarner Sylas Taliyah Talon Trundle Udyr Vi Viego Volibear Warwick MonkeyKing XinZhao Zac Zed Zyra',
 mid:'Ahri Akali Akshan Anivia Annie AurelionSol Aurora Azir Brand Cassiopeia Chogath Corki Diana Ekko Fizz Galio Gangplank Gragas Heimerdinger Hwei Irelia Jayce Karma Kassadin Katarina Kennen Leblanc Lissandra Lucian Lux Malzahar Mel Morgana Naafiri Neeko Orianna Pantheon Qiyana Ryze Seraphine Smolder Swain Sylas Syndra Taliyah Talon Tristana TwistedFate Veigar Velkoz Vex Viktor Vladimir Xerath Yasuo Yone Zed Ziggs Zilean Zoe Zyra',
 bottom:'Aphelios Ashe Caitlyn Corki Draven Ezreal Hwei Jhin Jinx Kaisa Kalista Karthus Kennen Kindred KogMaw Lucian MissFortune Nilah Samira Senna Seraphine Sivir Smolder Swain TahmKench Tristana Twitch Varus Vayne Veigar Xayah Yasuo Yone Zeri Ziggs Heimerdinger Chogath',
 support:'Alistar Amumu Ashe Bard Blitzcrank Brand Braum Camille Chogath Fiddlesticks Galio Gragas Heimerdinger Ivern Janna Karma Leona Lissandra Lulu Lux Malphite Maokai Milio Morgana Nami Nautilus Neeko Pantheon Poppy Pyke Rakan Rell Renata Senna Seraphine Sett Shaco Shen Sona Soraka Swain TahmKench Taric Thresh Velkoz Xerath Yuumi Zac Zilean Zyra',
};
const groups = Object.fromEntries(Object.entries(ROLE_GROUPS).map(([k,v])=>[k,new Set(v.split(' '))]));
// A declared primary position must also be eligible in the usual-position list.
for(const [id,role] of Object.entries(PRIMARY_ROLES))groups[role].add(id);
// Position membership records which identities this mechanic profile has been
// reviewed for. A future data-only hero must not silently become an AD fighter.
groups.jungle.add('Locke');
export const PROFILE_PATCH='16.20';
const unusualPositions={bottom:new Set('Kennen Kindred TahmKench Chogath Yone'.split(' ')),jungle:new Set('Rell Shen DrMundo Jax Qiyana Sylas Zed'.split(' ')),support:new Set('Camille Chogath Fiddlesticks Gragas Ivern Lissandra Malphite Sett Shaco Shen Zac'.split(' '))};
export function conventionalRole(champion,role,cache=null){
 const key=cache?`${champion.id}:${role}`:null;
 let p=key?cache.get(key):null;
 if(!p){p=profile(champion,role);if(key)cache.set(key,p);}
 return p.reviewed&&p.roles.includes(role)&&!unusualPositions[role]?.has(champion.id);
}
const traitSets = {
 frontline:'Alistar Amumu Blitzcrank Braum Chogath DrMundo Galio Garen Gragas KSante Leona Malphite Maokai Mordekaiser Nautilus Nunu Ornn Poppy Rammus Rell Sejuani Sett Shen Sion Skarner TahmKench Taric Udyr Volibear Warwick Zac',
 engage:'Alistar Amumu Annie Ashe Blitzcrank Camille Diana Fiddlesticks Galio Gragas Hecarim JarvanIV Leona Lissandra Malphite Maokai Nautilus Neeko Nocturne Nunu Ornn Pantheon Rakan Rell Sejuani Sett Shen Sion Skarner Thresh Vi Volibear MonkeyKing Zac',
 peel:'Alistar Braum Galio Ivern Janna Karma Lulu Milio Morgana Nami Poppy Rakan Renata Senna Seraphine Shen Sona Soraka TahmKench Taric Thresh Yuumi Zilean',
 poke:'Ashe Brand Caitlyn Corki Ezreal Heimerdinger Hwei Jayce Karma Karthus Lux MissFortune Nidalee Orianna Seraphine Varus Velkoz Vex Viktor Xerath Ziggs Zoe Zyra',
 sustain:'Aphelios Ashe Azir Belveth Cassiopeia Corki Draven Gwen Jax Jinx Kaisa Kalista Kayle Kindred KogMaw Lucian MasterYi Nilah Samira Sivir Smolder Tristana Twitch Varus Vayne Viego Xayah Yasuo Yone Zeri',
 aoe:'Amumu Anivia Annie AurelionSol Brand Diana Fiddlesticks Galio Gragas Hwei Kennen Lillia Malphite MissFortune Neeko Orianna Rell Rumble Samira Seraphine Swain Velkoz Viktor MonkeyKing Yasuo Ziggs Zyra',
 ap:'Ahri Akali Amumu Anivia Annie AurelionSol Aurora Azir Brand Cassiopeia Chogath Diana Ekko Elise Evelynn Fiddlesticks Fizz Galio Gragas Gwen Heimerdinger Hwei Ivern Janna Karma Karthus Kassadin Katarina Kayle Kennen Leblanc Lillia Lissandra Lulu Lux Malphite Malzahar Mel Milio Mordekaiser Morgana Nami Neeko Nidalee Nunu Orianna Rumble Ryze Sejuani Seraphine Shaco Shyvana Singed Sona Soraka Swain Sylas Syndra Taliyah Teemo TwistedFate Veigar Velkoz Vex Viktor Vladimir Xerath Yuumi Zac Ziggs Zilean Zoe Zyra',
};
const sets=Object.fromEntries(Object.entries(traitSets).map(([k,v])=>[k,new Set(v.split(' '))]));
// Riot champion mechanics, checked 2026-10-09. Sustain means continuing damage,
// not healing. These tags are curated functions, never strength or win rates.
for(const id of ['Locke','Yunara','Zaahen'])sets.sustain.add(id);
// Repeated attacks (W/E/crit cycles) and repeatable Q casts also supply sustained
// damage. Reviewed against each champion's 16.20.1 Riot skill descriptions.
for(const id of ['Trundle','Tryndamere','Olaf','Fiora','Ryze','Ezreal','Irelia'])sets.sustain.add(id);
for(const id of Object.keys(SUSTAIN_CONDITIONS))sets.sustain.add(id);
for(const id of ['Mel','Yunara'])sets.aoe.add(id);
sets.poke.add('Mel');sets.engage.add('Zaahen');sets.ap.add('Locke');
const TANKS=new Set('Alistar Amumu Blitzcrank Braum Chogath DrMundo KSante Leona Malphite Maokai Nautilus Nunu Ornn Rammus Rell Sejuani Shen Sion Skarner TahmKench Taric Zac'.split(' '));
const ENCHANTERS=new Set('Ivern Janna Karma Lulu Milio Nami Renata Sona Soraka Yuumi Zilean'.split(' '));
const ONHIT=new Set('Kaisa Kalista KogMaw Vayne Varus Kayle'.split(' '));
const MAGES_DOT=new Set('Brand Cassiopeia Lillia Malzahar Mordekaiser Rumble Singed Swain Zyra'.split(' '));
const MAGES_MANAFREE=new Set('Akali Katarina Kennen Vladimir Rumble Mordekaiser'.split(' '));
const ASSASSINS=new Set('Akali Diana Ekko Elise Evelynn Fizz Kassadin Katarina Leblanc Locke Naafiri Nidalee Shaco Sylas Talon Zed Qiyana Khazix Rengar Pyke'.split(' '));
export function profile(c, role) {
 const roles=ROLES.filter(r=>groups[r.id].has(c.id)).map(r=>r.id);
 const reviewed=roles.length>0;
 if(!roles.length) roles.push(c.tags.includes('Marksman')?'bottom':c.tags.includes('Support')?'support':c.tags.includes('Mage')?'mid':'top');
 if(!reviewed)return {roles,reviewed:false,build:null,damage:null,damageWeights:{ad:0,ap:0},manaFree:null,difficulty:c.info?.difficulty??5,...Object.fromEntries(Object.keys(sets).filter(k=>k!=='ap').map(k=>[k,null]))};
 if(roles.includes(PRIMARY_ROLES[c.id]))roles.sort((a,b)=>Number(b===PRIMARY_ROLES[c.id])-Number(a===PRIMARY_ROLES[c.id]));
 let build=sets.ap.has(c.id)?'mage':'fighter';
 if(c.tags.includes('Marksman')&&!sets.ap.has(c.id)) build=ONHIT.has(c.id)?'onhit':'crit';
 if(MAGES_DOT.has(c.id)) build='burn';
 if(ASSASSINS.has(c.id)) build=sets.ap.has(c.id)?'apAssassin':'adAssassin';
 if(TANKS.has(c.id)) build='tank';
 if(ENCHANTERS.has(c.id)) build='enchanter';
 if(['Yasuo','Yone','Tryndamere'].includes(c.id)) build='meleeCrit';
 if(c.id==='Ezreal') build='ezreal';
 if(c.id==='Senna') build='senna';
 if(['Thresh','Rakan'].includes(c.id))build='tank';
 if(c.id==='Bard')build='enchanter';
 if(c.id==='Jhin') build='jhin';
 if(c.id==='Seraphine') build=role==='support'?'enchanter':'mage';
 if(role==='support'&&build==='tank') build='supportTank';
 if(role==='support'&&['Galio','Gragas','Rakan'].includes(c.id))build='supportTank';
 const magic=sets.ap.has(c.id)||['Alistar','Bard','Braum','Leona','Nautilus','Ornn','Rakan','Rammus','Rell','Renata','Thresh'].includes(c.id);
 const mixed=['Kaisa','KogMaw','Varus','Jax','Yone','Udyr','Volibear','Shen','Yunara'].includes(c.id);
 return {roles,reviewed,build,damage:magic?'ap':'ad',damageWeights:mixed?{ad:.55,ap:.45}:magic?{ad:0,ap:1}:{ad:1,ap:0},manaFree:MAGES_MANAFREE.has(c.id),
  difficulty:c.info?.difficulty??5,window:championWindow(c.id),sustainCondition:SUSTAIN_CONDITIONS[c.id]||null,...Object.fromEntries(Object.entries(sets).filter(([k])=>k!=='ap').map(([k,v])=>[k,v.has(c.id)]))};
}

export let DUOS=bundledCatalog.duos, CROSS_SYNERGIES=bundledCatalog.links, TRIOS=bundledCatalog.trios;
export function configureRuleCatalog(catalog){DUOS=catalog.duos;CROSS_SYNERGIES=catalog.links;TRIOS=catalog.trios;RULES_PATCH=catalog.patch;RULES_VERSION=catalog.reviewedAt;COMBINATION_SOURCE={...catalog.source,date:catalog.reviewedAt,patch:catalog.patch,label:catalog.name};}

export const SEARCH_ALIASES={
 MissFortune:'女枪 好运姐 mf nvqiang',Malphite:'石头人 石头 st str shitouren',MonkeyKing:'猴子 孙悟空 悟空 houzi wukong',
 MasterYi:'剑圣 易大师 剑易 js jiansheng',LeeSin:'盲僧 瞎子 盲仔 ms mangseng',Chogath:'大虫子 虫子 dc dcz dachongzi',
 DrMundo:'蒙多 蒙多医生 md mengduo',Nunu:'努努 雪人 nn nu nu',KogMaw:'大嘴 深渊巨口 dz dazui',
 TahmKench:'蛤蟆 塔姆 tamu tm',Alistar:'牛头 酋长 nt niutou',Amumu:'木木 阿木木 mm amumu',
 Orianna:'发条 ft fatiao',Fiddlesticks:'稻草人 dcr daocaoren',Gangplank:'船长 cz chuanzhang',
 Hecarim:'人马 rm renma',Renekton:'鳄鱼 ey eyu',Nasus:'狗头 gt goutou',Rammus:'龙龟 lg longgui',
 Twitch:'老鼠 ls laoshu',Teemo:'提莫 tm timo',Yasuo:'亚索 快乐风男 ys yasuo',Yone:'永恩 yo ye yongen',
 Caitlyn:'女警 nj nvjing',Jhin:'烬 戏命师 jh jin',Jinx:'金克丝 萝莉 jks jinx',Ashe:'寒冰 艾希 hb hanbing',
 Vayne:'薇恩 vn weien',Ezreal:'伊泽瑞尔 ez 小黄毛',Lux:'拉克丝 光辉 gh lks guanghui',
 Blitzcrank:'机器人 jq jqr jiqiren',Nautilus:'泰坦 tt taitan',Leona:'日女 蕾欧娜 rn rinv',
 Thresh:'锤石 cs chuishi',Zyra:'婕拉 荆棘 jl jiela',Lulu:'璐璐 露露 ll lulu',Nami:'娜美 nm namei',
 Seraphine:'萨勒芬妮 歌姬 slfn geji',Sona:'琴女 qn qinnv',Senna:'赛娜 塞纳 sn saina',
 Rell:'芮尔 铁少女 re ruier',Taric:'宝石 bs baoshi',Rakan:'洛 lk luo',Xayah:'霞 xy xia',
 Kaisa:'卡莎 ks kasha',Nilah:'尼菈 尼拉 nl nila',Kalista:'滑板鞋 卡莉丝塔 hbx klst',
 Heimerdinger:'大头 dt datou',Veigar:'小法 小法师 xf xiaofa',Ziggs:'炸弹人 zzr zdr zhadanren',Zed:'劫 影流之主 jie',
 Darius:'诺手 ns nuoshou',Garen:'盖伦 德玛 gl demacia',Diana:'皎月 jy jiaoyue',JarvanIV:'皇子 hz huangzi',
 Galio:'加里奥 巨像 jla jialiao',Nocturne:'梦魇 my mengyan',Shen:'慎 shen',Ivern:'翠神 cs cuishen',
 Vladimir:'吸血鬼 xxg xixuegui',Singed:'炼金 lj lianjin',Udyr:'乌迪尔 兽灵行者 ude wudier',
};
export function matchesSearch(champion, query) {
 const q=String(query??'').trim().toLowerCase();
 return !q || `${champion.id} ${champion.key} ${champion.name} ${champion.title} ${champion.keywords||''} ${SEARCH_ALIASES[champion.id]||''}`.toLowerCase().includes(q);
}
