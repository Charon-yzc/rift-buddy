import test from 'node:test';
import assert from 'node:assert/strict';
import {appUpdatePanel} from '../src/app-update-view.mjs';
const base={version:'0.44.0',preferences:{appUpdateCheck:true},update:{phase:'idle'}};
test('download and paused states distinguish preserving progress from discarding it',()=>{
 const release={version:'0.57.3',tag:'v0.57.3'},transfer={release,kind:'incremental',received:524288,total:2097152};
 const downloading=appUpdatePanel({...base,update:{...transfer,phase:'downloading'}}),paused=appUpdatePanel({...base,update:{...transfer,phase:'paused'}});
 assert.match(downloading,/data-action="app-update-pause"/);assert.match(downloading,/data-action="app-update-cancel"/);
 assert.match(paused,/已暂停增量包/);assert.match(paused,/继续下载/);assert.match(paused,/data-action="app-update-cancel"/);assert.doesNotMatch(paused,/data-action="app-update-pause"/);
 for(const phase of ['pausing','cancelling'])assert.match(appUpdatePanel({...base,update:{...transfer,phase}}),/data-action="app-update-cancel"[^>]*disabled/);
});
test('panel escapes untrusted text and shows the current version',()=>{
 const html=appUpdatePanel({...base,version:'0.44.0<script>',update:{phase:'error',error:'<b>boom</b>'}});
 assert.ok(html.includes('软件更新'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;b&gt;boom&lt;/b&gt;'));
 assert.ok(html.includes('data-action="app-update-check"'));
});
test('installation is busy and failed launch retains an escaped retry message',()=>{
 const installing=appUpdatePanel({...base,update:{phase:'installing'}});
 assert.match(installing,/data-action="app-update-install"[^>]*disabled/);
 assert.ok(!installing.includes('data-action="app-update-delete"'));
 assert.ok(!installing.includes('data-action="app-update-check"'));
 const retry=appUpdatePanel({...base,update:{phase:'ready',error:'EACCES <blocked>',record:{version:'99.0.0'}}});
 assert.ok(retry.includes('可重试'));assert.ok(retry.includes('&lt;blocked&gt;'));
 assert.match(retry,/data-action="app-update-install"/);
});
test('each phase exposes exactly its own actions',()=>{
 const available=appUpdatePanel({...base,update:{phase:'available',release:{version:'9.9.9',tag:'v9.9.9',url:'https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9',publishedAt:'2026-10-12T00:00:00Z'}}});
 assert.ok(available.includes('data-action="app-update-download"'));assert.ok(available.includes('data-action="app-update-dismiss"'));assert.ok(available.includes('data-url="https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9"'));assert.ok(!available.includes('app-update-install'));
 const busy=appUpdatePanel({...base,update:{phase:'downloading',release:{version:'9.9.9'},received:1024,total:null}});
 assert.ok(busy.includes('data-action="app-update-cancel"'));assert.ok(busy.includes('已下载'));assert.ok(!busy.includes('data-action="app-update-download"'));
 const ready=appUpdatePanel({...base,update:{phase:'ready',release:{version:'9.9.9',tag:'v9.9.9',url:'https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9'},record:{version:'9.9.9',bytes:150000000,sha256:'abc'}}});
 assert.ok(ready.includes('data-action="app-update-install"'));assert.ok(ready.includes('data-action="app-update-delete"'));assert.ok(ready.includes('约 143 MB'));
 assert.ok(ready.includes('data-url="https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9"'));
 const checking=appUpdatePanel({...base,update:{phase:'checking'}});
 assert.ok(checking.includes('disabled'));assert.ok(!checking.includes('app-update-download'));
 const verifying=appUpdatePanel({...base,update:{phase:'verifying',release:{version:'9.9.9'},received:1024,total:2048}});
 assert.ok(verifying.includes('正在校验'));assert.ok(verifying.includes('data-action="app-update-cancel"'));assert.ok(verifying.includes('<progress'));
 const mirror=appUpdatePanel({...base,preferences:{appUpdateCheck:true,updateMirror:'https://gh-proxy.com'},update:{phase:'downloading',release:{version:'9.9.9'},received:10,total:100,via:'mirror'}});
 assert.ok(mirror.includes('id="update-mirror"'));assert.ok(mirror.includes('value="https://gh-proxy.com"'));assert.ok(mirror.includes('data-action="app-update-mirror-preset"'));assert.ok(mirror.includes('data-action="app-update-mirror-clear"'));assert.ok(mirror.includes('镜像加速'));assert.ok(mirror.includes('校验文件直接从 GitHub 获取'));assert.ok(!mirror.includes('1.8 倍'));
 const fallback=appUpdatePanel({...base,update:{phase:'downloading',release:{version:'9.9.9'},received:10,total:100,via:'direct',fallbackNotice:true}});
 assert.ok(fallback.includes('已改用直连'));
 const readyFallback=appUpdatePanel({...base,update:{phase:'ready',release:{version:'9.9.9'},record:{version:'9.9.9',bytes:100,sha256:'abc',via:'direct',fallback:true}}});
 assert.ok(readyFallback.includes('已改用直连'));
});
