# 制作协作、交接并发与指挥官硬审闭环

本参考规范工程阶段的三道防返工闸门、定妆帧人工死锁拍板、冻结共享底座后的**按场默认并发加速**、消除“Brief 与执行两张皮”的 **6 项交接前提**，以及**指挥官强制审美找茬打回闭环**（仅建工程、开工作台或并发制作时读取；纯方案策划无需加载）。

---

## 1. 工作台三道防返工闸门（定帧先过人眼，全片并发加速，每场硬审打回）

1. **早开一页到底**：确认 work root 后尽早拉起 `editor <project>` 并提供本机 `/progress` 链接，全程刷新这一个页面，只在真实阶段与可看成果形成时更新，不发占位图或假百分比。
2. **第一道闸门·1920×1080 纯代码定妆帧（死锁人工亲眼拍板 × Luna 严格分权）**：
   - 不闷头一口气写两千行全片代码！先用共享视觉底座代码，针对全片实质不同的核心镜头状态、连续视线接力节点与高风险承重态，实渲 **1920×1080 全分辨率原生代码 PNG 定妆帧**（必要时配 3–6 秒探索小样）；
   - **当已调动 [laohu-luna](../../laohu-luna/SKILL.md) 时，严守指挥官—执行官分权铁律**：当前窗口担任 Commander，只做导演拆解、任务包派发与独立审美审片，**定妆关键帧的编码、渲染与返工修改一律派发给 Antigravity / Gemini Luna Worker 执行**，绝不越俎代庖自己动手写关键帧再自己验收；
   - **指挥官先拉大原图并排死刑审打回升级**（过 [motion-language.md](motion-language.md) 审美死刑审 6 关：彻底消灭隐藏 PPT 左上角母版、同模复制卡、风格断层与扁平发空），把缺陷发回原 Luna Worker 磨到真正像电影级视觉大片；
   - **必须主动将 1920×1080 定妆关键帧原图呈交给用户亲眼审看拍板**（配套 3 秒扫读汇报、视线接力说明与拍板项）。未获用户亲眼点头确认关键帧，**严禁私自扩写全片或压制 MP4**！
3. **第二道闸门·冻结共享视觉底座 → 按场并发制作 → 指挥官逐场硬审打回**：
   - 用户确认定妆帧后，立即把过审的色盘、光源、1px 镜面高光、双层影、表面微纹理、字体阶梯、统一虚拟相机与共享图形组件冻结进项目 `shared/` 底座，并划分独立单场模块（`scenes/s01.mjs`、`scenes/s02.mjs`…）共用单一真源 `timeline.js`；
   - **默认按独立场次开启并发加速**（除非用户明确要求单线串行，或仅有单一场次无可拆边界）：由当前窗口模型担任 **Commander（指挥官）**，按 [laohu-luna](../../laohu-luna/SKILL.md) 跨宿主双强分工并发派发给多个干净上下文的 **Antigravity / Gemini 审美执行子代理**（每个子代理满格注意力只死磕 1 场 4–8 秒戏，速度与精雕密度双升；纯工程脚手架、构建脚本或 CLI 门禁排错按需交 GPT/Codex）；
   - **指挥官强制审片与“第一版默认打回”**：严禁把 Worker 交回的第一版照单全收！每个场次必须由指挥官亲自拉大 1920×1080 原图 + 看连续动态小样，对照过审定妆帧、标杆图与 Brief 逐项找茬；不达标直接发返工打回单回原 Worker 修订复验，逐场过硬再合片。
4. **第三道闸门·终片连看带听确认才导出**：全部场次过审合片并配完终混音轨后，发布带最终混音的当前版本预览，获用户导出确认后再跑 `build` / `build-long`；工作台调过音轨直接导出当前编辑会话，绝不用旧计划覆盖。

---

## 2. 方向探索与全片制作 CLI 节奏

方向尚待确认时走两阶段轻探索：
1. **探索 `brief.md`**：完成全片总纲、分场地图与代表场双阶升维后，在 `brief.md` 写清 `<role>`、`<inputs>`、`<direction>`（含 `direction-name`、`styleframe-source: code`、`resource-mode`、`resource-use`、`motion-probe`、`explore-moment` 与 `typeface:`）；自主设计屏显字时 `<screen-text-registry>` 必须成对置于 `<structure>` 内，正文零 `……` 或 `待填`：
   ```text
   direction-name: <简洁中文方向名>
   styleframe-source: code
   resource-mode: 2
   resource-use: <stable-id> — 精确写清借用的光学工艺/构图尺度/运动算法及翻掉的平庸套路
   motion-probe: required; reason: 验证核心承重动作、光学扫光或镜头穿越接缝连续性。
   explore-moment: state-a@1.20 — 开场主极性定妆态，核对光学质感、尺度与字幕安全区。
   explore-moment: climax@27.50 — 高潮反转定妆态，核对暗场光影层级、主焦点与情绪冲击。
   ```
   *(注：`--phase explore` 脚本硬校验 `explore-moment` 登记 2–4 个唯一代表时刻、`probe` 为 3–6 秒且覆盖至少一个 `explore-moment`；这是工具边界，不限制正片按观看完成点自由呼吸。)*
2. **建探索工程、逐帧单秒实渲回执并呈交用户拍板**：
   ```sh
   node {SKILL_DIR}/scripts/laohu-showreel.mjs scaffold <project> --phase explore --audio <file|none|synth|tone|layer>
   # 注意：每个代码定妆帧须逐帧单秒调用 --still <单秒> 生成独立 singleStill 回执，再发布到工作台
   node {SKILL_DIR}/scripts/laohu-showreel.mjs render <project> --text-direction <方向名> --still <单秒>
   node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage style --preview <该帧PNG相对路径> --frame-source code --frame-event <事件ID> --frame-at <单秒>
   node {SKILL_DIR}/scripts/laohu-showreel.mjs probe <project> --text-direction <方向名> --start <秒> --duration <3..6> --selection <范围> --purpose <待验证的具体动作>
   node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage style --preview <生成的WebP相对路径>
   ```
3. **用户拍板后冻结底座并晋级全片并发生产**：收到用户亲眼看图后的真实确认原话，冻结共享视觉底座代码，定稿完整 `brief.md` 与项目内审稿记录（含 `brief-sha256:`），运行校验晋级：
   ```sh
   node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage style --confirm --evidence-text "<用户确认原话>" --scope "<已确认方向与画面范围>"
   node {SKILL_DIR}/scripts/laohu-showreel.mjs brief-units <project> --final
   node {SKILL_DIR}/scripts/laohu-showreel.mjs promote-production <project> --audit qa/brief-review.md
   ```
   更换主视觉方向、画幅或核心字形须重发 1920×1080 新定妆帧并再次由用户拍板。

---

<a id="方向帧的两种来源与回交"></a>

## 3. 原生代码定妆帧与共享视觉底座冻结

1. **按实质视觉差异选帧**：覆盖本片最具代表性的不同视觉极性状态、核心卡片/主载体特写与高潮反转态，同态仅换字幕不重复出帧。
2. **统一原生代码实渲定妆（`styleframe-source: code`）**：彻底告别跨媒介生图代画；以本地 OpenMotion 实拍参考图与风格样张作像素音叉，直接用选定代码引擎把这几张定妆帧磨到能当电影海报的水准，再呈交用户拍板。
3. **用户自有实图与外部媒体接入**：用户提供的真实照片、头像、品牌 Logo、实拍 A-roll 或真录屏直接高保真合入代码舞台，绝不重绘仿冒。
4. **过审即冻代码共享底座（消灭“各场画风漂移”）**：用户确认定妆帧后，立刻把已验证通过的 `shared/look.css`（色盘/字体/1px 光学高光边/双层影/磨砂基类）与 `shared/look.mjs`（主光参数、相机辅助、材质/纹理生成器、转场与物理缓动）冻结锁死；后续所有并发场景 Worker **必须直接 import 共享底座，严禁私自另起扁平样式**！

---

## 4. 消除“Brief 与执行两张皮”：按场并发的 6 项硬交接前提与指挥官打回闭环

### 单场并发派发必锁的 6 项交接前提（缺一不准派发）
按可独立验收的大场（紧连同一连续变形体不硬拆）并发派给多个干净上下文的 Antigravity 审美执行 Worker，每份任务包必须显式锁齐以下 6 项：
1. **已冻结共享视觉底座路径**：`shared/look.css`、`shared/look.mjs`、`timeline.js`（单时钟真源）与主入口挂载约定（`scenes/sXX.mjs` 导出 `mount(stage)` 与 `render(t, ctx)`，不互相覆盖全局 DOM/CSS）；
2. **已过审 1920×1080 定妆帧原图路径（强制像素对齐）**：明确要求 Worker 开工前先 `read_file` 看过审定妆图，确保阴影深度、切边高光、字重层级与留白呼吸像素级一脉相承；
3. **本场对标参考原图路径（强制像素对标）**：附上本场 Brief 指定的 OpenMotion / 风格样张真实文件路径，写清精确借用的 1–2 招工艺；
4. **本场独立可执行三段式指令**：只喂本场内容（含光学质感工艺单、真实信息密度与逐拍镜头切换/内容转变链），严禁把整部片无关草稿全灌进子 Worker 稀释注意力；
5. **首尾共享接缝端点契约**：精确给出上一场尾帧与下一场首帧的交接坐标、相机视角、色块极性或动势相位，保证双端零重演；
6. **可写边界与必交双证**：限定 Worker 只读写本场模块与本场测试静帧目录，交付时必须同时回交 **2–4 张 1920×1080 关键时刻实渲 PNG** + **本场连续动态小样（3–6s WebP/MP4）**。

### 指挥官强制审片与打回返工闭环（绝不第一版照单全收）
每个并发 Worker 回交本场产物后，**Commander（Antigravity 指挥官）必须亲自执行以下 4 步，严禁因 Worker 自称完成或仅扫缩略图就放行**：
1. **拉大原图并排死刑审**：用 `read_file` 逐张打开 Worker 回交的 **1920×1080 全分辨率 PNG**，与过审定妆帧、本场参考标杆图并排核对 [motion-language.md](motion-language.md) 的**审美死刑审 6 关**（去隐藏 PPT 骨架与新鲜感、统一视觉宇宙与视线接力、光学立体感与影光、表面质感与字体人格适配、材质与代码强项契合度、Brief 还原度）；
2. **调分析/找茬能力深挖问题**：默认带着“第一版一定有发平、发空、呆板或偏离 Brief 之处”的批判姿态（按需启用 [laohu-audit](../../laohu-audit/SKILL.md) / [laohu-analysis](../../laohu-analysis/SKILL.md) 视角）找出所有可实质拔高的视觉与节奏断点；
3. **出具像素级返工打回单并复用原 Worker**：只要存在任何一项未达殿堂标尺，**直接向原 Worker 发增量打回单**——写清「具体时间点与帧文件 → 肉眼看到的精确缺陷（如卡片发平缺切边高光与接触影、内部空旷、3 秒未切景别、偏离 Brief 哪一条）→ 具体物理/光学改法与复验标准」，打回重渲复审，直到真正立住；
4. **逐缝合片验收**：全部场次经指挥官亲自拍板过关后，整合回主工程、`timeline.js`、原生字幕与最终混音，逐缝检查相邻帧连续性与正常播速，并记录 `.showreel-progress/workbench-checks.json`（`segments` 与 `seams`）。

---

## 5. 时间片段与工作台交接

`brief.md` 的 `<structure>` 顶部维护极简 `<production-units>` 投影表（供工作台构建进度、关键帧与分段播放），并用 `稳定 ID` 定位紧随其后的 `### [稳定ID] 场名` **可执行单场独立三段式指令**：

```markdown
<production-units>
| 稳定 ID | 段名 | 开始 | 结束 | 制作说明 | 对应片段 ID | 时间依据 | 讲述与字幕 | 关键设计帧 | 制作职责 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s01 | 开场破题与结构展开 | 0 | 5.38 | 贴脸斜切切入 → 光学切片展开 → 穿孔推近移交下场把手。 | | 计划 | 原生字幕轨 | s01-hero@1.90 | 动画 |
</production-units>
```

**字段硬规则**：`开始/结束` 按 `[开始, 结束)` 从 0 连续覆盖全片（含纯视频/声音段）；`对应片段 ID` 填 `clips.json` 真实使用编号（逗号隔开），待做留空；`时间依据` 取 `计划` / `待对齐` / `成片@timeline.js#区间ID`（或 `a.t0,b.t1`）/ `成片@voice/timeline.json#occurrence-id`；`讲述与字幕` 取 `原生字幕轨` / `无口播` / `口播待对齐`；`关键设计帧` 取全片唯一 `帧ID@秒` / `沿用@前段帧ID` / `无@原因`；`制作职责` 取 `动画` / `混合` / `视频` / `声音`。随时用 `brief-units <project> [--final]` 核验。

---

## 6. 原版资料的本地适配边界

受保护原版 `templates/runtime/laohu-showreel/references/` 保持原字节与 `source-lock.json` 不动；脚手架生成项目 `brief.md` 副本时自动适配：默认早开工作台，以 1920×1080 原生代码定妆帧先获用户亲眼拍板，再冻结共享视觉底座并发分场与指挥官硬审合片。
