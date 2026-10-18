const {app,BrowserWindow,ipcMain,Menu,Tray,nativeImage,globalShortcut,clipboard,shell,dialog,session,screen}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const {isDeepStrictEqual}=require('node:util');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..');
function diagnostic(message){if(process.env.RIFT_BUDDY_DIAGNOSTICS)fs.appendFile(process.env.RIFT_BUDDY_DIAGNOSTICS,`${new Date().toISOString()} ${message}\n`).catch(()=>{});}
let win,tray,state,data,storeRoot,dataService,storage,lcu,helper,guide,guideCore,companion,roomService,windowObserver,updating=false,quitting=false,applyingRunes=false,cleanupDone=false,cleaningUp=false,hotkeyAvailable=false,guideHotkeyAvailable=false;
let latestClient={connected:false,phase:'Offline',message:'正在检查客户端…'},latestLive=null,statusTask=null,liveTask=null,lastStatus=0,statusTimer,liveTimer,dataFeedTimer,dataFeedStartup,rendererReady=false,pendingBuild=null,pendingMainPage=null,elevatedReadAttempted=false;
let observedWindows=null,observedAt=0;
let saveTask=Promise.resolve();
let stateRevision=0,dataRevision=0;
const {createPreparationLedger,preservePreparationResult}=require('./preparation-ledger.cjs');
const preparationLedger=createPreparationLedger();
const sharedDataFields=new Map();
function appWindows(){return [win,companion?.getWindow()].filter(w=>w&&!w.isDestroyed());}
function publishWindows(channel,value,exclude){for(const window of appWindows())if(window.webContents!==exclude)window.webContents.send(channel,value);}
function publishPreparation(event){if(event)for(const window of appWindows())try{window.webContents.send('preparation-update',event);}catch{diagnostic('preparation result notification unavailable');}return event;}
function observePreparation(){publishPreparation(preparationLedger.observe(latestClient));}
function beginPreparation(kind,payload){observePreparation();const operation=preparationLedger.begin(kind,payload);publishPreparation(operation.event);return operation.token;}
function finishPreparation(token,payload){return publishPreparation(preparationLedger.finish(token,payload));}
function publishData(keys,replace=false){
 if(replace)sharedDataFields.clear();
 const changes={};for(const key of keys)if(replace||sharedDataFields.get(key)!==data[key]){changes[key]=data[key];sharedDataFields.set(key,data[key]);}
 if(Object.keys(changes).length)publishWindows('data-update',{changes,replace,revision:++dataRevision});
}
let importingItemSet=false;
let mainExplicitInGame=false,mainDismissed=false;
const mainRequests=new Map(),inGame=()=>latestClient.connected&&['GameStart','InProgress','Reconnect'].includes(latestClient.phase);
const mainRelease=require('./main-window-release.cjs')({getWindow:()=>win,canRelease:()=>inGame()&&!mainExplicitInGame&&!!tray&&!quitting,isBusy:window=>!!mainRequests.get(window.webContents.id)||applyingRunes||importingItemSet||updating,getSaveTask:()=>saveTask,release:window=>{rendererReady=false;diagnostic('released hidden main renderer for game');window.destroy();},diagnostic});
let synchronizeSavedState=()=>{};
function mergeSavedFields(current,previous,next,message){
 const merged={...current};for(const field of new Set([...Object.keys(previous),...Object.keys(next)])){if(isDeepStrictEqual(next[field],previous[field]))continue;if(!isDeepStrictEqual(current[field],previous[field])&&!isDeepStrictEqual(current[field],next[field]))throw Error(message);if(next[field]===undefined)delete merged[field];else merged[field]=next[field];}return merged;
}
function saveCurrentState(update,exclude){
 saveTask=saveTask.catch(()=>{}).then(async()=>{const snapshot=structuredClone(update?update(structuredClone(state)):state);await storage.saveState(storeRoot,snapshot);state=snapshot;synchronizeSavedState();publishWindows('state-update',{state,revision:++stateRevision},exclude);return state;});return saveTask;
}
app.setName('开黑搭子');
if(process.platform==='win32')app.setAppUserModelId('local.rift-buddy');
if(process.env.RIFT_BUDDY_USER_DATA)app.setPath('userData',process.env.RIFT_BUDDY_USER_DATA);
const helperFlag=process.argv.find(arg=>arg.startsWith('--lcu-helper='));
if(helperFlag){
 const helperData=process.argv.find(arg=>arg.startsWith('--buddy-data='));if(helperData)app.setPath('userData',helperData.slice('--buddy-data='.length));
 const helperStatus=stage=>fs.writeFile(path.join(app.getPath('userData'),'client-helper-status.json'),JSON.stringify({at:new Date().toISOString(),stage})).catch(()=>{});
 helperStatus('starting');
 app.disableHardwareAcceleration();
 app.whenReady().then(()=>import('../services/client-helper.mjs')).then(m=>m.startHelper(helperFlag.slice('--lcu-helper='.length),{userData:app.getPath('userData'),bundleRoot:root,quit:()=>app.quit()})).then(()=>helperStatus('ready')).catch(async error=>{await helperStatus(error.message);app.quit();});
 return;
}
const quitRequested=process.argv.includes('--quit');
const lock=app.requestSingleInstanceLock();if(!lock||quitRequested)app.quit();
if(quitRequested)return;
const mainPeek=require('./window-peek.cjs')({root,getWindow:()=>win,getArea:()=>screen.getDisplayMatching(win?.getBounds()||screen.getPrimaryDisplay().bounds).workArea,title:'完整助手',onRestore:()=>showMainWindow()});
function showMainWindow(){mainDismissed=false;mainExplicitInGame=inGame();mainRelease.cancel();mainPeek.unfold();if(!win){if(data)createWindow();}else{if(win.isMinimized())win.restore();win.show();win.focus();}diagnostic(`show-main-window ${!!win?.isVisible()}`);}
app.on('second-instance',(_event,argv)=>{if(argv.includes('--quit')){quitting=true;app.quit();}else if(argv.includes('--show-guide'))guide?.show();else showMainWindow();});
function createWindow({automatic=false}={}){
 rendererReady=false;
 const placement=require('../src/core/window-placement.mjs'),saved=state?.preferences?.mainBounds,area=screen.getDisplayMatching(saved||screen.getPrimaryDisplay().bounds).workArea,bounds=placement.fitWindow(saved,area,{width:1460,height:980,minWidth:Math.min(1050,area.width),minHeight:Math.min(720,area.height),maxWidth:area.width,maxHeight:area.height});
 win=new BrowserWindow({...bounds,minWidth:Math.min(1050,area.width),minHeight:Math.min(720,area.height),backgroundColor:'#10151e',title:'开黑搭子',
  icon:path.join(root,'assets/icon.png'),show:false,autoHideMenuBar:true,
  webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:true}});
 const window=win,windowId=window.webContents.id;
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(path.join(root,'src/index.html')).href)event.preventDefault();});
 window.loadFile(path.join(root,'src/index.html'));
 window.once('ready-to-show',()=>{if(inGame()&&!mainExplicitInGame){window.hide();mainRelease.request(window);}else if(automatic||latestClient.phase==='ChampSelect'&&state.preferences.clientCompanion!==false)window.showInactive();else window.show();companion?.sync();diagnostic(`ready-to-show visible=${window.isVisible()} bounds=${JSON.stringify(window.getBounds())}`);});
 window.webContents.on('did-fail-load',(_e,code,desc)=>diagnostic(`load failed ${code} ${desc}`));
 window.webContents.on('render-process-gone',(_e,detail)=>diagnostic(`renderer gone ${detail.reason}`));
 window.webContents.on('did-finish-load',async()=>{
  diagnostic('did-finish-load');
  if(process.env.RIFT_BUDDY_SCREENSHOT){setTimeout(async()=>{try{const image=await window.webContents.capturePage();await fs.writeFile(process.env.RIFT_BUDDY_SCREENSHOT,image.toPNG());diagnostic('screenshot saved');}catch(e){diagnostic(e.message);}},2200);}
 });
 companion?.bindWindow();
 window.on('close',()=>{if(!quitting)mainDismissed=true;});
 window.on('closed',()=>{mainRequests.delete(windowId);if(win===window){mainPeek.destroy();win=null;rendererReady=false;}});
}
const guard=(name,handler,withContext=false)=>ipcMain.handle(name,async(event,...args)=>{
 const sender=appWindows().find(window=>event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame);
 if(!sender)throw new Error('不允许此操作');
 const context={surface:sender===win?'main':'companion',window:sender,sender:event.sender};
 const id=sender.webContents.id;if(context.surface==='main'){mainRequests.set(id,(mainRequests.get(id)||0)+1);mainRelease.activity(sender);}
 try{return await (withContext?handler(...args,context):handler(...args));}
 finally{if(context.surface==='main'){const remaining=(mainRequests.get(id)||1)-1;if(remaining)mainRequests.set(id,remaining);else mainRequests.delete(id);mainRelease.activity(sender);}}
});
async function boot(){
 diagnostic('boot');
 [dataService,storage,lcu]=await Promise.all([import('../services/data.mjs'),import('../services/storage.mjs'),import('../services/lcu.mjs')]);
 guideCore=await import('../src/core/guide.mjs');
 const itemSetCore=await import('../src/core/item-sets.mjs'),itemSetService=await import('../services/item-sets.mjs');
 const {changeCompanionPlan}=await import('../src/core/companion-plan.mjs');
 const {pregamePhase,validatePregameIntent,pregameIntentChoice,restoredRoleClaim,partyWithPregameIntents}=await import('../src/core/pregame-intent.mjs');
 const {createSlots}=await import('../src/core/recommend.mjs');
 const {initialPartyCount,selectionPartyCount,validPartyCount,reconcilePartyRange,editPartyRange}=await import('../src/core/party-range.mjs');
 storeRoot=app.getPath('userData');state=await storage.readState(storeRoot);
 // A saved legacy ball must not trap the upgraded app in an icon-only view.
 if(state.guide?.ball){state.guide={...state.guide,ball:false,collapsed:false};if(state.recovery?.backedUp!==false)await saveCurrentState();}
 const {createHelperManager}=await import('../services/client-helper.mjs');
 const helperRoot=path.join(process.resourcesPath,'connection');
  helper=createHelperManager({userData:storeRoot,bundleRoot:root,executable:process.execPath,isPackaged:app.isPackaged,
  ...(app.isPackaged?{helperExecutable:path.join(helperRoot,'node.exe'),helperEntry:path.join(helperRoot,'electron/client-helper-entry.mjs'),helperBundleRoot:helperRoot,launcherExecutable:path.join(helperRoot,'connection-launcher.exe')}:{}) ,
   onProgress:message=>publishWindows('client-update',{connected:false,connecting:true,phase:'Offline',message})});
  const {createMatchHistoryService}=await import('../services/match-history.mjs');
  const matchHistory=createMatchHistoryService({installPath:()=>state.preferences?.installPath});
  guard('match-history',async(operation,payload)=>{
   if(!['page','search','roster','detail','timeline','profile','challenges','replay','replay-status','clear'].includes(operation))throw Error('不支持此战绩操作');
   return helper.active()?helper.request('matchHistory',{operation,payload}):matchHistory.execute(operation,payload);
  });
 data=await dataService.loadSnapshot(path.join(storeRoot,'data'),path.join(root,'data'));
 if(state.guide&&!data.champions.some(c=>c.id===state.guide.selection?.id)){state.guide=null;if(state.recovery?.backedUp!==false)await saveCurrentState();}
 const catalogCore=await import('../src/core/catalog.mjs');
 const {createCatalogStore}=await import('../services/catalog-store.mjs');
 const catalogStore=await createCatalogStore({root:storeRoot,getData:()=>data});
 const useCatalog=result=>{data.catalog=catalogCore.configureCatalog(result.catalog);data.catalogInfo=result.info;publishData(['catalog','catalogInfo']);guide?.publish();return result;};
 useCatalog(catalogStore.summary());
 const {loadBuildSources,loadHexBuilds,createBuildCache}=await import('../services/build-cache.mjs');
 const {loadOpponentBuildSources,createOpponentBuildCache}=await import('../services/opponent-build-cache.mjs');
 data.opponentBuildSources=await loadOpponentBuildSources(path.join(storeRoot,'data'),data);
 const opponentCache=createOpponentBuildCache({root:path.join(storeRoot,'data'),getData:()=>data});
 const refreshOpponentBuild=async(...args)=>{const result=await opponentCache(...args);publishData(['opponentBuildSources']);return result;};
 const {selectBuildSource,buildSourcePendingKey,normalizeBuildSource}=await import('../src/core/build-source.mjs');
 data.buildSources=await loadBuildSources([path.join(root,'data'),path.join(storeRoot,'data')],data);
 selectBuildSource(data,state.preferences.buildSource);synchronizeSavedState=()=>{if(JSON.stringify(data.buildSource)!==JSON.stringify(normalizeBuildSource(state.preferences.buildSource))){selectBuildSource(data,state.preferences.buildSource);publishData(['buildSource','builds']);}if(state.preferences.autoLive===false)latestLive=null;};
 const {loadPairStatisticsCache,createPairStatisticsCache}=await import('../services/pair-statistics-cache.mjs');
 const pairFiles=[path.join(root,'data/pair-statistics.json'),path.join(storeRoot,'data/pair-statistics-cache.json')];
 data.pairStatistics=await loadPairStatisticsCache(pairFiles,data);
 const pairCache=createPairStatisticsCache({root:path.join(storeRoot,'data'),getData:()=>data});
 const refreshPairs=async(...args)=>{const result=await pairCache(...args);publishData(['pairStatistics']);return result;};
 const {loadRankings,createRankingsCache}=await import('../services/rankings-cache.mjs');
 data.rankings=await loadRankings([path.join(root,'data'),path.join(storeRoot,'data')],data);
 const rankingsCache=createRankingsCache({root:path.join(storeRoot,'data'),getData:()=>data});
 const refreshRankings=async(...args)=>{const result=await rankingsCache(...args);publishData(['rankings']);return result;};
 const {loadPatchNotes}=await import('../services/patch-notes.mjs');
 data.patchNotes=await loadPatchNotes(path.join(root,'data'),data);
 const {loadAbilities}=await import('../services/abilities.mjs');
 data.abilityReference=await loadAbilities(path.join(root,'data'),data);
 // A mismatched spell book must never be used silently (same gate as update-data).
 try{
  const spellsFile=JSON.parse(await fs.readFile(path.join(root,'data/spells.json'),'utf8'));
  data.spellbook=spellsFile.version===data.version?(spellsFile.champions||{}):{};
  if(spellsFile.version!==data.version)diagnostic(`spellbook ${spellsFile.version} != game ${data.version} at boot; estimates use heuristics`);
 }catch{data.spellbook={};}
 data.hexBuilds=await loadHexBuilds([path.join(root,'data'),path.join(storeRoot,'data')],data);
 const {createDataFeedCache}=await import('../services/data-feed-cache.mjs');
 const {createDataFeedActivationGate}=await import('../services/data-feed.mjs');
 const observeFeedPhase=createDataFeedActivationGate();let feedIdle=false;
 const dataFeed=await createDataFeedCache({root:path.join(storeRoot,'data'),getData:()=>data,restoreAtStartup:true,
  canActivate:()=>feedIdle&&!updating&&!applyingRunes&&!importingItemSet,
  onChange:info=>{data.dataFeed=info;publishData(['dataFeed','rankings','buildSources','builds','hexBuilds']);}});
 data.dataFeed=dataFeed.summary();
 const imageCache=await import('../services/image-cache.mjs');
 data.imageOverrides=await imageCache.loadImageOverrides(path.join(storeRoot,'data/images'),data);
 for(const [key,value] of Object.entries(data))sharedDataFields.set(key,value);
 const buildCache=createBuildCache({root:path.join(storeRoot,'data'),getData:()=>data});
 const refreshBuild=async(...args)=>{const result=await buildCache(...args);publishData(['builds','buildSources','hexBuilds']);return result;};
 const liveService=await import('../services/live-client.mjs');
 const {createAppUpdateService}=await import('../services/app-update.mjs');
 const {compareVersions:compareAppVersion,releasePageUrl,isReleaseNotesUrl}=await import('../src/core/app-update.mjs');
 const appUpdateBase={currentVersion:app.getVersion(),installDir:app.isPackaged?path.dirname(process.execPath):'',tempDir:process.env.RIFT_BUDDY_UPDATE_TEMPDIR||path.join(app.getPath('temp'),'rift-buddy-update'),storeFile:path.join(storeRoot,'app-update.json'),...(process.env.RIFT_BUDDY_UPDATE_FEED?{feedUrl:process.env.RIFT_BUDDY_UPDATE_FEED,insecureHosts:['127.0.0.1','::1','localhost']}:{}),dryRun:process.env.RIFT_BUDDY_UPDATE_DRY_RUN==='1'};
 const updater=()=>createAppUpdateService({...appUpdateBase,mirrorBase:state.preferences.updateMirror});
 const appUpdater=updater();
 await appUpdater.sweep().catch(()=>{});
 let appUpdateStatus={phase:'idle'},appUpdateFlight=null,appUpdateAbort=null,appUpdateInstallFlight=null,appUpdateStop=null;
 const publishAppUpdate=snapshot=>{appUpdateStatus=snapshot;publishWindows('app-update-progress',snapshot);};
 const {changePresentation}=await import('../src/core/presentation.mjs');
 const setPresentation=async change=>{await saveCurrentState(current=>({...current,preferences:{...current.preferences,presentation:changePresentation(current.preferences.presentation,change)}}));publishWindows('presentation-update',state.preferences.presentation);guide?.publish();return state.preferences.presentation;};
 const guideRefresh=new Map(),guideRefreshKey=s=>s&&buildSourcePendingKey(data.patch,s.id,s.mode==='hex'?'hex':s.role,data.buildSource);
 const getGuideModel=()=>{const selection=currentGuideSelection(),m=guideCore.createGuideModel({...data,flashSlot:state.preferences.flashSlot,clientFlashSlot:currentGame.flashSlot()},state.guide,state.preferences.autoLive===false?{available:false,reason:'局内装备读取已关闭，可手动标记'}:latestLive,selection);if(m){const progress=guideRefresh.get(guideRefreshKey(m.selection));if(progress)m.status.build=progress.pending?'当前配置正在刷新':progress.error?'配置刷新未完成：'+progress.error:m.status.build;}return m;};
 const recommendationCore=await import('../src/core/recommend.mjs');
 const {publicClientGameId,reconcileClientDraft}=await import('../src/core/draft.mjs');
 const {creativeComboContext}=await import('../src/core/creative-plan.mjs');
 const {mergeConfiguration,storedPreparation,upsertPreparation,preparationIdentity}=await import('../src/core/preparation.mjs');let guideRevision=0;
 const {isFreshBuildReference,rankedClientRoles}=await import('../src/core/builds.mjs');
 const {createCurrentGameTracker}=await import('../src/core/game-context.mjs');const currentGame=createCurrentGameTracker({flashId:Number(data.spells.SummonerFlash.key)});
 const {createOpponentFocusTracker}=await import('../src/core/opponent-focus.mjs');const opponentFocus=createOpponentFocusTracker({newToken:require('node:crypto').randomUUID});
 let appliedGuideSelection=null;
 const currentGuideSelection=()=>{
  const own=currentGame.current(latestClient,latestLive,data.champions,state.draft?.slots||[]);if(!own)return null;
  // A clicked reference lane may belong to an ally. Keep the configuration
  // actually applied by this player without moving anyone's public position.
  if(appliedGuideSelection?.gameId===publicClientGameId(latestClient)&&appliedGuideSelection.selection.id===own.id&&appliedGuideSelection.selection.mode===own.mode){const chosen=appliedGuideSelection.selection;return {...own,...chosen,...storedPreparation(state.preparations,chosen),name:data.champions.find(c=>c.id===own.id)?.name,comboKnown:false};}
  const prepared=state.guide?.selection,gameId=publicClientGameId(latestClient),preparedMatchesGame=!gameId||!state.guide?.match?.gameId||gameId===String(state.guide.match.gameId);if(!own.positionKnown){const bound=latestClient.phase==='ChampSelect'&&state.draft?.slots.find(s=>s.champion===own.id&&s.clientCellId===latestClient.session?.localPlayerCellId);if(bound)own.role=bound.role;else if(state.draft?.scope==='solo'&&state.draft.soloRole)own.role=state.draft.soloRole;else if(preparedMatchesGame&&prepared?.id===own.id&&prepared.mode===own.mode)own.role=prepared.role;}
  const draftSlots=state.draft?.slots||[],observedSlots=latestClient.session&&draftSlots.length===5?recommendationCore.mergeClientSession(draftSlots,latestClient.session,data.champions,{autoArrange:state.preferences.autoArrange!==false,autoParty:state.preferences.autoParty!==false,party:latestClient.party,roleOrder:rankedClientRoles(data)}).slots:draftSlots;
  const combo=own.mode==='rift'?recommendationCore.currentCombo(observedSlots,own.id,own.role,data.catalogInfo?.status,null,state.draft?.creativePlan):null;
  const prior=state.guide?.selection,same=prior&&guideCore.guideIdentity(prior)===guideCore.guideIdentity(own),comboKnown=!!combo||own.mode!=='rift'||!!(gameId&&state.guide?.match?.gameId&&gameId!==String(state.guide.match.gameId))||recommendationCore.comboContextKnown(observedSlots,own.id,own.role,same?prior.comboId:null,same?prior.creativePlan:null);
  const context={id:own.id,role:own.role,mode:own.mode,...creativeComboContext(combo)};
  return {coreIndex:0,conditions:[],...storedPreparation(state.preparations,context),...own,name:data.champions.find(c=>c.id===own.id)?.name,comboKnown,...creativeComboContext(combo)};
 };
 const setGuideState=async(next,base)=>{
  const valid=guideCore.validateGuideState(next),previous=base?guideCore.validateGuideState(base):null;if(valid)valid.completedItems=guideCore.createGuideModel(data,valid).completedItems;
  await saveCurrentState(current=>{
   let accepted=valid;
   if(previous){
    if(!valid||!current.guide||guideCore.guideIdentity(current.guide.selection)!==guideCore.guideIdentity(previous.selection)||current.guide.match?.gameId!==previous.match?.gameId)throw Error('本局指引已变化，请核对后重新操作');
    const message='指引设置同时发生变化，请核对后重新操作',selection=current.guide.selection;
    accepted=mergeSavedFields(current.guide,{...previous,selection},{...valid,selection},message);
    accepted.selection=mergeSavedFields(selection,previous.selection,valid.selection,message);
   }
   return {...current,guide:accepted,preparations:accepted?upsertPreparation(current.preparations,accepted.selection):current.preparations};
  });const revision=++guideRevision;for(const window of appWindows())window.webContents.send('guide-selection',state.guide?.selection||null,{revision});
 };
 const prepareCurrentGuide=async()=>{const own=currentGuideSelection();if(!own)return false;if(!state.guide||guideCore.guideIdentity(state.guide.selection)!==guideCore.guideIdentity(own)||own.comboKnown&&(state.guide.selection.comboId||'')!==(own.comboId||'')){const next=guideCore.selectGuide(state.guide,own);if(latestClient.connected)next.match={phase:latestClient.phase,...(latestClient.game?.gameId?{gameId:latestClient.game.gameId}:{})};await setGuideState(next);}return true;};
 const publicEnemyIds=()=>latestClient.connected&&latestClient.phase==='ChampSelect'&&Array.isArray(latestClient.session?.theirTeam)?latestClient.session.theirTeam.map(p=>data.champions.find(c=>c.key===p.championId)?.id).filter(Boolean):undefined;
 const publishOpponentContext=()=>{const focus=opponentFocus.snapshot();latestClient={...latestClient,selectionContext:focus.selectionContext,opponentFocus:focus.focus,opponentFocusNotice:focus.notice};return focus;};
 const observeOpponentContext=()=>{opponentFocus.observe({connected:latestClient.connected,phase:latestClient.phase,gameId:publicClientGameId(latestClient),selection:currentGuideSelection(),enemyIds:publicEnemyIds()});return publishOpponentContext();};
 const bindPendingOpponent=async()=>{const binding=opponentFocus.binding(),own=currentGuideSelection();if(!binding||!own||guideCore.guideIdentity(own)!==guideCore.guideIdentity(binding))return;await setGuideState(guideCore.prepareGuideOpponent(state.guide,own,binding.opponentId,binding));opponentFocus.confirm(binding);publishOpponentContext();};
 const refreshPreparedBuild=()=>{
  const s=state.guide?.selection;if(!s||s.mode!=='hex'||state.preferences.autoCheck===false)return;
  const role=s.mode==='hex'?'hex':s.role,key=guideRefreshKey(s),ref=s.mode==='hex'?data.hexBuilds?.[s.id]:data.builds?.[s.id+':'+s.role];
  if(isFreshBuildReference(ref,data.patch,s.mode)||guideRefresh.get(key)?.pending)return;
  guideRefresh.set(key,{pending:true});guide.publish();
  refreshBuild(s.id,role).then(()=>guideRefresh.set(key,{pending:false})).catch(error=>guideRefresh.set(key,{pending:false,error:error.message})).finally(()=>guide.publish());
 };
 guide=require('./guide-window.cjs')({root,getState:()=>state.guide,getModel:getGuideModel,isQuitting:()=>quitting,diagnostic,
  currentSelection:currentGuideSelection,prepareCurrent:prepareCurrentGuide,setState:setGuideState,getPreferences:()=>state.preferences,setPresentation,adjustPlan:(selection,field,value)=>changeCompanionPlan(data,selection,field,value),
  showMain:selection=>{if(selection)pendingBuild=selection;showMainWindow();if(rendererReady&&pendingBuild){win.webContents.send('open-build',pendingBuild);pendingBuild=null;}}});
 diagnostic(`loaded data ${data.version}`);
 session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 const placement=await import('../src/core/window-placement.mjs');
 companion=require('./client-companion.cjs')({root,getWindow:()=>win,showMain:showMainWindow,getClient:()=>latestClient,getPreferences:()=>state.preferences,savePlacement:patch=>saveCurrentState(current=>{const preferences={...current.preferences};for(const [key,value] of Object.entries(patch)){if(value===undefined)delete preferences[key];else preferences[key]=value;}return {...current,preferences};}),placement,diagnostic});
 // Optional rooms (CHA-31): invited peers share public draft/configuration
 // snapshots over LAN/VPN or their own trusted relay. Never logs credentials.
 const {createRoomService}=await import('../services/room.mjs');
 const {sanitizeNick}=await import('../src/core/room.mjs');
 const {initialRelayUrl}=await import('../src/core/room-relay.mjs');
 const {deriveAutoRoom,autoRoomNick,autoRoomDecision,decorateAutoRoom,AUTO_ROOM_PHASES,AUTO_RETRY_MS}=await import('../src/core/room-auto.mjs');
 const {createBallotRoundObserver}=await import('../src/core/room-ballot.mjs');
 const ballotRoundChanged=createBallotRoundObserver();
 let roomNickInUse='',roomNickSourceRank=0;
 // Automatic party room (CHA-71): the lobby identifier the current auto room
 // was derived from, plus the state needed to decide when to stop. Manual
 // rooms never set roomAutoKey and are never touched by the poll below.
 let roomAutoKey=null,roomAutoCode=null,roomAutoPin=null,roomAutoBlockedKey=null,roomAutoCancelledKey=null,roomAutoFailedKey=null,roomAutoFailedUntil=0,roomAutoError='',roomAutoGoneSince=null,roomAutoOfflineSince=null,roomAutoTask=Promise.resolve(),roomAutoRunning=false,roomAutoRequested=false;
 let roomBallot=null,roomPublicShare=null,ballotRoom='',roomBallotRound=0;
 const clearRoomBallot=()=>{roomBallotRound++;roomBallot=null;roomService?.clearBallot();};
 const decorateRoom=snapshot=>{const identity=snapshot?.mode==='idle'?'':snapshot?.room||'';if(identity!==ballotRoom){roomBallot=null;roomPublicShare=null;ballotRoom=identity;}return decorateAutoRoom(snapshot,{auto:!!roomAutoKey&&!!roomAutoPin,pin:roomAutoPin,error:roomAutoError,retryAt:roomAutoFailedUntil||null});};
 // The sandboxed renderer never needs the lobby identifier or the raw identity
 // used as the room nickname: only this process derives the room from them.
 const forRenderer=client=>{if(!client)return client;const {own,party,...rest}=client,{key,...cleanParty}=party||{};return {...rest,...(own?.riotId?{playerName:own.riotId}:{}),...(party?{party:cleanParty}:{})};};
 // Closing the auto room always clears the whole auto state, so a later
 // re-enable starts clean instead of inheriting a stale failure or pin. The
 // cancelled key lets an in-flight handshake tell a local close apart from a
 // relay failure instead of reporting "已离开房间" as a connection error.
 const closeAutoRoom=reason=>{
  if(!roomAutoKey)return false;
  roomAutoCancelledKey=roomAutoKey;
  // A room the user created by hand inside the claim window is not ours to close.
  const snapshot=roomService?.snapshot();
  if(!snapshot||snapshot.mode==='idle'||snapshot.room===roomAutoCode)try{roomService?.leave();}catch{}
  roomAutoKey=null;roomAutoCode=null;roomAutoPin=null;roomAutoError='';roomAutoFailedKey=null;roomAutoFailedUntil=0;
  diagnostic(`auto room left (${reason})`);
  return true;
 };
 // Either switch (or an imported backup) can revoke the feature; the room has
 // to go even when the poll that would notice is switched off.
 const closeAutoRoomIfRevoked=()=>{
  if(state.preferences.roomAuto===true&&state.preferences.autoSync!==false)return false;
  const had=closeAutoRoom('preference'),hadError=!!roomAutoError;
  roomAutoError='';roomAutoFailedKey=null;roomAutoFailedUntil=0;
  // The panel may still hold the previous snapshot; the promise it shows
  // ("稍后会自动重试") is void once the switch is off.
  if(had||hadError)publishWindows('room-update',decorateRoom(roomService?roomService.snapshot():{mode:'idle',members:[],transport:'relay'}));
  return true;
 };
 const ensureRoom=wanted=>{
  const name=sanitizeNick(wanted);
  const clean=name&&name!=='队友'?name:autoRoomNick({identity:latestClient?.own,savedNick:state.preferences.roomNick});
  if(roomService&&roomNickInUse===clean)return roomService;
  if(roomService){if(roomService.snapshot().mode!=='idle')throw Error('请先离开房间再修改昵称');roomService.dispose();roomService=null;}
  const detected=sanitizeNick(latestClient?.own?.riotId)||sanitizeNick(latestClient?.own?.summonerName);
  roomNickInUse=clean;roomNickSourceRank=clean===detected?(detected.includes('#')?2:1):0;
  roomService=createRoomService({nick:clean,onUpdate:snapshot=>publishWindows('room-update',decorateRoom(snapshot)),diagnostic});
  return roomService;
 };
 guard('room-status',()=>roomService?decorateRoom(roomService.snapshot()):(roomAutoError?decorateAutoRoom({mode:'idle',members:[],transport:'relay'},{error:roomAutoError,retryAt:roomAutoFailedUntil||null}):null));
 // Manual rooms use the same forced nickname as auto rooms: the detected
 // public game id wins whenever the client provides one, and the typed
 // "我的昵称" is only the fallback for when it does not.
 const forcedRoomNick=wanted=>autoRoomNick({identity:latestClient?.own,savedNick:wanted||state.preferences.roomNick});
 guard('room-host',async nick=>{closeAutoRoom('manual-replacement');return decorateRoom(await ensureRoom(forcedRoomNick(nick)).host());});
 guard('room-join',async(target,nick)=>{closeAutoRoom('manual-replacement');return decorateRoom(await ensureRoom(forcedRoomNick(nick)).join(target||{}));});
 guard('room-relay',async(target,nick)=>{closeAutoRoom('manual-replacement');return decorateRoom(await ensureRoom(forcedRoomNick(nick)).relay(target||{}));});
 guard('room-leave',()=>{
  // Leaving by hand must not be undone by the next poll: remember the party
  // this auto room came from until the lobby identifier changes.
  if(roomAutoKey){roomAutoBlockedKey=roomAutoKey;closeAutoRoom('manual');}
  else if(roomService){roomService.leave();roomAutoError='';roomAutoFailedKey=null;roomAutoFailedUntil=0;}
  return roomService?decorateRoom(roomService.snapshot()):null;
 });
 guard('room-publish',share=>{if(!roomService||roomService.snapshot().mode==='idle')throw Error('尚未创建或加入房间');const {ballot,...publicShare}=share||{};const result=roomService.publish({...publicShare,...(roomBallot?{ballot:roomBallot}:{})});roomPublicShare=publicShare;return decorateRoom(result);});
 guard('room-ballot',async raw=>{
  const service=roomService,initial=service?.snapshot(),round=roomBallotRound;if(!initial||initial.mode==='idle')throw Error('请先连接房间');
  const {sanitizeRoomBallot,proposalKey,ballotVotes}=await import('../src/core/room.mjs');
  const snapshot=roomService?.snapshot();
  if(service!==roomService||snapshot?.mode==='idle'||snapshot?.room!==initial.room||round!==roomBallotRound)throw Error('房间或对局已变化，请重新选择候选');
  if(!snapshot.ballots)throw Error('当前中继尚未支持投票，更新中继后重新连接即可使用');
  // Apply key-level intents to the latest state after the await. Two windows
  // voting at once must not replace each other's votes with stale snapshots.
  const previous=roomBallot||snapshot.members.find(m=>m.self)?.share?.ballot;
  const input={version:raw?.version,proposal:raw?.proposal===undefined?previous?.proposal||null:raw.proposal,accepted:raw?.accepted===undefined?previous?.accepted:raw.accepted};
  const proposal=sanitizeRoomBallot({...input,vote:null})?.proposal;
  const keys=new Set(snapshot.members.filter(m=>!m.self&&m.online!==false).map(m=>m.share?.ballot?.proposal).filter(Boolean).map(p=>proposalKey(p)));if(proposal)keys.add(proposalKey(proposal));
  const intents=['toggleVote','addVote'].filter(name=>raw?.[name]!==undefined);
  if(intents.length>1||intents.length&&(raw.votes!==undefined||raw.vote!==undefined))throw Error('投票操作格式不正确');
  let votes=ballotVotes(previous);
  if(intents.length){
   const key=raw[intents[0]],removing=intents[0]==='toggleVote'&&votes.includes(key);
   if(typeof key!=='string'||!/^[A-Za-z0-9:|]{1,260}$/.test(key))throw Error('投票操作格式不正确');
   if(!removing&&!keys.has(key))throw Error('该候选已撤回，请重新选择');
   votes=votes.filter(value=>keys.has(value)&&(!removing||value!==key));
   if(!removing&&!votes.includes(key))votes.push(key);
  }else if(raw?.votes!==undefined||raw?.vote!==undefined){
   const supplied=sanitizeRoomBallot({...input,...(raw.votes!==undefined?{votes:raw.votes}:{vote:raw.vote})});
   if(!supplied)throw Error('阵容候选已变化，请重新选择');
   votes=ballotVotes(supplied);if(votes.some(key=>!keys.has(key)))throw Error('该候选已撤回，请重新选择');
  }else votes=votes.filter(key=>keys.has(key));
  const ballot=sanitizeRoomBallot({...input,votes});
  if(!ballot)throw Error('阵容候选已变化，请重新选择');
  if(votes.length>1&&!snapshot.multiVotes)throw Error('当前中继或房主版本只支持单选投票，请更新后重新连接');
  if(raw?.accepted){
   if(!snapshot.adoptions)throw Error('此中继尚未支持采用状态，已采用的本机方案仍保留');
   const proposal=[ballot.proposal,...snapshot.members.map(m=>m.share?.ballot?.proposal)].find(p=>p&&proposalKey(p)===ballot.accepted.key);
   if(!proposal?.lineup.some(s=>s.role===ballot.accepted.role&&s.champion))throw Error('采用的候选或本人分路已变化，请重新选择');
  }
  const publicShare=roomPublicShare||snapshot.members.find(m=>m.self)?.share||{lineup:[],pick:null,mode:'rift'};
  const result=roomService.publish({...publicShare,ballot});roomBallot=ballot;return decorateRoom(result);
 });
 guard('room-scan',()=>ensureRoom(state.preferences.roomNick).scan());
 guard('room-addresses',()=>{const list=[];for(const [name,items] of Object.entries(os.networkInterfaces()))for(const item of items||[])if(item.family==='IPv4'&&!item.internal)list.push({name,address:item.address});return list;});
 // Runs after each client poll, never inside it: a relay handshake can take
 // seconds and must not delay client-status answers. Only the two stopwatches
 // and the decision table decide; this effect never throws into the poll.
 const observeRoomAuto=client=>{
  // Automatic client observation is what makes an automatic room possible:
  // with sync off there is nothing to follow, so the switch is off too.
  const enabled=state.preferences?.roomAuto===true&&state.preferences?.autoSync!==false;
  if(!enabled){roomAutoError='';roomAutoFailedKey=null;roomAutoFailedUntil=0;}
  const inWindow=!!client?.connected&&AUTO_ROOM_PHASES.includes(client.phase);
  if(inWindow&&Number(client.party?.lobbyCount)>=1&&client.party?.key)roomAutoGoneSince=null;
  else if(inWindow)roomAutoGoneSince=roomAutoGoneSince??Date.now();
  else roomAutoGoneSince=null;
  // "标识变化即解除": seeing a different party lifts a manual-leave block.
  if(roomAutoBlockedKey&&client?.party?.key&&client.party.key!==roomAutoBlockedKey)roomAutoBlockedKey=null;
  if(client?.connected)roomAutoOfflineSince=null;else roomAutoOfflineSince=roomAutoOfflineSince??Date.now();
  const now=Date.now();
  return autoRoomDecision({enabled,connected:!!client?.connected,phase:client?.phase||'',
   lobbyKey:client?.party?.key||null,lobbyCount:Number.isFinite(client?.party?.lobbyCount)?client.party.lobbyCount:null,
   activeAutoKey:roomAutoKey,manualRoomActive:!!(roomService&&roomService.snapshot().mode!=='idle'&&!roomAutoKey),
   blockedKey:roomAutoBlockedKey,failedKey:roomAutoFailedKey,failedRetryAt:roomAutoFailedUntil,
   partyGoneForMs:roomAutoGoneSince===null?null:now-roomAutoGoneSince,
   offlineForMs:roomAutoOfflineSince===null?null:now-roomAutoOfflineSince,now});
 };
 const roomAutoStep=async client=>{
  if(roomAutoKey&&roomService&&roomService.snapshot().mode==='idle'){roomAutoKey=null;roomAutoCode=null;roomAutoPin=null;}
  const decision=observeRoomAuto(client);let renamedShare=null;
  // A room joined with a fallback nick upgrades to the detected game id as
  // soon as one is known: rejoin the same key with the new name. Only a
  // steady connected state may do this, never a backoff, a block, a manual
  // room or a dying room, and only toward a detected name, never away from one.
  if(decision.action==='hold'&&decision.key===roomAutoKey&&decision.reason==='connected'){
   const detected=sanitizeNick(client?.own?.riotId)||sanitizeNick(client?.own?.summonerName);
   const rank=detected?(detected.includes('#')?2:1):0;
   if(detected===roomNickInUse)roomNickSourceRank=Math.max(roomNickSourceRank,rank);
   if(detected&&roomNickInUse!==detected&&rank>roomNickSourceRank){renamedShare={ballot:roomBallot,share:roomPublicShare,round:roomBallotRound};decision.action='switch';}
  }
  if(decision.action==='hold')return;
  if(decision.action==='leave'){closeAutoRoom(decision.reason);return;}
  const key=decision.key;
  if(decision.action==='switch'){try{roomService?.leave();}catch{}roomAutoCode=null;roomAutoPin=null;}
  // Claim the key before the (async) derivation so a manual leave or a
  // preference change during it still records the block and aborts this try.
  roomAutoCancelledKey=null;roomAutoKey=key;
  let derived=null;
  try{derived=await deriveAutoRoom(key);}catch{}
  // A manual leave or a preference change during the derivation releases the
  // claim; a failure the player caused is not a failure to report.
  if(roomAutoKey!==key)return;
  if(!derived){
   roomAutoKey=null;roomAutoCode=null;roomAutoPin=null;roomAutoFailedKey=key;roomAutoFailedUntil=Date.now()+AUTO_RETRY_MS;roomAutoError='房间码派生失败';
   publishWindows('room-update',decorateRoom(roomService?roomService.snapshot():{mode:'idle',members:[],transport:'relay'}));
   diagnostic('auto room derive failed');
   return;
  }
  // A room the user joined by hand while this step was deriving wins.
  if(roomService&&roomService.snapshot().mode!=='idle'){roomAutoKey=null;roomAutoCode=null;roomAutoPin=null;diagnostic('auto room yielded to a manual room');return;}
  roomAutoError='';roomAutoCode=derived.code;roomAutoPin=derived.pin;
  try{
   await ensureRoom(autoRoomNick({identity:client?.own,savedNick:state.preferences.roomNick})).relay({url:initialRelayUrl(state.preferences.relayUrl),room:derived.code,pin:derived.pin});
   // Revocation already closed this attempt. A later manual room owns the service.
   if(roomAutoKey!==key)return;
   if(renamedShare&&renamedShare.round===roomBallotRound&&latestClient?.party?.key===key){roomBallot=roomBallot||renamedShare.ballot;roomPublicShare=roomPublicShare||renamedShare.share;if(roomPublicShare)roomService.publish({...roomPublicShare,...(roomBallot?{ballot:roomBallot}:{})},{restoring:true});}
   roomAutoFailedKey=null;roomAutoFailedUntil=0;
   diagnostic(`auto room joined ${derived.code} (${decision.reason})`);
  }catch(error){
   if(roomAutoKey!==key)return;
   roomAutoKey=null;roomAutoCode=null;roomAutoPin=null;
   // A manual leave, a preference change or a replacement room explains the
   // failure by itself: only a real relay problem earns a retry and a notice.
   if(roomAutoBlockedKey!==key&&roomAutoCancelledKey!==key){
    roomAutoFailedKey=key;roomAutoFailedUntil=Date.now()+AUTO_RETRY_MS;
    roomAutoError=error?.message||'自动连接失败';
    // The service already emitted its idle snapshot before this error
    // existed; the panel needs the decorated one to show why nothing came up.
    publishWindows('room-update',decorateRoom(roomService?roomService.snapshot():{mode:'idle',members:[],transport:'relay'}));
   }
   diagnostic(`auto room join failed: ${error?.message||'unknown'}`);
  }
 };
 const queueRoomAuto=()=>{
  // Observe revocation immediately, even while a slow relay is handshaking.
  const decision=observeRoomAuto(latestClient);
  if(decision.action==='leave'||decision.action==='switch')closeAutoRoom(decision.reason);
  roomAutoRequested=true;if(roomAutoRunning)return roomAutoTask;
  roomAutoRunning=true;
  roomAutoTask=(async()=>{try{while(roomAutoRequested){roomAutoRequested=false;await roomAutoStep(latestClient);}}catch(error){diagnostic(`auto room step failed: ${error?.message||'unknown'}`);}finally{roomAutoRunning=false;}})();
  return roomAutoTask;
 };
 guard('room-reconnect',async()=>{
  await status(true);await roomAutoTask;
  const party=latestClient.party;
  if(!latestClient.connected)throw Error('请先连接游戏客户端，再连接组队房间');
  if(!party?.key||Number(party.lobbyCount)<1)throw Error('尚未读取到当前组队标识；请回到组队大厅同步，或使用房间码加入');
  closeAutoRoom('reconnect');
  // Explicit reconnect chooses the current game party over a manually joined room.
  roomService?.leave();roomAutoBlockedKey=null;roomAutoFailedKey=null;roomAutoFailedUntil=0;roomAutoError='';
  if(state.preferences.roomAuto!==true||state.preferences.autoSync===false)await saveCurrentState(current=>({...current,preferences:{...current.preferences,roomAuto:true,autoSync:true}}));
  await queueRoomAuto();
  const snapshot=roomService&&decorateRoom(roomService.snapshot());
  if(!snapshot||snapshot.mode==='idle'||snapshot.link!=='connected')throw Error(roomAutoError||'房间暂未连接，请稍后重试');
  return snapshot;
 });
 guard('presentation',setPresentation);
 guard('bootstrap',async({surface})=>{
  const paused=appUpdateStatus.phase==='idle'&&!appUpdateFlight?await updater().partial().catch(()=>null):null;
  if(paused&&appUpdateStatus.phase==='idle'&&!appUpdateFlight)appUpdateStatus={phase:'paused',release:paused.release,received:paused.received,total:paused.total,kind:paused.kind,via:paused.via};
  return {data,state,stateRevision,dataRevision,preparationSnapshot:preparationLedger.snapshot(),surface,client:forRenderer(latestClient),windowLayout:companion.layout(surface),desktop:true,version:app.getVersion(),dataPath:storeRoot,hotkeyAvailable,guideHotkeyAvailable,appUpdate:appUpdateStatus};
 },true);
 const {windowInfo}=await import('../services/window-info.mjs');
 guard('window-info',()=>windowInfo({version:app.getVersion(),dataVersion:data.version,displays:screen.getAllDisplays(),primaryDisplayId:screen.getPrimaryDisplay().id,client:forRenderer(latestClient),companion:companion.layout(),main:win&&!win.isDestroyed()?{bounds:win.getBounds(),visible:win.isVisible(),minimized:win.isMinimized()}:null,guide:guide.windowInfo(),observedAt,observedClient:observedWindows?.client,observedGame:observedWindows?.game}));
 guard('companion-mode',(value,{surface})=>{if(typeof value!=='boolean')throw Error('窗口模式格式不正确');const operation=companion.setMode(value);return {...companion.layout(surface),opened:value?operation.docked:undefined,reason:operation.reason};},true);
 guard('open-main-page',destination=>{
  if(!destination||!['settings','reference'].includes(destination.route)||destination.route==='reference'&&(!data.champions.some(c=>c.id===destination.id)||!['skills','changes'].includes(destination.tab)))throw Error('页面不正确');
  pendingMainPage=destination.route==='reference'?{route:'reference',id:destination.id,tab:destination.tab}:{route:'settings'};showMainWindow();
  if(rendererReady&&pendingMainPage){win.webContents.send('main-page',pendingMainPage);pendingMainPage=null;}return true;
 });
 guard('window-layout-control',async(action,{surface})=>{if(action==='fold'){if(surface==='main')mainPeek.fold();else companion.fold();return companion.layout(surface);}if(!['follow','reset-side','reset-all'].includes(action))throw Error('窗口布局操作不正确');if(action==='reset-all'&&mainPeek.active())showMainWindow();await companion.reset(action==='reset-all',action!=='follow');if(action==='reset-all'&&state.guide)await guide.recover(true);return companion.layout(surface);},true);
 guard('recover-guide',async()=>{await prepareCurrentGuide();await pollLive(true);return guide.recover();});
 guard('catalog-source',url=>catalogStore.setSource(url).then(useCatalog));
 guard('catalog-check',()=>catalogStore.check());
 guard('catalog-preview',async raw=>{if(raw!==undefined){if(typeof raw!=='string'||raw.length>catalogCore.CATALOG_LIMIT)throw Error('组合库内容超过限制');return catalogStore.preview(JSON.parse(raw));}
  const selected=await dialog.showOpenDialog(win,{title:'选择组合库数据包',properties:['openFile'],filters:[{name:'组合库 JSON',extensions:['json']}]});return selected.canceled?null:catalogStore.previewFile(selected.filePaths[0]);});
 guard('catalog-apply',token=>catalogStore.apply(token).then(useCatalog));
 guard('catalog-rollback',()=>catalogStore.rollback().then(useCatalog));
 guard('catalog-personal',entry=>catalogStore.savePersonal(entry).then(useCatalog));
 guard('catalog-export',async()=>{const selected=await dialog.showSaveDialog(win,{title:'导出完整组合库',defaultPath:`开黑搭子-组合库-${data.catalog.version}.json`,filters:[{name:'组合库 JSON',extensions:['json']}]});if(selected.canceled)return false;await fs.writeFile(selected.filePath,JSON.stringify(catalogStore.export(),null,2),'utf8');return true;});
 guard('main-ready',({surface})=>{if(surface==='main'){rendererReady=true;if(pendingBuild){win.webContents.send('open-build',pendingBuild);pendingBuild=null;}if(pendingMainPage){win.webContents.send('main-page',pendingMainPage);pendingMainPage=null;}}return {state,revision:stateRevision,preparationSnapshot:preparationLedger.snapshot()};},true);
 guard('save-state',async(next,base,{sender})=>{
  next=storage.validateState(next);
  // A delayed renderer snapshot cannot restore a binding from an earlier game.
  const gameId=publicClientGameId(latestClient),draftContext=reconcileClientDraft(next.draft,gameId,state.draft?.clientGameId||state.guide?.match?.gameId,{phase:latestClient.phase});
  next.draft=draftContext.newGame&&state.draft?.clientGameId===gameId?state.draft:draftContext.draft;
  // The renderer cannot claim ownership of existing user rune pages.
  const before=base?storage.validateState(base):structuredClone(state),same=isDeepStrictEqual;
  await saveCurrentState(current=>{
   const merged={...current,preferences:{...current.preferences}};
   for(const key of Object.keys(next)){if(['preferences','ownedPageId','guide','preparations'].includes(key)||same(next[key],before[key]))continue;if(key==='draft'&&next.draft&&before.draft&&current.draft){
     merged.draft=mergeSavedFields(current.draft,before.draft,next.draft,'选人配置同时发生变化，请重新同步');continue;
    }if(!same(current[key],before[key])&&!same(current[key],next[key]))throw Error('配置同时发生变化，请刷新后重新保存');merged[key]=next[key];}
   // Remembering a guide changes preparation recency. Merge actual per-hero
   // changes so that reordering or another hero's update cannot block a save.
   for(const identity of new Set([...before.preparations,...next.preparations].map(preparationIdentity))){
    const previous=before.preparations.find(p=>preparationIdentity(p)===identity),changed=next.preparations.find(p=>preparationIdentity(p)===identity),accepted=current.preparations.find(p=>preparationIdentity(p)===identity);
    if(same(previous,changed))continue;if(changed&&accepted){merged.preparations=upsertPreparation(merged.preparations,mergeSavedFields(accepted,previous||{},changed,'这位英雄的配置同时发生变化，请刷新后重新保存'));continue;}if(!same(accepted,previous)&&!same(accepted,changed))throw Error('这位英雄的配置同时发生变化，请刷新后重新保存');
    merged.preparations=changed?upsertPreparation(merged.preparations,changed):merged.preparations.filter(p=>preparationIdentity(p)!==identity);
   }
   for(const key of Object.keys(next.preferences)){if(['presentation','mainBounds','companionBounds'].includes(key)||same(next.preferences[key],before.preferences[key]))continue;if(!same(current.preferences[key],before.preferences[key])&&!same(current.preferences[key],next.preferences[key]))throw Error('偏好同时发生变化，请刷新后重新保存');merged.preferences[key]=next.preferences[key];}
   const gameId=publicClientGameId(latestClient),context=reconcileClientDraft(merged.draft,gameId,current.draft?.clientGameId||current.guide?.match?.gameId,{phase:latestClient.phase});merged.draft=context.newGame&&current.draft?.clientGameId===gameId?current.draft:context.draft;
   // Protect accepted picks from this game, after the queued merge. A renderer
   // base from the previous game must not block releasing its old lane binding.
   const accepted=reconcileClientDraft(current.draft,gameId,current.guide?.match?.gameId,{phase:latestClient.phase}).draft;
   if(latestClient.connected&&latestClient.phase==='ChampSelect'&&merged.draft)for(const player of latestClient.session?.myTeam||[]){
    // Some blind-pick clients put an unlocked hover in championId. The local
    // player can compare another choice; teammate and locked picks stay fixed.
    const actions=(latestClient.session.actions||[]).flat().filter(a=>a.type==='pick'&&a.actorCellId===player.cellId);
    if(player.cellId===latestClient.session.localPlayerCellId&&player.pickState!=='locked'&&actions.length===1&&actions[0].completed===false)continue;
    const id=data.champions.find(c=>c.key===Number(player.championId))?.id;if(id&&accepted?.slots.some(s=>s.clientCellId===player.cellId&&s.champion===id)&&!merged.draft.slots.some(s=>s.clientCellId===player.cellId&&s.champion===id&&s.locked))throw Error('客户端已选英雄不能移除或解锁，请同步后调整位置。');
   }
   return merged;
  },sender);
   // Turning the switch (or client sync) off must not leave a room behind:
   // with sync off no poll will run to notice the new preference.
   closeAutoRoomIfRevoked();
   if(state.guide&&latestClient.connected&&latestClient.phase==='ChampSelect')await prepareCurrentGuide();
   guide.publish();companion.sync();return {state,revision:stateRevision};
 },true);
 const {createClientSync}=await import('../src/core/async-tasks.mjs');
 let stagedSelectionParty='',stagedSelectionRunning=false;
 async function rememberSelectionHover(value,result){
  if(result.steps?.hover?.status!=='done')return;
  const gameId=String(value.sessionGameId),cellId=value.context?.cellId;
  await saveCurrentState(current=>{
   const own=latestClient.session?.myTeam?.find(player=>player.cellId===cellId);
   if(!current.draft||!latestClient.connected||latestClient.phase!=='ChampSelect'||publicClientGameId(latestClient)!==gameId||latestClient.session?.localPlayerCellId!==cellId||Number(own?.championId||own?.championPickIntent)!==value.championId)return current;
   if(value.preselectOnly||value.claimPosition)current.draft.preselection={role:value.role,champion:value.champion,attemptedGameId:gameId,hoveredCellId:cellId};
   else delete current.draft.preselection;
   return current;
  });
 }
 const stagedPartyIdentity=()=>{
  const party=latestClient.party;if(party?.key)return party.key;
  if(!['lobby','known'].includes(party?.status))return '';
  const own=latestClient.own,identity=own?.puuid||own?.summonerId||own?.riotId;
  return identity?JSON.stringify([identity,party.lobbyCount,party.members.map(member=>member.displayName||'').sort()]):'';
 };
 async function applyStagedSelection(){
  const intent=state.draft?.preselection,gameId=publicClientGameId(latestClient);
  if(stagedSelectionRunning||applyingRunes||importingItemSet||!intent||intent.attemptedGameId||!gameId||latestClient.phase!=='ChampSelect')return;
  stagedSelectionRunning=true;
  try{
   // A pregame click belongs to its current local party. Restarting the app
   // does not silently revive an unconsumed choice from another lobby.
   if(!stagedSelectionParty||stagedSelectionParty!==stagedPartyIdentity()){await saveCurrentState(current=>{if(current.draft)delete current.draft.preselection;return current;});return;}
   const choice=pregameIntentChoice(intent,latestClient,data),cellId=latestClient.session?.localPlayerCellId;
   await saveCurrentState(current=>{
    if(latestClient.phase==='ChampSelect'&&publicClientGameId(latestClient)===gameId&&isDeepStrictEqual(current.draft?.preselection,intent))current.draft.preselection={...intent,champion:choice.champion||intent.champion,attemptedGameId:gameId};
    return current;
   });
   if(state.draft?.preselection?.attemptedGameId!==gameId||!latestClient.connected||publicClientGameId(latestClient)!==gameId||latestClient.phase!=='ChampSelect')return;
   if(!choice.champion){publishWindows('preselection-status',{message:choice.reason});return;}
   const [{getBuild},{clientPreparationPlan},{runeWriteContext},service]=await Promise.all([import('../src/core/builds.mjs'),import('../src/client-preparation-view.mjs'),import('../src/core/rune-context.mjs'),import('../services/client-preparation.mjs')]);
   const selection=intent.kind==='hero'&&intent.selection?intent.selection:{id:choice.champion,role:choice.role,mode:'rift'},hero=data.champions.find(value=>value.id===choice.champion);
   const plan=clientPreparationPlan(data,{selection,build:getBuild(hero,choice.role,data,selection)});if(!plan)throw Error('预选英雄资料暂不可用，请直接选择英雄');
   // An explicit configuration may have acquired the client while imports
   // loaded. Its lock and newer choice take precedence over this old hover.
   if(applyingRunes||importingItemSet||!latestClient.connected||latestClient.phase!=='ChampSelect'||publicClientGameId(latestClient)!==gameId||state.draft?.preselection?.attemptedGameId!==gameId||state.draft.preselection.champion!==choice.champion)return;
   const value=service.validateClientPreparation({...plan.value,sessionGameId:gameId,context:runeWriteContext(latestClient),claimPosition:intent.kind!=='hero'},data);
   const operation=beginPreparation('selection',{value,selection,context:value.context});applyingRunes=true;importingItemSet=true;
   let hovered;
   try{
    const written=helper.active()?await helper.request('prepareSelection',{value}):await service.prepareClientSelection({value,data,installPath:state.preferences?.installPath,ownedPageId:state.ownedPageId});
    finishPreparation(operation,{result:written});
    if(intent.kind==='hero'&&written.complete)appliedGuideSelection={gameId,selection:structuredClone(selection)};
    const result=await preservePreparationResult(written,[
     ...(written.steps?.runes?.status==='done'?[['保存已写符文页',()=>saveCurrentState(current=>({...current,ownedPageId:written.steps.runes.pageId}))]]:[]),
     ...(intent.kind==='hero'?[['保存英雄配置',()=>saveCurrentState(current=>({...current,preparations:upsertPreparation(current.preparations,selection)}))]]:[]),
     ['保存预选位置',async()=>{if(written.steps?.hover?.status==='done'&&publicClientGameId(latestClient)===gameId)await saveCurrentState(current=>{if(current.draft?.preselection?.attemptedGameId===gameId&&Number.isInteger(cellId)&&(!current.draft.playerPosition||current.draft.playerPosition.role===choice.role)){current.draft.playerPosition={role:choice.role,cellId};current.draft.soloRole=choice.role;}return current;});}]
    ]);
    if(result.followUpError!==written.followUpError)finishPreparation(operation,{result});
    if(result.steps?.hover?.status!=='done'){publishWindows('preselection-status',{message:result.steps?.hover?.message||'预选未完成，请直接选择英雄'});return;}
    hovered=result;
   }catch(error){finishPreparation(operation,{result:{complete:false,message:String(error.message)}});throw error;}
   finally{applyingRunes=false;importingItemSet=false;}
   await status(true);
   await rememberSelectionHover(value,hovered);
  }catch(error){if(latestClient.connected&&latestClient.phase==='ChampSelect'&&publicClientGameId(latestClient)===gameId&&state.draft?.preselection?.attemptedGameId===gameId)publishWindows('preselection-status',{message:String(error.message||'预选未完成，请直接选择英雄')});}
  finally{stagedSelectionRunning=false;}
 }
 const status=createClientSync(async(force=false)=>{
  if(!force&&Date.now()-lastStatus<(latestClient.connected?(latestClient.phase==='ChampSelect'?2000:3000):5000))return latestClient;
  statusTask=(async()=>{const previousClient=latestClient,previousPhase=latestClient.phase,previousGame=latestClient.game?.gameId;try{latestClient=await helper.status(state.preferences?.installPath,state.preferences?.partyIds);}catch{latestClient={connected:false,phase:'Offline',message:'连接暂不可用，手动选人可用'};}
   // Reading public client data is automatic. When the client runs with higher
   // privileges, Windows alone decides whether it will let us read it, so ask
   // once per run instead of making the player start an authorization step.
   // A forced/manual read leaves its single permission request to the
   // renderer. Otherwise cancelling it would immediately trigger a second UAC.
   if(!force&&latestClient?.needsElevation&&!elevatedReadAttempted){
    elevatedReadAttempted=true;
    try{await helper.ensure(state.preferences?.installPath);latestClient=await helper.status(state.preferences?.installPath,state.preferences?.partyIds);}catch{}
   }
   if(ballotRoundChanged(latestClient))clearRoomBallot();
   feedIdle=observeFeedPhase(latestClient);dataFeed.activate();
   observePreparation();lastStatus=Date.now();if(latestClient.connected&&(!['InProgress','Reconnect'].includes(latestClient.phase)||previousGame&&latestClient.game?.gameId&&previousGame!==latestClient.game.gameId))latestLive=null;
   const draftContext=reconcileClientDraft(state.draft,publicClientGameId(latestClient),state.guide?.match?.gameId,{phase:latestClient.phase,previousPhase});if(draftContext.changed)await saveCurrentState(current=>({...current,draft:reconcileClientDraft(current.draft,publicClientGameId(latestClient),current.guide?.match?.gameId,{phase:latestClient.phase,previousPhase}).draft}));
   const claim=state.draft?.preselection;
   if(latestClient.connected&&latestClient.phase==='ChampSelect'&&Number.isInteger(claim?.hoveredCellId)&&!restoredRoleClaim(claim,latestClient,data.champions))await saveCurrentState(current=>{if(isDeepStrictEqual(current.draft?.preselection,claim))delete current.draft.preselection;return current;});
   if(latestClient.connected&&latestClient.phase==='ChampSelect'&&latestClient.session&&!validPartyCount(state.draft?.partyCount)){
    const count=selectionPartyCount(latestClient,previousClient),gameId=publicClientGameId(latestClient);
    // Main captures one quantity before broadcasting the snapshot to either
    // renderer. A newly opened sidebar cannot race to replace it with one.
    await saveCurrentState(current=>{
     if(validPartyCount(current.draft?.partyCount))return current;
     const draft=current.draft||{slots:createSlots(),style:current.preferences.style,soloRole:''};
     const ownRole=draft.playerPosition?.cellId===latestClient.session.localPlayerCellId?draft.playerPosition.role:draft.preselection?.role||'';
     current.draft={...draft,slots:reconcilePartyRange(draft.slots,latestClient.session,data.champions,{count,party:latestClient.party,ownRole,initial:true}),partyCount:count,scope:'party',...(gameId?{clientGameId:gameId}:{})};return current;
    });
   }
   currentGame.observe(latestClient,data.champions,state.draft?.slots||[]);
   if(latestClient.connected&&latestClient.phase==='ChampSelect')await prepareCurrentGuide();
   const enemyIds=publicEnemyIds();observeOpponentContext();await bindPendingOpponent();
   const reconciled=guideCore.reconcileGuide(state.guide,{phase:latestClient.phase,gameId:publicClientGameId(latestClient),enemyIds});
   if(JSON.stringify(state.guide?.selection)!==JSON.stringify(reconciled.guide?.selection))await setGuideState(reconciled.guide);
   else if(reconciled.changed)await saveCurrentState(current=>({...current,guide:guideCore.reconcileGuide(current.guide,{phase:latestClient.phase,gameId:publicClientGameId(latestClient),enemyIds}).guide}));
   if(state.preferences.guideAutoShow!==false&&latestClient.connected&&latestClient.phase==='InProgress'&&(guide.needsAutoShow()||!['InProgress','Reconnect'].includes(previousPhase)||latestClient.game?.gameId&&latestClient.game.gameId!==previousGame))await pollLive(true);
   try{await guide.phase(latestClient.phase,latestClient.connected);}catch(error){diagnostic(`guide phase failed ${error.message}`);}
   companion.sync();
   if(inGame()&&!['GameStart','InProgress','Reconnect'].includes(previousPhase)){mainExplicitInGame=false;if(win){win.hide();mainRelease.request(win);}}
   else if(!inGame()){mainExplicitInGame=false;mainRelease.cancel();if(!win&&!mainDismissed)createWindow({automatic:true});}
   queueRoomAuto();publishWindows('client-update',forRenderer(latestClient));setImmediate(()=>applyStagedSelection());return latestClient;})().finally(()=>statusTask=null);
  return statusTask;
 });
 const pollLive=async(force=false)=>{
  if(liveTask){await liveTask;if(!force)return;}
  if(!force&&!guide.isVisible()&&!guide.needsAutoShow()||state.preferences.autoLive===false)return;
  const context=JSON.stringify([latestClient.phase,latestClient.game?.gameId]);
  liveTask=liveService.liveSnapshot(data.champions,latestClient.game||{}).then(async result=>{if(state.preferences.autoLive!==false&&(force||guide.isVisible()||guide.needsAutoShow())&&context===JSON.stringify([latestClient.phase,latestClient.game?.gameId])){latestLive=result;await prepareCurrentGuide();const reconciled=guideCore.reconcileGuide(state.guide,{phase:latestClient.phase,gameId:latestClient.game?.gameId,live:result});if(reconciled.changed)await saveCurrentState(current=>({...current,guide:guideCore.reconcileGuide(current.guide,{phase:latestClient.phase,gameId:latestClient.game?.gameId,live:result}).guide}));guide.publish();if(guide.needsAutoShow())await guide.phase(latestClient.phase,latestClient.connected);}}).finally(()=>liveTask=null);await liveTask;
 };
 guard('client-status',async force=>forRenderer(await status(force)));
 guard('party-range',async value=>{
  if(!value||!['top','jungle','mid','bottom','support'].includes(value.role)||typeof value.checked!=='boolean')throw Error('请确认要调整的开黑位置');
  await status(true);
  const sameSelection=()=>!!value.gameId&&Number.isInteger(value.cellId)&&value.cellId>=0&&value.cellId<30&&latestClient.connected&&latestClient.phase==='ChampSelect'&&publicClientGameId(latestClient)===value.gameId&&latestClient.session?.localPlayerCellId===value.cellId;
  if(!sameSelection())throw Error('选人已变化，请按当前页面重新调整开黑位置');
  await saveCurrentState(current=>{
   if(!sameSelection()||!validPartyCount(current.draft?.partyCount))throw Error('选人已变化，请按当前页面重新调整开黑位置');
   const ownRole=current.draft.playerPosition?.cellId===value.cellId?current.draft.playerPosition.role:current.draft.soloRole||'';
   const party=partyWithPregameIntents(latestClient.party,roomService?.snapshot(),current.draft.preselection);
   const edited=editPartyRange(current.draft.slots,value.role,value.checked,{count:current.draft.partyCount,session:latestClient.session,champions:data.champions,party,ownRole,roleOrder:rankedClientRoles(data)});
   current.draft={...current.draft,...edited};
   if(current.draft.scope!=='context'&&edited.partyCount!==1&&current.draft.creativePlan?.members.some(member=>!edited.slots.some(slot=>slot.role===member.role&&slot.party)))delete current.draft.creativePlan;
   return current;
  });return {state,revision:stateRevision};
 });
 guard('stage-selection',async value=>{
  const intent=validatePregameIntent(value);if(intent.champion&&!data.champions.some(champion=>champion.id===intent.champion))throw Error('当前资料没有这位英雄');
  await status(true);if(!latestClient.connected||!pregamePhase(latestClient.phase)||!stagedPartyIdentity())throw Error('请先连接游戏组队大厅，再设置预选');
  stagedSelectionParty=stagedPartyIdentity();
  const expectedParty=stagedSelectionParty;
  await saveCurrentState(current=>{
   if(!pregamePhase(latestClient.phase)||stagedPartyIdentity()!==expectedParty)throw Error('选人或组队已变化，请按当前界面重新选择');
   const draft=current.draft||{slots:createSlots(),scope:'party',soloRole:'',style:current.preferences.style};
   draft.slots=reconcilePartyRange(draft.slots,null,data.champions,{count:initialPartyCount(latestClient.party),party:latestClient.party,ownRole:intent.role,initial:true});
   if(intent.role||intent.champion)draft.preselection={role:intent.role,champion:intent.champion,...(intent.kind?{kind:intent.kind}:{}),...(intent.selection?{selection:intent.selection}:{})};else delete draft.preselection;
   current.draft=draft;return current;
  });return {state,revision:stateRevision};
 });
 guard('cancel-preselection',async()=>{
  await saveCurrentState(current=>{
   const intent=current.draft?.preselection;if(!intent?.champion)return current;
   // Consumption and cancellation share the state queue. Once dispatched,
   // clearing a local intent must not pretend to undo a client selection.
   if(intent.attemptedGameId)throw Error('已进入选人，请在客户端更换英雄');
   if(intent.role)current.draft.preselection={role:intent.role,champion:null,kind:'position'};
   else delete current.draft.preselection;
   return current;
  });return {state,revision:stateRevision};
 });
 guard('authorize-client',async()=>{elevatedReadAttempted=true;await helper.ensure(state.preferences?.installPath);return forRenderer(await status(true));});
 let launchingGame=false;
 guard('launch-game',async()=>{
  if(launchingGame)throw Error('正在启动，请稍候');launchingGame=true;
  try{const current=await status(true);if(current.connected)return {connected:true};
   const {launchGame}=await import('../services/game-launcher.mjs');
   const result=await launchGame(state.preferences);
   if(state.preferences.autoSync===false)await saveCurrentState(s=>({...s,preferences:{...s.preferences,autoSync:true}}));
   return result;
  }finally{launchingGame=false;}
 });
 guard('choose-launch-path',async()=>{const result=await dialog.showOpenDialog(win,{title:'选择 WeGame 英雄联盟或客户端启动程序',properties:['openFile'],filters:[{name:'启动程序',extensions:['exe']}]});return result.canceled?null:result.filePaths[0];});
 guard('refresh-build',async(id,role,source)=>{const selected=source===undefined?normalizeBuildSource(data.buildSource):source,key=buildSourcePendingKey(data.patch,id,role,selected),result=await refreshBuild(id,role,selected);guideRefresh.set(key,{pending:false});guide.publish();return result;});
 guard('refresh-pairs',(members,source)=>refreshPairs(members,source));
 guard('refresh-rankings',source=>refreshRankings(source));
 guard('refresh-opponent-build',async(id,role,opponent,source)=>{
  const target=data.champions.find(c=>c.id===opponent);
  if(!latestClient.connected||latestClient.phase!=='ChampSelect'||!target||!latestClient.session?.theirTeam?.some(p=>p.championId===target.key))throw Error('所选对手已不在当前公开选人中，请同步后重试');
  const result=await refreshOpponentBuild(id,role,opponent,source);guide.publish();return result;
 });
 guard('open-guide',async selection=>{if(selection){const previous=guideCore.reconcileGuide(state.guide,{phase:latestClient.phase,gameId:latestClient.game?.gameId,live:latestLive}).guide,next=guideCore.selectGuide(previous,selection);if(!next.match&&latestClient.connected)next.match={phase:latestClient.phase,...(latestClient.game?.gameId?{gameId:latestClient.game.gameId}:{})};await setGuideState(next);}else await prepareCurrentGuide();const result=guide.show();pollLive();return {...result,selection:state.guide?.selection||null,revision:guideRevision};});
 guard('update-guide',async selection=>{const s=guideCore.validateGuideSelection(selection);if(!state.guide||guideCore.guideIdentity(state.guide.selection)!==guideCore.guideIdentity(s))return {updated:false};await setGuideState(guideCore.selectGuide(state.guide,mergeConfiguration(state.guide.selection,s,Array.isArray(selection.changedFields)?selection.changedFields:undefined)),state.guide);guide.publish();return {updated:true,selection:state.guide.selection,revision:guideRevision};});
 guard('matchup-focus',async context=>{
  const own=currentGuideSelection();
  if(!latestClient.connected||latestClient.phase!=='ChampSelect'||!own||!context||guideCore.guideIdentity(own)!==guideCore.guideIdentity(context))throw Error('选人上下文已变化，请同步后重新选择对手');
  observeOpponentContext();opponentFocus.choose(context);
  if(!context.opponentId){const next=guideCore.selectGuide(state.guide,own);delete next.selection.threatId;delete next.selection.matchupGameId;await setGuideState(next);}else await bindPendingOpponent();
  const focus=publishOpponentContext();guide.publish();return {selection:state.guide?.selection||null,focus:focus.focus,notice:focus.notice};
 });
 guard('update-data',async()=>{
  if(!observeFeedPhase(latestClient))throw Error('请在本局结束后更新基础资料，当前配置保持不变');
  if(updating)throw new Error('资料更新正在进行');updating=true;
  try{const next=await dataService.collectSnapshot(msg=>publishWindows('data-progress',msg),data);
   if(!observeFeedPhase(latestClient))throw Error('已进入选人或对局，基础资料留待本局结束后更新');
   if(!next.augments.length&&data.augments.length){next.augments=data.augments;next.augmentVersion=data.augmentVersion||data.version;next.sources.augments=data.sources.augments;}
   delete next.abilityReference;delete next.rankings;delete next.patchNotes;delete next.builds;delete next.buildSources;delete next.opponentBuildSources;delete next.buildSource;delete next.hexBuilds;delete next.imageOverrides;delete next.catalog;delete next.catalogInfo;if(!dataService.validSnapshot(next))throw Error('新资料不完整，已保留原数据');await dataService.atomicJSON(path.join(storeRoot,'data/game.json'),next);
   next.buildSources=await loadBuildSources([path.join(root,'data'),path.join(storeRoot,'data')],next);selectBuildSource(next,state.preferences.buildSource);
   next.opponentBuildSources=await loadOpponentBuildSources(path.join(storeRoot,'data'),next);
   next.pairStatistics=await loadPairStatisticsCache(pairFiles,next);
   next.rankings=await loadRankings([path.join(root,'data'),path.join(storeRoot,'data')],next);
   next.patchNotes=await loadPatchNotes(path.join(root,'data'),next);
   next.abilityReference=await loadAbilities(path.join(root,'data'),next);
   next.hexBuilds=await loadHexBuilds([path.join(root,'data'),path.join(storeRoot,'data')],next);
   // The spell book is versioned separately: a mismatched book must never be
   // used silently, so it falls back to empty (heuristic estimates + UI note).
   try{
    const spellsFile=JSON.parse(await fs.readFile(path.join(root,'data/spells.json'),'utf8'));
    next.spellbook=spellsFile.version===next.version?(spellsFile.champions||{}):{};
    if(spellsFile.version!==next.version)diagnostic(`spellbook ${spellsFile.version} != game ${next.version}; estimates use heuristics until pnpm spells:enrich runs`);
   }catch{next.spellbook={};}
   const cached=await imageCache.cacheMissingImages({root:path.join(storeRoot,'data/images'),bundleRoot:path.join(root,'data/images'),data:next,progress:message=>publishWindows('data-progress',message)});
   if(!observeFeedPhase(latestClient))throw Error('已进入选人或对局，当前窗口继续使用原资料');
   next.imageOverrides=cached.overrides;next.dataFeed=dataFeed.summary();data=next;useCatalog(catalogStore.summary());publishData(Object.keys(data),true);guide.publish();refreshPreparedBuild();return {data,imageCache:{saved:cached.saved,failed:cached.failed}};
  }finally{updating=false;}
 });
 guard('check-data-feed',()=>dataFeed.check({force:true}));
 guard('app-update-check',async(silent=false)=>{
  if(appUpdateFlight||appUpdateAbort||appUpdateInstallFlight)return appUpdateStatus;
  const prev=appUpdateStatus;
  appUpdateFlight=(async()=>{
   publishAppUpdate({phase:'checking'});
   try{
    const kept=await updater().pending();
    if(kept&&compareAppVersion(kept.version,app.getVersion())>0&&await updater().verify(kept)){publishAppUpdate({phase:'ready',release:{version:kept.version,tag:kept.tag,url:releasePageUrl(kept.tag),publishedAt:null},record:{version:kept.version,bytes:kept.bytes,sha256:kept.sha256,kind:kept.kind,via:kept.via||'direct',fallback:kept.fallback||false}});}
    else if(await updater().partial?.()){
     const paused=await updater().partial();
     publishAppUpdate({phase:'paused',release:paused.release,received:paused.received,total:paused.total,kind:paused.kind,via:paused.via});
    }else{
     const result=await updater().check();
     if(silent&&result.status==='available'&&state.preferences.dismissedAppVersion===result.release.tag)publishAppUpdate({phase:'current',release:result.release,dismissed:true});
     else publishAppUpdate({phase:result.status,release:result.release||null});
    }
   }catch(error){if(silent){publishAppUpdate(prev);}else{publishAppUpdate({phase:'error',error:error.message});throw error;}}
   finally{appUpdateFlight=null;}
   return appUpdateStatus;
  })();
  return appUpdateFlight;
 });
 guard('app-update-download',async()=>{
  if(appUpdateFlight||appUpdateAbort||appUpdateInstallFlight)throw Error('软件更新正在处理，请等待本次完成');
  const release=appUpdateStatus.release;
  if(!['available','paused'].includes(appUpdateStatus.phase)||!release)throw Error('没有可下载的新版本，请先检查更新');
  appUpdateAbort=new AbortController();
  appUpdateStop=null;
  let fellBack=false;
  const prev=appUpdateStatus;
  const settleStopped=async record=>{
   let paused;
   try{paused=appUpdateStop==='pause'?await updater().partial?.():null;}
   catch(error){publishAppUpdate({...appUpdateStatus,phase:'paused',release,error:error.message});throw error;}
   // Cancel can supersede pause while the checkpoint is being read.
   if(appUpdateStop==='pause'){
    publishAppUpdate({phase:'paused',release,received:paused?.received||record?.bytes||0,total:paused?.total??record?.bytes??null,kind:paused?.kind||record?.kind||appUpdateStatus.kind,via:paused?.via||record?.via||appUpdateStatus.via});return appUpdateStatus;
   }
   try{await updater().cleanup();}catch(error){publishAppUpdate({...appUpdateStatus,phase:'paused',release,error:error.message});throw error;}
   publishAppUpdate({phase:'available',release,cancelled:true});return appUpdateStatus;
  };
  appUpdateFlight=Promise.resolve().then(async()=>{
   let record;
   try{
    publishAppUpdate({phase:'downloading',release,received:prev.phase==='paused'?prev.received:0,total:prev.phase==='paused'?prev.total:null,kind:prev.kind});
    record=await updater().download(release,{signal:appUpdateAbort.signal,onProgress:p=>{if(appUpdateStop)return;if(p.note==='mirror-fallback')fellBack=true;publishAppUpdate({phase:p.stage==='verifying'?'verifying':'downloading',release,received:p.received,total:p.total,via:p.via||null,kind:p.kind||'full',fallbackNotice:fellBack});}});
   }catch(error){
    if(appUpdateStop)return settleStopped();
    publishAppUpdate({phase:'error',release,error:error.message});throw error;
   }
   if(appUpdateStop)return settleStopped(record);
   publishAppUpdate({phase:'ready',release,record:{version:record.version,bytes:record.bytes,sha256:record.sha256,kind:record.kind,via:record.via||'direct',fallback:fellBack}});
   return appUpdateStatus;
  }).finally(()=>{appUpdateAbort=null;appUpdateStop=null;appUpdateFlight=null;});
  return appUpdateFlight;
 });
 guard('app-update-pause',async()=>{
  if(!appUpdateAbort||appUpdateStop||appUpdateStatus.phase!=='downloading')return false;
  appUpdateStop='pause';publishAppUpdate({...appUpdateStatus,phase:'pausing'});appUpdateAbort.abort('pause');
  await appUpdateFlight;return true;
 });
 guard('app-update-cancel',async()=>{
  if(appUpdateAbort){appUpdateStop='cancel';publishAppUpdate({...appUpdateStatus,phase:'cancelling'});appUpdateAbort.abort('cancel');await appUpdateFlight;return true;}
  if(appUpdateStatus.phase!=='paused'||appUpdateFlight||appUpdateInstallFlight)return false;
  const release=appUpdateStatus.release;
  const prev=appUpdateStatus;
  appUpdateFlight=Promise.resolve().then(async()=>{
   publishAppUpdate({...prev,phase:'cancelling'});
   try{await updater().cleanup();publishAppUpdate({phase:'available',release,cancelled:true});return true;}
   catch(error){publishAppUpdate({...prev,error:error.message});throw error;}
  }).finally(()=>{appUpdateFlight=null;});
  return appUpdateFlight;
 });
 guard('app-update-install',async()=>{
  if(appUpdateInstallFlight)return appUpdateInstallFlight;
  if(appUpdateFlight||appUpdateAbort||appUpdateStatus.phase!=='ready')throw Error('请等待安装包下载并校验完成');
  const prev=appUpdateStatus;
  appUpdateInstallFlight=Promise.resolve().then(async()=>{
   publishAppUpdate({...prev,phase:'installing',error:''});
   try{
    const record=await updater().install();
    if(record.dryRun){publishAppUpdate(prev);return record;}
    quitting=true;app.quit();return record;
   }catch(error){
    const kept=await updater().pending().catch(()=>null);
    publishAppUpdate(kept?{...prev,error:error.message}:{phase:'error',error:error.message});
    throw error;
   }
  }).finally(()=>{appUpdateInstallFlight=null;});
  return appUpdateInstallFlight;
 });
 guard('app-update-delete',async()=>{
  if(appUpdateFlight||appUpdateAbort||appUpdateInstallFlight)throw Error('软件更新正在处理，请等待本次完成');
  appUpdateFlight=Promise.resolve().then(async()=>{await updater().cleanup();publishAppUpdate({phase:'idle'});return true;}).finally(()=>{appUpdateFlight=null;});
  return appUpdateFlight;
 });
 guard('apply-runes',async(page,context)=>{
  if(applyingRunes||importingItemSet)throw new Error('客户端配置正在处理，请稍后');applyingRunes=true;
   let operation;
   try{const {validateRuneWriteContext}=await import('../src/core/rune-context.mjs');context=validateRuneWriteContext(context);operation=beginPreparation('runes',{context,page:{primaryStyleId:page.primaryStyleId,subStyleId:page.subStyleId,selectedPerkIds:page.selectedPerkIds}});
    const written=helper.active()?await helper.request('applyRunes',{page,context}):await lcu.writeRunePage({page,context,ownedPageId:state.ownedPageId,installPath:state.preferences?.installPath,trees:data.runes});
    let event=finishPreparation(operation,{result:written});const result=await preservePreparationResult(written,[['保存符文页记录',()=>saveCurrentState(current=>({...current,ownedPageId:written.pageId}))],['刷新客户端',()=>status(true)]]);if(result.followUpError!==written.followUpError)event=finishPreparation(operation,{result});return {...result,preparationRevision:event.revision};}
   catch(error){if(operation)finishPreparation(operation,{result:{complete:false,message:String(error.message||'符文未完成')}});throw error;}
  finally{applyingRunes=false;}
 });
 guard('prepare-selection',async value=>{
  if(applyingRunes||importingItemSet)throw Error('客户端配置正在处理，请稍后');
  applyingRunes=true;importingItemSet=true;
  let operation;
  try{
   const service=await import('../services/client-preparation.mjs'),selection=value?.selection===undefined?null:guideCore.validateGuideSelection(value.selection);value=service.validateClientPreparation(value,data);
   if(selection&&(selection.id!==value.champion||selection.role!==value.role||selection.mode!==value.mode))throw Error('准备配置与英雄或位置不一致，请重新点击');
   operation=beginPreparation('selection',{value,selection,context:value.context});
   const written=helper.active()?await helper.request('prepareSelection',{value}):await service.prepareClientSelection({value,data,installPath:state.preferences?.installPath,ownedPageId:state.ownedPageId});
   let event=finishPreparation(operation,{result:written});
   if(written.complete&&selection&&!value.preselectOnly)appliedGuideSelection={gameId:String(value.sessionGameId),selection:structuredClone(selection)};
   // Loading can destroy the sidebar before its IPC reply. Commit the clicked
   // configuration in main so its guide survives that legitimate transition.
   const result=await preservePreparationResult(written,[['保存符文页记录',async()=>{if(written.steps?.runes?.status==='done')await saveCurrentState(current=>({...current,ownedPageId:written.steps.runes.pageId}));}],['刷新客户端',()=>status(true)],['保存预选状态',()=>rememberSelectionHover(value,written)],['同步本局指引',async()=>{if(written.complete&&selection&&inGame()&&publicClientGameId(latestClient)===String(value.sessionGameId)){
    const chosen={...selection,...storedPreparation(state.preparations,selection)},next=guideCore.selectGuide(state.guide,chosen);
    next.match={...(next.match||{}),gameId:String(value.sessionGameId),phase:latestClient.phase};await setGuideState(next);guide.publish();await guide.phase(latestClient.phase,latestClient.connected);
   }}]]);
   if(result.followUpError!==written.followUpError)event=finishPreparation(operation,{result});return {...result,preparationRevision:event.revision};
  }catch(error){if(operation)finishPreparation(operation,{result:{complete:false,message:String(error.message||'配置未完成')}});throw error;
  }finally{applyingRunes=false;importingItemSet=false;}
 });
 guard('copy',text=>{clipboard.writeText(String(text).slice(0,20000));return true;});
 guard('import-item-set',async value=>{
  if(importingItemSet||applyingRunes)throw Error('客户端配置正在处理，请稍后');importingItemSet=true;
  let operation;
  try{const itemSet=itemSetCore.validateItemSet(value,data);operation=beginPreparation('items',{itemSet});
   const written=helper.active()?await helper.request('importItemSet',{itemSet}):await itemSetService.importItemSet({itemSet,data,installPath:state.preferences?.installPath});let event=finishPreparation(operation,{result:written});const result=await preservePreparationResult(written,[['刷新客户端',()=>status(true)]]);if(result.followUpError!==written.followUpError)event=finishPreparation(operation,{result});return {...result,preparationRevision:event.revision};
  }catch(error){if(operation)finishPreparation(operation,{result:{complete:false,message:String(error.message||'装备集未完成')}});throw error;
  }finally{importingItemSet=false;}
 });
 guard('export-item-set',async value=>{
  const itemSet=itemSetCore.validateItemSet(value,data),selected=await dialog.showSaveDialog(win,{title:'导出当前装备集',defaultPath:itemSet.uid+'.json',filters:[{name:'装备集 JSON',extensions:['json']}]});
  if(selected.canceled)return {exported:false};try{await dataService.atomicJSON(selected.filePath,itemSet,{space:2});}catch{throw Error('未能导出装备集，请选择可写入的位置后重试');}return {exported:true,title:itemSet.title};
 });
 guard('toggle-pin',({window})=>{window.setAlwaysOnTop(!window.isAlwaysOnTop());return window.isAlwaysOnTop();},true);
 guard('choose-directory',async()=>{const result=await dialog.showOpenDialog(win,{title:'选择英雄联盟安装目录',properties:['openDirectory']});return result.canceled?null:result.filePaths[0];});
 guard('open-link',async url=>{
  const parsed=new URL(url);const allowed=['developer.riotgames.com','www.leagueoflegends.com','lol.qq.com','www.communitydragon.org','raw.communitydragon.org','ddragon.leagueoflegends.com','game.gtimg.cn','op.gg','www.reddit.com','reddit.com','www.mobafire.com','mobafire.com','botdiff.lol','github.com','gitee.com'];
  const catalogSources=[...data.catalog.duos,...data.catalog.trios].flatMap(c=>c.sources||[]).map(s=>s.url);
  if(!catalogCore.safeSourceURL(url)||!allowed.includes(parsed.hostname)&&!catalogSources.includes(url))throw new Error('不支持的链接');
  if(['github.com','gitee.com'].includes(parsed.hostname)&&!isReleaseNotesUrl(url)&&!catalogSources.includes(url))throw new Error('不支持的链接');await shell.openExternal(parsed.href);return true;
 });
 guard('export-preparation',async value=>{
  const {preparationFileText}=await import('../src/core/preparation-file.mjs'),text=preparationFileText(value);
  const selected=await dialog.showSaveDialog(win,{title:'导出当前完整准备',defaultPath:'开黑搭子-准备.json',filters:[{name:'开黑准备 JSON',extensions:['json']}]});
  if(selected.canceled)return false;
  try{await dataService.atomicJSON(selected.filePath,JSON.parse(text),{space:2});}catch{throw Error('未能导出准备文件，请选择可写入的位置后重试');}return true;
 });
 guard('import-preparation',async()=>{
  const selected=await dialog.showOpenDialog(win,{title:'打开队友准备文件',properties:['openFile'],filters:[{name:'开黑准备 JSON',extensions:['json']}]});if(selected.canceled)return null;
  const {readPreparationFile}=await import('../services/preparation-file.mjs');return readPreparationFile(selected.filePaths[0]);
 });
 guard('export-state',async()=>{const result=await dialog.showSaveDialog(win,{title:'备份收藏与偏好',defaultPath:'开黑搭子-备份.json',filters:[{name:'JSON',extensions:['json']}]});if(result.canceled)return false;
  await fs.writeFile(result.filePath,storage.createBackup(state),'utf8');return true;});
 guard('import-state',async()=>{const result=await dialog.showOpenDialog(win,{title:'导入收藏与偏好',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(result.canceled)return null;
  const incoming=await storage.readBackup(result.filePaths[0]);
  await saveCurrentState(current=>storage.mergeState(current,incoming,data.champions));closeAutoRoomIfRevoked();publishWindows('presentation-update',state.preferences.presentation);guide.publish();companion.sync();return state;
 });
 Menu.setApplicationMenu(null);createWindow();
 try{tray=new Tray(nativeImage.createFromPath(path.join(root,'assets/icon.png')));tray.setToolTip('开黑搭子');tray.setContextMenu(Menu.buildFromTemplate([{label:'打开开黑搭子',click:showMainWindow},{label:'本局指引',click:()=>prepareCurrentGuide().then(()=>guide.show()).catch(()=>guide.show())},{label:'找回指引到当前屏幕',click:()=>prepareCurrentGuide().then(()=>guide.recover()).catch(()=>guide.recover().catch(()=>{}))},{label:'切换指引交互 / 鼠标穿透',click:()=>guide.interact().catch(()=>{})},{label:'退出',click:()=>{quitting=true;app.quit();}}]));tray.on('double-click',showMainWindow);}catch{}
 hotkeyAvailable=globalShortcut.register('Control+Shift+Space',()=>{if(win?.isVisible()&&win.isFocused()){companion?.dismiss();win.hide();}else showMainWindow();});
 guideHotkeyAvailable=globalShortcut.register('Control+Shift+G',()=>guide.toggle());guide.setHotkey(guideHotkeyAvailable);
 guide.setInteractionHotkey(globalShortcut.register('Control+Shift+H',()=>guide.interact().catch(()=>{})));
 statusTimer=setInterval(()=>{if(state.preferences.autoSync!==false)status().catch(()=>{});},1000);
 liveTimer=setInterval(()=>{if(state.preferences.autoLive===false&&latestLive){latestLive=null;guide.publish();}else pollLive().catch(()=>{});},3000);
 if(state.preferences.autoSync!==false)status().catch(()=>{});
 const checkStatistics=()=>{if(state.preferences.autoCheck!==false&&!quitting)dataFeed.check().catch(()=>{});};
 dataFeedStartup=setTimeout(checkStatistics,10000);dataFeedTimer=setInterval(checkStatistics,60000);
 diagnostic(`guide-hotkey-registered ${guideHotkeyAvailable}`);
 try{const {observeWindows}=await import('../services/window-observer.mjs');windowObserver=await observeWindows({root,onSnapshot:value=>{const dip=rect=>rect?{...rect,...screen.screenToDipRect(null,rect)}:null;const clientBounds=dip(value.client),gameBounds=dip(value.game);observedWindows={client:value.client?{pixels:value.client,dip:clientBounds,minimized:value.client.minimized,foreground:value.client.foreground}:null,game:value.game?{pixels:value.game,dip:gameBounds,minimized:value.game.minimized,foreground:value.game.foreground}:null};observedAt=Date.now();mainPeek.sync(true,!!clientBounds?.foreground||!!gameBounds?.foreground);companion.observe(clientBounds);guide.setGameBounds(gameBounds);},onError:message=>{observedWindows=null;observedAt=0;mainPeek.sync(true,false);companion.observe(null);diagnostic(message);}});}catch{diagnostic('window observer unavailable');}
 if(process.argv.includes('--show-guide'))guide.show();
 diagnostic(`hotkey-registered ${hotkeyAvailable}`);
}
if(lock)app.whenReady().then(boot).catch(error=>{diagnostic(`startup error ${error.message}`);dialog.showErrorBox('开黑搭子启动失败',error.message);app.quit();});
app.on('window-all-closed',()=>{if(!tray||quitting)app.quit();});
app.on('will-quit',()=>{mainRelease.cancel();mainPeek.destroy();clearInterval(statusTimer);clearInterval(liveTimer);clearTimeout(dataFeedStartup);clearInterval(dataFeedTimer);windowObserver?.stop();companion?.destroy();guide?.destroy();try{roomService?.leave();}catch{}globalShortcut.unregisterAll();});
app.on('before-quit',event=>{
 if(cleanupDone||!helper)return;
 event.preventDefault();if(cleaningUp)return;cleaningUp=true;quitting=true;
 const stopHelper=Promise.race([helper.shutdown(),new Promise(resolve=>setTimeout(resolve,1500))]);
 Promise.allSettled([stopHelper,saveTask]).then(results=>{if(results[1].status==='rejected')diagnostic('settings-save-before-quit failed');}).finally(()=>{cleanupDone=true;app.quit();});
});
