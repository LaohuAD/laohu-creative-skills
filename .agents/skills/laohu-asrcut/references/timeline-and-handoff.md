# 剪后时间线、审阅页与交接

需要执行编辑操作、编译或冻结剪辑、做审阅页，或交付给动画与媒体适配时读取。以下契约决定谁写剪辑、怎样派生同一目标时钟、怎样复核与使用实际交付文件。

## 两份 JSON 的职责

edit-plan.json 保存项目与 revision、素材及原始识别、轨道、授权、`coverage`、`sequence`、删留理由、待确认项、口语修正、可选显示文字和局部旁注。源文件、原始 ASR 字节及相对引用按[输入证据](input-and-asr.md)复核。计划只有一份最终顺序，`/1` 收源 occurrence，`/2` 依交错次序收 source 与 presentation。

timeline.json 由 `compilePlan` 生成并保存目标映射、剪后时长、词/句与剪除清单、来源和问题。`timeline/2.units` 是连续的完整时间线。`clips` 仅是源出现实例视图，`/2` 中无源展示段可让 `clips` 的相邻范围之间有间隔。任何下游都直接读编译出的 `targetRange`。HTML、Motion、字幕与 Cap 采用同一时钟和顺序。

纸面偏移、虚拟留删和预计时长可以直接给审阅者。要报告时间线已编译，实际运行 `compile` 或 `compilePlan`，核验产物与当前 edit-plan 的项目、revision、计划哈希和编译样本，并给出实际文件或哈希。只需判断、仅有文本草表或无法运行编译器时，交付有证据支持的纸面结果，报告未编译。

`planSha256` 在稳定序列化时排除自身、`state`、`review` 和独立注释字段。`annotationSha256` 单独校验局部旁注。旧 `/1`、`/2` 按各自兼容格式消费。改变源证据、剪辑与显示决定须递增 revision 并重算剪辑哈希。写旁注沿用现有 revision 与剪辑哈希，更新注释哈希和编译后的旁注目标。

`state:draft|frozen` 记录当前计划状态。`review.status:not_requested|pending|approved|changes_requested` 记录审阅。批准指向 `approvedPlanSha256`，且须匹配当前 `planSha256`。可为获准的未批准版本制作技术审阅件，依赖正式批准的出口等对应记录成立后再做。旧 timeline、反馈和 cue 先核项目、revision、哈希、source ID/哈希和实际锚点。读取旁注时另外核 `annotationSha256`。

## 时钟与映射字段

源区间按 source 主音轨采样率记录整数半开 `[startSample,endSample)`，每个源区间带自己的 `sampleRateHz`。所有目标区间用统一的 `clock.sampleRateHz`，舍入信息见 `timeline.clock.quantization`。删除关闭目标时间，保留源内静默占其原有时间。真实同步偏移的方向在[输入时钟](input-and-asr.md#时间坐标与多轨来源)定义。未知偏移阻断依赖该轨的实体输出，主音频可独立完成的路径继续。

每个 clip 有实际 `occurrenceId`、`sourceId`、`coverageId`、源/目标范围和精度。每次源片段被播放都分配独立 occurrence。时间线的 `words` 用 `tokenId` 标识真实词和原文 `text`，确认过听音的修正附 `spokenText`。只有句段时间则读 `transcriptSegments` 的 `segmentId` 和 `utterance` 精度。候选修正仍在 `timeline.spokenCorrections`。

## 用编辑操作单修订计划

根据已做的剪辑判断填写 `format:"laohu.asrcut.edit-ops/1"`、`expectedRevision`、`expectedPlanSha256` 和 `operations`。只登记新的节奏档、停顿窗或语义节拍时可用空数组。操作执行后校验整词、全源覆盖、重复保留映射和已有权限。批次产出下一 revision 的 draft，旧批准状态随修订失效。目标为同目录新路径，才能保留媒体和转写相对引用。

| 操作 `op` | 除每项的 `id` 外所需内容 |
|---|---|
| `delete-range` | `sourceId`、`sourceRange:{startSample,endSample,sampleRateHz}`、`reason`。重复删除另带 `relation:"repeated-content"`、`keptOccurrenceIds` 和 `keptTokenIds`。 |
| `trim-pause` | 同样的源删除范围与理由，并带完整实源 `pauseRange`、语义 `pauseKind` 和对应 `--silence-map`。自然微停顿例外仅用经核实的 `pauseException:"retake-adjacent"` 或 `"speech-error-adjacent"`。 |
| `reorder` | `occurrenceIds` 为当前所有 source occurrence 的准确新排列，带 `reason`，计划记录实际重排授权。 |
| `repeat` | `occurrenceId`、新的 `newOccurrenceId` 与 `reason`，在所选实例之后添加一次播放，计划记录独立重复授权。 |
| `spoken-correction` | `sourceId`、`segmentId`、可选 `tokenId`、`spokenText`，默认写候选。真实核听后可用 `status:"confirmed"` 和 `verification:{method:"audio-listening",listeningStatus:"listened",sourceRange,reviewedBy,sourceSha256,alignmentStatus?}`，哈希与范围须精确匹配。 |
| `set-display-text` | `segmentId`、`text` 与可选 `tokenIds`，只改独立显示文字。 |

选取节目样段时，`delete-range` 可以移除完整的原源前缀或后缀。若切在原来的微停顿内，保留下来的边界须是节目唯一的首个或最后一个原声边缘，并由 `--silence-map` 证明所选样本处在同源低能量窗内。只收紧一个语音间隙时走 `trim-pause`。两侧都保留的语流仍按微停顿规则检查。已经标明功能的范围始终保护，修订操作保留已确认的保护标记及其范围。

编辑操作可附实际观察得到的 `visualSeamRisk` 与 `visualMaskHint`。计划可保存 `pacingProfile` 和 `pauseWindows:[{id,sourceId,sourceRange,pauseKind,reason,function?}]`。`pauseKind` 可为 `head`、`tail`、`micro`、`clause`、`sentence`、`paragraph` 或 `emphasis`。功能保护分别为 `emotional-beat`、`system-sound`、`visual-action`、`user-locked`、`visual-comprehension`。

语义节拍用 `narrativeBeats:[{id,sourceId,segmentIds,role}]`，同一节拍的片段在真实源内连续，避免重复绑定。工程字段见 [ASRcut Schema](../schemas/asrcut.schema.json)。

```bash
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs apply-edits \
  --plan edit-plan.json --ops edit-ops.json --out revised-plan.json
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs validate --plan revised-plan.json
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs compile --plan revised-plan.json --out timeline.json
```

`trim-pause` 给与当前源和 plan 对应的 `--silence-map silence-map.json`。该探针也用于在节目真实首尾的微停顿内落剪。

当已复核的情况需要调整默认保留窗时，在 `trim-pause` 加 `verification`，随新决定记为 `pauseVerification`。

| 已证实的调整理由 | `verification` 字段 |
|---|---|
| 核听发现实际干扰 | `method:"audio-listening"`、`listeningStatus:"listened"`、`reviewedBy`、具体 `finding`、`sourceSha256`、与删除区完全相符的 `sourceRange`。移除干扰时，两端落在同源实测低能量窗内。 |
| 用户为该处另定气口 | `method:"user-direction"`、`userNoteId`、该同源相邻备注内的原句 `excerpt`、`sourceSha256`、完整实测窗 `sourceRange`、剪后实际保留的 `targetDurationSamples`。 |

证据只适用于当次剪口。词边界和既有功能保护仍先行，机械核对只确认所记录的范围、来源、必要字段和可复现探针。

在同目录更新主 plan 才显式加 `--update-plan`。真实路径、符号链接与设备/inode 检查会阻断保护输入的别名。保留先前实际内容的恢复位置。

### 恢复一条已经确认撤回的删除

从当前计划查被撤回决定的 `decisionId`，恢复其一条完整删除范围。用 `delete-range` 加 `restore:true` 与 `revertedFromDecisionId`。程序只在原序位置可唯一定位时恢复，新增保留决定并保留旧删理由。若一个决定涉及多条当前区间，先审清需要恢复的具体区间再写操作单。

以下从当前计划取准确哈希与范围，写一份新操作单。先将命令中的计划名、决定 ID 和理由替换为实际选定值。

```bash
node --input-type=module - revised-plan.json delete-draft-1 '恢复此句，保留操作条件' restore-ops.json <<'JS'
import {readFile, writeFile} from 'node:fs/promises';

const [planPath, decisionId, reason, outPath] = process.argv.slice(2);
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const matches = plan.coverage.filter(
  row => row.disposition === 'delete' && row.decisionId === decisionId
);
if (matches.length !== 1) throw new Error('请选定恰好一条当前删除范围');
const [{sourceId, sourceRange}] = matches;
const revision = plan.project.revision;
const spec = {
  format: 'laohu.asrcut.edit-ops/1',
  expectedRevision: revision,
  expectedPlanSha256: plan.integrity.planSha256,
  operations: [{
    op: 'delete-range', id: `restore-${decisionId}-r${revision + 1}`, sourceId, sourceRange,
    reason, restore: true, revertedFromDecisionId: decisionId
  }]
};
await writeFile(outPath, JSON.stringify(spec, null, 2) + '\n', {flag: 'wx'});
JS
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs apply-edits \
  --plan revised-plan.json --ops restore-ops.json --out restored-plan.json
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs compile \
  --plan restored-plan.json --out restored-timeline.json
```

核对新 revision 的实际恢复范围，再更新审阅件、原有字幕和动画锚点。其他回退按已验证的来源形成新的当前 revision，保留当次原因与依据。

## 无源展示时段

有已授权的完整声画制作，观众还要读图、等待操作结果或看结尾定格时，先扣减**同版剪后源音已保留且实际可用**的停顿，再为缺口安排独立 presentation。用户锁定原音或总长时先处理冲突。ASR/SRT 空隙不能证明可消费时窗。

每项 presentation 带稳定 `id`、`decisionId`、`reason`、`sceneId`、正整数项目样本数 `durationSamples`。填写 `visualHandoff` 的 `focus`、`entryState`、`exitCondition`，以及 `audioHandoff` 的 `role`、`rationale`。声音 handoff 交代配乐、让位、SFX 或安静窗口。真实混音按最终交付验证。

`insert-presentation` 的 spec 以 `expectedRevision` 和当前 64 位小写 `expectedPlanSha256` 绑定版本。定位字段择一使用现有 `afterOccurrenceId`，或 `position:"before-first" | "after-last"`。定位字段用于生成最终 `sequence`。整条时间线至少有一个真实 source。presentation 用自己的 ID 和正整数目标长度，源区间、词、occurrence 均来自真正的 source。

```bash
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs insert-presentation \
  --plan edit-plan.json --spec presentation.json --out revised-plan.json --authorize-presentation-timing
```

`presentationTiming` 记录已成立的授权。编辑后按新 revision 重编所有受影响的词、字幕、动画和媒体派生文件。冻结后新增时长仍返回 plan 作者处理。多源先合并素材再安排展示段。单 plan 的 `/2` merge 保留 sequence，多个 plan 的 merge 会拒绝含 presentation 的输入。

### 语义字幕编译

按[字幕设计与编译](captions.md)从 canonical timeline 生成独立的 manifest 和同源 SRT。

## HTML 视图与反馈

由 [laohu-htmlshow](../../laohu-htmlshow/SKILL.md) 用实际 plan 和它编译出的同版 timeline 制作本地可打开的 `review.html`。默认显示按剪后顺序排列的保留内容、目标时间和主要未决点。允许展开查看源文件/录制段、原顺序/原时间与完整原句，实际显示层另列。对句段级证据显示句段范围。

原顺序视图在被删表示处用删除线保留原文，旁边显示实际源范围、`coverageId`、`decisionId`、原因、重剪比例和对应保留实例。提供可扫读的改动清单，标出节奏档、原/目标停顿差、未确认切点与已观察跳剪风险。重排前后位置和未获准建议分别写实际状态。标记撤回时让读者看到原决定、恢复的范围与当次理由。

已存在的 `annotations[]` 以稳定 ID 定位。`userNote` 对应用户备注，`analysisNote` 对应分析，`motionDirection`、`motionBinding` 只用于局部真实 consumer。页面依编译后的 `resolvedTargets` 标出当前保留位置，未保留时显示 `not-in-retained-timeline`。完整动画导演设计仍归唯一 `brief.md`。注释只改本职责内字段，以 `annotate --plan ... --annotation annotation.json --out ...` 更新注释哈希。键可用 `id`、`sourceId`、`segmentId`、可选 `tokenId`、可选 `occurrenceId` 及现有职责字段。

`/2` 的 presentation 行显示目标范围、`presentationId`、场景、观看预算与音画 handoff，注明这段没有源录音。原音区间和剪后接头用两个独立控件，分别指向已核实可访问的实际媒体。缺哪份媒体就说明原因并禁用相应控件；虚拟拼接、波形和 SRT 不能作为媒体播放。

可保存的审阅反馈带项目 ID、revision、`planSha256`。注释同时带 `annotationSha256` 和注释 ID。source 针对实际 `occurrenceId`，词/句再给 `tokenId` 或 `segmentId`。presentation 用 `presentationId` 与边界/范围。删段用 `coverageId` 或 `decisionId` 加源范围。过期、歧义或缺绑定反馈先列待查，编辑者复核后更新。HTML 的反馈动作只输出反馈材料，计划修改和正式批准均在对应的版本记录中完成。

## 已处理声音源的绑定

按[独立口播修音](audio-postproduction.md)执行。已获准的连续源处理接回剪辑时，`export-audio` 成套传 `--audio-plan`、`--processed-source` 和 `--audio-receipt`。当前支持一个完全绑定的源。对上来源 ID、原声 SHA、处理源 SHA、采样数、时钟、声道及补偿记录再用原时间线裁切。绑定剪后整轨的模式另核被冻结的计划、canonical timeline、原 artifact receipt 与项目身份；它的处理能力见声音 Reference。

处理方案只更新自己的方案/回执。计划、时间线或相应回执更新时，先复核绑定。导出回执保留原源、处理源、audio-plan 和处理 receipt 的各自哈希，注明 `renderedBeforeTimelineRanges=true` 与 `existing-compiled-source-ranges`。按实际绑定结果向后续交付。

## 音频、视频与交换导出

核对冻结计划与其 canonical timeline、源媒体与原始转写哈希、完整覆盖、真实时钟和阻断问题。WAV 与视频需要已经建立的 `authorization.mediaExport`，可在[导入](input-and-asr.md#导入时保留实际输入证据)按实际授权显式记录。新媒体、回执和同盘临时文件避开任何输入或既有产物。选用所需命令，给每一版新的输出名；下面假定本轮尚未写过这些文件。

```bash
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs freeze --plan revised-plan.json --out frozen-plan.json
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs compile --plan frozen-plan.json --out timeline.json
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs export-audio \
  --plan frozen-plan.json --timeline timeline.json --out cut.wav --seam-fade-ms 15
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs extract-seams \
  --plan frozen-plan.json --timeline timeline.json --audio cut.wav --out-dir seams
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs export-video \
  --plan frozen-plan.json --timeline timeline.json --fps 30 --audio cut.wav \
  --audio-receipt cut.wav.artifact.json --out cut.mov
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs export-nle \
  --plan frozen-plan.json --timeline timeline.json --fps 30 --format fcpxml --out edit.fcpxml
```

- **WAV。** 新 PCM 由源区间裁切、重采样并拼接。可选 `--seam-fade-ms 0..30` 默认 0，作用在不连续的实源接头。可试听 10–15 ms 候选，根据爆音、底声与语音边缘调整。等长淡入淡出保持目标样本数。WAV 回执记录输出哈希、对应计划、样本数、操作与 `auditionStatus=not_auditioned`。整条新音轨播一次。`/2` 回执还列 `units` 和保守的 source `voiceWindows`，其中可能包含原有安静，真实语音活动另按证据判断。
- **无源时段的音频。** 未另做底声安排时，WAV 在 presentation 区间写入该时段精确的零样本，不要求成片最终混音全静音。确需底声补桥时，成套给 `--room-tone request.json --silence-map silence-map.json --authorize-room-tone`。请求含 `format:"laohu.asrcut.room-tone/1"`、`projectId`、`revision`、`planSha256` 和 `replacements:[{presentationId,sourceId,roomToneSourceRange}]`。每个替换取相邻保留源主轨经核实的等长区间，独立记入回执。
- **逐缝片段。** `extract-seams` 从与冻结 plan/timeline 匹配的 `--audio` 和 `--audio-receipt`（默认 `cut.wav.artifact.json`）向新目录写 WAV 与 `seams-manifest.json`。连续同源范围无需标缝。清单记录计划、时间线、WAV 与回执的哈希，每行附 `targetSample`、`targetRange`、`seamOffsetSamples` 和 `wavSha256`。按[逐缝核实](editing.md#剪后逐缝核实)记录实际听过的接头。
- **视频。** 使用已核实的轨道与主音轨偏移，按累计绝对目标时间量化帧边界。帧率可用整数或分数如 `30000/1001`。多个视频流时，先在计划把偏移绑到正确的全局流索引，执行行可再用 `--video-streams` 选取，值为逗号分隔的 `sourceId=全局视频流索引`。给已验证的剪后 `--audio` 与 `--audio-receipt`，或提交连续修音三件套，也可直接从冻结计划渲染原音。新 MOV 的 `.video-artifact.json` 记录分数帧率、实际帧数、量化映射、音频样本与尾帧差值。无源时段用黑帧占位，查看与试听的初始状态分别为 `not_viewed` 和 `not_auditioned`。
- **交换文件。** 从同一冻结 timeline 生成 `fcpxml`、`edl` 或 `otio`，无需先渲染媒体。FCPXML 1.10 的视频、标记与可编辑选定主音轨按帧交接；OTIO 用独立视频与主音轨，保存主声轨的样本定时及流索引元数据。CMX 3600 按单视频轨与源/项目同帧率写帧事件、LOC 标记及黑场占位，NDF，最多 999 个事件。Cap EDL 遇到 `/2` presentation 会拒绝。交换文件是否在指定编辑器回链、导入和编辑，由实际应用核对。

## 动画交接

交冻结版 plan 与 canonical timeline；如需语义节拍、自然停顿窗和风险摘要，再派生只读 `animation-handoff.json`。

```bash
node .agents/skills/laohu-asrcut/scripts/asrcut.mjs export-handoff \
  --plan frozen-plan.json --timeline timeline.json --out animation-handoff.json
```

源探针已对上项目、计划和媒体时可附 `--silence-map`。编辑后按最新计划重跑探针。摘要 `laohu.asrcut.animation-handoff/1` 绑定项目、revision、`planSha256`、实际 timeline 文件 SHA-256 与项目时钟，带探针时记录 `silenceProbe`。派生摘要保持 timeline 原字节。

`narrativeBeats` 带已确认叙述作用和目标范围。 `availablePauseWindows` 只列有作者语义分类与探针证据、剪后至少 0.45 s 的窗，未提供相应探针时为空。 `visualCueCandidates` 与 `visualSeamRisks` 交出真实词/出现实例和接缝。辅助分析可进一步核实真实音画。

Analysis 把实际能用的窗口带进唯一 `brief.md`。Motion production plan `/4`、`/5` 的 `inputs.asrcut.animationHandoff` 可带 `{path,sha256}`，该摘要绑定探针时另附 `silenceMap:{path,sha256}`。Motion 依真实保留实例与词/句锚接入，实测或可信对齐时间可作词动作锚，`estimated` 或 `utterance` 用于接受较低精度的讲述范围。独立展示的镜头锚用 `presentationId` 和 start/end edge。发现时长不足时给 plan 作者真实边界与净新增预算，再按新版本编译。

## 脚本接口

[asrcut.mjs](../scripts/asrcut.mjs) 的既有 API 包括 `importAsrJson(raw,options)`、`importSrt(text,options)`、`mergePlans(plans,{projectId,sourceOrder})`、`upsertAnnotation`、`insertPresentationInterval(plan,spec,{authorized})`、`verifyPlanEvidence(plan,{baseDir})`、`validatePlan`、`hashPlan`、`compilePlan`、`freezePlan`、`authorizeReview` 和 `exportAudio(options)`。调用 import API 时可将本轮已核授权作为 `options.authorization`。CLI 写入层检查原件与输出别名；API 操作返回数据对象时由调用方执行安全写入。原始证据复核按 plan 所在目录解析。

音频 API 在 [audio-postprocess.mjs](../scripts/audio-postprocess.mjs)，识别 provider API 在[输入与识别](input-and-asr.md)。CLI 使用实际工作目录中的材料与独立输出，媒体导出时确定 `--tmp-dir` 位于同盘。
