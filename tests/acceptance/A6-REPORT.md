# A6 山城特色验收

2026-10-25；Codex In-app Browser；http://127.0.0.1:5180；未发布。

- 六张原图、最终提示词、哈希视觉记录齐全。catalog-a6=6/6通过5%底座偏差门槛、对称性和高度检查；拒绝样本保留，未放宽阈值。最终斜拉桥底座1.9922794403:1，其余见art/a6-progress.json。
- 风格化木廊灰瓦吊脚楼两组（3屋/4屋）、两个方向不同结构的跨江桥、索道橙色吊厢、石阶步道和亭子。无现实建筑复刻、人物/文字或背景色；@1x/@2x画廊均检查锚点和完整轮廓。
- 主城六处、远郊桥复用。全在河道/山地，不改变模拟地块、RNG或参数。既有桥梁格全部由唯一同方向大桥覆盖，首行/列偏置对接道路。实际地图中水面基座、道路端点、索塔和山地平台/前景顺序已检查。
- 正式图集81素材，@2x PNG合计3288512字节；4张PNG跨两档密度。art:check/art/art:gallery/typecheck/56项Vitest/build通过，离线清单29本地文件；完整失效和离线运行在A8验收。
- IAB：画廊密度切换，合法day720回放的正式IsoMap主城/远郊，day750主游戏1440×900和390×844；warn/error均为空。无实体手机验证。
- 证据：a6-gallery-1x.png/a6-gallery-2x.png、a6-map-city.png/a6-map-suburb.png、a6-desktop-1440x900.png/a6-mobile-390x844.png；可复验入口a6-gallery.html与a6-map.html（仅HTTP）。

A6完成；A7及以后继续。无Git初始化、PR或发布。
