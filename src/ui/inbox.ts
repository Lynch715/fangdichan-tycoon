import { calendar, type Config, type GameState } from '../sim/index.ts';
import { esc } from './format.ts';

type News = GameState['news'][number];

const KIND_LABEL: Record<News['kind'], string> = { warning: '风险', policy: '政策', market: '市场', company: '公司', land: '土地' };

/** 一条消息的身份：同日同文视为同一条。只用于界面已读标记，不进存档。 */
export const newsKey = (n: News) => `${n.day}|${n.text}`;

/** 从最新一条往后数，直到遇到上次看到的最新消息为止；找不到则全部算未读。 */
export function unreadCount(news: readonly News[], seenKey: string | null): { total: number; warnings: number } {
  let total = 0, warnings = 0;
  for (const n of news) {
    if (seenKey !== null && newsKey(n) === seenKey) break;
    total++;
    if (n.kind === 'warning') warnings++;
  }
  return { total, warnings };
}

export function badgeText(n: number): string {
  return n <= 0 ? '' : n > 99 ? '99+' : String(n);
}

export function inboxList(config: Config, s: GameState, seenKey: string | null): string {
  if (!s.news.length) return '<p class="empty">暂无消息。拿地、开工、监管和市场变化都会出现在这里。</p>';
  const unread = unreadCount(s.news, seenKey).total;
  return s.news.map((n, i) => {
    const c = calendar(config, n.day);
    return `<article class="msg ${n.kind}${i < unread ? ' unread' : ''}">
      <div class="msg-meta"><span class="msg-kind">${KIND_LABEL[n.kind]}</span><span>${c.year}年${c.month}月${c.day}日</span>${i < unread ? '<span class="msg-new">新</span>' : ''}</div>
      <p>${esc(n.text)}</p>
    </article>`;
  }).join('');
}
