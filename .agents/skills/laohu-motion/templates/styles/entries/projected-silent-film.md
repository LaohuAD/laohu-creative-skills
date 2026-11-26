# 投影默片（projected-silent-film）

> 一句话：手绘银灰影像置于影院幕框与丝绒侧幕之间，以无对白字幕卡和现场感钢琴讲故事。

> 来源参照（只学语法）：
> An engraved-illustration silent film projected in a picture house: ink line and silver wash, a 4:3 print that flickers and weaves between velvet curtains, intertitles instead of voices, and a cinema pianist who plays every beat.
> References (grammar only): **Buster Keaton**, *The General* (1926) and *Sherlock Jr.* (1924) — the whole gag in one locked-off wide shot, a deadpan face, a body that does the acting; **Harold Lloyd**, *Safety Last!* (1923) — the near-miss; **Georges Méliès** — the iris and the trick shot; **The Artist** (2011) — how few intertitles a modern audience needs; **1920s photoplay piano cue sheets** — music by mood section, the piano doing the sound effects. Never use the Tramp look (bowler, toothbrush moustache, cane), any real film's gags, or any published melody.

## 本质 / 不是什么

A one-reel film as it would look *projected*:
- **A 4:3 print in a gate between theatre curtains**; the sides of the 16:9 frame are the picture house.
- **An ink drawing with washed greys and hatching**, printed on silver stock that flickers, weaves, scratches and burns at the edges.
- **Nobody speaks.** Beats are told by **action in wide shots** and by **intertitle cards**.
- **The only sound is a cinema instrument** (piano, organ) and the projector in the booth.

Not a noir (no hard shadows as mood, no voice-over), not a sepia photo filter on modern animation (the drawing itself is engraved and inked), not a Chaplin pastiche.

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适合的主题 |
|---|---|---|
| 影院4:3门框 | 1440×1080画面置于16:9中央，圆角门片与幕布进入构图。 | 投影感、时代片 |
| 描绘式灰阶 | 以墨线、淡灰洗和交叉排线重画画面，不是现代动画加棕滤镜。 | 默片、寓言、工艺 |
| 银色印片 | 亮部晕光、片门摆动、闪烁、划痕和银盐颗粒构成媒介表面。 | 怀旧投影、档案感 |
| 16fps表演与24fps片面 | 人物/相机在16fps采样，印片纹理每个输出帧变化。 | 手摇摄影机感 |
| 字幕卡替代对白 | 少量情绪边框字幕卡承担旁白和对话，画面不重复解释动作。 | 无对白叙事 |
| 宽景身体表演 | 固定全景让动作因果成立，脸部近景克制。 | 物理喜剧、追逐 |
| 钢琴或管风琴 | 乐器承担动作拟音，投影机成为持续环境声；不加对白和拟音层。 | 影院默片语法 |
| 按段落变色 | 银灰为主，可按情绪换印色或只让一个主题对象保留颜色。 | 转折、温柔段落 |

列出的信号均可在来源正文中定位；每支按主题挑 2–3 个，至少一个避开最常见组合，不把信号全部堆在同一支片子里。

## 这个风格最俗的版本

来源没有给出一套可跨主题复用的固定俗套组合，因此不补造。风格特征与明确排除项保留在上面的本质说明中；具体故事、时间线和段落仍按新主题重新设计。

## 适配

- 用途：需要默片表演、时代投影媒介、身体喜剧或无对白叙事的短片。
- 内容：只借用下方可复用媒介规则；人物、故事、事实、镜头顺序和时长按本片目标重新设计。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

来源实现示意：

In `demo/engine/`: `ink.js` (tonal forms, ink line, wash, hatch; `drawShape()` draws any path in this style), `redraw.js` (`Redraw`: tonal painting or real footage → ink drawing, WebGL2), `film.js` (`FilmPost` print pass + `damage()`, stackable on any 2D canvas, with an optional colour mask), `cards.js` (intertitles, deco borders, iris, theatre), `figure.js` + `heads.js` (2.5D rig). `demo/timeline.js` is a cue sheet that drives both picture and score. API table and a minimal example (a one-colour shape through the whole pipeline): the upstream demo engine reference.

## 材质与渲染

- **Tonal painting + Redraw.** Scenes are painted in grey values only (print densities roughly: ink 0.07, dark cloth 0.15–0.3, mid wood 0.45–0.6, skin 0.8, white linen 0.9–0.95), with soft light gradients and a thin separation line. A **Redraw** pass (WebGL2) inks the whole frame: difference-of-Gaussians contours on the dark side of every edge, luminance posterised into ~5 soft wash steps, and 45° hatching (then crossed) in the darks, re-drawn every two frames like hand-redrawn animation. Real video frames can go through the same pass so footage and drawing share one hand.
- **Print pass**: silver tone with a sepia amount between ~0.1 and ~0.36, print black ~0.055 and white ~0.93, S-curve, halation on highlights, uneven density, flicker, gate weave with occasional perforation jumps, broken vertical scratches (white = scraped emulsion, dark = dirt on the negative), brown burn creeping from the edges, vignette, two-octave silver grain; then dust, a hair in the gate, a rare blotch.
- **Frame**: 1440×1080 in the centre of 1920×1080, a rounded aperture with a soft dark rim; velvet drapes at the sides lit by the screen's spill and by footlights. Curtains can part and close.
- **Figures**: realistic proportions (7.5-head adults, ~5-head children) on a 2.5D rig (joints solved in 3D, projected with a yaw), silent-era make-up (pale skin, dark lids and lips); identity by silhouette marks (a hat, a garment, a tool).

## 配色

- **Monochrome silver**, tinted only by the print: colder and harsher (more damage, less sepia) when things go wrong, warmer and cleaner when the film turns tender. Tint and damage are mood controls, set per section.
- Values carry everything: dark clothes against pale walls, pale faces against dark interiors; check every shot as a thumbnail.
- **One colour, at most**: an element drawn into a separate colour mask keeps its hue through the print (still getting grain, flicker, vignette). Use it for the single thing the film is about, or not at all.
- Period tinting of whole scenes (amber for day interiors, blue for night, rose for romance) is a valid alternative to sepia; one tint per section.

## 字体

- **The intertitles are the subtitles**; the `.srt` lists their text. A card holds 2.5–3.75 s (≥ max(1.8 s, reading time + 0.6 s)).
- A black painted card with a deco border whose ornament follows the emotion: one heavy rule for a shout (the text shakes), a double rule with stepped corners and fans for narration, vines and small flowers for tenderness.
- Period faces (OFL): a small-caps display serif (e.g. Playfair Display SC) for titles and shouts, an italic old-style serif (e.g. Old Standard TT Italic) for narration and dialogue.
- A few words per card; three to five cards in a short film. A card never explains what the picture already shows.

## 运动

- **Hand-cranked sampling**: character and camera motion sampled at 16 fps (18 or more to undercrank a fast scene); flicker, weave, grain and scratches change every output frame (24 fps). That mix makes it look projected rather than merely low-frame-rate.
- **Speed is an emotion**: undercrank chases and panic (faster motion, faster flicker); return to 16 fps and a calmer print for tender scenes.
- **Deadpan performance**: the face barely changes; the body acts (crouch before effort, held poses, the two-frame snap of a double take, hands on knees). Objects act too (a wobble before a fall, a ritardando to rest).
- **Keyframed, eased poses**; only deliberate gags snap.

## 画面怎么活

动作采样为16fps；片面闪烁、门片摆动、颗粒与划痕在24fps输出中持续变化。主动作与印片纹理采用不同帧率层次，不能概括成静态风格。

## 镜头语法

A vocabulary, not a route. The period camera is heavy: most shots are locked. Opening and ending come from the topic.

| Move | What it expresses | Can serve |
|---|---|---|
| Locked-off extreme wide | cause and effect seen whole; the wait is the joke | a mechanical gag; a crowd; an elaborate process |
| Locked full shot | the premise in one frame | a character's routine; a confrontation |
| Tracking shot with foreground passing | pursuit; momentum | a chase; a race; a delivery against the clock |
| Iris in / out | attention on one thing; a beginning or end of a thought | an object; a face; a memory |
| Half-open iris, held | a character sharing a look with the audience | a wink; a secret; complicity |
| Slow motivated push-in | tenderness; realisation | a kneel; a letter read; a decision |
| Masked shot (keyhole, binoculars) | point of view; spying | a detective; curiosity; romance |
| Split screen / double exposure | trickery; dream; two places at once | a phone call; a ghost; a daydream |

Framing: wide and medium shots; big close-ups of rigged faces look like mannequins, so keep any close-up small or inside an iris. Transitions: iris, fade to black, straight cuts, the curtain. No dissolves between shots of the same scene, no modern whip pans.

## 声音调色板

- **The instrument is the sound design**, as in a picture house: an upright piano (optionally a reed organ, theatre organ, violin or small ensemble) plays every event. Mickey-mousing vocabulary (options): chromatic creep in the bass (sneaking), grace note (a wink), forearm cluster (a crash), swelling diminished tremolo (a wait), low rumbling tremolo (a storm, a machine), "plink … plonk" (emptiness), diminished sforzando (a shock), rolled chord (a door, a reveal), descending glissando (a fall), low "boing" (a bounce), nervous trill (hesitation), minor second (something breaking).
- **Photoplay idiom**: stride left hand, music by mood section in the manner of cue sheets (Hurry, Misterioso, Agitato, Tenderly, Maestoso), a theme that returns changed. Original music only.
- **No foley, no voice.** **The projector is the ambience**: lamp click, motor spin-up, claw-and-motor purr, film flapping on the take-up reel.
- **Silence**: the music stops and the projector alone remains; it frames a held moment.
- **Mix**: tame piano hammer transients with light compression before loudness normalisation (−14 LUFS). Grain goes in the picture (mux grain 1).

## 原生手法

A menu: use the ones your story needs.

- **The chain in one take.** A triggers B, B leaves the frame, the audience waits, B returns and hits C. *Fits content like:* a supply chain gone wrong; how a rumour spreads; a Rube Goldberg invention.
- **The near-miss.** A hand closes exactly where the object was a frame ago. *Fits content like:* catching a bus; a startup missing a deal; a goalkeeper.
- **The intertitle twist.** A card reframes the next shot in a few words. *Fits content like:* "Meanwhile, in the lab…"; "The machine had other ideas."; a statistic as a punchline.
- **Undercranked chaos.** Speed and damage rise together. *Fits content like:* rush hour; a kitchen at dinner service; a stock crash.
- **Iris on the look.** An iris stops half-way so a character can glance at the audience. *Fits content like:* a product winking; a cat that knows; a scientist's secret.
- **Redrawn footage.** Real video pushed through the ink pass becomes a period drawing. *Fits content like:* a company's archive; a family film; a sports clip.
- **The echo gesture.** A gesture from the start repeated by someone else with a new meaning. *Fits content like:* a teacher and a pupil; a handover; a tradition.

## 变化空间

You decide the genre (comedy, melodrama, adventure, newsreel), the characters, the gag or the drama, the cards, the tint plan, the opening and the ending. All far from our demo:

- Structures: **a newsreel** (a sequence of "reports" with headline cards and a narrator card between them); **a melodrama in three reels** (each reel a tint: amber, blue, rose; a villain card, a rescue); **a trick film** (Méliès-style: one stage, a magician, objects appearing and transforming by substitution cuts).
- Openings: **mid-chase**, the film already running and scratched, no title yet; **a single intertitle question** before any image; **the projectionist's view**: the beam from the booth, then the screen.
- Endings: **the film breaks** (the print burns through and the lamp shows white); **a final card that addresses the audience** directly; **fade to black on a locked wide** with the piano holding one chord.



## 坑

- **Too much content kills a silent film**: a many-step chain at small figure scale is noise in a thumbnail. One legible chain with a pause in the middle beats three busy ones.
- **Puppet arms**: apply abduction before flexion, let the shoulder rise and swing forward as the arm goes up, slim the torso's shoulder corner on the raised side, hide the arm's contour where it lies over the torso. Raise arms sideways (or turn the figure) so they don't cross the face.
- **Pose pops**: drive every figure by eased keyframe lists, never by `if` branches.
- **Floating props**: hold a prop between the palms at the depth between the arms; tie a rolling object's rotation to distance (angle = distance / radius).
- Brow angles flip with facing direction: check expressions in a crop at final size.
- An iris must track its target in film coordinates after any camera zoom.
- A grab must put the hand exactly where the object is at the beat, or it doesn't read.
- Closed curtains lit only by a dark screen go pure black: add footlights.
- Heavy grain makes huge files → re-encode with `-tune grain` at a higher CRF.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L53_1920s 默片.md`；Lemo-Opuscar 来源库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留来源关于本质、材料、颜色、文字、运动、相机、声音、原生动作、陷阱和变化空间的具体方法；新增的辨识信号逐项对应来源正文。按受保护的 `_template.md` 结构重排，并删除演示片故事、演示片标题及其专属叙事信息。
- 与已有风格的边界：与 original:copperplate-engraving 相邻但不等同：本条把刻线/淡洗作为整片手绘电影的图像处理，另有门片、银幕、字幕卡、帧率和影院钢琴。与新增 newsreel-1920s 相反，本条无旁白与真实档案剪辑。
- 证据状态：方法依据是上述来源文字；来源配套预览只作为静态图像保留，不能证明连续运动、作者实现算法或本地复现效果。本条不声明已检查来源视频或完成本地渲染验证。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
