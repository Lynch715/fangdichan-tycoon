import {preB9Config,preB9State} from './helpers/pre-b9.ts';
import{createHash}from'node:crypto';import{readFileSync}from'node:fs';import{describe,it,expect}from'vitest';
import{restore,validateSave}from'../src/save.ts';import{applyCommand,stepDay,projectResult,defaultConfig}from'../src/sim/index.ts';import golden from'./acceptance/b5-v5-golden.json';
describe('B5 报表升级与旧档保护',()=>{
 it('冻结v5的11文件哈希与原配置保持一致',()=>{const hashes=JSON.parse(readFileSync(new URL('../src/legacy-v5/frozen-sha256.json',import.meta.url),'utf8')) as Record<string,string>;expect(Object.keys(hashes)).toHaveLength(11);for(const[f,h]of Object.entries(hashes))expect(createHash('sha256').update(readFileSync(new URL('../src/legacy-v5/'+f,import.meta.url))).digest('hex'),f).toBe(h);expect(preB9Config(defaultConfig)).toMatchObject(JSON.parse(readFileSync(new URL('../src/legacy-v5/config.json',import.meta.url),'utf8')));});
 for(const fixture of golden)it(`v5经济历史逐字段保留：${fixture.name}`,()=>{
  const save=validateSave(fixture.save)!,s=restore(save),old=preB9State(s) as unknown as Record<string,unknown>;old.version=5;delete old.industry;delete old.rivals;delete old.rivalsSinceDay;delete old.reports;expect(old).toEqual(fixture.state);expect(save.legacyV5Until).toBe(fixture.save.day);expect(s.reports.sinceDay).toBe(0);expect(s.reports.complete).toBe(true);expect(s.reports.provenance).toBe("replayed");expect(s.reports.replayError).toBeUndefined();expect(s.reports.months[0].opening.cash).toBe(50000);expect(s.reports.journal.length).toBeGreaterThan(0);expect(Object.values(s.reports.origins).every(x=>x.complete)).toBe(true);expect(projectResult(s,s.projects[0]).profit).not.toBeNull();
 });
 it('旧档边界同日命令和续玩月报重放一致，不补造历史',()=>{
  const save=validateSave(structuredClone(golden[0].save))!,s=restore(save),cmd={type:'setMarketing' as const,projectId:s.projects[0].id,rate:.06};expect(applyCommand(s,cmd).ok).toBe(true);save.log.push({day:s.day,command:cmd});for(let i=0;i<30;i++)stepDay(s);save.day=s.day;expect(restore(save)).toEqual({...s,pauses:[]});expect(s.reports.months).toHaveLength(8);expect(s.reports.months[0].startDay).toBe(0);expect(s.reports.months.at(-1)!.startDay).toBe(golden[0].save.day);
 });
 it('v6边界成对有序，不能伪造迁移日期',()=>{
  const base={version:6,seed:7,day:30,log:[]};for(const extra of [{legacyV5Until:30},{legacyV5LogCount:0},{legacyV4Until:30,legacyV4LogCount:0,legacyV5Until:0,legacyV5LogCount:0},{legacyV5Until:31,legacyV5LogCount:0}])expect(validateSave({...base,...extra})).toBeNull();
 });
});
