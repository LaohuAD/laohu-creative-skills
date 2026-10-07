---
name: laohu-arrangement-citypop
description: 用户要 City Pop/日本城市流行录音室乐队感时，以切分 bass、第 2、4 拍 backbeat、清音吉他和电钢层次组织精编律动与副歌扩宽。
---

# City Pop：以乐队律动、流动低音和精编声部构成都市流行感

## 触发与本地路线

- 用户明确说 City Pop/城市流行，或要求仿照某首 City Pop 的编曲关系时使用。歌词写都市、夜景或旅行，不能单独触发。
- 由于 City Pop 标签涵盖不同时期、曲风和制作方式，无更具体录音时本配置选“funk/disco-informed 的晚七十至八十年代日本乐队型录音室流行”作执行路线：4/4 中 snare 在第 2、4 拍构成 backbeat，配八分/十六分 hi-hat、切分 bass、离拍清音吉他、电钢/合成器和弦，副歌选择性加入弦/铜管回应。此为可直接编配的本地分支，不是对整个类别的唯一定义。
- 城市流行的辨识由节奏组、和声色彩、旋律钩子与精细编配共同完成；老磁带质感、霓虹音色或复古照片滤镜本身不构成编曲。

## 从节奏组到声部层次

1. **建立舞动拍架。** 沿用宿主速度；无指定时以 4/4、kick 稳住第 1/3 拍、snare/clap 落 2/4 为起点。闭合 hi-hat 给八分细分；需要更密时改十六分并做力度轻重，不把全曲打成四拍 club kick。
2. **写有 funk/disco 推进的 bass line。** 以和弦根音作段落支点，加入切分八分/十六分、五度和换和弦前的弱拍经过音；每小节留一个清楚的呼吸点。bass 与 kick 同位处增加稳度，错开处增加前推，避免整条 bass 复制 kick。
3. **固定键盘/吉他的分工。** 电钢或合成器负责和弦 voicing/持续和声；清音吉他以短切分、闷音或离拍和弦响应。优先让吉他起音比键盘短、音区略高或节奏错开，使两个声部在同一节奏网格里仍可分辨。
4. **用有限扩展音塑造和弦色彩。** 先保持宿主和弦进行；仅当旋律允许时在电钢 voicing 加 6、maj7 或 9，并以共同音/小步内声部连接。不要为了“都市感”给每个和弦叠 9/11/13；sus、调式借用或转调须由主题和段落目标支撑。
5. **选择性扩张编制。** 主歌优先保留鼓、bass、一个和弦层与人声；副歌在弦乐长线、铜管短回答、合成器对位或吉他叠层中选一至两项。弦/铜管写成前景钩子或和声托底其一，避开主唱句头；间奏才让器乐主题完整出场。
6. **让细节服务歌曲。** 设计一条可重复的键盘/吉他/人声钩子，围绕副歌首句或乐段交界出现；可用短 fill、鼓过门、和弦转位或高八度重复增加精致度。每个 fill 都要让位于歌词关键词和 bass 主动线。

## 与相邻方向的区分

- **对比 Dance-Pop：** 本路线由乐队式 bass、鼓、和弦层及相互切分的演奏关系承载主体；合成器和弦/四拍踢鼓可以使用，但不自动转为大段落 build-drop 结构。
- **对比纯复古合成器风格：** 只放旧式 pad、鼓机和磁带噪声而没有 bass/伴奏声部互动时，尚未写出本配置的 band-led 路线。
- **按参考细分：** 若用户指向更 disco、AOR、funk、bossa 或合成器主导的 City Pop 子型，只修改对应节奏/声部维度，保留其余宿主决定；精确参考的拍点和乐器关系优先于默认。

## 本地录音质感

将其组织为精编录音室乐队，而非纯音色滤镜：lead vocal 与 bass 保持中心稳定；清音吉他、键盘按节奏职责左右分开；副歌用额外弦/铜管或合成器在高音区扩宽，主歌收回。鼓与主唱可加短房间/plate 尾音，低频保持干净、切分起音清晰；不强制磁带噪声、过度压缩或“老唱片”失真。

## 用户锁定与组合

- 锁定的旋律、歌词、和声、速度、段落长度和指定乐器优先；新增扩展和弦或乐器层不得改写用户材料。
- 可与爱情主题、人声状态、品牌/影视用途组合：这些条件改变叙事或交付精度，不把题材误当流派，也不替换 City Pop 节奏组关系。
- 若主唱与器乐钩子被要求同时承担同一音区、同一拍位的唯一前景，保留主唱词头，将钩子移至句尾、改低/高音区或缩短起音；无法兼容时仅暂停该处冲突。

## 提示词、音符事件与编译

AI 生成时读取宿主[生成控制 Reference](../../references/ai-generation.md)。Style Prompt 采用本文限定的 late-1970s/1980s Japanese band-led 录音室路线；不要只写“复古”或强制磁带噪声。人声默认旋律主唱，句头清晰、延音自然，主歌稍克制；需要更强舞动感时让副歌 hook 与 bass 切分错开。Rap 只按明确参考/用户要求，不从 City Pop 标签推断。

人声 Style Prompt 起句：

```text
Global Metadata: late-1970s/1980s Japanese city-pop band arrangement, <BPM> BPM in 4/4, kick on beats 1 and 3, snare on 2 and 4, eighth-note hi-hat, syncopated bass, <studio depth and section arc>.
Vocal Details: <singer/register/tone>; clear melodic lead with <phrase length and held-word points>, restrained verse delivery and a memorable chorus hook; keep phrase openings clear of guitar and keyboard attacks.
Arrangement: bass moves independently of kick; clean guitar gives short syncopated replies while electric piano/synth holds the selected chord voicing; verse uses a compact band bed, pre-chorus changes <one register/harmonic/density field>, chorus widens with <strings or brass, choose one unless the reference supports both>, then returns to the lead hook.
```

按歌词/旋律选择一条能复制到 `Vocal Details` 的 City Pop 句式：
- 主歌叙述："Use a smooth mid-register legato phrase in the verse and let keyboard or guitar answer after the line."
- 副歌短钩子："Place a clipped melodic hook after the bass offbeat and repeat it only on the lyric phrase that carries the refrain."
- 峰值长音："Hold the chorus peak word in the lead register and thin same-register strings or synth beneath it."
- 尾句扩宽："Double the final chorus phrase only at the selected ending words when the singer or generation setup supports a stable double."
长音高点须对应真实段落峰值，不自动拔高；主唱与器乐避免同音区抢前景。

純器樂方向把可辨識的 bass/keyboard/guitar motif 放 `Motif / Front Identity`；`Instrumental Form` 逐段標出鍵盤和弦、短吉他回應與選擇性弦/銅管層何時進退。

MIDI 以 4/4 每小節 4 QN 計：kick 起音 `bar_qn+0,+2`；snare/clap `+1,+3`；hi-hat 可用 `+0,.5,1,1.5,2,2.5,3,3.5` 八分格，力度做強弱交替，不必同音量。bass 從和弦根音/五度出發，在 kick 間填切分；clean guitar 選短反拍，electric piano 承擔實際和弦。力度起點 kick 92、snare 88、hat 強拍 58/弱拍 42、bass 80、短吉他 62、電鋼 68；按音源和主唱距離調整。短和弦 gate 起點 0.25 QN；長 pad/弦樂依實際譜面延音，不將 MIDI gate 值直接等同譜面音符值。

ABC/MusicXML 需呈現 1/3 kick、2/4 snare、八分帽強弱、切分 bass 的實際起音，以及鍵盤和弦的聲部/音值；吉他短切音在相應拍間記音，不用文字“syncopated”替代節奏。弦/銅管長線按樂手可演奏音域與呼吸/弓法安排。鼓用目標 percussion mapping，和弦及旋律用實際音高；詳細字段與時值檢查見[輸出契約 Reference](../../references/output-contracts.md)。

## 返回宿主与验收

将本地路线、速度/拍型、bass line、第 2、4 拍 backbeat、键盘/吉他职责、扩张层与钩子位置写回宿主第三步蓝图和第五步分段声部表。第七步按用户选定交付编译 AI 输入、谱面或 MIDI；第八步检查律动是否由声部互动成立、主唱清楚、段落扩张有对比且没有把“复古”只做成音色标签。

## 方法依据与范围

- 大阪大学论文 *Intermediality and the Discursive Construction of Popular Music Genres: The Case of “Japanese City Pop”* 讨论该标签如何由媒介话语连接风格不一的作品。这里据此把 band-led 路线标为本地默认，不称为普遍定义。
- Billboard JAPAN 对林哲司、词作者/制作人等的 City Pop 讨论提供创作者和研究者对曲目谱系、制作场景及复兴的观点；其访谈支持按年代/作品细分的必要性，本文节奏组步骤是本地执行路线。
