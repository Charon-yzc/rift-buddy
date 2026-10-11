import {escape as e} from './ui.mjs';
import {applyPresentation} from './presentation-view.mjs';
const root=document.getElementById('jungle-root'),api=window.jungleWidget;
function render(value){
 applyPresentation(value?.presentation);
 const m=value?.model,j=value?.jungle||m?.jungle,level=value?.level??m?.live?.level,time=value?.time??m?.live?.gameTime;
 const lead=j?.choices?.find(c=>c.id===(j.ready?'gank':'farm'));
 root.innerHTML=`<header><b>野区规划${Number.isFinite(time)?` · ${Math.floor(time/60)}:${String(Math.floor(time%60)).padStart(2,'0')}`:''}${level?' · '+e(level)+'级':''}</b><div><button data-action="details" aria-label="调整路线与抓人条件" title="查看路线、资源与自己确认的抓人条件">⋯</button><button data-action="hide" aria-label="关闭野区规划" title="可从装备卡的野区按钮恢复">×</button></div></header><main><b>${e(lead?.title||'等待读取本局')}</b><p title="${e(lead?.text)}">${e(lead?.text||'只依据本局自身状态和你确认的条件，不猜测敌方位置。')}</p>${Number.isFinite(time)&&time<210?`<small title="${e(j?.opening?.join(' → '))}">开局参考 · ${e(j?.opening?.slice(0,3).join(' → '))} → …</small>`:`<small>${j?.fresh?'兵线标记有效 · 变化时请重新确认':'兵线未确认或已过期 · 不指定抓哪路'}</small>`}</main>`;
}
root.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(button)try{await api.control(button.dataset.action);}catch{button.title='操作未完成，请从本局指引恢复';}});
api.onUpdate(render);render(await api.bootstrap());
