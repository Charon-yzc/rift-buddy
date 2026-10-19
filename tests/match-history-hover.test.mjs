import test from 'node:test';
import assert from 'node:assert/strict';
import {historyTooltipView,historyAsset} from '../src/match-history-hover.mjs';

const data={version:'16.20.1',items:{3137:{name:'蜕生',description:'<mainText><stats>75 法术强度<br>30% 法术穿透</stats><br><passive>死中焕生</passive><br>治疗附近友军。<img src=x onerror=alert(1)></mainText>',gold:{total:3000,base:200,sell:2100},from:['1052','1026']}},runes:[{id:8000,name:'精密',slots:[{runes:[{id:8005,name:'强攻',longDesc:'连续攻击造成额外伤害。',endOfGameStatDescriptions:['额外伤害：@eogvar1@']}]}]}],spells:{SummonerFlash:{key:'4',name:'闪现',description:'传送一小段距离。',cooldown:[300]}},champions:[],augments:[]};
test('hover equipment details expose recorded identity, costs and recipe with escaped current descriptions',()=>{
 const html=historyTooltipView(data,{kind:'item',id:3137,game:{version:'16.19'}});
 for(const value of ['蜕生','3137','3,000','200','2,100','法术强度','死中焕生','1052','1026','16.20.1','16.19'])assert.ok(html.includes(value),value);
 assert.doesNotMatch(html,/<img src=x|onerror=|<script/);
 assert.match(historyAsset(data,'item',3137),/data-history-tip="item"/);
 assert.doesNotMatch(historyAsset(data,'item',0),/data-history-tip/);
});
test('rune hover substitutes this participant’s recorded variables and keeps missing records unknown',()=>{
 const html=historyTooltipView(data,{kind:'rune',id:8005,participant:{styles:[{selections:[{perk:8005,var1:431,var2:0,var3:null}]}]}});
 assert.match(html,/额外伤害：431/);assert.match(html,/本局记录/);assert.match(html,/未读取/);assert.doesNotMatch(html,/@eogvar/);
 const missing=historyTooltipView(data,{kind:'rune',id:8005});assert.match(missing,/额外伤害：未读取/);assert.doesNotMatch(missing,/额外伤害：0|本局记录/);
 const spell=historyTooltipView(data,{kind:'spell',id:4});assert.match(spell,/闪现/);assert.match(spell,/300/);assert.match(spell,/SummonerFlash\.png/);
 const unknown=historyTooltipView(data,{kind:'item',id:9999});assert.match(unknown,/未收录/);assert.doesNotMatch(unknown,/0 金/);
});
test('statistic, event and timeline text details never interpret player-supplied markup',()=>{
 const html=historyTooltipView(data,{kind:'text',label:'伤害 <玩家>',text:'1:00 · 实际采样\n<script>alert(1)</script>'});assert.match(html,/伤害 &lt;玩家&gt;/);assert.match(html,/1:00/);assert.doesNotMatch(html,/<script>/);
});
