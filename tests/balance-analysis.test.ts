import { describe, expect, it } from 'vitest';
import { bankruptcyTrigger, downturnDrawdown, positiveInteger, quantile } from '../src/analysis/balance.ts';
import { aggressive, defaultConfig, newGame, runGame } from '../src/sim/index.ts';
import type { GameState, LedgerEntry, LedgerKind, MonthlyReport } from '../src/sim/types.ts';
const metrics = newGame(1).reports.opening;
function month(n: number, opening: number, closing: number, status: GameState['status'] = 'playing', phase = '下行'): MonthlyReport {
  return { period: n, startDay: (n - 1) * 30, endDay: n * 30, opening: { ...metrics, cash: opening, equity: opening },
    closing: { ...metrics, cash: closing, equity: closing }, fromEntry: n - 1, toEntry: n, phase, status };
}
function entry(kind: LedgerKind, cash: number): LedgerEntry {
  return { day: 30, period: 1, kind, cash, projectCash: 0, amount: Math.abs(cash), projectId: null };
}
function fixture(months: MonthlyReport[], journal: LedgerEntry[]) {
  return { status: 'bankrupt' as const, reports: { ...newGame(1).reports, months, journal } };
}
describe('D3 只读平衡统计', () => {
  it('只归因最终连续危机，不把此前已获救的危机计入', () => {
    const s = fixture([month(1, 100, -20, 'distress'), month(2, -20, 100), month(3, 100, -50, 'distress'), month(4, -50, -60, 'bankrupt')],
      [entry('fine', -120), entry('loan', 120), entry('repay', -150), entry('interest', -10)]);
    expect(bankruptcyTrigger(s)).toMatchObject({ reason: 'principal', period: 3, entry: 2, cashBefore: 100, cashAfter: -50 });
  });
  it('同月多次回正转负时选最后一次，忽略非现金分摊', () => {
    const m = month(1, 100, -10, 'bankrupt'); m.toEntry = 4;
    const s = fixture([m], [entry('repay', -200), entry('loan', 120), entry('financeAllocation', 0), entry('fine', -30)]);
    expect(bankruptcyTrigger(s)).toMatchObject({ reason: 'risk', entry: 3, cashBefore: 20, cashAfter: -10 });
  });
  it('零现金扣款可触发，未破产不分类', () => {
    const s = fixture([month(1, 0, -10, 'bankrupt')], [entry('transfer', -10)]);
    expect(bankruptcyTrigger(s)?.reason).toBe('transfer');
    expect(bankruptcyTrigger({ ...s, status: 'distress' })).toBeNull();
  });
  it('缺报表、缺流水、期初已负且无回正、现金无法核对均标记未知', () => {
    expect(bankruptcyTrigger(fixture([], []))?.reason).toBe('unknown');
    const s = fixture([month(1, 100, -10, 'bankrupt')], []);
    expect(bankruptcyTrigger(s)?.reason).toBe('unknown');
    s.reports.journal = [entry('land', -111)];
    expect(bankruptcyTrigger(s)?.reason).toBe('unknown');
    s.reports.journal = [entry('land', -110)]; s.reports.complete = false;
    expect(bankruptcyTrigger(s)?.reason).toBe('unknown');
    expect(bankruptcyTrigger(fixture([month(1, -10, -20, 'bankrupt')], [entry('interest', -10)]))?.reason).toBe('unknown');
  });
  it('各主要流水类别可区分，其他支出不被伪归因成债务', () => {
    const pairs = [['repay', 'principal'], ['extensionFee', 'finance'], ['deposit', 'land'], ['construction', 'construction'], ['accident', 'risk'], ['marketing', 'operations'], ['acquisition', 'other']] as const;
    for (const [kind, reason] of pairs) expect(bankruptcyTrigger(fixture([month(1, 10, -10, 'bankrupt')], [entry(kind, -20)]))?.reason).toBe(reason);
  });
  it('回撤取此前整个生涯峰值，只在下行月末计入，重复周期保留历史峰值', () => {
    const ms = [month(1, 100, 200, 'playing', '繁荣'), month(2, 200, 150), month(3, 150, 50, 'playing', '救市'), month(4, 50, 250, 'playing', '繁荣'), month(5, 250, 180)];
    const d = downturnDrawdown(ms, '下行')!;
    expect(d.months).toBe(2);
    expect(d.amount).toEqual({ value: 70, peak: 250, equity: 180, peakDay: 120, day: 150 });
    expect(d.rate?.value).toBe(.28); // 救市月的75%跌幅不纳入下行端点
  });
  it('金额与比例最大值可来自不同月份，破产负净资产保留超过100%的回撤', () => {
    const d = downturnDrawdown([month(1, 100, -20, 'distress'), month(2, -20, 1000, 'playing', '繁荣'), month(3, 1000, 500, 'bankrupt')], '下行')!;
    expect(d.amount.value).toBe(500); expect(d.amount.day).toBe(90);
    expect(d.rate?.value).toBe(1.2); expect(d.rate?.day).toBe(30);
  });
  it('未到下行不伪装零回撤；非正峰值不计算比例；下行创新高可为零', () => {
    expect(downturnDrawdown([], '下行')).toBeNull();
    expect(downturnDrawdown([month(1, 100, 90, 'playing', '繁荣')], '下行')).toBeNull();
    const d = downturnDrawdown([month(1, -10, -20)], '下行')!;
    expect(d.amount.value).toBe(10); expect(d.rate).toBeNull();
    expect(downturnDrawdown([month(1, 10, 20)], '下行')?.rate?.value).toBe(0);
  });
  it('分位数沿用原脚本算法且不重排输入，空样本不适用；非法参数早报错', () => {
    const xs = [4, 2, 3, 1]; expect(quantile(xs, .5)).toBe(3); expect(xs).toEqual([4, 2, 3, 1]);
    expect(quantile([], .5)).toBeNull(); expect(quantile(xs, 1)).toBe(4);
    expect(() => quantile(xs, -1)).toThrow(); expect(() => quantile([NaN], .5)).toThrow();
    for (const input of ['0', '-1', 'NaN', '1.5', 'Infinity', '']) expect(() => positiveInteger(input, 'RUNS')).toThrow('RUNS');
    expect(positiveInteger('200', 'RUNS')).toBe(200);
  });
  it('真实破产样本可从完整流水核对且统计不改变状态、日志或随机数', () => {
    const { state } = runGame(9, aggressive, 30); // 2026-10-27 定价曲线调整后（G01 后续），改用破产样本种子9
    const before = JSON.stringify(state);
    const trigger = bankruptcyTrigger(state);
    const d = downturnDrawdown(state.reports.months, defaultConfig.cycle.phases.find(p => p.id === 'downturn')!.name);
    expect(state.status).toBe('bankrupt');
    {
      expect(trigger?.reason).not.toBe('unknown');
      const t = trigger!, e = state.reports.journal[t.entry!];
      expect(t.cashBefore! + e.cash).toBe(t.cashAfter); expect(t.cashAfter).toBeLessThan(0);
    }
    expect(d === null || d.amount.value >= 0).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });
});
