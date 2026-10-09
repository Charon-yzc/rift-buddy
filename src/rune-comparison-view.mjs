import {escape as e,gameDescription} from './ui.mjs';
import {SHARDS} from './core/builds.mjs';

// Compare complete pages against what the user currently selected. Secondary
// rune ordering has no gameplay meaning; shard positions do.
export function runeComparisonView(page,current,data){
 const next=page?.selectedPerkIds,base=current?.selectedPerkIds;
 if(next?.length!==9||base?.length!==9)return '';
 const runes=new Map((data?.runes||[]).flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r]))));
 const added=next.slice(0,6).filter(id=>!base.slice(0,6).includes(id)),removed=base.slice(0,6).filter(id=>!next.slice(0,6).includes(id));
 const label=id=>{const rune=runes.get(id);return `<span title="${e(gameDescription(rune?.longDesc||rune?.shortDesc||''))}">${e(rune?.name||'符文 '+id)}</span>`;};
 const shards=next.slice(6).flatMap((id,i)=>id===base[i+6]?[]:[`${['进攻','灵活','防御'][i]}碎片：${SHARDS[base[i+6]]||base[i+6]} → ${SHARDS[id]||id}`]);
 if(!added.length&&!removed.length&&!shards.length)return '<span class="rune-page-difference rune-page-same">符文与当前选择相同</span>';
 return `<span class="rune-page-difference"><span class="rune-page-change">与当前选择比较</span>${added.length?`<span class="rune-page-change"><strong>改选：</strong>${added.map(label).join('、')}</span>`:''}${removed.length?`<span class="rune-page-change"><strong>放弃：</strong>${removed.map(label).join('、')}</span>`:''}${shards.map(text=>`<span class="rune-page-change">${e(text)}</span>`).join('')}</span>`;
}
