// B5e完工v6纯回放冻结：只调整内部导入路径，移除存储代码。
import {restore as restoreV2,type SaveData as V2Save} from '../legacy-v2/restore.ts';
import {restore as restoreV3,type SaveData as V3Save} from '../legacy-v3/restore.ts';
import {restore as restoreV4,type SaveData as V4Save} from '../legacy-v4/restore.ts';
import {restore as restoreV5,type SaveData as V5Save} from '../legacy-v5/restore.ts';
import {replay,applyCommand,stepDay,type GameState,type LoggedCommand,type ReportState} from './index.ts';
import {BUILDING_PRODUCTS,BUILDING_VARIANTS,CONTRACTORS} from './types.ts';
import{rebuildLegacyReports}from'./legacy-reports.ts';

export const SAVE_KEY='fdc-save-v1'; // 原键保持；回放成功前不覆盖原档。
export interface SaveData {version:6;seed:number;day:number;log:LoggedCommand[];legacyUntil?:number;legacyLogCount?:number;legacyV2Until?:number;legacyV2LogCount?:number;legacyV3Until?:number;legacyV3LogCount?:number;legacyV4Until?:number;legacyV4LogCount?:number;legacyV5Until?:number;legacyV5LogCount?:number;revision:number}
export function validateSave(value:unknown):SaveData|null {
 if(!value||typeof value!=='object')return null;
 const s=value as SaveData,version=(value as {version?:unknown}).version;
 if(version!==undefined&&version!==2&&version!==3&&version!==4&&version!==5&&version!==6)return null;
 if(!Number.isInteger(s.seed)||!Number.isInteger(s.day)||s.day<0||!Array.isArray(s.log))return null;
 let last=0;
 for(const item of s.log){
  if(!item||!Number.isInteger(item.day)||item.day<last||item.day>s.day||!item.command||typeof item.command.type!=='string')return null;
  const cmd=item.command;
  if(!['bid','borrow','repay','setPace','setPrice','setPaper','cooperate','divert','filePrice','extend','sellProject','setAppearance','startProject','setMarketing'].includes(cmd.type))return null;
  if(cmd.type==='setMarketing'&&(!Number.isFinite(cmd.rate)||typeof cmd.projectId!=='string'))return null;
  if(cmd.type==='startProject'&&(!CONTRACTORS.includes(cmd.contractor)||typeof cmd.projectId!=='string'))return null;
  if(cmd.type==='setAppearance'&&(!BUILDING_PRODUCTS.includes(cmd.product)||!BUILDING_VARIANTS.includes(cmd.variant)||typeof cmd.projectId!=='string'))return null;
  if('amount'in cmd&&(!Number.isFinite(cmd.amount)||cmd.amount<=0))return null;
  if(cmd.type==='borrow'&&!['devLoan','trust','hidden','paper'].includes(cmd.channel))return null;
  if(cmd.type==='setPrice'&&!Number.isFinite(cmd.priceFactor))return null;
  if(cmd.type==='setPaper'&&typeof cmd.enabled!=='boolean')return null;
  last=item.day;
 }
 const normalized:SaveData={...s,version:6,revision:Number.isFinite(s.revision)?s.revision:0,
  ...(version===undefined?{legacyUntil:s.day,legacyLogCount:s.log.length}:{}),
  ...(version===undefined||version===2?{legacyV2Until:s.day,legacyV2LogCount:s.log.length}:{}),
  ...(version===undefined||version===2||version===3?{legacyV3Until:s.day,legacyV3LogCount:s.log.length}:{}),
  ...(version===undefined||version===2||version===3||version===4?{legacyV4Until:s.day,legacyV4LogCount:s.log.length}:{}),
  ...(version!==6?{legacyV5Until:s.day,legacyV5LogCount:s.log.length}:{})};
 const markers=[[normalized.legacyUntil,normalized.legacyLogCount],[normalized.legacyV2Until,normalized.legacyV2LogCount],[normalized.legacyV3Until,normalized.legacyV3LogCount],[normalized.legacyV4Until,normalized.legacyV4LogCount],[normalized.legacyV5Until,normalized.legacyV5LogCount]];
 let previousUntil=-1,previousCount=-1;
 for(const[until,count]of markers){
  if(until===undefined&&count===undefined)continue;
  if(until===undefined||count===undefined||!Number.isInteger(until)||until<0||until>s.day||!Number.isInteger(count)||count<0||count>s.log.length)return null;
  if(s.log.slice(0,count).some(x=>x.day>until)||s.log.slice(count).some(x=>x.day<until))return null;
  if(until<previousUntil||count<previousCount)return null;
  previousUntil=until;previousCount=count;
 }
 if(normalized.legacyUntil!==undefined&&normalized.legacyV2Until!==undefined&&(normalized.legacyUntil>normalized.legacyV2Until||normalized.legacyLogCount!>normalized.legacyV2LogCount!))return null;
 return normalized;
}
export function restore(s:SaveData):GameState {
 const until=s.legacyV5Until??s.legacyV4Until??s.legacyV3Until??s.legacyV2Until??s.legacyUntil,count=s.legacyV5LogCount??s.legacyV4LogCount??s.legacyV3LogCount??s.legacyV2LogCount??s.legacyLogCount;
 if(until===undefined)return replay(s.seed,s.log,s.day);
 const prior={...s,version:s.legacyV5Until!==undefined?5:s.legacyV4Until!==undefined?4:s.legacyV3Until!==undefined?3:2,day:until,log:s.log.slice(0,count)};
 const state=(s.legacyV5Until!==undefined?restoreV5(prior as unknown as V5Save):s.legacyV4Until!==undefined?restoreV4(prior as unknown as V4Save):s.legacyV3Until!==undefined?restoreV3(prior as unknown as V3Save):restoreV2(prior as unknown as V2Save)) as unknown as GameState;
 let reports:ReportState|undefined,reportError:string|undefined;
 try{reports=rebuildLegacyReports(s,state);}catch(error){reportError=error instanceof Error?error.message:'历史统计回溯未完成';}
 applyCommand(state,{type:'upgradeRules',reports,reportError});
 let k=count!;
 while(state.day<=s.day){
  while(k<s.log.length&&s.log[k].day===state.day){const r=applyCommand(state,s.log[k++].command);if(!r.ok)throw Error('存档指令无法回放');}
  if(state.day===s.day)break;
  if(state.status==='bankrupt')throw Error('存档日期超过破产日期');
  stepDay(state);
 }
 state.pauses=[];return state;
}
