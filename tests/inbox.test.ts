import { describe, expect, it } from 'vitest';
import { badgeText, newsKey, unreadCount } from '../src/ui/inbox.ts';

type N = { day: number; kind: 'policy' | 'market' | 'company' | 'land' | 'warning'; text: string };
const news: N[] = [
  { day: 40, kind: 'warning', text: '监管抽查' },
  { day: 31, kind: 'land', text: '新地挂牌' },
  { day: 1, kind: 'company', text: '公司成立' },
];

describe('经营消息未读', () => {
  it('从最新一条数到上次看到的消息为止，风险消息单独计数', () => {
    expect(unreadCount(news, newsKey(news[2]))).toEqual({ total: 2, warnings: 1 });
    expect(unreadCount(news, newsKey(news[0]))).toEqual({ total: 0, warnings: 0 });
  });
  it('没有已读记录或记录已滚出列表时全部算未读', () => {
    expect(unreadCount(news, null).total).toBe(3);
    expect(unreadCount(news, '999|不存在').total).toBe(3);
  });
  it('角标为空、正常数字或 99+', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(7)).toBe('7');
    expect(badgeText(150)).toBe('99+');
  });
});
