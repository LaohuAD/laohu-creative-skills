# 表达与演示能力概览

> Overlay Studio 使用自定义免费使用许可。本目录不复制或再分发受该许可限制的 TSX/CSS 实现。字体、音频和其他素材按各自来源与许可单独判断，不能从代码许可推定其授权。相关 Motion Prompt 条目是独立的 MIT 源码实现；机制相近不等于迁移或复刻 Overlay 效果。

## 使用说明

Overlay 的 20 个表达概念均保留可检索记录。每项分别标注本地已有 consumer、可关联的独立 MIT 动作/图形模块，或尚缺的实际依赖。`relatedMotionPromptIds` 只说明可进一步读取的相邻机制，不代表其布局、数据或交互已替 Overlay 项实现。正式来源代码不进入本地 L2 或 L3。


## overlay:quote-lockup · 金句定格

**表达作用：** 逐行显出一段引文，再停在完整排版上。适合短观点或原话，需要核实引文和署名准确。

**使用条件：** 文字进入、行序、引文和署名；不替代长段口播字幕。

**本地处置（related-mit-only）：** 无对应的本地引文版式消费者。Motion Prompt 的逐字/文字动效可作为独立 MIT 动作机制，但不提供引文分行、署名层级或成套布局。需要这些职责时，仍待接入本地排版 consumer。

**关联 MIT 条目：** `motion-prompt:motion:006`

**来源定位：** `motion-playground/src/effects/registry.ts` → `QuoteLockup.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:step-timeline · 步骤时间线

**表达作用：** 按顺序揭示多个步骤，让过程关系连续可见。适合确有顺序的操作、阶段或因果链。

**使用条件：** 步骤名称、顺序和时点必须来自内容；不预设固定章节数。

**本地处置（related-mit-only）：** Motion Prompt 已有时间线绘制（diagram:234）与横向步骤箭羽（diagram:239）；它们是分开的 Canvas 实现，不是 Overlay 的可复用步骤时间线卡。本地没有绑定内容事件的该类组件。

**关联 MIT 条目：** `motion-prompt:diagram:234`；`motion-prompt:diagram:239`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/StepTimeline.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:rank-bars · 排名条形图

**表达作用：** 条形逐步生长并显示数值，适合排序明确、量纲可比的数据。

**使用条件：** 真实数值、排序、单位和基线；不能把定性优劣伪装成数量排名。

**本地处置（pending-local-consumer）：** 未找到能按排名排序并显示排名条的本地 consumer。已入库的组合图（diagram:230）和百分比堆叠条（diagram:232）分别表达双轴数据与构成比例，不能替代排名图。

**关联 MIT 条目：** `motion-prompt:diagram:230`；`motion-prompt:diagram:232`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/RankBars.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:punch-pill · 观点强调胶囊

**表达作用：** 把一个短观点放进高亮标签并以弹入动作呈现。适合局部强调，不承担完整论证。

**使用条件：** 短文本、强调色和落位；使用强度需服从层级，避免整段都被强调。

**本地处置（related-mit-only）：** Motion Prompt 的 pop-in（motion:001）可提供弹入动作，但不实现观点胶囊的文本容器、尺寸和层级；本地没有对应胶囊 consumer。

**关联 MIT 条目：** `motion-prompt:motion:001`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/PunchPill.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:term-card · 术语解释卡

**表达作用：** 术语与简明定义成组出现，适合解释一个读者尚不熟悉的名词。

**使用条件：** 准确术语和不失真的释义；定义需能独立理解。

**本地处置（pending-local-consumer）：** 未找到将术语与独立定义成组呈现的已登记本地 consumer。通用文字动画不承担定义版式，也不保证释义完整。

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/TermCard.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:checklist · 步骤清单

**表达作用：** 逐项显现并标记完成状态，适合流程、检查点或明确的已完成进度。

**使用条件：** 事项顺序与完成状态必须有事实依据；不能把建议冒充已做。

**本地处置（related-mit-only）：** Motion Prompt 的 step-indicator（ui:068）显示流程当前步骤与进度，不表示每项已完成；流程图（diagram:222）可表达分支。二者都不是事实状态驱动的检查清单，本地清单 consumer 仍待接入。

**关联 MIT 条目：** `motion-prompt:ui:068`；`motion-prompt:diagram:222`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/Checklist.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:terminal-3d · 终端命令演示

**表达作用：** 将命令行文字按字符或阶段呈现，适合展示真实命令、日志或终端操作。

**使用条件：** 准确命令、终端上下文和可读时间；演示内容不应暗示未发生的执行结果。

**本地处置（related-mit-only）：** Motion Prompt 的 typewriter（motion:006）可逐字呈现命令文本，但没有终端窗口/3D空间，也不验证命令或日志真实性；本地未登记终端演示 consumer。

**关联 MIT 条目：** `motion-prompt:motion:006`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/Terminal3D.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:ring-metric · 环形指标

**表达作用：** 环形进度和数字同步变化，适合有明确分母或目标值的比例指标。

**使用条件：** 分子/分母、目标范围及单位；无基准的数字不宜伪装成进度。

**本地处置（related-mit-only）：** Motion Prompt 的半圆 gauge（diagram:229）可展示进度数值，但它不是环形指标组件；本地没有将圆环、分母/目标和数值绑定的 consumer。

**关联 MIT 条目：** `motion-prompt:diagram:229`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/RingMetric.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:versus-card · 双项对比卡

**表达作用：** 两组内容进入画面并形成并列对照，适合呈现同一维度下的两种选择。

**使用条件：** 对照对象、共同维度和真实差异；避免只靠视觉对撞制造虚假冲突。

**本地处置（related-mit-only）：** Motion Prompt 的 split-screen（motion2:144）提供并列画面划分，但没有双项比较卡的共同维度、标签和事实绑定；本地未找到对应比较卡 consumer。

**关联 MIT 条目：** `motion-prompt:motion2:144`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/VersusCard.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:ui-callout · 界面区域标注

**表达作用：** 用圈选、引线和标签指出界面或画面中的具体区域。适合操作说明与局部证据指认。

**使用条件：** 真实截图/界面和准确指向；线条不能遮住被标注的信息。

**本地处置（related-mit-only）：** Motion Prompt 的 tooltip（ui:054）是悬停时显示的短说明，不负责截图中的圈选、引线和精确区域指向；本地未登记界面标注 consumer。

**关联 MIT 条目：** `motion-prompt:ui:054`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/UICallout.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:type-shift · 文字排版重组

**表达作用：** 先以松散文字状态出现，再重排成稳定版式。适合把散点收束为一句结论或明确结构。

**使用条件：** 转换前后的文本与排列关系；重排应增加组织信息，不只是装饰。

**本地处置（related-mit-only）：** Motion Prompt 的 kinetic typography（motion:008）可按含义和节奏移动文字；它没有 Overlay 所示散字重排为稳定版式的专用 consumer。本地未登记对应重排组件。

**关联 MIT 条目：** `motion-prompt:motion:008`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/TypeShift.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:blur-text · 文字由虚到清

**表达作用：** 词块逐段从虚焦变为清晰，适合把注意力引向被揭示的关键词。

**使用条件：** 清晰化顺序和文本层级；避免长句长时间模糊导致阅读困难。

**本地处置（partial-local-consumer）：** 本地 `PaperTitleCardCopy.tsx` 在标题词进入时使用 blur 到清晰的处理，并由 `video-shotcraft-entry.tsx` 在派生标题卡路径消费。范围限于该标题卡；它不是任意文本块的可配置模糊揭示组件。

**已有消费者：** `templates/adapters/derived/PaperTitleCardCopy.tsx`；`templates/adapters/video-shotcraft-entry.tsx`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/BlurText.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:odometer · 翻牌式数值变化

**表达作用：** 数字滚轮逐位翻到目标值，适合变化过程本身值得展示的计数。

**使用条件：** 起点、终点、单位和变化方向；数值不能以滚动动画替代来源说明。

**本地处置（implemented-local-consumer）：** 本地 `DigitRoll` 在 `paper-title-card.tsx` 与 `PaperTitleCardCopy.tsx` 被实际消费，逐位滚动至目标数字。它只提供数位滚动；数值来源、单位和解释仍由内容设计提供。

**已有消费者：** `templates/runtime/laohu-remotion/components/digit-roll.tsx`；`templates/runtime/laohu-remotion/components/paper-title-card.tsx`；`templates/adapters/derived/PaperTitleCardCopy.tsx`；`templates/adapters/video-shotcraft-entry.tsx`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/Odometer.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:focus-card · 主体聚焦与要点

**表达作用：** 通过主体画面与侧边信息组织，呈现人物/主体和逐条要点。适合口播配合具体 B-roll 或重点列表。

**使用条件：** 主体素材、画面安全区、要点与出现次序；具体镜头不可仅由卡片描述代替。

**本地处置（pending-local-consumer）：** 未找到能把主体素材与侧边要点按同一画面层级成组的已登记 consumer。现有主体/文字素材能力需按片段重新构图，不能将 Overlay 卡片视为现成组件。

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/FocusCard.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:chapter-bar · 顶部章节导航

**表达作用：** 以轻量的顶部标记说明当前章节及其在全篇的位置。适合有清楚多章节、需要定位或回看的讲解。

**使用条件：** 真实章名、边界和时间线；主画面顶部需要同时检查遮挡和安全区。

**本地处置（partial-local-consumer）：** `native-presentation/chapters.mjs` 已从绑定时间线事件生成章节索引、当前章节读取与真实 seek；当前文件不绘制顶部章节条。因此时间导航逻辑已存在，像素导航栏 consumer 仍待接入。

**已有消费者：** `templates/runtime/native-presentation/chapters.mjs`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/ChapterBar.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:caption-track · 双语字幕呈现

**表达作用：** 将中文主行和英文译行作为一组同步展示，并可局部强调关键词。

**使用条件：** 译文与原文语义绑定、同一显示时间窗及两行可读性；像素字幕本身不提供点击跳转。

**本地处置（implemented-local-consumer）：** `native-presentation/captions.mjs` 是已登记的字幕轨道 consumer，读取绑定后的双语 caption manifest，按字幕显示窗渲染并校验字体、翻译与安全区。它不提供点击跳转。

**已有消费者：** `templates/runtime/native-presentation/captions.mjs`；`templates/runtime/native-presentation/README.md`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/CaptionTrack.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:stat-proof · 数字证据

**表达作用：** 以醒目的数字计数呈现证据，并配合来源或单位注脚。适合可核实的关键数量。

**使用条件：** 数字、单位、来源和注脚；重要限定条件不能被大字效果省略。

**本地处置（partial-local-consumer）：** 本地 `DigitRoll` 与 Motion Prompt count-up（motion:007）可实现数字递增；现有消费者没有把来源、单位和限定条件作为同一证据版式绑定，来源注脚 consumer 仍待接入。

**已有消费者：** `templates/runtime/laohu-remotion/components/digit-roll.tsx`；`templates/runtime/laohu-remotion/components/paper-title-card.tsx`

**关联 MIT 条目：** `motion-prompt:motion:007`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/StatProof.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:growth-curve · 增长曲线

**表达作用：** 沿时间绘制曲线并可突出峰值，适合具有连续时间变化的数据。

**使用条件：** 真实时间序列、坐标、量纲和峰值定义；不能用平滑动画掩盖离散采样或不确定性。

**本地处置（pending-local-consumer）：** 未找到可绑定真实时间序列并标注峰值定义的增长曲线 consumer。Motion Prompt 组合图（diagram:230）包含柱与线，数据绑定/双轴职责不同，不能宣称等同于增长曲线。

**关联 MIT 条目：** `motion-prompt:diagram:230`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/GrowthCurve.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:entity-chips · 人物/机构名牌

**表达作用：** 以逐块滑入的名牌标记人物、公司或身份关系。适合首次出现时补足识别信息。

**使用条件：** 实体名称、身份和对应对象；名牌数量与屏幕空间按当前镜头调整。

**本地处置（pending-local-consumer）：** 未找到按真实实体身份绑定名称牌并逐块呈现的本地 consumer。Motion Prompt filter-chips（ui:061）是筛选控件，不是人物/机构名牌。

**关联 MIT 条目：** `motion-prompt:ui:061`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/EntityChips.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。

## overlay:pin-board · 要点钉板

**表达作用：** 已讲过的要点逐条固定在角落，形成可回看的累积清单。适合需要持续对照多个要点的段落。

**使用条件：** 要点需有持续比较或回顾价值；默认不把它扩展成全篇常驻地图。

**本地处置（pending-local-consumer）：** 未找到把已讲要点按段落累积、固定在角落并可回看的本地视频 consumer。Motion Prompt pinning（lp:076）表现网页滚动时的固定区块，不是要点钉板。

**关联 MIT 条目：** `motion-prompt:lp:076`

**来源定位：** `motion-playground/src/effects/registry.ts` → `hud/PinBoard.tsx`（固定提交 `e35e1aff9dae3b3addc21f68f3bcd51f95bdc1a8`；许可 `OVERLAY-STUDIO-COMMUNITY-FREE-USE-1.0`）。
