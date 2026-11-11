import fs from 'node:fs/promises';
import path from 'node:path';
import {validPatchNotes} from '../src/core/patch-notes.mjs';
export const officialPatchFor=patch=>{if(!/^\d{2}\.\d{1,2}$/.test(patch))throw Error('版本改动补丁无效');const [season,release]=patch.split('.').map(Number);return `${season+10}.${release}`;};
export const patchNotesURL=patch=>`https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-${officialPatchFor(patch).replace('.','-')}-notes/`;
const decode=value=>value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|ldquo|rdquo|ndash|mdash|rarr|rArr);/gi,(all,key)=>{
 if(key[0]==='#'){const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return code>0&&code<=0x10ffff?String.fromCodePoint(code):all;}
 return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',ndash:'–',mdash:'—',rarr:'→',rArr:'⇒'})[key]||all;
});
// A small tokenizer for Riot's server-rendered richText body. Parent ancestry
// keeps editorial blockquotes and other modes out of the balance records.
function nodes(html){
 const root={tag:'root',children:[]},stack=[root],voids=new Set(['br','hr','img','input','meta','link','source','wbr']);
 for(const token of html.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)||[]){
  if(token.startsWith('<!--'))continue;
  const close=token.match(/^<\/([a-z\d]+)/i);if(close){const at=stack.findLastIndex(node=>node.tag===close[1].toLowerCase());if(at>0)stack.length=at;continue;}
  const open=token.match(/^<([a-z\d]+)/i);
  if(open){const node={tag:open[1].toLowerCase(),children:[],parent:stack.at(-1)};stack.at(-1).children.push(node);if(!voids.has(node.tag)&&!token.endsWith('/>'))stack.push(node);}
  else stack.at(-1).children.push({tag:'#text',value:decode(token),parent:stack.at(-1)});
 }
 const list=[];const visit=node=>{list.push(node);for(const child of node.children||[])visit(child);};visit(root);return list;
}
const inside=(node,tag)=>{for(let parent=node.parent;parent;parent=parent.parent)if(parent.tag===tag)return true;return false;};
const plain=node=>node.tag==='#text'?node.value:node.tag==='br'?'\n':(node.children||[]).filter(child=>!['ul','ol'].includes(child.tag)).map(plain).join('')+(node.tag==='p'?'\n':'');
const clean=node=>plain(node).replace(/[^\S\n]+/g,' ').replace(/ *\n */g,'\n').trim();
const normalize=value=>value.toLowerCase().replace(/[^a-z\d]/g,'');
function heroId(name,data){const alias={wukong:'MonkeyKing',nunuandwillump:'Nunu',nunuwillump:'Nunu'};return alias[normalize(name)]||data.champions.find(hero=>normalize(hero.id)===normalize(name))?.id;}
// Stable item identities cross-checked with the official Chinese 26.21/26.22
// announcement and the current Data Dragon catalog. Unknown new names remain
// visible as source names; they are never assigned a guessed item identity.
const officialItems={"Doran's Bow":1086,"Overlord's Bloodmail":2501,'Bastion Breaker':2520,Dawncore:6621,'Gluttonous Greaves':3008,Hubris:6697};

export function parseOfficialPatchNotes(html,patch,data){
 const officialPatch=officialPatchFor(patch),sourceURL=patchNotesURL(patch),script=html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
 if(!script)throw Error('官方版本改动缺少页面数据');
 const page=JSON.parse(script[1])?.props?.pageProps?.page,rich=page?.blades?.filter(blade=>blade.type==='patchNotesRichText'),masthead=page?.blades?.find(blade=>blade.type==='articleMasthead');
 if(page?.url!==sourceURL||page.locale!=='en-us'||page.title!==`League of Legends Patch ${officialPatch} Notes`||rich?.length!==1||rich[0].fragmentId!==officialPatch||rich[0].richText?.type!=='html'||!Number.isFinite(Date.parse(masthead?.publishDate)))throw Error('官方版本改动页面版本或来源不匹配');
 const result={patch,officialPatch,publishedAt:masthead.publishDate,sourceURL,mode:'rift',format:'official-text',champions:[],items:[],systems:[]};
 let section='',row=null,skill='',update='',rift=false,ended=false,sawChampions=false;const midpatch=[];
 for(const node of nodes(rich[0].richText.body)){
  if(node.tag==='h2'){
   const title=clean(node);row=null;skill='';
   if(title==='Mid-Patch Updates'){section='midpatch';continue;}
   if(title==='Champions'){if(sawChampions)throw Error('官方峡谷章节重复');sawChampions=true;rift=true;section='champions';continue;}
   if(rift&&/^(ARAM|Arena|Classic)\b/i.test(title)){rift=false;ended=true;section='';continue;}
   if(rift){const key=({Items:'items',Systems:'systems',Runes:'systems','Summoner Spells':'systems','Gameplay Changes':'systems'})[title];if(!key)throw Error('尚不支持的峡谷改动章节：'+title);section=key;continue;}
   section='';continue;
  }
  if(ended||!section)continue;
  if(node.tag==='h3'){
   skill='';if(section==='midpatch'){update=clean(node);row=null;continue;}
   const name=clean(node);row={direction:'adjustment',changes:[]};
   if(section==='champions'){row.champion=heroId(name,data);if(!row.champion)throw Error('无法核对官方英雄：'+name);}
   else if(section==='items'){const id=officialItems[name],item=data.items?.[id];Object.assign(row,item?{item:item.name,itemId:id,sourceName:name}:{item:name});}
   else row.system=name;
   result[section].push(row);continue;
  }
  if(node.tag==='h4'){
   if(section==='midpatch'){
    const name=clean(node),champion=heroId(name,data);if(!champion)throw Error('尚不支持的热修章节：'+name);
    row={champion,direction:'adjustment',changes:[]};midpatch.push(row);
   }else skill=clean(node);
   continue;
  }
  // Editorial intent is not balance data. Retain hotfix context because Riot
  // sometimes documents a restored mechanic only in that paragraph.
  if(row&&node.tag==='blockquote'){if(section==='midpatch'){const context=clean(node);if(context)row.note=[row.note,context].filter(Boolean).join('\n');}continue;}
  if(!row||!['li','p'].includes(node.tag)||inside(node,'blockquote')||node.tag==='p'&&inside(node,'li'))continue;
  const text=clean(node);if(!text)continue;
  // Riot also places balance lines in <p> after a list. Context paragraphs
  // are blockquotes; retaining both avoids losing Corki/Rumble/item values.
  row.changes.push({...(skill?{skill}:{}),field:'官方原文',text,direction:'adjustment',...(section==='midpatch'?{note:update}: {})});
 }
 if(!sawChampions||!ended||!result.champions.length)throw Error('官方峡谷改动章节不完整');
 for(const hotfix of midpatch){const target=result.champions.find(row=>row.champion===hotfix.champion);if(target){target.changes.push(...hotfix.changes);if(hotfix.note)target.note=[target.note,`Mid-Patch Updates: ${hotfix.note}`].filter(Boolean).join('\n');}else result.champions.push(hotfix);}
 const notes={schema:1,scope:'summoners-rift',patches:[result]};if(!validPatchNotes(notes,data))throw Error('官方改动条目无法通过校验');return result;
}

export async function fetchPatchNotes(data,{fetcher=fetch,previous=null}={}){
 const [season,release]=data.patch.split('.').map(Number),patches=[data.patch,...(release>1?[`${season}.${release-1}`]:[])],records=[];
 // Two official pages per round include same-patch hotfixes, with the server's
 // existing request pacing, response budget and no-redirect transport.
 for(const patch of patches){
  const response=await fetcher(patchNotesURL(patch),{redirect:'error',signal:AbortSignal.timeout(40000)});
  if(!response.ok)throw Error('官方版本改动来源返回 '+response.status);
  if(Number(response.headers.get('content-length'))>4_000_000)throw Error('官方版本改动响应过大');
  const html=await response.text();if(Buffer.byteLength(html)>4_000_000)throw Error('官方版本改动响应过大');const record=parseOfficialPatchNotes(html,patch,data);
  // A reviewed national-server annotation belongs only to its exact patch.
  // Refreshing Riot's page cannot silently turn it into Riot-authored prose.
  const regional=validPatchNotes(previous,data)&&previous.patches.find(row=>row.patch===patch&&row.officialPatch===record.officialPatch)?.regionalNotes;
  if(regional)record.regionalNotes=structuredClone(regional);records.push(record);
 }
 const keep=validPatchNotes(previous,data)?previous.patches.filter(row=>!patches.includes(row.patch)):[];
 return {schema:1,scope:'summoners-rift',source:'Riot Games official patch notes',patches:[...records,...keep].slice(0,12)};
}
export async function loadPatchNotes(root,data){
 try{const notes=JSON.parse(await fs.readFile(path.join(root,'patch-notes.json'),'utf8'));if(validPatchNotes(notes,data))return notes;}catch{}
 return {schema:1,scope:'summoners-rift',patches:[],unavailable:true};
}
