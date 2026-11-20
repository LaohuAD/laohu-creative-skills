# 输入、原始语音与识别证据

盘点录音、录屏、ASR 或 SRT 时读取。本节确认来源、时钟、原始识别和输入能支持的精度，结果供[剪辑第一阶段](editing.md#1-盘点真实素材与录制尝试)使用。纯修音直接走[口播声音处理](audio-postproduction.md)。

## 识别输入能够证明什么

优先使用用户已提供且与本次媒体对应的 ASR JSON 或 SRT；先校验来源、时钟、范围与媒体身份。用户只给录音/录屏并要求剪辑时，剪辑目标通常需要可定位的转写。检查本地 provider 是否已配置、既有授权/费用边界是否覆盖及输入限制；若均已明确，直接执行识别而无需用户说“识别”或“重识别”。如果只缺上传授权或费用边界，暂停上传这一步，先完成可独立的盘点与虚拟草案准备，再明确指出缺口。不能仅因文件存在就自动上传。

转写结果在三种层次之间不得混写：原始 ASR 是识别服务产物；确认听到的口语是经过真实音频核对的内容；屏幕显示文字是另行设计的可读文本。原始文本不得被修正或清理覆盖。编辑确认的转写保留原词、修订词、核听方式和范围；无法实际听音时不能把修订后的识别字词称为“实际说出的话”。显示文案始终是独立可选层，不能改写保留音频或冒充口语。

SRT 的时间戳通常只精确到字幕句段。导入时以 SRT 所列时间做句段级范围，标记 timingPrecision=utterance；保存原始字幕行、原始时间戳文本、输入文件 SHA-256 和 evidenceRef；不要拆字、按字符数量分词或伪造词时间。ASR JSON 有明确的逐词边界时逐词保存原文、唯一 token id、规范化边界以及原始时钟值、单位、字段名、时基和来源 ref；若服务只给句段边界，句段之外不推算词边界。Cap word 的 globalStartMs/globalEndMs 与 sourceStartMs/sourceEndMs 分开留在 globalRangeMs/evidenceClock 中，不能只保留句级 global time。外部对齐器产生的时间要标记 aligned，并保留对齐工具来源；人工按波形估出的边界标记 estimated；识别服务原生逐词时码标记 measured。插值只是 estimate，不是测量。

文件导入的 transcript.sha256 对应文件原始字节（raw-bytes），evidenceRef 是可定位该字节证据的路径；校验时必须按保存该 edit-plan 的目录解析相对路径并重新读取。直接传 JSON 对象的 API 调用若没有原始文件路径，只能明确标为 json-serialization 且不提供 evidenceRef；若既有原始文件必须同时传入其原始字节哈希。过期、找不到或模式不符的证据在验证、冻结、编译消费与媒体导出时都要拒绝，不能只因 planSha256 匹配就信任旧 ASR 内容。

ASR 文字修正使用 plan.spokenCorrections，不回写 transcript.segments[].rawText/tokens[].rawText，也不改写 displayText。记录原 ASR 原文、修正候选、词/句定位、候选或确认状态及核听/对齐状态和证据范围。没有实际核听的修正只能标候选；确认须有已链接且哈希记录的原音，声明 audio-listening、listened，并让证据 sourceRange 精确对应目标词/句。确定性编译会保留原 `text`，只在该声明已确认的片段上附加 `spokenText`；候选可供审阅但不会变成口播事实。此状态来自编辑者提供的记录，结构校验不能替代真人听音。

## 时间坐标与多轨来源

每个媒体 source 有自己的主音轨时钟、采样率与可核验的时长。ASR 片段的毫秒或秒值只在明确的时钟基准下转换为整数采样；保留导入原值以便追溯。不同来源、不同录制片段的本地时间不得直接比较。真实同步关系缺失时，用 unresolved question 表示；不能用 0、文件顺序或字幕行号补齐。

所有项目输出时间用 edit-plan.clock.sampleRateHz 的项目采样率表达。源区间自身携带 sampleRateHz；将源区间映射到目标时，编译器转换到统一项目时钟，并在 timeline 中记录量化信息。项目输出时钟与源时钟相同也要明确记录，不能依赖默认值。

非主音轨偏移写为 `track.syncToPrimaryAudio.offsetSeconds`。按 `primaryAudioTime = trackLocalTime + offsetSeconds` 计算。反算轨道本地时间用 `trackLocalTime = primaryAudioTime - offsetSeconds`。主音轨标记 `status=primary`，估计偏移标 `estimated`，未知偏移标 `status=unknown` 并阻止依赖它的导出。同文件中的画面、系统声和麦克风也需核实轨道身份与偏移。

## 支持的输入形状

公共导入 API 接受普通 ASR JSON 的 segments/utterances 列表，识别 start/end 秒字段、start_ms/end_ms 毫秒字段及明确的 words 逐词数组；也接受火山大模型原始结果的 result[].utterances，保留其原始 JSON 哈希与原文，不改变语气词和重复。无法识别字段映射时拒绝猜单位，要求调用方显式指定 timeUnit 或先归一化。

Cap 导出若为 schema=laohu.cap-asr-transcript/1，且 timeBasis=raw-recording-display-timeline，导入器以每个 utterance/word 的 sourceStartMs/sourceEndMs 作为录制段本地音轨时钟；globalStartMs/globalEndMs 只用于保留原项目时间证据和确定原序。不得将 global 时间作为本地音轨 sourceRange，也不能因为两者数值接近就混用。recordingSegment 是来源身份的一部分；多段导入用 `recordingSegment` 单独选择一个录制段、提供其真实 source id/mediaPath/duration/采样率，再由 `mergePlans` 合并各独立导入结果并传入明确的 `sourceOrder`。缺本地与 global 其中一组明确字段时，拒绝映射并报告准确缺项。

已配置、获准的极速识别先用本机 ffprobe 获取有效正时长，最长 7200 秒（2 小时）。输入还须为不超过 100 MiB 的 WAV、MP3、OGG 或 OPUS。限制在联网前校验。凭据优先读用户级配置，环境变量覆盖，运行摘要不得回显。请求保留原话，关闭 ITN 和 DDC 语义平滑，原始响应使用指定的新路径。识别后才走离线 `import`，后续 `compile` 也在本地执行。[来源及限制](../SOURCES.md)

CLI 用 `transcribe --file source.wav --out raw-asr.json`。API 为 `loadVolcConfig(options)`、`probeAudioDuration(audioPath,options)`、`transcribeVolcFlash({audioPath,config,fetchImpl,ffprobePath,probeDurationImpl})`。录屏需识别时，先确认上传范围并从已确认音轨提取新的本地音频。Mock HTTP 只覆盖参数、时长拒绝和失败分支，原话准确性仍需按真实录音判断。

### 导入时保留实际输入证据

从仓库根目录调用 `scripts/asrcut.mjs`。按已确认来源传 `import --input raw-asr.json --project-id project-1 --source-id source-1 --out edit-plan.json`。实际媒体已核实时可补 `--source`、`--source-sample-rate`、`--source-duration-samples` 与多流时的 `--audio-stream-index`。项目输出采样率数值由 `--project-sample-rate` 表达，必要时显式给原始字段 `--time-unit`。SRT 使用同一命令。各源或 Cap 段逐一导入后，用 `merge --project-id project-1 --plans mic-a.json,mic-b.json --source-order mic-a,mic-b --out edit-plan.json` 合并；录制段用 `--recording-segment` 选定。

录屏导入用可重复的 `--video-track '流索引,PTS时基,偏移秒数分数,精度'`。用 ffprobe 确定全局流索引和 `time_base`。偏移以双方可对齐的同步事件或已校准时钟为依据，从主音轨上的事件时间减去该画面轨本地事件时间。画面本地时间从选定轨道第一帧量起。匹配容器流与时基由导入器验证，实际偏移的成立依据由编辑者核对。`measured` 或 `estimated` 按证据强度填写。偏移缺证据时填 `--video-track '0,1/15360,unknown'`，先做虚拟剪辑或主音频路线。

例如素材已经核实画面流为 0、时基 `1/15360`、偏移 `-1/25` 秒，音频流为 1，原媒体主音轨确有 5,760,000 个样本，且本轮已授权导出，可在仓库根目录执行以下命令。将文件名、索引、时基、偏移与样本数换成实际证据。

```bash
ffprobe -v error -show_streams -of json recording.mov
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs import \
  --input raw-asr.json --project-id project-1 --source-id source-1 \
  --source recording.mov --audio-stream-index 1 --source-duration-samples 5760000 \
  --video-track '0,1/15360,-1/25,measured' --authorize-media-export --out edit-plan.json
```

导出、重排和重复分别对应独立开关 `--authorize-media-export`、`--authorize-reorder`、`--authorize-repeat`，只在已经获准的范围附上对应开关。当前未知主音轨样本数时，可用下一节的探针先独立测 `source.sampleCount`。多源分别确认权限；合并计划对同一项权限检查全体来源。

## 用波形缩小候选范围

源媒体已核实时运行 `probe-silence --input source.wav --plan edit-plan.json --out silence-map.json`。没有 plan 时可省略它，得到只绑定媒体的候选图。多音轨时用 `--audio-stream-index` 指定 ffprobe 全局音频流索引，同一媒体在 plan 中有多个来源时用 `--source-id`。默认探测参数是 `--noise-db -38` 和 `--min-silence-ms 120`，按录制电平与噪声底调整并保留实际参数。

`silence-map.json` 记录源文件 SHA、轨道、样本率、样本数、项目和探针身份。每个 `silences[]` 带样本范围、时长、`valleySample`、可用的 `nearestZeroCrossingSample`、`minRmsDb` 和 `meanRmsDb`。数字零的负无穷分贝用 JSON `null` 表示。 `gapClassification` 只按时长提示，`onsetDriftWarning` 提示值得回听的可信词锚与持续能量变化。

`roomToneCandidates[]` 是稳定源底声候选，回听后才确认有无轻语、呼吸、提示音或串轨。探针不写源、不修改词边界，也不授权删除。回到[精剪](pause-and-pacing.md#2-用原声底噪与安全谷底接两侧)核对实际功能和剪口。
