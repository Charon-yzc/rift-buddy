import test from 'node:test';
import assert from 'node:assert/strict';
import {ongoingTooltipView,ongoingTipAttributes} from '../src/ongoing-game-hover.mjs';

const data={champions:[{key:'22',id:'Ashe',name:'寒冰射手'},{key:'103',id:'Ahri',name:'九尾妖狐'}]};
const member={key:'fixture-public-player-1',puuid:'fixture-public-player-1',name:'样本玩家#TEST',champion:22,position:'BOTTOM',role:{current:'BOTTOM',assignmentReason:'AUTOFILL',primary:'BOTTOM',secondary:'UTILITY'},spells:[4,7],self:true};
const state={
 roster:{mode:'CLASSIC',players:[member,{key:'k2',name:'队友#TEST',champion:103}]},
 settings:{tag:'current'},
 groups:[],
 players:{'fixture-public-player-1':{loading:false,profile:{ranked:[{queue:'RANKED_SOLO_5x5',tier:'GOLD',division:'I',lp:40,wins:30,losses:20,peak:'PLATINUM',peakDivision:'IV'},{queue:'RANKED_FLEX_SR',tier:'SILVER',division:'II',lp:10,wins:5,losses:5}]},analysis:{count:20,detailsCount:12,summary:{avgKda:3.5,kdaCv:.8,kills:100,deaths:40,assists:150,avgSoloKills:1.2,avgKillDamageEfficiency:1.1,avgCsPerMinute:7},winLoss:{all:{count:20,wins:12,losses:8,winRate:.6,winningStreak:3,losingStreak:0,activeSessionWins:4,activeSessionLosses:1},cherry:{count:0}},akariScore:{total:9.25,maxScore:17},positions:{BOTTOM:{count:12},UTILITY:{count:5}},champions:{22:{championId:22,winLoss:{all:{count:12,wins:7,losses:5,winRate:.583}},summary:{avgKda:3.9,avgChampionDamagePercentageOfTeam:.28,avgCsPerMinute:7.4},akariScore:{total:10,maxScore:17}}}},page:{games:[{id:77,queue:420,created:1700000000000,duration:1800,self:{champion:22,kills:8,deaths:2,assists:10,result:'win',csPerMinute:6.4,damageShare:.31}}]}}}
};
const target=dataset=>({dataset});
test('rank, win rate, KDA and position popovers describe the loaded sample without inventing values',()=>{
 assert.match(ongoingTooltipView(state,target({ongoingTip:'rank',tipPlayer:member.key}),data),/黄金 I · 40 LP/);
 assert.match(ongoingTooltipView(state,target({ongoingTip:'rank',tipPlayer:member.key}),data),/30 \/ 20/);
 const rate=ongoingTooltipView(state,target({ongoingTip:'winrate',tipPlayer:member.key}),data);
 for(const text of ['60%','12','8','当前队列','样本','不代表本局获胜概率'])assert.ok(rate.includes(text),text);
 const kda=ongoingTooltipView(state,target({ongoingTip:'kda',tipPlayer:member.key}),data);
 for(const text of ['3.5','0.8','100','40','150'])assert.ok(kda.includes(text),text);
 const position=ongoingTooltipView(state,target({ongoingTip:'position',tipPlayer:member.key}),data);
 for(const text of ['下路','系统补位','历史 下路','12 局'])assert.ok(position.includes(text),text);
 assert.doesNotMatch(position,/undefined|NaN|\[object Object\]/);
});
test('champion, history and premade popovers stay bounded and label inference honestly',()=>{
 const champion=ongoingTooltipView(state,target({ongoingTip:'champion',tipPlayer:member.key,tipChampion:'22'}),data);
 for(const text of ['寒冰射手','12 局','58%','3.9','Akari 参考分'])assert.ok(champion.includes(text),text);
 const history=ongoingTooltipView(state,target({ongoingTip:'history',tipPlayer:member.key,tipId:'77'}),data);
 for(const text of ['单双排','胜利','8 / 2 / 10','6.4','31%'])assert.ok(history.includes(text),text);
 const premade=ongoingTooltipView(state,target({ongoingTip:'premade',tipPlayers:member.key+',k2',tipCount:'6'}),data);
 for(const text of ['2','6','样本玩家#TEST','队友#TEST','不能证明当前预组队'])assert.ok(premade.includes(text),text);
 assert.equal(ongoingTooltipView(state,target({ongoingTip:'history',tipPlayer:member.key,tipId:'999'}),data),'');
 assert.equal(ongoingTooltipView(state,target({ongoingTip:'champion',tipPlayer:member.key,tipChampion:'103'}),data).includes('九尾妖狐'),true);
 assert.equal(ongoingTooltipView(state,target({ongoingTip:'unknown',tipPlayer:member.key}),data),'');
 const text=ongoingTooltipView(state,target({ongoingTip:'text',tipTitle:'<b>标题</b>',tipText:'1:00 · <img src=x>'}),data);
 assert.match(text,/&lt;b&gt;标题&lt;\/b&gt;/);assert.doesNotMatch(text,/<img|<b>/);
});
test('tip attributes stay escaped and never carry credentials or hidden identities',()=>{
 const attrs=ongoingTipAttributes('premade',{players:'a,b',count:6,title:'历史共同对局 A'});
 for(const text of ['data-ongoing-tip="premade"','data-tip-players="a,b"','data-tip-count="6"','tabindex="0"'])assert.ok(attrs.includes(text),text);
 assert.match(ongoingTipAttributes('text',{title:'"quoted"',text:'<script>'}),/&quot;quoted&quot;/);
 const hidden={key:'h1',hidden:true,name:'',puuid:''};
 const hiddenState={...state,roster:{...state.roster,players:[hidden]},players:{}};
 assert.doesNotMatch(ongoingTooltipView(hiddenState,target({ongoingTip:'premade',tipPlayers:'h1',tipCount:'3'}),data),/undefined|\[object Object\]/);
});
