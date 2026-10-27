// 重庆主城示意地图：长江与嘉陵江在渝中半岛交汇。16×16 格等距网格。
import type { Tile } from './types.ts';

export const MAP_SIZE = 16;

export type Terrain = 'river' | 'bridge' | 'hill' | 'land';

const isYangtze = (_i: number, j: number) => j === 11 || j === 12;
const isJialing = (i: number, j: number) => (i === 7 || i === 8) && j < 11;

export function terrainAt(i: number, j: number): Terrain {
  if ((isYangtze(i, j) && i === 4) || (isJialing(i, j) && j === 5)) return 'bridge';
  if (isYangtze(i, j) || isJialing(i, j)) return 'river';
  if (j >= 13 && i >= 10) return 'hill';
  return 'land';
}

export function districtAt(i: number, j: number): string | null {
  if (terrainAt(i, j) !== 'land') return null;
  if (i <= 6 && j <= 10) return 'yuzhong';
  if (i >= 9 && j <= 10) return 'jiangbei';
  if (j >= 13 && i <= 9) return 'nanan';
  return null;
}

/** 地图上已有的城市建筑（非玩家），h 为楼高（像素，仅用于渲染）。 */
export const backgroundBuildings: ReadonlyArray<{ i: number; j: number; h: number }> = [
  { i: 2, j: 2, h: 110 }, { i: 3, j: 4, h: 140 }, { i: 1, j: 6, h: 90 }, { i: 4, j: 1, h: 100 },
  { i: 5, j: 5, h: 120 }, { i: 2, j: 8, h: 80 }, { i: 5, j: 8, h: 70 }, { i: 3, j: 9, h: 60 },
  { i: 0, j: 4, h: 70 }, { i: 6, j: 2, h: 90 }, { i: 0, j: 1, h: 60 }, { i: 6, j: 9, h: 50 },
  { i: 13, j: 1, h: 50 }, { i: 14, j: 4, h: 45 }, { i: 10, j: 8, h: 70 }, { i: 12, j: 8, h: 55 },
  { i: 15, j: 8, h: 40 }, { i: 9, j: 9, h: 50 }, { i: 15, j: 2, h: 35 },
  { i: 1, j: 14, h: 50 }, { i: 3, j: 13, h: 60 }, { i: 6, j: 15, h: 40 }, { i: 7, j: 13, h: 55 }, { i: 0, j: 15, h: 35 },
];

export const tileKey = (i: number, j: number) => `${i},${j}`;

export function backgroundOccupied(): Set<string> {
  return new Set(backgroundBuildings.map((b) => tileKey(b.i, b.j)));
}

/** 返回指定片区内所有可用的 2×2 地块（以左上格表示）。 */
export function freeSites(districtId: string, occupied: Set<string>): Tile[] {
  const out: Tile[] = [];
  for (let i = 0; i < MAP_SIZE - 1; i++) {
    for (let j = 0; j < MAP_SIZE - 1; j++) {
      const cells: Tile[] = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
      const ok = cells.every(([a, b]) => districtAt(a, b) === districtId && !occupied.has(tileKey(a, b)));
      if (ok) out.push([i, j]);
    }
  }
  return out;
}

export function footprint(topLeft: Tile): Tile[] {
  const [i, j] = topLeft;
  return [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
}
