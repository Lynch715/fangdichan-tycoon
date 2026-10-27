/** 制作人署名：开局设置页与存档页底部显示。 */
export const CREDITS = { producer: '大老师', wechat: 'lynchrrr' } as const;
export const creditsMarkup = () =>
  `<p class="credits">制作人：${CREDITS.producer}<span class="credits-sep">·</span>制作人微信：<b class="credits-id">${CREDITS.wechat}</b></p>`;
