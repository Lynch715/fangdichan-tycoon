// 模拟内核：只接收指令、按游戏日推进、月末结算。不碰 DOM，不读系统时间，不用 Math.random。
import { featureCommand, activeProject, inspect, mapUnlocked, priceRestricted, projectEvent } from './features.ts';
import { defaultConfig, district, type Config } from './config.ts';
import { borrowCapacity, breachCount, breaches, channelRate, computeMetrics, computeRating, isDelivered } from './finance.ts';
import { backgroundOccupied, footprint, freeSites, tileKey } from './map.ts';
import { nextRandom, randomInt, randomRange } from './rng.ts';
import type { Command, CommandResult, GameState, NewsItem, Parcel, Project } from './types.ts';
import {BUILDING_PRODUCTS,BUILDING_VARIANTS} from './types.ts';

export const monthIndex = (config: Config, day: number) => Math.floor(day / config.time.daysPerMonth);

export function calendar(config: Config, day: number) {
  const m = monthIndex(config, day);
  return { year: Math.floor(m / 12) + 1, month: (m % 12) + 1, day: (day % config.time.daysPerMonth) + 1 };
}

export function marketPrice(config: Config, state: GameState, districtId: string): number {
  return district(config, districtId).basePrice * state.market.priceIndex[districtId];
}

function newId(state: GameState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}${state.nextId}`;
}

function addNews(state: GameState, kind: NewsItem['kind'], text: string) {
  state.news.unshift({ day: state.day, kind, text });
  if (state.news.length > 60) state.news.length = 60;
}

export function newGame(seed: number, config: Config = defaultConfig): GameState {
  const state: GameState = {
    version: 2,
    financeFrozenUntil: 0,
    seed,
    rng: seed | 0,
    day: 0,
    status: 'playing',
    distressMonths: 0,
    cash: config.start.cash,
    debts: [],
    projects: [],
    auctions: [],
    market: {
      phaseIndex: config.cycle.startPhase,
      phaseEndMonth: 0,
      sentiment: config.cycle.phases[config.cycle.startPhase].sentiment,
      priceIndex: Object.fromEntries(config.districts.map((d) => [d.id, 1])),
    },
    regulation: {
      active: false,
      announced: false,
      tier: 0,
      debtBaseline: 0,
      breaches: { liabilityRatio: false, netGearing: false, cashToShortDebt: false },
    },
    rating: 1,
    attention: 10,
    news: [],
    pauses: [],
    nextId: 0,
    lastWarnMonth: -99,
    stats: { landWon: 0, projectsClosed: 0, peakEquity: config.start.cash },
  };
  const [lo, hi] = config.cycle.phases[state.market.phaseIndex].months;
  state.market.phaseEndMonth = randomInt(state, lo, hi);
  addNews(state, 'company', `${config.start.companyName}成立，注册资本 ${(config.start.cash / 10000).toFixed(1)} 亿`);
  spawnAuctions(state, config);
  return state;
}

// ───────────────────────── 指令 ─────────────────────────

export function applyCommand(state: GameState, cmd: Command, config: Config = defaultConfig): CommandResult {
  if (state.status === 'bankrupt') return { ok: false, error: '公司已破产清算' };
  if ('amount' in cmd && !Number.isFinite(cmd.amount)) return {ok:false,error:'金额必须是有限数字'};
  if (cmd.type === 'setPrice' && !Number.isFinite(cmd.priceFactor)) return {ok:false,error:'售价无效'};
  if (cmd.type === 'setPace' && !Object.hasOwn(config.construction.paces, cmd.pace)) return {ok:false,error:'施工节奏无效'};
  const extra = featureCommand(state,cmd,config);
  if (extra) return extra;
  switch (cmd.type) {
    case 'setAppearance': {
      if(!BUILDING_PRODUCTS.includes(cmd.product)||!BUILDING_VARIANTS.includes(cmd.variant))return {ok:false,error:'建筑外观无效'};
      const p=state.projects.find(p=>p.id===cmd.projectId);
      if(!p||!activeProject(p))return {ok:false,error:'项目不可调整外观'};
      p.appearance={product:cmd.product,variant:cmd.variant};
      return {ok:true};
    }
    case 'bid': {
      const a = state.auctions.find((x) => x.id === cmd.parcelId);
      if (!a) return { ok: false, error: '地块已不在拍卖中' };
      if (!(cmd.amount >= a.startPrice)) return { ok: false, error: '出价不能低于起拍价' };
      if (a.deposit === 0) {
        const deposit = a.startPrice * config.land.depositRate;
        if (state.cash < deposit) return { ok: false, error: '现金不足以缴纳保证金' };
        state.cash -= deposit;
        a.deposit = deposit;
      }
      a.playerBid = cmd.amount;
      return { ok: true };
    }
    case 'borrow': {
      if (!(cmd.amount > 0)) return { ok: false, error: '金额必须大于 0' };
      const cap = borrowCapacity(config, state, cmd.channel, cmd.projectId);
      if (cmd.amount > cap.max + 1e-6) return { ok: false, error: cap.reason ?? `最多还能借 ${(cap.max / 10000).toFixed(2)} 亿` };
      const ch = config.finance.channels[cmd.channel];
      state.debts.push({
        id: newId(state, 'D'),
        channel: cmd.channel,
        principal: cmd.amount,
        rate: channelRate(config, state, cmd.channel),
        startDay: state.day,
        maturityDay: state.day + ch.termMonths * config.time.daysPerMonth,
        projectId: cmd.channel === 'devLoan' ? cmd.projectId ?? null : null,
      });
      state.cash += cmd.amount;
      if(cmd.channel === 'hidden') {
        state.attention = Math.min(100,state.attention + config.risk.hiddenAttention);
        addNews(state,'warning','明股实债已到账：按实质计入有息负债，抽查可能处罚伪装融资');
      }
      return { ok: true };
    }
    case 'repay': {
      const d = state.debts.find((x) => x.id === cmd.debtId);
      if (!d) return { ok: false, error: '找不到这笔债务' };
      if (state.cash < d.principal) return { ok: false, error: '现金不足' };
      state.cash -= d.principal;
      state.debts = state.debts.filter((x) => x !== d);
      return { ok: true };
    }
    case 'setPace': {
      const p = state.projects.find((x) => x.id === cmd.projectId);
      if (!p || p.stage !== 'construction') return { ok: false, error: '只能调整在建项目' };
      p.pace = cmd.pace;
      return { ok: true };
    }
    case 'setPrice': {
      const p = state.projects.find((x) => x.id === cmd.projectId);
      if (!p || !activeProject(p)) return { ok: false, error: '项目不可调价' };
      if(priceRestricted(state,config) && p.filedPrice !== null && marketPrice(config,state,p.districtId) * cmd.priceFactor > p.filedPrice) return {ok:false,error:'售价超过备案上限'};
      p.priceFactor = Math.min(config.sales.maxPriceFactor, Math.max(config.sales.minPriceFactor, cmd.priceFactor));
      return { ok: true };
    }
  }
  return {ok:false,error:'未知指令'};
}

// ───────────────────────── 推进 ─────────────────────────

export function stepDay(state: GameState, config: Config = defaultConfig): void {
  if (state.status === 'bankrupt') return;
  state.day += 1;
  for (const a of [...state.auctions]) {
    if (state.day >= a.endDay) resolveAuction(state, config, a);
  }
  for(const p of state.projects) {
  if(p.filingDueDay !== null && state.day >= p.filingDueDay) {
    p.filedPrice = p.filingPrice; p.filingDueDay = null; p.filingPrice = null;
    addNews(state,'policy',`${p.name} 限价备案获批`);
  }
  }
  if (state.day % config.time.daysPerMonth === 0) monthEnd(state, config);
}

function occupiedTiles(state: GameState, config: Config, mapId: string): Set<string> {
  const occ = backgroundOccupied(mapId);
  for (const p of state.projects) if (activeProject(p) && district(config,p.districtId).mapId === mapId) p.tiles.forEach(([i, j]) => occ.add(tileKey(i, j)));
  for (const a of state.auctions) if (district(config,a.districtId).mapId === mapId) a.tiles.forEach(([i, j]) => occ.add(tileKey(i, j)));
  return occ;
}

function spawnAuctions(state: GameState, config: Config) {
  const [lo, hi] = config.land.parcelsPerQuarter;
  const n = randomInt(state, lo, hi);
  const phase = config.cycle.phases[state.market.phaseIndex];
  let made = 0;
  for (let k = 0; k < n; k++) {
    // 每张地图独立占地，远郊第 3 年开放。
    const withSites = config.districts.filter(d => mapUnlocked(state,config,d.mapId)).map((d) => ({ d, sites: freeSites(d.id, occupiedTiles(state, config, d.mapId), d.mapId) })).filter((x) => x.sites.length > 0);
    if (withSites.length === 0) break;
    const chosen = withSites[Math.floor(nextRandom(state) * withSites.length)];
    const pick = { d: chosen.d, t: chosen.sites[Math.floor(nextRandom(state) * chosen.sites.length)] };
    const siteArea = Math.round(randomRange(state, config.land.siteAreaRange[0], config.land.siteAreaRange[1]) / 1000) * 1000;
    const buildArea = siteArea * pick.d.far;
    const floor = marketPrice(config, state, pick.d.id) * pick.d.landShare;
    const startPrice = Math.round(buildArea * floor * config.land.startPriceFactor);
    const premium = randomRange(state, phase.aiPremium[0], phase.aiPremium[1]);
    const id = newId(state, 'L');
    const parcel: Parcel = {
      id,
      name: `${pick.d.name} ${id}`,
      districtId: pick.d.id,
      tiles: footprint(pick.t),
      siteArea,
      far: pick.d.far,
      startPrice,
      endDay: state.day + config.land.auctionDays,
      aiMax: Math.round(startPrice * (1 + premium)),
      playerBid: null,
      deposit: 0,
    };
    state.auctions.push(parcel);
    made += 1;
  }
  if (made > 0) {
    addNews(state, 'land', `本季度土地拍卖挂牌 ${made} 宗，${config.land.auctionDays} 天后开拍`);
    state.pauses.push('auction');
  }
}

function resolveAuction(state: GameState, config: Config, a: Parcel) {
  state.auctions = state.auctions.filter((x) => x !== a);
  if (a.playerBid === null) return;
  const step = a.startPrice * 0.02;
  const price = Math.max(a.startPrice, Math.min(a.playerBid, a.aiMax + step));
  if (a.playerBid < a.aiMax) {
    state.cash += a.deposit;
    addNews(state, 'land', `竞拍失利：${a.name} 被对手以约 ${(a.aiMax / 10000).toFixed(2)} 亿拿下`);
    return;
  }
  const d = district(config, a.districtId);
  const buildArea = a.siteArea * a.far;
  const firstPayment = price * config.land.firstPaymentRate;
  state.cash -= firstPayment - a.deposit;
  const p: Project = {
    id: newId(state, 'P'),
    name: a.name,
    districtId: a.districtId,
    tiles: a.tiles,
    buildArea,
    saleableArea: buildArea * config.sales.saleableRatio,
    landCost: price,
    landPaid: firstPayment,
    landDueDay: state.day + config.land.balanceDueMonths * config.time.daysPerMonth,
    buildCost: buildArea * config.buildCostPerSqm * d.buildCostFactor,
    buildSpent: 0,
    progress: 0,
    pace: 'normal',
    stage: 'construction',
    priceFactor: 1,
    soldArea: 0,
    salesIn: 0,
    escrowReleased: 0,
    completedDay: null,
    deliveredDay: null,
    closedDay: null,
    paperRatio: 0, partnerShare: 0, diverted: 0, stoppedUntil: 0,
    filedPrice: null, filingPrice: null, filingDueDay: null,
  };
  state.projects.push(p);
  state.stats.landWon += 1;
  const premium = price / a.startPrice - 1;
  addNews(state, 'land', `拿地成功：${a.name}，成交 ${(price / 10000).toFixed(2)} 亿，溢价率 ${(premium * 100).toFixed(0)}%`);
  if (premium >= config.land.landKingPremium) {
    state.attention = Math.min(100, state.attention + 8);
    addNews(state, 'policy', `${a.name} 成为片区“地王”，引发监管关注`);
  }
}

function updateMarket(state: GameState, config: Config, month: number) {
  const phases = config.cycle.phases;
  if (month >= state.market.phaseEndMonth) {
    state.market.phaseIndex = (state.market.phaseIndex + 1) % phases.length;
    const next = phases[state.market.phaseIndex];
    state.market.phaseEndMonth = month + randomInt(state, next.months[0], next.months[1]);
    addNews(state, 'market', next.news);
  }
  const phase = phases[state.market.phaseIndex];
  for (const d of config.districts) {
    const noise = randomRange(state, -0.003, 0.003);
    state.market.priceIndex[d.id] *= 1 + phase.priceDrift + noise;
  }
  const s = state.market.sentiment;
  state.market.sentiment = Math.max(0, Math.min(100, s + (phase.sentiment - s) * 0.15 + randomRange(state, -2, 2)));
}

export function salesRate(config: Config, state: GameState, priceFactor: number): number {
  const phase = config.cycle.phases[state.market.phaseIndex];
  const sentimentFactor = 0.5 + state.market.sentiment / 100;
  const priceEffect = Math.max(0, 1 - config.sales.priceElasticity * (priceFactor - 1));
  const rate = config.sales.baseMonthlyAbsorption * phase.absorption * sentimentFactor * priceEffect;
  return Math.min(config.sales.maxMonthlyAbsorption, rate);
}

function settleProject(state: GameState, config: Config, p: Project) {
  const c = config.construction;
  const dpm = config.time.daysPerMonth;
  const owned = 1 - p.partnerShare;
  const event = projectEvent(state,p,config);
  // 土地尾款
  if (p.landPaid < p.landCost && state.day >= p.landDueDay) {
    state.cash -= (p.landCost - p.landPaid) * owned;
    p.landPaid = p.landCost;
  }
  // 施工
  if (p.stage === 'construction' && state.day >= p.stoppedUntil) {
    const pace = c.paces[p.pace];
    const inc = Math.min(pace.speed / c.months, 1 - p.progress);
    const spend = p.buildCost * inc * pace.costFactor * event.cost;
    const paper = state.rating < 5 && state.day >= state.financeFrozenUntil ? spend * owned * p.paperRatio : 0;
    state.cash -= spend * owned - paper;
    if(paper > 0) state.debts.push({id:newId(state,'D'),channel:'paper',principal:paper,rate:config.finance.channels.paper.rate,startDay:state.day,maturityDay:state.day+config.finance.channels.paper.termMonths*dpm,projectId:p.id});
    p.buildSpent += spend;
    p.progress += inc;
    if (p.progress >= 1 - 1e-9) {
      p.progress = 1;
      p.stage = 'completed';
      p.completedDay = state.day;
      addNews(state, 'company', `${p.name} 竣工验收`);
    }
  } else if (p.stage === 'completed' && p.completedDay !== null && state.day - p.completedDay >= c.deliveryMonths * dpm) {
    p.stage = 'delivered';
    p.deliveredDay = state.day;
    addNews(state, 'company', `${p.name} 交付业主，收入结转`);
  }
  // 销售
  const canSell = (p.stage === 'construction' && p.progress >= c.presaleProgress) || p.stage === 'completed' || p.stage === 'delivered';
  if (canSell && (!priceRestricted(state,config) || p.filedPrice !== null)) {
    const remaining = p.saleableArea - p.soldArea;
    const requestedPrice = marketPrice(config, state, p.districtId) * p.priceFactor;
    const price = priceRestricted(state,config) ? Math.min(requestedPrice,p.filedPrice!) : requestedPrice;
    const clearance = p.stage === 'delivered' && p.deliveredDay !== null && state.day - p.deliveredDay >= c.clearanceMonthsAfterDelivery * dpm;
    const sold = clearance ? remaining : Math.min(remaining, remaining * salesRate(config, state, price / marketPrice(config,state,p.districtId)) * event.demand);
    const revenue = sold * price * (clearance ? 1 - c.clearanceDiscount : 1);
    p.soldArea += sold;
    p.salesIn += revenue;
    state.cash -= revenue * owned * (config.sales.marketingRate + config.sales.taxRate);
  }
  // 预售监管账户释放
  const ratio = isDelivered(p) ? 1 : state.regulation.active ? p.progress : Math.min(1, p.progress + config.regulation.escrowReleaseLoose);
  const target = p.salesIn * ratio;
  if (target > p.escrowReleased) {
    state.cash += (target - p.escrowReleased) * owned;
    p.escrowReleased = target;
  }
  // 清盘
  if (p.stage === 'delivered' && p.diverted === 0 && p.saleableArea - p.soldArea < p.saleableArea * 0.005) {
    p.stage = 'closed';
    p.closedDay = state.day;
    state.stats.projectsClosed += 1;
    addNews(state, 'company', `${p.name} 清盘，累计回款 ${(p.salesIn / 10000).toFixed(2)} 亿`);
  }
}

function monthEnd(state: GameState, config: Config) {
  const month = monthIndex(config, state.day);
  const dpm = config.time.daysPerMonth;
  updateMarket(state, config, month);

  for (const p of state.projects) if (activeProject(p)) settleProject(state, config, p);

  inspect(state,config);

  // 利息与到期还本
  for (const d of state.debts) state.cash -= (d.principal * d.rate) / 12;
  const due = state.debts.filter((d) => d.maturityDay <= state.day);
  for (const d of due) state.cash -= d.principal;
  state.debts = state.debts.filter((d) => d.maturityDay > state.day);

  // 监管：提前放风、生效
  const startMonth = (config.regulation.startYear - 1) * 12;
  if (!state.regulation.announced && month >= startMonth - config.regulation.announceMonthsBefore) {
    state.regulation.announced = true;
    addNews(state, 'policy', '有消息称监管拟对房企设“三道红线”，按踩线数限制有息负债增速');
    state.pauses.push('regulation');
  }
  if (!state.regulation.active && month >= startMonth) {
    state.regulation.active = true;
    state.regulation.debtBaseline = computeMetrics(state).interestDebt;
    addNews(state, 'policy', '“三道红线”正式实施，预售资金改为按工程进度释放');
    state.pauses.push('regulation');
  }
  if (month % 12 === 0) state.regulation.debtBaseline = computeMetrics(state).interestDebt;

  // 季度：评级、档位、关注度、新一批土地
  if (month % 3 === 0) {
    const m = computeMetrics(state);
    const b = breaches(config, m);
    state.regulation.breaches = b;
    if (state.regulation.active) state.regulation.tier = breachCount(b);
    state.attention = Math.max(0, Math.min(100, state.attention - 2 + (state.regulation.tier >= 3 ? 10 : 0)));
    spawnAuctions(state, config);
  }

  // 违约与破产
  if (state.cash < 0) {
    state.status = 'distress';
    state.distressMonths += 1;
    addNews(state, 'warning', `资金链断裂：账上缺口 ${(-state.cash / 10000).toFixed(2)} 亿，自救窗口还剩 ${config.finance.distressMonthsToBankrupt - state.distressMonths} 个月`);
    if (state.distressMonths >= config.finance.distressMonthsToBankrupt) {
      state.status = 'bankrupt';
      addNews(state, 'warning', '自救失败，公司进入破产清算');
      state.pauses.push('gameOver');
    }
  } else if (state.status === 'distress') {
    state.status = 'playing';
    state.distressMonths = 0;
    addNews(state, 'company', '资金缺口已补上，公司恢复正常经营');
  }

  const metrics = computeMetrics(state);
  state.rating = computeRating(config, state, metrics);
  state.stats.peakEquity = Math.max(state.stats.peakEquity, metrics.equity);

  // 预警：未来 90 天的刚性支出超过现金
  const horizon = state.day + 3 * dpm;
  const upcoming =
    state.debts.filter((d) => d.maturityDay <= horizon).reduce((s, d) => s + d.principal, 0) +
    state.projects.filter((p) => activeProject(p) && p.landPaid < p.landCost && p.landDueDay <= horizon).reduce((s, p) => s + (p.landCost - p.landPaid) * (1-p.partnerShare), 0);
  if (state.status === 'playing' && upcoming > state.cash && month - state.lastWarnMonth >= 3) {
    state.lastWarnMonth = month;
    addNews(state, 'warning', `未来 3 个月到期 ${(upcoming / 10000).toFixed(2)} 亿，超过账上现金`);
    state.pauses.push('cashWarning');
  }

  if (month === config.time.careerYears * 12) {
    addNews(state, 'company', `生涯结算：第 ${config.time.careerYears} 年净资产 ${(metrics.equity / 10000).toFixed(2)} 亿。可以继续经营。`);
  }
}

/** 从种子和指令日志重建状态（存档读取、bug 复现都用它）。 */
export function replay(seed: number, log: { day: number; command: Command }[], untilDay: number, config: Config = defaultConfig): GameState {
  const state = newGame(seed, config);
  let k = 0;
  while (state.day < untilDay) {
    if(state.status === 'bankrupt') throw new Error('存档日期超过破产日期');
    while (k < log.length && log[k].day === state.day) {const result=applyCommand(state, log[k++].command, config);if(!result.ok)throw new Error(`存档指令无效：${result.error}`);}
    stepDay(state, config);
  }
  while (k < log.length && log[k].day === state.day) {const result=applyCommand(state, log[k++].command, config);if(!result.ok)throw new Error(`存档指令无效：${result.error}`);}
  state.pauses = [];
  return state;
}
