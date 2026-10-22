// Preserve authored 16.20 interaction contracts without relabelling them as
// current-data acceptance. This export is test-only; the current package and
// release/latest.json are never overwritten.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
const root=process.cwd(),target=path.join(root,'.local/smoke-snapshot-16.20'),fixture=path.join(root,'tests/fixtures/snapshot-16.20');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),current=await fs.readFile('release/latest.json'),release=JSON.parse(current);
assert.equal(sha(await fs.readFile(path.join(release.directory,'resources/app.asar'))),release.archiveSha256);
const provenance=JSON.parse(await fs.readFile(path.join(fixture,'provenance.json'))),overrides=new Map();
assert.equal(provenance.files.length,7);
for(const entry of provenance.files){
 assert.match(entry.file,/^data\/[a-z-]+\.json$/);const bytes=await fs.readFile(path.join(fixture,path.basename(entry.file)));
 assert.equal(sha(Buffer.from(JSON.stringify(JSON.parse(bytes))+'\n')),entry.historicalJsonHash);overrides.set(entry.file,bytes);
}
assert.equal(JSON.parse(overrides.get('data/game.json')).patch,'16.20');
const {stdout}=await promisify(execFile)('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
const files=[...new Set(stdout.split('\0').filter(Boolean))];assert(files.includes('scripts/package.mjs'));
await fs.mkdir(path.join(root,'.local'),{recursive:true});await fs.mkdir(target); // Existing exports are preserved, never reset.
const hashes={};
for(const file of files){
 assert(!path.isAbsolute(file)&&!file.split('/').includes('..'));const source=path.join(root,file),stat=await fs.lstat(source);assert(stat.isFile()&&!stat.isSymbolicLink(),file);
 const bytes=await fs.readFile(source),output=path.join(target,file);await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,overrides.get(file)||bytes,{flag:'wx'});hashes[file]=sha(bytes);
}
await fs.symlink(path.join(root,'node_modules'),path.join(target,'node_modules'),'junction');
for(const file of files)assert.equal(sha(await fs.readFile(path.join(target,file))),sha(overrides.get(file)||await fs.readFile(path.join(root,file))),file);
const child=spawn(process.execPath,[path.join(target,'scripts/package.mjs')],{cwd:target,windowsHide:true,stdio:'inherit'});const [code]=await once(child,'exit');assert.equal(code,0,'Historical test package failed');
const historical=JSON.parse(await fs.readFile(path.join(target,'release/latest.json')));
const receipt={purpose:'Historical interaction regression only; never an installer or current-data acceptance',fixturePatch:'16.20',sourceFixtureCommit:provenance.sourceCommit,dataInjected:true,overrides:Object.fromEntries([...overrides].map(([file,bytes])=>[file,sha(bytes)])),sourceHashes:hashes,currentArchiveSha256:release.archiveSha256,historicalArchiveSha256:historical.archiveSha256,directory:target};
assert((await fs.readFile(path.join(root,'release/latest.json'))).equals(current));assert.equal(sha(await fs.readFile(path.join(release.directory,'resources/app.asar'))),release.archiveSha256);
await fs.writeFile(path.join(target,'.local/historical-fixture.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
await fs.writeFile(path.join(root,'.local/latest-historical-smoke.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({purpose:receipt.purpose,fixturePatch:receipt.fixturePatch,directory:target,currentArchiveSha256:release.archiveSha256,historicalArchiveSha256:historical.archiveSha256}));
