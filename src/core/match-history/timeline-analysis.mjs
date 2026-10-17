// Postgame analyses adapted from Akari single/{objectives,jungle,early-deaths}
// and utils/geometry at 60f1584c. Sampled pathing is an estimate, not live tracking.
const zone=({x,y})=>x<5000&&y>9000?'top':x>9000&&y<5000?'bot':Math.abs(y-x)<=3500?'mid':y>x?'top':'bot';
const lane=({x,y})=>x<5000&&y>9000?'top':x>9000&&y<5000?'bot':Math.abs(y-x)<4000&&(x+y)/2>3000&&(x+y)/2<12000?'mid':null;
const CAMPS=[['blue','blue',3830,7880],['wolves','blue',3800,6440],['red','blue',7760,4010],['raptors','blue',6970,5460],['blue','red',10990,7000],['wolves','red',11020,8440],['red','red',7060,10870],['raptors','red',7850,9420]];
const jungler=p=>p.position==='JUNGLE'||p.spells?.includes(11);
export function analyzeTimeline(game,timeline){
 const self=game.self;if(!self)return null;const objectives=Object.fromEntries(['dragon','horde','herald','baron'].map(k=>[k,{count:0,first:null}]));let firstDragon=null,soloDragons=0,unresolved=0;
 for(const event of timeline.events){if(event.type!=='ELITE_MONSTER_KILL')continue;const team=event.killerTeamId??game.participants.find(p=>p.id===event.killerId)?.teamId;if(team==null){unresolved++;continue;}if(event.monster==='DRAGON'&&firstDragon===null)firstDragon=team===self.teamId;if(team!==self.teamId)continue;const key={DRAGON:'dragon',HORDE:'horde',RIFTHERALD:'herald',BARON_NASHOR:'baron'}[event.monster];if(!key)continue;objectives[key].count++;objectives[key].first??=event.timestamp/1000;if(key==='dragon'&&event.killerId===self.id&&!event.assists?.length)soloDragons++;}
 let earlyJungleDeaths=null;const rift=game.map===11&&game.mode==='CLASSIC';
 if(rift&&!jungler(self)){const enemies=game.participants.filter(p=>p.team!==self.team),byPosition=enemies.filter(p=>p.position==='JUNGLE'),ids=(byPosition.length?byPosition:enemies.filter(jungler)).map(p=>p.id);if(ids.length)earlyJungleDeaths=timeline.events.filter(v=>v.type==='CHAMPION_KILL'&&v.timestamp<=900000&&v.victimId===self.id&&(ids.includes(v.killerId)||v.assists?.some(id=>ids.includes(id)))).length;}
 let jungle=null;
 if(rift&&jungler(self)){
  const positions=timeline.frames.filter(f=>f.timestamp>0&&f.timestamp<=840000).flatMap(f=>{const p=f.players.find(p=>p.id===self.id);return p?.position?[{...p.position,minute:f.timestamp/60000,zone:zone(p.position)}]:[];}),ganks=timeline.events.filter(v=>v.type==='CHAMPION_KILL'&&v.timestamp<=840000&&v.position&&(v.killerId===self.id||v.assists?.includes(self.id))).map(v=>({...v.position,timestamp:v.timestamp,lane:lane(v.position)}));
  const first=positions.find(p=>Math.abs(p.minute-1)<0.2),nearest=first?[...CAMPS].sort((a,b)=>(first.x-a[2])**2+(first.y-a[3])**2-((first.x-b[2])**2+(first.y-b[3])**2))[0]:null;
  jungle={estimated:true,start:nearest?{camp:nearest[0],side:nearest[1]}:null,positions,ganks,weights:Object.fromEntries(['top','mid','bot'].map(k=>[k,positions.filter(p=>p.zone===k).length+5*ganks.filter(p=>zone(p)===k).length]))};
 }
 return {objectives,firstDragon,soloDragons,unresolved,earlyJungleDeaths,jungle};
}
