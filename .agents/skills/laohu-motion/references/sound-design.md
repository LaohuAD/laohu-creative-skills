# 音乐、音效与静音设计

本 Reference 决定一条动画是否需要声音、声音承担什么作用，以及怎样把有授权的音源接入真正输出的媒体。它不规定固定音色、音乐风格、音效数量、响度或曲库。声音应跟内容与画面一起设计，不因无旁白就自动静音，也不因缺背景音乐就判作品有问题。

## 输入与返回

**输入：**用户对旁白、对白、现有音乐/音效、静音、音轨版本与可编辑范围的要求；镜头蓝图中的视觉事件、焦点变化和时间基准；可用且授权的音频素材、合成器/音频编辑器、混音及最终交付规格。

**何时运行：**完整新片制作或授权修改涉及全片音轨/声音总设计时，在分镜预算阶段运行；无旁白、未点名音乐或缺少音源都不跳过这次判断。先决定各段旁白、既有轨、音乐、SFX、环境声或安静是否有实际职责，然后可以选择不加声音。局部任务若用户要求声音、需保留/检查音轨，或导演判断特定声音会帮助表达、节奏、氛围、空间或交互反馈，也要运行。用户明确要求完全静音时可直接记录此边界并不加声音；本轮仅作局部视觉修改且原音轨明确不在授权范围内时可跳过此 Reference 并保持原音。它不强制加入 BGM/SFX；缺少 BGM 本身不是错误，也不要求为了“完整”强行加配乐。

**返回与消费者：**在同一镜头/事件表中，返回是否有旁白、BGM、SFX、环境声或静音；每项声音的用途、资产来源/授权、事件 ID、时钟基准、目标 cue 时点/时长、剪辑或合成方式、混音角色、实际输出状态和待确认点。主流程消费声画职责；工具链据事件表生成/对齐音频、封装最终视频并播放检查。不能只在蓝图写“加音效”，却让 renderer 或交付没有可消费的 cue。

声音按整段作用与具体材料安排，并与画面一同预算：先判旁白、音乐、环境、动作声音和安静各自承担什么，再为确有需要的事件完成本片素材检索、许可核验、真实试听、选段/命中点和混音位置。无须复杂声音处理时就沿现有 `audio-plan.v1` 与 `audio.mjs` 完成；控制曲线或空间处理只有在实际声音缺口要求它且已有真实 consumer 时才选择。试听记录必须对应实际文件 hash、使用语境与被听区间；公共索引候选和技术参数不会因接口新增而批量变成 `ready`。编码成功、波形检查或素材存在都不能替代最终混音的实际听审。

当前 `audio.mjs` 只接受 plan `/1`。尚未实现的 plan 顶层 `controlSource`、`processing` 与 `rooms` 会明确拒绝，不能写入后假设 consumer 会读取；这不禁止资产 metadata 中同名描述字段。Huashu 生成分支的 `sourcePan` 仍按该分支的源生成行为使用；它不是 Motion plan 的后级连续声像。未实现 `/2` 不得作为可用处理接口推荐。

## 1. 先分开旁白、音乐、音效和静音

明确本轮各声部是否存在并可编辑：

| 需求状态 | 处理办法 |
|---|---|
| 有旁白/对白 | 使用明确版本的实际音轨对齐事件。保护原语句、版本和内容锁定；配乐与音效不能盖住承重词、限定或停顿。没有原音时只作暂定语义预算，不声称同步。 |
| 无旁白，但有声音要求 | 仍可用音乐、音效或环境声；按视觉动作和观看任务选择。不要把“无配音”简化成“无音轨”。 |
| 无 BGM，仅有 SFX，或无 BGM/SFX 需求 | 完全有效；只制作对动作或理解有贡献的声音。没有音乐本身不记为缺陷。 |
| 用户明确要求完全静音 | 不添加配乐、音效、环境声或生成音轨；最终输出按静音交付，并确认没有意外音轨。 |
| 用户指定既有音轨需保留 | 核对具体文件与版本；按授权原样保留或只在允许范围内处理。不能用另一条音乐/合成声替代被锁定原轨。 |
| 用户要求特定声音，但音源缺失 | 若任务已授权制作/选配声音，可本地合成，或自行查找许可与用途明确的可用素材并记录来源，不必把常规创作选择退回给用户；继续完成视觉与时序工作，不能假称已有素材或已混音。若用户锁定某个来源/版本，就不擅自替代，只将依赖该音源的波形对齐与混音留待材料，其余工作继续。 |

## 2. 让声音承担可说明的角色

**先定整段声音轨迹，再填 cue。** 先按段落/镜头任务决定旁白存在时各声部何时进入、支撑、让位、恢复与收尾；无旁白时音乐、SFX 或静音分别承担什么作用；用户要求完全静音时则保持无声。把阅读、结论、转折和停顿纳入同一轨迹，不能把“没有旁白”推断为全静音，也不能因为没有旁白就自动加 BGM。轨迹明确后再选个别 cue、音色、素材和自动化，避免先给每个视觉动作补声再拼出一段无主次的音轨。

对每项 cue 写清为什么此刻需要听到它。可选职责包括：

- **事件提示：**标出弹出、切换、连接、选择、落定、揭示或状态反馈。
- **动作质感：**为特定物体或材料提供重量、摩擦、触碰、运动或空间的可听线索。
- **段落/氛围：**用音乐或环境声保持一种空间、情绪或叙事张力；主题变化、留白和停顿随段落职责安排。
- **信息层级：**提示一次重要焦点或结论落点，不用声音重复每个关键词。
- **静默：**让阅读、等待、转折或结果留出注意空间。

具体素材怎样按起音、主体、尾巴、动作材料与重量选段，何时裁切/叠层、何时才原创，归 [Arrangement 视听声音设计与源音频处理](../../laohu-arrangement/references/sound-editing-and-mixing.md) 的专业方法。Motion 主线负责判断事件是否需要声音、给出画面相位和共享事件，再消费实际返回的素材与计划；不要把每个动作机械合成为同一种正弦提示，也不要因模板或画面动作自动补 cue。

只有当声音角色、素材与时点仍是有实际影响且未解决的选择时，才制作同画面、近似总响度的 A/B 试听版本；其余制作不做形式化音量对照。A/B 只帮助比较当前声部方案，不取代授权核验或最终混音听审。

**具体 SFX 的选材与必要源剪辑由 Arrangement 主入口路由。** Motion 主线先决定视觉事件是否确实需要 SFX，再把动作、材料、重量、强度、目标相位、锁定项与同一 event ID/时钟交给 [Arrangement 主 Skill](../../laohu-arrangement/SKILL.md) 的视听声音分支。该入口按自身知识塔条件决定是否调用 SFX 子级，再返回带来源、许可、hash、实测长度和候选状态的真实素材；必要时提供 `audio-edit.mjs` 派生 WAV 与回执。普通 Motion 完整声音任务已授权按此专业路径工作，不要求用户另选入口或重复授权。只需 BGM、原样保留锁定音轨或完全静音时，不为凑流程选择 SFX 子级。新下载与派生文件仍为 `candidate-unreviewed`，只有绑定准确文件 hash、完整实际听审范围与使用语境的审核证据才可标为 `ready`；最终由 Motion 接入并检查唯一声音计划。

素材检索、分组筛选和源剪辑命令由 Arrangement SFX 子级维护；匹配结果只缩小候选范围，不等于试听、许可确认、技术适配或混音适配，也不会改变 `assets/audio/index.json` 中的审核状态。Motion 消费具体派生文件自己的 hash、实测时长、来源/许可与听审范围；不会因处理回执或候选命中自动升级为 `ready`。

选中来源后，只有听审记录绑定相同具体文件 hash、当前适用范围/使用语境、非占位的具体审核者标识和 `pass` 结论，才可复用审核结论；其源区间还必须从文件 0 秒覆盖到实测完整时长，因为现有 consumer 只消费整文件的 `ready` 状态，不读取审核过的局部范围。只听过局部片段时继续标 `candidate-unreviewed`，不得把整份文件交给 consumer 当作已审核。更换派生文件后，以派生文件自己的 hash、完整实测区间和相应语境重新记录；语境变化也复核。程序可核对记录字段与文件身份，但不能证明记录者真的听过，真实试听仍由记录者的实际证据承担。调起音、裁切、增益与尾音仍须回到实际画面和全片声轨中判断；候选尚未听审时只在明确技术预览中使用。许可与文件来源不明时不冒称可用，只暂停依赖该素材的声音部分，其余画面照常推进。素材记录关联 source/derived 的 asset ID、路径、哈希、授权、听审记录、适用范围及实际处理方式；没有符合上述条件的真实听审证据就不得标成 `ready`。最终混音效果单独听审；波形、编码成功或文件名不能证明听感。

实际 envelope 必须按选定的源区间、素材真实时长和变速后有效时长计算；裁切或变速后重新核对 attack/release 终点，不能沿用原长度让床音包络落在音频已结束之后，也不能让 envelope 延长超出 source 真正可用的尾部。硬切可以是有意设计的段落边界，只要最终听审确认没有意外爆音/残响并符合画面职责。锁定音轨按其权限原样保留，不能对它施加淡变、duck、loop、gain 或变速。`ducking` 只在已有编排上辅助让位，不替代选择、删减或重排声音素材；无旁白的屏幕阅读也可能需要安静窗口。

FFmpeg recipe 是有限的本地 WAV 生成入口，不是通用拟音器。经 recipe 现场生成的 WAV 始终为 `generated-unreviewed`；`generatedAssets[].reviewStatus` 省略或显式写 `generated-unreviewed` 才能通过校验，写成 `ready` 或其他状态会被拒绝。未试听生成物时，只有显式使用 `--allow-generated-preview` 才能做技术预览，输出 manifest 会标记 `technicalPreview:true`；它可与 `--video/--final-output` 同步查看，但封装结果仍不是审核通过的正式声音。如果生成 WAV 后来确实经过试听并审核，把具体文件作为 `plan.assets` 项登记 `file`、`durationSec`、`sha256`、许可/同步边界与 `reviewStatus:"ready"`，再按一般已审核素材复用。脚本检查登记字段、权限门禁与文件哈希，不会验证是否真的听过。仍未听审的项目 WAV 则继续标 `generated-unreviewed`，只走生成预览开关。

这是一套按角色做判断的方式，不是预设“片头一定 whoosh”“每次高亮都 pop”“每个镜头有几次音效”或指定固定 BGM 风格。参考素材的声音也只有在确实播放/试听后才能记录其听感；视频存在音轨不等于已听过，代码能够合成也不等于声音好听。

## 3. 让 cue 与动画共用一个时间事实

把音频 cue 和视觉动作放在同一事件源中，至少记录稳定事件 ID、成片全局时刻或明确的局部时钟/映射、视觉动作前后态、声音角色、资产、预期起音与落点。先为 cue 选它服务的相位：起势引导、接触、揭示、关系显现或结果落定；不要把事件 `start` 自动当成声音点。需要提前或延后时，偏移应从同一事件的轨迹/相位求得并写明原因，保持声画共享同一时间事实。旁白存在时，按语义段落规划音乐如何进入并支撑、何时让位与恢复、最后留尾还是转静默，再试听校准，不等已经明显遮盖才处理。无旁白但有屏幕阅读时，留白可能需要较安静的窗口，不因每次停顿就自动抬高配乐。音乐起落、退让/恢复、增益与尾音引用镜头或段落锚点，不另手抄互不关联的秒数，并须落到真实生成脚本、轨道自动化、DAW 或 FFmpeg 参数。检查音源生成、轨道自动化和混音后处理是否重复施加了淡变/增益；若有意叠加，明确乘合后的最终包络及其控制归属，不把双重处理误当成一次曲线，也不一概禁止叠加。

复用或升级已有工程时，分别检查 renderer 实际消费的画面状态/轨迹与旧 `audioEvents`、cue 名和时间。旧事件 ID、秒数及 `drop`/`land` 等标签可作为稳定锚点和候选编排，不能证明相应物理动作发生，也不能单独证明当前视觉相位。按当前 renderer 实际读取的 KEYS、phase、对象前中后态与运动/可见度曲线核对声音角色：`move-peak` 要对应实际运动峰；若把声音解释为物理 `impact`/`contact`/`land`，须有画面支持的接触、落定或状态跃迁，单纯淡入不代表冲击。声音不必写实，音乐性标点或抽象 `impact` 强调仍可用；此时明确它强调的信息显现或焦点交接，并按该画面落点定相位和实际听审，不称为不存在的物理碰撞。旧 cue 与当前动作不符时，按真实画面重选声音角色/素材或省略，不靠改事件名制造动作。素材的源 `sync.at`/`hitTimeSec` 是声音内部待对齐的位置，不是新的画面时刻；根据已核实的画面相位及素材有效速度推导素材起点/偏移，通过现有 `phaseId`/`phaseOffsetSec`、cue `offsetSec` 或实际 `timeMapId` 路径写回，保留稳定事件 ID并记录轨迹相位与源同步点的推导。不得把旧 cue 秒数直接当作新素材的源起点，也不得另手抄第二套时间。

先给段落/场景的主重音选声音角色与强度，再安排辅助声部和背景音乐，避免每个小动作都抢成同等级命中。区分预先引导、运动质感、接触/命中、结果尾音和音乐支撑；它们可错时、叠加或在阅读窗口中退让，实际声部数量由当前事件职责决定。音量变化沿用旁白段落、结果落定或视觉焦点交接等真实锚点，在旁白存在时先保护清晰度；没有旁白时也可为屏幕阅读留安静窗口。复用已有素材时以索引里的授权和候选状态为起点；只在源 hash 与适用范围匹配真实审核记录时复用，派生文件、源区间或事件语境变化后重新核听，最后混音仍需独立听审。未听审的候选不能当成已验证声音。

同一事件表可以被场景脚本读作画面事件，并由本地音频 adapter 读作 cue。Huashu Motion 接入路径从 film manifest 校验同一蓝图、全局事件场景、素材场景与时钟映射，再把音乐和音效写入现有 `audio-plan.v1`；最终仍由 `scripts/audio.mjs` 消费同一全局事件场景并只混音一次。不能把未知的 `audio` scene 字段写进 JSON 冒充功能，也不能另手抄第二套事件时间。动画 renderer 可以继续只负责无声视频帧，声音在成片封装时合入。

Video Shotcraft Film Blueprint `/2` 也只渲染 picture-only 画面；声音必须由同一 canonical `audioEventScene`、现有 `audio-plan.v1` 与唯一 `scripts/audio.mjs` 混音路径接续。选用 Video Shotcraft 时，来源动作如何绑定实际词/行、ASR point 与可选 `audioEventId`，按[源接入规则](video-shotcraft-integration.md)使用；source 视觉 landmark 本身不自动产生 SFX，也不能直接把演示音轨当作已授权资产。如果当前音频 consumer 尚不能读取 `/2` manifest，就将混音标为未完成并交回工具链修复，不另建第二事件表、不手抄时间，也不把无声 render 称作完整有声成片。

## 4. 可执行的本地合成、对齐与混音路径

常规制作从声音角色、视觉事件和已有工程出发。需要为具体事件挑选音效时，Arrangement 主入口按自身条件调用 SFX 方法；用户用普通语言提出声音目标即可，Motion 主线根据段落作用、已核实的共享事件和素材实际听审结果形成配乐与音效安排，不要求用户手工填内部低层字段。若没有合适已审核素材且声音职责需要专门生成，可沿用项目已有生成脚本产出源 WAV，再把它作为有 hash、来源/权限和审核状态记录的项目资产交给共享 consumer。当前 `scripts/audio.mjs` 还提供明确但有限的本地 recipe 入口；它仅内建 tone/noise，不是通用拟音合成器，不应声称能生成任意音色。

### Huashu Motion 上游音频 adapter

当 Huashu Motion 的既有音乐产品/风格预设或公开音效适合当前请求时，优先复用仓库中固定 commit 的原始音频模块，由 `.agents/skills/laohu-motion/scripts/huashu-audio.mjs` 接入，不重写其 DSP。适配器核对 `templates/catalog.json` 的 commit 与闭包哈希；音乐可以走 source product/style 预设、明确谱面/mark 的 ABC composer 或已选 BGM 的派生处理；单件音效用 `SFX[name].fn` / `KITS[kit][name]` 和公开 `Track`。只接入声源/局部编曲，不调用私有 `renderSfx`，也不接管上游整片 mixdown。录音样本默认关闭（`OM_SAMPLES=off`），不会隐式读取或构建用户 home 中的样本。

普通用户只要求新配乐/音乐底床、且固定源码已有适用产品或风格时，先选 `/2` 的 `musicPreset`，而不是默认手写 ABC：`musicPreset` 必须且只选择一个 `product` 或 `style`；有匹配的 `PRODUCTS` 就用其 product preset，否则选实际存在且适配内容的 `resolveStyle` 风格。`variant` 仅用于 product；`seed`、`bpm`、`sections`、`dropEventId`、`endEventId`、`ending` 等由主线按任务与共享事件编译，用户不填内部字段。不要虚构源码没有的产品或风格。将音乐作为现成候选来源时，保留来源/许可与原始音轨状态，不因为 `/2` 存在就强行原创。只有用户明确指定 ABC/具体音符/旋律/谱面/具名 mark、hit 或 rise 控制，或负责作者为实现已定听觉目标确认确需这些具体控制时，才选择 `/1` ABC composer，不用它绕开适用来源预设。没有适用预设时，按本任务授权与已定目标继续作现成选材或原创判断，不要求用户先提供音符。用户提供现成强拍音乐并要求卡拍剪辑/事件对齐时，可直接对该素材作只读拍网格分析；不必先把它改写成 ABC。

`/2` 预设请求 shape 为 `{"format":"laohu.motion.huashu-audio-request/2","musicPreset":{"product":"<pinned-product-id>"}}` 或将 `product` 换成实际存在的 `style` 字符串；两者不能同时传。`keyMidi`/`scale` 仅在用户或已确认配乐上下文明确指定调式/根音时覆盖；否则保留上游 style/product 默认，避免把小调类预设强制改为大调。`selectedMusicTrackId` 用于已选 BGM 的派生分支，不与新作曲/录音样本分支混用。

同一请求还生成 ding/chime 等有音高 SFX 时，默认使用新生成 source preset 的 `score.plan` 实际 root/scale 经上游 SFX key 回调编配，并在 receipt 同时记录 `musicPreset.sourcePlan` 与 `sfxKeyContext`。若 `/2` 只把预设用于处理已存在 BGM，而请求没有明示 keyContext 或 preset key，不能把该预设的随机 root 当作现成 BGM 的真实调性；adapter 沿既有 SFX-only 默认 C major 生成并把“BGM tonal center unmeasured”记入回执。此时优先用非定音 cue，除非作者确认调性上下文；不添加未实现的自动调性检测。

新生成预设沿用 pinned `score.plan`、`score.renderScore`、`score.pump`、style reverb、drop `buildSweep`、`rideEnergy`、事件 `automate`、源 fade、style `master` 和 `balanceLows` 的音乐支路处理，并保留原顺序；局部私有函数由本地 adapter 迁入并绑定现有 DSP，不声称它们是可直接 import 的 export，也不执行 `sound.mixdown` 全片混音。源 voice-duck 不执行，避免与 `scripts/audio.mjs` 的 `voiceWindows` 双重压低；声音执行/最终混音与 duck 仍唯一归现有 `audio.mjs`。生成的 music-only 48 kHz float stereo stem 时长须与 plan 完全一致，作为现有 `audio-plan.v1` 唯一 music track 输入。

`selectedMusicTrackId` 的现成 BGM 分支只对已授权、未锁定来源的裁切区间读入 PCM，沿用原 `sourceInSec`、`sourceOutSec`、`speed` 与 `timeMap`；只应用片段能量变化和事件命中动态。它不加预设 reverb、drop sweep、源 fade、style master 或 `balanceLows`，也不执行源 voice-duck；已有同事件/重叠的手动 music automation 优先，派生 duck 整项退出。锁定音轨仍可只读做 beat 分析，但不可做此派生变更，且不得重写锁定 ASR。

录音样本只在明确需要并已授权使用已取得/许可核实的项目样本包时选择：`musicPreset.samples` 必须声明 `{"mode":"recorded-required","packDir":"<项目内绝对路径>"}`，adapter 在首次 import 样本模块前设置明确 pack 路径与新进程/隔离运行时，校验 v2 manifest、所需 instrument IDs、许可/署名、文件 hash、音频元数据与完整解码；静默 decoder、缺样本或不完整覆盖都失败，不回退合成，也不回退 home 缓存。`samples build` 会显式运行 pin 的 `buildSamples({out,only,log})` 并验证实际输出；它可能从来源下载样本，只在用户任务已授权且请求此构建时才执行。构建命令为 `node .agents/skills/laohu-motion/scripts/huashu-audio.mjs samples build --out <项目内绝对目录> [--only <来源instrument-id列表>]`；输出目录在写入前须通过项目根与 symlink containment 检查，未知 ID、缺失许可或不完整样本不得以 exit 0 当作成功。合成回执区分实际解码文件与音符/释放层选用文件，不把整个预检包报成“实际使用”。

`musicPreset.samples` 只控制新生成的音乐 preset stem，不扩展到同请求中的 SFX。每个 SFX 必须从独立的固定源码 runtime 加载：首次 import 前设 `OM_SAMPLES=off`、关闭 recorded-required，并先把 sample pack cache 初始化为 null，再恢复调用者环境；不得复用音乐录音 runtime、pack 可见性或其模块缓存。音乐 receipt 继续报告实际录音文件；SFX asset 与 receipt 另行标明 synth-off 和未读取 recorded pack。

若输出已登记成可用的强拍音乐候选，且用户要求画面剪辑/事件跟随其拍点，读 [Arrangement 视听声音设计与源音频处理](../../laohu-arrangement/references/sound-editing-and-mixing.md#选择强拍音乐的拍网格只读分析并对最终封装回测)，按同一计划映射拍点并在最终 mux 后从实际音频流保留 PTS 缺口解码回测；以画面流起点作 PCM 零点，不重复加音轨 offset。beat 周期与 nearest transient 可能出现整拍/半拍别名，不能由其平均残差推导唯一绝对音轨偏移；零双向匹配须作为 unresolved/review-required 交回人工判断。输出只是供画面/剪辑选择的候选，不自动生成事件或改动锁定片段。

请求通过 `--film-manifest` 读取并校验蓝图、ASR timeline/edit plan（若存在）、编译后的 `audioEventScene`、source scenes 和 `audioTimeMaps`。ASR 样本锚点保留精确原始时钟；画面帧边界独立按 fps 向上取整，残差记入 manifest，不把非帧对齐的声音事件移到画面帧点。适配器生成的 `audio-plan.v1` 继续只保存 `eventId` 与 `timeMapId`，`audio.mjs` 再从同一 `audioEventScene` 求全局时间；请求不能单独提供 `hitFilmSec` 或另一套 scene/timeMap。

整片音乐方向、段落进退、声部空间与何时留白的作曲/编配方法归 [Arrangement 视听声音设计与源音频处理](../../laohu-arrangement/references/sound-editing-and-mixing.md)；Motion 仍将结果映射到同一事件与 `audio-plan.v1`。Huashu 上游 SFX 的 `sourcePan` 与 source gain 仍在已支持的源生成阶段烘焙一次，kit 后处理沿用源码；`mixGainDb` / `musicMixGainDb` 只作为后级计划控制，避免重复乘源 gain。原始 PCM 以 48 kHz 双声道 float WAV 保存，receipt 记录编码、peak 与越界样本数。新增 WAV 为 `generated-unreviewed`；生成、对齐或编码成功不代表听感合格。`audio.mjs` 仍是唯一最终混音入口，保留锁定轨、`voiceWindows`、ducking 与时间线门禁。

#### Composer 的 ABC 输入与共享标记

机器请求格式固定为 `laohu.motion.huashu-audio-request/1`。音乐分支使用 `composition:{scoreText,seed,durationSec?}`、`scoreSha256` 和 `bindings:{scoreSha256,marks?,hitRiseCues?}`；`scoreSha256` 是 `scoreText` UTF-8 字节的 SHA-256，两个 hash 字段必须相同，`durationSec` 若提供须等于 base audio-plan 的片长。`seed` 是有限数字或字符串。`musicMixGainDb` 可选（默认 0 dB，范围 −120–24 dB），只写入 music track 后级增益。`keyContext` 为 `{rootMidi:0..127,scale:"major"|"minor"|"dorian"}`；省略时为 MIDI 60、major。无 composer marker 时 `marks`、`hitRiseCues` 可省略或为空。

`scoreText` 使用上游 composer 当前实现的 ABC 子集：文件头 `X:`、`T:`、`M:`、`L:`、`Q:`、`K:`；各声部用 `V:<id> inst=<instrument> role=<role> gain=<number> transpose=<semitones>` 声明，鼓声部另设 `kit=<drum-kit>`。谱面用大写音名从 C4 起、小写音名高八度，`,` / `'` 调整八度，`^` / `_` / `=` 标升降还原音（同小节延续），数字和斜线写时值；`z` / `x` / `Z` 是休止，`[CEG]` 写和弦，`-` 连音，`(3` 三连音，`|:` / `:|` 重复，小节内可写 `[K:]`、`[M:]`、`[Q:]`。多声部须有相同小节长度。力度 `!pp!` 到 `!ff!`、`!crescendo(!…!crescendo)!`、`!diminuendo(!…!diminuendo)!`、`!accent!` / `>`、`!fermata!`、`!ped!` / `!ped-up!`、`!rit(!…!rit)!` 与 `!breath!` 都由上游乐谱解析器执行。

可接受语法以已 pin 的 [`composer.js`](../templates/upstream/huashu-motion/cli/lib/composer.js)、音色以 [`score.js`](../templates/upstream/huashu-motion/cli/lib/score.js)、音效实现以 [`sound.js`](../templates/upstream/huashu-motion/cli/lib/sound.js) 为准；这些源文件的 commit 与 SHA-256 由唯一模板 catalog 校验。

当前可用的非鼓 `inst` 名称为：`epiano pluck bell marimba kalimba glass glock piano rhodes guitar uke harp pizz guzheng pad warmpad strings stacc supersaw horn brass saw sqlead chip tri clav cowbell flute dizi bass synbass sub808 sinebass synpluck vibes erhu lowstr violins violas celli basses violin trem`。鼓声部 `inst=drums` 可用 `kit=pop|acoustic|808|cinematic|lofi|gated|chip|folk`；音高映射为 `C,,` kick、`^C,,` rim、`D,,` snare、`^D,,` clap、`^F,,` closed hat、`^A,,` open hat、`A,,` tom、`^C,` crash、`^F,` tambourine、`^A` shaker。适配器强制 `OM_SAMPLES=off`，这些音色由固定源码合成，不表示已调用可选录音样本包。

谱面标记和适配绑定的含义：

- `!mark:name!` 只标记对齐点；在 `bindings.marks` 写 `{name,eventId}`，适配器把 mark 对齐到该共享事件的 canonical 时间。谱面改动后重算 hash 并重建绑定；重复或缺失 mark、未匹配时拒绝对齐。
- `!hit!` 在该拍生成 `impact` 与 `subdrop`；`!rise(! … !rise)!` 在括号闭合处生成 `riser`。每个 hit/rise marker 都要在 `bindings.hitRiseCues` 中对应 `{cueOrdinal,eventId}`；ordinal 从 0 开始，按谱面中 hit/rise cue 的顺序计数，和 score hash 一起失效。每个 marker 产出的 effect 时间还须与所绑 canonical event 一致，否则拒绝，不把漏绑或失配 cue 静默丢掉。
- `!filter(!…!filter)!`、`!stop(!…!stop)!`、`!stutter(!…!stutter)!` 是谱面内的混音/节奏处理，不额外生成音效事件。

不需要 composer 时，省略 `composition`、`scoreSha256` 和 `bindings`；无 composer 时必须至少有一个手动 `sfxEvents`。Music-only 的最小分支是提供 composition、score hash 与匹配的 `bindings.scoreSha256`，并让 `hitRiseCues` 为空、不传 `sfxEvents`；它生成一条 music track，不要求也不添加 SFX。若谱面主动含 hit/rise marker，则每个 marker 都有绑定并会生成对应音效。两种输出可以同时请求；静音成片沿用既有静音路径。由主线自动生成并校验这些字段，不让用户手工抄 marker 序号或另填起音秒数。

#### 单件 SFX 请求字段

每个手动 `sfxEvents` 项最少需要 `{id,eventId,name}`，`eventId` 必须存在于 film manifest 编译的共享场景；可选 `options`、`kit`、`sourceGain`、`sourcePan`、`seed`、`mixGainDb`。顶层 `sfxKit` 是未指定单件 kit 时的默认，默认为 `clean`；当前 kit 是 `clean`、`chip`、`lofi`、`cinematic`、`organic`。当前名称可调用 `pop tick click whoosh whip thud impact paper stamp ding chime sparkle count riser draw type boing slide hit subdrop reverse glitch shutter`。选定 kit 有相同名称的实现时用 kit 变体，否则回退到基础 SFX 函数；若 kit 有 `post`，按源码既有顺序施加一次。

`options` 只传该效果实际读取的参数：`dur` 用于连续/渐变音效长度，`ticks` 调整 `count` 的节数，`note` 是按当前 `keyContext` 解释的音阶级数，`pitch` 是效果的频率倍率。字段是否被某个声音使用由其固定源码决定；不要把 `options.at`、`options.gain` 或 `options.pan` 放进去，适配器会拒绝它们。外层 `sourceGain`（默认 1，范围 0–4）与 `sourcePan`（默认 0，范围 −1–1）由源效果生成时烘焙；mono source 会应用 pan，whoosh/whip 等双声道 source 保留原 stereo hard-pan，sourcePan 不会二次移动声像。`mixGainDb`（默认 0 dB，范围 −120–24 dB）是后级 plan event 的独立调整。`seed` 可指定数字或字符串；省略时以稳定 effect/event/canonical 时间组合生成。SFX-only 的机器请求形状如下；`eventId` 必须替换成现有 film manifest 的稳定 ID：

```json
{
  "format": "laohu.motion.huashu-audio-request/1",
  "keyContext": { "rootMidi": 60, "scale": "major" },
  "sfxKit": "clean",
  "sfxEvents": [
    { "id": "event-effect-1", "eventId": "event-from-scene", "name": "tick", "options": { "pitch": 1 }, "sourceGain": 0.8, "sourcePan": 0, "seed": "stable-seed", "mixGainDb": -3 }
  ]
}
```

请求不得含 `hitFilmSec`、`filmTimeSec` 或 `timeSec`；实际时间和局部 clock 只能来自同一 film manifest。`sfxEvents[].sourceGain/sourcePan` 与 `mixGainDb` 分别控制源生成与后级音轨，不互相替代或重复套用。

在 film manifest 已由画面构建步骤生成、工作文件都位于同一工作盘后，从仓库根目录运行 adapter 与现有 mixer。请求与 base plan 由主线从当前工程产生；`--plan` 与 `--output-plan` 必须位于同一目录，因为锁定音轨等 `assets[].file` 和 ASR `asrcutBinding.evidence` 均按 audio-plan 所在目录解析。适配器原样保留这些相对引用，不复制媒体、不改锁定样本。`audio.mjs --asset-index` 要求绝对路径，因此示例用 `$PWD` 展开仓库根目录。下面路径变量指向该工程文件，不是要求用户额外填写一套模板参数：

```sh
mkdir -p "$WORK_ROOT/audio/generated" "$WORK_ROOT/audio" "$WORK_TMP/audio"
node .agents/skills/laohu-motion/scripts/huashu-audio.mjs render \
  --request "$WORK_ROOT/huashu-audio-request.json" \
  --plan "$WORK_ROOT/audio-plan.base.json" \
  --film-manifest "$WORK_ROOT/film-manifest.json" \
  --assets-dir "$WORK_ROOT/audio/generated" \
  --output-plan "$WORK_ROOT/audio-plan.generated.json" \
  --manifest "$WORK_ROOT/huashu-audio.receipt.json" \
  --project-root "$WORK_ROOT"

FILM_SCENE="$(node -e 'const fs=require("node:fs"),p=require("node:path"),m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(p.resolve(p.dirname(process.argv[1]),m.audioEventScene.path))' "$WORK_ROOT/film-manifest.json")"
node .agents/skills/laohu-motion/scripts/audio.mjs \
  --plan "$WORK_ROOT/audio-plan.generated.json" \
  --scene "$FILM_SCENE" \
  --asset-index "$PWD/.agents/skills/laohu-motion/assets/audio/index.json" \
  --output "$WORK_ROOT/audio/final-mix.wav" \
  --manifest "$WORK_ROOT/audio/final-mix.receipt.json" \
  --cache-dir "$WORK_TMP/audio" \
  --ffmpeg "$MOTION_FFMPEG" \
  --allow-generated-preview
```

第二条命令传给 mixer 的 scene 正是第一条从 manifest 解析的文件。若当次只生成配乐或只生成音效，请保持请求的对应分支，不为凑齐轨道强加另一类声音；若成片应静音，继续用现有静音路径，不调用 adapter。`--allow-generated-preview` 只允许检查未审生成物，不升级审核状态。

适配器的 `empty` 表示页面明确显示无结果；网络、页面解析或下载失败必须按对应状态记录，不得改写成“没有可用素材”。`probe_unavailable` 表示 ffprobe 工具未能启动或完成检查（退出码 8），不能记作音频文件无效；只有探针成功运行并确认媒体无效时才返回 `file_invalid`。下载资产中的精确许可标题、许可 URL 与署名要求应一同复制进 `audio-plan.v1` 的 `assets`；返回文件继续是 `candidate-unreviewed`，除非对应源文件、使用范围和派生素材已经满足本节真实听审记录的复用条件。

本地入口消费 `audio-plan.v1` JSON。顶层必需 `schemaVersion:1`、`timeUnit:"seconds"`、`timeBasis:"film-global"`、`durationSec`、`sampleRate:48000`、`channels:2`。`tracks` 每项需有 `id`、`assetId`、`bus:"music"|"voice"` 和成片全局 `startSec`；可选 `sourceInSec/sourceOutSec`、`speed`、`gainDb`、`envelope:{attackSec,releaseSec}`、`locked`、`timeMapId`。`voiceWindows` 是成片全局 `{id,startSec,endSec}`；`ducking` 使用 `{targetGainDb,attackSec,releaseSec,preRollSec?,holdSec?}`，其中 `preRollSec` 提前 attack 起点，`holdSec` 延后恢复；省略时沿用原有 attack/release 行为，未实现的 ducking 键会拒绝。music `automation` 用 `{bus:"music",startSec,endSec,gainDb,fadeInSec,fadeOutSec}`，全部按成片时钟计算。音效 `events` 每项需有 `id`、`eventId`、`assetId`、`bus:"sfx"`，由 `eventId` 指向同一作品/场景事件；可选 `timeMapId`、`offsetSec`、`hitTimeSec`、`sourceInSec/sourceOutSec`、`speed`、`gainDb`、`envelope`。`timeMaps` 每项使用 `{id,localStartSec,localEndSec?,filmStartSec,speed}`。音乐与旁白轨的 `startSec` 是成片全局秒；提供 `timeMapId` 时才把它解释为该映射的局部时间。`track.loop:true` 和计划内 `playbackRate` 不支持；循环应从素材编辑成派生源，音高变化也在源编辑阶段完成。`speed` 是保音高 `atempo`，不是 `playbackRate`。

当最终剪辑计划含 source-free presentation 时，剪辑音频导出会包含对应精确样本数的空白；它仍然是一条完整原声 WAV，不要再把每个 source clip 逐条铺进 voice bus。使用已有入口生成下游 audio-plan：

```sh
node .agents/skills/laohu-motion/scripts/audio.mjs prepare-asrcut-plan \
  --edit-plan /绝对路径/frozen-edit-plan.json \
  --timeline /绝对路径/frozen-timeline.json \
  --receipt /绝对路径/voice.wav.artifact.json \
  --voice-wav /绝对路径/voice.wav \
  --voice-asset-id asrcut-voice --voice-track-id asrcut-voice \
  --output /绝对路径/audio-plan.json [--base-plan /绝对路径/base-audio-plan.json]
```

生成的计划用一条锁定 voice track 从 film sample 0 播放整份 WAV；`voiceWindows` 只由 source unit 的 `targetRange` 派生，不覆盖 presentation，也不尝试从 ASR/SRT 的低精度时间推断更细的语音活动。窗口可能包含 source 内的原始停顿，音乐 duck 仅代表素材需要给已知口播区间让位。独立的 `presentationWindows` 保存每个无来源展示段的 scene、精确边界、visual/audio handoff；后续制作可据角色选择延续音乐、降低音乐、安排 SFX 或静默，但不会自动把麦克风样本为零解释成最终混音全静音。当前声音交接是计划输入，不等于已生成特定声部或已有 duck 自动化；要产生音乐变化，仍须通过本 Reference 规划的 `ducking`/automation 或事件并由 consumer 实际混音。

该 helper 校验冻结计划 hash、canonical timeline、asrcut exporter receipt、WAV SHA 和采样数；render 时再次核验同一证据、duration、voice track 与 source/presentation 窗口。剪辑 revision、hash 或 WAV 变更后，丢弃旧 audio-plan 并从新 final timeline 重建。`--base-plan` 可继承现有音乐、SFX 与自动化，但片长必须与 timeline 完全相同，且不得已有 voice track 或 voiceWindows；否则拒绝生成，不暗中压缩/延长工程。原声资产默认 `candidate-unreviewed`，需明确进行技术预览并人工试听后再按项目资产规则更新审核记录；成功读文件、混音或波形检查都不是听审。

作品场景可在顶层 `audioEvents` 或 `objects[].data.audioEvents` 导出共享事件。事件可用 `filmTimeSec` 明确表示成片全局秒；若使用 `timeSec` 或 `time`，必须通过事件、所属 `data` 或场景声明精确的 `timeBasis:"film-global"|"scene-local"`。`filmTimeSec` 自带全局基准；若同一事件还显式写了冲突的 `timeBasis`，consumer 会拒绝。scene-local 事件必须由 cue 的 `timeMapId` 映到成片时间；全局事件不得再套局部映射。缺基准、自然语言时间说明或过期映射不会被猜测成全局时间。主线根据普通语言目标、工程和素材导出这些内部字段，普通用户不需要手工填写 cue 或素材 ID。

项目 `assets` 每项至少有 `{id,file,durationSec,sha256,license,redistribution:{status,basis|notes},reviewStatus}`。资产记录还应保留 `author`、`source.page`、`source.version`（来源包版本）和 `license` 中精确的许可名称/版本；在 `redistribution.basis/notes` 或对应许可记录中写明署名与修改条件、商业使用、同步进成片/改编及源文件单独再分发边界。`syncUse` 是脚本识别的可选同步权限字段。授权状态须表达源文件再分发和同步进成片的不同边界：`redistributable` 表示可按记录分发源件；`sync-only` 表示可同步进成片但不随工程/素材包单独交付；`not-authorized-for-redistribution` 只有在另有 `syncUse:"allowed"` 的明确许可时才可用于成片；未核实、相互冲突或禁止同步的权限会被拒绝。可复用的文件审核记录至少绑定具体文件 `sha256`、覆盖文件完整时长的 `sourceRange`、适用范围、非占位 `reviewer` 和 `conclusion:"pass"`；局部审核只能保持候选，派生文件要以自身 hash 和完整区间独立登记。记录字段校验不能证明实际试听，真实试听的证据仍由审核者提供。`reviewStatus:"ready"` 应对应符合这些条件的真实记录；consumer 只核验登记状态和文件 SHA-256，不读取审核记录或许可原文，也不验证是否真的完成过听审。任何来源的 `candidate-unreviewed` 只有技术预览显式传 `--allow-candidate` 才能使用。`project-generated` 的 WAV 可按具体文件和 SHA-256 注册在 `assets`；只有确实听审后才标 `ready`，否则标 `generated-unreviewed` 并显式启用生成预览。

`generatedAssets` 仅支持 `{id,generator:"ffmpeg-lavfi",recipe}`，当前 recipe 限于 `tone`（`durationSec`,`frequencyHz`,可选 `endFrequencyHz`,`gainDb`,`envelope`）与 `noise`（`durationSec`,可选 `color`,`seed`,`gainDb`,`envelope`）。recipe 输出固定是 `generated-unreviewed`；计划中的其他 `reviewStatus`（包括 `ready`、`candidate-unreviewed`、`blocked` 或 `unknown`）会被校验拒绝，不能用字段声称生成物已听审。明确的 `--allow-generated-preview` 才能混制这类输出，并会在 WAV/manifest/mux 记录技术预览状态。它是有边界的 WAV 生成入口，不是通用拟音合成器。

素材按稳定 `assetId` 从 `.agents/skills/laohu-motion/assets/audio/index.json` 或 plan 的 `assets` 查找。运行时核对实际文件 SHA-256，并按索引登记的许可/授权字段与审核状态执行门禁；脚本不会读取或判定许可原文，也不能替代来源核验。项目资产同样要登记文件 hash、许可来源和审核状态，由维护者确认记录与来源相符。音效开始时间为 `事件成片时刻 - (hitTimeSec - sourceInSec) / speed`；命中点来自索引时保留其估计方法/置信度。负起点会裁掉越过片头的源段，过片尾会裁掉尾音，实际使用区间与裁切会进入 manifest。时间值始终用秒；最终 WAV 按 48 kHz 换算样本并输出立体声。

`audio.mjs` 依次使用 cue 的明确 `hitTimeSec`、索引 asset 的 `hitTimeSec`，两者都没有时回退到源文件绝对 0 秒；它不会把 `sourceInSec` 自动当作命中点。命中点若落在所选 source range 之外（例如 source 从 0.2 秒开始但命中点仍回退到 0），consumer 会拒绝该 cue，不能静默移位。manifest 在 cue 未明确覆盖时可能仍记 `asset-index` 方法标签，因此实际数值、估算方法和置信度要分开阅读；默认 0 不是听审结论。未听审候选须保留 `hitTimeSec:null`，不能把默认值报告成听审结果或正式同步。若技术预览确实需要临时位置，事件计划须明确记录假设、来源区间及候选/技术预览状态；无法说明时先等实际试听确认，再创建该 cue。

核对音效的源文件区间、实际活动区间与 attack/release 包络分别在哪里：lead-in、变速和裁切会改变命中点在成片中的位置，须按 consumer 计算后试听最终派生 cue；不能让画面按新速度移动、音效仍按旧速度命中。尾音应在最终有效区间内自然释放；若为了切段/节奏设计有意硬切，须确认截断没有产生爆音或误导性残响，并在全片上下文试听。波形或样本边界只能标示技术区间，不能替代听审；实际声音没有被听过时维持未审状态。

`candidate-unreviewed` 素材默认不能用于正式输出；只有制作技术预览时才显式加 `--allow-candidate`。recipe 生成物与仍未听审的项目生成 WAV 需要 `--allow-generated-preview`；两个 flag 只放行相应的未审状态，不会绕过 blocked、unknown、权限冲突或其他拒绝状态。预览开关可配合 `--video/--final-output` 检查同步，但 WAV、manifest 和 mux 视频仍全部是技术预览产物，manifest 会保留未审状态并置 `technicalPreview:true`；不能把它们当正式成片、标为 ready 或宣称听感通过。实际试听过的生成 WAV 应作为带具体文件、SHA-256、许可/同步范围和审核状态的 `plan.assets` 登记，再由正式调用按普通已审核文件复用。没有合适素材且未能完成听审时，可继续完成独立画面，声音保持待审预览或明确静音，不伪装 ready，也不阻塞无关画面。

下面的命令先写入一个自包含技术 plan，再生成一段 picture-only 测试画面，并将测试音封装进去。单音只验证接口，不是推荐的成品声音；普通制作由主线/作品构建从声音目标、共享事件与可复用素材导出 plan。替换路径时按工程真实位置使用工作盘内的绝对路径：

```sh
mkdir -p "$PWD/.cache/validation/motion-reuse-integration" "$PWD/.cache/tmp/motion-reuse-integration/audio"
cat > "$PWD/.cache/validation/motion-reuse-integration/audio-plan.json" <<'JSON'
{
  "schemaVersion": 1,
  "timeUnit": "seconds",
  "timeBasis": "film-global",
  "durationSec": 3,
  "sampleRate": 48000,
  "channels": 2,
  "events": [],
  "tracks": [
    { "id": "music-bed", "assetId": "test-tone", "bus": "music", "startSec": 0.25, "gainDb": -12, "envelope": { "attackSec": 0.2, "releaseSec": 0.4 } },
    { "id": "voice-guide", "assetId": "test-voice", "bus": "voice", "startSec": 0.5 }
  ],
  "voiceWindows": [{ "id": "speech-window", "startSec": 0.5, "endSec": 1.25 }],
  "ducking": { "targetGainDb": -18, "attackSec": 0.04, "releaseSec": 0.16, "preRollSec": 0.08, "holdSec": 0.12 },
  "automation": [{ "bus": "music", "startSec": 2, "endSec": 2.8, "gainDb": -8, "fadeInSec": 0.1, "fadeOutSec": 0.2 }],
  "generatedAssets": [
    { "id": "test-tone", "generator": "ffmpeg-lavfi", "recipe": { "kind": "tone", "durationSec": 3, "frequencyHz": 220, "gainDb": -12 } },
    { "id": "test-voice", "generator": "ffmpeg-lavfi", "recipe": { "kind": "tone", "durationSec": 2, "frequencyHz": 900, "gainDb": -30 } }
  ]
}
JSON
MOTION_FFMPEG="<本机已有 FFmpeg 可执行文件>"
"$MOTION_FFMPEG" -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=black:s=640x360:r=24:d=3" -an \
  -c:v libx264 -pix_fmt yuv420p \
  "$PWD/.cache/validation/motion-reuse-integration/picture.mp4"
node "$PWD/.agents/skills/laohu-motion/scripts/audio.mjs" \
  --ffmpeg "$MOTION_FFMPEG" \
  --plan "$PWD/.cache/validation/motion-reuse-integration/audio-plan.json" \
  --asset-index "$PWD/.agents/skills/laohu-motion/assets/audio/index.json" \
  --output "$PWD/.cache/validation/motion-reuse-integration/mix.wav" \
  --manifest "$PWD/.cache/validation/motion-reuse-integration/audio-manifest.json" \
  --cache-dir "$PWD/.cache/tmp/motion-reuse-integration/audio" \
  --video "$PWD/.cache/validation/motion-reuse-integration/picture.mp4" \
  --final-output "$PWD/.cache/validation/motion-reuse-integration/final.mp4" \
  --allow-generated-preview
```

示例 plan 使用未听审 tone recipe，所以命令显式启用 `--allow-generated-preview`；本次 WAV、manifest 和 mux MP4 都只能作为技术预览。若试听候选素材再做预览，追加 `--allow-candidate`；两种未审素材同时存在时两个 flag 都要加，正式调用不带相应预览 flag。没有事件与轨道代表明确全静音：consumer 会保存静音 WAV 作为工程中间产物，但最终视频使用 `-an` 不创建静音 AAC。存在声音时，源轨会按秒/速度裁切、生成 fade/gain、映射至全片时间、按 SFX/music/voice 总线混音；`voiceWindows` 和 music `automation` 在轨道延迟后应用，确保它们读取成片全局时钟。最终 mux 用明确的 `-t durationSec`，不使用 `-shortest`；结束后检查容器流与实际长度，避免由较短声轨截断画面。

`locked:true` 的既有轨只允许固定时点解码、重采样到 WAV 与最终封装；消费者拒绝对其裁源段、变速、增益、fade、loop、时间映射或负起点。若该轨属于 music，它会跳过 voice-window duck 和音乐 automation，manifest 记录 `duckingOrAutomationSuppressed:true`；同一计划里的其他未锁音乐轨仍可消费这些自动化。为止于成片规定长度，锁定轨可能只在影片末端被边界裁切，manifest 明记实际源区间与裁切；需要完整保留的声音必须让成片 duration 与音轨尾端相容。其它声轨只应用蓝图明确给出的裁切、速度、gain、envelope 和自动化。

传入 `--video` 的视频必须是无音轨的 picture-only 输入，且视频流长度至少等于 plan 的 `durationSec`；已有音轨会在写出混音前被拒绝，不能静默丢掉。要保留用户锁定声音，先由作品构建把它作为 `locked:true` 的明确计划轨注册并提供对应音源；画面输入应是无音轨版本，或使用现有工程混音完成封装。锁定轨会进入 WAV/AAC 输出路径；若用户要求 bit-exact 原始声轨，应使用原工程的保真封装流程。

没有既有 picture-only MP4 时，可只输出 WAV 与 manifest 并去掉 `--video/--final-output` 两个参数。输出路径、plan、scene、index、资产和输入视频不能互相覆盖或互为别名；同一保护也适用于输出、manifest 与最终视频之间。较短的输入画面、scene 或 plan 不会靠 `-t` 被伪装成相同片长。

混音响度、动态、立体声宽度、淡变和频段处理由节目目的、素材、旁白和播放设备决定，不规定统一阈值。实际正常速度听审混音及最终 mux，确认 cue 落点、旁白可懂、音乐/SFX 不抢主信息、没有削波或意外断音；在单声道折叠和移动设备播放时也检查承重声音是否仍可辨，未覆盖的播放环境标为未测试。hash、codec、波形/RMS 与 `audioStream` 字段只能证明技术状态，不证明听感。资产授权、混音是否完成和成片音质是三个独立结论。

## 验收

检查授权和源版本、cue 是否来自同一事件表、片内时间映射是否正确、有效声部是否按职责使用、静音边界是否守住、最终视频是否真包含预期音轨；然后正常速度试听成片，至少定位一个声音最密集处、段落交接和结尾。只检查编码、音轨流或峰值不算听感验收；未试听的范围标为未验证。若用户只要分镜或声音时间表、不渲染，则停止在已交付计划，不声称已完成混音。
