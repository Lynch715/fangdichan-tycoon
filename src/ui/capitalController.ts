import type{Game}from'../game.ts';
import{strategicQuote,restructuringQuote,calendar,type Command,type CommandResult}from'../sim/index.ts';
import{esc,pct,yi}from'./format.ts';
type CapitalCommand=Extract<Command,{type:'strategicInvestment'|'restructureDebt'}>;
/** 页面内方案确认；只保存报价与选项，实际经营修改由Game.issue进行。 */
export class CapitalController {
 selectedShare:number;
 private game:Game;private dialog:HTMLDialogElement;private command:CapitalCommand|null=null;private signature='';private onResult:(r:CommandResult)=>void;
 constructor(game:Game,dialog:HTMLDialogElement,onResult:(r:CommandResult)=>void){this.game=game;this.selectedShare=game.config.capitalRescue.strategic.shares[0];this.dialog=dialog;this.onResult=onResult;dialog.addEventListener('click',e=>{const act=(e.target as HTMLElement).closest<HTMLElement>('[data-capital-act]')?.dataset.capitalAct;if(act==='cancel')dialog.close();if(act!=='confirm'||!this.command)return;const q=this.quote(this.command);if(JSON.stringify(q)!==this.signature){this.open(this.command);const error=dialog.querySelector('[data-capital-error]');if(error)error.textContent='经营状态已变化，方案已更新，请重新核对后确认。';return;}const r=game.issue(this.command);if(r.ok)dialog.close();else{const error=dialog.querySelector('[data-capital-error]');if(error)error.textContent=r.error??'操作未完成';}this.onResult(r);});}
 private quote(cmd:CapitalCommand){return cmd.type==='strategicInvestment'?strategicQuote(this.game.state,this.game.config,cmd.share):restructuringQuote(this.game.state,this.game.config);}
 open(command:CapitalCommand){
  if(command.type==='strategicInvestment')this.selectedShare=command.share;
  this.game.setSpeed(0);this.command=command;const s=this.game.state,c=this.game.config,q=this.quote(command);this.signature=JSON.stringify(q);
  const date=(day:number)=>{const x=calendar(c,day);return`${x.year}年${x.month}月${x.day}日`;};
  const strategic=command.type==='strategicInvestment';let details='';
  if('amount'in q)details=`<p>公司本次到账 <b>${yi(q.amount)}</b>，新投资人持有增发后 ${pct(q.share)} 股权。</p><p class="small muted">投前估值 ${yi(q.preMoney)}；本金不需归还、不计利息，资金进入公司账户。低估值增发会降低原股东的权益价值。</p>`;
  else details=`<p>借款 ${yi(q.principal)} 延后 ${c.capitalRescue.restructuring.extensionMonths} 个月；债权人获得增发后 ${pct(q.share)} 股权。</p><div class="report-section"><table><thead><tr><th>借款及本金</th><th>原到期</th><th>新到期</th></tr></thead><tbody>${q.debts.map(d=>`<tr><th>${esc(c.finance.channels[d.channel].name)} ${esc(d.id)}<br>${yi(d.principal)} · 年息 ${pct(d.rate,1)}</th><td>${date(d.oldDay)}</td><td>${date(d.newDay)}</td></tr>`).join('')}</tbody></table></div><p class="small warn-text">没有新增现金，本金和利息继续偿付。商票、提前到期部分和土地欠款不延期；评级触发条款仍有效。${s.cash<0?`当前现金缺口 ${yi(-s.cash)} 仍需另行补足。`:''}</p>`;
  this.dialog.innerHTML=`<h2 id="capital-title">${strategic?'引入战略投资者':'股权换债务展期'}</h2>${details}<p class="warn-text">创始人持股 ${pct(q.founderBefore,1)} → <b>${pct(q.founderAfter,1)}</b>。全部原股东同比稀释，执行后无法撤回。</p><p data-capital-error class="danger-text" role="status">${esc(q.error??'')}</p><div class="row"><button class="ghost" data-capital-act="cancel">暂不执行</button><button data-capital-act="confirm" ${q.error?'disabled':''}>${strategic?'确认引入战投':'确认重组债务'}</button></div>`;
  if(!this.dialog.open)this.dialog.showModal();
 }
}
