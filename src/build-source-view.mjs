import {BUILD_REGIONS,BUILD_TIERS,normalizeBuildSource,buildSourceLabel,selectedBuildReference} from './core/build-source.mjs';
import {escape as e,button} from './ui.mjs';
export function buildSourceControls(data,{reference=null,champion,role,refreshing=false,companion=false,plan=''}={}){
 const selected=normalizeBuildSource(data.buildSource),cached=selectedBuildReference(data,champion,role);
 const select=(field,label,options)=>`<label>${label}<select class="select" data-build-source-field="${field}" aria-label="OP.GG ${label}">${options.map(o=>`<option value="${o.id}" ${selected[field]===o.id?'selected':''}>${e(o.name)}</option>`).join('')}</select></label>`;
 const status=reference?`实际参考：${buildSourceLabel(reference)} · ${reference.patch}${reference.patch!==data.patch?' 旧版本':''}`:cached?`${buildSourceLabel(cached)} · ${cached.patch}已缓存；当前为机制或组合参考`:`${buildSourceLabel(selected)} 未缓存 · 当前为机制或组合参考`;
 return `<div class="${companion?'companion-plan-filters':'toolbar'}" style="display:flex;flex-wrap:wrap;gap:8px;align-items:end" data-build-source-controls>${select('region','地域',BUILD_REGIONS)}${select('tier','段位',BUILD_TIERS)}${button(companion?'companion-refresh':'refresh-build',refreshing?'刷新中…':'刷新所选来源','refresh','small',`${companion?`data-plan="${e(plan)}"`:''} ${refreshing?'disabled':''}`)}</div><p class="${companion?'companion-hint':'bottom-note'}" role="status" data-build-source-status>${e(status)}。切换只读取本机缓存，点击刷新联网获取。</p>`;
}
