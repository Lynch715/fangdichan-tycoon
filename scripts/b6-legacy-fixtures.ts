// 只在冻结B5e完工v6时生成；后续不得用新内核重写该基线。
import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';
import{restore,validateSave}from'../src/legacy-v6/restore.ts';
const paths=['b5-cleared.json','b5-bankrupt.json','b5-old.json'];
const fixtures=[];
for(const file of paths){const save=validateSave(JSON.parse(await readFile('tests/acceptance/'+file,'utf8')))!;const state=restore(save);fixtures.push({name:file,save,sha256:createHash('sha256').update(JSON.stringify(state)).digest('hex'),day:state.day,cash:state.cash,rng:state.rng,months:state.reports.months.length});}
const prior=validateSave(JSON.parse(await readFile('tests/acceptance/b5-old.json','utf8')))!;
const tail={...prior,day:780,log:[...prior.log,{day:750,command:{type:'setMarketing',projectId:'P4',rate:.06}}]};const state=restore(tail as typeof prior);
fixtures.push({name:'v5-boundary-v6-tail',save:tail,sha256:createHash('sha256').update(JSON.stringify(state)).digest('hex'),day:state.day,cash:state.cash,rng:state.rng,months:state.reports.months.length});
await writeFile('tests/acceptance/b6-v6-golden.json',JSON.stringify(fixtures,null,2)+'\n');
