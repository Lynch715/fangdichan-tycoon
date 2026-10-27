// B6全部完工v8冻结：仅调整内部导入路径并移除存储API。
import{restore as restoreV7,type SaveData as V7Save}from'../legacy-v7/restore.ts';
import {replay,applyCommand,stepDay,type GameState,type LoggedCommand} from './index.ts';
import {BUILDING_PRODUCTS,BUILDING_VARIANTS,CONTRACTORS} from './types.ts';

export const SAVE_KEY='fdc-save-v1'; // 原键保持；回放成功前不覆盖原档。
export interface SaveData {version:8;seed:number;day:number;log:LoggedCommand[];legacyUntil?:number;legacyLogCount?:number;legacyV2Until?:number;legacyV2LogCount?:number;legacyV3Until?:number;legacyV3LogCount?:number;legacyV4Until?:number;legacyV4LogCount?:number;legacyV5Until?:number;legacyV5LogCount?:number;legacyV6Until?:number;legacyV6LogCount?:number;legacyV7Until?:number;legacyV7LogCount?:number;revision:number}
export function validateSave(value:unknown):SaveData|null {
 if(!value||typeof value!=='object')return null;
 const s=value as SaveData,version=(value as {version?:unknown}).version;
 if(version!==undefined&&version!==2&&version!==3&&version!==4&&version!==5&&version!==6&&version!==7&&version!==8)return null;
 if(!Number.isInteger(s.seed)||!Number.isInteger(s.day)||s.day<0||!Array.isArray(s.log))return null;
 let last=0;
 for(const item of s.log){
  if(!item||!Number.isInteger(item.day)||item.day<last||item.day>s.day||!item.command||typeof item.command.type!=='string')return null;
  const cmd=item.command;
  if(!['bid','borrow','repay','setPace','setPrice','setPaper','cooperate','divert','filePrice','extend','sellProject','setAppearance','startProject','setMarketing','acquireProject'].includes(cmd.type))return null;
  if(cmd.type==='acquireProject'&&(typeof cmd.rivalId!=='string'||typeof cmd.projectId!=='string'))return null;
  if(cmd.type==='setMarketing'&&(!Number.isFinite(cmd.rate)||typeof cmd.projectId!=='string'))return null;
  if(cmd.type==='startProject'&&(!CONTRACTORS.includes(cmd.contractor)||typeof cmd.projectId!=='string'))return null;
  if(cmd.type==='setAppearance'&&(!BUILDING_PRODUCTS.includes(cmd.product)||!BUILDING_VARIANTS.includes(cmd.variant)||typeof cmd.projectId!=='string'))return null;
  if('amount'in cmd&&(!Number.isFinite(cmd.amount)||cmd.amount<=0))return null;
  if(cmd.type==='borrow'&&!['devLoan','trust','hidden','paper'].includes(cmd.channel))return null;
  if(cmd.type==='setPrice'&&!Number.isFinite(cmd.priceFactor))return null;
  if(cmd.type==='setPaper'&&typeof cmd.enabled!=='boolean')return null;
  last=item.day;
 }
 const normalized:SaveData={...s,version:8,revision:Number.isFinite(s.revision)?s.revision:0,
  ...(version===undefined?{legacyUntil:s.day,legacyLogCount:s.log.length}:{}),
  ...(version===undefined||version===2?{legacyV2Until:s.day,legacyV2LogCount:s.log.length}:{}),
  ...(version===undefined||version===2||version===3?{legacyV3Until:s.day,legacyV3LogCount:s.log.length}:{}),
  ...(version===undefined||version===2||version===3||version===4?{legacyV4Until:s.day,legacyV4LogCount:s.log.length}:{}),
  ...(version!==6&&version!==7&&version!==8?{legacyV5Until:s.day,legacyV5LogCount:s.log.length}:{}),
  ...(version!==7&&version!==8?{legacyV6Until:s.day,legacyV6LogCount:s.log.length}:{}),
  ...(version!==8?{legacyV7Until:s.day,legacyV7LogCount:s.log.length}:{})};
 const markers=[[normalized.legacyUntil,normalized.legacyLogCount],[normalized.legacyV2Until,normalized.legacyV2LogCount],[normalized.legacyV3Until,normalized.legacyV3LogCount],[normalized.legacyV4Until,normalized.legacyV4LogCount],[normalized.legacyV5Until,normalized.legacyV5LogCount],[normalized.legacyV6Until,normalized.legacyV6LogCount],[normalized.legacyV7Until,normalized.legacyV7LogCount]];
 let previousUntil=-1,previousCount=-1;
 for(const[until,count]of markers){
  if(until===undefined&&count===undefined)continue;
  if(until===undefined||count===undefined||!Number.isInteger(until)||until<0||until>s.day||!Number.isInteger(count)||count<0||count>s.log.length)return null;
  if(s.log.slice(0,count).some(x=>x.day>until)||s.log.slice(count).some(x=>x.day<until))return null;
  if(until<previousUntil||count<previousCount)return null;
  previousUntil=until;previousCount=count;
 }
 if(normalized.legacyV6Until===undefined&&markers.slice(0,5).some(([until])=>until!==undefined))return null;
 if(normalized.legacyV7Until===undefined&&markers.slice(0,-1).some(([until])=>until!==undefined))return null;
 if(normalized.legacyUntil!==undefined&&normalized.legacyV2Until!==undefined&&(normalized.legacyUntil>normalized.legacyV2Until||normalized.legacyLogCount!>normalized.legacyV2LogCount!))return null;
 return normalized;
}
export function restore(s:SaveData):GameState {
 const until=s.legacyV7Until,count=s.legacyV7LogCount;
 if(until===undefined)return replay(s.seed,s.log,s.day);
 const state=restoreV7({...s,version:7,day:until,log:s.log.slice(0,count)} as unknown as V7Save) as unknown as GameState;
 applyCommand(state,{type:'upgradeRules'});
 let k=count!;
 while(state.day<=s.day){
  while(k<s.log.length&&s.log[k].day===state.day){const r=applyCommand(state,s.log[k++].command);if(!r.ok)throw Error('存档指令无法回放');}
  if(state.day===s.day)break;if(state.status==='bankrupt')throw Error('存档日期超过破产日期');stepDay(state);
 }
 state.pauses=[];return state;
}
