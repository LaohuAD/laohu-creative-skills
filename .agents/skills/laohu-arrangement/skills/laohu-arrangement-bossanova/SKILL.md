---
name: laohu-arrangement-bossanova
description: 用户要 Bossa Nova/巴萨诺瓦律动时，以直八分的二拍组织、落拍单音低音和拍间切分和弦支撑漂浮旋律。
---

# Bossa Nova：二拍组织、四拍计数、切分和弦与漂浮旋律

## 触发与本地默认

- 用户明确要求 Bossa Nova，或指定某首 Bossa 录音作为编曲目标时使用。泛称 Latin、巴西、爵士和弦、轻柔歌曲不能单独触发。
- 无更细路线要求时采用 samba-derived 二拍组织：保持宿主拍号；若写 4/4，照数四个四分拍 `1&2&3&4&`，以第 1、3 拍组成两个二分宏拍；若写 2/4，照数两个四分拍 `1&2&`，两个 2/4 小节等于一个 4/4 小节的四拍计数。八分细分保持 straight，不自动加三连 swing；bass 在 4/4 的第 1、3 拍（或 2/4 的每小节第 1 拍）给根音/五度单音支点，吉他/键盘上声部在 `&` 拍切分和弦，主旋律可弱拍起句、跨拍延留。
- 这条低密度编配路线不等于全体 Bossa Nova 的固定乐器表；选吉他、键盘或其他音源时，仍须保留“低音支点与切分和弦分层”的核心关系。

## 建立可演奏的节奏骨架

1. **先定数拍与宏拍。** 按宿主已定拍号计数；4/4 时清楚写 `1&2&3&4&`，把 1–2 与 3–4 各作一个二分宏拍，2/4 时写 `1&2&`。每个 `&` 仍是直分八分，不是 swing 的三连音弱拍。若用鼓组，以轻声闭合 hi-hat、shaker 或刷奏标细分，kick 只承担低频支点，不复制完整 bass。
2. **写单音 bass 支点。** 4/4 中默认根音落第 1、3 拍；2/4 中落每小节第 1 拍，和弦变化不落这些位置时沿用宿主的和声目标。需有流动时在根音与五度间移动；换和弦前可用一个经过音/弱拍提前音接入。音符以清晰、连贯的单音为主，留出和弦切分空间，不写成连续摇摆 walking bass。
3. **把切分放在和弦上声部。** 吉他或键盘以短和弦音在拍间起音，保持低音与和弦起音分层；吉他可按拇指低音、手指拨弦和弦的协调思路写，键盘则把左手低音与右手短 voicing 分开。切分音不要全部重击，可用时值、力度差形成呼吸。
4. **让旋律浮在节奏上。** 主唱/主旋律可在弱拍进入、延过小节线或在伴奏切分之间留空；关键词和句头优先清楚。伴奏不要每次旋律停顿都填满，句尾只安排一条短回应。
5. **按歌曲需要安排和声色彩。** 先遵守宿主已确认的和弦与调式；和弦延伸音、转位和半音连接用于平滑内声部或支撑旋律张力，不为“爵士感”自动添加复杂替代。若用户授权重写和声，检查 bass 目标音、旋律长音与和弦三音/七音是否相容，再决定换和弦时点。
6. **用稀疏增量发展段落。** 主歌保留 bass 支点、切分和弦与轻脉冲；副歌只增加一项，例如高音区和弦、轻打击层、主唱和声或短弦乐。间奏可让吉他/键盘承担主题回应；不要把所有段落都加满打击乐。

## 音区、奏法与邻近边界

- Bass 与和弦乐器至少分开一个明显音区或起音位置；必要时用短音长、弱力度和更少音符让低频不浑。
- 吉他用真实可演奏的拨弦分工：低音由拇指落拍，上声部在拍间切分；不要写超出手指跨度、同时要求低音长延音又高声部密集切音的单手型。键盘可承担同样声部职责，但触键长度与力度应轻于主旋律。
- 轻打击补二拍内的细分而非主导重拍；避免重摇滚 snare 2/4 或强四踩舞曲 kick 把本路线转成其他编配感觉。
- 区别 Samba：本配置选择小编制、低动态、和弦上声部切分及留白；不复制高密度鼓队/狂欢式声部。Bossa 与 samba 共源，但不能把每种巴西节奏混称 Bossa。

## 锁定项与组合

- 用户锁定速度、拍号、旋律、和弦或指定乐器时照留；若原材料要求强三连 swing 或强四踩，则保留该锁定并标记它改变了本地 Bossa 默认脉冲，不能悄悄改拍感。
- 可与歌词/影视/器乐主题配置叠加；Bossa 决定二拍底层、单音 bass 支点、切分和弦与旋律浮动关系，其他配置只补其负责的维度。
- 同一和弦声部若被要求既持续整小节又每拍间短切音，暂停该处冲突，其他 bass、旋律和段落继续编排。

## 提示词、音符事件与编译

AI 生成时读取宿主[生成控制 Reference](../../references/ai-generation.md)，用直八分与拍间和弦表达二拍组织，不能把“摇摆”当默认词。人声方向起点是亲近、轻声但清楚的旋律主唱；歌词句可在弱拍进入并跨线延留，主歌留出和弦切分间隙，副歌用旋律延展而不是自动加重鼓组。若用户给了更强烈的唱法或实际录音参照，按其节奏重心调整。

人声 Style Prompt 起句：

```text
Global Metadata: bossa nova, <BPM> BPM in <confirmed 2/4 or 4/4>, straight eighth-note subdivision, two-beat organization, light pulse and open space, <intimate production>.
Vocal Details: <singer/register>; close, conversational melodic delivery; let phrases enter on <weak-beat point>, sustain <actual word/phrase> across the barline, and keep consonants clear without forcing every syllable onto a beat.
Arrangement: bass gives single-note root/fifth anchors on <beats 1 and 3 in 4/4 / beat 1 in 2/4>; guitar or keyboard places selected short chord attacks between beats; keep percussion light, let verse phrases float over the pattern, and expand the refrain with <one chosen register/harmony layer>.
```

依据句法与歌手已确认的声线，从下列句式选一条放进 `Vocal Details`：
- 主歌亲近叙述："Use a close, conversational short phrase and leave the space between guitar chord attacks audible."
- 弱拍漂浮："Enter the phrase on the weak eighth-note and sustain its last word across the barline."
- 副歌延展："Repeat the short melodic refrain and lengthen its final vowel without increasing the drum weight."
- 句尾轻收："Release the last phrase softly after its key word only where the singer can keep the consonant clear."
每首取一条主唱基线，句级增量标明实际歌词位置；不因 Bossa 自动假设气声或低音区。

器樂方向用 `Motif / Front Identity` 指定旋律/吉他主題及其弱拍起句、跨線延留；`Instrumental Form` 寫出上聲部切分的進退與器樂主題回應位置。不要投喂人聲氣口指令。

MIDI 起音依宿主原拍號。4/4 版本的 bass 支點在 `bar_qn+0,+2`；2/4 版本在每小節 `bar_qn+0`。上聲部切分可從每個二分宏拍中的弱八分開始：4/4 使用 `+.5,+1.5,+2.5,+3.5` 中挑選一至三次，2/4 使用 `+.5,+1.5` 中挑選，節奏留白優先於填滿。力度起點 bass 72、和弦 54、shaker 42、主旋律 76；按录音/音源调整。低音可较长，和弦 MIDI gate 起点 0.25 QN（十六分音符时值）；不得让 gate 缩短改变既定起音或谱面占拍。无自动 swing，微时值只按参照/明确表演意图加入。

ABC/MusicXML 按原拍號記直八分、低音落拍、上聲部反拍和弦、旋律跨線 tie/實際休止；弱拍起音不能只用演奏說明文字代替。低音與和弦分成可演奏聲部，吉他撥弦型注意同一手可達音域/同時發音限制。若打擊声部要记谱，使用目标软件支持的 percussion map；详细符号语法和时值检查见[输出契约 Reference](../../references/output-contracts.md)。

## 返回宿主与验收

把宿主拍号、宏拍计数、straight 八分细分、bass 支点、切分和弦起音、主旋律进句与留白、各段增量写入宿主第三步蓝图和第五步分段声部表。第七步按目标编译乐谱、MIDI 或生成输入；第八步验收四拍计数/二拍组织是否一致、八分是否被误做成 swing、bass 是否稳住宏拍、和弦切分是否清楚以及主句是否自然浮动。

## 方法依据与范围

- Nelson Faria, *The Brazilian Guitar Book: Samba, Bossa Nova and Other Brazilian Styles*。Sher Music 的出版社页确认作者、Bossa 覆盖范围，以及书中包含巴西风格的 comping pattern、和弦配置和曲例；公开样页展示的是 Samba accompaniment。本文的拇指低音支点与上声部切分是本配置选定的吉他编配路线，不冒称转述了未公开的 Bossa 样例。
- Faria 的教材覆盖多种巴西风格，不能据此把所有巴西音乐缩成 Bossa；本配置仅把出版社已公开的信息用作书目与覆盖范围依据，不把爵士和弦复杂度当作必要条件。
