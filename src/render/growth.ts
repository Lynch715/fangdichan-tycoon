// 城市自然生长：纯渲染层，由状态推导，不占用模拟地块、不改变随机数或存档。
// 城市化程度随年份和本图已交付建筑面积（本公司 + 同行）上升，空地从城市核心向外
// 依次长出低层住宅/商铺 → 写字楼/学校/轻轨站 → 高层塔楼。新地块挂牌时，覆盖处的
// 生长建筑自动让位（视作拆迁再开发）。
import { MAP_CORE, MAP_SIZE, terrainAt } from '../sim/map.ts';
import type { Tile } from '../sim/types.ts';

/** tier 0 = 城市公园（随城市化种上树木，永不建楼）。 */
export interface GrowthTile { i: number; j: number; key: string; tier: 0 | 1 | 2 | 3 }

/** 渲染参数（视觉节奏，不参与经济平衡）。 */
export const GROWTH = {
  base: 0.12,          // 开局即有的城市化
  perYear: 0.016,      // 每年自然增长
  perBuiltSqm: 1 / 2_500_000, // 每交付 1㎡ 建面带来的增长
  max: 0.92,
  tier2: 0.09,         // 超过阈值多少进入中等密度
  tier3: 0.2,          // 进入高层
  parkShare: 0.12,     // 约 12% 的陆地保留为公园绿地
};
const PARK = ['decor_trees_1x1_a', 'decor_tree_tall_1x1_a', 'decor_shrubs_1x1_a', 'decor_flowers_1x1_a', 'decor_trees_1x1_a', 'decor_bench_1x1_a'];

const LOW = ['background_walkup_1x1_a', 'background_walkup_1x1_b', 'background_walkup_1x1_c', 'background_shop_1x1_a'];
const MID = ['background_office_1x1_a', 'background_office_1x1_b', 'background_school_1x1_a', 'background_metro_1x1_a', 'background_office_1x1_a', 'background_metro_1x1_b'];
const HIGH = ['building_tower_2x2_a', 'building_tower_2x2_b', 'building_tower_2x2_c', 'building_commercial_2x2_a', 'building_tower_2x2_b', 'building_commercial_2x2_c'];

const hash01 = (i: number, j: number, salt: number) => (((Math.imul(i + 31 + salt, 2654435761) ^ Math.imul(j + 7, 40503) ^ Math.imul(salt + 3, 97)) >>> 0) % 10007) / 10007;
const SALT: Record<string, number> = { city: 1, outer: 2, suburb: 3 };

export function urbanization(years: number, builtSqm: number): number {
  return Math.min(GROWTH.max, GROWTH.base + GROWTH.perYear * Math.max(0, years) + GROWTH.perBuiltSqm * Math.max(0, builtSqm));
}

/** 每格的生长门槛：离核心越近越早长；带一点随机，避免同心圆。 */
export function growthThreshold(i: number, j: number, mapId: string): number {
  const [ci, cj] = MAP_CORE[mapId] ?? [MAP_SIZE / 2, MAP_SIZE / 2];
  const d = Math.hypot(i - ci, j - cj) / (MAP_SIZE * 0.75);
  return 0.62 * Math.min(1, d) + 0.38 * hash01(i, j, SALT[mapId] ?? 0);
}

/** isRoad 由地形层传入（道路保持道路）。occupied 为地块/项目/地标/老城建筑占用的格子。 */
export function growthTiles(mapId: string, u: number, occupied: ReadonlySet<string>, isRoad: (i: number, j: number) => boolean): GrowthTile[] {
  const out: GrowthTile[] = [];
  const salt = SALT[mapId] ?? 0;
  for (let i = 0; i < MAP_SIZE; i++) for (let j = 0; j < MAP_SIZE; j++) {
    if (terrainAt(i, j, mapId) !== 'land' || isRoad(i, j) || occupied.has(`${i},${j}`)) continue;
    const t = growthThreshold(i, j, mapId);
    if (t >= u) continue;
    const lead = u - t, pick = Math.floor(hash01(j, i, salt + 11) * 1000);
    if (hash01(i, j, salt + 29) < GROWTH.parkShare) { out.push({ i, j, tier: 0, key: PARK[pick % PARK.length] }); continue; }
    const tier: GrowthTile['tier'] = lead >= GROWTH.tier3 ? 3 : lead >= GROWTH.tier2 ? 2 : 1;
    // 远郊高层少一些，保留田园感
    const list = tier === 3 && mapId === 'suburb' && pick % 3 ? MID : tier === 3 ? HIGH : tier === 2 ? MID : LOW;
    out.push({ i, j, tier, key: list[pick % list.length] });
  }
  return out;
}

/** 本图已交付建筑面积（㎡）：已交付、清盘或出售的项目都算建成。 */
export function builtArea(projects: ReadonlyArray<{ deliveredDay: number | null; buildArea: number; districtId: string; tiles: ReadonlyArray<Tile> }>, onMap: (districtId: string) => boolean): number {
  let sqm = 0;
  for (const p of projects) if (p.deliveredDay !== null && onMap(p.districtId)) sqm += p.buildArea;
  return sqm;
}
