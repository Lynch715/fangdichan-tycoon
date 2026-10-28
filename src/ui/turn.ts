// 回合简报：回合开始时展示 ①回合/月份/季节/现金/净资产 ②各项目上回合收益 ③金融市场行情 ④待处理事项 ⑤本回合生效的季节/政策事件。
// 纯只读：只读取 GameState、月报流水与新闻，不推进模拟、不改随机数。
import { activeProject, calendar, channelRate, computeMetrics, mapUnlocked, payroll, seasonOf, type ChannelId, type Config, type GameState, type LedgerEntry, type PauseReason } from '../sim/index.ts';
import type { TurnResult } from '../game.ts';
import { esc, pct, yi } from './format.ts';

export const ALERT_TEXT: Record<PauseReason, string> = {
  startProject: '拿地成功，项目待选择产品线与总包开工',
  settlement: '有项目清盘，可在“经营报表”查看结算',
  risk: '发生项目风险事件或监管处罚，详见下方消息',
  auction: '新一批土地挂牌，可在“拍地”出价',
  cashWarning: '未来 3 个月到期款超过现金：考虑融资或放缓工程',
  regulation: '监管政策发生变化',
  gameOver: '公司已破产清算',
  challenge: '挑战结果已记录，可在财务页查看',
};

export const turnOf = (config: Config, s: GameState) => Math.floor(s.day / config.time.daysPerMonth) + 1;

/** 当前季节与本回合生效的事件；无事件记录的旧局按月份推出季节。 */
export function seasonNow(config: Config, s: GameState) {
  const month = Math.floor(s.day / config.time.daysPerMonth);
  const ev = s.market.season;
  if (ev && ev.month === month) return ev;
  const info = seasonOf(config, month);
  return { month, seasonId: info.id, seasonName: info.name, eventId: null, name: null, kind: 'season' as const, text: null, sales: 1, build: 1, cost: 1, rate: 0 };
}

/** 不足 0.1 亿时按万元显示，避免小额工资/利息显示成 0.00 亿。 */
export const money = (wan: number) => (Math.abs(wan) < 1000 ? `${Math.round(wan)} 万` : yi(wan));
const signedYi = (x: number) => `${x >= 0 ? '+' : '−'}${money(Math.abs(x))}`;
const cls = (x: number) => (x > 1e-6 ? 'ok-text' : x < -1e-6 ? 'danger-text' : 'muted');

/** 事件效果的简短标签：去化×、工期、成本、利率。 */
export function effectChips(ev: { sales: number; build: number; cost: number; rate: number }): string {
  const chips: string[] = [];
  if (Math.abs(ev.sales - 1) > 1e-6) chips.push(`<span class="chip ${ev.sales > 1 ? 'up' : 'down'}">去化 ${ev.sales > 1 ? '+' : '−'}${pct(Math.abs(ev.sales - 1))}</span>`);
  if (Math.abs(ev.build - 1) > 1e-6) chips.push(`<span class="chip ${ev.build > 1 ? 'up' : 'down'}">施工速度 ${ev.build > 1 ? '+' : '−'}${pct(Math.abs(ev.build - 1))}</span>`);
  if (Math.abs(ev.cost - 1) > 1e-6) chips.push(`<span class="chip ${ev.cost < 1 ? 'up' : 'down'}">工程成本 ${ev.cost > 1 ? '+' : '−'}${pct(Math.abs(ev.cost - 1))}</span>`);
  if (Math.abs(ev.rate) > 1e-9) chips.push(`<span class="chip ${ev.rate < 0 ? 'up' : 'down'}">新增融资利率 ${ev.rate > 0 ? '+' : '−'}${pct(Math.abs(ev.rate), 1)}</span>`);
  return chips.join('');
}

interface ProjectTurnRow { id: string; name: string; sales: number; cash: number; stage: string }
/** 上回合（最近一个已结算月）的项目流水汇总。 */
export function lastTurnIncome(s: GameState) {
  const month = s.reports.months.at(-1);
  if (!month) return null;
  const entries: LedgerEntry[] = s.reports.journal.slice(month.fromEntry, month.toEntry);
  const rows = new Map<string, ProjectTurnRow>();
  let interest = 0, salary = 0, other = 0;
  for (const e of entries) {
    if (e.projectId) {
      const p = s.projects.find(x => x.id === e.projectId);
      const row = rows.get(e.projectId) ?? { id: e.projectId, name: p?.name ?? e.projectId, sales: 0, cash: 0, stage: p?.stage ?? '' };
      if (e.kind === 'saleBooked') row.sales += e.amount;
      row.cash += e.cash;
      rows.set(e.projectId, row);
    } else if (e.kind === 'interest' || e.kind === 'extensionFee') interest += e.cash;
    else if (e.kind === 'salary') salary += e.cash;
    else other += e.cash;
  }
  return {
    period: month.period, rows: [...rows.values()].filter(r => Math.abs(r.cash) > 1e-6 || r.sales > 1e-6).sort((a, b) => b.cash - a.cash),
    interest, salary, other,
    equityChange: month.closing.equity - month.opening.equity, cashChange: month.closing.cash - month.opening.cash,
  };
}

const CHANNELS: ChannelId[] = ['devLoan', 'trust', 'hidden', 'bond'];

export function marketMarkup(config: Config, s: GameState): string {
  const phase = config.cycle.phases[s.market.phaseIndex];
  const districts = config.districts.filter(d => mapUnlocked(s, config, d.mapId)).map(d => {
    const price = d.basePrice * s.market.priceIndex[d.id];
    const hist = s.market.policies?.[d.id]?.prices ?? [];
    const change = hist.length >= 2 ? hist.at(-1)! / hist.at(-2)! - 1 : null;
    return `<tr><th>${esc(d.name)}</th><td>${(price * 10000).toFixed(0)} 元/㎡</td><td class="${change === null ? 'muted' : cls(change)}">${change === null ? '—' : `${change >= 0 ? '+' : '−'}${pct(Math.abs(change), 1)}`}</td></tr>`;
  }).join('');
  const rates = CHANNELS.map(ch => `<tr><th>${config.finance.channels[ch].name}</th><td>${pct(channelRate(config, s, ch), 2)}</td><td class="muted small">${ch === 'bond' ? (s.rating <= 1 ? '可发行' : '需评级 AA 以上') : ''}</td></tr>`).join('');
  const tier = s.regulation.active ? config.regulation.tiers[s.regulation.tier] : '未实施';
  return `<div class="turn-grid">
    <div class="turn-tile"><span class="small muted">周期</span><b>${esc(phase.name)}</b></div>
    <div class="turn-tile"><span class="small muted">市场情绪</span><b class="${s.market.sentiment >= 55 ? 'ok-text' : s.market.sentiment < 40 ? 'danger-text' : 'warn-text'}">${s.market.sentiment.toFixed(0)}</b></div>
    <div class="turn-tile"><span class="small muted">信用评级</span><b>${config.finance.ratings[s.rating]}</b></div>
    <div class="turn-tile"><span class="small muted">三道红线</span><b>${esc(tier)}</b></div>
  </div>
  <table class="turn-table"><thead><tr><th>片区</th><td>均价</td><td>月涨跌</td></tr></thead><tbody>${districts}</tbody></table>
  <table class="turn-table"><thead><tr><th>融资渠道</th><td>本回合新增利率</td><td></td></tr></thead><tbody>${rates}</tbody></table>
  ${s.day < s.financeFrozenUntil ? '<p class="small danger-text">抽查处罚期内，新增融资暂停。</p>' : ''}
  ${(s.industry?.creditUntil ?? 0) > s.day ? '<p class="small warn-text">同行暴雷，全行业融资收紧中。</p>' : ''}`;
}

export function turnBriefingMarkup(config: Config, s: GameState, last: TurnResult | null): string {
  const c = calendar(config, s.day), m = computeMetrics(s), turn = turnOf(config, s), ev = seasonNow(config, s);
  const income = lastTurnIncome(s);
  const eq = income?.equityChange ?? 0;
  const head = `<div class="row between"><h2 id="turn-title">第 ${turn} 回合</h2><button class="ghost" data-turn-close>关闭</button></div>
  <div class="turn-grid">
    <div class="turn-tile"><span class="small muted">时间</span><b>第 ${c.year} 年 ${c.month} 月</b></div>
    <div class="turn-tile season-${ev.seasonId}"><span class="small muted">季节</span><b>${esc(ev.seasonName)}季</b></div>
    <div class="turn-tile"><span class="small muted">现金</span><b class="${s.cash < 0 ? 'danger-text' : ''}">${yi(s.cash)}</b></div>
    <div class="turn-tile"><span class="small muted">净资产</span><b>${yi(m.equity)}</b>${income ? `<span class="small ${cls(eq)}">${signedYi(eq)}</span>` : ''}</div>
  </div>`;
  const incomeHtml = !income ? '<p class="small muted">第一回合，还没有已结算的收益。</p>' : `
  <table class="turn-table"><thead><tr><th>项目</th><td>签约销售</td><td>现金净流入</td></tr></thead><tbody>
    ${income.rows.length ? income.rows.map(r => `<tr><th>${esc(r.name)}</th><td>${r.sales > 0 ? money(r.sales) : '—'}</td><td class="${cls(r.cash)}">${signedYi(r.cash)}</td></tr>`).join('') : '<tr><th class="muted">本回合无项目流水</th><td></td><td></td></tr>'}
    ${Math.abs(income.interest) > 1e-6 ? `<tr><th class="muted">公司融资利息/展期费</th><td></td><td class="danger-text">${signedYi(income.interest)}</td></tr>` : ''}
    ${Math.abs(income.salary) > 1e-6 ? `<tr><th class="muted">员工薪酬</th><td></td><td class="danger-text">${signedYi(income.salary)}</td></tr>` : ''}
    ${Math.abs(income.other) > 1e-6 ? `<tr><th class="muted">融资/保证金/其他</th><td></td><td class="${cls(income.other)}">${signedYi(income.other)}</td></tr>` : ''}
    <tr class="total"><th>合计</th><td></td><td class="${cls(income.cashChange)}">${signedYi(income.cashChange)}</td></tr>
  </tbody></table>
  <p class="small muted">签约销售先进监管账户，按工程进度释放为现金；净资产变化包含存货、负债与利润确认。</p>`;
  const evHtml = `<div class="season-card ${ev.eventId ? (ev.kind === 'policy' ? 'policy' : 'event') : ''}">
    <div class="row between"><b>${ev.eventId ? `${ev.kind === 'policy' ? '政策' : '季节'}事件 · ${esc(ev.name ?? '')}` : `${esc(ev.seasonName)}季 · 无特别事件`}</b><span class="small muted">本回合生效</span></div>
    ${ev.text ? `<span class="small">${esc(ev.text)}</span>` : ''}
    <div class="chips">${effectChips(ev) || '<span class="small muted">季节系数中性</span>'}</div></div>`;
  const recent = s.news.filter(n => last ? n.day > last.fromDay : n.day >= s.day - config.time.daysPerMonth).filter(n => !n.text.startsWith('【') && (n.kind !== 'company' || /事故|停工|维权|接管|清盘|竣工|交付|人才/.test(n.text))).slice(0, 8);
  const newsHtml = recent.length ? `<ul class="turn-news">${recent.map(n => `<li class="${n.kind === 'warning' ? 'danger-text' : n.kind === 'policy' ? 'warn-text' : ''}">${esc(n.text)}</li>`).join('')}</ul>` : '<p class="small muted">上回合风平浪静。</p>';
  const todo: string[] = (last?.alerts ?? []).filter(a => a !== 'risk').map(a => ALERT_TEXT[a]);
  const waiting = s.projects.filter(p => p.stage === 'land').length;
  if (waiting && !todo.includes(ALERT_TEXT.startProject)) todo.push(`${waiting} 个项目待选择总包开工`);
  if (s.auctions.length) todo.push(`${s.auctions.length} 宗土地拍卖中${s.auctions.some(a => a.playerBid !== null) ? '（已有出价）' : ''}`);
  const staff = s.staff;
  if (staff) {
    const idle = staff.members.filter(x => !x.post).length;
    const unstaffed = s.projects.filter(p => activeProject(p) && p.stage !== 'land' && !staff.members.some(x => x.post && 'projectId' in x.post && x.post.projectId === p.id)).length;
    if (idle) todo.push(`${idle} 名员工待命未任职（仍在领薪）`);
    if (unstaffed && staff.members.length < 2) todo.push(`${unstaffed} 个项目还没有派驻项目经理/销售经理，可到“员工”招聘`);
  }
  return `${head}
  <section class="turn-sec"><h3>① 上回合各项目收益${income ? `（第 ${income.period} 回合）` : ''}</h3>${incomeHtml}</section>
  <section class="turn-sec"><h3>② 金融市场行情</h3>${marketMarkup(config, s)}</section>
  <section class="turn-sec"><h3>③ 本回合季节 / 政策事件</h3>${evHtml}<h4 class="small muted">上回合动态</h4>${newsHtml}</section>
  ${todo.length ? `<section class="turn-sec"><h3>④ 待处理</h3><ul class="turn-todo">${todo.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
  <p class="small muted">月薪合计 ${payroll(s)} 万元/回合。操作完成后点右上“结束回合”，推进一个月并结算。</p>
  <div class="row turn-actions"><button data-turn-close>开始本回合经营</button></div>`;
}

/** 财务页顶部的回合小卡：季节事件与快捷入口。 */
export function turnCardMarkup(config: Config, s: GameState): string {
  const ev = seasonNow(config, s), c = calendar(config, s.day);
  return `<section class="turn-card season-${ev.seasonId}">
    <div class="row between"><b>第 ${turnOf(config, s)} 回合 · ${c.month} 月 · ${esc(ev.seasonName)}季</b><button class="mini" data-act="briefing">回合简报</button></div>
    <span class="small">${ev.eventId ? `${ev.kind === 'policy' ? '政策' : '季节'}事件：${esc(ev.name ?? '')}` : '本回合无特别事件'}</span>
    <div class="chips">${effectChips(ev)}</div>
    <button data-act="staff" class="ghost">员工与人才市场 · ${s.staff?.members.length ?? 0} 人</button>
  </section>`;
}
