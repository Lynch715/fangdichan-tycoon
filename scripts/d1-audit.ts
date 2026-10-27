import{writeFileSync}from'node:fs';import assert from'node:assert/strict';
import{runGame,conservative,aggressive,replay,computeMetrics}from'../src/sim/index.ts';
const rows=[];
for(const [name,strategy]of [['conservative',conservative],['aggressive',aggressive]]as const){
 const counts:Record<string,number>={};
 for(const seed of [1,7,32]){
  const {state,log}=runGame(seed,strategy,10);assert.deepEqual(replay(seed,log,state.day),state);
  for(const {command:c}of log){const key=c.type==='borrow'?c.type+':'+c.channel:c.type==='startProject'?c.type+':'+c.contractor:c.type;counts[key]=(counts[key]??0)+1;}
  const opening=state.reports.opening.cash,first=state.reports.months[0]?.opening.cash??opening;
  assert(Math.abs(first+state.reports.journal.reduce((n,e)=>n+e.cash,0)-state.cash)<1e-5);
  rows.push({name,seed,day:state.day,status:state.status,cash:state.cash,equity:computeMetrics(state).equity,commands:log.length});
 }
 console.log(name,counts);rows.push({name,counts});
}
writeFileSync('tests/acceptance/d1-audit.json',JSON.stringify(rows,null,2)+'\n');
