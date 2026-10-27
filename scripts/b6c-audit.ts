import{writeFile}from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{runGame,conservative,aggressive,replay,rivalMetrics,defaultConfig,acquisitionQuote,type Strategy}from'../src/sim/index.ts';
const acquire:Strategy=(s,c)=>{
 const result=conservative(s,c);if(s.day%c.time.daysPerMonth!==1)return result;
 let budget=s.cash*.4;
 for(const r of s.rivals)for(const p of r.company.projects){const q=acquisitionQuote(s,r.id,p.id,c);if(q&&q.price<=budget){result.push({type:'acquireProject',rivalId:r.id,projectId:p.id});budget-=q.price;}}
 return result;
};
const rows=[];
for(const seed of[7,23,42,91,2026])for(const [name,strategy]of[['conservative',conservative],['aggressive',aggressive],['acquisition',acquire]]as const){
 const {state,log}=runGame(seed,strategy,10),restored=replay(seed,log,state.day),hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');assert.equal(hash(state),hash(restored));
 for(const company of[state,...state.rivals.map(r=>r.company)]){
  const opening=company.opponentId?defaultConfig.rivals.companies.find(p=>p.id===company.opponentId)!.cash:defaultConfig.start.cash;
  assert.ok(Math.abs(company.reports.journal.reduce((n,e)=>n+e.cash,opening)-company.cash)<1e-5);
  for(const month of company.reports.months){assert.ok(Math.abs(month.opening.cash+company.reports.journal.slice(month.fromEntry,month.toEntry).reduce((n,e)=>n+e.cash,0)-month.closing.cash)<1e-5);assert.ok(Number.isFinite(month.closing.equity));}
 }
 const active=[...state.projects,...state.rivals.flatMap(r=>r.company.projects)].filter(p=>!['sold','closed','abandoned'].includes(p.stage)),tiles=new Set<string>();for(const p of active)for(const t of p.tiles){const key=p.districtId+':'+t.join(',');assert.ok(!tiles.has(key),'active overlap '+key);tiles.add(key);}
 rows.push({seed,strategy:name,day:state.day,cash:state.cash,rivals:rivalMetrics(state),defaults:state.industry.events,acquired:state.projects.filter(p=>p.acquisition).length,replaySha256:hash(state)});
}
await writeFile('tests/acceptance/b6c-audit.json',JSON.stringify({cases:rows.length,replayIdentical:true,cashAudited:true,rows},null,2)+'\n');console.log(`${rows.length} seed/strategy cases: replay and all-company cash audit passed`);
