import{writeFile,readFile,copyFile}from'node:fs/promises';import{newGame,applyCommand,stepDay,priceRestricted,defaultConfig,projectResult,type Command,type LoggedCommand}from'../src/legacy-v6/index.ts';
async function make(seed:number,bankrupt=false){
 const s=newGame(seed),log:LoggedCommand[]=[],issue=(command:Command)=>{const r=applyCommand(s,command);if(!r.ok)throw Error(r.error);log.push({day:s.day,command});};
 issue({type:'bid',parcelId:bankrupt?'L4':'L1',amount:bankrupt?192156:31146});while(s.day<30)stepDay(s);const p=s.projects[0];issue({type:'startProject',projectId:p.id,contractor:'standard'});
 while(bankrupt?s.status!=='bankrupt':p.stage!=='closed'){
  if(priceRestricted(s,defaultConfig)&&p.filedPrice===null&&p.filingDueDay===null&&p.stage!=='abandoned')issue({type:'filePrice',projectId:p.id});
  stepDay(s);if(s.day>2400)throw Error('验收场景未完成');
 }
 const name=bankrupt?'bankrupt':'cleared';
 for(const [label,day]of [[name,s.day],['before-'+name,s.day-1]]as const)await writeFile(`tests/acceptance/b5-${label}.json`,JSON.stringify({version:6,seed,day,log:log.filter(x=>x.day<=day),revision:0},null,2)+'\n');
 console.log(name,JSON.stringify({day:s.day,months:s.reports.months.length,entries:s.reports.journal.length,decisions:s.reports.decisions.length,result:projectResult(s,p)}));
}
await make(7);await make(8,true);await copyFile('tests/acceptance/b4-main-after.json','tests/acceptance/b5-old.json');
const cleared=JSON.parse(await readFile('tests/acceptance/b5-cleared.json','utf8'));await writeFile('tests/acceptance/b5-old-cleared.json',JSON.stringify({...cleared,version:5},null,2)+'\n');
