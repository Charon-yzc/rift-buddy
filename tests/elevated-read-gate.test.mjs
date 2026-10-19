import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {shouldRequestElevatedRead,OBSERVATION_MAX_AGE_MS}=createRequire(import.meta.url)('../electron/elevated-read-gate.cjs');

const now=1_700_000_000_000;
const base={now,needsElevation:true,observedWindows:{client:null,game:null},observedAt:now-1000};

test('the automatic Windows permission request needs a fresh snapshot that proves no game is running',()=>{
 assert.equal(shouldRequestElevatedRead(base),true,'A recent snapshot without a game allows one ask');
 assert.equal(shouldRequestElevatedRead({...base,observedWindows:{client:null,game:{foreground:true}}}),false,'A running game defers the ask');
 assert.equal(shouldRequestElevatedRead({...base,observedWindows:null}),false,'No snapshot yet defers the ask');
 assert.equal(shouldRequestElevatedRead({...base,observedAt:0}),false,'A never-updated snapshot defers the ask');
 assert.equal(shouldRequestElevatedRead({...base,observedAt:now-OBSERVATION_MAX_AGE_MS}),false,'An old snapshot defers the ask');
 assert.equal(shouldRequestElevatedRead({...base,observedAt:now-OBSERVATION_MAX_AGE_MS+1}),true,'The boundary stays inside the window');
 assert.equal(shouldRequestElevatedRead({...base,observedAt:now+5000}),false,'A clock that moved backwards is not treated as fresh');
 assert.equal(shouldRequestElevatedRead({...base,observedAt:NaN}),false);
});

test('the ask happens at most once, never for a manual read, and never while the player says a game is running',()=>{
 assert.equal(shouldRequestElevatedRead({...base,force:true}),false,'A manual read asks through the renderer instead');
 assert.equal(shouldRequestElevatedRead({...base,attempted:true}),false,'One ask per run');
 assert.equal(shouldRequestElevatedRead({...base,explicitInGame:true}),false,'An explicit in-game state defers the ask');
 assert.equal(shouldRequestElevatedRead({...base,needsElevation:false}),false,'Nothing to ask for');
 assert.equal(shouldRequestElevatedRead(),false,'An empty call asks for nothing');
 assert.equal(shouldRequestElevatedRead({...base,maxAge:0}),false,'A zero window allows nothing');
});
