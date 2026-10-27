import {describe,it,expect} from 'vitest';
import {defaultConfig,newGame,stepDay,runGame,replay,conservative,aggressive} from '../src/sim/index.ts';
import {buildDifficultyConfig,validateSessionOptions,DIFFICULTIES,type Difficulty} from '../src/sim/sessionConfig.ts';

describe('B13a开局选择与独立难度配置',()=>{
 it('接受两种自由经营模式及三个明确挑战，返回独立选择',()=>{
  for(const difficulty of DIFFICULTIES){
   for(const mode of ['career','sandbox']){
    const options={mode,difficulty};
    expect(validateSessionOptions(options)).toEqual(options);
    expect(validateSessionOptions(options)).not.toBe(options);
   }
   for(const challenge of ['sales','downturn','delivery']){
    const options={mode:'challenge',difficulty,challenge};
    expect(validateSessionOptions(options)).toEqual(options);
   }
  }
 });
 it('拒绝漏选、无效组合和不存在的难度，不能静默退回其他模式',()=>{
  for(const value of [null,[],{},'career',{mode:'career'},
   {mode:'challenge',difficulty:'standard'},
   {mode:'challenge',difficulty:'standard',challenge:'unknown'},
   {mode:'career',difficulty:'standard',challenge:'sales'},
   {mode:'sandbox',difficulty:'easy',challenge:null},
   {mode:'career',difficulty:'impossible'},{mode:'other',difficulty:'easy'}]){
   expect(validateSessionOptions(value)).toBeNull();
  }
  expect(()=>buildDifficultyConfig(defaultConfig,'impossible' as Difficulty)).toThrow('未知难度');
 });
 it('标准档逐值保持基础配置；各局派生配置互不共享可写对象',()=>{
  const before=structuredClone(defaultConfig);
  const standard=buildDifficultyConfig(defaultConfig,'standard');
  expect(standard).toEqual(defaultConfig);
  standard.start.cash=1;
  standard.cycle.phases[0].sentiment=1;
  standard.rivals.companies[0].cash=1;
  standard.sessions.difficulties.easy.initialCashFactor=1;
  expect(defaultConfig).toEqual(before);
  const easy=buildDifficultyConfig(defaultConfig,'easy');
  const hard=buildDifficultyConfig(defaultConfig,'hard');
  easy.rivals.companies[0].maxActive=99;
  expect(hard.rivals.companies[0].maxActive).not.toBe(99);
  expect(defaultConfig).toEqual(before);
 });
 it('标准档保留自定义基础参数，不会重置回默认值',()=>{
  const base=structuredClone(defaultConfig);
  base.start.cash=72345;
  base.cycle.phases[0].absorption=.37;
  base.regulation.announceMonthsBefore=11;
  base.rivals.companies[0].maxActive=7;
  expect(buildDifficultyConfig(base,'standard')).toEqual(base);
 });
 it('三个档位的四个难度维度生效，原有融资/施工/地块参数保留',()=>{
  const easy=buildDifficultyConfig(defaultConfig,'easy'),hard=buildDifficultyConfig(defaultConfig,'hard');
  expect(easy.start.cash).toBe(80000);
  expect(hard.start.cash).toBe(30000);
  expect(easy.regulation.announceMonthsBefore).toBe(9);
  expect(hard.regulation.announceMonthsBefore).toBe(3);
  const eb=easy.cycle.phases.find(p=>p.id==='boom')!,hb=hard.cycle.phases.find(p=>p.id==='boom')!;
  expect(eb.priceDrift).toBeCloseTo(.006);
  expect(hb.priceDrift).toBeCloseTo(.01);
  const ed=easy.cycle.phases.find(p=>p.id==='downturn')!,hd=hard.cycle.phases.find(p=>p.id==='downturn')!;
  expect(ed.priceDrift).toBeCloseTo(-.0075);
  expect(hd.priceDrift).toBeCloseTo(-.0125);
  expect(ed.absorption).toBeCloseTo(.55);
  expect(hd.absorption).toBeCloseTo(.25);
  expect(ed.sentiment).toBeCloseTo(33.5);
  expect(hd.sentiment).toBeCloseTo(22.5);
  expect(easy.rivals.companies.map(r=>r.maxActive)).toEqual([2,4,6]);
  expect(hard.rivals.companies.map(r=>r.maxActive)).toEqual([4,6,10]);
  for(let i=0;i<defaultConfig.rivals.companies.length;i++){
   const base=defaultConfig.rivals.companies[i],e=easy.rivals.companies[i],h=hard.rivals.companies[i];
   expect(e.premiumFactor).toBeLessThan(base.premiumFactor);
   expect(h.premiumFactor).toBeGreaterThan(base.premiumFactor);
   expect(e.cashReserve).toBeGreaterThan(base.cashReserve);
   expect(h.cashReserve).toBeLessThan(base.cashReserve);
   expect(e.minMargin).toBeGreaterThan(base.minMargin);
   expect(h.minMargin).toBeLessThan(base.minMargin);
   expect(e.cash).toBe(base.cash);
   expect(h.cash).toBe(base.cash);
   expect(e.trustUsage).toBeLessThanOrEqual(base.trustUsage);
   expect(h.trustUsage).toBeGreaterThanOrEqual(base.trustUsage);
  }
  for(const config of [easy,hard]){
   expect(config.finance).toEqual(defaultConfig.finance);
   expect(config.construction).toEqual(defaultConfig.construction);
   expect(config.land).toEqual(defaultConfig.land);
   expect(config.districts).toEqual(defaultConfig.districts);
   for(const r of config.rivals.companies){expect(r.trustUsage).toBeLessThanOrEqual(1);expect(r.devLoanUsage).toBeLessThanOrEqual(1);}
  }
 });
 it('极端基础情绪/去化不越界；零信托偏好不会变成主动借信托',()=>{
  const base=structuredClone(defaultConfig);
  base.cycle.phases[0].sentiment=0;
  base.cycle.phases[1].sentiment=100;
  base.cycle.phases[0].absorption=.01;
  const hard=buildDifficultyConfig(base,'hard');
  expect(hard.cycle.phases[0].sentiment).toBe(0);
  expect(hard.cycle.phases[1].sentiment).toBe(100);
  expect(hard.cycle.phases[0].absorption).toBe(base.sessions.minimumAbsorption);
  expect(hard.rivals.companies[0].trustUsage).toBe(0);
 });
 for(const difficulty of DIFFICULTIES)it(`${difficulty}真实开局资金及监管预警日期`,()=>{
  const config=buildDifficultyConfig(defaultConfig,difficulty),state=newGame(7,config);
  expect(state.cash).toBe(config.start.cash);
  const announceDay=((config.regulation.startYear-1)*12-config.regulation.announceMonthsBefore)*config.time.daysPerMonth;
  while(state.day<announceDay-1)stepDay(state,config);
  expect(state.regulation.announced).toBe(false);
  stepDay(state,config);
  expect(state.regulation.announced).toBe(true);
  expect(state.regulation.active).toBe(false);
 });
 for(const seed of [1,7,32])it(`种子${seed}标准配置五年经济和指令完全不变`,()=>{
  for(const strategy of [conservative,aggressive]){
   expect(runGame(seed,strategy,5,buildDifficultyConfig(defaultConfig,'standard'))).toEqual(runGame(seed,strategy,5));
  }
 });
 for(const difficulty of ['easy','hard'] as const)it(`${difficulty}五年真实经营可按种子和成功指令完整重放`,()=>{
  const config=buildDifficultyConfig(defaultConfig,difficulty);
  for(const seed of [1,7,32])for(const strategy of [conservative,aggressive]){
   const {state,log}=runGame(seed,strategy,5,config);
   expect(replay(seed,log,state.day,config)).toEqual(state);
   expect(Number.isFinite(state.cash)).toBe(true);
  }
 });
});
