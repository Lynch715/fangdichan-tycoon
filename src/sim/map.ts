// 重庆主城示意地图：长江与嘉陵江在渝中半岛交汇。24×24 格等距网格（2026-10-27 由 16×16 放大）。
import type { Tile } from './types.ts';

export const MAP_SIZE = 24;

export type Terrain = 'river' | 'bridge' | 'hill' | 'land';

const isYangtze = (_i: number, j: number) => j === 17 || j === 18;
const isJialing = (i: number, j: number) => (i === 11 || i === 12) && j < 17;
/** 长江两座大桥、嘉陵江一座大桥（与地标素材位置一致）。 */
const YANGTZE_BRIDGES = [6, 16];
const JIALING_BRIDGE = 8;

export function terrainAt(i: number, j: number, mapId = 'city'): Terrain {
  if (mapId === 'outer') {
    if (j === 12 || j === 13) return i === 8 ? 'bridge' : 'river';
    if ((i >= 17 && j >= 17) || (i >= 18 && j <= 5)) return 'hill';
    return 'land';
  }
  if (mapId === 'suburb') {
    if (j === 11 || j === 12) return i === 8 ? 'bridge' : 'river';
    if (i >= 18 && j >= 15) return 'hill';
    return 'land';
  }
  if ((isYangtze(i, j) && YANGTZE_BRIDGES.includes(i)) || (isJialing(i, j) && j === JIALING_BRIDGE)) return 'bridge';
  if (isYangtze(i, j) || isJialing(i, j)) return 'river';
  if (j >= 20 && i >= 15) return 'hill';
  return 'land';
}

export function districtAt(i: number, j: number, mapId = 'city'): string | null {
  if (mapId === 'outer') return terrainAt(i, j, mapId) === 'land' ? 'outer' : null;
  if (mapId === 'suburb') return terrainAt(i, j, mapId) === 'land' ? (j < 11 ? 'bishan' : 'jiangjin') : null;
  if (terrainAt(i, j) !== 'land') return null;
  if (i <= 10 && j <= 16) return 'yuzhong';
  if (i >= 13 && j <= 16) return 'jiangbei';
  if (j >= 19 && i <= 14) return 'nanan';
  return null;
}

/** 地图上已有的老城建筑（非玩家，占用地块），h 为楼高（像素，仅用于程序回退渲染）。 */
export const backgroundBuildings: ReadonlyArray<{ i: number; j: number; h: number }> = [
  { i: 3, j: 3, h: 110 }, { i: 4, j: 6, h: 140 }, { i: 1, j: 9, h: 90 }, { i: 7, j: 1, h: 100 },
  { i: 8, j: 7, h: 120 }, { i: 3, j: 12, h: 80 }, { i: 7, j: 12, h: 70 }, { i: 4, j: 14, h: 60 },
  { i: 0, j: 6, h: 70 }, { i: 9, j: 3, h: 90 }, { i: 0, j: 1, h: 60 }, { i: 9, j: 14, h: 50 },
  { i: 19, j: 1, h: 50 }, { i: 21, j: 6, h: 45 }, { i: 15, j: 12, h: 70 }, { i: 18, j: 12, h: 55 },
  { i: 23, j: 12, h: 40 }, { i: 13, j: 14, h: 50 }, { i: 22, j: 3, h: 35 },
  { i: 1, j: 21, h: 50 }, { i: 4, j: 20, h: 60 }, { i: 9, j: 23, h: 40 }, { i: 10, j: 20, h: 55 }, { i: 0, j: 23, h: 35 },
];

export const tileKey = (i: number, j: number) => `${i},${j}`;

export function backgroundOccupied(mapId = 'city'): Set<string> {
  return new Set((mapId === 'city' ? backgroundBuildings : []).map((b) => tileKey(b.i, b.j)));
}

/** 返回指定片区内所有可用的 2×2 地块（以左上格表示）。 */
export function freeSites(districtId: string, occupied: Set<string>, mapId = 'city'): Tile[] {
  const out: Tile[] = [];
  for (let i = 0; i < MAP_SIZE - 1; i++) {
    for (let j = 0; j < MAP_SIZE - 1; j++) {
      const cells: Tile[] = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
      const ok = cells.every(([a, b]) => districtAt(a, b, mapId) === districtId && !occupied.has(tileKey(a, b)));
      if (ok) out.push([i, j]);
    }
  }
  return out;
}

export function footprint(topLeft: Tile): Tile[] {
  const [i, j] = topLeft;
  return [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
}

/** 每张地图的城市核心（城市化从这里向外扩散，仅用于渲染）。 */
export const MAP_CORE: Readonly<Record<string, Tile>> = { city: [9, 15], outer: [8, 11], suburb: [8, 10] };
