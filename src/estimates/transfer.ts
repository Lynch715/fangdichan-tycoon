// 固定销量的交付情景：只读估算，不推进状态、不预测随机事件或融资。
import type {Config} from '../sim/config.ts';
import type {GameState,Project} from '../sim/types.ts';
import {activeProject,transferQuote} from '../sim/features.ts';
import {projectInventory} from '../sim/finance.ts';

export function estimateTransfer(c:Config,s:GameState,p:Project){
 const owned=1-p.partnerShare,current=transferQuote(s,p,c);
 const inventory=projectInventory(p),escrow=(p.salesIn-p.escrowReleased)*owned;
 const contracts=p.stage==='delivered'?0:p.salesIn*owned,landPayable=(p.landCost-p.landPaid)*owned;
 if(!activeProject(p)||p.stage==='delivered')return {current,inventory,escrow,contracts,landPayable,afterDelivery:null};
 // 未开工时采用标准总包；已开工预算已包含总包和地块成本系数，不能重复乘。
 const budget=p.buildCost*(p.stage==='land'?c.construction.contractors.standard.costFactor:1);
 const remainingBuild=p.stage==='completed'?0:budget*Math.max(0,1-p.progress)*c.construction.paces[p.pace].costFactor;
 const delivered:Project={...p,stage:'delivered',progress:1,buildSpent:p.buildSpent+remainingBuild,landPaid:p.landCost,escrowReleased:p.salesIn};
 return {current,inventory,escrow,contracts,landPayable,afterDelivery:{
  ...transferQuote(s,delivered,c),remainingBuild:remainingBuild*owned,
  landPayment:landPayable,escrowRelease:escrow,
 }};
}
