import{describe,it,expect,vi,afterEach}from'vitest';import{readFileSync}from'node:fs';
import{Game}from'../src/game.ts';import{restore,validateSave}from'../src/save.ts';
import{defaultConfig,transferQuote,applyCommand,stepDay}from'../src/sim/index.ts';
import beforeBalance from '../src/legacy-v15/config.json' with{type:'json'};
import{restore as oldRestore,validateSave as oldValidate}from'../src/legacy-v15/restore.ts';
afterEach(()=>vi.unstubAllGlobals());
const fixture=(name:string)=>JSON.parse(readFileSync(new URL('./acceptance/'+name,import.meta.url),'utf8'));
function differences(a:unknown,b:unknown,prefix=''):string[]{if(a===b)return[];if(a&&b&&typeof a==='object'&&typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>differences((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k],prefix?prefix+'.'+k:k));return[prefix];}
describe('D2 调参与v16历史边界',()=>{
 it('仅变更一项经济参数和四项激进策略参数',()=>{
  // 后3项为2026-10-27游戏性审计新增的开局新手地块与地块规模成长参数（D2之后，不涉及旧存档）。
  expect(differences(beforeBalance,defaultConfig).sort()).toEqual(['rescue.saleBookDiscount','bots.aggressive.landFundingRate','bots.aggressive.buildReserveRate','bots.aggressive.hiddenUsage','bots.aggressive.maxActive',
   'land.starterParcels','land.starterMaxCashShare','land.scale',
   'sales.premiumElasticity','marketing.spendSensitivity',
   'quality.excellentThreshold','quality.excellentBrandGain','marketing.brandTiers','products',
   'turns','seasons','staff','bots.staffMinSkill','bots.staffReserveMonths'].sort());
  expect(defaultConfig.rescue.saleBookDiscount).toBe(.6);
 });
 it('v15同日转让沿用新报价，历史和新增指令分界后完整重放一致',()=>{
  const input=fixture('b14-negative-save.json'),old=oldRestore(oldValidate(input)!),save=validateSave(input)!,s=restore(save),p=s.projects.find(p=>p.id==='P14')!;
  const quote=transferQuote(s,p,s.rules??defaultConfig),before=s.cash,history=structuredClone(s.reports.journal);
  expect(s.cash).toBe(old.cash);expect(s.debts).toEqual(old.debts);expect(quote.price).toBeCloseTo(-2798.9356244620285,5);
  const cmd={type:'sellProject' as const,projectId:p.id};expect(applyCommand(s,cmd).ok).toBe(true);save.log.push({day:s.day,command:cmd});
  expect(s.cash).toBeCloseTo(before+quote.net,6);expect(s.reports.journal.slice(0,history.length)).toEqual(history);
  expect(restore(save)).toEqual({...s,pauses:[]});
  for(let i=0;i<30;i++)stepDay(s);save.day=s.day;expect(restore(save)).toEqual({...s,pauses:[]});
 });
 it('v15已执行转让的历史仍按80%折价，不重算历史现金和流水',()=>{
  const input=fixture('b14-sold-browser-save.json'),old=oldRestore(oldValidate(input)!),s=restore(validateSave(input)!);
  expect(s.cash).toBe(old.cash);expect(s.reports).toEqual(old.reports);expect(s.cash).toBeCloseTo(1277173.5346813174,6);
 });
 it('Game导出保存v15边界，重载模式/配置一致，重新开局清除边界',()=>{
  vi.stubGlobal('localStorage',undefined);vi.stubGlobal('indexedDB',undefined);
  const g=new Game(),input=fixture('b13-sandbox-browser-save.json');expect(g.importSave(JSON.stringify(input)).ok).toBe(true);
  expect(g.config.rescue.saleBookDiscount).toBe(.6);const before=g.state.cash;expect(g.issue({type:'sandboxGrant'}).ok).toBe(true);
  expect(g.state.cash).toBe(before+g.config.sessions.sandbox.grant);
  const data=g.data();expect(data.version).toBe(17);expect(data.legacyV15Until).toBe(input.day);expect(data.legacyV15LogCount).toBe(input.log.length);
  expect(data).not.toHaveProperty('rules');expect(data).not.toHaveProperty('state');
  const other=new Game();expect(other.importSave(g.exportSave()).ok).toBe(true);expect(other.state).toEqual(g.state);
  expect(g.restart({mode:'career',difficulty:'standard'}).ok).toBe(true);expect(g.data().legacyV15Until).toBeUndefined();expect(g.data().legacyV15LogCount).toBeUndefined();
 });
 it('拒绝缺失、逆序及从历史边界后重新选择模式的存档',()=>{
  const data=validateSave(fixture('b13-sandbox-browser-save.json'))!;
  expect(validateSave({...data,legacyV15LogCount:undefined})).toBeNull();
  expect(validateSave({...data,legacyV15LogCount:data.log.length+1})).toBeNull();
  expect(validateSave({...data,legacyV15Until:-1})).toBeNull();
  expect(validateSave({...data,legacyV15LogCount:0})).toBeNull();
  const old=validateSave(fixture('b13-old-browser-save.json'))!;expect(validateSave({...old,legacyV15Until:undefined,legacyV15LogCount:undefined})).toBeNull();
 });
});
