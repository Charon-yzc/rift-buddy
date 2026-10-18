import {escape as e,button,dateLabel} from './ui.mjs';
import {UPDATE_MIRROR_PRESETS,GITEE_REPOSITORY_URL} from './core/app-update.mjs';
const fmtBytes=v=>!Number.isFinite(v)?'大小未知':v>=1048576?`约 ${Math.round(v/1048576)} MB`:`约 ${Math.max(1,Math.round(v/1024))} KB`;
const transferStatus=u=>{
 const source=u.fallbackNotice?'（镜像加速失败，已改用直连）':u.via==='gitee'?'（Gitee 国内镜像，自动合并分卷）':u.via==='mirror'?'（镜像加速）':'';
 return `${u.phase==='paused'?'已暂停':'正在下载'}${u.kind==='incremental'?'增量包':u.kind==='full'?'完整包':''} v${u.release?.version||''} · 已下载 ${fmtBytes(u.received)}${u.total?` / ${fmtBytes(u.total)}`:''}${source}`;
};
export function patchAppUpdateProgress(document,update){
 const panel=document.querySelector('[data-app-update-phase]');
 if(update.phase!=='downloading'||panel?.dataset.appUpdatePhase!==update.phase)return false;
 const message=panel.querySelector('#app-update-message'),bar=panel.querySelector('progress');
 if(!message||!bar)return false;
 message.textContent=transferStatus(update);
 if(update.total){bar.max=update.total;bar.value=update.received||0;}else bar.removeAttribute('value');
 return true;
}
export function appUpdatePanel({version,preferences,update}){
 const u=update||{phase:'idle'},busy=['checking','downloading','verifying','installing','pausing','cancelling'].includes(u.phase);
 const r=u.release||null;
 const head=`<div class="setting-row"><b>启动时检查更新</b><button class="switch ${preferences?.appUpdateCheck!==false?'on':''}" data-action="app-update-check-toggle" role="switch" aria-checked="${preferences?.appUpdateCheck!==false}" aria-label="启动时检查软件更新" title="每天检查一次；下载和安装由你确认"><i></i></button></div>`;
 const downloadOptions=`<div class="setting-row"><div><b>GitHub 下载代理</b><p>使用 GitHub 时可经第三方代理下载安装包，校验文件直接从 GitHub 获取；代理失败自动改直连。选择 Gitee 时，分卷和校验清单直接从 Gitee 获取。各源速度与可用性会变化。</p></div></div><div class="catalog-url"><input id="update-mirror" type="url" placeholder="https://gh-proxy.com（留空则直连）" value="${e(preferences?.updateMirror||'')}" maxlength="200" />${UPDATE_MIRROR_PRESETS.map(m=>button('app-update-mirror-preset',new URL(m).hostname,'','small',`data-url="${e(m)}"`)).join('')}${button('app-update-mirror-clear','恢复直连','','small')}</div>`;
 const sourceLinks=`<div class="setting-row"><div><b>GitHub 与 Gitee 国内镜像</b><p>检查两个发布源的版本。选择 Gitee 后自动下载分卷、合并并校验；同版镜像不可用时使用 GitHub。${r?.giteeVersion?`本次查到 Gitee v${e(r.giteeVersion)}。`:'Gitee 附件是否齐备以发行版页面为准。'}</p></div></div><div style="display:flex;gap:9px;flex-wrap:wrap">${button('app-update-mirror-preset',preferences?.updateMirror===GITEE_REPOSITORY_URL?'已选 Gitee 国内镜像':'优先 Gitee 国内镜像','','small',`data-url="${GITEE_REPOSITORY_URL}"`)}${button('link','Gitee 国内下载','arrow','small',`data-url="${GITEE_REPOSITORY_URL}/releases"`)}${button('link','GitHub 下载','arrow','small','data-url="https://github.com/Legender134/rift-buddy/releases"')}</div><p class="bottom-note">网页下载请把同版全部分卷和 Merge.cmd 放在同一目录，双击 Merge.cmd 校验合并，再打开生成的 Setup.exe。应用内更新自动完成合并，不运行网页脚本。</p>`;
 const mirrorNote=u.fallbackNotice?'镜像加速失败，已改用直连':u.via==='gitee'?'（Gitee 国内镜像，自动合并分卷）':u.via==='mirror'?'（镜像加速）':'';
 const status=u.dismissed?`已忽略新版 v${e(r?.version||'')}；手动检查可重新下载`:u.phase==='idle'?'尚未检查软件更新':u.phase==='checking'?'正在检查新版本…':u.phase==='downloading'?`正在下载${u.kind==='incremental'?'增量包':''} v${e(r?.version||'')} · 已下载 ${fmtBytes(u.received)}${u.total?` / ${fmtBytes(u.total)}`:''}${mirrorNote}`:u.phase==='verifying'?`正在校验 v${e(r?.version||'')} 安装包完整性…${mirrorNote}`:u.phase==='ready'?`新版 v${e(r?.version||u.record?.version||'')} 已下载并通过校验${u.record?.fallback?'（镜像加速失败，已改用直连）':u.record?.via==='gitee'?'（Gitee 国内镜像，分卷已合并）':u.record?.via==='mirror'?'（经镜像下载）':''}，可退出并安装`:u.phase==='available'?`发现新版 v${e(r?.version||'')}（${dateLabel(r?.publishedAt)}）`:u.phase==='error'?`检查未完成：${e(u.error||'请稍后重试')}`:`当前版本 v${e(version||'未知')} · 已是最新`;
 const displayStatus=['downloading','paused'].includes(u.phase)?e(transferStatus(u)):u.phase==='pausing'?'正在暂停，保留已下载内容…':u.phase==='cancelling'?'正在取消并清理下载…':status;
 const actions=u.phase==='available'
  ?`${r.manualOnly?'<p class="bottom-note">此版仅提供网页分卷下载，请按发布说明还原安装包。</p>':button('app-update-download','下载新版','download','primary')}${button('link','查看发布说明','arrow','small',`data-url="${e(r.url)}"`)}${button('app-update-dismiss','忽略此版','','quiet small')}`
  :u.phase==='downloading'
  ?`${button('app-update-pause','暂停','','small','title="保留已下载内容，继续时接着下载"')}${button('app-update-cancel','取消','','small','title="终止下载并清理已下载内容"')}`
  :u.phase==='paused'
  ?`${button('app-update-download','继续下载','download','primary')}${button('app-update-cancel','取消','','small','title="清理已下载内容"')}`
  :u.phase==='verifying'
  ?button('app-update-cancel','取消','','small')
  :u.phase==='pausing'||u.phase==='cancelling'
  ?button('app-update-cancel',u.phase==='pausing'?'正在暂停…':'正在取消…','','small','disabled')
  :u.phase==='installing'
  ?`${button('app-update-install','正在启动安装…','check','primary','disabled')}<p class="bottom-note">正在复验安装包并启动安装程序；启动失败会保留助手和重试入口。</p>`
  :u.phase==='ready'
  ?`${button('app-update-install','退出并安装','check','primary')}${u.release?.url?button('link','查看发布说明','arrow','small',`data-url="${e(u.release.url)}"`):''}${button('app-update-delete','删除安装包','trash','small')}<p class="bottom-note">${u.record?.kind==='incremental'?'增量包':'完整包'} ${fmtBytes(u.record?.bytes)} · SHA-256 校验通过。安装时关闭旧程序并保留玩家资料。</p>`
  :`${button('app-update-check',busy?'检查中…':'检查软件更新','refresh','small',busy?'disabled':'')}`;
 return `<section class="panel" data-app-update-phase="${e(u.phase)}"><div class="panel-head"><h3>软件更新</h3><span class="badge">${u.phase==='available'||u.phase==='ready'?'有新版':'当前 v'+e(version||'未知')}</span></div><div class="panel-body">${head}<div class="setting-row"><div><b>新版状态</b><p><span id="app-update-message" role="status">${u.phase==='installing'?'正在复验并启动安装程序…':displayStatus}</span></p>${u.phase==='ready'&&u.error?`<p role="alert">安装未启动：${e(u.error)}。可重试“退出并安装”。</p>`:''}</div><div style="display:flex;gap:9px;flex-wrap:wrap">${actions}</div></div>${['downloading','verifying','paused','pausing'].includes(u.phase)?`<progress ${u.total?`max="${u.total}" value="${u.received||0}"`:''} style="width:100%"></progress>`:''}<details class="ui-help update-download-options"><summary>下载来源与校验</summary>${sourceLinks}${downloadOptions}<p class="bottom-note">安装包来自本仓库发布页，按对应发布源的校验文件或分卷清单核对 SHA-256；只证明与上传一致，不做来源认证声明。</p></details></div></section>`;
}
