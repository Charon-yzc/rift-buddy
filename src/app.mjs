import {proposalKey} from './core/room.mjs';
import {roomBallotView} from './room-ballot-view.mjs';
import {roomBallotBoard} from './core/room-ballot.mjs';
import {roleClaimChampion} from './core/role-claim.mjs';
import {preparationEquipment} from './core/complete-gear.mjs';
import {invalidatePreparationStatuses,confirmPreparationResource,samePreparationPayload,invalidateItemSetStatuses,itemSetSuccessStatus} from './preparation-receipts.mjs';
import {preparationProgressView} from './preparation-progress-view.mjs';
import {createDisclosureState} from './disclosure-state.mjs';
import {pregameControls} from './pregame-controls-view.mjs';
import {recommendationDraft,comparisonDraft} from './core/draft-intents.mjs';
import {adoptedTaskView} from './draft-task-view.mjs';
import {stateRecoveryView} from './state-recovery-view.mjs';
import {clientRenderIdentity,normalizePartyIds} from './core/client-party.mjs';
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
import {appUpdatePanel} from './app-update-view.mjs';
import {resultPlayCard} from './play-card-view.mjs';
import {applyPresentation,updatePresentationDialog} from './presentation-view.mjs';
import {changePresentation} from './core/presentation.mjs';
import {companionView,readOnlyConfigurationMarkup,readOnlyConfigurationAction} from './companion-view.mjs';
import {favoriteBuildSummary,favoriteTeamSummary} from './favorites-view.mjs';
import {windowInfoDialog,windowInfoText} from './window-info-view.mjs';
import {roomPanel,roomSharesView,roomConfigurationDialog,roomConfigurationText,roomMissingConfigurationDialog,roomPreparationFileDialog} from './room-view.mjs';
import {preparationShare} from './core/preparation-file.mjs';
import {roomWorkspace} from './room-workspace-view.mjs';
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
import {DRAFT_SCOPES,CLIENT_POSITION_ROLES,draftTargets,scopeSlots,moveChampion,assignClientChampion,clientDraftStatus,clearDraftPicks,manualPlayerSlot,restorePlayerPosition,clearManualPlayerPosition,publicClientGameId,reconcileClientDraft,pickerMatches,publicDraftPicks,unassignedPublicPicks} from './core/draft.mjs';
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
import {renderResultCard,coreRouteChoices} from './draft-result-view.mjs';
import {escape as e,icon,portrait,asset,button,dateLabel,configureAssets,gameDescription} from './ui.mjs';
import {rankingsView} from './rankings-view.mjs';
import {rankingKey,rankingReference,validRankingReference} from './core/rankings.mjs';
import {patchNotesView} from './patch-notes-view.mjs';
import {championReferenceView,referenceHeroTiles} from './champion-reference-view.mjs';

let draftAdvanced=false,lastClientRead=null,lastRenderedClient='';
let rankedRolesCache=null;const currentRankedRoles=()=>{if(rankedRolesCache?.builds!==data.builds||rankedRolesCache?.patch!==data.patch)rankedRolesCache={builds:data.builds,patch:data.patch,value:rankedClientRoles(data)};return rankedRolesCache.value;};
const clientSyncOptions=()=>({autoArrange:saved.preferences.autoArrange!==false,autoParty:saved.preferences.autoParty!==false,party:client.party,roleOrder:currentRankedRoles(),ownRole:taskOwnRole()});
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
let stateRecovery=null;
let data,saved,savedBase,boot,slots=createSlots(),results=[],resultsSignature='',route='draft',style='fun',offset=0,scope='solo',soloRole='',showAllCandidates=false;
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
const pairRefreshStatus=()=>({pending:pairRefreshes.has(pairRefreshKey()),error:pairRefreshErrors.get(pairRefreshKey())||'',open:pairRefreshOpen});
async function refreshPairData(){
 const key=pairRefreshKey();if(pairRefreshes.has(key))return;
 const members=currentPairTargets(),source={...data.buildSource};pairRefreshes.add(key);pairRefreshErrors.delete(key);render();
 try{
  const next=await api.refreshPairs(members,source);
  if(key!==pairRefreshKey())return;
  data.pairStatistics=next;invalidate();await generate();toast('已刷新所选成员的同队数据，并重新搭配');
 }catch(error){if(key===pairRefreshKey()){const message=String(error.message||'同队数据暂不可用').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');pairRefreshErrors.set(key,message);while(pairRefreshErrors.size>20)pairRefreshErrors.delete(pairRefreshErrors.keys().next().value);toast('刷新未完成，原同队参考保留：'+message,true);}}
 finally{pairRefreshes.delete(key);render();}
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
let windowLayout={docked:false},companionTab='recommend',companionPreview=null,lastCompanionOwn='',lastCompanionIntent='',autoRecommendTimer,autoRecommendationKey='';
const companionScroll=new Map();
const disclosureState=createDisclosureState();let renderedDisclosureScope='';
let pendingIntentPreparation=null,pendingIntentPlanId='';
let stateRevision=0,dataRevision=0,externalState=null,externalStateTimer;
let room=null,roomScanning=false,roomScanResults=null,roomError='',roomInvite='',roomPin='',roomAddresses=[],roomShareTimer=null,roomShareSig='',roomShareRoom='',roomBusy=false,roomShareWarned=false,roomAutoQuiet=false,roomQuietTimer=null;
let roomConfigurationView=null,roomStrategySnapshot=null,roomPreparationFile=null,preparationFileBusy=false;
let roomRoleChoice=null,clickedRoomPlan=null;
let roomTransport='relay',roomRelayUrl=initialRelayUrl(),roomRelayRoom='',roomDialogOpen=false;
let activeCreativePlan=null,creativePlanNotice='';
function resultCreativePlan(result){const plan=captureCreativePlan(result,data);if(plan)result.creativePlan=plan;return plan;}
function reconcileCreativePlan({ownIntentChanged=false}={}){
 // The accepted candidate may intentionally differ from our previous hover.
 // A new client-side hover still takes precedence once that click is complete.
 const session=client.connected&&client.session?{...client.session,myTeam:client.session.myTeam.map(p=>!ownIntentChanged&&p.cellId===client.session.localPlayerCellId?{...p,championPickIntent:0}:p)}:null;
 const context=recommendationDraft(slots,session,data.champions,{ownRole:taskOwnRole()});
 if(activeCreativePlan&&(!creativePlanCompatible(activeCreativePlan,context)||scope!=='bot'&&activeCreativePlan.members.some(m=>!slots.some(s=>s.party&&s.role===m.role)))){
  if(lastTaskSelection?.comboId===activeCreativePlan.id)lastTaskSelection=null;
  activeCreativePlan=null;draftComparing=true;creativePlanNotice='队伍选人已变化，请重新搭配。';return true;
 }
}
let currentWindowInfo=null;
let itemSetPending='',clientPreparing=false,lastAdoptedRoomShare='',preparationPendingKey='',candidatePreparing=false,lastTaskSelection=null,draftComparing=false;let preparationRevision=0;const itemSetStatuses=new Map(),clientPreparationStatuses=new Map();
let activeAppSelect=null,pendingAppRender=false,renderedSelectContext=null,appSelectVersion=0;
let activeOverlaySelect=null,pendingBuildRender=false,renderedBuildContext=null,overlaySelectVersion=0;
function appSelectionContext(){
 const own=currentPlayerSelection(client.session,data.champions,slots),plan=windowLayout.docked?companionPreparation():null;
 return JSON.stringify([windowLayout.docked,route,companionTab,companionPreview,client.connected,client.phase,client.mode?.id,
  own?.id,own?.formalRole,own?.role,assignedPlayerRole(),soloRole,scope,data.patch,data.buildSource,plan?.selection,plan?.build.reference?.fetchedAt,client.game?.gameId]);
}
function finishAppSelect(version=appSelectVersion){if(version!==appSelectVersion)return;activeAppSelect=null;appSelectVersion++;if(pendingAppRender)render();}
function finishOverlaySelect(version=overlaySelectVersion){if(version!==overlaySelectVersion)return;activeOverlaySelect=null;overlaySelectVersion++;if(pendingBuildRender&&buildView)renderBuild();}
const deferAppSelect=()=>{const version=appSelectVersion;setTimeout(()=>finishAppSelect(version),0);};
const deferOverlaySelect=()=>{const version=overlaySelectVersion;setTimeout(()=>finishOverlaySelect(version),0);};
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
 if((!windowLayout.docked&&route!=='draft')||generating||syncing||['InProgress','GameStart','Reconnect','WaitingForStats','PreEndOfGame','EndOfGame'].includes(client.phase)||client.mode?.id==='hex')return;
 const key=recommendationKey(recommendationInput());if(key===autoRecommendationKey||key===resultsSignature&&results.length)return;
 autoRecommendTimer=setTimeout(()=>{if((!windowLayout.docked&&route!=='draft')||generating||syncing)return;autoRecommendationKey=key;generate();},250);
}
function acceptWindowLayout(value){if(JSON.stringify(windowLayout)===JSON.stringify(value))return;windowLayout=value;render();queueCompanionRecommendation();}
const refreshingBuilds=new Map(),refreshAttempts=new Map(),buildErrors=new Map();let recommendationError='';
const preparations=createPreparationStore();
const matchupTargets=new Map();let lastMatchupGame='',lastMatchupOwn='',lastMatchupSession='',lastMatchupSync='',matchupFocusError=null;let matchupFocusChain=Promise.resolve();
const publicMatchupIds=()=>client.connected&&client.phase==='ChampSelect'?enemy:[];
const matchupContext=()=>JSON.stringify([client.connected,client.phase,client.game?.gameId||'',publicMatchupIds()]);
const matchupPreparationContext=()=>JSON.stringify([matchupContext(),client.mode?.id,currentPlayerSelection(client.session,data.champions,slots)]);
const sameMatchupSelection=(a,b)=>a&&b&&['id','role','mode'].every(field=>a[field]===b[field]);
const chosenMatchupOpponent=selection=>{const key=matchupTargetKey(selection),pending=sameMatchupSelection(selection,client.opponentFocus)?client.opponentFocus.opponentId:'',prepared=sameMatchupSelection(selection,guideSelection)&&guideSelection.matchupGameId===publicClientGameId(client)?guideSelection.threatId:'';return publicMatchupOpponent(data,publicMatchupIds(),matchupTargets.has(key)?matchupTargets.get(key):pending||prepared);};
const opponentRefreshes=new Set(),opponentRefreshErrors=new Map();
const opponentRequestKey=selection=>{const opponent=chosenMatchupOpponent(selection);return opponent?opponentBuildKey(selection.id,selection.role,opponent.id,data.buildSource,data.patch):'';};
const opponentRefreshStatus=selection=>{const key=opponentRequestKey(selection);return {pending:opponentRefreshes.has(key),error:opponentRefreshErrors.get(key)||''};};
async function refreshOpponentConfiguration(el){
 const drawer=overlay.contains(el),selection=drawer?buildSelection():companionPreparation()?.selection,target=selection&&chosenMatchupOpponent(selection);
 if(!target||selection.mode!=='rift'||el.dataset.plan!==[selection.id,selection.role,selection.mode].join(':'))throw Error('请重新确认英雄、位置与公开对手');
 const model=matchupPreparation({data,selection,enemyIds:publicMatchupIds(),targetId:target.id,publicContext:matchupPreparationContext()});
 if(!model||model.context!==el.dataset.context)throw Error('当前比较已变化，请重新刷新');
 const source={...data.buildSource},patch=data.patch,key=opponentBuildKey(selection.id,selection.role,target.id,source,patch);
 if(opponentRefreshes.has(key))return;opponentRefreshes.add(key);opponentRefreshErrors.delete(key);render();if(buildView)renderBuild();
 try{
  const ref=await api.refreshOpponentBuild(selection.id,selection.role,target.id,source);
  if(data.patch!==patch)return;
  if(!sameBuildSource(ref,source)||!validReference(ref,champ(selection.id),selection.role,data,{opponent:target.id}))throw Error('所选对手来源未通过核对');
  data.opponentBuildSources={...data.opponentBuildSources,[opponentBuildKey(selection.id,selection.role,target.id,source,ref.patch)]:ref};
  if(key===opponentRequestKey(selection))toast('已取得所选对手的统计参考；选择配置后才会采用');
 }catch(error){const message=String(error.message||'对手来源暂不可用').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');opponentRefreshErrors.set(key,message);while(opponentRefreshErrors.size>30)opponentRefreshErrors.delete(opponentRefreshErrors.keys().next().value);}
 finally{opponentRefreshes.delete(key);render();if(buildView)renderBuild();}
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
const nav=[['draft','开黑选人','team'],['room','开黑房间','link'],['builds','符文与出装','sword'],['reference','英雄图鉴','book'],['rankings','各路排行','ranking'],['patches','版本改动','refresh'],['hex','海克斯手册','hex'],['favorites','我的收藏','star'],['settings','数据与连接','settings']];
function toast(message,error=false){clearTimeout(toastTimer);const el=document.getElementById('toast');el.textContent=message;el.className=`show ${error?'error':''}`;toastTimer=setTimeout(()=>el.className='',error?7000:3800);}
function restoreRejectedSave(before,failed){
 saved.preparations=preparations.snapshot();
 const viewed=buildView&&buildSelection();
 const restoredView=viewed&&rollbackUnacceptedState(before,failed,{preparations:[viewed]}).preparations.find(value=>['id','role','mode'].every(field=>value[field]===viewed[field])&&(value.comboId||'')===(viewed.comboId||''));
 saved=rollbackUnacceptedState(before,failed,saved);preparations.restore(saved.preparations);
 slots=saved.draft?.slots||createSlots();scope=saved.draft?.scope||'party';soloRole=saved.draft?.soloRole||'';style=saved.draft?.style||saved.preferences.style||'fun';activeCreativePlan=saved.draft?.creativePlan||null;
 if(pendingIntentPreparation)pendingIntentPreparation=preparations.recall(pendingIntentPreparation);
 if(buildView){for(const field of [...CONFIGURATION_FIELDS,'augmentIds','compareIds','ownedAugmentIds'])delete buildView[field];Object.assign(buildView,{conditions:[],coreIndex:0},restoredView||{id:viewed.id,role:viewed.role,mode:viewed.mode});}
 selectBuildSource(data,saved.preferences.buildSource);markResultStale();cancelRecommendation();results=[];offset=0;
 restoringSave=true;try{render();if(buildView)renderBuild();}finally{restoringSave=false;}
}
function persist({throwOnError=false,derived=false}={}){
 saved.draft={slots,style,scope,soloRole,...(activeCreativePlan&&creativePlanCompatible(activeCreativePlan,slots)?{creativePlan:activeCreativePlan}:{}),...(saved.draft?.clientGameId?{clientGameId:saved.draft.clientGameId}:{}),...(saved.draft?.playerPosition?{playerPosition:saved.draft.playerPosition}:{})};saved.preferences.style=style;saved.preparations=preparations.snapshot();
 const pending={snapshot:structuredClone(saved)};pendingSaves.add(pending);
 const request=saveChain.catch(()=>{}).then(async()=>{
  const before=structuredClone(savedBase);
  try{
   const response=await api.saveState(pending.snapshot,before),accepted=response?.state||pending.snapshot;
   for(const queued of pendingSaves)if(queued!==pending)queued.snapshot=rebaseWindowState(pending.snapshot,queued.snapshot,accepted);
   acceptSavedState(accepted,response?.revision||stateRevision,pending.snapshot);
  }
  catch(error){for(const queued of pendingSaves)if(queued!==pending)queued.snapshot=rollbackUnacceptedState(before,pending.snapshot,queued.snapshot);restoreRejectedSave(before,pending.snapshot);
   // A background public snapshot may lose a race to a player's newer lane
   // choice in the other window. Keep that accepted choice, without retrying
   // or concealing conflicts from explicit edits or failures to write disk.
   if(derived&&!throwOnError&&/选人配置同时发生变化|客户端已选英雄不能移除或解锁/.test(error.message)){
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
 preparations.restore(saved.preparations);slots=saved.draft?.slots||createSlots();scope=saved.draft?.scope||'party';soloRole=saved.draft?.soloRole||'';style=saved.draft?.style||saved.preferences.style||'fun';activeCreativePlan=saved.draft?.creativePlan||null;
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
 const recommendationBefore=recommendationKey(recommendationInput());
 data=value.replace?value.changes:{...data,...value.changes};bindPlayerBuildPreferences();rankedRolesCache=null;
 data.catalog=configureCatalog(data.catalog||BUNDLED_CATALOG);data.catalogInfo||={...catalogIssues(data.catalog,data),version:data.catalog.version};configureAssets(data);selectBuildSource(data,saved.preferences.buildSource);
 if(recommendationBefore!==recommendationKey(recommendationInput())){markResultStale();cancelRecommendation();results=[];offset=0;}
 render();if(buildView)renderBuild();queueCompanionRecommendation();
}
async function restorePreparationSnapshot(snapshot){
 if(!snapshot||snapshot.revision<preparationRevision)return;
 clientPreparationStatuses.clear();itemSetStatuses.clear();runeAppliedKeys.clear(true);preparationRevision=0;
 for(const event of snapshot.events||[])await acceptSharedPreparation(event,false);
 preparationRevision=Math.max(preparationRevision,snapshot.revision||0);render();
}
async function acceptSharedPreparation(event,fresh=true){
 if(!event||event.revision&&event.revision<=preparationRevision)return;
 preparationRevision=Math.max(preparationRevision,event.revision||0);
 if(event.kind==='invalidate'){
  if(event.reset)clientPreparationStatuses.clear();else invalidatePreparationStatuses(clientPreparationStatuses,event.affects||[]);
  if(event.reset||event.affects?.includes('items'))invalidateItemSetStatuses(itemSetStatuses,{reset:!!event.reset});
  if(event.reset||event.affects?.includes('runes'))runeAppliedKeys.clear(!!event.reset);render();return;
 }
 if(event.current===false)return;
 if(fresh)await sync(false,{fresh:true});
 if(event.revision&&event.revision<preparationRevision)return;
 const ledger=event.ledgerContext,context=event.kind==='selection'?event.value?.context:event.context;
 const own=client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId),gameId=ledger?.gameId||context?.gameId;
 if(!client.connected||client.phase!=='ChampSelect'||!gameId||preparationGameId(client)!==gameId||ledger&&own?.cellId!==ledger.cellId)return;
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
  if(record&&event.result?.steps?.hover?.status==='done'&&selection.role===taskOwnRole()&&(own?.championId||own?.championPickIntent)===champ(selection.id)?.key)lastTaskSelection=selection;
  for(const plan of [record,ownTaskPreparation(),myPreparation(),companionPreparation({currentOnly:true})]){
   const prepared=clientPreparationPlan(data,plan);if(prepared&&samePreparationPayload(prepared.value,event.value))clientPreparationStatuses.set(clientPreparationKey(client,prepared),event.result);
  }
  if(id&&event.result?.steps?.runes?.status==='done'&&page)runeAppliedKeys.confirm(runeAppliedKeys.begin(runeApplicationKey(id,event.value.role,page)));
 }
 render();
}

function roomErrorMessage(error){
 const raw=String(error?.message||'').replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/,'');
 if(/ECONNREFUSED/.test(raw))return '连接被拒绝：确认房主已创建房间，地址和端口正确';
 if(/EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|ETIMEOUT|timeout|超时/i.test(raw))return '无法连接：确认和房主在同一局域网或虚拟局域网，并检查防火墙';
 if(/ENOTFOUND|EAI_AGAIN/.test(raw))return '地址无法解析：请让房主重新发送邀请码';
 return raw||'操作失败，请重试';
}
function roomSharePayload(){
 const role=roomOwnRole(),mode=client.connected?(client.mode?.id||null):'rift',share=shareFromSlots(slots,role,mode);if(!share)return null;
 const candidate=captureRoomStrategy(slots,data,activeCreativePlan,mode);if(candidate?.id!==roomStrategySnapshot?.id)roomStrategySnapshot=candidate;
 return {...share,configurations:mode==='aram'?[]:captureRoomConfigurations(slots,data,preparations,{creativePlan:roomStrategySnapshot,guide:guideSelection,current:buildView?buildSelection():null,mode}),...(roomStrategySnapshot?{strategy:roomStrategySnapshot}:{})};
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
 room=snapshot;
 const identity=snapshot&&snapshot.mode!=='idle'?String(snapshot.room||''):'';
 if(identity!==roomShareRoom){roomShareRoom=identity;roomShareSig='';if(identity)scheduleRoomPublish();}
 const quiet=!!(snapshot?.auto&&snapshot.mode!=='idle'&&snapshot.link==='connected');
 if(quiet&&!roomQuietTimer)roomQuietTimer=setTimeout(()=>{roomQuietTimer=null;roomAutoQuiet=true;if(windowLayout.docked||route==='draft'||route==='room')render();},AUTO_QUIET_MS);
 if(!quiet){if(roomQuietTimer){clearTimeout(roomQuietTimer);roomQuietTimer=null;}roomAutoQuiet=false;}
}
function rememberPreparation(value){if(restoringSave)return value;const before=preparations.recall(value),next=preparations.remember(value);if(JSON.stringify(before)!==JSON.stringify(next))persist();return next;}
function rememberIntentPreparation(selection){pendingIntentPreparation=structuredClone(selection);pendingIntentPlanId=activeCreativePlan?.id||'';}
function currentPickIntent(){return companionPickIntent(client,data.champions,slots,{scope,soloRole,playerPosition:saved.draft?.playerPosition,creativePlan:activeCreativePlan,catalogStatus:data.catalogInfo?.status});}
function invalidate(){preservePlayerPosition();reconcileCreativePlan();const own=currentPlayerSelection(client.session,data.champions,slots);if(scope==='solo'&&own?.positionKnown)soloRole=own.role;recommendationError='';markResultStale();cancelRecommendation();results=[];offset=0;autoRecommendationKey='';persist();render();queueCompanionRecommendation();}
function render(){
 const rankingFocus=['ranking-search','patch-search','reference-search'].includes(document.activeElement?.id)?{id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
 if(dragPick){pendingDragRender=true;return;}
 const selectContext=appSelectionContext();
 if(activeAppSelect?.isConnected&&app.contains(activeAppSelect)&&renderedSelectContext===selectContext&&currentMatchupSelect(activeAppSelect)){pendingAppRender=true;return;}
 activeAppSelect=null;pendingAppRender=false;renderedSelectContext=selectContext;
 disclosureState.capture(renderedDisclosureScope,app);
 applyPresentation(saved.preferences.presentation);
 const old=document.querySelector('.companion-content');if(old){
   companionScroll.set(old.dataset.view,old.scrollTop);
 }
 document.body.classList.toggle('companion-mode',windowLayout.docked);
 if(windowLayout.docked){
  const focused=document.activeElement,focus=app.contains(focused)&&['BUTTON','INPUT','SELECT'].includes(focused.tagName)?{id:focused.id,tag:focused.tagName,data:{...focused.dataset}}:null;
  const preparation=myPreparation(),own=preparation?.own.id||'';
  if(own!==lastCompanionOwn){lastCompanionOwn=own;companionPreview=null;lastCompanionIntent='';if(own)companionTab='plan';companionScroll.delete('plan');}
  const intent=own?null:currentPickIntent(),intentId=intent?.selection.id||'';
  if(intentId!==lastCompanionIntent){lastCompanionIntent=intentId;if(!own)pendingIntentPreparation=null;if(intentId&&!companionPreview)companionTab='recommend';}
  const plan=companionPreparation(),view=companionTab+(companionPreview?':'+companionPreview.id:plan?.intent?':intent:'+plan.selection.id+':'+plan.selection.role:'');
  if(plan?.intent&&(!pendingIntentPreparation||pendingIntentPlanId!==(activeCreativePlan?.id||'')||!['id','role','mode'].every(field=>pendingIntentPreparation[field]===plan.selection[field])))rememberIntentPreparation(plan.selection);
  const disclosureScope=view+':'+[plan?.selection.id,plan?.selection.role,plan?.selection.mode].join(':');
  const configurationKey=plan&&buildKey(plan.selection.id,plan.selection.role,plan.selection.mode);
  const ownPrepared=clientPreparationPlan(data,preparation||companionPreparation({currentOnly:true}));
  const focusScope=JSON.stringify([client.connected,client.phase,client.game?.gameId||'',own,client.mode?.id||'']);
  if(plan)maybeRefreshBuild(plan.selection.id,plan.selection.role,plan.selection.mode);
  lastRenderedClient=clientRenderIdentity(client);app.innerHTML=companionView({data,client,slots,unassigned,enemy,bans:clientBans,scope,soloRole,playerPosition:saved.draft?.playerPosition,style,tab:companionTab,results,generating,error:recommendationError,preparation,plan,favorites:saved.favorites,preferences:saved.preferences,room,roomContent:companionTab==='room'?roomPanelHTML():'',rankings:companionTab==='rankings'?rankingsView(data,{...rankingOptions(),compact:true}):'',activePlan:activeCreativePlan,adoptedShare:lastAdoptedRoomShare,draftNotice:creativePlanNotice,preparationStatus:clientPreparing?{message:'正在预选并配置…'}:ownPrepared&&clientPreparationStatuses.get(clientPreparationKey(client,ownPrepared)),configurationStatus:{itemSetStatuses,clientControls:clientControls(plan,'companion'),refreshing:refreshingBuilds.has(configurationKey),error:buildErrors.get(configurationKey),enemyIds:publicMatchupIds(),publicContext:matchupPreparationContext(),opponentId:plan?chosenMatchupOpponent(plan.selection)?.id||'':'',matchupStatus:plan?matchupFocusStatus(plan.selection):'',opponentRefresh:plan?opponentRefreshStatus(plan.selection):{}},applied:!!preparation&&runeAppliedKeys.has(runeApplicationKey(own,preparation.build.role,preparation.build.runePage)),guideAutoShow:saved.preferences.guideAutoShow!==false,appVersion:boot.version,pairRefresh:pairRefreshStatus(),overlap:windowLayout.overlap,recovery:stateRecovery,taskControls:taskControls(),taskPlan:ownTaskPreparation(),taskComparing:draftComparing,showAllCandidates}).replaceAll('loading="lazy"','loading="eager"');
  const content=document.querySelector('.companion-content');content.dataset.view=view;content.dataset.disclosureScope=disclosureScope;content.dataset.focusScope=focusScope;
  renderedDisclosureScope='companion:'+disclosureScope;disclosureState.restore(renderedDisclosureScope,app);
  content.scrollTop=companionScroll.get(view)||0;
  renderedSelectContext=appSelectionContext();reflectRunePending();
  if(focus&&old?.dataset.focusScope===focusScope){const target=focus.id?document.getElementById(focus.id):[...app.querySelectorAll('button,input,select')].find(control=>control.tagName===focus.tag&&Object.keys(focus.data).length&&Object.entries(focus.data).every(([key,value])=>control.dataset[key]===value));target?.focus({preventScroll:true});}return;
 }
 app.innerHTML=`<div class="app-shell"><aside class="sidebar"><div class="brand"><img class="brand-mark" src="../assets/icon.png" alt="" /><div><div class="brand-name">开黑搭子</div><div class="brand-en">RIFT BUDDY</div></div></div><nav aria-label="主导航">${nav.filter(([id])=>id!=='settings').map(([id,name,ico])=>`<button class="nav-item ${route===id?'active':''}" data-action="navigate" data-route="${id}">${icon(ico)}${name}${id==='favorites'&&saved.favorites.length?`<span class="badge">${saved.favorites.length}</span>`:''}</button>`).join('')}</nav><div class="sidebar-bottom">${client.connected?'':`<div class="launch-actions">${button('launch-game','打开英雄联盟','arrow','primary')}${button('sync',syncing?'连接中…':'连接客户端','link','connect-client',syncing?'disabled':'')}</div>`}<button class="nav-item ${route==='settings'?'active':''}" data-action="navigate" data-route="settings">${icon('settings')}数据与连接</button><div class="sidebar-footer"><span class="status-dot ${client.connected?'connected':''}"></span>${client.connected?'客户端已连接':'手动选人可用'} · v${e(boot.version||'0.1.0')}</div></div></aside><div class="workspace"><header class="topbar">${mainWindowActions()}</header><main class="page" id="main" data-page="${route}">${stateRecoveryView(stateRecovery)}${route==='draft'?renderDraft():route==='room'?renderRoom():route==='builds'?renderLibrary():route==='reference'?championReferenceView(data,{id:referenceHero,query:referenceQuery,role:referenceRole,tab:referenceTab,skill:referenceSkill,variant:referenceVariant}):route==='rankings'?rankingsView(data,rankingOptions()):route==='patches'?patchNotesView(data,{patch:patchVersion,query:patchQuery}):route==='hex'?renderHex():route==='favorites'?renderFavorites():renderSettings()}</main></div></div>`;
 renderedDisclosureScope='main:'+route+':'+(route==='draft'?activeCreativePlan?.id||'':route==='reference'?[referenceHero,referenceRole,referenceTab].join(':'):'');disclosureState.restore(renderedDisclosureScope,app);
 reflectRunePending();
 if(roomDialogOpen)renderRoomDialog();
 if(rankingFocus){const input=document.getElementById(rankingFocus.id);input?.focus({preventScroll:true});try{input?.setSelectionRange(rankingFocus.start,rankingFocus.end);}catch{}}
}
function mainWindowActions(){return `<div class="top-actions">${button('window-fold','收起','','quiet small','title="暂时收起到屏幕边缘；点小拉手恢复"')}${button('sync',syncing?'连接中…':client.connected?'同步选人':'连接客户端','link','small',syncing?'disabled':'')}${button('companion-attach','贴边选人','team','small')}${route==='draft'?button('guide-current','本局指引','book','quiet small'):''}<details class="window-tools"><summary class="btn quiet small">${icon('settings')}窗口与设置</summary><div class="window-tools-content">${button('presentation-open','字号与指引','settings','quiet small')}${button('recover-guide','找回指引','book','quiet small')}${button('pin',pinned?'取消置顶':'置顶窗口','pin','quiet small')}<button class="btn quiet small" data-action="navigate" data-route="settings">资料 ${e(data.version)} · 查看状态</button></div></details></div>`;}
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
function roomPanelHTML(){return api.roomStatus?roomPanel({room,transport:roomTransport,relayUrl:roomRelayUrl,relayRoom:roomRelayRoom,nick:saved.preferences.roomNick||'队友',busy:roomBusy,scanning:roomScanning,scanResults:roomScanResults,error:roomError,invite:roomInvite,pin:roomPin,addresses:roomAddresses,champ,hasPreparationFile:!!roomPreparationFile,preparationFileBusy,autoEnabled:saved.preferences.roomAuto===true,autoSync:saved.preferences.autoSync!==false,autoError:room?.autoError||'',autoQuiet:roomAutoQuiet&&(room?.members?.length??0)<=1}):'<p>连接队友房间请使用桌面版。</p>';}
function renderRoomDialog(){
 const restore=preserveOverlay(overlay);
 overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal drawer pregame-room-dialog" role="dialog" aria-modal="true" aria-label="连接开黑队友"><header class="modal-header"><h2>开黑房间</h2>${button('close','回到选人','','quiet small')}</header><div class="drawer-content">${roomPanelHTML()}${room&&room.mode!=='idle'?button('room-to-draft','开始选阵容','arrow','primary'):''}</div></section></div>`;
 restore();
}
function roomOwnPreparation(){
 const role=roomOwnRole(),slot=slots.find(s=>s.role===role),mode=client.connected?client.mode?.id:'rift';
 if(!slot?.champion||!['rift','hex'].includes(mode))return null;
 const combo=mode==='rift'?currentCombo(slots,slot.champion,role,data.catalogInfo?.status,null,activeCreativePlan):null;
 const context={id:slot.champion,role,mode,...creativeComboContext(combo)},selection={...rememberedPreparation(context),...context};
 return {selection,build:getBuild(champ(slot.champion),role,data,selection)};
}
function taskOwnRole(){
 const own=currentPlayerSelection(client.session,data.champions,slots);
 return manualPlayerSlot(slots,client.session?.localPlayerCellId)?.role||(saved.draft?.playerPosition?.cellId===client.session?.localPlayerCellId?saved.draft?.playerPosition?.role:'')||assignedPlayerRole()||soloRole||(own?.positionKnown?own.role:'');
}
function publicDraftContext(){return recommendationDraft(slots,client.connected?client.session:null,data.champions,{ownRole:taskOwnRole()});}
function ownTaskPreparation(){
 const own=myPreparation(),intent=companionPreparation({currentOnly:true}),role=taskOwnRole();
 const member=activeCreativePlan?.members.find(m=>m.role===role);
 const slot=slots.find(s=>s.role===role);
 if(lastTaskSelection&&lastTaskSelection.role===role&&slot?.champion===lastTaskSelection.id){const selection={...lastTaskSelection,...rememberedPreparation(lastTaskSelection)};return {selection,build:getBuild(champ(selection.id),role,data,selection)};}
 const context=member?{id:member.champion,role,mode:'rift',...creativeComboContext(creativeMemberCombo(activeCreativePlan,member.champion,role))}:null;
 if(context){const selection={...rememberedPreparation(context),...context};return {selection,build:getBuild(champ(selection.id),role,data,selection)};}
 if(own)return own;
 if(intent)return intent;
 if(slot?.champion){const combo=currentCombo(slots,slot.champion,role,data.catalogInfo?.status,null,activeCreativePlan),context={id:slot.champion,role,mode:'rift',...creativeComboContext(combo)},selection={...rememberedPreparation(context),...context};return {selection,build:getBuild(champ(slot.champion),role,data,selection)};}
 return null;
}
function renderTaskMembers(){overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal task-members-dialog" role="dialog" aria-modal="true" aria-label="成员与本人位置"><header class="modal-header"><h3>成员与位置</h3>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="modal-body"><label>你负责的位置<select id="task-own-role" class="select"><option value="">待确认</option>${ROLES.map(r=>`<option value="${r.id}" ${taskOwnRole()===r.id?'selected':''}>${r.name}</option>`).join('')}</select></label><p>${['known','lobby'].includes(client.party?.status)?`游戏组队 ${client.party.lobbyCount||client.party.members?.length||1} 人 · 助手房间 ${room?.mode!=='idle'?room?.members?.length||0:0} 人`:'暂未完整识别组队；下方可手动标记。'}</p><ul class="task-party-list">${(client.party?.members||[]).map((m,i)=>'<li><span>'+e(m.displayName||(m.local?'我':'队友 '+(i+1)))+(m.local?' · 你':'')+'</span><small>'+e(slots.find(s=>Number.isInteger(m.cellId)&&s.clientCellId===m.cellId)?roleName(slots.find(s=>s.clientCellId===m.cellId).role):CLIENT_POSITION_ROLES[m.firstPosition]?roleName(CLIENT_POSITION_ROLES[m.firstPosition]):'位置待定')+'</small></li>').join('')}</ul><div class="task-member-roles">${slots.map(s=>`<div>${roleName(s.role)} · ${e(champ(s.champion)?.name||'等待选择')} ${button('toggle-party',s.party?'我们':'队友','','small',`data-role="${s.role}" aria-pressed="${s.party}"`)}${s.champion?button('move-slot','换位','','quiet small',`data-role="${s.role}"`):''}</div>`).join('')}</div></div></section></div>`;}
function taskControls(){const plan=ownTaskPreparation();if(!plan)return '';return preparationProgressView({data,plan,client,view:'task',available:!!api.prepareSelection,busy:clientPreparing||runeApplying||!!itemSetPending,pendingKey:preparationPendingKey,statuses:clientPreparationStatuses,runeApplied:!!plan&&runeAppliedKeys.has(runeApplicationKey(plan.selection.id,plan.selection.role,plan.build.runePage)),compact:windowLayout.docked});}
function memberHeroAction(id,role){const ownRole=taskOwnRole();return ownRole&&ownRole!==role?{prepare:false,label:'队友配置 · 只读'}:!ownRole?{prepare:false,label:'先确认本人位置 · 查看配置'}:companionHeroAction(client,champ(id),saved.preferences.clickPrepare!==false);}
function refreshClickedResult(result,input,current,previousSlots){
 const preferences=value=>recommendationKey({...value,slots:[],soloChampion:null,publicBans:[],eligibleByRole:{},confirmedPick:null,enemy:[],visibleEnemies:[],publicPicks:[]});
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
 const nextPlan=resultCreativePlan(result),inherited=partyRoutePreparations(preparations,result.preparationOrigin,nextPlan);
 preservePlayerPosition();for(const selection of inherited)preparations.remember(selection);
 activeCreativePlan=nextPlan;lastTaskSelection=null;creativePlanNotice='';cancelRecommendation();if(scope==='solo')soloRole=result.targets[0]||soloRole;
 slots=structuredClone(result.slots).map(s=>{const intent=s.publicIntent;delete s.publicIntent;if(intent){delete s.clientCellId;delete s.manualPosition;}return {...s,locked:!!s.champion&&!intent,...((intent||result.targets.includes(s.role))&&s.champion&&!Number.isInteger(s.clientCellId)&&!s.manualPosition?{automaticPosition:true}:{})};});
 closeOverlay();draftComparing=false;companionPreview=null;companionTab='recommend';
 await persist({throwOnError:true});results=[result];resultsSignature=recommendationKey(recommendationInput());render();
 return result;
}
async function prepareCandidate(el){
  if(candidatePreparing||clientPreparing||runeApplying)throw Error('当前配置正在处理，请等待完成');
  if(!champ(el.dataset.id))throw Error('英雄资料已变化');
  const result=results[Number(el.dataset.resultIndex)];
  if(!el.hasAttribute('data-result-index')||!result||resultsSignature!==recommendationKey(recommendationInput())||!result.slots.some(s=>s.champion===el.dataset.id&&s.role===el.dataset.role))throw Error('推荐条件已变化，请重新推荐');
  const plan=resultCreativePlan(result),combo=plan?creativeMemberCombo(plan,el.dataset.id,el.dataset.role):result.trio||result.duo;
  const action=memberHeroAction(el.dataset.id,el.dataset.role);
  if(action.prepare){
   const context={id:el.dataset.id,role:el.dataset.role,mode:'rift',...creativeComboContext(combo)},index=Number(el.dataset.resultIndex);
   const inherited=partyRoutePreparations(preparations,result.preparationOrigin,plan).find(s=>s.id===context.id&&s.role===context.role);
   const selection={...rememberedPreparation(context),...inherited,...context};
   const expected={...context,planId:plan?.id||'',fingerprint:clientPreparationPlan(data,{selection,build:getBuild(champ(context.id),context.role,data,selection)})?.fingerprint};
   candidatePreparing=true;try{await adoptResult(index,true);lastTaskSelection=context;await useClientPreparation({dataset:{preparationView:'task'}},true,expected);}finally{candidatePreparing=false;drainExternalState();render();}
  }
  else{companionPreview=localConfigurationPreview({id:el.dataset.id,role:el.dataset.role,mode:'rift',...creativeComboContext(combo)},client,taskOwnRole());if(windowLayout.docked){companionTab='plan';closeOverlay();render();}else showBuild(el.dataset.id,el.dataset.role,'rift',companionPreview);}
  return;
}

function readOnlyPreparation(view,plan){const role=view==='room'?roomOwnRole():taskOwnRole();return !!plan&&(!role||plan.positionKnown===false||plan.selection.role!==role||configurationReadOnly(plan.selection,client,role)||view==='build'&&buildView?.readOnly||view==='companion'&&companionPreview?.readOnly);}
function clientControls(plan,view){if(readOnlyPreparation(view,plan))return taskOwnRole()?'<p class="callout">队友配置仅供查看。</p>':button('task-members','确认本人位置','','small');return clientPreparationControls({data,plan,client,view,available:!!api.prepareSelection,pending:clientPreparing||runeApplying||!!itemSetPending,statuses:clientPreparationStatuses});}
function renderRoom(){
 const share=roomSharePayload(),plan=roomOwnPreparation(),connection=api.roomStatus?roomPanel({room,transport:roomTransport,relayUrl:roomRelayUrl,relayRoom:roomRelayRoom,nick:saved.preferences.roomNick||'队友',busy:roomBusy,scanning:roomScanning,scanResults:roomScanResults,error:roomError,invite:roomInvite,pin:roomPin,addresses:roomAddresses,champ,hasPreparationFile:!!roomPreparationFile,preparationFileBusy,autoEnabled:saved.preferences.roomAuto===true,autoSync:saved.preferences.autoSync!==false,autoError:room?.autoError||'',autoQuiet:roomAutoQuiet&&(room?.members?.length??0)<=1}):'<p class="callout">连接队友房间请使用桌面版。</p>';
 return roomBallotView(room,publicDraftContext(),data.champions)+roomWorkspace({data,share,ownPlan:plan,connected:!!room&&room.mode!=='idle',connectionLabel:room&&room.mode!=='idle'?'房间 '+room.room+' · '+room.members.length+' 人':'',role:roomOwnRole(),configurations:share?.configurations||[],clientControls:clientControls(plan,'room'),connection,notice:creativePlanNotice,clientMessage:client.message});
}
function selectedClientPreparation(view){if(view==='incoming-ballot'){const row=roomBallotBoard(room,publicDraftContext(),data.champions).find(r=>r.key===clickedRoomPlan?.ballotKey),config=row?.proposal.configurations?.find(c=>c.champion===clickedRoomPlan.id&&c.role===clickedRoomPlan.role);return config?roomClientPlan(config,data,row.proposal.strategy,{localStrategy:captureRoomStrategy(slots,data,activeCreativePlan,config.mode)}):null;}if(view==='incoming-room'){const member=room?.members.find(m=>m.nick===clickedRoomPlan?.member),config=member?.share?.configurations?.find(c=>c.champion===clickedRoomPlan.id&&c.role===clickedRoomPlan.role);return config?roomClientPlan(config,data,member.share.strategy,{localStrategy:captureRoomStrategy(slots,data,activeCreativePlan,config.mode)}):null;}return view==='task'?ownTaskPreparation():view==='room'?roomOwnPreparation():view==='companion'?companionPreparation():view==='build'&&buildView?{selection:buildSelection(),build:buildView.build}:null;}
function returnToTeamAfterPreparation(selection){
 const current=companionPreparation()?.selection;
 if(windowLayout.docked&&['id','role','mode'].every(field=>current?.[field]===selection[field])){companionPreview=null;companionTab='plan';companionScroll.delete('plan');}
}
async function useClientPreparation(el,directClick=false,expected=null){
 if(!api.prepareSelection)throw Error('客户端配置请在桌面版使用');
 if(clientPreparing||runeApplying||itemSetPending)throw Error('当前配置正在处理，请等待完成');
 const view=el.dataset.preparationView,plan=selectedClientPreparation(view),prepared=clientPreparationPlan(data,plan);
 if(readOnlyPreparation(view,plan))throw Error(taskOwnRole()?'当前是只读配置，请回到本人的准备操作':'请先确认本人位置，再预选并配置');
 if(expected&&(!plan||taskOwnRole()!==expected.role||['id','role','mode'].some(k=>plan.selection[k]!==expected[k])||expected.planId!==(activeCreativePlan?.id||'')||prepared?.fingerprint!==expected.fingerprint))throw Error('本人位置或点击的方案已变化，尚未操作；请重新选择');
 if(!prepared||!directClick&&(el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':')||el.closest('[data-client-preparation-fingerprint]')?.dataset.clientPreparationFingerprint!==prepared.fingerprint))throw Error('页面方案已变化，请核对后重新点击');
 const clickedContext=runeWriteContext(client),gameId=preparationGameId(client),key=clientPreparationKey(client,prepared),selection=structuredClone(plan.selection),clickedPlanId=activeCreativePlan?.id||'';
 clientPreparing=true;preparationPendingKey=key;clientPreparationStatuses.delete(key);render();if(buildView)renderBuild();
 try{
  await sync(false,{fresh:true});
  const current=clientPreparationPlan(data,selectedClientPreparation(view));
  if(!current||current.fingerprint!==prepared.fingerprint||preparationGameId(client)!==gameId||JSON.stringify(runeWriteContext(client))!==JSON.stringify(clickedContext))throw Error('选人或方案已变化，尚未操作；请重新核对');
  await persist({throwOnError:true});await guideSyncChain;
  const dispatchPlan=selectedClientPreparation(view),dispatch=clientPreparationPlan(data,dispatchPlan);
  if(!dispatch||dispatch.fingerprint!==prepared.fingerprint||readOnlyPreparation(view,dispatchPlan)||preparationGameId(client)!==gameId||JSON.stringify(runeWriteContext(client))!==JSON.stringify(clickedContext)||expected&&(taskOwnRole()!==expected.role||expected.planId!==(activeCreativePlan?.id||'')))throw Error('本人位置、选人或方案已变化，尚未操作；请重新核对');
  const result=await api.prepareSelection({...prepared.value,selection,sessionGameId:gameId,context:clickedContext});
  if(!result.preparationRevision||result.preparationRevision>=preparationRevision)clientPreparationStatuses.set(key,result);
  if(result.steps?.runes?.status==='done')runeAppliedKeys.clear();
  if(result.steps?.hover?.status==='done'&&preparationGameId(client)===gameId){
   const own=client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId),id=champ(selection.id)?.key,target=slots.find(s=>s.role===selection.role);
   if(target&&(!Number.isInteger(target.clientCellId)||target.clientCellId===own?.cellId)&&(!own?.championId||own.championId===id)){
    if(target.champion!==selection.id)slots=slots.map(s=>s===target?{role:s.role,party:s.party,...(s.partyManual?{partyManual:true}:{}),champion:selection.id,locked:true,automaticPosition:true}:s);
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
  if(result.complete&&['companion','incoming-room','incoming-ballot'].includes(view))returnToTeamAfterPreparation(selection);
  toast(result.complete?'预选与配置已完成，锁定请在客户端确认':'部分步骤未完成，请查看操作结果',!result.complete);return result;
 }catch(error){const message=String(error.message||'操作未完成').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');const completed=clientPreparationStatuses.get(key);clientPreparationStatuses.set(key,completed?{...completed,followUpError:message}:{message});throw error;}
 finally{clientPreparing=false;preparationPendingKey='';while(clientPreparationStatuses.size>30)clientPreparationStatuses.delete(clientPreparationStatuses.keys().next().value);render();if(buildView)renderBuild();}
}
async function claimPosition(role){
 const id=roleClaimChampion(client,role,data.champions);if(!id||!api.prepareSelection)return;
 if(clientPreparing||runeApplying||itemSetPending)return;
 const context=runeWriteContext(client),gameId=preparationGameId(client);
 const selection={id,role,mode:'rift'},plan={selection,build:getBuild(champ(id),role,data,selection)},prepared=clientPreparationPlan(data,plan);
 if(!prepared)return;
 clientPreparing=true;render();
 try{await sync(false,{fresh:true});if(taskOwnRole()!==role||roleClaimChampion(client,role,data.champions)!==id||JSON.stringify(runeWriteContext(client))!==JSON.stringify(context))throw Error('选人已变化，请重新选择位置');
 const result=await api.prepareSelection({...prepared.value,selection,sessionGameId:gameId,context,preselectOnly:true});
 if(result.steps?.hover?.status!=='done')throw Error(result.steps?.hover?.message||'预选未完成');
 await sync(false,{fresh:true});companionTab='recommend';toast('已预选'+champ(id).name+'占位，仍可自由换英雄');
 }finally{clientPreparing=false;render();}
}
function setCompanionRole(role){
 if(role&&!ROLES.some(r=>r.id===role))throw Error('请确认方案位置');
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
 if(role&&Number.isInteger(cellId))saved.draft={...saved.draft,playerPosition:{role,cellId}};else if(saved.draft)delete saved.draft.playerPosition;
 soloRole=role||assignedPlayerRole()||'';companionPreview=null;pendingIntentPreparation=null;unassigned=unassignedPublicPicks(slots,client.session,data.champions);invalidate();
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
 const incoming=roomBallotView(room,publicDraftContext(),data.champions)+roomSharesView(room,champ,{compact:true,clickPrepare:saved.preferences.clickPrepare!==false,heroAction:memberHeroAction,adoptedShare:lastAdoptedRoomShare,allowRiftAdoption:!client.connected||client.phase!=='ChampSelect'||client.mode?.id==='rift',allowUnknownRift:client.connected&&client.phase==='ChampSelect'&&client.mode?.id==='rift'});
 const notice=creativePlanNotice?`<p class="callout warning" data-creative-plan-notice role="status">${e(creativePlanNotice)}</p>`:'';
 const plan=ownTaskPreparation(),ready=!!activeCreativePlan||!!myPreparation()||!!currentPickIntent()||!!lastTaskSelection&&!!plan;
 if(ready&&!draftComparing){
  const selected=(client.session?.actions||[]).flat().some(a=>a.type==='pick'&&a.actorCellId===client.session?.localPlayerCellId&&a.completed===true),ownRole=taskOwnRole();
  const claim=ownRole?'':`<section class="claim-own-role"><b>你玩哪位？</b>${(activeCreativePlan?.members||slots.filter(s=>s.champion).map(s=>({role:s.role,champion:s.champion}))).map(m=>button('solo-role',e(champ(m.champion)?.name)+' · '+roleName(m.role),'','small',`data-role="${m.role}"`)).join('')}</section>`;
  return '<div class="draft-task-workspace" data-eligibility="'+e(eligibility.status)+'">'+notice+incoming+pregameControls({scope,style,ownRole,slots,room,party:client.party})+adoptedTaskView({data,plan,activePlan:activeCreativePlan,controls:claim+taskControls(),ownRole,selected,roster:'<div class="task-roster slots">'+slots.map(s=>slotHTML(s)).join('')+'</div>',details:results.length?button('result-detail','完整玩法','','quiet small','data-index="0"'):''})+'</div>';
 }
 const live=clientDraftStatus(client,slots,data.champions);
 return `<section class="draft-compare-workspace" data-eligibility="${e(eligibility.status)}"><header class="draft-compare-header"><div><h1>开黑选人</h1></div><div>${ready?button('task-return','返回本局方案','','small'):''}</div></header>
 <div class="task-roster slots">${slots.map(s=>slotHTML(s)).join('')}</div>
 ${pregameControls({scope,style,ownRole:taskOwnRole(),slots,room,party:client.party})}${incoming}
 ${eligibility.status==='checked'||eligibility.status==='manual'?'':pickEligibilityView(eligibility)}${recommendationError?`<section class="callout warning recommendation-error"><p>${e(recommendationError)}</p>${button('role-pools','调整位置英雄池','','small')}${button('exclusions','调整排除英雄','','small')}</section>`:''}
 <div class="draft-list-heading recommend-heading"><div class="draft-result-actions"><h2>${scope==='solo'?'推荐英雄':'推荐阵容'}</h2>${button(results.length?'reroll':'recommend',generating?'正在搭配…':results.length?'换一批':scope==='solo'?'推荐英雄':'推荐阵容','spark','primary small',generating?'disabled':'')}${button('task-rankings','本路排行','','quiet small')}</div></div>
 <div class="task-candidate-list">${results.length?results.slice(0,showAllCandidates?6:3).map((r,i)=>resultCard(r,i)).join('')+(results.length>3?button('more-candidates',showAllCandidates?'收起备选':'更多候选','','quiet small'):''):generating?'<div class="empty-state" role="status">正在推荐…</div>':'<div class="empty-state draft-empty">'+(scope==='solo'&&!taskOwnRole()?'选择本人位置，自动推荐英雄。':'按当前队伍推荐，可调整上方位置与风格。')+'</div>'}</div><footer class="draft-compare-status">${e(client.connected?phaseLabel(client.phase)+' · '+(client.mode?.label||'模式待确认'):'手动搭配 · 连接客户端后可预选配置')}<span data-client-countdown>${live.remaining!==null?' · 约剩 '+live.remaining+' 秒':''}</span>${creativePlanNotice?`<span data-creative-plan-notice role="status"> · ${e(creativePlanNotice)}</span>`:''}</footer></section>`;
}
function slotHTML(s){const c=champ(s.champion),mine=scope==='solo'?s.role===soloRole:s.party,pick=client.session?.myTeam?.find(p=>p.cellId===s.clientCellId);return `<article data-drop-role="${s.role}" class="slot ${mine?'party':''}">${c&&!selectedInClient(s)?`<button class="slot-clear" data-action="clear-slot" data-role="${s.role}" aria-label="清空${roleName(s.role)}">×</button>`:''}<div class="slot-role"><span class="role-icon">${ROLES.find(r=>r.id===s.role).short}</span>${roleName(s.role)}</div><button class="champ-pick" draggable="${!!c}" data-drag-role="${s.role}" data-action="${c?'build':'pick-slot'}" ${c?`data-id="${c.id}" data-prepare-click="true"`:''} data-role="${s.role}" aria-label="${c?memberHeroAction(c.id,s.role).label:'选择'}${roleName(s.role)}英雄">${portrait(c).replace('<img ','<img draggable="false" ')}<span class="champ-name">${c?e(c.name):'选择英雄'}</span></button>${c?`<div class="slot-meta">${selectedInClient(s)?pick?.pickState==='locked'?'已锁定':'已预选':''}</div>`:''}${c?`<button class="slot-move" data-action="move-slot" data-role="${s.role}" aria-label="移动${e(c.name)}的位置" title="也可拖动头像交换位置">调整位置</button>`:''}<div class="slot-bottom"><button class="slot-toggle ${mine?'on':''}" data-action="${scope==='solo'?'solo-role':'toggle-party'}" data-role="${s.role}" title="${scope==='solo'?'选择我的位置':'切换是否参与我们的推荐'}" >${scope==='solo'?(mine?'我':'选为我的位置'):(s.party?'我们':'队友')}</button>${c?`<button class="slot-config" data-action="build" data-id="${c.id}" data-role="${s.role}" aria-label="查看${roleName(s.role)}配置">配置</button><button class="slot-lock ${s.locked?'on':''}" data-action="toggle-lock" data-role="${s.role}" ${selectedInClient(s)?'disabled title="客户端已选英雄保留，可调整位置"':''} aria-label="${s.locked?'允许推荐替换':'推荐时保留'}${roleName(s.role)}">${icon(s.locked?'pin':'refresh')}</button>`:''}</div></article>`;}
function resultCard(r,i=0){return renderResultCard(r,i,data,saved,style,room);}
function renderLibrary(){return `${heading('','符文与出装','选择英雄和本局位置，快速查看配套配置。','sword')}<div class="library-toolbar"><div class="search-wrap">${icon('search')}<input id="library-search" placeholder="搜英雄、称号、昵称或拼音，例如：女枪 / mf" value="${e(libraryQuery)}" aria-label="搜索英雄配置" /></div><span class="badge">${data.champions.length} 位英雄</span></div><div class="chips library-rolebar">${[['all','全部位置'],...ROLES.map(r=>[r.id,r.name])].map(([id,n])=>`<button class="chip ${libraryRole===id?'active':''}" data-action="library-role" data-role="${id}">${n}</button>`).join('')}</div><div class="library-grid" id="library-grid">${libraryTiles()}</div><details class="ui-help"><summary>配置来源</summary><p>优先展示所选来源的当前版本配置；没有位置样本时使用机制基础方案。</p></details>`;}
function libraryTiles(){const evidence=buildRoleEvidence(data),supported=new Set(evidence.filter(r=>r.role===libraryRole).map(r=>r.champion));return data.champions.filter(c=>matchesSearch(c,libraryQuery)&&(libraryRole==='all'||profile(c,libraryRole).roles.includes(libraryRole)||supported.has(c.id))).map(c=>`<button class="hero-tile" data-action="build" data-id="${c.id}" data-role="${libraryRole==='all'?profile(c).roles[0]:libraryRole}">${portrait(c)}<b>${e(c.name)}</b><small>${e(c.title)}${libraryRole!=='all'&&!profile(c,libraryRole).roles.includes(libraryRole)?' · 来源有此位置参考':''}</small></button>`).join('')||'<div class="empty-state">没有找到英雄，试试其他称呼。</div>';}
function renderHex(){return `${heading('','海克斯手册','查强化、找思路，把想玩的组合收藏起来。','hex')}<div class="hex-layout"><aside class="panel hex-side"><div class="panel-head"><h3>英雄与备选</h3></div><div class="panel-body"><button class="btn" style="width:100%" data-action="pick-hex">${hexHero?portrait(champ(hexHero),'sm'):icon('team')}${hexHero?e(champ(hexHero)?.name):'选择一个英雄'}</button>${hexHero?button('build','查看海克斯出装','sword','small',`data-id="${hexHero}" data-role="${profile(champ(hexHero)).roles[0]}" data-mode="hex"`):''}<div class="detail-section" style="margin-top:16px"><h3>我的强化备选 <span class="badge">${hexSelected.length}</span></h3><div class="chips">${hexSelected.map(id=>`<button class="chip active" data-action="toggle-augment" data-id="${id}">${e(data.augments.find(a=>a.id===id)?.name)} ×</button>`).join('')}</div></div>${button('save-hex',saved.favorites.some(f=>f.id===hexFavoriteId())?'已收藏 · 点击取消':'收藏这套灵感','star','primary small',hexSelected.length?'':'disabled')}</div></aside><section><div class="library-toolbar"><div class="search-wrap">${icon('search')}<input id="hex-search" value="${e(hexQuery)}" placeholder="搜索强化名称或效果" aria-label="搜索海克斯强化" /></div><select class="select" id="hex-category" aria-label="强化效果分类"><option value="all">全部效果</option>${AUGMENT_CATEGORIES.map(([id,name])=>`<option value="${id}" ${hexCategory===id?'selected':''}>${name}</option>`).join('')}</select><select class="select" id="hex-rarity" aria-label="强化稀有度"><option value="all">全部稀有度</option>${Object.entries(rarityName).map(([id,n])=>`<option value="${id}" ${hexRarity===id?'selected':''}>${n}</option>`).join('')}</select></div>${renderHexComparison({data,hero:hexHero,options:hexOptions,owned:hexOwned})}${hexHero?renderHexReference():''}<div class="toolbar"><span class="muted" style="font-size:11px">${data.augments.length} 项强化 · 资料 ${e(data.augmentVersion||data.version)}</span><button class="chip ${hexSelectedOnly?'active':''}" data-action="hex-selected">只看已选</button></div><div class="augment-grid" id="augment-grid">${augmentTiles()}</div></section></div>`;}

function renderHexReference(){return renderHexSourceReference({data,hero:hexHero,filtered:hexForHero});}

function augmentTiles(){const heroIds=data.hexBuilds?.[hexHero]?.augmentIds||[];return data.augments.filter(a=>(hexCategory==='all'||augmentCategories(a).includes(hexCategory))&&(!hexForHero||heroIds.includes(a.id))&&(!hexSelectedOnly||hexSelected.includes(a.id))&&(hexRarity==='all'||a.rarity===hexRarity)&&`${a.name} ${a.description}`.toLowerCase().includes(hexQuery.toLowerCase())).map(a=>`<button class="augment-card ${hexSelected.includes(a.id)?'selected':''}" data-action="augment-detail" data-id="${a.id}"><div class="augment-title">${asset('augment',a.id,a.name)}<div><b>${e(a.name)}</b><div class="rarity-${a.rarity}" style="font-size:10px">${rarityName[a.rarity]||'特殊'}</div></div></div><p>${e(a.description?a.description.slice(0,96)+(a.description.length>96?'…':''):'已收录当前模式清单，具体效果待补充。以客户端说明为准。')}</p><div class="augment-footer"><span>${hexSelected.includes(a.id)?'✓ 已加入备选':'查看详情'}</span>${icon('chevron')}</div></button>`).join('')||'<div class="empty-state">没有匹配的强化，试试其他筛选条件。</div>';}
function renderFavorites(){return `${heading('KEEP THE GOOD IDEAS.','下次就玩这套','只收藏你喜欢的搭配，不记录战绩。','star')}${saved.favorites.length?`<div class="favorite-list">${saved.favorites.map((f,i)=>`<article class="favorite-card"><div style="display:flex;justify-content:space-between"><span class="badge ${f.type==='hex'?'purple':'green'}">${f.type==='hex'?'海克斯灵感':f.type==='build'?'英雄配置':'开黑组合'}</span><button class="favorite-button" data-action="delete-favorite" data-index="${i}" aria-label="删除收藏${e(f.title)}">${icon('trash')}</button></div><h3>${e(f.title)}</h3><div style="display:flex;gap:8px;margin-top:12px">${(f.type==='team'?f.slots?.filter(s=>s.party).map(s=>s.champion):[f.champion]).filter(Boolean).slice(0,5).map(id=>portrait(champ(id),'sm')).join('')}</div>${favoriteBuildSummary(data,f)}${favoriteTeamSummary(data,f,i)}<p>${f.type==='hex'?e((f.augments||[]).map(id=>data.augments.find(a=>a.id===id)?.name||'旧版强化').join(' · ')):`收藏于 ${dateLabel(f.createdAt)}`}<br>保存版本 ${e(f.version||'未知')}${f.version&&f.version!==data.version?' · 当前版本已变化':''}</p>${button('open-favorite',f.type==='team'?'载入开黑成员与配置':'查看收藏','arrow','small',`data-index="${i}"`)}${f.type==='team'?button('update-team-favorite','用最近选择更新配置','refresh','quiet small',`data-index="${i}"`):''}</article>`).join('')}</div>`:`<section class="panel"><div class="empty-state">${icon('star')}<h3>留住想玩的点子</h3><p>在推荐方案、英雄配置或海克斯手册中点击收藏，下次打开就能找到。</p>${button('go-draft','去看看开黑组合','arrow','primary')}</div></section>`}`;}
function renderSettings(){
 const toggle=(action,label,on)=>`<div class="setting-row"><b>${label}</b><button class="switch ${on?'on':''}" data-action="${action}" role="switch" aria-checked="${on}" aria-label="${label}"><i></i></button></div>`;
 return `${heading('','设置','','settings')}<div class="settings-grid">
 <section class="panel"><div class="panel-head"><h3>窗口与显示</h3></div><div class="panel-body"><div class="settings-actions">${button('player-flow-settings','选人与侧栏','settings','small')}${button('presentation-open','字号与局内指引','settings','small')}${button('recover-guide','找回指引','book','quiet small')}</div>${toggle('client-companion','选人时显示侧栏',saved.preferences.clientCompanion!==false)}${toggle('guide-auto-show','进入对局时显示指引',saved.preferences.guideAutoShow!==false)}<div class="setting-row"><b>对局结束后</b><select class="select" id="guide-after-game" aria-label="游戏结束后的指引">${[['hide','隐藏指引'],['collapse','收起小窗'],['keep','保持显示']].map(([id,n])=>`<option value="${id}" ${(saved.preferences.guideAfterGame||'hide')===id?'selected':''}>${n}</option>`).join('')}</select></div><details class="ui-help"><summary>窗口与快捷键说明</summary><p>助手 Ctrl + Shift + Space；指引 Ctrl + Shift + G。窗口可移动、缩放，并在窗口设置恢复默认。</p><p>游戏建议使用无边框或窗口模式。独占全屏可能遮住指引。</p>${button('window-info','窗口检查','','small')}</details></div></section>
 <section class="panel"><div class="panel-head"><h3>游戏启动与连接</h3><span class="badge ${client.connected?'green':''}">${client.connected?'已连接':'未连接'}</span></div><div class="panel-body">${!client.connected?`<p class="callout warning">${e(client.message)}</p>`:''}<div class="setting-row"><div><b>启动程序</b><p>${e(saved.preferences.launchPath||'自动：优先 WeGame 英雄联盟')}</p></div>${button('choose-launch-path','选择程序','','small')}${button('reset-launch-path','恢复默认','','small')}</div><div class="settings-actions">${button('launch-game','打开英雄联盟','arrow','primary')}</div><div class="setting-row"><div><b>游戏目录</b><p style="word-break:break-all">${e(saved.preferences.installPath||'自动检测')}</p></div>${button('choose-dir','更改','','small')}</div><div class="settings-actions">${button('sync',syncing?'连接中…':'重新连接','refresh','small',syncing?'disabled':'')}</div>${toggle('auto-sync','自动同步选人',saved.preferences.autoSync!==false)}${toggle('auto-live','读取局内装备',saved.preferences.autoLive!==false)}<details class="ui-help"><summary>连接与权限说明</summary><p>只读取公开选人和本机局内接口，手动安排的位置会保留。配置客户端需要你点击。</p><p>若 Windows 提示授权，请确认后继续。连接失败时仍可手动搭配和查资料；也可退出助手后以管理员身份运行。</p></details></div></section>
 ${appUpdatePanel({version:boot?.version,preferences:saved.preferences,update:appUpdate})}
 <section class="panel"><div class="panel-head"><h3>游戏资料</h3><span class="badge">${e(data.version)}</span></div><div class="panel-body">${toggle('auto-check','每日检查基础资料',!!saved.preferences.autoCheck)}<div class="setting-row"><span>${dateLabel(data.fetchedAt)}</span>${button('update',updating?'更新中…':'检查更新','refresh','small',updating?'disabled':'')}</div>${updateMessage?`<p id="update-message" role="status">${e(updateMessage)}</p>`:'<span id="update-message" role="status"></span>'}<details class="ui-help"><summary>版本与离线说明</summary><p>国服版本以客户端为准。英雄基础资料、统计配置和人工搭配规则分别更新；离线使用缓存。</p></details></div></section>
 <details class="settings-details"><summary>组合库管理</summary>${catalogPanel(data)}</details>
 <details class="settings-details"><summary>数据来源与版本</summary><div class="panel-body">${[['Riot Data Dragon','英雄、装备、符文、召唤师技能','https://developer.riotgames.com/docs/lol'],['腾讯英雄联盟','国服名称与搜索别名','https://lol.qq.com/data/info-heros.shtml'],['CommunityDragon','英雄数值与游戏资源','https://www.communitydragon.org'],['OP.GG',buildSourceLabel(data.buildSource),'https://op.gg/lol/champions']].map(([n,desc,url])=>`<div class="source-row"><span><b>${n}</b> · ${e(desc)}</span>${button('link','查看','','quiet small',`data-url="${url}"`)}</div>`).join('')}<p class="bottom-note">机制规则 ${RULES_PATCH}，不预测胜率。${data.patch!==RULES_PATCH?'基础资料已更新，规则仍需复核。':''}${data.augmentError?e(data.augmentError):''}</p></div></details>
 <details class="settings-details"><summary>备份与关于</summary><div class="panel-body"><div class="settings-actions">${button('import','导入备份','upload','small')}${button('export','导出备份','download','small')}</div><p class="bottom-note">备份收藏、英雄池和偏好；导入时合并收藏与排除列表。</p><p class="bottom-note">${e(boot.dataPath||'当前浏览器')}<br>游戏资源归 Riot Games 所有。开黑搭子是独立工具，未获 Riot Games 或腾讯认可或赞助。</p></div></details></div>`;
}
function openPicker(kind,role=null){picker={kind,role,query:'',filter:kind==='slot'?role:'all'};buildView=null;detailResult=null;renderPicker();requestAnimationFrame(()=>document.getElementById('picker-search')?.focus());}
function renderPicker(){overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal" role="dialog" aria-modal="true" aria-label="选择英雄"><header class="modal-header"><div><h2>${picker.kind==='rolepool'?roleName(picker.role)+'英雄池':picker.kind==='pool'?'我们的英雄池':picker.kind==='excluded'?'不想玩的英雄':picker.kind==='hex'?'选择海克斯英雄':`选择${roleName(picker.role)}英雄`}</h2><p>${picker.kind==='pool'?'点击标记你们愿意玩的英雄；推荐范围可设为优先或仅使用这些英雄。':picker.kind==='excluded'?'点击切换排除状态；推荐时会跳过这些英雄。':'支持中文名、称号、英文名与拼音；非常规玩法可切换到全部。'}</p></div>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="modal-controls"><div class="search-wrap">${icon('search')}<input id="picker-search" aria-label="搜索英雄" value="${e(picker.query)}" placeholder="搜英雄，例如：亚索 / 女枪 / jh" /></div><div class="chips">${[['all','全部'],...ROLES.map(r=>[r.id,r.name])].map(([id,n])=>`<button class="chip ${picker.filter===id?'active':''}" data-action="picker-role" data-role="${id}">${n}</button>`).join('')}</div></div><div class="champ-grid" id="picker-grid">${pickerTiles()}</div><footer class="modal-footer">${picker.kind==='rolepool'?`${roleName(picker.role)}已有 ${saved.preferences.rolePools[picker.role].heroes.length} 位英雄`:picker.kind==='pool'?`英雄池已有 ${saved.preferences.pool.length} 位英雄`:picker.kind==='excluded'?`已排除 ${saved.excluded.length} 位英雄`:'英雄的位置由你决定，选中后默认锁定。'}</footer></section></div>`;}
function pickerTiles(){const match=pickerMatches(data.champions,picker.query,picker.filter,matchesSearch,profile);return (match.fallback?'<p class="picker-fallback">当前筛选位置无常规英雄，以下为其他位置的搜索结果。选中后仍放在'+roleName(picker.role||picker.filter)+'。</p>':'')+match.champions.map(c=>{const used=picker.kind==='slot'&&slots.some(s=>s.role!==picker.role&&s.champion===c.id);return `<button class="champ-option ${used?'used':''} ${(picker.kind==='excluded'&&saved.excluded.includes(c.id)||picker.kind==='pool'&&saved.preferences.pool.includes(c.id)||picker.kind==='rolepool'&&saved.preferences.rolePools[picker.role].heroes.includes(c.id))?'selected':''}" data-action="pick-champion" data-id="${c.id}" aria-label="${e(c.name)}" ${used?'disabled':''} title="${e(c.name)} · ${e(c.title)}">${portrait(c)}<span>${e(c.name)}</span></button>`;}).join('')||'<p class="muted">没有找到匹配英雄。</p>';}
function closeOverlay(){roomDialogOpen=false;roomConfigurationView=null;activeOverlaySelect=null;pendingBuildRender=false;renderedBuildContext=null;currentWindowInfo=null;catalogRequest++;comboView=null;picker=null;buildView=null;detailResult=null;buildReturn=null;overlay.innerHTML='';}
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
 const source=normalizeBuildSource(data.buildSource),key=buildKey(id,role,mode,source),patch=data.patch;buildErrors.delete(key);
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
    if(previousRecommendation!==recommendationKey(recommendationInput()))invalidate();
   }
   if(!silent)toast(mode==='hex'?(ref.patch===data.patch?'已刷新本版本配置':`继续使用 OP.GG ${ref.patch} 旧版本参考；当前资料 ${data.patch}`):`已缓存${buildSourceLabel(ref)} · ${ref.patch}${ref.patch!==data.patch?' 旧版本参考':''}`);return ref;
  }catch(error){const message=String(error.message||'版本配置刷新未完成').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');buildErrors.set(key,message);if(!silent)toast(message,true);return null;}
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
 const own=currentPlayerSelection(client.session,data.champions,slots),eligibility=localPickEligibility(client,slots,data.champions,{scope,soloRole,playerPosition:saved.draft?.playerPosition,now:referenceTime});
 const session=client.connected?client.session:null,contextSession=(scope==='solo'||draftComparing)&&session?{...session,myTeam:session.myTeam.map(p=>p.cellId===session.localPlayerCellId?{...p,championPickIntent:0}:p)}:session;
 const base=draftComparing||scope==='solo'?comparisonDraft(slots,activeCreativePlan,session,data.champions):slots,contextSlots=recommendationDraft(base,contextSession,data.champions,{ownRole:taskOwnRole(),bans:clientBans,disabled:client.eligibility?.disabled||[],eligibleByRole:eligibility.eligibleByRole});
 return {soloRole,soloChampion:scope==='solo'?(own?.id||base.find(s=>s.role===soloRole&&s.locked)?.champion||null):null,slots:contextSlots,champions:data.champions,builds:data.builds,pairStatistics:data.pairStatistics,buildSource:data.buildSource,patch:data.patch,sourceRoles:currentRoleEvidence(),style,scope,pool:saved.preferences.pool,poolMode:saved.preferences.poolMode,play:saved.preferences.play,rolePools:saved.preferences.rolePools,catalog:data.catalog,catalogStatus:data.catalogInfo?.status,excluded:[...saved.excluded],publicBans:clientBans,eligibleByRole:eligibility.eligibleByRole,confirmedPick:eligibility.confirmedPick,publicPicks:[...new Set([...unassigned.map(p=>p.champion),...unassignedPublicPicks(slots,client.session,data.champions).map(p=>p.champion)])],enemy:client.session?.allowDuplicatePicks===false?publicMatchupIds():[],visibleEnemies:publicMatchupIds(),creativePlan:draftComparing?null:activeCreativePlan,version:data.version,catalogVersion:data.catalog.version,limit:6,offset};
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
 if(generating)return;cancelRecommendationReveal();recommendationError='';const run=++recommendationRun;let reveal=false;generating=true;render();
 try{offset=next?offset+(results.length||6):0;const input=recommendationInput();
  const signature=recommendationKey(input);
  let result=await calculateRecommendation(input);if(!result.length&&offset){offset=0;result=await calculateRecommendation({...input,offset:0});}
  if(run!==recommendationRun||signature!==recommendationKey(recommendationInput()))return;
  for(const r of result)resultCreativePlan(r);results=result;showAllCandidates=false;resultsSignature=signature;if(!result.length)recommendationError='当前位置英雄池与公开选人无法组成不重复的阵容，请调整限制';if(!results.length)toast(recommendationError,true);else reveal=true;
 }catch(err){if(!err.cancelled&&run===recommendationRun){recommendationError=err.message;toast(err.message,true);}}finally{if(run===recommendationRun){generating=false;render();}}
}
const sync=createClientSync(performSync);
let sharedClient=null;
async function performSync(manual=true,fresh=false){
 const previousOwnIntent=client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId)?.championPickIntent||0;
 lastSyncStarted=Date.now();syncing=true;const before=lastRenderedClient||clientRenderIdentity(client),previousMatchups=matchupContext(),previousPhase=client.phase,previousRecommendation=recommendationKey(recommendationInput());let changed=false,newGame=false;if(manual)render();
 try{
  await saveChain;const incoming=sharedClient;sharedClient=null;client=!manual&&!fresh&&incoming?incoming:await api.client(manual||fresh);drainExternalState();
  const selectionContext=client.selectionContext||'';if(api.matchupFocus&&lastMatchupSession!==selectionContext){matchupTargets.clear();lastMatchupSync='';}lastMatchupSession=selectionContext;
  const matchupGame=publicClientGameId(client)||'';
  if(matchupGame&&lastMatchupGame&&matchupGame!==lastMatchupGame||client.phase==='ChampSelect'&&!['Offline','ChampSelect'].includes(previousPhase)||['None','Lobby','Matchmaking','ReadyCheck'].includes(client.phase))matchupTargets.clear();
  if(matchupGame)lastMatchupGame=matchupGame;
  if(client.connected&&client.receivedAt)lastClientRead=client.receivedAt;else if(lastClientRead)client.receivedAt=lastClientRead;
  if(manual&&client.needsElevation){toast('正在请求 Windows 连接授权…');client=await api.authorizeClient();}
  const draftContext=reconcileClientDraft({...saved.draft,slots,style,scope,soloRole},publicClientGameId(client),saved.guide?.match?.gameId);
  if(draftContext.changed){saved.draft=draftContext.draft;slots=saved.draft.slots;soloRole=saved.draft.soloRole;changed=true;if(draftContext.newGame){newGame=true;lastTaskSelection=null;if(activeCreativePlan&&!saved.draft.creativePlan)creativePlanNotice='新局已开始，原组合不会自动沿用；可以从收藏重新选择。';activeCreativePlan=saved.draft.creativePlan||null;pendingIntentPreparation=null;companionPreview=null;matchupTargets.clear();unassigned=[];}persist({derived:!manual});}
  if(client.session){
   const nextOwnIntent=client.session.myTeam.find(p=>p.cellId===client.session.localPlayerCellId)?.championPickIntent||0;
   const ownIntentChanged=!candidatePreparing&&!clientPreparing&&previousOwnIntent!==nextOwnIntent;
   if(ownIntentChanged)lastTaskSelection=null;
   // Recognizing a party updates its members, not an explicit recommendation scope.
   const merged=mergeClientSession(slots,client.session,data.champions,clientSyncOptions());merged.slots=restorePlayerPosition(merged.slots,client.session,data.champions,saved.draft?.playerPosition);merged.unassigned=unassignedPublicPicks(merged.slots,client.session,data.champions);
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
    const cleaned=clearClientPicks(slots);if(JSON.stringify(cleaned)!==JSON.stringify(slots)){slots=cleaned;changed=true;persist({derived:!manual});}
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
 itemSetPending=action;itemSetStatuses.set(key,{text:authorize?'正在等待 Windows 连接授权…':action==='import-item-set'?'正在写入当前装备集…':'正在导出当前装备集…'});render();if(buildView)renderBuild();
 try{
  if(authorize)await api.authorizeClient();
  const result=await (action==='import-item-set'?api.importItemSet(itemSet):api.exportItemSet(itemSet));
  const text=action==='import-item-set'?itemSetSuccessStatus(result).text:result.exported?'已导出 JSON，可在客户端“藏品 → 装备”中导入。':'已取消导出，当前方案保留。';
  const current=action!=='import-item-set'||gameId===preparationGameId(client)&&(!result.preparationRevision||result.preparationRevision>=preparationRevision);
  if(current)itemSetStatuses.set(key,{...itemSetStatuses.get(key),text});if(current&&action==='import-item-set'&&el.dataset.itemsetView==='companion')returnToTeamAfterPreparation(plan.selection);toast(current?(result.title?text+' '+result.title:text):'装备集操作已结束，选人或配置已变化，请重新核对。');
 }catch(error){const text=String(error.message||'装备集操作未完成').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');itemSetStatuses.set(key,{text:text+(action==='import-item-set'&&!text.includes('导出')?'；可点击“导出 JSON”手动导入。':''),error:true,needsAuthorization:text.includes('连接授权')});toast(text,true);
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

document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');if(!el){if(event.target.dataset.backdrop)closeOverlay();return;}
 if(Date.now()-draggedAt<250)return;
 const action=el.dataset.action;try{
 const configuration=configurationEventSelection(el);
 if(configuration?.readOnly&&!readOnlyConfigurationAction(action))assertConfigurationEditable(configuration);
 if(action==='window-info'||action==='window-info-refresh'){await showWindowInfo(action==='window-info-refresh');return;}
 if(action==='window-info-copy'){if(!currentWindowInfo)throw Error('请先读取窗口资料');await api.copy(windowInfoText(currentWindowInfo));toast('窗口资料已复制');return;}
 if(action==='presentation-open'){updatePresentationDialog(overlay,saved.preferences.presentation);return;}
  if(action==='presentation'){const change={field:el.dataset.field,value:el.dataset.field==='textScale'?Number(el.dataset.value):el.dataset.value};saved.preferences.presentation=await api.presentation(change);render();updatePresentationDialog(overlay,saved.preferences.presentation);return;}
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
 if(action==='companion-favorite'){const plan=companionPreparation();if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('选人已变化，请核对当前方案');const v={...plan.selection,build:plan.build,conditions:plan.selection.conditions||[],coreIndex:plan.build.selectedCoreIndex||0};await addFavorite({id:savedBuild(v)?.id||buildFavoriteId(v),...selectedBuildFields(v,{preserveUnavailable:true}),type:'build',title:champ(v.id).name+' · '+v.build.title+(v.build.selectedRune?' · '+v.build.selectedRune.name:''),champion:v.id,role:v.role,mode:v.mode,conditions:v.conditions,coreIndex:v.coreIndex});render();return;}
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
  const action=memberHeroAction(id,role),preview=localConfigurationPreview({id,role,mode:'rift'},client,taskOwnRole());
  if(windowLayout.docked){
   const combo=currentCombo(slots,id,role,data.catalogInfo?.status,null,activeCreativePlan);
   companionPreview={...preview,...creativeComboContext(combo)};companionTab='plan';closeOverlay();render();
   if(action.prepare)await useClientPreparation({dataset:{preparationView:'companion'}},true);
  }else{showBuild(id,role,'rift',preview);if(action.prepare)await useClientPreparation({dataset:{preparationView:'build'}},true);}
  return;
 }
 if(action==='task-compare'){if(clientPreparing||runeApplying||candidatePreparing)throw Error('当前配置进行中，请等待完成后换方案');draftComparing=true;companionTab='recommend';cancelRecommendation();results=[];offset=0;await generate();return;}
 if(action==='task-return'){draftComparing=false;cancelRecommendation();results=[];offset=0;render();return;}
 if(action==='task-members'){renderTaskMembers();return;}
 if(action==='draft-filters'){overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal" role="dialog" aria-modal="true" aria-label="推荐偏好"><header class="modal-header"><h3>推荐偏好</h3>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="modal-body"><details class="draft-preferences" open><summary>${e(restrictionSummary())}</summary>${playControls(saved.preferences)}</details><div class="segmented">${Object.entries(STYLES).map(([id,s])=>`<button class="segment ${style===id?'active':''}" data-action="style" data-style="${id}">${s.name}</button>`).join('')}</div>${button('combination-library','浏览组合库','','small')}${button('hero-pool','英雄池','','small')}${button('role-pools','各位置英雄池','','small')}${button('exclusions','排除英雄','','small')}${button('reset-draft','清空未选英雄','','quiet small')}${pairRefreshView(data,currentPairTargets(),pairRefreshStatus())}${button('example','载入空阵容示例','','quiet small')}</div></section></div>`;return;}
 if(action==='task-rankings'){rankingRole=taskOwnRole()||'top';if(windowLayout.docked)companionTab='rankings';else route='rankings';render();return;}
 if(action==='task-edit'){const plan=ownTaskPreparation();if(!plan)throw Error('请先确认本人英雄与位置');if(windowLayout.docked){companionPreview=structuredClone(plan.selection);companionTab='plan';render();}else showBuild(plan.selection.id,plan.selection.role,plan.selection.mode,{...plan.selection,readOnly:false});return;}
 if(action==='companion-tab'){companionTab=el.dataset.tab;closeOverlay();render();return;}
 if(action==='companion-current'){companionPreview=null;companionTab='plan';closeOverlay();render();return;}
 if(action==='companion-preview'){await prepareCandidate(el);return;}
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
  if(windowLayout.docked){companionTab='room';closeOverlay();render();return;}closeOverlay();roomDialogOpen=true;renderRoomDialog();return;
 }
 if(action==='room-to-draft'){route='draft';companionTab='recommend';closeOverlay();render();queueCompanionRecommendation();return;}
 if(action==='active-hero-prepare'){
  if(!activeCreativePlan?.members.some(m=>m.champion===el.dataset.id&&m.role===el.dataset.role))throw Error('组合已变化，请重新选择');
  companionPreview=localConfigurationPreview({id:el.dataset.id,role:el.dataset.role,mode:'rift',...creativeComboContext(creativeMemberCombo(activeCreativePlan,el.dataset.id,el.dataset.role))},client,taskOwnRole());companionTab='plan';closeOverlay();render();if(memberHeroAction(el.dataset.id,el.dataset.role).prepare)await useClientPreparation({dataset:{preparationView:'companion'}},true);return;
 }
 if(action==='companion-roster-plan'){
  const visible=recommendationDraft(slots,client.connected?client.session:null,data.champions,{ownRole:taskOwnRole()});
  if(!visible.some(s=>s.role===el.dataset.role&&s.champion===el.dataset.id))throw Error('阵容已变化，请重新选择');
  const combo=currentCombo(visible,el.dataset.id,el.dataset.role,data.catalogInfo?.status,null,activeCreativePlan);
  companionPreview=localConfigurationPreview({id:el.dataset.id,role:el.dataset.role,mode:'rift',...creativeComboContext(combo)},client,taskOwnRole());companionTab='plan';closeOverlay();render();
  if(memberHeroAction(el.dataset.id,el.dataset.role).prepare)await useClientPreparation({dataset:{preparationView:'companion'}},true);return;
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
 if(action==='room-host'){if(!api.roomHost)throw Error('局域网房间请在桌面版使用');if(roomBusy)return;roomBusy=true;roomError='';render();try{room=await api.roomHost(saved.preferences.roomNick||'队友');roomAddresses=await api.roomAddresses?.()||[];roomShareSig='';roomShareWarned=false;await publishRoomShare({force:true});toast('房间已创建，把邀请码和口令发给队友');}catch(error){roomError=roomErrorMessage(error);}finally{roomBusy=false;}render();return;}
 if(action==='room-scan'){if(!api.roomScan)throw Error('局域网房间请在桌面版使用');if(roomScanning)return;roomScanning=true;roomScanResults=null;roomError='';render();try{roomScanResults=await api.roomScan();}catch(error){roomError=roomErrorMessage(error);}finally{roomScanning=false;}render();return;}
 if(action==='room-refresh-addresses'){roomAddresses=await api.roomAddresses?.()||[];render();toast('已刷新本机地址');return;}
 if(action==='room-fill'){roomInvite=el.dataset.invite||'';roomError='';render();return;}
 if(action==='room-join'){if(!api.roomJoin)throw Error('局域网房间请在桌面版使用');if(roomBusy)return;const target=decodeRoomInvitation(roomInvite.trim());if(!target)throw Error('粘贴房主复制的完整邀请，或输入 192.168.1.5:47833#482913');const secret=target.pin||roomPin.trim();if(!validPin(secret))throw Error('口令是 6 位数字');roomBusy=true;roomError='';render();try{room=await api.roomJoin({host:target.host,port:target.port,room:target.room,pin:secret},saved.preferences.roomNick||'队友');roomShareSig='';roomShareWarned=false;await publishRoomShare({force:true});}catch(error){roomError=roomErrorMessage(error);}finally{roomBusy=false;}render();return;}
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
  try{room=await api.roomRelay({url:roomRelayUrl.trim(),room:roomRelayRoom.trim(),pin:roomPin.trim()},saved.preferences.roomNick||'队友');roomShareSig='';roomShareWarned=false;await publishRoomShare({force:true});toast('已加入中继房间');}
  catch(error){roomError=roomErrorMessage(error);}
  finally{roomBusy=false;}
  render();return;}
 if(action==='propose-result'){
 const r=results[Number(el.dataset.index)];if(!r||resultsSignature!==recommendationKey(recommendationInput()))throw Error('候选已变化，请重新推荐');
 if(!room||room.mode==='idle')throw Error('先连接队友房间，再提议阵容');
 const strategy=resultCreativePlan(r),lineup=shareFromSlots(r.slots,null,'rift').lineup;
 const proposal={lineup,mode:'rift',configurations:captureRoomConfigurations(r.slots,data,preparations,{creativePlan:strategy,mode:'rift'}),...(strategy?{strategy}:{})};
 room=await api.roomBallot({version:1,proposal,vote:proposalKey(proposal)});render();toast('已提议并投票，等待队友选择');return;
 }
 if(action==='room-ballot-details'){
 const row=roomBallotBoard(room,publicDraftContext(),data.champions).find(r=>r.key===el.dataset.key);if(!row)throw Error('候选已撤回');
 closeOverlay();overlay.innerHTML='<div class="modal-backdrop" data-backdrop="true"><section class="modal" role="dialog" aria-modal="true" aria-label="候选阵容详情"><header class="modal-header"><h3>'+e(row.from)+'的提议</h3>'+button('close','','close','quiet icon-only','aria-label="关闭"')+'</header><div class="modal-body"><p>'+e(row.proposal.strategy?.why||row.proposal.strategy?.name||'分路搭配')+'</p>'+row.proposal.lineup.filter(s=>s.champion).map(s=>'<div class="setting-row"><b>'+e(champ(s.champion)?.name||s.champion)+' · '+roleName(s.role)+'</b>'+button('room-ballot-hero','查看配置','','small','data-key="'+e(row.key)+'" data-id="'+e(s.champion)+'" data-role="'+s.role+'" data-readonly="true"')+'</div>').join('')+'<p class="bottom-note">'+e(row.fit.reason)+'</p></div></section></div>';return;
 }
 if(action==='room-ballot-hero'){
 const row=roomBallotBoard(room,publicDraftContext(),data.champions).find(r=>r.key===el.dataset.key);if(!row)throw Error('候选已撤回');
 const config=row.proposal.configurations?.find(c=>c.champion===el.dataset.id&&c.role===el.dataset.role);
 if(config&&el.dataset.readonly!=='true'&&memberHeroAction(el.dataset.id,el.dataset.role).prepare){clickedRoomPlan={ballotKey:row.key,id:el.dataset.id,role:el.dataset.role};await useClientPreparation({dataset:{preparationView:'incoming-ballot'}},true);}
 else if(config){closeOverlay();roomConfigurationView={config:structuredClone(config),from:row.from,strategy:row.proposal.strategy?structuredClone(row.proposal.strategy):null,localStrategy:captureRoomStrategy(slots,data,activeCreativePlan,config.mode)};overlay.innerHTML=roomConfigurationDialog(roomConfigurationView.config,data,row.from,roomConfigurationView.strategy,{localStrategy:roomConfigurationView.localStrategy});}
 else{closeOverlay();overlay.innerHTML=roomMissingConfigurationDialog({id:el.dataset.id,role:el.dataset.role,mode:'rift',nick:row.from,champ});}return;
 }
 if(action==='room-vote'){
 const row=roomBallotBoard(room,publicDraftContext(),data.champions).find(r=>r.key===el.dataset.key);if(!row)throw Error('候选已撤回');
 const mine=room.members.find(m=>m.self)?.share?.ballot;
 room=await api.roomBallot({version:1,proposal:mine?.proposal||null,vote:row.mine?null:row.key});render();return;
 }
 if(action==='room-adopt-ballot'){
 const row=roomBallotBoard(room,publicDraftContext(),data.champions).find(r=>r.key===el.dataset.key);if(!row)throw Error('候选已撤回');
 if(client.connected&&client.phase==='ChampSelect'){await sync(false,{fresh:true});if(!client.connected||client.phase!=='ChampSelect'||!client.session)throw Error('无法确认本局选人，请重新同步');}
 const current=roomBallotBoard(room,publicDraftContext(),data.champions).find(r=>r.key===el.dataset.key);if(!current)throw Error('候选已撤回，请重新选择');preservePlayerPosition();
 const adopted=adoptRoomLineup({kind:'state',v:1,from:current.from,...current.proposal,pick:null,at:Date.now()},data,slots,client,localPickEligibility(client,slots,data.champions,{scope:'party',soloRole,playerPosition:saved.draft?.playerPosition}),{...clientSyncOptions(),ownRole:taskOwnRole()});
 slots=adopted.slots;unassigned=adopted.unassigned;activeCreativePlan=adopted.creativePlan;lastTaskSelection=null;draftComparing=false;scope='party';for(const selection of adopted.configurations)preparations.remember(selection);
 creativePlanNotice=[adopted.conflicts.length?'已保留本局选人或手动位置，未完全采用提议。':'',adopted.configurationErrors.length?'有'+adopted.configurationErrors.length+'套发送方配置与当前资料不符，保留本机参考。':'',!current.proposal.configurations?.length?'未收到具体配置，使用本机参考。':''].filter(Boolean).join(' ');
 cancelRecommendation();results=[];offset=0;companionPreview=null;companionTab='recommend';await persist({throwOnError:true});render();await publishRoomShare({force:true});toast('已采用阵容'+(adopted.configurations.length?'及 '+adopted.configurations.length+' 套发送方配置':'；使用本机配置参考')+'。'+creativePlanNotice,!!creativePlanNotice);return;
 }
 if(action==='room-publish'){if(!await publishRoomShare({force:true}))throw Error('分享失败，请检查房间连接后重试');toast('已分享当前阵容');return;}
 if(action==='room-copy-relay'){const text=room?.auto?`开黑搭子组队房间｜中继 ${room?.relayUrl||''}｜房间 ${room?.room||''}｜口令 ${room?.pin||''}`:`开黑搭子中继房间｜中继 ${room?.relayUrl||''}｜房间 ${room?.room||''}`;await api.copy(text);toast(room?.auto?'地址、房间码和口令已复制；可直接发给队友手动加入':'地址和房间码已复制；口令请另行告知');return;}
 if(action==='room-copy-invite'){await api.copy(`开黑搭子房间 ${room?.room||''}｜邀请码 ${el.dataset.invite}｜口令 ${room?.pin||''}`);toast('邀请信息已复制');return;}
 if(action==='room-file-export'){
  if(!api.exportPreparation)throw Error('准备文件请在桌面版使用');if(preparationFileBusy)return;
  const snapshot=preparationShare({...roomSharePayload(),from:saved.preferences.roomNick||'队友',at:Date.now()});preparationFileBusy=true;render();
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
 if(action==='navigate'){route=el.dataset.route;closeOverlay();render();window.scrollTo(0,0);}
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
 else if(action==='draft-scope'){scope=el.dataset.scope;invalidate();}
 else if(action==='draft-style'){if(!['balanced','fun','wild'].includes(el.dataset.style))return;style=el.dataset.style;invalidate();}
 else if(action==='more-candidates'){showAllCandidates=!showAllCandidates;render();}
 else if(action==='combination-library'){closeOverlay();comboView={kind:'duos',style:'all',query:'',fit:false,source:'all',configured:false};overlay.innerHTML=combinationDialog(data,comboView,slots);document.querySelector('#combo-search')?.focus();}
 else if(action==='combo-kind'){comboView.kind=el.dataset.kind;overlay.innerHTML=combinationDialog(data,comboView,slots);}
 else if(action==='load-duo'){const d=DUOS.find(d=>d.id===el.dataset.id);if(!d)throw Error('组合已变化，请重新打开组合库');await loadCatalogCombo(d,comboMembers(d).every(m=>['bottom','support'].includes(m.role))?'bot':'party');}
 else if(action==='move-slot'){const from=slots.find(s=>s.role===el.dataset.role);overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal" style="width:470px" role="dialog" aria-modal="true" aria-label="移动英雄位置"><header class="modal-header"><h3>把 ${e(champ(from.champion).name)} 放到哪里？</h3>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="panel-body"><p class="section-copy">已有英雄会交换位置，“我们 / 队友”留在原位置。</p><div class="chips">${slots.filter(s=>s.role!==from.role).map(s=>button('move-confirm',roleName(s.role)+(s.champion?' · 交换'+e(champ(s.champion).name):''),'','',`data-from="${from.role}" data-role="${s.role}"`)).join('')}</div></div></section></div>`;}
 else if(action==='move-confirm'){slots=moveChampion(slots,el.dataset.from,el.dataset.role);closeOverlay();invalidate();toast('英雄位置已调整');}
 else if(action==='style'){style=el.dataset.style;invalidate();}
 else if(action==='pick-slot')openPicker('slot',el.dataset.role);
 else if(action==='pick-hex')openPicker('hex');
 else if(action==='hero-pool')openPicker('pool');
 else if(action==='exclusions')openPicker('excluded');
 else if(action==='back-result'){const origin=buildReturn;closeOverlay();if(origin&&origin.signature===recommendationKey(recommendationInput())&&results[origin.index]?.id===origin.id){showResult(origin.index);overlay.querySelector('.drawer-content').scrollTop=origin.scroll;}else toast('原方案已变化，请重新推荐',true);}
  else if(action==='close')closeOverlay();
 else if(action==='picker-role'){picker.filter=el.dataset.role;renderPicker();document.getElementById('picker-search')?.focus();}
 else if(action==='pick-champion'){const id=el.dataset.id;if(picker.kind==='rolepool'){const pool=saved.preferences.rolePools[picker.role];pool.heroes=pool.heroes.includes(id)?pool.heroes.filter(x=>x!==id):[...pool.heroes,id];invalidate();renderPicker();}else if(picker.kind==='pool'){saved.preferences.pool=saved.preferences.pool.includes(id)?saved.preferences.pool.filter(x=>x!==id):[...saved.preferences.pool,id];invalidate();renderPicker();}else if(picker.kind==='excluded'){saved.excluded=saved.excluded.includes(id)?saved.excluded.filter(x=>x!==id):[...saved.excluded,id];invalidate();renderPicker();}else if(picker.kind==='hex'){if(hexHero!==id){hexOptions=[];hexOwned=[];}hexHero=id;closeOverlay();render();maybeRefreshBuild(id,profile(champ(id)).roles[0],'hex');}else{const slot=slots.find(s=>s.role===picker.role);guardClientSlot(slot);if(slots.some(s=>s!==slot&&s.champion===id))throw Error('这个英雄已经在阵容中');slot.champion=id;slot.locked=true;delete slot.automaticPosition;delete slot.clientCellId;delete slot.manualPosition;const bound=client.session?.myTeam.find(p=>p.championId===champ(id).key);if(bound){slot.clientCellId=bound.cellId;slot.manualPosition=true;}unassigned=client.session?unassignedPublicPicks(slots,client.session,data.champions):unassigned.filter(p=>p.champion!==id);closeOverlay();invalidate();}}
 else if(action==='solo-role'){setCompanionRole(el.dataset.role);}
 else if(action==='position-auto'){setCompanionRole('');}
 else if(action==='toggle-party'){const s=slots.find(s=>s.role===el.dataset.role);s.party=!s.party;s.partyManual=true;const membersOpen=!!overlay.querySelector('.task-members-dialog');invalidate();if(membersOpen)renderTaskMembers();}
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
  if(el.dataset.prepareClick==='true'&&el.hasAttribute('data-result-index')){await prepareCandidate(el);return;}
  let selection=el.dataset.combo?{comboId:el.dataset.combo}:{};
  if(el.hasAttribute('data-result-index')){const result=results[Number(el.dataset.resultIndex)];if(!result||resultsSignature!==recommendationKey(recommendationInput()))throw Error('推荐条件已变化，请重新推荐');const plan=resultCreativePlan(result);if(plan)selection=creativeComboContext(creativeMemberCombo(plan,el.dataset.id,el.dataset.role));}
  if(el.dataset.prepareClick==='true'&&memberHeroAction(el.dataset.id,el.dataset.role).prepare){const task=ownTaskPreparation()?.selection;lastTaskSelection=task?.id===el.dataset.id&&task.role===el.dataset.role?task:{id:el.dataset.id,role:el.dataset.role,mode:'rift',...selection};draftComparing=false;closeOverlay();render();await useClientPreparation({dataset:{preparationView:'task'}},true);}
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
 else if(action==='sync')await sync(true);
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
  }else if(f.type==='build'){showBuild(f.champion,f.role,f.mode,{conditions:f.conditions||[],coreIndex:f.coreIndex||0,loadoutId:f.loadoutId||'default',runeId:f.runeId||undefined,...(f.customRunePage?{customRunePage:structuredClone(f.customRunePage)}:{}),skillId:f.skillId||undefined,...(f.customSkillOrder?{customSkillOrder:structuredClone(f.customSkillOrder)}:{}),coreId:f.coreId||undefined,startId:f.startId||undefined,bootsId:f.bootsId||undefined,summonerIds:f.summonerIds?[...f.summonerIds]:undefined,sourceOpponent:f.sourceOpponent,comboId:f.comboId,...(f.creativePlan?{creativePlan:f.creativePlan}:{}),...(f.bottomQuestPlan?{bottomQuestPlan:true}:{}),...(f.mode==='rift'&&f.laterIds!==undefined?{laterIds:[...f.laterIds]}:{}),...(f.mode==='hex'?{augmentIds:(f.augmentIds||[]).filter(id=>data.augments.some(a=>a.id===id)),compareIds:(f.compareIds||[]).filter(id=>data.augments.some(a=>a.id===id)),ownedAugmentIds:(f.ownedAugmentIds||[]).filter(id=>data.augments.some(a=>a.id===id))}:{})});}else{hexHero=champ(f.champion)?f.champion:null;hexSelected=f.augments.filter(id=>data.augments.some(a=>a.id===id));hexOptions=(f.compareIds||[]).filter(id=>data.augments.some(a=>a.id===id)).slice(0,3);hexOwned=(f.ownedAugmentIds||[]).filter(id=>data.augments.some(a=>a.id===id)).slice(0,6);hexSelectedOnly=true;hexForHero=false;hexQuery='';hexRarity='all';route='hex';render();}}
 else if(action==='auto-sync'){saved.preferences.autoSync=saved.preferences.autoSync===false;persist();render();}
 else if(action==='auto-check'){saved.preferences.autoCheck=!saved.preferences.autoCheck;persist();render();}
 else if(action==='update')await updateData();
 else if(action==='app-update-check-toggle'){saved.preferences.appUpdateCheck=!saved.preferences.appUpdateCheck;persist();render();}
 else if(action==='app-update-check')await checkAppUpdate();
 else if(action==='app-update-download')await downloadAppUpdate();
 else if(action==='app-update-cancel'){try{await api.cancelAppUpdate();}catch(err){toast(err.message,true);}}
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
document.addEventListener('submit',event=>{if(event.target.id==='catalog-form'){event.preventDefault();overlay.querySelector('[data-action=catalog-save]')?.click();}});
document.addEventListener('input',event=>{const el=event.target;if(el.id==='combo-search'&&comboView){comboView.query=el.value;document.getElementById('combo-list').innerHTML=combinationRows(data,comboView,slots);}if(el.id==='picker-search'){picker.query=el.value;document.getElementById('picker-grid').innerHTML=pickerTiles();}if(el.id==='library-search'){libraryQuery=el.value;document.getElementById('library-grid').innerHTML=libraryTiles();}if(el.id==='hex-search'){hexQuery=el.value;document.getElementById('augment-grid').innerHTML=augmentTiles();}if(el.id==='room-invite')roomInvite=el.value;if(el.id==='room-pin')roomPin=el.value;if(el.id==='room-relay-room')roomRelayRoom=el.value;if(el.id==='room-relay-url')roomRelayUrl=el.value;});
document.addEventListener('change',event=>{const el=event.target;if(el.id==='flash-slot'){saved.preferences.flashSlot=el.value;persist();render();if(buildView)renderBuild();return;}if(el.id==='room-auto'){saved.preferences.roomAuto=el.checked;persist();render();return;}if(el.hasAttribute('data-matchup-target')){try{changeMatchupTarget(el);}catch(error){toast(error.message,true);render();if(buildView)renderBuild();}return;}if(el.dataset.buildSourceField){try{const source=requireBuildSource({...normalizeBuildSource(data.buildSource),[el.dataset.buildSourceField]:el.value});saved.preferences.buildSource=source;selectBuildSource(data,source);invalidate();if(buildView)renderBuild();}catch(error){toast(error.message,true);}return;}if(el.dataset.presentationModule){api.presentation({field:'toggleModule',value:el.dataset.presentationModule}).then(value=>{saved.preferences.presentation=value;render();updatePresentationDialog(overlay,value);}).catch(error=>toast(error.message,true));return;}if(el.id==='companion-width'){saved.preferences.companionWidth=Number(el.value);persist().then(()=>api.windowLayoutControl('follow')).then(acceptWindowLayout).catch(error=>toast(error.message,true));return;}if(el.id==='party-ids'){saved.preferences.partyIds=normalizePartyIds(el.value);persist().then(()=>sync(false,{fresh:true}));return;}if(el.id==='solo-role'||el.id==='task-own-role'){try{setCompanionRole(el.value);if(el.id==='solo-role')claimPosition(el.value).catch(error=>toast(error.message,true));if(el.id==='task-own-role')renderTaskMembers();}catch(error){toast(error.message,true);render();}return;}if(el.dataset.buildSummoner){try{editBuildSummoners(el,'summoner-'+el.dataset.buildSummoner,el.value);}catch(error){toast(error.message,true);renderBuild();}return;}if(el.dataset.companionField){try{editCompanionPlan(el,el.dataset.companionField,el.value);}catch(error){toast(error.message,true);render();}return;}if(el.id==='companion-scope'){scope=el.value;invalidate();}if(el.id==='companion-style'){style=el.value;invalidate();}if(el.id==='build-skill'){buildView.skillId=el.value||undefined;renderBuild();}if(el.id==='guide-after-game'){saved.preferences.guideAfterGame=el.value;persist();}if(el.id==='update-mirror'){try{saved.preferences.updateMirror=normalizeMirrorBase(el.value);el.value=saved.preferences.updateMirror;persist();}catch(error){toast(error.message,true);}render();}if(['play-difficulty','play-tempo','play-unusual','play-meleeBottom'].includes(el.id)){saved.preferences.play[el.id.slice(5)]=el.type==='checkbox'?el.checked:el.value;invalidate();}if(el.dataset.rolePoolMode){saved.preferences.rolePools[el.dataset.rolePoolMode].mode=el.value;invalidate();}if(el.matches('[data-catalog-member],#catalog-form select[name^="role-"]')){const i=el.dataset.catalogMember??el.name.split('-')[1],form=el.closest('form'),id=form.querySelector('[name="hero-'+i+'"]').value,role=form.querySelector('[name="role-'+i+'"]').value;form.querySelector('[name="loadout-'+i+'"]').innerHTML=editorLoadouts(data,id,role);}if(comboView&&['combo-style','combo-fit','combo-source','combo-configured','combo-tempo'].includes(event.target.id)){if(event.target.id==='combo-tempo')comboView.tempo=event.target.value;else if(event.target.id==='combo-style')comboView.style=event.target.value;else if(event.target.id==='combo-source')comboView.source=event.target.value;else if(event.target.id==='combo-configured')comboView.configured=event.target.checked;else comboView.fit=event.target.checked;document.getElementById('combo-list').innerHTML=combinationRows(data,comboView,slots);}if(event.target.id==='pool-mode'){saved.preferences.poolMode=event.target.value;invalidate();}if(event.target.id==='hex-category'){hexCategory=event.target.value;document.getElementById('augment-grid').innerHTML=augmentTiles();}if(event.target.id==='build-role'){if(scope==='solo'&&currentPlayerSelection(client.session,data.champions,slots)?.id===buildView.id){soloRole=event.target.value;persist();}showBuild(buildView.id,event.target.value,buildView.mode,{conditions:[...buildView.conditions],coreIndex:buildView.coreIndex});}if(event.target.id==='hex-rarity'){hexRarity=event.target.value;document.getElementById('augment-grid').innerHTML=augmentTiles();}if(el.id==='room-nick'){const clean=sanitizeNick(el.value);saved.preferences.roomNick=clean||'队友';el.value=saved.preferences.roomNick;persist();}if(el.id==='room-relay-url'){roomRelayUrl=el.value;const clean=normalizeRelayUrl(el.value);if(clean){saved.preferences.relayUrl=clean;el.value=clean;persist();}}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(activeOverlaySelect?.isConnected){deferOverlaySelect();return;}if(!activeAppSelect)closeOverlay();}if(event.key==='Tab'&&overlay.firstElementChild){const focusable=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(!overlay.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
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
try{boot=await api.bootstrap();data=boot.data;saved=boot.state;bindPlayerBuildPreferences();savedBase=structuredClone(saved);stateRevision=boot.stateRevision||0;stateRecovery=saved.recovery||null;data.catalog=configureCatalog(data.catalog||BUNDLED_CATALOG);data.catalogInfo||={...catalogIssues(data.catalog,data),version:data.catalog.version};configureAssets(data);
 client=boot.client||client;runeAppliedKeys.observe(client);windowLayout=boot.windowLayout||{docked:false};api.onWindowLayout?.(acceptWindowLayout);
 room=await api.roomStatus?.()||null;if(room?.mode==='host')roomAddresses=await api.roomAddresses?.()||[];
 applyRoomSnapshot(room);
 roomRelayUrl=initialRelayUrl(saved.preferences.relayUrl);roomTransport=room&&room.mode!=='idle'?(room.transport==='relay'?'relay':'lan'):'relay';
 api.onRoomUpdate?.(snapshot=>{applyRoomSnapshot(snapshot);if(windowLayout.docked||route==='draft'||route==='room')render();});
  preparations.restore(saved.preparations);guideSelection=saved.guide?.selection||null;if(guideSelection){if(!preparations.recall(guideSelection))preparations.remember(guideSelection);guideSyncBase=guideSelection;lastGuideSyncKey=buildChoiceKey(guideSelection);}
 api.onPresentation?.(value=>{saved.preferences.presentation=value;applyPresentation(value);if(overlay.querySelector('.presentation-settings'))updatePresentationDialog(overlay,value);});
 api.onGuideSelection?.((selection,meta={})=>receiveGuideSelection(selection,meta.revision));
 api.onOpenBuild?.(selection=>{showBuild(selection.id,selection.role,selection.mode,selection);});
 api.onMainPage?.(destination=>{if(windowLayout.docked)return;if(destination?.route==='reference'&&champ(destination.id)){referenceHero=destination.id;referenceTab=destination.tab==='changes'?'changes':'skills';referenceSkill='Q';referenceVariant=0;route='reference';}else if(destination?.route==='settings')route='settings';else return;closeOverlay();render();});
 api.onProgress?.(message=>{updateMessage=message;const status=document.getElementById('update-message');if(status)status.textContent=message;});
 api.onAppUpdate?.(snapshot=>{appUpdate={phase:snapshot.phase||'idle',release:snapshot.release||null,received:snapshot.received||0,total:snapshot.total??null,error:snapshot.error||'',via:snapshot.via||null,fallbackNotice:snapshot.fallbackNotice||false,...(snapshot.record?{record:snapshot.record}:{}),...(snapshot.dismissed?{dismissed:true}:{})};if(route==='settings')render();});
 saved.preferences={style:'fun',autoCheck:true,autoLive:true,appUpdateCheck:true,pool:[],poolMode:'off',...saved.preferences};saved.preferences.play={difficulty:'any',tempo:'any',unusual:true,meleeBottom:true,...saved.preferences.play};saved.preferences.rolePools=Object.fromEntries(ROLES.map(r=>[r.id,{heroes:[],mode:'off',...saved.preferences.rolePools?.[r.id]}]));saved.preferences.buildSource=normalizeBuildSource(saved.preferences.buildSource);selectBuildSource(data,saved.preferences.buildSource);saved.favorites=saved.favorites||[];saved.excluded=saved.excluded||[];
 if(saved.draft?.slots){try{validateSlots(saved.draft.slots,data.champions);slots=saved.draft.slots;}catch{}}
 activeCreativePlan=saved.draft?.creativePlan?validateCreativePlan(saved.draft.creativePlan,slots,{allowUnknown:true}):null;
 scope=DRAFT_SCOPES[saved.draft?.scope]?saved.draft.scope:'party';soloRole=saved.draft?.soloRole||'';
 style=saved.draft?.style||saved.preferences.style||'fun';if(!STYLES[style])style='fun';
 if(saved.preferences.autoSync===false)client.message='自动同步已关闭，可手动连接客户端';
 api.onState?.(value=>{if(value?.state&&value.revision>Math.max(stateRevision,externalState?.revision||0)){externalState=value;drainExternalState();}});
 api.onData?.(acceptSharedData);api.onPreparation?.(event=>{acceptSharedPreparation(event).catch(error=>toast('另一窗口的配置结果尚未同步：'+error.message,true));});
 await restorePreparationSnapshot(boot.preparationSnapshot);render();api.onClient?.(value=>{
  if(value?.connecting&&syncing){client={...client,...value};render();return;}
  if(value?.receivedAt&&value.receivedAt!==client.receivedAt)sharedClient=value;
  if(!syncing&&(saved.preferences.autoSync!==false||sharedClient))sync(false);
 });const ready=await api.ready?.();await restorePreparationSnapshot(ready?.preparationSnapshot);if(ready?.state&&ready.revision>Math.max(stateRevision,externalState?.revision||0)){externalState=ready;drainExternalState();}queueCompanionRecommendation();if(saved.preferences.autoSync!==false)sync(false);else if(client.receivedAt){sharedClient=client;sync(false);}
 
 if(boot.desktop&&saved.preferences.autoCheck&&Date.now()-Date.parse(saved.preferences.lastCheck||data.fetchedAt)>86400000)setTimeout(()=>updateData(true),1800);
 if(boot.desktop&&saved.preferences.appUpdateCheck!==false&&Date.now()-Date.parse(saved.preferences.lastAppUpdateCheck||0)>86400000)setTimeout(()=>checkAppUpdate(true),2600);
}catch(err){app.innerHTML=`<div class="boot"><img class="brand-mark" src="../assets/icon.png" alt="" /><h2>暂时无法打开助手</h2><p>${e(err.message)}</p><p>请保留整个程序文件夹后重新打开。</p></div>`;}


document.addEventListener("toggle",event=>{if(event.target.matches?.(".draft-preferences"))draftAdvanced=event.target.open;if(event.target.matches?.('[data-pair-refresh]'))pairRefreshOpen=event.target.open;},true);


