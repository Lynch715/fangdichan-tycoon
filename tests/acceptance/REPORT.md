# v0.2 施工与验收记录

> 本文为历史阶段记录。当前A–D施工单全项完成，最新状态见[最终验收索引](FINAL-REPORT.md)，下文参数、待办与测试数仅描述v0.2当时状态。

日期：2026-10-25；作者：Codex。本次按 AGENTS.md 的未实现列表完成本地可玩功能；未发布。

## 施工结果

| 清单项 | 落地与边界 |
|---|---|
| 商票 | 只支付已发生工程款；关联项目；到期现金兑付；负债表和到期预警计入 |
| 明股实债 | 24个月到期、评级利差；实质计入有息负债，不规避红线；抽查后披露并处罚 |
| 合作开发 | 预售前且无项目融资可入股；一次性30%权益；注资不凭空增加净资产，后续成本/回款按权益归属 |
| 违规与抽查 | 挪用监管款、关注度、追缴、罚款、融资冻结；不能通过转让逃避未处理挪用 |
| 限价备案 | 每次申请锁定申请日价格，30日批准；限价期无备案停售、按实际成交价计算去化 |
| 随机事件 | 建材涨价、事故支出与停工、配套利好；只使用状态内RNG，可回放 |
| 展期与出售 | 时间窗口、一次展期、费用和加息；转让清偿项目债务并移交资产/义务，负报价明确提示需补付 |
| 远郊地图 | 第3年开放璧山、江津；独立占地、不同地形、可拍地和开发 |
| 生成美术 | 内置 imagegen 编辑工具生成透明住宅贴图；竣工及交付项目使用，施工仍为程序式楼体/塔吊，纹理读取失败有占位回退 |
| PWA | manifest、192/512图标、20个产物全量预缓存、同代HTML/资源、缓存更新等待旧客户端关闭 |
| 存档补齐 | IndexedDB主存、localStorage备份、命令成功后保存、离开页面保存、导入导出、冻结v1内核迁移 |

完整的仓库外 Claude 设计规范未提供；本次采用下表中的可配置初值，未将其表述为对原规范逐条验收。

## 验证

- `npm run typecheck` 通过。
- `npm test`：33 项通过（原9项、新增24项）。新增覆盖融资/工程会计、兑付、合作、转让、备案、事故、抽查、展期、远郊、迁移、读写失败和缓存世代/静态资源匹配。
- `npm run build` 通过；构建自动生成20个文件的离线缓存清单。
- 新旧日志确定性回放通过。旧档先按冻结内核回放后核对现金、RNG、工程进度；同日新指令边界单独验证。
- Codex In-app Browser：1440×900桌面；390×844和320×740手机视口；融资输入、项目工具展开、商票开关、合作确认与资金到账、存档导入、竣工贴图、远郊切图、刷新续档。390和320视口文档宽度分别等于390和320，无横向溢出。
- 在独立的127.0.0.1测试端口首次联网缓存后，完全停止本地预览服务，重新加载页面仍有完整样式和地图，5.10亿现金/0.10亿信托存档恢复。首次测试发现缓存更新混代及`Vary: Origin`影响缓存命中，修复后复验通过。
- 应用内浏览器交互确认框曾导致工具聚焦超时，按文档恢复并通过原生回车完成测试，未切换到Chrome。
- 截图：desktop-1440.jpg、mobile-390.jpg、offline-restored.jpg。

## 平衡测试（固定1–200号种子，各30年）

标准脚本仍使用原保守/激进融资策略；补了限价期申请备案动作，使脚本能继续销售。未主动使用新商票、明股实债、合作、自救操作，以下不是所有新策略的收益结论。

| 指标 | v0.1保守 | v0.2保守 | v0.1激进 | v0.2激进 |
|---|---:|---:|---:|---:|
| 破产率 | 0.0% | 0.0% | 3.5% | 1.5% |
| 净资产P10（亿） | 59.6 | 57.2 | 117.9 | 173.7 |
| 净资产中位数（亿） | 81.7 | 72.6 | 182.1 | 251.8 |
| 净资产P90（亿） | 106.6 | 92.6 | 248.4 | 331.2 |
| 平均拿地数 | 39.8 | 42.2 | 209.6 | 376.3 |
| 破产年份中位数 | — | — | 6.3 | 6.5 |

新增远郊供地、备案和随机事件共同改变收益；不可把差异归因于单一参数。激进策略破产率仍偏低，尚未设定目标或单独完成平衡调优。

## 参数变化

原有经济参数未删除或直接调整；新增字段及片区如下。districts一行包含原片区新增mapId和两个新片区的完整数值。

| 配置键 | 旧值 | 新值 |
|---|---|---|
| `finance.channels.paper` | 无 | `{"name":"商票","rate":0,"termMonths":12,"maxOfBuildCost":0.5}` |
| `finance.channels.hidden` | 无 | `{"name":"明股实债","rate":0.15,"termMonths":24,"maxOfEquity":0.5}` |
| `finance.extension` | 无 | `{"months":6,"feeRate":0.02,"rateBump":0.02,"maxTimes":1,"windowMonths":6}` |
| `districts` | [{"id":"yuzhong","name":"渝中半岛","basePrice":2.0,"landShare":0.55,"far":4.0,"buildCostFactor":1.3},{"id":"jiangbei","name":"两江新区","basePrice":1.5,"landShare":0.45,"far":3.0,"buildCostFactor":1.0},{"id":"nanan","name":"南岸","basePrice":1.1,"landShare":0.3,"far":2.5,"buildCostFactor":1.1}] | `[{"id":"yuzhong","name":"渝中半岛","basePrice":2.0,"landShare":0.55,"far":4.0,"buildCostFactor":1.3,"mapId":"city"},{"id":"jiangbei","name":"两江新区","basePrice":1.5,"landShare":0.45,"far":3.0,"buildCostFactor":1.0,"mapId":"city"},{"id":"nanan","name":"南岸","basePrice":1.1,"landShare":0.3,"far":2.5,"buildCostFactor":1.1,"mapId":"city"},{"id":"bishan","name":"璧山","basePrice":0.8,"landShare":0.23,"far":2.2,"buildCostFactor":0.9,"mapId":"suburb"},{"id":"jiangjin","name":"江津","basePrice":0.7,"landShare":0.2,"far":2.0,"buildCostFactor":0.85,"mapId":"suburb"}]` |
| `cooperation` | 无 | `{"partnerShare":0.3}` |
| `risk` | 无 | `{"inspectionBase":0.04,"inspectionAttentionFactor":0.003,"diversionLimit":0.25,"diversionAttention":25,"fineRate":0.1,"hiddenAttention":15,"hiddenFineRate":0.03,"freezeMonths":3,"materialChance":0.04,"materialCostFactor":1.15,"accidentChance":0.015,"fastAccidentMultiplier":3,"accidentCostOfBuild":0.02,"accidentStopMonths":2,"demandChance":0.04,"demandBoost":1.25}` |
| `filing` | 无 | `{"restrictedPhases":["tightening","downturn"],"maxMarketFactor":0.95,"approvalMonths":1}` |
| `rescue` | 无 | `{"saleBookDiscount":0.8}` |
| `maps` | 无 | `{"suburbUnlockYear":3}` |

## 美术来源

方式：内置 imagegen 编辑工具（非 CLI），透明底输出，保留生成 alpha；1024×1536，alpha范围0–254。项目引用：`public/art/residential-tower-v2.png`。原图保留在项目上级`output/imagegen/residential-tower-2x2.png`，本次未覆盖。

最终提示词见 `tests/acceptance/residential-tower-v2-prompt.txt`。

## 尚未覆盖

- 实体手机、原生微信、iOS/Android系统主屏幕安装未测试；本次为浏览器视口与离线缓存测试。
- 美术接入范围为一栋可复用住宅；没有生成全套地形、施工阶段或城市背景建筑素材，背景建筑继续程序绘制。
- 激进策略风险偏低；未设定目标破产率，不声称已平衡。
- 当前目录没有`.git`或远程地址，未创建分支/PR，未提交或发布。构建产物在`dist/`。
