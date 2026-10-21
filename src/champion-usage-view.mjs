import {escape as e,portrait,button} from './ui.mjs';
import {championUsageWeights,familiarMass} from './core/champion-usage.mjs';
// Summary pages arrive independently of user input. Update their read-only
// region without replacing a live search field or an actively dragged range.
export function patchChampionUsage(root,value,data,options){
 const current=root.querySelector('.champion-usage'),html=championUsageView(value,data,options);
 if(!current||!html)return false;
 const template=root.ownerDocument.createElement('template');template.innerHTML=html;const next=template.content.firstElementChild;
 current.querySelector('header').replaceWith(next.querySelector('header'));
 for(const selector of [':scope>progress',':scope>.usage-strip']){
  const previous=current.querySelector(selector),replacement=next.querySelector(selector);
  if(previous){if(replacement)previous.replaceWith(replacement);else previous.remove();}
  else if(replacement)current.insertBefore(replacement,current.querySelector('.usage-details'));
 }
 const details=current.querySelector('.usage-details'),fresh=next.querySelector('.usage-details');details.querySelector('summary').textContent=fresh.querySelector('summary').textContent;
 // Keep the active slider/value/output while the summary's data basis changes.
 details.querySelector('.familiarity-control>span').firstChild.textContent=fresh.querySelector('.familiarity-control>span').firstChild.textContent;
 const caption=details.querySelector('.familiarity-control>small');caption.textContent=caption.textContent.replace(/^未(?:玩|收录)英雄/,fresh.querySelector('.familiarity-control>small').textContent.match(/^未(?:玩|收录)英雄/)[0]);
 details.querySelector('input').setAttribute('aria-label',fresh.querySelector('input').getAttribute('aria-label'));
 for(const child of [...details.children])if(child.matches('.usage-all,p'))child.remove();
 for(const child of [...fresh.children])if(child.matches('.usage-all,p'))details.append(child);
 return true;
}
export function championUsageView(value,data,{mass=.85}={}){
 if(!value||value.status==='offline')return '';
 const usage=value.usage||{sampled:0,counts:{}},rows=Object.entries(usage.counts).map(([id,count])=>({hero:data.champions.find(hero=>hero.id===id),count})).filter(row=>row.hero).sort((a,b)=>b.count-a.count||a.hero.id.localeCompare(b.hero.id));
 const weights=championUsageWeights(data.champions,usage,mass),percent=Math.round(familiarMass(mass)*100);
 const screenshot=value.basis==='current-season-screenshot',date=Number.isFinite(value.updatedAt)&&value.updatedAt>0?new Date(value.updatedAt).toLocaleDateString('zh-CN'):'';
 const label=value.cached?`本地缓存 · ${usage.sampled} 场${screenshot?' · 当前赛季':''}`:value.status==='loading'?`正在读取 ${value.scanned} / ${value.target} 场`:value.status==='error'?'统计暂不可用':value.scanned?`近 ${value.scanned} 场${usage.sampled!==value.scanned?' · 可用 '+usage.sampled+' 场':''}${value.status==='partial'?' · 未读完':''}`:'暂无历史场次';
 const hero=row=>`<div class="usage-hero" title="${e(row.hero.name)} · ${row.count} 场 · 偏好权重 ${(weights[row.hero.id]*100).toFixed(2)}%（分路限制后重新分配）">${portrait(row.hero)}<span>${e(row.hero.name)}</span><small>${row.count} 场</small></div>`;
 return `<section class="champion-usage" aria-label="英雄使用统计"><header><b>常用英雄</b><small role="status">${e(label)}</small>${button('champion-usage-refresh','','refresh','quiet icon-only small',`aria-label="${value.status==='partial'||value.status==='error'?'重试':'刷新'}英雄统计" ${value.status==='loading'?'disabled':''}`)}</header>${value.status==='loading'?`<progress max="${value.target}" value="${value.scanned}" aria-label="英雄统计读取进度"></progress>`:''}${rows.length?`<div class="usage-strip">${rows.slice(0,6).map(hero).join('')}</div>`:''}<details class="usage-details" data-disclosure-key="champion-usage"><summary>${rows.length?'全部 '+rows.length+' 位 · ':''}推荐偏好</summary><label class="familiarity-control"><span>${screenshot?'已收录':'已玩'}英雄权重 <output>${percent}%</output></span><input type="range" min="0" max="100" step="1" value="${percent}" id="familiarity-mass" aria-label="${screenshot?'已收录':'已玩'}英雄权重"><small>${screenshot?'未收录':'未玩'}英雄合计 ${100-percent}% · 无历史时均匀分配</small></label>${rows.length>6?`<div class="usage-all">${rows.map(hero).join('')}</div>`:''}${value.cached?`<p>${screenshot?'WeGame 当前赛季截图 · 仅含已展示英雄':'上次读取的英雄场次'}${date?' · '+e(date):''}。${value.status==='loading'?`正在更新 ${value.scanned} / ${value.target} 场；完整读取后替换。`:''}</p>`:''}${value.cacheError?`<p>${e(value.cacheError)}</p>`:''}${value.status==='partial'||value.status==='error'?`<p>${e(value.error||'稍后重试读取')}</p>`:''}<p>本地只保存场次汇总，按账号和大区隔离；不保存逐局战绩。 ${button('champion-usage-import','导入我的统计','','quiet small',!value.session?'disabled':'')}</p><p>只用于选人偏好，不是胜率；分路、禁选和锁定仍优先。</p></details></section>`;
}
