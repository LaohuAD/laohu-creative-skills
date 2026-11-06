# Video Shotcraft 源镜头与局部组件接入

由 [laohu-motion 主文](../SKILL.md) 在某个观看单元的任务、语义动作与画面构思已经明确，且模板目录显示 Video Shotcraft 候选可能承载该单元时读取。本文只维护该上游的源码身份、真实接口、时间绑定与组合边界；通用解释方法、构图、文字可读性、声音角色和最终媒介检查仍由主文及相应 Reference 唯一维护。读完把适用的源镜头/组件约束写回同一蓝图，返回视觉设计和主文组合；开始运行时再将其接到 Film Blueprint 与 renderer。不得因源代码已接入而默认选用。

## 先选复用范围，不让源码替内容编排

先按内容理解缺口与观看单元的前后态决定哪些信息必须发生，再从实际运行入口中选复用范围。Video Shotcraft 提供的源码镜头与局部组件是可选的专业实现，不能替代内容拆解、全幅构图、字幕可读性或声音设计。每一段可独立选完整源镜头、多个局部源组件，或沿 Motion 的专业方法实现；同片允许三路组合。Motion scene 或 Huashu 原生模板也可充当一个 segment 的预渲染无声底片，再叠加 Shotcraft 本地组件和 FlashCut；这条合成路径不等于把完整源镜头拆开。只有真实机制适配当前段落且来源可在本地运行时才使用。用户锁定了要复现的来源、镜头或组件范围时，保留锁定项；不得因模型能力、模板更新或局部检查失败自行改写该范围。

| 路线 | 适用判断 | 运行边界与回到主线的结果 |
|---|---|---|
| 完整 Shotcraft 源镜头 | 源镜头的对象、构图、运动、阅读节奏与段落任务确实相符，且锁定/开放范围可由源码真实接口表达 | 选源后以源码整体机制作画面方案。`exact-baseline` 保留原源、内容、持续帧数及效果；不能改 props、缩放、hold、loop、裁切或拉伸，也不能叠其他层。`native-props` 只填目录和实际调用点共同验证的允许字段。把镜头适用理由、真实字段和固定机制写回蓝图，不把源镜头任一默认构图扩成整片外壳。 |
| 固定源码机制的本地适配 | 上游原片段适合当前镜头，但原接口把项目专属素材/文案写死，且当前 catalog 有单独登记的 source adaptation | 只走该登记的 `source-adapted-local` 入口；保留已列出的原运动/相机/节拍机制，按显式映射替换素材与语义高亮。该身份表示源码改编，不是 `exact-baseline` 像素等同；不可在普通作品任务中编辑共享 catalog/adapter。超出白名单或素材映射约束则回 Motion 主线，不扩成任意源码 patch。 |
| 局部源组件重组 | 一个或数个源组件可承担局部入场、排版、背景/表面处理、运动模糊、素材卡片或切点职责，其他内容仍由全片主线组织 | 组合原组件允许的原生 props；组件放置、父容器、裁切和透明度使用本地 adapter 的实际 layout 接口，与源 `props` 分开记录。只登记能由当前 renderer 消费的字段，不因组件可叠加就叠加所有层。组件的局部结果返回完整镜头构图与属性归属。 |
| Motion 方法底片 + Shotcraft 局部叠层 | 主体关系、布局和时序已由 Motion scene 或 Huashu native OM 模板承担，同时某个真实局部动作适合由 Shotcraft 组件实现 | 原 renderer 先单独生成该 segment 的 picture-only 底片；再在同一 `/2` Remotion Composition 用 `OffthreadVideo` 显示底片、以有序 `layers` 叠加经验证的 Shotcraft `local-effect`。保留原底片文件与 SHA/renderer receipt；overlay 不可改写底片，也不能把完整源镜头或 transition 当作普通 overlay。 |
| Motion 专业方法实现 | 没有匹配的可调用源镜头/组件，源机制会误读内容，或真实需求超出它的字段、时间或层级接口 | 沿现有 Motion 内容—视觉—工程路径实现，不伪造 Video Shotcraft 字段、不自行修改源算法，也不把 source-only 索引冒充候选成品。若用户锁定只复用且目标超出已接通范围，停止该依赖段并说明缺口；不自动转原创。 |

复用的判断单位是当前段落或局部对象，不是“每镜都换模板”或“整条片选一种风格”。短片可以从一个完整源镜头开始，由局部组件改组下段的文字、背景或媒介，再回到 Motion 自定义的关系演示；也可以全程只用一种方法，只要它持续承担本片观看任务。是否复用、混合或自创取决于内容适配、用户锁定范围与短段实际预演，不由模型新旧或仓库模板数量决定。只有当前存在会改变选择的实质疑问，且比较能帮助选择时，才做同条件对照；不要求每段固定做 A/B。

## 目录状态、来源身份与精确入口

模板及源码状态以 [Motion catalog](../templates/catalog.json) 与 `templates.mjs show` 输出为准，不按 gallery 页面、style 索引、README 或预览图推断可调用。当前 Video Shotcraft gallery index 中记录的 124 个 cards 与 150 个 styles 都是 `source-only`；它们帮助检索原始思路，不能传给 `prepare`、`preview`、`render` 或描述成已经接线的模板。当前 adapter 登记 12 个 `conditional` 候选：两个 PaperTitleCard 实现、TextReveal、Sheen、Stage、SpeedBlur、Grain、Backdrop、ClipCard、FlashCut、GrainDissolve，以及固定五卡/88帧的 `video-shotcraft-list-stack-five` source adaptation。另一个 `video-shotcraft-card-list-stack-press` 原始索引行仍是 `source-only`、不可调用；新入口没有把 gallery 索引整体变成可运行模板。它们是可尝试的运行入口，不代表每项已完成动态行为验证、适配任意内容或达到成片质量。

`video-shotcraft-list-stack-five` 的原实现来自 `demos/ui-entrance/list-stack-press/ListStackPress.tsx`，commit `1266a3ec4831289c4d893d42dd5102723658039a`；本地 adapter 直接 import 已 pin 的 `PageCam2D` 与 `Polish`，并按源代码迁入 ListStackPress 的逐帧运动、相机、计数、压弹、强调、glaze 与 blur 机制。它只允许 1920×pageHeight PNG 页面图、恰好 5 张 PNG 卡片图、每张显式页面坐标矩形和卡片内语义高亮矩形，以及短计数标签；素材路径须在 `--assets-root` 内，拒绝外跳 symlink，验证 PNG 尺寸/哈希/调用者声明的素材许可。页面高度可以变化，但五张卡片都必须在固定 PageCam2D 的最终视图 frame 82（cy=815、zoom=0.86）完整落入 1920×1080 画幅；仅在页面矩形内合法不够，画外映射会在 prepare 阶段被拒绝。计数器标签、数字和说明文字使用真实浏览器排版框，在每个实际渲染帧与当帧可见卡片比较；重叠时 preview/render 拒绝，并提示改文案或页面/卡片映射，不自动缩字号、移相机或默许碰撞。相机曲线、5卡/88帧、cue、曲线、间隔和其他相位固定；source cue 不被描述为真实接触/稳定落定。它只适合已介绍材料或短标签的积累展示；新解释文字必须先完整可读并有足够停留，不能为了保留88帧把新文字快速叠入。该入口是明确的 `source-adapted-local`，不承诺与原 demo 像素相同，也不附带上游截图、品牌文案或媒体。

两个同名 PaperTitleCard 必须按来源路径区分：`video-shotcraft-paper-title-card` 来自 `template/src/aifl/PaperTitleCard.tsx`，有目录明确允许的原生 props；`video-shotcraft-paper-title-card-gallery` 来自 `demos/typography/paper-title-card/PaperTitleCard.tsx`，无源 props，保留固定的 55 帧原场景。`video-shotcraft-grain-dissolve` 是单独的 60 帧原场景，使用 Remotion 的 `useCurrentFrame` 和 `useVideoConfig().durationInFrames`；它没有内容/style props。选了无 props 源场景时，不能把换标题或改背景说成原生可配置。下表是当前 adapter 真正接收并消费的局部接口摘要；构建前仍以 catalog、adapter 读取点和 source commit 的逐项核对为准。目录声明、TypeScript 接口或校验通过都不能单独证明画面会响应。

template 路径的 PaperTitleCard `native-props` 接口为 `duration,words,sub,subDigits,fontSize,ink,accent,muted,paper,theme,colors`；`duration` 必须等于该 segment 帧数，`theme/colors` 进入 `VisualThemeProvider`，其余字段映射到源组件。Gallery 同名场景没有可改字的 props；不得把这两者当成同一个模板。

| 局部组件 | adapter 接受的 `props` 与向源组件的映射 | 本地组合接口与边界 |
|---|---|---|
| TextReveal | 源接口：`text,start,by,variant,each,gap,ease,style,out`。adapter 便利字段 `unitStylePreset` 映射为源 `unitStyle` 回调。 | 必须有 `placement:{x,y,width,height,clip,alignX,alignY}`；`by` 决定真实拆分单元，文案变化需重算完整入场、阅读与退场。 |
| Sheen | 源接口：`progress,color,width,angle,strength`。adapter 也接收 `progressTrack:{from,to,startFrame,endFrame,ease}`，按组件局部帧计算当前 `progress`。 | 必须有 placement 和明确父级/clip 作用范围；高光不能越过被强调对象，也不接受任意 CSS。 |
| Stage | 源接口：`look,keyLight,fill,horizon,intensity,breathe,grain,vignette`。adapter 的 `backgroundDecor` 仅接 Dust/GridFloor 子层。 | 固定全画幅背景舞台，不接受局部 placement；装饰仍位于源规定的颗粒/暗角底层之下。`style` 不开放。 |
| SpeedBlur | 源接口：`vx,vy,amount,max`。adapter `content` 必须是经校验的 TextReveal 子层。 | 必须有 placement；不开放 `style`，不能把模糊当作未实现的相机或任意对象运动控制。 |
| Grain | 源接口：`opacity,step,scale,freq,blend` | 可选 adapter placement；只接受 `x,y,width,height` 并通过外层容器限制颗粒绘制矩形，不传入源 props。`style` 不开放。 |
| Backdrop | 源接口：`tone,light,accent,grain,vignette,drift` | 可选 adapter placement；只接受 `x,y,width,height` 并通过外层容器限制渐变/暗角/内含颗粒的绘制矩形，不传入源 props。`style` 不开放。 |
| ClipCard | 源接口：`src,caption,size,radius,muted,captionSize,startFrom,durationInFrames,loopDurationInFrames,loopCrossfadeInFrames`。adapter-only `assetLicense` 用于授权声明与收据，不传给源组件。 | 必须有 placement；`src` 是 film blueprint 所在目录下的本地相对视频路径，运行时记录素材哈希。它不接受 catalog `assetRefId`，也不负责任意遮罩/证据真实性。 |
| ListStackPress 五卡适配 | `contentUse,pageImage,pageImageLicense,pageHeight,cards[5]{src,assetLicense,rect,highlight},counterLabel,counterCaption`。只映射五张图片、矩形、高亮区域和短标签；其余机制锁定。 | 完整场景只有一层 `video-shotcraft-list-stack-five`；`fidelityMode` 必须是 `source-adapted-local`，sourceDuration 和 Film segment 都固定88帧。页面图须1920×pageHeight，卡片 PNG 与目标矩形宽高比误差≤1%；五张卡片还须在固定最终视图 frame82 完整进入画幅。prepare 阶段按原相机投影拒绝最终画面无法看全的卡片位置；preview/render 在浏览器字体 ready 后用实际 computed font/weight/size、Canvas `measureText`、CSS 字距和 DOM 行框测量计数器文本，再按88帧固定卡片投影拒绝字框与卡片相交或超出画幅的输入。唯一兼容例外是精确命中来源空间基线：原 `Paper Radar` / `Of 31 Fetched Today` 文案、pageHeight 1489、五张来源矩形和对应高亮几何全部相同；来源原画面在首卡入场时有约3px圆角边缘交叠，例外只保留这段已知原生构图。任意文案、页高、卡片位置或高亮变化都会撤销例外；没有可由调用者设置的绕过字段。测量或字体状态不确定时停止渲染，不使用离屏 `getBoundingClientRect()` 推断画面坐标，也不自动缩字或挪相机。路径、symlink、PNG头/尺寸、SHA 与声明许可进入校验和 receipt。不能传自由相机、卡数、cue、持续帧或任意CSS。 |

`placement` 属于 adapter 局部组合层而非源组件 props。TextReveal、Sheen、SpeedBlur、ClipCard 必须给 `x,y,width,height,clip,alignX,alignY`；Grain、Backdrop 的 placement 可选，但仅消费 `x,y,width,height`。Stage、两种 PaperTitleCard 与 GrainDissolve 不接受 placement，保留原生画面范围。validator 必须按 entry 拒绝不支持或未消费的 placement 字段，不能只把它留在 prepared spec/receipt。未列字段不能通过 `style`、额外 prop 或猜测的 `assetRefId` 补入。Film Blueprint 中的 `durationInFrames`/源局部 frame、局部 placement 与整片段显示时窗各有不同作用，须分别核对真实消费。

从 Motion 的实际入口查询，不在普通用户提示中暴露这些内部命令字段：

```sh
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --category local-effect
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" show video-shotcraft-text-reveal
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" prepare <source-id> --input /absolute/spec.json --output /absolute/prepared.json
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" preview <source-id> --spec /absolute/prepared.json --output /absolute/frame.png --time 1.0 --manifest /absolute/preview-receipt.json
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" render <source-id> --spec /absolute/prepared.json --output /absolute/clip.mp4 --manifest /absolute/render-receipt.json
```

这些单项命令只对 catalog 已登记且 `conditional` 前置条件满足的 11 项开放。源码许可证仅覆盖相应代码范围；人物、照片、视频、字体、音频或演示素材须各自核对来源和许可。缺少素材、原字体或运行上下文时，只暂停依赖的镜头，不从演示页面的外观反推资产可用权。

## 先把来源动作接到真实语义和声音锚点

来源中的 `actionLandmarks` 是有条件可绑定的来源动作，不是只凭名字就生效的模板装饰。每个实际承重动作先回到本片语义蓝图，写清它要揭示/重组的对象或语言单位、进入前提、观众应观察的操作、结果首次可见时刻与阅读/交接停留。再按 catalog 中真实的来源拆分规则匹配字词/行；将实际使用的来源局部帧、精确文本单位、`semanticCueId`、可选的时间线锚点和/或共享音频事件 ID 对应到来源动作。`semanticCueId` 在运行时只校验稳定 ID 格式；创作蓝图仍须能用它追溯到本段实际口播句/语义动作，不能只造一个孤立 ID。仅创建一个 phase、cue ID 或“显现”标签不等于组件已消费它；必须看到该值进入真实 props、adapter 调用或经哈希锁定且明确允许的 patch 入口。

当前可由 Film Blueprint 的 `actionBindings` 绑定的来源动作包括：

- PaperTitleCard 的 `word-reveal`：`index` 对应源 `words` 数组索引，`wordText` 必须与该项文本完全一致；来源局部显现帧为 `4 + 4 × index`。
- TextReveal 的 `unit-reveal`：`index` 和 `unitText` 必须符合实际 `by`（`char`、`word` 或 `line`）拆分结果；源局部帧为 `ceil(start + index × resolvedGap)`。改了文本、字体、宽度或拆分方式后，重新量完整字框并重算分批显现、完整完成、阅读和退场窗口。
- ListStackPress 的 `card-enter[index]`（cue `[6,18,30,42,54]`）、`nominal-flight-end[index]`（cue+22）、`roll-end[index]`（cue+30）、`stack-pulse-peak[index]`（index 1–4，cue+4），以及 `camera-motion-end=82`、`glaze-visible-start=74`、`glaze-full=77`、`glaze-fade-start=84`、`glaze-end=87`。这些名称表示代码中的名义阶段/可见性相位，不表示物理接触或稳定；绑定只允许 `semantic`，不能作 literal 字词揭示。

不要将上列两种绑定能力推广到没有 `actionLandmarks` 的组件；FlashCut 是段间 transition，不是文本语义动作；GrainDissolve 当前无可绑定动作。来源 `wordText`/`unitText` 必须精确匹配源组件实际显示的单元。`actionBindings.textRelation` 默认是 `semantic`：可将口播动作语义映射到不同措辞的画面解释；只有锁定逐字字幕、引用或逐词高亮时才选 `literal`，并要求 ASR 锚点词与对应的屏幕单位规范化后相同。

`film-global` 只按蓝图成片时钟安排来源动作，不接受 `timelineAnchor`，不能声称 ASR 词级同步。创作蓝图中的 `semanticCueId` 应能回到该段原稿/语义动作，但 validator 只校验 ID 格式，不校验这条人工语义追溯。使用 `asrcut-v2` 时，列入 `actionBindings` 的来源动作必须带真实 ASR point anchor；未绑定口播的视觉动作不要列入 `actionBindings`，但可按源内置时间出现。point anchor 必须指向保留时间线中的真实 occurrence/token 与 start/end 边，只接受 `measured`/`aligned` 精度，并落在来源 landmark 允许的 tolerance（至多 2 帧）内。默认 `semantic` 允许屏幕解释与 ASR token 不同；`literal` 才检查字面对应。不移动冻结音轨、剪后时间或 source landmark；不得写入未实现的 `none`、`speechBinding` 等标志。

声音仍由主线及 [声音设计](sound-design.md) 决定。只在视觉事件确有听觉作用时，将来源动作与同一 canonical `audioEventScene` 内的 `audioEventId` 关联；可为同一动作选择预示、触点、揭示或结果落定相位，不把动作起点机械当作声音击点。源特效没有自动音效，Video Shotcraft 的演示音轨也不自动许可或复用。时间线、视觉事件与声音 cue 必须共用既有成片/剪后时钟，不复制第二套秒数。

## 组合时分清组件上下文、版面与属性所有权

Film Blueprint 输出为 1920×1080、30fps 的 picture-only 视频。组件在 Remotion 组合中的局部 frame、`durationInFrames`、source 对象实际尺寸与 film segment 的 `startSec/endSec` 显示窗口是不同概念。源组件若读局部帧或 `useVideoConfig().durationInFrames`，须以 renderer 实际传入的组合上下文校验；segment 边界只说明本片何时显示它，不表示源动作被自动缩放、延长或重新定时。相机、原构图、素材 crop、clip、opacity、强调层分别由完整源镜头、adapter placement、独立共享底层或 Motion 场景所有者控制；每项只指定一个真实 owner，避免两个事件或父子组件重复乘变换/透明度。源类属性或任意 CSS 未开放时，不通过 blueprint 虚构。

adapter 的 `placement` 是局部组件的适配层版面，不属于源组件 `props`。TextReveal、Sheen、SpeedBlur、ClipCard 必须在 1920×1080 母版空间提供实际的 placement rectangle、clip 和水平/垂直对齐；不可只凭来源内部默认居中来猜本片布局。placement 仅在适配器当前白名单内有效，不是开放 CSS、相机控制或任意裁切接口。source `style` 只在具体组件真实读取并被 adapter 明确允许的情况下使用；validator 接受字段不保证 renderer 已将它用于绘制，需在真实输出中检查。

Stage 在源场景内承担背景舞台：允许的 Dust/GridFloor 装饰位于源内暗角/颗粒层之下，前景主体须作为 Stage 后方的 sibling 绘制。当前 Film `/2` 只按 segment 创建 Sequence，没有 composition-group 持久背景层；因此不能宣称一个 Stage 会自动跨 segment 共用。需让背景连续时，优先将需要共同背景的构成留在同一 segment 的 ordered layers；若逐段重复 Stage，先确认它的局部时间重启不会导致呼吸/颗粒等状态跳变；仍无法保连续时，选真实支持持久背景的 renderer。Stage 样式并非任意 CSS 容器。Backdrop、Grain、Sheen、SpeedBlur 各自的混合/透明/裁切作用范围也须在最终合成顺序中检查。

ClipCard 的 `src` 是 film blueprint 所在目录下的本地相对视频路径；素材须获准使用，并由 receipt 记录哈希。caption、尺寸、帧起点、循环和淡入淡出等行为，只能用该组件条目中真实消费的 props。它不是裁切/标注/证据真实性能力的替代，亦不能把一张扁平素材解释成有独立部件。`FlashCut` 是当前唯一已接通的 Video Shotcraft Film transition：相邻 segment 必须在同一 composition group 端点相接、无 overlap/handles；固定 10 帧，从切点前 5 帧开始，局部第 4 帧达到峰值（即全片 cut 前 1 帧）。composition group 之间只作硬切。当前 `overlap`、`mask` 或其他转场不支持；不能为转场私自延长、循环、freeze 或双端重叠完整来源片段。

## Film Blueprint `/2` 的真实接口与停止条件

混合 film 调用使用 `templates.mjs` 的 Film Blueprint `/2` 外层 Composition；`/1` 与 `/2` 的输入格式不得互换。Motion scene 和 Huashu native template 仍由 `/1` 原 renderer 逐 segment 渲染为 picture-only base，再由 `/2` 统一装入 Remotion Composition，与 Shotcraft 本地组件 overlay 及 transitionEdges 合成：

```sh
node .agents/skills/laohu-motion/scripts/templates.mjs render \
  --film-blueprint /absolute/film.json \
  --output /absolute/picture.mp4 \
  --work-root /absolute/project/.cache/tmp/video-shotcraft \
  --manifest /absolute/picture.mp4.manifest.json
```

顶层格式使用 `laohu.huashu-film-blueprint/2`，严格字段白名单为 `format,width,height,fps,clock,segments,compositionGroups,transitionEdges,audioEventScenePath,audioEventSceneSha256`；画布固定 1920×1080@30。`clock` 仅取 `film-global`（声明 `durationSec`，segments 以 `startSec/endSec` 连续覆盖）或 `asrcut-v2`（声明冻结 timeline 与 edit plan 的路径/hash，segments 以 `unitIds` 按时间线冻结顺序完整覆盖各 unit）。全片边界按 `ceil(absolute seconds × 30 − epsilon)` 量化为无空隙、无重叠的帧区间。不得混用两类 clock 的时间字段。ASR 路线必须验证 timeline/plan 哈希、顺序和 `compilePlan(plan)` 重建一致；证据或源媒体不完整时只停止依赖它的绑定。

所有 segment 共有 `id,renderer,compositionGroupId`，并按 clock 只使用 `startSec/endSec` 或 `unitIds`。`layers` 和 `actionBindings` 为可选；其余字段依 renderer 严格区分：

| `renderer` | segment 专属字段 | 底片/接口要求 |
|---|---|---|
| `motion-scene` | `scenePath,sceneSha256`；可选成对的 `drawModulePath,drawModuleSha256`；可选 `templateEffects:"huashu-art-motion-dg"` | 输入必须是 hash 锁定的 `motion-scene-v1`，1920×1080@30，并已覆盖该 segment 的量化帧数；原 `render.mjs` 先生成无声底片。 |
| `huashu-motion-template` | `templateId,variables`；可选成对的 `eventScenePath,eventSceneSha256` | `templateId` 必须是 catalog 中可调用的 Huashu native OM source。原模板 renderer 先生成无声底片；`variables.duration` 由该 segment 的量化时长提供，不得依赖渲染器替换原模板机制。 |
| `video-shotcraft-remotion` | `sourceCatalogId,componentPath,componentSha256,exportName,sourceCommit,fidelityMode`；按需要 `props` 或 `layers`、`sourceDurationFrames,sourceFrameAtSegmentStart`；可选 `eventScenePath,eventSceneSha256` | source identity 和字段必须与 catalog/adapter 一致。完整源镜头只能保留其单个 source layer；`exact-baseline` 保持原 props/整段时长且不能叠层，局部组件只用支持的 `native-props`。 |

对前两种 renderer，`layers` 只可叠 Shotcraft catalog 中已登记、满足前置条件的 `local-effect` 组件，最多 8 个且按数组顺序绘制；没有 overlay 时省略或给空数组。每层结构为 `{id?,catalogId,props,placement?}`，其中 `id` 是 segment 内可选且唯一的稳定实例 ID；当同类组件出现多个并需要绑定具体 source 动作时，每层必须提供 `id`。`placement` 仍按本 Reference 的真实 adapter 条件。完整 Shotcraft `full-scene` 不能被拆开再盖局部组件；需要 Motion/Huashu 底片和局部 Shotcraft overlay 时，应让 Motion/Huashu renderer 持有底片。`source-adapted-full-scene` 同样只有单个登记 source component layer；它只能使用 entry 明确支持的 `source-adapted-local` fidelity mode，不能标成 exact baseline。FlashCut 只从 `transitionEdges` 调用，不当作 `layers` 内容。完整 `exact-baseline` 源镜头必须保留 source props 与 catalog native duration，segment 量化帧数也须相等；不接收改 prop、变速/缩放、hold、loop、trim 或非零 `sourceFrameAtSegmentStart`。

当前只接通一个严格限域的 `derived-patch`：`sourceId:"video-shotcraft"`、`sourceCatalogId:"video-shotcraft-paper-title-card-gallery"` 的完整 Gallery PaperTitleCard，可在单模板入口或 Film `/2` 使用 `fidelityMode:"derived-patch"`。Film segment 必须保留完整 55 帧，只能有一个完整 gallery source layer，且该层 `props` 必须省略或归一为空对象；可变内容必须写在独立的 `layer.derivedPatch`：`{id:"paper-title-card-copy",words:[{text,accent?,br?}],sub,subDigits}`。它只把锁定源码中的 `WORDS`、`SUB`、`SUB_DIGITS` literal 接到 props，不改变动画逻辑。最多 9 个词、每词最多 20 graphemes、总计最多 64 graphemes；`sub` 是单行且 `String.length` 不超过 48，`subDigits` 不超过 8 个 ASCII 数字或 `. , % + -` 与空格字符。校验会确保最后一个词在整卡淡出开始前完成显现。父源码和派生组件均需 SHA 锁定；`templates.mjs verify --source video-shotcraft` 会核对两者及精确转换结果。不得把这一个 provider 推广为任意源码 patch；其他来源、字段或改动画逻辑的 derived-patch 仍拒绝。无 handles 的完整片段不能做双端 overlap，不能自动从更长原段裁切。

`compositionGroups` 必须是有序相邻 segments 的精确 partition，且每段 `compositionGroupId` 一致；group 可以容纳不同 renderer 的 segments。`transitionEdges` 只接收前述登记的 `video-shotcraft-flash-cut`/`flash-cut`；起止 segment 可来自不同 renderer，但必须在同一 group 内且精确相接。字段为 `id,fromSegmentId,toSegmentId,sourceCatalogId,styleKey,phaseId,eventId?,eventScenePath?,eventSceneSha256?`。不支持的 overlap/mask/其他 transition 必须停止该段并由主线选择可用的另一呈现方案；不得静默删除或用更长 hold 伪造。

Film action binding 字段为 `id,landmarkId,index,wordText,unitText,semanticCueId,componentCatalogId?,componentInstanceId?,textRelation?,timelineAnchor?,audioEventId?,toleranceFrames?`。`componentCatalogId` 指向实际绘制该 landmark 的 Shotcraft 组件：在 `motion-scene`/`huashu-motion-template` 底片上绑定 overlay 时必须给出；Shotcraft segment 可省略并默认其 `sourceCatalogId`。若动作来自同段另一个已渲染的 Shotcraft layer，显式指定该 layer 的 `componentCatalogId`。同一 segment 有多个相同 catalog ID 的实例时，相关 layer 必须有唯一 `id`，action binding 必须同时用 `componentCatalogId` 和 `componentInstanceId` 精确指向实例；单个实例可省略 `componentInstanceId`。只有已在该 segment `layers` 实际渲染的组件可以绑定；只登记 ID 不会创建组件。`textRelation` 仅取 `semantic`（缺省）或 `literal`。只使用本节已列且通过 source catalog 注册的 landmark。同一个 canonical `eventId` 在全片事件映射中只登记一次；多个不同事件可分别引用相同类别的 source landmark，不因此合并。`audioEventScenePath`/sha 指向唯一 canonical `motion-scene-v1`、version 1、`timeBasis:"film-global"` 的 event scene，必须覆盖整片时长；film-global event 不带 `timeMapId`，scene-local event 必须有 segment time map。转场与 segment 引用同一个 canonical scene，不重置、不重复编钟。若 source action 没有真实时间线绑定，不将其写成 `actionBindings` 来冒充口播同步。

render 输出始终是 picture-only，默认 manifest 位于 `picture.mp4.manifest.json`，格式为 `laohu.motion-film-manifest/1`，应核对 segments、各 base renderer 的原生 receipt/output SHA、staged base SHA、groups、transition edges、带 `componentCatalogId`/`componentInstanceId` 的 overlay action bindings、patch provider/source hashes、source adaptation 的本地模块哈希、页面/五卡素材的 SHA/尺寸/许可声明、event maps、renderer/runtime 与 ffprobe 结果。receipt 记录存在只表示路径可追溯，不等于每个动作、布局或成片质量已验证。当前 audio-plan/audio.mjs 是唯一最终混音 owner；Shotcraft `/2` 不直接混音。新 Film receipt 与现有音频 consumer 若尚未兼容，先保持音频合成未完成，不复制或重排另一套时间线，也不把 picture-only 视频交付成“已配音/已混音”。

## 用画面与 receipt 核对实际消费

source 字段/adapter 接通后，先选一个本片最难承重的真实段落检查完整动作轨迹，不用无关示意文字或终态海报代替。对完整源镜头，按目录承诺的 local frame 独立渲染原始 source 与嵌入 film 的对应状态，比较其构图、字体、层级、颜色、关键动作、持续帧数和资源；对局部组件，在实际父级、placement、裁切、共享背景及周围图层中检查进入、峰值/关键关系、完整阅读和退场。固定真实文字、字体/回退、尺寸、帧率、局部 duration、素材和时钟；每个蓝图要改变画面结果的字段，都应对应被调用的 source prop、作用容器或真实绘制位置。没有对应消费点就没落实，不能用 schema 验证或 metadata 代替。

文本、组件 duration、尺寸、背景/相机、裁切、透明度、mask/clip、blend、主层与 Stage 的叠放需分别检查。若内容或 `by` 拆分变化，重新测实际字体与文字框，重算单位序列、显现完成帧、完整可读窗和退场，确认占位与揭示动作在同一母版布局中都完整可见。逐段检查真实编码的起、中、落关键帧和正常速度全段顺播；重复 seek 相同帧确认绝对时间采样稳定。若某个真实开放参数的作用仍不明确，才做一次控制其他决定的单变量比较；不对每个组件/每段强制 A/B。

三类验证不能合并成一个“模板好用”：源码哈希/许可/闭包说明来源，参数读点/adapter receipt 说明某字段已接线，实际帧和顺播说明指定条件下的行为；由真实观众、专家或使用结果评审的才支持质量判断。精确源镜头单帧截图成功不证明整段时间、组合层级、文字阅读、声音混音或整体美感通过。只完成某一层时，把结论限制在该层；已观察到的目标差距记 `FAIL`，没有接收者证据的质量仍为 `UNKNOWN`。
