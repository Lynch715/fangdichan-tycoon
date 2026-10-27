import { describe, expect, it } from 'vitest';
import { newGame, defaultConfig as c } from '../src/sim/index.ts';
import { setupMarkup } from '../src/ui/session.ts';
import { savesMarkup } from '../src/ui/saves.ts';

describe('制作人署名', () => {
  it('开局设置页与存档页都显示制作人和微信', () => {
    const setup = setupMarkup({ mode: 'career', difficulty: 'standard' }, false);
    const saves = savesMarkup(c, newGame(1, c), '已保存', [null, null, null]);
    for (const html of [setup, saves]) { expect(html).toContain('制作人：大老师'); expect(html).toContain('lynchrrr'); }
  });
});
