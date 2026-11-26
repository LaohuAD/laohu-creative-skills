# 时间线编排、审阅页与动画交接

需要用脚本修订剪辑计划、编译唯一时间轴、插入无源展示时段、制作 `review.html` 审阅页或向 `laohu-analysis` / `laohu-motion` 交接上位时间底盘时读取。实体音视频导出、逐缝切片、NLE 交换件与撤回删段见[媒体导出与交换](media-export.md)。

## 1. 两份 JSON、时钟与双哈希

- **`edit-plan.json`（剪辑决定真源）**：存项目 ID 与 `revision`、源媒体与原始识别、轨道同步、授权开关、`coverage`、`sequence`、删留理由与 `decisions`、待确认 `questions`、`spokenCorrections`、`displayText`、局部 `annotations` 及节奏与视觉元数据。`/1` 只排源片段，`/2` 交错排 `source` 与无源 `presentation`。
- **`timeline.json`（唯一编译器派生时钟）**：由 `compilePlan` 生成，输出整数半开采样区间 `[startSample, endSample)`、总样本数、`clips`、`/2` 连续 `units`、删段与词句映射。下游（HTML、Motion、字幕、导出）全部直读 `targetRange`，严禁自行累计或估算时长。
- **双哈希与版本状态**：`planSha256` 排除自身、`state`、`review` 与旁注；`annotationSha256` 独立校验局部旁注。改源、剪辑或显示决定须递增 `revision` 重算 `planSha256`；写旁注保剪辑哈希不变，仅更新 `annotationSha256`。`state`（`draft` / `frozen`）标版本稳定，`review.status`（`approved` 须绑定当前 `planSha256`）标人工审阅，二者互不替代。只有实际运行编译器并核对同版产物后才报告已编译。

## 用编辑操作单修订计划

将剪辑决定写成 `format: "laohu.asrcut.edit-ops/1"`（绑定 `expectedRevision` 与 `expectedPlanSha256`），交 `apply-edits` 确定性拆分 `coverage`、保序分配 `tokenIds`、拦截词内切点与微停违规并输出下一版 `draft`（须写到同目录新路径以保相对引用有效；同目录原位覆写仅在显式加 `--update-plan` 时允许）。

| `op` | 除唯一 `id` 外必填与关键字段 |
|---|---|
| `delete-range` | `sourceId`、`sourceRange`、`reason`。因重复删除另带 `relation: "repeated-content"`、`keptOccurrenceIds`、`keptTokenIds`。 |
| `trim-pause` | `sourceId`、`sourceRange`、`reason`、`pauseRange`、`pauseKind`，命令附匹配 `--silence-map`。短于 350 ms（`natural` 档 600 ms）的气口例外允许 `pauseException: "retake-adjacent" \| "speech-error-adjacent" \| "thinking-pause"`。 |
| `reorder` | `occurrenceIds`（当前全部源实例精确新排列）、`reason`，须已建重排授权。 |
| `repeat` | `occurrenceId`、`newOccurrenceId`、`reason`，须已建重复授权。 |
| `spoken-correction` | `sourceId`、`segmentId`、可选 `tokenId`、`spokenText`（默认 `candidate`；核听确认填 `status: "confirmed"` 与 `verification`）。 |
| `set-display-text` | `segmentId`、`text`、可选 `tokenIds`，只改显示文字层。 |

**顶层导演与节奏元数据**（可随操作单或空 `operations: []` 写入，完整字段见 [asrcut.schema.json](../schemas/asrcut.schema.json)）：
- `pacingProfile`：`standard-narration` / `compact` / `natural`。
- `pauseWindows[]`：`{id, sourceId, sourceRange, pauseKind, reason, function?}`。`pauseKind` 支持 `head`、`tail`、`micro`、`hesitation`、`clause`、`sentence`、`paragraph`、`emphasis`；功能保护 `function` 支持 `emotional-beat`、`system-sound`、`visual-action`、`user-locked`、`visual-comprehension`（一旦标记功能保护，后续修订不可丢弃或缩窄）。
- `narrativeBeats[]`：`{id, sourceId, segmentIds, role, emotion?, energy?, pacingNote?}`（`segmentIds` 须在原源内连续不重叠；`energy` 取 `low` / `medium` / `high` / `peak`）。
- `visualCues[]`：`{id, sourceId, segmentId, tokenIds?, category, note?}`（由剪辑师主动精选关键语义视觉锚点，`category` 支持 `attention` / `step` / `comparison` / `turn` / `concept` / `data` / `emotion` / `conclusion`）。
- 剪口 `delete-range` / `trim-pause` 还可附 `visualSeamRisk` 与 `visualMaskHint`。

**例外停顿覆盖（`pauseVerification`）**：实听确认某免动刀窗内存在明显杂音、拖沓或需按用户明确指令精调时，在 `trim-pause` 附 `verification`：
- 实听依据：`{method: "audio-listening", listeningStatus: "listened", reviewedBy, finding, sourceSha256, sourceRange}`（移除干扰时切口两端须落在同源实测低能量窗内）。
- 用户指定节奏：`{method: "user-direction", userNoteId, excerpt, sourceSha256, sourceRange, targetDurationSamples}`（引用同源相邻备注原句）。

```bash
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs apply-edits \
  --plan edit-plan.json --ops edit-ops.json --silence-map silence-map.json --out revised-plan.json
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs validate --plan revised-plan.json
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs compile --plan revised-plan.json --out timeline.json
```

## 无源展示时段

完整声画制作中，若画面读图、等操作结果、片头视觉导入或片尾结论定格确实需要额外停讲时间，**先扣减同版剪后已保留且可用的源停顿**，只为净缺口申请独立 `presentation`（不得靠 ASR/SRT 空隙估算）。若与用户锁定的原音或总长冲突，先交用户裁决。

`presentation.json` 绑定 `expectedRevision` 与 `expectedPlanSha256`，含 `id`、`decisionId`、`reason`、`sceneId`、正整数 `durationSamples`、`visualHandoff: {focus, entryState, exitCondition}`、`audioHandoff: {role, rationale}`（`role` 取 `continue-bed` / `bed-duck` / `sound-effect` / `quiet` / `none`），以及定位字段二选一：`afterOccurrenceId` 或 `position: "before-first" | "after-last"`。

```bash
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs insert-presentation \
  --plan edit-plan.json --spec presentation.json --out revised-plan.json --authorize-presentation-timing
```

整条时间线至少保留一个真实源；新增展示时段后须重编 timeline、字幕与下游绑定。多源先合并再插展示段。

### 语义字幕编译

按[字幕设计与编译](captions.md)从同版 `edit-plan` 与 `timeline` 生成独立 `caption-manifest` 和同源 SRT。

## HTML 视图与反馈

由 [laohu-htmlshow](../../laohu-htmlshow/SKILL.md) 读取同版 `edit-plan` 与 `timeline` 生成本地可打开的 `review.html`：
- 默认按剪后顺序展示保留口播、目标时间与主要未决项；支持展开原顺序删除线对照、源范围、`coverageId` / `decisionId`、改动理由、重剪比例、节奏档、停顿差、跳剪风险、重排前后状态及撤回记录。
- 无源 `presentation` 行清晰标出目标范围、场景、观看预算与音画 handoff，注明无源录音。
- 原音播放与剪后播放提供两个独立控件，只绑定已核实存在的真实媒体文件；缺哪份即禁用并说明原因，绝不拿虚拟拼接或 SRT 冒充媒体播放。
- 局部旁注通过 `annotate --plan ... --annotation annotation.json --out ...` 写入稳定 ID（`userNote` / `analysisNote` / `motionDirection` / `motionBinding` 各守职责，不改剪辑哈希）；页面依 `resolvedTargets` 定位当前位置，未保留则标 `not-in-retained-timeline`。完整动画视觉设计仍归唯一 `brief.md`。
- 审阅页导出的反馈须携带项目 ID、`revision`、`planSha256`（旁注另带 `annotationSha256`）及具体 `occurrenceId` / `tokenId` / `segmentId` / `presentationId` / `decisionId`，由编辑者核对后走正式版本修订。

## 动画交接

作为 `laohu-motion` 上位输入时，不要只甩一份裸音频或光秃秃的时间戳。先在冻结版计划里把**四类导演级时间情报**装实，再派生只读 `animation-handoff.json`（不改变 `timeline.json` 字节与哈希）：

1. **情绪与节拍骨架（`narrativeBeats`）**：每个段落除写清讲述作用 `role` 外，尽量补上听辨或通读得出的情绪基调 `emotion`、能量档位 `energy`（`low`/`medium`/`high`/`peak`）与节奏提示 `pacingNote`，让 `Analysis` 和 `Motion` 一眼看出哪里蓄力、哪里反转、哪里落定。
2. **现成可用呼吸与落版窗（`availablePauseWindows`）**：把剪后保留下来的关键换段、整句或情绪强调停顿登记进 `pauseWindows` 并附匹配 `--silence-map`，编译器会自动筛选剪后 ≥ 0.45 s 且探针证实干净的窗交出，避免下游白白申请多余展示时段把节奏拉散。
3. **精选语义视觉锚点（`visualCues` → `visualCueCandidates`）**：主动把关键概念、数据冲击、逻辑反转、对比起点和界面指引词写入 `visualCues`，不再只靠脚本的少量兜底关键词正则；下游只为真正有解释作用的词设动画，不把每个词都做成卡片。
4. **跳剪风险与无源净预算（`visualSeamRisks` 与 `presentation`）**：标明长删剪跳剪处的遮蔽建议（录屏特写、动效卡片、微推景别）；若原停顿实在不够读图，再与下游核算净缺口回到同一计划插入 `presentation`。

```bash
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs export-handoff \
  --plan frozen-plan.json --timeline timeline.json --silence-map silence-map.json --out animation-handoff.json
```

下游 `laohu-motion` production plan `/4`、`/5` 在 `inputs.asrcut.animationHandoff` 绑定 `{path, sha256}`（带探针时同附 `silenceMap`）。`measured`/`aligned` 词锚支持精准词级动作，`utterance`/`estimated` 仅用于粗精度句段范围；任何剪辑变动均须重编冻结并更新交接。
