# 施工单最终验收索引

2026-10-26 · Codex。`AGENTS.md`中的A1–A8、B1–B14、C1–C2、D1–D3共27个主项已完成本地实现与验收；AGENTS与CLAUDE保持逐字节一致。此结论针对写入施工单的范围，不代表已上线或已核对仓库外未提供的完整设计规范。

## 当前验收

- 45个测试文件、374项回归通过；类型检查、生产构建通过。D3真实破产样本改为必然破产的固定种子后，10项专项复验通过，随后类型检查通过。
- D2两独立组各200局×30年（每组两策略）：激进破产31.0%/29.5%，收益中位为保守1.7992/1.6765倍，收益P10更低。全部样本包含破产局，收益＝净资产−初始资本。
- D3最终源码两策略各200局×30年，与D2第一组逐个失败种子及收益分位一致。激进62例触发支出全部可核对：本金52、利息/展期2、土地7、营销/税费1。下行回撤覆盖保守200/200、激进155/200；未到下行不填零。
- 81个唯一正式素材、原图及最终提示词齐全；art:check几何/视觉记录全部通过。@2x PNG共3288512字节（3.14MiB），小于8MiB；正式两档图集完整性与失败隔离回归通过。
- 新存档v16。D2冻结v15的24个文件、11份旧档完整状态；全套回归还覆盖此前各版冻结/迁移、原经济字段及同日新旧指令边界。旧历史不按新折价重算。

日志：`final-tests.txt`、`final-build.txt`、`final-d3-focused.txt`、`final-art-check.txt`。最终文件/清单/图集/缓存完整性记录在`final-audit.json`；D2/D3各有原始样本与独立审计JSON。

## 逐项证据

| 施工项 | 主要实现和证据 |
|---|---|
| A1 参考图 | `art/reference/README.md`、5份原始参考图；来源字节核对 |
| A2 处理管线 | `scripts/art-pipeline.ts`、`tests/art.test.ts`、`art/README.md` |
| A3 地形装饰 | `art/a3-progress.json`、`tests/terrain-art.test.ts`、`a3-desktop-1440.jpg`及移动截图 |
| A4 施工阶段 | [A4验收](A4-REPORT.md)、`tests/project-art.test.ts` |
| A5 成品/背景/围挡 | [A5验收](A5-REPORT.md)、`tests/appearance.test.ts` |
| A6 山城特色 | [A6验收](A6-REPORT.md)、`tests/landmark-art.test.ts` |
| A7 远郊 | [A7验收](A7-REPORT.md)、`tests/terrain-art.test.ts` |
| A8 性能/失败/离线 | [A8验收](A8-REPORT.md)、`tests/art-loading.test.ts`、`tests/offline.test.ts` |
| B1 拍地测算 | [B1验收](B1-REPORT.md)、`tests/land-estimate.test.ts` |
| B2 停工/接管 | [B2验收](B2-REPORT.md)、`tests/funding-stop.test.ts` |
| B3 总包/质量 | [B3验收](B3-REPORT.md)、`tests/contractor.test.ts` |
| B4 品牌/营销 | [B4验收](B4-REPORT.md)、`tests/marketing.test.ts` |
| B5 结算/报表/排名 | [B5验收](B5-REPORT.md)、[旧档回溯](B5e-REPORT.md)、[年末排名](B6d-REPORT.md) |
| B6 真实同行/暴雷/收购 | [B6b](B6b-REPORT.md)、[B6c](B6c-REPORT.md)、[B6d](B6d-REPORT.md)、rivals/acquisition/rankings测试 |
| B7 三种拍卖/配建 | [B7验收](B7-REPORT.md)、`tests/auctions.test.ts` |
| B8 公司债/提前到期 | [B8验收](B8-REPORT.md)、`tests/bonds.test.ts` |
| B9 片区/地块属性 | [B9验收](B9-REPORT.md)、`tests/regions.test.ts` |
| B10 违规查处 | [B10验收](B10-REPORT.md)、`tests/compliance.test.ts` |
| B11 片区政策 | [B11验收](B11-REPORT.md)、`tests/housing-policy.test.ts` |
| B12 战投/重组 | [B12验收](B12-REPORT.md)、`tests/capital.test.ts` |
| B13 模式/难度/三挑战 | [B13验收](B13-REPORT.md)、session-config/sessions测试、18份旧验收审计 |
| B14 转让负报价/交付后估算 | [B14验收](B14-REPORT.md)、`tests/transfer-estimate.test.ts`；新折价另由D2实测 |
| C1 发布工作流 | `.github/workflows/deploy.yml`；本地检查完成，远程执行尚未发生 |
| C2 发布/PWA安装文档 | README“发布到GitHub Pages”“添加到手机主屏幕”及官方来源链接 |
| D1 机器人工具 | [D1验收](D1-REPORT.md)、`tests/bots.test.ts`、6局真实日志完整审计 |
| D2 目标调参/旧档保护 | [D2验收](D2-REPORT.md)、balance-migration/legacy-v15-freeze测试及独立400种子验证 |
| D3 破产分布/下行回撤 | [D3验收](D3-REPORT.md)、`tests/balance-analysis.test.ts`、`d3-audit.json` |

上述报告保存各自完成时的测试数、配置和版本。以本页及D2/D3为当前状态；不改写历史基线来迎合新规则。

## 浏览器和发布边界

B13已在Codex In-app Browser完成正式开局/取消、三个挑战成功及失败、沙盒注资、旧档重载，以及桌面1440×900、390×844、320×740视口验收。B14完成同三视口的负报价说明、预计交付报价和实际转让。D2另在390×844验证v15迁移、新60%报价实际转让/导出/重载；截图`d2-migration-mobile.png`，现金与流水核对见`d2-browser-audit.json`。D3是只读离线统计，无新增浏览器界面。

A8曾在停止本地生产预览服务后完成离线重载与继续保存；本次D组没有重复完整离线实测。当前构建29个缓存文件，含全部9份图集清单/JSON/PNG。验收均为桌面浏览器及模拟手机视口，未做实体手机、微信或iPhone/Android系统级安装验收。

没有初始化Git、创建远程PR、推送或发布。C组完成的是工作流与说明；待用户建仓后运行远程Actions及上线验收。Vite保留主包超过500kB提示（当前约1125kB、gzip332kB），构建成功；冻结历史内核随版本增加而增大，未以改写历史换取减包。
