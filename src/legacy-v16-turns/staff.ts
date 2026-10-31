// 员工体系：人才市场、招聘/解雇/任命、月薪与能力成长，以及各岗位对经营的加成。
// 只作用于玩家公司；人才市场用独立随机流（state.staff.rng），不扰动主随机序列。
import type { Config } from './config.ts';
import { STAFF_POSTS, STAFF_SKILLS, type Command, type CommandResult, type Employee, type GameState, type Project, type StaffPost, type StaffSkill, type StaffSlot } from './types.ts';
import { streamInt, streamRandom, streamSeed } from './rng.ts';
import { activeProject } from './features.ts';
import { ledger } from './reporting.ts';

const STAFF_SALT = 0x57af;
type StaffConfig = Config['staff'];
type PostDef = StaffConfig['posts'][StaffSlot];

export const postDef = (c: Config, slot: StaffSlot): PostDef => c.staff.posts[slot];
export const skillName = (c: Config, skill: StaffSkill) => c.staff.roles[skill].name;

function addNews(s: GameState, text: string, warning = false) {
  s.news.unshift({ day: s.day, kind: warning ? 'warning' : 'company', text });
  if (s.news.length > 60) s.news.length = 60;
}

export function initStaff(s: GameState, c: Config) {
  if (s.opponentId || s.staff) return;
  s.staff = { rng: streamSeed(s.seed, STAFF_SALT), nextId: 0, pool: [], members: [], poolDay: s.day };
  refreshPool(s, c, false);
}

/** 月薪：主能力越高越贵，签约后固定。 */
export const salaryFor = (c: Config, main: number) => Math.round(c.staff.salaryBase + c.staff.salaryPerPoint * main);

function candidate(s: GameState, c: Config): Employee {
  const st = s.staff!, cfg = c.staff;
  const specialty = STAFF_SKILLS[streamInt(st, 0, STAFF_SKILLS.length - 1)];
  const star = streamRandom(st) < cfg.starRate;
  const [lo, hi] = star ? cfg.starSkillRange : cfg.mainSkillRange;
  const skills = Object.fromEntries(STAFF_SKILLS.map(k => [k, streamInt(st, cfg.otherSkillRange[0], cfg.otherSkillRange[1])])) as Record<StaffSkill, number>;
  skills[specialty] = streamInt(st, lo, hi);
  const name = cfg.surnames[streamInt(st, 0, cfg.surnames.length - 1)] + cfg.givenNames[streamInt(st, 0, cfg.givenNames.length - 1)];
  st.nextId += 1;
  return { id: `S${st.nextId}`, name, specialty, skills, salary: salaryFor(c, skills[specialty]), post: null, hiredDay: -1, monthsInPost: 0 };
}

export function refreshPool(s: GameState, c: Config, announce = true) {
  const st = s.staff;
  if (!st) return;
  st.pool = Array.from({ length: c.staff.poolSize }, () => candidate(s, c));
  st.poolDay = s.day;
  if (announce) {
    const best = st.pool.reduce((a, b) => (b.skills[b.specialty] > a.skills[a.specialty] ? b : a));
    addNews(s, `人才市场更新 ${st.pool.length} 位候选人，最高为${skillName(c, best.specialty)}能力 ${best.skills[best.specialty]} 的 ${best.name}`);
  }
}

const samePost = (a: StaffPost, b: StaffPost) => a.slot === b.slot && ('projectId' in a ? 'projectId' in b && a.projectId === b.projectId : true);

/** 某岗位当前在任员工。 */
export function postHolder(s: Pick<GameState, 'staff'>, slot: StaffSlot, projectId?: string): Employee | undefined {
  return s.staff?.members.find(m => m.post && m.post.slot === slot && (projectId === undefined || ('projectId' in m.post && m.post.projectId === projectId)));
}

const skillOf = (s: Pick<GameState, 'staff'>, slot: StaffSlot, c: Config, projectId?: string) => {
  const m = postHolder(s, slot, projectId);
  return m ? m.skills[postDef(c, slot).skill as StaffSkill] / 100 : 0;
};

// ── 岗位效果（无人任职时为中性值） ──
export const pmSpeedFactor = (s: GameState, c: Config, p: Project) => 1 + c.staff.effects.pmSpeed * skillOf(s, 'pm', c, p.id);
export const pmAccidentFactor = (s: GameState, c: Config, p: Project) => 1 - c.staff.effects.pmAccidentCut * skillOf(s, 'pm', c, p.id);
export const pmQualityGain = (s: GameState, c: Config, p: Project) => c.staff.effects.pmQualityPerMonth * skillOf(s, 'pm', c, p.id);
export const staffSalesFactor = (s: GameState, c: Config, p: Project) => 1 + c.staff.effects.salesBoost * skillOf(s, 'salesLead', c, p.id);
export const cfoRateCut = (s: GameState, c: Config) => c.staff.effects.cfoRateCut * skillOf(s, 'cfo', c);
export const prAttentionCut = (s: GameState, c: Config) => c.staff.effects.prAttentionPerMonth * skillOf(s, 'pr', c);

export const payroll = (s: Pick<GameState, 'staff'>) => (s.staff?.members ?? []).reduce((n, m) => n + m.salary, 0);

export function staffCommand(s: GameState, cmd: Command, c: Config): CommandResult | null {
  if (cmd.type !== 'hireStaff' && cmd.type !== 'fireStaff' && cmd.type !== 'assignStaff') return null;
  if (s.opponentId) return { ok: false, error: '同行账本不支持员工指令' };
  initStaff(s, c);
  const st = s.staff!;
  if (cmd.type === 'hireStaff') {
    const cand = st.pool.find(x => x.id === cmd.candidateId);
    if (!cand) return { ok: false, error: '候选人已不在人才市场' };
    const fee = cand.salary * c.staff.signingMonths;
    if (s.cash < fee) return { ok: false, error: `现金不足以支付签约费 ${fee} 万元` };
    s.cash -= fee; ledger(s, 'salary', -fee);
    st.pool = st.pool.filter(x => x !== cand);
    st.members.push({ ...cand, hiredDay: s.day, post: null, monthsInPost: 0 });
    addNews(s, `签约${skillName(c, cand.specialty)}人才 ${cand.name}（能力 ${cand.skills[cand.specialty]}），月薪 ${cand.salary} 万元，签约费 ${fee} 万元`);
    return { ok: true };
  }
  const m = st.members.find(x => x.id === cmd.staffId);
  if (!m) return { ok: false, error: '找不到这名员工' };
  if (cmd.type === 'fireStaff') {
    const fee = m.salary * c.staff.severanceMonths;
    if (s.cash < fee) return { ok: false, error: `现金不足以支付补偿金 ${fee} 万元` };
    s.cash -= fee; ledger(s, 'salary', -fee);
    st.members = st.members.filter(x => x !== m);
    addNews(s, `与 ${m.name} 解除劳动合同，支付补偿金 ${fee} 万元`);
    return { ok: true };
  }
  const post = cmd.post;
  if (post === null) { m.post = null; m.monthsInPost = 0; return { ok: true }; }
  if (!STAFF_POSTS.includes(post.slot)) return { ok: false, error: '岗位无效' };
  const def = postDef(c, post.slot);
  if (def.scope === 'project') {
    if (!('projectId' in post)) return { ok: false, error: '项目岗位需要指定项目' };
    const p = s.projects.find(x => x.id === post.projectId);
    if (!p || !activeProject(p)) return { ok: false, error: '只能派驻到经营中的项目' };
  } else if ('projectId' in post) return { ok: false, error: '总部岗位不对应项目' };
  if (m.post && samePost(m.post, post)) return { ok: true };
  const clean: StaffPost = def.scope === 'project' && 'projectId' in post ? { slot: post.slot as 'pm' | 'salesLead', projectId: post.projectId } : { slot: post.slot as 'cfo' | 'pr' };
  for (const other of st.members) if (other !== m && other.post && samePost(other.post, clean)) { other.post = null; other.monthsInPost = 0; }
  m.post = clean; m.monthsInPost = 0;
  return { ok: true };
}

/** 月末：项目退出经营则撤岗、发工资、在岗成长、公关降关注度、按期刷新人才市场。 */
export function staffMonthEnd(s: GameState, c: Config, monthIndex: number) {
  if (s.opponentId) return;
  initStaff(s, c);
  const st = s.staff!;
  for (const m of st.members) {
    if (m.post && 'projectId' in m.post) {
      const pid = m.post.projectId, p = s.projects.find(x => x.id === pid);
      if (!p || !activeProject(p)) { addNews(s, `${p?.name ?? '项目'} 已退出经营，${m.name} 回到总部待命`); m.post = null; m.monthsInPost = 0; }
    }
  }
  const pay = payroll(s);
  if (pay > 0) { s.cash -= pay; ledger(s, 'salary', -pay); }
  const cut = prAttentionCut(s, c);
  if (cut > 0) s.attention = Math.max(0, s.attention - cut);
  for (const m of st.members) {
    if (!m.post) continue;
    m.monthsInPost += 1;
    const skill = postDef(c, m.post.slot).skill as StaffSkill, v = m.skills[skill];
    if (v < c.staff.skillCap && streamRandom(st) < c.staff.growthChance * (1 - v / (c.staff.skillCap + 10))) {
      m.skills[skill] = Math.min(c.staff.skillCap, v + 1);
      if (m.skills[skill] % 10 === 0) addNews(s, `${m.name} 在${postDef(c, m.post.slot).name}岗位上成长，${skillName(c, skill)}能力达到 ${m.skills[skill]}`);
    }
  }
  if (monthIndex % c.staff.refreshMonths === 0) refreshPool(s, c);
}
