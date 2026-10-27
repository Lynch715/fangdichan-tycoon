import beforeBalance from '../../src/legacy-v15/config.json' with {type:'json'};
/** Project B9 and later additions out of historical comparisons; all older fields remain exact. */
export function preB9Config<T>(value:T):T {
 const copy=structuredClone(value) as T & {rescue?:{saleBookDiscount:number};bots?:unknown;sessions?:unknown;capitalRescue?:unknown;housingPolicy?:unknown;compliance?:unknown;siteAttributes?:unknown;regions?:unknown;districts?:{id:string}[]};
 // D2已明确调整转让折价；这些旧功能测试按调参前该值比较，D2另核对唯一经济差异。
 if(copy.rescue)copy.rescue.saleBookDiscount=beforeBalance.rescue.saleBookDiscount;
 delete copy.bots;delete copy.sessions;delete copy.capitalRescue;delete copy.housingPolicy;delete copy.compliance;delete copy.siteAttributes;delete copy.regions;
 if(copy.districts)copy.districts=copy.districts.filter(d=>d.id!=='outer');
 return copy;
}
export function preB9State<T>(value:T):T {
 const copy=structuredClone(value) as T & {session?:unknown;rules?:unknown;capital?:unknown;compliance?:unknown;market?:{policies?:unknown;districts?:unknown;priceIndex:Record<string,number>};rivals?:{company:unknown}[]};
 delete copy.session;delete copy.rules;delete copy.capital;delete copy.compliance;
 if(copy.market){delete copy.market.policies;delete copy.market.districts;delete copy.market.priceIndex.outer;}
 if(copy.rivals)for(const rival of copy.rivals)rival.company=preB9State(rival.company);
 return copy;
}
