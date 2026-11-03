import { describe, expect, it } from 'vitest';
import { applyCommand, defaultConfig as c, newGame, stepDay } from '../src/sim/index.ts';
import { filingSalesBlock, filingReminderMarkup, monthlySales, salesBoardMarkup, salesHighlightsMarkup, salesStatus } from '../src/ui/sales.ts';
import { turnBriefingMarkup } from '../src/ui/turn.ts';
import { projectsPanel } from '../src/ui/panels.ts';

function fixture() {
  const s = newGame(7, c);
  applyCommand(s, { type: 'startGame', options: { mode: 'challenge', difficulty: 'standard', challenge: 'delivery' } }, c);
  return s;
}

describe('预售可视化反馈', () => {
  it('未备案停销在简报顶部和项目卡提醒，真实申请及审批后同步更新', () => {
    const s = fixture(), p = s.projects[0];
    s.market.phaseIndex = c.cycle.phases.findIndex(x => x.id === 'downturn');
    s.market.phaseEndMonth = 24;
    p.progress = .5; p.filedPrice = null;
    const before = structuredClone(s);
    expect(filingSalesBlock(c,s,p)).toBe('missing');
    const briefing = turnBriefingMarkup(c,s,null), card = projectsPanel(c,s,p.id);
    expect(briefing.indexOf('销售停滞提醒')).toBeLessThan(briefing.indexOf('① 上回合各项目收益'));
    expect(briefing).toContain(`data-act="view-project" data-id="${p.id}"`);
    expect(briefing).toContain('个项目因未备案暂停销售');
    expect(card.indexOf('未备案，暂停销售')).toBeLessThan(card.indexOf('<details'));
    expect(filingReminderMarkup(c,s,p)).toContain(`data-act="file" data-id="${p.id}"`);
    expect(card.slice(0,card.indexOf('</article>'))).not.toMatch(/预计月去化\s+[1-9]/);
    expect(s).toEqual(before);
    expect(applyCommand(s,{type:'filePrice',projectId:p.id},c).ok).toBe(true);
    expect(filingSalesBlock(c,s,p)).toBe('pending');
    expect(filingReminderMarkup(c,s,p)).toContain('备案审批中');
    expect(filingReminderMarkup(c,s,p)).not.toContain('data-act="file"');
    const sold = p.soldArea;
    for (let i = 0; i < c.time.daysPerMonth * c.filing.approvalMonths; i++) stepDay(s,c);
    expect(p.filedPrice).not.toBeNull();
    expect(p.soldArea).toBeGreaterThan(sold);
    expect(filingSalesBlock(c,s,p)).toBeNull();
    expect(filingReminderMarkup(c,s,p)).toBe('');
  });

  it('现房同样提示备案，不向未达进度、售罄、退出经营或撤证项目发普通备案提醒', () => {
    const s = fixture(), p = s.projects[0];
    s.market.phaseIndex = c.cycle.phases.findIndex(x => x.id === 'downturn');
    p.filedPrice = null; p.stage = 'delivered';
    expect(filingReminderMarkup(c,s,p)).toContain('已交付的现房也需备案');
    for (const stage of ['land','closed','sold','abandoned'] as const) expect(filingSalesBlock(c,s,{...p,stage})).toBeNull();
    expect(filingSalesBlock(c,s,{...p,soldArea:p.saleableArea})).toBeNull();
    expect(filingSalesBlock(c,s,{...p,stage:'construction',progress:c.construction.presaleProgress-.01})).toBeNull();
    expect(filingSalesBlock(c,s,{...p,stage:'construction',progress:.5,presale:{revokedDay:0,reapplyDay:90,hoardingMonths:0}})).toBeNull();
    expect(filingSalesBlock(c,s,{...p,filedPrice:1,filingDueDay:30})).toBeNull();
    s.market.phaseIndex = c.cycle.phases.findIndex(x => x.id === 'recovery');
    expect(filingSalesBlock(c,s,p)).toBeNull();
    expect(turnBriefingMarkup(c,s,null)).not.toContain('销售停滞提醒');
  });

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
      for (const p of s.projects) filingReminderMarkup(c, s, p);
      expect(salesHighlightsMarkup(c, s)).not.toContain('<img src=x>');
      salesHighlightsMarkup(c, s); monthlySales(s);
    }
    expect(s).toEqual(before);
  });
});
