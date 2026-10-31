// 回合制循环；持久化使用独立v17键，旧自动档永不被升级写入覆盖。
import {applyCommand,defaultConfig,stepDay,type Command,type CommandResult,type GameState,type LoggedCommand,type PauseReason,type SessionOptions} from './sim/index.ts';
import {SAVE_KEY,CURRENT_SAVE_KEY,DATABASE_KEY,RULES_REVISION,freshState,readDatabaseRaw,writeDatabase,restore,validateSave,isContinuation,requiresV16Recovery,previewV16,recoverV16,preserveRaw,rawText,type SaveData,type RecoveryProfile,type RecoveryPreview} from './save.ts';
export interface TurnResult {fromDay:number;toDay:number;alerts:PauseReason[]}
interface RawRecord {source:string;raw:string;save:SaveData|null}
export interface RecoveryRequest {raw:string;source:string;save:SaveData;previews:RecoveryPreview[];automatic:boolean}
const bankrupt=(s:GameState)=>s.status==='bankrupt';
const legacyKeys=['legacy',...Array.from({length:14},(_,i)=>'legacyV'+(i+2))];
function historyOf(save:SaveData):Partial<SaveData>{
 const out:Record<string,unknown>={};
 for(const key of legacyKeys)for(const suffix of ['Until','LogCount'])if((save as unknown as Record<string,unknown>)[key+suffix]!==undefined)out[key+suffix]=(save as unknown as Record<string,unknown>)[key+suffix];
 if(save.legacyV16)out.legacyV16=structuredClone(save.legacyV16);
 return out;
}
function record(source:string,value:unknown,local=false):RawRecord|null{
 if(value===undefined||local&&value===null)return null;
 const raw=rawText(value);if(raw===null)return{source,raw:'原始记录不能导出为JSON；请保留浏览器数据库，不要清理存储。',save:null};
 let parsed:unknown=value;
 if(local){try{parsed=JSON.parse(raw);}catch{parsed=null;}}
 return{source,raw,save:validateSave(parsed)};
}
export class Game {
 state:GameState=freshState();
 log:LoggedCommand[]=[];
 lastTurn:TurnResult|null=null;
 storageStatus='存档准备中';
 loadError=false;
 recovery:RecoveryRequest|null=null;
 private originals:RawRecord[]=[];
 private history:Partial<SaveData>={};
 private revision=0;
 private writes:Promise<void>=Promise.resolve();
 private replacementGeneration=0;
 private pendingPreserve:number|null=null;
 private originalBackup:{source:string;raw:string}|null=null;
 private listeners:(()=>void)[]=[];
 get config(){return this.state.rules??defaultConfig;}
 get needsSetup(){return !this.loadError&&!this.recovery&&this.state.day===0&&!this.state.session;}
 get turn(){return Math.floor(this.state.day/this.config.time.daysPerMonth)+1;}
 private adopt(saved:SaveData,state=restore(saved)){
  this.state=state;this.log=structuredClone(saved.log);this.history=historyOf(saved);this.revision=Math.max(this.revision,saved.revision);this.lastTurn=null;this.loadError=false;this.recovery=null;
 }
 private requestRecovery(saved:SaveData,raw:string,source:string,automatic:boolean){
  this.recovery={save:saved,raw,source,previews:previewV16(saved),automatic};
  if(automatic)this.loadError=true;
  this.storageStatus='旧v16存档需核对历史版本，原始存档未覆盖';
 }
 async init(){
  const rows:RawRecord[]=[];
  for(const [key,source]of [[CURRENT_SAVE_KEY,'本地v17自动档'],[SAVE_KEY,'本地旧自动档']]){
   try{const r=record(source,localStorage.getItem(key),true);if(r)rows.push(r);}catch{/* 本地备份不可用仍可读主档 */}
  }
  for(const [key,source]of [[DATABASE_KEY,'数据库v17主档'],['current','数据库旧主档']]){
   try{const r=record(source,await readDatabaseRaw(key));if(r)rows.push(r);}catch{this.storageStatus='数据库不可用，使用本地备份';}
  }
  this.originals=rows;
  // 新格式已存在时不能因损坏而悄悄倒退到更旧进度。
  const modern=rows.filter(x=>x.source.includes('v17')),available=modern.length?modern:rows;
  const valid=available.filter((x):x is RawRecord&{save:SaveData}=>x.save!==null).sort((a,b)=>b.save.revision-a.save.revision);
  if(modern.length&&valid.length>1&&valid.some(x=>!isContinuation(x.save,valid[0].save))){
   this.loadError=true;this.storageStatus='主档与备份进度冲突，原件均已保留；请在存档页核对并读取副本';return;
  }
  for(const r of valid){
   if(requiresV16Recovery(r.save)){this.requestRecovery(r.save,r.raw,r.source,true);return;}
   try{this.adopt(r.save);this.state.pauses=[];this.save();return;}catch{/* 仍保留原记录 */}
  }
  if(rows.length){this.loadError=true;this.storageStatus='旧档读取失败，原始记录保留；请导出原档或使用恢复入口';}
 }
 onChange(fn:()=>void){this.listeners.push(fn);}
 private emit(){this.listeners.forEach(fn=>fn());}
 issue(command:Command):CommandResult{
  if(this.loadError||this.recovery)return{ok:false,error:'请先处理旧档恢复或导出原档'};
  const r=applyCommand(this.state,command,this.config);
  if(r.ok){this.log.push({day:this.state.day,command:structuredClone(command)});this.state.pauses=[];this.save();}
  this.emit();return r;
 }
 endTurn():CommandResult{
  if(this.loadError||this.recovery)return{ok:false,error:'请先处理旧档恢复或导出原档'};
  if(this.needsSetup)return{ok:false,error:'请先完成开局设置'};
  if(this.state.status==='bankrupt')return{ok:false,error:'公司已破产清算'};
  const from=this.state.day,dpm=this.config.time.daysPerMonth,target=(Math.floor(from/dpm)+1)*dpm,alerts=new Set<PauseReason>();
  while(this.state.day<target&&!bankrupt(this.state)){
   stepDay(this.state,this.config);for(const reason of this.state.pauses)alerts.add(reason);this.state.pauses=[];
  }
  this.lastTurn={fromDay:from,toDay:this.state.day,alerts:[...alerts]};this.save();this.emit();return{ok:true};
 }
 /** 替换当前局前备份新格式的本地原文；IDB在写入事务中原子备份。 */
 private prepareReplacement():boolean{
  try{const raw=localStorage.getItem(CURRENT_SAVE_KEY);if(raw!==null&&!preserveRaw('自动档',raw))return false;}catch{/* 不能访问的localStorage也不会被写入 */}
  this.pendingPreserve=++this.replacementGeneration;return true;
 }
 restart(options?:SessionOptions):CommandResult{
  const next=freshState();if(options){const r=applyCommand(next,{type:'startGame',options});if(!r.ok)return r;}
  if(!this.prepareReplacement())return{ok:false,error:'原存档备份空间不足，请先导出原档；当前进度未替换'};
  this.state=next;this.log=options?[{day:0,command:{type:'startGame',options:structuredClone(options)}}]:[];
  this.history={};this.lastTurn=null;this.loadError=false;this.recovery=null;this.state.pauses=[];this.save();this.emit();return{ok:true};
 }
 data():SaveData{return{...this.history,version:17,rulesRevision:RULES_REVISION,seed:this.state.seed,day:this.state.day,log:structuredClone(this.log),revision:++this.revision};}
 save(){
  if(this.loadError||this.recovery||this.needsSetup)return;
  const data=this.data(),generation=this.pendingPreserve,original=this.originalBackup;let backup=false;
  try{
   const previous=localStorage.getItem(CURRENT_SAVE_KEY);
   let continuation=false;if(previous!==null){try{continuation=isContinuation(JSON.parse(previous),data);}catch{/* 损坏原文必须先留档 */}}
   const originalSafe=!original||preserveRaw('导入原件',original.raw);
   if(originalSafe&&(previous===null||continuation&&generation===null||preserveRaw('自动档',previous))){localStorage.setItem(CURRENT_SAVE_KEY,JSON.stringify(data));backup=true;if(this.originalBackup===original)this.originalBackup=null;}
  }catch{/* IDB仍可独立保存；旧键不动 */}
  this.writes=this.writes.then(()=>writeDatabase(data,generation!==null,original??undefined)).then(()=>{
   if(this.pendingPreserve===generation)this.pendingPreserve=null;
   if(this.originalBackup===original)this.originalBackup=null;
   if(!this.loadError&&!this.recovery){this.storageStatus='已保存 · IndexedDB（v17）';this.emit();}
  }).catch(()=>{if(!this.loadError&&!this.recovery){this.storageStatus=backup?'已保存到本地备份（v17）':'存档失败，原记录保留，请导出当前进度';this.emit();}});
 }
 importSave(raw:string):CommandResult{
  try{
   const saved=validateSave(JSON.parse(raw));if(!saved)return{ok:false,error:'存档格式无效，当前进度已保留'};
   if(requiresV16Recovery(saved)){this.requestRecovery(saved,raw,'导入的旧v16存档',false);this.emit();return{ok:false,error:'请在恢复预览中核对历史版本，原档和当前进度均未替换'};}
   const state=restore(saved);
   if(!this.prepareReplacement())return{ok:false,error:'原存档备份空间不足，请先导出原档；当前进度未替换'};
   this.originalBackup={source:'导入原档',raw};this.adopt(saved,state);this.save();this.emit();return{ok:true};
  }catch{return{ok:false,error:'存档无法回放，当前进度已保留'};}
 }
 confirmRecovery(profile:RecoveryProfile):CommandResult{
  const pending=this.recovery;if(!pending)return{ok:false,error:'没有待恢复的存档'};
  try{
   const saved=recoverV16(pending.save,profile),state=restore(saved);
   if(!this.prepareReplacement())return{ok:false,error:'备份空间不足，请先导出原档；尚未替换进度'};
   this.originalBackup={source:pending.source,raw:pending.raw};this.adopt(saved,state);this.save();this.emit();return{ok:true};
  }catch{return{ok:false,error:'该历史版本无法恢复此档，原始记录和当前进度均已保留'};}
 }
 cancelRecovery(){
  if(this.recovery?.automatic){this.recovery=null;this.loadError=true;this.storageStatus='原始旧档已保留，尚未确认恢复；可在存档页重新打开';}
  else{this.recovery=null;this.storageStatus='已取消恢复，当前进度已保留';}
  this.emit();
 }
 reopenRecovery():boolean{
  if(this.recovery)return true;
  const original=this.originals.filter(x=>x.save&&requiresV16Recovery(x.save)).sort((a,b)=>b.save!.revision-a.save!.revision)[0];
  if(!original)return false;this.requestRecovery(original.save!,original.raw,original.source,this.loadError);return true;
 }
 exportOriginals():{source:string;raw:string}[]{
  if(this.recovery)return[{source:this.recovery.source,raw:this.recovery.raw},...this.originals.filter(x=>x.raw!==this.recovery!.raw).map(x=>({source:x.source,raw:x.raw}))];
  return this.originals.map(x=>({source:x.source,raw:x.raw}));
 }
 exportSave(){
  if(this.loadError||this.recovery)return this.recovery?.raw??this.originals.find(x=>x.source.includes('v17'))?.raw??this.originals[0]?.raw??'{}';
  return JSON.stringify(this.data(),null,2);
 }
}
