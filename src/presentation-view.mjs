import {escape as e} from './ui.mjs';
import {TEXT_SCALES,normalizePresentation} from './core/presentation.mjs';
import {THEMES,getTheme,themeVariables} from './core/themes.mjs';
export function applyPresentation(value,{theme=true}={}){
 const p=normalizePresentation(value),root=document.documentElement;
 root.style.setProperty('--text-scale',p.textScale);
 if(!theme)return;
 for(const [key,color] of Object.entries(themeVariables(p.theme)))root.style.setProperty(key,color);
 root.style.setProperty('--rb-on-accent',getTheme(p.theme).scheme==='light'?'#ffffff':'#07131b');
 root.style.colorScheme=getTheme(p.theme).scheme;root.dataset.theme=p.theme;
}
export function themeDialog(value){
 const selected=normalizePresentation(value).theme;
 const choices=group=>`<div class="theme-grid">${THEMES.filter(theme=>theme.group===group).map(theme=>`<button class="theme-option ${selected===theme.id?'active':''}" data-action="presentation" data-field="theme" data-value="${theme.id}" aria-pressed="${selected===theme.id}"><span class="theme-swatches" aria-hidden="true">${[theme.bg,theme.panel,theme.accent,theme.ours,theme.ballot].map(color=>`<i style="background:${color}"></i>`).join('')}</span><b>${e(theme.name)}</b></button>`).join('')}</div>`;
 return `<div class="modal-backdrop" data-backdrop="true"><section class="modal drawer theme-drawer recommendation-ui" role="dialog" aria-modal="true" aria-label="配色"><header class="modal-header"><h3>配色</h3><button class="btn quiet small" data-action="close">关闭</button></header><div class="drawer-content theme-settings"><h4>客户端灵感</h4>${choices('client')}<details class="theme-other" ${getTheme(selected).group==='other'?'open':''}><summary>其他配色</summary>${choices('other')}</details></div></section></div>`;
}
export function updateThemeDialog(root,value){
 const selected=root.querySelector(':focus')?.dataset.value,scroll=root.querySelector('.drawer-content')?.scrollTop||0;
 root.innerHTML=themeDialog(value);root.querySelector('.drawer-content').scrollTop=scroll;
 if(selected)[...root.querySelectorAll('[data-value]')].find(el=>el.dataset.value===selected)?.focus({preventScroll:true});
}
export function presentationSettings(value,{guide=false,opacity=1}={}){
 const p=normalizePresentation(value);
 return `<section class="presentation-settings" aria-label="字号与小窗"><fieldset><legend>文字大小</legend><div class="presentation-scales">${TEXT_SCALES.map(v=>`<button data-action="presentation" data-field="textScale" data-value="${v}" class="${p.textScale===v?"active":""}" aria-pressed="${p.textScale===v}">${v===1?"标准":v===1.1?"大字":"更大"} · ${Math.round(v*100)}%</button>`).join("")}</div></fieldset>
 <div class="presentation-preview" aria-label="字号预览"><b>回城先补组件</b><p>购买建议 · 加点顺序</p></div>
 ${guide?`<fieldset><legend>窗口不透明度</legend><select id="guide-settings-opacity" aria-label="窗口不透明度">${[[1,"完全不透明"],[0.85,"85% 不透明"],[0.65,"65% 不透明"]].map(([v,label])=>`<option value="${v}" ${opacity===v?"selected":""}>${label}</option>`).join("")}</select></fieldset>`:""}
 <fieldset><legend>局内小窗</legend><p class="presentation-note">左上查看双方装备价值，右侧查看配置。悬停图标查看说明。</p><p class="presentation-note">海克斯用左下箭头展开更多配置，再用左侧按钮置顶。峡谷保留加点与刷野小窗。</p><p class="presentation-note">拖动顶部移动；× 关闭当前窗。峡谷可拖右下角调整大小，每个窗口独立记住位置和尺寸。窗口开关在“数据与连接”中设置。</p></fieldset>
 <div class="presentation-bottom"><button data-action="presentation" data-field="reset" data-value="">恢复默认</button>${guide?`<button data-action="reset-layout">恢复默认窗口布局</button>`:""}</div></section>`;
}
export function presentationDialog(value){
 return `<div class="modal-backdrop" data-backdrop="true"><section class="modal drawer presentation-drawer" role="dialog" aria-modal="true" aria-label="界面与指引设置"><div class="modal-header"><h2>界面与指引</h2><button class="btn quiet small" data-action="close">关闭</button></div><div class="drawer-content">${presentationSettings(value)}</div></section></div>`;
}
export function updatePresentationDialog(root,value){
 const focused=root.contains(document.activeElement)?{...document.activeElement.dataset}:null;
 const scroll=root.querySelector('.drawer-content')?.scrollTop||0;
 root.innerHTML=presentationDialog(value);
 root.querySelector('.drawer-content').scrollTop=scroll;
 if(focused&&Object.keys(focused).length)[...root.querySelectorAll('button,input')].find(el=>Object.entries(focused).every(([key,v])=>el.dataset[key]===v))?.focus({preventScroll:true});
}
