import { describe, expect, it } from 'vitest';
import { defaultConfig as c } from '../src/sim/index.ts';
import { runGame, conservative } from '../src/sim/bots.ts';
import { careerDialogMarkup, careerSummary, masterpiece, works } from '../src/ui/career.ts';

describe('公司履历（只读）', () => {
  const { state } = runGame(3, conservative, 12);
  it('作品集只含已交付项目，按交付先后排序；代表作是已结算利润最高者', () => {
    const ws = works(state);
    expect(ws.length).toBeGreaterThan(0);
    expect(ws.every(w => w.p.deliveredDay !== null)).toBe(true);
    for (let i = 1; i < ws.length; i++) expect(ws[i].p.deliveredDay!).toBeGreaterThanOrEqual(ws[i - 1].p.deliveredDay!);
    const best = masterpiece(ws);
    if (best) for (const w of ws) if (w.profit !== null && ['closed','sold'].includes(w.p.stage)) expect(best.profit!).toBeGreaterThanOrEqual(w.profit);
  });
  it('推导不改变状态', () => {
    const before = JSON.stringify(state);
    careerSummary(c, state); careerDialogMarkup(c, state, 'career', ''); careerDialogMarkup(c, state, 'works', '');
    expect(JSON.stringify(state)).toBe(before);
  });
  it('在售尾盘不提前计入已结算利润或已结算代表作',()=>{
    const ws=works(state), settled=ws.filter(w=>['closed','sold'].includes(w.p.stage));
    expect(careerSummary(c,state).closedProfit).toBeCloseTo(settled.reduce((n,w)=>n+(w.profit??0),0),6);
    const tail=ws.find(w=>w.p.stage==='delivered');
    if(tail){expect(masterpiece([{...tail,profit:Number.MAX_VALUE},...settled])?.p.stage).not.toBe('delivered');}
  });
  it('未满生涯年限显示进度，满年限给出评级', () => {
    expect(careerDialogMarkup(c, state, 'career', '')).toContain('生涯进度');
    const end = runGame(3, conservative, c.time.careerYears).state;
    expect(careerDialogMarkup(c, end, 'career', '', true)).toMatch(/grade-[SABCD]/);
    expect(careerDialogMarkup(c, state, 'works', '')).toContain('代表作');
  });
});
