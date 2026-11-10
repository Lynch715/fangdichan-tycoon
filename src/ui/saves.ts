// 存档与读档：自动存档状态、3 个手动存档槽、存档文件导入导出。
// 槽位只存在本机浏览器（localStorage），内容就是导出存档同一份 JSON（种子 + 指令日志）。
import { calendar, computeMetrics, type Config, type GameState } from '../sim/index.ts';
import { esc, yi } from './format.ts';
import { creditsMarkup } from './credits.ts';
import {preserveRaw} from '../saveData.ts';

export const SLOT_COUNT = 3;
const slotKey = (n: number) => `fdc-slot-${n}`;

export interface SlotMeta { savedAt: string; company: string; date: string; equity: number; data: string; damaged?: boolean }

export function readSlot(n: number, store?: Pick<Storage, 'getItem'>): SlotMeta | null {
  let raw: string | null;
  try { raw = (store ?? localStorage).getItem(slotKey(n)); } catch { return null; }
  if (raw === null) return null;
  const broken: SlotMeta = { savedAt: '', company: '未知公司', date: '日期未知', equity: 0, data: raw, damaged: true };
  try {
    const v = JSON.parse(raw) as Partial<SlotMeta> | null;
    if (!v || typeof v !== 'object' || typeof v.data !== 'string') return broken;
    if (typeof v.savedAt !== 'string' || !Number.isFinite(Date.parse(v.savedAt)) || typeof v.company !== 'string' ||
        typeof v.date !== 'string' || typeof v.equity !== 'number' || !Number.isFinite(v.equity)) return { ...broken, data: v.data };
    return { savedAt: v.savedAt, company: v.company, date: v.date, equity: v.equity, data: v.data };
  } catch { return broken; }
}

export function slotMeta(config: Config, s: GameState, data: string, now = new Date()): SlotMeta {
  const c = calendar(config, s.day);
  return { savedAt: now.toISOString(), company: config.start.companyName, date: `第 ${c.year} 年 ${c.month} 月`, equity: computeMetrics(s).equity, data };
}

/** 写入失败（如浏览器存储已满或隐私模式）返回 false。 */
export function writeSlot(n: number, meta: SlotMeta, store?: Pick<Storage, 'getItem'|'setItem'>): boolean {
  try {
    store ??= localStorage;
    const old=store.getItem(slotKey(n));
    if(old!==null&&!preserveRaw('手动槽'+n,old,store))return false;
    store.setItem(slotKey(n), JSON.stringify(meta)); return true;
  } catch { return false; }
}

const when = (iso: string) => {
  const d = new Date(iso);
  const pad = (x: number) => String(x).padStart(2, '0');
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function savesMarkup(config: Config, s: GameState, storageStatus: string, slots: (SlotMeta | null)[]): string {
  const c = calendar(config, s.day);
  return `<div class="row between"><h2 id="saves-title">存档与读档</h2><button class="ghost" data-saves-close>关闭</button></div>
  <p data-save-feedback class="danger-text small" role="status" hidden></p>
  <section class="save-card auto"><div class="row between"><b>自动存档</b><span class="small ${/失败|不可用|需核对|尚未/.test(storageStatus) ? 'danger-text' : 'ok-text'}">${esc(storageStatus)}</span></div>
    <p class="small muted">每个游戏月、每次操作后自动保存到本机。当前：${esc(config.start.companyName)} · 第 ${c.year} 年 ${c.month} 月 · 净资产 ${yi(computeMetrics(s).equity)}</p></section>
  <h3 class="saves-sub">手动存档槽</h3>
  ${slots.map((m, i) => `<section class="save-card${m ? '' : ' empty'}">
    <div class="row between"><b>存档 ${i + 1}</b>${m ? `<span class="small muted">${m.damaged?'摘要不可用':`保存于 ${when(m.savedAt)}`}</span>` : '<span class="small muted">空</span>'}</div>
    ${m ? m.damaged ? '<p class="small danger-text">存档摘要损坏，原始内容已保留。可先导出原件，再尝试读取。</p>' : `<p class="small">${esc(m.company)} · ${esc(m.date)} · 净资产 ${yi(m.equity)}</p>` : '<p class="small muted">把当前进度存在这里，之后随时读回。</p>'}
    <div class="row"><button data-slot-save="${i + 1}">${m ? '覆盖保存' : '保存到此处'}</button>${m ? `<button class="ghost" data-slot-load="${i + 1}">${m.damaged?'尝试读取':'读取'}</button><button class="ghost" data-slot-export="${i + 1}">导出${m.damaged?'原件':'此档'}</button>` : ''}</div>
  </section>`).join('')}
  <h3 class="saves-sub">存档文件</h3>
  <p class="small muted">导出为文件可在别的设备或浏览器里继续玩。</p>
  <div class="row"><button class="ghost" data-act="export">导出存档文件</button><button class="ghost" data-act="import">从文件导入</button></div>
  <h3 class="saves-sub">开始新游戏</h3>
  <section class="save-card new-game"><p class="small muted">重新选择模式、难度和公司名称，从头经营。当前进度会被替换，建议先保存到上面的空槽。</p>
    <button data-saves-new>开始新游戏</button></section>
  ${creditsMarkup()}`;
}
