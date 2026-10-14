import path from 'node:path';
import {parseArgs} from 'node:util';
import {collectServerData} from '../services/server-data-collector.mjs';

const {values}=parseArgs({options:{root:{type:'string'},seed:{type:'string'},'max-champions':{type:'string'}}});
if(!values.root||!values.seed)throw Error('用法：node scripts/collect-server-data.mjs --root <候选保存目录> --seed <基线资料目录>');
const root=path.resolve(values.root),seedRoot=path.resolve(values.seed),maxChampions=values['max-champions']===undefined?null:Number(values['max-champions']);
if(root===seedRoot||root.startsWith(seedRoot+path.sep)||seedRoot.startsWith(root+path.sep))throw Error('候选目录与基线目录不能重叠');
let phase='';
const status=await collectServerData({root,seedRoot,maxChampions,onProgress:value=>{
 const next=Object.entries(value.datasets).find(([,state])=>state.state==='running')?.[0]||value.state;
 if(next!==phase){console.log(JSON.stringify({phase:next,requests:value.network.requests,bytes:value.network.bytes}));phase=next;}
}});
console.log(JSON.stringify(status));
// Nonzero status makes partial collection visible to systemd without removing
// a valid candidate produced by the other sources in this round.
process.exitCode=status.state==='ok'?0:status.state==='partial'?2:1;
