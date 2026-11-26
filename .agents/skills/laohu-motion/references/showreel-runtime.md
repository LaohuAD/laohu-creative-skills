# 本地 Showreel 运行环境、资源查询与工具速查

本参考是新建与维护 Motion Showreel 原生工程的唯一命令速查与运行契约手册（仅建工程、查资源、开工作台或渲染时按需读取；纯方案策划无需加载）。所有新动画运行于受保护本地闭包 `templates/runtime/laohu-showreel/`（MIT + `source-lock.json`），经薄入口 `scripts/laohu-showreel.mjs` 驱动，**大依赖、浏览器、缓存与成片一律留在已确认 work root 同卷目录**，绝不污染技能仓库或回落系统盘。

---

## 入口命令（黄金一条龙速查）

在已确认的 **work root** 下运行：

```sh
# 1. 环境体检与依赖安装（二维项目可加 --without-three）
node {SKILL_DIR}/scripts/laohu-showreel.mjs doctor [--webgl-smoke]
node {SKILL_DIR}/scripts/laohu-showreel.mjs setup [--without-three]

# 2. L0–L3 实体资源查阅（纯方案用 resource-overview；受管工程用 input-map，非 16:9 须显式声明规格）
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-overview --scope global-map
node {SKILL_DIR}/scripts/laohu-showreel.mjs input-map <project> [--spec <WxH> --fps <fps> --spec-source explicit-user --spec-evidence-text "<用户原话>"]
node {SKILL_DIR}/scripts/laohu-showreel.mjs input-candidate <project> --id <resource-id> [--next]

# 3. 脚手架建工程（推荐 --phase explore；--audio 必选 file|none|synth|tone|layer）
node {SKILL_DIR}/scripts/laohu-showreel.mjs scaffold <project> --phase explore --audio file [--with-three]

# 4. 早开本地工作台（全程刷新一页）
node {SKILL_DIR}/scripts/laohu-showreel.mjs editor <project> [--port <端口>]

# 5. 探索关键帧、动态小样与文字预检
node {SKILL_DIR}/scripts/laohu-showreel.mjs text-contract <project> --text-direction <方向名> [--size 1920x1080 --fps 30]
node {SKILL_DIR}/scripts/laohu-showreel.mjs render <project> --text-direction <方向名> --still 0.5,2.0,4.0 --sheet
node {SKILL_DIR}/scripts/laohu-showreel.mjs probe <project> --text-direction <方向名> --start 0.5 --duration 4 --selection <范围> --purpose <具体检验动作>
node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage style --preview <PNG或WebP> --frame-source code --frame-event <事件ID> --frame-at <秒>

# 6. 记录方向确认、全片校验与晋级生产
node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage style --confirm --evidence-text "<用户原话>" --scope "<确认范围>"
node {SKILL_DIR}/scripts/laohu-showreel.mjs brief-units <project> [--final]
node {SKILL_DIR}/scripts/laohu-showreel.mjs promote-production <project> --audit <项目内审稿记录>

# 7. 确定性复核、终片预览发布、确认导出与技术验收
node {SKILL_DIR}/scripts/laohu-showreel.mjs render <project> --text-direction <方向名> --determinism
node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage review --publish . --final --text-direction <方向名> [--audio audio/final.wav]
node {SKILL_DIR}/scripts/laohu-showreel.mjs build <project> --text-direction <方向名>
node {SKILL_DIR}/scripts/laohu-showreel.mjs inspect qa <project>/out/final.mp4 --out <project>/qa/final --expect-size <WxH> --expect-fps <fps> --expect-duration <seconds> --audio required|none
```

- 始终经薄入口 `laohu-showreel.mjs scaffold` 建工程，不直接跑 `scaffold.sh`；跑原版测试组用 `laohu-showreel.mjs test`。
- `--audio` 优先 `file` 或 `none`；成品不贴合时由具备实听能力的多模态执行者选 `synth`/`tone`/`layer` 原创或混搭并实听迭代（无听审能力须先授权）。

---

<a id="动效库的分层读取"></a>

## 设计输入与资源查阅

```sh
# L0 全库星图（约 32 KB：75 风格 + 15 家族 400+ Atlas + 动效 + Overlay + 字体分类）
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-overview --scope global-map
node {SKILL_DIR}/scripts/laohu-showreel.mjs input-map <project> [--resume] [--full-redesign]

# L1 展开分类、比较与检索
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-category --source styles|atlas|motion-prompt|openmotion --category <类别或家族ID>
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-compare --ids <id1,id2,...>
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-search --source motion-library --query <关键词>

# L2 读完采用项正文（受管工程用 input-candidate 留回执；只读用 resource-fulltext）
node {SKILL_DIR}/scripts/laohu-showreel.mjs input-candidate <project> --id <resource-id> [--next]
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-fulltext --id <resource-id> --level L2

# L3 编码接线时读可验证源码
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-fulltext --id <resource-id> --level L3 [--member <项目内文件>]
```

- OpenMotion 对比卡带 `contactSheetPath`（六帧）与 `previewPath`（视频）；Motion Prompt 带 MIT 本地 Canvas 源码，接线前核画幅与局部时间。改资源元数据后运行 `python3 -B {SKILL_DIR}/scripts/laohu-styles.py build-resource-catalog` 刷新目录。
- **资源模式**：`2`（默认自由借血肉，绑 ≥1 项读完 L2 资源）、`1`（锁单一主风格附原话）、`3`（锁外部对标附 Benchmark 记录与原话）、`original-only`（用户明说纯原创附原话），每项写 `resource-use: <stable-id> — <只借哪部分血肉>`。
- **分页恢复**：终端截断时从 `.showreel-input-delivery.json` 取 `pageRecords[].id`，用 `input-page <project> --id <page-id>` 重放；续跑用 `--resume`，推倒重做用 `--full-redesign`。
- **字体查询**：`resource-overview --scope fonts` / `resource-search --source fonts --query "<气质>" --text "<完整屏显原句>"` / `resource-get --id <font:ID> --text "<完整原句>"` / `resource-fulltext --id <font:ID> --level L2`，按 [typography-and-legibility.md](typography-and-legibility.md#把选定的字体交给工程) 绑定。

---

## 屏显文字的渲染预检

`text-contract <project> --text-direction <方向名> [--size WxH --fps N]` 浏览器实跑必显字项首/中/末帧、`SHOTS` 首末帧及每 5 秒巡查点（加 `--exhaustive-frames` 逐帧查，报告入 `.cache/brief-text-coverage.json`）；缺失受控绘制、未绑字体或零帧窗拦截失败，静帧未覆盖窗口记 `NOT_COVERED_ENTRY`。只证受控绘制，不替正常播速实看。

---

## 默认显示真实制作进度

确认 work root 后运行 `editor <project>` 并打开本机 `/progress`（启动后实测拖动前中后段、点字幕与关键帧核联动；打不开浏览器如实汇报地址）。
- **页面布局**：左上素材库（原始/处理后/历史）、右上成片时钟实时预览（单击播停、点击指认片段点选元素）、下半全宽分类时间轴；居中进度按输入素材 → 配音 → ASR 字幕 → Brief → 关键帧 → 分段动画 → 音乐 → 音效 → 混音 → 成片评审／导出展示。关键帧菜单按时间并排左设计帧右实现帧拉杆对比，分段支持单段试播。
- **实时任务状态**：`progress-task <project> start <stage> <条目ID> [名称]` 与 `finish/stop <任务编号>`（`stage` 取 `input|voice|srt|brief|chapters|cover|motion|music|sfx|mix|export`）。路径覆写入 `.showreel-progress/workbench.json`；段与接缝核验入 `.showreel-progress/workbench-checks.json`。现代编辑台需 Node 22.18+ 与同盘 `.cache/upstream/openmotion`（或 `LAOHU_OPENMOTION_SOURCE`）。

### 可控制的成片片段
- 剪入素材登记于 `assets/workbench/clips.json`（`version: 1`、`duration`、`clips[]` 含 `id, kind, number, title, t0, t1`，绝对秒）；脚手架注入 [media-layers.mjs](../templates/runtime/openmotion-studio/media-layers.mjs)（HTML 用 `data-workbench-id/data-start/data-duration/data-media-start`，Canvas 用 `window.workbenchVisible(id)` 与 `workbenchHitTest(time, x, y)`），导出消费 `assets/clip-state.json`。
- AI 与界面共用 [clip-edits.mjs](../templates/runtime/openmotion-studio/clip-edits.mjs)（先 `list` 取 `revision`，再调 `<hide|show|remove|restore|undo|redo|shift|gain>`）；快捷键：空格播停、Shift+空格播当前段、Y 显隐、Delete 移除、Cmd/Ctrl+Z 撤销。多章节项目经 `chapter-binding` 与 `chapter-index` 生成平台索引与跳转播放器。

### 代码定妆帧与同一状态的工程实渲
每帧用稳定 `--frame-event <event-id>` 与 `--frame-at <seconds>` 绑定 `brief.md` 状态（图放 `qa/explorations/`）：
```sh
node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage style --preview <代码定妆PNG> --frame-source code --frame-event <event-id> --frame-at <seconds>
# 迭代或全片实现阶段同秒数发工程实渲供左右拉杆对照：
node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage style --preview <代码PNG> --frame-source code --frame-event <同一-event-id> --frame-at <同秒数> --frame-role implementation
```
确认后重调视觉用 `--reopen`。

### 动态检验声明与工作台入口
声明 `motion-probe: required` 时发布可播小样：**方向探索期（`--phase explore`）脚本硬校验 3–6 秒且区间须包含至少一个已登记的 `explore-moment`**；非探索期单段上限 6 秒（1–6 秒，复杂片分次取样）：
```sh
node {SKILL_DIR}/scripts/laohu-showreel.mjs probe <project> --text-direction <方向名> --start <秒> --duration <3..6> --selection <范围> --purpose <具体检验动作>
# 发 WebP：progress <project> --stage style --preview <WebP路径>
# 或（非探索期）直接发无声草稿快照：progress <project> --stage scenes --publish . --draft-probe --text-direction <方向名> --duration <1..6> --selection <范围> --purpose <具体检验动作>
```
小样绑定 `brief.md`、资源、规格与工程指纹，关键变动后须重取样回放。

---

## 依赖安装、同卷检查与 WebGL2 / Three.js

- 同卷隔离目录全部位于 work root 下：`.cache/laohu-showreel/{runtime,npm,playwright-browsers}` 与 `.cache/tmp/laohu-showreel/`；跨卷立即停止，失败保现场不静默重装。
- 3D 建工程加 `--with-three` 自动离线拷锁版 Three.js 至 `vendor/three/` 并写 import map；`doctor --webgl-smoke` 验帧；macOS 依次探测 Apple Metal → ANGLE → SwiftShader（可设 `SHOWREEL_ANGLE=default|swiftshader`）。

---

## 构建协议与交付前核验

- 正式 `build` / `build-long` 前自动核对 `build.sh` 与 `inspect.mjs qa` 规格一致，并沿用 `progress --stage review --publish . --final` 冻结音轨（分章加 `--chapter-manifest film.json`）；换轨须重发预听。
- 页面严守原版 [stack.md](../templates/runtime/laohu-showreel/references/stack.md) 与 [motion-language.md](motion-language.md) 确定性契约；`--determinism`、`text-contract` 与 `inspect qa` 全绿零 `NOT CHECKED` 后，再按原版 [review.md](../templates/runtime/laohu-showreel/references/review.md) 与静帧 6 关 + 动态实播 3 关扫疤连看连续片段与实听。
