import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {runGame,conservative,aggressive,replay,defaultConfig,currentReport,statements} from '../src/sim/index.ts';
import {restore,validateSave} from '../src/save.ts';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const results=[];
for(const seed of[1,2,7,13,32])for(const [name,strategy]of[['idle',()=>[]],['conservative',conservative],['aggressive',aggressive]]as const){
 const {state,log}=runGame(seed,strategy,10),rebuilt=replay(seed,log,state.day);assert.equal(hash(rebuilt),hash(state));
 for(const s of[state,...state.rivals.map(r=>r.company)]){
  const initial=s.opponentId?defaultConfig.rivals.companies.find(r=>r.id===s.opponentId)!.cash:defaultConfig.start.cash;
  assert.ok(Math.abs(s.reports.journal.reduce((sum,e)=>sum+e.cash,initial)-s.cash)<1e-4);
  for(const report of [...s.reports.months,currentReport(s)]){const t=statements(s,[report])!;assert.ok(Math.abs(t.opening.cash+t.netCash-t.closing.cash)<1e-4);}
  for(const p of s.projects)if(p.auction){const deductions=p.auction.required.reduce((n,r)=>n+r.rate,0)+p.auction.extraAmenityRate;assert.ok(Math.abs(p.saleableArea-p.buildArea*(defaultConfig.sales.saleableRatio-deductions))<1e-6);}
 }
 results.push({seed,strategy:name,day:state.day,commands:log.length,sha256:hash(state)});
}
const browser=[];for(const name of['amenity','lottery']){const path=`tests/acceptance/b7-${name}-browser-save.json`,save=validateSave(JSON.parse(readFileSync(path,'utf8')))!;const s=restore(save);const parcel=name==='amenity'?'江津 L37':'璧山 L62';const owner=[s,...s.rivals.map(r=>r.company)].find(x=>x.projects.some(p=>p.name===parcel))!;const p=owner.projects.find(p=>p.name===parcel)!;assert.equal(p.landCost,name==='amenity'?6013:9374);assert.equal(p.auction?.extraAmenityRate,name==='amenity'?.12:0);assert.equal(owner===s,name==='amenity');browser.push({name,seed:save.seed,day:save.day,commands:save.log,owner:owner.opponentId??'player',saleableArea:p.saleableArea,landCost:p.landCost,sha256:hash(s)});}
writeFileSync('tests/acceptance/b7-audit.json',JSON.stringify({results,browser},null,2)+'\n');console.log(JSON.stringify({replayed:results.length,browser},null,2));
