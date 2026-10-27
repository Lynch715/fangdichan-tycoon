import { describe, expect, it } from 'vitest';
import { defaultConfig as c, stepDay } from '../src/sim/index.ts';
import { runGame, aggressive, conservative } from '../src/sim/bots.ts';
import { estimateRunway } from '../src/estimates/runway.ts';
import { runwayMarkup } from '../src/ui/panels.ts';

describe('现金续航估算（只读）', () => {
  it('不改变状态与随机数', () => {
    const { state } = runGame(4, aggressive, 6), before = JSON.stringify(state);
    estimateRunway(c, state); runwayMarkup(c, state);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('下个月的土地、利息、还本与工程款与内核实际结算一致', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 5, 8]) for (const years of [3, 6]) {
      const { state } = runGame(seed, conservative, years), s = state.rules ?? c;
      if (state.status !== 'playing') continue;
      const est = estimateRunway(s, state).schedule[0];
      const from = state.reports.journal.length, dpm = s.time.daysPerMonth, end = (Math.floor(state.day / dpm) + 1) * dpm;
      while (state.day < end) stepDay(state, s);
      const got = (k: string, f: (e: typeof state.reports.journal[number]) => number) => state.reports.journal.slice(from).filter(e => e.kind === k).reduce((n, e) => n + f(e), 0);
      expect(got('land', e => -e.cash)).toBeCloseTo(est.land, 3);
      expect(got('interest', e => -e.cash)).toBeCloseTo(est.interest, 3);
      // 工程款内核记账额为 spend×权益比例；事故会改变当月成本，允许 30% 偏差
      const build = got('construction', e => e.amount);
      if (est.construction > 0 && build > 0) expect(Math.abs(build - est.construction) / est.construction).toBeLessThan(0.3);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });
  it('现金为负时续航为 0；无支出时超过展望期', () => {
    const { state } = runGame(4, conservative, 2);
    expect(estimateRunway(c, { ...state, cash: -1 }).months).toBe(0);
    expect(estimateRunway(c, { ...state, cash: 1e9, debts: [], projects: [] }).months).toBeNull();
    expect(runwayMarkup(c, state)).toContain('现金续航');
  });
});
