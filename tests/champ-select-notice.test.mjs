import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {defaultState,saveState,readState,validateState} from '../services/storage.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {sendChampSelectAnnouncement} from '../services/lcu-chat.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));
const source=await fs.readFile('src/skill.mjs','utf8');
const renderSource=source.slice(source.indexOf('function render(value)'),source.indexOf('root.addEventListener'));
function widget(model){const root={innerHTML:''},context=vm.createContext({root,windowResizeGrip:'',applyPresentation(){},e:String});vm.runInContext(renderSource,context);context.render({model});return root.innerHTML;}

test('chat notice defaults on and explicit on/off survives real disk saves and re-reads',async()=>{
 assert.equal(validateState(defaultState()).preferences.chatNotice,true);
 const missing=defaultState();delete missing.preferences.chatNotice;assert.equal(validateState(missing).preferences.chatNotice,true);
 const optedOut=defaultState();optedOut.preferences.chatNotice=false;assert.equal(validateState(optedOut).preferences.chatNotice,false);
 const invalid=defaultState();invalid.preferences.chatNotice='true';assert.equal(validateState(invalid).preferences.chatNotice,false);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-chat-consent-')),state=defaultState();
 for(const enabled of [true,false,true,false]){state.preferences.chatNotice=enabled;await saveState(root,state);assert.equal((await readState(root)).preferences.chatNotice,enabled);}
});

test('actual skill-widget render stops opening highlight after first point and for unknown/special skills',()=>{
 const selection=selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'}),live={available:true,champion:'Ashe',mode:'rift',at:Date.now(),level:1,skills:{Q:0,W:0,E:0,R:0},inventory:[],gold:500};
 const opening=createGuideModel(data,selection,live);assert.equal(opening.nextSkill,'W');assert.match(widget(opening),/1级首选 \[ W \]/);
 const spent=createGuideModel(data,selection,{...live,skills:{Q:0,W:1,E:0,R:0}});assert.equal(spent.nextSkill,null);assert.doesNotMatch(widget(spent),/1级首点推荐|is-level1/);
 const unknown=createGuideModel(data,selection,{...live,skills:{}});assert.equal(unknown.nextSkill,null);assert.doesNotMatch(widget(unknown),/1级首点推荐|is-level1/);
 const special=createGuideModel(data,selectGuide(null,{id:'Aphelios',role:'bottom',mode:'rift'}),{...live,champion:'Aphelios'});assert.doesNotMatch(widget(special),/1级首点推荐|is-level1/);
});

function fixture(change=()=>{}){
 const value={text:'【开黑搭子】已配置 艾希',context:{phase:'ChampSelect',gameId:'123',cellId:1},championId:22,pageId:7,page:{primaryStyleId:8000,subStyleId:8100,selectedPerkIds:[8005,9111,9104,8014,8139,8135,5005,5008,5002]}};
 const state={gameId:123,cellId:1,championId:22,enabled:true,page:structuredClone(value.page),posts:[],rooms:[{id:'own@champ-select',type:'championSelect'}]};
 const request=async(_auth,route,method,body)=>{
  await change(route,state);
  if(route==='/lol-gameflow/v1/gameflow-phase')return 'ChampSelect';
  if(route==='/lol-gameflow/v1/session')return {gameData:{gameId:state.gameId}};
  if(route==='/lol-champ-select/v1/session')return {gameId:state.gameId,localPlayerCellId:state.cellId,myTeam:[{cellId:state.cellId,championId:state.championId,championPickIntent:0}]};
  if(route==='/lol-perks/v1/pages')return [{id:7,current:true,...state.page}];
  if(route==='/lol-chat/v1/conversations')return state.rooms;
  if(method==='POST'){state.posts.push({route,body});return {};}
  throw Error('Unexpected mock route '+route);
 };
 return {value,state,deps:{discover:async()=>({port:23456,password:'isolated-only'}),request,allowed:async()=>state.enabled}};
}
test('chat dispatch cancels a changed game during conversation lookup',async()=>{const f=fixture((route,s)=>{if(route==='/lol-chat/v1/conversations')s.gameId=456;});assert.equal((await sendChampSelectAnnouncement(f.value,f.deps)).sent,false);assert.equal(f.state.posts.length,0);});
test('chat dispatch cancels a changed own champion or player cell during conversation lookup',async()=>{for(const mutate of [s=>s.championId=99,s=>s.cellId=2]){const f=fixture((route,s)=>{if(route==='/lol-chat/v1/conversations')mutate(s);});assert.equal((await sendChampSelectAnnouncement(f.value,f.deps)).sent,false);assert.equal(f.state.posts.length,0);}});
test('chat dispatch cancels replaced rune configuration and disabled consent',async()=>{
 for(const mutate of [s=>s.page.selectedPerkIds[0]=8008,s=>s.enabled=false]){const f=fixture((route,s)=>{if(route==='/lol-chat/v1/conversations')mutate(s);});assert.equal((await sendChampSelectAnnouncement(f.value,f.deps)).sent,false);assert.equal(f.state.posts.length,0);}
});
test('chat dispatch requires original context and exactly one current selection room',async()=>{
 const missing=fixture();delete missing.value.context;assert.equal((await sendChampSelectAnnouncement(missing.value,missing.deps)).sent,false);assert.equal(missing.state.posts.length,0);
 const ambiguous=fixture();ambiguous.state.rooms.push({id:'other@champ-select',type:'championSelect'});assert.equal((await sendChampSelectAnnouncement(ambiguous.value,ambiguous.deps)).sent,false);assert.equal(ambiguous.state.posts.length,0);
});
test('chat dispatch posts the checked configuration once in the original game',async()=>{const f=fixture();assert.equal((await sendChampSelectAnnouncement(f.value,f.deps)).sent,true);assert.equal(f.state.posts.length,1);assert.equal(f.state.posts[0].body.body,f.value.text);});
