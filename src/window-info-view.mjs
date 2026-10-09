import {escape as e} from './ui.mjs';
import {phaseLabel} from './core/guide.mjs';
const size=r=>r?`${r.width} × ${r.height}`:'未检测到';
const own=(window,empty)=>window?`${size(window.bounds)} DIP · ${window.minimized?'已最小化':window.visible?'显示中':'已隐藏'}`:empty;
export function windowInfoText(info){
 if(!info)return '窗口资料暂不可用';
 return [`开黑搭子 ${info.version} · 游戏资料 ${info.dataVersion}`,`读取时间 ${info.at}`,
  ...info.displays.map(d=>`屏幕${d.number}${d.primary?'（主屏）':''}：${Math.round(d.scaleFactor*100)}%缩放；桌面${size(d.bounds)} DIP；按缩放换算约${size(d.pixelReference)}像素；可用区${size(d.workArea)} DIP`),
  `客户端连接：${info.client.connected?'已连接':'未连接'} · ${info.client.phase}`,`助手：${own(info.main,'尚未打开')}${info.companion?' · 贴边模式':''}`,
  `指引：${own(info.guide,'尚未打开')}${info.guide?` · ${info.guide.ball?'小图标':info.guide.collapsed?'收起':'展开'} · 鼠标穿透${info.guide.clickThrough?'开启':'关闭'}`:''}`,
  `客户端窗口：${info.observedClient?size(info.observedClient.pixels)+' 像素 · '+size(info.observedClient.dip)+' DIP':'未检测到当前外框'}`,
  `游戏窗口：${info.observedGame?size(info.observedGame.pixels)+' 像素 · '+size(info.observedGame.dip)+' DIP':'未检测到当前外框'}`,
  '游戏窗口外框不等于游戏设置中的渲染分辨率。助手只调整自己的窗口。'].join('\n');
}
export function windowInfoDialog(info,error=''){
 const observed=(window)=>window?`${size(window.pixels)} 像素 · ${size(window.dip)} DIP${window.minimized?' · 已最小化':''}`:'未检测到当前外框';
 return `<div class="modal-backdrop" data-backdrop="true"><section class="modal drawer presentation-drawer" role="dialog" aria-modal="true" aria-label="窗口检查" data-window-info="${e(info?.at||'')}"><header class="modal-header" style="background:#17212e"><h2>窗口检查</h2><button class="btn quiet small" data-action="close">关闭</button></header><div class="drawer-content"><p class="section-copy">${info?`助手 ${e(info.version)} · 游戏资料 ${e(info.dataVersion)}<br>${phaseLabel(info.client.phase)} · 读取于 ${e(new Date(info.at).toLocaleTimeString('zh-CN',{hour12:false}))}`:e(error||'正在读取屏幕和窗口…')}</p>${error&&info?`<p class="callout warning">${e(error)} · 上方保留上次检查资料</p>`:''}${info?`${info.displays.map(d=>`<div class="callout"><b>屏幕 ${d.number}${d.primary?' · 主屏':''}　${Math.round(d.scaleFactor*100)}% 缩放</b><p>桌面 ${size(d.bounds)} DIP · 可用区 ${size(d.workArea)} DIP<br>按缩放换算：约 ${size(d.pixelReference)} 像素</p></div>`).join('')||'<p class="callout warning">当前屏幕资料不可用。</p>'}<div class="setting-row"><div><b>助手窗口</b><p>${own(info.main,'尚未打开')}${info.companion?' · 贴边模式':''}</p></div></div><div class="setting-row"><div><b>局内指引</b><p>${own(info.guide,'尚未打开')}${info.guide?`<br>${info.guide.ball?'小图标':info.guide.collapsed?'收起':'展开'} · 鼠标穿透${info.guide.clickThrough?'开启':'关闭'}`:''}</p></div></div><div class="setting-row"><div><b>客户端 / 游戏外框</b><p>客户端：${observed(info.observedClient)}<br>游戏：${observed(info.observedGame)}</p></div></div>`:''}<div class="callout"><b>游戏缩成小窗时</b><p>在游戏设置中检查显示模式和分辨率。想让游戏铺满屏幕时，可选无边框或窗口，并核对游戏分辨率与 Windows 显示设置；上方游戏外框不能确认游戏里的渲染分辨率。</p><p>独占全屏可能盖住指引。指引找不到时可点下面的“找回指引”；无法点击时，从托盘切换交互，或使用 Ctrl + Shift + H。</p></div><div class="detail-actions"><button class="btn small" data-action="window-info-refresh">重新检查</button><button class="btn small" data-action="window-info-copy" ${info?'':'disabled'}>复制窗口资料</button><button class="btn primary small" data-action="recover-guide">找回指引</button></div><p class="bottom-note">只在本机显示，复制由你点击。尺寸使用 DIP（按显示缩放计算的窗口单位）；像素参考按当前缩放换算，可能有取整偏差；游戏分辨率以 Windows 显示设置为准。助手只调整自己的窗口。</p></div></section></div>`;
}
