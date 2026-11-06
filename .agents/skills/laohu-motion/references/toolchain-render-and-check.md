# 工具、渲染与媒介检查

本 Reference 把镜头设计接入真实工程、工具、渲染器和最终媒介。制作与检查方法适配自本地《018_0930录屏讲解后期》的关键帧试作、全片渲染和最后导出播放记录，以及上游的一帧先行和视频动画语法；工具功能以实际项目及当前官方文档为准。这些来源是方法依据，不是工具无关的成片质量证明。当前工具名、版本或产品功能可能变化；使用前按实际环境与官方资料核验。检查结论应引用实际可见的文件、时间码、播放/画幅/文字状态；单人自检不证明所有观众都能理解。


## 输入与返回

本 Reference 接收镜头蓝图、实际项目与素材、目标规格及本轮授权，并先确认工程是否存在、修改范围是否明确、工具是否可用。实现后向主流程返回工具与版本依据、镜头到工程的映射、渲染文件和最后媒体检查状态；未能完成的部分须说明具体阻塞。状态应能用文件、命令、时间码或失败原因复查，渲染成功不等于观众效果已证实。

## 可执行映射：对象、时间、属性与输出

任何可程序化镜头都要能追到“画面对象或等价元素—前态/后态—动作时间—被驱动的属性—所在空间/图层—画面材料”。按本镜需要提供字段，不为未使用的相机、形变、遮罩、素材或图层造空值。下面的 `scene` 是本仓库轻量 Canvas2D 工具的公开调用接口，不要求 Remotion、AE、剪辑工程或用户模板改成它的 JSON；其他工具照样使用原生工程，只要能回查相应对象、关键帧/事件、属性和时间映射。

### Canvas2D scene spec

入口为 `{SKILL_DIR}/scripts/motion-core.js` 的 `MotionCore.validateScene(scene)`、`evaluateScene(scene, absoluteSeconds)`、`drawFrame(canvasOrContext, scene, absoluteSeconds, renderers)`。场景要求 `version: 1`、正整数 `width/height`、正数 `fps/duration`，且 `duration × fps` 是整数帧数。`objects`、`layers`、`events`、`bindings`、`variables`、`camera`、`palette`、`styles` 按实际动作需要提供；缺失相机时舞台中心为默认观察中心，未指定的普通对象位于 world 空间，`space: "screen"` 用于固定屏幕标注。

将最终 `/2` ASR-cut timeline 绑定到 Motion scene 时，`scripts/bind-speech.mjs` 会按 `ceil(durationSamples × fps / sampleRateHz)` 覆盖整条 timeline 的 frame count；它只把 scene 的渲染时长上调到足够的整帧，并在 `scene.motionTimelineCoverage` 与 binding receipt 中保留原始 samples、sample rate、plan hash 及不足一帧的覆盖余量。词/段落 cue 仍锚在原始 project sample 上，不逐 clip 或逐停讲区量化。显式锁定帧数不足以覆盖 timeline 或原有 scene 时，绑定失败并要求调整锁定规格；它不会拉伸、删改或重排音频样本。该自动准备只适用于 `/2`；`/1` 继续要求输入 scene 先通过原有整帧校验，且 scene 时长已覆盖 timeline，`--locked-frame-count` 不适用于 `/1`。

将这个 2 秒场景保存为 `.cache/validation/motion-capability-upgrade/scene.json`，后面的命令会渲染这个文件：

```sh
mkdir -p .cache/validation/motion-capability-upgrade
cat > .cache/validation/motion-capability-upgrade/scene.json <<'JSON'
{
  "version": 1, "width": 160, "height": 90, "fps": 12, "duration": 2,
  "background": "#101820",
  "palette": { "accent": "#f0b429", "track": "#243b53" },
  "styles": { "focus": { "lineWidth": 4, "stroke": "@accent" } },
  "camera": { "x": 80, "y": 45, "zoom": 1 },
  "layers": [{ "id": "diagram", "space": "world", "opacity": 1 }],
  "objects": [
    { "id": "track", "type": "rect", "layer": "diagram", "x": 20, "y": 38, "width": 120, "height": 14, "fill": "@track" },
    { "id": "marker", "type": "circle", "layer": "diagram", "cx": 20, "cy": 45, "r": 8, "fill": "@accent" }
  ],
  "variables": { "progress": 0 },
  "events": [{ "id": "advance", "target": { "kind": "variable", "id": "progress" }, "start": 0, "duration": 1.5, "from": 0, "to": 1 }],
  "bindings": [{ "source": "progress", "target": { "kind": "object", "id": "marker", "property": "cx" }, "input": [0, 1], "output": [20, 140] }]
}
JSON
```

本地 core 的绘制类型是 `rect`、`circle`、`ellipse`、`line`、`path`、`polygon`、`text`、`pixels`，或由作品本地注册的 `custom:<name>`。`path`/`polygon` 使用有限 `{x,y}` 点；`pixels` 使用 `{x,y,color}` cells 与正数 `pixelSize`。只有需要形变的路径才提供 `morph.from/to/anchors`；锚点是从 0 到 1 严格递增的显式对应。层可选择 `parent`、`transform`、`opacity`、矩形/多边形 `clip`、`blendMode` 和命名 `style`。子层继承父层的 world/screen 坐标空间；相机先把 world 坐标变到屏幕，裁切在变换后做，能把原画幅之外的大板平移进视口。

事件以场景绝对秒求值并保持结束值：`target.kind` 为 `object`、`layer`、`camera` 或 `variable`，有 `id`、`property`、`start`、`duration`、`from`、`to`，可选 `ease`。只动画实际使用的属性；当前接口检查对象/图层/相机属性名，并拒绝同一属性重叠事件或事件与绑定冲突。绑定将已定义的变量映射到对象或图层属性；未指定输入输出区间时直接传递变量值。场景求值每次从不可变输入重建状态，支持任意顺序 seek。颜色可用具名 `styles` 和 `@paletteRole`；不支持的绘制/着色需求使用本地 custom renderer，不把未实现的字段写进场景假装有效。

### 文本绘制和实际排版消费

本地 `text` renderer 通过 Canvas `measureText` 实际消费 `layoutText(ctx, text, {maxWidth, lineHeight, letterSpacing})` 的结果；它返回 `lines`、`widths`、`lineHeight`、`height`，绘制器逐行以测得的布局落笔。`text.font` 是 Canvas CSS font shorthand，提供家族、字重和字形；没有显式 `fontSize` 时字号来自该 shorthand。对象态 `fontSize`（包括事件动画后的当前值）显式覆盖 shorthand 内字号；这项覆盖行为是本地文本接口为修复字体尺寸混淆而明确实现的契约，不能推定其他旧字段冲突规则也因此改变。

`maxWidth` 基于实际 Canvas `measureText` 做软换行并尊重显式换行。不可拆分的词或单位若自身超出宽度可以溢出；该接口不是自动缩小算法，也不是完整 CJK 行断引擎。`lineHeight` 是逐行基线距离；`letterSpacing` 是每个字素间距的像素值；`x/y` 是第一行的文本锚点，`y` 对应基线。字体 load 完成之后重新调用布局，超宽原子须由作者调整版面/分组/宽度并实测，不能预期 renderer 自动修复。

自定义绘制器可用 `MotionOps.measureTextOccupancy(ctx, text, style)` 取得分行的 advance、ink、paint 和含留白的占位边界；`style` 的 font、align、direction、baseline、letterSpacing、maxWidth 必须与真正的绘制一致，`lineHeight`、描边、模糊和 padding 也按最终绘制值传入。若调用方省略 direction，函数解析 Canvas 的 `inherit` 方向（可读取元素时按其计算样式），没有 DOM 继承源时采用并返回 `ltr`；绘制时使用结果中的 direction，不能让测量与绘制方向各自继承。Canvas 返回的 `0` 和负 bearing 都是有效测量值；缺少 actualBoundingBox 指标时该行会标为估算，不能把 fallback 当成真实字形测量。非零字距要求浏览器的 Canvas2D 支持 `letterSpacing`；不支持时函数报错，调用方需接入和最终绘制一致的字距实现再测量。

### `MotionOps` 供作品级 custom draw 使用

`scripts/render.mjs` 在 `MotionCore` 后加载 `scripts/motion-ops.js`，并要求 `window.MotionOps.core === window.MotionCore`，之后才加载 `--draw-module`。作品级 `custom:<name>` 回调可读 `window.MotionOps`；这些是供 custom consumer 使用的可复用操作，不添加 MotionCore 的原生 scene 字段，也不重新实现已有 path/camera。当前导出 `clamp(value, low, high)`、`filmToLocalTime(time, mapping)`、`samplePhase(timeSec, phase)`、`sampleChannels(timeSec, phase)`、`indexPhases(scene)`、`mapLocalTimeToFilm(localTimeSec, mapping)`、`findSceneAudioEvents(scene)`、`mapSceneEvents(plan, scene, maps)`、`seededUnit(seed, index)`、`stableParticles(seed, count, bounds)`、`emphasisEnvelope(time, config)`、`withLocalMask(ctx, buildMaskPath, draw)`、`measureTextOccupancy(ctx, text, style)`、`composeLabelGeometry(input)`、`transformBounds(bounds, transform)`、`chooseLabelPlacement(input)`、`diagnoseLayout(input)`、`createTextBitmapCache(options)`、`validateLocalEffects(scene)` 与 `localEffectContracts`。时间采样、粒子和文字布局操作由绝对时间或显式输入求值，可重复 seek；`emphasisEnvelope` 是局部 custom 数值，只有其配置的 `overshoot` 会让攻击段短暂超过 `peak`，不能把它叫作普通插值曲线。

#### 已接通的 Huashu 局部效果实例

原子局部效果通过 `scene`/custom 对象中已存在的 `data.motionEffects` 接入，不为 MotionCore 增加原生字段。实例需有稳定 `id`、catalog `effectId`、真实 `targetId`、与目标绑定一致的屏幕几何、源码实际消费的 `parameters` 和共享 `phaseId`。阶段登记在 `scene.phases[]` 或任一 `objects[].data.phases[]`，沿用 `MotionOps.samplePhase` 对 `durationSec` 或 `endSec` 的解析；音频事件可引用同一 `phaseId`，不要复制第二份起止时间。`render.mjs` 发现实例后自动校验并加载 catalog pin 的 `huashu-art-motion` DG/MO closure，注册 `templates/adapters/huashu-effects.js` 的两个 renderer，记录源函数调用、实例字段、目标变化与 adapter/source hash。若没有注册 effect instance，既有 `--template-effects huashu-art-motion-dg` 仍只按原入口预载库。

当前真实消费范围限于静态、未变换、顶层 screen-space `rect`/`line`/`path`：原 `DG.drawPartial` 对路径逐步描显，`DG.circumscribe` 对矩形做结束即消失的一次圈注，`DG.brace` 沿目标矩形边长出并保持括号，`DG.indicate` 返回的强调值只驱动圈注轮廓（不会缩放目标），原 `MO.lagged` 则按必需的完整 stagger 组改变具名矩形自身的 opacity。实例进度是绝对时间求值，支持任意顺序 seek；save/restore 隔离 Canvas 状态。文字、图片、移动/变形/图层目标、任意对象尺度动画都不在此接口内；需要这些能力时用相应真实 renderer 或交回主线换方案，不要将目录机制描述成通用效果。

`measureTextOccupancy` 临时应用并恢复实际 Canvas 字体、对齐、方向、基线和字距，返回分行的 `advanceBounds`、`inkBounds`、`paintBounds`、`occupiedBounds` 与实际指标可用性；描边、模糊和留白应传入与最终画面相同的值。actualBoundingBox 中的零和负 bearing 都按原值保留；缺失指标只给出标记为 `mixed-or-fallback` 的估算。非零 `letterSpacing` 在 Canvas 不支持时会明确失败。

`composeLabelGeometry({measuredText,parts,background,clearance})` 是唯一的标注组几何 API 契约：`measuredText` 必须带 `paintBounds`、`occupiedBounds`；`parts` 为相对文字锚点的 `{id,drawBounds,paintBounds?}`，省略 `paintBounds` 时与绘制框相同；可选 `background` 接收 `{id,innerPadding:{top,right,bottom,left},contentPartIds}` 并只生成无额外阴影/滤镜的纯填充底板；有描边、阴影或滤镜的底板应作为显式部件提供真实 `drawBounds` 和 `paintBounds`，或由在选位、绘制和逐帧登记中消费同一真实几何的等价路径处理。`clearance` 为非负数或 `{x,y}`，用于组外占位。函数返回文字锚点偏移、归一到组原点的文字 paint bounds、各部件的 draw/paint bounds、底板 draw/paint bounds、完整 `visualBounds`/`occupiedBounds` 和测量状态。组 visual/occupied 采用实际 paint 矩形；绘制读取 draw 矩形，组外候选和逐帧登记覆盖完整 occupied。文字自身已计入的 padding 不会被重复添加。缺失/重复 ID、非有限坐标、负尺寸、负内边距或 clearance 会显式报错；没有底板/部件时可直接处理纯文字。

`transformBounds(bounds, matrix)` 将局部矩形的四角投影到同一屏幕坐标，返回保守 AABB；调用者须先组合真实对象、图层和相机变换，不能遗漏某层，也不能重复投影已在屏幕空间的坐标。`chooseLabelPlacement({id,targetId,relation,readingInterval,candidates,protectedAreas,viewport})` 仅在作者给定、按优先级稳定排序的候选中，挑选未压入受保护区域且未出画幅的位置；候选框、保护框都必须是同一屏幕坐标中的矩形，区间字段只判断时间区间是否相交，不计算对象在区间内的运动。要声称整个阅读区间稳定可用，提交的候选框和保护框必须覆盖该区间所需的范围（如扫掠包围框），或按明示的采样拆分/重复检查；单一静态边界只证明该边界对应的时点。复杂运动无法被一个保守框容纳时拆分区间或重构构图。返回 `placed` 或带各候选冲突的 `unresolved`；没有可用位置时回到布局、对象职责或展示时序，不自动缩小、隐藏必读文字。

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

当镜头需要对齐虚拟剪辑后的口播时，使用 [ASR 剪后时间轴与语义动画锚点](speech-cue-binding.md) 选择少量语义 point/span/segment。`scripts/bind-speech.mjs` 同时接收 edit-plan、其编译 timeline、绑定规格和现有 scene；它调用 asrcut 的 `hashPlan`/`compilePlan`，要求整份 timeline 与当前 plan 编译结果相同。revision 是正整数。若 plan 给出源媒体路径与 SHA，绑定时流式重算并拒绝变化；若没有媒体路径/hash，receipt 明确标 `unavailable`。它也使用 asrcut `verifyPlanEvidence(plan,{baseDir})` 按声明的 hash mode 重读有 `evidenceRef` 的 ASR 原文件字节；丢失、不可读或内容变化时拒绝绑定。没有 `evidenceRef` 的来源在 receipt 记为 `unlocated`，不是“已验证”。两项检查分别覆盖媒体文件和 ASR 输入文件，不证明识别词句准确，也不证明剪辑决定经过人工确认。

正式绑定只接收 `state:"frozen"`；`draft` 必须显式用 `--preview`/`preview:true`，receipt 留下预览标记和原审阅状态。绑定器不修改 edit-plan/timeline，不改 `targetRange`，也不把陈旧语义改绑到相邻同名词。输出把具名 phase 放入目标 `custom:*` 对象现有的 `data.phases[]`，把命名 cue 放入 `scene.audioEvents[]`。作品绘制器仍须用绝对成片秒调用 `MotionOps.samplePhase`/`sampleChannels` 并把通道结果用于真实绘制；声音计划通过 `eventId` 指向同一 `audioEvents[]` 事件，交给 `MotionOps.mapSceneEvents` 与 `scripts/audio.mjs`。这条路径复用现有 custom 消费者，不增加 MotionCore 原生 scene 字段；既有 `filmTimeSec` 直接事件保持有效。

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

若 `ease` 省略，默认 `linear`。本地 scene 接受的名称是 `linear`、`smooth`、`ease-in-out-cubic`、`ease-out-cubic` 和 `ease-in-cubic`；校验与求值均会拒绝未知名称，不会静默换成线性。通用插值会把归一进程限制在 `[0,1]`，所以不产生过冲；需弹性越界或其他特殊轨迹时，在作品本地 custom renderer 中明确实现和检查，不伪称标准事件支持。

### 动态 Motion 操作的严格收据

本地动态跟随框及其局部覆盖范围、可用字段和显式不支持项见 [Motion 操作与绘制证据契约](motion-runtime-contract.md)。选用 `laohu.motion-follow-box/1` 时，只声明真实 scene-local 时间窗和精确 operation instance；strict render 使用 `--require-motion-evidence`，缺 expected、缺 draw hook、missing/unsupported、陈旧状态、viewport/clock 不匹配或零覆盖会在提交 MP4 前失败。窗口使用半开 `[startSec,endSec)` 编码帧语义。

成功后运行 `scripts/motion-probe.mjs --scene <absolute-scene> --manifest <absolute-manifest>`。manifest 的 input fingerprints 绑定 scene 字节、draw module（明确记录未提供哨兵）、MotionCore、MotionOps provider 与 catalog/operation entry；probe 重读并核对这些文件，拒绝同路径内容已变的旧收据。对浏览器实际请求到的 image/font/script 等资源，manifest 记录可见 URL、响应元数据与可哈希响应体；probe 重核本地 file URL。系统字体解析、inline/data/blob 内容和未暴露请求不在这项资源收据覆盖范围内。探针只证明局部绘制与输入/帧/输出一致，不证明完整实体可见、跨 renderer handoff、全片运动覆盖、可读性或审美。

### 实际渲染命令

`scripts/render.mjs` 用本机现有 Playwright/browser 逐帧调用 Canvas core，再把 PNG 序列交给本机 FFmpeg 输出无声 H.264 MP4。它不会自动消费 scene 的音频字段，也不替代可混音、3D、剪辑或现有模板工程。若有旁白、BGM、SFX 或既有音轨，由作品构建把同一语义事件表导出为内部 audio-plan；`scripts/audio.mjs` 核对共享 event ID、asset index/项目资产 hash 与授权状态，按成片时间裁切、变速/增益/包络、混音并可 mux 到画面 MP4。其支持范围、candidate 开关、静音和 locked 轨边界见 [音乐、音效与静音设计](sound-design.md)。普通核心 interpolation 曲线仍按 MotionCore 五条现有曲线与 clamp 行为；特殊过冲只由作品级 custom 操作实现。无需安装软件，显式提供浏览器、FFmpeg、cache 与 output，且先用短技术镜头确认目标工程所需的自定义绘制能工作：

音频 consumer 要求 `--video` 是无音轨的 picture-only 输入，长度至少覆盖 plan 的 `durationSec`；遇到带音轨视频会拒绝封装，避免静默丢掉用户素材。需要保留的既有音轨须由作品构建显式登记为受保护的 locked 计划轨，或继续使用原工程的混音封装路径；本工具不会自动透传视频内音轨。音频事件必须有可判定的全局/局部时钟及映射，失败的长度或路径保护检查发生在写输出前。最终检查实际时长和音轨流；无事件且无轨道时，视频只封装画面，不创建静音音轨。

```sh
mkdir -p .cache/tmp/motion-capability-upgrade .cache/validation/motion-capability-upgrade
TMPDIR="$PWD/.cache/tmp/motion-capability-upgrade" \
MOTION_BROWSER="<本机已安装浏览器可执行文件>" \
MOTION_FFMPEG="<本机已有FFmpeg可执行文件>" \
NODE_PATH="<宿主现有Playwright依赖目录>" \
node .agents/skills/laohu-motion/scripts/render.mjs \
  --scene "$PWD/.cache/validation/motion-capability-upgrade/scene.json" \
  --output "$PWD/.cache/validation/motion-capability-upgrade/preview.mp4" \
  --cache-dir "$PWD/.cache/tmp/motion-capability-upgrade" \
  --samples "0,0.75,1.5,1.9"
```

`--samples` 中的请求时刻均位于 2 秒场景内；非整帧时刻会作为单独预览标记。`--draw-module PATH` 是可选参数，只在本地已有对应文件时传入；它可注册 `window.MOTION_RENDERERS["custom:name"]`，供对象绘制回调消费，并可调用已经加载的 `window.MotionOps`。若自定义字体、图像或其他异步资源需要先加载，先通过 `window.MOTION_READY` 提供 Promise 或返回 Promise 的函数；runner 会先等待 `document.fonts.ready` 和该资源钩子，钩子拒绝或返回 `false` 就停止，不输出伪完整帧。浏览器 profile、PNG 帧、样本帧及浏览器/FFmpeg 子进程临时文件使用显式 `--cache-dir` 下的运行目录；为支持同盘原子替换，编码中的 `.part.mp4` 暂存文件位于目标 MP4 旁边，因此输出目录也需要临时空间。runner 不下载浏览器、不安装依赖。输出已存在时默认拒绝覆盖，用户明确指定 `--overwrite` 才替换给定路径。

runner 的 manifest 记录场景规格、输出、实际帧目录、样本帧和事件属性值。对非整帧时间请求，样本另存为单独预览并标成 `separate-preview`，不会冒充 MP4 编码帧。每项事件分别记录自身声明的理想终值、事件结束后首个编码时刻的实际目标属性值、后续事件是否已接管、运动期最后帧和片尾最后编码帧实际值。`settledInEncodedMedia` 只表示首个可用编码时刻的该目标属性与本事件自身 `to` 值相符；后续事件可能在首帧前接管而使其未出现。它不证明对象未被其他图层透明度或遮罩隐藏，也不证明结果语义完整或已充分落定。若动作恰在片尾结束，离散帧可能没有端点；不能把理想端点状态说成已经出现在成片中。

`layoutDiagnostics` 是可选的逐绘制几何记录：`not-checked` 表示没有可用矩形快照，包括全缺失或全空快照；`invalid-evidence` 表示收到的快照均因时码陈旧或结构损坏而不可用；`partial` 表示存在有效帧但覆盖中还含缺失、空、陈旧、损坏、部分登记或未声明 expected IDs；`scoped` 仅表示每个编码帧都在 producer 声明的范围内提供了完整登记矩形。`scoped` 不是整张场景通过；没有期望 ID 清单时也不能证明该 producer 没漏登记对象。冲突与出界汇总仅取实际编码帧，按帧序保存首末时间码；manifest 为预览样本另列诊断，避免默认预览落在编码帧时把同一冲突重复计数或覆盖其编码时间。样本预览单独统计，不替代编码帧。冲突是可能相交的包围框，不等于像素确实遮住；装饰性/有意叠放须显式列入允许 ID 对，之后仍要看实际画面。

机器 manifest 与语义蓝图互相对照：它能证明某事件字段、属性映射和输出帧存在，不能证明动作解释正确、画面有美感、节奏好或观众看懂。若画面来自其他引擎，按等价工程映射检查即可，不要求生成这份 JSON 或使用此 runner。

## 选工具与进入工程

**从现有工程开始。** 用户提供动画、项目文件、素材或渲染结果时，先定位工程入口、依赖、脚本、资源路径、版本和输出说明，并核对实际文件。这样既能沿用有效结构，也能保护用户资产；进入修改前记录工程状态和可恢复位置。

**让工具服从画面控制需求。** 选择工具时，比较帧级控制、可编辑性、源媒体保真、三维/合成能力、字幕精度、渲染规模和交付格式，再优先使用用户指定且可行的工具或现有项目。代码动画、剪辑/合成、专业动画器、生成工具或混合方案都可采用，但应先用关键帧或短段验证当前任务最难的部分。决策要能说明工具能实现什么、有什么限制以及怎样检查输出。

**先确认模糊工具名。** 对“Hyperion”“Revoition”等可能的听写词，结合上下文、现有项目和官方文档核对产品；`HyperFrames` 与 `Remotion` 只是检索候选，不代表用户已经选择。产品身份不清且会改变路线时，先澄清，不安装或调用不确定的工具。

**收费、全局安装和外传要先明确授权。** 发现路线需要新的付费软件、外部账户、付费接口、全局依赖或上传隐私素材时，先给出具体影响和可选方案，等待授权。能沿用现有本地工具就不扩大依赖；检查交付记录，确保没有未授权费用、账户操作、环境变化或素材外传。


## 从镜头规格到实际工程

**让工程逐项消费语义蓝图。** 蓝图已给出语义动作的触发短语/事实、成片锚点、对象或等价渲染单元、前态/过程/后态、文字与图形的当前/后续曝光、起中落构图、焦点及关系结果后，再按工具写成场景、片段、关键帧、时间码、图层或声音轨。工程映射须能从每项承重动作追到真实时间事件、目标对象/属性、文字/图形布局、对象继续保留/弱化/退出/合并/重排的方式，以及观众应看到的关系与结果；每项结果也能回到对应输入和对象。稳定 ID 可用于对象，现有 metadata 或 `custom` 内具名相位也可作等价映射，不要求一词一对象或新 schema。单个 `custom` 组可以共用一个 progress/时钟，但内部相位须对应动作图的语义时间，并驱动对应文字与图形的显隐/状态；整体淡入或整体 progress 不能替代逐项消费。保留原稿段 ID、事实来源和验收点；有实际音轨时按来源版本和真实时间锚点映射，无音轨时只记录暂定语义预算，不称声画同步。从工程片段应能回到对应蓝图动作，关键状态包含开始、过程、落定；若字图曝光顺序、输入对结果的贡献或箭头表达的对象方向还不清楚，先修该镜动作图并验证短段；正常完整制作之后续全片渲染须等对外样片获确认。

**不要把单场景 renderer 当成整片 assembler。** `scripts/render.mjs --scene` 一次只消费一个 Motion scene。多段影片用 `templates.mjs` 的单一入口和一份现有蓝图：

```sh
node .agents/skills/laohu-motion/scripts/templates.mjs render \
  --film-blueprint /absolute/film-blueprint.json \
  --output /absolute/picture-only.mp4 \
  --work-root /absolute/project/.cache/tmp/huashu-motion \
  --manifest /absolute/film-manifest.json \
  --browser /absolute/chrome \
  --ffmpeg /absolute/ffmpeg
```

蓝图格式为 `laohu.huashu-film-blueprint/1`，首批只接受 1920×1080、30fps。共同顶层字段为 `width`、`height`、`fps`、`clock` 与 `segments`。`clock.kind:"film-global"` 使用 `{kind:"film-global",durationSec}`，每段用 `startSec/endSec` 连续覆盖全片；`clock.kind:"asrcut-v2"` 使用 `{kind:"asrcut-v2",timelinePath,timelineSha256,editPlanPath,editPlanSha256}`，每段只列 `unitIds`，按 source `occurrenceId` 或 presentation `id` 的冻结顺序连续覆盖所有 timeline units。两种 clock 的字段不能混用。ASR 分支会重算 plan hash、核对 timeline 与 `compilePlan(plan)` 的完整结果，并复核有声明路径/hash 的源媒体和 `verifyPlanEvidence` 所指的 transcript 原始文件；没有 `evidenceRef` 的来源只能保留为 `unlocated`，不是已验证。任一时钟缺少真实来源、边界留空/重叠、顺序或 hash 不符时停止，不另造时间线。

每段只能选实际 renderer：`huashu-motion-template` 段填写 `id/templateId/variables` 和该时钟的时间字段，可选 `eventScenePath/eventSceneSha256`；`motion-scene` 段填写 `id/scenePath/sceneSha256` 和该时钟的时间字段，可选成对的 `drawModulePath/drawModuleSha256` 或 allowlist 中的 `templateEffects:"huashu-art-motion-dg"`。现有 Motion scene 仍由 `render.mjs` 渲染，Huashu native scene 仍由 `templates.mjs render <templateId> --spec ... --work-root ...` 调原生闭包；native 的 `variables.duration` 由已量化片段帧数生成，若提交值不相等或源码控制步长/字段校验不接受就停止该段，不改原模板算法。Motion scene 不静默改写输入 `duration`：源时长与编译片段最多相差一帧量化余量，且 `render.mjs` 的 `Math.round(duration × fps)` 必须正好得到该片段帧数；scene-local 事件及被局部事件/效果引用的局部 phase 也须处于源场景与渲染窗口内，否则应重编该段 scene，而不是把改 duration 当作完整 retiming。派生 scene 保留源文件字节，manifest 同时记源与派生路径/hash。固定曲线、排版等原生机制不可用蓝图虚构字段覆盖。所有段需同为 1920×1080、30fps、单视频流、无音轨、兼容编码参数；adapter 按全局绝对边界向上量化帧数，检查残差与速度，再 stream-copy 硬切拼接，不增加转场。其输出始终是 picture-only，声音需由既有 `audio-plan.v1` / `audio.mjs` 按职责单独混音封装。`laohu.huashu-om-film-manifest/1` 固定蓝图/ASR hashes，记录片段 frame/source ranges、精确 film start、按实际渲染片长计算的局部/全局 speed、量化余量、源场景 hash 与编译后的 `audioEventScene`、`audioTimeMaps`、`audioEventBindings`；音频消费者继续读取这些记录，不另写第二套时间表。工作根、源文件、vendor、输出目录须通过同盘检查。渲染成功只证明各片段和硬切容器产出，仍须打开最终画面按目标尺寸和正常速度完整观看。

**Film Blueprint `/2` 是混合合成入口。** 它与直接调用的 `laohu.huashu-film-blueprint/1` 格式分开，但 `/2` 可在同一外层时钟中接收 `motion-scene`、`huashu-motion-template` 与 `video-shotcraft-remotion` segments。前两类由原 renderer 各自先渲染为 picture-only base；adapter 核验 `/1` receipt、base 输出 hash、H.264 1920×1080@30、精确帧数及无音轨，再把哈希锁定并 staging 的底片交给 Remotion `OffthreadVideo`。同一 `/2` Composition 再绘制该段经校验的 Shotcraft `local-effect` layers，以及 `transitionEdges` 的 FlashCut。每个 overlay layer 可带 segment 内唯一 `id`；同一 catalog 组件出现多个实例时，action binding 必须用 `componentCatalogId` + `componentInstanceId` 指向真正绘制的那一层。底片 source 与原生 receipt/hash 应保留在 `/2` manifest，便于区分原 renderer 产物与后续 overlay 合成；Full-scene Shotcraft segment 保留原单镜头构图，不能通过 `/2` 在其上任意叠层。

使用 `templates.mjs render --film-blueprint <file> --output <picture.mp4> --work-root <项目同盘临时目录>` 并确保输入为 `laohu.huashu-film-blueprint/2`；其 renderer-specific segment 字段、1920×1080@30fps、严格顶层白名单、`compositionGroups`、`transitionEdges`、`actionBindings`、source frame/duration 与无 overlap 约束均见[Video Shotcraft 源接入规则](video-shotcraft-integration.md#film-blueprint-2-的真实接口与停止条件)。为本地 overlay action 绑定 ASR/source landmark 时，`componentCatalogId` 必须指向该 segment 中实际渲染的 Shotcraft 组件；同类组件有多个实例时，还须给对应 layer 稳定 `id` 并用 `componentInstanceId` 指定实例。Gallery PaperTitleCard 的内容派生仅限 catalog 锁定的 `paper-title-card-copy` provider、55 帧原时长和单个完整 source layer；其他派生改动仍拒绝。渲染前用 `node .agents/skills/laohu-motion/scripts/templates.mjs verify --source video-shotcraft` 核实来源和 derived provider 的 SHA/转换关系。renderer 自动写 `laohu.motion-film-manifest/1` receipt（默认 `<picture.mp4>.manifest.json`）；核对各 base source/receipt/hash、overlay bindings、派生 provider 与实例 ID、事件 map、素材和最终 ffprobe 结果。`/2` 最终仍只渲染无声画面，不是另一个音频混音器；最终音轨仍由现有 `audio-plan.v1` / `audio.mjs` 唯一接管，新 manifest 到音频 consumer 的兼容尚未验证前不得绕过门禁交付混音成片。

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

**难点先行验证。** 新画风、新工具、复杂形变、档案拼贴、多输入关系或多轨声画尚未证明可行时，选一个真实高风险镜头，用实际输入对象按起态、关键中态到结果落定的顺序预演，而不是只看完成后的终态或检查蓝图字段；在目标尺寸与正常速度检查当前焦点、对象间的位置/方向/分组等空间关系、必要阅读停留，以及关系变化怎样被实际看见。若画面只逐项填入预留槽位，过程中没有承担当前理解任务的关系变化，返回 [视觉设计](visual-design.md) 重新选择构图；若比较、连续累积或阅读依赖稳定的共同比较布局，可以保留，但预演要证实该布局持续承担比较或上下文职责。此检查不要求每拍换色、加动作或加运镜。逐项核对语义动作是否驱动预定对象/属性，重要差异是否进入后续组合/结果，结果是否回连其输入且可见可读；镜头使用相机或遮罩时，还要实测锚点、平移/缩放或遮罩边界是否随目标正确变化，不需要这些动作时不造空字段。对依赖进入、落定、阅读停留或交接的关键相位，按实际 fps 导出并检查编码后帧和最终 renderer/合成 consumer 的可见状态；字段时间与蓝图相符仍不能替代观察画面。此处关键态预演是内部自审，不要求用户批准。若一份实际可播放的样片覆盖这些状态，可用同一画面完成内部检查；但内部自审与用户确认分别记录。未出现关键结果、未留足阅读时间或运动映射断开就先修短段，再按对外样片门推进后续全片；预演素材、用户样片和最终媒体分开标记，避免把局部成功当成全片完成。

**每项素材保留来源、派生和可再用范围。** 图片、文档、字体、音频、视频和角色资产来自用户、网络、工具包还是生成器，应有稳定 asset ID 并在工程资料中记录实际文件路径、版本/来源页、可复现时的哈希、许可名称/版本及本项目允许的裁切、修改、公开与同步使用范围；音频还要分开记录原始音源能否随工程/模板/素材包再分发。记录运行时加载到的资源、fallback、裁切/遮罩参数、图层/锚点以及源件到派生件的关系；保持来源原件可恢复，派生文件只包含本片实际需要的裁切、混音或处理。生成图像标明生成方式和非证据属性；档案、新闻截图、统计图与历史照片需保留上下文，未核实或越界素材不能进入正式输出。无法确认许可或文件内容时不声称已审查；仅暂停依赖该文件的部分，其余可独立完成的工作继续。


## 实际渲染

**正常完整制作先交可播放样片。** 正常完整制作，或获授权修改中确需新组织本范围画面的工作，在全量渲染前，默认先制作约 15–30 秒、能代表风格和节奏的可播放样片，涵盖有代表性的内容推进、关键交接/转场、文字处理及已决定需呈现的声音职责；不能只交片头标志、静帧或代码片段。若整段总时长短于该窗口，或用户本来只要短样片，交付请求所需的实际完整时长，不填充、不重复到 15 秒，也不另外做两条。只做方案/审查、在已确认方向内的小修或简单局部操作，或已有仍适用且已获确认的样片时，不强制制作新样片；仅已验证模板或内部关键态预演，不自动免除尚未确认方向的对外样片门槛。用户明确要求跳过样片可遵从；普通“做完整片”不等于跳过。

样片须是目标规格或足以代表目标规格的实际编码媒体，可由播放器正常打开并以正常速度观看。制作前核验所选 renderer 真正支持的时间区间/独立样片场景和时钟映射；不得把静帧 `--samples`、内部关键态图、试渲片段计划或全片先渲染后裁成 15 秒说成符合样片门槛。当前 `render.mjs --scene` 编码完整 scene，`--samples` 只生成静帧；它们本身不是可播放区间样片接口。若现有工具不能忠实生成代表性可播放样片，就在扩展全片前停下，报告最小真实控制缺口和可行替代；不虚构区间参数、字段或脚本能力。

对于 ASR 口播，样片须绑定全片冻结时间线中的真实语义锚点。将样片覆盖的全片时间窗和其在样片中的本地时间位置记入现有工程说明或 renderer 已支持的收据；不改冻结 timeline、不另造成片钟、不手动平移 cue。只有 renderer 实际消费这份映射时，才能声称其声画位置正确；若做不到，报告限制并停在样片/映射缺口处。样片提交用户并询问方向/节奏是否满意；确认前不得批量制作/生成剩余镜头或全片素材、先完成整片动画工程后再补交样片，亦不得渲染剩余全片。可继续通读全稿、建立整体蓝图、完成必要的 ASR 虚拟粗精剪与时间轴准备，以及制作样片自身所需依赖。确认的样片和反馈范围写入现有任务状态/工程说明；沉默、超时、技术检查通过或 ASR `frozen` 均不算确认。确认后沿同一对象几何、运动与风格体系扩展；有实质方向变化时只重审受影响样片，不逐镜请批。

**按确定规格输出最终媒体。** 时间线与实现稳定、分辨率/画幅/帧率/编码和容器明确后，使用工程的真实渲染器生成最后版本。记录命令与版本、输入状态、结束结果、输出尺寸和路径；文件应非空并能由合适播放器打开。若渲染后还有修改，必须重新渲染并确认当前路径指向最新文件。

**渲染失败就停在真实状态。** 命令报错、依赖缺失、资源路径失效、音画不同步或文件无法打开时，保存错误和工程状态；可自行修复不改变事实与读法的问题后重试。若下一步需要新权限、工具、费用或素材，转为明确阻塞。草稿和预览要标成非最终，并指出最后一个成功阶段。

**技术降级要检查它有没有改写意思。** 替换材质、减少帧数、移除转场、改变比例、改成静态说明或简化音轨时，先记录原行为和替代行为，再核对数据读法、对象身份、事实、节奏与可读性是否变化。若改变结论，就交用户选择；否则采用保义的最小替代，并同步更新工程、时间线与说明。


## 检查最后的媒介

**播放并定位最终文件中的问题。** 确认输出路径、文件名和修改时间，再将该文件按正常速度从头到尾播放。重点查看信息最密处、段落转换、小字和标签、画面边缘、片头与片尾；需要定位时回到时间码或逐帧。未播放最终文件时，不报告成片已验收。

**对照口播、镜头与事实关系。** 将原稿/实际音轨、镜头表、屏幕文字和关键帧并排检查，核实触发短语或事实是否映射到对应动作，动作是否按条件与语义顺序出现，参加关系的对象是否可追，差异是否实际影响后续组合或结论、结果是否回连输入。同步核实真实时码或暂定预算、关键事实与限定、单位/分母/基线、对象身份、因果方向、比较口径和类比边界。修订后重新渲染并复查，确认必需内容没有漏映，事实表述仍在来源支持范围内。

**在目标尺寸检查可读与稳定。** 按目标平台、时长、播放速度、字幕区、音轨与帧率查看裁切、安全区、对比、缩小后的字体/公式/细线、运动连续性、黑帧、丢帧和声画同步。报告指出具体检查文件与屏幕尺寸；未覆盖的设备或平台保持未知，不泛化保证。

**质量结论跟着证据走。** 分开记录结构、路由、行为、已播放媒体与接收者/专家结果（`STRUCTURE`、`ROUTE`、`BEHAVIOR`、`QUALITY`）。制作方自评最多记 `OBSERVE`；没有接收证据且没有已观察到的目标差距时，`QUALITY` 为 `UNKNOWN`。一旦有证据表明目标差距存在，就记录相应 `FAIL`，不能被其他未知项冲掉。渲染成功、方法来源、示例存在或工具有某项能力，都不能单独证明观众已理解或画面审美达标。
