import type {Game} from '../game.ts';
import {auctionEstimateMarkup} from './panels.ts';
import {estimateLand} from '../estimates/land.ts';
import {bidAffordability} from './affordability.ts';
/** 报价草稿只在UI中保存；仅正式提交调用Game.issue。正式页面/验收页共用。 */
export class AuctionController {
 readonly bids=new Map<string,string>();
 readonly amenities=new Map<string,string>();
 private game:Game;
 private root:Document|HTMLElement;
 constructor(game:Game,root:Document|HTMLElement,report:(result:{ok:boolean;error?:string})=>void){
  this.game=game;this.root=root;
  root.addEventListener('input',e=>{
   const input=e.target;if(!(input instanceof HTMLInputElement)||!input.dataset.estimate)return;
   const id=input.dataset.estimate;(input.id.startsWith('amenity-')?this.amenities:this.bids).set(id,input.value);this.refresh(id);
  });
  root.addEventListener('click',e=>{
   const button=(e.target as HTMLElement).closest<HTMLElement>('[data-act]'),id=button?.dataset.id;
   if(!button||!id)return;
   if(button.dataset.act==='bid-cap'){
    const a=game.state.auctions.find(a=>a.id===id),input=this.input(`bid-${id}`);
    if(a?.auction?.priceCap!=null&&input){input.value=String(a.auction.priceCap/10000);this.bids.set(id,input.value);this.refresh(id);}
   }else if(button.dataset.act==='bid'){
    const extra=this.input(`amenity-${id}`),a=game.state.auctions.find(a=>a.id===id);
    // 资金明显不够时先确认，避免新手一口价把公司拍破产
    const e=a?estimateLand(game.config,game.state,a,this.amount(id),'standard',extra&&!extra.disabled?Number(extra.value)/100:0):null;
    const f=a&&e?bidAffordability(game.config,game.state,a,e.peakFunding):null;
    if(f?.level==='danger'&&!confirm(`${f.text}。\n\n建议换一块起拍价更低的地。仍要出价吗？`))return;
    report(game.issue({type:'bid',parcelId:id,amount:this.amount(id),...(extra?{amenityRate:!extra.disabled?Number(extra.value)/100:0}:{})}));
   }
  });
 }
 private input(id:string){return this.root.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`);}
 private amount(id:string){return Math.round(Number(this.input(`bid-${id}`)?.value??0)*10000*1e6)/1e6;}
 refresh(id:string){
  const a=this.game.state.auctions.find(a=>a.id===id),target=this.root.querySelector<HTMLElement>(`#${CSS.escape(`estimate-${id}`)}`);if(!a||!target)return;
  const extra=this.input(`amenity-${id}`);if(extra)extra.disabled=this.amount(id)!==a.auction?.priceCap;
  const html=auctionEstimateMarkup(this.game.config,this.game.state,a,this.amount(id),extra&&!extra.disabled?Number(extra.value)/100:0);
  if(target.innerHTML!==html){const open=target.querySelector('details')?.open??false;target.innerHTML=html;if(open)target.querySelector('details')!.open=true;}
 }
 prune(){for(const map of[this.bids,this.amenities])for(const id of map.keys())if(!this.game.state.auctions.some(a=>a.id===id))map.delete(id);}
}
