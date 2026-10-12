import {escape as e,button,dateLabel} from './ui.mjs';
const fmtBytes=v=>!Number.isFinite(v)?'大小未知':v>=1048576?`约 ${Math.round(v/1048576)} MB`:`约 ${Math.max(1,Math.round(v/1024))} KB`;
export function appUpdatePanel({version,preferences,update}){
 const u=update||{phase:'idle'},busy=u.phase==='checking'||u.phase==='downloading';
 const r=u.release||null;
 const head=`<div class="setting-row"><div><b>启动时检查软件更新</b><p>每天检查一次发布页；只检查、不下载，离线时静默跳过。</p></div><button class="switch ${preferences?.appUpdateCheck!==false?'on':''}" data-action="app-update-check-toggle" role="switch" aria-checked="${preferences?.appUpdateCheck!==false}" aria-label="启动时检查软件更新"><i></i></button></div>`;
 const status=u.phase==='checking'?'正在检查新版本…':u.phase==='downloading'?`正在下载 v${e(r?.version||'')} · 已下载 ${fmtBytes(u.received)}${u.total?` / ${fmtBytes(u.total)}`:''}`:u.phase==='ready'?`新版 v${e(r?.version||u.record?.version||'')} 已下载并通过校验，可退出并安装`:u.phase==='available'?`发现新版 v${e(r?.version||'')}（${dateLabel(r?.publishedAt)}）`:u.phase==='error'?`检查未完成：${e(u.error||'请稍后重试')}`:`当前版本 v${e(version||'未知')} · 已是最新`;
 const actions=u.phase==='available'
  ?`${button('app-update-download','下载新版','download','primary')}${button('link','查看发布说明','arrow','small',`data-url="${e(r.url)}"`)}${button('app-update-dismiss','忽略此版','','quiet small')}`
  :u.phase==='downloading'
  ?`${button('app-update-cancel','取消下载','','small')}`
  :u.phase==='ready'
  ?`${button('app-update-install','退出并安装','check','primary')}${button('app-update-delete','删除安装包','trash','small')}<p class="bottom-note">安装包 ${fmtBytes(u.record?.bytes)} · SHA-256 已与发布页校验一致。点击后启动安装程序并退出助手，按向导完成安装即可。</p>`
  :`${button('app-update-check',busy?'检查中…':'检查软件更新','refresh','small',busy?'disabled':'')}`;
 return `<section class="panel"><div class="panel-head"><h3>软件更新</h3><span class="badge">${u.phase==='available'||u.phase==='ready'?'有新版':'当前 v'+e(version||'未知')}</span></div><div class="panel-body">${head}<div class="setting-row"><div><b>新版状态</b><p><span id="app-update-message" role="status">${status}</span></p></div><div style="display:flex;gap:9px;flex-wrap:wrap">${actions}</div></div>${u.phase==='downloading'&&u.total?`<progress max="${u.total}" value="${u.received||0}" style="width:100%"></progress>`:''}<p class="bottom-note">安装包来自本仓库发布页，下载后按发布页校验文件核对 SHA-256；只证明与上传一致，不做来源认证声明。</p></div></section>`;
}
