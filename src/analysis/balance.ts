// 只读批量统计，不参与模拟、日志或存档迁移。
import type { GameState, LedgerKind, MonthlyReport } from '../sim/types.ts';

export const reasonLabels = {
  principal: '债务本金兑付', finance: '利息/展期费', land: '土地款/保证金',
  construction: '工程付款', risk: '罚款/事故', transfer: '转让补付',
  operations: '营销/税费', other: '其他现金支出', unknown: '记录不足/未能归因',
} as const;
export type BankruptcyReason = keyof typeof reasonLabels;
export interface BankruptcyTrigger {
  reason: BankruptcyReason; period: number | null; entry: number | null;
  kind: LedgerKind | null; cashBefore: number | null; cashAfter: number | null;
}
function category(kind: LedgerKind): BankruptcyReason {
  if (kind === 'repay') return 'principal';
  if (kind === 'interest' || kind === 'extensionFee') return 'finance';
  if (kind === 'land' || kind === 'deposit') return 'land';
  if (kind === 'construction') return 'construction';
  if (kind === 'fine' || kind === 'accident') return 'risk';
  if (kind === 'transfer') return 'transfer';
  if (kind === 'marketing' || kind === 'tax') return 'operations';
  return 'other';
}
/** 最终连续危机的首月，最后一次由非负转负的流水；不是多因素经营成因推断。 */
export function bankruptcyTrigger(s: Pick<GameState, 'status' | 'reports'>): BankruptcyTrigger | null {
  if (s.status !== 'bankrupt') return null;
  const { months, journal } = s.reports;
  const unknown: BankruptcyTrigger = { reason: 'unknown', period: null, entry: null, kind: null, cashBefore: null, cashAfter: null };
  let i = months.length - 1;
  if (!s.reports.complete || i < 0 || months[i].status !== 'bankrupt') return unknown;
  while (i > 0 && months[i - 1].status === 'distress') i--;
  const m = months[i];
  unknown.period = m.period;
  if (m.fromEntry < 0 || m.toEntry > journal.length || m.fromEntry > m.toEntry) return unknown;
  let cash = m.opening.cash, trigger: BankruptcyTrigger | null = null;
  for (let k = m.fromEntry; k < m.toEntry; k++) {
    const e = journal[k], next = cash + e.cash;
    if (cash >= 0 && next < 0) trigger = { reason: category(e.kind), period: m.period, entry: k, kind: e.kind, cashBefore: cash, cashAfter: next };
    cash = next;
  }
  // 缺流水或月末已回正时不得给出貌似精确的归因。
  if (!Number.isFinite(cash) || cash >= 0 || Math.abs(cash - m.closing.cash) > 1e-4 + Math.abs(cash) * 1e-9) return unknown;
  return trigger ?? unknown;
}

export interface DrawdownPoint { value: number; peak: number; equity: number; peakDay: number; day: number }
export interface DownturnDrawdown { months: number; amount: DrawdownPoint; rate: DrawdownPoint | null }
/** 月末抽样：下行月末相对于此前整个生涯的净资产峰值，负净资产允许回撤超过100%。 */
export function downturnDrawdown(months: readonly MonthlyReport[], downturnName: string): DownturnDrawdown | null {
  if (!months.length) return null;
  let peak = months[0].opening.equity, peakDay = months[0].startDay;
  let result: DownturnDrawdown | null = null;
  for (const m of months) {
    const equity = m.closing.equity;
    if (equity > peak) { peak = equity; peakDay = m.endDay; }
    if (m.phase !== downturnName) continue;
    const point = { value: Math.max(0, peak - equity), peak, equity, peakDay, day: m.endDay };
    if (!result) result = { months: 0, amount: point, rate: null };
    result.months++;
    if (point.value > result.amount.value) result.amount = point;
    if (peak > 0) {
      const rate = { ...point, value: point.value / peak };
      if (!result.rate || rate.value > result.rate.value) result.rate = rate;
    }
  }
  return result;
}

export function quantile(values: readonly number[], q: number): number | null {
  if (!values.length) return null;
  if (q < 0 || q > 1 || !Number.isFinite(q) || values.some(x => !Number.isFinite(x))) throw new Error('无效分位数数据');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}
export function positiveInteger(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${name} 必须为正整数`);
  return n;
}
