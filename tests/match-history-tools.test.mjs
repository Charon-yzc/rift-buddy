import test from 'node:test';
import assert from 'node:assert/strict';
import {privateHistoryState,matchHistoryToolsView} from '../src/match-history-tools-view.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
test('streamer view masks names in summary and expanded game without mutating personal in-memory data',()=>{
 const player={puuid:'mock-private-public-1',name:'不可显示的名字'},game={id:1,self:player,participants:[player]};
 const state={streamer:true,searchResults:[player],error:'查询失败 '+player.name,tabs:[{id:1,error:'详情失败 '+player.name,options:{query:player.name},page:{player,games:[game]},details:{1:{game,error:'详情失败 '+player.name}}}]};
 const safe=privateHistoryState(state);assert.ok(!JSON.stringify(safe).includes(player.name));assert.equal(state.tabs[0].page.player.name,player.name);
});
test('tools expose bounded collect, analysis and challenges and escape an in-memory note',()=>{
 const html=matchHistoryToolsView({filter:{},profile:null},{note:'<script>secret</script>'});assert.match(html,/history-collect-filtered/);assert.match(html,/history-analysis-details/);assert.match(html,/history-challenges/);assert.ok(!html.includes('<script>'));
});
test('only whitelisted ongoing settings enter storage while personal cached data stays absent',()=>{
 const state=defaultState();state.preferences.ongoing={count:100,streamer:true,notes:{puuid:'private'},history:['private']};const saved=validateState(state);assert.equal(saved.preferences.ongoing.count,100);assert.equal(saved.preferences.ongoing.streamer,true);assert.ok(!JSON.stringify(saved).includes('private'));
});
