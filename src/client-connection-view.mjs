import {escape as e,button} from './ui.mjs';

export function clientConnectionNotice(client={},preferences={},busy=false){
 if(client.connected)return '';
 const connecting=busy||client.connecting,paused=preferences.autoSync===false;
 const title=connecting?'正在连接客户端':client.needsElevation?'连接需要 Windows 授权':'未连接英雄联盟客户端';
 const detail=connecting?'正在读取客户端状态…':client.needsElevation?'客户端以管理员权限运行，请授权连接。':paused?'自动连接已关闭。':client.message&&client.message!=='正在检查客户端…'?client.message:'打开英雄联盟后会自动连接。';
 return `<section class="client-connection-status" data-client-connection-status role="status"><div><strong>${title}</strong><span>${e(detail)}</span></div><div class="client-connection-actions">${button('connect-client',connecting?'连接中…':client.needsElevation?'授权连接':paused?'开启自动连接':'立即连接','link','primary small',connecting?'disabled':'')}${button('launch-game','打开游戏','arrow','small')}</div></section>`;
}
