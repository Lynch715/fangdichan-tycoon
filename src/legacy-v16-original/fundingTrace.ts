// 仅ledger内部调用。逐笔现金归因，先花自有现金；偿债优先归还未使用借款。
import type{ComplianceState,LedgerKind,ChannelId}from'./types.ts';
type Context={compliance?:ComplianceState};
export function trackCash(s:Context,kind:LedgerKind,cash:number,parcelId?:string,repaymentChannel?:ChannelId):number {
 const t=s.compliance;if(!t||cash===0)return 0;
 let used=0;
 if(cash>0){
  if(kind==='loan')t.borrowedCash+=cash;
  if(kind==='depositRefund'&&parcelId){t.borrowedCash+=Math.min(cash,t.deposits[parcelId]??0);delete t.deposits[parcelId];}
 }else{
  const clean=Math.max(0,t.cash-t.borrowedCash);
  used=Math.min(t.borrowedCash,kind==='repay'&&repaymentChannel!=='paper'?-cash:Math.max(0,-cash-clean));
  t.borrowedCash-=used;
  // 以其他现金偿还现金借款后，仍锁定在保证金中的相应资金改为自有资金。商票兑付是经营支出。
  if(kind==='repay'&&repaymentChannel!=='paper'){let rest=-cash-used;for(const id of Object.keys(t.deposits)){const cleared=Math.min(rest,t.deposits[id]);t.deposits[id]-=cleared;rest-=cleared;if(rest<=0)break;}}
  if(kind==='deposit'&&parcelId)t.deposits[parcelId]=(t.deposits[parcelId]??0)+used;
 }
 t.cash+=cash;t.borrowedCash=Math.max(0,Math.min(t.borrowedCash,Math.max(0,t.cash)));
 return used;
}
export function takeDepositFunding(s:Context,parcelId:string){const t=s.compliance;if(!t)return 0;const amount=t.deposits[parcelId]??0;delete t.deposits[parcelId];return amount;}
