// 标准生涯真实模拟；统计只观察已有月报，不改变策略、状态或随机数。
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { aggressive, computeMetrics, conservative, defaultConfig, payroll, runGame, staffed, type Strategy } from '../src/sim/index.ts';
import { bankruptcyTrigger, downturnDrawdown, positiveInteger, quantile, reasonLabels, type BankruptcyReason } from '../src/analysis/balance.ts';

const RUNS = positiveInteger(process.env.RUNS ?? '200', 'RUNS');
const YEARS = positiveInteger(process.env.YEARS ?? String(defaultConfig.time.careerYears), 'YEARS');
const START_SEED = positiveInteger(process.env.START_SEED ?? '1', 'START_SEED');
const SEASONS = process.env.SEASONS === '1'; // 1：按真实开局开启季节/政策事件
const STAFF = process.env.STAFF === '1'; // 1：机器人按规则招聘并派驻员工
if (START_SEED + RUNS - 1 > 0xffffffff) throw new Error('种子范围必须在1–4294967295内，避免32位随机种子重复');
const downturnName = defaultConfig.cycle.phases.find(p => p.id === 'downturn')?.name;
if (!downturnName) throw new Error('配置缺少downturn周期');
const fmt = (n: number | null) => n === null ? '不适用' : n.toFixed(2);
const distribution = (xs: number[]) => `P10 ${fmt(quantile(xs, .1))}  中位 ${fmt(quantile(xs, .5))}  P90 ${fmt(quantile(xs, .9))}`;

function report(name: string, strategy: Strategy) {
  const runs = [];
  for (let seed = START_SEED; seed < START_SEED + RUNS; seed++) {
    const { state } = runGame(seed, strategy, YEARS, defaultConfig, SEASONS);
    const equity = computeMetrics(state).equity;
    runs.push({ seed, day: state.day, status: state.status, cash: state.cash, equity,
      profit: equity - defaultConfig.start.cash, landWon: state.stats.landWon,
      staff: state.staff?.members.length ?? 0, payroll: payroll(state),
      salaryPaid: state.reports.journal.reduce((n, e) => n + (e.kind === 'salary' ? e.amount : 0), 0),
      trigger: bankruptcyTrigger(state), drawdown: downturnDrawdown(state.reports.months, downturnName!),
    });
  }
  const failed = runs.filter(r => r.status === 'bankrupt');
  const reasons = Object.fromEntries(Object.keys(reasonLabels).map(k => [k, 0])) as Record<BankruptcyReason, number>;
  for (const r of failed) reasons[r.trigger!.reason]++;
  const drawdowns = runs.flatMap(r => r.drawdown ? [r.drawdown] : []);
  const rates = drawdowns.flatMap(d => d.rate ? [d.rate.value * 100] : []);
  console.log(`\n${name}（${RUNS} 局 × ${YEARS} 年，种子${START_SEED}–${START_SEED + RUNS - 1}${SEASONS ? '，含季节事件' : ''}${STAFF ? '，机器人雇员工' : ''}）`);
  console.log(`  破产率        ${(failed.length / RUNS * 100).toFixed(1)}%`);
  if (failed.length) console.log(`  破产年份中位数 第 ${fmt(quantile(failed.map(r => r.day / (12 * defaultConfig.time.daysPerMonth)), .5))} 年`);
  console.log(`  净资产（亿）  ${distribution(runs.map(r => r.equity / 10000))}`);
  console.log(`  收益（亿）    ${distribution(runs.map(r => r.profit / 10000))}（含破产局，扣初始资本）`);
  console.log(`  平均拿地数    ${fmt(runs.reduce((n, r) => n + r.landWon, 0) / RUNS)}`);
  if (STAFF) console.log(`  员工（期末）  人数中位 ${fmt(quantile(runs.map(r => r.staff), .5))}  月薪合计中位 ${fmt(quantile(runs.map(r => r.payroll), .5))} 万  累计薪酬中位 ${fmt(quantile(runs.map(r => r.salaryPaid / 10000), .5))} 亿`);
  console.log(`  破产触发支出分布（分母为${failed.length}个破产局，最终连续危机首月最后一次现金转负）`);
  if (!failed.length) console.log('    无破产，分布不适用');
  for (const [key, label] of Object.entries(reasonLabels)) {
    const count = reasons[key as BankruptcyReason];
    if (count) console.log(`    ${label}：${count}局（${(count / failed.length * 100).toFixed(1)}%）`);
  }
  console.log(`  下行期最大回撤（月末净资产对全生涯历史峰值，每局先求最大；覆盖${drawdowns.length}/${RUNS}局，未遇下行不记0）`);
  console.log(`    金额（亿） ${distribution(drawdowns.map(d => d.amount.value / 10000))}  最坏 ${fmt(drawdowns.length ? Math.max(...drawdowns.map(d => d.amount.value)) / 10000 : null)}`);
  console.log(`    比例（%）  ${distribution(rates)}  最坏 ${fmt(rates.length ? Math.max(...rates) : null)}（有效正峰值${rates.length}局）`);
  return { name, bankruptcyRate: failed.length / RUNS, reasons, runs };
}
const safe = report('保守策略', STAFF ? staffed(conservative, 'conservative') : conservative);
const risky = report('激进策略', STAFF ? staffed(aggressive, 'aggressive') : aggressive);
const safeMedian = quantile(safe.runs.map(r => r.profit), .5)!;
const ratio = safeMedian > 0 ? quantile(risky.runs.map(r => r.profit), .5)! / safeMedian : null;
const lowerP10 = quantile(risky.runs.map(r => r.profit), .1)! < quantile(safe.runs.map(r => r.profit), .1)!;
const target = { bankruptcy: risky.bankruptcyRate >= .25 && risky.bankruptcyRate <= .35,
  medianRatio: ratio, median: ratio !== null && ratio >= 1.5 && ratio <= 2, lowerP10 };
console.log(`\nD2参考目标（当前样本）：破产率${target.bankruptcy ? '达标' : '未达标'}；收益中位倍数${fmt(ratio)}（${target.median ? '达标' : '未达标'}）；P10低于保守${lowerP10 ? '达标' : '未达标'}。`);
console.log('归因是现金转负的流水分类，不是完整经营因果；回撤不覆盖月内波动，负净资产可超过100%。');
if (process.env.OUTPUT) writeFileSync(process.env.OUTPUT, JSON.stringify({ runs: RUNS, years: YEARS, startSeed: START_SEED,
  configSha256: createHash('sha256').update(JSON.stringify(defaultConfig)).digest('hex'), target, strategies: [safe, risky] }, null, 2) + '\n');
