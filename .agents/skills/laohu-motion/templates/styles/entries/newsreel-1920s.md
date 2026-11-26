# 1920年代新闻片（newsreel-1920s）

> 一句话：A newsreel language built from archival footage, printed material, announcer patter and musical edit points.
> 参照（只学语法）：References (grammar only): **Fox Movietone News** and **Universal Newspaper Newsreel** (1927–1930s) — the ident ritual, the announcer's patter, one story per location, the stinger after the last story; **Pathé News** — the item title card; Hollywood's **spinning newspaper** montage; **1920s hot dance bands** (Charleston rhythm, banjo, tuba). Never copy a real newsreel's name, logo, globe design, typeface or fanfare.

## 本质 / 不是什么

An edit style: the look is in **how real material is arranged, cut, captioned and carried by sound**, not in a drawing technique.
- **Archive in a projected gate**: 1.37:1 picture, full height, rounded corners, black outside; everything inside it shares one silver grade, gate weave, flicker, scratches and dust.
- **News objects** do the explaining: newspapers, magazine pages, books, telegrams, maps, records. They are filmed (spun, slammed, panned, turned, underlined), never typeset as slides.
- **A voice talks over everything**: short exclamations, half joking, never a lecture.
- **Music is a band, and it edits**: cuts land on the band's beats; the band stops dead to let a line land; a period record can take over the soundtrack.

Not `silent-film` (1920s Silent Film, in this library): that style is a drawn, inked comedy projected between velvet curtains, with intertitles instead of voices, a cinema pianist and no foley. Here nothing is drawn but the packaging; the footage and print are real; somebody always speaks; the soundtrack is brass, banjo and records; titles are news captions (place · date), not dialogue cards; there are no curtains and no theatre.
Not a documentary with a "vintage filter" either: no talking heads, no slow Ken Burns drifts, no modern lower-third bars.

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适配主题 |
|---|---|---|
| Archive in a projected gate | 1.37:1 picture, full height, rounded corners, black outside; everything inside it shares one silver grade, gate weave, flicker, scratches and dust. | 历史回顾、档案叙事与轻松的年代新闻短片。 |
| News objects | do the explaining: newspapers, magazine pages, books, telegrams, maps, records. They are filmed (spun, slammed, panned, turned, underlined), never typeset as slides. | 历史回顾、档案叙事与轻松的年代新闻短片。 |
| A voice talks over everything | short exclamations, half joking, never a lecture. | 历史回顾、档案叙事与轻松的年代新闻短片。 |
| Music is a band, and it edits | cuts land on the band's beats; the band stops dead to let a line land; a period record can take over the soundtrack. | 历史回顾、档案叙事与轻松的年代新闻短片。 |
| Gate | 1480 × 1080 inside 1920 × 1080 (1.37:1), corner radius 26 px, pure black outside. Nothing is ever drawn outside the gate. | 历史回顾、档案叙事与轻松的年代新闻短片。 |
| Two layers | the picture layer (footage, print, maps, cards) gets the film look; the type layer (place cards, labels, subtitles, the record inset) stays sharp and steady. Grease-pencil marks belong to the picture (they weave with it). | 历史回顾、档案叙事与轻松的年代新闻短片。 |
| Base grade | for every source, before anything else (`tools/prep.py`, `grade()`): greyscale → percentile stretch (0.6 % → black, 99.6 % → white; print: 0.2–0.3 % / 99.0–99.7 % with the black lifted to 26–30, like newsprint) → mild S-curve `x + 0.18·(x−0.5)·(1−\|2x−1\|)` → output 14–238. Moving footage uses one level set per…（完整条件见下方来源转写章节） | 历史回顾、档案叙事与轻松的年代新闻短片。 |
| Projection look | (`filmLook()`, picture layer only): warm silver (`multiply #efe7d6`, `screen #17140f`), vignette 0.42 H → 0.95 H, flicker ±3.5 % per frame + 3 Hz drift, gate weave ±1.6 px / ±2.2 px (value noise), 0–3 vertical scratches that live for 9 frames, 0–4 one-frame dust specks. Grain is added at mux (`mux.sh … 24 7`)…（完整条件见下方来源转写章节） | 历史回顾、档案叙事与轻松的年代新闻短片。 |

列出的是来源正文中的可复用媒介信号；不是固定元素清单。每支按主题选择 2–3 个，其中至少一个避开最常见组合。

## 这个风格最俗的版本

- 来源正文未给出一套固定的俗套画面、配色、配器或开场结尾组合，因此不补造。相邻风格边界与明确排除项保留在「本质 / 不是什么」。
- 每支片子按主题从来源信号中挑 2–3 项，并在 brief 的 style 栏说明保留或改动了什么；故事、数据、构图与时间线重新设计。

## 适配

- 用途：历史回顾、档案叙事与轻松的年代新闻短片。
- 内容：以当前项目真实素材和用户目标决定是否适配；只借用下方通用媒介规则。

### 档案素材、事实与署名

选用与题材、年代和地点相符的真实影像、报刊、信件、地图、照片与录音；核对档案目录说明，避免把相邻年代或不同事件当成当前事实，着色/修复版本不冒充原拷贝。旁白与字幕中的日期、人物和事件要能回到同期文献、档案目录或可靠一手资料；素材来源、许可与使用片段按项目现有记录能力保留。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

来源文本给出了确定性逐帧读取、素材预处理和后期混音步骤，但没有声明可核验的 Canvas / DOM / WebGL 渲染器或完整的本地入口。这里保留来源说明的处理接口；

## 材质与渲染

- **Gate**: 1480 × 1080 inside 1920 × 1080 (1.37:1), corner radius 26 px, pure black outside. Nothing is ever drawn outside the gate.
- **Two layers**: the picture layer (footage, print, maps, cards) gets the film look; the type layer (place cards, labels, subtitles, the record inset) stays sharp and steady. Grease-pencil marks belong to the picture (they weave with it).
- **Base grade** for every source, before anything else (`tools/prep.py`, `grade()`): greyscale → percentile stretch (0.6 % → black, 99.6 % → white; print: 0.2–0.3 % / 99.0–99.7 % with the black lifted to 26–30, like newsprint) → mild S-curve `x + 0.18·(x−0.5)·(1−|2x−1|)` → output 14–238. **Moving footage uses one level set per clip** (sampled across all its frames), never per frame.
- **Projection look** (`filmLook()`, picture layer only): warm silver (`multiply #efe7d6`, `screen #17140f`), vignette 0.42 H → 0.95 H, flicker ±3.5 % per frame + 3 Hz drift, gate weave ±1.6 px / ±2.2 px (value noise), 0–3 vertical scratches that live for 9 frames, 0–4 one-frame dust specks. Grain is added at mux (`mux.sh … 24 7`), not in the page.
- **Archive film upscaling**: at most ~2.5×. NTSC transfers (720 × 480) are treated as 4:3, cropped to 1.37 and scaled 2.31× to 1480 × 1080: `hqdn3d=4:3:6:5` → `lanczos` → `unsharp=5:5:0.55` → base grade. Frames are exported at 24 fps as JPEG sequences and played by `floor((t − t0) · 24)`, so renders are deterministic.
- **Print**: newspapers, magazines and books at their scan resolution; crop pages to the relevant fold so unrelated (and sometimes ugly) old stories never come into view.
- **Code-drawn packaging only**: the ident (sunburst, two searchlights, wire globe), item title cards, maps, the end card. Never generate "archive" pictures.

## 配色

- **Monochrome warm silver** for the picture; values do the work (check every shot as a thumbnail).
- Type is cream on near-black (`#f3eee4` / `#d6cfc0` on `rgba(12,11,10,.8)`), framed by a 2 px cream rule; marks are a slightly warm white grease pencil; underlines on printed pages are dark soft lead.
- Packaging silver: Art Deco gradient lettering `#fff → #d9d4ca | #9e978a → #efebe2` with a hard "metal" break at the middle and a black outline (0.12 em).
- No colour accents, no sepia wash on top of the silver, no colourised archive.

## 字体

| Use | Face (all OFL) | Spec |
|---|---|---|
| Ident, item cards, end title | Limelight | 104–118 px, silver gradient, black outline |
| Chinese display (ident, cards, end title) | Noto Serif SC 900 | 50–76 px, letter-spacing 10–26 px, `#ece7dc` |
| Place card, labels (English) | Oswald 600 | 26–34 px, letter-spacing 4–6 px, upper case "PLACE · DATE" |
| Place card, labels (Chinese) | Noto Sans SC 500–600 | 24–30 px |
| Subtitles | Noto Sans SC 600 40 px over Oswald 400 29 px | bottom of the gate (baselines H−82 / H−38), black stroke 8 / 6 px |

- **Place card** (the newsreel's segment title, instead of full-screen cards for every story): top left of the gate (gate x + 48, y 56), dark box with an inset 2 px cream frame, English "PLACE · DATE" over one Chinese line; it is pulled out left to right in 0.22 s and fades 0.15 s before it leaves. Hold ≥ CJK ÷ 4.5 + Latin ÷ 15 + 1.5 s from the moment it is complete (`readcheck.mjs`), so keep both lines short.
- **Item title card** (one per film at most, to turn to a new story): black, a double Art Deco frame drawn in 0.35 s with quarter-fan corners, Limelight line + Chinese line, slow push; ≥ 2.5 s.
- **Labels inside split screens**: one per panel, top centre, same box style, enter one beat apart.
- **Subtitle strip**: the subtitles sit on a dark strip across the bottom of the gate (180 px, transparent at the top edge, ≈ 93–96 % `#0a0908` below), on every shot, fading in 0.25 s before the first cue of a run and held through gaps under 1 s, so it never blinks; print and pale footage would otherwise swallow the letters (`subBand()`).
- **Subtitles**: Chinese line over English line, **one line per language, never wrapped** (`tools/subcheck.mjs` measures every cue in the page); a cue lasts max(1.8 s, spoken + 0.6 s) and ends 50 ms before the next. Print in shot is never re-typed as a caption: the announcer and subtitles carry its meaning, an underline points at it.

## 运动

- **The band is the clock**: pick a hot-dance tempo (190–220 BPM); every cut, landing, slam and label entrance sits on a beat, most cuts on bar lines; quick inserts on beat 3 or on the Charleston accent (beat 1 and the "and" of 2). When a period record plays, cut on the record's own beat (measure it), not on the grid.
- **One story = one place + one kind of material + one line of voice.** Stories get shorter towards the end (2–3 bars → 1 bar → beats), then one held button.
- **Shot lengths**: archive shots 1–2.5 s; print and documents 2.5–4 s (they must be read); comparisons ≥ 2.5 s fully in frame before the verdict; never a static frame longer than ~1 s without something moving (push, roll, pencil, flicker of a counter).
- **Transitions are the newsreel's own, each used once, as punctuation**: iris close/open, diagonal hard wipe with a bright 6 px edge, vertical-axis flip, venetian blinds (12 slats turning), clock wipe from 12 o'clock, spinning paper, page turn, panel push-over, freeze. No cross-dissolves between stories, no modern whip pans, no zoom blur.
- **L-cuts**: the announcer may run 0.3–0.5 s over a cut; a new music state may start one beat before its picture (J-cut).

## 画面怎么活

- 投影画面停留时，保留来源所述的轻微闪烁（每帧约 ±3.5%）、门片摆动（约 ±1.6 / ±2.2 px）、短划痕和单帧尘点；这些是投影介质纹理，不代替剪辑动作。
- 纸张旋转、地图扩展等只在相应揭示动作中发生；来源没有规定额外的背景微循环。

运动与循环描述来自来源文字 / 实现说明；本地尚未独立逐帧复现或核验，不作为本地渲染验证。

## 镜头语法

| Move | What it does | Typical use |
|---|---|---|
| Spin-and-slam | the paper arrives as news | a headline; a telegram; a poster |
| Slow push then punch-in on a beat | from the whole page to the one detail | a headline → a photo in it |
| Pan across a wide print | a crowd, a parade, a skyline | panoramas, group photos |
| Tilt to reveal | the landmark behind the subject | a building, a monument |
| Map push | from the country to one city, into the next story | travel, spread, campaigns |
| Grid deal | many related stills land one per beat | step-by-step, collections, "all of them" |
| Flip-book | a series of stills played on the beat becomes motion | dance steps, assembly stages, before/after |
| Freeze + jolt | stop the archive on the telling frame | the punchline, the evidence |
| Split / quad | two or four places at once, side by side | comparisons, "everybody's doing it" |

Archive footage is not reframed with fake camera moves bigger than ~6 % (it already has its own camera); stills always get a move with a purpose.

## 声音调色板

- **Announcer** (Kokoro): a bright, energetic male voice; a blend of two voices (e.g. `am_liam:0.6,bm_george:0.4`) gives a mid-Atlantic tinge; speed ≈ 1.15–1.2; 6–12 words per line, exclamations and rhetorical questions. Treatment as a 1930 optical track (`period_voice()` in `audio/mix.py`): high-pass 260 Hz, low-pass 3.7 kHz, +4 dB presence at 1.5–2.3 kHz (horn loudspeaker), tanh drive 2.0, compression 4:1, wow 0.22 % at 0.55 Hz + flutter 0.07 % at 6.3 Hz, two short wall reflections (31 ms, 67 ms). The speech check runs on the clean voice and again on the finished film (`tools/final_asr.py`).
- **Band** (original): tuba on 1 and 3, banjo four to the bar (accent 2 and 4), trombones on the Charleston figure (1 and the "and" of 2), snare backbeat, honky-tonk piano right hand, muted then open trumpet melody with clarinet a sixth below, woodblock pickups; a brass fanfare with timpani for the ident; a dead stop with one stab for the punchline; "da – DA!" to close.
- **Counter-music**: when the story has two sides, give the other side its own band (here an old-time reel: fiddle, plucked dulcimer, upright piano, tuba) and let them trade bars, then half bars, in a split screen, panned left and right.
- **Archive record**: a public-domain 78 can take over the soundtrack as "the real thing": needle drop (click + surface noise), band-pass 110–6500 Hz, crackle and rotation rumble only while the needle is down, varispeed by ≤ 2 % to sit on the film's tempo; end it on its own final chord and lift the needle.
- **Foley** for every move: carbon-arc snap, rising whoosh with flutter for the spinning paper, thump + paper slap, telegraph clicks under a map line, camera shutter per still, paper flicks per flip-book page, slat flutter, page turn, grease-pencil squeak, soft-lead scratch.
- **Bed**: projector (24 Hz claw clatter, motor hum, optical hiss) from first to last frame.
- **Mix**: the band and record ducked ≈ 4–5 dB under the voice (voice ≈ 12 dB over the music), the band band-limited 95–7500 Hz with a low shelf and light saturation; two silences (a dead stop before a turn, only the projector before the button); −14 LUFS.

## 原生手法

A menu; use the ones the story needs, each once.

- **The ident ritual.** Searchlights snap on with a flash in the first 0.2 s, the globe grows and turns, the name lands with overshoot, the iris closes on the globe. Code: `sceneLogo()` — `sunburst()`, `beams()`, `globe()`, `decoTitle()`. *Fits:* the opening of any news-shaped film; the reprise is the sign-off.
- **The spinning paper.** Grows by `u^2.3`, rotation decays by `(1−u)^1.25` over 2.5 turns, three ghost copies 18 ms apart as motion blur, a vertical jolt (damped sine, 16 px) and a 3 % bounce on the slam, then push and punch in on the next beat. *Fits:* a headline, a decree, a press release.
- **The map spread.** A projected outline (Natural Earth, Albers), dotted arcs from the source city drawn on the beat with telegraph clicks, star pulses on arrival, place labels in screen space, an odometer of years in a corner; push into the city of the next story. *Fits:* a craze, a product launch, a migration, a campaign.
- **Grid deal → flip-book.** Stills land one per beat (shutter click each), then the camera dives into the first cell and the series plays on the beat as stop motion. *Fits:* a how-to, the stages of a process, a collection.
- **Document underline.** Slam a book or letter, turn the page, push to the paragraph, draw soft-lead underlines word-exact (positions from the scan's OCR boxes, e.g. archive.org hOCR). *Fits:* a quote, a rule, a contract clause.
- **Grease-pencil freeze.** Freeze the telling frame, jolt it, ring the detail with a hand-drawn loop (`pencil()` + `ring()`), add an arrow. *Fits:* the evidence, the punchline, "look here".
- **Split-screen duel → push-over.** Two panels slide in, each labelled, each with its own music in its own channel trading bars; the winner pushes the loser out of frame. *Fits:* old vs new, rival products, two cities.
- **Needle drop.** The band cuts dead, a 78 spins in the corner, the period record plays under the archive and ends on its own chord at the freeze. *Fits:* any era that has public-domain recordings.
- **Band stop + button.** One stab, silence with only the projector, one short line from the announcer. *Fits:* the last word of any story.

## 变化空间

- **Era**: late silent newsreel (no voice, title cards only) ↔ early sound newsreel (this style) ↔ 1940s wartime newsreel (deeper voice, maps with arrows, march music).
- **Tone**: comic stinger  ↔ straight reportage (no jokes, still fast) — not for disasters and deaths, where the jaunty grammar is wrong.
- **Material balance**: all-footage, or print-heavy when film is scarce (maps, pages, flip-books carry the motion).
- **Music**: Charleston band, march band, swing orchestra, or a period record carrying a whole section.
- **Packaging**: invent your own ident name and emblem; keep the grammar (searchlights, globe, fanfare, place cards), change the shapes.


## 坑

- Catalogue descriptions matter: a picnic film can contain both old-time dances and the Charleston; use only the shots that match the claim.
- Archive transfers start and end with archive slates, "End of Recording" and white flashes; cut inside them. Remove watermarks and archive logos.
- Newspaper pages hold unrelated, sometimes offensive stories next to yours: crop to the fold you need.
- Per-frame auto-levels make footage pump; use one level set per clip.
- `destination-in` irises leave transparent corners that later turn grey under `screen` — paint black behind with `destination-over`.
- Captions that fade before they can be read fail `readcheck`; shorten the words, not the hold.
- A fast announcer outruns Chinese subtitles: 6–12 English words per line, ≤ 23 Chinese characters.
- TTS mispronounces names (Bessie → "Bestie"); rephrase until the speech check passes.
- Old sources are soft: never exceed ~2.5× upscale; prefer wider framings to crops.
- Grain belongs to the mux; don't add it in the page as well.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L2_1920 年代新闻片.md`；Lemo-Opuscar 来源库，仓库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `../licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留通用媒介、材质、镜头、声音、native move、坑与变化规则；按本地 `references/styles/_template.md` 重新编排；移除旧条目头部与专属示范片段。
- 证据状态：来源文字方法完整转写；配套预览仅为静态图，不能证明连续运动、作者实现算法或本地可调用实现。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
