# 乐谱、MIDI、和弦歌词表与音频输出契约

由主文第一步选定接收者和实际媒介后读取，在编译输出时按目标格式选用相应部分。输入是已确定的音乐决定、目标乐段/声部、接收软件/乐手、乐器与交付格式；格式转换不会补出未作出的谱曲或编曲决定。读后把可接手的内容交主文第八步，分别报告结构、导入/播放和试听实际完成到哪一步。

## 先选文件真正要承担的工作

- 制作人或乐手要理解每段的用途、能量、声部分工和进退场：交**编曲方案**，将目标、锁定项、分段关系、开放决定、接手者动作写清；未要求记谱时不虚构逐音符规格。
- 接收者要按音符演奏：交**领奏谱、伴奏谱或总谱/分谱**，并依其用途给出真实音高/简谱级数、节奏与时值、调/拍、声部和歌词位置。和弦名或“分解和弦”等音型描述不能代替实际谱面。
- 只需歌词位置上的和弦：可交**和弦歌词表（ChordPro）**。它标和弦及歌词位置，不含完整旋律音高和精确时值；不得把它称为可直接演奏的领奏谱。
- 需要精确旋律或规范交换：交可解析的 ABC 2.1 或 MusicXML 4.0 实际文件。
- 需要在 DAW/合成器播放与编辑：交真正生成的 Standard MIDI File；轨道表、脚本或 YAML 不是 .mid 文件。
- 需要实际听音：只有工具/演奏者/平台确已生成并保存文件时才称为音频；方案或导出设置不冒充成品。

只有用户要求的分支才出文件。明确说明可编辑的对象、精度、缺失决定和目标软件；不要靠扩展名推导用户需要了全曲、总谱或混音。

## 共用的音乐事件底稿

在输出多种格式前，先用一份事件底稿保存共同的音乐事实；各格式从同一底稿映射，不能各自重写音高或时值。最小单位如下：

- onset_qn / offset_qn：从全曲起点计算的绝对四分音符拍位置；offset_qn 是事件结束点，时值等于 offset_qn - onset_qn。用精确分数文本（如 "3/2" 形式）表示，不用会累计误差的浮点小数。
- pitch_sounding_midi：实际发声音高的 MIDI 音符号（整数 0–127），是和 MIDI 对齐的音高真源。pitch_concert_spelling 可补充音乐拼写（如升降号和八度），供读谱；若用调号简写，须有调号和还原记号。
- part_id、voice_id、staff_id、section_id：稳定声部、复调声部、谱表和段落标识。没有复调/多谱表任务可省略无关字段。
- kind：音符、休止、和弦符号或必要的结构事件；音符写音高和起止，休止写起止，和弦符号写和弦名及起点。多个同时发声的独立音符各有自己的事件，不能用一个和弦名字代替音符。
- 歌词按真实音节绑定到对应声部/音符；连音节、延长、休止和多音一字等按实际谱曲标记，不设字数等于音符数的配额。
- tempo_map 以绝对四分音符位置标速度（BPM）；sections 记录结构段落和起止位置；乐器声部需要时记录记谱音到实音的移调量。

下列 YAML 是**底稿接口模板**，占位符仍需替换后才能作为本项目有效规格。null 表示尚未决定，不是让编译者猜值；交付领奏谱、MIDI 或实际演奏用伴奏谱前，相关音符/时值必须补齐。

~~~yaml
spec_version: "1"
title: "REPLACE_TITLE"
key_concert: "REPLACE_KEY_OR_NULL"
meter_default: "REPLACE_METER"
tempo_map:
  - at_qn: "0"
    bpm: REPLACE_BPM
meter_map:
  - at_qn: "0"
    meter: "REPLACE_METER"
sections:
  - id: "S1"
    name: "REPLACE_SECTION_NAME"
    start_qn: "0"
    end_qn: "REPLACE_RATIONAL_QN"
parts:
  - id: "P1"
    name: "REPLACE_PART_NAME"
    role: "REPLACE_PART_ROLE"
    voice_id: "V1"
    staff_id: "ST1"
    notation_pitch: "concert"
    # MusicXML transpose direction: sounding = written + transpose_semitones
    transpose_semitones_written_to_sounding: null  # fill only after confirming concert/written-pitch mode
    midi_channel_user_1_16: null
    midi_program_0_based: null
events:
  - part_id: "P1"
    voice_id: "V1"
    staff_id: "ST1"
    section_id: "S1"
    kind: "note"  # note | rest | chord-symbol | structural
    onset_qn: "REPLACE_RATIONAL_QN"
    offset_qn: "REPLACE_RATIONAL_QN"
    midi_gate_qn: null  # optional MIDI key-down duration; separate from notated duration
    pitch_sounding_midi: null
    pitch_concert_spelling: null
    chord_symbol: null
    velocity_1_127: null
    tie_to_next: false
    articulation: null
    lyric:
      text: null
      syllabic: null  # single | begin | middle | end
      melisma: false
controls: []  # time-varying controls live in a separate lane, not events.kind
~~~

同一个底稿可转为不同书写音高，但转换方向必须明确。移调乐器的 MusicXML 总谱如采用记谱音，按 sounding = written + transpose 回算；MIDI 一律按实际发声音高。把两者导入后按实际音高对齐，不能仅对比谱面字母名。八度标记需明确采用的音名惯例；MIDI 的音符号是规范数值，DAW 把某个音符号显示成 C3 还是 C4 可能不同，检查时优先比较 MIDI 音符号和实际听音。

`offset_qn - onset_qn` 是谱曲事件的时值与谱面占位；`midi_gate_qn`（如需要）单独表示 MIDI Note On 到 Note Off 的键按时长。gate 缩短可以让声音更断，但不能移动下一起音、删除已作曲的休止或改写谱面音值。ABC/MusicXML 的 staccato 等奏法只有在作品确实采用时才标；不从短 MIDI gate 自动推导。若音源 Note Off 后仍有释放尾音，要听实际尾音是否盖住下个起音或循环接缝。

自动化/演奏控制放在独立 `controls` 轨道，不伪造成 `events.kind`：

~~~yaml
controls:
  - part_id: "P1"
    channel_user_1_16: null
    at_qn: "REPLACE_RATIONAL_QN"
    controller_type: "cc | pitch_bend | keyswitch | target_specific"
    controller_number_or_note: null
    value: null
    pitch_bend_range_semitones: null
    return_to_center_at_qn: null
    target_mapping: "REPLACE_VERIFIED_DEVICE_OR_PLUGIN_MAPPING"
~~~

这是项目事件模型，并不声称每个音源都支持这些控制。Pitch bend 必须说明目标音源配置的弯音范围，并在无关的下一乐句前回中；CC 或 keyswitch 的编号、音高和通道先按实际 patch 核对。CC11 是 Expression，不是通用奏法切换；不同乐器的同一 CC 不代表相同滤波、弓法、气息或轮奏行为。缺少所需采样库/patch 时，提供可编辑、实际可用音色的重复音代理并标明代理；不可将 GM 原声吉他称为真实琵琶，也不暗示已经呈现其奏法。目标记谱格式不能承载的音色控制保留在该独立轨或目标 DAW 自动化中。

无音高打击声部在 MIDI 规格中定义“角色→目标音符号/通道”映射。ABC 与 MusicXML 只使用目标记谱软件支持的 percussion staff/map；目标程序无此能力时，附真实角色/事件表并交 MIDI，不把 kick、snare 或 clave 写成假旋律音高。

## 编曲方案的交接模板

方案要让下一个制作人知道每一段做什么，以及已定与待定的边界。只有当前任务真正需要时才填写精确数字。

~~~markdown
## 编曲方案模板
- 交付用途 / 接收者：<场景与接手者>
- 锁定素材与保护项：<歌词、旋律、音频、段落、不可改项>
- 全曲听觉重心：<听众应先听见或记住什么>
- 时间与律动：<速度/拍号/细分/groove；哪些段保持，哪些段确需变化>
- 段落结构：
  | 段落 | 起止/长度 | 本段作用 | 入口状态→本段新增→出口去向 | 能量/音区/密度变化 |
  | <段落> | <起止> | <职责> | <入口→增量→出口> | <实际变化> |
- 声部分工：<声部、职责、进场/退出/让位/回应；不以乐器名代替作用>
- 旋律/和声：<实际已定内容及来源；未定项标开放>
- 人声协作：<锁定歌词的演唱动作、承重词和与伴奏的关系；未知旋律不填精确音高>
- 实际参数与开放变量：<只列会影响接手或交付的内容>
- 待试听 / 待制作确认：<具体观察点；未实际试听不标通过>
- 下一步由谁做什么：<可执行交接动作>
~~~

探索多方向时逐方向写出真正改变的听觉关系；局部修订只列受影响段和相邻交接，并指出沿用的基线。仅有情绪或风格词、没有段落功能与声部动作的方案，不足以交接。

## ABC 2.1：按记谱语法给可解析正文

正式文件按 ABC 2.1 编写；版本标记 %abc-2.1 放文件开头。头部至少写曲目标识 X:、标题 T:、拍号 M:、默认音长 L:、速度 Q:、调号 K: 和需要的声部 V:；然后是按声部切换的实际记谱正文与歌词。指定目标解析器/方言；软件专属排版指令不是跨解析器通用记谱。

~~~abc
%abc-2.1
X:<曲目标识>
T:<标题>
M:<拍号>
L:<单位音长>
Q:<节拍单位>=<BPM>
K:<调号>
V:<声部ID> name="<声部名>" clef=<谱号>
V:<下一声部ID> name="<声部名>" clef=<谱号>
[V:<声部ID>]
<以实际音符、时值、休止、小节线、反复和必要连音组成的正文>
w: <按真实音节对应前一行音符的歌词/音节序列>
[V:<下一声部ID>]
<该声部实际正文>
w: <该声部歌词；无歌词声部省略 w:>
~~~

**以上含尖括号的代码块是不可解析的骨架；全部替换为真实字段后才是 ABC 文件。**音符 A–G 大写为较低一组、小写为高一组；逗号继续降八度，撇号继续升八度。音长是相对 L: 的倍数/分数，例如后缀倍数延长，斜线分数缩短；选择 L: 和分数使每小节总时值精确符合 M:。升/降/还原用 ^、_、=。z 是可见时值休止；休止也占拍，不能靠缩短相邻音符补空。

引号和弦名（如 ABC 的 "..."）是和弦符号，不是把音符同时奏响；同时音符须用 ABC 的方括号音符组 [ ... ] 并逐音校对。- 在音符正文连接同音延音；(...) 表连线/连奏；三连音等用 (3 一类 tuplets 标记，其他比例按 ABC 2.1 的 (p:q:r 规则写。歌词中这些符号另有语义，不可当作音乐正文语法混用。

w: 必须与前一声部的音符顺序对齐：- 分隔同一词的连写音节；_ 将前一音节延至后一个音符；* 跳过一个音符；~ 在同一个歌词对齐单元内插入空格，不消耗下一个音符；| 将歌词游标移到下一小节。按实际发音和乐谱处理一字多音、延音、衬词及跨音节连词，不机械地每个汉字配一个音符。生成后按小节核对总时值、弱起、变拍、反复、声部时值和歌词游标，并在目标程序解析、渲染；通过解析不等于旋律可唱或演奏成立。

## MusicXML 4.0：建立可导入的乐谱文档

默认采用 MusicXML 4.0 score-partwise。&lt;part-list&gt; 声部 ID 必须与各 &lt;part id&gt; 对应；每个 &lt;measure&gt; 依次包含适用的 &lt;attributes&gt; 和实际事件。&lt;divisions&gt; 是每四分音符的整单位数；每个音符/休止 &lt;duration&gt; 必须用相同 divisions 的整数计数。多个声部在同一谱表/小节中顺序写出时，用 &lt;backup&gt; 退回共同时间位置，再写下一声部；确需向前跳过空拍时用 &lt;forward&gt;。第二个及后续同时起音的和弦音符使用 &lt;chord/&gt;，并核对它们与首音符同起点。

~~~xml
<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>REPLACE_TITLE</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>REPLACE_PART_NAME</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>REPLACE_INTEGER_DIVISIONS_PER_QUARTER</divisions>
        <key><fifths>REPLACE_KEY_FIFTHS</fifths></key>
        <time><beats>REPLACE_BEATS</beats><beat-type>REPLACE_BEAT_TYPE</beat-type></time>
        <clef><sign>REPLACE_CLEF</sign><line>REPLACE_LINE</line></clef>
        <!-- Include only for a transposing written-pitch part; omit for concert pitch. -->
        <transpose><diatonic>REPLACE_DIATONIC</diatonic><chromatic>REPLACE_CHROMATIC</chromatic></transpose>
      </attributes>
      <direction placement="above">
        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>REPLACE_BPM</per-minute></metronome></direction-type>
        <sound tempo="REPLACE_BPM"/>
      </direction>
      <note>
        <pitch><step>REPLACE_STEP</step><alter>REPLACE_ALTER_OR_OMIT</alter><octave>REPLACE_OCTAVE</octave></pitch>
        <duration>REPLACE_INTEGER_DIVISIONS</duration><voice>REPLACE_VOICE_ID</voice>
        <lyric number="1"><syllabic>REPLACE_SINGLE_BEGIN_MIDDLE_END</syllabic><text>REPLACE_ESCAPED_SYLLABLE</text></lyric>
      </note>
      <note><rest/><duration>REPLACE_INTEGER_DIVISIONS</duration><voice>REPLACE_VOICE_ID</voice></note>
      <backup><duration>REPLACE_INTEGER_DIVISIONS</duration></backup>
      <forward><duration>REPLACE_INTEGER_DIVISIONS</duration></forward>
    </measure>
  </part>
</score-partwise>
~~~

**上方 XML 含 REPLACE_... 占位符，不是有效可导入文件；替换后移除不适用元素，再经 MusicXML 4.0 XSD 与目标记谱软件检查。**duration 是 divisions 单位，不是分母拍或毫秒。休止用 &lt;rest/&gt;；和弦中后续音符示意为 &lt;note&gt;&lt;chord/&gt;&lt;pitch&gt;...&lt;/pitch&gt;...&lt;/note&gt;，只有同时起音的后续音加 &lt;chord/&gt;。复调同小节先写一条 voice，再 &lt;backup&gt; 回相应位置书写另一条；&lt;forward&gt; 表示时间游标向前移动，不替代实际休止事件。歌词用 &lt;syllabic&gt; 的 single/begin/middle/end 标词内音节关系；跨多音的延长音用 &lt;extend type="start"/&gt;、continue、stop 表示 melisma，并与实际音符持续位置一致。

若 `<note>` 同时写 `<duration>` 与 `<type>`，二者须表达同一谱面时值；同时核对 `<dot/>` 与适用的 tuplet/time-modification。`<duration>` 是 divisions 中的整数时长，控制时间游标/播放；`<type>` 是显示的音符时值。即使 XML 能解析，二者不一致仍可能导致节奏显示或播放不符，因此还要校验小节总时值并在目标软件渲染。

文本节点内出现与符号、小于号、大于号或属性引号时按 XML 规则转义：文本至少处理成 &amp;、&lt;、&gt;，属性引号使用对应实体；不能将用户文本直接拼成 XML 标签。文件以 UTF-8 保存。若输出压缩 .mxl，须按 MusicXML 压缩容器结构封装并让 META-INF/container.xml 指向根谱面；普通 XML 文件用 .musicxml。不要只改扩展名。

移调方向固定为**记谱音 + &lt;transpose&gt; = 实音**；例如降 B 调乐器记谱 C 的实音低大二度，chromatic 应为 -2（diatonic 按实际音程填写）。本项目共用底稿和 MIDI 以实音为准；记谱音分谱写其记谱音，MusicXML 用 &lt;transpose&gt; 声明变换。音乐会音高总谱则让书写音高直接等于实音，不重复声明移调。逐音核对 MusicXML 应发出的实音与 MIDI 音符号一致。

## MIDI：输出实际 Standard MIDI File 并解析复核

默认多声部交付为 SMF Type 1：每个轨道承担清楚的声部/打击乐职务，所有轨道从共同时间零点开始；需要合并单轨或目标明确要求 Type 0 时说明该目标。文件头明确格式类型、轨道数和时间分辨率 PPQ；每四分音符的 tick 数由 PPQ 决定。将底稿的绝对四分音符位置换算为绝对 tick（absolute_tick = onset_qn × PPQ），再按每轨事件顺序转成 delta time（当前 absolute_tick 减前一事件 absolute_tick）；SMF 用可变长度数量 VLQ 编码 delta。若分数拍乘以 PPQ 不是整数，提高 PPQ 或明确记下量化误差，不能静默四舍五入并让后续事件累计漂移。实际轨道至少包括本轮用到的音符起止、音符力度、节目/Bank（需要时）、速度与拍号 Meta Event、轨名和 End-of-Track。多轨的同一绝对起点、Tempo Map 和声部延迟必须一致。

~~~text
MIDI 导出规格（实现前占位；实际交付必须另有二进制 .mid）
SMF format: 1
PPQ: <整数，每四分音符 ticks>
Tempo map: <绝对拍位 / BPM>
Track map: <track name → part_id / function>
Channel map: <part_id → user channel 1–16 / raw status channel 0–15>
Program map: <part_id → bank MSB/LSB if needed; MIDI program data 0–127>
Pitch source: sounding pitch; MusicXML transpose applied before export
Event construction: <absolute QN → absolute tick → per-track delta tick/VLQ>
Retrigger ordering: same tick + same track/channel/pitch → note-off before note-on (project serialization rule)
~~~

MIDI channel 消息的底层通道编号为 0–15；常见 DAW 界面显示 1–16，因此界面通道 10 对应底层索引 9。GM Program Change 数据值为 0–127，许多音源界面显示 1–128；在映射表中明确标注采用 0-based 数据值还是 1-based 显示序号。Bank Select（CC0/CC32）需要时先于 Program Change 写入，具体音色还要按目标音源/DAW 核对。GM 鼓组约定常用界面通道 10（底层 9），不能误把数字 10 当作原始索引。

每个 Note On 都必须有匹配的结束：写明确 Note Off，或用 velocity 0 的 Note On 按标准语义结束。若同一轨、同一通道、同一音高在同 tick 结束后立即重起，本项目序列化时先写 Note Off 再写 Note On，避免解析器将重触发合并；这是本项目输出策略，不宣称是 SMF 规范强制顺序。CC11 是 Expression 连续控制器，不是通用 articulation/key-switch；奏法开关必须查目标音源映射及其音符/通道定义。

**事件清单或导出规格不能冒充 MIDI 文件。**真正生成 .mid 后用 MIDI 解析器重读实际文件，检查文件头 Type/PPQ/轨数、delta 和事件次序、音符成对、同 tick 重触发、速度/拍号事件、通道与音色映射、段落同步和尾音长度；再在目标 DAW/音源播放，确认实际音色、音区、动态与奏法。数据解析通过只证明 MIDI 事件结构，不证明音源发出了预期声音。

## 和弦歌词表（ChordPro）：保留和弦与歌词位置

ChordPro 输出统一称**和弦歌词表**或**歌词和弦表**，不称完整 lead sheet。它用内联和弦标记贴着歌词字词并可标标题/段落；它不编码完整旋律音高、精确节奏、伴奏声部或记谱歌词时值。

~~~text
{title: REPLACE_TITLE}
{key: REPLACE_KEY}
{time: REPLACE_METER}
{tempo: REPLACE_BPM}
{start_of_verse}
[REPLACE_CHORD]REPLACE_LYRIC_TEXT
{end_of_verse}
{start_of_chorus}
[REPLACE_CHORD]REPLACE_LYRIC_TEXT
{end_of_chorus}
~~~

这是带占位符的不可投喂模板；替换标题、真实和弦、歌词与段落后按目标 ChordPro 解析器校验。和弦标记应落在其实际开始作用的歌词位置；无和弦的行不要伪造和弦。不要靠此文件承诺主旋律可演奏；用户要领奏谱时另交含实音与时值的谱面。

## 领奏谱、伴奏谱与简谱：承诺实际音符和时值

**领奏谱**至少包含调号/首调约定、拍号、速度、乐段/小节位置、主旋律逐音音高及起止/时值、相应和弦起点、歌词音节到音符的对应，以及会改变实际演奏的演奏/力度说明。交可读谱面时用五线谱或简谱实际记谱；表格只能作为可核对的中间谱稿，不能冒称已经排版的领奏谱。

~~~text
领奏谱逐小节底稿
| 段落/小节 | 拍号与拍位 | 主旋律：音高 + onset/offset（QN） | 和弦：名称 + 起点/持续 | 歌词音节↔音符 | 力度/奏法（仅需项） |
| <段>/<小节> | <拍位> | <逐音填实音及起止> | <逐个变化填写> | <逐音节映射> | <已决定项/空> |
~~~

**伴奏谱**必须按真实声部逐音写旋律/低音/和弦构成音/节奏音型的音高与时值，或给演奏者可读的实际节奏和指法/演奏法；只写“钢琴分解和弦”“弦乐铺底”仍是编曲方案，不是伴奏谱。总谱/分谱注明每个声部的音域、谱号、调/拍、移调与起止；每个分谱要能单独读，不依赖其他文件中未标记的说明。

~~~text
伴奏谱逐声部底稿
| 段落/小节 | 声部ID/乐器 | 拍位 | 实际音符（音高与起止/时值；休止也标出） | 同时声部/和弦关系 | 力度/奏法（仅需项） |
| <段>/<小节> | <声部> | <拍位> | <逐事件填实音和时值> | <有依据的重叠/让位> | <已决定项/空> |
~~~

简谱必须说明首调 1 对应的主音/调性、音域八度点/线约定、节奏记号与拍号；逐音写级数、升降/还原、附点/连线、休止和时值。不能只列 1 3 5 或和弦级数而不写节奏。五线谱交付须有谱号、调号、拍号、小节线、节奏、休止、歌词和必要的移调谱表。若只有和弦与歌词位置，改交和弦歌词表并准确说明其能力。

## 音频、分轨和循环：以播放接缝验收

音频交付注明真实文件名、格式、采样率、位深、声道、tempo/tempo map、共同起点/对齐方式、各轨命名和时长，以及接收 DAW/播放器。信息必须来自实际文件或工具导出结果，不依据模板填值。整曲渲染说明最后一个发声音符、混响/延迟释放与最终静音尾部的处理；分轨共享同一采样起点和时间轴，不能因各轨首音不同而各自裁掉前导静音导致无法同步。

循环用于拼接播放时，定义音乐循环范围和样本范围：起点落在哪个小节/拍，终点落在哪个小节/拍，以及对应 [start_sample, end_sample)；按 tempo map 计算应为准确的整小节/设计循环长度。只让文件总时长看起来吻合不够，必须连续重复播放检查接缝、脉冲、低频/瞬态相位感、旋律回接和混响/延迟尾音。

循环交付前为干声与湿声明确选一种跨界办法并写入规格：

- **尾音在接缝结束**：把循环结尾做成与下一轮开头相容的音值/声部状态；把混响和延迟作为连续处理或单独湿声轨维持跨界，不在每次循环边界重置并截断。
- **交叉淡化**：标明交叠样本范围/时长和淡化曲线；确认相邻循环无瞬态双击、音量凹陷、相位梳状或脉冲摇摆。循环标记需对应淡化后的有效起止，不能同时重复播放重叠区域而产生额外拍数。
- **干声循环 + 独立湿声**：干声文件负责无缝节奏/音符，湿声轨连续跨过回环或由目标 DAW 连续生成；说明两轨的起点、路由和尾音行为，避免每次重复都叠加一份完整长混响而逐圈变响。
- **非循环成段音频**：保留完整自然尾音，不为凑整数小节截掉余响；注明它不可直接无缝重复。

~~~text
音频交付记录（只在文件真实生成后填写）
文件 / 声部：<实际路径或名称>
格式 / 采样率 / 位深 / 声道：<从导出设置或文件读取>
共同起点与同步基准：<时间零点/小节一；各分轨是否对齐>
循环：<无 / 段落名；bar/beat 起止；start_sample；end_sample_exclusive>
干声边界：<边界动作与起止>
湿声/尾音跨界：<连续处理 / 独立湿声轨 / 交叉淡化及范围 / 自然尾音>
接缝试听：<实际重复次数、播放路径、听到的问题与修订；未试听写待验证>
~~~

## 格式与接收端验收

- **编曲方案**：接手者能指出每段做什么、锁定与开放什么、下一步怎样制作。
- **ABC**：指定 parser 可读；小节时值、结构/声部/歌词游标对应；目标软件渲染后再听或演奏。
- **MusicXML**：XML 语法与 MusicXML 4.0 XSD 均通过；目标记谱软件导入/重开；声部、时值、歌词和移调正确。
- **MIDI**：检查实际 .mid 文件、事件计时、声部/音色映射和目标音源实播。
- **和弦歌词表**：核和弦名称与歌词位置；不宣称有完整旋律谱。
- **领奏/伴奏谱**：核每个承诺声部的实际音高、节奏/时值、调/拍及歌词/合奏关系。
- **音频与循环**：检查实际文件同步和重复播放接缝，包含湿声尾音处理。

解析通过只证明文件结构能被工具读取；导入通过不证明演奏成立；试听通过也不证明文件保留了可编辑能力。交付时说明实际生成的文件、目标工具/版本、跑过的解析/导入/播放范围和未完成的核验，不用未来时或格式名称假装成品已存在。

## 来源与适用范围

建设时核对的原始规范：ABC Notation Standard 2.1；W3C MusicXML 4.0（Partwise、MusicXML Elements/Data Types 与 MIDI-Compatible Part 文档）；MIDI Association Standard MIDI Files 与 MIDI 1.0 Detailed Specification；ChordPro 官方 Introduction、Directives 与 Chords 文档。以上名称/版本用于维护溯源；所有运行所需的字段含义、映射、格式处理和验收方法均在本地写明，不要求执行者打开外链。
