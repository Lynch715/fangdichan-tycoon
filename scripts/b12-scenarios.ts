import{writeFileSync}from'node:fs';import{newGame,applyCommand,stepDay,aggressive,conservative,defaultConfig,strategicQuote,restructuringQuote,type LoggedCommand}from'../src/sim/index.ts';
let found=false;
for(let seed=1;seed<=30&&!found;seed++){
 const s=newGame(seed),log:LoggedCommand[]=[];
 while(s.day<3600&&s.status!=='bankrupt'){
  if(s.day%30===0&&s.day>0){const q=restructuringQuote(s,defaultConfig),investment=strategicQuote(s,defaultConfig,.4);if(!q.error&&!investment.error&&q.principal>s.cash&&s.cash+investment.amount>0){const save={version:14,seed,day:s.day,log,revision:0};writeFileSync('tests/acceptance/b12-pressure.json',JSON.stringify(save,null,2)+'\n');console.log('pressure',{seed,day:s.day,cash:s.cash,principal:q.principal,investment:investment.amount,commands:log.length,debts:q.debts});found=true;break;}}
  for(const command of aggressive(s,defaultConfig))if(applyCommand(s,command).ok)log.push({day:s.day,command});stepDay(s);s.pauses=[];
 }
}
if(!found)throw Error('No default pressure scenario');
let deficit=false;
for(let seed=1;seed<=30&&!deficit;seed++){const s=newGame(seed),log:LoggedCommand[]=[];while(s.day<3600&&s.status!=='bankrupt'){const q=strategicQuote(s,defaultConfig,.4);if(s.cash<0&&!q.error&&s.cash+q.amount>0){writeFileSync('tests/acceptance/b12-deficit.json',JSON.stringify({version:14,seed,day:s.day,log,revision:0},null,2)+'\n');console.log('deficit',{seed,day:s.day,cash:s.cash,amount:q.amount});deficit=true;break;}for(const command of (seed%2===0?conservative:aggressive)(s,defaultConfig))if(applyCommand(s,command).ok)log.push({day:s.day,command});stepDay(s);s.pauses=[];}}
if(!deficit)throw Error('No default deficit scenario');
