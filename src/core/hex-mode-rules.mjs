const support='https://support.riotgames.com/en-us/league-of-legends/events/league-of-legends-aram-mayhem-game-mode';
const update='https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-21-notes/';
const headliners=[['unknown','本局机制未确认'],['kda','K/DA'],['heartsteel','HEARTSTEEL'],['true-damage','True Damage'],['pentakill','Pentakill'],['disco','Disco'],['cafe-cuties','Cafe Cuties'],['bees','Bees'],['command-line','Command Line']];
const notes={kda:'集齐4张K/DA卡后有额外强化；不视为第五次常规抽取。',heartsteel:'强化可附带修饰效果，具体数值以本局卡牌为准。','true-damage':'参与击杀或摧毁防御塔可能为队伍掉落铁砧；不算额外强化池。',pentakill:'开局与18级可增强一项技能；技能增强与普通强化分开。',disco:'在迪斯科球下跳舞可为所有人获得金币；不改变常规选择次数。','cafe-cuties':'治疗圣物效果增强；没有已确认的额外强化池。',bees:'收集蜂蜜并避开地图上的蜜蜂；没有已确认的额外强化池。','command-line':'每次选择可重随机一项至更高稀有度；升阶选项需另核对。'};

// Versioned acquisition rules, separate from hero fit and observed picks.
// No live endpoint currently confirms a Headliner, so never infer one from
// champion, inventory, music or a previous game's manual preview.
export function hexAcquisitionRules({patch,mechanism='unknown'}={}){
 if(!['16.20','16.21'].includes(patch))return {patch,pending:true,mechanism:'unknown',choices:[],stages:[],paths:[],note:'本补丁获取规则待核对，不沿用旧版四次池。',sources:[support,update]};
 const modern=patch==='16.21',known=modern&&headliners.some(([id])=>id===mechanism),selected=known?mechanism:'unknown';
 const stages=Array.from({length:4},(_,i)=>({id:i+1,label:'第 '+(i+1)+' 次',kind:'regular'}));
 const paths=[...stages];
 if(selected==='kda')paths.push({id:'extra-kda',label:'K/DA 额外',kind:'extra',condition:'集齐4张K/DA卡后额外获得强化。'});
 if(selected==='command-line')paths.push({id:'upgrade-reroll',label:'升阶重随',kind:'reroll',condition:'每次选择可将一项强化重随机为更高稀有度。'});
 const note=notes[selected]||(modern?'本局主秀未由接口确认；可手动预览。任务解锁和额外获取与常规选择分别核对。':'当前版本按常规四次选择核对；随机转化、赠予等额外来源分别看条件。');
 return {patch,pending:false,mechanism:selected,choices:modern?headliners:[],stages,paths,upgradeReroll:selected==='command-line',modifiedEffects:selected==='heartsteel',missionUnlocks:modern,note,sources:modern?[support,update]:[support]};
}
