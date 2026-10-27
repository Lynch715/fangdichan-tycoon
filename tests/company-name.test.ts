import { describe, expect, it } from 'vitest';
import { applyCommand, newGame, stepDay, defaultConfig as c, validateSessionOptions } from '../src/sim/index.ts';
import { normalizeCompanyName } from '../src/sim/sessionConfig.ts';
import { randomCompanyName } from '../src/ui/session.ts';

describe('自定义公司名', () => {
  it('规范化：去首尾空白、合并空白、2–12 个字，拒绝控制字符与尖括号', () => {
    expect(normalizeCompanyName('  渝江   置业 ')).toBe('渝江 置业');
    expect(normalizeCompanyName('山')).toBeNull();
    expect(normalizeCompanyName('一二三四五六七八九十十一十二')).toBeNull();
    expect(normalizeCompanyName('<b>坏</b>')).toBeNull();
    expect(normalizeCompanyName(42)).toBeNull();
    expect(validateSessionOptions({ mode: 'career', difficulty: 'standard', companyName: '渝江置业' })).toEqual({ mode: 'career', difficulty: 'standard', companyName: '渝江置业' });
    expect(validateSessionOptions({ mode: 'career', difficulty: 'standard', companyName: 'x' })).toBeNull();
  });
  it('开局生效：公司名进入规则、成立新闻，并随开局指令确定性重放', () => {
    const s = newGame(5, c), cmd = { type: 'startGame' as const, options: { mode: 'career' as const, difficulty: 'standard' as const, companyName: '渝江置业' } };
    expect(applyCommand(s, cmd, c).ok).toBe(true);
    expect(s.rules?.start.companyName).toBe('渝江置业');
    expect(s.news.some(n => n.text.includes('渝江置业'))).toBe(true);
    const again = newGame(5, c); applyCommand(again, cmd, c);
    for (let i = 0; i < 60; i++) { stepDay(s, s.rules!); stepDay(again, again.rules!); }
    expect(again).toEqual(s);
  });
  it('格式不对或与同行重名时拒绝开局，给出明确原因，状态不变', () => {
    const s = newGame(5, c), before = JSON.stringify(s);
    const bad = applyCommand(s, { type: 'startGame', options: { mode: 'career', difficulty: 'standard', companyName: 'x' } }, c);
    expect(bad.ok).toBe(false); expect(bad.error).toContain('2–12');
    const rival = c.rivals.companies[0].name;
    const dup = applyCommand(s, { type: 'startGame', options: { mode: 'career', difficulty: 'standard', companyName: rival } }, c);
    expect(dup.ok).toBe(false); expect(dup.error).toContain('重名');
    expect(JSON.stringify(s)).toBe(before);
  });
  it('接管违约公司挑战沿用剧情公司名', () => {
    const s = newGame(5, c);
    expect(applyCommand(s, { type: 'startGame', options: { mode: 'challenge', difficulty: 'standard', challenge: 'delivery', companyName: '渝江置业' } }, c).ok).toBe(true);
    expect(s.rules?.start.companyName).toBe(c.sessions.challenges.delivery.companyName);
  });
  it('随机名避开同行和默认名', () => {
    const taken = new Set([c.start.companyName, ...c.rivals.companies.map(r => r.name)]);
    for (let i = 0; i < 50; i++) expect(taken.has(randomCompanyName())).toBe(false);
  });
});
