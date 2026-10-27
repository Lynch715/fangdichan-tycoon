import type {Config} from '../sim/config.ts';
import type {GameState,Project} from '../sim/types.ts';
import {estimateTransfer} from '../estimates/transfer.ts';
import {pct,yi} from './format.ts';

export function transferMarkup(c:Config,s:GameState,p:Project):string{
 const e=estimateTransfer(c,s,p),q=e.current,a=e.afterDelivery;
 const reason=q.price<0?`<p class="danger-text">报价为何为负：${e.contracts>0?'未交付项目的预收房款仍计为负债，已释放到公司的房款不再留在项目监管账户。':''}项目存货与剩余监管款不足以覆盖${e.contracts>0?'交付义务及':''}土地尾款，买方要求补付差额。</p>`:q.net<0?'<p class="warn-text">项目报价为正，但不足以结清项目融资，所以转让仍需补付现金。</p>':'';
 return `<div class="transfer-explanation small">
  <p class="muted">账面净资产为正时按 ${pct(c.rescue.saleBookDiscount)} 折价；为负时按倒数折价补足义务。报价 ${yi(q.price)}，先结清项目融资 ${yi(q.debt)}；买方承接余款、监管账户与交付。</p>
  ${reason}
  ${q.price<0?`<p class="muted">本公司权益口径：存货 ${yi(e.inventory)} ＋ 监管款 ${yi(e.escrow)} − 预收房款负债 ${yi(e.contracts)} − 土地尾款 ${yi(e.landPayable)}。</p>`:''}
  ${a?`<p><b>交付后再转让 · 预计报价 ${yi(a.price)}</b><br>按当前项目融资 ${yi(a.debt)} 扣除后，预计${a.net>=0?`净回笼 ${yi(a.net)}`:`需补付 ${yi(-a.net)}`}。</p>
   <details class="estimate-notes" data-key="transfer-estimate-${p.id}"><summary>估算假设与交付前支出</summary>
    <p>按当前已售面积保持不变、余下工程按当前节奏完成${p.stage==='land'?'（未开工按标准总包）':''}、土地尾款付清估算；交付时预收款负债结转，同时扣除已售房屋成本，只对剩余存货报价。合作项目按本公司权益计算，收购项目保留购买成本基础。</p>
    <p>交付前尚需承担工程款 ${yi(a.remainingBuild)}、土地尾款 ${yi(a.landPayment)}；当前剩余监管款 ${yi(a.escrowRelease)} 预计在交付前及交付时陆续释放，已归公司，不重复计入转让报价。上述款项均未计入所示转让净回笼，不能将报价变化视作新增利润。</p>
    <p>项目债务按当前本金保持不变，仅用于同口径比较；实际到期仍需兑付，新增借款、商票或还本都会改变净回笼。未计后续销售、融资利息、事故及处罚，假设资金足够完成交付${p.diverted>0?'且违规挪用已处理':''}。若交付时已清盘则没有可转让项目，剩余债务仍须偿还。</p>
   </details>`:''}
 </div>`;
}
