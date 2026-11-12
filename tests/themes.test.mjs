import test from 'node:test';
import assert from 'node:assert/strict';
import {THEMES,DEFAULT_THEME,normalizeTheme,themeVariables} from '../src/core/themes.mjs';
import {normalizePresentation,changePresentation} from '../src/core/presentation.mjs';
import {themeDialog,updateThemeDialog} from '../src/presentation-view.mjs';

const luminance=color=>{const rgb=color.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
const contrast=(a,b)=>{const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05);};
test('all eighteen selectable themes have readable text and bounded color values',()=>{
 assert.equal(THEMES.filter(p=>p.group==='client').length,9);assert.equal(THEMES.filter(p=>p.group==='other').length,9);
 assert.equal(new Set(THEMES.map(p=>p.id)).size,18);
 for(const theme of THEMES){
  assert.equal(normalizeTheme(theme.id),theme.id);
  assert.ok(Object.values(themeVariables(theme.id)).every(color=>/^#[0-9a-f]{6}$/i.test(color)),theme.id);
  assert.ok(contrast(theme.ink,theme.bg)>=7,theme.id+' text');
  assert.ok(contrast(theme.muted,theme.panel)>=4.5,theme.id+' secondary text');
  assert.ok(contrast(theme.action||theme.accent,theme.actionBg)>=4.5,theme.id+' action');
 }
});
test('theme switching preserves font and module choices; invalid saved colors migrate safely',()=>{
 const p=normalizePresentation({theme:'iris',textScale:1.25,guideModules:['skills','purchase']});
 for(const theme of THEMES)assert.deepEqual(changePresentation(p,{field:'theme',value:theme.id}),{...p,theme:theme.id});
 for(const value of ['__proto__','url(https://example.test)',{},null,12]){
  assert.equal(normalizeTheme(value),DEFAULT_THEME);assert.throws(()=>changePresentation(p,{field:'theme',value}));
 }
 assert.equal(normalizePresentation({theme:'removed-color'}).theme,DEFAULT_THEME);
 assert.equal(changePresentation(p,{field:'reset'}).theme,p.theme,'Resetting font/modules must preserve the separately selected palette');
});
test('picker exposes all themes with one selected choice and keeps earlier colors available',()=>{
 const html=themeDialog({theme:'daylight'});
 assert.equal((html.match(/data-field="theme"/g)||[]).length,18);
 assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
 assert.match(html,/<details class="theme-other" open>/);
 assert.ok(html.indexOf('经典海克斯')<html.indexOf('曜石'));
});

function themeFixture({empty=false}={}){
 const document={body:{tagName:'BODY'},activeElement:null};document.activeElement=document.body;
 const node=(tagName,dataset={})=>({tagName,dataset,isConnected:true,focus(){document.activeElement=this;}});
 let buttons=[],details=null,summary=null,content=null,html='';
 const root={contains:element=>!!element&&(buttons.includes(element)||element===summary),
  querySelector:selector=>selector===':focus'?root.contains(document.activeElement)?document.activeElement:null:selector==='.theme-other'?details:selector==='.theme-other > summary'?summary:selector==='.drawer-content'?content:null,
  querySelectorAll:selector=>selector==='button'?buttons:selector==='[data-value]'?buttons.filter(button=>button.dataset.value!==undefined):[],
  set innerHTML(value){
   if(root.contains(document.activeElement))document.activeElement=document.body;
   for(const button of buttons)button.isConnected=false;if(summary)summary.isConnected=false;html=value;
   buttons=[...value.matchAll(/<button\b[^>]*>/g)].map(([tag])=>node('BUTTON',Object.fromEntries([...tag.matchAll(/data-([a-z]+)="([^"]*)"/g)].map(([,key,value])=>[key,value]))));
   details={open:/<details class="theme-other" open>/.test(value)};summary=node('SUMMARY');content={scrollTop:0};
  },get innerHTML(){return html;}};
 if(!empty)root.innerHTML=themeDialog({theme:DEFAULT_THEME});
 return {document,root,get details(){return details;},get close(){return buttons.find(button=>button.dataset.action==='close');},get summary(){return summary;},external:node('INPUT'),option:id=>buttons.find(button=>button.dataset.value===id),
  update(value){const previous=globalThis.document;globalThis.document=document;try{updateThemeDialog(root,value);}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}}};
}
for(const open of [false,true])for(const target of ['close','summary'])test(`theme refresh keeps ${open?'expanded':'collapsed'} other choices and ${target} focus`,()=>{
 const f=themeFixture();f.details.open=open;f[target].focus();const before=f[target];f.update({theme:DEFAULT_THEME,textScale:1.25});
 assert.equal(before.isConnected,false);assert.equal(f.details.open,open);assert.equal(f.document.activeElement,f[target]);
});
test('theme refresh preserves an outside focus target while keeping the disclosure choice',()=>{
 const f=themeFixture();f.details.open=true;f.external.focus();f.update({theme:DEFAULT_THEME,textScale:1.1});
 assert.equal(f.document.activeElement,f.external);assert.equal(f.details.open,true);
});
test('choosing a theme retains its option focus while a first opening still expands a selected other theme',()=>{
 const other=THEMES.find(theme=>theme.group==='other').id,f=themeFixture();f.details.open=true;f.option(other).focus();f.update({theme:other});
 assert.equal(f.document.activeElement,f.option(other));assert.equal(f.details.open,true);
 const first=themeFixture({empty:true});first.external.focus();first.update({theme:other});assert.equal(first.details.open,true);assert.equal(first.document.activeElement,first.external);
});
