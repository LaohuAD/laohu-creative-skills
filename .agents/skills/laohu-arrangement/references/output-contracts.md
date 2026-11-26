# 乐谱、MIDI、和弦歌词表与音频输出契约

由 [主文](../SKILL.md) 在确定直接接收者与交付媒介后按需读取。本文件约定编曲方案、统一事件底稿、通用 ABC 2.1、MusicXML 4.0、SMF MIDI、ChordPro、领奏/伴奏谱与音频循环的硬接口规范——**格式转换只编译已完成决定的音乐事件，绝不靠转换临时补造缺失声部，也绝不拿文字意图冒充谱面、MIDI 或真实音频**。

---

## 一、交付物能力边界速查

| 交付类型 | 真正承载什么 | 严禁冒充 |
|---|---|---|
| **编曲方案** | 段落职务、听觉重心、声部分工、频谱让位、能量落差与接手动作 | 不冒充乐谱、MIDI 或已混音音频 |
| **和弦歌词表（ChordPro）** | 歌词位置上的和弦符号与段落标记 | 不含精确旋律音高与节奏，**不称领奏谱** |
| **领奏谱 / 伴奏谱 / 简谱** | 承诺声部的实际音高（或首调级数）、精确节奏时值、拍调与歌词对齐 | 和弦名或分解和弦文字描述不冒充谱面 |
| **通用 ABC 2.1 / MusicXML 4.0** | 可由目标解析器/记谱软件导入的规范符号乐谱 | 通用谱不直接套进 YuE2 bounded profile；解析通过不等于好听或版面无错 |
| **Standard MIDI File（`.mid`）** | 实际生成的二进制同步轨道事件文件 | 轨道表、JSON 或生成脚本只是规格，**不冒充 `.mid`** |
| **音频 / 分轨 / 循环** | 经真实渲染、录制或生成保存的音频文件 | 参数规格或波形回执不冒充已试听合格 |

视听动画声音交付沿用 Motion 共享事件 ID、时钟与 `audio-plan/1`，详见 [视听声音设计与源音频处理](sound-editing-and-mixing.md)；源 WAV 编辑产出 48 kHz float PCM32 立体声 WAV 及 `laohu.audio-edit-receipt/1` 回执（几何换算 hitpoint 不是声学瞬态，超 1.0 峰值保留报告，新生成物保持 `candidate-unreviewed` 直到完整实听）。

---

## 二、多格式同源：共用音乐事件底稿

当同一作品需同时输出多种符号或 MIDI 格式时，必须先以一份精确事件底稿统一音乐事实，再分别投影到各格式（格式无法承载的控制留在蓝图/说明中，不让多份输出互相改写）：

- **`onset_qn` / `offset_qn`**：从曲首起算的绝对四分音符位置，使用**精确分数文本**（如 `"3/2"`），避免浮点累积误差；谱面时值 = `offset_qn - onset_qn`。
- **`pitch_sounding_midi`**：实际发声音高（整数 0–127），为跨格式对齐真源；`pitch_concert_spelling` 供读谱拼写。
- **`midi_gate_qn`**（可选）：MIDI 键按发声时长，与谱面占位时值严格分离；缩短 gate 绝不移动下一起音或自动推导谱面 `staccato`。谱面时值、演唱者气尾释放与实际休止三者分清。
- **有词对齐**：歌词按真实发音音节绑定音符（连音、延音、一字多音据实标记，不设一字一音配额）；仅在影响下游决策时加可选 `phrase_id`、`lyric_anchor`。
- **独立控制轨**：CC、Pitch Bend（须标弯音范围并在无关下句前回中）、Keyswitch 全部放入独立 `controls` 轨道，绝不混入 `events.kind`；`CC11` 是 Expression，不是通用奏法切换。无音高打击乐在 MIDI 写明确角色→键号/通道映射，谱面仅用目标软件支持的 percussion map，绝不写成假旋律音高。

```yaml
spec_version: "1"
title: "REPLACE_TITLE"
key_concert: "REPLACE_KEY_OR_NULL"
meter_default: "REPLACE_METER"
tempo_map: [{ at_qn: "0", bpm: REPLACE_BPM }]
meter_map: [{ at_qn: "0", meter: "REPLACE_METER" }]
sections:
  - { id: "S1", name: "REPLACE_SECTION", start_qn: "0", end_qn: "REPLACE_RATIONAL_QN" }
parts:
  - id: "P1"
    name: "REPLACE_PART_NAME"
    role: "REPLACE_PART_ROLE"
    voice_id: "V1"
    staff_id: "ST1"
    notation_pitch: "concert" # concert | written
    transpose_semitones_written_to_sounding: null # sounding = written + transpose
    midi_channel_user_1_16: null
    midi_program_0_based: null
events:
  - part_id: "P1"
    voice_id: "V1"
    staff_id: "ST1"
    section_id: "S1"
    kind: "note" # note | rest | chord-symbol | structural
    onset_qn: "REPLACE_RATIONAL_QN"
    offset_qn: "REPLACE_RATIONAL_QN"
    midi_gate_qn: null
    pitch_sounding_midi: null
    pitch_concert_spelling: null
    chord_symbol: null
    velocity_1_127: null
    tie_to_next: false
    articulation: null
    lyric: { text: null, syllabic: null, melisma: false, phrase_id: null, lyric_anchor: null }
controls:
  - part_id: "P1"
    channel_user_1_16: null
    at_qn: "REPLACE_RATIONAL_QN"
    controller_type: "cc | pitch_bend | keyswitch | target_specific"
    controller_number_or_note: null
    value: null
    pitch_bend_range_semitones: null
    return_to_center_at_qn: null
    target_mapping: "REPLACE_VERIFIED_MAPPING"
```

---

## 三、编曲方案交接骨架（按任务体量伸缩，绝不为凑格填表）

制作人可直接接手的编曲方案核心在于锁清真正影响听感的决定：交付用途与来源状态（独立新作 / 改编 / 准确复现）、锁定素材与保护项、声音空间与唯一听觉重心、核心动机与跨段演变、速度拍号与律动互锁、各段关键变化、频谱让位与人声协作、开放变量及待试听验证点。

- **完整多段歌曲**：可用下方紧凑分段表（或清晰分段条目）交付，**直接省略不适用列**（如纯器乐省略人声让位列），只写改变听感的实质动作；
- **方向探索、4–8 小节短循环或局部改稿**：直接给出核心决策、互斥取舍代价或局部修改前后对照，不强套 8 列全曲总表。

```markdown
| 段落 | 起止/小节 | 职务与情绪动作 | 听觉中心与核心动机 | 律动/低频与和声支点 | 主导变化与声场开合 | 声部进退与频谱让位 | 待试听/核对 |
|---|---|---|---|---|---|---|---|
| <段名> | <起止> | <进入→落点→交接> | <主线材料与回返变化> | <拍感/低频/和弦> | <1–2项主导推进轴> | <各层进退及1–4kHz让位；纯器乐可省略> | <具体验听点> |
```

---

## 四、符号记谱与 MIDI 精确硬契约

### 1. 通用 ABC 2.1（非 YuE2）
- 文件头含 `%abc-2.1` 与 `X / T / M / L / Q / K` 及分声部 `V:`；**`%%score` 放在 `K:` 之前的头部区**以确保最大解析器兼容性；全部尖括号占位替换后才为合法谱面。
- **谱表分组 `%%score`**：未分组声部各占一谱表；`%%score (V1 V2)` 圆括号合并至同谱表；`{V1 V2}` / `[V1 V2]` 连组多谱表但不合表（区分正文连线/连音 `(...)`）；大谱表 `{RH LH}` 内的两行不重复声明相同缩略轨名 `snm` 防排版重印。
- **实音与八度零错位**：音高 `A–G` 低组、`a–g` 高组、`,` 降八度、`'` 升八度；升降还原 `^ / _ / =`；休止 `z` 实占拍格；同时发声多音用 `[...]`（跨小节线和弦延音用括号内逐音连线，且**全谱统一和弦时值写法**，如统一外置 `[d-f-]2 | [df]` 与 `[ce]2`，避免同谱混用外置与内置时值），引号 `"..."` 仅为和弦标记且贴紧实际和弦切入拍；同音延音用 `-`，三连音等用 `(3` 或 `(p:q:r`。贝斯或移调乐器要么**直接按实音高记谱**与 MIDI 整数 100% 对齐，要么在 `V:` 中写入解析器可执行的 `clef=bass-8` / `octave=` / `transpose=`，绝不只靠 `%` 注释口头说明导致播放高八度撞轨。
- 歌词行 `w:` 对齐前一声部音符：`-` 拆同词音节、`_` 延音至后音、`*` 跳音符、`~` 同单元空格、`|` 进下一小节。完成后按小节核平总时值并在目标解析器验证。

### 2. MusicXML 4.0（`score-partwise`）
- `<part-list>` 与 `<part id>` 严格对应；`<divisions>` 定义每四分音符整数单位，每个音符/休止的 `<duration>` 须与 `<type>`、`<dot/>` 及 tuplet 精确吻合，小节总时值核平。
- 同小节多声部用 `<backup>` 回退游标写另一 voice，`<forward>` 跨空白（不替代 `<rest/>`）；同时起音后续和弦音加 `<chord/>`。
- 歌词用 `<syllabic>`（`single/begin/middle/end`）及 `<extend type="start|continue|stop"/>` 标一字多音。文本节点按 XML 规范转义 `& < >` 与引号，UTF-8 保存；`.mxl` 须含规范 `META-INF/container.xml` 压缩容器，不可只改扩展名。
- **移调方向铁律**：`sounding = written + <transpose>`（如降 B 调单簧管记谱 C 实音为 Bb，`<chromatic>-2</chromatic>`、`<diatonic>-1</diatonic>`）。实音总谱不写移调块；逐音交叉核对 MusicXML 实音与 MIDI 音符号完全一致。
- 打击乐用 `<unpitched>` + `display-step/octave`、`instrument id` 指向 `score-instrument` 及 `midi-unpitched`（MusicXML 1–128 对应 raw MIDI 0–127）。

### 3. Standard MIDI File（SMF）
- 多声部默认 SMF Type 1（共用零点起点与 Tempo/Meter Map）；绝对四分拍按 `absolute_tick = onset_qn × PPQ` 换算后转每轨 delta-time/VLQ（非整 tick 时提高 PPQ 或显式记录量化误差，不静默累计漂移；微偏移/人性化严防把 `tick 0` 推成非法负 tick）。
- **编号与通道防错**：通道界面 1–16 对应底层 status 0–15（GM 鼓常用界面 10 = 底层 9）；Program Change 数据值 0–127 对应常见界面 1–128，映射表须明标基准；Bank Select（CC0/CC32）先于 Program Change；**明标中央 C 八度约定**（如 Logic/ABC `C4=60` vs Ableton/Cubase `C3=60`）；**多轨共享 GM 通道 10 时严禁在 `tick 0` 发送互相冲突的 `CC7`/`CC10`**（通道级控制器会彼此覆写），独立混音摆位注明在 DAW 挂独立音源分通道处理。
- 每个 Note On 配对明确 Note Off（或 velocity 0 Note On）；**同轨同通道同音高在同 tick 重触发时（须逐音排查跨小节线和弦延音与下一拍哪怕仅重合的单个共同音），先序列化 Note Off 再写 Note On，或将前音门长提前缩 15–20 ticks**；**各轨 `End of Track`（`FF 2F 00`）统一对齐到循环/全段末尾精确拍点 tick**，无缝循环展开至第 2 圈时显式核查第 1 小节首拍冷启动音是否需删改，防止与尾小节跨界延音撞车；交付文字规格时为所有主力旋律、和声、低音与打击轨补齐基准力度范围。
- 实际生成 `.mid` 后必用 MIDI 解析器重读核验头信息、轨同步、音符成对与尾音，再于目标 DAW/音源实播核对音色与奏法。

### 4. 和弦歌词表（ChordPro）、领奏谱与伴奏/简谱
- **ChordPro**：用 `{title:}`、`{key:}`、`{time:}`、`{tempo:}`、`{start_of_verse}` 与内联 `[Chord]` 贴紧和弦开始作用的歌词位，无和弦处不硬填。
- **领奏谱 / 伴奏谱 / 简谱**：必须写实音高（简谱明标首调 `1=` 主音与八度点线）及精确节奏时值、休止、拍号与歌词对齐；表格仅作中间核对底稿，不冒充排版乐谱。

---

## 五、音频分轨与无缝循环交付规格

1. 音频/分轨交付注明实际文件名、格式、采样率、位深、声道、共同零点同步基准（各分轨保持同一起点，绝不擅自裁掉前导静音）、时长与尾音处理，信息必须取自实际导出文件。
2. **无缝循环四选一策略**（按整小节/拍轴定精确样本范围 `[start_sample, end_sample)`，连续重复实听确认无断音、咔哒声、脉冲绊脚或混响逐圈叠爆）：
   - **和声/尾音兼容接缝**：循环尾与首拍兼容，湿声连续处理不截断；
   - **交叉淡化**：明确交叠样本与曲线，核查无相位梳状、音量中凹或额外拍数；
   - **干声循环 ＋ 独立湿声轨**：干声严丝合缝回环，湿声轨跨界延续；
   - **非循环自然尾音**：保留完整余响，明标不可直接无缝循环。
3. **跨格式验收分界**：解析通过 ≠ 导入无错 ≠ 演奏可唱 ≠ 听感合格；交付时如实列明已跑工具版本、格式损失项与未完成的人耳/软件验证。
