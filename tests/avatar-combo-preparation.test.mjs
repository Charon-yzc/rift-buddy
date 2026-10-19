import {localPickLocked} from '../src/core/draft-intents.mjs';
import {prepareHeroWithSource} from '../src/core/hero-source-preparation.mjs';
import {heroClickSelection} from '../src/core/configuration-choices.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {getBuild} from '../src/core/builds.mjs';
import {selectedBuildFields} from '../src/core/build-favorites.mjs';
import {createSlots,currentCombo,mergeClientSession} from '../src/core/recommend.mjs';
import {ROLES} from '../src/core/rules.mjs';
import {currentPlayerSelection} from '../src/core/guide.mjs';
import {moveChampion,assignClientChampion,clearManualPlayerPosition,unassignedPublicPicks} from '../src/core/draft.mjs';
import {creativeComboContext} from '../src/core/creative-plan.mjs';
import {createPreparationStore,recallPreparation} from '../src/core/preparation.mjs';
import {companionHeroAction} from '../src/core/companion-action.mjs';
import {localConfigurationPreview} from '../src/core/companion-plan.mjs';
import {movePartyMark} from '../src/core/party-range.mjs';
import {BUNDLED_CATALOG,configureCatalog} from '../src/core/catalog.mjs';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('async function prepareHeroClick('),source.indexOf('\nfunction refreshClickedResult'))+'\n'+source.slice(source.indexOf('function rememberedPreparation('),source.indexOf('\nfunction editBuildSummoners'))+'\n'+source.slice(source.indexOf('function setCompanionRole('),source.indexOf('\nfunction preservePlayerPosition'));
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));data.builds={};
// Exercise a current reviewed lineup without promoting the real legacy entry.
const reviewed=structuredClone(BUNDLED_CATALOG);reviewed.duos.find(row=>row.id==='rengar-ivern').patch=data.patch;configureCatalog(reviewed);after(()=>configureCatalog(BUNDLED_CATALOG));
const champ=id=>data.champions.find(c=>c.id===id),base={id:'Rengar',role:'bottom',mode:'rift'};
const selected=build=>({...base,conditions:[],coreIndex:0,...selectedBuildFields({...base,build},{preserveUnavailable:true})});
const solo=selected(getBuild(champ(base.id),base.role,data,base));
const combo=selected(getBuild(champ(base.id),base.role,data,{...base,comboId:'rengar-ivern'}));

async function click({partner='Ivern',docked=false,connected=false,moving=false,explicit={},savedCombo={}}={}){
 const store=createPreparationStore();store.remember({...combo,...savedCombo});store.remember(solo);const storedSolo=store.recall(base);
 const slots=createSlots().map(s=>({...s,champion:s.role===(moving?'mid':'bottom')?'Rengar':s.role==='support'?partner:null,...(moving&&s.role==='mid'?{clientCellId:1,manualPosition:true}:{})}));
 const client=connected?{connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:moving?champ('Rengar').key:0,assignedPosition:moving?'MIDDLE':'',championPickIntent:0}]}}:{connected:false};
 let rendered,writes=0,context;
 const render=()=>{const value=context.clickedHeroPreparation?.selection||(docked?context.companionPreview:context.buildView),build=getBuild(champ(value.id),value.role,data,value);value.build=build;rendered=selected(build);store.remember(rendered);};
 context=vm.createContext({prepareHeroWithSource,api:{},clickedHeroPreparation:null,getBuild,localPickLocked,clientPreparing:false,runeApplying:false,itemSetPending:null,heroClickSelection,data,slots,client,saved:{draft:{}},soloRole:'',unassigned:[],pendingIntentPreparation:null,activeCreativePlan:null,guideSelection:solo,preparations:store,detailResult:null,buildReturn:null,picker:null,comboView:null,buildView:null,windowLayout:{docked},companionPreview:null,companionTab:'recommend',companionScroll:new Map(),lastTaskSelection:null,draftComparing:true,positionClaim:null,champ,currentCombo,creativeComboContext,recallPreparation,localConfigurationPreview,ROLES,currentPlayerSelection,moveChampion,assignClientChampion,clearManualPlayerPosition,unassignedPublicPicks,mergeClientSession,movePartyMark,taskOwnRole:()=>context.soloRole,pregamePhase:phase=>['None','Lobby','Matchmaking','ReadyCheck'].includes(phase),memberHeroAction:id=>companionHeroAction(client,champ(id)),invalidate(){},renderBuild:render,render,closeOverlay(){},maybeRefreshBuild(){},useClientPreparation:async()=>{writes++;return true;}});
 vm.runInContext(functions,context);
 await context.prepareHeroClick({...base,...explicit});
 return {rendered,store,storedSolo,writes,context};
}

test('avatar clicks resolve the lineup before recalling a saved solo default in main and sidebar',async()=>{
 assert.equal(combo.loadoutId,'rengar-bush');assert.equal(solo.loadoutId,'default');
 for(const docked of [false,true])for(const connected of [false,true]){
  const result=await click({docked,connected});
  assert.deepEqual(result.rendered,combo);
  assert.deepEqual(result.store.recall(base),result.storedSolo,'A combination must not overwrite the saved solo choice');
  assert.equal(result.writes,connected?1:0,'Only a connected draft click should request preparation');
 }
});

test('moving the actual local hero into its reference lane resolves the newly formed combination',async()=>{
 for(const docked of [false,true]){
  const result=await click({docked,connected:true,moving:true});
  assert.equal(result.context.slots.find(s=>s.role==='bottom').champion,'Rengar');
  assert.equal(result.context.slots.find(s=>s.role==='mid').champion,null);
  assert.deepEqual(result.rendered,combo);assert.equal(result.writes,1);
 }
});

test('changing the partner restores the solo configuration without leaking a former combination',async()=>{
 for(const docked of [false,true])assert.deepEqual((await click({partner:'Nami',docked})).rendered,solo);
});

test('explicit configuration choices override the inferred combination defaults',async()=>{
 const explicit={comboId:'rengar-ivern',loadoutId:solo.loadoutId,runeId:solo.runeId};
 const expected=selected(getBuild(champ(base.id),base.role,data,{...base,...explicit}));
 for(const docked of [false,true])assert.deepEqual((await click({docked,explicit})).rendered,expected);
});

test('a repeated active-lineup avatar retains that lineup whole choice without borrowing another lineup or solo preferences',async()=>{
 const savedCombo={summonerIds:[...getBuild(champ(base.id),base.role,data,combo).summoners].reverse()};
 for(const docked of [false,true]){
  const same=await click({docked,savedCombo});assert.deepEqual(same.rendered.summonerIds,savedCombo.summonerIds);
  const different=await click({docked,savedCombo,partner:'Nami'});assert.deepEqual(different.rendered,solo);
 }
});
