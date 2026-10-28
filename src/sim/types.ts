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

export type AuctionKind='ascending'|'lottery'|'amenity';
export interface AuctionTerms {kind:AuctionKind;priceCap:number|null;required:{kind:'school'|'affordable';rate:number}[]}

export interface SiteAttributes {slope:'flat'|'gentle'|'steep';scenery:'none'|'river'|'mountain'|'both';costFactor:number;durationFactor:number;priceFactor:number}
export interface DistrictPolicy {level:number;sinceDay:number;lastChangedDay:number;lastReviewDay:number;prices:number[];priceGrowth:number|null;signal:'observing'|'hot'|'weak'|'stable';reason:string}
export interface DistrictMarket {population:number;netInflow:number;stockArea:number;salesHistory:number[];absorptionMonths:number|null;sinceDay:number}

export interface ComplianceState {sinceDay:number;cash:number;borrowedCash:number;deposits:Record<string,number>;landCases:{day:number;projectId:string;districtId:string;amount:number;penalizedDay?:number}[];landBans:Record<string,number>}
export interface PresaleControl {hoardingMonths:number;revokedDay:number|null;reapplyDay:number|null}

export interface Project {
  presale?:PresaleControl;
  attributes?:SiteAttributes;
  auction?:AuctionTerms & {extraAmenityRate:number};
  acquisition?:{day:number;rivalId:string;originalProjectId:string;price:number;basisAdjustment:number;recognizedRatio:number};
  marketingRate:number;
  contractor:ContractorId|null;
  quality:number|null;
  /** 开工时选定的产品线（经济系数）；缺省按高层住宅基准。 */
  product?: BuildingProduct;
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
  attributes?:SiteAttributes;
  /** 开局新手地：只对玩家开放，同行不参与竞拍。 */
  starter?:true;
  auction?:AuctionTerms;
  playerAmenityRate?:number;
  id: string;
  name: string;
  districtId: string;
  tiles: Tile[];
  siteArea: number;
  far: number;
  startPrice: number;
  endDay: number;
  aiMax: number; // 仅保留旧档/固定世界生成字段，v7竞拍不使用
  rivalBids?:{rivalId:string;amount:number;deposit:number;amenityRate?:number}[];
  playerBid: number | null;
  deposit: number;
}

export type ChannelId = 'devLoan' | 'trust' | 'paper' | 'hidden' | 'bond';

export interface Debt {
  restructuring?:{day:number;originalMaturityDay:number};
  covenant?:{belowRating:number;fraction:number;noticeMonths:number;triggerDay?:number};
  acceleration?:{triggerDay:number;originalDebtId:string;originalMaturityDay:number};
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

export type PauseReason = 'auction' | 'cashWarning' | 'regulation' | 'gameOver' | 'risk'|'startProject'|'settlement'|'challenge';

export type LedgerKind='equityInvestment'|'acquisition'|'acquiredContracts'|'deposit'|'depositRefund'|'land'|'construction'|'saleBooked'|'escrowRelease'|'marketing'|'tax'|'loan'|'repay'|'interest'|'extensionFee'|'financeAllocation'|'partnerInvestment'|'transfer'|'diversion'|'escrowReturn'|'fine'|'accident'|'paperIssue'|'revenueRecognized'|'costRecognized'|'salary';
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

export interface CapitalEvent {day:number;kind:'strategic'|'restructuring';newShare:number;founderBefore:number;founderAfter:number;cash:number;principal:number;debtIds:string[]}
export interface CapitalState {sinceDay:number;founderShare:number;strategicShare:number;creditorShare:number;lastInvestmentDay:number|null;restructurings:number;events:CapitalEvent[]}

export interface ActiveSeason {month:number;seasonId:string;seasonName:string;eventId:string|null;name:string|null;kind:'season'|'policy';text:string|null;sales:number;build:number;cost:number;rate:number}

export const STAFF_SKILLS=['engineering','sales','finance','relations'] as const;
export type StaffSkill=typeof STAFF_SKILLS[number];
export const STAFF_POSTS=['pm','salesLead','cfo','pr'] as const;
export type StaffSlot=typeof STAFF_POSTS[number];
export type StaffPost={slot:'pm'|'salesLead';projectId:string}|{slot:'cfo'|'pr'};
export interface Employee {id:string;name:string;specialty:StaffSkill;skills:Record<StaffSkill,number>;salary:number;post:StaffPost|null;hiredDay:number;monthsInPost:number}
export interface StaffState {rng:number;nextId:number;pool:Employee[];members:Employee[];poolDay:number}

export interface GameState {
  version: 16;
  /** 季节事件独立随机流（仅玩家公司）。 */
  seasons?:{rng:number};
  /** 员工与人才市场（仅玩家公司）。 */
  staff?:StaffState;
  session?:import('./sessions.ts').SessionState;
  rules?:import('./config.ts').Config; // 开局指令派生的只读运行配置，SaveData不保存状态快照。
  capital?:CapitalState;
  compliance?:ComplianceState;
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
    policies?:Record<string,DistrictPolicy>;
    districts?:Record<string,DistrictMarket>;
    phaseIndex: number;
    phaseEndMonth: number;
    sentiment: number;
    priceIndex: Record<string, number>;
    /** 本月生效的季节/政策事件，月末抽取下月事件。 */
    season?: ActiveSeason;
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
  | {type:'startGame';options:import('./sessionConfig.ts').SessionOptions}
  | {type:'sandboxGrant'}
  | {type:'strategicInvestment';share:number}
  | {type:'restructureDebt'}
  | {type:'acquireProject';rivalId:string;projectId:string}
  | {type:'setMarketing';projectId:string;rate:number}
  | {type:'startProject';projectId:string;contractor:ContractorId;product?:BuildingProduct}
  | { type:'setAppearance';projectId:string;product:BuildingProduct;variant:BuildingVariant }
  | { type: 'bid'; parcelId: string; amount: number; amenityRate?:number }
  | { type: 'borrow'; channel: ChannelId; amount: number; projectId?: string; termMonths?:number }
  | { type: 'repay'; debtId: string }
  | { type: 'setPaper'; projectId: string; enabled: boolean }
  | { type: 'cooperate'; projectId: string }
  | { type: 'divert'; projectId: string }
  | { type: 'filePrice'; projectId: string }
  | { type: 'extend'; debtId: string }
  | { type: 'sellProject'; projectId: string }
  | { type: 'setPace'; projectId: string; pace: Pace }
  | { type: 'setPrice'; projectId: string; priceFactor: number }
  | { type: 'hireStaff'; candidateId: string }
  | { type: 'fireStaff'; staffId: string }
  | { type: 'assignStaff'; staffId: string; post: StaffPost | null };

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
