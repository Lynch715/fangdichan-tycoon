import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = (name: string) => JSON.parse(readFileSync(`tests/acceptance/${name}`, 'utf8'));
const actual = read('d3-balance.json'), before = read('d2-validation-training.results.json');
const q = (xs: number[], quantile: number) => [...xs].sort((a, b) => a - b)[Math.floor(quantile * xs.length)];
const summary = actual.strategies.map((strategy: any, index: number) => {
  const old = before[index], runs = strategy.runs;
  assert.equal(runs.length, 200);
  assert.deepEqual(runs.map((r: any) => r.seed), Array.from({ length: 200 }, (_, i) => i + 1));
  const failed = runs.filter((r: any) => r.status === 'bankrupt');
  assert.deepEqual(failed.map((r: any) => r.seed), old.failedSeeds);
  assert.equal(strategy.bankruptcyRate, old.bankruptcyRate);
  assert.equal(q(runs.map((r: any) => r.equity / 10000), .5), old.equityMedian);
  for (const [key, quantile] of [['profitP10', .1], ['profitMedian', .5], ['profitP90', .9]] as const)
    assert.ok(Math.abs(q(runs.map((r: any) => r.profit / 10000), quantile) - old[key]) < 1e-10);
  assert.equal(Object.values(strategy.reasons).reduce((n: any, count: any) => n + count, 0), failed.length);
  assert.equal(strategy.reasons.unknown, 0);
  for (const r of failed) { assert.ok(r.trigger.cashBefore >= 0); assert.ok(r.trigger.cashAfter < 0); }
  for (const r of runs.filter((r: any) => r.drawdown)) {
    const d = r.drawdown;
    assert.equal(d.amount.value, d.amount.peak - d.amount.equity);
    assert.ok(d.amount.peakDay <= d.amount.day && d.amount.day <= r.day);
    if (d.rate) assert.equal(d.rate.value, (d.rate.peak - d.rate.equity) / d.rate.peak);
  }
  return { name: strategy.name, runs: runs.length, failed: failed.length, exactD2Distributions: true,
    reasons: strategy.reasons, downturnCoverage: runs.filter((r: any) => r.drawdown).length };
});
const short = read('d3-short.json');
for (const s of short.strategies) { assert.equal(s.runs.length, 1); assert.equal(s.runs[0].drawdown, null); assert.equal(s.runs[0].trigger, null); }
writeFileSync('tests/acceptance/d3-audit.json', JSON.stringify({ summary, noDownturnCase: 'passed', configSha256: actual.configSha256 }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
