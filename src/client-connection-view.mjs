import {escape as e,button} from './ui.mjs';

export function clientConnectionControl(client={},busy=false){
 const connecting=busy||client.connecting,state=client.connected?'connected':connecting?'connecting':'disconnected';
 const label=client.connected?'客户端已连接':connecting?'连接中…':'未连接客户端';
 const action=client.connected?'同步客户端':connecting?'正在连接客户端':client.needsElevation?'重新读取客户端':'连接客户端';
 return `<span class="client-connection-control"><button type="button" class="client-connection-indicator ${state}" data-action="sync" ${client.connected?'':'data-client-connect'} aria-label="${action}" title="${action}" ${connecting?'disabled aria-busy="true"':''}><span class="client-connection-light" aria-hidden="true"></span></button><span>${label}</span></span>`;
}

export function clientConnectionNotice(client={},preferences={},busy=false,{compact=false}={}){
 if(client.connected)return '';
 const connecting=busy||client.connecting,paused=preferences.autoSync===false;
 const title=connecting?'正在连接客户端':client.needsElevation?'连接需要 Windows 权限':'未连接英雄联盟客户端';
 const detail=connecting?'正在读取客户端状态…':client.needsElevation?'客户端以管理员身份运行；助手只在最近的窗口快照显示没有对局时自动请求一次 Windows 权限，确认后自动读取公开数据，取消后可点击重试。':paused?'自动连接已关闭。':client.message&&client.message!=='正在检查客户端…'?client.message:'打开英雄联盟后会自动连接。';
 if(compact)return `<section class="client-connection-status client-connection-compact" data-client-connection-status role="status"><div class="client-connection-heading"><strong>${connecting?'连接中…':client.needsElevation?'连接需要权限':'未连接客户端'}</strong>${button('sync',connecting?'连接中…':client.needsElevation?'重试':'连接','link','primary small',`data-client-connect aria-label="${client.needsElevation?'重新读取客户端':paused?'开启自动连接':'连接客户端'}" ${connecting?'disabled':''}`)}</div><details class="client-connection-options" data-companion-disclosure="connection-options"><summary aria-label="更多连接选项" title="连接说明与打开游戏">⋯</summary><div><p>${e(detail)}</p>${button('launch-game','打开游戏','arrow','small')}</div></details></section>`;
 return `<section class="client-connection-status" data-client-connection-status role="status"><div><strong>${title}</strong><span>${e(detail)}</span></div><div class="client-connection-actions">${button('sync',connecting?'连接中…':client.needsElevation?'重试读取':paused?'开启自动连接':'立即连接','link','primary small',`data-client-connect ${connecting?'disabled':''}`)}${button('launch-game','打开游戏','arrow','small')}</div></section>`;
}
