const puuid='[A-Za-z0-9_-]{16,160}',id='[1-9]\\d{0,15}';
export function allowedHistoryRoute(route,method='GET',body){
 if(typeof route!=='string'||route.length>600)return false;
 if(method==='GET'){
  if(['/entitlements/v1/token','/lol-league-session/v1/league-session-token','/riotclient/region-locale','/lol-login/v1/session','/lol-replays/v1/configuration'].includes(route))return true;
  if(new RegExp(`^/lol-match-history/v1/products/lol/(?:current-summoner|${puuid})/matches(?:\\?begIndex=\\d{1,5}&endIndex=\\d{1,5})?$`).test(route)){
   if(!route.includes('?'))return true;const q=new URLSearchParams(route.split('?')[1]),a=Number(q.get('begIndex')),b=Number(q.get('endIndex'));return a>=0&&b>=a&&b-a<100&&b<=10000;
  }
  if(new RegExp(`^/lol-match-history/v1/(?:games|game-timelines)/${id}$`).test(route))return true;
  if(new RegExp(`^/lol-ranked/v1/ranked-stats/${puuid}$`).test(route)||new RegExp(`^/lol-champion-mastery/v1/${puuid}/champion-mastery$`).test(route)||new RegExp(`^/lol-replays/v1/metadata/${id}$`).test(route))return true;
  if(/^\/lol-summoner\/v1\/summoners\?name=[^&#]{1,300}$/.test(route))return true;
 }
 if(method==='POST'&&route==='/lol-summoner/v1/summoners/aliases')return Array.isArray(body)&&body.length===1&&Object.keys(body[0]||{}).sort().join(',')==='gameName,tagLine'&&typeof body[0].gameName==='string'&&body[0].gameName.length<=64&&typeof body[0].tagLine==='string'&&body[0].tagLine.length<=16;
 if(method==='POST'&&new RegExp(`^/lol-replays/v1/rofls/${id}/(?:download|watch)$`).test(route))return body?.componentType==='replay-button_match-history'&&Object.keys(body).length===1;
 if(method==='POST'&&new RegExp(`^/lol-replays/v2/metadata/${id}/create$`).test(route))return body&&Object.keys(body).sort().join(',')==='gameEnd,gameType,gameVersion,queueId'&&typeof body.gameVersion==='string'&&body.gameVersion.length<=40&&typeof body.gameType==='string'&&body.gameType.length<=40&&Number.isFinite(body.gameEnd)&&Number.isSafeInteger(body.queueId)&&body.queueId>=0;
 return false;
}
