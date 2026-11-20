# 旧 Motion 方法配置的工程兼容说明

本文件只供已有 Remotion、Film、MotionCore、native-clip、Video Shotcraft 或用户锁定旧 renderer 的工程按实际需要查阅。新项目默认路径是 Motion Showreel 原生页面与其本地工具；新项目不加载本文件，也不从退役的 26 个子目录选方法。

Motion Showreel 的一般动作、镜头、转场、排版、循环、确定性和渲染限制，分别以[原版 craft](../../templates/runtime/laohu-showreel/references/craft.md)、[原版 recipes](../../templates/runtime/laohu-showreel/references/recipes.md)与[原版 stack](../../templates/runtime/laohu-showreel/references/stack.md)为准。原版风格卡是设计参考，不是 renderer。旧模块的名字、函数存在或 catalog 收录都不证明某个旧工程可调用；先核对当前 catalog、旧工程实际 consumer、输入条件及源码。catalog 状态可能变化，应以本轮实际登记为准。

这里保留的是旧工程仍可能需要的接口语义、适用条件、例外和原件位置，不复制成熟库或旧 Skill 全文。它不把旧模块描述当作已获人类验证的成片效果，也不引入新算法。需要从底层另造实现时，遵守当前授权与所用 renderer 的真实接口；不能以本档案里的接口摘要替代源码。

## 旧路径到兼容锚点

| 退役路径 | 本档案锚点 |
|---|---|
| `.agents/skills/laohu-motion/skills/laohu-motion-callout/SKILL.md` | [laohu-motion-callout](#laohu-motion-callout) |
| `.agents/skills/laohu-motion/skills/laohu-motion-camera/SKILL.md` | [laohu-motion-camera](#laohu-motion-camera) |
| `.agents/skills/laohu-motion/skills/laohu-motion-collage/SKILL.md` | [laohu-motion-collage](#laohu-motion-collage) |
| `.agents/skills/laohu-motion/skills/laohu-motion-comparison/SKILL.md` | [laohu-motion-comparison](#laohu-motion-comparison) |
| `.agents/skills/laohu-motion/skills/laohu-motion-data/SKILL.md` | [laohu-motion-data](#laohu-motion-data) |
| `.agents/skills/laohu-motion/skills/laohu-motion-entrance/SKILL.md` | [laohu-motion-entrance](#laohu-motion-entrance) |
| `.agents/skills/laohu-motion/skills/laohu-motion-exit/SKILL.md` | [laohu-motion-exit](#laohu-motion-exit) |
| `.agents/skills/laohu-motion/skills/laohu-motion-feedback/SKILL.md` | [laohu-motion-feedback](#laohu-motion-feedback) |
| `.agents/skills/laohu-motion/skills/laohu-motion-flat/SKILL.md` | [laohu-motion-flat](#laohu-motion-flat) |
| `.agents/skills/laohu-motion/skills/laohu-motion-geometric/SKILL.md` | [laohu-motion-geometric](#laohu-motion-geometric) |
| `.agents/skills/laohu-motion/skills/laohu-motion-interaction/SKILL.md` | [laohu-motion-interaction](#laohu-motion-interaction) |
| `.agents/skills/laohu-motion/skills/laohu-motion-loop/SKILL.md` | [laohu-motion-loop](#laohu-motion-loop) |
| `.agents/skills/laohu-motion/skills/laohu-motion-matchcut/SKILL.md` | [laohu-motion-matchcut](#laohu-motion-matchcut) |
| `.agents/skills/laohu-motion/skills/laohu-motion-material/SKILL.md` | [laohu-motion-material](#laohu-motion-material) |
| `.agents/skills/laohu-motion/skills/laohu-motion-materialcut/SKILL.md` | [laohu-motion-materialcut](#laohu-motion-materialcut) |
| `.agents/skills/laohu-motion/skills/laohu-motion-pixel/SKILL.md` | [laohu-motion-pixel](#laohu-motion-pixel) |
| `.agents/skills/laohu-motion/skills/laohu-motion-relations/SKILL.md` | [laohu-motion-relations](#laohu-motion-relations) |
| `.agents/skills/laohu-motion/skills/laohu-motion-shared/SKILL.md` | [laohu-motion-shared](#laohu-motion-shared) |
| `.agents/skills/laohu-motion/skills/laohu-motion-shuimo/SKILL.md` | [laohu-motion-shuimo](#laohu-motion-shuimo) |
| `.agents/skills/laohu-motion/skills/laohu-motion-timing/SKILL.md` | [laohu-motion-timing](#laohu-motion-timing) |
| `.agents/skills/laohu-motion/skills/laohu-motion-trajectory/SKILL.md` | [laohu-motion-trajectory](#laohu-motion-trajectory) |
| `.agents/skills/laohu-motion/skills/laohu-motion-typography/SKILL.md` | [laohu-motion-typography](#laohu-motion-typography) |
| `.agents/skills/laohu-motion/skills/laohu-motion-whip/SKILL.md` | [laohu-motion-whip](#laohu-motion-whip) |
| `.agents/skills/laohu-motion/skills/laohu-motion-whiteboard/SKILL.md` | [laohu-motion-whiteboard](#laohu-motion-whiteboard) |
| `.agents/skills/laohu-motion/skills/laohu-motion-wipe/SKILL.md` | [laohu-motion-wipe](#laohu-motion-wipe) |
| `.agents/skills/laohu-motion/skills/laohu-motion-zoom/SKILL.md` | [laohu-motion-zoom](#laohu-motion-zoom) |

## 旧工程的独有接口与边界

### laohu-motion-callout

原版 Showreel 已说明文字测量、留白和阅读检查；旧工程还可能使用 [diagram.js](../../templates/runtime/laohu-native-clips/lib/diagram.js) 的 `DG.circumscribe`、`DG.brace`、`DG.indicate`，以及 [chart.js](../../templates/runtime/laohu-native-clips/lib/chart.js) 的 `CH.callout`。只有实际 consumer 登记了对应函数时才可接线。`CH.callout` 的点显现、环脉冲、引线生长、标签淡入是一个耦合次序，只传源码实际读取的字段。

旧 MotionOps 的 `geometryMode: "followTarget"` 只适用于同帧投影后仍轴对齐的 world-space 矩形目标；它不推断文字、图片或路径边界，也不替目标动画。目标显隐由 `target.visible` 控制，层透明度用祖先 `layer.opacity`；Core 不消费 `layer.visible`，事件或绑定控制该字段会被预检拒绝。标签组须按实际加载字体测量；若 `TY.fitFloor` 被用于裁切式标签，需读取 `ok`/`cut`，不能把缩略文本说成完整显示。来源与本地能力分别见字体[排版 Reference](../typography-and-legibility.md)和[工具链 Reference](toolchain-render-and-check.md)。

### laohu-motion-camera

原版 Showreel 的 camera 说明覆盖通用取景、推进、拉远和跟随；旧 Huashu 接口在 [camera.js](../../templates/runtime/laohu-native-clips/lib/camera.js) 中：`CAM.toScreen`/`toWorld` 做坐标转换，`CAM.anchor`/`pushTo` 对齐世界锚点，`CAM.track`/`at` 读取其事件/关键帧参数，`CAM.zlerp` 为对数倍率插值，`CAM.layer` 控制分层视差，`CAM.coverZoom` 计算圆形开口覆盖倍率。`CAM.motionBlur` 依赖真实相机速度。它们不是 Showreel `camera()` 的同一 schema；`CAM.track` 的时间单位、起始相机和参数以原实现为准，不从名称猜测。

### laohu-motion-collage

原版 Showreel 已覆盖材料混用、素材加载和确定性渲染；旧工程中特有的是材料身份、证据语境与组件输入的分层。确需追踪同一材料的不同实例时才区分语义 `entityId` 与绘制 `instanceId`；材料若承担事实证据，保留来源、语境、出处和能支持的主张，不以仿旧效果补造出处。

旧 MotionCore Canvas 没有通用 image/video 对象接口；不能假定它能裁切或动态遮罩任意素材。Video Shotcraft `ClipCard` 显示已登记的本地 clip，但 source props 与 adapter placement 是两层，也不会自动提供裁切、证据认证或部件动画；按[Video Shotcraft 接入规则](video-shotcraft-integration.md)核对。异步素材沿旧 runner 实际支持的 `MOTION_READY` Promise 等待加载，源文件按现有副本/链接策略处理，不覆盖原件。

### laohu-motion-comparison

一般比较组织和节奏已由原版 Showreel 的构图、图表和动态方法承接；旧工程没有独立的通用比较函数。保留共同比较单位、基线、范围、对象身份与相同编码；口径或样本不同要显露差异，不用同一图形尺度暗示不可比。若数据决定图表，交由真实图表 consumer 读取数据，而不是只在蓝图写标签。

### laohu-motion-data

原版 Showreel 覆盖图表和计数器的通用画面做法；旧 Huashu 图表接口在 [chart.js](../../templates/runtime/laohu-native-clips/lib/chart.js)：`CH.lin` 建映射，`CH.ticks` 选刻度，`CH.grid` 先绘网格，`CH.bars`/`line`/`candles` 显示序列，`CH.callout` 负责成组强调。具体输入 schema 以该文件与当前 consumer 为准；完整图表镜头的标题、单位、轴、曲线和显现顺序作为耦合组保留。

核对数据源、单位、分母、基线、时间范围和缺项；示意数据标为示意，动画插值不报成观测值。不得为了动画篡改数值或以截断坐标夸大差异。函数出现在源码中不证明当前 renderer 已接通。

### laohu-motion-entrance

原版 Showreel 已覆盖对象进场、文字揭示和错峰；旧工程接口仍需分清绘制型文字操作和纯数据返回：`DG.drawPartial` 沿真实路径按弧长揭示；`TY.rise`/`charsIn`/`pop`/`blurIn` 是实际文字绘制方法；`TY.typed(s, p)` 只返回显露字符的前缀，只有真实文字 renderer 消费并绘制它才完成进场。`MO.lagged(i,n,p,r)` 需传真实组索引、数量、进度与比例。组件若把布局、裁切或动作绑定在一起，保留整组，不抽一个 easing 当作等价镜头。

### laohu-motion-exit

通用退场时序由原版 Showreel 覆盖；旧工程没有独立通用 exit API。按真实 consumer 区分移除、弱化为参照、原身份替换与焦点交接。若下一镜仍依赖旧对象，先让结果可见或保留必要参照。对象 `alpha`/透明度由一个 owner 控制，避免对象和祖先层重复相乘；完整 source action 的尾帧与结尾行为按原实现保留。

### laohu-motion-feedback

通用动作和状态变化可由原版 Showreel 页面 `render(t)` 承载；旧工程没有统一 `feedback` 函数。只有能追到真实 producer、被读取状态、更新属性和下一 consumer 时，才称结果回流。MotionCore 的静态对象事件或 Art Motion 的图元本身不是应用交互状态机。视频中的点击/训练过程若为剪辑模拟，须明确是模拟，不宣称真实输入成功或学习效果。

### laohu-motion-flat

原版 Showreel 的 Canvas/相机章节覆盖块面、层级和观察范围的一般制作；旧 MotionCore 的 [camera helpers](../../scripts/motion-core.js) `cameraForAnchor(worldAnchor, screenAnchor, zoom, width, height, rotation)` 与 `worldToScreen(point, camera, width, height)` 分别求锚点相机状态和屏幕投影。局部对象强调、对象组变化和相机尺度变化是不同操作；Video Shotcraft 的局部 `placement` 不是全局镜头。旧局部效果的 `followTarget` 约束见 [callout](#laohu-motion-callout)，不把静态标注扩成推近或任意几何跟踪。

### laohu-motion-geometric

原版 Showreel 的 `recipes.md` 覆盖形状状态链；旧 MotionCore 的 path/polygon morph 只在选中 renderer 的实际 schema 提供对应几何与 `morphProgress` 时成立。`path-reveal`/`DG.drawPartial` 是沿已绑定路径描显，不是轮廓 morph；普通事件不自动支持任意 `points` 更新。先依据对象身份与轮廓对应选择真实来源；轮廓不对应时切镜或分段重建，不用插值掩盖身份变化。精确字段以 [MotionCore](../../scripts/motion-core.js) 和 consumer 为准。

### laohu-motion-interaction

原版 Showreel 的单页时间函数是确定性渲染，不提供真实用户输入。旧 UI 视觉方法、Art Motion 的 UI surface、MotionCore 静态场景也不等于 input handler。真实交互须接入当前产品的 input handler、state machine 和实际状态；视频只展示情境时标为剪辑模拟。错误、取消、等待与成功按真实状态呈现，未测试平台保持未知。

### laohu-motion-loop

原版 Showreel 的 loop 配方覆盖确定性周期运动和接缝检查；旧函数补充在 [motion.js](../../templates/runtime/laohu-native-clips/lib/motion.js) 的 `MO.step`（按源 fps 返回量化秒值）及 `MO.easyEase`（可用于周期参数但参数仍须首尾闭合）。[media.js](../../templates/runtime/laohu-native-clips/lib/media.js) 的 `MD.frameAt` 可按真实 fps 循环输入帧序列，不会修复源视频断点或场景动作接缝。不能因画面循环就假定音轨同步循环；单独检查首尾位置、速度、相位与声音尾接。

### laohu-motion-matchcut

原版 Showreel 已说明匹配剪辑的画面语义；旧 Film `/1` 接口仅适用于相邻两段都是 `motion-scene` 且具备双端 handles 的真实转场。接收段使用当前 catalog 对应的 canonical ID、`method: "matchCut"` 和源码实际消费的参数；旧定义中的 `width` 默认值仅在当前源函数仍如此时沿用。该函数只在窄窗交叠两端图像，不替 A 推满或 B 拉出锚点。native-clip、Motion `motionEffects` 与 Film `/2` FlashCut 都不是这条接口。

### laohu-motion-material

原版 Showreel 覆盖质感层、Canvas 与 WebGL 技术选择；旧 Huashu 材料操作的函数定位在 [collage.js](../../templates/runtime/laohu-native-clips/lib/collage.js) 与 [ui.js](../../templates/runtime/laohu-native-clips/lib/ui.js)，源码闭包与许可身份见 [SOURCES.md](../../SOURCES.md)。其中 CL、PAINT/BRUSH 与 UI surface 各有自己的依赖、层级和输入条件；只在当前 catalog 和实际 renderer 确认后使用。材料视觉不能自动证明物理行为或素材授权；适用完整镜头/动作组时保留原有构图和依赖，不抽纹理替代整组。

### laohu-motion-materialcut

原版 Showreel 覆盖擦除与按新材料接续的转场语法；旧 Film `/1` 材料转场只在相邻两段均为 `motion-scene` 并提供所需帧柄时接入。`incomingTransition` 必须使用当前 catalog 的 canonical group、method 与源参数；逐项核对当前状态，不把旧 source-only、available 或 conditional 记录沿用成当前结论。特别地，`pageTurn` 在旧目录中属于 `laohu-motion-wipe` 组，不填成 materialcut。Film `/2` transitionEdges、native-clip 与 Motion `motionEffects` 是不同入口；转场方法与依赖见 [laohu-transitions.js](../../templates/adapters/laohu-transitions.js) 和 [SOURCES.md](../../SOURCES.md)。

### laohu-motion-pixel

原版 Showreel 的 stack/recipes 已说明低分辨率逻辑画布、最近邻放大与步进；旧 MotionCore `pixels` 对象要求 `cells` 与正数 `pixelSize`，单元格数组不是普通对象事件可逐项动画的接口。需要姿态变化时确认当前来源以真实状态切换或独立 renderer 实现；不要臆造 `sampling` 字段或用矩形标注代替网格化。校验对象 schema 见 [MotionCore](../../scripts/motion-core.js)。

### laohu-motion-relations

原版 Showreel 覆盖对象关系、形态变化与跨镜连续的一般思路；旧 MotionCore 没有可任意动画的通用 graph/edge schema。line 的端点和 path 点列不因普通事件自动更新；`DG.brace` 只括一个静态矩形范围，不能表达节点之间的方向、因果或连接。需要动态节点/边时，已选 custom renderer 必须按同一绝对时间更新节点姿态、路径端点、箭头和标签；移动强调点沿可见关系线应与同一条真实路径求值（如 `MotionCore.pointAt`），不另造近似路线。先分清关系含义、方向、证据状态和对象身份，不能让空间先后或装饰线替代语义证据。

### laohu-motion-shared

原版 Showreel 覆盖跨镜主体承接；旧 transition 源方法有不可互换的结构：`same` 直接绘制下一画面，要求同一世界/相机连续，不负责物体插值；`lensReveal` 以 A 镜实际 lens(t) 作为开口并同步推进；`expandRect` 从 A 末端的真实卡片矩形展开，B 首帧应不透明，不再叠溶接。身份相同但位置/形状变化须由对象状态或明确重组机制承担，位图溶接不证明身份连续。Film `/1` 仍需相邻 `motion-scene`、handles 和当前 catalog 条件。

### laohu-motion-shuimo

原版 Showreel 已有 ink-wash 风格卡与材料/着色器技术选择，但风格卡本身不是水墨 renderer。旧来源函数与完整材料动作须从 catalog、[collage.js](../../templates/runtime/laohu-native-clips/lib/collage.js) 和 [SOURCES.md](../../SOURCES.md) 确认；`DG.drawPartial`/path progress 只作几何描线，不模拟笔锋、纸纹、浓淡或墨迹扩散。水墨源 action 适用时保留其依赖与材料层；源接口不支持时不把近似描线标作水墨，也不凭缺字段新增底层算法。

### laohu-motion-timing

原版 Showreel 覆盖通用时间线、拍点、曲线和确定性；旧 Huashu 接口签名不可混用，见 [motion.js](../../templates/runtime/laohu-native-clips/lib/motion.js)：`MO.seg(t,a,b)` 与 `MO.at(t,t0,dur)` 把秒映射为 0..1 区间进度；`MO.anim(lt,start,dur,ease)` 与 `MO.pulse(t,at,dur,ease)` 再应用曲线；`MO.beat(n,bpm)` 把拍数换为秒，`MO.onBeat(barTime,revealP,trDur)` 反求拍点显露对应的起点；`MO.invert(ease,y,iters)` 反求归一化进度，不是时间采样；`MO.lagged(i,n,p,r)` 计算组内局部进度；`MO.step(t,fps)` 返回量化后的秒值，不是动作进度。

`MO.spring(t,{duration,bounce,v0})` 与 `MO.springHz` 的参数模型不同。Huashu Motion 的 `OM.spring(bounce)` 返回以归一化进度为输入的缓动函数，可能过冲；`OM.springValue(from,changes,t,{bounce,settle})` 则按时间求累积值，不能互换。真实 renderer 和共享音频事件须消费同一语义 landmark；函数名、曲线或素材 BPM 都不自动提供成片时间。严格按源代码与实际调用核对时间单位和返回值。

### laohu-motion-trajectory

原版 Showreel 覆盖对象运动、路径揭示和连续叙事；旧 [diagram.js](../../templates/runtime/laohu-native-clips/lib/diagram.js) 的 `DG.drawPartial` 按输入路径弧长绘制，并可返回当前 tip。区分对象沿路径移动、路径逐段露出、路径作为可见轨迹三件事；它们的 points、坐标空间、时间曲线与消费函数需进入真实 renderer。路径几何与缓动快慢分开控制，跟随标签复用实际对象锚点和相机投影。描线进度不等于对象运动，也不等于轮廓 morph。

### laohu-motion-typography

原版 Showreel 已覆盖动态排版、字体加载和可读窗；旧 renderer 的文字/布局接口须保持源消费者语义：`TY.typed` 只产出文本前缀，不绘字；Video Shotcraft `TextReveal` 的分组由实际 `by` props 决定，计算时区分组件局部 frame 与 Film segment 窗口。MotionOps 的 `createTextBitmapCache` 只提供本地文本位图缓存；`measureTextOccupancy`/`composeLabelGeometry` 需要将同一完整组几何用于实际排位和绘制。几何登记不能证明字形像素可见，仍需目标尺寸检查。ASR 词级绑定只有真实保留的 token occurrence/time、source landmark 与允许误差进入 consumer 时才成立；缺少词时码就按真实句段处理。具体来源、参数与运行条件见[字体 Reference](../typography-and-legibility.md)、[Video Shotcraft 接入规则](video-shotcraft-integration.md)和 [MotionOps](../../scripts/motion-ops.js)。

### laohu-motion-whip

原版 Showreel 已覆盖方向性甩镜、运动模糊与焦点落定；旧 Film `/1` 入口要求相邻两段 `motion-scene`、真实双端 handles 和当前 catalog 中可调用的 `laohu-motion-whip`/`whip`。`dir` 与窗口参数按转场源码传递；甩动窗里的必读文字先完成阅读，B 的主体需在落点可辨。旧 E2E 标记只证明特定技术夹具的接线，不证明真实作品观感或人类接收质量。Film `/2` FlashCut/native-clip 不共用此入口。

### laohu-motion-whiteboard

原版 Showreel 的路径揭示与确定性 rendering 覆盖一般制作；旧白板实现仍须区分静态路径显露、连续画布和擦改。scene path `progress`/`DG.drawPartial` 沿预先定义的点列描显，不会动态改变端点、擦除或重写。若已选原实现真实提供笔尖，笔尖与线前沿须共用同一 progress；`drawPathProgress(ctx,points,progress,options)` 或 `pointAt(points,progress,closed)` 只能按实际可用接口调用。

### laohu-motion-wipe

原版 Showreel 已覆盖遮罩转场和复杂形状时值；旧 Film `/1` 入口要求相邻两端是 `motion-scene`、所需 handles 存在且 catalog 当前登记了具体方法。source group 内的分块顺序、方向、边缘、背景、曲线和时值属于源机制，按 [laohu-transitions.js](../../templates/adapters/laohu-transitions.js)、catalog 和 [SOURCES.md](../../SOURCES.md) 核对。native-clip/OM template 不提供 Film handles；Film `/2` transitionEdges 与 `/1` 是不同合同。普通 cut 或用户剪辑时间线不因这份兼容档案而改写。

### laohu-motion-zoom

原版 Showreel 覆盖推近、尺度变化和 zoom-through 的一般构图；旧 Film `/1` 的 `zoomThrough`、`fillZoom`、`blurPush` 是三个不同源方法，分别保留实际焦点/位图或实时重绘分支、焦点填充与落位曲线、A/B 模糊交接机制，不能混用字段或重复套曲线。`zoomThrough` 若用圆孔须按 [camera.js](../../templates/runtime/laohu-native-clips/lib/camera.js) 的 `CAM.coverZoom` 覆盖画幅；没有真实矢量重绘 consumer 时不设 `live: true`。`lensReveal` 属共享元素 transition，不属 zoom 组。按 Film `/1` 当前 catalog、两端 handles 与实际源码核对，不把 `Film /2` 或 native-clip 状态套用过来。
