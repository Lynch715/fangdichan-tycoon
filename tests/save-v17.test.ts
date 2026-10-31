import {afterEach,describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../src/game.ts';
import {CURRENT_SAVE_KEY,SAVE_KEY,DATABASE_KEY,RULES_REVISION,validateSave,restore,recoverV16,previewV16,preserveRaw,writeDatabase} from '../src/save.ts';
import {computeMetrics,payroll,newGame,applyCommand,stepDay,defaultConfig} from '../src/sim/index.ts';
import {estimateRunway} from '../src/estimates/runway.ts';
import {readSlot,writeSlot,slotMeta} from '../src/ui/saves.ts';
import original from './fixtures/v16-original-year1.json';
import aggressive from './fixtures/v16-original-aggressive.json';
import {restore as originalRestore,type SaveData as OriginalSave} from '../src/legacy-v16-original/restore.ts';

class Storage {
 data=new Map<string,string>();fail=false;
 getItem(k:string){return this.data.get(k)??null;}
 setItem(k:string,v:string){if(this.fail)throw Error('quota');this.data.set(k,v);}
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,5));
function storage(){const store=new Storage();vi.stubGlobal('localStorage',store);vi.stubGlobal('indexedDB',undefined);return store;}
/** 原子提交的内存IDB适配器，仅用于损坏主档/回写保护；不接触浏览器。 */
function database(initial:Record<string,unknown>={}){
 const records=new Map(Object.entries(initial));let writes=0;let fail=false;
 const db={close(){},transaction(_name:string,mode?:string){
  const draft=new Map(records),tx:any={};let pending=0,scheduled=false,aborted=false;
  const schedule=()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(pending||aborted)return;if(mode==='readwrite'){records.clear();for(const x of draft)records.set(...x);}tx.oncomplete?.();});};
  const request=(fn:()=>unknown)=>{const req:any={};pending++;queueMicrotask(()=>{if(aborted)return;try{req.result=fn();req.onsuccess?.();}catch(e){aborted=true;tx.error=e;req.onerror?.();tx.onabort?.();}finally{pending--;schedule();}});return req;};
  tx.objectStore=()=>({
   get:(key:string)=>request(()=>draft.get(key)),
   put:(value:unknown,key:string)=>request(()=>{if(fail)throw Error('quota');writes++;draft.set(key,structuredClone(value));return key;}),
   add:(value:unknown,key:string)=>request(()=>{if(fail||draft.has(key))throw Error('quota or duplicate');draft.set(key,structuredClone(value));return key;}),
  });return tx;
 }};
 vi.stubGlobal('indexedDB',{open(){const req:any={};queueMicrotask(()=>{req.result=db;req.onsuccess?.();});return req;}});
 return{records,get writes(){return writes;},fail(value=true){fail=value;}};
}
afterEach(()=>vi.unstubAllGlobals());

describe('员工存档与格式17',()=>{
 it('签约、任命、撤岗、解雇、跨人才刷新后可导出、手动槽读取及自动续档',async()=>{
  const store=storage(),g=new Game();expect(g.restart({mode:'career',difficulty:'standard'}).ok).toBe(true);
  const x=g.state.staff!.pool[0];expect(g.issue({type:'hireStaff',candidateId:x.id}).ok).toBe(true);
  expect(g.issue({type:'assignStaff',staffId:x.id,post:{slot:'cfo'}}).ok).toBe(true);
  expect(g.endTurn().ok).toBe(true);
  expect(g.issue({type:'assignStaff',staffId:x.id,post:null}).ok).toBe(true);
  expect(g.issue({type:'fireStaff',staffId:x.id}).ok).toBe(true);
  g.endTurn();g.endTurn();const y=g.state.staff!.pool[0];expect(g.issue({type:'hireStaff',candidateId:y.id}).ok).toBe(true);
  const raw=g.exportSave(),data=validateSave(JSON.parse(raw))!;expect(data.version).toBe(17);expect(data.rulesRevision).toBe(RULES_REVISION);
  expect(restore(data)).toEqual(g.state);
  expect(writeSlot(1,slotMeta(g.config,g.state,raw),store)).toBe(true);
  const loaded=new Game();expect(loaded.importSave(readSlot(1,store)!.data).ok).toBe(true);expect(loaded.state).toEqual(g.state);
  const automatic=new Game();await automatic.init();expect(automatic.loadError).toBe(false);expect(automatic.state).toEqual(g.state);
 });
 it('v16员工档可校验、预览并恢复为回合制副本，原JSON不改',()=>{
  storage();const g=new Game();g.restart({mode:'career',difficulty:'standard'});
  const x=g.state.staff!.pool[0];g.issue({type:'hireStaff',candidateId:x.id});g.issue({type:'assignStaff',staffId:x.id,post:{slot:'pr'}});g.endTurn();
  const saved=JSON.parse(g.exportSave());saved.version=16;delete saved.rulesRevision;const raw=JSON.stringify(saved);
  const recovery=new Game();expect(recovery.importSave(raw).ok).toBe(false);expect(recovery.recovery).not.toBeNull();
  expect(recovery.recovery!.previews.find(x=>x.profile==='original-683b717')!.error).toBeDefined();
  expect(recovery.confirmRecovery('turns-2421210').ok).toBe(true);expect(recovery.state).toEqual(g.state);expect(recovery.recovery).toBeNull();
  const again=new Game();expect(again.importSave(recovery.exportSave()).ok).toBe(true);expect(again.state).toEqual(g.state);expect(raw).toBe(JSON.stringify(saved));
 });
 it('拒绝员工参数、内部升级指令、未知规则和伪造历史边界',()=>{
  const shell={version:17,rulesRevision:RULES_REVISION,seed:1,day:0,revision:1};
  const bad=[{type:'hireStaff',candidateId:''},{type:'fireStaff',staffId:3},{type:'assignStaff',staffId:'S1'}, {type:'assignStaff',staffId:'S1',post:{slot:'pm'}},{type:'assignStaff',staffId:'S1',post:{slot:'cfo',projectId:'P1'}},{type:'upgradeRecoveredV16'}];
  for(const command of bad)expect(validateSave({...shell,log:[{day:0,command}]})).toBeNull();
  expect(validateSave({...shell,rulesRevision:'unknown',log:[]})).toBeNull();
  for(const legacyV16 of [{profile:'unknown',untilDay:0,logCount:0},{profile:'original-683b717',untilDay:1,logCount:0},{profile:'turns-2421210',untilDay:0,logCount:1}])expect(validateSave({...shell,legacyV16,log:[]})).toBeNull();
 });
});

describe('旧v16历史边界与无损保护',()=>{
 it('有歧义的旧档不自动猜选、导入失败或取消不替换当前局',async()=>{
  const store=storage(),raw=JSON.stringify(original);store.setItem(SAVE_KEY,raw);const g=new Game();await g.init();
  expect(g.loadError).toBe(true);expect(g.recovery).not.toBeNull();expect(store.getItem(CURRENT_SAVE_KEY)).toBeNull();
  expect(g.endTurn().ok).toBe(false);g.save();expect(store.getItem(SAVE_KEY)).toBe(raw);expect(g.exportSave()).toBe(raw);
  const preview=g.recovery!.previews;expect(preview[0].cash).toBeCloseTo(54667.159965352315,6);expect(preview[1].cash).toBeCloseTo(55590.76709480273,6);
  g.cancelRecovery();expect(g.loadError).toBe(true);expect(g.reopenRecovery()).toBe(true);
  expect(g.confirmRecovery('original-683b717').ok).toBe(true);expect(g.state.cash).toBeCloseTo(54667.159965352315,6);
  expect(store.getItem(SAVE_KEY)).toBe(raw);expect(JSON.parse(store.getItem(CURRENT_SAVE_KEY)!).version).toBe(17);
  const before=JSON.stringify(g.state);expect(g.importSave(raw).ok).toBe(false);g.cancelRecovery();expect(g.loadError).toBe(false);expect(JSON.stringify(g.state)).toBe(before);
 });
 it('原实时版的完整既有现金、项目、债务、流水与RNG保留；同日新指令可重放',()=>{
  storage();const save=validateSave(original)!;expect(()=>restore(save)).toThrow('核对');
  const recovered=recoverV16(save,'original-683b717'),s=restore(recovered);expect(s.cash).toBeCloseTo(54667.159965352315,6);expect(computeMetrics(s).equity).toBeCloseTo(47911.248123040044,6);
  const frozen=originalRestore(original as unknown as OriginalSave);
  for(const key of ['cash','rng','day','projects','debts','reports','market','regulation','rivals','brand','attention','rating','stats'] as const)expect(s[key],key).toEqual(frozen[key]);
  const g=new Game();expect(g.importSave(JSON.stringify(recovered)).ok).toBe(true);const history=structuredClone(g.state);
  const p=g.state.projects.find(p=>p.stage==='construction')!;expect(g.issue({type:'setPace',projectId:p.id,pace:'slow'}).ok).toBe(true);
  const output=g.data();expect(output.legacyV16!.untilDay).toBe(original.day);expect(output.legacyV16!.logCount).toBe(original.log.length);
  expect(output.log.at(-1)!.day).toBe(original.day);expect(restore(validateSave(output)!)).toEqual(g.state);
  expect(g.state.cash).toBe(history.cash);expect(g.state.debts).toEqual(history.debts);expect(g.state.reports).toEqual({...history.reports,decisions:g.state.reports.decisions});
  g.endTurn();expect(restore(validateSave(JSON.parse(g.exportSave()))!)).toEqual(g.state);
 });
 it('此前会因评级融资失败的旧v16档按原规则恢复到既有第1409日',()=>{
  const save=validateSave(aggressive)!;
  const current=previewV16(save).find(x=>x.profile==='turns-2421210')!;expect(current.error).toBeDefined();
  const restored=restore(recoverV16(save,'original-683b717'));expect(restored.day).toBe(1409);expect(restored.cash).toBeCloseTo(10108.731774154883,6);
  expect(computeMetrics(restored).equity).toBeCloseTo(-27791.910302263277,6);
 });
 it('原主档只有IDB且已损坏时不当成空档，仍可导出；重开不覆盖旧主档',async()=>{
  storage();const raw={version:99,seed:2,day:900,log:[]},db=database({current:raw});
  const g=new Game();await g.init();expect(g.loadError).toBe(true);expect(JSON.parse(g.exportSave())).toEqual(raw);g.save();expect(db.writes).toBe(0);
  g.restart({mode:'career',difficulty:'standard'});await settle();expect(db.records.get('current')).toEqual(raw);expect(db.records.has(DATABASE_KEY)).toBe(true);
 });
 it('只有IDB的不可回放旧档仍能导出原记录；不能确认不可读版本',async()=>{
  storage();const raw={version:16,seed:1,day:0,log:[{day:0,command:{type:'repay',debtId:'missing'}}],revision:3},db=database({current:raw});
  const g=new Game();await g.init();expect(g.loadError).toBe(true);expect(JSON.parse(g.exportSave())).toEqual(raw);
  expect(g.recovery!.previews.every(x=>x.error)).toBe(true);expect(g.confirmRecovery('original-683b717').ok).toBe(false);expect(db.records.get('current')).toEqual(raw);
 });
 it('IDB替换新主档时原子归档；写满失败也不改变现有主档',async()=>{
  storage();const g=new Game();g.restart({mode:'career',difficulty:'standard'});const old=g.data();await settle();const db=database({[DATABASE_KEY]:old});
  const next={...old,revision:old.revision+1};await writeDatabase(next,true);
  expect([...db.records.entries()].find(([k])=>k.startsWith('preserved:'))?.[1]).toEqual({source:DATABASE_KEY,value:old});
  db.fail();await expect(writeDatabase({...next,revision:999},true)).rejects.toThrow();expect(db.records.get(DATABASE_KEY)).toEqual(next);
 });
 it('新格式损坏时不静默倒退到旧档；本地备份写满时拒绝覆盖替换',async()=>{
  const store=storage();store.setItem(SAVE_KEY,JSON.stringify(original));store.setItem(CURRENT_SAVE_KEY,'{broken');const g=new Game();await g.init();
  expect(g.loadError).toBe(true);expect(g.recovery).toBeNull();expect(g.exportSave()).toBe('{broken');
  const before=JSON.stringify(g.state);store.fail=true;expect(g.restart({mode:'career',difficulty:'standard'}).ok).toBe(false);expect(JSON.stringify(g.state)).toBe(before);expect(store.getItem(CURRENT_SAVE_KEY)).toBe('{broken');
 });
 it('IDB替换失败后普通保存重试仍先归档旧局，不因重试覆盖原件',async()=>{
  storage();vi.stubGlobal('localStorage',undefined);
  const input={version:17,rulesRevision:RULES_REVISION,seed:88,day:0,revision:1,log:[{day:0,command:{type:'startGame',options:{mode:'career',difficulty:'standard'}}}]};
  const db=database({[DATABASE_KEY]:input}),g=new Game();await g.init();await settle();const previous=structuredClone(db.records.get(DATABASE_KEY));
  db.fail();expect(g.restart({mode:'career',difficulty:'standard'}).ok).toBe(true);await settle();expect(db.records.get(DATABASE_KEY)).toEqual(previous);
  db.fail(false);expect(g.issue({type:'borrow',channel:'trust',amount:1000}).ok).toBe(true);await settle();
  expect([...db.records.entries()].some(([key,value])=>key.startsWith('preserved:')&&JSON.stringify((value as {value:unknown}).value)===JSON.stringify(previous))).toBe(true);
  expect((db.records.get(DATABASE_KEY) as {log:unknown[]}).log).toHaveLength(2);
 });
 it('重启后本地与IDB是不同进度分支时不猜选；明确读取副本后仍保留主档原件',async()=>{
  const store=storage();const a={version:17 as const,rulesRevision:RULES_REVISION,seed:88,day:0,revision:30,log:[{day:0,command:{type:'borrow' as const,channel:'trust' as const,amount:1000}}]};
  const b={...a,seed:99,revision:2};store.setItem(CURRENT_SAVE_KEY,JSON.stringify(b));const db=database({[DATABASE_KEY]:a});const g=new Game();await g.init();
  expect(g.loadError).toBe(true);expect(g.storageStatus).toContain('冲突');expect(db.writes).toBe(0);expect(store.getItem(CURRENT_SAVE_KEY)).toBe(JSON.stringify(b));
  expect(g.importSave(JSON.stringify(b)).ok).toBe(true);await settle();expect(g.state.seed).toBe(99);
  expect([...db.records.entries()].some(([key,value])=>key.startsWith('preserved:')&&JSON.stringify((value as {value:unknown}).value)===JSON.stringify(a))).toBe(true);
 });
 it('手动槽覆盖前保留原件，备份失败时不覆盖槽位',()=>{
  const store=storage(),s=newGame(1),first=slotMeta(defaultConfig,s,'first'),next=slotMeta(defaultConfig,s,'next');
  expect(writeSlot(1,first,store)).toBe(true);expect(writeSlot(1,next,store)).toBe(true);
  expect([...store.data.entries()].some(([key,raw])=>key.startsWith('fdc-preserved-')&&raw===JSON.stringify(first))).toBe(true);
  store.fail=true;expect(writeSlot(1,first,store)).toBe(false);expect(readSlot(1,store)).toEqual(next);
  expect(preserveRaw('原件','other',store)).toBe(false);
 });
 it('两个v16冻结快照的全部文件哈希不变',()=>{
  for(const dir of ['legacy-v16-original','legacy-v16-turns']){
   const root=new URL('../src/'+dir+'/',import.meta.url),hashes=JSON.parse(readFileSync(new URL('frozen-sha256.json',root),'utf8'));
   for(const [file,hash]of Object.entries(hashes))expect(createHash('sha256').update(readFileSync(new URL(file,root))).digest('hex'),dir+'/'+file).toBe(hash);
  }
 });
});

describe('员工薪酬与项目经理续航估算',()=>{
 it('待命工资按当前合同计入每月和12月合计，与真实月末一致',()=>{
  const s=newGame(42);applyCommand(s,{type:'startGame',options:{mode:'career',difficulty:'standard'}});applyCommand(s,{type:'hireStaff',candidateId:s.staff!.pool[0].id});
  const before=JSON.stringify(s),pay=payroll(s),e=estimateRunway(s.rules!,s);expect(JSON.stringify(s)).toBe(before);
  expect(e.schedule[0].salary).toBe(pay);expect(e.next12.salary).toBe(pay*12);expect(e.next12.total).toBe(pay*12);
  const from=s.reports.journal.length;for(let i=0;i<30;i++)stepDay(s);
  expect(s.reports.journal.slice(from).filter(x=>x.kind==='salary').reduce((n,x)=>n-x.cash,0)).toBe(e.schedule[0].salary);
 });
 it('首月工程款计入项目经理与已知季节成本，固定情景与真实结算相符',()=>{
  const c=structuredClone(defaultConfig);c.rivals.companies=[];Object.assign(c.risk,{materialChance:0,accidentChance:0,demandChance:0,inspectionBase:0,inspectionAttentionFactor:0});c.compliance.enabled=false;
  const s=newGame(42,c);applyCommand(s,{type:'startGame',options:{mode:'challenge',difficulty:'standard',challenge:'delivery'}},c);
  const employee=s.staff!.pool[0],p=s.projects[0];applyCommand(s,{type:'hireStaff',candidateId:employee.id});applyCommand(s,{type:'assignStaff',staffId:employee.id,post:{slot:'pm',projectId:p.id}});
  s.market.season={...s.market.season!,build:1.2,cost:1.1};
  const estimated=estimateRunway(s.rules!,s).schedule[0],from=s.reports.journal.length;
  for(let i=0;i<30;i++)stepDay(s);
  const actual=s.reports.journal.slice(from).filter(x=>x.kind==='construction').reduce((n,x)=>n+x.amount,0);
  expect(actual).toBeCloseTo(estimated.construction,6);
 });
});
