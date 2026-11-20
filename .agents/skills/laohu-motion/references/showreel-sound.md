# 原生 Showreel 声音与 Arrangement 接续

本 Reference 只用于新建 Motion Showreel 项目。已有 Remotion、Film、audio-plan 工程继续沿现有音频 consumer 兼容维护；两路通过不同入口和时间合同隔离。

## 按真实听审能力决定声音路线（以成片情绪到位为核心）

先从本片 brief 与 `timeline.js` 判断旁白、音乐、动作声、环境声和留白各自承担的情绪与信息职责。用户给定或锁定的音源、明确要求静音或明确禁止原创声音时，严格按锁定范围执行；无声、无口播、loop 与录屏/实拍混剪均可成立。

进入选材或创作前，先按本轮实时提供的工具核实执行者**是否具备真实音频听审与情绪识别能力**（能直接读取音频/视频文件、真实听出音色质感、情绪走向、密度与人声遮蔽关系，而不是仅凭文件名、波形、响度数字或文本描述推断）：

- **具备真实音频听审与情绪识别能力（多模态执行者）**：本地音乐库、音效库与外部成品来源定位为**参考库与可选素材池**（与风格库、动效库同理），唯一核心准绳是把最终成片的情绪、节奏、质感与人声清晰度辅助到位。只要用户未锁定曲目或明确禁止原创，执行者可自由决策：
  1. 先实听参考本地成品库与适用候选，音色和情绪契合时直接选用并按共享事件剪辑编排（真实物理拟音与复杂多乐器原声大编制仍优先比较真录成品，避免用粗糙合成声冒充自然 Foley）；
  2. 若现有成品不贴合本片情绪、节奏或画面相位，或需要强绑定画面的定制音效/氛围铺底，可参考曲库质感自行设计并原创合成（显式采用原版 `synth`、`tone`、`layer` 或成品与自创混搭），无需为免费本地代码合成另行索要原创授权；
  3. 无论选用成品还是原创合成，均须对实际产出的音频及合片声画**亲自回听校验并迭代**（核查情绪是否贴合、有无刺耳/违和感、是否遮蔽旁白首字与承重词、段落衔接是否顺滑）。交付时如实注明由模型完成的多模态听审区间与调整结果；模型自听用于把关成片质量，不替代用户或最终人类接收者的终审品味与 `QUALITY` 证据。
- **不具备真实音频听审能力（纯文本或音频不可听环境）**：沿用防御路径——成品来源优先，本地无合适候选时检索外部有许可成品，没有合适候选时不自动转成盲写自制；只有用户明确授权原创音乐/音效及对应声部范围后，才进入本地程序合成；未经真实听审的素材一律标为候选/技术预览，不能标为 `ready`。

有口播时，ASRcut 与当前口播音源匹配的真实稿件、编辑结果和时间轴是说话内容与时间定位的依据；句级素材只支持句段锚点，词级动作需真实词时码。BPM/拍点可帮助挑选配乐或为不与语义冲突的视觉变化提供节奏参考，但不能为了踩拍移动实际台词、字幕可见区间、关键语义动作或其因果先后，也不能覆盖稿件中的词义锚点。没有口播时按真实画面事件组织声音，不建空 narration cue。

### 把情绪写成听得见的段落变化

先确定此刻要听清哪个词、听出哪个材质，或感受什么尚未发生。Chion 的语义、因果、还原聆听分别帮助检查词义、声源和音色本身。同一声响可以承担多种职责。快速讲解时让人声在前，试听无歌词、旋律稀疏的底床；需要读字或感到悬念时，对比保留底床和在承重词前抽空约 0.5–1 秒的版本。接触声用干而近的起音交代重量，较远的持续层托住空间。把重音留给观众需要感到的接触、转折或揭晓；轻微运动可以共用一个连续声势。Murch 对同类声部互相遮盖的观察用于决定此刻让谁退后，轨数由实际可辨度决定。[Chion 原文](https://www.soundstudieslab.org/wp-content/uploads/2012/04/Chion_-_The_Three_Listening_Modes.pdf) · [Murch 原文](https://rompusnetwork.org/portfolio/dense_clarity_by_walter_murch.pdf)

超过两分钟且本轮设计声音的作品，在 Brief 的 `<direction>` 写 `audio-arc`，按实际内容转折组织 3–5 段。每段写时间窗、听众此刻的关注点、情绪从愉悦到不安的方向（效价）、从安静到激动的变化（唤醒度），并给出听得到的动作。低唤醒可让持续音留下长空隙，中等推进可试稀疏拨弦或 85–110 BPM 的轻脉冲，高潮可逐层叠加织体后骤收。明亮/不安还要结合音区、音程、和声稳定性与音色判断。相同速度也可以得到相反感受。持续同一首歌可通过增减声部、变换乐句或抽空交代转折。固定曲目保留其约束，静音段落只记其叙事作用。[Russell 的情感环形模型](https://doi.org/10.1037/h0077714)

段界根据前后任务决定声音怎样交接。需要先引起期待，可在句尾提前约 0.5–1.5 秒引入下一段脉冲（J-cut）；需要保留上一动作的重量，可让其自然尾音跨镜约 0.3–1 秒（L-cut）。换曲时先核听强拍、乐句和尾音，再决定硬切或在同一窗口交叠。对照正常语速回放；若解说首字被抢或底床出现无意空洞，移动音乐边界，保留台词时钟。

### 从声音目录选到本片的实际素材

先运行 `node {SKILL_DIR}/scripts/laohu-showreel.mjs audio-map`，从目录里比较可能适合当前段落的音源，再以真实 ID 查询区间、许可和来源。目录里“待听”的维度留到试听。沿上文的能力与授权分支行动：

| 本段需要 | 选用与比较 |
|---|---|
| 纸、木、玻璃或脚步接触 | 用实际录制的同类材质候选比较接触、摩擦和落定。若只有泛用点击声，扩展许可检索或保留安静。 |
| 跟随几何展开的刻度、升阶或扫动 | 对比短成品与按共享相位制作的合成脉冲，选择能让观众辨识速度或层次变化的一种。 |
| 长片原声钢琴、吉他、弦乐 | 先试听成品乐句，在缺少合适段落且可原创时，用实际可用的采样乐器或分段混搭；检查长音质感、乐句接缝和片尾。 |
| 短电子片、无口播展示 | 可选成品、合成或分层混合，围绕可辨动机构造节奏。在强转折处与抽空底床比较。 |

有实听能力时按四步验收并记录文件、时间窗、听到的问题、调整及同窗复听结果。① 单轨听音色、循环接缝和尾音。② 在两三处语速最快、声音最轻或声部重叠处听首字和承重词。③ 在带声画面的接触、揭示和跨镜处看听同一事件。④ 长片抽听开场、中段转折、收束和最后自然衰减。没有实际音频输入能力时按上文候选分支交付，报告具体未听区间。

确定需要的声部后，先写清声音要怎样变化，再找素材：动作声描述材料、力度、距离、起音、持续时间和有用尾音；音乐描述音色、密度、节奏发展、留白和它与旁白/画面段落的关系。动作同步时分别标出画面事件相位（开始、接触、揭示、落定等）和源素材内部实际 hitpoint，再用来源同步点、源区间和变速/裁切映射换算到共用事件；画面事件的 `start` 不自动等于声音命中点。音乐按听得到的乐句/段落，结合拍相、和声走向、音色/密度、音头/尾音及具体语境选择和剪辑；BPM、搜索热度、下载量或波形峰值只能帮助找候选，不能单独证明切点合适或声音悦耳。跨曲交叠与淡变按需要选择，不要求每支片都用多首音乐。候选检索、源 hitpoint、乐句、重叠交接和实际听审方法详见 Arrangement [视听声音设计与源音频处理](../../laohu-arrangement/references/sound-editing-and-mixing.md)；未听审的候选不能标为 ready。

先查项目素材与上述目录，再按 Arrangement 检索方法定位源文件。音乐候选按当前用途核对 assetId、文件、hash、许可、真实时长和该使用情境；SFX 按动作、材料、力度与时长查职责组。检索结果只是候选，未试听不能标为 ready。若本地没有合适成品，调用现有 Motion 兼容桥；它会转发到 Arrangement 的正式 `laohu-sound.py` 多 provider 搜索/获取实现，不另造检索逻辑或重写现有混音后端：

```sh
MOTION_SKILL_DIR="<解析到的 laohu-motion 真实目录>"
WORK_ROOT="<本轮确认的项目根目录>"
SFX_TOOL="$MOTION_SKILL_DIR/scripts/sfx-sources.py"
mkdir -p "$WORK_ROOT/.cache/validation" "$WORK_ROOT/.cache/sound/incoming"

# 配乐搜索示例：把 use-case、voice-context、query 和 provider 按 brief 填准。
python3 "$SFX_TOOL" source-search \
  --query "<用途、情绪、密度、速度或可验证声音特征>" \
  --role music --use-case <narration-bed-light-advance|lively-explanation|rhythm-demonstration-collage|tense-reveal|no-voice-chapter-showcase|closing-resolution> \
  --track-type <fulltrack|loop|cue> --voice-context <narration-present|dialog-present|no-voice|unknown> \
  --providers mixkit,freesound,pixabay --visual-context "<本片视觉任务>" \
  --work-root "$WORK_ROOT" \
  --cache-dir "$WORK_ROOT/.cache/sound" \
  --tmp-dir "$WORK_ROOT/.cache/tmp/sound" \
  > "$WORK_ROOT/.cache/validation/source-search.json"

# 选择确切 provider key 后才下载；保留原始 search/get JSON 回执。
python3 "$SFX_TOOL" source-get --key '<候选的实际 key>' \
  --out-dir .cache/sound/incoming --work-root "$WORK_ROOT" \
  --cache-dir "$WORK_ROOT/.cache/sound" \
  --tmp-dir "$WORK_ROOT/.cache/tmp/sound" \
  > "$WORK_ROOT/.cache/validation/source-get.json"
```

SFX 使用 `source-search --role general` 或按职责使用 `--role ui`，并传入实际动作、材料、范围/时长和 provider；不能用音乐 route 搜拟音。随后用实际搜索结果中的 key 调用同一个 `source-get`。精确参数和返回字段以 `python3 "$SFX_TOOL" source-search --help`、`source-get --help` 为准。检查 JSON 的 `networkStatus`、实际下载状态、来源页、文件 hash、许可与本地 `ffprobe` 结果；provider 缺库、网络失败或空结果不得说成“没有素材”。

`source-register` 仅在精确来源许可、可保留的许可证据与该 CLI 支持的 CC0/CC-BY 条件都成立时写入项目本地或共享 audio index；登记到用户工程时，index 和素材路径都留在工程内。Mixkit/Pixabay 的同步许可素材按 Arrangement 的边界保留在项目 `.cache`，不强塞进共享资产库。无论走哪一支，都保留真实 search/get receipt、来源页、key、hash、许可和文件位置。新取回音源保持 `candidate-unreviewed`；source-register 不是听审。未经真实完整试听及语境审核的素材只能用于显式技术预览，不能冒充最终成品。

共享索引的 Overlay 默认短音按来源说明映射保存：15 个源项中 13 个映射到 Kenney CC0 声源，click 与 hit-soft 已作为别名映射到既有资产，不重复保存；实际新增的是 11 个 Kenney CC0 文件。`whoosh` 与 `whoosh-soft` 是作者提供并允许再分发的成品候选，没有独立 SPDX 标识，不能标成 CC0。写入前须同时核对来源映射、文件哈希与解码后音频；跨编码的同一信号沿已有资产 ID 记录别名，不复制成第二条。自动测出的 hitpoint 仅是低置信度信号估计，没有人类听审；候选仍为 `candidate-unreviewed`，完整听审前不能据名称推断材质、情绪、响度或适用画面。合成素材保留来源给出的复合节奏/用途；未公布具体点位时不补猜时间，不套固定增益或固定裁切秒数。

需要裁切、循环或淡变时，读取 Arrangement SFX/源编辑方法，用 `audio-edit.mjs` 以原音源、实际区间和机器回执生成派生 WAV。保留父音源 hash、许可、编辑参数、源 hitpoint 与派生 hitpoint 换算。素材内秒数不是影片秒数；镜头/音乐/SFX 共用 `timeline.js` 中的事件 ID，不能复制成第二套猜测时间表。

## 原生 file 模式的剪辑、混音与导出

普通有声原生项目显式 scaffold 为 `--audio file`。准备所有实际独立音轨，并按本片 `timeline.js` 的共享事件组装现有 `audio-plan/1`：音乐、人声放 `tracks`，按画面事件触发的 SFX 放 `events`，资产记录准确文件、时长、hash、许可和审核状态。时间只从同一 `timeline.js` 编译；计划保存事件 ID 与相同的全片时钟，不另设 cue 秒数。无声项目使用 `--audio none`。

音效事件的唯一 ID 和时刻由项目 `timeline.js` 提供。可导出 `AUDIO_EVENTS`；也可沿用 `CUES`，但所有有声 cue 都必须有稳定 `id`。同一 ID 同时用于画面动作和 plan event；没有 ID 的 cue 会被适配器拒绝，不会临时编号或猜时刻。生成 Motion audio consumer 所需的事件 scene：

```sh
node "$MOTION_SKILL_DIR/scripts/laohu-showreel.mjs" audio-scene \
  "$WORK_ROOT/project" --out audio/audio-event-scene.json
```

成品来源的 `audio-plan/1` 由既有 Motion `scripts/audio.mjs` 作为唯一 plan mixer，输出 Showreel file 模式消费的 WAV。通过本地薄入口调用时，它会先确认 WAV、manifest、cache 与可选 mux 输出都解析到本轮工作盘，再把参数转交给同一个混音器；素材、计划和 scene 输入仍可从其合法来源读取。若随后在 Showreel 工作区编辑独立音轨，最终导出改用该会话的当前混音，不再把原始计划 mix 当作编辑版声音。一般成品音源计划只使用 `audio-plan/1` 与真实资产，不需要旧 Film/Remotion 合同；Film source-premix 或 Film 生成请求则仍属于旧分支：

```sh
node "$MOTION_SKILL_DIR/scripts/laohu-showreel.mjs" audio-plan \
  --plan "$WORK_ROOT/project/audio-plan.json" \
  --scene "$WORK_ROOT/project/audio/audio-event-scene.json" \
  --asset-index "$WORK_ROOT/project/assets/audio/index.json" \
  --output "$WORK_ROOT/project/audio/final.wav" \
  --manifest "$WORK_ROOT/project/audio/final-audio.manifest.json" \
  --cache-dir "$WORK_ROOT/project/.cache/audio-mix" \
  --ffmpeg "$FFMPEG"
```

`audio-plan/1` 的调用参数为绝对路径，实际字段与验证边界以 Motion audio consumer 为准。Showreel 的 `--audio file` 构建会校验 `audio/final.wav` 与 timeline 的 `DUR`，渲染视频后只 mux 这份成品。构建及 final media probe 使用薄入口：

```sh
node "$MOTION_SKILL_DIR/scripts/laohu-showreel.mjs" build "$WORK_ROOT/project"
node "$MOTION_SKILL_DIR/scripts/laohu-showreel.mjs" inspect qa \
  "$WORK_ROOT/project/out/final.mp4" \
  --out "$WORK_ROOT/project/qa/final" \
  --expect-duration "$DURATION" --audio required
```

`DURATION` 取本片 `timeline.js` 的真实 `DUR`。技术预览若必须临时包含未试听候选，显式加 `--allow-candidate` 并标成技术预览，不能交付为 ready。最终准备时所有素材先完成真实许可核实与上下文试听；混音回执、`ffprobe` 和波形只证明技术状态，不证明听感。原生 `build.sh` 的 `AUDIO=file` 只校验并封装 `audio/final.wav`，不会再合成或混另一份旧 `score.mjs`。不得把预混音再次叠入其原有人声、音乐或 SFX。

试听当前声画成品中承担表达的真实发声区间。选一处具名事件，前后连续播放，必要时切换音效开关对照，检查在旁白与配乐同时存在时是否仍听得出接触、材质或反馈。长片另听章节接缝的音乐乐句和声部衔接。若关键声音被掩蔽，按原因换素材、校正音头到事件相位、处理频段或在该处让配乐短暂退让。使用电平数据定位时，记清采样窗口、所测声部和指标。用户指定的实际发声区间响度，按相应区间与口径测量，并另核峰值余量。

有可编辑独立音轨时，在 `editor.json` 逐条列出真实源文件、轨道职责与初始增益，并将原始 `audio/final.wav` 作为未改动混音。工作区“更新试听”与“导出视频”使用同一当前编辑快照；编辑后由 Showreel editor 重新混出当前会话的 WAV，再直接导出 `out/editor-<task-id>.mp4`。该导出是编辑后的最终消费者。编辑后不能再调用原始计划重建 `audio/final.wav` 并覆盖当前结果，也不能跳到 `build.sh` 让旧混音进入最终视频。若用户选择 `none`，工程不应出现声音轨或意外 mux。

**旁白与底床的空间。** 有口播时先选编配疏朗、中心声场给人声留位的音乐。比较同一个发声窗的人声与底床，16–22 dB 差可作初次试听的起点；用户指定的轨道平均电平用同窗、同一表计核对，轨道推子增益、瞬时峰值与整片 LUFS-I 各自记录。底床在 150–400 Hz 轰鸣时检查低音编配，辅音被 1–4 kHz 持续旋律遮住时先比较替代乐句。短气口（约 0.6 秒以下）用现有 ducking.holdSec 维持避让，较长语义停顿（约 1.2 秒以上）才试听平滑回升 4–8 dB，避免每次换气都抬高音乐。

**最终 file 混音。** 未锁定的 music track 按需要选用 `highpassHz`（先试听 80–120 Hz）、`vocalPocket: {"freqHz":2200,"widthQ":1,"gainDb":-2.5}`（在干扰处试 1.5–3.5 kHz、衰减 2–3 dB）。音乐轨或单个 SFX 事件可用固定 `pan`（−1 左，0 居中，1 右）调节立体声平衡，复听单声道折叠。锁定轨保留原始处理。旧工程中已有源端混合及母带的 source-premix / source group 保持原回执；需独立调整时使用分轨。若交付指定节目响度，在计划顶层显式给 `masterLoudnorm: {"targetLufs":-14,"truePeakDbtp":-1,"lra":11}`。该数值是本项目网络动画的可选目标；EBU R128 广播目标为 −23 LUFS。全片混合后测量并使用同一源做第二遍处理，核对 manifest 的线性/动态实际模式、输出 WAV 的 LUFS-I 与 dBTP；再测有损编码后的实际成片。源电平须原样呈现或用户锁定总混时省略总线处理。编辑台改轨后原 WAV 的测量失去代表性，复测当前导出。工具对输出 WAV 超过真峰上限或偏离目标超过 1 LU 会报错，过短或低于测量门限的素材保留原电平，根据其用途检查瞬态。[FFmpeg loudnorm](https://ffmpeg.org/ffmpeg-filters.html#loudnorm) · [EBU R128](https://tech.ebu.ch/publications/r128)

## 原版本地生成模式（`synth` / `tone` / `layer`）

原版 scaffold 的 `synth`、`tone`、`layer` 保持可用；本地 wrapper 不修改任何原版 synth 算法，具体写法与双档引擎边界沿用原版 `sound.md`、`score.mjs`/`score.tone.js`、`audio.mjs` 方法。`layer` 按原版顺序先生成 Tone 音轨，再由 `score.mjs` 读取并继续原算法，也可通过 `S.load()` 将已试听的成品 WAV 与自创音效/铺底混合在同一条最终混音链里。

- **具备真实音频听审与情绪识别能力**：在用户未锁定曲目且未禁止原创时，可把音乐库与音效库当作参考和素材池，按最终成片的情绪辅助需要自由决定直接用成品、纯自创（`synth`/`tone`/`layer`）或成品与自创混搭，并对生成的 WAV 及带声成片实听迭代至情绪、质感与人声清晰度过关。
- **不具备真实音频听审能力**：普通流程不默认生成；只有用户明确授权原创音乐/音效和相应声部范围后，才显式选原版模式，缺少成品候选不能替代授权。

用户录音、TTS 与成品音源按真实时长/许可保持各自来源；TTS 始终只朗读用户授权原稿，付费外部音频生成仍需明确授权，用户录音除明确授权外不裁改。最终 MP4 只接一份最终 mix。工作区编辑后使用它自己的当前混音与编辑导出；未编辑时才使用最初准备的 `audio/final.wav`。导出后检查真实媒体流和时长；报告实际试听主体（模型多模态实听 / 人类听审）与覆盖区间，没听审就明确标未试听。
