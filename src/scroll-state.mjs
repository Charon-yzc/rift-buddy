// The legacy renderer rebuilds whole pages, which resets every inner scroll
// box. Boxes marked with data-scroll-key (a card's history list, a team's card
// row) keep their offsets across that rebuild.
export function captureScroll(root){
 const kept=new Map();
 for(const node of root?.querySelectorAll?.('[data-scroll-key]')||[])if(node.scrollTop||node.scrollLeft)kept.set(node.dataset.scrollKey,[node.scrollTop,node.scrollLeft]);
 return kept;
}

export function restoreScroll(root,kept){
 if(!kept?.size)return 0;
 let restored=0;
 for(const node of root?.querySelectorAll?.('[data-scroll-key]')||[]){const value=kept.get(node.dataset.scrollKey);if(!value)continue;node.scrollTop=value[0];node.scrollLeft=value[1];restored++;}
 return restored;
}
