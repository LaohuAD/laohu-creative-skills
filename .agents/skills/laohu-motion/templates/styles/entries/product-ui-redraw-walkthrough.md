# 产品界面重绘演示（非实机录屏，product-ui-redraw-walkthrough）

> 一句话：真实产品界面和功能状态被重绘成可控的演示画面，低分辨率角色沿界面行动；这是模拟演示，不是实机录屏。

> 来源参照（只学语法）：
> A product walkthrough that looks like a real screen recording, where a low-resolution mascot lives inside a high-resolution interface and acts out what the software is doing.
> References (grammar only):
> - **Screen Studio-style product recordings:** auto-zoom to the cursor, cursor smoothing, click push-ins, and a window floating on wallpaper.
> - **Apple "Guided Tour" videos:** real interface, calm narration, one feature per sentence.
> - **Duolingo and Headspace mascot motion:** squash and stretch, anticipation, a character that performs inside the UI.
> - **The Browser Company (Arc) launch films:** playful tone and fast cutting.
>
> Never copy their characters, UI, music or footage.
> 
> A walkthrough of a piece of software, typically 45–75 s. The user gives the product and the features; you decide the story, shots, choreography, sound and music.

## 本质 / 不是什么

The film looks like a **screen recording of the real product**, but it is not a recording. Every window, menu, diff line and button is **redrawn in 2D (HTML/CSS/SVG)**, so the camera can go anywhere, every pixel is controllable and text stays sharp at any zoom.

A **mascot made of big square pixels** lives in that high-resolution world. The clash of two resolutions, a hard-edged low-res sprite against anti-aliased UI, is the look.

The mascot is the software's agency made visible: when the software reads, it runs along the rows it reads; when it plans, it holds a pixel pencil; when it tests, it stomps the button.

**Two actors, never a hand:** the **cursor** represents a user action; the **mascot** represents software behavior. This is a redraw-based simulation, not a screen recording, screenshot or proof that a real user performed the shown steps. Use genuine capture when the deliverable must document actual product operation.

Not a dark tech keynote (no black stage, no invented abstract UI: this is the real product), not a pixel-art game (the world is hi-res vector UI; only the mascot and its props are pixels), not a real capture (nothing is a screenshot).

## 辨识信号：每支片子挑 2–3 个

| 信号 | 来源正文中的可见/可操作描述 | 适合的主题 |
|---|---|---|
| 重绘真实界面 | 菜单、模式、快捷键和内容来自真实产品并以HTML/CSS/SVG重画，不用截图。 | 软件功能演示 |
| 分辨率对照 | 高分辨率界面中生活着低分辨率像素角色。 | 产品工作流、工具演示 |
| 用户与软件双演员 | 光标代表用户，角色代表软件的行动能力。 | 操作与自动化 |
| DOM顶边落脚 | 角色只站在实际界面元素的顶边，位置由DOM几何逐帧测量。 | 列表、输入框、按钮 |
| 产品色彩守恒 | 界面严格遵守产品真实亮/暗主题，叠层保持中性。 | 可信产品介绍 |
| 屏内连续镜头 | 镜头像屏幕录制软件一样在窗口内移动，缩放不越出显示器。 | 连续工作流 |
| 动作导致真实状态变化 | 角色动作、光标操作和产品状态一一对应，避免无因装饰。 | 步骤演示 |
| UI内标题与克制叠层 | 标题作为实际界面元素出现；只保留章节、快捷键、字幕等信息层。 | 功能说明、发布演示 |

列出的信号均可在来源正文中定位；每支按主题挑 2–3 个，至少一个避开最常见组合，不把信号全部堆在同一支片子里。

## 这个风格最俗的版本

来源没有给出一套可跨主题复用的固定俗套组合，因此不补造。风格特征与明确排除项保留在上面的本质说明中；具体故事、时间线和段落仍按新主题重新设计。

## 适配

- 用途：软件功能 walkthrough、产品工作流与明确的操作演示；每个动作都必须对应真实界面状态变化。
- 内容：只借用下方可复用媒介规则；人物、故事、事实、镜头顺序和时长按本片目标重新设计。

## 技术路线

本节列出的源码文件/函数名用于定位来源工程的实现示例，不是本地 API；Motion 可按本片需要使用原生工具实现其中的视觉方法。

来源实现示意：

In `demo/`: `film.js` (timeline: VO at fixed times, every visual beat hung on a spoken word with `W(id, word)`, camera moves, `Actor` mascot segments, `Cursor`, sound events), `ui.js` (state → HTML for each interface), `clawd.js` (sprite grid, poses, pixel props: replace the sprite with your own mascot), `main.js` (light/dark layers, DOM anchor measurement, motion blur, HUD: captions, keys, pixel wipes, spotlight), `sound.py` (score, foley and VO from `events.json`, with ducking). The upstream demo also had build notes; those files are documented as source-project examples.

## 材质与渲染

- **Real UI, redrawn**: every label, mode name and shortcut matches the real product; no screenshots, no lorem ipsum. Demo content (code, data, test output) is coherent, and the app under test really changes.
- **Pixel grid is sacred**: the mascot, its props (pencil, "!", sparkles, heart, dust) and trails share one square-pixel grid with crisp edges. It scales with the camera; its position snaps to half-pixels, so its motion feels stepped.
- **Gravity = top edges of UI**: the mascot only stands on the top edge of a real element (input box, menu, list row, code line, button, status bar, the letters of a heading). Its position comes from **measuring the live DOM** every frame, never hand-placed coordinates.
- **Window on wallpaper**: the app floats on a desktop with a soft shadow; zoom never shows beyond the monitor.
- **Depth** only where it serves attention: rack focus (blur the pane that doesn't matter), a vignette spotlight. Never blur text the viewer must read.
- **Motion blur** is derived from camera speed and applied as an anisotropic blur on an **untransformed wrapper**, only on whips. Slow moves stay sharp.

## 配色

- The product's own interface colours rule: follow its real light and dark themes exactly.
- The mascot keeps the product's or brand's mascot colour, or one saturated hue that no UI element uses, so it finds the eye in any frame.
- Overlays (chapter pill, key HUD, captions) are neutral frosted glass; one accent at most, taken from the product.
- A theme switch can be a story event: the whole film may change state with it.

## 字体

- UI type follows the product (or licence-free look-alikes such as Inter, JetBrains Mono, a serif for editorial UIs).
- **Information layers only**: a chapter pill (01–04), a KeyCastr-style keystroke HUD, frosted-glass caption pills, an optional "▶▶ 4×" time-lapse tag. Nothing else overlays the screen.
- Captions sit in a pill at the bottom, never over the element being discussed and never under the mascot; hold ≥ max(1.8 s, speech + 0.6 s).
- A title, if any, is diegetic: it appears as part of the UI (an empty-state heading, a window title, a notification).

## 运动

- 30 fps; UI on ones; mascot position stepped to its pixel grid.
- **Mascot acting**: jumps with anticipation crouch, stretch on take-off, tucked legs, landing squash with a damped bounce and dust. Idle breathes (a tiny squash) on the score's beat and blinks irregularly. Walks by leg alternation, flipping the sprite for direction.
- **Eyes carry the acting** (neutral / left / right / up / down / wide / happy / shut / blink): they look at what matters. Arms: down / up (cheer) / wave.
- **Cursor**: smoothed, spring-eased paths, small push on click, never teleports.
- **Cause and effect**: every mascot action triggers a real UI state change; every user action is a cursor move, click or keystroke shown on the HUD.
- UI animates like the real product (its own menus, popovers, diff reveals); don't invent flourishes the product doesn't have.

## 画面怎么活

像素角色在等待时小幅呼吸并不规则眨眼；光标沿平滑弹簧路径移动，界面只在真实产品状态变化时响应。镜头和UI仍按来源连续工作流设计。

## 镜头语法

A recording-software camera: one continuous take inside the screen, zoom ≥ 1, cuts only under chapter transitions. Opening and ending come from the topic.

| Move | What it expresses | Can serve |
|---|---|---|
| Push-in to the cursor or caret | "this is where it happens" | typing a prompt; choosing a menu item; a setting |
| Slow drift at rest | the app is alive while we listen | a line of narration; waiting for a result |
| Whip-pan between panes (with blur) | cause here, effect there | sending a message → a result appearing; code → preview |
| Push-in + vignette freeze | the one promise to remember | a safety guarantee; a price; an undo |
| Rack focus between panes | attention moves, nothing else does | reading files; logs scrolling while chat waits |
| Pull back to the full window | the whole workflow in view | a summary; parallel tasks; before/after |
| Follow the mascot along a list | the software working through items | scanning results; a checklist; a migration |
| Split-window reframe | two things at once | parallel sessions; compare two versions |

Framing: the thing being discussed and its caption never overlap; the mascot never covers text to be read. Transitions: chapter pill wipes, pixel wipes, a theme reveal circle; never dissolves or screenshots.

## 声音调色板

- **Two resolutions in the music**: a hi-fi layer (piano, upright or electric bass, brushed or tight kit, glockenspiel, real samples) is the world; a chiptune square or pulse voice is the mascot. They can trade, duet or merge.
- Options: a low-passed "night" version of the band for a dark theme; a tom fill and crash at chapter seams; dropping the drums to build tension; the mascot's notes on words it lands on; a stereo split for split screens; a single held pad under a freeze.
- **Foley**: keyboard (a thock plus a click, human timing jitter), trackpad clicks, pane swishes, popup pops, notification chimes, CI ticks, a shutter for screenshots. Mascot steps, jumps and landings are 8-bit.
- **Silence**: a short drop to room tone before the key promise makes it land.
- **Voice**: calm, one feature per line; product names verified with whisper. Keep effects off word onsets. Duck music under voice; −14 LUFS.

## 原生手法

A menu: use the ones your walkthrough needs.

- **Match-cut origin.** The mascot is born from something already in the UI (a logo's block characters, an icon, a loading spinner) and climbs out, leaving an outline. *Fits content like:* a chat bubble turning into a guide; an icon becoming an assistant; a spinner becoming a helper.
- **Diegetic title.** The name appears as a real UI element; the mascot lands on it on a downbeat. *Fits content like:* an empty state; a new-project dialog; a welcome email.
- **Moving floor.** The mascot rides a caret, a popup, a sent message, a progress bar. *Fits content like:* a message flying into a thread; an upload bar; a drag-and-drop.
- **Time-lapse with a tag.** Long work runs at N× with a flashing tag and rack focus. *Fits content like:* indexing a library; a data import; a build.
- **Spotlight freeze.** Push in and vignette the one badge that holds the promise. *Fits content like:* "Saved"; "Encrypted"; "No charges until…".
- **The film changes state.** A toggle's effect escapes the preview and takes over the whole film, and returns later. *Fits content like:* dark mode; a language switch; offline mode.
- **Cell division.** A new session or window splits the screen and the mascot splits with a pixel burst. *Fits content like:* parallel tasks; multiple accounts; team members.
- **Cursor and mascot as characters.** The cursor pets, pokes or drags the mascot, and it reacts. *Fits content like:* approving a suggestion; undoing; onboarding delight.
- **Karaoke-ball words.** The mascot hops from word to word as they are spoken. *Fits content like:* a slogan; a shortcut list; step names.

## 变化空间

You decide the features and their order, the mascot (the product's own, or an original pixel character), the story, the opening, the ending, the camera path, the chapters and the music. All far from our demo:

- Structures: **a bug hunt** (the mascot chases one error through logs, code and a fix, a single chapter); **a day of one user** (morning to evening in one app, the theme and music shifting with the hour); **a race** (two windows side by side, old way vs. new way, the mascot winning on the right).
- Openings: **mid-task** (a half-written document; the mascot is already pushing the cursor's selection); **the notification** (a system toast lands; the mascot is inside it); **empty state** (a blank app, a caret blinking; the mascot drops from the menu bar).
- Endings: **the mascot goes to sleep** on the finished item as the window dims; **the app closes** and the mascot is left standing on the dock; **a real share** (the result is sent and the mascot rides it out of frame).



## 坑

- Invented features or renamed modes → check every button, mode and shortcut against the product's documentation; if it isn't in the docs, it isn't in the film.
- The mascot floats or drifts off its element → measure the DOM every frame, stand only on top edges.
- The mascot covers text or sits under a caption → reserve a text-free lane for it.
- Blur-filter "fake depth" on text you want read, or zooming out past the screen → rack focus only on panes not being read; zoom ≥ 1.
- A hand, arm or finger on screen → the cursor is the user.
- Motion blur applied to a transformed layer smears the pixel sprite wrong → blur an untransformed wrapper, and only on whips.
- A keypress or pop landing on a product name masks it → shift foley off word onsets; re-check with whisper on the final mix.
- TTS mispronounces the product name → try voices and spellings, verify with whisper.

## 来源与证据

- 来源定位：`风格提示词/L_Lemo-Opuscar/L43_活体实机录屏.md`；Lemo-Opuscar 来源库固定 revision `01576924a2b316d1f11ae33f75d3c005e8781451`。
- 许可：MIT License（见 `licenses/第三方许可/Lemo-Opuscar_LICENSE.txt`）。
- 保留与格式映射：保留来源关于本质、材料、颜色、文字、运动、相机、声音、原生动作、陷阱和变化空间的具体方法；新增的辨识信号逐项对应来源正文。按受保护的 `_template.md` 结构重排，并删除演示片故事、演示片标题及其专属叙事信息。
- 与已有风格的边界：区别于 original:minimal-ui：主角是按真实产品重绘的界面与用户/软件角色因果关系；区别于 original:pixel-game：像素只属于角色及道具，不把整套界面像素化。
- 证据状态：方法依据是上述来源文字；来源配套预览只作为静态图像保留，不能证明连续运动、作者实现算法或本地复现效果。本条不声明已检查来源视频或完成本地渲染验证。
- 本地实现：本卡定义可复用的视觉与声音方法，不绑定固定 renderer。Motion 按本片需要选用已有原生工具实现；只有所选效果确实依赖本地缺失的底层算法或授权素材时，才核验并补齐该项。
