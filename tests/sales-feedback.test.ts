import { describe, expect, it } from 'vitest';
import { applyCommand, defaultConfig as c, newGame, stepDay } from '../src/sim/index.ts';
import { monthlySales, salesBoardMarkup, salesHighlightsMarkup, salesStatus } from '../src/ui/sales.ts';
import { turnBriefingMarkup } from '../src/ui/turn.ts';

function fixture() {
  const s = newGame(7, c);
  applyCommand(s, { type: 'startGame', options: { mode: 'challenge', difficulty: 'standard', challenge: 'delivery' } }, c);
  return s;
}

describe('预售可视化反馈', () => {
  it('按真实预售资格与备案、撤证状态显示，交付后不受预售撤证影响', () => {
    const s = fixture(), p = s.projects[0];
    p.progress = c.construction.presaleProgress - .01; p.soldArea = 0;
    expect(salesStatus(c, s, p)).toBeNull();
    p.progress = c.construction.presaleProgress;
    s.regulation.active = false;
    s.market.phaseIndex = c.cycle.phases.findIndex(x => !c.filing.restrictedPhases.includes(x.id));
    expect(salesStatus(c, s, p)?.text).toBe('预售进行中');
    p.presale = { revokedDay: 0, reapplyDay: 60, hoardingMonths: 0 };
    expect(salesStatus(c, s, p)?.text).toBe('预售暂停');
    p.stage = 'delivered';
    expect(salesStatus(c, s, p)?.text).toBe('现房销售');
    p.stage = 'construction'; p.presale.revokedDay = null;
    s.regulation.active = true; p.filedPrice = null;
    s.market.phaseIndex = c.cycle.phases.findIndex(x => c.filing.restrictedPhases.includes(x.id));
    expect(salesStatus(c, s, p)?.text).toBe('待备案开盘');
  });

  it('签约与释放现金分别读取最近完整月报，合作项目按权益金额展示', () => {
    const s = fixture();
    s.projects[0].partnerShare = .4;
    for (let i = 0; i < c.time.daysPerMonth; i++) stepDay(s, c);
    const m = s.reports.months.at(-1)!;
    const entries = s.reports.journal.slice(m.fromEntry, m.toEntry);
    const total = monthlySales(s), p = s.projects[0];
    expect(total.booked).toBeGreaterThan(0);
    expect(total.booked).toBeCloseTo(entries.filter(e => e.kind === 'saleBooked').reduce((n, e) => n + e.amount, 0));
    expect(total.released).toBeCloseTo(entries.filter(e => e.kind === 'escrowRelease').reduce((n, e) => n + e.cash, 0));
    expect(monthlySales(s, p.id).booked).toBeCloseTo(entries.filter(e => e.projectId === p.id && e.kind === 'saleBooked').reduce((n, e) => n + e.amount, 0));
    expect(salesHighlightsMarkup(c, s)).toContain('本公司权益口径');
    expect(turnBriefingMarkup(c, s, null)).toContain('上回合销售战报');
  });

  it('销售格按面积比例显示，不将99.9%误报售罄，零成交无虚构奖励', () => {
    const s = fixture(), p = s.projects[0]; p.progress = .5; p.soldArea = p.saleableArea * .999;
    expect(salesStatus(c, s, p)?.text).not.toBe('全部售罄');
    p.soldArea = p.saleableArea;
    expect(salesBoardMarkup(c, s, p)).toContain('售罄达成');
    p.soldArea = 0;
    const html = salesBoardMarkup(c, s, p);
    expect(html).toContain('等待首批成交');
    expect(html).toContain('每格 = 2.5% 可售面积');
    expect(html).toContain('上月签约</span><b>0 万');
    expect(salesHighlightsMarkup(c, s)).toBe('');
  });

  it('反复生成看板、战报和状态标签不改变状态、随机流或原始统计', () => {
    const s = fixture();
    for (let i = 0; i < c.time.daysPerMonth; i++) stepDay(s, c);
    s.projects[0].name = '<img src=x>';
    const before = structuredClone(s);
    for (let i = 0; i < 3; i++) {
      for (const p of s.projects) salesBoardMarkup(c, s, p);
      expect(salesHighlightsMarkup(c, s)).not.toContain('<img src=x>');
      salesHighlightsMarkup(c, s); monthlySales(s);
    }
    expect(s).toEqual(before);
  });
});
