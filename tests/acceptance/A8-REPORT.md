# A8 图集密度、失败回退与离线验收

2026-10-25；Codex In-app Browser；开发服务5180、隔离生产预览5181；未发布。

## 完整性与大小

81唯一正式素材、81对应最终提示词；@1x一个PNG、@2x三个PNG，@2x合计3288512字节（3.14MiB），低于8MiB。两档JSON中的素材集合与art/manifest完全一致，PNG字节与清单一致，meta.scale匹配档位。生产构建29个本地文件，含全部9图集文件（1清单、4PNG、4JSON）；worker版本0b6f88b45f1161c2。

## 密度

- 初次IAB为DPR2，默认请求三页@2x、81贴图；设置视口后重载为DPR1，默认仅请求一页@1x、81贴图。另以强制参数交叉验收1/2档。
- `a8-auto-density.png`、`a8-1x-density.png`及a8-browser-evidence.json记录界面状态与实际JSON请求。Pixi PNG加载在工作线程，主线程performance清单未列PNG请求；PNG与对应密度JSON的关联由页meta.image、源代码及完整性测试核验，不据此声称主线程直接观察全部PNG网络请求。

## 真实失败

`npm run art:acceptance`只生成本地夹具。a8-map使用真实loadArt/正式IsoMap、合法回放存档，不改用户GameState或存档。逐页JSON不存在与PNG不存在均真实404：页0失败→72健康贴图、页1→67、页2→23；其余页保留，失败对象程序绘制。整份清单404→0贴图，地图仍完整显示。

检查主城/远郊、两线施工程序楼体/塔吊、背景楼、地形道路/高差、八类装饰及地标回退。land围挡程序路径已补齐，当前自动开工下实际land流程在B3验收；未以手改状态造该阶段。截图a8-fallback-{json/png}-{0/1/2}.png、a8-fallback-contact.png、a8-full-fallback-{city/suburb/mobile}.png、a8-{tower/garden}-construction-fallback.png。无未处理JS异常；故障场景的资源404为刻意注入。

## 生产离线与保存

- 本机127.0.0.1:5181独立来源，新游戏经实际界面向L4出价36100万元；界面显示保证金0.66亿冻结、现金4.34亿、离线缓存已就绪，导出before。
- 停止本次预览进程，lsof确认5181没有监听者；随后IAB重载仍正常启动，完整贴图、现金和已出价恢复。
- before/after-reload除revision外完全一致，revision3→7正常递增；seed、day0、log完全一致。
- 离线点击1×推进到第2日，再暂停/保存/导出continued，day1、seed/log不变；390×844再次离线重载恢复第2日，完整贴图仍显示。控制台warn/error为空。
- a8-production-online.png、a8-production-offline.png、a8-production-offline-mobile.png；三个导出JSON和a8-offline-evidence.json为证据。生产预览已停止，用户5174来源和5180开发档未被这项测试替换。

## 自动验证与界限

typecheck、63项Vitest、build通过。新增7项测试覆盖默认密度、单档下载、分页失效隔离、HTTP/网络/JSON清单失败、全量双档资源和体积。无经济参数、存档格式/键或旧内核变化。

A组完成；B–D仍未完成。未做实体手机、系统级PWA安装、Git初始化、PR或发布。
