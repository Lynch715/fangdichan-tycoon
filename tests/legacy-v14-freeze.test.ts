// D2允许调整当前经济参数；A–C历史参数与调参前v15配置比较，D2差异另有专项测试。
import beforeBalance from '../src/legacy-v15/config.json' with{type:'json'};
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {restore as frozen,validateSave as oldValidate} from '../src/legacy-v14/restore.ts';
import {restore,validateSave} from '../src/save.ts';
import fixtures from './acceptance/b13-v14-golden.json';
function withoutSession<T>(value:T):T {
 const copy=structuredClone(value) as T & {version:number;session?:unknown;rules?:unknown;rivals:{company:unknown}[]};
 copy.version=14;delete copy.session;delete copy.rules;
 copy.rivals=copy.rivals.map(r=>({...r,company:withoutSession(r.company)}));
 return copy;
}

describe('B13a冻结B12完整v14历史',()=>{
 it('22文件哈希和原参数不变',()=>{
  const root=new URL('../src/legacy-v14/',import.meta.url);
  const hashes=JSON.parse(readFileSync(new URL('frozen-sha256.json',root),'utf8'));
  expect(Object.keys(hashes)).toHaveLength(22);
  for(const [file,hash] of Object.entries(hashes)){
   expect(createHash('sha256').update(readFileSync(new URL(file,root))).digest('hex'),file).toBe(hash);
  }
  expect(beforeBalance).toMatchObject(JSON.parse(readFileSync(new URL('config.json',root),'utf8')));
 });
 for(const fixture of fixtures)it(fixture.name,()=>{
  const oldSave=oldValidate(fixture.save);
  expect(oldSave).not.toBeNull();
  const old=frozen(oldSave!);
  expect(createHash('sha256').update(JSON.stringify(old)).digest('hex')).toBe(fixture.sha256);
  // B13b仅增加模式元数据和版本标记；每一个v14原字段必须完全一致。
  const currentSave=validateSave(fixture.save);
  expect(currentSave).not.toBeNull();
  const current=restore(currentSave!);
  expect(withoutSession(current)).toEqual(old);
  expect(current.session?.options).toEqual({mode:'career',difficulty:'standard'});
  expect(current.session?.origin).toBe('legacy');
  expect(current.rules).toBeUndefined();
  expect(currentSave!.legacyV14Until).toBe(fixture.day);
  expect(currentSave!.legacyV14LogCount).toBe(fixture.save.log.length);
 });
});
