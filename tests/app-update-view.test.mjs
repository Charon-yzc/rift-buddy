import test from 'node:test';
import assert from 'node:assert/strict';
import {appUpdatePanel} from '../src/app-update-view.mjs';
const base={version:'0.44.0',preferences:{appUpdateCheck:true},update:{phase:'idle'}};
test('panel escapes untrusted text and shows the current version',()=>{
 const html=appUpdatePanel({...base,version:'0.44.0<script>',update:{phase:'error',error:'<b>boom</b>'}});
 assert.ok(html.includes('软件更新'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;b&gt;boom&lt;/b&gt;'));
 assert.ok(html.includes('data-action="app-update-check"'));
});
test('each phase exposes exactly its own actions',()=>{
 const available=appUpdatePanel({...base,update:{phase:'available',release:{version:'9.9.9',tag:'v9.9.9',url:'https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9',publishedAt:'2026-10-12T00:00:00Z'}}});
 assert.ok(available.includes('data-action="app-update-download"'));assert.ok(available.includes('data-action="app-update-dismiss"'));assert.ok(available.includes('data-url="https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9"'));assert.ok(!available.includes('app-update-install'));
 const busy=appUpdatePanel({...base,update:{phase:'downloading',release:{version:'9.9.9'},received:1024,total:null}});
 assert.ok(busy.includes('data-action="app-update-cancel"'));assert.ok(busy.includes('已下载'));assert.ok(!busy.includes('data-action="app-update-download"'));
 const ready=appUpdatePanel({...base,update:{phase:'ready',release:{version:'9.9.9'},record:{version:'9.9.9',bytes:150000000,sha256:'abc'}}});
 assert.ok(ready.includes('data-action="app-update-install"'));assert.ok(ready.includes('data-action="app-update-delete"'));assert.ok(ready.includes('约 143 MB'));
 const checking=appUpdatePanel({...base,update:{phase:'checking'}});
 assert.ok(checking.includes('disabled'));assert.ok(!checking.includes('app-update-download'));
});
