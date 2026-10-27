import { borrowCapacity, type Config, type GameState, type Parcel } from '../sim/index.ts';
import { yi } from './format.ts';

export type Affordability = { level: 'ok' | 'finance' | 'danger'; gap: number; text: string };

/**
 * 拍地资金判断：把测算出的自有资金峰值与“现金 + 信托可借额度”比较。
 * 只读估算，不改状态；目的是在出价前把“买得起吗”说清楚。
 */
export function bidAffordability(config: Config, s: GameState, a: Pick<Parcel, 'deposit' | 'playerBid'>, peak: number): Affordability {
  // 已出价的保证金已从现金里扣除，评估这块地时加回来
  const cash = Math.max(0, s.cash) + (a.playerBid ? a.deposit : 0);
  const trust = borrowCapacity(config, s, 'trust').max;
  if (peak <= cash) return { level: 'ok', gap: 0, text: `现金可覆盖资金峰值，还剩约 ${yi(cash - peak)} 余量` };
  if (peak <= cash + trust) {
    const need = peak - cash;
    return { level: 'finance', gap: need, text: `现金不够，需借约 ${yi(need)}（信托现可借 ${yi(trust)}）才能撑到预售回款` };
  }
  const gap = peak - cash - trust;
  return { level: 'danger', gap, text: `资金缺口 ${yi(gap)}：现金加可借额度仍不够，拿地后大概率停工、烂尾甚至破产` };
}
