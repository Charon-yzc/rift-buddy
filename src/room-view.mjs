// Room panel: LAN and opt-in relay controls with exact sender configuration snapshots.
import {escape as e,icon,portrait,button} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {roomPreparation} from './core/room-configuration.mjs';
import {SHARDS} from './core/builds.mjs';
import {creativeMemberCombo} from './core/creative-plan.mjs';
import {duoPlayView} from './duo-play-view.mjs';

const roleName=id=>ROLES.find(r=>r.id===id)?.name||id;
const LINK_TEXT={connecting:'连接中',connected:'已连接',reconnecting:'重连中',failed:'连接失败',idle:''};

function memberCard(member,champ){
 const share=member.share;
 const lineup=share&&Array.isArray(share.lineup)?share.lineup:[];
 const champions=lineup.filter(slot=>slot&&slot.champion);
 const mode=share?.mode||share?.pick?.mode||'rift';
 const chips=champions.map(slot=>{
  const c=champ(slot.champion);
  const config=share?.configurations?.find(s=>s.champion===slot.champion&&s.role===slot.role);
  return `<button class="room-champ" data-action="room-build" data-id="${e(slot.champion)}" data-role="${e(slot.role)}" data-mode="${e(config?.mode||mode)}" data-member="${e(member.nick)}" ${!config&&!(['rift','hex'].includes(mode))?'disabled':''} title="${e(roleName(slot.role))} · ${config?'查看发送方配置':'仅共享英雄，查看本地配置'}">${c?portrait(c,'sm'):''}<span>${e(c?.name||slot.champion)}${config?' · '+(config.mode==='hex'?'海克斯配置':'符文与加点'):!['rift','hex'].includes(mode)?' · 此模式暂不支持':' · 本地参考'}</span></button>`;
 }).join('');
 const updated=share?.at?`更新于 ${new Date(share.at).toLocaleTimeString('zh-CN')}`:'还没分享阵容';
 return `<article class="room-member"><header><b>${e(member.nick)}</b>${member.self?'<span class="badge">我</span>':''}<small>${updated}</small></header>${chips?`<div class="room-champs">${chips}</div>`:''}</article>`;
}

// Two transports, one nickname. The relay address is the user's own, so it is
// a settings field rather than something the app ships with.
function transportSwitch(current){
 const option=(id,label,note)=>`<button class="room-transport${current===id?' on':''}" data-action="room-transport" data-id="${id}" aria-pressed="${current===id}">${label}<small>${note}</small></button>`;
 return `<div class="room-transports">${option('lan','局域网','同一网络或虚拟局域网')}${option('relay','中继','跨网，自己部署的中继')}</div>`;
}

function roomIdle({nick,transport,busy,scanning,scanResults,error,invite,pin,relayUrl,relayRoom}){
 const results=Array.isArray(scanResults)?scanResults.slice(0,64):null;
 const forms=transport==='relay'
  ?`<div class="room-join"><label>中继地址<input id="room-relay-url" value="${e(relayUrl)}" placeholder="wss://room.你的域名" spellcheck="false" aria-label="中继地址"></label><label>房间码<input id="room-relay-room" value="${e(relayRoom)}" placeholder="6 位数字" inputmode="numeric" maxlength="6" aria-label="中继房间码"></label><label>口令<input id="room-pin" value="${e(pin)}" placeholder="6 位数字" inputmode="numeric" maxlength="6" aria-label="房间口令"></label>${button('room-relay-join',busy?'处理中…':'加入中继房间','arrow','small',busy?'disabled':'')}</div>
   <p class="bottom-note">使用你或队友部署的可信中继，助手不内置任何公共中继。加入后，公开阵容与配置会发送给该中继并转给房间成员；中继运营者也能看到内容。六位口令虽只发送哈希，仍可被枚举，不是强身份认证。</p>`
  :`<div class="room-actions">${button('room-host',busy?'处理中…':'创建房间','team','primary small',busy?'disabled':'')}${button('room-scan',scanning?'扫描中…':'扫描局域网房间','search','small',scanning?'disabled':'')}</div>
   <div class="room-join"><label>邀请码<input id="room-invite" value="${e(invite)}" placeholder="粘贴完整邀请，或 地址:端口#房间号" aria-label="邀请码"></label><label>口令<input id="room-pin" value="${e(pin)}" placeholder="6 位数字" inputmode="numeric" aria-label="房间口令"></label>${button('room-join',busy?'处理中…':'加入房间','arrow','small',busy?'disabled':'')}</div>
   ${results?`<div class="room-scan">${results.length?results.map(item=>`<button data-action="room-fill" data-invite="${e(`${item.host}:${item.port}#${item.room}`)}">房间 ${e(item.room)} · ${e(item.host)}</button>`).join(''):'<p class="bottom-note">没有发现房间。确认在同一网络，或让房主把邀请码发给你。</p>'}</div>`:''}
   <p class="bottom-note">房间不需要额外读取客户端数据。建房后自动发送所选公开阵容与配置，TCP 内容未加密；请在可信局域网或受信虚拟局域网使用。Windows 防火墙只允许当前可信网络。虚拟局域网不一定转发扫描公告，可粘贴房主从对应网卡复制的完整邀请加入。</p>`;
 return `<section class="panel room-panel"><div class="panel-head"><div><h3>${icon('link')}开黑房间</h3><p>${transport==='relay'?'经中继跨网共享阵容':'同一网络或虚拟局域网内共享阵容，本机直连'}；全程无需账号。</p></div><span class="badge">无需账号</span></div>
  <div class="panel-body">
   <div class="room-nick"><label>我的昵称<input id="room-nick" value="${e(nick)}" maxlength="24" placeholder="队友" aria-label="房间昵称"></label><span class="bottom-note">房间里显示的称呼，队友可见。</span></div>
   ${transportSwitch(transport)}
   ${forms}
   ${error?`<p class="callout warning">${e(error)}</p>`:''}
  </div></section>`;
}

function roomActive({room,addresses,champ}){
 const isRelay=room.transport==='relay';
 const isHost=room.mode==='host';
 const link=LINK_TEXT[room.link]||'';
 const invites=isHost&&Number.isInteger(room.port)?(addresses||[]).map(item=>({name:item.name||'本机地址',invite:`${item.address}:${room.port}#${room.room}`})):[];
 const head=isRelay
  ?`<div><h3>${icon('link')}开黑房间 · ${e(room.room)}</h3><p>${room.members.length} 人在线 · 经中继</p></div>`
  :`<div><h3>${icon('link')}开黑房间 · ${e(room.room)}</h3><p>${room.members.length} 人在线${isHost?` · 口令 ${e(room.pin||'')}`:''}</p></div>`;
 const badge=isRelay
  ?`<span class="badge room-link${room.link==='connected'?'':' warn'}">${link||'中继'}</span>`
  :`<span class="badge">${isHost?'房主':'成员'}</span>`;
 const inviteBlock=isRelay
  ?`<div class="room-invites"><p>邀请队友（复制下面的地址和房间码，口令请另行告知）：</p><div class="chips"><button data-action="room-copy-relay">${icon('copy')}${e(`中继 ${room.relayUrl||''}｜房间 ${room.room}`)}</button></div><div class="room-invite-foot"><span class="bottom-note">队友在“中继”里填同一个中继地址、房间码和口令即可加入。${room.link==='reconnecting'?'连接中断，正在重连，期间分享可能延迟。':room.link==='failed'?'连续重连失败已停止，请离开房间后重新加入。':''}</span></div></div>`
  :isHost?`<div class="room-invites"><p>邀请队友（邀请码和口令一起发）：</p><div class="chips">${invites.length?invites.map(item=>`<button data-action="room-copy-invite" data-invite="${e(item.invite)}">${icon('copy')}${e(item.name)} · ${e(item.invite)}</button>`).join(''):'<span class="bottom-note">暂未检测到局域网地址；可让队友手动扫描。</span>'}</div><div class="room-invite-foot">${button('room-refresh-addresses','刷新本机地址','refresh','quiet small')}<span class="bottom-note">口令 ${e(room.pin||'')}。队友在“加入房间”里粘贴完整邀请即可；裸邀请码需另填口令。</span></div></div>`
  :'';
 return `<section class="panel room-panel"><div class="panel-head">${head}${badge}${button('room-leave','离开房间','','quiet small')}</div>
  <div class="panel-body">
   ${inviteBlock}
   <div class="room-share-row">${button('room-publish','分享我的阵容与配置','upload','primary small')}<span class="bottom-note">进入房间后阵容会自动同步，包含所选装备、完整符文、召唤师技能与加点；队友点击英雄查看发送方配置。不会自动改动队友的阵容或客户端。</span></div>
   <div class="room-members" aria-live="polite">${room.members.map(member=>memberCard(member,champ)).join('')}</div>
  </div></section>`;
}

export function roomPanel({room,nick='队友',transport='lan',busy=false,scanning=false,scanResults=null,error='',invite='',pin='',relayUrl='',relayRoom='',addresses=[],champ}){
 if(!room||room.mode==='idle')return roomIdle({nick,transport,busy,scanning,scanResults,error,invite,pin,relayUrl,relayRoom});
 return roomActive({room,addresses,champ});
}

export function roomConfigurationText(config,data,from,strategy){
 const champion=data.champions.find(c=>c.id===config.champion),runes=new Map(data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r.name]))));
 const names=ids=>ids.map(id=>data.items[id]?.name||`装备 #${id}`).join(' → ')||'未提供';
 const play=strategy?.members?.some(m=>m.champion===config.champion&&m.role===config.role)?creativeMemberCombo(strategy,config.champion,config.role)?.play:null;
 return [`${from} 分享：${champion?.name||config.champion} · ${roleName(config.role)} · ${config.mode==='hex'?'海克斯':'峡谷'} · 资料 ${config.patch}`,
  ...(strategy?[`组合：${strategy.name}；${strategy.plan}`,`窗口：${strategy.window}；停止：${strategy.caution}`]:[]),
  ...(play?Object.values(play.stages).map(stage=>`${stage.label}：${stage.ownAction}\n${stage.steps.join(' → ')}\n窗口：${stage.window}\n停止：${stage.exit}`):[]),
  `出门：${names(config.start)}`,`装备计划：${names(config.items)}`,`鞋子：${names(config.boots)}`,`召唤师技能：${config.spells.map(id=>data.spells[id]?.name||id).join(' / ')}`,
  `完整符文：${config.runes?config.runes.selectedPerkIds.map(id=>runes.get(id)||SHARDS[id]||`符文 #${id}`).join(' / '):'发送方未提供可用符文页'}`,
  `逐级加点：${config.skills?config.skills.split('').map((s,i)=>`${i+1}级 ${s}`).join(' → '):'发送方未提供普通逐级加点；特殊英雄属性点另行核对'}`,
  ...(config.priority?[`加点优先：${config.priority.split('').join(' > ')}；仍按游戏内可升级选项核对`]:[]),
  ...(config.basis?[`配置来源：${config.basis.title}；${config.basis.note}`,`符文说明：${config.basis.rune}`,`加点说明：${config.basis.skill}`]:['旧共享未提供来源说明，请与发送方核对']),
  '发送方配置快照；不代表已购买、技能就绪、联合胜率或最优配置。'].join('\n');
}
export function roomConfigurationDialog(config,data,from,strategy){
 const c=data.champions.find(c=>c.id===config.champion),trees=new Map(data.runes.map(t=>[t.id,t])),runes=new Map(data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r]))));
 const names=ids=>ids.map(id=>e(data.items[id]?.name||`装备 #${id}`)).join(' → ')||'未提供';
 let adoptionError='';try{roomPreparation(config,data,strategy);}catch(error){adoptionError=error.message;}
 const page=config.runes,play=strategy?.members?.some(m=>m.champion===config.champion&&m.role===config.role)?creativeMemberCombo(strategy,config.champion,config.role)?.play:null;
 const strategyHtml=strategy?`<section class="detail-section"><h3>发送方组合 · ${e(strategy.name)}</h3><p>${e(strategy.plan)}</p><p><b>成立窗口：</b>${e(strategy.window)}</p><p class="decision-caution"><b>停止条件：</b>${e(strategy.caution)}</p>${play?duoPlayView(play):'<p>此英雄不在所分享组合的成员中；下方为单独配置。</p>'}<p class="bottom-note">保存资料 ${e(strategy.dataVersion)} · 机制整理参考，未经真实组合对局验证；不是本局敌人或技能就绪判断。</p></section>`:'';
 const gearHtml=`<section class="detail-section"><h3>发送方装备计划</h3><p>出门：${names(config.start)}</p><p>装备：${names(config.items)}</p><p>鞋子：${names(config.boots)}</p></section>`;
 const runeHtml=`<section class="detail-section"><h3>发送方完整符文与碎片</h3>${page?`<p>${e(trees.get(page.primaryStyleId)?.name||`符文系 #${page.primaryStyleId}`)} / ${e(trees.get(page.subStyleId)?.name||`符文系 #${page.subStyleId}`)}</p><div class="room-runes">${page.selectedPerkIds.map(id=>`<span>${e(runes.get(id)?.name||SHARDS[id]||`未知符文 #${id}`)} <small>#${id}</small></span>`).join('')}</div>`:'<p>发送方未提供可用符文页；海克斯不应用峡谷符文。</p>'}</section>`;
 const skillHtml=`<section class="detail-section"><h3>发送方召唤师技能与加点</h3>${config.priority?`<p>加点优先：${e(config.priority.split('').join(' > '))}；按游戏内可升级选项核对。</p>`:''}<p>${config.spells.map(id=>e(data.spells[id]?.name||id)).join(' / ')}</p>${config.skills?`<ol class="room-skill-order">${config.skills.split('').map((key,i)=>`<li>${i+1}级 <b>${key}</b></li>`).join('')}</ol>`:'<p>发送方未提供普通逐级加点；特殊英雄属性点另行核对。</p>'}</section>`;
 return `<div class="modal-backdrop" data-backdrop="true"><section class="modal drawer room-configuration" role="dialog" aria-modal="true" aria-label="发送方配置"><header class="modal-header"><h2>${e(c?.name||config.champion)} · ${e(from)}的配置</h2><button class="btn quiet small" data-action="close">关闭</button></header><div class="drawer-content"><p class="section-copy">${e(roleName(config.role))} · ${config.mode==='hex'?'海克斯大乱斗':'召唤师峡谷'} · 发送方资料 ${e(config.patch)} · 本机资料 ${e(data.patch)}</p><p>这是点击时取得的发送方配置快照；装备是计划，符文尚未应用到你的客户端。</p>${config.patch!==data.patch?'<p class="callout warning">双方资料版本不同，名称按本机资料显示，原编号保留；先核对版本，不能采用替代符文页。</p>':''}${config.basis?`<section class="detail-section"><h3>发送方配置来源 · ${e(config.basis.title)}</h3><p>${e(config.basis.note)}</p><p>符文：${e(config.basis.rune)}</p><p>加点：${e(config.basis.skill)}</p></section>`:'<p class="callout warning">旧共享未提供来源说明，请与发送方核对。</p>'}${strategyHtml}${gearHtml}${runeHtml}${skillHtml}${adoptionError?`<p class="callout warning">${e(adoptionError)}</p>`:''}<div class="detail-actions"><button class="btn small" data-action="room-copy-configuration">复制发送方配置</button><button class="btn primary small" data-action="room-adopt-configuration" ${adoptionError?'disabled':''}>采用符文${config.skills?'、加点':''}与召唤师技能${play?'及组合职责':''}</button></div><p class="bottom-note">采用只编辑本机英雄配置。装备计划仍以上面的发送方快照为准，本机装备参考可能不同；要写符文，需在随后打开的配置页核对英雄并明确点击替换。</p></div></section></div>`;
}
