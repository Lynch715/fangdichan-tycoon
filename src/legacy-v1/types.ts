// 模拟内核的数据类型。金额单位一律为万元，面积为平方米。

export type Tile = readonly [i: number, j: number];

export type Pace = 'slow' | 'normal' | 'fast';

export type ProjectStage = 'land' | 'construction' | 'completed' | 'delivered' | 'closed';

export interface Project {
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
  aiMax: number; // 对手的心理价位（隐藏）
  playerBid: number | null;
  deposit: number;
}

export type ChannelId = 'devLoan' | 'trust';

export interface Debt {
  id: string;
  channel: ChannelId;
  principal: number;
  rate: number;
  startDay: number;
  maturityDay: number;
  projectId: string | null;
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
}

export type PauseReason = 'auction' | 'cashWarning' | 'regulation' | 'gameOver';

export interface GameState {
  version: 1;
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
  stats: { landWon: number; projectsClosed: number; peakEquity: number };
}

export type Command =
  | { type: 'bid'; parcelId: string; amount: number }
  | { type: 'borrow'; channel: ChannelId; amount: number; projectId?: string }
  | { type: 'repay'; debtId: string }
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
