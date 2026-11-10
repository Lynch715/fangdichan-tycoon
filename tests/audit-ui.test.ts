import { describe, expect, it } from 'vitest';
import { applyCommand, defaultConfig as c, marketPrice, newGame, projectResult, stepDay } from '../src/sim/index.ts';
import { conservative, runGame } from '../src/sim/bots.ts';
import * as ordinary from './helpers/ordinary-auctions.ts';
import { projectOutlook, outlookMarkup } from '../src/ui/outlook.ts';
import { projectPricing } from '../src/ui/pricing.ts';
import { achievementsMarkup, loadUnlocks, saveUnlocks } from '../src/ui/achievements.ts';
import { readSlot, savesMarkup, writeSlot, slotMeta } from '../src/ui/saves.ts';
import { guideStep } from '../src/ui/guide.ts';
import { pickProduct, pickedProduct, resetProductChoices } from '../src/ui/productChoice.ts';
import { displayNewsText, displaySeasonEvent } from '../src/ui/eventText.ts';

const mature = runGame(2, conservative, 15).state;
function firstProject() {
  const s = newGame(7);
  applyCommand(s,{type:'startGame',options:{mode:'career',difficulty:'standard'}});
  const a = s.auctions.find(a=>a.starter)!;
  expect(applyCommand(s,{type:'bid',parcelId:a.id,amount:a.startPrice}).ok).toBe(true);
  while (s.day < a.endDay) stepDay(s);
  return {s,p:s.projects[0],config:s.rules!};
}

describe('全面审计：估算口径与调价', () => {
  it('已交付项目按实际建安、实际历史费用估算，只对余房收取未来营销费和税费', () => {
    const s = structuredClone(mature), p = s.projects.find(p=>p.stage==='delivered'&&p.partnerShare===0&&Math.abs(p.buildCost-p.buildSpent)>1)!;
    expect(p).toBeTruthy();
    const before = JSON.stringify(s), config = s.rules ?? c;
    const market = marketPrice(config,s,p.districtId,p.attributes,p.product);
    const pricing = projectPricing(config,s,p);
    const future = (p.saleableArea-p.soldArea)*Math.min(market,pricing.price);
    const expenses = s.reports.journal.filter(e=>e.projectId===p.id&&['marketing','tax','interest','extensionFee','financeAllocation','fine','accident'].includes(e.kind)).reduce((n,e)=>n+e.amount,0);
    const expected = p.salesIn + future - p.landCost - p.buildSpent - expenses - future*(config.sales.taxRate+p.marketingRate);
    expect(projectOutlook(config,s,p).profit).toBeCloseTo(expected,6);
    const old = projectOutlook(config,s,p).profit!;
    // 调整营销只改变余房预期费用，不倒算已售房屋的历史营销费。
    p.marketingRate += .01;
    expect(projectOutlook(config,s,p).profit!-old).toBeCloseTo(-future*.01,6);
    p.marketingRate -= .01;
    expect(JSON.stringify(s)).toBe(before);
  });
  it('收购已交付尾盘的估算只计买入后的权益，不计卖方已卖房屋的历史利润', () => {
    const s = ordinary.newGame(7), config = ordinary.defaultConfig;
    while(s.day<1560)ordinary.stepDay(s);
    const seller = s.rivals.find(r=>r.id==='yuefeng')!, old = seller.company.projects.find(p=>p.stage==='delivered')!;
    expect(ordinary.applyCommand(s,{type:'acquireProject',rivalId:seller.id,projectId:old.id}).ok).toBe(true);
    const p=s.projects.at(-1)!, owned=1-p.partnerShare, price=projectPricing(config,s,p).price;
    const future=(p.saleableArea-p.soldArea)*Math.min(price,marketPrice(config,s,p.districtId,p.attributes,p.product))*owned;
    expect(projectOutlook(config,s,p).revenue).toBeCloseTo(future,6);
    expect(projectOutlook(config,s,p).profit).toBeCloseTo(future*(1-p.marketingRate-config.sales.taxRate)-p.acquisition!.price,6);
  });
  it('清盘后的估算与正式项目结算一致；缺失历史时不输出虚构利润', () => {
    const s=structuredClone(mature),p=s.projects.find(p=>p.stage==='closed')!;
    expect(projectOutlook(c,s,p).profit).toBeCloseTo(projectResult(s,p).profit!,6);
    s.reports.origins[p.id].complete=false;
    expect(projectOutlook(c,s,p).profit).toBeNull();
    expect(outlookMarkup(c,s,p)).toContain('历史流水不完整');
  });
  it('备案价落后于市场时，降价从实际售价起算并能提交给真实内核', () => {
    const {s,p,config}=firstProject();
    applyCommand(s,{type:'startProject',projectId:p.id,contractor:'standard'});
    p.priceFactor=1.1;p.filedPrice=marketPrice(config,s,p.districtId,p.attributes,p.product)*.9;
    s.regulation.active=true;s.market.phaseIndex=config.cycle.phases.findIndex(x=>x.id==='downturn');
    expect(applyCommand(s,{type:'setPrice',projectId:p.id,priceFactor:1.05}).ok).toBe(false);
    const pricing=projectPricing(config,s,p),factor=pricing.change(-.05)!;
    expect(pricing.capped).toBe(true);expect(factor).toBeCloseTo(.85,9);
    expect(pricing.change(.05)).toBeNull();
    expect(applyCommand(s,{type:'setPrice',projectId:p.id,priceFactor:factor}).ok).toBe(true);
    s.market.priceIndex[p.districtId]=4.10948905109489/config.districts.find(d=>d.id===p.districtId)!.basePrice;
    p.filedPrice=3.8916695985401457;
    const market=marketPrice(config,s,p.districtId,p.attributes,p.product);
    p.priceFactor=p.filedPrice/market-.05;
    const capFactor=projectPricing(config,s,p).change(.05)!;
    expect(market*capFactor).toBeLessThanOrEqual(p.filedPrice);
    expect(applyCommand(s,{type:'setPrice',projectId:p.id,priceFactor:capFactor}).ok).toBe(true);
  });
  it('新规则自动限价时不再允许无效提价，普通售价仍按五个百分点调整', () => {
    const {s,p,config}=firstProject();config.filing.autoFile=true;s.regulation.active=true;
    s.market.phaseIndex=config.cycle.phases.findIndex(x=>x.id==='downturn');
    p.priceFactor=1.1;
    expect(projectPricing(config,s,p).change(.05)).toBeNull();
    const factor=projectPricing(config,s,p).change(-.05)!;
    expect(factor).toBeCloseTo(config.filing.maxMarketFactor-.05,9);
    s.regulation.active=false;s.market.phaseIndex=0;p.priceFactor=1;
    expect(projectPricing(config,s,p).change(.05)).toBeCloseTo(1.05,9);
  });
});

describe('全面审计：存储容错与跨局草稿',()=>{
  it('浏览器拒绝访问localStorage时，成就与手动存档入口不使应用崩溃',()=>{
    const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('SecurityError');}});
    try {
      expect(loadUnlocks()).toEqual({});expect(()=>saveUnlocks({})).not.toThrow();
      expect(readSlot(1)).toBeNull();expect(writeSlot(1,slotMeta(c,newGame(1),'{}'))).toBe(false);
    } finally { if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage'); }
  });
  it('存档槽摘要缺失和非法JSON均明确标损坏，保留可导出原件，覆盖前备份',()=>{
    const rows=new Map<string,string>(),store={getItem:(k:string)=>rows.get(k)??null,setItem:(k:string,v:string)=>{rows.set(k,v);}};
    const payload='{"version":17}';rows.set('fdc-slot-1',JSON.stringify({savedAt:'2026-11-10',data:payload}));
    const m=readSlot(1,store)!;expect(m.damaged).toBe(true);expect(m.data).toBe(payload);
    expect(savesMarkup(c,newGame(1),'已保存',[m,null,null])).toContain('data-slot-export="1"');
    const old=rows.get('fdc-slot-1')!;
    expect(writeSlot(1,slotMeta(c,newGame(1),'{}'),store)).toBe(true);
    expect([...rows].some(([k,v])=>k.startsWith('fdc-preserved-')&&v===old)).toBe(true);
    rows.set('fdc-slot-2','不是JSON');expect(readSlot(2,store)).toMatchObject({damaged:true,data:'不是JSON'});
  });
  it('一条成就损坏不阻止其余有效成就和成就墙读取，也不覆盖原始数据',()=>{
    const raw=JSON.stringify({first_land:{company:'测试公司',at:1},first_sale:{company:'保留公司',at:'2026-11-10T00:00:00Z'},unknown:{company:'外来键',at:'2026-11-10'}});
    const got=loadUnlocks({getItem:()=>raw});expect(Object.keys(got)).toEqual(['first_sale']);
    expect(achievementsMarkup(got,false)).toContain('成就 1 / 24');
    expect(loadUnlocks({getItem:()=>'[]'})).toEqual({});
  });
  it('换局或读档后清除同ID项目的产品线草稿',()=>{
    const {p}=firstProject();pickProduct(p.id,'villa');expect(pickedProduct(p)).toBe('villa');
    resetProductChoices();expect(pickedProduct(p)).not.toBe('villa');
  });
  it('首块地转让后重新引导拿地，备案停销时说明实际下一步',()=>{
    const {s,p,config}=firstProject();
    expect(applyCommand(s,{type:'sellProject',projectId:p.id}).ok).toBe(true);
    expect(guideStep(s)?.tab).toBe('land');
    const second=firstProject();applyCommand(second.s,{type:'startProject',projectId:second.p.id,contractor:'standard'});
    second.p.progress=.5;second.s.regulation.active=true;
    second.s.market.phaseIndex=second.config.cycle.phases.findIndex(x=>x.id==='downturn');
    expect(config.filing.autoFile).toBe(false);
    expect(guideStep(second.s)?.text).toContain('申请限价备案');
    second.p.filingDueDay=second.s.day+60;
    expect(guideStep(second.s)?.text).toContain('备案审批中');
  });
  it('季节事件在非对应节令月份用中性文案，不修改模拟事件或消息',()=>{
    const s=newGame(1);applyCommand(s,{type:'startGame',options:{mode:'career',difficulty:'standard'}});
    const ev={...s.market.season!,month:1,eventId:'yearEndPush',name:'年末冲业绩',text:'年底冲业绩，各盘加推特价房'};
    const before=JSON.stringify(ev);expect(displaySeasonEvent(ev).name).toBe('冬季促销');
    expect(displaySeasonEvent({...ev,month:11}).name).toBe('年末冲业绩');expect(JSON.stringify(ev)).toBe(before);
    const n={day:30,kind:'market' as const,text:'【冬季·年末冲业绩】年底冲业绩，各盘加推特价房'};
    expect(displayNewsText(c,n)).not.toContain('年末');expect(n.text).toContain('年末');
    for(const [eventId,month] of [['nationalDay',8],['goldenAutumn',10],['twoSessions',3],['springFestival',11],['yearEndCredit',1],['quotaTight',9]] as const){
      const def=c.seasons.events.find(e=>e.id===eventId)!,season=c.seasons.list.find(x=>x.id===def.season)!.name;
      expect(displaySeasonEvent({...ev,eventId,month,name:def.name,text:def.text}).name).not.toBe(def.name);
      const news={day:month*30,kind:'policy' as const,text:`【${season}季·${def.name}】${def.text}（下回合生效）`};
      expect(displayNewsText(c,news)).not.toContain(def.name);
      expect(displayNewsText(c,news)).toContain('当月生效');
    }
    expect(displayNewsText(c,{day:30,kind:'company',text:'年末冲业绩公司成立'})).toBe('年末冲业绩公司成立');
  });
});
