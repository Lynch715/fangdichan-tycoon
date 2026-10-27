// 所有数值都在 data/config.json 中，调数值不改代码。
import configJson from '../../data/config.json' with { type: 'json' };

export type Config = typeof configJson;
export type District = Config['districts'][number];
export type Phase = Config['cycle']['phases'][number];

export const defaultConfig: Config = configJson;

export function district(config: Config, id: string): District {
  const d = config.districts.find((x) => x.id === id);
  if (!d) throw new Error(`未知片区：${id}`);
  return d;
}
