const {app}=require('electron');
const virtualFs=require('node:fs/promises'),fs=require('original-fs').promises;
const path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{once}=require('node:events');
const config=JSON.parse(require('original-fs').readFileSync(process.argv[2],'utf8'));
app.disableHardwareAcceleration();app.setPath('userData',path.join(config.root,'profile'));
app.whenReady().then(async()=>{
 const moduleFile=name=>pathToFileURL(path.join(config.archive,name)).href;
 const {installedPayload}=await import(moduleFile('services/incremental-update.mjs'));
 const {createAppUpdateService}=await import(moduleFile('services/app-update.mjs'));
 const archive=path.join(config.install,'resources/app.asar'),normal=await virtualFs.stat(archive);
 assert.equal(normal.isDirectory(),true,'The fixture must reproduce Electron ASAR virtualization');assert.equal((await fs.stat(archive)).isFile(),true);
 const beforeNoAsar=process.noAsar,base=await installedPayload(config.install,'99.0.0',{verifyFiles:true});
 assert.ok(base,'A valid physical ASAR must remain eligible for incremental updates inside Electron');
 const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),deltaBytes=Buffer.from('verified isolated incremental installer'),fullBytes=Buffer.from('full installer must not be requested');
 const release={version:'99.0.1',tag:'v99.0.1'},name='RiftBuddy-99.0.1-From-99.0.0-Update.exe',metaName='RiftBuddy-99.0.1-Delta.json',fullName='RiftBuddy-99.0.1-Setup.exe';
 const metadata=Buffer.from(JSON.stringify({schema:1,version:release.version,packages:[{from:'99.0.0',baseManifestSha256:base.sha256,file:name,bytes:deltaBytes.length,sha256:sha(deltaBytes)}]}));
 const routes=new Map([[name,deltaBytes],[metaName,metadata],[fullName,fullBytes],['SHA256SUMS-99.0.1.txt',Buffer.from(`${sha(metadata)}  ${metaName}\n${sha(fullBytes)}  ${fullName}\n`)]]),hits=[];
 const server=http.createServer((req,res)=>{const file=req.url.split('/').at(-1);hits.push(file);const body=routes.get(file);if(!body){res.writeHead(404);res.end();return;}res.end(body);});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const service=createAppUpdateService({currentVersion:'99.0.0',installDir:config.install,tempDir:path.join(config.root,'download'),storeFile:path.join(config.root,'pending.json'),dryRun:true,insecureHosts:['github.com'],request:(url,options,callback)=>http.request({...options,hostname:'127.0.0.1',port:server.address().port,path:url.pathname},callback)});
  const progress=[],record=await service.download(release,{onProgress:p=>progress.push(p)});
  assert.equal(record.kind,'incremental');assert.equal(record.bytes,deltaBytes.length);assert.equal(record.sha256,sha(deltaBytes));assert.ok(progress.some(p=>p.kind==='incremental'));assert.ok(!hits.includes(fullName));
  assert.equal((await service.install()).dryRun,true);
  assert.equal(process.noAsar,beforeNoAsar);assert.equal((await virtualFs.stat(archive)).isDirectory(),true,'Archive handling elsewhere must stay virtualized');
  await fs.appendFile(archive,'tampered physical archive');assert.equal(await installedPayload(config.install,'99.0.0',{verifyFiles:true}),null);
  await assert.rejects(service.install(),/本地程序已变化/);assert.equal(await service.pending(),null);
  assert.equal(await fs.readFile(path.join(config.root,'player.json'),'utf8'),'{"favorites":["Ashe"]}');
  const proof={passed:true,electron:process.versions.electron,archive:config.archive,physicalAsarVerified:true,incrementalBytes:record.bytes,fullRequests:0,installDryRun:true,tamperedAsarRejected:true,globalNoAsarUnchanged:true,clientWrites:0,root:config.root};
  await fs.writeFile(path.join(config.root,'report.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
