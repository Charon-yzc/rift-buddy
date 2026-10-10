// Room panel (CHA-31): create/join/scan controls for the LAN transport plus
// the relay form, and the member lineups both show. Pure render helpers so
// the panel can be unit tested without Electron. Clicking a shared champion
// opens that champion's local build view.
import {escape as e,icon,portrait,button} from './ui.mjs';
import {ROLES} from './core/rules.mjs';

const roleName=id=>ROLES.find(r=>r.id===id)?.name||id;
const LINK_TEXT={connecting:'连接中',connected:'已连接',reconnecting:'重连中',failed:'连接失败',idle:''};

function memberCard(member,champ){
 const share=member.share;
 const lineup=share&&Array.isArray(share.lineup)?share.lineup:[];
 const champions=lineup.filter(slot=>slot&&slot.champion);
 const mode=share?.pick?.mode==='hex'?'hex':'rift';
 const chips=champions.map(slot=>{
  const c=champ(slot.champion);
  return `<button class="room-champ" data-action="room-build" data-id="${e(slot.champion)}" data-role="${e(slot.role)}" data-mode="${e(mode)}" title="${e(roleName(slot.role))} · 查看本地配置">${c?portrait(c,'sm'):''}<span>${e(c?.name||slot.champion)}</span></button>`;
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
   <p class="bottom-note">中继地址需要你自己按 <code>docs/room-relay-deploy.md</code> 部署；助手不内置任何公共中继，也不会把你的房间发到别处。口令只以哈希形式发给中继，服务器看不到明文。</p>`
  :`<div class="room-actions">${button('room-host',busy?'处理中…':'创建房间','team','primary small',busy?'disabled':'')}${button('room-scan',scanning?'扫描中…':'扫描局域网房间','search','small',scanning?'disabled':'')}</div>
   <div class="room-join"><label>邀请码<input id="room-invite" value="${e(invite)}" placeholder="192.168.1.5:47833#482913" aria-label="邀请码"></label><label>口令<input id="room-pin" value="${e(pin)}" placeholder="6 位数字" inputmode="numeric" aria-label="房间口令"></label>${button('room-join',busy?'处理中…':'加入房间','arrow','small',busy?'disabled':'')}</div>
   ${results?`<div class="room-scan">${results.length?results.map(item=>`<button data-action="room-fill" data-invite="${e(`${item.host}:${item.port}#${item.room}`)}">房间 ${e(item.room)} · ${e(item.host)}</button>`).join(''):'<p class="bottom-note">没有发现房间。确认在同一网络，或让房主把邀请码发给你。</p>'}</div>`:''}
   <p class="bottom-note">用 Radmin VPN、蒲公英等工具把队友连成虚拟局域网后，同样可以扫描或粘贴邀请码加入。首次创建时如果弹出 Windows 防火墙提示，请选择允许；连不上先检查防火墙和虚拟局域网。房间不需要额外读取客户端数据。</p>`;
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
 const invites=isHost&&Number.isInteger(room.port)?(addresses||[]).map(item=>`${item.address}:${room.port}#${room.room}`):[];
 const head=isRelay
  ?`<div><h3>${icon('link')}开黑房间 · ${e(room.room)}</h3><p>${room.members.length} 人在线 · 经中继</p></div>`
  :`<div><h3>${icon('link')}开黑房间 · ${e(room.room)}</h3><p>${room.members.length} 人在线${isHost?` · 口令 ${e(room.pin||'')}`:''}</p></div>`;
 const badge=isRelay
  ?`<span class="badge room-link${room.link==='connected'?'':' warn'}">${link||'中继'}</span>`
  :`<span class="badge">${isHost?'房主':'成员'}</span>`;
 const inviteBlock=isRelay
  ?`<div class="room-invites"><p>邀请队友（把下面两项发给他们）：</p><div class="chips"><button data-action="room-copy-relay">${icon('copy')}${e(`中继 ${room.relayUrl||''}｜房间 ${room.room}`)}</button></div><div class="room-invite-foot"><span class="bottom-note">队友在“中继”里填同一个中继地址、房间码和口令即可加入。${room.link==='reconnecting'?'连接中断，正在重连，期间分享可能延迟。':room.link==='failed'?'连续重连失败已停止，请离开房间后重新加入。':''}</span></div></div>`
  :isHost?`<div class="room-invites"><p>邀请队友（邀请码和口令一起发）：</p><div class="chips">${invites.length?invites.map(item=>`<button data-action="room-copy-invite" data-invite="${e(item)}">${icon('copy')}${e(item)}</button>`).join(''):'<span class="bottom-note">暂未检测到局域网地址；可让队友手动扫描。</span>'}</div><div class="room-invite-foot">${button('room-refresh-addresses','刷新本机地址','refresh','quiet small')}<span class="bottom-note">口令 ${e(room.pin||'')}。队友在“加入房间”里粘贴邀请码并填入口令即可。</span></div></div>`
  :'';
 return `<section class="panel room-panel"><div class="panel-head">${head}${badge}${button('room-leave','离开房间','','quiet small')}</div>
  <div class="panel-body">
   ${inviteBlock}
   <div class="room-share-row">${button('room-publish','分享我的阵容','upload','primary small')}<span class="bottom-note">进入房间后阵容会自动同步；队友点击英雄即可查看本地配置。</span></div>
   <div class="room-members" aria-live="polite">${room.members.map(member=>memberCard(member,champ)).join('')}</div>
  </div></section>`;
}

export function roomPanel({room,nick='队友',transport='lan',busy=false,scanning=false,scanResults=null,error='',invite='',pin='',relayUrl='',relayRoom='',addresses=[],champ}){
 if(!room||room.mode==='idle')return roomIdle({nick,transport,busy,scanning,scanResults,error,invite,pin,relayUrl,relayRoom});
 return roomActive({room,addresses,champ});
}
