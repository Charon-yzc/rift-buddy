import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const from=source.indexOf('function acceptOngoingClient('),to=source.indexOf('async function ongoingAction(',from),code=source.slice(from,to);
test('client update notifications preserve ordinary sync and switch only the main window when enabled',()=>{
 let starts=0,observations=0;const context=vm.createContext({ongoingObservedPhase:'Offline',ongoing:{state:{settings:{autoRoute:false,enabled:true}},observeClient:()=>observations++,start:()=>starts++},windowLayout:{docked:false},route:'draft',closeOverlay:()=>{},render:()=>{}});
 vm.runInContext(code,context);assert.doesNotThrow(()=>context.acceptOngoingClient({phase:'ChampSelect'}));assert.equal(starts,0);assert.equal(observations,1);
 context.ongoing.state.settings.autoRoute=true;context.acceptOngoingClient({phase:'Lobby'});context.acceptOngoingClient({phase:'ChampSelect'});assert.equal(context.route,'ongoing');assert.equal(starts,1);
 context.windowLayout.docked=true;context.acceptOngoingClient({phase:'Lobby'});context.acceptOngoingClient({phase:'ChampSelect'});assert.equal(starts,1);
});
