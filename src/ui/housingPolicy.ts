import type {Config,GameState} from '../sim/index.ts';
import {housingPolicyTerms,housingDemandFactor} from '../sim/housingPolicy.ts';
import {esc,pct} from './format.ts';
export function housingPolicyMarkup(c:Config,s:GameState,id:string,detail=false){
 const t=housingPolicyTerms(s,c,id),p=s.market.policies?.[id];if(!t||!p)return '';
 return `<div class="stack small housing-policy" data-policy-district="${esc(id)}"><span><b>购房政策 · ${esc(t.name)}</b> · ${t.purchaseLimit===null?'不限购':`每户限购${t.purchaseLimit}套`}</span><span>首付 ${pct(t.downPayment)} · 按揭年利率 ${pct(t.mortgageRate,1)}</span>${detail?`<span class="muted">近${c.housingPolicy.priceWindowMonths}个月房价 ${p.priceGrowth===null?'观察中':(p.priceGrowth>=0?'+':'')+pct(p.priceGrowth,1)} · ${esc(p.reason)}</span><span class="muted">购房需求系数 ${housingDemandFactor(s,c,id).toFixed(2)}；每次调整后至少观察${c.housingPolicy.minHoldMonths}个月。</span>`:''}</div>`;
}
