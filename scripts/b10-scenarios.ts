import{writeFileSync}from'node:fs';import{newGame,stepDay,applyCommand,aggressive,runGame,presaleBlocked,type LoggedCommand}from'../src/sim/index.ts';
// Default configuration, accepted commands only; no state injection.
for(let seed=1;seed<=30;seed++){
 const s=newGame(seed),log:LoggedCommand[]=[];let chosen=false;
 const issue=(command:LoggedCommand['command'])=>{const r=applyCommand(s,command);if(r.ok)log.push({day:s.day,command});return r.ok;};
 while(s.day<3600&&s.status!=='bankrupt'){
  if(!chosen&&s.market.phaseIndex===2&&(s.market.phaseEndMonth-Math.floor(s.day/30))<=12){const a=[...s.auctions].filter(a=>a.startPrice<15000).sort((a,b)=>a.startPrice-b.startPrice)[0];if(a)chosen=issue({type:'bid',parcelId:a.id,amount:a.auction?.priceCap??a.startPrice*2,amenityRate:a.auction?.kind==='amenity'?.15:0});}
  if(chosen&&!s.auctions.some(a=>a.playerBid!==null)&&!s.projects.length)chosen=false;
  for(const p of s.projects)if(p.stage==='land'){issue({type:'startProject',projectId:p.id,contractor:'standard'});issue({type:'setPrice',projectId:p.id,priceFactor:1.2});}
  const p=s.projects.find(p=>presaleBlocked(p));if(p){const raw={version:12,seed,day:s.day,log,revision:0};writeFileSync('tests/acceptance/b10-hoarding.json',JSON.stringify(raw,null,2)+'\n');console.log('hoarding',{seed,day:s.day,p:p.id,cash:s.cash,commands:log.length,reapply:p.presale?.reapplyDay});break;}
  stepDay(s);
 }
 if(s.projects.some(p=>presaleBlocked(p)))break;if(seed===30)throw Error('No default hoarding scenario');
}
for(let seed=1;seed<=30;seed++){
 const result=runGame(seed,aggressive,10),at=result.state.compliance?.landCases.find(x=>x.penalizedDay!==undefined)?.penalizedDay;
 if(at!==undefined){const raw={version:12,seed,day:at,log:result.log.filter(x=>x.day<at),revision:0};writeFileSync('tests/acceptance/b10-land-ban.json',JSON.stringify(raw,null,2)+'\n');console.log('land ban',{seed,day:at,commands:raw.log.length});break;}
}
