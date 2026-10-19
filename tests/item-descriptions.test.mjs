import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {enrichItemDescriptions} from '../services/item-descriptions.mjs';
import {gameTooltipView} from '../src/game-tooltip-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
test('current client item formulas retain base/bonus stat conditions and Rift values',()=>{
 const shield=data.items[3053].tooltip;assert.equal(shield.patch,data.patch);assert.match(shield.description,/50%基础攻击力/);assert.match(shield.description,/60%额外生命值/);assert.match(shield.description,/90秒/);assert.doesNotMatch(shield.description,/70%额外生命值|75秒|60秒/);
 assert.match(data.items[3153].tooltip.description,/近战 9% \/ 远程 6%/);
 assert.match(data.items[3085].tooltip.description,/2个额外敌人/);assert.match(data.items[3085].tooltip.description,/60%总攻击力/);
});
test('unsupported formulas are explicit and never fall back to unrelated obsolete item values',()=>{
 const items={123:{name:'测试装备'}},bin={'Items/123':{itemID:123,mItemDataClient:{mDescription:'description'},mDataValues:[{mName:'OldShield',mValue:99}],mItemCalculations:{Shield:{__type:'UnsupportedCalculation'}}}},strings={entries:{description:'护盾 @Shield@ {{MissingKey}}'}};
 const result=enrichItemDescriptions(items,bin,strings,'16.20')[123];assert.equal(result.tooltip.status,'partial');assert.match(result.tooltip.description,/数值未解析/);assert.doesNotMatch(result.tooltip.description,/99|@|\{\{/);
 assert.equal(enrichItemDescriptions(items,{'Items/123':{...bin['Items/123'],itemID:999}},strings,'16.20')[123].tooltip,undefined);
});
test('rich hover cards escape source text, gate old formulas and show sourced old/new patch numbers',()=>{
 const game={...data,patchNotes:{patches:[{patch:data.patch,officialPatch:'26.20',items:[{item:data.items[3085].name,direction:'nerf',changes:[{field:'弩箭伤害',before:'65%攻击力',after:'60%攻击力'}]}]}]}};
 const html=gameTooltipView(game,'item',3085);assert.match(html,/近期峡谷改动/);assert.match(html,/削弱/);assert.match(html,/<strong>65%<\/strong>/);assert.match(html,/<strong>60%<\/strong>/);assert.match(gameTooltipView(game,'item',3053,{mode:'hex'}),/海克斯模式调整未核对/);
 const old={...game,items:{...game.items,3053:{...game.items[3053],description:'& <img src=x onerror=evil> " 400',tooltip:{patch:'16.19',description:'旧公式'}}}};
 const safe=gameTooltipView(old,'item',3053);assert.doesNotMatch(safe,/旧公式|onerror=|<img src=x/);assert.match(safe,/&amp;/);assert.match(safe,/<strong>400<\/strong>/);
 assert.equal(gameTooltipView(game,'item',999999),'');
 assert.match(gameTooltipView(game,'rune',8005),/强攻/);assert.match(gameTooltipView(game,'spell','SummonerFlash'),/冷却/);
});
test('partial client formulas retain known same-patch official basic stats',()=>{
 for(const [id,number,label] of [[1004,'50%','基础法力回复'],[1027,'300','法力']]){const html=gameTooltipView(data,'item',id);assert.match(html,/同版本官方简介/);assert(html.includes('<strong>'+number+'</strong>'+label));assert.match(html,/数值未解析/);}
});
