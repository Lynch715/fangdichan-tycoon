import {preB9Config,preB9State} from './helpers/pre-b9.ts';
import{createHash}from'node:crypto';import{readFileSync}from'node:fs';
import{describe,it,expect}from'vitest';import{restore,validateSave}from'../src/save.ts';import{applyCommand,stepDay,defaultConfig}from'../src/sim/index.ts';import golden from'./acceptance/b3-v3-golden.json';
describe('B3规则升级保留B2历史',()=>{
 it('冻结v3的11文件哈希一致',()=>{const hashes=JSON.parse(readFileSync(new URL('../src/legacy-v3/frozen-sha256.json',import.meta.url),'utf8')) as Record<string,string>;expect(Object.keys(hashes)).toHaveLength(11);for(const[f,h]of Object.entries(hashes))expect(createHash('sha256').update(readFileSync(new URL('../src/legacy-v3/'+f,import.meta.url))).digest('hex'),f).toBe(h);});
 for(const fixture of golden)it(`旧v3逐字段保留：${fixture.name}`,()=>{
  const save=validateSave(fixture.save)!,s=restore(save);expect(save.legacyV3Until).toBe(fixture.save.day);expect(save.legacyV3LogCount).toBe(fixture.save.log.length);
  const old=preB9State(s) as unknown as Record<string,unknown>;old.version=3;delete old.industry;delete old.rivals;delete old.rivalsSinceDay;delete old.reports;delete old.brand;for(const p of old.projects as Record<string,unknown>[]){delete p.marketingRate;delete p.contractor;delete p.quality;}expect(old).toEqual(fixture.state);
  expect(s.brand).toBe(50);expect(s.projects.every(p=>p.contractor==='standard'&&p.quality===75)).toBe(true);
 });
 it('同日追加命令在v3边界后执行，后续推进可重放',()=>{
  const save=validateSave(structuredClone(golden[2].save))!,s=restore(save),command={type:'setPace' as const,projectId:s.projects[0].id,pace:'slow' as const};expect(applyCommand(s,command).ok).toBe(true);save.log.push({day:s.day,command});for(let i=0;i<30;i++)stepDay(s);save.day=s.day;expect(restore(save)).toEqual({...s,pauses:[]});
 });
 it('v4边界成对且递增，开工指令档位须合法',()=>{
  const base={version:6,seed:7,day:30,log:[]};for(const extra of [{legacyV3Until:30},{legacyV3LogCount:0},{legacyV2Until:30,legacyV2LogCount:0,legacyV3Until:0,legacyV3LogCount:0}])expect(validateSave({...base,...extra})).toBeNull();
  expect(validateSave({...base,log:[{day:30,command:{type:'startProject',projectId:'P4',contractor:'invalid'}}]})).toBeNull();
 });
 it('既有参数保留，只增加总包与质量的新参数',()=>{
  const old=JSON.parse(readFileSync(new URL('../src/legacy-v3/config.json',import.meta.url),'utf8')),current=preB9Config(defaultConfig) as unknown as Record<string,unknown>;delete current.auctions;delete current.rivals;delete current.quality;delete current.auctions;delete current.rivals;delete current.marketing;delete(current.construction as Record<string,unknown>).contractors;delete (current as unknown as {finance:Record<string,unknown>}).finance.bond;delete (current as unknown as {finance:Record<string,unknown>}).finance.covenants;delete (current as unknown as {finance:{channels:Record<string,unknown>}}).finance.channels.bond;expect(current).toEqual(old);
 });
});
