# 来源与本地适配记录

这里记录规则建设时核对过的原始来源。运行时规则与操作方法写在本地 References；执行者无需打开这些链接才能完成已定义的工作。

| 来源 | 核对范围 | 本地采用的做法 | 边界 |
|---|---|---|---|
| Hypit, narrative-temporal、Script 与 timing 文档；核对固定提交 e26d9142fd8a6f78bf4f3cdb800d6205f4ecca16。https://github.com/hypit-ai/hypit | 具名片段、词边界、局部时间、跨时间线投影与身份校验 | 在本地 JSON 契约中分离原始表达、语义段、时间范围和逐词实例；绑定必须含来源身份与 occurrence，不按重复文字猜定位。 | 本地实现自有 schema/编译器，不复制其代码、依赖或界面；其插值不作为实测精度。仓库 license 状态未验证，不搬运代码或资产。 |
| FFmpeg 官方 Filters 文档。[atrim](https://ffmpeg.org/ffmpeg-filters.html#atrim)、[afade](https://ffmpeg.org/ffmpeg-filters.html#afade) | 裁切、重采样与拼接的时间坐标，样本级淡化的幅度变化 | 用已编译的整数范围输出 PCM WAV，可选的接缝淡化保留样本数。 | 本地采用已核接口。合成 WAV 验证机械映射，实际听感与实际视频另核。 |
| Volcengine Doubao Voice Recording-file recognition Flash API 文档。https://docs.volcengine.com/docs/doubao-voice/large-model-recording-file-lite-recognition-api?lang=zh | 新版 API Key/旧版 App Key + Access Key、flash endpoint、resource id、base64 输入、utterance 时间，以及 100MB/2h/格式限制 | 可选 provider 只在明确执行 transcribe 或其 API 被直接调用时联网；上传前以 ffprobe 校验时长并执行大小、格式限制；关闭 ITN 与 DDC 平滑；原始响应先写到新 evidence 路径，再导入。 | 本轮只以 mock HTTP 和模拟时长验证字段/输入拒绝；未读取用户凭据、未上传媒体、未调用付费服务；服务额度、输入授权和费用每次调用前仍需确认覆盖。 |
| Volcengine Doubao Voice Recording-file recognition Standard API 文档。https://docs.volcengine.com/docs/doubao-voice/large-model-recording-file-recognition-standard-version-api?lang=zh | 标准 URL 模式所需控制的媒体可达性与提交/查询边界 | 保留为后续 provider 扩展证据；用户未明确采用 URL 识别时不上传。 | 当前 adapter 不实现 TOS、签名 URL 或异步标准识别。 |
| WhisperX 官方仓库与论文说明。https://github.com/m-bain/whisperX | ASR 与强制对齐的差异、对齐失败边界、重叠语音局限 | 词时间缺失时可以作为可选外部对齐路线，但结果 precision 标 aligned，需保留工具与证据边界。 | 本轮不安装、不调用，也不以其存在推定本地模型可用。 |
| FFmpeg 官方 Filters 文档（`afftdn`、`highpass`、`equalizer`、`deesser`、`acompressor`、`volume`、`loudnorm`）。https://ffmpeg.org/ffmpeg-filters.html | 第一阶段可调用的过滤器参数、噪声抑制/均衡/动态处理与 LUFS/true-peak 测量能力 | 将稳定噪声抑制、过滤、均衡、去齿音、压缩、静态增益及带后测量的响度处理做成有白名单和边界检查的 FFmpeg 步骤；浮点中间过程，量化前后测量，固定延迟必须实测。 | 文档证明滤镜接口和参数，不证明对任一人声有效或“好听”；本地执行器不接入语音隔离/去混响神经模型，不接受任意 filtergraph/命令。 |
| iZotope, “How to Edit Podcasts”. https://www.izotope.com/community/blog/how-to-edit-podcasts | 口播编辑的听众可懂度与处理类别：先平衡片段电平，再按素材需要修复噪声、共振、齿音、EQ 和动态 | 将修复、音色塑形、动态与片段/整片响度分开；每项按听审问题决定，并用同响度旁路复核，不做普适固定插件链。 | 厂商教程是方法参考，不构成独立科学证明、固定滤镜次序或适用于所有录音的预设。 |
| Auphonic, “Audio Post Production Algorithms (Singletrack)”. https://us.auphonic.com/help/algorithms/singletrack.html | 单轨后期中片段电平/整体响度、噪声/混响、过滤和增强各自处理的说明 | 将句段电平平衡与整条响度标准化分开；把背景噪声、混响和说话内容当作不同诊断，不以普通降噪冒充语音隔离。 | Auphonic 是在线产品文档，其算法未接入本地执行器；只采用问题分拆思路，不复刻其系统或声称同等效果。 |
| ITU-T Recommendation P.835 记录（旧版 2003 条目标记为 superseded；2026 work programme 的 P.835 项目说明）。https://www.itu.int/itu-t/recommendations/rec.aspx?id=7041&lang=en ; https://www.itu.int/itu-t/workprog/wp_item.aspx?isn=20844 | 降噪主观评价分别考察 speech signal (SIG)、background noise (BAK) 与 overall quality (OVRL) | 审听时分别检查人声完整/自然度、残余噪声和整体效果，避免单一响度或“更安静”替代人声质量判断。 | 本技能没有实现 ITU 正式听测、量表或实验室验证；不声称 P.835 合规或质量评分。旧版推荐状态以 ITU 页面实时状态为准。 |
| 后续专项候选的官方项目页：Xiph [RNNoise](https://github.com/xiph/rnnoise)；[DeepFilterNet](https://github.com/Rikorose/DeepFilterNet)；FGNT [NARA-WPE](https://github.com/fgnt/nara_wpe)；Haohe Liu [VoiceFixer](https://github.com/haoheliu/voicefixer)。 | 分别核实语音降噪、语音增强、WPE 去混响与通用 speech restoration 项目实际宣称的任务范围 | 可作为以后按真实问题选取、单独评估的后端研究候选；只记能力类别，不把模型能力推广到所有录音。 | 本轮未安装、未运行、未连接这些项目或其权重/接口；不能作为当前可调用能力，不假定许可证、硬件、延迟或对用户录音的效果已验证。 |

Cap transcript 的字段兼容依据来自同一项目的现有记录 schema：laohu.cap-asr-transcript/1 明示 raw-recording-display-timeline，词/句同时含 source-local 与 global 时间。本地 importer 按 source-local 记录主音轨范围、按 global 保留原序证据；B 项目桥接层负责把实际媒体和录制片段对应起来。

## 粗剪、语义停顿与声画交接

在这里追溯采用的办法。试做时直接按本地 [粗精剪](references/editing.md) 与 [停顿](references/pause-and-pacing.md) 执行。来源材料中的时长、比例和工具操作按各自语境理解。

| 方案来源 | 读到的处理与本地采用范围 |
|---|---|
| L1 · DB Skill《口播逻辑延续检查》《开头优化》。核对本地快照的 `dbs-script-flow/SKILL.md` 和 `dbs-hook/SKILL.md`。 | 使用逻辑、密度、口语三项扫读，删前检查观众能否推回缺掉的关系，并保留白板/录屏伴随词。暂存版中仍能看到被删原句和回退。开场只用真实 source 的话题、理由与可信证据。本轮概括方法，没有迁入原文或运行依赖。 |
| L2 · Nhan Tran、Hijung Valentina Shin、Abe Davis、Mackenzie Leake，《Micro-Edits》，UIST 2026，[归档原文](../laohu-analysis/assets/editorial-sources/micro-edits.txt)。 | 6 位剪辑师在约一分钟的两段双人场景里实际操作。部分先调纯听节奏，再改反应镜、剪入镜或 J/L cut 的视点。这支持先稳住音频节奏再复核画面。对独白、教程与动画的流程是本地适配，样本不足以量化这一因素对所有作品质量的贡献。 |
| L3 · Muhammad Abdullah，《I Hate Editing》固定提交 `a5add74b595f652e0da9577bbf8f6fc4b1d57457`，[Cutting](assets/editorial-sources/cutting.txt)、[配套条款](assets/editorial-sources/cutting-companion.txt)。 | 采用完整 take、比较源静音、实听后用合法语义边界、重剪报告、逐缝核验。配套第 18 条来自工具现场报告。本地把起音偏差作为需核的风险，采用自有停顿档、可选微淡化和授权要求。 [原许可](assets/editorial-sources/cutting-LICENSE.txt) · [video-use 许可](assets/editorial-sources/video-use-LICENSE.txt) |
| L4 · calesthio，《Editing & Montage》，固定提交 `8c85352d5d75d4dcbe58480bd138e37b9742bab1`，[结构](../laohu-analysis/assets/editorial-sources/montage-structure.txt)、[节奏](../laohu-analysis/assets/editorial-sources/montage-rhythm-and-transitions.txt)。 | 采用一条剪辑承诺、按观众任务确定主线、检查断点及四遍看片。步骤随实际片型与交付调整。 [本地归档与 MIT 许可记录](../laohu-analysis/assets/editorial-sources/SOURCES.json) |
| L5 · Australian Centre for the Moving Image，《Film It: Editing》，[本地教学原文](../laohu-analysis/assets/editorial-sources/acmi-editing.html)。 | 教学示例先从素材块组织粗剪，再微调停顿、排查接缝中的 click/blip。留下技术做法及参考范围。 [许可与原文位置](../laohu-analysis/assets/editorial-sources/SOURCES.json) |
| L6 · Cynthia Fuchs 访问 Kevin Macdonald，《Gripped by the Story》，[归档采访](../laohu-analysis/assets/editorial-sources/parallel-perspectives.txt)；Manim-Voiceover 作者的[书签例子](../laohu-motion/assets/editorial-sources/bookmark-example.py.txt)。 | 导演访谈讨论放弃另一条叙事及剪接排列对观众判断的影响，属个案。书签使用 `wait_until_bookmark`、`time_until_bookmark` 和剩余阅读时间。本地借用单词/区间触发的关系，实测或显式定精度的词锚另校验。采访采用已登记的 CC BY 4.0 文本范围。 |
| E1 · Brigitte Zellner (1994)，《Pauses and the temporal structure of speech》，第 44–48 页。[作者章节](https://web-archive.southampton.ac.uk/cogprints.org/884/3/Zellner.SpeechPauses.pdf) | 听感的停顿可与物理空隙有别，时长和语篇任务有关。章节转述 Goldman-Eisler 与 Grosjean、Deschamps 约 200–250 ms 的听辨口径，属于所述研究语境。用它理解停顿功能，剪辑阈值取自本项目。 |
| E2 · Chunsheng Yang (2008) [普通话语篇边界研究](https://bpb-us-w2.wpmucdn.com/u.osu.edu/dist/2/123895/files/2024/05/10_yang-c-46c4b44c973084be.pdf) 与 Kuang 等 (2022) [普通话及英语边界知觉研究](https://www.isca-archive.org/speechprosody_2022/kuang22_speechprosody.pdf)。 | 复述语料中，边界前时长和静音可帮助原语者分句，静音长度还可能区分部分话语层级。知觉实验显示停顿会调节其他线索，语言之间也有差异。支持保护实际尾音和层级气口；可用情况跟原素材核实。 |
| E3 · Walter Murch，《In the Blink of an Eye》2nd ed. (2001)，[The Rule of Six 原文摘录](https://bpb-us-w2.wpmucdn.com/portfolio.newschool.edu/dist/2/14941/files/2017/06/Murch-Walter-in-the-blink-of-an-eye-RULEofSIX-1tly3uz.pdf)。 | 使用情绪、故事、节奏、视线、平面与空间连续的取舍次序。百分比是 Murch 的表达方式。纸面粗剪以已核实素材保护事实、授权、限制和证据。 |
| E4 · Steve Rubin 等 (UIST 2013)，[音频故事编辑原型](https://ssrubin.com/posts/speecheditor-an-audio-story-editing-tool.html)，[作者论文第 4 章](https://escholarship.org/uc/item/4p69s1cm.pdf)。Floraine Berthouzoz 等 (SIGGRAPH 2012)，[访谈视频切口论文](https://citeseerx.ist.psu.edu/document?doi=760007cd0443d9211b8deb31b587e5976d1aa359&repid=rep1&type=pdf)。Anh Truong 等 (UIST 2016)，[QuickCut](https://graphics.stanford.edu/projects/quickcut/)。 | 采用文本绑定样本、原声底噪补空、声画联合看剪点、旁白事件约束视觉剪辑等设计思路。原工具采用各自的数据和算法。本地实现沿现有整数采样时钟、声明式覆盖与帧量化，效果依素材和监听核实。 |
| E5 · Jeff Towne，Transom [Audition 指南](https://transom.org/2020/adobe-audition/)、[微淡化处理](https://transom.org/2003/stupid-fade-tricks-2/)。Rob Rosenthal，[呼吸剪辑示例](https://transom.org/2026/revisiting-remember-to-breathe/)。NPR Training，[混音检查表](https://npr.brightspotcdn.com/dd/e4/4c73d7c74227a94967e00362b73a/npr-training-audio-mixing-checklist.pdf)。 | 同室底声与淡入淡出可衔接录音，保留合适呼吸有助于保持原来的语流。NPR 检查表提醒检查转场与电平。各示例的断点、淡化型式与语境不同，试用 10–15 ms 和不超过 30 ms 是本地实现选择。 |

`standard-narration` 六项时长由用户工作基准确定。`compact`、`natural`、容差、谷底分配、逐缝 2.5 s 窗以及动画窗 0.45 s 下限是本地取舍。语音研究只为判断方向提供依据。这些数值应与实际原意、同期事件、口吻、音质和时间连续性一起复核。

## 音视频交换格式

- FCPXML 1.10 以 Apple 的对应 DTD 校验标签与允许的对象。轨道绑定、媒体回链、软件导入与视觉效果各自需要执行证据。 [Apple 文档类型定义](https://developer.apple.com/documentation/professional-video-applications/document-type-definition)
- OTIO 从 `RationalTime` 的值与率表示样本或帧， `TimeRange` 表示开始与持续长度。CMX 3600 读回用 OpenTimelineIO 的核心适配器按实际工程帧率核对事件和可用标记。本地导出的 CMX 交换件只承载此实现支持的单视频轨。 [OTIO 序列化定义](https://github.com/AcademySoftwareFoundation/OpenTimelineIO/blob/main/docs/tutorials/otio-serialized-schema.md) · [CMX 3600 适配器](https://github.com/OpenTimelineIO/otio-cmx3600-adapter)
