'use strict';
// The rule for the single automatic Windows permission request, kept pure so it
// can be unit-tested directly instead of by slicing electron/main.cjs.
//
// An unexpected UAC prompt over a full-screen game is worse than asking the
// player to click "重试读取", so an automatic request needs a recent window
// snapshot that proves no game is running. A manual click and the renderer's
// authorize-client handler bypass this and ask Windows on their own.
const OBSERVATION_MAX_AGE_MS=15000;
function shouldRequestElevatedRead({force=false,needsElevation=false,attempted=false,observedWindows=null,observedAt=0,explicitInGame=false,now=Date.now(),maxAge=OBSERVATION_MAX_AGE_MS}={}){
 if(force||!needsElevation||attempted||explicitInGame)return false;
 const fresh=!!observedWindows&&Number.isFinite(observedAt)&&Number.isFinite(now)&&now-observedAt>=0&&now-observedAt<maxAge;
 return fresh&&!observedWindows.game;
}
module.exports={shouldRequestElevatedRead,OBSERVATION_MAX_AGE_MS};
