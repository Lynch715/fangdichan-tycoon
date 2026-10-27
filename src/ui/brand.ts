// 品牌分阶段：只读展示，去化效果与内核 salesRate 的品牌系数一致。
import type { Config } from '../sim/index.ts';

export function brandTier(config: Config, brand: number) {
  const tiers = config.marketing.brandTiers;
  let level = 0;
  tiers.forEach((t, i) => { if (brand >= t.min) level = i; });
  const next = tiers[level + 1] ?? null;
  const effect = Math.max(0, 1 + (brand - config.marketing.neutralBrand) * config.marketing.brandSensitivity) - 1;
  return { level, name: tiers[level].name, next: next ? { name: next.name, gap: next.min - brand } : null, effect };
}

export function brandTileMarkup(config: Config, brand: number): string {
  const t = brandTier(config, brand), q = config.quality;
  const eff = `${t.effect >= 0 ? '+' : '−'}${Math.abs(t.effect * 100).toFixed(0)}%`;
  return `<div class="tile brand-tile"><span class="muted small">公司品牌 · ${t.name}</span><b class="mid">${brand} <small>/ 100</small></b>
    <div class="brand-meter" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, brand))}%"></span>${config.marketing.brandTiers.slice(1).map(x => `<i style="left:${x.min}%"></i>`).join('')}</div>
    <span class="small">去化 ${eff}${t.next ? ` · 再 +${t.next.gap} 分升「${t.next.name}」` : ' · 已是最高档'}</span>
    <span class="small muted">交付 +${q.deliveryBrandGain}，质量≥${q.excellentThreshold} 分 +${q.excellentBrandGain} · 维权 −${q.complaintBrandPenalty}</span></div>`;
}
