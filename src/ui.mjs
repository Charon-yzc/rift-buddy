export const escape = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const gameDescription=v=>String(v??'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/@[^@]+@/g,'〔动态数值〕');
const icons={
 team:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
 sword:'<path d="m14 5 5-3 3 3-3 5L8 21l-5-5L14 5ZM12 7l5 5M2 22l4-4M4 13l7 7"/>',
 book:'<path d="M4 3h12a3 3 0 0 1 3 3v15H6a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1ZM3 17h16M8 7h6M8 11h4"/>',
 hex:'<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 5 4 5-4 5-4-5 4-5Z"/>',
 star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
 settings:'<path d="m9 3-1 3-3 1 1 3-1 3 3 1 1 3 3-1 3 1 1-3 3-1-1-3 1-3-3-1-1-3-3 1-3-1Z"/><circle cx="12" cy="10" r="3"/>',
 link:'<path d="m10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2"/>',
 unlock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7-2M12 15v2"/>',
 search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 pin:'<path d="m8 3 8 0-1 6 3 4H6l3-4-1-6ZM12 13v8"/>',
 spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4"/>',
 chevron:'<path d="m8 4 8 8-8 8"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/>',
 upload:'<path d="M12 17V5m-5 5 5-5 5 5M5 17v4h14v-4"/>',
};
export const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.spark}</svg>`;
export const portrait=(c,cls='')=>c?`<img class="portrait ${cls}" src="${escape(localAssets[`champion/${c.id}`]||`../data/images/champion/${c.id}.png`)}" data-fallback="${escape(c.icon)}" alt="${escape(c.name)}" loading="lazy" />`:'<div class="empty-portrait">+</div>';
let fallbackAssets=new Map(),localAssets={};
export function configureAssets(data){
 localAssets=data.imageOverrides||{};
 const dd='https://ddragon.leagueoflegends.com';
 fallbackAssets=new Map([
  ...Object.values(data.items).map(i=>[`item/${i.id}`,i.icon]),
  ...data.augments.map(a=>[`augment/${a.id}`,a.icon]),
  ...Object.entries(data.spells).map(([id,s])=>[`spell/${id}`,`${dd}/cdn/${data.version}/img/spell/${s.image.full}`]),
  ...data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[`rune/${r.id}`,`${dd}/cdn/img/${r.icon}`]))),
 ]);
}
export const asset=(kind,id,alt='',cls='')=>`<img class="${cls}" src="${escape(localAssets[`${kind}/${id}`]||`../data/images/${kind}/${id}.png`)}" ${fallbackAssets.get(`${kind}/${id}`)?`data-fallback="${escape(fallbackAssets.get(`${kind}/${id}`))}"`:''} alt="${escape(alt)}" loading="lazy" />`;
export const button=(action,label,ico='',cls='',extra='')=>`<button type="button" class="btn ${cls}" data-action="${action}" ${extra}>${ico?icon(ico):''}${label}</button>`;
export const dateLabel=v=>v?new Date(v).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}):'未知';
