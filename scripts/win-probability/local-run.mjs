// Real-client experiments require this explicit CLI. No app startup hook exists.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createMatchHistoryService} from '../../services/match-history.mjs';
import {createHelperManager} from '../../services/client-helper.mjs';
import {collectLocalExperiment} from './local-collect.mjs';
import {evaluateLocalExperiment} from './local-evaluate.mjs';
export const createExperimentTempDirectory=()=>fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-winprob-'));
export async function runLocalExperiment({helperMode=false,options={},output='.local/win-probability/local-experiment-results.json'}={}){
 let manager=null,temporary=null;const direct=createMatchHistoryService({operationDeadlineMs:20000});
 try{
  let execute=(operation,payload)=>direct.execute(operation,payload);
  if(helperMode){
   const release=JSON.parse(await fs.readFile('release/latest.json','utf8')),bundleRoot=path.join(release.directory,'resources/connection');
   temporary=await createExperimentTempDirectory();
   manager=createHelperManager({userData:temporary,bundleRoot,executable:path.join(bundleRoot,'node.exe'),isPackaged:true,helperExecutable:path.join(bundleRoot,'node.exe'),helperEntry:path.join(bundleRoot,'electron/client-helper-entry.mjs'),helperBundleRoot:bundleRoot,launcherExecutable:path.join(bundleRoot,'connection-launcher.exe'),onProgress:message=>console.log(message)});
   await manager.ensure('');execute=(operation,payload)=>manager.request('matchHistory',{operation,payload});
  }
  const catalog=JSON.parse(await fs.readFile('data/game.json','utf8')),vocabulary=catalog.champions.map(c=>c.key).map(Number).filter(n=>Number.isSafeInteger(n)&&n>0).sort((a,b)=>a-b);
  if(vocabulary.length!==catalog.champions.length)throw Error('Bundled champion numeric vocabulary unavailable');
  const collected=await collectLocalExperiment({execute,vocabulary,options,onProgress:progress=>console.log(JSON.stringify({progress}))});
  const report={...collected.report,experiment:evaluateLocalExperiment(collected.dataset),runtime:process.version};
  collected.dataset.pregame.length=0;collected.dataset.live.length=0;
  await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,queue:report.queue,requests:report.requests,targets:report.targets,historyPlayers:report.historyPlayers,timelinesAccepted:report.timelinesAccepted,liveSnapshots:report.liveSnapshots,elapsedSeconds:report.elapsedSeconds,pregame:report.experiment.pregame.status,live:report.experiment.live.status}));
  return report;
 }finally{direct.clear();if(manager)await manager.shutdown().catch(()=>{});if(temporary)await fs.rm(temporary,{recursive:true,force:true}).catch(()=>{});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(!args.includes('--read-client'))throw Error('Use --read-client explicitly for the bounded local experiment');
 const queueIndex=args.indexOf('--queue'),queue=queueIndex<0?420:Number(args[queueIndex+1]);
 try{await runLocalExperiment({helperMode:args.includes('--helper'),options:{queue},output:`.local/win-probability/local-experiment-${queue}-results.json`});}catch(error){const localMessage=/^(?:Cannot read initial local history|Invalid bounded option: [A-Za-z]+|Invalid local experiment budget|Local CN experiment requires a verified Tencent region|Bundled champion numeric vocabulary unavailable|Client session changed|Experiment budget exhausted)$/;console.error(localMessage.test(error.message)||/权限|登录|连接/.test(error.message)?error.message:'Local experiment failed; no raw history or credentials saved');process.exitCode=1;}
}
