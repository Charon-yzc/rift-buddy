// Public display metadata only. It must never replace the signed game snapshot,
// qualify a new champion for recommendations, or become an installer/export.
const root='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';
const number=value=>Number.isSafeInteger(Number(value))&&Number(value)>0&&Number(value)<=1000000?Number(value):null;
const text=(value,max)=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,max):'';
const price=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1000000?value:null;
export function championIcon(value){const id=number(value);return id?root+'v1/champion-icons/'+id+'.png':'';}
function itemIcon(value){
 if(typeof value!=='string'||!value.startsWith('/lol-game-data/assets/'))return '';
 const relative=value.slice('/lol-game-data/assets/'.length).toLowerCase();
 return relative.length<=300&&/^assets\/items\/icons2d\/[a-z0-9_./-]+\.png$/.test(relative)&&!relative.split('/').some(part=>part==='..'||part==='.')?root+relative:'';
}
export function normalizeClientDictionary(championsRaw,itemsRaw){
 const champions=[],items=[],seenHeroes=new Set(),seenItems=new Set();
 if(Array.isArray(championsRaw)&&championsRaw.length<=500)for(const c of championsRaw){
  const key=number(c?.id);if(!key||seenHeroes.has(key))continue;
  const id=typeof c.alias==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(c.alias)?c.alias:'Champion'+key;
  champions.push({id,key,clientOnly:true,name:text(c.name,64)||'英雄 '+key,title:text(c.title,128),icon:championIcon(key)});seenHeroes.add(key);
 }
 if(Array.isArray(itemsRaw)&&itemsRaw.length<=25000)for(const item of itemsRaw){
  const id=number(item?.id);if(!id||seenItems.has(id))continue;
  const gold=Object.fromEntries([['base',price(item.price)],['total',price(item.priceTotal)],['sell',price(item.sellPrice)]].filter(([,cost])=>cost!==null));
  items.push({id,clientOnly:true,name:text(item.name,64)||'装备 '+id,description:text(item.description,2000),icon:itemIcon(item.iconPath),...(Object.keys(gold).length?{gold}:{})});seenItems.add(id);
 }
 return champions.length||items.length?{champions,items}:null;
}
export function clientChampion(data,value){
 const known=data?.champions?.find(c=>c.id===value||Number(c.key)===number(value));if(known)return known;
 const live=data?.clientDictionary?.champions?.find(c=>c.id===value||c.key===number(value));if(live)return live;
 const key=number(value);return key?{id:'Champion'+key,key,clientOnly:true,name:'英雄 '+key,title:'',icon:championIcon(key)}:null;
}
export function clientItem(data,value){return data?.items?.[value]||data?.clientDictionary?.items?.find(item=>item.id===number(value))||null;}
export function installClientDictionary(data,value){
 if(data.clientDictionary===value||JSON.stringify(data.clientDictionary??null)===JSON.stringify(value??null))return false;
 data.clientDictionary=value??null;return true;
}
