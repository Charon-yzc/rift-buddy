import path from 'node:path';
import {publishServerData} from '../services/server-data-publish.mjs';
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index<0?null:args[index+1];};
try{
 const root=option('--root'),publicRoot=option('--public-root'),keyFile=option('--key');
 if(!root||!publicRoot||!keyFile||path.resolve(root)===path.resolve(publicRoot)||path.resolve(keyFile).startsWith(path.resolve(publicRoot)+path.sep))throw Error('指定独立的 --root、--public-root 和非公开的 --key 文件');
 const result=await publishServerData({root,publicRoot,keyFile,generations:!args.includes('--legacy-only')});
 console.log(JSON.stringify({changed:result.changed,patch:result.manifest.patch,release:result.manifest.release,sequence:result.manifest.sequence,...(result.generation?{generation:{changed:result.generation.changed,refreshed:result.generation.refreshed,version:result.generation.manifest.version,release:result.generation.manifest.release,sequence:result.generation.manifest.sequence}}:{})}));
}catch(error){console.error(error.message);process.exitCode=1;}
