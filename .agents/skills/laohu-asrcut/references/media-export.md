# 媒体导出、逐缝核听、NLE 交换与撤回操作

仅当本轮已明确授权导出真实音频 WAV、视频 MOV、逐缝切片、剪辑软件交换文件（FCPXML / OTIO / EDL），或需要接入已修连续音源、撤回一条既往删除时读取。纯纸面或虚拟剪辑不加载本文件。

## 1. 导出前核验与完整命令链

导出前核对：冻结版 `edit-plan` 与同版 `timeline`、源媒体与原始转写字节哈希、完整覆盖、真实时钟与无阻断 `questions`；WAV 与视频须已建 `authorization.mediaExport`。所有新媒体、回执和 `--tmp-dir`（须与输出同盘）均使用全新路径，绝不覆盖输入或旧版。

```bash
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs freeze --plan revised-plan.json --out frozen-plan.json
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs compile --plan frozen-plan.json --out timeline.json
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs export-audio \
  --plan frozen-plan.json --timeline timeline.json --out cut.wav --seam-crossfade-ms 12
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs extract-seams \
  --plan frozen-plan.json --timeline timeline.json --audio cut.wav --out-dir seams
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs export-video \
  --plan frozen-plan.json --timeline timeline.json --fps 30 --audio cut.wav \
  --audio-receipt cut.wav.artifact.json --out cut.mov
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs export-nle \
  --plan frozen-plan.json --timeline timeline.json --fps 30 --format fcpxml --out edit.fcpxml
```

## 2. 音频导出与零漂移交叉淡化

- **推荐用 `--seam-crossfade-ms 10..15`（范围 0..30）**：从切口两侧未删尽的原录音余量借半窗做等能量交叉淡化（`acrossfade` quarter-sine），**总样本数零漂移、所有词锚位置零偏移，同时消除切口咔嗒爆音与底噪掉坑**；仅当源开头或结尾确实无余量可借时自动安全退回边缘淡化。旧参数 `--seam-fade-ms 0..30` 保留向后兼容（不可与 `--seam-crossfade-ms` 同时开启），注意旧参数会在切口淡到静音再淡起，底噪较明显时可能产生轻微抽气感。
- **回执与状态**：输出 `.artifact.json` 记录输出哈希、精确样本数、淡化/交叉淡化明细与 `auditionStatus: "not_auditioned"`。`/2` 回执另记 `units` 与保守 `voiceWindows`（包含原留白，非逐帧语音活动检测）。
- **无源展示时段音频**：默认在 `presentation` 区间写精确零样本（不代表最终混音必须全静音）。确需原声底噪补桥时，传 `--room-tone request.json --silence-map silence-map.json --authorize-room-tone`，请求格式 `laohu.asrcut.room-tone/1`（绑 `projectId`、`revision`、`planSha256` 及 `replacements: [{presentationId, sourceId, roomToneSourceRange}]`），取相邻保留源经核实的等长稳定底噪，配合 `--seam-crossfade-ms` 可平滑衔接边界。

## 3. 逐缝切片与多模态实听复核

`extract-seams` 从匹配的冻结计划、时间线、剪后 WAV 与回执，向新目录导出每条不连续接缝前后各 1.25 s 的切片和 `seams-manifest.json`（含各切片哈希与 `seamOffsetSamples`；连续同源区间不标缝）。

具备真实听审能力的多模态执行者，**导出后应直接实听 `seams/` 中的关键接缝切片和成品语流**；听出吞字、气口发赶、底噪断层、情绪截断或双词时立刻回调切点重出。交付时将 AI 实听复核结果与用户终审严格分开报告。

## 4. 视频导出与剪辑软件交换件

- **视频导出（`export-video`）**：须已核实视频轨与主音轨偏移（未知偏移阻断），按累计绝对目标时间量化帧边界防累积漂移，音频保持原样本级时钟。帧率支持整数或分数（如 `30000/1001`）；多视频流用 `--video-streams sourceId=全局流索引` 指定。可复用已核 WAV 与回执、传连续修音三件套，或直接从冻结计划按 `--seam-crossfade-ms` 渲染。输出 `.mov` 与 `.video-artifact.json`（记帧率、总帧数、尾帧与音轨差值，`viewingStatus: "not_viewed"`、`auditionStatus: "not_auditioned"`；无源时段以黑帧占位）。
- **能力边界**：本脚本按音频时钟同帧硬切音画，不直接渲染声先画后的 J/L 错切。复杂声画错切或跳剪遮蔽，口播动画交 `laohu-motion` 视觉层，实拍精剪导出 NLE 工程进专业剪辑软件细调。
- **NLE 交换件（`export-nle`）**：直接从冻结时间线生成，无需先渲染媒体：
  - `fcpxml`（1.10）：带视频、跳剪与旁注标记及可编辑主音轨（按帧对齐）。
  - `otio`：独立视频与主音轨，保留主音轨样本级定时与流索引元数据。
  - `edl`（CMX 3600）：单视频轨、源与项目同帧率、NDF、最多 999 事件、带 LOC 标记与黑场占位（不支持 `/2` 无源展示段以外的 Cap 特殊限制）。
  - 交换文件在具体剪辑软件里的媒体回链与导入效果须以实机验证为准。

## 5. 已处理连续音源绑定

按[口播声音处理](audio-postproduction.md)修完连续原音后，若要接回剪辑导出，在 `export-audio`（或 `export-video`）成套传入 `--audio-plan`、`--processed-source` 与 `--audio-receipt`（当前支持单源显式绑定）。脚本严格核对来源 ID、原音与处理源哈希、采样率、声道、精确样本数与三点延迟校准，再按既有时间线裁切，回执写入 `renderedBeforeTimelineRanges: true`。任何计划、时间线或修音更新均须重新核绑。

## 6. 撤回一条已确认的删除

若审阅后决定恢复某一条先前删除的片段，用 `delete-range` 配 `restore: true` 与 `revertedFromDecisionId`（程序仅在原序位置唯一可定位时恢复，并保留旧删除记录作追溯）：

```bash
node --input-type=module - revised-plan.json delete-draft-1 '恢复此句，保留操作条件' restore-ops.json <<'JS'
import {readFile, writeFile} from 'node:fs/promises';
const [planPath, decisionId, reason, outPath] = process.argv.slice(2);
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const matches = plan.coverage.filter(r => r.disposition === 'delete' && r.decisionId === decisionId);
if (matches.length !== 1) throw new Error('请选定恰好一条当前删除范围');
const [{sourceId, sourceRange}] = matches;
const spec = {
  format: 'laohu.asrcut.edit-ops/1',
  expectedRevision: plan.project.revision,
  expectedPlanSha256: plan.integrity.planSha256,
  operations: [{op: 'delete-range', id: `restore-${decisionId}-r${plan.project.revision + 1}`, sourceId, sourceRange, reason, restore: true, revertedFromDecisionId: decisionId}]
};
await writeFile(outPath, JSON.stringify(spec, null, 2) + '\n', {flag: 'wx'});
JS
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs apply-edits --plan revised-plan.json --ops restore-ops.json --out restored-plan.json
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs compile --plan restored-plan.json --out restored-timeline.json
```

恢复后同步更新审阅页、字幕和动画交接件。

## 7. 公共脚本 API 速查

- [asrcut.mjs](../scripts/asrcut.mjs)：`importAsrJson`、`importSrt`、`mergePlans`、`upsertAnnotation`、`insertPresentationInterval`、`verifyPlanEvidence`、`validatePlan`、`hashPlan`、`compilePlan`、`freezePlan`、`authorizeReview`、`exportAudio`。
- [audio-probe.mjs](../scripts/audio-probe.mjs)：`probeSilence`、`verifySilenceMap`、`verifyRoomToneCandidate`、`inspectMediaSummary`。
- [edit-operations.mjs](../scripts/edit-operations.mjs)：`applyEdits`、`verifyProbeAcoustics`。
- [video-and-nle.mjs](../scripts/video-and-nle.mjs)：`extractSeams`、`exportVideo`、`exportNle`。
- [animation-handoff.mjs](../scripts/animation-handoff.mjs)：`compileAnimationHandoff`、`verifyAnimationHandoff`。
- [audio-postprocess.mjs](../scripts/audio-postprocess.mjs)：`createAudioPlan`、`validateAudioPlan`、`processAudioPlan`、`verifySourceTreatment`。
