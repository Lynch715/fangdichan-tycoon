import{writeFile}from'node:fs/promises';import{applyCommand,newGame,stepDay,salesEligible,priceRestricted,defaultConfig,type Command,type LoggedCommand}from'../src/legacy-v5/index.ts';
async function make(name:string,rate?:number,delivery=false){
 const s=newGame(7),log:LoggedCommand[]=[],issue=(command:Command)=>{const r=applyCommand(s,command);if(!r.ok)throw Error(r.error);log.push({day:s.day,command});};
 issue({type:'bid',parcelId:'L1',amount:31146});while(s.day<30)stepDay(s);const p=s.projects[0];issue({type:'startProject',projectId:p.id,contractor:delivery?'brand':'standard'});
 while(delivery?p.deliveredDay===null:!salesEligible(p,defaultConfig)){if(priceRestricted(s,defaultConfig)&&p.filedPrice===null&&p.filingDueDay===null)issue({type:'filePrice',projectId:p.id});stepDay(s);if(s.status==='bankrupt'||s.day>1800)throw Error('验收夹具未完成');}
 if(rate!==undefined){issue({type:'setMarketing',projectId:p.id,rate});const end=s.day+30;while(s.day<end)stepDay(s);}
 await writeFile(`tests/acceptance/b4-${name}.json`,JSON.stringify({version:5,seed:s.seed,day:s.day,log,revision:0},null,2)+'\n');console.log(name,JSON.stringify({day:s.day,brand:s.brand,quality:p.quality,rate:p.marketingRate,sales:p.salesIn,sold:p.soldArea,cash:s.cash}));
}
await make('on-sale');await make('zero',0);await make('high',.12);await make('brand-delivery',undefined,true);
