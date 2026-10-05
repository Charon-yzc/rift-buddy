import fs from 'node:fs/promises';
import {getJSON,atomicJSON} from '../services/data.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
const raw=await getJSON(`https://ddragon.leagueoflegends.com/cdn/${data.version}/data/zh_CN/item.json`);
for(const [id,item] of Object.entries(data.items))item.specialRecipe=raw.data[id]?.specialRecipe||null;
await atomicJSON('data/game.json',data);console.log('Enriched item upgrade paths.');
