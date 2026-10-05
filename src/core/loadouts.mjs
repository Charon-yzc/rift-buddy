import bundledCatalog from './catalog-data.json' with {type:'json'};
export let LOADOUT_PATCH=bundledCatalog.patch,LOADOUT_DATE=bundledCatalog.reviewedAt,RUNE_PLANS=bundledCatalog.runes,LOADOUTS=bundledCatalog.loadouts;
export function configureLoadoutCatalog(catalog){LOADOUT_PATCH=catalog.patch;LOADOUT_DATE=catalog.reviewedAt;RUNE_PLANS=catalog.runes;LOADOUTS=catalog.loadouts;}
export function loadoutOptions(champion,role,mode='rift'){return mode==='rift'?LOADOUTS.filter(p=>p.champions.includes(champion.id)&&p.roles.includes(role)):[];}
export function comboLoadout(combo,champion,role){
 if(!combo||!champion)return null;
 if(combo.members){const member=combo.members.find(m=>m.role===role&&m.champion===champion.id);return member?.loadoutId|| (member?'default':null);}
 if(!['bottom','support'].includes(role)||champion.id!==combo[role==='bottom'?'carry':'support'])return null;
 return combo.loadouts?.[role]||'default';
}
export function comboSources(combo){return combo?.sources||[];}
export function mechanismRuneKeys(buildKey,champion,role){
 if(['Samira','Nilah'].includes(champion.id))return ['conqueror','press'];
 if(champion.id==='Jhin')return ['fleet'];
 if(['crit','onhit'].includes(buildKey))return champion.id==='Jhin'?['fleet']:['lethal','press','fleet'];
 if(buildKey==='meleeCrit')return ['lethal','conqueror'];
 if(buildKey==='supportTank')return ['aftershock','guardian'];
 if(buildKey==='enchanter')return ['aery','guardian'];
 if(buildKey==='tank')return ['grasp','aftershock'];
 if(buildKey==='senna')return ['fleet','aery'];
 if(buildKey==='pokeSupport')return ['comet','hail'];
 if(buildKey==='fighter')return ['conqueror'];
 if(buildKey==='apAssassin'||buildKey==='adAssassin')return ['electro'];
 if(buildKey==='burn')return ['comet','harvest'];
 if(buildKey==='ezreal')return ['press','conqueror'];
 return ['comet','first'];
}
