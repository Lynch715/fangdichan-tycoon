// 冻结的v2回放（含既有v1迁移链），仅导入路径调整；不读写存储。
import { newGame as legacyNew, applyCommand as legacyApply, stepDay as legacyStep } from '../legacy-v1/engine.ts';
import { replay, applyCommand, stepDay, defaultConfig, type GameState, type LoggedCommand } from './index.ts';
import {BUILDING_PRODUCTS,BUILDING_VARIANTS} from './types.ts';

export const SAVE_KEY = 'fdc-save-v1'; // 保留原键；读取旧档后迁移，成功保存前不删除原档。
export interface SaveData { version: 2; seed: number; day: number; log: LoggedCommand[]; legacyUntil?: number; legacyLogCount?: number; revision: number }
export function validateSave(value: unknown): SaveData | null {
  if(!value || typeof value !== 'object') return null;
  const s = value as SaveData;
  if(!Number.isInteger(s.seed) || !Number.isInteger(s.day) || s.day < 0 || !Array.isArray(s.log)) return null;
  if(s.version !== undefined && s.version !== 2) return null;
  let last = 0;
  for(const item of s.log) {
    if(!item || !Number.isInteger(item.day) || item.day < last || item.day > s.day || !item.command || typeof item.command.type !== 'string') return null;
    const cmd=item.command;
    if(!['bid','borrow','repay','setPace','setPrice','setPaper','cooperate','divert','filePrice','extend','sellProject','setAppearance'].includes(cmd.type))return null;
    if(cmd.type==='setAppearance'&&(!BUILDING_PRODUCTS.includes(cmd.product)||!BUILDING_VARIANTS.includes(cmd.variant)||typeof cmd.projectId!=='string'))return null;
    if('amount' in cmd && (!Number.isFinite(cmd.amount) || cmd.amount <= 0))return null;
    if(cmd.type === 'borrow' && !['devLoan','trust','hidden','paper'].includes(cmd.channel))return null;
    if(cmd.type === 'setPrice' && !Number.isFinite(cmd.priceFactor))return null;
    if(cmd.type === 'setPaper' && typeof cmd.enabled !== 'boolean')return null;
    last = item.day;
  }
  if(s.legacyUntil !== undefined && (!Number.isInteger(s.legacyUntil) || s.legacyUntil < 0 || s.legacyUntil > s.day || !Number.isInteger(s.legacyLogCount) || s.legacyLogCount! < 0 || s.legacyLogCount! > s.log.length)) return null;
  if(s.legacyUntil !== undefined && (s.log.slice(0,s.legacyLogCount).some(x=>x.day>s.legacyUntil!) || s.log.slice(s.legacyLogCount).some(x=>x.day<s.legacyUntil!)))return null;
  return {...s, version:2, revision: Number.isFinite(s.revision) ? s.revision : 0, ...(s.version === undefined ? {legacyUntil:s.day,legacyLogCount:s.log.length} : {})};
}
export function restore(s: SaveData): GameState {
  if(s.legacyUntil === undefined) return replay(s.seed,s.log,s.day);
  const old=legacyNew(s.seed);
  let oldIndex=0;
  const oldLog=s.log.slice(0,s.legacyLogCount);
  while(old.day <= s.legacyUntil) {
    while(oldIndex < oldLog.length && oldLog[oldIndex].day === old.day) {
      const result=legacyApply(old,oldLog[oldIndex++].command as Parameters<typeof legacyApply>[1]);
      if(!result.ok)throw new Error('旧存档指令无效');
    }
    if(old.day === s.legacyUntil)break;
    if(old.status === 'bankrupt')throw new Error('旧存档日期超过破产日期');
    legacyStep(old);
  }
  const state = old as unknown as GameState;
  state.version = 2; state.financeFrozenUntil = 0;
  for(const d of defaultConfig.districts) state.market.priceIndex[d.id] ??= 1;
  for(const p of state.projects) Object.assign(p,{paperRatio:0,partnerShare:0,diverted:0,stoppedUntil:0,filedPrice:null,filingPrice:null,filingDueDay:null});
  let k = s.legacyLogCount!;
  while(state.day <= s.day) {
    while(k < s.log.length && s.log[k].day === state.day) { const r=applyCommand(state,s.log[k++].command); if(!r.ok) throw new Error('存档指令无法回放'); }
    if(state.day === s.day) break;
    if(state.status === 'bankrupt') throw new Error('存档日期超过破产日期');
    stepDay(state);
  }
  state.pauses = [];
  return state;
}
