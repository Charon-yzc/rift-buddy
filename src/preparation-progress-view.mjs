import {escape as e,button,portrait,asset} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {clientPreparationPlan,clientPreparationKey,preparationGameId} from './client-preparation-view.mjs';

const labels={hover:'英雄预选',runes:'符文页',spells:'D/F',items:'装备集'};
const roleName=role=>ROLES.find(r=>r.id===role)?.name||'位置待确认';
export function preparationProgress({data,plan,client,statuses=new Map(),pendingKey='',runeApplied=false}){
 const prepared=clientPreparationPlan(data,plan);if(!prepared)return null;
 const key=clientPreparationKey(client,prepared),game=preparationGameId(client),own=client.session?.myTeam?.find(p=>p.cellId===client.session?.localPlayerCellId);
 const hero=data.champions.find(c=>c.id===plan.selection.id),locked=(client.session?.actions||[]).flat().some(a=>a.type==='pick'&&a.actorCellId===own?.cellId&&a.completed===true),matches=Number(own?.championId||own?.championPickIntent)===Number(hero.key);
 // Results are local to one known game and concrete payload. Browsing another
 // candidate never erases them; a changed payload cannot inherit its green ticks.
 const applicable=client.connected&&client.phase==='ChampSelect'&&client.mode?.id==='rift'&&!!game&&plan.positionKnown!==false&&(!locked||matches);
 let previous=null;
 if(applicable)for(const [k,value] of statuses){try{const [id,fingerprint]=JSON.parse(k),payload=JSON.parse(fingerprint)[0];if(id===game&&payload.champion===plan.selection.id&&payload.role===plan.selection.role&&payload.mode===plan.selection.mode)previous=value;}catch{}}
 const rawReceipt=applicable?statuses.get(key):null;
 const receipt=rawReceipt?.message&&!rawReceipt.steps&&!rawReceipt.complete?{...rawReceipt,steps:{hover:{status:'failed',message:rawReceipt.message},runes:{status:'skipped'},spells:{status:'skipped'},items:{status:'skipped'}}}:rawReceipt;
 // A failed hover is a result even when the target never reached the client.
 const recorded=matches||receipt?.steps?.hover?.status==='failed'||receipt?.standalone?receipt:null;
 const status=recorded||(applicable&&runeApplied?{complete:false,message:'符文已单独应用；其余配置尚未核对',steps:{runes:{status:'done'}}}:null),pending=key===pendingKey,changed=!recorded&&!!previous;
 const complete=!!status?.complete&&Object.keys(labels).every(k=>status.steps?.[k]?.status==='done');
 const failed=Object.keys(labels).filter(k=>status?.steps?.[k]?.status==='failed');
 const title=plan.positionKnown===false?'先确认本人位置':pending?'正在预选并配置…':failed.length?labels[failed[0]]+'未完成':changed?'配置有修改，尚未应用':status?.superseded?'配置已被后续操作替换':complete?locked&&matches?'英雄已锁定，配置已完成':'配置完成，请在客户端锁定':status?.standalone&&status.steps.items?.status==='done'?'装备集已导入，请准备其余配置':locked&&matches?'英雄已锁定，配置尚未准备':'预选并配置你的英雄';
 return {prepared,key,status,pending,changed,complete,failed,title,locked:locked&&matches,previous,applicable};
}
export function configurationSource(build){
 if(build.sharedEquipment)return '队友共享配置 · '+build.rulesPatch;
 const basis=build.loadoutId==='default'?(build.combo?'常规配置 · 组合适用性待核对':'常规位置配置'):'专用机制配置';
 return basis+' · '+(build.reference&&build.loadoutId==='default'?build.reference.source||'OP.GG':'人工整理')+' '+build.rulesPatch+(build.stale||build.referenceStale?' · 待复核':'');
}
export function preparationProgressView(options){
 const {data,plan,client,view='task',available=false,busy=false,compact=false}=options,progress=preparationProgress(options);
 if(!plan)return `<section class="preparation-task empty-task"><b>我的位置</b>${button('task-members','选择位置','team','small')}</section>`;
 const hero=data.champions.find(c=>c.id===plan.selection.id),b=plan.build,selection=plan.selection;
 if(!progress)return `<section class="preparation-task"><b>${e(hero.name)} · ${roleName(selection.role)}</b><p>当前模式仅供查看配置；峡谷选人支持一次预选并配置。</p>${button('task-edit','查看配置','','small')}</section>`;
 const {prepared,status,pending,changed,complete,failed,locked,title}=progress;
 const own=client.session?.myTeam?.find(p=>p.cellId===client.session?.localPlayerCellId);
 const otherLocked=(client.session?.actions||[]).flat().some(a=>a.type==='pick'&&a.actorCellId===own?.cellId&&a.completed===true)&&Number(own?.championId)!==Number(hero.key);
 const reason=plan.positionKnown===false?'确认本人位置后可准备':!available?'请在桌面版连接客户端':!client.connected?'连接客户端后可准备':client.phase!=='ChampSelect'?'进入选人阶段后可准备':client.mode?.id!=='rift'?'模式尚未确认或暂不支持配置':!preparationGameId(client)?'同步客户端以确认本局':otherLocked?'客户端已锁定其他英雄，此方案只读':'';
 const planKey=[selection.id,selection.role,selection.mode].join(':'),attrs=`data-preparation-view="${view}" data-plan="${e(planKey)}" ${reason||busy?'disabled':''}`;
 const error=failed.map(k=>labels[k]+'：'+(status.steps[k].message||'请在客户端核对')).join('；')||status?.followUpError&&'配置回执已保留；后续同步失败：'+status.followUpError||status?.message||'';
 const spells=(b.summoners||[]).map((id,i)=>`${i?'F':'D'} ${data.spells[id]?.name||id}`).join(' · ');
 const action=complete?'重新应用整套':changed?'应用当前修改':locked?'准备当前配置':'预选并配置';
 const itemSet=JSON.stringify(prepared.value.itemSet);
 return `<section class="preparation-task ${compact?'compact':''}" data-client-preparation-fingerprint="${e(prepared.fingerprint)}" aria-label="我的准备结果">
 <div class="preparation-task-heading">${portrait(hero,'sm')}<div><b>${e(hero.name)} · ${plan.positionKnown===false?'位置待确认':roleName(selection.role)} · 你</b><strong role="status">${e(title)}</strong></div>${button('client-prepare',pending?'处理中…':action,'check',`${complete?'quiet':'primary'} small`,attrs)}</div>
 <div class="preparation-step-summary" aria-label="四步配置结果">${Object.entries(labels).map(([k,label])=>{const step=status?.steps?.[k],done=step?.status==='done',state=step?.status||'idle';return `<span data-preparation-step="${k}" data-step-status="${state}" class="${done?'done':state==='failed'?'failed':''}">${done?'✓':state==='failed'?'!':changed?'△':'○'} ${k==='hover'&&locked?'客户端已锁定':label}${!done&&state==='skipped'?' · 未执行':''}</span>`;}).join('')}</div>
 <details class="preparation-extra"><summary>配置详情</summary><p class="preparation-identity">${e(spells)}<span>${e(configurationSource(b))}</span></p><p>点击会替换可编辑符文页、设置 D/F 并导入商店装备集；英雄锁定由你确认。</p></details>
 ${error?`<div class="preparation-recovery" role="status"><p>${e(error)}</p><div class="preparation-recovery-actions">${failed.includes('items')?`<span data-itemset-fingerprint="${e(itemSet)}">${button('export-item-set','导出本次装备集','download','small',`data-itemset-view="${view}" data-plan="${e(planKey)}" ${busy?'disabled':''}`)}</span>${button('choose-dir','设置安装目录','folder','quiet small')}`:''}${button('client-prepare','重新执行整套','','small',attrs)}${button('sync','同步客户端','','quiet small')}</div><small>已完成项保留。重新执行会再次应用当前整套配置。</small></div>`:''}
 ${reason?`<p class="preparation-unavailable">${e(reason)}</p>`:!complete&&!pending&&!error?'<p class="preparation-contract">锁定请在客户端确认。</p>':complete?'':''}
 </section>`;
}
