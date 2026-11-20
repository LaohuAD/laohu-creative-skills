# 视听声音设计与源音频处理

本 Reference 承接动画、视频及 Motion 已获授权范围内的整片声音工作。先确定观众需要听到什么、声音如何随内容展开，再选实际音乐/SFX/环境源并剪辑；由 Motion 按当前工程选定一条最终混音/导出路径。新 Showreel 的成品计划由薄入口交给现有 audio-plan consumer，工作区编辑后以当前会话混音导出；既有 Remotion/Film 继续沿各自消费者维护。它不默认创作歌曲、配乐流派或大量音效，也不把技术回执当作听审证据。

### 音量自动化字段语义与跨曲拼接

Motion `audio-plan.v1` 的既有 `automation.gainDb` 是兼容字段：它表示叠加在未锁定音乐轨 `tracks[].gainDb` 上的 dB 增量，不是该音轨的新目标总增益，也不是 dBFS/LUFS。新计划需区分 `deltaGainDb` 与 `targetGainDb`，且一条自动化只能有一个增益字段：`deltaGainDb` 表示基础轨增益之上的改变，可选 `trackId` 仅作用于那一轨；`targetGainDb` 必须有 `trackId`，表示该轨自动化生效时希望达到的应用后源轨增益。例：基础轨为 −13 dB，自动化目标为 −19 dB，实际增量是 −6 dB。目标值不可与其它对同轨、同一时间重叠的自动化叠加；要切换目标时先结束前一段，再按真实时间明确新值。锁定轨保持不动。`fadeInSec`/`fadeOutSec` 只平滑进入/退出该自动化；不改变字段的单位和含义。峰值、响度测量与源轨增益是不同量纲，不可以互相代填。

多首音乐在画面段落间交接时，以每条真实来源独立建 layer，设置 source 区间与成片 `startSec`；先按真实乐句/段落边界、源素材尾音和画面停顿，选择硬切、自然尾音或留白交接，或在确有需要时用实际 `fadeInSec` 与 `fadeOutSec` 形成交叠淡变。若采用交叠，检查节奏相位、和声方向、织体/密度变化、音头与尾音是否连得上。音频峰值相近或波形处于局部高点不是充分切点证据。`audio-edit.mjs` 的 `crossfadeSec` 只控制同一 layer 的 repeat seam；跨来源不是靠把这个字段写进两轨实现。合成后必须试听所选衔接区并检查有无间隙、双重重音或不自然能量凹陷；失败就重选区间或交接位置。

## 输入与返回

输入来自同一画面/声音事件表：段落任务、对象与视觉事件、共享事件 ID 和时钟，旁白/对白版本、既有锁定音轨、可用授权素材、目标交付与实际播放场景。Motion 已承担的完整声音职责已包含调用此方法的授权；不再要求用户另选 Arrangement 或重复授权。

返回整片声音职责与前/中/后结构、事件的声部安排、来源/许可、实际源区间、剪辑/变换、命中点换算、候选状态和待听审问题。具体 cue 继续使用 Motion 的 canonical 事件和 `audio-plan.v1`；新 Showreel 由薄入口调用既有 plan consumer 生成初始混音，编辑音轨后使用当前工作区混音导出；既有 Remotion/Film 沿旧消费者兼容。Arrangement 不另造电影时钟、计划格式或第二份全片混音。视听声音设计若用户没有要求完整作曲/编曲，不交独立歌曲或乐谱。

## 为一般配乐请求先选适配的来源产品/风格，不默认写 ABC

先确认用户要的是新配乐、已存在的 BGM，还是具体旋律/谱面控制。普通动画先检索项目音频索引中的成品 BGM；没有合适候选时，用现有真实来源搜索/获取入口寻找可用成品文件，核对来源和许可并登记，再按共享事件时间轴裁切、编排或自动化。外部下载、格式转换或节目内剪辑不会改变“成品来源”的属性，派生文件必须保留父资产及哈希链。

按声音职责查已登记曲库，不因“索引中有音乐文件”就把它当作讲解、推进、揭示或片尾的合适答案。音频索引中的 `candidateGroups` 以 `duty.id` 和 `eligibleRoles` 划定每项本地职责；通过 `sfx-sources.py local-groups --duty <duty-id>` 检查是否有角色相符的索引候选，再对选中的 `assetId` 执行 `local-search` 验证真实文件、hash、许可和审核范围。职责命中只代表索引里存在候选，不证明听感或可用。若输出为职责缺口或当前候选不合适，使用 Arrangement 现有 `laohu-sound.py` provider 搜索/获取算法；需要 machine-readable 原始回执并写回索引时，经 Motion 兼容桥 `source-search`/`source-get`，再由同一 `source-register` 登记到现有 audio index。禁止把 SFX cue/短提示的来源入口当成音乐曲库。

遇到跨来源短音时，先用来源文件身份、源包映射、文件哈希和解码后的音频核对重复；重编码导致文件 hash 不同，不足以证明是新音效。音频指纹命中只用于去重，不代表人类听审。未人工试听的源 hitpoint、时长与组成点位只作低置信度技术估计；保留可验证的单点或复合动作映射，不为未知的层间时间编数。文件名也不证明听感、材质或情绪；不能为方便批量处理而统一增益或固定裁切长度，实际增益、选段和淡变由声音在本片的画面相位与真实播放结果决定。

真实试听后用同一索引的 `local-review` 写回审核结论、范围、实际审核者和语境；整文件 `pass` 才能设置 `ready`，局部或其他结论仍保留候选。脚本会先校验实际文件 hash/时长，但记录的是审核者的明确声明，不能替代真实听审，也不能证明他人接收效果。新源登记、听审反馈和职责目录都回到同一 `assets/audio/index.json`，不并行维护第二份资产库。

音乐候选需要循环时，先确认选段本身包含完整乐句，并在实际连续播放中检查和声是否回到可接受的进入点、尾音是否自然收束或接入下一句；交叉淡化只处理样本边界，不能修复乐句或和声不合。与旁白同期时，把整段音乐循环放进实际 `voiceWindows` 及前后短停顿试听，检查首字、承重词、停顿和恢复处是否被节奏/密度遮住。不能确认整句和同期适配时，不循环：按有限时长音乐 cue 编排，或继续选材。Motion plan 不支持 `track.loop:true`；`audio-edit.mjs` 的重复/交叉淡化仅生成技术派生源，细节见后文。未听审候选仍只能作明确标记的技术预览。

### 成品音乐按音轨类型、来源声明和本片用途筛选

成品 BGM 使用真实音乐搜索路由：`source-search --role music` 会调用 Mixkit free-stock-music、Freesound 音乐搜索和 Pixabay music 页面/播放列表解析；不得把 `--role music` 转成 Mixkit free-sound-effects 或 Pixabay sound-effects。搜索列表仅用于挑选候选，选中后再通过 `source-get` 读取该曲详情、核许可并下载实际文件。只有核实许可允许共享分发的文件才能进入仓库音频索引；Mixkit/Pixabay 的同步许可素材留在具体工程 `.cache`，保留许可边界与来源回执，不打包进共享 assets。Freesound relevance 结果仍按现有代码在本地按 downloads 排序；这是平台下载数排序，不是音质排名。TLS 验证保持启用。

每个音乐元数据字段都带 `source-claim` 或 `unknown`。只有来源页面明确写出或标记的 `fulltrack`、`loop`、`cue`、人声状态、乐器、密度和 BPM 才能作为来源声明；标题、评论、下载量、频谱或波形不能替人试听。未明确区分类型就保留 `unknown`；`sourceRange` 只有选定了实际起止点并听过后才能标成已选。页面“instrumental”之类标签仍只是来源声明，不保证本地文件无人声，也不证明口播可懂。搜索按 `trackType` 精确筛选，按选定 `sourceInSec/sourceOutSec` 排除时长不足的曲目；`musicFit` 会说明人声来源声明与口播情境、用途/画面词与曲目来源文字的关系。用途和画面词的重合只指出可追溯的来源文字线索，不改变提供方结果顺序，也不证明音乐适合当前镜头；不自动把 `unknown` 当成不合格。试听并与画面、旁白共同核对仍是最终判断。

本地音乐职责组按六类情境索引：轻口播推进、明快趣味讲解、节奏演示拼贴、紧张揭秘、无口播章节展示、收束。每组的音乐条目都在同级 `candidates` 数组中，按 assetId 字母顺序展示，不代表推荐顺序；SFX 组继续保留自己的 `default`/`alternatives` 结构。组内 `useCase`、`voiceContext` 和 `visualContext` 只限定检索/反馈范围；所有尚未听审的音乐都以 `kind:candidate` 平级返回并标记 `defaultSelectionAllowed:false`。先用 `local-groups` 看候选，再按单曲 `assetId`、准确 `sourceRange` 与当前 `useCase` 运行 `local-search`；字幕密集、快速口播、无口播画面和片尾留白不能仅凭“ambient / upbeat / cinematic”或关键字命中来判断。若组内曲目与画面进退、说话节奏或乐句不合，扩展真实来源检索、调整呈现/节奏、留白或省略，不拿 EQ 修错选曲；原创生成仍须有明确授权。

人工音乐 `fail`/`conditional` 反馈按原文件 SHA-256、源区间和六种 canonical `useCase` 留作独立拒绝记录，后续本地检索、分组和当前工程实际选定的计划 consumer 都会检查；新 Showreel 经薄入口调用既有 `audio.mjs`，编辑工作区则使用当前会话混音。缺少适用情境时不能把它当作可用；切换到明确不同情境可重新评估同曲其他区间。只有明确拒绝所有音乐用途时才写 `useCase:all`。模型/agent 反馈单独留存，不声称已听；`--allow-candidate` 只放行技术预览，不撤销负反馈或把候选变成 `ready`。SFX 继续用已有事件 scope 记录，不自动变成全局拒绝。

选段须与画面共享事件同期：决定乐句从哪里进入、推进/转折在哪里退进、何时收尾，以及需要 loop 时接缝是否自然。旁白 duck/gain 使用平滑 attack/release 并在真实旁白窗口、停顿与恢复处听检；`gainDb` 是相对轨道增益，不是输出峰值 dBFS。用户给出的约 −20 / −12 dB 只作波动与配比参考，不是硬归一化目标。每个节拍不必配 SFX；音乐是否适合先由乐句、密度、人声遮蔽和画面关系判断。

当执行者**具备真实音频听审与情绪识别能力**（能直接听见音频并分辨情绪、质感与人声关系），且用户未锁定曲目或明确禁止原创时，本地曲库与外部成品来源即作为参考与可选素材池：可直接选用试听合适的成品，也可在缺少贴合成品或需强绑定情绪/相位时参考曲库自行设计并本地原创（包括 Showreel `synth`/`tone`/`layer`、预设或 ABC 等免费本地路径），并须对实际生成的音频与带声成片实听迭代至成片情绪到位、不遮蔽人声（交付时如实区分模型实听与人类终审；付费外部生成仍须另获授权）。当执行者**不具备真实音频听审能力**时，只有用户明确授权原创音乐及声部范围后，才可按目标选择预设或 ABC 等本地生成路径；没有合适成品来源且未授权生成时，调整音乐职责、留白或省略该声部，并说明来源缺口，不得把缺素材等同于原创授权。具体音符/旋律/谱面/具名 mark、hit 或 rise 控制决定是否走现有 `/1` ABC composer，它仍按 `scoreText`、hash 和共享事件绑定规则执行；已启用的预设分支仍须绑定本片共享事件并输出真实 music-only WAV 与回执。已有且有授权的合适 BGM 可继续作为声音来源。若请求明确锁定某曲或锁定内容不得改动，就只沿许可范围使用；预设、ABC 和对已有轨道的修改都不能绕过锁定项的边界。

`.agents/skills/laohu-motion/scripts/laohu-audio-source.mjs render` 的 request `/2` `musicPreset` 分支会生成声音，只能在用户明确授权原创音乐以及对应声部范围后使用；本地无素材或新片需要音乐不能单独作为授权。获授权后按用途选一个实际可用的 product 或 style。先把本片的声音弧线写清楚，再从 Motion 已有 canonical 事件挑出段落转换点，编译为 `sections:[{eventId,energy}]`；不要复制或另写影片秒数。`energy` 通过 `music.energy` 接入已有整体段落电平处理，取值为 0–1；它不是逐乐器音量、配器密度或声部进退控制。按真实结构可增加 `dropEventId`、`endEventId`，需要明确速度时才设置 BPM。获授权的预设分支会实际生成可接入的 music-only WAV，并把 request、段落映射和来源处理记录在回执中；不能以风格描述、提示词或 ambient 参数代替声音文件与编排决定。若目标本来就是稳定底床，明确保持稳定即可，不虚构变化。

最小请求片段示意如下；示意 ID 必须替换为本片已有事件，不得照抄或凭感觉新造时间：

```json
{
  "format": "laohu.motion.huashu-audio-request/2",
  "musicPreset": {
    "style": "<本地实际支持的风格>",
    "sections": [
      { "eventId": "<段落进入事件>", "energy": 0.35 },
      { "eventId": "<发展或重点事件>", "energy": 0.7 },
      { "eventId": "<结果或收束事件>", "energy": 0.45 }
    ],
    "ending": "button",
    "endEventId": "<收束事件>"
  }
}
```

这些数值只说明现有字段怎样传递一个逐段电平意图；每片的段数、起伏方向和是否有 drop 都由实际内容决定。若片段需要的变化超出预设及现有整体能量控制，标明逐乐器/密度控制尚未接通，再选择能真实承载该决定的作品路径，不临时另写 DSP 并宣称它是既有预设能力。若本片同时有绑定到共享事件的少量手动 SFX，且属于既有 Remotion/Film 生成音频分支，Motion 先按[旧合同中的 request-generated source group](../../laohu-motion/references/sound-design.md#request-generated-source-group生成音乐与手动-sfx-的兼容源组)核对条件；符合时以同一次 source mixdown 合成完整片长组，不只生成 music-only stem。新 Showreel 普通成品音源按[原生声音交接](../../laohu-motion/references/showreel-sound.md)进入 `audio-plan/1`。组不兼容或项目确需独立逐事件/后级控制时，再输出独立声部。无需让用户先认领模板或重复授权，不把普通“做段音乐/配乐样片”自动改成 ABC 谱面任务。

若 Motion 已选完整成熟声画来源，先由 Motion 判断是否保留适用的原生 source premix；仅有锁定旁白不要求拆轨。既有 Remotion/Film source 路径按其已实现的 `sound.mixdown` 与 `voiceWindows` 合同处理；source premix 本身不含 voice track，锁定旁白只加入最终混音一次。新 Showreel 按[原生声音交接](../../laohu-motion/references/showreel-sound.md)把独立声部和共享事件编入 `audio-plan/1`，由 Motion 薄入口调用现有 plan consumer；工作区改轨后使用当前会话混音导出。只有需要独立控制或源路径不适用时才拆分声部。Arrangement 不生成 Motion 的完整 source premix，不另建电影时间线、全片最终混音或封装路径。

既有 Motion `/2` 预设生成分支的 music-only stem 保留源音乐分支在 `score.renderScore` 后的 `pump`、style reverb、drop `buildSweep`、`rideEnergy`、event `automate`、源 fade、style `master`、`balanceLows` 的处理次序；这些是该 preset 的编曲音色/动态组成，不可删掉后仍声称复用了原 preset。adapter 只迁入必要私有函数片段并绑定本地 DSP，不把 private 函数说成可 import export，也不接管 `sound.mixdown`。音乐让位依实际执行分支与 receipt 判断：有正确映射的 canonical `voiceWindows` 且没有显式 final `ducking` 时，新生成音乐可由源端处理一次；显式 final `ducking` 则由既有 Motion `/2` 的 `audio.mjs` 独占，源端应记录 `applied:false`。旁白裁切/变速不自动使窗口失效；必须检查转换到源音乐时钟后的实际窗口与处理回执。锁定 voice track 在既有 Motion `/2` 路径中只由最终 `audio.mjs` 加入一次。已选成品 BGM 与现成录音素材不套新生成 preset 的响度目标、音色染色或 source-FX 基准。输出 music-only 48 kHz float stereo 的 exact-duration stem，并作为现有 plan 唯一 music track，不把含旁白的整片 mixdown 塞进音乐轨。

对既有 Motion `/2 selectedMusicTrackId` 的现成 BGM 派生分支，按同一 `audio-plan.v1` 保留音轨源区间、`sourceInSec`、`sourceOutSec`、速度和 `timeMap` 映射；只做该分支实际支持的段落能量与事件命中动态，不把新生成预设的 reverb、buildSweep、style fade、master、balanceLows 或 relative target 染到完整 BGM。对已授权、未锁定的 BGM，若 canonical `voiceWindows` 正确映射且请求无显式 final `ducking`，源端沿原处理让位一次；若明确指定 final `ducking`，由既有 Motion `/2` 的 `audio.mjs` 独占处理，源端不重复。同事件/时间区间的手工 music automation 只抑制相应 event-hit 派生 duck，不抑制 voice-window duck；后者仍按是否存在显式 `plan.ducking` 确定由源端或最终 mixer 负责。锁定轨不派生，只能按授权只读分析。

录音样本不是默认设置。只有已明确选择录音样本来源并取得可用于本项目的包时，才在 `/2` 请求中显式传 `samples:{mode:"recorded-required",packDir:"<项目内绝对路径>"}`；首次 import 前必须指向该 project pack，禁止 home 缓存回退。adapter 验证 v2 manifest、所需 instrument IDs、完整样本/释放层文件、hash、署名与许可、音频元数据及完整解码；任何必需文件未覆盖、解码空/失败或 hash 不符都拒绝该生成。`samples build` 只在明确选择构建且获准后运行 pin 的 `buildSamples({out,only,log})`；它会从上游来源下载文件，必须使用项目内输出目录并检查 builder 实际 manifest，未知 ID 或生成失败不能报成功。回执将 runtime 实际 decoded files 与 note/release 层实际选择分开，并给每项实际文件对应的 hash；未被使用的预检候选不标成已用。

`musicPreset.samples` 仅在既有 Motion `/2` 音乐 stem 分支启用；request-generated source group 当前不支持录音样本包，带 `samples` 时应使用已实现的 stem + 独立 SFX 路径。stem 路径中，无论同一请求是否提供录音包，SFX 都要经独立的 pinned synth-off runtime 运行原 `SFX`/`KITS` 函数：首次 import 前设 `OM_SAMPLES=off`、关闭 recorded-required，预先把该 runtime 的 sample cache 置空，再恢复调用者环境；不要把音乐 pack、模块缓存或 decoded-file receipt 共享给 SFX，分别记录实际读取的音乐样本与 SFX 未读取 recorded pack 的事实。若满足 source group 条件，则 SFX 与新 preset 一起交给原 `sound.mixdown`，不把已经同组混合的 hit 拆出或重复生成。

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

再按画面真实运动选事件相位：起动、速度峰、接触、关系显现/揭示、状态结果。声音提前引导或延后回应时，说清它指向哪一相位，并沿用对应的 event ID/时钟。不要把画面事件的 `start` 当成默认 hitpoint，也不要从另一份手工时间表抄 cue 秒数。若任务复用/更新 Motion 工程，旧 `audioEvents` ID、秒数和 `kind` 只能作为旧项目锚点/候选，不是动作证据；Motion 据当前 renderer 核准目标相位。Arrangement 返回相符的声音角色及素材源 `sync.at`/hitPoint、变速换算依据，由 Motion 沿同一 timeline 事件和实际 phase/offset/timeMap 得出最终 cue；不在 Arrangement 另建时间表。新 Showreel 的字段与时钟见[原生声音交接](../../laohu-motion/references/showreel-sound.md)，既有 Remotion/Film 按[旧 Motion 声音合同](../../laohu-motion/references/sound-design.md#3-让-cue-与动画共用一个时间事实)执行。

## 按来源关系做混音判断，并把最终处理留给真实 consumer

开始处理前，用 `ffprobe` 检查每个输入的实际音轨、时长、声道、采样率和 codec；用 FFmpeg `ebur128=peak=true` 或当前真实检查器分别测量响度、动态范围与峰值，作为定位依据。用户给的 dB 值、旧项目配比或经验数字，在没有明确锁定数值/交付规格时只作起始点，须结合本片源文件和实际输出复核；不能把工作余量、峰值上限或某个来源的响度目标写成通用标准。样本峰值用于观察瞬时余量/削波风险，true peak 反映重建峰值风险，LUFS-I/短时响度描述不同时间范围内的平均节目响度；它们都不能单独判断旁白被音乐或 SFX 遮没。遮蔽须在实际旁白窗口与声部重叠的同一时段听回，定位首字、承重词和停顿，并结合声音密度/瞬态与素材内容判断，不能拿整轨峰值差或 LUFS 差代替。输入格式不一致时先明确对齐/解码方式，并保留原件。先在上下文中设定各轨的 `volume`/增益与适用的声像位置，给总和保留余量（约 6 dB 可作初始工作余量，不是硬阈值）；不要对每条现成录音 stem 独立响度归一化来掩盖配比问题。EQ 在整段混音里判断：只有实际听到/测到低频轰鸣或其他频段冲突时才处理，不默认低切、压暗或柔化；1–3 dB 是可试听的起始幅度，不是固定设置。动态处理只在动态确实不稳或声部需要让位时加入；压缩须保留瞬态，music under voice 的 ducking 按真实 voice windows 和实际听回决定，不把 SFX 机械跟着旁白逐句压低。淡变和保尾音按真实剪辑边界设置。

`audio-edit.mjs` 是 Arrangement 的源编辑器：`decode-indexed-source` 从现有索引资产 ID 定位 MP3/OGG 等来源，核实索引 hash、原始 probe，并输出 48 kHz float stereo WAV 与带父资产、许可、来源回执 hash 的 decode receipt；后续 `audio-edit/1` layer 以 `sourceAssetReceipt` 传递这条身份链。编辑器读取 PCM/float WAV，按源区间、速度、增益和淡变处理最多 8 层，并在多层时明确使用 `amix=inputs=N:duration=longest:normalize=0`；输出 48 kHz float stereo WAV，不做归一化、限制器或静默削波，超满幅峰值会保留并写入回执。旧 spec 的内联 `sourceAsset` 继续兼容并核对真实 WAV hash，但新索引音源优先用机器生成的 decode receipt，避免手工抄写来源声明。先按每层实际上下文设置增益，检查输出 peak；若超过可用余量，回到增益/层数判断。该工具未实现 pan、EQ、压缩器、sidechain、ducker 或 loudnorm，不能在 spec 加字段假装生效。Huashu SFX 的 `sourcePan` 只在其真实源生成分支有效；Motion 的固定轨道平衡在最终混音端单独设置。

交付规格优先使用本轮明确要求。对独立音频节目且用户没有指定目标时，源 `audio-mixing` 方法以约 −16 LUFS-I、≤−1 dBTP 作为可试听的起点；短 SFX 仍按峰值、画面关系和上下文判断，不套节目响度目标。若目标确需响度归一，在目标真正支持最终母带的路径上对**完整最终混音**做 two-pass `loudnorm`：第一遍打印测得的 I/LRA/TP/threshold，第二遍复用这些测量和相同目标参数，优先 linear mode，并核查 dynamic fallback；明确输出采样率。不要逐 stem 套这个目标，也不要把源阶段归一和最终母带重复叠加。

新 Showreel 的成品 `audio-plan/1` 由 `laohu-showreel.mjs audio-plan` 薄入口调用既有 `scripts/audio.mjs`，按计划汇合并生成初始 `audio/final.wav`；未编辑时由 build 封装它，工作区改轨后以当前会话混音导出。既有 Remotion/Film 工程继续消费其原计划。各路径都只使用当前工程选定的最终混音/导出消费者，避免把旧 mix 重新封装进编辑版。该消费者支持未锁音乐轨的 `highpassHz`、`vocalPocket`、音乐或 SFX 的固定 `pan` 和一次完整总混的可选两遍 `masterLoudnorm`。字段、实际作用层与回执见 [Motion 最终混音](../../laohu-motion/references/showreel-sound.md)。任意 EQ、连续声像、压缩器及房间处理仍无对应接口。若交付明确要求而现有 final consumer 没有实现相应处理，准确报告该项未接通，不能把测量值或源阶段处理说成已满足最终规范。输出前在响度匹配条件下比较段落、转场、静到响与单声道折叠；对真实导出文件重新解码并检查音轨、时长、声道、采样率、响度与峰值。解码和表计只证明被测的技术项目，不能证明听感、可懂度或质量；未真实播放时如实标出听审范围。

## 需要原创 MIDI 音符渲染时用本地 source kit，不替代 Motion 电影时间线

`scripts/laohu-sound.py` 提供可调用的 `doctor`、`setup procedural`、`find`、`probe`、`sfzmap`、`render` 与 `check`。默认在当前工作工程使用 `.cache/sound/` 保存来源索引、Kenney 包与隔离依赖 venv，在 `.cache/tmp/sound/` 保存临时文件；`setup procedural --python python3.12` 只在项目 cache 创建隔离 venv，并将 pip cache 与临时目录留在工程缓存，不做隐式全局安装。`doctor` 返回本机实际可用的 Python 包、FFmpeg/ffprobe 可执行状态与版本、以及 Surge XT/sfizz/SFZ 资源状态；只找到可执行路径但无法运行时会单独标为 unavailable。缺少某项时仅阻断依赖它的分支；补装免费官方插件时只在获准的任务 cache 解压，并显式设 `SOUND_SURGE_PLUGIN`、`SOUND_SURGE_DATA`、`SOUND_SFIZZ_PLUGIN`、`SOUND_SAMPLE_DIR`，不改系统插件配置。

`doctor`、`get`、`render` 和 `check` 接受全局 `--ffmpeg PATH`、`--ffprobe PATH`（写在子命令前），也读取 `LAOHU_FFMPEG`/`LAOHU_FFPROBE`；`MOTION_FFMPEG`/`MOTION_FFPROBE` 可作为兼容环境变量。未单独指定 `ffprobe` 时，若它与显式 FFmpeg 在同一目录会自动采用；若可用二进制分别安装在不同位置，就分别配置这两条路径。PATH 中能运行的工具会自动发现；自定义路径必须指向本机已存在且可运行的程序：

```sh
export LAOHU_FFMPEG="/path/to/your/working/ffmpeg"
export LAOHU_FFPROBE="/path/to/your/working/ffprobe"
```

`get` 使用配置的 `ffprobe` 为下载文件测量真实时长、codec、采样率和声道数；`doctor` 实际启动两项工具并报告版本。source-kit 的 `render` 与 `check` 本身用 Pedalboard、soundfile 和 Python 分析音频，不调用 FFmpeg/ffprobe；它们仍接受同一组选项以保持统一 CLI，不把工具未执行说成已验证。

按命令真实结果调用工具；不要把文档示例当作已安装的 preset/SFZ 清单：

```sh
SOUND_TOOL="$SKILL_DIR/scripts/laohu-sound.py"
SOUND_CACHE="$WORK_ROOT/.cache/sound"
SOUND_TMP="$WORK_ROOT/.cache/tmp/sound"
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" doctor
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" setup procedural --python python3.12
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" find "<由 doctor/find 证实可用的查询>" --kind all
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" sfzmap "<find 返回的真实 SFZ 路径>"
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" probe "<find 返回的真实 preset 或 SFZ 路径>" 60 67 --length 2
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" render "$TASK_TMP_DIR/procedural-notes.json" --output "$WORK_ROOT/assets/audio/derived/procedural-source.wav"
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" check "$WORK_ROOT/assets/audio/derived/procedural-source.wav"
```

`render` 的 spec 只支持 `{"instrument":"<find 出的真实名称或 .sfz 路径>","notes":[[midi,startSec,durationSec,velocity]],"tail":2}`。`probe`/`render` 通过 Pedalboard 加载实际 Surge XT 1.3.4 state/preset 或 sfizz 1.2.3 SFZ；sfizz 需要有效 SFZ 及引用样本文件。源 kit 保留 `LEAD`/尾部、音符映射、状态解析、样本映射、时间线、place/trim/reverse/fade、noise sweep、sub drop、master、write、check 与 K-weighted 检查实现。`kit.render()` 自身会按最大绝对样本归一到满幅，故 source WAV 出现接近或达到 0 dBFS 是这一来源渲染步骤的技术结果；`kit.check()` 的 `clipped` 统计逐采样帧中任一声道绝对值达到 `0.999` 的帧数，不能当作最终编码、mux 后 true-peak、失真听感或成片质量结论。`backend.render_notes()` 只在峰值超过 0.95 时衰减；这些步骤不构成真实多轨混音或预设间的平衡证据。每个渲染仍是未听审的 source-stage 中间素材，不直接作为已母带或可发布成品；进入 Motion 后先对照上下文给 cue 设明确 `gainDb` 并留出总线余量（约 6 dB 可作起始工作余量），再交给当前工程选定的 plan consumer 混合。新 Showreel 使用薄入口调用既有 `audio.mjs`；既有项目保持原合同。按交付规格解码检查真实最终文件；若目标要求 final loudnorm 而 consumer 未实现，明确报告未满足，不以 source kit 的 0 dBFS/响度统计替代。`kit.master()` 只可在明确要求的独立 source-render 阶段调用一次，交给 Motion 的源 cue 不再重复 source master，Motion final mix 也不再套第二次 master。无插件/无 sample library、probe 失败或 note range 不匹配时，保留分支级报错，不能用正弦占位声宣称原 preset 已渲染。

按本案真实需要检查用途、播放设备、听觉中心、锁定音轨、前中后结构、旁白保护、音乐/SFX/环境声与安静、画面相位、材质/重量、源起音/主体/尾巴、重复/乐句与接缝，以及混音上下文。它们是用于补足判断的视角，不是固定问卷、逐项必填的表或 16 份文件。

## 从真实素材的起音、主体和尾巴选段，不从文件名或波形猜听感

先听项目内已授权源和已登记候选，必要时再按动作、接触面、材质、重量、强度、速度和持续时间检索外部候选。对已有职责先从 `sfx-sources.py local-groups --duty <duty-id>` 检查角色边界和职责缺口；SFX 再按当前动作/材料/力度筛选候选组。对选定 `assetId` 跑 `local-search`，核对返回的真实文件、hash、许可与审核范围；候选组或搜索命中不等于已选音效。缺少合适本地候选时，经 Arrangement 的现有来源入口检索、获取；需要返回到音频库复用时，用 `source-register` 把已核验来源登记到同一索引，真实试听反馈则用 `local-review` 回流到该资产。匹配后可直接采用原文件，或用 `audio-edit.mjs` 从该原文件裁段、淡化并生成派生 WAV。将准确的原/派生文件登记为 `audio-plan.v1.assets`，以真实的共享 `eventId`、素材内 hitpoint 和源区间写入 `events`，由 Motion 当前工程的 plan consumer 在同一计划时钟中消费。新 Showreel 经薄入口调用现有 `audio.mjs`，旧项目继续按原合同。派生 hitpoint 用编辑回执中的映射值；不要把素材秒数直接当作影片秒数。只有实际完整试听该具体文件及语境后才可标为 `ready`；候选状态只用于明确标识的技术预览。

听素材时分辨它的起音速度和形状、主体是撞击/摩擦/气流/共振/音高还是噪声、尾巴如何衰减或带有空间。选择能带出当前材质和力量的那段真实声音：保留必要的前置动作、核心接触和有用尾音，删掉多余部分。素材的源内峰值、可听起音与画面语义命中点并非同一事实；选择目标点时试听该文件，写明它对应运动起势、接触、显现或落定的哪一相位。

当前索引的候选组把可选职责展开到不同动作、材料、力度与时长：例如 impact 的轻/中/重和 wood/metal/glass/soft-contact、四类地面脚步各两个 Kenney 源版本、paper/wood/fabric/glass 的独立 foley，以及 fast/medium/slow whoosh、swish/zip/reverse、多个时长与力度的 riser/shimmer、界面按钮/开关和 pop。候选组给的是检索范围，不是推荐音色排行。Wyzowl 的 `sync`/`timing`、发布者标注的 `fits_seconds` 与 `use_for`/`avoid_for` 可帮助筛选动作长度与预计命中相位；`timing.audible_start` 到 `audible_end` 只是发布者标记的可闻窗口，不是已确认的剪辑选段。它们是发布者提供的素材内指导；仍需听真实起音、主体、尾部及语境。Kenney 本轮新资产主要依文件名和包目录识别动作/材质，未提供逐项时点；不要把文件名中的材料、力度或 `_000`/`_001` 变体编号写成听感事实，也不要给它们估造 onset、tail、source range 或 hitpoint。新增 69 项全为 `candidate-unreviewed`，听感与适用性保持 `UNKNOWN`，直到有人真实试听。若素材主要动作相符但局部尾音不合，可以裁切、淡化或少量叠层；若核心质感、方向或重量仍不匹配，先继续检索其他已登记或可获取的成品候选。具备真实音频听审与情绪识别能力的执行者（在用户未禁止原创时），可将音效库视作参考，在成品不贴合画面相位或情绪时自行设计合成定制音效，并对真实产物与声画合片实听校验（真实物理拟音仍优先比较真录素材，不以粗糙正弦或任意噪声敷衍自然 Foley）；不具备真实听审能力时，只有用户明确授权原创 SFX 及其适用范围才进入程序合成，不得把当前素材不匹配直接转成原创，否则应调整画面动作或留白/省略该 cue。不要把所有动作都变成相同正弦提示或任意噪声。
命中校准时分开记录源文件内部延迟与该渲染/封装路径实测的输出偏移：先依据所选源区间与 `speed`/`playbackRate` 换算内部 hitpoint，再在最终输出中复测；不把两种偏移揉成经验提前量，也不在 cue 起点与 mux 两处重复补偿。保音高变速会改变瞬态起音和峰值位置，需按当前素材、裁切、速度及输出路径复测；不复制某个样本的毫秒值或帧数作全局常数。若要改变音高，沿已有 `audio-edit.playbackRate` 方法，不用保音高 `speed` 冒充。

重复声音时考虑音色/节奏如何维持对象身份、又怎样表达阶段变化。相同短音连续落在每个动作上容易形成“机枪式”提示；先保留主要结构重音，让较轻动作留空、拉开，或按动作阶段交替素材/减轻密度，必要时把多次相近动作压成一个连续扫动/织体。不要机械追满每拍或每个关键帧。音乐是否适合循环按前面的整句、和声、尾音与旁白同期试听条件判断；本段的重复密度规则用于反复动作声和短 cue，不以技术交叉淡化代替实际听审。

## 用 audio-edit 生成派生源 WAV，不代替电影时间线和最终混音

当需要从授权 WAV 裁切、淡化、作技术交叉循环或组合少数必要声源时，使用 `scripts/audio-edit.mjs`。它产出 48 kHz 双声道 float PCM WAV 与回执，记录源文件 hash、编辑参数、输出 hash/时长/峰值和按参数推导的 hitpoint。回执中的 hitpoint 是几何时间换算，不是瞬态识别器测得的真实峰值；需要画面准确命中时，结合实际试听修正 Motion cue。

输入为 JSON spec。`file` 相对 spec 文件目录；`sourceInSec`/`sourceOutSec` 是源 WAV 中绝对秒数；`startSec` 是各层在这个派生声音文件内的相对起点，不是影片时间；`hitPointsSec` 是源文件内待映射点。`tempo` 使用 FFmpeg `atempo`，改变速度但尽量保持音高；`playbackRate` 以重采样率改变速度和音高。二者互斥。`repeatCount` 与 `crossfadeSec` 只创建技术性重复/交叉淡化，编辑器不判断音乐句法是否成立；循环的听审条件见本节前面的成品选材路径。

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

解码入口示例：

```sh
node "$SKILL_DIR/scripts/audio-edit.mjs" decode-indexed-source \
  --asset-index "$WORK_ROOT/.agents/skills/laohu-motion/assets/audio/index.json" \
  --asset-id "<已核对的索引资产 ID>" \
  --output "$TASK_TMP_DIR/decoded-source.wav" \
  --receipt "$TASK_TMP_DIR/decoded-source.receipt.json" \
  --tmp-dir "$TASK_TMP_DIR/audio-edit" --work-root "$WORK_ROOT" \
  --ffmpeg "$MOTION_FFMPEG" --ffprobe "$MOTION_FFPROBE"
```

工具仅接受 PCM/float WAV 编辑输入、1–8 个源层及已列出的编辑字段；它不负责自动响度归一、限制峰值、降噪、混响、频段塑形或全片自动化。已匹配的 OGG/MP3 等其他格式不应因此放弃：先用 `decode-indexed-source` 从索引资产 ID 解码并保留机器生成的 receipt，再在 spec 的 layer 上以 `sourceAssetReceipt` 指向该回执。编辑 receipt 会核对 WAV hash 并追溯原压缩源 hash、作者、许可、页面和下载回执；不手工复制进 `sourceAsset`。旧内联 `sourceAsset` 仍可用于既有 spec，并继续做 source-WAV hash 对照。解码只避免再经有损编码，不是恢复原编码丢失的信息；禁止只改扩展名冒充转换。叠层可能产生高于满幅的峰值；float 输出会保留这些数值并由回执报告，不静默削波，也不替作者自动压低。需据实际听审决定是否调增益及怎样进入最终导出。

派生文件仍为 `candidate-unreviewed`。哈希、许可、时长、波形、peak 或 loop 交叉淡化通过都不能升级 `ready`；只有对实际派生文件 hash、完整时长和当前使用语境完成真实试听，才可登记相符审核。公共索引里的 Kenney 候选及任何新下载也保持原审核状态，不能批量升级。

## 回到 Motion 的唯一计划：保护首字、短停顿、锁定轨和同一时钟

把音乐、SFX、环境声、旁白与安静安排回同一段落/事件蓝图，确保主线仍能解释声音为何在此处开始、让位、恢复或结束。Motion 计划只接受实际已实现的字段。`audio-plan.v1` 的 `track.loop:true` 会明确拒绝；循环源应先按音乐意图通过 `audio-edit.mjs` 制作成派生源。Motion 的 `speed` 使用音高保持的 `atempo`，不等于变调的 `playbackRate`；Motion 计划显式传 `playbackRate` 也会拒绝。

`ducking.preRollSec` 将音乐压低的 attack 起点提前到 voiceWindow 前；`holdSec` 将恢复过程延至 voiceWindow 结束后，适合保护首字和保持短空隙中的让位。preRoll 应足以让指定 attack 在首字前达到目标。完成混音后试听真实首字与句内/短停顿，确认首字没有被音乐盖住，音乐也没有随短空隙忽高忽低而产生抽吸或呼吸感；只用现有计划字段与段落编排调整，若当前控制无法平顺满足，就重排音乐进入/退出或选不需该段 ducking 的方案，不写不存在的处理字段。未提供 `preRollSec`、`holdSec` 时沿用旧 attack/release 行为。缺省不强加 ducking；普通语音停顿不自动升起 BGM，只有蓝图明确选择短空隙保持压低时才设 hold。锁定轨不能裁切、变速、加减益、淡入淡出、loop 或套用 ducking/automation。

audio-plan/1 只接受当前 consumer 实现的 `targetGainDb`、`attackSec`、`releaseSec`、`preRollSec` 与 `holdSec` ducking 参数；未知 ducking 键和未实现的 Motion plan 顶层连续控制/房间处理会拒绝，不得写字段后假设已生效。资产 metadata 的 `processing` 仍是素材描述，不等于 plan 处理接口。Huashu 音效生成分支现有的 `sourcePan` 仍可在源码支持的源生成阶段使用；这不是 Motion audio-plan 的连续声像控制，也不由本 Reference 否定。ASRcut 冻结语音、revision/hash、source targetRange 与编译时间轴原样继承，不手改、不另造时钟。

## 听实际派生源和全片混音，再报告证据范围

对导出的源 WAV 先正常速度听选段、转变、尾巴、叠层和技术循环；按真实用途再听长时间重复、手机扬声器、单声道折叠，并在旁白/对白实际上下文检查信息遮蔽。听感不合就返回剪辑/选材决定，不能因回执通过而结束。

Motion 按当前工程选择唯一实际混音/导出路径。新 Showreel 的成品 `audio-plan/1` 经 `laohu-showreel.mjs audio-plan` 调用既有 `scripts/audio.mjs` 生成初始 `audio/final.wav`；未编辑时由 build 封装，编辑工作区改轨后须试听并导出当前会话混音。既有 Remotion/Film 继续消费原有计划。对声画相位、旁白清晰度、音乐进退、SFX 落点、整体舒适度、静音与结尾进行正常速度顺播及合适设备检查。制作人负责报告真实源文件、来源/许可、hash、回执、实际试听者和范围、计划字段与未听审状态；接口通过、计划接受、FFmpeg 编码或媒体流存在只证明技术进度，不证明听感合格。
