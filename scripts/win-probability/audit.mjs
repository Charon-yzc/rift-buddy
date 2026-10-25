import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseCsv} from './csv.mjs';
import {liveFeatures} from './contract.mjs';
import {DATA_SOURCE,DEFAULT_ROOT} from './sources.mjs';
const increment=(map,key)=>{map[key]=(map[key]||0)+1;};
const integer=value=>typeof value==='string'&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;
const bitCount=n=>{let count=0;for(;n;n&=n-1)count++;return count;};
export function teamDraft(row){
 const blue=Array.from({length:5},(_,i)=>integer(row[`B${i+1}Champ`])),red=Array.from({length:5},(_,i)=>integer(row[`R${i+1}Champ`]));
 if([...blue,...red].some(id=>id===null||id<=0)||new Set([...blue,...red]).size!==10)return null;
 const label=integer(row.BlueWin),other=integer(row.RedWin);if(![0,1].includes(label)||other!==1-label)return null;
 return {blue,red,label};
}
export async function auditDataset({root=DEFAULT_ROOT}={}){
 const sourceDir=path.resolve(root,'source'),manifest=JSON.parse(await fs.readFile(path.resolve(root,'downloads.json'),'utf8'));
 if(manifest.source?.id!==DATA_SOURCE.id)throw Error('Source manifest mismatch');
 const csv=async function*(name){const info=manifest.files[name];if(!info)throw Error(`Missing audited file ${name}`);const hash=createHash('sha256');let bytes=0;async function* chunks(){for await(const chunk of createReadStream(path.join(sourceDir,name))){hash.update(chunk);bytes+=chunk.length;yield chunk;}}for await(const row of parseCsv(chunks()))yield row;if(bytes!==info.bytes||hash.digest('hex')!==info.sha256)throw Error(`Source hash mismatch: ${name}`);};
 const report={schema:1,source:DATA_SOURCE,auditedAt:new Date().toISOString(),files:manifest.files,matchRows:0,uniqueMatches:0,regions:{},patches:{},modeLabels:{},ranks:{},invalidMatchRows:0,duplicateMatches:0,conflictingDrafts:0,teamRows:0,validDrafts:0,invalidDraftRows:0,participantRows:0,participantsPerMatch:{},timelineRows:0,unknownTimelineJoins:0,duplicateTimelineSlots:0,snapshotGroups:0,playersPerSnapshot:{},completeSnapshotGroups:0,completeSnapshotGames:0,fullyMeasuredSnapshotGroups:0,missingNumericRows:0,fieldCoverage:{},blockers:[]};
 const matches=new Map();
 for await(const row of csv('MatchTbl.csv')){
  report.matchRows++;if(matches.has(row.MatchId)){report.duplicateMatches++;throw Error('Duplicate match metadata');}
  const patch=row.Patch?.match(/^(\d+\.\d+)\./)?.[1],duration=integer(row.GameDuration);
  if(!/^[A-Z0-9]+_\d+$/.test(row.MatchId)||!patch||duration===null){report.invalidMatchRows++;continue;}
  const region=row.MatchId.split('_')[0];increment(report.regions,region);increment(report.patches,patch);increment(report.modeLabels,row.QueueType||'unknown');increment(report.ranks,row.RankFk||'unknown');
  matches.set(row.MatchId,{index:matches.size,patch,region,duration,mode:row.QueueType,participantCount:0});
 }
 report.uniqueMatches=matches.size;
 const drafts=new Map();
 for await(const row of csv('TeamMatchTbl.csv')){
  report.teamRows++;const draft=teamDraft(row),match=matches.get(row.MatchFk);
  if(!draft||!match){report.invalidDraftRows++;continue;}
  if(drafts.has(row.MatchFk)){if(JSON.stringify(drafts.get(row.MatchFk))!==JSON.stringify(draft))report.conflictingDrafts++;throw Error('Duplicate or conflicting team draft');}
  drafts.set(row.MatchFk,draft);
 }
 report.validDrafts=drafts.size;
 const participants=new Map();let duplicateParticipants=0;
 for await(const row of csv('SummonerMatchTbl.csv')){
  report.participantRows++;const match=matches.get(row.MatchFk),draft=drafts.get(row.MatchFk),champion=integer(row.ChampionFk),id=integer(row.SummonerMatchId);
  if(!match||!draft||id===null)continue;
  const slot=[...draft.blue,...draft.red].indexOf(champion);if(slot<0)continue;
  if(participants.has(id)){duplicateParticipants++;throw Error('Duplicate participant key');}
  participants.set(id,{match,slot});match.participantCount++;
 }
 report.duplicateParticipants=duplicateParticipants;
 for(const match of matches.values())increment(report.participantsPerMatch,match.participantCount);
 report.rankNames={};
 for await(const row of csv('RankTbl.csv'))report.rankNames[row.RankId]=row.RankName;
 report.postgameStats={rows:0,unknownParticipantJoins:0,columns:[],usedForPregame:false};
 for await(const row of csv('MatchStatsTbl.csv')){
  report.postgameStats.rows++;if(!report.postgameStats.columns.length)report.postgameStats.columns=Object.keys(row);
  if(!participants.has(integer(row.SummonerMatchFk)))report.postgameStats.unknownParticipantJoins++;
 }
 const snapshots=new Map(),badSnapshots=new Set(),completeGames=new Set(),completeKeys=new Set();
 const features=['Minute','Level','MinionsKilled','JungleMinionsKilled','Kills','Deaths','Assists'];
 let headers=null;
 for await(const row of csv('MatchTimelineTbl.csv')){
  report.timelineRows++;if(!headers)headers=Object.keys(row);
  for(const field of features)if(integer(row[field])!==null)increment(report.fieldCoverage,field);
  const participant=participants.get(integer(row.SummonerMatchFk)),minute=integer(row.Minute);
  if(!participant||minute===null||minute>180){report.unknownTimelineJoins++;continue;}
   const key=minute+256*(participant.match.index),mask=snapshots.get(key)||0,bit=1<<participant.slot;
  if(mask&bit){report.duplicateTimelineSlots++;badSnapshots.add(key);}
  snapshots.set(key,mask|bit);
  const level=integer(row.Level);
  if(features.some(field=>integer(row[field])===null)||level<1||level>18){report.missingNumericRows++;badSnapshots.add(key);}
 }
 report.timelineColumns=headers||[];
 for(const [key,mask] of snapshots){report.snapshotGroups++;increment(report.playersPerSnapshot,bitCount(mask));if(mask===1023){report.completeSnapshotGroups++;completeGames.add(Math.floor(key/256));if(!badSnapshots.has(key)){report.fullyMeasuredSnapshotGroups++;completeKeys.add(key);}}}
 report.completeSnapshotGames=completeGames.size;
 const vocabulary=[];for await(const row of csv('ChampionTbl.csv')){const id=integer(row.ChampionId);if(id&& !vocabulary.includes(id))vocabulary.push(id);}vocabulary.sort((a,b)=>a-b);
 report.championVocabularySize=vocabulary.length;
 const examples=[];const patches={};let invalidVocabulary=0,shortGames=0;
 for(const [id,draft] of drafts){const match=matches.get(id);if(match.duration<300){shortGames++;continue;}if([...draft.blue,...draft.red].some(champion=>!vocabulary.includes(champion))){invalidVocabulary++;continue;}
  // Raw public IDs and player keys do not leave source storage.
  const game=createHash('sha256').update(DATA_SOURCE.id+':'+id).digest('hex').slice(0,24);
  examples.push({game,patch:match.patch,region:match.region,queue:null,createdAt:null,label:draft.label,blue:draft.blue,red:draft.red});increment(patches,match.patch);
 }
 report.pregame={examples:examples.length,excludedShortGames:shortGames,excludedUnknownChampion:invalidVocabulary,patches,features:'unordered champion-set difference only',historyAvailable:false,exactQueueAvailable:false,timestampsAvailable:false,roleOrderVerified:false};
 const liveRows=[];
 if(completeKeys.size){
  const groups=new Map(),byIndex=new Map([...matches.entries()].map(([id,m])=>[m.index,{id,match:m,draft:drafts.get(id)}]));
  for await(const row of csv('MatchTimelineTbl.csv')){
   const participant=participants.get(integer(row.SummonerMatchFk)),minute=integer(row.Minute);if(!participant||minute===null)continue;
   const key=minute+256*(participant.match.index);if(!completeKeys.has(key))continue;
   let group=groups.get(key);if(!group){group=[];groups.set(key,group);}
   group.push({slot:participant.slot,side:participant.slot<5?'blue':'red',level:integer(row.Level),kills:integer(row.Kills),deaths:integer(row.Deaths),assists:integer(row.Assists),cs:integer(row.MinionsKilled)+integer(row.JungleMinionsKilled)});
  }
  for(const [key,players] of groups){const entry=byIndex.get(Math.floor(key/256)),time=(key%256)*60;if(time===0||time>entry.match.duration||entry.match.duration<300)continue;
   const game=createHash('sha256').update(DATA_SOURCE.id+':'+entry.id).digest('hex').slice(0,24);
   liveRows.push({game,patch:entry.match.patch,region:entry.match.region,queue:null,createdAt:null,time,label:entry.draft.label,features:liveFeatures({players,time})});
  }
 }
 report.live={examples:liveRows.length,games:new Set(liveRows.map(r=>r.game)).size,features:['time_min','avg_level_diff','cs_diff','kill_diff','death_diff','assist_diff'],sourceMeasurement:'Complete same-minute ten-player public scoreboard only'};
 report.blockers.push('No exact queue ID: CLASSIC alone cannot verify ranked solo/duo.','No match creation timestamps: prior-player histories and same-patch chronology cannot be verified.','No CN matches in observed source regions; cannot establish CN calibration.');
 if(report.fullyMeasuredSnapshotGroups===0)report.blockers.push('No complete fully measured ten-player same-minute snapshots: live team-state training is blocked on this source.');
 report.baselineEligibility={pregameChampionOnly:examples.length>0,pregameWithHistory:false,liveCompleteTeams:report.fullyMeasuredSnapshotGroups>0,cnCalibration:false};
 await fs.mkdir(path.resolve(root,'prepared'),{recursive:true});
 await fs.writeFile(path.resolve(root,'prepared/pregame.json'),JSON.stringify({schema:1,source:DATA_SOURCE.id,vocabulary,rows:examples}));
 await fs.writeFile(path.resolve(root,'prepared/live.json'),JSON.stringify({schema:1,source:DATA_SOURCE.id,rows:liveRows}));
 await fs.writeFile(path.resolve(root,'audit.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),i=args.indexOf('--root');const report=await auditDataset({root:i>=0?args[i+1]:DEFAULT_ROOT});
 console.log(JSON.stringify({...report,files:Object.keys(report.files)},null,2));
}
