import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHistoryController} from '../src/match-history-controller.mjs';
import {matchHistoryView,matchHistorySearchView} from '../src/match-history-view.mjs';
import {privateHistoryState} from '../src/match-history-tools-view.mjs';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const page=(name='Mock#TEST',start=0,hasMore=true)=>({handle:name,player:{name,puuid:'mock-public-'+name},games:[],start,count:20,hasMore,servers:[]});
function fixture({details=false}={}){
 const focusListeners=new Set(),requests=[],detailRequests=[],calls=[],detailTabList={},data={champions:[],items:{},runes:[],spells:{},augments:[]},game={id:1,self:{champion:22,result:'win'},participants:[],teams:[],queue:420};let controls=[],history,holdPages=false,searchRequest,layer=null,searchReads=0;
 const body={tagName:'BODY'},document={body,activeElement:body,
  addEventListener(name,fn){if(name==='focusin')focusListeners.add(fn);},removeEventListener(name,fn){if(name==='focusin')focusListeners.delete(fn);},
  querySelectorAll(selector){
   if(selector==='#history-query')return controls.filter(node=>node.id==='history-query');
   if(selector==='[data-history-page="number"]')return controls.filter(node=>node.id==='page-number');
   if(selector==='.history-pagination button')return controls.filter(node=>node.pagination);
   if(selector.startsWith('#history-tab-'))return controls.filter(node=>node.id===selector.slice(1));
   if(selector.includes('.history-expand'))return controls.filter(node=>node.expand&&node.dataset.id===selector.match(/data-history-match="([^"]+)"/)?.[1]);
   const action=selector.match(/data-action="([^"]+)"/)?.[1],id=selector.match(/data-id="([^"]+)"/)?.[1];
   return action?controls.filter(node=>node.dataset.action===action&&(id===undefined||node.dataset.id===id)):[];
  },querySelector(selector){return this.querySelectorAll(selector)[0]||null;},getElementById(id){return controls.find(node=>node.id===id)||null;}
 };
 const node=(action,id,extra={})=>({tagName:'BUTTON',dataset:{action,...(id===undefined?{}:{id:String(id)})},key:action+':'+id,isConnected:true,disabled:false,checkVisibility:()=>true,
  focus(options){if(this.disabled)throw Error('A disabled control cannot receive focus');if(options)assert.equal(options.preventScroll,true);document.activeElement=this;for(const listener of [...focusListeners])listener({target:this});},...extra});
 function render(){
  const focused=document.activeElement;for(const control of controls)control.isConnected=false;
  if(controls.includes(focused))document.activeElement=body;
  controls=[node('query',undefined,{id:'history-query',tagName:'INPUT',value:history.state.query}),node('page-number',undefined,{id:'page-number',value:'2'})];
  for(const tab of history.state.tabs)controls.push(node('history-tab',tab.id),node('history-close',tab.id));
  const tab=history.current();if(tab?.page)for(const action of ['history-prev','history-next','history-first','history-page-go'])controls.push(node(action,undefined,{pagination:true,disabled:tab.loading||action==='history-next'&&!tab.page.hasMore||action==='history-prev'&&tab.page.start===0}));
  if(details&&tab?.page)for(const game of tab.page.games)for(const section of ['toggle',...(tab.details[game.id]?.open?['summary','events']:[])])controls.push(node('history-detail',game.id,{dataset:{action:'history-detail',id:String(game.id),section},key:'detail:'+game.id+':'+section,expand:section==='toggle',id:section==='toggle'?'':`history-tab-${game.id}-${section}`,matches:selector=>section!=='toggle'&&selector==='.history-detail-tabs [role="tab"]',closest:selector=>section!=='toggle'&&selector==='.history-detail-tabs'?detailTabList:null}));
  // The native focus restorer preserves matching live controls, but skips disabled ones.
  const restored=controls.find(control=>control.key===focused.key);if(restored&&!restored.disabled){if(focused.id==='history-query')restored.value=focused.value;restored.focus({preventScroll:true});}
 }
 const overlay={get firstElementChild(){return layer;},set firstElementChild(value){layer=value;},get innerHTML(){return layer?.html||'';},set innerHTML(html){layer=html?{kind:'search',html}:null;}};
 const context=vm.createContext({document,overlay,data,route:'history',createHistoryController,privateHistoryState,matchHistorySearchView,analyzeAkariHistory:()=>null,render,updateHistoryCards:()=>false,refreshHistoryAnalysis(){},toast(){},nextTick:()=>Promise.resolve(),preserveOverlay:()=>()=>{},closeOverlay(){history.cancelSearch();overlay.innerHTML='';},
  historyRequest:async(op,options)=>{calls.push({op,...structuredClone(options)});if(op==='search'){searchReads++;searchRequest=Promise.withResolvers();return searchRequest.promise;}if(op==='profile')return {};if(op==='detail'){const gate=Promise.withResolvers();detailRequests.push({options,gate});return gate.promise;}if(op==='timeline')return {timeline:{frames:[],events:[]}};if(holdPages){const gate=Promise.withResolvers();requests.push({options,gate});return gate.promise;}return {...page(options.query),...(details?{games:[game]}:{})};}});
 const originalBinding=source.indexOf('const history=createHistoryController('),helpers=source.indexOf('let historySearchResults=');
 vm.runInContext(source.slice(helpers>=0?helpers:originalBinding,source.indexOf('function acceptChampionUsage(',originalBinding)),context);history=vm.runInContext('history',context);
 const actionStart=source.indexOf('function historyActionFocus('),originalAction=source.indexOf('async function historyAction(');
 vm.runInContext(source.slice(actionStart>=0?actionStart:originalAction,source.indexOf('let stateRecovery=',originalAction)),context);
 return {document,overlay,history,requests,detailRequests,game,calls,context,body,focusListeners,node,render,view:()=>matchHistoryView(privateHistoryState(history.state),data),searchReads:()=>searchReads,hold(){holdPages=true;},control(action,id,section){return controls.find(node=>node.dataset.action===action&&(id===undefined||node.dataset.id===String(id))&&(section===undefined||node.dataset.section===section));},action(action,el){return context.historyAction(action,el);},search(query='Mock'){history.state.query=query;const input=document.getElementById('history-query');if(input)input.value=query;const pending=context.submitHistorySearch?context.submitHistorySearch():history.search(),gate=searchRequest;return {pending,finish(players=[{name:'Mock#TEST',puuid:'mock-public-search',server:'MOCK'}]){gate.resolve({players});return pending;}};}};
}

test('a late name search retains its results without replacing a newer editor or reopening after it closes',async()=>{
 const f=fixture(),search=f.search(),editor={kind:'feedback',draft:'unsent mock draft'};f.overlay.firstElementChild=editor;
 await search.finish();assert.equal(f.overlay.firstElementChild,editor);assert.equal(editor.draft,'unsent mock draft');assert.equal(f.history.state.searchResults.length,1);
 f.overlay.firstElementChild=null;f.history.select(null);assert.equal(f.overlay.firstElementChild,null,'An unrelated repaint cannot reopen the suppressed result');
 assert.match(f.view(),/data-action="history-search-results"/);const reads=f.searchReads();await f.action('history-search-results',f.node('history-search-results'));assert.equal(f.overlay.firstElementChild.kind,'search');assert.equal(f.searchReads(),reads);
 f.overlay.firstElementChild=null;
 await f.search('New mock').finish();assert.equal(f.overlay.firstElementChild.kind,'search');
});

for(const updateState of [false,true])test(`a late search never covers a newer unsubmitted input (${updateState?'input event':'restored draft'})`,async()=>{
 const f=fixture(),search=f.search('Old'),input=f.document.getElementById('history-query');input.focus();input.value='New unsubmitted';if(updateState)f.history.state.query=input.value;
 await search.finish([{name:'Old result#TEST',puuid:'mock-public-old',server:'MOCK'}]);
 assert.equal(f.document.activeElement.id,'history-query');assert.equal(f.document.activeElement.value,'New unsubmitted');assert.equal(f.overlay.firstElementChild,null);
 assert.equal(f.history.state.searchResults.length,1);assert.match(f.view(),/data-action="history-search-results"/);
});

test('explicit cached results use current privacy masking and preserve real selection identifiers without another request',async()=>{
 const f=fixture(),search=f.search();f.overlay.firstElementChild={kind:'feedback'};await search.finish();f.overlay.firstElementChild=null;f.history.state.streamer=true;
 await f.action('history-search-results',f.node('history-search-results'));assert.doesNotMatch(f.overlay.innerHTML,/Mock#TEST/);assert.match(f.overlay.innerHTML,/data-puuid="mock-public-search" data-server="MOCK"/);
 assert.equal(f.history.state.searchResults[0].name,'Mock#TEST');assert.equal(f.searchReads(),1);
 await f.action('history-player',{dataset:{puuid:'mock-public-search',server:'MOCK'}});const selected=f.calls.find(call=>call.op==='page');assert.equal(selected.puuid,'mock-public-search');assert.equal(selected.server,'MOCK');assert.equal(f.searchReads(),1);
});

test('a newly submitted query replaces the old intent and still opens its own normal results',async()=>{
 const f=fixture(),old=f.search('Old'),input=f.document.getElementById('history-query');input.focus();input.value='New';const latest=f.search('New');
 await old.finish([{name:'Old#TEST',puuid:'mock-old',server:'MOCK'}]);assert.equal(f.overlay.firstElementChild,null);
 await latest.finish([{name:'New#TEST',puuid:'mock-new',server:'MOCK'}]);assert.match(f.overlay.innerHTML,/New#TEST/);assert.doesNotMatch(f.overlay.innerHTML,/Old#TEST/);assert.equal(f.searchReads(),2);
});

test('results arriving off-page are available on return only through the explicit cached-result action',async()=>{
 const f=fixture(),search=f.search();f.context.route='favorites';await search.finish();f.context.route='history';f.render();f.history.select(null);
 assert.equal(f.overlay.firstElementChild,null);assert.match(f.view(),/data-action="history-search-results"/);
 await f.action('history-search-results',f.node('history-search-results'));assert.equal(f.overlay.firstElementChild.kind,'search');assert.equal(f.searchReads(),1);
});

test('the owned search result keeps its controls across background paints and privacy updates cannot replace another editor',async()=>{
 const f=fixture();await f.search().finish();const owned=f.overlay.firstElementChild;f.history.select(null);assert.equal(f.overlay.firstElementChild,owned);
 f.history.state.streamer=true;f.history.select(null);assert.notEqual(f.overlay.firstElementChild,owned);assert.doesNotMatch(f.overlay.innerHTML,/Mock#TEST/);assert.equal(f.history.state.searchResults[0].name,'Mock#TEST');
 const editor={kind:'editor',draft:'keep'};f.overlay.firstElementChild=editor;f.history.state.streamer=false;f.history.select(null);assert.equal(f.overlay.firstElementChild,editor);
});

test('keyboard paging returns to a usable control when the requested next page is the last page',async()=>{
 const f=fixture(),tab=await f.history.open({query:'One#TEST'});f.hold();const button=f.control('history-next');button.focus();const pending=f.action('history-next',button);
 assert.equal(f.document.activeElement,f.body);f.requests[0].gate.resolve(page('One#TEST',20,false));await pending;
 assert.equal(tab.page.start,20);assert.equal(f.document.activeElement.dataset.action,'history-prev');assert.equal(f.document.activeElement.disabled,false);assert.equal(f.focusListeners.size,0);
});

test('failed keyboard paging releases busy state and restores the still-usable paging control',async()=>{
 const f=fixture(),tab=await f.history.open();f.hold();const button=f.control('history-next');button.focus();const pending=f.action('history-next',button);
 f.requests[0].gate.reject(Error('mock offline'));await pending;assert.equal(tab.loading,false);assert.match(tab.error,/mock offline/);assert.equal(f.document.activeElement.dataset.action,'history-next');
});

for(const diversion of ['input','editor','tab','route','newer-page'])test(`a pending page cannot steal focus after ${diversion}`,async()=>{
 const f=fixture(),tab=await f.history.open({query:'One#TEST'}),other=await f.history.open({query:'Two#TEST'});f.history.select(tab.id);f.hold();const button=f.control('history-next');button.focus();const pending=f.action('history-next',button);
 let newer;
 if(diversion==='input'){f.document.querySelector('#history-query').focus();f.document.activeElement=f.body;}
 if(diversion==='editor')f.overlay.firstElementChild={kind:'feedback'};
 if(diversion==='tab')f.history.select(other.id);
 if(diversion==='route')f.context.route='favorites';
 if(diversion==='newer-page')newer=f.history.load(tab,{start:40});
 f.requests[0].gate.resolve(page('One#TEST',20));await pending;
 if(newer){f.requests[1].gate.resolve(page('One#TEST',40));await newer;assert.equal(tab.page.start,40);}
 assert.equal(f.document.activeElement,f.body);assert.equal(f.focusListeners.size,0);
});

test('closing a focused player tab selects the remaining tab, then the last close returns to search',async()=>{
 const f=fixture(),first=await f.history.open({query:'One#TEST'}),second=await f.history.open({query:'Two#TEST'});f.history.select(first.id);
 let button=f.control('history-close',first.id);button.focus();await f.action('history-close',button);assert.equal(f.document.activeElement,f.control('history-tab',second.id));
 button=f.control('history-close',second.id);button.focus();await f.action('history-close',button);assert.equal(f.document.activeElement.id,'history-query');assert.equal(f.focusListeners.size,0);
});

test('closing a tab does not override an input focused before the next paint settles',async()=>{
 const f=fixture(),tab=await f.history.open();const button=f.control('history-close',tab.id);button.focus();const pending=f.action('history-close',button),input=f.document.querySelector('#history-query');input.focus();await pending;assert.equal(f.document.activeElement,input);
});

for(const diversion of ['search','feedback','closed-card','route'])test(`late match detail does not take focus from ${diversion}`,async()=>{
 const f=fixture({details:true}),tab=await f.history.open(),button=f.control('history-detail',1,'toggle');button.focus();const pending=f.action('history-detail',button);
 if(diversion==='closed-card'){const close=f.control('history-detail',1,'toggle');close.focus();await f.action('history-detail',close);assert.equal(tab.details[1].open,false);}
 if(diversion==='feedback'){f.overlay.firstElementChild={kind:'feedback'};const editor=f.node('feedback',undefined,{id:'feedback-text',value:'正在填写的反馈'});editor.focus();}
 else{const input=f.document.querySelector('#history-query');input.focus();input.value='尚未提交的新搜索';if(diversion==='route')f.context.route='favorites';}
 const expected={id:f.document.activeElement.id,value:f.document.activeElement.value};f.detailRequests[0].gate.resolve({game:f.game});await pending;
 assert.equal(f.document.activeElement.id,expected.id);assert.equal(f.document.activeElement.value,expected.value);assert.equal(tab.details[1].open,diversion!=='closed-card');assert.equal(f.focusListeners.size,0);
});

test('normal keyboard match detail keeps its usable expand control',async()=>{
 const f=fixture({details:true});await f.history.open();const button=f.control('history-detail',1,'toggle');button.focus();const pending=f.action('history-detail',button);f.detailRequests[0].gate.resolve({game:f.game});await pending;
 assert.equal(f.document.activeElement,f.control('history-detail',1,'toggle'));assert.equal(f.history.current().details[1].complete,true);assert.equal(f.focusListeners.size,0);
});

test('keyboard detail-tab activation moves focus from the previous tab to the selected tab',async()=>{
 const f=fixture({details:true});await f.history.open();const button=f.control('history-detail',1,'toggle');button.focus();const opened=f.action('history-detail',button);f.detailRequests[0].gate.resolve({game:f.game});await opened;
 f.control('history-detail',1,'summary').focus();await f.action('history-detail',f.control('history-detail',1,'events'));
 assert.equal(f.history.current().details[1].section,'events');assert.equal(f.document.activeElement,f.control('history-detail',1,'events'));assert.equal(f.focusListeners.size,0);
});

test('failed match detail releases focus listeners and its explicit retry can succeed',async()=>{
 const f=fixture({details:true}),tab=await f.history.open(),button=f.control('history-detail',1,'toggle');button.focus();const pending=f.action('history-detail',button);f.detailRequests[0].gate.reject(Error('mock detail offline'));await pending;
 assert.match(tab.details[1].error,/offline/);assert.equal(tab.details[1].loading,false);assert.equal(f.document.activeElement,f.control('history-detail',1,'toggle'));assert.equal(f.focusListeners.size,0);
 const retry=f.control('history-detail',1,'summary');retry.focus();const retried=f.action('history-detail',retry);f.detailRequests[1].gate.resolve({game:f.game});await retried;
 assert.equal(tab.details[1].error,'');assert.equal(tab.details[1].complete,true);assert.equal(f.document.activeElement,f.control('history-detail',1,'summary'));assert.equal(f.focusListeners.size,0);
});
