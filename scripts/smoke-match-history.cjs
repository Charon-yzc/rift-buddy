const {app,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),http=require('node:http'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],writes=[],errors=[];let main,offline=false,clientPhase='Lobby';
app.setPath('userData',root);globalShortcut.register=()=>false;
app.on('browser-window-created',(_event,window)=>{windows.push(window);window.show=()=>{};window.showInactive=()=>{};window.focus=()=>{};window.webContents.setBackgroundThrottling(false);window.webContents.on('console-message',(_event,_level,message)=>{if(typeof message==='string'&&/TypeError|ReferenceError|SyntaxError/.test(message))errors.push(message);});});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
global.fetch=async()=>{throw Error('External network disabled');};http.request=()=>{throw Error('Real network forbidden');};
const own={puuid:'fixture-own-player-0001',summonerId:1,gameName:'战绩测试玩家',tagLine:'TEST',summonerLevel:100},friend={puuid:'fixture-friend-player-2',summonerId:2,gameName:'示例队友',tagLine:'TEST'};
function game(id){const identities=[own,friend,...Array.from({length:8},(_,i)=>({puuid:'fixture-public-player-'+(i+3),gameName:'模拟玩家'+(i+3),tagLine:'TEST'}))];return {gameId:id,gameCreation:Date.now()-id*3600000,gameDuration:1800,gameMode:'CLASSIC',gameType:'MATCHED_GAME',gameVersion:'16.20',queueId:420,mapId:11,teams:[],participantIdentities:identities.map((p,i)=>({participantId:i+1,player:p})),participants:identities.map((p,i)=>({participantId:i+1,championId:[22,412,99,86,64,103,51,89,122,17][i],teamId:i<5?100:200,spell1Id:4,spell2Id:7,stats:{kills:8,deaths:2,assists:10,win:i<5?id%2===1:id%2===0,totalDamageDealtToChampions:25000,totalDamageTaken:15000,goldEarned:12000,totalMinionsKilled:140,neutralMinionsKilled:20,totalHeal:2000,visionScore:30,champLevel:16,item0:3006,item1:3031,perk0:8005,perkPrimaryStyle:8000,perkSubStyle:8100}}))};}
const output=options=>{assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);const route=options.path,method=options.method||'GET';if(offline)throw Error('fixture offline');
 if(route==='/lol-summoner/v1/current-summoner')return own;
 if(route==='/riotclient/region-locale')return {region:'unconfigured-fixture'};
 if(route==='/lol-gameflow/v1/gameflow-phase')return clientPhase;
 if(route==='/lol-lobby/v2/lobby')return {members:[own,friend],gameConfig:{queueId:420}};
 if(route==='/lol-gameflow/v1/session'){const g=game(100),player=p=>({...g.participantIdentities.find(v=>v.participantId===p.participantId).player,championId:p.championId,spell1Id:p.spell1Id,spell2Id:p.spell2Id,selectedPosition:p.participantId===1?'BOTTOM':p.participantId===2?'UTILITY':'MIDDLE',selectedRole:'BOTTOM.PRIMARY.BOTTOM.UTILITY.NONE'});return {map:{id:11,gameMode:'CLASSIC'},gameData:{gameId:100,queue:{id:420,gameMode:'CLASSIC'},teamOne:g.participants.slice(0,5).map(player),teamTwo:g.participants.slice(5).map(player)}};}
 if(route==='/lol-champ-select/v1/session')return {gameId:100,localPlayerCellId:0,myTeam:[{...own,cellId:0,championId:22,assignedPosition:'BOTTOM'},{...friend,cellId:1,championId:412,assignedPosition:'UTILITY'}],theirTeam:[{cellId:5,nameVisibilityType:'HIDDEN',championId:99}]};
 if(route==='/lol-summoner/v1/summoner-profile?puuid='+own.puuid||route==='/lol-summoner/v1/summoner-profile?puuid='+friend.puuid)return {backgroundSkinId:22000,regalia:'fixture'};
 if(route.startsWith('/lol-summoner/v2/'))return route.endsWith(friend.puuid)?friend:own;
 if(route==='/lol-summoner/v1/summoners/aliases')return [friend];
 if(route.startsWith('/lol-summoner/v1/summoners?name='))return friend;
 if(route.includes('/matches?')){const q=new URLSearchParams(route.split('?')[1]),start=Number(q.get('begIndex')),count=Number(q.get('endIndex'))-start+1;return {games:{games:Array.from({length:start===0?count:3},(_,i)=>game(start+i+1))}};}
 if(route.startsWith('/lol-match-history/v1/games/'))return game(Number(route.split('/').at(-1)));
 if(route.includes('/game-timelines/'))return {frames:[{timestamp:60000,participantFrames:{1:{participantId:1,totalGold:600,currentGold:200,minionsKilled:6,jungleMinionsKilled:0,level:2,xp:300}},events:[{type:'ITEM_PURCHASED',timestamp:20000,participantId:1,itemId:1001},{type:'SKILL_LEVEL_UP',timestamp:0,participantId:1,skillSlot:1},{type:'CHAMPION_KILL',timestamp:50000,killerId:1,victimId:2}]}]};
 if(route.startsWith('/lol-ranked/'))return {queues:[{queueType:'RANKED_SOLO_5x5',tier:'GOLD',division:'I',leaguePoints:40,wins:30,losses:20}]};
 if(route.startsWith('/lol-champion-mastery/'))return [{championId:22,championLevel:10,championPoints:100000}];
 if(route.includes('/rofls/')&&method==='POST'){writes.push(route);return {};}
 if(route.includes('/metadata/'))return {state:'readyToWatch',downloadProgress:100};
 throw Error('Unexpected fixture route');
};
https.request=(options,callback)=>{assert.equal(typeof options,'object','External URL request forbidden');const req=new EventEmitter();req.write=body=>options.body=body;req.end=()=>queueMicrotask(()=>{try{const value=output(options),res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(value)));res.emit('end');}catch(error){req.emit('error',error);}});req.destroy=error=>{if(error)req.emit('error',error);};return req;};
cp.spawn=()=>{const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
cp.execFile=(file,args,options,callback)=>{queueMicrotask(()=>(typeof options==='function'?options:callback)?.(null,'',''));return new EventEmitter();};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<120;n++){if(await check())return;await delay(80);}throw Error(label);}
async function run(){
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?null:JSON.parse(await fs.readFile('release/latest.json')),base=source?process.cwd():path.join(release.directory,'resources/app.asar');
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;require(path.join(base,'electron/main.cjs'));
 await until(()=>{main=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main window missing');
  const js=code=>main.webContents.executeJavaScript(code,true),click=selector=>until(()=>js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el||el.disabled)return false;el.click();return true;})()'),'Control missing '+selector),capture=async name=>{await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(root,name),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
  // Recorded only after the matching assertion ran, so the artifact cannot
  // claim a page behaviour that was never checked.
  let compactRows=false,sixTabs=false,hoverDetails=false,keyboardTabs=false,ongoingCards=false,ongoingHover=false;
 await click('[data-action=navigate][data-route=history]');assert.equal(await js('!!document.querySelector("#history-search")'),true);
 // A live-data render can replace a hovered node during its dwell timer.
 // Re-enter only its replacement, as native pointer targeting would; never
 // restart the timer for a stable target or bypass the real hover handler.
 const hover=async(selector,label)=>{await js('window.__historySmokeHoverTarget=null');await until(()=>js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;if(window.__historySmokeHoverTarget!==el){window.__historySmokeHoverTarget=el;(el.querySelector('img')||el).dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));}const tip=document.querySelector('#history-hover-detail');return !!(tip&&tip.matches(':popover-open')&&el.getAttribute('aria-describedby')==='history-hover-detail');})()`),label);};
 const hoverText=()=>js('document.querySelector("#history-hover-detail")?.textContent||""');
 const originalTheme=await js('document.documentElement.dataset.theme');
 const chooseTheme=async theme=>{await click('[data-action=theme-open]');await click(`[data-action=presentation][data-field=theme][data-value="${theme}"]`);await until(()=>js(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`),'Theme did not apply');await click('[aria-label=配色] [data-action=close]');};
 const readable=async selectors=>{
  const samples=await js(`(()=>{const ctx=document.createElement('canvas').getContext('2d'),rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);},over=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3])),lum=color=>color.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);return [...document.querySelectorAll(${JSON.stringify(selectors)})].filter(el=>el.textContent.trim()&&el.getBoundingClientRect().width>0).map(el=>{const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);let bg=rgba(getComputedStyle(document.documentElement).getPropertyValue('--rb-bg')).slice(0,3);for(const p of chain)bg=over(rgba(getComputedStyle(p).backgroundColor),bg);const fg=lum(over(rgba(getComputedStyle(el).color),bg)),background=lum(bg);return {selector:el.className||el.tagName,ratio:(Math.max(background,fg)+.05)/(Math.min(background,fg)+.05)};});})()`);
  assert(samples.length>0,'No actual text sampled');assert(samples.every(s=>s.ratio>=4.5),'Theme text contrast: '+JSON.stringify(samples.filter(s=>s.ratio<4.5)));
 };
 const readableControlHover=async(selector,name)=>{
  const point=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  main.webContents.sendInputEvent({type:'mouseMove',...point});
  await until(()=>js(`document.querySelector(${JSON.stringify(selector)}).matches(':hover')`),'Control did not enter real hover: '+selector);
  await delay(200);await readable(selector);await capture(name);main.webContents.sendInputEvent({type:'mouseMove',x:0,y:0});
 };
 await click('[data-action=history-self]');await until(()=>js('document.querySelectorAll(".history-match").length===20&&!document.querySelector(".history-loading")'),'History page missing');
  assert.match(await js('document.querySelector(".history-profile").textContent'),/战绩测试玩家/);assert.equal(writes.length,0);
 for(const close of ['button','escape','backdrop']){
  await js('(()=>{document.querySelector("#history-query").value="示例";document.querySelector("#history-search").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));})()');
  await until(()=>js('!!document.querySelector("[aria-label=玩家搜索结果]")'),'Search results missing');
  if(close==='button')await click('[aria-label=玩家搜索结果] [data-action=close]');
  else if(close==='escape')await js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  else await js('document.querySelector(".modal-backdrop").click()');
  await click('[data-action=history-tab][data-id="1"]');await click('[data-action=history-refresh]');
  await until(()=>js('!document.querySelector(".history-loading")'),'History refresh missing after closing search');
  assert.equal(await js('!!document.querySelector("[aria-label=玩家搜索结果]")'),false,'Closed search must stay closed: '+close);
 }
  await until(()=>js('[...document.querySelectorAll(".history-loadout img[src*=SummonerFlash]")].some(img=>img.complete&&img.naturalWidth>0)'),'Offline history spell icon did not load');
  await click('[data-action=history-detail][data-id="1"]');await until(()=>js('!!document.querySelector(".history-player")&&!document.querySelector(".history-details [role=status]")'),'Detail missing');
  // Consume the resize before starting the 180ms pointer-hover timer; resize
  // intentionally closes existing popovers and cancels a pending hover.
  const resized=main.getSize()[0]!==1460||main.getSize()[1]!==980;
  if(resized){await js('window.__historyResize=new Promise(resolve=>addEventListener("resize",()=>resolve(true),{once:true}));true');main.setSize(1460,980);await js('window.__historyResize');}
  // Hidden test windows do not receive native focus events. Exercise the same
  // delegated pointer entry used by a visible window without stealing focus.
  await hover('.history-details [data-history-tip=item]','Equipment hover detail missing');assert.match(await hoverText(),/基础 \d+ 金 · 出售/);
  assert.equal(await js('!!document.querySelector("#game-tooltip:popover-open")'),false,'A historical item image must open only its contextual detail');
  assert.equal(await js('(()=>{const img=document.querySelector("#history-hover-detail img");if(!img)return false;img.dispatchEvent(new PointerEvent("pointerover",{bubbles:true}));return true;})()'),true,'Contextual item detail icon missing');await delay(160);
  assert.equal(await js('!!document.querySelector("#game-tooltip:popover-open")'),false,'Hovering inside the contextual detail must not stack another tooltip');
  assert.equal(await js('(()=>{const r=document.querySelector("#history-hover-detail").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()'),true,'Equipment hover escapes viewport');
  const visualRoot=root;await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(visualRoot,'history-expanded-equipment.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  for(const theme of ['daylight',originalTheme]){
   await chooseTheme(theme);await hover('.history-details [data-history-tip=item]','Themed equipment hover missing');
   await readable('.history-profile-identity h2,.history-kda strong,.history-card-damage strong,.history-hover-cost,.history-hover-description,.history-hover-record,.history-page .muted,.history-page .btn.quiet:not(:disabled),.history-detail-tabs .btn:not(:disabled)');
   await capture('history-theme-'+theme+'.png');await js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
   await readableControlHover('[data-action=history-self]','history-control-hover-'+theme+'.png');
  }
  await js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');assert.equal(await js('!!document.querySelector("#history-hover-detail")'),false);
  // Leaving the target must also close the layer, not only Escape.
  await hover('.history-details [data-history-tip=item]','Equipment hover did not reopen');await js('document.querySelector(".history-details [data-history-tip=item]").dispatchEvent(new PointerEvent("pointerout",{bubbles:true,relatedTarget:document.body}))');await until(()=>js('!document.querySelector("#history-hover-detail")'),'Hover detail did not close on pointer leave');
  assert.equal(await js('document.querySelectorAll(".history-detail-tabs [role=tab]").length'),6);assert.ok(await js('document.querySelector(".history-team-table tbody tr").getBoundingClientRect().height')<=58,'Team rows are not compact');sixTabs=true;compactRows=true;
  await click('[data-action=history-detail][data-section=stats]');await until(()=>js('!!document.querySelector(".history-public-matrix")'),'Full statistics matrix missing');
  await hover('.history-public-matrix [data-history-tip=text]','Statistics hover missing');assert.match(await hoverText(),/未提供的值不作为零/);await js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  await js('(()=>{const input=document.querySelector("[data-chart-field=rawStatsQuery]");input.focus();input.value="gold";input.dispatchEvent(new Event("input",{bubbles:true}));})()');assert.equal(await js('document.activeElement.dataset.chartField'),'rawStatsQuery');assert.equal(await js('[...document.querySelectorAll("[data-public-stat]")].every(row=>row.dataset.publicStat.toLowerCase().includes("gold"))'),true);
  await click('[data-action=history-detail][data-section=runes]');assert.ok(await js('document.querySelectorAll(".history-runes").length')>0);
  await hover('.history-runes [data-history-tip=rune]','Rune hover missing');assert.match(await hoverText(),/强攻|符文/);await js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  await click('[data-action=history-detail][data-section=builds]');await until(()=>js('!!document.querySelector(".history-skills span")'),'Build events missing');
  await hover('.history-build [data-history-tip=item]','Build item hover missing');assert.match(await hoverText(),/基础 \d+ 金 · 出售/);await js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
 await click('[data-action=history-detail][data-section=timeline]');await until(()=>js('!!document.querySelector(".history-chart")'),'Timeline missing');
 await js('(()=>{const select=document.querySelector("[data-chart-field=chartMetric]");select.value="cs";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
  assert.equal(await js('document.querySelector("[data-chart-field=chartMetric]").value'),'cs');
  // Timeline samples keep a native title; the多-point tooltip layer is only for
  // rows and cells, so the chart is not a tab-stop maze.
  assert.match(await js('document.querySelector(".history-chart circle title")?.textContent||""'),/：|:/);
  await click('[data-action=history-detail][data-section=events]');await until(()=>js('!!document.querySelector(".history-event")'),'Event details missing');
  await hover('.history-event [data-history-tip=text]','Event hover missing');assert.match(await hoverText(),/助攻/);await js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');hoverDetails=true;
  await js('document.querySelector("[data-section=events]").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))');await until(()=>js('document.querySelector("[data-section=builds]")?.getAttribute("aria-selected")==="true"'),'Keyboard tab switch failed');keyboardTabs=true;
  await click('[data-action=history-detail][data-section=toggle]');assert.equal(await js('!!document.querySelector(".history-details")'),false,'Collapse retained a visible detail panel');await click('[data-action=history-detail][data-id="1"]');await until(()=>js('!!document.querySelector(".history-details")'),'Reopen lost the saved match');
 await click('[data-action=history-replay][data-replay=download]');await until(()=>writes.length===1,'Mock replay write missing');assert.ok(writes[0].endsWith('/1/download'));
 await click('[data-action=history-next]');await until(()=>js('document.querySelectorAll(".history-match").length===3'),'Pagination missing');
 await click('[data-action=history-prev]');await until(()=>js('document.querySelectorAll(".history-match").length===20'),'Previous page missing');
 await js('(()=>{document.querySelector(".history-filter-panel").open=true;const el=document.querySelector("[data-history-field=filter-result]");el.value="loss";el.dispatchEvent(new Event("change",{bubbles:true}));})()');
 assert.equal(await js('document.querySelectorAll(".history-match").length'),10);
  await click('[data-action=history-filter-clear]');await click('[data-action=history-rule-add]');await until(()=>js('document.querySelectorAll("[data-history-rule][data-rule-field=field]").length===1'),'Advanced filter missing');
  await click('[data-action=history-tree-add][data-kind=and][data-path=""]');await click('[data-action=history-tree-add][data-kind=rule][data-path=""]');
  await js('(()=>{const fields=[...document.querySelectorAll("[data-history-tree-field=value]")];const input=fields.at(-1);input.value="9";input.dispatchEvent(new Event("change",{bubbles:true}));})()');assert.equal(await js('document.querySelectorAll(".history-match").length'),0,'Nested rule did not change the visible sample');
  await click('[data-action=history-tree-remove][data-path="1"]');assert.equal(await js('document.querySelectorAll(".history-match").length'),20,'Removing nested rule did not restore the sample');
  await click('[data-action=history-filter-clear]');
  await click('[data-action=history-collect-active]');await until(()=>js('document.querySelector(".history-navigation-tools").textContent.includes("匹配 23 局")&&!document.querySelector(".history-loading")'),'Active-filter collection count missing');
  await click('[data-action=history-refresh]');await until(()=>js('document.querySelectorAll(".history-match").length===20&&!document.querySelector(".history-loading")'),'Collection mode did not return to normal paging');
  await js('(()=>{document.querySelector(".history-search-disclosure").open=true;document.querySelector("#history-query").value="示例队友#TEST";document.querySelector("#history-search").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));})()');
 await until(()=>js('document.querySelectorAll(".history-tabs [role=tab]").length===2&&!document.querySelector(".history-loading")'),'Second player query missing');
 await click('[data-action=history-tab][data-id="1"]');
 await click('[data-action=history-collect]');await until(()=>js('document.querySelectorAll(".history-match").length===23&&!document.querySelector(".history-loading")'),'Batch collection missing');
 await click('[data-action=history-refresh]');await until(()=>js('document.querySelectorAll(".history-match").length===20&&!document.querySelector(".history-loading")'),'Refresh after batch missing');
 await js('document.querySelector(".history-filter-panel").open=false');
  main.setSize(1460,980);await capture('history-desktop.png');
  main.setSize(1050,760);await until(()=>js('!!document.querySelector(".history-compact-summary")'),'Compact statistics disappeared after resize');await js('document.querySelector(".history-compact-summary").open=true');assert.ok(await js('document.querySelector(".history-compact-summary .history-win").offsetHeight>0'));await js('document.querySelector(".history-compact-summary").open=false');await capture('history-laptop.png');
 assert.equal(await js('document.documentElement.scrollWidth>window.innerWidth+2'),false,'Page overflows window');
 await click('[data-action=navigate][data-route=ongoing]');await until(()=>js('document.querySelectorAll("[data-ongoing-player]").length>=2'),'Lobby ongoing cards missing');
 await until(()=>js('document.querySelectorAll(".ongoing-history-row").length>0&&!document.querySelector(".ongoing-player-card[aria-busy=true]")'),'Ongoing history did not load');
  main.setSize(1460,980);await capture('ongoing-lobby.png');
 clientPhase='ChampSelect';await click('[data-action=ongoing-refresh]');await until(()=>js('document.querySelectorAll("[data-ongoing-player]").length===3'),'Draft roster missing hidden slot');
 assert.equal(await js('document.body.innerText.includes("隐藏身份")||document.body.innerText.includes("身份隐藏")'),true,'Anonymous draft identity exposed or not labeled');
 clientPhase='InProgress';await click('[data-action=ongoing-refresh]');await until(()=>js('document.querySelectorAll("[data-ongoing-player]").length===10'),'Full in-game roster missing');
  await until(()=>js('document.querySelectorAll("[data-ongoing-player]").length===10&&!document.querySelector(".ongoing-player-card[aria-busy=true]")'),'In-game player histories did not settle');await until(()=>js('[...document.querySelectorAll(".ongoing-spell-pair img[src*=SummonerFlash]")].some(img=>img.complete&&img.naturalWidth>0)'),'Offline ongoing spell icon did not load');
  assert.equal(await js('document.querySelectorAll(".ongoing-card-stats .ongoing-stat").length===10*3'),true,'Ongoing cards must expose win rate, KDA and position cells');ongoingCards=true;
  const columnWidths=await js('[...document.querySelector(".ongoing-player-grid").children].map(card=>card.getBoundingClientRect().width)');
  assert.equal(columnWidths.length,5);assert.ok(columnWidths.every(width=>Math.abs(width-240)<=1),'Ongoing cards must retain fixed 240px columns: '+JSON.stringify(columnWidths));
  assert.equal(await js('getComputedStyle(document.querySelector(".ongoing-player-grid")).gridTemplateColumns.split(" ").length'),5,'A five-player team must render five columns, not wrap');
  await hover('[data-ongoing-tip=winrate]','Ongoing win-rate hover missing');assert.match(await hoverText(),/不代表本局获胜概率/);assert.equal(await js('(()=>{const r=document.querySelector("#history-hover-detail").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()'),true,'Ongoing hover escapes viewport');await js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  await js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  await until(()=>js('!document.querySelector("#history-hover-detail")'),'Ongoing hover did not close after Escape');
  await hover('[data-ongoing-tip=rank]','Ongoing rank hover missing');assert.ok((await hoverText()).length>0);await js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');ongoingHover=true;
  await capture('ongoing-game.png');
  for(const theme of ['daylight',originalTheme]){
   await chooseTheme(theme);await until(()=>js('document.querySelectorAll("[data-ongoing-player]").length===10'),'Themed live roster missing');
   await readable('.ongoing-player-name,.ongoing-stat strong,.ongoing-tag,.ongoing-role-reason,.ongoing-level,.ongoing-stat small,.ongoing-page .btn.quiet:not(:disabled)');await capture('ongoing-theme-'+theme+'.png');
   await readableControlHover('[data-action=ongoing-clear]','ongoing-control-hover-'+theme+'.png');
   await readableControlHover('.ongoing-player-name','ongoing-name-hover-'+theme+'.png');
  }
  await js('document.querySelector(".ongoing-settings").open=true');await click('[data-ongoing-field=streamer]');
  await until(()=>js('window.buddy.bootstrap().then(b=>b.state.preferences.ongoing.streamer===true)'),'Streamer preference did not settle');
  await until(()=>js('!document.querySelector(".ongoing-status")&&!document.querySelector(".ongoing-player-card[aria-busy=true]")'),'Streamer roster refresh did not settle');
  await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.equal(await js('document.querySelector(".ongoing-page").classList.contains("is-streamer")'),true);
  const groupTip=await js('!!document.querySelector("[data-ongoing-tip=premade]")');assert.ok(groupTip,'Shared-history fixture group missing');
  await hover('[data-ongoing-tip=premade]','Anonymous group hover missing');
  try{await until(()=>js('document.querySelector("#history-hover-detail")?.textContent.includes("玩家")'),'Anonymous group tooltip missing');}catch(error){console.error('GROUP_TOOLTIP_DIAGNOSTIC',JSON.stringify(await js('({target:document.querySelector("[data-ongoing-tip=premade]")?.outerHTML,tip:document.querySelector("#history-hover-detail")?.textContent,streamer:document.querySelector("[data-ongoing-field=streamer]")?.checked,busy:document.querySelectorAll(".ongoing-player-card[aria-busy=true]").length})')));throw error;}
  assert.doesNotMatch(await js('document.querySelector("#history-hover-detail").textContent'),/战绩测试玩家|示例队友|模拟玩家|#TEST/);
  await capture('ongoing-streamer-hover.png');await js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');await click('[data-ongoing-field=streamer]');
  // Exercise both SVG layers with synthetic historical coordinates; source
  // fixtures do not otherwise have enough jungle frames to draw these maps.
  const mapStyles=await js(`(async()=>{
   const {ongoingJungleView}=await import('./ongoing-game-jungle-view.mjs');
   const box=document.createElement('section');box.id='map-style-fixture';box.style.cssText='position:fixed;inset:80px auto auto 160px;width:500px;z-index:1000;background:var(--rb-panel);padding:12px';
   box.innerHTML=ongoingJungleView({gamesAnalyzed:2,minutePositions:[{x:4000,y:6000,minute:3},{x:8000,y:9000,minute:4}],gankPositions:[{x:7000,y:8000,minute:5}]});
   document.body.append(box);box.querySelectorAll('details').forEach(el=>el.open=true);
   return {...Object.fromEntries(['lanes','river','heat','position','kill'].map(kind=>{const style=getComputedStyle(box.querySelector('.ongoing-map-'+kind));return [kind,{fill:style.fill,stroke:style.stroke}];})),label:getComputedStyle(box.querySelector('.ongoing-jungle-map text')).fontSize,zoneNote:getComputedStyle(box.querySelector('.ongoing-zone-bars small')).gridColumn};
  })()`);
  assert.equal(mapStyles.lanes.fill,'none');assert.notEqual(mapStyles.lanes.stroke,'none');assert.notEqual(mapStyles.river.stroke,'none');
  assert.equal(mapStyles.kill.fill,'none');assert.notEqual(mapStyles.kill.stroke,'none');assert.notEqual(mapStyles.heat.fill,'rgb(0, 0, 0)');assert.notEqual(mapStyles.position.fill,'rgb(0, 0, 0)');
  assert.equal(mapStyles.label,'5px');assert.equal(mapStyles.zoneNote,'2 / 4');
  await capture('ongoing-historical-maps.png');await js('document.querySelector("#map-style-fixture").remove()');
 assert.equal(writes.length,1,'Ongoing queries must not trigger writes');
 await click('.ongoing-history-row');await until(()=>js('!!document.querySelector(".history-details .history-player")'),'Ongoing history preview did not open a full match');
 await click('[data-action=history-simulate]');await until(()=>js('!!document.querySelector(".ongoing-draft-mark")'),'Historical roster was not labeled as preserved');
 assert.ok(await js('document.querySelectorAll("[data-ongoing-player]").length')>0);await click('[data-action=ongoing-exit-draft]');await until(()=>js('!document.querySelector(".ongoing-draft-mark")&&document.querySelectorAll("[data-ongoing-player]").length===10'),'Return to live roster failed');
 await click('[data-action=navigate][data-route=history]');
 offline=true;await click('[data-action=history-refresh]');await until(()=>js('document.querySelector(".history-error")?.textContent.includes("账号")'),'Offline failure missing');assert.equal(errors.length,0,errors.join('\n'));
  await fs.writeFile(path.join(root,'result.json'),JSON.stringify({note:'This file is written only after every named assertion in scripts/smoke-match-history.cjs passed; the flags below report page behaviour that was asserted during this run.',packaged:!source,query:true,pagination:true,filters:true,advancedFilters:true,details:true,runes:true,builds:true,timeline:true,compactRows,sixTabs,hoverDetails,keyboardTabs,ongoingCards,ongoingHover,replayMocked:true,offlineError:true,ongoingLobby:true,ongoingDraft:true,ongoingInGame:true,screenshots:['history-desktop.png','history-laptop.png','history-expanded-equipment.png','ongoing-lobby.png','ongoing-game.png','ongoing-streamer-hover.png','ongoing-historical-maps.png']},null,2));app.quit();
}
run().catch(async error=>{console.error(error.stack);if(main&&!main.isDestroyed()){await fs.writeFile(path.join(root,'failure.png'),(await main.webContents.capturePage()).toPNG()).catch(()=>{});console.error(await main.webContents.executeJavaScript('document.body.innerText').catch(()=>''));}app.exit(1);});
