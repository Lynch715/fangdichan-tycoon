import { activeProject, defaultConfig, presaleBlocked, type GameState } from '../sim/index.ts';
import { pct, yi } from './format.ts';
import { filingSalesBlock } from './sales.ts';

export type GuideStep = { step: number; total: number; text: string; tab: 'land' | 'projects' | 'map' };

/** 新手四步，完全由状态推导：拍地 → 开工 → 开盘 → 交付。全部完成后返回 null。 */
export function guideStep(s: GameState): GuideStep | null {
  const total = 4, mine = s.projects.filter(activeProject), c = s.rules ?? defaultConfig;
  if (s.status === 'bankrupt') return null;
  if (s.projects.some(p => p.deliveredDay !== null)) return null;
  if (!mine.length) {
    const bid = s.auctions.some(a => a.playerBid !== null);
    return bid
      ? { step: 1, total, tab: 'map', text: '已出价：点右上角「结束回合」推进，开拍日揭晓结果' }
      : { step: 1, total, tab: 'land', text: `去「拍地」挑一块资金判断为绿色的地出价（现金 ${yi(Math.max(0, s.cash))}）` };
  }
  if (mine.some(p => p.stage === 'land')) return { step: 2, total, tab: 'projects', text: '拿地成功！去「项目」选择产品线与总包开工' };
  if (!mine.some(p => p.soldArea > 0)) {
    if (mine.some(presaleBlocked)) return { step: 3, total, tab: 'projects', text: '预售证已暂停：去「项目」申请整改复审，获批后恢复销售' };
    if (mine.some(p => filingSalesBlock(c,s,p) === 'missing')) return { step: 3, total, tab: 'projects', text: '限价期需先备案：去「项目」申请限价备案，获批后开盘' };
    if (mine.some(p => filingSalesBlock(c,s,p) === 'pending')) return { step: 3, total, tab: 'projects', text: '备案审批中，继续「结束回合」推进，获批后恢复销售' };
    return { step: 3, total, tab: 'projects', text: `工程进度到 ${pct(c.construction.presaleProgress)} 可取得预售资格，继续「结束回合」推进` };
  }
  return { step: 4, total, tab: 'projects', text: '已开盘回款！在「项目」调售价与营销，等待竣工交付结算' };
}
