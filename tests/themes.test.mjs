import test from 'node:test';
import assert from 'node:assert/strict';
import {THEMES,DEFAULT_THEME,normalizeTheme,themeVariables} from '../src/core/themes.mjs';
import {normalizePresentation,changePresentation} from '../src/core/presentation.mjs';
import {themeDialog} from '../src/presentation-view.mjs';

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
