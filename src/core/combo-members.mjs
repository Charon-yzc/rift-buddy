// Legacy bot-lane entries remain readable without rewriting saved libraries.
export function comboMembers(combo){
 if(Array.isArray(combo?.members))return combo.members;
 if(!combo?.carry||!combo?.support)return [];
 return [{role:'bottom',champion:combo.carry,loadoutId:combo.loadouts?.bottom||'default'},
  {role:'support',champion:combo.support,loadoutId:combo.loadouts?.support||'default'}];
}
export const comboKey=combo=>comboMembers(combo).map(m=>m.role+':'+m.champion).sort().join('|');
