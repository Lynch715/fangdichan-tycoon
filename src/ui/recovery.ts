import type {RecoveryRequest} from '../game.ts';
import {esc} from './format.ts';
import {calendar,defaultConfig} from '../sim/index.ts';
export function recoveryMarkup(request:RecoveryRequest):string{
 const date=calendar(defaultConfig,request.save.day);
 return `<div class="row between"><h2 id="recovery-title">核对旧存档</h2><button class="ghost" data-recovery-cancel>稍后处理</button></div>
 <p class="small">原始存档已保留，尚未替换进度。早期多个版本使用相同存档编号，需要先核对历史结果。</p>
 <p class="small muted">来源：${esc(request.source)} · 第${date.year}年${date.month}月${date.day}日。请选择与你原进度一致的现金和净资产；只有一项可读也不代表已经确认版本。</p>
 <form id="recovery-form" class="stack">
 ${request.previews.map(p=>`<label class="save-card recovery-choice"><span class="row"><input type="radio" name="history-profile" value="${esc(p.profile)}" ${p.error?'disabled':''}><b>${esc(p.label)}</b></span>
 ${p.error?`<span class="small danger-text">${esc(p.error)}</span>`:`<span class="small">现金 ${p.cash!.toFixed(2)} 万元<br>净资产 ${p.equity!.toFixed(2)} 万元</span>`}</label>`).join('')}
 <p class="small warn-text">若都与原进度不符，请导出原档，保留本次恢复；不要凭可读性猜选版本。曾跨多个旧版本续玩的存档可能需要进一步核对。</p>
 <button type="button" class="ghost" data-recovery-export>导出这份原始存档</button>
 <label class="small row recovery-check"><input type="checkbox" name="confirmed-history">我已核对，所选历史结果与原进度一致</label>
 <p class="danger-text small" data-recovery-error role="status"></p>
 <button type="submit" disabled>保留原档并创建续玩副本</button></form>`;
}
