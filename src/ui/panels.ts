import{capitalPanel}from'./capital.ts';
import{transferMarkup}from'./transfer.ts';
import{housingPolicyMarkup}from'./housingPolicy.ts';
import{landBanMarkup,presaleMarkup,complianceRules}from'./compliance.ts';
import{landBanUntil,presaleBlocked}from'../sim/compliance.ts';
import{siteAttributesMarkup}from'./regions.ts';
import{siteDurationFactor}from'../sim/regions.ts';
import{auctionTermsMarkup,projectAmenityMarkup}from'./auctionTerms.ts';
import{rivalsPanel,industryStatus}from'./rivals.ts';
import{appearanceOf,PRODUCT_NAMES}from'../appearance.ts';
import{BUILDING_PRODUCTS,BUILDING_VARIANTS,CONTRACTORS}from'../sim/types.ts';
import {estimateLand} from '../estimates/land.ts';
// 界面面板：根据模拟状态生成 HTML。按钮通过 data-act 属性交给 main.ts 统一处理。
import { activeProject, priceRestricted, transferQuote, borrowCapacity, calendar, computeMetrics, district, marketPrice,salesRate,salesEligible,industryTight,channelRate, type Config, type GameState, type Project,type Parcel } from '../sim/index.ts';
import { esc, pct, ratio, yi } from './format.ts';

const STAGE: Record<Project['stage'], [string, string]> = {
  sold: ['已转让', 'gray'],
  land: ['已拿地', 'gray'],
  construction: ['施工', 'orange'],
  completed: ['已竣工', 'green'],
  delivered: ['已交付', 'green'],
  closed: ['已清盘', 'gray'],
  abandoned:['政府接管','red'],
};

export function headerDate(config: Config, s: GameState): string {
  const c = calendar(config, s.day);
  return `第 ${c.year} 年 · ${c.month} 月 ${c.day} 日`;
}

export function statusLine(config: Config, s: GameState) {
  const m = computeMetrics(s);
  const tierName = s.regulation.active ? config.regulation.tiers[s.regulation.tier] : '未实施';
  return { cash: yi(s.cash, 1), tier: tierName, tierIdx: s.regulation.active ? s.regulation.tier : -1, rating: config.finance.ratings[s.rating], m };
}

function dueBuckets(config: Config, s: GameState) {
  const dpm = config.time.daysPerMonth;
  const base = Math.floor(s.day / dpm);
  const buckets = Array.from({ length: 6 }, (_, k) => ({ label: `${((base + k) % 12) + 1}月`, amount: 0 }));
  for (const d of s.debts) {
    const k = Math.floor(d.maturityDay / dpm) - base;
    if (k >= 0 && k < 6) buckets[k].amount += d.principal;
  }
  for (const p of s.projects) {
    if ((!activeProject(p)&&p.stage!=='abandoned') || p.landPaid >= p.landCost) continue;
    const k = Math.floor(p.landDueDay / dpm) - base;
    if (k >= 0 && k < 6) buckets[k].amount += (p.landCost - p.landPaid) * (1-p.partnerShare);
  }
  return buckets;
}

export function financePanel(config: Config, s: GameState,capitalShare?:number): string {
  const { m } = statusLine(config, s);
  const buckets = dueBuckets(config, s);
  const max = Math.max(1, ...buckets.map((b) => b.amount));
  const bars = buckets
    .map((b) => {
      const danger = b.amount > s.cash;
      return `<div class="bar"><div class="bar-fill ${danger ? 'danger' : ''}" style="height:${Math.max(3, (b.amount / max) * 72)}px" title="${yi(b.amount)}"></div><span class="${danger ? 'danger-text' : ''}">${b.label}</span></div>`;
    })
    .join('');
  const t = config.regulation.thresholds;
  const br = s.regulation.active ? s.regulation.breaches : { liabilityRatio: m.liabilityRatio > t.liabilityRatio, netGearing: m.netGearing > t.netGearing, cashToShortDebt: m.cashToShortDebt < t.cashToShortDebt };
  const line = (bad: boolean, name: string, value: string, limit: string) =>
    `<div class="redline"><span class="dot ${bad ? 'red' : 'green'}"></span><span class="grow">${name}</span><b class="${bad ? 'danger-text' : ''}">${value}</b><span class="muted small limit">${limit}</span></div>`;
  const tierText = s.regulation.active
    ? `<span class="pill tier-${s.regulation.tier}">${config.regulation.tiers[s.regulation.tier]}</span>`
    : `<span class="pill gray">${s.regulation.announced ? '即将实施' : '未实施'}</span>`;
  const cap = s.regulation.active ? `有息负债年增速上限 ${pct(config.regulation.growthCaps[s.regulation.tier])}` : '红线尚未实施，仅作参考';
  const trustCap = borrowCapacity(config, s, 'trust'),bondCap=borrowCapacity(config,s,'bond');
  const building = s.projects.filter((p) => p.stage === 'construction');
  const devOptions = building.map((p) => `<option value="${p.id}">${esc(p.name)}（可借 ${yi(borrowCapacity(config, s, 'devLoan', p.id).max)}）</option>`).join('');
  const debts = [...s.debts]
    .sort((a, b) => a.maturityDay - b.maturityDay)
    .map((d) => {
      const c = calendar(config, d.maturityDay);
      return `<div class="debt"><span class="grow">${config.finance.channels[d.channel].name} ${yi(d.principal)} · ${pct(d.rate, 1)}</span><span class="muted small">${c.year}年${c.month}月到期${d.acceleration?' · 评级触发提前到期':''}${d.restructuring?' · 已股权重组':''}</span><button class="mini" data-act="repay" data-id="${d.id}">提前还</button>${!d.acceleration && !d.restructuring && d.channel !== 'paper' && (d.extensions ?? 0) < config.finance.extension.maxTimes ? `<button class="mini" data-act="extend" data-id="${d.id}">展期</button>` : ''}</div>`;
    })
    .join('');
  return `${industryStatus(config,s)}
  <section class="stack">
    <span class="muted small">可动用现金</span>
    <span class="big ${s.cash < 0 ? 'danger-text' : ''}">${(s.cash / 10000).toFixed(2)} <small>亿</small></span>
    <span class="muted small">监管账户 ${yi(m.escrow)} · 净资产 ${yi(m.equity)}</span>
  </section>
  <section class="stack">
    <div class="row between"><b>未来 6 个月到期</b><span class="muted small">含商票与土地尾款</span></div>
    <div class="bars">${bars}</div>
  </section>
  <section class="stack">
    <div class="row between"><b>三道红线</b>${tierText}</div>
    ${line(br.liabilityRatio, '剔除预收后负债率', pct(m.liabilityRatio), `≤${pct(t.liabilityRatio)}`)}
    ${line(br.netGearing, '净负债率', pct(m.netGearing), `≤${pct(t.netGearing)}`)}
    ${line(br.cashToShortDebt, '现金短债比', ratio(m.cashToShortDebt), `≥${t.cashToShortDebt}`)}
    <span class="muted small">${cap}</span>
  </section>
  <section class="grid2">
    <div class="tile"><span class="muted small">信用评级</span><b class="mid">${config.finance.ratings[s.rating]}</b></div>
    <div class="tile"><span class="muted small">监管关注度</span><b class="mid">${s.attention < 30 ? '低' : s.attention < 60 ? '中' : '高'}</b></div>
    <div class="tile"><span class="muted small">公司品牌</span><b class="mid">${s.brand} <small>/ 100</small></b><span class="small muted">达标交付 +${config.quality.deliveryBrandGain} · 维权 −${config.quality.complaintBrandPenalty}</span></div>
  </section>
  <section class="stack">
    <b>融资与自救</b>${capitalPanel(config,s,capitalShare)}
    <div class="stack bond-tools"><b>公司债 · AA及以上可发行</b><span class="small muted">当前年利率 ${pct(channelRate(config,s,'bond'),1)} · 可发行 ${yi(bondCap.max)}。发行时按评级确定合同利率，利率范围 ${pct(config.finance.bond.minRate)}–${pct(config.finance.bond.maxRate)}；普通展期加息也受此上限约束。</span>
      <label class="field"><span>公司债期限</span><select id="bond-term" aria-label="公司债期限">${config.finance.bond.termsMonths.map(m=>`<option value="${m}" ${m===config.finance.channels.bond.termMonths?'selected':''}>${m/12} 年</option>`).join('')}</select></label>
      <div class="row"><input id="bond-amt" type="number" min="0" step="0.1" aria-label="公司债金额（亿）" placeholder="金额（亿）"><button data-act="borrow-bond" ${bondCap.max<=0?'disabled':''}>发行公司债</button></div>
      ${bondCap.max<=0?`<span class="warn-text small">${esc(bondCap.reason??'没有可发行额度')}</span>`:''}
    </div>
    <p class="small warn-text">新签开发贷、信托、明股实债及公司债约定：评级低于 ${config.finance.ratings[config.finance.covenants.belowRating]} 时，尚未进入通知期的本金中 ${pct(config.finance.covenants.fraction)} 于通知后 ${config.finance.covenants.noticeMonths} 个月到期，每笔合同触发一次；提前到期部分不可展期。持续资金困境 ${config.finance.covenants.distressMonthsForC} 个月降至 C。旧合同未约定此条款的，保留原到期日。</p>
    ${s.status === 'distress' ? s.cash<0?`<span class="danger-text small">资金缺口 ${yi(-s.cash)}，自救剩余 ${Math.max(0,config.finance.distressMonthsToBankrupt-s.distressMonths)} 个月，可查看战投、债务重组或转让方案。</span>`:'<span class="ok-text small">现金缺口已补足，将在下次月末核定经营状态。</span>' : ''}
    <span class="muted small">商票余额 ${yi(m.paperDebt)} · 明股实债 ${yi(m.hiddenDebt)}（计入有息负债）</span>
    ${s.day < s.financeFrozenUntil ? `<span class="danger-text small">新增融资冻结至第 ${calendar(config,s.financeFrozenUntil).year} 年 ${calendar(config,s.financeFrozenUntil).month} 月</span>` : ''}
    <label class="field"><span>明股实债 · 年化 ${pct(channelRate(config,s,'hidden'),1)} · 可融 ${yi(borrowCapacity(config,s,'hidden').max)}</span><div class="row"><input type="number" min="0" step="0.1" id="hidden-amt" placeholder="金额（亿）"><button data-act="borrow-hidden">融入</button></div></label>
    <span class="warn-text small">伪装股权仍须还本付息；抽查后罚款并冻结新增融资。展期一次 ${config.finance.extension.months} 个月，费用 ${pct(config.finance.extension.feeRate)}、年利率增加 ${pct(config.finance.extension.rateBump)}。</span>
    <label class="field"><span>${config.finance.channels.trust.name} · 年化 ${pct(channelRate(config,s,'trust'), 1)} · 可借 ${yi(trustCap.max)}</span>
      <div class="row"><input type="number" min="0" step="0.1" id="trust-amt" placeholder="金额（亿）"><button data-act="borrow-trust">借入</button></div></label>
    ${building.length ? `<label class="field"><span>${config.finance.channels.devLoan.name} · 年化 ${pct(channelRate(config,s,'devLoan'), 1)}</span>
      <select id="dev-project">${devOptions}</select>
      <div class="row"><input type="number" min="0" step="0.1" id="dev-amt" placeholder="金额（亿）"><button data-act="borrow-dev">借入</button></div></label>` : '<span class="muted small">有在建项目后可申请开发贷</span>'}
    ${trustCap.reason ? `<span class="muted small">${esc(trustCap.reason)}</span>` : ''}
  </section>
  ${debts ? `<section class="stack"><b>有息负债</b>${debts}</section>` : ''}${complianceRules(s,config)}`;
}

export function projectsPanel(config: Config, s: GameState, selectedId: string | null): string {
  const list = s.projects.filter(p=>activeProject(p)||p.stage==='abandoned');
  if (list.length === 0) return `<div class="empty">还没有项目。去“拍地”参加土地拍卖吧。</div>`+rivalsPanel(config,s,selectedId);
  return list
    .map((p) => {
      if(p.stage==='land')return `<article class="card ${p.id===selectedId?'selected':''}" data-select="${p.id}">
        <div class="row between"><b>${esc(p.name)}${p.acquisition?' · 收购项目':''}</b><span class="pill gray">待开工</span></div>
        ${projectAmenityMarkup(p)}${siteAttributesMarkup(p.attributes)}${housingPolicyMarkup(config,s,p.districtId)}${presaleMarkup(s,config,p)}<span class="small muted">选择总包后开工，选定后不可更换。地价尾款仍按原期支付。</span>
        ${CONTRACTORS.map(id=>{const t=config.construction.contractors[id];return `<div class="tile stack"><div class="row between"><b>${t.name}</b><span class="small ${t.quality<config.quality.complaintThreshold?'danger-text':'ok-text'}">质量 ${t.quality} 分</span></div><span class="small muted">预计建安 ${yi(p.buildCost*t.costFactor)} · 正常工期 ${Math.ceil(config.construction.months*t.durationFactor*siteDurationFactor(p.attributes))} 个月<br>月事故率 ${(config.risk.accidentChance*t.accidentFactor*100).toFixed(2)}%（加速施工另增风险）</span><button data-act="start-project" data-id="${p.id}" data-contractor="${id}">${t.name}开工</button></div>`}).join('')}
        <span class="small warn-text">交付质量低于 ${config.quality.complaintThreshold} 分触发业主维权：品牌 −${config.quality.complaintBrandPenalty}，关注度 +${config.quality.complaintAttentionIncrease}。事故使质量下降 ${config.quality.accidentPenalty} 分。</span>
        ${p.landPaid<p.landCost?`<span class="small warn-text">本公司土地尾款 ${yi((p.landCost-p.landPaid)*(1-p.partnerShare))}，${calendar(config,p.landDueDay).month} 月到期</span>`:''}
        <button class="ghost" data-act="sell" data-id="${p.id}">转让项目 · ${transferQuote(s,p,config).net>=0?'净回笼':'需补付'} ${yi(Math.abs(transferQuote(s,p,config).net))}</button>
      </article>`;
      if(p.stage==='abandoned')return `<article class="card ${p.id===selectedId?'selected':''}" data-select="${p.id}">
        <div class="row between"><b>${esc(p.name)}${p.acquisition?' · 收购项目':''}</b><span class="pill red">政府接管</span></div>
        <span class="danger-text small">连续停工 ${p.fundingStoppedMonths} 个月，项目已退出本公司经营。</span>
        ${p.takeover?`<span class="muted small">移交监管款 ${yi(p.takeover.escrow)} · 剩余货值 ${yi(p.takeover.remainingValue)}（按接管时售价估算）</span>`:''}
        <span class="warn-text small">接管方承接交付，原公司借款、商票及未付土地款仍需偿还。</span>
        ${p.landPaid<p.landCost?`<span class="small warn-text">本公司土地尾款 ${yi((p.landCost-p.landPaid)*(1-p.partnerShare))}，${calendar(config,p.landDueDay).month} 月到期</span>`:''}
      </article>`;
      const appearance=appearanceOf(p);
      const [label, color] = p.stage==='construction'&&p.fundingStoppedMonths>0?['资金停工','red']:STAGE[p.stage];
      const sold = p.soldArea / p.saleableArea;
      const requested = marketPrice(config, s, p.districtId,p.attributes) * p.priceFactor;
      const price = priceRestricted(s,config) && p.filedPrice !== null ? Math.min(requested,p.filedPrice) : requested;
      const quote = transferQuote(s,p,config);
      const canSell = salesEligible(p,config);
      const detail =
        p.stage === 'construction'
          ? `工程 ${pct(p.progress)}${canSell ? ` · 去化 ${pct(sold)}` : ` · 进度 ${pct(config.construction.presaleProgress)} 可取预售证`}`
          : `去化 ${pct(sold)} · 累计回款 ${yi(p.salesIn)}`;
      const paces = (['slow', 'normal', 'fast'] as const)
        .map((k) => `<button class="seg ${p.pace === k ? 'on' : ''}" data-act="pace" data-id="${p.id}" data-pace="${k}">${config.construction.paces[k].name}</button>`)
        .join('');
      return `<article class="card ${p.id === selectedId ? 'selected' : ''}" data-select="${p.id}">
        <div class="row between"><b>${esc(p.name)}${p.acquisition?' · 收购项目':''}</b><span class="pill ${color}">${label}</span></div>
        <div class="progress"><div style="width:${pct(p.stage === 'construction' ? p.progress : sold)}"></div></div>
        <span class="muted small">${detail}</span>${projectAmenityMarkup(p)}${siteAttributesMarkup(p.attributes)}${housingPolicyMarkup(config,s,p.districtId)}${presaleMarkup(s,config,p)}
        <span class="small ${p.quality!==null&&p.quality<config.quality.complaintThreshold?'danger-text':'muted'}">${config.construction.contractors[p.contractor??'standard'].name} · 质量 ${p.quality??'—'} 分 · 公司品牌 ${s.brand} 分</span>
        ${p.deliveredDay!==null&&p.quality!==null&&p.quality<config.quality.complaintThreshold?'<span class="small danger-text">交付质量未达标，已引发业主维权。</span>':''}
        ${p.fundingStoppedMonths>0?`<span class="danger-text small">停工 ${p.fundingStoppedMonths}/${config.construction.fundingStopMonthsToTakeover} 个月 · ${p.fundingGap>0?`上次月末工程款缺口 ${Math.ceil(p.fundingGap)} 万元；补足工程款后可在月末复工。`:'历史停工，资金补入后将在下次月末核验复工。'}</span>`:''}
        ${p.stage === 'construction' ? `<div class="segs">${paces}</div>` : ''}
        <details class="project-tools" data-key="appearance-${p.id}"><summary>建筑外观 · ${PRODUCT_NAMES[appearance.product]} / ${appearance.variant.toUpperCase()}</summary><div class="stack">
          <label class="small">建筑类型 <select id="appearance-product-${p.id}">${BUILDING_PRODUCTS.map(k=>`<option value="${k}" ${k===appearance.product?'selected':''}>${PRODUCT_NAMES[k]}</option>`).join('')}</select></label>
          <label class="small">外观变体 <select id="appearance-variant-${p.id}">${BUILDING_VARIANTS.map(k=>`<option value="${k}" ${k===appearance.variant?'selected':''}>${k.toUpperCase()}</option>`).join('')}</select></label>
          <button class="ghost" data-act="appearance" data-id="${p.id}">应用外观</button>
        </div></details>
        ${canSell ? `<div class="row between small"><span class="muted">售价 ${(price * 10000).toFixed(0)} 元/㎡（市场价 ${pct(price/marketPrice(config,s,p.districtId,p.attributes))}）</span><span class="row"><button class="mini" data-act="price" data-id="${p.id}" data-delta="-0.05">降价</button><button class="mini" data-act="price" data-id="${p.id}" data-delta="0.05">提价</button></span></div>` : ''}
        ${canSell?`<div class="stack"><label class="small">营销投入（销售回款比例，%）<div class="row"><input id="marketing-${p.id}" aria-label="营销投入比例（%）" type="number" min="0" max="${config.marketing.maxRate*100}" step="0.5" value="${p.marketingRate*100}"><button data-act="marketing" data-id="${p.id}">设置</button></div></label><span class="small muted">当前 ${pct(p.marketingRate,1)} · ${presaleBlocked(p)?'预售暂停；恢复后预计月去化':'预计月去化'} ${pct(salesRate(config,s,price/marketPrice(config,s,p.districtId,p.attributes),p.marketingRate,p.districtId),1)}。品牌、营销和片区购房政策共同影响去化；仅对实际回款计营销费，未计配套利好。</span></div>`:''}
        <details class="project-tools" data-key="${p.id}"><summary>项目融资、备案与自救</summary><div class="stack">
          <span class="small muted">${p.partnerShare > 0 ? `合作方权益 ${pct(p.partnerShare)}，成本与回款按比例分摊` : '独资项目'} · 商票支付比例 ${pct(p.paperRatio*(industryTight(s)?config.rivals.default.capacityFactor:1))}</span>
          ${p.stage === 'construction' ? `<button class="ghost" data-act="paper" data-id="${p.id}">${p.paperRatio > 0 ? '关闭商票支付' : `开启商票（工程款 ${pct(config.finance.channels.paper.maxOfBuildCost*(industryTight(s)?config.rivals.default.capacityFactor:1))}，${config.finance.channels.paper.termMonths} 个月兑付）`}</button>` : ''}
          ${p.stage === 'construction' && !p.acquisition && p.partnerShare === 0 && p.soldArea === 0 ? `<button class="ghost" data-act="cooperate" data-id="${p.id}">合作开发 · 出让 ${pct(config.cooperation.partnerShare)} 权益</button><span class="muted small">预计到账 ${yi((p.landPaid+p.buildSpent)*config.cooperation.partnerShare)}，须先结清项目融资</span>` : ''}
          <span class="small ${priceRestricted(s,config) && p.filedPrice === null ? 'warn-text' : 'muted'}">${priceRestricted(s,config) ? '当前处于限价期，未获备案暂停销售' : '当前不限价，可提前备案'} · ${p.filedPrice !== null ? `备案上限 ${(p.filedPrice*10000).toFixed(0)} 元/㎡` : '尚未备案'}</span>
          <button class="ghost" data-act="file" data-id="${p.id}" ${p.filingDueDay !== null ? 'disabled' : ''}>${p.filingDueDay !== null ? '备案审批中' : presaleBlocked(p)?'申请整改复审（恢复预售证）':`申请/更新限价备案（${config.filing.approvalMonths} 个月）`}</button>
          ${p.stoppedUntil > s.day ? `<span class="danger-text small">事故停工至第 ${calendar(config,p.stoppedUntil).year} 年 ${calendar(config,p.stoppedUntil).month} 月</span>` : ''}
          ${p.partnerShare === 0 && p.salesIn > p.escrowReleased && p.diverted === 0 ? `<button class="ghost danger-text" data-act="divert" data-id="${p.id}">挪用监管款 ${yi((p.salesIn-p.escrowReleased)*config.risk.diversionLimit)}</button><span class="warn-text small">违规：抽查将追缴、罚款，冻结新增融资。</span>` : ''}
          ${p.diverted > 0 ? `<span class="danger-text small">待处理挪用款 ${yi(p.diverted)}，无法转让项目</span>` : ''}
          <button class="ghost" data-act="sell" data-id="${p.id}">转让项目 · ${quote.net >= 0 ? `净回笼 ${yi(quote.net)}` : `需补付 ${yi(-quote.net)}`}</button>
          ${transferMarkup(config,s,p)}
        </div></details>
        ${p.landPaid < p.landCost ? `<span class="small warn-text">本公司土地尾款 ${yi((p.landCost - p.landPaid)*(1-p.partnerShare))}，${calendar(config, p.landDueDay).month} 月到期</span>` : ''}
      </article>`;
    })
    .join('')+rivalsPanel(config,s,selectedId);
}

export function auctionEstimateMarkup(config:Config,s:GameState,a:Parcel,offer:number,extra=0):string {
  const e=estimateLand(config,s,a,offer,'standard',extra);
  if(!e)return '<span class="muted small">输入符合起拍价、地价上限及配建范围的有效报价后显示估算。</span>';
  return `<div class="row between small"><b>拍地测算</b><span class="pill gray">估算</span></div>
    <div class="estimate-grid">
      <div><span>预期利润率</span><b class="${e.profit<0?'danger-text':'ok-text'}">${e.margin===null?'—':pct(e.margin,1)}</b></div>
      <div><span>资金峰值</span><b>${yi(e.peakFunding)}</b></div>
      <div><span>自有资金回正</span><b>${e.paybackMonths===null?'无法回正':e.paybackMonths+'个月'}</b></div>
    </div>
    <details class="estimate-notes" data-key="estimate-${a.id}"><summary>自有资金口径与假设</summary>
      <p>可售面积 ${(e.saleableArea/10000).toFixed(2)} 万㎡，已扣挂牌配建${extra>0?`及额外配建 ${pct(extra,1)}（按转入竞配建并中标估算，未转入则不承担额外配建）`:""}；全部建面计建安成本。按输入报价成交、独资、标准总包正常施工，不新增借款。按当前品牌与默认营销比例 ${pct(config.sales.marketingRate,1)} 估算去化，整个估算期保持不变。拿地后立即选定开工，下一月末付首笔工程款。资金峰值含保证金抵首付、土地尾款、工程款及税费；回正月数指自有资金累计收支月末转正且此后不再转负，中标当月计第1个月。</p>
      <p>按当前售价 ${(e.salePrice*10000).toFixed(0)} 元/㎡、每月销售剩余面积的 ${pct(e.monthlyAbsorption,1)} 估算；房价、片区购房政策、去化和监管维持当前水平，限价时及时备案，尾货按现行折价清盘。利润未计融资利息、意外支出及其他项目资金占用。</p>
    </details>`;
}

export function auctionsPanel(config: Config, s: GameState, selectedId: string | null,drafts:ReadonlyMap<string,string>=new Map(),amenityDrafts:ReadonlyMap<string,string>=new Map()): string {
  if (s.auctions.length === 0) return `<div class="empty">本季度没有待拍地块，下季度会有新地块挂牌。</div>`;
  return s.auctions
    .map((a) => {
      const d = district(config, a.districtId),banned=landBanUntil(s,a.districtId)>s.day;
      const days = a.endDay - s.day;
      const suggested = drafts.get(a.id)??((a.playerBid ?? Math.min(a.startPrice * 1.1,a.auction?.priceCap??Infinity)) / 10000).toFixed(a.auction?4:2);
      const buildArea = a.siteArea * a.far;
      const extraText=amenityDrafts.get(a.id)??String((a.playerAmenityRate??0)*100),atCap=Math.round(Number(suggested)*10000*1e6)/1e6===a.auction?.priceCap;
      return `<article class="card ${a.id === selectedId ? 'selected' : ''}" data-select="${a.id}">
        <div class="row between"><b>${esc(a.name)}</b><span class="small warn-text">${days} 天后开拍</span></div>
        <span class="muted small">占地 ${(a.siteArea / 10000).toFixed(1)} 万㎡ · 容积率 ${a.far} · 建面 ${(buildArea / 10000).toFixed(1)} 万㎡</span>
        <span class="muted small">起拍 ${yi(a.startPrice)} · 楼面价 ${((a.startPrice / buildArea) * 10000).toFixed(0)} 元/㎡ · 片区基准价 ${(marketPrice(config, s, d.id) * 10000).toFixed(0)} 元/㎡</span>
        <span class="small">${auctionTermsMarkup(a.auction,buildArea)}</span>${landBanMarkup(s,config,a.districtId)}${siteAttributesMarkup(a.attributes)}${housingPolicyMarkup(config,s,a.districtId)}
        ${a.auction?.priceCap!=null?`<button class="ghost" data-act="bid-cap" data-id="${a.id}">填入地价上限 ${(a.auction.priceCap/10000).toFixed(4)} 亿</button>`:''}
        <div class="row"><input type="number" min="0" step="0.0001" id="bid-${a.id}" data-estimate="${a.id}" value="${esc(suggested)}" aria-label="出价（亿）"><button data-act="bid" data-id="${a.id}" ${banned?'disabled':''}>${a.playerBid ? '改价' : '出价'}</button></div>
        ${a.auction?.kind==='amenity'?`<label class="small">额外保障房配建（计容建面 %）<input type="number" id="amenity-${a.id}" data-estimate="${a.id}" min="0" max="${config.auctions.maxAdditionalAmenityRate*100}" step="0.5" value="${esc(extraText)}" aria-label="额外配建（%）" ${atCap?'':'disabled'}></label><span class="small muted">达到地价上限才可承诺，最多 ${config.auctions.maxAdditionalAmenityRate*100}%；至少两家触顶才转竞配建，同额摇号。</span>`:''}
        ${a.playerBid ? `<span class="small ok-text">已出价 ${yi(a.playerBid)}，保证金 ${yi(a.deposit)} 已冻结${a.auction?.kind==='amenity'?`；额外配建承诺 ${pct(a.playerAmenityRate??0,1)}`:''}</span>` : `<span class="muted small">出价需缴保证金 ${yi(a.startPrice * config.land.depositRate)}</span>`}
        <span class="small muted">同行报名：${a.rivalBids?.length?a.rivalBids.map(b=>esc(s.rivals.find(r=>r.id===b.rivalId)?.name??b.rivalId)).join('、')+'（已缴保证金）':'暂无'}</span>
        <div class="bid-estimate" id="estimate-${a.id}" aria-live="polite">${auctionEstimateMarkup(config,s,a,Math.round(Number(suggested)*10000*1e6)/1e6,atCap?Number(extraText)/100:0)}</div>
      </article>`;
    })
    .join('');
}

export function newsLine(config: Config, s: GameState): string {
  return s.news
    .slice(0, 6)
    .map((n) => {
      const c = calendar(config, n.day);
      return `<span class="news ${n.kind}">【${c.year}年${c.month}月】${esc(n.text)}</span>`;
    })
    .join('<span class="sep">|</span>');
}
