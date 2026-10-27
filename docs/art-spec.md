# 美术规范与生图提示词

摘自《房地产大亨》游戏设计规范第 11 节（原文在 Claude 文档，此处为仓库内副本，以本文件为准）。

所有美术素材由 GPT 图像模型生成。先有一张风格锚定图定画风，之后每个素材都附上这张图、套用同一段提示词模板，保证整套素材统一。生图的角度和尺寸不会完全精确，由 `scripts/art-pipeline.ts` 负责对齐，偏差大的重新生成。

## 参考图

| 文件 | 用途 |
| --- | --- |
| `art/reference/style_anchor.png` | 风格锚定图（来自项目上级 `output/imagegen/chongqing-isometric-style-sheet.png`）。画风以它为准 |
| `art/reference/guide_terrain_1x1.png` | 地形瓦片占地参考图（带侧面厚度） |
| `art/reference/guide_building_1x1.png` / `2x2` / `3x3` | 建筑占地参考图（2:1 菱形网格） |

生图时：图 1 附锚定图，图 2 附对应占地参考图。

## 技术规格

| 项目 | 规格 |
| --- | --- |
| 视角 | 2:1 等距（每格菱形宽:高 = 2:1），镜头从东南方俯视，竖直边保持竖直，无透视变形 |
| 瓦片尺寸 | 1 格 = 128 × 64 px（@1x），素材按 @2x（256 × 128 px）制作 |
| 地形厚度 | 地形瓦片带前两个侧面（@2x 下 32 px 高），便于堆叠出山城高差 |
| 建筑占地 | 1×1、2×2、3×3 格；画布宽 = 占地格数 × 256 px（@2x）；素材总高不超过占地宽度的 1.3 倍，楼层可压缩 |
| 锚点 | 占地菱形的下顶点，所有素材对齐到此点 |
| 光照 | 主光来自左上；不画地面投影，投影由引擎统一绘制 |
| 背景 | 优先透明背景；不支持时用纯色洋红 #FF00FF 平涂，由脚本抠除。禁止渐变、光晕、暗角、黑底；单个物体，无文字、无人物、无边框 |
| 画风 | 精细的写实风等距 3D 渲染，以锚定图为准；地形底瓦保持干净，树木、岩石另做装饰素材 |
| 色板 | 暖灰混凝土、米色外墙、蓝灰玻璃、青绿江水、墨绿山体；强调色为施工橙（塔吊、围挡） |
| 图标 | UI 图标不用生图，用开源 SVG 图标库 |

## MVP 素材清单

| 类别 | 素材 | 占地 | 数量 |
| --- | --- | --- | --- |
| 地形 | 平地、草地、坡地（4 个朝向 × 2 种坡度）、山体、江面、江岸（直线/转角）、道路（直/弯/丁字/十字）、桥梁段 | 1×1 | 约 30 |
| 装饰 | 树丛、岩石、路灯等，放在地形上 | 1×1 内 | 6–8 |
| 地块状态 | 待拍空地（带拍卖牌）、已拿地围挡 | 2×2、3×3 | 4 |
| 施工阶段 | 基坑、正负零、主体施工（半层楼体 + 塔吊）、封顶（脚手架）、烂尾（塔吊闲置、围挡褪色） | 2×2、3×3 | 每产品线 5 |
| 成品建筑 | 高层住宅、洋房、别墅、商业裙楼 | 2×2、3×3 | 每类 3 个变体 |
| 背景城市 | 老旧居民楼、写字楼、学校、轻轨站 | 1×1、2×2 | 约 10 |
| 山城特色 | 江边吊脚楼群、跨江大桥、过江索道、山城步道 | 2×2、3×3 | 约 6 |

山城特色只做风格化表达，不复刻具体建筑。

## 工作流程

1. 每个素材：附上锚定图和对应占地参考图，用提示词 B 生成，原图放 `art/raw/`。建筑占地一律为正方形，只有塔吊、天线可以伸出占地。
2. 同一栋楼的各施工阶段：先生成成品，再附上成品图用提示词 C 倒推各阶段，保证轮廓一致。
3. 运行 `npm run art`：去背景 → 裁边 → 检查菱形比例 → 对齐锚点 → 缩放 @2x/@1x → 打包图集到 `public/art/`。
4. 放进游戏网格里检查拼接，不合格的重新生成。
5. 文件命名：`类别_名称_占地_变体.png`，如 `building_tower_2x2_a.png`、`stage_pit_2x2_a.png`、`terrain_slope_ne_1.png`。
6. 每个素材的最终提示词存 `art/prompts/<同名>.txt`。

## 提示词

提示词用英文。花括号里的内容按素材替换。

**提示词 A：风格锚定图**（已完成，仅在需要重做画风时使用）

```
Isometric game art style sheet for a city-building management game set in a mountainous riverside Chinese megacity inspired by Chongqing.
Show 6 separate objects on a plain white background, evenly spaced, not overlapping:
1) a flat grass terrain tile, 2) a sloped hillside terrain tile, 3) a river water tile, 4) a 30-storey modern residential tower, 5) a building under construction with a tower crane, 6) a row of old 6-storey apartment blocks.
Camera: true 2:1 isometric (dimetric) projection viewed from the south-east, no perspective distortion, all vertical edges perfectly vertical.
Style: detailed realistic isometric 3D render, smooth matte materials, gentle ambient occlusion, key light from the upper left, no cast shadows on the ground.
Palette: warm grey concrete, beige facades, blue-grey glass, muted teal river water, deep green hills, safety orange for cranes and hoardings.
No text, no logos, no people, no UI.
```

**提示词 B：单个素材（通用模板）**

```
Image 1 is the style reference: match its rendering style, materials, lighting and palette.
Image 2 is the footprint guide: a 2:1 isometric diamond grid (the diamond is exactly twice as wide as it is tall). Use exactly this camera angle. Draw the object standing on this diamond without moving or resizing it, and do not show the guide lines in the result.
Create ONE isometric game sprite: {ASSET DESCRIPTION}.
The base of the object covers the whole diamond and stays inside it; only a tower crane or antenna may extend beyond it.
Use compressed game proportions: the whole object, including the roof, is at most 1.3 times as tall as the footprint is wide.
Background: fully transparent if supported; otherwise a solid flat magenta (#FF00FF) background. No gradient, no glow, no halo, no vignette, no dark backdrop.
One object only. No cast shadow, no text, no logos, no people, no border.
```

**提示词 C：同一栋楼的施工阶段**

```
Use the attached image as the reference. Show the SAME building on the SAME footprint, with the same camera angle and lighting, at this construction stage: {STAGE}.
Keep the footprint, orientation and overall silhouette consistent; change only the construction progress.
Same background rule: fully transparent if supported, otherwise solid flat magenta (#FF00FF), no glow or vignette. No cast shadow, no text, no people.
```

**素材描述示例**

| 素材 | 描述 |
| --- | --- |
| 平地瓦片 | `a single flat grass terrain tile; the top is an exact 2:1 diamond, with the two front side faces showing brown earth, side height one eighth of the tile width, matching the attached guide; no trees or rocks` |
| 坡地瓦片 | `a single hillside terrain tile sloping down towards the south-east, grass on top, earth on the side faces; no trees or rocks` |
| 江面瓦片 | `a single river water tile, muted teal water with subtle ripples, flat 2:1 diamond top, thin stone edge on the front side faces` |
| 待拍空地 | `an empty cleared land parcel of bare earth with a small red auction sign post at the front corner` |
| 高层住宅 | `a modern residential tower with glass balconies, beige and grey facade, on a small landscaped podium` |
| 洋房 | `a group of four 6-storey garden apartment buildings with sloped dark grey roofs and green courtyards` |
| 吊脚楼群 | `a cluster of stylized traditional Chongqing stilt houses built on a steep riverside cliff, wooden balconies and grey tiled roofs` |
| 基坑 | `an excavated foundation pit with concrete retaining walls and a small yellow excavator, orange hoardings around the edge` |
| 主体施工 | `a half-built tower, about half of its floors, with an orange tower crane and green safety netting on the top floors` |
| 封顶 | `a topped-out tower fully wrapped in scaffolding and green safety netting, tower crane still standing` |
| 烂尾 | `an abandoned half-built tower, bare concrete frame, idle rusted crane, faded torn hoardings, weeds on the site` |
