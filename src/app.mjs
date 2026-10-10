import {stateRecoveryView} from './state-recovery-view.mjs';
import {localPickEligibility} from './core/pick-eligibility.mjs';
import {pickEligibilityView} from './pick-eligibility-view.mjs';
import {summonerSelector} from './summoner-selection-view.mjs';
import {heroCoach} from './core/hero-coach.mjs';
import {createItemSet} from './core/item-sets.mjs';
import {itemSetControls} from './item-sets-view.mjs';
import {buildSourceControls,cachedBuildAlternatives} from './build-source-view.mjs';
import {buildSourceKey,buildSourcePendingKey,normalizeBuildSource,selectBuildSource,sameBuildSource,buildSourceLabel,requireBuildSource} from './core/build-source.mjs';
import {heroCoachView} from './hero-coach-view.mjs';
import {duoPlay,duoPlayText} from './core/duo-plays.mjs';
import {duoPlayView} from './duo-play-view.mjs';
import {matchupView} from './matchup-view.mjs';
import {matchupTargetKey,publicMatchupOpponent} from './core/matchup-plans.mjs';
import {matchupTargetView} from './matchup-plan-view.mjs';
import {reviewBaseline} from './core/catalog-review.mjs';
import {buildFavoriteId,selectedBuildFields,findSavedBuild} from './core/build-favorites.mjs';
import {teamFavoriteId,findSavedTeam,captureTeamConfigurations,restoreTeamFavorite} from './core/team-favorites.mjs';
import {pairStatisticsText} from './pair-statistics-view.mjs';
import {pairRefreshTargets,pairRefreshView} from './pair-refresh-view.mjs';
import {runeWriteContext} from './core/rune-context.mjs';
import {cooperationText} from './cooperation-view.mjs';
import {captureCreativePlan,creativePlanMatches,creativePlanCompatible,validateCreativePlan,creativeMemberCombo,creativeComboContext} from './core/creative-plan.mjs';
import {BUNDLED_CATALOG,configureCatalog,catalogIssues} from './core/catalog.mjs';
import {catalogPanel,catalogPreviewDialog,catalogEditorDialog,editorLoadouts,playControls} from './catalog-view.mjs';
import {resultPlayCard} from './play-card-view.mjs';
import {applyPresentation,updatePresentationDialog} from './presentation-view.mjs';
import {changePresentation} from './core/presentation.mjs';
import {companionView} from './companion-view.mjs';
import {favoriteBuildSummary,favoriteTeamSummary} from './favorites-view.mjs';
import {windowInfoDialog,windowInfoText} from './window-info-view.mjs';
import {changeCompanionPlan,companionPickIntent} from './core/companion-plan.mjs';
import {matchupPreparation,selectMatchupPreparation} from './core/matchup-preparation.mjs';
import {matchupPreparationView} from './matchup-preparation-view.mjs';
import {comboMembers} from './core/combo-members.mjs';
import {personalCombo,loadPersonalCombo} from './core/personal-combo.mjs';
import {ROLES,STYLES,DUOS,TRIOS,CROSS_SYNERGIES,COMBINATION_SOURCE,profile,matchesSearch,RULES_PATCH,RULES_VERSION} from './core/rules.mjs';
import {createSlots,recommend,analyzeTeam,mergeClientSession,validateSlots,clearClientPicks,currentCombo,comboContextKnown} from './core/recommend.mjs';
import {DRAFT_SCOPES,CLIENT_POSITION_ROLES,draftTargets,scopeSlots,moveChampion,assignClientChampion,clientDraftStatus,clearDraftPicks,manualPlayerSlot,restorePlayerPosition,clearManualPlayerPosition,publicClientGameId,reconcileClientDraft,pickerMatches,publicDraftPicks,unassignedPublicPicks} from './core/draft.mjs';
import {combinationDialog,combinationRows} from './draft-library-view.mjs';
import {getBuild,buildAsText,SHARDS,isFreshBuildReference,buildRoleEvidence} from './core/builds.mjs';
import {preparationSummary,runeApplicationKey} from './preparation-view.mjs';
import {loadoutSelector,runeSelector,skillSelector,comboSourceLinks,laterItemSelector,bottomQuestPlanControl,gearSelector} from './build-options-view.mjs';
import {augmentCategories,AUGMENT_CATEGORIES} from './core/hex-compare.mjs';
import {renderHexComparison,renderHexSourceReference} from './hex-view.mjs';
import {preserveOverlay} from './overlay.mjs';
import {createClientSync} from './core/async-tasks.mjs';
import {currentPlayerSelection,phaseLabel} from './core/guide.mjs';
import {createPreparationStore,createRuneApplicationState,recommendationKey,configurationPatch,configurationKey as buildChoiceKey,CONFIGURATION_FIELDS,recallPreparation} from './core/preparation.mjs';
import {renderResultCard,coreRouteChoices} from './draft-result-view.mjs';
import {escape as e,icon,portrait,asset,button,dateLabel,configureAssets,gameDescription} from './ui.mjs';

let draftAdvanced=false,lastClientRead=null;
const previewAPI={
 bootstrap:async()=>{const r=await fetch('/api/bootstrap');if(!r.ok)throw Error('无法读取本地资料');const b=await r.json();try{const s=JSON.parse(localStorage.getItem('rift-buddy-preview'));if(s?.schema===1)b.state=s;}catch{}return b;},
 windowInfo:async()=>{throw Error('桌面版支持读取屏幕和窗口资料');},
 presentation:async change=>{saved.preferences.presentation=changePresentation(saved.preferences.presentation,change);await previewAPI.saveState(saved);return saved.preferences.presentation;},
 saveState:async s=>localStorage.setItem('rift-buddy-preview',JSON.stringify(s)),
 client:async()=>({connected:false,phase:'Offline',message:'浏览器预览中；桌面版支持连接客户端'}),
 updateData:async()=>{throw Error('请在桌面版中更新资料');},
 refreshBuild:async()=>{throw Error('请在桌面版中刷新版本配置');},
 refreshPairs:async()=>{throw Error('请在桌面版中刷新同队数据');},
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
let data,saved,boot,slots=createSlots(),results=[],resultsSignature='',route='draft',style='fun',offset=0,scope='solo',soloRole='';
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
function cancelRecommendation(){recommendationRun++;if(activeRecommendation){activeRecommendation.cancel();activeRecommendation=null;}generating=false;}
let client={connected:false,phase:'Offline',message:'正在检查客户端…'},syncing=false,unassigned=[],enemy=[],clientBans=[];
let picker=null,buildView=null,detailResult=null,updating=false,pinned=false;
let libraryQuery='',libraryRole='all',hexQuery='',hexRarity='all',hexHero=null,hexSelected=[],hexSelectedOnly=false,hexForHero=false;
let hexOptions=[],hexOwned=[],hexCategory='all';
let toastTimer,saveChain=Promise.resolve(),favoriteSaving=false,updateMessage='',lastSyncStarted=0;
let windowLayout={docked:false},companionTab='recommend',companionPreview=null,lastCompanionOwn='',lastCompanionIntent='',autoRecommendTimer,autoRecommendationKey='';
const companionScroll=new Map();
const companionDisclosures=new Map();
let pendingIntentPreparation=null;
let activeCreativePlan=null,creativePlanNotice='';
function resultCreativePlan(result){const plan=captureCreativePlan(result,data);if(plan)result.creativePlan=plan;return plan;}
function reconcileCreativePlan(){if(activeCreativePlan&&!creativePlanCompatible(activeCreativePlan,slots)){activeCreativePlan=null;creativePlanNotice='成员或位置已变化，原分工不再适用。收藏中的原组合说明仍保留。';}}
let currentWindowInfo=null;
let itemSetPending='';const itemSetStatuses=new Map();
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
 if(!windowLayout.docked||generating||syncing||client.phase!=='ChampSelect')return;
 const key=recommendationKey(recommendationInput());if(key===autoRecommendationKey||key===resultsSignature&&results.length)return;
 autoRecommendTimer=setTimeout(()=>{if(!windowLayout.docked||generating||syncing)return;autoRecommendationKey=key;generate();},250);
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
const nav=[['draft','开黑选人','team'],['builds','符文与出装','sword'],['hex','海克斯手册','hex'],['favorites','我的收藏','star'],['settings','数据与连接','settings']];
function toast(message,error=false){clearTimeout(toastTimer);const el=document.getElementById('toast');el.textContent=message;el.className=`show ${error?'error':''}`;toastTimer=setTimeout(()=>el.className='',error?7000:3800);}
function persist({throwOnError=false}={}){saved.draft={slots,style,scope,soloRole,...(activeCreativePlan&&creativePlanCompatible(activeCreativePlan,slots)?{creativePlan:activeCreativePlan}:{}),...(saved.draft?.clientGameId?{clientGameId:saved.draft.clientGameId}:{}),...(saved.draft?.playerPosition?{playerPosition:saved.draft.playerPosition}:{})};saved.preferences.style=style;saved.preparations=preparations.snapshot();const snapshot=structuredClone(saved);const request=saveChain.catch(()=>{}).then(()=>api.saveState(snapshot));saveChain=request.catch(err=>{if(!throwOnError)toast(`保存失败：${err.message}`,true);});return throwOnError?request:saveChain;}
function rememberPreparation(value){const before=preparations.recall(value),next=preparations.remember(value);if(JSON.stringify(before)!==JSON.stringify(next))persist();return next;}
function invalidate(){preservePlayerPosition();reconcileCreativePlan();const own=currentPlayerSelection(client.session,data.champions,slots);if(scope==='solo'&&own?.positionKnown)soloRole=own.role;recommendationError='';markResultStale();cancelRecommendation();results=[];offset=0;autoRecommendationKey='';persist();render();queueCompanionRecommendation();}
function render(){
 if(dragPick){pendingDragRender=true;return;}
 const selectContext=appSelectionContext();
 if(activeAppSelect?.isConnected&&app.contains(activeAppSelect)&&renderedSelectContext===selectContext&&currentMatchupSelect(activeAppSelect)){pendingAppRender=true;return;}
 activeAppSelect=null;pendingAppRender=false;renderedSelectContext=selectContext;
 applyPresentation(saved.preferences.presentation);
 const old=document.querySelector('.companion-content');if(old){
   companionScroll.set(old.dataset.view,old.scrollTop);
   if(old.dataset.disclosureScope)companionDisclosures.set(old.dataset.disclosureScope,Object.fromEntries([...old.querySelectorAll('[data-companion-disclosure]')].map(d=>[d.dataset.companionDisclosure,d.open])));
 }
 document.body.classList.toggle('companion-mode',windowLayout.docked);
 if(windowLayout.docked){
  const focused=document.activeElement,focus=app.contains(focused)&&['BUTTON','INPUT','SELECT'].includes(focused.tagName)?{id:focused.id,tag:focused.tagName,data:{...focused.dataset}}:null;
  const preparation=myPreparation(),own=preparation?.own.id||'';
  if(own!==lastCompanionOwn){lastCompanionOwn=own;companionPreview=null;lastCompanionIntent='';if(own)companionTab='plan';companionScroll.delete('plan');}
  const intent=own?null:companionPickIntent(client,data.champions,slots,{scope,soloRole}),intentId=intent?.selection.id||'';
  if(intentId!==lastCompanionIntent){lastCompanionIntent=intentId;if(!own)pendingIntentPreparation=null;if(intentId&&!companionPreview)companionTab='plan';}
  const plan=companionPreparation(),view=companionTab+(companionPreview?':'+companionPreview.id:plan?.intent?':intent:'+plan.selection.id+':'+plan.selection.role:'');
  if(plan?.intent&&(!pendingIntentPreparation||!['id','role','mode'].every(field=>pendingIntentPreparation[field]===plan.selection[field])))pendingIntentPreparation=structuredClone(plan.selection);
  const disclosureScope=view+':'+[plan?.selection.id,plan?.selection.role,plan?.selection.mode].join(':');
  const configurationKey=plan&&buildKey(plan.selection.id,plan.selection.role,plan.selection.mode);
  const focusScope=JSON.stringify([client.connected,client.phase,client.game?.gameId||'',own,client.mode?.id||'']);
  if(plan)maybeRefreshBuild(plan.selection.id,plan.selection.role,plan.selection.mode);
  app.innerHTML=companionView({data,client,slots,unassigned,enemy,bans:clientBans,scope,soloRole,playerPosition:saved.draft?.playerPosition,style,tab:companionTab,results,generating,error:recommendationError,preparation,plan,favorites:saved.favorites,configurationStatus:{itemSetStatuses,refreshing:refreshingBuilds.has(configurationKey),error:buildErrors.get(configurationKey),enemyIds:publicMatchupIds(),publicContext:matchupPreparationContext(),opponentId:plan?chosenMatchupOpponent(plan.selection)?.id||'':'',matchupStatus:plan?matchupFocusStatus(plan.selection):''},applied:!!preparation&&runeAppliedKeys.has(runeApplicationKey(own,preparation.build.role,preparation.build.runePage)),guideAutoShow:saved.preferences.guideAutoShow!==false,appVersion:boot.version,pairRefresh:pairRefreshStatus(),overlap:windowLayout.overlap,recovery:stateRecovery}).replaceAll('loading="lazy"','loading="eager"');
  const content=document.querySelector('.companion-content');content.dataset.view=view;content.dataset.disclosureScope=disclosureScope;content.dataset.focusScope=focusScope;
  const disclosures=companionDisclosures.get(disclosureScope)||{};
  for(const d of content.querySelectorAll('[data-companion-disclosure]'))if(Object.hasOwn(disclosures,d.dataset.companionDisclosure))d.open=disclosures[d.dataset.companionDisclosure];
  content.scrollTop=companionScroll.get(view)||0;
  renderedSelectContext=appSelectionContext();reflectRunePending();
  if(focus&&old?.dataset.focusScope===focusScope){const target=focus.id?document.getElementById(focus.id):[...app.querySelectorAll('button,input,select')].find(control=>control.tagName===focus.tag&&Object.keys(focus.data).length&&Object.entries(focus.data).every(([key,value])=>control.dataset[key]===value));target?.focus({preventScroll:true});}return;
 }
 app.innerHTML=`<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">K</div><div><div class="brand-name">开黑搭子</div><div class="brand-en">RIFT BUDDY</div></div></div><div class="nav-section">今晚一起玩</div><nav aria-label="主导航">${nav.slice(0,4).map(([id,name,ico])=>`<button class="nav-item ${route===id?'active':''}" data-action="navigate" data-route="${id}">${icon(ico)}${name}${id==='favorites'&&saved.favorites.length?`<span class="badge">${saved.favorites.length}</span>`:''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="side-note">${icon('spark')}<p style="margin:6px 0">英雄随便换，快乐一起打。</p>${boot.hotkeyAvailable===false?'<p class="subtle">快捷键被占用，可从托盘或桌面图标打开。</p>':'<p class="subtle">呼出 / 隐藏助手</p><div style="margin-top:7px"><kbd class="key">Ctrl</kbd> + <kbd class="key">Shift</kbd> + <kbd class="key">Space</kbd></div>'}</div><button class="nav-item ${route==='settings'?'active':''}" data-action="navigate" data-route="settings">${icon('settings')}数据与连接</button><div class="sidebar-footer"><span class="status-dot ${client.connected?'connected':''}"></span>${client.connected?'客户端已连接':'手动选人可用'} · v${e(boot.version||'0.1.0')}</div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb">你的开黑工具箱<span>/　${nav.find(n=>n[0]===route)[1]}</span></div><div class="top-actions"><button class="badge" data-action="navigate" data-route="settings" title="基础资料、配置和组合规则分别更新；国服版本需核对">资料 ${e(data.version)} · 查看状态</button>${route==='draft'?button('recommend',generating?'正在搭配…':'推荐组合','spark','primary small',generating?'disabled':''):''}${button('presentation-open','字号与指引','settings','quiet small')}${button('companion-attach','贴边选人','team','small')}${button('recover-guide','找回指引','book','small')}${button('guide-current','本局指引','book','small')}${button('pin',pinned?'已置顶':'置顶','pin','quiet small')}${button('sync',syncing?'连接中…':client.connected?'同步选人':'连接客户端','link','small',syncing?'disabled':'')}</div></header><main class="page" id="main" data-page="${route}">${stateRecoveryView(stateRecovery)}${route==='draft'?renderDraft():route==='builds'?renderLibrary():route==='hex'?renderHex():route==='favorites'?renderFavorites():renderSettings()}</main></div></div>`;
 reflectRunePending();
}
function heading(eyebrow,title,desc,ico='spark') {return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div><div class="heading-symbol">${icon(ico)}</div></div>`;}
function myPreparation(){
 const own=currentPlayerSelection(client.session,data.champions,slots),mode=client.mode?.id;
 if(!own||!['rift','hex'].includes(mode))return null;
 const prepared=guideSelection?.id===own.id&&guideSelection.mode===mode?guideSelection:null;
 const role=own.positionKnown?own.role:soloRole||prepared?.role||own.role,combo=mode==='rift'?currentCombo(slots,own.id,role,data.catalogInfo?.status,null,activeCreativePlan):null,context={id:own.id,role,mode,...creativeComboContext(combo)};
 const selection={...rememberedPreparation(context,{allowSavedCombo:!combo&&!comboContextKnown(slots,own.id,role,prepared?.comboId,prepared?.creativePlan)}),...context};
 return {own,selection,build:getBuild(champ(own.id),role,data,selection)};
}
function companionPreparation(){
 const intent=!companionPreview&&companionPickIntent(client,data.champions,slots,{scope,soloRole});
 if(!companionPreview&&!intent)return myPreparation();
 const context=companionPreview||intent.selection,remembered=intent&&pendingIntentPreparation&&['id','role','mode'].every(field=>pendingIntentPreparation[field]===context[field])?pendingIntentPreparation:rememberedPreparation(context),selection={...remembered,...context};
 return {preview:true,...(intent?{intent:true,positionKnown:intent.positionKnown}:{}),selection,build:getBuild(champ(context.id),context.role,data,selection)};
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
  const target=slots.find(s=>s.role===role);if(target.champion&&target.clientCellId!==cellId)throw Error('这个位置已有英雄，请在阵容板交换位置');
  slots=clearManualPlayerPosition(slots,cellId).map(s=>s.role===role?{...s,champion:null,locked:false,clientCellId:cellId,manualPosition:true}:s);
 }else if(!role&&Number.isInteger(cellId)){
  const merged=mergeClientSession(clearManualPlayerPosition(slots,cellId),client.session,data.champions);slots=merged.slots;unassigned=merged.unassigned;
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
 rememberPreparation(selection);if(plan.intent)pendingIntentPreparation=structuredClone(selection);if(!plan.preview)syncPreparedGuide(selection);render();
}
function chooseMatchupConfiguration(el,kind){
 const drawer=overlay.contains(el),plan=drawer?{selection:buildSelection()}:companionPreparation();
 if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('英雄或位置已变化，请重新比较配置');
 const selection=selectMatchupPreparation({data,selection:plan.selection,enemyIds:publicMatchupIds(),targetId:chosenMatchupOpponent(plan.selection)?.id,publicContext:matchupPreparationContext(),context:el.dataset.context,kind,id:el.dataset.id});
 if(drawer){Object.assign(buildView,selection);renderBuild();}
 else{rememberPreparation(selection);if(plan.intent)pendingIntentPreparation=structuredClone(selection);if(!plan.preview)syncPreparedGuide(selection);render();}
 toast(kind==='rune'?'已选择完整符文，点击替换后写入客户端':'已选择核心路线，原后期计划已清除');
}
function currentPreparationHTML(){
 const p=myPreparation();if(!p)return '';
 const {own,build}=p,applied=runeAppliedKeys.has(runeApplicationKey(own.id,build.role,build.runePage));
 return `<section class="current-pick current-preparation" aria-label="我的自动准备"><div>${portrait(champ(own.id),'sm')}<span>你已选择 <b>${e(champ(own.id).name)}</b> · ${roleName(build.role)}${own.positionKnown?'':'（参考位置，可调整）'}</span></div><p><b>推荐出装</b> ${e(build.items.slice(0,3).map(i=>i.name).join(' → '))}</p><p><b>推荐符文</b> ${e(build.selectedRune?.name||'此模式不使用峡谷符文')} · ${applied?'本次已应用':'方案已选好'}</p><div class="current-preparation-actions">${button('my-build','查看 / 调整方案','arrow','small')}${build.runePage?button('my-runes',applied?'重新应用推荐符文':'替换为推荐符文','check','primary small',`data-id="${own.id}"`):''}</div><small>${saved.preferences.guideAutoShow!==false?'进入游戏后自动打开本局指引':'自动呼出已关闭，可手动打开指引'}${own.positionKnown?'':'；匹配未提供分路，请确认本局位置'}</small></section>`;
}
function draftTargetLabel(){const targets=draftTargets(slots,scope,soloRole);return targets.length?(scope==='solo'?'推荐我的英雄':'推荐'+targets.map(roleName).join(' / ')):'分析这套阵容';}
function restrictionSummary(){const p=saved.preferences,labels=[];if(p.poolMode!=='off')labels.push((p.poolMode==='only'?'仅用':'优先')+'全局英雄池 '+p.pool.length+' 位');for(const r of ROLES){const pool=p.rolePools[r.id];if(pool.mode!=='off')labels.push(r.name+(pool.mode==='only'?'仅用':'优先')+' '+pool.heroes.length+' 位');}if(p.play.difficulty==='easy')labels.push('操作轻松');if(p.play.unusual===false)labels.push('仅常规位置');if(p.play.meleeBottom===false)labels.push('下路不推荐近战');if(clientBans.length)labels.push('公开禁选 '+clientBans.length+' 位');if(unassigned.length)labels.push('待安排已选 '+unassigned.length+' 位');if(client.session?.allowDuplicatePicks===false&&enemy.length)labels.push('不可镜像 '+enemy.length+' 位');if(saved.excluded.length)labels.push('排除 '+saved.excluded.length+' 位');return labels.join(' · ')||'全部英雄 · 允许娱乐搭配';}
function renderDraft(){
 const a=analyzeTeam(slots,data.champions),targetCount=draftTargets(slots,scope,soloRole).length,live=clientDraftStatus(client,slots,data.champions),assigned=assignedPlayerRole();
 return `${heading('RIFT BUDDY',scope==='solo'?'这局，我玩什么？':'今晚，怎么开黑？',scope==='solo'?'先选自己的位置，或查看各路候选；队友已选英雄会参与分析。':'把已选英雄放进阵容，剩下的位置，我们一起搭。','team')}
 ${creativePlanNotice?`<div class="callout warning" data-creative-plan-notice>${e(creativePlanNotice)}</div>`:''}
 <div class="toolbar"><div class="segmented" aria-label="玩法风格">${Object.entries(STYLES).map(([id,s])=>`<button class="segment ${style===id?'active':''}" data-action="style" data-style="${id}" title="${e(s.sub)}">${s.name}</button>`).join('')}</div><div style="display:flex;gap:4px">${button('hero-pool',`英雄池 · ${saved.preferences.pool.length}`,'','quiet small')}${button('exclusions',`排除英雄${saved.excluded.length?` · ${saved.excluded.length}`:''}`,'','quiet small')}${button('reset-draft','清空英雄','','quiet small')}${button('reset-party','重置位置归属','','quiet small')}</div></div>${`<details class="draft-preferences" ${draftAdvanced?"open":""}><summary>配合偏好 · ${{any:"不限玩法",early:"抓人节奏",teamfight:"团战连招",protect:"保护核心",poke:"控制消耗",growth:"发育与会合"}[saved.preferences.play.tempo||"any"]} · ${e(restrictionSummary())} · 点击调整</summary>${playControls(saved.preferences)}<div class="pool-controls"><span>英雄范围</span><select id="pool-mode" class="select" aria-label="推荐英雄范围">${[["off","全部英雄"],["prefer","优先英雄池"],["only","只用英雄池"]].map(([id,name])=>`<option value="${id}" ${saved.preferences.poolMode===id?"selected":""}>${name}</option>`).join("")}</select><small>锁定英雄保留；排除和公开禁选优先</small></div></details>`}
 <div class="party-summary">${scope==='solo'?`<b>单人 · 方案位置${assigned?' · 客户端分路 '+roleName(assigned):''}</b><select id="solo-role" class="select" aria-label="我的位置"><option value="">${assigned?'按客户端分路 · 取消手动位置':'位置未定 · 分别看各路'}</option>${ROLES.map(r=>`<option value="${r.id}" ${soloRole===r.id?'selected':''}>${r.name}</option>`).join('')}</select><span>单人只推荐一位英雄；任务权益按客户端分路。${manualPlayerSlot(slots,client.session?.localPlayerCellId)?button('position-auto','恢复客户端位置','','quiet small'):''}</span>`:`<b>我们的位置：${slots.filter(s=>s.party).map(s=>roleName(s.role)).join('、')||'还未标记'}</b><span>标记自己和开黑朋友的位置；点击“我们 / 队友”调整。</span><label>我的位置<select id="solo-role" class="select" aria-label="我的位置"><option value="">${assigned?'按客户端分路':'尚未确认'}</option>${ROLES.map(r=>`<option value="${r.id}" ${(manualPlayerSlot(slots,client.session?.localPlayerCellId)?.role||saved.draft?.playerPosition?.role||assigned)===r.id?'selected':''}>${r.name}</option>`).join('')}</select></label>`}${button('role-pools','调整各位置英雄池','','quiet small')}</div>${recommendationError?'<div class="callout warning recommendation-error"><b>'+e(recommendationError)+'</b><p>已选英雄保留。检查英雄池、排除和公开已选英雄是否相互冲突。</p>'+button('role-pools','检查位置英雄池','','small')+button('hero-pool','检查全局英雄池','','small')+button('exclusions','检查排除','','small')+'</div>':''}${pickEligibilityView(localPickEligibility(client,slots,data.champions,{scope,soloRole,playerPosition:saved.draft?.playerPosition}))}<div class="draft-scope"><div class="segmented" aria-label="组合推荐范围">${Object.entries(DRAFT_SCOPES).map(([id,item])=>`<button class="segment ${scope===id?'active':''}" data-action="draft-scope" data-scope="${id}" aria-pressed="${scope===id}">${item.name}</button>`).join('')}</div><p>${DRAFT_SCOPES[scope].description}</p></div>${pairRefreshView(data,currentPairTargets(),pairRefreshStatus())}<div class="builder-grid"><section class="panel"><div class="panel-head"><div><h3>${icon('team')}我方五人阵容</h3><p>拖动头像换位置 · 拖到已有英雄上即可交换</p></div><span class="badge outline">已选 ${a.known} / 5</span></div><div class="slots">${slots.map(s=>slotHTML(s)).join('')}</div><div class="builder-foot"><p>${targetCount?`为${draftTargets(slots,scope,soloRole).map(roleName).join('、')}寻找搭档`:'英雄已锁定，可查看阵容建议'}<br><span class="subtle">“我们 / 队友”留在位置上；锁定英雄会保留</span></p>${button('recommend',generating?'正在搭配…':draftTargetLabel(),'spark','primary',generating?'disabled':'')}</div></section>
 <aside class="panel team-analysis"><div class="panel-head"><h3>阵容速览</h3><span class="badge">${a.known} 位已知</span></div><div class="panel-body"><div class="analysis-header"><span>根据已选英雄</span><span>覆盖情况</span></div>${[['frontline','前排'],['engage','开团'],['peel','保护'],['sustain','持续输出']].map(([k,v])=>`<div class="trait-row"><span>${v}</span><div class="trait-bar">${[1,2,3].map(i=>`<i class="${a.traits[k]>=i?'on':''}"></i>`).join('')}</div></div>`).join('')}<p class="insight">${a.known?e(a.warnings[0]||`已有${a.strengths.slice(0,3).join('、')}，${a.known===5?'开打前约好进场和保护分工。':'继续补齐阵容。'}`):'队友已选了英雄？先放进来，推荐会考虑全队的配合。'}</p></div></aside></div>
 <div class="connection-strip"><span role="status" aria-live="polite"><span class="status-dot ${client.connected?'connected':''}"></span> ${e(client.message)}${!client.connected&&live.age!==null?' · 上次成功读取 '+live.age+' 秒前，阵容为旧参考':''}${client.connected?' · '+e(phaseLabel(client.phase))+' · '+e(client.mode?.label||'模式待确认')+(client.phase==='ChampSelect'?' · 每约 2 秒同步':'')+(live.age!==null?' · '+(live.age>15?'上次读取 '+live.age+' 秒前':'读取于 '+new Date(client.receivedAt).toLocaleTimeString('zh-CN')):'')+(live.remaining!==null?' · 选人阶段约剩 '+live.remaining+' 秒':''):''}</span>${button('example','试试“两位队友已选”','arrow','quiet small')}</div>${live.hover.length?`<p class="bottom-note">正在预选：${live.hover.map(p=>e(champ(p.id)?.name)+(p.local?'（你）':'')).join('、')}。尚未选定，不放入阵容；可手动选择用于预演。</p>`:''}${live.mismatch.length?`<div class="callout warning">这里的拖动用于搭配分析。${live.mismatch.map(m=>e(champ(m.champion)?.name||'此位置')+'：本机安排'+roleName(m.local)+'，客户端正式位置'+roleName(m.assigned)).join('；')}。位置任务按客户端分工，请在客户端正式换位。</div>`:''}${currentPreparationHTML()}${unassigned.length?`<div class="callout">已获取公开选人，推荐会避开这些英雄。拖到空位置后才会分析其位置配合，也可以点击安排。<div class="unassigned">${unassigned.map(p=>`<button draggable="true" data-drag-cell="${p.cellId}" data-action="assign-import" data-id="${p.champion}">${portrait(champ(p.champion),'sm').replace('<img ','<img draggable="false" ')}${e(champ(p.champion)?.name)}${p.local?' · 你':''}</button>`).join('')}</div></div>`:''}
 ${enemy.length?`<p class="bottom-note">已公开敌方英雄：${enemy.map(id=>e(champ(id)?.name||id)).join('、')}。${client.session?.allowDuplicatePicks===false?'当前选人禁止重复，推荐会避开这些英雄。':'允许镜像或规则未知时，不把敌方英雄当成禁选。'}</p>`:''}
 <div class="recommend-heading"><div><h2>${scope==='solo'?(results.length?'适合你的英雄候选':'从自己的位置开始'):results.length?'给你们的开黑方案':'从一套有趣的配合开始'}</h2><p>${scope==='solo'?'每张卡推荐你的一位英雄，可查看对应位置的出装与符文。':results.length?'点英雄查看符文与出装，点方案查看配合细节。':'支持全位置，特别准备了下路双人娱乐搭配。'}</p></div><div class="draft-result-actions">${button('combination-library',`组合库 · ${DUOS.length} 双人 / ${TRIOS.length} 三人`,'book','small')}${results.length?button('reroll',generating?'正在搭配…':'换一批','refresh','small',generating?'disabled':''):''}</div></div>
 ${results.length?`<div class="results">${results.slice(0,3).map((r,i)=>resultCard(r,i)).join('')}</div>`:`<section class="panel"><div class="empty-state">${icon('spark')}<h3>${scope==='solo'?'选一个适合这局的英雄':'想赢，也想玩点不一样的'}</h3><p>${scope==='solo'?'选择“我的位置”后推荐该路英雄；位置未定时展示各路候选。也可以填入队友已选英雄，参考阵容需要。':'可以先填两位队友的英雄，也可以直接推荐。锁定一个想玩的英雄，助手会为另外的位置寻找配合。'}</p>${button('recommend',scope==='solo'?'推荐我的英雄':'看看适合我们的组合','arrow','primary')}<div class="empty-tips"><span><b>01</b> 确认位置</span><span><b>02</b> 锁定已选</span><span><b>03</b> 挑一套开玩</span></div></div></section>`}
 <p class="bottom-note">搭配库：${DUOS.length} 套双人、${TRIOS.length} 套三人、${CROSS_SYNERGIES.length} 条跨位置联动。推荐先保留锁定英雄，再用机制联动、分工覆盖与位置常见程度生成组合；不把排列数量当作数据库数量。伤害构成按常见机制估算，出装可改变。不预测胜负。规则整理于 ${RULES_VERSION}，资料 ${e(data.version)}。${data.patch!==RULES_PATCH?'当前资料版本已更新，搭配规则仍待复核。':''}</p>`;
}
function slotHTML(s){const c=champ(s.champion),mine=scope==='solo'?s.role===soloRole:s.party,pick=client.session?.myTeam?.find(p=>p.cellId===s.clientCellId);return `<article data-drop-role="${s.role}" class="slot ${mine?'party':''}">${c?`<button class="slot-clear" data-action="clear-slot" data-role="${s.role}" aria-label="清空${roleName(s.role)}">×</button>`:''}<div class="slot-role"><span class="role-icon">${ROLES.find(r=>r.id===s.role).short}</span>${roleName(s.role)}</div><button class="champ-pick" draggable="${!!c}" data-drag-role="${s.role}" data-action="pick-slot" data-role="${s.role}" aria-label="选择${roleName(s.role)}英雄">${portrait(c).replace('<img ','<img draggable="false" ')}<span class="champ-name">${c?e(c.name):'选择英雄'}</span></button><div class="slot-meta">${Number.isInteger(s.clientCellId)?(s.manualPosition?'客户端 · 手动位置':pick?.pickState==='selecting'?'客户端 · 正在选择':pick?.pickState==='locked'?'客户端 · 已锁定':'客户端同步'):c?'手动选择':mine?'我的推荐位置':'位置待定 / 队友参考'}</div>${c?`<button class="slot-move" data-action="move-slot" data-role="${s.role}" aria-label="移动${e(c.name)}的位置">拖动换位 · 或点击</button>`:''}<div class="slot-bottom"><button class="slot-toggle ${mine?'on':''}" data-action="${scope==='solo'?'solo-role':'toggle-party'}" data-role="${s.role}" title="${scope==='solo'?'选择我的位置':'切换是否参与我们的推荐'}" >${scope==='solo'?(mine?'我':'选为我的位置'):(s.party?'我们':'队友')}</button>${c?`<button class="slot-config" data-action="build" data-id="${c.id}" data-role="${s.role}" aria-label="查看${roleName(s.role)}配置">配置</button><button class="slot-lock ${s.locked?'on':''}" data-action="toggle-lock" data-role="${s.role}" aria-label="${s.locked?'解锁':'锁定'}${roleName(s.role)}">${icon(s.locked?'lock':'unlock')}</button>`:''}</div></article>`;}
function resultCard(r,i=0){return renderResultCard(r,i,data,saved,style);}
function renderLibrary(){return `${heading('READY WHEN YOU ARE.','符文、出装，一起准备好','选择英雄和本局位置，快速查看配套配置。','sword')}<div class="library-toolbar"><div class="search-wrap">${icon('search')}<input id="library-search" placeholder="搜英雄、称号、昵称或拼音，例如：女枪 / mf" value="${e(libraryQuery)}" aria-label="搜索英雄配置" /></div><span class="badge">${data.champions.length} 位英雄</span></div><div class="chips library-rolebar">${[['all','全部位置'],...ROLES.map(r=>[r.id,r.name])].map(([id,n])=>`<button class="chip ${libraryRole===id?'active':''}" data-action="library-role" data-role="${id}">${n}</button>`).join('')}</div><div class="library-grid" id="library-grid">${libraryTiles()}</div><p class="bottom-note">优先展示本版本全球排位常用配置；没有对应位置样本时使用机制基础方案。娱乐搭配请注意补刀与经济分工。</p>`;}
function libraryTiles(){const evidence=buildRoleEvidence(data),supported=new Set(evidence.filter(r=>r.role===libraryRole).map(r=>r.champion));return data.champions.filter(c=>matchesSearch(c,libraryQuery)&&(libraryRole==='all'||profile(c,libraryRole).roles.includes(libraryRole)||supported.has(c.id))).map(c=>`<button class="hero-tile" data-action="build" data-id="${c.id}" data-role="${libraryRole==='all'?profile(c).roles[0]:libraryRole}">${portrait(c)}<b>${e(c.name)}</b><small>${e(c.title)}${libraryRole!=='all'&&!profile(c,libraryRole).roles.includes(libraryRole)?' · 来源有此位置参考':''}</small></button>`).join('')||'<div class="empty-state">没有找到英雄，试试其他称呼。</div>';}
function renderHex(){return `${heading('A LITTLE MAYHEM. A LOT OF FUN.','海克斯灵感手册','查强化、找思路，把想玩的组合收藏起来。','hex')}<div class="hex-layout"><aside class="panel hex-side"><div class="panel-head"><h3>这局想玩什么</h3></div><div class="panel-body"><button class="btn" style="width:100%" data-action="pick-hex">${hexHero?portrait(champ(hexHero),'sm'):icon('team')}${hexHero?e(champ(hexHero)?.name):'选择一个英雄'}</button><p class="bottom-note">先选英雄，查看专属强化参考和海克斯版本出装。</p>${hexHero?button('build','查看海克斯出装','sword','small',`data-id="${hexHero}" data-role="${profile(champ(hexHero)).roles[0]}" data-mode="hex"`):''}<div class="detail-section" style="margin-top:16px"><h3>我的强化备选 <span class="badge">${hexSelected.length}</span></h3><p class="muted" style="font-size:11px">点击强化查看说明，再加入备选，最多 5 项。</p><div class="chips">${hexSelected.map(id=>`<button class="chip active" data-action="toggle-augment" data-id="${id}">${e(data.augments.find(a=>a.id===id)?.name)} ×</button>`).join('')}</div></div>${button('save-hex',saved.favorites.some(f=>f.id===hexFavoriteId())?'已收藏 · 点击取消':'收藏这套灵感','star','primary small',hexSelected.length?'':'disabled')}<div class="callout">强化清单来自游戏资料。这里不展示未经验证的胜率，也不把竞技场数值套进海克斯大乱斗。</div></div></aside><section><div class="library-toolbar"><div class="search-wrap">${icon('search')}<input id="hex-search" value="${e(hexQuery)}" placeholder="搜索强化名称或效果" aria-label="搜索海克斯强化" /></div><select class="select" id="hex-category" aria-label="强化效果分类"><option value="all">全部效果</option>${AUGMENT_CATEGORIES.map(([id,name])=>`<option value="${id}" ${hexCategory===id?'selected':''}>${name}</option>`).join('')}</select><select class="select" id="hex-rarity" aria-label="强化稀有度"><option value="all">全部稀有度</option>${Object.entries(rarityName).map(([id,n])=>`<option value="${id}" ${hexRarity===id?'selected':''}>${n}</option>`).join('')}</select></div>${renderHexComparison({data,hero:hexHero,options:hexOptions,owned:hexOwned})}${hexHero?renderHexReference():''}<div class="toolbar"><span class="muted" style="font-size:11px">${data.augments.length} 项强化 · 资料 ${e(data.augmentVersion||data.version)}</span><button class="chip ${hexSelectedOnly?'active':''}" data-action="hex-selected">只看已选</button></div><div class="augment-grid" id="augment-grid">${augmentTiles()}</div></section></div>`;}

function renderHexReference(){return renderHexSourceReference({data,hero:hexHero,filtered:hexForHero});}

function augmentTiles(){const heroIds=data.hexBuilds?.[hexHero]?.augmentIds||[];return data.augments.filter(a=>(hexCategory==='all'||augmentCategories(a).includes(hexCategory))&&(!hexForHero||heroIds.includes(a.id))&&(!hexSelectedOnly||hexSelected.includes(a.id))&&(hexRarity==='all'||a.rarity===hexRarity)&&`${a.name} ${a.description}`.toLowerCase().includes(hexQuery.toLowerCase())).map(a=>`<button class="augment-card ${hexSelected.includes(a.id)?'selected':''}" data-action="augment-detail" data-id="${a.id}"><div class="augment-title">${asset('augment',a.id,a.name)}<div><b>${e(a.name)}</b><div class="rarity-${a.rarity}" style="font-size:10px">${rarityName[a.rarity]||'特殊'}</div></div></div><p>${e(a.description?a.description.slice(0,96)+(a.description.length>96?'…':''):'已收录当前模式清单，具体效果待补充。以客户端说明为准。')}</p><div class="augment-footer"><span>${hexSelected.includes(a.id)?'✓ 已加入备选':'查看详情'}</span>${icon('chevron')}</div></button>`).join('')||'<div class="empty-state">没有匹配的强化，试试其他筛选条件。</div>';}
function renderFavorites(){return `${heading('KEEP THE GOOD IDEAS.','下次就玩这套','只收藏你喜欢的搭配，不记录战绩。','star')}${saved.favorites.length?`<div class="favorite-list">${saved.favorites.map((f,i)=>`<article class="favorite-card"><div style="display:flex;justify-content:space-between"><span class="badge ${f.type==='hex'?'purple':'green'}">${f.type==='hex'?'海克斯灵感':f.type==='build'?'英雄配置':'开黑组合'}</span><button class="favorite-button" data-action="delete-favorite" data-index="${i}" aria-label="删除收藏${e(f.title)}">${icon('trash')}</button></div><h3>${e(f.title)}</h3><div style="display:flex;gap:8px;margin-top:12px">${(f.type==='team'?f.slots?.filter(s=>s.party).map(s=>s.champion):[f.champion]).filter(Boolean).slice(0,5).map(id=>portrait(champ(id),'sm')).join('')}</div>${favoriteBuildSummary(data,f)}${favoriteTeamSummary(data,f,i)}<p>${f.type==='hex'?e((f.augments||[]).map(id=>data.augments.find(a=>a.id===id)?.name||'旧版强化').join(' · ')):`收藏于 ${dateLabel(f.createdAt)}`}<br>保存版本 ${e(f.version||'未知')}${f.version&&f.version!==data.version?' · 当前版本已变化':''}</p>${button('open-favorite',f.type==='team'?'载入开黑成员与配置':'查看收藏','arrow','small',`data-index="${i}"`)}${f.type==='team'?button('update-team-favorite','用最近选择更新配置','refresh','quiet small',`data-index="${i}"`):''}</article>`).join('')}</div>`:`<section class="panel"><div class="empty-state">${icon('star')}<h3>留住想玩的点子</h3><p>在推荐方案、英雄配置或海克斯手册中点击收藏，下次打开就能找到。</p>${button('go-draft','去看看开黑组合','arrow','primary')}</div></section>`}`;}
function renderSettings(){return `${heading('LOCAL FIRST. ALWAYS CLEAR.','数据与连接','资料保存在本机，推荐的来源与版本随时可查。','settings')}<div class="settings-grid"><section class="panel full"><div class="panel-body"><h3>界面与局内概览</h3><p>调整文字大小、概览模块和显示顺序。只调整助手窗口。</p>${button('presentation-open','设置字号与指引内容','settings','small')}</div></section>${catalogPanel(data)}<section class="panel"><div class="panel-head"><h3>游戏客户端</h3><span class="badge ${client.connected?'green':''}">${client.connected?'已连接':'未连接'}</span></div><div class="panel-body"><p class="section-copy">${e(client.message)}</p><div class="setting-row"><div><b>游戏安装目录</b><p style="word-break:break-all">${e(saved.preferences.installPath||'自动检测')}</p></div>${button('choose-dir','选择目录','','small')}</div><div class="setting-row"><div><b>选人时自动贴边</b><p>在客户端旁显示推荐、方案与阵容；空间不足时靠屏幕边缘，可打开完整助手。</p></div><button class="switch ${saved.preferences.clientCompanion!==false?'on':''}" data-action="client-companion" role="switch" aria-checked="${saved.preferences.clientCompanion!==false}" aria-label="选人时自动贴边"><i></i></button></div><div class="callout"><b>局内窗口设置</b><p>指引是桌面浮窗。建议使用无边框或窗口模式，游戏分辨率与 Windows 显示分辨率一致；独占全屏可能遮住指引。</p>${button('recover-guide','找回局内指引','book','small')} ${button('window-info','窗口检查','settings','small')}</div><div class="setting-row"><div><b>自动同步选人</b><p>连接后同步公开选人信息；手动安排的位置会保留。</p></div><button class="switch ${saved.preferences.autoSync!==false?'on':''}" data-action="auto-sync" role="switch" aria-checked="${saved.preferences.autoSync!==false}" aria-label="自动同步选人"><i></i></button></div><div class="setting-row"><div><b>局内读取自己的装备</b><p>指引打开时读取本机接口；不可用时保留手动进度。</p></div><button class="switch ${saved.preferences.autoLive!==false?'on':''}" data-action="auto-live" role="switch" aria-checked="${saved.preferences.autoLive!==false}" aria-label="局内读取自己的装备"><i></i></button></div><div class="setting-row"><div><b>进入游戏时自动打开指引</b><p>选人后自动准备出装与符文，进入游戏时显示；新局恢复鼠标穿透。</p></div><button class="switch ${saved.preferences.guideAutoShow!==false?'on':''}" data-action="guide-auto-show" role="switch" aria-checked="${saved.preferences.guideAutoShow!==false}" aria-label="进入游戏自动呼出指引"><i></i></button></div><div class="setting-row"><div><b>游戏结束后的指引</b><p>隐藏后仍可用快捷键或托盘呼出查看。</p></div><select class="select" id="guide-after-game" aria-label="游戏结束后的指引">${[['hide','自动隐藏'],['collapse','收起小窗'],['keep','保持显示']].map(([id,n])=>`<option value="${id}" ${(saved.preferences.guideAfterGame||'hide')===id?'selected':''}>${n}</option>`).join('')}</select></div><div class="setting-row"><div><b>同步选人</b><p>读取已公开的选人信息，位置不明确时由你安排。</p></div>${button('sync',syncing?'连接中…':'重新连接','refresh','small',syncing?'disabled':'')}</div><div class="callout">登录国服客户端后即可尝试连接。接口可能随更新变化；连接不可用时，所有手动选人与资料查询仍可使用。若始终看不到 Windows 授权窗口，可先从托盘退出助手，再右键桌面快捷方式选择“以管理员身份运行”，由你确认系统提示。</div></div></section><section class="panel"><div class="panel-head"><h3>资料更新</h3><span class="badge green">${e(data.version)}</span></div><div class="panel-body"><div class="setting-row"><div><b>启动时检查更新</b><p>每天检查基础资料；峡谷方案点击刷新获取，离线沿用所选来源缓存。</p></div><button class="switch ${saved.preferences.autoCheck?'on':''}" data-action="auto-check" role="switch" aria-checked="${!!saved.preferences.autoCheck}" aria-label="启动时检查更新"><i></i></button></div><div class="setting-row"><div><b>最后获取</b><p>${dateLabel(data.fetchedAt)} · 规则整理 ${RULES_VERSION}</p></div>${button('update',updating?'更新中…':'检查资料','refresh','small',updating?'disabled':'')}</div><p class="bottom-note"><span id="update-message" role="status">${e(updateMessage)}</span><br>国服实际版本以客户端为准；Data Dragon 的资料版本号与游戏显示版本号可能不同。资料更新不会自动改变人工整理的搭配规则。</p></div></section><section class="panel full"><div class="panel-head"><h3>来源与覆盖范围</h3><span class="badge">资料可离线查看</span></div><div class="panel-body"><div class="data-stat-grid"><div class="data-stat"><b>${data.champions.length}</b><span>位英雄</span></div><div class="data-stat"><b>${data.augments.length}</b><span>项海克斯强化</span></div><div class="data-stat"><b>${DUOS.length}</b><span>套双人搭配</span></div></div>${[['Riot Data Dragon','英雄、装备、符文和召唤师技能','https://developer.riotgames.com/docs/lol'],['腾讯英雄联盟资料','国服英雄名称、称号与搜索别名','https://lol.qq.com/data/info-heros.shtml'],['CommunityDragon','同版本英雄攻击力成长、攻速比例和海克斯游戏资源','https://www.communitydragon.org'],['OP.GG',`峡谷当前选用${e(buildSourceLabel(data.buildSource))}；海克斯使用全球该模式资料`,'https://op.gg/lol/champions']].map(([n,desc,url])=>`<div class="source-row"><span><b>${n}</b>　${desc}</span><button data-action="link" data-url="${url}">查看来源 ↗</button></div>`).join('')}<div class="callout ${data.patch!==RULES_PATCH?'warning':''}">当前来源已缓存 ${Object.keys(data.builds||{}).length} 套峡谷位置配置、${Object.keys(data.hexBuilds||{}).length} 位海克斯英雄配置。三人搭配使用人工整理的机制规则（${RULES_PATCH}），不预测胜率。${data.patch!==RULES_PATCH?'资料已升级，规则需要复核。':'新版本上线后，先核对机制与装备变化。'}${data.augmentError?` 海克斯资料更新提示：${e(data.augmentError)}`:''}</div></div></section><section class="panel full"><div class="panel-head"><h3>收藏与本地保存</h3><span class="muted" style="font-size:11px">无需账号</span></div><div class="panel-body"><div class="setting-row"><div><b>备份你喜欢的组合</b><p>导入时合并收藏与排除列表，恢复推荐风格和更新偏好。</p></div><div style="display:flex;gap:9px">${button('import','导入备份','upload','small')}${button('export','导出备份','download','small')}</div></div><p class="bottom-note">${e(boot.dataPath||'浏览器预览数据保存在当前浏览器中')}<br>League of Legends 与相关游戏资源归 Riot Games 所有。开黑搭子是独立个人工具，并未获得 Riot Games 或腾讯的认可或赞助。</p></div></section></div>`;}

function openPicker(kind,role=null){picker={kind,role,query:'',filter:kind==='slot'?role:'all'};buildView=null;detailResult=null;renderPicker();requestAnimationFrame(()=>document.getElementById('picker-search')?.focus());}
function renderPicker(){overlay.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal" role="dialog" aria-modal="true" aria-label="选择英雄"><header class="modal-header"><div><h2>${picker.kind==='rolepool'?roleName(picker.role)+'英雄池':picker.kind==='pool'?'我们的英雄池':picker.kind==='excluded'?'不想玩的英雄':picker.kind==='hex'?'选择海克斯英雄':`选择${roleName(picker.role)}英雄`}</h2><p>${picker.kind==='pool'?'点击标记你们愿意玩的英雄；推荐范围可设为优先或仅使用这些英雄。':picker.kind==='excluded'?'点击切换排除状态；推荐时会跳过这些英雄。':'支持中文名、称号、英文名与拼音；非常规玩法可切换到全部。'}</p></div>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="modal-controls"><div class="search-wrap">${icon('search')}<input id="picker-search" aria-label="搜索英雄" value="${e(picker.query)}" placeholder="搜英雄，例如：亚索 / 女枪 / jh" /></div><div class="chips">${[['all','全部'],...ROLES.map(r=>[r.id,r.name])].map(([id,n])=>`<button class="chip ${picker.filter===id?'active':''}" data-action="picker-role" data-role="${id}">${n}</button>`).join('')}</div></div><div class="champ-grid" id="picker-grid">${pickerTiles()}</div><footer class="modal-footer">${picker.kind==='rolepool'?`${roleName(picker.role)}已有 ${saved.preferences.rolePools[picker.role].heroes.length} 位英雄`:picker.kind==='pool'?`英雄池已有 ${saved.preferences.pool.length} 位英雄`:picker.kind==='excluded'?`已排除 ${saved.excluded.length} 位英雄`:'英雄的位置由你决定，选中后默认锁定。'}</footer></section></div>`;}
function pickerTiles(){const match=pickerMatches(data.champions,picker.query,picker.filter,matchesSearch,profile);return (match.fallback?'<p class="picker-fallback">当前筛选位置无常规英雄，以下为其他位置的搜索结果。选中后仍放在'+roleName(picker.role||picker.filter)+'。</p>':'')+match.champions.map(c=>{const used=picker.kind==='slot'&&slots.some(s=>s.role!==picker.role&&s.champion===c.id);return `<button class="champ-option ${used?'used':''} ${(picker.kind==='excluded'&&saved.excluded.includes(c.id)||picker.kind==='pool'&&saved.preferences.pool.includes(c.id)||picker.kind==='rolepool'&&saved.preferences.rolePools[picker.role].heroes.includes(c.id))?'selected':''}" data-action="pick-champion" data-id="${c.id}" aria-label="${e(c.name)}" ${used?'disabled':''} title="${e(c.name)} · ${e(c.title)}">${portrait(c)}<span>${e(c.name)}</span></button>`;}).join('')||'<p class="muted">没有找到匹配英雄。</p>';}
function closeOverlay(){activeOverlaySelect=null;pendingBuildRender=false;renderedBuildContext=null;currentWindowInfo=null;catalogRequest++;comboView=null;picker=null;buildView=null;detailResult=null;buildReturn=null;overlay.innerHTML='';}
async function showWindowInfo(refresh=false){
 if(!refresh){closeOverlay();overlay.innerHTML=windowInfoDialog(null);}
 const restore=preserveOverlay(overlay),request=++catalogRequest;
 try{const info=await api.windowInfo();if(request!==catalogRequest||!overlay.querySelector('[data-window-info]'))return;currentWindowInfo=info;overlay.innerHTML=windowInfoDialog(info);restore();}
 catch(error){if(request!==catalogRequest||!overlay.querySelector('[data-window-info]'))return;overlay.innerHTML=windowInfoDialog(currentWindowInfo,String(error.message||'窗口资料暂不可用').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,''));restore();}
}
function rememberedPreparation(context,options){return recallPreparation(preparations,guideSelection,context,options);}
function showBuild(id,role,mode='rift',selection={}){if(!champ(id))throw Error('当前资料没有这位英雄');const duo=mode==='rift'?currentCombo(slots,id,role,data.catalogInfo?.status,null,activeCreativePlan):null;const context={id,role,mode,...creativeComboContext(duo),...selection};if(detailResult)buildReturn={index:results.indexOf(detailResult),id:detailResult.id,signature:resultDraftSignature,scroll:overlay.querySelector('.drawer-content')?.scrollTop||0};picker=null;comboView=null;detailResult=null;buildView={variant:'default',conditions:[],coreIndex:0,...rememberedPreparation(context,{allowSavedCombo:slots.every(s=>!s.champion)&&!client.session?.myTeam?.some(p=>p.championId)}),...context};renderBuild();maybeRefreshBuild(id,role,mode);}
function editBuildSummoners(el,field,value){
 if(!buildView||el.dataset.plan!==[buildView.id,buildView.role,buildView.mode].join(':'))throw Error('英雄或位置已变化，请重新确认召唤师技能');
 const next=changeCompanionPlan(data,buildSelection(),field,value);delete buildView.summonerIds;
 if(next.summonerIds)buildView.summonerIds=[...next.summonerIds];renderBuild();
}
function buildSelection(){return {id:buildView.id,role:buildView.role,mode:buildView.mode,coreIndex:buildView.coreIndex,conditions:[...buildView.conditions],...selectedBuildFields(buildView,{preserveUnavailable:true}),...(buildView.mode==='hex'?{augmentIds:buildView.augmentIds||[],compareIds:buildView.compareIds||[],ownedAugmentIds:buildView.ownedAugmentIds||[]}:{})};}
function buildSelectionContext(build){const own=currentPlayerSelection(client.session,data.champions,slots);return JSON.stringify([buildChoiceKey(buildSelection()),buildView.augmentIds||[],buildView.compareIds||[],buildView.ownedAugmentIds||[],data.patch,data.buildSource,build?.reference?.fetchedAt,client.connected,client.phase,client.game?.gameId,client.mode?.id,own?.id,own?.formalRole,own?.role,runeAppliedKeys.has(runeApplicationKey(build?.champion,build?.role,build?.runePage))]);}
function acceptGuideSelection(selection){if(!selection)return;rememberPreparation(selection);guideSyncBase=selection;lastGuideSyncKey=buildChoiceKey(selection);if(buildView&&selection.id===buildView.id&&selection.role===buildView.role&&selection.mode===buildView.mode){for(const field of [...CONFIGURATION_FIELDS,'compareIds','ownedAugmentIds'])delete buildView[field];Object.assign(buildView,selection);renderBuild();}}
function syncPreparedGuide(selection){if(!api.updateGuide||!guideSelection||guideSelection.id!==selection.id||guideSelection.role!==selection.role||guideSelection.mode!==selection.mode)return;const key=buildChoiceKey(selection);if(key===lastGuideSyncKey)return;const changedFields=configurationPatch(guideSyncBase||guideSelection,selection);guideSyncBase=selection;lastGuideSyncKey=key;if(!changedFields.length)return;guideSyncPending++;guideSyncChain=guideSyncChain.catch(()=>{}).then(()=>api.updateGuide({...selection,changedFields})).catch(error=>{if(lastGuideSyncKey===key)lastGuideSyncKey='';toast('指引尚未同步：'+error.message,true);}).finally(()=>{guideSyncPending--;if(!guideSyncPending)acceptGuideSelection(guideSelection);});}
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
 const c=champ(buildView.id),b=getBuild(c,buildView.role,data,buildView);
 if(activeOverlaySelect?.isConnected&&overlay.contains(activeOverlaySelect)&&renderedBuildContext===buildSelectionContext(b)&&currentMatchupSelect(activeOverlaySelect)){pendingBuildRender=true;return;}
 activeOverlaySelect=null;pendingBuildRender=false;
 const restoreOverlay=preserveOverlay(overlay),refreshing=refreshingBuilds.has(buildKey(buildView.id,buildView.role,buildView.mode));
 buildView.build=b;if(!buildView.coreId||buildView.coreId===b.selectedCoreId){buildView.coreIndex=b.selectedCoreIndex;buildView.coreId=b.selectedCoreId||undefined;}renderedBuildContext=buildSelectionContext(b);rememberPreparation(buildSelection());syncPreparedGuide(buildSelection());const buildSaved=savedBuild(buildView);const runeMap=new Map(data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r]))));const primary=data.runes.find(t=>t.id===b.runePage?.primaryStyleId),secondary=data.runes.find(t=>t.id===b.runePage?.subStyleId);
 const itemsHTML=items=>`<div class="items-row">${items.map(i=>`<div class="item" title="${e(gameDescription(i.description))}">${asset('item',i.id,i.name)}<span>${e(i.name)}</span><small>${i.gold.total} 金</small>${i.purchaseBase?`<small class="text-green">购买${e(i.purchaseBase.name)}后升级</small>`:''}</div>`).join('')}</div>`;
 overlay.innerHTML=`<div class="modal-backdrop drawer-backdrop" data-backdrop="true"><section class="modal drawer" role="dialog" aria-modal="true" aria-label="英雄配置"><header class="modal-header"><div><span class="eyebrow">READY TO PLAY</span><h3>符文与出装</h3></div><div class="build-header-actions">${buildReturn?button('back-result','返回这套方案','arrow','quiet small'):''}${button('close','','close','quiet icon-only','aria-label="关闭"')}</div></header><div class="drawer-content"><div class="champ-summary">${portrait(c,'lg')}<div><h2>${e(c.name)}</h2><p>${e(c.title)} · ${b.title}</p><span class="badge green" style="margin-top:7px">${b.mode==='hex'?'海克斯大乱斗':roleName(b.role)}</span> <span class="badge">${data.version}</span></div></div><div class="toolbar"><select class="select" id="build-role" aria-label="配置位置" ${b.mode==='hex'?'disabled':''}>${ROLES.map(r=>`<option value="${r.id}" ${b.role===r.id?'selected':''}>${r.name}</option>`).join('')}</select><div class="segmented"><button class="segment ${b.mode==='rift'?'active':''}" data-action="build-mode" data-mode="rift">召唤师峡谷</button><button class="segment ${b.mode==='hex'?'active':''}" data-action="build-mode" data-mode="hex">海克斯大乱斗</button></div></div>${b.mode==='rift'?buildSourceControls(data,{reference:b.reference,champion:b.champion,role:b.role,refreshing}):''}<nav class="build-nav" aria-label="配置内容">${button("build-jump","玩法","","quiet small",'data-section="loadout"')}${button("build-jump","出装","","quiet small",'data-section="items"')}${button("build-jump",b.mode==="rift"?`符文 · ${b.runeOptions.length} 套`:"强化说明","","quiet small",'data-section="runes"')}${button("build-jump","加点","","quiet small",'data-section="skills"')}${b.mode==='rift'?button('build-jump','对手应对','','quiet small','data-section="opponent"'):''}</nav>${loadoutSelector(b,data)}${preparationSummary(data,b,c,{own:currentPlayerSelection(client.session,data.champions,slots),appliedKey:runeAppliedKeys.has(runeApplicationKey(c.id,b.role,b.runePage))?runeApplicationKey(c.id,b.role,b.runePage):'',refreshing,error:buildErrors.get(buildKey(b.champion,b.role,b.mode))})}<div class="guide-launch"><div><b>${guideSelection?.id===b.champion&&guideSelection?.role===b.role&&guideSelection?.mode===b.mode?"已带入指引 · 修改自动同步":"把配置带到本局指引"}</b><p>紧凑小窗 · 鼠标穿透 · ${boot.guideHotkeyAvailable===false?'从托盘呼出':'Ctrl + Shift + G 呼出'}</p></div>${button('open-guide','本局指引','book','primary small')}</div><p class="section-copy">${e(b.tips)}</p>${b.stale?'<div class="callout warning">当前资料版本已更新，这套机制方案尚未完成新版本复核。</div>':''}
 <section class="detail-section" data-build-section="items"><h3>出门购买</h3>${itemsHTML(b.start)}${gearSelector(b,'start')}${b.granted.length?`<p class="bottom-note">位置任务自动给予：${b.granted.map(i=>e(i.name)).join("、")}，不是需要购买的出门装备。</p>`:""}${b.early.length?`<p class="bottom-note">尽早补出：${b.early.map(i=>e(i.name)).join('、')}；按用途和对线安排购买。</p>`:''}${b.support?'<p class="bottom-note">辅助位的云游图鉴由客户端按位置规则提供；没有自动获得时检查游戏模式与位置。完成任务后会升级，后续为它保留一个位置。</p>':''}</section>
 <section class="detail-section" data-build-section="items"><h3>成装路线 <span class="badge">${b.source}</span></h3>${coreRouteChoices(b,b.selectedCoreIndex,data)}${gearSelector(b,'boots')}${itemsHTML(b.items)}${bottomQuestPlanControl(b)}${laterItemSelector(b)}${itemSetControls(c,b,data,{statuses:itemSetStatuses})}<p class="bottom-note">鞋子可按对线提前购买；后续装备按局势调整。${b.mode==='hex'?'海克斯会改变装备价值，请结合已选强化。':b.role==='bottom'?'下路位置任务完成后，鞋子可移入任务槽，再按对局补第六件成装。':''}${b.missing.length?' 部分装备在当前模式不可用，已从方案中隐藏。':''}</p></section>
 <section class="detail-section"><h3>遇到这些情况</h3><div class="chips">${[['ad','普攻压力大'],['ap','魔法伤害多'],['control','控制多'],['heal','对手回血多'],['burst','容易被秒']].map(([id,n])=>`<button class="chip ${buildView.conditions.includes(id)?'active':''}" data-action="build-condition" data-condition="${id}">${n}</button>`).join('')}</div>${b.adjustments.map(a=>`<div class="callout"><b>${a.title}</b>　${e(a.text)}</div>`).join('')}</section>
 <section class="detail-section" data-build-section="runes"><h3>${b.mode==='hex'?'强化与玩法':'推荐符文'}</h3>${b.runePage?`${runeSelector(b,data)}<div class="rune-columns">${[[primary,b.runePage.selectedPerkIds.slice(0,4)],[secondary,b.runePage.selectedPerkIds.slice(4,6)]].map(([tree,ids])=>`<div class="rune-tree"><h4>${tree.name}</h4>${ids.map((id,i)=>`<div class="rune-row ${tree===primary&&i===0?'keystone':''}" title="${e(gameDescription(runeMap.get(id)?.longDesc))}">${asset('rune',id,runeMap.get(id)?.name)}<span>${e(runeMap.get(id)?.name)}</span></div>`).join('')}</div>`).join('')}</div><div class="shard-row">${b.runePage.selectedPerkIds.slice(6).map(id=>`<span class="shard">${SHARDS[id]}</span>`).join('')}</div>${runeTargetNotice(c)}<div class="detail-actions">${button('apply-runes','用'+e(c.name)+'方案替换符文','check','primary',!boot.desktop?'title="桌面版支持应用符文"':'')}</div><p class="bottom-note">点击后直接覆盖一张可编辑符文页，不保留原方案。优先复用上次写入的页，再使用当前页或第一张可编辑页；没有可编辑页时才新建。</p>`:`<p>${b.mode==='hex'?'海克斯模式与峡谷符文规则不同，这里不应用常规符文页。强化请在“海克斯手册”中查询，按局内实际选项决定。':'这套符文与当前资料不匹配，暂时不可应用。'}</p>`}</section>
 <section class="detail-section" data-build-section="skills"><h3>召唤师技能与加点</h3>${skillSelector(b)}${summonerSelector(b,data,{planKey:[buildView.id,buildView.role,buildView.mode].join(':')})}${b.priority?`<div class="skill-row" style="margin-top:16px">${b.priority.split('').map((s,i)=>`${i?'›':''}<span class="skill-key">${s}</span>`).join('')}<small>升级优先级</small></div>`:''}${b.first?`<p class="bottom-note">前三级参考：${b.first.split('').join(' → ')}。遇到入侵或特殊对线，一级技能按实际情况调整。</p>`:'<p class="bottom-note">前三级技能请参考游戏内提示，根据对线或入侵情况调整。</p>'}<p class="bottom-note">按所选序列的技能节点升级；没有序列时通常优先大招，特殊机制以游戏内规则为准。</p></section>
 ${b.combo?.play?`<section class="detail-section" data-build-section="combo"><h3>${e(b.combo.title)} · 分阶段配合</h3>${duoPlayView(b.combo.play)}</section>`:''}
 ${buildView.mode==='rift'?`<section class="detail-section" data-build-section="opponent">${matchupTargetView(data,buildView,publicMatchupIds(),chosenMatchupOpponent(buildView)?.id,{status:matchupFocusStatus(buildView)})}${matchupPreparationView(matchupPreparation({data,selection:buildSelection(),enemyIds:publicMatchupIds(),targetId:chosenMatchupOpponent(buildView)?.id,publicContext:matchupPreparationContext(),build:b}),data,{plan:[buildView.id,buildView.role,buildView.mode].join(':')})}${heroCoachView(heroCoach({data,champion:buildView.id,role:buildView.role,priority:b.priority,enemyId:chosenMatchupOpponent(buildView)?.id,combo:b.combo,stage:b.combo?'key':'opening'}))}</section>`:''}
 ${buildView.mode==='rift'?`<section class="detail-section build-matchups"><h3>位置对阵参考</h3>${matchupView(data,b.reference,{publicEnemies:(client.session?.theirTeam||[]).map(p=>data.champions.find(c=>c.key===p.championId)?.id).filter(Boolean)})}</section>`:''}
 <section class="detail-section build-source"><h3>配置来源</h3><p class="bottom-note">${e(b.sourceNote)}</p>${comboSourceLinks(b.combo?.sources)}${b.reference?`<p class="bottom-note">获取于 ${dateLabel(b.reference.fetchedAt)}。${b.reference.core[b.selectedCoreIndex].samples>0&&b.reference.core[b.selectedCoreIndex].samples<200?'样本较少，尤其适合作为娱乐玩法参考，请结合对线调整。':''}</p>${button('link','查看原始数据','arrow','small',`data-url="${e(b.reference.sourceUrl)}"`)}`:''}${b.mode==='hex'?button('refresh-build',refreshing?'刷新中…':'刷新海克斯配置','refresh','small',refreshing?'disabled':''):''}</section><div class="detail-actions">${button('copy-build','复制配置','copy')}${button('favorite-build',buildSaved?'已收藏 · 点击取消':'收藏配置','star',buildSaved?'saved':'')}</div><p class="bottom-note">玩法提示整理于 ${b.rulesDate}；版本出装与机制提示分别维护。</p></div></section></div>`;restoreOverlay();reflectRunePending();
}
function showResult(index){if(resultsSignature!==recommendationKey(recommendationInput()))throw Error('推荐条件已变化，请重新推荐');detailResult=results[index];if(!detailResult)throw Error('方案已变化，请重新推荐');resultDraftSignature=resultsSignature;picker=null;buildView=null;buildReturn=null;overlay.innerHTML=resultPlayCard(detailResult,index,data,{favorites:saved.favorites,style});}
function markResultStale(){if(detailResult){const notice=document.getElementById('result-stale');if(notice)notice.hidden=false;overlay.querySelectorAll('[data-action="use-result"],[data-action="replace-member"],[data-action="favorite-result"],[data-action="copy-result"]').forEach(b=>b.disabled=true);}}
function recommendationInput(){const own=currentPlayerSelection(client.session,data.champions,slots),eligibility=localPickEligibility(client,slots,data.champions,{scope,soloRole,playerPosition:saved.draft?.playerPosition});return structuredClone({soloRole,soloChampion:scope==='solo'?(own?.id||slots.find(s=>s.role===soloRole&&s.locked)?.champion||null):null,slots,champions:data.champions,builds:data.builds,pairStatistics:data.pairStatistics,buildSource:data.buildSource,patch:data.patch,sourceRoles:buildRoleEvidence(data),style,scope,pool:saved.preferences.pool,poolMode:saved.preferences.poolMode,play:saved.preferences.play,rolePools:saved.preferences.rolePools,catalog:data.catalog,catalogStatus:data.catalogInfo?.status,excluded:[...saved.excluded],publicBans:clientBans,eligibleByRole:eligibility.eligibleByRole,confirmedPick:eligibility.confirmedPick,publicPicks:[...new Set([...unassigned.map(p=>p.champion),...unassignedPublicPicks(slots,client.session,data.champions).map(p=>p.champion)])],enemy:client.session?.allowDuplicatePicks===false?publicMatchupIds():[],visibleEnemies:publicMatchupIds(),creativePlan:activeCreativePlan,version:data.version,catalogVersion:data.catalog.version,limit:windowLayout.docked?6:3,offset});}
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
 if(generating)return;recommendationError='';const run=++recommendationRun;generating=true;render();
 try{offset=next?offset+(results.length||(windowLayout.docked?6:3)):0;const input=recommendationInput();
  const signature=recommendationKey(input);
  let result=await calculateRecommendation(input);if(!result.length&&offset){offset=0;result=await calculateRecommendation({...input,offset:0});}
  if(run!==recommendationRun||signature!==recommendationKey(recommendationInput()))return;
  for(const r of result)if(r.creative)resultCreativePlan(r);results=result;resultsSignature=signature;if(!result.length)recommendationError='当前位置英雄池与公开选人无法组成不重复的阵容，请调整限制';generating=false;render();if(!results.length)toast(recommendationError,true);else document.querySelector('.recommend-heading')?.scrollIntoView({behavior:'smooth',block:'start'});
 }catch(err){if(!err.cancelled&&run===recommendationRun){recommendationError=err.message;toast(err.message,true);}}finally{if(run===recommendationRun){generating=false;render();}}
}
const sync=createClientSync(performSync);
async function performSync(manual=true,fresh=false){
 lastSyncStarted=Date.now();syncing=true;const before=JSON.stringify(client),previousMatchups=matchupContext(),previousPhase=client.phase,previousRecommendation=recommendationKey(recommendationInput());let changed=false;if(manual)render();
 try{
  client=await api.client(manual||fresh);
  const selectionContext=client.selectionContext||'';if(api.matchupFocus&&lastMatchupSession!==selectionContext){matchupTargets.clear();lastMatchupSync='';}lastMatchupSession=selectionContext;
  const matchupGame=publicClientGameId(client)||'';
  if(matchupGame&&lastMatchupGame&&matchupGame!==lastMatchupGame||client.phase==='ChampSelect'&&!['Offline','ChampSelect'].includes(previousPhase)||['None','Lobby','Matchmaking','ReadyCheck'].includes(client.phase))matchupTargets.clear();
  if(matchupGame)lastMatchupGame=matchupGame;
  if(client.connected&&client.receivedAt)lastClientRead=client.receivedAt;else if(lastClientRead)client.receivedAt=lastClientRead;
  if(manual&&client.needsElevation){toast('正在请求 Windows 连接授权…');client=await api.authorizeClient();}
  const draftContext=reconcileClientDraft({...saved.draft,slots,style,scope,soloRole},publicClientGameId(client),saved.guide?.match?.gameId);
  if(draftContext.changed){saved.draft=draftContext.draft;slots=saved.draft.slots;soloRole=saved.draft.soloRole;changed=true;if(draftContext.newGame){if(activeCreativePlan&&!saved.draft.creativePlan)creativePlanNotice='新局已开始，原组合不会自动沿用；可以从收藏重新选择。';activeCreativePlan=saved.draft.creativePlan||null;pendingIntentPreparation=null;companionPreview=null;matchupTargets.clear();unassigned=[];}persist();}
  if(client.session){
   const merged=mergeClientSession(slots,client.session,data.champions);merged.slots=restorePlayerPosition(merged.slots,client.session,data.champions,saved.draft?.playerPosition);merged.unassigned=unassignedPublicPicks(merged.slots,client.session,data.champions);
   changed=changed||JSON.stringify(slots)!==JSON.stringify(merged.slots)||JSON.stringify(unassigned)!==JSON.stringify(merged.unassigned);slots=merged.slots;reconcileCreativePlan();unassigned=merged.unassigned;if(scope==='solo'){
    const own=currentPlayerSelection(client.session,data.champions,slots),player=client.session.myTeam.find(p=>p.cellId===client.session.localPlayerCellId);
    // The client declares a lane before the player chooses a champion.
    const role=manualPlayerSlot(slots,client.session.localPlayerCellId)?.role||(saved.draft?.playerPosition?.cellId===client.session.localPlayerCellId?saved.draft.playerPosition.role:null)||(own?.positionKnown?own.role:null)||CLIENT_POSITION_ROLES[String(player?.assignedPosition||'').toUpperCase()];
    if(role&&soloRole!==role){soloRole=role;changed=true;}
   }
   const keys=new Map(data.champions.map(c=>[c.key,c.id]));
   const nextEnemy=client.session.theirTeam.map(p=>keys.get(p.championId)).filter(Boolean),nextBans=client.session.bans.map(id=>keys.get(id)).filter(Boolean);
   if(JSON.stringify(enemy)!==JSON.stringify(nextEnemy)||JSON.stringify(clientBans)!==JSON.stringify(nextBans))changed=true;
   enemy=nextEnemy;clientBans=nextBans;if(changed){markResultStale();cancelRecommendation();results=[];offset=0;persist();}
   const matchupOwn=currentPlayerSelection(client.session,data.champions,slots),ownKey=matchupOwn?matchupTargetKey({...matchupOwn,mode:client.mode?.id}):'';
   if(lastMatchupOwn&&lastMatchupOwn!==ownKey){matchupTargets.clear();lastMatchupSync='';}lastMatchupOwn=ownKey;
   for(const [key,target] of matchupTargets)if(target&&!enemy.includes(target)){matchupTargets.delete(key);lastMatchupSync='';}
   const ownPlan=myPreparation();if(ownPlan&&matchupTargets.has(matchupTargetKey(ownPlan.selection)))syncMatchupFocus(ownPlan.selection,matchupTargets.get(matchupTargetKey(ownPlan.selection)));
   if(pendingIntentPreparation){const prepared=myPreparation();if(prepared){const intended=pendingIntentPreparation;pendingIntentPreparation=null;if(['id','role','mode'].every(field=>intended[field]===prepared.selection[field])){rememberPreparation(intended);syncPreparedGuide(intended);}}}
   if(manual)toast((unassigned.length?'读取成功，部分英雄需要你确认位置':'选人信息已同步')+(merged.markedLocalChanged?' · 已按客户端标出你的分路':''));
  }else{
   if(client.connected&&['None','Lobby','Matchmaking','ReadyCheck'].includes(client.phase)){
    if(saved.draft?.playerPosition){delete saved.draft.playerPosition;changed=true;persist();}
    const cleaned=clearClientPicks(slots);if(JSON.stringify(cleaned)!==JSON.stringify(slots)){slots=cleaned;results=[];changed=true;persist();}
   }
   if(enemy.length||clientBans.length||unassigned.length){enemy=[];clientBans=[];unassigned=[];results=[];changed=true;}
   if(manual)toast(client.message,!client.connected);
  }
 }catch(err){client={connected:false,phase:'Offline',message:err.message,...(lastClientRead?{receivedAt:lastClientRead}:{})};if(manual)toast(err.message,true);}
 finally{if(previousRecommendation!==recommendationKey(recommendationInput())){markResultStale();cancelRecommendation();results=[];offset=0;changed=true;}changed=runeAppliedKeys.observe(client)||changed;syncing=false;if(manual||changed||before!==JSON.stringify(client)){
  if(changed){markResultStale();cancelRecommendation();}
  // A background status tick must not replace an active search field while typing.
  if(dragPick)pendingDragRender=true;else if(activeAppSelect||windowLayout.docked&&changed||!document.activeElement?.matches('input,select'))render();
  if(buildView&&(renderedBuildContext!==buildSelectionContext(buildView.build)||previousMatchups!==matchupContext()))renderBuild();
 }}
 queueCompanionRecommendation();
}
function reflectRunePending(){
 reflectItemSetPending();
 if(runeApplying)for(const button of document.querySelectorAll('[data-action="my-runes"],[data-action="apply-runes"]')){button.disabled=true;button.textContent='正在替换…';}
}
function reflectItemSetPending(){
 if(itemSetPending)for(const control of document.querySelectorAll('[data-action="import-item-set"],[data-action="export-item-set"],[data-action="authorize-item-set"]')){control.disabled=true;if(control.dataset.action===itemSetPending)control.textContent=itemSetPending==='import-item-set'?'正在导入…':'正在导出…';}
}
async function useItemSet(action,el){
 if(itemSetPending)throw Error('装备集正在处理，请等待本次操作完成');
 const authorize=action==='authorize-item-set';if(authorize)action='import-item-set';
 const plan=el.dataset.itemsetView==='companion'?companionPreparation():buildView?{selection:buildView,build:buildView.build}:null;
 if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('方案已变化，请核对当前英雄后重试');
 const itemSet=createItemSet(champ(plan.selection.id),plan.build,data),key=JSON.stringify(itemSet);
 if(el.closest('[data-itemset-fingerprint]')?.dataset.itemsetFingerprint!==key)throw Error('装备方案已变化，请查看当前方案后重新点击');
 itemSetPending=action;itemSetStatuses.set(key,{text:authorize?'正在等待 Windows 连接授权…':action==='import-item-set'?'正在写入当前装备集…':'正在导出当前装备集…'});render();if(buildView)renderBuild();
 try{
  if(authorize)await api.authorizeClient();
  const result=await (action==='import-item-set'?api.importItemSet(itemSet):api.exportItemSet(itemSet));
  const text=action==='import-item-set'?`${result.replaced?'已更新':'已写入'}装备集，下次进游戏后在商店“装备集”选择“开黑搭子”。`:result.exported?'已导出 JSON，可在客户端“藏品 → 装备”中导入。':'已取消导出，当前方案保留。';
  itemSetStatuses.set(key,{text});toast(result.title?text+' '+result.title:text);
 }catch(error){const text=String(error.message||'装备集操作未完成').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');itemSetStatuses.set(key,{text:text+(action==='import-item-set'&&!text.includes('导出')?'；可点击“导出 JSON”手动导入。':''),error:true,needsAuthorization:text.includes('连接授权')});toast(text,true);
 }finally{itemSetPending='';while(itemSetStatuses.size>50)itemSetStatuses.delete(itemSetStatuses.keys().next().value);render();if(buildView)renderBuild();}
}
async function applyPreparedRunes(page,ticket){
 const result=await api.applyRunes(page,runeWriteContext(client));
 await sync(false,{fresh:true});
 const confirmed=runeAppliedKeys.confirm(ticket);
 toast(confirmed?'本次已应用：'+result.name:'符文写入已完成，但选人或连接已变化；请在客户端核对后重新应用',!confirmed);
}
async function updateData(silent=false){
 if(updating)return;updating=true;updateMessage='正在检查官方版本';if(!silent)render();
 saved.preferences.lastCheck=new Date().toISOString();persist();
 try{const next=await api.updateData();data=next.data;selectBuildSource(data,saved.preferences.buildSource);configureCatalog(data.catalog||BUNDLED_CATALOG);configureAssets(data);markResultStale();cancelRecommendation();results=[];updateMessage='已检查，当前资料 '+data.version;if(!silent)toast(next.imageCache?.failed?'资料已更新；部分新增图片暂未缓存，联网时仍可查看':'基础资料已检查，收藏和偏好已保留');}
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

document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');if(!el){if(event.target.dataset.backdrop)closeOverlay();return;}
 if(Date.now()-draggedAt<250)return;
 const action=el.dataset.action;try{
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
 if(action==='companion-summoner'){editCompanionPlan(el,el.dataset.field);return;}
 if(action==='companion-core'){editCompanionPlan(el,'core',el.dataset.id);return;}
 if(action==='recovery-settings'){if(windowLayout.docked)acceptWindowLayout(await api.companionMode(false));route='settings';render();return;}
 if(action==='dismiss-recovery'){stateRecovery=null;render();return;}
 if(action==='companion-start'||action==='companion-boots'){editCompanionPlan(el,action==='companion-start'?'start':'boots',el.dataset.id);return;}
 if(action==='companion-favorite'){const plan=companionPreparation();if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('选人已变化，请核对当前方案');const v={...plan.selection,build:plan.build,conditions:plan.selection.conditions||[],coreIndex:plan.build.selectedCoreIndex||0};await addFavorite({id:savedBuild(v)?.id||buildFavoriteId(v),...selectedBuildFields(v,{preserveUnavailable:true}),type:'build',title:champ(v.id).name+' · '+v.build.title+(v.build.selectedRune?' · '+v.build.selectedRune.name:''),champion:v.id,role:v.role,mode:v.mode,conditions:v.conditions,coreIndex:v.coreIndex});render();return;}
 if(action==='import-item-set'||action==='export-item-set'||action==='authorize-item-set'){await useItemSet(action,el);return;}
 if(action==='companion-tab'){companionTab=el.dataset.tab;closeOverlay();render();return;}
 if(action==='companion-current'){companionPreview=null;companionTab='plan';closeOverlay();render();return;}
 if(action==='companion-preview'){
  if(!champ(el.dataset.id))throw Error('英雄资料已变化');
  const result=results[Number(el.dataset.resultIndex)];
  if(!el.hasAttribute('data-result-index')||!result||resultsSignature!==recommendationKey(recommendationInput())||!result.slots.some(s=>s.champion===el.dataset.id&&s.role===el.dataset.role))throw Error('推荐条件已变化，请重新推荐');
  const plan=resultCreativePlan(result),combo=plan?creativeMemberCombo(plan,el.dataset.id,el.dataset.role):result.trio||result.duo;
  companionPreview={id:el.dataset.id,role:el.dataset.role,mode:'rift',...creativeComboContext(combo)};
  companionTab='plan';closeOverlay();render();return;
 }
 if(action==='companion-jump'){document.querySelector(`[data-companion-section="${el.dataset.section}"]`)?.scrollIntoView({block:'start'});return;}
 if(action==='companion-refresh'){const plan=companionPreparation();if(!plan||el.dataset.plan!==[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))throw Error('选人已变化，请核对当前方案');await refreshConfiguration(plan.selection.id,plan.selection.role,plan.selection.mode);return;}
 if(action==='matchup-rune'||action==='matchup-core'){chooseMatchupConfiguration(el,action==='matchup-rune'?'rune':'core');return;}
 if(action==='companion-rune'){editCompanionPlan(el,'rune',el.dataset.id);return;}
 if(action==='companion-quest-plan'){editCompanionPlan(el,'quest-plan');return;}
 if(action==='companion-later'){editCompanionPlan(el,'later',el.dataset.id);return;}
 if(action==='companion-condition'){editCompanionPlan(el,'condition',el.dataset.condition);return;}
 if(action==='companion-full'){acceptWindowLayout(await api.companionMode(false));return;}
 if(action==='companion-attach'){if(!api.companionMode)throw Error('贴边选人请在桌面版使用');const layout=await api.companionMode(true);acceptWindowLayout(layout);if(!layout.docked)toast('进入选人后自动贴边；请先连接客户端');return;}
 if(action==='client-companion'){saved.preferences.clientCompanion=saved.preferences.clientCompanion===false;await persist();render();return;}
 if(action==='recover-guide'){if(!api.recoverGuide)throw Error('找回指引请在桌面版使用');await api.recoverGuide();if(overlay.querySelector('[data-window-info]'))await showWindowInfo(true);toast('指引已展开并移回游戏所在屏幕');return;}
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
   try{const next=await calculateRecommendation(input);if(run!==recommendationRun||signature!==recommendationKey(recommendationInput()))return;if(!next.length)throw Error('没有可替换英雄，请调整英雄池；原方案已保留');for(const r of next)if(r.creative)resultCreativePlan(r);results=next;resultsSignature=signature;closeOverlay();generating=false;render();showResult(0);}
   catch(error){if(!error.cancelled)toast(error.message+'；原方案已保留，可调整英雄池后重试',true);}
   finally{if(run===recommendationRun){generating=false;render();}}
  }
 else if(action==='go-draft'){route='draft';render();}
 else if(action==='draft-scope'){scope=el.dataset.scope;invalidate();}
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
 else if(action==='pick-champion'){const id=el.dataset.id;if(picker.kind==='rolepool'){const pool=saved.preferences.rolePools[picker.role];pool.heroes=pool.heroes.includes(id)?pool.heroes.filter(x=>x!==id):[...pool.heroes,id];invalidate();renderPicker();}else if(picker.kind==='pool'){saved.preferences.pool=saved.preferences.pool.includes(id)?saved.preferences.pool.filter(x=>x!==id):[...saved.preferences.pool,id];invalidate();renderPicker();}else if(picker.kind==='excluded'){saved.excluded=saved.excluded.includes(id)?saved.excluded.filter(x=>x!==id):[...saved.excluded,id];invalidate();renderPicker();}else if(picker.kind==='hex'){if(hexHero!==id){hexOptions=[];hexOwned=[];}hexHero=id;closeOverlay();render();maybeRefreshBuild(id,profile(champ(id)).roles[0],'hex');}else{const slot=slots.find(s=>s.role===picker.role);if(slots.some(s=>s!==slot&&s.champion===id))throw Error('这个英雄已经在阵容中');slot.champion=id;slot.locked=true;delete slot.clientCellId;delete slot.manualPosition;const bound=client.session?.myTeam.find(p=>p.championId===champ(id).key);if(bound){slot.clientCellId=bound.cellId;slot.manualPosition=true;}unassigned=client.session?unassignedPublicPicks(slots,client.session,data.champions):unassigned.filter(p=>p.champion!==id);closeOverlay();invalidate();}}
 else if(action==='solo-role'){setCompanionRole(el.dataset.role);}
 else if(action==='position-auto'){setCompanionRole('');}
 else if(action==='toggle-party'){const s=slots.find(s=>s.role===el.dataset.role);s.party=!s.party;invalidate();}
 else if(action==='toggle-lock'){const s=slots.find(s=>s.role===el.dataset.role);s.locked=!s.locked;invalidate();}
 else if(action==='clear-slot'){const s=slots.find(s=>s.role===el.dataset.role);s.champion=null;s.locked=false;delete s.clientCellId;delete s.manualPosition;if(client.session)unassigned=unassignedPublicPicks(slots,client.session,data.champions);invalidate();}
 else if(action==='reset-draft'){slots=clearDraftPicks(slots);unassigned=publicDraftPicks(client.session,data.champions);recommendationError='';invalidate();toast('英雄已清空，保留你们的位置与公开选人约束');}
 else if(action==='reset-party'){const defaults=createSlots();slots=slots.map(s=>({...s,party:defaults.find(d=>d.role===s.role).party}));invalidate();toast('位置归属已恢复为中单、下路、辅助；英雄保留');}
 else if(action==='example'){scope='context';slots=createSlots();slots[0]={...slots[0],champion:'Garen',locked:true};slots[1]={...slots[1],champion:'LeeSin',locked:true};invalidate();toast('已载入示例：队友选了盖伦和李青，你们补中下辅');}
 else if(action==='recommend'||action==='reroll')await generate(action==='reroll');
 else if(action==='result-detail')showResult(Number(el.dataset.index));
 else if(action==='use-result'){if(client.connected&&client.phase==='ChampSelect'){await sync(false,{fresh:true});if(!client.connected||client.phase!=='ChampSelect'||!client.session)throw Error('无法确认本局选人，已保留阵容，请重新连接后接受方案');}if(resultsSignature!==recommendationKey(recommendationInput())||!results[Number(el.dataset.index)])throw Error('选人已变化，请重新推荐');const result=results[Number(el.dataset.index)];preservePlayerPosition();activeCreativePlan=resultCreativePlan(result);creativePlanNotice='';cancelRecommendation();if(scope==='solo')soloRole=result.targets[0]||soloRole;slots=structuredClone(result.slots).map(s=>({...s,locked:!!s.champion}));closeOverlay();persist();results=[];render();await generate();toast('已载入方案，点卡片上的“配置”查看出装符文');}
 else if(action==='open-guide'){const selection={...buildSelection(),augmentIds:buildView.mode==='hex'&&hexHero===buildView.id?hexSelected:buildView.augmentIds||[],compareIds:buildView.mode==='hex'&&hexHero===buildView.id?hexOptions:buildView.compareIds||[],ownedAugmentIds:buildView.mode==='hex'&&hexHero===buildView.id?hexOwned:buildView.ownedAugmentIds||[]};await matchupFocusChain;await guideSyncChain;await api.openGuide(selection);guideSelection=selection;if(buildView)renderBuild();toast('指引已打开；游戏中 Ctrl + Shift + H 切换穿透与交互');}
  else if(action==='guide-current'){const prepared=myPreparation();await matchupFocusChain;await guideSyncChain;if(prepared){await api.openGuide(prepared.selection);guideSelection=prepared.selection;}else await api.openGuide();}
 else if(action==='my-runes'){
  const selected=myPreparation();if(!selected?.build.runePage||selected.own.id!==el.dataset.id)throw Error('选人已变化，请核对当前英雄');
  if(runeApplying)throw Error('正在替换符文，请等待本次操作完成');runeApplying=true;const ticket=runeAppliedKeys.begin(runeApplicationKey(selected.own.id,selected.build.role,selected.build.runePage));reflectRunePending();
  try{await sync(false,{fresh:true});const current=myPreparation();if(!runeAppliedKeys.isCurrent(ticket)||!client.connected||current?.own.id!==selected.own.id)throw Error('选人会话已变化，请核对当前英雄后重新应用');if(runeApplicationKey(current.own.id,current.build.role,current.build.runePage)!==runeApplicationKey(selected.own.id,selected.build.role,selected.build.runePage))throw Error('推荐方案已变化，请核对后重新应用');const page=structuredClone(current.build.runePage);await applyPreparedRunes(page,ticket);}catch(error){runeAppliedKeys.clear();throw error;}finally{runeApplying=false;render();if(buildView)renderBuild();}
 }
 else if(action==='my-build'){const own=currentPlayerSelection(client.session,data.champions,slots);if(own){if(client.mode?.id==='aram')throw Error('普通大乱斗暂未提供专用配置，请手动查询参考');if(!['rift','hex'].includes(client.mode?.id))throw Error('客户端模式尚未确认，请在配置库手动选择模式');const prepared=myPreparation();showBuild(own.id,prepared.selection.role,client.mode.id,prepared.selection);}else throw Error('当前没有你已选择的英雄');}
 else if(action==='build'){let selection=el.dataset.combo?{comboId:el.dataset.combo}:{};if(el.hasAttribute('data-result-index')){const result=results[Number(el.dataset.resultIndex)];if(!result||resultsSignature!==recommendationKey(recommendationInput()))throw Error('推荐条件已变化，请重新推荐');const plan=resultCreativePlan(result);if(plan)selection=creativeComboContext(creativeMemberCombo(plan,el.dataset.id,el.dataset.role));}showBuild(el.dataset.id,el.dataset.role,el.dataset.mode||'rift',selection);}
 else if(action==='build-partner'&&el.dataset.id){const plan=buildView?.build?.combo?.creativePlan;showBuild(el.dataset.id,el.dataset.role,'rift',plan?.id===el.dataset.combo?creativeComboContext(creativeMemberCombo(plan,el.dataset.id,el.dataset.role)):{comboId:el.dataset.combo});}
 else if(action==='build-partner'){const d=DUOS.find(d=>d.id===el.dataset.combo);if(d){const partner=comboMembers(d).find(m=>m.champion!==buildView.id);if(partner)showBuild(partner.champion,partner.role,'rift',{comboId:d.id});}}
 else if(action==='build-loadout'){buildView.loadoutId=el.dataset.id;buildView.coreIndex=0;delete buildView.runeId;delete buildView.skillId;delete buildView.coreId;delete buildView.laterIds;renderBuild();}
 else if(action==='build-quest-plan'){const next=changeCompanionPlan(data,buildSelection(),'quest-plan');buildView.bottomQuestPlan=next.bottomQuestPlan;buildView.laterIds=next.laterIds;renderBuild();}
 else if(action==='build-start'||action==='build-boots'){const next=changeCompanionPlan(data,buildSelection(),action==='build-start'?'start':'boots',el.dataset.id);for(const key of ['startId','bootsId']){delete buildView[key];if(next[key])buildView[key]=next[key];}renderBuild();}
 else if(action==='build-later'){const next=changeCompanionPlan(data,buildSelection(),'later',el.dataset.id);buildView.laterIds=next.laterIds;renderBuild();}
 else if(action==='build-rune'){buildView.runeId=el.dataset.id;renderBuild();}
 else if(action==='build-jump')overlay.querySelector(`[data-build-section="${el.dataset.section}"]`)?.scrollIntoView({block:'start'});
 else if(action==='build-mode')showBuild(buildView.id,buildView.role,el.dataset.mode,{conditions:[...buildView.conditions],coreIndex:buildView.coreIndex});
 else if(action==='build-summoner'){editBuildSummoners(el,el.dataset.field);}
 else if(action==='build-skill'){buildView.skillId=el.dataset.id||undefined;renderBuild();}
 else if(action==='build-core'){buildView.coreIndex=Number(el.dataset.index);delete buildView.coreId;delete buildView.laterIds;renderBuild();}
 else if(action==='refresh-build')await refreshConfiguration(buildView.id,buildView.role,buildView.mode);
 else if(action==='build-condition'){const c=el.dataset.condition;buildView.conditions=buildView.conditions.includes(c)?buildView.conditions.filter(x=>x!==c):[...buildView.conditions,c];renderBuild();}
 else if(action==='apply-runes'){
  if(runeApplying)throw Error('正在替换符文，请等待本次操作完成');
  const page=structuredClone(buildView.build.runePage),viewedHero=buildView.id,viewedRole=buildView.role,knownOwn=currentPlayerSelection(client.session,data.champions,slots)?.id,key=runeApplicationKey(viewedHero,viewedRole,page);
  let ticket=client.connected?runeAppliedKeys.begin(key):null;runeApplying=true;reflectRunePending();
  try{await persist();await guideSyncChain;await sync(!client.connected,{fresh:true});if(!client.connected)throw Error(client.message);if(ticket&&!runeAppliedKeys.isCurrent(ticket))throw Error('选人会话已变化，请核对当前英雄后重新应用');const own=currentPlayerSelection(client.session,data.champions,slots)?.id;if(own&&own!==viewedHero&&own!==knownOwn){renderBuild();toast('已确认你选的是'+champ(own).name+'，当前浏览'+champ(viewedHero).name+'；请核对页面中的符文对象后再点击',true);return;}ticket||=runeAppliedKeys.begin(key);await applyPreparedRunes(page,ticket);}catch(error){runeAppliedKeys.clear();throw error;}finally{runeApplying=false;render();if(buildView)renderBuild();}
 }
 else if(action==='copy-build'){await api.copy(buildAsText(buildView.build,champ(buildView.id),data));toast('配置已复制');}
 else if(action==='favorite-build'){await addFavorite({id:savedBuild(buildView)?.id||buildFavoriteId(buildView),...selectedBuildFields(buildView,{preserveUnavailable:true}),type:'build',title:`${champ(buildView.id).name} · ${buildView.build.title}${buildView.build.selectedRune?' · '+buildView.build.selectedRune.name:''}${buildView.coreIndex?' · 方案 '+(buildView.coreIndex+1):''}`,champion:buildView.id,role:buildView.role,mode:buildView.mode,conditions:buildView.conditions,coreIndex:buildView.coreIndex,...(buildView.mode==='hex'?{augmentIds:[...(buildView.augmentIds||[])],compareIds:[...(buildView.compareIds||[])],ownedAugmentIds:[...(buildView.ownedAugmentIds||[])]}:{})});renderBuild();}
  else if(action==='favorite-result'){const r=results[Number(el.dataset.index)];if(!r)throw Error('推荐已变化，请重新选择');const creativePlan=resultCreativePlan(r);await addFavorite({...(creativePlan?{creativePlan}:{}),id:findSavedTeam(saved.favorites,r,style)?.id||teamFavoriteId(r,style),type:'team',title:r.title,slots:structuredClone(r.slots),configurations:captureTeamConfigurations(r,data,preparations),style,scope:r.scope,...(r.scope==='solo'?{soloRole:r.soloRole||r.targets[0]}:{})});if(detailResult===r){const scroll=overlay.querySelector(".drawer-content")?.scrollTop||0;showResult(Number(el.dataset.index));overlay.querySelector(".drawer-content").scrollTop=scroll;}}
 else if(action==='copy-result'){const r=results[Number(el.dataset.index)];resultCreativePlan(r);const cname=id=>champ(id)?.name||id;const duoText=r.duo?duoPlayText(duoPlay(r.duo,data)):'';await api.copy(`${r.title}\n${r.slots.filter(s=>s.champion).map(s=>`${roleName(s.role)}：${cname(s.champion)}`).join('\n')}\n${r.reason}\n${pairStatisticsText(r.pairEvidence,data)}\n${r.strategy?`打法：${r.strategy.label}；代价：${r.strategy.tradeoff}\n`:''}${r.strategy?.threats?.length?`对方阵容提示：${r.strategy.threats.join('；')}\n`:''}${(r.trio||r.duo)?.plan||''}\n${duoText}\n${!r.trio&&!r.duo&&!r.creative?cooperationText(r.adaptive):''}\n${r.trio?'分工：'+r.trio.members.map(m=>cname(m.champion)+' '+m.job).join('；')+'\n行动窗口：'+r.trio.window+'\n前期：'+r.trio.early+'\n经济：'+r.trio.economy:r.creative?'分工：'+r.creative.ordered.map(o=>cname(o.champion)+' '+o.job).join('；')+'\n顺序：'+r.creative.steps.join(' → ')+'\n强势期：'+r.creative.window+'\n'+r.creative.feasibility+'（创意实验组合，未经对局验证）':''}\n注意：${(r.trio||r.duo)?.risk||r.creative?.caution||r.analysis.warnings.join('；')}${r.creativePlan?`\n${r.creativePlan.archetype==='shared'?'共同分工说明':r.creativePlan.archetype==='cooperation'?'机制搭配说明':'创意说明'} · 规则 ${r.creativePlan.patch} · ${r.creativePlan.rulesVersion} · 保存资料 ${r.creativePlan.dataVersion} · 未经对局验证`:''}`);toast('组合说明已复制');}
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
   slots=restored.slots;unassigned=restored.unassigned;activeCreativePlan=restored.creativePlan;
   creativePlanNotice=restored.conflicts.some(conflict=>conflict.kind==='plan')?'收藏配合与本局成员不一致，原说明仍可在收藏中查看。':'';
   for(const selection of restored.configurations)preparations.remember(selection);
   if(f.scope==='solo')soloRole=restored.markedLocalRole||f.soloRole;else if(f.soloRole)soloRole=f.soloRole;
   style=f.style||'fun';scope=f.scope||'context';route='draft';invalidate();
   const conflicts=restored.conflicts.filter(conflict=>conflict.role).map(conflict=>roleName(conflict.role)+'的'+(champ(conflict.champion)?.name||conflict.champion)+(conflict.reason==='unavailable'?'本局不可选':conflict.reason==='locked'?'与锁定英雄冲突':'与当前安排冲突'));
   toast('已载入 '+restored.loadedMembers+' 位开黑成员 · '+restored.configurations.length+' 套配置'+(conflicts.length?'；'+conflicts.join('、')+'，已保留当前安排；替换手动锁定英雄前请先解锁，公开禁选与敌方占用需另选英雄':'')+(restored.skippedConfigurations?'；'+restored.skippedConfigurations+' 套配置因成员或配合不匹配未载入':''),!!restored.conflicts.length);
  }else if(f.type==='build'){showBuild(f.champion,f.role,f.mode,{conditions:f.conditions||[],coreIndex:f.coreIndex||0,loadoutId:f.loadoutId||'default',runeId:f.runeId||undefined,skillId:f.skillId||undefined,coreId:f.coreId||undefined,startId:f.startId||undefined,bootsId:f.bootsId||undefined,summonerIds:f.summonerIds?[...f.summonerIds]:undefined,comboId:f.comboId,...(f.creativePlan?{creativePlan:f.creativePlan}:{}),...(f.bottomQuestPlan?{bottomQuestPlan:true}:{}),...(f.mode==='rift'&&f.laterIds!==undefined?{laterIds:[...f.laterIds]}:{}),...(f.mode==='hex'?{augmentIds:(f.augmentIds||[]).filter(id=>data.augments.some(a=>a.id===id)),compareIds:(f.compareIds||[]).filter(id=>data.augments.some(a=>a.id===id)),ownedAugmentIds:(f.ownedAugmentIds||[]).filter(id=>data.augments.some(a=>a.id===id))}:{})});}else{hexHero=champ(f.champion)?f.champion:null;hexSelected=f.augments.filter(id=>data.augments.some(a=>a.id===id));hexOptions=(f.compareIds||[]).filter(id=>data.augments.some(a=>a.id===id)).slice(0,3);hexOwned=(f.ownedAugmentIds||[]).filter(id=>data.augments.some(a=>a.id===id)).slice(0,6);hexSelectedOnly=true;hexForHero=false;hexQuery='';hexRarity='all';route='hex';render();}}
 else if(action==='auto-sync'){saved.preferences.autoSync=saved.preferences.autoSync===false;persist();render();}
 else if(action==='auto-check'){saved.preferences.autoCheck=!saved.preferences.autoCheck;persist();render();}
 else if(action==='update')await updateData();
 else if(action==='refresh-pairs')await refreshPairData();
 else if(action==='choose-dir'){const dir=await api.chooseDirectory();if(dir){saved.preferences.installPath=dir;await persist();render();await sync(true);}}
 else if(action==='export'){if(favoriteSaving)throw Error('收藏正在保存，请稍后再备份');await saveChain;if(await api.exportState())toast('收藏与偏好已导出');}
 else if(action==='import'){if(favoriteSaving)throw Error('收藏正在保存，请稍后再导入');await saveChain;const state=await api.importState();if(state){saved=state;preparations.restore(saved.preparations);selectBuildSource(data,saved.preferences.buildSource);style=saved.preferences.style;invalidate();toast('已合并收藏与配置并恢复偏好；推荐已按新条件清空');}}
 else if(action==='link')await api.openLink(el.dataset.url);
 }catch(err){toast(err.message||'操作没有完成，请重试',true);}
});
document.addEventListener('submit',event=>{if(event.target.id==='catalog-form'){event.preventDefault();overlay.querySelector('[data-action=catalog-save]')?.click();}});
document.addEventListener('input',event=>{const el=event.target;if(el.id==='combo-search'&&comboView){comboView.query=el.value;document.getElementById('combo-list').innerHTML=combinationRows(data,comboView,slots);}if(el.id==='picker-search'){picker.query=el.value;document.getElementById('picker-grid').innerHTML=pickerTiles();}if(el.id==='library-search'){libraryQuery=el.value;document.getElementById('library-grid').innerHTML=libraryTiles();}if(el.id==='hex-search'){hexQuery=el.value;document.getElementById('augment-grid').innerHTML=augmentTiles();}});
document.addEventListener('change',event=>{const el=event.target;if(el.hasAttribute('data-matchup-target')){try{changeMatchupTarget(el);}catch(error){toast(error.message,true);render();if(buildView)renderBuild();}return;}if(el.dataset.buildSourceField){try{const source=requireBuildSource({...normalizeBuildSource(data.buildSource),[el.dataset.buildSourceField]:el.value});saved.preferences.buildSource=source;selectBuildSource(data,source);invalidate();if(buildView)renderBuild();}catch(error){toast(error.message,true);}return;}if(el.dataset.presentationModule){api.presentation({field:'toggleModule',value:el.dataset.presentationModule}).then(value=>{saved.preferences.presentation=value;render();updatePresentationDialog(overlay,value);}).catch(error=>toast(error.message,true));return;}if(el.id==='solo-role'){try{setCompanionRole(el.value);}catch(error){toast(error.message,true);render();}return;}if(el.dataset.buildSummoner){try{editBuildSummoners(el,'summoner-'+el.dataset.buildSummoner,el.value);}catch(error){toast(error.message,true);renderBuild();}return;}if(el.dataset.companionField){try{editCompanionPlan(el,el.dataset.companionField,el.value);}catch(error){toast(error.message,true);render();}return;}if(el.id==='companion-scope'){scope=el.value;invalidate();}if(el.id==='companion-style'){style=el.value;invalidate();}if(el.id==='build-skill'){buildView.skillId=el.value||undefined;renderBuild();}if(el.id==='guide-after-game'){saved.preferences.guideAfterGame=el.value;persist();}if(['play-difficulty','play-tempo','play-unusual','play-meleeBottom'].includes(el.id)){saved.preferences.play[el.id.slice(5)]=el.type==='checkbox'?el.checked:el.value;invalidate();}if(el.dataset.rolePoolMode){saved.preferences.rolePools[el.dataset.rolePoolMode].mode=el.value;invalidate();}if(el.matches('[data-catalog-member],#catalog-form select[name^="role-"]')){const i=el.dataset.catalogMember??el.name.split('-')[1],form=el.closest('form'),id=form.querySelector('[name="hero-'+i+'"]').value,role=form.querySelector('[name="role-'+i+'"]').value;form.querySelector('[name="loadout-'+i+'"]').innerHTML=editorLoadouts(data,id,role);}if(comboView&&['combo-style','combo-fit','combo-source','combo-configured','combo-tempo'].includes(event.target.id)){if(event.target.id==='combo-tempo')comboView.tempo=event.target.value;else if(event.target.id==='combo-style')comboView.style=event.target.value;else if(event.target.id==='combo-source')comboView.source=event.target.value;else if(event.target.id==='combo-configured')comboView.configured=event.target.checked;else comboView.fit=event.target.checked;document.getElementById('combo-list').innerHTML=combinationRows(data,comboView,slots);}if(event.target.id==='pool-mode'){saved.preferences.poolMode=event.target.value;invalidate();}if(event.target.id==='hex-category'){hexCategory=event.target.value;document.getElementById('augment-grid').innerHTML=augmentTiles();}if(event.target.id==='build-role'){if(scope==='solo'&&currentPlayerSelection(client.session,data.champions,slots)?.id===buildView.id){soloRole=event.target.value;persist();}showBuild(buildView.id,event.target.value,buildView.mode,{conditions:[...buildView.conditions],coreIndex:buildView.coreIndex});}if(event.target.id==='hex-rarity'){hexRarity=event.target.value;document.getElementById('augment-grid').innerHTML=augmentTiles();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(activeOverlaySelect?.isConnected){deferOverlaySelect();return;}if(!activeAppSelect)closeOverlay();}if(event.key==='Tab'&&overlay.firstElementChild){const focusable=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(!overlay.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
document.addEventListener('error',event=>{const img=event.target;if(img.tagName!=='IMG')return;if(img.dataset.fallback){const url=img.dataset.fallback;delete img.dataset.fallback;img.src=url;}else{img.style.visibility='hidden';}},true);
window.addEventListener('unhandledrejection',event=>{toast(event.reason?.message||'操作失败，请重试',true);event.preventDefault();});
try{boot=await api.bootstrap();data=boot.data;saved=boot.state;stateRecovery=saved.recovery||null;data.catalog=configureCatalog(data.catalog||BUNDLED_CATALOG);data.catalogInfo||={...catalogIssues(data.catalog,data),version:data.catalog.version};configureAssets(data);
 client=boot.client||client;runeAppliedKeys.observe(client);windowLayout=boot.windowLayout||{docked:false};api.onWindowLayout?.(acceptWindowLayout);
  preparations.restore(saved.preparations);guideSelection=saved.guide?.selection||null;if(guideSelection){if(!preparations.recall(guideSelection))preparations.remember(guideSelection);guideSyncBase=guideSelection;lastGuideSyncKey=buildChoiceKey(guideSelection);}
 api.onPresentation?.(value=>{saved.preferences.presentation=value;applyPresentation(value);if(overlay.querySelector('.presentation-settings'))updatePresentationDialog(overlay,value);});
 api.onGuideSelection?.((selection,meta={})=>{if(meta.revision&&meta.revision<guideRevision)return;guideRevision=meta.revision||guideRevision;guideSelection=selection;if(!guideSyncPending)acceptGuideSelection(selection);});
 api.onOpenBuild?.(selection=>{showBuild(selection.id,selection.role,selection.mode,selection);});
 api.onProgress?.(message=>{updateMessage=message;const status=document.getElementById('update-message');if(status)status.textContent=message;});
 saved.preferences={style:'fun',autoCheck:true,autoLive:true,pool:[],poolMode:'off',...saved.preferences};saved.preferences.play={difficulty:'any',tempo:'any',unusual:true,meleeBottom:true,...saved.preferences.play};saved.preferences.rolePools=Object.fromEntries(ROLES.map(r=>[r.id,{heroes:[],mode:'off',...saved.preferences.rolePools?.[r.id]}]));saved.preferences.buildSource=normalizeBuildSource(saved.preferences.buildSource);selectBuildSource(data,saved.preferences.buildSource);saved.favorites=saved.favorites||[];saved.excluded=saved.excluded||[];
 if(saved.draft?.slots){try{validateSlots(saved.draft.slots,data.champions);slots=saved.draft.slots;}catch{}}
 activeCreativePlan=saved.draft?.creativePlan?validateCreativePlan(saved.draft.creativePlan,slots,{allowUnknown:true}):null;
 scope=DRAFT_SCOPES[saved.draft?.scope]?saved.draft.scope:'solo';soloRole=saved.draft?.soloRole||'';
 style=saved.draft?.style||saved.preferences.style||'fun';if(!STYLES[style])style='fun';
 if(saved.preferences.autoSync===false)client.message='自动同步已关闭，可手动连接客户端';
 render();api.onClient?.(value=>{
  if(value?.connecting&&syncing){client={...client,...value};render();return;}
  if(saved.preferences.autoSync!==false&&!syncing)sync(false);
 });await api.ready?.();if(saved.preferences.autoSync!==false)sync(false);
 
 if(boot.desktop&&saved.preferences.autoCheck&&Date.now()-Date.parse(saved.preferences.lastCheck||data.fetchedAt)>86400000)setTimeout(()=>updateData(true),1800);
}catch(err){app.innerHTML=`<div class="boot"><div class="brand-mark">K</div><h2>暂时无法打开助手</h2><p>${e(err.message)}</p><p>请保留整个程序文件夹后重新打开。</p></div>`;}


document.addEventListener("toggle",event=>{if(event.target.matches?.(".draft-preferences"))draftAdvanced=event.target.open;if(event.target.matches?.('[data-pair-refresh]'))pairRefreshOpen=event.target.open;},true);
