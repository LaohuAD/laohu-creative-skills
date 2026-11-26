# 爆炸图拆解（exploded-teardown）

> 一句话：Exact product geometry is separated and reassembled along measured axes, with labels attached to the real parts.
> 参照（只学语法）：References (grammar only): hardware-launch exploded films (layer stagger, orbit timing), repair-guide teardowns (opening order, the macro on the part that matters), engineering drawing (leaders, dimension lines). Never copy their products, layouts, typefaces or music, or name them in the film.

## 本质 / 不是什么

A frame reads as this style when:

- **the object is real and exact**: geometry, positions and counts come from the product's own files (STEP, KiCad, BOM, assembly guide). Nothing is eyeballed that a file can give;
- **it is shown apart**: layers float on one axis with even, readable gaps, each still oriented as it sits in the product;
- **it is photographed, not drawn**: physically based materials, a studio key light, a cool rim, an HDRI reflection, soft contact shadow on an invisible floor;
- **the numbers live on the object**: thin leader lines from a dot on the part, dimension lines with ticks drawn in the scene's own perspective, never a table beside it;
- **the camera never stops travelling**: one or a few continuous moves, orbit outside, macro inside.

It is not a glass product render (one object, material beauty, no disassembly), not a blueprint (line drawing on a grid, no light), not a keynote (slides, headline type, a stage), not an assembly manual (step numbers, arrows, hands).

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适配主题 |
|---|---|---|
| the object is real and exact | geometry, positions and counts come from the product's own files (STEP, KiCad, BOM, assembly guide). Nothing is eyeballed that a file can give; | 产品结构、维修、装配与内部原理。 |
| it is shown apart | layers float on one axis with even, readable gaps, each still oriented as it sits in the product; | 产品结构、维修、装配与内部原理。 |
| it is photographed, not drawn | physically based materials, a studio key light, a cool rim, an HDRI reflection, soft contact shadow on an invisible floor; | 产品结构、维修、装配与内部原理。 |
| the numbers live on the object | thin leader lines from a dot on the part, dimension lines with ticks drawn in the scene's own perspective, never a table beside it; | 产品结构、维修、装配与内部原理。 |
| the camera never stops travelling | one or a few continuous moves, orbit outside, macro inside. | 产品结构、维修、装配与内部原理。 |
| Boards are painted from their layout files | copper pours, every trace, via, pad and drill, silkscreen, on both sides, at 14–20 px per millimetre, with roughness, metalness and bump maps from the same drawing. Components stand at their footprint positions with their package sizes. | 产品结构、维修、装配与内部原理。 |
| Separation | smooth start, fast middle, long settle (ease-in-out cubed); layers leave top first, 0.15–0.2 s apart; repeated parts (keys, screws) fan out in a wave ordered by distance from a corner. | 产品结构、维修、装配与内部原理。 |
| Closing | bottom first, quicker (about 1 s per layer), the last layer lands with a real mechanical response (a key travels its stroke and returns; nothing bounces like rubber unless it is rubber). | 产品结构、维修、装配与内部原理。 |

列出的是来源正文中的可复用媒介信号；不是固定元素清单。每支按主题选择 2–3 个，其中至少一个避开最常见组合。

## 这个风格最俗的版本

- 来源正文未给出一套固定的俗套画面、配色、配器或开场结尾组合，因此不补造。相邻风格边界与明确排除项保留在「本质 / 不是什么」。
- 每支片子按主题从来源信号中挑 2–3 项，并在 brief 的 style 栏说明保留或改动了什么；故事、数据、构图与时间线重新设计。

## 适配

- 用途：产品结构、维修、装配与内部原理。
- 内容：以当前项目真实素材和用户目标决定是否适配；只借用下方通用媒介规则。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

All in `src/` (three.js r170, the library's `core/three/post.js` and `core/lib.js`):

- `parts.js`: `keycapGeometry(w, d, h)` (lofted shell with a spherical dish and a stem), `switchGeometries()`, `loft(rings)`, `shapeFrom(outline, holes, circles)` (KiCad outline to extrusion), `inset`, `hexSpacer`, `screwGeometry`.
- `pcbtex.js`: `paintPCB(data, side, outline, box, ppm)` paints colour, roughness/metalness and bump maps from extracted layout data.
- `comps.js`: `buildBackParts(data, group, y, materials)` places package bodies at footprint positions and returns anchors.
- `overlay.js`: anchored labels (`label`), perspective dimension lines (`dimension`), subtitles, title card, readcheck texts, subtitle width check.
- `main.js`: layers, explode and gap functions, the camera keys (orbit or eye/target, monotone), lights, `window.EV` for the mixer.
- `tools/extract_pcb.py`, `kicad_geom.py`, `sexp.py`: read any `.kicad_pcb` (outlines, tracks, zones, pads, silkscreen, footprints; plain Python). `tools/step2mesh.mjs`: STEP to mesh.


通用方法举例（不取自示范片）： read a plate file with `extract_pcb.py`, extrude `shapeFrom(outline, cutouts)` 1.5 mm as aluminium (`metalness: 1, roughness: .35`) and orbit it with three `CAM` keys.



## 材质与渲染

- Real-time PBR (three.js `MeshPhysicalMaterial`) at 2× and downsampled, ambient occlusion, a depth of field with one aperture for wide and macro (blur follows 1/focus − 1/z, so it grows as the camera comes close), a high-threshold bloom for emitters only, a vignette.
- Each material keeps its character: plastics with soft sheen (roughness 0.55–0.7), boards with a thin clearcoat and traces as a raised, lighter relief under the mask, metallic pads, tight highlights on machined metal, matte rubber.
- **Boards are painted from their layout files**: copper pours, every trace, via, pad and drill, silkscreen, on both sides, at 14–20 px per millimetre, with roughness, metalness and bump maps from the same drawing. Components stand at their footprint positions with their package sizes.
- Light: a warm key from above front, a cool rectangular rim behind that follows the camera so edges separate from the ground, a soft top light, a low HDRI for reflections; a practical fill only where the camera goes inside.
- Background: a dark graphite seamless sweep (screen-space radial gradient), floor visible only as soft shadow.
- Effects anchored to the world (leaders, dimension lines, glows) are projected from 3D points every frame; only subtitles and title cards live in screen space.

**几何来源。**拆解以对应产品的CAD/STEP/IGES/KiCad资料、物料清单、规格页或制造商数据表为依据；公开产品可参考附原始CAD和许可说明的开放硬件库。核对模型、零件资料和参考图的授权与署名条件。未能由图纸或资料确认的螺丝、内部结构和尺寸不能标成实物；示意性补全须标明。

Keep claims, source URLs, quoted wording and any measurements derived from CAD in Motion’s existing project fact/source record so they can be checked with the film.

## 配色

- The product brings its own colours; the frame around it is neutral and dark, so the product is always the brightest, most saturated thing.
- Interface ink is one warm white at two strengths (names at full, specs at about 60 %), plus **one accent** reserved for measured things: dimension lines, label indices and one matching detail on the product itself.
- Values are ordered: ground darkest, product mid to light, labels lightest. Never put text on a busy, bright part without a dark backing.
- 来源示范片中的配色示例（展示材料关系，不是此风格的固定色值；换项目须重推）： ground #34363a → #0d0e10, ink #f1efe9, accent #ff6b3d.

## 字体

- Names: a clean sans at medium weight in the film's script (28–32 px; Noto Sans SC 500 in 来源示范片). Specs and numbers: a monospaced face (15–22 px; JetBrains Mono) so digits line up and read as measurement. A neutral grotesque (Inter) for Latin running text.
- Label structure is fixed: a two-digit index in the accent, the name, one spec line. Units always written (mm, MB, ×n for counts). A label carries at most one fact the voice does not say.
- Dimension text sits on a small dark plate, follows the line's angle and is never upside down.
- Subtitles: a centred strip at the bottom with a soft shadow and no box; if the film is bilingual, the film's language on top. Hold every cue ≥ max(1.8 s, speech + 0.6 s); every label stays fully in frame for CJK ÷ 4.5 + other ÷ 15 + 1.5 s.

## 运动

- 24 fps on ones; everything is smooth and deterministic.
- **Separation**: smooth start, fast middle, long settle (ease-in-out cubed); layers leave top first, 0.15–0.2 s apart; repeated parts (keys, screws) fan out in a wave ordered by distance from a corner.
- **Closing**: bottom first, quicker (about 1 s per layer), the last layer lands with a real mechanical response (a key travels its stroke and returns; nothing bounces like rubber unless it is rubber).
- Labels draw in (anchor dot, leader growing, text sliding 10 px) and fade out before the parts move again.
- Never moves: the floor, the light rig's relation to the camera, the label column's x position.

## 画面怎么活

- 爆炸展开并停留时，已分离部件可按来源在轴线上浮约 1–2 mm、采用错相；微距检查镜头中部件必须完全静止。
- 标签在下一次零件移动前退出；地面、灯光相机关系和标签列位置保持固定。

## 镜头语法

| Move | What it expresses | Can serve |
|---|---|---|
| Orbit while layers separate | the whole, its order of assembly | a reveal; a structure overview |
| Grazing macro dolly | touch, material, finish | an opening; a texture |
| Dive between layers | being inside | a hidden component; how it works |
| Slow push on one still part | the part that matters | a chip, a sensor, a seal |
| Rise through the stack | one subsystem to the next | a transition between stops |
| Fast pull back | return, synthesis | a closing; a before/after |
| High three-quarter drift | scale and precision | sizes, pitch, thickness |

- At key moments the subject fills at least a third of the frame height. Labels live in a column on the free side (shift the projection with a view offset rather than moving the object), subtitles in the bottom 12 %.
- Transitions are camera moves through the object itself. No cuts to black, no slide transitions, no split screens.
- The camera path is keyed in the product's own coordinates and interpolated without overshoot (monotone cubic), so a held macro really holds.

## 声音调色板

- Instruments: tuned mallets (marimba, vibraphone, glockenspiel, glass), a round bass, a short synthetic kick and small dry percussion. Precise and dry outside the object; sustained and airy inside it.
- Foley is the material: hollow plastic clacks for keycaps or housings, a switch click with a low thock, dry taps for boards, inharmonic rings for small machined metal, a soft thud for the enclosure, airy swooshes for layers lifting and for camera dives, a fine pen hiss when a dimension line draws, a tiny tick per label.
- Every separation and every landing has its sound, panned to where the part is.
- Silence: at least two near-silences (room tone only) before the big separations or the turn back; the first sound after each is the most important hit around it.
- Mix: voice clearly on top (music about 10 dB under it while it speaks), music bus ducked, sub-bass kept lean (20–60 Hz well under the full band), loudness −14 LUFS.
- Voice: calm, close, unhurried, short sentences; numbers spoken as words, written as digits.

## 原生手法

- **The wave lift.** Repeated parts rise in a wave across the object. *Fits content like:* battery cells; solar tiles; the drawers of a modular shelf.
- **Inside the gap.** The camera enters the space between two lifted layers to see a hidden face. *Fits content like:* the back of a logic board; the inside of a drone arm; the underside of a sensor module.
- **The leader that lands on the part.** A macro label whose line ends on the component. *Fits content like:* a pressure sensor in a shoe; a gasket in a waterproof case; a motor driver.
- **Dimensions drawn on the thing.** After closing, the real outline gets dimension lines in perspective. *Fits content like:* the thickness of a laptop lid; the footprint of a router; the bore of a valve.
- **One real motion.** A part performs its true mechanical motion once (a press, a hinge, a latch). *Fits content like:* a camera shutter; a buckle; a folding hinge.
- **Lights on inside.** Emitters inside the product switch on while it is apart. *Fits content like:* status LEDs; a backlit display; an indicator ring.

## 变化空间

Decided per film: which product and revision, which layers to separate and in what order, how many stops inside and which parts deserve them, the camera route, whether to open from the whole or from a detail, the product's palette and the accent, the voice.

- **Three structures**: one orbit with two stops; a "how it works" path following a signal or flow through the layers; two revisions taken apart side by side, each held still before a difference is named.
- **Three openings**: a part performing its real motion in macro; the closed product turning in silence on the seamless; a single component floating alone before the rest of the product assembles around it.
- **Three endings**: closed with its dimensions drawn on it; closing into a top view that becomes a technical drawing; apart one last time, frozen, every part labelled like a printable sheet.

---


## 坑

- **Invented numbers.** A size that no file gives. Fix: measure it from the CAD and say "measured" in the facts file, or leave it out.
- **Mixed-up revisions.** Plates, cases and boards from different versions of a project. Fix: check hole positions and stack heights across the files (they must coincide), and pin the commit.
- **Panelised boards.** Layout files may hold a panel with breakaway tabs. Fix: take the outline from a plate or case of the same revision, or flood-fill from an interior point.
- **Zero-length edges.** Duplicate outline points give zero normals → NaN → black squares after bloom. Fix: clean outlines, repair zero normals, scan frames for one-frame black tiles.
- **Overshooting camera splines.** Catmull-Rom over unevenly spaced keys flies past a macro stop. Fix: monotone interpolation per component.
- **Labels too short.** Macro stops last about three seconds. Fix: one fact per label, opened before the camera settles; check with `readcheck`.
- **Over-bright light sweeps.** Area lights blow plastics to white. Fix: sweeps at a fraction of the key, bloom threshold above the brightest diffuse surface.
- **Brand marks on parts.** Chip tops and connector shells carry trademarks. Fix: plain package tops; drop logo footprints unless the product is the user's own.
- **Crushed blacks.** Black plastics against a black ground disappear. Fix: lift them to a dark grey and let the rim light separate them.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L14_爆炸图拆解.md`；Lemo-Opuscar 来源库，仓库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `../licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留通用媒介、材质、镜头、声音、native move、坑与变化规则；按本地 `references/styles/_template.md` 重新编排；移除旧条目头部与专属示范片段。
- 证据状态：来源文字方法完整转写；配套预览仅为静态图，不能证明连续运动、作者实现算法或本地可调用实现。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
