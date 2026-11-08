// Historical replay setup, never packaged or used by the app.
import catalog from './catalog.json' with {type:'json'};
import {configureCatalog,catalogIssues} from '../../../src/core/catalog.mjs';
configureCatalog(catalog);
export {catalog as BUNDLED_CATALOG};
export function historicalData(data){data.catalog=catalog;data.catalogInfo=catalogIssues(catalog,data);return data;}

// Explicit choices made by a player when replaying the archived catalog.
export function historicalSelection(comboId,champion,role){const combo=[...catalog.duos,...catalog.trios].find(c=>c.id===comboId);const loadoutId=combo?.members?.find(m=>m.champion===champion&&m.role===role)?.loadoutId||combo?.loadouts?.[role]||'default',skill=catalog.skillPlans.find(p=>p.champion===champion&&p.role===role&&p.loadoutId===loadoutId);return {comboId,loadoutId,...(skill?{skillId:'scoped-skill-'+skill.id}:{})};}
