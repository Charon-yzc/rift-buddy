import {rankingKey} from './rankings.mjs';
import {PRIMARY_ROLES,profile} from './rules.mjs';
import {DEFAULT_BUILD_SOURCE,sameBuildSource} from './build-source.mjs';

const roles=['top','jungle','mid','bottom','support'];
// Freeze this list before collecting builds. Validation must never recompute
// its expected saved-only roles from the candidate it is trying to validate.
export function defaultBuildJobs(game,rankings,stored,champions=game.champions){
 const rank=rankings[rankingKey(game.patch,DEFAULT_BUILD_SOURCE)];
 return champions.flatMap(champion=>{
  const reported=roles.filter(role=>rank?.boards[role]?.some(row=>row.champion===champion.id));
  // Only current-patch saved roles extend the frozen scope. Old snapshots
  // remain cached, but cannot demand unsupported roles in every later patch.
  const saved=Object.values(stored).filter(ref=>ref.champion===champion.id&&ref.patch===game.patch&&sameBuildSource(ref,DEFAULT_BUILD_SOURCE)).map(ref=>ref.role);
  const primary=PRIMARY_ROLES[champion.id]||profile(champion).roles[0];
  return [...new Set([primary,...reported,...saved])].filter(role=>roles.includes(role)).map(role=>({champion,role}));
 });
}
