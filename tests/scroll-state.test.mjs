import test from 'node:test';
import assert from 'node:assert/strict';
import {captureScroll,restoreScroll} from '../src/scroll-state.mjs';

const box=(key,top=0,left=0)=>({dataset:{scrollKey:key},scrollTop:top,scrollLeft:left});
const root=nodes=>({querySelectorAll:selector=>{assert.equal(selector,'[data-scroll-key]');return nodes;}});

test('inner scroll offsets survive a rebuilt page by key and unscrolled boxes are skipped',()=>{
 const kept=captureScroll(root([box('ongoing-history:p1',120),box('ongoing-team:TEAM-100',0,300),box('ongoing-tags:p1')]));
 assert.equal(kept.size,2);
 const rebuilt=[box('ongoing-team:TEAM-100'),box('ongoing-history:p1'),box('ongoing-history:p2')];
 assert.equal(restoreScroll(root(rebuilt),kept),2);
 assert.deepEqual(rebuilt.map(node=>[node.scrollTop,node.scrollLeft]),[[0,300],[120,0],[0,0]]);
 assert.equal(restoreScroll(root(rebuilt),new Map()),0);assert.equal(captureScroll(null).size,0);
});
