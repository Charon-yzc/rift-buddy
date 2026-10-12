import {escape as e,button} from './ui.mjs';
export function playerFlowSettings(p={}){
 const toggle=(field,title,description)=>`<div class="setting-row"><div><b>${title}</b><p>${description}</p></div><button class="switch ${p[field]!==false?'on':''}" data-action="player-flow-toggle" data-field="${field}" role="switch" aria-label="${title}" aria-checked="${p[field]!==false}"><i></i></button></div>`;
 return `<div class="modal-backdrop" data-backdrop="true"><section class="modal drawer" role="dialog" aria-modal="true" aria-label="选人与侧栏设置"><header class="modal-header"><h2>少操作，先看眼下要做的事</h2>${button('close','关闭','','quiet small')}</header><div class="drawer-content">
 <label>选人侧栏宽度<select id="companion-width" class="select">${[[400,'紧凑 · 400'],[520,'默认 · 520'],[600,'宽栏 · 600']].map(([v,label])=>`<option value="${v}" ${(p.companionWidth||520)===v?'selected':''}>${label}</option>`).join('')}</select></label><p>单位为 Windows 逻辑像素。空间不足时缩小到客户端旁的可用宽度；可随时展开完整助手。客户端或助手在前台时侧栏置顶，切到其他应用时取消置顶。</p>
 ${toggle('compactTeam','选定方案后紧凑显示全队','默认在你已选英雄、采纳组合或收到队友方案后，把五个位置排成一行概览，让自己的下一步和队友方案留在首屏。点英雄查看或配置，拖动或点“换位”调整位置，“我们 / 队友”只改开黑标记。关闭后始终使用逐行阵容；字体和侧栏宽度仍可单独设置。')}
 ${toggle('clickPrepare','点击英雄就预选并配置','点击侧栏阵容、推荐或已采用组合中的可选英雄，会在你自己的客户端预选该英雄、替换一张可编辑符文页、设置 D/F 并导入装备集。队友已经选定的英雄只查看配置；自己锁定后仍可应用本英雄的新配置。不会锁定英雄或自动购买装备。配置按当前组合，缺少组合专用配置时使用本机当前来源的默认参考。关闭后点击只查看方案，仍可用“预选并配置”按钮。')}
 ${toggle('autoArrange','未分路英雄自动入队','客户端选定英雄后自动进入阵容：保留手动位置，其次客户端分路，再按当前缓存的分路样本或英雄常用位置参考安排空位。冲突时依次安排其他空位，推定位置会标明，可拖动交换。客户端已选英雄不能在助手中删除；更换请在客户端操作。')}
 ${toggle('autoParty','自动标出开黑成员','先读取大厅公开预组队成员，再与选人阶段公开身份匹配。需要在进入选人前打开助手；中途启动、身份隐藏或接口不可用时可能无法识别。只在本机匹配，不读取聊天内容，不向房间发送玩家 ID。你手动标记的“我们 / 队友”优先。')}
 <label>补充队友 ID<textarea id="party-ids" rows="4" placeholder="每行一个：昵称#标签 或公开数字 ID">${e((p.partyIds||[]).join('\n'))}</textarea></label><p>最多四位队友，仅用于匹配当前我方公开身份。不是房间码，也不会查询战绩或恢复隐藏身份。若当前接口没有公开对应 ID，请在阵容中直接点“我们”。删除某行即可取消这条补充规则。</p>
 </div></section></div>`;
}
