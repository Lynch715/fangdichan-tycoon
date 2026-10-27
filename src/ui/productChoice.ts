// 开工前的产品线选择（界面临时状态，不进存档；开工时随 startProject 指令写入日志）。
import { BUILDING_PRODUCTS, type BuildingProduct, type Config, type Project } from '../sim/index.ts';
import { productTerms } from '../sim/products.ts';
import { appearanceOf } from '../appearance.ts';
import { esc } from './format.ts';

const picks = new Map<string, BuildingProduct>();
export const pickedProduct = (p: Project): BuildingProduct => picks.get(p.id) ?? appearanceOf(p).product;
export function pickProduct(id: string, product: BuildingProduct) { if (BUILDING_PRODUCTS.includes(product)) picks.set(id, product); }

const rel = (x: number) => x === 1 ? '基准' : `${x > 1 ? '+' : '−'}${Math.round(Math.abs(x - 1) * 100)}%`;

export function productPickerMarkup(config: Config, p: Project): string {
  const cur = pickedProduct(p), t = productTerms(config, cur);
  return `<div class="stack product-pick"><b class="small">产品线 · 开工后锁定</b>
    <div class="row">${BUILDING_PRODUCTS.map(k => `<button class="seg${k === cur ? ' on' : ''}" data-act="pick-product" data-id="${p.id}" data-product="${k}" aria-pressed="${k === cur}">${esc(productTerms(config, k).name)}</button>`).join('')}</div>
    <span class="small">单价 ${rel(t.priceFactor)} · 建安 ${rel(t.costFactor)} · 工期 ${rel(t.durationFactor)} · 去化 ${rel(t.absorptionFactor)} · 购房政策影响 ${t.policySensitivity === 1 ? '完整' : t.policySensitivity === 0 ? '不受' : `×${t.policySensitivity}`}</span>
    <span class="small muted">${esc(t.note)}</span></div>`;
}
