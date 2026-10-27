import {writeFileSync} from 'node:fs';
import {newGame,applyCommand,stepDay,computeMetrics,borrowCapacity,activeProject,priceRestricted,strategicQuote,restructuringQuote,replay,type Command,type LoggedCommand,type SessionOptions,type GameState,type Config} from '../src/sim/index.ts';
import {createHash} from 'node:crypto';

function rescue(s:GameState,c:Config):Command[]{
 const cmds:Command[]=[];
 for(const p of s.projects){
  if(p.stage==='land')cmds.push({type:'startProject',projectId:p.id,contractor:'standard'});
  if(activeProject(p)&&priceRestricted(s,c)&&p.filingDueDay===null&&p.filedPrice===null)cmds.push({type:'filePrice',projectId:p.id});
 }
 if(s.day%c.time.daysPerMonth!==1)return cmds;
 const soon=s.debts.filter(d=>d.maturityDay<=s.day+6*c.time.daysPerMonth).reduce((n,d)=>n+d.principal,0);
 const restructuring=restructuringQuote(s,c);
 if(soon>s.cash&&!restructuring.error)cmds.push({type:'restructureDebt'});
 const investment=strategicQuote(s,c,.4);
 if(s.cash<20000&&!investment.error)cmds.push({type:'strategicInvestment',share:.4});
 return cmds;
}
function sales(s:GameState,c:Config):Command[]{
 const cmds=rescue(s,c);
 if(s.day%c.time.daysPerMonth!==1)return cmds;
 for(const p of s.projects)if(p.stage==='construction'){
  const cap=borrowCapacity(c,s,'devLoan',p.id).max;
  if(cap>1000)cmds.push({type:'borrow',channel:'devLoan',projectId:p.id,amount:cap});
 }
 let budget=s.cash-s.projects.filter(activeProject).reduce((n,p)=>n+(p.landCost-p.landPaid)+Math.max(0,p.buildCost-p.buildSpent)*.4,0)-20000;
 for(const a of [...s.auctions].sort((a,b)=>a.startPrice-b.startPrice)){
  if(a.playerBid!==null)continue;
  const amount=Math.min(Math.floor(a.startPrice*1.05),a.auction?.priceCap??Infinity);
  if(amount<budget){cmds.push({type:'bid',parcelId:a.id,amount});budget-=amount;}
 }
 return cmds;
}
const rows=[];
for(const challenge of ['sales','downturn','delivery'] as const)for(const seed of [1,7,32]){
 const options:SessionOptions={mode:'challenge',difficulty:'standard',challenge};
 const state=newGame(seed),log:LoggedCommand[]=[];
 const issue=(command:Command)=>{const r=applyCommand(state,command);if(r.ok)log.push({day:state.day,command});return r;};
 if(!issue({type:'startGame',options}).ok)throw new Error('无法开局');
 const config=state.rules!,end=state.session!.targetDay!;
 const initial={cash:state.cash,metrics:computeMetrics(state),tier:state.regulation.tier,status:state.status,projects:state.projects.length,targetDay:end};
 while(state.day<end&&state.status!=='bankrupt'&&state.session!.result==='running'){
  for(const cmd of (challenge==='sales'?sales:rescue)(state,config))issue(cmd);
  stepDay(state);state.pauses=[];
 }
 const restored=replay(seed,log,state.day);
 if(JSON.stringify(restored)!==JSON.stringify(state))throw new Error('完整重放不一致');
 const row={challenge,seed,initial,day:state.day,status:state.status,result:state.session!.result,reason:state.session!.reason,sales:state.session!.sales,cash:state.cash,equity:computeMetrics(state).equity,land:state.stats.landWon,log:log.length,sha256:createHash('sha256').update(JSON.stringify(state)).digest('hex')};
 rows.push(row);console.log(row);
 writeFileSync(`tests/acceptance/b13-${challenge}-${seed}.json`,JSON.stringify({version:15,seed,day:state.day,log,revision:1},null,2)+'\n');
}
writeFileSync('tests/acceptance/b13-scenarios.json',JSON.stringify(rows,null,2)+'\n');
