import{describe,it,expect}from'vitest';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import{restore as frozen,validateSave as validateFrozen}from'../src/legacy-v15/restore.ts';
import{restore,validateSave}from'../src/save.ts';import{defaultConfig,buildSessionConfig}from'../src/sim/index.ts';import fixtures from'./acceptance/d2-v15-golden.json';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
describe('D2调参前v15完整历史冻结',()=>{
 it('24个冻结文件保持逐字节一致',()=>{const root=new URL('../src/legacy-v15/',import.meta.url),hashes=JSON.parse(readFileSync(new URL('frozen-sha256.json',root),'utf8'));expect(Object.keys(hashes)).toHaveLength(24);for(const[name,expected]of Object.entries(hashes))expect(createHash('sha256').update(readFileSync(new URL(name,root))).digest('hex'),name).toBe(expected);});
 for(const fixture of fixtures)it(fixture.name,()=>{
  const old=frozen(validateFrozen(fixture.save)!);expect(hash(old)).toBe(fixture.sha256);
  const save=validateSave(fixture.save)!,current=restore(save);expect(save.version).toBe(16);
  expect(save.legacyV15Until).toBe(fixture.save.day);expect(save.legacyV15LogCount).toBe(fixture.save.log.length);
  expect(current.version).toBe(16);expect(current.rivals.every(r=>r.company.version===16)).toBe(true);
  const shape=structuredClone(current) as unknown as typeof old;shape.version=15;for(const r of shape.rivals)r.company.version=15;
  if(old.rules){expect(current.rules).toEqual(buildSessionConfig(defaultConfig,current.session!.options));shape.rules=old.rules;}
  expect(shape).toEqual(old);
 });
});
