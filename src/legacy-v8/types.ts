// 模拟内核的数据类型。金额单位一律为万元，面积为平方米。

export type Tile = readonly [i: number, j: number];

export type Pace = 'slow' | 'normal' | 'fast';
export const CONTRACTORS=['budget','standard','brand'] as const;
export type ContractorId=typeof CONTRACTORS[number];
export const BUILDING_PRODUCTS=['tower','garden','villa','commercial'] as const;
export const BUILDING_VARIANTS=['a','b','c'] as const;
export type BuildingProduct=typeof BUILDING_PRODUCTS[number];
export type BuildingVariant=typeof BUILDING_VARIANTS[number];
export interface BuildingAppearance {product:BuildingProduct;variant:BuildingVariant}

export type ProjectStage = 'land' | 'construction' | 'completed' | 'delivered' | 'closed' | 'sold' | 'abandoned';

export interface Project {
  acquisition?:{day:number;rivalId:string;originalProjectId:string;price:number;basisAdjustment:number;recognizedRatio:number};
  marketingRate:number;
  contractor:ContractorId|null;
  quality:number|null;
  appearance?: BuildingAppearance; // 仅建筑外观；缺省时沿用片区默认，不改变旧档回放。
  fundingStoppedMonths:number;
  fundingGap:number;
  takeover:{day:number;escrow:number;remainingValue:number;bookValue:number}|null;
  id: string;
  name: string;
  districtId: string;
  tiles: Tile[];
  buildArea: number;
  saleableArea: number;
  landCost: number;
  landPaid: number;
  landDueDay: number;
  buildCost: number;
  buildSpent: number;
  progress: number; // 0..1
  pace: Pace;
  stage: ProjectStage;
  priceFactor: number; // 相对片区市场价
  soldArea: number;
  salesIn: number; // 累计售房回款（先进监管账户）
  escrowReleased: number;
  completedDay: number | null;
  deliveredDay: number | null;
  closedDay: number | null;
  paperRatio: number;
  partnerShare: number;
  diverted: number;
  stoppedUntil: number;
  filedPrice: number | null;
  filingPrice: number | null;
  filingDueDay: number | null;
}

export interface Parcel {
  id: string;
  name: string;
  districtId: string;
  tiles: Tile[];
  siteArea: number;
  far: number;
  startPrice: number;
  endDay: number;
  aiMax: number; // 仅保留旧档/固定世界生成字段，v7竞拍不使用
  rivalBids?:{rivalId:string;amount:number;deposit:number}[];
  playerBid: number | null;
  deposit: number;
}

export type ChannelId = 'devLoan' | 'trust' | 'paper' | 'hidden';

export interface Debt {
  id: string;
  channel: ChannelId;
  principal: number;
  rate: number;
  startDay: number;
  maturityDay: number;
  projectId: string | null;
  extensions?: number;
  revealed?: boolean;
}

export interface NewsItem {
  day: number;
  kind: 'policy' | 'market' | 'company' | 'land' | 'warning';
  text: string;
}

export interface Metrics {
  cash: number;
  escrow: number;
  inventory: number;
  totalAssets: number;
  interestDebt: number;
  contractLiabilities: number;
  landPayable: number;
  totalLiabilities: number;
  equity: number;
  liabilityRatio: number; // 剔除预收款后的资产负债率
  netGearing: number; // 净负债率
  cashToShortDebt: number; // 现金短债比
  shortDebt: number;
  paperDebt: number;
  hiddenDebt: number;
}

export type PauseReason = 'auction' | 'cashWarning' | 'regulation' | 'gameOver' | 'risk'|'startProject'|'settlement';

export type LedgerKind='acquisition'|'acquiredContracts'|'deposit'|'depositRefund'|'land'|'construction'|'saleBooked'|'escrowRelease'|'marketing'|'tax'|'loan'|'repay'|'interest'|'extensionFee'|'financeAllocation'|'partnerInvestment'|'transfer'|'diversion'|'escrowReturn'|'fine'|'accident'|'paperIssue'|'revenueRecognized'|'costRecognized';
export interface LedgerEntry {day:number;period:number;kind:LedgerKind;cash:number;projectCash:number;amount:number;projectId:string|null;parcelId?:string}
export interface DecisionPoint {day:number;text:string;kind:'command'|'risk'|'bankruptcy'}
export interface MonthlyReport {period:number;startDay:number;endDay:number;opening:Metrics;closing:Metrics;fromEntry:number;toEntry:number;phase:string;status:GameState['status']}
export interface ReportState {
 comparisons?:import('./rankings.ts').ComparisonSnapshot[];
 provenance?:'native'|'replayed';replayError?:string;
 sinceDay:number;complete:boolean;period:number;periodStart:number;opening:Metrics;cursor:number;
 journal:LedgerEntry[];months:MonthlyReport[];decisions:DecisionPoint[];
 origins:Record<string,{period:number;complete:boolean}>;closedProjects:string[];parcelEntries:Record<string,number[]>;projectEntries:Record<string,number[]>;
}

export interface GameState {
  version: 8;
  industry:IndustryState;
  opponentId?:string; // 仅对手子账本；子账本的rivals始终为空
  rivals:RivalCompany[];
  rivalsSinceDay:number;
  reports:ReportState;
  brand:number;
  financeFrozenUntil: number;
  seed: number;
  rng: number;
  day: number;
  status: 'playing' | 'distress' | 'bankrupt' | 'finished';
  distressMonths: number;
  cash: number;
  debts: Debt[];
  projects: Project[];
  auctions: Parcel[];
  market: {
    phaseIndex: number;
    phaseEndMonth: number;
    sentiment: number;
    priceIndex: Record<string, number>;
  };
  regulation: {
    active: boolean;
    announced: boolean;
    tier: number; // 0 绿 .. 3 红
    debtBaseline: number;
    breaches: { liabilityRatio: boolean; netGearing: boolean; cashToShortDebt: boolean };
  };
  rating: number; // ratings 数组下标，0 = AAA
  attention: number; // 监管关注度 0..100
  news: NewsItem[];
  pauses: PauseReason[];
  nextId: number;
  lastWarnMonth: number;
  stats: { landWon: number; projectsClosed: number; peakEquity: number;projectsTakenOver:number };
}

export type Command =
  | {type:'acquireProject';rivalId:string;projectId:string}
  | {type:'setMarketing';projectId:string;rate:number}
  | {type:'startProject';projectId:string;contractor:ContractorId}
  | { type:'setAppearance';projectId:string;product:BuildingProduct;variant:BuildingVariant }
  | { type: 'bid'; parcelId: string; amount: number }
  | { type: 'borrow'; channel: ChannelId; amount: number; projectId?: string }
  | { type: 'repay'; debtId: string }
  | { type: 'setPaper'; projectId: string; enabled: boolean }
  | { type: 'cooperate'; projectId: string }
  | { type: 'divert'; projectId: string }
  | { type: 'filePrice'; projectId: string }
  | { type: 'extend'; debtId: string }
  | { type: 'sellProject'; projectId: string }
  | { type: 'setPace'; projectId: string; pace: Pace }
  | { type: 'setPrice'; projectId: string; priceFactor: number };

export interface CommandResult {
  ok: boolean;
  error?: string;
}

export interface LoggedCommand {
  day: number;
  command: Command;
}

export interface RivalCompany {id:string;name:string;risk:string;company:GameState;defaultActive?:boolean;defaultDay?:number}

export interface IndustryState {creditUntil:number;events:{day:number;rivalId:string;phase:string;cashGap:number;sentimentBefore:number;sentimentAfter:number}[]}
