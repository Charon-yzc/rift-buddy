import fs from 'node:fs/promises';
import path from 'node:path';
import {startHelper} from '../services/client-helper.mjs';

const value=name=>process.argv.find(arg=>arg.startsWith(`${name}=`))?.slice(name.length+1);
const userData=value('--buddy-data'),bundleRoot=value('--buddy-bundle'),sessionFile=value('--lcu-helper');
if(!userData||!bundleRoot||!sessionFile||![userData,bundleRoot,sessionFile].every(path.isAbsolute))throw Error('连接参数不完整');
const status=stage=>fs.writeFile(path.join(userData,'client-helper-status.json'),JSON.stringify({at:new Date().toISOString(),stage})).catch(()=>{});
try{
 await status('starting');
 await startHelper(sessionFile,{userData,bundleRoot,quit:()=>{process.exitCode=0;}});
 await status('ready');
}catch(error){await status(error.message);process.exitCode=1;}
