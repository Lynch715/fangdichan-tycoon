import { describe, expect, it } from 'vitest';
import { applyCommand, newGame, defaultConfig as c } from '../src/sim/index.ts';
import { validateSave } from '../src/save.ts';
import { readSlot, slotMeta, writeSlot, savesMarkup, SLOT_COUNT } from '../src/ui/saves.ts';

class MemStore { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }
class FullStore { getItem() { return null; } setItem() { throw new Error('QuotaExceededError'); } }

describe('手动存档槽', () => {
  it('写入后读回同一份存档数据与摘要', () => {
    const s = newGame(3, c); applyCommand(s, { type: 'startGame', options: { mode: 'career', difficulty: 'standard', companyName: '渝江置业' } }, c);
    const data = JSON.stringify({ version: 16, seed: s.seed, day: s.day, log: [] });
    const store = new MemStore(), meta = slotMeta(s.rules!, s, data, new Date('2026-10-27T10:00:00Z'));
    expect(writeSlot(2, meta, store)).toBe(true);
    const back = readSlot(2, store)!;
    expect(back).toEqual(meta);
    expect(back.company).toBe('渝江置业');
    expect(validateSave(JSON.parse(back.data))).not.toBeNull();
    expect(readSlot(1, store)).toBeNull();
  });
  it('存储不可用或内容损坏时不抛错', () => {
    const s = newGame(3, c);
    expect(writeSlot(1, slotMeta(c, s, '{}'), new FullStore())).toBe(false);
    const store = new MemStore(); store.setItem('fdc-slot-1', '不是JSON');
    expect(readSlot(1, store)).toBeNull();
  });
  it('弹窗列出 3 个槽位：空槽可保存，有档可覆盖和读取', () => {
    const s = newGame(3, c), html = savesMarkup(c, s, '已保存 · IndexedDB', [slotMeta(c, s, '{}'), null, null]);
    expect(SLOT_COUNT).toBe(3);
    expect(html.match(/data-slot-save=/g)).toHaveLength(3);
    expect(html.match(/data-slot-load=/g)).toHaveLength(1);
    expect(html).toContain('导出存档文件');
    expect(html).toContain('data-saves-new');
  });
});
