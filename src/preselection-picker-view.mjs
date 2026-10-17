import {escape as e,button,icon,portrait,roleIcon} from './ui.mjs';
import {ROLES} from './core/rules.mjs';

export function preselectionPicker({query='',filter='all',current=null,canCancel=false,tiles='',hint='点击英雄，预选并配好'}={}){
 return `<div class="modal-backdrop" data-backdrop="true"><section class="modal preselection-picker" role="dialog" aria-modal="true" aria-label="预选英雄">
  <header class="modal-header"><h2>预选英雄</h2>${button('close','','close','quiet icon-only','aria-label="关闭预选英雄"')}</header>
  <div class="modal-controls"><div class="search-wrap">${icon('search')}<input id="picker-search" aria-label="搜索英雄" value="${e(query)}" placeholder="名称、简称或拼音" autocomplete="off" /></div>
   <div class="preselection-roles" role="group" aria-label="筛选英雄分路">${[['all','全部'],...ROLES.map(role=>[role.id,role.name])].map(([id,name])=>`<button type="button" class="chip ${filter===id?'active':''}" data-action="picker-role" data-role="${id}" aria-pressed="${filter===id}">${id==='all'?'':roleIcon(id)}<span>${name}</span></button>`).join('')}</div>
  </div>
  <div class="champ-grid" id="picker-grid">${tiles}</div>
  <footer class="modal-footer preselection-footer"><div class="preselection-current">${current?`${portrait(current)}<span><b>${e(current.name)}</b><small>已预选</small></span>`:`<span>${e(hint)}</span>`}</div><div class="preselection-actions">${canCancel?button('pregame-clear','取消预选','','quiet small'):''}${button('close','取消','','small')}</div></footer>
 </section></div>`;
}
