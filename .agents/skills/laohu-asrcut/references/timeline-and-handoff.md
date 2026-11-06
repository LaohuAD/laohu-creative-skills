# 剪后时间线、审阅页与交接

由 laohu-asrcut 在冻结剪辑方案、编译目标时间、输出审阅报告或提供动画/媒体适配时读取。它定义唯一时间轴契约；读完回主 Skill 完成编译、审阅或授权导出。

## 两份 JSON 的职责

edit-plan.json 是编辑决定真源，记录项目身份与 revision、状态、授权、来源证据、原始 ASR 片段、原始 clock 值/单位/字段与 evidenceRef、词实例、coverage 分类、sequence、删除理由、问题、口语修正与可选显示文字。`edit-plan/1` 沿用 source-only 序列结构；`edit-plan/2` 的 `sequence` 以 source occurrence 和 presentation unit 共同表达最终顺序，任何第二个排序字段都不允许。transcript.sha256 对应原输入证据文件的原始字节；evidenceRef 保留该文件的可定位路径，不复制原始媒体/ASR。CLI 保存相对 evidenceRef 时，以 plan 文件目录为基准；timeline 复制这一定位信息，下游复核时应使用原 plan 的 baseDir。`verifyPlanEvidence(plan,{baseDir})` 会重新读取文件并检查 raw-byte hash；路径缺失或 hash 过期即拒绝。timeline.json 是编译产物，只保存从计划确定性推导出的 source/presentation 目标映射、剪后时长、词/句段目标范围、删除清单、来源哈希和问题。`timeline/2.units` 是唯一连续的目标序列，`timeline.clips` 是其 source-only 视图；任何消费者可以读取二者，但只有 asrcut 编译器可分配/平移 targetRange，HTML、Cap 适配器与 motion 不可另造连续目标光标。`/1` 的结构和 hash 行为不因 `/2` 新能力静默改变。

计划状态 state=draft|frozen 与审阅状态 review.status=not_requested|pending|approved|changes_requested 分开。冻结只代表当前计划内容与时钟可以稳定复用；不代表用户批准、试听、媒体导出授权或最终质量通过。planSha256 的稳定序列化排除 `state` 与 `review` 字段，所以单独把审阅状态改成“待审/通过”不改变剪辑哈希；若状态为 approved，approvedPlanSha256 必须与当前剪辑哈希相同。任何源证据、coverage、顺序、显示文字或编辑决定变更都必须提升 revision 并重算哈希；旧 timeline、审阅反馈和动画锚点全部失效。feedback 必须带 project.id、revision 和 planSha256；三项任一不匹配即标记过期，不可自动应用。

## 时钟与映射字段

范围都采用半开区间 [startSample,endSample)，结束样本不属于区间。plan 中每个 sourceRange 明确带 sampleRateHz，单位是该 source 的主音轨样本；project clock.sampleRateHz 是输出采样率。多轨偏移的方向与参考文献一致：primaryAudioTime = trackLocalTime + offsetSeconds。未知时钟/偏移明确写 unknown/null，编译器可生成不依赖它的虚拟结果，但任何依赖跨轨同步的媒体导出都会阻断。

每个 source clip 必须有唯一 occurrenceId、sourceId、coverageId、sourceRange、targetRange 和精度。一次源范围被播放两次时，出现两条不同 occurrenceId。targetRange 使用统一 project clock 的整数样本。`timeline/1` 的 clips 按 source sequence 连续排列；`timeline/2` 的完整 `units` 才必须连续无重叠，source-only `clips` 可以因中间 presentation 而在 targetRange 留出间隔。剪掉的源范围不占目标时间，保留的静默仍占目标时间。时间换算的量化/舍入信息写入 timeline.clock.quantization，不能假装跨采样率转换无限精确。

Presentation 是 `/2` 中独立的无来源成片时间：每项有稳定 `id`、正整数 `durationSamples`、`decisionId` 与理由、`sceneId`、描述画面进出态的 `visualHandoff`，以及不声称混音结果的 `audioHandoff`；它没有 sourceRange、occurrenceId、token 或 transcript。编译器只按 sequence 将其范围插入连续 `units` 并将后续 source/word range 整体右移。source pause 与新增 presentation 的来源证据分别记录；观看预算应计入已保留且可用的原有停顿，只新增其净不足部分，不能重复加时。是否存在可用停顿须有音频证据，不能只凭 ASR/SRT 间距推断。由声音/画面共同制作授权作出的常规停讲与观看预算是作者决定，不需要逐项让用户再授权；`presentationTiming` 记录该任务动作已授权，不能替代实际编写的决定与理由。冻结 plan 后的新增或改时长必须提升 revision/hash 并重编译，旧 timeline、用户 review 与 motion bindings 失效。

词级时间能被唯一定位时，timeline.clips[].words 给出 tokenId、未改写的原文 `text`、源区间、目标区间和 timingPrecision；只有有音频核听声明和精确证据范围的 spokenCorrections，才会额外附加 `spokenText`。候选修正单独列在 timeline.spokenCorrections，绝不替代 rawText。仅有 SRT/句段时间时不生成词条假时间，改用 timeline.clips[].transcriptSegments 保存 segmentId、原文、源/目标范围和 utterance 精度。显示文字独立保存在 plan.displayText；它不参与声音时钟，也不冒充源词。过期、缺失、歧义或跨剪辑边界的 cue 锚点由 motion resolver 拒绝。

## 脚本接口

从仓库根目录导入普通 ASR JSON/SRT：

    node .agents/skills/laohu-asrcut/scripts/asrcut.mjs import --input input.srt --project-id project-1 --out edit-plan.json
    node .agents/skills/laohu-asrcut/scripts/asrcut.mjs compile --plan edit-plan.json --out timeline.json
    node .agents/skills/laohu-asrcut/scripts/asrcut.mjs insert-presentation --plan edit-plan.json --spec presentation.json --out edit-plan.json --authorize-presentation-timing --update-plan

传入媒体源时可以提供 --source path、--source-sample-rate 48000、--source-duration-samples N 和（多音轨时）--audio-stream-index。导入器将 source hash 写入计划，并保存 ASR/SRT 路径 ref 与逐段/逐词原始 clock 证据。API 的 `importAsrJson` 参数包括 `projectId`、`sourceId`、项目 `sampleRateHz`、源 `sourceSampleRateHz`、`sourceDurationSamples`、`mediaPath`、`mediaSha256`、`transcriptSha256`、`timeUnit`、`evidenceRef` 和 Cap 专用的 `recordingSegment`。多源合并调用 `mergePlans(plans,{projectId,sourceOrder})`，要求 sourceOrder 明确且覆盖每个 source 一次。`compilePlan` 仍是唯一时间轴生成器；输入/输出路径冲突检查由 CLI 写入层执行，API 返回对象本身不写 JSON。

ASR JSON 至少须显式标明时间单位或使用已知方言。普通 start/end 可配置为秒；startMs/start_ms 与 Cap sourceStartMs/sourceEndMs 明确是毫秒；火山大模型 `start_time/end_time` 必须由 API 调用方明确传入 `timeUnit:'ms'`。Cap transcript 只有显式 schema 与 timeBasis 时才被识别；原始 sourceStartMs 用作源本地样本范围，globalStartMs 留为分开的项目时间证据/原序，词级字段同样完整保留在 token.globalRangeMs 与 evidenceClock，不混作源时间。存在不认识的单位、混合 clock 或超出源 duration 的时间时，导入/编译报错或新增 unresolved question，不静默转换。

路径别名保护检查解析后真实路径、符号链接目标与已存在文件的设备/inode。输出等同任一输入、源媒体或原工程路径时拒绝；原媒体和原始 ASR 永不覆盖。原始识别响应只能写入新的 evidence 文件；音频导出也只写入全新 WAV 和 `.artifact.json`，不覆盖任何既有目标。计划/时间线等派生产物的替换必须由本轮明确授权，并通过同目录临时文件与原子 rename。

编译器支持等速裁剪、顺序拼接、已授权重排与经授权的 source-free presentation。`insert-presentation` 的完整输入字段如下；边界字段只用于按当前 sequence 找定位，不写回 plan，最终顺序仍只由 sequence 表达：

```json
{
  "id": "presentation-after-a",
  "decisionId": "decision-presentation-after-a",
  "reason": "口播已完成因果解释；观众还需看清结果图稳定后的关系。",
  "afterOccurrenceId": "occurrence-a",
  "sceneId": "result-diagram",
  "durationSamples": 38400,
  "visualHandoff": {
    "focus": "结果图中的两条连接",
    "entryState": "连接刚完成，结果仍在落定",
    "exitCondition": "两条连接和结果标签均可辨认后切入下一句"
  },
  "audioHandoff": {
    "role": "bed-duck",
    "rationale": "保持配乐连续并在读图时让位；不声明最终混音静音。"
  },
  "expectedRevision": 4,
  "expectedPlanSha256": "当前 edit-plan 的 64 位小写 SHA-256"
}
```

`expectedPlanSha256` 必须是实际 64 位小写十六进制值；上面的说明文字只是字段形状提示，不能原样传给 CLI。只有完整声画制作范围覆盖该动作且该画面确需独立观看时间时才使用。先把已保留且可用的 source pause 计入画面总预算，只把净不足量写入 `durationSamples`；纯音频、锁定原音或锁定总时长等真实冲突会阻断受影响的插入。CLI 默认不允许覆盖输入 plan；在同目录迭代同一主 edit-plan 时必须显式添加 `--update-plan`，它仍会保护 spec、媒体和 transcript evidence 输入。

音频 exporter 对 `/2` 仍只输出一个新 PCM WAV：source range 根据 compiler targetRange 裁切/重采样，每个 presentation unit 写入精确的项目采样数，完成的 WAV 按一个 voice track 播放一次。receipt 包含 source-only conservative `voiceWindows` 和完整 units 映射；原 source pause 的精度/采样照常保留，不伪造 VAD 活动区间，presentation handoff 不等于最终混音静音。下游不能将 `clips` 再拼播一次、也不能把全长 WAV 范围冒充连续 voiceWindows。Cap EDL 不能表示这些无源时长；含 presentation 的 `/2` 显式拒绝，不移除 source-free units。

`timeline.planSha256` 是按稳定字段序列化后对 plan 内容求得的 SHA-256，排除 plan 中的 `integrity.planSha256` 自身及审阅状态字段；timeline 必须携带同值。每个 source.transcript.sha256 与 source.media.sha256 都是导入证据哈希。下游消费前需比较 project id、revision、planSha256、source id/hash 与 occurrence/token/presentation ID 是否仍存在。source 哈希改变或 plan 内容 hash 不符都拒绝旧映射。

## HTML 视图与反馈

审阅页的主线按剪后顺序展示目标时间和完整保留表达，允许展开查看原始 ASR、源文件与句段/词时间。`/2` presentation 行应显示自己的 `presentationId`、连续目标范围、场景用途/观看预算依据、visual/audio handoff，并清楚标为没有 source recording、sourceRange 或 ASR 字词；不得伪造源试听控件。source clip 行与 presentation 行在视觉上分开，source-only clip 的 targetRange 间隔由 timeline 单元解释，不能误判成丢失片段。删除清单按原始顺序展示原因、对应保留实例及实际源范围。多来源片段要显示 source id、录制段和来源时间；画面高度/行数不能冒充实际播放时长。问题区域列出缺失 duration、未知偏移、句内不精确边界、未授权重排和超出来源范围等待确认项。

可试听控件只能播放真实媒体片段；原始 source-range 试听与真实剪后 join 试听明确分开。timeline 虚拟拼接、SRT 或波形幅度不是拼接试听。没有实体剪后文件时，join 播放按钮需禁用并解释缺少媒体；不伪造播放器响应。审阅反馈对象至少包含 `project.id`、`revision`、`planSha256`；针对 source clip 必须附该次 `occurrenceId`，针对具体词/句再附对应 `tokenId` 或 `segmentId`。针对 presentation 反馈用 `presentationId` 加相同的项目/revision/hash 定位，并可补充目标范围；不得要求或生成虚假的 `occurrenceId`。仅给相同文本、sourceRange 或 segmentId 不足以指向同源素材的哪一次播放。删除项反馈应指向 `coverageId`/`decisionId` 并保留源范围；若缺身份字段或哈希过期，作为待澄清反馈展示，不自动映射或应用。反馈只供 Agent 比对并由 asrcut 更新计划；HTML 不直接改计划 JSON，也不构成用户批准。

音频导出器仅在 plan frozen、显式 mediaExport=true、所有来源原媒体哈希与采样时钟匹配、全源范围已分类且没有 mediaExport 阻断问题时，以 FFmpeg `atrim` 等速裁切、重采样和 concat 输出 PCM WAV。导出目标与临时目录必须同卷，且目标/receipt 必须为不存在的新路径；源媒体哈希与 inode 在导出前后复核。回执记录实际 WAV SHA-256、样本率、样本数、operation 和 `auditionStatus=not_auditioned`。机械样本验证不等同人工听审。

## 下游消费者

laohu-motion 读取冻结且身份/哈希有效的 timeline。选择锚点时优先使用实测或可信对齐的词级时间；estimated 或 utterance 只支持明确接受低精度的较大讲述范围，不支持伪精确单词触发。语音锚点绑定 occurrenceId 加 tokenId/segmentId，不按文本相等定位；无源动画锚点必须绑定 presentation ID 与 start/end edge，不能伪造成词。已编译计划若不足以容纳真实画面讲解，motion 只能返回时间请求给 plan 作者；即使完整声画制作已授权，也不得私自平移冻结时间线。同一词多次出现时由 occurrenceId 消歧；多个词可形成一个区间，一个词可以关联多个画面阶段。

Cap/其他 NLE 适配器只能按 timeline targetRange 原样定位目标时间；为了原生项目接口可以转换时基，但须保留同一目标长度及源/目标映射并验证转换误差。源区间按主音轨时钟反算到具体轨道时，使用已知 sync offset；未知偏移阻断依赖该轨的媒体导出。只输出主音频的 WAV 不依赖画面轨 offset。应用程序无法接收某类型素材时报告适配缺口，不得仅重命名格式或捏造原生兼容性。

应用前检查目标路径不是任何源的别名、source hash 与预期 revision 未变、授权仍覆盖操作，并把实际执行回执与虚拟时间线区分保存。脚本不会自动改工程，不会覆盖源媒体，也不自动启动付费 ASR 或编码操作。
