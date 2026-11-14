import {escape as e} from './ui.mjs';
import {phaseLabel} from './core/guide.mjs';
const size=r=>r?`${r.width} × ${r.height}`:'未检测到';
const own=(window,empty)=>window?`${size(window.bounds)} DIP · ${window.minimized?'已最小化':window.visible?'已打开':'已隐藏'}`:empty;
const layout=window=>window.layout==='edge'?'贴边':window.layout==='line'?'单行':window.ball?'小图标':window.strip?'文本条':window.collapsed?'收起':'展开';
const guideRows=info=>{
 const widgets=info.guideWidgets;
 const equipment=info.guide;
 const entries=info.guideMode==='hex'?[['海克斯配置',widgets.routes],['双方装备价值',widgets.economy]]:[['指引',equipment],['双方装备价值',widgets.economy],['加点',widgets.skill],['野区规划',widgets.jungle]];
 return entries.filter(([label,window])=>window||['指引','海克斯配置','双方装备价值'].includes(label)).map(([label,window])=>[label,`${own(window,'尚未打开')}${window?` · ${layout(window)}`:''}${window&&window===equipment&&window.layout!=='edge'?` · 鼠标穿透${equipment.clickThrough?'开启':'关闭'}`:''}`]);
};
const fullscreenHelp='小窗已打开但游戏里看不到时，在游戏内按 Esc → 视频 → 窗口模式，选择「无边框」并应用。独占全屏可能盖住桌面小窗。';
const fullscreenDetected='Windows 上次在游戏前台时检测到独占全屏。切回游戏后可在视频设置中改用无边框。';
const processState=info=>info.gameProcessPresent===null?'游戏进程状态未知':info.gameProcessPresent?'检测到游戏进程':'未检测到游戏进程';
export function windowInfoText(info){
 if(!info)return '窗口资料暂不可用';
 return [`开黑搭子 ${info.version} · 游戏资料 ${info.dataVersion}`,`读取时间 ${info.at}`,
  ...info.displays.map(d=>`屏幕${d.number}${d.primary?'（主屏）':''}：${Math.round(d.scaleFactor*100)}%缩放；桌面${size(d.bounds)} DIP；按缩放换算约${size(d.pixelReference)}像素；可用区${size(d.workArea)} DIP`),
  `客户端连接：${info.client.connected?'已连接':'未连接'} · ${info.client.phase}`,`助手：${own(info.main,'尚未打开')}${info.companion?' · 贴边模式':''}`,
  ...(info.guideAutoShow===null?[]:[`开局自动显示：${info.guideAutoShow?'开启':'关闭'}`]),
  ...guideRows(info).map(([label,value])=>`${label}：${value}`),
  `客户端窗口：${info.observedClient?size(info.observedClient.pixels)+' 像素 · '+size(info.observedClient.dip)+' DIP':'未检测到当前外框'}`,
  `游戏窗口：${info.observedGame?size(info.observedGame.pixels)+' 像素 · '+size(info.observedGame.dip)+' DIP':'未检测到当前外框'} · ${processState(info)}`,
  ...(info.gameExclusiveFullscreen?[fullscreenDetected]:[]),
  '窗口已打开表示 Windows 已显示该窗口，游戏画面可能盖住它。游戏窗口外框不等于游戏设置中的渲染分辨率。'].join('\n');
}
export function windowInfoDialog(info,error=''){
 const observed=(window)=>window?`${size(window.pixels)} 像素 · ${size(window.dip)} DIP${window.minimized?' · 已最小化':''}`:'未检测到当前外框';
 const rows=info?guideRows(info).map(([label,value])=>`${label}：${value}`).join('<br>'):'';
 return `<div class="modal-backdrop" data-backdrop="true"><section class="modal drawer presentation-drawer" role="dialog" aria-modal="true" aria-label="窗口检查" data-window-info="${e(info?.at||'')}"><header class="modal-header" style="background:#17212e"><h2>窗口检查</h2><button class="btn quiet small" data-action="close">关闭</button></header><div class="drawer-content"><p class="section-copy">${info?`助手 ${e(info.version)} · 游戏资料 ${e(info.dataVersion)}<br>${phaseLabel(info.client.phase)} · 读取于 ${e(new Date(info.at).toLocaleTimeString('zh-CN',{hour12:false}))}`:e(error||'正在读取屏幕和窗口…')}</p>${error&&info?`<p class="callout warning">${e(error)} · 保留上次检查资料</p>`:''}
 ${info?.gameExclusiveFullscreen?`<p class="callout warning">${fullscreenDetected}</p>`:''}
 ${info?`${info.displays.map(d=>`<div class="callout"><b>屏幕 ${d.number}${d.primary?' · 主屏':''}　${Math.round(d.scaleFactor*100)}% 缩放</b><p>桌面 ${size(d.bounds)} DIP · 可用区 ${size(d.workArea)} DIP<br>按缩放换算：约 ${size(d.pixelReference)} 像素</p></div>`).join('')||'<p class="callout warning">当前屏幕资料不可用。</p>'}<div class="setting-row"><div><b>助手窗口</b><p>${own(info.main,'尚未打开')}${info.companion?' · 贴边模式':''}</p></div></div><div class="setting-row"><div><b>局内小窗</b><p>${info.guideAutoShow===null?'':`开局自动显示：${info.guideAutoShow?'开启':'关闭'}<br>`}${rows}</p></div></div><div class="setting-row"><div><b>客户端 / 游戏外框</b><p>客户端：${observed(info.observedClient)}<br>游戏：${observed(info.observedGame)} · ${processState(info)}</p></div></div>`:''}
 <div class="callout"><b>游戏里看不到小窗</b><p>${fullscreenHelp}</p><p>小窗移出屏幕时可点“找回指引”。无法点击小窗时按 Ctrl + Shift + H 切换鼠标穿透。窗口外框不能确认游戏里的渲染分辨率。</p></div><div class="detail-actions"><button class="btn small" data-action="window-info-refresh">重新检查</button><button class="btn small" data-action="window-info-copy" ${info?'':'disabled'}>复制窗口资料</button><button class="btn primary small" data-action="recover-guide">找回指引</button></div><p class="bottom-note">资料在本机显示，由你点击复制。DIP 是按显示缩放计算的窗口单位。</p></div></section></div>`;
}
