# B1 拍地测算验收

2026-10-25；Codex In-app Browser；独立来源http://localhost:5180/；原127.0.0.1来源的测试/用户进度未替换。

- 拍卖卡片在报价输入时立即更新三个指标，明确“估算”；显示自有资金回正而非融资后的杠杆回报。固定情景为按输入报价成交、独资正常施工、不新增借款、当前房价/去化/监管保持、及时备案、清盘折价。保证金抵首付，回正取持续非负的月末，中标当月第1月。
- L1报价4.50亿：利润率15.1%、资金峰值4.76亿、30个月回正；6.50亿：−7.7%、6.76亿、无法回正。空值显示有效报价提示；重新渲染仍保留4.50草稿。
- b1-before-quotes.json与b1-after-quotes.json仅revision8→9不同；seed/day/log等完全相同。点击出价后的b1-submitted-bid.json只有一条day0 bid L1 amount45000，现金相应缴保证金；未把后续5.00未提交草稿记为出价。
- 聚焦报价后加速推进，后续第1年4月1日官方季度暂停时，原L1已移除，输入仅L5/L6/L7；新季按新市场数据显示估算。未声称截图捕获精确开拍日时点。
- 1440×900、390×844、320×740实界面验收，假设文字能展开/滚动；两窄屏document.scrollWidth等于viewport宽，无横向溢出。warn/error为空。
- typecheck、72项Vitest、build通过；新增9项测算测试，包含独立手算、税费支付先于监管释放、晚付尾款导致再次转负等。balance前后字节相同，200局×30年保守0%/中位72.6亿，激进1.5%/中位251.8亿，无调参。
- 证据：b1-desktop-1440x900.png、b1-mobile-390x844.png、b1-mobile-320x740.png、b1-mobile-assumptions.png、b1-loss-estimate.png、b1-expired-auction.png及上述JSON与balance文本。

B1完成。B2–B14/C/D未完成；未做实体手机、Git初始化、PR或发布。
