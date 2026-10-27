// 脚本化策略：用于平衡测试和确定性测试，也是 AI 对手的雏形。
import { priceRestricted, activeProject } from './features.ts';
import { defaultConfig, type Config } from './config.ts';
import { applyCommand, newGame, stepDay } from './engine.ts';
import { borrowCapacity } from './finance.ts';
import type { Command, GameState, LoggedCommand } from './types.ts';

export type Strategy = (state: GameState, config: Config) => Command[];

const activeProjects = (s: GameState) => s.projects.filter(activeProject).length;

/** 已出价未开拍的地块，加上已拿地未付清的尾款。 */
const committedLand = (s: GameState) =>
  s.auctions.reduce((sum, a) => sum + (a.playerBid ?? 0), 0) + s.projects.reduce((sum, p) => sum + p.landCost - p.landPaid, 0);

/** 保守：低溢价拿地、留足现金、只用开发贷。 */
export const conservative: Strategy = (state, config) => {
  const cmds: Command[] = [];
  for(const p of state.projects)if(p.stage==='land')cmds.push({type:'startProject',projectId:p.id,contractor:'standard'});
  if(priceRestricted(state,config)) for(const p of state.projects) if(activeProject(p) && p.filedPrice === null && p.filingDueDay === null) cmds.push({type:'filePrice',projectId:p.id});
  if (state.day % config.time.daysPerMonth !== 1) return cmds;
  // 预算：只用自有现金付全额地价，并保留 30% 初始资金作缓冲
  let budget = state.cash - config.start.cash * 0.3 - committedLand(state);
  for (const a of [...state.auctions].sort((x, y) => x.startPrice - y.startPrice)) {
    if (a.playerBid !== null || activeProjects(state) >= 4) continue;
    const bid = Math.round(a.startPrice * 1.15);
    if (bid <= budget) {
      cmds.push({ type: 'bid', parcelId: a.id, amount: bid });
      budget -= bid;
    }
  }
  for (const p of state.projects) {
    if (p.stage !== 'construction') continue;
    const cap = borrowCapacity(config, state, 'devLoan', p.id).max;
    if (cap > 1000) cmds.push({ type: 'borrow', channel: 'devLoan', amount: cap, projectId: p.id });
  }
  return cmds;
};

/** 激进：高溢价抢地、信托和开发贷借满、全部加速。 */
export const aggressive: Strategy = (state, config) => {
  const cmds: Command[] = [];
  for(const p of state.projects)if(p.stage==='land')cmds.push({type:'startProject',projectId:p.id,contractor:'standard'});
  if(priceRestricted(state,config)) for(const p of state.projects) if(activeProject(p) && p.filedPrice === null && p.filingDueDay === null) cmds.push({type:'filePrice',projectId:p.id});
  if (state.day % config.time.daysPerMonth !== 1) return cmds;
  const trust = borrowCapacity(config, state, 'trust').max;
  if (trust > 1000) cmds.push({ type: 'borrow', channel: 'trust', amount: trust });
  // 预算：现金加信托额度只要够付首付款就出手
  let budget = state.cash + trust - committedLand(state);
  for (const a of state.auctions) {
    if (a.playerBid !== null) continue;
    const bid = Math.round(a.startPrice * 1.45);
    const need = bid * config.land.firstPaymentRate;
    if (need <= budget) {
      cmds.push({ type: 'bid', parcelId: a.id, amount: bid });
      budget -= need;
    }
  }
  for (const p of state.projects) {
    if (p.stage !== 'construction') continue;
    if (p.pace !== 'fast') cmds.push({ type: 'setPace', projectId: p.id, pace: 'fast' });
    const cap = borrowCapacity(config, state, 'devLoan', p.id).max;
    if (cap > 1000) cmds.push({ type: 'borrow', channel: 'devLoan', amount: cap, projectId: p.id });
  }
  return cmds;
};

export function runGame(seed: number, strategy: Strategy, years: number, config: Config = defaultConfig) {
  const state = newGame(seed, config);
  const log: LoggedCommand[] = [];
  const endDay = years * 12 * config.time.daysPerMonth;
  while (state.day < endDay && state.status !== 'bankrupt') {
    for (const command of strategy(state, config)) {
      if (applyCommand(state, command, config).ok) log.push({ day: state.day, command });
    }
    stepDay(state, config);
    state.pauses = [];
  }
  return { state, log };
}
