import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import{restore,validateSave}from'../src/legacy-v15/restore.ts';
const names=['b13-old-browser-save.json','b13-cancel-browser-save.json','b13-delivery-opening-browser-save.json','b13-sandbox-browser-save.json','b13-sales-win-browser-save.json','b13-downturn-win-browser-save.json','b13-delivery-win-browser-save.json','b13-delivery-failed-browser-save.json','b13-career-browser-save.json','b14-negative-save.json','b14-sold-browser-save.json'];
const fixtures=names.map(name=>{const save=validateSave(JSON.parse(readFileSync('tests/acceptance/'+name,'utf8')));assert(save);const s=restore(save);return{name,save,sha256:createHash('sha256').update(JSON.stringify(s)).digest('hex'),cash:s.cash,day:s.day,rng:s.rng};});
writeFileSync('tests/acceptance/d2-v15-golden.json',JSON.stringify(fixtures,null,2)+'\n');console.log(fixtures.map(({name,sha256})=>({name,sha256})));
