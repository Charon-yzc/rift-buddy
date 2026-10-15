import {escape as e,button} from './ui.mjs';
export function playerFlowSettings(p={},layout={}){
 const toggle=(field,title,description)=>`<div class="setting-row"><div><b>${title}</b><p>${description}</p></div><button class="switch ${p[field]!==false?'on':''}" data-action="player-flow-toggle" data-field="${field}" role="switch" aria-label="${title}" aria-checked="${p[field]!==false}"><i></i></button></div>`;
 const flashSlot=['d','f'].includes(p.flashSlot)?p.flashSlot:'current';
 return `<div class="modal-backdrop" data-backdrop="true"><section class="modal drawer" role="dialog" aria-modal="true" aria-label="选人与侧栏设置"><header class="modal-header"><h2>选人与侧栏设置</h2>${button('close','关闭','','quiet small')}</header><div class="drawer-content">
 <section class="detail-section"><h3>窗口布局</h3><p>${layout.custom?'当前侧栏使用你保存的布局。':'侧栏跟随客户端。'}</p><div class="detail-actions">${button('window-follow','重新跟随客户端','','small')}${button('window-reset-side','恢复侧栏默认布局','','small')}${button('window-reset-all','恢复全部窗口默认布局','','small')}</div><p>恢复侧栏只重置侧栏；恢复全部还重置主窗、装备卡、加点、野区提示和局内小窗布局。不会改英雄、阵容、符文、出装、字号或收藏。</p>
 <details class="ui-disclosure" id="player-window-help"><summary>移动、收起与恢复说明</summary><p>主窗口和侧栏可拖动顶部移动，拖动边缘调整大小。手动调整侧栏后会保存布局，下次选人继续沿用；“重新跟随客户端”恢复自动定位。</p><p>恢复侧栏默认后，宽度为 440 并自动贴在客户端旁。局内小窗可拖动顶部移动，用右下角 ◢ 调大小。</p><p>‹ 暂时收起到屏幕边缘，点击小拉手恢复；× 关闭该窗。客户端在前台时侧栏置顶，切到其他应用时取消置顶。</p></details></section>
 <label>跟随时的侧栏宽度<select id="companion-width" class="select">${[[400,'紧凑 · 400'],[440,'默认 · 440'],[480,'宽栏 · 480'],[520,'原宽栏 · 520'],[600,'宽栏 · 600']].map(([v,label])=>`<option value="${v}" ${(p.companionWidth||440)===v?'selected':''}>${label}</option>`).join('')}</select></label><p>更改宽度会重新启用自动跟随。</p>
 <details class="ui-disclosure" id="player-width-help"><summary>宽度与屏幕空间</summary><p>宽度单位为 Windows 逻辑像素。客户端旁空间不足时，会保持所选宽度并移到屏幕内，可能与客户端重叠；只有屏幕本身更窄时才缩小。可随时展开完整助手。</p></details>
 ${toggle('compactTeam','选定方案后紧凑显示全队','选定英雄或方案后，五个位置排成一行；关闭后逐行显示。')}
 <label>默认闪现按键<select id="flash-slot" class="select">${[['current','保留客户端当前按键'],['d','D 闪现'],['f','F 闪现']].map(([id,label])=>`<option value="${id}" ${flashSlot===id?'selected':''}>${label}</option>`).join('')}</select></label><p>默认保留客户端当前闪现按键；只有明确选择 D / F 或手动调换才会换位。</p>
 <details class="ui-disclosure" id="player-flash-help"><summary>闪现顺序与手动调整</summary><p>只交换 D/F，不改变技能搭配；没有闪现时保留原顺序。某套配置的手动顺序优先；手动交换含闪现的 D/F 会记住这一偏好。选择“恢复来源”后，该配置重新跟随此处设置。</p><p>写入仍需要你点击预选或配置按钮。</p></details>
 ${toggle('clickPrepare','点击英雄就预选并配置','点击可选英雄时预选、替换一张可编辑符文页、设置 D/F 并导入装备集；锁定由你完成。')}
 ${toggle('autoArrange','未分路英雄自动入队','保留手动位置，优先客户端分路；推定位置会标明。')}
 ${toggle('autoParty','自动标出开黑成员','仅在本机匹配大厅与选人公开身份，手动标记优先。')}
 <label>补充队友 ID<textarea id="party-ids" rows="4" placeholder="每行一个：昵称#标签 或公开数字 ID">${e((p.partyIds||[]).join('\n'))}</textarea></label><p>最多四位，仅匹配当前我方公开身份；每行一位，删除该行即可取消。</p>
 <details class="ui-disclosure" id="player-selection-help"><summary>选人与开黑识别说明</summary><p>点英雄可查看或配置，拖动或点“换位”调整位置；“我们 / 队友”只改开黑标记。紧凑显示不影响字号或侧栏宽度。</p><p>预选与配置适用于主窗、侧栏阵容、推荐和已采用组合中的可选英雄。队友已选英雄只供查看；本人锁定后仍可应用本英雄的新配置。不会锁定英雄或自动购买装备。缺少组合专用配置时使用本机当前来源的默认参考。关闭“点击英雄就预选并配置”后，点击只查看方案，仍可使用单独的配置按钮。</p><p>没有手动位置和客户端分路时，按缓存分路样本或常用位置安排空位，冲突时使用其他空位。客户端已选英雄需在客户端更换，不能在助手中删除。</p><p>自动识别开黑成员需要在进入选人前打开助手；中途启动、身份隐藏或接口不可用时可能无法识别。不会读取聊天或向房间发送玩家 ID，也不查询战绩或恢复隐藏身份。补充 ID 不是房间码；接口未公开对应 ID 时，可在阵容中直接点“我们”。</p></details>
 </div></section></div>`;
}
