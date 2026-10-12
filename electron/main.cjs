const {app,BrowserWindow,ipcMain,Menu,Tray,nativeImage,globalShortcut,clipboard,shell,dialog,session,screen}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const {isDeepStrictEqual}=require('node:util');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..');
function diagnostic(message){if(process.env.RIFT_BUDDY_DIAGNOSTICS)fs.appendFile(process.env.RIFT_BUDDY_DIAGNOSTICS,`${new Date().toISOString()} ${message}\n`).catch(()=>{});}
let win,tray,state,data,storeRoot,dataService,storage,lcu,helper,guide,guideCore,companion,roomService,windowObserver,updating=false,quitting=false,applyingRunes=false,cleanupDone=false,cleaningUp=false,hotkeyAvailable=false,guideHotkeyAvailable=false;
let latestClient={connected:false,phase:'Offline',message:'正在检查客户端…'},latestLive=null,statusTask=null,liveTask=null,lastStatus=0,statusTimer,liveTimer,rendererReady=false,pendingBuild=null,pendingMainPage=null;
let observedWindows=null,observedAt=0;
let saveTask=Promise.resolve();
let stateRevision=0,dataRevision=0,preparationRevision=0;
const sharedDataFields=new Map();
function appWindows(){return [win,companion?.getWindow()].filter(w=>w&&!w.isDestroyed());}
function publishWindows(channel,value,exclude){for(const window of appWindows())if(window.webContents!==exclude)window.webContents.send(channel,value);}
function publishData(keys,replace=false){
 if(replace)sharedDataFields.clear();
 const changes={};for(const key of keys)if(replace||sharedDataFields.get(key)!==data[key]){changes[key]=data[key];sharedDataFields.set(key,data[key]);}
 if(Object.keys(changes).length)publishWindows('data-update',{changes,replace,revision:++dataRevision});
}
let importingItemSet=false;
let mainExplicitInGame=false;
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
function showMainWindow(){mainExplicitInGame=inGame();mainRelease.cancel();mainPeek.unfold();if(!win){if(data)createWindow();}else{if(win.isMinimized())win.restore();win.show();win.focus();}diagnostic(`show-main-window ${!!win?.isVisible()}`);}
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
 storeRoot=app.getPath('userData');state=await storage.readState(storeRoot);
 // A saved legacy ball must not trap the upgraded app in an icon-only view.
 if(state.guide?.ball){state.guide={...state.guide,ball:false,collapsed:false};if(state.recovery?.backedUp!==false)await saveCurrentState();}
 const {createHelperManager}=await import('../services/client-helper.mjs');
 const helperRoot=path.join(process.resourcesPath,'connection');
 helper=createHelperManager({userData:storeRoot,bundleRoot:root,executable:process.execPath,isPackaged:app.isPackaged,
  ...(app.isPackaged?{helperExecutable:path.join(helperRoot,'node.exe'),helperEntry:path.join(helperRoot,'electron/client-helper-entry.mjs'),helperBundleRoot:helperRoot,launcherExecutable:path.join(helperRoot,'connection-launcher.exe')}:{}) ,
  onProgress:message=>publishWindows('client-update',{connected:false,connecting:true,phase:'Offline',message})});
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
 const imageCache=await import('../services/image-cache.mjs');
 data.imageOverrides=await imageCache.loadImageOverrides(path.join(storeRoot,'data/images'),data);
 for(const [key,value] of Object.entries(data))sharedDataFields.set(key,value);
 const buildCache=createBuildCache({root:path.join(storeRoot,'data'),getData:()=>data});
 const refreshBuild=async(...args)=>{const result=await buildCache(...args);publishData(['builds','buildSources','hexBuilds']);return result;};
 const liveService=await import('../services/live-client.mjs');
 const {createAppUpdateService}=await import('../services/app-update.mjs');
 const {compareVersions:compareAppVersion,releasePageUrl,isReleaseNotesUrl}=await import('../src/core/app-update.mjs');
 const appUpdateBase={currentVersion:app.getVersion(),tempDir:process.env.RIFT_BUDDY_UPDATE_TEMPDIR||path.join(app.getPath('temp'),'rift-buddy-update'),storeFile:path.join(storeRoot,'app-update.json'),...(process.env.RIFT_BUDDY_UPDATE_FEED?{feedUrl:process.env.RIFT_BUDDY_UPDATE_FEED,insecureHosts:['127.0.0.1','::1','localhost']}:{}),dryRun:process.env.RIFT_BUDDY_UPDATE_DRY_RUN==='1'};
 const updater=()=>createAppUpdateService({...appUpdateBase,mirrorBase:state.preferences.updateMirror});
 const appUpdater=updater();
 await appUpdater.sweep().catch(()=>{});
 let appUpdateStatus={phase:'idle'},appUpdateFlight=null,appUpdateAbort=null,appUpdateInstallFlight=null;
 const publishAppUpdate=snapshot=>{appUpdateStatus=snapshot;publishWindows('app-update-progress',snapshot);};
 const {changePresentation}=await import('../src/core/presentation.mjs');
 const setPresentation=async change=>{await saveCurrentState(current=>({...current,preferences:{...current.preferences,presentation:changePresentation(current.preferences.presentation,change)}}));publishWindows('presentation-update',state.preferences.presentation);guide?.publish();return state.preferences.presentation;};
 const guideRefresh=new Map(),guideRefreshKey=s=>s&&buildSourcePendingKey(data.patch,s.id,s.mode==='hex'?'hex':s.role,data.buildSource);
 const getGuideModel=()=>{const m=guideCore.createGuideModel(data,state.guide,state.preferences.autoLive===false?{available:false,reason:'局内装备读取已关闭，可手动标记'}:latestLive,currentGuideSelection());if(m){const progress=guideRefresh.get(guideRefreshKey(m.selection));if(progress)m.status.build=progress.pending?'当前配置正在刷新':progress.error?'配置刷新未完成：'+progress.error:m.status.build;}return m;};
 const recommendationCore=await import('../src/core/recommend.mjs');
 const {publicClientGameId,reconcileClientDraft}=await import('../src/core/draft.mjs');
 const {creativeComboContext}=await import('../src/core/creative-plan.mjs');
 const {mergeConfiguration,storedPreparation,upsertPreparation,preparationIdentity}=await import('../src/core/preparation.mjs');let guideRevision=0;
 const {isFreshBuildReference,rankedClientRoles}=await import('../src/core/builds.mjs');
 const {createCurrentGameTracker}=await import('../src/core/game-context.mjs');const currentGame=createCurrentGameTracker();
 const {createOpponentFocusTracker}=await import('../src/core/opponent-focus.mjs');const opponentFocus=createOpponentFocusTracker({newToken:require('node:crypto').randomUUID});
 const currentGuideSelection=()=>{
  const own=currentGame.current(latestClient,latestLive,data.champions,state.draft?.slots||[]);if(!own)return null;
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
 let roomNickInUse='';
 const ensureRoom=wanted=>{
  const clean=sanitizeNick(wanted)||sanitizeNick(state.preferences.roomNick)||'队友';
  if(roomService&&roomNickInUse===clean)return roomService;
  if(roomService){if(roomService.snapshot().mode!=='idle')throw Error('请先离开房间再修改昵称');roomService.dispose();roomService=null;}
  roomNickInUse=clean;
  roomService=createRoomService({nick:clean,onUpdate:snapshot=>publishWindows('room-update',snapshot),diagnostic});
  return roomService;
 };
 guard('room-status',()=>roomService?roomService.snapshot():null);
 guard('room-host',nick=>ensureRoom(nick).host());
 guard('room-join',(target,nick)=>ensureRoom(nick).join(target||{}));
 guard('room-relay',(target,nick)=>ensureRoom(nick).relay(target||{}));
 guard('room-leave',()=>{if(!roomService)return null;roomService.leave();return roomService.snapshot();});
 guard('room-publish',share=>{if(!roomService||roomService.snapshot().mode==='idle')throw Error('尚未创建或加入房间');return roomService.publish(share);});
 guard('room-scan',()=>ensureRoom(state.preferences.roomNick).scan());
 guard('room-addresses',()=>{const list=[];for(const [name,items] of Object.entries(os.networkInterfaces()))for(const item of items||[])if(item.family==='IPv4'&&!item.internal)list.push({name,address:item.address});return list;});
 guard('presentation',setPresentation);
 guard('bootstrap',({surface})=>({data,state,stateRevision,dataRevision,surface,client:latestClient,windowLayout:companion.layout(surface),desktop:true,version:app.getVersion(),dataPath:storeRoot,hotkeyAvailable,guideHotkeyAvailable}),true);
 const {windowInfo}=await import('../services/window-info.mjs');
 guard('window-info',()=>windowInfo({version:app.getVersion(),dataVersion:data.version,displays:screen.getAllDisplays(),primaryDisplayId:screen.getPrimaryDisplay().id,client:latestClient,companion:companion.layout(),main:win&&!win.isDestroyed()?{bounds:win.getBounds(),visible:win.isVisible(),minimized:win.isMinimized()}:null,guide:guide.windowInfo(),observedAt,observedClient:observedWindows?.client,observedGame:observedWindows?.game}));
 guard('companion-mode',(value,{surface})=>{if(typeof value!=='boolean')throw Error('窗口模式格式不正确');companion.setMode(value);return companion.layout(surface);},true);
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
 guard('main-ready',({surface})=>{if(surface==='main'){rendererReady=true;if(pendingBuild){win.webContents.send('open-build',pendingBuild);pendingBuild=null;}if(pendingMainPage){win.webContents.send('main-page',pendingMainPage);pendingMainPage=null;}}return {state,revision:stateRevision};},true);
 guard('save-state',async(next,base,{sender})=>{
  next=storage.validateState(next);
  // A delayed renderer snapshot cannot restore a binding from an earlier game.
  const gameId=publicClientGameId(latestClient),draftContext=reconcileClientDraft(next.draft,gameId,state.draft?.clientGameId||state.guide?.match?.gameId);
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
   const gameId=publicClientGameId(latestClient),context=reconcileClientDraft(merged.draft,gameId,current.draft?.clientGameId||current.guide?.match?.gameId);merged.draft=context.newGame&&current.draft?.clientGameId===gameId?current.draft:context.draft;
   // Protect accepted picks from this game, after the queued merge. A renderer
   // base from the previous game must not block releasing its old lane binding.
   const accepted=reconcileClientDraft(current.draft,gameId,current.guide?.match?.gameId).draft;
   if(latestClient.connected&&latestClient.phase==='ChampSelect'&&merged.draft)for(const player of latestClient.session?.myTeam||[]){const id=data.champions.find(c=>c.key===Number(player.championId))?.id;if(id&&accepted?.slots.some(s=>s.clientCellId===player.cellId&&s.champion===id)&&!merged.draft.slots.some(s=>s.clientCellId===player.cellId&&s.champion===id&&s.locked))throw Error('客户端已选英雄不能移除或解锁，请同步后调整位置。');}
   return merged;
  },sender);guide.publish();companion.sync();return {state,revision:stateRevision};
 },true);
 const {createClientSync}=await import('../src/core/async-tasks.mjs');
 const status=createClientSync(async(force=false)=>{
  if(!force&&Date.now()-lastStatus<(latestClient.connected?(latestClient.phase==='ChampSelect'?2000:6000):30000))return latestClient;
  statusTask=(async()=>{const previousPhase=latestClient.phase,previousGame=latestClient.game?.gameId;try{latestClient=await helper.status(state.preferences?.installPath,state.preferences?.partyIds);}catch{latestClient={connected:false,phase:'Offline',message:'连接暂不可用，手动选人可用'};}
   lastStatus=Date.now();if(latestClient.connected&&(!['InProgress','Reconnect'].includes(latestClient.phase)||previousGame&&latestClient.game?.gameId&&previousGame!==latestClient.game.gameId))latestLive=null;
   const draftContext=reconcileClientDraft(state.draft,publicClientGameId(latestClient),state.guide?.match?.gameId);if(draftContext.changed)await saveCurrentState(current=>({...current,draft:reconcileClientDraft(current.draft,publicClientGameId(latestClient),current.guide?.match?.gameId).draft}));
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
   else if(!inGame()){mainExplicitInGame=false;mainRelease.cancel();if(!win)createWindow({automatic:true});}
   publishWindows('client-update',latestClient);return latestClient;})().finally(()=>statusTask=null);
  return statusTask;
 });
 const pollLive=async(force=false)=>{
  if(liveTask){await liveTask;if(!force)return;}
  if(!force&&!guide.isVisible()&&!guide.needsAutoShow()||state.preferences.autoLive===false)return;
  const context=JSON.stringify([latestClient.phase,latestClient.game?.gameId]);
  liveTask=liveService.liveSnapshot(data.champions,latestClient.game||{}).then(async result=>{if(state.preferences.autoLive!==false&&(force||guide.isVisible()||guide.needsAutoShow())&&context===JSON.stringify([latestClient.phase,latestClient.game?.gameId])){latestLive=result;await prepareCurrentGuide();const reconciled=guideCore.reconcileGuide(state.guide,{phase:latestClient.phase,gameId:latestClient.game?.gameId,live:result});if(reconciled.changed)await saveCurrentState(current=>({...current,guide:guideCore.reconcileGuide(current.guide,{phase:latestClient.phase,gameId:latestClient.game?.gameId,live:result}).guide}));guide.publish();if(guide.needsAutoShow())await guide.phase(latestClient.phase,latestClient.connected);}}).finally(()=>liveTask=null);await liveTask;
 };
 guard('client-status',status);
 guard('authorize-client',async()=>{await helper.ensure(state.preferences?.installPath);return status(true);});
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
  if(updating)throw new Error('资料更新正在进行');updating=true;
  try{const next=await dataService.collectSnapshot(msg=>publishWindows('data-progress',msg),data);
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
   next.imageOverrides=cached.overrides;data=next;useCatalog(catalogStore.summary());publishData(Object.keys(data),true);guide.publish();refreshPreparedBuild();return {data,imageCache:{saved:cached.saved,failed:cached.failed}};
  }finally{updating=false;}
 });
 guard('app-update-check',async(silent=false)=>{
  if(appUpdateFlight||appUpdateAbort||appUpdateInstallFlight)return appUpdateStatus;
  const prev=appUpdateStatus;
  appUpdateFlight=(async()=>{
   publishAppUpdate({phase:'checking'});
   try{
    const kept=await updater().pending();
    if(kept&&compareAppVersion(kept.version,app.getVersion())>0&&await updater().verify(kept)){publishAppUpdate({phase:'ready',release:{version:kept.version,tag:kept.tag,url:releasePageUrl(kept.tag),publishedAt:null},record:{version:kept.version,bytes:kept.bytes,sha256:kept.sha256,via:kept.via||'direct',fallback:kept.fallback||false}});}
    else{
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
  if(appUpdateStatus.phase!=='available'||!release)throw Error('没有可下载的新版本，请先检查更新');
  appUpdateAbort=new AbortController();
  let fellBack=false;
  try{
   publishAppUpdate({phase:'downloading',release,received:0,total:null});
   const record=await updater().download(release,{signal:appUpdateAbort.signal,onProgress:p=>{if(p.note==='mirror-fallback')fellBack=true;publishAppUpdate({phase:p.stage==='verifying'?'verifying':'downloading',release,received:p.received,total:p.total,via:p.via||null,fallbackNotice:fellBack});}});
   publishAppUpdate({phase:'ready',release,record:{version:record.version,bytes:record.bytes,sha256:record.sha256,via:record.via||'direct',fallback:fellBack}});
   return appUpdateStatus;
  }catch(error){publishAppUpdate({phase:'error',release,error:error.message});throw error;}
  finally{appUpdateAbort=null;}
 });
 guard('app-update-cancel',()=>{appUpdateAbort?.abort();return true;});
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
 guard('apply-runes',async(page,context,{sender})=>{
  if(applyingRunes)throw new Error('符文正在应用，请稍后');applyingRunes=true;
   try{const {validateRuneWriteContext}=await import('../src/core/rune-context.mjs');context=validateRuneWriteContext(context);const result=helper.active()?await helper.request('applyRunes',{page,context}):await lcu.writeRunePage({page,context,ownedPageId:state.ownedPageId,installPath:state.preferences?.installPath,trees:data.runes});await saveCurrentState(current=>({...current,ownedPageId:result.pageId}));publishWindows('preparation-update',{kind:'runes',revision:++preparationRevision,result,context,page:{primaryStyleId:page.primaryStyleId,subStyleId:page.subStyleId,selectedPerkIds:page.selectedPerkIds}},sender);return result;}
  finally{applyingRunes=false;}
 },true);
 guard('prepare-selection',async(value,{sender})=>{
  if(applyingRunes||importingItemSet)throw Error('客户端配置正在处理，请稍后');
  applyingRunes=true;importingItemSet=true;
  try{
   const service=await import('../services/client-preparation.mjs'),selection=value?.selection===undefined?null:guideCore.validateGuideSelection(value.selection);value=service.validateClientPreparation(value,data);
   if(selection&&(selection.id!==value.champion||selection.role!==value.role||selection.mode!==value.mode))throw Error('准备配置与英雄或位置不一致，请重新点击');
   const result=helper.active()?await helper.request('prepareSelection',{value}):await service.prepareClientSelection({value,data,installPath:state.preferences?.installPath,ownedPageId:state.ownedPageId});
   if(result.steps?.runes?.status==='done')await saveCurrentState(current=>({...current,ownedPageId:result.steps.runes.pageId}));
   await status(true);
   // Loading can destroy the sidebar before its IPC reply. Commit the clicked
   // configuration in main so its guide survives that legitimate transition.
   if(result.complete&&selection&&inGame()&&publicClientGameId(latestClient)===String(value.sessionGameId)){
    const chosen={...selection,...storedPreparation(state.preparations,selection)},next=guideCore.selectGuide(state.guide,chosen);
    next.match={...(next.match||{}),gameId:String(value.sessionGameId),phase:latestClient.phase};await setGuideState(next);guide.publish();await guide.phase(latestClient.phase,latestClient.connected);
   }
   publishWindows('preparation-update',{kind:'selection',revision:++preparationRevision,result,value},sender);return result;
  }finally{applyingRunes=false;importingItemSet=false;}
 },true);
 guard('copy',text=>{clipboard.writeText(String(text).slice(0,20000));return true;});
 guard('import-item-set',async value=>{
  if(importingItemSet)throw Error('装备集正在写入，请稍后');importingItemSet=true;
  try{const itemSet=itemSetCore.validateItemSet(value,data);
   return helper.active()?await helper.request('importItemSet',{itemSet}):await itemSetService.importItemSet({itemSet,data,installPath:state.preferences?.installPath});
  }finally{importingItemSet=false;}
 });
 guard('export-item-set',async value=>{
  const itemSet=itemSetCore.validateItemSet(value,data),selected=await dialog.showSaveDialog(win,{title:'导出当前装备集',defaultPath:itemSet.uid+'.json',filters:[{name:'装备集 JSON',extensions:['json']}]});
  if(selected.canceled)return {exported:false};try{await dataService.atomicJSON(selected.filePath,itemSet,{space:2});}catch{throw Error('未能导出装备集，请选择可写入的位置后重试');}return {exported:true,title:itemSet.title};
 });
 guard('toggle-pin',({window})=>{window.setAlwaysOnTop(!window.isAlwaysOnTop());return window.isAlwaysOnTop();},true);
 guard('choose-directory',async()=>{const result=await dialog.showOpenDialog(win,{title:'选择英雄联盟安装目录',properties:['openDirectory']});return result.canceled?null:result.filePaths[0];});
 guard('open-link',async url=>{
  const parsed=new URL(url);const allowed=['developer.riotgames.com','www.leagueoflegends.com','lol.qq.com','www.communitydragon.org','raw.communitydragon.org','ddragon.leagueoflegends.com','game.gtimg.cn','op.gg','www.reddit.com','reddit.com','www.mobafire.com','mobafire.com','botdiff.lol','github.com'];
  const catalogSources=[...data.catalog.duos,...data.catalog.trios].flatMap(c=>c.sources||[]).map(s=>s.url);
  if(!catalogCore.safeSourceURL(url)||!allowed.includes(parsed.hostname)&&!catalogSources.includes(url))throw new Error('不支持的链接');
  if(parsed.hostname==='github.com'&&!isReleaseNotesUrl(url)&&!catalogSources.includes(url))throw new Error('不支持的链接');await shell.openExternal(parsed.href);return true;
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
  await saveCurrentState(current=>storage.mergeState(current,incoming,data.champions));publishWindows('presentation-update',state.preferences.presentation);guide.publish();companion.sync();return state;
 });
 Menu.setApplicationMenu(null);createWindow();
 try{tray=new Tray(nativeImage.createFromPath(path.join(root,'assets/icon.png')));tray.setToolTip('开黑搭子');tray.setContextMenu(Menu.buildFromTemplate([{label:'打开开黑搭子',click:showMainWindow},{label:'本局指引',click:()=>prepareCurrentGuide().then(()=>guide.show()).catch(()=>guide.show())},{label:'找回指引到当前屏幕',click:()=>prepareCurrentGuide().then(()=>guide.recover()).catch(()=>guide.recover().catch(()=>{}))},{label:'切换指引交互 / 鼠标穿透',click:()=>guide.interact().catch(()=>{})},{label:'退出',click:()=>{quitting=true;app.quit();}}]));tray.on('double-click',showMainWindow);}catch{}
 hotkeyAvailable=globalShortcut.register('Control+Shift+Space',()=>{if(win?.isVisible()&&win.isFocused()){companion?.dismiss();win.hide();}else showMainWindow();});
 guideHotkeyAvailable=globalShortcut.register('Control+Shift+G',()=>guide.toggle());guide.setHotkey(guideHotkeyAvailable);
 guide.setInteractionHotkey(globalShortcut.register('Control+Shift+H',()=>guide.interact().catch(()=>{})));
 statusTimer=setInterval(()=>{if(state.preferences.autoSync!==false)status().catch(()=>{});},1000);
 liveTimer=setInterval(()=>{if(state.preferences.autoLive===false&&latestLive){latestLive=null;guide.publish();}else pollLive().catch(()=>{});},3000);
 if(state.preferences.autoSync!==false)status().catch(()=>{});
 diagnostic(`guide-hotkey-registered ${guideHotkeyAvailable}`);
 try{const {observeWindows}=await import('../services/window-observer.mjs');windowObserver=await observeWindows({root,onSnapshot:value=>{const dip=rect=>rect?{...rect,...screen.screenToDipRect(null,rect)}:null;const clientBounds=dip(value.client),gameBounds=dip(value.game);observedWindows={client:value.client?{pixels:value.client,dip:clientBounds,minimized:value.client.minimized,foreground:value.client.foreground}:null,game:value.game?{pixels:value.game,dip:gameBounds,minimized:value.game.minimized,foreground:value.game.foreground}:null};observedAt=Date.now();mainPeek.sync(true,!!clientBounds?.foreground||!!gameBounds?.foreground);companion.observe(clientBounds);guide.setGameBounds(gameBounds);},onError:message=>{observedWindows=null;observedAt=0;mainPeek.sync(true,false);companion.observe(null);diagnostic(message);}});}catch{diagnostic('window observer unavailable');}
 if(process.argv.includes('--show-guide'))guide.show();
 diagnostic(`hotkey-registered ${hotkeyAvailable}`);
}
if(lock)app.whenReady().then(boot).catch(error=>{diagnostic(`startup error ${error.message}`);dialog.showErrorBox('开黑搭子启动失败',error.message);app.quit();});
app.on('window-all-closed',()=>{if(!tray||quitting)app.quit();});
app.on('will-quit',()=>{mainRelease.cancel();mainPeek.destroy();clearInterval(statusTimer);clearInterval(liveTimer);windowObserver?.stop();companion?.destroy();guide?.destroy();try{roomService?.leave();}catch{}globalShortcut.unregisterAll();});
app.on('before-quit',event=>{
 if(cleanupDone||!helper)return;
 event.preventDefault();if(cleaningUp)return;cleaningUp=true;quitting=true;
 const stopHelper=Promise.race([helper.shutdown(),new Promise(resolve=>setTimeout(resolve,1500))]);
 Promise.allSettled([stopHelper,saveTask]).then(results=>{if(results[1].status==='rejected')diagnostic('settings-save-before-quit failed');}).finally(()=>{cleanupDone=true;app.quit();});
});
