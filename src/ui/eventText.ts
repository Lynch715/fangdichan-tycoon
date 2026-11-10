// 只修正显示文案，保留事件 ID、历史日志和抽取规则。
import { calendar, type ActiveSeason, type Config, type GameState } from '../sim/index.ts';

const calendarLabels: Record<string, { months: number[]; name: string; text: string }> = {
  twoSessions: { months: [3], name: '春季稳楼市信号', text: '政策释放稳楼市信号，新增融资利率下行' },
  goldenAutumn: { months: [9,10], name: '秋季集中推盘', text: '秋季促销，开发商集中推盘' },
  nationalDay: { months: [10], name: '秋季看房潮', text: '秋季看房客流增加，工地错峰休整' },
  quotaTight: { months: [9], name: '信贷额度阶段性紧张', text: '银行当期信贷额度紧张，新增融资利率上行' },
  yearEndPush: { months: [12], name: '冬季促销', text: '冬季加推促销，各盘推出特价房' },
  springFestival: { months: [1,2], name: '冬季返乡休整', text: '冬季工人集中返乡，工地减速' },
  yearEndCredit: { months: [12], name: '冬季资金面收紧', text: '冬季资金面收紧，监管窗口指导加强' },
};
function labelFor(id: string | null, month: number) {
  const label = id ? calendarLabels[id] : undefined;
  return label && !label.months.includes(month) ? label : null;
}
export function displaySeasonEvent(event: ActiveSeason): ActiveSeason {
  const label = labelFor(event.eventId,event.month % 12 + 1);
  return label ? { ...event, name: label.name, text: label.text } : event;
}

export function displayNewsText(c: Config, n: GameState['news'][number]): string {
  if (!['market','policy'].includes(n.kind) || !n.text.startsWith('【')) return n.text;
  for (const event of c.seasons.events) {
    const season = c.seasons.list.find(s=>s.id===event.season)?.name;
    const prefix = `【${season}季·${event.name}】`;
    if (!n.text.startsWith(prefix)) continue;
    const label = labelFor(event.id,calendar(c,n.day).month);
    const text = label ? n.text.replace(prefix,`【${season}季·${label.name}】`).replace(event.text,label.text) : n.text;
    return text.replace('（下回合生效）','（当月生效）');
  }
  return n.text;
}
