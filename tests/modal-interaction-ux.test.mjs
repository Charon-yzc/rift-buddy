import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
function extract(from,to){const start=source.indexOf(from),end=source.indexOf(to,start);assert(start>=0&&end>start,from);return source.slice(start,end);}
function backdropFixture(){
 const listeners=new Map();let closed=0;
 const listen=(name,fn)=>{const all=listeners.get(name)||[];all.push(fn);listeners.set(name,all);};
 const node=(dataset={})=>({dataset,isConnected:true,closest(selector){return selector==='[data-action]'&&this.dataset.action?this:null;}});
 const backdrop=node({backdrop:'true'}),inside=node(),close=node({action:'close'}),overlay={firstElementChild:backdrop};
 const context={document:{addEventListener:listen},window:{addEventListener:listen},overlay,activeOverlaySelect:null,activeAppSelect:null,closeRecommendationMenus:()=>false,
  closeOverlay(){closed++;if(overlay.firstElementChild)overlay.firstElementChild.isConnected=false;overlay.firstElementChild=null;}};
 const click=extract('function historyChartAction(event){',' if(Date.now()-draggedAt<250)');
 const closeBranch=source.split('\n').find(line=>line.includes("else if(action==='close')closeOverlay();")).replace('else if','if');
 const escape=source.split('\n').find(line=>line.startsWith("document.addEventListener('keydown',event=>{if(event.key==='Escape'"));
 vm.runInNewContext(click+' const action=el.dataset.action;'+closeBranch+'\n});\n'+escape,context);
 return {backdrop,inside,close,overlay,closed:()=>closed,replace(){backdrop.isConnected=false;overlay.firstElementChild=node({backdrop:'true'});return overlay.firstElementChild;},
  async emit(name,target=backdrop,extra={}){for(const fn of listeners.get(name)||[])await fn({target,button:0,isPrimary:true,pointerId:7,...extra});}};
}

test('an ordinary primary press and release on the current backdrop dismisses it once',async()=>{
 const f=backdropFixture();await f.emit('pointerdown');await f.emit('pointerup');await f.emit('click');assert.equal(f.closed(),1);
});
for(const scenario of ['inside-down','inside-up','cancel','blur','secondary','right-button','different-pointer','changed-layer','click-only'])test(`backdrop ${scenario} cannot accidentally dismiss the current dialog`,async()=>{
 const f=backdropFixture();let target=f.backdrop;
 if(scenario!=='click-only')await f.emit('pointerdown',scenario==='inside-down'?f.inside:f.backdrop,{isPrimary:scenario!=='secondary',button:scenario==='right-button'?2:0});
 if(scenario==='cancel')await f.emit('pointercancel');if(scenario==='blur')await f.emit('blur');if(scenario==='changed-layer')target=f.replace();
 await f.emit('pointerup',scenario==='inside-up'?f.inside:target,{pointerId:scenario==='different-pointer'?8:7});await f.emit('click',target);
 assert.equal(f.closed(),0);assert.equal(f.overlay.firstElementChild,target);
});
test('the explicit close button and ordinary Escape retain their existing dismissal behavior',async()=>{
 const button=backdropFixture();await button.emit('click',button.close);assert.equal(button.closed(),1);
 const keyboard=backdropFixture();await keyboard.emit('keydown',keyboard.inside,{key:'Escape',defaultPrevented:false});assert.equal(keyboard.closed(),1);
});

function presentationFixture(kind){
 const gate=Promise.withResolvers(),painted=[],original={kind:kind==='theme'?'theme':'presentation'};
 const overlay={firstElementChild:original,querySelector:selector=>selector==='.theme-settings'&&overlay.firstElementChild?.kind==='theme'?{}:null};
 const context=vm.createContext({overlay,saved:{preferences:{presentation:{textScale:1}}},api:{presentation:()=>gate.promise},render(){painted.push('app');},toast(){},
  updateThemeDialog(){painted.push('theme');overlay.firstElementChild={kind:'theme'};},updatePresentationDialog(){painted.push('presentation');overlay.firstElementChild={kind:'presentation'};}});
 const code=kind==='module'?extract('if(el.dataset.presentationModule){',"if(el.id==='companion-width')"):extract("if(action==='presentation'){","if(action==='build-source-cache')");
 vm.runInContext(`async function change(el){const action='presentation';${code}}`,context);
 const applying=context.change({dataset:kind==='module'?{presentationModule:'skills'}:{field:kind==='theme'?'theme':'textScale',value:kind==='theme'?'arcane':'1.25'}});
 return {context,overlay,original,painted,async finish(){const value={theme:'arcane',textScale:1.25,guideModules:['skills']};gate.resolve(value);await applying;await gate.promise;return value;}};
}
for(const kind of ['theme','size','module'])for(const next of ['same','closed','feedback','new-same-kind'])test(`${kind} preference replies accept the value while respecting the ${next} dialog`,async()=>{
 const f=presentationFixture(kind);if(next!=='same')f.overlay.firstElementChild=next==='closed'?null:{kind:next==='feedback'?'feedback':f.original.kind,draft:'keep this draft'};
 const active=f.overlay.firstElementChild,value=await f.finish();assert.equal(f.context.saved.preferences.presentation,value);assert(f.painted.includes('app'));
 const updates=f.painted.filter(name=>name!=='app');if(next==='same')assert.deepEqual(updates,[kind==='theme'?'theme':'presentation']);else{assert.deepEqual(updates,[]);assert.equal(f.overlay.firstElementChild,active);if(active)assert.equal(active.draft,'keep this draft');}
});
