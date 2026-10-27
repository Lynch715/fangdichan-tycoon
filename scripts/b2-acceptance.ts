// 默认生产配置、真实指令日志；不注入状态，不改玩家本地存档。
import {writeFile} from 'node:fs/promises';
import {applyCommand,newGame,stepDay,type Command,type LoggedCommand} from '../src/legacy-v3/index.ts';
for(const [name,day,rescue] of [['stopped-5',150,false],['takeover-6',180,false],['resumed',180,true]] as const){
 const s=newGame(8),log:LoggedCommand[]=[],issue=(command:Command)=>{const r=applyCommand(s,command);if(!r.ok)throw Error(r.error);log.push({day:s.day,command});};
 issue({type:'bid',parcelId:'L4',amount:192156});
 while(s.day<day){if(rescue&&s.day===150)issue({type:'borrow',channel:'devLoan',projectId:s.projects[0].id,amount:10000});stepDay(s);}
 await writeFile(`tests/acceptance/b2-${name}.json`,JSON.stringify({version:3,seed:8,day,log,revision:0},null,2)+'\n');
 console.log(name,JSON.stringify({cash:s.cash,progress:s.projects[0].progress,stopped:s.projects[0].fundingStoppedMonths,stage:s.projects[0].stage}));
}
