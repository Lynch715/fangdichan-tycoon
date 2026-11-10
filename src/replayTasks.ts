import {replay,type GameState} from './sim/index.ts';
import {MAX_SAVE_BYTES,validateSave,requiresV16Recovery,type SaveData,type RecoveryPreview,type RecoveryProfile} from './saveData.ts';
export interface ReplayInput {raw?:string;save?:SaveData;profile?:RecoveryProfile}
export type ReplayOutcome={kind:'ready';save:SaveData;state:GameState}|{kind:'recovery';save:SaveData;previews:RecoveryPreview[]};

/** 仅在 Worker 或受控脚本中调用。现代档无需下载冻结内核。 */
export async function runReplayTask(input:ReplayInput):Promise<ReplayOutcome>{
 let value:unknown=input.save;
 if(input.raw!==undefined){
  if(input.raw.length>MAX_SAVE_BYTES||new TextEncoder().encode(input.raw).byteLength>MAX_SAVE_BYTES)throw new Error('存档超过32MB，未读取');
  try{value=JSON.parse(input.raw);}catch{throw new Error('存档不是有效JSON');}
 }
 const save=validateSave(value);if(!save)throw new Error('存档格式无效，或日期/日志超出安全范围');
 if(requiresV16Recovery(save)||save.legacyV16||save.legacyV15Until!==undefined){
  const historical=await import('./saveReplay.ts');
  if(requiresV16Recovery(save)&&!input.profile)return{kind:'recovery',save,previews:historical.previewV16(save)};
  const selected=input.profile?historical.recoverV16(save,input.profile):save;
  return{kind:'ready',save:selected,state:historical.restore(selected)};
 }
 if(input.profile)throw new Error('此存档不需要选择历史版本');
 return{kind:'ready',save,state:replay(save.seed,save.log,save.day)};
}
