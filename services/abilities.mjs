import fs from 'node:fs/promises';
import path from 'node:path';
import {validAbilityReference} from '../src/core/abilities.mjs';
export async function loadAbilities(root,data){
 try{const ref=JSON.parse(await fs.readFile(path.join(root,'abilities.json'),'utf8'));return validAbilityReference(ref,data,{allowOlder:true})?ref:null;}catch{return null;}
}
