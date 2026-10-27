import {writeFile} from 'node:fs/promises';
import {applyCommand,newGame,stepDay,priceRestricted,defaultConfig,type Command,type LoggedCommand} from '../src/legacy-v4/index.ts';
import {CONTRACTORS} from '../src/legacy-v4/types.ts';
async function make(name:string,contractor?:typeof CONTRACTORS[number],delivery=false){
 const s=newGame(7),log:LoggedCommand[]=[],issue=(command:Command)=>{const r=applyCommand(s,command);if(!r.ok)throw Error(r.error);log.push({day:s.day,command});};
 issue({type:'bid',parcelId:'L1',amount:31146});while(s.day<30)stepDay(s);const p=s.projects[0];
 if(contractor){issue({type:'startProject',projectId:p.id,contractor});do{if(priceRestricted(s,defaultConfig)&&p.filedPrice===null&&p.filingDueDay===null)issue({type:'filePrice',projectId:p.id});stepDay(s);if(s.status==='bankrupt'||s.day>1800)throw Error('夹具未交付');}while(delivery?p.deliveredDay===null:s.day<60);}
 await writeFile(`tests/acceptance/b3-${name}.json`,JSON.stringify({version:4,seed:s.seed,day:s.day,log,revision:0},null,2)+'\n');
 console.log(name,JSON.stringify({day:s.day,stage:p.stage,quality:p.quality,progress:p.progress,brand:s.brand,buildCost:p.buildCost,cash:s.cash}));
}
await make('land');for(const id of CONTRACTORS)await make(id,id);await make('budget-delivery','budget',true);
