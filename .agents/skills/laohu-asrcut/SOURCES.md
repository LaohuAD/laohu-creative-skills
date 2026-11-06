# 来源与本地适配记录

这里记录规则建设时核对过的原始来源。运行时规则与操作方法写在本地 References；执行者无需打开这些链接才能完成已定义的工作。

| 来源 | 核对范围 | 本地采用的做法 | 边界 |
|---|---|---|---|
| Hypit, narrative-temporal、Script 与 timing 文档；核对固定提交 e26d9142fd8a6f78bf4f3cdb800d6205f4ecca16。https://github.com/hypit-ai/hypit | 具名片段、词边界、局部时间、跨时间线投影与身份校验 | 在本地 JSON 契约中分离原始表达、语义段、时间范围和逐词实例；绑定必须含来源身份与 occurrence，不按重复文字猜定位。 | 本地实现自有 schema/编译器，不复制其代码、依赖或界面；其插值不作为实测精度。仓库 license 状态未验证，不搬运代码或资产。 |
| FFmpeg 官方 Filters 文档，atrim/concat。https://ffmpeg.org/ffmpeg-filters.html#atrim | trim/atrim 的时间戳与拼接注意点 | `asrcut.mjs export-audio` 仅依照已编译的整数源/目标样本区间，以 FFmpeg atrim/resample/concat 输出 PCM WAV；目标采样数、输入哈希、轨道采样率均复核。 | 无变速、淡化、混音、视频处理或工程应用。合成 WAV 只验证机械样本映射，不是人工试听或内容质量证据。 |
| Volcengine Doubao Voice Recording-file recognition Flash API 文档。https://docs.volcengine.com/docs/doubao-voice/large-model-recording-file-lite-recognition-api?lang=zh | 新版 API Key/旧版 App Key + Access Key、flash endpoint、resource id、base64 输入、utterance 时间，以及 100MB/2h/格式限制 | 可选 provider 只在明确执行 transcribe 或其 API 被直接调用时联网；上传前以 ffprobe 校验时长并执行大小、格式限制；关闭 ITN 与 DDC 平滑；原始响应先写到新 evidence 路径，再导入。 | 本轮只以 mock HTTP 和模拟时长验证字段/输入拒绝；未读取用户凭据、未上传媒体、未调用付费服务；服务额度、输入授权和费用每次调用前仍需确认覆盖。 |
| Volcengine Doubao Voice Recording-file recognition Standard API 文档。https://docs.volcengine.com/docs/doubao-voice/large-model-recording-file-recognition-standard-version-api?lang=zh | 标准 URL 模式所需控制的媒体可达性与提交/查询边界 | 保留为后续 provider 扩展证据；用户未明确采用 URL 识别时不上传。 | 当前 adapter 不实现 TOS、签名 URL 或异步标准识别。 |
| WhisperX 官方仓库与论文说明。https://github.com/m-bain/whisperX | ASR 与强制对齐的差异、对齐失败边界、重叠语音局限 | 词时间缺失时可以作为可选外部对齐路线，但结果 precision 标 aligned，需保留工具与证据边界。 | 本轮不安装、不调用，也不以其存在推定本地模型可用。 |

Cap transcript 的字段兼容依据来自同一项目的现有记录 schema：laohu.cap-asr-transcript/1 明示 raw-recording-display-timeline，词/句同时含 source-local 与 global 时间。本地 importer 按 source-local 记录主音轨范围、按 global 保留原序证据；B 项目桥接层负责把实际媒体和录制片段对应起来。
