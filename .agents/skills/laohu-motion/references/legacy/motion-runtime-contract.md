# Motion 操作与绘制证据契约

> 适用范围：本文记录既有 Remotion Composition、Film 与 Shotcraft compatibility path。新建动画默认使用本地 Motion Showreel；只有继续旧工程时才按本文调用。Showreel runtime 见 [本地运行入口](../showreel-runtime.md)。


本 Reference 包含 Motion 的默认运行栈与一个已接通的局部操作证据契约。默认画面宿主是本地 Remotion Composition：Film blueprint 保存唯一全片时间线，ASRcut sample → film frame → segment-local frame 是唯一换算链；Shotcraft `/2` 以受限 JSON props 装配。单片专属构图、内容布局或成熟模块组合可以由工作项目的 `.tsx` 经 `laohu-project-shot` 输出；工作模块从稳定 `@laohu/motion` 入口导入本地成熟实现，React/Remotion 仍由规范 runtime 提供。既有 authored TSX registry 入口继续服务登记的参考演示和兼容路径，不要求普通作品把每个新镜头登记到共享 registry。Runtime root 按 Remotion 版本和 canonical lock hash 放在 work root 的项目缓存；`doctor` 检查包、headless browser、FFmpeg 和真实 Canvas 样帧，缺少时 `setup` 只准备该匹配缓存。`core/`、`components/`、`shots/`、`themes/` 是本地模块入口；镜头内部仍可采用 Canvas、SVG、native/media 或 Three。Film 不让 renderer 另造时钟，最终混音只由 `scripts/audio.mjs` 消费唯一 audio-plan。若调用已接通的动态矩形目标强调，再继续读下文；它不是 OneTake 原动作复刻、通用实体追踪器或全片连续性判定器。

默认检查命令（`<WORK_ROOT>` 必须是本项目所在外接工作盘目录）：

```sh
node .agents/skills/laohu-motion/scripts/laohu-motion-runtime-cli.mjs doctor \
  --skill-root "$PWD/.agents/skills/laohu-motion" --work-root "$PWD"
node .agents/skills/laohu-motion/scripts/laohu-motion-runtime-cli.mjs setup \
  --skill-root "$PWD/.agents/skills/laohu-motion" --work-root "$PWD"
```

日常制作先运行 `doctor`；只有它报告缺失或锁文件变化时运行 `setup`。不能依赖旧的 `.cache` 绝对路径、全局 npm 状态或每次重装。共享、可供多项目复用的组件/镜头按 catalog 所登记的入口调用；本片专属 `useCurrentFrame`、Three、素材或自定义绘图组合可由项目 `.tsx` 通过 `laohu-project-shot` 消费稳定本地模块，不因此改动共享 registry/catalog。来源实现不可用整仓引用替代本地模块。

## 工作项目的项目级镜头组合

当已登记 JSON 候选无法表达本片布局、对象关系或材料组合时，导演可以在工作项目建立或修改本片 `.tsx`，让文件导出 Film segment 使用的 React shot component。正常作品任务不必将其登记为共享 `shotId`：共享 catalog 负责长期可复用资源的来源、许可、接口与可用性；项目 `.tsx` 负责本片的组合、对象、版面、几何、内容和时序。此类内容组合可以重排信息与布局，但成熟来源的底层 reveal、材质、曲线、相机等算法保持原实现语义；通过真实开放参数或局部 adapter 输入内容，不另写近似算法冒充来源效果。

制作前从项目目录运行 prepare，取得真实 module、依赖闭包、props 与资产的冻结描述符：

```sh
node .agents/skills/laohu-motion/templates/adapters/laohu-project-shot.mjs prepare \
  --blueprint "$WORK_ROOT/film-blueprint.json" \
  --work-root "$WORK_ROOT" \
  --module shots/explainer.tsx \
  --export ExplainerShot \
  --props-json '{"title":"关系变化"}' \
  --asset assets/diagram.svg
```

`--asset` 可重复；`--props-json` 可省略，默认空对象。命令扫描 TSX 的实际 import 闭包及声明素材，输出准确的 `moduleSha256`、`dependencies[]`、`assets[]` 等字段供 Film `/2` segment 使用；它只报告当前字节，不编辑蓝图或源文件。每次改模块、被导入依赖或素材后重新 prepare，随后由 `/2` production 校验对应锁和实际消费 receipt。Segment 以 `renderer: "laohu-project-shot"` 指向相对 work root 的 `.tsx`、export、JSON props、依赖与资源路径/哈希；bundle 将 `@laohu/motion` 映射到已验证的稳定 `components/shots/index.ts`，React/Remotion 从同一 canonical runtime 解析。当前接入沿用既有 Film `/2` 尺寸与 30fps 合同，输出 picture-only；不得另建 ASR/Film 时间线、私有时钟、音轨或第二个 audio consumer。

## 已接通的局部操作

唯一可调用 operationId 为 `laohu.motion-follow-box/1`，由本地 `scripts/motion-ops.js` 注册，render 入口预检后才可消费。它接收一个普通 Motion 场景中真实存在的、非 morph 的 world-space `rect` 目标。目标可以改变位置、尺寸、对象变换，也可位于含变换的 world-space 祖先图层内。操作只绘制矩形目标在同帧最终投影下的四边强调框，不复制目标，不替目标改相机。

MotionCore 的自定义绘制回调保持前四个参数 `(ctx, object, t, scene)`，并新增可选第五个 `evaluatedState` 参数。Core 在一次 `drawFrame` 开始时只求值一次；第五参数就是该次绘制用于对象、图层和相机的状态。操作从它取得目标和祖先层变换，再通过同一 scene camera 投影四角。目标及同层文字仍由正常对象路径绘制；操作 owner 必须放在根屏幕空间覆盖层，该层在 world 层之后绘制。不得自己另调 `evaluateScene` 或另造一台 camera 来声称框贴合目标。

owner 的 `data.motionOperations` 项只接受这些字段：

```json
{
  "instanceId": "focus-instance",
  "entityId": "diagram-target",
  "operationId": "laohu.motion-follow-box/1",
  "targetId": "target-rect",
  "phaseId": "focus-window",
  "nativeParameters": {
    "fromLineWidthPx": 2,
    "toLineWidthPx": 4
  },
  "controlledAttributes": [
    "projected-target-frame",
    "screen-space-line-width"
  ]
}
```

`entityId` 是调用方给出的语义身份，provider 不证明该标签符合画面内容。`instanceId` 标识这次真实操作。相位在 `scene.phases[]` 或 `objects[].data.phases[]` 中定义，并使用现有 scene-local 秒与已支持曲线。`fromLineWidthPx` 和 `toLineWidthPx` 会插值后直接写入实际 Canvas `lineWidth`，因此真实数值操作作用于最终描边。

target 的祖先若有 clip 或非 `source-over` 混合，预检会拒绝；本实现没有计算裁切后的可见轮廓。owner 必须位于无 clip、`source-over`、无动态变换的 screen overlay 图层；若运行时覆盖层变换不再中性，operation 记为 unsupported。隐藏或零透明目标不会被当作已绘制。

## DG / MO 动态矩形目标效果

场景局部效果另有显式 `geometryMode: "followTarget"`，省略时仍走原静态路径。DG 仅支持 `laohu-motion-dg-circumscribe`、`laohu-motion-dg-brace` 与 `laohu-motion-dg-indicate-frame-pulse` 跟随普通 world-space `rect`；MO 仅支持 `laohu-motion-mo-staggered-target-reveal` 跟随现有 `custom:laohu-motion-target` 矩形。`geometry` 仍须与目标在场景起点的矩形或边界相符，作为静态场景的初始锚点；运行时每帧位置由目标投影决定。`laohu-motion-dg-draw-partial` 保持静态。

render host 先校验完整 scene 并把同一 scene 与预检 records 注册给 effects adapter。每次 `MotionCore.drawFrame` 将它本帧已求值的第五参数传给回调；适配器用这个 state、同一目标与祖先图层、同一 camera 调用 `projectRectObject`，绘制时不再求值 scene。跟随 world 目标的 DG owner 需放在中性、无 clip、`source-over` 的根 screen overlay layer，使效果在 world 目标之后绘制。screen-space target、morph、text/image/path 边界、裁切层、非 `source-over` 目标祖先，以及投影后非轴对齐或无有限正面积的矩形均拒绝；brace 还要求投影后的左右边仍为竖直线。

MotionCore 消费对象 `target.visible` 和祖先 `layer.opacity`：目标可见性来自同帧投影对象，目标有效 opacity 包含目标 opacity 与全部祖先 layer.opacity。Core 不消费 `layer.visible`；目标或 owner 的祖先链只要显式带此字段，或有针对它的 event/binding，预检就拒绝整个场景。需要隐藏目标时用 `target.visible`，需要改变整层透明度时用 `layer.opacity`。

DG 在目标 `visible=false`、目标自身 opacity 为零、或任一目标祖先 layer.opacity 为零时分别记录 `target-visible-false`、`target-opacity-zero`、`target-layer-opacity-zero` 并跳过来源函数；未知的隐藏原因会报错，不伪装成 opacity 为零。目标透明度只在 owner 已有 Core alpha 上乘一次，来源 `DG.brace` 自己的进度透明度仍保留。owner 祖先的 layer.opacity 由 Core 对该层组做最终合成：透明度为零时 source 可能仍在离屏组中被调用，但输出像素与 Core 的透明层行为一致；它不会被适配器误当成 target.visible 或 target opacity。MO 只让原 `MO.lagged` 控制既有 local-target 的透明度进度；目标仍由其正常 Core 自定义 renderer 绘制一次，效果不复制目标，也不把 owner opacity 转嫁给目标。动态矩形的实际注册入口由 render host 与 catalog 提供；本段只声明上述已实现组合，不表示标签引线、路径或文字边界已有自动跟踪能力。

每帧只有在目标闭合描边的几何与 viewport 有正面积交集时才记为 `drawn`：同帧实际插值后的 `lineWidthPx / 2` 描边带必须触及 viewport 内部，或描边中心线进入/穿过 viewport。完全画外的边不会因为对象填充区域包围 viewport、四角包围框覆盖 viewport，或发出了 stroke 命令而算作出现；此时收据记 `not-drawn`，原因是 `target-outline-outside-viewport`，required window 会因此缺样本。部分裁切仍可通过，操作不要求整个矩形完整可见。这个几何下限能排除零可见边的假阳性，但它仍不是逐像素颜色、对比度或可读性判定。

## 计划声明与严格门禁

需要技术证据时，在任一对象 `data.motionEvidence.motionRequirements` 声明局部操作范围。每项只允许 `id`、`scope`、`startSec`、`endSec` 和非空 `expected`。每个 expected 项只允许 `entityId`、`instanceId`、`operationId`、`targetId` 与 `phaseId`，且须精确匹配已经预检过的本地 provider。未实现字段如 `requireWholeVisibility`、`handoff`、film-global clock map 或 subframe 策略会明确拒绝，不会静默被忽略。

时间窗按 scene-local 时间与半开区间 `[startSec,endSec)` 处理；runner 只核对时间戳落入窗口的编码帧。窗口必须含至少一帧，expected 必须非空、身份不得重复，所引 operation phase 必须覆盖整个窗口。同一实例不能由重叠要求重复认领。缺 hook、missing、unsupported、stale viewport/clock、重复帧或零覆盖均不能通过。

启用：

```sh
node .agents/skills/laohu-motion/scripts/render.mjs \
  --scene /绝对路径/scene.json \
  --output /绝对路径/output.mp4 \
  --cache-dir /绝对路径/.cache/tmp/motion-run \
  --require-motion-evidence
```

成功渲染后，独立 probe 重读 scene、manifest、逐帧 PNG 与最终 MP4：

```sh
node .agents/skills/laohu-motion/scripts/motion-probe.mjs \
  --scene /绝对路径/scene.json \
  --manifest /绝对路径/.cache/tmp/motion-run/manifest.json
```

probe 核对 viewport、fps、scene-local clock、frameIndex 与时间戳、半开窗覆盖、expected/observed/missing/unsupported、帧和实例不重复、采样四角与描边宽度、逐帧 PNG SHA-256、已提交 MP4 SHA-256。当前 renderer 只会把满足上述最小描边几何交集条件的调用记为 `drawn`；严格门禁会阻止 required window 存在 `not-drawn`、missing 或 unsupported 样本时提交 MP4。契约不由这些收据推断逐像素强调色或完整可见。

## 明确未支持的能力

此契约不覆盖全场景实体可见性、跨 renderer/segment handoff、完整可见保证、语义识别、film-global 时间映射、子帧积分、shutter/运动模糊、声音控制或空间音频。不能把局部 `motionRequirements` 写成这些能力已实现。第三批子帧与 Motion audio-plan `/2` 仍未实施；只有确认实际缺口并完成 producer、消费者、收据、负例及旧路径回归后，才能单独启用。

`audio.mjs` 继续消费 audio-plan `/1`。plan 顶层出现 `controlSource`、`processing` 或 `rooms` 时会明确拒绝；schemaVersion `/2` 也不受支持。此项只针对 plan 顶层控制对象，不影响资产 metadata 内同名字段。来源音频生成器现有的 `sourcePan` 是源生成阶段的参数，按该来源实现的原有行为保留，不属于未支持的 plan 后级连续声像；其来源身份与本地入口以 catalog/SOURCES 为准。

## catalog 入口

```sh
node .agents/skills/laohu-motion/scripts/templates.mjs list --type effect --intent dynamic-focus
node .agents/skills/laohu-motion/scripts/templates.mjs show laohu-motion-follow-box
node .agents/skills/laohu-motion/scripts/templates.mjs verify
```

catalog 的 `available` 表示该局部 renderer 已接通；本轮运行结果与边界以实施报告和 motion-probe 收据为准，不构成审美、语义或观众质量结论。
