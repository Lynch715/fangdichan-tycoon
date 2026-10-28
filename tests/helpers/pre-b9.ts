import beforeBalance from '../../src/legacy-v15/config.json' with {type:'json'};
/** Project B9 and later additions out of historical comparisons; all older fields remain exact. */
export function preB9Config<T>(value:T):T {
 const copy=structuredClone(value) as T & {land?:Record<string,unknown>;quality?:Record<string,unknown>;sales?:Record<string,unknown>;marketing?:Record<string,unknown>;rescue?:{saleBookDiscount:number};bots?:unknown;sessions?:unknown;capitalRescue?:unknown;housingPolicy?:unknown;compliance?:unknown;siteAttributes?:unknown;regions?:unknown;districts?:{id:string}[]};
 // D2已明确调整转让折价；这些旧功能测试按调参前该值比较，D2另核对唯一经济差异。
 if(copy.rescue)copy.rescue.saleBookDiscount=beforeBalance.rescue.saleBookDiscount;
 delete copy.bots;delete copy.sessions;delete copy.capitalRescue;delete copy.housingPolicy;delete copy.compliance;delete copy.siteAttributes;delete copy.regions;
 if(copy.districts)copy.districts=copy.districts.filter(d=>d.id!=='outer');
 // 2026-10-27 游戏性审计新增：开局新手地块与地块规模成长。
 if(copy.land){delete copy.land.starterParcels;delete copy.land.starterMaxCashShare;delete copy.land.scale;}
 // 2026-10-27 审计 G01 后：新增溢价单独弹性；营销敏感度 4→6 按调参前值比较（另由 balance-migration 核对）。
 if(copy.sales)delete copy.sales.premiumElasticity;
 if(copy.marketing&&'spendSensitivity' in copy.marketing)copy.marketing.spendSensitivity=4;
 // 2026-10-27 审计 G06：品牌分阶段展示与优质交付加分。
 if(copy.quality){delete copy.quality.excellentThreshold;delete copy.quality.excellentBrandGain;}
 if(copy.marketing)delete copy.marketing.brandTiers;
 // 审计 G05：产品线经济系数（缺省按高层基准，机器人不选择）。
 delete (copy as {products?:unknown}).products;
 // 2026-10-28 回合制：季节/政策事件与员工体系（新功能参数）。
 delete (copy as {turns?:unknown}).turns;delete (copy as {seasons?:unknown}).seasons;delete (copy as {staff?:unknown}).staff;
 return copy;
}
export function preB9State<T>(value:T):T {
 const copy=structuredClone(value) as T & {session?:unknown;rules?:unknown;capital?:unknown;compliance?:unknown;market?:{policies?:unknown;districts?:unknown;priceIndex:Record<string,number>};rivals?:{company:unknown}[]};
 delete copy.session;delete copy.rules;delete copy.capital;delete copy.compliance;
 if(copy.market){delete copy.market.policies;delete copy.market.districts;delete copy.market.priceIndex.outer;}
 if(copy.rivals)for(const rival of copy.rivals)rival.company=preB9State(rival.company);
 return copy;
}
