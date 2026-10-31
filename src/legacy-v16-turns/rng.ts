// 种子随机数（mulberry32）。状态存放在 GameState.rng 里，保证同种子同指令 = 同结果。
import type { GameState } from './types.ts';

export function nextRandom(state: GameState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomRange(state: GameState, min: number, max: number): number {
  return min + (max - min) * nextRandom(state);
}

export function randomInt(state: GameState, min: number, maxInclusive: number): number {
  return Math.floor(randomRange(state, min, maxInclusive + 1));
}

/** 独立随机流：季节事件、人才市场各用自己的状态，不扰动主随机序列（同行、拍地、事故等结果不变）。 */
export interface RandomStream { rng: number }
export function streamRandom(stream: RandomStream): number {
  let t = (stream.rng = (stream.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const streamInt = (s: RandomStream, min: number, maxInclusive: number) => Math.floor(min + (maxInclusive + 1 - min) * streamRandom(s));
/** 由主种子派生子流种子（与主流错开）。 */
export const streamSeed = (seed: number, salt: number) => (Math.imul(seed ^ salt, 0x9e3779b1) ^ salt) | 0;
