export const JUNGLE_GUIDANCE_PATCH='16.20';
export const JUNGLE_SOURCES={
 Nocturne:['https://www.leagueoflegends.com/en-us/champions/nocturne/','https://mobalytics.gg/lol/champions/nocturne/guide?igRole=JUNGLE'],
 Diana:['https://www.leagueoflegends.com/en-us/champions/diana/','https://mobalytics.gg/lol/champions/diana/guide'],
 Ivern:['https://www.leagueoflegends.com/en-us/champions/ivern/','https://mobalytics.gg/lol/champions/ivern/guide']
};
const lanes=['top','mid','bottom'],fields=['pushed','follow','control','safe'];
const labels={top:'上路',mid:'中路',bottom:'下路'};
export function validateJungleNotes(value){
 if(!value||typeof value!=='object')return undefined;
 const notes={...(value.start==='red'||value.start==='blue'?{start:value.start}:{})};
 if(lanes.includes(value.lane)&&Number.isFinite(value.at)&&value.at>=0&&value.at<1e6){notes.lane=value.lane;notes.at=value.at;for(const key of fields)if(value[key]===true)notes[key]=true;}
 return Object.keys(notes).length?notes:undefined;
}
export function changeJungleNotes(current,field,value,gameTime){
 let notes=validateJungleNotes(current)||{};
 if(field==='start'){if(!['red','blue'].includes(value))throw Error('起手营地不正确');return {...notes,start:value};}
 if(field==='clear')return notes.start?{start:notes.start}:undefined;
 if(!Number.isFinite(gameTime)||gameTime<0)throw Error('进入本局后再确认兵线；助手不自动读取兵线位置');
 if(notes.lane&&(!Number.isFinite(notes.at)||gameTime<notes.at||gameTime-notes.at>90))notes={...(notes.start?{start:notes.start}:{}),lane:notes.lane};
 if(field==='lane'){if(!lanes.includes(value))throw Error('路线不正确');return {...(notes.start?{start:notes.start}:{}),lane:value,at:gameTime};}
 if(!fields.includes(field)||!notes.lane)throw Error('先选一条要自己观察的路线');
 return {...notes,at:notes.at??gameTime,[field]:!notes[field]};
}
export function jungleGuidance({champion,role,mode,patch,live,notes,combo}={}){
 if(role!=='jungle'||mode!=='rift')return null;
 const checked=validateJungleNotes(notes)||{},start=checked.start||'blue';
 const full=start==='blue'?['蓝BUFF','魔沼蛙','三狼','锋喙鸟','红BUFF','石甲虫']:['红BUFF','石甲虫','锋喙鸟','三狼','蓝BUFF','魔沼蛙'];
 const special=champion==='Ivern',early=new Set(['LeeSin','XinZhao','JarvanIV','Elise','RekSai','Shaco']).has(champion);
 const opening=special?['蓝BUFF画圈；需要时惩戒释放','魔沼蛙、三狼画圈','转另一半区画圈','回收已成熟且安全的营地','石甲虫按状态与成熟情况补']:
 full;
 const mechanics=champion==='Nocturne'?'Q覆盖营地后在影径穿插普攻，被动帮助范围清野与续航；6级前优先经验，明显有队友控制的近处机会再考虑抓。':champion==='Diana'?'技能后穿插普攻，W贴营地吸收伤害，Q覆盖多目标；6级R解锁后才按拉拽团战找多人配合。':special?'翠神靠被动画圈与成熟释放野怪，不套普通攻击六营路线；画圈消耗生命与法力，惩戒用于立即释放，成熟以游戏内显示为准。':early?'前三营后可检查邻近兵线：队友能接控制且目标压出时再考虑抓；没有窗口就接着清野，不在草里长等。':'先完成同半区营地，再检查邻近兵线；没有可靠机会就沿另一半区刷到等级与回城节点。';
 const fresh=live?.matched===true&&Number.isFinite(live.gameTime)&&Number.isFinite(checked.at)&&live.gameTime>=checked.at&&live.gameTime-checked.at<=90;
 const validQueue=live?.mapId===11&&[400,420,430,440].includes(live?.queueId),stale=patch!==JUNGLE_GUIDANCE_PATCH;
 const hp=live?.stats?.maxHp>0&&Number.isFinite(live?.stats?.hp)?live.stats.hp/live.stats.maxHp:null;
 const low=hp!==null&&hp<.4,unlearnedR=['Nocturne','Diana','Fiddlesticks','Evelynn'].includes(champion)&&!(live?.skills?.R>0);
 const ready=!!(fresh&&checked.pushed&&checked.follow&&checked.control&&checked.safe&&hp!==null&&!low&&!stale&&validQueue);
 const choices=[{id:'farm',title:'继续刷野 / 补给',text:low?'自身生命不足四成：先考虑补给或安全营地；有续航也要核对法力和敌方动向。':unlearnedR?'大招尚未学会：优先保住经验节奏，已确认的近处好机会再考虑抓。':'没有确认的近处机会时，刷同侧安全营地并计划回城；不为等待抓人让整片营地空转。'},
 {id:'gank',title:ready?`${labels[checked.lane]}可比较抓人机会`:'抓人条件待核对',text:ready?`${labels[checked.lane]}：你刚确认敌方压出、队友能跟、有可靠控制和安全进退。可与继续刷野比较；${unlearnedR?'当前仍没有R，不按6级连招进场。':'进场前自己确认技能就绪。'}目标缩回、队友回城或入口被看见就取消。`:'在地图上自己检查敌方是否压出、队友血蓝与兵线、控制能否接上、进退路线；不能仅凭阵容或击杀数指定要抓哪条路。'},
 {id:'resource',title:'资源 / 反蹲',text:'邻线先推、自己惩戒与队友支援都确认后再比较开资源；对方多人未露面时先保退路。反蹲依据游戏内实际看到的动向，不根据计时猜敌方位置。'}];
 return {patch:JUNGLE_GUIDANCE_PATCH,stale,notes:checked,fresh,opening,start:special?null:start,special,mechanics,choices,ready,
  combo:combo?.ownJob||null,sources:JUNGLE_SOURCES[champion]||[],
  caution:'开局顺序是可调整的机制参考，没有16.20最优清野时间证据。兵线条件由你确认，90秒后作废；助手不读取敌方坐标、视野、施法或实际冷却。'};
}
