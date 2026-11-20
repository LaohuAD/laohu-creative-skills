# 音乐、音效与静音设计

> 适用范围：本文主体描述既有 Motion audio-plan、Remotion Film 与本地 audio.mjs 混音路径，仅用于继续已有工程。新建 Motion Showreel 按 [Showreel 声音与 Arrangement 接续](../showreel-sound.md) 选择成品来源，并由该工程唯一混音链输出声音。


本 Reference 决定一条动画是否需要声音、声音承担什么作用，以及怎样把有授权的音源接入真正输出的媒体。它不规定固定音色、音乐风格、音效数量、响度或曲库。声音来源先按用户锁定的制作方式分流：用户只是“允许必要时原创”时，普通制作先查本地成品，再按需走真实来源搜索/获取；若确认缺少适用成品，且授权覆盖相应声部，才进入现有原创生成专项。用户明确要求某声部“必须原创/从零作曲”时，这是已锁定的制作方式，直接进入相应成熟生成专项，不再先证明所有成品音源都不适用；授权仍只覆盖明确的 `music` / `sfx` 声部。无论哪种分支，均须保留真实指令摘录、授权范围与请求哈希，最终混音再次核对。仅仅说“新片需要声音”、本地缺素材或风格不匹配不构成原创授权。无旁白、未点名 BGM 或需要阅读都不能单独决定全静音。若成熟完整入口提供画面与声音工作流，先核对其声音声明和实际 consumer，再按本片职责编排：保留适用声部，控制密度/音量或留出阅读静音窗；不强行加 BGM，也不机械铺满源 SFX。

## 输入与返回

**输入：**用户对旁白、对白、现有音乐/音效、静音、音轨版本与可编辑范围的要求；镜头蓝图中的视觉事件、焦点变化和时间基准；可用且授权的音频素材、合成器/音频编辑器、混音及最终交付规格。

**何时运行：**完整新片制作或授权修改涉及全片音轨/声音总设计时，在分镜预算阶段运行；无旁白、未点名音乐或缺少音源都不跳过这次判断。在该阶段按段落及真实表现变体，先把音乐、SFX、环境声、留白的职责与用途写进同一蓝图，声音需共同覆盖不同镜头/任务时分别记清适用区间，不把一个候选声源泛化成全片方案。完整动画/知识样片的常规主线，在决定留白或静音前，先依据本段动作、注意路径和段落节奏检索并在对应画面相位实际试合/试听至少一项适用的成熟声音方案，再据声画效果决定保留、留白或静音；声音职责不要求拟真声源，也不以“信息只能靠声音传达”为前提。无拟真声源、没有已核准的 ready 文件或用户未点名音乐，不能代替成熟来源查选与试合；未听过的候选也不能作为“静音更舒服”的依据。若使用尚未听审的来源，沿现有技术预览/未审状态试合，不改标 ready；试听条件受限时保持未完成/UNKNOWN，不为此新增费用。只有取舍仍有重大未决时才对比多个候选，不设固定 A/B 数量。用户明确要求完全静音、仅画面/底片交付或已有锁定静音方向时，可直接遵守。局部任务若用户要求声音、需保留/检查音轨，或导演判断特定声音会帮助表达、节奏、氛围、空间或交互反馈，也要运行；本轮仅作局部视觉修改且原音轨明确不在授权范围内时可跳过此 Reference 并保持原音。它不强制加入 BGM/SFX，也不要求为每个动作补声。

**返回与消费者：**在同一镜头/事件表中，返回是否有旁白、BGM、SFX、环境声或静音；每项声音的用途、资产来源/授权、事件 ID、时钟基准、目标 cue 时点/时长、剪辑或合成方式、混音角色、实际输出状态和待确认点。主流程消费声画职责；工具链据事件表生成/对齐音频、封装最终视频并播放检查。不能只在蓝图写“加音效”，却让 renderer 或交付没有可消费的 cue。

声音按整段作用与具体材料安排，并与画面一同预算：先判旁白、音乐、环境、动作声音和安静各自承担什么，再为确有需要的事件完成本片素材检索、许可核验、真实试听、选段/命中点和混音位置。无须复杂声音处理时就沿现有 `audio-plan.v1` 与 `audio.mjs` 完成；控制曲线或空间处理只有在实际声音缺口要求它且已有真实 consumer 时才选择。试听记录必须对应实际文件 hash、使用语境与被听区间；公共索引候选和技术参数不会因接口新增而批量变成 `ready`。编码成功、波形检查或素材存在都不能替代最终混音的实际听审。

当前 `audio.mjs` 只接受 plan `/1`。尚未实现的 plan 顶层 `controlSource`、`processing` 与 `rooms` 会明确拒绝，不能写入后假设 consumer 会读取；这不禁止资产 metadata 中同名描述字段。Huashu 生成分支的 `sourcePan` 仍按该分支的源生成行为使用；它不是 Motion plan 的后级连续声像。未实现 `/2` 不得作为可用处理接口推荐。

## 1. 先分开旁白、音乐、音效和静音

### 普通生产的成品声音路径

先用实际画面事件说明需要什么声音材质、时长、力度与情绪，再查 `assets/audio/index.json` 中按职责、材料、力度与长度筛选的已登记成品，并核对真实文件、许可和用途；目录有文件不等于它适合这段。SFX 本地没有合适候选，或试听发现现有文件不匹配时，沿 Arrangement SFX Reference 的真实 provider `search` → `get` 路线取得许可明确的成品音效，并用 `sfx-sources.py source-register` 以回执、许可证据、文件 SHA-256 和实际 probe 登记到同一索引；BGM 本地无合适曲目或段落时，沿可用的真实音乐来源获取成品音乐并以相同身份/许可链登记，不能把 SFX 来源接口当音乐曲库。搜索结果/下载请求不是音频文件，未完成 `get`、登记与 probe 的候选不算可消费资产；不能把失败的获取记作已下载，也不能把 `candidate-unreviewed` 自动升级成 `ready`。收到登记结果后，按同一 asset ID、文件 hash、source/license、role、用途与事件锚点在本片试听计划和最后的 `audio-plan` 中引用，不能在最终混音时另选一个相似文件。来源页/索引中有出处的 `use_for`、`avoid_for`、听感说明可连同来源标识和字段出处保留，作为来源描述或筛选线索；不得把它们写成本片听审。本轮自听须另记实际文件 hash、区间、画面语境、审核者与状态；估算要标明估算和依据，不得冒称听审。没有可核来源备注且未实际听过时，只写许可、文件格式/时长等可核信息，不猜材质、情绪、起音或音质。外部检索应保留 TLS 验证，获取失败时保留真实错误/重试回执并继续查可用候选；不通过关闭证书校验绕过失败。

成品音乐必须经真实音乐端点搜索：`source-search --role music` 路由到 Mixkit free-stock-music、Freesound 音乐结果或 Pixabay music/编辑歌单解析；不得把它送入 SFX 页面。对选中单曲再执行 `source-get` 解析详情、核对该文件的许可与可再分发边界、下载和 probe，最后 `source-register` 到共享 audio index。`candidateGroups` 的六个 canonical `useCase` 是 `narration-bed-light-advance`、`lively-explanation`、`rhythm-demonstration-collage`、`tense-reveal`、`no-voice-chapter-showcase`、`closing-resolution`。组列出的是候选，未听审曲目不会作为默认胜者输出；先按 `assetId`、准确源区间和本片 `useCase` 搜索，再在画面、旁白/无旁白与剪辑进退中试听，不能仅凭标题风格词或点击命中认定适用。

`trackType`、`voice`、`instruments`、`density`、`tempoBpm` 逐项区分来源页面声明与 `unknown`。来源没标 loop/fulltrack/cue 时不能靠波形、时长、标题或分类猜定；人声标签也不能替代实际口播遮蔽试听。音乐人工 `fail`/`conditional` 按文件原始 SHA-256、重叠源区间及 canonical `useCase` 留作独立适用性拒绝，local search/groups 和 audio-plan final consumer 都检查；未填用途时要求补用途，显式 `--allow-candidate` 不绕过拒绝。`useCase:all` 只用于明确全用途都不适用。模型/agent 反馈不声称已听、不改 `ready`。SFX 既有 `--scope` 接口保留，不能把一个 SFX 语境失败改写成 `all`。

候选仍为 `candidate-unreviewed` 时，若必须验证技术时间映射，可显式允许一次技术预览；生成的计划及最终 receipt 必须继续标为未审/技术预览，不能宣称音质通过。正式声音是否适用由实际听审判断，文件有许可或技术解码成功不代表它悦耳、自然或适合本片。若当前无法听审，保留该状态，不能伪造审核记录。

**选择静音前检查完整源工作流。** 同一效果有 raw picture 与已接通的完整声画入口时，正常完整动画先将完整入口纳入 renderer 比较，不因 raw 候选 `available` 就过滤掉前提可满足的 `conditional`。只有明确交付无声/仅底片、独立音频计划已完整承接源声音，或对本片源声部的实际职责与听审支持移除时，才为此选择 raw/静音。源默认声部仍须按许可、用户锁定项和本片声音职责逐项核对；一个 SFX 过密可删减/静音该事件，不推出整轨静音。无旁白、未点名音乐和屏幕文字需要阅读只是安排密度、音量与安静窗口的输入，不是删掉所有源声音的理由。

SFX/音乐职责先用 Motion 兼容入口 `sfx-sources.py local-groups --duty <duty-id>` 检查候选角色与缺口；再以确切 `assetId` 运行 `local-search --asset-id <assetId> --review-scope <本段实际用途>` 核验文件、hash、权利及适用审核。当前索引中的 `music-tech-progress-bed` 是科技推进音乐的实际职责组：先按这个 duty 查询，再对返回的 asset ID 做本片用途的本地核验；职责名和来源描述仍只是候选线索。组/角色命中仍只是候选；真实试听后才可用 `local-review --asset-id <assetId> --scope <听审语境> --full-file` 或 `--in-sec <起点> --out-sec <终点>`、配合实际 `--reviewer`、`--conclusion <pass|conditional|fail>` 和 `--confirm-listened` 写入审核记录，范围只覆盖确实听过的文件或区间。职责空缺或候选不适用时，通过 Arrangement 已有的成品来源检索、获取和登记路径继续补充；不能把职责组/索引匹配写成已听审。

只有用户在本轮请求中明确授权原创 `music` / `sfx` 声部，才可运行 OM 原生 source `sound.mixdown` 从 ABC、musicPreset、声明的 source SFX 与共享 FX 生成新音频；现有组件技术上具备该能力或 source group 条件满足，不是生成授权。若用户表达的是“允许必要时原创”，必须先确认相应声部没有适用成品来源；若用户明确要求某声部“必须原创”，则按锁定的创作方式直接沿用这一成熟源函数，不再要求证明所有成品都不适用。两种情况都须由真实授权覆盖本次生成的声部。原 p0 为 `music.off:true`、无 ABC、且 source declaration 的 hits 与 canonical declared-SFX 对得上时，也可在明确 SFX 授权后将这一段作为 SFX-only source group 交给同一原函数。若是已经生成并有来源/授权记录的既有音轨，可作为已存在的源资产复用；不得为了复用而重新调用生成器。SFX-only candidate 由哈希验证的完整 OM source scene、p0 声明和该段 `time:<segmentId>` map 推导，不增加 Film 时间表或 source registry。获得生成授权后，两路仍只在窄技术条件全部满足时自动选择：请求不另选 `composition`/`musicPreset`、不发起 `sfxEvents`、`musicMixGainDb` 为 0；base audio-plan 没有既有事件、music automation、ducking 或其他轨道。允许无 voice；带旁白时只允许恰好一条从 film 0 秒开始的锁定 voice track，且必须有非空 canonical `voiceWindows`，不允许其他轨道。适用时，adapter 用固定原声明 `p0` 调 `sound.mixdown(p0,{voiced:<本片段有映射旁白窗>,words:<由voiceWindows经timeMap得到的源段本地窗>,voiceLufs:<实测值>,score:<原ABC或null>})`。`voiceLufs` 基于实际旁白音轨的双声道测量；旧的单声道折算加 3 LU 不再作为 voice level 估算。不在该片段时钟内的窗不传给该段。若该片段没有本地旁白窗，则 `voiced:false`。音乐关闭的 SFX-only 路径显式传 `score:null`，原 p0 的 `music.off` 让源 mixdown 不生成音乐。`out2` 不包含 voice WAV；旁白原轨只由最终 `audio.mjs` 作为一条锁定 voice track 加入一次。原预混 track 保持未锁定 `bus:"music"`、0 dB、原始 asset 全段、1×速度，并使用该段唯一的 `time:<segmentId>` map。

已获授权的原生 source mixdown 不适用或请求要求独立控制时，先判断是否符合下述 request-generated source group；两条源混音路径都不适用或用户要求后级独立控制时，再按 stems。原生 source mixdown 的 `alignment.nativeSourceSoundtrackSelection.reasons` 会说明为何排除，例如显式音乐/SFX 请求、非零音乐增益、已有 BGM/其他轨、多个或未锁定的旁白轨、缺少锁定 voice windows、base events、automation 或 ducking。SFX-only 原源组只有在生成授权覆盖 SFX 且满足相同 eligibility、声明/事件/映射核验一致时才完整预混；`music.off` 不会被解释成“加入一条音乐”，自动关闭音乐的同时保留原 SFX/FX。进入完整 source mixdown 后，源 hit 只有在实际 OM runtime hit 与 canonical event 的数量、顺序、名称、源时刻、gain/pan/options 均相符时才保留为 `bakedCanonicalEvents` 证据；不一致时失败关闭。它们不再作为独立计划事件生成。旧 OM Film `/1` 使用 `sourceProcessing.format:"laohu.motion.source-premix-processing/1"`；Video Shotcraft Film `/2` 必须使用 `/2` marker 并声明 `nativeBaseSourceContract:"nativeBaseSources/1"`，分别绑定 canonical Film event scene 与通过 child receipt/hash 核验的完整 OM 原 source scene/p0、score、asset PCM、segment/timeMap，以及（有 voice 时）voice 文件 hash、locked track、voiceWindows hash、测得 LUFS 和映射后的本地窗。`sourceKind` 与原 receipt 分支一致。`audio.mjs --scene` 会复核这些实际引用、SFX↔timeMap 映射和来源身份；任一 hash/版本/时钟变化、或旧 consumer 不能识别 `/2` context 时即拒绝，不能静默少混一条源声。此路径不接受锁定 premix 来绕过混音检查，不允许追加 plan 级 automation/ducking 或重复 baked hit。它是可追溯的源段 soundtrack，不是全片 mixer；最终仍由 `audio.mjs` 拼装并 mux 一次。

### request-generated source group：生成音乐与手动 SFX 的兼容源组

只有用户明确授权生成音乐及相应声部范围时，才评估本地生成音乐和若干共享事件 SFX 的 `laohu.motion.request-generated-source-group/1` 路径。若授权只是“必要时原创”，先走成品优先路线，缺少适用来源后再评估；若本轮明确要求原创音乐，则直接评估这一成熟源生成路径，无需先证明所有成品 BGM 均不适用。该路径仍要求机器请求为 `/2`、恰好一个新生成 `musicPreset`，且不选 ABC `composition`、既有 BGM 或录音样本包时才候选；经解析的源 preset 必须覆盖全片时长。请求若显式给 `keyContext`，其 root/scale 还必须与源 p0 一致；不一致时保留指定调性并走 stems。base audio-plan 不能已有音乐/非旁白轨、SFX events、automation 或 ducking，Film 也不能已有 native source SFX。允许没有旁白；若有旁白，只能有一条从 film 0 秒开始的锁定 voice track，并带真实 canonical `voiceWindows`。请求必须能提供原文件路径和 SHA-256；缺少请求来源回执时不宣称此组已被选中，沿实际支持的 stems 路径处理。授权仅限 SFX 的请求不能进入该 music 生成组；只授权音乐时，手动 SFX 仍须使用许可清楚的成品候选。

手动 `sfxEvents` 可有多条，但必须使用与 source preset 相同的 kit。先按实际提示音材质/动作力度选择能承担它的 source preset；如需设 kit，只给整份 request 选择与该声源相符的 `sfxKit`，不要为通过 group 条件而机械改写单个事件 `kit`。若所需 SFX kit 与 preset 不相容，就保留真实音色选择并走 stems。每个事件仍从 Film 共享事件 ID 和实际 time map 取时点；用 `sourceGain`/`sourcePan` 在 source `renderSfx` 阶段定源强度与声像，省略自定义 per-hit `seed`，并省略 `mixGainDb` 或保持 0。不要仅为了让 SFX 与音乐一起进入 renderer 而填逐事件 seed 或非零后级增益；如果用户明确要求这些独立控制，保留原要求并使用 stems。`request.musicMixGainDb` 是这一组实际支持的音乐总线增益：在原音乐完成目标响度归一后、与共享 FX/总线合并前应用；默认 0 dB 不额外乘一次，输出 group track 固定为 0 dB。不要再对预混 group 重复加 plan track gain。

适用时，适配器以 pinned 的 `sound.mixdown` 将 source preset 与 manual SFX 在一次源处理链中合成完整片长的 stereo WAV；它会使用 source 原有 FX/room/master 链并显式采用 `mixBusMode:"default-sum"`。一个 canonical SFX hit 只进入这条 WAV 一次，不得再作为分立 `audio-plan.events` 复制。track 上的 `sourceGeneratedGroup` marker（format `laohu.motion.request-generated-source-group/1`、owner `laohu-motion.request-generated-source-group`）与 audio-source receipt 的 `alignment.requestGeneratedSourceGroups[]`、selection 结果绑定原 request 文件与规范化 request hash、preset sourceP0 hash、source/local closure、canonical event/timeMap bindings、输出 WAV hash，以及有旁白时的 locked voice 文件 hash、实测 LUFS 和 voiceWindows hash。该组不把 voice WAV 烘焙进去：原 voice track 仍由 `audio.mjs` 最终混音一次，`voiceWindows` 只用于 source mixdown 的音乐让位。它是 `audio-plan.v1` 内由 track marker 和 receipt 验证的完整声源资产，不是 `audio-plan` `/2`，也不开放 plan 顶层 `processing`/`rooms`。

需要独立音乐、逐事件 SFX、旁白编辑、外部轨、plan 级 automation/ducking，或其他 group 前提不满足时，沿既有 score/preset + canonical SFX stems 分支；这些分轨不等价于原 mixdown，默认 preset 的窄审计已观察到共享 SFX room、FX gain、high-pass、bus compression、总 loudness 归一与 limiter 不在该拆轨输出中。music-off 的 SFX-only source group 若因上述独立控制不能预混，也沿 canonical events/stems 保留，但明确记录其不含原 full-mixdown FX。具体字段和覆盖边界见[工具链](toolchain-render-and-check.md)与[来源证据](../../SOURCES.md)。若需要独立音乐总线控制而新生成 group 的兼容前提不满足，使用已接通的 stems；这不要求每段都有 BGM。

明确本轮各声部是否存在并可编辑：

| 需求状态 | 处理办法 |
|---|---|
| 有旁白/对白 | 使用明确版本的实际音轨对齐事件。保护原语句、版本和内容锁定；配乐与音效不能盖住承重词、限定或停顿。没有原音时只作暂定语义预算，不声称同步。 |
| 无旁白，但有声音要求 | 仍可用音乐、音效或环境声；按视觉动作和观看任务选择。不要把“无配音”简化成“无音轨”。 |
| 用户未点名 BGM/SFX | 需求保持开放，不等于禁止采用已选完整来源的原声声明；按本片职责审视原音乐/SFX，并决定保留、调整或移除。没有音乐本身不记为缺陷，也不为补足轨道机械加声。 |
| 用户明确要求无 BGM 或无 SFX | 只移除对应声部；其他被授权且仍有职责的声部可保留。 |
| 用户明确要求完全静音 | 不添加配乐、音效、环境声或生成音轨；最终输出按静音交付，并确认没有意外音轨。 |
| 用户指定既有音轨需保留 | 核对具体文件与版本；按授权原样保留或只在允许范围内处理。不能用另一条音乐/合成声替代被锁定原轨。 |
| 用户要求特定声音，但音源缺失 | 先查已有、获准且实际可调用的声音源和许可清楚的素材；可用时按原 composer/接口或真实素材接入。不因缺声源新写简化合成器，也不把未审候选说成合格成音。仍没有适用来源时，只暂停该声音及其混音工作，视觉与时间线中不依赖它的部分继续；若用户锁定某个来源/版本，不擅自替代。 |

## 2. 让声音承担可说明的角色

**声音随可见动作成形。** 分镜预算阶段先确定声部职责和大体轨迹；当主体、材料、运动曲线、速度、接触/落定相位及空间尺度在实际画面中形成后，将对应成熟音源放进该画面和旁白里，按起音、主体、尾音与动作过程共同完善声音。画面改变时，同步回查音源、选段、时值、命中点、音乐重音和混音；不能因前期已有配乐或 cue 表，就只保留秒数对齐而冻结声音设计。

自然感来自声音与眼前动作属于同一种可感的事件：拟真场景核对材料、重量、距离和空间响应；风格化图形、文字与抽象关系也按其可见尺度、速度、力度和情绪选择相称的声响。轻小短促的出现若配尖锐而持续的长尾，应先检查音色、选段和释放过程是否误配，再决定替换、裁切或调整已有成熟处理；只降总音量不能证明已修好。需要重击或长尾时，画面过程和表达重点须有相应承接。最终在正常速度、完整旁白和音乐中检查听感与注意力，波形、峰值和时间表仅辅助定位，不代替试听。

**先定整段声音轨迹，再填 cue。** 先按段落/镜头任务决定旁白存在时各声部何时进入、支撑、让位、恢复与收尾；无旁白时音乐、SFX 或静音分别承担什么作用；用户要求完全静音时则保持无声。把阅读、结论、转折和停顿纳入同一轨迹，不能把“没有旁白”推断为全静音，也不能因为没有旁白就自动加 BGM。轨迹明确后再选个别 cue、音色、素材和自动化，避免先给每个视觉动作补声再拼出一段无主次的音轨。复用既有配乐/预设时，它只是候选：核对本片段落结构、能量起伏、重音落点、转场、停顿、结尾与画面事件的实际关系，并在本片画面上试听后再决定；同系列、同项目或上一版用过，不代表适合当前片。淡入淡出、ducking、响度平滑只处理轨道电平，不会补出缺失的乐句发展、段落起伏或节奏组织；若结构不匹配，应换曲、改用合适的本地编曲机制，或选择静音，而不是只把旧音乐拉长/截短/调响。尊重锁定音轨、授权静音、仅画面预览及无法试听的例外，不以它们反向要求必配音乐。

对每项 cue 写清为什么此刻需要听到它。可选职责包括：

- **事件提示：**标出弹出、切换、连接、选择、落定、揭示或状态反馈。
- **动作质感：**为特定物体或材料提供重量、摩擦、触碰、运动或空间的可听线索。
- **段落/氛围：**用音乐或环境声保持一种空间、情绪或叙事张力；主题变化、留白和停顿随段落职责安排。
- **信息层级：**提示一次重要焦点或结论落点，不用声音重复每个关键词。
- **静默：**让阅读、等待、转折或结果留出注意空间。

**按段落控制声响密度，不让每个动作都变成提示音。** 先选能承载段落重音的少数声部，其余动作可由音乐节奏、连续运动声或留白承接；连续的小动作若逐个叠短促高频音，会听成通知声/机枪声，而不是更丰富。若试听感觉拥挤，先删并发的高瞬态层、拉开间距或把连续动作合成一个有方向的扫动，再判断是否需要调频段或增益。最终取舍仍须在本片画面、旁白与音乐完整并行播放时判断。

具体素材怎样按起音、主体、尾巴、动作材料与重量选段，何时裁切/叠层、何时才原创，归 [Arrangement 视听声音设计与源音频处理](../../../laohu-arrangement/references/sound-editing-and-mixing.md) 的专业方法。Motion 主线负责判断事件是否需要声音、给出画面相位和共享事件，再消费实际返回的素材与计划；不要把每个动作机械合成为同一种正弦提示，也不要因模板或画面动作自动补 cue。

只有当声音角色、素材与时点仍是有实际影响且未解决的选择时，才制作同画面、近似总响度的 A/B 试听版本；其余制作不做形式化音量对照。A/B 只帮助比较当前声部方案，不取代授权核验或最终混音听审。

**具体 SFX 的选材与必要源剪辑由 Arrangement 主入口路由。** Motion 主线先决定视觉事件是否确实需要 SFX，再把动作、材料、重量、强度、目标相位、锁定项与同一 event ID/时钟交给 [Arrangement 主 Skill](../../../laohu-arrangement/SKILL.md) 的视听声音分支。该入口按自身知识塔条件决定是否调用 SFX 子级，再返回带来源、许可、hash、实测长度和候选状态的真实素材；必要时提供 `audio-edit.mjs` 派生 WAV 与回执。普通 Motion 完整声音任务已授权按此专业路径工作，不要求用户另选入口或重复授权。只需 BGM、原样保留锁定音轨或完全静音时，不为凑流程选择 SFX 子级。新下载与派生文件仍为 `candidate-unreviewed`，只有绑定准确文件 hash、完整实际听审范围与使用语境的审核证据才可标为 `ready`；最终由 Motion 接入并检查唯一声音计划。

素材检索、分组筛选和源剪辑命令由 Arrangement SFX 子级维护；匹配结果只缩小候选范围，不等于试听、许可确认、技术适配或混音适配，也不会改变 `assets/audio/index.json` 中的审核状态。Motion 现有 `scripts/sfx-sources.py` 通过 `source-search`/`source-get` 兼容入口调用本项目 `laohu-arrangement/scripts/laohu-sound.py`，原有本地索引组、已审核素材与 Freesound 官方 API 命令继续可用。新的源检索支持 Mixkit、Freesound、Pixabay 与 Kenney；按事件动作、材料和目标时长筛选后再参考 provider 自己的顺序，不把跨站 likes/downloads 当成可比较的受欢迎度。UI 素材将 Kenney 排在前面，同时可显式带上其他 provider。Python 可用 `--python` 指定，或由 `LAOHU_SOUND_PYTHON` 配置；默认 `python3.12`。索引、插件依赖与候选文件都留在工作项目的 `.cache` 和工作目录。

```sh
python3 .agents/skills/laohu-motion/scripts/sfx-sources.py source-search \
  --work-root "$WORK_ROOT" \
  --cache-dir "$WORK_ROOT/.cache/sound" \
  --tmp-dir "$WORK_ROOT/.cache/tmp/sound" \
  --query "wooden latch closing" --action "closing" --material "wood" \
  --max-duration-sec 1.2 --providers kenney,mixkit,freesound,pixabay \
  --role ui --limit 12 --pages 2

python3 .agents/skills/laohu-motion/scripts/sfx-sources.py source-get \
  --work-root "$WORK_ROOT" \
  --cache-dir "$WORK_ROOT/.cache/sound" \
  --tmp-dir "$WORK_ROOT/.cache/tmp/sound" \
  --key <provider-key> --out-dir assets/audio/sfx
```

The bridge returns Arrangement's `schemaVersion:1` result without changing provider status, source URL, exact-license verification, source statistics, measured file metadata or candidate state. A fetched file remains `candidate-unreviewed`; the tool reports `sourceHitpointSec:null` and `clipOperations:[]`. After choosing it, use Arrangement `audio-edit.mjs` with an explicit source range/hitpoint and preserve its spec/receipt; Motion records the returned file/hash, actual probe result, license and edit evidence on the existing `audio-plan.v1` asset/event, then sends that one plan through `scripts/audio.mjs`. Discovery, download and video preview do not invent a synchronization point, create a second timeline or replace the final mixer. See [Arrangement SFX source and edit workflow](../../../laohu-arrangement/skills/laohu-arrangement-sfx/SKILL.md) for exact provider and `audio-edit/1` fields.

选中来源后，只有听审记录绑定相同具体文件 hash、当前适用范围/使用语境、非占位的具体审核者标识和 `pass` 结论，才可复用审核结论；其源区间还必须从文件 0 秒覆盖到实测完整时长，因为现有 consumer 只消费整文件的 `ready` 状态，不读取审核过的局部范围。只听过局部片段时继续标 `candidate-unreviewed`，不得把整份文件交给 consumer 当作已审核。更换派生文件后，以派生文件自己的 hash、完整实测区间和相应语境重新记录；语境变化也复核。程序可核对记录字段与文件身份，但不能证明记录者真的听过，真实试听仍由记录者的实际证据承担。调起音、裁切、增益与尾音仍须回到实际画面和全片声轨中判断；候选尚未听审时只在明确技术预览中使用。许可与文件来源不明时不冒称可用，只暂停依赖该素材的声音部分，其余画面照常推进。素材记录关联 source/derived 的 asset ID、路径、哈希、授权、听审记录、适用范围及实际处理方式；没有符合上述条件的真实听审证据就不得标成 `ready`。最终混音效果单独听审；波形、编码成功或文件名不能证明听感。

实际 envelope 必须按选定的源区间、素材真实时长和变速后有效时长计算；裁切或变速后重新核对 attack/release 终点，不能沿用原长度让床音包络落在音频已结束之后，也不能让 envelope 延长超出 source 真正可用的尾部。硬切可以是有意设计的段落边界，只要最终听审确认没有意外爆音/残响并符合画面职责。锁定音轨按其权限原样保留，不能对它施加淡变、duck、loop、gain 或变速。`ducking` 只在已有编排上辅助让位，不替代选择、删减或重排声音素材；无旁白的屏幕阅读也可能需要安静窗口。

FFmpeg recipe 是有限的本地 WAV 生成入口，不是通用拟音器。经 recipe 现场生成的 WAV 始终为 `generated-unreviewed`；`generatedAssets[].reviewStatus` 省略或显式写 `generated-unreviewed` 才能通过校验，写成 `ready` 或其他状态会被拒绝。未试听生成物时，只有显式使用 `--allow-generated-preview` 才能做技术预览，输出 manifest 会标记 `technicalPreview:true`；它可与 `--video/--final-output` 同步查看，但封装结果仍不是审核通过的正式声音。如果生成 WAV 后来确实经过试听并审核，把具体文件作为 `plan.assets` 项登记 `file`、`durationSec`、`sha256`、许可/同步边界与 `reviewStatus:"ready"`，再按一般已审核素材复用。脚本检查登记字段、权限门禁与文件哈希，不会验证是否真的听过。仍未听审的项目 WAV 则继续标 `generated-unreviewed`，只走生成预览开关。

这是一套按角色做判断的方式，不是预设“片头一定 whoosh”“每次高亮都 pop”“每个镜头有几次音效”或指定固定 BGM 风格。参考素材的声音也只有在确实播放/试听后才能记录其听感；视频存在音轨不等于已听过，代码能够合成也不等于声音好听。

## 3. 让 cue 与动画共用一个时间事实

把音频 cue 和视觉动作放在同一事件源中，至少记录稳定事件 ID、成片全局时刻或明确的局部时钟/映射、视觉动作前后态、声音角色、资产、预期起音与落点。先为 cue 选它服务的相位：起势引导、接触、揭示、关系显现或结果落定；不要把事件 `start` 自动当成声音点。需要提前或延后时，偏移应从同一事件的轨迹/相位求得并写明原因，保持声画共享同一时间事实。旁白存在时，按语义段落规划音乐如何进入并支撑、何时让位与恢复、最后留尾还是转静默，再试听校准，不等已经明显遮盖才处理。声画适配按同一事件/同期窗口听看，观察动作、旁白与音乐在此处的进退；全曲峰值或整轨峰值差不能代替段落能量与同期判断，电平数值和同窗遮蔽的具体判读见 Arrangement 的[混音判断方法](../../../laohu-arrangement/references/sound-editing-and-mixing.md)。无旁白但有屏幕阅读时，留白可能需要较安静的窗口，不因每次停顿就自动抬高配乐。音乐起落、退让/恢复、增益与尾音引用镜头或段落锚点，不另手抄互不关联的秒数，并须落到真实生成脚本、轨道自动化、DAW 或 FFmpeg 参数。检查音源生成、轨道自动化和混音后处理是否重复施加了淡变/增益；若有意叠加，明确乘合后的最终包络及其控制归属，不把双重处理误当成一次曲线，也不一概禁止叠加。

同一阶段的音乐/音效瞬态可能与字幕出现、闪光、颜色突变、主体动作、人脸表情或相机移动同时争夺注意。把声音放回真实画面，在相同的阅读、动作和交接窗口里判断它是在支持当前任务，还是盖过另一个承重变化；依实际任务错开起音、让某声部退让或保留并列重音。若本段主任务正是整体氛围或强烈的视听冲击，多个强变化可以共同承担它；不预设必须压低音乐、消除瞬态或把画面收成静态简洁。

复用或升级已有工程时，分别检查 renderer 实际消费的画面状态/轨迹与旧 `audioEvents`、cue 名和时间。旧事件 ID、秒数及 `drop`/`land` 等标签可作为稳定锚点和候选编排，不能证明相应物理动作发生，也不能单独证明当前视觉相位。按当前 renderer 实际读取的 KEYS、phase、对象前中后态与运动/可见度曲线核对声音角色：`move-peak` 要对应实际运动峰；若把声音解释为物理 `impact`/`contact`/`land`，须有画面支持的接触、落定或状态跃迁，单纯淡入不代表冲击。声音不必写实，音乐性标点或抽象 `impact` 强调仍可用；此时明确它强调的信息显现或焦点交接，并按该画面落点定相位和实际听审，不称为不存在的物理碰撞。旧 cue 与当前动作不符时，按真实画面重选声音角色/素材或省略，不靠改事件名制造动作。素材的源 `sync.at`/`hitTimeSec` 是声音内部待对齐的位置，不是新的画面时刻；根据已核实的画面相位及素材有效速度推导素材起点/偏移，通过现有 `phaseId`/`phaseOffsetSec`、cue `offsetSec` 或实际 `timeMapId` 路径写回，保留稳定事件 ID并记录轨迹相位与源同步点的推导。不得把旧 cue 秒数直接当作新素材的源起点，也不得另手抄第二套时间。

校准命中时分开记两种误差：源文件内部的有效 hitpoint/起音延迟，以及该渲染、封装路径中实测的输出偏移。先以当前实际素材、裁段/变速参数和同一 film 时钟重测，再在最终渲染中核对；不要把一个来源文件的内部延迟或某种编码的输出偏移当成全局常数，也不要在素材起点和最终输出位置重复补偿。按素材类型、裁切、速度和输出路径复测，不复制其他样本的帧数或毫秒值当全局常数。保音高变速会改变瞬态的起音与峰值位置，具体偏移随源素材、裁切、速度和处理路径而变，必须对当前派生音源和最终输出复测。需要随速率改变音高时沿 Arrangement 已有 `audio-edit.playbackRate`；不要用保音高 `audio-plan.speed` 假装同样处理。裁切、变速或重新封装后都要在真实输出中复核，未覆盖的源材质/速度/设备组合保持未验证。

先给段落/场景的主重音选声音角色与强度，再安排辅助声部和背景音乐，避免每个小动作都抢成同等级命中。区分预先引导、运动质感、接触/命中、结果尾音和音乐支撑；它们可错时、叠加或在阅读窗口中退让，实际声部数量由当前事件职责决定。音量变化沿用旁白段落、结果落定或视觉焦点交接等真实锚点，在旁白存在时先保护清晰度；没有旁白时也可为屏幕阅读留安静窗口。复用已有素材时以索引里的授权和候选状态为起点；只在源 hash 与适用范围匹配真实审核记录时复用，派生文件、源区间或事件语境变化后重新核听，最后混音仍需独立听审。未听审的候选不能当成已验证声音。

同一事件表可以被场景脚本读作画面事件，并由本地音频 adapter 读作 cue。Huashu Motion 接入路径从 film manifest 校验同一蓝图、全局事件场景、素材场景与时钟映射，再把音乐和音效写入现有 `audio-plan.v1`；最终仍由 `scripts/audio.mjs` 消费同一全局事件场景并只混音一次。不能把未知的 `audio` scene 字段写进 JSON 冒充功能，也不能另手抄第二套事件时间。动画 renderer 可以继续只负责无声视频帧，声音在成片封装时合入。

Video Shotcraft Film Blueprint `/2` 只渲染 picture-only 画面；声音沿现有 `audio-plan.v1` 与唯一 `scripts/audio.mjs` 混音路径接续。Film `/2` 的 `sourceScenes[]` 仍绑定 canonical `audioEventScene`，一般 source/overlay event 按其来源路径和 hash 解析；完整 OM 的 score、preset、hits 与 `sound.mixdown` 则只经独立 `nativeBaseSources[]` child receipt/source hash 接入，`audio-source` 写入 `source-premix-processing/2`，`audio.mjs` 逐项验证并消费一次。完整 OM source sound 符合窄 eligibility 时可保留原有耦合 mixdown；不符合时退回既有 stems 分支，不假称原 DSP 已保留。选用 Video Shotcraft 时，来源动作如何绑定实际词/行、ASR point 与可选 `audioEventId`，按[源接入规则](video-shotcraft-integration.md)使用；source 视觉 landmark 本身不自动产生 SFX，也不能直接把演示音轨当作已授权资产。最终还未做 audio-plan/mixdown/mux 时，不能把无声 render 称作完整有声成片。

## 4. 可执行的本地合成、对齐与混音路径

常规制作先从画面角色与事件定义理想声音，再检查已登记成品源。若本地无合适来源、候选不匹配或适配未知，必须沿 Arrangement 已有 provider 流程尝试真实 search/get，核对许可和来源、下载并登记文件 hash 与 probe，再按画面和旁白共同试听与细化选段、cue 和混音。网络失败、provider 失败、许可未知、文件不可探测及真实试听不合格是不同结果；前几种不是“全世界没有合适素材”的证据。Arrangement 主入口按自身条件选择 SFX 专项方法；用户用普通语言描述声音目标即可，Motion 不要求手填低层字段。源 composer、musicPreset、SFX 函数、OM `sound.mixdown` 与其他程序声音生成都属于原创声部。用户只是“允许必要时原创”时，适用成品源缺失后才进入已有实现；用户明确要求某声部必须原创时，沿其锁定方式直接进入对应成熟实现。两种路径均须有按 `music` / `sfx` 限定的真实授权；声音需求或素材缺失本身不是授权。没有合格成品且无生成授权时，保留待解决的声音职责与实际阻断，并继续可独立的画面；不得静默降级为近似素材、静音、删 cue 或改画面。`scripts/audio.mjs` 的有限 tone/noise recipe 不是缺声源时的通用拟音替代，也不能声称能生成任意音色。

### 已有源机制与耦合声音处理

沿现有来源的真实执行链核对素材生成、画面 cue 命中/提前量、段落或乐谱编排、增益/让位/循环和时长变化后的重算责任。用户仅允许必要时原创时，普通生产先复用已登记的成品声音；适用来源缺失且授权覆盖相应声部后，才调用源 composer、score、DSP 或源声音混音机制。用户明确要求某声部原创时，按该锁定意图直接调用对应成熟生成机制，不强加成品来源排除证明。获授权后通过本地音频入口与唯一计划接入实际机制；不要只复制几个波形函数、另编一套循环/CUE 秒数表来替代成熟源机制，也不要在无授权时把已有 composer 当成默认兜底。

Huashu Motion 的源 `runtime/clip/clip.js` 中，`C.SFX` 给 cue kind 提供默认候选，`CLIP.mount` 再读取 `cue.sfx`（含 false 静音）、按 lead 与真实 cue 时刻调用 `OM.sfx`；音乐也消费场景标签或乐谱 mark。这组逻辑属于完整 wrapper，不在 Art Motion raw native-clip 中。默认候选须由本片声音角色判断取舍，采用时保留起音/命中语义；当前本地 raw clip 没有自动导出这组事件，不能因画面模板运行成功就宣称声音也已生成或同步。需要接线时从同一份已解析事件读取，不另手写时间副本；未完成连接的范围明确保持待接入。

Film `/1` 的 `laohu-native-om-template` 是一条已接通的完整 OM 路径：原 `script#clip-spec` 经 `CLIP.mount` 消费，运行后的 `window.__om.sound().hits` 与 cues 投影到 Film canonical `audioEventScene`，源时间只经 `time:<segmentId>` 映射。`sourceCueBindings` 只定位原 cue 并改写其源锚或 `sfx` 字段；`sfx:false` 由原 `CLIP.mount` 静音，默认 SFX 仍由本片导演判断。OM hits 先成为 canonical source events，但声音生成依下文选择一条互斥路径：符合窄条件时，原 `sound.mixdown` 可连源 score/preset、hits 与共享 FX 一起保留；若完整 OM 段的原 p0 声明 `music.off:true`、没有 ABC 且声明了 SFX，仍可用同一原函数生成 music-off 的 SFX-only source group：不生成音乐，但原 hits、FX room 与 source master 仍按原调用处理，不因此补 BGM；每个源 hit 继续留作 baked event 的来源/时间证据，不再另生成 SFX。对于有旁白的段落，仅允许同一条既有锁定 voice track 和已确认 `voiceWindows` 进入这条完整源 mixdown；原 mixdown 让位于这些区间，但旁白 WAV 本体仍只由最后的 `audio.mjs` 加入一次。其他需要旁白独立剪辑、外部/锁定音乐、独立增益、手动事件控制或后级自动化的情况，沿原 score/preset + canonical SFX stems 路径。`omScore` 保留原 ABC 与 score labels/marks/seed/key，`nativeSourceCompositions`/`nativeSourcePresetPlans` 提供原声源输入；二者如何进入完整 soundtrack 或独立 stems 见下节与[工具链](toolchain-render-and-check.md)。`omMusic:{off:true}` 只关闭该源音乐、不移除同段 canonical SFX；在没有单独音频控制且 source declaration/hits 可校验时，这组事件可连同原 FX 走 SFX-only `sound.mixdown`；需要单独控制时仍退回可编辑的 canonical SFX/stems；明确选曲或 base audio-plan 已有音乐轨时保留既有音轨并抑制自动源音乐。分轨路径的 `musicMixGainDb` 只应用一次；完整 source mixdown 的音轨保持 0 dB。源 OM 只出 silent picture，源音轨在交给 Film 前剥除；最终仍只有 `audio.mjs` 混音一次。当前浏览器 E2E 分别覆盖白板 ABC、default-preset 和带单条锁定旁白的 source mixdown；`music.off`、显式选曲、locked BGM 与 musicMixGain stems 的分支由各自 fixture/receipt 记录，范围见[来源与证据](../../SOURCES.md)。这些技术覆盖不证明人类听感或其他模板均通过。

检查增益与状态的实际消费者：mono/stereo、源处理/后混音必须按同一约定应用增益，不能意外平方；循环接缝、淡变与轨道结束须按真实源区间计算。参数、声部数量、峰值或源码保真只证明技术条件，音色合适与混音舒服仍依据实际听审。


### 本地音源入口与来源追溯

获授权的原创声音任务沿 `.agents/skills/laohu-motion/scripts/laohu-audio-source.mjs` 接入已有生成实现，不另写一套 DSP。兼容入口、request format 和技术回执继续保存准确来源身份、版本/闭包 hash 与处理映射；普通作品名称和对用户的声音描述使用本地能力名称，不以来源项目名称代替本片段落意图。获得声部范围授权后，一般生成路径可走 product/style preset、明确谱面/mark 的 ABC composer；单件独立生成音效走公开 SFX 函数与 `Track`，不直接调用私有 `renderSfx`。选定的成品 BGM 派生处理沿其原素材分支；适用的完整 OM 段只有在授权且满足前述严格条件时才调用原 `sound.mixdown`，把整段混音作为可追溯的源 soundtrack asset，而非第二个全片 mixer。录音样本默认关闭，不会隐式读取或构建用户 home 中的样本。

普通动画需要配乐且用户允许按需原创时，先选项目内已登记的成品 BGM；若不适配，再检索并获取具有明确来源/许可的成品曲目，按当前片子的段落职责剪辑和编排。用户明确要求本片音乐必须原创时，跳过成品选曲分支并按该要求进入 `/2` `musicPreset` 或 `/1` ABC composer 专项。两者都需在真实请求中明确授权 `music`；“新配乐/音乐底床”只是声音需求，不自动等于生成授权。授权成立后，`musicPreset` 必须且只选择一个 `product` 或 `style`；按本片声音蓝图选择实际存在且适配内容的来源预设，不虚构产品或风格。先看画面和叙事的前中后变化：若段落确有进入、发展、重点或收束，就从已核实事件中选边界，把意图写为 `sections:[{eventId,energy}]`，可按真实剧情选择 `dropEventId`、`endEventId`；需要明确速度时才给 `bpm`。这些字段由主线从现有事件表编译，不让用户抄时间。`energy` 控制整体段落电平，不能代表逐乐器编配、节奏密度或声部进退；style 只选择来源语法，不能代替段落设计。若成片本来要稳定织体，沿用稳定编排，不为了制造“有变化”虚造能量段。获授权后最终应走实际 `/2` 输出 WAV 的路由，不能只交 prompt/风格参数。仅在普通制作或“允许必要时原创”的分支中，用户明确指定 ABC/具体音符/旋律/谱面/具名 mark、hit 或 rise 控制并同时授权音乐生成时，才选择 `/1` ABC composer；不能用该选择绕开仍适用的成品来源优先顺序。用户明确要求原创时，按前述锁定意图走成熟生成专项。没有适用成品来源且用户未授权原创时，调整配乐职责、保持安静或省略该声部；不得自动转入原创。用户提供现成强拍音乐并要求卡拍剪辑/事件对齐时，可直接对该素材作只读拍网格分析；不必先把它改写成 ABC。

`/2` 预设请求 shape 为 `{"format":"laohu.motion.huashu-audio-request/2","musicPreset":{"product":"<实际支持的 product>","sections":[{"eventId":"<已有共享事件>","energy":0.5}]}}`，或将 `product` 换成实际存在的 `style` 字符串；两者不能同时传。每个 section 只引用 Film 共享事件的稳定 ID，不接受从另一份手写秒数表取代画面时钟。适配器把 section 事件的 canonical 成片时刻交给本地 source plan，并将能量编译到 source `music.energy`；实际预设 stem 从 48 kHz float stereo WAV 写回同一 `audio-plan.v1`。`dropEventId`、`endEventId` 和 `ending` 也须绑定同一事件；不是每片都需要 drop/end。`keyMidi`/`scale` 仅在用户或已确认配乐上下文明确指定调式/根音时覆盖；否则保留来源 style/product 默认，避免把小调类预设强制改为大调。`selectedMusicTrackId` 用于已选 BGM 的派生分支，不与新作曲/录音样本分支混用。

已经选定的成品 SFX 与源生成 `sfxEvents` 是不同入口：检索/分组方法见 Arrangement SFX 路由；选定真实文件后，可原样消费，或由 Arrangement `audio-edit.mjs` 生成带源 hash、裁切/淡变和派生 hitpoint 回执的 WAV。Motion 将准确资产登记在 `audio-plan.v1.assets`，把素材内 hitpoint、源区间和共享事件 ID 写入 `events`，再让唯一 `scripts/audio.mjs` 按 canonical scene/timeMap 混音。检索命中或素材的来源同步点不能直接当影片秒数；技术预览可显式放行候选，但计划、WAV 与 manifest 必须保留 `candidate-unreviewed`/`technicalPreview`，不能替代真实完整听审。

同一请求还生成 ding/chime 等有音高 SFX 时，默认使用新生成 source preset 的 `score.plan` 实际 root/scale 经上游 SFX key 回调编配，并在 receipt 同时记录 `musicPreset.sourcePlan` 与 `sfxKeyContext`。若 `/2` 只把预设用于处理已存在 BGM，而请求没有明示 keyContext 或 preset key，不能把该预设的随机 root 当作现成 BGM 的真实调性；adapter 沿既有 SFX-only 默认 C major 生成并把“BGM tonal center unmeasured”记入回执。此时优先用非定音 cue，除非作者确认调性上下文；不添加未实现的自动调性检测。

拆轨的新生成预设沿用 pinned `score.plan`、`score.renderScore`、`score.pump`、style reverb、drop `buildSweep`、`rideEnergy`、事件 `automate`、源 fade、style `master` 和 `balanceLows` 的音乐支路处理，并保留原顺序；局部私有函数由本地 adapter 迁入并绑定现有 DSP，不声称它们是可直接 import 的 export。此分轨输出不调用整段 `sound.mixdown`，也不等价保留其共享 FX/总线效果。音乐让位按实际分支执行：若新生成 preset 有正确映射的 canonical `voiceWindows` 且请求未显式指定 final `ducking`，源端对音乐处理一次让位，`asset.source.voiceDuckProcessing` 记录实际 applied 状态、processor、窗口与坐标基准；显式 final `ducking` 时源端记 `applied:false`、processor 为 `audio-plan final mixer`，由最终 mixer 独占处理，避免双重压低。窗口映射不以旁白是否锁定、裁切或变速为前提。新生成音乐 preset 有可靠 voice LUFS 测量时按源规则以人声电平下方 12 LU 作为音乐目标；没有旁白时用来源目标 −18 LUFS；有旁白但无法可靠测量时用来源已有 −28 LUFS 音乐目标，并在 basis 中标明这是 fallback，不能伪称实测。实际目标及是否归一化以 `manifest.composition.sourceMusicLevel` 的 `targetLufs`、`preTargetLufs`、`targetBasis` 和 `normalizationApplied` 为准。完整 source group 的原 mixdown 已包含自己的相对电平处理，不要再叠加新生成 preset 的额外目标；已选 BGM/现成录音素材不套新生成 preset 的相对响度目标或 preset 染色。源 FX 电平基准只在 `/2 musicPreset` 新生成 stem、有人声且走独立 source SFX 路由时沿原 FX 处理一次：`sourceLevelGainDb` 按原音乐目标（音乐目标 +18 +4）得出，不包含用户后级 `musicMixGainDb`。原始 SFX WAV 与源 `sourceGain` 保持不变；adapter 把 `sourceLevelGainDb` 与 `userPostMixGainDb` 相加写入计划 `event.gainDb`，由最终 mixer 应用一次，不再烘焙源音频。`bindingsReport` 中的 `sourceLevelGainDb`、`sourceLevelGainBasis`、`userPostMixGainDb` 与 `postMixGainDb` 是不同回执事实，不能互相替代或再将同一后级增益算入事件电平。这个窄分支不定义所有 SFX 的统一音量，也不套到完整 source group、已选 BGM 或现成录音素材。完整预混与 stems 均不取代 `audio.mjs` 的最终 film mix；分轨生成的 music-only 48 kHz float stereo stem 时长须与 plan 完全一致，作为现有 `audio-plan.v1` music track 输入。

`selectedMusicTrackId` 的现成 BGM 分支只对已授权、未锁定来源的裁切区间读入 PCM，沿用原 `sourceInSec`、`sourceOutSec`、`speed` 与 `timeMap`；只应用该分支实际支持的片段能量变化和事件命中动态，不加新生成 preset 的 reverb、drop sweep、源 fade、style master、`balanceLows` 或相对响度目标。对授权且未锁定的 BGM，若 canonical `voiceWindows` 正确映射且无显式 final `ducking`，源端沿原处理让位一次；显式 final `ducking` 时由 `audio.mjs` 独占处理、源端不重复。锁定音轨不派生、不 duck，只能按授权只读分析。同事件/时间区间的手工 music automation 只抑制相应 event-hit 派生 duck，不抑制 voice-window duck；后者仍按是否存在显式 `plan.ducking` 确定由源端或最终 mixer 负责。

录音样本只在明确需要并已授权使用已取得/许可核实的项目样本包时选择：`musicPreset.samples` 必须声明 `{"mode":"recorded-required","packDir":"<项目内绝对路径>"}`，adapter 在首次 import 样本模块前设置明确 pack 路径与新进程/隔离运行时，校验 v2 manifest、所需 instrument IDs、许可/署名、文件 hash、音频元数据与完整解码；静默 decoder、缺样本或不完整覆盖都失败，不回退合成，也不回退 home 缓存。`samples build` 会显式运行 pin 的 `buildSamples({out,only,log})` 并验证实际输出；它可能从来源下载样本，只在用户任务已授权且请求此构建时才执行。构建命令为 `node .agents/skills/laohu-motion/scripts/laohu-audio-source.mjs samples build --out <项目内绝对目录> [--only <来源instrument-id列表>]`；输出目录在写入前须通过项目根与 symlink containment 检查，未知 ID、缺失许可或不完整样本不得以 exit 0 当作成功。合成回执区分实际解码文件与音符/释放层选用文件，不把整个预检包报成“实际使用”。

`musicPreset.samples` 只控制新生成的音乐 preset stem，不扩展到同请求中的 SFX。每个 SFX 必须从独立的固定源码 runtime 加载：首次 import 前设 `OM_SAMPLES=off`、关闭 recorded-required，并先把 sample pack cache 初始化为 null，再恢复调用者环境；不得复用音乐录音 runtime、pack 可见性或其模块缓存。音乐 receipt 继续报告实际录音文件；SFX asset 与 receipt 另行标明 synth-off 和未读取 recorded pack。

若输出已登记成可用的强拍音乐候选，且用户要求画面剪辑/事件跟随其拍点，读 [Arrangement 视听声音设计与源音频处理](../../../laohu-arrangement/references/sound-editing-and-mixing.md#选择强拍音乐的拍网格只读分析并对最终封装回测)，按同一计划映射拍点并在最终 mux 后从实际音频流保留 PTS 缺口解码回测；以画面流起点作 PCM 零点，不重复加音轨 offset。beat 周期与 nearest transient 可能出现整拍/半拍别名，不能由其平均残差推导唯一绝对音轨偏移；零双向匹配须作为 unresolved/review-required 交回人工判断。输出只是供画面/剪辑选择的候选，不自动生成事件或改动锁定片段。

请求通过 `--film-manifest` 读取并校验蓝图、ASR timeline/edit plan（若存在）、编译后的 `audioEventScene`、source scenes 和 `audioTimeMaps`。ASR 样本锚点保留精确原始时钟；画面帧边界独立按 fps 向上取整，残差记入 manifest，不把非帧对齐的声音事件移到画面帧点。适配器生成的 `audio-plan.v1` 继续只保存 `eventId` 与 `timeMapId`，`audio.mjs` 再从同一 `audioEventScene` 求全局时间；请求不能单独提供 `hitFilmSec` 或另一套 scene/timeMap。

整片音乐方向、段落进退、声部空间与何时留白的作曲/编配方法归 [Arrangement 视听声音设计与源音频处理](../../../laohu-arrangement/references/sound-editing-and-mixing.md)；Motion 仍将结果映射到同一事件与 `audio-plan.v1`。Huashu 上游 SFX 的 `sourceGain`/`sourcePan` 在已支持的源生成阶段烘焙一次，kit 后处理沿用源码。常规 stems 路径的 `mixGainDb` 应用到 plan SFX event，`musicMixGainDb` 应用到对应 music track；request-generated source group 则只在原 `sound.mixdown` 里用 `musicMixGainDb` 调源音乐，预混 group track 固定 0 dB，不能对已包含 SFX 的整组重复加 gain。原始 PCM 以 48 kHz 双声道 float WAV 保存，receipt 记录编码、peak 与越界样本数。新增 WAV 为 `generated-unreviewed`；生成、对齐或编码成功不代表听感合格。`audio.mjs` 仍是唯一最终混音入口，保留锁定轨、`voiceWindows`、ducking 与时间线门禁。

#### Composer 的 ABC 输入与共享标记

机器请求可用 `laohu.motion.huashu-audio-request/1` 或 `/2`。Composer 音乐分支使用 `composition:{scoreText,seed,durationSec?}`、`scoreSha256` 和 `bindings:{scoreSha256,marks?,hitRiseCues?}`；`scoreSha256` 是 `scoreText` UTF-8 字节的 SHA-256，两个 hash 字段必须相同，`durationSec` 若提供须等于 base audio-plan 的片长。`seed` 是有限数字或字符串。`/2` 可改用单一 `musicPreset`；不能在同一个 `/2` 请求中同时给 `composition` 和 `musicPreset`。`musicMixGainDb` 可选（默认 0 dB，范围 −120–24 dB）：普通独立 stems 路径将它应用于 music track；符合 request-generated source group 时，它只进入原 `sound.mixdown` 的 source music bus，组 track 保持 0 dB。`keyContext` 为 `{rootMidi:0..127,scale:"major"|"minor"|"dorian"}`；省略时为 MIDI 60、major。无 composer marker 时 `marks`、`hitRiseCues` 可省略或为空。

`scoreText` 使用上游 composer 当前实现的 ABC 子集：文件头 `X:`、`T:`、`M:`、`L:`、`Q:`、`K:`；各声部用 `V:<id> inst=<instrument> role=<role> gain=<number> transpose=<semitones>` 声明，鼓声部另设 `kit=<drum-kit>`。谱面用大写音名从 C4 起、小写音名高八度，`,` / `'` 调整八度，`^` / `_` / `=` 标升降还原音（同小节延续），数字和斜线写时值；`z` / `x` / `Z` 是休止，`[CEG]` 写和弦，`-` 连音，`(3` 三连音，`|:` / `:|` 重复，小节内可写 `[K:]`、`[M:]`、`[Q:]`。多声部须有相同小节长度。力度 `!pp!` 到 `!ff!`、`!crescendo(!…!crescendo)!`、`!diminuendo(!…!diminuendo)!`、`!accent!` / `>`、`!fermata!`、`!ped!` / `!ped-up!`、`!rit(!…!rit)!` 与 `!breath!` 都由上游乐谱解析器执行。

可接受语法以已 pin 的 [`composer.js`](../../templates/runtime/laohu-film-native/cli/lib/composer.js)、音色以 [`score.js`](../../templates/runtime/laohu-film-native/cli/lib/score.js)、音效实现以 [`sound.js`](../../templates/runtime/laohu-film-native/cli/lib/sound.js) 为准；这些源文件的 commit 与 SHA-256 由唯一模板 catalog 校验。

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
node .agents/skills/laohu-motion/scripts/laohu-audio-source.mjs render \
  --request "$WORK_ROOT/audio-source-request.json" \
  --plan "$WORK_ROOT/audio-plan.base.json" \
  --film-manifest "$WORK_ROOT/film-manifest.json" \
  --assets-dir "$WORK_ROOT/audio/generated" \
  --output-plan "$WORK_ROOT/audio-plan.generated.json" \
  --manifest "$WORK_ROOT/audio-source.receipt.json" \
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

本地入口消费 `audio-plan.v1` JSON。顶层必需 `schemaVersion:1`、`timeUnit:"seconds"`、`timeBasis:"film-global"`、`durationSec`、`sampleRate:48000`、`channels:2`。`tracks` 每项需有 `id`、`assetId`、`bus:"music"|"voice"` 和成片全局 `startSec`；可选 `sourceInSec/sourceOutSec`、`speed`、`gainDb`、`envelope:{attackSec,releaseSec}`、`locked`、`timeMapId`。音乐轨可带 `useCase`，值为 `narration-bed-light-advance`、`lively-explanation`、`rhythm-demonstration-collage`、`tense-reveal`、`no-voice-chapter-showcase` 或 `closing-resolution`；若资产有与所选源 hash、区间、情境匹配的适用性拒绝，消费端会阻止复用。缺少 `useCase` 时，带情境限制的候选不能按默认或 `--allow-candidate` 绕过；字段本身也不代表适用性已确认，仍须按当前画面、旁白与乐句试听。`voiceWindows` 是成片全局 `{id,startSec,endSec}`；`ducking` 使用 `{targetGainDb,attackSec,releaseSec,preRollSec?,holdSec?}`，其中 `preRollSec` 提前 attack 起点，`holdSec` 延后恢复；省略时沿用原有 attack/release 行为，未实现的 ducking 键会拒绝。music `automation` 的既有 `{bus:"music",startSec,endSec,gainDb,fadeInSec,fadeOutSec}` 中 `gainDb` 继续表示在音轨基础 `tracks[].gainDb` 上增加的 dB 值，保持旧计划语义。新计划可用互斥的 `deltaGainDb`（相对音轨基础增益的增量；可选 `trackId` 限定一条音乐轨）或 `targetGainDb`（要求 `trackId`；表示该条音乐轨希望得到的 automation 应用后源轨增益，而非 dBFS/LUFS）；例如基础 `gainDb:-13`、目标 `targetGainDb:-19` 时，mixer 只应用 `-6 dB` 自动化差值。不得在同一条 automation 同时给出 legacy `gainDb`、delta 与 target；target 与同轨重叠自动化也不得产生含糊叠加。`fadeInSec`/`fadeOutSec` 仍按成片时钟把该次增益变化从零渐入/渐出。可选 `eventId` 只保存与 Film canonical scene 共享的语义事件身份，不自动决定自动化起止点，也不替代显式的成片 `startSec/endSec`；存在 `eventId` 时必须给 `audio.mjs` 传入同一 Film scene (`--scene`)，并由它验证事件真实存在后才可保留到 manifest。event identity 不更改 legacy `gainDb` 的 bus-wide 加法语义，也不让位或改写其它 hit-duck ownership。锁定轨不可被这些自动化改变。音效 `events` 每项需有 `id`、`eventId`、`assetId`、`bus:"sfx"`，由 `eventId` 指向同一作品/场景事件；可选 `timeMapId`、`offsetSec`、`hitTimeSec`、`sourceInSec/sourceOutSec`、`speed`、`gainDb`、`envelope`。`timeMaps` 每项使用 `{id,localStartSec,localEndSec?,filmStartSec,speed}`。音乐与旁白轨的 `startSec` 是成片全局秒；提供 `timeMapId` 时才把它解释为该映射的局部时间。`track.loop:true` 和计划内 `playbackRate` 不支持；需要循环时先沿现有音频编辑路径剪成新的派生源，在完整乐句/自然段落边界处理接缝并为派生文件单独登记 hash 与来源，不能在 plan 里标 loop。不同来源的音乐段落可用 Arrangement `audio-edit.mjs` 的独立 `layers`、`startSec` 和真实源淡变构成重叠交接；`crossfadeSec` 当前仅表示同一 layer 的技术重复接缝，不能误作跨来源拼接参数。跨曲衔接应先在各自真实乐句/节拍/能量边界定位，再设置重叠与 fade，试听衔接处不存在无意静音、相位/和声突跳或节奏断口。声画同期与段落能量按计划使用的源区间和相同事件窗口试听，不以整轨峰值差推定适配。音高变化也在源编辑阶段完成；`speed` 是保音高 `atempo`，不是 `playbackRate`。

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

`candidate-unreviewed` 素材默认不能用于正式输出；只有制作技术预览时才显式加 `--allow-candidate`。recipe 生成物与仍未听审的项目生成 WAV 需要 `--allow-generated-preview`；两个 flag 只放行相应的未审状态，不会绕过 blocked、unknown、权限冲突或其他拒绝状态。预览开关可配合 `--video/--final-output` 检查同步，但 WAV、manifest 和 mux 视频仍全部是技术预览产物，manifest 会保留未审状态并置 `technicalPreview:true`；不能把它们当正式成片、标为 ready 或宣称听感通过。实际试听过的生成 WAV 应作为带具体文件、SHA-256、许可/同步范围和审核状态的 `plan.assets` 登记，再由正式调用按普通已审核文件复用。没有合适素材且未能完成听审时，可继续完成不依赖该声音决定的独立画面，声音保持 pending 或 technical preview，不伪装 ready，也不阻塞无关画面。只有创意设计明确规定静音，或 Analysis 修订创意设计确认静音，才把正式声音方案标为静音；技术预览中不加该声轨不等于作品已设计为静音。

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

<a id="remotion-beat-grid"></a>
## Remotion 辅助时钟与拍点纯函数

`templates/runtime/laohu-remotion/core/audio/beat-grid.mjs` 保留无依赖的单位换算与 cue 排程函数：`secondsToFrame`/`frameToSeconds`、`secondsToSample`/`sampleToSeconds` 对绝对边界转换并按目标单位量化；`beatGrid({bpm,offset,start,end,fps?})` 生成 `[start,end)` 内的 planned 拍点；`tempoCandidates(bpm)` 只列 half/original/double 候选，不判断哪档真实；`snapEvents(events,beats,{tolerance,sourceHash})` 只允许显式 `allow_snap` 且同 hash、有 evidence 的 measured beat，在声明范围内吸附，并保留原 `planned_at`、偏差与证据；`sfxStart(contactAt,peakOffset)` 计算提前起音并在负起点显式返回 pre-roll 需求。这个模块不读音频、不自动测 BPM、不验证跨事件因果或碰撞，也不测混音、响度、AAC 偏移和尾音。变速、裁切或换音源后，旧 measured beats/hash 失效；最终时钟、事件所有权和混音仍由现有 Film/audio-plan/`audio.mjs` 消费。
