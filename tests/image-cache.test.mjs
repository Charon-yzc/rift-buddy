import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {cacheMissingImages,loadImageOverrides} from '../services/image-cache.mjs';
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(120)]);
const data={version:'16.19.1',champions:[{id:'Example',icon:'https://ddragon.leagueoflegends.com/example.png'}],items:{},augments:[],spells:{},runes:[]};
test('new images survive offline restart; existing bundle images need no network',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-images-'));let calls=0;
 const fetchImage=async()=>{calls++;return new Response(png,{status:200,headers:{'content-type':'image/png'}});};
 const options={root:path.join(root,'cache'),bundleRoot:path.join(root,'bundle'),data,fetchImage};
 assert.equal((await cacheMissingImages(options)).saved,1);
 const cached=await loadImageOverrides(options.root,data);assert.ok(cached['champion/Example'].startsWith('file:///'));
 assert.equal((await cacheMissingImages(options)).total,0);assert.equal(calls,1);
 const bundled={...options,root:path.join(root,'fresh'),bundleRoot:options.root};assert.equal((await cacheMissingImages(bundled)).total,0);assert.equal(calls,1);
});
test('broken downloads and unsupported destinations cannot replace the image cache',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-bad-images-'));
 const result=await cacheMissingImages({root,bundleRoot:path.join(root,'bundle'),data,fetchImage:async()=>new Response('<html>error</html>')});
 assert.equal(result.failed,1);assert.deepEqual(result.overrides,{});
 let calls=0;await cacheMissingImages({root,bundleRoot:path.join(root,'bundle'),data:{...data,champions:[{id:'Example',icon:'https://example.com/image.png'}]},fetchImage:async()=>{calls++;}});
 assert.equal(calls,0);
});
