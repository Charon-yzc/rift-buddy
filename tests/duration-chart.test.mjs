import test from 'node:test';
import assert from 'node:assert/strict';
import {durationSpline,durationChart} from '../src/duration-chart-view.mjs';

test('smooth connections preserve source extrema and complementary values between nodes',()=>{
 const nodes=[{x:1,y:48},{x:5,y:49},{x:7,y:53},{x:9,y:51},{x:11,y:50}];
 const segments=path=>[...path.matchAll(/C([^ ]+) ([^ ]+) ([^ ]+)/g)].map(match=>match.slice(1).map(pair=>pair.split(',').map(Number)));
 const a=segments(durationSpline(nodes)),b=segments(durationSpline(nodes.map(point=>({...point,y:100-point.y}))));
 const value=(start,segment,t)=>(1-t)**3*start+3*(1-t)**2*t*segment[0][1]+3*(1-t)*t*t*segment[1][1]+t**3*segment[2][1];
 for(let i=0;i<a.length;i++)for(let k=0;k<=100;k++){
  const t=k/100,y=value(nodes[i].y,a[i],t),other=value(100-nodes[i].y,b[i],t);
  assert(y>=Math.min(nodes[i].y,nodes[i+1].y)-1e-9&&y<=Math.max(nodes[i].y,nodes[i+1].y)+1e-9);
  assert(Math.abs(y+other-100)<1e-9);
 }
});

test('invalid and incomplete series do not produce fabricated chart nodes',()=>{
 assert.equal(durationChart([]),'');
 assert.equal(durationChart([{name:'缺数据',points:[{winRate:50}]}]),'');
 assert.equal(durationChart([{name:'错误',points:Array.from({length:5},()=>({winRate:NaN}))}]),'');
});
