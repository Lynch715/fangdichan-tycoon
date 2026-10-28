import { describe, it, expect, vi, afterEach } from 'vitest';
import { Game } from '../src/game.ts';
import { turnBriefingMarkup, lastTurnIncome } from '../src/ui/turn.ts';
import { staffDialogMarkup, parsePost, postValue } from '../src/ui/staff.ts';
import { projectsPanel } from '../src/ui/panels.ts';
import { conservative, aggressive, staffed, runGame, botCashNeed } from '../src/sim/index.ts';
import { bankruptcyTrigger } from '../src/analysis/balance.ts';
import { newGame, applyCommand, stepDay, defaultConfig, replay, channelRate, seasonOf, rollSeason, postHolder, payroll, type GameState, type Config, type LoggedCommand } from '../src/sim/index.ts';

const dpm = defaultConfig.time.daysPerMonth;
/** 关闭主随机流上的经营事件，便于对比单一系数。 */
function quiet(): Config {
  const c = structuredClone(defaultConfig);
  Object.assign(c.risk, { materialChance: 0, accidentChance: 0, demandChance: 0, inspectionBase: 0, inspectionAttentionFactor: 0 });
  c.compliance.enabled = false;
  return c;
}
function delivery(c: Config = defaultConfig): GameState {
  const s = newGame(7, c);
  expect(applyCommand(s, { type: 'startGame', options: { mode: 'challenge', difficulty: 'standard', challenge: 'delivery' } }, c).ok).toBe(true);
  return s;
}
const building = (s: GameState) => s.projects.find(p => p.stage === 'construction')!;
const month = (s: GameState, c: Config = defaultConfig) => { for (let i = 0; i < dpm; i++) stepDay(s, c); };

describe('季节与季节/政策事件', () => {
  it('月份映射到四季：1–2、12月为冬，3–5春，6–8夏，9–11秋', () => {
    expect([0, 1, 2, 5, 8, 11].map(m => seasonOf(defaultConfig, m).id)).toEqual(['winter', 'winter', 'spring', 'summer', 'autumn', 'winter']);
  });
  it('只有从开局设置进入的对局有季节事件；裸 newGame 保持中性，便于固定情景与批量对比', () => {
    expect(newGame(3).market.season).toBeUndefined();
    const s = delivery();
    expect(s.market.season?.month).toBe(0);
    month(s);
    expect(s.market.season?.month).toBe(1);
  });
  it('抽季节事件不消耗主随机流，同行、拍地与事故结果不受影响', () => {
    const s = delivery(), rng = s.rng;
    for (let m = 1; m < 40; m++) rollSeason(s, defaultConfig, m);
    expect(s.rng).toBe(rng);
  });
  it('季节去化系数按比例作用于当月真实成交面积', () => {
    const c = quiet(), a = delivery(c);
    for (let i = 0; i < 6 && !a.projects.some(p => p.soldArea > 0); i++) month(a, c);
    const b = structuredClone(a);
    a.market.season = { ...a.market.season!, sales: 1, build: 1, cost: 1, rate: 0 };
    b.market.season = { ...b.market.season!, sales: 1.5, build: 1, cost: 1, rate: 0 };
    const before = a.projects.map(p => p.soldArea);
    month(a, c); month(b, c);
    const gainA = a.projects.reduce((n, p, i) => n + p.soldArea - before[i], 0), gainB = b.projects.reduce((n, p, i) => n + p.soldArea - before[i], 0);
    expect(gainA).toBeGreaterThan(0);
    expect(gainB / gainA).toBeCloseTo(1.5, 1);
  });
  it('政策事件的利率变动只作用于新增融资定价', () => {
    const s = delivery(), base = { ...s.market.season!, rate: 0 };
    s.market.season = base; const r0 = channelRate(defaultConfig, s, 'trust');
    s.market.season = { ...base, rate: 0.01 }; expect(channelRate(defaultConfig, s, 'trust')).toBeCloseTo(r0 + 0.01, 10);
    expect(channelRate(defaultConfig, s, 'paper')).toBeCloseTo(channelRate(defaultConfig, { ...s, market: { ...s.market, season: base } }, 'paper') + 0.01, 10);
  });
});

describe('员工体系', () => {
  it('开局有人才市场；签约扣签约费并记工资流水，月末按月薪发放', () => {
    const s = delivery(), cand = s.staff!.pool[0], cash = s.cash;
    expect(s.staff!.pool).toHaveLength(defaultConfig.staff.poolSize);
    expect(applyCommand(s, { type: 'hireStaff', candidateId: cand.id }).ok).toBe(true);
    expect(s.cash).toBeCloseTo(cash - cand.salary * defaultConfig.staff.signingMonths, 6);
    expect(s.staff!.pool.some(x => x.id === cand.id)).toBe(false);
    expect(applyCommand(s, { type: 'hireStaff', candidateId: cand.id }).ok).toBe(false);
    expect(payroll(s)).toBe(cand.salary);
    const entries = s.reports.journal.length;
    month(s);
    expect(s.reports.journal.slice(entries).filter(e => e.kind === 'salary').reduce((n, e) => n + e.amount, 0)).toBeCloseTo(cand.salary, 6);
  });
  it('项目经理按工程能力加快真实施工进度，并提升质量', () => {
    const c = quiet(), a = delivery(c), p = building(a);
    const hire = a.staff!.pool[0];
    applyCommand(a, { type: 'hireStaff', candidateId: hire.id }, c);
    const b = structuredClone(a);
    expect(applyCommand(b, { type: 'assignStaff', staffId: hire.id, post: { slot: 'pm', projectId: p.id } }, c).ok).toBe(true);
    const pa = building(a), pb = b.projects.find(x => x.id === p.id)!, before = pa.progress, q = pb.quality!;
    month(a, c); month(b, c);
    const skill = hire.skills.engineering / 100;
    expect((pb.progress - before) / (pa.progress - before)).toBeCloseTo(1 + c.staff.effects.pmSpeed * skill, 6);
    expect(pb.quality!).toBeGreaterThan(q);
  });
  it('同一岗位只有一人：新任命顶替旧任，旧任回总部待命；不能派到不存在的项目', () => {
    const s = delivery(), p = building(s), [x, y] = s.staff!.pool;
    applyCommand(s, { type: 'hireStaff', candidateId: x.id }); applyCommand(s, { type: 'hireStaff', candidateId: y.id });
    applyCommand(s, { type: 'assignStaff', staffId: x.id, post: { slot: 'salesLead', projectId: p.id } });
    applyCommand(s, { type: 'assignStaff', staffId: y.id, post: { slot: 'salesLead', projectId: p.id } });
    expect(postHolder(s, 'salesLead', p.id)?.id).toBe(y.id);
    expect(s.staff!.members.find(m => m.id === x.id)!.post).toBeNull();
    expect(applyCommand(s, { type: 'assignStaff', staffId: x.id, post: { slot: 'pm', projectId: 'P999' } }).ok).toBe(false);
    expect(applyCommand(s, { type: 'assignStaff', staffId: x.id, post: { slot: 'cfo' } }).ok).toBe(true);
  });
  it('财务总监压降新增融资利率；解雇支付补偿金后效果消失', () => {
    const s = delivery(), cand = s.staff!.pool[0];
    s.market.season = { ...s.market.season!, rate: 0 };
    const r0 = channelRate(defaultConfig, s, 'trust');
    applyCommand(s, { type: 'hireStaff', candidateId: cand.id });
    applyCommand(s, { type: 'assignStaff', staffId: cand.id, post: { slot: 'cfo' } });
    expect(channelRate(defaultConfig, s, 'trust')).toBeCloseTo(r0 - defaultConfig.staff.effects.cfoRateCut * cand.skills.finance / 100, 10);
    const cash = s.cash;
    expect(applyCommand(s, { type: 'fireStaff', staffId: cand.id }).ok).toBe(true);
    expect(s.cash).toBeCloseTo(cash - cand.salary * defaultConfig.staff.severanceMonths, 6);
    expect(channelRate(defaultConfig, s, 'trust')).toBeCloseTo(r0, 10);
  });
  it('人才市场按季度刷新，员工指令进入日志后完整重放一致', () => {
    const s = newGame(11), log: LoggedCommand[] = [];
    const issue = (command: LoggedCommand['command']) => { expect(applyCommand(s, command).ok).toBe(true); log.push({ day: s.day, command }); };
    const first = s.staff!.pool.map(x => x.id);
    issue({ type: 'hireStaff', candidateId: s.staff!.pool[1].id });
    issue({ type: 'assignStaff', staffId: s.staff!.members[0].id, post: { slot: 'pr' } });
    for (let i = 0; i < 3 * dpm; i++) stepDay(s);
    expect(s.staff!.pool.map(x => x.id)).not.toEqual(first.filter((_, i) => i !== 1));
    expect(s.staff!.members[0].monthsInPost).toBe(3);
    const again = replay(11, log, s.day);
    expect(again).toEqual({ ...s, pauses: [] });
  });
});


describe('回合制循环与回合简报', () => {
  afterEach(() => vi.unstubAllGlobals());
  function game() {
    vi.stubGlobal('localStorage', undefined); vi.stubGlobal('indexedDB', undefined);
    const g = new Game();
    expect(g.endTurn().ok).toBe(false); // 未完成开局设置不能推进
    expect(g.restart({ mode: 'challenge', difficulty: 'standard', challenge: 'delivery' }).ok).toBe(true);
    return g;
  }
  it('结束回合恰好推进一个游戏月并停在月初，回合号随之 +1', () => {
    const g = game();
    expect(g.turn).toBe(1);
    for (let k = 1; k <= 3; k++) { expect(g.endTurn().ok).toBe(true); expect(g.state.day).toBe(k * dpm); expect(g.turn).toBe(k + 1); }
    expect(g.lastTurn).toMatchObject({ fromDay: 2 * dpm, toDay: 3 * dpm });
    expect(g.state.pauses).toEqual([]);
  });
  it('回合推进与逐日推进结果完全一致，存档重载一致', () => {
    const g = game(), s = structuredClone(g.state);
    g.endTurn(); g.endTurn();
    for (let i = 0; i < 2 * dpm; i++) { stepDay(s); s.pauses = []; }
    expect(g.state).toEqual(s);
    const again = new Game(); expect(again.importSave(g.exportSave()).ok).toBe(true);
    expect(again.state).toEqual({ ...g.state, pauses: [] });
  });
  it('简报只读：列出上回合各项目收益、员工薪酬、行情与本回合季节事件', () => {
    const g = game();
    const cand = g.state.staff!.pool[0];
    g.issue({ type: 'hireStaff', candidateId: cand.id });
    for (let i = 0; i < 8; i++) g.endTurn();
    const before = JSON.stringify(g.state);
    const html = turnBriefingMarkup(g.config, g.state, g.lastTurn), income = lastTurnIncome(g.state)!;
    expect(JSON.stringify(g.state)).toBe(before);
    expect(income.rows.length).toBeGreaterThan(0);
    for (const r of income.rows) expect(html).toContain(r.name);
    expect(income.salary).toBeCloseTo(-cand.salary, 6);
    expect(html).toContain('员工薪酬');
    expect(html).toContain('金融市场行情');
    expect(html).toContain(`${g.state.market.season!.seasonName}季`);
    expect(html).toContain(`第 ${g.turn} 回合`);
  });
  it('员工弹窗与项目卡展示派驻，岗位下拉值可往返解析', () => {
    const g = game(), p = g.state.projects.find(x => x.stage === 'construction')!, cand = g.state.staff!.pool[0];
    g.issue({ type: 'hireStaff', candidateId: cand.id });
    g.issue({ type: 'assignStaff', staffId: cand.id, post: { slot: 'pm', projectId: p.id } });
    expect(staffDialogMarkup(g.config, g.state)).toContain(cand.name);
    expect(projectsPanel(g.config, g.state, null)).toContain(cand.name);
    for (const post of [null, { slot: 'cfo' as const }, { slot: 'pr' as const }, { slot: 'salesLead' as const, projectId: p.id }]) expect(parsePost(postValue(post))).toEqual(post);
  });
});

describe('机器人招聘（批量平衡 STAFF=1）', () => {
  it('默认机器人不雇人，批量基线不变；包装后按空缺招聘并派驻，日志可完整重放', () => {
    expect(runGame(5, conservative, 4).state.staff!.members).toHaveLength(0);
    const { state, log } = runGame(5, staffed(conservative, 'conservative'), 4);
    expect(state.staff!.members.length).toBeGreaterThan(0);
    expect(state.staff!.members.some(m => m.post !== null)).toBe(true);
    expect(log.some(l => l.command.type === 'hireStaff')).toBe(true);
    expect(replay(5, log, state.day)).toEqual({ ...state, pauses: [] });
  });
  it('只招主能力达门槛的候选人；现金需求计入月薪', () => {
    const { state } = runGame(9, staffed(aggressive, 'aggressive'), 3);
    for (const m of state.staff!.members) expect(m.skills[m.specialty]).toBeGreaterThanOrEqual(defaultConfig.bots.staffMinSkill);
    const s = structuredClone(state), base = botCashNeed(s, defaultConfig);
    s.staff!.members.push({ ...s.staff!.members[0] ?? s.staff!.pool[0], id: 'X', post: null, salary: 100 });
    expect(botCashNeed(s, defaultConfig) - base).toBeCloseTo(100 * defaultConfig.bots.liquidityMonths, 6);
  });
  it('破产归因把员工薪酬单列', () => {
    const s = newGame(1), from = s.reports.journal.length; s.status = 'bankrupt';
    s.reports.months.push({ period: 1, startDay: 0, endDay: 30, opening: { ...s.reports.opening, cash: 10 }, closing: { ...s.reports.opening, cash: -10 }, fromEntry: from, toEntry: from + 1, phase: '', status: 'bankrupt' });
    s.reports.journal.push({ day: 30, period: 1, kind: 'salary', cash: -20, projectCash: 0, amount: 20, projectId: null });
    expect(bankruptcyTrigger(s)?.reason).toBe('staff');
  });
});
