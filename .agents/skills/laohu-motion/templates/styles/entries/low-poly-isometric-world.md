# 低多边形等距小世界（low-poly-isometric-world）

> 一句话：正交等距镜头观察浮空低多边形世界，六边地块按节奏升起，光照与发声共同记录生长。

> 来源参照（只学语法）：
> A tiny faceted world seen through an orthographic isometric lens: everything is a geometric block, and everything that appears arrives with a bounce and a note.
> References (grammar only): *Townscaper* (building is the performance; every piece lands with a springy bounce and a sound; pieces sprout small details by themselves); *Monument Valley* (isometric geometry, soft pastel palettes, gradient skies, calm pacing, lots of empty space). Never copy their grids, buildings, characters, UI or typography, and never name them on screen.

## 本质 / 不是什么

A miniature world built from **flat-shaded low-poly geometry** (hexagonal tile columns, box buildings with prism roofs, cone and icosahedron trees) floating in a faceted sea or void, watched by an **orthographic camera** at an isometric angle. No perspective and no horizon: distance dissolves into a **screen-space sky gradient**, so the world looks like a model suspended in colour. **Light, not texture, tells time**: every facet changes colour as the sun moves; in the dark only emissive blocks keep their colour.

Not a voxel game (no cubes-of-cubes, no pixel texture), not a tilt-shift photograph of a real place (no perspective, no photo detail), not a smooth-shaded 3D cartoon (no rounded normals, no subsurface).

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适合的主题 |
|---|---|---|
| 正交等距投影 | 固定等距角度，没有透视缩短或地平线。 | 世界地图、微缩环境 |
| 六边柱地块 | 六边形柱叠高表达地貌和材质，顶盖与侧壁分开。 | 岛屿、城镇、地形 |
| 无贴图平面着色 | 几何面承担色差，低多边形不靠纹理噪点。 | 自然、系统场景 |
| 分面水面 | 水体由密集三角面波动，浅滩、泡沫边和水线另行表现。 | 海岛、河流、地貌 |
| 天空雾无地平线 | 远景按正交深度混入屏幕渐变，星点在浓雾区出现。 | 夜景、尺度 |
| 一天颜色关键帧 | 天顶、地平、浅海、太阳色和光照参数随时间插值。 | 季节、日夜变化 |
| 地块升起和落件回弹 | 生成以升起、堆叠、弹回的曲线呈现，落定时间是事件点。 | 搭建、成长 |
| 事件发声 | 每个生长事件产生对应音符，序列按最小节拍格安排。 | 音乐可视化、成长 |

列出的信号均可在来源正文中定位；每支按主题挑 2–3 个，至少一个避开最常见组合，不把信号全部堆在同一支片子里。

## 这个风格最俗的版本

来源没有给出一套可跨主题复用的固定俗套组合，因此不补造。风格特征与明确排除项保留在上面的本质说明中；具体故事、时间线和段落仍按新主题重新设计。

## 适配

- 用途：岛屿、城镇、生态或系统生长的三维小世界；需要真实立体分层与时间光照，不是二维架构信息图。
- 内容：只借用下方可复用媒介规则；人物、故事、事实、镜头顺序和时长按本片目标重新设计。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

来源实现示意：

In `demo/` (three.js): `world.js` (hex layout, primitive props, growth schedule → events with notes, arrival curves), `sea.js` (faceted wave shader, shallow map, beam-lit water), `post.js` (ortho post: GTAO → sky/haze + stars → tilt-shift → bloom → grade), `story.js` (beat grid, time-of-day keyframes, shots), `main.js` (renderer, lights, per-shot cameras, HUD, event export), `music/score.py` (event-driven score; `music/check.py` compares audio onsets and pitches with the events), `mix.py` (foley, beds, ducking). The upstream demo also had a file map and build steps; those files are documented as source-project examples.

## 材质与渲染

- **Geometry** (world unit = one hex tile's circumradius): pointy-top hexagonal columns (`CylinderGeometry(r, r, h, 6)`), axial → world `x = √3(q + r/2)`, `z = 1.5 r`. Terrain height encodes material (sand low, grass, hills, rock highest). A thin separate top cap sits over a darker side colour; **sink the side column's top below the cap** or it z-fights. Leave a small gap between tiles so AO draws the seams.
- **Props** are primitive assemblies: boxes, prisms, low-segment cylinders and cones, icosahedra at detail 0, pinched boxes. Emissive parts (windows, lamps) get their own material per object so they can light individually.
- **Materials**: `MeshStandardMaterial({ flatShading: true, roughness ≈ .9 })`, **no textures**. Jitter each tile's lightness a few percent so the ground isn't a spreadsheet.
- **Water** (if any): a dense non-indexed plane displaced by summed sines in the shader, flat-shaded so each triangle glints on its own (not too low a roughness or facets flash white); a coarse plane below for zoom-outs; a **shallow map** redrawn per frame where land exists, mixing deep → shallow colour with a faint foam rim; a thin transparent ring at each tile's water line for surf.
- **Sky without a horizon**: in post, linearise the orthographic depth and blend distant pixels into a vertical screen gradient; set haze start/end as fractions of frustum height × cot(elevation) so the horizon band stays in the top third at any zoom. Stars (hash grid, twinkle) only where haze is thick.
- **Post**: MSAA + depth → **GTAO** (mandatory: it draws the seams between tiles and under roofs) → sky/haze composite → a very light tilt-shift at the frame edges → bloom (stronger at night) → pastel grade → Neutral tone mapping. Supersample 2×.
- **Light beams** (searchlight, projector, torch): a camera-facing ribbon with a Gaussian profile, bright at the root and fading with distance, plus a wider faint halo copy; light the surface under it in its own shader.

## 配色

- **Pastel, low contrast, a handful of hues**: one ground family (sand/grass/earth or its equivalent), one neutral rock, and a small set of wall and roof colours repeated across buildings.
- **Time of day is a keyframed set of colours** (zenith, horizon, deep, shallow, sun colour, intensity, elevation, azimuth), interpolated. Day is airy and cool; dusk warms the horizon; night desaturates everything toward blue-violet.
- **At night, warm emissives are the only bright things** (windows, lamps, a beam). Keep the sun sideways to the camera in key shots (low sun behind the target turns faceted water into glare); water receives no shadows.
- No outlines, no black; shadows and AO are the only darks.

Examples of world palettes: sand, grass and coral roofs under a pale-blue day; snow tiles, pine greens and red cabins under a lilac sky; terracotta mesas, sage scrub and turquoise pools under an apricot dusk.

## 字体

- Geometric OFL sans faces: a rounded one for subtitles (e.g. Quicksand 600), a geometric caps face with wide tracking for titles (e.g. Josefin Sans).
- **Subtitles**: no box; warm white with a soft dark-blue drop shadow, centred low; a small flat-shaded tile icon beside them whose top colour follows the time of day. Hold ≥ max(1.8 s, speech + 0.6 s), never overlapping the next line or a title.
- **Titles behave like tiles**: letters rise one by one from under a water line, overshoot and settle.
- A text card over the world leaves a gap where the world stays visible.

## 运动

- On ones (24 fps), smooth. The charm is in the **arrival curves**, not stepping.
- **Rise from below**: a short cubic ease up, then a damped-sine overshoot; a splash ring and spray the moment it breaks the surface. The event time is when it settles.
- **Drop and stack** (floors, roofs, rings): a fast ease-in fall, a damped bounce, and volume-preserving squash-and-stretch on landing.
- **Pop** (trees, lamps, details): scale `1 − e^(−k s)·cos(ω s)`, about 25 % overshoot.
- **Life**: mills turn, smoke puffs, birds circle, boats bob with the same wave function as the water (evaluated on the CPU).
- **Schedule growth on the music grid**: at most one piece per smallest slot, so every event keeps its own note; accelerate by density (halves → quarters → eighths), not by tempo.
- Never moves: the projection (no perspective, no fov change).

## 画面怎么活

水面波纹、风车、烟、鸟、船与星光按来源持续或错相运动；日夜光色按关键帧改变。生成件依音乐格安排，不默认为静止背景。

## 镜头语法

`THREE.OrthographicCamera`. **Frustum height is the zoom** (a few units for a close-up, the whole world at a dozen or more, hundreds for a scale reveal); place the camera ≥ 3 × frustum height away or the bottom of the frame looks under the sea. A vocabulary, not a route. Opening and ending come from the topic.

| Move | What it expresses | Can serve |
|---|---|---|
| Turntable (azimuth sweep) | the thing seen from every side | building; inspecting; a product assembled |
| Pure orthographic zoom (frustum change) | scale without perspective | a detail in context; smallness; a world among worlds |
| Elevation change | low (≈20–25°) widens the sky band; high (≈50°) reads as a map | night and stars; a sweep across the whole world; a plan |
| Locked 3/4 wide | the world lives on its own | lights coming on; time-lapse; waiting |
| Tight close-up on one arrival | the bounce and the splash | a key piece; a milestone; a gag |
| Side angle trailing a mover | travel across the frame, never at the lens | a delivery; a departure; a route |
| Lateral truck along a row of tiles | a list, a sequence | steps of a process; a timeline |
| Time-lapse sun sweep, camera still | light is the time machine | a day; a season; history |

Intercut wide and close on beats: wide shows the shape growing, close sells the bounce. Transitions: hard cuts on the beat, a time-of-day change, a zoom through the sky; no dissolves, no perspective whip-pans.

## 声音调色板

- **Music can be event-driven**: growth events carry a note, and the score synthesizes each one at its exact time, so the picture writes the tune. Pitched percussion suits the facets: marimba, kalimba, woodblock, bells, vibraphone, celesta, steel drum; underneath, a soft pad, a gentle ostinato, light shaker or soft kick. Pentatonic or modal material keeps any order of notes consonant. **No piano, no strings.**
- **A single note can be a motif**: one sound owned by the world (a bell, a chime, a horn) that returns changed.
- **Foley follows material**, all synthesizable: bubble sweep + splash with droplet ticks for rising tiles (bigger = lower); wooden knock plus a quieter bounce knock for floors; ceramic clack for roofs; hollow plank knock; heavy stone thunk; glass tink; a low whump with electric hum for anything switching on.
- **Beds**: low-passed brown-noise water with swells, birds as downward-gliding FM chirps, creaking wood, crickets or wind at night.
- **Silence**: drop to a low drone and a bed; a moment of digital zero on the music bus before a big downbeat. Options: thin the ostinato to one voice instead of stopping it; let the world's own events carry the rhythm for a passage.
- **Voice**: clear and gentle, few short lines; avoid words that collide with the film's subject (a film about baking: "flour" heard as "flower").
- **Mix**: voice compressed and well above the music, music ducked under it, −14 LUFS; **grain 0** (flat colour shimmers with grain).

## 原生手法

A menu: use the ones your story needs.

- **Building is composing**: every piece that lands plays a note; a later sweep can replay them in spatial order as a finished melody. *Fits content like:* a skyline whose floors are notes; a team assembling a product; a garden whose flowers form a chord.
- **Procedural growth**: tiles rise, floors stack, trees pop. *Fits content like:* a startup's first year; a coral reef recovering; a neighbourhood being planned.
- **Scale by pure zoom**: one object fills the frame, then the world becomes a speck (or the reverse). *Fits content like:* one user among millions; a village on a continent; a data centre inside a network.
- **Turntable**: a continuous rotation around the thing being made. *Fits content like:* a machine being assembled; a museum object; a house renovation.
- **Light as clock**: shadows sweep and facets re-colour. *Fits content like:* a day of a shop; a year of a farm; a shift at a hospital.
- **Emissive blocks in the dark**: lights coming on one by one, a beam sweeping like a clock hand. *Fits content like:* a network going live; a town at nightfall; volunteers joining a cause.

## 变化空间

You decide the world (island, town, orchard, factory floor, planet), what grows or changes, the palette within the colour logic, the opening, the ending, the camera path and the pacing. All far from our demo:

- Structures: **erosion** (a finished world loses pieces one by one, each removal a falling note, until only the essential piece remains); **two worlds** side by side trading pieces across a gap until they join; **a year in four seasons** on one fixed world, the palette keyframes carrying the story.
- Openings: **mid-construction** (a busy half-built world, many pieces already dropping); **from above** (a top-down map that tilts down into isometric); **the full world first**, then a push into one tile where the story lives.
- Endings: **a close-up on one final piece** landing, no pull-back; **the world packed away** (pieces fly up and stack into a box); **daylight** (dawn floods the world and the music resolves on the first sunlit facet).



## 坑

- `perspectiveDepthToViewZ` in shared post code is wrong for an orthographic camera → `orthographicDepthToViewZ`.
- GTAO renders sprites and transparent objects as solid quads → hide them during the AO pass; set `visible = false` at zero opacity.
- Side column and top cap sharing one plane → z-fighting → sink the column.
- A double-sided additive cone reads as two white lines → a camera-facing Gaussian ribbon + halo.
- Camera too close for its frustum → the frame bottom shows below the sea → distance ≥ 3 × frustum height.
- Two pieces landing in one grid slot muddy the melody → one piece per slot.
- `half` is a reserved word in GLSL.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L58_低多边形等距.md`；Lemo-Opuscar 来源库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留来源关于本质、材料、颜色、文字、运动、相机、声音、原生动作、陷阱和变化空间的具体方法；新增的辨识信号逐项对应来源正文。按受保护的 `_template.md` 结构重排，并删除演示片故事、演示片标题及其专属叙事信息。
- 与已有风格的边界：与 original:isometric-infographic 的二维几何信息图不同，本条是三维正交场景、分面水体、天光雾层和按拍生长；与 pixel-diorama 不同，不使用像素角色或像素纹理。
- 证据状态：方法依据是上述来源文字；来源配套预览只作为静态图像保留，不能证明连续运动、作者实现算法或本地复现效果。本条不声明已检查来源视频或完成本地渲染验证。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
