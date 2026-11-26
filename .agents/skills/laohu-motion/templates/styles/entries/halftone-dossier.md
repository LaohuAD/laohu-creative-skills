# 复古半调案卷（halftone-dossier）

> 一句话：Halftone printing and paper dossier devices turn an investigation into a readable, tactile sequence of exhibits.
> 参照（只学语法）：References (grammar only, never copy): Ben-Day-dot pop-art printing (Roy Lichtenstein era comics) for dot density as shading; riso/offset overprint zines for multiply layers and misregistration; police mugshot height charts and case-file folders for the framing device; Japanese variety-show telop captions for the keyword-highlight caption bar.

## 本质 / 不是什么

- **The whole film is paper.** A warm cream sheet with low-frequency mottling, fine grain, a vignette and a fold; dark scenes are printed on it too, never glowing.
- **Shading is never a gradient**: it is halftone dots whose size follows a density field. Two or three dot layers at different screen angles overprint (multiply); that is the "printed" feel.
- **Bureaucratic apparatus**: case numbers, file chips, numbered exhibits, height charts, name plates, stamps. Their seriousness is the frame; the subject can be grave or trivial.
- **Loud but readable**: one idea per 2–4 s card, one big headline, one visual gag or exhibit, one caption line.

Not Risograph (no grainy two-ink riso texture as the whole look, no zine collage), not Swiss motion (no grid-driven kinetic type on white), not Game Show Flat (no candy sets, no rhythm-game rounds). Dots, paper and stamps must be visible in every frame.

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适配主题 |
|---|---|---|
| The whole film is paper. | A warm cream sheet with low-frequency mottling, fine grain, a vignette and a fold; dark scenes are printed on it too, never glowing. | 调查、档案与轻悬疑的解释。 |
| Shading is never a gradient | it is halftone dots whose size follows a density field. Two or three dot layers at different screen angles overprint (multiply); that is the "printed" feel. | 调查、档案与轻悬疑的解释。 |
| Bureaucratic apparatus | case numbers, file chips, numbered exhibits, height charts, name plates, stamps. Their seriousness is the frame; the subject can be grave or trivial. | 调查、档案与轻悬疑的解释。 |
| Loud but readable | one idea per 2–4 s card, one big headline, one visual gag or exhibit, one caption line. | 调查、档案与轻悬疑的解释。 |
| Paper layer | (canvas, multiply over everything, built once): an upscaled random tile for mottling, per-pixel noise with a slight warm bias, a radial vignette, a faint centre fold. | 调查、档案与轻悬疑的解释。 |
| Grain layer | (per frame): a few hundred paper-coloured specks and fewer ink specks, reseeded every 2 frames: dust on the print, not film grain. | 调查、档案与轻悬疑的解释。 |
| Halftone | a rotated grid of circles drawn as one path; step 20–26 px; screen angle different per layer; radius = density × step × k with k 0.6–0.72 (around 0.7 dots merge into solid ink). Density fields: radial (halos, blooms, corner glows), edge (dots crowding the frame border), linear ramps ("lit from above"). The…（完整条件见下方来源转写章节） | 调查、档案与轻悬疑的解释。 |
| Halftone-filled numerals and shapes | a flat fill overprinted with a darker halftone clipped to the glyph; giant numerals may bleed off the frame. | 调查、档案与轻悬疑的解释。 |

列出的是来源正文中的可复用媒介信号；不是固定元素清单。每支按主题选择 2–3 个，其中至少一个避开最常见组合。

## 这个风格最俗的版本

- 来源正文未给出一套固定的俗套画面、配色、配器或开场结尾组合，因此不补造。相邻风格边界与明确排除项保留在「本质 / 不是什么」。
- 每支片子按主题从来源信号中挑 2–3 项，并在 brief 的 style 栏说明保留或改动了什么；故事、数据、构图与时间线重新设计。

## 适配

- 用途：调查、档案与轻悬疑的解释。
- 内容：以当前项目真实素材和用户目标决定是否适配；只借用下方通用媒介规则。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。



来源实现示意：

Everything lives in `demo/index.html`: helpers (`el`, `txt`, `tf`, `seg`, easings, `measure`), per-character text (`chars` + `charsPop`), **halftone** (`halftone()` with `radial`/`edge` density fields), `caption()` bar, **stamp** (`stampEl` + `stampAnim`), a mascot rig with a `setFace` interface, `scene(t0, t1, build)`, HUD chips, dot wipe (`WIPES`), paper + grain (`buildPaper`, `drawFx`), `render(t)`. `demo/render.mjs` renders stills and video; `demo/music.py` synthesizes score and SFX.

上述文件路径、接口名和效果能力只代表来源文档的声明，未在当前本地运行环境验证；生产接入须由 Motion 对照实际代码、依赖和消费者检查。



## 材质与渲染

- **Paper layer** (canvas, multiply over everything, built once): an upscaled random tile for mottling, per-pixel noise with a slight warm bias, a radial vignette, a faint centre fold.
- **Grain layer** (per frame): a few hundred paper-coloured specks and fewer ink specks, reseeded every 2 frames: dust on the print, not film grain.
- **Halftone**: a rotated grid of circles drawn as one path; step 20–26 px; screen angle different per layer; radius = density × step × k with k 0.6–0.72 (around 0.7 dots merge into solid ink). Density fields: radial (halos, blooms, corner glows), edge (dots crowding the frame border), linear ramps ("lit from above"). The second layer is multiplied so inks overprint.
- **Halftone-filled numerals and shapes**: a flat fill overprinted with a darker halftone clipped to the glyph; giant numerals may bleed off the frame.
- **Line boil**: turbulence displacement (small, ~5 px) reseeded ~10×/s plus a fine ink-grain mask that eats a little of every fill. Characters and hand-drawn props only; **never** on text, halftone, HUD or captions.
- **Characters**: chunky shapes with a heavy ink outline (~7 px), flat fills, a lighter belly or face area, glossy eyes (ink ellipse + two highlights) that can squint, blink or close into a happy arc. One head rig shared by all body poses.
- **Stamps**: a double rounded rectangle and bold text through a coarse ink-grain + displacement filter so edges are rough and the ink mottled; ~93 % opacity, tilted ±10°.
- **Props**: starbursts, speech bubbles, confetti, radial rays, sticky notes, folders, clocks: all flat fill + ink outline.

## 配色

- **A paper ground, one dark ink, and four or five flat spot inks.** The dark ink (navy, black-brown or deep green) carries every outline, body text and the caption bar, and is the fade-out colour.
- One ink is the **overprint shadow** colour (misregistration offsets, caption shadows); one is the **highlight** for keywords and numerals; one warm red is reserved for stamps and alarms.
- Flat inks only. No gradients, no transparency ramps; tone comes from dot size and overprint.
- **Night or "secret" scenes** switch to a dark ink ground with a lighter dot layer of the same family, still multiplied by the paper.
- Characters may own one or two local colours (fur, clothing) that appear nowhere else.
- Example palettes: cream / navy / cobalt / hot pink / yellow / red; manila / sepia-black / teal / mustard / vermilion; off-white / forest green / tomato / sky / ochre.

## 字体

- **Headlines**: a black-weight serif (e.g. Noto Serif SC 900 for CJK; a black slab for Latin), 100–230 px, left-aligned near the margin, with a **misregistration shadow** (+8/+8 px in the overprint ink, multiplied).
- **Display / numerals**: a fat rounded display face (e.g. Bagel Fat One) for names, big numbers, times.
- **Interjections**: a playful hand face (e.g. ZCOOL KuaiLe), paper fill with a thick ink stroke and an offset shadow.
- **Data / HUD**: a heavy monospace (e.g. JetBrains Mono 800) for case numbers, dates, rulers, file names.
- **Captions and stamps**: a black-weight sans.
- **Cards are the subtitles.** A headline per beat, plus a **caption bar**: a dark-ink rounded pill with an overprint-ink offset shadow, paper-coloured text, the **keyword in the highlight ink**. It pops in after the headline and holds ≥ max(1.8 s, speech + 0.6 s). With narration, the caption bar carries the spoken line.
- **HUD**: case number and a chapter chip top-left, a status (REC dot, date) top-right; colours invert on dark scenes.
- Latin runs 2–3× longer than CJK: smaller headlines, 1–2-word stamps (GUILTY, CLOSED), a tighter per-character stagger.

## 运动

- 30 fps transforms; **line boil at ~10 fps** on characters, so the drawing breathes while positions stay smooth.
- **Everything enters with overshoot** (back ease, 0.3–0.45 s): rising from below the frame or scaling from 0. Nothing fades in.
- **Per-character pop** for headlines: each glyph drops 30–100 px and squashes in, stagger 0.05–0.08 s (0.02 s for small text).
- **Stamp slam**: ~0.09 s from ~2.6× to 1× (ease-in), then a small damped bounce; camera shake, flash and stamp sound on the same frame.
- **Squash landings** preserve volume (`scale(1/sq, sq)` with a damped cosine).
- **Dot wipe transitions**: a coarse grid of circles grows to full cover and shrinks back (~0.44 s) with a diagonal delay; the scene switches while covered. Each cut may take its own wipe colour. A hard cut is the contrast tool, on a big hit.

## 画面怎么活

- 有角色时，可按来源安排呼吸、尾巴或头发轻摆、眨眼；没有角色也成立。REC 点或时钟冒号可作明确的录制状态提示。
- 点密度随情绪或证据状态改变，不做固定频率的装饰性脉动；来源未规定其它待机循环。

## 镜头语法

A 2D camera group over a flat, frontal page. A vocabulary, not a route. Opening and ending come from the topic.

| Move | What it expresses | Can serve |
|---|---|---|
| Locked frontal with a small beat pulse (~0.6 %) | the page as a poster, grooving | a title; a list; an accusation |
| Slow push-in (1 → 1.05–1.08) | scrutiny, rising tension | a profile; a summary before a verdict |
| Shake with quadratic decay (5–26 px) | impact | a stamp; a crash; a landing |
| Flash frames (white overlay ≤ 0.95 → 0, capped at 0.5 for big hits) | being photographed, a revelation | a mugshot; a verdict; evidence found |
| Pan across a pinned board | connection between exhibits | a timeline; suspects; a chain of events |
| Snap zoom into a halftone detail until dots are huge | "look closer" | a fingerprint; a signature; a number |
| Page turn / folder slide | next file, next chapter | a second case; a flashback |
| Pull back to reveal the whole desk | the file is one among many | scale; "this happens every day" |

Compose like a printed page: headline top-left, subject right-centre, caption bar bottom-centre, HUD in the corners. Transitions: dot wipe or hard cut; no dissolves.

## 声音调色板

- **Synth pop-print toolkit**: synth kick, snare, clap, hat; a square-ish 8th-note bass; triangle pad; a **marimba-like pluck** (fundamental + ~4× partial) for melody; pizzicato and finger snaps for sneaking; music-box bell for tenderness.
- **Foley follows the print and the gag**: stamp = pitch-dropping boom + click (a crackle for big ones), camera shutter, paper slides and folder flaps, typewriter or keyboard clicks, whooshes into wipes, pops on every glyph, boings and plops for characters, glass or ceramic for breakables, synthesized animal or creature voices (formant sweeps).
- **Silence before the stamp**: empty the music just before a verdict so the stamp lands alone. Other options: a snare roll + rising sweep into a reveal; stripping to bass and snaps for a secret scene; a bell arpeggio as a tag; a single sustained pad under a sad exhibit.
- **Voice** is optional; cards carry the film. If narrated: a dry, deadpan report voice, never breathless.
- **Mix**: SFX ahead of the music on impacts, soft-clip master, −14 LUFS, true peak ≤ −1 dB.

## 原生手法

A menu: use the ones your story needs.

- **The accusation frame.** A topic becomes "the case of X": list its counts. *Fits content like:* a cognitive bias on trial; a city's traffic problem; a plant that won't stop growing.
- **Numbered exhibits.** Each beat gets a giant halftone numeral behind it. *Fits content like:* five causes of a blackout; three clauses of a contract; the stages of a recall.
- **The stamp.** A verdict is a physical slam. *Fits content like:* APPROVED on a grant; EXPIRED on a policy; VERIFIED on a rumour check.
- **The mugshot.** Frontal subject, height chart, name plate, flash. *Fits content like:* a new species; a product teardown; the "suspect" in a bug report.
- **Evidence board.** Exhibits pinned and linked with string, then shaken. *Fits content like:* a supply chain; a family tree; a heist's timeline.
- **Dot density = emotion.** Dots swell into a halo, crowd the edges for tension, bloom radially for joy. *Fits content like:* a record broken; a deadline closing in; a reunion.
- **Redaction.** Black bars print over words and lift one by one. *Fits content like:* a leaked memo; a surprise party plan; spoilers.

## 变化空间

You decide what the file is about, its counts or exhibits, the characters (or none), the inks within the colour logic, the tone (farce or grave), the opening, the ending and the length (it grows with the number of exhibits; each needs time to be read).

每支新片都从主题重新设计，不照搬来源示范片：

- Structures: **a declassified report** whose pages are unredacted one by one until the real story shows; **a missing-person file** that works backwards from the last sighting; **an insurance claim** where each exhibit contradicts the claimant's statement.
- Openings: **the evidence bag** (one object on a dark ink ground, the file assembles around it); **a fingerprint** in huge dots that resolves into a face as we pull back; **the phone call** (a caption bar alone on paper, the file drops in after).
- Endings: **the file goes into a drawer** full of identical files; **a redacted final page** (the answer stays blacked out); **the stamp misses** (it lands on the table, the subject walks free out of frame).

---


## 坑

- **Fonts not loaded before layout** → per-character positions computed with a fallback font, glyphs overlap. Preload every family against the whole page source and the built text; runtime strings must use only characters that appear in the file. Use `font-display: block`.
- **Boil on text or dots** turns them to mush → filter only characters and props.
- **Clip-path ids are global** → every clipped numeral needs a unique id.
- **Time-windowed scenes** → an element invisible before its cue needs explicit opacity 0 for `t < t0`.
- **A dot wipe short of full coverage** at the cut shows the hard switch; make the max radius cover the grid cell's diagonal.
- **A 100 % white flash** reads as a dropped frame → cap at ~0.5.
- **Dots too small** (< ~14 px step at 1080p) alias into moiré after encoding.
- **Too many inks** lose the print feel → at most five plus paper.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L29_复古半调案卷.md`；Lemo-Opuscar 来源库，仓库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `../licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留通用媒介、材质、镜头、声音、native move、坑与变化规则；按本地 `references/styles/_template.md` 重新编排；移除旧条目头部与专属示范片段。
- 证据状态：来源文字方法完整转写；配套预览仅为静态图，不能证明连续运动、作者实现算法或本地可调用实现。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
