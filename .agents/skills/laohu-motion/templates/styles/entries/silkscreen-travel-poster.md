# 丝印旅行海报（silkscreen-travel-poster）

> 一句话：Opaque screen-printed inks reveal a place poster one layer at a time, with registration and paper treated as part of the image.
> 参照（只学语法）：References (grammar only):

## 本质 / 不是什么

A poster being **printed on camera**. Every colour is an opaque ink laid by its own pull; later ink covers earlier ink completely. No halftone, no fluorescent ink, no line work: a shape's edge is where one flat ink stops. **Gradients are forbidden**: skies and haze are **stepped bands** (a flat colour, thinning stripes, the next colour).

What makes it read as silkscreen and not as flat vector art:
- **Registration**: every layer offset 1–3 px at 1080p; a knocked-out shape leaves a crescent of bare paper.
- **Overprint edge**: a faint multiply ghost ~2 u off under each ink, leaving a darker sliver where ink laps over ink.
- **Ink thickness**: a light rim top-left, a dark rim bottom-right, fills only; fresh ink has a wet sheen that fades within a second.
- **Paper**: cream stock with fibres; mottle and pinholes in paper colour, visible only on ink.

Not risograph (translucent fluorescent overprint with halftone grain), not ukiyo-e (key-block line work with bokashi), not woodcut (carved line), not low-poly (3D facets). This style is opaque, line-free, flat and banded.

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适配主题 |
|---|---|---|
| Registration | every layer offset 1–3 px at 1080p; a knocked-out shape leaves a crescent of bare paper. | 地点、路线、活动与系列海报。 |
| Overprint edge | a faint multiply ghost ~2 u off under each ink, leaving a darker sliver where ink laps over ink. | 地点、路线、活动与系列海报。 |
| Ink thickness | a light rim top-left, a dark rim bottom-right, fills only; fresh ink has a wet sheen that fades within a second. | 地点、路线、活动与系列海报。 |
| Paper | cream stock with fibres; mottle and pinholes in paper colour, visible only on ink. | 地点、路线、活动与系列海报。 |
| 每种颜色独立分版 | , filled in the current transform's units; knock-outs are holes in the path. Any shape can be printed. | 地点、路线、活动与系列海报。 |
| Pull reveal | a ragged squeegee front as a clip (a ~30 u drag tail); blade, bead and a sliver of handle ride on it. | 地点、路线、活动与系列海报。 |
| Ink bead | a round tube with lit half, dark underside, rolling glints and viscous strands; a split fountain puts several colours in one bead. | 地点、路线、活动与系列海报。 |
| Screen | a hinged frame with mesh, emulsion and tape; its shadow is a ring (even-odd), never a full rectangle. | 地点、路线、活动与系列海报。 |

列出的是来源正文中的可复用媒介信号；不是固定元素清单。每支按主题选择 2–3 个，其中至少一个避开最常见组合。

## 这个风格最俗的版本

- 来源正文未给出一套固定的俗套画面、配色、配器或开场结尾组合，因此不补造。相邻风格边界与明确排除项保留在「本质 / 不是什么」。
- 每支片子按主题从来源信号中挑 2–3 项，并在 brief 的 style 栏说明保留或改动了什么；故事、数据、构图与时间线重新设计。

## 适配

- 用途：地点、路线、活动与系列海报。
- 内容：以当前项目真实素材和用户目标决定是否适配；只借用下方通用媒介规则。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。



来源实现示意：

`demo/engine/silk.js` prints **any shape** in this style from a `Path2D`: `makeTextures`, `paperSheet`, `ink(ctx, {path, knock, paint}, {color, reg, clip, sheen, trap})`, `wipeRegion`/`wipeFront` (ragged pull), `squeegee` (blade, beads, split fountain), `screenFrame`, `inkFinish`, `bandSteps` (the gradient substitute), shape helpers. `demo/engine/poster.js` (template, banner, `pickInk` contrast), `demo/engine/scenes.js` (planes you can reorder or extend), `demo/film.js` (timeline and shots).

上述文件路径、接口名和效果能力只代表来源文档的声明，未在当前本地运行环境验证；生产接入须由 Motion 对照实际代码、依赖和消费者检查。



## 材质与渲染

- **One `Path2D` per ink layer**, filled in the current transform's units; knock-outs are holes in the path. Any shape can be printed.
- **Pull reveal**: a ragged squeegee front as a clip (a ~30 u drag tail); blade, bead and a sliver of handle ride on it.
- **Ink bead**: a round tube with lit half, dark underside, rolling glints and viscous strands; a split fountain puts several colours in one bead.
- **Screen**: a hinged frame with mesh, emulsion and tape; its shadow is a ring (even-odd), never a full rectangle.
- **Shapes**: ridges with a jagged lit facet, pines as one outline of drooping tiers, water as a flat body with glint bars. Hard edges everywhere.
- **Poster template** (1000×1500 u): paper border, art area, a dark **info band** at the foot holding a name, a number, a rule and a row of stats; columns sized by content.
- **Texture budget**: fine paper tile, mottle multiply ~55 %, pinholes ~75 %, light encode grain. More reads as risograph.

## 配色

- **One palette per poster, ≤ 6 inks**, assigned by role: light sky, deep sky / bands, far, mid, near (darkest; also the info band), and **one bright accent** (sun, route, highlights, key number). An optional lit-face ink.
- **Values step from far (light) to near (dark)**; depth is value, never blur.
- **The accent is rare**: the sun or light source, the one route or product, the most important number.
- **Paper is a colour**: an unprinted area is the brightest thing on the sheet (water, snow, a beam of light).
- **A series = one template, a new palette per item** (time of day, season, colourway, neighbourhood). Re-inking the same geometry in another palette is a statement.
- **Text inks are chosen by contrast** against the ink underneath (WCAG), never by a fixed key; a night palette must not swallow a header.
- Examples (sky1 → near, accent): dawn `#F6CD98 #EE9A73 #9A7FA8 #3E7079 #1E3B3F #FBE6B4`; harbour noon `#E8F0F2 #7FB3C8 #D9C7A3 #2F6E8E #173247 #E8553D`; winter `#EEF1F4 #B8C9D9 #8B9BB0 #4A5D78 #1F2A3C #F2B134`.

## 字体

- **Condensed display** for names and values (e.g. Big Shoulders Display, League Gothic), auto-fit; a geometric sans for letter-spaced labels (e.g. Outfit 600).
- Headers are **printed into the sky**, tracked out; the info band is printed last.
- **The poster text is the subtitle.** No narration is needed; if there is a voice, subtitles are a printed strip (a band pull), never a floating caption.
- **Reading rule**: each text stays ≥ chars/12 + 1 s (min 1.5 s) after its **last** item lands, and ≥ max(1.8 s, speech + 0.6 s) with a voice. Compute it from the content, round up to the beat.
- On a wall shot, labels stay ≥ ~18 px and values ≥ ~30 px at 1080p; close-ups on a band keep the whole band in frame with ≥ 5 % side margins.

## 运动

- **Pulls are linear and steady** (a squeegee does not ease). Accent inks start half a beat after the main ink of their layer.
- **Info items** print left to right on subdivisions of the beat. **There is no fade anywhere.**
- **Screen lift**: the frame hinges up (vertical squash + growing shadow) in ~0.4 s.
- **Palette re-ink**: a wide squeegee travels diagonally over the sheet in ~0.35 s; geometry identical on both sides of the blade, only the inks change. Show only the blade, bead and a sliver of handle.
- **Loose layers**: in a multi-plane move, planes parallax by depth with paper gaps and thickness shadows, then **snap into register** on one hit.

## 画面怎么活

- 完成印刷后的纸面和墨层保持稳定；刮板、网框、墨珠只在一次套印动作中移动。
- 多层画面只有在设计了层间位移时才产生视差，随后按来源在一个拍点套准；来源没有规定持续的待机微循环。

运动与循环描述来自来源文字 / 实现说明；本地尚未独立逐帧复现或核验，不作为本地渲染验证。

## 镜头语法

A vocabulary, not a route. Opening and ending come from the topic.

| Move | Expresses | Can serve |
|---|---|---|
| Truck with the squeegee, slight roll, frame edge in view | the act of printing; colour arriving | a hook; a split-fountain sky |
| Locked top-down full sheet | layers stacking into a picture | watching a poster build; a comparison |
| Fast pull-back as the screen lifts | the reveal of a finished layer | a scene complete; a title |
| Push + tilt to the info band | reading | facts; a date; a price |
| Truck through a foreground silhouette (tree, lamp post, sail) in screen space | passing into the next poster | poster-to-poster transitions |
| Crane through loose planes (multi-plane parallax) | depth, a journey inside the print | a route; a climb; a street |
| Slow lateral dolly along a row of prints | a set, a range | a series wall; colourways |
| Push into the mesh until the weave shows | the craft, the grain of the medium | an intimate beat; a detail |
| Log-zoom pull-back to the wall or window | the poster in the world | a final lockup (hold ≥ 3 s) |

Close-ups on a sheet keep its edge in frame; a squeegee across a close-up is tilted with the handle hidden, so it doesn't split the frame. Layers change by squeegee, posters through foreground silhouettes or a table move. No dissolves, no bare cuts.

## 声音调色板

- **Acoustic, hand-played instruments**: strummed guitar, slide guitar, harmonica, upright bass, cajon or brushes, banjo, fiddle, accordion, harmonium, ukulele. Choose the family from the place: folk, surf, bossa or brass band all fit.
- **One pull, one hit**: each ink lands on a musical event (a strum, a hit, a chord change); accelerate by subdividing, not by changing tempo. A registration snap is a loud downbeat.
- **Foley by material**: squeegee on mesh (band-passed noise with a ~220–280 Hz mesh grain; faster = brighter), wet ink squelch, screen clack and hinge creak, paper stamps, ticks for dashed routes, paper hiss, a wood-and-metal clamp, drying-rack clips.
- **Ambience from inside the print**: a finished scene may "wake up" (surf, street, crowd), J-cut in and L-cut out. Room tone under the table.
- **Silence as a tool**: the music drops out for a beat before the key facts; what remains is one ambience, and the first sound after is a decisive gesture (a clamp, a long slide up).
- Music ducks a few dB under foley. −14 LUFS.

## 原生手法

Each serves information order. A menu: use the ones your film needs.

- **One ink, one beat.** Facts print last, when they are read. *Fits content like:* museum hours; a ferry timetable; tasting notes.
- **Split fountain.** Several inks in one pull fill the frame with colour. *Fits content like:* a festival's night sky; a sunset beach bar; a rainbow of colourways.
- **Palette re-ink.** Same poster, another palette = time passing, a season, a variant. *Fits content like:* summer vs winter hours; three jacket colourways; day and night at a market.
- **Registration slip → snap.** Loose layers clamp into register with one hit, before the key facts. *Fits content like:* the date of a race; a launch price; a ticket sale opening.
- **Paper as a colour.** The unprinted sheet is the brightest element. *Fits content like:* a ski slope; a lighthouse beam; fresh snow on a roof.
- **The route as a printed layer.** A dashed accent line stamped segment by segment. *Fits content like:* a bus line; a marathon course; a delivery path.
- **The series wall.** Every print ends up hung together as the final lockup. *Fits content like:* a city's four districts; a band's tour dates; a product family.

## 变化空间

You decide the subject, the scenes and their planes, the palettes within the colour logic, the number of posters, the camera path, the opening, the ending, the instrument family and the length. Use cases are **grammar for the order and duration of information**; build your own timeline from the user's facts.

| Use case | Information order (print order) | Hold per layer | Length |
|---|---|---|---|
| **Trail / attraction guide** | place → per item: scene → name → difficulty → distance → time → footer | title ~3 s; name ≥ chars/12 + 1 s; stat row ≥ 2.2–3 s after its last item | 30–40 s, 3 items |
| **Event / festival poster** | scene pulls → headline → date → venue → call to action | headline 2.5 s, date + venue 3 s, final 3 s | 15–20 s |
| **Destination series** | one template, a palette per place: name → one fact → series wall | 2.5 s per poster + 4 s wall | 20–30 s |
| **Product drop** | layers around a flat product silhouette → name → colourway ×3 (re-ink) → price / date | 1.8 s per colourway | 12–18 s |
| **Seasonal / hours notice** | one poster re-inked per season → season + hours | 2 s per swap | 10–15 s |

每支新片都从主题重新设计，不照搬来源示范片：

- Structures: **one poster, many runs** (re-inked for each of four nights, the line-up changing in the band); **a street walk** (one multi-plane truck down a street, each shop sign printed as we pass); **a misprint story** (registration drifts until the last pull lands true on the date).
- Openings: **the empty screen** (light through a blank mesh, a stencil being exposed); **the accent first** (a lone product in the bright ink on bare paper); **the finished wall at night**, then back to the table.
- Endings: **the drying rack** (prints clipped in a row, swaying); **the poster in use** (pasted on a bus shelter, rain starting); **the last pull is paper** (the squeegee runs dry, leaving a white silhouette).

Swapping `content.json` and rebuilding is a technical check that the engine re-flows, not a way to make a film.

---


## 坑

- Stroke edge effects draw internal lines on unioned paths → fills only (fill, then fill shifted inside a clip).
- A full-rectangle screen shadow muddies the print → ring shadow.
- Cool shadow facets next to water read as water → shadows in the near ink.
- Jagged ink beads read as paper edges → a round bead.
- Parallax alone reads as "the mountains are moving" → paper gaps and thickness while loose, snapped to zero with a sound.
- Silhouette wipes hold a dark blank → centre on the switch so full cover lasts ~1 frame.
- Very wide banners are slivers in 16:9 → about 4:1.
- Random coloured dots on the table read as confetti → a real workbench (planks, grain, muted stains, tape).
- Too many items at honest reading times overrun the length → print items side by side in the same pulls, or let secondary ones be read on the final wall.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L32_丝印旅行海报.md`；Lemo-Opuscar 来源库，仓库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `../licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留通用媒介、材质、镜头、声音、native move、坑与变化规则；按本地 `references/styles/_template.md` 重新编排；移除旧条目头部与专属示范片段。
- 证据状态：来源文字方法完整转写；配套预览仅为静态图，不能证明连续运动、作者实现算法或本地可调用实现。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
