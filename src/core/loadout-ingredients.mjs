// Include unavailable component IDs too, so an old early item that is part
// of a still-listed core cannot be mistaken for an optional purchase.
export function requiredLoadoutItems(loadout,data){
 const required=new Set(),pending=[...loadout.items,loadout.boots];
 while(pending.length){const key=String(pending.pop());if(required.has(key))continue;required.add(key);
  const item=data.items[key];if(Array.isArray(item?.from))pending.push(...item.from);if(item?.specialRecipe)pending.push(item.specialRecipe);
 }
 return required;
}
