import type {Config} from './config.ts';
import type {GameState} from './types.ts';

/** 每片区独立观察；迁移只记录当天价格，不伪造旧月份政策或购房资格。 */
export function initHousingPolicies(s:GameState,c:Config){
 if(!c.housingPolicy.enabled)return;
 s.market.policies??={};
 for(const d of c.districts)s.market.policies[d.id]??={level:c.housingPolicy.initialLevel,sinceDay:s.day,lastChangedDay:s.day,lastReviewDay:s.day,prices:[s.market.priceIndex[d.id]],priceGrowth:null,signal:'observing',reason:'等待完整价格观察期'};
}
/** 月末全部公司结算后统一评估，本次调整从下个月销售起生效。无新增随机数。 */
export function reviewHousingPolicies(s:GameState,c:Config){
 if(!c.housingPolicy.enabled)return;initHousingPolicies(s,c);
 const rule=c.housingPolicy;
 for(const d of c.districts){
  const p=s.market.policies![d.id];if(p.lastReviewDay===s.day)continue;
  p.lastReviewDay=s.day;p.prices.push(s.market.priceIndex[d.id]);
  while(p.prices.length>rule.priceWindowMonths+1)p.prices.shift();
  if(p.prices.length<rule.priceWindowMonths+1||s.day-p.sinceDay<rule.priceWindowMonths*c.time.daysPerMonth)continue;
  p.priceGrowth=p.prices.at(-1)!/p.prices[0]-1;
  const m=s.market.districts?.[d.id],hasInventory=!!m&&m.salesHistory.length>=c.regions.rollingSalesMonths&&m.stockArea>0;
  const fast=hasInventory&&m.absorptionMonths!==null&&m.absorptionMonths>0&&m.absorptionMonths<=rule.hotAbsorptionMonths;
  const slow=hasInventory&&(m.absorptionMonths===null||m.absorptionMonths>=rule.weakAbsorptionMonths);
  const hot=p.priceGrowth>=rule.hotPriceGrowth||(fast&&p.priceGrowth>0);
  const weak=p.priceGrowth<=rule.weakPriceGrowth||(slow&&p.priceGrowth<=rule.inventoryPriceCeiling);
  p.signal=hot?'hot':weak?'weak':'stable';
  p.reason=hot?(p.priceGrowth>=rule.hotPriceGrowth?'片区房价涨幅偏高':'片区库存去化偏快且房价上涨'):weak?(p.priceGrowth<=rule.weakPriceGrowth?'片区房价持续下行':'片区库存去化偏慢且房价低迷'):'片区市场平稳，维持现行政策';
  const target=Math.max(0,Math.min(rule.levels.length-1,p.level+(hot?1:weak?-1:0)));
  if(target===p.level)continue;
  if(s.day-p.lastChangedDay<rule.minHoldMonths*c.time.daysPerMonth){p.reason+='；政策观察期内暂不调整';continue;}
  p.level=target;p.lastChangedDay=s.day;
  const terms=rule.levels[target];
  s.news.unshift({day:s.day,kind:'policy',text:`${d.name}购房政策转为${terms.name}：${terms.purchaseLimit===null?'不限购':`每户限购${terms.purchaseLimit}套`}，首付${Math.round(terms.downPayment*100)}%，按揭年利率${(terms.mortgageRate*100).toFixed(1)}%。下月销售起生效。`});
  if(s.news.length>60)s.news.length=60;
 }
}
export function housingPolicyTerms(s:GameState,c:Config,districtId?:string){
 if(!c.housingPolicy.enabled||!districtId)return undefined;
 const policy=s.market.policies?.[districtId];return policy?c.housingPolicy.levels[policy.level]:undefined;
}
/** 限购以合资格客群比例表达；首付和按揭影响需求，不改变开发商借款或已成交合同。 */
export function housingDemandFactor(s:GameState,c:Config,districtId?:string):number {
 const t=housingPolicyTerms(s,c,districtId);if(!t)return 1;
 const d=c.housingPolicy.demand;
 const factor=t.eligibleDemand*(d.referenceDownPayment/t.downPayment)**d.downPaymentSensitivity*Math.exp((d.referenceMortgageRate-t.mortgageRate)*d.mortgageRateSensitivity);
 return Math.max(d.minFactor,Math.min(d.maxFactor,factor));
}
