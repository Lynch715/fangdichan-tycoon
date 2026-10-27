import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {newGame,applyCommand,stepDay,defaultConfig,transferQuote,type Project} from '../src/sim/index.ts';
import {validateSave,restore} from '../src/save.ts';
import {estimateTransfer} from '../src/estimates/transfer.ts';
import {transferMarkup} from '../src/ui/transfer.ts';
import {projectsPanel} from '../src/ui/panels.ts';
function opening(){const s=newGame(7);expect(applyCommand(s,{type:'startGame',options:{mode:'challenge',difficulty:'standard',challenge:'delivery'}}).ok).toBe(true);return s;}

describe('B14 交付后转让估算',()=>{
 it('固定销量无事故情景与真实推进至交付的剩余存货报价一致',()=>{
  const c=structuredClone(defaultConfig);c.start.cash=1e7;
  Object.assign(c.risk,{materialChance:0,accidentChance:0,demandChance:0,inspectionBase:0,inspectionAttentionFactor:0});
  c.sales.baseMonthlyAbsorption=0;c.compliance.enabled=false;
  const s=newGame(7,c);applyCommand(s,{type:'startGame',options:{mode:'challenge',difficulty:'standard',challenge:'delivery'}},c);
  const estimates=s.projects.map(p=>({id:p.id,sold:p.soldArea,spent:p.buildSpent,e:estimateTransfer(s.rules!,s,p).afterDelivery!}));
  const checked=new Set<string>();
  while(s.day<1000&&checked.size<estimates.length){stepDay(s,c);for(const x of estimates){const p=s.projects.find(p=>p.id===x.id)!;if(p.deliveredDay===s.day){
   expect(p.soldArea).toBe(x.sold);expect(p.buildSpent-x.spent).toBeCloseTo(x.e.remainingBuild,6);
   expect(transferQuote(s,p,s.rules!).price).toBeCloseTo(x.e.price,6);
   // 债务按原到期日实际兑付，估算保留原本金，不假装预测融资。
   expect(x.e.net).toBeCloseTo(x.e.price-x.e.debt,6);checked.add(x.id);
  }}}
  expect(checked.size).toBe(2);
 });
 it('合作按权益分摊，收购成本调整在已售成本结转后保留',()=>{
  const s=opening(),c=s.rules!,base=s.projects[0];
  const p:Project={...base,partnerShare:.4,pace:'fast',landPaid:base.landCost-1000,acquisition:{day:0,rivalId:'test',originalProjectId:'old',price:5000,basisAdjustment:-2000,recognizedRatio:0}};
  const e=estimateTransfer(c,s,p),a=e.afterDelivery!,grossRemaining=p.buildCost*(1-p.progress)*c.construction.paces.fast.costFactor;
  expect(a.remainingBuild).toBeCloseTo(grossRemaining*.6);expect(a.landPayment).toBe(600);
  expect(a.escrowRelease).toBeCloseTo((p.salesIn-p.escrowReleased)*.6);
  const remainingRatio=1-p.soldArea/p.saleableArea;
  expect(a.price).toBeCloseTo(((p.landCost+p.buildSpent+grossRemaining)*.6-2000)*remainingRatio*c.rescue.saleBookDiscount);
 });
 it('竣工后不再增加工程款，已交付/退出项目没有未来交付估算',()=>{
  const s=opening(),c=s.rules!,p={...s.projects[0],stage:'completed' as const,progress:1};
  expect(estimateTransfer(c,s,p).afterDelivery!.remainingBuild).toBe(0);
  for(const stage of ['delivered','closed','sold','abandoned'] as const)expect(estimateTransfer(c,s,{...p,stage}).afterDelivery).toBeNull();
  const land={...p,stage:'land' as const,progress:0,contractor:null,buildSpent:0};
  expect(estimateTransfer(c,s,land).afterDelivery!.remainingBuild).toBeCloseTo(land.buildCost*c.construction.contractors.standard.costFactor*c.construction.paces[land.pace].costFactor);
 });
 it('已售部分不能因交付而重复变成可转让资产；售罄时提醒清盘和债务',()=>{
  const s=opening(),c=s.rules!,p={...s.projects[0],soldArea:s.projects[0].saleableArea};
  const e=estimateTransfer(c,s,p).afterDelivery!;expect(e.price).toBe(0);expect(e.net).toBe(-e.debt);
  expect(transferMarkup(c,s,p)).toContain('若交付时已清盘则没有可转让项目');
 });
 it('资产负报价和融资导致净补付分别解释；渲染和估算完全只读',()=>{
  const s=opening(),c=s.rules!,p=s.projects[0];
  // 受控财务边界：预收款已大部分释放，仍待交付。
  p.salesIn=200000;p.escrowReleased=150000;
  const before=JSON.stringify(s),html=projectsPanel(c,s,null);
  expect(estimateTransfer(c,s,p).current.price).toBeLessThan(0);
  expect(html).toContain('未交付项目的预收房款仍计为负债');expect(html).toContain('交付后再转让 · 预计报价');
  expect(html).toContain('不能将报价变化视作新增利润');expect(JSON.stringify(s)).toBe(before);
  const delivered={...p,stage:'delivered' as const,soldArea:0,escrowReleased:p.salesIn};
  const debtOnly={...s,debts:s.debts.map(d=>({...d,principal:1e6}))};
  expect(transferMarkup(c,debtOnly,delivered)).toContain('不足以结清项目融资');
  expect(transferMarkup(c,debtOnly,delivered)).not.toContain('未交付项目的预收房款');
 });
 it('v14旧档与v15挑战日志重载后读取估算不改变完整状态或日志',()=>{
  for(const name of ['b13-old-browser-save.json','b13-delivery-7.json']){
   const save=validateSave(JSON.parse(readFileSync(new URL('./acceptance/'+name,import.meta.url),'utf8')))!;
   const before=JSON.stringify(save),s=restore(save),state=JSON.stringify(s);
   for(const p of s.projects){estimateTransfer(s.rules??defaultConfig,s,p);transferMarkup(s.rules??defaultConfig,s,p);}
   expect(JSON.stringify(s)).toBe(state);expect(JSON.stringify(save)).toBe(before);expect(restore(save)).toEqual(s);
  }
 });
});
