# 延时摄影交响（time-lapse-symphony）

> 一句话：Real place footage is shaped by time compression, musical subdivisions and a deliberate contrast between fast systems and slower moments.
> 参照（只学语法）：Grammar learned from the city-symphony tradition and the "Qatsi" films (Reggio / Fricke, scores in the Philip Glass manner). Nothing is taken from those films: no footage, no melody, no title lettering, no names in the film.

## 本质 / 不是什么

- **An edit style.** The picture is real footage of a place (time-lapse, hyperlapse, aerials, slow motion, archive film, photographs). The style lives in *how time is bent* and *where the cuts fall*, not in a drawn look.
- **The score is the script.** It is written first, with a clear arc: minimal repetition → acceleration → climax → a sudden stop → acceleration again → hard stop → a quiet coda. Every cut sits on a beat or a subdivision of it.
- **Machines fast, people slow.** Cars, trains, clouds and light are sped up until they become lines; the one slowed moment is something fragile (a soap bubble, steam, a flag, a flock), and people appear as crowds, tracks or long-exposure ghosts.
- **Few words, each one earned.** On-screen text is a title, a handful of numbers that state the size of the place (each from an official source), an archive date, and one line from a real public-domain text at the end.
- **It is not** a travel reel (no drone-porn montage on a pop track), a vlog, a news package, an explainer with a narrator, or a slideshow of postcards. No lower thirds with names, no headers, no centred title cards with page-turn transitions, no logo stings.

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适配主题 |
|---|---|---|
| An edit style. | The picture is real footage of a place (time-lapse, hyperlapse, aerials, slow motion, archive film, photographs). The style lives in *how time is bent* and *where the cuts fall*, not in a drawn look. | 地点变化、城市节奏与长时间过程。 |
| The score is the script. | It is written first, with a clear arc: minimal repetition → acceleration → climax → a sudden stop → acceleration again → hard stop → a quiet coda. Every cut sits on a beat or a subdivision of it. | 地点变化、城市节奏与长时间过程。 |
| Machines fast, people slow. | Cars, trains, clouds and light are sped up until they become lines; the one slowed moment is something fragile (a soap bubble, steam, a flag, a flock), and people appear as crowds, tracks or long-exposure ghosts. | 地点变化、城市节奏与长时间过程。 |
| Few words, each one earned. | On-screen text is a title, a handful of numbers that state the size of the place (each from an official source), an archive date, and one line from a real public-domain text at the end. | 地点变化、城市节奏与长时间过程。 |
| It is not | a travel reel (no drone-porn montage on a pop track), a vlog, a news package, an explainer with a narrator, or a slideshow of postcards. No lower thirds with names, no headers, no centred title cards with page-turn transitions, no logo stings. | 地点变化、城市节奏与长时间过程。 |
| Left-aligned | , left margin 168–196 px, never centred, never on a box. Legibility comes from a very soft elliptical darkening behind the block (α ≤ 0.6), not a panel. | 地点变化、城市节奏与长时间过程。 |
| Number card | the number in Michroma 84 px (44 px when three numbers stack); a 2 px sodium rule grows under it; one Chinese line (28 px) and one English line (14–16 px) say what it counts and the source year. A census-type number locks digit by digit on sixteenths (one glockenspiel note per digit); a flow number counts u…（完整条件见下方来源转写章节） | 地点变化、城市节奏与长时间过程。 |
| Archive date | just the year, Michroma 22 px, bottom-left of the archive panel. | 地点变化、城市节奏与长时间过程。 |

列出的是来源正文中的可复用媒介信号；不是固定元素清单。每支按主题选择 2–3 个，其中至少一个避开最常见组合。

## 这个风格最俗的版本

- 来源正文未给出一套固定的俗套画面、配色、配器或开场结尾组合，因此不补造。相邻风格边界与明确排除项保留在「本质 / 不是什么」。
- 每支片子按主题从来源信号中挑 2–3 项，并在 brief 的 style 栏说明保留或改动了什么；故事、数据、构图与时间线重新设计。

## 适配

- 用途：地点变化、城市节奏与长时间过程。
- 内容：以当前项目真实素材和用户目标决定是否适配；只借用下方通用媒介规则。

### 地点素材、时间证据与署名

延时、超延时、航拍、慢动作、历史影像和同机位照片都要对应真实地点、拍摄/记录时间和素材身份；不同地点或年份可以作对照，但不能剪成同一连续过程而不提示。数字卡使用对应时期的官方或一手统计并注明年份。素材使用区间、来源和许可按项目现有记录能力保留；片尾署名遵守许可。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

来源正文规定了实拍素材的来源、预处理、时间重映射和后期流程，没有声明具体的图形渲染器或作者工程接口。不能据此断言作者使用 AE、Canvas 或其它工具；本片按需选用 Motion 原生工具。

## 材质与渲染

- Footage only (2D). Sources mixed freely: tripod time-lapse, long single-camera time-lapse (≥ 12 h, sunrise and sunset in the same frame), hyperlapse, drone aerials (top-down is gold), high-frame-rate slow motion, archive film (pre-1931), photographs (a pair from the same camera position is gold), a scanned page of a historic text.
- Everything is unified into one **35 mm release-print** look: 1.85:1 matte (21 px bars on 1920×1080), warm highlights, lifted blacks, highlight bloom, clumped mid-tone grain, ±0.5 px gate weave, soft vignette.
- Never generated images; never restored, colourised or speed-corrected archive copies; never YouTube mirrors of archive films.
- Upscale limits: archive ≤ 2.5× (denoise → lanczos → light sharpen → grain); modern ≤ 1.5×.

## 配色

| Use | Value |
|---|---|
| Type (warm white) | `#EDE8DF` |
| Secondary line (English, labels) | `#B0AAA0` |
| Sodium orange — the only accent (rules under numbers, source lines, crowd tracks, the day ring's hand) | `#D9772F` |
| Matte and black | `#000000` |

Grade (`tools/render.py → make_luts / grade`): per-shot partial grey-world white balance first (only pixels with luminance 0.12–0.88, strength 0–0.6; **0 for night shots**, which keep their sodium and blue), then one LUT for all shots: S-curve (sigmoid slope 6.2, pivot 0.47, blended 55/45 with linear) → black 7/255, white 250/255 → R ×1.025, B ×0.965 (warm highlights, a little cold in the shadows) → saturation 0.86. Bloom: pixels above 170/255, blurred 6 px at ⅛ size, added back × (1, .82, .62); 0.09 by day, 0.15–0.2 at night. Grain: half-resolution Gaussian noise up-sampled and blurred 0.6 px, weighted `0.35 + 1.3·L·(1−L)`, strength 9/255. Archive film stays black-and-white and goes through the same LUT, so it reads as part of the same print.

## 字体

- Latin: **Michroma** (OFL), capitals, tracking 0.06–0.32 em. Chinese: **Noto Sans SC** variable, weight 300–350, tracking 0.08–0.14 em. Credits: Noto Sans SC 17 px.
- **Left-aligned**, left margin 168–196 px, never centred, never on a box. Legibility comes from a very soft elliptical darkening behind the block (α ≤ 0.6), not a panel.
- **Number card**: the number in Michroma 84 px (44 px when three numbers stack); a 2 px sodium rule grows under it; one Chinese line (28 px) and one English line (14–16 px) say what it counts and the source year. A census-type number locks digit by digit on sixteenths (one glockenspiel note per digit); a flow number counts up from 0 in 0.6 s (ease-out). "About" numbers carry `≈` and "约".
- **Archive date**: just the year, Michroma 22 px, bottom-left of the archive panel.
- **Closing quote**: on the page shot the whole sentence is lit; on the card, a short fragment over the last moving shot — Chinese 60 px, English original in capitals 20 px, source line 14 px sodium, fading in within 0.25 s and held just past the reading time.
- One line per language, never wrapped; every text block stays fully in frame at least CJK ÷ 4.5 + other ÷ 15 + 1.5 s (`readcheck.mjs`). Text may stay up across cuts underneath it, but only while the shots under it belong to what it counts.
- `.srt`: the film has no voice, so the subtitle file carries the on-screen text (one Chinese and one English line per cue) for muted or accessible playback.

## 运动

- Speed is the main instrument. Shot speeds run from 0.3× to 75×; every speed above 1× uses **frame blending** (a 360° shutter): each output frame averages the source frames it covers, capped at N frames. Headlights become continuous lines, crowds become fog, clouds become water.
- **Speed ramps** are smooth (smoothstep between key speeds) and always mean something: a corridor accelerates out of real time (1× → 6×), a time-lapse ramps into a frenzy (1× → 7×), a fast shot brakes into slow motion (2.2× → 0.3× in 0.55 s) on the bar where the music stops.
- Camera moves are added sparingly in post: slow push-ins (1.00 → 1.05–1.10 over the shot), a falling push on the opening still (1.0 → 1.3 in 0.35 s, ease-out, then accelerating to ×2 by the cut). No shakes, no whip pans, no digital zooms past the upscale limit.

## 画面怎么活

- 主动变化来自实拍素材的时间压缩、速度坡道与少量后期推镜；停留时沿用素材实际运动。
- 来源没有规定额外图形微循环。素材本身不动时不凭空添云、人群或灯光循环；音乐停顿和结尾静帧按来源保持。

运动与循环描述来自来源文字 / 实现说明；本地尚未独立逐帧复现或核验，不作为本地渲染验证。

## 镜头语法

**Cut-point table (the score decides; numbers at 120 BPM and 30 fps: 1 beat = 15 frames, triplet = 5, sixteenth = 3.75)**

| Score texture | Cut length | Frames | Use |
|---|---|---|---|
| Opening hit + eighth-note arpeggio | 2 bars → 1 bar | 120 → 60 | the opening still, the first single-camera time-lapse |
| Eighths | 2 beats → 1 beat | 30 → 15 | dawn, match cuts |
| Triplets against eighths (3:2) | 1 beat → ½ beat | 15 → 7/8 alternating | morning, the montage of streets |
| Sixteenths, full ensemble | grid cells light every 1–2 frames; cells re-cut every sixteenth | 1–4 | the grid |
| Arpeggios stop, one long chord | 3–4 s, one or two shots | 90–120 | the brake: the slowed thing, the archive split |
| Sixteenths + triplets + horns | ½ beat → 4 frames → 2 frames | 7 → 4 → 2 | dusk to night, the reverse flashback |
| Dry cut of the whole ensemble, reverb left ringing | hard cut to black on the bar line | — | the hard stop |

Rules:

- **Cuts land on beats.** All cut times come from one function, `bar(n, beat)` in `tools/timeline.py`; shot lengths are never typed in seconds. The music is rendered from the same file.
- **One long single-camera time-lapse is the clock.** It returns three or four times (night → dawn, noon clouds, a one-second nightfall, a day/night flicker), always from the same position, so the viewer knows the time without a caption.
- **Density follows the score.** The editor never cuts faster than the current subdivision, and the slowest picture sits under the place where the arpeggios stop.
- **Shape match cuts** on the beat: clock → clock, arch → arch, grid of streets → grid of cells. A small-to-large punch-in on the same shape is allowed.
- **The grid** is the split screen of this style: 1×2 → 2×2 → 3×3 → 4×4, one stage per half bar or bar, the new cells lighting up in a scattered order over the previous stage within 0.3 s (never back to black), gutters 6 px black; in the last beat the cells re-cut on every sixteenth.
- **Counterpoint split**: two halves, archive left, today right, the same kind of place or shape; the gutter grows from the centre in 8 frames.
- **Day/night flicker**: the same camera, a noon frame and a night frame alternating every 2 frames; a pair of same-position photographs alternating every 2 frames.
- **Reverse flashback**: in the last bar before the hard stop, earlier shots return in reverse order, 4 frames each, then 2 frames each.
- Transitions: hard cuts only, plus the hard cut to black. No dissolves except fades from black for the page and the end card.

## 声音调色板

- **Music only.** No narrator, no source sound (the footage soundtracks are other people's music), no sound effects. A narrator would turn watching into listening and would fight the score for the structure; that is why the style has none. If a voice is ever required, one short line at the very start or end, never over the cuts.
- Orchestration (sampled, CC0 — `core/audio/sampler.py`): pipe organ (full and soft stops, pedal), winds staccato (flute, clarinet), strings (spiccato cellos and violins, sustained cellos, violins, double bass), horn pair for the last two bars, concert bass drum on section downbeats, suspended-cymbal crescendos into the hits, glockenspiel only for numbers locking.
- Writing: arpeggios over a one-chord-per-bar progression; additive layering (eighths → triplets over eighths → sixteenths); the *break* is all arpeggios stopping at once into one held chord (maj7 or 9th); the return is a full-organ hit; the hard stop is a dry cut of every instrument in 15 ms with the reverb tail left ringing; the coda is one soft chord that does not resolve, with the opening figure returning in quarter notes under the end card.
- Reverb: `S.room(size .7, mix .28)` for the body, `size .78, mix .36` for the coda. Master to −14 LUFS / −1.2 dBTP with `core/render/mux.sh` (grain 0: the grain is already in the picture).

## 原生手法

| Move | Code |
|---|---|
| **Light river** | `tools/prep.py`: integrate the speed curve to source time; each output frame averages the source frames in its window (cap `blend`). Speed 40× / blend 30 at night, 37.5× / 24 for clouds, 75× / 30 for a one-second nightfall. |
| **Speed ramp** | `speed=[(t, v), …]` keyframes, smoothstep between them, same integrator. |
| **Brake into slow motion** | ramp 2.2× → 0.3× with `interp=3` (ffmpeg `minterpolate` mci, bidir) for soft subjects; `mix=True` (crossfade of the two nearest frames) for thin lines such as cables, where motion compensation tears. |
| **Crowd → tracks** (people as data) | `Trails` in `tools/render.py`: background = per-pixel median of the whole fixed-camera shot; blobs that differ by > 22/255 (scipy `ndimage.label`, area 8–900 px at half size) are people; each centroid joins the nearest one from the previous frame (< 70 px) with a 2 px line; lines fade × 0.9 per frame; the plate is darkened and desaturated as the tracks appear (0.15 → 0.55 s). Fixed cameras only. |
| **Traffic → light** | a static or slowly drifting top-down aerial at 5× with full frame blending. |
| **Grid** | `grid_plate()`: pool clips of 30 frames held in memory at 960×540; stages from `GRID_STAGES`; light-up order scattered; last beat re-cuts cells every sixteenth. |
| **Counterpoint split** | `split_plate()`: archive 4:3 centre 960 px | today centre 960 px, 6 px gutter grown from the centre. |
| **Day/night flicker** | two 15-frame clips from the same camera (noon, night), alternating every 2 frames. |
| **Photo that moves** | a same-position photo pair alternating every 2 frames. |
| **Number lock** | `lock_digits()`: one digit locks per sixteenth, the others roll; `counter()`: ease-out count-up; music adds one glockenspiel note per lock. |
| **Day ring** | a thin 24-hour ring bottom-right with a sodium hand and a 3-hour arc: it runs with the film's day, **freezes and dims during the brake**, and **spins backwards during the reverse flashback**. It is a graphic, not a clock reading. |
| **Reading light on a page** | scanned page, 16:9 window pushed 1.06 → 1.56 page widths, side light (bright top-left), paper tint (1, .93, .80), a Gaussian band (σ 95–140 px) over the quoted line growing to +38 %. |
| **Hard stop** | picture cuts to black on the bar line; the music's dry signal is cut in 15 ms on the same frame; only reverb remains. |

## 变化空间

- Place: any city, port, airport, market, campus, factory, a river over a year (the clock becomes a season).
- Length: 30–90 s; one brake at least; one hard stop always.
- Score: organ/winds/strings is the default; a choir, a piano ensemble or analogue synth arpeggios also work if the writing stays additive and the break stays a sudden held chord.
- Tempo 96–132 BPM; at 30 fps prefer tempos whose beat is a whole number of frames (120: 15, 100: 18, 112.5: 16).
- Grid sizes and the counterpoint pair change with the material (archive vs today, day vs night, two cities).
- Number cards: 2–4 at most; the day ring may be dropped for non-daily structures.
- Fixed: footage only, the frame-blended light, cuts on the beat, the brake, few words, one quote, the hard stop, the release-print grade.


## 坑

- **Watermarks and slates hidden in CC footage**: corner logos (scale from the centre until they leave frame, within 1.5×), opening thank-you cards, end-card music credits, title text over the first shots. Check a 1-second contact sheet (`tools/secsheet.py`) of every source before choosing in-points.
- **Hidden cuts inside sources.** Hyperlapse reels hide 2–3-frame jump cuts and whip transitions; frame blending across a cut makes ghosts. Scan with `ffmpeg … select='gt(scene,0.25)',showinfo` and keep every clip's source window inside one shot.
- **Too much blending** turns noon clouds into grey mush: about 40 % shutter (24 of 60 frames) looks better than 100 %.
- **Grey-world balance kills night**: it washes sodium light to white. Strength 0 for night shots.
- **Tracking needs a fixed camera.** A drifting drone flags every building as motion. Use a median background only on tripod shots; for moving aerials use blending instead.
- **Motion-compensated slow motion tears thin lines** (cables, rails, text): use the crossfade mode there.
- **Text over bright sky** disappears: put number cards over the dark half of the frame or add the soft darkening; never a box.
- **A slow face is not a free subject.** Do not make an identifiable ordinary person the slowed or close-up hero. Slow a thing; show people as crowds, tracks or ghosts. Public figures and people in news events are a different case.
- **Numbers drift.** Official pages update; record the quoted page, year and source in Motion’s existing project fact/source record, then recheck before the last render. Prefer one clean figure over a range.
- **CC BY credits are long.** Each one needs author, full title and licence on the end card. Treat them as fine print (16 px, 29 px line pitch, the licence and changes on one header line) and keep the end card short (4–5 s); a 10 s card of text on black loses the audience. The film's last moving shot runs on under the card, darkened.
- **Don't end on dead black.** After the hard stop, the coda is a page (≈1 s), then the quote laid over one last moving city shot (≈4 s, just long enough to pass `readcheck`), then the end card over the same shot.
- Commons rate-limits (HTTP 429): search and download serially with back-off (`tools/s.sh`, `tools/f.sh`); for long 4K files download only the needed excerpt (`tools/seg.py`) or the 1080p transcode.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L4_延时摄影交响.md`；Lemo-Opuscar 来源库，仓库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `../licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留通用媒介、材质、镜头、声音、native move、坑与变化规则；按本地 `references/styles/_template.md` 重新编排；移除旧条目头部与专属示范片段。
- 证据状态：来源文字方法完整转写；配套预览仅为静态图，不能证明连续运动、作者实现算法或本地可调用实现。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
