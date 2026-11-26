# 字幕新闻（caption-news）

> 一句话：Captions-first news uses footage and source material while oversized captions lead the visual argument.
> 参照（只学语法）：References (grammar only): the captions-first social news of the mid-2010s (NowThis, AJ+), horizontal explainers that set big type over footage (Bloomberg Quicktake). Never copy their logos, fonts, colour ratios, idents or shots, and never name them in the film.

## 本质 / 不是什么

1. **Sound-off first.** Every beat must be understood from the picture and the captions alone; the voice adds pace, not information.
2. **The caption is the shot.** One Chinese line, set huge, slammed in two or three chunks, one keyword in a yellow block; one English line under it. The footage is chosen to sit under the line.
3. **Evidence on screen.** Each number arrives with its source: a source tag slides in; key figures are first seen highlighted in the original document; per-shot footage credits sit in the corner like a news "Video:" tag.
4. **A hook on frame 4.** The film's largest number lands in the first 0.15 s and rolls to its value.
5. **One turn.** The bad-news hook is answered by a fact that changes its meaning; the rest of the film explains that turn, one new fact per shot.

Not **Data Storytelling** (charts are short inserts between footage, never the whole film, never a dashboard). Not a **TV news package** (no anchor, no lower-third ticker, no studio, no scrolling crawl). Not a keynote: no headers, no centred title-and-bullets, no page turns.

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适配主题 |
|---|---|---|
| Cuts on a 120 BPM half-beat grid | (every cut at a multiple of 0.5 s). Footage shots 1.5–3 s; data cards and documents 3–4.5 s; a shot that holds a comparison stays until every item has been fully on screen ≥ 2.5 s. | 不开声音也能看懂；事实、来源与画面配合的新闻解释。 |
| Captions cross cuts. | A caption can run over two shots (picture changes, words don't); captions change at most every ~2.5 s even when shots change every 1.5 s. Reading time, not shot length, sets the caption clock. | 不开声音也能看懂；事实、来源与画面配合的新闻解释。 |
| The order of a fact | footage (feeling) → the number on a card → the document line that says it → the consequence. Never a number without its source tag in the same shot. | 不开声音也能看懂；事实、来源与画面配合的新闻解释。 |
| Transitions are few and fixed | hard cut (default); a 1–2-frame white flash on the turn and on the freeze; a card sliding in from the right with speed streaks (0.18 s); a split screen opening from its divider; grid panels rising staggered (0.1 s apart); a punch-in (0.3 s ease-out to ~1.25×) on the culprit; a mask transition where a photo…（完整条件见下方来源转写章节） | 不开声音也能看懂；事实、来源与画面配合的新闻解释。 |
| Pace | a strong action within 0.5 s of every shot; no frame flat for more than 1 s (rolling counters, line drawing, highlighter sweeps, slow pushes keep it alive); one held breath (2–3 s) after the turn; two real silences. | 不开声音也能看懂；事实、来源与画面配合的新闻解释。 |
| Chinese line | Noto Sans SC 900, 88 px (verdict lines 110 px), ivory `#F7F5EF`, 20 px dark soft shadow. Split into 2–3 chunks with `\|` in the timeline; each chunk slams 0.12 s after the previous: scale 1.3 → 1 in 0.13 s (back ease, overshoot 1.6), opacity full in 0.04 s. | 不开声音也能看懂；事实、来源与画面配合的新闻解释。 |
| Keyword | `{…}` inside a chunk; a honey-yellow block `#FFC21A` wipes left → right in 0.12 s behind it, text turns ink `#0E0E0C`. One keyword per caption, at most. | 不开声音也能看懂；事实、来源与画面配合的新闻解释。 |
| English line | Inter Tight 500, 33 px, ivory, fades and rises 10 px in 0.18 s, 0.1 s after the first chunk. It is the spoken line (numbers as digits), not a translation of the Chinese. | 不开声音也能看懂；事实、来源与画面配合的新闻解释。 |

列出的是来源正文中的可复用媒介信号；不是固定元素清单。每支按主题选择 2–3 个，其中至少一个避开最常见组合。

## 这个风格最俗的版本

- 来源正文未给出一套固定的俗套画面、配色、配器或开场结尾组合，因此不补造。相邻风格边界与明确排除项保留在「本质 / 不是什么」。
- 每支片子按主题从来源信号中挑 2–3 项，并在 brief 的 style 栏说明保留或改动了什么；故事、数据、构图与时间线重新设计。

## 适配

- 用途：不开声音也能看懂；事实、来源与画面配合的新闻解释。
- 内容：以当前项目真实素材和用户目标决定是否适配；只借用下方通用媒介规则。

### 素材、事实与署名

真实视频、照片、文件页或公开数据须与画面主张对应；关键数字先出来源标记，再呈现原件依据和实际影响。生成图像只能作为明确的示意画面，不能伪装成新闻现场或档案影像。事实、推算过程、素材出处和适用许可按项目现有素材与来源记录能力核对；片尾署名遵守素材许可。人物画面不以慢动作特写误导身份或事件。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

来源实现示意：
- `main.js` — the page (`window.render(t)` draws synchronously with placeholders first, so `TEXTS(t)` is valid for `readcheck.mjs`, then loads the frames it needs and draws again). Shot functions per format; `SHOTS` table for cuts.
- `timeline.json` — captions (`zh` with `|` chunks and `{keyword}`, `en`), voice start times, silences and hits; read by the page, `tools/cues.py` (.srt + timing check) and `audio/mix.py`.
- `tools/prep.sh` — every video shot as a 30 fps JPEG sequence at its display size (crop, lanczos, unsharp, delogo); report pages; photos; the map projection (`tools/map_prep.py`).
- `audio/mix.py` — sampled score from the timeline, foley from `events.json`, voice, natural sound, ducking.
- `tools/fonts.sh` (OFL subsets for every character in `main.js`), `tools/final_check.sh` (loudness, black frames, speech-to-text of the final mix).



## 材质与渲染

| Zone | Position | Content |
|---|---|---|
| Footage | full bleed | video, photo, document or data card; never a vertical frame pillar-boxed in the middle |
| Caption card | left aligned at x 120; Chinese baseline y ≈ 948, English baseline y ≈ 1014 | one line per language, never wrapped |
| Channel bug | top left, x 96 y 52, 46 px high | yellow block with a fictional channel name + topic in Chinese and English small caps |
| Source tag | under the bug, y 108, 36 px | white "来源" + dark label (`机构 · 日期`, `机构 · 页码`); only on data and document shots, slides in 0.2 s |
| Footage credit | top right, 19 px on a 50 % dark chip | `视频 作者 · CC BY 3.0`; every CC BY shot carries it |
| Lower third | x 120, y 742, 96 px high | yellow bar + label + one English line; for a place, date or speaker, never for the main sentence |

Under the caption: a bottom gradient (0 → 84 % from y 560) plus a soft dark radial from the bottom-left corner; a top gradient (55 % → 0 over 200 px) under the bug and the credit. Data cards use a lighter gradient that starts at y 820. Graphics and charts sit right of centre and bleed to the frame edge; their title and source sit top left, never centred.

Vertical 9:16 is a different layout, not a crop: put the caption under a 1080×1560 footage band (horizontal sources then scale ≤ 1.5×), stack the chunks on two lines there (the one-line rule is for 16:9 subtitles), and move the bug and source tag into the top safe area.


### 来源图形细则（源文完整记录）

下列具体模块、尺寸、颜色语义和动作时长来自 L1 源文，完整保留供主题适配；数字和颜色是该来源方案的参数，不是所有新闻项目必须照搬的值。

- **Ledger card** (the data-card ground): `#151512` sheet, faint ruled lines every 54 px (4.5 % white), a thin red double margin at x 78/86 — the "account book" that ties every chart together. It slides in from the right over 0.18 s; inside, a slow push (×1.025–1.03 over the shot).
- **Colour meaning**: honey `#FFC21A` = the point / gains / the highlight; red `#FF4A3D` = losses, the spike, the bad number; ivory = everything else; grey `#8D8B83` = labels and units; `#5E5C55` = the bars that don't matter.
- **Numbers**: Inter Tight 800 with fixed-width digit cells (`num()` in the upstream source implementation), so a rolling counter never jitters. Counters roll with ease-out and turn their colour when they arrive. The current material's unit is typeset smaller after the number.
- **Charts**: titled top left in Chinese (Noto Sans SC 900 64 px, ≤ 6 characters so it can be read in the shot) with one grey English line; lines draw segment by segment (eio); the key point gets a bigger dot, an expanding ring (0.7 s) and a block label; bars grow from the left one after another (first one slower and longer if it is the point).
- **Map**: state shapes from Natural Earth, projected (Albers), sequential fill in five steps of one hue, states without data in dark grey with a "未单列" legend swatch; the subject state outlined in yellow with a leader and a label; the map pushes in on it.
- **Documents**: the PDF page rendered at 220 dpi as white paper on a dark desk (±1–2° tilt, soft shadow, vignette), pushed in slowly; highlighter rectangles placed from `pdftotext -bbox` coordinates (1 pt = 3.0556 px), `multiply` blend, swept left → right in 0.3–0.5 s; the number read from it is re-set as a big yellow block beside the page. The printed text is picture; what must be read is re-set in type.
- **Split screen**: two halves with a 4 px yellow divider that drops first; the "bad" half desaturated, darkened and tinted red, the "good" half in full grade; a label block (Chinese + English word) and a counter in each; a shared stamp centred on the divider.
- **Grid**: three panels (632 px, 12 px gaps) rising staggered; each one lights up (yellow border, label turns yellow) on the word that names it; numbered 1–2–3.
- **Freeze frame**: the shot stops on a frame, a 0.14 s white flash, punch 1.0 → 1.12, saturation drops to 45 %, yellow corner brackets close in on the subject, a timecode chip with a pause mark appears top right.
- **Title sting**: a yellow ruled page (the ledger again, in yellow) wipes across the left 45 % over live footage; the title slams, the English title and a dateline chip follow; the page wipes off left and the title becomes the channel bug.


### 来源画面处理与画质边界（源文完整记录）

下列画质和放大限制来自 L1 源文；处理目标素材时仍须按实际分辨率核验。

- One grade for every piece of footage: `contrast(1.07) saturate(0.92) brightness(0.98)` + a 6 % warm soft-light layer; documents 4 %. Light grain in the master (`mux.sh … 30 1`).
- **Scale limits**: modern footage ≤ 1.5× (prepare frames at their final size with ffmpeg: crop, lanczos, `unsharp=5:5:0.45`); photos ≤ 1:1 of their source; archive material ≤ 2.5× after deblocking. Pushes stay inside those limits — a 720p source already at 1.5× gets no push.
- Remove station logos by cropping (never cover them with a caption), blur legible private details (phone numbers, identifying names, number plates) with `delogo`, skip shots with burned-in text.
- Captions, numbers and charts are always vector, never scaled footage.

## 配色

来源在 Graphics 中定义的是功能色，而不是一套可直接照搬的主题色：蜂蜜黄 `#FFC21A` 表示重点、增长与高亮；红 `#FF4A3D` 表示损失、尖峰或坏消息；象牙白承载其余文字；`#8D8B83` 用于标签和单位；`#5E5C55` 用于次要数据柱。账本卡底色为 `#151512`，细红色双边线建立版式识别。应用到新项目时保留颜色角色关系，具体色值按主题推导。

## 字体

- 中文主字幕：Noto Sans SC 900，88 px；结论字幕可到 110 px，象牙白并带 20 px 深色柔影。
- 英文辅助句：Inter Tight 500，33 px，淡入并上移 10 px；它承担口播内容，不要求逐字翻译中文。
- 数字：Inter Tight 800，固定宽度数字格，避免滚动计数抖动。图表中文标题使用 Noto Sans SC 900、64 px，控制在 6 个汉字内；英文单位与来源标签使用较小字号。
- 16:9 每种语言单行，过长就拆成两条字幕，不缩小字体或强行换行。字体实现文件及自托管方式需由生产消费者核验；本条没有安装字体。

## 运动

- **Cuts on a 120 BPM half-beat grid** (every cut at a multiple of 0.5 s). Footage shots 1.5–3 s; data cards and documents 3–4.5 s; a shot that holds a comparison stays until every item has been fully on screen ≥ 2.5 s.
- **Captions cross cuts.** A caption can run over two shots (picture changes, words don't); captions change at most every ~2.5 s even when shots change every 1.5 s. Reading time, not shot length, sets the caption clock.
- **The order of a fact**: footage (feeling) → the number on a card → the document line that says it → the consequence. Never a number without its source tag in the same shot.
- **Transitions are few and fixed**: hard cut (default); a 1–2-frame white flash on the turn and on the freeze; a card sliding in from the right with speed streaks (0.18 s); a split screen opening from its divider; grid panels rising staggered (0.1 s apart); a punch-in (0.3 s ease-out to ~1.25×) on the culprit; a **mask transition** where a photo grows out of a map shape. No dissolves, no page turns, no 3D flips.
- **Pace**: a strong action within 0.5 s of every shot; no frame flat for more than 1 s (rolling counters, line drawing, highlighter sweeps, slow pushes keep it alive); one held breath (2–3 s) after the turn; two real silences.

## 画面怎么活

- 计数值更新时，计数器按实际数据推进；高亮、标记线在指出证据时各执行一次，不作无因循环。
- 比较与停顿按来源规定留出阅读时间；静默段保留静止和原声，不添呼吸动效。
- 运动主线仍由切点、资料画面、卡片进入与有限推近承担；这不是“以静为主”的风格分类。

运动与循环描述来自来源文字 / 实现说明；本地尚未独立逐帧复现或核验，不作为本地渲染验证。

## 镜头语法

| 镜头运动 | 表达什么 | 适合哪类内容 |
|---|---|---|
| 账本卡片内缓慢推近（每镜约 `1.025–1.03×`） | 让数据卡在镜头停留时仍保持轻微推进 | 数据比较、关键数字 |
| 对准地图中的目标区域推近 | 从总体位置落到具体地点 | 地理分布、地点后果 |
| 对责任对象快速推近（约 `0.3 s`，至 `1.25×`） | 突出刚被证据指出的对象 | 证据转折、归因 |
| 缓慢推近文件 | 让来源原文和被标出的数字可读 | 报告、记录、公开文件 |

来源没有规定一套通用的摄影机路径；以上动作只对应其明确写出的卡片、地图、文件和 punch-in 处理。

## 声音调色板

| Layer | What | Level |
|---|---|---|
| Voice | one brisk narrator (Kokoro, speed 1.1–1.17), numbers spelled out in the TTS text | compressed, ≈ 8 dB over the music |
| Music | 120 BPM pulse in sampled instruments: kit (kick on the beat, hats on off-beats), eighth-note electric bass, a sixteenth-note marimba ostinato, vibraphone off-beat chords, glockenspiel accents, staccato brass stabs on the big numbers, timpani and suspended cymbal for turns | ducked ~45 % under the voice |
| Structure | the hook hit on frame 4; a hard stop into silence before the turn (only natural sound and the question); the turn lands on a major-key brass hit; half-time and low strings for the threat; a snare build into the spike; a second short silence before the verdict; a major chord with bells on the verdict | |
| Foley | every graphic action has a sound: chunk slam (click + thump), counter rattle (a tick every 45 ms), whoosh into each card, highlighter squeak, camera shutter on the freeze, stamp thump on a big number, pops for labels, ticks as map states fill, a riser into the map push | |
| Natural sound | the subject's own location sound, J-cut 0.3 s before the freeze, bed under the ending | not ducked below audibility |

Master −14 LUFS, true peak −1.2 dB (`core/render/mux.sh`).

## 原生手法

1. **Frame-4 hook** — kicker line, then a giant number in a yellow block rolling to its value in 0.45 s, then the unit and the subject word (`hook()`).
2. **Chunk slam with one yellow keyword** (`capCard()`).
3. **Proportion by darkness** — a yellow line sweeps across the footage to the percentage; what it passed goes grey and dark; the figure appears on the dark side (`shotHalf()`). Works for any "X % of …".
4. **The document says it** — headline or sentence highlighted from PDF bbox coordinates, then the number popped as a yellow block beside the paper (`paper()`, `shotDoc6()`, `shotQuote()`).
5. **Freeze and question** — the image stops on the viewer's question, music cut to silence (`shotFreeze()`).
6. **Ledger split** — two counters racing side by side, the difference stamped after both settle (`shotSplit()`).
7. **Lit grid** — three ways / three causes, each panel lighting on its word (`shotGrid()`).
8. **Punch and circle** — 0.3 s punch-in on the culprit, a circle drawn round it, a leader to its name and its Latin name (`shotSem()`).
9. **Map to ground** — the map pushes into a region, then a photo of that place grows out of the region's outline (`shotMap()`).

## 变化空间

The agent decides per film: topic, the turn, which formats are spent where, footage, the channel's fictional name and colour (keep one accent colour), the title.

- **Three structures:** the inverted pyramid with a mid-film turn (bad number → "really?" → the document says otherwise → why); a list of three that turns on the third; a countdown of numbers that ends on the one that matters.
- **Three openings:** the biggest number on frame 4; the document headline highlighted in the first second; a freeze on the event with a question.
- **Three endings:** a two-part verdict caption on footage with music returning after a silence; back to the hook's number, now re-read; the last data card's key point becoming the closing caption.

---


## 坑

- **Text that can't be read in its shot.** Chart titles ≤ 6 Chinese characters; ornamental stamps (datelines) must recur readably elsewhere; a label that changes text (a counter) is reported to `TEXTS` with its final value. Run `readcheck.mjs`.
- **Two-line Chinese captions in 16:9** read as a slide. Split the sentence instead.
- **The voice running to the cut**: lines that end on the cut feel rushed; speed the TTS (≤ 1.17 — faster, Kokoro starts to mangle names: a source-specific proper name was misheard) or shorten the line.
- **Homophones in ASR**: source-specific names can be misheard. Use the source-approved wording, and test names in the final speech-to-text pass.
- **Words stronger than the source**: never strengthen a source claim or turn a partial-period figure into an annual total. Use the wording and period supported by the source.
- **Footage from elsewhere**: illustrative footage never carries a place label it does not have; dates on archive photographs are stated in the credit.
- **Blank first frames on transitions**: start split/grid/sting animations 0.1–0.15 s before the cut so frame 1 already has picture.
- **Station logos**: crop them out; never park a caption over a logo.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L1_字幕新闻.md`；Lemo-Opuscar 来源库，仓库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `../licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留通用媒介、材质、镜头、声音、native move、坑与变化规则；按本地 `references/styles/_template.md` 重新编排；移除旧条目头部与专属示范片段。
- 证据状态：来源文字方法完整转写；配套预览仅为静态图，不能证明连续运动、作者实现算法或本地可调用实现。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
