import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);
import {sanitizeGame,identifyMode} from '../src/core/game-mode.mjs';
import {RUNE_PHASES,runeWriteContext,validateRuneWriteContext,sameRuneWriteContext} from '../src/core/rune-context.mjs';
import {normalizeChampionIds,pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
const GET_PATHS=new Set(['/lol-gameflow/v1/gameflow-phase','/lol-gameflow/v1/session','/lol-champ-select/v1/session','/lol-champ-select/v1/pickable-champion-ids','/lol-champ-select/v1/disabled-champion-ids','/lol-perks/v1/pages','/data-store/v1/install-dir']);
let snapshotAuth=null,snapshotPath='',snapshotAuthAt=0;
export function parseLockfile(content) {
 const parts=String(content).trim().split(':');
 if(parts.length!==5||parts[0]!=='LeagueClient'||!/^\d+$/.test(parts[2])||!parts[3]||parts[4]!=='https')return null;
 const port=Number(parts[2]);if(port<1||port>65535)return null;
 return {port,password:parts[3]};
}
export function parseCommandLine(cmd) {
 const port=String(cmd).match(/--app-port=(\d+)/)?.[1];
 const password=String(cmd).match(/--remoting-auth-token=([^\s"]+)/)?.[1];
 if(!port||!password||Number(port)>65535||Number(port)<1)return null;
 return {port:Number(port),password};
}
export async function discoverClient(installPath='') {
 const roots=[installPath,'C:/WeGameApps/英雄联盟','D:/WeGameApps/英雄联盟','D:/英雄联盟','C:/Riot Games/League of Legends'].filter(Boolean);
 for(const root of roots)for(const suffix of ['lockfile','LeagueClient/lockfile']) {
  try {const auth=parseLockfile(await fs.readFile(path.join(root,suffix),'utf8'));if(auth)return auth;}catch{}
 }
 if(process.platform==='win32') {
  try {
   const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$p = Get-CimInstance Win32_Process -Filter \"Name = 'LeagueClientUx.exe'\"; if ($p) { if ($p.CommandLine) { $p.CommandLine } else { 'CLIENT_ACCESS_REQUIRED' } }"],{windowsHide:true,timeout:6000,maxBuffer:131072});
   return stdout.includes('CLIENT_ACCESS_REQUIRED')?{unreadable:true}:parseCommandLine(stdout);
  }catch{return null;}
 }
 return null;
}
export function lcuRequest(auth,route,method='GET',body) {
 if(!auth||!Number.isInteger(auth.port)||auth.port<1||auth.port>65535||!(method==='GET'&&GET_PATHS.has(route))&&!(method==='POST'&&route==='/lol-perks/v1/pages')&&!(method==='PUT'&&/^\/lol-perks\/v1\/pages\/\d+$/.test(route))&&!(method==='PUT'&&route==='/lol-perks/v1/currentpage'&&Number.isSafeInteger(body)&&body>0))throw new Error('不支持此客户端操作');
 return new Promise((resolve,reject)=>{
  const payload=body?JSON.stringify(body):null;
  const request=https.request({hostname:'127.0.0.1',port:auth.port,path:route,method,
   // The League client exposes a self-signed loopback certificate. This exception is scoped to this socket only.
   rejectUnauthorized:false,auth:`riot:${auth.password}`,timeout:4500,
   headers:{Accept:'application/json',...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},res=>{
    let raw='',size=0;
    res.on('error',()=>reject(new Error('客户端读取已中断')));
    res.on('data',chunk=>{size+=chunk.length;if(size>2_000_000){request.destroy();reject(new Error('客户端响应过大'));return;}raw+=chunk;});
    res.on('end',()=>{let value;try{value=raw?JSON.parse(raw):null;}catch{return reject(new Error('客户端返回格式异常'));}
     if(res.statusCode>=400){const error=new Error(res.statusCode===404?'当前没有可读取的选人信息':res.statusCode===401?'客户端连接已变化，请重新连接':`客户端暂未接受操作（${res.statusCode}）`);error.status=res.statusCode;return reject(error);}
     resolve(value);
    });
   });
  request.on('timeout',()=>request.destroy(new Error('客户端连接超时')));
  request.on('error',()=>reject(new Error('未能连接客户端，请确认游戏已登录到大厅')));
  if(payload)request.write(payload);request.end();
 });
}
export function sanitizeSession(session) {
 const actions=(Array.isArray(session.actions)?session.actions:[]).flat().filter(a=>a&&Number.isInteger(a.actorCellId)&&['pick','ban'].includes(a.type)).map(a=>({actorCellId:a.actorCellId,championId:Number(a.championId)||0,type:a.type,completed:a.completed===true,isInProgress:a.isInProgress===true}));
 const team=arr=>(Array.isArray(arr)?arr:[]).map(p=>{
  const cellId=Number(p.cellId),pick=actions.find(a=>a.type==='pick'&&a.actorCellId===cellId);
  return {championId:Number(p.championId)||0,cellId,assignedPosition:String(p.assignedPosition||''),
   ...(Number(p.championPickIntent)>0?{championPickIntent:Number(p.championPickIntent)}:{}),
   ...(pick?{pickState:pick.completed?'locked':'selecting'}:{})};
 });
 return {myTeam:team(session.myTeam),theirTeam:team(session.theirTeam),localPlayerCellId:session.localPlayerCellId,allowDuplicatePicks:session.allowDuplicatePicks===false?false:true,
  ...(/^[1-9]\d{0,19}$/.test(String(session.gameId||''))?{gameId:String(session.gameId)}:{}),
  bans:[...(session.bans?.myTeamBans||[]),...(session.bans?.theirTeamBans||[])].filter(Number.isInteger),
  actions,timer:{phase:session.timer?.phase||'',...(Number.isFinite(session.timer?.adjustedTimeLeftInPhase)?{remainingMs:Math.max(0,session.timer.adjustedTimeLeftInPhase)}:{})}};
}
export async function clientSnapshot(installPath='',{discover=discoverClient,request=lcuRequest,now=Date.now}={}) {
 const native=discover===discoverClient&&request===lcuRequest;
 const cached=native&&!!snapshotAuth&&snapshotPath===installPath&&now()-snapshotAuthAt<30000;
 const auth=cached?snapshotAuth:await discover(installPath);
 if(native&&auth?.port&&!cached){snapshotAuth=auth;snapshotPath=installPath;snapshotAuthAt=now();}
 if(!auth)return {connected:false,phase:'Offline',message:'未发现客户端，可先手动选人'};
 if(auth.unreadable)return {connected:false,phase:'Offline',needsElevation:true,message:'已发现客户端，需要授权连接才能读取选人信息'};
 try{
  let phase=await request(auth,'/lol-gameflow/v1/gameflow-phase'),session=null,eligibility=null;
  if(phase==='ChampSelect'){
   session=sanitizeSession(await request(auth,'/lol-champ-select/v1/session'));
   const context=pickEligibilityContext(session);
   const reads=await Promise.allSettled(['pickable-champion-ids','disabled-champion-ids'].map(name=>request(auth,'/lol-champ-select/v1/'+name)));
   if(reads.some(r=>r.status==='rejected'&&r.reason?.status===401))throw Error('客户端连接已变化，请重新连接');
   const [pickable,disabled]=reads.map(r=>r.status==='fulfilled'?normalizeChampionIds(r.value):null);
   eligibility={pickable,disabled,context,localPlayerCellId:session.localPlayerCellId,receivedAt:new Date(now()).toISOString()};
   if(pickable!==null||disabled!==null){
    // A non-atomic LCU read can cross a new selection or phase. Do not reuse
    // either list if the public draft changed while these reads were pending.
    phase=await request(auth,'/lol-gameflow/v1/gameflow-phase');
    session=phase==='ChampSelect'?sanitizeSession(await request(auth,'/lol-champ-select/v1/session')):null;
    if(context!==pickEligibilityContext(session))eligibility=null;
   }
  }
  let game={};try{game=sanitizeGame(await request(auth,'/lol-gameflow/v1/session'));}catch{}
  return {connected:true,phase,session,eligibility,game,mode:identifyMode(game),receivedAt:new Date(now()).toISOString(),message:phase==='ChampSelect'?'已连接选人阶段':'已连接客户端'};
 }catch(e){if(native){snapshotAuth=null;snapshotAuthAt=0;}return {connected:false,phase:'Offline',message:e.message};}
}
export async function writeRunePage({page,context,ownedPageId,installPath='',trees},{discover=discoverClient,request=lcuRequest}={}) {
 const {validateRunePage}=await import('../src/core/builds.mjs');
 if(!validateRunePage(page,trees))throw new Error('符文组合与当前资料不匹配，已取消写入');
 const auth=await discover(installPath);if(!auth?.port)throw new Error('请先连接英雄联盟客户端，并完成必要的连接授权');
 const phase=await request(auth,'/lol-gameflow/v1/gameflow-phase');
 const allowedPhases=RUNE_PHASES;
 if(!allowedPhases.includes(phase))throw new Error('请在大厅或选人阶段应用符文');
 const supplied=context===undefined?null:validateRuneWriteContext(context);
 const readContext=async currentPhase=>runeWriteContext({connected:true,phase:currentPhase,
  session:currentPhase==='ChampSelect'?await request(auth,'/lol-champ-select/v1/session'):null,
  game:supplied?.gameId?sanitizeGame(await request(auth,'/lol-gameflow/v1/session')):null});
 const initial=await readContext(phase),expected=supplied||initial;
 if(!sameRuneWriteContext(initial,expected))throw Error('选人对象或对局已变化，尚未写入符文；请核对后重新点击应用');
 const pages=await request(auth,'/lol-perks/v1/pages');
 if(!Array.isArray(pages))throw new Error('无法读取符文页，已取消写入');
 const editable=pages.filter(p=>Number.isInteger(p?.id)&&p.id>0&&p.isEditable===true);
 // The user's click authorizes replacement. Reuse the last written page,
 // otherwise the currently selected editable page, then another editable page.
 const target=editable.find(p=>p.id===ownedPageId)||editable.find(p=>p.current===true)||editable[0];
 const name=String(page.name||'推荐').replace(/^开黑搭子 · /,'').slice(0,30);
 const payload={name:`开黑搭子 · ${name}`,primaryStyleId:page.primaryStyleId,subStyleId:page.subStyleId,selectedPerkIds:page.selectedPerkIds,current:true};
 // Recheck the public target after the awaited page enumeration, then the
 // phase immediately before dispatch. LCU does not offer an atomic transaction.
 let dispatchContext,dispatchPhase;
 try{dispatchContext=await readContext(phase);dispatchPhase=await request(auth,'/lol-gameflow/v1/gameflow-phase');}
 catch{throw Error('未能再次确认符文应用对象，尚未写入符文；请同步后重新点击');}
 if(dispatchPhase!==phase||!sameRuneWriteContext(dispatchContext,expected))throw Error('选人对象、对局或阶段已变化，尚未写入符文；请核对后重新点击应用');
 try{
  const result=target?await request(auth,`/lol-perks/v1/pages/${target.id}`,'PUT',payload):await request(auth,'/lol-perks/v1/pages','POST',payload);
  const newId=target?.id||result?.id;
  if(!Number.isSafeInteger(newId)||newId<=0)throw new Error('写入结果不明确，请在客户端检查符文页');
  const matches=p=>p&&JSON.stringify(p.selectedPerkIds)===JSON.stringify(payload.selectedPerkIds)&&p.primaryStyleId===payload.primaryStyleId&&p.subStyleId===payload.subStyleId;
  const after=await request(auth,'/lol-perks/v1/pages');let confirmed=Array.isArray(after)?after.find(p=>p.id===newId):null;
  if(!matches(confirmed))throw new Error('客户端未确认完整符文页，请手动检查');
  // Saving a page and selecting it are separate client operations. Keep the
  // existing click and replacement target; only select that verified page.
  // Interface reference: LeagueAkari commit 5109b2f7, league-client/perks.ts.
  if(confirmed.current!==true){
   let currentPhase;try{currentPhase=await request(auth,'/lol-gameflow/v1/gameflow-phase');}catch{throw new Error('符文已保存，但未能确认当前阶段，尚未选用该页；请在客户端核对。');}
   if(!allowedPhases.includes(currentPhase))throw new Error('符文已保存，但已离开可应用阶段，尚未选用该页；请在客户端核对。');
   let selectionContext;try{selectionContext=await readContext(currentPhase);currentPhase=await request(auth,'/lol-gameflow/v1/gameflow-phase');}catch{throw Error('符文已保存，但未能确认选人对象，尚未选用该页；请在客户端核对。');}
   if(currentPhase!==expected.phase||!sameRuneWriteContext(selectionContext,expected))throw Error('符文已保存，但选人对象或对局已变化，尚未选用该页；请在客户端核对。');
   try{await request(auth,'/lol-perks/v1/currentpage','PUT',newId);}catch{throw new Error('符文已保存，但客户端未能选用该页；请在客户端手动选用后核对。');}
   let selected;try{selected=await request(auth,'/lol-perks/v1/pages');}catch{throw new Error('符文已保存，但无法确认选用结果；请在客户端核对当前符文页。');}
   confirmed=Array.isArray(selected)?selected.find(p=>p.id===newId):null;
   if(!matches(confirmed))throw new Error('客户端未确认完整符文页，请手动检查');
   if(confirmed.current!==true)throw new Error('符文已保存，但客户端未确认选用该页；请在客户端手动选用后核对。');
  }
  return {pageId:newId,name:payload.name};
 }catch(e){if(e.status===400||e.status===409)throw new Error(target?'客户端暂不允许替换符文，请确认仍在大厅或选人阶段后重试。':'没有可替换的符文页，且客户端未能新建。请检查符文页编辑权限和剩余名额。');throw e;}
}
