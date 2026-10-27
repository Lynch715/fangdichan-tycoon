// B2完工version=3纯回放冻结，仅调整导入路径及移除存储代码。
import {restore as restoreV2,type SaveData as V2Save} from '../legacy-v2/restore.ts';
import {replay,applyCommand,stepDay,type GameState,type LoggedCommand} from './index.ts';
import {BUILDING_PRODUCTS,BUILDING_VARIANTS} from './types.ts';

export const SAVE_KEY='fdc-save-v1'; // 原键保持；回放成功前不覆盖原档。
export interface SaveData {version:3;seed:number;day:number;log:LoggedCommand[];legacyUntil?:number;legacyLogCount?:number;legacyV2Until?:number;legacyV2LogCount?:number;revision:number}
export function validateSave(value:unknown):SaveData|null {
 if(!value||typeof value!=='object')return null;
 const s=value as SaveData,version=(value as {version?:unknown}).version;
 if(version!==undefined&&version!==2&&version!==3)return null;
 if(!Number.isInteger(s.seed)||!Number.isInteger(s.day)||s.day<0||!Array.isArray(s.log))return null;
 let last=0;
 for(const item of s.log){
  if(!item||!Number.isInteger(item.day)||item.day<last||item.day>s.day||!item.command||typeof item.command.type!=='string')return null;
  const cmd=item.command;
  if(!['bid','borrow','repay','setPace','setPrice','setPaper','cooperate','divert','filePrice','extend','sellProject','setAppearance'].includes(cmd.type))return null;
  if(cmd.type==='setAppearance'&&(!BUILDING_PRODUCTS.includes(cmd.product)||!BUILDING_VARIANTS.includes(cmd.variant)||typeof cmd.projectId!=='string'))return null;
  if('amount'in cmd&&(!Number.isFinite(cmd.amount)||cmd.amount<=0))return null;
  if(cmd.type==='borrow'&&!['devLoan','trust','hidden','paper'].includes(cmd.channel))return null;
  if(cmd.type==='setPrice'&&!Number.isFinite(cmd.priceFactor))return null;
  if(cmd.type==='setPaper'&&typeof cmd.enabled!=='boolean')return null;
  last=item.day;
 }
 const normalized:SaveData={...s,version:3,revision:Number.isFinite(s.revision)?s.revision:0,
  ...(version===undefined?{legacyUntil:s.day,legacyLogCount:s.log.length}:{}),
  ...(version!==3?{legacyV2Until:s.day,legacyV2LogCount:s.log.length}:{})};
 const markers=[[normalized.legacyUntil,normalized.legacyLogCount],[normalized.legacyV2Until,normalized.legacyV2LogCount]];
 for(const[until,count]of markers){
  if(until===undefined&&count===undefined)continue;
  if(until===undefined||count===undefined||!Number.isInteger(until)||until<0||until>s.day||!Number.isInteger(count)||count<0||count>s.log.length)return null;
  if(s.log.slice(0,count).some(x=>x.day>until)||s.log.slice(count).some(x=>x.day<until))return null;
 }
 if(normalized.legacyUntil!==undefined&&normalized.legacyV2Until!==undefined&&(normalized.legacyUntil>normalized.legacyV2Until||normalized.legacyLogCount!>normalized.legacyV2LogCount!))return null;
 return normalized;
}
export function restore(s:SaveData):GameState {
 const until=s.legacyV2Until??s.legacyUntil,count=s.legacyV2LogCount??s.legacyLogCount;
 if(until===undefined)return replay(s.seed,s.log,s.day);
 const prior={version:2,seed:s.seed,day:until,log:s.log.slice(0,count),legacyUntil:s.legacyUntil,legacyLogCount:s.legacyLogCount,revision:s.revision} as unknown as V2Save;
 const state=restoreV2(prior) as unknown as GameState;
 applyCommand(state,{type:'upgradeRules'});
 let k=count!;
 while(state.day<=s.day){
  while(k<s.log.length&&s.log[k].day===state.day){const r=applyCommand(state,s.log[k++].command);if(!r.ok)throw Error('存档指令无法回放');}
  if(state.day===s.day)break;
  if(state.status==='bankrupt')throw Error('存档日期超过破产日期');
  stepDay(state);
 }
 state.pauses=[];return state;
}
