// 季节与季节/政策随机事件：回合（月）末抽取，作用于下一个月的结算。
// 用独立随机流（state.seasons.rng），不扰动主随机序列；事件挂在共享的 market 上，同行同样受影响。
import type { Config } from './config.ts';
import type { ActiveSeason, GameState } from './types.ts';
import { streamRandom, streamSeed } from './rng.ts';

export type SeasonInfo = Config['seasons']['list'][number];
export type SeasonEventDef = Config['seasons']['events'][number];

const SEASON_SALT = 0x5ea5;

/** monthIndex 从 0 起；第 0 个月是 1 月。 */
export function seasonOf(config: Config, monthIndex: number): SeasonInfo {
  const month = (monthIndex % 12) + 1;
  return config.seasons.list.find(s => s.months.includes(month)) ?? config.seasons.list[0];
}

export function initSeasons(state: GameState, config: Config) {
  if (state.opponentId) return;
  state.seasons ??= { rng: streamSeed(state.seed, SEASON_SALT) };
  if (!state.market.season) rollSeason(state, config, Math.floor(state.day / config.time.daysPerMonth), false);
}

/** 为第 monthIndex 个月抽取季节事件（每月至多一个）。applyAttention：事件触发时一次性计入关注度。 */
export function rollSeason(state: GameState, config: Config, monthIndex: number, applyAttention = true) {
  const stream = state.seasons ??= { rng: streamSeed(state.seed, SEASON_SALT) };
  const season = seasonOf(config, monthIndex);
  let r = streamRandom(stream);
  let picked: SeasonEventDef | null = null;
  for (const e of config.seasons.events) {
    if (e.season !== season.id) continue;
    if (r < e.chance) { picked = e; break; }
    r -= e.chance;
  }
  const active: ActiveSeason = {
    month: monthIndex, seasonId: season.id, seasonName: season.name,
    eventId: picked?.id ?? null, name: picked?.name ?? null, kind: picked?.kind === 'policy' ? 'policy' : 'season', text: picked?.text ?? null,
    sales: season.sales * (picked?.sales ?? 1), build: season.build * (picked?.build ?? 1),
    cost: picked?.cost ?? 1, rate: picked?.rate ?? 0,
  };
  state.market.season = active;
  if (picked) {
    if (applyAttention && picked.attention) state.attention = Math.max(0, Math.min(100, state.attention + picked.attention));
    state.news.unshift({ day: state.day, kind: picked.kind === 'policy' ? 'policy' : 'market', text: `【${season.name}季·${picked.name}】${picked.text}（${applyAttention?'下回合':'本回合'}生效）` });
    if (state.news.length > 60) state.news.length = 60;
  }
}

/** 当月季节系数；旧状态或同行子账本无事件时取中性值。 */
export const seasonSales = (s: Pick<GameState, 'market'>) => s.market.season?.sales ?? 1;
export const seasonBuild = (s: Pick<GameState, 'market'>) => s.market.season?.build ?? 1;
export const seasonCost = (s: Pick<GameState, 'market'>) => s.market.season?.cost ?? 1;
export const seasonRate = (s: Pick<GameState, 'market'>) => s.market.season?.rate ?? 0;
