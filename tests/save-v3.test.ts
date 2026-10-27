import {preB9Config,preB9State} from './helpers/pre-b9.ts';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from '../src/game.ts';
import {restore,validateSave,SAVE_KEY} from '../src/save.ts';
import {applyCommand,defaultConfig,stepDay,type GameState} from '../src/sim/index.ts';
import {restore as restoreV2,type SaveData as V2Save} from '../src/legacy-v2/restore.ts';
import golden from './acceptance/b2-v2-golden.json';
class MemoryStorage {data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}}
afterEach(()=>vi.unstubAllGlobals());
function v2Shape(s:GameState){
 const copy=preB9State(s) as unknown as Record<string,unknown>;
 copy.version=2;delete copy.industry;delete copy.rivals;delete copy.rivalsSinceDay;delete copy.reports;delete copy.brand;delete (copy.stats as Record<string,unknown>).projectsTakenOver;
 for(const p of copy.projects as Record<string,unknown>[]){delete p.marketingRate;delete p.contractor;delete p.quality;delete p.fundingStoppedMonths;delete p.fundingGap;delete p.takeover;}
 return copy;
}
describe('B2 冻结规则与v3迁移',()=>{
 it('冻结v2的11个规则与配置文件哈希不变',()=>{
  const hashes=JSON.parse(readFileSync(new URL('../src/legacy-v2/frozen-sha256.json',import.meta.url),'utf8')) as Record<string,string>;
  expect(Object.keys(hashes)).toHaveLength(11);
  for(const [file,hash] of Object.entries(hashes))expect(createHash('sha256').update(readFileSync(new URL('../src/legacy-v2/'+file,import.meta.url))).digest('hex'),file).toBe(hash);
 });
 it('生产配置仅新增接管月数和关注度初值，既有参数未调',()=>{
  const before=JSON.parse(readFileSync(new URL('../src/legacy-v2/config.json',import.meta.url),'utf8'));
  const now=preB9Config(defaultConfig) as unknown as {construction:Record<string,unknown>;regulation:Record<string,unknown>};
  expect(now.construction.fundingStopMonthsToTakeover).toBe(6);expect(now.regulation.takeoverAttentionIncrease).toBe(20);
  delete (now as unknown as Record<string,unknown>).auctions;delete (now as unknown as Record<string,unknown>).rivals;delete now.construction.fundingStopMonthsToTakeover;delete now.regulation.takeoverAttentionIncrease;delete now.construction.contractors;delete (now as unknown as Record<string,unknown>).marketing;delete (now as unknown as Record<string,unknown>).quality;delete (now as unknown as {finance:Record<string,unknown>}).finance.bond;delete (now as unknown as {finance:Record<string,unknown>}).finance.covenants;delete (now as unknown as {finance:{channels:Record<string,unknown>}}).finance.channels.bond;expect(now).toEqual(before);
 });
 for(const fixture of golden)it(`v2历史逐字段保留：${fixture.name}`,()=>{
  const save=validateSave(fixture.save)!;expect(save.version).toBe(16);expect(save.legacyV2Until).toBe(fixture.save.day);expect(save.legacyV2LogCount).toBe(fixture.save.log.length);
  const s=restore(save);expect(v2Shape(s)).toEqual(fixture.state);expect(s.projects.every(p=>p.fundingStoppedMonths===0&&p.fundingGap===0&&p.takeover===null)).toBe(true);
 });
 it('迁移日期同日追加的指令执行一次；后续月份走新规则',()=>{
  const save=validateSave(structuredClone(golden[1].save))!;const s=restore(save),p=s.projects[0];
  const command={type:'setPace' as const,projectId:p.id,pace:'slow' as const};expect(applyCommand(s,command).ok).toBe(true);save.log.push({day:s.day,command});
  expect(restore(save)).toEqual({...s,pauses:[]});
  const until=s.day+30;while(s.day<until)stepDay(s);save.day=until;expect(restore(save)).toEqual({...s,pauses:[]});expect(s.projects.some(p=>p.fundingStoppedMonths>0)).toBe(true);
 });
 it('已迁移v1历史可再经v2边界接入v3，两个同日边界均保留',()=>{
  const prior={version:2 as const,seed:7,day:210,legacyUntil:210,legacyLogCount:1,revision:0,log:[{day:0,command:{type:'bid' as const,parcelId:'L1',amount:31146}},{day:210,command:{type:'setPaper' as const,projectId:'P4',enabled:true}}]};
  const old=restoreV2(prior),save=validateSave(prior)!,s=restore(save);expect(v2Shape(s)).toEqual(old);
  const cmd={type:'setPrice' as const,projectId:s.projects[0].id,priceFactor:1.1};expect(applyCommand(s,cmd).ok).toBe(true);save.log.push({day:210,command:cmd});expect(restore(save)).toEqual(s);
 });
 it('迁移边界缺项、乱序、越界或伪造内部升级指令被拒绝',()=>{
  const base={version:6,seed:7,day:30,log:[{day:0,command:{type:'borrow',channel:'trust',amount:100}}]};
  for(const markers of [{legacyV2Until:30},{legacyV2LogCount:0},{legacyV2Until:31,legacyV2LogCount:1},{legacyV2Until:30,legacyV2LogCount:2},{legacyV2Until:30,legacyV2LogCount:0},{legacyUntil:30,legacyLogCount:1,legacyV2Until:0,legacyV2LogCount:1}])expect(validateSave({...base,...markers})).toBeNull();
  expect(validateSave({...base,log:[{day:0,command:{type:'upgradeRules'}}]})).toBeNull();
 });
 it('Game导入导出保留边界，重启清除边界；坏旧档不覆盖原文',async()=>{
  const storage=new MemoryStorage();vi.stubGlobal('localStorage',storage);vi.stubGlobal('indexedDB',undefined);
  const raw=JSON.stringify(golden[1].save);storage.setItem(SAVE_KEY,raw);const g=new Game();await g.init();
  const output=JSON.parse(g.exportSave());expect(output.version).toBe(16);expect(output.legacyV2Until).toBe(30);expect(output.legacyV2LogCount).toBe(golden[1].save.log.length);expect(output.legacyV3Until).toBe(30);expect(output.legacyV3LogCount).toBe(golden[1].save.log.length);expect(g.loadError).toBe(false);
  const again=new Game();expect(again.importSave(JSON.stringify(output)).ok).toBe(true);expect(again.state).toEqual(g.state);
  again.restart();expect(JSON.parse(again.exportSave()).legacyV2Until).toBeUndefined();expect(JSON.parse(again.exportSave()).legacyV3Until).toBeUndefined();expect(JSON.parse(again.exportSave()).legacyUntil).toBeUndefined();
  const bad=JSON.stringify({...golden[0].save,log:[{day:0,command:{type:'repay',debtId:'missing'}}]});storage.setItem(SAVE_KEY,bad);const broken=new Game();await broken.init();expect(broken.loadError).toBe(true);broken.save();expect(storage.getItem(SAVE_KEY)).toBe(bad);
 });
 it('冻结的旧内核仍可独立回放旧负现金历史',()=>{const old=restoreV2(golden[1].save as unknown as V2Save);expect(old).toEqual(golden[1].state);});
});
