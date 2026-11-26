# 档案灯箱（archive-light-table）

> 一句话：Authenticated archive objects sit on a backlit table and are read through coordinated camera, light and annotation.
> 参照（只学语法）：References (grammar only): archive documentaries that push into still photographs; visual investigations that annotate real imagery (one line, one reading, one source per screen); product macro films (glass edges, transmitted light). Copy none of their layouts, typefaces, shots or music, and never name them in the film.

## 本质 / 不是什么

- **The objects are real**: scans of public-domain or licensed archive items, at their true proportions, with their real damage (broken corners, emulsion edges, folds, pencil marks). Nothing in them is drawn or generated.
- **Light comes from below**: the table glows a near-white cool grey; film and glass transmit it, paper glows warm at its edges, opaque things read darker than the table.
- **The loupe is the camera's door**: every dive into an object goes through a loupe that lands on it. The inside of the lens is where the object changes state.
- **Catalogue truth**: every object carries its real identifier, date and title from its holder; numbers on screen come from the record.
- **One signal colour** for marks, readings and anchors; everything else is the archive's own greys and paper tones.

**Sources and licences.** Useful collections include the Library of Congress, Smithsonian Open Access, the Rijksmuseum, NARA and Europeana; check each object’s catalogue record and rights statement. CC0, public domain and CC BY may be suitable when their terms are met. “No known restrictions”, CC BY-SA and other terms are not CC0; verify the selected item under Motion’s existing asset-authorization flow and record the source, license, catalogue ID, date and any derived figures in the project source record. For brand history, use scans and archive identifiers already provided or cleared for this project. Never present generated images as real archive objects; show required attribution in the film or end card.

Not Halftone Dossier (no newsprint dots, no aged-paper grade), not Satellite Briefing (objects on a table, not the ground from orbit), not Data Storytelling (no charts; the numbers live on the objects), not a keynote (no slides or header bars).

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适配主题 |
|---|---|---|
| The objects are real | scans of public-domain or licensed archive items, at their true proportions, with their real damage (broken corners, emulsion edges, folds, pencil marks). Nothing in them is drawn or generated. | 翻旧资料、档案阅读与历史证据。 |
| Light comes from below | the table glows a near-white cool grey; film and glass transmit it, paper glows warm at its edges, opaque things read darker than the table. | 翻旧资料、档案阅读与历史证据。 |
| The loupe is the camera's door | every dive into an object goes through a loupe that lands on it. The inside of the lens is where the object changes state. | 翻旧资料、档案阅读与历史证据。 |
| Catalogue truth | every object carries its real identifier, date and title from its holder; numbers on screen come from the record. | 翻旧资料、档案阅读与历史证据。 |
| One signal colour | for marks, readings and anchors; everything else is the archive's own greys and paper tones. | 翻旧资料、档案阅读与历史证据。 |
| One world, one camera | every object is a textured quad on the table with a centre, rotation and scale (texture px → world units at true size). The camera is a 2D centre, zoom and roll; the table and every mark go through the same world → screen function. | 翻旧资料、档案阅读与历史证据。 |
| The light table | an emissive surface (≈ 0.97 white, slightly cool), soft falloff, diffuser noise, an aluminium frame and a dark desk beyond. It can be switched off (ambient ≈ 0.04) and flicker on. | 翻旧资料、档案阅读与历史证据。 |
| Glass negatives | transmission from the scan's positive, `T = 0.035 + 0.9 · (1 − pos)^1.25`, with a warm silver-gelatin tint; the emulsion mask comes from the scan (white margin touching the border = no glass), so broken corners show the table. Dust and scratches are procedural, anchored to the table. | 翻旧资料、档案阅读与历史证据。 |

列出的是来源正文中的可复用媒介信号；不是固定元素清单。每支按主题选择 2–3 个，其中至少一个避开最常见组合。

## 这个风格最俗的版本

- 来源正文未给出一套固定的俗套画面、配色、配器或开场结尾组合，因此不补造。相邻风格边界与明确排除项保留在「本质 / 不是什么」。
- 每支片子按主题从来源信号中挑 2–3 项，并在 brief 的 style 栏说明保留或改动了什么；故事、数据、构图与时间线重新设计。

## 适配

- 用途：翻旧资料、档案阅读与历史证据。
- 内容：以当前项目真实素材和用户目标决定是否适配；只借用下方通用媒介规则。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

- `film.js`: `IT` (objects: centre, rotation, scale), `toW()` / `toT()` (texture ↔ world), `CAM` keys and `w2s()`, `dive()` (loupe point, land/lift times, lens interior as tracks), `shot(t)`, `int2s()` (photograph → screen for marks), the shader (`lightTable`, `paper`, `negative`, `parallax`, rim and skirt), the overlay (`annot`, `measure`, `compare`, `indexPanel`).
- `tools/prep.py`: emulsion masks from scans, difference matting of a subject against a smooth sky, ground-only cuts, push-pull fill.
- 通用方法举例（不取自示范片）： put one 35 mm slide (`IT.slide = {c, r, k, size}`), a loupe landing with `dive(toW(IT.slide, p), t0, t1, keysS, keysC)`, and light one line with `band()`.



## 材质与渲染

- **One world, one camera**: every object is a textured quad on the table with a centre, rotation and scale (texture px → world units at true size). The camera is a 2D centre, zoom and roll; the table and every mark go through the same world → screen function.
- **The light table**: an emissive surface (≈ 0.97 white, slightly cool), soft falloff, diffuser noise, an aluminium frame and a dark desk beyond. It can be switched off (ambient ≈ 0.04) and flicker on.
- **Glass negatives**: transmission from the scan's positive, `T = 0.035 + 0.9 · (1 − pos)^1.25`, with a warm silver-gelatin tint; the emulsion mask comes from the scan (white margin touching the border = no glass), so broken corners show the table. Dust and scratches are procedural, anchored to the table.
- **Paper**: backlit, its colour is transmission (paper tone × light); lit lines get darker ink and brighter paper; unlit text can dim to bring one line forward.
- **The loupe**: inside the lens each pixel maps back to the table through the magnification (≈ 2.5×) with a pincushion term (k ≈ 0.16 at the rim), slightly different per RGB channel for colour fringes. Around it: a black ring with a bevel highlight and a clear acrylic skirt that refracts the table and glows at its foot. Landing and lifting, it scales by about 1.35× and casts a soft shadow.
- **The photograph space**: after the push the lens stops being a lens. A photo gains depth from a ground-plane nearness map (zero at the horizon, linear in the row below it), cut-out layers for upright subjects and a filled background; a dolly and a lateral shift drive parallax, and a subject layer may drift. Things left on the ground plane lean: centre the dolly between them.
- **Sampling**: all texture reads inside the branching lens code use explicit gradients (`textureGrad`), otherwise quads that cross a branch pick a wrong mip level and leave dashed seams.
- **Marks** live on a 2D canvas above the picture: hairlines 1.5–3 px, rings, crop corners, underlines, leaders. Table marks are clipped out under the loupe; marks inside a photograph use its forward mapping, parallax included.
- **Post**: a light vignette and fine moving grain (heavier inside photographs). No film damage, no sepia, no halftone.

## 配色

- Neutral ground: the light table (near-white, cool) and the archive's own tones (silver greys, paper tans). Do not regrade the archive into a colour scheme.
- **One signal colour** (e.g. a signal orange) for marks, readings, anchors and the verdict; never as a fill behind pictures, never for decoration.
- Text is ink (near-black) on light areas and paper-white on dark caption plates; choose the contrast by the ground, never colour on colour.
- Positives inside the lens may be gently levelled (black and white points) so a weak scan reads; negatives stay as the glass gives them.

来源示范片中的配色示例（展示材料关系，不是此风格的固定色值；换项目须重推）： table #F7F9FB, ink #15171A, signal #FF5A1F, caption plates rgba(14,15,17,0.74).

## 字体

- **Roles**: a monospace for identifiers, dates and readings (e.g. IBM Plex Mono, 17–34 px; readings 74–120 px); a sans for labels in the film's language (e.g. Noto Sans SC or Inter, 21–36 px); a serif only for titles and the one name a photograph carries (60–76 px). OFL, self-hosted, CJK subset when needed.
- **Labels attach to objects**: an anchor dot and ring, a vertical leader, then the text. A reading sits in a dark caption plate with a small label above and the source (the catalogue number or the original wording) below.
- **Subtitles** are a caption strip at the bottom centre, on a dark plate with a 3 px signal-coloured edge. If the film is bilingual, the film's language goes on top. Hold ≥ max(1.8 s, speech + 0.6 s).
- **Quote the source when you can**: a crop of the actual line, or the record's wording in quotation marks, beats a paraphrase.

## 运动

- 24 fps on ones; every camera parameter on smooth monotone curves through keys (no overshoot, no stepping).
- The camera glides across the table, slows to let the loupe land, then pushes. Speed lives in the glides and pushes; holds are for reading.
- What never moves: the archive's own content outside a photograph space, and the table itself.

## 画面怎么活

- 阅读镜头由相机滑行和放大镜落下 / 抬起组织；放大镜约 0.4 秒快速 ease-out 落下并同样抬起，线条绘制 0.3–0.6 秒，文字从引线一侧擦入，数字与声音同步计数。纸面高亮只在检查某行时出现一次。
- 桌面与照片以外的档案内容固定。来源没有规定独立的待机微循环；不把尘点或纸面做成无因漂浮。

## 镜头语法

| Move | What it expresses | Can serve |
|---|---|---|
| table glide (pan and roll) | surveying; moving to the next piece of evidence | a timeline of documents; a product family; an album |
| loupe landing + push into the lens | choosing one object; "look closer" | the claim; the key photograph; a signature |
| inside the lens: tracking along a line | reading | a letter, a ledger line, a caption, a spec |
| photograph space: dolly + parallax | being there | the event itself; the founding moment; the place |
| rise out of the lens | stepping back, the evidence noted | a transition; a summary |
| pull back to the whole table | scale; everything at once | an index, a timeline, a closing |

Framing: at a reading moment the subject fills at least a third of the frame height; readings and labels stay clear of the subtitle strip (bottom 140 px). Transitions are made by the loupe (land, push, rise, lift) and the glide; no cuts, fades to black or page turns between objects.

## 声音调色板

- **Ambience**: the light table's ballast hum (100 Hz and harmonics), starter clicks, room tone. Inside a photograph the hum gives way to that place's air.
- **Foley**: the loupe on glass (a clack with a high ring), paper sweeps for glides and lit lines, ticks for scales and counters, a pen stroke for a verdict, soft clicks as labels land.
- **Music**: restrained and small: a felt piano, a few strings, glass or bowed metal for the moments of seeing. Build by subdivision and register, not by drums. Leave real silences before a reveal or a verdict; the first sound after them should be the loupe, the place or the verdict.
- **Voice**: a calm narrator, short sentences that state what the object says. Music about 10 dB under the voice, ducked while it speaks; −14 LUFS.

## 原生手法

- **Negative to positive under the loupe.** A develop front spreads from the lens centre with a thin warm edge, turning the glass negative into its positive only inside the lens. *Fits content like:* a founder's portrait plate; a factory on a lantern slide; an X-ray film becoming the product inside.
- **The line lights up.** On paper inside the lens one line of type brightens while the rest dims, an underline draws under it, and one word or number lifts out into a reading card. *Fits content like:* a ledger entry; a patent claim; the first order on an invoice.
- **Into the photograph.** The lens rim grows past the frame while the view inside widens; the photograph gains layered depth and a subject drifts. *Fits content like:* the first shop front; a launch day crowd; an expedition camp.
- **Measuring on the photograph.** A ruler laid on the ground plane in perspective, with ticks that crowd toward the horizon and a counter that lands on the recorded figure, marked as a schematic when it is one. *Fits content like:* a race distance; a bridge span; a building's height.
- **Two records, held side by side.** Two caption cards, each with a crop of its source, held still until both are read before one is struck. *Fits content like:* a misprinted date; two versions of a founding story; specification against delivery.
- **The table becomes the index.** Pull back to the whole table; each object's tag flies into one list with its identifier and its reading. *Fits content like:* a company timeline; a collection catalogue; a product family.

## 变化空间

The agent decides the objects, their order, the story, which native moves to spend and where, the camera path, the subject of the photograph space, and the signal colour.

- **Three structures**: a company's founding told as five objects in date order, each dive revealing one person; a single photograph explored in three dives (the place, the people, the date on the back); a before/after pair of plans and photographs of one building.
- **Three openings**: the table switching on in the dark; a loupe already on a plate, rising to reveal the table; a hand-written date on an envelope filling the frame.
- **Three endings**: the index of everything on the table; the last photograph held in depth with one line of text; the light table switching off, leaving one object glowing.

---


## 坑

- **Over-magnifying a weak scan**: keep the lens interior under about 1.5 screen px per scan px; choose items by scan size.
- **The loupe sweeping over empty table**: lay objects close together, land the loupe straight onto the object (drop in, don't slide in), and glide the camera over objects, not gaps.
- **Shear in the photograph space**: one depth map for a photo with people or machines in it tears them apart. Cut upright subjects into layers, fill behind them, and keep 2.5D moves small enough that the fill is barely seen.
- **Labels that scroll away**: a label on a moving table leaves the frame before it is read; hold the camera, or fix the caption on screen.
- **Vintage creep**: no sepia, no halftone, no paper-ageing overlay. The age is in the objects, not the grade.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L16_档案灯箱.md`；Lemo-Opuscar 来源库，仓库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `../licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留通用媒介、材质、镜头、声音、native move、坑与变化规则；按本地 `references/styles/_template.md` 重新编排；移除旧条目头部与专属示范片段。
- 证据状态：来源文字方法完整转写；配套预览仅为静态图，不能证明连续运动、作者实现算法或本地可调用实现。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
