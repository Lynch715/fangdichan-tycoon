// 冻结B7完工v9时生成；以后只读此冻结内核，不用当前规则改写期望。
import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
import{restore,validateSave}from'../src/legacy-v9/restore.ts';
const input=[['amenity-browser',JSON.parse(readFileSync('tests/acceptance/b7-amenity-browser-save.json','utf8'))],['lottery-browser',JSON.parse(readFileSync('tests/acceptance/b7-lottery-browser-save.json','utf8'))],['native-default',{version:9,seed:1,day:1800,log:[]}],['old-v8',JSON.parse(readFileSync('tests/acceptance/b6d-main-after.json','utf8'))]]as const;
const out=input.map(([name,raw])=>{const save=validateSave(raw)!,s=restore(save);return{name,save,sha256:createHash('sha256').update(JSON.stringify(s)).digest('hex'),cash:s.cash,day:s.day,rng:s.rng};});writeFileSync('tests/acceptance/b8-v9-golden.json',JSON.stringify(out,null,2)+'\n');console.log(out.map(x=>({name:x.name,sha256:x.sha256})));
