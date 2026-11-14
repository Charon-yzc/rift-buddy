import test from 'node:test';
import assert from 'node:assert/strict';
import {historyTooltipView,historyAsset,bindHistoryTooltips} from '../src/match-history-hover.mjs';

const data={version:'16.20.1',items:{3137:{name:'蜕生',description:'<mainText><stats>75 法术强度<br>30% 法术穿透</stats><br><passive>死中焕生</passive><br>治疗附近友军。<img src=x onerror=alert(1)></mainText>',gold:{total:3000,base:200,sell:2100},from:['1052','1026']}},runes:[{id:8000,name:'精密',slots:[{runes:[{id:8005,name:'强攻',longDesc:'连续攻击造成额外伤害。',endOfGameStatDescriptions:['额外伤害：@eogvar1@']}]}]}],spells:{SummonerFlash:{key:'4',name:'闪现',description:'传送一小段距离。',cooldown:[300]}},champions:[],augments:[]};
test('hover equipment details expose recorded identity, costs and recipe with escaped current descriptions',()=>{
 const html=historyTooltipView(data,{kind:'item',id:3137,game:{version:'16.19'}});
 for(const value of ['蜕生','3137','3,000','200','2,100','法术强度','死中焕生','1052','1026','16.20.1','16.19'])assert.ok(html.includes(value),value);
 assert.doesNotMatch(html,/<img src=x|onerror=|<script/);
 assert.match(historyAsset(data,'item',3137),/data-history-tip="item"/);
 assert.doesNotMatch(historyAsset(data,'item',0),/data-history-tip/);
});
test('rune hover substitutes this participant’s recorded variables and keeps missing records unknown',()=>{
 const html=historyTooltipView(data,{kind:'rune',id:8005,participant:{styles:[{selections:[{perk:8005,var1:431,var2:0,var3:null}]}]}});
 assert.match(html,/额外伤害：431/);assert.match(html,/本局记录/);assert.match(html,/未读取/);assert.doesNotMatch(html,/@eogvar/);
 const missing=historyTooltipView(data,{kind:'rune',id:8005});assert.match(missing,/额外伤害：未读取/);assert.doesNotMatch(missing,/额外伤害：0|本局记录/);
 const spell=historyTooltipView(data,{kind:'spell',id:4});assert.match(spell,/闪现/);assert.match(spell,/300/);assert.match(spell,/SummonerFlash\.png/);
 const unknown=historyTooltipView(data,{kind:'item',id:9999});assert.match(unknown,/未收录/);assert.doesNotMatch(unknown,/0 金/);
});
test('statistic, event and timeline text details never interpret player-supplied markup',()=>{
 const html=historyTooltipView(data,{kind:'text',label:'伤害 <玩家>',text:'1:00 · 实际采样\n<script>alert(1)</script>'});assert.match(html,/伤害 &lt;玩家&gt;/);assert.match(html,/1:00/);assert.doesNotMatch(html,/<script>/);
});

function hoverFixture(attribute='data-history-tip'){
 const listeners=new Map(),timers=new Map();let timerId=0;
 const listen=(name,fn)=>{const callbacks=listeners.get(name)||[];callbacks.push(fn);listeners.set(name,callbacks);};
 const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
 function element(bounds=rect(0,0,0,0)){
  const ownListeners=new Map(),attributes=new Map();
  return {parentElement:null,isConnected:true,children:[],bounds,clientLeft:0,clientTop:0,clientWidth:bounds.width,clientHeight:bounds.height,overflowX:'visible',overflowY:'visible',dataset:{},style:{setProperty(){}},offsetWidth:360,offsetHeight:140,
   getBoundingClientRect(){return this.bounds;},getAttribute:name=>attributes.get(name)||null,setAttribute:(name,value)=>attributes.set(name,value),removeAttribute:name=>attributes.delete(name),
   closest(selector){return selector===`[${attribute}]`&&this===source?this:this.parentElement?.closest(selector)||null;},contains(node){return node===this||this.children.some(child=>child.contains(node));},
   append(child){child.parentElement=this;this.children.push(child);},remove(){this.isConnected=false;this.parentElement.children=this.parentElement.children.filter(child=>child!==this);},showPopover(){},
   addEventListener(name,fn){ownListeners.set(name,fn);},emit(name,event={}){ownListeners.get(name)?.({target:this,...event});}
  };
 }
 const body=element(rect(0,0,1050,720)),scroller=element(rect(200,100,700,280)),source=element(rect(380,180,40,32));body.append(scroller);scroller.append(source);
 const document={body,documentElement:body,activeElement:null,createElement:()=>element(),addEventListener:listen,
  defaultView:{innerWidth:1050,innerHeight:720,addEventListener:listen,getComputedStyle:node=>({overflowX:node.overflowX,overflowY:node.overflowY,getPropertyValue:()=>''})}};
 bindHistoryTooltips({document,attribute,getData:()=>({}),render:()=>'<h3>Recorded detail</h3>',setTimer:fn=>{timers.set(++timerId,fn);return timerId;},clearTimer:id=>timers.delete(id)});
 const emit=(name,target=source,extra={})=>{for(const fn of listeners.get(name)||[])fn({target,...extra});};
 return {source,scroller,body,document,rect,emit,tip:()=>body.children.find(node=>node.id==='history-hover-detail'),focus(){document.activeElement=source;emit('focusin');},flush(){const due=[...timers.values()];timers.clear();due.forEach(fn=>fn());}};
}

for(const attribute of ['data-history-tip','data-ongoing-tip'])test(`${attribute}: a focused detail closes when its anchor leaves the viewport`,()=>{
 for(const bounds of [[380,-40,40,32],[380,720,40,32],[-40,180,40,32],[1050,180,40,32]]){
  const f=hoverFixture(attribute);f.focus();assert.ok(f.tip());f.source.bounds=f.rect(...bounds);f.emit('scroll',f.scroller);
  assert.equal(f.tip(),undefined);assert.equal(f.source.getAttribute('aria-describedby'),null);
 }
});

test('scroll clipping closes an off-row detail even while the anchor is inside the viewport',()=>{
 for(const [axis,overflow,bounds] of [['overflowY','auto',[380,60,40,32]],['overflowX','hidden',[150,180,40,32]],['overflowY','clip',[380,381,40,32]],['overflowX','scroll',[901,180,40,32]]]){
  const f=hoverFixture();f.scroller[axis]=overflow;f.focus();assert.ok(f.tip());f.source.bounds=f.rect(...bounds);f.emit('scroll',f.scroller);assert.equal(f.tip(),undefined);
 }
});

test('a visible focused anchor keeps its detail positioned; the card can scroll and accept the pointer',()=>{
 const f=hoverFixture();f.scroller.overflowY='auto';f.focus();const tip=f.tip();
 f.source.bounds=f.rect(380,130,40,32);f.emit('scroll',f.scroller);assert.equal(f.tip(),tip);assert.equal(tip.style.top,'130px');assert.equal(f.source.getAttribute('aria-describedby'),tip.id);
 f.emit('pointerout',f.source,{relatedTarget:tip});tip.emit('pointerenter');f.flush();assert.equal(f.tip(),tip);
 f.source.getBoundingClientRect=()=>{throw Error('Scrolling the detail must not read or move its anchor');};f.emit('scroll',tip);assert.equal(f.tip(),tip);
 const inside={contains:node=>node===inside};tip.append(inside);f.emit('scroll',inside);assert.equal(f.tip(),tip);
 f.emit('keydown',tip,{key:'Escape'});assert.equal(f.tip(),undefined);assert.equal(f.source.getAttribute('aria-describedby'),null);
});

test('scrollport borders and nested clipping count, while overflow-visible parents do not clip',()=>{
 const f=hoverFixture();f.focus();const tip=f.tip();f.source.bounds=f.rect(380,60,40,32);f.emit('scroll',f.scroller);assert.equal(f.tip(),tip,'Visible overflow is still rendered');
 f.scroller.overflowY='auto';f.scroller.clientTop=4;f.scroller.clientHeight=272;f.source.bounds=f.rect(380,70,40,32);f.emit('scroll',f.scroller);assert.equal(f.tip(),undefined,'A border is outside the visible scrollport');
 f.source.bounds=f.rect(380,180,40,32);f.focus();assert.ok(f.tip());f.body.overflowY='hidden';f.body.clientHeight=150;f.emit('scroll',f.scroller);assert.equal(f.tip(),undefined,'An outer clipped ancestor also limits a visible inner scrollport');
});

test('focusing an already hidden anchor is harmless and later visible focus can reopen its detail',()=>{
 const f=hoverFixture();f.scroller.overflowY='auto';f.source.bounds=f.rect(380,60,40,32);assert.doesNotThrow(()=>f.focus());assert.equal(f.tip(),undefined);
 f.source.bounds=f.rect(380,180,40,32);f.focus();assert.ok(f.tip());
});

test('partly clipped anchors remain readable and ordinary pointer leave still closes',()=>{
 const f=hoverFixture();f.scroller.overflowY='auto';f.emit('pointerover');f.flush();const tip=f.tip();assert.ok(tip);
 f.source.bounds=f.rect(380,90,40,32);f.emit('scroll',f.scroller);assert.equal(f.tip(),tip);
 f.emit('pointerout',f.source,{relatedTarget:f.body});tip.emit('pointerenter');f.flush();assert.equal(f.tip(),tip);
 tip.emit('pointerleave');f.flush();assert.equal(f.tip(),undefined);
});
