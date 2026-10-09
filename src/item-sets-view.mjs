import {createItemSet} from './core/item-sets.mjs';
import {escape as e,button} from './ui.mjs';
export function itemSetControls(champion,build,data,{view='drawer',statuses=new Map()}={}){
 let itemSet;try{itemSet=createItemSet(champion,build,data);}catch(error){return `<p class="item-set-status" role="status">${e(error.message)}</p>`;}
 const fingerprint=JSON.stringify(itemSet),status=statuses.get(fingerprint),plan=[champion.id,build.role,build.mode].join(':');
 const extra=`data-itemset-view="${e(view)}" data-plan="${e(plan)}"`;
 return `<div class="item-set-controls" data-itemset-fingerprint="${e(fingerprint)}"><div class="item-set-actions">${button('import-item-set','导入商店装备集','upload','primary small',extra)}${button('export-item-set','导出 JSON','download','small',extra)}${status?.needsAuthorization?button('authorize-item-set','授权并导入','link','small',extra):''}</div><p class="item-set-hint">导入当前方案；调整后需重新导入。</p><details class="item-set-help"><summary>使用说明</summary><p class="item-set-hint">同英雄、位置和模式只更新本工具的一份装备集。下次进游戏后，在商店“装备集”中选择“开黑搭子”；当前游戏是否刷新请以商店实际显示为准。</p><p class="item-set-hint">导出的 JSON 可在客户端“藏品 → 装备”中导入。</p></details><p class="item-set-status ${status?.error?'text-gold':''}" role="status" aria-live="polite">${e(status?.text||'')}</p></div>`;
}
