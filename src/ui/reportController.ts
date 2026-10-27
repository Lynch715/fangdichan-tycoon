import type{Game}from'../game.ts';import type{Config}from'../sim/config.ts';import{reportsPanel,type ReportView}from'./reports.ts';
/** 只管理弹窗/速度；所有经营数据仍由Game指令与stepDay生成。 */
export class ReportController{
 private game:Game;private dialog:HTMLDialogElement;
 private view:ReportView='month';private selection:string|undefined;private seenClosed=new Set<string>();private seenBankruptcy=false;
 suspended=false;
 constructor(game:Game,_config:Config,dialog:HTMLDialogElement){
  this.game=game;this.dialog=dialog;this.reset();
  dialog.addEventListener('click',e=>{const act=(e.target as HTMLElement).closest<HTMLElement>('[data-act]');if(act?.dataset.act==='close-reports')dialog.close();else if(act?.dataset.act==='report-view')this.open(act.dataset.view as ReportView);});
  dialog.addEventListener('change',e=>{if(['report-period','report-project'].includes((e.target as HTMLElement).id)){this.selection=(e.target as HTMLSelectElement).value;this.paint();}});
 }
 reset(){this.seenClosed=new Set(this.game.state.reports.closedProjects);this.seenBankruptcy=false;this.dialog.close();}
 open(view:ReportView='month',selection?:string){this.view=view;this.selection=selection;this.game.setSpeed(0);this.paint();if(!this.dialog.open)this.dialog.showModal();}
 private paint(){this.dialog.innerHTML=reportsPanel(this.game.config,this.game.state,this.view,this.selection);this.dialog.scrollTop=0;}
 sync(){
  if(this.suspended)return;
  const s=this.game.state,fresh=s.reports.closedProjects.filter(id=>!this.seenClosed.has(id));fresh.forEach(id=>this.seenClosed.add(id));
  if(s.status==='bankrupt'&&!this.seenBankruptcy){this.seenBankruptcy=true;this.open('review');}
  else if(fresh.length)this.open('projects',fresh.join(','));
 }
}
