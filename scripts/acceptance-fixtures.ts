import {writeFileSync} from 'node:fs';
import {newGame,applyCommand,stepDay, type LoggedCommand} from '../src/legacy-v6/index.ts';
function fixture(day:number,name:string){
 const s=newGame(7);const a=[...s.auctions].sort((a,b)=>a.startPrice-b.startPrice)[0];
 const cmd={type:'bid' as const,parcelId:a.id,amount:a.aiMax*2};applyCommand(s,cmd);const log:LoggedCommand[]=[{day:0,command:cmd}];
 while(s.day<day){if(s.day===30){const command={type:"startProject" as const,projectId:s.projects[0].id,contractor:"standard" as const};applyCommand(s,command);log.push({day:s.day,command});}stepDay(s); }
 const result={version:6,seed:7,day,log,revision:0};
 writeFileSync(`tests/acceptance/${name}.json`,JSON.stringify(result,null,2));
 console.log(name,s.day,s.status,s.projects[0]?.stage,s.cash);
}
fixture(90,'construction');fixture(750,'completed-suburb');
