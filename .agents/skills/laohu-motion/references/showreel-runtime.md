# 本地 Showreel 运行环境、闭包与入口

本 Reference 约束新建动画调用哪套工具、从哪里读取源码、把大依赖和媒体写在哪里。新项目统一使用原生八 XML 块 Brief 与 Motion Showreel `render(t)` 路径。已有工程中的旧技术文件只由其实际旧 consumer 打开，不形成另一套当前设计或制作合同。

## 来源与本地生产闭包

经核对的生产来源为 garden-skills 仓库 commit 2b9a89340b70f632d31c0f1c69fce94a7912423e 下的 skills/motion-showreel。许可为随来源保留的 MIT LICENSE。只复制实际运行需要的闭包到 templates/runtime/laohu-showreel/{references,scripts,assets}，没有把整个 Git 仓库放进 runtime。闭包清单在同目录 source-lock.json，包含逐文件相对路径、字节数和 SHA-256。原版 styles 全部 43 张卡、brief XML、runtime scripts、原 tests、starter、editor 和所需页面/脚本资产都在清单内；上游 SKILL.md、README 和不需要的仓库内容不作为生产入口。

薄入口每次调用会校验 `{SKILL_DIR}/templates/runtime/laohu-showreel` 的 source-lock。普通 render、editor、preview、inspect、audio 等命令直接运行这份受保护闭包；`NODE_PATH` 只供 Node 的 Playwright 模块解析使用。不得把 `.cache/validation` 研究快照、upstream checkout 或恢复副本当运行时源。

原版 Tone 检查会按文件路径查找 `node_modules/tone`，原测试也会检查 scripts 相邻依赖目录。只有 `test`、显式 Tone 生成或 wrapper `build` 需要这一行为时，入口才从上述本地 runtime 生成可复用的工作根执行副本：`.cache/laohu-showreel/execution/<source-lock SHA-256>/runtime`。副本生成时逐文件校验 source-lock；首次用同目录 staging 加原子重命名，后续校验并复用；其 `scripts/node_modules` 仅链接当前 work root 的锁定依赖。副本的源仍是本地受保护 runtime，不是 `.cache/validation` 或 upstream 快照。两份来源有任何 hash 差异都停止并保留现场，不静默修补或覆盖。副本放在每个 work root 自己的 cache，因此不同项目不争用 Skill 安装目录的全局链接。MIT 许可证随闭包保留，原版脚本和原始风格卡不由摘要重造。

## 入口命令

用户确认的 work root 必须是当前 shell 目录。所有命令使用显式入口，避免与旧 Motion 的 scripts/render.mjs、scripts/audio.mjs 同名冲突：

~~~sh
node {SKILL_DIR}/scripts/laohu-showreel.mjs doctor [--webgl-smoke]
node {SKILL_DIR}/scripts/laohu-showreel.mjs setup [--without-three]
node {SKILL_DIR}/scripts/laohu-showreel.mjs test
node {SKILL_DIR}/scripts/laohu-showreel.mjs scaffold <project-or-slug> --audio file
node {SKILL_DIR}/scripts/laohu-showreel.mjs brief-units <project> [--final]
node {SKILL_DIR}/scripts/laohu-showreel.mjs render <project> --text-direction <本轮所选方向名> --still 0.5,2.0,4.0 --sheet
node {SKILL_DIR}/scripts/laohu-showreel.mjs render <project> --text-direction <本轮所选方向名> --determinism
node {SKILL_DIR}/scripts/laohu-showreel.mjs editor <project> [--port <本机端口>]
node {SKILL_DIR}/scripts/laohu-showreel.mjs build <project> --text-direction <本轮所选方向名>
node {SKILL_DIR}/scripts/laohu-showreel.mjs inspect qa <project>/out/final.mp4 --out <project>/qa/final --expect-size <WxH> --expect-fps <fps> --expect-duration <seconds> --audio required|none
~~~

scaffold 必须显式给 --audio。具备真实音频听审与情绪识别能力的多模态执行者在用户未锁定曲目且未禁止原创时，可按成片情绪与声画需要自由选择 `file`（成品或已混音文件）、`synth`、`tone` 或 `layer`（也可在本地混合成品与自创音轨），并对实际产物实听校验；不具备真实听审能力时，常规分支仍为 `file` 或 `none`（确认静音），只有用户明确授权用本地合成原创音乐/音效时才传 `synth`、`tone` 或 `layer`。原版五种分支及原始算法完整保留，不将 `synth` 设为无条件默认，也不删除可授权的生成路径。

新项目创建只经本地 `laohu-showreel.mjs scaffold`；不要直接运行受保护 runtime 中的 `scripts/scaffold.sh`。原版 `sound.md` 等页面的 scaffold 示例，在本地新项目流程中改用薄入口并保留明确的 `--audio` 选择（例如 tone/layer）。wrapper 在这个正常工作入口核对输入交付和 brief；这是流程门禁，不是操作系统安全边界。原版 shell 脚本为字节保真和兼容保留，拥有 shell 权限的人仍能直接调用或写文件，文档不声称物理阻止此类绕行。

<a id="动效库的分层读取"></a>

## 设计输入与资源查阅

以下命令从工作根执行。已授权创建或更新项目时，用 `input-map` 一次输出完整 L0，并写入轻量回执。仅浏览资源或只交设计时，用只读 `resource-overview` 直接取同一星图。此处的工具回执记录实际输出的字节。设计负责人仍需阅读返回内容并结合本片材料选择。

~~~sh
node {SKILL_DIR}/scripts/laohu-showreel.mjs input-map <project>
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-overview --scope global-map
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-category --source styles --category 手作与印刷
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-category --source atlas --category <家族ID或中文名>
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-category --source motion-prompt --category <中文类别>
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-category --source openmotion --category <中文类别>
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-compare --ids <id1,id2,...>
node {SKILL_DIR}/scripts/laohu-showreel.mjs input-candidate <project> --id <resource-id> [--next]
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-fulltext --id <resource-id> --level L2
node {SKILL_DIR}/scripts/laohu-showreel.mjs resource-fulltext --id <resource-id> --level L3
~~~

**L0 全库目录。** 一次浏览全部正式风格 ID 的可见外观、适用任务和建议实现路线，Atlas 全部家族及成员计数，Motion Prompt、OpenMotion 和已有动效来源的类别，Overlay 条目，字体/排印分类与共同动作语言。动态从本地已安装索引生成。WebGL、Three.js、Canvas 或 SVG/DOM 是方向线索，具体实现、混用方式和必要素材按各项原文和实渲核对。星图之外的固定规则直接在当前 Skill 阅读。根据任务按需查原版的 [用途](../templates/runtime/laohu-showreel/references/formats.md)、[工艺](../templates/runtime/laohu-showreel/references/craft.md)、[页面契约](../templates/runtime/laohu-showreel/references/stack.md)、[动作配方](../templates/runtime/laohu-showreel/references/recipes.md)，声音和文字分别查本地专业引用。

**L1 按真实问题比较。** `resource-category` 返回整类对比卡，`resource-compare --ids` 同时接收多个来源的稳定 ID。按本片需要充分比较，可继续展开更多类别或候选。风格卡含形态、色彩光影、字体排版、材料、构图、信息组织、动势、已证适用条件、限制与融合依据，预览路径以登记为准。Atlas 可用原 `resource-family --id` 展开同一家族。OpenMotion 对比卡带 `contactSheetPath`、`sampleTimesSeconds` 和 `previewPath`，从六帧对照构图和阶段，再在实际视频里核对短转场、缓动、停顿与声画落点。可继续以 `resource-search --source motion-library --query <关键词>` 或指定来源查局部配方、Overlay 和其他旧 consumer。[动效目录](../assets/motion-library/README.md)

**L2 采用项的完整生产正文。** 本项目通过 `input-candidate` 读完每项正文；分页时使用 `--next` 续读。只读核对可直接用 `resource-fulltext --level L2`。确定实际选用范围后，保留与该范围相符的参数、步骤、必要条件和例外。来源语言及图像只在确需核实对应内容时回查。选用到的是工艺、方向或既有 consumer，须以正文、可用素材和当前工程界定。

**L3 实现。** 在需要接线时读所选资源可核验的源码或 kit。Motion Prompt 有登记的 MIT 本地 Canvas pack，Overlay 按已登记者提供完整或局部接线，Atlas 主要是视觉知识。从 `resource-get` 取 OpenMotion 条目的指南、预览和实际项目源码路径。对已登记本地工程的条目，`resource-fulltext --level L3` 按本地清单校验并输出入口源码，可加 `--member <项目内文件>` 读取实际依赖。复用所需权限和媒体限制按条目来源核对。旧 MotionCore、Film 与 Remotion 条目继续沿原 renderer 条件。Canvas、SVG 或 WebGL 实现的采用以真实素材、路径、帧时钟、依赖和可重现画面为准。只改索引时先校核本片新增的 `metadata.categoryLabel`、`metadata.lookZh`（已有中文简介时沿用 `look`）和 `metadata.renderBackend`，在本地用 `python3 -B {SKILL_DIR}/scripts/laohu-styles.py build-resource-catalog` 刷新派生对比目录。

### 项目资源模式

每项正式采用资源在 `<direction>` 记录 `resource-use: <stable-id> — <对本片贡献与作用范围>`，并完成该 ID 的 L2 回执。默认 `resource-mode: 2` 至少包含一个真实采用的资源，来源和数量依本片需要。用户锁定单一主风格时用模式 `1`，登记 `primary-style`、用户原话及实际采用的其他资源。用户明确指定外部对标时用模式 `3`，记录用户原话、项目内 Benchmark 来源记录的 ID、路径、SHA-256 和本片贡献。尚未成为正式资源的 Benchmark 方法按 Evolution 已授权的范围入库再采用。用户明确要求全程纯原创、排除目录与 Benchmark 时，记录原话并选择 `original-only`。

### 分页与回执恢复

`input-map <project> --resume` 沿用同一项目已记录的规格，再一次输出当前目录。已有作品明确要求全新重做时使用 `--full-redesign`；局部修改可走只读目录。旧脚本可继续通过 `input-prepare <project>` 只准备回执，再以 `input-page <project> --next` 逐页读取同一星图。兼容分页时用 `--page-characters` 设定每页 2000–8500 个 Unicode 字符。终端截断时从当前 `.showreel-input-delivery.json` 的 `pageRecords[].id` 取页 ID，用 `input-page <project> --id <stable-page-id>` 重放。L2 用该候选自己的当前页 ID，以 `input-candidate <project> --id <resource-id> --page-id <candidate-page-id>` 重放。候选局部重放只证明本次返回该页，完整进度仍依每页实际送达。已有项目用 `input-map --resume` 更新星图回执。校验通过的候选旧回执可继续使用；来源身份、正文或分页版本变化时，只重读受影响的采用项。

### 字体与排印查询

用 `resource-overview --scope fonts` 浏览全库，按实际原句执行 `resource-search --source fonts --query <关键词> --text <实际屏显>`。选中后执行 `resource-get --id <font:稳定ID> --text <实际屏显>`，核对实际文件、许可、字重和原句用字。字体用 `font:` 标识，排印做法用 `type-use:` 标识。采用项读 L2 后，按[字体声明、测量与消费](typography-and-legibility.md#把选定的字体交给工程)连到真实画面。

## 屏显文字的渲染预检

运行 `text-contract <project> --text-direction <本轮方向名>` 检查整片。字幕和画面文字按[原生双语讲解字幕](typography-and-legibility.md#原生双语讲解字幕)登记。需要与实际规格一致时传 `--size` 和 `--fps`。用 `--start`、`--duration` 指定局部预检时，帧网格以开始时点为原点。静帧只检查实际请求的时点。正式渲染、最终预览和导出沿同一合同执行，动态小样只覆盖选区。

默认浏览器实际执行每个必显字项完整可读段的首、中、末帧，在实际帧网格上去重。只含一帧的阅读窗检查该帧。另采文字出现区间两侧、`timeline.js` 现有 `SHOTS` 的首末帧、整段首末帧和每五秒的巡查点。整片预检发现必显字项在片外、阅读窗内缺少绘制，或阅读窗短到没有输出帧时会失败。静帧及局部核验把未覆盖的阅读窗记作 `NOT_COVERED_ENTRY`。完整可读时点上缺少该字项会阻止当前预检。

`--exhaustive-frames` 可加在 `text-contract`、`render`、`probe`、发布预览的 `progress`、`build` 和 `build-long`。有时段的命令按该时段逐帧检查，取静帧的命令仍检查请求时点。报告写入 `.cache/brief-text-coverage.json`，分别记录默认采样 `PASS_SAMPLED_RENDER_TRACE`、逐帧 `PASS_RENDER_TRACE` 和静帧 `PASS_STILL_RENDER_TRACE` 及实跑帧数。分章预检在终端记录结果；显式 `chapters[].inputs` 由本地入口补入实际字图、字体和字幕运行依赖，原清单可继续使用。源于同一完整字图的章节在共用依赖变化时重新渲染。这些结果证明受控绘制调用，正式交付仍要正常播放核对识读、遮挡、节奏和声音。

## 默认显示真实制作进度

确认 work root 后运行 `editor <project>`，在浏览器打开命令实际返回的本机 `/progress`。页首显示工程片名；宿主只传入 UUID 工程目录名时显示「动画」。主界面上半区左侧常驻素材库，右侧按成片时钟预览当前工程，下半区为全宽分类时间轴。已有处理后片段时默认展示处理后素材，可直接切换原始素材与历史记录。单击预览播放全片，再点暂停；要指定画面对象，先点「指认片段」，再点目标，重叠对象按实际命中结果选择。制作进度在同页展开。

首次用 Node.js 22.18 以上及官方 checkout，默认查找工作盘 `.cache/upstream/openmotion`，也可用 `LAOHU_OPENMOTION_SOURCE` 指定同盘 checkout。构建产物、依赖、临时文件与编辑历史都写在工作盘。延用已交付的地址时，可在核实原服务和恢复方式后用 `--port` 绑定原端口。Studio 会同时占用一个原生服务端口。`--progress` 兼容现有命令。

编辑工程放在作品的 `studio/openmotion/project/index.html`。现有 Showreel 作品可提供项目内 `studio/prepare.mjs`，从源时间线生成原生编辑副本。启动器给它传官方源码根，并在检测到已登记源文件变化时重新生成，Studio 通过自身项目文件监听刷新预览。生成之前检查字幕和时间线一致性。若源数据暂未同步或已经人工改过需要重建的副本，保留副本并显示源文件同步待核验。源工程、最终导出和 Studio 编辑副本分别各有实际路径。由 Studio 修改的位置写入副本，后续回写源工程沿项目已有交接方式进行。

映射 `data-start`、`data-duration`、`data-track-index` 和原生播放器时间到源 `render(t)`。制作轨道接真实旁白和混音、已声明字幕的实际 cue、已经发布的代码帧、相邻动作段和接缝。点按带实际时点的条目跳到该条目可显示的第一帧。Cover 图在 Garden 制作阶段中打开对照。Garden 只向同源工作区发 `laohu-studio:seek`，工作区将自身播放器的 `laohu-studio:ready` 和 `laohu-studio:time` 回报 Garden。浏览器无法完成核验时交付已核实的地址、当前页面状态及尚待检查的功能。

进度沿「采用的输入素材 → 配音 → ASR 字幕 → Brief（按需章节轴）→ 关键帧 → 分段动画制作 → 音乐 → 音效 → 混音 → 成片评审／导出」展示。确认需要章节导航时，SRT 就绪即在 Brief 阶段整理章节名、语句和边界，绑定成片时钟；项目登记 chapter-navigation 或章节元数据后展示。可在工作台配置用 `chapterAxis: true/false` 明确选择。成片时钟建立前，可登记 `chapterPlan: [{id,title,firstCue,lastCue}]`，用真实 SRT 条目显示规划区间；绑定当前章节事件后开放工程回放。接缝继续按实际证据核验。

关键设计帧读取本轮选用并与时点匹配的设计 PNG；来源可为 Cover、程序或本地对标图。工程实现帧按相同事件、成片帧率和当前剪辑调用实际工程渲染。制作顺序先设计再实现。进度仅设一个「关键帧」菜单，按时间列出「第 N 帧 · 名称」和时码。按事件 ID 和时点配对，左侧为「设计帧」，右侧为「实现帧」。设计图和工程画面等比例并排，可放大或拖动叠图分界线；工程画面待就绪时在对应位置标明。分段动画按可用空间等比显示完整画面。点画面播放当前区间，再点暂停，播至段尾自动停止；播放状态图标和时码叠在画面上。长片段列表独立滚动，导演说明可展开查看。旧图、候选小样和替换记录放在素材库的历史记录中。音乐和音效分别从当前启用且实际有文件的剪入片段读取，混音使用实际母带。

素材库的原始素材来自用户导入。已有来源明确的工程文件可在工作台配置用 `userInputs: [{file, name, clipIds}]` 登记；处理后片段可用 `sourceFiles` 关联原文件，多次使用逐条保留编号。原始素材页显示全部输入与调用次数，制作进度只显示本版调用者。处理后素材页保留可复用片段；从时间轴移除的使用可在历史记录放回。登记清单可用 `history: [{file,title,date}]` 留下替换的处理后文件，替换前保留原文件。

通用入口识别现有工程路径。仅当文件位置或工作台显示名称需要覆盖时，放一份 `.showreel-progress/workbench.json`，包含实际 `voice`、`subtitleCandidates`、`mix`、`covers` 或现场镜头 `labels`。若需发布新的动作段或接缝检查，在 `.showreel-progress/workbench-checks.json` 的 `segments` 或 `seams` 写当前 `renderRevision`、真实 `t0` 与 `t1` 或 `time`、`checked` 或 `rework`、可访问证据 `file` 及 `note`。动作段和接缝状态只在证据对应当前区间及运行版本时更新。工作台配置与检查记录使用已有进度目录，避免工作台改动引起工程确认指纹变化。

打开页面后实际拖动前段、中段、后段，点击一条 SRT 和一张代码帧，检查同秒的画面、音频位置、时间尺和字幕。再播放一段、核对阶段证据与媒体可访问性。服务响应只能证明链接可访问。

制作进度的序号始终保留。待制作显示默认色，实际制作或返修显示黄色转圈，本版结果生成显示绿色勾。并行片段分别登记，各自结束；有条目在执行时，所属阶段也显示运行。点选、待评审、等待确认或仅有计划时码均不构成执行。

制作端开始处理或返修具体条目时，运行 `node {SKILL_DIR}/scripts/laohu-showreel.mjs progress-task <project> start <stage> <条目ID> [名称]`，保存返回的任务编号。动画使用 Brief 的制作片段 ID，关键帧用帧 ID，声音用已登记的片段 ID；新条目使用计划中的稳定 ID 与可辨名称，生成后沿用这个 ID。阶段可用 `input voice srt brief chapters cover motion music sfx mix export`，整阶段任务省略条目 ID。成果接入本版工程后，用同一入口 `progress-task <project> finish <任务编号>` 结束；中断或失败用 `stop <任务编号>`，重试重新 start。多个制作端各自结束自己的任务。阶段的现有 `progress --stage` 回执继续生效，登记整阶段运行的制作端在该阶段实际结束时同步收尾。

阶段开始、真实状态改变、方向帧/动态样片可看以及镜头、章节或声音等重要成果自查后，在同一个工作台更新状态并发布可检查结果。更新按有意义的阶段/成果进行，不按每次代码操作刷新；状态与完成数量必须来自实际工作，不编造百分比、不发布占位画面、不隐藏未完成项。原版 `progress.md` 的阶段操作、发布和确认后解除等待仍可按实际接口使用，但其首段“用户提出才启用进度展示”在本地新项目流程中不再作为默认工作台的开关。更细粒度日志、用户是否要求每段都单独说明/回复，与默认可见真实制作状态分开处理。

原版 `editor.md` 第二段与 `progress.md` 第一段存在“用户提出才显示制作过程”的旧触发条件；本地流程适配的落点是入口行为和新项目生成的 `brief.md`，不改受保护原件。新项目脚手架/brief 生成器根据 `brief-template.md` 生成项目 brief 时，在 `<inputs>` 替换 template 的“制作过程预览：启用 / 未提出；用户反馈依据……；进度页链接……（启用时按 progress.md 更新阶段成果）”字段，改为记录正式制作默认主动打开同一工作台、按可检查阶段成果更新、用户另要的细粒度过程汇报，以及实际服务/页面启动状态和真实链接。在 `<start>` 把 template 的“已定风格：先出 hook、记忆点、结尾三张风格帧”与“未定风格：先给 3 个拉开差距的方向”改成按本片未决选择和关键状态提供足以看出实质差异的关键帧，不预设固定张数；方向未定时等待用户选择，方向已定时显示本方向关键状态，连续运动是关键表达时同轮附动态小样。只写当前实际支持的生成入口。另将“画面与混音准备好后默认打开 editor.mjs 工作区”改成 work root 确认后尽早打开同一进度工作区，在有意义的阶段和可检查成果形成时更新，并保留最终预览/导出确认。页面未打开前只写“待启动/待打开”，不假填链接。项目副本保留原八个 XML 块；模板、原版 editor/progress 文档与 source-lock 都不修改。

### 可控制的成片片段

Motion 将已经剪入作品的每次使用登记到工程的 `assets/workbench/clips.json`。时间一律用成片绝对秒；同一素材多次使用各有稳定 ID 和类内数字编号，按工程持续追加，即使移动、删除、撤销或重新生成清单也保留编号，退役号不再分配。以 `assetId` 关联同一可复用的处理后素材。音频重叠自动增加显示行，播放和导出共用一份实际混音。时间尺可拖动，字幕和设计证据可跳到同一秒。

默认将制作进度放在居中的大对话框，点阶段即展开该阶段的条目菜单，直接点条目查看详情和预览。带时码的条目按成片开始时间排列，展示片段名称、已有的轨道编号及起止时码，单帧展示帧时点；多条内容的菜单独立滚动。关闭回到原选区和播放位置。工作台聚焦时 Y 切换当前片段的隐藏或启用，Delete（Mac 亦可用退格）移除，空格播放／暂停全片，Shift + 空格从片段起点播至末帧停止。Windows 用 Ctrl + Z 撤销、Ctrl + Shift + Z 重做；Mac 同时接受 Option 或 Command 搭配相同字母和 Shift。在输入框和制作进度内保留本地键盘操作。

清单含 `version: 1`、`duration`、`clips`。每次使用含 `id, kind, number, title, t0, t1`。kind 取 `animation, video, voice, music, sfx`。视觉片段提供项目相对的真实 `thumbnail`；已处理的视频、声音、图片用 `file`。多次用同一素材时沿用 `assetId`；已准备而尚未使用的素材登记于可选 `assets` 数组，每行给出 `id, title, file`。音频波形用本段实测的 `peaks`，单段文件应提供 `sha256`。只发布当前可交给工程代码的文件。项目路径须能经本地工作台提供，如 `assets/` 下的媒体。要从已合成 WAV 独立静音或移动声音，提供不可变 `baseMix, baseMixSha256`，正式出口 `mixTarget, mixReceipt`，以及每次使用实际混入基准母带的已处理 48 kHz 声音；使用原有音量、声像、淡化和压低包络，先核对各段在原时钟相加的结果。没有独立声部时保留原生监听。改动通过同一接口更新项目实际混音与哈希回执。输入刷新后重新核对基准与各片段，避免用旧缓存削减新版母带。

本地 Showreel 脚手架把通用 [画面分层模块](../templates/runtime/openmotion-studio/media-layers.mjs) 放进项目。正式页面在自己的 `render(t)` 注册后加载它。HTML 视频、图片和透明层用 `data-workbench-id` 指向本次使用，`data-start, data-duration` 给成片区间；有裁切的原生视频用 `data-media-start` 给源内起点，原声独立交混音。Canvas 按同一 ID 在绘制时调用 `window.workbenchVisible(id)`；移动对象由工程提供 `workbenchHitTest(time, x, y)`，x/y 是画面内归一化坐标，返回此位置的可选片段 ID。独立源工程也可自行实现同一契约：每次导出先读取 `assets/clip-state.json` 的 edits，预览支持 `applyWorkbenchEdits(edits)`，在实际画面上消费 hidden/deleted。对按输入清单缓存的分章导出，把状态文件和分层模块加入该章实际依赖。选区或鼠标坐标本身不改变成片。

采用新版[制作片段登记](production-collaboration.md#时间片段与工作台交接)时，`/__workbench/model` 的 `designPlan` 直接投影当前 Brief 和实际时间输入，`units` 提供其中承担动画制作的片段。`/__workbench/cut` 复用同一份动画任务投影，主轨上的 `clips` 仍由实际剪入的素材使用决定。设计阶段可以先看到制作任务和计划帧，增加帧无需重新划分片段。旧工程继续按已有六列 `<production-units>`、剪辑清单 `units` 或源镜头区间与 Brief 的实际 cue 表显示。

按登记的 `帧ID@秒` 用下节的 `--frame-event` 和 `--frame-at` 发布实际 PNG，工作台按本段设计、登记时点和画面角色关联。整段或接缝已核时，沿用 `.showreel-progress/workbench-checks.json`，在 `segments` 的旧有真实范围、`renderRevision`、状态和可访问证据字段上增写 `unitId`、`unitDesignRevision`。在 `seams` 的旧有字段上增写 `fromUnitId`、`toUnitId`、`fromDesignRevision`、`toDesignRevision`。设计版本值取当前 `designPlan.units[].designRevision`。单次可播样片显示其真实覆盖区间，只有本版与整段范围匹配的验证才记为完成。方向确认和最终导出授权沿用实际原流程。

Brief 中选定的字体、字重或屏显实例变化后，在同一工作台查看本版真实预览。受影响段的旧关键帧和小样可在历史记录查看，当前核验使用重新生成的对应时点与播放区间。若预览报缺字或文件不可用，用提示中的屏显 ID 回到[原句试排与字体绑定](typography-and-legibility.md#把选定的字体交给工程)，待预览恢复后复核该处。

同项目的 AI 指令和人工按钮共用 [片段修改入口](../templates/runtime/openmotion-studio/clip-edits.mjs)。先运行 `node {SKILL_DIR}/templates/runtime/openmotion-studio/clip-edits.mjs <project> list`，得到版本、片段号及当前选择。“这个”需对应本项目选中项；选中项的版本已过期时核对片段是否仍是原对象。再以当前版本调用 `… <project> <action> <id> <revision> [value]`；action 取 hide/show/remove/restore/undo/redo，声音另有 shift（相对秒，负数提前）与 gain（相对原音量的目标 dB，支持衰减）。undo 撤销最近一次编辑，redo 重做刚撤销的编辑，两者 id 均可填 -。新编辑生效后清空重做历史。复杂创作反馈沿现有工作会话实施，再回到所选区间核看。页面的“口述”使用本机录音和已安装的本地 Whisper；启动进程通过 `LAOHU_WORKBENCH_WHISPER` 与 `LAOHU_WORKBENCH_WHISPER_MODEL` 指定可信可执行文件与本地模型。没有本机识别器时可用文字和系统听写。隐藏、移除、放回、撤销都只影响这次使用。打开/关闭浮层、收起分类或试听素材不应改变剪辑。

验收在隔离工程中按编号隐藏一个叠加画面并导出同秒短样，核对下层画面；移除同类声音的一次使用并试听、重载、撤销，核对素材留存与原母带还原。真实作品保持用户当前剪辑。含原生视频的项目还要核对视频到帧与单一音频主时钟。

### 方向帧与同一状态的工程实渲

在 `<direction>` 写 `styleframe-source: cover` 采用本次 Cover 设计阶段取得的实图。普通代码路线可写 `styleframe-source: code` 或省略。采用已有对标 PNG 作为本版设计帧时用 `styleframe-source: reference`，在 Brief 说明来源与借用之处；多种来源并用时写 `mixed`，每次发布仍给出该帧的具体来源。按本轮项目像素规格检查实际单帧。方向帧与实渲对照放在项目的 `qa/explorations/`，直接进入成片的图片或图层按工程已有的素材归属存放。生图实图带实际来源与 Cover 制作说明，代码帧用本片 `render(t)` 输出。发布使用项目相对路径。

每张图用简短、稳定的事件 ID 与实际秒数关联 brief 中要检查的状态，例如 `fold-open`。同一时点有两个方向时，分别用 `fold-open-paper`、`fold-open-ink` 并在 brief 写明相互关系。方向待确认阶段发布 Cover 图或代码帧：

~~~sh
node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage style --preview <实际-Cover-PNG> --frame-source cover --frame-event <event-id> --frame-at <seconds>
node {SKILL_DIR}/scripts/laohu-showreel.mjs render <project> --text-direction <本轮所选方向名> --still <seconds>
node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage style --preview <这一次单帧渲染-PNG> --frame-source code --frame-event <event-id> --frame-at <seconds>
~~~

按正在采用的路线执行相应发布，已有不带帧来源和配对选项的旧代码帧调用仍可用。方向获得当前确认后，从本片工程渲染同一个秒数，再在工作台发布工程实渲：

~~~sh
node {SKILL_DIR}/scripts/laohu-showreel.mjs render <project> --text-direction <本轮所选方向名> --still <已确认方向帧的秒数>
node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage style --preview <这一次单帧渲染-PNG> --frame-source code --frame-event <同一个-event-id> --frame-at <同一秒数> --frame-role implementation
~~~

工作台用“设计目标图”和“工程实渲”表达来源与用途。并看同一状态的实际图，核对哪些外观与关系已经达到方向目标。实渲对照属于制作结果。待修改的目标图按对应事件更新，已确认后使用 `--reopen` 开启新一轮。替换事件时更新该事件的图并撤去它的旧实渲对照，其余事件图可用于新一轮整组检查。改变方向、截图集合或相关 Brief 后按当前实际范围重新确认。实图的文件、画幅与身份核验只给对应关系和现场证据。方向确认仍依据实际用户反馈或明确免除范围，连续性另按下节证据核对。

### 动态检验声明与实际工作台入口

Analysis 在项目 `brief.md` 的 `<direction>` 写 `motion-probe: required; reason: ...` 或 `motion-probe: not-required; reason: ...`，理由须用人能理解的关系和过程说明检验对象；脚本只解析声明，不会替专业人员判断题材。`required` 时，方向关键帧仍按用户确认流程发布并等待反馈；Motion 需要依理由选出真实动作/时间范围与 `purpose`，用以下任一受管探索入口生成草稿，并确认它在同一工作台实际可回放：

~~~sh
node {SKILL_DIR}/scripts/laohu-showreel.mjs probe <project> --text-direction <本轮所选方向名> --start <seconds> --duration <1..6> --selection <shot-or-time-range> --purpose <具体待检验的动作或衔接>
node {SKILL_DIR}/scripts/laohu-showreel.mjs progress <project> --stage scenes --publish . --draft-probe --text-direction <本轮所选方向名> --duration <1..6> --selection <shot-or-time-range> --purpose <具体待检验的动作或衔接>
~~~

`probe` 生成真实 MP4 与工作台可播放的动画 WebP；随后用 `progress <project> --stage style --preview <该 WebP 路径>` 将它发布到同一工作台并保持 `waiting`。`--draft-probe` 则把当前项目发布成不超过六秒的无声、非 final `scenes` 可播快照。六秒是这两条本地探索入口的单次上限，不是设计时长限制；需要时按有意义的选区分次取样。两种回执都标记为草稿且不代表正式制作或导出；Motion 仍要实际播放并核对 reason 指定的对象、动作阶段、速度/接触/揭示/落定/交接或声画时机。当前入口将样片和本轮 brief、候选、规格及工程设计指纹绑定；相关设计或工程内容变化后须重新取样，不能用旧样片通过本轮方向确认。静帧可以支持外观和构图判断，不能替代必要的连续性检验。

不需要动态验证时，`not-required` 的理由须说明当前主张为何是静态关系/构图，并指出设计不依赖的连续性质；它不能用来省关键帧、绕过用户确认或因为取样不方便。动态判断是人写给 Motion 消费的设计交接，不是 `purpose` 参数本身，不是四帧数量，也不能只写“检查是否流畅”。

## 依赖安装和卷检查

薄入口将 Node 依赖按原版 package-lock 锁定到当前 work root 的：

- .cache/laohu-showreel/runtime/<锁文件 SHA 前缀>/：隔离的 npm project 与 node_modules。
- .cache/laohu-showreel/npm/：npm 下载缓存。
- .cache/laohu-showreel/playwright-browsers/：Playwright 浏览器。
- .cache/tmp/laohu-showreel/：工具临时文件。
- 项目自身 out/、qa/、媒体和分章缓存：沿用 showreel 工具原约定。

依赖包、浏览器、TMP、测试媒体和构建/导出媒体必须解析到与 work root 相同卷；入口解析 .cache、所有现有符号链接和输出路径后再确认。它不检查 Skill 安装目录是否同卷，因为只要求可写的大文件、缓存和输出跟随 work root。发现 work root 不存在、卷不可用或某个目标符号链接指向另一卷时停止，不回落到系统 TMP、home 缓存或其他磁盘。

setup 把原 package.json 与 package-lock 原字节复制到 work-root cache，使用 `npm ci` 安装闭包；原版 setup.sh 保持原样，薄入口把 work-root 的 node_modules 路径、Playwright 浏览器路径、npm cache 与 TMP 环境变量传给它。普通运行不在 Skill 安装目录创建或删改 `scripts/node_modules` 链接；若发现源目录已有指向其他位置的链接，会改从已校验的本项目执行副本运行，不争用或抢删该链接。用户直接运行原版 setup.sh 可能向 Skill 目录安装 package，因而不要绕过薄入口。

首次失败后先读实际路径和错误；可恢复的依赖/缓存损坏应先保存当前目录，再修复同一 work root 路径。不静默重装、删除已有用户缓存或转换到其他磁盘。播放器工作区、子帧渲染与 ffmpeg 中间文件的路径从本项目确认的输入和输出计算。

### WebGL2 与离线 Three.js

新环境在已确认的 work root 运行 `setup`。Three.js 按[扩展依赖锁](../templates/runtime/vendor-lock/package-lock.json)安装到 `.cache/laohu-showreel/vendor/<lock-hash>/node_modules/three`，npm 校验固定发包的完整性。首次取得浏览器或依赖包时需要下载。只准备二维工程时可运行 `setup --without-three`。

纯着色器可以直接使用 WebGL2。需要 Three.js 的新工程给 `scaffold` 加 `--with-three`。它会从该 work root 的本地缓存把 `build/`、`examples/jsm/` 和 MIT 许可放到项目内的 `vendor/three/`，并在 `index.html` 的模块脚本之前写入 import map。用 `import … from 'three'` 以及 `three/addons/…` 引用，不需要在作品目录另装 npm 包。保留 import map 和项目内模型、纹理、字体等实际资源路径，确认工作台和 `render --still` 都使用本机文件。二维 `scaffold` 可以直接使用现有命令。

首次调用需要 headless 浏览器的渲染入口时，macOS 优先验证 Apple Metal。若着色器无法成帧或未识别到 Apple Metal，继续试浏览器默认的 ANGLE，必要时再试 SwiftShader。成功的选择最长复用 15 分钟，并按主机、会话、执行权限环境和浏览器路径隔离。同一命令的文字预检和导出继承同一选择。`SHOWREEL_ANGLE` 明确指定时按原值运行；`default` 使用浏览器默认选择，`swiftshader` 明确选软件渲染。目录查询、脚手架和日常工作台服务启动不预先启动 headless 浏览器。工作台画面由实际打开它的浏览器绘制。

`doctor` 会重跑 16×16 像素的 GLSL 着色器并报告中心与背景像素。准备 3D 工程时运行 `doctor --webgl-smoke`，它还用本地 Three.js 和几何 addon 实际绘制并读取像素。浏览器可用但 WebGL2 无法成帧时，二维流程仍可继续，3D 专项检查返回失败。长片正式导出前，在计划用于导出的同一浏览器环境检查实际着色器模式和代表段耗时。

## 项目协议与回归

受管项目正式构建前，本地入口读取当前输入回执里的 `SIZE/FPS` 并注入构建子进程；同时静态检查项目内普通文件 `build.sh` 的可执行行是否声明 `SIZE=${SIZE:-...}`、`FPS=${FPS:-...}`，是否把 `--fps "$FPS" --size "$SIZE"` 传给 `node "$SKILL/scripts/render.mjs"`，并把 `--expect-size $SIZE --expect-fps $FPS` 交给 `node "$SKILL/scripts/inspect.mjs" qa`。不满足就停止，先按本轮同一规格修正 `build.sh`、重新发布最终预览并取得确认，再构建。该检查是对当前脚本文本的静态契约核验，不证明任意 shell 逻辑的真实语义，也不构成操作系统级防绕过；命令回执记录的是执行端声明，不认证调用者身份。

采用现行方向确认的工程，在 `progress <project> --stage review --publish . --final --text-direction <方向>` 发布时冻结本版音轨。已有混音可以用 `--audio audio/final.wav` 指定。分章导出可用 `--chapter-manifest film.json`，入口按项目根清单选取整片混音，或按实际章序拼接各章音轨并为无音轨的章节留出静音。在工作台「成片评审 / 导出」打开「预听本版最终混音」，与当前发布的画面一起审看。无音轨的版本按静音发布，保持现有旧项目的审批路径。

正式构建沿用已确认预览的实际音轨。`build` 使用本版混音，`build-long` 核对清单选用的整轨文件或章级音轨拼接结果。换轨时重新发布和预听同一版本，再记录导出确认。每次原生旁白验收生成的 `audio/narration-qa.json` 属于检查结果，旁白时间、混音登记和音频文件继续参与快照核验。

项目页面遵守原版 stack.md 的 window.DUR、window.render(t)、window.READY。每帧只依赖 t 与固定输入；字体、影像、模型、纹理和屏幕录制帧准备完毕才 READY。Motion 按真实画面使用 HTML/CSS、Canvas、SVG、WebGL、Three 或媒体层，不把项目改造成固定 props 模板。

入口的 test 调用原版 scripts/package.json 里未删减的测试组；执行副本中的测试源文件按 source-lock 逐项核对，测试只写到当前 work root 的 TMP/cache。算法和测试内容仍只有原版一份，不在入口维护第二套实现。测试失败照实报告，不为让测试通过改原版文件。对实际作品还需按原 review.md 完成真实帧、连续片段、字体/素材、音轨和最终 MP4 检查；测试本身不是作品质量证据。静态技术 PASS 仅证明对应的技术条件，不能替代连续运动审看、重点/主次、转化前中后与落定反应的审查；长片应检查代表性中后段是否继续发展构图、景别、空间和节奏。
