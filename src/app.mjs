import {proposalKey} from './core/room.mjs';
import {roomBallotView} from './room-ballot-view.mjs';
import {recommendationMembers} from './core/recommendation-diversity.mjs';
import {roomBallotBoard} from './core/room-ballot.mjs';
import {roleClaimChoice,activeRoleClaim,roleRepresentatives} from './core/role-claim.mjs';
import {clientConnectionNotice} from './client-connection-view.mjs';
import {preparationEquipment} from './core/complete-gear.mjs';
import {invalidatePreparationStatuses,confirmPreparationResource,samePreparationPayload,invalidateItemSetStatuses,itemSetSuccessStatus} from './preparation-receipts.mjs';
import {preparationProgressView} from './preparation-progress-view.mjs';
import {createDisclosureState} from './disclosure-state.mjs';
import {pregameControls} from './pregame-controls-view.mjs';
import {preselectionPicker} from './preselection-picker-view.mjs';
import {recommendationDraft,comparisonDraft,editableLocalDraft,localPickLocked,confirmedClientDraft,clientRecommendationDraft} from './core/draft-intents.mjs';
import {adoptedTaskView} from './draft-task-view.mjs';
import {stateRecoveryView} from './state-recovery-view.mjs';
import {clientRenderIdentity,normalizePartyIds} from './core/client-party.mjs';
import {validPartyCount,markedPartyCount,initialPartyCount,selectionPartyCount,reconcilePartyRange,movePartyMark,savedPartyCount} from './core/party-range.mjs';
import {pregamePhase,partyWithPregameIntents,restoredRoleClaim} from './core/pregame-intent.mjs';
import {companionHeroAction} from './core/companion-action.mjs';
import {adoptRoomLineup,roomLineupIdentity} from './core/room-lineup.mjs';
import {rankedClientRoles} from './core/builds.mjs';
import {playerFlowSettings} from './player-flow-settings.mjs';
import {rollbackUnacceptedState} from './core/save-state.mjs';
import {rebaseWindowState,equalWindowState} from './core/window-state.mjs';
import {localPickEligibility} from './core/pick-eligibility.mjs';
import {pickEligibilityView} from './pick-eligibility-view.mjs';
import {summonerSelector} from './summoner-selection-view.mjs';
import {heroCoach} from './core/hero-coach.mjs';
import {createItemSet} from './core/item-sets.mjs';
import {itemSetControls} from './item-sets-view.mjs';
import {buildSourceControls,cachedBuildAlternatives} from './build-source-view.mjs';
import {buildSourceKey,buildSourcePendingKey,normalizeBuildSource,selectBuildSource,sameBuildSource,buildSourceLabel,requireBuildSource} from './core/build-source.mjs';
import {normalizeMirrorBase} from './core/app-update.mjs';
import {heroCoachView} from './hero-coach-view.mjs';
import {duoPlayView} from './duo-play-view.mjs';
import {matchupView} from './matchup-view.mjs';
import {matchupTargetKey,publicMatchupOpponent} from './core/matchup-plans.mjs';
import {matchupTargetView} from './matchup-plan-view.mjs';
import {reviewBaseline} from './core/catalog-review.mjs';
import {buildFavoriteId,selectedBuildFields,findSavedBuild} from './core/build-favorites.mjs';
import {teamFavoriteId,findSavedTeam,captureTeamConfigurations,restoreTeamFavorite} from './core/team-favorites.mjs';
import {pairRefreshTargets,pairRefreshView} from './pair-refresh-view.mjs';
import {strategySummary,summarizeEnemyTraits} from './core/strategy.mjs';
import {runeWriteContext} from './core/rune-context.mjs';
import {resultAsText} from './result-text.mjs';
import {captureCreativePlan,selectPartyRoute,creativePlanMatches,creativePlanCompatible,validateCreativePlan,creativeMemberCombo,creativeComboContext} from './core/creative-plan.mjs';
import {BUNDLED_CATALOG,configureCatalog,catalogIssues} from './core/catalog.mjs';
import {catalogPanel,catalogPreviewDialog,catalogEditorDialog,editorLoadouts,playControls} from './catalog-view.mjs';
import {appUpdatePanel,patchAppUpdateProgress} from './app-update-view.mjs';
import {resultPlayCard} from './play-card-view.mjs';
import {applyPresentation,updatePresentationDialog,updateThemeDialog} from './presentation-view.mjs';
import {changePresentation} from './core/presentation.mjs';
import {configurationChoices,heroClickSelection} from './core/configuration-choices.mjs';
import {companionView,companionPlanView,readOnlyConfigurationMarkup,readOnlyConfigurationAction} from './companion-view.mjs';
import {favoriteBuildSummary,favoriteTeamSummary} from './favorites-view.mjs';
import {windowInfoDialog,windowInfoText} from './window-info-view.mjs';
import {roomPanel,roomSharesView,roomConfigurationDialog,roomConfigurationText,roomMissingConfigurationDialog,roomPreparationFileDialog} from './room-view.mjs';
import {preparationShare} from './core/preparation-file.mjs';
import {clientPreparationPlan,clientPreparationControls,clientPreparationKey,preparationGameId} from './client-preparation-view.mjs';
import {shareFromSlots,decodeRoomInvitation,sanitizeNick,validPin,validRoomCode} from './core/room.mjs';
import {captureRoomStrategy,captureRoomConfigurations,roomPreparation,roomPlayerRole,roomClientPlan} from './core/room-configuration.mjs';
import {normalizeRelayUrl,initialRelayUrl} from './core/room-relay.mjs';
import {AUTO_QUIET_MS} from './core/room-auto.mjs';
import {changeCompanionPlan,companionPickIntent,localConfigurationPreview,configurationReadOnly,assertConfigurationEditable} from './core/companion-plan.mjs';
import {opponentBuildKey} from './core/opponent-build-source.mjs';
import {matchupPreparation,selectMatchupPreparation} from './core/matchup-preparation.mjs';
import {matchupPreparationView} from './matchup-preparation-view.mjs';
import {comboMembers} from './core/combo-members.mjs';
import {personalCombo,loadPersonalCombo} from './core/personal-combo.mjs';
import {ROLES,STYLES,DUOS,TRIOS,CROSS_SYNERGIES,COMBINATION_SOURCE,profile,matchesSearch,RULES_PATCH,RULES_VERSION} from './core/rules.mjs';
import {createSlots,recommend,analyzeTeam,mergeClientSession,validateSlots,clearClientPicks,currentCombo,comboContextKnown} from './core/recommend.mjs';
import {DRAFT_SCOPES,CLIENT_POSITION_ROLES,draftTargets,scopeSlots,effectiveDraftScope,moveChampion,assignClientChampion,clientDraftStatus,clearDraftPicks,manualPlayerSlot,restorePlayerPosition,clearManualPlayerPosition,publicClientGameId,reconcileClientDraft,pickerMatches,publicDraftPicks,unassignedPublicPicks} from './core/draft.mjs';
import {combinationDialog,combinationRows} from './draft-library-view.mjs';
import {getBuild,buildAsText,SHARDS,isFreshBuildReference,buildRoleEvidence,validReference} from './core/builds.mjs';
import {preparationSummary,runeApplicationKey} from './preparation-view.mjs';
import {loadoutSelector,runeSelector,skillSelector,comboSourceLinks,laterItemSelector,bottomQuestPlanControl,gearSelector,sourceOpponentNotice} from './build-options-view.mjs';
import {augmentCategories,AUGMENT_CATEGORIES} from './core/hex-compare.mjs';
import {renderHexComparison,renderHexSourceReference} from './hex-view.mjs';
import {preserveOverlay,foldConfigurationSections} from './overlay.mjs';
import {createClientSync} from './core/async-tasks.mjs';
import {currentPlayerSelection,phaseLabel} from './core/guide.mjs';
import {createPreparationStore,createRuneApplicationState,recommendationKey,configurationPatch,configurationKey as buildChoiceKey,CONFIGURATION_FIELDS,preparationIdentity,recallPreparation,partyRoutePreparations} from './core/preparation.mjs';
import {renderResultCard,coreRouteChoices,recommendationLoading} from './draft-result-view.mjs';
import {escape as e,icon,portrait,rosterPortrait,asset,button,dateLabel,configureAssets,gameDescription,roleIcon} from './ui.mjs';
import {rankingsView} from './rankings-view.mjs';
import {rankingKey,rankingReference,validRankingReference} from './core/rankings.mjs';
import {patchNotesView} from './patch-notes-view.mjs';
import {championReferenceView,referenceHeroTiles} from './champion-reference-view.mjs';
import {createHistoryController} from './match-history-controller.mjs';
import {matchHistoryView as baseHistoryView,matchHistorySearchView} from './match-history-view.mjs';
import {advancedHistoryFilters} from './match-history-filters-view.mjs';
import {createOngoingGameController} from './ongoing-game-controller.mjs';
import {ongoingGameView} from './ongoing-game-view.mjs';
import {ongoingGameAnalysisView} from './ongoing-game-analysis-view.mjs';
import {analyzeAkariHistory,analyzeAkariTeam,inferHistoricalGroups} from './core/akari/bridge.mjs';
import {matchHistoryToolsView,privateHistoryState,privateHistoryFilterTab} from './match-history-tools-view.mjs';
import {parseHistoryFilterTree} from './core/match-history/filters.mjs';
import {historyNavigationView} from './match-history-navigation-view.mjs';
import {bindHistoryTooltips} from './match-history-hover.mjs';
import {ongoingTooltipView} from './ongoing-game-hover.mjs';
import {updateHistoryFilterTree,saveHistoryFilterPreset,loadHistoryFilterPreset,removeHistoryFilterPreset,historyRelativeTimeRange} from './match-history-filter-tree.mjs';
function matchHistoryView(state,data){
  const shown={...privateHistoryState(state),compact:window.innerWidth<=1050},tab=shown.tabs.find(t=>t.id===state.current);for(const entry of shown.tabs)if(entry.page)entry.page={...entry.page,fullAnalysis:entry.analysis};const html=baseHistoryView(shown,data);if(!tab?.page)return html;
 const filtered=Object.entries(tab.filter).some(([key,value])=>key!=='excludePve'&&key!=='advanced'&&!!value)||!!tab.filter.advanced?.rules.length;
 const tools=matchHistoryToolsView(tab,{streamer:state.streamer,note:ongoing.state.notes[tab.page.player.puuid]||'',data,masteryQuery:tab.masteryQuery||''}),analysis=ongoingGameAnalysisView(tab.analysis,data,{streamer:state.streamer}),filterTab=state.streamer?privateHistoryFilterTab(tab):tab;
 const filters=state.streamer?`<fieldset disabled style="border:0;padding:0;min-width:0"><small>隐私展示期间暂停编辑含身份的筛选条件</small>${advancedHistoryFilters(filterTab,data)}</fieldset>`:advancedHistoryFilters(filterTab,data);
  const result=html.replace('<div data-history-slot="sidebar-controls"></div>',historyNavigationView(tab,state)).replace('<div data-history-slot="advanced-filters"></div>',filters).replace('<div data-history-slot="sidebar-extra"></div>',tools+'<details class="history-full-analysis" data-disclosure-key="history-full-analysis"><summary>完整战绩分析</summary>'+analysis+'</details>').replace('<summary>页内筛选</summary>',`<summary>页内筛选${filtered?' · 已设置条件':''}</summary>`);
 return window.innerWidth<=1050?result.replace('<aside class="history-summary">','<details class="history-compact-summary" data-disclosure-key="history-compact-summary"><summary>近期表现、常用英雄与共同对局</summary><aside class="history-summary">').replace('</aside>','</aside></details>'):result;
}
window.matchMedia('(max-width: 1050px)').addEventListener('change',()=>{if(route==='history'&&data)render();});

let draftAdvanced=false,lastClientRead=null,lastRenderedClient='';
let rankedRolesCache=null;const currentRankedRoles=()=>{if(rankedRolesCache?.builds!==data.builds||rankedRolesCache?.patch!==data.patch)rankedRolesCache={builds:data.builds,patch:data.patch,value:rankedClientRoles(data)};return rankedRolesCache.value;};
const currentParty=()=>partyWithPregameIntents(client.party,room,saved.draft?.preselection);
const clientSyncOptions=()=>({autoArrange:saved.preferences.autoArrange!==false,autoParty:saved.preferences.autoParty!==false,party:currentParty(),partyCount:saved.draft?.partyCount,roleOrder:currentRankedRoles(),ownRole:taskOwnRole(),creativePlan:activeCreativePlan});
function refreshPartyRange(){
 if(!client.connected||!client.session&&!pregamePhase(client.phase))return false;
 const count=validPartyCount(saved.draft?.partyCount)?saved.draft.partyCount:initialPartyCount(client.party);
 const next=reconcilePartyRange(slots,client.session,data.champions,{count,party:currentParty(),ownRole:taskOwnRole(),roleOrder:currentRankedRoles(),initial:pregamePhase(client.phase)});
 if(JSON.stringify(next)===JSON.stringify(slots))return false;
 slots=next;markResultStale();cancelRecommendation();results=[];offset=0;persist({derived:true});queueCompanionRecommendation();return true;
}
const selectedInClient=s=>!!s&&Number.isInteger(s.clientCellId)&&client.session?.myTeam?.some(p=>p.cellId===s.clientCellId&&Number(p.championId)>0);
function guardClientSlot(s){if(selectedInClient(s))throw Error('这位英雄已在客户端选定，可以换位；更换或取消请在客户端操作。');}
function refreshClientClock(){const remaining=clientDraftStatus(client,slots,data.champions).remaining;for(const el of document.querySelectorAll('[data-client-countdown]'))el.textContent=remaining===null?'':` · 约剩 ${remaining} 秒`;}

const previewAPI={
 bootstrap:async()=>{const r=await fetch('/api/bootstrap');if(!r.ok)throw Error('无法读取本地资料');const b=await r.json();try{const s=JSON.parse(localStorage.getItem('rift-buddy-preview'));if(s?.schema===1)b.state=s;}catch{}return b;},
 windowInfo:async()=>{throw Error('桌面版支持读取屏幕和窗口资料');},
 presentation:async change=>{saved.preferences.presentation=changePresentation(saved.preferences.presentation,change);await previewAPI.saveState(saved);return saved.preferences.presentation;},
 saveState:async s=>localStorage.setItem('rift-buddy-preview',JSON.stringify(s)),
 client:async()=>({connected:false,phase:'Offline',message:'浏览器预览中；桌面版支持连接客户端'}),
 updateData:async()=>{throw Error('请在桌面版中更新资料');},
 checkAppUpdate:async()=>{throw Error('请在桌面版中检查软件更新');},
 downloadAppUpdate:async()=>{throw Error('请在桌面版中下载软件更新');},
 pauseAppUpdate:async()=>false,
 cancelAppUpdate:async()=>true,
 installAppUpdate:async()=>{throw Error('请在桌面版中安装软件更新');},
 deleteAppUpdate:async()=>true,
 refreshBuild:async()=>{throw Error('请在桌面版中刷新版本配置');},
 refreshOpponentBuild:async()=>{throw Error('请在桌面版选人时刷新对手参考');},
 refreshPairs:async()=>{throw Error('请在桌面版中刷新同队数据');},
 refreshRankings:async()=>{throw Error('请在桌面版中刷新排行榜；浏览器可查看随程序提供的离线榜单');},
 authorizeClient:async()=>{throw Error('请在桌面版中连接客户端');},
 applyRunes:async()=>{throw Error('请在桌面版中连接客户端后应用符文');},
 importItemSet:async()=>{throw Error('桌面版连接客户端后可导入商店装备集；也可先导出 JSON');},
 exportItemSet:async itemSet=>{const blob=new Blob([JSON.stringify(itemSet,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=itemSet.uid+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return {exported:true,title:itemSet.title};},
 copy:async text=>navigator.clipboard.writeText(text),
 openLink:async url=>window.open(url,'_blank','noopener,noreferrer'),
 chooseDirectory:async()=>{throw Error('请在桌面版中选择目录');},
 togglePin:async()=>{throw Error('请在桌面版中使用置顶');},
 openGuide:async selection=>{const query=new URLSearchParams({hero:selection?.id||'Ashe',role:selection?.role||'bottom',mode:selection?.mode||'rift'});window.open('/src/guide.html?'+query,'rift-buddy-guide');return true;},
 updateGuide:async()=>({updated:false}),
 exportState:async()=>{const blob=new Blob([JSON.stringify(saved,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='开黑搭子-备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return true;},
 importState:async()=>{throw Error('请在桌面版中导入备份');},
};
const api=window.buddy||previewAPI;
const historyRequest=(operation,payload)=>api.matchHistory?api.matchHistory(operation,payload):Promise.reject(Error('请在桌面版连接客户端后查询战绩'));
const history=createHistoryController({request:historyRequest,analyze:analyzeAkariHistory,onChange:()=>{if(route==='history'&&data){render();if(history.state.searchResults.length)overlay.innerHTML=matchHistorySearchView(privateHistoryState(history.state));if(history.state.error)toast(history.state.streamer?'查询失败，请检查连接':history.state.error,true);}}});
const historyTooltips=bindHistoryTooltips({document,getData:()=>data,getGame:element=>{
 const tab=privateHistoryState(history.state).tabs.find(value=>value.id===history.state.current),id=Number(element.dataset.tipGame??element.closest('[data-history-match]')?.dataset.historyMatch);
 return tab?.details[id]?.game||tab?.page?.games.find(game=>game.id===id);
}});
const ongoing=createOngoingGameController({request:historyRequest,analyze:analyzeAkariHistory,teamAnalyze:analyzeAkariTeam,infer:inferHistoricalGroups,onChange:()=>{if(route==='ongoing'&&data)render();}});
const ongoingTooltips=bindHistoryTooltips({document,attribute:'data-ongoing-tip',getData:()=>data,render:(element,value)=>value?ongoingTooltipView(ongoing.state,element,value):''});
let ongoingObservedPhase='Offline';
function acceptOngoingClient(value){
 ongoing.observeClient(value);
 const phase=value?.phase||'Offline',starting=['ChampSelect','GameStart','InProgress'].includes(phase)&&!['ChampSelect','GameStart','InProgress','Reconnect'].includes(ongoingObservedPhase);ongoingObservedPhase=phase;
 if(!windowLayout.docked&&ongoing.state.settings.autoRoute&&ongoing.state.settings.enabled&&starting){route='ongoing';closeOverlay();render();ongoing.start();}
}
async function ongoingAction(action,el){
 const key=el.dataset.player,member=ongoing.state.roster?.players.find(p=>p.key===key),entry=ongoing.state.players[key];
 if(action==='ongoing-refresh')await ongoing.refresh({force:true});
 else if(action==='ongoing-player-refresh')await ongoing.reloadPlayer(key);
 else if(action==='ongoing-exit-draft')await ongoing.exitDraft();
 else if(action==='ongoing-clear'){ongoing.stop();ongoing.clear();ongoing.start();await ongoing.refresh();}
 else if(action==='ongoing-history'&&member?.puuid){
  history.state.streamer=ongoing.state.settings.streamer;ongoing.stop();route='history';render();
  const opening=history.open({puuid:member.puuid,server:ongoing.state.roster?.server||'',source:ongoing.state.settings.source}),tab=history.current(),ticket=tab?.ticket;
  await opening;
  if(route!=='history'||history.current()!==tab||!history.state.tabs.includes(tab)||tab.ticket!==ticket)return;
  if(el.dataset.champion||el.dataset.position)await history.collect({champion:Number(el.dataset.champion)||null,position:el.dataset.position||'',expectedCount:ongoing.state.settings.count,useFilters:true,scanFromStart:true});
 }
 else if(action==='ongoing-note'&&member?.puuid){overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal"><header class="modal-header"><h2>本次运行备注</h2>${button('close','','close','quiet icon-only')}</header><div class="panel-body"><label>仅保存在本机当前运行内存<input id="ongoing-note-input" maxlength="200" value="${e(ongoing.state.settings.streamer?'':ongoing.state.notes[member.puuid]||'')}"></label>${button('ongoing-note-save','保存','','',`data-player="${e(key)}"`)}</div></section></div>`;}
 else if(action==='ongoing-note-save'){ongoing.note(key,document.getElementById('ongoing-note-input')?.value);closeOverlay();}
 else if(action==='ongoing-preview'&&entry?.page){
  const game=entry.page.games.find(g=>g.id===Number(el.dataset.id));if(!game)return;history.state.streamer=ongoing.state.settings.streamer;route='history';ongoing.stop();render();
  const opening=history.open({puuid:member.puuid,server:entry.page.server||'',source:entry.page.source,handle:entry.page.handle,start:entry.page.start,count:entry.page.count}),tab=history.current(),ticket=tab?.ticket;
  await opening;
  if(route!=='history'||history.current()!==tab||!history.state.tabs.includes(tab)||tab.ticket!==ticket||!tab.page)return;
  if(!tab.page.games.some(g=>g.id===game.id))tab.page.games.unshift(game);await history.detail(game.id,'summary');
  if(route==='history'&&history.current()===tab&&tab.ticket===ticket)document.querySelector(`[data-history-match="${game.id}"]`)?.scrollIntoView({block:'start'});
 }
}
async function historyAction(action,el,background=false){
 const tab=history.current(),id=Number(el.dataset.id);
  if(action==='history-self'){const search=document.querySelector('.history-search-disclosure');if(search)search.open=false;await history.open({source:history.state.source,server:''});}
 else if(action==='history-tab')history.select(id);
 else if(action==='history-close')history.close(id);
 else if(action==='history-refresh'&&tab)await history.load(tab,tab.page?{}:{handle:undefined});
 else if(action==='history-next'&&tab?.page)await history.load(tab,{start:tab.page.start+tab.page.count});
 else if(action==='history-prev'&&tab?.page)await history.load(tab,{start:Math.max(0,tab.page.start-tab.page.count)});
 else if(action==='history-first'&&tab)await history.load(tab,{start:0});
 else if(action==='history-page-go'&&tab?.page){const value=Number(document.querySelector('[data-history-page="number"]')?.value);if(!Number.isInteger(value)||value<1||value>Math.ceil(10000/tab.page.count))throw Error('请输入范围内的页数');await history.load(tab,{start:(value-1)*tab.page.count});}
  else if(action==='history-detail'){const section=el.dataset.section;await history.detail(id,section);if(section==='toggle')document.querySelector(`[data-history-match="${id}"] .history-expand`)?.focus({preventScroll:true});else document.getElementById(`history-tab-${id}-${section}`)?.focus({preventScroll:true});}
 else if(action==='history-collect')await history.collect();
 else if(action==='history-collect-active')await history.collect({useFilters:true,scanFromStart:true,expectedCount:500});
 else if(action==='history-search-cancel')history.cancelSearch();
 else if(action==='history-collect-filtered'){const value=name=>document.querySelector(`[data-history-tool="${name}"]`)?.value;await history.collect({champion:Number(value('collect-champion'))||null,position:String(value('collect-position')||'').toUpperCase(),expectedCount:Number(value('collect-count'))||50,useFilters:true,scanFromStart:true});}
 else if(action==='history-analysis-details')await history.loadAnalysisDetails();
 else if(action==='history-challenges')await history.challenges();
 else if(action==='history-copy-id'&&tab?.page)await api.copy(tab.page.player.name);
 else if(action==='history-note-save'&&tab?.page){const notes=ongoing.state.notes;notes[tab.page.player.puuid]=String(document.querySelector('[data-history-tool="note"]')?.value||'').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200);for(const key of Object.keys(notes).slice(0,-300))delete notes[key];render();}
 else if(action==='history-simulate'&&tab?.page){const game=tab.page.games.find(g=>g.id===id);if(game){route='ongoing';closeOverlay();await ongoing.setDraft({...game,server:tab.page.server});render();}}
 else if(action==='history-stop')history.stop();
 else if(action==='history-replay')await history.replay(id,el.dataset.replay);
 else if(action==='history-champion')history.filter('champion',id);
 else if(action==='history-filter-clear'&&tab){tab.filter={};history.filter('excludePve',true);}
 else if(action==='history-rule-add'&&tab){const advanced=tab.filter.advanced||{mode:'all',rules:[]};if(advanced.rules.length<20)history.filter('advanced',{...advanced,rules:[...advanced.rules,{scope:'self',field:'kills',measure:'value',operator:'>=',value:'0'}]});}
 else if(action==='history-rule-remove'&&tab){const advanced=tab.filter.advanced;history.filter('advanced',{...advanced,rules:advanced.rules.filter((_,i)=>i!==Number(el.dataset.index))});}
 else if(action==='history-filter-tree'&&tab){const value=document.querySelector('[data-history-tool="filter-tree"]')?.value||'',tree=parseHistoryFilterTree(value);history.filter('advanced',{mode:'all',rules:[],...tab.filter.advanced,tree});}
 else if(['history-tree-add','history-tree-remove','history-tree-kind'].includes(action)&&tab){const advanced=tab.filter.advanced||{mode:'all',rules:[]},tree=updateHistoryFilterTree(advanced.tree,{action:action.slice('history-tree-'.length),path:el.dataset.path||'',kind:el.dataset.kind});history.filter('advanced',{...advanced,tree});}
 else if(action==='history-tree-preset'&&tab){const operation=el.dataset.presetAction,name=operation==='save'?document.querySelector('[data-history-tool="filter-preset-name"]')?.value:el.dataset.name;if(operation==='save')tab.filterPresets=saveHistoryFilterPreset(tab.filterPresets,name,tab.filter);else if(operation==='remove')tab.filterPresets=removeHistoryFilterPreset(tab.filterPresets,name);else if(operation==='load'){tab.filter=loadHistoryFilterPreset(tab.filterPresets,name);history.filter('excludePve',tab.filter.excludePve!==false);}render();}
 else if(action==='history-relative-time'&&tab){const range=historyRelativeTimeRange(el.dataset.value,Date.now());tab.filter={...tab.filter,...range};history.filter('excludePve',tab.filter.excludePve!==false);}
 else if(action==='history-player'){closeOverlay();await history.open({puuid:el.dataset.puuid,server:el.dataset.server||tab?.page?.server||'',source:history.state.source,background});}
}
let stateRecovery=null;
const initialSlots=()=>createSlots().map(slot=>({...slot,party:slot.role==='top'}));
let data,saved,savedBase,boot,slots=initialSlots(),results=[],resultsSignature='',route='draft',style='fun',offset=0,scope='solo',soloRole='',showAllCandidates=false;
let rankingSource=null,rankingRole='top',rankingQuery='',rankingSort='rank';
let patchVersion='',patchQuery='';
let referenceHero='',referenceQuery='',referenceRole='all',referenceTab='skills',referenceSkill='Q',referenceVariant=0;
const rankingPending=new Set(),rankingErrors=new Map();
const rankingOptions=()=>{const source=rankingSource||data.buildSource,key=rankingKey(data.patch,source);return {source,role:rankingRole,query:rankingQuery,sort:rankingSort,pending:rankingPending.has(key),error:rankingErrors.get(key)||'',heroAction:id=>companionHeroAction(client,champ(id),saved.preferences.clickPrepare!==false)};};
async function refreshRanking(){
 const source={...(rankingSource||data.buildSource)},patch=data.patch,key=rankingKey(patch,source);if(rankingPending.has(key))return;
 rankingPending.add(key);rankingErrors.delete(key);render();
 try{const result=await api.refreshRankings(source);if(data.patch!==patch)return;
  if(result.reference){if(result.reference.key!==key||!validRankingReference(result.reference,data))throw Error('排行榜响应与当前筛选不匹配');data.rankings={...data.rankings,[key]:result.reference};}
  if(result.refreshError)rankingErrors.set(key,result.refreshError);else toast('排行榜已更新');
 }catch(error){rankingErrors.set(key,String(error.message||'排行榜暂不可用').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,''));}
 finally{rankingPending.delete(key);render();}
}
const pairRefreshes=new Set(),pairRefreshErrors=new Map();
let pairRefreshOpen=false;
const currentPairTargets=()=>pairRefreshTargets(slots,scope,soloRole);
const pairRefreshKey=()=>JSON.stringify([data.patch,data.version,data.buildSource,currentPairTargets(),slots.map(s=>[s.role,s.champion,s.party,s.locked]),scope,soloRole]);
const pairRefreshStatus=()=>({pending:pairRefreshes.has(JSON.stringify([selectionRequestContext(),pairRefreshKey()])),error:pairRefreshErrors.get(pairRefreshKey())||'',open:pairRefreshOpen});
async function refreshPairData(){
 const key=pairRefreshKey(),context=selectionRequestContext(),requestKey=JSON.stringify([context,key]);if(pairRefreshes.has(requestKey))return;
 const members=currentPairTargets(),source={...data.buildSource};pairRefreshes.add(requestKey);pairRefreshErrors.delete(key);render();
 try{
  const next=await api.refreshPairs(members,source);
  if(key!==pairRefreshKey()||context!==selectionRequestContext())return;
  data.pairStatistics=next;invalidate();await generate();if(key===pairRefreshKey()&&context===selectionRequestContext())toast('已刷新所选成员的同队数据，并重新搭配');
 }catch(error){if(key===pairRefreshKey()&&context===selectionRequestContext()){const message=String(error.message||'同队数据暂不可用').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');pairRefreshErrors.set(key,message);while(pairRefreshErrors.size>20)pairRefreshErrors.delete(pairRefreshErrors.keys().next().value);toast('刷新未完成，原同队参考保留：'+message,true);}}
 finally{pairRefreshes.delete(requestKey);render();}
}
let catalogPreview=null,catalogBusy=false,catalogRequest=0,catalogEditorKind="trio",resultDraftSignature="";
let comboView=null,dragPick=null,draggedAt=0,pendingDragRender=false,activeRecommendation=null,generating=false,recommendationRun=0;
let cancelRecommendationReveal=()=>{};
function cancelRecommendation(){cancelRecommendationReveal();recommendationRun++;autoRecommendationKey='';if(activeRecommendation){activeRecommendation.cancel();activeRecommendation=null;}generating=false;}
let client={connected:false,phase:'Offline',message:'正在检查客户端…'},syncing=false,unassigned=[],enemy=[],clientBans=[];
let picker=null,buildView=null,detailResult=null,updating=false,pinned=false;
let libraryQuery='',libraryRole='all',hexQuery='',hexRarity='all',hexHero=null,hexSelected=[],hexSelectedOnly=false,hexForHero=false;
let hexOptions=[],hexOwned=[],hexCategory='all';
let toastTimer,saveChain=Promise.resolve(),favoriteSaving=false,updateMessage='',appUpdate={phase:'idle',release:null,received:0,total:null,error:'',via:null},lastSyncStarted=0,restoringSave=false;const pendingSaves=new Set();
let windowLayout={docked:false},companionTab='recommend',companionPreview=null,lastCompanionOwn='',lastCompanionIntent='',lastCompanionLocked='',autoRecommendTimer,autoRecommendationKey='';
const companionScroll=new Map();
const disclosureState=createDisclosureState();let renderedDisclosureScope='',renderedDraftResults=null,selectionUiReset=false;
let pendingIntentPreparation=null,pendingIntentPlanId='';
let stateRevision=0,dataRevision=0,externalState=null,externalStateTimer;
let room=null,roomScanning=false,roomScanResults=null,roomError='',roomInvite='',roomPin='',roomAddresses=[],roomShareTimer=null,roomShareSig='',roomShareRoom='',roomBusy=false,roomShareWarned=false,roomAutoQuiet=false,roomQuietTimer=null;
let roomConfigurationView=null,roomStrategySnapshot=null,roomPreparationFile=null,preparationFileBusy=false;
let roomRoleChoice=null,clickedRoomPlan=null;
let roomTransport='relay',roomRelayUrl=initialRelayUrl(),roomRelayRoom='';
let activeCreativePlan=null,creativePlanNotice='';
function resultCreativePlan(result){const plan=captureCreativePlan(result,data);if(plan)result.creativePlan=plan;return plan;}
function reconcileCreativePlan({ownIntentChanged=false}={}){
 // Preview changes update the visible hero/configuration, but only confirmed
 // client picks can invalidate an accepted recommendation.
 let base=slots,session=client.connected?client.session:null;
 if(!ownIntentChanged)({slots:base,session}=editableLocalDraft(base,session,data.champions,taskOwnRole()));
 const context=recommendationDraft(base,session,data.champions,{ownRole:taskOwnRole(),party:currentParty(),confirmedOnly:true});
 const considered=scopeSlots(slots,effectiveDraftScope(slots,scope));
 const own=session?.myTeam?.find(p=>p.cellId===session.localPlayerCellId),ownId=data.champions.find(c=>c.key===Number(own?.championId||own?.championPickIntent))?.id;
 const changedOwnMember=ownIntentChanged&&localPickLocked(session)&&activeCreativePlan?.members.some(m=>m.role===taskOwnRole()&&m.champion!==ownId);
 if(activeCreativePlan&&(changedOwnMember||!creativePlanCompatible(activeCreativePlan,context)||activeCreativePlan.members.some(m=>!considered.some(s=>s.role===m.role)))){
  if(lastTaskSelection?.comboId===activeCreativePlan.id)lastTaskSelection=null;
  activeCreativePlan=null;draftComparing=true;creativePlanNotice='队伍选人已变化，请重新搭配。';return true;
 }
}
let currentWindowInfo=null;
let itemSetPending='',clientPreparing=false,lastAdoptedRoomShare='',preparationPendingKey='',preparationTarget=null,candidatePreparing=false,lastTaskSelection=null,draftComparing=false,positionClaim=null,clickedHeroPreparation=null;let preparationRevision=0,selectionUiRevision=0;const itemSetStatuses=new Map(),clientPreparationStatuses=new Map();
const selectionRequestContext=()=>JSON.stringify([selectionUiRevision,client.connected,client.phase,publicClientGameId(client),client.session?.localPlayerCellId,client.mode?.id]);
function clearSelectionUi(){
 selectionUiRevision++;pairRefreshErrors.clear();pairRefreshOpen=false;opponentRefreshErrors.clear();buildErrors.clear();matchupFocusError=null;
 lastTaskSelection=null;lastAdoptedRoomShare='';clickedRoomPlan=null;roomRoleChoice=null;positionClaim=null;draftComparing=false;
 companionTab='recommend';companionPreview=null;lastCompanionOwn='';lastCompanionIntent='';lastCompanionLocked='';
 pendingIntentPreparation=null;pendingIntentPlanId='';showAllCandidates=false;recommendationError='';
 clientPreparationStatuses.clear();itemSetStatuses.clear();runeAppliedKeys.clear(true);matchupTargets.clear();unassigned=[];
 cancelRecommendation();results=[];offset=0;renderedDraftResults=null;companionScroll.clear();disclosureState.clear();renderedDisclosureScope='';selectionUiReset=true;
 closeOverlay();
}
let activeAppSelect=null,pendingAppRender=false,renderedSelectContext=null,appSelectVersion=0;
let activeOverlaySelect=null,pendingBuildRender=false,renderedBuildContext=null,overlaySelectVersion=0;
function appSelectionContext(){
 const own=currentPlayerSelection(client.session,data.champions,slots),plan=windowLayout.docked?companionPreparation():null;
 return JSON.stringify([windowLayout.docked,route,companionTab,companionPreview,client.connected,client.phase,client.mode?.id,
  own?.id,own?.formalRole,own?.role,assignedPlayerRole(),soloRole,scope,data.patch,data.buildSource,plan?.selection,plan?.build.reference?.fetchedAt,publicClientGameId(client)]);
}
function finishAppSelect(version=appSelectVersion){if(version!==appSelectVersion)return;activeAppSelect=null;appSelectVersion++;if(pendingAppRender)render();}
function finishOverlaySelect(version=overlaySelectVersion){if(version!==overlaySelectVersion)return;activeOverlaySelect=null;overlaySelectVersion++;if(pendingBuildRender&&buildView)renderBuild();}
const deferAppSelect=()=>{const version=appSelectVersion;setTimeout(()=>finishAppSelect(version),0);};
const deferOverlaySelect=()=>{const version=overlaySelectVersion;setTimeout(()=>finishOverlaySelect(version),0);};
const recommendationMenus=':is(.recommendation-ui,.recommendation-app) details:is(.pregame-more,.companion-navigation-more,.companion-footer-menu,.client-connection-options,.window-tools,.room-actions-menu)';
function closeRecommendationMenus({except=null,restoreFocus=false}={}){
 let closed=false;
 for(const menu of app.querySelectorAll(recommendationMenus+'[open]')){
  if(menu===except)continue;
  const summary=restoreFocus&&menu.contains(document.activeElement)?menu.querySelector(':scope>summary'):null;
  menu.open=false;closed=true;summary?.focus({preventScroll:true});
 }
 return closed;
}
document.addEventListener('pointerdown',event=>closeRecommendationMenus({except:event.target.closest?.(recommendationMenus)}),true);
document.addEventListener('focusin',event=>closeRecommendationMenus({except:event.target.closest?.(recommendationMenus)}));
document.addEventListener('toggle',event=>{if(event.target.open&&event.target.matches?.(recommendationMenus))closeRecommendationMenus({except:event.target});},true);
document.addEventListener('click',event=>{if(event.target.closest?.('[data-action]')?.closest(recommendationMenus))closeRecommendationMenus();},true);
document.addEventListener('pointerdown',event=>{if(event.target.tagName==='SELECT'){if(app.contains(event.target)){activeAppSelect=event.target;appSelectVersion++;}if(overlay.contains(event.target)){activeOverlaySelect=event.target;overlaySelectVersion++;}}});
document.addEventListener('keydown',event=>{
 if(event.target.tagName==='SELECT'&&overlay.contains(event.target)){if(['ArrowDown','ArrowUp',' '].includes(event.key)){activeOverlaySelect=event.target;overlaySelectVersion++;}if(['Enter','Tab'].includes(event.key))deferOverlaySelect();}
 if(event.target.tagName!=='SELECT'||!app.contains(event.target))return;
 if(['ArrowDown','ArrowUp',' '].includes(event.key)){activeAppSelect=event.target;appSelectVersion++;}
 if(['Escape','Enter','Tab'].includes(event.key))deferAppSelect();
});
document.addEventListener('focusout',event=>{if(event.target===activeAppSelect){const version=appSelectVersion;setTimeout(()=>{if(!app.contains(document.activeElement))finishAppSelect(version);},0);}});
document.addEventListener('focusout',event=>{if(event.target===activeOverlaySelect){const version=overlaySelectVersion;setTimeout(()=>{if(document.activeElement!==activeOverlaySelect)finishOverlaySelect(version);},0);}});
document.addEventListener('click',event=>{if(activeAppSelect&&event.target!==activeAppSelect)deferAppSelect();});
document.addEventListener('click',event=>{if(activeOverlaySelect&&event.target!==activeOverlaySelect)deferOverlaySelect();});
document.addEventListener('change',event=>{if(event.target===activeAppSelect){activeAppSelect=null;setTimeout(()=>{if(pendingAppRender)render();},0);}},true);
document.addEventListener('change',event=>{if(event.target===activeOverlaySelect){activeOverlaySelect=null;setTimeout(()=>{if(pendingBuildRender&&buildView)renderBuild();},0);}},true);
window.addEventListener('blur',()=>finishAppSelect());
window.addEventListener('blur',()=>finishOverlaySelect());
function queueCompanionRecommendation(){
 clearTimeout(autoRecommendTimer);
 if((!windowLayout.docked&&route!=='draft')||generating||syncing||['party','context'].includes(scope)&&!slots.some(slot=>slot.party)||['InProgress','GameStart','Reconnect','WaitingForStats','PreEndOfGame','EndOfGame'].includes(client.phase)||client.mode?.id==='hex')return;
 const key=recommendationKey(recommendationInput());if(key===autoRecommendationKey||key===resultsSignature&&results.length)return;
 autoRecommendTimer=setTimeout(()=>{if((!windowLayout.docked&&route!=='draft')||generating||syncing)return;autoRecommendationKey=key;generate();},250);
}
function acceptWindowLayout(value){if(JSON.stringify(windowLayout)===JSON.stringify(value))return;windowLayout=value;render();queueCompanionRecommendation();}
const refreshingBuilds=new Map(),refreshAttempts=new Map(),buildErrors=new Map();let recommendationError='';
const preparations=createPreparationStore();
const matchupTargets=new Map();let lastMatchupGame='',lastMatchupOwn='',lastMatchupSession='',lastMatchupSync='',matchupFocusError=null;let matchupFocusChain=Promise.resolve();
const publicMatchupIds=()=>client.connected&&client.phase==='ChampSelect'?enemy:[];
const matchupContext=()=>JSON.stringify([client.connected,client.phase,publicClientGameId(client)||'',publicMatchupIds()]);
const matchupPreparationContext=()=>JSON.stringify([matchupContext(),client.mode?.id,currentPlayerSelection(client.session,data.champions,slots)]);
const sameMatchupSelection=(a,b)=>a&&b&&['id','role','mode'].every(field=>a[field]===b[field]);
const chosenMatchupOpponent=selection=>{const key=matchupTargetKey(selection),pending=sameMatchupSelection(selection,client.opponentFocus)?client.opponentFocus.opponentId:'',prepared=sameMatchupSelection(selection,guideSelection)&&guideSelection.matchupGameId===publicClientGameId(client)?guideSelection.threatId:'';return publicMatchupOpponent(data,publicMatchupIds(),matchupTargets.has(key)?matchupTargets.get(key):pending||prepared);};
const opponentRefreshes=new Set(),opponentRefreshErrors=new Map();
const opponentRequestKey=selection=>{const opponent=chosenMatchupOpponent(selection);return opponent?opponentBuildKey(selection.id,selection.role,opponent.id,data.buildSource,data.patch):'';};
const opponentRefreshStatus=selection=>{const key=opponentRequestKey(selection);return {pending:opponentRefreshes.has(JSON.stringify([selectionRequestContext(),matchupPreparationContext(),key])),error:opponentRefreshErrors.get(key)||''};};
async function refreshOpponentConfiguration(el){
 const drawer=overlay.contains(el),selection=drawer?buildSelection():companionPreparation()?.selection,target=selection&&chosenMatchupOpponent(selection);
 if(!target||selection.mode!=='rift'||el.dataset.plan!==[selection.id,selection.role,selection.mode].join(':'))throw Error('请重新确认英雄、位置与公开对手');
 const publicContext=matchupPreparationContext(),model=matchupPreparation({data,selection,enemyIds:publicMatchupIds(),targetId:target.id,publicContext});
 if(!model||model.context!==el.dataset.context)throw Error('当前比较已变化，请重新刷新');
 const source={...data.buildSource},patch=data.patch,key=opponentBuildKey(selection.id,selection.role,target.id,source,patch),context=selectionRequestContext(),requestKey=JSON.stringify([context,publicContext,key]);
 if(opponentRefreshes.has(requestKey))return;opponentRefreshes.add(requestKey);opponentRefreshErrors.delete(key);render();if(buildView)renderBuild();
 try{
  const ref=await api.refreshOpponentBuild(selection.id,selection.role,target.id,source);
  if(data.patch!==patch)return;
  if(!sameBuildSource(ref,source)||!validReference(ref,champ(selection.id),selection.role,data,{opponent:target.id}))throw Error('所选对手来源未通过核对');
  data.opponentBuildSources={...data.opponentBuildSources,[opponentBuildKey(selection.id,selection.role,target.id,source,ref.patch)]:ref};
  if(key===opponentRequestKey(selection)&&context===selectionRequestContext()&&publicContext===matchupPreparationContext())toast('已取得所选对手的统计参考；选择配置后才会采用');
 }catch(error){if(context===selectionRequestContext()&&publicContext===matchupPreparationContext()){const message=String(error.message||'对手来源暂不可用').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');opponentRefreshErrors.set(key,message);while(opponentRefreshErrors.size>30)opponentRefreshErrors.delete(opponentRefreshErrors.keys().next().value);}}
 finally{opponentRefreshes.delete(requestKey);render();if(buildView)renderBuild();}
}
function resetOpponentConfiguration(el){
 const drawer=overlay.contains(el),plan=drawer?{selection:buildSelection()}:companionPreparation();
 if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('英雄或位置已变化，请重新确认');
 const selection=changeCompanionPlan(data,plan.selection,'source-opponent-reset');
 if(drawer){for(const field of CONFIGURATION_FIELDS)delete buildView[field];Object.assign(buildView,selection);renderBuild();}
 else{rememberPreparation(selection);if(plan.intent)rememberIntentPreparation(selection);if(!plan.preview)syncPreparedGuide(selection);render();}
 toast('已恢复普通同位置来源；自选符文、加点与 D/F 继续保留');
}
const matchupFocusStatus=selection=>{
 const target=chosenMatchupOpponent(selection);if(!target)return client.opponentFocusNotice||'';
 if(matchupFocusError&&matchupFocusError.selectionContext===client.selectionContext&&matchupFocusError.opponentId===target.id)return '未同步到局内指引：'+matchupFocusError.message+'；请同步客户端后重新选择。';
 if(sameMatchupSelection(selection,guideSelection)&&guideSelection.threatId===target.id&&guideSelection.matchupGameId===publicClientGameId(client))return '已与本局绑定，进入游戏后沿用此对手。';
 if(sameMatchupSelection(selection,client.opponentFocus)&&client.opponentFocus.opponentId===target.id&&client.opponentFocus.status==='confirmed')return '已与本局绑定，进入游戏后沿用此对手。';
 if(sameMatchupSelection(selection,client.opponentFocus)&&client.opponentFocus.opponentId===target.id)return '已记住选择，等待客户端确认本局；连接中断或重启后需重选。';
 return sameMatchupSelection(selection,myPreparation()?.selection)&&api.matchupFocus?'正在同步本局对手…':'当前只调整这套方案；选定自己的英雄后再确认本局对手。';
};
function syncMatchupFocus(selection,opponentId){
 const own=myPreparation(),gameId=publicClientGameId(client);
 if(!api.matchupFocus||client.phase!=='ChampSelect'||!client.selectionContext||!own||!sameMatchupSelection(selection,own.selection))return;
 const context={id:selection.id,role:selection.role,mode:selection.mode,opponentId:opponentId||'',gameId,selectionContext:client.selectionContext},key=JSON.stringify(context);if(key===lastMatchupSync)return;
 lastMatchupSync=key;matchupFocusError=null;matchupFocusChain=matchupFocusChain.catch(()=>{}).then(async()=>{await saveChain;return api.matchupFocus(context);}).then(result=>{if(context.selectionContext===client.selectionContext){client={...client,opponentFocus:result.focus,opponentFocusNotice:result.notice};}render();if(buildView)renderBuild();}).catch(error=>{if(lastMatchupSync===key&&context.selectionContext===client.selectionContext){lastMatchupSync='';matchupFocusError={...context,message:error.message};toast('本局对手尚未同步：'+error.message,true);render();if(buildView)renderBuild();}});
}
function currentMatchupSelect(el){
 if(!el?.hasAttribute('data-matchup-target'))return true;
 const ids=[...new Set(publicMatchupIds())].filter(id=>champ(id));
 const target=chosenMatchupOpponent(overlay.contains(el)?buildView:companionPreparation()?.selection);
 return JSON.stringify([...el.options].map(option=>option.value))===JSON.stringify(['',...ids])&&el.value===(target?.id||'');
}
function changeMatchupTarget(el){
 const selection=el.closest('#overlay-root')?buildView:companionPreparation()?.selection,key=matchupTargetKey(selection);
 assertConfigurationEditable(selection&&{...selection,readOnly:configurationReadOnly(selection,client,taskOwnRole())});
 if(!selection||selection.mode!=='rift'||el.dataset.plan!==key)throw Error('英雄或位置已变化，请重新选择对手');
 if(el.value&&!publicMatchupOpponent(data,publicMatchupIds(),el.value))throw Error('对手已不在公开选人中，请重新确认');
 matchupTargets.set(key,el.value);syncMatchupFocus(selection,el.value);
 render();if(buildView)renderBuild();
}
let buildReturn=null,guideSelection=null,lastGuideSyncKey='',guideSyncChain=Promise.resolve(),guideSyncPending=0,guideSyncBase=null,guideRevision=0,runeApplying=false;const runeAppliedKeys=createRuneApplicationState();
// Each explicit click replaces one editable page; remember the applied scheme.
const app=document.getElementById('app'),overlay=document.getElementById('overlay-root');
const champ=id=>data.champions.find(c=>c.id===id);
const roleName=id=>ROLES.find(r=>r.id===id)?.name||id;
const assignedPlayerRole=()=>CLIENT_POSITION_ROLES[String(client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId)?.assignedPosition||'').toUpperCase()];
const rarityName={kSilver:'白银',kGold:'黄金',kPrismatic:'棱彩'};
const nav=[['draft','开黑推荐','team'],['room','开黑房间','link'],['history','战绩查询','ranking'],['ongoing','实时对局','sword'],['builds','符文与出装','sword'],['reference','英雄图鉴','book'],['rankings','各路排行','ranking'],['patches','版本改动','refresh'],['hex','海克斯手册','hex'],['favorites','我的收藏','star'],['settings','数据与连接','settings']];
function toast(message,error=false){clearTimeout(toastTimer);const el=document.getElementById('toast');el.textContent=message;el.className=`show ${error?'error':''}`;toastTimer=setTimeout(()=>el.className='',error?7000:3800);}
function restoreRejectedSave(before,failed){
 saved.preparations=preparations.snapshot();
 const viewed=buildView&&buildSelection();
 const restoredView=viewed&&rollbackUnacceptedState(before,failed,{preparations:[viewed]}).preparations.find(value=>['id','role','mode'].every(field=>value[field]===viewed[field])&&(value.comboId||'')===(viewed.comboId||''));
 saved=rollbackUnacceptedState(before,failed,saved);preparations.restore(saved.preparations);
 slots=saved.draft?.slots||initialSlots();scope=saved.draft?.scope||'party';soloRole=saved.draft?.soloRole||'';style=saved.draft?.style||saved.preferences.style||'fun';activeCreativePlan=saved.draft?.creativePlan||null;
 if(pendingIntentPreparation)pendingIntentPreparation=preparations.recall(pendingIntentPreparation);
 if(buildView){for(const field of [...CONFIGURATION_FIELDS,'augmentIds','compareIds','ownedAugmentIds'])delete buildView[field];Object.assign(buildView,{conditions:[],coreIndex:0},restoredView||{id:viewed.id,role:viewed.role,mode:viewed.mode});}
 selectBuildSource(data,saved.preferences.buildSource);markResultStale();cancelRecommendation();results=[];offset=0;
 restoringSave=true;try{render();if(buildView)renderBuild();}finally{restoringSave=false;}
}
function persist({throwOnError=false,derived=false,rangeEdit=null}={}){
 if(validPartyCount(saved.draft?.partyCount)){
  if(scope!=='context')scope='party';
  slots=reconcilePartyRange(slots,client.connected?client.session:null,data.champions,{count:saved.draft.partyCount,party:currentParty(),ownRole:taskOwnRole(),roleOrder:currentRankedRoles()});
 }
 // Keep an accepted plan across preview changes. Save those public heroes as
 // unknown while retaining their player bindings and manual lane ownership.
 let draftSlots=slots;
 if(activeCreativePlan&&!creativePlanCompatible(activeCreativePlan,draftSlots)){
  const confirmed=confirmedClientDraft(slots,client.connected?client.session:null,data.champions).slots;
  const editable=editableLocalDraft(slots,client.connected?client.session:null,data.champions,taskOwnRole()).slots.map(slot=>Number.isInteger(slot.clientCellId)&&!confirmed.find(value=>value.role===slot.role)?.champion?{...slot,champion:null,locked:false}:slot);
  if(creativePlanCompatible(activeCreativePlan,editable))draftSlots=editable;
 }
 saved.draft={slots:draftSlots,style,scope,soloRole,...(saved.draft?.preselection?{preselection:saved.draft.preselection}:{}),...(savedPartyCount(draftSlots,saved.draft?.partyCount)!==undefined?{partyCount:savedPartyCount(draftSlots,saved.draft?.partyCount)}:{}),...(activeCreativePlan&&creativePlanCompatible(activeCreativePlan,draftSlots)?{creativePlan:activeCreativePlan}:{}),...(saved.draft?.clientGameId?{clientGameId:saved.draft.clientGameId}:{}),...(saved.draft?.playerPosition?{playerPosition:saved.draft.playerPosition}:{})};saved.preferences.style=style;saved.preparations=preparations.snapshot();
 const pending={snapshot:structuredClone(saved)};pendingSaves.add(pending);
 const request=saveChain.catch(()=>{}).then(async()=>{
  const before=structuredClone(savedBase);
  try{
   const response=rangeEdit&&api.partyRange?await api.partyRange(rangeEdit):await api.saveState(pending.snapshot,before),accepted=response?.state||pending.snapshot;
   for(const queued of pendingSaves)if(queued!==pending)queued.snapshot=rebaseWindowState(pending.snapshot,queued.snapshot,accepted);
   acceptSavedState(accepted,response?.revision||stateRevision,pending.snapshot);
  }
  catch(error){for(const queued of pendingSaves)if(queued!==pending)queued.snapshot=rollbackUnacceptedState(before,pending.snapshot,queued.snapshot);restoreRejectedSave(before,pending.snapshot);
   // A background public snapshot may lose a race to a player's newer lane
   // choice in the other window. Keep that accepted choice, without retrying
   // or concealing conflicts from explicit edits or failures to write disk.
   if(derived&&/选人配置同时发生变化|客户端已选英雄不能移除或解锁/.test(error.message)){
    const latest=await api.ready();if(!latest?.state)throw error;
    for(const queued of pendingSaves)if(queued!==pending)queued.snapshot=rebaseWindowState(before,queued.snapshot,latest.state);
    acceptSavedState(latest.state,latest.revision||stateRevision);return;
   }throw error;
  }
  finally{pendingSaves.delete(pending);drainExternalState();}
 });
 saveChain=request.catch(err=>{if(!throwOnError)toast('保存失败，已恢复上次保存的配置：'+err.message,true);});scheduleRoomPublish();return throwOnError?request:saveChain;
}
function acceptSavedState(accepted,revision,base=savedBase){
 const viewed=buildView&&buildSelection();
 const recommendationBefore=recommendationKey(recommendationInput());
 const previousPlanId=activeCreativePlan?.id;
 const previous=JSON.stringify(saved),draftBefore=saved.draft,sourceBefore=JSON.stringify(saved.preferences.buildSource),guideBefore=JSON.stringify(saved.guide?.selection);
 saved=rebaseWindowState(base,saved,accepted);savedBase=structuredClone(accepted);stateRevision=Math.max(stateRevision,revision);
 preparations.restore(saved.preparations);slots=saved.draft?.slots||initialSlots();scope=saved.draft?.scope||'party';soloRole=saved.draft?.soloRole||'';style=saved.draft?.style||saved.preferences.style||'fun';activeCreativePlan=saved.draft?.creativePlan||null;
 if(draftBefore?.clientGameId&&draftBefore.clientGameId!==saved.draft?.clientGameId||validPartyCount(draftBefore?.partyCount)&&!validPartyCount(saved.draft?.partyCount))clearSelectionUi();
 if(previousPlanId!==activeCreativePlan?.id&&(activeCreativePlan||lastTaskSelection?.comboId===previousPlanId))lastTaskSelection=null;
 // Configuration edits are already included in saved.preparations. Hydrate
 // open views before rendering; rendering an old drawer must not save its
 // stale defaults over a change accepted from the other window.
 if(viewed){const currentGuide=saved.guide?.selection,guideChanged=!guideSyncPending&&guideBefore!==JSON.stringify(currentGuide)&&['id','role','mode'].every(field=>currentGuide?.[field]===viewed[field]);const next=guideChanged?currentGuide:saved.preparations.find(value=>preparationIdentity(value)===preparationIdentity(viewed));for(const field of [...CONFIGURATION_FIELDS,'augmentIds','compareIds','ownedAugmentIds'])delete buildView[field];Object.assign(buildView,{conditions:[],coreIndex:0},next||{id:viewed.id,role:viewed.role,mode:viewed.mode,...(viewed.comboId?{comboId:viewed.comboId,creativePlan:viewed.creativePlan}:{})});}
 if(pendingIntentPreparation){if(pendingIntentPlanId!==(activeCreativePlan?.id||'')){pendingIntentPreparation=null;pendingIntentPlanId='';}else pendingIntentPreparation=preparations.recall(pendingIntentPreparation);}
 if(!guideSyncPending){guideSelection=saved.guide?.selection||null;guideSyncBase=guideSelection;lastGuideSyncKey=guideSelection?buildChoiceKey(guideSelection):'';}
 if(sourceBefore!==JSON.stringify(saved.preferences.buildSource))selectBuildSource(data,saved.preferences.buildSource);
 if(draftBefore?.clientGameId!==saved.draft?.clientGameId||recommendationBefore!==recommendationKey(recommendationInput())){markResultStale();cancelRecommendation();results=[];offset=0;queueCompanionRecommendation();}
 if(previous!==JSON.stringify(saved)){render();if(buildView)renderBuild();}
}
function drainExternalState(){
 clearTimeout(externalStateTimer);
 if(!externalState||externalState.revision<=stateRevision){externalState=null;return;}
 if(pendingSaves.size||guideSyncPending||clientPreparing||runeApplying||candidatePreparing){externalStateTimer=setTimeout(drainExternalState,100);return;}
 const next=externalState;externalState=null;acceptSavedState(next.state,next.revision);
}
function acceptSharedData(value){
 if(!value?.changes||value.revision<=dataRevision)return;dataRevision=value.revision;
 if(!value.replace&&Object.keys(value.changes).every(key=>key==='dataFeed')){data.dataFeed=value.changes.dataFeed;if(route==='settings')render();return;}
 const recommendationBefore=recommendationKey(recommendationInput());
 data=value.replace?value.changes:{...data,...value.changes};bindPlayerBuildPreferences();rankedRolesCache=null;
 data.catalog=configureCatalog(data.catalog||BUNDLED_CATALOG);data.catalogInfo||={...catalogIssues(data.catalog,data),version:data.catalog.version};configureAssets(data);selectBuildSource(data,saved.preferences.buildSource);
 if(recommendationBefore!==recommendationKey(recommendationInput())){markResultStale();cancelRecommendation();results=[];offset=0;}
 render();if(buildView)renderBuild();queueCompanionRecommendation();
}
async function restorePreparationSnapshot(snapshot){
 if(!snapshot||snapshot.revision<preparationRevision)return;
 clientPreparationStatuses.clear();itemSetStatuses.clear();runeAppliedKeys.clear(true);preparationRevision=0;positionClaim=null;
 for(const event of snapshot.events||[])await acceptSharedPreparation(event,false);
 preparationRevision=Math.max(preparationRevision,snapshot.revision||0);positionClaim||=restoredRoleClaim(saved.draft?.preselection,client,data.champions);if(positionClaim){draftComparing=true;companionTab='recommend';}render();
}
async function acceptSharedPreparation(event,fresh=true){
 if(!event||event.revision&&event.revision<=preparationRevision)return;
 preparationRevision=Math.max(preparationRevision,event.revision||0);
 if(event.kind==='invalidate'){
  if(event.reset||event.operation==='selection')positionClaim=event.current!==false?event.positionClaim||null:null;
  if(positionClaim){draftComparing=true;companionTab='recommend';companionPreview=null;lastTaskSelection=null;creativePlanNotice='';}
  if(event.reset)clientPreparationStatuses.clear();else invalidatePreparationStatuses(clientPreparationStatuses,event.affects||[]);
  if(event.reset||event.affects?.includes('items'))invalidateItemSetStatuses(itemSetStatuses,{reset:!!event.reset});
  if(event.reset||event.affects?.includes('runes'))runeAppliedKeys.clear(!!event.reset);render();return;
 }
 if(event.current===false)return;
 const claimOnly=event.kind==='selection'&&(event.value?.preselectOnly===true||event.value?.claimPosition===true);
 if(claimOnly)positionClaim=event.result?.steps?.hover?.status==='done'?{...event.ledgerContext,championId:event.value.championId,role:event.value.role,pending:false}:null;
 if(fresh)await sync(false,{fresh:true});
 if(event.revision&&event.revision<preparationRevision)return;
 const ledger=event.ledgerContext,context=event.kind==='selection'?event.value?.context:event.context;
 const own=client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId),gameId=ledger?.gameId||context?.gameId;
 if(!client.connected||client.phase!=='ChampSelect'||!gameId||preparationGameId(client)!==gameId||ledger&&own?.cellId!==ledger.cellId)return;
 if(claimOnly){
  if(activeRoleClaim(positionClaim,client)){draftComparing=true;companionTab='recommend';companionPreview=null;lastTaskSelection=null;creativePlanNotice='';}
  render();queueCompanionRecommendation();return;
 }
 const page=event.kind==='selection'?event.value?.page:event.page,championId=event.kind==='selection'?event.value?.championId:context?.championId||context?.championPickIntent;
 const id=data.champions.find(c=>c.key===championId)?.id;
 if(event.kind==='runes'&&page&&event.result?.complete!==false&&!event.result?.message){confirmPreparationResource(clientPreparationStatuses,'runes',payload=>samePreparationPayload({page:payload.page},{page}));if(id)runeAppliedKeys.confirm(runeAppliedKeys.begin(runeApplicationKey(id,myPreparation()?.selection.role||companionPreparation()?.selection.role,page)));}
 if(event.kind==='items'&&event.itemSet&&event.result&&event.result.complete!==false&&!event.result.message){
  const candidates=[ownTaskPreparation(),myPreparation(),companionPreparation({currentOnly:true}),buildView&&{selection:buildView,build:buildView.build}].map(plan=>clientPreparationPlan(data,plan)).filter(Boolean).map(prepared=>({key:clientPreparationKey(client,prepared),payload:prepared.value}));
  confirmPreparationResource(clientPreparationStatuses,'items',payload=>JSON.stringify(payload.itemSet)===JSON.stringify(event.itemSet),candidates);
  itemSetStatuses.set(JSON.stringify(event.itemSet),itemSetSuccessStatus(event.result));
 }
 if(event.kind==='selection'){
  // Reconstruct the exact historical payload, never relabel a newer editor state
  // as the payload that was actually written.
  const selection=event.selection,record=selection&&champ(selection.id)?{selection,build:getBuild(champ(selection.id),selection.role,data,selection)}:null;
  if(record&&event.result?.steps?.hover?.status==='done'&&(own?.championId||own?.championPickIntent)===champ(selection.id)?.key){lastTaskSelection=selection;returnToTeamAfterPreparation(selection);}
  for(const plan of [record,ownTaskPreparation(),myPreparation(),companionPreparation({currentOnly:true})]){
   const prepared=clientPreparationPlan(data,plan);if(prepared&&samePreparationPayload(prepared.value,event.value))clientPreparationStatuses.set(clientPreparationKey(client,prepared),event.result);
  }
  if(id&&event.result?.steps?.runes?.status==='done'&&page)runeAppliedKeys.confirm(runeAppliedKeys.begin(runeApplicationKey(id,event.value.role,page)));
 }
 render();if(buildView)renderBuild();
}

function roomErrorMessage(error){
 const raw=String(error?.message||'').replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/,'');
 if(/ECONNREFUSED/.test(raw))return '连接被拒绝：确认房主已创建房间，地址和端口正确';
 if(/EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|ETIMEOUT|timeout|超时/i.test(raw))return '无法连接：确认和房主在同一局域网或虚拟局域网，并检查防火墙';
 if(/ENOTFOUND|EAI_AGAIN/.test(raw))return '地址无法解析：请让房主重新发送邀请码';
 return raw||'操作失败，请重试';
}
function roomResultProposal(result){
 const strategy=resultCreativePlan(result),members=recommendationMembers(result),included=new Set(members.map(m=>m.role)),lineup=shareFromSlots(result.slots.map(s=>included.has(s.role)?s:{...s,champion:null}),null,'rift').lineup;
 return {lineup,mode:'rift',configurations:captureRoomConfigurations(members,data,preparations,{creativePlan:strategy,mode:'rift'}),...(strategy?{strategy}:{})};
}
function roomSharePayload(){
 const mode=client.connected?(client.mode?.id||null):'rift',own=client.connected&&client.phase==='ChampSelect'?client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId):null;
 const plannedRole=own&&activeCreativePlan?taskOwnRole():'',plannedSlot=slots.find(s=>s.role===plannedRole);
 const role=roomOwnRole()||(plannedSlot&&(!Number.isInteger(plannedSlot.clientCellId)||plannedSlot.clientCellId===own.cellId)?plannedRole:'');
 const ownId=data.champions.find(c=>c.key===Number(own?.championId||own?.championPickIntent))?.id;
 let visible=publicDraftContext();
 // Share the adopted proposal while our replaceable old hover is still in
 // the client. Public teammates and completed picks continue to constrain it.
 if(own&&activeCreativePlan?.members.some(m=>m.role===role)){
  const editable=editableLocalDraft(slots,client.session,data.champions,role),proposed=recommendationDraft(editable.slots,editable.session,data.champions,{ownRole:role,party:currentParty(),confirmedOnly:true});
  if(editable.session!==client.session&&creativePlanCompatible(activeCreativePlan,proposed))visible=proposed.map(s=>{const member=activeCreativePlan.members.find(m=>m.role===s.role);return member&&!s.champion?{...s,champion:member.champion,locked:false}:s;});
 }
 if(own&&!ownId&&!activeCreativePlan?.members.some(m=>m.role===role))visible=visible.map(s=>s.role===role&&s.automaticPosition&&!s.manualPosition&&(!Number.isInteger(s.clientCellId)||s.clientCellId===own.cellId)?{...s,champion:null,locked:false}:s);
 const share=shareFromSlots(visible,role,mode);if(!share)return null;
 // A proposed lineup and the actual public pick are separate facts.
 if(own)share.pick=ownId&&role?{champion:ownId,role,mode}:null;
 const candidate=captureRoomStrategy(visible,data,activeCreativePlan,mode);if(candidate?.id!==roomStrategySnapshot?.id)roomStrategySnapshot=candidate;
 return {...share,...(saved.draft?.preselection?{intent:{role:saved.draft.preselection.role,champion:saved.draft.preselection.champion}}:{}),configurations:mode==='aram'?[]:captureRoomConfigurations(visible,data,preparations,{creativePlan:roomStrategySnapshot,guide:guideSelection,current:buildView?buildSelection():null,mode}),...(roomStrategySnapshot?{strategy:roomStrategySnapshot}:{})};
}
async function confirmRoomAdoption(row,adopted){
 const role=taskOwnRole();
 if(!room?.adoptions||!api.roomBallot||adopted.conflicts.length||adopted.configurationErrors.length||!row.proposal.lineup.some(s=>s.role===role&&s.champion))return;
 try{room=await api.roomBallot({version:1,accepted:{key:row.key,role}});}
 catch{creativePlanNotice=[creativePlanNotice,'采用状态暂未同步，请重新点击采用重试。'].filter(Boolean).join(' ');}
}
async function publishRoomShare({force=false}={}){
 if(!room||room.mode==='idle'||!api.roomPublish)return false;
 try{const share=roomSharePayload();if(!share)return false;
  const signature=JSON.stringify(share);if(!force&&signature===roomShareSig)return true;
  roomShareSig=signature;room=await api.roomPublish(share);roomShareWarned=false;return true;}
 catch{roomShareSig='';if(!force&&!roomShareWarned){roomShareWarned=true;toast('阵容暂时没有同步到房间，请检查房间连接',true);}return false;}
}
function scheduleRoomPublish(){
 if(!room||room.mode==='idle'||!api.roomPublish)return;
 clearTimeout(roomShareTimer);
 roomShareTimer=setTimeout(()=>{publishRoomShare();},600);
}
// The quiet hint is a claim about the room, not about a single update: it
// starts on the first connected snapshot of an auto room (including the one a
// rebuilt window reads at boot) and is reset by any snapshot that is not a
// connected auto room. A rebuilt room also has to hear the current share
// again: the payload signature alone would suppress an unchanged one.
function applyRoomSnapshot(snapshot){
 const wasActive=!!(room&&room.mode!=='idle');
 room=snapshot;
 const identity=snapshot&&snapshot.mode!=='idle'?String(snapshot.room||''):'';
 // A same-room reconnect (for example the automatic nickname upgrade) must
 // republish: the relay keeps no share state for the returning member.
 if(identity!==roomShareRoom||(!wasActive&&identity)){roomShareRoom=identity;roomShareSig='';if(identity)scheduleRoomPublish();}
 const quiet=!!(snapshot?.auto&&snapshot.mode!=='idle'&&snapshot.link==='connected');
 if(quiet&&!roomQuietTimer)roomQuietTimer=setTimeout(()=>{roomQuietTimer=null;roomAutoQuiet=true;if(windowLayout.docked||route==='draft'||route==='room')render();},AUTO_QUIET_MS);
 if(!quiet){if(roomQuietTimer){clearTimeout(roomQuietTimer);roomQuietTimer=null;}roomAutoQuiet=false;}
}
function rememberPreparation(value){if(restoringSave)return value;const before=preparations.recall(value),next=preparations.remember(value);if(JSON.stringify(before)!==JSON.stringify(next))persist();return next;}
function rememberIntentPreparation(selection){pendingIntentPreparation=structuredClone(selection);pendingIntentPlanId=activeCreativePlan?.id||'';}
function currentPickIntent(){return companionPickIntent(client,data.champions,slots,{scope,soloRole,playerPosition:saved.draft?.playerPosition,creativePlan:activeCreativePlan,catalogStatus:data.catalogInfo?.status});}
function invalidate({rangeEdit=null}={}){preservePlayerPosition();reconcileCreativePlan();const own=currentPlayerSelection(client.session,data.champions,slots);if(scope==='solo'&&own?.positionKnown)soloRole=own.role;recommendationError='';markResultStale();cancelRecommendation();results=[];offset=0;autoRecommendationKey='';persist({rangeEdit});render();queueCompanionRecommendation();}
function candidateScrollPosition(){
 const pane=app.querySelector('.task-candidate-list');if(!pane)return null;
 const top=pane.getBoundingClientRect().top,rows=[...pane.querySelectorAll('.compact-candidate,.room-ballot-row')];
 const anchor=rows.find(row=>row.getBoundingClientRect().bottom>top);
 return {top:pane.scrollTop,proposal:anchor?.dataset.proposalKey,index:anchor?.dataset.resultIndex,offset:anchor?anchor.getBoundingClientRect().top-top:0,results:renderedDraftResults,context:renderedSelectContext};
}
function restoreCandidateScroll(position,context){
 const pane=app.querySelector('.task-candidate-list');
 if(!pane||!position||position.results!==results||position.context!==context)return;
 if(position.top<=1){pane.scrollTop=0;return;}
 const anchor=[...pane.querySelectorAll('.compact-candidate,.room-ballot-row')].find(row=>position.proposal?row.dataset.proposalKey===position.proposal:position.index!==undefined&&row.dataset.resultIndex===position.index);
 pane.scrollTop=anchor?anchor.getBoundingClientRect().top-pane.getBoundingClientRect().top-position.offset:position.top;
}
function markNewRoomProposals(previous){
 for(const row of app.querySelectorAll('.room-ballot-row'))if(!previous.has(row.dataset.proposalKey))row.dataset.arrival='true';
}
function render(){
 const formFocus=app.contains(document.activeElement)&&['history','ongoing'].includes(route)&&document.activeElement.matches('input,textarea,select')?{tag:document.activeElement.tagName,id:document.activeElement.id,data:{...document.activeElement.dataset},value:document.activeElement.value,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
 const rankingFocus=['ranking-search','patch-search','reference-search'].includes(document.activeElement?.id)?{id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
 const disclosureFocus={scope:renderedDisclosureScope,context:renderedSelectContext,key:disclosureState.captureFocus(app)};
 if(dragPick){pendingDragRender=true;return;}
 const selectContext=appSelectionContext();
 if(activeAppSelect?.isConnected&&app.contains(activeAppSelect)&&renderedSelectContext===selectContext&&currentMatchupSelect(activeAppSelect)){pendingAppRender=true;return;}
 const previousProposals=new Set([...app.querySelectorAll('.room-ballot-row')].map(row=>row.dataset.proposalKey));
 const candidateScroll=candidateScrollPosition();
 activeAppSelect=null;pendingAppRender=false;renderedSelectContext=selectContext;
 if(!selectionUiReset)disclosureState.capture(renderedDisclosureScope,app);
 applyPresentation(saved.preferences.presentation);
 const old=document.querySelector('.companion-content');if(old&&!selectionUiReset){
   companionScroll.set(old.dataset.view,old.scrollTop);
 }
 selectionUiReset=false;
 document.body.classList.toggle('companion-mode',windowLayout.docked);
 const lockedNavigation=localPickLocked(client.session)?preparationGameId(client)+':'+client.session.myTeam.find(p=>p.cellId===client.session.localPlayerCellId)?.championId:'';
 if(!windowLayout.docked&&lockedNavigation!==lastCompanionLocked){lastCompanionLocked=lockedNavigation;if(lockedNavigation){const plan=ownTaskPreparation();if(plan)queueMicrotask(()=>showBuild(plan.selection.id,plan.selection.role,plan.selection.mode,{...plan.selection,quickConfiguration:true}));}}
 if(windowLayout.docked){
  const focused=document.activeElement,focus=app.contains(focused)&&['INPUT','SELECT'].includes(focused.tagName)?{id:focused.id,tag:focused.tagName,data:{...focused.dataset}}:null;
  const preparation=myPreparation(),own=preparation?.own.id||'',claiming=activeRoleClaim(positionClaim,client);
  if(own!==lastCompanionOwn){lastCompanionOwn=own;companionPreview=null;lastCompanionIntent='';if(own&&!claiming&&localPickLocked(client.session))companionTab='plan';companionScroll.delete('plan');}
  const ownPick=client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId),locked=ownPick&&(ownPick.pickState==='locked'||client.session.actions?.flat().some(a=>a.type==='pick'&&a.actorCellId===ownPick.cellId&&a.completed));
  const lockedKey=locked?preparationGameId(client)+':'+ownPick.championId:'';
  if(lockedKey!==lastCompanionLocked){lastCompanionLocked=lockedKey;if(locked){companionPreview=null;companionTab='plan';companionScroll.delete('plan');}}
  const intent=own?null:currentPickIntent(),intentId=intent?.selection.id||'';
  if(intentId!==lastCompanionIntent){lastCompanionIntent=intentId;if(!own)pendingIntentPreparation=null;}
  const plan=companionPreparation(),view=companionTab+(companionPreview?':'+companionPreview.id:plan?.intent?':intent:'+plan.selection.id+':'+plan.selection.role:'');
  if(plan?.intent&&(!pendingIntentPreparation||pendingIntentPlanId!==(activeCreativePlan?.id||'')||!['id','role','mode'].every(field=>pendingIntentPreparation[field]===plan.selection[field])))rememberIntentPreparation(plan.selection);
  const disclosureScope=view+':'+[plan?.selection.id,plan?.selection.role,plan?.selection.mode].join(':');
  const configurationKey=plan&&buildKey(plan.selection.id,plan.selection.role,plan.selection.mode);
  const ownPrepared=clientPreparationPlan(data,preparation||companionPreparation({currentOnly:true}));
  const focusScope=JSON.stringify([client.connected,client.phase,client.game?.gameId||'',own,client.mode?.id||'']);
  if(plan)maybeRefreshBuild(plan.selection.id,plan.selection.role,plan.selection.mode);
  lastRenderedClient=clientRenderIdentity(client);app.innerHTML=companionView({data,client,connectionBusy:syncing,slots,unassigned,enemy,bans:clientBans,scope,soloRole,playerPosition:saved.draft?.playerPosition,preselection:saved.draft?.preselection,style,tab:companionTab,results,ballotKeys:room?.mode!=='idle'&&room?.ballots?results.map(r=>proposalKey(roomResultProposal(r))):[],generating,error:recommendationError,preparation,plan,favorites:saved.favorites,preferences:saved.preferences,room,roomContent:companionTab==='room'?roomPanelHTML():'',rankings:companionTab==='rankings'?rankingsView(data,{...rankingOptions(),compact:true}):'',activePlan:activeCreativePlan,adoptedShare:lastAdoptedRoomShare,draftNotice:creativePlanNotice,preparationStatus:clientPreparing?{message:'正在预选并配置…'}:ownPrepared&&clientPreparationStatuses.get(clientPreparationKey(client,ownPrepared)),configurationStatus:{pending:clientPreparing||runeApplying||!!itemSetPending,itemSetStatuses,clientControls:clientControls(plan,'companion'),refreshing:refreshingBuilds.has(configurationKey),error:buildErrors.get(configurationKey),enemyIds:publicMatchupIds(),publicContext:matchupPreparationContext(),opponentId:plan?chosenMatchupOpponent(plan.selection)?.id||'':'',matchupStatus:plan?matchupFocusStatus(plan.selection):'',opponentRefresh:plan?opponentRefreshStatus(plan.selection):{}},applied:!!preparation&&runeAppliedKeys.has(runeApplicationKey(own,preparation.build.role,preparation.build.runePage)),guideAutoShow:saved.preferences.guideAutoShow!==false,appVersion:boot.version,pairRefresh:pairRefreshStatus(),overlap:windowLayout.overlap,recovery:stateRecovery,taskControls:taskControls(),taskPlan:ownTaskPreparation(),taskComparing:draftComparing,claimingPosition:claiming,showAllCandidates}).replaceAll('loading="lazy"','loading="eager"');
  const content=document.querySelector('.companion-content');content.dataset.view=view;content.dataset.disclosureScope=disclosureScope;content.dataset.focusScope=focusScope;
  renderedDisclosureScope='companion:'+disclosureScope;disclosureState.restore(renderedDisclosureScope,app);markNewRoomProposals(previousProposals);
  if(disclosureFocus.scope===renderedDisclosureScope&&old?.dataset.focusScope===focusScope)disclosureState.restoreFocus(disclosureFocus.key,app);
  content.scrollTop=companionScroll.get(view)||0;
  renderedSelectContext=appSelectionContext();reflectRunePending();
  if(focus&&old?.dataset.focusScope===focusScope){const target=focus.id?document.getElementById(focus.id):[...app.querySelectorAll('button,input,select')].find(control=>control.tagName===focus.tag&&Object.keys(focus.data).length&&Object.entries(focus.data).every(([key,value])=>control.dataset[key]===value));target?.focus({preventScroll:true});}return;
 }
   historyTooltips.close();ongoingTooltips.close();app.innerHTML=`<div class="app-shell recommendation-app"><aside class="sidebar"><div class="brand"><img class="brand-mark" src="../assets/icon.svg" alt="" /><div><div class="brand-name">开黑搭子</div><div class="brand-en">RIFT BUDDY</div></div></div>${mainNavigation()}<div class="sidebar-bottom"><button class="nav-item ${route==='settings'?'active':''}" data-action="navigate" data-route="settings">${icon('settings')}数据与连接</button><div class="sidebar-footer"><span class="status-dot ${client.connected?'connected':''}"></span>${client.connected?'客户端已连接':'未连接客户端'} · v${e(boot.version||'0.1.0')}</div></div></aside><div class="workspace"><header class="topbar">${mainWindowActions()}</header>${clientConnectionNotice(client,saved.preferences,syncing)}<main class="page" id="main" data-page="${route}">${stateRecoveryView(stateRecovery)}${route==='ongoing'?ongoingGameView(ongoing.state,data):route==='history'?matchHistoryView(history.state,data):route==='draft'?renderDraft():route==='room'?renderRoom():route==='builds'?renderLibrary():route==='reference'?championReferenceView(data,{id:referenceHero,query:referenceQuery,role:referenceRole,tab:referenceTab,skill:referenceSkill,variant:referenceVariant}):route==='rankings'?rankingsView(data,rankingOptions()):route==='patches'?patchNotesView(data,{patch:patchVersion,query:patchQuery}):route==='hex'?renderHex():route==='favorites'?renderFavorites():renderSettings()}</main></div></div>`;
 renderedDisclosureScope='main:'+route+':'+(route==='draft'?activeCreativePlan?.id||'':route==='reference'?[referenceHero,referenceRole,referenceTab].join(':'):'');disclosureState.restore(renderedDisclosureScope,app);markNewRoomProposals(previousProposals);
 if(disclosureFocus.scope===renderedDisclosureScope&&disclosureFocus.context===selectContext)disclosureState.restoreFocus(disclosureFocus.key,app);
 restoreCandidateScroll(candidateScroll,selectContext);renderedDraftResults=route==='draft'?results:null;
 reflectRunePending();
  if(rankingFocus){const input=document.getElementById(rankingFocus.id);input?.focus({preventScroll:true});try{input?.setSelectionRange(rankingFocus.start,rankingFocus.end);}catch{}}
  if(formFocus){const target=formFocus.id?document.getElementById(formFocus.id):[...app.querySelectorAll('input,textarea,select')].find(node=>node.tagName===formFocus.tag&&Object.keys(formFocus.data).length&&Object.entries(formFocus.data).every(([key,value])=>node.dataset[key]===value));if(target&&!target.disabled){if(target.tagName==='TEXTAREA'||['text','search','number','date'].includes(target.type))target.value=formFocus.value;target.focus({preventScroll:true});try{target.setSelectionRange(formFocus.start,formFocus.end);}catch{}}}
}
function mainNavigation(){
 const primary=new Set(['draft','room','history','ongoing','favorites']);
 const item=([id,name,ico])=>`<button class="nav-item ${route===id?'active':''}" data-action="navigate" data-route="${id}" ${route===id?'aria-current="page"':''}>${icon(ico)}<span>${name}</span>${id==='favorites'&&saved.favorites.length?`<span class="badge">${saved.favorites.length}</span>`:''}</button>`;
 const tools=nav.filter(([id])=>id!=='settings'&&!primary.has(id));
 return `<nav aria-label="主导航">${nav.filter(([id])=>primary.has(id)).map(item).join('')}<details class="navigation-tools" data-disclosure-key="navigation-tools" ${tools.some(([id])=>id===route)?'open':''}><summary>${icon('book')}<span>更多工具</span>${icon('chevron')}</summary><div>${tools.map(item).join('')}</div></details></nav>`;
}
function mainWindowActions(){return `<div class="top-actions">${button('companion-attach','打开侧栏','panel','small')}<details class="window-tools"><summary class="btn quiet small">${icon('settings')}窗口与设置</summary><div class="window-tools-content">${client.connected?button('sync',syncing?'同步中…':'同步客户端','link','quiet small',syncing?'disabled':''):''}${button('window-fold','收起窗口','','quiet small','title="暂时收起到屏幕边缘；点小拉手恢复"')}${route==='draft'?button('guide-current','本局指引','book','quiet small'):''}${button('theme-open','配色','','quiet small')}${button('presentation-open','字号与指引','settings','quiet small')}${button('recover-guide','找回指引','book','quiet small')}${button('pin',pinned?'取消置顶':'置顶窗口','pin','quiet small')}<button class="btn quiet small" data-action="navigate" data-route="settings">资料 ${e(data.version)} · 查看状态</button></div></details></div>`;}
function heading(eyebrow,title,desc,ico='spark',extraClass='') {return `<div class="page-heading ${extraClass}"><h1>${title}</h1></div>`;}
function myPreparation(){
 const own=currentPlayerSelection(client.session,data.champions,slots),mode=client.mode?.id;
 if(!own||!['rift','hex'].includes(mode))return null;
 const prepared=guideSelection?.id===own.id&&guideSelection.mode===mode?guideSelection:null;
 const knownRole=taskOwnRole(),role=knownRole||prepared?.role||own.role,combo=mode==='rift'?currentCombo(slots,own.id,role,data.catalogInfo?.status,null,activeCreativePlan):null,context={id:own.id,role,mode,...creativeComboContext(combo)};
 const selection={...rememberedPreparation(context,{allowSavedCombo:!combo&&!comboContextKnown(slots,own.id,role,prepared?.comboId,prepared?.creativePlan)}),...context};
 return {own,positionKnown:!!knownRole,selection,build:getBuild(champ(own.id),role,data,selection)};
}
function companionPreparation({currentOnly=false}={}){
 const preview=currentOnly?null:companionPreview,intent=!preview&&currentPickIntent();
 if(!currentOnly&&!preview){const task=ownTaskPreparation();if(task)return task;}
 if(!preview&&!intent)return myPreparation();
 const context=preview?{...preview,readOnly:configurationReadOnly(preview,client,taskOwnRole())}:intent.selection,pending=intent&&pendingIntentPreparation&&pendingIntentPlanId===(activeCreativePlan?.id||'')&&['id','role','mode'].every(field=>pendingIntentPreparation[field]===context[field]);
 const selection=pending?structuredClone(pendingIntentPreparation):{...rememberedPreparation(context),...context};
 return {preview:true,...(intent?{intent:true,positionKnown:intent.positionKnown}:{}),selection,build:getBuild(champ(context.id),context.role,data,selection)};
}
function roomRoleContext(){return JSON.stringify([client.connected,preparationGameId(client),client.session?.localPlayerCellId]);}
function roomOwnRole(){const target=slots.find(s=>s.role===roomRoleChoice?.role),valid=!client.connected||!Number.isInteger(target?.clientCellId)||target.clientCellId===client.session?.localPlayerCellId;return valid&&roomRoleChoice?.context===roomRoleContext()?roomRoleChoice.role:roomPlayerRole(slots,data.champions,client,soloRole);}
function chooseRoomRole(role){
 if(role&&!ROLES.some(r=>r.id===role))throw Error('请确认位置');
 const own=currentPlayerSelection(client.session,data.champions,slots),cell=client.session?.localPlayerCellId,target=slots.find(s=>s.role===role);
 if(client.connected&&role&&Number.isInteger(target?.clientCellId)&&target.clientCellId!==cell)throw Error('这个位置已有其他玩家，请先在阵容页核对');
 if(own){roomRoleChoice=null;setCompanionRole(role);return;}
 roomRoleChoice={role,context:roomRoleContext()};soloRole=role;persist();render();
}
function roomNickname(){const nick=saved.preferences.roomNick?.trim();return client.playerName||(nick&&nick!=='队友'?nick:'队友');}
function roomPanelHTML(){return api.roomStatus?roomPanel({room,transport:roomTransport,relayUrl:roomRelayUrl,relayRoom:roomRelayRoom,nick:roomNickname(),detectedNick:client.playerName||'',busy:roomBusy,scanning:roomScanning,scanResults:roomScanResults,error:roomError,invite:roomInvite,pin:roomPin,addresses:roomAddresses,champ,hasPreparationFile:!!roomPreparationFile,preparationFileBusy,autoEnabled:saved.preferences.roomAuto===true,autoSync:saved.preferences.autoSync!==false,autoError:room?.autoError||'',autoQuiet:roomAutoQuiet&&(room?.members?.length??0)<=1}):'<p>连接队友房间请使用桌面版。</p>';}
function roomOwnPreparation(){
 const role=roomOwnRole(),slot=slots.find(s=>s.role===role),mode=client.connected?client.mode?.id:'rift';
 if(!slot?.champion||!['rift','hex'].includes(mode))return null;
 const combo=mode==='rift'?currentCombo(slots,slot.champion,role,data.catalogInfo?.status,null,activeCreativePlan):null;
 const context={id:slot.champion,role,mode,...creativeComboContext(combo)},selection={...rememberedPreparation(context),...context};
 return {selection,build:getBuild(champ(slot.champion),role,data,selection)};
}
function taskOwnRole(){
 if(client.connected&&pregamePhase(client.phase))return saved.draft?.preselection?.role||'';
 const own=currentPlayerSelection(client.session,data.champions,slots);
 return manualPlayerSlot(slots,client.session?.localPlayerCellId)?.role||(saved.draft?.playerPosition?.cellId===client.session?.localPlayerCellId?saved.draft?.playerPosition?.role:'')||assignedPlayerRole()||soloRole||(own?.positionKnown?own.role:'');
}
function publicDraftContext(){return clientRecommendationDraft(slots,client.connected?client.session:null,data.champions,{includePreselected:saved.preferences.includePreselected===true,ownRole:taskOwnRole()}).slots;}
function ownTaskPreparation(){
 const own=myPreparation(),intent=companionPreparation({currentOnly:true}),role=taskOwnRole();
 const member=activeCreativePlan?.members.find(m=>m.role===role);
 const slot=slots.find(s=>s.role===role);
 const publicOwn=client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId),publicOwnId=data.champions.find(c=>c.key===Number(publicOwn?.championId||publicOwn?.championPickIntent))?.id;
 if(lastTaskSelection&&(slot?.champion===lastTaskSelection.id||publicOwnId===lastTaskSelection.id)){const selection={...lastTaskSelection,...rememberedPreparation(lastTaskSelection)};return {selection,build:getBuild(champ(selection.id),selection.role,data,selection)};}
 if(publicOwnId&&member&&member.champion!==publicOwnId){if(intent?.selection.id===publicOwnId)return intent;if(own?.selection.id===publicOwnId)return own;}
 const context=member?{id:member.champion,role,mode:'rift',...creativeComboContext(creativeMemberCombo(activeCreativePlan,member.champion,role))}:null;
 if(context){const selection={...rememberedPreparation(context),...context};return {selection,build:getBuild(champ(selection.id),role,data,selection)};}
 if(own)return own;
 if(intent)return intent;
 if(slot?.champion){const combo=currentCombo(slots,slot.champion,role,data.catalogInfo?.status,null,activeCreativePlan),context={id:slot.champion,role,mode:'rift',...creativeComboContext(combo)},selection={...rememberedPreparation(context),...context};return {selection,build:getBuild(champ(slot.champion),role,data,selection)};}
 return null;
}
function renderTaskMembers(){overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal task-members-dialog" role="dialog" aria-modal="true" aria-label="成员与本人位置"><header class="modal-header"><h3>成员与位置</h3>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="modal-body"><label>你负责的位置<select id="task-own-role" class="select"><option value="">待确认</option>${ROLES.map(r=>`<option value="${r.id}" ${taskOwnRole()===r.id?'selected':''}>${r.name}</option>`).join('')}</select></label><p>${['known','lobby'].includes(client.party?.status)?`游戏组队 ${client.party.lobbyCount||client.party.members?.length||1} 人 · 助手房间 ${room?.mode!=='idle'?room?.members?.length||0:0} 人`:'暂未完整识别组队；下方可手动标记。'}</p><ul class="task-party-list">${(client.party?.members||[]).map((m,i)=>'<li><span>'+e(m.displayName||(m.local?'我':'队友 '+(i+1)))+(m.local?' · 你':'')+'</span><small>'+e(slots.find(s=>Number.isInteger(m.cellId)&&s.clientCellId===m.cellId)?roleName(slots.find(s=>s.clientCellId===m.cellId).role):CLIENT_POSITION_ROLES[m.firstPosition]?roleName(CLIENT_POSITION_ROLES[m.firstPosition]):'位置待定')+'</small></li>').join('')}</ul><div class="task-member-roles">${slots.map(s=>`<div>${roleName(s.role)} · ${e(champ(s.champion)?.name||'等待选择')} ${button('toggle-party',s.party?'我们':'队友','','small',`data-role="${s.role}" aria-pressed="${s.party}"`)}${s.champion?button('move-slot','换位','','quiet small',`data-role="${s.role}"`):''}</div>`).join('')}</div></div></section></div>`;}
function taskControls(){const plan=ownTaskPreparation();if(!plan)return '';return preparationProgressView({data,plan,client,view:'task',available:!!api.prepareSelection,busy:clientPreparing||runeApplying||!!itemSetPending,pendingKey:preparationPendingKey,statuses:clientPreparationStatuses,runeApplied:!!plan&&runeAppliedKeys.has(runeApplicationKey(plan.selection.id,plan.selection.role,plan.build.runePage)),compact:windowLayout.docked});}
function memberHeroAction(id,role){return companionHeroAction(client,champ(id),saved.preferences.clickPrepare!==false);}
async function prepareHeroClick(context,expected=null){
 if(clientPreparing||runeApplying||itemSetPending)throw Error('正在应用配置，请稍候');
 if(context.readOnly!==true&&client.connected&&pregamePhase(client.phase)&&(context.mode||'rift')==='rift'){await stagePregameIntent({champion:context.id,role:context.role,selection:heroClickSelection(data,context)});return;}
 const action=memberHeroAction(context.id,context.role);
 if(action.blocked&&context.readOnly!==true)throw Error('英雄已锁定，不能再选择其他英雄；仍可换位置、推荐和投票');
 // A reference lane may belong to an ally. It must not block the local pick
 // or silently move that ally; use the clicked build in the player's current lane.
 const target=slots.find(s=>s.role===context.role);
 if(action.prepare&&taskOwnRole()!==context.role&&(!Number.isInteger(target?.clientCellId)||target.clientCellId===client.session?.localPlayerCellId))setCompanionRole(context.role);
 const mode=context.mode||'rift',combo=mode==='rift'?currentCombo(slots,context.id,context.role,data.catalogInfo?.status,null,activeCreativePlan):null;
 // Resolve the lineup after a lane change, before recalling choices, so a
 // solo default cannot override the combination's own avatar configuration.
 context={...creativeComboContext(combo),...context,mode};
 context=heroClickSelection(data,{...(context.comboId?rememberedPreparation(context):null),...context});
 const selection={...context,...localConfigurationPreview(context,client,taskOwnRole())};
 if(action.readOnly)selection.readOnly=true;
 if(action.prepare){if(saved.draft)delete saved.draft.preselection;selection.readOnly=false;lastTaskSelection=selection;draftComparing=!localPickLocked(client.session);positionClaim=null;}
 if(action.prepare&&!localPickLocked(client.session)){
  clickedHeroPreparation={selection,build:getBuild(champ(selection.id),selection.role,data,selection)};companionPreview=null;companionTab='recommend';closeOverlay();render();
  try{return await useClientPreparation({dataset:{preparationView:'clicked'}},true,expected?{...expected,planId:activeCreativePlan?.id||''}:null);}finally{clickedHeroPreparation=null;}
 }
 if(windowLayout.docked){companionPreview=selection;companionTab='plan';companionScroll.delete('plan');closeOverlay();render();}
 else{showBuild(context.id,context.role,context.mode||'rift',{...selection,quickConfiguration:true});}
 if(action.prepare)return useClientPreparation({dataset:{preparationView:windowLayout.docked?'companion':'build'}},true,expected?{...expected,planId:activeCreativePlan?.id||''}:null);
}
function refreshClickedResult(result,input,current,previousSlots){
 const preferences=value=>recommendationKey({...value,slots:[],clientSession:null,soloChampion:null,publicBans:[],eligibleByRole:{},confirmedPick:null,enemy:[],visibleEnemies:[],publicPicks:[]});
 if(preferences(input)!==preferences(current))return null;
 const members=result.creativePlan?.members||resultCreativePlan(result)?.members||[],targets=new Set([...(result.targets||[]),...members.map(m=>m.role),...result.slots.filter(s=>input.scope==='solo'?s.role===input.soloRole:input.scope==='bot'?['bottom','support'].includes(s.role):s.party).map(s=>s.role)]);
 const publicPick=slot=>Number.isInteger(slot.clientCellId)&&client.session?.myTeam.some(p=>p.cellId===slot.clientCellId&&Number(p.championId)===champ(slot.champion)?.key);
 for(const slot of slots){const before=previousSlots.find(s=>s.role===slot.role);if(!before||slot.party!==before.party)return null;if((slot.champion!==before.champion||slot.locked!==before.locked||slot.manualPosition!==before.manualPosition)&&!publicPick(slot))return null;}
 const next=result.slots.map(slot=>{
  const canonical=slots.find(s=>s.role===slot.role),live=current.slots.find(s=>s.role===slot.role);
  if(!targets.has(slot.role))return {...canonical};
  const assigned=client.session?.myTeam.find(p=>Number(p.championId)>0&&(manualPlayerSlot(slots,p.cellId)?.role||CLIENT_POSITION_ROLES[String(p.assignedPosition||'').toUpperCase()])===slot.role);
  if(assigned&&Number(assigned.championId)!==champ(slot.champion)?.key)return null;
  if(live?.champion&&live.champion!==slot.champion&&(publicPick(canonical)||live.publicIntent))return null;
  if(slot.champion&&(current.publicBans.includes(slot.champion)||current.enemy.includes(slot.champion)||current.publicPicks.includes(slot.champion)||Array.isArray(current.eligibleByRole[slot.role])&&!current.eligibleByRole[slot.role].includes(slot.champion)))return null;
  return publicPick(canonical)?{...canonical}:{...slot};
 });
 if(next.some(s=>!s)||new Set(next.filter(s=>s.champion).map(s=>s.champion)).size!==next.filter(s=>s.champion).length)return null;
 return {...result,slots:next};
}
async function adoptResult(index,fromClick=false){
 let result=results[index];const signature=resultsSignature,input=recommendationInput(),previousSlots=structuredClone(slots),clickGame=preparationGameId(client),clickCell=client.session?.localPlayerCellId,clickMode=client.mode?.id,clickRole=taskOwnRole(),inSelection=client.connected&&client.phase==='ChampSelect';if(!result||signature!==recommendationKey(input))throw Error('推荐条件已变化，请重新推荐');
 if(clientPreparing||runeApplying||candidatePreparing&&!fromClick)throw Error('当前配置进行中，请等待完成后换方案');
 if(client.connected&&client.phase==='ChampSelect'){await sync(false,{fresh:true});if(!client.connected||client.phase!=='ChampSelect'||!client.session)throw Error('无法确认本局选人，请重新连接后采用方案');}
 const current=recommendationInput(),withoutEligibility=value=>recommendationKey({...value,eligibleByRole:{},confirmedPick:null});
 const learnedEligibility=!Object.keys(input.eligibleByRole).length&&Object.keys(current.eligibleByRole).length&&withoutEligibility(input)===withoutEligibility(current)&&result.slots.every(s=>!s.champion||!Array.isArray(current.eligibleByRole[s.role])||current.eligibleByRole[s.role].includes(s.champion));
 if(inSelection&&(clickGame!==preparationGameId(client)||clickCell!==client.session?.localPlayerCellId||clickMode!==client.mode?.id||clickRole!==taskOwnRole()))throw Error('候选或选人已变化，尚未采用；请重新选择');
 if(!learnedEligibility&&(results[index]!==result||resultsSignature!==signature||signature!==recommendationKey(current))){const refreshed=inSelection&&refreshClickedResult(result,input,current,previousSlots);if(!refreshed)throw Error('候选或选人已变化，尚未采用；请重新选择');result=refreshed;}
 const targetRoles=new Set(result.targets),adoptedHeroes=new Set(result.slots.filter(s=>targetRoles.has(s.role)).map(s=>s.champion).filter(Boolean));
 if(slots.some(s=>!targetRoles.has(s.role)&&adoptedHeroes.has(s.champion)&&(Number.isInteger(s.clientCellId)||s.manualPosition)))throw Error('英雄已有客户端位置，请重新同步后选择');
 // Scoring may omit unconfirmed allies. Keep those plans unless this explicit
 // adoption moves the same unbound hero to one of the chosen target lanes.
 const nextSlots=slots.map(slot=>{
  if(!targetRoles.has(slot.role)){if(!adoptedHeroes.has(slot.champion))return slot;const {automaticPosition,publicIntent,...rest}=slot;return {...rest,champion:null,locked:false};}
  const s=structuredClone(result.slots.find(next=>next.role===slot.role)),intent=s.publicIntent;delete s.publicIntent;if(intent){delete s.clientCellId;delete s.manualPosition;}
  return {...s,locked:!!s.champion&&!intent,...(s.champion&&!Number.isInteger(s.clientCellId)&&!s.manualPosition?{automaticPosition:true}:{})};
 });
 const nextPlan=resultCreativePlan(result),inherited=partyRoutePreparations(preparations,result.preparationOrigin,nextPlan);
 preservePlayerPosition();for(const selection of inherited)preparations.remember(selection);
 activeCreativePlan=nextPlan;lastTaskSelection=null;creativePlanNotice='';cancelRecommendation();if(scope==='solo')soloRole=result.targets[0]||soloRole;
 slots=nextSlots;
 closeOverlay();draftComparing=false;companionPreview=null;companionTab='recommend';
 await persist({throwOnError:true});results=[result];resultsSignature=recommendationKey(recommendationInput());render();
 return result;
}
async function prepareCandidate(el){
  if(candidatePreparing||clientPreparing||runeApplying)throw Error('当前配置正在处理，请等待完成');
  if(!champ(el.dataset.id))throw Error('英雄资料已变化');
  const result=results[Number(el.dataset.resultIndex)];
  if(!el.hasAttribute('data-result-index')||!result||!result.slots.some(s=>s.champion===el.dataset.id&&s.role===el.dataset.role))throw Error('推荐条件已变化，请重新推荐');
  const plan=resultCreativePlan(result),combo=plan?creativeMemberCombo(plan,el.dataset.id,el.dataset.role):result.trio||result.duo;
  const action=memberHeroAction(el.dataset.id,el.dataset.role);
  if(action.blocked)throw Error('英雄已锁定，不能选择其他英雄；仍可推荐、提议和投票');
  if(action.prepare){
   const context=heroClickSelection(data,{id:el.dataset.id,role:el.dataset.role,mode:'rift',...creativeComboContext(combo)}),index=Number(el.dataset.resultIndex);
   const inherited=partyRoutePreparations(preparations,result.preparationOrigin,plan).find(s=>s.id===context.id&&s.role===context.role);
   const selection={...rememberedPreparation(context),...inherited,...context};
   const expected={...context,planId:plan?.id||'',fingerprint:clientPreparationPlan(data,{selection,build:getBuild(champ(context.id),context.role,data,selection)})?.fingerprint};
   const clickGame=preparationGameId(client),clickCell=client.session?.localPlayerCellId,clickMode=client.mode?.id;
   const previousTarget=preparationTarget;preparationTarget=selection;
   candidatePreparing=true;try{
    await sync(false,{fresh:true});
    const key=champ(context.id).key,unavailable=client.eligibility?.disabled?.includes(key)||Array.isArray(client.eligibility?.pickable)&&!client.eligibility.pickable.includes(key);
    if(!client.connected||client.phase!=='ChampSelect'||clickGame!==preparationGameId(client)||clickCell!==client.session?.localPlayerCellId||clickMode!==client.mode?.id||unavailable||!memberHeroAction(context.id,context.role).prepare)throw Error('选人或可选英雄已变化，尚未操作；请重新选择');
    // Applying one hero does not require replacing a whole incompatible lineup.
    // Keep the concrete candidate build even when its reference lane is occupied.
    const target=slots.find(s=>s.role===context.role),otherPlayer=Number.isInteger(target?.clientCellId)&&target.clientCellId!==client.session?.localPlayerCellId;
    let adopted=false;
    if(!otherPlayer&&result.targets?.includes(context.role)&&!result.slots.find(s=>s.role===context.role)?.publicIntent&&(!taskOwnRole()||taskOwnRole()===context.role)&&resultsSignature===recommendationKey(recommendationInput())){
     const clickGame=preparationGameId(client),clickCell=client.session?.localPlayerCellId,clickMode=client.mode?.id;
     try{await adoptResult(index,true);adopted=true;}
     catch(error){
      const samePlayer=client.connected&&client.phase==='ChampSelect'&&clickGame===preparationGameId(client)&&clickCell===client.session?.localPlayerCellId&&clickMode===client.mode?.id;
      const key=champ(context.id).key,unavailable=client.eligibility?.disabled?.includes(key)||Array.isArray(client.eligibility?.pickable)&&!client.eligibility.pickable.includes(key);
      if(!samePlayer||unavailable||!memberHeroAction(context.id,context.role).prepare||!/^候选或选人已变化，尚未采用|^推荐条件已变化|^英雄已有客户端位置/.test(error.message))throw error;
     }
    }
    await prepareHeroClick(selection,adopted?expected:null);
   }finally{candidatePreparing=false;preparationTarget=previousTarget;drainExternalState();render();}
  }
  else{companionPreview={...localConfigurationPreview({id:el.dataset.id,role:el.dataset.role,mode:'rift',...creativeComboContext(combo)},client,taskOwnRole()),...(action.readOnly?{readOnly:true}:{})};if(windowLayout.docked){companionTab='plan';closeOverlay();render();}else showBuild(el.dataset.id,el.dataset.role,'rift',companionPreview);}
  return;
}

function readOnlyPreparation(view,plan){return !!plan&&(configurationReadOnly(plan.selection,client,taskOwnRole())||view==='build'&&buildView?.readOnly||view==='companion'&&companionPreview?.readOnly);}
function clientControls(plan,view){if(readOnlyPreparation(view,plan))return taskOwnRole()?'<p class="callout">队友配置仅供查看。</p>':button('task-members','确认本人位置','','small');return clientPreparationControls({data,plan,client,view,available:!!api.prepareSelection,pending:clientPreparing||runeApplying||!!itemSetPending,statuses:clientPreparationStatuses});}
function renderRoom(){
 return `<section class="room-workspace"><header class="room-workspace-heading"><h1>开黑房间</h1>${button('room-to-draft','返回选阵容','','small')}</header>${roomError?`<p class="callout warning" role="alert">${e(roomError)}</p>`:''}${roomPanelHTML()}</section>`;
}
function selectedClientPreparation(view){if(view==='clicked')return clickedHeroPreparation;if(view==='incoming-ballot'){const row=roomBallotBoard(room,publicDraftContext(),data.champions,{scope,soloRole:taskOwnRole(),clientSession:client.connected?client.session:null,party:currentParty(),includePreselected:saved.preferences.includePreselected===true}).find(r=>r.key===clickedRoomPlan?.ballotKey),config=row?.proposal.configurations?.find(c=>c.champion===clickedRoomPlan.id&&c.role===clickedRoomPlan.role);return config?roomClientPlan(config,data,row.proposal.strategy,{localStrategy:captureRoomStrategy(slots,data,activeCreativePlan,config.mode)}):null;}if(view==='incoming-room'){const member=room?.members.find(m=>m.nick===clickedRoomPlan?.member),config=member?.share?.configurations?.find(c=>c.champion===clickedRoomPlan.id&&c.role===clickedRoomPlan.role);return config?roomClientPlan(config,data,member.share.strategy,{localStrategy:captureRoomStrategy(slots,data,activeCreativePlan,config.mode)}):null;}return view==='task'?ownTaskPreparation():view==='room'?roomOwnPreparation():view==='companion'?companionPreparation():view==='build'&&buildView?{selection:buildSelection(),build:buildView.build}:null;}
function returnToTeamAfterPreparation(selection,force=false){
 if(client.connected&&client.phase==='ChampSelect'&&!localPickLocked(client.session))return;
 const current=companionPreparation()?.selection;
 if(windowLayout.docked&&(force||['id','role','mode'].every(field=>current?.[field]===selection[field]))){companionPreview=null;companionTab='plan';companionScroll.delete('plan');}
}
async function useClientPreparation(el,directClick=false,expected=null){
 if(!api.prepareSelection)throw Error('客户端配置请在桌面版使用');
 if(clientPreparing||runeApplying||itemSetPending)throw Error('当前配置正在处理，请等待完成');
 const view=el.dataset.preparationView,plan=selectedClientPreparation(view),prepared=clientPreparationPlan(data,plan);
 if(readOnlyPreparation(view,plan))throw Error(taskOwnRole()?'当前是只读配置，请回到本人的准备操作':'请先确认本人位置，再预选并配置');
 if(expected&&(!plan||['id','role','mode'].some(k=>plan.selection[k]!==expected[k])||expected.planId!==(activeCreativePlan?.id||'')||prepared?.fingerprint!==expected.fingerprint))throw Error('本人位置或点击的方案已变化，尚未操作；请重新选择');
 if(!prepared||!directClick&&(el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':')||el.closest('[data-client-preparation-fingerprint]')?.dataset.clientPreparationFingerprint!==prepared.fingerprint))throw Error('页面方案已变化，请核对后重新点击');
 const clickedContext=runeWriteContext(client),gameId=preparationGameId(client),key=clientPreparationKey(client,prepared),selection=structuredClone(plan.selection),clickedPlanId=activeCreativePlan?.id||'';
 const previousTarget=preparationTarget;preparationTarget=selection;
 clientPreparing=true;preparationPendingKey=key;clientPreparationStatuses.delete(key);render();if(buildView)renderBuild();
 try{
  await sync(false,{fresh:true});
  const current=clientPreparationPlan(data,selectedClientPreparation(view));
  if(!current||current.fingerprint!==prepared.fingerprint||preparationGameId(client)!==gameId||JSON.stringify(runeWriteContext(client))!==JSON.stringify(clickedContext))throw Error('选人或方案已变化，尚未操作；请重新核对');
  await persist({throwOnError:true});
  const dispatchPlan=selectedClientPreparation(view),dispatch=clientPreparationPlan(data,dispatchPlan);
  if(!dispatch||dispatch.fingerprint!==prepared.fingerprint||readOnlyPreparation(view,dispatchPlan)||preparationGameId(client)!==gameId||JSON.stringify(runeWriteContext(client))!==JSON.stringify(clickedContext)||expected&&expected.planId!==(activeCreativePlan?.id||''))throw Error('本人位置、选人或方案已变化，尚未操作；请重新核对');
  if(directClick&&!memberHeroAction(selection.id,selection.role).prepare)throw Error('当前英雄或位置已由队友选择，请查看队友配置或选择另一位');
  const result=await api.prepareSelection({...prepared.value,selection,sessionGameId:gameId,context:clickedContext});
  await guideSyncChain;
  await sync(false,{fresh:true});
  if(!client.connected||client.phase!=='ChampSelect'||preparationGameId(client)!==gameId||client.session?.localPlayerCellId!==clickedContext.cellId){
   toast('选人已结束或进入新局，请按当前英雄重新选择配置');return result;
  }
  if(!result.preparationRevision||result.preparationRevision>=preparationRevision)clientPreparationStatuses.set(key,result);
  if(result.steps?.runes?.status==='done')runeAppliedKeys.clear();
  if(result.steps?.hover?.status==='done'&&preparationGameId(client)===gameId){
   const own=client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId),id=champ(selection.id)?.key,target=slots.find(s=>s.role===selection.role);
   if(target&&(!Number.isInteger(target.clientCellId)||target.clientCellId===own?.cellId)&&(own?.championId||own?.championPickIntent)===id){
    if(target.champion!==selection.id)slots=slots.map(s=>{
     if(s===target)return {role:s.role,party:s.party,...(s.partyManual?{partyManual:true}:{}),champion:selection.id,locked:true,automaticPosition:true};
     if(s.champion!==selection.id||Number.isInteger(s.clientCellId)&&s.clientCellId!==own?.cellId)return s;
     return {role:s.role,party:s.party,...(s.partyManual?{partyManual:true}:{}),champion:null,locked:false};
    });
    reconcileCreativePlan();lastTaskSelection=selection;
   }
  }
  const latestSelection=preparations.recall(selection)||selection;
  rememberPreparation(latestSelection);await persist({throwOnError:true});syncPreparedGuide(latestSelection);await guideSyncChain;await sync(false,{fresh:true});scheduleRoomPublish();
  // The fresh read above observes 0 -> hover and may reset the old intent.
  // Carry the clicked configuration only after that transition was observed.
  const intent=currentPickIntent();
  if(preparationGameId(client)===gameId&&clickedPlanId===(activeCreativePlan?.id||'')&&intent&&['id','role','mode'].every(field=>intent.selection[field]===selection[field]))rememberIntentPreparation(preparations.recall(selection)||latestSelection);
  const own=client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId),target=data.champions.find(c=>c.id===selection.id)?.key;
  if(result.steps?.runes?.status==='done'&&client.connected&&client.phase==='ChampSelect'&&client.mode?.id==='rift'&&preparationGameId(client)===gameId&&(own?.championId||own?.championPickIntent)===target)runeAppliedKeys.confirm(runeAppliedKeys.begin(runeApplicationKey(selection.id,selection.role,prepared.value.page)));
  if(result.steps?.hover?.status==='done'&&preparationGameId(client)===gameId&&(own?.championId||own?.championPickIntent)===target){lastTaskSelection=selection;returnToTeamAfterPreparation(selection,true);}
  toast(result.complete?'预选与配置已完成，锁定请在客户端确认':'部分步骤未完成，请查看操作结果',!result.complete);return result;
 }catch(error){const message=String(error.message||'操作未完成').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');const completed=clientPreparationStatuses.get(key);clientPreparationStatuses.set(key,completed?{...completed,followUpError:message}:{message});throw error;}
 finally{clientPreparing=false;preparationTarget=previousTarget;preparationPendingKey='';while(clientPreparationStatuses.size>30)clientPreparationStatuses.delete(clientPreparationStatuses.keys().next().value);render();if(buildView)renderBuild();}
}
async function claimPosition(role){
 if(!role)return;
 if(!api.prepareSelection)throw Error('预选英雄请在桌面版使用');
 if(clientPreparing||runeApplying||itemSetPending)throw Error('当前配置正在处理，请完成后再选择位置');
 const clickedGame=preparationGameId(client),clickedCell=client.session?.localPlayerCellId;
 const previousTarget=preparationTarget;preparationTarget=null;clientPreparing=true;render();
 try{await sync(false,{fresh:true});
 if(client.connected&&pregamePhase(client.phase)){await stagePregameIntent({role});return;}
 if(clickedGame&&clickedGame!==preparationGameId(client)||Number.isInteger(clickedCell)&&clickedCell!==client.session?.localPlayerCellId)throw Error('选人会话已变化，请重新选择位置');
 const choice=roleClaimChoice(client,role,data.champions,data),id=choice.champion;if(!id)throw Error(choice.reason);
 if(taskOwnRole()!==role)throw Error('位置已变化，请重新选择');
 const context=runeWriteContext(client),gameId=preparationGameId(client),cellId=client.session?.localPlayerCellId;
 const selection={id,role,mode:'rift'},prepared=clientPreparationPlan(data,{selection,build:getBuild(champ(id),role,data,selection)});
 if(!prepared)throw Error('占位英雄资料暂不可用，请直接选择英雄');
 if(slots.some(s=>s.role!==role&&s.champion===id&&(Number.isInteger(s.clientCellId)||s.manualPosition)))throw Error('占位英雄已有手动位置，请直接选择其他英雄');
 preparationTarget=selection;
 positionClaim={gameId,cellId,championId:champ(id).key,role,pending:true};draftComparing=true;companionTab='recommend';companionPreview=null;lastTaskSelection=null;
 const result=await api.prepareSelection({...prepared.value,selection,sessionGameId:gameId,context,claimPosition:true});
 if(result.steps?.hover?.status!=='done')throw Error(result.steps?.hover?.message||'预选未完成');
 positionClaim={gameId,cellId,championId:champ(id).key,role,pending:false};
 if(saved.draft?.preselection)saved.draft.preselection={...saved.draft.preselection,role,champion:id};
 await sync(false,{fresh:true});
 const own=client.session?.myTeam?.find(p=>p.cellId===cellId);
 if(!client.connected||client.phase!=='ChampSelect'||preparationGameId(client)!==gameId||client.session?.localPlayerCellId!==cellId||taskOwnRole()!==role)throw Error('选人或位置已变化，请查看当前配置');
 if((own?.championId||own?.championPickIntent)===champ(id).key){
  slots=slots.map(s=>{
   if(s.role===role)return {...s,champion:id,locked:!!own.championId,automaticPosition:true};
   if(s.champion!==id||Number.isInteger(s.clientCellId)||s.manualPosition)return s;
   const {automaticPosition,publicIntent,...rest}=s;return {...rest,champion:null,locked:false};
  });
  reconcileCreativePlan();await persist({derived:true,throwOnError:true});scheduleRoomPublish();
 }
 companionTab=localPickLocked(client.session)?'plan':'recommend';draftComparing=!localPickLocked(client.session);companionPreview=null;creativePlanNotice='';toast('已预选'+champ(id).name+'占位，继续选择阵容');
 }finally{if(positionClaim?.pending)positionClaim=null;clientPreparing=false;preparationTarget=previousTarget;render();queueCompanionRecommendation();}
}
async function cancelPregameHero(){
 const intent=saved.draft?.preselection;if(!intent?.champion){closeOverlay();return;}
 if(!api.cancelPreselection)throw Error('大厅预选请在桌面版使用');
 await saveChain;
 // Only clear the latest queued hero; preserve current lane and range in main.
 const response=await api.cancelPreselection();
 if(response?.state)acceptSavedState(response.state,response.revision||stateRevision);
 closeOverlay();companionPreview=null;render();queueCompanionRecommendation();
}
async function stagePregameIntent(change={}){
 if(!api.stageSelection)throw Error('大厅预选请在桌面版使用');
 const role=change.role??(saved.draft?.preselection?.role||''),champion=Object.hasOwn(change,'champion')?change.champion:null,kind=champion?'hero':'position';
 await sync(false,{fresh:true});
 // The phase may advance while a visible lobby control is being clicked.
 // Honor that explicit action using the current session, not the old screen.
 if(client.connected&&client.phase==='ChampSelect'){
  if(Object.hasOwn(change,'champion')&&champion){await prepareHeroClick({id:champion,role:role||taskOwnRole()||profile(champ(champion)).roles[0],mode:'rift'});return;}
  setCompanionRole(role);if(role&&!localPickLocked(client.session))await claimPosition(role);return;
 }
 await saveChain;const response=await api.stageSelection({role,champion,kind,...(change.selection?{selection:change.selection}:{})});
 if(response?.state)acceptSavedState(response.state,response.revision||stateRevision);
 if(kind==='hero'){companionPreview=null;companionTab='recommend';closeOverlay();render();}
 queueCompanionRecommendation();
}
function setCompanionRole(role){
 if(role&&!ROLES.some(r=>r.id===role))throw Error('请确认方案位置');
 const previousRole=taskOwnRole();
 const cellId=client.session?.localPlayerCellId;
 const own=currentPlayerSelection(client.session,data.champions,slots),slot=own&&slots.find(s=>s.champion===own.id);
 if(role&&own){
  if(slot&&slot.role!==role)slots=moveChampion(slots,slot.role,role);
  else if(slot&&Number.isInteger(cellId))slots=slots.map(s=>s===slot?{...s,clientCellId:cellId,manualPosition:true}:s);
  else if(!slot){const pick=unassigned.find(p=>p.champion===own.id);slots=assignClientChampion(slots,pick,role);}
 }else if(role&&Number.isInteger(cellId)){
  const target=slots.find(s=>s.role===role);if(Number.isInteger(target.clientCellId)&&target.clientCellId!==cellId)throw Error('这个位置已有其他玩家，请在阵容板交换位置');
  // Choosing who will play a proposed hero does not turn that proposal into
  // a public client pick. Keep the adopted lineup until the player chooses.
  slots=clearManualPlayerPosition(slots,cellId).map(s=>s.role===role&&!s.champion?{...s,clientCellId:cellId,manualPosition:true}:s);
 }else if(!role&&Number.isInteger(cellId)){
  const merged=mergeClientSession(clearManualPlayerPosition(slots,cellId),client.session,data.champions,clientSyncOptions());slots=merged.slots;unassigned=merged.unassigned;
 }
 if(role)slots=movePartyMark(slots,role,previousRole);
 if(role&&Number.isInteger(cellId))saved.draft={...saved.draft,playerPosition:{role,cellId}};else if(saved.draft)delete saved.draft.playerPosition;
 soloRole=role||assignedPlayerRole()||'';companionPreview=null;pendingIntentPreparation=null;unassigned=unassignedPublicPicks(slots,client.session,data.champions);invalidate();
}
function changeConfigurationRole(el){
 const inBuild=overlay.contains(el)&&!!buildView,plan=inBuild?{selection:buildSelection(),build:buildView.build}:companionPreparation();
 if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('英雄已变化，请重新选择分路');
 assertConfigurationEditable(plan.selection);
 if(clientPreparing||runeApplying||itemSetPending)throw Error('正在应用配置，请稍候');
 if(!ROLES.some(role=>role.id===el.value))throw Error('请确认配置分路');
 if(el.value===plan.selection.role)return;
 // Browse the new lane as a complete setup. The dropdown must not move
 // roster members, resize our group or apply any client configuration.
 const {id,mode}=plan.selection,role=el.value,combo=mode==='rift'?currentCombo(slots,id,role,data.catalogInfo?.status,null,activeCreativePlan):null;
 const selection=heroClickSelection(data,{id,role,mode,...creativeComboContext(combo)});
 if(inBuild)showBuild(id,role,mode,{...selection,quickConfiguration:true});
 else{companionPreview=selection;companionTab='plan';render();}
}
function preservePlayerPosition(){const manual=manualPlayerSlot(slots,client.session?.localPlayerCellId);if(manual)saved.draft={...saved.draft,playerPosition:{role:manual.role,cellId:manual.clientCellId}};}
async function loadCatalogCombo(combo,nextScope){
 if(client.connected&&client.phase==='ChampSelect'){await sync(false,{fresh:true});if(!client.connected||client.phase!=='ChampSelect'||!client.session)throw Error('无法确认本局选人，已保留阵容，请重新连接后载入组合');}
 const input=recommendationInput(),availability=localPickEligibility(client,slots,data.champions,{scope:nextScope,soloRole,playerPosition:saved.draft?.playerPosition}),publicCells=(client.connected&&client.phase==='ChampSelect'?client.session?.myTeam||[]:[]).map(p=>p.cellId).filter(Number.isInteger);
 const next=loadPersonalCombo(slots,combo,{publicBans:input.publicBans,enemy:input.enemy,eligibleByRole:availability.eligibleByRole,confirmedPick:availability.confirmedPick,publicPicks:input.publicPicks,publicCells});
 validateSlots(next,data.champions);preservePlayerPosition();slots=next;closeOverlay();scope=nextScope;invalidate();toast('已载入我们的部分，队友位置保持原样');
}
function editCompanionPlan(el,field,value){
 const plan=companionPreparation();
 if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('选人已变化，请核对当前方案');
 const selection=changeCompanionPlan(data,plan.selection,field,value);
 rememberFlashPreference(selection,field);
 rememberPreparation(selection);if(plan.intent)rememberIntentPreparation(selection);if(!plan.preview)syncPreparedGuide(selection);render();
}
function chooseMatchupConfiguration(el,kind){
 const drawer=overlay.contains(el),plan=drawer?{selection:buildSelection()}:companionPreparation();
 if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('英雄或位置已变化，请重新比较配置');
 assertConfigurationEditable(plan.selection);
 const selection=selectMatchupPreparation({data,selection:plan.selection,enemyIds:publicMatchupIds(),targetId:chosenMatchupOpponent(plan.selection)?.id,publicContext:matchupPreparationContext(),context:el.dataset.context,kind,id:el.dataset.id});
 if(drawer){for(const field of CONFIGURATION_FIELDS)delete buildView[field];Object.assign(buildView,selection);renderBuild();}
 else{rememberPreparation(selection);if(plan.intent)rememberIntentPreparation(selection);if(!plan.preview)syncPreparedGuide(selection);render();}
 toast(kind==='rune'?'已选择完整符文，点击替换后写入客户端':kind==='skill'?'已选择加点参考，请在游戏内手动升级':'已选择核心路线，原后期计划已清除');
}
function currentPreparationHTML(){
 const p=myPreparation();if(!p)return '';
 const {own,build}=p,applied=runeAppliedKeys.has(runeApplicationKey(own.id,build.role,build.runePage));
 return `<section class="current-pick current-preparation" aria-label="我的自动准备"><div>${portrait(champ(own.id),'sm')}<span>你已选择 <b>${e(champ(own.id).name)}</b> · ${roleName(build.role)}${own.positionKnown?'':'（参考位置，可调整）'}</span></div><p><b>推荐出装</b> ${e(build.items.slice(0,3).map(i=>i.name).join(' → '))}</p><p><b>推荐符文</b> ${e(build.selectedRune?.name||'此模式不使用峡谷符文')} · ${applied?'本次已应用':'方案已选好'}</p><div class="current-preparation-actions">${button('my-build','查看 / 调整方案','arrow','small')}${build.runePage?button('my-runes',applied?'重新应用推荐符文':'替换为推荐符文','check','primary small',`data-id="${own.id}"`):''}</div><small>${saved.preferences.guideAutoShow!==false?'进入游戏后自动打开本局指引':'自动呼出已关闭，可手动打开指引'}${own.positionKnown?'':'；匹配未提供分路，请确认本局位置'}</small></section>`;
}
function draftTargetLabel(){const targets=draftTargets(slots,scope,soloRole);return targets.length?(scope==='solo'?'推荐我的英雄':'推荐'+targets.map(roleName).join(' / ')):'分析这套阵容';}
function restrictionSummary(){const p=saved.preferences,labels=[];if(p.poolMode!=='off')labels.push((p.poolMode==='only'?'仅用':'优先')+'全局英雄池 '+p.pool.length+' 位');for(const r of ROLES){const pool=p.rolePools[r.id];if(pool.mode!=='off')labels.push(r.name+(pool.mode==='only'?'仅用':'优先')+' '+pool.heroes.length+' 位');}if(p.play.difficulty==='easy')labels.push('操作轻松');if(p.play.unusual===false)labels.push('仅常规位置');if(p.play.meleeBottom===false)labels.push('下路不推荐近战');if(clientBans.length)labels.push('公开禁选 '+clientBans.length+' 位');if(unassigned.length)labels.push('待安排已选 '+unassigned.length+' 位');if(client.session?.allowDuplicatePicks===false&&enemy.length)labels.push('不可镜像 '+enemy.length+' 位');if(saved.excluded.length)labels.push('排除 '+saved.excluded.length+' 位');return labels.join(' · ')||'全部英雄 · 允许娱乐搭配';}
function renderDraft(){
 const eligibility=localPickEligibility(client,slots,data.champions,{scope,soloRole,playerPosition:saved.draft?.playerPosition});
 const incoming=roomBallotView(room,publicDraftContext(),data.champions,{scope,soloRole:taskOwnRole(),clientSession:client.connected?client.session:null,party:currentParty(),includePreselected:saved.preferences.includePreselected===true})+roomSharesView(room,champ,{compact:true,clickPrepare:saved.preferences.clickPrepare!==false,heroAction:memberHeroAction,adoptedShare:lastAdoptedRoomShare,allowRiftAdoption:!client.connected||client.phase!=='ChampSelect'||client.mode?.id==='rift',allowUnknownRift:client.connected&&client.phase==='ChampSelect'&&client.mode?.id==='rift'});
 const notice=creativePlanNotice?`<p class="callout warning" data-creative-plan-notice role="status">${e(creativePlanNotice)}</p>`:'';
 const plan=ownTaskPreparation(),ready=!!activeCreativePlan||!activeRoleClaim(positionClaim,client)&&(!!myPreparation()||!!currentPickIntent()||!!lastTaskSelection&&!!plan);
 if(ready&&!draftComparing){
  const selected=(client.session?.actions||[]).flat().some(a=>a.type==='pick'&&a.actorCellId===client.session?.localPlayerCellId&&a.completed===true),ownRole=taskOwnRole();
  const claim=ownRole?'':`<section class="claim-own-role"><b>你玩哪位？</b>${(activeCreativePlan?.members||slots.filter(s=>s.champion).map(s=>({role:s.role,champion:s.champion}))).map(m=>button('solo-role',e(champ(m.champion)?.name)+' · '+roleName(m.role),'','small',`data-role="${m.role}"`)).join('')}</section>`;
  return '<div class="draft-task-workspace" data-eligibility="'+e(eligibility.status)+'">'+notice+incoming+pregameControls({scope,style,busy:clientPreparing||runeApplying||!!itemSetPending,includePreselected:saved.preferences.includePreselected===true,ownRole,slots,room,party:currentParty(),preselection:saved.draft?.preselection,preselectionHero:saved.draft?.preselection?.champion?portrait(champ(saved.draft.preselection.champion),'sm'):''})+adoptedTaskView({data,plan,activePlan:activeCreativePlan,controls:claim,ownRole,selected,roster:'<div class="task-roster slots">'+slots.map(s=>slotHTML(s)).join('')+'</div>',details:results.length?button('result-detail','完整玩法','','quiet small','data-index="0"'):''})+'</div>';
 }
 const availableResults=results.map((result,index)=>({result,index})),noRange=['party','context'].includes(scope)&&!slots.some(slot=>slot.party);
 const live=clientDraftStatus(client,slots,data.champions);
 return `<section class="draft-compare-workspace" data-eligibility="${e(eligibility.status)}"><header class="draft-compare-header"><div><h1>开黑推荐</h1></div><div>${activeCreativePlan&&!(client.connected&&client.phase==='ChampSelect')?button('task-return','返回方案','','quiet small'):''}${ready?button('task-configuration','我的配置','','small'):''}</div></header>
 <div class="task-roster slots">${slots.map(s=>slotHTML(s)).join('')}</div>
 ${pregameControls({scope,style,busy:clientPreparing||runeApplying||!!itemSetPending,includePreselected:saved.preferences.includePreselected===true,ownRole:taskOwnRole(),slots,room,party:currentParty(),preselection:saved.draft?.preselection,preselectionHero:saved.draft?.preselection?.champion?portrait(champ(saved.draft.preselection.champion),'sm'):''})}
 ${eligibility.status==='checked'||eligibility.status==='manual'?'':pickEligibilityView(eligibility)}${recommendationError?`<section class="callout warning recommendation-error"><p>${e(recommendationError)}</p>${button('role-pools','调整位置英雄池','','small')}${button('exclusions','调整排除英雄','','small')}</section>`:''}

 <div class="task-candidate-list" aria-busy="${!!generating}">${incoming}<div class="draft-list-heading recommend-heading"><div class="draft-result-actions"><h2>${scope==='solo'?'推荐英雄':'推荐阵容'}</h2>${button(results.length?'reroll':'recommend',generating?'正在搭配…':results.length?'换一批':scope==='solo'?'推荐英雄':'推荐阵容','refresh',results.length?'small recommendation-refresh':'primary small',generating||noRange?'disabled':'')}${button('task-rankings','本路排行','','quiet small')}</div></div>${availableResults.length?availableResults.slice(0,showAllCandidates?6:3).map(({result,index})=>resultCard(result,index)).join('')+(availableResults.length>3?button('more-candidates',showAllCandidates?'收起备选':'更多候选','','quiet small'):''):results.length?'':generating?recommendationLoading(scope==='solo'?1:slots.filter(s=>s.party).length):'<div class="empty-state draft-empty">'+(noRange?'勾选要参与推荐的位置':scope==='solo'&&!taskOwnRole()?'选择本人位置，自动推荐英雄。':'按当前队伍推荐，可调整上方位置与风格。')+'</div>'}</div><footer class="draft-compare-status">${e(client.connected?phaseLabel(client.phase)+' · '+(client.mode?.label||'模式待确认'):'手动搭配 · 连接客户端后可预选配置')}<span data-client-countdown>${live.remaining!==null?' · 约剩 '+live.remaining+' 秒':''}</span>${creativePlanNotice?`<span data-creative-plan-notice role="status"> · ${e(creativePlanNotice)}</span>`:''}</footer></section>`;
}
function slotHTML(s){
 const c=champ(s.champion),mine=scope==='solo'?s.role===soloRole:s.party,pick=client.session?.myTeam?.find(p=>p.cellId===s.clientCellId);
 const selected=!!c&&selectedInClient(s),local=Number.isInteger(s.clientCellId)&&s.clientCellId===client.session?.localPlayerCellId;
 const publicPlayer=c&&(client.session?.myTeam||[]).find(player=>Number(player.championId)===Number(c.key)),confirmedLock=publicPlayer&&(publicPlayer.pickState==='locked'||(client.session.actions||[]).flat().some(action=>action.type==='pick'&&action.actorCellId===publicPlayer.cellId&&action.completed===true));
 return `<article data-drop-role="${s.role}" data-local="${local}" class="slot ${mine?'party':''}">
 <div class="slot-heading"><div class="slot-role">${local?'<em class="slot-self">你</em>':''}</div><button class="slot-toggle ${mine?'on':''}" data-action="${scope==='solo'?'solo-role':'toggle-party'}" data-role="${s.role}" aria-pressed="${!!mine}" title="${scope==='solo'?'选择我的位置':'切换是否参与我们的推荐'}"><span class="scope-check" aria-hidden="true"></span></button></div>
 <div class="champ-pick roster-display" draggable="${!!c}" data-drag-role="${s.role}" ${c?`data-id="${c.id}"`:""} data-role="${s.role}" role="img" aria-label="${roleName(s.role)} · ${c?e(c.name):"尚未选定英雄"}${confirmedLock?" · 已锁定":""}"><span class="roster-portrait">${rosterPortrait(c)}${roleIcon(s.role,"roster-role-mark")}${confirmedLock?`<span class="roster-lock" title="英雄已锁定，可换位" aria-label="英雄已锁定">${icon("lock")}</span>`:""}</span><span class="champ-name">${c?e(c.name):"尚未选定"}</span></div>
 ${c?`<div class="slot-bottom"><span class="slot-meta">${selected?pick?.pickState==='locked'?'已锁定':'已预选':''}</span><button class="slot-move" data-action="move-slot" data-role="${s.role}" aria-label="移动${e(c.name)}的位置" title="也可拖动头像交换位置">换位</button>${!selected?`<button class="slot-clear" data-action="clear-slot" data-role="${s.role}" aria-label="清空${roleName(s.role)}">×</button>`:''}<button class="slot-lock ${s.locked?'on':''}" data-action="toggle-lock" data-role="${s.role}" aria-pressed="${!!s.locked}" ${selected?'disabled title="客户端已选英雄保留，可调整位置"':''} aria-label="${s.locked?'允许推荐替换':'推荐时保留'}${roleName(s.role)}">${icon(s.locked?'pin':'refresh')}</button></div>`:''}</article>`;
}
function resultCard(r,i=0){return renderResultCard(r,i,data,saved,style,room,publicDraftContext(),client.connected?client.session:null,room?.ballots?proposalKey(roomResultProposal(r)):'',taskOwnRole(),currentParty());}
function renderLibrary(){return `${heading('','符文与出装','选择英雄和本局位置，快速查看配套配置。','sword')}<div class="library-toolbar"><div class="search-wrap">${icon('search')}<input id="library-search" placeholder="搜英雄、称号、昵称或拼音，例如：女枪 / mf" value="${e(libraryQuery)}" aria-label="搜索英雄配置" /></div><span class="badge">${data.champions.length} 位英雄</span></div><div class="chips library-rolebar">${[['all','全部位置'],...ROLES.map(r=>[r.id,r.name])].map(([id,n])=>`<button class="chip ${libraryRole===id?'active':''}" data-action="library-role" data-role="${id}">${n}</button>`).join('')}</div><div class="library-grid" id="library-grid">${libraryTiles()}</div><details class="ui-help"><summary>配置来源</summary><p>优先展示所选来源的当前版本配置；没有位置样本时使用机制基础方案。</p></details>`;}
function libraryTiles(){const evidence=buildRoleEvidence(data),supported=new Set(evidence.filter(r=>r.role===libraryRole).map(r=>r.champion));return data.champions.filter(c=>matchesSearch(c,libraryQuery)&&(libraryRole==='all'||profile(c,libraryRole).roles.includes(libraryRole)||supported.has(c.id))).map(c=>`<button class="hero-tile" data-action="build" title="${e(c.name)} · ${e(c.title)}" data-id="${c.id}" data-role="${libraryRole==='all'?profile(c).roles[0]:libraryRole}">${portrait(c)}<b>${e(c.name)}</b><small>${e(c.title)}${libraryRole!=='all'&&!profile(c,libraryRole).roles.includes(libraryRole)?' · 来源有此位置参考':''}</small></button>`).join('')||'<div class="empty-state">没有找到英雄，试试其他称呼。</div>';}
function renderHex(){return `${heading('','海克斯手册','查强化、找思路，把想玩的组合收藏起来。','hex')}<div class="hex-layout"><aside class="panel hex-side"><div class="panel-head"><h3>英雄与备选</h3></div><div class="panel-body"><button class="btn" style="width:100%" data-action="pick-hex">${hexHero?portrait(champ(hexHero),'sm'):icon('team')}${hexHero?e(champ(hexHero)?.name):'选择一个英雄'}</button>${hexHero?button('build','查看海克斯出装','sword','small',`data-id="${hexHero}" data-role="${profile(champ(hexHero)).roles[0]}" data-mode="hex"`):''}<div class="detail-section" style="margin-top:16px"><h3>我的强化备选 <span class="badge">${hexSelected.length}</span></h3><div class="chips">${hexSelected.map(id=>`<button class="chip active" data-action="toggle-augment" data-id="${id}">${e(data.augments.find(a=>a.id===id)?.name)} ×</button>`).join('')}</div></div>${button('save-hex',saved.favorites.some(f=>f.id===hexFavoriteId())?'已收藏 · 点击取消':'收藏这套灵感','star','primary small',hexSelected.length?'':'disabled')}</div></aside><section><div class="library-toolbar"><div class="search-wrap">${icon('search')}<input id="hex-search" value="${e(hexQuery)}" placeholder="搜索强化名称或效果" aria-label="搜索海克斯强化" /></div><select class="select" id="hex-category" aria-label="强化效果分类"><option value="all">全部效果</option>${AUGMENT_CATEGORIES.map(([id,name])=>`<option value="${id}" ${hexCategory===id?'selected':''}>${name}</option>`).join('')}</select><select class="select" id="hex-rarity" aria-label="强化稀有度"><option value="all">全部稀有度</option>${Object.entries(rarityName).map(([id,n])=>`<option value="${id}" ${hexRarity===id?'selected':''}>${n}</option>`).join('')}</select></div>${renderHexComparison({data,hero:hexHero,options:hexOptions,owned:hexOwned})}${hexHero?renderHexReference():''}<div class="toolbar"><span class="muted" style="font-size:11px">${data.augments.length} 项强化 · 资料 ${e(data.augmentVersion||data.version)}</span><button class="chip ${hexSelectedOnly?'active':''}" data-action="hex-selected">只看已选</button></div><div class="augment-grid" id="augment-grid">${augmentTiles()}</div></section></div>`;}

function renderHexReference(){return renderHexSourceReference({data,hero:hexHero,filtered:hexForHero});}

function augmentTiles(){const heroIds=data.hexBuilds?.[hexHero]?.augmentIds||[];return data.augments.filter(a=>(hexCategory==='all'||augmentCategories(a).includes(hexCategory))&&(!hexForHero||heroIds.includes(a.id))&&(!hexSelectedOnly||hexSelected.includes(a.id))&&(hexRarity==='all'||a.rarity===hexRarity)&&`${a.name} ${a.description}`.toLowerCase().includes(hexQuery.toLowerCase())).map(a=>`<button class="augment-card ${hexSelected.includes(a.id)?'selected':''}" data-action="augment-detail" data-id="${a.id}"><div class="augment-title">${asset('augment',a.id,a.name)}<div><b>${e(a.name)}</b><div class="rarity-${a.rarity}" style="font-size:10px">${rarityName[a.rarity]||'特殊'}</div></div></div><p>${e(a.description?a.description.slice(0,96)+(a.description.length>96?'…':''):'已收录当前模式清单，具体效果待补充。以客户端说明为准。')}</p><div class="augment-footer"><span>${hexSelected.includes(a.id)?'✓ 已加入备选':'查看详情'}</span>${icon('chevron')}</div></button>`).join('')||'<div class="empty-state">没有匹配的强化，试试其他筛选条件。</div>';}
function renderFavorites(){return `${heading('','我的收藏','只收藏你喜欢的搭配，不记录战绩。','star')}${saved.favorites.length?`<div class="favorite-list">${saved.favorites.map((f,i)=>`<article class="favorite-card"><div style="display:flex;justify-content:space-between"><span class="badge ${f.type==='hex'?'purple':'green'}">${f.type==='hex'?'海克斯灵感':f.type==='build'?'英雄配置':'开黑组合'}</span><button class="favorite-button" data-action="delete-favorite" data-index="${i}" aria-label="删除收藏${e(f.title)}">${icon('trash')}</button></div><h3>${e(f.title)}</h3><div style="display:flex;gap:8px;margin-top:12px">${(f.type==='team'?f.slots?.filter(s=>s.party).map(s=>s.champion):[f.champion]).filter(Boolean).slice(0,5).map(id=>portrait(champ(id),'sm')).join('')}</div>${favoriteBuildSummary(data,f)}${favoriteTeamSummary(data,f,i)}<p>${f.type==='hex'?e((f.augments||[]).map(id=>data.augments.find(a=>a.id===id)?.name||'旧版强化').join(' · ')):`收藏于 ${dateLabel(f.createdAt)}`}<br>保存版本 ${e(f.version||'未知')}${f.version&&f.version!==data.version?' · 当前版本已变化':''}</p>${button('open-favorite',f.type==='team'?'载入开黑成员与配置':'查看收藏','arrow','small',`data-index="${i}"`)}${f.type==='team'?button('update-team-favorite','用最近选择更新配置','refresh','quiet small',`data-index="${i}"`):''}</article>`).join('')}</div>`:`<section class="panel"><div class="empty-state">${icon('star')}<h3>留住想玩的点子</h3><p>在推荐方案、英雄配置或海克斯手册中点击收藏，下次打开就能找到。</p>${button('go-draft','去看看开黑组合','arrow','primary')}</div></section>`}`;}
function renderSettings(){
 const toggle=(action,label,on)=>`<div class="setting-row"><b>${label}</b><button class="switch ${on?'on':''}" data-action="${action}" role="switch" aria-checked="${on}" aria-label="${label}"><i></i></button></div>`;
 return `${heading('','设置','','settings')}<div class="settings-grid">
 <section class="panel"><div class="panel-head"><h3>窗口与显示</h3></div><div class="panel-body"><div class="settings-actions">${button('player-flow-settings','选人与侧栏','settings','small')}${button('theme-open','配色','','small')}${button('presentation-open','字号与局内指引','settings','small')}${button('recover-guide','找回指引','book','quiet small')}</div>${toggle('client-companion','选人时显示侧栏',saved.preferences.clientCompanion!==false)}${toggle('guide-auto-show','进入对局时显示指引',saved.preferences.guideAutoShow!==false)}<div class="setting-row"><b>对局结束后</b><select class="select" id="guide-after-game" aria-label="游戏结束后的指引">${[['hide','隐藏指引'],['collapse','收起小窗'],['keep','保持显示']].map(([id,n])=>`<option value="${id}" ${(saved.preferences.guideAfterGame||'hide')===id?'selected':''}>${n}</option>`).join('')}</select></div><details class="ui-help"><summary>窗口与快捷键说明</summary><p>助手 Ctrl + Shift + Space；指引 Ctrl + Shift + G。窗口可移动、缩放，并在窗口设置恢复默认。</p><p>游戏建议使用无边框或窗口模式。独占全屏可能遮住指引。</p>${button('window-info','窗口检查','','small')}</details></div></section>
 <section class="panel"><div class="panel-head"><h3>游戏启动与连接</h3><span class="badge ${client.connected?'green':''}">${client.connected?'已连接':'未连接'}</span></div><div class="panel-body">${!client.connected?`<p class="callout warning">${e(client.message)}</p>`:''}<div class="setting-row"><div><b>启动程序</b><p>${e(saved.preferences.launchPath||'自动：优先 WeGame 英雄联盟')}</p></div>${button('choose-launch-path','选择程序','','small')}${button('reset-launch-path','恢复默认','','small')}</div><div class="settings-actions">${button('launch-game','打开英雄联盟','arrow','primary')}</div><div class="setting-row"><div><b>游戏目录</b><p style="word-break:break-all">${e(saved.preferences.installPath||'自动检测')}</p></div>${button('choose-dir','更改','','small')}</div><div class="settings-actions">${button('sync',syncing?'连接中…':'重新连接','refresh','small',syncing?'disabled':'')}</div>${toggle('auto-sync','自动同步选人',saved.preferences.autoSync!==false)}${toggle('auto-live','读取局内装备',saved.preferences.autoLive!==false)}<details class="ui-help"><summary>连接与权限说明</summary><p>读取公开选人和本机局内数据是自动的，不需要先授权。</p><p>仅当英雄联盟客户端以管理员身份运行时，Windows 会要求一次权限确认；确认后助手会自动继续读取。连接失败时仍可手动搭配和查资料。</p></details></div></section>
 ${appUpdatePanel({version:boot?.version,preferences:saved.preferences,update:appUpdate})}
 <section class="panel"><div class="panel-head"><h3>游戏资料</h3><span class="badge">${e(data.version)}</span></div><div class="panel-body">${toggle('auto-check','自动更新排行榜与配置',!!saved.preferences.autoCheck)}<div class="setting-row"><span role="status">${e(data.dataFeed?.message||'使用本地统计资料')}</span>${button('refresh-statistics',data.dataFeed?.phase==='checking'?'检查中…':'检查统计','refresh','small',data.dataFeed?.phase==='checking'?'disabled':'')}</div><div class="setting-row"><span>基础资料 · ${dateLabel(data.fetchedAt)}</span>${button('update',updating?'更新中…':'检查基础资料','refresh','small',updating?'disabled':'')}</div>${updateMessage?`<p id="update-message" role="status">${e(updateMessage)}</p>`:'<span id="update-message" role="status"></span>'}<details class="ui-help"><summary>版本与离线说明</summary><p>排行榜、常用配置和海克斯参考由资料服务器每天采集两次。助手后台检查，选人和对局期间暂存，回到大厅后启用；失败继续使用本地资料。资料按补丁匹配，来源的地域、段位和统计时间保留。</p><p>国服版本以客户端为准。基础资料可单独检查；人工搭配规则随软件更新。</p></details></div></section>
 <details class="settings-details"><summary>组合库管理</summary>${catalogPanel(data)}</details>
 <details class="settings-details"><summary>数据来源与版本</summary><div class="panel-body">${[['Riot Data Dragon','英雄、装备、符文、召唤师技能','https://developer.riotgames.com/docs/lol'],['腾讯英雄联盟','国服名称与搜索别名','https://lol.qq.com/data/info-heros.shtml'],['CommunityDragon','英雄数值与游戏资源','https://www.communitydragon.org'],['OP.GG',buildSourceLabel(data.buildSource),'https://op.gg/lol/champions']].map(([n,desc,url])=>`<div class="source-row"><span><b>${n}</b> · ${e(desc)}</span>${button('link','查看','','quiet small',`data-url="${url}"`)}</div>`).join('')}<p class="bottom-note">机制规则 ${RULES_PATCH}，不预测胜率。${data.patch!==RULES_PATCH?'基础资料已更新，规则仍需复核。':''}${data.augmentError?e(data.augmentError):''}</p></div></details>
 <details class="settings-details"><summary>备份与关于</summary><div class="panel-body"><div class="settings-actions">${button('import','导入备份','upload','small')}${button('export','导出备份','download','small')}</div><p class="bottom-note">备份收藏、英雄池和偏好；导入时合并收藏与排除列表。</p><p class="bottom-note">${e(boot.dataPath||'当前浏览器')}<br>游戏资源归 Riot Games 所有。开黑搭子是独立工具，未获 Riot Games 或腾讯认可或赞助。</p></div></details></div>`;
}
function openPicker(kind,role=null){picker={kind,role,query:'',filter:kind==='preselection'&&role?role:'all'};buildView=null;detailResult=null;renderPicker();requestAnimationFrame(()=>document.getElementById('picker-search')?.focus());}
function renderPicker(){
 if(picker.kind==='preselection'){overlay.innerHTML=preselectionPicker({query:picker.query,filter:picker.filter,current:champ(saved.draft?.preselection?.champion),canCancel:pregamePhase(client.phase)&&!!saved.draft?.preselection?.champion,tiles:pickerTiles(),hint:pregamePhase(client.phase)?'进入选人后自动配好':'点击英雄，预选并配好'});return;}
 const help=picker.kind==='pool'?'点击标记你们愿意玩的英雄；推荐范围可设为优先或仅使用这些英雄。':picker.kind==='excluded'?'点击切换排除状态；推荐时会跳过这些英雄。':'';
 const actionHint=picker.kind==='preselection'&&pregamePhase(client.phase)?'进入选人后自动预选并应用配置，锁定由你确认。':client.connected&&client.phase==='ChampSelect'&&client.mode?.id==='rift'?(saved.preferences.clickPrepare===false?'点击查看英雄配置。':'点击英雄即可预选并应用配置；锁定由你确认。'):picker.kind==='preselection'?'点击查看英雄配置。':'选中后加入本地阵容，可随时调整。';
 overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal" role="dialog" aria-modal="true" aria-label="选择英雄"><header class="modal-header"><div><h2>${picker.kind==='preselection'?'预选英雄':picker.kind==='rolepool'?roleName(picker.role)+'英雄池':picker.kind==='pool'?'我们的英雄池':picker.kind==='excluded'?'不想玩的英雄':picker.kind==='hex'?'选择海克斯英雄':`选择${roleName(picker.role)}英雄`}</h2>${help?`<p>${help}</p>`:''}</div>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="modal-controls"><div class="search-wrap">${icon('search')}<input id="picker-search" aria-label="搜索英雄" value="${e(picker.query)}" placeholder="搜英雄，例如：亚索 / 女枪 / jh" /></div><div class="chips">${[['all','全部'],...ROLES.map(r=>[r.id,r.name])].map(([id,n])=>`<button class="chip ${picker.filter===id?'active':''}" data-action="picker-role" data-role="${id}">${n}</button>`).join('')}</div></div><div class="champ-grid" id="picker-grid">${pickerTiles()}</div><footer class="modal-footer">${picker.kind==='rolepool'?`${roleName(picker.role)}已有 ${saved.preferences.rolePools[picker.role].heroes.length} 位英雄`:picker.kind==='pool'?`英雄池已有 ${saved.preferences.pool.length} 位英雄`:picker.kind==='excluded'?`已排除 ${saved.excluded.length} 位英雄`:picker.kind==='hex'?'点击查看英雄的海克斯参考。':actionHint}</footer></section></div>`;
}
function pickerTiles(){
 const match=pickerMatches(data.champions,picker.query,picker.filter,matchesSearch,profile);
 if(picker.kind==='preselection'&&picker.filter!=='all'&&!picker.query.trim()){const common=roleRepresentatives(picker.filter,data.champions,data);const rank=id=>{const index=common.indexOf(id);return index<0?common.length:index;};match.champions=[...match.champions].sort((a,b)=>rank(a.id)-rank(b.id));}
 return (match.fallback?'<p class="picker-fallback">当前分路没有匹配，显示全部搜索结果</p>':'')+match.champions.map(c=>{
  const selected=picker.kind==='preselection'?saved.draft?.preselection?.champion===c.id:picker.kind==='excluded'?saved.excluded.includes(c.id):picker.kind==='pool'?saved.preferences.pool.includes(c.id):picker.kind==='rolepool'?saved.preferences.rolePools[picker.role].heroes.includes(c.id):false;
  return `<button type="button" class="champ-option ${selected?'selected':''}" data-action="pick-champion" data-id="${c.id}" aria-label="${e(c.name)}" aria-pressed="${selected}" title="${e(c.name)} · ${e(c.title)}">${portrait(c)}<span>${e(c.name)}</span></button>`;
 }).join('')||'<p class="muted">没有找到匹配英雄。</p>';
}
function closeOverlay(){if(overlay.querySelector('[aria-label="玩家搜索结果"]'))history.cancelSearch();roomConfigurationView=null;activeOverlaySelect=null;pendingBuildRender=false;renderedBuildContext=null;currentWindowInfo=null;catalogRequest++;comboView=null;picker=null;buildView=null;detailResult=null;buildReturn=null;overlay.innerHTML='';}
async function showWindowInfo(refresh=false){
 if(!refresh){closeOverlay();overlay.innerHTML=windowInfoDialog(null);}
 const restore=preserveOverlay(overlay),request=++catalogRequest;
 try{const info=await api.windowInfo();if(request!==catalogRequest||!overlay.querySelector('[data-window-info]'))return;currentWindowInfo=info;overlay.innerHTML=windowInfoDialog(info);restore();}
 catch(error){if(request!==catalogRequest||!overlay.querySelector('[data-window-info]'))return;overlay.innerHTML=windowInfoDialog(currentWindowInfo,String(error.message||'窗口资料暂不可用').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,''));restore();}
}
function bindPlayerBuildPreferences(){
 Object.defineProperty(data,'flashSlot',{configurable:true,get:()=>saved.preferences.flashSlot});
 Object.defineProperty(data,'clientFlashSlot',{configurable:true,get:()=>{
  const own=client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId),flash=Number(data.spells.SummonerFlash.key);
  return own?.spell1Id===flash?'d':own?.spell2Id===flash?'f':undefined;
 }});
}
function rememberFlashPreference(selection,field){
 if(selection.readOnly||!['summoner-d','summoner-f','summoner-swap'].includes(field))return;
 const index=selection.summonerIds?.indexOf('SummonerFlash');
 if(index===0||index===1){saved.preferences.flashSlot=index===0?'d':'f';persist();}
}
function rememberedPreparation(context,options){return recallPreparation(preparations,guideSelection,context,options);}
function showBuild(id,role,mode='rift',selection={}){if(!champ(id))throw Error('当前资料没有这位英雄');const duo=mode==='rift'?currentCombo(slots,id,role,data.catalogInfo?.status,null,activeCreativePlan):null;const context={id,role,mode,...creativeComboContext(duo),...selection};if(selection.readOnly===undefined&&buildView?.readOnly)context.readOnly=true;if(detailResult)buildReturn={index:results.indexOf(detailResult),id:detailResult.id,signature:resultDraftSignature,scroll:overlay.querySelector('.drawer-content')?.scrollTop||0};picker=null;comboView=null;detailResult=null;buildView={variant:'default',conditions:[],coreIndex:0,...rememberedPreparation(context,{allowSavedCombo:slots.every(s=>!s.champion)&&!client.session?.myTeam?.some(p=>p.championId)}),...context};renderBuild();maybeRefreshBuild(id,role,mode);}
function editBuildSummoners(el,field,value){
 if(!buildView||el.dataset.plan!==[buildView.id,buildView.role,buildView.mode].join(':'))throw Error('英雄或位置已变化，请重新确认召唤师技能');
 const next=changeCompanionPlan(data,buildSelection(),field,value);delete buildView.summonerIds;
 rememberFlashPreference({...next,readOnly:buildView.readOnly},field);
 if(next.summonerIds)buildView.summonerIds=[...next.summonerIds];renderBuild();
}
function buildSelection(){return {readOnly:configurationReadOnly(buildView,client,taskOwnRole()),id:buildView.id,role:buildView.role,mode:buildView.mode,coreIndex:buildView.coreIndex,conditions:[...buildView.conditions],...selectedBuildFields(buildView,{preserveUnavailable:true}),...(buildView.mode==='hex'?{augmentIds:buildView.augmentIds||[],compareIds:buildView.compareIds||[],ownedAugmentIds:buildView.ownedAugmentIds||[]}:{})};}
function buildSelectionContext(build){const own=currentPlayerSelection(client.session,data.champions,slots);return JSON.stringify([buildChoiceKey(buildSelection()),buildView.augmentIds||[],buildView.compareIds||[],buildView.ownedAugmentIds||[],data.patch,data.buildSource,build?.reference?.fetchedAt,client.connected,client.phase,client.game?.gameId,client.mode?.id,own?.id,own?.formalRole,own?.role,runeAppliedKeys.has(runeApplicationKey(build?.champion,build?.role,build?.runePage))]);}
function acceptGuideSelection(selection){if(!selection)return;rememberPreparation(selection);guideSyncBase=selection;lastGuideSyncKey=buildChoiceKey(selection);if(buildView&&selection.id===buildView.id&&selection.role===buildView.role&&selection.mode===buildView.mode){for(const field of [...CONFIGURATION_FIELDS,'compareIds','ownedAugmentIds'])delete buildView[field];Object.assign(buildView,selection);renderBuild();}if(windowLayout.docked)render();}
function receiveGuideSelection(selection,revision=0){
 if(revision&&revision<=guideRevision)return;
 guideRevision=revision||guideRevision;guideSelection=selection;
 if(!guideSyncPending)acceptGuideSelection(selection);
}
function syncPreparedGuide(selection){
 if(restoringSave||!api.updateGuide||!guideSelection||guideSelection.id!==selection.id||guideSelection.role!==selection.role||guideSelection.mode!==selection.mode)return;
 const key=buildChoiceKey(selection);if(key===lastGuideSyncKey)return;
 const changedFields=configurationPatch(guideSyncBase||guideSelection,selection);guideSyncBase=selection;lastGuideSyncKey=key;if(!changedFields.length)return;
 const revision=guideRevision;guideSyncPending++;guideSyncChain=guideSyncChain.catch(()=>{}).then(async()=>{
  await saveChain;const prepared=preparations.recall(selection);
  if(!prepared||!guideSelection||['id','role','mode'].some(field=>guideSelection[field]!==prepared[field]))return;
  // Only send this window's actual edits. A later guide update may have
  // changed a different field while this request was waiting to be sent.
  const acceptedFields=changedFields.filter(field=>JSON.stringify(guideSelection[field])!==JSON.stringify(prepared[field]));
  if(!acceptedFields.length)return;
  const response=await api.updateGuide({...prepared,changedFields:acceptedFields});
  // The invoke response can arrive before its guide-selection notification.
  // Use the accepted result so finally cannot save the preceding default.
  if(response?.updated&&response.selection)receiveGuideSelection(response.selection,response.revision);
 }).catch(error=>{if(lastGuideSyncKey===key)lastGuideSyncKey='';toast('指引尚未同步：'+error.message,true);}).finally(()=>{guideSyncPending--;if(!guideSyncPending&&guideRevision>revision)acceptGuideSelection(guideSelection);});
}
async function openPreparedGuide(selection){
 const revision=guideRevision,response=await api.openGuide(selection);
 if(response&&typeof response==='object'&&'selection' in response)receiveGuideSelection(response.selection,response.revision);
 // Browser preview has no versioned IPC. A late unversioned response must
 // still leave a newer notification's accepted configuration intact.
 else if(selection&&guideRevision===revision)guideSelection=selection;
 return response;
}
function runeTargetNotice(c){const own=currentPlayerSelection(client.session,data.champions,slots),applied=runeAppliedKeys.has(runeApplicationKey(c.id,buildView.role,buildView.build.runePage));return `${own&&own.id!==c.id?`<div class="callout warning rune-target-warning">你已选择 ${e(champ(own.id)?.name)}，正在查看 ${e(c.name)}。下面的操作会将 ${e(c.name)} 的符文应用到你自己的客户端。</div>`:''}<p class="rune-application-status">${applied?'本次已应用这套符文，客户端修改后需重新应用':'当前选择尚未在本次选人中应用'} · 应用前核对英雄与位置</p>`;}
const buildKey=(id,role,mode,source=data.buildSource)=>buildSourcePendingKey(data.patch,id,mode==='hex'?'hex':role,source);
function maybeRefreshBuild(id,role,mode){
 if(mode!=='hex'||!boot.desktop||!saved.preferences.autoCheck)return;
 const ref=mode==='hex'?data.hexBuilds?.[id]:data.builds?.[id+':'+role],key=buildKey(id,role,mode);
 if(isFreshBuildReference(ref,data.patch,mode))return;
 if(Date.now()-(refreshAttempts.get(key)||0)<3600000)return;
 refreshConfiguration(id,role,mode,true).catch(()=>{});
}
async function refreshConfiguration(id,role,mode,silent=false){
 const source=normalizeBuildSource(data.buildSource),key=buildKey(id,role,mode,source),patch=data.patch,context=selectionRequestContext();buildErrors.delete(key);
 if(refreshingBuilds.has(key))return refreshingBuilds.get(key);
 refreshAttempts.set(key,Date.now());
 const task=(async()=>{
  try{
   const ref=await api.refreshBuild(id,mode==='hex'?'hex':role,source);
   if(data.patch!==patch)throw Error('资料版本刚刚更新，请重新获取这套配置');
   if(mode==='hex')data.hexBuilds={...data.hexBuilds,[id]:ref};else{
    if(!sameBuildSource(ref,source))throw Error('来源筛选不一致，已保留本地参考');
    const previousRecommendation=recommendationKey(recommendationInput());
    data.buildSources={...(data.buildSources||{}),[buildSourceKey(id,role,ref,ref.patch)]:ref};selectBuildSource(data,saved.preferences.buildSource);
    if(context===selectionRequestContext()&&previousRecommendation!==recommendationKey(recommendationInput()))invalidate();
   }
   if(!silent&&context===selectionRequestContext())toast(mode==='hex'?(ref.patch===data.patch?'已刷新本版本配置':`继续使用 OP.GG ${ref.patch} 旧版本参考；当前资料 ${data.patch}`):`已缓存${buildSourceLabel(ref)} · ${ref.patch}${ref.patch!==data.patch?' 旧版本参考':''}`);return ref;
  }catch(error){if(context===selectionRequestContext()){const message=String(error.message||'版本配置刷新未完成').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');buildErrors.set(key,message);if(!silent)toast(message,true);}return null;}
  finally{
   refreshingBuilds.delete(key);
   if(buildView&&buildKey(buildView.id,buildView.role,buildView.mode)===key)renderBuild();
   if(windowLayout.docked&&(activeAppSelect||!document.activeElement?.matches('input,select')))render();
   else if(route==='hex'&&hexHero===id&&mode==='hex'&&!document.activeElement?.matches('input,select'))render();
  }
 })();
 refreshingBuilds.set(key,task);
 if(windowLayout.docked)queueMicrotask(()=>{if(windowLayout.docked)render();});
 if(buildView&&buildKey(buildView.id,buildView.role,buildView.mode)===key)renderBuild();
 return task;
}
const savedBuild=v=>findSavedBuild(saved.favorites,v);
const hexFavoriteId=()=>`hex:${hexHero||'any'}:${[...hexSelected].sort().join('-')}`;
function renderBuild(){
 if(!buildView)return;
 buildView.readOnly=configurationReadOnly(buildView,client,taskOwnRole());
 const c=champ(buildView.id),b=getBuild(c,buildView.role,data,buildView);
 if(activeOverlaySelect?.isConnected&&overlay.contains(activeOverlaySelect)&&renderedBuildContext===buildSelectionContext(b)&&currentMatchupSelect(activeOverlaySelect)){pendingBuildRender=true;return;}
 activeOverlaySelect=null;pendingBuildRender=false;
 const restoreOverlay=preserveOverlay(overlay),refreshing=refreshingBuilds.has(buildKey(buildView.id,buildView.role,buildView.mode));
 buildView.build=b;if(!buildView.coreId||buildView.coreId===b.selectedCoreId){buildView.coreIndex=b.selectedCoreIndex;buildView.coreId=b.selectedCoreId||undefined;}renderedBuildContext=buildSelectionContext(b);if(!buildView.readOnly){rememberPreparation(buildSelection());syncPreparedGuide(buildSelection());}const buildSaved=savedBuild(buildView);const runeMap=new Map(data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r]))));const primary=data.runes.find(t=>t.id===b.runePage?.primaryStyleId),secondary=data.runes.find(t=>t.id===b.runePage?.subStyleId);
 if(buildView.mode==='rift'&&buildView.quickConfiguration){
  overlay.innerHTML=`<div class="modal-backdrop drawer-backdrop" data-backdrop="true"><section class="modal drawer configuration-drawer recommendation-ui" role="dialog" aria-modal="true" aria-label="英雄配置"><header class="modal-header"><h3>我的配置</h3><div class="build-header-actions">${buildReturn?button('back-result','','arrow','quiet icon-only','aria-label="返回阵容" title="返回阵容"'):''}${button('close','','close','quiet icon-only','aria-label="关闭"')}</div></header><div class="drawer-content">${companionPlanView(data,{selection:buildSelection(),build:b},saved.favorites,{surface:'build',itemSetStatuses,pending:clientPreparing||runeApplying||!!itemSetPending,refreshing,error:buildErrors.get(buildKey(b.champion,b.role,b.mode)),enemyIds:publicMatchupIds(),opponentId:chosenMatchupOpponent(buildView)?.id||'',publicContext:matchupPreparationContext(),clientControls:clientControls({selection:buildSelection(),build:b},'build')})}</div></section></div>`;
  restoreOverlay();reflectRunePending();return;
 }
 const itemsHTML=items=>`<div class="items-row">${items.map(i=>`<div class="item" title="${e(gameDescription(i.description))}">${asset('item',i.id,i.name)}<span>${e(i.name)}</span><small>${i.gold.total} 金</small>${i.purchaseBase?`<small class="text-green">购买${e(i.purchaseBase.name)}后升级</small>`:''}</div>`).join('')}</div>`;
 overlay.innerHTML=`<div class="modal-backdrop drawer-backdrop" data-backdrop="true"><section class="modal drawer" role="dialog" aria-modal="true" aria-label="英雄配置"><header class="modal-header"><div><h3>符文与出装</h3></div><div class="build-header-actions">${buildReturn?button('back-result','返回这套方案','arrow','quiet small'):''}${button('close','','close','quiet icon-only','aria-label="关闭"')}</div></header><div class="drawer-content"><div class="champ-summary">${portrait(c,'lg')}<div><h2>${e(c.name)}</h2><p>${e(c.title)} · ${b.title}</p><span class="badge green" style="margin-top:7px">${b.mode==='hex'?'海克斯大乱斗':roleName(b.role)}</span> <span class="badge">${data.version}</span></div>${button('reference-hero','技能与改动','book','quiet small',`data-id="${c.id}"`)}</div><div class="toolbar"><select class="select" id="build-role" aria-label="配置位置" ${b.mode==='hex'?'disabled':''}>${ROLES.map(r=>`<option value="${r.id}" ${b.role===r.id?'selected':''}>${r.name}</option>`).join('')}</select><div class="segmented"><button class="segment ${b.mode==='rift'?'active':''}" data-action="build-mode" data-mode="rift">召唤师峡谷</button><button class="segment ${b.mode==='hex'?'active':''}" data-action="build-mode" data-mode="hex">海克斯大乱斗</button></div></div>${b.mode==='rift'?buildSourceControls(data,{reference:b.reference,champion:b.champion,role:b.role,refreshing}):''}<nav class="build-nav" aria-label="配置内容">${button("build-jump","玩法","","quiet small",'data-section="loadout"')}${button("build-jump","出装","","quiet small",'data-section="items"')}${button("build-jump",b.mode==="rift"?`符文 · ${b.runeOptions.length} 套`:"强化说明","","quiet small",'data-section="runes"')}${button("build-jump","加点","","quiet small",'data-section="skills"')}${b.mode==='rift'?button('build-jump','对手应对','','quiet small','data-section="opponent"'):''}</nav>${sourceOpponentNotice(b,data,{requested:buildView.sourceOpponent,plan:[buildView.id,buildView.role,buildView.mode].join(':')})}${loadoutSelector(b,data)}${clientControls({selection:buildSelection(),build:b},'build')}${preparationSummary(data,b,c,{own:currentPlayerSelection(client.session,data.champions,slots),appliedKey:runeAppliedKeys.has(runeApplicationKey(c.id,b.role,b.runePage))?runeApplicationKey(c.id,b.role,b.runePage):'',refreshing,error:buildErrors.get(buildKey(b.champion,b.role,b.mode)),selection:buildSelection()})}<div class="guide-launch"><div><b>${guideSelection?.id===b.champion&&guideSelection?.role===b.role&&guideSelection?.mode===b.mode?"已带入指引 · 修改自动同步":"把配置带到本局指引"}</b><p>紧凑小窗 · 鼠标穿透 · ${boot.guideHotkeyAvailable===false?'从托盘呼出':'Ctrl + Shift + G 呼出'}</p></div>${button('open-guide','本局指引','book','primary small',buildView.readOnly?'disabled title="只读配置不替换本人指引"':'')}</div><p class="section-copy">${e(b.tips)}</p>${b.stale?'<div class="callout warning">当前资料版本已更新，这套机制方案尚未完成新版本复核。</div>':''}
 <section class="detail-section" data-build-section="items"><h3>出门购买</h3>${itemsHTML(b.start)}${gearSelector(b,'start')}${b.granted.length?`<p class="bottom-note">位置任务自动给予：${b.granted.map(i=>e(i.name)).join("、")}，不是需要购买的出门装备。</p>`:""}${b.early.length?`<p class="bottom-note">尽早补出：${b.early.map(i=>e(i.name)).join('、')}；按用途和对线安排购买。</p>`:''}${b.support?'<p class="bottom-note">辅助位的云游图鉴由客户端按位置规则提供；没有自动获得时检查游戏模式与位置。完成任务后会升级，后续为它保留一个位置。</p>':''}</section>
 <section class="detail-section" data-build-section="items"><h3>成装路线 <span class="badge">${b.source}</span></h3>${coreRouteChoices(b,b.selectedCoreIndex,data)}${gearSelector(b,'boots')}${itemsHTML(preparationEquipment(data,b,buildSelection()))}${bottomQuestPlanControl(b)}${laterItemSelector(b)}${itemSetControls(c,b,data,{statuses:itemSetStatuses,readOnly:!!buildView.readOnly})}<p class="bottom-note">鞋子可按对线提前购买；后续装备按局势调整。${b.mode==='hex'?'海克斯会改变装备价值，请结合已选强化。':b.role==='bottom'?'下路位置任务完成后，鞋子可移入任务槽，再按对局补第六件成装。':''}${b.missing.length?' 部分装备在当前模式不可用，已从方案中隐藏。':''}</p></section>
 <section class="detail-section"><h3>遇到这些情况</h3><div class="chips">${[['ad','普攻压力大'],['ap','魔法伤害多'],['control','控制多'],['heal','对手回血多'],['burst','容易被秒']].map(([id,n])=>`<button class="chip ${buildView.conditions.includes(id)?'active':''}" data-action="build-condition" data-condition="${id}">${n}</button>`).join('')}</div>${b.adjustments.map(a=>`<div class="callout"><b>${a.title}</b>　${e(a.text)}</div>`).join('')}</section>
 <section class="detail-section" data-build-section="runes"><h3>${b.mode==='hex'?'强化与玩法':'推荐符文'}</h3>${b.runePage?`${runeSelector(b,data)}<div class="rune-columns">${[[primary,b.runePage.selectedPerkIds.slice(0,4)],[secondary,b.runePage.selectedPerkIds.slice(4,6)]].map(([tree,ids])=>`<div class="rune-tree"><h4>${tree.name}</h4>${ids.map((id,i)=>`<div class="rune-row ${tree===primary&&i===0?'keystone':''}" title="${e(gameDescription(runeMap.get(id)?.longDesc))}">${asset('rune',id,runeMap.get(id)?.name)}<span>${e(runeMap.get(id)?.name)}</span></div>`).join('')}</div>`).join('')}</div><div class="shard-row">${b.runePage.selectedPerkIds.slice(6).map(id=>`<span class="shard">${SHARDS[id]}</span>`).join('')}</div>${runeTargetNotice(c)}<div class="detail-actions">${button('apply-runes','用'+e(c.name)+'方案替换符文','check','primary',buildView.readOnly?'disabled title="队友配置仅供查看"':!boot.desktop?'title="桌面版支持应用符文"':'')}</div><p class="bottom-note">点击后直接覆盖一张可编辑符文页，不保留原方案。优先复用上次写入的页，再使用当前页或第一张可编辑页；没有可编辑页时才新建。</p>`:`<p>${b.mode==='hex'?'海克斯模式与峡谷符文规则不同，这里不应用常规符文页。强化请在“海克斯手册”中查询，按局内实际选项决定。':'这套符文与当前资料不匹配，暂时不可应用。'}</p>`}</section>
 <section class="detail-section" data-build-section="skills"><h3>召唤师技能与加点</h3>${skillSelector(b)}${summonerSelector(b,data,{planKey:[buildView.id,buildView.role,buildView.mode].join(':')})}${b.priority?`<div class="skill-row" style="margin-top:16px">${b.priority.split('').map((s,i)=>`${i?'›':''}<span class="skill-key">${s}</span>`).join('')}<small>升级优先级</small></div>`:''}${b.first?`<p class="bottom-note">前三级参考：${b.first.split('').join(' → ')}。遇到入侵或特殊对线，一级技能按实际情况调整。</p>`:b.attributePlan?'':'<p class="bottom-note">前三级技能请参考游戏内提示，根据对线或入侵情况调整。</p>'}${b.attributePlan?'':'<p class="bottom-note">按所选序列的技能节点升级；没有序列时通常优先大招，特殊机制以游戏内规则为准。</p>'}</section>
 ${b.combo?.play?`<section class="detail-section" data-build-section="combo"><h3>${e(b.combo.title)} · 分阶段配合</h3>${duoPlayView(b.combo.play)}</section>`:''}
 ${buildView.mode==='rift'?`<section class="detail-section" data-build-section="opponent">${matchupTargetView(data,buildView,publicMatchupIds(),chosenMatchupOpponent(buildView)?.id,{status:matchupFocusStatus(buildView)})}${matchupPreparationView(matchupPreparation({data,selection:buildSelection(),enemyIds:publicMatchupIds(),targetId:chosenMatchupOpponent(buildView)?.id,publicContext:matchupPreparationContext(),build:b}),data,{plan:[buildView.id,buildView.role,buildView.mode].join(':'),refresh:opponentRefreshStatus(buildSelection())})}${heroCoachView(heroCoach({data,champion:buildView.id,role:buildView.role,priority:b.priority,enemyId:chosenMatchupOpponent(buildView)?.id,combo:b.combo,stage:b.combo?'key':'opening'}))}</section>`:''}
 ${buildView.mode==='rift'?`<section class="detail-section build-matchups"><h3>位置对阵参考</h3>${matchupView(data,b.reference,{publicEnemies:(client.session?.theirTeam||[]).map(p=>data.champions.find(c=>c.key===p.championId)?.id).filter(Boolean)})}</section>`:''}
 <section class="detail-section build-source"><h3>配置来源</h3><p class="bottom-note">${e(b.sourceNote)}</p>${comboSourceLinks(b.combo?.sources)}${b.reference?`<p class="bottom-note">获取于 ${dateLabel(b.reference.fetchedAt)}。${b.reference.core[b.selectedCoreIndex].samples>0&&b.reference.core[b.selectedCoreIndex].samples<200?'样本较少，尤其适合作为娱乐玩法参考，请结合对线调整。':''}</p>${button('link','查看原始数据','arrow','small',`data-url="${e(b.reference.sourceUrl)}"`)}`:''}${b.mode==='hex'?button('refresh-build',refreshing?'刷新中…':'刷新海克斯配置','refresh','small',refreshing?'disabled':''):''}</section><div class="detail-actions">${button('copy-build','复制配置','copy')}${button('favorite-build',buildSaved?'已收藏 · 点击取消':'收藏配置','star',buildSaved?'saved':'')}</div><p class="bottom-note">玩法提示整理于 ${b.rulesDate}；版本出装与机制提示分别维护。</p></div></section></div>`;if(buildView.readOnly)overlay.innerHTML=readOnlyConfigurationMarkup(overlay.innerHTML);else if(buildView.localReference)overlay.querySelector('.drawer-content')?.insertAdjacentHTML('afterbegin','<p class="callout">本机配置参考 · 可编辑，不代表队友当前配置</p>');foldConfigurationSections(overlay);restoreOverlay();reflectRunePending();
}
function showResult(index){if(resultsSignature!==recommendationKey(recommendationInput()))throw Error('推荐条件已变化，请重新推荐');detailResult=results[index];if(!detailResult)throw Error('方案已变化，请重新推荐');resultDraftSignature=resultsSignature;picker=null;buildView=null;buildReturn=null;overlay.innerHTML=resultPlayCard(detailResult,index,data,{favorites:saved.favorites,style});}
function markResultStale(){if(detailResult){const notice=document.getElementById('result-stale');if(notice)notice.hidden=false;overlay.querySelectorAll('[data-action="use-result"],[data-action="replace-member"],[data-action="favorite-result"],[data-action="copy-result"]').forEach(b=>b.disabled=true);}}
// Client status ticks only inspect a recommendation signature. Keep immutable
// source references here; postMessage takes the isolated worker snapshot once.
let roleEvidenceCache=null;
function currentRoleEvidence(){
 const keys=[data.champions,data.runes,data.items,data.buildSources,data.builds,data.patch];
 if(!roleEvidenceCache||keys.some((value,index)=>value!==roleEvidenceCache.keys[index]))roleEvidenceCache={keys,value:buildRoleEvidence(data)};
 return roleEvidenceCache.value;
}
function recommendationInput(){
 // A recommendation keeps the last range for this exact public draft. Its
 // display freshness and every client write still require a fresh read.
 const at=Date.parse(client.eligibility?.receivedAt),now=Date.now(),referenceTime=Number.isFinite(at)?Math.min(now,at+15000):now;
 const eligibility=localPickEligibility(client,slots,data.champions,{scope,soloRole,playerPosition:saved.draft?.playerPosition,now:referenceTime});
 const includePreselected=saved.preferences.includePreselected===true,confirmed=clientRecommendationDraft(slots,client.connected?client.session:null,data.champions,{includePreselected,ownRole:taskOwnRole()}),session=confirmed.session,claiming=activeRoleClaim(positionClaim,client),singleParty=['party','context'].includes(scope)&&slots.filter(s=>s.party).length===1&&slots.find(s=>s.party)?.role===taskOwnRole();
 let contextSession=!includePreselected&&(scope==='solo'||draftComparing)&&session?{...session,myTeam:session.myTeam.map(p=>p.cellId===session.localPlayerCellId?{...p,championPickIntent:0}:p)}:session;
 let base=draftComparing||scope==='solo'||singleParty?comparisonDraft(confirmed.slots,activeCreativePlan,session,data.champions):confirmed.slots;
 if(!includePreselected&&(claiming||singleParty||scope==='solo'))({slots:base,session:contextSession}=editableLocalDraft(base,session,data.champions,taskOwnRole()));
 const contextSlots=recommendationDraft(base,contextSession,data.champions,{ownRole:taskOwnRole(),party:currentParty(),confirmedOnly:true,includePreselected,bans:clientBans,disabled:client.eligibility?.disabled||[],eligibleByRole:eligibility.eligibleByRole});
 const own=currentPlayerSelection(contextSession,data.champions,base);
 const knownPicks=new Set((contextSession?.myTeam||[]).map(player=>data.champions.find(champion=>Number(champion.key)===Number(player.championId))?.id).filter(Boolean));
 const publicPicks=[...new Set([...unassigned.map(p=>p.champion),...unassignedPublicPicks(base,contextSession,data.champions).map(p=>p.champion)])].filter(id=>!contextSession||knownPicks.has(id));
 return {includePreselected,randomSeed:String(publicClientGameId(client)||recommendationSessionSeed),clientSession:contextSession,party:currentParty(),soloRole,soloChampion:scope==='solo'?(own?.id||base.find(s=>s.role===soloRole&&s.locked)?.champion||null):null,slots:contextSlots,champions:data.champions,builds:data.builds,pairStatistics:data.pairStatistics,buildSource:data.buildSource,patch:data.patch,sourceRoles:currentRoleEvidence(),style,scope,pool:saved.preferences.pool,poolMode:saved.preferences.poolMode,play:saved.preferences.play,rolePools:saved.preferences.rolePools,catalog:data.catalog,catalogStatus:data.catalogInfo?.status,excluded:[...saved.excluded],publicBans:clientBans,eligibleByRole:eligibility.eligibleByRole,confirmedPick:localPickLocked(session)?eligibility.confirmedPick:null,publicPicks,enemy:client.session?.allowDuplicatePicks===false?publicMatchupIds():[],visibleEnemies:publicMatchupIds(),creativePlan:draftComparing?null:activeCreativePlan,version:data.version,catalogVersion:data.catalog.version,limit:6,offset};
}
function useCatalogResult(result){cancelRecommendation();data.catalog=configureCatalog(result.catalog);data.catalogInfo=result.info;results=[];offset=0;render();}
function rolePoolsDialog(){closeOverlay();overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal" role="dialog" aria-modal="true" aria-label="各位置英雄池"><header class="modal-header"><div><h2>各位置英雄池</h2><p>只限制本次需要推荐的位置，保留已经锁定的英雄。</p></div>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="panel-body">${ROLES.map(r=>`<div class="setting-row"><div><b>${r.name}</b><p>${saved.preferences.rolePools[r.id].heroes.map(id=>champ(id)?.name||id).join('、')||'未设置英雄池'}</p></div><select class="select" data-role-pool-mode="${r.id}" aria-label="${r.name}英雄池模式">${[['off','全部英雄'],['prefer','优先这个池'],['only','仅使用这个池']].map(([id,name])=>`<option value="${id}" ${saved.preferences.rolePools[r.id].mode===id?'selected':''}>${name}</option>`).join('')}</select>${button('role-pool-edit','选英雄','','small',`data-role="${r.id}"`)}</div>`).join('')}<p class="bottom-note">与全局英雄池同时限制时取交集；空池设为“仅使用”会提示你调整。</p></div></section></div>`;}
function showAugment(id){const a=data.augments.find(x=>x.id===id);if(!a)return;picker=null;buildView=null;detailResult=null;overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal" style="width:530px" role="dialog" aria-modal="true" aria-label="强化详情"><header class="modal-header"><div class="augment-title">${asset('augment',a.id,a.name)}<div><h2>${e(a.name)}</h2><span class="rarity-${a.rarity}">${rarityName[a.rarity]}</span></div></div>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="panel-body"><p class="section-copy" style="white-space:pre-line">${e(a.description||'已确认收录于当前海克斯大乱斗模式清单。详细效果尚未补充，以游戏内说明为准。')}</p>${a.descriptionStatus==='partial'?'<div class="callout warning">“适用技能”与“动态数值”取决于英雄和局内条件，请看游戏里的具体技能及数值。</div>':''}<div class="callout">资料 ${e(data.augmentVersion||data.version)}。可出现的强化还可能受英雄、已选强化与热更新影响。</div><div class="detail-actions">${button('compare-augment',hexOptions.includes(id)?'移出本次比较':'加入本次比较','hex','',`data-id="${id}"`)}${button('own-augment',hexOwned.includes(id)?'本局已选':'标记本局已选','check','',`data-id="${id}" ${hexOwned.includes(id)?'disabled':''}`)}</div>${button('toggle-augment',hexSelected.includes(id)?'移出我的备选':'加入我的备选',hexSelected.includes(id)?'close':'check','primary',`data-id="${id}"`)}</div></section></div>`;}

function calculateRecommendation(input){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./recommend-worker.mjs',import.meta.url),{type:'module'});
  const task={cancel:()=>{worker.terminate();reject(Object.assign(Error('条件已变化'),{cancelled:true}));}};activeRecommendation=task;
  const finish=()=>{worker.terminate();if(activeRecommendation===task)activeRecommendation=null;};
  worker.onmessage=({data})=>{finish();data.error?reject(Error(data.error)):resolve(data.results);};
  worker.onerror=()=>{finish();reject(Error('搭配计算未完成，请重试'));};worker.postMessage(input);
 });
}
async function generate(next=false){
 if(generating)return;clearTimeout(autoRecommendTimer);autoRecommendTimer=null;cancelRecommendationReveal();recommendationError='';const run=++recommendationRun;let reveal=false;generating=true;render();
 try{offset=next?offset+(results.length||6):0;const input=recommendationInput();
  const signature=recommendationKey(input);
  let result=await calculateRecommendation(input);if(!result.length&&offset){offset=0;result=await calculateRecommendation({...input,offset:0});}
  if(run!==recommendationRun||signature!==recommendationKey(recommendationInput()))return;
  for(const r of result)resultCreativePlan(r);results=result;showAllCandidates=false;resultsSignature=signature;if(!result.length)recommendationError='当前位置英雄池与公开选人无法组成不重复的阵容，请调整限制';if(!results.length)toast(recommendationError,true);else reveal=true;
 }catch(err){if(!err.cancelled&&run===recommendationRun){recommendationError=err.message;toast(err.message,true);}}finally{if(run===recommendationRun){generating=false;render();}}
}
const sync=createClientSync(performSync);
const recommendationSessionSeed=crypto.randomUUID();
let sharedClient=null;
async function performSync(manual=true,fresh=false){
 const previousClient=client,previousOwn=client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId),previousOwnIntent=previousOwn?.championId||previousOwn?.championPickIntent||0;
 lastSyncStarted=Date.now();syncing=true;const before=lastRenderedClient||clientRenderIdentity(client),previousMatchups=matchupContext(),previousPhase=client.phase,previousRecommendation=recommendationKey(recommendationInput());let changed=false,newGame=false;if(manual)render();
 try{
   await saveChain;const incoming=sharedClient;sharedClient=null;client=!manual&&!fresh&&incoming?incoming:await api.client(manual||fresh);history.observeClient(client);ongoing.observeClient(client);drainExternalState();
  if(positionClaim&&!positionClaim.pending&&!activeRoleClaim(positionClaim,client)){
   if(localPickLocked(client.session)&&preparationGameId(client)===positionClaim.gameId){draftComparing=false;companionTab='plan';}
   positionClaim=null;
  }
  const selectionContext=client.selectionContext||'';if(api.matchupFocus&&lastMatchupSession!==selectionContext){matchupTargets.clear();lastMatchupSync='';}lastMatchupSession=selectionContext;
  const matchupGame=publicClientGameId(client)||'';
  if(matchupGame&&lastMatchupGame&&matchupGame!==lastMatchupGame||client.phase==='ChampSelect'&&!['Offline','ChampSelect'].includes(previousPhase)||['None','Lobby','Matchmaking','ReadyCheck'].includes(client.phase))matchupTargets.clear();
  if(matchupGame)lastMatchupGame=matchupGame;
  if(client.connected&&client.receivedAt)lastClientRead=client.receivedAt;else if(lastClientRead)client.receivedAt=lastClientRead;
  if(manual&&client.needsElevation){toast('正在等待 Windows 权限确认…');client=await api.authorizeClient();}
  const draftContext=reconcileClientDraft({...saved.draft,slots,style,scope,soloRole},publicClientGameId(client),saved.guide?.match?.gameId,{phase:client.phase,previousPhase});
  if(draftContext.changed){saved.draft=draftContext.draft;slots=saved.draft.slots;soloRole=saved.draft.soloRole;changed=true;if(draftContext.newGame){newGame=true;clearSelectionUi();if(activeCreativePlan&&!saved.draft.creativePlan)creativePlanNotice='新局已开始，原组合不会自动沿用；可以从收藏重新选择。';activeCreativePlan=saved.draft.creativePlan||null;pendingIntentPreparation=null;companionPreview=null;matchupTargets.clear();unassigned=[];}persist({derived:!manual});}
  if(client.session){
   if(!positionClaim){positionClaim=restoredRoleClaim(saved.draft?.preselection,client,data.champions);if(positionClaim){draftComparing=true;companionTab='recommend';companionPreview=null;lastTaskSelection=null;}}
   if(!validPartyCount(saved.draft?.partyCount)){
    const count=selectionPartyCount(client,previousClient);
    slots=reconcilePartyRange(slots,client.session,data.champions,{count,party:currentParty(),ownRole:taskOwnRole(),roleOrder:currentRankedRoles(),initial:true});
    scope='party';saved.draft={...saved.draft,scope,partyCount:count};changed=true;
   }
   const nextOwn=client.session.myTeam.find(p=>p.cellId===client.session.localPlayerCellId),nextOwnIntent=nextOwn?.championId||nextOwn?.championPickIntent||0;
   // Only the explicitly requested hover belongs to this operation. A player
   // changing or clearing it in the client must still replace the old plan.
   const expectedHover=(candidatePreparing||clientPreparing)&&nextOwnIntent===champ(preparationTarget?.id)?.key;
   const ownIntentChanged=previousOwnIntent!==nextOwnIntent&&!expectedHover;
   if(ownIntentChanged)lastTaskSelection=null;
   // Recognizing a party updates its members, not an explicit recommendation scope.
   const merged=mergeClientSession(slots,client.session,data.champions,clientSyncOptions());merged.slots=restorePlayerPosition(merged.slots,client.session,data.champions,saved.draft?.playerPosition);merged.unassigned=unassignedPublicPicks(merged.slots,client.session,data.champions);
   if(ownIntentChanged){
    const currentId=data.champions.find(c=>c.key===nextOwnIntent)?.id,role=taskOwnRole();
    merged.slots=merged.slots.map(s=>{
     if(s.role!==role||s.champion===currentId||!s.automaticPosition||s.manualPosition||Number.isInteger(s.clientCellId)&&s.clientCellId!==client.session.localPlayerCellId)return s;
     const {automaticPosition,publicIntent,...rest}=s;return {...rest,champion:null,locked:false};
    });
   }
   changed=changed||JSON.stringify(slots)!==JSON.stringify(merged.slots)||JSON.stringify(unassigned)!==JSON.stringify(merged.unassigned);slots=merged.slots;changed=reconcileCreativePlan({ownIntentChanged})||changed||ownIntentChanged;unassigned=merged.unassigned;{
    const own=currentPlayerSelection(client.session,data.champions,slots),player=client.session.myTeam.find(p=>p.cellId===client.session.localPlayerCellId);
    // The client declares a lane before the player chooses a champion.
    const role=manualPlayerSlot(slots,client.session.localPlayerCellId)?.role||(saved.draft?.playerPosition?.cellId===client.session.localPlayerCellId?saved.draft.playerPosition.role:null)||(own?.positionKnown?own.role:null)||CLIENT_POSITION_ROLES[String(player?.assignedPosition||'').toUpperCase()];
    if(role&&soloRole!==role){soloRole=role;changed=true;}
   }
   const keys=new Map(data.champions.map(c=>[c.key,c.id]));
   const nextEnemy=client.session.theirTeam.map(p=>keys.get(p.championId)).filter(Boolean),nextBans=client.session.bans.map(id=>keys.get(id)).filter(Boolean);
   if(JSON.stringify(enemy)!==JSON.stringify(nextEnemy)||JSON.stringify(clientBans)!==JSON.stringify(nextBans))changed=true;
   enemy=nextEnemy;clientBans=nextBans;if(changed)persist({derived:!manual});
   const matchupOwn=currentPlayerSelection(client.session,data.champions,slots),ownKey=matchupOwn?matchupTargetKey({...matchupOwn,mode:client.mode?.id}):'';
   if(lastMatchupOwn&&lastMatchupOwn!==ownKey){matchupTargets.clear();lastMatchupSync='';}lastMatchupOwn=ownKey;
   for(const [key,target] of matchupTargets)if(target&&!enemy.includes(target)){matchupTargets.delete(key);lastMatchupSync='';}
   const ownPlan=myPreparation();if(ownPlan&&matchupTargets.has(matchupTargetKey(ownPlan.selection)))syncMatchupFocus(ownPlan.selection,matchupTargets.get(matchupTargetKey(ownPlan.selection)));
   if(pendingIntentPreparation){const prepared=myPreparation();if(prepared){const intended=pendingIntentPreparation;pendingIntentPreparation=null;if(pendingIntentPlanId===(activeCreativePlan?.id||'')&&['id','role','mode'].every(field=>intended[field]===prepared.selection[field])){rememberPreparation(intended);syncPreparedGuide(intended);}}}
   if(manual)toast((unassigned.length?'读取成功，部分英雄需要你确认位置':'选人信息已同步')+(merged.markedLocalChanged?' · 已按客户端标出你的分路':''));
  }else{
   if(client.connected&&['None','Lobby','Matchmaking','ReadyCheck'].includes(client.phase)){
    if(saved.draft?.playerPosition){delete saved.draft.playerPosition;changed=true;persist({derived:!manual});}
    const cleaned=clearClientPicks(slots),ranged=saved.preferences.autoParty!==false?reconcilePartyRange(cleaned,null,data.champions,{count:initialPartyCount(client.party),party:currentParty(),ownRole:saved.draft?.preselection?.role||'',initial:true}):cleaned;if(JSON.stringify(ranged)!==JSON.stringify(slots)){slots=ranged;changed=true;persist({derived:!manual});}
   }
   if(enemy.length||clientBans.length||unassigned.length){enemy=[];clientBans=[];unassigned=[];changed=true;}
   if(manual)toast(client.message,!client.connected);
  }
 }catch(err){client={connected:false,phase:'Offline',message:err.message,...(lastClientRead?{receivedAt:lastClientRead}:{})};if(manual)toast(err.message,true);}
 finally{scheduleRoomPublish();if(newGame||previousRecommendation!==recommendationKey(recommendationInput())){markResultStale();cancelRecommendation();results=[];offset=0;changed=true;}changed=runeAppliedKeys.observe(client)||changed;await saveChain;syncing=false;if(manual||changed||before!==clientRenderIdentity(client)){
  // A background status tick must not replace an active search field while typing.
  if(dragPick)pendingDragRender=true;else if(activeAppSelect||windowLayout.docked&&changed||!document.activeElement?.matches('input,select'))render();
  if(buildView&&(renderedBuildContext!==buildSelectionContext(buildView.build)||previousMatchups!==matchupContext()))renderBuild();
 }}
 refreshClientClock();queueCompanionRecommendation();if(sharedClient?.receivedAt===client.receivedAt)sharedClient=null;if(sharedClient)setTimeout(()=>sync(false),0);
}
function reflectRunePending(){
 reflectItemSetPending();
 if(clientPreparing)for(const control of document.querySelectorAll('[data-action="client-prepare"],[data-action="my-runes"],[data-action="apply-runes"],[data-action="import-item-set"],[data-action="authorize-item-set"]'))control.disabled=true;
 if(runeApplying)for(const button of document.querySelectorAll('[data-action="my-runes"],[data-action="apply-runes"]')){button.disabled=true;button.textContent='正在替换…';}
}
function reflectItemSetPending(){
 if(itemSetPending)for(const control of document.querySelectorAll('[data-action="import-item-set"],[data-action="export-item-set"],[data-action="authorize-item-set"]')){control.disabled=true;if(control.dataset.action===itemSetPending)control.textContent=itemSetPending==='import-item-set'?'正在导入…':'正在导出…';}
}
async function useItemSet(action,el){
 if(itemSetPending||clientPreparing)throw Error('装备集正在处理，请等待本次操作完成');
 const authorize=action==='authorize-item-set';if(authorize)action='import-item-set';
 const plan=el.dataset.itemsetView==='task'?ownTaskPreparation():el.dataset.itemsetView==='companion'?companionPreparation():buildView?{selection:buildView,build:buildView.build}:null;
 if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('方案已变化，请核对当前英雄后重试');
 if(action==='import-item-set'&&readOnlyPreparation(el.dataset.itemsetView==='companion'?'companion':'build',plan))throw Error('当前是只读配置，可导出参考；请回到本人的准备操作导入');
 const itemSet=createItemSet(champ(plan.selection.id),plan.build,data),key=JSON.stringify(itemSet),gameId=preparationGameId(client);
 if(el.closest('[data-itemset-fingerprint]')?.dataset.itemsetFingerprint!==key)throw Error('装备方案已变化，请查看当前方案后重新点击');
 itemSetPending=action;itemSetStatuses.set(key,{text:authorize?'正在等待 Windows 权限确认…':action==='import-item-set'?'正在写入当前装备集…':'正在导出当前装备集…'});render();if(buildView)renderBuild();
 try{
  if(authorize)await api.authorizeClient();
  const result=await (action==='import-item-set'?api.importItemSet(itemSet):api.exportItemSet(itemSet));
  const text=action==='import-item-set'?itemSetSuccessStatus(result).text:result.exported?'已导出 JSON，可在客户端“藏品 → 装备”中导入。':'已取消导出，当前方案保留。';
  const current=action!=='import-item-set'||gameId===preparationGameId(client)&&(!result.preparationRevision||result.preparationRevision>=preparationRevision);
  if(current)itemSetStatuses.set(key,{...itemSetStatuses.get(key),text});if(current&&action==='import-item-set'&&el.dataset.itemsetView==='companion')returnToTeamAfterPreparation(plan.selection);toast(current?(result.title?text+' '+result.title:text):'装备集操作已结束，选人或配置已变化，请重新核对。');
 }catch(error){const text=String(error.message||'装备集操作未完成').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');itemSetStatuses.set(key,{text:text+(action==='import-item-set'&&!text.includes('导出')?'；可点击“导出 JSON”手动导入。':''),error:true,needsAuthorization:text.includes('Windows 权限')||text.includes('连接授权')});toast(text,true);
 }finally{itemSetPending='';while(itemSetStatuses.size>50)itemSetStatuses.delete(itemSetStatuses.keys().next().value);render();if(buildView)renderBuild();}
}
async function applyPreparedRunes(page,ticket){
 const result=await api.applyRunes(page,runeWriteContext(client));
 await sync(false,{fresh:true});
 const confirmed=runeAppliedKeys.confirm(ticket)||runeAppliedKeys.confirmShared(ticket,result.preparationRevision,preparationRevision);
 toast(confirmed?'本次已应用：'+result.name:'符文写入已完成，但选人或连接已变化；请在客户端核对后重新应用',!confirmed);
 return confirmed;
}
async function checkAppUpdate(silent=false){
 if(['checking','downloading','verifying','installing'].includes(appUpdate.phase))return;
 appUpdate={phase:'checking',release:null,received:0,total:null,error:'',via:null};if(!silent)render();
 const cleanError=message=>String(message||'请稍后重试').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');
 try{
  const snapshot=await api.checkAppUpdate(silent);
  if(appUpdate.phase==='checking')appUpdate={phase:snapshot.phase,release:snapshot.release||null,received:0,total:null,error:snapshot.error||'',...(snapshot.record?{record:snapshot.record}:{}),...(snapshot.dismissed?{dismissed:true}:{})};
  if(['available','current','ready'].includes(snapshot.phase)){saved.preferences.lastAppUpdateCheck=new Date().toISOString();persist();}
  if(!silent){if(snapshot.phase==='available')toast(`发现新版 v${snapshot.release.version}，可下载安装`);else if(snapshot.phase==='ready')toast('新版安装包已就绪，可退出并安装');else if(snapshot.phase==='current')toast('软件已是最新版本');else toast('软件更新检查未完成：'+cleanError(snapshot.error),true);}
 }catch(err){appUpdate={phase:'error',release:null,received:0,total:null,error:cleanError(err.message),via:null};if(!silent)toast('软件更新检查未完成：'+appUpdate.error,true);}
 finally{if(route==='settings'||!silent)render();}
}
async function downloadAppUpdate(){const release=appUpdate.release;try{appUpdate.phase='downloading';render();await api.downloadAppUpdate();}catch(err){const prev=appUpdate;appUpdate={phase:'error',release,received:0,total:null,error:String(err.message||'下载未完成').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,''),via:prev.via||null,fallbackNotice:prev.fallbackNotice||false};render();toast(appUpdate.error,true);}}
async function installAppUpdate(){
 if(appUpdate.phase!=='ready')return;
 const prev=appUpdate;appUpdate={...prev,phase:'installing',error:''};render();
 try{const r=await api.installAppUpdate();if(r?.dryRun){appUpdate=prev;render();toast('已记录安装演练，未真实拉起安装程序');}}
 catch(err){
  const error=String(err.message||'安装未启动').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');
  appUpdate={...(appUpdate.phase==='installing'?prev:appUpdate),error};if(route==='settings')render();toast(error,true);
 }
}
async function updateData(silent=false){
 if(updating)return;updating=true;updateMessage='正在检查官方版本';if(!silent)render();
 saved.preferences.lastCheck=new Date().toISOString();persist();
 try{const next=await api.updateData();data=next.data;bindPlayerBuildPreferences();selectBuildSource(data,saved.preferences.buildSource);configureCatalog(data.catalog||BUNDLED_CATALOG);configureAssets(data);markResultStale();cancelRecommendation();results=[];updateMessage='已检查，当前资料 '+data.version;if(!silent)toast(next.imageCache?.failed?'资料已更新；部分新增图片暂未缓存，联网时仍可查看':'基础资料已检查，收藏和偏好已保留');}
 catch(err){updateMessage='更新未完成，继续使用本地资料';if(!silent)toast('更新失败，继续使用本地资料：'+err.message,true);}
 finally{updating=false;if(!document.activeElement?.matches('input,select'))render();if(buildView){renderBuild();maybeRefreshBuild(buildView.id,buildView.role,buildView.mode);}if(hexHero)maybeRefreshBuild(hexHero,profile(champ(hexHero)).roles[0],'hex');}
}
async function changeFavorites(next,message){
 if(favoriteSaving)throw Error('收藏正在保存，请稍候再操作');
 const previous=saved.favorites;favoriteSaving=true;saved.favorites=next;render();
 try{await persist({throwOnError:true});toast(message);}
 catch(error){saved.favorites=previous;await persist();throw Error('收藏未保存，已保留原收藏：'+error.message);}
 finally{favoriteSaving=false;render();if(buildView)renderBuild();}
}
async function addFavorite(fav){const index=saved.favorites.findIndex(f=>f.id===fav.id);if(index>=0){await changeFavorites(saved.favorites.filter((_,i)=>i!==index),'已取消收藏');}else{if(saved.favorites.length>=500)throw Error('收藏已达到 500 项，请先移出一项再收藏');await changeFavorites([{...fav,version:data.version,createdAt:new Date().toISOString()},...saved.favorites],'已收藏，下次就玩这套');}}

function finishDrag(){
 dragPick=null;document.querySelectorAll('.drop-ready,.drag-origin').forEach(el=>el.classList.remove('drop-ready','drag-origin'));
 if(pendingDragRender){pendingDragRender=false;render();}
}
document.addEventListener('dragstart',event=>{
 const el=event.target.closest('[data-drag-role],[data-drag-cell]');if(!el||route!=='draft')return;
 const pick=el.dataset.dragRole?slots.find(s=>s.role===el.dataset.dragRole):unassigned.find(p=>p.cellId===Number(el.dataset.dragCell));
 if(!pick?.champion){event.preventDefault();return;}
 dragPick={kind:el.dataset.dragRole?'slot':'client',role:pick.role,cellId:pick.cellId,champion:pick.champion};
 event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-rift-buddy-champion',JSON.stringify(dragPick));
 el.closest('.slot')?.classList.add('drag-origin');
});
document.addEventListener('dragover',event=>{
 if(!dragPick)return;const target=event.target.closest('[data-drop-role]');if(!target)return;
 event.preventDefault();event.dataTransfer.dropEffect='move';
 document.querySelectorAll('.drop-ready').forEach(el=>{if(el!==target)el.classList.remove('drop-ready');});target.classList.add('drop-ready');
});
document.addEventListener('dragleave',event=>{const target=event.target.closest('[data-drop-role]');if(target&&!target.contains(event.relatedTarget))target.classList.remove('drop-ready');});
document.addEventListener('drop',event=>{
 if(!dragPick)return;const target=event.target.closest('[data-drop-role]');if(!target){finishDrag();return;}
 event.preventDefault();const pick=dragPick;draggedAt=Date.now();dragPick=null;pendingDragRender=false;
 try{
  if(pick.kind==='slot'){
   if(slots.find(s=>s.role===pick.role)?.champion!==pick.champion)throw Error('选人已变化，请重新拖动当前英雄');
   slots=moveChampion(slots,pick.role,target.dataset.dropRole);
  }else{
   const current=unassigned.find(p=>p.cellId===pick.cellId&&p.champion===pick.champion);
   slots=assignClientChampion(slots,current,target.dataset.dropRole);unassigned=unassigned.filter(p=>p!==current);
  }
  invalidate();toast('位置已生效，手动安排会在同步时保留');
 }catch(error){render();toast(error.message,true);}
});
document.addEventListener('dragend',()=>{draggedAt=Date.now();finishDrag();});

function configurationEventSelection(el){
 if(buildView&&overlay.contains(el))return buildSelection();
 if(companionTab==='plan'&&el.closest('.companion-content'))return companionPreparation()?.selection;
 return null;
}
// Native disabled controls are presentation only. Recheck the current view
// before any bubbled or synthetic editor event can change persisted choices.
document.addEventListener('change',event=>{
 const selection=configurationEventSelection(event.target);
 if(!selection?.readOnly)return;
 event.preventDefault();event.stopImmediatePropagation();toast('队友配置仅供查看，请回到本人的配置',true);render();if(buildView)renderBuild();
},true);

function historyChartAction(event){const el=event.target.closest?.('[data-history-chart][data-value]');if(!el)return false;const detail=history.current()?.details[el.dataset.historyChart];if(detail&&['chartFrame','chartPlayer','rawStatsMetric'].includes(el.dataset.chartField)){detail[el.dataset.chartField]=el.dataset.value;render();return true;}return false;}
document.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches?.('[data-history-chart][data-value]')){event.preventDefault();historyChartAction(event);}});
document.addEventListener('keydown',event=>{const tab=event.target.closest?.('.history-detail-tabs [role=tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...tab.parentElement.querySelectorAll('[role=tab]')],index=tabs.indexOf(tab),next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];event.preventDefault();next.click();});
document.addEventListener('click',async event=>{
 if(historyChartAction(event))return;
 const el=event.target.closest('[data-action]');if(!el){if(event.target.dataset.backdrop)closeOverlay();return;}
 if(Date.now()-draggedAt<250)return;
 const action=el.dataset.action;try{
 if(action.startsWith('history-')){await historyAction(action,el,event.ctrlKey||event.metaKey);return;}
 if(action.startsWith('ongoing-')){await ongoingAction(action,el);return;}
 const configuration=configurationEventSelection(el);
 if(configuration?.readOnly&&!readOnlyConfigurationAction(action))assertConfigurationEditable(configuration);
 if(action==='window-info'||action==='window-info-refresh'){await showWindowInfo(action==='window-info-refresh');return;}
 if(action==='window-info-copy'){if(!currentWindowInfo)throw Error('请先读取窗口资料');await api.copy(windowInfoText(currentWindowInfo));toast('窗口资料已复制');return;}
 if(action==='theme-open'){closeOverlay();updateThemeDialog(overlay,saved.preferences.presentation);return;}
 if(action==='presentation-open'){updatePresentationDialog(overlay,saved.preferences.presentation);return;}
  if(action==='presentation'){const change={field:el.dataset.field,value:el.dataset.field==='textScale'?Number(el.dataset.value):el.dataset.value};const themeOnly=!!overlay.querySelector('.theme-settings');saved.preferences.presentation=await api.presentation(change);render();if(themeOnly)updateThemeDialog(overlay,saved.preferences.presentation);else updatePresentationDialog(overlay,saved.preferences.presentation);return;}
  if(action==='build-source-cache'){
   const selection=el.dataset.plan?companionPreparation()?.selection:buildView&&buildSelection();
   if(!selection||selection.mode!=='rift'||selection.id!==el.dataset.cacheChampion||selection.role!==el.dataset.cacheRole||el.dataset.plan&&el.dataset.plan!==[selection.id,selection.role,selection.mode].join(':'))throw Error('英雄或位置已变化，请核对当前配置');
   const source=requireBuildSource({region:el.dataset.cacheRegion,tier:el.dataset.cacheTier});
   if(!cachedBuildAlternatives(data,selection.id,selection.role).some(reference=>sameBuildSource(reference,source)))throw Error('这份来源缓存已变化，请重新选择');
   saved.preferences.buildSource=source;selectBuildSource(data,source);invalidate();if(buildView)renderBuild();toast('已改用本机缓存的'+buildSourceLabel(source));return;
  }
 if(action==='companion-summoner'){editCompanionPlan(el,el.dataset.field,el.dataset.id);return;}
 if(action==='companion-core'){editCompanionPlan(el,'core',el.dataset.id);return;}
 if(action==='companion-shared-reset'){editCompanionPlan(el,'shared-reset');return;}
 if(action==='recovery-settings'){if(windowLayout.docked&&api.openMainPage){await api.openMainPage({route:'settings'});return;}route='settings';render();return;}
 if(action==='dismiss-recovery'){stateRecovery=null;render();return;}
 if(action==='companion-start'||action==='companion-boots'){editCompanionPlan(el,action==='companion-start'?'start':'boots',el.dataset.id);return;}
 if(action==='companion-favorite'){const plan=overlay.contains(el)&&buildView?{selection:buildSelection(),build:buildView.build}:companionPreparation();if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('选人已变化，请核对当前方案');const v={...plan.selection,build:plan.build,conditions:plan.selection.conditions||[],coreIndex:plan.build.selectedCoreIndex||0};await addFavorite({id:savedBuild(v)?.id||buildFavoriteId(v),...selectedBuildFields(v,{preserveUnavailable:true}),type:'build',title:champ(v.id).name+' · '+v.build.title+(v.build.selectedRune?' · '+v.build.selectedRune.name:''),champion:v.id,role:v.role,mode:v.mode,conditions:v.conditions,coreIndex:v.coreIndex});render();return;}
 if(action==='import-item-set'||action==='export-item-set'||action==='authorize-item-set'){await useItemSet(action,el);return;}
 if(action==='ranking-role'){if(!ROLES.some(r=>r.id===el.dataset.role))throw Error('位置不正确');rankingRole=el.dataset.role;companionScroll.delete('rankings');render();return;}
 if(action==='reference-hero'){if(!champ(el.dataset.id))throw Error('英雄资料已变化');if(windowLayout.docked&&api.openMainPage){await api.openMainPage({route:'reference',id:el.dataset.id,tab:el.dataset.tab==='changes'?'changes':'skills'});return;}referenceHero=el.dataset.id;referenceTab=el.dataset.tab==='changes'?'changes':'skills';referenceSkill='Q';referenceVariant=0;route='reference';closeOverlay();render();return;}
 if(action==='reference-back'){referenceHero='';render();return;}
 if(action==='reference-role'){if(!['all',...ROLES.map(r=>r.id)].includes(el.dataset.role))return;referenceRole=el.dataset.role;render();return;}
 if(action==='reference-tab'){referenceTab=el.dataset.tab==='changes'?'changes':'skills';render();return;}
 if(action==='reference-skill'){if(!['P','Q','W','E','R'].includes(el.dataset.skill))return;referenceSkill=el.dataset.skill;referenceVariant=0;render();return;}
 if(action==='reference-variant'){const index=Number(el.dataset.variant);if(!Number.isInteger(index)||index<0||index>11)return;referenceVariant=index;render();return;}
 if(action==='ranking-refresh'){await refreshRanking();return;}
 if(action==='ranking-hero'){
  const id=el.dataset.id,role=el.dataset.role,ref=rankingReference(data,rankingSource||data.buildSource);
  if(!ref?.boards[role]?.some(row=>row.champion===id)||!champ(id))throw Error('榜单已变化，请重新选择');
  const combo=currentCombo(slots,id,role,data.catalogInfo?.status,null,activeCreativePlan);
  await prepareHeroClick({id,role,mode:'rift',...creativeComboContext(combo)});
  return;
 }
 if(action==='task-configuration'){const plan=ownTaskPreparation();if(!plan)throw Error('请先选择英雄');if(windowLayout.docked){companionTab='plan';render();}else showBuild(plan.selection.id,plan.selection.role,plan.selection.mode,{...plan.selection,quickConfiguration:true});return;}
 if(action==='task-compare'){if(clientPreparing||runeApplying||candidatePreparing)throw Error('当前配置进行中，请等待完成后换方案');draftComparing=true;companionTab='recommend';cancelRecommendation();results=[];offset=0;await generate();return;}
 if(action==='task-return'){draftComparing=false;cancelRecommendation();results=[];offset=0;render();return;}
 if(action==='task-members'){renderTaskMembers();return;}
 if(action==='draft-filters'){overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal" role="dialog" aria-modal="true" aria-label="推荐偏好"><header class="modal-header"><h3>推荐偏好</h3>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="modal-body"><details class="draft-preferences" open><summary>${e(restrictionSummary())}</summary>${playControls(saved.preferences)}</details><div class="segmented">${Object.entries(STYLES).map(([id,s])=>`<button class="segment ${style===id?'active':''}" data-action="style" data-style="${id}">${s.name}</button>`).join('')}</div>${button('combination-library','浏览组合库','','small')}${button('hero-pool','英雄池','','small')}${button('role-pools','各位置英雄池','','small')}${button('exclusions','排除英雄','','small')}${button('reset-draft','清空未选英雄','','quiet small')}${pairRefreshView(data,currentPairTargets(),pairRefreshStatus())}${button('example','载入空阵容示例','','quiet small')}</div></section></div>`;return;}
 if(action==='task-rankings'){rankingRole=taskOwnRole()||'top';if(windowLayout.docked)companionTab='rankings';else route='rankings';render();return;}
 if(action==='task-edit'){const plan=ownTaskPreparation();if(!plan)throw Error('请先确认本人英雄与位置');if(windowLayout.docked){companionPreview=structuredClone(plan.selection);companionTab='plan';render();}else showBuild(plan.selection.id,plan.selection.role,plan.selection.mode,{...plan.selection,readOnly:false,quickConfiguration:true});return;}
 if(action==='companion-tab'){if(el.dataset.tab==='plan'&&companionPreview?.readOnly)companionPreview=null;companionTab=el.dataset.tab;closeOverlay();render();return;}
 if(action==='companion-current'){companionPreview=null;companionTab='plan';closeOverlay();render();return;}
 if(action==='companion-preview'){await prepareCandidate(el);return;}
 if(action==='configuration-switch'){
  const plan=overlay.contains(el)&&buildView?{selection:buildSelection(),build:buildView.build}:companionPreparation();
  if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('英雄已变化，请重新选择配置');
  assertConfigurationEditable(plan.selection);
  const choice=configurationChoices(data,plan.selection,plan.build).find(value=>value.id===el.dataset.config);
  if(!choice)throw Error('配置已更新，请重新选择');
  if(clientPreparing||runeApplying||itemSetPending)throw Error('正在应用配置，请稍候');
  const context=selectionRequestContext(),next=rememberPreparation(structuredClone(choice.selection));
  await saveChain;if(context!==selectionRequestContext())throw Error('选人已变化，请重新选择配置');
  syncPreparedGuide(next);await guideSyncChain;await prepareHeroClick(next);return;
 }
 if(action==='companion-jump'){const section=document.querySelector(`[data-companion-section="${el.dataset.section}"]`);if(section){if(section.tagName==='DETAILS')section.open=true;section.scrollIntoView({block:'start'});}return;}
 if(action==='companion-refresh'){const plan=companionPreparation();if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('选人已变化，请核对当前方案');await refreshConfiguration(plan.selection.id,plan.selection.role,plan.selection.mode);return;}
 if(['matchup-rune','matchup-core','matchup-skill'].includes(action)){chooseMatchupConfiguration(el,action.slice(8));return;}
 if(action==='refresh-opponent-build'){await refreshOpponentConfiguration(el);return;}
 if(action==='source-opponent-reset'){resetOpponentConfiguration(el);return;}
 if(action==='companion-rune'){editCompanionPlan(el,'rune',el.dataset.id);return;}
 if(action==='companion-rune-reset'){editCompanionPlan(el,'rune-reset');return;}
 if(action==='companion-skill-reset'){editCompanionPlan(el,'skill-reset');return;}
 if(action==='companion-quest-plan'){editCompanionPlan(el,'quest-plan');return;}
 if(action==='companion-later'){editCompanionPlan(el,'later',el.dataset.id);return;}
 if(action==='companion-condition'){editCompanionPlan(el,'condition',el.dataset.condition);return;}
 if(action==='companion-full'){acceptWindowLayout(await api.companionMode(false));return;}
 if(action==='companion-attach'){if(!api.companionMode)throw Error('贴边选人请在桌面版使用');const layout=await api.companionMode(true);if(layout.docked&&layout.surface!=='companion')acceptWindowLayout(layout);if(!(layout.opened??layout.companionVisible??layout.docked))throw Error(layout.reason||'当前还不能打开选人侧栏，请连接客户端并进入选人');toast('已打开本次选人侧栏，主窗保持打开');return;}
 if(action==='client-companion'){saved.preferences.clientCompanion=saved.preferences.clientCompanion===false;await persist();render();return;}
 if(action==='recover-guide'){if(!api.recoverGuide)throw Error('找回指引请在桌面版使用');await api.recoverGuide();if(overlay.querySelector('[data-window-info]'))await showWindowInfo(true);toast('指引已展开并移回游戏所在屏幕');return;}
 if(action==='room-focus'){
  closeOverlay();if(windowLayout.docked)companionTab='room';else route='room';render();return;
 }
 if(action==='room-reconnect'){
  if(!api.roomReconnect)throw Error('重新连接请在桌面版使用');if(roomBusy)return;roomBusy=true;roomError='';render();
  try{room=await api.roomReconnect();roomShareSig='';await publishRoomShare({force:true});toast('已连接当前游戏组队的房间');}
  catch(error){roomError=roomErrorMessage(error);toast(roomError,true);}
  finally{roomBusy=false;render();}return;
 }
 if(action==='room-to-draft'){route='draft';companionTab='recommend';closeOverlay();render();queueCompanionRecommendation();return;}
 if(action==='active-hero-prepare'){
  if(!activeCreativePlan?.members.some(m=>m.champion===el.dataset.id&&m.role===el.dataset.role))throw Error('组合已变化，请重新选择');
  await prepareHeroClick({id:el.dataset.id,role:el.dataset.role,mode:'rift',...creativeComboContext(creativeMemberCombo(activeCreativePlan,el.dataset.id,el.dataset.role))});return;
 }
 if(action==='player-flow-settings'){closeOverlay();overlay.innerHTML=playerFlowSettings(saved.preferences,windowLayout);return;}
 if(action==='window-fold'){await api.windowLayoutControl('fold');return;}
 if(['window-follow','window-reset-side','window-reset-all'].includes(action)){await saveChain;const operation=action==='window-follow'?'follow':action==='window-reset-side'?'reset-side':'reset-all';acceptWindowLayout(await api.windowLayoutControl(operation));if(operation!=='follow'){saved.preferences.companionWidth=440;savedBase.preferences.companionWidth=440;}overlay.innerHTML=playerFlowSettings(saved.preferences,windowLayout);toast(operation==='follow'?'侧栏已重新跟随客户端':'已恢复默认窗口布局');return;}
 if(action==='player-flow-toggle'){const field=el.dataset.field;if(!['clickPrepare','autoArrange','autoParty','compactTeam'].includes(field))throw Error('设置项不正确');const settingsPanel=overlay.firstElementChild;saved.preferences[field]=saved.preferences[field]===false;await persist({throwOnError:true});render();if(overlay.firstElementChild===settingsPanel)overlay.innerHTML=playerFlowSettings(saved.preferences);await sync(false,{fresh:true});return;}
 if(action==='room-connect-focus'){document.querySelector('#room-connection')?.scrollIntoView({block:'start'});return;}
 if(action==='client-prepare'){await useClientPreparation(el);return;}
 if(action==='room-own-edit'){const plan=roomOwnPreparation();if(!plan)throw Error('请先选择自己的英雄与位置');showBuild(plan.selection.id,plan.selection.role,plan.selection.mode,plan.selection);return;}
 if(action==='room-combinations'){closeOverlay();comboView={kind:'trios',style:'all',query:'',fit:false,source:'all',configured:false};overlay.innerHTML=combinationDialog(data,comboView,slots);document.querySelector('#combo-search')?.focus();return;}
 if(action==='room-copy-plan'){const share=roomSharePayload();if(!share?.configurations?.length)throw Error('请先准备阵容');await api.copy(share.configurations.map(c=>roomConfigurationText(c,data,'本机方案',share.strategy)).join('\n\n'));toast('配合与配置已复制');return;}
 if(action==='room-host'){if(!api.roomHost)throw Error('局域网房间请在桌面版使用');if(roomBusy)return;roomBusy=true;roomError='';render();try{room=await api.roomHost(roomNickname());roomAddresses=await api.roomAddresses?.()||[];roomShareSig='';roomShareWarned=false;await publishRoomShare({force:true});toast('房间已创建，把邀请码和口令发给队友');}catch(error){roomError=roomErrorMessage(error);}finally{roomBusy=false;}render();return;}
 if(action==='room-scan'){if(!api.roomScan)throw Error('局域网房间请在桌面版使用');if(roomScanning)return;roomScanning=true;roomScanResults=null;roomError='';render();try{roomScanResults=await api.roomScan();}catch(error){roomError=roomErrorMessage(error);}finally{roomScanning=false;}render();return;}
 if(action==='room-refresh-addresses'){roomAddresses=await api.roomAddresses?.()||[];render();toast('已刷新本机地址');return;}
 if(action==='room-fill'){roomInvite=el.dataset.invite||'';roomError='';render();return;}
 if(action==='room-join'){if(!api.roomJoin)throw Error('局域网房间请在桌面版使用');if(roomBusy)return;const target=decodeRoomInvitation(roomInvite.trim());if(!target)throw Error('粘贴房主复制的完整邀请，或输入 192.168.1.5:47833#482913');const secret=target.pin||roomPin.trim();if(!validPin(secret))throw Error('口令是 6 位数字');roomBusy=true;roomError='';render();try{room=await api.roomJoin({host:target.host,port:target.port,room:target.room,pin:secret},roomNickname());roomShareSig='';roomShareWarned=false;await publishRoomShare({force:true});}catch(error){roomError=roomErrorMessage(error);}finally{roomBusy=false;}render();return;}
 if(action==='room-leave'){if(!api.roomLeave)throw Error('局域网房间请在桌面版使用');room=await api.roomLeave();roomScanResults=null;roomError='';roomShareSig='';roomShareWarned=false;render();toast('已离开房间');return;}
 if(action==='room-transport'){roomTransport=el.dataset.id==='relay'?'relay':'lan';roomError='';render();return;}
 if(action==='room-relay-join'){
  if(!api.roomRelay)throw Error('中继房间请在桌面版使用');
  // The address is handed over as typed: the service explains exactly why a
  // given one is unusable, which a second, vaguer check here would only hide.
  if(!validRoomCode(roomRelayRoom.trim()))throw Error('房间码是 6 位数字');
  if(!validPin(roomPin.trim()))throw Error('口令是 6 位数字');
  if(roomBusy)return;
  roomBusy=true;roomError='';render();
  try{room=await api.roomRelay({url:roomRelayUrl.trim(),room:roomRelayRoom.trim(),pin:roomPin.trim()},roomNickname());roomShareSig='';roomShareWarned=false;await publishRoomShare({force:true});toast('已加入中继房间');}
  catch(error){roomError=roomErrorMessage(error);}
  finally{roomBusy=false;}
  render();return;}
 if(action==='propose-result'){
 const r=results[Number(el.dataset.index)];if(!r||resultsSignature!==recommendationKey(recommendationInput()))throw Error('候选已变化，请重新推荐');
 if(!room||room.mode==='idle'){closeOverlay();if(windowLayout.docked)companionTab='room';else route='room';render();toast('连接组队房间后即可提议阵容');return;}
 const proposal=roomResultProposal(r);
 room=await api.roomBallot({version:1,proposal,addVote:proposalKey(proposal)});render();toast('已提议并投票，等待队友选择');return;
 }
 if(action==='room-ballot-details'){
 const row=roomBallotBoard(room,publicDraftContext(),data.champions,{scope,soloRole:taskOwnRole(),clientSession:client.connected?client.session:null,party:currentParty(),includePreselected:saved.preferences.includePreselected===true}).find(r=>r.key===el.dataset.key);if(!row)throw Error('候选已撤回');
 closeOverlay();overlay.innerHTML='<div class="modal-backdrop" data-backdrop="true"><section class="modal" role="dialog" aria-modal="true" aria-label="候选阵容详情"><header class="modal-header"><h3>'+e(row.from)+'的提议</h3>'+button('close','','close','quiet icon-only','aria-label="关闭"')+'</header><div class="modal-body"><p>'+e(row.proposal.strategy?.why||row.proposal.strategy?.name||'分路搭配')+'</p>'+row.proposal.lineup.filter(s=>s.champion).map(s=>'<div class="setting-row"><b>'+e(champ(s.champion)?.name||s.champion)+' · '+roleName(s.role)+'</b>'+button('room-ballot-hero','查看配置','','small','data-key="'+e(row.key)+'" data-id="'+e(s.champion)+'" data-role="'+s.role+'" data-readonly="true"')+'</div>').join('')+'<p class="bottom-note">'+e(row.fit.reason)+'</p>'+button('room-adopt-ballot','采用整套方案','','small','data-key="'+e(row.key)+'"')+'</div></section></div>';return;
 }
 if(action==='room-ballot-hero'){
 if(el.dataset.readonly!=='true'&&memberHeroAction(el.dataset.id,el.dataset.role).blocked)throw Error('英雄已锁定，不能选择其他英雄；仍可提议和投票');
 const row=roomBallotBoard(room,publicDraftContext(),data.champions,{scope,soloRole:taskOwnRole(),clientSession:client.connected?client.session:null,party:currentParty(),includePreselected:saved.preferences.includePreselected===true}).find(r=>r.key===el.dataset.key);if(!row)throw Error('候选已撤回');
 const config=row.proposal.configurations?.find(c=>c.champion===el.dataset.id&&c.role===el.dataset.role);
 if(config&&el.dataset.readonly!=='true'&&memberHeroAction(el.dataset.id,el.dataset.role).prepare){clickedRoomPlan={ballotKey:row.key,id:el.dataset.id,role:el.dataset.role};await useClientPreparation({dataset:{preparationView:'incoming-ballot'}},true);}
 else if(config){closeOverlay();roomConfigurationView={config:structuredClone(config),from:row.from,strategy:row.proposal.strategy?structuredClone(row.proposal.strategy):null,localStrategy:captureRoomStrategy(slots,data,activeCreativePlan,config.mode)};overlay.innerHTML=roomConfigurationDialog(roomConfigurationView.config,data,row.from,roomConfigurationView.strategy,{localStrategy:roomConfigurationView.localStrategy});}
 else if(el.dataset.readonly!=='true'&&memberHeroAction(el.dataset.id,el.dataset.role).prepare){const combo=row.proposal.strategy&&creativeMemberCombo(row.proposal.strategy,el.dataset.id,el.dataset.role);await prepareHeroClick({id:el.dataset.id,role:el.dataset.role,mode:'rift',...creativeComboContext(combo)});}
 else{closeOverlay();overlay.innerHTML=roomMissingConfigurationDialog({id:el.dataset.id,role:el.dataset.role,mode:'rift',nick:row.from,champ});}return;
 }
 if(action==='room-vote'){
 room=await api.roomBallot({version:1,toggleVote:el.dataset.key});render();return;
 }
 if(action==='room-adopt-ballot'){
 const row=roomBallotBoard(room,publicDraftContext(),data.champions,{scope,soloRole:taskOwnRole(),clientSession:client.connected?client.session:null,party:currentParty(),includePreselected:saved.preferences.includePreselected===true}).find(r=>r.key===el.dataset.key);if(!row)throw Error('候选已撤回');
 if(client.connected&&client.phase==='ChampSelect'){await sync(false,{fresh:true});if(!client.connected||client.phase!=='ChampSelect'||!client.session)throw Error('无法确认本局选人，请重新同步');}
 const current=roomBallotBoard(room,publicDraftContext(),data.champions,{scope,soloRole:taskOwnRole(),clientSession:client.connected?client.session:null,party:currentParty(),includePreselected:saved.preferences.includePreselected===true}).find(r=>r.key===el.dataset.key);if(!current)throw Error('候选已撤回，请重新选择');preservePlayerPosition();
 const adopted=adoptRoomLineup({kind:'state',v:1,from:current.from,...current.proposal,pick:null,at:Date.now()},data,slots,client,localPickEligibility(client,slots,data.champions,{scope:'party',soloRole,playerPosition:saved.draft?.playerPosition}),{...clientSyncOptions(),ownRole:taskOwnRole()});
 slots=adopted.slots;unassigned=adopted.unassigned;activeCreativePlan=adopted.creativePlan;lastTaskSelection=null;draftComparing=false;scope='party';for(const selection of adopted.configurations)preparations.remember(selection);
 creativePlanNotice=[adopted.conflicts.length?'已保留本局选人或手动位置，未完全采用提议。':'',adopted.configurationErrors.length?'有'+adopted.configurationErrors.length+'套发送方配置与当前资料不符，保留本机参考。':'',!current.proposal.configurations?.length?'未收到具体配置，使用本机参考。':''].filter(Boolean).join(' ');
 cancelRecommendation();results=[];offset=0;companionPreview=null;companionTab='recommend';await persist({throwOnError:true});render();if(await publishRoomShare({force:true}))await confirmRoomAdoption(current,adopted);else creativePlanNotice=[creativePlanNotice,'本机方案已保存，房间同步失败，请检查连接后重新采用。'].filter(Boolean).join(' ');render();toast('已采用阵容'+(adopted.configurations.length?'及 '+adopted.configurations.length+' 套发送方配置':'；使用本机配置参考')+'。'+creativePlanNotice,!!creativePlanNotice);return;
 }
 if(action==='room-publish'){if(!await publishRoomShare({force:true}))throw Error('分享失败，请检查房间连接后重试');toast('已分享当前阵容');return;}
 if(action==='room-copy-relay'){const text=room?.auto?`开黑搭子组队房间｜中继 ${room?.relayUrl||''}｜房间 ${room?.room||''}｜口令 ${room?.pin||''}`:`开黑搭子中继房间｜中继 ${room?.relayUrl||''}｜房间 ${room?.room||''}`;await api.copy(text);toast(room?.auto?'地址、房间码和口令已复制；可直接发给队友手动加入':'地址和房间码已复制；口令请另行告知');return;}
 if(action==='room-copy-invite'){await api.copy(`开黑搭子房间 ${room?.room||''}｜邀请码 ${el.dataset.invite}｜口令 ${room?.pin||''}`);toast('邀请信息已复制');return;}
 if(action==='room-file-export'){
  if(!api.exportPreparation)throw Error('准备文件请在桌面版使用');if(preparationFileBusy)return;
  const snapshot=preparationShare({...roomSharePayload(),from:roomNickname(),at:Date.now()});preparationFileBusy=true;render();
  try{if(await api.exportPreparation(snapshot))toast('准备文件已导出；请自行发给队友，助手不会上传');}catch(error){toast(roomErrorMessage(error),true);}finally{preparationFileBusy=false;render();}return;
 }
 if(action==='room-file-import'){
  if(!api.importPreparation)throw Error('准备文件请在桌面版使用');if(preparationFileBusy)return;preparationFileBusy=true;render();
  try{const incoming=await api.importPreparation();if(incoming){roomPreparationFile=preparationShare(incoming);closeOverlay();overlay.innerHTML=roomPreparationFileDialog(roomPreparationFile,champ);toast('准备文件已打开；先核对再采用');}}catch(error){toast(roomErrorMessage(error),true);}finally{preparationFileBusy=false;render();}return;
 }
 if(action==='room-file-preview'){if(!roomPreparationFile)throw Error('尚未打开准备文件');closeOverlay();overlay.innerHTML=roomPreparationFileDialog(roomPreparationFile,champ);return;}
 if(action==='room-file-build'){
  const config=roomPreparationFile?.configurations.find(c=>c.champion===el.dataset.id&&c.role===el.dataset.role);if(!config)throw Error('文件中没有这位成员配置，请重新打开文件');
  closeOverlay();roomConfigurationView={config:structuredClone(config),from:'准备文件 · '+roomPreparationFile.from,strategy:roomPreparationFile.strategy?structuredClone(roomPreparationFile.strategy):null,localStrategy:captureRoomStrategy(slots,data,activeCreativePlan,config.mode)};
  overlay.innerHTML=roomConfigurationDialog(roomConfigurationView.config,data,roomConfigurationView.from,roomConfigurationView.strategy,{localStrategy:roomConfigurationView.localStrategy,fromFile:true});return;
 }
 if(action==='room-prepare'){
  if(!memberHeroAction(el.dataset.id,el.dataset.role).prepare)throw Error('当前选人已变化，请先查看配置；队友已选英雄不会替你预选。');
  const member=room?.members.find(m=>m.nick===el.dataset.member),config=member?.share?.configurations?.find(c=>c.champion===el.dataset.id&&c.role===el.dataset.role);
  if(!member?.share?.lineup.some(c=>c.champion===el.dataset.id&&c.role===el.dataset.role))throw Error('队友阵容已变化，请重新选择');
  if(config){clickedRoomPlan={member:member.nick,id:config.champion,role:config.role};const plan=selectedClientPreparation('incoming-room');if(!plan)throw Error('配置已变化');const result=await useClientPreparation({dataset:{preparationView:'incoming-room'}},true);if(result.complete)toast('已预选并应用队友符文、D/F 和装备集；锁定请在客户端确认。');}
  else{if(member.share.mode!=='rift')throw Error('收到的模式未确认或不支持，先查看队友分享');const combo=member.share.strategy&&creativeMemberCombo(member.share.strategy,el.dataset.id,el.dataset.role);companionPreview={id:el.dataset.id,role:el.dataset.role,mode:'rift',...creativeComboContext(combo)};companionTab='plan';render();const result=await useClientPreparation({dataset:{preparationView:'companion'}},true);if(result.complete)toast('只收到阵容，已按本机默认参考预选并配置；未收到队友的具体配置。');}return;
 }
 if(action==='room-adopt-lineup'){
  const member=room?.members.find(m=>m.nick===el.dataset.member),identity=member?.share&&roomLineupIdentity(member.share,member.nick);
  if(!identity||identity!==el.dataset.share)throw Error('队友阵容已变化，请重新核对再采用');
  if(client.connected&&client.phase==='ChampSelect'){await sync(false,{fresh:true});if(!client.connected||client.phase!=='ChampSelect'||!client.session)throw Error('无法确认本局选人，已保留当前阵容');}
  const current=room?.members.find(m=>m.nick===el.dataset.member);if(!current?.share||roomLineupIdentity(current.share,current.nick)!==identity)throw Error('队友刚更新了阵容，请重新查看再采用');
  preservePlayerPosition();const availability=localPickEligibility(client,slots,data.champions,{scope:'party',soloRole,playerPosition:saved.draft?.playerPosition});
  const adopted=adoptRoomLineup({...current.share,kind:'state',v:1,from:current.nick},data,slots,client,{eligibleByRole:availability.eligibleByRole,confirmedPick:availability.confirmedPick},{...clientSyncOptions(),ownRole:taskOwnRole()});
  slots=adopted.slots;unassigned=adopted.unassigned;activeCreativePlan=adopted.creativePlan;lastTaskSelection=null;draftComparing=false;scope='party';
  for(const selection of adopted.configurations)preparations.remember(selection);
  const conflicts=adopted.conflicts.filter(c=>c.role).map(c=>roleName(c.role)+'的'+(champ(c.champion)?.name||c.champion));
  creativePlanNotice=[conflicts.length?'未采用'+conflicts.join('、')+'，已保留本局已选或手动安排。':'',adopted.conflicts.some(c=>c.kind==='plan')?'成员不一致，未采用发送方组合职责。':'',adopted.configurationErrors.length?'有'+adopted.configurationErrors.length+'套发送方配置与当前资料不符，保留本机参考。':''].filter(Boolean).join(' ');
  cancelRecommendation();results=[];offset=0;companionPreview=null;companionTab='recommend';closeOverlay();await persist({throwOnError:true});lastAdoptedRoomShare=identity;companionScroll.delete('recommend');render();await publishRoomShare({force:true});
  toast('已采用'+adopted.loadedMembers+'位阵容成员'+(adopted.configurations.length?'及'+adopted.configurations.length+'套发送方配置':'；未收到可用配置，使用本机参考')+'；点击自己的英雄预选并配置。'+(adopted.modeAssumed?'本次按当前峡谷选人采用。':''),!!creativePlanNotice);return;
 }
 if(action==='room-build'){const member=room?.members.find(m=>m.nick===el.dataset.member),config=member?.share?.configurations?.find(s=>s.champion===el.dataset.id&&s.role===el.dataset.role);if(config){closeOverlay();roomConfigurationView={config:structuredClone(config),from:member.nick,strategy:member.share.strategy?structuredClone(member.share.strategy):null,localStrategy:captureRoomStrategy(slots,data,activeCreativePlan,config.mode)};overlay.innerHTML=roomConfigurationDialog(roomConfigurationView.config,data,member.nick,roomConfigurationView.strategy,{localStrategy:roomConfigurationView.localStrategy});}else{closeOverlay();overlay.innerHTML=roomMissingConfigurationDialog({id:el.dataset.id,role:el.dataset.role,mode:el.dataset.mode||null,nick:member?.nick||el.dataset.member||'队友',champ});}return;}
 if(action==='room-local-reference'){const {id,role,mode}=el.dataset;if(!['rift','hex'].includes(mode))throw Error('请先选择本机参考模式');closeOverlay();showBuild(id,role,mode,{readOnly:!taskOwnRole()||taskOwnRole()!==role});toast('本机配置参考；不代表队友所选');return;}
 if(action==='room-copy-configuration'){if(!roomConfigurationView)throw Error('共享配置已变化，请重新打开');await api.copy(roomConfigurationText(roomConfigurationView.config,data,roomConfigurationView.from,roomConfigurationView.strategy));toast('发送方配置已复制');return;}
 if(action==='room-configuration-jump'){
  const section=overlay.querySelector(`[data-room-section="${el.dataset.section}"]`);
  if(section){section.style.scrollMarginTop=((overlay.querySelector('.modal-header')?.getBoundingClientRect().height||84)+16)+'px';section.scrollIntoView({block:'start'});}return;
 }
 if(action==='room-adopt-configuration'){if(!roomConfigurationView)throw Error('共享配置已变化，请重新打开');const localStrategy=captureRoomStrategy(slots,data,activeCreativePlan,roomConfigurationView.config.mode);if((localStrategy?.id||'')!==(roomConfigurationView.localStrategy?.id||''))throw Error('本机组合已变化，请重新打开共享配置再采用');const selection=roomPreparation(roomConfigurationView.config,data,roomConfigurationView.strategy,{localStrategy});showBuild(selection.id,selection.role,selection.mode,{...selection,readOnly:!taskOwnRole()||taskOwnRole()!==selection.role});roomConfigurationView=null;toast('已载入本机配置参考');return;}
 if(action.startsWith('catalog-')&&!boot.desktop)throw Error('组合库管理请在桌面版使用');
 if(action==='navigate'){if(route==='ongoing'&&el.dataset.route!=='ongoing')ongoing.stop();route=el.dataset.route;closeOverlay();render();if(route==='ongoing')ongoing.start();window.scrollTo(0,0);}
 else if(action==='catalog-import'||action==='catalog-check'){if(catalogBusy)return;catalogBusy=true;const request=++catalogRequest;try{const preview=action==='catalog-import'?await api.catalogPreview():await api.catalogCheck();if(preview&&request===catalogRequest){closeOverlay();catalogPreview=preview;overlay.innerHTML=catalogPreviewDialog(preview);}}finally{catalogBusy=false;}}
 else if(action==='catalog-source'){catalogRequest++;const result=await api.catalogSource(document.querySelector('#catalog-url').value.trim());useCatalogResult(result);toast('组合库地址已保存');}
 else if(action==='catalog-apply'){if(catalogBusy)return;catalogBusy=true;const request=++catalogRequest;try{const result=await api.catalogApply(catalogPreview?.token);useCatalogResult(result);if(request===catalogRequest)closeOverlay();toast('组合库已更新，推荐与配置已同步');}finally{catalogBusy=false;}}
 else if(action==='catalog-rollback'){const request=++catalogRequest;useCatalogResult(await api.catalogRollback());if(request===catalogRequest)closeOverlay();toast('已回退组合库，自定义组合保留');}
 else if(action==='catalog-export'){if(await api.catalogExport())toast('组合库已导出');}
 else if(action==='catalog-manage'){closeOverlay();route='settings';render();document.querySelector('.catalog-panel')?.scrollIntoView({block:'start'});}
 else if(action==='catalog-edit'||action==='catalog-edit-entry'){const entry=action==='catalog-edit-entry'?[...TRIOS,...DUOS].find(c=>c.id===el.dataset.id):null;closeOverlay();catalogEditorKind=entry&&comboMembers(entry).length===2?'duo':'trio';overlay.innerHTML=catalogEditorDialog(data,catalogEditorKind,entry);}
 else if(action==='catalog-editor-kind'){catalogRequest++;catalogEditorKind=el.dataset.kind;overlay.innerHTML=catalogEditorDialog(data,catalogEditorKind);}
 else if(action==='catalog-save'){event.preventDefault();const form=document.querySelector('#catalog-form');if(!form||form.dataset.saving||!form.reportValidity())return;form.dataset.saving='true';const saveButton=overlay.querySelector('[data-action=catalog-save]');saveButton.disabled=true;try{const request=++catalogRequest;const values=Object.fromEntries(new FormData(form)),read=key=>String(values[key]||'').trim();const previous=[...TRIOS,...DUOS].find(c=>c.id===form.dataset.entry),entry=personalCombo({previous,kind:catalogEditorKind,values,patch:data.patch,today:new Date().toLocaleDateString('sv-SE'),id:form.dataset.entry||'local-'+crypto.randomUUID()});if(!previous||read('review-current'))entry.reviewBaseline=reviewBaseline(entry,data.catalog,data);useCatalogResult(await api.catalogPersonal(entry));if(request===catalogRequest)closeOverlay();toast('自定义组合已保存，并加入推荐');}finally{delete form.dataset.saving;saveButton.disabled=false;}}
 else if(action==='catalog-json'){closeOverlay();overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal catalog-modal" role="dialog" aria-modal="true" aria-label="编辑组合数据包"><header class="modal-header"><div><h2>编辑组合数据包</h2><p>适合整理新来源、专用出装与完整符文；检查通过后先预览变化。</p></div>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="panel-body"><textarea id="catalog-json" class="catalog-json" aria-label="组合库 JSON">${e(JSON.stringify(data.catalog,null,2))}</textarea>${button('catalog-validate','检查并预览','check','primary')}</div></section></div>`;}
 else if(action==='catalog-validate'){const request=++catalogRequest,raw=document.querySelector('#catalog-json').value,preview=await api.catalogPreview(raw);if(request!==catalogRequest)return;catalogPreview=preview;overlay.innerHTML=catalogPreviewDialog(preview);}
 else if(action==='combo-member')showBuild(el.dataset.id,el.dataset.role,'rift',{comboId:el.dataset.combo});
 else if(action==='load-trio'){const t=TRIOS.find(t=>t.id===el.dataset.id);if(!t)throw Error('组合已变化');await loadCatalogCombo(t,'context');}
 else if(action==='role-pools')rolePoolsDialog();
 else if(action==='role-pool-edit')openPicker('rolepool',el.dataset.role);
 else if(action==='replace-member'){
   if(generating)return;if(!results[Number(el.dataset.index)]||resultDraftSignature!==recommendationKey(recommendationInput()))throw Error('推荐条件已变化，请重新推荐');
   const run=++recommendationRun,input=recommendationInput(),signature=recommendationKey(input);input.replace={result:results[Number(el.dataset.index)],role:el.dataset.role};generating=true;render();
   try{const next=await calculateRecommendation(input);if(run!==recommendationRun||signature!==recommendationKey(recommendationInput()))return;if(!next.length)throw Error('没有可替换英雄，请调整英雄池；原方案已保留');for(const r of next)resultCreativePlan(r);results=next;resultsSignature=signature;closeOverlay();generating=false;render();showResult(0);}
   catch(error){if(!error.cancelled)toast(error.message+'；原方案已保留，可调整英雄池后重试',true);}
   finally{if(run===recommendationRun){generating=false;render();}}
  }
 else if(action==='go-draft'){route='draft';render();}
 else if(action==='draft-scope'){scope=el.dataset.scope;draftComparing=true;companionTab='recommend';invalidate();}
 else if(action==='draft-style'){if(!['balanced','fun','wild'].includes(el.dataset.style))return;style=el.dataset.style;invalidate();}
 else if(action==='more-candidates'){showAllCandidates=!showAllCandidates;render();}
 else if(action==='combination-library'){closeOverlay();comboView={kind:'duos',style:'all',query:'',fit:false,source:'all',configured:false};overlay.innerHTML=combinationDialog(data,comboView,slots);document.querySelector('#combo-search')?.focus();}
 else if(action==='combo-kind'){comboView.kind=el.dataset.kind;overlay.innerHTML=combinationDialog(data,comboView,slots);}
 else if(action==='load-duo'){const d=DUOS.find(d=>d.id===el.dataset.id);if(!d)throw Error('组合已变化，请重新打开组合库');await loadCatalogCombo(d,comboMembers(d).every(m=>['bottom','support'].includes(m.role))?'bot':'party');}
 else if(action==='move-slot'){const from=slots.find(s=>s.role===el.dataset.role);overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal" style="width:470px" role="dialog" aria-modal="true" aria-label="移动英雄位置"><header class="modal-header"><h3>把 ${e(champ(from.champion).name)} 放到哪里？</h3>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="panel-body"><p class="section-copy">已有英雄会交换位置，“我们 / 队友”留在原位置。</p><div class="chips">${slots.filter(s=>s.role!==from.role).map(s=>button('move-confirm',roleName(s.role)+(s.champion?' · 交换'+e(champ(s.champion).name):''),'','',`data-from="${from.role}" data-role="${s.role}"`)).join('')}</div></div></section></div>`;}
 else if(action==='move-confirm'){slots=moveChampion(slots,el.dataset.from,el.dataset.role);closeOverlay();invalidate();toast('英雄位置已调整');}
 else if(action==='style'){style=el.dataset.style;invalidate();}
 else if(action==='pregame-clear')await cancelPregameHero();
 else if(action==='pregame-hero')openPicker('preselection',saved.draft?.preselection?.role||taskOwnRole()||null);
 else if(action==='pick-hex')openPicker('hex');
 else if(action==='hero-pool')openPicker('pool');
 else if(action==='exclusions')openPicker('excluded');
 else if(action==='back-result'){const origin=buildReturn;closeOverlay();if(origin&&origin.signature===recommendationKey(recommendationInput())&&results[origin.index]?.id===origin.id){showResult(origin.index);overlay.querySelector('.drawer-content').scrollTop=origin.scroll;}else toast('原方案已变化，请重新推荐',true);}
  else if(action==='close')closeOverlay();
 else if(action==='picker-role'){picker.filter=el.dataset.role;renderPicker();document.getElementById('picker-search')?.focus();}
 else if(action==='pick-champion'){const id=el.dataset.id;if(picker.kind==='rolepool'){const pool=saved.preferences.rolePools[picker.role];pool.heroes=pool.heroes.includes(id)?pool.heroes.filter(x=>x!==id):[...pool.heroes,id];invalidate();renderPicker();}else if(picker.kind==='pool'){saved.preferences.pool=saved.preferences.pool.includes(id)?saved.preferences.pool.filter(x=>x!==id):[...saved.preferences.pool,id];invalidate();renderPicker();}else if(picker.kind==='excluded'){saved.excluded=saved.excluded.includes(id)?saved.excluded.filter(x=>x!==id):[...saved.excluded,id];invalidate();renderPicker();}else if(picker.kind==='preselection'){const role=picker.role||taskOwnRole()||profile(champ(id)).roles[0];if(pregamePhase(client.phase)){closeOverlay();await stagePregameIntent({champion:id});render();}else{closeOverlay();await prepareHeroClick({id,role,mode:'rift'});}return;}else if(picker.kind==='hex'){if(hexHero!==id){hexOptions=[];hexOwned=[];}hexHero=id;closeOverlay();render();maybeRefreshBuild(id,profile(champ(id)).roles[0],'hex');}}
 else if(action==='solo-role'){setCompanionRole(el.dataset.role);}
 else if(action==='position-auto'){setCompanionRole('');}
 else if(action==='toggle-party'){const s=slots.find(s=>s.role===el.dataset.role);s.party=!s.party;s.partyManual=true;if(client.phase==='ChampSelect'||validPartyCount(saved.draft?.partyCount))saved.draft={...saved.draft,partyCount:markedPartyCount(slots)};const rangeEdit=client.connected&&client.phase==='ChampSelect'?{role:s.role,checked:s.party,gameId:publicClientGameId(client),cellId:client.session?.localPlayerCellId}:null;const membersOpen=!!overlay.querySelector('.task-members-dialog');invalidate({rangeEdit});if(membersOpen)renderTaskMembers();}
 else if(action==='toggle-lock'){const s=slots.find(s=>s.role===el.dataset.role);guardClientSlot(s);s.locked=!s.locked;invalidate();}
 else if(action==='clear-slot'){const s=slots.find(s=>s.role===el.dataset.role);guardClientSlot(s);s.champion=null;s.locked=false;delete s.clientCellId;delete s.manualPosition;if(client.session)unassigned=unassignedPublicPicks(slots,client.session,data.champions);invalidate();}
 else if(action==='reset-draft'){slots=slots.map(s=>selectedInClient(s)?{...s,locked:true}:clearDraftPicks([s])[0]);unassigned=unassignedPublicPicks(slots,client.session,data.champions);recommendationError='';invalidate();toast('未选定的英雄已清空，客户端已选英雄和位置保留');}
 else if(action==='reset-party'){const defaults=createSlots();slots=slots.map(s=>({...s,party:defaults.find(d=>d.role===s.role).party}));invalidate();toast('位置归属已恢复为中单、下路、辅助；英雄保留');}
 else if(action==='example'){if(slots.some(selectedInClient))throw Error('当前已有客户端选人，示例会覆盖阵容；请在空阵容时使用。');scope='context';slots=createSlots();slots[0]={...slots[0],champion:'Garen',locked:true};slots[1]={...slots[1],champion:'LeeSin',locked:true};invalidate();toast('已载入示例：队友选了盖伦和李青，你们补中下辅');}
 else if(action==='recommend'||action==='reroll'){await generate(action==='reroll');if(windowLayout.docked){const list=document.querySelector('[data-companion-disclosure="other-recommendations"]');if(list){list.open=true;list.scrollIntoView({block:'start'});}}}
 else if(action==='result-detail')showResult(Number(el.dataset.index));
 else if(action==='party-route'){const index=Number(el.dataset.index),result=results[index];if(!result||resultsSignature!==recommendationKey(recommendationInput()))throw Error('选人已变化，请重新推荐');const original=result.preparationOrigin||resultCreativePlan(result),plan=selectPartyRoute(resultCreativePlan(result),el.dataset.route),reopen=!!detailResult,strategy=plan.members.length===result.analysis.members.length?strategySummary(result.analysis,{tempo:plan.tempo,why:plan.why,risk:plan.caution},saved.preferences.play.tempo,summarizeEnemyTraits(publicMatchupIds(),data.champions)):result.strategy;results[index]={...result,preparationOrigin:original,title:plan.name,reason:plan.why,reasonPoints:[plan.why],strategy,creativePlan:plan,adaptive:plan.shared,trio:null,duo:null,creative:null,origin:'adaptive'};closeOverlay();render();if(reopen)showResult(index);toast('已切换方案内行动路线，点击“就试这套”采用');}
 else if(action==='use-result'){await adoptResult(Number(el.dataset.index));const shared=await publishRoomShare({force:true});toast(shared?'已采用并分享；点自己的英雄准备配置':'已采用；点自己的英雄准备配置');}
  else if(action==='open-guide'){if(buildView?.readOnly)throw Error('当前是只读配置，请回到本人的准备操作打开指引');const identity=preparationIdentity(buildSelection());await matchupFocusChain;await guideSyncChain;await saveChain;if(!buildView||preparationIdentity(buildSelection())!==identity)throw Error('配置窗口已变化，请重新打开当前英雄的指引');const selection={...buildSelection(),augmentIds:buildView.mode==='hex'&&hexHero===buildView.id?hexSelected:buildView.augmentIds||[],compareIds:buildView.mode==='hex'&&hexHero===buildView.id?hexOptions:buildView.compareIds||[],ownedAugmentIds:buildView.mode==='hex'&&hexHero===buildView.id?hexOwned:buildView.ownedAugmentIds||[]};await openPreparedGuide(selection);if(buildView)renderBuild();toast('指引已打开；游戏中 Ctrl + Shift + H 切换穿透与交互');}
  else if(action==='guide-current'){await matchupFocusChain;await guideSyncChain;await saveChain;const prepared=myPreparation();await openPreparedGuide(prepared?.selection);}
 else if(action==='my-runes'){
  const selected=myPreparation();if(!selected?.build.runePage||selected.own.id!==el.dataset.id)throw Error('选人已变化，请核对当前英雄');
  if(selected.positionKnown===false)throw Error('请先确认本人位置，再应用符文');
  if(runeApplying||clientPreparing)throw Error('正在应用配置，请等待本次操作完成');runeApplying=true;const ticket=runeAppliedKeys.begin(runeApplicationKey(selected.own.id,selected.build.role,selected.build.runePage));reflectRunePending();
  try{await sync(false,{fresh:true});const current=myPreparation();if(!runeAppliedKeys.isCurrent(ticket)||!client.connected||current?.positionKnown===false||current?.own.id!==selected.own.id)throw Error('选人会话已变化，请核对当前英雄后重新应用');if(runeApplicationKey(current.own.id,current.build.role,current.build.runePage)!==runeApplicationKey(selected.own.id,selected.build.role,selected.build.runePage))throw Error('推荐方案已变化，请核对后重新应用');const page=structuredClone(current.build.runePage);if(await applyPreparedRunes(page,ticket))returnToTeamAfterPreparation(current.selection);}catch(error){runeAppliedKeys.clear();throw error;}finally{runeApplying=false;render();if(buildView)renderBuild();}
 }
 else if(action==='my-build'){const own=currentPlayerSelection(client.session,data.champions,slots);if(own){if(client.mode?.id==='aram')throw Error('普通大乱斗暂未提供专用配置，请手动查询参考');if(!['rift','hex'].includes(client.mode?.id))throw Error('客户端模式尚未确认，请在配置库手动选择模式');const prepared=myPreparation();showBuild(own.id,prepared.selection.role,client.mode.id,prepared.selection);}else throw Error('当前没有你已选择的英雄');}
 else if(action==='build'){
  if(el.hasAttribute('data-result-index')){await prepareCandidate(el);return;}
  let selection=el.dataset.combo?{comboId:el.dataset.combo}:{};
  if(el.hasAttribute('data-result-index')){const result=results[Number(el.dataset.resultIndex)];if(!result||resultsSignature!==recommendationKey(recommendationInput()))throw Error('推荐条件已变化，请重新推荐');const plan=resultCreativePlan(result);if(plan)selection=creativeComboContext(creativeMemberCombo(plan,el.dataset.id,el.dataset.role));}
  if(el.dataset.prepareClick==='true'||(el.dataset.mode||'rift')==='rift'&&client.connected&&client.phase==='ChampSelect'){const task=ownTaskPreparation()?.selection;await prepareHeroClick(task?.id===el.dataset.id&&task.role===el.dataset.role?task:{id:el.dataset.id,role:el.dataset.role,mode:'rift',...selection});}
  else showBuild(el.dataset.id,el.dataset.role,el.dataset.mode||'rift',localConfigurationPreview({id:el.dataset.id,role:el.dataset.role,mode:el.dataset.mode||'rift',...selection},client,taskOwnRole()));
 }
 else if(action==='build-partner'&&el.dataset.id){const plan=buildView?.build?.combo?.creativePlan;showBuild(el.dataset.id,el.dataset.role,'rift',{...(plan?.id===el.dataset.combo?creativeComboContext(creativeMemberCombo(plan,el.dataset.id,el.dataset.role)):{comboId:el.dataset.combo}),...localConfigurationPreview({role:el.dataset.role},client,taskOwnRole())});}
 else if(action==='build-partner'){const d=DUOS.find(d=>d.id===el.dataset.combo);if(d){const partner=comboMembers(d).find(m=>m.champion!==buildView.id);if(partner)showBuild(partner.champion,partner.role,'rift',{comboId:d.id,...localConfigurationPreview({role:partner.role},client,taskOwnRole())});}}
 else if(action==='build-shared-reset'){delete buildView.sharedEquipment;renderBuild();}
 else if(action==='build-loadout'){buildView.loadoutId=el.dataset.id;buildView.coreIndex=0;delete buildView.sharedEquipment;delete buildView.runeId;delete buildView.customRunePage;delete buildView.skillId;delete buildView.customSkillOrder;delete buildView.coreId;delete buildView.laterIds;renderBuild();}
 else if(action==='build-quest-plan'){const next=changeCompanionPlan(data,buildSelection(),'quest-plan');delete buildView.sharedEquipment;buildView.bottomQuestPlan=next.bottomQuestPlan;buildView.laterIds=next.laterIds;renderBuild();}
 else if(action==='build-start'||action==='build-boots'){const next=changeCompanionPlan(data,buildSelection(),action==='build-start'?'start':'boots',el.dataset.id);delete buildView.sharedEquipment;for(const key of ['startId','bootsId']){delete buildView[key];if(next[key])buildView[key]=next[key];}renderBuild();}
 else if(action==='build-later'){const next=changeCompanionPlan(data,buildSelection(),'later',el.dataset.id);delete buildView.sharedEquipment;buildView.laterIds=next.laterIds;renderBuild();}
 else if(action==='build-rune'){const next=changeCompanionPlan(data,buildSelection(),'rune',el.dataset.id);delete buildView.customRunePage;Object.assign(buildView,next);renderBuild();}
 else if(action==='build-rune-reset'){delete buildView.runeId;delete buildView.customRunePage;renderBuild();}
 else if(action==='build-jump'){const target=overlay.querySelector(`[data-build-section="${el.dataset.section}"]`);for(let parent=target?.parentElement;parent&&parent!==overlay;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;target?.scrollIntoView({block:'start'});}
 else if(action==='build-mode')showBuild(buildView.id,buildView.role,el.dataset.mode,{conditions:[...buildView.conditions],coreIndex:buildView.coreIndex});
 else if(action==='build-summoner'){editBuildSummoners(el,el.dataset.field,el.dataset.id);}
 else if(action==='build-skill'){const next=changeCompanionPlan(data,buildSelection(),'skill',el.dataset.id||'');delete buildView.customSkillOrder;Object.assign(buildView,next);renderBuild();}
 else if(action==='build-skill-reset'){delete buildView.skillId;delete buildView.customSkillOrder;renderBuild();}
 else if(action==='build-core'){buildView.coreIndex=Number(el.dataset.index);delete buildView.sharedEquipment;delete buildView.coreId;delete buildView.laterIds;renderBuild();}
 else if(action==='refresh-build')await refreshConfiguration(buildView.id,buildView.role,buildView.mode);
 else if(action==='build-condition'){const c=el.dataset.condition;buildView.conditions=buildView.conditions.includes(c)?buildView.conditions.filter(x=>x!==c):[...buildView.conditions,c];renderBuild();}
 else if(action==='apply-runes'){
  if(buildView?.readOnly)throw Error('当前是只读配置，请回到本人的准备操作');
  if(runeApplying||clientPreparing)throw Error('正在应用配置，请等待本次操作完成');
  const page=structuredClone(buildView.build.runePage),viewedHero=buildView.id,viewedRole=buildView.role,knownOwn=currentPlayerSelection(client.session,data.champions,slots)?.id,key=runeApplicationKey(viewedHero,viewedRole,page);
  let ticket=client.connected?runeAppliedKeys.begin(key):null;runeApplying=true;reflectRunePending();
  try{await persist();await guideSyncChain;await sync(!client.connected,{fresh:true});if(!client.connected)throw Error(client.message);if(ticket&&!runeAppliedKeys.isCurrent(ticket))throw Error('选人会话已变化，请核对当前英雄后重新应用');const own=currentPlayerSelection(client.session,data.champions,slots)?.id;if(own&&own!==viewedHero&&own!==knownOwn){renderBuild();toast('已确认你选的是'+champ(own).name+'，当前浏览'+champ(viewedHero).name+'；请核对页面中的符文对象后再点击',true);return;}ticket||=runeAppliedKeys.begin(key);await applyPreparedRunes(page,ticket);}catch(error){runeAppliedKeys.clear();throw error;}finally{runeApplying=false;render();if(buildView)renderBuild();}
 }
 else if(action==='copy-build'){await api.copy(buildAsText(buildView.build,champ(buildView.id),data));toast('配置已复制');}
 else if(action==='favorite-build'){await addFavorite({id:savedBuild(buildView)?.id||buildFavoriteId(buildView),...selectedBuildFields(buildView,{preserveUnavailable:true}),type:'build',title:`${champ(buildView.id).name} · ${buildView.build.title}${buildView.build.selectedRune?' · '+buildView.build.selectedRune.name:''}${buildView.coreIndex?' · 方案 '+(buildView.coreIndex+1):''}`,champion:buildView.id,role:buildView.role,mode:buildView.mode,conditions:buildView.conditions,coreIndex:buildView.coreIndex,...(buildView.mode==='hex'?{augmentIds:[...(buildView.augmentIds||[])],compareIds:[...(buildView.compareIds||[])],ownedAugmentIds:[...(buildView.ownedAugmentIds||[])]}:{})});renderBuild();}
  else if(action==='favorite-result'){const r=results[Number(el.dataset.index)];if(!r)throw Error('推荐已变化，请重新选择');const creativePlan=resultCreativePlan(r);await addFavorite({...(creativePlan?{creativePlan}:{}),id:findSavedTeam(saved.favorites,r,style)?.id||teamFavoriteId(r,style),type:'team',title:r.title,slots:structuredClone(r.slots),configurations:captureTeamConfigurations(r,data,preparations),style,scope:r.scope,...(r.scope==='solo'?{soloRole:r.soloRole||r.targets[0]}:{})});if(detailResult===r){const scroll=overlay.querySelector(".drawer-content")?.scrollTop||0;showResult(Number(el.dataset.index));overlay.querySelector(".drawer-content").scrollTop=scroll;}}
 else if(action==='copy-result'){const r=results[Number(el.dataset.index)];if(!r)throw Error('推荐已变化，请重新选择');resultCreativePlan(r);await api.copy(resultAsText(r,data));toast('组合说明已复制');}
 else if(action==='library-role'){libraryRole=el.dataset.role;render();}
 else if(action==='sync'){if(el.hasAttribute('data-client-connect')&&saved.preferences.autoSync===false){saved.preferences.autoSync=true;await persist({throwOnError:true});}await sync(true);}
 else if(action==='pin'){pinned=await api.togglePin();render();}
 else if(action==='assign-import'){const id=el.dataset.id;overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal" style="width:430px" role="dialog" aria-modal="true" aria-label="安排英雄位置"><header class="modal-header"><h3>把 ${e(champ(id)?.name)} 放在哪路？</h3>${button('close','','close','quiet icon-only')}</header><div class="panel-body"><div class="chips">${slots.filter(s=>!s.champion).map(s=>button('assign-confirm',roleName(s.role),'','',`data-id="${id}" data-role="${s.role}"`)).join('')||'<p>位置已满，请先清空一个位置。</p>'}</div></div></section></div>`;}
 else if(action==='assign-confirm'){const pick=unassigned.find(p=>p.champion===el.dataset.id);slots=assignClientChampion(slots,pick,el.dataset.role);unassigned=unassigned.filter(p=>p!==pick);closeOverlay();invalidate();}
 else if(action==='augment-detail')showAugment(Number(el.dataset.id));
 else if(action==='compare-augment'){const id=Number(el.dataset.id);if(hexOptions.includes(id))hexOptions=hexOptions.filter(x=>x!==id);else{if(hexOptions.length>=3)throw Error('最多比较 3 个实际选项，请先移出一个');hexOptions.push(id);}closeOverlay();route='hex';render();}
 else if(action==='clear-compare'){hexOptions=[];render();}
 else if(action==='own-augment'){const id=Number(el.dataset.id);if(!hexOwned.includes(id)){if(hexOwned.length>=6)throw Error('最多标记 6 个已选强化');hexOwned.push(id);}hexOptions=[];closeOverlay();route='hex';render();toast('已标记为本局已选');}
 else if(action==='remove-owned'){hexOwned=hexOwned.filter(id=>id!==Number(el.dataset.id));render();}
 else if(action==='guide-auto-show'){saved.preferences.guideAutoShow=saved.preferences.guideAutoShow===false;persist();render();}
 else if(action==='auto-live'){saved.preferences.autoLive=saved.preferences.autoLive===false;persist();render();}
 else if(action==='toggle-augment'){const id=Number(el.dataset.id);if(hexSelected.includes(id))hexSelected=hexSelected.filter(x=>x!==id);else{if(hexSelected.length>=5)throw Error('最多保留 5 项备选强化');hexSelected.push(id);}closeOverlay();render();}
 else if(action==='hex-hero-filter'){hexForHero=!hexForHero;hexSelectedOnly=false;render();}
 else if(action==='refresh-hex'){el.disabled=true;try{await refreshConfiguration(hexHero,profile(champ(hexHero)).roles[0],'hex');}finally{el.disabled=false;}}
 else if(action==='hex-selected'){hexSelectedOnly=!hexSelectedOnly;render();}
 else if(action==='save-hex'){if(!hexSelected.length)throw Error('先挑选强化再收藏');await addFavorite({id:hexFavoriteId(),type:'hex',champion:hexHero,title:`${hexHero?champ(hexHero).name:'我的'} · 海克斯灵感`,augments:[...hexSelected],compareIds:[...hexOptions],ownedAugmentIds:[...hexOwned]});}
 else if(action==='delete-favorite'){await changeFavorites(saved.favorites.filter((_,i)=>i!==Number(el.dataset.index)),'已移出收藏');}
 else if(action==='open-team-build'){const f=saved.favorites[Number(el.dataset.index)],selection=f?.type==='team'&&f.configurations?.[Number(el.dataset.member)];if(!selection)throw Error('收藏配置已变化，请重新打开');showBuild(selection.id,selection.role,selection.mode,selection);}
 else if(action==='update-team-favorite'){const index=Number(el.dataset.index),f=saved.favorites[index];if(f?.type!=='team')throw Error('组合收藏已变化');if(f.scope==='solo'&&!f.soloRole)throw Error('旧单人收藏未保存位置，请重新推荐并收藏');const next={...f,configurations:captureTeamConfigurations({...f,targets:f.soloRole?[f.soloRole]:[]},data,preparations),version:data.version};await changeFavorites(saved.favorites.map((favorite,i)=>i===index?next:favorite),'已更新收藏里的成员配置');}
 else if(action==='open-favorite'){const f=saved.favorites[Number(el.dataset.index)];if(f.type==='team'){
   const connectedDraft=client.connected&&client.phase==='ChampSelect';
   if(connectedDraft){await sync(false,{fresh:true});if(!client.connected||client.phase!=='ChampSelect'||!client.session)throw Error('无法确认本局选人，已保留当前阵容，请重新连接后载入');}
   preservePlayerPosition();const availability=localPickEligibility(client,slots,data.champions,{scope:f.scope,soloRole:f.soloRole,playerPosition:saved.draft?.playerPosition});const restored=restoreTeamFavorite(f,slots,data.champions,client.connected&&client.phase==='ChampSelect'?client.session:null,{eligibleByRole:availability.eligibleByRole,confirmedPick:availability.confirmedPick});
   slots=restored.slots;unassigned=restored.unassigned;activeCreativePlan=restored.creativePlan;lastTaskSelection=null;
   creativePlanNotice=restored.conflicts.some(conflict=>conflict.kind==='plan')?'收藏配合与本局成员不一致，原说明仍可在收藏中查看。':'';
   for(const selection of restored.configurations)preparations.remember(selection);
   if(f.scope==='solo')soloRole=restored.markedLocalRole||f.soloRole;else if(f.soloRole)soloRole=f.soloRole;
   style=f.style||'fun';scope=f.scope||'context';route='draft';invalidate();
   const conflicts=restored.conflicts.filter(conflict=>conflict.role).map(conflict=>roleName(conflict.role)+'的'+(champ(conflict.champion)?.name||conflict.champion)+(conflict.reason==='unavailable'?'本局不可选':conflict.reason==='locked'?'与锁定英雄冲突':'与当前安排冲突'));
   toast('已载入 '+restored.loadedMembers+' 位开黑成员 · '+restored.configurations.length+' 套配置'+(conflicts.length?'；'+conflicts.join('、')+'，已保留当前安排；替换手动锁定英雄前请先解锁，公开禁选与敌方占用需另选英雄':'')+(restored.skippedConfigurations?'；'+restored.skippedConfigurations+' 套配置因成员或配合不匹配未载入':''),!!restored.conflicts.length);
  }else if(f.type==='build'){showBuild(f.champion,f.role,f.mode,{conditions:f.conditions||[],coreIndex:f.coreIndex||0,loadoutId:f.loadoutId||'default',runeId:f.runeId||undefined,...(f.customRunePage?{customRunePage:structuredClone(f.customRunePage)}:{}),skillId:f.skillId||undefined,...(f.customSkillOrder?{customSkillOrder:structuredClone(f.customSkillOrder)}:{}),coreId:f.coreId||undefined,startId:f.startId||undefined,bootsId:f.bootsId||undefined,summonerIds:f.summonerIds?[...f.summonerIds]:undefined,sourceOpponent:f.sourceOpponent,sharedEquipment:f.sharedEquipment?structuredClone(f.sharedEquipment):undefined,comboId:f.comboId,...(f.creativePlan?{creativePlan:f.creativePlan}:{}),...(f.bottomQuestPlan?{bottomQuestPlan:true}:{}),...(f.mode==='rift'&&f.laterIds!==undefined?{laterIds:[...f.laterIds]}:{}),...(f.mode==='hex'?{augmentIds:(f.augmentIds||[]).filter(id=>data.augments.some(a=>a.id===id)),compareIds:(f.compareIds||[]).filter(id=>data.augments.some(a=>a.id===id)),ownedAugmentIds:(f.ownedAugmentIds||[]).filter(id=>data.augments.some(a=>a.id===id))}:{})});}else{hexHero=champ(f.champion)?f.champion:null;hexSelected=f.augments.filter(id=>data.augments.some(a=>a.id===id));hexOptions=(f.compareIds||[]).filter(id=>data.augments.some(a=>a.id===id)).slice(0,3);hexOwned=(f.ownedAugmentIds||[]).filter(id=>data.augments.some(a=>a.id===id)).slice(0,6);hexSelectedOnly=true;hexForHero=false;hexQuery='';hexRarity='all';route='hex';render();}}
 else if(action==='auto-sync'){saved.preferences.autoSync=saved.preferences.autoSync===false;persist();render();}
 else if(action==='auto-check'){saved.preferences.autoCheck=!saved.preferences.autoCheck;persist();render();}
 else if(action==='refresh-statistics'){if(!api.checkDataFeed)throw Error('请在桌面版中更新统计资料');const info=await api.checkDataFeed();data.dataFeed=info;render();toast(info.message,info.phase==='offline');}
 else if(action==='update')await updateData();
 else if(action==='app-update-check-toggle'){saved.preferences.appUpdateCheck=!saved.preferences.appUpdateCheck;persist();render();}
 else if(action==='app-update-check')await checkAppUpdate();
 else if(action==='app-update-download')await downloadAppUpdate();
 else if(action==='app-update-cancel'){try{await api.cancelAppUpdate();}catch(err){toast(err.message,true);}}
 else if(action==='app-update-pause'){try{await api.pauseAppUpdate();}catch(err){toast(err.message,true);}}
 else if(action==='app-update-install')await installAppUpdate();
 else if(action==='app-update-delete'){try{await api.deleteAppUpdate();appUpdate={phase:'idle',release:null,received:0,total:null,error:'',via:null};render();}catch(err){toast(err.message,true);}}
 else if(action==='app-update-dismiss'){saved.preferences.dismissedAppVersion=appUpdate.release?.tag;await persist();appUpdate={phase:'current',dismissed:true,release:appUpdate.release,received:0,total:null,error:'',via:null};render();}
else if(action==='app-update-mirror-preset'){saved.preferences.updateMirror=String(el.dataset.url||'');await persist();render();}
else if(action==='app-update-mirror-clear'){saved.preferences.updateMirror='';await persist();render();}
 else if(action==='refresh-pairs')await refreshPairData();
 else if(action==='launch-game'){if(!api.launchGame)throw Error('请在桌面版启动游戏');el.disabled=true;try{const r=await api.launchGame();toast(r.connected?'客户端已连接':'已打开'+r.label+'，登录后自动连接');await sync(false,{fresh:true});}finally{render();}}
 else if(action==='choose-launch-path'){const p=await api.chooseLaunchPath?.();if(p){saved.preferences.launchPath=p;await persist({throwOnError:true});render();}}
 else if(action==='reset-launch-path'){saved.preferences.launchPath='';await persist({throwOnError:true});render();}
 else if(action==='choose-dir'){const dir=await api.chooseDirectory();if(dir){saved.preferences.installPath=dir;await persist();render();await sync(true);}}
 else if(action==='export'){if(favoriteSaving)throw Error('收藏正在保存，请稍后再备份');await saveChain;if(await api.exportState())toast('收藏与偏好已导出');}
 else if(action==='import'){if(favoriteSaving)throw Error('收藏正在保存，请稍后再导入');await saveChain;const state=await api.importState();if(state){saved=state;savedBase=structuredClone(state);preparations.restore(saved.preparations);selectBuildSource(data,saved.preferences.buildSource);style=saved.preferences.style;invalidate();toast('已合并收藏与配置并恢复偏好；推荐已按新条件清空');}}
 else if(action==='link')await api.openLink(el.dataset.url);
 }catch(err){toast(err.message||'操作没有完成，请重试',true);}
});
document.addEventListener('submit',event=>{if(event.target.id==='history-search'){event.preventDefault();history.state.query=document.getElementById('history-query').value;const search=event.target.closest('details');if(search)search.open=false;history.search().catch(error=>toast(error.message,true));return;}if(event.target.id==='catalog-form'){event.preventDefault();overlay.querySelector('[data-action=catalog-save]')?.click();}});
document.addEventListener('input',event=>{if(event.target.id==='history-query')history.state.query=event.target.value;});
document.addEventListener('change',event=>{const el=event.target,tab=history.current();if(tab&&el.dataset.historyTool==='mastery-query'&&!history.state.streamer){tab.masteryQuery=String(el.value).slice(0,96);render();}});
document.addEventListener('input',event=>{const el=event.target,tab=history.current(),detail=tab?.details[el.dataset.historyChart];if(!detail||el.dataset.chartField!=='rawStatsQuery')return;detail.rawStatsQuery=String(el.value).slice(0,96);render();});
document.addEventListener('change',event=>{const tab=history.current(),field=event.target.dataset.historyPage;if(!tab?.page||!['count','queue'].includes(field))return;const change=field==='count'?{count:Number(event.target.value),start:0}:{queue:event.target.value?Number(event.target.value):'',start:0};if(field==='queue')history.filter('queue',change.queue);history.load(tab,change).catch(error=>toast(error.message,true));});
document.addEventListener('change',event=>{const el=event.target,tab=history.current();if(!tab||!el.hasAttribute('data-history-tree-path'))return;try{const advanced=tab.filter.advanced||{mode:'all',rules:[]},tree=updateHistoryFilterTree(advanced.tree,{action:'set',path:el.dataset.historyTreePath,field:el.dataset.historyTreeField,value:el.value});history.filter('advanced',{...advanced,tree});}catch(error){toast(error.message,true);render();}});
document.addEventListener('change',event=>{
 const el=event.target;if(el.dataset.historyTool==='streamer'){history.state.streamer=el.checked;ongoing.configure({streamer:el.checked}).then(()=>{saved.preferences.ongoing=ongoing.state.settings;return persist();}).catch(error=>toast(error.message,true));render();return;}
 const field=el.dataset.ongoingField,tag=el.dataset.ongoingTag;if(!field&&!tag)return;
 const value=tag?{tags:el.checked?[...ongoing.state.settings.tags,tag]:ongoing.state.settings.tags.filter(v=>v!==tag)}:{[field]:el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value};
 ongoing.configure(value).then(()=>{history.state.streamer=ongoing.state.settings.streamer;if(route==='ongoing'&&ongoing.state.settings.enabled)ongoing.start();saved.preferences.ongoing=ongoing.state.settings;return persist();}).catch(error=>toast(error.message,true));
});
document.addEventListener('change',event=>{const field=event.target.dataset.historyField,tab=history.current();if(event.target.dataset.historyChart&&tab){const detail=tab.details[event.target.dataset.historyChart];if(detail){detail[event.target.dataset.chartField]=event.target.multiple?[...event.target.selectedOptions].map(option=>option.value):event.target.value;render();}return;}if(event.target.hasAttribute('data-history-rule')&&tab){const advanced=tab.filter.advanced,index=Number(event.target.dataset.historyRule);history.filter('advanced',{...advanced,rules:advanced.rules.map((r,i)=>i===index?{...r,[event.target.dataset.ruleField]:event.target.value}:r)});return;}if(!field)return;if(field==='source'||field==='server'){history.state[field]=event.target.value;return;}if(field==='advanced-mode'&&tab){history.filter('advanced',{...tab.filter.advanced,mode:event.target.value});return;}if(field.startsWith('filter-'))history.filter(field.slice(7),event.target.type==='checkbox'?event.target.checked:event.target.value);});
document.addEventListener('input',event=>{const el=event.target;if(el.id==='combo-search'&&comboView){comboView.query=el.value;document.getElementById('combo-list').innerHTML=combinationRows(data,comboView,slots);}if(el.id==='picker-search'){picker.query=el.value;document.getElementById('picker-grid').innerHTML=pickerTiles();}if(el.id==='library-search'){libraryQuery=el.value;document.getElementById('library-grid').innerHTML=libraryTiles();}if(el.id==='hex-search'){hexQuery=el.value;document.getElementById('augment-grid').innerHTML=augmentTiles();}if(el.id==='room-invite')roomInvite=el.value;if(el.id==='room-pin')roomPin=el.value;if(el.id==='room-relay-room')roomRelayRoom=el.value;if(el.id==='room-relay-url')roomRelayUrl=el.value;});
document.addEventListener('change',event=>{const el=event.target;if(el.id==='include-preselected'){saved.preferences.includePreselected=el.checked;invalidate();return;}if(el.id==='flash-slot'){saved.preferences.flashSlot=el.value;persist();render();if(buildView)renderBuild();return;}if(el.id==='room-auto'){saved.preferences.roomAuto=el.checked;persist();render();return;}if(el.hasAttribute('data-matchup-target')){try{changeMatchupTarget(el);}catch(error){toast(error.message,true);render();if(buildView)renderBuild();}return;}if(el.dataset.buildSourceField){try{const source=requireBuildSource({...normalizeBuildSource(data.buildSource),[el.dataset.buildSourceField]:el.value});saved.preferences.buildSource=source;selectBuildSource(data,source);invalidate();if(buildView)renderBuild();}catch(error){toast(error.message,true);}return;}if(el.dataset.presentationModule){api.presentation({field:'toggleModule',value:el.dataset.presentationModule}).then(value=>{saved.preferences.presentation=value;render();updatePresentationDialog(overlay,value);}).catch(error=>toast(error.message,true));return;}if(el.id==='companion-width'){saved.preferences.companionWidth=Number(el.value);persist().then(()=>api.windowLayoutControl('follow')).then(acceptWindowLayout).catch(error=>toast(error.message,true));return;}if(el.id==='party-ids'){saved.preferences.partyIds=normalizePartyIds(el.value);persist().then(()=>sync(false,{fresh:true}));return;}if(el.id==='configuration-role'){try{changeConfigurationRole(el);}catch(error){toast(error.message,true);if(overlay.contains(el))renderBuild();else render();}return;}if(el.id==='solo-role'||el.id==='task-own-role'){if(el.id==='solo-role'&&client.connected&&pregamePhase(client.phase)){stagePregameIntent({role:el.value}).catch(error=>{toast(error.message,true);render();});return;}try{setCompanionRole(el.value);if(el.id==='solo-role'&&client.connected&&client.phase==='ChampSelect'&&!localPickLocked(client.session))claimPosition(el.value).catch(error=>toast(error.message,true));if(el.id==='task-own-role')renderTaskMembers();}catch(error){toast(error.message,true);render();}return;}if(el.dataset.buildSummoner){try{editBuildSummoners(el,'summoner-'+el.dataset.buildSummoner,el.value);}catch(error){toast(error.message,true);renderBuild();}return;}if(el.dataset.companionField){try{editCompanionPlan(el,el.dataset.companionField,el.value);}catch(error){toast(error.message,true);render();}return;}if(el.id==='companion-scope'){scope=el.value;invalidate();}if(el.id==='companion-style'){style=el.value;invalidate();}if(el.id==='build-skill'){buildView.skillId=el.value||undefined;renderBuild();}if(el.id==='guide-after-game'){saved.preferences.guideAfterGame=el.value;persist();}if(el.id==='update-mirror'){try{saved.preferences.updateMirror=normalizeMirrorBase(el.value);el.value=saved.preferences.updateMirror;persist();}catch(error){toast(error.message,true);}render();}if(['play-difficulty','play-tempo','play-unusual','play-meleeBottom'].includes(el.id)){saved.preferences.play[el.id.slice(5)]=el.type==='checkbox'?el.checked:el.value;invalidate();}if(el.dataset.rolePoolMode){saved.preferences.rolePools[el.dataset.rolePoolMode].mode=el.value;invalidate();}if(el.matches('[data-catalog-member],#catalog-form select[name^="role-"]')){const i=el.dataset.catalogMember??el.name.split('-')[1],form=el.closest('form'),id=form.querySelector('[name="hero-'+i+'"]').value,role=form.querySelector('[name="role-'+i+'"]').value;form.querySelector('[name="loadout-'+i+'"]').innerHTML=editorLoadouts(data,id,role);}if(comboView&&['combo-style','combo-fit','combo-source','combo-configured','combo-tempo'].includes(event.target.id)){if(event.target.id==='combo-tempo')comboView.tempo=event.target.value;else if(event.target.id==='combo-style')comboView.style=event.target.value;else if(event.target.id==='combo-source')comboView.source=event.target.value;else if(event.target.id==='combo-configured')comboView.configured=event.target.checked;else comboView.fit=event.target.checked;document.getElementById('combo-list').innerHTML=combinationRows(data,comboView,slots);}if(event.target.id==='pool-mode'){saved.preferences.poolMode=event.target.value;invalidate();}if(event.target.id==='hex-category'){hexCategory=event.target.value;document.getElementById('augment-grid').innerHTML=augmentTiles();}if(event.target.id==='build-role'){if(scope==='solo'&&currentPlayerSelection(client.session,data.champions,slots)?.id===buildView.id){soloRole=event.target.value;persist();}showBuild(buildView.id,event.target.value,buildView.mode,{conditions:[...buildView.conditions],coreIndex:buildView.coreIndex});}if(event.target.id==='hex-rarity'){hexRarity=event.target.value;document.getElementById('augment-grid').innerHTML=augmentTiles();}if(el.id==='room-nick'){const clean=sanitizeNick(el.value);saved.preferences.roomNick=clean||'队友';el.value=saved.preferences.roomNick;persist();}if(el.id==='room-relay-url'){roomRelayUrl=el.value;const clean=normalizeRelayUrl(el.value);if(clean){saved.preferences.relayUrl=clean;el.value=clean;persist();}}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(activeOverlaySelect?.isConnected){deferOverlaySelect();return;}if(!activeAppSelect){if(!overlay.firstElementChild&&closeRecommendationMenus({restoreFocus:true}))event.preventDefault();else closeOverlay();}}if(event.key==='Tab'&&overlay.firstElementChild){const focusable=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(!overlay.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
document.addEventListener('change',event=>{
 if(event.target.id!=='room-role')return;
 try{chooseRoomRole(event.target.value);}catch(error){toast(error.message,true);render();}
});
document.addEventListener('change',event=>{
 const input=event.target;if(!input.hasAttribute('data-skill-index')&&input.id!=='build-skill')return;event.stopImmediatePropagation();
 try{
  const field=input.id==='build-skill'?'skill':'skill-custom:'+input.dataset.skillIndex;
  if(input.dataset.skillSurface==='companion')editCompanionPlan(input,field,input.value);
  else{const next=changeCompanionPlan(data,buildSelection(),field,input.value);delete buildView.customSkillOrder;Object.assign(buildView,next);renderBuild();}
 }catch(error){toast(error.message,true);if(input.dataset.skillSurface==='companion')render();else renderBuild();}
},true);
document.addEventListener('change',event=>{
 const el=event.target;if(!el.hasAttribute('data-rune-field'))return;event.stopImmediatePropagation();
 try{
  const field='rune-custom:'+el.dataset.runeField;
  if(el.dataset.runeSurface==='companion')editCompanionPlan(el,field,el.value);
  else{const next=changeCompanionPlan(data,buildSelection(),field,el.value);Object.assign(buildView,next);renderBuild();}
 }catch(error){toast(error.message,true);if(el.dataset.runeSurface==='companion')render();else renderBuild();}
},true);
function positionFitTooltip(event){const number=event.target.closest?.('.lineup-fit-number'),tip=number?.querySelector('.lineup-fit-hover');if(!tip)return;for(const open of document.querySelectorAll('.lineup-fit-hover:popover-open'))if(open!==tip)open.hidePopover();if(!tip.matches(':popover-open'))tip.showPopover();const bounds=number.getBoundingClientRect(),width=tip.offsetWidth||230,height=tip.offsetHeight||230;tip.style.left=Math.max(8,Math.min(innerWidth-width-8,bounds.right-width))+'px';tip.style.top=Math.max(8,Math.min(innerHeight-height-8,bounds.bottom+6))+'px';}
document.addEventListener('pointerover',positionFitTooltip);document.addEventListener('pointermove',positionFitTooltip);document.addEventListener('focusin',positionFitTooltip);
function hideFitTooltip(event){const number=event.target.closest?.('.lineup-fit-number');if(number&&!number.contains(event.relatedTarget))number.querySelector('.lineup-fit-hover')?.hidePopover();}
document.addEventListener('pointerout',hideFitTooltip);document.addEventListener('focusout',hideFitTooltip);
document.addEventListener('change',event=>{
 if(event.target.id==='patch-version'){patchVersion=event.target.value;render();return;}
 const field=event.target.dataset.rankingFilter;if(!field)return;
 if(field==='sort')rankingSort=['rank','winRate','pickRate','samples'].includes(event.target.value)?event.target.value:'rank';
 else if(['region','tier'].includes(field))rankingSource=normalizeBuildSource({...rankingSource||data.buildSource,[field]:event.target.value});
 companionScroll.delete('rankings');render();
});
document.addEventListener('input',event=>{
 if(event.target.id==='reference-search'){referenceQuery=event.target.value;const grid=document.getElementById('reference-grid');if(grid)grid.innerHTML=referenceHeroTiles(data,{query:referenceQuery,role:referenceRole});return;}
 if(event.target.id==='patch-search'){patchQuery=event.target.value;const start=event.target.selectionStart;render();const input=document.getElementById('patch-search');input?.focus({preventScroll:true});try{input?.setSelectionRange(start,start);}catch{}return;}
 if(event.target.id!=='ranking-search')return;rankingQuery=event.target.value;const start=event.target.selectionStart,end=event.target.selectionEnd;
 render();const input=document.getElementById('ranking-search');input?.focus({preventScroll:true});try{input?.setSelectionRange(start,end);}catch{}
});
document.addEventListener('error',event=>{const img=event.target;if(img.tagName!=='IMG')return;if(img.dataset.fallback){const url=img.dataset.fallback;delete img.dataset.fallback;img.src=url;}else{img.style.visibility='hidden';}},true);
window.addEventListener('unhandledrejection',event=>{toast(event.reason?.message||'操作失败，请重试',true);event.preventDefault();});
try{boot=await api.bootstrap();appUpdate=boot.appUpdate||appUpdate;data=boot.data;saved=boot.state;bindPlayerBuildPreferences();savedBase=structuredClone(saved);stateRevision=boot.stateRevision||0;stateRecovery=saved.recovery||null;data.catalog=configureCatalog(data.catalog||BUNDLED_CATALOG);data.catalogInfo||={...catalogIssues(data.catalog,data),version:data.catalog.version};configureAssets(data);
 ongoing.configure(saved.preferences.ongoing||{}).then(()=>history.state.streamer=ongoing.state.settings.streamer).catch(()=>{});
  client=boot.client||client;history.observeClient(client);runeAppliedKeys.observe(client);windowLayout=boot.windowLayout||{docked:false};api.onWindowLayout?.(acceptWindowLayout);
 room=await api.roomStatus?.()||null;if(room?.mode==='host')roomAddresses=await api.roomAddresses?.()||[];
 applyRoomSnapshot(room);
 roomRelayUrl=initialRelayUrl(saved.preferences.relayUrl);roomTransport=room&&room.mode!=='idle'?(room.transport==='relay'?'relay':'lan'):'relay';
 api.onRoomUpdate?.(snapshot=>{applyRoomSnapshot(snapshot);refreshPartyRange();if(windowLayout.docked||route==='draft'||route==='room')render();});
  preparations.restore(saved.preparations);guideSelection=saved.guide?.selection||null;if(guideSelection){if(!preparations.recall(guideSelection))preparations.remember(guideSelection);guideSyncBase=guideSelection;lastGuideSyncKey=buildChoiceKey(guideSelection);}
 api.onPresentation?.(value=>{saved.preferences.presentation=value;applyPresentation(value);if(overlay.querySelector('.theme-settings'))updateThemeDialog(overlay,value);else if(overlay.querySelector('.presentation-settings'))updatePresentationDialog(overlay,value);});
 api.onGuideSelection?.((selection,meta={})=>receiveGuideSelection(selection,meta.revision));
 api.onOpenBuild?.(selection=>{showBuild(selection.id,selection.role,selection.mode,selection);});
 api.onMainPage?.(destination=>{if(windowLayout.docked)return;if(destination?.route==='reference'&&champ(destination.id)){referenceHero=destination.id;referenceTab=destination.tab==='changes'?'changes':'skills';referenceSkill='Q';referenceVariant=0;route='reference';}else if(destination?.route==='settings')route='settings';else return;closeOverlay();render();});
 api.onProgress?.(message=>{updateMessage=message;const status=document.getElementById('update-message');if(status)status.textContent=message;});
 api.onPreselection?.(value=>{if(value?.message)toast(value.message,true);});
 api.onAppUpdate?.(snapshot=>{appUpdate={phase:snapshot.phase||'idle',release:snapshot.release||null,received:snapshot.received||0,total:snapshot.total??null,error:snapshot.error||'',via:snapshot.via||null,kind:snapshot.kind||snapshot.record?.kind||'full',fallbackNotice:snapshot.fallbackNotice||false,...(snapshot.record?{record:snapshot.record}:{}),...(snapshot.dismissed?{dismissed:true}:{})};if(route==='settings'&&!patchAppUpdateProgress(document,appUpdate))render();});
 saved.preferences={style:'fun',autoCheck:true,autoLive:true,appUpdateCheck:true,pool:[],poolMode:'off',...saved.preferences};saved.preferences.play={difficulty:'any',tempo:'any',unusual:true,meleeBottom:true,...saved.preferences.play};saved.preferences.rolePools=Object.fromEntries(ROLES.map(r=>[r.id,{heroes:[],mode:'off',...saved.preferences.rolePools?.[r.id]}]));saved.preferences.buildSource=normalizeBuildSource(saved.preferences.buildSource);selectBuildSource(data,saved.preferences.buildSource);saved.favorites=saved.favorites||[];saved.excluded=saved.excluded||[];
 if(saved.draft?.slots){try{validateSlots(saved.draft.slots,data.champions);slots=saved.draft.slots;}catch{}}
 activeCreativePlan=saved.draft?.creativePlan?validateCreativePlan(saved.draft.creativePlan,slots,{allowUnknown:true}):null;
 scope=DRAFT_SCOPES[saved.draft?.scope]?saved.draft.scope:'party';soloRole=saved.draft?.soloRole||'';
 style=saved.draft?.style||saved.preferences.style||'fun';if(!STYLES[style])style='fun';
 if(saved.preferences.autoSync===false)client.message='自动同步已关闭，可手动连接客户端';
 api.onState?.(value=>{if(value?.state&&value.revision>Math.max(stateRevision,externalState?.revision||0)){externalState=value;drainExternalState();}});
 api.onData?.(acceptSharedData);api.onPreparation?.(event=>{acceptSharedPreparation(event).catch(error=>toast('另一窗口的配置结果尚未同步：'+error.message,true));});
  await restorePreparationSnapshot(boot.preparationSnapshot);render();api.onClient?.(value=>{
   acceptOngoingClient(value);
  if(value?.connecting&&syncing){client={...client,...value};render();return;}
  if(value?.receivedAt&&value.receivedAt!==client.receivedAt)sharedClient=value;
  if(!syncing&&(saved.preferences.autoSync!==false||sharedClient))sync(false);
 });const ready=await api.ready?.();await restorePreparationSnapshot(ready?.preparationSnapshot);if(ready?.state&&ready.revision>Math.max(stateRevision,externalState?.revision||0)){externalState=ready;drainExternalState();}queueCompanionRecommendation();if(saved.preferences.autoSync!==false)sync(false,{fresh:true});else if(client.receivedAt){sharedClient=client;sync(false);}
 
 // Statistics are checked once by the main process; renderer windows must
 // never independently replace base game data during an active draft.
 if(boot.desktop&&saved.preferences.appUpdateCheck!==false&&Date.now()-Date.parse(saved.preferences.lastAppUpdateCheck||0)>86400000)setTimeout(()=>checkAppUpdate(true),2600);
}catch(err){app.innerHTML=`<div class="boot"><img class="brand-mark" src="../assets/icon.svg" alt="" /><h2>暂时无法打开助手</h2><p>${e(err.message)}</p><p>请保留整个程序文件夹后重新打开。</p></div>`;}


document.addEventListener("toggle",event=>{if(event.target.matches?.(".draft-preferences"))draftAdvanced=event.target.open;if(event.target.matches?.('[data-pair-refresh]'))pairRefreshOpen=event.target.open;},true);


