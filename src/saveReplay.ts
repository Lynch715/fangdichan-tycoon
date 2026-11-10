// 同步回放入口供脚本与历史回归使用；浏览器仅在独立线程中按需加载。
import{restore as restoreV15,type SaveData as V15Save}from'./legacy-v15/restore.ts';
import{restore as restoreOriginal,type SaveData as OriginalSave}from'./legacy-v16-original/restore.ts';
import{restore as restoreTurns,type SaveData as TurnsSave}from'./legacy-v16-turns/restore.ts';
import{replay,applyCommand,stepDay,computeMetrics,type GameState}from'./sim/index.ts';
import{RULES_REVISION,RECOVERY_PROFILES,PROFILE_LABELS,requiresV16Recovery,type SaveData,type RecoveryProfile,type RecoveryPreview}from'./saveData.ts';
function restoreCurrent(s:SaveData):GameState {
 const until=s.legacyV15Until,count=s.legacyV15LogCount;
 if(until===undefined)return replay(s.seed,s.log,s.day);
 const state=restoreV15({...s,version:15,day:until,log:s.log.slice(0,count)} as unknown as V15Save) as unknown as GameState;
 applyCommand(state,{type:'upgradeRules'});
 let k=count!;
 while(state.day<=s.day){
  while(k<s.log.length&&s.log[k].day===state.day){const r=applyCommand(state,s.log[k++].command);if(!r.ok)throw Error('存档指令无法回放');}
  if(state.day===s.day)break;if(state.status==='bankrupt')throw Error('存档日期超过破产日期');stepDay(state);
 }
 state.pauses=[];return state;
}

function frozenV16(s:SaveData,profile:RecoveryProfile):GameState {
 const raw={...s,version:16};
 return (profile==='original-683b717'?restoreOriginal(raw as unknown as OriginalSave):restoreTurns(raw as unknown as TurnsSave)) as unknown as GameState;
}
export function restore(s:SaveData):GameState {
 if(requiresV16Recovery(s))throw new Error('旧v16存档需要核对历史版本；原档未改写');
 const h=s.legacyV16;if(!h)return restoreCurrent(s);
 const state=frozenV16({...s,day:h.untilDay,log:s.log.slice(0,h.logCount)},h.profile);
 applyCommand(state,{type:'upgradeRecoveredV16'});
 let k=h.logCount;
 while(state.day<=s.day){
  while(k<s.log.length&&s.log[k].day===state.day){const r=applyCommand(state,s.log[k++].command);if(!r.ok)throw new Error('存档指令无法回放：'+r.error);}
  if(state.day===s.day)break;
  if(state.status==='bankrupt')throw new Error('存档日期超过破产日期');stepDay(state);
 }
 state.pauses=[];return state;
}
export function previewV16(s:SaveData):RecoveryPreview[]{
 return RECOVERY_PROFILES.map(profile=>{
  try{const state=frozenV16(s,profile);const m=computeMetrics(state);return{profile,label:PROFILE_LABELS[profile],cash:state.cash,equity:m.equity};}
  catch{return{profile,label:PROFILE_LABELS[profile],error:'这套历史规则无法完整回放该档，请勿选用'};}
 });
}
export function recoverV16(s:SaveData,profile:RecoveryProfile):SaveData {
 if(!requiresV16Recovery(s)||!RECOVERY_PROFILES.includes(profile))throw new Error('历史版本选择无效');
 // 先完整回放确认可读，再固定同日指令边界；不是快照，不重写原日志。
 frozenV16(s,profile);
 return {...s,version:17,rulesRevision:RULES_REVISION,legacyV16:{profile,untilDay:s.day,logCount:s.log.length}};
}
