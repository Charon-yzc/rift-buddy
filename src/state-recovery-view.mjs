import {escape as e,button} from './ui.mjs';
export function stateRecoveryView(recovery){
 if(!recovery)return '';
 return `<section class="callout warning state-recovery" role="alert"><b>已恢复可读取的本地配置</b><p>${e(recovery.issues?.join('；')||'部分保存内容无法读取')}。有效收藏、英雄配置与偏好已尽量保留，请核对当前阵容。</p><p style="overflow-wrap:anywhere">${recovery.backedUp?`原文件已保留在保存目录：${e(recovery.backupFile)}`:'恢复副本尚未保存，已停止覆盖原文件；请检查保存目录与磁盘后重新打开助手。'}</p>${button('recovery-settings','保存位置与备份','settings','small')} ${button('dismiss-recovery','知道了','','quiet small')}</section>`;
}
