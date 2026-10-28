import {describe,it,expect,vi,afterEach} from 'vitest';
import {applyCommand,defaultConfig,newGame,replay,stepDay,type Command,type Config,type LoggedCommand} from './helpers/ordinary-auctions.ts';
import {CONTRACTORS,type ContractorId} from '../src/sim/types.ts';
import {estimateLand} from '../src/estimates/land.ts';
import {projectsPanel} from '../src/ui/panels.ts';
import {projectArtKey} from '../src/render/projectArt.ts';
import {Game} from '../src/game.ts';
afterEach(()=>vi.unstubAllGlobals());
function quiet():Config {const c=structuredClone(defaultConfig);c.start.cash=1e7;Object.assign(c.risk,{inspectionBase:0,inspectionAttentionFactor:0,materialChance:0,accidentChance:0,demandChance:0});return c;}
function fixture(contractor?:ContractorId,seed=7,c=quiet()){
 const s=newGame(seed,c),a=[...s.auctions].sort((a,b)=>a.startPrice-b.startPrice)[0],log:LoggedCommand[]=[];
 const issue=(command:Command)=>{expect(applyCommand(s,command,c)).toEqual({ok:true});log.push({day:s.day,command});};
 issue({type:'bid',parcelId:a.id,amount:a.aiMax*2});for(let i=0;i<30;i++)stepDay(s,c);const p=s.projects[0],baseCost=p.buildCost;
 if(contractor)issue({type:'startProject',projectId:p.id,contractor});return {s,p,c,issue,log,baseCost};
}
describe('B3 开工总包与交付质量',()=>{
 it('结束回合推进一整月，拿地后作为本回合提醒等待选择总包，开工指令可导出重放',()=>{
  vi.stubGlobal('localStorage',undefined);vi.stubGlobal('indexedDB',undefined);
  const g=new Game();expect(g.importSave(JSON.stringify({version:4,seed:7,day:0,log:[{day:0,command:{type:'bid',parcelId:'L1',amount:31146}}],revision:0})).ok).toBe(true);
  expect(g.endTurn().ok).toBe(true);expect(g.state.day).toBe(30);expect(g.turn).toBe(2);expect(g.lastTurn?.alerts).toContain('startProject');expect(g.state.projects[0].stage).toBe('land');
  expect(g.issue({type:'startProject',projectId:g.state.projects[0].id,contractor:'brand'}).ok).toBe(true);const again=new Game();expect(again.importSave(g.exportSave()).ok).toBe(true);expect(again.state).toEqual({...g.state,pauses:[]});expect(again.state.projects[0].contractor).toBe('brand');
 });
 it('拿地后待开工，先展示围挡；未选择时不计工程支出和进度',()=>{
  const {s,p,c}=fixture();expect(p.stage).toBe('land');expect(p.contractor).toBeNull();expect(p.quality).toBeNull();expect(p.buildSpent).toBe(0);expect(projectArtKey(p)).toContain('fenced');
  for(let i=0;i<30;i++)stepDay(s,c);expect(p.progress).toBe(0);expect(p.buildSpent).toBe(0);expect(p.fundingStoppedMonths).toBe(0);
  const html=projectsPanel(c,s,null);for(const id of CONTRACTORS)expect(html).toContain(`data-contractor="${id}"`);expect(html).toContain('地价尾款仍按原期');
 });
 for(const id of CONTRACTORS)it(`${id}档建安总成本、正常工期与质量对应配置`,()=>{
  const {s,p,c,baseCost}=fixture(id),terms=c.construction.contractors[id],months=Math.ceil(c.construction.months*terms.durationFactor);
  expect(p.buildCost).toBeCloseTo(baseCost*terms.costFactor);expect(p.quality).toBe(terms.quality);
  for(let i=0;i<(months-1)*30;i++)stepDay(s,c);expect(p.stage).toBe('construction');expect(p.progress).toBeLessThan(1);
  for(let i=0;i<30;i++)stepDay(s,c);expect(p.stage).toBe('completed');expect(p.completedDay).toBe(30+months*30);expect(p.buildSpent).toBeCloseTo(p.buildCost);expect(p.progress).toBe(1);
 });
 it('总包选择不可重复，非法档位或已退出项目不能开工，失败不改状态',()=>{
  const {s,p,c}=fixture('standard');const before=JSON.stringify(s);
  for(const contractor of ['budget','invalid'])expect(applyCommand(s,{type:'startProject',projectId:p.id,contractor} as Command,c).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
  const idle=fixture();expect(applyCommand(idle.s,{type:'startProject',projectId:idle.p.id,contractor:'invalid'} as unknown as Command,idle.c).ok).toBe(false);expect(idle.p.stage).toBe('land');
 });
 it('低质量只在交付时触发一次维权、品牌扣分和监管关注',()=>{
  const {s,p,c}=fixture('budget');while(p.stage!=='completed')stepDay(s,c);expect(s.brand).toBe(c.quality.initialBrand);
  const delivery=p.completedDay!+c.construction.deliveryMonths*30;while(s.day<delivery-1)stepDay(s,c);expect(s.brand).toBe(50);const attention=s.attention;
  stepDay(s,c);expect(p.stage).toBe('delivered');expect(s.brand).toBe(40);expect(s.attention).toBe(Math.min(100,attention+15)-(delivery%90===0?2:0));expect(s.pauses).toContain('risk');
  expect(s.news.filter(n=>n.text.includes('业主维权'))).toHaveLength(1);for(let i=0;i<30;i++)stepDay(s,c);expect(s.brand).toBe(40);expect(s.news.filter(n=>n.text.includes('业主维权'))).toHaveLength(1);
 });
 it('标准质量达标不维权；事故按配置降低质量',()=>{
  const good=fixture('standard');while(good.p.deliveredDay===null)stepDay(good.s,good.c);expect(good.s.brand).toBe(52);expect(good.s.news.some(n=>n.text.includes('业主维权'))).toBe(false);
  const {s,p,c}=fixture('standard');c.risk.accidentChance=1;for(let i=0;i<30;i++)stepDay(s,c);expect(p.quality).toBe(65);for(let i=0;i<30;i++)stepDay(s,c);expect(p.quality).toBe(55);
  c.risk.accidentChance=0;while(p.deliveredDay===null)stepDay(s,c);expect(s.brand).toBe(40);
 });
 it('相同随机抽样下三档事故集合按风险倍率嵌套',()=>{
  const accidents={budget:new Set<number>(),standard:new Set<number>(),brand:new Set<number>()};
  for(let seed=1;seed<=100;seed++)for(const id of CONTRACTORS){const c=quiet();c.risk.accidentChance=.3;const {s,p}=fixture(id,seed,c);for(let i=0;i<30;i++)stepDay(s,c);if(p.quality!<c.construction.contractors[id].quality)accidents[id].add(seed);}
  expect(accidents.budget.size).toBeGreaterThan(accidents.standard.size);expect(accidents.standard.size).toBeGreaterThan(accidents.brand.size);
  for(const seed of accidents.brand)expect(accidents.standard.has(seed)).toBe(true);for(const seed of accidents.standard)expect(accidents.budget.has(seed)).toBe(true);
 });
 it('标准总包测算包含中标月等待，其他两档采用对应工期和成本',()=>{
  const c=quiet(),s=newGame(7,c),a=s.auctions[0],standard=estimateLand(c,s,a,a.startPrice)!,budget=estimateLand(c,s,a,a.startPrice,'budget')!,brand=estimateLand(c,s,a,a.startPrice,'brand')!;
  expect(standard.months[0].progress).toBe(0);expect(standard.months[1].progress).toBeCloseTo(1/24);expect(budget.buildCost).toBeCloseTo(standard.buildCost*.9);expect(brand.buildCost).toBeCloseTo(standard.buildCost*1.12);expect(budget.months.length).toBeGreaterThan(standard.months.length);expect(brand.months.length).toBeLessThan(standard.months.length);
 });
 it('总包与质量完整日志确定性回放',()=>{
  for(const id of CONTRACTORS){const {s,p,c,log}=fixture(id);while(p.deliveredDay===null)stepDay(s,c);expect(replay(s.seed,log,s.day,c)).toEqual({...s,pauses:[]});}
 });
});
