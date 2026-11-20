# 设计屏显字幕并编译交付

已有经过校验的 edit-plan 与 canonical timeline，且本轮要求字幕、字幕清单或 SRT 时读取。按下述契约生成设计输入和独立的 manifest、SRT。新 Showreel 仍由 Analysis 在唯一 `brief.md` 的观看单元决定字幕分组、显示文字、翻译、标点、真实锚点与阅读任务。用这些已定内容生成编译输入。

## 安排观众此时要读到的内容

按口语意思、真实气口与画面负荷切分。长并列按语义次序分屏，保住转折、条件、否定、单位和专名。短承接语在读得完时并入相邻分句。ASR 标点、换行和段落可以提供候选位置；分组还要核对原声或可用的真实词句锚。一段画面动作可以跨越多条字幕。

新的中文双语讲解用 `caption-design/2`，以实际源语种填 `sourceLanguage`，默认 `displayLanguages:[sourceLanguage,"en"]`，例如简体中文为 `["zh-Hans","en"]`。中文放在 `lines`，英文放在 `translations`。每屏一行中文，下方一行对应的短英文。英文保留原意、否定、条件、数字与专名，按英语阅读习惯压短并保留必要标点。两种语言共用一个显示时窗。机译可标 `machine-assisted` 与 `draft`，另用阅读与语言复核确认准确度。

用户指定单语、显示语言或原文字句时按其要求。已有 `caption-design/1` 与 `caption-manifest/1` 沿用原格式、profile 和哈希语义。没有口播时跳过 ASR 与词级字幕。字幕分组、字幕标点与翻译是独立显示产物，源话、音频切口、现有 edit-plan `displayText` 和剪辑哈希保留其原数据。

## 选屏显标点规则并检查实际读感

- 新做中文双语且可按屏显处理标点时用 `profile:"zh-caption/2"`。短气口让两条字幕直接接续，较长气口按表达与画面决定是否留白。屏显中文省略全角逗号、句号与屏末顿号。短并列内部的顿号、原话问号与叹号保留。
- 省略原文全角逗号、句号、分号、冒号、弯引号或屏末顿号时，在该 cue 的 `punctuationDecision` 记理由。`zh-caption/2` 校验全角逗号、句号和结尾顿号，可按上述范围省略标点。原词、内部顿号、问号、叹号及小数点、网址中的半角字符按原值保留。
- 用户锁定原字句和标点时用 `verbatim/1`。已有项目继续其原选 profile，包括既有的 `zh-caption/1`。
- 用实际字体、字号和播放宽度测单行，再以正常速度与实际画面一起看片，确认切换时来得及读。旧 Film/Remotion 用 `globalSettings.captionStyle`。新 Showreel 用[原生字幕 helper](../../laohu-motion/templates/runtime/native-presentation/README.md)加载、测量实际字体并保持每种语言一行。

## 用真实播放实例给字幕定位

每条 cue 在一个 `occurrenceId` 内用连续、按源词顺序的 `tokenIds`，或用一个真实 `segmentId`。同样的话在文件里出现几次，逐次按 occurrence 认定。仅有句段时间时保持 `utterance` 精度，整句显示，不按字数、停顿或动画间隔制造词锚。已删或过期的锚点需按当前计划重编。

正式完整字幕使用 `coveragePolicy:"all-retained-speech/1"`，`exclusions` 省略或置空。按剪后顺序完整覆盖所有保留口播，每个所需锚恰有一条字幕承接。用可用语音时窗和阅读负担安排分组。

`displayWindow.range` 是同一 canonical timeline 上整数样本的半开区间。它须与锚定 `speechSpan` 的前扩 `leadSamples` 和后扩 `holdSamples` 精确一致。前扩最多 500 ms，后扩最多 2000 ms；非零扩展带 `reason`。所有显示窗顺序一致、位于项目范围且不重叠，译文共享中文时窗。先调整语义分组解决阅读时间不足。画面确需增加净观看时间时，再走获准的[无源展示时段](timeline-and-handoff.md#无源展示时段)并重编 timeline 与字幕。

## 写入设计输入

[字幕 Schema](../schemas/caption.schema.json) 保存完整字段形状。身份必须分别对上当前计划与 canonical timeline 的项目、revision 和哈希。

| 对象 | 字段 |
|---|---|
| `caption-design/1` | `format:"laohu.asrcut.caption-design/1"`、`projectId`、`revision`、`planSha256`、`timelineSha256`、`profile`、`coveragePolicy`、`cues`、可选 `exclusions` |
| `caption-design/2` | 格式改为 `laohu.asrcut.caption-design/2`，增加 `sourceLanguage` 与有序、无重复的 `displayLanguages` |
| cue | `id`、`occurrenceId`、`tokenIds[]` 或 `segmentId` 两者择一、实际显示的 `lines`、`displayWindow`、`segmentationDecision`、`reason`、可选 `punctuationDecision` |
| `displayWindow` | `range:{startSample,endSample,sampleRateHz}`，按需要附 `timingPrecision`、`leadSamples`、`holdSamples`、`reason` |
| `/2` 的 `translations[]` | 每种非源显示语言一项，`language`、`lines`、`sourceCueId`、`sourceTextSha256`、`provenance:{origin,status,revision}` |

译文 `sourceTextSha256` 由 `hashCaptionLines(lines)` 按当前源语言显示行计算。中文行变动后更新译文与哈希。译文出处 `origin` 使用 `human-authored` 或 `machine-assisted`，`status` 为 `draft` 或 `reviewed`，`revision` 为正整数。默认简体中文和英文的排列按 `displayLanguages` 读取。

## 交付绑定到同一字幕版本的清单和 SRT

ASRcut 从当前计划、其 canonical timeline 与设计输入编译独立的 `caption-manifest/1` 或 `caption-manifest/2`。同一语音锚点的原文记 `rawText`，保留原始 ASR/SRT 的 CR/LF。工作词文取对应行的 `spokenText ?? text`。有 `spokenText` 时，修正须严格匹配同 source/token 或 segment、原文与修正词，并已记录 `confirmed`、`audio-listening`、`listened`。候选修正保留原词。绑定缺失或不一致会拒绝编译，真实核听字段在[识别证据](input-and-asr.md#识别输入能够证明什么)维护。

采用确认修正时，`correctionProvenance` 保存修正 ID、来源及锚点、原文、修正词和核听证据。将词文中的排版 CRLF、CR 或 LF 去除后生成 `lexicalText`，并记 `sourceTextNormalization.method:"line-breaks-are-layout/1"`、`lineBreaksRemoved`。语义标点按独立选择的 profile 处理。manifest 绑定源原文、显示文字、锚点、`speechSpan`、最终显示窗口、profile、项目与 plan/timeline 哈希。

从已解析的 `{SKILL_DIR}` 调用 `scripts/asrcut.mjs`。以下是仓库根目录内的典型命令。

```bash
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs compile-captions \
  --plan edit-plan.json --timeline timeline.json --design caption-design.json \
  --out caption-manifest.json --srt captions.srt
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs export-srt \
  --plan edit-plan.json --timeline timeline.json --manifest caption-manifest.json --out captions.srt
```

`export-srt` 用相符的 plan、timeline 和 manifest 重建字幕文本文件。双语 SRT 按 `displayLanguages` 排序，在一条共用时码块内排列源语言和译文。SRT 只带文本与时间。字体、阴影或布局交给匹配的 manifest 与实际渲染消费者，Motion 使用经验证的 manifest cue 及原生字幕 helper。
