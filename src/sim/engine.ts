import{initCapital,capitalCommand,founderBookValue}from'./capital.ts';
import {validateSessionOptions,normalizeCompanyName,COMPANY_NAME_MIN,COMPANY_NAME_MAX,type SessionOptions} from './sessionConfig.ts';
import {buildSessionConfig,defaultSession,initSessionOpening,sandboxFunding,protectSandbox,updateSession} from './sessions.ts';
import{initHousingPolicies,reviewHousingPolicies,housingDemandFactor}from'./housingPolicy.ts';
import{initCompliance,recordLandFunding,landBanUntil,updateHoarding,presaleBlocked,completeRectification}from'./compliance.ts';
import{takeDepositFunding}from'./fundingTrace.ts';
import{generateSiteAttributes,initDistrictMarkets,updateDistrictPopulation,collectSalesStart,closeDistrictMarkets,sitePriceFactor,siteCostFactor,siteDurationFactor}from'./regions.ts';
import{accelerateDebts}from'./bonds.ts';
import{generateAuctionTerms,saleableArea,bidError}from'./auctions.ts';
import{backfillComparisons}from'./rankings.ts';
import{acquireProject}from'./acquisition.ts';
// 模拟内核：只接收指令、按游戏日推进、月末结算。不碰 DOM，不读系统时间，不用 Math.random。
import { featureCommand, activeProject, inspect, mapUnlocked, priceRestricted, projectEvent,salesEligible } from './features.ts';
import { defaultConfig, district, type Config } from './config.ts';
import { borrowCapacity, breachCount, breaches, channelRate, computeMetrics, computeRating, isDelivered,projectInventory,recognizedProjectCost,industryTight } from './finance.ts';
import { backgroundOccupied, footprint, freeSites, tileKey } from './map.ts';
import{createRivals,actRivals,resolveCompetitiveAuction,updateIndustryDefaults}from'./rivals.ts';
import { nextRandom, randomInt, randomRange } from './rng.ts';
import type { Command, CommandResult, GameState, NewsItem, Parcel, Project,ReportState,SiteAttributes } from './types.ts';
import {BUILDING_PRODUCTS,BUILDING_VARIANTS,CONTRACTORS,type BuildingProduct} from './types.ts';
import {productTerms,productDemandFactor} from './products.ts';
import{createReports,upgradeReports,ledger,allocateFinance,linkParcel,recordDecision,closeReportMonth}from'./reporting.ts';

export const monthIndex = (config: Config, day: number) => Math.floor(day / config.time.daysPerMonth);

export function calendar(config: Config, day: number) {
  const m = monthIndex(config, day);
  return { year: Math.floor(m / 12) + 1, month: (m % 12) + 1, day: (day % config.time.daysPerMonth) + 1 };
}

export function marketPrice(config: Config, state: GameState, districtId: string,attributes?:SiteAttributes,product?:BuildingProduct): number {
  return district(config, districtId).basePrice * state.market.priceIndex[districtId]*sitePriceFactor(attributes)*productTerms(config,product).priceFactor;
}

function newId(state: GameState, prefix: string): string {
  state.nextId += 1;
  return `${state.opponentId?state.opponentId+'-':''}${prefix}${state.nextId}`;
}

function addNews(state: GameState, kind: NewsItem['kind'], text: string) {
  state.news.unshift({ day: state.day, kind, text });
  if (state.news.length > 60) state.news.length = 60;
}

export function newGame(seed: number, config: Config = defaultConfig,opponentId?:string,opening?:SessionOptions): GameState {
  const state: GameState = {
    version: 16,
    industry:{creditUntil:0,events:[]},
    ...(opponentId?{opponentId}:{}),rivals:[],rivalsSinceDay:0,
    reports:createReports(config.start.cash),
    brand:config.quality.initialBrand,
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
    stats: { landWon: 0, projectsClosed: 0, peakEquity: config.start.cash,projectsTakenOver:0 },
  };
  const [lo, hi] = config.cycle.phases[state.market.phaseIndex].months;
  state.market.phaseEndMonth = randomInt(state, lo, hi);
  addNews(state, 'company', `${config.start.companyName}成立，注册资本 ${(config.start.cash / 10000).toFixed(1)} 亿`);
  initCapital(state,config);
  if(opening&&!opponentId)initSessionOpening(state,config,opening);
  initDistrictMarkets(state,config);initHousingPolicies(state,config);
  if(!opponentId)initCompliance(state,config);
  // 新手保底地块只给从开局设置进入的生涯模式；裸 newGame（测试、批量平衡）不受影响。
  if(!opponentId){spawnAuctions(state, config,opening?.mode==='career');state.rivals=createRivals(state,config);}
  return state;
}

// ───────────────────────── 指令 ─────────────────────────

type UpgradeRules={type:'upgradeRules';reports?:ReportState;reportError?:string};
function performCommand(state: GameState, cmd: Command|UpgradeRules, config: Config = defaultConfig): CommandResult {
  // 仅存档迁移使用的内部指令，不是玩家指令，不写入玩家日志。
  if(cmd.type==='upgradeRules'){
    const wasV15=(state.version as number)===15;
    state.version=16;
    if(state.rules&&state.session)state.rules=buildSessionConfig(config,state.session.options);
    if(wasV15){for(const r of state.rivals)r.company.version=16;return {ok:true};}
    if(!state.opponentId)state.session??=defaultSession(state,'legacy');
    initCapital(state,config);initDistrictMarkets(state,config);initHousingPolicies(state,config);initCompliance(state,config);
    state.industry??={creditUntil:0,events:[]};
    for(const r of state.rivals??[]){r.company.version=16;initCapital(r.company,config);initCompliance(r.company,config);r.company.industry=state.industry;r.defaultActive??=r.company.status==='distress'||r.company.status==='bankrupt';}
    if(!state.rivals){state.rivals=createRivals(state,config);state.rivalsSinceDay=state.day;}state.brand??=config.quality.initialBrand;state.stats.projectsTakenOver??=0;
    for(const p of state.projects){p.marketingRate??=config.sales.marketingRate;p.fundingStoppedMonths??=0;p.fundingGap??=0;p.takeover??=null;p.contractor??=p.stage==='land'?null:'standard';p.quality??=p.contractor?config.construction.contractors[p.contractor].quality:null;}
    if(cmd.reports)state.reports=cmd.reports;else upgradeReports(state,config);
    if(cmd.reportError)state.reports.replayError=cmd.reportError;
    backfillComparisons(state,config);
    return {ok:true};
  }
  if (state.status === 'bankrupt') return { ok: false, error: '公司已破产清算' };
  if(cmd.type==='startGame'){
    const rawName=(cmd.options as {companyName?:unknown}|undefined)?.companyName;
    if(rawName!==undefined&&normalizeCompanyName(rawName)===null)return {ok:false,error:`公司名需为 ${COMPANY_NAME_MIN}–${COMPANY_NAME_MAX} 个字，不能含 < > 等特殊符号`};
    const options=validateSessionOptions(cmd.options);
    if(!options)return {ok:false,error:'开局选项无效'};
    if(options.companyName&&config.rivals.companies.some(r=>r.name===options.companyName))return {ok:false,error:'公司名与同行开发商重名，请换一个'};
    if(state.opponentId||state.day!==0||state.session)return {ok:false,error:'只能在全新开局选择模式；经营后请使用重新开始'};
    // 全部构造成功后才替换，错误不破坏当前公司或消耗其随机数。
    const fresh=newGame(state.seed,buildSessionConfig(config,options),undefined,options);
    Object.assign(state,fresh);
    return {ok:true};
  }
  if(cmd.type==='sandboxGrant'){
    if(state.opponentId||state.session?.options.mode!=='sandbox')return {ok:false,error:'仅沙盒模式可注入沙盒资金'};
    sandboxFunding(state,config.sessions.sandbox.grant);
    addNews(state,'company',`沙盒注资 ${(config.sessions.sandbox.grant/10000).toFixed(1)} 亿元，列为资本投入，不计利润`);
    return {ok:true};
  }
  if ('amount' in cmd && !Number.isFinite(cmd.amount)) return {ok:false,error:'金额必须是有限数字'};
  if (cmd.type === 'setPrice' && !Number.isFinite(cmd.priceFactor)) return {ok:false,error:'售价无效'};
  if (cmd.type === 'setPace' && !Object.hasOwn(config.construction.paces, cmd.pace)) return {ok:false,error:'施工节奏无效'};
  if(cmd.type==='acquireProject')return acquireProject(state,cmd,config);
  const capitalResult=capitalCommand(state,cmd,config);if(capitalResult)return capitalResult;
  const extra = featureCommand(state,cmd,config);
  if (extra) return extra;
  switch (cmd.type) {
    case 'setMarketing': {
      const p=state.projects.find(p=>p.id===cmd.projectId);
      if(!p||!salesEligible(p,config))return {ok:false,error:'仅在售项目可调整营销投入'};
      if(!Number.isFinite(cmd.rate)||cmd.rate<0||cmd.rate>config.marketing.maxRate)return {ok:false,error:`营销比例须在0–${config.marketing.maxRate*100}%之间`};
      p.marketingRate=cmd.rate;return {ok:true};
    }
    case 'startProject': {
      const p=state.projects.find(p=>p.id===cmd.projectId);
      if(!p||p.stage!=='land')return {ok:false,error:'仅已拿地待开工项目可选择总包'};
      if(!CONTRACTORS.includes(cmd.contractor))return {ok:false,error:'总包档位无效'};
      if(cmd.product!==undefined&&!BUILDING_PRODUCTS.includes(cmd.product))return {ok:false,error:'产品线无效'};
      const terms=config.construction.contractors[cmd.contractor];
      if(cmd.product!==undefined){p.product=cmd.product;p.appearance={product:cmd.product,variant:p.appearance?.variant??'a'};}
      const product=productTerms(config,p.product);
      p.contractor=cmd.contractor;p.quality=terms.quality;p.buildCost*=terms.costFactor*product.costFactor;p.stage='construction';
      addNews(state,'company',`${p.name} 选择${terms.name}开工${p.product?`（${product.name}）`:''}，预计正常工期 ${Math.ceil(config.construction.months*terms.durationFactor*siteDurationFactor(p.attributes)*product.durationFactor)} 个月，初始质量 ${p.quality} 分`);
      return {ok:true};
    }
    case 'setAppearance': {
      if(!BUILDING_PRODUCTS.includes(cmd.product)||!BUILDING_VARIANTS.includes(cmd.variant))return {ok:false,error:'建筑外观无效'};
      const p=state.projects.find(p=>p.id===cmd.projectId);
      if(!p||!activeProject(p))return {ok:false,error:'项目不可调整外观'};
      if(p.product&&cmd.product!==p.product)return {ok:false,error:'产品线开工后已锁定，只能更换外观变体'};
      p.appearance={product:cmd.product,variant:cmd.variant};
      return {ok:true};
    }
    case 'bid': {
      const a = state.auctions.find((x) => x.id === cmd.parcelId);
      if (!a) return { ok: false, error: '地块已不在拍卖中' };
      if(landBanUntil(state,a.districtId)>state.day)return {ok:false,error:'该片区处于暂停拿地期'};
      const error=bidError(config,a,cmd.amount,cmd.amenityRate??0);if(error)return {ok:false,error};
      if (a.deposit === 0) {
        const deposit = a.startPrice * config.land.depositRate;
        if (state.cash < deposit) return { ok: false, error: '现金不足以缴纳保证金' };
        state.cash -= deposit;
        ledger(state,'deposit',-deposit,null,deposit,a.id);
        a.deposit = deposit;
      }
      a.playerBid = cmd.amount;
      if(a.auction?.kind==='amenity')a.playerAmenityRate=cmd.amenityRate??0;
      return { ok: true };
    }
    case 'borrow': {
      if(!Object.hasOwn(config.finance.channels,cmd.channel))return {ok:false,error:'未知融资渠道'};
      if(cmd.termMonths!==undefined&&(cmd.channel!=='bond'||!config.finance.bond.termsMonths.includes(cmd.termMonths)))return {ok:false,error:'公司债期限须为3、4或5年'};
      if (!(cmd.amount > 0)) return { ok: false, error: '金额必须大于 0' };
      const cap = borrowCapacity(config, state, cmd.channel, cmd.projectId);
      if (cap.max<=0||cmd.amount > cap.max + 1e-6) return { ok: false, error: cap.reason ?? `最多还能借 ${(cap.max / 10000).toFixed(2)} 亿` };
      const ch = config.finance.channels[cmd.channel];
      state.debts.push({
        id: newId(state, 'D'),
        channel: cmd.channel,
        principal: cmd.amount,
        rate: channelRate(config, state, cmd.channel),
        startDay: state.day,
        maturityDay: state.day + (cmd.channel==='bond'?cmd.termMonths??ch.termMonths:ch.termMonths) * config.time.daysPerMonth,
        projectId: cmd.channel === 'devLoan' ? cmd.projectId ?? null : null,
        covenant:{belowRating:config.finance.covenants.belowRating,fraction:config.finance.covenants.fraction,noticeMonths:config.finance.covenants.noticeMonths},
      });
      state.cash += cmd.amount;
      ledger(state,'loan',cmd.amount,cmd.channel==='devLoan'?cmd.projectId??null:null);
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
      ledger(state,'repay',-d.principal,d.projectId,d.principal,undefined,d.projectId?-d.principal:0,d.channel);
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
      if(presaleBlocked(p)&&p.filingDueDay!==null&&cmd.priceFactor>config.compliance.hoarding.rectifiedPriceFactor)return {ok:false,error:'整改审批期间不能再次提高到整改上限以上'};
      if(priceRestricted(state,config) && p.filedPrice !== null && marketPrice(config,state,p.districtId,p.attributes,p.product) * cmd.priceFactor > p.filedPrice) return {ok:false,error:'售价超过备案上限'};
      p.priceFactor = Math.min(config.sales.maxPriceFactor, Math.max(config.sales.minPriceFactor, cmd.priceFactor));
      return { ok: true };
    }
  }
  return {ok:false,error:'未知指令'};
}

export function applyCommand(state:GameState,cmd:Command|UpgradeRules,config:Config=defaultConfig):CommandResult{
 if(cmd.type!=='upgradeRules')config=state.rules??config;
 const result=performCommand(state,cmd,config);
 if(result.ok&&cmd.type!=='upgradeRules'){
  if(!state.opponentId)state.session??=defaultSession(state,'implicit');
  config=state.rules??config;
  recordDecision(state,cmd,config);updateSession(state,config);
 }
 return result;
}

// ───────────────────────── 推进 ─────────────────────────

export function stepDay(state: GameState, config: Config = defaultConfig): void {
  config=state.rules??config;
  if (state.status === 'bankrupt') return;
  if(!state.opponentId)state.session??=defaultSession(state,'implicit');
  state.day += 1;
  actRivals(state,config);
  for (const a of [...state.auctions]) {
    if (state.day >= a.endDay) resolveAuction(state, config, a);
  }
  approveFilings(state,config);
  for(const r of state.rivals)approveFilings(r.company,config);
  if (state.day % config.time.daysPerMonth === 0) monthEnd(state, config);
  updateSession(state,config);
}

function approveFilings(state:GameState,config:Config){
  for(const p of state.projects) {
  if(p.filingDueDay !== null && state.day >= p.filingDueDay) {
    completeRectification(p);
    p.filedPrice = p.filingPrice; p.filingDueDay = null; p.filingPrice = null;
    addNews(state,'policy',`${p.name} 限价备案获批`);
  }
  }
}

function occupiedTiles(state: GameState, config: Config, mapId: string): Set<string> {
  const occ = backgroundOccupied(mapId);
  for (const p of [...state.projects,...state.rivals.flatMap(r=>r.company.projects)]) if (activeProject(p) && district(config,p.districtId).mapId === mapId) p.tiles.forEach(([i, j]) => occ.add(tileKey(i, j)));
  for (const a of state.auctions) if (district(config,a.districtId).mapId === mapId) a.tiles.forEach(([i, j]) => occ.add(tileKey(i, j)));
  return occ;
}

function spawnAuctions(state: GameState, config: Config,starters=false) {
  const [lo, hi] = config.land.parcelsPerQuarter;
  const n = randomInt(state, lo, hi);
  const phase = config.cycle.phases[state.market.phaseIndex];
  // 规模成长：公司净资产越大，挂牌地块越大（保留若干宗常规尺寸，小公司始终有地可拍）。
  const sc=config.land.scale,equity=computeMetrics(state).equity;
  const scale=sc?Math.min(sc.max,Math.max(1,Math.pow(Math.max(equity,0)/config.start.cash,sc.exponent))):1;
  let made = 0;
  for (let k = 0; k < n; k++) {
    // 每张地图独立占地，远郊第 3 年开放。
    const withSites = config.districts.filter(d => mapUnlocked(state,config,d.mapId)).map((d) => ({ d, sites: freeSites(d.id, occupiedTiles(state, config, d.mapId), d.mapId) })).filter((x) => x.sites.length > 0);
    if (withSites.length === 0) break;
    const chosen = withSites[Math.floor(nextRandom(state) * withSites.length)];
    const pick = { d: chosen.d, t: chosen.sites[Math.floor(nextRandom(state) * chosen.sites.length)] };
    let siteArea = Math.round(randomRange(state, config.land.siteAreaRange[0], config.land.siteAreaRange[1]) / 1000) * 1000;
    const floor = marketPrice(config, state, pick.d.id) * pick.d.landShare;
    if(k>=(sc?.regularParcels??n))siteArea=Math.round(siteArea*scale/1000)*1000;
    const buildArea = siteArea * pick.d.far;
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
    const auction=generateAuctionTerms(state,config,startPrice);if(auction)parcel.auction=auction;
    const attributes=generateSiteAttributes(state,config,parcel.tiles,pick.d.mapId);if(attributes)parcel.attributes=attributes;
    state.auctions.push(parcel);
    made += 1;
  }
  if(starters)made+=spawnStarterParcels(state,config);
  if (made > 0) {
    addNews(state, 'land', `本季度土地拍卖挂牌 ${made} 宗，${config.land.auctionDays} 天后开拍`);
    state.pauses.push('auction');
  }
}

/**
 * 开局保底：额外挂出几宗“新手友好”的小地块，起拍价不超过开局现金的一定比例。
 * 不消耗随机数（片区按楼面地价从低到高、选第一个空位、公开竞价、无配建与特殊属性），
 * 原有地块与随机序列保持不变。
 */
function spawnStarterParcels(state:GameState,config:Config):number{
  const count=config.land.starterParcels??0;if(count<=0)return 0;
  const budget=config.start.cash*(config.land.starterMaxCashShare??1);
  const ranked=config.districts.filter(d=>mapUnlocked(state,config,d.mapId))
    .map(d=>({d,floor:marketPrice(config,state,d.id)*d.landShare}))
    .sort((a,b)=>a.floor*a.d.far-b.floor*b.d.far||a.d.id.localeCompare(b.d.id));
  let made=0;
  for(const {d,floor} of ranked){
    if(made>=count)break;
    const sites=freeSites(d.id,occupiedTiles(state,config,d.mapId),d.mapId);if(!sites.length)continue;
    const area=Math.min(config.land.siteAreaRange[1],Math.floor(budget/(d.far*floor*config.land.startPriceFactor)/1000)*1000);
    if(area<5000)continue;
    const startPrice=Math.round(area*d.far*floor*config.land.startPriceFactor),id=newId(state,'L');
    state.auctions.push({id,name:`${d.name} ${id} · 新手地`,districtId:d.id,tiles:footprint(sites[0]),siteArea:area,far:d.far,startPrice,
      endDay:state.day+config.land.auctionDays,aiMax:startPrice,playerBid:null,deposit:0,starter:true});
    made++;
  }
  return made;
}

function resolveAuction(state:GameState,config:Config,a:Parcel){resolveCompetitiveAuction(state,config,a,awardParcel);}

export function awardParcel(state:GameState,config:Config,a:Parcel,price:number){
  const d = district(config, a.districtId);
  const buildArea = a.siteArea * a.far;
  const firstPayment = price * config.land.firstPaymentRate;
  state.cash -= firstPayment - a.deposit;
  const borrowed=ledger(state,'land',-(firstPayment-a.deposit),null,firstPayment,a.id)+takeDepositFunding(state,a.id);
  const p: Project = {
    ...(a.attributes?{attributes:{...a.attributes}}:{}),
    marketingRate:config.sales.marketingRate,
    contractor:null,quality:null,
    fundingStoppedMonths:0,fundingGap:0,takeover:null,
    id: newId(state, 'P'),
    name: a.name,
    districtId: a.districtId,
    tiles: a.tiles,
    buildArea,
    saleableArea: saleableArea(config,buildArea,a.auction,a.playerAmenityRate??0),
    ...(a.auction?{auction:{...structuredClone(a.auction),extraAmenityRate:a.playerAmenityRate??0}}:{}),
    landCost: price,
    landPaid: firstPayment,
    landDueDay: state.day + config.land.balanceDueMonths * config.time.daysPerMonth,
    buildCost: buildArea * config.buildCostPerSqm * d.buildCostFactor*siteCostFactor(a.attributes),
    buildSpent: 0,
    progress: 0,
    pace: 'normal',
    stage: 'land',
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
  recordLandFunding(state,config,p,borrowed);
  linkParcel(state,a.id,p);
  state.pauses.push('startProject');
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

export function salesRate(config: Config, state: GameState, priceFactor: number,marketingRate=config.sales.marketingRate,districtId?:string,product?:BuildingProduct): number {
  const phase = config.cycle.phases[state.market.phaseIndex];
  const sentimentFactor = 0.5 + state.market.sentiment / 100;
  // 高于市场价的溢价对去化更敏感（premiumElasticity），低于市场价沿用 priceElasticity
  const elasticity = priceFactor > 1 ? (config.sales.premiumElasticity ?? config.sales.priceElasticity) : config.sales.priceElasticity;
  const priceEffect = Math.max(0, 1 - elasticity * (priceFactor - 1));
  const brandFactor=Math.max(0,1+(state.brand-config.marketing.neutralBrand)*config.marketing.brandSensitivity);
  const marketingFactor=Math.max(0,1+(marketingRate-config.sales.marketingRate)*config.marketing.spendSensitivity);
  const rate = config.sales.baseMonthlyAbsorption * phase.absorption * sentimentFactor * priceEffect*brandFactor*marketingFactor*productDemandFactor(config,product,housingDemandFactor(state,config,districtId));
  return Math.min(config.sales.maxMonthlyAbsorption, rate);
}

function takeOverProject(state:GameState,config:Config,p:Project){
  const owned=1-p.partnerShare,market=marketPrice(config,state,p.districtId,p.attributes,p.product),requested=market*p.priceFactor;
  const price=priceRestricted(state,config)?Math.min(requested,p.filedPrice??market*config.filing.maxMarketFactor):requested;
  p.takeover={day:state.day,escrow:Math.max(0,p.salesIn-p.escrowReleased)*owned,
    remainingValue:Math.max(0,p.saleableArea-p.soldArea)*price*owned,bookValue:projectInventory(p)};
  p.stage='abandoned';p.filingDueDay=null;p.filingPrice=null;
  state.attention=Math.min(100,state.attention+config.regulation.takeoverAttentionIncrease);state.stats.projectsTakenOver++;
  addNews(state,'warning',`${p.name} 连续停工 ${p.fundingStoppedMonths} 个月，政府接管；本公司监管款 ${(p.takeover.escrow/10000).toFixed(2)} 亿、剩余货值 ${(p.takeover.remainingValue/10000).toFixed(2)} 亿移交，原借款和欠付土地款仍需偿还`);
  state.pauses.push('risk');
  state.reports.decisions.push({day:state.day,kind:'risk',text:`${p.name} 连续停工 ${p.fundingStoppedMonths} 个月，政府接管`});
}

function settleProject(state: GameState, config: Config, p: Project) {
  const c = config.construction;
  const dpm = config.time.daysPerMonth;
  const owned = 1 - p.partnerShare;
  if(p.stage==='abandoned'||p.stage==='closed'){
    // 接管交付与资产不等于免除原公司的土地欠款或融资债务。
    if(p.landPaid<p.landCost&&state.day>=p.landDueDay){const amount=(p.landCost-p.landPaid)*owned;state.cash-=amount;recordLandFunding(state,config,p,ledger(state,'land',-amount,p.id));p.landPaid=p.landCost;}
    return;
  }
  const event = projectEvent(state,p,config);
  // 土地尾款
  if (p.landPaid < p.landCost && state.day >= p.landDueDay) {
    state.cash -= (p.landCost - p.landPaid) * owned;
    recordLandFunding(state,config,p,ledger(state,'land',-(p.landCost-p.landPaid)*owned,p.id));
    p.landPaid = p.landCost;
  }
  // 施工
  if (p.stage === 'construction' && state.day >= p.stoppedUntil) {
    const pace = c.paces[p.pace];
    const inc = Math.min(pace.speed / (c.months*c.contractors[p.contractor??'standard'].durationFactor*siteDurationFactor(p.attributes)*productTerms(config,p.product).durationFactor), 1 - p.progress);
    const spend = p.buildCost * inc * pace.costFactor * event.cost;
    const paper = state.rating < 5 && state.day >= state.financeFrozenUntil ? spend * owned * p.paperRatio*(industryTight(state)?config.rivals.default.capacityFactor:1) : 0;
    const needed=spend*owned-paper;
    if(state.cash>=needed){
      state.cash-=needed;
      ledger(state,'construction',-needed,p.id,spend*owned);
      ledger(state,'paperIssue',0,p.id,paper);
      if(paper > 0) state.debts.push({id:newId(state,'D'),channel:'paper',principal:paper,rate:config.finance.channels.paper.rate,startDay:state.day,maturityDay:state.day+config.finance.channels.paper.termMonths*dpm,projectId:p.id});
      p.buildSpent+=spend;p.progress+=inc;
      if(p.fundingStoppedMonths>0)addNews(state,'company',`${p.name} 工程款已补足，恢复施工`);
      p.fundingStoppedMonths=0;p.fundingGap=0;
    }else{
      p.fundingStoppedMonths++;p.fundingGap=needed-state.cash;
      addNews(state,'warning',`${p.name} 工程款现金缺口 ${Math.ceil(p.fundingGap)} 万元，停工第 ${p.fundingStoppedMonths} 个月`);state.pauses.push('risk');
    }
    if (p.progress >= 1 - 1e-9) {
      p.progress = 1;
      p.stage = 'completed';
      p.completedDay = state.day;
      addNews(state, 'company', `${p.name} 竣工验收`);
    }
  } else if(p.stage==='construction'&&p.fundingStoppedMonths>0){
    // 已因资金停工且尚未实际复工，事故停工期间也连续计时。
    p.fundingStoppedMonths++;
  } else if (p.stage === 'completed' && p.completedDay !== null && state.day - p.completedDay >= c.deliveryMonths * dpm) {
    p.stage = 'delivered';
    p.deliveredDay = state.day;
    ledger(state,'revenueRecognized',0,p.id,p.salesIn*owned);
    ledger(state,'costRecognized',0,p.id,recognizedProjectCost(p,p.soldArea));
    addNews(state, 'company', `${p.name} 交付业主，收入结转`);
    if(p.quality!==null&&p.quality<config.quality.complaintThreshold){
      state.brand=Math.max(0,state.brand-config.quality.complaintBrandPenalty);state.attention=Math.min(100,state.attention+config.quality.complaintAttentionIncrease);
      addNews(state,'warning',`${p.name} 交付质量 ${p.quality} 分，低于 ${config.quality.complaintThreshold} 分，业主维权；公司品牌下降、监管关注度上升`);state.pauses.push('risk');
    }else{
      const excellent=config.quality.excellentThreshold!==undefined&&p.quality!==null&&p.quality>=config.quality.excellentThreshold;
      state.brand=Math.min(100,state.brand+(excellent?config.quality.excellentBrandGain??config.quality.deliveryBrandGain:config.quality.deliveryBrandGain));
      addNews(state,'company',`${p.name} ${excellent?'交付质量优秀':'交付质量达标'}，公司品牌提升至 ${state.brand} 分`);
    }
  }
  if(p.stage==='construction'&&p.fundingStoppedMonths>=c.fundingStopMonthsToTakeover){takeOverProject(state,config,p);return;}
  // 销售
  const canSell = salesEligible(p,config);
  if (canSell && !presaleBlocked(p) && (!priceRestricted(state,config) || p.filedPrice !== null)) {
    const remaining = p.saleableArea - p.soldArea;
    const requestedPrice = marketPrice(config, state, p.districtId,p.attributes,p.product) * p.priceFactor;
    const price = priceRestricted(state,config) ? Math.min(requestedPrice,p.filedPrice!) : requestedPrice;
    const clearance = p.stage === 'delivered' && p.deliveredDay !== null && state.day - p.deliveredDay >= c.clearanceMonthsAfterDelivery * dpm;
    const market = marketPrice(config,state,p.districtId,p.attributes,p.product);
    const sold = clearance ? remaining : Math.min(remaining, remaining * salesRate(config, state, price / market,p.marketingRate,p.districtId,p.product) * event.demand);
    // 尾货清盘是批量处置：按“市场价与挂牌价取低”再打折，临时提价不能抬高整批成交价（审计 G01）
    const unitPrice = clearance ? Math.min(price, market) * (1 - c.clearanceDiscount) : price;
    const revenue = sold * unitPrice;
    p.soldArea += sold;
    p.salesIn += revenue;
    ledger(state,'saleBooked',0,p.id,revenue*owned);
    if(isDelivered(p)){ledger(state,'revenueRecognized',0,p.id,revenue*owned);ledger(state,'costRecognized',0,p.id,recognizedProjectCost(p,sold));}
    state.cash -= revenue * owned * (p.marketingRate + config.sales.taxRate);
    ledger(state,'marketing',-revenue*owned*p.marketingRate,p.id);
    ledger(state,'tax',-revenue*owned*config.sales.taxRate,p.id);
  }
  // 预售监管账户释放
  const ratio = isDelivered(p) ? 1 : state.regulation.active ? p.progress : Math.min(1, p.progress + config.regulation.escrowReleaseLoose);
  const target = p.salesIn * ratio;
  if (target > p.escrowReleased) {
    state.cash += (target - p.escrowReleased) * owned;
    ledger(state,'escrowRelease',(target-p.escrowReleased)*owned,p.id);
    p.escrowReleased = target;
  }
  // 清盘
  if (p.stage === 'delivered' && p.diverted === 0 && p.saleableArea - p.soldArea < p.saleableArea * 0.005) {
    p.stage = 'closed';
    p.closedDay = state.day;
    state.stats.projectsClosed += 1;
    state.reports.closedProjects.push(p.id);state.pauses.push('settlement');
    addNews(state, 'company', `${p.name} 清盘，累计回款 ${(p.salesIn / 10000).toFixed(2)} 亿`);
  }
}

export function monthEnd(state: GameState, config: Config,companyOnly=false) {
  const previousStatus=state.status;
  const salesStart=!companyOnly?collectSalesStart(state):[];
  const month = monthIndex(config, state.day);
  const dpm = config.time.daysPerMonth;
  if(!companyOnly){updateMarket(state, config, month);updateDistrictPopulation(state,config);}

  for (const p of state.projects) if (activeProject(p)||p.stage==='abandoned'||p.stage==='closed'&&p.landPaid<p.landCost){const before=p.soldArea;settleProject(state, config, p);updateHoarding(state,config,p,before);}

  inspect(state,config);

  // 利息与到期还本
  for (const d of state.debts){const interest=d.principal*d.rate/12;state.cash-=interest;ledger(state,'interest',-interest,d.projectId);if(d.projectId===null)allocateFinance(state,interest);}
  const due = state.debts.filter((d) => d.maturityDay <= state.day);
  for (const d of due){state.cash-=d.principal;ledger(state,'repay',-d.principal,d.projectId,d.principal,undefined,d.projectId?-d.principal:0,d.channel);}
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
    if(!companyOnly)spawnAuctions(state, config);
  }

  // 违约与破产
  protectSandbox(state,config);
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
  accelerateDebts(state,config,()=>newId(state,'D'));
  state.stats.peakEquity = Math.max(state.stats.peakEquity, metrics.equity);

  // 预警：未来 90 天的刚性支出超过现金
  const horizon = state.day + 3 * dpm;
  const upcoming =
    state.debts.filter((d) => d.maturityDay <= horizon).reduce((s, d) => s + d.principal, 0) +
    state.projects.filter((p) => (activeProject(p)||p.stage==='abandoned') && p.landPaid < p.landCost && p.landDueDay <= horizon).reduce((s, p) => s + (p.landCost - p.landPaid) * (1-p.partnerShare), 0);
  if (state.status === 'playing' && upcoming > state.cash && month - state.lastWarnMonth >= 3) {
    state.lastWarnMonth = month;
    addNews(state, 'warning', `未来 3 个月到期 ${(upcoming / 10000).toFixed(2)} 亿，超过账上现金`);
    state.pauses.push('cashWarning');
  }

  if (month === config.time.careerYears * 12) {
    addNews(state, 'company', `生涯结算：第 ${config.time.careerYears} 年公司净资产 ${(metrics.equity / 10000).toFixed(2)} 亿，创始人权益账面份额 ${(founderBookValue(state) / 10000).toFixed(2)} 亿。可以继续经营。`);
  }
  if(previousStatus!==state.status&&(state.status==='distress'||state.status==='bankrupt'))state.reports.decisions.push({day:state.day,kind:state.status==='bankrupt'?'bankruptcy':'risk',text:state.status==='bankrupt'?'自救窗口结束，公司破产':`现金缺口 ${(-state.cash/10000).toFixed(2)}亿，进入自救窗口`});
  if(!companyOnly)for(const rival of state.rivals){
    const company=rival.company;company.day=state.day;company.market=state.market;
    if(company.status!=='bankrupt')monthEnd(company,config,true);
    company.pauses=[];
  }
  if(!companyOnly){updateIndustryDefaults(state,config);closeDistrictMarkets(state,config,salesStart);reviewHousingPolicies(state,config);}
  closeReportMonth(state,config);
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
