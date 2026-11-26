# 屏显字幕设计与编译

已有经校验的 `edit-plan` 与 `timeline`，且本轮要求字幕清单或 SRT 时读取。无口播时不触发 ASR 或字幕编译。新 Showreel 动画的字幕分组、显示文字、翻译、标点与锚点仍由 `Analysis` 在唯一 `brief.md` 决定，再交本入口确定性编译。

## 1. 语义分组与双语默认

按口语意思、真实气口和画面阅读负荷切分，不把 ASR 换行或自动标点机械照搬成字幕块：长并列按语义分屏，保住转折、条件、否定、数字单位与专名；短承接语读得完就并入相邻分句；连续画面动作可以跨越多条字幕，字幕切分不等于切镜点。

- **中文双语默认（`caption-design/2`）**：新建中文讲解且用户未指定单语或例外时，填实际 `sourceLanguage`（如 `zh-Hans`），默认 `displayLanguages: [sourceLanguage, "en"]`。中文放 `lines`，短英文放 `translations`，每屏源文与译文各一行共用同一显示时窗；英文保留原意、否定、条件与专名，按英语阅读习惯压短。机译标 `origin: "machine-assisted"`、`status: "draft"`，经语言与阅读复核再升 `reviewed`。
- **兼容与用户锁定**：用户指定单语、语种或锁定原文时遵从要求；既有 `caption-design/1` 与 `caption-manifest/1` 保持原哈希与格式。字幕层独立产出，绝不修改 `edit-plan` 的 `rawText`、`displayText`、音频切口或 `planSha256`。

## 2. 屏显标点与可读性

- **`zh-caption/2`（新中文双语默认）**：屏显中文省略全角逗号、句号与屏末顿号（省略全角逗号、句号、分号、冒号、弯引号或屏末顿号时在 cue 记 `punctuationDecision`），保留短并列内部顿号、问号、叹号以及小数点、网址等半角字符。短气口两条字幕直接接续，长气口按表达与画面决定是否留白。
- **`verbatim/1` 与既有 `zh-caption/1`**：用户锁定原标点字句用 `verbatim/1`；既有工程沿用原选 profile。
- **真实可读性验收**：用实际字体、字号和播放宽度测单行不溢出，并按正常播速合画观看确认来得及读完。新 Showreel 用[原生字幕 helper](../../laohu-motion/templates/runtime/native-presentation/README.md)实测字体并保单语单行。

## 3. 真实锚点、完整覆盖与显示时窗

- **唯一实例定位**：每条 cue 绑定唯一 `occurrenceId` + 源序连续 `tokenIds[]`，或单个真实 `segmentId`（二选一）。重复句按各自 `occurrenceId` 区分；仅有句段时间时保持 `utterance` 整句显示，绝不伪造词锚。剪辑改版后重编过期锚点。
- **完整覆盖**：正式完整字幕用 `coveragePolicy: "all-retained-speech/1"`，`exclusions` 省略或置空，按剪后顺序无遗漏覆盖全部保留口播。
- **时窗边界**：`displayWindow.range` 为同一 `timeline` 时钟上的整数半开区间，须精确等于锚定 `speechSpan` 前扩 `leadSamples`（≤ 500 ms）加后扩 `holdSamples`（≤ 2000 ms）；非零扩展写 `reason`。各窗顺序不重叠，译文共享源文时窗。上限只作护栏不代表读得完——读时紧张优先调语义分组，确需加停讲时间时走授权的[无源展示时段](timeline-and-handoff.md#无源展示时段)并重编。

## 4. 设计输入与编译命令

完整 Schema 见 [caption.schema.json](../schemas/caption.schema.json)，项目 ID、`revision`、`planSha256`、`timelineSha256` 须与当前版本完全一致：

| 对象 | 核心字段 |
|---|---|
| `caption-design/1` | `format`、`projectId`、`revision`、`planSha256`、`timelineSha256`、`profile`、`coveragePolicy`、`cues`、可选 `exclusions` |
| `caption-design/2` | 同上，格式改 `/2`，增 `sourceLanguage` 与无重复有序 `displayLanguages` |
| 单条 cue | `id`、`occurrenceId`、`tokenIds[]` 或 `segmentId`、`lines`、`displayWindow`、`segmentationDecision`、`reason`、可选 `punctuationDecision`；`/2` 另带 `translations[]` |
| `/2` 译文项 | `language`、`lines`、`sourceCueId`、`sourceTextSha256`（由 `hashCaptionLines(lines)` 计算，中文改动须同步更新）、`provenance: {origin, status, revision}` |

编译时 manifest 保留原始 ASR/SRT 换行于 `rawText`，去排版换行生成 `lexicalText` 并记 `line-breaks-are-layout/1`；工作词文仅采用经核听确认的 `spokenText`（核听字段见[输入与识别证据](input-and-asr.md#1-识别输入与三层文本证据)）并记 `correctionProvenance`，候选修正维持原词。

```bash
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs compile-captions \
  --plan edit-plan.json --timeline timeline.json --design caption-design.json \
  --out caption-manifest.json --srt captions.srt
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs export-srt \
  --plan edit-plan.json --timeline timeline.json --manifest caption-manifest.json --out captions.srt
```

`export-srt` 按 `displayLanguages` 在同时间块输出源文与译文；字体与布局归 manifest 与渲染消费者。
