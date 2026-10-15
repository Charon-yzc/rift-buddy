import {createItemSet} from './core/item-sets.mjs';
import {escape as e,button} from './ui.mjs';
import {champSelectGameId} from './core/rune-context.mjs';

export function clientPreparationPlan(data,plan){
 if(!plan||plan.selection.mode!=='rift'||!plan.build.runePage)return null;
 const {selection:s,build:b}=plan,champion=data.champions.find(c=>c.id===s.id);
 if(!champion)return null;
 const value={champion:s.id,role:s.role,mode:s.mode,page:structuredClone(b.runePage),summoners:[...b.summoners],preserveFlashSlot:!['d','f'].includes(data.flashSlot),itemSet:createItemSet(champion,b,data)};
 return {value,fingerprint:JSON.stringify([value,b.skillOrder,b.first,b.priority,s.comboId||''])};
}
export const preparationGameId=client=>champSelectGameId(client.session,client.game);
export const clientPreparationKey=(client,prepared)=>JSON.stringify([preparationGameId(client),prepared.fingerprint]);
export function clientPreparationControls({data,plan,client,view='build',available=false,pending=false,statuses=new Map()}){
 const prepared=clientPreparationPlan(data,plan);if(!prepared)return '';
 const gameId=preparationGameId(client),own=client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId);
 const champion=data.champions.find(c=>c.id===plan.selection.id),locked=(client.session?.actions||[]).flat().some(a=>a.type==='pick'&&a.actorCellId===own?.cellId&&a.completed===true);
 const reason=plan.positionKnown===false?'确认本人位置后可准备':!available?'客户端配置请在桌面版使用':!client.connected?'连接客户端后，在选人阶段使用':client.phase!=='ChampSelect'?'进入选人阶段后可预选并配置':client.mode?.id!=='rift'?'当前模式暂不支持一键配置':!gameId?'同步客户端以确认本局':locked&&own.championId!==champion.key?'已锁定其他英雄，请查看自己的方案':'';
 const status=statuses.get(clientPreparationKey(client,prepared));
 const labels={hover:'英雄预选',runes:'符文页',spells:'召唤师技能',items:'商店装备集'};
 return `<section class="client-preparation" data-client-preparation-fingerprint="${e(prepared.fingerprint)}" aria-label="客户端预选与配置">
  ${button('client-prepare',pending?'正在预选并配置…':view==='companion'?'应用当前修改':locked&&own.championId===champion.key?'应用当前配置':'客户端预选并配置','check','primary small',`data-preparation-view="${view}" data-plan="${e([plan.selection.id,plan.selection.role,plan.selection.mode].join(':'))}" ${reason||pending?'disabled':''}`)}
  ${reason?`<p class="preparation-unavailable">${e(reason)}</p>`:'<p class="preparation-contract">锁定由你确认。</p>'}<details class="ui-help"><summary>应用内容</summary><p>替换一张可编辑符文页、设置 D/F，并导入此页装备集。加点为手动参考。</p></details>
  ${status?`${view==='companion'&&status.complete?'<details class="ui-help"><summary>配置已应用 · 查看结果</summary>':''}<div class="client-preparation-result" role="status"><b>${e(status.message|| (status.complete?'配置已完成，请在客户端核对后锁定':'部分步骤未完成，请在客户端核对'))}</b>${status.steps?`<ul>${Object.entries(status.steps).map(([key,s])=>`<li data-preparation-step="${key}" data-step-status="${s.status}"><span>${labels[key]}</span><span>${s.status==='done'?(key==='hover'&&s.locked?'当前英雄已锁定':'已完成'):s.status==='failed'?'未完成':'未执行'}</span>${s.message?`<small>${e(s.message)}</small>`:''}</li>`).join('')}</ul>`:''}${status.complete?'<small>装备集已导入；进游戏后在商店装备集选择“开黑搭子”。修改方案后可重新应用。</small>':''}</div>${view==='companion'&&status.complete?'</details>':''}`:''}
 </section>`;
}
