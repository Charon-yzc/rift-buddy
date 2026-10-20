import {escape as e,portrait,button} from './ui.mjs';
import {championUsageWeights,familiarMass} from './core/champion-usage.mjs';
// A cached distribution is older, so the age is stated in plain words.
const formatAge=ms=>{if(!Number.isFinite(ms)||ms<0)return '';const hours=Math.floor(ms/3600000);if(hours<1)return `${Math.max(1,Math.floor(ms/60000))} 分钟前`;if(hours<24)return `${hours} 小时前`;const days=Math.floor(hours/24);return days<30?`${days} 天前`:'超过 30 天前';};
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
 for(const child of [...details.children])if(child.matches('.usage-all,p'))child.remove();
 for(const child of [...fresh.children])if(child.matches('.usage-all,p'))details.append(child);
 return true;
}
export function championUsageView(value,data,{mass=.85}={}){
 if(!value||value.status==='offline')return '';
 const usage=value.usage||{sampled:0,counts:{}},rows=Object.entries(usage.counts).map(([id,count])=>({hero:data.champions.find(hero=>hero.id===id),count})).filter(row=>row.hero).sort((a,b)=>b.count-a.count||a.hero.id.localeCompare(b.hero.id));
 const weights=championUsageWeights(data.champions,usage,mass),percent=Math.round(familiarMass(mass)*100);
 const mastery=value.basis==='mastery'||usage.basis==='mastery'||value.status==='estimated';
 const cached=value.status==='cached'||value.origin==='cache';
 const stamp=value.at?new Date(value.at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
 const age=Number.isFinite(value.ageMs)?formatAge(value.ageMs):'';
 const label=value.status==='loading'?`正在读取 ${value.scanned} / ${value.target} 场`:
  value.status==='error'?'统计暂不可用':
  cached?`本地缓存${age?' · '+age:''}${stamp?' · '+stamp:''}`:
  mastery?'按熟练度估算':value.scanned?`近 ${value.scanned} 场${usage.sampled!==value.scanned?' · 可用 '+usage.sampled+' 场':''}${value.status==='partial'?' · 未读完':''}`:'暂无历史场次';
 const note=mastery?'熟练度不是对局场次，只是熟悉度参考；恢复读取后会自动换成真实场次。':cached?'客户端战绩接口不可用时使用本机缓存的匿名英雄计数。':'';
 const hero=row=>`<div class="usage-hero" title="${e(row.hero.name)} · ${mastery?'熟练度权重':'场次'} ${mastery?row.count+'%':row.count+' 场'} · 偏好权重 ${(weights[row.hero.id]*100).toFixed(2)}%（分路限制后重新分配）">${portrait(row.hero)}<span>${e(row.hero.name)}</span><small>${mastery?row.count+'%':row.count+' 场'}</small></div>`;
 return `<section class="champion-usage" aria-label="最近英雄使用统计"><header><b>常用英雄</b><small role="status">${e(label)}</small>${button('champion-usage-refresh','','refresh','quiet icon-only small',`aria-label="${value.status==='partial'||value.status==='error'?'重试':'刷新'}英雄统计" ${value.status==='loading'?'disabled':''}`)}</header>${value.status==='loading'?`<progress max="${value.target}" value="${value.scanned}" aria-label="英雄统计读取进度"></progress>`:''}${rows.length?`<div class="usage-strip">${rows.slice(0,6).map(hero).join('')}</div>`:''}<details class="usage-details" data-disclosure-key="champion-usage"><summary>${rows.length?'全部 '+rows.length+' 位 · ':''}推荐偏好</summary><label class="familiarity-control"><span>已玩英雄权重 <output>${percent}%</output></span><input type="range" min="0" max="100" step="1" value="${percent}" id="familiarity-mass" aria-label="已玩英雄权重"><small>未玩英雄合计 ${100-percent}% · 无历史时均匀分配</small></label>${rows.length>6?`<div class="usage-all">${rows.map(hero).join('')}</div>`:''}${value.status==='partial'||value.status==='error'?`<p>${e(value.error||'稍后重试读取')}</p>`:''}${note?`<p>${e(note)}</p>`:''}<p>只用于选人偏好，不是胜率；分路、禁选和锁定仍优先。</p></details></section>`;
}
