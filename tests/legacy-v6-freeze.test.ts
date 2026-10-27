import {preB9Config,preB9State} from './helpers/pre-b9.ts';
import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{describe,it,expect}from'vitest';
import{restore as frozenRestore,validateSave as frozenValidate}from'../src/legacy-v6/restore.ts';
import{restore,validateSave}from'../src/save.ts';import{defaultConfig}from'../src/sim/config.ts';import fixtures from'./acceptance/b6-v6-golden.json';
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
describe('B6a B5e完工v6历史冻结基线',()=>{
 it('13个冻结源码/配置/统计回溯文件保持哈希，未改变已有配置',()=>{const hashes=JSON.parse(readFileSync(new URL('../src/legacy-v6/frozen-sha256.json',import.meta.url),'utf8')) as Record<string,string>;expect(Object.keys(hashes)).toHaveLength(13);for(const[file,expected]of Object.entries(hashes))expect(createHash('sha256').update(readFileSync(new URL('../src/legacy-v6/'+file,import.meta.url))).digest('hex'),file).toBe(expected);const old=JSON.parse(readFileSync(new URL('../src/legacy-v6/config.json',import.meta.url),'utf8'));expect(preB9Config(defaultConfig)).toMatchObject(old);});
 for(const fixture of fixtures)it(`${fixture.name}：全部历史状态及统计与冻结基线一致`,()=>{
  const old=frozenRestore(frozenValidate(fixture.save)!);expect(hash(old)).toBe(fixture.sha256);expect(old.cash).toBe(fixture.cash);expect(old.rng).toBe(fixture.rng);expect(old.reports.months).toHaveLength(fixture.months);
  const current=preB9State(restore(validateSave(fixture.save)!));const fields=Object.fromEntries(Object.keys(old).map(k=>[k,k==='version'?6:current[k as keyof typeof current]]));expect(fields).toEqual(old);
 });
});
