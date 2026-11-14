import fs from 'node:fs/promises';
import {BUNDLED_CATALOG,validateCatalog,catalogDiff,CATALOG_LIMIT} from '../src/core/catalog.mjs';
const file=process.argv[2]||'src/core/catalog-data.json';
try{
 const raw=await fs.readFile(file,'utf8');if(Buffer.byteLength(raw)>CATALOG_LIMIT)throw Error('文件超过 '+CATALOG_LIMIT/1_000_000+' MB');
 const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
 const c=validateCatalog(JSON.parse(raw),data);
 console.log(JSON.stringify({valid:true,file,version:c.version,duos:c.duos.length,trios:c.trios.length,loadouts:c.loadouts.length,changes:catalogDiff(BUNDLED_CATALOG,c)},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
