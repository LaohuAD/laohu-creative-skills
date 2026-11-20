# 空室录像带怪谈（liminal-vhs-footage）

> 一句话：连续手持家用摄像机穿过空旷熟悉空间，焦距、曝光、OSD 与磁带损伤承担叙事。

> 来源参照（只学语法）：
> Camcorder tapes recovered from empty, endless, fluorescent-lit spaces. Rules instead of monsters.
> Genre reference (grammar only): "the Backrooms" internet folklore and new-weird / rule-horror; 1990s consumer camcorder footage. **Never** use the word "Backrooms", wiki "Level" numbers, community entity names, or any existing organisation or logo inside the film. Everything on screen (rules, forms, company voice, any presence) is original.
> 
> Suits short films; the length follows the walk, and the dread thins out once nothing new goes wrong.

## 本质 / 不是什么

- **One first-person camcorder recording** (1990s VHS, 4:3), handheld, continuous.
- **An empty, familiar-but-wrong interior** that repeats: an office, a hotel floor, a school, a mall, a parking level, a hospital wing. Humming fluorescent light, no people.
- **Dread from emptiness, repetition, bureaucratic rules, and the camera's own machinery failing at the wrong moment.** Nothing chases anyone. A chill on the back of the neck, not a jump.
- **The medium is the storyteller**: focus, exposure, tape damage and the on-screen display carry the plot.

Not a horror film (no monster close-ups, no gore, no jump scares, no score stings), not an ASCII/CRT terminal piece (the artefacts are tape and lens, not phosphor and scanlines), not a ruin (clean is part of the style).

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适合的主题 |
|---|---|---|
| 连续4:3手持POV | 一镜到底，只在开机、磁带撕裂或停止录制处出现断点。 | 走廊、室内探索 |
| 重复的熟悉空间 | 办公室、酒店、学校等重复出现，空间干净、无人且不合常理。 | 空无、规则恐怖 |
| 局部光与雾联动 | 雾色取决于邻近灯光，熄灯区会形成光中的空洞。 | 灯光异常、远处轮廓 |
| 磁带摄像机失真 | 抖动、色度拖尾、自动增益和磁头切换带随录像而变化。 | 录像带、失真 |
| OSD独立于磁带噪声 | 录制点、时间、电量等摄像机字层不被视频噪声污染。 | 时间线、证据 |
| 自动对焦寻找 | 焦点从模糊过冲到锁定，再滑开，成为看见/看不见的叙事。 | 远处不确定物 |
| 单一饱和信号色 | 环境主色病态低饱和，只有一个报警/提示色饱和并发光。 | 警示、规则变化 |
| 只用现场录音 | 没有配乐；荧光灯、PA、操作者、脚步与长静音构成声音。 | 克制悬疑 |

列出的信号均可在来源正文中定位；每支按主题挑 2–3 个，至少一个避开最常见组合，不把信号全部堆在同一支片子里。

## 这个风格最俗的版本

来源没有给出一套可跨主题复用的固定俗套组合，因此不补造。风格特征与明确排除项保留在上面的本质说明中；具体故事、时间线和段落仍按新主题重新设计。

## 适配

- 用途：以空无、重复规则和拍摄媒介异常制造克制不安的短篇；不适合需要动作追逐或配乐惊吓的恐怖片。
- 内容：只借用下方可复用媒介规则；人物、故事、事实、镜头顺序和时长按本片目标重新设计。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

来源实现示意：

`demo/world.js` (layout, light DataTexture, custom lighting and fog shaders, props), `demo/tex.js` (procedural wallpaper, carpet, ceiling, panels, notices, signs), `demo/vhs.js` (VHS camcorder ShaderPass), `demo/osd.js` (bitmap font, REC, battery, clock, title generator), `demo/subs.js` (608 captions), `demo/thing2d.js` (organic silhouette), `demo/story.js` (timeline, camera keyframes, focus / fear curves, time warp), `demo/main.js` (renderer, post chain GTAO + DOF + bloom → VHS, handheld rig). File map and build: upstream demo build notes.

## 材质与渲染

- **Frame**: 4:3 pillarboxed in 1920×1080. Render 3D at low resolution (e.g. 720×540) and let the VHS pass upscale; low resolution hides CG cleanliness.
- **Space**: axis-aligned partitions on a grid with random gaps and stubs, pillars, a drop ceiling of tiles with recessed light panels at regular intervals. A hand-authored route through procedurally filled space, so every doorway shows more emptiness.
- **Lighting = thousands of lights, no shadows**: store every panel's colour and intensity in a float texture; each fragment sums the nearest panels (emitter cosine × Lambert / (d² + ε)) plus a bounce term. No occlusion: this light is flat. Per-light variation (a few % warm/cool/green), a few % dead, a few % flickering. Ambient occlusion darkens seams.
- **Fog follows local light**: fog colour × (local light / average). Where lights are dead the haze is dark, so a silhouette there reads as a *hole in the light*. Background = fog × ~0.15, so corridors dissolve into darkness, never a bright wall.
- **Restrained decay**: tide-marks at the foot of some walls, a discoloured band under the ceiling, rare peeling seams, a few yellowed or missing tiles, dead insects in diffusers. Percentages in single digits.
- **Printed matter**: office laser-print on yellowed paper, condensed sans headers, form numbers and revisions, numbered rules, a polite closing line from "Management". Pinned or taped.
- **VHS camcorder pass** (not a CRT): small line jitter (≤ 0.25 px low-frequency wobble), a head-switching band, tracking tears on demand, barrel + vignette on the image but **not** the OSD, luma blur + edge ringing, chroma smeared right, light smear, drifting white balance, AGC noise in darks, dropouts, lifted blacks, soft clip. Noise at tape rate (30 fps). No scanlines, no RGB mask.
- **OSD**: a hand-made bitmap font with a black outline: REC dot, battery, time and date. A camcorder title generator uses the same font, larger.

## 配色

- **One dominant sickly hue** from the location's materials (mustard wallpaper, institutional green, hospital blue, beige laminate), with a darker trim and a mottled floor of the same family; ceiling and light panels near-white and slightly warm.
- **Exactly one saturated colour**: a signal such as a red alarm lamp, a green emergency sign, an amber warning light. It is the only thing that blooms (drive its emissive high enough to cross the bloom threshold).
- White balance drifts; colour is never graded clean.
- Example material palettes: wallpaper `#d5bd66`, trim `#4d3d26`, carpet `#8c763c`; pool tile `#9fc7c0`, grout `#e6ece6`, water `#5e8f96`; school corridor `#b9c49a`, lockers `#6f7f66`, linoleum `#a89a7d`.

## 字体

- **Closed captions (CEA-608 style)**: a monospace (e.g. IBM Plex Mono 600) ~42 px, white on a solid black box per row, ≤ 32 characters, centred inside the 4:3 frame above the OSD. Untouched by tape noise (the TV decodes them). Hold ≥ max(1.8 s, speech + 0.6 s).
- **Speaker marks**: `[PA]` for announcements, italics for the operator, SDH descriptions in brackets (`[LIGHTS FLICKER]`, `[TAPE NOISE]`, `[SILENCE]`).
- **Rules on notices are not captioned**: they are the picture. Readable at 1080p, ≥ 3–4 s uncovered. For close-ups **lower the camera so the lens is parallel to the page**; pitching down at a vertical sheet shears words into fake italics.
- The **title** is camcorder title-generator text over the first shot.

## 运动

- **One continuous handheld take.** Cuts happen only where the tape breaks: power-on roll-in, tracking tear, REC off.
- **Handheld** = walking gait (head bob a few cm, sway, small roll) + breathing (~0.27 Hz) + tremor noise at a few frequencies whose amplitude follows a **fear** curve. At a held breath, **freeze all of it**.
- **Looking down** shows only shoe toes and floor, never legs.
- **Autofocus** = focus distance animated with overshoot: blur → lock → slip → lock. Blur comes from pulling focus *near*. Zoom narrows the FOV and opens the aperture.
- **Lights flicker** as short blackouts (~0.1 s); auto-exposure catches up with a lag (~0.45 s) and gain noise pumps.
- Things move by themselves slowly (a door over >1 s, eased), never snap.

## 画面怎么活

手持画面跟随步态、呼吸和恐惧曲线；灯具短暂熄灭并由自动曝光滞后补偿，对焦持续寻找。静止屏息时冻结整套手持运动，这是来源明确的动作状态而不是全片静态原则。

## 镜头语法

A vocabulary, not a route. Opening and ending come from the topic.

| Move | What it expresses | Can serve |
|---|---|---|
| Walking POV down a corridor | routine, the endless | establishing the space; time passing |
| Slow pan off a detail to the space | scale; the space goes on | a reveal; a first look |
| Glance down at the feet | obedience, avoidance | obeying a rule; not looking |
| Crouch and hold on printed text | reading; bureaucracy | a rule; a contradiction |
| Zoom + focus hunt into the distance | seeing / not seeing | a presence; a doubt |
| Identical framing after a tear, only the OSD changed | time removed | a jump; a loss |
| Turn a corner, hold still | a threshold | an exit; a choice |
| Slow push-in with no sound | the pull of something | a door; a sign |
| Backing away while filming | retreat, fear | leaving a room; a rule broken |
| Camera set down on a surface, static, recording alone | abandonment | the operator gone; a long wait |
| Whip toward a sound, then nothing | expectation denied | a noise with no source |

Framing: text readable and uncovered; any presence small, far, and in a region of dead lights. Transitions: tape events only.

## 声音调色板

- **No score.** Only what the tape would have recorded. Music exists only inside the world (hold music, a radio through walls, a tinny PA jingle), filtered and reverberant, possibly slowing with tape wow.
- **Fluorescent bed**: 120 Hz (or 100 Hz) + harmonics, a buzzy band-passed component, a faint ballast whine, bad-tube bursts; gated by the same light curve as the picture; closer in small rooms.
- **PA voice**: calm, corporate, through a ceiling speaker (band-pass ~300–3500 Hz, cone resonance, saturation, room reverb), dry enough to stay intelligible. A short original chime before announcements; after a time jump, chime and voice may drift flat.
- **Operator**: a few short, quiet lines with proximity bass and breath; breathing whose rate follows fear; a held breath and one long exhale.
- **Foley by material**: carpet steps (low thud + wet squelch) or hard-floor squeaks, cloth rustles, camcorder clack and motor, zoom servo, AF ticks, ballast tink on flickers, a stick-slip hinge, a drag overhead, a vending machine, a pipe.
- **Silence**: digital zero for a second or more (tails included), captioned `[SILENCE]`, is the strongest tool. A soft scare at most: everything restriking at once when sound returns.
- **Drone** options: a low brown-noise band with beating sines rising slowly; the room tone itself pitch-shifting; nothing.
- **Mix**: bed and in-world music ≈ −8 dB under voices. −14 LUFS; no added grain (the noise is in the picture).

## 原生手法

A menu: use the ones your story needs.

- **Autofocus / auto-exposure hunting.** Something is there only while focus is correct. *Fits content like:* a missing pet on a hotel floor; a figure in an empty stadium; a shape at the end of a hospital corridor.
- **Tape tracking damage.** A tear is a cut the universe made; same framing after, but the clock jumped, the battery drained, a light died. *Fits content like:* a night-watch log; a lost weekend in a mall; a house that ages between tapes.
- **The OSD is plot.** REC, battery, date and time code are evidence. *Fits content like:* an alibi; a countdown; a dated inspection.
- **Rules as text in frame.** Notices and PA announcements start ordinary, drift wrong, contradict each other, and finally address the viewer. *Fits content like:* a pool's safety rules; a school fire drill; a museum after hours.
- **Emptiness and repetition.** The same notice in a different place; the same room with one detail changed; a corridor into fog. *Fits content like:* a moving-day walkthrough; an airport at 4 a.m.; an office after layoffs.
- **The thing that is almost human.** A distant silhouette wrong by 15–40 % (small head, long neck, narrow high shoulders, long arms), drawn as organic curves on a billboard, moving slowly. *Fits content like:* a mannequin that is not; a night guard; a reflection that lags.

## 变化空间

You decide the location and its materials, the procedure or reason for filming, the rules, the route, the presence (or none), the signal colour, the opening, the ending and the length.

All far from our demo:

- Structures: **two tapes** (the same route filmed twice, a year apart; the second tape finds what changed); **a real-estate walkthrough** where every room is described cheerfully by the operator while the house keeps adding rooms; **a checklist read aloud** item by item, each item ticked on a clipboard in frame, until an item is not on the list.
- Openings: **mid-sentence** (the tape starts with the operator already talking, tracking still rolling in); **a test pattern** and a date slate before the camera is picked up; **the lens cap on**, sound only, until the cap comes off.
- Endings: **battery dies** (the icon blinks, the frame freezes on the dead cell); **the camera is set down** and keeps recording an empty room; **the tape loops** back to the first shot, now with the operator's shoes visible in it.



## 坑

- **A fully bright scene reads as a hospital corridor** → partitions with gaps; far areas fall dark.
- **Lights leak through walls** (no occlusion) → a dead zone needs every light within ~±5 m dead, and the space behind it dim.
- **Background shows as a bright rectangle** at a corridor's end → background = fog × ~0.15.
- **Uniform fog lifts silhouettes to grey** → fog follows local light.
- **Line wobble skews text; pitching down italicises it** → ≤ 0.25 px wobble; lower the camera.
- **Primitive-built figures read as toys**, primitive legs as tubes → organic silhouettes; show only shoe toes.
- **Pure red never blooms** at low emissive (low luminance) → drive it far higher.
- **Normalising a filtered signal by its pre-filter peak** blows up a bus → normalise the processed signal.
- **Heavy PA reverb destroys intelligibility** → ASR-check processed lines and the full mix.
- **Billboards stamp dark rectangles** in AO → exclude them.
- **Time-compressing a finished timeline** → keyframes in original time mapped through one warp function, including hard-coded times elsewhere.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L54_后室 · 新怪谈.md`；Lemo-Opuscar 来源库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留来源关于本质、材料、颜色、文字、运动、相机、声音、原生动作、陷阱和变化空间的具体方法；新增的辨识信号逐项对应来源正文。按受保护的 `_template.md` 结构重排，并删除演示片故事、演示片标题及其专属叙事信息。
- 与已有风格的边界：与 original:crt-vhs 不同，异常属于摄像机记录与镜头/磁带，不是显像管扫描线、RGB荧光点或电视机外壳；与普通废墟叙事不同，空间保持洁净熟悉。
- 证据状态：方法依据是上述来源文字；来源配套预览只作为静态图像保留，不能证明连续运动、作者实现算法或本地复现效果。本条不声明已检查来源视频或完成本地渲染验证。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
