// 产品线经济系数：项目开工时选定，缺省（含机器人与收购项目）按高层住宅基准，系数均为 1。
import type { Config } from './config.ts';
import type { BuildingProduct } from './types.ts';

export interface ProductTerms { name: string; costFactor: number; durationFactor: number; priceFactor: number; absorptionFactor: number; policySensitivity: number; note: string }
const BASE: ProductTerms = { name: '高层住宅', costFactor: 1, durationFactor: 1, priceFactor: 1, absorptionFactor: 1, policySensitivity: 1, note: '' };

export function productTerms(config: Config, product?: BuildingProduct): ProductTerms {
  if (!product) return BASE;
  return (config.products as Record<string, ProductTerms> | undefined)?.[product] ?? BASE;
}

/** 项目单价相对片区基准价的系数：地块景观/坡度 × 产品线。 */
export function projectPriceFactor(config: Config, p: { attributes?: { priceFactor: number }; product?: BuildingProduct }): number {
  return (p.attributes?.priceFactor ?? 1) * productTerms(config, p.product).priceFactor;
}
/** 产品线对购房政策需求系数的敏感度：factor^sensitivity。 */
export function productDemandFactor(config: Config, product: BuildingProduct | undefined, policyFactor: number): number {
  const t = productTerms(config, product);
  return t.absorptionFactor * policyFactor ** t.policySensitivity;
}
