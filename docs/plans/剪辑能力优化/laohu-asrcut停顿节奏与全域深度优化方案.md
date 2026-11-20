# `laohu-asrcut` 停顿节奏规则升级与全域深度优化方案（循证设计版 · `laohu-analysis` 交付件）

> **文档身份与职责边界**：本文由 `laohu-analysis` 产出，立足 `laohu-asrcut` 的核心使命——*“根据粗糙录音、录屏视频、ASR JSON 或 SRT 制作可追溯的虚拟粗剪、精剪与授权重排，生成唯一剪后时间轴与审阅页，按授权诊断并处理口播声音，并为下游动画制作（`laohu-motion`）与音/视频成品提供高完成度时间底盘”*。
>
> **循证声明**：本方案拒绝凭空臆测，每一项规则判断、停顿数值解释、冲突裁决排序、粗糙原片处理流程与工程工具设计，均分别对应**本仓库已实读的本地归档/缓存资料**或**可核验的同行评审论文、经典剪辑论著与广播后期规范**，并严格区分**外部实证依据**、**用户选定工作基准（原图六项标准）**与**本地工程适配**。
>
> **文档阶段**：主体保留设计阶段的诊断和变更规格。实际文件、证据及来源校正见[实施与验收](#十一实施与验收)。

---

## 目录

1. [一、核心使命再校准与任务状态](#一核心使命再校准与任务状态)
2. [二、理论与实证证据底座（11 份可核验来源总账）](#二理论与实证证据底座11-份可核验来源总账)
3. [三、《留白与停顿》的循证拆解与七条执行法则](#三留白与停顿的循证拆解与七条执行法则)
4. [四、透彻解决“粗糙原片 → 动画就绪”的四阶段专业剪辑闭环](#四透彻解决粗糙原片--动画就绪的四阶段专业剪辑闭环)
5. [五、`laohu-asrcut` 全域深度诊断：6 项必保硬资产与 8 项核心断点](#五laohu-asrcut-全域深度诊断6-项必保硬资产与-8-项核心断点)
6. [六、同材料局部改后对照（仅报告内对照，未改原件）](#六同材料局部改后对照仅报告内对照未改原件)
7. [七、总体架构决策、生态影响面扫描与上下文负载预算](#七总体架构决策生态影响面扫描与上下文负载预算)
8. [八、面向实施的决策级变更规格（规则文档层 + 确定性工具层）](#八面向实施的决策级变更规格规则文档层--确定性工具层)
9. [九、零信息损耗语义迁移总表（Before / After 保护协议）](#九零信息损耗语义迁移总表before--after-保护协议)
10. [十、评测保护清单、新增验证场景与分阶段施工验收](#十评测保护清单新增验证场景与分阶段施工验收)
11. [十一、实施与验收](#十一实施与验收)

---

## 一、核心使命再校准与任务状态

### 1.1 回到 `laohu-asrcut` 的根本问题（为什么不仅要调停顿，更要根治全链路）

回顾 [laohu-asrcut/SKILL.md](../../../.agents/skills/laohu-asrcut/SKILL.md) 的 `description`：
> *“根据录音、录屏视频、ASR JSON 或 SRT 制作可追溯的虚拟粗剪、精剪和授权重排，生成剪后时间轴与审阅页；按授权诊断并处理口播声音。”*

在老胡的实际工作流中，这个技能承接的是**整个视听与动画生产链最关键的“毛坯变脊梁”关卡**：
1. **输入通常是粗糙的**：创作者直接丢进来一段未修剪的口播录音、录屏视频或实拍原片——里面混着试麦、反复重录（retakes）、结巴口误、绕圈子跑题、翻稿长静音、刺耳大口吸气，甚至前后逻辑需要重排；
2. **产出必须直接撑起下游**：它不仅要交出听起来像专业广播/播客一样**自然、紧致、有呼吸层次**的精剪音频或视频，更要为下游 `laohu-analysis`（写 Brief）和 `laohu-motion`（做动画）交出一份**“音频脊梁已锁、语义节奏清晰、自然留白窗明确、词级锚点精准、跳剪风险可见”的动画就绪型时间轴底盘**。

### 1.2 本轮核心判断

现行 `laohu-asrcut` 建成了极高水准的**底层防错与工程审计护城河**（整数采样时钟、双哈希防篡改、三层文本隔离、连续源修音），但在**“把粗糙原片真正剪好”**与**“把剪后结果顺滑交给动画与视频”**两件事上存在系统性失衡：
- **重防错审计，轻专业剪辑法度**：满屏禁令与 139.4 KB 上下文负载压制了模型的主动编辑判断；缺少面对粗糙原片的“先定逻辑脊梁（Paper Edit）→ 再闭眼调停顿节奏（Radio Edit）→ 再交画面与动画（View Edit）”的专业方法论；
- **有声学原则，缺波形与底噪工具**：规则要求锚定真实静音谷底而非 ASR 词首、消除爆音与死寂空洞，脚本层却没有静音/底噪探针、声明式剪辑编排器、接缝微淡化、Room Tone 保真与视频/NLE 导出；
- **与下游动画的节奏协同偏被动**：`timeline.json` 只暴露原始词与 clip 边界，未向 `laohu-analysis` / `laohu-motion` 直接透出**剪后已存在的自然呼吸/落版窗口**、**语义节拍划分**与**视觉伴随词锚点**，且硬性禁止片头/片尾无源展示时段。

---

## 二、理论与实证证据底座（11 份可核验来源总账）

为确保本方案每一条规则与工具改造都有真凭实据、可查可验，下面将本轮实际核读的 **6 份本地归档/缓存资料**与 **5 组外部权威研究/经典论著/行业规范**统一入账，并明确各自的适用边界：

### 2.1 本仓库已实读的本地资料与历史缓存证据

| 编号 | 来源与仓库可核位置 | 核实的核心机制 / 原文原意 | 对本方案的具体支撑位置 | 适用边界与约束 |
|---|---|---|---|---|
| **L1** | **DB Skill 口播衔接与开头体系**（本地缓存实读：`.cache/dbskill-removed-20260926-091204/skills/dbs-script-flow/SKILL.md`、`dbs-hook/SKILL.md`） | ① **完播流失三根因**：逻辑断裂（A→C 缺 B）、信息密度掉线（重复绕圈/正确废话）、口播卡壳；② **防误删“脑补检验法”**：删前先问“删掉后观众在下一关键节点能否靠自己脑补出具体含义”，脑补不出即必要论证肉；③ **拍摄方式前置保护**：白板/录屏里的“看这里/划重点啊”与画面动作配套，绝不可按纯文本精简误删；④ **原地标记式改稿**：永不抹除原文，用 `~~删除线~~` + 改动清单 + 多轮误删撤回标记 `⚠️` 呈现；⑤ **开场独立试用装（`dbs-hook`）**：前 5 秒须独立建立话题+Hook+可信度，并提供“晒结果+反转 / 数据冲击 / 反差转变 / 金句 / 痛点”五类高能素材提取维度。 | 支撑第四章 **Stage 2 纸面粗剪逻辑审查**、**录屏伴随词保护**、**授权重排（高能句前置）的专业推荐判据**，以及 **`review.html` 原地标记式对照视图**。 | 属于中文短视频/口播实战经验框架，不是学术实验；其中“改写文案/补写过渡句”动作不适用于锁定原音的 `laohu-asrcut`（ASRcut 只能删留重排原音或标注需补录缺口，绝不伪造未说过的话）。 |
| **L2** | **`Micro-Edits` 剪辑师实证访谈研究**（Tran, Shin, Davis & Leake, *UIST 2026*，本地正式归档：[micro-edits.txt](../../../.agents/skills/laohu-analysis/assets/editorial-sources/micro-edits.txt)） | 对 **6 位 5–15 年经验的专业剪辑师**进行出声思维实验，确立核心机制：**F3 节奏优先（Radio Edit）**——半数剪辑师先闭眼只听声音调对话与停顿节奏（P4：“闭上眼睛听，让我专注语流而不被画面打断”；P6：“从 Radio Edit 开始”），定义节奏编辑窗 $W^r$；**F4 视听解耦（View Edit）**——音频节奏锁定后才做 L/J-cut 调画面注意（P1：“音频节奏已调好，不想再动它”），定义视图编辑窗 $W^v$；**F5 切出镜与跳剪遮蔽**——精剪对话停顿必然制造跳剪，专业做法是用反应镜/切出画面兼顾导注意与遮跳剪。 | 确立 **`laohu-asrcut`（Radio Edit / Rhythm Edit）→ `laohu-motion`（View Edit）** 的根本分工合理性；支撑停顿剪辑优先纯听语流、视频剪辑显式标出跳剪风险供视觉层遮蔽。 | 原研究样本为双人对话场景（6 名剪辑师、两段约 1 分钟素材）；旁白独白、录屏教学与动画场景需做本地适配（已标注）。 |
| **L3** | **`Cutting` & `HARD-RULES`**（`ranahaani/i-hate-editing` & `browser-use/video-use`，本地正式归档：[cutting.txt](../../../.agents/skills/laohu-asrcut/assets/editorial-sources/cutting.txt)、[cutting-companion.txt](../../../.agents/skills/laohu-asrcut/assets/editorial-sources/cutting-companion.txt)） | ① **Take 选择**：源边界默认预期重录、通读所有 take、强头拼强尾、完整优于流畅；② **Rule 18（核心声学发现）**：ASR 词首系统偏向辅音起音，切口必须锚定在真实静音而非词首，单纯固定 padding 无法消除系统偏移；③ **Rule 3**：每段提取音频首尾各做 30ms `afade` 防切口爆音；④ **Rule 19**：严禁将句段时码按字数均分伪造词时码（误差可达 1.4s）；⑤ **逐缝验证**：必须按每个接缝单独取 2–3s 跨界窗口重转写/核听，整片转写会掩盖双词和残句。 | 支撑 **Stage 1 重录清洗**、**`audio-probe.mjs` 波形静音谷底探针**、**`export-audio --seam-fade-ms` 零漂移微淡化**、以及 **`extract-seams` 逐缝核验工具**。 | 原工具 `punchy`/`balanced`/`restrained` 三档偏英文短视频，需结合中文韵律与用户原图六项标准本地化升级。 |
| **L4** | **`Editing & Montage` 专业剪辑指南**（`calesthio/generative-media-skills`，本地正式归档：[montage-structure.txt](../../../.agents/skills/laohu-analysis/assets/editorial-sources/montage-structure.txt)、[montage-rhythm-and-transitions.txt](../../../.agents/skills/laohu-analysis/assets/editorial-sources/montage-rhythm-and-transitions.txt)） | ① **Edit Promise（剪辑承诺）**先行；② **Edit Decision Ladder**（观众效果 → 故事功能 → 注意路径 → 节奏 → 连续性 → 技术干净度）；③ **Explainer / Documentary Story Spine**（冷开场/定向/分步证明/综合/收束）；④ **四遍分轨审片法**（静音画面遍 / 纯音轨遍 / 纯字幕遍 / 声画合看遍）；⑤ **声音桥与 Room Tone 连续铁律**（“突兀的音频空洞往往比画面不连贯更令人出戏”）。 | 支撑 **Stage 2 叙事脊梁重组**、**Stage 4 四遍分轨验收**、以及 **Room Tone 连续优先于硬切死寂**的规则升级。 | 决策梯是专业启发式而非绝对物理定律，与事实保真冲突时须服从事实与原意保护。 |
| **L5** | **`ACMI Film It: Editing` 教学原文**（本地正式归档：[acmi-editing.html](../../../.agents/skills/laohu-analysis/assets/editorial-sources/acmi-editing.html)） | 明确划分 **Rough Cut（只定叙事顺序与素材块，不纠结细节）** 与 **Fine Cut（清掉场记/停顿废料、微调时长、逐缝排查 “blip” 杂音并用轻微 fade-in/fade-out 消除）**；解释时间压缩（Quick Cut / Jump Cut）的表达功能。 | 支撑**粗剪与精剪两阶段严格分离**及**微淡化除 blip 爆音**。 | 面向基础影视剪辑教学，侧重叙事画面；音频工程参数由广播与脚本规格补充。 |
| **L6** | **Kevin Macdonald 纪录片导演访谈 & Manim-Voiceover 语音书签**（本地正式归档：[parallel-perspectives.txt](../../../.agents/skills/laohu-analysis/assets/editorial-sources/parallel-perspectives.txt)、[bookmark-example.py.txt](../../../.agents/skills/laohu-motion/assets/editorial-sources/bookmark-example.py.txt)） | ① **Macdonald 访谈**：哪怕素材本身精彩，只要属于“另一部片子”就在粗剪阶段果断割舍；且片段排列顺序本身直接塑造观众因果与态度推断；② **Manim-Voiceover**：动画同步依赖三类真实原语——等待某词触发（`wait_until`）、在两词间完成动画（`time_until`）、给动作设上限并留尾段阅读时间（且明确警惕线性音节插值不可冒充实测词锚）。 | 支撑**粗剪果断去支线**、**重排语境保真核查**，以及面向 `laohu-motion` 的 **`animation-handoff` 节奏窗口与词锚摘要设计**。 | Macdonald 访谈是个案创作经验；Manim 书签仅借用时间关系语义，不沿用其音节线性推算。 |

### 2.2 本轮核查的外部权威论文、经典著作与行业规范

| 编号 | 权威来源（作者 / 年份 / 出版物） | 核实的核心科学结论或成熟专业方法 | 对本方案的具体支撑位置 | 适用边界与约束 |
|---|---|---|---|---|
| **E1** | Zellner (1994)《Pauses and the temporal structure of speech》，章节转述 Goldman-Eisler、Grosjean 与 Deschamps 等研究。 | 物理静音与听感有别。停顿可在语篇中承担结构、焦点或迟疑等作用，具体与说话任务有关。 | 支撑先问停顿有何作用，再判断是否能缩短。 | 约 200–250ms 是章节中讨论的听辨口径。项目数值另见 3.1。 |
| **E2** | Yang (2008) 关于普通话自发复述的语篇边界观察，及 Kuang 等 (2022) 关于英汉韵律边界的知觉研究。 | 句末音节时长、停顿及其他声学线索都可能帮助辨认边界。停顿在部分语料中能提示语篇层级，其作用与语言和话语条件有关。 | 支撑保留尾音和按语义层级分别考虑气口。 | 群体语料能帮助解释机制，具体播讲目标由用户标准、口吻与听感共同决定。 |
| **E3** | **Walter Murch《眨眼之间》**（*In the Blink of an Eye*, 2nd ed., 2001）—— **六大剪辑法则（The Rule of Six）** & 纪录片 **Paper Edit** 流程 | 剪辑决策冲突时的经典优先级排序：**1. 情绪（51%）> 2. 故事（23%）> 3. 节奏（10%）> 4. 视线引导（7%）> 5. 二维平面轴线（5%）> 6. 三维空间连续（4%）**。当不可兼得时，永远牺牲低顺位保高顺位；纪录片面对庞杂原片须先做 **Paper Edit（纸面粗剪定结构）** 再进时间线精剪。 | 为 `laohu-asrcut` 提供**硬冲突裁决法则**（例：宁可制造可被画面遮蔽的跳剪，也不保留毁掉情绪与逻辑的 5 秒结巴；绝不为了抢 10% 的紧凑节奏删掉 74% 的情绪与故事前提）。 | 百分比为 Murch 个人经验权重隐喻，非可数学求和的打分公式；在知识科普/操作演示中，“事实/条件准确”与故事逻辑同属最高保护层。 |
| **E4** | **文本/语音驱动音视频剪辑三篇里程碑论文**：① Rubin et al., *Content-Based Tools for Editing Audio Stories*（**ACM UIST 2013**）；② Berthouzoz, Li & Agrawala, *Tools for Placing Cuts and Transitions in Interview Video*（**ACM SIGGRAPH 2012**）；③ Truong, Berthouzoz, Li & Agrawala, *QuickCut*（**ACM UIST 2016**） | ① **Rubin (UIST 2013)**：文本操作自动吸附词边界防截断；显式识别停顿/呼吸/重复；**自动采集原始录音 Room Tone 填补剪后空隙，杜绝刺耳数字死寂**；② **Berthouzoz (SIGGRAPH 2012)**：联合音频静音与画面静止度做 **Cut-Suitability Analysis（声画适宜度分析）**，定位“声画双干净”切点并处理跳剪；③ **Truong *QuickCut* (UIST 2016)**：**Audio-First Narration-Driven Editing**——先以口播叙事锁定语音脊梁，再对齐视觉事件约束并用确定性算法求解帧级切点。 | 直接支撑本方案 4 项关键工程能力：**`audio-probe.mjs`（静音谷底 + Room Tone 采集）**、**`apply-edits`（文本/语义声明式操作自动吸附整词边界）**、**`export-video`（声画对齐与帧级量化）**与 **`animation-handoff`（音频脊梁驱动下游动画）**。 | 论文原型采用特定研究工具链；本仓库不搬运外部代码，仅吸收其已验证的设计范式并用本地确定性 Node + FFmpeg 架构实现。 |
| **E5** | Transom 的 Jeff Towne 与 Rob Rosenthal 实操指南，以及 NPR Training 的官方混音检查表。 | 用源房间底声平滑接续，保留仍符合口吻的呼吸，短淡入淡出可处理部分波形接点的咔嗒声。整体混音回听需要检查电平与转场。 | 支撑逐步试听、室内底声保护和可选淡化。 | 10–15ms 试做、30ms 上限是本地实现选择，本轮仍按实际声画验收。 |

---

## 三、《留白与停顿》的循证拆解与七条执行法则

### 3.1 原图六项标准的“实践值 × 科学依据”对照表

用户提供的《留白与停顿》作为剪辑默认档。外部资料解释优先保护哪些语音和语篇线索，目标数值按本项目试听使用。

| 原图条目 | 数值标准 | 剪辑角色 | 循证声学与认知机制（来源编号） |
|---|---|---|---|
| **开口前留白** | `0.15s`（150ms） | 片头/章首前导（Head Room） | 按实际起音留足余量，先核查 ASR 词首可能落在辅音内的位置（L3）。 |
| **说完后留白** | `0.20s`（200ms） | 片尾/章尾尾声（Tail Room） | 保住源尾音、自然衰减和能帮助识别边界的音节时长（E2）。 |
| **自然微停顿保护** | `≤ 0.35s` 保留 | 句内微停顿默认整段保留 | 自然气口可能承担语流与段内表达作用（E1、E2）。0.35s 为本项目保护值。 |
| **逗号级停顿** | `0.35–0.45s` | 同一意思内的分句 | 给听者分辨条件、并列或转折的时间，按口吻试听。 |
| **句号级停顿** | `0.55s` | 完整命题收束 | 让听者确认这句话已经完整结束，原声已经连贯时可保留现有短停顿。 |
| **换段级停顿** | `0.70s` | 转换主题或表达任务 | 让听者辨认转题，剪后可用时窗也可给实际画面承接。 |

### 3.2 落地为 `laohu-asrcut` 的七条可执行停顿法则（拟写入 `references/pause-and-pacing.md`）

1. **法则 1｜语义层级优先于 ASR 自动标点**：禁止按 ASR 自动逗号/句号/换行机械套秒数。须先依语义结构还原真实边界——`head`（开口前）、`tail`（说完后）、`micro`（句内微停顿）、`clause`（分句/逗号级）、`sentence`（完整句/句号级）、`paragraph`（主题换段级）——再匹配目标时长。
2. **法则 2｜真源 Room Tone + 非对称声学谷底切口法**（结合 `L3` Rule 18、`E2` 边界前延长、`E4` Rubin & `E5` NPR）：
   - 压缩长停顿或删废话后跨段拼接时，**优先保留原录音真实 Room Tone**，绝不盲目全删再填数字死静音；
   - 通过 `audio-probe.mjs`（`probe-silence`）找到前句真实尾音衰减终点、后句真实起音起点及两者间的**最低能量平稳谷底（避开吸气正中与咂嘴声）**；
   - 按**前多后稳**的非对称原则分配总留白 $T_{\text{target}} = T_{\text{tail}} + T_{\text{head}}$：

| 语义边界 | 目标总留白 $T_{\text{target}}$ | 推荐前段尾余量 $T_{\text{tail}}$（护边界前延长与尾音） | 推荐后段头余量 $T_{\text{head}}$（避 Rule 18 辅音偏移） | “零切口”容差免动刀原则 |
|---|---|---|---|---|
| **开口前（`head`）** | `0.15s`（`0.12–0.18s`） | — | `0.15s` | 若原源起音前不足 `0.15s`，保留全部可用真源前导并注明，不伪造源音。 |
| **说完后（`tail`）** | `0.20s`（`0.18–0.25s`） | `0.20s` | — | 若原源尾后不足 `0.20s`，保留至源末并注明。 |
| **自然微停顿（`micro`）** | 原长（`≤ 0.35s`） | 不切开 | 不切开 | **默认整段免剪**（显式重录/口误邻接除外）。 |
| **逗号级（`clause`）** | `0.35–0.45s`（标称 `0.40s`） | `0.20–0.25s` | `0.15–0.20s` | 原停顿已在 `0.35–0.48s` 且无杂音 → **整段保留零切口**。 |
| **句号级（`sentence`）** | `0.55s`（窗 `0.50–0.60s`） | `0.30–0.35s` | `0.20–0.25s` | 原停顿已在 `0.45–0.65s` 且无杂音 → **整段保留零切口**。 |
| **换段级（`paragraph`）** | `0.70s`（窗 `0.65–0.80s`） | `0.35–0.45s` | `0.25–0.35s` | 原停顿已在 `0.60–0.85s` 且无杂音 → **整段保留零切口**；开场 Hook 后兼容上游约 `0.5–0.7s` 转场着陆拍。 |

3. **法则 3｜原停顿短于目标时的防破坏铁律**（依据 `E4` Rubin & `E5` NPR）：
   - 原语流自然流畅（如句号处仅停 `0.25s`）且无需等待画面消化时，**保留原流畅衔接，绝不强行切开硬塞数字零样本（`-∞ dBFS`）**；
   - 仅当删去中间废话后拼接过紧、确实缺少必要的句号/换段呼吸，且原源前后余量不足时：① 优先在安全安静边缘微借同源 room tone；② 仍不足时按授权用独立 `/2 presentation` 时段或经授权的同源 Room Tone 样本补足，绝不把人工补时伪装为原始连续语音。
4. **法则 4｜呼吸筛选与五类功能性停顿豁免**（依据 `E3` Murch 情绪/故事优先、`E5` NPR、`L1` 白板/录屏保护）：
   - **呼吸**：保留承载自然口吻与信息节奏的普通换气；仅当吸气过响、刺耳吞气或出现在无意义停顿中断处才列入剪除/轻修候选；
   - **五类功能豁免（高于数字目标）**：① 情绪蓄力/笑点停顿（Deadpan Hold）/悬念留白；② 录屏系统提示音与演示声；③ 画面正在进行中的关键手势/UI 操作等待（`L2` F2、`L3`）；④ 用户显式锁定区间；⑤ 需要观众消化复杂图表的留白。
5. **法则 5｜三档显式节奏 Profile**（取代现行悬空的“紧凑气口 profile”）：
   - **`standard-narration`（默认标准口播档，即原图基准）**：`0.15s / 0.20s / ≤0.35s 保留 / 0.35–0.45s / 0.55s / 0.70s`；
   - **`compact`（紧凑高密度档，承接原“紧凑气口”与 `cutting.txt` `punchy`）**：`0.10–0.15s / 0.15–0.20s / ≤0.25s 保留 / 0.25–0.35s / 0.40–0.45s / 0.55–0.60s`（仅用户明确要求强密度短视频快剪时启用）；
   - **`natural`（自然叙事档，承接 `balanced`/`restrained` 并采用本地 1 秒候选阈值）**：`0.15–0.25s / 0.20–0.35s / ≤0.60s 保留`，仅压缩 `>1.0s` 无功能死寂（目标 `0.50s / 0.70s / 0.90–1.0s`），适用于深度访谈、故事讲述与纪录片。
6. **法则 6｜三级输入精度降级矩阵**：
   - `真实原音 + probe-silence + 词级 ASR` → 完整执行六级梯队 + 谷底非对称切口；
   - `仅词级 ASR（无原音）` → 仅输出候选停顿规划，强制声明“未核波形、存在 Rule 18 词首偏移与未知系统声风险”；
   - `仅 SRT / utterance` → 严禁句内逗号切分，仅标句段间长空隙候选。
7. **法则 7｜音频驱动剪视频的声画协同规则**（依据 `E4` Berthouzoz Cut-Suitability、`L2` F5、`L4` 连续性）：
   - 每处音频剪口同步检查同期画面：**动作/UI 正在进行中**则标为视觉持续区不盲剪；**固定机位单镜音频跳剪 `>0.35s`** 则标注 `visualSeamRisk: "jump-cut"` 与遮蔽建议（微推景别 / B-roll 或录屏切入 / 动画卡片覆盖 / J-L cut 余量）；**导出视频**采用累计绝对时间点帧量化防 A/V 累积漂移。

---

## 四、透彻解决“粗糙原片 → 动画就绪”的四阶段专业剪辑闭环

这是本次升级**最核心的方法论跃迁**。结合 `L1`（`dbs-script-flow`/`dbs-hook`）+ `L2`（`Micro-Edits` Radio Edit → View Edit）+ `L3`（`cutting.txt`）+ `L4`（`montage` Story Spine & 4-Pass）+ `L5`（ACMI Rough/Fine）+ `E3`（Murch 六法则 & Paper Edit）+ `E4`（QuickCut / Rubin）+ `E5`（NPR），把 `laohu-asrcut` 从“零散防错条款集合”重塑为一条**专业剪辑师级的四阶段闭环流水线**：

```text
粗糙原片（录音 / 录屏 / 实拍 / ASR / SRT）
  │
  ├─► Stage 1【素材盘点与声学探底（Selects & Acoustic Audit）】
  │     · 核实源身份、哈希、主音轨时钟、多轨同步偏移与可用精度
  │     · 运行 probe-silence：输出采样级静音谷底表 + 纯净 Room Tone 候选池 + 词首偏移告警
  │     · 通读全部重录尝试（L3 Take selection）：标出误录、试麦、重来边界与可拼的强头强尾
  │
  ├─► Stage 2【纸面粗剪与逻辑脊梁（Paper Edit / Rough Cut — 内容与逻辑优先，暂不抠毫秒！）】
  │     · 确立本片剪辑承诺与叙事脊梁（L4 Edit Promise & Story Spine）
  │     · 应用 dbs-script-flow 三维扫描（L1）：
  │         1) 逻辑衔接（查 A→C 缺 B 断裂）；2) 信息密度（清重复绕圈与无新增信息废话）；
  │         3) 视觉伴随词保护（录屏/白板的“看这里/划重点”随画面保留，不误删）
  │     · 应用“删前脑补检验”（L1）与 Murch 六法则（E3 情绪 > 故事 > 节奏 > 连续性）裁决冲突
  │     · 应用 Macdonald 支线割舍原则（L6）与 dbs-hook 开场诊断（L1）：清弱开场；若发现高能金句适合前置，
  │       作为“待授权重排建议”呈现，获准后方写入 sequence
  │
  ├─► Stage 3【广播级精剪与韵律整形（Radio Edit / Fine Cut — 闭眼纯听节奏，L2 F3）】
  │     · 在内容脊梁锁稳后，进入精剪：清卡壳口误、筛选刺耳吸气、保留自然换气（E5）
  │     · 按第三章七条法则执行六级《留白与停顿》整形 + 声学谷底非对称切口 + Room Tone 保真
  │     · 输出简洁声明式操作单 edit-ops.json → 交给 apply-edits 确定性生成 edit-plan.json
  │     · 编译唯一 timeline.json，按授权执行 export-audio（推荐 --seam-fade-ms 10–15 除爆音）或 export-video / export-nle
  │
  └─► Stage 4【四遍分轨核验与动画就绪交接（4-Pass Audit & Animation-Ready Handoff）】
        · 生成原地标记式 review.html（原文删除线 + 改动清单 + 多轮 ⚠️ 撤回记录 + 原音/剪后独立试听）
        · 实体导出后运行 extract-seams 逐缝核听/按授权短窗重转写（L3 Verifying a cut）
        · 按需执行四遍分轨审片（L4：纯音轨 Radio 遍 / 静音画面遍 / 纯字幕遍 / 声画合看遍）
        · 派生只读的 animation-handoff.json（不改 timeline 哈希！），向 laohu-analysis / laohu-motion 交付：
            ① 语义节奏段落图（narrativeBeats）
            ② 剪后已存在的自然呼吸与视觉落版窗（availablePauseWindows ≥ 0.45s）
            ③ 视觉伴随词与核心概念词锚候选（visualCueCandidates，呼应 Manim Bookmark）
            ④ 跳剪风险与画面持续保护标记（visualSeamRisks）
```

> *Micro-Edits* 观察到部分剪辑师先调对话节奏，再独立调整反应镜与切入镜。*QuickCut* 用旁白事件约束视觉切点。这里采用同一工作关系，先整理口播逻辑和节奏，再把真实锚点与可用窗口交给动画。接缝听感、字幕读完的时间和画面衔接仍需在本项目素材上验收。

---

## 五、`laohu-asrcut` 全域深度诊断：6 项必保硬资产与 8 项核心断点

### 5.1 必须 100% 保护的 6 项既有硬资产

1. **三层文本证据隔离**：`rawText` 永不改写、`spokenText` 须核听绑定、`displayText` 与字幕层独立。
2. **确定性整数采样编译器与单一时钟真源**：半开区间 `[startSample, endSample)`、`BigInt` 精确舍入、唯一 `occurrenceId`、禁止下游私自累计时长。
3. **双哈希防篡改与原件零覆盖保护**：`planSha256` + `annotationSha256` 独立校验、`verifyPlanEvidence` 原始字节校验、路径别名/inode 检查。
4. **全源完整覆盖与可追溯删除账本**：覆盖 `0..durationSamples` 无空洞，重复删除（`repeated-content`）强制指向实际保留的 `keptOccurrenceIds` 与 `tokenIds`。
5. **连续源先修音再按时间线裁切 + 等响度 A/B 审听**：[audio-postproduction.md](../../../.agents/skills/laohu-asrcut/references/audio-postproduction.md) 与 [audio-postprocess.mjs](../../../.agents/skills/laohu-asrcut/scripts/audio-postprocess.mjs) 的延迟校准与 `not_auditioned` 诚实声明。
6. **下游强契约兼容**：`laohu-motion` 与 `laohu-htmlshow` 既有 `/1` `/2` 接口及 `evals/test.mjs` 离线回归体系。

### 5.2 现行 `laohu-asrcut` 的 8 项核心问题诊断（精确控制点 + 断点归因 + 证据支撑）

| 编号 | 严重度 | 断点类别 | 真实控制点定位 | 根因机制与对模型发挥/最终结果的实际伤害 | 对应支撑证据 |
|---|---|---|---|---|---|
| **`ASRCUT-01`** | **P0** | 规则膨胀与结构失焦 | [SKILL.md](../../../.agents/skills/laohu-asrcut/SKILL.md) 98 行达 **25,942 B**（L55/59/61/96 单段 600–1,400 字）；普通剪辑必读链含 `runtime.md` 高达 **139.4 KB**（仅技能自身 79.8 KB）；字幕、修音、`/2 presentation` 与口语修正跨 3–4 处全文复读。 | 模型注意力被满屏“不得/禁止”和无关子域规则（如纯剪辑被迫读 24+ KB 字幕/修音细则）吞噬，退化为“合规防报错模式”，丧失主动剪辑手感。 | 仓库实测 `wc -c` + `rule-expression.md` L46–47 |
| **`ASRCUT-02`** | **P0** | 规则缺正向专业法度 | [editing.md](../../../.agents/skills/laohu-asrcut/references/editing.md) L20–21、L35–43 仅写“不套固定毫秒数”与悬空引用“项目紧凑气口 profile”。 | 缺乏正向的六级《留白与停顿》标准、汉语韵律梯队、非对称谷底分配与功能豁免，剪后节奏极易走向“窒息连珠炮”或“拖沓不动刀”两极。 | `E1`、`E2`、`E5`、用户原图标准 |
| **`ASRCUT-03`** | **P0** | 粗糙原片粗剪方法论薄弱 | [editing.md](../../../.agents/skills/laohu-asrcut/references/editing.md) L5–11 仅泛称“建立完整可理解路线”，未拆分 Paper Edit（内容脊梁）与 Radio Edit（节奏精剪），缺防误删检验、冲突裁决优先级与录屏伴随词保护。 | 面对杂乱冗长的粗糙原片时，模型易一边删停顿一边改结构、错删录屏视觉提示词（“看这里”）或误砍必要论证肉，或遇到跳剪 vs 废话冲突时犹豫不决。 | `L1`、`L2`、`L4`、`L5`、`L6`、`E3` |
| **`ASRCUT-04`** | **P0** | 规则与波形工具断层 | [cutting-companion.txt](../../../.agents/skills/laohu-asrcut/assets/editorial-sources/cutting-companion.txt) Rule 18 强制切口锚定波形静音而非 ASR 词首，但 `scripts/` 中**零静音/谷底/Room Tone 探测脚本**。 | 模型每次只能手写临时 shell 探针或退回裸 ASR 时间戳直接开切，导致辅音起音被切、词尾衰减被斩、剪除空隙出现突兀数字死寂。 | `L3` Rule 18、`E4` Rubin、`E5` NPR |
| **`ASRCUT-05`** | **P0** | 缺声明式编辑编排器 | [asrcut.mjs](../../../.agents/skills/laohu-asrcut/scripts/asrcut.mjs) L1788–1803 无 `apply-edits` 命令；`import` 仅产单条全长 `coverage`。 | 做 30 刀精剪迫使模型手搓数百 KB JSON（拆分 61 段 `coverage`、精准划分几千个有序 `tokenIds`、配对 `decisions`/`sequence` 并重算哈希），大量工作变成手工维护覆盖与样本映射。 | `E4` Rubin 文本驱动编辑范式 + 代码实查 |
| **`ASRCUT-06`** | **P0** | 音频驱动剪视频与动画交接断层 | [asrcut.mjs](../../../.agents/skills/laohu-asrcut/scripts/asrcut.mjs) L1563–1771 仅支持纯音频 WAV 导出；无 `export-video`（防帧率漂移）、无标准 NLE 交接（FCPXML/EDL/OTIO），亦无面向 `laohu-motion` 的现成停顿窗口与语义节拍摘要。 | 无法兑现“以音频驱动剪视频”闭环；下游 `laohu-analysis`/`laohu-motion` 拿不到现成自然呼吸窗与视觉伴随词锚点，难以顺滑衔接 View Edit。 | `L2` F3/F4/F5、`L6` Manim、`E4` Berthouzoz & QuickCut |
| **`ASRCUT-07`** | **P1** | 接缝爆音与逐缝验证缺工具 | [asrcut.mjs](../../../.agents/skills/laohu-asrcut/scripts/asrcut.mjs) L1655 无接缝微淡化（与 Rule 3、ACMI、NPR 冲突）；[editing.md](../../../.agents/skills/laohu-asrcut/references/editing.md) L83–87 要求逐缝 2–3s 核听/重转写，却无 `extract-seams` 切片工具。 | PCM 硬接易出咔嗒爆音；逐缝核实成本过高易被实战跳过。 | `L3` Rule 3 & Verifying、`L5` ACMI、`E5` NPR |
| **`ASRCUT-08`** | **P1** | `/2 presentation` 禁止片头与片尾 | [asrcut.mjs](../../../.agents/skills/laohu-asrcut/scripts/asrcut.mjs) L832–833、L1098–1100 禁止无源展示时段出现在首句前或末句后。 | 动画与口播视频最高频的**片头视觉导入**与**片尾结论定格**被迫绕开唯一时间轴处理。 | 代码实查 + `laohu-motion` 实际消费需求 |

---

## 六、同材料局部改后对照（仅报告内对照，未改原件）

> 按 [规则表达 · 报告内局部对照](../../../.agents/skills/laohu-evolution/references/rule-expression.md#对已确认差距做报告内局部对照)，抽取现行原件中两处核心段落做同材料最小完整改后对照，检验“零信息损耗 + 正向可执行 + 下游接口不变”。以下对照**未修改原文件**。

### 对照 1：升级“停顿与剪口衔接”为循证正向规则（对应 `ASRCUT-02`，原位：`references/editing.md` L40）

- **改前原件（[editing.md](../../../.agents/skills/laohu-asrcut/references/editing.md#L40)）**：
  > 2. **剪掉无功能的原录音静音并衔接两段口播。** 先判定停顿确实无功能且删除在本轮授权内，再试听待删段，保护前词尾音、后词起音、辅音闭塞、爆破音与语义完整性。若工作项目的紧凑气口 profile 明确适用于该录屏口播接缝，读取该项目 profile 的总余量目标；这不是普遍音频 padding。其他场景按实际口语/演示功能决定是否留余量，不套固定毫秒数，也不机械给剪口两侧补边。没有可听音频或边界精度不够时，只把相关切点列为待核，不拿 ASR 缝隙或能量零点伪装已验证安全。
- **改后方案（局部替代文本）**：
  > 2. **按语义层级裁剪无功能静音并锚定声学谷底。** 先判定停顿不承担情绪蓄力、系统提示音或进行中的画面操作，且删除在授权内；再按真实语意（不盲信 ASR 自动标点）确定边界级别并读取新建的 `references/pause-and-pacing.md`：
  >    - **默认标准口播档（`standard-narration`）**：开口前留 `0.15s`、说完后留 `0.20s`；`≤ 0.35s` 自然微停顿整段保留；过长静音裁剪或删段拼接时，目标总留白按 **逗号/分句 `0.35–0.45s`、句号/整句 `0.55s`、换段/转题 `0.70s`** 控制（若明确要求高密度短视频或自然访谈，切至 `compact` 或 `natural` 档）。
  >    - **声学落刀原则**：通过 `probe-silence` 定位真实低能量谷底与纯净 Room Tone，按“前段尾余量护末音节衰减（Pre-boundary Lengthening）、后段头余量护辅音起音并避开 ASR 词首偏移（Rule 18）”非对称留边；原停顿已落在目标容差窗内且无杂音时整段保留零切口；原流畅短停顿不强行切开塞数字死寂。
  >    - **证据与精度保护**：无原音核验或仅句段精度时，严禁句内切分或把 ASR 缝隙/能量零点伪装为已验证安全，相关切点标为待核。
- **保真与首个下游核查**：原段全部 5 项有效约束 100% 保留；首个下游（`apply-edits` 与 `compilePlan`）仍产出精确整数半开样本区间，零接口破坏。

### 对照 2：拆解 `SKILL.md` 巨型文字墙并归口唯一真源（对应 `ASRCUT-01`，原位：`SKILL.md` L59）

- **改前原件（[SKILL.md](../../../.agents/skills/laohu-asrcut/SKILL.md#L59)）**：单段 **1,290 汉字** 混装时间线交接、`brief.md`、`caption-design/2` 双语字段、`annotations[]`、`annotationSha256`、`/2 presentation` 冻结重编、`source pause` 区分六大主题。
- **改后方案（主文保留可扫读总控，字段细则归各自唯一真源）**：
  > **下游交接与动画协同（完整契约见 `references/timeline-and-handoff.md`）**：
  > - **面向 Analysis / Motion（View Edit 下游）**：交付冻结且哈希有效的 `timeline.json` 及只读节奏摘要 `animation-handoff.json`（含语义节拍、已存在的自然呼吸窗 `≥ 0.45s`、视觉伴随词锚点与跳剪风险）；Motion 不得私自拉长镜头、平移冻结时钟或另建时间线。
  > - **无源展示时段（`/2 presentation`）**：须先计入已保留原声中的可用停顿，仅对净不足部分提交边界（支持段间、片头与片尾）、画面任务与预算，经授权重编译并递增 `revision`。
  > - **局部旁注（`annotations[]`）**：仅存用户备注、分析备注与既有局部 Motion 绑定，由 `annotationSha256` 独立校验，绝不替代唯一 `brief.md`，也不改动原文、顺序或 `planSha256`。
  > - **屏显字幕编译**：仅任务需要字幕清单或同源 SRT 时，按需读取唯一真源 `references/captions.md`（支持 `/1` 与双语默认 `/2`、`zh-caption/2`）；字幕层独立编译，不改写音频切口与 `displayText`。
- **保真与首个下游核查**：原段 12 项独立判断零删减，纯音频/视频剪辑任务不再被迫加载字幕字段细则。

---

## 七、总体架构决策、生态影响面扫描与上下文负载预算

### 7.1 架构选型：方案 A（推荐）vs. 方案 B

| 比较维度 | **方案 A（推荐）：精炼 L2 真源枢纽 + 6 份职责单一条件 References + 确定性工具补齐** | 方案 B：L2 宿主 + L3 内部父级方法模块（`skills/laohu-asrcut-*/SKILL.md`） |
|---|---|---|
| **领域契合度** | **极高**。所有子任务共享同一套 `edit-plan`/`timeline` Schema 与脚本栈，用条件 Reference 按需加载即可实现彻底解耦，不人为制造多余层级。 | 偏重。L3 模块适合彼此独立的创作体系（如 `laohu-story` 喜剧引擎或 `laohu-video` 武戏/摄影），强套到强工程契约技能会增加目录与跳转开销。 |
| **生态零断链** | **100% 兼容**。`laohu-motion`、`laohu-benchmark`、`laohu-analysis` 对 `references/*.md` 的既有相对链接全部原位保留。 | 需在旧路径留跳转壳或跨仓库批量改链。 |
| **减负与切换条件** | 技能自身必读负载降幅 **35%–70%**。仅当未来视频多机位剪辑或 AI 神经修音独立成长为 >25 KB 的重型决策子系统时，再将对应分支升级为 L3 模块。 | 负载相近但增加约 3–4 KB 知识塔固定路由成本。 |

### 7.2 重构后目标目录全景

```text
.agents/skills/laohu-asrcut/
├── SKILL.md                              # 【瘦身重构 ~12 KB】定位、四维原则、4 条快车道、6 条硬边界、按需路由表、命令速查与交付前验收
├── SOURCES.md                            # 【增补】入账本方案第二章全部 11 份本地与外部权威依据、许可与适配边界
├── agents/openai.yaml                    # 【同步】覆盖粗糙原片粗精剪、停顿节奏、音频驱动剪视频/动画底盘与口播修音
├── references/
│   ├── input-and-asr.md                  # 【保留并增补 ~6.5 KB】输入/ASR/SRT/Cap 边界 + probe-silence 与 Room Tone 证据角色
│   ├── editing.md                        # 【精炼升级 ~13 KB】四阶段粗精剪方法论（Paper Edit + dbs-script-flow 防误删 + Murch 冲突裁决 + Take 选择 + ASR 修正 + 全源覆盖 + 四遍核验）
│   ├── pause-and-pacing.md               # 【新增 ~9.5 KB】《留白与停顿》六级基准、心理语言学/汉语韵律依据、谷底非对称切口、Room Tone 保真、三档 Profile、精度降级与视频跳剪/帧对齐
│   ├── timeline-and-handoff.md           # 【精炼升级 ~14.5 KB】双哈希/时钟契约、apply-edits、/2 首尾 presentation、原地标记式 review.html、animation-handoff、音视频/NLE 导出与 JS API 附录（旧 #语义字幕编译 留 1 行指针）
│   ├── captions.md                       # 【新增唯一真源 ~10 KB】无损归拢的字幕设计与编译契约（/1 & /2、zh-caption/2、双语、SRT）
│   └── audio-postproduction.md           # 【完整保留 ~13.5 KB】连续源修音与等响度 A/B 审阅（独立按需加载）
├── schemas/
│   ├── asrcut.schema.json                # 【向后兼容扩展】保留 /1 /2 原哈希语义；增可选 pacingProfile、visualSeamRisk、seamFadeMs、首尾 presentation 放宽
│   └── caption.schema.json               # 【保持不变】
├── scripts/
│   ├── asrcut.mjs                        # 【向后兼容增强】新增 apply-edits、extract-seams、export-audio --seam-fade-ms、export-handoff、放宽首尾 presentation
│   ├── audio-probe.mjs                   # 【新增】probe-silence（采样级静音谷底 + Clean Room Tone 样本池 + ASR 词首偏移告警）
│   ├── video-and-nle.mjs                 # 【新增】export-video（累计绝对时间戳帧量化防 A/V 漂移）与 export-nle（FCPXML / CMX 3600 EDL / OTIO）
│   ├── asr-provider.mjs                  # 【保持不变】
│   ├── audio-postprocess.mjs             # 【保持不变】
│   └── caption-manifest.mjs              # 【保持不变】
├── assets/editorial-sources/             # 【完整保留】cutting.txt、cutting-companion.txt 及许可证
└── evals/
    ├── evals.json                        # 【保留原 12 条 + 新增 8 条 = 20 条】
    └── test.mjs                          # 【保留全部既有测试 + 新增工具与契约单元测试】
```

### 7.3 生态影响面扫描与兼容性保护

| 实际消费者 | 依赖方式 | 本方案兼容策略 |
|---|---|---|
| `laohu-motion/scripts/production-plan.mjs`、`evals/production-plan.test.mjs`、`evals/video-shotcraft-runtime.test.mjs` | 直接 `import` `asrcut.mjs` 导出函数，强校验 `timeline/1 & /2` 与 `caption-manifest/1 & /2` 哈希。 | **100% 兼容**：既有导出函数签名与 `/1` `/2` 序列化哈希字段完全不变；`animation-handoff.json` 为独立只读派生文件，不污染 `timeline.json`；实施 `/2` 首尾 `presentation` 扩展时同步核验并适配 `production-plan.mjs`。 |
| `laohu-motion/references/speech-cue-binding.md`、`meaning-to-motion.md` | 相对链接引用 `input-and-asr.md`，消费 `units[]` 与 `voiceWindows`。 | **零断链**：保留原文件与锚点；新增可选消费 `animation-handoff.json` 以直接复用已存在的自然呼吸窗。 |
| `laohu-analysis/references/editing-design.md`、`editorial-design.md`、`SOURCES.json` | 引用 `cutting.txt`、`cutting-companion.txt` 并衔接时间线交接。 | **零影响 + 协同升级**：`laohu-analysis` 写动画 Brief 时可直接读取 `animation-handoff.json` 中的 `narrativeBeats` 与 `availablePauseWindows`。 |
| `laohu-htmlshow` | 消费 `edit-plan.json` 与 `timeline.json` 生成 `review.html`。 | **向后兼容 + 体验升级**：原有字段结构不变；审阅页平滑支持原地删除线对照、停顿档位前后时长差与 `visualSeamRisk` 标签展示。 |
| `laohu-benchmark/consumer-map.json`、`time-and-sound-analysis.md` | 指向 `SKILL.md`、`editing.md`、`timeline-and-handoff.md`。 | **零断链**：三原路径全部保留；写回时顺手追加 `pause-and-pacing.md`。 |

### 7.4 上下文负载与认知复杂度前后预算（扣除共同 `docs/runtime.md` 59.6 KB）

| 代表任务 | 现行技能必读负载（实测） | 改后预计技能必读负载 | 降幅与核心认知收益 |
|---|---|---|---|
| **T1：粗糙口播录音/视频粗精剪（无字幕、无修音）** | 4 文件 / **79.8 KB**（含 `runtime` 139.4 KB） | 剪辑判断阶段 4 文件 **~41 KB**；含编译导出 **~55.5 KB** | **判断阶段降幅 ~49%**；零无关字幕/修音噪音，单段 ≤ 250 字，新增四阶段法度与停顿标准。 |
| **T2：纯口播修音（无 ASR、无剪辑）** | 2 文件 / **39.2 KB** | 2 文件 **~25.5 KB** | **降幅 ~35%**；直通修音快车道，剔除 14 KB 无关剪辑文字墙。 |
| **T3：已有时间线的双语字幕编译** | 3 文件拼图 / **72.9 KB** | 2 文件 **~22.0 KB** | **降幅 ~70%**；三处散落收口为 `captions.md` 单一真源，查找次数 3→1。 |
| **T4：仅 SRT 虚拟剪辑（无原音）** | 4 文件 / **79.8 KB** | 3–4 文件 **~35–41 KB** | **降幅 ~49%–56%**；明确句段级降级边界。 |

---

## 八、面向实施的决策级变更规格（规则文档层 + 确定性工具层）

### 8.1 规则文档层核心写入规格（交由 `/laohu-evolution` 执行）

1. **`SKILL.md`（目标 ~12 KB）**：
   - 开篇接入 `docs/runtime.md`；
   - **定位与四维原则句**：确立“以音频与语义为脊梁，把粗糙原片雕琢成呼吸自然、可追溯、可直接驱动视频与动画的时间底盘”；
   - **4 条任务快车道**：A. 音频/视频剪辑（默认虚拟，授权导出音/视频/NLE/动画摘要） / B. 已有时间线字幕编译（仅读 `captions.md`） / C. 纯口播修音（不调用 ASR，仅读 `audio-postproduction.md`） / D. 完整声画制作协同（Analysis/Motion 联调）；
   - **6 条集中硬边界铁律**（唯一总控，各节不再复读）：三层文本隔离 / 唯一时钟与双哈希 / 语义与声学双保护（含 `≤0.35s` 与功能停顿保护）/ 权限与原件零覆盖 / 五态诚实报告（虚拟、编译、导出、逐缝核听、用户批准）/ 审阅页优先呈现；
   - **按需 Reference 路由表** + **分场景 CLI 速查表**（底层 JS API 迁至 `timeline-and-handoff.md` 附录）。
2. **`references/editing.md`（精炼并升级至 ~13 KB）**：
   - 移出字幕与修音重复段落；
   - 建立 **Stage 1（Take 盘点与声学探底）→ Stage 2（Paper Edit 纸面粗剪：Edit Promise、Story Spine、`dbs-script-flow` 三维扫描 + 删前脑补检验 + 白板/录屏伴随词保护 + Murch 六法则冲突裁决 + Macdonald 支线割舍 + `dbs-hook` 弱开场识别与待授权重排建议）→ Stage 3（Radio Edit 闭眼纯听节奏 + 指针转入 `pause-and-pacing.md`）→ Stage 4（原地标记式审阅 + `extract-seams` 逐缝核听/重转写 + 四遍分轨验收）**；
   - 完整保留 ASR 修正、全源覆盖账本、重复引用校验、重剪报告（`>1/4`）与重排授权规则。
3. **`references/pause-and-pacing.md`（新增 ~9.5 KB）**：完整写入第三章七条法则、六级标准表、非对称切口表、三档 Profile、Room Tone 保真、呼吸筛选、三级精度降级矩阵与视频跳剪/帧对齐规则；同时在本地闭合写入关键声学与心理语言学机制解释（不留外部 URL 作为运行依赖）。
4. **`references/captions.md`（新增 ~10 KB）**：无损汇入 `SKILL.md` / `editing.md` / `timeline-and-handoff.md` 三处的全部字幕规则（`/1` & `/2`、`zh-caption/2`、`verbatim/1`、双语共用窗口、SRT 换行规范化），`timeline-and-handoff.md` 原锚点 `#语义字幕编译` 留 1 行指针。
5. **`references/input-and-asr.md` & `timeline-and-handoff.md` & `audio-postproduction.md`**：按第 7.2 节职责边界精炼去重、补齐新工具契约与 `animation-handoff` 规范。

### 8.2 确定性工程工具层规格（彻底解放模型，补齐音/视频/动画闭环）

#### 工具 1：`scripts/audio-probe.mjs`（`probe-silence` — 静音谷底 + Clean Room Tone 探针）
```bash
node .agents/skills/laohu-asrcut/scripts/audio-probe.mjs probe-silence \
  --input source.wav [--audio-stream-index 0] \
  [--noise-db -38] [--min-silence-ms 120] \
  [--plan edit-plan.json] --out silence-map.json
```
- **确定性输出**：
  1. `silences[]`：每个静音段的 `startSample`、`endSample`、`durationMs`、`valleySample`（最低能量谷底推荐落刀点）、`nearestZeroCrossingSample`、`minRmsDb`、`meanRmsDb`；关联 `--plan` 时附 `gapClassification`（`micro_preserve` ≤350ms / `clause_candidate` / `sentence_candidate` / `long_pause_candidate`）与 `onsetDriftWarning`（检测 ASR 词首与能量抬升间的 Rule 18 偏移）；
  2. `roomToneCandidates[]`（源自 Rubin UIST 2013 & NPR 规范）：自动筛选最平稳（低方差、无呼吸脉冲、无爆破杂音）的真实环境底噪原源区间清单（`sourceRange`、`rmsDb`、`stabilityScore`），供精剪拼接与授权底噪补桥使用；
  3. **硬约束**：纯只读分析，不修改源文件，不自动产生删除授权。

#### 工具 2：`asrcut.mjs apply-edits`（声明式安全剪辑编排器）
```bash
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs apply-edits \
  --plan edit-plan.json --ops edit-ops.json --out revised-plan.json [--update-plan]
```
- **核心价值**：模型只需写精简的高层编辑操作单 `edit-ops.json`（支持 `delete-range`、`trim-pause`、`reorder`、`repeat`、`spoken-correction`、`set-display-text`，并可选记录 `pacingProfile`、`visualSeamRisk`、`visualMaskHint`、`revertedFromDecisionId`），脚本确定性完成：全源 `coverage` 无空洞拆分、按原序分配全部 `tokenIds`、拒绝词内切割、对 `≤350ms` 自然停顿触发防误剪保护、校验 `repeated-content` 保留映射闭合、递增 `revision` 并重算 `planSha256`。

#### 工具 3：`export-audio --seam-fade-ms`、`extract-seams` 与 `export-handoff`（音质、核听与动画直通）
1. **`export-audio --seam-fade-ms <0..30>`**：默认 `0`（100% 向后兼容既有测试与回执）；实战口播导出推荐 `10–15ms`（上限 `30ms` 兼容 Rule 3），仅对非连续真实剪口边缘施用 FFmpeg `afade`，**输出样本数 0 漂移**，并在 `.artifact.json` 记录 `seamFadeMs`。同时支持可选的显式源 Room Tone 拼接段（`roomToneSourceRange`），杜绝数字死寂空洞，并在回执中透明记账。
2. **`extract-seams`**：自动定位 `timeline.json` 中每个真实接缝，从剪后媒体导出跨界 `±1.25s`（总长 `2.5s`）的 WAV 切片与 `seams-manifest.json`，直接支持人工逐缝核听与获准短窗重转写（`cutting.txt` *Verifying a cut*）。
3. **`export-handoff`（新增，专供下游 `laohu-analysis` / `laohu-motion`）**：
   ```bash
   node .agents/skills/laohu-asrcut/scripts/asrcut.mjs export-handoff \
     --plan frozen-plan.json --timeline timeline.json [--silence-map silence-map.json] \
     --out animation-handoff.json
   ```
   - 确定性派生**独立只读的 `animation-handoff.json`**（绑定 `project.id`/`revision`/`planSha256`/`timelineSha256`，不修改 `timeline.json` 哈希！），包含：
     - `narrativeBeats[]`：段落语义角色、精确 `targetRange`、覆盖的 `occurrenceId` 与首尾词锚；
     - `availablePauseWindows[]`：剪后时间轴内所有 `≥ 0.45s` 的真实句号/换段/蓄力自然呼吸窗（精确起止样本与秒数），让 Brief 与 Motion 直接复用现成观看时间，大幅减少无效加时；
     - `visualCueCandidates[]`：视觉伴随词（如“看这里/第一步/对比”）与核心锚点的 `occurrenceId + tokenId + targetRange`；
     - `visualSeamRisks[]`：全部音频剪口处的跳剪风险与建议遮蔽方式（供 Motion 安排画中画/图文卡/景别切换）。

#### 工具 4：`scripts/video-and-nle.mjs`（音频驱动视频裁剪与 NLE 交换）
- **`export-video`**：验证冻结计划、`mediaExport` 授权、原视频哈希与已知同步偏移（未知偏移直接拒绝）；采用**累计绝对目标秒数帧量化**（`startFrame = round(targetStartSec * fps)`、`endFrame = round(targetEndSec * fps)`）彻底消除多刀裁剪累积 A/V 漂移；音频轨直接复用确定性剪后 PCM 音轨（支持已绑定连续修音处理源）；`/2 presentation` 渲染显式占位帧并输出独立 `.video-artifact.json` 回执。
- **`export-nle`**：基于同一 `timeline.json` 确定性导出 **FCPXML**、**CMX 3600 EDL** 或 **OpenTimelineIO（`.otio`）**，并将 `visualSeamRisk`、`annotations` 与停顿档位写入 Timeline Markers，打通达芬奇/PR/FCP/剪映无损精修流。

#### 工具 5：放宽 `/2 presentation` 片头与片尾放置边界
- 允许 `insertPresentationInterval` 接受互斥定位字段 `position: "before-first" | "after-last"`（与原有段间 `afterOccurrenceId` 完全向后兼容），仍强制整片至少含 1 个真实 `source` 单元；实施时同步验证 `laohu-motion/scripts/production-plan.mjs` 对首尾 `presentation` 的消费兼容性。

---

## 九、零信息损耗语义迁移总表（Before / After 保护协议）

| 既有规则/判断单元 | 原分散位置 | 改后唯一真源 | 处理方式 | 信息与力度保真核对 |
|---|---|---|---|---|
| 原始 ASR / 核听口语 / 屏显文字三层隔离与 `spokenCorrections` | `SKILL.md` L22、`input-and-asr.md` L9/15、`editing.md` L45–49、`timeline-and-handoff.md` L21（4 处） | `SKILL.md` 硬边界 ① + `input-and-asr.md` | 语义去重归唯一真源，其余改 1 行指针 | **100% 保真**：`rawText` 不可改、`audio-listening`/`listened` 校验不变。 |
| 停顿、留白与剪口保护（含原悬空“紧凑气口”与 Rule 18） | `editing.md` L20–21/L35–43、`cutting.txt`、`cutting-companion.txt` | `references/pause-and-pacing.md` + `audio-probe.mjs` | **循证补缺升级**：落地六级停顿、谷底非对称切口、Room Tone 与三档 Profile | **保真且大幅增强**：原功能停顿保护、精度限制与 `/2` 净预算扣减 100% 保留。 |
| 粗糙原片粗精剪、重录取舍、重复校验、重排授权、全源覆盖与逐缝核实 | `SKILL.md` L32–47/L57、`editing.md` 全文 | `references/editing.md` + `asrcut.mjs`（`apply-edits`/`extract-seams`） | 升级为四阶段闭环（融入 Paper Edit / Radio Edit / `dbs-script-flow` / Murch / 四遍核验） | **保真且实质增强**：原所有语义保护、>1/4 重剪报告与重排红线 100% 保留。 |
| 语义字幕编译（`/1 & /2`、`zh-caption/2`、双语、SRT 换行） | `SKILL.md` L18/55/59、`editing.md` L49/53–63、`timeline-and-handoff.md` L44–61（3 处） | `references/captions.md` + `timeline-and-handoff.md` 原锚点兼容指针 | 无损合并迁出，按需加载 | **100% 保真**：全部字段、标点规则、双语默认与 `/1` 兼容一字不漏。 |
| 口播声音诊断、连续源修音与等响度 A/B | `SKILL.md` L63–76、`editing.md` L89–93、`timeline-and-handoff.md` L23–28/115、`audio-postproduction.md`（4 处） | `SKILL.md` 快车道 C + `audio-postproduction.md` + `timeline-and-handoff.md`（绑定回执） | 去重收口，独立按需加载 | **100% 保真**：先修连续源、延迟校准、`not_auditioned` 与 FFmpeg 白名单不变。 |
| 确定性时钟、双哈希、`/2 presentation`、路径别名零覆盖、Motion/HTMLshow 契约 | `SKILL.md` L51–61/L96–98、`timeline-and-handoff.md` 全文 | `SKILL.md` 硬边界 ②④ + `timeline-and-handoff.md` + `export-handoff` / `video-and-nle.mjs` | 拆解密文墙、补齐动画/视频交接、放宽片头/片尾 presentation | **100% 向后兼容**：旧 `/1` `/2` 哈希与既有消费者行为零破坏。 |
| 火山极速 ASR 上传前 `ffprobe` 校验、Cap 双时钟、SRT 句段精度 | `SKILL.md` L26–30/L94、`input-and-asr.md` | `references/input-and-asr.md` | 完整保留 + 增补 `probe-silence` 证据定位 | **100% 保真**：关闭 ITN/DDC、不自动上传、不伪造词时间不变。 |

---

## 十、评测保护清单、新增验证场景与分阶段施工验收

### 10.1 既有 12 条评测保护清单（100% 回归不得受损）

完整保留 [evals/evals.json](../../../.agents/skills/laohu-asrcut/evals/evals.json) 既有 12 条案例，实施后全量跑通 `node .agents/skills/laohu-asrcut/evals/test.mjs` 及 `laohu-motion` 跨技能测试（`production-plan.test.mjs`、`video-shotcraft-runtime.test.mjs`）。

### 10.2 新增 8 条核心行为与工程评测规格

| 新增案例 ID | 类型 | 验收目标与关键观察点 |
|---|---|---|
| `rough-recording-paper-edit-before-radio-edit` | `behavior` | 输入含反复重录、逻辑跳跃、绕圈废话、录屏伴随词（“大家看屏幕左边这里”）与潜在高能金句的粗糙录屏转写：验证模型先做 Paper Edit（保护伴随词、用“脑补检验”防误删必要论证肉、提出待授权重排建议而非私自重排），再做 Radio Edit 停顿精剪，并用原地删除线+改动清单呈现。 |
| `pause-hierarchy-standard-narration` | `behavior` | 含错误 ASR 标点、0.28s 自然微停顿及过长逗号/句号/换段停顿的口播材料：验证模型按**真实语义而非 ASR 标点**分级；保留 `≤0.35s` 微停顿；压缩长停顿至 `0.35–0.45s` / `0.55s` / `0.70s` 并留开口前 `0.15s` / 说完后 `0.20s`。 |
| `pause-no-synthetic-silence-and-functional-exemption` | `behavior` | 语速紧凑流畅（句号自然停顿 `0.24s`）+ 含 1.1s 系统提示音与情绪蓄力的录音：验证模型**不强切流畅语流塞死寂**，且**豁免保护系统声与情绪留白**。 |
| `pause-precision-degradation-srt-only` | `behavior` | 仅 SRT 无原音却要求按逗号 0.4s 精剪：验证模型**拒绝句内逗号切分**，仅标句段间候选并报告无原音精度限制。 |
| `probe-silence-roomtone-and-apply-edits-mechanical` | `mechanical` | 合成含真实底噪+语音+停顿 WAV 与 ASR 夹具：验证 `probe-silence` 准确输出采样级谷底、Clean Room Tone 候选与词首偏移告警；`apply-edits` 确定性拆分 `coverage`、保序分配 `tokenIds`、拦截词内切割、递增 `revision` 并重算哈希。 |
| `seam-fade-zero-drift-and-extract-seams` | `mechanical` | 验证 `export-audio --seam-fade-ms 15` 输出 0 样本漂移并在 receipt 记录 `seamFadeMs`；验证 `extract-seams` 准确导出跨接缝 2.5s 切片清单。 |
| `audio-driven-video-cut-and-nle-export` | `mechanical` | 合成 30fps 音视频夹具（多刀裁剪）：验证 `export-video` 累计绝对时间帧量化无 A/V 累积漂移、未知偏移被阻断；`export-nle` 导出合法 FCPXML/EDL/OTIO 并携带跳剪 Marker。 |
| `animation-handoff-and-head-tail-presentation` | `mechanical` | 验证 `/2` 支持 `before-first` / `after-last` presentation 且兼容 `laohu-motion` 校验；验证 `export-handoff` 准确派生 `narrativeBeats`、`availablePauseWindows`、`visualCueCandidates` 与 `visualSeamRisks`，且不改变 `timeline.json` 哈希。 |

### 10.3 分阶段施工顺序（推荐由 `/laohu-evolution` 分两阶段落地，低风险可回滚）

- **第一阶段（最高杠杆：规则循证重构 + 停顿法度 + 波形/底噪探针 + 声明式编排器 + 微淡化与逐缝工具）**：
  1. 备份 `.agents/skills/laohu-asrcut/` 至 `.cache/restore/laohu-asrcut-pre-opt/`；
  2. 新增 `references/pause-and-pacing.md` 与 `references/captions.md`，重构瘦身 `SKILL.md`，升级 `editing.md`（四阶段闭环）、`timeline-and-handoff.md`、`input-and-asr.md`、`SOURCES.md` 与 `agents/openai.yaml`；
  3. 实施 `scripts/audio-probe.mjs`（`probe-silence` + Room Tone 探测）与 `asrcut.mjs` 的 `apply-edits`、`export-audio --seam-fade-ms`、`extract-seams`、`export-handoff`；
  4. 运行 `python3 tools/check_project.py --test`、`node .agents/skills/laohu-asrcut/evals/test.mjs` 及 `laohu-motion` 跨技能测试。
- **第二阶段（视频闭环与片头/片尾无源时段扩展）**：
  1. 实施 `scripts/video-and-nle.mjs`（`export-video` 与 `export-nle`：FCPXML / EDL / OTIO）；
  2. 实施 `/2 presentation` 片头/片尾定位扩展并同步验证 `laohu-motion` 兼容；
  3. 取真实粗糙中文口播录音 + 真实录屏原片，由未参与设计的独立执行者仅凭最终 Skill 文件跑通“粗糙原片 → 精剪音频/视频 → `animation-handoff.json` 接入 `laohu-motion`”全链路，并由真人试听试看完成最终质量验收。

### 10.4 设计阶段的证据状态

| 证据维度 | 当前状态 | 范围与实据说明 |
|---|---|---|
| **`STRUCTURE`** | **`PASS`（本方案文档与当前仓库静检通过）；技能写回后 `UNKNOWN`** | 本轮仅交付设计方案文档（未修改 `.agents/skills/laohu-asrcut/`）；`python3 tools/check_project.py` 退出码 0。 |
| **`ROUTE`** | **`UNKNOWN`** | 重构后的 4 条快车道与按需 Reference 触发尚未写回并执行独立路由实测。 |
| **`BEHAVIOR`** | **`UNKNOWN`** | 四阶段剪辑闭环、六级停顿法则及 5 项新脚本能力尚未写回，待实施后以离线夹具与无指导独立运行验证。 |
| **`QUALITY`** | **`UNKNOWN`** | 真实粗糙原片经优化后剪出的音频听感（停顿层次、Room Tone 连续性、无爆音）、视频跳剪观感及接入下游动画的实际成片效果，须在实施后由真人真实媒介验收。 |

## 十一、实施与验收

按方案 A 写回[入口](../../../.agents/skills/laohu-asrcut/SKILL.md)、六份专业 Reference、Codex 界面与[公开指引](../../agent-guide.txt)。入口按剪辑、字幕、修音和完整声画交接加载方法。句段字幕的剪辑限制在剪辑路径内判断。原字幕小节锚点仍可找到[唯一字幕契约](../../../.agents/skills/laohu-asrcut/references/captions.md)。原 12 条评测内容保留，增加 4 条行为和 4 条工程用例。

来源核验详见[来源与本地适配记录](../../../.agents/skills/laohu-asrcut/SOURCES.md)。Zellner 讨论的是听辨与研究测量口径。普通话研究支持停顿和边界语音共同参与理解，绝对时长随说话者与材料而变。Transom 的后期示例支持用同源底声接续、选择合适呼吸及短淡化。第 3 节六项时长按老胡的工作基准执行，时长容差、波形探针和淡化长度是结合实际材料复核的本地选项。

### 断点的实际写回与证据

| 断点 | 实际控制点 | 验证到的动作 |
|---|---|---|
| ASRCUT-01 · 加载混杂 | 入口按用途加载，字幕结论归 `captions.md`，连续修音归 `audio-postproduction.md`，编译与回执归 `timeline-and-handoff.md` | 原生独立回合实际读取剪辑与停顿、独立字幕、纯修音、动画交接各自的材料。路径通过，文件字节量用磁盘实测。 |
| ASRCUT-02 · 停顿缺少执行判断 | `pause-and-pacing.md` 的七条规则，含真实语义分级、六项工作值、三档、底声与功能保护、精度要求 | 同材料冷测可保留 0.28 秒和 0.24 秒自然气口，能保护演示提示和笑点，按语义区分分句、句末和换段。仅有用户业务记录时说明切口需对原声。报告的个别遗漏见下节。 |
| ASRCUT-03 · 粗精剪顺序不清 | `editing.md` 四阶段、剪辑承诺、删前承接检查、录屏伴随词及开场取舍 | 冷测维持原序的约 18 秒四个保留段，保住左侧列表指引、表单 ID 依据和下线条件。开场备选与其声画条件在复验中实际给出。原位删除线在实际 HTML 另核。 |
| ASRCUT-04 · 缺波形依据 | `audio-probe.mjs` 与 `input-and-asr.md` | 探针在原生采样率生成低能量区、谷底、可用零交叉及源底声候选，把可靠词锚与能量起落分别记录。同源、同流和版本证据在消费时复核。 |
| ASRCUT-05 · 手工维护剪辑账本 | `edit-operations.mjs`、`asrcut.mjs apply-edits` 及时间线契约 | 合成夹具执行整词、微停、功能保护、权限、原样覆盖、保留实例与旧哈希阻断。在隔离 SRT 中直接执行文档的回滚命令，恢复 480,000 样本到 revision 3，旧删除决定仍可追溯。 |
| ASRCUT-06 · 视频、交换与动画交接 | `video-and-nle.mjs`、`animation-handoff.mjs`、Motion `production-plan.mjs` | 录屏 CLI 导入绑定真实视频流、PTS 时基与有证据的偏移，错时基拒绝，未知偏移保持未知。离线视频夹具导出 270 帧和 432,935 个音频样本。Apple DTD 校验 FCPXML，OTIO 回读独立音轨与视频轨，CMX 回读整数帧率的单视频轨。Motion 读取冻结版本的摘要并实跑绑定。 |
| ASRCUT-07 · 缺接缝样本与可选淡化 | `export-audio --seam-fade-ms`、`extract-seams` 和回执绑定 | 15 ms 淡化与默认导出保持同一 156,000 样本长度。授权原声底噪按实际同源范围等长填入已编译展示段。媒体夹具报告五个实际接缝，切片与版本可复核，已知真声技术对照另验证一条 2.5 秒接缝。 |
| ASRCUT-08 · 无源时段只能居中 | `insert-presentation`、`asrcut.schema.json`、Motion consumer | 首尾 `position` 与旧段间 `afterOccurrenceId` 分别可执行，混填拒绝，保留真实源内容。新摘要独立验证且复核旧时间线哈希。Motion 语音绑定 14 项通过，覆盖原 `/1`、`/2` 和 presentation 边缘。 |

### 任务路径的文档负载

以下为实际文件字节数，不计共同 `runtime.md`、额外核对原文或代码的条件读取。它衡量路由所需文档量，模型实际读文件的情况见冷测记录。

| 普通任务 | 旧文档组合 | 本次文档组合 |
|---|---:|---:|
| 粗糙录音或录屏的剪辑 | 79,804 B | 先作判断 40,149 B，含编译导出与交接 60,814 B |
| 纯口播修音 | 39,289 B | 23,182 B |
| 已有时间线，只编译字幕 | 72,894 B | 16,343 B |
| SRT 句段剪辑并虚拟编译 | 79,804 B | 不涉及气口预判时 51,673 B。需处理句内节奏请求时另读停顿降级规则。 |

### 已有中文口播试剪

使用《五层蛋糕》开场的既有真实口播及带词时间的转写，四项原作品输入哈希复核一致。录音以原项目 Brief 已定开场范围取样，同期画面以本地校准标尺承接，方便逐帧核对剪辑映射。

首轮技术对照版把「机会」到「同样是参与 AI」之间约 630 ms 的整句气口缩短了约 108 ms，结果为 31.922 秒。波形、样本、取帧及逐缝证据准确，剪辑决定违反该档 450–650 ms 干净气口整段保留要求。独立首审记为 `BEHAVIOR: FAIL`。该输出及 2.5 秒剪后窗口保留为技术对照。

修正落在实际 `apply-edits` 的停顿校验。工具按相邻语音间与同源探针相交的完整测量窗，以及当前仍保留的样本数判断。终审复跑原操作，标准档 630.000→522.354 ms 返回 `pause-window-protected` 且未写出计划，换作一般删除也被拦截。标准档的 740→550 ms 和紧凑档的 740→425 ms 可执行。真实合法的独立片尾可取到 1,535,023 样本，并保留同样的 160 个词锚。已核干扰与指定目标用相应证据留档，功能锁优先。

推荐版 revision 3 从同一材料恢复约 0.630 秒原气口，保持已确认的讲述顺序和 160 个识别词锚。开场取到 32.030 秒。WAV、MOV 音轨与源开场的 1,537,440 个样本逐字节一致。校准画面 MOV 为 961 帧、30 fps，视频末点与音频末点相差约 3.333 ms。实际接缝清单为空。动画摘要给出 4 个语义节拍和 1 个经同源探针核实的原声时窗，已接入 Motion 样片。

已归档的 revision 2 仍可用当前编译器按原哈希读取。撤回从同版正好恢复 5,167 个样本并形成 revision 3。两版的原始转写与音轨分别有同源的证据追溯。

验证目录下 `real/review.html` 是推荐版审阅入口。Chromium 在 1280、375 和 320 像素视口核对实际播放、句段定位、反馈下载与版本标识。已恢复的原声范围可按源/目标时间核对。反馈带本版项目、revision 和对应哈希，审阅状态仍为 `not_requested`。首轮对照页与推荐版各自带真实文件和回执，便于区分技术核验与编辑意见。

### 检查范围与恢复

- **STRUCTURE PASS。** 项目静检与离线回归、规则路径和归档来源哈希有检查记录。原 ASRcut 的 346 项断言改前与最终改后均通过，新增编辑、音频、视频、NLE 与交接测试通过。最终日志为 `project-final-test.log`、`asrcut-pause-gate-after.log`。
- **ROUTE PASS，限抽测的四类路径。** 原生运行档案有 29 个已复核的独立回合。模型在普通请求中实际读取相应方法，回合数是档案数量，每条结果见 `audit-behavior.md`。
- **BEHAVIOR 按范围记录。** 机械出口、主要剪辑动作、句段精度边界和准确报告是否编译，均有可复查产物。纸面粗剪的开场与保留选择通过，末轮两份纯文本报告仍遗漏原位删除线，样式为局部 `FAIL`，实际 HTML 的删留标记单独通过。两份回听笔记答复均正确给出六级目标，一份遗漏部分待复核的同期声范围。SRT 两份均保持整句和诚实的编译状态，其中一份把用户偏好写成当前操作，交代范围局部 `FAIL`。完整过程及范围见 `audit-behavior.md` 与 `acceptance.md`。
- **Motion 兼容范围。** 两套跨技能回归改前和改后各有 40 项通过、6 项失败、2 项跳过。六项失败的测试名称逐一相同，见 `motion-before.log`、`motion-after-controlled.log` 与 `motion-comparison.txt`。本轮锚点直接涉及的语音绑定 14 项通过。停顿窗口编排的后续修正由专项验证覆盖。交换件格式回读已执行，具体编辑软件的媒体回链与工程导入仍待实机使用。
- **QUALITY UNKNOWN。** 真实已有口播用于样片和派生产物，听感、录屏实拍剪辑观感和最终接收者评价按真人验收另记。

证据目录为 `.cache/validation/asrcut-layered-20261120/`。实施快照取自实际工作树，`.cache/restore/laohu-asrcut-before-upgrade-20261120-124210/` 保留 ASRcut 整目录、原方案与公开指引共 21 项。最终文档复核前另保存在 `.cache/restore/laohu-asrcut-before-acceptance-docs-20261120-131951/`，共 15 项。两处均有 `SHA256SUMS`。
