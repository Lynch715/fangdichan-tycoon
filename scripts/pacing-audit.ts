// 游戏性节奏审计：只读运行保守机器人，统计真实时间里的事件密度、暂停打断和首次回报。
// 用法：node scripts/pacing-audit.ts  可设 RUNS、YEARS、STRATEGY=conservative|aggressive
import { newGame, applyCommand, stepDay, computeMetrics } from '../src/sim/index.ts';
import { conservative, aggressive } from '../src/sim/bots.ts';
import { defaultConfig as c } from '../src/sim/config.ts';
import type { PauseReason } from '../src/sim/types.ts';

const RUNS = Number(process.env.RUNS ?? 20), YEARS = Number(process.env.YEARS ?? 10);
const strat = process.env.STRATEGY === 'aggressive' ? aggressive : conservative;
const DPM = c.time.daysPerMonth, secPerMonth = c.time.secondsPerMonthAt1x;
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const med = (xs: number[]) => q(xs, 0.5);

const pauseTotals: Record<string, number[]> = {};
const firstWin: number[] = [], firstSale: number[] = [], firstSettle: number[] = [], firstProfitMonth: number[] = [];
const quietMax: number[] = [], decisionsPerYear: number[] = [], winRate: number[] = [], bankrupt: number[] = [];
const netByYear: Record<number, number[]> = {};
const newsPerMonth: number[] = [];

for (let seed = 1; seed <= RUNS; seed++) {
  const s = newGame(seed, c);
  const pauses: Record<string, number> = {};
  let decisions = 0, quiet = 0, maxQuiet = 0, monthHadEvent = false, bids = 0, wins = 0;
  let fw = -1, fs = -1, fst = -1, fpm = -1;
  const startNet = computeMetrics(s).equity;
  const end = YEARS * 12 * DPM;
  let lastNews = s.news.length ? s.news[0] : null;
  let newsThisMonth = 0;
  while (s.day < end && s.status !== 'bankrupt') {
    const before = new Set(s.projects.map(p => p.id));
    for (const cmd of strat(s, s.rules ?? c)) {
      if (applyCommand(s, cmd, c).ok) { decisions++; monthHadEvent = true; if (cmd.type === 'bid') bids++; }
    }
    stepDay(s, c);
    for (const p of s.pauses as PauseReason[]) { pauses[p] = (pauses[p] ?? 0) + 1; monthHadEvent = true; }
    s.pauses = [];
    // 新消息
    for (const n of s.news) { if (n === lastNews) break; newsThisMonth++; }
    lastNews = s.news[0] ?? null;
    for (const p of s.projects) if (!before.has(p.id)) { wins++; if (fw < 0) fw = s.day; }
    if (fs < 0 && s.projects.some(p => p.soldArea > 0)) fs = s.day;
    if (fst < 0 && s.projects.some(p => p.stage === 'closed')) fst = s.day;
    if (s.day % DPM === 0) {
      const m = s.day / DPM;
      if (fpm < 0 && computeMetrics(s).equity > startNet * 1.05) fpm = m;
      if (monthHadEvent) quiet = 0; else { quiet++; maxQuiet = Math.max(maxQuiet, quiet); }
      monthHadEvent = false;
      newsPerMonth.push(newsThisMonth); newsThisMonth = 0;
      if (m % 12 === 0) (netByYear[m / 12] ??= []).push(computeMetrics(s).equity / startNet);
    }
  }
  for (const k of Object.keys(pauses)) (pauseTotals[k] ??= []).push(pauses[k] / YEARS);
  firstWin.push(fw / DPM); firstSale.push(fs / DPM); firstSettle.push(fst / DPM); firstProfitMonth.push(fpm);
  quietMax.push(maxQuiet); decisionsPerYear.push(decisions / YEARS); winRate.push(bids ? wins / bids : 0);
  bankrupt.push(s.status === 'bankrupt' ? 1 : 0);
}

const mins = (months: number, speed: number) => (months * secPerMonth / speed / 60).toFixed(1);
console.log(`策略=${strat === conservative ? '保守' : '激进'} RUNS=${RUNS} YEARS=${YEARS}；1x 一个月=${secPerMonth}秒`);
console.log('\n[首次回报，月份中位(P90)；括号为真实分钟 1x/4x]');
for (const [k, xs] of [['首次拿地', firstWin], ['首次售出', firstSale], ['首次清盘结算', firstSettle], ['净资产首次+5%', firstProfitMonth]] as const) {
  const v = xs.filter(x => x >= 0); const m = med(v);
  console.log(`  ${k}: ${m.toFixed(1)} 月 (P90 ${q(v, 0.9).toFixed(1)}) → ${mins(m, 1)} / ${mins(m, 4)} 分钟；未发生 ${xs.length - v.length}/${xs.length}`);
}
console.log('\n[自动暂停/年，中位]');
for (const [k, xs] of Object.entries(pauseTotals)) console.log(`  ${k}: ${med(xs).toFixed(1)}`);
console.log(`\n[决策] 每年指令中位 ${med(decisionsPerYear).toFixed(1)}；出价中标率中位 ${(med(winRate) * 100).toFixed(0)}%`);
console.log(`[空档] 最长连续无事件月份 中位 ${med(quietMax)}，P90 ${q(quietMax, 0.9)}`);
console.log(`[消息] 每月新消息 中位 ${med(newsPerMonth)}，P90 ${q(newsPerMonth, 0.9)}`);
console.log('[净资产倍数，中位(P10/P90)]');
for (const y of Object.keys(netByYear).map(Number).sort((a, b) => a - b)) {
  const xs = netByYear[y]; console.log(`  第${y}年末: ${med(xs).toFixed(2)} (${q(xs, 0.1).toFixed(2)}/${q(xs, 0.9).toFixed(2)})  n=${xs.length}`);
}
console.log(`[破产] ${bankrupt.reduce((a, b) => a + b, 0)}/${RUNS}`);
