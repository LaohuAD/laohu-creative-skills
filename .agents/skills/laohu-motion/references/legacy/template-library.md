# Motion 复用目录：局部效果、整段模板与渲染

> 适用范围：此目录说明既有共享 catalog、成熟代码与旧 Film/Remotion consumer，供旧工程核对和按需兼容。新动画的资源选型与制作见 [本地 Showreel 输入](../showreel-runtime.md#设计输入与资源查阅)。这里的旧 renderer 与显式兼容索引不替代新工程入口。


沿既有 Film 或 Remotion 工程查找其已登记的组件、成熟代码和模板时，使用本参考。它检索局部 `effects`、成熟动作组/完整镜头及方法参考索引。局部构件、成熟动作组与完整镜头不是固定的逐级选择顺序；按本段用途、材料/内容适配、承重动作职责、复用尺度、前后接续条件、对象生命周期、真实可调参数与运行状态比较资源。`availability` 说明技术入口是否已接通；`motionUse.intendedUse` 说明资源是生产实现还是参考演示，`motionUse.reuseScale` 说明它以原子、耦合组或整镜范围复用，`ordinaryProductionCandidate` 决定普通自动制作能否把它作为生产候选。浏览和 overview 可查看全部资源；discover/普通制作只选择已明确分类且符合生产候选条件的资源。分类缺失时不猜。没有适用的共享候选时，source-only 索引可用于理解和检索来源机制，但仍不能作为 production renderer 的直接输入；项目可以用 `laohu-project-shot` 将本片几何、对象、文字、时序和布局与已接通成熟模块组合，见[工作项目项目级镜头](motion-runtime-contract.md#工作项目的项目级镜头组合)。这项本片构图不更改共享 catalog，也不绕过实际 Film consumer、依赖哈希和 receipts。成熟来源的布局/曲线/材质/相机算法保持原语义；不摘要后另造近似实现。用户不必先点名模板、先选画风或先填新字段表。

## 真源与调用状态

`templates/catalog.json` 是共享候选与来源状态的唯一机器目录。通过 [`scripts/templates.mjs`](../../scripts/templates.mjs) 的实际接口查看与调用；来源台账 `templates/maintenance/source-ledger.json` 保存完整 source-only 索引和来源文件 pin。项目自有 `.tsx` 镜头是作品内容与组合，不是新的共享目录条目；制作 receipt 将其真实输入与成熟模块闭包逐项绑定。原始快照由维护者按需保留为私有材料，不随生产分发；生产命令不读取它。原件对照只在维护者显式传入当前实际可用的 `--source-root <snapshot-root>` 时进行，源快照缺失就报告未比较。不要用仓库文件树、示例页、预览图或 README 推断某项已能渲染。被明确接通的共享闭包位于 `templates/runtime/`，生产从这些闭包加载并按 catalog 核验本地字节；catalog 与来源台账保留 commit、逐文件 SHA-256、许可、参数、固定机制、输入条件和状态。

style、template、effect、method 是不同资源类型，分别回答风格参照、可复用完整制作单元、局部效果和专业方法问题。读取当前目录时按这些真实类别分别查看；数量应从对应目录/`overview` 结果读取，不把类别行数相加成“动画能力总量”。目录条目既不代表彼此等价，也不表示每项均有可运行 consumer 或适配当前作品。

把资产事实分成四件事核对，不能互相替代：研究收录只说明来源或方法进入索引；代码迁入只说明允许复用的原件/适配件落在本地；consumer 接通须有真实生产入口按支持接口加载它；效果验证须有目标 renderer 的输出证据，必要时还要有实际播放/阅读审视。catalog/SOURCES 记录来源、许可、路径、hash、状态与映射；本文不复制另一份逐文件追踪表。技术可用性 `availability`、运行证据 `runtimeVerification` 与用途/复用范围 `motionUse` 是独立信息，不能互相替代：

- `available` 表示该项已接到本地登记的 renderer，可进一步准备、预览或渲染；它不等于运行成功或成片质量通过。
- `conditional` 表示须先满足条目所列输入和许可条件。没有本地素材、角色帧或必要环境时，只暂停依赖该项的段落。
- `source-only` 表示目前只有来源/预览/结构记录，没有登记可调用的 renderer；不可对用户称为本地模板效果或传给 `prepare`、`preview`、`render`。
- `verify` 检查脚本声明纳入校验的源文件 SHA-256 与运行入口闭包；通过只证明这些登记源码与本地快照一致，不证明许可解释完整、浏览器启动、动态画面或接收质量。部分 renderer 可以按 catalog 锁定的本地闭包清单核验其被接通的文件，而不要求在运行时重验整份 upstream tree；应以该条目实际登记的核验范围为准。许可范围、素材权益与具体 schema 仍按 catalog、原许可证和真实源码核对。

研究收录、技术可用性、意图分类、代码迁入、consumer 接通和效果验证是不同状态，不得用目录行数、vendored 文件、方法调用计数或源码哈希相互代证。`source-only` 不进入共享 renderer 的生产候选；这不禁止项目 `.tsx` 组合已经登记可用的成熟本地模块。运行时从受支持入口加载实际闭包，不把 `templates/upstream/`、研究缓存或源码阅读路径当成日常导入/运行路径。若只迁入代码但没有真实 consumer，仍未接通；若 consumer 已接通但没有本片输出，不能声称本片效果已验证；静态 `visible`、`opacity` 或蓝图声明也不能证明最终帧真实绘制且可读。各状态的出处与精确映射以 catalog/SOURCES 为准。

调用候选、来源范围和字段以 catalog 中当前标为 `available` 或满足条件的 `conditional` 项为准；目录可能同时包含 `source-only` 的场景、素材/预览、配方和局部源码索引。新增索引不自动意味着源码已 vendored、许可已覆盖或 renderer 可用。每次按内容任务、可用 renderer 和前置条件筛选，不从项目名、ID、目录数量或缩略预览推断可运行性。同一视觉效果若同时有 raw picture 与已接通完整声画入口，正常完整动画须将完整工作流纳入比较；逐项判断 `conditional` 的前提能否满足，不因另一 raw 候选为 `available` 而预先排除。只有无声/仅底片交付、独立音频计划已完整承接源声音，或本片具体声音判断支持移除源声时，才可为此目的走 raw/静音路径；完整入口是否适用仍由画面任务、素材/许可及原声音在本片的职责共同决定。

Video Shotcraft gallery 的 source-only 与本地 adapter 状态分别记录在 catalog；查询时按当前记录核对数量、adapter 身份和条件。这不是全部 gallery 的可调用化，也不代表每项都已验证为可用于本片。普通制作可用下文 `discover` 对导演已拆出的具体描述做词面检索；它不是语义理解器或自动审美选择。Shotcraft 的 `intent`、`family`、`target` 等过滤仍须使用 catalog 的准确标签，并核对候选字段中的用途、对象、生命周期、复用尺度、变体和状态。要共享接通须有维护任务授权。要按完整镜头、局部组件或 Motion 方法三路决定复用范围，并核对 `PaperTitleCard` 同名不同路径、局部 placement、动作锚点、时钟和 Film `/2` 限制，读取 [Video Shotcraft 源接入规则](video-shotcraft-integration.md)。`catalog.json` 和运行时若变化，实际状态以当前条目为准；本段汇总不是替代运行检查的第二份登记表。

## 旧 Remotion companion 本地组件与作者入口

本节只供既有 Remotion/Film 项目兼容维护。新动画默认通过本地 Showreel 原生工程制作；执行细节见 [Showreel runtime](../showreel-runtime.md)。旧项目的 Remotion composition/renderer、Film 时间线和 `fy-code-animation` 闭包继续保留，组件与 helper 位于 `templates/runtime/laohu-remotion/{core,components,themes}`，Shotcraft 由其原有 Composition 消费。catalog 中的 `laohu-typography-track-in`、`laohu-background-flow-field`、`laohu-character-walk-cycle`、`laohu-data-animated-bars`、`laohu-media-photo-montage`、`laohu-three-volume`、`laohu-transition-overlap` 仍可由旧 `templates.mjs prepare|preview|render` 入口调用；媒体入口需要用户提供并核对本地素材。

旧 JSON consumer 只能承载数据，不能传递 Canvas 绘制函数、相机路径函数或其它回调。该分支的共享 TSX registry 仍包含 `laohu-authored-shot`、`formation-camera`、`material-craft`、`caption-type`、`glyph-anatomy` 等兼容/技术参考入口；`glyph-anatomy` 的 glyph 数据不能代替真实笔顺。registry 的 `MotionModules` 与 `@laohu/motion` 接口保留给对应旧项目。不要把回调编码成 JSON 或将 Motion Canvas 代码改写成 Remotion。

旧 Film 项目的 prepare、接线命令、哈希字段及实际收据见[工作项目项目级镜头](motion-runtime-contract.md#工作项目的项目级镜头组合)。Production-plan/Film 的旧 direction 产物沿其兼容 schema 维护，不作为新 Showreel 的默认输入。

```json
{
  "templateId": "laohu-motion-layer-router",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "durationInFrames": 150,
  "fidelityMode": "native-props",
  "layers": [{
    "catalogId": "laohu-authored-shot",
    "props": {"shotId": "formation-camera", "parameters": {"title": "同一条时间线", "bpm": 92}}
  }]
}
```

上述登记共享候选沿用各自旧 `templates.mjs preview|render` renderer。新 Showreel 项目的单片构图和运动实现由项目自己的原生场景承接；不能因旧 Remotion registry 的存在而把它改接到 Film `/2`。

## 风格提示词、样片与执行状态

`templates/styles/index.json` 是普通风格入口，当前 73 项由受保护的 43 张原版卡与 30 张准入新增参考组成；原版正文仍以 `templates/runtime/laohu-showreel/references/styles/` 为唯一真源，新增正文在 `templates/styles/entries/`。每项带来源、原文哈希、许可和 `reference-style` 路由；普通样式列表、搜索和完整阅读只读此索引。需要新方向时，通过分页 `styles fulltext --library` 完整读取全部 73 项，Analysis 再写入本片的独立设计。

旧 A–G 代码样片另存于 `templates/styles/compatibility-index.json`，共 25 个真实 `S.<ID>` 函数；它们仅供旧 Film/Remotion consumer 或明确兼容请求使用。普通样式搜索不会读取该索引。B3 无绘制函数，已不列入可调用兼容项；其余旧 341 条目和 43 张本地改写卡也不再是普通风格候选。旧项目可明确使用 `styles compatibility list|search|get|describe|fulltext` 检查 A–G，或 `styles compatibility preview|render` 调用它们；原 `styles preview|render` 命令仍作为旧脚本兼容别名保留。

```sh
node .agents/skills/laohu-motion/scripts/templates.mjs styles list
node .agents/skills/laohu-motion/scripts/templates.mjs styles search --query <观看任务/形状/材料/运动>
node .agents/skills/laohu-motion/scripts/templates.mjs styles fulltext --query original:blueprint
node .agents/skills/laohu-motion/scripts/templates.mjs styles fulltext --library --page-characters 12000 --json
node .agents/skills/laohu-motion/scripts/templates.mjs styles compatibility list
node .agents/skills/laohu-motion/scripts/templates.mjs styles compatibility fulltext --query A1
```

正式 73 项都是风格参考，不声明一键 renderer；Motion 将 Analysis 选定的外观、材质、构图、运动和声音设计，转成新原生工程中的逐镜参数。原 A–G 兼容索引保留 25 个真实绘制函数和其源合同，不把固定演示误当作可替换成片；A1 消费调用方 `--text` 的 `PARENT`，F1/F2 仍可供旧 Film Blueprint `/2` 的 `laohu-style-code-canvas` 使用。以下命令只适用于明确的旧 A1 兼容预览：

```sh
node .agents/skills/laohu-motion/scripts/templates.mjs styles compatibility preview --query A1 --text "今天我想讲清一件事" --output "$WORK_ROOT/.cache/validation/style-A1.png" --time 1.1 --work-root "$WORK_ROOT"
node .agents/skills/laohu-motion/scripts/templates.mjs styles compatibility render --query A1 --text "今天我想讲清一件事" --output "$WORK_ROOT/.cache/validation/style-A1.mp4" --duration-frames 90 --work-root "$WORK_ROOT"
```

旧兼容代码遵循原许可与真实 consumer；普通 73 项按各自 entry 的来源和许可使用。不得把本地改写卡说成原版、把预览当动态验证，或把来源许可扩写成通用发布权。

### 普通制作中的资源全貌、候选与真实 consumer

完整看资源再选，不先从几条热门模板或预设风格开始。根据已明确的观看任务运行一次全资源总览，了解生产模板、局部效果、支撑库、方法卡、风格提示和 source-only 参考各类别、计数与状态；总览只负责资源全貌与展开导航，不是所有资源正文。随后只对本片相关类型/类别展开详细候选，不预设候选数量或限定几何、暗底、卡片等视觉方向。

```sh
node .agents/skills/laohu-motion/scripts/templates.mjs overview --type all --json
node .agents/skills/laohu-motion/scripts/templates.mjs browse --type template --status available --json
node .agents/skills/laohu-motion/scripts/templates.mjs browse --type style --category M_动态风格 --json
node .agents/skills/laohu-motion/scripts/templates.mjs describe --type style --query <ID> --json
node .agents/skills/laohu-motion/scripts/templates.mjs styles fulltext --query <ID>
node .agents/skills/laohu-motion/scripts/templates.mjs show <runtime-candidate-id>
```

`overview` 是对当前 catalog、source ledger 和普通 style index 的只读总览，只给类别计数、状态/来源统计与展开命令，不另建平行资源索引。其 ``--type` 可选 `all|style|template|effect|effect-library|method|reference-index|source-index`，并支持 `--source`、`--category`、`--status` 只读核对相应资源概况；`browse` 沿相同类型展开匹配的完整候选记录，按需用同一组过滤条件收窄，不设 `--limit`；`describe` 读取具体 ID 的完整元数据、原始来源信息及登记的 consumer 条件；对 style reference 另运行 `styles fulltext --query <ID>` 才取得完整原文。`describe` 的 resource summary 或 style 摘要不是源文替代品。自然语言 `discover` 可作为补充词面入口，但既不能代替 `overview → browse → describe`，也不把某个固定候选数量设为停止条件。它的 `--limit` 是每个结果组/风格来源类别的显示预算，不是审美候选门槛；按实际相关类别和可读负担调整，并继续 `browse`/查询未展开的相关结果。检索结果带有可用分类/总命中/显示数时，不能把裁切后的页面当作完整资源全貌。

`discover` 只把导演已拆好的观看关系、材料/内容和动作/情绪描述映射到目录，不推断审美或替 Motion 选镜头。`available` 表示登记了本地 consumer，`renderable` 只指有 renderer 且 `available` 的候选；`conditional` 列出实际登记的前提，前提未核实时不可直接渲染。方法卡用于镜头/材料判断，不是 renderer；effect library 是支撑依赖，不是独立镜头。可生产但未登记 renderer 的异常项应返回 `notRouted` 并指向实际 `show` 核查，不能伪装成可执行候选。`source-only` 不作为可直接调用的 production renderer/生产候选；它是否适配审美方向由完整原文与本片机制判断。

资源状态必须分开：`available`/满足条件的 `conditional` 只表明已登记生产 consumer 或其前提，不证明本片适配或运行成功。挑定候选后，用实际 `show` 核对源码真实读取的字段、consumer、素材/许可/运行限制和前后状态；把候选原生构图、颜色角色、字层、材质、动作依赖、曲线、时钟与落态放回视觉设计中共同判断。已有目标画幅关键态要求应直接约束是否锁定候选：按本片声明的表现增益检查真实预演是否清楚承载它；若本段需要观众看清结构关系，而关键态只剩难辨的小图和重复清单，就返回候选筛选/组合适用入口。若承重任务由文字、材料、证据或体验本身完成，则按该任务核验，不强制变成关系图。`available`、`prepare` 成功或被调用只证明运行路径，不代表本片适配。`method` 卡承担判断，不是 renderer；`effectLibrary` 是支撑库，不是独立镜头。可生产状态却没有真实 renderer 的异常项不能伪装为可执行候选。`source-only` 只说明该风格原文自身不是可直接调用的 production renderer；若其视觉机制适配本片，仍可作为审美参考，实际制作另核并绑定已登记的成熟 consumer。

使用或拒绝一个风格时，先在正式索引中完整读取对应原版/新增参考及必要的专业 Reference，包括续段、适用条件与例外，再把拟采用的具体特征写入本片独立设计。新方向的完整阅读与 brief 由 Analysis 完成，Motion 在原生 Showreel 工程中实现。旧 Remotion 项目继续读取其本地兼容条目，并只把实际 callable consumer 作为旧 renderer 输入；风格参考本身不渲染。

对真正打开的新审美方向，先用 `styles fulltext --library` 逐页阅读当前索引中的全部原始记录；来源空条目也须如实纳入覆盖回执。overview、搜索结果、摘要和少数候选都不能替代全库原文。命令返回当前库指纹、每页 ID/区间、原始内容及 `nextCursor`；沿上页游标继续，直到末页 `complete: true`、`missingIds: []`，中途指纹或页大小变化就从第一页重读。单条过长时用 `--query <ID> --page-characters 12000`，按游标读完该条；不带分页参数的旧 `fulltext --query <ID>` 仍返回完整单条原文。覆盖回执只能核对本轮交付的 ID、页序和原文哈希与当前库一致，不能证明已经理解审美；方向判断仍要说清为何适合当前观看任务。

```sh
node "{SKILL_DIR}/scripts/templates.mjs" styles fulltext --library --page-characters 12000 --json
node "{SKILL_DIR}/scripts/templates.mjs" styles fulltext --library --page-characters 12000 --cursor <nextCursor> --json
node "{SKILL_DIR}/scripts/templates.mjs" styles fulltext --query <ID> --page-characters 12000 --json
node "{SKILL_DIR}/scripts/templates.mjs" styles fulltext --query <ID> --page-characters 12000 --cursor <nextCursor> --json
```

以下 `production-plan.json` 的 `new-direction`、`styleLibraryReview` 与 consumer 映射规则仅约束既有 Film/Remotion 合同。新 Showreel 项目读取正式73项完整索引后，由 Analysis 写唯一 brief；其 XML 块结构与交接规则见 Analysis/Motion 主文。旧计划的覆盖回执、方向片段、consumer 映射及 technical-probe 状态仍按原验证器核验，不自动迁移到新 brief。

普通 styles index 当前是73项完整参考（43张原版 + 30项新增），不含 callable 函数、旧提示词或空占位。旧 A–G callable 代码只由显式 `styles compatibility` 命令读取；其 `preview/render` 保留真实旧 renderer。静帧仅证明静态来源画面，不证明动态效果；正式风格参考也不注册 renderer。来源许可不能因本地已索引而扩大。

### 素材适配、获取与生产 consumer

资源核对完成后，按镜头职责检查本地文件实际包含什么、覆盖哪些动作/状态、是否有可用权利、是否适合本段材料与表现方向；有文件不等于有适用素材，素材路径也不只在模板/effect 零命中时才考虑。若无本地合适项，先判断观众确实需要看见什么，再沿负责且获准的来源取得许可明确的成品素材；若任务确需非证据内容资产、现成/外部来源不能胜任且生成范围已授权，才制作本片的图像资产并接入真实 renderer。外部获取结果须检查真实文件、来源/许可和 renderer 输入；搜索命中、下载页预览或目录中的 asset ID 不等于已取得素材。

素材取得后用 `list`/`show` 核对每种承载入口的固定能力与实际消费者：`video-clip-card` 只承载已有且获准的视频并输出静音画面；`laohu-media-photo-montage` 只承载已有且获准的 PNG 静图，运动限于其真实组件机制；`image-collage-explanation` 组织已有照片/文档/截图/视频帧，不创造其中没有的内容；`laohu-motion-recipe-wipe-reveal` 在支持的两张全画幅 PNG 或已预渲染 PNG 序列之间转场，不生成序列内未有的液体、蒸汽或其他动作。素材必须进入真实 renderer，再检查关键态与实际播放；不能把“consumer 可用”或“文件存在”写成成片已实现。

素材本身与表现 consumer 是两条要同时满足的链：先取得可用于本片的原件/成品，再找到能承载其身份、材料和动作职责的 renderer。若当前文件需要换一种画面表达，回到本镜材料—关系—动作方案后再接入；若授权、所需素材或 consumer 仍缺失，记录具体缺口并继续不依赖它的段落。不要因“没有素材”默认只画几何，也不要从 style prompt 摘要仿写成熟的绘制、排版或动作机制。证据原件缺失时暂停依赖该原件的主张，生成/重绘只能清楚标为示意，不能冒充来源证据。

原来的 43 张本地 Garden 风格改写卡及 source-ledger 的 style-profile 菜单已退役；正式 `original:<slug>` 条目直接读取受保护原版卡。为旧只读请求保留的 `show style-<slug>` 与 `show laohu-motion-style-<slug>` 是薄别名，转到对应原版卡，不会再读一份改写正文。旧 A–G 代码另由显式 compatibility 命令访问。

```sh
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --all
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --status available
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --type effect
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" styles list
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" show <local-runtime-candidate-id>
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --type effect --source garden-motion-showreel
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --type effect-library
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --type effect --intent focus
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --type effect --family relationship-mark
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --category local-effect
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" show laohu-motion-mo-staggered-target-reveal
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --source huashu-art-motion
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --source video-shotcraft
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" show data-chart-clip
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" show laohu-motion-dg
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" show laohu-motion-toolkit
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" verify
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" verify --source huashu-art-motion
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" prepare <template-id> --input /absolute/spec.json --output /absolute/prepared.json
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" preview <template-id> --spec /absolute/spec.json --output /absolute/frame.png --time 1.5
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" render <template-id> --spec /absolute/spec.json --output /absolute/clip.mp4 --assets-root /absolute/media --cache-dir /absolute/project/.cache/tmp/template-render --browser /absolute/chrome --ffmpeg /absolute/ffmpeg --manifest /absolute/evidence.json
```

`list` 默认列出可调用的 `available`/`conditional` 候选及当前三项本地 effect libraries；本仓库可直接发现 canonical `laohu-motion-dg`、`laohu-motion-transitions`、`laohu-motion-toolkit`。`list --type effect-library` 只查 libraries；用 `--all` 检查 source-only 和 reference-index，或用 `--status`、`--source`、`--category` 缩小结果。查看目录时要并行比较适用的完整模板/镜头、已登记动作组与局部 effect，再用 `show <id>` 读候选的真实布局、对象、生命周期、变体、renderer、参数、固定机制、前置条件和状态；脚本没有某个过滤参数时，不编造命令。完整动画若存在匹配的 raw picture 与完整声画入口，普通筛选要保留满足条件的完整入口供比较；raw 项 `available` 不代表 `conditional` 项不适用。不同 renderer 保持不同接口，不能将 Shotcraft 组件当作旧 Canvas effect。`show` 给出对应整段模板、局部 effect library 或来源索引的真实登记内容；整段 clip 的具体字段仍须核对原 schema 与源码。`verify` 检查声明 hash 的源文件、Git blob/source tree pin、运行入口闭包、effect library 加载列表和目录结构；通过只证明这些登记内容与本地快照一致，不证明浏览器启动、动态画面、许可解释或接收质量。

`list --type method` 不包含已退役的 Garden 风格改写卡；完整风格方向统一从普通 style index 读取。旧 `style-*` 名称只作单条原版卡的兼容别名，不出现在正常菜单。15 条 Garden recipe 仍是独立旧工程运行候选；读取 `garden-recipes.md` 可追踪其来源、消费字段和 Film renderer。recipe 是否可用仍以自身 catalog 状态、场景输入和实际浏览器回执为准，不以卡片数量推断。

`verify` 同时在每次运行时输出 `catalogCoverage`，从真实目录分别计算：source 条目和固定文件闭包、研究用 `sourceTreeIndex`、模板 availability 与逐项 source-only/conditional/available 清单、effect 条目、library 与 source method（登记行数、唯一函数 ID、被 effect 条目引用的方法数分开）、reference-index source-only 清单，以及字体依赖资产。它们是不同盘点对象，不相加成“可运行项”总数；特别是 source tree 研究索引不等于本地 vendored 文件，字体依赖不算动画模板，方法索引不等于可调用 renderer。维护检查应保留 source-only 行及其缺口、当前 repeat-pixel `FAIL` 和 conditional 条件，不能用提高统计数字代替逐项接通。旧静态 `catalog.coverage`/`runtimeStatus` 不再是第二份真源；当前精确总数与明细以这次 `verify` 输出为准。

局部效果查询使用精确的 catalog 标签，不对 `intent` 做自然语言相似度猜测。当前可查询 `focus`、`emphasis`、`mark`、`draw-on`、`path-reveal`、`reveal`、`delimit`、`group`、`relationship-mark`、`pulse`、`sequence`、`staggered-appearance`；`--family`、`--target`、`--runtime` 也按 `show` 中登记的原值精确筛选。效果实例不是整段模板：`laohu-motion-dg-draw-partial` 用原 `DG.drawPartial` 描显与静态目标完全一致的屏幕路径/线；`laohu-motion-dg-circumscribe` 用原 `DG.circumscribe` 对矩形做一次性圈注并在阶段结束清除；`laohu-motion-dg-brace` 用原 `DG.brace` 沿矩形边缘长出括号并保留；`laohu-motion-dg-indicate-frame-pulse` 用原 `DG.indicate` 的输出驱动圈注强调轮廓，不缩放目标对象；`laohu-motion-mo-staggered-target-reveal` 用原 `MO.lagged` 改变具名矩形自身的填充/描边透明度。catalog 中的 `huashu-dg-*` / `huashu-mo-*` 仅为兼容 aliases；运行示例使用上述本地 canonical IDs。静态模式保留原 screen-space 目标合同。显式 `geometryMode:"followTarget"` 只支持前三种矩形 DG effect 与 MO 错峰矩形显现：target 是 world-space rect，初始 geometry 对应场景时间 0 的源坐标矩形/边界，每帧使用同一 MotionCore evaluatedState 投影出的轴对齐 screen rect；目标不能 morph，目标和祖先须无裁切/source-over，owner 须为中性的后置 screen overlay。`DG.drawPartial` 仍限静态路径。MotionCore 不消费祖先 `layer.visible`，followTarget 会拒绝该属性及对应事件/绑定；隐藏目标用对象 `visible`，控制整层用 `opacity`。owner opacity 由 Core 消费一次；目标 opacity/visible 来自同帧 Core 状态，DG overlay 只继承目标 alpha 一次，MO reveal 由 Core 应用目标对象 alpha 后乘原 reveal progress。绝对时间采样支持乱序 seek，effect 的 source call、phase 和 target receipt 仍按实际消费记录。移动矩形焦点框也可查本地 `laohu-motion-follow-box`，但它是另一种 Screen overlay effect；followTarget 合同都不等于通用相机推近、任意形状跟踪或文字/image/path/morph 动画。

画面效果放在现有 custom 对象 `data.motionEffects`，通过 `effectId`、`targetId`、实际消费的 `geometry`、`parameters` 与 `phaseId` 接入；相位只登记一份在 `scene.phases[]` 或 `objects[].data.phases[]`，画面实例和 `audioEvents` 可共同引用，沿用 `durationSec`/`endSec`。DG 实例允许可选 `stagger`；MO 错峰项要求同组完整 `groupId/index/count/ratio`。静态几何仍按旧 screen-space 目标检查；followTarget 仅对 `DG.circumscribe`、`DG.brace`、`DG.indicate-frame-pulse` 与 MO 错峰矩形开放，geometry 是场景时间 0 的源坐标锚点，动态画面来自 `render.mjs` 提供的同一 scene 与 Core 第五参数 `evaluatedState`，不在 draw 内另做 scene evaluation。动态 target/祖先不接受 `layer.visible` 字段或其事件/绑定，因为 Core 不消费该值；可用 target-object `visible` 或 ancestor `opacity`。目标 opacity/visible 由 Core 状态解析，DG overlay 只乘目标 alpha 一次，MO reveal 仍由 Core 合成目标 opacity 后再乘源 reveal progress；原 `DG.brace` 的内部阶段 alpha 保留后与继承/target alpha 合成。followTarget 的 world-space rectangle 需保持有限、正面积、轴对齐投影；目标和祖先无 clip、source-over，effect owner 是中性的后置 screen overlay。`render.mjs` 校验实例和 catalog 登记的本地 closure，注册 adapter 并在 manifest 记录实例、实际 source call、phase 和透明度证据；低层调用使用 canonical `--template-effects laohu-motion-dg`，来源身份和兼容 alias 只留在 catalog/SOURCES。结构/浏览器/MP4 技术证据证明指定字段的消费，不替代作品和听觉质量接收。

`prepare` 按 entry 的实际 renderer 与原接口核对输入，验证对应源码 hash，并写出准备后的 spec 与 `.assets.json` 收据；clip 输入引用的图片或帧须在本地 `assets-root` 下且有权用于本片。`preview` 用原始入口按指定时点采样 PNG；需要多个状态时传 `--samples`。`render` 调用相应原始 `renderFrame(t)` 接口生成 PNG 或 MP4，可传 `--manifest` 记录证据。生成前核对输出、缓存目录及运行时；遵从项目实际工作盘约定，避免覆盖既有文件。只有 catalog 明确接到受支持 renderer 的条目可调用；不要把其他 renderer 或局部源码索引说成会自动运行。

Moessif/code-video-showcase 的两页使用 `native-html-canvas-template` renderer，调用原始 HTML 页、`common.js`/`themes.js` 与原 `window.renderFrame(t)`。`motion-code-video-showcase-big-card` 固定为 1920×1080、一秒，保留原 layout=0..3 分支（当前 2/3 都使用居中构图）、两次 slam 与 HUD；实际 query 控制是 `layout/index/total/color/first/keyword/brand/theme`，不接受 `t0/speed/dur/title/subtitle`。`motion-code-video-showcase-segment` 保留原 impact/主题/背景构图；`duration/t0/speed` 由原 `createSegment` 消费，品牌、标题、字幕与可选的胶囊名称/分类由适配层对源 HTML 文字作 JSON 安全替换。胶囊字段 `capsuleName` 默认“章节”，`capsuleCategory` 默认空文本；它们是本地适配字段，不是上游 query 控制。为隔离前序 Canvas 对齐状态，适配层在两处原 `drawCapsuleLabel` 调用外包 `save`、显式左对齐和 `restore`，不改上游绘图函数或 renderFrame；收据分别记录上游 HTML pin、派生 HTML hash、文字替换和调用点补丁。页面是单行文字布局；`aqua-morandi` 玻璃分支不读取 subtitle，故该主题下不能把字幕声称为有效字段。两页画布尺寸固定，duration × fps 必须整帧对齐。主题色会走原主题函数；主题 `type.fonts` 是元数据，页面并未据此改变 `ctx.font`。

`templates.mjs preview/render` 默认用本机 Chrome/Chromium 的 software/SwiftShader capture，并在原始画布创建时请求 `willReadFrequently`；manifest 会记录浏览器可执行程序、capture mode、源码校验、实际请求资源和采样结果。像素重复性证据只覆盖这一捕获条件。`--hardware` 允许诊断 GPU 路径，但它的渲染仍按当前 browser/driver 条件解释，不能继承默认软件路径的 seek/像素稳定结论；旧 `--software` 作为兼容写法保留。默认方式可直接运行，不需要额外加 flag。

具体前置条件按原接口字段判断，而不是按模板名猜素材需求。当前 `laohu-motion-y2-vox` 的原 `init()` 会消费 `title` 和 `point` cue，因此纯文字索引卡也可独立调用；只有 spec 实际包含 `image`/`clip` cue 时，才须为该素材提供有权使用的本地图片或帧。`laohu-motion-y2-vox` 与 `laohu-motion-y5-kinetic-type` 的 prepare/preview/render 使用 `templates/runtime/laohu-native-clips/` 中按来源 commit 固定的选中闭包；其本地 manifest 逐文件关联 upstream source path、源哈希、MIT/OFL 许可与本地文件哈希，catalog 再固定 manifest SHA。该渲染路径核验选中闭包，不在运行时要求完整 upstream tree 可用；两支 grammar/helper 实现保留原字节，HTML 仅排除它们不用的 chart/toon imports，字体入口只载入两支实际消费的 Noto Sans SC 700/800/900 字重。这个本地职责目录只接通 y2/y5，不使其他 grammar、工具包或整份 library 自动可调用。相反，`laohu-motion-y4-storytime` 原 renderer 会读取 `data.character.frames` 并在缺少角色帧时失败，所以它仍列为 conditional。`laohu-motion-t3-finance-chart` 必须提供非空 `data.series`；不能因只写了标题就把空图当作成功预览。整段场景/页面记录与局部 effect 分别登记在 catalog 的 `templates` 和 `effects`；当前状态、数量及每项能否调用以 catalog 和 `list` 的筛选结果为准，不把 source-only 场景、原生工程、页面记录或可查询性说成可调用，也不把局部 effect 计作整段模板。

`laohu-motion-dg` 是可预载的本地局部效果接口；它的实际 consumer 从本地 adapter 加载登记的效果依赖闭包。上游来源在 catalog/SOURCES 中保留为 `huashu-art-motion`，该 source ID 不作为 runtime 模板名：

```sh
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/render.mjs" \
  --scene /absolute/scene.json \
  --output /absolute/effect-preview.mp4 \
  --cache-dir /absolute/project/.cache/tmp/motion-run \
  --draw-module /absolute/draw.js \
  --template-effects laohu-motion-dg
```

`huashu-art-motion-dg` 是 catalog 保留的兼容 alias，新的运行调用使用 canonical ID `laohu-motion-dg`。`render.mjs` 按 `show` 中 pin/load order 加载本地 closure，登记的原函数使用透传计数，状态按 catalog 的方法与验证字段判断。需要同时使用多类原始绘制方法或同镜 DG adapter 时，使用更完整的 `laohu-motion-toolkit`：

### `laohu-motion-toolkit` 的实际调用路径

本地 catalog 将该 library 登记为 `preloadable-local-classic-scripts` / `classic-global-library`，来源仍为 `huashu-art-motion` 固定 commit 与 MIT。直接 `scripts/render.mjs` 调用形式如下：

```sh
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/render.mjs" \
  --scene /absolute/scene.json \
  --output /absolute/picture-only.mp4 \
  --cache-dir /absolute/project/.cache/tmp/motion-run \
  --draw-module /absolute/draw.js \
  --template-effects laohu-motion-toolkit
```

Film `/1` 的 `motion-scene` segment 可同时提供 `templateEffects:"laohu-motion-toolkit"` 与成对的 `drawModulePath`、`drawModuleSha256`；本地 Film adapter 入口是 `templates/adapters/laohu-film.mjs`，其 CLI runtime 为 `templates/runtime/laohu-film-native/cli/laohu-film.mjs`。兼容入口与上游身份只留在 catalog/SOURCES。custom draw 直接调原 `window.MO/CAM/TY/CH/MD/UI/CL/DG` globals，按原签名绘制；同一 scene 还可由 `scene.objects[].data.motionEffects` 使用现有 DG/MO adapter。没有额外 DSL。Film `/1` 的 direct-call 收据只统计 catalog `functions[]` 登记的原函数；adapter effect receipts 另计。实际源函数及签名只查 `templates.mjs show laohu-motion-toolkit` 和唯一 catalog，不由 namespace 已加载推断其他函数可用。

已通过 60 帧、1920×1080 的 Film `/1` 技术 E2E，43 个登记源函数均有调用收据，且同一 scene 同时绘制原方法和 DG effects adapter；本验证只证明该夹具的接线和消费者调用。strict same-canvas repeated-seek 在此夹具为 `FAIL`（972 通道、最大差2、均值0.004301，原因 `UNKNOWN`）。旧的39-function independent fixture 另有 `FAIL`（637 通道、最大差2、均值0.00007776）；两组数据来自不同 fixture，不能合并。证据路径只供维护追踪，不是共享运行依赖：`.cache/validation/motion-blocks/toolkit-e2e-10879-6JU4ZL/film-toolkit-evidence.json`；`.cache/validation/motion-building-blocks/audit/independent-toolkit/run-10130-1794047172319/evidence.json`。这些结果不证明普通题材成片、接收质量或人类观感通过。

字体和媒体由调用者加载、提供并核许可；库本身不打包授权素材。特别是 `MD.size/cover/print` 需传入已加载图像、视频帧或 canvas。catalog 中每一项的 availability、条件与 runtimeVerification 继续分别解释，不把整库的 Film E2E 扩大为所有方法、题材或质量验证。

## 先确认整套效果由哪些程序共同完成

每个选中单元在已有蓝图写清：源文件/组件与版本、实际入口/renderer、内容与控制字段及其消费位置、坐标单位/画幅与时钟、字体/媒体/共用库、原生起中落和结束状态、本地修改及尚缺的连接。按调用关系读必要前提，不要求把整个参考仓库复制进作品。不能把“已收录”“已加载”写成“已调用”，也不能把原函数计数当成整镜复用；有意义的对象、属性和可见变化必须对应本段观看任务。

以已有原件形成基线，再用本段实际文字、数据和素材运行同一入口。对会改变结果的控制做一次有区别的参数检查：例如改变穿入时长应改变中间帧而保持身份与终态，改变强调对象应改变实际被强调的节点，改说明文字要在最终字形中出现。若参数修改无响应，先查字段层级、运行闭包和实际 consumer；不能以渲染成功继续交付，也不另写同名效果掩盖未接通。原生基线是保真依据，不证明本片内容与人类观感合格。

不要把不同运行层当成等价替代：native-clip 保留整段 grammar；toolkit 只暴露源函数，调用者仍须接入成熟布局、字体与组合；Shotcraft adapter 必须保留原组件的 DesignStage、帧计算、主题 provider 和 Polish 依赖；native OM 保留自身模板工程及 runtime。应由哪层接入，取决于原效果真正在哪层完成，不能统一退化成 Core 基础图形。

## 按语义判断复用尺度，不让模板替内容编排

主线先把用途、观众、发布场景、实际材料与证据编入已有内容/素材蓝图，再从每个有序观看单元要说明、对照、展示或体验的关系，以及前后态、进入条件、信息先后、承重对象、素材权限/可用性、锁定范围和时间基准判断候选。整段镜头、动作组和局部 effect 并列比较：分别核对原生构图、动作/时间依赖、可变体、对象目标、生命周期、条件与状态，不将“更小的局部操作”当默认优先级。候选的原生布局、运动和结束状态须进入全幅设计，候选探索与构图相互校正后再落定。候选适配须逐项对照现有蓝图中不可省的对象、关系与状态操作：指出源码中实际消费它的字段、原函数或不可拆耦合动作组，并核对该 consumer 从起态经操作到落态怎样产生可见变化。分清“关系画在材料上”与“过程由 renderer 执行”：若 `image` consumer 只揭示或整体移动 SVG/照片，内部箭头、模型、参数和比较对象仍是静态内容。确需动态呈现的承重操作，须有真实 consumer 可寻址的对象、图层、参数或已接通状态资产，并在操作前后关键态确认确实发生变化；静态机制图可承担概览或关系说明，不计作动态操作已完成。这不禁止新制 SVG 等内容资产，也不要求静态定义都动画化；内容资产不能替代成熟动作的实际调用与状态消费。point/label/caption 只承载文字，不能证明图形执行了所述操作。若核心操作没有真实 consumer 或可见后态，换候选或按原接口组合适用的成熟函数/动作组，再回到关键态检查。需要整片组织时，continuous、montage 或 hybrid 的选择由跨单元的对象接续、并置比较、转折，或纯体验任务中已定的形式/材质/节奏进程决定；切点要说明承接、比较、转折或体验变奏的作用，剪辑路线本身不替段落选画风。局部 effect 只约束已登记目标、属性和时段；动作组和完整镜头若已承担观看任务，则保留适用的原生机制。按 `show` 核对 `contentFit`、renderer/availability、cue/data 入口、固定机制、前置条件、source pin 与许可；不按风格名称相似、目录类别、预览图好看或参数字段听起来相近来选。已有蓝图修改任务先判断对应范围是否仍合适，不因默认查库而无故更换。

先比较要完成的对象/状态变化、时间语义、固定行为和真实消费者，再比较来源；普通 Core 插值、静态 effect、可调用原版与 source-only 研究记录必须保留各自身份。同名函数或相近参数不代表机制等价。catalog 中的实际条目、状态、来源 pin、精确许可、输入/输出、固定机制、参数、完成行为与消费位置都须能核对；只有可调用且许可条件符合的原版才能按原效果使用。source-only 不可直接调用时，先查其精确原函数和原接口；可授权局部接入时保留原实现，不从摘要重写；若仍不能运行，就换另一个成熟候选或暂停依赖部分。没有可调用源本身不授权新写实现。用户锁定来源或效果时维持该范围，真实能力不足就报告相应缺口。

整段场景模板可以承担整段，也可以只用于一组连续镜头；每段按自己的观看任务选，允许相邻段调用不同模板。不要把一句一句拆成一个模板调用，不要求每段换颜色/布局/模板，也不默认全片使用同一套模板。用户明确选择某个模板时，保留其原生组成与效果机制，调整范围只限于该模板实际消费的字段和用户锁定项；不因“需要原创”而重写效果，也不因为模板可用而替用户改换内容或成片方向。

上游模板内部固定的构图、标题位置、图表结构、字体层级、色彩角色、转场与运动可以是合法的设计结果。适用时完整保留其布局、字号与字体、颜色职责、DesignStage/设计画幅、raster 与 transform scale 的差异、动作曲线和结尾状态；只替换源码实际开放的本片内容字段。不得把多来源内容统一包成暗底小字侧栏等全片皮肤，也不能因“需要统一”而覆盖各来源的原生色彩与构图。反对全片一成不变的单一外壳，只针对未承担内容或观看职责、把所有段落变成槽位陈列的处理；不能据此否决一个在当前段落中真实承载比较、数据阅读、路径构建或关系解释的原生版式。颜色也不预设锁定：只有用户锁定或模板字段确实控制时才固定/调整；不要声称不存在的自由度。

`sourceSchema` 保留上游声明的原始字段与必需项，但声明本身不证明 renderer 会读取它。实际可调参数以 catalog 的 `parameters`/`trueParameterization` 及对应源码消费证据为准；若两者不一致，catalog 须保留原声明并在 `declaredOnlyIgnoredSpecData` 标出未被消费的字段，主线与三级不得把这类字段当作有效参数传递或承诺画面会响应。例如 `data.camera` 虽被原 schema 声明，t1、t3、y3、y4、y5 renderer 未读取，只有 t2、y1、y2 有源码消费证据。整段模板可以固定其原生构图、动画曲线、版式、层级、颜色角色或交接方式；这些是效果的一部分，不要求每次重新设计。只填源码实际消费的字段，保持未暴露的部分不变；不要把局部 primitive、目录项或一个固定叙事实例说成整段通用模板。若固定机制与当前内容不合，先换另一成熟候选或沿精确 source index 接入适用原函数；没有成熟原件能承担剩余职责时，暂停该依赖部分，不伪造参数或改写原算法。

`cueCommon` / `trueParameterization.cueFields` 是 clip runtime 接受的共用传输包络，不代表每个模板或每种 cue 都会把这些字段绘制出来；实际画面响应取决于所选 grammar、cue kind 和原实现分支，须按该条目的源码消费证据填写有效字段。

## 局部方法、工程输入与共同声画事件

主线按观看单元前后态与全幅职责判断复用尺度，从 `effects`、动作组来源和 `templates` 中比较真实候选。三级方法按父级给定对象与时钟，从对应 `show` 和源接口核实精确条目 ID/sourceRef、renderer/状态、目标与属性 owner、源码实际消费字段、局部时钟、生命周期和素材条件，返回起中落、局部固定约束、未解冲突及由主线/工具接续的真实 consumer，接回同一段落蓝图供主线编排。只有精确来源索引时，明确标记未接通状态和缺口，不虚构可调用字段。局部效果只约束登记的对象/属性/时段，完整 `templateId` 仅用于场景模板分支。三级不另选全片皮肤、不调用兄弟模块、不改原算法；若目标或动作超出已接通接口，报告具体缺口，交主线换另一成熟候选、按精确索引局部接入原函数，或暂停依赖部分；不能把通用 Motion 路径当作新写底层效果的默认回退。

`huashu-art-motion` 代码按 MIT 使用，保留上游 `LICENSE`；其字体按 SIL Open Font License 1.1 使用，并保留原字体许可证文件。保留 catalog 登记的 commit、逐文件 hash、入口与依赖闭包；来源原件在项目私有维护快照中只读保存，生产不读取。原件对照和来源 parity 只能在维护命令显式提供快照根时运行；局部接线放适配/准备层或本地代码中，并记录与源接口的差异，不能把改过的算法仍标成原样上游效果。本地 y2/y5 选中闭包继续标识 `huashu-art-motion` 来源，并随包保留 MIT 与 OFL 许可；其中只对 HTML script list 与已使用字体清单作有据收窄，不改 grammar/helper 算法。不得把上游演示视频、作者角色帧/形象或未随包的素材当作 MIT 资产；只有用户有权提供的本地素材可进入实际 spec。其他来源各自按 catalog 的许可和素材范围处理，不能从代码许可证推导照片/字体/角色资产许可。

Huashu Motion 主模板与 `huashu-art-motion` 的局部 effect/clip adapter 是两套运行闭包。主模板须按该模板自己的 copy map、运行入口及固定依赖准备工程；不能因文件名相同，就拿 art-motion 的 `clip.js`、lib 或 grammar 替代主模板 runtime。t3/y5 的字段和 cue 仍以各自真实源码消费为准；如果某段需要的 runtime、字体或素材不在对应闭包中，只暂停该候选并报告缺项，不把目录存在或源索引写成可运行。
Film Blueprint `/1` 的 `huashu-motion-template` 输入仍是 `templateId` 与 `variables`。adapter 以目录行的 ID 或 `aliases` 解析条目，并要求它的 `renderer` 为 `native-clip`、`availability` 为 `available` 且有原始 `grammar`；随后把 `variables` 平铺回 source clip spec，附上该来源 grammar、由编译片段帧数决定的 `duration`、`fps:30`、`1920×1080`。若 `variables.duration` 已提供，须与编译时长相等；film wrapper 的 `format/templateId` 不能塞进源变量，`grammar` 若显式传入也须匹配 catalog。cue/data 等其他原字段随 `variables` 原样进入 source spec，不擅自 shift cue 时间。这个 wrapper helper 已有纯单测；完整浏览器片段渲染和每项原生素材/浏览器条件需分别核实，不能由 helper 测试宣称 E2E 完成。保真边界：native-clip 段不得提供非零 `headHandleFrames` / `tailHandleFrames`，也不提供源时长扩展；它可参与下文定义的受限 `boundary-frame` `crossfade`，但不能进入 Motion-scene handles 路径。其原始 grammar/data/cues、依赖 `ctx.dur` 的布局与绝对 cue 时间保持不变。

Film `/1` 新增的完整 OM renderer `laohu-native-om-template` 与上方 raw native-clip 和直接 `prepare/render` 的 native template 接口分开；它依 catalog 条目解析真实 `templateId`，按原 copy map 与 OM CLI 准备并运行原工程，不把上游演示品牌/内容当作本片素材。Film 段保留 `templateId`、源 controls `variables`，并可选接 `omCues`（原 OM 词锚）、`sourceCueBindings`（索引原 `script#clip-spec` cue 到本片词锚，可显式静音源 cue）和原 ABC `omScore`。各字段真正由哪个 OM/Film/audio consumer 消费见[工具链 Reference](toolchain-render-and-check.md)。当前 whiteboard、math-3b1b 与 Kurzgesagt 三个对应 catalog rows 都是 `conditional`，但各自验证层级不同：whiteboard 有完整 Film→canonical audio-plan→`audio.mjs` 的 Chrome E2E（1/1）；math-3b1b 是 10 秒默认源模板、t=5s 的真实 Chrome preview；Kurzgesagt 是 10 秒默认源模板、t=1s 的真实 Chrome preview。后两者没有覆盖完整 OM render / Film 音频闭环，不能因 preview 提升为 `available`。每项 `availability`/`runtimeVerification` 以唯一 catalog 当前行解释，不把一个夹具的 E2E 扩成全目录能力或质量结论。

可复用的 t1 像素→网络→输出动作组另登记为 `laohu-motion-network-pass`，通过 `custom:laohu-network-pass` 接入一个 Motion custom object；它不是原生完整 OM 模板，也不依赖用户 `.cache`。字段、调用命令、固定5.4秒/1920×1080时钟、源字体、可适配的显式状态与缺字拒绝条件见[工具链 Reference](toolchain-render-and-check.md#laohu-motion-network-pass-源动作组)。输入、权重、激活和输出名在整段内是同一组静态显式示意值；没有逐帧状态动画字段，不计算推理或训练。若本镜展示调用方构造的分数/状态且没有可核实的实测来源，可在 network group 后追加唯一受限的 Core `text` 对象 `id:"network-pass-disclosure"`；作者提供单行披露，renderer 用 MotionCore 的真实文字测量及 pinned 字形表检查固定底部安全区，不缩小或截断。其他对象、任意位置/样式、图层、事件和绑定仍拒绝；不加该对象时保持原单对象源画面。源/adapter在8个采样时点的无披露逐像素对照与 Motion/Film 媒体生成已作技术验证；披露接入的新增 E2E 以其自己的验证记录为准。这些技术结果不代表受众理解或视觉质量通过。

当前可从本地功能入口调用的两个完整场景是 `finance-chart-native` 与 `kinetic-type-native`，二者使用 `native-om-template-source`，状态仍是 `conditional`；此状态不能因整片入口接线而提升。它们的 `prepare` 接口不同于上方通用模板示例：native `--output` 必须是一个尚不存在的工程目录，prepare 会在其中生成 `laohu-native-template.json`；示例中的通用 `prepare <template-id> --input ... --output /absolute/prepared.json` 不适用于 native 模板。

```sh
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" prepare finance-chart-native --input /absolute/finance-spec.json --output /absolute/project/.cache/tmp/native-scene/finance-chart --work-root /absolute/project/.cache/tmp/native-scene
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" render finance-chart-native --spec /absolute/project/.cache/tmp/native-scene/finance-chart/laohu-native-template.json --output /absolute/project/.cache/tmp/native-scene/finance-chart.mp4 --work-root /absolute/project/.cache/tmp/native-scene
```

这里 native `--input` 使用 `laohu.huashu-native-template-spec/1`，`--spec` 可直接指向该原始 spec，也可指向 prepare 生成的工程内收据；直接传原始 spec 给 `render` 或 `preview` 时，命令会先准备隔离工程再执行目标动作。finance-chart 必须提交有效非空 series，kinetic-type 的字段依原 schema/source 消费。整片由工具链 Reference 定义的 `--film-blueprint` 入口调用 adapter。Huashu OM 与 Motion scene 的 Film Blueprint `/1` 独立入口继续保留；Film Blueprint `/2` 是额外组合入口，可将完整 OM 作为原生底片，与原生 HTML 和本地 Shotcraft 组件按各自 renderer 接线。选择 `/2` 不要求单段 OM 改用 Shotcraft renderer，也不替换 `/1`；每段仍由自身 `renderer` 决定消费路径。两路 renderer 闭包不混用，画面输出仍为 picture-only。详见[源接入规则](video-shotcraft-integration.md)及[工具链 Reference](toolchain-render-and-check.md)。`/1` 的 `incomingTransition` 有两种模式：默认 `handles` 只用于相邻 `motion-scene`，由两段提供真实半窗以上 head/tail handles；`mode:"boundary-frame"` 只用于指定了内容交接理由的边界，且至少一端是 `huashu-motion-template` raw native-clip 或 `laohu-native-om-template` 完整 OM。此时原 `TRANSITIONS.crossfade` 在切点前用 A 实际末段帧、之后保持 A 最后一帧；B 先保持其实际首帧、再用 B 实际初段帧。边界模式无 handles、无源时长扩展、无 cue/timeMap 平移，并按同一窗口替换相同帧数，Film 总帧钟和音频时钟不变。native↔native（含两个不同完整 OM 模板）也走此模式；两侧都为 motion-scene 时不能改用 boundary-frame，继续走原 handles 路径。此分支只验证 `crossfade` bitmap 调用，不把 `same`/`matchCut` 等需连续世界、配对几何或真实相机依据的方法假称适用。Video Shotcraft Film `/2` 另有自己的受限入口：支持完整 OM/HTML 源段参与的 `incomingTransition.mode:"boundary-frame"` `crossfade`，以及仅由 `transitionEdges` 调用的 FlashCut；两套蓝图/renderer contract 不互相替代。`/2` 同样只输出 picture-only，完整 OM 声音交接由 [工具链 Reference](toolchain-render-and-check.md) 与唯一 `audio.mjs` consumer 完成。模板与组合的逐项媒体证据见[来源与证据](../../SOURCES.md)。

画面与声音共用本片的事件与导演编排，但由不同 renderer 消费。旧 `huashu-motion-template` / `native-clip` 只执行 Art Motion 原始画面入口；Huashu Motion 的 `CLIP.mount`、`ClipCues`、节拍标签和源 `C.SFX`→`OM.sfx` 不属于该 raw clip，因此其 `pace`、cue 的 `word/nth/edge/offset` 与未消费控制继续拒绝，不误称为自动变速/口播绑定。y1 的 `enter.dur` 写在 cue 顶层，`data.dur` 会报错。新的 `laohu-native-om-template` 则走完整 OM runtime，按[工具链 Reference](toolchain-render-and-check.md)调用原 copy map、OM CLI、`CLIP.mount` 与 `OM.sfx` 声音声明；OM SFX hits/score 只从已消费的源事件投影到 canonical Film 事件与 audio plan，再由本地 source generator / composer 生成素材，最终 `audio.mjs` 混音一次。该链路只在 catalog 对应行为验证范围内成立，不把完整 OM 能力推广到 raw clip，也不假定其他条目状态相同。源默认 SFX 是本片声音角色选择的候选，保留其命中语义与提前量，不机械给所有动作加音。Motion 主线按现有[声音设计](sound-design.md)判断各声部角色与授权，再由 [ASR 时间绑定](../speech-cue-binding.md)校验剪后时间轴；需要视听音乐、SFX 或源剪辑专业方法时，在 Motion 已授权范围内交接给 [Arrangement 主 Skill](../../../laohu-arrangement/SKILL.md)，由其自身路由决定是否读取 SFX 子级，再将结果写入既有 audio-plan。源码观察本身不等于本地调用或听审。

## 失败时停止依赖项并返回主线

- `verify` 报登记源 hash、Git blob、入口闭包、effect 加载顺序或目录内容不一致时，停止该候选，不手改上游副本来“修绿”；由维护负责人核查 pin 与恢复副本。`verify` 不判定许可证法律范围，许可须依据 catalog 登记、随包许可证与实际素材来源另行确认。
- `prepare` 报字段、cue 类型、素材路径或角色帧缺失时，只补用户有权提供且 schema 真正需要的输入；缺失素材不可从 preview/demo 名称猜文件。若仍不匹配，返回具体错误并换适用实现。
- `preview`/`render` 启动失败或运行时缺项时，先核对项目已有工具与本轮授权；可在既有授权、同盘和可恢复范围内处理普通本地接线或依赖。只有下一步涉及新增费用、全局配置、超出本轮范围的素材/服务或其他须由用户取舍的变化时，才暂停依赖该项的部分并说明具体影响；不因运行缺项一概要求用户重授权。
- 普通开放请求没有合适的本地可调用模板时，不直接调用 `sourceImplementationIndex` 或在作品工程里临时接线；索引只提供维护阶段溯源信息。只有独立维护任务明确授权、完成许可核验、原件迁入、本地 consumer 接通、catalog 状态登记及代表行为证据后，该方法才能进入日常候选。集成尚未完成时暂停依赖该效果/接口的部分，并继续独立工作；不能借此重造成熟底层绘制、排版、曲线、镜头、材质或声音。用户普通制作请求不要求先选模板或先提供专家字段。

把所选 `templateId`、commit/hash、适用片段、原生固定机制、实际可调字段、spec/cue 与素材路径/hash/许可、准备/预览/渲染命令和结果写入已有蓝图/工程记录。`verify` 是源码结构证据，`prepare` 是输入与本地素材证据，`preview` 是抽样状态，`render` 才形成目标媒体；均不替代 [工具、渲染与媒介检查](toolchain-render-and-check.md) 的字体/遮挡/全段播放检查。没有真实画面复查时不宣称效果通过；声音未实际试听仍须保持候选/未审核状态。
