import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSlots,findTrio,currentCombo,createSlots} from '../src/core/recommend.mjs';
import {TRIOS,DUOS} from '../src/core/rules.mjs';
import {validateState} from '../services/storage.mjs';
import {mergePersonal,BUNDLED_CATALOG} from '../src/core/catalog.mjs';
import {buildAugmentDescriptions} from '../services/augments.mjs';
import {itemRows} from '../services/source-parser.mjs';

test('null draft entries fail with a business error, not a TypeError',()=>{
 assert.throws(()=>validateSlots([null,null,null,null,null],[]),/阵容位置格式不正确/);
 assert.throws(()=>validateSlots({length:5},[]),/阵容位置格式不正确/);
 const bad={schema:1,favorites:[],excluded:[],preferences:{},draft:{slots:[null,null,null,null,null],style:'fun',scope:'context'},ownedPageId:null,guide:null};
 assert.throws(()=>validateState(bad),/阵容位置格式不正确/);
});

test('non-numeric augment values fall back to dynamic text, not undefined',()=>{
 const bin={augment:{__type:'AugmentData',AugmentNameId:'Example',RootSpell:'spell',DescriptionTra:'description'},
  spell:{mSpell:{mSpellCalculations:{},DataValues:[{name:'Amount',values:['abc']}]}}};
 const [row]=buildAugmentDescriptions([{key:'Example'}],bin,{description:'数值 @Amount@ 结束'});
 assert.ok(!row.description.includes('undefined'));
 assert.match(row.description,/动态数值/);
 assert.equal(row.descriptionStatus,'partial');
});

test('malformed personal trios fail validation, not key computation',()=>{
 const clone=structuredClone(BUNDLED_CATALOG);
 assert.throws(()=>mergePersonal(clone,{duos:[],trios:[{id:'local-bad',members:'oops'}],loadouts:[],runes:{}}),/组合库/);
});

test('deeply nested parser rows terminate instead of overflowing the stack',()=>{
 let deep={metaType:'item',metaId:3031};
 for(let i=0;i<500;i++)deep={child:deep};
 const rows=itemRows([['$','tr','core',deep]],new Map(),'core');
 assert.ok(Array.isArray(rows));
});

test('indexed trio/duo lookup matches brute-force scan',()=>{
 const bruteDuo=slots=>{const carry=slots.find(s=>s.role==='bottom')?.champion,support=slots.find(s=>s.role==='support')?.champion;return DUOS.find(d=>d.carry===carry&&d.support===support);};
 const bruteTrio=slots=>TRIOS.find(t=>t.members.every(m=>slots.some(s=>s.role===m.role&&s.champion===m.champion)));
 const scenarios=[];
 const full=createSlots();
 for(const [role,id] of [['top','Malphite'],['jungle','JarvanIV'],['mid','Orianna'],['bottom','Varus'],['support','Ashe']])Object.assign(full.find(s=>s.role===role),{champion:id,locked:true});
 scenarios.push(full);
 const partial=createSlots();
 for(const [role,id] of [['top','Garen'],['bottom','Yasuo'],['support','Alistar']])Object.assign(partial.find(s=>s.role===role),{champion:id,locked:true});
 scenarios.push(partial);
 scenarios.push(createSlots());
 for(const slots of scenarios){
  assert.equal(findTrio(slots)?.id||null,bruteTrio(slots)?.id||null);
  assert.equal(currentCombo(slots)?.id||null,(()=>{
   const matches=[...TRIOS.filter(t=>t.members.every(m=>slots.some(s=>s.role===m.role&&s.champion===m.champion))),bruteDuo(slots)].filter(Boolean);
   return matches[0]?.id||null;
  })());
 }
});