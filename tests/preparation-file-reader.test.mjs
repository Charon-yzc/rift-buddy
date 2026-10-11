import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readPreparationFile} from '../services/preparation-file.mjs';
import {MAX_PREPARATION_FILE_BYTES,preparationFileText,parsePreparationFile} from '../src/core/preparation-file.mjs';

const share={kind:'state',v:1,from:'队友',mode:'hex',lineup:[{champion:'Ashe',role:'bottom'}],configurations:[{champion:'Ashe',role:'bottom',mode:'hex',patch:'16.20',items:[3031],boots:[3006],start:[1055],spells:['SummonerFlash','SummonerHaste'],runes:null,skills:null,priority:null}],at:123};

test('preparation reader reads a real UTF-8 file and rejects unrelated JSON, oversize files and directories',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'rift-preparation-reader-'));
 try{
  const valid=path.join(directory,'队友准备.json'),text=preparationFileText(share);
  await fs.writeFile(valid,text);assert.deepEqual(await readPreparationFile(valid),parsePreparationFile(text));
  const backup=path.join(directory,'backup.json');await fs.writeFile(backup,JSON.stringify({favorites:[],preferences:{}}));await assert.rejects(readPreparationFile(backup),/收藏备份/);
  const oversized=path.join(directory,'too-large.json');await fs.writeFile(oversized,Buffer.alloc(MAX_PREPARATION_FILE_BYTES+1));await assert.rejects(readPreparationFile(oversized),/256KB/);
  await assert.rejects(readPreparationFile(directory));
 }finally{assert.equal(path.dirname(directory),os.tmpdir());await fs.rm(directory,{recursive:true,force:true});}
});

test('preparation reader caps reads even when a file grows after stat and closes it on every rejection',async t=>{
 let closes=0,bytes=0,reads=0;
 t.mock.method(fs,'open',async()=>({stat:async()=>({isFile:()=>true,size:10}),read:async(buffer,offset,length)=>{assert.equal(length,MAX_PREPARATION_FILE_BYTES+1);bytes+=length;reads++;return {bytesRead:length};},close:async()=>{closes++;}}));
 await assert.rejects(readPreparationFile('mock-growing-file'),/超过256KB/);assert.equal(bytes,MAX_PREPARATION_FILE_BYTES+1);assert.equal(reads,1);assert.equal(closes,1);
});

test('preparation reader closes after parse and metadata errors',async t=>{
 let closes=0;
 const handle={stat:async()=>({isFile:()=>true,size:1}),read:async(buffer,offset)=>{if(offset)return {bytesRead:0};buffer.write('{');return {bytesRead:1};},close:async()=>{closes++;}};
 t.mock.method(fs,'open',async()=>handle);await assert.rejects(readPreparationFile('mock-invalid-json'),/有效JSON/);assert.equal(closes,1);
 handle.stat=async()=>({isFile:()=>false,size:0});await assert.rejects(readPreparationFile('mock-non-file'),/256KB/);assert.equal(closes,2);
 handle.stat=async()=>{throw Error('metadata unavailable');};await assert.rejects(readPreparationFile('mock-stat-error'),/metadata unavailable/);assert.equal(closes,3);
});
