# A7 远郊地图素材复用与地表区分

2026-10-25；Codex In-app Browser；http://127.0.0.1:5180；未发布。

- 同一81素材图集，无新增图/原图修改。远郊非道路平地以草地/暖土为主，草木偏橄榄绿、泥地偏暖棕，道路低饱和米灰；主城灰色铺装原色保持。水面与桥体保留原色，河道连接不变。
- `src/render/terrain.ts`/`isoMap.ts`只做视觉选择和颜色；无模拟数值/可开发区域/随机数变化；fallback也用草土配色。
- 合法回放：seed7原有南岸项目；day720追加bid L35=7763、L38=13651（均aiMax+1），day840江津/璧山项目进度16.7%，day1500江津delivered、璧山completed，状态playing、现金91039.0945万元。没有直接写状态造项目。
- IAB的a7-map正式IsoMap检查day840施工、day1500成品，两项目均复用洋房图；主城/远郊切换对照、手机390×844项目地图和实际主游戏远郊视口通过，warn/error为空。
- typecheck、56项Vitest、build通过。图集保持81素材、@2x3288512字节，构建离线清单29文件。
- 证据：a7-suburb-completed.png、a7-suburb-construction.png、a7-city-comparison.png、a7-projects-mobile.png、a7-suburb-desktop-1440x900.png、a7-suburb-mobile-390x844.png。复验入口a7-map.html（仅HTTP）。

A7完成，A8及以后继续；无实体手机验证、Git初始化、PR或发布。
