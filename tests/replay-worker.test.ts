import {afterEach,describe,expect,it,vi} from 'vitest';
import {GameCore} from '../src/gameCore.ts';
import {createReplayRunner,type ReplayWorker} from '../src/replayClient.ts';
import {runReplayTask} from '../src/replayTasks.ts';
import {CURRENT_SAVE_KEY,MAX_SAVE_COMMANDS,MAX_SAVE_DAY,RULES_REVISION,validateSave,type SaveData} from '../src/saveData.ts';
import {restore} from '../src/saveReplay.ts';
import {conservative,runGame} from '../src/sim/bots.ts';
import old from './fixtures/v16-original-year1.json';

class MemoryStorage {
 data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}
}
class FakeWorker implements ReplayWorker {
 onmessage:Worker['onmessage']=null;onerror:Worker['onerror']=null;onmessageerror:Worker['onmessageerror']=null;
 stopped=0;input:unknown;
 postMessage(input:unknown){this.input=input;}terminate(){this.stopped++;}
}
function storage(){const store=new MemoryStorage();vi.stubGlobal('localStorage',store);vi.stubGlobal('indexedDB',undefined);return store;}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const shell:SaveData={version:17,rulesRevision:RULES_REVISION,seed:7,day:0,log:[],revision:0};

describe('异常回放保护与异步读档',()=>{
 it('拒绝不安全日期、千年以上日期和超大日志，同时接受百年生涯日期',()=>{
  for(const day of [1e308,1e12,MAX_SAVE_DAY+1,-1,.1])expect(validateSave({...shell,day})).toBeNull();
  expect(validateSave({...shell,day:36000})).not.toBeNull();
  expect(validateSave({...shell,log:new Array(MAX_SAVE_COMMANDS+1)})).toBeNull();
 });
 it('真实现代档在线程任务中逐值恢复，不改日志或随机数',async()=>{
  const result=runGame(4,conservative,8),save={...shell,seed:result.state.seed,day:result.state.day,log:result.log};
  const before=JSON.stringify(save),restored=await runReplayTask({raw:before});
  expect(restored.kind).toBe('ready');
  if(restored.kind==='ready')expect(restored.state).toEqual({...result.state,pauses:[]});
  expect(JSON.stringify(save)).toBe(before);
 });
 it('旧v16先预览、显式选规则后恢复，原文与同步冻结结果保持一致',async()=>{
  const raw=JSON.stringify(old),preview=await runReplayTask({raw});
  expect(preview.kind).toBe('recovery');if(preview.kind!=='recovery')throw Error('missing preview');
  expect(preview.previews).toHaveLength(2);
  const loaded=await runReplayTask({save:preview.save,profile:'original-683b717'});
  expect(loaded.kind).toBe('ready');if(loaded.kind==='ready')expect(loaded.state).toEqual(restore(loaded.save));
  expect(JSON.stringify(old)).toBe(raw);
 });
 it('早期版本通过按需历史分支恢复，与原同步迁移逐值相同',async()=>{
  for(const version of [undefined,2,5,10,15]){
   const raw=JSON.stringify({version,seed:7,day:360,log:[]}),save=validateSave(JSON.parse(raw));
   expect(save?.legacyV15Until).toBe(360);
   const result=await runReplayTask({raw});
   expect(result.kind).toBe('ready');
   if(result.kind==='ready')expect(result.state).toEqual(restore(save!));
  }
 });
 it('取消会立即终止线程，晚到的结果不会重新生效',async()=>{
  const worker=new FakeWorker(),controller=new AbortController(),runner=createReplayRunner(()=>worker);
  const promise=runner({save:shell},{signal:controller.signal}),check=expect(promise).rejects.toThrow('已取消');
  const late=worker.onmessage;controller.abort();await check;
  expect(worker.stopped).toBe(1);expect(worker.onmessage).toBeNull();
  late?.call(worker as unknown as Worker,{data:{ok:true,result:{kind:'ready',save:shell,state:{}}}} as MessageEvent);
  expect(worker.stopped).toBe(1);
 });
 it('超时同样终止线程；正常结果和线程错误也各自完成清理',async()=>{
  vi.useFakeTimers();const worker=new FakeWorker(),runner=createReplayRunner(()=>worker);
  const check=expect(runner({save:shell},{timeoutMs:100})).rejects.toThrow('超时');
  await vi.advanceTimersByTimeAsync(100);await check;expect(worker.stopped).toBe(1);
  const second=new FakeWorker(),failed=createReplayRunner(()=>second)({save:shell});
  second.onerror?.call(second as unknown as Worker,{} as ErrorEvent);
  await expect(failed).rejects.toThrow('线程');expect(second.stopped).toBe(1);
 });
 it('导入期间禁止经营指令，取消后当前状态与自动档完全不变',async()=>{
  const store=storage(),worker=new FakeWorker(),game=new GameCore(null,createReplayRunner(()=>worker));
  game.restart({mode:'career',difficulty:'standard'});await Promise.resolve();
  const state=JSON.stringify(game.state),raw=store.getItem(CURRENT_SAVE_KEY),load=game.importSaveAsync(JSON.stringify(shell));
  expect(game.replaying).toBe(true);expect(game.endTurn().ok).toBe(false);expect(game.issue({type:'borrow',channel:'trust',amount:1000}).ok).toBe(false);
  expect(game.restart().ok).toBe(false);game.cancelReplay();expect((await load).ok).toBe(false);
  expect(game.replaying).toBe(false);expect(JSON.stringify(game.state)).toBe(state);expect(store.getItem(CURRENT_SAVE_KEY)).toBe(raw);
 });
 it('自动续档取消仍能导出原件，不能把取消当成空档重开',async()=>{
  const store=storage(),raw=JSON.stringify({...shell,day:36000});store.setItem(CURRENT_SAVE_KEY,raw);
  const worker=new FakeWorker(),game=new GameCore(null,createReplayRunner(()=>worker)),init=game.init();
  await vi.waitFor(()=>expect(game.replaying).toBe(true));game.cancelReplay();await init;
  expect(game.loadError).toBe(true);expect(game.needsSetup).toBe(false);expect(game.exportSave()).toBe(raw);
  game.save();expect(store.getItem(CURRENT_SAVE_KEY)).toBe(raw);
 });
 it('浏览器入口成功导入仍执行现有原件备份，失败不替换当前进度',async()=>{
  const store=storage(),game=new GameCore(null,runReplayTask);
  game.restart({mode:'career',difficulty:'standard'});const oldRaw=store.getItem(CURRENT_SAVE_KEY)!;
  expect((await game.importSaveAsync(JSON.stringify(shell))).ok).toBe(true);
  expect([...store.data].some(([k,v])=>k.startsWith('fdc-preserved-')&&v===oldRaw)).toBe(true);
  const before=JSON.stringify(game.state);expect((await game.importSaveAsync('{bad')).ok).toBe(false);expect(JSON.stringify(game.state)).toBe(before);
 });
});
