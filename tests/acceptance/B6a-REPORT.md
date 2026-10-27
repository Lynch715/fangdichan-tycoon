# B6a 当前v6历史冻结（2026-10-26）

2026-10-26后续更新：v7迁移和真实账本/竞拍已在B6b接入，见[B6b-REPORT.md](B6b-REPORT.md)。下文保留冻结准备时的状态。

B6总项未完成。为新增真实开发商竞争前保留旧档历史，冻结B5e完工时的v6内核、配置、报表和旧版统计回溯，均位于src/legacy-v6/。

13个冻结文件：10个sim源码、config.json、去除存储代码的restore.ts、内部导入指向本冻结目录的legacy-reports.ts。旧v1–v5导入仍指向原冻结目录；没有依赖可变的当前sim、save或history实现。完整SHA256清单为src/legacy-v6/frozen-sha256.json。尚未改变当前存档版本（仍为6），尚未让NPC参与经营，也尚未接入该冻结目录到正式迁移路线。

新增4个完整状态哈希基线：v6已清盘、v6破产、v5迁入含完整回溯、v5边界后v6营销指令及续玩。检查全部经济及统计字段，不只比较现金。夹具为b6-v6-golden.json，生成脚本scripts/b6-legacy-fixtures.ts只用于首次冻结，禁止后续以新内核重写基线。

验证：`npm run typecheck && npm test && npm run build`通过，21文件167项。新增5项覆盖13文件冻结哈希/已有配置逐项保持和4档全部状态哈希、当前restore与冻结restore相等。此项不改变生产可达代码、配置或经营规则，沿用B5e的逐字节balance相同结果，不重复浏览器UI验收。

待续：B6b真实对手账本与竞拍、B6c违约冲击和收购、B6d年末历史排名（含B5d）、v7迁移以及全项回归/浏览器/批量验证。未发布。
