import type {Config} from './config.ts';
import type {GameState,SiteAttributes,Tile,Project} from './types.ts';
import {randomRange,nextRandom} from './rng.ts';
import {terrainAt,MAP_SIZE} from './map.ts';
export const sitePriceFactor=(a?:SiteAttributes)=>a?.priceFactor??1;
export const siteCostFactor=(a?:SiteAttributes)=>a?.costFactor??1;
export const siteDurationFactor=(a?:SiteAttributes)=>a?.durationFactor??1;
/** 挂牌时确定地块条件；旧地块缺省不追加属性。 */
export function generateSiteAttributes(s:GameState,c:Config,tiles:Tile[],mapId:string):SiteAttributes|undefined {
 if(!c.siteAttributes.enabled)return undefined;
 const choices=Object.entries(c.siteAttributes.slopes).filter(([,v])=>v.weight>0);if(!choices.length)throw Error('至少一种坡度须有正权重');
 let slope=choices[0][0] as SiteAttributes['slope'];
 if(choices.length>1){let x=nextRandom(s)*choices.reduce((n,[,v])=>n+v.weight,0);for(const [key,v]of choices){x-=v.weight;if(x<0){slope=key as typeof slope;break;}}}
 const near=(type:'river'|'hill',radius:number)=>tiles.some(([i,j])=>{for(let x=Math.max(0,i-radius);x<=Math.min(MAP_SIZE-1,i+radius);x++)for(let y=Math.max(0,j-radius);y<=Math.min(MAP_SIZE-1,j+radius);y++)if(Math.abs(x-i)+Math.abs(y-j)<=radius&&terrainAt(x,y,mapId)===type)return true;return false;});
 const river=near('river',c.siteAttributes.riverDistance),mountain=near('hill',c.siteAttributes.mountainDistance),scenery=river&&mountain?'both':river?'river':mountain?'mountain':'none',terms=c.siteAttributes.slopes[slope];
 return{slope,scenery,costFactor:terms.costFactor,durationFactor:terms.durationFactor,priceFactor:c.siteAttributes.scenery[scenery]};
}
/** 无随机数迁移；人口为模拟初值，不虚构加入前的月度历史。 */
export function initDistrictMarkets(s:GameState,c:Config){
 for(const d of c.districts)s.market.priceIndex[d.id]??=1;
 if(!c.regions.enabled)return;
 s.market.districts??={};
 for(const d of c.districts)if(!s.market.districts[d.id]){const initial=c.regions.initial[d.id as keyof typeof c.regions.initial];s.market.districts[d.id]={population:initial.population,netInflow:0,stockArea:[s,...(s.rivals??[]).map(r=>r.company)].flatMap(company=>company.projects).filter(p=>p.districtId===d.id&&!['land','sold','abandoned','closed'].includes(p.stage)&&p.progress+1e-9>=c.construction.presaleProgress).reduce((n,p)=>n+Math.max(0,p.saleableArea-p.soldArea),0),salesHistory:[],absorptionMonths:null,sinceDay:s.day};}
}
export function updateDistrictPopulation(s:GameState,c:Config){
 if(!c.regions.enabled)return;initDistrictMarkets(s,c);
 for(const d of c.districts){const m=s.market.districts![d.id],base=c.regions.initial[d.id as keyof typeof c.regions.initial];const flow=Math.round(base.monthlyInflow*(1+(c.cycle.phases[s.market.phaseIndex].absorption-1)*c.regions.cycleSensitivity)*(1+randomRange(s,-c.regions.inflowNoise,c.regions.inflowNoise)));m.netInflow=Math.max(-m.population,flow);m.population+=m.netInflow;}
}
type SalesStart={project:Project;area:number};
export function collectSalesStart(s:GameState):SalesStart[]{return[s,...s.rivals.map(r=>r.company)].flatMap(company=>company.projects.filter(p=>p.stage!=='sold'&&p.stage!=='abandoned').map(project=>({project,area:project.soldArea})));}
/** 全部公司收月后汇总；引用月初项目识别当月真实增量，收购不会重复计旧销量。 */
export function closeDistrictMarkets(s:GameState,c:Config,start:SalesStart[]){
 if(!c.regions.enabled)return;initDistrictMarkets(s,c);
 const projects=[s,...s.rivals.map(r=>r.company)].flatMap(company=>company.projects);
 for(const d of c.districts){const m=s.market.districts![d.id];const sales=start.filter(x=>x.project.districtId===d.id).reduce((n,x)=>n+Math.max(0,x.project.soldArea-x.area),0);
  m.salesHistory.push(sales);if(m.salesHistory.length>c.regions.rollingSalesMonths)m.salesHistory.shift();
  m.stockArea=projects.filter(p=>p.districtId===d.id&&!['land','sold','abandoned','closed'].includes(p.stage)&&p.progress+1e-9>=c.construction.presaleProgress).reduce((n,p)=>n+Math.max(0,p.saleableArea-p.soldArea),0);
  const average=m.salesHistory.reduce((n,v)=>n+v,0)/m.salesHistory.length;m.absorptionMonths=m.stockArea<=0?0:average>0?m.stockArea/average:null;
 }
}
