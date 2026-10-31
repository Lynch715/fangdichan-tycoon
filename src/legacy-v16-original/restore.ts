// Frozen historical replay. Storage APIs intentionally excluded.
import {validateSessionOptions} from './sessionConfig.ts';
import{restore as restoreV15,type SaveData as V15Save}from'../legacy-v15/restore.ts';
import {defaultConfig,replay,applyCommand,stepDay,type GameState,type LoggedCommand} from './index.ts';
import {BUILDING_PRODUCTS,BUILDING_VARIANTS,CONTRACTORS} from './types.ts';

export const SAVE_KEY='fdc-save-v1'; // 原键保持；回放成功前不覆盖原档。
export interface SaveData {version:16;seed:number;day:number;log:LoggedCommand[];legacyUntil?:number;legacyLogCount?:number;legacyV2Until?:number;legacyV2LogCount?:number;legacyV3Until?:number;legacyV3LogCount?:number;legacyV4Until?:number;legacyV4LogCount?:number;legacyV5Until?:number;legacyV5LogCount?:number;legacyV6Until?:number;legacyV6LogCount?:number;legacyV7Until?:number;legacyV7LogCount?:number;legacyV8Until?:number;legacyV8LogCount?:number;legacyV9Until?:number;legacyV9LogCount?:number;legacyV10Until?:number;legacyV10LogCount?:number;legacyV11Until?:number;legacyV11LogCount?:number;legacyV12Until?:number;legacyV12LogCount?:number;legacyV13Until?:number;legacyV13LogCount?:number;legacyV14Until?:number;legacyV14LogCount?:number;legacyV15Until?:number;legacyV15LogCount?:number;revision:number}
export function validateSave(value:unknown):SaveData|null {
 if(!value||typeof value!=='object')return null;
 const s=value as SaveData,version=(value as {version?:unknown}).version;
 if(version!==undefined&&version!==2&&version!==3&&version!==4&&version!==5&&version!==6&&version!==7&&version!==8&&version!==9&&version!==10&&version!==11&&version!==12&&version!==13&&version!==14&&version!==15&&version!==16)return null;
 if(!Number.isInteger(s.seed)||!Number.isInteger(s.day)||s.day<0||!Array.isArray(s.log))return null;
 let last=0;
 for(const item of s.log){
  if(!item||!Number.isInteger(item.day)||item.day<last||item.day>s.day||!item.command||typeof item.command.type!=='string')return null;
  const cmd=item.command;
  if(cmd.type==='startGame'&&((version!==15&&version!==16)||item!==s.log[0]||item.day!==0||!validateSessionOptions(cmd.options)))return null;
  if(cmd.type==='sandboxGrant'&&version!==15&&version!==16)return null;
  if(!['startGame','sandboxGrant','strategicInvestment','restructureDebt','bid','borrow','repay','setPace','setPrice','setPaper','cooperate','divert','filePrice','extend','sellProject','setAppearance','startProject','setMarketing','acquireProject'].includes(cmd.type))return null;
  if(cmd.type==='strategicInvestment'&&(!Number.isFinite(cmd.share)||!defaultConfig.capitalRescue.strategic.shares.includes(cmd.share)))return null;
  if(cmd.type==='bid'&&cmd.amenityRate!==undefined&&(!Number.isFinite(cmd.amenityRate)||cmd.amenityRate<0))return null;
  if(cmd.type==='acquireProject'&&(typeof cmd.rivalId!=='string'||typeof cmd.projectId!=='string'))return null;
  if(cmd.type==='setMarketing'&&(!Number.isFinite(cmd.rate)||typeof cmd.projectId!=='string'))return null;
  if(cmd.type==='startProject'&&(!CONTRACTORS.includes(cmd.contractor)||typeof cmd.projectId!=='string'))return null;
  if(cmd.type==='setAppearance'&&(!BUILDING_PRODUCTS.includes(cmd.product)||!BUILDING_VARIANTS.includes(cmd.variant)||typeof cmd.projectId!=='string'))return null;
  if('amount'in cmd&&(!Number.isFinite(cmd.amount)||cmd.amount<=0))return null;
  if(cmd.type==='borrow'&&!['devLoan','trust','hidden','paper','bond'].includes(cmd.channel))return null;
  if(cmd.type==='borrow'&&cmd.termMonths!==undefined&&(cmd.channel!=='bond'||!Number.isInteger(cmd.termMonths)||!defaultConfig.finance.bond.termsMonths.includes(cmd.termMonths)))return null;
  if(cmd.type==='setPrice'&&!Number.isFinite(cmd.priceFactor))return null;
  if(cmd.type==='setPaper'&&typeof cmd.enabled!=='boolean')return null;
  last=item.day;
 }
 const normalized:SaveData={...s,version:16,revision:Number.isFinite(s.revision)?s.revision:0,
  ...(version===undefined?{legacyUntil:s.day,legacyLogCount:s.log.length}:{}),
  ...(version===undefined||version===2?{legacyV2Until:s.day,legacyV2LogCount:s.log.length}:{}),
  ...(version===undefined||version===2||version===3?{legacyV3Until:s.day,legacyV3LogCount:s.log.length}:{}),
  ...(version===undefined||version===2||version===3||version===4?{legacyV4Until:s.day,legacyV4LogCount:s.log.length}:{}),
  ...(version!==6&&version!==7&&version!==8&&version!==9&&version!==10&&version!==11&&version!==12&&version!==13&&version!==14&&version!==15&&version!==16?{legacyV5Until:s.day,legacyV5LogCount:s.log.length}:{}),
  ...(version!==7&&version!==8&&version!==9&&version!==10&&version!==11&&version!==12&&version!==13&&version!==14&&version!==15&&version!==16?{legacyV6Until:s.day,legacyV6LogCount:s.log.length}:{}),
  ...(version!==8&&version!==9&&version!==10&&version!==11&&version!==12&&version!==13&&version!==14&&version!==15&&version!==16?{legacyV7Until:s.day,legacyV7LogCount:s.log.length}:{}),
  ...(version!==9&&version!==10&&version!==11&&version!==12&&version!==13&&version!==14&&version!==15&&version!==16?{legacyV8Until:s.day,legacyV8LogCount:s.log.length}:{}),
  ...(version!==10&&version!==11&&version!==12&&version!==13&&version!==14&&version!==15&&version!==16?{legacyV9Until:s.day,legacyV9LogCount:s.log.length}:{}),
  ...(version!==11&&version!==12&&version!==13&&version!==14&&version!==15&&version!==16?{legacyV10Until:s.day,legacyV10LogCount:s.log.length}:{}),
  ...(version!==12&&version!==13&&version!==14&&version!==15&&version!==16?{legacyV11Until:s.day,legacyV11LogCount:s.log.length}:{}),
  ...(version!==13&&version!==14&&version!==15&&version!==16?{legacyV12Until:s.day,legacyV12LogCount:s.log.length}:{}),
  ...(version!==14&&version!==15&&version!==16?{legacyV13Until:s.day,legacyV13LogCount:s.log.length}:{}),
  ...(version!==15&&version!==16?{legacyV14Until:s.day,legacyV14LogCount:s.log.length}:{}),
  ...(version!==16?{legacyV15Until:s.day,legacyV15LogCount:s.log.length}:{})};
 // 开发热更新曾产生仅升级版本号、遗漏新边界的档案。仅在上一边界已
 // 覆盖整个日期和全部日志时，缺失区间可确定为空；有后续经营则仍拒绝。
 if(version===12&&normalized.legacyV11Until===undefined&&normalized.legacyV11LogCount===undefined&&s.legacyV10Until===s.day&&s.legacyV10LogCount===s.log.length){normalized.legacyV11Until=s.day;normalized.legacyV11LogCount=s.log.length;}
 if(version===13&&normalized.legacyV12Until===undefined&&normalized.legacyV12LogCount===undefined&&s.legacyV11Until===s.day&&s.legacyV11LogCount===s.log.length){normalized.legacyV12Until=s.day;normalized.legacyV12LogCount=s.log.length;}
 const markers=[[normalized.legacyUntil,normalized.legacyLogCount],[normalized.legacyV2Until,normalized.legacyV2LogCount],[normalized.legacyV3Until,normalized.legacyV3LogCount],[normalized.legacyV4Until,normalized.legacyV4LogCount],[normalized.legacyV5Until,normalized.legacyV5LogCount],[normalized.legacyV6Until,normalized.legacyV6LogCount],[normalized.legacyV7Until,normalized.legacyV7LogCount],[normalized.legacyV8Until,normalized.legacyV8LogCount],[normalized.legacyV9Until,normalized.legacyV9LogCount],[normalized.legacyV10Until,normalized.legacyV10LogCount],[normalized.legacyV11Until,normalized.legacyV11LogCount],[normalized.legacyV12Until,normalized.legacyV12LogCount],[normalized.legacyV13Until,normalized.legacyV13LogCount],[normalized.legacyV14Until,normalized.legacyV14LogCount],[normalized.legacyV15Until,normalized.legacyV15LogCount]];
 let previousUntil=-1,previousCount=-1;
 for(const[until,count]of markers){
  if(until===undefined&&count===undefined)continue;
  if(until===undefined||count===undefined||!Number.isInteger(until)||until<0||until>s.day||!Number.isInteger(count)||count<0||count>s.log.length)return null;
  if(s.log.slice(0,count).some(x=>x.day>until)||s.log.slice(count).some(x=>x.day<until))return null;
  if(until<previousUntil||count<previousCount)return null;
  previousUntil=until;previousCount=count;
 }
 if(normalized.legacyV6Until===undefined&&markers.slice(0,5).some(([until])=>until!==undefined))return null;
 if(normalized.legacyV7Until===undefined&&markers.slice(0,6).some(([until])=>until!==undefined))return null;
 if(normalized.legacyV8Until===undefined&&markers.slice(0,7).some(([until])=>until!==undefined))return null;
 if(normalized.legacyV9Until===undefined&&markers.slice(0,8).some(([until])=>until!==undefined))return null;
 if(normalized.legacyV10Until===undefined&&markers.slice(0,9).some(([until])=>until!==undefined))return null;
 if(normalized.legacyUntil!==undefined&&normalized.legacyV2Until!==undefined&&(normalized.legacyUntil>normalized.legacyV2Until||normalized.legacyLogCount!>normalized.legacyV2LogCount!))return null;
 if(normalized.legacyV11Until===undefined&&markers.slice(0,10).some(([until])=>until!==undefined))return null;
 if(normalized.legacyV12Until===undefined&&markers.slice(0,11).some(([until])=>until!==undefined))return null;
 if(normalized.legacyV13Until===undefined&&markers.slice(0,12).some(([until])=>until!==undefined))return null;
 if(normalized.legacyV14Until===undefined&&markers.slice(0,13).some(([until])=>until!==undefined))return null;
 if(normalized.legacyV15Until===undefined&&markers.slice(0,14).some(([until])=>until!==undefined))return null;
 if(normalized.legacyV14Until!==undefined&&s.log.some(x=>x.command.type==='startGame'))return null;
 if(normalized.legacyV15Until!==undefined&&s.log.some((x,i)=>x.command.type==='startGame'&&i>=normalized.legacyV15LogCount!))return null;
 return normalized;
}
export function restore(s:SaveData):GameState {
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
