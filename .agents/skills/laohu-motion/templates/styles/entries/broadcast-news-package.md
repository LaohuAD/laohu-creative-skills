# 电视新闻包装（broadcast-news-package）

> 一句话：A broadcast package organizes headlines, facts, maps and story footage through a consistent on-air graphics system.
> 参照（只学语法）：References (grammar only): evening network news headline menus, financial-channel market graphics, European news channels' explainer maps, tech-desk spec cards. Never copy a broadcaster's logo, set, fonts, colours, music or idents, and never name them in the film.

## 本质 / 不是什么

1. **One package system, used consistently.** Every graphic is built from the same few parts: a brand plate (parallelogram), a tab in the accent colour, a paper strap, ink cards with an accent top edge, mono datelines, stamps. Viewers read the system before they read the words.
2. **The bulletin's order.** Sting → rundown (a short rundown of the items) → item → item → … → back to the rundown, ticked off → sign-off. Each item opens with its category on the strap's tab and its date on the first graphic.
3. **One fact per screen.** A full-frame graphic states one thing: the price, the break, the two stocks, the place, the two letters, the quote, the verdict.
4. **The strap holds the headline.** One lower-third strap is on screen from the first story to the recap and changes its words with a vertical flip; the picture above it is free for the graphic.
5. **Clean panel.** No crawl, no burned-in subtitles; subtitles ship as a separate `.srt`. The frame is the graphic, the strap, the bug and a source line.

Not **Caption News** (that is captions-first social video: huge slammed captions are the lead, no rundown, no strap; here type is small and orderly and the graphics lead). Not **Data Storytelling** (one chart per beat, never a dashboard; the chart is an insert in a bulletin). Not a keynote: no centred title-and-bullets, no page turns. Not a studio show: no virtual set, no anchor, no fly-throughs — the package is flat graphics over ink.

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适配主题 |
|---|---|---|
| 120 BPM grid | , beat 0 at the end of the sting (1.5 s). Every cut and wipe on a beat or half-beat. | 新闻快讯、周报与事实摘要。 |
| Shot lengths | sting 1.5 s; rundown 4–5 s; story shots 3–7 s; a map long take (6–12 s) as the bulletin's breath; a comparison stays until every item has been fully on screen ≥ 2.5 s. | 新闻快讯、周报与事实摘要。 |
| A package action every 0.5–1 s | inside a shot (flip, count, stamp, tick, strap change, map light, line step). No frame flat for more than 1 s; a strong action within 0.5 s of every cut. | 新闻快讯、周报与事实摘要。 |
| Date every story | a weekly bulletin's items happen on different days; the date sits in the rundown row, the eyebrow line, the readout or the document. | 新闻快讯、周报与事实摘要。 |
| The order inside an item | what (the name or the number) → how big (the line, the bars, the price board) → who it hits or who said it (bars, documents, a quote) → the verdict stamp. | 新闻快讯、周报与事实摘要。 |
| Package left behind. | If the strap, source line or tags are drawn once on top of everything, a wipe changes the picture under yesterday's headline and the strap catches up 0.3–0.5 s later. Draw them per picture, inside the wipe's clip. | 新闻快讯、周报与事实摘要。 |
| Leftover layout. | Removing subtitles or a crawl without moving the content down leaves a dead band above the strap. | 新闻快讯、周报与事实摘要。 |
| Masked type peeking in. | A push-in title clipped by a mask shows its top edge before it moves if the travel distance doesn't clear the mask; start it fully below and don't draw at progress 0. | 新闻快讯、周报与事实摘要。 |

列出的是来源正文中的可复用媒介信号；不是固定元素清单。每支按主题选择 2–3 个，其中至少一个避开最常见组合。

## 这个风格最俗的版本

- 来源正文未给出一套固定的俗套画面、配色、配器或开场结尾组合，因此不补造。相邻风格边界与明确排除项保留在「本质 / 不是什么」。
- 每支片子按主题从来源信号中挑 2–3 项，并在 brief 的 style 栏说明保留或改动了什么；故事、数据、构图与时间线重新设计。

## 适配

- 用途：新闻快讯、周报与事实摘要。
- 内容：以当前项目真实素材和用户目标决定是否适配；只借用下方通用媒介规则。

### 新闻事实、素材与署名

画面事实和旁白优先回到机构公告、公司原始页面、交易数据或正式演讲；若信息仅来自媒体报道，明确归因，避免把报道推论写成已确认事实。真实影像、文件截图、数据图与重绘示意分别标明身份；示意图不得冒充实拍、真实产品或现场操作。素材来源、许可、事实依据和片尾署名依项目现有流程处理。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

来源正文没有指定可核验的 Canvas、DOM、WebGL 或 Three.js 工程实现；它给出的是包装组件、画面结构和运动规格。

## 材质与渲染

| Zone | Position | Content |
|---|---|---|
| Content | x 96–1824, y 56–840 | the full-frame graphic; when a strap is up, nothing important below y 840 |
| Lower-third strap | tab x 96 y 856, 48 high; strap x 96 y 904, 1250×104, + 120 px ink end block | category tab (accent, ink text, Chinese + English), headline in Chinese 50 px + one English line 27 px |
| Source line | right-aligned at x 1836, y 950 / 978 | `SOURCE: …` mono 13 px + Chinese 16 px, 75 % opacity; English ≤ 36 characters or it slides under the strap's end block |
| Channel bug | top right, plate centre (1739, 86), 0.327 of the sting plate | the plate plus the fictional channel name |
| Corner tag | top left x 96 y 56, 330×64 | `ILLUSTRATION / 示意 · AI 生成画面` on generated plates, `SCHEMATIC / 示意图` on schematic charts; flips in and out 0.2 s |

Content layers sit lower than a subtitled layout would put them (a 60–110 px downward shift) so the bottom strap does not leave an empty band above it. When you remove subtitles and the crawl, re-lay the page; never leave the space they used.


### 来源包装组件规格（源文完整记录）

下列模块来自 L8 的一套包装方案，说明同一品牌板、新闻条、来源行和组件间承接方式。节目题材、具体图表和事件型组件按本片内容重新选择，不作为固定新闻脚本。

| Part | Spec | Rules |
|---|---|---|
| Sting | 0–1.5 s | two accent slashes (0.04, 0.10 s) → the plate slams in with an overshoot, an impact ring and shake (0.16–0.42) → letters drop in one by one → wordmark and dateline open from the centre → a glint → the plate flies to the top right and **becomes the bug** while a vertical band wipes into the first shot. A hit within 0.4 s |
| Brand plate | parallelogram 520×180, accent gradient, ink and gold bars at the left, name in condensed 800 | the same object is the sting, the bug, the desk front and the end card |
| Rundown | left: date block (big numerals, month, week); right: three rows, 1024×140, number block in accent | rows flip in vertically on the beat (back ease) with a glint; at the close the same object returns and each row is ticked |
| Lower-third strap | see §2 | enters with the first story, flips (new words up from below, old up and out, 0.32 s; the tab flashes white when the category changes), leaves with a slide when the recap starts. A **profile** version (tab `人物 PROFILE`) names a speaker |
| Split-flap board | tiles 220×130, top and bottom halves clipped separately | old value and new value on the same board, so the change reads in one look; ×2 / +x % called out to the right |
| Threshold chart | line from the peak, the threshold as a dashed gold line | the line head advances one trading day per step; the last step crosses the threshold in accent with a shake and a ring; the readout panel slides in after; axes show only what the data supports |
| Bars | grow from a zero line downward for losses, values roll | a reference line at the shared threshold plus a badge |
| Explainer map | the same projection, one long take | members light in order of distance from the city; the city label, the institution label with leader, a stamp; the camera pushes, then pans to make room |
| Documents | 380×490 paper, ink header | fly out of the city dot on an arc (0.5 s, scale 0.08 → 1, rotation settles); check boxes tick on the voice's key words |
| Quote card | ink background with the package's light streaks, a large accent quotation mark lands first, lines push up one by one (0.18 s apart), then the Chinese gist, a gold rule, name, occasion and date | the official wording, in the language it was said; never paraphrase inside quotation marks; an underline sweeps the key word as the voice says it |
| Spec card | eyebrow (source · date), the product name pushed up from a mask, a category stamp, proportion bars on one scale (the whole vs the part, values rolling), a percentage badge, a context chip; a second group on the right for the hardware or the place, filling cell by cell, joined by a bracket to its total | one scale for every bar, so the proportion is true; every number from the source page |
| Stamps | accent fill or ink with a double accent frame, −6° to −10° | land from 1.9× in 0.16 s with an expanding ellipse; one per story at most |
| Transitions | vertical band wipe (accent 84 px + ink 5 px + gold 14 px edge, 0.3 s) between stories and programme parts; hard cut + timpani inside a story; slanted wipe into the end card | nothing else: no dissolves, no 3D flips, no page turns, no fly-throughs. **The package layer travels with its picture**: under a wipe each side draws its own strap words, tab, source line and corner tag (old state on the old side, new state on the new side), so the band brushes the headline over; on a hard cut they change on the same frame. Strap words never flip or overlap. The incoming picture's entry animation starts under the band, so its first revealed frame already has content |


### 来源画面层与调色方法（源文完整记录）

以下图像来源标记、画面处理和素材放大边界均来自 L8 源文；具体资源须另行核对授权与用途。

- When there is no footage, the picture layer is data graphics drawn in code plus, at most, a few **illustrative plates** (generated or stock), each tagged `ILLUSTRATION` for as long as it is on screen. They set a mood (a contextual background behind a product or a data comparison); they never stand in for the event, the place or the people.
- One grade for every plate: greyscale → auto black/white points (0.5 / 99.6 percentile) → γ 1.05 → 35 % S-curve → black 8, white 232 → duotone `#0E1013` → `#ECE7D8` (`tools/prep.py: grade()`), plus a left-dark ink gradient for type, a 50–55 % vignette and 7 % overlay grain cycling through six tiles. Graphics and the package are never grained.
- Real footage, if you have it, takes the same grade path; modern footage ≤ 1.5× scale, archive ≤ 2.5× after deblocking; crop out station logos.

## 配色

| Role | Value | Use |
|---|---|---|
| ink | `#121417` | backgrounds, panels, strap end block |
| ink2 / ink3 | `#1B1E23` / `#22262C` | cards, land on maps |
| accent (lemon) | `#F2CF1D` (light `#F8DE4A`, dark `#D8B30C`) | plate, tabs, band wipe, bars, stamps, the line that breaks |
| gold | `#D4B064` | thresholds, datelines, source lines, light fins, badges |
| paper | `#F4F1E8` | strap, documents, the chart line |
| breaking | `#FE6B3D` | only for BREAKING and LIVE. A weekly round-up has neither, so it never appears |

Structure to keep when you change the brand: one accent + one gold-like secondary + paper + ink, and a reserved alarm colour. Ink text on the accent; on paper, English secondary lines in a dark olive (`#6E5A1E`) because gold is too weak there.

## 字体

- Chinese: Noto Sans SC 900 (headlines, strap) / 700 (labels).
- Latin: Barlow Condensed 800 (numbers, names, the plate), 600 (secondary lines, quotes), 600 italic (the end-card English title).
- Mono: IBM Plex Mono 500 for datelines, sources, axis labels, all caps with 1–4 px tracking.
- All OFL, subset from Google Fonts by `tools/fonts.sh` (the character list is read from `main.js`; delete `fonts/*.woff2` after a text change). No handwriting faces in this style.
- Every label is bilingual on one line each (Chinese first, English smaller); never wrap.

## 运动

- **120 BPM grid**, beat 0 at the end of the sting (1.5 s). Every cut and wipe on a beat or half-beat.
- **Shot lengths**: sting 1.5 s; rundown 4–5 s; story shots 3–7 s; a map long take (6–12 s) as the bulletin's breath; a comparison stays until every item has been fully on screen ≥ 2.5 s.
- **A package action every 0.5–1 s** inside a shot (flip, count, stamp, tick, strap change, map light, line step). No frame flat for more than 1 s; a strong action within 0.5 s of every cut.
- **Date every story**: a weekly bulletin's items happen on different days; the date sits in the rundown row, the eyebrow line, the readout or the document.
- **The order inside an item**: what (the name or the number) → how big (the line, the bars, the price board) → who it hits or who said it (bars, documents, a quote) → the verdict stamp.

## 画面怎么活

- 来源以每 0.5–1 秒一次的包装动作组织镜头，长地图镜头和比较画面则留作可读的呼吸段。
- 日期、标签和计数只在各自信息更新时翻换；没有连续新闻爬字或待机动画设定，不额外加入。

运动与循环描述来自来源文字 / 实现说明；本地尚未独立逐帧复现或核验，不作为本地渲染验证。

## 镜头语法

| 镜头运动 | 表达什么 | 适合哪类内容 |
|---|---|---|
| 地图长镜头内推近并平移，为新标签和机构名称腾出空间 | 让地域关系在同一镜头中展开 | 城市、机构与地区影响关系 |
| 文件从地图城市点沿弧线飞入版面，落地后勾选 | 把文件来源和发出地点连成视觉因果 | 公告、报告、公开信 |
| 产品或方案卡片从遮罩后推入，再以比例尺说明整体与局部 | 先识别对象，再看组成和指标 | 产品发布、方案比较 |
| 竖向色带擦换节目板块；新闻条随画面一起换状态 | 明确切换段落并避免旧标题压在新画面上 | 周报、栏目、多个新闻条目 |

来源明确要求整片保持平面图形包装；不以 3D 飞行镜头或虚拟演播室代替板块运动。

## 声音调色板

| Layer | What | Level |
|---|---|---|
| Anchor voice | one narrator, one sentence per graphic, starting 0.1 s after the cut; HP 90 Hz, 3:1 compression. Default: the library's Kokoro (`core/tts/tts.py`, free, Apache 2.0) in English or Chinese. The user's own recording, or another TTS they have a key for (a user-selected TTS service), replaces it — never required | music ducked ≈ −7 dB and its 1.2–5 kHz band thinned under speech |
| News theme | 120 BPM, minor key: spiccato violins in root–fifth–octave eighths, pizzicato bass on the beat, horn pads, a low-passed 16th-note saw pulse, kick on 1 and 3, snare on 2 and 4 | full under the rundown and the first story |
| Section moods | markets: violins down an octave, tremolo, four-on-the-floor kick (heartbeat); policy: pizzicato and horns only | |
| Signature hits | sting tutti; glockenspiel notes as the rundown rows land; timpani on hard cuts and story changes; one beat of silence before the biggest break, then the heaviest hit of the film; a held drone after the verdict stamp; a major-key lift for the last story; tutti on the end card | |
| Foley | whoosh on wipes, flap clicks on split-flaps, stamp thump + clack, trading-room ticks under market charts, map clicks per lit country, a sonar ping on a city, paper and typewriter ticks on documents, click + glockenspiel on ticks | |
| Room | server-room hum under a tech plate, soft air under maps | very low |

Master −14 LUFS, true peak −1.2 dB (`core/render/mux.sh`). Samples: VSCO 2 CE and VCSL (CC0); foley synthesised (`core/audio/sfx.py`).

## 原生手法

1. **Sting becomes the bug** — the brand plate slams in, then flies to the corner and stays there for the whole bulletin; opening and programme are one object.
2. **Strap tab = category** — the strap's tab changes category (模型 MODELS, 市场 MARKETS, 监管 POLICY …) with a white flash when a new story starts; no separate item cards between stories.
3. **Rundown, then ticked off** — the same list opens and closes the bulletin; at the end each row gets its tick.
4. **Spec card** — a launch reduced to its proportions: the whole and the part on one scale, then what it runs on, joined by a bracket to the total.
5. **Strap that never leaves** — one strap group from the first story to the recap; words flip, the strap itself never exits mid-programme.
6. **Split-flap before/after** — old and new value on one board, each tile flipping from the old to the new.
7. **Breaking the threshold** — a line advances one period per step towards a dashed threshold; the music stops for one beat before the last step and the crossing gets the heaviest hit.
8. **Date in the eyebrow** — every graphic's eyebrow line carries source and date in mono caps, so a weekly round-up never blurs which day each item happened.
9. **City sends the letters** — on a map long take, documents fly out of the sending city to their addressees; one world→screen function keeps labels and documents attached through push and pan.
10. **Quote card + verdict stamp** — the official's own words in type, with name, occasion and date; an underline on the key word as the voice says it; one stamp.


## 变化空间

Decide per film: the channel's name, plate and accent colour; how many items (one lead with a long package, three or four equal items, a five-item round-up); which full-frame graphics each item needs; where the long take goes; the anchor's voice.

- **Three structures:** rundown → items → rundown ticked (round-up); one lead package with a correspondent two-box and a short "also today" grid; a countdown of items (election-night, sports results).
- **Three openings:** sting → rundown; cold open on the biggest graphic, then the sting; sting straight into the first story with the rundown as a recap only.
- **Three endings:** rundown ticked → end card; a "coming up next week" teaser card; the last stamp freezing into the end card.

---


## 坑

- **Package left behind.** If the strap, source line or tags are drawn once on top of everything, a wipe changes the picture under yesterday's headline and the strap catches up 0.3–0.5 s later. Draw them per picture, inside the wipe's clip.
- **Leftover layout.** Removing subtitles or a crawl without moving the content down leaves a dead band above the strap.
- **Masked type peeking in.** A push-in title clipped by a mask shows its top edge before it moves if the travel distance doesn't clear the mask; start it fully below and don't draw at progress 0.
- **Words stronger than the source.** "Request for information" is not "investigation" or "penalty"; write "no fine, no case opened" or "for the first time" only if a source says so — and check the institution's own pages, which can contradict a report ("first requests" may have gone out months earlier).
- **Thresholds depend on the reference.** "Bear market" = −20 % from *which* high? Name the reference on the axis; from a different peak the claim can be false.
- **Attribute what only a report says.** When the official source does not name the companies, the graphic carries "据… 报道 / reported by …" and so does the voice.
- **A schematic posing as data.** Rolling counters on a close price flash values that never existed; set the close with a mask push instead. Don't label axes the data doesn't support.
- **Source lines under the strap.** Right-aligned mono 13 px: ≤ 36 characters.
- **Stamps over key words.** A stamp hit can mask the voice ("fines"); take the brass off the stamp and low-pass its clack.
- **Gold on paper** has too little contrast: use ink or dark olive.
- **Generated plates** carry stray corner marks: crop them in `prep.py`.
- **Short preview text.** Rundown rows are previews of the stories; `readcheck` flags them as short in the opening — they return in the recap and as straps, so accept the flag or leave them out of `TEXTS`.
- **Names in synthetic speech.** Spell brand names, model numbers and abbreviations the way they should sound in the TTS text (a respelling, a number written as a word, an abbreviation without dots) while the strap and subtitles keep the real spelling; when speech-to-text mishears an unusual name, put the expected transcript in the line's `asr` field instead of rewriting the line.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L8_电视新闻包装.md`；Lemo-Opuscar 来源库，仓库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `../licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留通用媒介、材质、镜头、声音、native move、坑与变化规则；按本地 `references/styles/_template.md` 重新编排；移除旧条目头部与专属示范片段。
- 证据状态：来源文字方法完整转写；配套预览仅为静态图，不能证明连续运动、作者实现算法或本地可调用实现。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
