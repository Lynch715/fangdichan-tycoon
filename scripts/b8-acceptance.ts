import{writeFileSync}from'node:fs';import{newGame,stepDay,applyCommand,aggressive,defaultConfig,type LoggedCommand}from'../src/sim/index.ts';
const s=newGame(1),log:LoggedCommand[]=[],bond={type:'borrow' as const,channel:'bond' as const,amount:30000,termMonths:60};applyCommand(s,bond);log.push({day:0,command:bond});
while(s.day<270&&s.status!=='bankrupt'){
 for(const command of aggressive(s,defaultConfig))if(applyCommand(s,command).ok)log.push({day:s.day,command});
 stepDay(s);
 if([239,240,270].includes(s.day))writeFileSync(`tests/acceptance/b8-day-${s.day}.json`,JSON.stringify({version:10,seed:1,day:s.day,log,revision:0},null,2)+'\n');
}
console.log(JSON.stringify({day:s.day,cash:s.cash,rating:s.rating,status:s.status,commands:log.length,debts:s.debts.length}));
