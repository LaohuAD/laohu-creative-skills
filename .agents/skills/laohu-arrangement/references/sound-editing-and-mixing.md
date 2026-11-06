# 视听声音设计与源音频处理

本 Reference 承接动画、视频及 Motion 已获授权范围内的整片声音工作。先确定观众需要听到什么、声音如何随内容展开，再选实际音乐/SFX/环境源并剪辑；最后由负责视听作品的主线接入现有计划和唯一最终混音器。它不默认创作歌曲、配乐流派或大量音效，也不把技术回执当作听审证据。

## 输入与返回

输入来自同一画面/声音事件表：段落任务、对象与视觉事件、共享事件 ID 和时钟，旁白/对白版本、既有锁定音轨、可用授权素材、目标交付与实际播放场景。Motion 已承担的完整声音职责已包含调用此方法的授权；不再要求用户另选 Arrangement 或重复授权。

返回整片声音职责与前/中/后结构、事件的声部安排、来源/许可、实际源区间、剪辑/变换、命中点换算、候选状态和待听审问题。具体 cue 继续使用 Motion 的 canonical 事件和 `audio-plan.v1`；Motion 保留画面/全片节奏与最终 `audio.mjs` 混音，不另造电影时钟、计划格式或第二混音器。视听声音设计若用户没有要求完整作曲/编曲，不交独立歌曲或乐谱。

## 为一般配乐请求先选适配的来源产品/风格，不默认写 ABC

先确认用户要的是新配乐、已存在的 BGM，还是具体旋律/谱面控制。若任务需要新配乐，且固定 Huashu Motion 源码中有适用 `PRODUCTS` 或 `resolveStyle` 预设，走 `.agents/skills/laohu-motion/scripts/huashu-audio.mjs render` 的 request `/2` `musicPreset` 分支：从真实 `PRODUCTS` 选择匹配的 product；没有合适 product 时，从真实 resolver 支持的 style 选择。按本案的节奏、段落职责、密度/能量和共享事件编译 `sections`、drop/end event IDs 与 seed，调用已 pin 的 `score.plan`/`score.renderScore` 输出 music-only stem。无需让用户先认领模板或重复授权，不把普通“做段音乐/配乐样片”自动改成 ABC 谱面任务。

有适配当前目标的成熟来源预设时，普通新配乐优先选用该来源，不为使用 ABC 绕开复用。只有用户明确指定 ABC/具体音符/旋律/谱面/具名 mark、hit 或 rise 控制，或负责作者为实现已定听觉目标确认确需这些具体控制时，才使用现有 `/1` ABC composer 路径；它仍按 `scoreText`、hash 和共享事件绑定规则执行。没有适用来源预设时，按本任务授权与已定目标继续作现成选材或原创判断，不要求用户先提供音符。已有且有授权的合适 BGM 可继续作为声音来源，不必为了用预设而重做。若请求明确锁定某曲或锁定内容不得改动，就只沿许可范围使用；预设、ABC 和对已有轨道的修改都是来源/方法选择，不是绕过锁定项的授权。

新生成的预设 stem 保留源音乐分支在 `score.renderScore` 后的 `pump`、style reverb、drop `buildSweep`、`rideEnergy`、event `automate`、源 fade、style `master`、`balanceLows` 的处理次序；这些是该 preset 的编曲音色/动态组成，不可删掉后仍声称复用了原 preset。adapter 只迁入必要私有函数片段并绑定本地 DSP，不把 private 函数说成可 import export，也不接管 `sound.mixdown`。源 voice-duck 不运行，旁白 duck 唯一留在 Motion `audio.mjs` 的 `voiceWindows`；最终混音也只调用该 consumer。输出 music-only 48 kHz float stereo 的 exact-duration stem，并作为现有 plan 唯一 music track，不把含旁白的整片 mixdown 塞进音乐轨。

对已选现成 BGM 的 `/2 selectedMusicTrackId` 派生分支，按同一 `audio-plan.v1` 保留音轨源区间、`sourceInSec`、`sourceOutSec`、速度和 `timeMap` 映射；只做段落能量与事件命中动态。不把新生成预设的 reverb、buildSweep、style fade、master、balanceLows 染到完整 BGM。该分支也不跑源 voice-duck；若已有同事件或时间重叠的手工 music automation，就整项抑制相应派生 duck，不叠加两次压低。锁定轨只允许只读测量，不能生成替代/派生轨或写回。

录音样本不是默认设置。只有已明确选择录音样本来源并取得可用于本项目的包时，才在 `/2` 请求中显式传 `samples:{mode:"recorded-required",packDir:"<项目内绝对路径>"}`；首次 import 前必须指向该 project pack，禁止 home 缓存回退。adapter 验证 v2 manifest、所需 instrument IDs、完整样本/释放层文件、hash、署名与许可、音频元数据及完整解码；任何必需文件未覆盖、解码空/失败或 hash 不符都拒绝该生成。`samples build` 只在明确选择构建且获准后运行 pin 的 `buildSamples({out,only,log})`；它会从上游来源下载文件，必须使用项目内输出目录并检查 builder 实际 manifest，未知 ID 或生成失败不能报成功。回执将 runtime 实际 decoded files 与 note/release 层实际选择分开，并给每项实际文件对应的 hash；未被使用的预检候选不标成已用。

`musicPreset.samples` 仅作用于新生成的音乐 stem。无论同一请求中是否提供该包，SFX 都要经独立的 pinned synth-off runtime 运行原 `SFX`/`KITS` 函数：在首次 import 前设 `OM_SAMPLES=off`、关闭 recorded-required，预先将该 runtime 的 sample cache 置空，再恢复调用者环境。不要把音乐 pack、模块缓存或其 decoded-file receipt 共享给 SFX；分别记录音乐实际使用的录音样本和 SFX 未读取 recorded pack 的事实。

## 选择强拍音乐的拍网格只读分析并对最终封装回测

只有当 BGM 已被选择且它确实是明显强拍音乐、用户或已确认蓝图要求画面切点/事件跟随拍点时，才用 `.agents/skills/laohu-arrangement/scripts/laohu-beat-grid.py`；不因任何任务有音乐就强制分析拍点。以现有 `audio-plan.v1` 为唯一输入，按明确 `trackId` 重验计划 hash、音源 hash，从 `sourceInSec/sourceOutSec` 裁出该 track 后，以 `source file sec → source-relative sec → track-local sec → film-global sec` 映射检测拍点。锁定 BGM 可做只读分析并在回执保留 locked 状态；修改被锁定的轨道仍拒绝。所有数值沿用已建 plan 时间与 `timeMap`，不创建第二音频计划或电影时钟。

节拍检测沿用锁定依赖 `scripts/beat-grid-requirements.lock` 中的 librosa、numpy、scipy 与 soundfile；应在项目外接盘上的隔离 Python 环境运行。缺库时报告依赖阻断，不用标准库近似节拍或频谱算法替代。对原始检测到的 beat sequence 用最小二乘拟合 `t_i=t0+i*T`；tempo scalar 只作诊断，不用一个 BPM 数字替代拟合。比较 0.5x、1x、2x 候选（含半速/倍速相位）并保存获胜依据；`match` 表示“候选网格拍点命中真实 kick 瞬态的比例”，`kickTransientCoverage` 是相反方向的独立本地指标，两者不能混名。保留平均偏移、偏移方向、累计漂移、首拍有效性与残差；全混音网格质量差或拟合最大残差大于 15 ms 时按来源条件试作 HPSS percussive 版本，并记录哪种信号/候选胜出。

整体拟合最大残差超过 15 ms 时，再用重叠的 16 拍窗口、8 拍步长各自最小二乘拟合局部 BPM，作为变速诊断候选；这些拟合只报告，不悄悄拼接为一条新全局网格或改动原音频。另一个 8 拍窗口的 RMS/kick-density `sections` 只是能量段落候选，不是 tempo segmentation，也不等于自动 break/drop 或剪切点。拍点、频带 transient、RMS、section 都是供 Motion/剪辑人工采用的候选池；不得自动新建 SFX/冲击事件，不因每个 kick 都有 transient 就机械打点。

完成成片后，使用 `verify-render` 对真正输出的 MP4/MOV 音频流 `0:a:0` 解码到项目内临时 float PCM，再对该解码音频独立检测拍网格/频带瞬态。输入时间戳必须以 `-copyts` 保留；读取实际 video stream `start_time`，将音频 PTS 减去该值，再以 `aresample=async=1:first_pts=0` 生成以影片画面零点为 sample-index 0 的 PCM，保留前导静默和内部 PTS 缺口。回执分别记录 packet/frame PTS 跳跃、估算补入的静默区间与实际解码帧数；估算填静默是时钟恢复，不得报作编码文件中的原始 payload。若实际音轨早于画面结束，不把缺失尾部补成音频。映射到影片的参考 beats/events 直接与该 video-relative PCM 测量比较，不再额外加一次 audio stream offset。工具重验此前参考 JSON 的 audio-plan 与源资产 hash，记录编解码、音轨偏移、有效时长、正反向偏移、平均误差、匹配覆盖与漂移。所选网格只表示数值候选；beat 周期和同类 nearest transient 具有整拍/半拍别名，双向平均残差不是唯一的绝对 source-to-mux 音轨偏移。若任一方向为零匹配，结果须标记 `unresolved/review-required`，不能报告相位对齐；保留全部方向的误差与匹配数以便检查。不能只重跑原 BGM asset 分析并称作渲后回测；也不设未经确认的全局通过阈值。beat grid 用于判断实际同步是否值得采用，不自动改动锁定 ASR、移动语义事件、改音轨或新建 film plan；same-kind 频带峰值只是假定的声学候选，不证明物理碰撞/画面含义。工具结果为技术测量，听感仍须真实播放和听审。

分析命令读取现有 plan，输出写入同一工作项目内新的缓存 JSON；渲后命令的 `--reference` 必须是前一步的 map 结果，`--render` 是实际已编码成片：

```sh
mkdir -p "$WORK_ROOT/.cache/tmp"
export TMPDIR="$WORK_ROOT/.cache/tmp"
# 首次准备本轮隔离环境时运行；环境与 pip 缓存都在工作项目内。
python3 -m venv "$WORK_ROOT/.cache/tmp/beat-venv"
export BEAT_PYTHON="$WORK_ROOT/.cache/tmp/beat-venv/bin/python"
PIP_CACHE_DIR="$WORK_ROOT/.cache/tmp/pip-cache" "$BEAT_PYTHON" -m pip install \
  -r "$PROJECT_ROOT/.agents/skills/laohu-arrangement/scripts/beat-grid-requirements.lock"

"$BEAT_PYTHON" "$PROJECT_ROOT/.agents/skills/laohu-arrangement/scripts/laohu-beat-grid.py" analyze \
  --plan "$WORK_ROOT/audio-plan.generated.json" --track-id "$MUSIC_TRACK_ID" \
  --output "$WORK_ROOT/.cache/tmp/beat-grid.json" --project-root "$WORK_ROOT"
"$BEAT_PYTHON" "$PROJECT_ROOT/.agents/skills/laohu-arrangement/scripts/laohu-beat-grid.py" verify-render \
  --reference "$WORK_ROOT/.cache/tmp/beat-grid.json" --render "$WORK_ROOT/final.mp4" \
  --output "$WORK_ROOT/.cache/tmp/render-beat-check.json" --project-root "$WORK_ROOT"
```

## 先决定整段听觉方向与前中后结构，再选择单个 cue

先听当前素材与已锁定轨，判断成片的听觉中心、前段如何建立、中段如何发展、结尾如何落定；为旁白、音乐、动作声、环境声和安静分别定职责。无旁白不自动要求音乐，题材不自动决定流派。安静、留白与有意硬切都可以承担结构作用，不必为了填满时长持续铺床或为每个动作加声。

再按画面真实运动选事件相位：起动、速度峰、接触、关系显现/揭示、状态结果。声音提前引导或延后回应时，说清它指向哪一相位，并沿用对应的 event ID/时钟。不要把画面事件的 `start` 当成默认 hitpoint，也不要从另一份手工时间表抄 cue 秒数。若任务复用/更新 Motion 工程，按 [Motion cue 与视觉相位契约](../../laohu-motion/references/sound-design.md#3-让-cue-与动画共用一个时间事实) 交接：旧 `audioEvents` ID、秒数和 `kind` 是既有锚点/候选，不是动作证据；Motion 据当前 renderer 核准目标相位。Arrangement 返回相符的声音角色及素材源 `sync.at`/hitPoint、变速换算依据，由 Motion 沿现有 phase/offset/timeMap 得出最终 cue；不在 Arrangement 另建时间表。详细判据以 Motion 契约为唯一真源。

按本案真实需要检查用途、播放设备、听觉中心、锁定音轨、前中后结构、旁白保护、音乐/SFX/环境声与安静、画面相位、材质/重量、源起音/主体/尾巴、重复/乐句与接缝，以及混音上下文。它们是用于补足判断的视角，不是固定问卷、逐项必填的表或 16 份文件。

## 从真实素材的起音、主体和尾巴选段，不从文件名或波形猜听感

先听项目内已授权源和已登记候选，必要时再按动作、接触面、材质、重量、强度、速度和持续时间检索外部候选。逐个核对授权、文件 hash、格式、实测时长与来源；预览、搜索标签和自动起音估算只能缩小范围，不能证明适合当前画面。

听素材时分辨它的起音速度和形状、主体是撞击/摩擦/气流/共振/音高还是噪声、尾巴如何衰减或带有空间。选择能带出当前材质和力量的那段真实声音：保留必要的前置动作、核心接触和有用尾音，删掉多余部分。若素材的主要动作对但尾音不合，可以裁切、淡化或少量叠层；若核心质感、方向或重量仍不匹配，换一个候选或在明确缺口下原创。不要把所有动作都变成相同正弦提示或任意噪声。

重复声音时考虑音色/节奏如何维持对象身份、又怎样表达阶段变化。循环是否成立取决于完整乐句、和声关系、尾音与下一次进入是否让人愿意连续听；技术上消除一个点击或幅度断差，只证明接缝数值较平顺，不证明音乐句法成立。可以选择不循环、让尾音结束、硬切或静默。

## 用 audio-edit 生成派生源 WAV，不代替电影时间线和最终混音

当需要从授权 WAV 裁切、淡化、作技术交叉循环或组合少数必要声源时，使用 `scripts/audio-edit.mjs`。它产出 48 kHz 双声道 float PCM WAV 与回执，记录源文件 hash、编辑参数、输出 hash/时长/峰值和按参数推导的 hitpoint。回执中的 hitpoint 是几何时间换算，不是瞬态识别器测得的真实峰值；需要画面准确命中时，结合实际试听修正 Motion cue。

输入为 JSON spec。`file` 相对 spec 文件目录；`sourceInSec`/`sourceOutSec` 是源 WAV 中绝对秒数；`startSec` 是各层在这个派生声音文件内的相对起点，不是影片时间；`hitPointsSec` 是源文件内待映射点。`tempo` 使用 FFmpeg `atempo`，改变速度但尽量保持音高；`playbackRate` 以重采样率改变速度和音高。二者互斥。`repeatCount` 与 `crossfadeSec` 只创建技术性重复/交叉淡化，音乐是否可循环仍须按整句、和声、尾音和长时间重复听审。

示例 spec（`file` 必须替换为本轮获授权 `WORK_ROOT` 下该源 WAV 的实际绝对路径；它相对 spec 文件解析，而 spec 位于 `TASK_TMP_DIR`）：

```json
{
  "schemaVersion": 1,
  "layers": [
    {
      "id": "cloth-contact",
      "file": "/authorized/work/project/assets/audio/source/cloth-contact.wav",
      "sourceInSec": 0.08,
      "sourceOutSec": 0.54,
      "startSec": 0,
      "gainDb": -2,
      "fadeInSec": 0.015,
      "fadeOutSec": 0.12,
      "tempo": 1,
      "repeatCount": 1,
      "hitPointsSec": [0.21]
    }
  ]
}
```

按 runtime 获取真实 `WORK_ROOT`、由其承接的授权 `TASK_TMP_DIR`，并确认 `MOTION_FFMPEG` 指向可用的 FFmpeg。`SKILL_DIR` 来自 Arrangement 真正安装目录；只从它定位脚本，源文件和交付则落在本轮授权工作工程：

```sh
node "$SKILL_DIR/scripts/audio-edit.mjs" \
  --spec "$TASK_TMP_DIR/source-edit.json" \
  --output "$WORK_ROOT/assets/audio/derived/cloth-contact-edit.wav" \
  --receipt "$WORK_ROOT/assets/audio/derived/cloth-contact-edit.receipt.json" \
  --tmp-dir "$TASK_TMP_DIR/audio-edit" \
  --ffmpeg "$MOTION_FFMPEG"
```

工具仅支持 PCM/float WAV 输入、1–8 个源层及已列出的编辑字段；它不负责自动响度归一、限制峰值、降噪、混响、频段塑形或全片自动化。已匹配的 OGG/MP3 等其他格式不应因此放弃：保留原件不变，用现有 FFmpeg 解码为工作工程内 PCM float WAV 后再编辑；记录原文件 hash/许可、输入 codec/实测时长、实际解码命令、派生 WAV hash/时长和输出路径。解码只避免再经有损编码，不是恢复原编码丢失的信息；禁止只改扩展名冒充转换。叠层可能产生高于满幅的峰值；float 输出会保留这些数值并由回执报告，不静默削波，也不替作者自动压低。需据实际听审决定是否调增益及怎样进入最终导出。

派生文件仍为 `candidate-unreviewed`。哈希、许可、时长、波形、peak 或 loop 交叉淡化通过都不能升级 `ready`；只有对实际派生文件 hash、完整时长和当前使用语境完成真实试听，才可登记相符审核。公共索引里的 Kenney 候选及任何新下载也保持原审核状态，不能批量升级。

## 回到 Motion 的唯一计划：保护首字、短停顿、锁定轨和同一时钟

把音乐、SFX、环境声、旁白与安静安排回同一段落/事件蓝图，确保主线仍能解释声音为何在此处开始、让位、恢复或结束。Motion 计划只接受实际已实现的字段。`audio-plan.v1` 的 `track.loop:true` 会明确拒绝；循环源应先按音乐意图通过 `audio-edit.mjs` 制作成派生源。Motion 的 `speed` 使用音高保持的 `atempo`，不等于变调的 `playbackRate`；Motion 计划显式传 `playbackRate` 也会拒绝。

`ducking.preRollSec` 将音乐压低的 attack 起点提前到 voiceWindow 前；`holdSec` 将恢复过程延至 voiceWindow 结束后，适合保护首字和保持短空隙中的让位。preRoll 应足以让指定 attack 在首字前达到目标；未提供两字段时沿用旧 attack/release 行为。缺省不强加 ducking；普通语音停顿不自动升起 BGM，只有蓝图明确选择短空隙保持压低时才设 hold。锁定轨不能裁切、变速、加减益、淡入淡出、loop 或套用 ducking/automation。

audio-plan/1 只接受当前 consumer 实现的 `targetGainDb`、`attackSec`、`releaseSec`、`preRollSec` 与 `holdSec` ducking 参数；未知 ducking 键和未实现的 Motion plan 顶层连续控制/房间处理会拒绝，不得写字段后假设已生效。资产 metadata 的 `processing` 仍是素材描述，不等于 plan 处理接口。Huashu 音效生成分支现有的 `sourcePan` 仍可在源码支持的源生成阶段使用；这不是 Motion audio-plan 的连续声像控制，也不由本 Reference 否定。ASRcut 冻结语音、revision/hash、source targetRange 与编译时间轴原样继承，不手改、不另造时钟。

## 听实际派生源和全片混音，再报告证据范围

对导出的源 WAV 先正常速度听选段、转变、尾巴、叠层和技术循环；按真实用途再听长时间重复、手机扬声器、单声道折叠，并在旁白/对白实际上下文检查信息遮蔽。听感不合就返回剪辑/选材决定，不能因回执通过而结束。

全片最终混音由 Motion 以唯一 `scripts/audio.mjs` 消费 `audio-plan.v1` 完成；对声画相位、旁白清晰度、音乐进退、SFX 落点、整体舒适度、静音与结尾进行正常速度顺播及合适设备检查。制作人负责报告真实源文件、来源/许可、hash、回执、实际试听者和范围、计划字段与未听审状态；接口通过、计划接受、FFmpeg 编码或媒体流存在只证明技术进度，不证明听感合格。
