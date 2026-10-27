import type{Game}from'../game.ts';import{acquisitionQuote,type CommandResult}from'../sim/index.ts';import{esc,yi}from'./format.ts';
/** 页面内确认；只保留目标ID和弹窗状态，经营变更统一发Game.issue。 */
export class AcquisitionController {
 private game:Game;private dialog:HTMLDialogElement;private selected:{rivalId:string;projectId:string}|null=null;private onResult:(r:CommandResult)=>void;
 constructor(game:Game,dialog:HTMLDialogElement,onResult:(r:CommandResult)=>void){this.game=game;this.dialog=dialog;this.onResult=onResult;dialog.addEventListener('click',e=>{const act=(e.target as HTMLElement).closest<HTMLElement>('[data-acq]')?.dataset.acq;if(act==='cancel')dialog.close();else if(act==='confirm'&&this.selected){const r=game.issue({type:'acquireProject',...this.selected});if(r.ok)dialog.close();else{const error=dialog.querySelector('[data-acq-error]');if(error)error.textContent=r.error??'收购未完成';}this.onResult(r);}});}
 open(rivalId:string,projectId:string){
  const s=this.game.state,q=acquisitionQuote(s,rivalId,projectId,this.game.config),rival=s.rivals.find(r=>r.id===rivalId),p=rival?.company.projects.find(p=>p.id===projectId);
  if(!q||!p){this.onResult({ok:false,error:'项目已不在违约收购清单'});return;}
  this.game.setSpeed(0);this.selected={rivalId,projectId};
  this.dialog.innerHTML=`<h2 id="acquisition-title">收购 ${esc(p.name)}</h2><p class="small muted">卖方：${esc(rival!.name)}。按本次报价支付现金，承接该公司所持项目权益和交付责任。</p><div class="report-section"><table><tbody><tr><th>本次收购现金</th><td>${yi(q.price)}</td></tr><tr><th>随项目承接监管款</th><td>${yi(q.escrow)}</td></tr><tr><th>预收交付义务</th><td>${yi(q.contracts)}</td></tr><tr><th>待付土地尾款</th><td>${yi(q.landPayable)}</td></tr><tr><th>剩余建安预算</th><td>${yi(q.remainingBuild)}</td></tr></tbody></table></div><p class="small warn-text">监管款仍受监管，须按工程和销售情况释放。原借款及商票留在卖方。收购后仍须筹措施工与交付资金，建安预算未计未来意外支出。</p>${q.price===0?'<p class="small warn-text">零对价项目仍有成本和义务，不会从违约卖方领取现金补贴。</p>':''}<p class="danger-text" data-acq-error role="status"></p><div class="row"><button class="ghost" data-acq="cancel">暂不收购</button><button data-acq="confirm" ${s.cash<q.price?'disabled':''}>确认收购 · 支付 ${yi(q.price)}</button></div>`;
  if(!this.dialog.open)this.dialog.showModal();
 }
}
