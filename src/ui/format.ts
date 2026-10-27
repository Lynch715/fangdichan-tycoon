export const yi = (wan: number, digits = 2) => `${(wan / 10000).toFixed(digits)} 亿`;
export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const ratio = (x: number) => (x >= 9.99 ? '—' : x.toFixed(2));

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
