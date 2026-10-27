import {preB9Config,preB9State} from './helpers/pre-b9.ts';
import{createHash}from'node:crypto';import{readFileSync}from'node:fs';import{describe,it,expect}from'vitest';
import{restore,validateSave}from'../src/save.ts';import{applyCommand,stepDay,defaultConfig}from'../src/sim/index.ts';import golden from'./acceptance/b4-v4-golden.json';
describe('B4 品牌营销规则升级',()=>{
 it('冻结v4的11文件哈希一致',()=>{const hashes=JSON.parse(readFileSync(new URL('../src/legacy-v4/frozen-sha256.json',import.meta.url),'utf8')) as Record<string,string>;expect(Object.keys(hashes)).toHaveLength(11);for(const[f,h]of Object.entries(hashes))expect(createHash('sha256').update(readFileSync(new URL('../src/legacy-v4/'+f,import.meta.url))).digest('hex'),f).toBe(h);});
 for(const fixture of golden)it(`v4历史逐字段保留：${fixture.name}`,()=>{
  const save=validateSave(fixture.save)!,s=restore(save);expect(save.legacyV4Until).toBe(fixture.save.day);expect(save.legacyV4LogCount).toBe(fixture.save.log.length);
  const old=preB9State(s) as unknown as Record<string,unknown>;old.version=4;delete old.industry;delete old.rivals;delete old.rivalsSinceDay;delete old.reports;for(const p of old.projects as Record<string,unknown>[])delete p.marketingRate;expect(old).toEqual(fixture.state);expect(s.projects.every(p=>p.marketingRate===.03)).toBe(true);
 });
 it('旧档同日设营销只执行一次，续玩确定性且保留品牌40而非重置',()=>{
  const save=validateSave(structuredClone(golden[2].save))!,s=restore(save);expect(s.brand).toBe(40);const cmd={type:'setMarketing' as const,projectId:s.projects[0].id,rate:.08};expect(applyCommand(s,cmd).ok).toBe(true);save.log.push({day:s.day,command:cmd});for(let i=0;i<30;i++)stepDay(s);save.day=s.day;expect(restore(save)).toEqual({...s,pauses:[]});
 });
 it('迁移边界成对递增，非有限营销比例不接受',()=>{
  const base={version:6,seed:7,day:30,log:[]};for(const extra of [{legacyV4Until:30},{legacyV4LogCount:0},{legacyV3Until:30,legacyV3LogCount:0,legacyV4Until:0,legacyV4LogCount:0}])expect(validateSave({...base,...extra})).toBeNull();expect(validateSave({...base,log:[{day:30,command:{type:'setMarketing',projectId:'P4',rate:NaN}}]})).toBeNull();
 });
 it('既有参数未改，仅增加品牌营销新参数',()=>{
  const old=JSON.parse(readFileSync(new URL('../src/legacy-v4/config.json',import.meta.url),'utf8')),current=preB9Config(defaultConfig) as unknown as Record<string,unknown>;delete current.auctions;delete current.rivals;delete current.marketing;delete(current.quality as Record<string,unknown>).deliveryBrandGain;delete (current as unknown as {finance:Record<string,unknown>}).finance.bond;delete (current as unknown as {finance:Record<string,unknown>}).finance.covenants;delete (current as unknown as {finance:{channels:Record<string,unknown>}}).finance.channels.bond;expect(current).toEqual(old);
 });
});
