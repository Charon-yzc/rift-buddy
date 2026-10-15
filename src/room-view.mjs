// Room panel: LAN and opt-in relay controls with exact sender configuration snapshots.
import {escape as e,icon,portrait,button} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {roomPreparation} from './core/room-configuration.mjs';
import {SHARDS} from './core/builds.mjs';
import {creativeMemberCombo} from './core/creative-plan.mjs';
import {duoPlayView} from './duo-play-view.mjs';
import {DEFAULT_RELAY_URL} from './core/room-relay.mjs';
import {roomLineupIdentity} from './core/room-lineup.mjs';

const roleName=id=>ROLES.find(r=>r.id===id)?.name||id;
const LINK_TEXT={connecting:'连接中',connected:'已连接',reconnecting:'重连中',failed:'连接失败',idle:''};
const attributeLines=plan=>plan?[
 `${plan.title}：${plan.priority.join(' > ')}`,plan.action,plan.note,
 `属性方案来源：${plan.source} · ${plan.patch} · 整理于 ${plan.reviewedAt}`,
 `优先级来源：${plan.sourceUrl}`,...plan.mechanismUrls.map(url=>`机制来源：${url}`),
 '属性方案供查看与复制，不会作为 QWER 序列采用；助手未读取已投属性点。',
]:[];

function memberCard(member,champ){
 const share=member.share;
 const lineup=share&&Array.isArray(share.lineup)?share.lineup:[];
 const champions=lineup.filter(slot=>slot&&slot.champion);
 const mode=share?.mode||share?.pick?.mode||null;
 const selected=share?.pick;
 const hasPick=selected?.champion&&ROLES.some(r=>r.id===selected.role);
 const pickMatches=hasPick&&selected.mode===mode&&champions.some(slot=>slot.champion===selected.champion&&slot.role===selected.role);
 const personal=hasPick?`<p class="room-personal">个人选择：<b>${e(champ(selected.champion)?.name||selected.champion)}</b> · ${e(roleName(selected.role))}${pickMatches?'':' <span>（与共享阵容不一致，请核对）</span>'}</p>`:'<p class="room-personal">个人选择未确认</p>';
 const chips=champions.map(slot=>{
  const c=champ(slot.champion);
  const config=share?.configurations?.find(s=>s.champion===slot.champion&&s.role===slot.role);
  const own=pickMatches&&slot.champion===selected.champion&&slot.role===selected.role;
  return `<button class="room-champ${own?' is-pick':''}" data-action="room-build" data-id="${e(slot.champion)}" data-role="${e(slot.role)}" data-mode="${e(config?.mode||mode||'')}" data-member="${e(member.nick)}" ${!config&&mode&&!(['rift','hex'].includes(mode))?'disabled':''} title="${own?'本人选择 · ':''}${e(roleName(slot.role))} · ${config?'查看发送方配置':'未收到配置，查看说明'}">${c?portrait(c,'sm'):''}<span>${own?'<strong class="room-pick-label">本人</strong> ':''}${e(c?.name||slot.champion)}${config?' · '+(config.mode==='hex'?'海克斯配置':'符文与加点'):!mode?' · 模式未知 · 未收到配置':!['rift','hex'].includes(mode)?' · 此模式暂不支持':' · 未收到配置'}</span></button>`;
 }).join('');
 const updated=share?.at?`更新于 ${new Date(share.at).toLocaleTimeString('zh-CN')}`:'还没分享阵容';
 const configurationNote=!member.self&&champions.length&&!share?.configurations?.length?'<p class="bottom-note">已收到阵容，尚未收到这位队友的配置；本地参考不代表队友所选。</p>':'';
 return `<article class="room-member"><header><b>${e(member.nick)}</b>${member.self?'<span class="badge">我</span>':''}<small>${updated}</small></header>${personal}${configurationNote}${chips?`<div class="room-champs">${chips}</div>`:''}</article>`;
}
export function roomSharesView(room,champ,{clickPrepare=true,heroAction=null,compact=false,adoptedShare='',allowUnknownRift=false,allowRiftAdoption=true}={}){
 const members=(room?.members||[]).filter(m=>!m.self&&m.share?.lineup?.some(s=>s.champion));
 if(compact){
  const incoming=members.filter(m=>roomLineupIdentity(m.share,m.nick)!==adoptedShare).sort((a,b)=>b.share.at-a.share.at);
  const card=m=>{const share=m.share,known=share.mode==='rift'&&allowRiftAdoption,unknown=share.mode===undefined,signature=roomLineupIdentity(share,m.nick);return `<article class="companion-incoming"><div class="companion-incoming-head"><b>${e(m.nick)}发来的阵容</b>${button('room-adopt-lineup',unknown?'按峡谷采用':'采用阵容','','primary small',`data-member="${e(m.nick)}" data-share="${signature}" ${known||unknown&&allowUnknownRift?'':'disabled'}`)}</div><div class="companion-incoming-champs">${share.lineup.filter(s=>s.champion).map(s=>{const action=heroAction?.(s.champion,s.role),prepare=clickPrepare&&known&&(action?.prepare===true),config=share.configurations?.some(c=>c.champion===s.champion&&c.role===s.role);return `<button class="room-champ" data-action="${prepare?'room-prepare':'room-build'}" data-id="${e(s.champion)}" data-role="${e(s.role)}" data-mode="${e(share.mode||'')}" data-member="${e(m.nick)}" title="${e(roleName(s.role))} · ${e(action?.label||'查看配置')} · ${config?'发送方配置':'未收到配置'}">${portrait(champ(s.champion),'sm')}<span>${e(champ(s.champion)?.name||s.champion)}</span></button>`;}).join('')}</div><small>${unknown?'未收到模式；仅在当前峡谷选人时可按峡谷采用。':known?'采用只调整助手阵容；点击自己的英雄再预选与配置。':'当前模式仅供查看。'}${share.configurations?.length?'':' 未收到配置，采用后使用本机参考。'}</small></article>`;};
  return incoming.length?`<section class="companion-room-shares" aria-label="收到的队友阵容">${card(incoming[0])}${incoming.length>1?`<details data-companion-disclosure="room-other-shares"><summary>其他队友方案 · ${incoming.length-1} 份</summary>${incoming.slice(1).map(card).join('')}</details>`:''}</section>`:'';
 }
 return members.length?`<section class="companion-section companion-room-shares" aria-label="收到的队友阵容"><h3>队友发来的阵容</h3>${clickPrepare?'<p class="companion-hint">已确认峡谷模式时，点击英雄会预选并配置；锁定由你完成。模式未知时先查看说明，未收到配置时使用本机参考。</p>':''}${members.map(m=>memberCard(m,champ).replace(/<button([^>]*data-action="room-build"[^>]*)>/g,(tag,attrs)=>{const id=attrs.match(/data-id="([^"]+)"/)?.[1],role=attrs.match(/data-role="([^"]+)"/)?.[1];return clickPrepare&&m.share.mode==='rift'&&heroAction?.(id,role)?.prepare===true?tag.replace('data-action="room-build"','data-action="room-prepare"'):tag;})).join('')}</section>`:'';
}

// Two opt-in transports, one nickname. The suggested relay address remains
// editable and a previously saved custom address takes precedence.
function transportSwitch(current){
 const option=(id,label,note)=>`<button class="room-transport${current===id?' on':''}" data-action="room-transport" data-id="${id}" aria-pressed="${current===id}">${label}<small>${note}</small></button>`;
 return `<div class="room-transports">${option('lan','局域网','同一网络或虚拟局域网')}${option('relay','中继','跨网共享阵容，配置需服务支持')}</div>`;
}

function roomIdle({nick,transport,busy,scanning,scanResults,error,invite,pin,relayUrl,relayRoom,autoEnabled=false,autoSync=true,autoError='',hasPreparationFile,preparationFileBusy}){
 const results=Array.isArray(scanResults)?scanResults.slice(0,64):null;
 const forms=transport==='relay'
  ?`<label class="room-auto"><input type="checkbox" id="room-auto" ${autoEnabled?'checked':''} aria-label="自动连接组队房间"> 自动连接组队房间</label>
   <p class="bottom-note">开启后，进入英雄联盟预组队大厅（非自定义、单人或组队）时，助手用大厅共享标识派生 6 位房间码与口令，自动连上中继并分享你的公开阵容与个人配置；单人时自己就是房主也会进房，房间昵称使用你的公开游戏 ID。每台机器都会按自己的大厅标识派生房间码，组队后一起切换到新组队标识的房间，单人码作废，最终以房主/当前组队的房间为准；若没汇合就复制房主的房间码与口令手动加入。派生口令知道组队数据即可算出，不是强认证。默认关闭；中继运营者与同房间成员能看到分享内容。${autoEnabled&&!autoSync?'当前“自动同步”已关闭：自动连接不会触发，已连接的自动房间也会关闭。':''}${autoEnabled?'':'当前关闭：下面的房间码与口令仍可手动加入。'}</p>
   ${autoError&&autoEnabled&&autoSync?`<p class="callout warning">${e(`上次自动连接失败：${autoError}；稍后会自动重试，换一个组队也会重试。`)}</p>`:''}
   <div class="room-join"><label>中继地址<input id="room-relay-url" value="${e(relayUrl)}" placeholder="wss://room.你的域名" spellcheck="false" aria-label="中继地址"></label><label>房间码<input id="room-relay-room" value="${e(relayRoom)}" placeholder="6 位数字" inputmode="numeric" maxlength="6" aria-label="中继房间码"></label><label>口令<input id="room-pin" value="${e(pin)}" placeholder="6 位数字" inputmode="numeric" maxlength="6" aria-label="房间口令"></label>${button('room-relay-join',busy?'处理中…':'加入中继房间','arrow','small',busy?'disabled':'')}</div>
   <p class="bottom-note">你和队友填同一个中继地址、房间码和口令，再各自点击加入；昵称是房间里显示的名字。地址可改成你信任的自建中继。</p>
   <details class="more-builds room-relay-help"><summary>怎么用中继房间</summary><ol class="play-steps"><li>切到“中继”，使用预填地址 ${e(DEFAULT_RELAY_URL)}，或和队友约定同一个可信地址。</li><li>约定任意 6 位数字房间码，例如 482913，所有人填写相同的房间码。</li><li>另定 6 位数字口令，只在线下或微信私聊告诉队友，别发到公开的地方。</li><li>填写昵称后各自点击“加入中继房间”。加入后自动共享助手中所选公开阵容；中继支持时也会转发配置。队友点英雄头像，收到配置时查看发送方快照，未收到时先提示缺失，可主动打开本机参考。采用和写入符文由本人点击确认。</li></ol></details>
   <p class="bottom-note">公开阵容与所选配置会发送给该中继并转给房间成员，中继运营者也能看到所发内容。六位口令虽只发送哈希，仍可被枚举，不是强身份认证。</p>`
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
   ${preparationFileControls(hasPreparationFile,preparationFileBusy)}
  </div></section>`;
}

function roomActive({room,addresses,champ,hasPreparationFile,preparationFileBusy,autoQuiet=false}){
 const isRelay=room.transport==='relay';
 const isHost=room.mode==='host';
 const link=LINK_TEXT[room.link]||'';
 const invites=isHost&&Number.isInteger(room.port)?(addresses||[]).map(item=>({name:item.name||'本机地址',invite:`${item.address}:${room.port}#${room.room}`})):[];
 const head=isRelay
  ?`<div><h3>${icon('link')}开黑房间 · ${e(room.room)}</h3><p>${room.members.length} 人在线${room.auto?' · 自动连接':''} · 经中继</p></div>`
  :`<div><h3>${icon('link')}开黑房间 · ${e(room.room)}</h3><p>${room.members.length} 人在线${isHost?` · 口令 ${e(room.pin||'')}`:''}</p></div>`;
 const badge=isRelay
  ?`<span class="badge room-link${room.link==='connected'?'':' warn'}">${room.auto?'自动 · 组队房间 · ':''}${link||'中继'}</span>`
  :`<span class="badge">${isHost?'房主':'成员'}</span>`;
 const inviteBlock=isRelay
  ?`<div class="room-invites"><p>邀请队友（复制下面的地址${room.auto?'、房间码和口令':'和房间码'}${room.auto?'':'，口令请另行告知'}）：</p><div class="chips"><button data-action="room-copy-relay">${icon('copy')}${e(room.auto?`中继 ${room.relayUrl||''}｜房间 ${room.room}｜口令 ${room.pin||''}`:`中继 ${room.relayUrl||''}｜房间 ${room.room}`)}</button></div><div class="room-invite-foot"><span class="bottom-note">${room.auto?'口令由大厅共享标识派生，只用于同队汇合，不是强认证。旧版队友或派生不一致时，可按上面的地址、房间码与口令手动加入。':'队友在“中继”里填同一个中继地址、房间码和口令即可加入。'}${room.link==='reconnecting'?'连接中断，正在重连，期间分享可能延迟。':room.link==='failed'?(room.auto?'连续重连失败已停止；可先复制上面的房间码与口令，离开后本组队不再自动重连（重启助手后会重新尝试）。':'连续重连失败已停止，请离开房间后重新加入。'):''}${room.auto&&autoQuiet?'暂时没看到队友：可以把上面的房间码和口令发给队友手动加入，或让队友确认也开启了自动连接。':''}</span></div></div>`
  :isHost?`<div class="room-invites"><p>邀请队友（邀请码和口令一起发）：</p><div class="chips">${invites.length?invites.map(item=>`<button data-action="room-copy-invite" data-invite="${e(item.invite)}">${icon('copy')}${e(item.name)} · ${e(item.invite)}</button>`).join(''):'<span class="bottom-note">暂未检测到局域网地址；可让队友手动扫描。</span>'}</div><div class="room-invite-foot">${button('room-refresh-addresses','刷新本机地址','refresh','quiet small')}<span class="bottom-note">口令 ${e(room.pin||'')}。队友在“加入房间”里粘贴完整邀请即可；裸邀请码需另填口令。</span></div></div>`
  :'';
 return `<section class="panel room-panel"><div class="panel-head">${head}${badge}${button('room-leave','离开房间','','quiet small')}</div>
  <div class="panel-body">
   ${inviteBlock}
   <div class="room-share-row">${button('room-publish',isRelay?'重新分享当前选择':'分享我的阵容与配置','upload','primary small')}<span class="bottom-note">进入房间后自动分享阵容、装备、完整符文、召唤师技能、加点与组合分工；队友点英雄查看发送方配置。${isRelay?'仅展示实际收到的配置，旧版队友或中继未转发时会提示缺失。':''}不会自动改动队友的阵容或客户端。</span></div>
   <div class="room-members" aria-live="polite">${room.members.map(member=>memberCard(member,champ)).join('')}</div>
   ${preparationFileControls(hasPreparationFile,preparationFileBusy)}
  </div></section>`;
}

export function roomPanel({room,nick='队友',transport='lan',busy=false,scanning=false,scanResults=null,error='',invite='',pin='',relayUrl=DEFAULT_RELAY_URL,relayRoom='',addresses=[],champ,hasPreparationFile=false,preparationFileBusy=false,autoEnabled=false,autoSync=true,autoError='',autoQuiet=false}){
 if(!room||room.mode==='idle')return roomIdle({nick,transport,busy,scanning,scanResults,error,invite,pin,relayUrl,relayRoom,autoEnabled,autoSync,autoError,hasPreparationFile,preparationFileBusy});
 return roomActive({room,addresses,champ,hasPreparationFile,preparationFileBusy,autoQuiet});
}

export function roomMissingConfigurationDialog({id,role,mode,nick,champ}){
 const champion=champ(id),local=champion&&['rift','hex'].includes(mode);
 const reference=(value,label)=>`<button class="btn small" data-action="room-local-reference" data-id="${e(id)}" data-role="${e(role)}" data-mode="${value}">${label}</button>`;
 const controls=local?reference(mode,'查看本机参考'):!mode&&champion?`<p>未收到游戏模式，请先选择要查看的本机参考模式；这不会确认队友实际在玩的模式。</p><div class="detail-actions">${reference('rift','查看峡谷本机参考')}${reference('hex','查看海克斯本机参考')}</div>`:'<p>当前资料或模式不支持本机配置参考。</p>';
 return `<div class="modal-backdrop" data-backdrop="true"><section class="modal drawer room-configuration" role="dialog" aria-modal="true" aria-label="未收到队友配置"><header class="modal-header"><h2>${e(champion?.name||id)} · 未收到${e(nick)}的配置</h2><button class="btn quiet small" data-action="close">关闭</button></header><div class="drawer-content"><p>目前只收到这位队友的英雄选择，未收到该英雄的装备、符文、召唤师技能和加点。可能是对方版本较旧、尚未分享或中继没有转发；无法据此还原队友配置。</p><p>本机参考使用你自己的资料与已保存选择，不代表队友所选，也不能作为发送方配置采用。</p>${controls}</div></section></div>`;
}

export function roomConfigurationText(config,data,from,strategy){
 const champion=data.champions.find(c=>c.id===config.champion),runes=new Map(data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r.name]))));
 const names=ids=>ids.map(id=>data.items[id]?.name||`装备 #${id}`).join(' → ')||'未提供';
 const order=config.skills||config.first,coverage=order&&order.length<18?`；仅覆盖前 ${order.length} 个技能点；发送方未提供后续逐级加点，后续按游戏内可升级选项核对。`:'';
 const play=strategy?.members?.some(m=>m.champion===config.champion&&m.role===config.role)?creativeMemberCombo(strategy,config.champion,config.role)?.play:null;
 return [`${from} 分享：${champion?.name||config.champion} · ${roleName(config.role)} · ${config.mode==='hex'?'海克斯':'峡谷'} · 资料 ${config.patch}`,
  ...(strategy?[`组合：${strategy.name}；${strategy.plan}`,`窗口：${strategy.window}；停止：${strategy.caution}`]:[]),
  ...(play?Object.values(play.stages).map(stage=>`${stage.label}：${stage.ownAction}\n${stage.steps.join(' → ')}\n窗口：${stage.window}\n停止：${stage.exit}`):[]),
  `出门：${names(config.start)}`,`装备计划：${names(config.items)}`,`鞋子：${names(config.boots)}`,`召唤师技能：${config.spells.map(id=>data.spells[id]?.name||id).join(' / ')}`,
  `完整符文：${config.runes?config.runes.selectedPerkIds.map(id=>runes.get(id)||SHARDS[id]||`符文 #${id}`).join(' / '):'发送方未提供可用符文页'}`,
  ...(config.attributePlan?attributeLines(config.attributePlan):[`${order?.length===3?'开局三点':'逐级加点'}：${order?order.split('').map((s,i)=>`${i+1}级 ${s}`).join(' → '):'发送方未提供后续逐级加点'}${coverage}`]),
  ...(config.priority?[`加点优先：${config.priority.split('').join(' > ')}；仍按游戏内可升级选项核对`]:[]),
  ...(config.basis?[`配置来源：${config.basis.title}；${config.basis.note}`,`符文说明：${config.basis.rune}`,`加点说明：${config.basis.skill}`]:['旧共享未提供来源说明，请与发送方核对']),
  '发送方配置快照；不代表已购买、技能就绪、联合胜率或最优配置。'].join('\n');
}
export function roomConfigurationDialog(config,data,from,strategy,{localStrategy=null,fromFile=false}={}){
 const c=data.champions.find(c=>c.id===config.champion),trees=new Map(data.runes.map(t=>[t.id,t])),runes=new Map(data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r]))));
 const names=ids=>ids.map(id=>e(data.items[id]?.name||`装备 #${id}`)).join(' → ')||'未提供';
 let adoptionError='',adoption=null;try{adoption=roomPreparation(config,data,strategy,{localStrategy});}catch(error){adoptionError=error.message;}
 const keepsLocal=adoption?.creativePlan&&strategy&&adoption.creativePlan.id!==strategy.id;
 const page=config.runes,play=strategy?.members?.some(m=>m.champion===config.champion&&m.role===config.role)?creativeMemberCombo(strategy,config.champion,config.role)?.play:null;
 const strategyHtml=strategy?`<section class="detail-section" data-room-section="strategy"><h3>发送方组合 · ${e(strategy.name)}</h3><p>${e(strategy.plan)}</p><p><b>成立窗口：</b>${e(strategy.window)}</p><p class="decision-caution"><b>停止条件：</b>${e(strategy.caution)}</p>${play?duoPlayView(play):'<p>此英雄不在所分享组合的成员中；上方为单独配置。</p>'}<p class="bottom-note">保存资料 ${e(strategy.dataVersion)} · 机制整理参考，未经真实组合对局验证；不是本局敌人或技能就绪判断。</p></section>`:'';
 const gearHtml=`<section class="detail-section" data-room-section="gear"><h3>发送方装备计划</h3><p>出门：${names(config.start)}</p><p>装备：${names(config.items)}</p><p>鞋子：${names(config.boots)}</p></section>`;
 const runeHtml=`<section class="detail-section" data-room-section="runes"><h3>发送方完整符文与碎片</h3>${page?`<p>${e(trees.get(page.primaryStyleId)?.name||`符文系 #${page.primaryStyleId}`)} / ${e(trees.get(page.subStyleId)?.name||`符文系 #${page.subStyleId}`)}</p><div class="room-runes">${page.selectedPerkIds.map(id=>`<span>${e(runes.get(id)?.name||SHARDS[id]||`未知符文 #${id}`)} <small>#${id}</small></span>`).join('')}</div>`:'<p>发送方未提供可用符文页；海克斯不应用峡谷符文。</p>'}</section>`;
 const order=config.skills||config.first;
 const skillHtml=`<section class="detail-section" data-room-section="skills"><h3>发送方召唤师技能与加点</h3>${config.priority?`<p>加点优先：${e(config.priority.split('').join(' > '))}；按游戏内可升级选项核对。</p>`:''}<p>${config.spells.map(id=>e(data.spells[id]?.name||id)).join(' / ')}</p>${config.attributePlan?attributeLines(config.attributePlan).map(line=>`<p>${e(line)}</p>`).join(''):order?`${order.length<18?`<p>${order.length===3?'开局三点':'部分逐级参考'}：仅覆盖前 ${order.length} 个技能点；发送方未提供后续逐级加点，后续按游戏内可升级选项核对。</p>`:''}<ol class="room-skill-order">${order.split('').map((key,i)=>`<li>${i+1}级 <b>${key}</b></li>`).join('')}</ol>`:'<p>发送方未提供普通逐级加点；特殊英雄属性点另行核对。</p>'}</section>`;
 const sourceHtml=`<section class="detail-section" data-room-section="source">${config.basis?`<h3>发送方配置来源 · ${e(config.basis.title)}</h3><p>${e(config.basis.note)}</p><p>符文：${e(config.basis.rune)}</p><p>加点：${e(config.basis.skill)}</p>`:'<p class="callout warning">旧共享未提供来源说明，请与发送方核对。</p>'}</section>`;
 const nav=`<nav class="room-configuration-nav" aria-label="共享配置分区">${[['runes','符文'],['skills','召唤师技能与加点'],['gear','装备'],...(strategy?[['strategy','组合职责']]:[]),['source','来源说明']].map(([section,label])=>`<button class="btn quiet small" data-action="room-configuration-jump" data-section="${section}">${label}</button>`).join('')}</nav>`;
 return `<div class="modal-backdrop" data-backdrop="true"><section class="modal drawer room-configuration" role="dialog" aria-modal="true" aria-label="发送方配置"><header class="modal-header"><h2>${e(c?.name||config.champion)} · ${e(from)}的配置</h2>${fromFile?button('room-file-preview','全部成员','','quiet small'):''}<button class="btn quiet small" data-action="close">关闭</button></header><div class="drawer-content"><p class="section-copy">${e(roleName(config.role))} · ${config.mode==='hex'?'海克斯大乱斗':'召唤师峡谷'} · 发送方资料 ${e(config.patch)} · 本机资料 ${e(data.patch)}</p><p>这是点击时取得的发送方配置快照；装备是计划，符文尚未应用到你的客户端。</p>${config.patch!==data.patch?'<p class="callout warning">双方资料版本不同，名称按本机资料显示，原编号保留；先核对版本，不能采用替代符文页。</p>':''}${adoptionError?`<p class="callout warning">${e(adoptionError)}</p>`:''}<div class="detail-actions"><button class="btn small" data-action="room-copy-configuration">复制发送方配置</button><button class="btn primary small" data-action="room-adopt-configuration" ${adoptionError?'disabled':''}>采用符文${order?.length===3?'、开局三点':config.skills?'、加点':''}与召唤师技能${keepsLocal?' · 当前本机方案':play?'及组合职责':''}</button></div><p class="bottom-note">${keepsLocal?`采用到本机当前组合「${e(adoption.creativePlan.name)}」；保留本机分工，发送方组合说明另行参考。`:''}采用只编辑本机英雄配置，装备另行参考；写符文仍需在随后配置页核对英雄并明确点击替换。</p>${nav}${runeHtml}${skillHtml}${gearHtml}${strategyHtml}${sourceHtml}</div></section></div>`;
}

function preparationFileControls(hasFile,busy){return `<div class="room-file-controls"><h4>完整准备文件</h4><p class="bottom-note">不用建房也可导出当前所选英雄的装备、符文、加点与组合分工；自行私发给队友，对方先查看再明确采用。文件是固定快照，不会自动同步，不包含收藏备份或客户端账号。</p><div class="room-actions">${button('room-file-export','导出当前准备','download','small',busy?'disabled':'')}${button('room-file-import','打开队友准备','folder','small',busy?'disabled':'')}${hasFile?button('room-file-preview','查看已打开文件','','quiet small'):''}</div></div>`;}
export function roomPreparationFileDialog(share,champ){return `<div class="modal-backdrop" data-backdrop="true"><section class="modal drawer room-configuration" role="dialog" aria-modal="true" aria-label="准备文件"><header class="modal-header"><h2>准备文件 · ${e(share.from)}</h2>${button('close','关闭','','quiet small')}</header><div class="drawer-content"><p>文件记录于 ${e(new Date(share.at).toLocaleString('zh-CN'))} · ${share.mode==='hex'?'海克斯大乱斗':'召唤师峡谷'}。昵称由文件提供，未验证发送者身份；这份快照不会自动更新，也不会直接替换你的阵容或写入客户端。</p><p>选择一位成员，核对配置和版本后再明确采用；装备单独参考，符文仍需本人核对英雄后点击替换。</p><div class="room-champs">${share.configurations.map(c=>`<button class="room-champ" data-action="room-file-build" data-id="${e(c.champion)}" data-role="${e(c.role)}">${champ(c.champion)?portrait(champ(c.champion),'sm'):''}<span>${e(champ(c.champion)?.name||c.champion)} · ${e(roleName(c.role))} · ${e(c.patch)}</span></button>`).join('')}</div>${share.strategy?`<p class="bottom-note">已保留组合「${e(share.strategy.name)}」及其原始分工；查看成员配置时可逐项核对。</p>`:''}</div></section></div>`;}
