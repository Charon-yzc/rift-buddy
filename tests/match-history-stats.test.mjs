import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTimeline} from '../src/core/match-history/model.mjs';
import {historyStatsView} from '../src/match-history-stats-view.mjs';
test('SGP historical stat panels expose whitelisted signed values without retaining raw account data',()=>{
 const timeline=normalizeTimeline({json:{frames:[{timestamp:60000,participantFrames:{1:{participantId:1,championStats:{health:400,healthMax:600,magicResist:-5,abilityPower:20,privateToken:'secret'},damageStats:{totalDamageDoneToChampions:120}}},events:[{type:'CHAMPION_KILL',timestamp:60000,killerId:1,victimId:2,victimDamageReceived:[{participantId:1,physicalDamage:120,magicDamage:0,trueDamage:0,spellName:'Attack',token:'secret'}]}]}]}},'sgp');
 assert.equal(timeline.frames[0].players[0].stats.magicResist,-5);assert.equal(JSON.stringify(timeline).includes('secret'),false);
 const html=historyStatsView({game:{id:1,self:{id:1},participants:[{id:1,name:'示例'}]},timeline,chartFrame:0});assert.match(html,/400/);assert.match(html,/-5/);assert.match(html,/法术强度/);
});
