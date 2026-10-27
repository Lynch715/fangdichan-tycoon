import{describe,it,expect}from'vitest';
import{readFileSync}from'node:fs';
import beforeBalance from '../src/legacy-v15/config.json' with {type:'json'};
import{newGame,applyCommand,stepDay,defaultConfig,aggressive,conservative,runGame,replay,botCashNeed,type Command,type GameState}from'../src/sim/index.ts';
function commands(s:GameState,strategy=aggressive){const prior=JSON.stringify(s),cmds=strategy(s,s.rules??defaultConfig);expect(JSON.stringify(s)).toBe(prior);for(const cmd of cmds)expect(applyCommand(s,cmd,s.rules??defaultConfig),JSON.stringify(cmd)).toEqual({ok:true});return cmds;}

describe('D1 机器人使用经营工具',()=>{
 it('只新增bots配置，全部原经济参数保留',()=>{
  const old=JSON.parse(readFileSync(new URL('./acceptance/d1-config-before.json',import.meta.url),'utf8'));
  const {bots,...now}=beforeBalance;expect(now).toEqual(old);expect(bots.aggressive.hiddenUsage).toBeGreaterThan(0);
 });
 it('生成策略只读，顺序执行所有规划指令均有效且可完整重放',()=>{
  for(const strategy of [conservative,aggressive]){
   const s=newGame(7),log:{day:number;command:Command}[]=[];
   while(s.day<720&&s.status!=='bankrupt'){for(const command of commands(s,strategy))log.push({day:s.day,command});stepDay(s);s.pauses=[];}
   expect(replay(7,log,s.day)).toEqual(s);
  }
 });
 it('真实10年种子中使用全部七种工具，而不是只产生被拒绝的指令',()=>{
  const used=new Set<string>(),contractors=new Set<string>();
  for(const seed of [1,7,32]){const {state,log}=runGame(seed,aggressive,10);expect(replay(seed,log,state.day)).toEqual(state);
   for(const {command:c}of log){used.add(c.type==='borrow'?'borrow:'+c.channel:c.type);if(c.type==='startProject')contractors.add(c.contractor);}
  }
  for(const key of ['setPaper','borrow:hidden','cooperate','extend','sellProject','setMarketing','startProject'])expect(used.has(key),key).toBe(true);
  expect(contractors.size).toBeGreaterThan(1);
 });
 it('经营压力下保守策略会合作，仍拒用明股实债',()=>{
  const s=newGame(7);applyCommand(s,{type:'startGame',options:{mode:'challenge',difficulty:'standard',challenge:'downturn'}});stepDay(s);
  const cmds=commands(s,conservative);expect(cmds.some(c=>c.type==='cooperate')).toBe(true);
  expect(cmds.some(c=>c.type==='borrow'&&c.channel==='hidden')).toBe(false);
 });
 it('保守策略在已预售、无法合作且现金不足的情景使用商票',()=>{
  const c=structuredClone(defaultConfig);c.start.cash=5000;
  for(const p of c.sessions.challenges.downturn.projects)p.soldRatio=.1;
  const s=newGame(7,c);applyCommand(s,{type:'startGame',options:{mode:'challenge',difficulty:'standard',challenge:'downturn'}},c);stepDay(s,c);
  const cmds=commands(s,conservative);expect(cmds.some(c=>c.type==='setPaper'&&c.enabled)).toBe(true);
 });
 it('到期纸票作为现金需求计入，不能展期；保交楼目标不能被自救转卖',()=>{
  const s=newGame(7);applyCommand(s,{type:'startGame',options:{mode:'challenge',difficulty:'standard',challenge:'delivery'}});stepDay(s);
  const paper=s.debts.find(d=>d.channel==='paper')!;expect(botCashNeed(s,s.rules!)).toBeGreaterThan(paper.principal);
  const cmds=commands(s);expect(cmds.some(c=>c.type==='extend'&&c.debtId===paper.id)).toBe(false);
  expect(cmds.some(c=>c.type==='sellProject'&&s.session!.requiredProjectIds.includes(c.projectId))).toBe(false);
 });
 it('月内无待办时不交易；已破产时不生成指令',()=>{
  const s=newGame(7);stepDay(s);stepDay(s);expect(aggressive(s,defaultConfig)).toEqual([]);
  expect(aggressive({...s,status:'bankrupt'},defaultConfig)).toEqual([]);
 });
});
