import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from '../src/game.ts';
import {SAVE_KEY,validateSave} from '../src/save.ts';
class MemoryStorage { data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,String(v));}removeItem(k:string){this.data.delete(k);}}
afterEach(()=>vi.unstubAllGlobals());
describe('持久化失败与恢复',()=>{
 it('IndexedDB 不可用时仍可保存命令并从 localStorage 恢复',async()=>{
  const storage=new MemoryStorage();vi.stubGlobal('localStorage',storage);vi.stubGlobal('indexedDB',undefined);
  const g=new Game();await g.init();expect(g.issue({type:'borrow',channel:'trust',amount:1000}).ok).toBe(true);const cash=g.state.cash;
  const loaded=new Game();await loaded.init();expect(loaded.state.cash).toBe(cash);expect(loaded.log).toEqual(g.log);
 });
 it('损坏档案不覆盖；导入失败不丢当前进度',async()=>{
  const storage=new MemoryStorage();storage.setItem(SAVE_KEY,'{broken');vi.stubGlobal('localStorage',storage);vi.stubGlobal('indexedDB',undefined);
  const g=new Game();await g.init();expect(g.loadError).toBe(true);g.save();expect(storage.getItem(SAVE_KEY)).toBe('{broken');expect(g.issue({type:'borrow',channel:'trust',amount:1000}).ok).toBe(false);expect(g.exportSave()).toBe('{broken');
  g.restart();const before=JSON.stringify(g.state);expect(g.importSave('{bad').ok).toBe(false);expect(JSON.stringify(g.state)).toBe(before);
 });
 it('导入导出完整回放，错误指令和破产后的伪造日期拒绝',async()=>{
  vi.stubGlobal('localStorage',new MemoryStorage());vi.stubGlobal('indexedDB',undefined);
  const g=new Game();await g.init();g.issue({type:'borrow',channel:'hidden',amount:1000});const raw=g.exportSave();g.restart();expect(g.importSave(raw).ok).toBe(true);expect(g.state.cash).toBe(51000);expect(g.log[0].command.type).toBe('borrow');
  expect(validateSave({seed:1,day:0,log:[{day:0,command:{type:'unknown'}}]})).toBeNull();
  expect(g.importSave(JSON.stringify({version:2,seed:1,day:0,log:[{day:0,command:{type:'repay',debtId:'fake'}}]})).ok).toBe(false);
 });
});
