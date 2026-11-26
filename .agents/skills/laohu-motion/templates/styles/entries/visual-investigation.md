# 视觉调查（visual-investigation）

> 一句话：Footage, documents, photographs and testimony are laid out as traceable evidence around one finding.
> 参照（只学语法）：References (grammar only): newspaper visual-investigation videos, forensic-architecture reconstructions, broadcast verification units. Never copy them, quote their names or use their branding.

## 本质 / 不是什么

1. **Sources meet at one moment.** The payoff of every section is two or more independent sources (a frame, a photo, a testimony, a report line, a sound) pointing at the same place or the same second. Cut points are sync points.
2. **One clock, read in the picture.** Time is carried by large readouts that belong to the layout: the timestamp on each telegram card, a playhead with its clock on the data chart, a `T+xx.x` stopwatch over the decisive seconds, a frozen "32 s". The scale changes with the story (hours → minutes → seconds → days) at section cuts. A permanent timeline band under every shot is **optional and usually wrong**: it eats the bottom of the frame, adds a layer of small labels and goes empty once the story leaves the clock.
3. **One finding per layout.** Each section says one thing; a heading is part of the layout, never a page header.
4. **Uncertainty is drawn, not apologised for.** `≈`, *inferred*, *schematic*, dashed boxes. Known and unknown are separate columns. A source that does not cover a stretch simply is not on screen yet (it lights up late in its column); never an empty "no footage" box, which reads as a broken render.
5. **Restraint.** Real disasters and real people: no slow motion of the catastrophe, no music that tells you to feel; fire only inside evidence frames; casualties as counted dots and numbers.

Not **Satellite Briefing** (no orbital imagery, no zoom from space). Not **Archive Light Table** (no paper on glass, loupes or hands: documents are flat evidence frames). Not **Halftone Dossier** (no print texture, stamps or collage). Not a newsreel package (no channel bug, ticker or anchor voice). Not a keynote: no centred title slides, no page turns.

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适配主题 |
|---|---|---|
| Three kinds of source at least | moving image (newsreel, CCTV, phone video, launch camera), documents (testimony, memo, telegram/teletype, report page), photographs. Add sound (original commentary, radio, recordings), data (weather, telemetry, counts) and maps whenever they exist. | 多来源调查、事件时间线与证据解释。 |
| Documents | a scanned page is shown as a strip or a page, never re-drawn; only the decisive line is highlighted (red, `multiply`, α ≈ 0.6, wiped left to right). Text that exists only as a transcription (a report, radiograms) is re-typeset by code and labelled as a transcription. | 多来源调查、事件时间线与证据解释。 |
| Archival picture pipeline | (pre-1950 film, max ≈ 2.5×): deinterlace (`bwdif=0`) → crop borders → deblock (`hqdn3d=2:2:3:3`) → lanczos upscale → light unsharp (`5:5:0.5`) → greyscale; one grain for everything. Modern footage: ≤ 1.5×. Never colourised or "restored" copies. | 多来源调查、事件时间线与证据解释。 |
| One grade | (canvas `ctx.filter`): footage and photos `grayscale(1) contrast(1.22) brightness(0.94)`; paper `grayscale(1) contrast(1.05) brightness(0.86)` (white pages pressed to light grey); maps greyscale, inverted, `brightness(.62)` so they read as dark line drawings. | 多来源调查、事件时间线与证据解释。 |
| One grain | six 256² Gaussian tiles rotated per frame, `overlay`, α 0.22 on footage/photos, 0.10 on paper. Grain only on sources, never on type or lines (`mux.sh … 0`). | 多来源调查、事件时间线与证据解释。 |
| Drawn evidence | (plan, side schematic, charts, dot matrix) is thin line work on the panel colour, marked *schematic* when it is not measured. | 多来源调查、事件时间线与证据解释。 |
| Few words per frame. | Each frame keeps only what this beat needs: the main readout or heading, the quoted original (the highlighted line), and one short source tag per piece of evidence. No eyebrow labels, no English twin under every Chinese label, no archive numbers, dates or "estimate / schematic / not to scale" footnotes unless…（完整条件见下方来源转写章节） | 多来源调查、事件时间线与证据解释。 |
| Source tag | a 6×12 chip + `type · source` in mono, ≤ about 12 characters (`照片 · Pasquarella`, `FBI 电传 · 1937-05-08`), sitting just above its frame. Full credits go on the end card, not on the panels. | 多来源调查、事件时间线与证据解释。 |

列出的是来源正文中的可复用媒介信号；不是固定元素清单。每支按主题选择 2–3 个，其中至少一个避开最常见组合。

## 这个风格最俗的版本

- 来源正文未给出一套固定的俗套画面、配色、配器或开场结尾组合，因此不补造。相邻风格边界与明确排除项保留在「本质 / 不是什么」。
- 每支片子按主题从来源信号中挑 2–3 项，并在 brief 的 style 栏说明保留或改动了什么；故事、数据、构图与时间线重新设计。

## 适配

- 用途：多来源调查、事件时间线与证据解释。
- 内容：以当前项目真实素材和用户目标决定是否适配；只借用下方通用媒介规则。

### 素材、事实与推断标注

用可查证的照片、文件、录音、地图、实测数据或现场影像组成证据层；画面来源标签说明材料类型和具体出处，完整署名进入片尾或项目记录。画面数字和旁白主张回到一手/官方材料或原始测量；把直接观察、资料原文、计算结果和推断分开。地点、时间或机位无法确认时标成约略、推断或未知，不让标注动画替代证据。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

- One Canvas-2D page (`index.html`), `window.render(t)` deterministic, `window.TEXTS(t)` for `readcheck.mjs` (key texts only; counters exempt), `window.SUBCHECK()` for the one-line subtitle check; all timing in `film.json` (sections, voice starts, original-sound clips, subtitles), shared by the page, the mix (`audio/mix.py`) and the subtitles (`tools/cues.py`).
- Reusable parts in the page: `plate()` (grade + grain + flash), `ring()` (circle + leader label), `cover()` (fill a panel without stretching, returns a source → screen map for circles), `badge()`, `wave()` (waveform with play-line), `playhead()` (event-clock keyframes shared with the mix), `planPanel()`, `schematic()` (16-cell side view with zone/flutter), `push()`.
- Prep: `tools/prep.sh` (ffmpeg + pdftoppm + PIL), `tools/wave.py` (waveform peaks), `tools/fonts.py` (OFL subsets). Checks: `tools/subcheck.mjs`, `tools/final_asr.py` (speech check on the finished film, per line).



## 材质与渲染

- **Three kinds of source at least**: moving image (newsreel, CCTV, phone video, launch camera), documents (testimony, memo, telegram/teletype, report page), photographs. Add sound (original commentary, radio, recordings), data (weather, telemetry, counts) and maps whenever they exist.
- **Documents**: a scanned page is shown as a strip or a page, never re-drawn; only the decisive line is highlighted (red, `multiply`, α ≈ 0.6, wiped left to right). Text that exists only as a transcription (a report, radiograms) is re-typeset by code and labelled as a transcription.
- **Archival picture pipeline** (pre-1950 film, max ≈ 2.5×): deinterlace (`bwdif=0`) → crop borders → deblock (`hqdn3d=2:2:3:3`) → lanczos upscale → light unsharp (`5:5:0.5`) → greyscale; one grain for everything. Modern footage: ≤ 1.5×. Never colourised or "restored" copies.
- **One grade** (canvas `ctx.filter`): footage and photos `grayscale(1) contrast(1.22) brightness(0.94)`; paper `grayscale(1) contrast(1.05) brightness(0.86)` (white pages pressed to light grey); maps greyscale, inverted, `brightness(.62)` so they read as dark line drawings.
- **One grain**: six 256² Gaussian tiles rotated per frame, `overlay`, α 0.22 on footage/photos, 0.10 on paper. Grain only on sources, never on type or lines (`mux.sh … 0`).
- **Drawn evidence** (plan, side schematic, charts, dot matrix) is thin line work on the panel colour, marked *schematic* when it is not measured.
- Remove channel bugs, watermarks and the source's own title cards; never generate an image to stand in for a historical one.

## 配色

| Use | Value |
|---|---|
| Ground | `#0B0C0E` |
| Panels | `#141619` |
| Hairlines, frames | `#2E3238` |
| Text | `#ECEAE4` |
| Secondary text | `#8B9097` |
| Ticks, *uncertain* | `#4A4F57` |
| **The one accent: here / now / match** | `#FF4A2E` |
| Paper cards (typeset telegrams) | `#E4E0D4` with ink `#1D1D1B` |

Sources are greyscale; red is the only colour and it only ever points: circles, the chart playhead, sync lines, highlights, ✓ badges (a drawn tick in a red box, no words), the zone everything converges on, the *unresolved* column, a strike-through on a wrong claim.

## 字体

- Chinese headings and findings: Noto Sans SC 700 (30–124 px). Tags, timecodes and ticks: IBM Plex Mono 400/600. Quotes: Source Serif 4 Italic for the original wording, Noto Serif SC 500 for a translation underneath in the secondary colour (only when the subtitles don't already say it). All OFL, subset to the words on screen.
- **Few words per frame.** Each frame keeps only what this beat needs: the main readout or heading, the quoted original (the highlighted line), and one short source tag per piece of evidence. No eyebrow labels, no English twin under every Chinese label, no archive numbers, dates or "estimate / schematic / not to scale" footnotes unless the beat is about them, nothing the subtitle is saying at the same moment.
- **Source tag**: a 6×12 chip + `type · source` in mono, ≤ about 12 characters (`照片 · Pasquarella`, `FBI 电传 · 1937-05-08`), sitting just above its frame. Full credits go on the end card, not on the panels.
- **Lower third**: a red bar + place name (36 px bold) + one mono line (place code).
- **Subtitles** (bilingual films): at the bottom of the frame (Chinese baseline y ≈ 984, English y ≈ 1022): Chinese 34 px bold over English 23 px, centred, 10 px black shadow; **one line per language**, measured in the page against 1,500 px; a long sentence becomes two cues. Original sound gets subtitles too, marked `【原声】` / `[1937 newsreel]`.
- **Reading time**: every key text stays still and whole for CJK ÷ 4.5 + other ÷ 15 + 1.5 s (`readcheck.mjs`); verdict and comparison frames hold ≥ 2.5 s with every item fully in frame. Counters (timecode readouts, the stopwatch) and tick labels are exempt.

## 运动

- 30 fps. Elements **cut in** (≤ 0.1 s opacity) with a 3–4-frame white flash, as if pulled from the evidence locker; nothing flies, bounces or scale-pops.
- Only things that are **drawn** are progressive: circles drawn clockwise in 0.5 s (ease-out cubic), leaders and links 0.4–0.8 s, plans stroke by stroke, highlights wiped, typewriter text for telegrams.
- Inside a frame: a slow push (≤ 1.9× on a map, ≤ 1.06× on a photo) is allowed; the "camera" itself never moves. Layouts change on cuts.
- Scale changes (minutes → seconds → days) happen on section cuts, carried by the readout changing form (clock → `T+` stopwatch → date), not by a zooming band.
- Something changes at least every second; holds are for verdicts only.

## 画面怎么活

- 计时段内，事件时钟 / 秒表在关键帧间缓动、运行时匀速推进（每格代表一秒）；波形播放线只跟随对应的声音位置。计时结束后读数停在证据值。
- 圆圈、引线、高亮和打字逐项出现后停止；档案静帧不额外漂移。来源没有规定独立的背景微循环。

## 镜头语法

- 1920×1080, 60 px margins; content y 60–900, subtitles below it (y ≈ 950–1030). Layouts use the full height; no strip is reserved for a timeline. When a section has no subtitle, centre its content vertically.
- Panels are hard-edged rectangles with 1 px frames; footage panels keep the source's aspect.
- Typical layouts: **map → plan** (left) with a reference photo and a footage panel (right); **one big statement + one quote + one wide schematic**; **five-source board** (three evidence frames on top, sound and report below, schematic right, red links converging); **three-column sync grid** (report / photo / video under one stopwatch, each column lighting up when its source begins); **document strip + two-column verdict**; **claim card + fact-check card + dot matrix**; **evidence map** (plan, broken-axis mini timeline, schematic, thumbnails with links).
- Avoid centred layouts, page headers and slide-like page turns. Transitions are hard cuts on a 0.5 s grid, white flashes and the rewind; no dissolves.

## 声音调色板

1. **Bed**: low D held by contrabass and cellos; a filtered room tone about 30 dB under the voice.
2. **Clockwork**: a pendulum tick every 0.5 s in the minute-scale sections, louder in the waiting minutes; in a timed run one tick per **event** second (accent every 5) — the audible stopwatch.
3. **Harmony**: a quiet pizzicato ostinato in eighths (Dm – B♭ – Gm – A) under the slow sections; tremolo minor-second clusters for tension; slow sustained chords for the verdict columns; a resolving D minor add9 with vibraphone for the evidence map.
4. **Foley** (procedural): paper for documents, a shutter for photos, Morse "dits" and keystrokes for telegrams, teletype chatter, a rewind sweep, pencil scratches for plans, one deep thump for the moment of impact — then near-silence.
5. **Original sound** (archival commentary, radio, recorded sound): band-passed 180 Hz–5.5 kHz with sparse crackle, shown as a waveform with a red play-line and word-by-word lighting; music ducks −12 dB under it. Original sound and score alternate; never both loud.
6. **Voice**: calm and flat (ours: Kokoro `am_michael`); music ducks about −9 dB under it; −14 LUFS, true peak ≤ −1.2 dB.

## 原生手法

- **Freeze, circle, magnify.** Freeze a frame with a white flash; draw a 2.5 px red circle clockwise; at 60 % a leader and a bold label appear; a ×2 loupe opens beside it, cropped from the same source pixels (never beyond 1 source px per screen px). *Fits:* a licence plate in CCTV; a crack in a weld.
- **Hard sync point.** Pick one instant every source can recognise (impact, flash, a public clock, a gunshot peak) and align each source to it. A source that starts late just appears late; if the gap matters, say it in the voice or a subtitle. *Fits:* which phone started filming first; when the launch camera lost the vehicle.
- **Three-column sync grid.** Document / photo / video side by side under one big stopwatch; each column cuts in (white flash) at the moment its source begins, so the grid fills left to right as the clock runs; freeze on the sync point with a red dashed line across the pictures. *Fits:* two dashcams and a police log.
- **Readouts change scale.** The time readout changes form at each section cut — card timestamps and a chart playhead (minutes), a `T+` stopwatch (seconds), dates (days) — as the story narrows or widens. *Optional:* a bottom timeline band with tracks per source kind, only for a film that stays on one clock throughout; keep it free of labels and drop it when the clock stops. *Fits:* a market crash from the week to the minute.
- **Rewind cold open.** Start on the decisive frozen frame, slam the other sources into a grid, sweep a sync line, then rewind (footage playing backwards, scan lines) to the start. *Fits:* any reconstruction.
- **Telegrams on the clock.** Typeset radiograms / messages land at their timestamps with Morse and keystrokes; red dashed leaders tie each card to a pin at its time on the data chart's axis. *Fits:* chat logs, ATC calls, emails.
- **Data chart with a playhead.** A chart (wind, speed, temperature) across the lower part of the frame with a time axis, event bands (storm, outage) labelled with one word, the message pins, and a red playhead carrying the clock. *Fits:* power-grid load before a blackout.
- **Map → plan.** A real survey map pushes in to the site, then cuts to a measured plan with the subject's position, a bearing, a distance ring, a camera point and an inferred view cone; the map stays as a locator inset. *Fits:* where each witness stood.
- **Evidence → model links.** Every circle in every source sends a red dashed link to the same zone of one schematic; ✓ badges land 0.12 s apart with small mallet notes. *Fits:* which room a fire started in.
- **Then vs. record.** Play a period claim as original sound, then a fact-check card; strike through the wrong words in the claim. *Fits:* a press release against the filed numbers.
- **Known / unresolved.** Two columns, ticked vs. dashed boxes, every item held whole for ≥ 2.5 s, one source tag for the board. *Fits:* any inquiry's conclusion.
- **Dots for people.** One dot per person; the dead become red open rings one by one; a single large number. *Fits:* passengers, workers, victims of any event.
- **Evidence map.** Plan, broken-axis mini timeline, schematic and thumbnails of every source, all links converging; the poster frame. *Fits:* the end of any investigation.

## 变化空间

The agent decides per film: the event, the sources, the sync point, which time scales the clock passes through, the layouts, the opening and the ending.

- **Three structures:** a cold open on the decisive frame, then rewind and rebuild; one question ("where did it start?") answered source by source; a strict clock (T−10 min → T+1 h) with findings dropping in where they happen.
- **Three sync points:** an impact or flash frame; a sound peak heard in several recordings; a public clock or broadcast time signal.
- **Three endings:** the evidence map; the known/unresolved board left on screen; back to the opening frame, now fully annotated.
- **Other subjects:** a traffic collision (dashcams, CCTV, police report), a protest (phone videos, photos, statements), a disputed call in sport (camera angles, rulebook), a launch failure (tracking cameras, telemetry, accident report).

---


## 坑

- **Inference passed off as fact.** Camera positions, photo times and offsets need `≈ / inferred / unlocated` on screen and in Motion’s existing project fact/source record.
- **Early reports as facts.** The first-night memo and the period newsreel often disagree with the final report; use them as images or as claims to check, never as the source of a number.
- **Faking a multi-camera event.** With one licensable film, do not borrow clips of unclear origin; cross-check film + photos + documents + sound instead. The structure still holds.
- **Seams in "continuous" shots.** An exposure jump or splice breaks timing; time durations from the official record and state the alignment error.
- **Time zones and clocks.** Old reports may use standard time while the place ran on daylight time; pick one and state it once on screen (`18:25:00 EST` on the first readout).
- **Too much at once.** One layout, one finding; at most five sources on a board, and the subtitle never repeats the heading word for word.
- **Too many words on screen.** Keep only what this beat needs (main readout or heading, the highlighted original, one short tag per source). Eyebrows, English twins of every label, archive numbers, footnotes and translations the subtitle already gives turn the frame into noise.
- **Empty placeholder boxes for missing material.** A grey "no footage" or "waiting for photo" panel looks like a render error. Fill the slot with real material, change the layout, or let the source appear when it starts.
- **A strip reserved at the bottom** (timeline band, caption rail) leaves an empty band when it has nothing to show. Content runs to y ≈ 900; nothing lives in the subtitle area (y ≈ 950–1030).
- **Catastrophe as spectacle.** No slow motion of fire or impact, no full-screen flames, no sound effects on deaths.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L5_视觉调查.md`；Lemo-Opuscar 来源库，仓库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `../licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留通用媒介、材质、镜头、声音、native move、坑与变化规则；按本地 `references/styles/_template.md` 重新编排；移除旧条目头部与专属示范片段。
- 证据状态：来源文字方法完整转写；配套预览仅为静态图，不能证明连续运动、作者实现算法或本地可调用实现。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
