# 生图参考图

A1 于 2026-10-25 入库。后续生图统一从本目录读取参考图，规格与完整提示词见 `../../docs/art-spec.md`。

- 图 1：`style_anchor.png`，固定画风、材质、光照与色板。
- 图 2：按占地选择 `guide_terrain_1x1.png` 或 `guide_building_1x1.png`、`guide_building_2x2.png`、`guide_building_3x3.png`，固定等距相机和占地菱形。
- 同一建筑的施工阶段另附其成品图，按提示词 C 倒推，保持轮廓一致。
- 新生成原图放 `../raw/`，最终提示词放 `../prompts/`；参考图本身不要裁切、重绘或覆盖。

来源：风格锚定图来自项目上级 `output/imagegen/chongqing-isometric-style-sheet.png`；四张占地参考图来自项目上级 `art/guides/`。仅原样复制，源文件保留。

入库时已逐文件核对字节一致性及 PNG 尺寸：

| 文件 | 尺寸 | SHA-256 |
|---|---|---|
| `style_anchor.png` | 1536×1024 | `0d1201f1818b08e4124008aa8782b075fff175ffefd02cca2f14b2541cf30c07` |
| `guide_building_1x1.png` | 1024×1536 | `74f8621924a29b5e3ea41989ac5faae0471d9286e304aee5e7ff2dbae8a33197` |
| `guide_building_2x2.png` | 1024×1536 | `421287b2c189e54ab8441aba90ebb9b3f1c6c10f212f98a9c5fc728f990ad69c` |
| `guide_building_3x3.png` | 1024×1536 | `05fe372db9f72e1a56efe1e4e112649cd8c40fd989b12a79615206d4168441d2` |
| `guide_terrain_1x1.png` | 1024×1024 | `f32defbd9ce312c5422cc9f472446b31c8a566d4bea1a0060a0d52c1f20a1794` |


A6另有 `guide_building_2x2-crop.png`：从原 `guide_building_2x2.png` 仅裁取 `{left:72,top:1060,width:880,height:460}`，不缩放、不改角度/几何，去掉上方大面积留白，让生图修正对称性时更明确地读取原指南。原五张参考图不变。此图仅为指南裁剪副本，不是正式美术素材。
