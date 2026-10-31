export const yi = (wan: number, digits = 2) => `${(wan / 10000).toFixed(digits)} 亿`;
export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const ratio = (x: number) => (x >= 9.99 ? '—' : x.toFixed(2));

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** 小额按万元显示，避免正回款被舍入为零亿。 */
export const money = (wan: number) => Math.abs(wan) < 1000 ? `${Math.round(wan)} 万` : yi(wan);
