import {escape as e} from './ui.mjs';
import {GUIDE_MODULES,TEXT_SCALES,normalizePresentation} from './core/presentation.mjs';
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
 const p=normalizePresentation(value),lookup=new Map(GUIDE_MODULES.map(m=>[m[0],m]));
 const rows=[...p.guideModules,...GUIDE_MODULES.map(([id])=>id).filter(id=>!p.guideModules.includes(id))];
 const control=(field,value,label,disabled=false)=>`<button data-action="presentation" data-field="${field}" data-value="${value}" ${disabled?'disabled':''}>${label}</button>`;
 return `<section class="presentation-settings" aria-label="字号与指引模块"><h2>按你的习惯显示</h2><p class="presentation-note">设置立即保存，主界面、选人侧栏和局内指引共用字号。</p><fieldset><legend>文字大小</legend><div class="presentation-scales">${TEXT_SCALES.map(v=>`<button data-action="presentation" data-field="textScale" data-value="${v}" class="${p.textScale===v?'active':''}" aria-pressed="${p.textScale===v}">${v===1?'标准':v===1.1?'大字':'更大'} · ${Math.round(v*100)}%</button>`).join('')}</div></fieldset><div class="presentation-preview" aria-label="字号预览"><small>字号预览</small><b>回城先补组件</b><p>看清购买建议、加点顺序和局势依据。</p></div>${guide?`<fieldset><legend>窗口不透明度</legend><select id="guide-settings-opacity" aria-label="窗口不透明度">${[[1,'完全不透明'],[0.85,'85% 不透明'],[0.65,'65% 不透明']].map(([v,label])=>`<option value="${v}" ${opacity===v?'selected':''}>${label}</option>`).join('')}</select></fieldset>`:''}<fieldset><legend>局内小窗怎么用</legend><p class="presentation-note">默认显示小装备卡和技能栏上方的加点提示；打野另在右下小地图上方显示野区规划。拖动小窗顶部调整位置，拖动右下角 ◢ 调整大小（聚焦后也可用方向键微调）；每个窗口独立记住位置和尺寸，下次打开沿用。‹ 暂时收起到屏幕边缘，点小拉手恢复原尺寸和位置；× 只关闭该窗。装备卡上的“加点 / 野区”按钮可恢复对应小窗；“找回局内指引”把位置移回当前屏幕。“恢复默认窗口布局”清除这三个小窗的自定义尺寸和位置，恢复默认小装备卡、加点和野区提示；不改英雄方案、符文、出装或字号。金币、购买小件、双方装备等放在详情，按需打开。野区规划按自身生命与法力／能量、已学技能和你确认的条件更新。出生方能读取时自动选起手示例；“⋯”可改出生方、起手和确认兵线。“被入侵 / 刚回城 / 没机会”取消旧抓人标记，显示恢复建议，90秒后失效；不用逐个标记营地。路线是可调整的示例，不表示营地已刷或仍在，不会自动识别兵线或敌方来抓。</p></fieldset><fieldset><legend>局内概览的内容与顺序</legend><p class="presentation-note">开启的模块按下面的顺序显示；详情页始终可以查看。</p>${rows.map(id=>{const [,name,desc]=lookup.get(id),index=p.guideModules.indexOf(id),enabled=index>=0;return `<div class="presentation-module"><label><input type="checkbox" data-presentation-module="${id}" ${enabled?'checked':''}><span><b>${e(name)}</b><small>${e(desc)}</small></span></label><div>${control('moveUp',id,'↑',index<=0)}${control('moveDown',id,'↓',!enabled||index===p.guideModules.length-1)}</div></div>`;}).join('')}</fieldset><div class="presentation-bottom">${control('reset','','恢复默认')}${guide?'<button data-action="reset-layout">恢复默认窗口布局</button><button data-tab="overview">返回局内概览</button>':''}</div></section>`;
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
