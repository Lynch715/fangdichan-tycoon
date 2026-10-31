import {validateSessionOptions} from './sim/sessionConfig.ts';
import{restore as restoreV15,type SaveData as V15Save}from'./legacy-v15/restore.ts';
import {defaultConfig,newGame,replay,applyCommand,stepDay,computeMetrics,type GameState,type LoggedCommand} from './sim/index.ts';
import {BUILDING_PRODUCTS,BUILDING_VARIANTS,CONTRACTORS,STAFF_POSTS} from './sim/types.ts';
import {restore as restoreOriginal,type SaveData as OriginalSave} from './legacy-v16-original/restore.ts';
import {restore as restoreTurns,type SaveData as TurnsSave} from './legacy-v16-turns/restore.ts';

export const SAVE_KEY='fdc-save-v1'; // 原键保持；回放成功前不覆盖原档。
export const CURRENT_SAVE_KEY='fdc-save-v17';
export const RULES_REVISION='turns-2421210' as const;
export const RECOVERY_PROFILES=['original-683b717','turns-2421210'] as const;
export type RecoveryProfile=typeof RECOVERY_PROFILES[number];
export interface V16History {profile:RecoveryProfile;untilDay:number;logCount:number}
export interface SaveData {version:16|17;rulesRevision?:typeof RULES_REVISION;legacyV16?:V16History;seed:number;day:number;log:LoggedCommand[];legacyUntil?:number;legacyLogCount?:number;legacyV2Until?:number;legacyV2LogCount?:number;legacyV3Until?:number;legacyV3LogCount?:number;legacyV4Until?:number;legacyV4LogCount?:number;legacyV5Until?:number;legacyV5LogCount?:number;legacyV6Until?:number;legacyV6LogCount?:number;legacyV7Until?:number;legacyV7LogCount?:number;legacyV8Until?:number;legacyV8LogCount?:number;legacyV9Until?:number;legacyV9LogCount?:number;legacyV10Until?:number;legacyV10LogCount?:number;legacyV11Until?:number;legacyV11LogCount?:number;legacyV12Until?:number;legacyV12LogCount?:number;legacyV13Until?:number;legacyV13LogCount?:number;legacyV14Until?:number;legacyV14LogCount?:number;legacyV15Until?:number;legacyV15LogCount?:number;revision:number}
function validateLegacy(value:unknown):SaveData|null {
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
  if(!['startGame','sandboxGrant','strategicInvestment','restructureDebt','bid','borrow','repay','setPace','setPrice','setPaper','cooperate','divert','filePrice','extend','sellProject','setAppearance','startProject','setMarketing','acquireProject','hireStaff','fireStaff','assignStaff'].includes(cmd.type))return null;
  if(['hireStaff','fireStaff','assignStaff'].includes(cmd.type)&&version!==16)return null;
  if(cmd.type==='hireStaff'&&(typeof cmd.candidateId!=='string'||!cmd.candidateId))return null;
  if((cmd.type==='fireStaff'||cmd.type==='assignStaff')&&(typeof cmd.staffId!=='string'||!cmd.staffId))return null;
  if(cmd.type==='assignStaff'&&cmd.post!==null){
   const post=cmd.post;if(!post||typeof post!=='object'||!STAFF_POSTS.includes(post.slot))return null;
   if(post.slot==='pm'||post.slot==='salesLead'){if(!('projectId'in post)||typeof post.projectId!=='string'||!post.projectId)return null;}
   else if('projectId'in post)return null;
  }
  if(cmd.type==='startProject'&&cmd.product!==undefined&&!BUILDING_PRODUCTS.includes(cmd.product))return null;
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

/** 格式17以明确规则标识区分历史；未标识的v16必须经过恢复预览。 */
export function validateSave(value:unknown):SaveData|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const raw=value as Record<string,unknown>,v=raw.version;
 if(v===17&&raw.rulesRevision!==RULES_REVISION)return null;
 if(raw.rulesRevision!==undefined&&raw.rulesRevision!==RULES_REVISION)return null;
 if(v!==17&&raw.legacyV16!==undefined)return null;
 const parsed=validateLegacy(v===17?{...raw,version:16}:raw);if(!parsed)return null;
 if(v===17){
  parsed.version=17;parsed.rulesRevision=RULES_REVISION;
  if(raw.legacyV16!==undefined){
   const h=raw.legacyV16 as V16History;
   if(!h||!RECOVERY_PROFILES.includes(h.profile)||!Number.isInteger(h.untilDay)||h.untilDay<0||h.untilDay>parsed.day||!Number.isInteger(h.logCount)||h.logCount<0||h.logCount>parsed.log.length)return null;
   if(parsed.log.slice(0,h.logCount).some(x=>x.day>h.untilDay)||parsed.log.slice(h.logCount).some(x=>x.day<h.untilDay))return null;
   if((parsed.legacyV15Until??0)>h.untilDay||(parsed.legacyV15LogCount??0)>h.logCount)return null;
   parsed.legacyV16={profile:h.profile,untilDay:h.untilDay,logCount:h.logCount};
  }
 }else if(v!==16){parsed.rulesRevision=RULES_REVISION;}
 return parsed;
}
export const requiresV16Recovery=(s:SaveData)=>s.version===16&&s.rulesRevision===undefined;
/** 仅同一规则、同一历史边界下的单向续玩可以普通覆盖；分支、倒档或换局先归档。 */
export function isContinuation(previous:unknown,next:SaveData):boolean{
 const old=validateSave(previous);
 if(!old||old.version!==17||old.seed!==next.seed||old.rulesRevision!==next.rulesRevision||old.day>next.day||old.log.length>next.log.length)return false;
 try{
  const markers=(s:SaveData)=>Object.fromEntries(Object.entries(s).filter(([key])=>/^legacy/.test(key)).sort(([a],[b])=>a.localeCompare(b)));
  return JSON.stringify(markers(old))===JSON.stringify(markers(next))&&old.log.every((item,i)=>JSON.stringify(item)===JSON.stringify(next.log[i]));
 }catch{return false;}
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
export const PROFILE_LABELS:Record<RecoveryProfile,string>={
 'original-683b717':'原实时版（10月26日）',
 'turns-2421210':'回合制员工版（10月29日）',
};
export interface RecoveryPreview {profile:RecoveryProfile;label:string;cash?:number;equity?:number;error?:string}
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

export const DATABASE_KEY='current-v17';
function database():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open('fdc-saves',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('saves');
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  req.onblocked=()=>reject(new Error('存档数据库被占用'));
 });
}
/** 保留原始记录，区分不存在与无效，不能把校验失败压成null。 */
export async function readDatabaseRaw(key=DATABASE_KEY):Promise<unknown>{
 const db=await database();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('saves');const req=tx.objectStore('saves').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onabort=()=>reject(tx.error);});}
 finally{db.close();}
}
export async function readDatabase():Promise<SaveData|null>{return validateSave(await readDatabaseRaw());}
let backupSequence=0;
export async function writeDatabase(s:SaveData,preservePrevious=false,original?:PreservedRecord):Promise<void>{
 const db=await database();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('saves','readwrite'),store=tx.objectStore('saves'),req=store.get(DATABASE_KEY);
  req.onsuccess=()=>{
   const old:unknown=req.result;
   if(old!==undefined&&(preservePrevious||!isContinuation(old,s))){
    // add不覆盖任何已有备份；同事务失败时也不会替换当前记录。
    store.add({source:DATABASE_KEY,value:old},`preserved:${Date.now()}:${backupSequence++}:${Math.random()}`);
   }
   if(original)store.add({source:original.source,value:original.raw},`preserved:${Date.now()}:${backupSequence++}:${Math.random()}`);
   store.put(s,DATABASE_KEY);
  };
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
export const PRESERVED_PREFIX='fdc-preserved-';
/** 不覆盖已有原档；即使hash冲突也为不同原文另找键。 */
export function preserveRaw(source:string,raw:string,store:Pick<Storage,'getItem'|'setItem'>=localStorage):boolean{
 try{
  let hash=2166136261;for(let i=0;i<raw.length;i++)hash=Math.imul(hash^raw.charCodeAt(i),16777619);
  const base=PRESERVED_PREFIX+source+'-'+(hash>>>0).toString(16);
  for(let n=0;;n++){
   const key=base+(n?'-'+n:''),existing=store.getItem(key);
   if(existing===raw)return true;
   if(existing===null){store.setItem(key,raw);return store.getItem(key)===raw;}
  }
 }catch{return false;}
}
export function rawText(value:unknown):string|null{
 if(typeof value==='string')return value;
 try{return value===undefined?null:JSON.stringify(value);}catch{return null;}
}
export interface PreservedRecord {source:string;raw:string}
function exportableBackup(source:string,raw:string):PreservedRecord{
 try{const slot=JSON.parse(raw);if(typeof slot?.data==='string')return{source,raw:slot.data};}catch{/* 损坏原件仍可导出 */}
 return{source,raw};
}
export function readLocalPreserved():PreservedRecord[]{
 const out:PreservedRecord[]=[];
 try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(PRESERVED_PREFIX))continue;const raw=localStorage.getItem(key);if(raw!==null)out.push(exportableBackup(`历史本地备份 ${out.length+1}`,raw));}}catch{/* 导出主档不依赖备份列表 */}
 return out;
}
export async function readDatabasePreserved():Promise<PreservedRecord[]>{
 const db=await database();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('saves'),store=tx.objectStore('saves'),keys=store.getAllKeys(),values=store.getAll();
  tx.oncomplete=()=>{
   const out:PreservedRecord[]=[];
   keys.result.forEach((key,i)=>{if(typeof key!=='string'||!key.startsWith('preserved:'))return;const raw=rawText(values.result[i]?.value);if(raw!==null)out.push(exportableBackup(`历史数据库备份 ${out.length+1}`,raw));});resolve(out);
  };
  tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
}
export function readLocal(){try{return validateSave(JSON.parse(localStorage.getItem(CURRENT_SAVE_KEY)??localStorage.getItem(SAVE_KEY)??'null'));}catch{return null;}}
export const freshState=()=>newGame(Math.floor(Math.random()*2**31));
