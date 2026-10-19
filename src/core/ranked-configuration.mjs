import {publicRankedDraft} from './ranked-draft.mjs';
import {contextualPreparationChoices} from './matchup-preparation.mjs';
import {configurationKey,mergeConfiguration} from './preparation.mjs';
import {fingerprint} from './catalog-review.mjs';
import {getBuild} from './builds.mjs';

export function rankedConfigurationAdvice(client,data,selection,build){
 const draft=publicRankedDraft(client,data.champions);if(!draft.ranked||client.phase!=='ChampSelect'||!client.connected||!selection||selection.mode!=='rift')return null;
 const own=draft.allies.find(player=>player.cellId===client.session.localPlayerCellId),champion=data.champions.find(hero=>hero.id===selection.id);
 if(!champion||!own||![own.championId,Number(own.championPickIntent)].includes(Number(champion.key)))return null;
 const model=build||getBuild(champion,selection.role,data,selection),suggestions=contextualPreparationChoices({data,selection,build:model,enemies:draft.enemies});
 const token=fingerprint([String(client.session.gameId||client.game?.gameId||''),draft.queue,configurationKey(selection),data.patch,data.buildSource,draft.allies.map(player=>[player.cellId,player.champion,player.role,player.pickState]),draft.enemies.map(player=>[player.cellId,player.champion,player.role,player.pickState]),model.runeOptions.map(option=>[option.id,option.samples]),model.reference?.core]);
 return {token,suggestions,enemyCount:draft.enemies.filter(player=>player.champion).length};
}
export function adoptRankedConfigurationAdvice({client,data,selection,token,kind,id}){
 const advice=rankedConfigurationAdvice(client,data,selection);if(!advice||advice.token!==token)throw Error('选人或配置已变化，请查看最新建议');
 const suggestion=advice.suggestions.find(value=>value.kind===kind&&value.id===id);if(!suggestion)throw Error('建议已变化，请重新查看');
 const next=mergeConfiguration(selection,{...selection,...suggestion.fields},Object.keys(suggestion.fields));
 // Materialize once before accepting; all unrelated personal fields remain.
 getBuild(data.champions.find(champion=>champion.id===next.id),next.role,data,next);
 return next;
}
