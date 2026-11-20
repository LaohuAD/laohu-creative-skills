# 工具、渲染与媒介检查

> 使用边界：普通新制作唯一走[Showreel 原生运行入口](../showreel-runtime.md)：八 XML Brief、所选资源 L2 与 `render(t)`。本文记录既有 renderer/Remotion 的真实接口及 standalone `production-plan.mjs` 技术合同；其中 `/5`、`creativeDesign/1`、`directorDesign/3` 不是当前创作合同，也不是普通任务可选路线。只有用户明确要求操作一个已在使用该 standalone CLI 的项目，或明确点名该工具时，才读取对应计划段；不自动为新任务生成 plan 文件或 D3。保留相关 schema、validator、reader/export 和 renderer 代码以支持真实现有消费者，不批量迁移用户工程。


本 Reference 把镜头设计接入真实工程、工具、渲染器和最终媒介。制作与检查方法适配自本地《018_0930录屏讲解后期》的关键帧试作、全片渲染和最后导出播放记录，以及上游的一帧先行和视频动画语法；工具功能以实际项目及当前官方文档为准。这些来源是方法依据，不是工具无关的成片质量证明。当前工具名、版本或产品功能可能变化；使用前按实际环境与官方资料核验。检查结论应引用实际可见的文件、时间码、播放/画幅/文字状态；单人自检不证明所有观众都能理解。


## 输入与返回

本 Reference 接收镜头蓝图、实际项目与素材、目标规格及本轮授权，并先确认工程是否存在、修改范围是否明确、工具是否可用。实现后向主流程返回工具与版本依据、镜头到工程的映射、渲染文件和最后媒体检查状态；未能完成的部分须说明具体阻塞。状态应能用文件、命令、时间码或失败原因复查，渲染成功不等于观众效果已证实。

## 可执行映射：对象、时间、属性与输出

任何可程序化镜头都要能追到“画面对象或等价元素—前态/后态—动作时间—被驱动的属性—所在空间/图层—画面材料”。按本镜需要提供字段，不为未使用的相机、形变、遮罩、素材或图层造空值。下面的 `scene` 是本仓库轻量 Canvas2D 工具的公开调用接口，不要求 Remotion、AE、剪辑工程或用户模板改成它的 JSON；其他工具照样使用原生工程，只要能回查相应对象、关键帧/事件、属性和时间映射。

### Canvas2D scene spec

入口为 `{SKILL_DIR}/scripts/motion-core.js` 的 `MotionCore.validateScene(scene)`、`evaluateScene(scene, absoluteSeconds)`、`drawFrame(canvasOrContext, scene, absoluteSeconds, renderers)`。场景要求 `version: 1`、正整数 `width/height`、正数 `fps/duration`，且 `duration × fps` 是整数帧数。`objects`、`layers`、`events`、`bindings`、`variables`、`camera`、`palette`、`styles` 按实际动作需要提供；缺失相机时舞台中心为默认观察中心，未指定的普通对象位于 world 空间，`space: "screen"` 用于固定屏幕标注。

将最终 `/2` ASR-cut timeline 绑定到 Motion scene 时，`scripts/bind-speech.mjs` 会按 `ceil(durationSamples × fps / sampleRateHz)` 覆盖整条 timeline 的 frame count；它只把 scene 的渲染时长上调到足够的整帧，并在 `scene.motionTimelineCoverage` 与 binding receipt 中保留原始 samples、sample rate、plan hash 及不足一帧的覆盖余量。词/段落 cue 仍锚在原始 project sample 上，不逐 clip 或逐停讲区量化。显式锁定帧数不足以覆盖 timeline 或原有 scene 时，绑定失败并要求调整锁定规格；它不会拉伸、删改或重排音频样本。该自动准备只适用于 `/2`；`/1` 继续要求输入 scene 先通过原有整帧校验，且 scene 时长已覆盖 timeline，`--locked-frame-count` 不适用于 `/1`。

下述 Core schema 是局部接线与无适用原件时的技术参考，不是普通制作的默认起点。正常新片先按模板库选择真实原件并执行其 prepare/preview/render；需要局部自定义时，保留已选源函数和动作组，只补未承接部分。基础 marker/rect 测试夹具见现有 evals，不把技术占位场景扩成成片母版。

本地 core 的绘制类型是 `rect`、`circle`、`ellipse`、`line`、`path`、`polygon`、`text`、`pixels`，或由作品本地注册的 `custom:<name>`。`path`/`polygon` 使用有限 `{x,y}` 点；`pixels` 使用 `{x,y,color}` cells 与正数 `pixelSize`。只有需要形变的路径才提供 `morph.from/to/anchors`；锚点是从 0 到 1 严格递增的显式对应。层可选择 `parent`、`transform`、`opacity`、矩形/多边形 `clip`、`blendMode` 和命名 `style`。子层继承父层的 world/screen 坐标空间；相机先把 world 坐标变到屏幕，裁切在变换后做，能把原画幅之外的大板平移进视口。

事件以场景绝对秒求值并保持结束值：`target.kind` 为 `object`、`layer`、`camera` 或 `variable`，有 `id`、`property`、`start`、`duration`、`from`、`to`，可选 `ease`。只动画实际使用的属性；当前接口检查对象/图层/相机属性名，并拒绝同一属性重叠事件或事件与绑定冲突。绑定将已定义的变量映射到对象或图层属性；未指定输入输出区间时直接传递变量值。场景求值每次从不可变输入重建状态，支持任意顺序 seek。颜色可用具名 `styles` 和 `@paletteRole`；所选 renderer 缺少本片所需的绘制/着色行为时，先比较并优先选能真实承载它的成熟 renderer 或完整来源。仍需本地接线时，沿已核许可的精确来源入口调用原函数；`custom:<name>` 默认负责接入本片对象、时间和参数，不凭摘要重建或近似底层实现。为兼容真实接口或修复技术问题而确需改动源码时，依据实际代码作有据适配、修补或性能优化，保留已确认的表现依赖并核验实际消费；会改变已确认的表现时交用户选择。只有用户明确要求从底层原创实现时才进入原创分支。不因 schema 缺字段另造猜测接口，也不得把未实现字段写进场景假装有效。

### 文本绘制和实际排版消费

本地 `text` renderer 通过 Canvas `measureText` 实际消费 `layoutText(ctx, text, {maxWidth, lineHeight, letterSpacing})` 的结果；它返回 `lines`、`widths`、`lineHeight`、`height`，绘制器逐行以测得的布局落笔。`text.font` 是 Canvas CSS font shorthand，提供家族、字重和字形；没有显式 `fontSize` 时字号来自该 shorthand。对象态 `fontSize`（包括事件动画后的当前值）显式覆盖 shorthand 内字号；这项覆盖行为是本地文本接口为修复字体尺寸混淆而明确实现的契约，不能推定其他旧字段冲突规则也因此改变。

`maxWidth` 基于实际 Canvas `measureText` 做软换行并尊重显式换行。不可拆分的词或单位若自身超出宽度可以溢出；该接口不是自动缩小算法，也不是完整 CJK 行断引擎。`lineHeight` 是逐行基线距离；`letterSpacing` 是每个字素间距的像素值；`x/y` 是第一行的文本锚点，`y` 对应基线。字体 load 完成之后重新调用布局，超宽原子须由作者调整版面/分组/宽度并实测，不能预期 renderer 自动修复。

自定义绘制器可用 `MotionOps.measureTextOccupancy(ctx, text, style)` 取得分行的 advance、ink、paint 和含留白的占位边界；`style` 的 font、align、direction、baseline、letterSpacing、maxWidth 必须与真正的绘制一致，`lineHeight`、描边、模糊和 padding 也按最终绘制值传入。若调用方省略 direction，函数解析 Canvas 的 `inherit` 方向（可读取元素时按其计算样式），没有 DOM 继承源时采用并返回 `ltr`；绘制时使用结果中的 direction，不能让测量与绘制方向各自继承。Canvas 返回的 `0` 和负 bearing 都是有效测量值；缺少 actualBoundingBox 指标时该行会标为估算，不能把 fallback 当成真实字形测量。非零字距要求浏览器的 Canvas2D 支持 `letterSpacing`；不支持时函数报错，调用方需接入和最终绘制一致的字距实现再测量。

### `MotionOps` 供作品级 custom draw 使用

`scripts/render.mjs` 在 `MotionCore` 后加载 `scripts/motion-ops.js`，并要求 `window.MotionOps.core === window.MotionCore`，之后才加载 `--draw-module`。作品级 `custom:<name>` 回调可读 `window.MotionOps`；这些是供 custom consumer 使用的可复用操作，不添加 MotionCore 的原生 scene 字段，也不重新实现已有 path/camera。当前导出 `clamp(value, low, high)`、`filmToLocalTime(time, mapping)`、`samplePhase(timeSec, phase)`、`sampleChannels(timeSec, phase)`、`indexPhases(scene)`、`mapLocalTimeToFilm(localTimeSec, mapping)`、`findSceneAudioEvents(scene)`、`mapSceneEvents(plan, scene, maps)`、`seededUnit(seed, index)`、`stableParticles(seed, count, bounds)`、`emphasisEnvelope(time, config)`、`withLocalMask(ctx, buildMaskPath, draw)`、`measureTextOccupancy(ctx, text, style)`、`composeLabelGeometry(input)`、`transformBounds(bounds, transform)`、`chooseLabelPlacement(input)`、`diagnoseLayout(input)`、`createTextBitmapCache(options)`、`validateLocalEffects(scene)` 与 `localEffectContracts`。时间采样、粒子和文字布局操作由绝对时间或显式输入求值，可重复 seek；`emphasisEnvelope` 是局部 custom 数值，只有其配置的 `overshoot` 会让攻击段短暂超过 `peak`，不能把它叫作普通插值曲线。

#### 已接通的本地局部效果实例

原子局部效果通过 `scene`/custom 对象中已存在的 `data.motionEffects` 接入，不为 MotionCore 增加原生字段。实例需有稳定 `id`、catalog `effectId`、真实 `targetId`、与目标绑定一致的屏幕几何、源码实际消费的 `parameters` 和共享 `phaseId`。阶段登记在 `scene.phases[]` 或任一 `objects[].data.phases[]`，沿用 `MotionOps.samplePhase` 对 `durationSec` 或 `endSec` 的解析；音频事件可引用同一 `phaseId`，不要复制第二份起止时间。`render.mjs` 发现实例后自动校验并加载 catalog 登记的本地 DG/MO closure，注册本地 DG/MO effect renderer，记录实例字段、目标变化与 adapter/source hash。若没有注册 effect instance，`--template-effects laohu-motion-dg` 仍按 canonical 本地入口预载 DG library；来源 ID 和兼容 aliases 留在 catalog/SOURCES。要在一个 custom draw 中直接消费更多原始绘制方法，并可与同一 scene 的现有 DG/MO effect instances 并用，使用 `--template-effects laohu-motion-toolkit`。

实际消费包含静态与受限的 `followTarget` 两种模式。省略 `geometryMode` 或指定 `static` 时，原 screen-space `rect`/`line`/`path` 绑定保持不变：`DG.drawPartial` 沿静态路径描显，`DG.circumscribe` 对矩形一次圈注并在结束时清除，`DG.brace` 沿矩形边长出并保持，`DG.indicate` 只驱动圈注轮廓，`MO.lagged` 按完整 stagger 组改变具名矩形自身 opacity。显式 `followTarget` 只开放给 `DG.circumscribe`、`DG.brace`、`DG.indicate` 与 `MO.lagged` 矩形显现：目标须为 world-space rect 且每帧 Core 投影仍有限、正面积、轴对齐；`geometry` 是场景时间 0 的源坐标锚点，renderer 使用同帧 `evaluatedState` 投影结果。目标与祖先须 unclipped/source-over，effect owner 须为中性的后置 screen overlay；morph、文字、图片、path、多边形、旋转/斜切后非轴对齐的矩形不在该合同内。MotionCore 不消费祖先 `layer.visible`，followTarget 预检会拒绝该字段及其事件/绑定，应改用目标对象 `visible` 或祖先 `opacity`。实例进度仍按绝对时间求值并支持乱序 seek；Canvas 状态用 save/restore 隔离；这不是通用相机/对象缩放能力。

`measureTextOccupancy` 临时应用并恢复实际 Canvas 字体、对齐、方向、基线和字距，返回分行的 `advanceBounds`、`inkBounds`、`paintBounds`、`occupiedBounds` 与实际指标可用性；描边、模糊和留白应传入与最终画面相同的值。actualBoundingBox 中的零和负 bearing 都按原值保留；缺失指标只给出标记为 `mixed-or-fallback` 的估算。非零 `letterSpacing` 在 Canvas 不支持时会明确失败。

`composeLabelGeometry({measuredText,parts,background,clearance})` 是唯一的标注组几何 API 契约：`measuredText` 必须带 `paintBounds`、`occupiedBounds`；`parts` 为相对文字锚点的 `{id,drawBounds,paintBounds?}`，省略 `paintBounds` 时与绘制框相同；可选 `background` 接收 `{id,innerPadding:{top,right,bottom,left},contentPartIds}` 并只生成无额外阴影/滤镜的纯填充底板；有描边、阴影或滤镜的底板应作为显式部件提供真实 `drawBounds` 和 `paintBounds`，或由在选位、绘制和逐帧登记中消费同一真实几何的等价路径处理。`clearance` 为非负数或 `{x,y}`，用于组外占位。函数返回文字锚点偏移、归一到组原点的文字 paint bounds、各部件的 draw/paint bounds、底板 draw/paint bounds、完整 `visualBounds`/`occupiedBounds` 和测量状态。组 visual/occupied 采用实际 paint 矩形；绘制读取 draw 矩形，组外候选和逐帧登记覆盖完整 occupied。文字自身已计入的 padding 不会被重复添加。缺失/重复 ID、非有限坐标、负尺寸、负内边距或 clearance 会显式报错；没有底板/部件时可直接处理纯文字。

`transformBounds(bounds, matrix)` 将局部矩形的四角投影到同一屏幕坐标，返回保守 AABB；调用者须先组合真实对象、图层和相机变换，不能遗漏某层，也不能重复投影已在屏幕空间的坐标。`chooseLabelPlacement({id,targetId,relation,readingInterval,candidates,protectedAreas,viewport})` 仅在作者给定、按优先级稳定排序的候选中，挑选未压入受保护区域且未出画幅的位置；候选框、保护框都必须是同一屏幕坐标中的矩形，区间字段只判断时间区间是否相交，不计算对象在区间内的运动。要声称整个阅读区间稳定可用，提交的候选框和保护框必须覆盖该区间所需的范围（如扫掠包围框），或按明示的采样拆分/重复检查；单一静态边界只证明该边界对应的时点。复杂运动无法被一个保守框容纳时拆分区间或重构构图。返回 `placed` 或带各候选冲突的 `unresolved`；没有可用位置时回到布局、对象职责或展示时序，不自动缩小、隐藏必读文字。

#### 同一 Motion scene 中的 `laohu-motion-toolkit` 与 DG effects

`laohu-motion-toolkit` 是 catalog 中的 canonical library ID，Film `/1` allowlist 已接通。direct `render.mjs` 入口为 `--template-effects laohu-motion-toolkit --draw-module <local module>`；Film `/1` 中 `renderer:"motion-scene"` 的 segment 要一起给出 `templateEffects:"laohu-motion-toolkit"`、`drawModulePath` 与 `drawModuleSha256`。renderer 从 pinned Huashu classic scripts 暴露原有 `MO/CAM/TY/CH/MD/UI/CL/DG` globals；本地 draw-module 直接调用 catalog 登记的43个源方法，保留原签名和行为，同一 scene 中已有 `scene.objects[].data.motionEffects` adapter 也可消费其 DG/MO 原方法。direct calls 计入 manifest 的 `templateEffects.calls`，现有 effects adapter 的实例/方法 receipt 单独记录。函数列表、参数和源码 closure 以 `templates.mjs show laohu-motion-toolkit` 与唯一 catalog 为真源；调用者负责加载字体、提供已加载媒体并确认许可。

Film `/1` 的60帧、1920×1080技术 E2E 证明了43个登记方法的 source-call receipt 和同场 custom draw + DG effects adapter 消费。该夹具 strict same-canvas repeated-seek 为 `FAIL`：972通道、最大差2、均值0.004301，原因 `UNKNOWN`；较早的独立39-function fixture 另为 `FAIL`：637通道、最大差2、均值0.00007776。两个 fixture 的读数不合并，也不因调用收据通过而改写重复像素失败。证据路径仅供维护追踪，不是共享运行依赖：`.cache/validation/motion-blocks/toolkit-e2e-10879-6JU4ZL/film-toolkit-evidence.json`；`.cache/validation/motion-building-blocks/audit/independent-toolkit/run-10130-1794047172319/evidence.json`。这些结果不证明普通题材成片、接收质量或人类观感通过。

#### `laohu-motion-network-pass` 源动作组

catalog 中可调用的耦合组为 `laohu-motion-network-pass`，renderer 类型 `custom:laohu-network-pass`，本地 draw module 为 `templates/adapters/laohu-network-pass.js`。Motion scene 固定为1920×1080、5.4秒、一个完整屏幕 network-pass 对象，可选紧跟唯一的 fixed-ID disclosure `text` 对象；使用 `--template-effects laohu-motion-toolkit --draw-module <path/to/laohu-network-pass.js>`。Film `/1` 的 `motion-scene` segment 也提供相同 module 的 `drawModulePath`/`drawModuleSha256` 以及 `templateEffects:"laohu-motion-toolkit"`。组钟固定调用原 `t1_s1` 的2.6秒，再调用原 `t1_s2` 的2.8秒；不拉伸、不偏移、不带入 `t1_s3`。来源时长、对象尺寸、裁切、opacity、Motion events/bindings/layers、任意额外对象或对象变换偏离这些条件会被 renderer 拒绝。`nativeParameters` 一次绑定整段状态；没有帧内修改输入像素、权重、激活或输出标签的事件/绑定/动画接口。画面仍按原片相位运动，只有示意数据保持静态；E2E实测帧率为30fps，renderer以源秒数采样并不自行更改帧率。

将唯一 custom object 的 `data.nativeParameters` 作为对源 `T1` 实际读取状态的显式注入：`inputPixels:number[100]` 是固定10×10猫图的亮度值 `[0,1]`；`outputs:[{name,activation}]` 必须正好3项，activation `[0,1]`，名字要能落入原固定输出标签槽；`hiddenActivations:number[10]` 是隐藏层激活值 `[0,1]`；`inputToHiddenWeights:number[16][10]` 与 `hiddenToOutputWeights:number[10][3]` 是有符号权重 `[-1,1]`。省略的字段保留原源默认值；未知字段、错误行列或越界数值停止渲染。输入字段只改变源相应示意数据，不改变源布局和时序。输出、隐藏激活与权重都是调用方明确提供的示意状态；它们不触发前向推理、类别推断、学习、反向传播或梯度下降。源标题/说明仍固定称猫图，因为 s1 没有可消费的动态输入身份字段。

例如，这个 Motion scene 覆盖三个源输出名和激活值，其他 T1 状态保留原默认。数字为构造的教学示意，因此作者加上一条同帧披露。披露由普通作者按本镜事实填写；编译器只核对字符串、字形和实际单行宽度，不判断文案说法是否真实。示例“数值为示意，不是实测”已在此固定字体子集中核过字形与宽度；原候选“教学示意，非实测”因缺少“教”“非”会被拒绝。其他题材按准确语义改写，并以实际字形检查为准；没有可核实实测来源时，不用相邻 T1 文字镜头代替此披露。所有数值参数在整段固定；要做另一组静态状态，应提供另一个独立片段/调用，而不是在一个5.4秒对象中加时间事件。

```json
{
  "version": 1,
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "duration": 5.4,
  "timeBasis": "scene-local",
  "background": "#000000",
  "objects": [
    {
      "id": "network-pass",
      "type": "custom:laohu-network-pass",
      "space": "screen",
      "data": {
        "nativeParameters": {
          "outputs": [
            { "name": "猫", "activation": 0.88 },
            { "name": "狗", "activation": 0.09 },
            { "name": "鸟", "activation": 0.03 }
          ]
        }
      }
    },
    {
      "id": "network-pass-disclosure",
      "type": "text",
      "space": "screen",
      "x": 960,
      "y": 1018,
      "text": "数值为示意，不是实测",
      "fontFamily": "NotoSerifSC",
      "fontWeight": "700",
      "fontSize": 38,
      "maxWidth": 1680,
      "align": "center",
      "baseline": "alphabetic",
      "fill": "#FFFF00"
    }
  ],
  "events": [],
  "bindings": []
}
```

可选对象必须是 `network-pass` 后的唯一第二对象，属性和值如上固定，只有 `text` 由作者填写。它使用 MotionCore 已有的 `text` 绘制路径和同一 `layoutText` 测量规则；renderer 另用 pin 字体 cmap 检查实际字形，并拒绝换行、超宽或缺字。文本不会缩小、截断或回退系统字体。它不是通用 caption/overlay 接口；不得增添其他 drawable、style、变换、layer、event 或 binding。无披露对象时仍只有原 network-pass 对象，沿用原源像素路径。

用 `render.mjs` 时还要加载固定的 Huashu toolkit 闭包与本地适配器；Film `/1` 通过前述 `motion-scene` segment 做同样的调用。

```sh
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/render.mjs" \
  --scene /absolute/network-pass-scene.json \
  --output /absolute/network-pass.mp4 \
  --cache-dir /absolute/project/.cache/tmp/network-pass \
  --browser /absolute/chrome \
  --ffmpeg /absolute/ffmpeg \
  --template-effects laohu-motion-toolkit \
  --draw-module "{PROJECT_ROOT}/.agents/skills/laohu-motion/templates/adapters/laohu-network-pass.js"
```

这个动作组声明并校验源 `CMU-rm` 与 `NotoSerifSC` 字体文件，按 pin 的 SHA-256/Git blob 加载后再绘制；Motion 与 Film receipt 的 `templateEffects.fontAssets[]` 记录来源路径、哈希、家族和加载状态。renderer 用源 `U.loadCmaps` 检查输出名字，超出固定 `NotoSerifSC` 子集的字会在渲染前拒绝，避免无提示回退到机器上的其他字体。一般 `laohu-motion-toolkit` 函数仍由调用者管理其专用字体和媒体；这里是这个完整动作组的固定字体闭包。

2026-11-08 的技术 E2E 对装载固定 CMU-rm/NotoSerifSC 字体的源脚本与 Motion custom renderer 在 8 个时点做逐像素比较，全部 `0` 个差异通道；s1 末态与 s2 首态单独比较同样为 `0`。`render.mjs` 和 Film `/1` 各实际输出162帧、5.4秒的可播放画面并记录 `t1_s1`/`t1_s2` direct-call 与字体资产收据；输入像素及显式输出/激活/权重变体均触发实际画面变化，未知字段、错误矩阵、缺必需源字族和超出字体子集的字拒绝。完整证据与截图为 `.cache/validation/motion-fusion-implementation/network-pass/e2e-3231-1794116825367/evidence.json`，同目录保留 direct-source/adapter 截图及两份 MP4。该 E2E 是源保真和技术消费证据，不是审美或受众理解通过。工具库既有 repeated-seek `FAIL` 保持原记录，不能据本次正向时间采样清除。

可选同帧披露的后续 E2E 单独验证该对象接线：无披露时仍与源画面在8/8时点逐像素一致；两条字形完整的作者文案分别通过 MotionCore 实际测量并在同帧产生 Core 文字收据，缺字、超宽、额外字段/对象及 event 被拒绝。`render.mjs` 与 Film `/1` 各输出162帧、5.4秒 MP4；披露收据记录固定字体、字号、测量宽度与 `sameFrame:true`。证据：`.cache/validation/motion-composition-integration/network-disclosure/e2e-66690-1794165971009/evidence.json`，其中含浏览器正负例、源对照截图及两份编码文件。该结果只证明这个来源夹具的技术接线与文字绘制，不证明人类阅读质量、语义披露正确性或正常顺播效果。

字体和媒体由调用者加载、提供并核许可；库本身不打包授权素材。特别是 `MD.size/cover/print` 需传入已加载图像、视频帧或 canvas。catalog 中每一项的 availability、条件与 runtimeVerification 继续分别解释，不把整库的 Film E2E 扩大为所有方法、题材或质量验证。

#### 完整标注组的布局结果进入绘制

Typography Reference 是字图排布与组几何的唯一方法来源；本节只说明在现有 custom draw 中怎样消费。以下 `drawBlueprintLabel` 是普通 screen-space 文字/附着标注的技术调用桥，不是作品模板、新 scene schema 或固定底板样式。`label`、`plan` 和 `drawState` 是调用方已从本镜蓝图与当前实际绘制状态解析出的输入。附着标注先用具名 `attachmentTargetId` 查找当前可见目标；没有可见目标就返回并停止该标注，不能用邻近物体、role 或“for lesson”代替。此存在性检查不证明文字语义正确：作者仍须检查被指的可见内容是否足以表达物件身份、动作、参与者关系、条件/标准及其参照、或实际结果等本镜成立的语义。非附着文字绑定蓝图中的 `explanationUnitId`，不伪装成物件。字体须在调用前加载完成；候选锚点与保护框由当前设计给出。

迁移旧文字/标注绘制入口时，沿调用方追到实际绘制，核对最终字符串和字体、测量值如何进入完整组边界、位置可用性以及部件绘制。旧代码调用了 `measureText` 不等于布局已消费：若宽度只被返回/记录，而调用方仍用常量 `x/y/w/h` 且没有针对完整字图组的可用性核验，就应在绘制前接通共同排布。可以沿用经核验可用的固定坐标；先以最终字体测量文字、组合底板/编号等全部可见部件和 clearance，再把实际组几何用于候选选位，或核验该固定位置在目标阅读窗内与保护区、画幅边界兼容。最终位置须同时驱动文字与部件绘制。受影响的必读文字/标注组须以同一完整组几何按当前实际 draw 状态登记并交真实布局检查：本 Canvas 路径消费既有 `layoutFrame`，其他工程走等价实测方式并披露覆盖范围；未登记或 `not-checked` 不算完成。无可用位置则在绘制前局部重排，仍无解就停止该组，不能画旧坐标后补测。沿用原绘制器、helper 或等价的真实消费路径均可；无需强制每个对象动态选位、全工程换 helper 或统一版式。

坐标按屏幕像素解释。保护框及候选所需范围由调用方先完成实际投影，并覆盖声明的阅读区间（可使用扫掠包围框，或披露采样并拆段）；本 helper 不求轨迹、不提供语义判断。示例只适用于没有额外 clip、filter、shadow 或描边的屏幕文字层；存在这些效果时，须让测量、组合几何和绘制使用相同实际效果，或走真实等价消费者路径。`parts` 输入提供相对文字锚点的 `drawBounds`，有额外效果时还提供实际外扩后的 `paintBounds`；示例中二者相等。`drawPart` 只用返回的 `drawBounds` 作绘制几何，完整组 `paintBounds` 用于选位与逐帧登记，不得再扩边绘制。底板内边距在 `background.innerPadding` 明确提供；文字 measurement 已含的 padding 不在这里重算。

```js
function drawBlueprintLabel(ctx, label, plan, drawState, frameTextItems, timeSec) {
  ctx.save();
  try {
    if (plan.coordinateSpace !== "screen") throw new Error("this call bridge expects screen-pixel geometry");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const target = label.attachmentTargetId == null ? null
      : (drawState.visibleTargets || []).find((item) => item.id === label.attachmentTargetId && item.visible !== false);
    if (label.attachmentTargetId != null && !target) return { status: "missing-target" };
    const targetId = target ? target.id : plan.explanationUnitId;
    if (!targetId) return { status: "missing-target" };

    const measured = MotionOps.measureTextOccupancy(ctx, label.text, label.style);
    const geometry = MotionOps.composeLabelGeometry({
      measuredText: measured,
      parts: plan.parts || [],
      background: plan.background || null,
      clearance: plan.clearance == null ? 0 : plan.clearance,
    });
    const candidates = plan.candidates.map((candidate) => ({
      id: candidate.id,
      priority: candidate.priority,
      anchorId: candidate.id,
      allowOverlapIds: candidate.allowOverlapIds || [],
      box: {
        x: candidate.textAnchor.x - geometry.textAnchorOffset.x,
        y: candidate.textAnchor.y - geometry.textAnchorOffset.y,
        width: geometry.occupiedBounds.width,
        height: geometry.occupiedBounds.height,
      },
    }));
    const placement = MotionOps.chooseLabelPlacement({
      id: label.id, targetId, relation: label.relation,
      readingInterval: plan.readingInterval, candidates,
      protectedAreas: plan.protectedAreas, viewport: plan.viewport,
    });
    if (placement.status !== "placed") return { status: "reflow-required", placement };

    const partDrawers = plan.drawPart || {};
    if (geometry.parts.some((part) => typeof partDrawers[part.id] !== "function")) {
      return { status: "draw-part-missing", placement };
    }
    const groupOrigin = { x: placement.box.x, y: placement.box.y };
    const atGroup = (box) => ({ ...box, x: box.x + groupOrigin.x, y: box.y + groupOrigin.y });
    const anchor = {
      x: groupOrigin.x + geometry.textAnchorOffset.x,
      y: groupOrigin.y + geometry.textAnchorOffset.y,
    };

    if (geometry.background) {
      ctx.fillStyle = plan.background.fillStyle;
      const plate = atGroup(geometry.background.drawBounds);
      ctx.fillRect(plate.x, plate.y, plate.width, plate.height);
    }
    for (const part of geometry.parts) {
      ctx.save();
      try {
        partDrawers[part.id](ctx, atGroup(part.drawBounds), timeSec);
      } finally {
        ctx.restore();
      }
    }

    ctx.font = measured.font;
    ctx.textAlign = measured.align;
    ctx.textBaseline = measured.baseline;
    if ("direction" in ctx) ctx.direction = measured.direction;
    if ("letterSpacing" in ctx) ctx.letterSpacing = measured.letterSpacing;
    ctx.fillStyle = label.style.fillStyle;
    measured.perLine.forEach((line, index) => {
      ctx.fillText(line.text, anchor.x, anchor.y + index * measured.lineHeight);
    });
    frameTextItems.push({ id: label.id, role: "annotation-group", opacity: ctx.globalAlpha, box: { ...placement.box } });
    return { status: "placed", placement, geometry, anchor, measured };
  } finally {
    ctx.restore();
  }
}
```

`candidate.textAnchor` 是设计给出的第一行文字锚点；它与 `geometry.textAnchorOffset` 一起产生完整组候选框。`placed` 位置同时决定文字锚点、底板/部件框与 `frameTextItems` 的组外框。纯文字不需额外分支配置：`parts: []` 且 `background: null` 即保留该路径。调用方必须把 `missing-target`、`draw-part-missing` 和 `reflow-required` 作为局部停止/重排状态处理；无解时停止该版的相关标注绘制并回到蓝图重排，不能按旧锚点绘制或只在绘制结束后量字。完成每次实际 draw 后，按当前绝对时刻从实际可见的完整组框及同范围保护对象重建 `frameTextItems`，并把它和该时刻预期出现的文字 ID 交给已有 `window.MOTION_EVIDENCE.layoutFrame(...)`；登记 ID 须对应当前 opacity/显隐状态。缺少部分文字/部件覆盖时，只能报告声明的局部范围；快照不会推算候选或保护框在阅读区间内的运动。

`diagnoseLayout({timeSec,scope,viewport,items,expectedIds,allowOverlaps})` 检查作者登记的当前可见矩形是否相交、出界或漏登声明的 ID，并输出 `motion-layout-snapshot/v1`。可在现有 `window.MOTION_EVIDENCE` 中注册 `layoutFrame(timeSec,scene,canvas,MotionOps)`，让它在每次实际 draw 完成后返回当前布局快照；`render.mjs` 会在下一帧覆盖状态前读取并重新计算矩形交叠，然后在 manifest 汇总冲突首次/末次时间、覆盖数量、缺失/陈旧/损坏快照和 producer scopes。`diagnoseLayout` 返回的快照会带回显式 `allowOverlaps`；若作品自行构造快照，也必须传递这一许可字段，渲染器才会在复核时尊重作者确认的装饰叠放。空快照保持 `not-checked`，部分登记保持 `partial`；任何结果都只说明 producer 声明范围内的几何检查状态，不构成全片 PASS。此检查只覆盖快照登记的屏幕 AABB，不能判定像素遮挡、语义指向、字色对比、未登记对象或整体画面质量；缺失、空、部分、陈旧和损坏快照均不能记作全片检查通过。

`samplePhase(timeSec, phase)` 接受 `{id,startSec,durationSec|endSec,curve|ease?,from?,to?}`，返回 `rawProgress`、clamp 后的 `progress`、`curvedProgress`、`active` 与插值 `value`；支持 `linear`、`smooth`、`ease-in-out-cubic`、`ease-out-cubic`、`ease-in-cubic`，进度限制在 `[0,1]`。`active` 仅表示采样时间在相位插值区间内（含端点），不表示对象可见；`value` 由 clamp 后的进度求值，因此开始前保持 `from`，结束后保持 `to`，但这些数值本身不会自动控制绘制或显隐。入场相位结束不等于对象退出，也不等于阅读停留已完成；需要持续可见、停留或退出时，绘制器须用真实消费的状态/分支单独表达。`readStart`/`readEnd` 等蓝图或 metadata 记号不自动控制绘制，除非真实绘制入口读取并据此改变画面。`sampleChannels(timeSec, phase)` 以同一相位为基准，逐通道接受 `{from?,to?,curve?,startSec?|offsetSec?,durationSec?,anchor?}`，返回 `{phase,channels}`；通道可有自己的开始、时长、曲线与锚点。锚点由采样结果原样带回，实际平移/缩放绕点等几何仍由 custom 绘制器应用。采用这条可选相位路径让画面属性与声音 cue 共用时间时，custom renderer 用传入的绝对秒采样具名相位，并由共享 `audioEvents` 的 `phaseId` 引用它，不另抄一套起始秒或进度。既有 `filmTimeSec` 或带明确 `timeBasis` 的 `timeSec/time` 事件也可由画面与音频共同消费，无需迁移为相位数据。

`render.mjs` 在 `sourceInvocationEvidence` 中分别报告已加载 namespace、已加载的可调用方法、跟踪是否成功，以及本次运行按 `setup/readiness/encoded-frame/preview-frame` 分组的实际调用数。方法无法包装时标 `loaded-untracked`；可跟踪但无调用时标 `tracked-not-invoked-within-run`。它只观察列出的全局 namespace 自有方法，不覆盖词法局部函数、继承方法或直接 Canvas 绘制。加载/hash、closure 函数清单、少量源方法调用都不能推出整套成熟绘图语法已复用；manifest 明确保留这一证据边界。

存在 `scene.motionSpeechBinding` 时，`speechBindingConsumption` 会把 receipt 中的 phase/object 和本次 custom renderer 内实际调用的 `MotionOps.samplePhase/sampleChannels` 对照，并解析绑定事件在共享 `audioEvents` 中的 phase/time。没有相应采样调用会列出未观察到的 phase 并警示直写秒数、事件名或 `TY.charsIn` 调用不足以证明共同绑定。该跟踪证明的是 MotionOps 接口收到的相位和时刻，不证明采样值改变了像素；共享事件解析也不证明 audio plan 或 PCM 消费了它。要证明画面动作确由 anchor 改变，需对比同一组件/同一采样时刻、仅变一个 anchor 的实际绘制像素或组件输出；要证明声音移动，需用 audio renderer 对照共享 event ID 并检查输出样本位置。

相位只作为 `scene.phases[]` 或 `objects[].data.phases[]` 中的 custom 数据，不是 core scene spec。共享声音事件可放在 `scene.audioEvents[]` 或 `objects[].data.audioEvents[]`；`{id,phaseId,phaseOffsetSec?}` 按 `phase.id` 在上述可索引集合中查找，必须唯一匹配，否则拒绝；不要求事件和相位位于同一数据所有者。采用 `phaseId` 时，事件时刻取相位 `startSec` 加 `phaseOffsetSec`，并沿用该相位的时间基准。时间基准按代码顺序取事件显式 `timeBasis`、`filmTimeSec` 隐含的 `film-global`、被引用相位的 `timeBasis`、事件所在数据的 `timeBasis`、场景 `timeBasis`。音频计划的 `events[].eventId` 指向共享事件 ID。全局事件直接使用成片秒；局部事件必须提供 cue `timeMapId` 映射到成片秒。不使用相位的既有事件仍可用 `filmTimeSec`，或带明确/可继承 `timeBasis` 的 `timeSec/time`。

```js
window.MOTION_RENDERERS["custom:reveal"] = (ctx, object, filmTimeSec) => {
  const phase = object.data.phases.find((item) => item.id === "reveal");
  const { channels } = window.MotionOps.sampleChannels(filmTimeSec, phase);
  ctx.globalAlpha = channels.alpha.value;
  ctx.translate(channels.x.value, 0);
  // 用同一 phase 的 channels 更新本镜实际绘制属性。
};
// object.data.timeBasis 可设为 "film-global"；phases 内含该具名相位。
// 同一 object.data.audioEvents 可包含 { id: "reveal-hit", phaseId: "reveal" }。
```

### ASR 剪后时间轴的现有消费者接线

当镜头需要对齐虚拟剪辑后的口播时，使用 [ASR 剪后时间轴与语义动画锚点](../speech-cue-binding.md) 选择少量语义 point/span/segment。`scripts/bind-speech.mjs` 同时接收 edit-plan、其编译 timeline、绑定规格和现有 scene；它调用 asrcut 的 `hashPlan`/`compilePlan`，要求整份 timeline 与当前 plan 编译结果相同。revision 是正整数。若 plan 给出源媒体路径与 SHA，绑定时流式重算并拒绝变化；若没有媒体路径/hash，receipt 明确标 `unavailable`。它也使用 asrcut `verifyPlanEvidence(plan,{baseDir})` 按声明的 hash mode 重读有 `evidenceRef` 的 ASR 原文件字节；丢失、不可读或内容变化时拒绝绑定。没有 `evidenceRef` 的来源在 receipt 记为 `unlocated`，不是“已验证”。两项检查分别覆盖媒体文件和 ASR 输入文件，不证明识别词句准确，也不证明剪辑决定经过人工确认。

正式绑定只接收 `state:"frozen"`；`draft` 必须显式用 `--preview`/`preview:true`，receipt 留下预览标记和原审阅状态。绑定器不修改 edit-plan/timeline，不改 `targetRange`，也不把陈旧语义改绑到相邻同名词。输出把具名 phase 放入目标 `custom:*` 对象现有的 `data.phases[]`，把命名 cue 放入 `scene.audioEvents[]`。`--bindings` 规格仍兼容；plan annotation 已登记 `motionBinding` 时，省略 `--bindings` 会消费 compiler-resolved `resolvedTargets`，要求 `componentCalls` 唯一映射到已有 custom renderer object，并从同一 annotation 生成 phase 与 audio event 连接。当前根场景 custom renderer 收到的 scene 秒直接作为组件时间，所以只有 identity 的 `componentLocalSec = filmGlobalSec` 映射；没有真实局部映射时不允许另造时钟。作品绘制器仍须用绝对成片秒调用 `MotionOps.samplePhase`/`sampleChannels` 并把通道结果用于真实绘制；声音计划通过 `eventId` 指向同一 `audioEvents[]` 事件，交给 `MotionOps.mapSceneEvents` 与 `scripts/audio.mjs`。这条路径复用现有 custom 消费者，不增加 MotionCore 原生 scene 字段；annotation event ID 可显式替换一个既有 direct `timeSec/time/filmTimeSec` 事件，binding receipt 保存原事件快照用于安全重绑。

变更一个 token/segment 的剪后位置后，需使用新 revision/hash 重新编译和绑定，再同时检查画面起/中/落帧及共享声音事件映射。`evals/speech-binding.test.mjs` 以 `importAsrJson`/`freezePlan`/`compilePlan` 实际生成时间轴，调用 `sampleChannels`、共享事件解析和 `renderAudioPlan`，并从解码 float PCM 检查 cue 是否随锚点移动；其虚构媒体和合成音只证明技术连线，不证明真实口播对齐、音乐/音效听感或作品质量。

timeline/2 的 `units[]` 包含完整 source/presentation 序列，始终使用同一个 compiler sample clock；`clips[]` 只用于需要来源素材的消费者。`bind-speech.mjs` 可用 `{kind:"presentation",presentationId,edge}` 解析无口播展示段的边界，但不能生成伪造词/句段锚点。已有手写 `filmTimeSec` 事件是绝对片内时刻，修订 timeline 后不会自动平移；每个当前事件都要在新 bindings 按 ID 明确保留绝对值或重映射，否则拒绝绑定。时间修订后从新 timeline 重做 speech binding 和 audio plan，旧 phase/event receipt 不自动变成新版本。

若 timeline/2 原声已有真实 asrcut exporter artifact/receipt，按 [音乐、音效与静音设计](sound-design.md) 的 `prepare-asrcut-plan` 命令生成下游音轨计划。该命令读冻结 plan/timeline、receipt 和已导出的 WAV，核验 revision/hash/canonical compiler 输出与 PCM 样本数；它将整份 WAV 仅放入一条从 sample 0 开始的锁定 voice track，并只将编译 source-unit 目标范围作为保守 voiceWindows。原声里的停顿可能落在窗口中；presentation 窗口单独保留其视觉/audio handoff，不借麦克风录音判定 final mix silence。后续 `renderAudioPlan` 在任何输出前重新核验 evidence、WAV、计划 duration 和两类窗口，不重播 `clips`，也不会把过期 voiceWindows 延续到新 revision。普通 `/1` 工作继续沿用之前绑定和 audio-plan 路径。

`createTextBitmapCache` 先等 `document.fonts.ready`；可通过 `fontSet.load/check` 并设置 `requireFont:true`，对请求的字体与文本执行加载和必需字体可用性核验。该核验不逐字形保证字体覆盖；缺字或 fallback 仍按字体 Reference 检查最终实际字形。`get(text, style)` 支持 `font`、`fillStyle`、`strokeStyle`、`lineWidth`、`padding`、`align:"left"|"center"|"right"`、`baseline:"alphabetic"` 和 `blurPx`。`blurPx` 范围为 0 至 64，使用 Canvas2D `filter:blur(...)`；浏览器不支持或拒绝 filter 时不返回假柔化位图。`getVariants(text, style, softBlurPx=2)` 返回 `{clear,soft}` 两张实际缓存位图；可按同一文本在柔化和清晰状态间切换。位图按文本、字体/样式、blur 和字体加载世代作 key，以正整数 `maxEntries` 限制 LRU 容量（默认 128）；字体 `loadingdone/loadingerror` 会失效，调用方也可 `invalidate()` 或 `dispose()`。模糊留边由缓存实际扩展，绘制时 `bitmap.draw(ctx,x,y)` 仍以对应文本锚点和 alphabetic baseline 定位；此接口不是完整多行排版或多分辨率纹理引擎。`withLocalMask` 用 Canvas save/restore 包围单次局部绘制；mask 的路径、时间变化和层级仍由作品 custom draw 决定。以上工具不替代字体 Reference 对字体文件、字重、fallback、字形边界和有效阅读窗的检查。

### 可选的必需布局证据门禁与文字像素探针

这些字段和 CLI 旗标是共享 runner 的 opt-in 接口，用于保留旧工程普通渲染兼容；scene 顶层 schema 与 `MotionCore` 保持不变。对新建/重写的本地 Canvas 工程，若必读文字或附着标注承担成片职责，蓝图须声明应可读对象及其布局/阅读窗口，并让真实字形与完整组几何同时进入文字/部件绘制和帧证据。使用共享 runner 时，对这些窗口启用 `--require-layout-evidence`；采用其他 renderer 时，则须提供真实测量→最终坐标与部件绘制→对应编码帧证据的等价闭环。字段未声明或测量未被绘制器消费时只能记未检查/不完整，不能称该版制作验收完成；未触及的旧工程范围保持原样。

对需核验的布局窗口，在 blueprint 已存在的对象 `data` 中声明 `motionEvidence.layoutEvidenceRequirements`，并显式启用 `--require-layout-evidence`：

```json
{
  "id": "caption-read-window",
  "scope": "caption-layout",
  "startSec": 1.1,
  "endSec": 2.35,
  "expectedIds": ["caption-title", "model-label"]
}
```

每个对象可声明一个或多个 requirement；每项的 `id` 唯一，`scope` 非空，`startSec/endSec` 是成片秒的半开区间 `[startSec,endSec)`，且必须覆盖至少一个编码帧。边界不必正好落在帧点：门禁检查时间戳位于区间内的每一帧。单个 `layoutFrame` 每帧返回一个 scope，因此 requirement 时间窗不得相互重叠；重叠范围应合并为同一项并合并其 `expectedIds`。这些 ID 来自蓝图，不得只从 `layoutFrame` 当前登记清单反向生成。

若某窗口确实没有需布局检查的对象，使用 `expectedIds: []`，并同时写 `intentionallyEmpty: true` 和非空 `reason`。空声明只有在相同 scope、时码、画幅的有效 snapshot 中 `items: []` 时才算完整。普通窗口则须包含每个蓝图 `expectedIds` 对应的真实屏幕坐标矩形。`window.MOTION_EVIDENCE.layoutFrame(timeSec, scene, canvas, MotionOps)` 必须在普通帧完成实际绘制后，从同一次绘制的真实几何和层/变换状态返回 `MotionOps.diagnoseLayout(...)` 生成的 `motion-layout-snapshot/v1` 快照。测量、`composeLabelGeometry`、最终锚点与 `items` 登记必须接到真实绘制消费者；只生成报告数据不算接通。

门禁按 blueprint expected IDs 重验每一帧的 `schema`、scope、时间码、viewport 与实际 items。缺少、陈旧、损坏或缺 ID 的一帧都会使要求不完整，并在 FFmpeg 写出/提交输出前阻止输出提交；缓存中的诊断帧可以保留。允许空窗口也是完整性核对，不是“无布局问题”的结论。manifest 的 `requiredLayoutEvidence.status` 仅为 `complete` 或 `incomplete`，含义是所声明范围内证据完整，不是几何无碰撞、文字无遮挡、整场景或审美通过。未启用门禁时原有渲染行为继续兼容。

只有关键文字的首读、遮挡交接或遮罩揭示点需要额外像素诊断时，再在同一 `objects[].data.motionEvidence` 中声明 `textVisibilityProbes`，并启用 `--check-text-visibility`。每项填写唯一 `id`、`targetId`、非空 `text`、落在场景内的编码帧 `timeSec`、预期 `complete|partial|hidden`，可选 `referencePaddingPx`（1–512，默认 64）及 `blendMode`。不应对所有帧做这类三次绘制。

普通帧 A 使用逐帧阶段首次正常绘制并写入输出 PNG 的原始像素。`window.MOTION_EVIDENCE.drawTextVisibilityVariant({probe,variant,timeSec,scene,canvas,context,MotionCore,MotionOps,renderers})` 需针对同一目标提供 B (`variant: "scene-without-target"`：相同 scene/时间但不绘制 target) 和 C (`variant: "unmasked-target"`：目标字形不受遮罩/后续层遮挡，保持实际字体、变换与样式；画布四周由 runner 按 padding 扩展)。两种返回对象都须包含 `status:"rendered"`、相同 `targetId/text/font/styleSignature/transformSignature`、`blendMode:"source-over"`，以及 `sourceGlyphStatus:"present"|"absent"|"font-fallback"|"unsupported"`。这项 source 状态由拥有真实字形/字体信息的绘制器报告；它不能从可见像素推断成“原字体有字”，因为系统 fallback 也可能画出方框或替代 glyph。

runner 比较 A 与 B 在 C 的非透明字形位置上是否有像素贡献，并将 C 超出实际画幅的 ink 单独计为 clipping；manifest 仅列 ink/contribution/missing/clipped 像素数，不使用通用百分比阈值。来源明确报告 absent 时记下缺字并保持 `not-checked`；fallback、unsupported、缺少 hook/元数据、非 `source-over` 合成或空的 C 都保持 `not-checked`，不能当作目标已画出。全量像素贡献且无裁切为 `complete`，部分贡献或裁切为 `partial`，没有目标贡献为 `hidden`。在 A/B/C 后 runner 再按同一时刻正常重绘 A，并逐像素与原始 A 对照；一致才算 `checked`，不一致的 probe 保留为 `not-checked`，`matchesExpected` 也不成立。对照结束后恢复画布像素到 A；输出 PNG 已在探针前写入，不会被重复绘制替换。hook 需要按绝对时刻确定性绘制，不得把探针状态带入正常播放。

像素探针只证明声明目标在该编码帧上的机械 ink 贡献和裁切/遮挡范围；文本语义、实际字体字形正确性、对比度是否适合、连续阅读时长、理解程度、画面美感以及未声明的其他层仍要按真实媒介独立检查。把“matches expected”限定为 probe 自己的局部判据，不能报告整场景可读或已通过。

若 `ease` 省略，默认 `linear`。本地 scene 接受的名称是 `linear`、`smooth`、`ease-in-out-cubic`、`ease-out-cubic` 和 `ease-in-cubic`；校验与求值均会拒绝未知名称，不会静默换成线性。通用插值会把归一进程限制在 `[0,1]`，所以不产生过冲；需弹性越界或其他特殊轨迹时，优先保留成熟源入口/函数的真实接口，在作品本地 custom consumer 中接线并检查；确无适用原件才局部实现，不伪称标准事件支持。

### 动态 Motion 操作的严格收据

本地动态跟随框及其局部覆盖范围、可用字段和显式不支持项见 [Motion 操作与绘制证据契约](motion-runtime-contract.md)。选用 `laohu.motion-follow-box/1` 时，只声明真实 scene-local 时间窗和精确 operation instance；strict render 使用 `--require-motion-evidence`，缺 expected、缺 draw hook、missing/unsupported、陈旧状态、viewport/clock 不匹配或零覆盖会在提交 MP4 前失败。窗口使用半开 `[startSec,endSec)` 编码帧语义。

成功后运行 `scripts/motion-probe.mjs --scene <absolute-scene> --manifest <absolute-manifest>`。manifest 的 input fingerprints 绑定 scene 字节、draw module（明确记录未提供哨兵）、MotionCore、MotionOps provider 与 catalog/operation entry；probe 重读并核对这些文件，拒绝同路径内容已变的旧收据。对浏览器实际请求到的 image/font/script 等资源，manifest 记录可见 URL、响应元数据与可哈希响应体；probe 重核本地 file URL。系统字体解析、inline/data/blob 内容和未暴露请求不在这项资源收据覆盖范围内。探针只证明局部绘制与输入/帧/输出一致，不证明完整实体可见、跨 renderer handoff、全片运动覆盖、可读性或审美。

### 局部 Core 接线与技术诊断命令

`scripts/render.mjs` 用本机现有 Playwright/browser 逐帧调用 Canvas core，再把 PNG 序列交给本机 FFmpeg 输出无声 H.264 MP4。它不会自动消费 scene 的音频字段，也不替代可混音、3D、剪辑或现有模板工程。若有旁白、BGM、SFX 或既有音轨，由作品构建把同一语义事件表导出为内部 audio-plan；`scripts/audio.mjs` 核对共享 event ID、asset index/项目资产 hash 与授权状态，按成片时间裁切、变速/增益/包络、混音并可 mux 到画面 MP4。其支持范围、candidate 开关、静音和 locked 轨边界见 [音乐、音效与静音设计](sound-design.md)。Core 自带插值只是其有限接口；已选成熟效果的特殊曲线、相机和排版直接走原入口或预加载的源函数，不从曲线摘要重写。此 runner 不会因 catalog 有模板就自动使用它；custom draw 也不会自动继承字体、配色、声音或原生镜头设计。

技术接线前在目标工程确认 Playwright、浏览器和 FFmpeg，并把缓存与输出放在同盘。`render.mjs` 通过共享 `laohu-motion-runtime.mjs` 解析并核对 Playwright 包身份与版本（当前固定 `1.55.0`），次序为显式 runtime 配置/`NODE_PATH`、项目依赖、skill runtime、已有项目 runtime cache；manifest 记录实际解析来源、包版本与项目内相对路径。该 resolver 只负责 Node 包，不负责安装/下载浏览器或 FFmpeg；浏览器与 FFmpeg 沿原 preflight 检查。`NODE_PATH` 是显式覆盖入口，不是普通 CLI 必需条件。实际 scene 与 draw-module 必须已存在且承接本片蓝图，不使用基础 marker 场景充当制作模板。显式命令参数见本脚本 --help 及模板库的对应 renderer 命令。

音频 consumer 要求 `--video` 是无音轨的 picture-only 输入，长度至少覆盖 plan 的 `durationSec`；遇到带音轨视频会拒绝封装，避免静默丢掉用户素材。需要保留的既有音轨须由作品构建显式登记为受保护的 locked 计划轨，或继续使用原工程的混音封装路径；本工具不会自动透传视频内音轨。音频事件必须有可判定的全局/局部时钟及映射，失败的长度或路径保护检查发生在写输出前。最终检查实际时长和音轨流；无事件且无轨道时，视频只封装画面，不创建静音音轨。完成有声最终 mux 后，可用 `node .agents/skills/laohu-motion/scripts/laohu-audio-check.mjs <muxed-file> --out-dir <WORK_ROOT>/.cache/validation/audio-check/<片名>` 检查最终实际音频流的时长、声道/采样格式、stereo EBU R128 响度及 PCM 诊断；若要看蓝图事件窗口，另传 `--windows <文件>`，格式须为 `{format:"laohu.motion.audio-check-windows/1",timeBasis:"film-global",windows:[{eventId,startSec,endSec,label?}]}`，时间只能从同一 Film 事件/当前蓝图派生，checker 只测量、不移动事件。命令中的输出目录须落在当前作品的 `WORK_ROOT/.cache/validation/`，不能写进 skill 安装目录。检测以首视频流零点为时间基准，保留真实音轨起始偏移与 PTS 缺口；音频缺失的尾部如实报告，不补造静音。PCM 的 mono 诊断由双声道合成，反相内容可能抵消，所以它不能代替 stereo EBU R128 事实，也不等于人工试听。频谱和波形只用于定位异常，不能证明声音合适、好听、与画面同步或听审通过；不设通用 LUFS/频带阈值替代具体平台目标与完整成片听审。

`--draw-module PATH` 是可选参数，只在本地已有对应文件时传入；它可注册 `window.MOTION_RENDERERS["custom:name"]`，供对象绘制回调消费，并可调用已经加载的 `window.MotionOps`。若自定义字体、图像或其他异步资源需要先加载，先通过 `window.MOTION_READY` 提供 Promise 或返回 Promise 的函数；runner 会先等待 `document.fonts.ready` 和该资源钩子，钩子拒绝或返回 `false` 就停止，不输出伪完整帧。浏览器 profile、PNG 帧、样本帧及浏览器/FFmpeg 子进程临时文件使用显式 `--cache-dir` 下的运行目录；为支持同盘原子替换，编码中的 `.part.mp4` 暂存文件位于目标 MP4 旁边，因此输出目录也需要临时空间。runner 不下载浏览器、不安装依赖。输出已存在时默认拒绝覆盖，用户明确指定 `--overwrite` 才替换给定路径。

runner 的 manifest 记录场景规格、输出、实际帧目录、样本帧和事件属性值。对非整帧时间请求，样本另存为单独预览并标成 `separate-preview`，不会冒充 MP4 编码帧。每项事件分别记录自身声明的理想终值、事件结束后首个编码时刻的实际目标属性值、后续事件是否已接管、运动期最后帧和片尾最后编码帧实际值。`settledInEncodedMedia` 只表示首个可用编码时刻的该目标属性与本事件自身 `to` 值相符；后续事件可能在首帧前接管而使其未出现。它不证明对象未被其他图层透明度或遮罩隐藏，也不证明结果语义完整或已充分落定。若动作恰在片尾结束，离散帧可能没有端点；不能把理想端点状态说成已经出现在成片中。

`layoutDiagnostics` 是可选的逐绘制几何记录：`not-checked` 表示没有可用矩形快照，包括全缺失或全空快照；`invalid-evidence` 表示收到的快照均因时码陈旧或结构损坏而不可用；`partial` 表示存在有效帧但覆盖中还含缺失、空、陈旧、损坏、部分登记或未声明 expected IDs；`scoped` 仅表示每个编码帧都在 producer 声明的范围内提供了完整登记矩形。`scoped` 不是整张场景通过；没有期望 ID 清单时也不能证明该 producer 没漏登记对象。冲突与出界汇总仅取实际编码帧，按帧序保存首末时间码；manifest 为预览样本另列诊断，避免默认预览落在编码帧时把同一冲突重复计数或覆盖其编码时间。样本预览单独统计，不替代编码帧。冲突是可能相交的包围框，不等于像素确实遮住；装饰性/有意叠放须显式列入允许 ID 对，之后仍要看实际画面。

机器 manifest 与语义蓝图互相对照：它能证明某事件字段、属性映射和输出帧存在，不能证明动作解释正确、画面有美感、节奏好或观众看懂。若画面来自其他引擎，按等价工程映射检查即可，不要求生成这份 JSON 或使用此 runner。

<a id="remotion-root-composition"></a>
### Remotion 作为组合与渲染宿主

Motion 的标准 Film/Shotcraft 组合使用项目本地 Remotion `4.0.537` 包；安装清单和锁文件只以 `templates/runtime/laohu-remotion/package.json` 与 `package-lock.json` 为准，运行闭包按版本与 lock SHA 选择在当前项目 `.cache/tmp/laohu-motion/remotion-runtime/` 下的独立目录。执行 `node .agents/skills/laohu-motion/scripts/laohu-motion-runtime-cli.mjs setup --work-root "$WORK_ROOT"` 只在该版本/锁文件目录缺少 `node_modules` 时安装；`doctor` 会核对包版本、Chrome/Chromium、FFmpeg，并通过真实本地 Canvas style render。`--skill-root`、`--work-root` 和 `--runtime-root` 是三个独立路径；显式 `--runtime-root` 只使用指定目录并保护其已有内容。依赖缓存、npm 临时文件、浏览器/渲染 cache 和输出均留在外接工作盘项目 `.cache`。

Remotion Composition 是时间和画幅宿主。片段可由 React/Canvas、SVG、原生 HTML、素材/视频或 Three 实现，按实际内容职责选择；Film `/2` 在唯一 segment 帧表上组装各底片。`renderScene` 回调应返回 React 子组件，Hook 放进该组件中；不要在回调本身调用 Hook。局部组件若消费 frame，就按 Remotion `Sequence` 内的局部帧约定；Film 的全局起止仍由已冻结的 Film/ASRcut 时钟决定。

<a id="remotion-timeline-caption-audio-contract"></a>
### Remotion 核心时间、字体、字幕与轨道 API

`templates/runtime/laohu-remotion/core/time.ts` 与 `timeline.ts` 是这组组件的共同基础：`frameAt(seconds,fps)` 对绝对秒取整；场景 `frameRange` 分别量化 start/end，不能先量化段长再累计；`inRange` 使用半开区间；`useTime(globalFromFrame)` 返回当前 Sequence 局部秒及可选绝对秒。`layoutScenes` 检查唯一 ID、递增 end 和最多两场重叠；`schedule` 接受显式 overlap；`taskDuration` 不可短于最后场景，可把必要尾音纳入总长。Film/ASRcut 路由继续使用各自的 canonical compiler，不重新用 `schedule` 造第二条成片时间轴。

`eventTimeline(events,basis,sourceHash)` 严格分开 `planned` 与 `measured`。测量事件须带当前音轨 hash 与 evidence；词锚还须有 word、occurrence 和 source span。它不会自动测拍、判断半速/倍速，也不允许旧音轨的测量被默认为新版本有效。独立纯函数 `core/audio/beat-grid.mjs` 另有秒/帧/样本互换、`beatGrid`、`tempoCandidates`、`snapEvents` 和 `sfxStart`；beat grid 始终标作 planned，`snapEvents` 只消费同 hash、有 evidence 的 measured beats 且需显式许可、容差和范围。它不读音频或自动测拍；SFX 起音由 `contactAt - peakOffset` 得出，负起点须设计 pre-roll，不能钳成 0。

`useFonts(fontManifest)` 通过共享 Promise 加载指定 public 字体并平衡 Remotion `delayRender`/`continueRender`；清单运行期间保持稳定，换清单时用新 key 重挂载，失败停止 render。`measureCN` 只量浏览器当前字体排版，不验证 cmap 覆盖或可变字轴是否真实生效。`core/captions.tsx` 的字幕必须由作者给定一至两行语义断行；`cueFromCaption` 只把 ASR `startMs/endMs` 转成秒，重叠 caption 会拒绝。它不靠空格拆中文、不自动分页或自动缩字号。

`AudioTracks` 使用成片全局秒，在根 Composition 放一次；`trimSeconds` 是源文件起点，轨道起点才是时间轴位置。music 轨可按真实 voice windows duck；SFX 按接触点提前量起播，负起点必须补 pre-roll。Motion Film 的 picture renderer 仍输出 muted/no-audio 视频；最终混音只由既有 `scripts/audio.mjs` 从 audio-plan 完成一次，因此此 Remotion helper 不构成第二条最终混音路径。

<a id="remotion-data-ui-media"></a>
### 数据图、图片与 UI 组件

`components/data-ui/index.tsx` 提供 `dataValue`/`numberText`/`CountUp`、`AnimatedBars`、按总路径长度揭示的 `LineReveal`、显式 keys 的 `Cursor`、`typingTimes`/`TypeIn`、带必填 label 的 `DeviceFrame`、保留原图宽高与归一化焦点的 `KenBurns`、有明确 slot 时间/源尺寸的 `PhotoMontage`，以及 `greatCircle`/`GeoRoute`。图表调用必须传真实数据或标明示例来源，domain/rank/family/sourceLabel 由调用方明确；图表不是自动图形语法/自动刻度布局。图片路径相对 public，需由 `Img` 等真实 consumer 等待加载；间隙显示底色、重叠 slot 会报错。地图 route 仅是示意线，近对跖需人工途经点，不能借它证明真实行程或面积。

<a id="remotion-craft-materials"></a>
### 材质与手绘组件的原单位

`components/materials/lineart`、`handdrawn`、`pixel` 和 `typography/craft` 保留原始参数/时间关系。Lineart 的 path 进度与 `Oneline`/`chainPen` 以帧输入；手绘 `hold=2` 是输出帧 hold，不等于固定 12fps；PixelStage 由调用者传秒并做整数倍缩放；VarType、OutlineFill、TrackIn、Decode 的 `at/dur` 仍是帧，`HandReveal.cps` 则以字符/秒并按实际 fps 换成帧。拉丁像素字库缺汉字时会报缺字，不做近似替换。局部 blur/filter ID、路径缓存/零时长边界和字体清单按各组件源码约定；不要把全局 `t` 和局部帧混用。

## 选工具与进入工程

**从现有工程开始。** 用户提供动画、项目文件、素材或渲染结果时，先定位工程入口、依赖、脚本、资源路径、版本和输出说明，并核对实际文件。这样既能沿用有效结构，也能保护用户资产；进入修改前记录工程状态和可恢复位置。

**先定画面，再映射工具。** 从真实材料中锁定必须保真的身份、数量、条件、因果/先后/并列关系和用户硬约束；把造型、色彩关系、字体与排版、材料、光影、空间、信息组织、运动和镜头等未锁定项保留为开放设计变量。把本片需要的可见表现写清，再比较工具能否真实做到，最后按帧级控制、可编辑性、源媒体保真、三维/合成能力、渲染规模与交付格式选路。HTML/DOM 适合可读界面与排版，SVG/Canvas 适合需要路径形变或像素逐帧控制的部分，CSS 3D 适合平面透视；只有真实几何、相机、遮挡或材质需求才选 Three/WebGL。上述是能力映射，不是必须采用的工具清单；也不要求整片转成同一渲染器。用户指定且可行的工具或既有工程优先；以真实关键帧和最难动作的连续小样检查映射。

**先确认模糊工具名。** 对“Hyperion”“Revoition”等可能的听写词，结合上下文、现有项目和官方文档核对产品；`HyperFrames` 与 `Remotion` 只是检索候选，不代表用户已经选择。产品身份不清且会改变路线时，先澄清，不安装或调用不确定的工具。

**收费、全局安装和外传要先明确授权。** 发现路线需要新的付费软件、外部账户、付费接口、全局依赖或上传隐私素材时，先给出具体影响和可选方案，等待授权。能沿用现有本地工具就不扩大依赖；检查交付记录，确保没有未授权费用、账户操作、环境变化或素材外传。


## 从镜头规格到实际工程

<a id="motion-production-plan"></a>
### Standalone `production-plan.mjs` 的既有技术合同

`production-plan.mjs` 是仓库中真实存在的独立命令行工具，能校验和执行使用 `production-plan.json`、Film 与 audio-plan 的项目。下文只说明这个 standalone 工具已经实现的计划格式、reader/export 与 validator 行为；只有项目原本使用该工具或用户明确指定它时才适用。普通新 Motion 项目使用八 XML Brief、正式资源 L2 和 Showreel 原生 `render(t)`，不生成并行 production plan。保留该工具的 `/1`–`/5` schema、旧 reader/export、validator、脚本测试和相关适配器供真实项目继续打开，不批量改写旧项目。

#### Standalone plan schema：`/5` 与 `/3` 技术字段

在 standalone `production-plan` 格式内，`creativeDesign/1` 表示该格式下由计划文件保存的设计对象，含 `narrationMode`、`globalDirection`、逐观看单元 `cueDesigns` 与 `resourceFit`。`directorDesign/3` 是这套 standalone 工具的执行映射，使用 `creativeDesignRef:{id,sha256}` 绑定计划内的设计对象。它们是这个既有工具的文件/schema 字段，不定义当前普通 Motion 的 Analysis 创作职责或 handoff。

以下是该 standalone CLI 可读取的 `/5` 计划示例，供查阅现有文件字段；不是普通 Motion 新任务的生成模板。每个 cue 在 timeline 模式使用真实 `captionCueId`；script-only/none 由 `sourceRef:{materialId,locator}` 定位。计划会按此格式校验字段覆盖和来源绑定。

```json
{
  "format": "laohu.motion.production-plan/5",
  "creativeDesign": {
    "format": "laohu.motion.creative-design/1",
    "id": "<本次创意设计稳定 ID>",
    "narrationMode": "timeline",
    "globalDirection": {
      "audience": "<观众及其观看情境>",
      "centralIdea": "<本片要让观众看懂的中心表达>",
      "experience": "<全片观看体验>",
      "emotionalArc": "<由具体内容因果支持的情绪走势>",
      "visualLanguage": "<可继承的全局画面基线>",
      "soundLanguage": "<口播、音乐、音效的整体关系>",
      "continuity": "<画面如何保持同一世界并承接段落>",
      "avoid": ["<本片实际应避免的表现>"]
    },
    "cueDesigns": [
      {
        "id": "<cue ID>",
        "viewingUnitId": "<已有观看单元 ID>",
        "captionCueId": "<ASRcut manifest 中的真实字幕 cue ID>",
        "picturePrompt": "<能直接指导生成的完整可见画面与动作提示>",
        "actors": [
          {
            "id": "<画面主体 ID>",
            "role": "<主体在本镜中的作用>",
            "meaning": "<主体承载的内容含义>",
            "appearance": "<形状、材质、颜色、光影与表面处理>",
            "placement": "<在画面中的大小、位置、朝向、层级与空间关系>"
          }
        ],
        "foregroundText": [
          {
            "id": "<独立屏显文字 ID>",
            "text": "<准确屏显内容>",
            "role": "<标题、标签、结论等文字职责>",
            "relationship": "<文字与主体/口播信息的关系>",
            "appearance": "<字体类别/字重/相对大小/颜色/可读性处理>",
            "placement": "<屏幕叠字、物体表面或空间文字及其位置/遮挡关系>"
          }
        ],
        "before": "<开始时实际可见状态>",
        "process": "<随内容推进发生的可见变化>",
        "after": "<动作结束后实际落定状态>",
        "focus": {
          "primaryActorId": "<actors 中唯一主要焦点>",
          "supportingActorIds": [],
          "handoff": "<本 cue 如何把视线交接给下一内容>"
        },
        "emotion": {
          "from": "<进入本 cue 前的情绪状态>",
          "to": "<本 cue 后的情绪状态，可以延续或改变>",
          "mechanism": "<由哪项可见动作/声画因果造成>"
        },
        "sound": {
          "voice": "<口播如何保留/让位>",
          "music": "<音乐职责、段落变化或留白>",
          "sfx": "<具体动作声及其声画关系>",
          "fallback": "<实际缺源时的检索/编辑/回退规则>"
        }
      }
    ],
    "resourceFit": []
  }
}
```

上例中的 `captionCueId` 与 `sourceRef` 是互斥来源字段；`actors`、`foregroundText` 的 `appearance/placement` 及其它 cue 字段按 `/5` 合同必填。`resourceFit` 每项只记录实际被选中的资源任务：`resourceTaskId`、`context`、`requirements`、`outcome`；`fit` 或 `adapted-fit` 结论还需真实的 `evidence`。音频证据用 `method:"context-audition"`，视觉素材用 `method:"visual-inspection"`，并绑定 `kind/assetId/sha256/observer/recordMaterialId/recordLocator/contextStartSec/contextEndSec/observation`；筛选页和技术预览不能充当适配审查。Direction 的结构验证仅检查字段、引用与覆盖关系，不验证设计美学或证据行为。

在该 standalone schema 中，`directorDesign/3` reader 要求 `creativeDesignRef` 位于 `directorDesign` 对象内，并绑定计划内设计 ID 与 canonical JSON SHA-256；其余字段是这个 schema 的校验输入。绑定片段如下：

```json
{
  "directorDesign": {
    "format": "laohu.motion.director-design/3",
    "id": "<Motion 技术实现 ID>",
    "creativeDesignRef": {
      "id": "<与 creativeDesign.id 完全相同>",
      "sha256": "<canonical creativeDesign/1 JSON 的 64 位 SHA-256>"
    }
  }
}
```

方向稿由同一计划导出，默认是 creative view；`--view technical` 只有在当前 D3/3 已绑定该精确创意身份后才可导出。示例命令见下文。

人读设计视图必须来自同一个 plan，分为输入/锁定项、开场视听基线、按源时钟排序的逐 cue 画面提示三部分，不另外手写平行导演稿。用现有命令导出：

```sh
node .agents/skills/laohu-motion/scripts/production-plan.mjs export-design \
  --plan "$WORK_ROOT/production-plan.json" \
  --output "$WORK_ROOT/production/design/director-design.md" \
  --stage direction --view creative
```

D3/3 完成并绑定创意设计后，若要检查技术实现视图，显式使用 `--view technical`；此视图不是交给创作模型的替代导演意图：

```sh
node .agents/skills/laohu-motion/scripts/production-plan.mjs export-design \
  --plan "$WORK_ROOT/production-plan.json" \
  --output "$WORK_ROOT/production/design/director-technical.md" \
  --stage direction --view technical
```

在 standalone 工具的 `direction` 阶段，validator 检查设计结构、来源身份与 cue 覆盖；这只证明该格式的字段/引用/覆盖完整，不能证明设计质量或声音适配。`production` 阶段再核对 `/3` 对设计的身份绑定、实际 consumer 和呈现回执。真实关键态、播放、听审和接受度仍分别按其证据验收。

#### 历史 `/1`–`/4` 格式兼容说明

历史 `/3` 的 `directorDesign/2` 合同保留其既有 reader/export 行为：`viewingUnits`、`directionDecisions`、`implementationPlan`、`shots` 与来源校验，以及 ten-part `brief`、全局设置、单位、讲述 cue、文字、动作/声音/资源字段。它们是旧计划兼容说明，不是新正式工作应创建的格式。不得把旧字段/旧 plan relabel 为当前 `/5` 创意设计或 D3。

旧 `/3` 的 `scriptCues[]`、`narration:none`、`screenText.none|planned` 和 action/source-clock 说明按该版合同兼容读取。其旧字段允许的词/句锚、自然语言时序和声音映射不会自动创建 D3 attention phases，也不能证明字幕/画面实际清晰。

历史 `/4` 的 `directorDesign/3` 用顶层 `attentionPhases[]` 与每个单位的 `attentionPhaseIds[]` 记录实际时间阶段。该格式继续按其旧 reader 逻辑读取，不是当前 `/5` 的创意设计结构。旧 `/4` 每 phase 必须有 `{id,viewingUnitId,anchors,mainTask,actorBindings,camera,readingZones,readWindows,actionIds,sound,completion,handoff}`。`mainTask` 是唯一主要观看任务 `{id,kind,description,actorIds}`；actors 可以组成比较组、空间关系、路径或过程。timeline 模式 anchors 必须为 `{basis:"canonical-units",rows:[...]}`。row 的精确形式为 `{kind:"caption",captionCueId,tokenIds[]}`、`{kind:"caption",captionCueId,segmentId}`、`{kind:"presentation",presentationId}` 或 `{kind:"source-clip",occurrenceId,edge:"start"|"end"}`。caption token/segment 锚点必须沿 manifest 原顺序连续且恰好分配一次；一个 caption cue 可以跨 phase，词级 cue 只在连续 token 边界拆分，segment cue 整段归属一个 phase。presentation 引用实际 timeline/2 展示 unit；source-clip 指向实际保留片段边界，可与首词锚共同承接真实前导段。无旁白/纯稿使用 `{basis:"semantic-budget",cueIds,startFrame,endFrame,fps}`；没有 cue 时 `cueIds` 可为空，但仍需真实帧预算，不能伪造词时码或 source audio。phase 边界和 token partition 只描述观看任务的时间归属，不自动要求镜头切换或词锚点间空帧；自然停顿里可以保持仍在服务当前任务的构图和对象关系，不增造 cue。一个 action 可以跨 cue/phase 继续，相关 phase 复用其真实 action ID；只绑定本阶段承担当前任务的 actors，不把全片对象列表重复塞进每个 phase。

每条 caption cue 至少关联一个 phase-linked `readWindow`。字段为 `{id,taskId,groupId,captionCueIds,captionRange:{startCueId,endCueId}?,screenTextIds,screenTextRange:{startCueId,endCueId}?,reason}`，caption/text 分别使用自身真实 cue 范围。不同 `taskId` 或 `groupId` 的 reading windows 不得重叠；只有同一 task/group 中要并读的字幕与图形/标签可以共享窗口。`actorBindings[]` 定义具体 geometry/visibility/layout 的唯一 owner，并使用 `laohu-motion.attention-actor-style/1`；`owner` 指向 `phase.id`，`consumerRefs[]` 以 `{implementationPlanId,mappingId,fieldPath:"props.attentionPhases"}` 连接真实 mapping。相机使用 `laohu-motion.camera-rig/1`，阅读区域由 `readingZones` 关联 `laohu.motion.reading-zone-mask/1` 与实际窗口。phase 的 `actionIds`、sound/event IDs + `visualPhaseId`、completion、handoff 说明当前变化、读定和接续。`handoff.visualHold` 只接受 `retain-until-next-phase`、`retain-to-canonical-end` 或 `retain-to-frame-budget-end`；非末阶段必须连接时间上下一阶段并保持已完成画面覆盖真实时间间隔，末阶段则保持到 canonical timeline 末端或真实 semantic frame budget 末端。编译后的 phase rows 带 timeline `start/end`、cameraKeys、readingZones 与 actorBindings，按实际 mapping 过滤后绑定到 Film `/2` segment 的 `props.attentionPhases`，并以 `props.attentionGlobalFromSeconds` 传入该段时钟偏移；caption manifest 与解析样式分别绑定同一实际 segment 的 `props.captionManifest` 和 `props.captionStyle`。注册 `laohu-project-shot` 通过 `AttentionBridge phases={props.attentionPhases} globalFromSeconds={props.attentionGlobalFromSeconds}` 消费 phase，并在 timeline 语音字幕路径中通过 `Captions manifest={props.captionManifest} style={props.captionStyle}` 实际绘制字幕。历史 `/4` 的 route/binding receipt 应验证这些确切映射；自定义 Canvas 不支持时记录 gap。metadata、`focalOrder`、schema PASS 或 renderer 启动均不能单独证明画面改变，仍要检查生产回执和关键窗口的正常速度播放。

历史 `/3` + `directorDesign/2` 的 `export-design` 保持其既有 Markdown 顺序、cue/action 展示与校验语义；下方旧版字段说明仅供兼容阅读，不是新任务的出口。

历史 `/4` + `directorDesign/3` 的人读导出必须从同一已验证 JSON 和 ASRcut caption manifest 生成完整自然画面叙述，以及逐条 caption manifest cue 的六列表：**时间/字幕；主要观看任务/目标；具体画面与构图/材料/坐标；动作与动态竞争/交接；确切文字与字体/字号/颜色/区域/空间/图层/阅读窗；声音与完成条件**。字幕行文字、显示行与窗口来自经核验 manifest；caption cue 通过 `attentionPhases[].anchors.rows.captionCueId/tokenIds|segmentId` 指回其 phase 与真实词/句锚。同一 caption 可以跨多个阶段，同一阶段也可以覆盖多条 caption；导出须逐行显示实际关联阶段，且保持原 source token/segment 精度，不为了表格生成假时间码、词时码或字幕切镜。复杂 cue 的变化再附动作子表，列真实锚点/主体、前中后状态、支持对象和 handoff。

六列表中的目标列对应 phase 唯一 `mainTask`，可为比较组、关系/路径、过程、文字、人物情绪或整体氛围。phase 局部坐标/层级/可见状态从实际 `actorBindings`、caption phase 和 `screenText` 决定；样式从 `globalSettings.textStyles` 的 font family/weight/size/color/line-height/spacing 等实际值解析，不留下“请 Motion 补位置/大小/颜色”一类开放工作。支持/背景是否让位、何处允许遮罩/压暗/模糊、声音何时伴随或避开读窗，都写明具体作用范围；强烈表现可保留，只要它支持当前任务且支持文字/证据仍按设计可读。Direction 仍将未绑定的 consumer 标为计划状态；对历史 `/4` 计划，真实生产消费只在对应生产校验和 Film/audio receipt 均匹配后报告。两阶段均拒绝覆盖手工维护的文件：

带语音的 timeline D3 必须要求 `globalSettings.captionStyle`，字段为 `{textStyleId,function:"subtitle",spatialRelation:"screen-overlay",temporalBehavior:"caption-manifest-display-window",coordinateSpace:"output-pixels",x,y,width,height,zIndex,alignment,background,paddingPx,maxLines,consumerMappings:[{implementationPlanId,mappingId}]}`。`textStyleId` 指向 `globalSettings.textStyles[]` 的实测样式；geometry 必须落在完整画幅内，consumer mapping 绑定实际 `laohu-project-shot` 的 `props.captionStyle`。对应 textStyle 的 `consumerMappings[]` 逐项映射 `fontFamily/fontWeight/sizePx/color/lineHeight/letterSpacing`（有本地字体文件时也映射 `fontFile`）到 captionStyle props。当前 receiver 接受 `maxLines` 一或两行，这是编译器/renderer 的技术限制，不是文本长度或阅读质量标准；装不下时重分语义字幕或报告实际 receiver 缺口，不缩小/隐藏内容。caption manifest 与解析后的 captionStyle 由注册的 `Captions` 实际消费；若缺接线则不能仅因设计字段齐全而报告消费完成。script-only/无旁白分支不能借这套 subtitle style/ASR manifest 制造字幕锚点。

```sh
node .agents/skills/laohu-motion/scripts/production-plan.mjs export-design \
  --plan "$WORK_ROOT/production-plan.json" \
  --output "$WORK_ROOT/production/design/director-design.md"

# 已完成 production 并有真实 Film 与 audio.mjs 收据后，可导出带核验消费状态的版本
node .agents/skills/laohu-motion/scripts/production-plan.mjs export-design \
  --plan "$WORK_ROOT/production-plan.json" \
  --output "$WORK_ROOT/production/design/director-design.md" \
  --stage production --ffmpeg "$MOTION_FFMPEG"
```

文件字体必须由 `textStyles[]` 的 `consumerMappings[]` 指到实际 renderer 字段，并核对 family、weight、size、color、lineHeight、letterSpacing。文件模式还须用 `fontMaterialId` 指向输入 hash；Remotion project-shot 的 `useFonts()` 通过 `FontFace.load()`、`document.fonts.ready` 与 `document.fonts.check()` 后，实际 `renderMedia` callback 才把 loader 事件写进 project-shot 与 Film receipt。若 `FontFace.weight` 是可变字体范围，事件保留原范围，并对合法范围端点及每个实际消费字重分别执行 `document.fonts.check()`；正式校验要求范围包含样式字重且收据列出该字重的成功检查。单个 `normal`、`bold` 与数值字重按 CSS 等价值对应。此证据只表示该文件在这些 CSS 检查下已加载，不证明字体内部真实轴、cmap 覆盖、每个字形没有 fallback 或版面可读；系统字体没有对应加载/测量回执时保持 `not-checked`，不能通过正式字体门。

声音设计记录在每单元 `sound`：`intent.sfx/music` 是 `none` 或 `designed`，并配 `reason` 与真正存在于 audio-plan 的 `eventIds/trackIds`。没有声音的设计需明确写 `none`；计划获取或试听中的声音则写 `designed`，不能用“pending”伪装静音。若声音确实要和一个画面动作同步，`syncCues` 只引用本单元真实的 `audio-event`/`audio-track`、现存 action ID、相同 `phase` 及两者的关系说明；它不是自由时间戳，不复制音频时码。声音可自然铺底而不逐镜同步，也无需每个动作配一次音效。

`directorDesign.resourceTasks[]` 将尚缺的真实素材需求交给明确 consumer。每项说明角色、用途、关联观看单元/动作、查询词、筛选标准、取得责任方、获取/处理/权利核验/验收/失败步骤以及实际 consumer target。当前 `acquisitionPlan.owner` 在代码中只校验为非空责任标识，不是封闭角色枚举，也不会因字符串值自动调用相应 Skill 或执行下载；可按任务写明确的责任人/能力，例如 `analysis`、`motion`、`asrcut`、`laohu-assets` 或 `laohu-arrangement-sfx`，并在 `method` 与步骤中写明真实操作入口。已搜到具体候选时 `selection` 要绑定真实 `materialId` 或音频 `assetId`、许可、可验证的 `sourceUrl` 或精确 `sourceLocator`；尚未搜到时允许 `selection: null`，但必须保持 `status: "pending"`，明确下一步实际怎么找，绝不伪造 URL、ID 或“已取得”状态。执行中的“未检索、已检索但未选定、已取得待核验”是工作事实，不是新增的 schema 状态：把真实搜索/获取回执作为 `inputs.sourceMaterials[]` 中的 path/hash 来源记录，并在 `retrievalSteps` 或 `failureAction` 指向该回执和覆盖范围。继续任务前先读回执；检索范围及筛选条件未变时沿用已查证范围，不重复搜索。`pending` 不是完成的最终交付：进入正式 production 时，任务必须对应已经取得、权利边界已核验、且被 Film/audio-plan 精确消费的素材。完成后 `status: "satisfied"` 携带真实 `actualSha256` 与 `rightsReview`；rights review 分别记录源文件能否再次分发和能否同步进成片，指向项目中的可核证据。素材任务可以由 Analysis 在设计阶段直接获取，也可转交 Motion 或相关专业能力；按 `docs/runtime.md` 的费用、凭据、外传和范围规则处理。库存为空不授权模型改用臆造/程序生成素材；原创声音仍是需特定授权的末级路径。

计划文件是可读审计文件，执行以现有入口为准。先对真实输入和完整设计做逐阶段校验：

```sh
node .agents/skills/laohu-motion/scripts/production-plan.mjs validate --plan "$WORK_ROOT/production-plan.json" --stage inputs
node .agents/skills/laohu-motion/scripts/production-plan.mjs validate --plan "$WORK_ROOT/production-plan.json" --stage direction
node .agents/skills/laohu-motion/scripts/production-plan.mjs validate --plan "$WORK_ROOT/production-plan.json" --stage production
```

在 standalone validator 中，`inputs` 核验计划结构、材料路径/hash、ASRcut 引用和锁定输入；`direction` 核验该计划的设计字段、caption/source 引用、来源证据、路线声明与 consumer 绑定声明，但不证明 consumer 已实际接入或工作；`/5` 还校验 `creativeDesign/1`、逐 cue 覆盖和资源证据。锁定的 `/3`+`directorDesign/2` 与 `/4`+`directorDesign/3` 文件保留各自的 schema/reader。`production` 才核验该工具所需的实际媒体、consumer receipts、素材权利记录及关键帧证明；方向检查不是渲染前的消费证明。此段描述 `production-plan.mjs` 自身的调用合同，不增加普通 Motion 的必读资源门槛或设计格式。

执行前 preflight 与完成后证据分别处理。`render-film`/`run` 会重验真实来源、work-module/依赖/素材 hash、路线、mapping 和计划选择的 segment/local frame；最终 Film/PNG 必须是空闲的新输出路径，运行时拒绝覆盖既有输出。项目级 `laohu-project-shot` 可在计划中指定真实 segment/mapping 和 local `frameIndex`；渲染后从**最终合成 `outputs.picture`** 抽取，按 segment `frameRange.startFrame + frameIndex` 取 global frame（例如 start 为 60、local 为 15，则取 global 75）。receipt 与 `planProof` 记录本地和全片帧号、最终 picture hash 与 Film manifest。PNG 保存在 `.cache/tmp/laohu-motion/production-plan/<work-id>/key-states/<run-id>/`；run receipt 保存在 `.cache/validation/laohu-motion/production-plan/<work-id>/`，记录图片/hash、帧映射及可复验的 planProof。它不自动改计划或 gate，也不替代审美/理解验收。若想单独复验，可将成功 run receipt 中 `projectShotKeyStates[].planProof` 加入 `candidate.keyStateEvidence[]` 再跑 `validate --stage production`；不要在渲染前编造未来输出 hash。

历史 `/3`+`directorDesign/2` 与历史 `/4`+`directorDesign/3` 都把完整导演设计、画面与同步声音的 Film 依赖、以及 canonical 时间依赖分别投影为 `directorDesignIdentitySha256`、`filmDesignIdentitySha256`，production binding 再提供 `boundDirectorDesignIdentitySha256`、`boundFilmDesignIdentitySha256` 和 `timingIdentitySha256`。完整导演身份包含全部十段 brief；Film 身份只排除纯音频字段 `brief.soundAndMix`，并把每单元声音收敛到 `sound.syncCues`，所以改动纯混音文字会改变完整设计身份，但不触发画面重渲染。同步关系、视觉设计和 canonical 时间仍参与 Film 身份，修改后旧 Film 不再匹配。资源取得状态与实际取得回执属于后续事实；真实来源选择属于设计，非同步音频素材不应无故污染画面身份。实际复用时要以当前 plan、audio-plan、Film manifest 与绑定 receipt 的身份是否一致为准：仅改变不参与画面或同步关系的混音参数时，先走 `render-audio` 的实际校验；若 action 绑定的声音 consumer、同步排期、Film 画面或 canonical 时间改变，旧 Film 不再匹配，应重新执行所需阶段。字段分离便于识别应重做的阶段，不证明 E2E 复用门已经完整通过，也不证明混音听感好坏；发生拒绝时按具体 receipt/validator 结果修正，不能凭“只是音量变化”绕过验证。

`verification.gates[]` 记录 `id/inspect/evidence/redoReason` 与 scope、criterion、artifact、observations、reviewer、status、redoLocation。媒体未生成时允许 `UNKNOWN` 且不虚填证据。非 UNKNOWN 必须绑真实工作目录 artifact 路径/hash 和精确关键帧或帧范围；creator/automated 最多 `OBSERVE`，格式本身不认证人工身份。工具能核对素材、合同、路径、receipt 和像素，不会判断构图是否有美感、内容是否好懂或声音是否沉浸。已知 `FAIL` 不能因其他证据缺失降成 `UNKNOWN`；技术校验通过不等于作品质量通过。

计划准备好后，按已有 Film/audio consumer 执行：

```sh
node .agents/skills/laohu-motion/scripts/production-plan.mjs render-film --plan "$WORK_ROOT/production-plan.json" --work-root "$WORK_ROOT"
node .agents/skills/laohu-motion/scripts/production-plan.mjs render-audio --plan "$WORK_ROOT/production-plan.json" --work-root "$WORK_ROOT"
node .agents/skills/laohu-motion/scripts/production-plan.mjs run \
  --plan "$WORK_ROOT/production-plan.json" \
  --work-root "$WORK_ROOT"
```

`render-film` 调现有 `templates.mjs render --film-blueprint`，支持 Film Blueprint `/1` 和 `/2`；`render-audio` 要求与计划匹配的 Film 收据/画面已存在，再按 Film 的全片时间与长度调用唯一 `audio.mjs` consumer 混音、写收据并封装成片；`run` 顺序执行两阶段。若 audio-plan 实际消费 `candidate-unreviewed`，只有计划精确列明这些候选且本次显式加入 `--allow-unreviewed-preview` 才可跑技术预览；该开关不代表听审通过。当前 runner 拒绝 `generatedAssets`，不会自动传 `--allow-generated-preview`。音源角色从[音乐、音效与静音设计](sound-design.md)的 `local-groups --duty <duty-id>` 和精确 `local-search --asset-id <assetId> --review-scope <用途>` 查起；命中、文件存在或源码标签均不等于适配这条片。素材检索的 `probe_unavailable` 是工具依赖问题，不是素材无效。按本轮成功 doctor/preflight 明确可执行文件：`sfx-sources.py local-search` 传 `--ffprobe "$MOTION_FFPROBE"`；`audio.mjs` 传 `--ffmpeg "$MOTION_FFMPEG"`，并确保配套同目录 ffprobe 已通过检查；`audio.mjs` 不接受单独 `--ffprobe` 或 `MOTION_FFPROBE` 覆盖。不得因环境故障判素材不合适或自动改用生成。

`run` 回执记录两类 consumer、输入 hash、产物、源状态与未审预览状态；若失败，会给出失败阶段和具体 `redoReason`，已完成阶段产物会保留。将原因退回相应的观看单元、方向/素材选择、shot mapping 或音频计划修改点。实际播放若发现画面或同期声不合适，也回到对应镜头的来源/素材/字段映射，或事件时间窗与 audio-plan 修订后重渲染、重混；成功收据只证明其记录的技术产物与映射存在，不能结束审美验收。最终编码媒体仍须按[检查最后的媒介](toolchain-render-and-check.md#检查最后的媒介)实际播放、定位问题并完成接收检查。

仅当用户明确指定 standalone `production-plan.mjs` 项目或继续已有计划格式时，才在该工具内按对应 schema 运行 `verify-delivery` 与 production 校验；现有 `/3`、`/4` 文件继续走各自 reader。此路线会核验 audio-manifest/1 的文件/hash、实际 WAV、Film 时长和 mux、audioStream、track/event ID/bus/asset、voiceWindows、字体加载回执和 consumer 证据。以下仍是该工具的技术命令，不是普通 Motion 项目的创作入口：

```sh
node .agents/skills/laohu-motion/scripts/production-plan.mjs verify-delivery \
  --plan "$WORK_ROOT/production-plan.json" \
  --ffmpeg "$MOTION_FFMPEG"
```

这是该 standalone 工具的交付技术验收入口；它输出 `creativeQuality: "UNKNOWN"`，不代替人工播放或审美/观众理解检查。底层 `render.mjs`、`templates.mjs` 与单镜头 renderer 可由真实现有项目用于隔离技术验证；若这些产物属于该 plan 项目的正式交付，须进入同版本 `verify-delivery`。普通新 Motion 项目使用 [Showreel 原生运行入口](../showreel-runtime.md)，不进入这条 plan 合同。

**让工程逐项消费语义蓝图。** 蓝图已给出语义动作的触发短语/事实、成片锚点、对象或等价渲染单元、前态/过程/后态、文字与图形的当前/后续曝光、起中落构图、焦点及关系结果后，再按工具写成场景、片段、关键帧、时间码、图层或声音轨。工程映射须能从每项承重动作追到真实时间事件、目标对象/属性、文字/图形布局、对象继续保留/弱化/退出/合并/重排的方式，以及观众应看到的关系与结果；每项结果也能回到对应输入和对象。稳定 ID 可用于对象，现有 metadata 或 `custom` 内具名相位也可作等价映射，不要求一词一对象或新 schema。单个 `custom` 组可以共用一个 progress/时钟，但内部相位须对应动作图的语义时间，并驱动对应文字与图形的显隐/状态；整体淡入或整体 progress 不能替代逐项消费。保留原稿段 ID、事实来源和验收点；有实际音轨时按来源版本和真实时间锚点映射，无音轨时只记录暂定语义预算，不称声画同步。从工程片段应能回到对应蓝图动作，关键状态包含开始、过程、落定；若字图曝光顺序、输入对结果的贡献或箭头表达的对象方向还不清楚，先修该镜动作图并验证短段；正常完整制作之后续全片渲染须等对外样片获确认。

**不要把单场景 renderer 当成整片 assembler。** `scripts/render.mjs --scene` 一次只消费一个 Motion scene。多段影片用 `templates.mjs` 的单一入口和一份现有蓝图：

```sh
node .agents/skills/laohu-motion/scripts/templates.mjs render \
  --film-blueprint /absolute/film-blueprint.json \
  --output /absolute/picture-only.mp4 \
  --work-root /absolute/project/.cache/tmp/native-scene \
  --manifest /absolute/film-manifest.json \
  --browser /absolute/chrome \
  --ffmpeg /absolute/ffmpeg
```

蓝图格式为 `laohu.huashu-film-blueprint/1`，首批只接受 1920×1080、30fps。共同顶层字段为 `width`、`height`、`fps`、`clock` 与 `segments`。`clock.kind:"film-global"` 使用 `{kind:"film-global",durationSec}`，每段用 `startSec/endSec` 连续覆盖全片；`clock.kind:"asrcut-v2"` 使用 `{kind:"asrcut-v2",timelinePath,timelineSha256,editPlanPath,editPlanSha256}`，每段只列 `unitIds`，按 source `occurrenceId` 或 presentation `id` 的冻结顺序连续覆盖所有 timeline units。两种 clock 的字段不能混用。ASR 分支会重算 plan hash、核对 timeline 与 `compilePlan(plan)` 的完整结果，并复核有声明路径/hash 的源媒体和 `verifyPlanEvidence` 所指的 transcript 原始文件；没有 `evidenceRef` 的来源只能保留为 `unlocated`，不是已验证。任一时钟缺少真实来源、边界留空/重叠、顺序或 hash 不符时停止，不另造时间线。

每段只能选实际 renderer：`huashu-motion-template` 段填写 `id/templateId/variables` 和该时钟的时间字段，可选 `eventScenePath/eventSceneSha256`；`motion-scene` 段填写 `id/scenePath/sceneSha256` 和该时钟的时间字段，可选成对的 `drawModulePath/drawModuleSha256` 或 allowlist 中的 `templateEffects:"laohu-motion-dg"`、兼容旧名 `"huashu-art-motion-dg"`，以及 `"laohu-motion-toolkit"`。当选 toolkit 时还须提供成对的 `drawModulePath` / `drawModuleSha256`，由 renderer 校验并加载本地 custom draw。现有 Motion scene 仍由 `render.mjs` 渲染，Huashu native clip 由 adapter 按 catalog `templateId`/alias 解析原生 `grammar` 并调对应 clip renderer。Film `/1` 输入段的 `variables` 是原生 source 字段；adapter 平铺这些字段、固定 `grammar`、从编译帧数给出 `duration`，并加上 `fps:30,width:1920,height:1080` 形成源 clip spec，不会包为 `{format,templateId,variables}`。提交的 `variables.duration` 若存在必须与编译时长相等，显式 grammar 也必须匹配目录。catalog 行须是 `renderer:"native-clip"` 且 `availability:"available"`；条件未满足的条目不能进入 Film 渲染。源码控制步长/字段校验不接受时停止该段，不改原模板算法。Motion scene 不静默改写输入 `duration`：源时长与编译片段最多相差一帧量化余量，且 `render.mjs` 的 `Math.round(duration × fps)` 必须正好得到该片段帧数；scene-local 事件及被局部事件/效果引用的局部 phase 也须处于源场景与渲染窗口内，否则应重编该段 scene，而不是把改 duration 当作完整 retiming。派生 scene 保留源文件字节，manifest 同时记源与派生路径/hash。固定曲线、排版等原生机制不可用蓝图虚构字段覆盖。

Film `/1` 的完整 OM renderer `laohu-native-om-template` 与旧 `huashu-motion-template` raw native-clip 是两条不同入口：它通过 catalog 选定的原 `templateId`、source controls `variables` 和源工程 copy map / OM CLI 运行原项目 runtime。可选 `omCues:{words:[{word,start,end}]}` 的 `start/end` 是 OM 源片段/原稿/原配音本地秒，由唯一 `time:<segmentId>` map 投影到 Film 全局时钟；原 `CLIP.mount` 前将其交给 OM 页面，使原 `OM.words()` / `ClipCues` 消费，不因 `variables.pace` 乘缩放。可选 `sourceCueBindings` 只索引原 `script#clip-spec` cue，不是第二张时间表：项用从 0 开始的 `cueIndex` 和必须等于原 cue 的 `kind` 定位；原 `q.word` 非空时 `sourceWord` 必须精确匹配其锚身份。`word` 指向新稿锚词，`null` 清除与本片无关的演示锚；可选 `nth` 是稿件语音文本第几次命中（从 1 开始），`edge` 为 `start|end`，`offset` 是原 `ClipCues.t + offset` 的秒。重绑词后由原 `findWord`/`ClipCues.prepare` 求 `resolvedWord.start|end + q.offset`，以原稿 transcript clock 定时，同样不乘 pace。可选 `sfx` 只改对应原 cue 的源声明，可设 `false` 静音，也可用原名或 `[name,leadSeconds,options]`；原 `CLIP.mount` 继续决定候选和提前量。只有有 `script#clip-spec` 的原模板接受这些 cue 绑定；缺失时明确拒绝。提供 `omCues` 后，原 OM/ClipCues 中未解析的锚点或诊断错误会在 render 前拒绝，不把失配静默当成成功。直接 native OM `render` 与 Film `/1` 入口在原 OM/browser capture 启动前，对实际选中的 FFmpeg 执行 `-hide_banner -version`（10 秒超时并检查版本行）；显式 `--ffmpeg` 保持原路径，未传时检查原有 PATH 命令，Film 的 final-assembly binary 若另由 `MOTION_FFMPEG` 指定也单独预检。启动失败或动态库诊断会将状态与受限长度的 stdout/stderr写入错误并提前停止；不安装、修复或更换系统工具。

OM 源时长不能由 `variables.duration` 直接当作最终时长，也不自动把既定 Film segment 拉伸。prepare 先保留原 `variables.duration`/`variables.pace`，用原 browser capture/openFilm 初始化项目并读真实 `probe.durationSec`；receipt 分开记录 `sourceDurationControlSec` 和 `runtimeDurationSec`，并固定 `durationAuthority:"original-om-browser-runtime-probe"`。Film 片段时长与预期帧数使用 probe 实际时长；render/preview 再 probe 时须与 prepare 时相同。作者的 `startSec/endSec` 或 ASR timeline 覆盖长度必须与 runtime duration 对齐；若不符，先改分段或来源控制并重做 prepare，不默默 retime。pace 只沿原 `ClipCues.prepare` 放大未绑定 cue 的 `q.at`、默认 cue 附属命中、源 duration 等原行为，再由原实现按 `max(duration, voiceEnd + tail)` 收束 probe 时长；已给 `omCues` 和重绑 transcript word 的时间不重复乘 pace。例：源控制 duration=10s、pace=1.5 时，真实 probe/Film runtime 为 15s、30fps 下 450 帧；未绑定 source cue `2.8s` 可移到 `4.2s`，重绑词锚 `2.4s` 加 offset `0.5s` 仍在源 transcript clock 得 `2.9s`，source event 再由唯一 segment `timeMap` 投影到 Film 秒。

可选 `omScore` 可与 `omCues` 并用，是原 ABC 文本，必须为非空字符串且不得含闭合 `</script>`；它作为原 `#om-score` 供源 composer/readScore 消费，未匹配的 composer label/cue 不会投进 Film 计划。Film `projectFilmEvents` 将 OM SFX hits 投影到 canonical `audioEventScene.audioEvents`，manifest 保留带 hash 的 `sourceScenes`、`audioEventBindings`，源局部事件只经对应 `time:<segmentId>` 映射。乐谱另记录在 `nativeSourceCompositions[]`（score/hash、labels/marks、seed、key、expected cues 与 timeMapId）；通过 audio-plan 校验后由现有 composer 生成音乐 stem，`musicMixGainDb` 只作为音乐 track gain 应用一次，SFX-only 不接受此音乐增益。源 OM 先以 `om render --silent` 渲画面，再用 FFmpeg `-map 0:v:0 -c:v copy -an` 去掉源音轨；最终全片只有 `audio.mjs` 从 canonical scene/plan 混音并 mux 一次。

这条 Film `/1` 路径的 Chrome 技术 E2E 已对一个白板夹具完成 1/1：原 OM 画面、源 cue 锚点、SFX、ABC score、全局事件映射和 audio-plan/audio.mjs 混音均进入实际消费者。它只证明该夹具和字段组合闭环；其他 template 的 status、浏览器行为和内容适配仍逐项以 catalog / 独立证据为准，不推为全库或成片质量 PASS。

原 OM 没有 ABC `sourceScore.scoreText` 且源 `sound.music.off` 未开启时，Film 登记 `nativeSourcePresetPlans[]`；其字段、哈希与 `nativeSourceCompositions[]` 的关系不变。另对完整 native OM source scene 的哈希验证运行时 p0 声明，若 `music.off:true`、无 ABC 且存在 declared-SFX，adapter 从已验证的 segment/source scene/canonical events/timeMap 推导 SFX-only mixdown candidate；这是消费已有声明，不增 Film manifest registry。任一路径都须满足同一窄 eligibility：request 不含 `composition`/`musicPreset`/`sfxEvents`，`musicMixGainDb` 为 0，base audio-plan 没有 events、music automation、ducking 或其他声轨。base plan 可无 track，或只有一条从 Film 0 秒开始且已锁定的 voice track，并同时有非空 `voiceWindows`；多轨、未锁定 voice、非 0 起播或无 voice windows 均走 stems。每个 native segment 的 voice windows 经唯一 Film `timeMap` 转成 OM 源本地 `words`；adapter 对锁定 voice 文件做 hash 校验与 48 kHz stereo 解码，按 pinned `sound.loudness(left,right)` 测量实际双声道人声 `voiceLufs`，再调用 `sound.mixdown(p0,{voiced:<此段有本地窗>,words,voiceLufs,score:<原ABC或null>})`。music-off SFX-only 分支照用原 p0、传 `score:null`，不生成音乐，但保留原 source hits、FX room 和原 `sound.mixdown` 输出链；`music.off` 本身不会要求补配乐。`out2` 始终不包含旁白 WAV，旁白只由最终 `audio.mjs` 加入一次。原预混片段与声源时钟、hits、room/共享 bus FX、HP、compression、normalization、limiter保持 source function 的实际关系。

生成回执的 `alignment.nativeSourceSoundtracks[]` 记录 segment、来源/哈希、`timeMapId`、asset/track、源 score、mixdown 指标、source hits 与 `bakedCanonicalEvents`；每行 `kind` 区分 `abc-score`、`default-score-preset`、`sfx-only`，并保留 `sourceMusicOff`。SFX-only行须见 `sourceMixdown.musicOn:false`、无 score hash、`mixBusMode:"not-applicable-music-off"`。`alignment.nativeSourceSoundtrackSelection` 记录选择和不适用原因；`composition.sourceSoundtracks` 关联 baked 事件；`runtime.sourceMixdownUsed`/`sourceVoiceDuckUsed` 分别报告是否使用原混音/是否让源 mixdown 按旁白时间工作。`runtime.sourceMixBusesEnabled` / `runtime.sourceMixBusesMeaning` 只说明至少一个默认 preset soundtrack 是否实际使用原 OM `OM_MIX=chains` 可选插入链；ABC 和 music-off SFX-only 不使用该可选 preset 链。该布尔为 `false` 不表示 source mixdown 关闭共享 FX room、high-pass、compression、loudness normalization 或 limiter。asset 的 `source.outputKind` 为 `native-om-original-sound-mixdown-stereo-soundtrack`，audio-plan 以一条未锁定 `bus:"music"`、`gainDb:0`、原始完整片段范围的 track 和 `time:<segmentId>` 放置；其 `sourceProcessing.sourceKind` 必须与回执 kind 相符，`audio.mjs --scene` 还要核实 p0 的 music-off/no-score 状态。voice track 单独锁定、只在一个计划轨道中出现。

源 mixdown 的 `track.sourceProcessing` 随 Film 合约区分格式：legacy OM Film `/1` 使用 `laohu.motion.source-premix-processing/1`，绑定其原 receipt、Film manifest、canonical event scene、原 source scene/p0 声明、score/plan、segment/timeMap 与 soundtrack asset；Film `/2` 必须使用 `laohu.motion.source-premix-processing/2`，同时声明 `nativeBaseSourceContract:"nativeBaseSources/1"`，分别绑定 canonical Film event scene 与经 child `/1` receipt、输出、source scene、runtime probe/hash 验证的完整 OM source。两条路径都记录（有旁白时）voice track/file hash、voiceWindows hash、测得 LUFS 与映射本地窗；`sourceKind` 标明来源分支并须与 receipt 行一致。`audio.mjs --scene` 不信任孤立的 `duckingApplied`/`locked` 标记，而会重核这些文件与 hash、计划引用、源 hit 顺序/时刻/参数及 canonical Film 映射。source hits 只保留为 `bakedCanonicalEvents` 证据，不另生成音效 asset 或重复 event；验证不吻合就拒绝。新 `/2` 标记不能被旧 manifest/1 consumer 静默忽略。source-premix track 不能锁定、加 post-mix gain、裁切/变速，计划也不能叠加 automation/ducking 或其他声轨；需要独立 gain、外部/既有/locked BGM、旁白 track/window 不符合条件、SFX 手动事件或其他 automation 控制时沿原 stems 分支。该 stems 分支仍复用 pinned `score.plan`/`renderScore`/`pump`/`master` 与源 `sound.js` reverb/sweep/energy/fade/balance流程，但不等价于原 `sound.mixdown`，默认 preset 的窄审计已观察到共享 room、FX gain、high-pass、bus compression、总响度归一与 limiter 缺失。若 music-off SFX-only 组因控制条件回退为 stems，也同样不声称保留原 full-mixdown FX。source soundtrack 只是原声片段 asset，不是第二个最终 Film mixer；最终只由 `audio.mjs` 按 audio-plan 将可编辑声轨组装并混音一次。

Film segment 可选 `omMusic:{off:true}`，通过原 `OM.music({off:true})` 只关闭该段源默认音乐，不关闭 SFX。对满足 eligibility 的 music-off/no-score 源段，adapter 可将原 hits 与 FX 作为 `kind:"sfx-only"` source mixdown，而不生成音乐；若有独立音乐/SFX控制，则回到 canonical SFX/stems。对 source score/preset，request 明确给出 `composition` 或 `musicPreset` 时，源音乐保留作证据但不重复入计划，`alignment.nativeSourceMusicSuppression` 记录 `reason:"explicit-audio-request-selected-the-film-music-source"`；base plan 已有任意 music track（含 locked）时自动 source music 让位，原轨保持不动，receipt 记录 `reason:"existing-audio-plan-music-track-preserved"`。锁定轨不能被原模板音乐覆盖；若要派生现有轨，只能走已支持的 unlocked `musicPreset.selectedMusicTrackId` 路径。

既有 default-preset E2E 证据在 `.cache/tmp/native-om-default-preset-e2e-X4jX4F/`：20 秒白板 Film 含先 `omMusic.off:true`、再 default-on 的两段；当时请求带 `musicMixGainDb=-4`，因此默认音乐走一条可调 stem，off 段 SFX 走 canonical events/stems。这条证据继续说明增益控制如何触发 stems，不代表 music-off 完整 source mixdown。零额外控制的 `sfx-only` source mixdown、原函数PCM逐字节对照与最终 audio.mjs 区段对照，见[来源与证据](../../SOURCES.md) 新增收据。以上 E2E 均不证明听感或人类接受质量。

request-generated source group 是独立的第三条源混音路径，与 Film `/1` 的 `nativeSourceSoundtracks[]`、Film `/2` 的 `nativeBaseSources/1` 不同。它消费原请求文件/hash：请求为 `/2`、恰好一个新生成 `musicPreset`，来源/plan/voice/事件等资格符合[声音选择规则](sound-design.md#request-generated-source-group生成音乐与手动-sfx-的兼容源组)；显式 key、SFX kit、per-hit seed 或 gain 超出组能力时按规则保留并使用 stems。适用时，audio-source 调用 pinned `sound.mixdown` 并固定 `mixBusMode:"default-sum"`，生成一条完整片长 stereo WAV；`track.sourceGeneratedGroup`（format `laohu.motion.request-generated-source-group/1`）和 receipt 的 `alignment.requestGeneratedSourceGroups[]` / `requestGeneratedSourceGroupSelection` 绑定 request、sourceP0、closure、canonical event/timeMap、输出 WAV 及可选 voice hash。SFX source hit 烘焙在该 WAV 中，不再写成另一条 `audio-plan.events`；`sourceGain`/`sourcePan` 在 source `renderSfx` 阶段应用，`musicMixGainDb` 在 source 音乐目标归一后、共享 FX/bus 前应用，预混 track 始终 0 dB。有旁白时仅接受一条 film-origin locked voice track 与真实 `voiceWindows`，voice WAV 由 `audio.mjs` 最终混一次；源窗口仅对音乐让位。`audio.mjs` 按 `/1` 计划读取此 track marker 并核验原 request/source/local closure/scene/timeMap/WAV/voice 引用及 hash；它没有把计划提升到 `/2`，也没有开放 plan 顶层 `processing` 或 `rooms`。资格不成立或原 request hash 不可得时沿已有 stems 处理，保留独立控制。

Film `/1` 的 `incomingTransition` 选择真实源 `TRANSITIONS.<method>`，`id` 为 catalog transition group，`windowFrames` 为至少 2 的偶数，`parameters` 只传该源函数实际消费的字段。默认 `mode:"handles"` 只用于两个相邻 `motion-scene`，从真实 head/tail handles 抽出 A/B 帧窗。受限的 `mode:"boundary-frame"` 只支持参数为空的原 `crossfade` bitmap 分支，`boundaryReason` 必须说明语义交接，并且切点至少一端为 raw native-clip (`huashu-motion-template`) 或完整 native OM (`laohu-native-om-template`)；OM↔OM、clip↔OM、native↔motion-scene 均允许，两端纯 motion-scene 继续使用 handles。boundary-frame 需要窗口前半由 A 输出实际末段帧、后半保持 A 实际末帧；B 前半保持真实首帧、后半输出 B 实际初段帧。两端不得声明 handles，片长、原 source controls/cues/OM 初始化时钟和全局音频时钟均不变，窗口输出帧数等于输入窗口帧数。Manifest 保留 mode、semantic reason、window/frame map、输入来源帧和实际 `TRANSITIONS.crossfade` 调用/commit 收据；切点外仍按原 renderer 输出。该 bridge 只验证了 complete OM↔motion-scene 与两个不同 native OM 模板的媒体夹具，raw clip↔OM 未单独 E2E；不得将 A/B held-frame 过渡外推为 `matchCut`、`same` 或任何需要连续世界/几何关系的源方法。字段/handles 条件不满足会拒绝，不静默改硬切。全片最终仍经 `audio-plan.v1` / `audio.mjs` 唯一混音。

当前冻结源库存含 50 个函数、分属 9 个 catalog group：`laohu-motion-fade`、`-wipe`、`-matchcut`、`-whip`、`-zoom`、`-shared`、`-materialcut`、`-impact`、`-push`。按 source-function 而非 group 汇总，当前 43 项为 `available`、6 项为 `conditional`、1 项为 `source-only`：`TRANSITIONS.comicPanels` 因其调用的 `PAINT.dotPattern` 不在 pinned PAINT closure 中，运行会失败，仅保留 source index，不进入 renderer/Film 调用。六个条件项为：`same` 需证明 A/B 是同一连续世界/相机；`lensReveal` 需与前镜真实相机轨迹同步并覆盖画幅的 `lensProfile`；`matchCut` 需真实同形/同色满屏匹配与拉出；`fillZoom` 需实际焦点 `cx/cy`；`zoomThrough` 需 `cx/cy` 且当前只接位图分支，`live:true` 不支持；`expandRect` 需真实共享卡片的 `rect:{x,y,w,h}`。运行时仍以 catalog 每个方法的状态和校验为准；其他 source options 不从函数名猜。`laohu-motion-whip` 有 source-handles/audio-mux Film E2E 标记；`laohu-motion-fade` 另有受限 `boundary-frame` crossfade Film E2E，实测 native-clip↔motion-scene、complete OM↔motion-scene 与 finance-chart→whiteboard OM↔OM；其余 7 组只记录各自受限的 source-call/5-state seek smoke，不能推广为 Film E2E。严格重复像素检查的 `crossfade`、`swirl` 为 `FAIL`（最大通道差 2、1；均值差 0.320243、0.001380）。冷进程直接源与 adapter 的五个进度点 hash 逐项相同，且直接源自身重复也出现对应差值；成因 `UNKNOWN`，不得归因于适配器或取整。证据见 `.cache/validation/motion-building-blocks/audit/source-repeat-isolation-6048-1794044346068.json`。当前 Film E2E 证据为 `.cache/validation/motion-fusion-implementation/film-e2e-67696-SCHNAQ/evidence.json`：4 秒/120 帧固定时钟夹具中，motion-scene A/B 由 `whip` 使用 source handles；其后 raw native y3 与另一 motion scene 以 6 帧原 `crossfade` boundary-frame 交接。同一 manifest 的 canonical events 经唯一 `audio.mjs` 完成技术 mux，handles 内事件明确排除。该夹具不验证人类视听质量。另有独立真实 A/B PNG 冷进程 repeat 检查：whip strict pixel repeat 为 `FAIL`，同进度 direct-source 与 adapter 的 hash 序列逐项一致，但重复 `0.4` 帧有 2,073,599 像素／6,195,511 通道差（max 14、mean 4.161816），直接源本身也呈现同差异，成因 `UNKNOWN`；见 `.cache/validation/motion-building-blocks/audit/independent-whip/whip-repeat-isolation-6362-1794044547679.json`。这项失败不否定 Film 时钟/音频 E2E，但不得用 E2E PASS 覆盖 repeat FAIL。其他方法的运行证据、对外画面和接收效果分别据实际检查记录。所有段需同为 1920×1080、30fps、单视频流、无音轨、兼容编码参数；adapter 按全局绝对边界量化帧数并检查残差/速度。`laohu.huashu-om-film-manifest/1` 固定蓝图/ASR hashes，记录片段 frame/source ranges、精确 film start、按实际渲染片长计算的局部/全局 speed、量化余量、源场景 hash 与编译后的 `audioEventScene`、`audioTimeMaps`、`audioEventBindings` 及被排除的 handle 音频事件；唯一音频 consumer 继续读这些记录，不另写时间表。工作根、源文件、vendor、输出目录须通过同盘检查。完整渲染后仍须打开最后编码画面按目标尺寸和正常速度观看。

**Film Blueprint `/2` 是混合合成入口。** 它与直接调用的 `laohu.huashu-film-blueprint/1` 格式分开；外层可在同一帧钟中接收 `motion-scene`、已登记的完整 `laohu-native-om-template`、已登记的完整 `native-html-canvas-template` 与 `video-shotcraft-remotion` segments。每种底片先由其原 renderer 生成 picture-only segment；OM child `/1` receipt/source scene/runtime probe、HTML 模板 source hash 与输出帧数均须校验后按绝对帧段进入 Remotion `OffthreadVideo`。原生 HTML 全幅模板保留构图和源时钟，不能经 ClipCard 缩成方卡；旧 `huashu-motion-template` 只在 catalog 明确指向完整 OM 条目时作类型确定的 `/2` 兼容归一，raw `native-clip` 不因此成为 `/2` 底片。同一 `/2` Composition 再绘制已校验的 Shotcraft `local-effect` layers 和 `transitionEdges` FlashCut。`incomingTransition` 另限于完整 OM/HTML 任一端参与的、无 handles 的 `boundary-frame` 原 `TRANSITIONS.crossfade`：对完整 Remotion 帧钟按绝对帧取边界窗口，调用 `/1` 已有 `renderTransitionWindow`/`assembleTransitionFilm` 后处理；持帧属于明确边界交接，不代表双端 live motion，且与窗口重叠的 FlashCut/其他转场会被拒绝。每个 overlay layer 可带 segment 内唯一 `id`；同一 catalog 组件出现多个实例时，action binding 必须用 `componentCatalogId` + `componentInstanceId` 指向真正绘制的那一层。新 `/2` manifest 保留所有底片 source/receipt/hash、转场帧和事件映射；`sourceScenes[]` 始终是 canonical Film event scene，完整 OM 声音上下文另以 `nativeBaseSources[]` 核验。此 Film renderer 仍只输出无声画面，完整 OM source-mixdown 只在音频 consumer 的窄条件下作为单一 source track，最终由 `audio.mjs` 混音一次。Full-scene Shotcraft segment 保留原单镜头构图，不能通过 `/2` 在其上任意叠层。

使用 `templates.mjs render --film-blueprint <file> --output <picture.mp4> --work-root <项目同盘临时目录>` 并确保输入为 `laohu.huashu-film-blueprint/2`；其 renderer-specific segment 字段、1920×1080@30fps、严格顶层白名单、`compositionGroups`、`transitionEdges`、`incomingTransition`、`actionBindings`、源帧/时长与无 overlap 约束均见[Video Shotcraft 源接入规则](video-shotcraft-integration.md#film-blueprint-2-的真实接口与停止条件)。为本地 overlay action 绑定 ASR/source landmark 时，`componentCatalogId` 必须指向该 segment 中实际渲染的 Shotcraft 组件；同类组件有多个实例时，还须给对应 layer 稳定 `id` 并用 `componentInstanceId` 指定实例。Gallery PaperTitleCard 的内容派生仅限 catalog 锁定的 `paper-title-card-copy` provider、55 帧原时长和单个完整 source layer；其他派生改动仍拒绝。渲染前用 `node .agents/skills/laohu-motion/scripts/templates.mjs verify --source video-shotcraft` 核实来源和 derived provider 的 SHA/转换关系。renderer 写 `laohu.motion-film-manifest/2` receipt（默认 `<picture.mp4>.manifest.json`）；核对各 base source/child receipt/hash、nativeBaseSources、groups、transition edges与 boundary receipt、overlay bindings、事件 map、renderer/runtime 和最终 ffprobe。legacy `/1` audio consumer 继续读取 `/1`；新的完整 OM source audio 必须经 `/2` manifest 的 `nativeBaseSources/1`、canonical `sourceScenes[]`、`source-premix-processing/2` 与实际 `audio.mjs` 验证后才可混音。picture render 本身仍无声，未经最后 audio-plan/mixdown/mux 不称作有声成片。

**逐单元核对实际绘制与任务交接。** 对每个观看单元，从记录的进入前提和前一单元落态核对它如何进入、何时按完成依据读清并落定，以及下一单元怎样接入对象/状态并获得需要的画面空间。进入、完成、参照保留/退让和下一单元空间须由 renderer 实际消费的坐标、尺度、透明度、clip/mask 或绘制分支控制；只写在 `scope`、诊断区间、`readStart`/`readEnd` 等 metadata 不算绘制证据，除非真实绘制入口读取并据此改变画面。检查交接前、中、后的已编码帧和正常速度顺播，确认前一任务的必要身份/参照仍可辨，新任务实际到位且旧内容不再抢焦点。一个 `custom` renderer 可以承载多个单元，但每单元都须能指出实际绘制消费位置和完成/接入证据。

**核对蓝图、实际状态与编码帧是否承载同一关系。** 对分类、条件判断、目标更新、数值比较或其他由关系决定结果的镜头，沿“蓝图主张 → 实际对象/状态 → 编码帧”核对：蓝图写清输入、条件、判断/操作和预期结果；工程必须按同一输入身份、方向、条件或值产生该状态，镜头再显出关系结果，而非只出现结果标签。检查对应的起始、变化点与落定编码帧；对象存在、事件按时启动或最终文字出现，都不能单独证明承重关系自洽。教学演示可以用人工构造值或简化模型，不必模拟真实机器学习，但身份、方向、条件和结果须符合蓝图并标清示意。只在真实表达同一关系时共享状态或时钟，不强迫所有属性跟随同一 progress。

**逐项确认蓝图是否进入真实消费者。** 沿真实绘制入口核对：文字测量怎样形成占位，布局选择怎样决定文字、底板、对象及引线的位置，冲突怎样触发调整，局部动作怎样限定到目标范围。可用本仓库 MotionOps，也可用当前工具的等价能力；不能只输出未被绘制器读取的布局数据。检查主体、跟随标签与关系线是否共用变换或在 `custom` 中同步重算，最终曲线/速度是否符合设计、是否有未记录的二次缓动（有意组合可以保留，但要检查组合后的轨迹与速度），颜色角色是否由最终绘制读取，声音包络/增益/尾音是否实际进入脚本、DAW 或最终混音。布局诊断须对应实际帧坐标、变换、透明度、遮罩和有效阅读区间，并说明覆盖了哪些文字与保护对象；未覆盖的对象不能因未报告冲突而视为通过。几何检查、OCR 和色值测量分别只报告其真实范围，最终仍检查编码画面与正常速度阅读。自定义文字须用最终加载字体做真实测量；字族与字重须对应 renderer 实际加载的文件/系统资源及其真实 fallback；仅写字体名或宣称已有许可不算资源进入最终帧。发现的遮挡、碰撞或错误指向先修复，再扩展制作；只把某值写进 metadata、蓝图或未被读取的字段不算消费，只记录影响结果的真实控制值，不为此参数化整个工程。

**核对素材表示法能否承载本镜动作。** 选用照片、视频、矢量或代码图形时，沿真实工程找到相应资源的加载与绘制入口，确认目标文件确实可由该 renderer 使用。若动作依赖独立部件的姿态、遮挡、蒙版、锚点或跨镜身份连续，先确认源素材有对应分层、蒙版、锚点或帧序列，且运行时消费者实际读取它们；单张扁平图只按工程真实能力做整体变换、裁切等动作，不称为独立部件动画。若本镜不依赖这些能力，不虚构或要求未用的分层字段。通过现有 `custom` 注册点或工程真实接口接入，先完成内部单镜预览并核对素材和动作，再按对外样片门推进；不假定存在未实现的图像、视频原生 schema。

**核对实际消费的时钟、状态、几何占位和曝光边界。** 事件时间和速度曲线以 renderer/custom draw 真正读取的配置与变量为准。同一动作若需要声画联动，应由一个具名相位/事件计算一次，再由画面 custom renderer 和音频 consumer 分别读取；不要把联动时间写成两套独立参数并靠人工核对保持一致。无关的独立动作可以保有各自时值。新相位字段属于 custom 可选数据，不是 core scene 原生字段；必须确认两个消费者都实际读取它。若一阶段对数据做了变换且下一阶段应延续该状态，沿 producer→consumer 追踪实际变量/对象，确认后段读到变换结果；若语义要求重置，明确重置位置与新基态，不能把未消费的参数条、临时变量或中间帧当成已延续。蓝图表示“同一对象移动”时，应更新并绘制该对象的当前状态；不能保留原位置的实例，又在新位置另画一份却仍说是移动。若有意复制，应标明副本承担的是残影、对照、历史状态或其他真实含义，并让身份容易区分。关系线按实际变换后的节点边界/端口计算端点；文字标签以实际加载字体测得的占位框参加避让和重排，检查线端、箭头、字、对象边界在图层 z-order/clip/mask 合成后的遮挡。最终按解码编码帧核对声明的首显、末显、动作落点、当前透明度和实际 draw 可见性；检查同一文本/图形区域的实际入退场交叠窗及起态/中态/落态中的遮挡，不能只比较 metadata 区间或查看静态布局。可见时间、状态消费者、几何占位和重复对象的意图都要回写蓝图。

**沿选定模板核实源码闭包并运行原实现。** 主线已在画面方案定稿前从 catalog 查询候选；本 Reference 接收已有蓝图中的 `templateId`，用 `templates.mjs show` 与固定源码/schema 核实内容适配、renderer、真实入口、运行时、依赖闭包、素材/字体条件和逐帧时钟。对有许可、条件满足且本地已登记 renderer 的项，按原接口调用原始效果；不要因“需要原创适配”重写算法。源码仅索引、预览或 recipe 条目标记为 source-only/相应目录状态，不当作可调用成片模板。检查 DOM/Canvas/Three、全局符号、GSAP/其他库、字体和媒体资产是否在本地闭包中，缺项按项目授权与工作盘约定处理。

**只填源码真实消费的参数，并保留原生固定效果。** `show`、schema、真实入口和 renderer 实现共同决定可调字段；按当前段落语义只把实际消费的参数、cue、素材与时间映射附在既有蓝图中，不另建用户问卷或复制 catalog 清单。核对字段究竟控制标题、数据、素材、cue、时长还是输出，以及布局/曲线/顺序是否耦合；耦合项作为原生机制整体保留，不谎称可拆调。对 conditional 项满足其明确前置条件后继续；若确实缺少本镜需要的接口或有权素材，只退回主线处理受影响段落，报告具体缺口并选其他段落实现。不能凭字段名、JSON 存在或某个方法 demo 猜测可调性。许可清楚的上游代码可按固定 commit/hash 原样 vendor 和只读运行，保留原许可及必要声明；源码、示例叙事和资产授权分开核对，不能把代码许可扩张到角色/照片/成片。普通可恢复的同盘接线在既有授权内推进；只有费用、全局配置、超范围服务/素材等真实取舍才停下。

若蓝图依赖某个参数能改变某项画面结果，做单变量对照：固定主题、文字、素材、尺寸、字体、时钟与渲染历史，只改被检查的参数，再确认该值是否进入真实 consumer、被读取后是否改变预期画面；同时用相同配置重复 seek/渲染，检查同一时刻是否稳定。除此之外，分别核对参数本身、运行上下文和组合环境：准确到 source export/read-site 后，固定 renderer 实际读取的局部 frame、duration、尺寸/fps 和素材，再比较 source 独立渲染与被嵌入的对应状态；蓝图中的对象、phase、焦点、文字与布局必须对应实际 props、source 子件、绘制调用或明确获支持的 patch，找不到消费位置就仍未落实。共享背景、父容器、clip、blend、camera、opacity 与前后层要检查合成结果，单组件成功不能替代组合验收。配置内的重复一致性与配置间的实际差异是两种独立结论：同一参数多次渲染一致，不能证明不同 layout/主题/字组会产生不同结果；仅 README、schema 校验或参数名也不能证明运行时生效。

**先辨时钟、映射和消费者接口，再按需换算。** 建立事件时标明输入是源素材全局秒、成片全局秒、镜头局部秒或局部帧；同时检查接收它的场景/函数要全片全局时间、局部秒还是帧，时间值不得缺少基准。源素材帧先按源 fps 换成源时间；源素材时码若经过剪辑、变速或重排，再按实际剪辑映射换到成片全局时间；映射未知或缺失时标出无法换算的事件，不假设一比一。保持消费者需要的时间基准：成片全局秒给全局接口时直接使用；接口要局部秒时才换算 `t_local = t_film − t_start`；输入为镜头局部秒、消费者要全局成片时间时则用 `t_film = t_start + t_local`。例如 `renderAt(t)`/`scene.update(t)` 若接收全局 `t`，不要为统一格式而局部化。其他局部帧按其所属 fps 换成秒；只有目标接口要求帧时，才按目标工程 fps 转帧，若输入帧与目标接口属于同一时间基准且 fps，则可保留帧值。fps 只用于秒与帧的单位转换；量化和含/不含端点遵从工程实际约定。输出时同时保留原始锚点、基准、映射、目标接口和值，便于追溯。相对设计预算只排相对事件，不伪造 ASR/源音轨时码。

按工程实际含端点/不含端点的约定检查触发、动作结束、停留结束和退出均落在当前镜头/片段及整片范围内。逐帧渲染函数应由传入的绝对时间/帧直接算出姿态，使任意帧可单独 seek、相同时间重复渲染结果相同，不依赖必须先播放过之前的帧。文本太长、媒体比例/尺寸不符或镜头时长容不下阅读时，先在用户授权范围内调整构图、排版或时间安排并复核；若必须改动内容、媒介、总长或其他锁定项，说明具体冲突与代价，不能只替换 JSON 就假定已经适配。

**让修改可恢复、可追溯。** 口播、图层、时间轴、依赖、源素材或输出文件需要改变时，不直接覆盖原稿和不可再生材料；先复制或分支，再记录变更文件及输入版本。最终工程说明中列出所用内容/音轨版本和新媒体路径，让原文件仍可恢复。

**难点先行验证。** 新画风、新工具、复杂形变、档案拼贴、多输入关系或多轨声画尚未证明可行时，选一个真实高风险镜头，用实际输入对象按起态、关键中态到结果落定的顺序预演，而不是只看完成后的终态或检查蓝图字段；在目标尺寸与正常速度检查当前焦点、对象间的位置/方向/分组等空间关系、必要阅读停留，以及关系变化怎样被实际看见。若画面只逐项填入预留槽位，过程中没有承担当前理解任务的关系变化，返回 [视觉设计](../visual-design.md) 重新选择构图；若比较、连续累积或阅读依赖稳定的共同比较布局，可以保留，但预演要证实该布局持续承担比较或上下文职责。此检查不要求每拍换色、加动作或加运镜。逐项核对语义动作是否驱动预定对象/属性，重要差异是否进入后续组合/结果，结果是否回连其输入且可见可读；镜头使用相机或遮罩时，还要实测锚点、平移/缩放或遮罩边界是否随目标正确变化，不需要这些动作时不造空字段。对依赖进入、落定、阅读停留或交接的关键相位，按实际 fps 导出并检查编码后帧和最终 renderer/合成 consumer 的可见状态；字段时间与蓝图相符仍不能替代观察画面。此处关键态预演是内部自审，不要求用户批准。若一份实际可播放的样片覆盖这些状态，可用同一画面完成内部检查；但内部自审与用户确认分别记录。未出现关键结果、未留足阅读时间或运动映射断开就先修短段，再按对外样片门推进后续全片；预演素材、用户样片和最终媒体分开标记，避免把局部成功当成全片完成。

**每项素材保留来源、派生和可再用范围。** 图片、文档、字体、音频、视频和角色资产来自用户、网络、工具包还是生成器，应有稳定 asset ID 并在工程资料中记录实际文件路径、版本/来源页、可复现时的哈希、许可名称/版本及本项目允许的裁切、修改、公开与同步使用范围；音频还要分开记录原始音源能否随工程/模板/素材包再分发。记录运行时加载到的资源、fallback、裁切/遮罩参数、图层/锚点以及源件到派生件的关系；保持来源原件可恢复，派生文件只包含本片实际需要的裁切、混音或处理。生成图像标明生成方式和非证据属性；档案、新闻截图、统计图与历史照片需保留上下文，未核实或越界素材不能进入正式输出。无法确认许可或文件内容时不声称已审查；仅暂停依赖该文件的部分，其余可独立完成的工作继续。


## 实际渲染

**正常完整制作先交可播放样片。** 正常完整制作，或获授权修改中确需新组织本范围画面的工作，在全量渲染前，默认先制作约 15–30 秒、能代表风格和节奏的可播放样片，涵盖有代表性的内容推进、关键交接/转场、文字处理及已决定需呈现的声音职责；不能只交片头标志、静帧或代码片段。若整段总时长短于该窗口，或用户本来只要短样片，交付请求所需的实际完整时长，不填充、不重复到 15 秒，也不另外做两条。只做方案/审查、在已确认方向内的小修或简单局部操作，或已有仍适用且已获确认的样片时，不强制制作新样片；仅已验证模板或内部关键态预演，不自动免除尚未确认方向的对外样片门槛。用户明确要求跳过样片可遵从；普通“做完整片”不等于跳过。

样片的声音状态必须与实际试听决定一致。除主 Skill/声音 Reference 规定的静音授权或局部纯视觉例外，接收前应把至少一项适用的成熟声音方案按本片片长和时钟试合到样片画面并试听；需声画同步时沿用已核实的共享事件/时间映射。被选择的声音由既有 `audio-plan` 和唯一 `audio.mjs` 路径接入最终编码样片，播放最终文件核听，并以媒体探测确认其音轨状态。若试听后选择静音，最终样片可以无音轨，但现有工程说明须保留试合来源、实际播放范围和静音理由，且最终文件经探测确无音轨。没有可用候选或试听条件时，可交“技术画面预览／声音未完成”，仅继续本样片范围内不依赖声音取舍的画面预演，以及全稿蓝图/时间轴准备；不得把它记为完整样片已接收，其他制作仍遵守样片确认门。

样片须是目标规格或足以代表目标规格的实际编码媒体，可由播放器正常打开并以正常速度观看。制作前核验所选 renderer 真正支持的时间区间/独立样片场景和时钟映射；不得把静帧 `--samples`、内部关键态图、试渲片段计划或全片先渲染后裁成 15 秒说成符合样片门槛。当前 `render.mjs --scene` 编码完整 scene，`--samples` 只生成静帧；它们本身不是可播放区间样片接口。若现有工具不能忠实生成代表性可播放样片，就在扩展全片前停下，报告最小真实控制缺口和可行替代；不虚构区间参数、字段或脚本能力。

对于 ASR 口播，样片须绑定全片冻结时间线中的真实语义锚点。将样片覆盖的全片时间窗和其在样片中的本地时间位置记入现有工程说明或 renderer 已支持的收据；不改冻结 timeline、不另造成片钟、不手动平移 cue。只有 renderer 实际消费这份映射时，才能声称其声画位置正确；若做不到，报告限制并停在样片/映射缺口处。样片提交用户并询问方向/节奏是否满意；确认前不得批量制作/生成剩余镜头或全片素材、先完成整片动画工程后再补交样片，亦不得渲染剩余全片。可继续通读全稿、建立整体蓝图、完成必要的 ASR 虚拟粗精剪与时间轴准备，以及制作样片自身所需依赖。确认的样片和反馈范围写入现有任务状态/工程说明；沉默、超时、技术检查通过或 ASR `frozen` 均不算确认。确认后沿同一对象几何、运动与风格体系扩展；有实质方向变化时只重审受影响样片，不逐镜请批。

**按确定规格输出最终媒体。** 时间线与实现稳定、分辨率/画幅/帧率/编码和容器明确后，使用工程的真实渲染器生成最后版本。记录命令与版本、输入状态、结束结果、输出尺寸和路径；文件应非空并能由合适播放器打开。若渲染后还有修改，必须重新渲染并确认当前路径指向最新文件。

**渲染失败就停在真实状态。** 命令报错、依赖缺失、资源路径失效、音画不同步或文件无法打开时，保存错误和工程状态；可自行修复不改变事实与读法的问题后重试。若下一步需要新权限、工具、费用或素材，转为明确阻塞。草稿和预览要标成非最终，并指出最后一个成功阶段。

**技术降级要检查它有没有改写意思和已确认的表现。** 替换材质、减少帧数、移除转场、改变比例、改成静态说明或简化音轨时，记录原行为与替代行为，并核对事实及关系、对象身份、已确认的力度/动作性格与质感、声画节奏和接续、阅读结果及结论。若只是技术修复且这些要求都保持，自主采用保留它们的最小替代，并同步更新工程、时间线与说明；若替代会改变其中任一已确认要求，说明具体差异及观看后果，交用户选择，不能只因语义近似就称为等价。


## 检查最后的媒介

**播放并定位最终文件中的问题。** 确认输出路径、文件名和修改时间，再将该文件按正常速度从头到尾播放。重点查看信息最密处、段落转换、小字和标签、画面边缘、片头与片尾；需要定位时回到时间码或逐帧。未播放最终文件时，不报告成片已验收。

**对照口播、镜头与事实关系。** 将原稿/实际音轨、镜头表、屏幕文字和关键帧并排检查，核实触发短语或事实是否映射到对应动作，动作是否按条件与语义顺序出现，参加关系的对象是否可追，差异是否实际影响后续组合或结论、结果是否回连输入。同步核实真实时码或暂定预算、关键事实与限定、单位/分母/基线、对象身份、因果方向、比较口径和类比边界。修订后重新渲染并复查，确认必需内容没有漏映，事实表述仍在来源支持范围内。

**在目标尺寸检查可读与稳定。** 按目标平台、时长、播放速度、字幕区、音轨与帧率查看裁切、安全区、对比、缩小后的字体/公式/细线、运动连续性、黑帧、丢帧和声画同步。报告指出具体检查文件与屏幕尺寸；未覆盖的设备或平台保持未知，不泛化保证。

**质量结论跟着证据走。** 分开记录结构、路由、行为、已播放媒体与接收者/专家结果（`STRUCTURE`、`ROUTE`、`BEHAVIOR`、`QUALITY`）。制作方自评最多记 `OBSERVE`；没有接收证据且没有已观察到的目标差距时，`QUALITY` 为 `UNKNOWN`。一旦有证据表明目标差距存在，就记录相应 `FAIL`，不能被其他未知项冲掉。渲染成功、方法来源、示例存在或工具有某项能力，都不能单独证明观众已理解或画面审美达标。
