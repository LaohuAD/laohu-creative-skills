# 显微镜故事（microscope-story）

> 一句话：A calibrated camera move through real sample imagery connects magnification changes to measurable scale.
> 参照（只学语法）：References (grammar only): Charles and Ray Eames' *Powers of Ten* (one continuous change of scale with a readout riding along); premium microscope launch films (dark bench, glass catching light, restrained marks, clean instrument sound); digital-pathology viewers' instruments (scale bar, field of view, magnification). Copy none of their layouts, interfaces, typefaces or music; never name them in the film.

## 本质 / 不是什么

- **The specimen is a photograph**: a real micrograph or whole-slide scan of the actual sample, CC0, public domain or CC BY. Nothing on the specimen is drawn, retouched or generated. A whole-slide image (WSI) is the ideal source: one sample, one registered pyramid from millimetres to microns, with the pixel size in its metadata.
- **Scale is the camera**: one log-space dive (and, when the story wants it, the climb back) through nested plates of the same sample. The scale bar shortens and jumps in a 1-2-5 sequence, the field-of-view readout rolls, the magnification steps.
- **Focus has a grammar**: a rack-in from soft at the start, a short breath (blur + a hint of field change) each time the magnification changes, a focal-plane sweep across the frame when the camera lands.
- **Readings are measured**: every number is computed from the file (pixel size × pixels) and the screen says how it was measured. Describe what was measured; never diagnose. Keep the claim, source, quoted wording or measurement method in Motion’s existing project fact/source record.
- **One reading per screen**, in the single accent colour.

Not Satellite Briefing (no grey grade; the stain keeps its colour), not Sci-fi HUD (no glowing wireframes or crosshairs), not Data Storytelling (no chart paper), not a keynote (no slides or header bars).

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适配主题 |
|---|---|---|
| The specimen is a photograph | a real micrograph or whole-slide scan of the actual sample, CC0, public domain or CC BY. Nothing on the specimen is drawn, retouched or generated. A whole-slide image (WSI) is the ideal source: one sample, one registered pyramid from millimetres to microns, with the pixel size in its metadata. | 显微、组织与感知主题；只陈述可测观察。 |
| Scale is the camera | one log-space dive (and, when the story wants it, the climb back) through nested plates of the same sample. The scale bar shortens and jumps in a 1-2-5 sequence, the field-of-view readout rolls, the magnification steps. | 显微、组织与感知主题；只陈述可测观察。 |
| Focus has a grammar | a rack-in from soft at the start, a short breath (blur + a hint of field change) each time the magnification changes, a focal-plane sweep across the frame when the camera lands. | 显微、组织与感知主题；只陈述可测观察。 |
| Readings are measured | every number is computed from the file (pixel size × pixels) and the screen says how it was measured. Describe what was measured; never diagnose. Keep the claim, source, quoted wording or measurement method in Motion’s existing project fact/source record. | 显微、组织与感知主题；只陈述可测观察。 |
| One reading per screen | , in the single accent colour. | 显微、组织与感知主题；只陈述可测观察。 |
| Plates | the WSI pyramid levels as plates in one world frame (level-0 pixels), the coarse levels whole and alpha-feathered at the scan edge, the fine levels as crops around where the camera lands. Each frame draws the finest plate that is downsampled no more than ~1.45×, and blends the next level in between 2.2× and…（完整条件见下方来源转写章节） | 显微、组织与感知主题；只陈述可测观察。 |
| The naked-eye plate | the scanner's own photo of the whole slide (many WSI files carry one), registered through the scan's area-of-interest metadata and checked against the tissue's centroid. Cut the glass out of the scanner tray, remove the line-sensor streaks, and fill any manufacturer's printed logo with the surrounding frost…（完整条件见下方来源转写章节） | 显微、组织与感知主题；只陈述可测观察。 |
| One grade for every plate | glass normalised to a warm white, a little density and chroma in the stain, nothing else. No false colour, no film emulation. | 显微、组织与感知主题；只陈述可测观察。 |

列出的是来源正文中的可复用媒介信号；不是固定元素清单。每支按主题选择 2–3 个，其中至少一个避开最常见组合。

## 这个风格最俗的版本

- 来源正文未给出一套固定的俗套画面、配色、配器或开场结尾组合，因此不补造。相邻风格边界与明确排除项保留在「本质 / 不是什么」。
- 每支片子按主题从来源信号中挑 2–3 项，并在 brief 的 style 栏说明保留或改动了什么；故事、数据、构图与时间线重新设计。

## 适配

- 用途：显微、组织与感知主题；只陈述可测观察。
- 内容：以当前项目真实素材和用户目标决定是否适配；只借用下方通用媒介规则。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

- `film.js`: log-spiral camera (`camAt`), plate selection by downsampling ratio and coverage, objective events from real level changes, focus, frosted `panel()`, marks, readings, `TEXTS` / `SUBCHECK` / `EV`.
- `tools/plates.py`: slide-photo registration and cleaning, graded plates, collagen mask and the scan's cumulative curve, the tissue axis. `nucleus.py`: membrane edge on 72 rays, least-squares circle.
- 通用方法举例（不取自示范片）： a coated steel sample: one SEM pyramid, a dive to one crack, a circle counting coverage, a ring around one grain.



## 材质与渲染

- **Plates**: the WSI pyramid levels as plates in one world frame (level-0 pixels), the coarse levels whole and alpha-feathered at the scan edge, the fine levels as crops around where the camera lands. Each frame draws the finest plate that is downsampled no more than ~1.45×, and blends the next level in between 2.2× and 1.45×: no seams and no visible upsampling, because every level is the same sample, already registered.
- **The naked-eye plate**: the scanner's own photo of the whole slide (many WSI files carry one), registered through the scan's area-of-interest metadata and checked against the tissue's centroid. Cut the glass out of the scanner tray, remove the line-sensor streaks, and fill any manufacturer's printed logo with the surrounding frosted glass. Below ~30 mm of field the photo would be upsampled: let the cover glass become clean glass (its dust leaves the focal plane).
- **One grade for every plate**: glass normalised to a warm white, a little density and chroma in the stain, nothing else. No false colour, no film emulation.
- **The bench**: graphite under a slow pool of light; a soft shadow under the slide.
- **Focus**: screen-space Gaussian blur on a frame rendered with a margin (so edges never go dark); the focal sweep is a tilted sharp front crossing a softened frame. A light illumination vignette, nothing more.
- **Marks** in screen space but anchored to the specimen through one world → screen function: hairlines 1.5–2.5 px with a dark or light halo, circles drawn on as arcs with cardinal ticks, dimension lines with end ticks, leader lines with one elbow. Counted pixels are shown as a mask revealed behind a scan front, then kept as a faint trace.
- **Frosted panels** (dark translucent glass over a blurred copy of the frame) for readings, instruments, subtitles and the credit: white type reads on glass and stain alike, nothing switches colour mid-shot.

## 配色

- Glass: warm paper white. Bench: graphite. The stain is evidence and keeps its true colour (e.g. trichrome red and blue, H&E pink and purple).
- One accent, cool and away from the stain's hues (mint against red and blue; amber against a green or purple stain), only for the measured reading and the counted pixels.
- Ink on glass is near-black; type on stain sits on a frosted panel in warm white.

来源示范片中的配色示例（展示材料关系，不是此风格的固定色值；换项目须重推）： glass #F4F1EC, bench #0B0D0F → #2A3036, ink #181B1F, panel rgba(12,14,17,0.74), accent mint rgb(120,240,205) (on stain) / rgb(0,122,99) (on glass).

## 字体

- **Roles**: a light condensed grotesk for readings and the scale bar (40–72 px, e.g. Barlow Condensed); a monospace for instruments and pixel counts (20 px, e.g. IBM Plex Mono); a sans in the film's language for labels (20–34 px, e.g. Noto Sans SC); a serif only for the title. OFL, self-hosted, CJK subset.
- **Instruments** live in one frosted panel in a corner: scale bar with its value, field of view, magnification with a small nosepiece glyph that turns a quarter on every change. The source credit in a small panel in the opposite corner.
- **Readings** sit in a frosted panel beside what they measure, joined by a leader: a small label above ("collagen share of tissue area"), the number large in the accent, the method or the raw counts below.
- **Subtitles**: a frosted strip at the bottom; if the film is bilingual, one line per language with the film's language on top, never wrapped. Measure each line with the real font and split long lines into two cues.
- Nothing below 20 px at 1080p. Hold labels ≥ characters ÷ 4.5 + 1.5 s (CJK); a reading that rolls is reported by its landing value.

## 运动

- The camera is a similarity transform (zoom, roll, position) interpolated as a log spiral between keys (`M^u` about the fixed point of the two frames), so every push is a true dive towards one point and the roll is part of it. Ease the moves; never a frozen frame longer than a second.
- Magnification changes happen where the plates actually change, each with a breath of focus, a turret click and the new magnification said once, large.
- Marks arrive by being made: a dimension line grows from its centre, a circle is drawn as an arc, a scan front counts pixels while the reading rolls, the reading lands with a small spring.
- Never moves: the specimen under its marks, the instrument positions.

## 画面怎么活

- 停留镜头按来源保留 2–5% 缓慢 creep；只在倍率变化处给焦点一口气息和转盘点击。
- 标注逐项画入后停在测量值；样本与仪器锚点不动。来源没有规定样本或背景的额外循环。

## 镜头语法

| Move | What it expresses | Can serve |
|---|---|---|
| The dive (log zoom with roll) | going to look for yourself | an opening; from the slide to the cell |
| Locked frame, slow creep | evidence, a measurement | a reading; a comparison |
| Truck at one magnification | a second sample of the same thing | the counter-example; "meanwhile, nearby" |
| Pull back to frame two marks | comparison | the verdict |
| Focal-plane sweep | arriving; depth | a landing; a reveal inside one frame |
| The climb (reverse dive, scale bar jumping back) | consequence, scale | an ending; a return to the eye's scale |

At key moments the measured structure fills a third of the frame height or more; instruments in a corner, subtitles bottom centre, readings beside their marks. Transitions are scale changes, trucks and focus, never cuts or crossfades between samples.

## 声音调色板

- **Instrument foley**: the objective turret (a click, a detent, a small metal ring), a focus servo, pen on glass for each line drawn, a band-passed scan travelling left to right with counter ticks that speed up, a soft filtered sweep for the focal plane.
- **Music**: hard-mallet vibraphone in 8ths and 16ths, marimba ticks, bowed vibraphone and water glasses for pads and the motif, glockenspiel for each reading that lands, a pulse bass with 2nd/3rd harmonics, timpani and bass drum under the landings. Harmony stays open and light; the score is the user's to shape.
- **Beds**: a quiet lab room (fan, a little mains hum).
- **Silence** before the verdict and before the climb; the first sound after it is the reading or the turn.
- **Mix**: voice ~10 dB over music, music ducked under it; −14 LUFS. Voice: a calm, exact narrator; numbers spelled out for the TTS, digits on screen.

## 原生手法

- **The dive.** From the slide in the hand to a cell in one camera, the turret clicking at each real change of level. *Fits content like:* a biopsy to its cells; a coated surface to its crystals; a hair or skin section to its layers.
- **Counting the colour.** Draw a circle, let a scan front cross it, light up every counted pixel and roll the share up to its landing value; show the raw counts underneath. *Fits content like:* collagen in tissue; porosity in a ceramic; coverage of a coating; pigment in a sample.
- **Two circles, one verdict.** Measure one place, truck to another at the same scale, then frame both and say what differs. *Fits content like:* treated against untreated; edge against centre; before against after.
- **The focal sweep and the ring.** Land, sweep the focal plane across the frame, ring one structure and give its size. *Fits content like:* a nucleus; a grain; a fibre's diameter.
- **The climb back.** Pull out to the eye's scale with the scale bar jumping backwards; a title card written on the glass.

## 变化空间

The agent decides the specimen, the stain or modality, what is counted, the camera path, the accent, the ending.

- **Structures**: a single dive ending in one measurement; a comparison of two regions or two samples at one scale; a climb that starts on a cell and reveals the object.
- **Openings**: the slide on the bench under moving light; a cell already in focus, the climb revealing what it belongs to; a blurred field racking into focus.
- **Endings**: the title written on the glass; a last reading held in silence; the slide lifted out of frame.

---


## 坑

- **Licences**: most microscopy online is CC BY-NC or all rights reserved. The source lists CC0 whole-slide scans (such as OpenSlide test data), public-domain government micrographs (NIH, CDC PHIL, NASA, USGS) and CC BY collections (Cell Image Library, Wellcome Collection) as examples; check each file’s and collection’s terms. CC BY-SA without the applicable agreement, NC images, journal figures and AI images are not cleared by default. Record each file, license and attribution through Motion’s existing project asset/source flow.
- **Specimen and scale**: use a real specimen image whose identity and pixel-size metadata can be verified against the scan. CC BY-SA, ODbL and “no known restrictions” are not CC0; check the selected file’s terms under Motion’s existing authorization flow. For product, laboratory or brand material, use only scans already provided or cleared for this project. Never substitute a generated image for a real specimen.
- **Different samples never zoom into each other**: two micrographs of "the same thing" at two scales are two specimens. Use one pyramid; if you must join sources, cut on a focus breath and say so.
- **Pixel size**: read it from the file (XMP `ScanRes`, TIFF resolution, OME `PhysicalSizeX`); a slide-photo's resolution tag can be trusted only after checking against the scan.
- **Upsampling** shows as mush beyond ~1.6×: end the dive at the scan's real resolution.
- **Tile seams**: some scanners overlap tiles; check the joint info, frame out visible seams.
- **Labels and logos** on the slide: barcodes and IDs are part of the object; manufacturer logos are not — fill or crop them.
- **Claims**: a stain's colour means what the stain protocol says, nothing more; measured shares are of the drawn region and the stated threshold, never a clinical score.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L15_显微镜故事.md`；Lemo-Opuscar 来源库，仓库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `../licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留通用媒介、材质、镜头、声音、native move、坑与变化规则；按本地 `references/styles/_template.md` 重新编排；移除旧条目头部与专属示范片段。
- 证据状态：来源文字方法完整转写；配套预览仅为静态图，不能证明连续运动、作者实现算法或本地可调用实现。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
