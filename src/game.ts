// 回合制循环（一回合 = 一个游戏月）、指令日志与持久化；旧版种子日志由冻结的 v1 内核回放后接入新规则。
import { applyCommand, defaultConfig, stepDay, type Command, type CommandResult, type GameState, type LoggedCommand, type PauseReason,type SessionOptions } from './sim/index.ts';
import { SAVE_KEY, freshState, readDatabase, readLocal, restore, writeDatabase, validateSave, type SaveData } from './save.ts';
/** 一回合的结果：起止日与回合内触发、需要玩家处理的提醒（原自动暂停原因）。 */
export interface TurnResult {fromDay:number;toDay:number;alerts:PauseReason[]}
const bankrupt=(s:GameState)=>s.status==='bankrupt';
export class Game {
  state: GameState = freshState();
  log: LoggedCommand[] = [];
  /** 最近一次结束回合的结果，供回合简报读取；不进存档。 */
  lastTurn: TurnResult | null = null;
  storageStatus = '存档准备中';
  loadError = false;
  private listeners: (()=>void)[]=[];
  private legacyUntil?:number;
  private legacyLogCount?:number;
  private legacyV2Until?:number;
  private legacyV2LogCount?:number;
  private legacyV3Until?:number;
  private legacyV3LogCount?:number;
  private legacyV4Until?:number;
  private legacyV4LogCount?:number;
  private legacyV5Until?:number;
  private legacyV5LogCount?:number;
  private legacyV6Until?:number;
  private legacyV6LogCount?:number;
  private legacyV7Until?:number;
  private legacyV7LogCount?:number;
  private legacyV8Until?:number;
  private legacyV8LogCount?:number;
  private legacyV9Until?:number;
  private legacyV9LogCount?:number;
  private legacyV10Until?:number;
  private legacyV10LogCount?:number;
  private legacyV11Until?:number;
  private legacyV11LogCount?:number;
  private legacyV12Until?:number;
  private legacyV12LogCount?:number;
  private legacyV13Until?:number;
  private legacyV13LogCount?:number;
  private legacyV14Until?:number;
  private legacyV14LogCount?:number;
  private legacyV15Until?:number;
  private legacyV15LogCount?:number;
  private revision=0;
  private writes: Promise<void> = Promise.resolve();
  get config(){return this.state.rules??defaultConfig;}
  get needsSetup(){return !this.loadError&&this.state.day===0&&!this.state.session;}
  async init() {
    const local=readLocal(); let db:SaveData|null=null;
    let rawExists=false,originalLocal:string|null=null;try{originalLocal=localStorage.getItem(SAVE_KEY);rawExists=originalLocal!==null;}catch{/* unavailable */}
    try {db=await readDatabase();} catch {this.storageStatus='数据库不可用，使用本地备份';}
    const choices=[local,db].filter((x):x is SaveData=>x!==null).sort((a,b)=>b.revision-a.revision);
    for(const saved of choices) {
      try {this.state=restore(saved);this.log=saved.log;this.legacyUntil=saved.legacyUntil;this.legacyLogCount=saved.legacyLogCount;this.legacyV2Until=saved.legacyV2Until;this.legacyV2LogCount=saved.legacyV2LogCount;this.legacyV3Until=saved.legacyV3Until;this.legacyV3LogCount=saved.legacyV3LogCount;this.legacyV4Until=saved.legacyV4Until;this.legacyV4LogCount=saved.legacyV4LogCount;this.legacyV5Until=saved.legacyV5Until;this.legacyV5LogCount=saved.legacyV5LogCount;this.legacyV6Until=saved.legacyV6Until;this.legacyV6LogCount=saved.legacyV6LogCount;this.legacyV7Until=saved.legacyV7Until;this.legacyV7LogCount=saved.legacyV7LogCount;this.legacyV8Until=saved.legacyV8Until;this.legacyV8LogCount=saved.legacyV8LogCount;this.legacyV9Until=saved.legacyV9Until;this.legacyV9LogCount=saved.legacyV9LogCount;this.legacyV10Until=saved.legacyV10Until;this.legacyV10LogCount=saved.legacyV10LogCount;this.legacyV11Until=saved.legacyV11Until;this.legacyV11LogCount=saved.legacyV11LogCount;this.legacyV12Until=saved.legacyV12Until;this.legacyV12LogCount=saved.legacyV12LogCount;this.legacyV13Until=saved.legacyV13Until;this.legacyV13LogCount=saved.legacyV13LogCount;this.legacyV14Until=saved.legacyV14Until;this.legacyV14LogCount=saved.legacyV14LogCount;this.legacyV15Until=saved.legacyV15Until;this.legacyV15LogCount=saved.legacyV15LogCount;this.revision=saved.revision;this.loadError=false;break;}
      catch {this.loadError=true;}
    }
    // 无法回放的档案不自动覆盖，允许导出原始备份。
    if(rawExists && !local && !db)this.loadError=true;
    if(this.loadError) {this.storageStatus='旧档读取失败，原始备份保留；可导出或重新开始';return;}
    // 成功迁移后留一份原始JSON，便于核对；失败路径在上方返回，不覆盖。
    if(originalLocal){try{const old=JSON.parse(originalLocal);if(old.version!==this.state.version||(old.legacyV12Until===undefined&&this.legacyV12Until!==undefined))localStorage.setItem('fdc-backup-before-migration',originalLocal);}catch{/* optional backup */}}
    this.state.pauses=[];this.save();
  }
  onChange(fn:()=>void){this.listeners.push(fn);}
  private emit(){this.listeners.forEach(fn=>fn());}
  /** 当前回合序号（从 1 起）：第 N 个游戏月。 */
  get turn(){return Math.floor(this.state.day/this.config.time.daysPerMonth)+1;}
  issue(command:Command):CommandResult {
    if(this.loadError)return {ok:false,error:'请先导出旧档或重新开始'};
    const r=applyCommand(this.state,command,this.config);
    if(r.ok){this.log.push({day:this.state.day,command:structuredClone(command)});this.state.pauses=[];this.save();}
    this.emit();return r;
  }
  /**
   * 结束回合：一口气推进到下一个月末结算（季节事件在月末抽取，下回合生效），破产即停。
   * 原实时制的自动暂停原因收集为本回合提醒，不再打断推进。
   */
  endTurn():CommandResult {
    if(this.loadError)return {ok:false,error:'请先导出旧档或重新开始'};
    if(this.needsSetup)return {ok:false,error:'请先完成开局设置'};
    if(this.state.status==='bankrupt')return {ok:false,error:'公司已破产清算'};
    const dpm=this.config.time.daysPerMonth,from=this.state.day,target=(Math.floor(from/dpm)+1)*dpm,alerts=new Set<PauseReason>();
    while(this.state.day<target&&!bankrupt(this.state)){
      stepDay(this.state,this.config);
      for(const p of this.state.pauses)alerts.add(p);
      this.state.pauses=[];
    }
    this.lastTurn={fromDay:from,toDay:this.state.day,alerts:[...alerts]};
    this.save();this.emit();
    return {ok:true};
  }
  restart(options?:SessionOptions):CommandResult {
    const next=freshState();
    if(options){const result=applyCommand(next,{type:'startGame',options});if(!result.ok)return result;}
    try{const old=localStorage.getItem(SAVE_KEY);if(old)localStorage.setItem('fdc-backup-before-restart',old);}catch{/* optional backup */}
    this.state=next;this.log=[];this.lastTurn=null;this.legacyUntil=undefined;this.legacyLogCount=undefined;this.legacyV2Until=undefined;this.legacyV2LogCount=undefined;this.legacyV3Until=undefined;this.legacyV3LogCount=undefined;this.legacyV4Until=undefined;this.legacyV4LogCount=undefined;this.legacyV5Until=undefined;this.legacyV5LogCount=undefined;this.legacyV6Until=undefined;this.legacyV6LogCount=undefined;this.legacyV7Until=undefined;this.legacyV7LogCount=undefined;this.legacyV8Until=undefined;this.legacyV8LogCount=undefined;this.legacyV9Until=undefined;this.legacyV9LogCount=undefined;this.legacyV10Until=undefined;this.legacyV10LogCount=undefined;this.legacyV11Until=undefined;this.legacyV11LogCount=undefined;this.legacyV12Until=undefined;this.legacyV12LogCount=undefined;this.legacyV13Until=undefined;this.legacyV13LogCount=undefined;this.legacyV14Until=undefined;this.legacyV14LogCount=undefined;this.legacyV15Until=undefined;this.legacyV15LogCount=undefined;this.loadError=false;if(options)this.log=[{day:0,command:{type:'startGame',options:structuredClone(options)}}];this.state.pauses=[];this.save();this.emit();return {ok:true};}
  data():SaveData {return {version:16,seed:this.state.seed,day:this.state.day,log:structuredClone(this.log),legacyUntil:this.legacyUntil,legacyLogCount:this.legacyLogCount,legacyV2Until:this.legacyV2Until,legacyV2LogCount:this.legacyV2LogCount,legacyV3Until:this.legacyV3Until,legacyV3LogCount:this.legacyV3LogCount,legacyV4Until:this.legacyV4Until,legacyV4LogCount:this.legacyV4LogCount,legacyV5Until:this.legacyV5Until,legacyV5LogCount:this.legacyV5LogCount,legacyV6Until:this.legacyV6Until,legacyV6LogCount:this.legacyV6LogCount,legacyV7Until:this.legacyV7Until,legacyV7LogCount:this.legacyV7LogCount,legacyV8Until:this.legacyV8Until,legacyV8LogCount:this.legacyV8LogCount,legacyV9Until:this.legacyV9Until,legacyV9LogCount:this.legacyV9LogCount,legacyV10Until:this.legacyV10Until,legacyV10LogCount:this.legacyV10LogCount,legacyV11Until:this.legacyV11Until,legacyV11LogCount:this.legacyV11LogCount,legacyV12Until:this.legacyV12Until,legacyV12LogCount:this.legacyV12LogCount,legacyV13Until:this.legacyV13Until,legacyV13LogCount:this.legacyV13LogCount,legacyV14Until:this.legacyV14Until,legacyV14LogCount:this.legacyV14LogCount,legacyV15Until:this.legacyV15Until,legacyV15LogCount:this.legacyV15LogCount,revision:++this.revision};}
  save(){
    if(this.loadError||this.needsSetup)return;
    const data=this.data(); let backup=false;
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(data));backup=true;}catch{/* IDB remains primary. */}
    this.writes=this.writes.then(()=>writeDatabase(data)).then(()=>{this.storageStatus='已保存 · IndexedDB';this.emit();}).catch(()=>{this.storageStatus=backup?'已保存到本地备份':'存档失败，请导出备份';this.emit();});
  }
  importSave(raw:string):CommandResult {
    try {
      const saved=validateSave(JSON.parse(raw));if(!saved)return {ok:false,error:'存档格式无效'};
      const restored=restore(saved);
      try{const old=localStorage.getItem(SAVE_KEY);if(old)localStorage.setItem('fdc-backup-before-import',old);}catch{/* optional backup */}
      this.state=restored;this.log=saved.log;this.legacyUntil=saved.legacyUntil;this.legacyLogCount=saved.legacyLogCount;this.legacyV2Until=saved.legacyV2Until;this.legacyV2LogCount=saved.legacyV2LogCount;this.legacyV3Until=saved.legacyV3Until;this.legacyV3LogCount=saved.legacyV3LogCount;this.legacyV4Until=saved.legacyV4Until;this.legacyV4LogCount=saved.legacyV4LogCount;this.legacyV5Until=saved.legacyV5Until;this.legacyV5LogCount=saved.legacyV5LogCount;this.legacyV6Until=saved.legacyV6Until;this.legacyV6LogCount=saved.legacyV6LogCount;this.legacyV7Until=saved.legacyV7Until;this.legacyV7LogCount=saved.legacyV7LogCount;this.legacyV8Until=saved.legacyV8Until;this.legacyV8LogCount=saved.legacyV8LogCount;this.legacyV9Until=saved.legacyV9Until;this.legacyV9LogCount=saved.legacyV9LogCount;this.legacyV10Until=saved.legacyV10Until;this.legacyV10LogCount=saved.legacyV10LogCount;this.legacyV11Until=saved.legacyV11Until;this.legacyV11LogCount=saved.legacyV11LogCount;this.legacyV12Until=saved.legacyV12Until;this.legacyV12LogCount=saved.legacyV12LogCount;this.legacyV13Until=saved.legacyV13Until;this.legacyV13LogCount=saved.legacyV13LogCount;this.legacyV14Until=saved.legacyV14Until;this.legacyV14LogCount=saved.legacyV14LogCount;this.legacyV15Until=saved.legacyV15Until;this.legacyV15LogCount=saved.legacyV15LogCount;this.lastTurn=null;this.loadError=false;this.save();this.emit();return {ok:true};
    }catch{return {ok:false,error:'存档无法回放，当前进度已保留'};}
  }
  exportSave(){return this.loadError ? localStorage.getItem(SAVE_KEY) ?? '{}' : JSON.stringify(this.data(),null,2);}
}
