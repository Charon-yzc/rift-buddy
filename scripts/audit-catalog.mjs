import fs from 'node:fs/promises';
import {BUNDLED_CATALOG,validateCatalog,catalogIssues} from '../src/core/catalog.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
const catalog=process.argv[2]?JSON.parse(await fs.readFile(process.argv[2],'utf8')):BUNDLED_CATALOG;
validateCatalog(catalog);
const issues=catalogIssues(catalog,data),coverage={},configs=new Map(catalog.loadouts.map(l=>[l.id,l]));
for(const t of catalog.trios){const key=t.members.map(m=>m.role).sort().join('+');coverage[key]=(coverage[key]||0)+1;}
const review=[...catalog.duos,...catalog.trios].map(c=>({id:c.id,name:c.name,...issues.status[c.id],
 members:(c.members||[{champion:c.carry,role:'bottom',loadoutId:c.loadouts.bottom},{champion:c.support,role:'support',loadoutId:c.loadouts.support}]).map(m=>({...m,configReview:issues.loadoutStatus[m.loadoutId]||null})),
 sourceCount:c.sources.length,configurations:(c.members?.map(m=>m.loadoutId)||Object.values(c.loadouts)).filter(id=>id!=='default').map(id=>({id,items:configs.get(id)?.items,runes:configs.get(id)?.runes}))}));
console.log(JSON.stringify({at:new Date().toISOString(),version:catalog.version,patch:data.patch,coverage,errors:issues.errors,stale:issues.stale,staleLoadouts:issues.staleLoadouts,review},null,2));
if(issues.errors.length)process.exitCode=1;
