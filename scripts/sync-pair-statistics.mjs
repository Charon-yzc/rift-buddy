import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {readPublicJSON} from '../services/build-json.mjs';
import {parsePairStatisticsJSON} from '../services/pair-statistics.mjs';
import {pairApiUrl,validatePairStatistics} from '../src/core/pair-statistics.mjs';
import {requireBuildSource} from '../src/core/build-source.mjs';
import {atomicJSON} from '../services/data.mjs';

const args=process.argv.slice(2),arg=(name,fallback)=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
const source=requireBuildSource({region:arg('region','global'),tier:arg('tier','emerald_plus')});
const data=JSON.parse(await fs.readFile('data/game.json','utf8')),builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries,byId=new Map(data.champions.map(c=>[c.id,c]));
const targets=[...new Map(Object.values(builds).map(b=>[b.champion+':'+b.role,{champion:b.champion,role:b.role}])).values()].sort((a,b)=>(a.champion+':'+a.role).localeCompare(b.champion+':'+b.role));
const entries=[],failures=[];let next=0;
async function worker(){while(next<targets.length){const target=targets[next++];try{
 const champion=byId.get(target.champion);if(!champion)throw Error('Unknown champion');
 const raw=await readPublicJSON(pairApiUrl(champion.key,target.role,source,data.patch),{limit:256000});
 entries.push(parsePairStatisticsJSON(raw,{champion,role:target.role,data,source,rawSha256:crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex')}));
 }catch(error){failures.push({target,error:error.message});}}}
await Promise.all(Array.from({length:3},worker));
if(failures.length){console.error(JSON.stringify({message:'资料刷新未完成，原同队统计保留。',failures},null,2));process.exitCode=1;}
else{const snapshot={schema:1,source:'OP.GG',...source,patch:data.patch,entries:entries.sort((a,b)=>(a.champion+':'+a.role).localeCompare(b.champion+':'+b.role))};validatePairStatistics(snapshot,data.champions);await atomicJSON('data/pair-statistics.json',snapshot);console.log(JSON.stringify({entries:entries.length,directionalRows:entries.reduce((n,e)=>n+e.pairs.length,0),...source,patch:data.patch}));}
