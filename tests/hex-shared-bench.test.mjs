import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {sanitizeSession} from '../services/lcu.mjs';
import {clientRenderIdentity} from '../src/core/client-party.mjs';
import {pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {companionView} from '../src/companion-view.mjs';

const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const key=id=>data.champions.find(c=>c.id===id).key;
const pool=['Malphite','Xerath','Teemo','Karma','Trundle','Brand','Morgana','Garen','Nami','Lulu','Kennen','Braum'];
function fixture(){
 const raw={gameId:777,localPlayerCellId:0,myTeam:['Lux','Ashe','Veigar','Sona','Jinx'].map((id,cellId)=>({cellId,championId:key(id)})),theirTeam:[],benchEnabled:true,benchChampions:pool.map(id=>({championId:key(id)}))};
 const client={connected:true,phase:'ChampSelect',mode:{id:'hex'},party:{members:[{cellId:0}]},session:sanitizeSession(raw)};
 const render=()=>companionView({data,client,slots:[],tab:'recommend',preferences:{},configurationStatus:{}});
 return {raw,client,render};
}
function visiblePool(html){
 const section=html.match(/<section class="hex-shared-bench"[^>]*>([\s\S]*?)<\/section>/)?.[1];
 assert.ok(section,'The sidebar must expose the shared bench independently of recommended lineups');
 assert.doesNotMatch(section,/<details\b/,'Available heroes must not be hidden in a disclosure');
 return [...section.matchAll(/data-action="hex-quick-pick"[^>]*data-id="([^"]+)"/g)].map(m=>m[1]);
}
test('the sidebar shows every shared bench hero even when only three recommended lineups are visible',()=>{
 const f=fixture(),before=structuredClone(f.client),html=f.render();
 assert.deepEqual(visiblePool(html).sort(),[...pool].sort());
 assert.deepEqual(f.client,before);
 const ranking=html.slice(html.indexOf('<div class="hex-ranking"'));
 assert.doesNotMatch(ranking,/data-action="hex-quick-pick"/);
});
test('ordinary teammates can add and remove shared bench heroes without changing the local pick or party membership',()=>{
 const f=fixture(),before=clientRenderIdentity(f.client);
 assert.equal(visiblePool(f.render()).length,12);
 f.raw.benchChampions.push({championId:key('Hecarim')});
 f.raw.benchChampions=f.raw.benchChampions.filter(p=>p.championId!==key('Xerath'));
 f.client.session=sanitizeSession(f.raw);
 assert.notEqual(clientRenderIdentity(f.client),before,'A bench-only update must repaint the sidebar');
 assert.deepEqual(visiblePool(f.render()).sort(),[...pool.filter(id=>id!=='Xerath'),'Hecarim'].sort());
 f.raw.benchChampions=[];f.client.session=sanitizeSession(f.raw);
 assert.deepEqual(visiblePool(f.render()),[],'Removed heroes must not survive in a cached pool');
});
test('shared bench clicks exclude occupied, disabled and locally unpickable heroes without inventing entries',()=>{
 const f=fixture();
 f.raw.benchChampions.push({championId:key('Ashe')},{championId:key('Malphite')},{championId:99999});
 f.client.session=sanitizeSession(f.raw);
 f.client.eligibility={context:pickEligibilityContext(f.client.session),localPlayerCellId:0,receivedAt:new Date().toISOString(),pickable:pool.filter(id=>id!=='Brand').map(key),disabled:[key('Garen')]};
 assert.deepEqual(visiblePool(f.render()).sort(),pool.filter(id=>!['Brand','Garen'].includes(id)).sort());
});
