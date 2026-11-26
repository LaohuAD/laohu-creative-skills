# 节拍象形图形目录片（pictogram-motion-catalogue）

> 一句话：圆头几何人、分行移位的方格图案和双语大字组成卡片目录，动作与切点锁在同一拍格。

> 来源参照（只学语法）：
> A beat-locked flash-card film built from three things only: a **square-grid "core graphic"** of circles, half-discs and tiny patterned cells whose rows slide past each other; **geometric pictograms** made of round-capped bars and a disc head; and **bold bilingual type** that slides up out of masks. Every cut lands on a drum hit.
> References (grammar only): Otl Aicher's 1972 Munich pictograms (geometric athletes); multi-sport-games "look of the games" identity systems (a modular pattern + a colour set used for everything); Swiss sports-broadcast graphics (mono meta text, tick-bar progress). Learn the grammar; never copy any real event's pictograms, emblem, slogan, pattern artwork or colour names, and never name them in the film.

## 本质 / 不是什么

A **catalogue film**: N items (products, dishes, steps, species…) shown one card at a time, fast, on the beat. Each card = **one pictogram doing one action + a huge title + a second-language line + a mono index "07 / N"**. Cards group into chapters; each chapter owns one hue, opened by a full-bleed pattern card.

What makes a frame read as this style at a glance:
1. **The grid pattern**: big discs and half-discs spanning square cells, about half the cells carrying a small motif, all in **five tones of one hue**, with **whole rows cut and shifted sideways**: the signature that drives backgrounds and transitions.
2. **The pictogram figure**: flat, faceless, rounded bars and a disc head; far-side limbs mixed toward the background. Props are discs, rings, capsules, lines.
3. **Type as architecture**: a 900-weight grotesk title set very large, a heavy second-language line under it, small mono meta text in the corners like a broadcast HUD.
4. **Beat lock**: every shot starts on a beat, every key action lands on a beat.

Mood: premium broadcast identity; flat colour, light grain, one soft light sweep as the only gradient.

Not an isometric infographic (no depth, no 3D), not Swiss motion graphics (the figure and the pattern carry as much as the type), not a cartoon (figures never emote, have no faces), not a data film (numbers are labels, not charts).

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适合的主题 |
|---|---|---|
| 方格图案 | 圆、半圆与小图案落在正方格中，整行按格宽横移。 | 章节卡、目录背景 |
| 五阶单色纹样 | 同一色相的五个明度承担背景、纹样和前后层。 | 分类、主题章节 |
| 圆头条形人物 | 人物由圆头和圆端条形肢体组成，表情保持中性。 | 动作目录、流程、运动 |
| 分栏舞台 | 文字栏与人物舞台分开，人物不能压住标题。 | 双语卡片 |
| 双语标题层级 | 大标题、第二语言和角落等宽元信息各自有固定层次。 | 目录、产品分类 |
| 章节色 | 一章使用一种色相，章节开卡的图案对比提高。 | 类目、步骤 |
| 动作落拍 | 镜头起点和人物关键动作都落在整数拍。 | 动作演示、节奏目录 |
| 动作卡片长度梯度 | 普通卡一小节，相关子项可按半小节加速，不能靠随意改速度。 | 清单加速、过程展示 |

列出的信号均可在来源正文中定位；每支按主题挑 2–3 个，至少一个避开最常见组合，不把信号全部堆在同一支片子里。

## 这个风格最俗的版本

来源没有给出一套可跨主题复用的固定俗套组合，因此不补造。风格特征与明确排除项保留在上面的本质说明中；具体故事、时间线和段落仍按新主题重新设计。

## 适配

- 用途：需要快速展示一组物品、步骤、地点或类别，并由章节颜色帮助归类的目录片。
- 内容：只借用下方可复用媒介规则；人物、故事、事实、镜头顺序和时长按本片目标重新设计。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

来源实现示意：

In `demo/`: `engine.js` (`G.pattern`, `G.motif`, `G.joints` / `G.drawFigure`, `G.keyPose`, `G.maskText`, easings), `poses/base.js` (pose contract, props `G.P`), `edl.js` (edit list in beats), `scenes.js` (layouts, transitions, HUD, motion blur), `lab.mjs` (pose sheets), `music/music.py` (picture-locked score with onset report). API table, pose convention and a minimal example: upstream demo engine reference.

## 材质与渲染

- **Flat Canvas2D**, rendered clean; grain only at mux time. **One square grid** (cell ≈ 1/6 of the frame height) rules bands, transitions and walls.
- **Pattern model**: fill with a mid-dark tone; on grid nodes randomly place cell-radius discs in random tones and discs-with-inner-discs; then a fraction of cells get one motif from a library of generic geometry (quarter-discs, fish-scale waves, dot and triangle scales, concentric arcs, sun wheels, checkers, crescents…), rotated by multiples of 90°; never mascots, landmarks or logos. Draw it wider than the screen so any row can shift one cell.
- **Figure model**: unit = body height, origin at the hip; draw far limbs (mixed ~40 % toward the background), torso, near limbs, head. A second person sits behind, mixed further (~60 %).
- **Stage**: the figure stands on a large **sun disc** in a neighbouring tone, crossed by one faint light sweep.
- **Figure environments** (water, nets, ramps) live in the figure's own buffer, masked to zero before the text column.

## 配色

- **A set of five hues + one dark neutral**, each hue in **five tones** (darkest → lightest, the middle one is the base). A chapter = one hue; a multi-hue chapter rotates through the set per card.
- Under type the pattern runs at **low contrast**; on chapter cards at **full contrast**.
- **Light hues take dark type and dark figures**, and their disc uses the lighter tone; dark hues take cream. On the dark neutral, the disc uses a lighter tone or it vanishes; its accent is one warm hue.
- One cream and one ink serve every hue. No outlines, no highlights except the sweep.
- Choose the set from the topic. Examples: warm festival (red, violet, forest green, gold, ochre); coastal (navy, teal, coral, sand, sky); kitchen (tomato, basil, saffron, aubergine, flour cream). Invent names for your hues; never borrow an event's colour names.

## 字体

- Title: a 900-weight grotesk (e.g. Inter Tight), 150–330 px at 1080p, tight tracking, auto-fitted. Second language: a heavy face under it. Meta: a mono (e.g. DM Mono) ~22 px, wide tracking; tags as mono chips.
- **HUD** on every card: mono corner text and a **progress bar of N ticks** (current tall, done dimmed, rest faint), N derived from the item list.
- **Bilingual rule**: one language is always the big title; the second language is chosen per version by a switch, never by hand-editing cards.
- The card type *is* the text layer. With narration, captions are a mono line on a solid band in the chapter hue, bottom, never over the title; hold ≥ max(1.8 s, speech + 0.6 s). A card that must be read (a spec, a number) holds ≥ 1.6 s.
- Deliver an `.srt` of the title cards, generated from the edit list.

## 运动

- **A grid of time**: pick one tempo for the film; every shot starts on a beat and every key action in a pose (release, contact, landing) lands on an integer beat.
- **Pace ladder**: normal cards last one bar; related sub-items become half-length rapid-fire runs. A second tempo comes from dividing the beat, never from changing tempo.
- Easing: exponential ease-out for entrances, exponential in-out for whips and wipes; a back ease once at most.
- **Type enters by mask slide-up**: title first, second line ~0.08 s later, tag after; meta lines type on without a caret. Short cards compress all timings.
- **Figure assembly**: the figure arrives as horizontal bands sliding into register from alternating sides.
- **Backgrounds breathe**: rows drift in alternating directions; on chapter cards they jump a quarter-cell on beats.
- **Transitions** snap to the grid: sliding rows, dropping columns, a push, quarter-discs from cell corners, an iris from the last figure, a tile flip. Rotate them; each lasts a few frames around the cut.
- **Motion blur only where things move**: sub-frame averaging inside transition and whip windows; static frames render once.

## 画面怎么活

背景行按来源交替漂移，章节卡可在拍点跳动四分之一格；人物动作与字幕显现继续承担主节奏。这里的纹样运动是来源明确规则，不将其改写为以静为主。

## 镜头语法

Mostly a locked flat frame; energy comes from row shifts, transitions and figure actions. When the camera moves, it moves along the grid. Opening and ending come from the topic.

| Move | What it expresses | Can serve |
|---|---|---|
| Locked flat frame | clarity, the card as a poster | any item; a spec that must be read |
| Lateral track with a one-screen whip per beat | one continuous family, momentum | a line of stations; a production line; a route |
| Slow drift along a row | calm, browsing | a gallery; a menu; a slower chapter |
| Vertical scroll by grid rows | ranking, depth, descent | a top-ten; floors of a building; ocean depths |
| Push into one motif cell until it becomes the next frame | zooming into a part | an ingredient inside a dish; a city inside a map |
| Pull back to a tiled wall of items | the whole set at once | a summary; "all of them"; a comparison |
| Tiles collapsing to one point | many become one | a merger; a shared goal; a count reaching zero |
| Split screen along a grid line | two items side by side | versus; before/after; two versions |

Framing: text and figure never overlap (one text column, one stage); horizontal poses move the stage outward. The HUD stays in the corners. Allowed transitions are the grid ones in §5; never dissolves, 3D camera moves, handheld shake or depth of field.

## 声音调色板

- **Type and music can carry the film alone**; a voice is optional, calm, one line per chapter at most.
- **Percussion is the spine**: choose a drum family that suits the topic (frame drums, taiko, marching snares, steel pans, body percussion, an electronic kit) plus rim clicks, claps, shakers and crashes.
- Colour instruments on top: Karplus-Strong plucks (any lute, koto or harp-like voice, with pitch bends), mallets (marimba, glockenspiel), detuned-saw chord stabs, a synth bass, pads, risers and a drone.
- **Per-family accents**: every shot onset gets a hit chosen by chapter (a splash, a pok, a clank, a crack, a whoosh, a sizzle): foley reads the chapter's matter.
- **Picture-locked by data**: the score reads the edit list's shot times and places accents there; check every onset to ±15 ms.
- **Silence as a tool**: half a beat of drums-and-bass-muted before a big hit, or one whole bar stripped to a single ticking sound under a count.
- Mix: glue compressor and limiter, −14 LUFS, ≤ −1 dBTP.

## 原生手法

A menu: use the ones your film needs.

- **One card = one item.** The count is the hook ("ALL N"). *Fits content like:* every tool in a workshop; every station of a subway line; every dish of a regional cuisine.
- **Chapter = colour.** Families become hues so the viewer always knows where they are. *Fits content like:* instrument sections of an orchestra; food groups; departments of a company.
- **One verb per item.** One body action readable in a bar, or a prop action (a gear turns, a cup pours). *Fits content like:* yoga poses; kitchen techniques; jobs on a construction site.
- **Pace ladder run.** A sub-family at double speed. *Fits content like:* four knife cuts; the bones of a hand; weekday routines.
- **Long take down a track.** Stations one screen apart, the camera whipping on each cut. *Fits content like:* the steps of a recipe; checkpoints of a marathon; stages of a rocket launch.
- **Count-up slam.** A big number rolls to its value on a bar. *Fits content like:* tonnes recycled; members of a club; years of a company.
- **Icon wall.** All pictograms return as a grid and turn one colour. *Fits content like:* a summary of a year; a periodic table of habits; a team roster.

## 变化空间

You decide the items, grouping, verbs, palette, chapter order, any long take, the pace ladder, opening, ending, music and voice. All far from our demo:

- Structures: **a countdown** (items ranked from N to 1, the camera scrolling down rows, the pace speeding up as the list shortens); **a day in pictograms** (one figure, one card per hour, the palette moving from dawn to night hues); **an assembly** (each card adds one part to a single growing pictogram machine seen in the corner).
- Openings: **a single motif cell** (one cell fills the frame and splits into the grid); **mid-action** (the first pictogram is already running when the type slams in); **a blank grid** (hairlines draw the grid on the beat before any colour appears).
- Endings: **one card held long** (the last item stays while the pattern rows stop, one by one); **the figure walks off** (the last pictogram exits the frame and the HUD ticks out); **reverse assembly** (the grid disassembles into rows that slide off-screen, leaving cream).



## 坑

- Figure environments spread into the text column → render the figure layer into its own buffer and fade it out with a gradient mask before the text.
- Cream on light hues fails contrast → dark type and dark figures on light hues; their disc is the lighter tone.
- The sun disc vanishes on the dark neutral → use a lighter tone for it.
- Pattern canvases are large and seeded per card → cache with a bounded LRU; an unbounded cache runs out of memory with parallel renderers.
- Horizontal poses (swimming, lying, crawling) cross the title → move the stage outward and narrow the text column.
- Imitating a real identity too closely → your own palette, mark and slogan from the grid motifs.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L38_象形运动图形.md`；Lemo-Opuscar 来源库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留来源关于本质、材料、颜色、文字、运动、相机、声音、原生动作、陷阱和变化空间的具体方法；新增的辨识信号逐项对应来源正文。按受保护的 `_template.md` 结构重排，并删除演示片故事、演示片标题及其专属叙事信息。
- 与已有风格的边界：区别于 original:isometric-infographic：不使用等距空间或数据管线；也区别于 original:swiss-editorial：人物图标和图案与排版同样重要。
- 证据状态：方法依据是上述来源文字；来源配套预览只作为静态图像保留，不能证明连续运动、作者实现算法或本地复现效果。本条不声明已检查来源视频或完成本地渲染验证。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
