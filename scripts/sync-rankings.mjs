import fs from 'node:fs/promises';
import {BUILD_REGIONS,BUILD_TIERS} from '../src/core/build-source.mjs';
import {fetchRankings,loadRankings} from '../services/rankings-cache.mjs';
import {atomicJSON} from '../services/data.mjs';

const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
const entries=await loadRankings(['data'],data);
for(const region of BUILD_REGIONS)for(const tier of BUILD_TIERS){
 const ref=await fetchRankings(data,{region:region.id,tier:tier.id});entries[ref.key]=ref;
 console.log(`${ref.key}: ${Object.entries(ref.boards).map(([role,rows])=>role+' '+rows.length).join(', ')}`);
}
await atomicJSON('data/rankings.json',{schema:1,entries});
