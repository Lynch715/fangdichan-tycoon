import type {Game} from '../game.ts';
/** 正式财务页与验收页共用；所有变更交给Game.issue。 */
export function issueBondFromForm(game:Game,root:Document|HTMLElement){
 const amount=Number(root.querySelector<HTMLInputElement>('#bond-amt')?.value??0)*10000;
 const termMonths=Number(root.querySelector<HTMLSelectElement>('#bond-term')?.value??0);
 return game.issue({type:'borrow',channel:'bond',amount,termMonths});
}
