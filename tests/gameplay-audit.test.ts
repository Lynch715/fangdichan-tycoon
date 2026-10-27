import { describe, expect, it } from 'vitest';
import { applyCommand, newGame, stepDay, defaultConfig as c, type GameState } from '../src/sim/index.ts';
import { estimateLand } from '../src/estimates/land.ts';
import { bidAffordability } from '../src/ui/affordability.ts';
import { guideStep } from '../src/ui/guide.ts';
import { companyTitle, goals, totalSales } from '../src/ui/milestones.ts';

const career = (seed: number): GameState => {
  const s = newGame(seed, c);
  expect(applyCommand(s, { type: 'startGame', options: { mode: 'career', difficulty: 'standard' } }, c).ok).toBe(true);
  return s;
};

describe('开局新手地块', () => {
  it('生涯开局额外挂出2宗起拍价不超过开局现金35%的新手地，原有地块不变', () => {
    for (const seed of [1, 7, 42, 99]) {
      const bare = newGame(seed, c), s = career(seed);
      const starters = s.auctions.filter(a => a.starter);
      expect(starters).toHaveLength(2);
      for (const a of starters) {
        expect(a.startPrice).toBeLessThanOrEqual(s.cash * 0.35 + 1);
        expect(a.auction).toBeUndefined();
        expect(a.attributes).toBeUndefined();
      }
      // 其余地块与裸开局一致（新手地不消耗随机数）
      expect(s.auctions.filter(a => !a.name.includes('新手地')).map(a => [a.districtId, a.siteArea, a.startPrice]))
        .toEqual(bare.auctions.map(a => [a.districtId, a.siteArea, a.startPrice]));
      expect(bare.auctions.some(a => a.name.includes('新手地'))).toBe(false);
    }
  });
  it('新手地的资金判断为绿色：现金可覆盖资金峰值', () => {
    const s = career(3), a = s.auctions.find(a => a.name.includes('新手地'))!;
    const e = estimateLand(c, s, a, a.startPrice)!;
    expect(bidAffordability(c, s, a, e.peakFunding).level).toBe('ok');
  });
  it('资金明显不够时判为危险，并给出缺口金额', () => {
    const s = career(3), a = s.auctions[0];
    const f = bidAffordability(c, s, a, s.cash * 10);
    expect(f.level).toBe('danger');
    expect(f.gap).toBeGreaterThan(0);
  });
});

describe('地块规模随公司成长', () => {
  it('净资产越大，除常规尺寸那一宗外的挂牌地块越大，最多3倍', () => {
    const area = (cash: number) => {
      const s = newGame(5, c);
      s.cash = cash; s.auctions = [];
      for (let i = 0; i < 90; i++) stepDay(s, c); // 进入下一季度挂牌
      return s.auctions.filter((_, i) => i >= c.land.scale.regularParcels).map(a => a.siteArea);
    };
    const small = area(c.start.cash), big = area(c.start.cash * 9);
    expect(big.length).toBeGreaterThan(0);
    expect(Math.max(...big)).toBeGreaterThan(Math.max(...small));
    expect(Math.max(...big)).toBeLessThanOrEqual(c.land.siteAreaRange[1] * c.land.scale.max);
  });
});

describe('新手指引与成长目标（只读）', () => {
  it('四步指引随状态推进：拍地 → 开工 → 开盘 → 交付后消失', () => {
    const s = career(11);
    expect(guideStep(s)?.step).toBe(1);
    expect(guideStep(s)?.tab).toBe('land');
    const a = s.auctions.find(a => a.name.includes('新手地'))!;
    // 新手地只对玩家开放：按起拍价出价即可拿下，同行不报名
    expect(applyCommand(s, { type: 'bid', parcelId: a.id, amount: a.startPrice }, c).ok).toBe(true);
    expect(guideStep(s)?.tab).toBe('map');
    while (!s.projects.length && s.day < 120) { stepDay(s, c); expect(s.auctions.find(x => x.id === a.id)?.rivalBids?.length ?? 0).toBe(0); }
    expect(guideStep(s)?.step).toBe(2);
    const p = s.projects[0];
    expect(applyCommand(s, { type: 'startProject', projectId: p.id, contractor: 'standard' }, c).ok).toBe(true);
    expect(guideStep(s)?.step).toBe(3);
  });
  it('累计销售、称号与目标从流水推导，不改变状态', () => {
    const s = career(2), before = JSON.stringify(s);
    expect(totalSales(s)).toBe(0);
    expect(companyTitle(0).name).toBe('初创公司');
    expect(companyTitle(30 * 10000).name).toBe('区域开发商');
    const g = goals(s);
    expect(g.next.map(x => x.id.split(':')[0])).toEqual(['sales', 'delivered', 'equity']);
    expect(JSON.stringify(s)).toBe(before);
  });
});
