// 员工与人才市场弹窗、项目卡上的派驻信息。纯只读，按钮/下拉通过 data-* 交给 main.ts 发指令。
import { activeProject, postDef, postHolder, payroll, skillName, STAFF_POSTS, STAFF_SKILLS, type Config, type Employee, type GameState, type Project, type StaffPost, type StaffSkill } from '../sim/index.ts';
import { esc } from './format.ts';

const skillBar = (config: Config, e: Employee, k: StaffSkill) =>
  `<div class="skill ${k === e.specialty ? 'main' : ''}"><span>${skillName(config, k)}</span><i><b style="width:${e.skills[k]}%"></b></i><em>${e.skills[k]}</em></div>`;

export const postValue = (p: StaffPost | null) => (p ? ('projectId' in p ? `${p.slot}:${p.projectId}` : p.slot) : '');
export function parsePost(value: string): StaffPost | null {
  if (!value) return null;
  const [slot, projectId] = value.split(':');
  if (slot === 'pm' || slot === 'salesLead') return projectId ? { slot, projectId } : null;
  if (slot === 'cfo' || slot === 'pr') return { slot };
  return null;
}

export function postLabel(config: Config, s: GameState, p: StaffPost | null): string {
  if (!p) return '总部待命';
  const def = postDef(config, p.slot);
  if ('projectId' in p) return `${s.projects.find(x => x.id === p.projectId)?.name ?? p.projectId} · ${def.name}`;
  return `总部 · ${def.name}`;
}

function postOptions(config: Config, s: GameState, e: Employee): string {
  const opts: { value: string; label: string }[] = [{ value: '', label: '总部待命' }];
  for (const slot of STAFF_POSTS) {
    const def = postDef(config, slot);
    if (def.scope === 'hq') {
      const h = postHolder(s, slot);
      opts.push({ value: slot, label: `总部 · ${def.name}（${skillName(config, def.skill as StaffSkill)}）${h && h.id !== e.id ? ` · 现任 ${h.name}` : ''}` });
    }
  }
  for (const p of s.projects.filter(activeProject)) for (const slot of STAFF_POSTS) {
    const def = postDef(config, slot);
    if (def.scope !== 'project') continue;
    const h = postHolder(s, slot, p.id);
    opts.push({ value: `${slot}:${p.id}`, label: `${p.name} · ${def.name}（${skillName(config, def.skill as StaffSkill)}）${h && h.id !== e.id ? ` · 现任 ${h.name}` : ''}` });
  }
  const current = postValue(e.post);
  return opts.map(o => `<option value="${esc(o.value)}" ${o.value === current ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
}

/** 岗位效果说明（取自配置）。 */
function effectsMarkup(config: Config): string {
  const f = config.staff.effects;
  return `<ul class="small muted staff-effects">
    <li><b>项目经理</b>（工程）：能力 100 时施工速度 +${Math.round(f.pmSpeed * 100)}%、事故率 −${Math.round(f.pmAccidentCut * 100)}%，每月质量 +${f.pmQualityPerMonth} 分</li>
    <li><b>销售经理</b>（营销）：能力 100 时项目去化 +${Math.round(f.salesBoost * 100)}%</li>
    <li><b>财务总监</b>（财务）：能力 100 时新增融资利率 −${(f.cfoRateCut * 100).toFixed(1)}%</li>
    <li><b>公关总监</b>（公关）：能力 100 时每月监管关注度 −${f.prAttentionPerMonth}</li>
    <li>效果按能力等比例生效；在岗员工每月有机会成长 +1。月薪签约后固定。</li>
  </ul>`;
}

export function staffDialogMarkup(config: Config, s: GameState): string {
  const st = s.staff;
  const head = `<div class="row between"><h2 id="staff-title">员工与人才市场</h2><button class="ghost" data-staff-close>关闭</button></div>`;
  if (!st) return `${head}<p class="small muted">当前存档没有员工数据。</p>`;
  const dpm = config.time.daysPerMonth, nextRefresh = (Math.floor(s.day / dpm / config.staff.refreshMonths) + 1) * config.staff.refreshMonths + 1;
  const members = st.members.length ? st.members.map(e => `<article class="staff-card">
      <div class="row between"><b>${esc(e.name)} <span class="small muted">· ${skillName(config, e.specialty)}专长</span></b><span class="small">月薪 ${e.salary} 万</span></div>
      <div class="skills">${STAFF_SKILLS.map(k => skillBar(config, e, k)).join('')}</div>
      <label class="small">岗位 <select data-staff-post="${e.id}" aria-label="${esc(e.name)} 的岗位">${postOptions(config, s, e)}</select></label>
      <div class="row between small"><span class="muted">${e.post ? `在岗 ${e.monthsInPost} 个月` : '待命中，仍领薪'}</span><button class="mini" data-staff-fire="${e.id}">解雇（补偿 ${e.salary * config.staff.severanceMonths} 万）</button></div>
    </article>`).join('') : '<p class="small muted">还没有员工。从下方人才市场签约，再派驻到项目或总部岗位。</p>';
  const pool = st.pool.length ? st.pool.map(e => `<article class="staff-card cand">
      <div class="row between"><b>${esc(e.name)} <span class="small muted">· ${skillName(config, e.specialty)}专长</span></b><span class="small">月薪 ${e.salary} 万</span></div>
      <div class="skills">${STAFF_SKILLS.map(k => skillBar(config, e, k)).join('')}</div>
      <button data-staff-hire="${e.id}" ${s.cash < e.salary * config.staff.signingMonths ? 'disabled' : ''}>签约 · 签约费 ${e.salary * config.staff.signingMonths} 万</button>
    </article>`).join('') : '<p class="small muted">本期候选人已全部签约。</p>';
  return `${head}
  <p class="small">在职 ${st.members.length} 人 · 月薪合计 <b>${payroll(s)} 万元</b>（每回合月末发放，计入经营流水）</p>
  ${effectsMarkup(config)}
  <h3 class="saves-sub">在职员工</h3>${members}
  <h3 class="saves-sub">人才市场 <span class="small muted">· 第 ${nextRefresh} 回合刷新</span></h3>${pool}`;
}

/** 项目卡上一行：派驻的项目经理/销售经理。 */
export function projectStaffMarkup(config: Config, s: GameState, p: Project): string {
  if (!s.staff) return '';
  const cell = (slot: 'pm' | 'salesLead') => {
    const h = postHolder(s, slot, p.id), def = postDef(config, slot);
    return h ? `${def.name} <b>${esc(h.name)}</b>（${skillName(config, def.skill as StaffSkill)} ${h.skills[def.skill as StaffSkill]}）` : `${def.name} <span class="muted">空缺</span>`;
  };
  return `<div class="row between small staff-line"><span>${cell('pm')} · ${cell('salesLead')}</span><button class="mini" data-act="staff">派驻</button></div>`;
}
