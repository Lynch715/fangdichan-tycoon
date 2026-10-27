// 只使用冻结v14内核重建B12浏览器实际导出，不依赖后续模式规则。
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {restore,validateSave} from '../src/legacy-v14/restore.ts';

const inputs=[
 'b12-pressure-browser-save.json',
 'b12-deficit-browser-save.json',
 'b12-old-browser-save.json',
 'b12-old-continued-browser-save.json',
 'b12-main-old-save.json',
];
const fixtures=inputs.map(name=>{
 const save=validateSave(JSON.parse(readFileSync('tests/acceptance/'+name,'utf8')));
 if(!save)throw new Error('无效的B12基线：'+name);
 const state=restore(save);
 return {name,save,sha256:createHash('sha256').update(JSON.stringify(state)).digest('hex'),cash:state.cash,day:state.day,rng:state.rng};
});
writeFileSync('tests/acceptance/b13-v14-golden.json',JSON.stringify(fixtures,null,2)+'\n');
console.log(fixtures.map(({name,day,sha256})=>({name,day,sha256})));
