import{writeFile}from'node:fs/promises';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import{newGame,stepDay,applyCommand,conservative,aggressive,replay,computeMetrics,annualRanking,acquisitionQuote,defaultConfig,type Strategy,type LoggedCommand}from'../src/sim/index.ts';import{restore,validateSave}from'../src/save.ts';import*as V7 from'../src/legacy-v7/index.ts';
const acquire:Strategy=(s,c)=>{const commands=conservative(s,c);if(s.day%c.time.daysPerMonth!==1)return commands;let budget=s.cash*.4;for(const r of s.rivals)for(const p of r.company.projects){const q=acquisitionQuote(s,r.id,p.id,c);if(q&&q.price<=budget){commands.push({type:'acquireProject',rivalId:r.id,projectId:p.id});budget-=q.price;}}return commands;};
const rows=[],hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');let yearEnds=0;
for(const seed of[7,23,42,91,2026])for(const[name,strategy]of[['conservative',conservative],['aggressive',aggressive],['acquisition',acquire]]as const){
 const s=newGame(seed),log:LoggedCommand[]=[],snapshots=[];
 while(s.day<3600&&s.status!=='bankrupt'){
  for(const command of strategy(s,defaultConfig))if(applyCommand(s,command).ok)log.push({day:s.day,command});stepDay(s);s.pauses=[];
  if(s.day%360===0){const ranking=annualRanking(s,defaultConfig,s.day/360)!;assert.equal(ranking.missing.length,0);assert.deepEqual(Object.fromEntries(ranking.rows.map(r=>[r.id,r.equity])),Object.fromEntries([['player',computeMetrics(s).equity],...s.rivals.map(r=>[r.id,computeMetrics(r.company).equity])]));snapshots.push(ranking);yearEnds++;}
 }
 assert.equal(hash(replay(seed,log,s.day)),hash(s));for(const old of snapshots)assert.equal(hash(annualRanking(s,defaultConfig,old.year)),hash(old));
 rows.push({seed,strategy:name,day:s.day,yearsVerified:snapshots.length,acquired:s.projects.filter(p=>p.acquisition).length,rankings:snapshots.map(r=>({day:r.day,ranks:r.ranks}))});
}
const legacy=[];
for(const seed of[7,23,42,91,2026]){
 const s=V7.newGame(seed),snapshots=[];while(s.day<3600){V7.stepDay(s);if(s.day%360===0)snapshots.push({year:s.day/360,equities:Object.fromEntries([['player',V7.computeMetrics(s).equity],...s.rivals.map(r=>[r.id,V7.computeMetrics(r.company).equity])])});}
 const upgraded=restore(validateSave({version:7,seed,day:s.day,log:[]})!);for(const saved of snapshots){const r=annualRanking(upgraded,defaultConfig,saved.year)!;assert.equal(r.missing.length,0);assert.deepEqual(Object.fromEntries(r.rows.map(r=>[r.id,r.equity])),saved.equities);yearEnds++;}legacy.push({seed,yearsVerified:snapshots.length});
}
await writeFile('tests/acceptance/b6d-ranking-audit.json',JSON.stringify({nativeCases:rows.length,legacy7Cases:legacy.length,yearEndsVerified:yearEnds,replayIdentical:true,pastRankingsStable:true,rows,legacy},null,2)+'\n');console.log(`15 native + 5 legacy-v7 cases, ${yearEnds} actual year ends verified, replays and old years stable`);
