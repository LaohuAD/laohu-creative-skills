# 积木玩具逐格动画（brick-toy-stop-motion）

> 一句话：刚性塑料积木在真实桌面上以逐格姿态搭建、倒塌和重组，微距景深保留玩具尺度。

> 来源参照（只学语法）：
> Stop-motion toy-brick films shot like macro photography on a real desk: a world built from interlocking plastic bricks with round studs, animated a pose at a time.
> References (grammar only): brick-film stop-motion on a tabletop and the "brick movie" approach of stepping characters while the camera moves smoothly; macro toy photography (softboxes on glossy plastic, shallow focus, real objects as landscape). Copy none of their characters, sets or music, and never use a brand name.

## 本质 / 不是什么

A brick world on a **real surface** (a wooden desk, a kitchen table, a windowsill), shot with a **macro lens** and animated **in stop-motion**. The charm is the tension between the toy world and the real room.

One-glance traits: glossy ABS with clean rectangular highlights; studs on every top face; seams darkened by contact shadow; real objects out of focus behind; characters that move in held poses on twos.

**Never** use the LEGO name, logo or minifigure silhouette (trademarks). Characters are *built from bricks* (e.g. 1×1 columns for legs, a 2×2 brick for a torso, round bricks for arms, a round 2×2 helmet). Studs carry no lettering.

Not a low-poly isometric island (no flat-shaded facets, no floating diorama), not a clay or felt stop-motion (no deformation: bricks are rigid), not a clean product render of a toy (this world is played with, handled, knocked over).

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适合的主题 |
|---|---|---|
| 真实桌面与日常道具 | 木桌、窗台和家用物件以真实尺度成为玩具世界的地形。 | 小世界、制作过程 |
| ABS塑料高光 | 亮面清漆、矩形柔光箱反射和可见倒角。 | 产品、积木材质 |
| stud与接缝 | 顶面凸点、拼接缝和接触阴影让砖块可辨。 | 搭建、结构说明 |
| 刚性角色 | 四肢围绕关节转动，砖块不拉伸、挤压或变形。 | 角色和物件 |
| 逐格表演 | 角色与砖块按12fps改变姿态，镜头和焦点在24fps平滑移动。 | 定格动画 |
| 砖块构成特效 | 火、烟、水与天气也由砖片、圆砖和透明件构成。 | 材料化效果 |
| 柔光箱+环境光 | 方向光与多块矩形柔光箱令塑料高光成形，AO加深接缝。 | 微距产品感 |
| 低饱和实景/高饱和玩具 | 环境保持自然克制，主体使用玩具主色。 | 尺度反差 |

列出的信号均可在来源正文中定位；每支按主题挑 2–3 个，至少一个避开最常见组合，不把信号全部堆在同一支片子里。

## 这个风格最俗的版本

来源没有给出一套可跨主题复用的固定俗套组合，因此不补造。风格特征与明确排除项保留在上面的本质说明中；具体故事、时间线和段落仍按新主题重新设计。

## 适配

- 用途：可视化搭建、组装、协作与失败重建；主题适合以实体部件和真实台面形成尺度对照。
- 内容：只借用下方可复用媒介规则；人物、故事、事实、镜头顺序和时长按本片目标重新设计。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

来源实现示意：

In `demo/`: `bricks.js` (rounded brick/plate/round-brick geometry, studs, plastic materials with clearcoat and fingerprint roughness), `actors.js` (a brick-built character rig with pose objects and `walkPose`), `set.js` (desk, HDRI, real props at true scale, softboxes), `rockets.js` (props, pre-simulated rigid-body physics, brick fire and smoke), `main.js` (acting, cameras, DOF, subtitles, sound events), `mix.py` (synthesized foley + voice + music), `music/edit.py` (bar-aligned score edit). Minimal start: a brick lighthouse from `bricks.js` on a stack of books, lit by the `set.js` softboxes, one still via `core/render/still.mjs`.

## 材质与渲染

- **Plastic**: ABS with strong clearcoat (~0.85, clearcoat roughness ~0.07); a roughness map with faint fingerprints and scratches (base ~0.17, scratches up to ~0.65); a bevel so edges catch a highlight.
- **Geometry**: rounded box bodies (bevel ~0.045 stud), studs with a thin lip. Unit = 1 stud pitch (8 mm); brick height 1.2, plate 0.4. Large baseplates are **matte** (lower clearcoat than bricks), or they reflect softboxes as a coloured wash.
- **Set**: a real surface with a real texture and real props at true scale (1 m = 125 studs). Household objects become landscape. Light it with a **neutral daylight studio HDRI**, never a tungsten interior (white bricks turn orange).
- **Light**: a toy-photography setup. A directional key from one upper side, warm-white, casting shadows (fit its shadow frustum to each shot so shadows stay crisp); two or three **RectAreaLight softboxes** (key front, cool rim behind, one over any big set) so glossy plastic shows clean rectangular highlights; environment kept low (~0.45) for contrast. Add a soft contact-shadow blob where the key's shadow falls behind a hero object.
- **Ambient occlusion is mandatory**: GTAO (radius a few studs) darkens seams between stacked bricks, stud bases and contact points. Without it bricks look pasted on.
- **Supersample 2×** (render 3840×2160, deliver 1080p): thin stud edges and bevel highlights shimmer without it.
- **Lens**: physical depth of field (CoC ∝ |1/focus − 1/z|). Scale aperture with shot size: widest for close-ups, less for mediums, least for a wide (too much blurs the hero at mid distance). Focus is always on a character's head or the brick being placed.
- **Effects are bricks**: fire, smoke, water, light, weather, celestial bodies are all built from plates, round bricks and translucent pieces, jittered or rebuilt per drawing. Nothing is a particle system or a soft gradient.

## 配色

- A **toy palette**: a handful of saturated brick primaries plus white, black, greys, tan. Each built object has one dominant colour and at most one or two trim colours; characters and hero objects take the most saturated ones.
- The **real world stays natural and muted**: wood, paper, ceramic, daylight. The saturated colour belongs to the toys, which makes them pop against the room.
- **Whites must read white**: grade slightly cool so white bricks don't go cream from the room bounce; soft contrast, saturation lifted ~10 %.
- Translucent pieces (orange, yellow, clear, blue) are reserved for effects: fire, light, water, glass.
- Example palette (the classic brick primaries): red `#c91a09`, blue `#0055bf`, yellow `#f2cd37`, green `#237841`, white `#f2f2ee`, black `#1b2a34`. Others: pastels and tan; greys with one accent.

## 字体

- A rounded, friendly OFL face (e.g. Fredoka, in `core/fonts`) for titles and subtitles.
- Subtitles live on a **toy element**: a dark rounded pill low in the frame with a small brick icon beside the text, or a printed tile, or a sign built into the set. White on dark, ≤ 2 lines. A second speaker type (radio, device, narrator) gets its own icon colour or tag. Hold ≥ max(1.8 s, speech + 0.6 s).
- Titles pop in on 12 fps steps, like a piece being placed; a short sub-line in a brick colour.

## 运动

- **Characters and bricks step at 12 fps** (on twos); **camera, focus, fire and flying vehicles move on ones** at 24 fps. Stepping the camera too reads as judder, not charm.
- Bricks **fly in on arcs** and **snap** with a tiny overshoot (a fraction of a stud → 0 in ~4 frames). Every snap is a click on the soundtrack.
- Characters act with **big readable poses** held for several drawings: a V of arms for pride, arms flung up for alarm, a bowed head for sadness, a hop for joy. Walk cycles swing legs about ±0.55 rad with a small bob. Arms and legs rotate at their joints; nothing bends.
- Collapses and falls use **real rigid-body physics**: tip about the base edge, then independent bodies with gravity (a lower-than-true value reads better at this scale), bounces (restitution ~0.3), friction, settling flat. Pre-simulate so every render is identical.
- Tiny imperfections are allowed. Bricks never stretch, squash or morph.

## 画面怎么活

角色与物件按12fps逐格改变姿态，镜头、对焦、火焰与飞行物按24fps连续移动；积木火、水、烟和天气也按来源由积木部件搭成。

## 镜头语法

A vocabulary, not a route. Opening and ending come from the topic.

| Move | Expresses | Can serve |
|---|---|---|
| Extreme macro on one brick or stud, real room blurred behind | The toy scale is the world | a beginning; a detail that matters; a single part |
| Low angle at minifig eye level | A tiny character made heroic | ambition; pride; standing up to something big |
| High wide over the whole surface | The scale reveal: it was a toy all along | a summing-up; irony; a finished build |
| Low, wide, lonely frame, character small in a corner | Smallness, failure | a setback; waiting; loss |
| Frontal close-up, hands and brick in focus | Intimacy, decision | a choice; a repair; a gift |
| Handheld shake on impact | Physical shock | a collapse; an arrival; a collision |
| Tracking alongside a moving object, destination ahead | Momentum toward a goal | a journey; a race; a launch |
| Top-down plan view | Order, layout, a map | a plan; sorting parts; a city from above |
| Rack focus from a real object to a brick (or back) | Two scales in one frame | "big world, small maker"; a comparison |
| Orbit around a finished build | Pride, inspection | a product; a monument; a result |

Framing: keep foreground clutter out of the frame edges (piles of parts love to block the lens); check headroom in every shot; check every real prop against every camera, because an object placed on one shot's axis sneaks into the background of another. Cut on beats or bars; a snap can be a cut point. No generic dissolves; transitions can be a hand-placed brick covering the lens, a whip along the desk, or a pull out of one set into the next.

## 声音调色板

- **Instruments**: small, acoustic, playful (glockenspiel, toy piano, pizzicato, ukulele, whistling, claps, melodica); a brass or orchestral swell for scale; a heartbeat drum for suspense. Licensed or original, edited to the picture (cut on bars, bar-aligned jumps, chroma similarity at joins) rather than looped under it.
- **Foley** (synthesizable): plastic creak before a failure, tiny plastic footsteps, a crash of many clacks, a brick click (short transient + resonances near 2.9 kHz and 4.6 kHz), clack on wood, rattle of a parts pile being stirred, whoosh on throws, a bell "ding" for discovery, bricks sliding over paper, motors and engines built from filtered noise.
- **Silence is a tool**: cut music dead at a failure or a surprise; leave only room tone and one small real-world sound (a ticking clock, a fridge hum, a distant bird). Music can also drop out before a big moment, leaving a pulse or a countdown.
- **Voice**: a warm storyteller, few short lines with room to breathe; secondary voices through a device filter (band-pass ~380–2800 Hz + soft saturation), optionally with beeps. Verify every line with whisper.
- Mix: voice compressed, music ducked ~40 % under voice, loudness −14 LUFS.

## 原生手法

A menu: use the ones your story needs.

- **Snap-together building.** The plot is an act of building; pieces fly in on arcs and click home. *Fits content like:* a company assembling its first product; a neighbourhood rising street by street; a recipe put together ingredient by ingredient.
- **Break without harm.** Things fall apart and the parts become something new; failure yields spare parts. *Fits content like:* a pivot after a failed plan; recycling; a team reshuffled into a better shape.
- **Toy on a real desk.** Real objects become landscape at toy scale. *Fits content like:* a laptop keyboard as a city grid; a houseplant as a jungle; a coffee spill as a flood.
- **Hand-made stop-motion.** 12 fps poses, tiny imperfections, even fire and water made of bricks. *Fits content like:* a weather report; a kitchen explained with brick flames; a science demo of a volcano.
- **Rebuild into something else.** The same pieces, rearranged on screen, become a different object. *Fits content like:* one career turning into another; a before/after renovation; a word re-spelled.
- **The scale reveal.** Pull back until the whole world is a toy on a table. *Fits content like:* a big ambition that is still small; a year in review; a child's imagination.

## 变化空间

You decide the structure, the characters (or none), the surface and its props, the opening, the ending, the camera path, the pacing, the palette within the colour logic and the music. All far from our demo:

- Structures: **a catalogue** (one build per beat, each a different object answering the same question, lined up at the end); **two builders** on opposite sides of the table whose builds grow toward each other; **a disassembly** (a finished thing is taken apart piece by piece to explain what's inside).
- Openings: **a hand pours a bin of bricks** onto the table and the pile settles into the first shape; **a real object first** (a mug, a phone), then rack focus to the tiny world at its base; **plan view** of an empty baseplate filling in like a map.
- Endings: **one piece left over** held in close-up, the question it raises unanswered; **the lights go out** in the room and only a lit brick window glows; **a real hand** reaches in and picks the character up.



## 坑

- Tungsten HDRI → orange whites. Use a neutral studio HDRI and a slightly cool grade.
- Clearcoat on a large flat baseplate reflects softboxes as a coloured wash. Make it matte.
- Flat, slightly jagged first renders: even light, no AO, single-sample rendering, stepped camera. Fix: softboxes + low environment, GTAO, 2× supersampling, cool grade, camera on ones.
- Too much aperture blurs the hero at mid distance. Scale aperture with shot size.
- A fast-rising or fast-moving object becomes a dot on a blank wall. Track it and keep its destination in frame.
- Curved transparent parts made from a sphere segment vanish inside a cylindrical part. Use an open-cylinder panel.
- Real props on a later shot's camera axis sneak into the background. Check props against every camera.
- Random jitter used as a material or colour index can go negative → undefined material crash. Clamp.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L55_积木玩具.md`；Lemo-Opuscar 来源库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留来源关于本质、材料、颜色、文字、运动、相机、声音、原生动作、陷阱和变化空间的具体方法；新增的辨识信号逐项对应来源正文。按受保护的 `_template.md` 结构重排，并删除演示片故事、演示片标题及其专属叙事信息。
- 与已有风格的边界：与 original:soft-3d-toy 的圆润哑光/可挤压角色不同，本条是刚性有接缝、带stud的亮面塑料砖，不变形；也不是低多边形悬浮岛。
- 证据状态：方法依据是上述来源文字；来源配套预览只作为静态图像保留，不能证明连续运动、作者实现算法或本地复现效果。本条不声明已检查来源视频或完成本地渲染验证。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
