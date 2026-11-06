# ASR 剪后时间轴与语义动画锚点

本 Reference 只在动画要跟随已经编译的 ASR 剪后时间轴时读取。它把“哪一段内容值得成为画面动作”绑定到唯一的保留词实例或句段边界，并把同一个成片时间事实交给现有画面相位与声音事件消费者。它不做粗剪/精剪、不删改音频、不生成新时间轴，也不把每个关键词自动变成一张动画卡。

## 输入、职责与时钟

接收 asrcut 的 edit-plan/1 或 edit-plan/2、其唯一编译出的 timeline/1 或 timeline/2、当前 motion scene，以及语义绑定规格。/1 沿用原有 `timeline.clips[].targetRange` 与词/句段边界；/2 的 `timeline.units[]` 是连续的唯一成片时钟，`clips[]` 只是 source-only 视图，含 source 与 presentation 两类单元。每类单元及词/句段的 `targetRange` 都由编译器给出；半开区间使用整数采样点，结束点不包含在范围内，`timeline.clock.sampleRateHz` 是唯一换算采样率。Motion 只能读取这些目标范围，不得从 `sourceRange`、Cap 原始展示时码、字幕长度或片长比例重新推算成片时刻。只有 asrcut 编译器可因删剪、排序或插入展示时段重新分配后续 `targetRange`。

`bind-speech.mjs` 对当前 edit-plan 调用 asrcut 的 `hashPlan` 与 `compilePlan`，要求 `planSha256`、project 身份和整个 timeline 编译结果一致；仅格式正确或把任意 hash 原样填入 bindings 不算来源验证。对 edit-plan 中有路径且有 SHA-256 的媒体，绑定器流式重算文件 hash，发现改变或文件不可读即停止；计划未登记媒体路径/hash 时，receipt 标 `unavailable`。绑定器还调用 asrcut 的 `verifyPlanEvidence(plan,{baseDir})`，按 plan 声明的 `evidenceHashMode` 复核本地 transcript evidence 的原始文件字节；证据缺失、不可读或 hash 改变时拒绝绑定。receipt 的 `transcriptEvidenceChecks.verified/unlocated` 记录来源 ID、hash 与状态，不复制本机路径；没有 `evidenceRef` 的来源只标为 `unlocated`，不称为已核实。媒体 hash 与 transcript 原始证据分别显示，均不代表识别内容、剪辑决定或口播语义已被人工确认。

对 `/2`，正常绑定会先准备整场 Motion 渲染覆盖：按 `ceil(timeline.durationSamples × scene.fps / timeline.clock.sampleRateHz)` 向上取整 frame count，必要时只延长 scene 的 frame-aligned 渲染边界，并把原始样本时长、时钟与不足一帧的覆盖余量写入绑定回执。词、段落、presentation 边界仍使用 compiler 的原始整数 sample 锚点，不逐段量化。锁定帧数可通过 `bind-speech.mjs --locked-frame-count N` 明确提供；若不足以覆盖 timeline 或现有 scene，绑定拒绝并报告规格冲突，不改音频样本或 timeline。此自动准备只属于 `/2`；`/1` 保持旧契约：输入 scene 必须先通过整帧校验且自身时长已覆盖 timeline；`--locked-frame-count` 只接受 `/2`。

ASR 剪辑和动画绑定是两项不同职责。用户要删除、重排、合并语音内容时转入 `laohu-asrcut`；motion 接收其编译时间轴，再根据语义蓝图选择少量有解释作用的锚点。一个词不是一个动画的触发器：关键词仅在它标志着概念引入、因果转折、对象状态变化、对比起点或结论落点时才成为候选。连续解释通常用一个 span 驱动连续揭示；多个短促相位可共享一个锚点，也可按实际讲解关系分别锚定。

样片只是从成片中的实际范围做展示，不产生第二条 ASR/成片时钟。若需截取样片，记录完整成片时间窗及其在样片中的本地位置/偏移；Motion 的语音锚点仍指向 compiler 给出的整条全片 timeline。不能通过缩短绑定覆盖、重排冻结 timeline 或手工重设 `targetRange` 来制作样片；`--locked-frame-count` 的 /2 覆盖也不代表区间渲染。只有实际 renderer/独立样片 scene 能消费全片时间窗与样片本地映射并输出可播放媒体时，才可声称 ASR 样片接线成立；接口不支持时报告控制缺口并暂停，不虚构字段或命令。

## 锚点选择和精度

每个锚点必须指向一个具体 `clipOccurrenceId`。同一段源声音若因编辑而出现多次，每次播放都有不同的 occurrence，不能只靠 source ID 或相同 token 文本定位。

- `point` 用 `{kind:"point", clipOccurrenceId, tokenId, edge:"start"|"end"}` 指向 `words[]` 中的一个真实词实例。它适合词级时间已明确、画面需要在单个术语/转折处动作的情况。
- `span` 用 `{kind:"span", clipOccurrenceId, firstTokenId, lastTokenId, edge:"start"|"end"}` 指向同一 occurrence 内顺序连续的一段真实词实例。它适合连续句意、短语或一段讲解的起止；解析器拒绝跨 occurrence 或首尾次序不明的范围。
- `segment` 用 `{kind:"segment", clipOccurrenceId, segmentId, edge:"start"|"end"}` 指向 `transcriptSegments[]` 中的真实句段。SRT 只有句段时间时使用该锚点，不把句段范围伪造成词级时间或精确 point cue。
- `presentation` 仅用于 timeline/2，采用 `{kind:"presentation", presentationId, edge:"start"|"end"}` 指向真实的无来源展示单元边界。它可驱动无口播展示时段中的局部相位或事件；不携带 `clipOccurrenceId`、token 或 segment，也不能把展示区间冒充 ASR 词锚。该区间由 compiler 唯一确定；若在它前方增删时长，必须重新编译、审核并绑定。

`measured` 与 `aligned` 按其原精度保留；`utterance` 与 `estimated` 属于低精度。遇到低精度，默认拒绝自动绑定；只有镜头确实可以接受句段级/估算级落点时，绑定项才可显式设置 `allowLowPrecision: true`。输出仍记录原始精度，不得将低精度写成精确同步。缺失、已删除、重复歧义、过期 revision/hash、跨 occurrence、越出时间轴或精度不足的锚点都要拒绝；不能静默改绑相似词、邻近词或源时间。

绑定规格必须把 `project.id`、整数 `project.revision` 和 `planSha256` 与输入 timeline 完全匹配。修改剪辑计划后，即使词文字没有变化，也须读取新编译 timeline 并重新绑定。正式绑定要求 `frozen` timeline；`draft` 只能通过显式 `preview` 选项绑定，receipt 会记录 `preview: true` 和原始 draft/review 状态。`frozen` 表示剪辑时间映射被冻结，不代表用户已审核动画、听审声音或批准成片。review 状态不能由 motion 推断或升级。

## 相位与声音事件如何接线

绑定规格只给语义锚点、显式偏移/时长和实际要消费的通道。只含 point/span/segment 的旧绑定继续用 speech-bindings/1；包含 presentation 边界时用 speech-bindings/2。例如：

```json
{
  "format": "laohu.motion.speech-bindings/1",
  "project": {
    "id": "ai-history",
    "revision": 3,
    "planSha256": "<timeline.planSha256 的 64 位十六进制值>"
  },
  "bindings": [{
    "id": "transformer-introduction",
    "objectId": "transformer-illustration",
    "phases": [{
      "id": "transformer-reveal",
      "anchor": { "kind": "point", "clipOccurrenceId": "clip-02", "tokenId": "token-transformer", "edge": "start" },
      "offset": { "value": 0, "unit": "samples" },
      "duration": { "value": 12000, "unit": "samples" },
      "curve": "ease-out-cubic",
      "channels": {
        "alpha": { "from": 0, "to": 1, "duration": { "value": 4800, "unit": "samples" }, "curve": "linear" },
        "scale": { "from": 0.82, "to": 1, "curve": "ease-out-cubic", "anchor": { "x": 480, "y": 270 } }
      }
    }],
    "events": [{
      "id": "transformer-hit",
      "phaseId": "transformer-reveal",
      "anchor": { "kind": "point", "clipOccurrenceId": "clip-02", "tokenId": "token-transformer", "edge": "end" }
    }]
  }]
}
```

偏移和时长只接受明示单位 `samples` 或 `seconds`；采样点值须为整数。帧不属于 timeline 时钟，缺少明确目标 fps 时不得换算。`bind-speech.mjs` 把锚点的 `targetSample / sampleRateHz` 写为相位 `startSec`，将通道相对偏移与时长转换为现有 `MotionOps.sampleChannels` 实际读取的 `offsetSec` 和 `durationSec`，并把每个相位锚点、样本、精度与版本写入 `scene.motionSpeechBinding`。

绑定输出不扩展 MotionCore schema。phase 进入指定现有 `custom:*` 对象的 `data.phases[]`；命名事件进入 `scene.audioEvents[]`，以 `{id, phaseId, phaseOffsetSec, timeBasis:"film-global"}` 让事件时间通过共享相位得到。事件可拥有自己的 point/span/segment/presentation 边界锚点；resolver 计算它相对所引用 phase 起点的 `phaseOffsetSec`。同一语义动作可以有多个不同作用的声音事件或多个错时通道，但同一个时间事实不允许分别手写进画面秒数和音频秒数。

已有手写 `filmTimeSec` 是独立的片内绝对时刻，不具备跟随剪辑的来源锚点。timeline/2 revision/hash 变化时，绑定器不会替它自动平移：必须在绑定规格里逐个按 event ID 记录 `retain-absolute` 或 `remapped` 和理由；需要重定位的事件须先在新 scene 给出新的真实时刻。移除的旧直接事件可删除并记录移除；未复核当前全部直接事件，或 re-authored 时间与旧回执相同却声称 remapped，绑定会失败。需要随语音移动的新事件应改用 point/span/segment 或 presentation 边界锚点。

若 timeline/2 包含剪后原声，不能按 `clips` 分段重播，也不能把全长 WAV 的 `0..duration` 当作连续 voiceWindows。用最终冻结 plan/timeline 与 exporter receipt 生成音频计划：

```sh
node .agents/skills/laohu-motion/scripts/audio.mjs prepare-asrcut-plan \
  --edit-plan /绝对路径/frozen-edit-plan.json \
  --timeline /绝对路径/frozen-timeline.json \
  --receipt /绝对路径/voice.wav.artifact.json \
  --voice-wav /绝对路径/voice.wav \
  --voice-asset-id asrcut-voice --voice-track-id asrcut-voice \
  --output /绝对路径/audio-plan.json [--base-plan /绝对路径/base-audio-plan.json]
```

该入口把导出的整份剪后 WAV 作为从样本 0 开始的一条锁定 voice track，核验计划/时间线/receipt/WAV 哈希及精确样本数，并从 source units 的 targetRange 生成保守 voiceWindows；这些窗口可含录音原有停顿，SRT/低精度 ASR 仍保留其粗精度。presentation 时段单独保留为含视觉与 audio handoff 的窗口，供混音决策读取；`bed-duck`、`quiet` 等职责不代表把麦克风空样本自动变成最终混音全静音。原录音中的自然停顿照样留在全长 WAV，除非 asrcut 明确剪掉它。`--base-plan` 只允许接收 duration 完全一致、尚无 voice track/window 的计划；已有片长和音乐/音效安排不会被自动改写。后续 render 会重新核验冻结哈希、timeline、receipt、voice asset 与 source/presentation windows；修订剪辑后须从新版本重建绑定。未听审的原声仍须显式走 candidate 技术预览，不能由编译或哈希验证升级为 ready。

自定义绘制必须真实调用 `MotionOps.samplePhase` 或 `sampleChannels` 并用结果更新画面属性；仅有 `speechAnchor` 或 receipt metadata 不算画面绑定。音频计划的 `events[].eventId` 指向 `scene.audioEvents[].id`，由 `MotionOps.mapSceneEvents` 和 `scripts/audio.mjs` 实际解析。绑定器不会替作品挑音效资产、生成混音、判断某个音色适合或证明人耳听感；这些仍按 [音乐、音效与静音设计](sound-design.md) 处理。

## 生成、重编与拒绝条件

普通制作流程由主 Skill 先完成语义蓝图和现有 renderer 对象，再运行：

```sh
node .agents/skills/laohu-motion/scripts/bind-speech.mjs \
  --scene /绝对路径/base.scene.json \
  --plan /绝对路径/edit-plan.json \
  --timeline /绝对路径/timeline.json \
  --bindings /绝对路径/speech-bindings.json \
  --out /绝对路径/bound.scene.json
```

默认不覆盖目标文件；明确选择新输出路径，或确需替换时显式传 `--overwrite`。输出安全检查由 asrcut 的 `writeJsonOutput` 执行原子写入，并比较规范化路径及文件设备/inode；scene、timeline、bindings、edit-plan、计划内媒体和可解析为本地文件的 `transcript.evidenceRef` 都受保护。即使传入的是输入文件的符号链接或硬链接别名，也必须拒绝，`--overwrite` 不能绕过来源保护。`--preview` 是显式接受 draft 的开关。绑定器只复制并扩展 scene，不写回 timeline 或 edit-plan，也不修改输入文件。生成结果可重复绑定：再次处理同一已绑定 scene 时，只清除上一次 `motionSpeechBinding` receipt 明确登记的 phase/event ID，再用当前 timeline 生成，不碰其他手写相位和旧直接时钟事件。

以下情况停止受影响的绑定并报告具体锚点，不补猜时间：缺 project 身份/hash、revision/hash 不匹配、目标 occurrence/token/segment 消失、同 occurrence 标识重复、span 顺序无效、range 的采样率/端点越界、phase/event 落在 timeline 之外、样本单位非整数、帧单位无目标时钟、低精度未获显式接受、scene 时长短于 timeline、或目标不是唯一的现有 custom 对象。需要修改剪辑或恢复被删语音时回到 asrcut 做新决定并重新编译。

最后按 toolchain Reference 渲染输出：在同一 bound scene 上抽查绑定动作的起/中/落帧；再用同一 scene 和 audio plan 验证事件落点，必要时解码混音 WAV 测其样本位置。只显示 receipt 或通过 JSON 验证不能证明画面消费者读取了 phase，也不能证明音频正确、听感合适或观众理解。新锚点的技术评测在 [speech binding eval](../evals/speech-binding.test.mjs) 中分别检查 MotionOps 通道取值、共享声音事件映射及 FFmpeg PCM 落点；合成音仅作技术链路证明。
