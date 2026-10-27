import{housingPolicyMarkup}from'./housingPolicy.ts';
import{landBanMarkup}from'./compliance.ts';
import type {Config,GameState,SiteAttributes} from '../sim/index.ts';
import {esc,pct} from './format.ts';
export function siteAttributesMarkup(a?:SiteAttributes){
 if(!a)return '';
 const slope={flat:'平地',gentle:'缓坡',steep:'陡坡'}[a.slope],view={none:'普通景观',river:'江景',mountain:'山景',both:'江景＋山景'}[a.scenery];
 return `<span class="small muted">${slope} · 建安 +${pct(a.costFactor-1)} · 工期 +${pct(a.durationFactor-1)} · ${view}${a.priceFactor>1?`售价溢价 ${pct(a.priceFactor-1)}`:''}</span>`;
}
export function districtsPanel(c:Config,s:GameState,mapId:string){
 const items=c.districts.filter(d=>d.mapId===mapId);
 return `<details class="districts-summary" data-key="districts-${mapId}" open><summary>片区市场${mapId==='outer'?' · 巴南／大渡口／北碚':''}</summary><div class="stack">${items.map(d=>{
  const m=s.market.districts?.[d.id],cycle=!m||m.salesHistory.length===0?'尚未收月':m.stockArea<=0?'无在售库存':m.absorptionMonths===null?'暂无成交':`${m.absorptionMonths.toFixed(1)}个月`;
  return `<article class="tile stack"><b>${esc(d.name)}</b>${landBanMarkup(s,c,d.id)}${housingPolicyMarkup(c,s,d.id,true)}<span class="small">模拟月净流入 ${m&&m.salesHistory.length?(m.netInflow>=0?'+':'')+m.netInflow+'人':'尚未收月'} · 去化周期 ${cycle}</span><span class="small muted">基准房价 ${(d.basePrice*s.market.priceIndex[d.id]*10000).toFixed(0)} 元/㎡ · 模拟人口 ${m?(m.population/10000).toFixed(1)+'万':'—'}</span>${m?`<span class="small muted">月末未售 ${(m.stockArea/10000).toFixed(2)} 万㎡ · 月成交 ${((m.salesHistory.at(-1)??0)/10000).toFixed(2)} 万㎡</span>`:''}</article>`;
 }).join('')}<p class="small muted">人口为游戏模拟指标，随市场周期变化。去化周期＝已达预售进度的未售面积÷最近${c.regions.rollingSalesMonths}个月平均实际销量，包含本公司与同行；不足${c.regions.rollingSalesMonths}个月时取已有月份。</p>${c.housingPolicy.enabled?`<p class="small muted">购房政策按片区月末评估，下个月销售起生效。过热先收紧，下行先放松；限购以合资格客群比例模拟，首付和按揭共同影响新增销售，不改已成交合同。</p>`:""}</div></details>`;
}
