import { describe, expect, it } from 'vitest';
import {
  aggressive, applyCommand, computeMetrics, conservative, defaultConfig, newGame, projectPnL, replay, runGame, stepDay,
} from './helpers/ordinary-auctions.ts';

describe('样例项目测算（规范 10.1）', () => {
  it('三线城市繁荣期样例：税前利润约 1.46 亿，净利率约 16%', () => {
    const r = projectPnL(defaultConfig, { siteArea: 50000, far: 2.5, floorPrice: 0.2, buildCostPerSqm: 0.3, salePrice: 0.8, interest: 3000 });
    expect(r.revenue).toBeCloseTo(90000, 0);
    expect(r.profit).toBeCloseTo(14600, 0);
    expect(r.margin).toBeCloseTo(0.162, 2);
  });

  it('房价跌 15% 时利润接近归零', () => {
    const r = projectPnL(defaultConfig, { siteArea: 50000, far: 2.5, floorPrice: 0.2, buildCostPerSqm: 0.3, salePrice: 0.68, interest: 3000 });
    expect(r.margin).toBeLessThan(0.05);
  });
});

describe('确定性', () => {
  it('同一种子 + 同一指令日志 = 完全相同的状态', () => {
    const { state, log } = runGame(42, aggressive, 6);
    const again = replay(42, log, state.day);
    expect(JSON.stringify(again)).toBe(JSON.stringify({ ...state, pauses: [] }));
  });

  it('不同种子走出不同的局面', () => {
    const a = runGame(1, conservative, 3).state;
    const b = runGame(2, conservative, 3).state;
    expect(JSON.stringify(a.market)).not.toBe(JSON.stringify(b.market));
  });
});

describe('规则', () => {
  it('开局就有土地拍卖，且出价低于起拍价会被拒绝', () => {
    const s = newGame(7);
    expect(s.auctions.length).toBeGreaterThan(0);
    const a = s.auctions[0];
    expect(applyCommand(s, { type: 'bid', parcelId: a.id, amount: a.startPrice - 1 }).ok).toBe(false);
  });

  it('高价拿地后生成项目，并扣除保证金与首付款', () => {
    const s = newGame(7);
    const a = s.auctions[0];
    const bid = a.aiMax * 2;
    expect(applyCommand(s, { type: 'bid', parcelId: a.id, amount: bid }).ok).toBe(true);
    const cash0 = s.cash + a.deposit;
    while (s.auctions.some((x) => x.id === a.id)) stepDay(s);
    expect(s.projects).toHaveLength(1);
    const p = s.projects[0];
    expect(p.landPaid).toBeCloseTo(p.landCost * defaultConfig.land.firstPaymentRate, 3);
    expect(s.cash).toBeLessThan(cash0);
  });

  it('红线在第 5 年前不生效，之后生效', () => {
    const { state } = runGame(3, conservative, 47 / 12); // 第 4 年最后一个月
    expect(state.regulation.active).toBe(false);
    const later = runGame(3, conservative, 5).state;
    expect(later.regulation.active).toBe(true);
  });

  it('开发贷只能用于在建项目', () => {
    const s = newGame(9);
    expect(applyCommand(s, { type: 'borrow', channel: 'devLoan', amount: 1000 }).ok).toBe(false);
  });
});

describe('平衡冒烟', () => {
  it('30 年整局不出现 NaN', () => {
    for (const strat of [conservative, aggressive]) {
      const { state } = runGame(11, strat, 30);
      const m = computeMetrics(state);
      for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
