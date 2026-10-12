import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {candidateSummary,renderResultCard} from '../src/draft-result-view.mjs';
import {companionView} from '../src/companion-view.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {resultMemberJobs} from '../src/cooperation-view.mjs';

const data=JSON.parse(await fs.readFile('data/game.json'));
const slots=createSlots(),results=recommend({slots,champions:data.champions,scope:'party',limit:6});

test('a compact candidate prioritizes invalid configuration and unusual-lane risks over routine tradeoffs',()=>{
 const candidate={...results[0],catalogState:{reasons:['已移除的配置须重新选择']},contributions:[{name:'测试英雄',role:'bottom',unusual:true}],strategy:{tradeoff:'常规退出条件'}};
 assert.equal(candidateSummary(candidate).warning,'已移除的配置须重新选择');
 delete candidate.catalogState;
 assert.match(candidateSummary(candidate).warning,/测试英雄为非常规位置.*补刀与经济/);
 candidate.contributions=[];
 assert.equal(candidateSummary(candidate).warning,candidate.trio?.risk||candidate.duo?.risk||candidate.adaptive?.failures[0]||'常规退出条件');
});

test('compact choices retain each actual member job and source caveats inside their optional detail',()=>{
 for(const [index,result] of results.entries()){
  const main=renderResultCard(result,index,data,{favorites:[]});
  const side=companionView({data,client:{connected:false},slots,unassigned:[],scope:'party',style:'fun',tab:'recommend',results:[result]});
  for(const html of [main,side]){
   const start=html.indexOf('<details class="candidate-details"');
   assert.ok(start>0);assert.doesNotMatch(html.slice(start,html.indexOf('>',start)),/\bopen\b/);
   const details=html.slice(start);
   for(const member of resultMemberJobs(result,data))assert.ok(details.includes(member.job),member.champion+' keeps the complete conditional job');
   assert.match(details,/不预测胜率|未经.*对局验证/);assert.match(details,/data-action="result-detail"/);
   assert.match(details,/未提供三人组合或全队胜率/);
  }
 }
});

test('unknown eligibility stays ahead of candidate actions while verified eligibility moves behind comparison',()=>{
 const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{localPlayerCellId:0,myTeam:[{cellId:0,championId:0,assignedPosition:'MIDDLE'}],theirTeam:[],bans:[],actions:[],allowDuplicatePicks:false}};
 const props={data,client,slots,unassigned:[],scope:'party',style:'fun',tab:'recommend',results};
 const unknown=companionView(props);
 assert.ok(unknown.indexOf('data-eligibility="unknown"')<unknown.indexOf('data-action="use-result"'));
 client.eligibility={receivedAt:new Date().toISOString(),context:pickEligibilityContext(client.session),localPlayerCellId:0,pickable:data.champions.map(c=>c.key),disabled:[]};
 const checked=companionView(props);
 assert.ok(checked.indexOf('data-eligibility="checked"')>checked.lastIndexOf('data-action="use-result"'));
 assert.match(checked,/朋友的可选范围未知/);assert.match(checked,/data-tab="team" aria-label="调整阵容位置与开黑成员"/);
});

test('candidate labels escape source text without changing their action identity',()=>{
 const result={...results[0],title:'<测试> "组合"',catalogState:{reasons:['<待复核> & 配置']}};
 const html=renderResultCard(result,5,data,{favorites:[]});
 assert.doesNotMatch(html,/<测试>|<待复核>/);assert.match(html,/&lt;测试&gt; &quot;组合&quot;/);
 assert.match(html,/data-action="use-result" data-index="5"/);
 assert.equal(candidateSummary(result).warning,'<待复核> & 配置');
});
