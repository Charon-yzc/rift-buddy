import {escape as e} from './ui.mjs';
import {GUIDE_MODULES,TEXT_SCALES,normalizePresentation} from './core/presentation.mjs';
export function applyPresentation(value){
 document.documentElement.style.setProperty('--text-scale',normalizePresentation(value).textScale);
}
export function presentationSettings(value,{guide=false,opacity=1}={}){
 const p=normalizePresentation(value),lookup=new Map(GUIDE_MODULES.map(m=>[m[0],m]));
 const rows=[...p.guideModules,...GUIDE_MODULES.map(([id])=>id).filter(id=>!p.guideModules.includes(id))];
 const control=(field,value,label,disabled=false)=>`<button data-action="presentation" data-field="${field}" data-value="${value}" ${disabled?'disabled':''}>${label}</button>`;
 return `<section class="presentation-settings" aria-label="字号与指引模块"><h2>按你的习惯显示</h2><p class="presentation-note">设置立即保存，主界面、选人侧栏和局内指引共用字号。</p><fieldset><legend>文字大小</legend><div class="presentation-scales">${TEXT_SCALES.map(v=>`<button data-action="presentation" data-field="textScale" data-value="${v}" class="${p.textScale===v?'active':''}" aria-pressed="${p.textScale===v}">${v===1?'标准':v===1.1?'大字':'更大'} · ${Math.round(v*100)}%</button>`).join('')}</div></fieldset><div class="presentation-preview" aria-label="字号预览"><small>字号预览</small><b>回城先补组件</b><p>看清购买建议、加点顺序和局势依据。</p></div>${guide?`<fieldset><legend>窗口不透明度</legend><select id="guide-settings-opacity" aria-label="窗口不透明度">${[[1,'完全不透明'],[0.85,'85% 不透明'],[0.65,'65% 不透明']].map(([v,label])=>`<option value="${v}" ${opacity===v?'selected':''}>${label}</option>`).join('')}</select></fieldset>`:''}<fieldset><legend>局内概览的内容与顺序</legend><p class="presentation-note">开启的模块按下面的顺序显示；详情页始终可以查看。</p>${rows.map(id=>{const [,name,desc]=lookup.get(id),index=p.guideModules.indexOf(id),enabled=index>=0;return `<div class="presentation-module"><label><input type="checkbox" data-presentation-module="${id}" ${enabled?'checked':''}><span><b>${e(name)}</b><small>${e(desc)}</small></span></label><div>${control('moveUp',id,'↑',index<=0)}${control('moveDown',id,'↓',!enabled||index===p.guideModules.length-1)}</div></div>`;}).join('')}</fieldset><div class="presentation-bottom">${control('reset','','恢复默认')}${guide?'<button data-tab="overview">返回局内概览</button>':''}</div></section>`;
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
