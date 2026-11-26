# 卫星地图简报（satellite-briefing）

> 一句话：Georeferenced imagery and coordinate-aligned marks carry a measured investigation from regional scale to a specific place.
> 参照（只学语法）：References (grammar only): open-source investigation films that annotate satellite pictures (thin lines on imagery, one claim per screen, measuring as the plot); the Eameses' *Powers of Ten* (one continuous change of scale with a readout); NASA Earth Observatory's *World of Change* (one place, time running). Copy none of their layouts, typefaces, icons or music; never name them in the film.

## 本质 / 不是什么

- **The ground is a photograph**: real, licence-clean, georeferenced satellite or aerial imagery of the actual place. Nothing on the ground is drawn, stylised or generated.
- **Two layers, two truths**: the imagery is what the satellite saw; the hairlines are what the analyst measured. Marks are thin, white, sparse, and sit on real coordinates.
- **The grade moves with the story**: orbit in true colour, the analysis layer in grey, colour back only where the story turns.
- **Scale is the camera**: one zoom from orbit to the ground built from nested plates, with an altitude readout and a scale bar from the same camera.
- **One finding per screen**, in the single accent colour.

Not Data Storytelling (a chart on paper), not Sci-fi Hologram HUD (no glowing wireframes or invented chrome), not Blueprint, not Isometric Infographic (real nadir or oblique views, no diorama), not a keynote (no slides, header bars or chapter numbers).

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适配主题 |
|---|---|---|
| The ground is a photograph | real, licence-clean, georeferenced satellite or aerial imagery of the actual place. Nothing on the ground is drawn, stylised or generated. | 地点、范围、环境变化与地理调查。 |
| Two layers, two truths | the imagery is what the satellite saw; the hairlines are what the analyst measured. Marks are thin, white, sparse, and sit on real coordinates. | 地点、范围、环境变化与地理调查。 |
| The grade moves with the story | orbit in true colour, the analysis layer in grey, colour back only where the story turns. | 地点、范围、环境变化与地理调查。 |
| Scale is the camera | one zoom from orbit to the ground built from nested plates, with an altitude readout and a scale bar from the same camera. | 地点、范围、环境变化与地理调查。 |
| One finding per screen | , in the single accent colour. | 地点、范围、环境变化与地理调查。 |
| Plates | georeferenced rasters with a lon/lat box, sampled in a shader where the camera ray hits the ground, nested by resolution (world → region → detail) with feathered edges so finer plates dissolve in as the camera descends. | 地点、范围、环境变化与地理调查。 |
| Globe | ray–sphere from a perspective camera, a thin atmosphere rim, limb shading at orbit only; compute \|C\|² − R² in double precision (float32 fails below a few tens of km). | 地点、范围、环境变化与地理调查。 |
| Time | dated plates share one grid. A soft scan front (a satellite pass, never a hairline) swaps them: north → south forward, south → north for a rewind. Growth can run outward from the old edge, ordered by a distance map. | 地点、范围、环境变化与地理调查。 |

列出的是来源正文中的可复用媒介信号；不是固定元素清单。每支按主题选择 2–3 个，其中至少一个避开最常见组合。

## 这个风格最俗的版本

- 来源正文未给出一套固定的俗套画面、配色、配器或开场结尾组合，因此不补造。相邻风格边界与明确排除项保留在「本质 / 不是什么」。
- 每支片子按主题从来源信号中挑 2–3 项，并在 brief 的 style 栏说明保留或改动了什么；故事、数据、构图与时间线重新设计。

## 适配

- 用途：地点、范围、环境变化与地理调查。
- 内容：以当前项目真实素材和用户目标决定是否适配；只借用下方通用媒介规则。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

- `engine.js`: `makeCamera({lat, lon, d, tilt, heading, sx, sy})`, `project()` / `unproject()`, the WebGL2 plate shader (nested plates, time scans, growth map, analyst grade, printed-map layer, whip blur).
- `overlay.js`: hairlines, brackets, `readout`, the measured single-line `subtitle` strip, `text` with a registry for `window.TEXTS`.
- `tools/`: `fetch_landsat.py` (STAC, one date per path, same-year gap fill), `plates.py` (normalisation, streak cleaning, water masks, areas), `vectors.py` (shorelines, distances), `mapfield.py` (the printed map), `growth.py`.



## 材质与渲染

- **Plates**: georeferenced rasters with a lon/lat box, sampled in a shader where the camera ray hits the ground, nested by resolution (world → region → detail) with feathered edges so finer plates dissolve in as the camera descends.
- **Globe**: ray–sphere from a perspective camera, a thin atmosphere rim, limb shading at orbit only; compute |C|² − R² in double precision (float32 fails below a few tens of km).
- **Time**: dated plates share one grid. A soft scan front (a satellite pass, never a hairline) swaps them: north → south forward, south → north for a rewind. Growth can run outward from the old edge, ordered by a distance map.
- **The analyst's grade** (one uniform from colour to grey): luminance with local contrast and clarity, a shoulder so salt, snow and cloud stay below white, toned blue-black → cool silver up to ~65 % grey, a fifth of the chroma. White belongs to the marks.
- **Marks**: a 2D overlay through the same world → screen function: hairlines 1.2–2.6 px with a dark halo, dashes for history and claims, brackets, ticks, leader lines. Lines draw on; outlines print behind the scan.
- **Screen space only for instruments** (altitude, scale bar, imagery credit) and the transcript strip. Everything else is anchored to the ground.
- **The claim layer** is a printed map drawn in the shader from a distance field of the old outline: paper grain a few pixels wide at any zoom, halftone ink, coast and waterlines, graticule, the serif name.
- **Post**: light grain in ffmpeg, a vignette, directional blur only on whip pans.

## 配色

- Neutral ground: grey, roughly 3–65 % in value. White means *measured*.
- One accent (warm, e.g. amber) for the single reading on screen, never decoration.
- A second hue may mark the **claim** the imagery tests (a map, a plan, a promise): flat, cartographic, never used for anything measured.
- True colour is evidence: at orbit, and again only where the story turns (the field that greened, the water that returned).
- No false-colour ramps over the imagery.

来源示范片中的配色示例（展示材料关系，不是此风格的固定色值；换项目须重推）： ground #070B0E → #A1A7A9, marks #F2F5F6, reading #FFBE55, map blue rgb(46, 112, 206).

## 字体

- **Roles**: a light condensed grotesk for the reading (96–130 px, e.g. Barlow Condensed); a monospace for instruments and dates (20–34 px, e.g. IBM Plex Mono); a sans for labels in the film's language (24–42 px); a serif only for the claim layer and the title. OFL, self-hosted, CJK subset to the characters used.
- **Labels attach to the ground** with a leader line. The reading sits in the right third beside what it measures, label above, source note below ("Landsat, measured").
- **Subtitles are a transcript strip** at the bottom left: a 2 px white rule, a dark plate fading right, left-aligned, each line on one line (measure with the real font, `nowrap`; split a long sentence into two cues). If the film is bilingual, the film's language on top.
- Nothing below 20 px at 1080p, the imagery credit included.
- Hold subtitles ≥ max(1.8 s, speech + 0.6 s); a rolling counter reports its landing value; labels stay ≥ characters ÷ 4.5 + 1.5 s (CJK).

## 运动

- The camera never stops: distance interpolates in log space and segments ease.
- Marks arrive by being made: a line grows, an outline prints behind the scan, a counter rolls and lands with a small pop, a reticle snaps with overshoot.
- Time changes are scans, never dissolves; their spacing tells the speed, and the camera moves with them (accelerating as the steps shorten, braking on the last).
- Never moves: the ground under its annotations, the instrument positions.

## 画面怎么活

- 停留段保留来源给出的约 2–5% 缓慢位移或轻转；扫描、时间切片、计数与标记只随对应事实更新。
- 地面影像和仪器位置保持锚定，不做漂移或噪声位移；来源未规定其它背景微循环。

## 镜头语法

| Move | What it expresses | Can serve |
|---|---|---|
| Oblique orbit, limb in frame | scale, context, distance | an opening; a return; a title card |
| Dive (log zoom, tilt to nadir) | going to look for yourself | a reveal; checking a claim |
| Locked nadir frame, slow creep | evidence, comparison | time running in one place; a measurement |
| Push-in on a point | singling out | one town, one dam, one field |
| Track along a line | travelling a distance | measuring; a river, a road, a border |
| Whip pan with blur | a new subject at the same altitude | the counter-example; "meanwhile" |
| Climb back to orbit | consequence, perspective | an ending; a summary |

At key moments the subject fills a third of the frame height; reading right, subtitles bottom left, instruments in the corners. Transitions: scan-line swaps, a map layer switched off, zooming through plates, whip pans, the reticle opening into a title card. No crossfades between unrelated places, no hard cuts inside a zoom.

## 声音调色板

- **Telemetry**: FM pings (a lock-on ping worth bringing back), dry ticks on the grid that divide to accelerate, noise scans (rising for a rewind, falling forward), servo whines, a ratchet for a range line.
- **Weight**: timpani, bass drum, gran cassa, bowed cymbal, a tam-tam reversed when time runs backwards. Measurements land on a pitched hit.
- **Synthesis**: a pulse bass with audible 2nd and 3rd harmonics, detuned-saw pads under a low-pass, risers for dives.
- **Beds**: orbit hum, radio hiss, data chatter; the place's own ambience (wind, water, a far horn), sparingly, often as J- or L-cuts.
- **One option for the shape**: keep the palette dry (electronics, skins, metal) and let one wet timbre (glass, water, bowed metal) mark the turn.
- **Silence**: music and foley stop, a thin bed stays, impacts may decay into it; the first sound after it is the turn. A short suck-out (0.2–0.45 s, music and foley down ~25 dB) before the heaviest impacts makes them land.
- **Mix**: voice ~10 dB over music; the two or three designed impacts are the loudest moments (out of the bus compressor, with mid-range body, e.g. a low-brass stab); 20–60 Hz about 15 dB under the full band (high-pass ~40 Hz, impact weight at 60–120 Hz); −14 LUFS, true peak ≤ −1.2 dB. Voice: a calm analyst, short declarative lines.

## 原生手法

- **The map against the photograph.** The camera falls into the printed map of the claim; a scanner bar tears it away and the ground is underneath; the name outlives the page. *Fits content like:* a lake still on maps but gone; a cleared concession forest; a planned city never built.
- **Time rings in a locked frame.** Dated plates scan in one by one; each leaves its outline, the band lost between two rings flashes. *Fits content like:* a glacier's retreat; a city's sprawl; a fire scar season after season.
- **The range line.** Mark the destination, grow a ticked line from A to B, chase the tip while the reading counts up, land on the number, pull back to show the whole distance. *Fits content like:* how far a shore moved; a village to its well; a camp to the border.
- **The dive and the climb.** One zoom from orbit to the ground, or back. *Fits content like:* locating anything; a scale reveal; an ending that returns one place to the planet.
- **Colour returns where the story turns.** Only the subject regains true colour inside the grey. *Fits content like:* an irrigated field; a refilled reservoir; a regrown forest.
- **The reticle becomes the frame**: the lock-on brackets open out to frame a title card or the last reading.

## 变化空间

The agent decides the place or places, whether there is a claim layer, which dates, the structure, the camera path, the accent hue and where colour comes back.

- **Structures**: a locked time-lapse of one place ending in a push-in; a river followed from source to mouth with a reading at each stop; two places compared at one scale with whip pans.
- **Openings**: a ground-level detail that climbs to reveal its scale; a black frame a scan line paints in; an oblique orbit with a searching reticle.
- **Endings**: the climb back to orbit; a last measurement that lands and holds in silence; the claim layer redrawn to match the ground.

---


## 坑

- **素材与许可**：只用真实、可定位的卫星或航空影像，不以生成图像冒充真实证据。来源正文列举的公共领域/可署名示例包括 USGS Landsat、USGS NAIP、NASA Blue Marble、MODIS 与 VIIRS；Copernicus/EOX Sentinel 等按具体年份、数据产品许可和修改数据署名要求核对。CC0、公共领域、CC BY、ODbL、CC BY-SA、NC 与 “no known restrictions” 的条件不同；逐项按 Motion 现有素材授权与来源记录流程核验，画面或片尾按要求署名。
- **场景与事实**：选用影像须与画面标注的地点和日期对应；保留 scene ID、日期、范围、分辨率及拼接来源，使每个测量能回到对应场景。ODbL、CC BY-SA 与 “no known restrictions” 不等同 CC0，按 Motion 现有素材授权流程核验。针对具体地点，只使用本片已获得授权的测绘或 GIS 数据；缺失区域保持为数据缺口，不能用生成影像冒充证据。
- **Seams**: paths imaged on other days disagree. One date per path, each scene gain-matched on stable land, feathered overlaps, holes filled from the same year only.
- **Old sensors**: Landsat MSS (to 1992) has no blue or SWIR and drops scan lines: nearest-neighbour resampling, near-zero rows as nodata filled from same-year scenes, scan-angle streaks cleaned on land only. Inspect every year at full contrast.
- **Plumes and haze** cross water as bright diagonal bands: swap the scene for another date of the same year rather than painting it out.
- **Edges**: resampling against nodata darkens scene rims (erode the mask); drop contour pieces along a plate border. Real straight edges (dikes, polders) can read as seams: frame them out or label them.
- **Grey mush at close range**: raise local contrast for that altitude only and dim outside the measured corridor.
- **Water and cloud**: MNDWI where shortwave infrared exists, only the basin you measure; clouds read as features in grey, so use the dry season.
- **事实记录**：把主张、来源 URL、原文依据或测量方法，以及 scene ID 和日期，写入 Motion 项目现有事实来源记录并随项目交接。测量应对应画面展示的日期。

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L9_卫星地图简报.md`；Lemo-Opuscar 来源库，仓库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `../licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留通用媒介、材质、镜头、声音、native move、坑与变化规则；按本地 `references/styles/_template.md` 重新编排；移除旧条目头部与专属示范片段。
- 证据状态：来源文字方法完整转写；配套预览仅为静态图，不能证明连续运动、作者实现算法或本地可调用实现。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
