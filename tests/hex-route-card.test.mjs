import test from 'node:test';
import assert from 'node:assert/strict';
import {hexRouteCard,orderHexCards} from '../src/core/hex-route-card.mjs';
import {hexMicroRoutesView} from '../src/hex-micro-view.mjs';

test('route captions distinguish adapted community sources from generic hero skill orders',()=>{
 const card=hexRouteCard({title:'攻速循环',source:'https://arammayhem.com/zh-cn/combo/yasuo'}, {priority:'QEQWR',source:'OP.GG'});
 assert.equal(card.title,'攻速循环');assert.equal(card.source,'ARAM Mayhem · 改编');assert.equal(card.priority,'主Q副E');
 assert.equal(card.skillSource,'OP.GG');assert.match(card.skillNote,/未单独提供此路线的专属加点/);
 assert.equal(hexRouteCard({title:'未知'}).priority,'');assert.equal(hexRouteCard({title:'未知'}).source,'机制整理');
 assert.equal(hexRouteCard({kind:'reference',title:'当前配置'}).source,'当前配置');
 assert.equal(hexRouteCard({source:'https://arammayhem.com.evil.invalid/'}).source,'机制整理');
});

test('pin order remains bounded, unique and stable when routes disappear',()=>{
 const rows=Array.from({length:35},(_,i)=>({id:String(i)}));
 const result=orderHexCards(rows,['8','8','missing','2']);
 assert.deepEqual(result.slice(0,4).map(r=>r.id),['8','2','0','1']);assert.equal(result.length,30);assert.equal(new Set(result.map(r=>r.id)).size,30);
 assert.deepEqual(orderHexCards(rows.slice(0,5),['8','2']).map(r=>r.id),['2','0','1','3','4']);
});

test('micro cards expose every row, expanded pin controls and escaped captions',()=>{
 const rows=Array.from({length:5},(_,i)=>({id:String(i),augments:[],items:[],card:{title:'<script>x</script>',source:'来源',priority:'主Q副E'}}));
 const image=()=>'';
 const short=hexMicroRoutesView(rows,image),full=hexMicroRoutesView(rows,image,{expanded:true});
 assert.equal((short.match(/data-micro-route=/g)||[]).length,5);assert.equal((full.match(/data-micro-route=/g)||[]).length,5);
 assert.doesNotMatch(short,/data-action="pin"/);assert.equal((full.match(/data-action="pin"/g)||[]).length,5);
 assert.doesNotMatch(full,/<script>/);assert.match(full,/&lt;script&gt;/);assert.match(full,/主Q副E/);
});
