# 视听声音设计与源音频处理

由 [主文](../SKILL.md) 在承接动画、视频或与 `laohu-motion` 协同的整片声音设计、选材、源 WAV 剪辑、强拍网格分析或本地音源渲染时按需读取。本文件先分清**两类工作模式**：

- **通用声音设计方案（本轮不运行本地脚本渲染或落盘）**：以资深声音导演与通用 DAW/NLE 后期标准交付——讲清情绪弧、口播清晰度护航、无缝跨曲衔接、音效材质与分频剪辑、检索词与商用授权边界及实听验收清单；**绝不把仓库私有脚本名、命令行或内部 JSON 字段漏进面向通用后期团队的方案，也绝不因本仓脚本的功能边界束缚混音设计水准**。
- **本仓 Motion Showreel / 工程脚本执行**：仅在真正需要调用本地素材检索、源 WAV 剪辑、强拍回测或渲染并交回 Motion `audio-plan/1` 时，进入文末 **第二部分（本仓工具执行契约）**，并与 [showreel-sound.md](../../laohu-motion/references/showreel-sound.md) 单源协同（Motion 负责 `timeline.js` 具名事件、6 招跨曲落地、`audio-plan/1` 唯一终混与工作台导出；本文件负责声音设计、源处理、拍网格与本地音源渲染；Motion 已授权整片声音职责直接沿用，不重复请示用户授权，也不擅改 ASRcut 冻结语音）。

---

## 第一部分：通用视听声音设计、混音工艺与验收标准

### 一、声音叙事弧、两阶段倒推算拍、时间三本账与无打架跨曲衔接

1. **先立情绪弧，再两阶段倒推算拍（Back-timing）**：明确旁白、配乐、物理拟音/动作音效、环境空气底与刻意留白各自职责；题材不自动绑定流派，无旁白不默认铺音乐。高张力反差不只靠推音量，更善用织体抽薄、声场收放、频谱重心迁移与瞬间抽空制造生理反差。**面对含关键视觉撞击或情绪大反转的短片，先锁死全片核心反转点与硬撞击锚点（如主卡扣、红线撞尺、起振点亮），再往回倒推前段音乐切入拍与速度（Back-timing）**，确保核心视觉锚点稳落音乐重拍而非尴尬反拍，同时把高潮的宽声场与标志音色留到反转后才彻底释放。
2. **三本独立时间账（严禁混为一谈或重复补偿）**：
   - **源内真实命中点**：音效文件内主瞬态峰值距文件 0 秒的实测位置（绝不把素材 0.0 秒硬贴画面事件起点）；
   - **画面受力相位**：按锁定画面的真实运动拆出**起势预备、速度峰、接触/撞击、关系揭示、状态结果**——前置加速滑擦/气流声仅在画面确有临撞加速冲刺时启用，匀速推进直接省略；
   - **成片封装偏移**：混音压回锁定视频封装为最终 MP4/MOV 后可能引入的容器音画偏移，须独立实测，绝不倒推回剪辑工程乱补。
3. **跨段/跨曲无缝衔接（杜绝双节拍、双调性糊在一起打架）**：
   - **自然拍尾过零点切断 ＋ 过滤余韵桥**：在原曲完整乐句或强拍自然尾过零点做极短平滑淡出（如 15–30 ms），必要时单截最后半拍纯净乐音送入高通/低通滤波后的 Aux 混响形成 0.8–1.2 s 空气余韵，避免干硬断尾；
   - **新拍弱起建钟与时间轴严防倒挂**：跨速度换曲时，可在旧曲切净后用新曲 BPM 的 2–3 个极轻弱起滴答提前建立听众内心节拍器，再在强拍切入新曲——**务必核验旧曲干声彻底停点严格早于新曲首个弱起拍点**，绝不在时间线上自己撞拍；淡入起点加淡入时长不得超过目标落稳时刻，且**对带柔和触键起音的钢琴/拨弦首音不用 1 秒以上长淡入磨糊音头**（长淡入留给缓起长音或弦乐铺底，触键首音贴近气口配短防爆音起音靠轻力度入场）；面对大幅反转抽空，直接利用 2–4 秒彻底无节奏留白洗净旧速度与调性记忆，再在下一情绪起势前柔和进入新曲；
   - **剧烈抽空/硬切防混响渗漏与区分心理留白**：高张力段骤停反转前，可用渐进高通扫频（如从超低频向上扫至 280–380 Hz 区间）同步平滑预压母线电平制造失重感，并在**包含配乐本体及所有 Aux 混响/延迟返回轨的共享编组母线**上同步做约 15–30 ms 过零净切；**淡出终点严格落在反转触发帧之前，但这几十毫秒只是防咔嗒与封死混响渗漏的技术净空，绝不可误当作制造心理屏息的戏剧静默**——真正需要观众感到屏息悬停时，须单独留出百毫秒级至数秒的无拍留白窗；关于防止蓝牙耳机/手机在绝对 `-∞` 静音触发省电断流咔嗒声，**先核实锁定旁白在气口处是否真被门限切死成数字零电平**，若确为数字零电平，再采样匹配旁白原声的极轻自然空气底仅在无音乐真空窗做平滑补底（避免无条件全程叠双层底噪）；
   - **避坑**：过渡遮蔽音效须与邻近数秒内的核心视觉撞击拉开明显材质与力度区隔，避免稀释重头事件焦点；带清脆鼓点/高频脉冲的成品立体声整轨**不强行做半音移调**（防打击瞬态涂抹与前回声），优先靠选曲同调或无调性桥接解决。

### 二、锁死口播人声清晰度分层护航与反抽吸混音

1. **先辨锁定人声权限，绝不越界二次过压**：
   - 交付为已精修锁死的成品旁白母轨 → **零裁切、零变速、零改增益、零二次压缩或去齿音**，全部清晰度由配乐与音效主动让路；
   - 仅当明确确认是未混音原始干声且获准润色时，才按需轻挂高通、温和压缩与齿音控制。
2. **相对电平与高通按段落职责与音乐材质匹配（不搞全片一刀切）**：
   - 依据口播语速与信息密度分档起手：常规口播配乐通常低于人声约 16–19 dB；**语速加快、信息密集的拆解段必须比平缓段更克制（起手可低于人声约 19–22 dB）**，靠脉动织体与清晰度给紧迫感，绝不反而抬高电平；
   - **高通频点按配乐低频职责定**：需靠 60–110 Hz 低频脉动支撑张力的曲段，高通只清理约 40–60 Hz 无用超低浑浊，绝不硬切 100–120 Hz 把低频骨头切残；若配乐本身无低频脉动职责且低中频顶住厚重人声胸腔，可适度高通至 80–110 Hz 或对冲突频段轻削。
3. **通用 DAW 精细避让与反抽吸纪律（以下数值为起手参考区间，须按段落松紧与实听微调，绝不死抄满全片）**：
   - 优先组合**中高频侧链动态均衡**（瞄准人声核心清晰带约 1.2–3.8 kHz，男声偏低段、女声偏高段，起手动态轻削约 2–4 dB、宽 Q 约 0.8–1.2，快语速/高密织体段用较快起放如 Attack 10–25 ms、Release 150–250 ms、短预读 5–10 ms 保字头利落，舒缓稀疏氛围段则放慢释放或减轻处理防发紧）＋ **M/S 中置通道静态轻凹**（在中置声道轻挖 1.0–3.5 kHz 约 1.5–2.5 dB，把立体声两侧留给配乐质感）＋ **受控气口自动化**；**动态 EQ 与 M/S 在 1.2–3.5 kHz 的叠加总衰减一般控制在约 4–4.5 dB 内**，防立体声偏窄的配乐被中置掏空发瘪；
   - 若使用音量压低（ducking / 自动化）：**强制满足 `preRoll >= attack`**（开口前提前约 80–150 ms 启动下压，严防吃掉首字辅音；**常规压缩器通常不支持百毫秒级预读，实操中写明通过手画音量自动化包络，或复制一条不输出声音的旁白幽灵触发轨往左提前挪约 80–150 ms 触发侧链来实现**）；短换气（≤ 0.6 s）保持稳态压低、严禁猛抬猛压制造抽吸；长停顿**按片子节奏与空镜长度定回升幅度**——快节奏短片里的 0.6–1.2 s 停顿宜温和轻回升（约 +1.5–2.5 dB）防忽大忽小，慢节奏叙事片里超过 1.5–2 s 的完整无词空镜可自然推升（约 +4–6 dB）承接画面情绪；密集无长停顿段直接用平稳低底床。
4. **唯一终混响度自洽**：全片只在唯一终混出口按需做一次响度整形（网络短片常见约 −14 LUFS-I / ≤ −1.0 dBTP，独立节目常见 −16 LUFS-I 起步，绝不对单条素材重复归一）；核对人声发声期短时响度与全片集成目标的算术匹配（含停顿与留白段时，人声发声短时响度须略高于整片集成目标，避免母带限幅器被动硬推）。

### 三、关键视觉事件的音效材质、分频解耦与源剪辑（本仓 SFX 物理剪辑唯一真源）

1. **高级克制选材与按需高采样**：紧扣真实物理材质与片子审美（如精密机械阻尼、轻木/卡尺触点、织物/空气短抽），避开廉价综艺罐头音效与粗暴正弦/白噪替代自然拟音；**仅当拟音确需明显降调增重或大幅拉伸时，优先采购 96 kHz / 24-bit 高采样真录源保高频瞬态不发钝**，近原速使用时高品质 48 kHz / 24-bit 真录已足够。
2. **多层次分频解耦、体量匹配与极性校验**：重要撞击或机械揭示需多层复合（表层接触瞬态 ＋ 底层受力体量 ＋ 可选极轻同调尾韵）时，**底层频段按物体真实物理体量缩放**（厘米级精密小件收窄在偏高中低频防做成保险柜落锁，大型重物撞击才下探至深低频），通过表层高通与底层低通做**分频解耦**避免中低频浑浊叠泥（具体分频点随素材实听微调，例如常见起手参考表层 400–500 Hz 高通、底层 250–300 Hz 低通）；**底层低频峰值与表层接触瞬态严格对齐或微滞后数毫秒（起手参考 0–8 ms），绝不可早于表层抢拍遮蔽脆度**；合并试听时必做**极性反相测试（Ø）**防低频抵消。
3. **外科式源剪辑细节**：放大波形在过零点裁剪并加极短防咔哒微淡化（起手参考 3–10 ms）；真实相机快门或机械开关常自带咔哒双响弹簧回弹，若画面是单次利落动作须**裁除次级回弹、按物体真实物理阻尼保留干净主击**（轻脆小件常极短、重型机械保留其自然沉稳阻尼，不拿单一固定毫秒数套所有物体）；倒放吸气类素材须裁掉原始起音爆破头并在切点配极陡淡出；若关键瞬态与旁白强辅音正面相撞，不动受力相位，直接让音效退让 3–6 dB 并收窄多余尾韵。

### 四、成品优先选源、商用授权边界与全链路实听验收

1. **成品优先 → 实听再原创**：优先挑选合规真录成品素材；具备真实音频听审能力且用户未禁原创时，仅在成品不贴合情绪/相位时才做原创合成或混搭并亲自实听过关（无听审能力且无授权时不擅转程序合成）。交付通用方案时，按段落与事件提供**可直接粘贴检索的合规免版税曲库关键词**。
2. **许可与审听红线**：严格区分**单片项目同步使用权**（如 Mixkit / Pixabay，仅留当前工程）与**可入共享库再分发权**（如 CC0、规范署名的 CC-BY）；**商用项目同时坚决排除 NC（非商用）与 ND（禁止演绎改编——对成品曲裁切、滤扫或做余韵桥均属演绎行为）**，许可不清一律禁入终混并随成片归档授权凭证及分轨/无旁白国际版（M&E）；绝不凭文件名、页面 `instrumental` 标签、下载量或波形峰值猜听感，未完整试听一律保持未定案/未听审状态并如实告知。
3. **五关实听验收核查表**：① 关键转场前后时间窗与跨曲接缝无双拍打架或混响渗漏；② 低音量及真实手机外放盲听高密口播段，确认无糊字、吃首字与抽吸；③ 0.5x/逐帧与正常速度复核关键瞬态相位对齐；④ 单声道折叠无抵消发薄与终混响度一致；⑤ **必须播放压回锁定视频后的最终封装 MP4/MOV 成片**，复测封装音画同步与结尾尾音，绝不以未封装 WAV 或技术表计替代成片终审。

---

## 第二部分：本仓 Motion Showreel 与工程脚本执行契约（按需触发）

**仅当本轮实际在工作区内运行本地检索、源 WAV 编辑、强拍分析、本地音源渲染或交付 Motion `audio-plan/1` 时读取以下契约。**

### 1. 本地索引与外部成品检索（`sfx-sources.py` / `laohu-sound.py`）
- 先查本地索引（`sfx-sources.py local-groups --duty <duty-id>` ＋ `local-search --asset-id <id>`），本地六类音乐职责组按字母序平级列出、`defaultSelectionAllowed:false`，人工 `fail`/`conditional` 按 SHA-256、源区间与 `useCase` 隔离生效；无合适候选再走外部 `source-search --role music`（Mixkit / Freesound / Pixabay，不拿 SFX 搜索冒充配乐）→ `source-get` → 允许再分发者用 `source-register` 记回 `assets/audio/index.json`（Mixkit / Pixabay 单片许可留工程 `.cache`）。
- 所有新获取/登记/派生文件保持 `candidate-unreviewed`（仅许可明确时经 `--allow-candidate` 供技术预览），完整实听后经 `sfx-sources.py local-review` 写入 `pass` 才升级 `ready`。

### 2. 源 WAV 编辑（`scripts/audio-edit.mjs`）
- 只编辑 PCM/float WAV；索引内 MP3/OGG 先运行 `decode-indexed-source` 核验原 hash 生成 48 kHz float stereo WAV 与回执，再在编辑 spec（`schemaVersion: 1`，1–8 个 `layers`）中用 `sourceAssetReceipt` 绑定原身份链（禁止改扩展名或伪造来源）。
- `sourceInSec`/`sourceOutSec` 为源绝对秒，`startSec` 为派生文件内相对起点，`hitPointsSec` 为源内待映射点；`tempo`（保音高 `atempo`）与 `playbackRate`（变调变速）严格互斥；`repeatCount`/`crossfadeSec` 仅作同层循环交叉淡化（跨曲交叠靠独立 layer 的 `fadeInSec`/`fadeOutSec`）。
- 输出 48 kHz float PCM32 立体声 WAV 及 `laohu.audio-edit-receipt/1` 回执；不做自动归一或削波，超 1.0 峰值保留报告；回执 `hitPointsSec` 仅是几何换算非声学瞬态。工具未实现 pan、EQ、压缩器、sidechain 或 loudnorm，不写未支持字段。
```sh
node "$SKILL_DIR/scripts/audio-edit.mjs" decode-indexed-source \
  --asset-index "$WORK_ROOT/.agents/skills/laohu-motion/assets/audio/index.json" \
  --asset-id "<已核对资产 ID>" --output "$TASK_TMP_DIR/decoded-source.wav" \
  --receipt "$TASK_TMP_DIR/decoded-source.receipt.json" \
  --tmp-dir "$TASK_TMP_DIR/audio-edit" --work-root "$WORK_ROOT" \
  --ffmpeg "$MOTION_FFMPEG" --ffprobe "$MOTION_FFPROBE"

node "$SKILL_DIR/scripts/audio-edit.mjs" \
  --spec "$TASK_TMP_DIR/source-edit.json" \
  --output "$WORK_ROOT/assets/audio/derived/edited-cue.wav" \
  --receipt "$WORK_ROOT/assets/audio/derived/edited-cue.receipt.json" \
  --tmp-dir "$TASK_TMP_DIR/audio-edit" --ffmpeg "$MOTION_FFMPEG"
```

### 3. 强拍音乐拍网格分析与封装回测（`scripts/laohu-beat-grid.py`）
- **仅当强拍 BGM 需驱动画面切点时触发**；以 `audio-plan.v1` 与 `trackId` 为唯一输入，在隔离 venv（`scripts/beat-grid-requirements.lock`）中拟合 0.5x/1x/2x 拍格并区分 `match` 与 `kickTransientCoverage`（最大残差 >15 ms 启用局部 tempo 诊断，只报告不改网格）。
- 渲后对真实 MP4/MOV 的 `0:a:0` 流运行 `verify-render`（`-copyts` 减 video `start_time` 并对齐零点），零匹配标 `unresolved/review-required`，绝不自动移动锁定 ASR。
```sh
"$BEAT_PYTHON" "$SKILL_DIR/scripts/laohu-beat-grid.py" analyze \
  --plan "$WORK_ROOT/audio-plan.generated.json" --track-id "$MUSIC_TRACK_ID" \
  --output "$WORK_ROOT/.cache/tmp/beat-grid.json" --project-root "$WORK_ROOT"
"$BEAT_PYTHON" "$SKILL_DIR/scripts/laohu-beat-grid.py" verify-render \
  --reference "$WORK_ROOT/.cache/tmp/beat-grid.json" --render "$WORK_ROOT/final.mp4" \
  --output "$WORK_ROOT/.cache/tmp/render-beat-check.json" --project-root "$WORK_ROOT"
```

### 4. 本地原创 MIDI 音源渲染（`scripts/laohu-sound.py`）
- 调用 Surge XT / sfizz + SFZ 渲染真实音色，隔离缓存放 `$WORK_ROOT/.cache/sound` 与 `$WORK_ROOT/.cache/tmp/sound`；支持 `--ffmpeg`/`--ffprobe` 与 `LAOHU_FFMPEG`/`MOTION_FFMPEG` 环境变量。
- 依次 `doctor` → `find` → `probe` → `render`（spec：`{"instrument":"<真实名或.sfz>","notes":[[midi,startSec,durationSec,velocity]],"tail":2}`）→ `check`；缺插件/采样报阻断不用正弦冒充；源阶段满幅归一非终混响度，交 Motion 须设 `gainDb` 留余量（约 6 dB 起步）。

### 5. Motion `audio-plan/1` 接口边界
- 自动化二选一（同条不并存）：`deltaGainDb`（相对基础增益增量）或 `targetGainDb`（须带 `trackId`，生效时目标增益，同轨同时段不重叠）；dBFS、LUFS 与 `gainDb` 严禁混用。
- `ducking` 支持 `targetGainDb`、`attackSec`、`releaseSec`、`preRollSec`（满足 `>= attackSec`）与 `holdSec`；未锁音乐轨支持 `highpassHz`、`vocalPocket`、固定 `pan` 及总混两遍 `masterLoudnorm`；拒绝 `track.loop:true` 与显式 `playbackRate`（需循环先经 `audio-edit.mjs` 制派生源并实听检验）。若方案需超出当前 `audio-plan/1` 支持的高级处理（如动态均衡/M/S），如实注明需在 DAW 落地或属现行脚本未接通项。
