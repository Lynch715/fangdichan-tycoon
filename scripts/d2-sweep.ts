// D2离线候选实验；只读取正式配置，不写生产参数。不按种子选择策略。
import{readFileSync,writeFileSync}from'node:fs';
import{aggressive,conservative,runGame,computeMetrics,defaultConfig}from'../src/sim/index.ts';
const runs=Number(process.env.RUNS??40),start=Number(process.env.START_SEED??1),years=Number(process.env.YEARS??30);
const input=process.argv[2];if(!input)throw Error('需要候选JSON路径');
if(!Number.isInteger(runs)||runs<1||!Number.isInteger(start)||start<1||!Number.isFinite(years)||years<=0)throw Error('实验范围无效');
const candidates=JSON.parse(readFileSync(input,'utf8')) as {name:string;aggressive?:Partial<typeof defaultConfig.bots.aggressive>;conservative?:Partial<typeof defaultConfig.bots.conservative>;common?:Partial<Omit<typeof defaultConfig.bots,'conservative'|'aggressive'>>;values?:Record<string,number>}[];
const quantile=(xs:number[],q:number)=>[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(q*xs.length))];
const rows=[];
for(const candidate of candidates){
 const c=structuredClone(defaultConfig);
 for(const [path,value]of Object.entries(candidate.values??{})){const keys=path.split('.');let target:Record<string,unknown>=c;for(const key of keys.slice(0,-1)){if(!target[key]||typeof target[key]!=='object')throw Error('未知参数路径 '+path);target=target[key] as Record<string,unknown>;}const key=keys.at(-1)!;if(typeof target[key]!=='number'||!Number.isFinite(value))throw Error('无效数值 '+path);target[key]=value;}
 Object.assign(c.bots,candidate.common);Object.assign(c.bots.aggressive,candidate.aggressive);Object.assign(c.bots.conservative,candidate.conservative);
 const type=candidate.name==='baseline-conservative'?'conservative':'aggressive',strategy=type==='conservative'?conservative:aggressive,profits:number[]=[],equities:number[]=[],failed:number[]=[];
 for(let seed=start;seed<start+runs;seed++){
  const {state}=runGame(seed,strategy,years,c),eq=computeMetrics(state).equity/10000;
  profits.push(eq-c.start.cash/10000);equities.push(eq);if(state.status==='bankrupt')failed.push(seed);
 }
 const row={...candidate,type,runs,start,years,bankruptcyRate:failed.length/runs,profitP10:quantile(profits,.1),profitMedian:quantile(profits,.5),profitP90:quantile(profits,.9),equityMedian:quantile(equities,.5),failedSeeds:failed};
 rows.push(row);console.log(JSON.stringify(row));writeFileSync(input.replace(/\.json$/,'.results.json'),JSON.stringify(rows,null,2)+'\n');
}
