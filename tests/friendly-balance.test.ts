import { describe, expect, it } from 'vitest';
import { applyCommand, buildSessionConfig, defaultConfig as base, marketPrice, newGame, stepDay, validateSessionOptions, type SessionOptions } from '../src/sim/index.ts';
import { filingSalesBlock, salesStatus } from '../src/ui/sales.ts';
import { projectsPanel } from '../src/ui/panels.ts';
import { SessionController } from '../src/ui/session.ts';
import type { Game } from '../src/game.ts';

// 新开局平衡修订（balance=2）：限价期自动限价销售、报价上限 110%；旧日志没有 balance 字段，规则逐值不变。
function fixture(balance: boolean) {
  const options = { mode: 'challenge', difficulty: 'standard', challenge: 'delivery', ...(balance ? { balance: 2 } : {}) } as SessionOptions;
  const s = newGame(7, base);
  expect(applyCommand(s, { type: 'startGame', options }, base).ok).toBe(true);
  const c = s.rules!, p = s.projects[0];
  s.market.phaseIndex = c.cycle.phases.findIndex(x => x.id === 'downturn');
  s.market.phaseEndMonth = 999;
  p.progress = .5; p.filedPrice = null; p.fundingStoppedMonths = 0; p.stoppedUntil = 0;
  return { s, c, p };
}

describe('新开局平衡修订', () => {
  it('不切换模式或难度，直接提交默认开局也启用新修订', () => {
    const listeners = new Map<string, (event: Event) => void>();
    let started: SessionOptions | undefined;
    const game = { needsSetup: true, restart(options: SessionOptions) { started = options; return { ok: true }; } } as unknown as Game;
    const dialogStub = {
      open: false, innerHTML: '',
      addEventListener(type: string, listener: (event: Event) => void) { listeners.set(type, listener); },
      showModal() { this.open = true; }, close() { this.open = false; },
    };
    const dialog = dialogStub as unknown as HTMLDialogElement;
    new SessionController(game, dialog, () => {}).open();
    listeners.get('submit')!({ preventDefault() {} } as Event);
    expect(started).toEqual({ mode: 'career', difficulty: 'standard', balance: 2 });
  });

  it('只接受当前修订号，旧开局选项不带修订且保持原规则', () => {
    expect(validateSessionOptions({ mode: 'career', difficulty: 'easy', balance: 2 })).toEqual({ mode: 'career', difficulty: 'easy', balance: 2 });
    expect(validateSessionOptions({ mode: 'career', difficulty: 'easy', balance: 3 })).toBeNull();
    expect(validateSessionOptions({ mode: 'career', difficulty: 'easy' })).toEqual({ mode: 'career', difficulty: 'easy' });
    const old = buildSessionConfig(base, { mode: 'career', difficulty: 'standard' });
    expect(old.filing.autoFile).toBe(false);
    expect(old.sales.maxPriceFactor).toBe(base.sales.maxPriceFactor);
    const next = buildSessionConfig(base, { mode: 'career', difficulty: 'standard', balance: 2 });
    expect(next.filing.autoFile).toBe(true);
    expect(next.sales.maxPriceFactor).toBe(base.friendlyBalance.maxPriceFactor);
    expect(next.sales.maxPriceFactor).toBeLessThan(base.compliance.hoarding.priceFactor);
  });

  it('限价期未备案：新开局按市场价95%照常销售且不提示停销，旧规则停售', () => {
    const now = fixture(true), old = fixture(false);
    expect(filingSalesBlock(now.c, now.s, now.p)).toBeNull();
    expect(salesStatus(now.c, now.s, now.p)?.text).not.toBe('待备案开盘');
    expect(projectsPanel(now.c, now.s, now.p.id)).toContain('自动限价销售');
    expect(filingSalesBlock(old.c, old.s, old.p)).toBe('missing');
    now.p.priceFactor = 1.1;
    const soldNow = now.p.soldArea, cashIn = now.p.salesIn, soldOld = old.p.soldArea;
    for (let i = 0; i < now.c.time.daysPerMonth; i++) { stepDay(now.s, now.c); stepDay(old.s, old.c); }
    const sold = now.p.soldArea - soldNow;
    expect(sold).toBeGreaterThan(0);
    expect(old.p.soldArea).toBe(soldOld);
    // 成交价不超过市场价×限价上限，挂牌110%也按95%成交
    const market = marketPrice(now.c, now.s, now.p.districtId, now.p.attributes, now.p.product);
    expect((now.p.salesIn - cashIn) / sold).toBeCloseTo(market * now.c.filing.maxMarketFactor, 6);
    expect(now.p.presale?.hoardingMonths ?? 0).toBe(0);
  });

  it('新开局提价止于110%，界面禁用继续提价', () => {
    const { s, c, p } = fixture(true);
    s.market.phaseIndex = c.cycle.phases.findIndex(x => x.id === 'boom');
    expect(applyCommand(s, { type: 'setPrice', projectId: p.id, priceFactor: 1.2 }, c).ok).toBe(true);
    expect(p.priceFactor).toBeCloseTo(1.1);
    expect(projectsPanel(c, s, p.id)).toContain('已到最高报价');
  });
});
