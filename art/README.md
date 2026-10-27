# 美术素材工作目录

- `reference/`：固定风格和占地参考图；生图必须引用这里的文件。
- `raw/`：生成原图；顶层文件由 `manifest.json` 明确列入构建，`raw/rejected/` 保留未通过几何门槛的历史样本。
- `prompts/`：每个正式素材对应的最终提示词。
- `manifest.json`：素材 ID、文件名、占地格数与类别；地形侧面厚度可填 `sideHeightRatio`，装饰物可声明其参考地面菱形 `ground`。

运行 `npm run art`，输出 `public/art/atlas@1x-N.png/json`、`atlas@2x-N.png/json` 及诊断清单。每格逻辑尺寸128×64，@2x实图256×128；JSON中`meta.scale`与分辨率对应，Pixi直接解析后尺寸相同，锚点为地面菱形下顶点。

底座通过alpha轮廓前两条边回归检测。偏离2:1超过5%、两边不对称或边缘不清晰时失败；小于5%的偏差在缩放时归一化。建筑总高超过占地宽1.3倍时拒绝。支持透明alpha和纯洋红底，并清理混色边缘；不接受白底或黑底素材。

图集分页上限2048×2048，帧间留透明隔离边，@2x PNG合计不得超过8MB。完整验证在写入前完成；不合规原图不会覆盖已有图集。图集JSON保留默认锚点，渲染层按屏幕像素密度选择@1x或@2x，读取失败回到程序绘制。

旧`residential-tower-v2.png`底座约1.79:1，超过容差，已作为拒绝样本保留；经过三次内置imagegen生成/修正，正式住宅`building_tower_2x2_a.png`底座检测为1.9721:1，通过门槛。原有公共PNG保留，但渲染改为读取规范图集。

A3施工清单为`catalog-a3.json`（31张地形、8个装饰物），`node scripts/art-status.ts`会逐张检查已经存在的原图并更新`a3-progress.json`；几何通过且 `reviews-a3.json` 中同一 SHA-256 原图有人工视觉通过记录的素材才进入正式manifest。新生成/替换图片会自动转为待复核，不沿用旧图的验收记录。地形先从底部轮廓推断真实侧面厚度，再把侧面独立缩放到@2x32像素；保持顶面2:1与地面下顶点锚点，不把原图侧面厚度直接假定成目标厚度。

A3已完成39/39。运行 `npm run art:check` 更新状态，`npm run art:gallery` 生成 `tests/acceptance/a3-gallery.html`，通过本地HTTP打开可切换@1x/@2x、检查底座锚点及5×5连续铺设/侧面堆叠。验收截图为 `tests/acceptance/a3-desktop-1440.jpg`、`a3-mobile-390.jpg`，另有装饰/地形画廊截图。

A4清单为 `catalog-a4.json`，含洋房成品参考与两产品线各5张施工阶段图；`reviews-a4.json` 和 `a4-progress.json` 采用同一套原图哈希/视觉/几何审核。`npm run art:check` 自动检查已存在的A3–A6清单。进度纯显示阈值：<8%基坑、8%–25%正负零、25%–80%主体、≥80%封顶；完成后用成品。未选择外观的项目按片区默认选择（渝中/江北高层；南岸/远郊洋房），A5增加项目外观选择，不改变经济规则。烂尾图已备齐，实际触发在B2。

A4验收入口：`tests/acceptance/a4-gallery.html`（两条产品线相同占地/缩放并排对照）、`tests/acceptance/a4-map.html`（正式存档校验/回放与正式IsoMap，读取合法种子+指令测试档）。只能通过HTTP打开。桌面1440×900与手机390×844截图为 `a4-desktop-1440.jpg`、`a4-mobile-390.jpg`，阶段实际地图对照为 `a4-map-contact.png`；全游戏洋房成品截图为 `a4-game-completed-desktop.jpg`。均在 `tests/acceptance/`。


A5已完成26/26：四产品线各3个成品变体（含A2/A4原有2张）；10个单格城市背景建筑；待拍/围挡各2×2和3×3两种尺寸。清单、视觉记录、状态为 `catalog-a5.json`、`reviews-a5.json`、`a5-progress.json`，最终原图与提示词同名保存在raw/prompts。当前正式图集75个唯一素材，@2x PNG合计2929465字节。

项目面板的“建筑外观”通过setAppearance指令选择产品线与变体并持久化；纯视觉，不改变经济参数或随机数。未指定外观的旧存档保持原片区默认；别墅/商业施工阶段复用洋房五阶段。背景按原24个单格位置轮用10个图；地块按真实占地缩放，老清盘楼遇新地块/项目覆盖时隐藏，避免从透明施工图露出。land阶段显示围挡；当前自动开工流程直接进入施工，B3将接入开工选择。

A5验收入口 `tests/acceptance/a5-gallery.html` 可筛成品/背景/地块并切换@1x/@2x；`a5-map.html`通过合法存档回放和正式指令切换12种成品。报告 `A5-REPORT.md`，桌面/手机实景 `a5-desktop-1440x900.png`、`a5-mobile-390x844.png`，项目选择界面 `a5-mobile-appearance.png`，实际地图12种成品对照 `a5-map-products-contact.png`。以上在tests/acceptance。完整失败回退、密度和离线验证仍在A8统一验收。


A6已完成6/6：两组2×2吊脚楼、两方向2×2大桥、2×2索道与2×2步道，catalog/reviews/a6-progress采用同样几何和哈希绑定视觉门槛。主城六处均位于河道/山地，远郊拱桥复用；不改变模拟可开发区域和经济规则。桥面在2×2水面地块的首行/首列，与既有一格宽道路对齐；原桥梁格仅在大桥贴图可用时换成底层水面，缺图沿用原桥梁。山地地标下的视觉平台统一到对应2/3层，装饰避让地标，正常深度排序。其他地标也具备程序回退，A8统一验收失效场景。

图集现81唯一素材，@2x合计3288512字节。`a6-gallery.html`支持山城特色筛选及@1x/@2x统一比例锚点比较；`a6-map.html`通过正式IsoMap读取合法回放存档，并提供主城/远郊切换。`A6-REPORT.md`、`a6-gallery-1x.png`/`a6-gallery-2x.png`、`a6-map-city.png`/`a6-map-suburb.png`、`a6-desktop-1440x900.png`/`a6-mobile-390x844.png`在tests/acceptance。


A7远郊复用同一81素材图集，不新增图。非道路平地以草地/暖土替代城区铺装，按草木/土壤/道路分别着色；水面/桥体不着色，主城原色不变。仅改渲染选择和颜色，不改地块可开发范围/参数。`tests/acceptance/a7-map.html`读取合法种子/指令日志，切换璧山/江津施工与成品并对照主城；`a7-suburb-840.json`/`a7-suburb-1500.json`为回放存档，`A7-REPORT.md`、`a7-*.png`为验收报告和桌面/手机证据。


A8已完成。默认按devicePixelRatio选择@1x（≤1）或@2x（>1），只加载当前档位；81素材两档齐全，@2x3288512字节<8MiB。每页独立捕获失败，失败页对象走程序绘制，健康页不丢失。程序地形保留高差、道路和远郊色调；树/岩/路灯/花草/长椅缺图时也保留程序表示；项目施工/成品、待拍/围挡、地标均有回退。

`npm run art:acceptance`重新生成本地JSON/PNG逐页404夹具，不修改正式图集。`tests/acceptance/a8-map.html`提供屏幕密度/强制倍率、清单404、三页JSON/PNG失败及四场景切换，使用真实loadArt和正式IsoMap，不写用户存档。`a8-browser-evidence.json`保存界面显示的密度/页请求/贴图数量；PNG通过Pixi加载，其工作线程请求未出现在主线程performance资源列表，JSON请求与清单/页内PNG关联由源码及测试核验。

`A8-REPORT.md`、`a8-fallback-contact.png`和其余a8截图在tests/acceptance。隔离生产预览5181已停服，停服后离线重载、合法出价恢复、继续一天/保存/手机重载通过；前后导出和`a8-offline-evidence.json`可复查，保存revision递增属正常，种子/日志不变。未做实体手机和系统级PWA安装。
