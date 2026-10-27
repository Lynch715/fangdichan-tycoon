import { describe, expect, it } from 'vitest';
import { applyCommand, newGame, defaultConfig as c } from '../src/sim/index.ts';
import { runGame, conservative } from '../src/sim/bots.ts';
import { ACHIEVEMENTS, achievementsMarkup, earnedAchievements, loadUnlocks, mergeUnlocks, saveUnlocks, type Unlocks } from '../src/ui/achievements.ts';

class MemStore { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }

describe('成就系统', () => {
  it('成就 id 唯一，数量 24，每个都有名称、说明与图标', () => {
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.length).toBe(24);
    for (const a of ACHIEVEMENTS) { expect(a.name).toBeTruthy(); expect(a.desc).toBeTruthy(); expect(a.icon).toBeTruthy(); }
  });
  it('新开局没有成就；稳健经营 15 年解锁起步与规模成就，检查不改变状态', () => {
    expect(earnedAchievements(newGame(4, c), c)).toEqual([]);
    const { state } = runGame(4, conservative, 15), before = JSON.stringify(state);
    const got = earnedAchievements(state, c);
    for (const id of ['first_land', 'first_sale', 'first_delivery', 'first_close', 'sales_10', 'ten_delivered']) expect(got).toContain(id);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('沙盒模式不计成就', () => {
    const s = newGame(4, c);
    applyCommand(s, { type: 'startGame', options: { mode: 'sandbox', difficulty: 'standard' } }, c);
    s.projects.push(...runGame(4, conservative, 6).state.projects);
    expect(earnedAchievements(s, s.rules!)).toEqual([]);
  });
  it('解锁只记录一次，跨局保存并可读回', () => {
    const u: Unlocks = {}, store = new MemStore();
    expect(mergeUnlocks(u, ['first_land', 'first_sale'], '渝江置业')).toEqual(['first_land', 'first_sale']);
    expect(mergeUnlocks(u, ['first_land', 'first_delivery'], '别的公司')).toEqual(['first_delivery']);
    expect(u.first_land.company).toBe('渝江置业');
    saveUnlocks(u, store);
    expect(loadUnlocks(store)).toEqual(u);
    const html = achievementsMarkup(u, false);
    expect(html).toContain(`成就 3 / ${ACHIEVEMENTS.length}`);
    expect(achievementsMarkup({}, true)).toContain('沙盒模式');
  });
});
