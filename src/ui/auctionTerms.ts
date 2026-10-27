import type {AuctionTerms,Project} from '../sim/types.ts';
import {pct} from './format.ts';
export function auctionTermsMarkup(terms:AuctionTerms|undefined,area:number):string {
 if(!terms)return '公开竞价 · 无配建要求';
 const name={ascending:'公开竞价',lottery:'限地价后摇号',amenity:'限地价后竞配建'}[terms.kind];
 const required=terms.required.map(r=>`${r.kind==='school'?'学校':'保障房'} ${pct(r.rate,1)}（${Math.round(area*r.rate)} ㎡）`).join('、')||'无挂牌配建';
 return `${name} · ${required}${terms.kind==='lottery'?'；至少两家触顶后等概率摇号':''}`;
}
export function projectAmenityMarkup(p:Project):string {
 if(!p.auction)return '';
 return `<span class="small muted">${auctionTermsMarkup(p.auction,p.buildArea)}；额外保障房 ${pct(p.auction.extraAmenityRate,1)} · 实际可售 ${(p.saleableArea/10000).toFixed(2)} 万㎡，配建计入建安成本。</span>`;
}
