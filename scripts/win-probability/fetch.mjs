import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DATA_SOURCE,DEFAULT_ROOT} from './sources.mjs';

export async function downloadDataset({root=DEFAULT_ROOT,files=Object.keys(DATA_SOURCE.files),fetcher=fetch}={}){
 const directory=path.resolve(root,'source'),manifestPath=path.resolve(root,'downloads.json');await fs.mkdir(directory,{recursive:true});
 let old={files:{}};try{old=JSON.parse(await fs.readFile(manifestPath,'utf8'));}catch{}
 const manifest={source:DATA_SOURCE,downloadedAt:new Date().toISOString(),files:{}};let total=0;
 for(const name of files){
  if(!Object.hasOwn(DATA_SOURCE.files,name))throw Error('File is outside source allowlist');
  const target=path.join(directory,name),cap=DATA_SOURCE.files[name],prior=old.source?.id===DATA_SOURCE.id?old.files?.[name]:null;
  if(prior){try{const data=await fs.readFile(target);const hash=createHash('sha256').update(data).digest('hex');if(data.length===prior.bytes&&hash===prior.sha256){total+=data.length;manifest.files[name]=prior;continue;}}catch{}}
  const url=`https://www.kaggle.com/api/v1/datasets/download/${DATA_SOURCE.ref}/${name}?datasetVersionNumber=${DATA_SOURCE.version}`;
  const temporary=target+'.partial';let bytes=0,hash;
  for(let attempt=0;attempt<3;attempt++){
   try{
    const response=await fetcher(url,{signal:AbortSignal.timeout(180000)});
    if(!response.ok)throw Error(`Dataset download HTTP ${response.status}: ${name}`);
    const host=new URL(response.url||url).hostname;
    if(host!=='www.kaggle.com'&&host!=='storage.googleapis.com')throw Error('Unexpected dataset download host');
    const handle=await fs.open(temporary,'w');hash=createHash('sha256');bytes=0;let complete=false,lastProgress=0;
    try{for await(const chunk of response.body){bytes+=chunk.length;if(bytes>cap||total+bytes>DATA_SOURCE.maxTotalBytes)throw Error('Dataset download exceeds byte budget');hash.update(chunk);await handle.writeFile(chunk);if(bytes-lastProgress>=50_000_000){lastProgress=bytes;console.log(`Receiving ${name}: ${bytes} bytes`);}}complete=true;}
    finally{await handle.close();if(!complete)await fs.rm(temporary,{force:true});}
    break;
   }catch(error){
    const transient=['ECONNRESET','ETIMEDOUT','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'].includes(error.cause?.code)||error.name==='TimeoutError'||error.name==='AbortError'||error.message==='fetch failed'||error.message==='terminated';
    if(!transient||attempt===2)throw error;console.log(`Retry ${name}: connection attempt ${attempt+2}/3`);
   }
  }
  const head=await fs.open(temporary,'r');let prefix;try{const buffer=Buffer.alloc(256);const read=await head.read(buffer,0,256,0);prefix=buffer.subarray(0,read.bytesRead).toString('utf8').replace(/^\ufeff/,'');}finally{await head.close();}
  if(!prefix.includes(',')||prefix.startsWith('<')||!prefix.startsWith(name==='ChampionTbl.csv'?'ChampionId':name==='RankTbl.csv'?'RankId':name==='MatchTbl.csv'?'MatchId':name==='TeamMatchTbl.csv'?'TeamID':name==='SummonerMatchTbl.csv'?'SummonerMatchId':name==='MatchStatsTbl.csv'?'MatchStatsId':'TimelineId')){await fs.rm(temporary,{force:true});throw Error('Dataset response is not expected CSV');}
  await fs.rename(temporary,target);total+=bytes;manifest.files[name]={url,bytes,sha256:hash.digest('hex')};
  await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');console.log(`Downloaded ${name}: ${bytes} bytes`);
 }
 if(total>DATA_SOURCE.maxTotalBytes)throw Error('Dataset exceeds total budget');
 await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),rootIndex=args.indexOf('--root');
 await downloadDataset({root:rootIndex>=0?args[rootIndex+1]:DEFAULT_ROOT});
}
