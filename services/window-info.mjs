// The report is an explicit, local UI read. Never include process identities,
// paths, client messages, player data or authentication fields.
const rect=value=>value&&['x','y','width','height'].every(k=>Number.isFinite(value[k]))&&value.width>0&&value.height>0&&value.width<=20000&&value.height<=20000&&Math.abs(value.x)<=50000&&Math.abs(value.y)<=50000?Object.fromEntries(['x','y','width','height'].map(k=>[k,Math.round(value[k])])):null;
const version=value=>typeof value==='string'&&/^\d+\.\d+(?:\.\d+)?(?:-[a-z0-9.-]+)?$/i.test(value)?value:'未知';
const phases=new Set(['Offline','None','Lobby','Matchmaking','ReadyCheck','ChampSelect','GameStart','InProgress','Reconnect','WaitingForStats','PreEndOfGame','EndOfGame']);
const ownWindow=value=>{const bounds=rect(value?.bounds);return bounds?{bounds,visible:value.visible===true,minimized:value.minimized===true}:null;};
export function windowInfo(input={},now=Date.now()){
 const displays=(Array.isArray(input.displays)?input.displays:[]).slice(0,16).flatMap((display,index)=>{
  const bounds=rect(display.bounds),workArea=rect(display.workArea),scale=display.scaleFactor;
  if(!bounds||!workArea||!Number.isFinite(scale)||scale<.5||scale>8)return [];
  return [{number:index+1,primary:input.primaryDisplayId!=null&&display.id===input.primaryDisplayId,bounds,workArea,scaleFactor:scale,pixelReference:{width:Math.round(bounds.width*scale),height:Math.round(bounds.height*scale)}}];
 });
 const observedAt=Number(input.observedAt),fresh=Number.isFinite(observedAt)&&observedAt>0&&now-observedAt>=0&&now-observedAt<=5000;
 const observed=value=>{const pixels=rect(value?.pixels),dip=rect(value?.dip);return fresh&&pixels&&dip?{pixels,dip,minimized:value.minimized===true,foreground:value.foreground===true}:null;};
 return {at:new Date(now).toISOString(),version:version(input.version),dataVersion:version(input.dataVersion),displays,
  client:{connected:input.client?.connected===true,phase:phases.has(input.client?.phase)?input.client.phase:'Offline'},
  main:ownWindow(input.main),guide:ownWindow(input.guide)?{...ownWindow(input.guide),collapsed:input.guide.collapsed===true,ball:input.guide.ball===true,clickThrough:input.guide.clickThrough===true}:null,
  companion:input.companion?.docked===true,observationFresh:fresh,observedClient:observed(input.observedClient),observedGame:observed(input.observedGame)};
}
