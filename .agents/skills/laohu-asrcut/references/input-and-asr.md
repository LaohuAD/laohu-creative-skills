# 输入、原始语音与识别证据

由 laohu-asrcut 在盘点录音、录屏、ASR 或 SRT 输入时读取。它确定源时钟、原始识别和词级证据能支持的精度；读完回到主 Skill 的粗剪步骤继续处理。

## 识别输入能够证明什么

优先使用用户已提供且与本次媒体对应的 ASR JSON 或 SRT；先校验来源、时钟、范围与媒体身份。用户只给录音/录屏并要求剪辑时，剪辑目标通常需要可定位的转写。检查本地 provider 是否已配置、既有授权/费用边界是否覆盖及输入限制；若均已明确，直接执行识别而无需用户说“识别”或“重识别”。如果只缺上传授权或费用边界，暂停上传这一步，先完成可独立的盘点与虚拟草案准备，再明确指出缺口。不能仅因文件存在就自动上传。

转写结果在三种层次之间不得混写：原始 ASR 是识别服务产物；确认听到的口语是经过真实音频核对的内容；屏幕显示文字是另行设计的可读文本。原始文本不得被修正或清理覆盖。编辑确认的转写保留原词、修订词、核听方式和范围；无法实际听音时不能把修订后的识别字词称为“实际说出的话”。显示文案始终是独立可选层，不能改写保留音频或冒充口语。

SRT 的时间戳通常只精确到字幕句段。导入时以 SRT 所列时间做句段级范围，标记 timingPrecision=utterance；保存原始字幕行、原始时间戳文本、输入文件 SHA-256 和 evidenceRef；不要拆字、按字符数量分词或伪造词时间。ASR JSON 有明确的逐词边界时逐词保存原文、唯一 token id、规范化边界以及原始时钟值、单位、字段名、时基和来源 ref；若服务只给句段边界，句段之外不推算词边界。Cap word 的 globalStartMs/globalEndMs 与 sourceStartMs/sourceEndMs 分开留在 globalRangeMs/evidenceClock 中，不能只保留句级 global time。外部对齐器产生的时间要标记 aligned，并保留对齐工具来源；人工按波形估出的边界标记 estimated；识别服务原生逐词时码标记 measured。插值只是 estimate，不是测量。

文件导入的 transcript.sha256 对应文件原始字节（raw-bytes），evidenceRef 是可定位该字节证据的路径；校验时必须按保存该 edit-plan 的目录解析相对路径并重新读取。直接传 JSON 对象的 API 调用若没有原始文件路径，只能明确标为 json-serialization 且不提供 evidenceRef；若既有原始文件必须同时传入其原始字节哈希。过期、找不到或模式不符的证据在验证、冻结、编译消费与媒体导出时都要拒绝，不能只因 planSha256 匹配就信任旧 ASR 内容。

ASR 文字修正使用 plan.spokenCorrections，不回写 transcript.segments[].rawText/tokens[].rawText，也不改写 displayText。记录原 ASR 原文、修正候选、词/句定位、候选或确认状态及核听/对齐状态和证据范围。没有实际核听的修正只能标候选；确认须有已链接且哈希记录的原音，声明 audio-listening、listened，并让证据 sourceRange 精确对应目标词/句。确定性编译会保留原 `text`，只在该声明已确认的片段上附加 `spokenText`；候选可供审阅但不会变成口播事实。此状态来自编辑者提供的记录，结构校验不能替代真人听音。

## 时间坐标与多轨来源

每个媒体 source 有自己的主音轨时钟、采样率与可核验的时长。ASR 片段的毫秒或秒值只在明确的时钟基准下转换为整数采样；保留导入原值以便追溯。不同来源、不同录制片段的本地时间不得直接比较。真实同步关系缺失时，用 unresolved question 表示；不能用 0、文件顺序或字幕行号补齐。

所有项目输出时间用 edit-plan.clock.sampleRateHz 的项目采样率表达。源区间自身携带 sampleRateHz；将源区间映射到目标时，编译器转换到统一项目时钟，并在 timeline 中记录量化信息。项目输出时钟与源时钟相同也要明确记录，不能依赖默认值。

时间线中的非主音轨偏移写为 track.syncToPrimaryAudio.offsetSeconds。方向固定为：primaryAudioTime = trackLocalTime + offsetSeconds；反算主音轨范围到该轨时用 trackLocalTime = primaryAudioTime - offsetSeconds。主音轨标记 status=primary。若偏移来自估计而非已校准元数据，精度标为 estimated；偏移未知则写 status=unknown，并阻止依赖跨轨同步的导出。画面和系统声的轨道身份不能因为它们与麦克风一同录制就假设已同步。

## 支持的输入形状

公共导入 API 接受普通 ASR JSON 的 segments/utterances 列表，识别 start/end 秒字段、start_ms/end_ms 毫秒字段及明确的 words 逐词数组；也接受火山大模型原始结果的 result[].utterances，保留其原始 JSON 哈希与原文，不改变语气词和重复。无法识别字段映射时拒绝猜单位，要求调用方显式指定 timeUnit 或先归一化。

Cap 导出若为 schema=laohu.cap-asr-transcript/1，且 timeBasis=raw-recording-display-timeline，导入器以每个 utterance/word 的 sourceStartMs/sourceEndMs 作为录制段本地音轨时钟；globalStartMs/globalEndMs 只用于保留原项目时间证据和确定原序。不得将 global 时间作为本地音轨 sourceRange，也不能因为两者数值接近就混用。recordingSegment 是来源身份的一部分；多段导入用 `recordingSegment` 单独选择一个录制段、提供其真实 source id/mediaPath/duration/采样率，再由 `mergePlans` 合并各独立导入结果并传入明确的 `sourceOrder`。缺本地与 global 其中一组明确字段时，拒绝映射并报告准确缺项。

provider 实施只保留调用适配，不承诺识别质量。极速识别调用前先用本机 ffprobe 获取媒体时长：缺失、非有限或非正时长均在联网前拒绝；超过 7200 秒（2 小时）也拒绝，避免依赖服务端报错。上传同时受 100 MiB 与 WAV/MP3/OGG/OPUS 格式限制；时长、大小和格式核验只证明符合本地入口约束，不代表已获授权或满足服务账户开通条件。该限制依据[火山引擎录音文件识别极速版官方文档](https://docs.volcengine.com/docs/doubao-voice/large-model-recording-file-lite-recognition-api?lang=zh)。

原始响应保存在调用者指定的新路径中，运行摘要不包含凭据。provider 由 CLI 的显式 transcribe 命令或直接 API 调用执行；import/compile 从不触网。Mock fetch 只证明请求字段、时长拒绝、失败分支与凭据不泄漏，不证明真实 ASR 内容或识别质量。
