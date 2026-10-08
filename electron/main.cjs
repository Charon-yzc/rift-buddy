const {app,BrowserWindow,ipcMain,Menu,Tray,nativeImage,globalShortcut,clipboard,shell,dialog,session,screen}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..');
function diagnostic(message){if(process.env.RIFT_BUDDY_DIAGNOSTICS)fs.appendFile(process.env.RIFT_BUDDY_DIAGNOSTICS,`${new Date().toISOString()} ${message}\n`).catch(()=>{});}
let win,tray,state,data,storeRoot,dataService,storage,lcu,helper,guide,guideCore,companion,windowObserver,updating=false,quitting=false,applyingRunes=false,cleanupDone=false,cleaningUp=false,hotkeyAvailable=false,guideHotkeyAvailable=false;
let latestClient={connected:false,phase:'Offline',message:'正在检查客户端…'},latestLive=null,statusTask=null,liveTask=null,lastStatus=0,statusTimer,liveTimer,rendererReady=false,pendingBuild=null;
let observedWindows=null,observedAt=0;
let saveTask=Promise.resolve();
function saveCurrentState(){const snapshot=structuredClone(state);saveTask=saveTask.catch(()=>{}).then(()=>storage.saveState(storeRoot,snapshot));return saveTask;}
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
function showMainWindow(){if(!win){if(data)createWindow();}else{if(win.isMinimized())win.restore();win.show();win.focus();}diagnostic(`show-main-window ${!!win?.isVisible()}`);}
app.on('second-instance',(_event,argv)=>{if(argv.includes('--quit')){quitting=true;app.quit();}else if(argv.includes('--show-guide'))guide?.show();else showMainWindow();});
function createWindow(){
 rendererReady=false;
 const area=screen.getPrimaryDisplay().workArea;
 win=new BrowserWindow({width:Math.min(1460,area.width),height:Math.min(980,area.height),minWidth:Math.min(1050,area.width),minHeight:Math.min(720,area.height),backgroundColor:'#10151e',title:'开黑搭子',
  icon:path.join(root,'assets/icon.png'),show:false,autoHideMenuBar:true,
  webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(path.join(root,'src/index.html')).href)event.preventDefault();});
 win.loadFile(path.join(root,'src/index.html'));
 win.once('ready-to-show',()=>{if(latestClient.connected&&['GameStart','InProgress','Reconnect'].includes(latestClient.phase))win.hide();else if(companion?.layout().docked||latestClient.phase==='ChampSelect'&&state.preferences.clientCompanion!==false)win.showInactive();else win.show();companion?.sync();diagnostic(`ready-to-show visible=${win.isVisible()} bounds=${JSON.stringify(win.getBounds())}`);});
 win.webContents.on('did-fail-load',(_e,code,desc)=>diagnostic(`load failed ${code} ${desc}`));
 win.webContents.on('render-process-gone',(_e,detail)=>diagnostic(`renderer gone ${detail.reason}`));
 win.webContents.on('did-finish-load',async()=>{
  diagnostic('did-finish-load');
  if(process.env.RIFT_BUDDY_SCREENSHOT){setTimeout(async()=>{try{const image=await win.webContents.capturePage();await fs.writeFile(process.env.RIFT_BUDDY_SCREENSHOT,image.toPNG());diagnostic('screenshot saved');}catch(e){diagnostic(e.message);}},2200);}
 });
 win.on('close',()=>{companion?.dismiss();});
 win.on('closed',()=>{win=null;});
}
const guard=(name,handler)=>ipcMain.handle(name,async(event,...args)=>{
 if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('不允许此操作');
 return handler(...args);
});
async function boot(){
 diagnostic('boot');
 [dataService,storage,lcu]=await Promise.all([import('../services/data.mjs'),import('../services/storage.mjs'),import('../services/lcu.mjs')]);
 guideCore=await import('../src/core/guide.mjs');
 storeRoot=app.getPath('userData');state=await storage.readState(storeRoot);
 // A saved legacy ball must not trap the upgraded app in an icon-only view.
 if(state.guide?.ball){state.guide={...state.guide,ball:false,collapsed:false};await saveCurrentState();}
 const {createHelperManager}=await import('../services/client-helper.mjs');
 const helperRoot=path.join(process.resourcesPath,'connection');
 helper=createHelperManager({userData:storeRoot,bundleRoot:root,executable:process.execPath,isPackaged:app.isPackaged,
  ...(app.isPackaged?{helperExecutable:path.join(helperRoot,'node.exe'),helperEntry:path.join(helperRoot,'electron/client-helper-entry.mjs'),helperBundleRoot:helperRoot,launcherExecutable:path.join(helperRoot,'connection-launcher.exe')}:{}) ,
  onProgress:message=>win?.webContents.send('client-update',{connected:false,connecting:true,phase:'Offline',message})});
 data=await dataService.loadSnapshot(path.join(storeRoot,'data'),path.join(root,'data'));
 if(state.guide&&!data.champions.some(c=>c.id===state.guide.selection?.id)){state.guide=null;await saveCurrentState();}
 const catalogCore=await import('../src/core/catalog.mjs');
 const {createCatalogStore}=await import('../services/catalog-store.mjs');
 const catalogStore=await createCatalogStore({root:storeRoot,getData:()=>data});
 const useCatalog=result=>{data.catalog=catalogCore.configureCatalog(result.catalog);data.catalogInfo=result.info;guide?.publish();return result;};
 useCatalog(catalogStore.summary());
 const {loadBuildSources,loadHexBuilds,createBuildCache}=await import('../services/build-cache.mjs');
 const {selectBuildSource,buildSourcePendingKey,normalizeBuildSource}=await import('../src/core/build-source.mjs');
 data.buildSources=await loadBuildSources([path.join(root,'data'),path.join(storeRoot,'data')],data);
 selectBuildSource(data,state.preferences.buildSource);
 // A mismatched spell book must never be used silently (same gate as update-data).
 try{
  const spellsFile=JSON.parse(await fs.readFile(path.join(root,'data/spells.json'),'utf8'));
  data.spellbook=spellsFile.version===data.version?(spellsFile.champions||{}):{};
  if(spellsFile.version!==data.version)diagnostic(`spellbook ${spellsFile.version} != game ${data.version} at boot; estimates use heuristics`);
 }catch{data.spellbook={};}
 data.hexBuilds=await loadHexBuilds([path.join(root,'data'),path.join(storeRoot,'data')],data);
 const imageCache=await import('../services/image-cache.mjs');
 data.imageOverrides=await imageCache.loadImageOverrides(path.join(storeRoot,'data/images'),data);
 const refreshBuild=createBuildCache({root:path.join(storeRoot,'data'),getData:()=>data});
 const liveService=await import('../services/live-client.mjs');
 const {changePresentation}=await import('../src/core/presentation.mjs');
 const setPresentation=async change=>{state.preferences.presentation=changePresentation(state.preferences.presentation,change);await saveCurrentState();win?.webContents.send('presentation-update',state.preferences.presentation);guide?.publish();return state.preferences.presentation;};
 const guideRefresh=new Map(),guideRefreshKey=s=>s&&buildSourcePendingKey(data.patch,s.id,s.mode==='hex'?'hex':s.role,data.buildSource);
 const getGuideModel=()=>{const m=guideCore.createGuideModel(data,state.guide,state.preferences.autoLive===false?{available:false,reason:'局内装备读取已关闭，可手动标记'}:latestLive,currentGuideSelection());if(m){const progress=guideRefresh.get(guideRefreshKey(m.selection));if(progress)m.status.build=progress.pending?'当前配置正在刷新':progress.error?'配置刷新未完成：'+progress.error:m.status.build;}return m;};
 const recommendationCore=await import('../src/core/recommend.mjs');
 const {mergeConfiguration}=await import('../src/core/preparation.mjs');let guideRevision=0;
 const {isFreshBuildReference}=await import('../src/core/builds.mjs');
 const {createCurrentGameTracker}=await import('../src/core/game-context.mjs');const currentGame=createCurrentGameTracker();
 const currentGuideSelection=()=>{
  const own=currentGame.current(latestClient,latestLive,data.champions,state.draft?.slots||[]);if(!own)return null;
  const prepared=state.guide?.selection;if(!own.positionKnown){if(state.draft?.scope==='solo'&&state.draft.soloRole)own.role=state.draft.soloRole;else if(prepared?.id===own.id&&prepared.mode===own.mode)own.role=prepared.role;}
  const combo=own.mode==='rift'?recommendationCore.currentCombo(state.draft?.slots||[],own.id,own.role,data.catalogInfo?.status):null;
  const prior=state.guide?.selection,same=prior&&guideCore.guideIdentity(prior)===guideCore.guideIdentity(own),comboKnown=!!combo||own.mode!=='rift'||recommendationCore.comboContextKnown(state.draft?.slots||[],own.id,own.role,same?prior.comboId:null);
  return {...own,name:data.champions.find(c=>c.id===own.id)?.name,comboKnown,coreIndex:0,conditions:[],...(combo?{comboId:combo.id}:{})};
 };
 const setGuideState=async next=>{const valid=guideCore.validateGuideState(next);if(valid)valid.completedItems=guideCore.createGuideModel(data,valid).completedItems;state.guide=valid;const revision=++guideRevision;await saveCurrentState();win?.webContents.send('guide-selection',valid?.selection||null,{revision});};
 const prepareCurrentGuide=async()=>{const own=currentGuideSelection();if(!own)return false;if(!state.guide||guideCore.guideIdentity(state.guide.selection)!==guideCore.guideIdentity(own)||own.comboKnown&&(state.guide.selection.comboId||'')!==(own.comboId||'')){const next=guideCore.selectGuide(state.guide,own);if(latestClient.connected)next.match={phase:latestClient.phase,...(latestClient.game?.gameId?{gameId:latestClient.game.gameId}:{})};await setGuideState(next);}return true;};
 const refreshPreparedBuild=()=>{
  const s=state.guide?.selection;if(!s||s.mode!=='hex'||state.preferences.autoCheck===false)return;
  const role=s.mode==='hex'?'hex':s.role,key=guideRefreshKey(s),ref=s.mode==='hex'?data.hexBuilds?.[s.id]:data.builds?.[s.id+':'+s.role];
  if(isFreshBuildReference(ref,data.patch,s.mode)||guideRefresh.get(key)?.pending)return;
  guideRefresh.set(key,{pending:true});guide.publish();
  refreshBuild(s.id,role).then(()=>guideRefresh.set(key,{pending:false})).catch(error=>guideRefresh.set(key,{pending:false,error:error.message})).finally(()=>guide.publish());
 };
 guide=require('./guide-window.cjs')({root,getState:()=>state.guide,getModel:getGuideModel,isQuitting:()=>quitting,diagnostic,
  currentSelection:currentGuideSelection,prepareCurrent:prepareCurrentGuide,setState:setGuideState,getPreferences:()=>state.preferences,setPresentation,
  showMain:selection=>{if(selection)pendingBuild=selection;showMainWindow();if(rendererReady&&pendingBuild){win.webContents.send('open-build',pendingBuild);pendingBuild=null;}}});
 diagnostic(`loaded data ${data.version}`);
 session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 const placement=await import('../src/core/window-placement.mjs');
 companion=require('./client-companion.cjs')({getWindow:()=>win,createWindow,getClient:()=>latestClient,getPreferences:()=>state.preferences,placement,diagnostic});
 guard('presentation',setPresentation);
 guard('bootstrap',()=>({data,state,client:latestClient,windowLayout:companion.layout(),desktop:true,version:app.getVersion(),dataPath:storeRoot,hotkeyAvailable,guideHotkeyAvailable}));
 const {windowInfo}=await import('../services/window-info.mjs');
 guard('window-info',()=>windowInfo({version:app.getVersion(),dataVersion:data.version,displays:screen.getAllDisplays(),primaryDisplayId:screen.getPrimaryDisplay().id,client:latestClient,companion:companion.layout(),main:win&&!win.isDestroyed()?{bounds:win.getBounds(),visible:win.isVisible(),minimized:win.isMinimized()}:null,guide:guide.windowInfo(),observedAt,observedClient:observedWindows?.client,observedGame:observedWindows?.game}));
 guard('companion-mode',value=>{if(typeof value!=='boolean')throw Error('窗口模式格式不正确');return companion.setMode(value);});
 guard('recover-guide',async()=>{await prepareCurrentGuide();await pollLive(true);return guide.recover();});
 guard('catalog-source',url=>catalogStore.setSource(url).then(useCatalog));
 guard('catalog-check',()=>catalogStore.check());
 guard('catalog-preview',async raw=>{if(raw!==undefined){if(typeof raw!=='string'||raw.length>catalogCore.CATALOG_LIMIT)throw Error('组合库内容超过限制');return catalogStore.preview(JSON.parse(raw));}
  const selected=await dialog.showOpenDialog(win,{title:'选择组合库数据包',properties:['openFile'],filters:[{name:'组合库 JSON',extensions:['json']}]});return selected.canceled?null:catalogStore.previewFile(selected.filePaths[0]);});
 guard('catalog-apply',token=>catalogStore.apply(token).then(useCatalog));
 guard('catalog-rollback',()=>catalogStore.rollback().then(useCatalog));
 guard('catalog-personal',entry=>catalogStore.savePersonal(entry).then(useCatalog));
 guard('catalog-export',async()=>{const selected=await dialog.showSaveDialog(win,{title:'导出完整组合库',defaultPath:`开黑搭子-组合库-${data.catalog.version}.json`,filters:[{name:'组合库 JSON',extensions:['json']}]});if(selected.canceled)return false;await fs.writeFile(selected.filePath,JSON.stringify(catalogStore.export(),null,2),'utf8');return true;});
 guard('main-ready',()=>{rendererReady=true;if(pendingBuild){win.webContents.send('open-build',pendingBuild);pendingBuild=null;}return true;});
 guard('save-state',async next=>{
  next=storage.validateState(next);
  // The renderer cannot claim ownership of existing user rune pages.
  state={...next,preferences:{...next.preferences,presentation:state.preferences.presentation},ownedPageId:state.ownedPageId,guide:state.guide};selectBuildSource(data,state.preferences.buildSource);if(state.preferences.autoLive===false)latestLive=null;await saveCurrentState();guide.publish();companion.sync();return true;
 });
 const {createClientSync}=await import('../src/core/async-tasks.mjs');
 const status=createClientSync(async(force=false)=>{
  if(!force&&Date.now()-lastStatus<(latestClient.connected?(latestClient.phase==='ChampSelect'?2000:6000):30000))return latestClient;
  statusTask=(async()=>{const previousPhase=latestClient.phase,previousGame=latestClient.game?.gameId;try{latestClient=await helper.status(state.preferences?.installPath);}catch{latestClient={connected:false,phase:'Offline',message:'连接暂不可用，手动选人可用'};}
   lastStatus=Date.now();if(latestClient.connected&&(!['InProgress','Reconnect'].includes(latestClient.phase)||previousGame&&latestClient.game?.gameId&&previousGame!==latestClient.game.gameId))latestLive=null;
   currentGame.observe(latestClient,data.champions,state.draft?.slots||[]);
   if(latestClient.connected&&latestClient.phase==='ChampSelect')await prepareCurrentGuide();
   const reconciled=guideCore.reconcileGuide(state.guide,{phase:latestClient.phase,gameId:latestClient.game?.gameId});state.guide=reconciled.guide;if(reconciled.changed)await saveCurrentState();
   if(state.preferences.guideAutoShow!==false&&latestClient.connected&&latestClient.phase==='InProgress'&&(guide.needsAutoShow()||!['InProgress','Reconnect'].includes(previousPhase)||latestClient.game?.gameId&&latestClient.game.gameId!==previousGame))await pollLive(true);
   try{await guide.phase(latestClient.phase,latestClient.connected);}catch(error){diagnostic(`guide phase failed ${error.message}`);}
   companion.sync();
   win?.webContents.send('client-update',latestClient);return latestClient;})().finally(()=>statusTask=null);
  return statusTask;
 });
 const pollLive=async(force=false)=>{
  if(liveTask){await liveTask;if(!force)return;}
  if(!force&&!guide.window()?.isVisible()&&!guide.needsAutoShow()||state.preferences.autoLive===false)return;
  const context=JSON.stringify([latestClient.phase,latestClient.game?.gameId]);
  liveTask=liveService.liveSnapshot(data.champions,latestClient.game||{}).then(async result=>{if(state.preferences.autoLive!==false&&(force||guide.window()?.isVisible()||guide.needsAutoShow())&&context===JSON.stringify([latestClient.phase,latestClient.game?.gameId])){latestLive=result;await prepareCurrentGuide();const reconciled=guideCore.reconcileGuide(state.guide,{phase:latestClient.phase,gameId:latestClient.game?.gameId,live:result});state.guide=reconciled.guide;if(reconciled.changed)await saveCurrentState();guide.publish();if(guide.needsAutoShow())await guide.phase(latestClient.phase,latestClient.connected);}}).finally(()=>liveTask=null);await liveTask;
 };
 guard('client-status',status);
 guard('authorize-client',async()=>{await helper.ensure(state.preferences?.installPath);return status(true);});
 guard('refresh-build',async(id,role,source)=>{const selected=source===undefined?normalizeBuildSource(data.buildSource):source,key=buildSourcePendingKey(data.patch,id,role,selected),result=await refreshBuild(id,role,selected);guideRefresh.set(key,{pending:false});guide.publish();return result;});
 guard('open-guide',async selection=>{if(selection){const previous=guideCore.reconcileGuide(state.guide,{phase:latestClient.phase,gameId:latestClient.game?.gameId,live:latestLive}).guide,next=guideCore.selectGuide(previous,selection);if(!next.match&&latestClient.connected)next.match={phase:latestClient.phase,...(latestClient.game?.gameId?{gameId:latestClient.game.gameId}:{})};await setGuideState(next);}else await prepareCurrentGuide();const result=guide.show();pollLive();return result;});
 guard('update-guide',async selection=>{const s=guideCore.validateGuideSelection(selection);if(!state.guide||guideCore.guideIdentity(state.guide.selection)!==guideCore.guideIdentity(s))return {updated:false};await setGuideState(guideCore.selectGuide(state.guide,mergeConfiguration(state.guide.selection,s,Array.isArray(selection.changedFields)?selection.changedFields:undefined)));guide.publish();return {updated:true,selection:state.guide.selection};});
 guard('update-data',async()=>{
  if(updating)throw new Error('资料更新正在进行');updating=true;
  try{const next=await dataService.collectSnapshot(msg=>win?.webContents.send('data-progress',msg),data);
   if(!next.augments.length&&data.augments.length){next.augments=data.augments;next.augmentVersion=data.augmentVersion||data.version;next.sources.augments=data.sources.augments;}
   delete next.builds;delete next.buildSources;delete next.buildSource;delete next.hexBuilds;delete next.imageOverrides;delete next.catalog;delete next.catalogInfo;if(!dataService.validSnapshot(next))throw Error('新资料不完整，已保留原数据');await dataService.atomicJSON(path.join(storeRoot,'data/game.json'),next);
   next.buildSources=await loadBuildSources([path.join(root,'data'),path.join(storeRoot,'data')],next);selectBuildSource(next,state.preferences.buildSource);
   next.hexBuilds=await loadHexBuilds([path.join(root,'data'),path.join(storeRoot,'data')],next);
   // The spell book is versioned separately: a mismatched book must never be
   // used silently, so it falls back to empty (heuristic estimates + UI note).
   try{
    const spellsFile=JSON.parse(await fs.readFile(path.join(root,'data/spells.json'),'utf8'));
    next.spellbook=spellsFile.version===next.version?(spellsFile.champions||{}):{};
    if(spellsFile.version!==next.version)diagnostic(`spellbook ${spellsFile.version} != game ${next.version}; estimates use heuristics until pnpm spells:enrich runs`);
   }catch{next.spellbook={};}
   const cached=await imageCache.cacheMissingImages({root:path.join(storeRoot,'data/images'),bundleRoot:path.join(root,'data/images'),data:next,progress:message=>win?.webContents.send('data-progress',message)});
   next.imageOverrides=cached.overrides;data=next;useCatalog(catalogStore.summary());guide.publish();refreshPreparedBuild();return {data,imageCache:{saved:cached.saved,failed:cached.failed}};
  }finally{updating=false;}
 });
 guard('apply-runes',async page=>{
  if(applyingRunes)throw new Error('符文正在应用，请稍后');applyingRunes=true;
   try{const result=helper.active()?await helper.request('applyRunes',{page}):await lcu.writeRunePage({page,ownedPageId:state.ownedPageId,installPath:state.preferences?.installPath,trees:data.runes});state.ownedPageId=result.pageId;await saveCurrentState();return result;}
  finally{applyingRunes=false;}
 });
 guard('copy',text=>{clipboard.writeText(String(text).slice(0,20000));return true;});
 guard('toggle-pin',()=>{win.setAlwaysOnTop(!win.isAlwaysOnTop());return win.isAlwaysOnTop();});
 guard('choose-directory',async()=>{const result=await dialog.showOpenDialog(win,{title:'选择英雄联盟安装目录',properties:['openDirectory']});return result.canceled?null:result.filePaths[0];});
 guard('open-link',async url=>{
  const parsed=new URL(url);const allowed=['developer.riotgames.com','www.leagueoflegends.com','lol.qq.com','www.communitydragon.org','raw.communitydragon.org','ddragon.leagueoflegends.com','game.gtimg.cn','op.gg','www.reddit.com','reddit.com','www.mobafire.com','mobafire.com','botdiff.lol'];
  const catalogSources=[...data.catalog.duos,...data.catalog.trios].flatMap(c=>c.sources||[]).map(s=>s.url);
  if(!catalogCore.safeSourceURL(url)||!allowed.includes(parsed.hostname)&&!catalogSources.includes(url))throw new Error('不支持的链接');await shell.openExternal(parsed.href);return true;
 });
 guard('export-state',async()=>{const result=await dialog.showSaveDialog(win,{title:'备份收藏与偏好',defaultPath:'开黑搭子-备份.json',filters:[{name:'JSON',extensions:['json']}]});if(result.canceled)return false;
  const exported={...state,ownedPageId:null,preferences:{...state.preferences,installPath:''}};await fs.writeFile(result.filePath,JSON.stringify(exported,null,2),'utf8');return true;});
 guard('import-state',async()=>{const result=await dialog.showOpenDialog(win,{title:'导入收藏与偏好',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(result.canceled)return null;
  const stat=await fs.stat(result.filePaths[0]);if(stat.size>1_000_000)throw new Error('备份文件过大');
  const incoming=JSON.parse(await fs.readFile(result.filePaths[0],'utf8'));
  state=storage.mergeState(state,incoming,data.champions);selectBuildSource(data,state.preferences.buildSource);await saveCurrentState();win?.webContents.send('presentation-update',state.preferences.presentation);guide.publish();companion.sync();return state;
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
 try{const {observeWindows}=await import('../services/window-observer.mjs');windowObserver=await observeWindows({root,onSnapshot:value=>{const dip=rect=>rect?{...rect,...screen.screenToDipRect(null,rect)}:null;const clientBounds=dip(value.client),gameBounds=dip(value.game);observedWindows={client:value.client?{pixels:value.client,dip:clientBounds,minimized:value.client.minimized,foreground:value.client.foreground}:null,game:value.game?{pixels:value.game,dip:gameBounds,minimized:value.game.minimized,foreground:value.game.foreground}:null};observedAt=Date.now();companion.observe(clientBounds);guide.setGameBounds(gameBounds);},onError:message=>{observedWindows=null;observedAt=0;companion.observe(null);companion.setMode(false);diagnostic(message);}});}catch{diagnostic('window observer unavailable');}
 if(process.argv.includes('--show-guide'))guide.show();
 diagnostic(`hotkey-registered ${hotkeyAvailable}`);
}
if(lock)app.whenReady().then(boot).catch(error=>{diagnostic(`startup error ${error.message}`);dialog.showErrorBox('开黑搭子启动失败',error.message);app.quit();});
app.on('window-all-closed',()=>{if(!tray||quitting)app.quit();});
app.on('will-quit',()=>{clearInterval(statusTimer);clearInterval(liveTimer);windowObserver?.stop();companion?.destroy();guide?.destroy();globalShortcut.unregisterAll();});
app.on('before-quit',event=>{
 if(cleanupDone||!helper)return;
 event.preventDefault();if(cleaningUp)return;cleaningUp=true;quitting=true;
 Promise.race([helper.shutdown(),new Promise(resolve=>setTimeout(resolve,1500))]).finally(()=>{cleanupDone=true;app.quit();});
});
