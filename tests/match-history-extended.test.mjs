import test from 'node:test';
import assert from 'node:assert/strict';
import * as filters from '../src/core/match-history/filters.mjs';
import {advancedHistoryFilters} from '../src/match-history-filters-view.mjs';
import {historyTimelineChart} from '../src/match-history-chart-view.mjs';
import {historyStatsView} from '../src/match-history-stats-view.mjs';
import {historyEventsView} from '../src/match-history-events-view.mjs';
import {historyRunesView} from '../src/match-history-runes-view.mjs';

const participants=[
 {id:1,puuid:'mock-public-player-1',name:'本人',team:'TEAM-100',kills:5,deaths:1,damage:1200,physicalDamage:500,magicDamage:600,trueDamage:100,physicalTaken:400,magicTaken:300,trueTaken:100,level:16,gold:1000,goldSpent:800,heal:90,cc:20,soloKills:1,doubleKills:2,tripleKills:1,quadraKills:0,pentaKills:0,items:[1055,1055,0],runes:[8005,9101],styles:[{style:8000,selections:[]},{style:8100,selections:[]}],spells:[4,14],augments:[100,200]},
 {id:2,puuid:'mock-public-player-2',name:'队友',team:'TEAM-100',kills:2,deaths:0,damage:800,items:[0],runes:[],styles:[],spells:[4,7],augments:[]},
 {id:3,puuid:'mock-public-player-3',name:'对手',team:'TEAM-200',kills:7,deaths:2,damage:2000,items:[1055],runes:[8005],styles:[{style:8000,selections:[]}],spells:[4,14],augments:[]}
];
const game={id:123,queue:420,map:11,mode:'CLASSIC',gameType:'MATCHED_GAME',duration:1800,completeTeams:true,participants,self:participants[0]};
const rule=(field,operator,value,extra={})=>({field,operator,value,...extra});
const treeMatch=tree=>filters.matchesRules(game,{rules:[],tree});
const timeline={frames:[
 {timestamp:60000,players:[{id:1,gold:600,damageTaken:40,position:{x:7410,y:7440.5},stats:{health:400,magicResist:-5}},{id:3,gold:700,damageTaken:20,position:{x:1000,y:2000}}]},
 {timestamp:120000,players:[{id:1,gold:null,damageTaken:null,position:null,stats:null},{id:3,gold:900,damageTaken:30}]},
 {timestamp:180000,players:[{id:1,gold:1400,damageTaken:80,position:{x:9000,y:9000}},{id:3,gold:1200,damageTaken:50}]}
],events:[]};

test('nested AND / OR / NOT trees compose with flat filters and preserve missing values',()=>{
 const tree={type:'and',children:[rule('kills','>=',5),{type:'or',children:[rule('queue','=',450),{type:'not',child:rule('deaths','>',3)}]}]};
 assert.equal(treeMatch(tree),true);
 assert.equal(filters.matchesRules(game,{rules:[rule('kills','>',10)],tree}),false);
 assert.equal(treeMatch({type:'not',child:rule('vision','=',0)}),false);
 assert.equal(treeMatch({type:'not',child:rule('queue','=',null)}),false);
 assert.equal(treeMatch({type:'not',child:{field:'__proto__',operator:'=',value:0}}),false);
});

test('scopes keep nested conditions on the same participant and support quantified/named groups',()=>{
 assert.equal(treeMatch({type:'scope',scope:'anyone',child:{type:'and',children:[rule('kills','>=',5),rule('deaths','=',0)]}}),false);
 assert.equal(treeMatch({type:'scope',scope:'everyone',child:rule('kills','>=',2)}),true);
 assert.equal(treeMatch(rule('kills','>=',5,{scope:'everyone'})),false);
 assert.equal(treeMatch({type:'scope',scope:'ally',quantifier:'all',child:rule('kills','>=',2)}),true);
 assert.equal(treeMatch({type:'scope',scope:'ally',child:{type:'scope',scope:'everyone',child:rule('kills','>=',5)}}),false);
 assert.equal(treeMatch({type:'scope',scope:'ally',child:{type:'scope',scope:'anyone',child:rule('deaths','=',0)}}),true);
 assert.equal(treeMatch({type:'scope',scope:'enemy',child:rule('kills','=',7)}),true);
 assert.equal(treeMatch({type:'scope',scope:'named',player:'mock-public-player-2',child:rule('deaths','=',0)}),true);
 assert.equal(treeMatch({type:'scope',scope:'enemy',player:'mock-public-player-3',child:rule('kills','=',5)}),true);
 assert.equal(treeMatch(rule('kills','>=',0,{scope:'named',player:'unavailable-player'})),false);
 assert.equal(filters.matchesRules({...game,self:null},{tree:rule('kills','>=',0,{scope:'enemy'})}),false);
 assert.equal(filters.matchesRules({...game,completeTeams:false},{tree:rule('kills','>=',0,{scope:'everyone'})}),false);
});

test('all original numeric metrics, shares, item quantities and ordered rune/style/spell filters work',()=>{
 for(const field of ['physicalDamage','magicDamage','trueDamage','physicalTaken','magicTaken','trueTaken','level','goldSpent','heal','cc','soloKills','doubleKills','tripleKills','quadraKills','pentaKills']){
  assert.ok(Object.hasOwn(filters.RULE_FIELDS,field),field);
  assert.equal(treeMatch(rule(field,'=',participants[0][field])),true,field);
 }
 assert.equal(treeMatch(rule('dgr','=',120)),true);
 assert.equal(treeMatch(rule('damage','=',60,{measure:'teamShare'})),true);
 assert.equal(treeMatch(rule('item','=',1055,{minQuantity:2})),true);
 assert.equal(treeMatch(rule('item','=',1055,{minQuantity:3})),false);
 assert.equal(treeMatch(rule('item','=',1055,{slot:1})),true);
 assert.equal(treeMatch(rule('rune','=',8005,{slot:0})),true);
 assert.equal(treeMatch(rule('style','=',8100,{slot:1})),true);
 assert.equal(treeMatch(rule('spell','=',4,{slot:1})),false);
 assert.equal(treeMatch(rule('augment','=',200,{slot:1})),true);
 const sparse={...participants[0],runes:[8005,9101],styles:[{style:8000,selections:[{perk:8005},{perk:null},{perk:9101}]}],augments:[100,200],augmentSlots:[100,null,200],roleBoundItem:3869};
 const sparseMatch=tree=>filters.matchesRules({...game,self:sparse},{tree});
 assert.equal(sparseMatch(rule('rune','=',9101,{slot:1})),false);
 assert.equal(sparseMatch(rule('rune','=',9101,{slot:2})),true);
 assert.equal(sparseMatch(rule('augment','=',200,{slot:1})),false);
 assert.equal(sparseMatch(rule('augment','=',200,{slot:2})),true);
 assert.equal(sparseMatch(rule('item','=',3869)),true);
 assert.equal(filters.matchesRules({...game,self:{...participants[0],items:[null,1055]}},{tree:rule('item','!=',3006)}),false);
 assert.equal(filters.matchesRules({...game,self:{...participants[0],items:undefined}},{tree:rule('item','!=',3006)}),false);
});

test('tree import rejects malformed, cyclic, overly deep/wide, oversized and executable definitions',()=>{
 assert.equal(typeof filters.parseHistoryFilterTree,'function');
 assert.deepEqual(filters.parseHistoryFilterTree(JSON.stringify(rule('kills','>=',3))),rule('kills','>=',3));
 assert.equal(filters.parseHistoryFilterTree(''),null);
 assert.throws(()=>filters.parseHistoryFilterTree('{"type":"not","child":{"field":"kills","operator":">","value":0,"constructor":{}}}'));
 assert.throws(()=>filters.parseHistoryFilterTree('{"type":"and","children":[]}'));
 assert.throws(()=>filters.parseHistoryFilterTree('{"type":null,"field":"kills","operator":"=","value":5}'));
 assert.throws(()=>filters.parseHistoryFilterTree(JSON.stringify(rule('item','=',1055,{minQuantity:-1}))));
 assert.throws(()=>filters.parseHistoryFilterTree(JSON.stringify(rule('item','=',1055,{slot:1000}))));
 assert.throws(()=>filters.parseHistoryFilterTree(JSON.stringify(rule('kills','=', '(()=>42)()'))));
 assert.throws(()=>filters.parseHistoryFilterTree(' '.repeat(40000)));
 let deep=rule('kills','>=',1);for(let i=0;i<20;i++)deep={type:'not',child:deep};
 assert.equal(treeMatch(deep),false);
 assert.equal(treeMatch({type:'and',children:Array.from({length:101},()=>rule('kills','>=',1))}),false);
 assert.equal(treeMatch({type:'and',children:Array.from({length:6},()=>({type:'or',children:Array.from({length:20},()=>rule('kills','>=',1))}))}),false);
 const cyclic={type:'not'};cyclic.child=cyclic;assert.equal(treeMatch(cyclic),false);
 let expensive=rule('kills','>=',0);for(let i=0;i<4;i++)expensive={type:'scope',scope:'everyone',child:expensive};
 assert.equal(filters.matchesRules({...game,participants:Array.from({length:30},(_,id)=>({...participants[0],id}))},{tree:expensive}),false);
});

test('advanced import/export coexists with the simple form and escapes imported content',()=>{
 const html=advancedHistoryFilters({filter:{advanced:{mode:'all',rules:[rule('kills','>=',3)],tree:rule('player','=', '</textarea><script>bad()</script>')}}});
 assert.match(html,/data-history-rule="0"/);
 assert.match(html,/data-history-tool="filter-tree"/);
 assert.match(html,/data-action="history-filter-tree"/);
 assert.match(html,/NOT/);assert.match(html,/minQuantity/);assert.match(html,/slot/);
 assert.doesNotMatch(html,/<script>bad/);
});

test('chart exposes player/compare/difference modes, a signed zero line and real sample gaps',()=>{
 const html=historyTimelineChart({game,timeline,chartMetric:'gold',chartPlayer:1,chartCompare:3,chartMode:'difference'});
 assert.match(html,/data-chart-field="chartMode"/);assert.match(html,/value="player"/);assert.match(html,/value="compare"/);assert.match(html,/value="difference" selected/);
 assert.match(html,/data-chart-series="difference"/);assert.match(html,/data-chart-zero/);
 const path=html.match(/<path[^>]+data-chart-series="difference"[^>]+d="([^"]*)"/);
 assert.ok(path);assert.equal((path[1].match(/M/g)||[]).length,2);
 assert.match(html,/-100/);assert.match(html,/200/);assert.match(html,/未读取/);assert.doesNotMatch(html,/NaN|Infinity/);
 const player=historyTimelineChart({game,timeline,chartPlayer:1,chartCompare:3,chartMode:'player'});
 assert.doesNotMatch(player,/data-chart-series="compare"/);
 const missing=historyTimelineChart({game,timeline,chartMode:'difference',chartPlayer:1});
 assert.match(missing,/选择对比玩家/);assert.doesNotMatch(missing,/data-chart-series="difference"/);
 const taken=historyTimelineChart({game,timeline,chartMetric:'damageTaken',chartPlayer:1});assert.match(taken,/承受伤害/);
});

test('historical frame maps use actual map domains, offer participant selection and omit unknown positions',()=>{
 const html=historyStatsView({game,timeline,chartFrame:0,chartPlayer:1});
 assert.match(html,/历史属性时间/);assert.match(html,/data-chart-field="chartPlayer"/);
 assert.match(html,/aria-label="历史玩家位置"/);assert.match(html,/data-history-chart="123"/);
 assert.match(html,/cx="75" cy="75"/);assert.match(html,/本人/);assert.match(html,/-5/);
 const missing=historyStatsView({game,timeline,chartFrame:1,chartPlayer:1});assert.doesNotMatch(missing,/data-history-map-player="1"/);
 const unsupported=historyStatsView({game:{...game,map:1700},timeline,chartFrame:0});assert.doesNotMatch(unsupported,/<svg/);
 const nullPosition=historyStatsView({game,timeline:{frames:[{timestamp:null,players:[{id:1,position:{x:null,y:0}}]}]}});assert.doesNotMatch(nullPosition,/<circle/);assert.doesNotMatch(nullPosition,/NaN/);
});

test('events expose received/dealt groups, ward actors, known identities and filter every involved participant',()=>{
 const events=[
  {type:'CHAMPION_KILL',timestamp:60000,killerId:1,victimId:3,assists:[2],position:{x:7410,y:7440.5},victimDamageReceived:[{participantId:1,physicalDamage:100,magicDamage:null,trueDamage:0,spellSlot:0}],victimDamageDealt:[{participantId:2,physicalDamage:0,magicDamage:50,trueDamage:0,spellSlot:1}]},
  {type:'WARD_PLACED',timestamp:65000,creatorId:2,wardType:'CONTROL_WARD'},
  {type:'CHAMPION_KILL',timestamp:70000,killerId:0,victimId:3,assists:[]}
 ];
 const html=historyEventsView({game,timeline:{frames:[],events}});
 assert.ok(html.includes('<details data-lazy-details><summary>阵亡伤害明细</summary><template><section data-damage-group="received">'),'Damage tables wait in an inert template until opened');assert.ok(html.includes('<details data-lazy-details><summary>事件位置</summary><template>'));assert.match(html,/阵亡伤害明细/);assert.match(html,/承受伤害/);assert.match(html,/造成伤害/);assert.match(html,/来源玩家/);assert.match(html,/目标玩家/);
 assert.match(html,/控制守卫/);assert.match(html,/队友/);assert.match(html,/未读取/);assert.match(html,/非玩家/);
 assert.doesNotMatch(html,/玩家 0|NaN/);
 const selected=historyEventsView({game,timeline:{frames:[],events},eventPlayer:2});assert.match(selected,/1:05/);assert.match(selected,/1:00/);assert.doesNotMatch(selected,/1:10/);
  assert.doesNotMatch(historyEventsView({game:{...game,map:999},timeline:{frames:[],events}}),/<svg/);
  const multiple=historyEventsView({game,timeline:{frames:[],events},eventTypes:['WARD_PLACED'],eventPlayers:[2,3]});assert.match(multiple,/1:05/);assert.doesNotMatch(multiple,/1:00|1:10/);assert.match(multiple,/multiple size="4"/);
});

test('runes show actual styles, all three shard slots and augment descriptions without invented values',()=>{
 const data={champions:[],runes:[{id:8000,name:'精密',slots:[{runes:[{id:8005,name:'强攻',shortDesc:'当前符文说明',endOfGameStatDescriptions:['伤害 @eogvar1@ / @eogvar2@']}]}]},{id:8100,name:'主宰',slots:[]}],augments:[{id:100,name:'强化 A',description:'<b>当前强化说明</b>'}]};
 const p={...participants[0],runes:[8005],styles:[{style:8000,selections:[{perk:8005,var1:120,var2:null,var3:0}]},{style:8100,selections:[]}],statPerks:{offense:5005,flex:null,defense:5001},augments:[100]};
 const html=historyRunesView(data,{...game,participants:[p]});
 assert.match(html,/精密/);assert.match(html,/主宰/);assert.match(html,/进攻/);assert.match(html,/灵活/);assert.match(html,/防御/);assert.match(html,/5005/);assert.match(html,/5001/);assert.match(html,/未读取/);
 assert.match(html,/攻击速度/);assert.match(html,/成长生命值/);
 assert.match(html,/伤害 120 \/ 未读取/);assert.match(html,/当前强化说明/);assert.match(html,/历史版本/);assert.doesNotMatch(html,/@eogvar|<b>当前强化说明/);
 const partial=historyRunesView(data,{...game,participants:[{id:1,name:'缺失记录'}]});assert.match(partial,/未读取/);assert.doesNotMatch(partial,/5005/);
});
