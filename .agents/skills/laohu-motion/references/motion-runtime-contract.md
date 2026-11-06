# Motion 操作与绘制证据契约

本 Reference 只承接已接通的动态矩形目标强调及其逐帧证据。它不是 OneTake 原动作复刻、通用实体追踪器或全片连续性判定器。需要让局部高亮跟随实际目标时读取；普通 Core 事件、静态 Huashu effect 和 Shotcraft `/2` 保持各自既有入口。

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

`audio.mjs` 继续消费 audio-plan `/1`。plan 顶层出现 `controlSource`、`processing` 或 `rooms` 时会明确拒绝；schemaVersion `/2` 也不受支持。此项只针对 plan 顶层控制对象，不影响资产 metadata 内同名字段。Huashu 生成分支现有的 `sourcePan` 是源生成阶段的参数，按该分支原有行为保留，不属于未支持的 plan 后级连续声像。

## catalog 入口

```sh
node .agents/skills/laohu-motion/scripts/templates.mjs list --type effect --intent dynamic-focus
node .agents/skills/laohu-motion/scripts/templates.mjs show laohu-motion-follow-box
node .agents/skills/laohu-motion/scripts/templates.mjs verify
```

catalog 的 `available` 表示该局部 renderer 已接通；本轮运行结果与边界以实施报告和 motion-probe 收据为准，不构成审美、语义或观众质量结论。
