# 声音导演、混剪衔接与混音指南

本参考面向 Motion Showreel 原生项目，解决**定声音情绪弧、成品优先选材、跨曲混剪无缝衔接、人声通透混音**四件事。所有声音事件与画面动作共享 `timeline.js` 的同一个具名事件 ID，绝不维护两套秒数。

---

## 1. 选源优先级与真实听审分工（成品优先 → 无贴合成品再原创）

先按 `brief.md` 明确旁白、配乐、物理拟音、环境声与刻意留白各自职责；用户锁定曲目、要求静音或禁止原创时严格遵从。
1. **第一优先·找现成好素材直接用**：先扫本地库（`node {SKILL_DIR}/scripts/laohu-showreel.mjs audio-map`），缺口再用 `scripts/sfx-sources.py` 查许可明确的外部源（Mixkit / Freesound / Pixabay / Kenney）。情绪、质感、编配贴合的真录成品直接选用精剪（纸、木、玻璃、金属、脚步与真原声乐器质感远胜程序合成）。
2. **第二顺位·找不到贴合成品再原创或混搭**：
   - **具备真实音频听审能力的多模态执行者**：成品不贴合情绪或画面相位且未禁原创时，可用原版 `synth`/`tone`/`layer` 原创或用 `S.load()` 与真录成品混搭，并**亲自实听生成 WAV 与合片声画迭代过关**；
   - **不具备真实听审能力的环境**：不盲写原创；列出检索状态，仅获用户明确授权原创范围后才启用程序合成，未听审素材始终标技术预览而非 `ready`。

---

## 2. 段落情绪弧：希翁音画合流与张力—释放曲线

以**希翁音画合流（Michel Chion Synchresis）**把声音当成赋予图形物理重量与真实材质的增值层，按**张力—释放曲线（Tension / Contrastive Valence）**设计起伏，绝不铺恒定音量电梯乐。每段核三点：观众此刻要**听清哪个词**、**听出哪种物理材质**、**感受哪种情绪走向**。
- **超 2 分钟有声片**在 `<direction>` 写 `audio-arc`（3–5 个时间窗：情绪走向、前景声部、配乐进退与抽空点）。
- **短片换曲节制（60 秒内慎碎切）**：60 秒以内短片不刚播 6–8 秒就急切第二首曲子致听感破碎；优先评估单曲靠织体、电平与抽空走完前半程，仅在真正情绪大反转或认知破局点切入反差第二曲（实听对比单段蓄势 vs 两段反差切定夺）。
- **口播人声 C 位**：密集说理选无歌词、中频空灵底床（避开 1–4 kHz）；最重观点或反转前 **0.5–1.0 秒提前抽空底床**拉满屏息感。音效只给改变状态的接触、揭示与落点，近干起音给重量，不每个入场叮咚乱响。

---

## 3. 多段音乐与音效混剪衔接六大实战技法

**严禁把两首节奏/调性不同的歌生硬叠在一起慢淡入淡出**。按现场选用六招，全部落到 `audio-edit.mjs` 与 `audio-plan.json`：

| 场景 | 推荐技法 | 精确操作参数与落刀点 |
|---|---|---|
| **1. 同曲拉长循环或删中段** | **强拍对位 + 过零点微交叉淡化** | 核清 BPM 与 4/8 小节乐句，在同拍位（如第 1 拍）且波形过零点对齐裁剪，接缝加 **15–50ms 等功率交叉淡化**消咔哒声与中凹 |
| **2. 异曲切换（BPM ±5% 且调性兼容）** | **拍点对齐交叉淡化** | 对齐强拍做 **1–2 拍（0.5–1.5s）等功率交叉淡化**；前曲同步降 3–6 dB（可轻挂低通收暗），新曲强拍接管 |
| **3. 异曲切换（BPM/情绪反差大·最万能）** | **SFX / 吸气重击遮蔽切** | 前曲句尾/重拍 **0.3–0.8s 自然淡出**，切前叠 **0.4–0.8s 反向吸气（riser/whoosh）**，画面大转折帧砸干脆**落点音效**盖缝，新曲贴重击帧或后半拍起头 |
| **4. 口播大转折或换章（讲解片最显高级）** | **人声/气口抽空断桥** | 关键观点或换章前 **0.5–1.0s** 提前淡出抽空前曲，只留干净人声与气口；金句落定或新章推入瞬切入新曲第 1 拍 |
| **5. A-roll / B-roll 丝滑过桥** | **J-cut 预告 + L-cut 托送** | 切画前 **0.5–1.5s** 提前渗入下段脉冲/底声（J-cut）；切走后让前段尾音或拟音拖过切点 **0.3–1.0s** 收束（L-cut） |
| **6. 无口播卡点短片 / 情绪骤收** | **Drop 前半拍静默吸气** | Drop 前半拍至 1 拍抽空低频鼓点（riser 在重击前 40–80ms 收干留瞬态台阶），重拍同帧声画炸开 |

**两条混剪红线**：① 同一时间窗不让两首带明显主旋律或密集鼓点的配乐高音量叠放；② 切点做完必须**连同前后各 3 秒带人声与画面实听**，确认不抢首字、不绊拍、不突兀空洞。

---

## 4. 检索本地与外部成品源

1. **先查本地**：`node {SKILL_DIR}/scripts/laohu-showreel.mjs audio-map`，细查：`python3 {SKILL_DIR}/scripts/sfx-sources.py local-groups --query 木` / `local-search --asset-id <ID>`。
2. **本地不足查外部合规源**（保留 search/get JSON 回执与许可证据）：
   ```sh
   SFX_TOOL="{SKILL_DIR}/scripts/sfx-sources.py"
   python3 "$SFX_TOOL" source-search --query "<情绪、乐器或节奏>" --role music \
     --use-case <narration-bed-light-advance|lively-explanation|rhythm-demonstration-collage|tense-reveal|no-voice-chapter-showcase|closing-resolution> \
     --track-type <fulltrack|loop|cue> --voice-context <narration-present|dialog-present|no-voice|unknown> \
     --providers mixkit,freesound,pixabay --visual-context "<视觉任务>" \
     --work-root "$WORK_ROOT" --cache-dir "$WORK_ROOT/.cache/sound" --tmp-dir "$WORK_ROOT/.cache/tmp/sound" \
     > "$WORK_ROOT/.cache/validation/source-search.json"
   python3 "$SFX_TOOL" source-get --key '<候选key>' --out-dir .cache/sound/incoming \
     --work-root "$WORK_ROOT" --cache-dir "$WORK_ROOT/.cache/sound" --tmp-dir "$WORK_ROOT/.cache/tmp/sound" \
     > "$WORK_ROOT/.cache/validation/source-get.json"
   ```
   仅 CC0 / 可再分发 CC-BY 且证据齐全可 `source-register` 登记；Mixkit/Pixabay 单项目许可留当前项目 `.cache`。裁切循环或校源内 hitpoint 按 Arrangement [视听声音设计与源音频处理](../../laohu-arrangement/references/sound-editing-and-mixing.md) 用 `audio-edit.mjs` 生成带溯源派生 WAV——**画面事件 `start` 不自动等于音频 0 秒，按真实源内 hitpoint 对齐相位**。

---

## 5. 原生 file 模式混音导出与四步实听

常规有声选 `--audio file`，无声选 `--audio none`：
1. 导出事件场景：`node {SKILL_DIR}/scripts/laohu-showreel.mjs audio-scene "$WORK_ROOT/project" --out audio/audio-event-scene.json`
2. 组装 `audio-plan.json`（`audio-plan/1`：`tracks` 放人声与配乐，`events` 绑具名 `eventId` SFX 与 `pan`）并混音：
   - **人声通透起手参数**：底床低人声 **16–22 dB** 起试听；音乐加 `highpassHz`（80–120 Hz）与 `vocalPocket: {"freqHz":2200,"widthQ":1,"gainDb":-2.5}`；短气口（≤0.6s）用 `ducking.holdSec` 稳住不抽搐，长停顿（≥1.2s）回升 4–8 dB；网络发布可选 `masterLoudnorm: {"targetLufs":-14,"truePeakDbtp":-1,"lra":11}`（广播 −23 LUFS；锁原电平则省略）。
   ```sh
   node {SKILL_DIR}/scripts/laohu-showreel.mjs audio-plan \
     --plan "$WORK_ROOT/project/audio-plan.json" --scene "$WORK_ROOT/project/audio/audio-event-scene.json" \
     --asset-index "$WORK_ROOT/project/assets/audio/index.json" --output "$WORK_ROOT/project/audio/final.wav" \
     --manifest "$WORK_ROOT/project/audio/final-audio.manifest.json" --cache-dir "$WORK_ROOT/project/.cache/audio-mix" --ffmpeg "$FFMPEG"
   ```
3. 工作台调过音轨直接导出会话快照 `out/editor-<task-id>.mp4`，绝不旧计划覆盖；成品无法满足时按原版 [sound.md](../templates/runtime/laohu-showreel/references/sound.md) 写 `score.mjs`/`score.tone.js`/`score.layer.mjs`（可 `S.load()` 混真录 WAV）。

### 四步实听验收（计量不替耳朵）
① 单轨听循环/换曲接缝无咔哒音调打架、尾音收净；② 最密最轻口播 2–3 处人声首字与承重词绝不被盖；③ 接触、数据落点、转场与 A/B-roll 切点连看带听咬合受力帧；④ 长片抽听钩子、换曲转折、高潮抽空与片尾衰减。无实听能力如实标未听审区间与候选预览状态。
