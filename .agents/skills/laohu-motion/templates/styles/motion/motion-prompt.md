# Motion Prompt：中文生产条目

> 本文件按资源 ID 定位。L2 正文依据固定来源提交中每项 `Motion spec`、`What happens` 与 `When to use it` 的中文转述；中文名称/需求示例另依据 `zh-Hans` 元数据。精确实现见 L3。

## 读取方式

- L0 导览使用 `nameZh`、`meaningZh`、`askExampleZh` 与分类信息。
- 进入 Brief 的具体条目先读下方该 ID 的正文；实际渲染读取对应 pack 模块与共用适配器，具体路径见该项正文。
- 原代码按包隔离，内部时间单位为秒；`draw(ctx,w,h,t)` 每次只依赖传入局部时间。默认按源周期循环。需要停留或退场时，明确提供 `hold` / `hold-exit` 的源时刻，不用墙钟或跨帧状态。
- 适配按源画幅等比 contain，不拉伸。部分示例含源背景、字体或示例内容；改用本片文字/配色前，先检查该条代码，只改明确可编辑项。
- 时间适配实现与来源许可说明见[共用适配器](../../runtime/motion-vocabulary/core.mjs)、[NOTICE](../../runtime/motion-vocabulary/NOTICE.md)及[MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。

## Photo 共同行为

第097–120项共用 photo pack 的 5 秒时间线：效果强度在 0.4–1.4 秒以 cubic ease-in-out（来源约为 cubic-bezier(0.65,0,0.35,1)）从无到全；保持至 4.0 秒，再按同一曲线衰减，并于 4.8 秒前完全退出，4.8–5.0 秒为空。每项仍按自己的正文改变光位、影调、景深或成像特征。该共享段随这些条目的 L2 全文一并返回。

## Artstyle 共同行为

第193–216项都以同一张“山坡上的房屋、树木和太阳”线稿作基底，由图像模型按目标媒介/画风重绘。该组使用同一转换时间线：0.5–1.35 秒以对角擦除从线稿转为目标风格；画面缓慢放大至 1.045 倍并持续到 4.0 秒；4.0–4.5 秒淡回线稿；完整一轮为 4.7 秒，缓动为三次 ease-in-out。条目正文只写该风格自身的材质、颜色和构成差异，不重复这一共同行为。部分条目在示例中调整裁切，逐项注明。

## Diagram 共同行为

第217–240项使用 diagram pack 的原尺寸画幅和 4.7 秒周期。具体图形建立顺序、起始时点、错开间隔、缓动及退场由每项正文分别保留；涉及固定随机种子、数据值或颜色角色时，按条目记明。L3 才包含精确绘制代码。

## motion-prompt:motion:001 · 弹性入场

**上游检索名：** `001` / `pop-in`（Pop-in）；包：`motion`（动态图形）。

**可见变化：** 应用图标先带弹性进入，稍后右上角通知徽标再弹出；每半个周期切换星形与爱心图标。

**逐项动作规格：**
- 每 2.35 秒开始一轮；4.7 秒周期中先珊瑚底星形、再蓝底爱心。
- 图标为 116 px 圆角方块、圆角半径 30；从 0.28 秒开始，以启动后局部时间 t 秒计算缩放弹簧 `1−e^(−6.5t)cos(15t)`，峰值约 1.26 倍；旋转同时按 `1−e^(−6t)cos(11t)` 从 −0.35 rad（约 −20°）回正。
- 黄色通知圆徽标半径 25，标有 1，位于图标右上偏移 (+52,−52)；0.62 秒开始，以 `1−e^(−7t)cos(17t)` 弹入。
- 1.86–2.12 秒退场：缩放乘上 `1−backIn(s=2.2)`，先轻微鼓起再缩至 0；62×8 px 椭圆地面阴影跟随图标缩放并限制在 0–1。

**适用用途：** 用于轻轻强调小型元素的进入，例如图标、按钮或徽标。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("01").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/001.txt`（SHA-256 `f77c7f1b04c64e596709f9e883bc69d651a7449bedc57119115aeef524a7acc6`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:002 · 交错动画

**上游检索名：** `002` / `stagger`（Stagger）；包：`motion`（动态图形）。

**可见变化：** 图表柱从左到右依次升起，每根柱稍晚于前一根。

**逐项动作规格：**
- 每 2.35 秒一轮，共 7 根柱，宽 44 px、间隔 20 px，高度依次为 52、84、68、112、92、136、158 px；蓝、珊瑚、黄、薄荷四色循环。
- 第 i 根从 0.15+0.12i 秒开始，用 0.5 秒以 backOut 弹性过冲升至基线上的目标高度。
- 每根柱上方 16 px 的白点（半径 6.5 px）再延迟 0.34 秒以弹簧出现。
- 退场时柱子从 1.78+0.045i 秒起用 0.26 秒三次 ease-in 收缩；白点先于柱子消失，从 1.70+0.045i 秒起用 0.2 秒淡出。

**适用用途：** 用于让列表行、图表柱或卡片依次出现，并把视线从左向右带过去。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("02").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/002.txt`（SHA-256 `02d9779ae293a335a8ac0eecba778dbd8ba32e47bfe182a56fa0c0d4f77a7989`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:003 · 放射爆发

**上游检索名：** `003` / `burst`（Burst）；包：`motion`（动态图形）。

**可见变化：** 点赞爱心填色的同一刻，圆环、短线和圆点向外爆开。

**逐项动作规格：**
- 每 2.35 秒触发一次；中心是一颗尺寸 46、描边宽 7 px 的爱心。
- 0.3–0.5 秒先把爱心从 1 缩至 0.7 倍作预备；0.5 秒触发时填成珊瑚色，并用弹簧回到原尺寸。
- 黄色圆环在 0.6 秒内以五次 ease-out 从半径 44 扩至 90 px，描边由 16 缩至 0。10 条黄/薄荷交替放射线向外散开，外端半径 64→130 px、线长 36→0 px，并在触发后 0.22–0.7 秒间收尽。
- 10 颗黄/蓝替代为珊瑚/蓝交替圆点，半径 8→4.8 px，沿横向×1.45、纵向×0.78 的椭圆从半径 58 移至 150 px；触发后 0.3–0.72 秒淡出。爱心填色于 1.92–2.2 秒淡去。

**适用用途：** 用于标记触发或达成的瞬间，例如点赞、成功或答对。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("03").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/003.txt`（SHA-256 `41cbe49fb9ef77e616115da06521306ce3e70dc8d399ff3205621424fbc11a16`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:004 · 线条描绘

**上游检索名：** `004` / `line-draw`（Line draw）；包：`motion`（动态图形）。

**可见变化：** 图表曲线像被画出来，稍后又从起笔端擦除。

**逐项动作规格：**
- 每 4.7 秒一轮；用修剪路径控制每条线段可见的起止比例。
- L 形坐标轴（宽 6 px）在 0.08–0.7 秒画出；薄荷色、宽 11 px 的平滑曲线依次穿过 7 个点，在 0.4–1.95 秒画出，两者都用三次 ease-in-out。绘制前沿跟随一枚黄点，半径 12 px、中心白点半径 5 px。
- 箭头在 1.9–2.2 秒以 backOut 打开，箭翼长 26、宽 20 px；2.2–2.8 秒在一个峰值外顺时针画出珊瑚色圆圈，半径 26、线宽 7 px。
- 3.5–4.0 秒先擦圆圈，3.65–4.45 秒擦曲线，3.85–4.55 秒擦坐标轴；各自都从起笔端收回。箭头在 4.3–4.45 秒淡出。

**适用用途：** 当笔画本身承担表达时使用，例如图表、路线、下划线或手绘圈注。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("04").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/004.txt`（SHA-256 `622189bf7949520235ef572e5cb3342b6e9b2dddad8fabe3061efb487e6ba814`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:005 · 遮罩显现

**上游检索名：** `005` / `mask-reveal`（Mask reveal）；包：`motion`（动态图形）。

**可见变化：** 标题文字从一条不可见边界后滑出，边界由一条线标示。

**逐项动作规格：**
- 每 2.35 秒一轮；珊瑚色分隔线宽 380、高 6 px，位于 y=124，0.1–0.5 秒从中心向两侧长出，2.05–2.3 秒收回。
- 上方白色粗体字高 98 px，只在分隔线以上的裁切区（y=8–119）显示；0.35–1.0 秒从最终位置下方 120 px 上移入位。下方黄色 32 px 文字只在 y=129–181 的区域显示，0.55–1.15 秒从上方 60 px 下移就位；两组都用五次 ease-out。
- 退场时上方文字 1.7–2.05 秒向上移 150 px，以 backIn（s=1.2）略先下探；下方文字 1.75–2.05 秒向下移 70 px，以三次 ease-in 离开。
- 文字透明度始终不变；它们只是移出裁切区域后被遮住。

**适用用途：** 用于需要干净、排版感强的标题和章节名。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("05").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/005.txt`（SHA-256 `fceacf047d96eada372ce7101acef630391cb5206643806a5b253a961ace203f`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:006 · 打字机效果

**上游检索名：** `006` / `typewriter`（Typewriter）；包：`motion`（动态图形）。

**可见变化：** 文字逐字进入输入框；随后发送按钮亮起并被按下。

**逐项动作规格：**
- 每 4.7 秒一轮；白色输入框 471×92 px、圆角半径 30。9 个字符从 0.3 秒开始每隔 0.24 秒出现，至 2.46 秒完成；新字符由 1.35 倍回落至 1 倍。
- 珊瑚色光标宽 5、高 44 px，停在末尾；输入期间常亮，之后以 0.94 秒周期闪烁、每周期亮 0.5 秒。
- 发送按钮半径 30 px，先灰色；2.58 秒起蓝色圆盘用弹簧显现。2.96–3.21 秒按钮最多压缩 20%；3.13–3.41 秒文字上移 70 px 并淡出。文字淡到一半（约 3.27 秒）时光标回到开头，3.51–3.81 秒蓝色按钮淡去。

**适用用途：** 用于呈现输入过程，例如写提示词、搜索词或聊天消息。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("06").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/006.txt`（SHA-256 `b0a3132f52ba536db8985e392fa7d87e54bf24d7cfeb01fdfead17a7b2890d6d`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:007 · 数字递增

**上游检索名：** `007` / `count-up`（Count-up）；包：`motion`（动态图形）。

**可见变化：** 数字快速递增，最后停在目标值上。

**逐项动作规格：**
- 每 4.7 秒一轮；0.1–0.4 秒淡入，4.0–4.4 秒淡出。
- 104 px 粗体数字在 0.45–2.9 秒从 0 增至 2,480，按四次缓出曲线递增（前快后慢）；显示千位分隔符。每个数字等宽并右对齐，避免跳动。
- 2.9 秒到值时文字由白转黄，并以 1+0.07e^(−7t)cos(15t) 轻弹。左侧薄荷圆形上升箭头半径 34 px，从 0.35 秒起弹入；计数时按 6 px×(1−p)^3×sin(30u) 上下抖动。
- 下方蓝到薄荷渐变条尺寸 330×12 px，填充比例等于当前值÷目标值。

**适用用途：** 用于强调增长或规模，例如收入、用户数或完成率。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("07").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/007.txt`（SHA-256 `ba7fa379a5cbc5ce980110896cbf871638e5cdbc292fa7c67514fff6ad4da670`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:008 · 动态排版

**上游检索名：** `008` / `kinetic-typography`（Kinetic typography）；包：`motion`（动态图形）。

**可见变化：** 四个词分别用拉伸、弹跳、旋转和砸落来表现词义。

**逐项动作规格：**
- 4 个词各占 1.175 秒，粗体字号 88 px；每段最后 0.2 秒向上移 46 px 并三次 ease-in 淡出。
- Stretch（蓝）：横向从 0.3 倍以弹簧拉至 1 倍，纵向按横向的倒数平方根补偿。Bounce（黄）：逐字延迟 0.1 秒，按 78 px×|sin(πt/0.4)|×e^(−2.6t) 跳起；每次触地纵向最多压扁 16%。
- Spin（薄荷）：逐字延迟 0.12 秒，在 0.62 秒内从 −360° 以 backOut 转正，0.25 秒内三次 ease-out 从 0 放大到 1。Slam（珊瑚，斜体，100 px）：0.02–0.2 秒由 3.4 倍用三次 ease-in 砸至原尺寸。
- 撞击后横向按 10 px×e^(−9t)sin(38t) 摇晃、纵向按 e^(−11t) 压扁 20%，并出现 8 条放射线，持续 0.4 秒。

**适用用途：** 用于让旁白或歌词里的关键词通过动作方式变得醒目。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("08").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/008.txt`（SHA-256 `47fe2fca79a4ccf57a1e3221cbe3c4f15446934b282a971b1a92bd14b1571a68`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:009 · 缓动

**上游检索名：** `009` / `easing`（Easing）；包：`motion`（动态图形）。

**可见变化：** 两个方块在同一时长移动同一距离：上方匀速，下方先慢、中段快、末尾再慢。

**逐项动作规格：**
- 每 4.7 秒往返一次；两个边长 62 px、圆角 16 的方块横向移动 316 px：0.2–1.75 秒出发，停 0.8 秒，2.55–4.1 秒返回。
- 上方为线性匀速，形状和颜色不变；下方用 cubic-bezier(.86,0,.14,1)，缓慢起步、中段加速、末尾减速。下方方块随速度横向最多拉至 1.5 倍、纵向压至 0.8 倍。
- 下方方块后方最多出现 3 条速度线（最长 150 px、线宽按 0.8–1.25 倍变化）和 4 个残影，每个落后 0.035 秒。
- 两条轨道各标 12 个等时间点：上方等距，下方因缓动而两端聚集。

**适用用途：** 用于任何位移、缩放或旋转，避免动作像机械匀速运动。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("09").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/009.txt`（SHA-256 `421e692d4234935742c1b305d04bddcea93230af5f6ced07dabf09d3c4c34a58`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:010 · 过冲回弹

**上游检索名：** `010` / `overshoot`（Overshoot）；包：`motion`（动态图形）。

**可见变化：** 仪表指针越过目标，来回摆动几下后停稳。

**逐项动作规格：**
- 每 4.7 秒一轮；半圆仪表半径 128、线宽 26 px，目标位于扫描角度的 0.7 处，即从左端起 126°。
- 0.25 秒起按 0.7×(1−e^(−4.6t)cos(10.5t)) 前进；约 0.3 秒后越过目标约 25%，随后振荡并停在目标。
- 填充弧为蓝到薄荷渐变，白色指针宽 9 px；目标位置用黄色刻度标出，目标外的弧段画成珊瑚色。
- 3.7 秒起按 0.7×e^(−7.5t)cos(8.5t) 回落至 0；结束前略微越过 0。

**适用用途：** 用于给元素到位时增加有弹性的动势。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("10").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/010.txt`（SHA-256 `5d18547fedf48620e8a3128cb098b9f178284cd215e0fb6c5568cd75bbd21d37`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:011 · 挤压与拉伸

**上游检索名：** `011` / `squash-and-stretch`（Squash & stretch）；包：`motion`（动态图形）。

**可见变化：** 圆形角色反复弹跳，落地时压扁、起跳时拉长。

**逐项动作规格：**
- 圆形角色半径 37 px；每 1.175 秒弹一次（4.7 秒内 4 次），抛物线高度 92 px；沿水平正弦轨迹左右漂移最多 150 px。
- 每次弹跳落地和离地的前后各占 10%：纵向比例按二次曲线在触地 0.52 倍与离地 1.28 倍间变化。空中按纵向 1+0.28s³ 拉伸，s 是距抛物线顶点的归一化时间偏移，速度越快越拉长。
- 横向比例始终取纵向比例的倒数以保持体积；变形以脚底为锚点。阴影随高度变小、变薄；每次落地左右弹出短黄线，约持续该次弹跳的 18%。

**适用用途：** 用于让角色或标志显得有重量、有柔软感。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("11").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/011.txt`（SHA-256 `f54ea8367c3489741ec996f96ee5a2384130d3bf02a100082eb95783a00e64f1`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:012 · 形状变形

**上游检索名：** `012` / `shape-morph`（Shape morph）；包：`motion`（动态图形）。

**可见变化：** 形状与颜色连续变化：圆形变方形，再变星形、爱心，最后回到圆形。

**逐项动作规格：**
- 4 种形状各占 1.175 秒，基础半径 64 px；方形圆角化后依次变为星形、爱心，再回圆形。
- 每段先停留，随后在本段结束前 0.62 秒至结束前 0.04 秒之间变形。每种轮廓由 240 个对应点组成，按点序线性插值；进度使用 backOut，略微过冲。
- 颜色按蓝→珊瑚→黄→薄荷顺序，以二次 ease-in-out 混合。变形期间按 1+0.07sin(π×进度) 轻微鼓起。
- 下方有 4 个指示点；当前形状对应的点更大并着色。

**适用用途：** 用于在不中断画面的情况下，把一个图标或标志变成另一个。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("12").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/012.txt`（SHA-256 `4e1928b938391b11281eba148cf2deac4738407806857faed9506b6eafdb4235`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:013 · 液态动效

**上游检索名：** `013` / `liquid-motion`（Liquid motion）；包：`motion`（动态图形）。

**可见变化：** 一团软胶向前拉长，分成水滴，再合回一团。

**逐项动作规格：**
- 领头圆点半径 44 px，在 0.35–1.45 秒沿三次贝塞尔曲线向右移动 300 px，并沿正弦弧线抬高 34 px；2.7–3.8 秒沿原路返回。
- 其余 7 个圆点沿同一路径依次跟随，每个延迟 0.065 秒，半径从 44 逐渐减到 15 px，垂直摆动 ±6 px。静止段中还有 3 个小圆（半径 15、13、11）在离领头点 34–64 px 范围内伸缩，每周期两次。
- 圆点先以白色绘制并模糊 9 px，再对 alpha 作阈值处理（112–144 范围保留软边），最后填色以融合成一体。渐变从薄荷、蓝到紫色 #7C5CFF；领头点带白色椭圆高光。

**适用用途：** 用于标志、背景或连接动作，营造柔软、有机的形态。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("13").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/013.txt`（SHA-256 `537c36008ea63dda682371edd76d27abfd1d7f922c6e97bac9c2d45fc1d5af50`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:014 · 运动拖尾

**上游检索名：** `014` / `motion-trail`（Motion trail）；包：`motion`（动态图形）。

**可见变化：** 小球沿 8 字轨迹移动，身后留下逐渐变淡的副本。

**逐项动作规格：**
- 珊瑚色球半径 25 px、白色中心半径 11 px；每 4.7 秒匀速走完一次 8 字轨迹：x=196sin(a)，y=62sin(2a)。
- 球后方排 15 个副本，每个沿轨迹落后 0.105 rad（约 0.079 秒）；半径从 22 降至 6 px，透明度按 0.9×(1−i/15)+0.05 递减。
- 副本从最新到最旧由珊瑚渐变为黄、再到蓝；先画最旧副本，最后画当前小球。

**适用用途：** 用于表现速度或轨迹，例如飞行物、光标或光点。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("14").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/014.txt`（SHA-256 `1d2f62d68e26cb9c4a569e86b1dd91e7a4b410896fc585247af0b9d81318e86c`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:015 · 粒子效果

**上游检索名：** `015` / `particles`（Particles）；包：`motion`（动态图形）。

**可见变化：** 粒子从发射点不断向上射出，向两侧散开后落下。

**逐项动作规格：**
- 共 84 个粒子，从画面底部中央、距底边 20 px 的位置发射。初速为水平 ±190 px/s、向上 250–400 px/s；重力 470 px/s²，形成抛物线。
- 粒子按 2.35 秒或约 1.57 秒周期循环，并带固定随机种子的初始偏移，因此每次结果一致。单个粒子寿命最多 1.5 秒，前 0.06 秒淡入、最后 30% 淡出，尺寸从 1.15 缩至 0.7 倍。
- 圆、方、三角形粒子尺寸 5–11 px，使用蓝、珊瑚、黄、薄荷色；旋转速度最高 ±4.5 rad/s。

**适用用途：** 用于增加庆祝或活跃感，可替代纸屑或火花。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("15").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/015.txt`（SHA-256 `df7b2ee8c677dd9e0b422068b455def38a0d6f151b1922d066926e0872d523cd`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:016 · 视差

**上游检索名：** `016` / `parallax`（Parallax）；包：`motion`（动态图形）。

**可见变化：** 风景横向摇移；近处图层移动较多、远处较少，形成纵深。

**逐项动作规格：**
- 镜头每 4.7 秒完成一次往返，按正弦轨迹左右最多移动 108 px。每层向相反方向偏移，倍率从后到前依次为：星星 0.05、月亮 0.1、远山 0.28、中景山脊 0.6、前景山丘和树 1.25、最近的暗色形体 2.1。
- 远景使用接近背景的深色，近景颜色更亮；最前层是沿画面底边的大块暗色剪影。
- 每层在画框左右两侧都至少多画 200 px，避免移动时露出边缘。

**适用用途：** 用于让平面插画或照片背景产生深度，适合风景、滚动场景。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("16").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/016.txt`（SHA-256 `961095bf26d8f1b7e03058fd46795ef1495c90ccdfd044e145f548a2d2c30348`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:017 · 遮罩转场

**上游检索名：** `017` / `mask-transition`（Mask transition）；包：`motion`（动态图形）。

**可见变化：** 圆形或星形窗口逐渐扩大，窗口内逐步显出下一场景。

**逐项动作规格：**
- 白天→夜晚→白天，每段 2.35 秒；场景切换各在半段的 0.45–1.6 秒内以三次 ease-in-out 完成。下一场景绘制在当前场景上方，并裁切在不断扩大的形状内，直至覆盖全画面。
- 白天转夜晚时，圆从太阳中心 (112,104) 扩大，半径 0→470；夜晚转白天时，五角星从月亮中心 (427,104) 扩大，外半径 0→1150，并旋转 1.2 rad（约 69°）。
- 扩大的形状边缘描白线，线宽 7 px。

**适用用途：** 用于从画面中的物体开始切换场景，例如太阳、标志或按钮。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("17").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/017.txt`（SHA-256 `55302b6f9548327a712661544af5605aac0d19c809c4cd8aaa06df9492498232`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:018 · 图形转场

**上游检索名：** `018` / `shape-transition`（Shape transition）；包：`motion`（动态图形）。

**可见变化：** 彩色条带横扫覆盖整个画面，离开后露出下一场景。

**逐项动作规格：**
- 白天与夜晚交替，每段 2.35 秒；4 条水平色带高 52 px，颜色为蓝、珊瑚、黄、薄荷，端部斜切 80 px。
- 覆盖阶段为 0.38–1.0 秒，各条带的前缘从画面一侧到另一侧移动，相互延迟该阶段的 14%；每条带以三次 ease-in-out 在阶段的 58% 时长内完成。
- 1.0 秒全画面盖住时，切换底下场景；1.12–1.75 秒各条带后缘以相同延迟和曲线离开，露出新场景。白天→夜晚从左向右，反向切换镜像处理。

**适用用途：** 用于用品牌色图形切换章节或主题。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("18").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/018.txt`（SHA-256 `8b6f7be53af91a1b893c66e015dee8cf7db8f06f98515b2ce572562b8017defb`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:019 · 液态转场

**上游检索名：** `019` / `liquid-transition`（Liquid transition）；包：`motion`（动态图形）。

**可见变化：** 像颜料的液体从顶部滴下并铺满画面，随后成为下一场景。

**逐项动作规格：**
- 白天与夜晚交替，每段 2.35 秒；两层液体都由上向下，以二次 ease-in-out 移动。第一层是纯色（白天转夜晚用蓝、反向用珊瑚），在 0.35–1.5 秒出现；第二层把下一场景裁切在液体形状内，于 0.7–1.8 秒出现。
- 液体前沿从 y=−110 移至画框底边以下 130 px；边缘由两组正弦波起伏，振幅 13 px 与 8 px，中段波动最强。
- 前沿下挂 7 个圆头水滴，宽 30–54 px；长度为 30–110 px×(0.25+0.9×波动强度)，中段最长。形状先以白色绘制、模糊 7 px、阈值处理 alpha，再填入纯色或下一场景以合并轮廓。

**适用用途：** 用于食物、美妆或创意类视频中柔和、有机的场景切换。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("19").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/019.txt`（SHA-256 `afaf43b592e6f3ac44e9736465764e950518369aec6e30a1fc32a2e2c8cdcd4b`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:020 · 穿越缩放

**上游检索名：** `020` / `zoom-through`（Zoom through）；包：`motion`（动态图形）。

**可见变化：** 镜头推进字母 O 的孔洞，再从孔洞中进入下一场景。

**逐项动作规格：**
- 场景 X（黄底 ZOOM）→场景 Y（蓝底 GO!）→场景 X，每段 2.35 秒。缩放围绕 O 形孔洞中心进行，孔洞半径 24.5 px；最大倍率约为让孔洞盖满画面所需倍率的 1.08 倍（约 14 倍）。
- 倍率按 maxScale^p 指数增长，视觉上保持近似匀速推进；进度 p 由 0.25–1.2 秒的 80% 三次 ease-in 加 1.2–1.65 秒的 20% 三次 ease-out 组成，先加速深入、末端减速。
- 孔洞内部的下一场景先以 1/maxScale 缩小放置；缩放结束时正好恢复到全尺寸，并切换为下一场景。

**适用用途：** 用于从标志或字母内部穿过，并带动势地进入下一场景。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("20").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/020.txt`（SHA-256 `b4a4103dcca71e59372bd278da713e3952c3932f4c5afb7b4a34b6842ab5d331`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:021 · 翻转

**上游检索名：** `021` / `flip`（Flip）；包：`motion`（动态图形）。

**可见变化：** 卡片绕竖轴翻面，正面与背面分别显示不同内容。

**逐项动作规格：**
- 卡片尺寸 300×156 px、圆角 22；蓝色正面为 Q，黄色背面为 A，正反各占 2.35 秒。
- 0.45–1.5 秒内用 backOut（s=1.5）旋转 180°，略微越过后再回落；卡片宽度按原宽度×|cos θ|收窄，经过 90°时切换正反面画面。
- 用窄竖条模拟透视：条片高度沿横向变化最多 ±20%×sin θ，远侧较短、近侧较高。翻转时按正弦曲线上浮 6 px、放大 8%；深色遮罩透明度为 0.34×|sin θ|，地面有椭圆阴影。

**适用用途：** 用于表达彼此成对的内容，例如问题与答案、之前与之后。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("21").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/021.txt`（SHA-256 `b4defee855fe5f9e76233f6bc70d67b2d875ad8fb635d918417f82bcb6c3b587`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:022 · 扫光

**上游检索名：** `022` / `light-sweep`（Light sweep）；包：`motion`（动态图形）。

**可见变化：** 一道斜向光带扫过徽章表面。

**逐项动作规格：**
- 每 2.35 秒扫过一次；蓝色渐变徽章尺寸 400×112 px、圆角 28，光线仅在徽章裁切范围内绘制。
- 主光带宽 116 px，白色渐变中心不透明度 0.72、边缘为 0；另有一条细 12 px 光带，离主带 78 px、不透明度 0.5。两条带旋转 0.42 rad（约 24°），于 0.45–1.5 秒从徽章左侧 130 px 外移动至右侧 130 px 外，以二次 ease-in-out 运动。
- 1.38–1.98 秒，右上角出现四角星闪光；大小按 30×sin(πq)×(1+0.2(1−q)) 变化，并旋转 0.9 rad。徽章本身不移动。

**适用用途：** 用于给标志、徽章或按钮添加精致的表面光泽。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("22").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/022.txt`（SHA-256 `b38cd5678c3c0ba3127243afcc348ca2b07de9caa75099c71cc39589e781641a`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:023 · 故障效果

**上游检索名：** `023` / `glitch`（Glitch）；包：`motion`（动态图形）。

**可见变化：** 文字切片横向错位、颜色分离并冒出短色条；画面亮度不闪烁。

**逐项动作规格：**
- 白色粗体字 104 px；每 4.7 秒发生两次故障：0.55–1.25 秒分 5 步，2.9–3.74 秒分 6 步；其余时间静止。每步持续 0.14 秒，使用固定扰动，不做平滑动画。
- 颜色分离时，珊瑚色副本向左偏 7–16 px、下移 2 px；青色 #22D3EE 副本同距右移、上移 2 px，白字置顶。
- 2–4 条水平切片（高 10–35 px，y=40–150）向左右错开 18–64 px；另在随机位置绘制 3 条珊瑚、青、黄短色条，宽 30–120 px、高 5–12 px。所有伪随机值使用固定种子。
- 全画面背景亮度保持不变，不做整屏闪白或闪黑。

**适用用途：** 用于标题或场景切换中的数字故障感、错误感或不安感点缀。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("23").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/023.txt`（SHA-256 `b423132faceb41986a7ae387b5d7baca8e53ca3f0d25dbf3691dcb342ebbb569`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion:024 · 冲击震动

**上游检索名：** `024` / `impact-shake`（Impact shake）；包：`motion`（动态图形）。

**可见变化：** 厚重标题板砸落并带动整个画面震动。

**逐项动作规格：**
- 每 2.35 秒落下一块板，依次为黄、珊瑚色；尺寸 250×100 px、圆角 18。0.3–0.62 秒从画外加速落地，使用三次 ease-in，落下时纵向拉长 1.12 倍。
- 0.62 秒触地后，整画面震动 1.1 秒：x 按 15e^(−5t)sin(2π·5t) px，y 按 11e^(−5t)cos(2π·6.5t) px，旋转按 0.02e^(−5t)sin(2π·5t+0.6) rad。
- 落地后 0.3 秒内标题板以底边为锚最多纵向压扁 22%，并等量横向变宽。背景 4 个方块延迟 0.03–0.06 秒，分别跳起最多 24 px、持续 0.5 秒；6 条白线和 6 团尘土从地面散开，0.55 秒内消退。
- 1.85–2.2 秒，板以 backIn（s=1.6）向上移 300 px 退场。

**适用用途：** 用于让重要标题或数字带着重量落定。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion.mjs)，调用 `createElement("24").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/024.txt`（SHA-256 `7b55764e910340c008cc15bd589883f42427ff5ddc0bbdda5353e554071ea109`），共享 kit `api/v1/kit/motion.js`（SHA-256 `7b3ee79d068fdb8ab735986fb0fe1cb44ab3a42500d9a619a56580fdbdfc2d75`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:025 · 水平摇镜头

**上游检索名：** `025` / `pan`（Pan）；包：`camera`（镜头运动与转场）。

**可见变化：** 相机固定在原地，只从左向右转动；因为是旋转，近景与远景横移幅度相同。

**逐项动作规格：**
- 相机高度固定为 1.5 m，只绕竖轴偏航：−0.32→+0.32 rad（−18°→+18°，总计约 37°）。0.5–3.4 秒用三次 ease-in-out 转完，随后停留至 4.2 秒，最后 0.5 秒交叉淡回起点。
- 人物静止站在前方约 8 m、身高约 1.8 m；画面中从右向左滑过。山、建筑、树和人物都按同一角度移动，没有视差；539×208 卡片使用等效焦距 330 px。
- 右上角读数以整数显示角度 −18°→+18°。

**适用用途：** 用于展示宽阔地点，或把注意力从场景一侧转到另一侧。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("01").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/025.txt`（SHA-256 `64386976fa827068b13c5883ee3d3ec478ade0789f636e638ca8cbeb938fad52`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:026 · 垂直摇镜头

**上游检索名：** `026` / `tilt`（Tilt）；包：`camera`（镜头运动与转场）。

**可见变化：** 相机原地仰起，从地面附近的人向上带到塔顶。

**逐项动作规格：**
- 相机高度固定 1.4 m，只改变俯仰角：−0.06→+0.36 rad（−3°→+21°，约 24°）。0.5–3.4 秒用三次 ease-in-out 转动，3.4–4.2 秒停留，最后 0.5 秒交叉淡回起点。
- 人物静止站在前方 7 m；其后 26 m 处有 9.5 m 高的塔，天线顶端 11.8 m。镜头抬起时画面中的物体整体下移：人物从底边离开，塔顶和天线进入画面。
- 右上角读数以整数显示角度 −3°→+21°。

**适用用途：** 用于交代建筑或人物的高度、规模。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("02").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/026.txt`（SHA-256 `8bd575b50d5d407600c8fd5082af531e962db616d4d89636be29725a87cc91ba`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:027 · 推镜头

**上游检索名：** `027` / `dolly-in`（Dolly in）；包：`camera`（镜头运动与转场）。

**可见变化：** 相机本身向主体靠近；近处物体快速变大并掠过，远山几乎不变。

**逐项动作规格：**
- 相机向前推进 0→5.8 m，高度 1.5 m；方向和焦距（330 px，即标示 24 mm）固定。0.5–3.4 秒用三次 ease-in-out 前进，3.4–4.2 秒停留，最后 0.5 秒交叉淡回起点。
- 人物静止在前方 8 m，镜头推进后距离变为 2.2 m，因此画面中约放大至 3.6 倍。
- 前景柱子（左 1.5 m、纵深 3.6 m）和石块（右 1.6 m、纵深 4.8 m）掠出画面；120 m 以外的山几乎保持原尺寸。右上角焦距读数始终是 24 mm，以区别于变焦。

**适用用途：** 用于靠近人物或细节，同时保留空间纵深。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("03").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/027.txt`（SHA-256 `ff7f95a40a8a048a81ce2e5f9562191cce80fd6bd76f01f23ef670fb87ef9b43`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:028 · 变焦推近

**上游检索名：** `028` / `zoom-in`（Zoom in）；包：`camera`（镜头运动与转场）。

**可见变化：** 相机不移动，只加长焦距，因此整幅画面按相同比例放大。

**逐项动作规格：**
- 相机位置、方向和高度 1.5 m 固定；焦距从 330 px（24 mm）变为 1200 px（87 mm），约放大 3.6 倍。0.5–3.4 秒以三次 ease-in-out 指数插值：f=330×(8/2.2)^p。
- 人物静止在前方 8 m；最终大小与 03 Dolly in 相近，约为原来的 3.6 倍。由于没有视差，前景柱子、石块、人物、建筑和山都同比例变大，遮挡关系不变。
- 3.4–4.2 秒停留，最后 0.5 秒交叉淡回起点；右上角读数显示焦距 24 mm→87 mm。

**适用用途：** 用于不移动相机而聚焦一点；它比推轨显得更平、更像观察记录。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("04").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/028.txt`（SHA-256 `447e7ae470e4aa5f15961a72db09b85379dc9828adfb27b2b201eec855edffcb`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:029 · 跟拍

**上游检索名：** `029` / `tracking-shot`（Tracking shot）；包：`camera`（镜头运动与转场）。

**可见变化：** 相机与步行者同速横移，使人物保持在画面中央，近处柱子则更快掠过。

**逐项动作规格：**
- 相机以恒定 1.7 m/s 向右移动，4.7 秒内 x 从 −4 m 到 +4 m；高度 1.3 m、朝向正前方，不做缓入缓出。
- 人物与相机保持相同横向速度，距相机 7.5 m，始终在画面中央；手脚按 sin(u×7)×0.42 rad 摆动。
- 视差依次表现：纵深 4 m、每隔 1.6 m 的柱子最快向左掠过，其后是树，再后是 48 m 外的建筑，远山几乎不动。右上角标注 → 1.7m/s。
- 每 4.7 秒跳回起点；柱子和地面网格在循环接缝处对齐，建筑和树会跳回。

**适用用途：** 用于跟随行走或奔跑的主体，同时展示其动作和移动感。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("05").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/029.txt`（SHA-256 `5e7d75d46cb219cd9f3a4edb3f547f9a9ab4f5debaba6f37a0b9dd02615cce53`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:030 · 环绕镜头

**上游检索名：** `030` / `orbit-arc-shot`（Orbit (Arc shot)）；包：`camera`（镜头运动与转场）。

**可见变化：** 相机绕主体沿圆弧移动，人物保持居中，后方树木与建筑横向掠过。

**逐项动作规格：**
- 相机绕人物作半径 6 m 的圆周运动，人物在前方 9 m；角度由 −0.95→+0.95 rad（−54°→+54°，总计约 109°）。镜头始终朝向圆心（偏航角为角度的相反数），高度 1.7 m，俯角固定 −0.07 rad（约向下 4°）。
- 0.5–3.6 秒用三次 ease-in-out 绕行，3.6–4.2 秒停留，最后 0.5 秒交叉淡回起点。人物不移动；脸上的白点随视角横移，地面用半径 1.3 m 的虚线圆标示轨道。
- 背景中有 12 棵等距分布在半径 10 m 圆周上的树，随着相机绕行从人物身后横穿；右上角读数显示 −54°→+54°。

**适用用途：** 用于展示人物或产品的立体感，或强调入场和关键时刻。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("06").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/030.txt`（SHA-256 `9032a6add091b0fb6f15b66ec954e44c6e1fd3bdebd9450bee04430b107f1198`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:031 · 升镜头

**上游检索名：** `031` / `crane-up`（Crane up）；包：`camera`（镜头运动与转场）。

**可见变化：** 相机升高，同时向下俯拍，最后从上方看向人物。

**逐项动作规格：**
- 相机从 1.4 m 升到 9 m，同时向前移动 0→1.5 m；为持续框住前方 8 m 处的人物，俯仰角按 −0.86×atan2(height−1.0,8−forward) 变化，约从 −2.5°到 −44°。
- 0.5–3.4 秒以三次 ease-in-out 移动，3.4–4.2 秒停留，最后 0.5 秒交叉淡回起点。人物不动，但随相机升高在画面中变小；地面网格占据更多画幅，地平线从上边离开。
- 右上角读数显示高度 ↑1.4m→↑9.0m。

**适用用途：** 用于在场景结束时拉离人物，或交代地点的广阔规模。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("07").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/031.txt`（SHA-256 `db23903460394bb8c64a83292bf7e5d904013cde0c7a31addeaad1e4818a4c92`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:032 · 滑动变焦

**上游检索名：** `032` / `dolly-zoom-vertigo`（Dolly zoom (Vertigo)）；包：`camera`（镜头运动与转场）。

**可见变化：** 相机后退时同步变焦，使人物大小不变、背景却向人物身后挤近。

**逐项动作规格：**
- 相机到前方 8 m 人物的距离由 3.2 m 增至 8 m，即后退 4.8 m；高度 1.3 m。焦距按 f=330×d/8 px，由 132 px 增至 330 px（显示为 10 mm→24 mm），使距离÷焦距保持常数。
- 0.5–3.4 秒用三次 ease-in-out 完成移动。人物不动且画面高度不变；头顶和脚下各有 160 px 宽的蓝色虚线作为尺寸参照。
- 48 m 外的建筑约放大 2.2 倍、远山约放大 2.4 倍，向人物身后挤近；人物前方地面则缩小。3.4–4.2 秒停留，最后 0.5 秒交叉淡回起点。

**适用用途：** 用于表现突然意识到什么、不安或震惊。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("08").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/032.txt`（SHA-256 `949dc17a34e0c9c2b060f285773f9054e78cc906f10394c3692caa13551a2aee`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:033 · 焦点转移

**上游检索名：** `033` / `rack-focus`（Rack focus）；包：`camera`（镜头运动与转场）。

**可见变化：** 相机不动，焦点从前景花朵移到后方人物，清晰与模糊关系随之互换。

**逐项动作规格：**
- 相机位置、方向、焦距和高度 1.1 m 全部固定，只改变模糊量。前景花（左 0.75 m、距离 2 m）由清晰 0 px 变为模糊 7 px；人物与背景（人物右 0.9 m、距离 9 m）由模糊 6 px 变清晰 0 px；地面网格模糊量为背景的 0.6 倍。
- 1.0–2.6 秒用三次 ease-in-out 完成转换。蓝色对焦角标沿直线从花移动到人物，半宽由 46 缩到 30 px；花和人物本身不移动。
- 2.6–4.2 秒停留，最后 0.5 秒交叉淡回起点；右上角距离读数显示 ◎2m→◎9m。

**适用用途：** 用于不切镜头而把注意力从前景转到背景，或反向转移。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("09").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/033.txt`（SHA-256 `89d80a0a7440b861c2417461424143925f5275055db27d8551d8b3e38db15923`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:034 · 手持镜头

**上游检索名：** `034` / `handheld`（Handheld）；包：`camera`（镜头运动与转场）。

**可见变化：** 整幅画面带轻微、不规则的抖动，模拟手持而非三脚架拍摄。

**逐项动作规格：**
- 相机位置近似固定，偏航、俯仰、横滚和高度分别由周期不同的正弦波相加。令 T=2πu/4.7：偏航为 0.016sin(3T)+0.008sin(7T+1)+0.004sin(13T+2)，最大约 ±1.6°；俯仰为 0.012sin(4T+2)+0.006sin(9T+0.5)+0.003sin(17T+1.2)，最大约 ±1.2°。
- 横滚为 0.02sin(5T+1)+0.008sin(11T+3)，最大约 ±1.6°；高度为 1.5+0.03sin(6T) m。人物静止在前方 6.5 m；全程连续抖动，不缓入也不停留。
- 所有频率倍率为整数，因此每 4.7 秒无缝循环；右上角标注 HANDHELD。

**适用用途：** 用于营造纪实感或身处现场的感觉。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("10").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/034.txt`（SHA-256 `5e0ad80aa21cb6f2dd86a37664a74ff808a367d94f7f92ef5c6ff6bbf756e7e6`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:035 · FPV 穿越机镜头

**上游检索名：** `035` / `fpv-drone-shot`（FPV drone shot）；包：`camera`（镜头运动与转场）。

**可见变化：** 第一人称视角低空高速穿过两排树木，并左右倾斜摆动。

**逐项动作规格：**
- 相机以恒定 14 m/s（标示 50 km/h）向前飞行，不做缓入缓出；俯仰固定 −0.05 rad。令 T=2πu/4.7，4.7 秒内左右摆两次：横向为 0.6sin(2T−0.4) m，高度为 1.4+0.5sin(2T) m。
- 机身横滚为 0.22sin(2T+0.6) rad（约 ±12.6°），偏航为 0.05sin(2T) rad（约 ±2.9°）。没有人物主体。两排 4.2 m 高的树分别在左右 3.6 m 处，每 8 m 一棵、两排错开 4 m，持续向镜头迎面掠来。
- 半透明灰色径向速度线共 10 条，约 32–76 px 长、越靠侧面越长，向外流动并循环。没有停留或交叉淡化；4.7 秒重启时树列会改变相位。

**适用用途：** 用于持续飞越地点时营造速度和沉浸感。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("11").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/035.txt`（SHA-256 `299f14564637ddee4752cedcc41e4c0f3ba1bac909156ca6df42c67bc037da1c`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:036 · 荷兰角

**上游检索名：** `036` / `dutch-angle`（Dutch angle）；包：`camera`（镜头运动与转场）。

**可见变化：** 水平相机绕镜头轴旋转，停在倾斜地平线构图上。

**逐项动作规格：**
- 相机位置固定，高度 1.5 m，只改变横滚角：0→0.36 rad（约 21°），整幅图绕画框中心旋转。0.6–2.2 秒用三次 ease-in-out 完成。
- 人物静止在前方 7 m；地平线、建筑和人物都按同一角度倾斜。2.2–4.2 秒保持倾斜，让观众读清构图；最后 0.5 秒交叉淡回水平起点。
- 右上角读数显示 ∠0°→∠21°。

**适用用途：** 用于传达不安、紧张或事情出了差错的感觉。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("12").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/036.txt`（SHA-256 `570edcb3e7de72966b56350514f15b769e2759fd819cee88df279003adac96c6`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:037 · 慢动作

**上游检索名：** `037` / `slow-motion`（Slow motion）；包：`camera`（镜头运动与转场）。

**可见变化：** 固定镜头前，人物慢动作跃起再落下，树叶也缓缓飘落，整段动作被拉长。

**逐项动作规格：**
- 相机完全固定，高度 1.3 m，只有主体运动。距镜头 7 m 的人物用 3.8 秒完成一次跳跃（0.5–4.3 秒），高度按 4q(1−q)×1.1 m 的抛物线变化，q 随时间线性递增，顶点 1.1 m。
- 人物腾空时双臂抬起；起跳前静止 0.5 秒，落地后静止 0.4 秒。
- 9 片树叶在 4.7 秒内从 3.4 m 高处旋转落地，彼此按周期的 1/9 错开。右上角标示 120fps ×0.25，即播放时间拉长 4 倍。
- 无停留或交叉淡化，每 4.7 秒无缝循环。

**适用用途：** 用于让观众看清短促动作或表情，或强调情绪高点。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("13").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/037.txt`（SHA-256 `3fd0ef78f2c9bb50c97d05a54e68487b609d7cc0974b136c56bb88359622e465`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:038 · 速度渐变

**上游检索名：** `038` / `speed-ramp`（Speed ramp）；包：`camera`（镜头运动与转场）。

**可见变化：** 同一镜头内播放速度从快平滑变慢，左下角曲线同步显示速度。

**逐项动作规格：**
- 相机固定，高度 1.3 m；只改变播放速度。速度从 2.4×变至 0.25×，1.2–1.9 秒用 0.7 秒二次 ease-in-out 完成。
- 距镜头 8 m 的人物从左侧 6 m 处向右跑，x=−6+素材时间×2.0 m；快速段中人物很快接近镜头。x 在 −1.5 至 2.5 m 时人物起跳，轨迹顶点 0.99 m、双臂抬起；约 0.94 秒起跳，大部分腾空时间处于慢动作，约 3.68 秒落地。
- 左下角显示 120×40 px 速度曲线，蓝点半径 5 px 标出当前时刻。右上角速度读数由 ×2.4 变为 ×0.3；4.2 秒停止，最后 0.5 秒交叉淡回起点。

**适用用途：** 用于让动作前段保持快速，只把关键部分放慢。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("14").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/038.txt`（SHA-256 `edb1f74a23d56e1160810a7c5202c157d96720c9503c7caeb967b7d4b28abe9d`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:039 · 延时摄影

**上游检索名：** `039` / `time-lapse`（Time-lapse）；包：`camera`（镜头运动与转场）。

**可见变化：** 固定镜头把 06:00 到 18:00 压缩成几秒，太阳、云、人和阴影快速移动。

**逐项动作规格：**
- 相机完全固定，高度 1.6 m，俯仰 +0.08 rad（约抬头 5°）。0.4–4.1 秒表现 12 小时，按三次 ease-in-out 压缩。
- 太阳在 170 m 深处沿弧线从左向右移动，角度 a 从 −1.25 到 +1.25 rad，位置为 (120sin a, 60cos a−8) m。3 片云总共向右漂 140 m、每 80 m 循环回绕。
- 7 个小人每人穿过 18 m 宽的场地 6 次，奇数人与偶数人方向相反。建筑阴影始终背离太阳，并随太阳位置转动，呈半透明灰色。
- 最后 0.5 秒交叉淡回起点；右上角时钟从 06:00 按 10 分钟步进到 18:00。

**适用用途：** 用于短片中展示长时间变化，例如城市、天空或任务过程。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("15").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/039.txt`（SHA-256 `5ba647bb463d2c1e82692347fbdbbe7d56e9509b94b85d9492ccf889caec30e2`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:040 · 定格

**上游检索名：** `040` / `freeze-frame`（Freeze frame）；包：`camera`（镜头运动与转场）。

**可见变化：** 人物跳到最高点时画面定格，1.4 秒后从同一帧继续播放。

**逐项动作规格：**
- 相机固定，高度 1.3 m；冻结的是素材时间。素材从 0 播到 1.6 秒后停住，至 3.0 秒恢复（定格 1.4 秒），恢复后素材时间按 u−1.4 继续。
- 距镜头 7 m 人物的跳跃素材时间为 0.6–2.6 秒、顶点 1.1 m；冻结点正好处于顶点（动作完成 50%）。9 片飘落树叶也一起停止；其下落速度是 13 Slow motion 的 1.5 倍。
- 冻结时出现 5 px 蓝色边框和底部中央暂停标记：68×40 px 白色圆角框内两条蓝线，0.12 秒淡入淡出。右上角只在冻结时显示 FREEZE；不交叉淡化重置。

**适用用途：** 用于强调决定性瞬间，或暂停画面以便放置人名、说明文字。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("16").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/040.txt`（SHA-256 `83e604bf9626d1d697c971a4b437d5479a5ab4bd6445b3bd66f59c8fa4b4504f`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:041 · 跳切

**上游检索名：** `041` / `jump-cut`（Jump cut）；包：`camera`（镜头运动与转场）。

**可见变化：** 机位与构图不变，只让人物位置和时钟跳变，在同一场景中跳过时间。

**逐项动作规格：**
- 以无效果直切拼接，共 5 个各 0.94 秒的镜头（总长 4.7 秒）；相机高度 1.4 m、正面朝向，各镜头位置和构图完全一致，背景不移动任何像素。
- 人物距镜头 7 m，在各镜头中横向跳到 −2.2、1.4、−0.4、2.4、0.6 m；第 2、4 镜头双臂抬起。每个镜头内人物静止，跳跃仅由位置与姿态差体现。
- 右上角时钟依次显示 10:02、10:17、10:41、11:06、11:30，表明地点没变而时间已跳过；第 5 镜头直接切回第 1 镜头。

**适用用途：** 用于剪掉谈话或工作中的停顿、加快节奏，或快速表现时间流逝。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("17").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/041.txt`（SHA-256 `d28688ab77e60a4e5f9bd96ad6eaa3d2ec67f1dae45c255f42d430ab19163565`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:042 · 匹配剪辑

**上游检索名：** `042` / `match-cut`（Match cut）；包：`camera`（镜头运动与转场）。

**可见变化：** 被抛出的球在下一镜头中变成同一位置、同一大小的太阳，以形状匹配衔接两个场景。

**逐项动作规格：**
- 在 2.3 秒处无效果直切；切点前后蓝色圆形位置相同（画面中心右 120 px、上 46 px），半径均为 17 px。
- 出镜头 0–2.3 秒：相机固定，高度 1.4 m；人物在左 1.2 m、深 7 m 处，从 0.5 秒起把球抛出，使用三次缓出。球从人物头顶上方 2.3 m 高处飞向匹配位置，半径 5→17 px，弧线最高上拱 30 px。
- 入镜头 2.3–4.7 秒：换到无建筑的新地点，相机高 1.2 m；同位置蓝圆成为太阳，并在 2.4 秒中下沉 14 px。蓝色虚线圆标记半径 26 px，在切点前后各 0.7 秒内淡入淡出。
- 右上角显示 SHOT 1→SHOT 2；4.7 秒直切回 SHOT 1。

**适用用途：** 用于通过共有形状或动作连接时间、地点相隔很远的两个场景。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("18").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/042.txt`（SHA-256 `2dac88dc9c15326bdba82e8ef5aefd4289bd54f09c864e40a32fb3b3ea67cbdb`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:043 · 甩镜头转场

**上游检索名：** `043` / `whip-pan`（Whip pan）；包：`camera`（镜头运动与转场）。

**可见变化：** 相机极快地横甩，下一场景在拖影最强时换入。

**逐项动作规格：**
- 甩镜衔接总长 0.8 秒（1.7–2.5 秒）：前 0.4 秒甩出镜头，后 0.4 秒甩入并稳定新镜头。前半段偏航 0→+0.45 rad（约 26°），后半段 −0.45→0 rad，两段都用二次 ease-in-out。
- 在 50% 位置直接替换场景，此时拖影最强以遮住切点；将 30 fps 下相差 ±1.6 帧的 9 次渲染平均以形成模糊。
- 相机高 1.4 m，除甩动外固定；A 中人物、B 中汽车与城市均不动。每 4.7 秒在 A→B 与 B→A 间交替，完整往返 9.4 秒；右上角显示方向。

**适用用途：** 用于保持能量感地转换地点或话题。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("19").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/043.txt`（SHA-256 `2ad34038bd3afee802198bbff2c7f8df875fb71ba89ab7b2151d5bfd5a709e16`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:044 · 交叉溶解

**上游检索名：** `044` / `cross-dissolve`（Cross dissolve）；包：`camera`（镜头运动与转场）。

**可见变化：** 把下一张画面叠到当前画面上，并逐渐提高不透明度；中间时刻两幅都可见。

**逐项动作规格：**
- 衔接从 1.5 到 3.0 秒，持续 1.5 秒；入镜画面不透明度由 0 增至 100%，采用二次 ease-in-out，2.25 秒时达到 50%。
- 出镜画面始终以完全不透明状态留在下层，不先淡出；相机在两幅画面中都固定（A 高 1.4 m；B 高 1.6 m、俯仰 +0.1 rad），主体也不移动。
- 0–1.5 秒只显示出镜画面；3.0–4.7 秒只显示入镜画面。每 4.7 秒在 A→B 与 B→A 间交替，完整往返 9.4 秒；右上角显示切换方向。

**适用用途：** 用于表现温和的时间流逝、地点变化，或转入回忆。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("20").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/044.txt`（SHA-256 `d1b9a411dea5a1660578adc4f683a1dfbefae73f7b51eaa28fa2c1eaa76ca79a`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:045 · 划像转场

**上游检索名：** `045` / `wipe`（Wipe）；包：`camera`（镜头运动与转场）。

**可见变化：** 一条竖直边界从左向右移动，边界后方由下一幅画面替换。

**逐项动作规格：**
- 衔接持续 1.1 秒（1.7–2.8 秒）；边界从画面左外侧 x=−4 px 移至右外侧 x=543 px，使用三次 ease-in-out。
- 边界左侧显示入镜画面，右侧显示出镜画面；两幅都不移动，靠裁切显露而非把画面推开。移动期间出现 4 px 蓝色竖线作为边界。
- 两侧相机均固定，主体不动。每 4.7 秒在 A→B 与 B→A 间交替，完整往返 9.4 秒；右上角显示切换方向。

**适用用途：** 用于清楚标记场景或话题变化，或切换对照的两方。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("21").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/045.txt`（SHA-256 `894cf1034effebf05a2a833784863bd65fea74b7beb34c8e47bf779ecb41f350`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:046 · 突切

**上游检索名：** `046` / `smash-cut`（Smash cut）；包：`camera`（镜头运动与转场）。

**可见变化：** 安静的熟睡场景毫无预警地直切到强烈场面，音量表也同时跃升。

**逐项动作规格：**
- 2.4 秒处无效果直切。出镜头 0–2.4 秒：相机高 1.2 m、焦距 330 px，人物躺在 7 m 外，3 个 z 字母上浮并淡出；音量表约为 8 格中的 0–1 格（0.08±0.04）。
- 入镜头 2.4–4.2 秒：焦距增至 2.6 倍（858 px）作紧构图，横滚 −0.12 rad（约 −7°）；人物双臂抬起，周围有 18 条蓝色放射线。画面以约 6 次/秒、±0.03 rad 横滚，约 8 次/秒、±0.006 rad 偏航。音量表为 0.85±0.15，接近满格。
- 最后 0.5 秒用二次 ease-in-out 交叉淡回安静镜头；右上角读数从 ♪静か（安静）跳到 ♪大音量。

**适用用途：** 用于喜剧或惊吓，瞬间呈现平静与混乱、预期与现实之间的落差。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("22").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/046.txt`（SHA-256 `5f4b2ce8822d203c410a5bf4b14181127ae5972cd7c597da71fb2e848524c662`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:047 · J 型剪辑

**上游检索名：** `047` / `j-cut`（J-cut）；包：`camera`（镜头运动与转场）。

**可见变化：** 下一场景的声音先于画面进入；画面上方展示视频，下方展示视频与音频时间线。

**逐项动作规格：**
- 画面是直切，只有声音提前切到下一场景 B；音画错位为时间线的 20%（0.72 秒）。播放头在 0.4–4.0 秒内匀速走过 3.6 秒；音频在 35%（约 1.66 秒）切换，画面在 55%（约 2.38 秒）切换。
- 35–55% 区间仍显示 A 画面、但声音已是 B；用浅蓝色块和两条蓝色虚线标出。上方 134 px 为固定机位、主体不动的画面；下方 74 px 放视频与音频两条时间线，A 灰、B 浅蓝，音轨带波形。
- 画面左下标注 映像A / 映像B；右下角显示当前声音 ♪Aの音（灰）→♪Bの音（蓝）。最后 0.5 秒交叉淡回起点。

**适用用途：** 用于提前引入下一场景，或让场景、说话者的转换更自然。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("23").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/047.txt`（SHA-256 `a60d6a287f13d2112650e2ca0ffd29d851e09163a1b012b8eaa178a6da7dc90d`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera:048 · L 型剪辑

**上游检索名：** `048` / `l-cut`（L-cut）；包：`camera`（镜头运动与转场）。

**可见变化：** 画面已切到下一场景，上一场景的声音仍延续一会儿；画面上方展示视频，下方展示音画时间线。

**逐项动作规格：**
- 画面直切，只有声音在画面切换之后才转到场景 B；音画错位为时间线的 20%（0.72 秒）。播放头在 0.4–4.0 秒内匀速走过 3.6 秒；画面在 55%（约 2.38 秒）切到 B，音频在 75%（约 3.10 秒）才切换。
- 55–75% 区间画面已是 B、声音仍是 A；用浅蓝色块和两条蓝色虚线标出。上方 134 px 为固定机位、主体不动的画面；下方 74 px 放视频与音频两条时间线，A 灰、B 浅蓝，音轨带波形。
- 画面左下标注 映像A / 映像B；右下角显示当前声音 ♪Aの音（灰）→♪Bの音（蓝）。最后 0.5 秒交叉淡回起点。

**适用用途：** 用于让说话者声音继续，同时展示听者反应或相关画面。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera.mjs)，调用 `createElement("24").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/048.txt`（SHA-256 `9ee27aacf9f75ee084942c5fae6ca4a957be763ef41c08e44b846a544cb594a9`），共享 kit `api/v1/kit/camera.js`（SHA-256 `54b7f7caac596d74e16cb4855f6d244e01fc54a29d1b23ddb05f4f68a13fcb79`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:049 · 模态对话框

**上游检索名：** `049` / `modal-dialog`（Modal dialog）；包：`ui`（UI 组件）。

**可见变化：** 点击打开后整页变暗，小窗口轻微放大到画面中央；点击关闭符号后收起。

**逐项动作规格：**
- 542×191 卡片上 4.5 秒一轮；光标在 0.95 秒移至左下角 120×36 px 的 Open 按钮，1.0 秒点击。
- 打开量 a 在 1.0–1.32 秒用三次 ease-out 从 0 增至 1；整卡覆盖 rgba(18,20,28) 暗幕，不透明度为 0.42a。
- 窗口白底、280×140 px、圆角 12，居中于 (271,97)，阴影模糊 24 px、向下偏移 8 px、不透明度 0.25；缩放为 0.9+0.1a，同时不透明度为 a。内部有粗体标题栏、两行文字、右下角蓝色 88×30 按钮和右上角 ×。
- 光标在 3.0 秒前移到 ×，3.3 秒点击；a 在 3.3–3.58 秒按三次 ease-in-out 乘以从 1 到 0 的系数。

**适用用途：** 用于必须暂停当前任务处理单件事项时，例如确认操作或填写短表单。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("01").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/049.txt`（SHA-256 `f5ee0572497bbd4ccde8092880f983488c91fc3faa53d2c810b96289fa358428`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:050 · 抽屉面板

**上游检索名：** `050` / `drawer`（Drawer (Off-canvas)）；包：`ui`（UI 组件）。

**可见变化：** 点击菜单后高面板从左侧滑入；点击面板外部后滑回。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；光标在 1.0 秒点击左上角 110×34 px 的 Menu 按钮。打开量 a 于 1.0–1.38 秒三次 ease-out 从 0 到 1；整卡暗幕 rgba(18,20,28)，不透明度 0.36a。
- 白色面板宽 210 px、高度铺满卡片，x=−210+210a，从左边滑入；阴影模糊 22 px、不透明度 0.25。内部顶部有半径 14 px 头像与姓名，下面是间隔 32 px 的 4 行菜单，首行用浅蓝底选中。
- 3.3 秒光标点击面板外 (420,120)；a 在 3.3–3.65 秒乘以三次 ease-in-out 的 1→0 系数，面板随之滑回。

**适用用途：** 用于把导航或筛选项先收在屏幕外，尤其适合移动端。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("02").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/050.txt`（SHA-256 `36934891c51c3135f2bcc8d6725fbb02cd570747274f4881d833d734f3d7e9f5`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:051 · 底部面板

**上游检索名：** `051` / `bottom-sheet`（Bottom sheet）；包：`ui`（UI 组件）。

**可见变化：** 手指点击查看详情后，底部面板升起；向下拖动手柄即可关闭。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；半透明手指圆半径 17 px、白色描边，在 1.0 秒点击底部中央 170×36 px 的 View details 胶囊按钮。
- 打开量在 1.05–1.45 秒用三次 ease-out 从 0 到 1；全卡暗幕 rgba(18,20,28)，不透明度 0.36a。白色面板高 136 px、上角圆角 18，顶边 y=191−136a；阴影模糊 22 px、向上偏移 4 px。顶部中央有 52×6 px 抓手。
- 面板内有粗体标题栏及两行 26×26 px 图标。2.75 秒手指落在抓手 (271,68)，3.0–3.6 秒向下拖；a 按三次 ease-in-out 的 1→0 系数变化，面板跟着手指滑出底边。

**适用用途：** 用于移动端展示详情或选项，同时让当前页面保持可见。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("03").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/051.txt`（SHA-256 `2776f5b0204ad206dec7640212b8fbe157c152609f0aa04330728ad66a53180f`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:052 · 折叠面板

**上游检索名：** `052` / `accordion`（Accordion）；包：`ui`（UI 组件）。

**可见变化：** 点击三条标题中的第一条会展开内容并把下方行推开；再次点击后收起。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；3 个标题行宽 494、高 34 px、圆角 8、间隔 6，右侧有向下箭头。光标在 0.95 秒移至首行，并于 1.0、3.3 秒各点击一次。
- 展开量 ex 于 1.0–1.35 秒用三次 ease-in-out 从 0 到 1，再于 3.3–3.62 秒回到 0。首行高度从 34 增至 92 px（增加 58ex），把下方行推下；两行内容裁切在本行范围内，按 ex 淡入。
- 展开时箭头旋转 180°×ex，描边转浅蓝，标题转蓝色。

**适用用途：** 用于常见问题或较长说明，让用户先浏览标题，只展开需要的内容。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("04").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/052.txt`（SHA-256 `e74325653342c86d66391b74ee1ebc9b51f17c2d10f7b02713bd2f9b06428ae8`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:053 · 下拉选择框

**上游检索名：** `053` / `dropdown-menu`（Dropdown (select)）；包：`ui`（UI 组件）。

**可见变化：** 点击输入框后下方出现四个选项；选中名古屋后列表收起并填入字段。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；字段 260×38 px、圆角 8，显示占位提示与箭头；光标在 1.0 秒点击字段。打开量于 1.0–1.25 秒三次 ease-out 从 0 到 1，白色 260×112 px 列表带 18 px 模糊阴影，淡入时下落 6 px；箭头转 180°，字段边框变为 2 px 蓝色。
- 4 个选项垂直间隔 26 px：东京、大阪、名古屋、福冈。光标向下移动时，大阪从 1.55 秒、名古屋从 1.95 秒起显示浅蓝高亮。
- 2.3 秒点击名古屋；列表在 2.3–2.45 秒按三次 ease-in-out 系数从 1 降至 0 收起。占位提示在 2.2–2.3 秒淡出，名古屋文字在 2.32–2.42 秒淡入。重置时名古屋于 3.9–4.08 秒淡出，4.1–4.3 秒占位提示回来，两段不重叠。

**适用用途：** 用于表单中从固定列表选择一个值。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("05").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/053.txt`（SHA-256 `3e3012a711a2b08cb1f2031f135e27c74bbf10083f344bc81a30a42ff45ec5f1`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:054 · 文字提示

**上游检索名：** `054` / `tooltip`（Tooltip）；包：`ui`（UI 组件）。

**可见变化：** 鼠标悬停在问号图标上时，其上方出现深色提示泡；光标离开后消失。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；问号图标为蓝色圆环、半径 13 px，位于 (196,121) 标签旁。光标只悬停不点击：1.05 秒到达，停留至 3.15 秒，4.1 秒前离开卡片。
- 提示显示量 a 在 1.15–1.35 秒三次 ease-out 从 0 到 1，透明度随 a 增加，并向上升 6 px 就位。
- 气泡深灰 #26282c，184×36 px、圆角 8，顶边 y=64；向下的小三角宽 16、高 8 px，指向图标；文字白色 15 px。3.25–3.45 秒线性淡出。

**适用用途：** 用于给图标或缩写补充一句提示，又不占据页面空间。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("06").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/054.txt`（SHA-256 `8ac64de1bde28ffb0798f8af609d670b26c7cae897856692a43bddfc0b1f512f`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:055 · 气泡卡片

**上游检索名：** `055` / `popover`（Popover）；包：`ui`（UI 组件）。

**可见变化：** 点击详情后，按钮右侧打开一块带尖角指向按钮的白色小面板；点击面板内确认后关闭。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；蓝色描边 Details 按钮 108×36 px，位置 (24,112)，光标在 1.0 秒点击。显示量 a 于 1.0–1.28 秒三次 ease-out 从 0 到 1，面板随之从右侧滑入 6 px 并淡入。
- 面板白底、300×120 px、圆角 10，位置 (156,62)，1 px 边框、22 px 模糊阴影并向下偏 6 px；左边有宽 10 px、位于 y=122–138 的三角尖角指向按钮。内部有粗体标题、两行文字、70×26 px 描边按钮和 72×26 px 蓝色 OK 按钮。
- 光标在 3.0 秒前移到 OK (402,157)，3.3 秒点击；a 在 3.3–3.5 秒乘以三次 ease-in-out 的 1→0 系数关闭面板。

**适用用途：** 用于靠近触发按钮展示简短设置或确认项。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("07").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/055.txt`（SHA-256 `011f941a37b3aff30567ddcac7a278f9918c908c5c6e549d716a3ac4f3e618fd`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:056 · 轻提示

**上游检索名：** `056` / `toast`（Toast notification）；包：`ui`（UI 组件）。

**可见变化：** 点击保存后，深色通知滑入右下角；计时条走完后通知滑出。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；光标在 1.0 秒点击左下蓝色 Save 按钮（110×36 px），随后离开到左下。
- 提示框深灰 #26282c，214×52 px、圆角 10，距右边 18、距底边 16 px；1.05–1.4 秒用三次 ease-out 从右侧外移 240 px 滑入。内部是蓝圆中的白勾和白色 15 px Saved 文字。
- 底部 3 px 高的剩余时间条于 1.4–3.2 秒线性从 194 px 缩至 0；3.2–3.55 秒以三次 ease-in-out 向右滑出 240 px。

**适用用途：** 用于确认保存或发送结果，同时不打断用户操作。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("08").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/056.txt`（SHA-256 `7e893c34050df37945adc6ee8285f3e8d527f0dc652a1aa8ad3b5aebcc438ce6`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:057 · 标签页

**上游检索名：** `057` / `tabs`（Tabs）；包：`ui`（UI 组件）。

**可见变化：** 依次点击总览、价格、评价标签，蓝色下划线滑动，下面的内容随之切换。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；3 个标签位于 x=24、114、204，宽 70、70、100 px；y=50 有 2 px 分隔线和 4 px 蓝色下划线。光标在 1.0、2.2、3.4 秒依次点击第 2、第 3、第 1 个标签。
- 每次点击后下划线在 0.25 秒内按三次 ease-in-out 移至新标签并调整宽度；从第 3 回第 1 时经过中间位置。当前标签文字加粗并变蓝，其余灰色；切换分别发生在 1.1、2.3、3.5 秒。
- 旧内容面板在线性 0.2 秒内淡出，间隔 0.1 秒后新面板在 0.2 秒内淡入并上升 8 px。

**适用用途：** 用于在同一空间展示几种相关视图，并允许用户切换。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("09").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/057.txt`（SHA-256 `e1518599ba750ecd0ebbb344a3370377031cdc6acfac268d828121d458bab31e`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:058 · 轮播图

**上游检索名：** `058` / `carousel`（Carousel）；包：`ui`（UI 组件）。

**可见变化：** 每次点击右箭头，三张图片组成的一行向左移动一格，下方圆点同步更新。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；幻灯片 330×138 px、圆角 8、居中、间距 18 px，邻页从边缘露出。左右为白色圆按钮、半径 18、阴影模糊 10 px，带箭头；下方 3 个圆点，当前点蓝色 16×8 px，其余 8×8 px。
- 光标在 1.0、2.1、3.2 秒点击右箭头 (514,88)；每次点击，图片行在 0.4 秒内以三次 ease-in-out 左移 348 px（一张图加间距）。
- 三张图片是风景、三个圆和柱状图；它们循环排列，移动三次后回到第一张。

**适用用途：** 用于在有限空间中逐一展示多张图片或精选内容。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("10").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/058.txt`（SHA-256 `9ec66b19dd0a55dd3aafc9004e3f4aa279407dbfe01fb3f4f635c5cf0ae59d7a`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:059 · 开关

**上游检索名：** `059` / `toggle-switch`（Toggle switch）；包：`ui`（UI 组件）。

**可见变化：** 三行设置中先依次打开前两行开关，再依次关闭；第三行保持关闭。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；3 行设置间隔 60 px 并以分隔线区分。x=450 处有 64×34 px 开关轨道、圆角 17，白色滑块半径 13 并带阴影。
- 点击顺序：第 1 行在 1.0 秒打开，第 2 行在 1.8 秒打开，第 1 行在 3.0 秒关闭，第 2 行在 3.6 秒关闭；第 3 行始终关闭。每次切换用 0.2 秒三次 ease-out，滑块移动 30 px（x=17→47）。
- 轨道颜色随开关进度从灰色 #d9d7d5 混合到蓝色 #1f5ae8。

**适用用途：** 用于立即生效且只有开/关两种状态的设置。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("11").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/059.txt`（SHA-256 `bb5fbbb38d5c381307509ab34a3f0e9e8416a46a0013ed1d9f3a1799c94c7bf2`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:060 · 分段控制器

**上游检索名：** `060` / `segmented-control`（Segmented control）；包：`ui`（UI 组件）。

**可见变化：** 点击日、周、月后蓝色高亮滑动到对应分段，下方柱状图同步改变高度。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；底部为灰色 300×40 px 圆角 10 的底板，位于 (121,12)，分为 3 段各宽 100 px：日、周、月。蓝色选中块 92×32 px、圆角 8、阴影模糊 6，选中文字为白色。
- 光标在 1.0、2.1、3.3 秒依次点击周、月、日；蓝色选中块每次在 0.25 秒内用三次 ease-in-out 滑动。
- 下方柱图有 7 根柱，宽 34 px、间隔 58 px，第 6 根为蓝色。选项切换时柱高在三组数据间同步缓动：约 30–85、40–100、60–115 px。

**适用用途：** 用于在同一内容的 2–4 种视图间切换，例如日、周、月。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("12").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/060.txt`（SHA-256 `550f811d060c44fa1dc062e10d3636494809c5d90c0520167ee871617b0a2134`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:061 · 筛选标签

**上游检索名：** `061` / `filter-chips`（Filter chips）；包：`ui`（UI 组件）。

**可见变化：** 点击 New、Free 筛选标签后，标签变蓝并带勾；不匹配的卡片淡出。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；4 个筛选标签为全部、新、热门、免费（原例为日语），高 34 px、圆角 17，宽度随文字变化，彼此相隔 10 px。
- New 在 0.95 秒打开，Free 在 1.75 秒打开；New 在 3.0 秒关闭，Free 在 3.6 秒关闭。每次变化耗时 0.15 秒、三次 ease-out：标签加宽 18 px 容纳勾号，浅蓝填充，边框和文字变蓝。
- 下方有 4 张卡（242×54 px，两列两行）；不匹配的卡片不透明度从 1 降至 0.12。

**适用用途：** 用于组合少量快捷筛选项，缩小列表或搜索结果。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("13").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/061.txt`（SHA-256 `f667cf35b69b8b21fc6234449ba72041c60ed9f90cb9502cef5c599bb9b4c302`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:062 · 范围滑块

**上游检索名：** `062` / `range-slider`（Range slider）；包：`ui`（UI 组件）。

**可见变化：** 价格滑杆先将左侧手柄向右拖、再将右侧手柄向左拖以缩小范围，随后都复位。

**逐项动作规格：**
- 542×191 卡片；轨道 x=54–488、厚 8 px、位于 y=120，两个手柄之间填蓝色；数值范围 ¥0–¥10,000。手柄白色、半径 13 px、蓝色描边 3 px；拖动时扩大为 15 px，并出现半径 24 px 的浅蓝光圈。
- 低值手柄从 0.1（¥1,000）于 1.0–1.6 秒移至 0.3（¥3,000），3.55–3.9 秒返回；高值手柄从 1.0（¥10,000）于 2.1–2.6 秒移至 0.8（¥8,000），2.95–3.3 秒返回，均用三次 ease-in-out。
- 拖动时手柄上方显示高 28 px 的蓝色数值气泡，白字。右上角蓝字范围从 ¥1,000–¥10,000 起，并按 ¥100 步长更新。光标分别在 1.0、2.1、2.95、3.55 秒按住对应手柄。

**适用用途：** 用于按价格、日期或尺寸等最小值和最大值筛选范围。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("14").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/062.txt`（SHA-256 `7c8711dd75081222694634f0f791c022ce63c3b69c2fc5856808c698bbd9a45b`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:063 · 步进器

**上游检索名：** `063` / `stepper`（Stepper (+/−)）；包：`ui`（UI 组件）。

**可见变化：** 连续按三次加号，数字从 1 加到 4；再按三次减号回到 1，每按一次数字都会弹一下。

**逐项动作规格：**
- 542×191 卡片；(171,52) 处有 200×60 px 圆角 12 的控件，左 60 px 是 −、右 60 px 是蓝色 +，中间为 30 px 粗体数字。
- 点击顺序：0.9、1.35、1.8 秒按 +（1→4）；2.8、3.25、3.7 秒按 −（4→1）。被按下的区域从点击前 0.05 秒到点击后 0.15 秒染浅蓝。
- 每次按下后数字缩放在 0.25 秒内从 1.18 回到 1；期间数字为蓝色。

**适用用途：** 用于每次增减一个的小整数，例如数量或宾客人数。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("15").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/063.txt`（SHA-256 `7ddaa368ee7da3da91369f0ae9569abb2515dae92a6ad445b0204c81d37ed400`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:064 · 分页

**上游检索名：** `064` / `pagination`（Pagination）；包：`ui`（UI 组件）。

**可见变化：** 先后点击页码 2 和 3，蓝色圆形标记随之移动、上方列表更换，最后回到 1。

**逐项动作规格：**
- 542×191 卡片；页码 ‹ 1 2 3 4 5 › 居中，各圆直径 36 px、间隔 8 px，位于 y=160。蓝色半径 18 px 圆标记当前页，页码白色。
- 光标在 1.0 秒点 2、2.1 秒点 3、3.3 秒点 1。蓝圆每换一页移动 44 px，耗时 0.2 秒、三次 ease-in-out；3 回 1 时一次移动 88 px。
- 上方三行列表在 1.05、2.15、3.35 秒附近各以 0.2 秒先淡出再淡入，内容在透明度最低时更换。

**适用用途：** 用于把搜索结果或文章等长列表拆成编号分页。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("16").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/064.txt`（SHA-256 `bc3553e1256cd46c85d2cf0289995b4eda8c831709f72d9ebc3e88f277a6aabb`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:065 · 汉堡菜单

**上游检索名：** `065` / `hamburger-menu`（Hamburger menu）；包：`ui`（UI 组件）。

**可见变化：** 点击页眉右侧三线图标后，它变成叉号，菜单从页眉下方落下；再次点击关闭。

**逐项动作规格：**
- 542×191 卡片；白色页眉高 44 px，右侧 (500,22) 三条线各长 24、厚 3 px、间隔 8 px。光标在 1.0、3.3 秒各点击一次；打开量 a 于 1.0–1.3 秒从 0 到 1，再于 3.3–3.6 秒回到 0，均用三次 ease-in-out。
- 三线变叉：顶部和底部线各向中心移 8 px、反向旋转 ±45°；中间线透明度变为 1−a。菜单打开时图标变蓝。
- 白色菜单高 140 px，顶边位置 y=44−140+140a，因此从页眉下方向下落；菜单在页眉下方裁切，有 16 px 模糊阴影和 4 个条目，首项为蓝色。

**适用用途：** 用于窄屏，把主要导航收在一个按钮后。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("17").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/065.txt`（SHA-256 `9946bdfeb56303514ec7e38791451b45b704a6863f1541d865de2fe0e2e4d8e4`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:066 · 面包屑导航

**上游检索名：** `066` / `breadcrumbs`（Breadcrumbs）；包：`ui`（UI 组件）。

**可见变化：** 点击面包屑中的 Courses 返回课程列表；再点列表卡片回到详情页。

**逐项动作规格：**
- 542×191 卡片顶部显示 Home › Courses › Web design（17 px、原例为日语）；链接为蓝色，当前页黑色加粗；y=46 有分隔线。光标 0.9–1.2 秒悬停 Courses（显示下划线），1.0 秒点击。
- 返回上层进度在 1.0–1.25 秒三次 ease-in-out 从 0 到 1；› Web design 淡出，Courses 改为黑色粗体当前页。正文从标题与文本的详情页交叉淡化为 3 张列表卡（158×118 px，含风景图）。
- 光标移动到第一张卡片，2.45–2.8 秒显示 2 px 蓝色描边，2.7 秒点击；详情页在 2.7–2.95 秒返回。

**适用用途：** 用于层级较深的网站，显示页面所在位置并提供回到上层的路径。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("18").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/066.txt`（SHA-256 `ccf302f4f6726519d50aac1774a910a6c30676e6f827a04458c888db4c10e920`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:067 · 巨型菜单

**上游检索名：** `067` / `mega-menu`（Mega menu）；包：`ui`（UI 组件）。

**可见变化：** 光标悬停页眉 Products 后，全宽菜单向下展开，含三列链接和图片；离开后关闭。

**逐项动作规格：**
- 542×191 卡片；页眉高 42 px，显示 Products、Pricing、Support（16 px、原例为日语），各带下箭头。光标只悬停，1.0 秒到达 Products；打开量 a 于 1.05–1.3 秒三次 ease-out 增至 1，Products 变蓝并加下划线。
- 白色面板全宽、高 146 px，从页眉下方向下移 12 px 并随 a 淡入，阴影模糊 18 px、向下偏 8 px。内部三列相隔 130 px，每列含蓝色标题与 3 个链接，右侧有 104×112 px 图片。
- 光标向下移动，第二列第二个链接在 1.75–2.9 秒浅蓝高亮。2.9 秒离开面板，面板于 3.15–3.4 秒按三次 ease-in-out 逐渐关闭。

**适用用途：** 用于产品或栏目很多的网站，让访客一次看到完整范围。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("19").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/067.txt`（SHA-256 `8f31d50c63a7dde5573553744e4bc1cafe79848dd23abc6662bd37b2a9b91cc3`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:068 · 步骤指示器

**上游检索名：** `068` / `step-indicator`（Step indicator）；包：`ui`（UI 组件）。

**可见变化：** 每次点击下一步，四个步骤圆中的下一个变成勾选，蓝线延伸到下一步。

**逐项动作规格：**
- 542×191 卡片；4 个步骤详情、复核、付款、完成（原例为日语）位于 x=80、207、334、461，y=35，圆半径 17 px，由 4 px 灰线连接。光标在 0.9、1.7、2.5 秒点击右下角 110×38 px 的 Next。
- 每次点击时当前步骤变成蓝圆白勾，下一步成为蓝圆白字序号；未到达的步骤保持白底灰边。蓝线每次在 0.3 秒内用三次 ease-in-out 延长 127 px；第三次后四步都打勾。
- 3.75–4.05 秒进度条淡出，4.05–4.3 秒从第 1 步状态淡入复位。

**适用用途：** 用于注册、结账等多步骤流程，显示当前进度和剩余步骤。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("20").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/068.txt`（SHA-256 `2a077a4dba743a0fa9c8601cb4e45f700f5651027abc0f546219de96e114b0ef`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:069 · 骨架屏

**上游检索名：** `069` / `skeleton-screen`（Skeleton screen）；包：`ui`（UI 组件）。

**可见变化：** 点击刷新后，列表被同形灰色占位块替代，并有一道亮光扫过；加载结束后内容返回。

**逐项动作规格：**
- 542×191 卡片；两行列表各含一张 96×56 px 图片和三行文字。光标在 1.0 秒点击右上刷新图标。
- 1.05–1.2 秒用线性切换，把内容替换为尺寸和位置相同、圆角、灰色 #e9e7e5 的占位块。
- 宽 160 px 的白色光带每 0.9 秒从 x=−200 扫至 742，边缘透明、中心不透明度 0.75，只在占位块上绘制。内容于 3.0–3.3 秒线性恢复。

**适用用途：** 用于稍有加载等待的列表或卡片，让等待时仍能看见页面布局。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("21").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/069.txt`（SHA-256 `25634691490fe678e048c0f1c20d0030877c67910a35aef0e57a6eeba4b4851f`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:070 · 加载转圈

**上游检索名：** `070` / `spinner`（Spinner）；包：`ui`（UI 组件）。

**可见变化：** 点击发送后卡片被白色蒙层覆盖，蓝色弧线在中央旋转；完成后变成勾并淡出。

**逐项动作规格：**
- 542×191 卡片、4.5 秒一轮；光标在 1.0 秒点击底部中央 120×40 px 的 Send。1.05–1.2 秒内整卡白色蒙层（不透明度 0.78）和旋转图标线性淡入。
- 旋转图标中心 (271,92)：浅色圆环半径 26、线宽 6，上叠蓝色 243°（1.35π）弧线、圆头；每秒旋转 1.3 圈（468°/s）。
- 旋转图标在 2.95–3.05 秒淡出；蓝色圆半径 28，白勾于 2.95–3.2 秒从 0.7 放大到 1（三次 ease-out）。所有元素在 3.75–4.0 秒线性淡出。

**适用用途：** 用于发送、保存等时长不确定的短暂等待。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("22").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/070.txt`（SHA-256 `07e1bfa27e4845bc5a31acb9d38ce625a83142d57132d3b8fe23855068767272`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:071 · 徽标

**上游检索名：** `071` / `badge`（Badge）；包：`ui`（UI 组件）。

**可见变化：** 通知到达时，页眉铃铛上的蓝点数字依次增到 1、2、3；点击铃铛后清零。

**逐项动作规格：**
- 542×191 卡片；页眉高 54 px，线描铃铛位于右侧 (482,27)。徽标是铃铛右上偏移 (+12,−12) 的蓝圆，半径 12、白描边 2.5 px、白色数字 14 px。
- 通知在 0.7、1.3、1.9 秒到达，计数从 1 增至 3；首个徽标 0.7–0.9 秒三次 ease-out 放大进入。每次通知都让徽标从 1.3 倍弹回 1 倍，持续 0.3 秒，并在 0.5 秒内放出半径 12→28、透明度 0.5→0 的涟漪。
- 光标在 2.95 秒到铃铛处，3.0 秒点击；徽标于 3.0–3.25 秒按三次 ease-in-out 缩至 0。

**适用用途：** 用于提醒未读消息、购物车物品等数量。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("23").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/071.txt`（SHA-256 `3a9a6b588e8b6a5503df0bad85cd13c6af5ba5dd30bf80d298cd47739bdadd40`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:ui:072 · 空状态

**上游检索名：** `072` / `empty-state`（Empty state）；包：`ui`（UI 组件）。

**可见变化：** 点击两行列表的垃圾桶后，列表消失，出现空盒插画、Nothing here yet 文案和 Add 按钮。

**逐项动作规格：**
- 542×191 卡片；两行列表各为 494×48 px、圆角 8，右侧有垃圾桶图标。光标在 0.95、1.65 秒依次点击图标；每行在 0.3 秒内用三次 ease-in-out 左滑 60 px 并淡出，第二行再上移 58 px 补到第一行位置。
- 1.95–2.3 秒线性淡入空状态并上移 8 px：蓝色线描收件箱托盘、16 px 的 Nothing here yet（原例为日语）和蓝色 112×34 px 的 Add 按钮。
- 光标于 3.3 秒点击 Add；空状态在 3.25–3.45 秒淡出，两行列表在 3.35–3.7 秒用三次 ease-out 从左侧返回。

**适用用途：** 用于首次使用或无结果页面，告诉用户下一步可以做什么。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 542×191，源周期 4.5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/ui.mjs)，调用 `createElement("24").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/072.txt`（SHA-256 `4bd23fa2fe7abbffd7b0f5fe566a67f495f4f6b2f1cd3feb80f94bc243749525`），共享 kit `api/v1/kit/ui.js`（SHA-256 `12148bb41f9e34d16f7d9e307df21de0bf7d64d2c20bd6c0f21170bff5792cfc`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:073 · 视差滚动

**上游检索名：** `073` / `parallax-scrolling`（Parallax scrolling）；包：`lp`（落地页与网页效果）。

**可见变化：** 页面向下滚时，标题正常上移，天空和太阳、远山、近山则以较慢速度移动。

**逐项动作规格：**
- 浏览器视口 511×168 px；0.3–1.9 秒向下滚 0→120 px，2.9–4.3 秒回滚 120→0，均为三次 ease-in-out。各图层位移按滚动距离乘系数：天空与太阳 0.15、远山 0.4、近山 0.7。
- 28 px 标题、按钮和下一区块按 1.0 倍正常滚动。下一块白色区从首屏 168 px 底边开始，滑过较慢移动的背景；右侧滚动条滑块同步移动。

**适用用途：** 用于让首屏主视觉或区块照片呈现纵深感。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("01").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/073.txt`（SHA-256 `754b9c2ab77ce647c96576d6048e930792a572b9cd13b2f05cfc0c7d10964134`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:074 · 滚动淡入

**上游检索名：** `074` / `fade-in-on-scroll`（Fade-in on scroll）；包：`lp`（落地页与网页效果）。

**可见变化：** 页面滚动时，标题、卡片和正文进入视口后依次上移并淡入。

**逐项动作规格：**
- 滚动分段为 0.35–1.0 秒从 0 到 95 px、1.5–2.1 秒从 95 到 200 px、3.2–4.4 秒从 200 回到 0，均用三次 ease-in-out。触发线位于视口高的 85%（距顶 143 px），元素顶边越过该线时触发，逻辑类似 Intersection Observer。
- 触发后 0.7 秒内用三次 ease-out 从透明变为不透明，同时从最终位置下方 28 px 上移归位。三个元素分别是下移 172 px 的标题、下移 206 px 的三卡片行、下移 334 px 的正文；初始都在视口外，同一行卡片一起出现。
- 上滚离开视口底部时，元素重置为不可见，下次进入时重新播放。

**适用用途：** 用于较长落地页，让内容随着阅读逐段出现。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("02").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/074.txt`（SHA-256 `069747652ed510a493d20c2ab7f8c5cdbbf4afb32ff8d4450055a050fbbc4b47`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:075 · 吸顶页头

**上游检索名：** `075` / `sticky-header`（Sticky header）；包：`lp`（落地页与网页效果）。

**可见变化：** 公告条随页面滚走，下面的页眉停在顶部，正文从其下方继续滚动。

**逐项动作规格：**
- 滚动为 0.4–1.3 秒 0→110 px、1.9–2.8 秒 110→250 px、3.4–4.4 秒 250→0，均用三次 ease-in-out。最上方是高 22 px 的藏青公告条，下方高 34 px 的页眉含标志、3 个菜单项和按钮。
- 页眉位置为 max(22−scroll,0)：公告条滚走后页眉停在顶部，等同 sticky、top:0。随后 24 px 滚动范围内，页眉下方 12 px 阴影透明度由 0 升至 0.16。
- 照片、标题和 3 张卡片等正文在页眉下方正常滚动。

**适用用途：** 用于长页面中让菜单和行动按钮一直触手可及。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("03").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/075.txt`（SHA-256 `78e7ba16bd14ad7d0585719bddd8800fd5aa836f69b9d9933ef82f62885a946a`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:076 · 滚动固定

**上游检索名：** `076` / `pinning`（Pinning）；包：`lp`（落地页与网页效果）。

**可见变化：** 藏青区块占满视口后固定；继续滚动时数字与照片按 1→2→3 依次切换，最后区块继续向上滚走。

**逐项动作规格：**
- 滚动 0.3–3.0 秒从 0 到 500 px，3.5–4.5 秒回到 0，采用三次 ease-in-out。高 168 px 的藏青区块在滚动 110 px 时到顶，并固定 300 px 的滚动距离（类似 GSAP ScrollTrigger pin）。
- 固定期间进度 p=(scroll−110)/300；左侧长 124 px 的竖线按 p 填成橙色。p=1/3 和 2/3 附近（±0.07）以三次 ease-in-out 切到下一步：46 px 数字向上滚 52 px，226×124 px 照片向上滑 124 px。
- 固定滚过 300 px 后解除，区块与下方白色区一起向上滚动。

**适用用途：** 用于在一屏内讲解步骤、功能或前后变化。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("04").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/076.txt`（SHA-256 `5763e59c43b3680663050fc02f484fad2f5f7bc9a02abe770ad4d2414de45f85`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:077 · 横向滚动

**上游检索名：** `077` / `horizontal-scroll`（Horizontal scroll）；包：`lp`（落地页与网页效果）。

**可见变化：** 页面向下滚时区块保持固定，4 张编号作品卡横向向左移动。

**逐项动作规格：**
- 滚动 0.3–3.0 秒从 0 到 420 px，再于 3.5–4.5 秒回到 0，采用三次 ease-in-out。WORKS 标题先滚走；滚到 40 px 时区块抵达顶部并固定。
- 4 张卡片各 200×112 px、间距 20、左右内边距 34。横向总移动距离为 34×2+200×4+20×3−511=417 px；卡片 x=起始x−p×417，其中 p=(scroll−40)/380，位移与滚动线性对应，不另加缓动。
- 卡片横移时浏览器滚动条滑块仍向下移动。

**适用用途：** 用于在长网页的纵向滚动中横向展示作品、案例或产品。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("05").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/077.txt`（SHA-256 `57cabb345f400815bdab190deb32f56db79462862d632e346f29ea6c8705794c`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:078 · 滚动吸附

**上游检索名：** `078` / `scroll-snap`（Scroll snap）；包：`lp`（落地页与网页效果）。

**可见变化：** 轻轻滚动一点后，页面自动补完剩余距离，让下一屏顶端对齐视口顶部。

**逐项动作规格：**
- 每屏与视口等高 168 px；首屏浅蓝、第二屏藏青。每 2.4 秒触发一次吸附。0.45–0.85 秒用户只滚 34 px（三次 ease-out），0.9–1.5 秒页面自动补完剩余 134 px并对齐下一屏顶部（三次 ease-out）。
- 第二个 2.4 秒周期执行同样过程但向上回到首屏，模拟 scroll-snap-type: y mandatory。

**适用用途：** 用于每次完整阅读一屏的页面，例如幻灯片式内容。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("06").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/078.txt`（SHA-256 `8fdce5a640b4f3346a205c25a0c0a275ad30dc2ac87a3030f75bee03fbe16a7d`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:079 · 滚动进度条

**上游检索名：** `079` / `scroll-progress-bar`（Scroll progress bar）；包：`lp`（落地页与网页效果）。

**可见变化：** 文章分段滚动阅读时，视口顶部的细线从左向右增长，到达文章底部时填满。

**逐项动作规格：**
- 文章在 4 次各 110 px 的滚动中从 0 移至 430 px；每次移动 0.45 秒、停 0.4 秒，使用三次 ease-in-out。3.75–4.55 秒从 430 回到 0。
- 视口顶部有 6 px 进度条，轨道浅灰、填充橙色；填充宽度为 511×scroll/430 px，即滚动距离占总距离的比例，类似 CSS animation-timeline: scroll()。

**适用用途：** 用于长文章，提示读者还有多少内容。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("07").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/079.txt`（SHA-256 `dbae2302165ed19bda55acfa5c5cbb9b5e73e06d281ff6edffbac9bce0732872`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:080 · 荧光笔标记动画

**上游检索名：** `080` / `highlighter-animation`（Highlighter animation）；包：`lp`（落地页与网页效果）。

**可见变化：** 文案滚入视口时，黄色荧光笔痕从左向右划过关键词下半部。

**逐项动作规格：**
- 滚动分段为 0.35–1.0 秒 0→90 px、1.6–2.2 秒 90→180 px、3.3–4.4 秒 180→0，均使用三次 ease-in-out。两行 20 px 粗体文案位于页面下移 190、290 px 处，初始在视口下方。
- 文字顶边越过视口高 80%（距顶 134 px）的触发线时，关键词下方开始绘制荧光笔痕。笔痕为 #FFE36B 黄条、高 11 px，位于文字基线附近（上 8、下 3 px），在文字后方；0.8 秒三次 ease-out 从左侧由 0 长至词宽。
- 上滚离开视口底部的文字行重置为不可见。

**适用用途：** 用于在落地页文案中突出读者正在看到的关键短语。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("08").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/080.txt`（SHA-256 `36dd969ae7043c40a88ccdbe0195b236f39151eeacb3679b8ef654996065c4d0`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:081 · 悬停抬升

**上游检索名：** `081` / `hover-lift`（Hover lift）；包：`lp`（落地页与网页效果）。

**可见变化：** 光标下方的卡片轻轻抬起、阴影扩散；光标离开后回落。

**逐项动作规格：**
- 3 张卡片各 146×128 px、圆角 10；光标从左到右各停留约 1 秒。悬停时 0.3 秒三次 ease-out 上移 10 px；离开后用相同 0.3 秒回位，如 CSS transition。
- 卡片抬起时阴影同步从模糊 6 增至 22 px、y 偏移 2 增至 12 px、不透明度 0.08 增至 0.22。页面浅灰、卡片白色，使阴影清楚可见。

**适用用途：** 用于让卡片和按钮看起来可以点击。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("09").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/081.txt`（SHA-256 `360cd2e65d3f5b8d9fe227612c0a038bfaed346489d6866c2892e33eb9a99cf7`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:082 · 悬停图片放大

**上游检索名：** `082` / `image-zoom-on-hover`（Image zoom on hover）；包：`lp`（落地页与网页效果）。

**可见变化：** 光标下的照片慢慢放大，但画框尺寸不变；离开后照片缩回。

**逐项动作规格：**
- 两个照片框各 222×118 px、圆角 8；光标在左、右框各停留约 1.5 秒。悬停时内容以中心点为基准，在 0.5 秒内用三次 ease-out 从 1 放大到 1.15 倍；离开后也用 0.5 秒缩回。
- 画框外内容裁切（overflow:hidden）；框和说明文字都不移动。

**适用用途：** 用于作品、产品或文章图片网格，提示即将被选中的项目。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("10").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/082.txt`（SHA-256 `b81b389f236ca64f66eeb0aba4e4187d73c5e536107241caabf8698b588ec7bd`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:083 · 光标跟随

**上游检索名：** `083` / `cursor-follower`（Cursor follower）；包：`lp`（落地页与网页效果）。

**可见变化：** 光标在页面移动时，一个橙色圆形略微滞后地跟随。

**逐项动作规格：**
- 光标轨迹为 x=255+175sin(2πt/4.8)、y=86+46sin(4πt/4.8)，即每 4.8 秒走一圈的横向 8 字。
- 橙圆半径 17 px、不透明度 0.88，绘制在箭头光标下方。每帧按 60 fps 计算并覆盖当前剩余距离的 12%：x+= (光标x−x)×0.12；箭头光标始终可见。

**适用用途：** 用于品牌网站和作品集，增加俏皮、可互动的感觉。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("11").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/083.txt`（SHA-256 `e666b1b5f4a8f66714bc8f6fb366db2a398f7714249a307b72cff362644de85a`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:084 · 磁吸按钮

**上游检索名：** `084` / `magnetic-button`（Magnetic button）；包：`lp`（落地页与网页效果）。

**可见变化：** 光标靠近按钮时按钮被吸引并跟随；光标离开后按钮摇晃着回到原位。

**逐项动作规格：**
- 中心有一枚橙色按钮，168×52 px、圆角 26；从按钮中心量起，110 px 为吸附半径。光标进入范围后，目标偏移为 (光标位置−按钮中心)×0.35；每帧（60 fps）按钮朝目标移动剩余距离的 18%。
- 光标离开吸附范围后，按钮从当前偏移用 1.1 秒以 elastic.out(1,0.3) 回到 0；曲线为 2^(−10x)×sin((x−0.075)×2π/0.3)+1。
- 光标从左侧进入，绕按钮移动后从右侧离开。

**适用用途：** 用于最希望用户点击的一个按钮，例如注册或联系入口。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("12").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/084.txt`（SHA-256 `3452601e83e2842adf73720c3f15195b94f61a85e2f3cc2c4309982ea52a7f96`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:085 · 涟漪效果

**上游检索名：** `085` / `ripple-effect`（Ripple effect）；包：`lp`（落地页与网页效果）。

**可见变化：** 每次点击都从落点向外扩散白圆，填满按钮后逐渐消失。

**逐项动作规格：**
- 橙色按钮 280×56 px、圆角 10；0.7 秒点击中心偏左处，2.9 秒点击偏右处。圆心就在点击点，半径于 0.6 秒内用三次 ease-out 扩至按钮最远角落的距离。
- 白圆不透明度 0.4；点击后 0.3–0.8 秒内淡至 0。圆形裁切在按钮范围内（overflow:hidden），按钮文字绘制在圆形上层。

**适用用途：** 用于在点击发生位置确认按钮或列表项受到按压。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("13").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/085.txt`（SHA-256 `aad0514b2deeac819483d9ad7b097cc26e62326663aa4952936c5f74b5cff0c1`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:086 · 下划线动画

**上游检索名：** `086` / `underline-animation`（Underline animation）；包：`lp`（落地页与网页效果）。

**可见变化：** 光标悬停的链接下方，橙线从左向右长出；离开时线条向右收走。

**逐项动作规格：**
- 3 个 20 px 粗体链接相隔 56 px；光标从左至右各停留约 1 秒，每侧命中范围比文字宽 6 px。
- 下划线为橙色、粗 3 px、位于基线下方 8 px。悬停时 0.3 秒三次 ease-out 从左端由 0 增到文字全宽；离开时左端向右移动 0.3 秒，使线从右侧退出，效果类似 transform-origin 在右侧的 scaleX。

**适用用途：** 用于菜单和文字链接，轻声提示光标当前所在位置。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("14").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/086.txt`（SHA-256 `ca011e68622291e6b13acb7a768d21ac5e13f5634e1034483bfc63a262e90c68`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:087 · 前后对比滑块

**上游检索名：** `087` / `before-after-slider`（Before/after slider）；包：`lp`（落地页与网页效果）。

**可见变化：** 拖动照片中央的竖线，可调节左侧灰色 Before 与右侧彩色 After 各显示多少。

**逐项动作规格：**
- 照片框 359×140 px、圆角 10；右侧是彩色处理后照片，左侧为同一张去饱和的 Before，并叠加不透明度 0.18 的藏青色。Before 仅裁切在分隔线左侧。
- 分隔线上有 3 px 白线和半径 17 px 的白圆，内部是左右箭头。0.7 秒抓住圆形后，分隔线位置按比例从 50% 于 0.75–1.55 秒移至 20%，1.55–2.65 秒移至 82%，2.65–3.55 秒回 50%；均用三次 ease-in-out。
- 3.62 秒松开；左上标 BEFORE，右上标 AFTER。

**适用用途：** 用于呈现变化效果，例如装修、美容或照片修饰。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("15").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/087.txt`（SHA-256 `6b6c9f25431e7313f311b3964cb1bd103ed2edd19e0d554e1a98d2d5386b8af0`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:088 · 离站挽留弹窗

**上游检索名：** `088` / `exit-intent-popup`（Exit-intent popup）；包：`lp`（落地页与网页效果）。

**可见变化：** 光标朝页面顶部离开时触发挽留弹窗，页面变暗并出现 Wait!；点击 × 关闭。

**逐项动作规格：**
- 0.7–1.25 秒光标从页面向上移向浏览器标签和关闭按钮；约 1.07 秒越过视口顶边 y=0 时触发，逻辑相当于 document mouseleave 且 clientY≤0。
- 触发后 0.05–0.45 秒弹窗出现：藏青遮罩不透明度 0→0.5；260×132 px、圆角 12 的窗口透明度 0→1、缩放 0.9→1，使用三次 ease-out。内部有标题、橙色折扣行、优惠券按钮和右上角 ×。
- 2.9 秒点击 ×；0.03–0.25 秒内线性消失。

**适用用途：** 用于访客即将离开且尚未转化时，展示最后一次优惠或行动机会。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("16").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/088.txt`（SHA-256 `b6bdd40383cae1a4396558b7fd5cebe0a42c41c9db513edf520a1024b5d30efb`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:089 · 预加载画面

**上游检索名：** `089` / `preloader`（Preloader）；包：`lp`（落地页与网页效果）。

**可见变化：** 藏青加载屏中，标志下方数字从 0% 计到 100%；随后屏幕上移，底层页面淡入。

**逐项动作规格：**
- 藏青色覆盖整个视口，显示标志、28 px 数字和 180×4 px 进度条。0.25–2.1 秒以三次 ease-out 从 0% 计到 100%，取整显示，橙色进度条同步增长。
- 2.3–2.85 秒整个加载屏以三次 ease-in-out 上移 168 px 离开；底层页面标题和照片在 2.35–2.95 秒三次 ease-out 淡入至不透明，并从下方 14 px 升起。
- 4.25–4.75 秒屏幕从顶部重新落下并显示 0%，作为下一次加载状态。

**适用用途：** 用于图片或视频较多的网站，把加载等待变成品牌呈现。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("17").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/089.txt`（SHA-256 `c1f0eabe38ff9e76e74a91cfb4840fb3f2324e2e5e377b7fb7245a88b283e098`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:090 · 懒加载

**上游检索名：** `090` / `lazy-loading`（Lazy loading）；包：`lp`（落地页与网页效果）。

**可见变化：** 灰色占位块滚进视口时各自出现转动图标，图片加载后淡入；首行从开始即已加载。

**逐项动作规格：**
- 3×3 网格，每块 151×92 px；首行初始显示。滚动为 0.35–1.1 秒从 0 到 110 px、1.7–2.5 秒到 225 px、3.5–4.5 秒回到 0，均用三次 ease-in-out。
- 占位块顶边越过视口底部（y=168）时开始加载，每列比左侧一列晚 0.12 秒。每块中央先转 0.45 秒加载环：半径 11 px，每 0.8 秒转一圈。
- 随后图片在 0.35 秒内用三次 ease-out 从透明淡入；尚未加载的占位块显示图片图标。上滚离开视口底部的占位块重置为不可见。

**适用用途：** 用于图片密集页面，让首屏先加载并加快首次显示。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("18").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/090.txt`（SHA-256 `cb56eed9781c1cc64254fb2faa969c86db5b17daf899adef5345b1b7afd22a35`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:091 · 无限滚动

**上游检索名：** `091` / `infinite-scroll`（Infinite scroll）；包：`lp`（落地页与网页效果）。

**可见变化：** 滚到列表末尾时出现加载转圈，随后增加 3 个项目，阅读可以继续。

**逐项动作规格：**
- 列表项 331×44 px、圆角 8，垂直间隔 52 px；最后一项下方有半径 10 px 加载环，每 0.8 秒转一圈。
- 滚动在 0.25–0.85 秒由 38 到 116 px、1.15–1.75 秒到 194 px，采用三次 ease-in-out，并停在列表末端可见的位置。
- 2.6 秒增加 3 项，每项在 0.35 秒内三次 ease-out 淡入，并从下方 10 px 升起；加载环移到新的列表末端。每次增加 3 项（156 px）；内容每 3 项重复，因此循环末端与起点画面相同。

**适用用途：** 用于动态信息流或新闻列表，让用户无需翻页就能继续阅读。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("19").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/091.txt`（SHA-256 `98af9095d07848b19c5371f348f786c9fe2e85527a7f42190f0439404d547ced`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:092 · 页面转场

**上游检索名：** `092` / `page-transition`（Page transition）；包：`lp`（落地页与网页效果）。

**可见变化：** 在作品列表点卡片后，橙色面板从左扫过；面板遮住画面时切换页面和地址，再从详情页向右离开；返回列表同理。

**逐项动作规格：**
- 0.8 秒点击卡片；0.9–1.3 秒橙色全屏面板（中央有标志）以三次 ease-in-out 从左侧进入并完全遮住页面。
- 1.3 秒仍被面板覆盖时，页面和地址栏从 /works 切换为 /works/02；1.4–1.85 秒面板向右离开，显示详情页。
- 3.0 秒点 ← Back to list；面板 3.1–3.5 秒进入，3.5 秒切换页面，3.6–4.05 秒退出。面板覆盖包含页眉在内的整个视口。

**适用用途：** 用于品牌网站或作品集中的页面衔接。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("20").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/092.txt`（SHA-256 `236a53ffb481db781d3c093b867b1a8a6786227d5d7d88f7e576d6e875c8c26b`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:093 · 平滑滚动

**上游检索名：** `093` / `smooth-scroll`（Smooth scroll）；包：`lp`（落地页与网页效果）。

**可见变化：** 点击菜单中的 Pricing 后页面平滑下滚至价格区；点击右下回顶箭头则回到顶部。

**逐项动作规格：**
- 0.9 秒点击 Pricing；0.95–2.0 秒（1.05 秒）滚动由 0 到 296 px，采用三次 ease-in-out。终点是价格区顶端 330 px 减去固定页眉高 34 px。
- 滚动超过 60 px 后，右下角半径 15 px 的圆形回顶按钮在接下来的 40 px 内淡入。3.1 秒点击该按钮，3.15–4.2 秒以三次 ease-in-out 从 296 滚回 0。
- 价格区位于视口中时，菜单里的 Pricing 变橙色。

**适用用途：** 用于菜单或目录在同一页面内跳转，并让读者看清已到达的位置。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("21").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/093.txt`（SHA-256 `9eec5e8244fe1c19e01ed9ca846ab59ad1e9ade13ca6ca723704197c1efdb59f`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:094 · 跑马灯

**上游检索名：** `094` / `marquee`（Marquee）；包：`lp`（落地页与网页效果）。

**可见变化：** 藏青横幅内的大号服务名称与橙点无缝向左滚动。

**逐项动作规格：**
- 横幅高 58 px、藏青色、占满视口宽。白色文字 30 px、粗字重、字间距 1 px；一组四个词为 WEB DESIGN、BRANDING、MOTION、UI/UX，彼此相隔 64 px，间隔处有橙点（半径 6 px）。
- 每 4.8 秒以恒定速度左移一组宽度（此例约 881 px）。先测得整组宽度，再按该宽度循环偏移，避免接缝露出；重复整组直至填满视口。

**适用用途：** 用于有动感地展示服务名称、客户标志或品牌标语。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("22").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/094.txt`（SHA-256 `245a56a509efc9556539702d1f16c8d411bc260ccae4df73e5be0efa10aa04c4`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:095 · 动态渐变

**上游检索名：** `095` / `animated-gradient`（Animated gradient）；包：`lp`（落地页与网页效果）。

**可见变化：** 标题背后的橙、浅橙、蓝、浅蓝柔和色斑绕圈移动并持续融合变化。

**逐项动作规格：**
- 底色 #FFF1EB，上叠 4 个径向渐变（中心色向边缘透明，透明度各 0.85）：橙色半径 230、浅橙 #FFB08F 半径 210、蓝色半径 240、浅蓝 #9DB6FB 半径 200。
- 每个渐变中心在 4.8 秒内沿椭圆绕行一次；x 方向半径依次 70、60、80、50，y 方向半径 30、40、30、35，起始角依次 0、2.1、4.2、1.0 rad。
- 白色 34 px 标题和按钮位于渐变上方，只有渐变移动。

**适用用途：** 用于在首屏或标题后添加持续的颜色运动，而不依赖照片。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("23").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/095.txt`（SHA-256 `fe3aae43301a218226e1c5c68d82a784fedfc0659f1bcbfc7eaa778cced980f4`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp:096 · 悬浮动画

**上游检索名：** `096` / `floating-animation`（Floating animation）；包：`lp`（落地页与网页效果）。

**可见变化：** 标题旁的手机、爱心徽标和评分标签各自以不同节奏轻轻起伏，手机下方阴影同步变化。

**逐项动作规格：**
- 手机尺寸 92×132 px，y=−8sin(2πt/2.4)，每 2.4 秒浮动一次，两端较慢；爱心徽标半径 20，y=−6sin(2πt/1.6+1.2)；评分标签尺寸 76×30 px，y=−6sin(2πt/2.4+2.4)。
- 手机下方 54×6 px 椭圆阴影的尺寸与透明度乘以 (1+y/40)，手机升高时阴影随之缩小、变淡。两个周期 2.4 秒和 1.6 秒都能整除 4.8 秒，因此循环没有接缝。

**适用用途：** 用于给产品图片、应用示意图或装饰图标添加轻柔动势。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.8 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp.mjs)，调用 `createElement("24").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/096.txt`（SHA-256 `d95174194acb07ed36c802a64f175ccf51e061e827f9cce185e324f062206dba`），共享 kit `api/v1/kit/lp.js`（SHA-256 `0212cfdebe4980eaa1f81bab725894f0d96ebaa596b958392fbfab9677fe85e1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:097 · 逆光

**上游检索名：** `097` / `backlighting`（Backlighting）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 太阳从画外移到人物头后方，人物边缘出现窄亮边；暖雾覆盖画面，朝向相机的一侧变暗。

**逐项动作规格：**
- 人像为地平线 y=150 前的肩部以上剪影，头心 (270,78)、半径 29 px，无脸和头发。前光为平涂琥珀 #FFC75A，阴影 #33405A。
- 半径 20 px 的太阳从左上画外 (40,−40) 移到头后 (270,56)，并带 2.6 倍、1.7 倍半径的平面光环 #FFE3A3，透明度分别为 35%、60%。人物先描 7 px 外轮廓再填色，留下向外 3.5 px 的亮边。
- 人物由 #4D5A75 转为 #33405A，天空由 #FAF9F7 转为 #FFF4DC；#FFE3A3 以 22% 覆盖全画面。

**适用用途：** 用于通透发光的人像，或希望整体像沐浴在光里的照片。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("01").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/097.txt`（SHA-256 `76e707ce0b833185a3a27d82fa671116efa61297848b8bdbd2c80d1b0fb2e10b`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:098 · 轮廓光

**上游检索名：** `098` / `rim-light`（Rim light）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 周围变暗，人物后方左右两盏灯只在头肩两侧勾出细亮边；右下示意灯位。

**逐项动作规格：**
- 肩部以上人物位于 y=150 地平线前，头心 (270,78)、半径 29 px，无脸、无头发。背景从明亮场景变成深色天空 #2B2D33 和地面 #24252A；人物由 #4D5A75 转为 #1F2128。
- 两个人形副本填为琥珀 #FFC75A，向左、右各偏移 3.5 px 并上移 2.5 px，置于深色人物之后，形成约 3.5 px 亮边。
- 右下角 66×66 px 灯位示意从上方显示左右后侧 ±135°；右上角读数 ±135°。

**适用用途：** 用于把人物或产品从暗背景中分离，并显出外形。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("02").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/098.txt`（SHA-256 `3c12d6f227d6d5618e7ec41e5b2966555082d6cde1c10e2e0e95d08a0a9b624f`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:099 · 剪影

**上游检索名：** `099` / `silhouette`（Silhouette）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 按明亮的傍晚天空曝光后，人物、建筑、路灯和树都成为无细节的纯黑形状，只有天空保持明亮。

**逐项动作规格：**
- 肩部以上人物在 y=150 地平线前，头心 (270,78)、半径 29 px，无脸、无头发。天空由 #FAF9F7 变为顶部 #FFEDC4，并在地平线 y=92–150 形成 #FFCF73 色带；天空以外多为 #2A2D36，远山 #4A4546，人物 #22252D。
- 效果强度在进入时段压暗非天空区域；停留和退出遵循 Photo 共同行为。

**适用用途：** 用于让形状和姿态承担主要表达，适合日落或明亮窗户背景。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("03").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/099.txt`（SHA-256 `8a05a265892ec619da6e66e051ace75de7679e3204df785241790b9ddb79b71d`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:100 · 分割光

**上游检索名：** `100` / `split-lighting`（Split lighting）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 主光从接近正面（20°）转到正侧面（90°），头部阴影由弯月逐渐扩大到正好半脸。

**逐项动作规格：**
- 肩部以上人物头心 (270,78)、半径 29 px，位于 y=150 地平线前；背景天空转为较暗的 #E7E5E1。光从画面左侧入射，角度 20°→90°；右下显示灯位，右上读数 90° · ↑0°。
- 头部边界为 x=270+cos(angle)×√(29²−dy²)：右侧为 #33405A 阴影，左侧为 #FFC75A 亮面；角度到 90° 时边界正好垂直穿过头部中心。
- 肩部半宽 56 px；x=270+cos(angle)×56 右侧为阴影，身体左边缘留一条受光窄边。

**适用用途：** 用于戏剧化、紧张或阴郁的人像。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("04").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/100.txt`（SHA-256 `feadabae6f28b13c493b49c4075770693b02438cda64356eb06731d7a2019be6`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:101 · 伦勃朗光

**上游检索名：** `101` / `rembrandt-lighting`（Rembrandt lighting）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 从侧上方 45° 打光后，脸部右侧落入阴影，阴影侧脸颊保留一个小倒三角亮区。

**逐项动作规格：**
- 肩部以上人物头心 (270,78)、半径 R=29 px，位于 y=150 地平线前；背景天空转暗至 #E7E5E1。头部 x>270+0.04R 为 #33405A 阴影，另一侧为 #FFC75A 亮面。
- 阴影侧脸颊上的亮三角顶点为 (270+0.24R,78−0.12R)、(270+0.7R,78−0.12R)、(270+0.24R,78+0.5R)，约宽 13、高 18 px；它与亮面间有约 6 px 阴影带。
- 身体以中心为界：x<270−0.45×56 px 受光，x>270+0.3×56 px 为阴影。灯位示意 45°，右上读数 45° · ↑45°。

**适用用途：** 用于获得有绘画感、立体感和古典气质的人像。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("05").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/101.txt`（SHA-256 `f6361c19e63e52d7403be4c83372d9b5bdf8bb6d30873c984d7995093b29902c`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:102 · 蝴蝶光

**上游检索名：** `102` / `butterfly-lighting`（Butterfly lighting）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 正前上方打光使脸部两侧均匀受光，只在下巴下方留下小而对称的阴影。

**逐项动作规格：**
- 肩部以上人物头心 (270,78)、半径 R=29 px，位于 y=150 地平线前；背景天空转暗至 #E7E5E1。整个头部均为 #FFC75A 亮面，没有阴影侧。
- 下巴下方有 #33405A 椭圆阴影，中心 y=78+1.06R，宽 0.72R、高 0.38R，约 21×11 px。
- 身体在中心左右 ±0.8×56 px 范围受光，外侧窄条保留底色。灯位示意显示光源在相机侧 0°，右上读数 0° · ↑45°。

**适用用途：** 用于修饰面部的美妆或时尚人像。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("06").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/102.txt`（SHA-256 `8a9886570227124e2af4223955c2b7776caf9f3870dba5ff1832caadb25b9f00`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:103 · 黄金时刻

**上游检索名：** `103` / `golden-hour`（Golden hour）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 太阳落到地平线稍上方，天空和地面转橙；人物左侧被照亮，路灯与树的影子向右拉长。

**逐项动作规格：**
- 肩部以上人物位于 y=150 地平线前，头心 (270,78)、半径 29 px。半径 18 px 的太阳从 (110,−30) 移到 (96,136)，被山丘遮住一半。
- 天空由 #FAF9F7 转为顶部 #FFE8BC、地平线附近 #FFCF80；地面从 #F1F0EE 转为 #F6DDB0；人物亮面 #FFB547、阴影 #3E3650。光从左侧约 66°照亮人物左侧。
- 路灯和树脚下的影子向右延伸，长度 0→150 px、颜色 #DDAA6E；右上角时钟 12:00→17:40。

**适用用途：** 用于温暖、怀旧、柔和气息的影像。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("07").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/103.txt`（SHA-256 `15080f2973c4498dc63667743533416a37f9e342ffee6d003298127b9f3b55d7`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:104 · 蓝调时刻

**上游检索名：** `104` / `blue-hour`（Blue hour）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 日落后天空变成两层深蓝，窗户和路灯亮起琥珀光，人物变成深蓝剪影。

**逐项动作规格：**
- 肩部以上人物位于 y=150 地平线前，头心 (270,78)、半径 29 px。太阳半径 18 px、位于 x=120，从 y=40 下沉至 190；效果达到 70% 时太阳入地平线，40–80% 强度间逐渐淡出。
- 天空顶部 #2C3B5E、地平线附近 #4A6191，地面 #283452、建筑 #34446B、人物 #1C2439。每三扇窗亮一扇，路灯灯泡变为 #FFC75A，并有半径 13、8 px 的 #FFE3A3 光环，透明度分别 35%、60%。
- 右上角时钟显示 12:00→18:35。

**适用用途：** 用于既需要蓝色夜空、又要保留发光灯源的城市夜景。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("08").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/104.txt`（SHA-256 `30752d5ed697cd3a0a783a16c98c6bd4d572df433187864c1f7430b5e6484170`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:105 · 散景

**上游检索名：** `105` / `bokeh`（Bokeh）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 光圈开大后，合焦人物仍清晰，后方建筑变柔；路灯和远处光源扩散成较大的浅色圆斑。

**逐项动作规格：**
- 街角场景中，人物在前景左侧（脚位于 x=176、y=200，身高 124 px）；道路 y=132–162，后方有建筑、树和位于 x=114、292、494 的路灯。除人物外背景模糊量从 0 增至 6 px。
- 3 盏路灯按 1.25 倍尺寸绘制，另有 12 个远处灯光每隔 45 px 排列（y=44–114、尺寸倍率 0.6–1.2，固定随机种子）。散景圆半径为 (2.4+15×效果量)×尺寸倍率；不透明度 100%→55%，路灯琥珀 #FFC75A、远灯 #FFE3A3，均有 1.2 px 琥珀色描边。
- 人物始终清晰；右上角光圈数值 f/16→f/1.4（8 档）。背景天空转暗至 #E7E5E1。

**适用用途：** 用于让人物或产品从背景中凸显，并营造柔和、节庆般的夜景氛围。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("09").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/105.txt`（SHA-256 `d8b41590111ac1cd8c0cfef699691d5bd555ccff0cd9d308d69bebf57ab6b8a1`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:106 · 移轴效果

**上游检索名：** `106` / `tilt-shift`（Tilt-shift）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 街道画面只有中间的道路、汽车和小人清晰，上下两带模糊，像微缩模型。

**逐项动作规格：**
- 街角场景包含道路 y=132–162、建筑、树和路灯；不画大型前景人物。路边站 4 个高 23–26 px 的小人，脚在 y=172；汽车每 5 秒从 x=−60 行驶到 600。
- 焦点带 y=66–176 保持清晰；y=0–42 与 y=190–208 模糊 0→7 px，过渡带 y=42–66 与 y=176–190 模糊 0→3 px。
- 焦点带边缘画灰色 #8E8E93 虚线，透明度 75%，每段长 6 px、间隔 5 px。

**适用用途：** 用于把城市或活动拍成玩具模型般的微缩世界。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("10").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/106.txt`（SHA-256 `a5c08e5aa5191a096f56ba3c205634ab92d00c9759be362222d5b912dd618d3d`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:107 · 长曝光

**上游检索名：** `107` / `long-exposure`（Long exposure）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 街道转入夜色，行驶的汽车几乎隐去，红色尾灯拖成一道长线，对向车道出现白、琥珀色光线。

**逐项动作规格：**
- 街角道路 y=132–162；建筑、树和路灯位于道路后方（x=114、292、494），人物在前景左侧、脚点 (176,200)、高 124 px。夜景天空 #2C3B5E，每三扇窗一扇亮为 #FFC75A。
- 汽车每 5 秒从 x=−60 移至 600，车身不透明度从 100%降到 10%。尾灯线从 x=−60 延伸至汽车：y=145 的 #FF5B4D 粗 2.6 px，y=149 的 #FF8A6E 粗 1.4 px。
- 对向车道铺满画宽的光线并随效果淡入：y=135 的 #FFE9B8 粗 2.6 px，y=138.5 的 #FFC75A 粗 1.6 px，y=141.5 的 #FFE9B8 粗 1.2 px。右上角快门数值从 1/250 变为 8 秒。

**适用用途：** 用于在单帧中表现车流，或丝滑的水面与云层。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("11").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/107.txt`（SHA-256 `848d2c9815b88197e8b2650e9aba6e0772ce5555c2718c6ff250ff720ddc533a`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:108 · 追随拍摄

**上游检索名：** `108` / `panning-shot`（Panning shot）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 相机跟随行驶汽车，汽车清晰地留在画面中央，后方建筑、树和路灯横向拖影。

**逐项动作规格：**
- 街角道路 y=132–162，后方有建筑、树、路灯；前景不放大型人物。无效果时汽车 5 秒从 x=−80 移到 620；加入追随后，汽车保持在 x=270±10 px。
- 背景沿横向分散 46 px 范围绘制 12 次并取平均，拖影范围由 0 增至 46 px。车轮辐条每 5 秒转 12 圈。
- 右上角快门数值从 1/1000 变为 1/15。

**适用用途：** 用于在静态画面中表现汽车、自行车或跑步者的速度。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("12").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/108.txt`（SHA-256 `32d0be3fd396c6ea744126740f346bdec06a06f97c05af4df0fa638ce1abc5ac`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:109 · 镜头眩光

**上游检索名：** `109` / `lens-flare`（Lens flare）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 太阳从建筑后移出，周围出现光芒；一串光点、六边形和圆环从太阳沿穿过画心的直线延伸至另一侧。

**逐项动作规格：**
- 街角场景的道路位于 y=132–162，后方建筑、树和路灯位于 x=114、292、494；人物前景左侧，脚点 (176,200)、高 124 px。半径 13 px 的太阳从建筑后 (428,74) 移至开阔天空 (474,30)。
- 太阳周围有 8 条光芒，从中心外 17 px 延伸至 26 或 44 px，长度交替 9、27 px；琥珀色线宽 1.6 px、不透明度 75%。
- 沿太阳穿过画面中心的直线，在 t=0.45、0.8、1.15、1.45、1.75、2.0 处依次放置半径 7 px 圆、边长为 13 px 的六边形、5 px 圆、22 px 六边形、9 px 圆和线宽 3 px、半径 30 px 圆环（t=1 为画面中心）。琥珀 #FFC75A 与 #FFE3A3 的光斑强度为效果量的 40–70%。

**适用用途：** 用于增加眩光、夏日阳光或电影式光感。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("13").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/109.txt`（SHA-256 `a84bfe67f0584a12749d360d1683f616eb9714f183af1fdde81fb3549f08080f`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:110 · 鱼眼镜头

**上游检索名：** `110` / `fisheye-lens`（Fisheye lens）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 街景中央向外鼓起，建筑竖线和道路边缘弯曲，画角位置不变。

**逐项动作规格：**
- 街角道路 y=132–162，建筑、树和路灯在后方，人物在前景左侧，脚位 (176,200)、高 124 px。以画面中心为基准，将距离 d 的点乘 g=(1+k)/(1+k·d²/R²) 后再放置，其中 R=中心到画角的距离 289 px。
- k 从 0 增至 1.25；中心放大为 2.25 倍，四角不移动。每隔 6 px 切分轮廓后再变形，使直线弯曲。右上角焦距显示 24 mm→8 mm。

**适用用途：** 用于夸张、俏皮或窥视孔般的视角，例如滑板或音乐视频。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("14").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/110.txt`（SHA-256 `40348d8f3c8d4d9129833a5a4838d0a8e89311ef61daf8f74e646345ed31d07e`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:111 · 色差

**上游检索名：** `111` / `chromatic-aberration`（Chromatic aberration）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 街景分成红、绿、蓝三层，再以略有差异的大小叠回；人物、建筑和灯边缘出现色边，越靠画面两侧越明显。

**逐项动作规格：**
- 街角道路 y=132–162，建筑、树、路灯在后方，人物在前景左侧、脚位 (176,200)、高 124 px。
- 图像分别乘以纯红 #FF0000、纯绿 #00FF00、纯蓝 #0000FF 得到三份副本，再叠加回黑底。围绕中心缩放：红层 1+2s、绿层 1+s、蓝层 1，s 从 0 增至 0.02。
- 画面左右边缘的红、蓝层最终相距约 11 px，中心偏移为 0。

**适用用途：** 用于旧镜头、VHS 或数字故障感。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("15").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/111.txt`（SHA-256 `69aac1193e8f378516ed1d267cfe76f808c2b5a66c80157f50566aa4a71526ab`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:112 · 暗角

**上游检索名：** `112` / `vignette`（Vignette）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 画面从四角向内平滑变暗，人物和道路中央仍保持明亮。

**逐项动作规格：**
- 街角场景有前景人物、后方建筑树灯和 y=132–162 的道路。暗角是以画面中心为圆心的椭圆，纵向半径为横向半径×208/539×1.35。
- 水平半径 334 px 的 45% 以内挖空不加暗角；其外叠加 rgb(32,35,43)，不透明度从中心边界的 0% 逐渐升至画框边缘的 70%。

**适用用途：** 用于把注意力收向主体，或模拟老镜头。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("16").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/112.txt`（SHA-256 `07d58a431d9344e879b1f7a87020955dfe0e85667fd2c3ddfc2b1588423bcfb1`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:113 · 高调

**上游检索名：** `113` / `high-key`（High-key）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 风景和人物转为明亮、近白的颜色，阴影变得很淡；右下直方图峰值向右移动。

**逐项动作规格：**
- 场景左侧是胸像（头心 x=140、y=82，半径 28 px），右侧是山丘、房子、树和太阳（x=432、y=54，半径 15 px）。天空 #FAF9F7→#FFFFFF，山 #EAEDF1→#F5F6F8，人物 #4D5A75→#B9C0CE，阴影 #33405A→#A6AEBF，太阳 #F5A524→#FFD889。
- 右下 96×46 px、20 柱直方图的峰中心从 0.56 到 0.85，宽度从 0.2 缩至 0.09。

**适用用途：** 用于干净、明亮、柔和的产品照片和人像。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("17").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/113.txt`（SHA-256 `e0a315b0f625a15a4ca53e7b19d53ce45025699ed9a470e323f7e70feff8e927`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:114 · 低调

**上游检索名：** `114` / `low-key`（Low-key）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 画面大部分沉入黑暗，太阳熄灭；只保留侧光照亮的胸像右缘，直方图峰值移向左侧。

**逐项动作规格：**
- 场景左侧胸像头心 (140,82)、半径 28 px；右侧山丘、房子、树和太阳（中心 432,54、半径 15 px）。天空由 #FAF9F7 转为 #2B2D33，山转为 #313339 和 #36383E，地面 #24252A，人物 #25272E；太阳与光环变为天空色并消失。
- 胸像右侧受光边缘仍保留：#FFC75A→#FFB547。直方图峰中心由 0.56 移至 0.14，宽度由 0.2 收至 0.08。

**适用用途：** 用于奢华、紧张或神秘的影像。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("18").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/114.txt`（SHA-256 `9fb21b46cb08658e7d50832e401d702d34f6606372379ae9c0a950465598f423`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:115 · 黑白

**上游检索名：** `115` / `black-and-white`（Black and white）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 同一片风景逐渐褪去颜色；太阳和人物受光面转为灰色，形体只靠明暗区分。

**逐项动作规格：**
- 风景含左侧胸像（头心 x=140、y=82、半径 28 px）和右侧山丘、房子、树、太阳（x=432、y=54、半径 15 px）。每种颜色按亮度公式 0.2126R+0.7152G+0.0722B 转灰，并围绕 140 的灰度基准把对比度提高到 1.25 倍。
- 例如人物 #4D5A75 转为约 #4D4D4D，太阳 #F5A524 转为约 #B5B5B5。

**适用用途：** 用于营造历久感，或让形体、光线和表情比色彩更重要。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("19").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/115.txt`（SHA-256 `7a79b212feaab591996ccc8fa7f93ccf9b9e0d28e1d6e14e9aa80bc1c95c6009`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:116 · 双色调

**上游检索名：** `116` / `duotone`（Duotone）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 同一片风景被两种颜色重新映射：暗部靛蓝，亮部粉色。

**逐项动作规格：**
- 风景含左侧胸像及右侧山丘、房子、树和太阳；暗端为 #1F2A5C，亮端为 #FF9FB2。
- 对每个像素亮度 L，计算 t=((L−70)/180)^2.4，再按 t 混合这两种颜色；非线性映射会把亮部色阶拉开。

**适用用途：** 用于统一海报、音乐视觉或社交图片的品牌配色。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("20").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/116.txt`（SHA-256 `ad8a1b98b025c51ca3fa65b63e54b1a5d2635d1e3f07b940a427b2970241bbdc`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:117 · 青橙色调

**上游检索名：** `117` / `teal-and-orange`（Teal and orange）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 同一片风景的天空、山、地面和阴影人物转为青绿色，人物亮边和太阳转为橙色，形成互补对比。

**逐项动作规格：**
- 青色系：天空 #CFE6E3，山 #8CC1BE 与 #62A2A1，地面 #3F8083，树 #2F6A6E，人物 #1D4E53。
- 橙色系：人物受光面 #FF9248，太阳 #FF8236，太阳光环 #FFC48C。

**适用用途：** 用于具有强烈色彩反差、预告片感的画面。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("21").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/117.txt`（SHA-256 `cc55ab8a180bc2df887d386d7b36b270d4f97837e7737e17bb1ff87b513e126b`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:118 · 胶片颗粒

**上游检索名：** `118` / `film-grain`（Film grain）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 同一片风景上出现细颗粒，整体颜色略微偏暖奶油色。

**逐项动作规格：**
- 铺设 2,600 个固定随机种子的方点，尺寸 0.8–1.7 px；55% 为深色 #3A3530，其余白色。颗粒透明度为效果量×16–38%，颗粒位置固定，不闪烁。
- 所有颜色向 #F2DDBE 移动 16%。

**适用用途：** 用于去掉过于干净的数码感，增加模拟胶片的纹理。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("22").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/118.txt`（SHA-256 `83217b4ebf8ccb9938468253ba09408db1ac1294fab988c32e6dff7777c61c05`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:119 · 漏光

**上游检索名：** `119` / `light-leak`（Light leak）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 光漏从同一片风景右边缘进入，内侧淡黄、边缘红色，并缓慢摆动。

**逐项动作规格：**
- 4 个高椭圆中心位于画面右缘外 30 px，循环中左右摆动 ±6 px；纵向半径为画面高的 1.1 倍。
- 从内到外的水平半径与颜色依次为：250 px #FFD089、不透明度 35%；170 px #FF9A3D、40%；95 px #FF5A3A、45%；45 px #FF3B30、50%。每个椭圆都从 0 逐渐扩张到目标半径。

**适用用途：** 用于营造怀旧、夏日或像偶然漏光般的记忆质感。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("23").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/119.txt`（SHA-256 `16b803bcd1aaeae92891841c46569934027c6b30757a5c5ae028f924cb07a729`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:photo:120 · 双重曝光

**上游检索名：** `120` / `double-exposure`（Double exposure）；包：`photo`（摄影效果、光线与风格）。

**可见变化：** 背景转白；山丘、房子、树和太阳的缩小风景只出现在胸像轮廓内部。

**逐项动作规格：**
- 左侧胸像头心 (140,82)、半径 28 px；右侧风景包括山丘、房子、树和太阳（x=432、y=54、半径 15 px）。胸像外背景为白色 #FFFFFF。
- 胸像内部放同一片缩小至 0.7 倍的风景；位置使太阳落在头部右上、山脊横跨脖颈。内部天空 #D3DBE6，山丘 #9AA8BD 与 #76869F，地面 #55647E，树 #3F4C66。
- 双重曝光画面按效果量叠加在原图上。

**适用用途：** 用于把人物与地点、记忆或内心世界连接起来，适合海报和封面。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 5 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/photo.mjs)，调用 `createElement("24").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/120.txt`（SHA-256 `2d58b5c9af2df6d07c42d01dfd42b741607df3bb1aa9e21fd0b9683c5d392c85`），共享 kit `api/v1/kit/photo.js`（SHA-256 `6858c5d37666c0782af126d6ae0082f514bf635875635a3a2afca61b427182c3`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:121 · 预备动作

**上游检索名：** `121` / `anticipation`（Anticipation）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 方块角色先向行进反方向蓄力、压扁，再猛然向前发射。

**逐项动作规格：**
- 每 2.35 秒一次、方向交替（4.7 秒内先左向右、再右向左）。珊瑚色圆角方块边长 86 px、圆角半径 24，内有白箭头；初始距边缘 108 px，地面 y=178。
- 蓄力 0.2–0.95 秒，用二次 ease-in-out；朝反方向退 44 px，压成宽 1.22、高 0.76 倍，并向后倾 0.18 rad。
- 0.95–1.38 秒发射至远端，用 backOut（s=1.1）轻微过冲；运动前 60% 沿途拉伸至宽 1.55、高 0.72 倍（半正弦曲线），并前倾 0.08 rad。
- 落地后宽高以 0.13e^(−7t)sin(17t) 的幅度反向摆动。发射点出现 3 团尘土，在移动前 70% 内消失；身后有 3 条宽 8 px 黄速度线。

**适用用途：** 用于跳跃、冲刺或发射前的预备动作，让运动有蓄力和重量。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("01").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/121.txt`（SHA-256 `4e6317269f9ee906b2ed1659e96cf5d860cd956491484ffdaa1220fa2ceba060`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:122 · 跟随动作

**上游检索名：** `122` / `follow-through`（Follow-through）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 圆形角色滑入后突然停住，头顶旗子和尾巴继续摆动，随后逐渐停稳。

**逐项动作规格：**
- 每 2.35 秒移动一次（4.7 秒内交替方向）。薄荷色圆形身体半径 38 px，在 0.15–0.85 秒移动 303 px：前 30% 加速，之后匀速，并在 0.85 秒突然停下。
- 旗杆为白色、长 58 px，带黄旗；身体加速度驱动旗杆弹簧角度：a″=−121a−5.5a′−0.0175×加速度（固有频率 11 rad/s）。布料再沿旗杆弯曲 0.6 倍角度。
- 尾巴由 7 段珊瑚色、宽 14→6 px 的线段组成，采用较慢弹簧 b″=−56b−2.8b′−0.012×加速度。第 j 段取提前 j×22/600 秒（约 0.037j 秒）的值，再乘 0.55+0.16j。
- 两个弹簧都按 1/600 秒预先计算，绘制时只查表；每次移动最后 0.3 秒用 smoothstep 把摆幅淡至 0，确保循环无缝。

**适用用途：** 用于头发、衣服、配件或标志边饰，让附属部分有重量感。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("02").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/122.txt`（SHA-256 `9dc34093b82a0124d802b82cf1f4f45f5096c02edecf6a1e55ca2cf17e6b381f`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:123 · 弹跳

**上游检索名：** `123` / `bounce`（Bounce）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 球落下并一次比一次弹得低，最后停住。

**逐项动作规格：**
- 每 2.35 秒落一次，颜色先黄后珊瑚；球半径 26 px。0.1 秒起从地面上方 190 px 落下，重力 1900 px/s²；每次反弹保留 56% 速度（恢复系数 0.56），反弹速度低于 35 px/s 即停止。
- 0.1–1.8 秒间沿 x=150→390 移动，使用三次 ease-out。每次撞击前后各 0.045 秒，宽高按 1+sq、1−sq 反向压缩，sq 最大为 0.4×min(1,撞击速度÷850)。撞击速度超过 200 px/s 时，左右闪出短白线 0.3 秒。
- 阴影随球高度增加而缩小。1.95–2.25 秒退场，缩放乘以 1−backIn（s=2）。

**适用用途：** 用于表现图标、文字或产品落地，显得有重量且富有弹性。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("03").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/123.txt`（SHA-256 `5baa50e2faf13f7114028e5ddbbb0ec1848d3864311fa78a7fb12aaf4fb1be08`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:124 · 随机抖动

**上游检索名：** `124` / `wiggle`（Wiggle）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 铃铛持续不规则抖动；不是被敲一下，而是一直轻震。

**逐项动作规格：**
- 黄色铃铛以顶部为支点（中心 y=34）持续运动。角度由 4 组正弦波相加：每 4.7 秒振荡 23、31、43、59 次，约 4.9、6.6、9.1、12.6 Hz；幅度分别 0.085、0.065、0.05、0.035 rad，叠加峰值约 0.235 rad（13.5°）。
- 位置也抖动：横向由 29、47、61 次振荡组成，幅度 4、3、2 px；纵向由 37、53 次组成，幅度 2.4、1.8 px。每个频率在 4.7 秒内都是整数周期，循环能接合；彼此无公因数，所以不显规律。
- 珊瑚色铃舌半径 13 px，反向摆动，角度按铃铛角度×70 px 转换；两侧半径 86、110 px、线宽 6 px 的白色振动弧持续闪动。

**适用用途：** 用于通知、来电等需要抓眼的内容，也可营造不安定的手持感。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("04").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/124.txt`（SHA-256 `b7eae1d10837f01aad1711b441d8da97bdb8dae3d736b7578c2d7044f4abaa06`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:125 · 脉冲动画

**上游检索名：** `125` / `pulse`（Pulse）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 珊瑚色心形像心跳一样搏动，每次双拍并向外扩散圆环。

**逐项动作规格：**
- 4.7 秒内跳动 4 次，每 1.175 秒一次，每次包含 lub-dub 双拍。缩放为 1+0.26G(中心 0.2 秒、宽 0.065)+0.15G(中心 0.44 秒、宽 0.07)，G=e^(−((t−中心)/宽度)²)，表现迅速鼓起后立即回落。
- 两道心形轮廓分别于 0.16、0.40 秒向外扩散；在 0.8 秒内以三次 ease-out 从 1.2 扩至 2.4 倍。透明度由 0.75 降至 0（第二道从 60% 开始），线宽从 8.5 降至 1.5 px。

**适用用途：** 用于点赞、录制或直播状态，以及希望被按下的按钮，让它显得有生命力。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("05").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/125.txt`（SHA-256 `101788d4b616dba1fa1d6983341e519a0f4c0f93f22e0d6925b03ecf9f78c72e`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:126 · 运动路径

**上游检索名：** `126` / `motion-path`（Motion path）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 纸飞机沿虚线路径飞行、随方向转动，并在途中绕出一个圈。

**逐项动作规格：**
- 4.7 秒内从左侧画外飞至右侧画外，路径参数 θ=−π→π：x=270+112θ−150sinθ，y=106−74cosθ，在顶部中央形成环圈。θ 与时间成比例推进，因此路径速度不均，绕圈处看起来较慢。
- 纸飞机朝向路径切线：角度 atan2(74sinθ,112−150cosθ)。
- 完整路径预先显示为虚线，线宽 6、虚段/间隔 2/15；机后有 24 段薄荷色尾迹，每段相差 0.03 弧度，越往后越细、越淡。

**适用用途：** 用于让物体沿明确路线运动，例如飞机、汽车或地图旅程。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("06").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/126.txt`（SHA-256 `160d86886ccf4804acc651ccac2b8129f81016cab7595a4bd487ad59eeb657c9`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:127 · 往返循环

**上游检索名：** `127` / `ping-pong-loop`（Ping-pong loop）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 方块先走到一端，再沿原路反向返回，持续来回循环。

**逐项动作规格：**
- 每 4.7 秒往返一次：前 2.35 秒正向、后 2.35 秒以同一动作倒放，进度 g 线性地 0→1→0。
- 薄荷色圆角方块边长 48 px、圆角 13，从 x=92 移至 447；沿 3 个高度 62|sin(3πg)| 的拱形跳跃，并随 g 转一整圈。
- 4 个残影彼此相差 0.045 秒，不透明度 0.1–0.4。下方蓝色播放条在正向显示 Play、珊瑚色反向条显示 Reverse；进度与滑块都随 g 移动，两端转折点有竖线标记。

**适用用途：** 用于加载等待、待机动画或需要无切口往返的动作。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("07").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/127.txt`（SHA-256 `a2b92ed333b1d406e2cdcbfc50dd68474bba06c380648240a7845da0af647ab6`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:128 · 定格动画风格

**上游检索名：** `128` / `stop-motion-style`（Stop-motion style）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 星形以约 8 帧/秒的顿挫节奏跳过画面，每帧位置略有偏差。

**逐项动作规格：**
- 4.7 秒共 38 帧（约每秒 8 帧，每帧停留约 0.124 秒）；只绘制这些离散帧，中间不补画。黄色星半径 38 px，从 x=−44 跳至 583，沿 3 个高度 54|sin(3πt)| 的拱线移动并转两圈。
- 每帧使用固定随机偏差：横向 ±5 px、纵向 ±4.5 px、旋转 ±0.15 rad、尺寸 ±5%。之前两帧以 0.28 和 0.12 透明度保留，像逐格动画的洋葱皮。
- 上下有各高 26 px 的黑色胶片条和齿孔，并标示每秒帧数。

**适用用途：** 用于手工、黏土或拼贴质感，避免动作过于顺滑。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("08").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/128.txt`（SHA-256 `cdc7a09a0352e953b78f35a20fde813c8bdbd2417c5c6c1500e5cab5a93ba2e7`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:129 · 文字乱码效果

**上游检索名：** `129` / `text-scramble`（Text scramble）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 随机字符不断变化，随后从左到右逐位锁定为正确单词。

**逐项动作规格：**
- 前半周期显示 HELLO，后半周期显示 WORLD；每词 5 个等宽字母、字号 92 px。尚未锁定的字槽从 A–Z（不含 I、O）、0–9 和 #$%&@? 中抽取随机字符，每 4.7 秒变 76 次（约每 0.062 秒），薄荷色、透明度 75%。
- 字槽按从左至右锁定，第 i 格于 0.45+0.18i 秒锁定（末格 1.17 秒）；新锁定字先为黄色 0.22 秒，再变白，并按 1+0.2e^(−14t) 缩放落定。
- 1.85 秒起字槽从右到左恢复随机，第 i 格时点为 1.85+0.08×(4−i) 秒。每格下方有状态条：已锁定为蓝色、下一个将锁定的为黄色、其余藏青。

**适用用途：** 用于用解码、黑客或科技感引入标题、数字或代号。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("09").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/129.txt`（SHA-256 `bf6016daeeae5294448e155c9a8017b0c8cb6712843e60f2aecea562b4d25f6f`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:130 · 波浪文字

**上游检索名：** `130` / `wave-text`（Wave text）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** WAVE TEXT 的字母依次上下起伏，像一阵波浪掠过。

**逐项动作规格：**
- 文字 WAVE TEXT，粗体 70 px、字距 4 px；4.7 秒中有 3 个波浪周期，每次 1.567 秒。第 i 个字母的纵向偏移为 −28sin(φ−0.62i)，φ=2π×3×时间÷4.7，故每个字母比前一字母迟 0.62 rad。
- 上升字母按 1+0.06s 纵向拉伸；颜色从白色向黄色变化，s 是限在 0–1 的正弦值。每个字母下方的椭圆阴影随其升高而缩小。

**适用用途：** 用于标志、短标题或配合音乐的字幕，增加趣味和节奏。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("10").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/130.txt`（SHA-256 `e94436dadae4bc0a6d19a0e52da1b6c425ba795a2f05110ef51ee030a405e5f0`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:131 · 路径文字

**上游检索名：** `131` / `text-on-a-path`（Text on a path）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 一行文字沿波浪线流动，每个字母随曲线方向转动。

**逐项动作规格：**
- 路径为 y=118+42sin(2πx/330+0.6)，x 从 −70 到 609；路径下方 6 px 有藏青虚线，虚段/间隔 14/10、线宽 5。
- 粗体 42 px、字距 2 px 的 ALONG THE LINE • 重复排列；每个字符按路径弧长定位，并旋转至曲线方向。
- 文字每 4.7 秒沿路径前进一个完整字符串的长度，循环接缝对齐。字母白色，圆点黄色。

**适用用途：** 用于让文字沿标志轮廓、道路、河流或波浪运行，或形成循环文字带。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("11").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/131.txt`（SHA-256 `93ed1fbd310164e80cf164837c871715e967242f926df1882e69ed46359eada8`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:132 · 可变字体动画

**上游检索名：** `132` / `variable-font-animation`（Variable font animation）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 同一个词在细字与粗字之间平滑变化；下方滑杆同步显示字重。

**逐项动作规格：**
- 系统字体 MOTION，112 px、字距 2 px；4.7 秒内往返两次，进度 v=0.5−0.5cos(2π×2×时间÷4.7)，两端自然减速。字重直接设为 round(100+800v)，即 100–900。
- 下方滑杆从 (112,180) 延伸至 (427,180)，左标 thin、右标 bold；黄圆滑块半径 14 px 随 v 移动，当前字重显示在滑块上方。

**适用用途：** 用于通过字形粗细表达强弱或情绪，适合标题、标志或单个词语。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("12").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/132.txt`（SHA-256 `2ca0d022c6e70e5e863ad8659d0556131347acdd3dc0d3366004ffa876f73304`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:133 · 文字遮罩

**上游检索名：** `133` / `text-mask`（Text mask）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 粗体字被镂空，移动的海景只在字母内部可见；周期将结束时整幅画面显现。

**逐项动作规格：**
- 文字 OCEAN，系统字体、字重 900、字距 2 px；字号从 172 px 开始，每次减 2 px，直到单词宽度不超过 500 px。
- 字内海景持续移动：珊瑚色天空、上下浮动 ±6 px 的黄太阳、y=116 以下蓝海；4 条白色波浪线在 4.7 秒内交替方向漂移 240 px，帆船每 4.7 秒横穿一次，云移动 60 px。
- 先在离屏画布绘制文字，再以 source-in 将场景合成到文字形状内，并为字母加 4 px 白描边。字外场景起初仅 12% 不透明度，3.45–3.85 秒平滑升至 100%，4.25–4.65 秒回到 12%。

**适用用途：** 用于把照片或影像嵌进标题、品牌名，让文字与画面成为一体。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("13").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/133.txt`（SHA-256 `12d146a3438aec34716a3d99eb4bf0debdd95b5a6ec25eb01d6d38a4d094a66f`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:134 · 中继器

**上游检索名：** `134` / `repeater`（Repeater）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 一个形状绕圆周复制成多个，副本的旋转和脉动略有错开。

**逐项动作规格：**
- 圆角条尺寸 24×60 px、圆角 12，以画面中心为圆心，在半径 58 px 的圆周上最多复制 12 个；每个都向外旋转（角度再加 90°）。
- 数量在 0.35–1.7 秒从 1 增至 12，3.6–4.45 秒从 12 减到 1，使用二次 ease-in-out。新增副本以三次 ease-out 从上一格滑到自己的位置，沿环多转 30°。
- 整个环每 4.7 秒转一圈。各副本每周期脉动两次，尺寸在 1±0.22 间变化；每个副本比前一个延迟 0.55 rad，形成环状波纹。颜色依次蓝、珊瑚、黄、薄荷，原始形状有白描边；右上角显示 ×N 计数。

**适用用途：** 用于由一个形状重复构成的加载动画、背景纹样、花朵或光芒。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("14").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/134.txt`（SHA-256 `0d7c61d93b940233c3ce273abbbd8fc5fc88369ea5a18133f130b89c206d524e`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:135 · 万花筒

**上游检索名：** `135` / `kaleidoscope`（Kaleidoscope）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 八向对称图案从中心旋转展开，像万花筒。

**逐项动作规格：**
- 以中心为基点划分 8 个 45°扇区，隔一个扇区镜像绘制，形成八重镜像对称。
- 单个扇区有 13 个圆、菱形、三角形，4 种颜色，使用固定随机种子；它们从中心向外移动到半径 300 px，每 4.7 秒走完一圈再回到中心。形状尺寸随距离按 (5+0.1r)×0.7–1.4 增长，每像素旋转 0.02 rad；起始 30 px 内淡入，末尾 70 px 淡出，并每 4.7 秒摆动 ±0.08 rad。
- 整体图案每 4.7 秒旋转 90°，正好转过两个扇区，循环无缝。中心有白色八角星，半径 20±4 px，每 4.7 秒脉动两次。

**适用用途：** 用于音乐视频、现场背景或梦幻场景切换，让图案可以持续循环。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("15").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/135.txt`（SHA-256 `3348ecef97f8fb0c4a0833bea2762236f3c8f5b9c2745be469bac9af07cdb8f0`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:136 · 线条抖动

**上游检索名：** `136` / `line-boil`（Line boil）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 手绘线稿本身静止，但每隔几帧轻轻抖动。

**逐项动作规格：**
- 静态线稿包含黄星、白云、薄荷色闪光短线和淡淡地面线；线宽 6–8 px、圆头。
- 4.7 秒内重画 47 次（约每 0.1 秒一帧）；每个点每次采用固定随机偏移，x、y 最大各 ±3.5 px。
- 每条线先拆成相隔 6–13 px 的点（云轮廓约 96 点），再沿相邻点中点绘制二次曲线，形成手绘逐帧抖线。偏移由帧号和点号的哈希决定，所以同一帧始终相同。

**适用用途：** 用于手绘插画、图标或字形，让静帧也有手工绘制感。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("16").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/136.txt`（SHA-256 `334c4124dfe4fbc9553ba603e03cd89fe88f1b763e9043e8e926314c8db8f29e`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:137 · 推入转场

**上游检索名：** `137` / `push-transition`（Push transition）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 下一场景从侧面滑入，同时把当前场景向外推走。

**逐项动作规格：**
- 海景→山景→海景，每段 2.35 秒；每半段在 0.45–1.6 秒用三次 ease-in-out 完成切换。
- 两幅场景始终紧贴并一起移动完整画宽 539 px；没有重叠，也没有淡化。海→山时向左移动（下一场景从右进入），山→海时向右移动。
- 两场景交界处有 6 px 藏青竖线。

**适用用途：** 用于连续推进幻灯片、照片或步骤，让切换看起来仍在前进。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("17").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/137.txt`（SHA-256 `d57cf561b46b3c4d9e9eb39bf1242e98e8ff9d81f0bc4a7d74dd087c34943e2d`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:138 · 百叶窗转场

**上游检索名：** `138` / `blinds-transition`（Blinds transition）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 一排窄条间隙逐渐张开，直到完整显露下一场景。

**逐项动作规格：**
- 白天→夜晚→白天，每段 2.35 秒；画面分为 7 条水平带，每带约 208÷7=29.7 px 高。
- 0.4–1.65 秒内用二次 ease-in-out 同时打开全部条带：每条带从自身顶边向下逐渐显露下一场景，开口从 0 扩到整条高度。
- 原场景留在下层，两幅都不移动。

**适用用途：** 用于清楚切换日夜、前后等两幅场景，也可做复古风过场。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("18").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/138.txt`（SHA-256 `4c8187f2102f1005d7d9158ec933a5d9dc42dac29a4b9aff34b94bec51d7c70a`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:139 · 立方体转场

**上游检索名：** `139` / `cube-transition`（Cube transition）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 像转动立方体一样，正面转开，下一面绕到前方。

**逐项动作规格：**
- A 面为珊瑚色底字母 A，B 面为薄荷色底字母 B；每面 250×146 px，A→B→A，各 2.35 秒。
- 0.45–1.6 秒绕立方体中心竖轴三次 ease-in-out 转 0→90°，深度等于面宽 250 px。
- 相机距离 820 px；两面均拆成 2 px 宽的竖切片，按透视系数分别缩放和定位。转离的面按 0.55sinφ 最高压暗 55%；转入面初始压暗 55%，再按 0.55cosφ 变亮。地面阴影随可见面宽变化。

**适用用途：** 用于依次展示产品、方案或屏幕，并带出纵深。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("19").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/139.txt`（SHA-256 `bd7d033cf84d4bb4b0cdf7b3febd0fc2326daa46407c5b49d0be4577d6b98244`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:140 · 翻页转场

**上游检索名：** `140` / `page-curl`（Page curl）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 书页从角落掀起并翻折，露出下面的下一页。

**逐项动作规格：**
- 白色第 1 页→奶油色第 2 页→第 1 页，每段 2.35 秒。翻页从右下角开始，于 0.35–1.75 秒（1.4 秒）二次 ease-in-out 完成。
- 折线从角落沿单位方向 (−1,−0.42) 移动 0→600 px。折线外区域沿折线镜像形成翻页折片，背面浅灰或米色，配 14 px 模糊、偏移 (4,4) 的投影和 2 px 白边。
- 纸张抬起处露出下一页，折线旁有宽 50 px 的渐变阴影。

**适用用途：** 用于书籍、目录、相册或章节切换，适合纸张质感和阅读场景。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("20").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/140.txt`（SHA-256 `d90bed0afe7e78919f13ea11bf1642f75a5836e1816037f3ef8f1d087f64267d`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:141 · 像素化转场

**上游检索名：** `141` / `pixelate`（Pixelate）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 画面逐渐变成越来越粗的像素块，在最粗处切换场景，再逐渐变清晰。

**逐项动作规格：**
- 田野→城市→田野，每段 2.35 秒。0.2–1.9 秒（1.7 秒）内块尺寸按 1、2、3、4、6、8、11、15、20、27、36 px 逐步增大再缩小，1.05 秒处最粗。
- 前半段显示旧场景，后半段显示新场景；切换发生在最大像素块处。
- 实现方式：把画面缩小到原宽÷块尺寸（缩小时启用平滑），再放回原尺寸（放大时关闭平滑）。

**适用用途：** 用于游戏、复古或数字风场景转换，也可借切换把内容模糊带走。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("21").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/141.txt`（SHA-256 `0f0c64783da154833abfecc7132a7cfb51b348f51bbf1c81b799d75b4d7756ab`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:142 · 玻璃碎裂

**上游检索名：** `142` / `shatter`（Shatter）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 画面像玻璃一样裂开，碎片飞出，露出下一场景。

**逐项动作规格：**
- 山景→白天场景→山景，每段 2.35 秒；撞击中心 (304,92)。0.3–0.65 秒按由近到远绘制 13 条放射裂线和半径约 40、98、175（各 ±15%）的裂环，以三次 ease-out 扩至 420 px；中心白色闪光星在 0.6 秒前淡出。
- 0.82 秒玻璃破碎：从旧场景切出 52 片碎片（13 条×4 圈），以 220–480 px/s 向外飞，垂直速度乘 0.7 并可额外向上 120 px；重力 1300 px/s²，旋转速度 ±4 rad/s，1 秒内最多缩小 35%。
- 外圈每晚 0.035 秒，并可额外随机延迟最多 0.03 秒离场；每片碎片开始移动后 0.55–1.0 秒淡出。碎片有 2.5 px 白边，下一场景位于其下方。

**适用用途：** 用于撞击、破裂或反转前后，给标题或结果一个强烈落点。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("22").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/142.txt`（SHA-256 `6c1e11ed4c8e1d219bc4dfc2bd780301b2be3d4a418159dbb2edd73bf69cdb74`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:143 · 爆炸图

**上游检索名：** `143` / `exploded-view`（Exploded view）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 手机分成多个层次以展示内部结构，再重新组装。

**逐项动作规格：**
- 等距手机由后盖、电池、电路板、屏幕 4 层组成；每层是平面圆角板，坐标轴按 0.85 缩放并向两侧倾斜 30°，侧面厚 6 px。
- 0.45 秒起依次拆层，每层耗时 0.75 秒；上一层之后 0.08 秒再动，使用 backOut（s=1.3）。从底部起第 i 层（i=0–3）高度为 7i+30i×进度，因此后盖不移动。
- 分开时每层每 4.7 秒上下浮动两次，幅度 ±3 px；点状引导线连接角点，右侧逐条出现名称标签与引线（示例为日语）。
- 3.25 秒起重新组装，每层 0.7 秒，从顶层开始，间隔 0.07 秒，以三次 ease-in-out 收拢。

**适用用途：** 用于一眼说明产品内部、工作方式或组成材料。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("23").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/143.txt`（SHA-256 `0e29b3c170e75b389ece515d3e95be3efac3f7b74068d830a4b1887de35e5450`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:motion2:144 · 分屏

**上游检索名：** `144` / `split-screen`（Split screen）；包：`motion2`（动态图形（第 2 弹））。

**可见变化：** 一幅全屏场景先拆成两个面板，再拆成三个面板，每格播放自己的场景。

**逐项动作规格：**
- 全屏海景在 0.45–0.95 秒分成两栏，分隔位置从 539 移到 269.5；1.4–1.9 秒再分成三栏，分隔线在画宽的 1/3、2/3；3.75–4.4 秒合回一幅。全程三次 ease-in-out。
- 海景、城市、田野三幅内容分别居中并裁切在自己的面板内，持续各自运动：海浪和帆船；城市窗灯每 4.7 秒切换 8 次；风车每 4.7 秒转 2 圈。
- 面板之间用 6 px 白色分隔线。

**适用用途：** 用于对照、同时呈现多个事件，或并排展示不同人物和地点，例如前后对比或多种选项。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/motion2.mjs)，调用 `createElement("24").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/144.txt`（SHA-256 `362c110ce1d6b401e8b523e85549201cd7feb3ba121fde28c9f9582a9a97953d`），共享 kit `api/v1/kit/motion2.js`（SHA-256 `5021eaa0f7685244833b96ef4045eb36429174ffccb9c36fef375567e35ecd93`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:145 · 滚动时间轴

**上游检索名：** `145` / `timeline-on-scroll`（Timeline on scroll）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 页面向下滚时，橙色时间线向下延伸；经过的圆点填色，年份和事件从右侧滑入；上滚时反向。

**逐项动作规格：**
- 511×168 px 浏览器视口；0.3–2.3 秒滚动 0→190 px，3.0–4.3 秒回滚至 0，采用三次 ease-in-out。时间线位于 x=168，橙线在 3 px 灰色轨道上延长；线尖始终位于 scroll+126 px，即距视口顶 126 px、距底 42 px。
- 5 个事件点位于页面 y=72、126、180、234、288 px（2018–2026）；白点半径 7.5 px、描边宽 2.5 px。
- 线尖经过某点后再增长 22 px 的期间，以三次 ease-out 将圆环变橙、内点由半径 0 长至 4 px，同时橙色 18 px 年份与 15 px 事件说明从右侧滑入 16 px 并淡入。上滚按同一公式缩回时间线、隐藏内容；右侧滚动条滑块跟随。

**适用用途：** 用于公司历史、里程碑或按时间顺序阅读的步骤过程。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("01").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/145.txt`（SHA-256 `eb02565552df0f97a9713fa5b8b9caf81d71384702f587a4dd8a621b497f9746`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:146 · 滚动文字显现

**上游检索名：** `146` / `scroll-text-reveal`（Scroll text reveal）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 浅灰色标题随页面滚动从左上起逐字变深；上滚时从末字开始淡回。

**逐项动作规格：**
- 511×168 px 视口；滚动进度 p 在 0.3–2.6 秒从 0 到 1，3.2–4.4 秒回到 0，采用三次 ease-in-out；页面向上移动 p×40 px。
- 三行标题共 24 字，27 px、字重 800、行高 38 px；初始为浅灰 #D6DBE4。第 n 字（从 0 计）变深量为 clamp(p×26−n)，每个字占进度 1/26 才变到文本色 #1C2333，随滚动依次显现。
- 上滚时用同一公式从最后一个字反向淡出；正文条和滚动条滑块随页面移动。

**适用用途：** 用于概念或创始人短句等需要读者慢慢读完的表达。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("02").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/146.txt`（SHA-256 `c6f66af4a52d037274f14c87cf8ce2a586685797119acf5cdb87e7c144e72084`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:147 · 堆叠卡片

**上游检索名：** `147` / `stacking-cards`（Stacking cards）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 滚动时下一张卡从下方升起并叠在上一张上；下面的卡片略缩小、变暗。

**逐项动作规格：**
- 511×168 px 视口；滚动步进 s 在 0.3–1.1 秒从 0 到 1、1.6–2.4 秒到 2、3.2–4.4 秒回到 0，使用三次 ease-in-out。3 张卡各 371×124 px、圆角 12，页面上相隔 170 px；s 每增加 1，卡片向上移 170 px。
- 卡片分别停在距顶 14、26、38 px 位置（相当于 sticky，每张卡的 top 偏移比上一张大 12 px），新卡盖住前一张。每被盖住一层，下方卡片围绕其上边中点缩小 4.5%（两层时 9%），再叠藏青遮罩使其最多变暗 16%。
- 卡片阴影模糊 14 px、向上偏 2 px；滚动条滑块跟随页面。

**适用用途：** 用于按顺序逐张呈现步骤、功能或方案。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("03").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/147.txt`（SHA-256 `c2884320669d21ec691eec155e5ac535e6c10e3d87625a471a6071ced86ba769`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:148 · 滚动切换背景色

**上游检索名：** `148` / `background-color-change`（Background color change on scroll）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 滚入新章节时整页背景从奶油色融到藏青、再变浅蓝；深色底上文字转白。

**逐项动作规格：**
- 511×168 px 视口，3 个区块各高 168 px。0.3–1.2 秒滚动 0→168 px，1.8–2.7 秒 168→336 px，3.3–4.4 秒回到 0，采用三次 ease-in-out。
- 全页面背景色依次为晨间 #FFEBD9、夜晚 #1E2A4A、节庆 #DDE6FF；在越过章节边界时以单一底色混合。每次向下一章的滚动进度在 5%–95% 间以二次 ease-in-out 插值，驱动量来自滚动位置而非时间。
- 接近夜色时，标题从藏青转白，正文条从米色转蓝灰；章节标记（01 MORNING…）保持橙色。各章的太阳、月亮与星星、山景照片随页面滚动；滚动条滑块跟随。

**适用用途：** 用于每章有独立情绪的故事页，或对照白昼与夜晚、季节等场景。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("04").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/148.txt`（SHA-256 `31397a32f2a1afe1f4a617b4c855ef6ace7709beb094d6ed4efbe99b510df5ba`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:149 · 滚动隐藏页头

**上游检索名：** `149` / `hide-on-scroll-header`（Hide-on-scroll header）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 向下滚时页眉上滑隐藏以腾出空间；只要稍微向上滚，页眉就立即回来。

**逐项动作规格：**
- 511×168 px 视口，页眉高 34 px、固定在顶部。滚动序列：0→170 px（0.3–1.1 秒向下）、170→100（1.5–1.9 秒向上）、100→230（2.4–2.9 秒向下）、230→0（3.3–4.3 秒向上），均用三次 ease-in-out。
- 最近一次移动向下时隐藏、向上时显示；页面顶部 34 px 范围内始终显示。隐藏和显示均把页眉向上移动 36 px，耗时 0.3 秒、二次 ease-in-out，类似 transform:translateY 过渡。
- 滚动时页眉下有 12 px 阴影，透明度在最初 30 px 滚动中由 0 升至 0.14；滚动条滑块跟随。
- 上述下滚与回滚序列每 4.7 秒完整完成一次；9.4 秒源周期内重复两次。

**适用用途：** 用于手机等空间有限的页面，滚动时让正文多占空间、上滚即可找回菜单。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("05").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/149.txt`（SHA-256 `f0c6d2e0ca86f581b73c4d324b4a6d21433cdcca605f106ea940f628f8373fae`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:150 · 滚动监听

**上游检索名：** `150` / `scrollspy`（Scrollspy）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 文章滚动时，目录中当前章节变亮；下一标题出现后高亮移到新章节。

**逐项动作规格：**
- 511×168 px 视口；左侧是 150 px 宽、4 项目录，右侧文章标题彼此相隔 100 px。滚动 0→100（0.3–0.9 秒）→200（1.35–1.95 秒）→300（2.4–3.0 秒），再于 3.5–4.4 秒回到 0，均用三次 ease-in-out。
- 当前项取顶边已越过 scroll+40 px 的最后一个标题，也就是距视口顶 40 px 的触发线。
- 项变化时在 0.25 秒内三次 ease-out：高亮为浅橙底 126×26 px、圆角 6，左侧加宽 4 px 橙条，文字从灰变为橙色粗体；上一项同步复原。目录固定不动，只有文章滚动，滚动条滑块跟随。

**适用用途：** 用于长文章、文档或常见问题，提示读者当前处于全文哪个位置。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("06").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/150.txt`（SHA-256 `762b3d5aff709b1a794f0cee901ba054a2d4fbcd572ad9ecde6393943c543ab5`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:151 · 回到顶部按钮

**上游检索名：** `151` / `back-to-top-button`（Back-to-top button）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 向下滚后右下角出现圆形回顶箭头；点击后页面直接回到顶部。

**逐项动作规格：**
- 511×168 px 视口；0.2–1.7 秒用三次 ease-in-out 滚动 0→300 px 至页面底部。按钮为橙圆，中心 (472,138)、半径 19 px，白色上箭头、阴影模糊 10 px。
- 滚动 80–140 px 期间，按钮以三次 ease-out 淡入并上升 10 px。2.6 秒点击按钮，2.66–3.26 秒（0.6 秒）以三次 ease-in-out 从 300 滚至 0；悬停时按钮在 0.2 秒内从 #FF5A2C 加深为 #D9431C。
- 滚动降到 80 px 以下时，按钮按同一显隐公式淡出。

**适用用途：** 用于博客、长落地页或产品列表等长页面，方便读者回到顶部菜单。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("07").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/151.txt`（SHA-256 `87d7bc234ff23682c5e0f72593c80fee939f081f522181442ee0a6cd4c15aaa3`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:152 · 滚动放大

**上游检索名：** `152` / `zoom-on-scroll`（Zoom on scroll）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 随页面滚动，中间小照片扩大至铺满视口，周边文字淡出，标题浮现在照片上。

**逐项动作规格：**
- 511×168 px 视口；滚动进度 p 在 0.3–2.3 秒从 0 到 1，3.0–4.4 秒回到 0，采用三次 ease-in-out。
- 照片框从中部 x=178、y=58 的 155×90 px、圆角 8，按 p 同比例变为全视口 511×168 px、无圆角；位置、宽、高和圆角都随 p 改变。
- p 从 0 到 0.45 时，周围标题和文字按 1−2.2p 淡出；p 从 0.7 到 1 时，26 px 白色标题（字距 2 px）在照片中央淡入。滚动条滑块跟随页面。

**适用用途：** 用于旅行、房地产或品牌网站，把访客带入一张照片。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("08").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/152.txt`（SHA-256 `c7e78327959fecab7af335da0a679a6c75fac482d39a30c56bdb4bd32c447d5c`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:153 · 3D 倾斜

**上游检索名：** `153` / `3d-tilt`（3D tilt on hover）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 光标移动经过卡片时，卡片按深度倾斜并有眩光掠过；光标离开后恢复平面。

**逐项动作规格：**
- 511×168 px 视口中央放 220×132 px、圆角 14 的卡片。光标在卡片四角附近每 0.6 秒走一点再离开。
- 把光标相对卡片中心的偏移分别除以宽、高的一半，得到 −1…1；横向偏移×0.32 rad（约 18°）作为绕 Y 轴旋转，纵向偏移×0.32 rad 作为绕 X 轴旋转。光标下方的侧面向远处倾。
- 透视观察距离 520 px，较近部分画得更大。悬停时倾斜和眩光在 0.4 秒内三次 ease-out 增强；离开后以相同时间恢复平面。眩光为光标处半径 130 px 的白色径向光，中心不透明度 0.42；地面阴影反向移动最多 10 px。

**适用用途：** 用于会员卡、产品包装或价格卡，让它们看起来像可拿起的物件。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("09").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/153.txt`（SHA-256 `2a5408656108212a00e3863bd872a590384af1b5ec95e8122f75af9320893782`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:154 · 聚光灯悬停

**上游检索名：** `154` / `spotlight-hover`（Spotlight hover）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 光标在深色卡片间移动时，只有周围圆形区域被照亮，附近卡片边缘也泛光。

**逐项动作规格：**
- 511×168 px 深色页面 #121828，含 3 张深色卡片，尺寸 147×116 px、圆角 10。光标沿 8 字形移动：x=255+190sin(2πt/4.7)，y=92+40sin(4πt/4.7)。
- 每张卡片内部以光标为中心显示半径 115 px 的白色径向光，中心不透明度 0.34、向外降至 0；光线被裁切在卡片内，不溢出边界。
- 卡片边框宽 2 px，按距光标的距离叠加半径 120 px 的橙色径向光 rgb(255,122,82)；远端只保留 8% 白色底线。光线没有滞后，位置始终与光标完全重合（示例用 CSS 变量设置渐变中心）。
- 光标每 4.7 秒完成一次 8 字轨迹；在 9.4 秒源周期内重复两次。

**适用用途：** 用于深色主题中的功能卡或价格卡，让光标所在位置突出。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("10").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/154.txt`（SHA-256 `3a9f7cd6621549fc3d5bff5d5c176e3e8127f1f3773fd8bb39a776a68e947c29`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:155 · 悬停切换图片

**上游检索名：** `155` / `image-swap-on-hover`（Image swap on hover）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 光标停在产品卡上时，T 恤正面照与背面照交叉淡化；离开后恢复正面。

**逐项动作规格：**
- 511×168 px 视口有两张产品卡；图片框 196×112 px、圆角 8，下方为名称和价格。光标在左卡、右卡各停约 1.3 秒。
- 悬停时在 0.3 秒内用二次 ease-in-out 从胸前小点的正面照交叉淡化到背后大星星的背面照；离开后用同样 0.3 秒淡回。
- 图片下方有两个半径 3 px 圆点标示当前视图，当前视图点为深色。整张卡（包含名称区域）都是悬停区；图片框、名称和价格位置不动。

**适用用途：** 用于电商产品网格中不离开列表就查看另一角度或上身效果。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("11").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/155.txt`（SHA-256 `2be40b37449ae4d1ac87385634cd19e2bf107e626783e7158278fb754fbc0f67`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:156 · 悬停文字翻滚

**上游检索名：** `156` / `text-roll-on-hover`（Text roll on hover）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 光标悬停菜单词时，字母逐个向上滚出，同一词的橙色副本从下方滚入；离开后反向复位。

**逐项动作规格：**
- 511×168 px 视口有 WORKS、ABOUT、CONTACT 三个菜单词，30 px、字重 800、字距 1 px；光标从左到右各停约 0.85 秒。
- 每个词下方 40 px 有橙色副本；两组都裁切在高 39 px 的盒内（overflow:hidden）。悬停后各字母相隔 0.035 秒，在 0.36 秒内三次 ease-in-out 上移 40 px 离开，橙色副本同时升入位置。
- 离开时各字母按相同间隔和时长向下滚回。

**适用用途：** 用于页眉菜单或按钮，为短文字链接增加触感反馈。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("12").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/156.txt`（SHA-256 `2f87ce49aa3c7dd7d68513beb39051e456edaae7c09a7962b38a6dff1ba82e3f`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:157 · 悬停图片预览

**上游检索名：** `157` / `hover-image-reveal`（Hover image reveal）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 光标停在纯文字列表某行时，该行照片在光标旁淡入并跟随。

**逐项动作规格：**
- 511×168 px 视口内有 4 行纯文字列表，每行高 39 px、名称 17 px。光标逐行向下移动，每行约停 1 秒。
- 悬停行名称在 0.25 秒内三次 ease-out 向右移 8 px，名称与右侧箭头变橙；离开时同样用 0.25 秒复位。
- 对应照片 132×84 px、圆角 6、有投影，出现在光标右侧 26 px、略高于光标的位置，并始终限制在视口垂直范围内。照片在同样 0.25 秒内从透明、0.85 倍放大至全不透明、1 倍大小；无滞后跟随光标。移至下一行时旧照淡出、新照淡入。

**适用用途：** 用于保持轻量、纯文字的作品、项目或房产列表，同时让用户查看感兴趣行的照片。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("13").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/157.txt`（SHA-256 `6f9548fcd6dda161a4184a17f5998f210e708ad9d267be10cdc822fe842e62e0`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:158 · 浮动标签

**上游检索名：** `158` / `floating-label`（Floating label）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 点击字段后标签缩小并移到上边框，让出输入空间；字段为空且失焦时标签回到框内。

**逐项动作规格：**
- 511×168 px 视口有 300×46 px、圆角 8 的输入框，标签为 15 px 日语邮件地址。0.65 秒点击框，3.95 秒点击外部取消焦点。
- 有焦点或字段非空时，标签在 0.24 秒三次 ease-out 从 15 缩到 11.5 px，并从框中央移到上边框；左内边距由 14 减至 10 px，标签背后用白色遮住边框。
- 聚焦时边框在 0.15 秒内从灰转橙、线宽 1.5→2.2 px，标签也变橙。1.0 秒起每 0.075 秒输入一个字符形成 hello@example.com；3.2 秒起每 0.03 秒删一个。字段清空并失焦后，标签用同一 0.24 秒移回框内。输入时光标常亮，否则按 0.9 秒周期闪烁。

**适用用途：** 用于字段很多的表单，让标签一直可见而不额外占空间。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("14").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/158.txt`（SHA-256 `2f99030ca6a56749a69419129d716ada7072e598214ad709848e11c820baa247`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:159 · 实时校验

**上游检索名：** `159` / `inline-validation`（Inline validation）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 邮箱输入到一半时，字段变红并提示格式错误；完整后立即改为绿色勾和 OK。

**逐项动作规格：**
- 511×168 px 视口有 300×44 px、圆角 8 的邮箱框。0.45 秒点击，4.2 秒点击外部。0.75 秒起每 0.115 秒输入一字组成 hana@example.com（16 字），3.6 秒起每 0.03 秒逐字删除。
- 输入第 2 字直到最后一字之前均判为无效：0.15 秒三次 ease-out 内，边框转红 #E5383B、底色淡红 #FFF1F1，下面出现红色感叹号圆和 13 px 格式错误提示。最后一字输入后变有效，0.25 秒内边框转绿 #1E9E5A，右侧绿色圆（半径 11，GSAP elastic.out(1,0.3) 弹入）出现白勾，下方显示 OK。
- 聚焦时边框在 0.15 秒内从灰转藏青、宽 1.5→2.2 px；开始删除后错误或成功提示都消失。

**适用用途：** 用于注册或联系表单，让用户提交前注意到格式问题。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("15").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/159.txt`（SHA-256 `db344639edcbc0e37f5278eebcc3a40c452a1facdfcdcb401c13b44a6abd5b1c`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:160 · 加载按钮

**上游检索名：** `160` / `loading-button`（Loading button）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 点击提交后按钮缩成内含转圈的小圆；完成时展开成绿色 Done 按钮并出现勾。

**逐项动作规格：**
- 511×168 px 视口中央有橙色胶囊按钮 220×36 px，文字为日语“发送”。0.8 秒点击。0.85–1.15 秒用三次 ease-in-out 缩窄到 36 px 圆形；文字在缩窄前 1/3 淡出。
- 1.1–2.3 秒圆内白色加载环半径 10、线宽 3、弧度 0.7π，每 0.7 秒转一圈。2.25–2.45 秒颜色从橙转绿 #1E9E5A；白勾于 2.25–2.5 秒绘出。
- 2.45–2.8 秒按钮以三次 ease-in-out 从宽 36 展至 150 px，勾向左移 26 px，并显示日语“完成”。3.9–4.1 秒淡出，4.1–4.4 秒原“发送”按钮以三次 ease-out 上升 6 px 返回。

**适用用途：** 用于提交、购买或保存等需要短暂等待结果的按钮。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("16").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/160.txt`（SHA-256 `92b82c7a5d5e0a08bb17e8f33abb762fdd2d8b1407d36720e3f41d5a259da30e`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:161 · 视图过渡

**上游检索名：** `161` / `view-transition`（View transition (shared element)）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 点击列表照片后，同一张照片扩大到详情页顶部，其他内容切换为详情；返回时它缩回原位。

**逐项动作规格：**
- 511×168 px 视口内有 3 张 143×80 px、圆角 6 的照片列表。0.75 秒点击中间照片，3.05 秒点击详情页的返回列表。
- 前进时，0.85–1.45 秒（0.6 秒）以三次 ease-in-out 将被点照片连续移动、缩放到详情页顶部 479×94 px、圆角 8 的位置，整段始终是同一张照片。其余照片和标题在移动前 62% 内淡出；详情标题、正文和返回按钮在最后 40% 内淡入。移动过半时地址从 /works 改为 /works/02。
- 返回时，3.15–3.75 秒同一路径反向移动，照片回到列表原位。列表照与详情照共享 view-transition-name 时，View Transitions API 会呈现这一效果。

**适用用途：** 用于列表与详情之间往返的图库或商品页，让用户始终知道自己打开了哪一项。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("17").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/161.txt`（SHA-256 `18d387d43f3135147a022eb871a8e429bb186d38d9f10bc8887b70c2097b457b`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:162 · 灯箱

**上游检索名：** `162` / `lightbox`（Lightbox）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 点击缩略图后页面变暗，照片在中央放大；点右上 × 后缩回缩略图。

**逐项动作规格：**
- 511×168 px 视口有 4 张 108×72 px、圆角 6 缩略图。0.75 秒点击第 3 张，3.0 秒点击右上 ×。
- 打开时，0.85–1.3 秒（0.45 秒）以三次 ease-out 覆盖深色遮罩 rgb(14,18,28)，不透明度 0→0.82；被点缩略图扩大到中央 261×128 px。打开后半段，在照片下出现 3/4，左右出现上一张/下一张箭头，右上出现 ×。
- 关闭时，3.05–3.4 秒以三次 ease-in-out 反向执行相同缩放，照片回到原缩略图。

**适用用途：** 用于案例、作品集或商品图片，在不离开当前页面时放大查看。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("18").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/162.txt`（SHA-256 `579e845fad630ae0e481d2ed74992c54ab713d6141df221cf60845c5decec83c`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:163 · 图片热点

**上游检索名：** `163` / `hotspots`（Hotspots）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 产品照片上有白点脉动；点击某点后弹出相关提示，再点另一点就换成新的提示。

**逐项动作规格：**
- 511×168 px 视口左侧显示背包，右侧为名称和价格。照片上有两个圆点：白圈半径 8 px、带投影，中心橙点半径 4 px。
- 每 1.57 秒（4.7 秒的 1/3）从每个点扩散一圈白色圆环，线宽 2、半径 8→20、不透明度 0.75→0；每点两圈错开半个周期。
- 0.9 秒点击上方点，左侧出现 136×48 px、圆角 8 的提示框，尖角指向圆点；0.25 秒三次 ease-out 内上升 6 px。2.4 秒点击下方点，旧提示 0.25 秒淡出，新提示在下方点右侧打开；3.8 秒再点关闭。

**适用用途：** 用于在产品、平面图或地图的一张图内解释多个位置。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("19").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/163.txt`（SHA-256 `93b45a5f88d30de9e59df4c763bf87d3b03f0931fc0bed76a6e4bab201ae1e54`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:164 · 倒计时

**上游检索名：** `164` / `countdown-timer`（Countdown timer）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** “活动结束倒计时”下方时、分、秒每秒递减；只变化的数字会向上滚出，新数字从下方进入。

**逐项动作规格：**
- 511×168 px 视口有橙色渐变带、日语活动结束提示，及 6 个时分秒数字格；每格 34×50 px、圆角 6、数字 32 px。该示例每 9.4 秒运行一次。
- 从 02:15:04 开始，每秒倒数一次，共 9 次；0.4 秒起按秒变化，结束为 02:14:55。4.4 秒处从 02:15:00 进位为 02:14:59。
- 只有发生变化的格子做动画：旧数字在 0.32 秒内向上滑出，新数字从下方进入，采用三次 ease-in-out 并裁切在格内。9.4 秒时直接切回 02:15:04。

**适用用途：** 用于限时优惠或申请截止前，清楚显示剩余时间。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("20").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/164.txt`（SHA-256 `8765a670cfbfb38b10d8262e37338643352a6e21944765357ca9d6721a2c77de`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:165 · 动态形状分隔线

**上游检索名：** `165` / `animated-shape-divider`（Animated shape divider）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 蓝色区与白色区交界处，两层波浪形状持续缓慢摆动。

**逐项动作规格：**
- 511×168 px 视口上方为蓝色渐变区 #3B64E8→#8FA9F7，下方为白区；两条波浪叠在边界处。4.7 秒循环一次。
- 后层白浪透明度 0.45、中心 y=100，由波长 260 px、振幅 8 px 的正弦与波长 130 px、振幅 4 px 的正弦相加。
- 前层白浪中心 y=110，由波长 300 px、振幅 9 px 和波长 110 px、振幅 3.5 px 的正弦叠加，延伸到白色区。令相位 a=2πt/4.7，后浪使用 a+1 和 −2a，前浪使用 −a 和 2a+0.5；每条浪中的两组正弦相反方向移动，形状持续变化并每 4.7 秒回到起点。

**适用用途：** 用于海洋、夏季或儿童主题网站等希望区块边界柔和的地方。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("21").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/165.txt`（SHA-256 `51459356cfb79276056af15d6456a23db214aea5ab76ebfb2cfd12793b946808`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:166 · 点赞动画

**上游检索名：** `166` / `like-button-animation`（Like button animation）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 点击爱心后它填红并弹跳，周围粒子爆开，旁边计数加一；再点一次可撤销。

**逐项动作规格：**
- 511×168 px 视口有帖子卡片，描边心形线宽 2.4，右侧计数 128。0.9 秒点击、3.3 秒再点取消。
- 点击前 0.1 秒心形压缩到 0.78 倍；点击时填为红色 #F23D5C，在 0.12 秒三次 ease-out 内从 0.78 放大至 1.45 倍，再按 1+0.45e^(−7t)cos(15t) 回弹到 1 倍。
- 点击后 0.08–0.58 秒，红环半径 15→33、透明度 0.5→0；6 个红、黄、橙粒子沿 6 个方向从半径 24 飞至 37，同时淡出。计数在点击后 0.05–0.35 秒三次 ease-out 向上滑出 128，红色 129 从下方进入；撤销时滑回 128。
- 取消时心形回到空心，并在点击前后约 0.4 秒内下探至 0.84 倍后复原，不出现粒子。

**适用用途：** 用于点赞、收藏或保存按钮，清楚而愉悦地确认点击。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("22").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/166.txt`（SHA-256 `8bb41b99bacbd0b569cdfef2641a3f936557fd82f6b51124ff7019e475ad72c8`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:167 · 向下滚动提示

**上游检索名：** `167` / `scroll-down-cue`（Scroll-down cue）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 首屏下方的 SCROLL 字样、鼠标轮廓中的圆点和两侧箭头不断做向下运动。

**逐项动作规格：**
- 511×168 px 视口；首屏下方居中显示 SCROLL（11 px、字距 3 px）和鼠标轮廓（24×38 px、圆角 12、线宽 2.2）。每次动作 1.57 秒，4.7 秒内重复 3 次。
- 橙点尺寸 5×9 px，在每次动作前 70% 的时间内以二次 ease-in-out 下落 14 px；45%–75% 时淡出，并在下一轮回到顶部。
- 距左右各 40 px 有两组向下 V 形箭头，线宽 2.5；每侧两支相隔半个动作周期，向下漂 24 px，透明度按正弦在 0→0.8→0 变化。

**适用用途：** 用于首屏铺满画面、需要提示下方仍有内容时。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("23").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/167.txt`（SHA-256 `6781028c03d257fec8a0c0d0b2214a4f262a9a46bf0eea17a1afeca9f72993d5`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:lp2:168 · 背景视频

**上游检索名：** `168` / `background-video`（Background video）；包：`lp2`（落地页与网页效果（第 2 弹））。

**可见变化：** 首屏背景中的云和海浪持续移动，标题和按钮则固定在上层。

**逐项动作规格：**
- 511×168 px 视口由天空、云、山和海的视频背景填满；其上有固定的白色 28 px 标题和按钮。背景每 4.7 秒循环一次。
- 远云层每 170 px 重复，4.7 秒向右移 170 px（约 36 px/s）；近云层每 340 px 重复，同期右移 340 px（约 72 px/s）；山不动。海面有 y=118、130、146 的 3 道波，振幅 2.5–3 px、波长 90、60、120 px；中间一条反向移动并在 4.7 秒走过 2 个波长，其余两条向右各走 1 个波长。
- 为保证可读性，背景覆藏青层 12%，左侧 300 px 再叠渐变暗层（透明度 0.45→0）；标题带 10 px 模糊阴影。右下角有带暂停与静音状态的播放标记；真实网站中的视频须 autoplay、muted、loop、playsinline。

**适用用途：** 用于旅行、酒店、餐饮或招聘网站的首屏，让氛围与运动比单张照片表达更多。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/lp2.mjs)，调用 `createElement("24").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/168.txt`（SHA-256 `01fdf7764ffd0078f746a0d352352eb156e8b7ea399b092eb83befa2c7d230a7`），共享 kit `api/v1/kit/lp2.js`（SHA-256 `a8578754d880ffb098dc40355f7a80fa98e4b6f5442dd7d20c3a9fc9faa04793`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:169 · 垂直升降镜头

**上游检索名：** `169` / `pedestal`（Pedestal）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 相机直线上升但方向不变；地平线留在画面中央，人物与建筑向下滑。

**逐项动作规格：**
- 相机从 1.0 m 升到 3.2 m，只改变高度；偏航、俯仰和 330 px 焦距固定。0.5–3.4 秒用三次 ease-in-out 完成升高。
- 3.4–4.2 秒保持在终点高度；最后 0.5 秒（4.2–4.7 秒）交叉淡化回起始画面。
- 人物静止在前方 7 m，画面中向下滑并先露脚离开画面；塔在右侧 3.5 m、纵深 26 m。由于俯仰不变，地平线始终在画面中央；区别于升高时还向下俯仰的 #031 Crane up。
- 右上角读数为 ↕1.0m→↕3.2m。

**适用用途：** 用于平滑展示货架或建筑从底到顶，或在不俯仰时改变视线高度。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("01").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/169.txt`（SHA-256 `498d234972523f2fe98c891e79cbb7be53cfd6eedc1d94e08b59693173f11f90`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:170 · 横滚镜头

**上游检索名：** `170` / `barrel-roll`（Barrel roll）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 相机绕镜头轴转一整圈，地平线翻转后重新水平。

**逐项动作规格：**
- 相机位置固定、高度 1.5 m，只滚转 0→2π rad（360°）；整幅图绕画面中心转动。0.5–3.6 秒用三次 ease-in-out。
- 人物静止在前方 7 m；地平线、建筑和人物按相同角度旋转，旋转时画角露白。3.6–4.2 秒停留；完整旋转后画面与起点相同，因此最后 0.5 秒交叉淡化不可见。
- 右上角角度读数 ↻0°→↻360°。

**适用用途：** 用于需要动势的航拍或无人机影像，也可表达眩晕和混乱。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("02").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/170.txt`（SHA-256 `db475bb8096215a765bfd7366c8c6ea0ac58adcd65510dc202b38dad7f7bc978`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:171 · 移动延时

**上游检索名：** `171` / `hyperlapse`（Hyperlapse）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 相机沿街向前行进，太阳、云和行人同时快进，形成移动中的延时摄影。

**逐项动作规格：**
- 相机从 0 前进到 22 m，高度 1.6 m、俯仰 +0.05 rad；太阳、云和人物快进表现 12 小时。0.4–4.1 秒用三次 ease-in-out。
- 街道两侧 x=±7.5 m 有 12 栋建筑，深度 5–55 m、高 8–16 m；它们向相机靠近并离开画面。太阳始终位于相机前方 170 m，沿弧线由 −1.25 移到 +1.25 rad；3 片云总共右移 140 m、每 80 m 回绕；6 个小人横穿 11 m 宽的街道。
- 建筑阴影背离太阳并随太阳转动，呈半透明灰色；山随相机移动以保持同一尺寸。右上角显示时钟与路程：06:00·0m→18:00·22m。
- 最后 0.5 秒交叉淡回起始画面；单次通过时长为 4.7 秒。

**适用用途：** 用于一次穿越城市或建筑的运镜中，同时覆盖长距离和长时间。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("03").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/171.txt`（SHA-256 `0c3d69d3ecfa7258539aec05dfc671d3be6ca1b15452e2b2b3b47fabc22f91ea`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:172 · 长镜头

**上游检索名：** `172` / `long-take`（Long take）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 一个连续长镜头跟随行走的人，没有切点；下方进度条保持完整。

**逐项动作规格：**
- 全程无剪切；4.2 秒持续跟随。人物以恒速从前景左侧 (x=−3.4 m、纵深 5.2 m) 走向后景右侧 (x=2.8 m、纵深 9.6 m)，四肢按 sin(t×7)×0.42 rad 摆动。 跟随运动在 4.2 秒停止，最后 0.5 秒交叉淡回起始画面（单次通过时长为 4.7 秒）。
- 相机在人物后方从右侧平移 0→1.4 m，同时转向人物：偏航角 atan2(人物x−相机x,纵深)×0.8；高度 1.4 m。
- 底部是一条标注“单镜头、无切点”的蓝色长条和播放头，展示没有断点；右上角时间从 NO CUT 0.0s 到 4.2s。

**适用用途：** 用于保持紧张感和临场感不断，或把一系列动作呈现为一条连贯过程。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("04").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/172.txt`（SHA-256 `c091b8961631f3513cd7d3d3760894a3918029caa75bac133d1857c68ab3d511`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:173 · 斯坦尼康

**上游检索名：** `173` / `steadicam`（Steadicam）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 相机在行人后方平稳跟进，只轻微缓慢摇摆，不像手持那样抖动。

**逐项动作规格：**
- 相机恒速向前 1.7 m/s（4.7 秒走 8 m），高度 1.45 m、俯仰 −0.02 rad，不做缓动。低频摆动：高度 ±3.5 cm（周期内 2 次）、横向 ±5 cm（1 次）、偏航 ±0.012 rad、横滚 ±0.006 rad，均为整数周期正弦波。
- 人物在相机前 5 m 以同速行走，4.7 秒走 5 步。两排树高 3.6 m，位于 x=−5 m 和 +5 m，每隔 8 m 一棵、两排错开 4 m；山和太阳随相机一起移动。
- 8 m 是 2 m 网格和 8 m 树距的整数倍，因此每 4.7 秒无缝循环；右上角标 STEADICAM。

**适用用途：** 用于让步行跟拍显得平稳、有电影感。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("05").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/173.txt`（SHA-256 `e759ed8057eb9dc647987cfce3d690207f6a7d523c79240623ca25181d923d31`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:174 · 背后跟拍

**上游检索名：** `174` / `follow-shot`（Follow shot）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 相机落后行人几米沿同一路径跟随，人物从背后看、始终接近画面中心。

**逐项动作规格：**
- 人物沿曲线 x=1.8sin(2.2s)、深度 z=4+9s 行走，s 从 0 到 1，距离由 4 m 变为 13 m。
- 相机沿同一路径跟在 s−0.4 处（约落后 3.6–3.9 m），始终朝向人物，偏航角 atan2(人物x−相机x,人物z−相机z)，高度 1.5 m。0.3–4.2 秒三次 ease-in-out；人物四肢按 sin(s×30)×0.42 rad 摆动。
- 人物从背后保持在画面中央附近；路径旁的柱子和石头从前景掠过，区别于并肩平行的 #029 Tracking shot。右上角显示距离 FOLLOW 3.6–3.9m。
- 最后 0.5 秒交叉淡回起始画面；单次通过时长为 4.7 秒。

**适用用途：** 用于陪角色一起进入地点，或营造第三人称、游戏式视角。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("06").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/174.txt`（SHA-256 `e807b82880fa3aaf19a72246cbad192b9de2acf79515e50c1d1b19bd56b92eb4`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:175 · 固定镜头

**上游检索名：** `175` / `locked-off-shot`（Locked-off shot）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 人物从三脚架固定镜头前穿过，汽车从后方经过；相机一像素也不动。

**逐项动作规格：**
- 相机完全固定，高度 1.4 m、正面朝前、焦距 330 px；只有主体移动。人物距镜头 6.5 m，4.7 秒恒速从 x=−6.2 移至 +6.2 m，四肢按 sin(u×7)×0.42 rad 摆动。
- 灰色汽车在 15 m 外从右向左驶过，x=+16→−16 m。两者起终点都在画外，因此每 4.7 秒无缝循环。
- 左下有灰色三脚架标志，右上标 LOCKED。与让素材时间停住的 #040 Freeze frame 不同，这里时间继续，只是镜头固定。

**适用用途：** 用于固定机位观察、通过静止与运动的对比突出主体，或作为延时与合成的基底。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("07").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/175.txt`（SHA-256 `8b3f0c247f7b653d05410be96ce7abbf4d10ca031604434376b7f7b6df3ef5ae`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:176 · 穿越镜头

**上游检索名：** `176` / `fly-through`（Fly-through）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 相机朝带窗墙壁飞近，穿过窗洞后进入墙后的地点。

**逐项动作规格：**
- 相机在方向固定时从 0 推进到 12.5 m，高度 1.3 m；墙在前方 8 m，镜头穿过窗户。0.5–3.6 秒用三次 ease-in-out。
- 墙为浅灰平面，宽 80 m、高 14 m；窗宽 2.4 m、高 2.2 m、窗台高 0.15 m。窗外可见人物（右 0.3 m、距离 14.5 m）、树、建筑和山。
- 相机前方还剩 0.25 m 时停止绘制墙；此时窗框边缘已在画面外（半宽约 1580 px），因此不会突然消失。通过后远处地点铺满画面，相机最终距人物 2 m。
- 右上读数从“距窗 8.0m”变为“已穿过”；3.6–4.2 秒停留后淡回起点。

**适用用途：** 用于建筑开场进入空间，或一镜连续从一处穿行到另一处。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("08").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/176.txt`（SHA-256 `fc83b539f8f57e64ba4bb7b3ffe5ec8ab62cfc99c0a73d4af3b45c61f236f6cd`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:177 · 低角度镜头

**上游检索名：** `177` / `low-angle`（Low angle）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 相机降到接近地面并向上看，人物显得高大，建筑向上耸立。

**逐项动作规格：**
- 相机从 1.5 m 降至 0.35 m，俯仰由 0 增至 +0.32 rad（约抬头 18°）；不前后移动。0.6–2.2 秒三次 ease-in-out。
- 人物静止在前方 4.5 m；塔高 11.8 m、位于左 3 m、纵深 22 m。镜头上仰时人物和塔在画面中向上拉长，地平线下沉。
- 2.2–4.2 秒停留，让观众阅读构图；右上角角度与高度读数 ↗0°·1.5m→↗18°·0.4m。
- 最后 0.5 秒交叉淡回眼平起始画面（单次通过时长为 4.7 秒）。

**适用用途：** 用于让人物显得有力量，或强调建筑高度。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("09").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/177.txt`（SHA-256 `d588ab24685cadfb0f5c42400cc2c98d4825b52011c7fb426b22c7e6ff7fb314`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:178 · 高角度镜头

**上游检索名：** `178` / `high-angle`（High angle）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 相机升高并向下看，人物显得更小，地面占据画面大部分。

**逐项动作规格：**
- 相机从 1.5 m 升到 4.5 m，俯仰由 0 变为 −0.5 rad（约向下 29°），不前后移动。0.6–2.2 秒三次 ease-in-out。
- 人物静止在前方 5 m；相机俯拍时人物缩小并向画面下方移动，地面网格占据大部分画面，地平线从顶部离开。
- 2.2–4.2 秒停留；不同于 #031 Crane up 继续升到 9 m，也不同于垂直向下 90°的 #181 Bird’s-eye view。右上角读数 ↘0°·1.5m→↘29°·4.5m。
- 最后 0.5 秒交叉淡回眼平起始画面（单次通过时长为 4.7 秒）。

**适用用途：** 用于让人物显得脆弱或渺小，或从上方解释情境。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("10").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/178.txt`（SHA-256 `89b1a22c75b9544bf94b74d4bf505505c4880d443691c2ef140dee50b0129d85`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:179 · POV 镜头

**上游检索名：** `179` / `pov-shot`（POV shot）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 从角色眼睛看到前方：步行摇摆和画面底部的手表明第一人称，前方人物向观众挥手。

**逐项动作规格：**
- 相机从角色眼高 1.6 m 处向前 0→3.2 m，0.3–4.2 秒用三次 ease-in-out。步行时才加入摇摆：高度 ±3 cm、每 4.7 秒 6 次；横滚 ±0.008 rad、每周期 3 次。
- 画面底部两角有蓝色圆角手（距中心 ±178 px），右手拿白色手机；手随身体移动，所以手保持稳定、周围世界摇摆。
- 前方 7.5 m 的人物在 1.6–3.4 秒间抬起双臂挥手（朝向观众）；前景有两根柱子。右上角标 POV，最后 0.5 秒淡回起点。

**适用用途：** 用于把观众放进角色位置，或营造游戏、VR 式视角。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("11").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/179.txt`（SHA-256 `cb1a71e26fee5dc9755decc404c6bea756cae3593b3b2bd230ad71c972861fcb`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:180 · 过肩镜头

**上游检索名：** `180` / `over-the-shoulder`（Over-the-shoulder）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 前景人物的头肩背占据画面边缘，越过肩膀看到另一人；前景柔焦、对方清晰。

**逐项动作规格：**
- 前景人物灰色头肩（左 0.62 m、距离 1.15 m）占画面左缘；另一人物蓝色（右 0.32 m、距离 3.1 m）从肩旁看到。前景肩部模糊 2.6 px，另一人物保持清晰并以胸口以上入镜。
- 相机高度 1.55 m、偏航 +0.05 rad；0.5–3.4 秒三次 ease-in-out 缓慢推进 0→0.35 m。对方像谈话般按 0.35sin(u×5) rad 摆动手脚。
- 右上角标 OTS；3.4–4.2 秒停留，最后 0.5 秒淡回起点。

**适用用途：** 用于明确对话双方的位置关系，并聚焦对方表情。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("12").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/180.txt`（SHA-256 `76d2be926c31f45dab445f33da16de27c81cad0f2f7d6351000bcb990a605f74`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:181 · 鸟瞰镜头

**上游检索名：** `181` / `birds-eye-view`（Bird's-eye view）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 镜头垂直向下俯视；道路、人物、汽车和树变成俯拍形状，镜头升高后更多地面进入画面。

**逐项动作规格：**
- 相机正对地面（俯仰 −π/2，即 −90°），位于原点正上方，从 9 m 升至 15 m；0.5–3.4 秒用三次 ease-in-out。
- 地面以一个平面绘制 2 m 网格和宽 3.2 m、中央白色虚线的道路；上方俯视可见 6 棵圆形树、3 栋方形建筑。人物用头圆与肩椭圆表示，沿路右侧向上走 5.2 m；1.8×4 m 汽车沿左侧向下开 6.8 m，两者位移按进度 p 成比例。
- 相机升高时所有物体缩小、更多地面露出；与斜向俯拍的 #178 High angle 区别。右上角显示 ↓90°·9m→15m。
- 移动结束后在 3.4–4.2 秒保持，最后 0.5 秒交叉淡回起点；完整一轮为 4.7 秒。

**适用用途：** 用于像图表一样说明空间布局与路线，或给出上帝视角总览。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("13").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/181.txt`（SHA-256 `cf12823249c6b5e289a0917bd25c8608b19d365029d35ec46aee4ee8d51b55d0`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:182 · 深焦镜头

**上游检索名：** `182` / `deep-focus`（Deep focus）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 前景花朵、人物和后方建筑同时变得清晰。

**逐项动作规格：**
- 相机位置、方向、焦距和高度 1.1 m 固定；只改变模糊程度。前景花朵（左 0.75 m、距离 2 m）从 5 px 模糊变为 0；后景人物（右 0.9 m、距离 9 m）、建筑和山从 6 px 一起变为 0。不同于只把一侧清晰的 #033 Rack focus。
- 0.5–3.4 秒用三次 ease-in-out 转换；花与人物上的蓝色对焦角标半宽分别 46 px、30 px，随对焦到位从透明变清晰。
- 右上角光圈读数 f/1.8→f/16；3.4–4.2 秒停留，最后 0.5 秒淡回起点。

**适用用途：** 用于观众可以看画面任意位置，或要同时呈现多个纵深层次的事情。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("14").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/182.txt`（SHA-256 `16612b1fb785e9716f56c14cda9d32155076ba50296973b0360481c0d159ec00`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:183 · 定场镜头

**上游检索名：** `183` / `establishing-shot`（Establishing shot）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 以宽广高视角展示整座城，镜头慢慢推进，左下出现地点字幕。

**逐项动作规格：**
- 广角焦距 220 px（标示 16 mm），相机高 4.5 m、俯仰 −0.06 rad；缓慢从 −5 m 推进至 −2.5 m。0.3–4.2 秒三次 ease-in-out。
- 场景有 8 栋距镜头 30 m 的建筑、一座右侧 16 m、纵深 36 m 的塔、3 片云和山；左侧 1 m、距离 12 m 的小人用于标出规模。
- 0.9–1.3 秒左下淡入白卡字幕 EXT. CITY – DAY，尺寸 158×30 px，左侧有蓝条，并上移 8 px；随后保持。右上角标 16mm WIDE，最后 0.5 秒淡回起点。

**适用用途：** 用于场景开头交代地点，或地点、时间发生变化时。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("15").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/183.txt`（SHA-256 `02661a177439a6f4ff88aeda01ddd875bcc30c90cabcd30aa76bdcb340f2a8a1`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:184 · 大特写

**上游检索名：** `184` / `extreme-close-up`（Extreme close-up）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 从人物近景逐渐推进到眼睛占满整个画面。

**逐项动作规格：**
- 人物右眼位于画面中心左侧 0.06 m、高 1.66 m，距离相机 1.3 m；相机不移动。焦距 0.5–3.4 秒按三次 ease-in-out 指数增大：610→2040 px（44→148 mm，约 3.3 倍），f=610×(2040/610)^p。
- 人物为蓝色头部、半径 0.16 m，含白色椭圆眼睛（0.045×0.028 m）、深色瞳孔（半径 0.016 m）、高光与白眉；起点显示约 150 px 宽的整张脸，终点只剩眼睛填满画框。
- 背景树木和建筑模糊 3 px，随着镜头推进离开画面。右上角焦距和景别简称从 44mm CU 变为 148mm ECU；3.4–4.2 秒停留，最后 0.5 秒淡回起点。

**适用用途：** 用于情绪高点，或让观众注意一个细节。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("16").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/184.txt`（SHA-256 `0ceafd0e771143fef94663eedda063fe486070000cf92e487dc173dffe8d0f38`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:185 · 插入镜头

**上游检索名：** `185` / `insert-shot`（Insert shot）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 从主镜头切入手表的大特写 1.3 秒，再切回同一场景。

**逐项动作规格：**
- 两个无效果直切（0 帧）：1.6 秒切入细节，2.9 秒回主场景，特写持续 1.3 秒。A 主镜头相机高 1.4 m、固定；人物左 0.6 m、纵深 6 m，手腕有暗色手表点；右侧 2.2 m、纵深 4 m 处有柱子。
- INSERT 特写为同场景中的手腕：淡蓝背景上，蓝袖尺寸 600×92 px、旋转 −0.35 rad；白色表盘半径 58 px，深色时针与分针、蓝色秒针在 1.3 秒内转一圈。
- 底部时间条分为 A（灰）、细节（蓝）、A（灰），播放头指示剪入内容属于原场景；区别于展示不同主体的 #189 Cutaway。右上角显示 SHOT A→INSERT→SHOT A，4.7 秒直切重置。

**适用用途：** 用于展示小物件、手部动作或重要道具。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("17").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/185.txt`（SHA-256 `672cec8d7fdb39a190f8da57740efe4ceb1f9eceb8b790e66fe75b7b9b46440d`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:186 · 变形剪切

**上游检索名：** `186` / `morph-cut`（Morph cut）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 同一人物的两条拍摄素材通过位置和姿态平滑插值接起来，不像跳切那样突变。

**逐项动作规格：**
- 素材 1（0–2.0 秒）相机固定、高 1.45 m；人物在左 0.4 m、纵深 3.3 m，四肢角度 −0.45 rad。素材 2 从 2.45 秒起，人物右 0.35 m、姿态 +0.55 rad；两段都按 0.12sin(t×3) 轻微摆动。
- 形变衔接在 2.0–2.45 秒持续 0.45 秒：位置以二次 ease-in-out 插值，两种姿态在同一插值位置绘制并交叉淡化。
- 只有衔接期间整画面增加 sin(q×π)×2.2 px 模糊，软化接缝；不同于允许位置跳变的 #041 Jump cut。底部时间条为素材 1（灰）、窄蓝色 Morph、素材 2（灰），右上角标 TAKE 1→MORPH→TAKE 2；最后 0.5 秒淡回第一段。

**适用用途：** 用于收紧访谈或旁白，或不引人注意地去掉口误。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("18").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/186.txt`（SHA-256 `901885711fa6563de12d9d9aecfabc7e1498fec1ccf7d4ff8ab2ee1e11ac477e`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:187 · 淡出到黑场

**上游检索名：** `187` / `fade-to-black`（Fade to black）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 整幅画面逐渐沉入黑色，下一场景从黑场中渐亮。

**逐项动作规格：**
- 1.4–2.6 秒（1.2 秒）把 rgb(20,20,24) 黑层叠在出镜画面上，不透明度 0→100%，用二次 ease-in-out。2.6–3.1 秒保持全黑；2.9 秒黑场内无痕直切到下一场景。
- 3.1–4.3 秒（1.2 秒）以同样曲线将黑色从 100% 淡至 0。A、B 两场景相机均固定（A 高 1.4 m；B 高 1.6 m、俯仰 +0.1 rad），主体不动。
- A→B 与 B→A 每 4.7 秒交替，9.4 秒一往返；右上角显示 FADE OUT / FADE IN，取景框标记在黑场上仍可见。

**适用用途：** 用于章节转换、长时间流逝或故事结尾。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("19").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/187.txt`（SHA-256 `af1af47246640418cac7ff9113fdcf72a315ddaa4eec3ba7e7e782e0bc7aec5d`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:188 · 圈出

**上游检索名：** `188` / `iris-out`（Iris out）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 圆形窗口逐渐收紧到人物，直至全黑，再在下一场景中重新打开。

**逐项动作规格：**
- 1.3–2.7 秒（1.4 秒）圆形窗口半径 340→0 px，以二次 ease-in-out 收缩，圆外填黑 #141418。圆心跟随当前场景主体投影：A 中人物头部（左 0.6 m、高 1.63 m、距 7 m），或 B 中汽车（右 1.2 m、高 0.9 m、距 9 m）。
- 2.7–3.1 秒黑场；2.9 秒无效果直切到下一画面。3.1–4.4 秒绕新场景主体把圆形窗口从 0 扩至 340 px。半径至少 1 px 时，边缘用 2 px 蓝圈标记。
- 两场景相机固定；A→B 与 B→A 每 4.7 秒交替、9.4 秒往返，右上角显示 IRIS OUT / IRIS IN。

**适用用途：** 用于默片或卡通式结尾，也可做俏皮的场景断点。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("20").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/188.txt`（SHA-256 `fb7bae51f02f2a3c02f90059f993dbe6fb4c17fc15ef71f4b18c2dd0eca1a360`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:189 · 切出镜头

**上游检索名：** `189` / `cutaway`（Cutaway）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 镜头从说话者切到听众，再切回；插入的是不同主体。

**逐项动作规格：**
- 两个无效果直切：1.7 秒切到其他主体，3.0 秒切回主场景，插入时长 1.3 秒。A 主镜头相机高 1.4 m、固定；距 5.5 m 人物讲话，四肢按 0.45sin(u×6) rad 摆动；右侧 0.9 m 有灰讲台。
- CUTAWAY 为听众：5 人在 3.1–4.6 m 外，蓝与浅蓝配色，双臂抬起并按 |sin(t×9+i)|×5 cm 跳动；没有背景，地点不同。
- 底部条为 A（灰）→听众（蓝）→A（灰）并带播放头；不同于展示同一场景细节的 #185 Insert shot。右上角标 SHOT A→CUTAWAY→SHOT A，4.7 秒直切重置。

**适用用途：** 用于展示反应，或遮住时间跳跃、剪掉的口误。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("21").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/189.txt`（SHA-256 `e22afbe389144319e0d14a1924a1c0e7d129e22ce1e6046d47f0b653175a1945`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:190 · 交叉剪辑

**上游检索名：** `190` / `cross-cutting`（Cross-cutting）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 同时发生的两场戏（跑者与汽车）交替剪切，切换间隔逐渐缩短。

**逐项动作规格：**
- 两场景共用同一时钟：A 为跑者（左 0.3 m，纵深 15→4.5 m，腿随 u×12 运动），B 为城市汽车（右 1 m，纵深 17→4.5 m）；4.7 秒内都逐渐接近。
- 直切时点为 0、1.1、2.0、2.7、3.3、3.8、4.2、4.5 秒；镜头时长依次缩短为 1.1、0.9、0.7、0.6、0.5、0.4、0.3 秒以提升紧张感。
- 一场景暂时不显示时仍继续运行，切回时主体已走到后续位置。A 相机高 1.3 m、固定、前景有 4 根柱；B 相机高 1.6 m、俯仰 +0.06 rad、固定，画面有城市和太阳。底部八段交替 A（灰）/B（蓝）时间条带播放头；最后 0.3 秒交叉淡回 A 起点；右上角显示 SCENE A/B。

**适用用途：** 用于追逐、营救等同时发生的行动之间累积紧张感。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("22").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/190.txt`（SHA-256 `e96feef4b6018577d77e04430395780385beecd59797689d176a6edfb8f9e125`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:191 · 子弹时间

**上游检索名：** `191` / `bullet-time`（Bullet time）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 人物跳到最高点时，时间几乎停住，而相机绕人物转动。

**逐项动作规格：**
- 素材时间在 0–1.5 秒正常播放，1.5–3.3 秒降至 0.1 倍（1.8 秒里只走 0.18 秒素材），随后恢复正常，素材时间为 u−1.62。人物距镜头 9 m，在素材时间 0.6–2.6 秒按抛物线跳跃（顶点 1.1 m、双臂抬起）；慢速段在动作 45–54% 处近似悬停。9 片叶子按相同素材时间下落。
- 慢速期间相机绕人物走半径 6 m 的圆弧，角度 −0.6→+0.6 rad（约 69°），用三次 ease-in-out，始终朝向圆心；高度 1.6 m、俯仰 −0.05 rad。
- 下一段 4.7 秒反方向绕行（+0.6→−0.6），使 9.4 秒循环无缝；地面有半径 1.3 m 虚线圆，周围树木在 10 m 圈上。右上角读数 ×1.0→BULLET ×0.1→×1.0。不同于不减速的 #030 Orbit。

**适用用途：** 用于从三维角度呈现决定性瞬间，或作为动作场面的高光。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("23").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/191.txt`（SHA-256 `0d636da6c105f7852057ebf355856b349bdad981d80903e23b41a336ce493420`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:camera2:192 · 蒙太奇

**上游检索名：** `192` / `montage`（Montage）；包：`camera2`（镜头运动与转场（第 2 弹））。

**可见变化：** 7 个短镜头浓缩 30 天训练；全部直切，右上角日期不断跳变。

**逐项动作规格：**
- 7 个镜头以无效果直切（0 帧）连接，时长依次 0.75、0.7、0.65、0.65、0.65、0.6、0.7 秒，总长 4.7 秒。日期依次显示 DAY 1、3、7、12、20、28、30。
- 镜头内容依次是：跟拍跑者（腿按 t×14 动）、公园跳跃、日出（太阳升高 4→12 m）、低角度举臂、城市行走（焦距 420 px）、绕人物从 −0.3 到 +0.3 rad、旗前举臂。
- 4.7 秒浓缩 30 天训练；每个镜头的相机位置、高度和焦距都会变化，区别于维持同构图的 #041 Jump cut。底部七段时间条仅当前镜头为蓝色，最后 0.3 秒交叉淡回第一个镜头。

**适用用途：** 用于在短时间内展示长期变化或努力过程。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 9.4 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/camera2.mjs)，调用 `createElement("24").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/192.txt`（SHA-256 `1edaa5ed2c8069d86ae2b452760226db5f88552fbb2557821ffbf2efbb6dfc99`），共享 kit `api/v1/kit/camera2.js`（SHA-256 `14e47c0669a2447ac994214a3e6dda70ee02699947abc33c88babf4cd0886c5e`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:193 · 水彩画

**上游检索名：** `193` / `watercolor`（Watercolor）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅房屋、树木和太阳的线稿被重绘成浅淡透明的水彩；颜色在纸面晕开、积聚，留出未着色的白纸。

**逐项动作规格：**
- 媒介：纸面透明水彩。
- 色彩整体偏浅；允许水色渗开并在局部积聚，同时保留露白的纸面。

**适用用途：** 适合绘本、插画或需要柔软手绘感的季节卡片。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("01").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/193.txt`（SHA-256 `b6dec62b01a8eeb08f05f77cc8b336babc2e05ac3c49b5186e50d119aa6f0a06`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:194 · 厚涂油画

**上游检索名：** `194` / `impasto-oil-painting`（Impasto oil painting）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变成色彩浓厚的油画；厚涂颜料的刷痕与调色刀痕像凸起的脊线一样清晰可见。

**逐项动作规格：**
- 媒介：以厚涂方式堆叠油彩。
- 刷痕和调色刀刻痕保留为可辨的凸起纹路，颜色浓重饱和。

**适用用途：** 适合希望画面显得浓烈、厚重且手工感强的海报或艺术画面。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("02").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/194.txt`（SHA-256 `6d9bdbfaf24274dea8c01f9801ca179598d50e98a2a3d67c15ae3e64806d6134`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:195 · 水墨画

**上游检索名：** `195` / `ink-wash-painting`（Ink wash painting (sumi-e)）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变成一张只用黑墨绘制的和纸水墨画；深浅墨色、渗化和淡洗承担全部明暗，不使用彩色。

**逐项动作规格：**
- 媒介：和纸上的单色黑墨。
- 只用浓墨、淡墨、渗化和淡洗形成画面，不加入彩色。

**适用用途：** 适合安静、带日式气息并保留大量空白的画面。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("03").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/195.txt`（SHA-256 `b478479e05baddda31e3181fea7ffe810b639bead0d5e41ed67e24e902dc3ef7`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:196 · 浮世绘木版画

**上游检索名：** `196` / `ukiyo-e`（Ukiyo-e woodblock print）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿转成江户时期彩色木版画：房屋改为瓦顶日式房屋，树改为松树，太阳成为红圆；天空上深下浅，并有一带雾气。

**逐项动作规格：**
- 媒介：江户时期多色木版印刷。
- 用细而均匀的黑色轮廓线、平涂色块表现；保留版套色的轻微错位、和纸纤维与不均匀印迹。
- 天空从顶部深靛蓝渐变到下方浅色，中间横贯雾带；太阳画成红圆。示例明确不加入富士山、海浪、人物或文字。

**适用用途：** 适合以鲜明平涂色块和线条表现日本主题。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("04").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/196.txt`（SHA-256 `6836fc5d94585acee23e4942fe55e19c3ad5be86ea90178f6cf098f59e96dffc`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:197 · 点彩画

**上游检索名：** `197` / `pointillism`（Pointillism）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变成完全由彩色点组成的图；天空、房屋、树木和地面都由清晰可见、尺寸较大的点铺成。

**逐项动作规格：**
- 只用并置的彩色点构成画面，不画线条，也不铺连续色面。
- 点要足够大，缩到小卡片仍看得见；过小会读成水彩纹理。

**适用用途：** 适合明亮、节奏感强且带手作纹理的画面。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("05").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/197.txt`（SHA-256 `74ae68791e6cabdc766a43b01487896787976fc724f8080b7c0ab1316979f0cf`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:198 · 彩色铅笔画

**上游检索名：** `198` / `colored-pencil-drawing`（Colored pencil drawing）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变成手绘彩色铅笔画：颜色由多层细笔触叠加，白色纸纹仍从颜色之间透出。

**逐项动作规格：**
- 媒介：纸面彩色铅笔。
- 用层叠的细笔触积累颜色，同时保留可见的白色纸张纹理。

**适用用途：** 适合亲切的手绘插画，包括儿童向画面。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("06").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/198.txt`（SHA-256 `4dceb1df3f169aa7400af29bef319b67bf59326e67e0f2845b4417e39657bb8f`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:199 · 麻胶版画

**上游检索名：** `199` / `linocut`（Linocut print）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿转为黑白油毡版画；用粗壮线条和形块表现，保留刻版留下的粗糙痕迹，不加灰色、模糊或渐变。

**逐项动作规格：**
- 媒介：刻制后印刷的油毡版。
- 只用纯黑与纯白的粗线和形块，保留刻痕；避免灰色、模糊和渐变。

**适用用途：** 适合需要强烈黑白对比的海报、T恤图案或标志。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("07").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/199.txt`（SHA-256 `de7ab55bd2d83c6f21600639538560abfe0ff1efaa8f35bd29a462a9ee422b5a`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:200 · 彩绘玻璃

**上游检索名：** `200` / `stained-glass`（Stained glass）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变成彩色玻璃窗画；黑色铅条把天空、山坡、房屋与树分成不同彩色玻璃块，透光处发亮。

**逐项动作规格：**
- 媒介：由铅条连接的彩色玻璃片。
- 各色区域由较粗黑线分隔，并呈现光线透过玻璃的发亮效果。
- 示例画幅略宽，使山坡上的铅条分隔线能够显示。

**适用用途：** 适合庄重或节庆装饰感、并需要透光发亮效果的画面。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("08").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/200.txt`（SHA-256 `05d5d48209824e31b7cecef5047df407a4f8148786f653de1df6a595cb229a28`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:201 · 波普艺术

**上游检索名：** `201` / `pop-art`（Pop art）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿转成平涂的原色海报：粗黑轮廓围住色块，并在局部点缀半色调网点。

**逐项动作规格：**
- 使用平涂原色和粗黑外轮廓，少量区域加入半色调网点。
- 整体参照 1960 年代丝网印刷的视觉感。

**适用用途：** 适合需要醒目吸睛的广告、社交图片或周边图案。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("09").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/201.txt`（SHA-256 `afb40b695ce34a153c5c798785e7969bb2220be982495b8166eab2a735caf119`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:202 · 霓虹灯招牌

**上游检索名：** `202` / `neon-sign`（Neon sign）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变成暗砖墙上的霓虹灯管图；房屋、树、太阳和山坡线条都由发光灯管勾出，并产生扩散光晕。

**逐项动作规格：**
- 媒介：深色砖墙与发光霓虹灯管。
- 形状只以灯管线条描绘，外侧带有扩散光晕；示例使用红、黄、绿三色灯管。

**适用用途：** 适合夜间氛围，或需要商店、酒吧招牌感的画面。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("10").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/202.txt`（SHA-256 `c7bc9312a10d5f6d0629e4f8409d3e44240594c63937ad8076e3752e346d2378`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:203 · 装饰艺术（Art Deco）

**上游检索名：** `203` / `art-deco`（Art Deco）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿成为金黑配色海报；太阳向外放射直线光芒，几何直线装饰近乎对称地环绕构图。

**逐项动作规格：**
- 主色为金色与黑色。
- 使用从太阳放射的直线、几何直线装饰和接近对称的布局。
- 示例不含文字。

**适用用途：** 适合华丽、经典而有装饰性的视觉方向。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("11").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/203.txt`（SHA-256 `c3b10b90c104fb470db1fa1bfa5ff3f54d8cdb265ed238ae22877dbd88f22d96`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:204 · 新艺术运动（Art Nouveau）

**上游检索名：** `204` / `art-nouveau`（Art Nouveau）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变为约 1900 年的海报风格；轮廓转成流动粗曲线，叶片、草地和日光被组织成围绕房屋与树木的藤蔓、花朵装饰。

**逐项动作规格：**
- 轮廓使用粗而流动的弧线，并以弯曲藤蔓和花朵构成装饰框。
- 色彩为低饱和赭黄、橄榄绿和灰尘感朱红。
- 示例不含文字。

**适用用途：** 适合优雅、装饰性强的包装、标签或海报。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("12").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/204.txt`（SHA-256 `10a2a009e4bcdcb61038c3cf9fea937d2583cf03e106981e15303dcf555dc384`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:205 · Risograph 孔版印刷

**上游检索名：** `205` / `risograph`（Risograph print）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿被重绘成黄、青绿两色套印的版画；两层油墨略微错位，墨粒与纸纹都清楚可见。

**逐项动作规格：**
- 媒介：使用两到三种油墨的模板印刷（Risograph）。
- 保留版层错位、墨粒与纸面纹理；示例使用黄色和青绿色。
- 区分于平滑混色的双色调效果（第116项）：此处要保留错位和颗粒。

**适用用途：** 适合独立杂志、传单或小众海报的视觉气质。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("13").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/205.txt`（SHA-256 `8cf0e7a656d38e4e6d25eb0e85f898c20a9788207c1923264e47af52e3e02e04`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:206 · 层叠纸雕

**上游检索名：** `206` / `layered-paper-art`（Layered paper art）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿被重绘成多层彩色剪纸；层与层的台阶投下阴影，形成明显深度。

**逐项动作规格：**
- 媒介：多层叠放的彩色剪纸。
- 层间台阶产生阴影，使画面具有空间深度。

**适用用途：** 适合绘本或贺卡一类温暖、有立体层次的画面。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("14").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/206.txt`（SHA-256 `edbe74823ccc02686e4aaf624cc38222850100944d142dce92106342e13cbd1e`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:207 · 扁平插画

**上游检索名：** `207` / `flat-illustration`（Flat illustration）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变为只由平整色块组成的扁平插画，不画轮廓线，也不加阴影。

**逐项动作规格：**
- 只用纯色平涂形块组成画面。
- 避免轮廓线、阴影和渐变。

**适用用途：** 适合网站、应用或演示幻灯片中的简洁插画。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("15").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/207.txt`（SHA-256 `c1717333ca89c21617cc46be9c04d752cb899f4cac2952b8e246aea957ba39e9`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:208 · 线稿

**上游检索名：** `208` / `line-art`（Line art）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变为在奶油色纸面上用深海军蓝笔绘制的细致线稿；屋瓦、树叶、草叶和阳光都逐一细画。

**逐项动作规格：**
- 媒介：奶油色纸面与单支深海军蓝笔。
- 只用线条描绘，细节完整，线宽有变化。
- 避免填色和阴影区域。

**适用用途：** 适合着重呈现线条之美的涂色页、自然图鉴或包装。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("16").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/208.txt`（SHA-256 `216a139d67627718c2e71c53a53967e4e89a6916731240a33ba0b85d00de0d15`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:209 · 像素画

**上游检索名：** `209` / `pixel-art`（Pixel art）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿转成由方形像素构成的平面游戏图像；像素清晰可见，画面没有立体深度。

**逐项动作规格：**
- 采用低分辨率并让每个方形像素保持清晰可辨。
- 视角为正面平面图，不营造立体深度；由立方体堆叠的做法见第210项 Voxel art。

**适用用途：** 适合游戏感或复古风的图标与横幅。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("17").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/209.txt`（SHA-256 `3c2dd7688c56321392a7ff54f58e0db3755be2e7d37527ec1b73bb1082dcb233`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:210 · 体素艺术

**上游检索名：** `210` / `voxel-art`（Voxel art）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变为由小方块堆叠的三维微缩景观；房屋、树、太阳和山坡都由立方体搭成，顶部受光、侧面较暗。

**逐项动作规格：**
- 构造：所有对象都建成堆叠小方块的三维模型。
- 每个方块的顶面和侧面分别表现受光与阴影，并以略俯视的角度呈现立体感。
- 与平面像素画（第209项）不同。

**适用用途：** 适合游戏感三维画面或可爱的微缩景观。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("18").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/210.txt`（SHA-256 `cb3fcded7d9ac9387fdaff353c4e6f777c42e9c4f284e823d33912811b489e27`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:211 · 低多边形（Low poly）

**上游检索名：** `211` / `low-poly`（Low poly）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变成只由三角面组成的立体造型；每个面有独立明暗，因此形体呈现折面感。

**逐项动作规格：**
- 构造：以没有缝隙的三角形面组成 3D 形体。
- 各面分别着色并表现明暗，让造型读成多面折角。

**适用用途：** 适合简洁现代的三维背景或图标。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("19").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/211.txt`（SHA-256 `f48984d9cc0a636b4edeed2657ea630fdf28e6046a3250fc39057b85673ea72b`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:212 · 纸模型

**上游检索名：** `212` / `papercraft`（Papercraft）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿成为彩色卡纸折叠粘贴的模型照片：房子是盒状结构，树与太阳由多面体搭出，并能看到折痕、胶片标签和切口。

**逐项动作规格：**
- 构造：将彩色卡纸按模板裁切、折叠并粘合成 3D 模型。
- 保留清晰折边、突出的细小粘贴片和白色切口边；视角是从正面斜拍桌面上的模型。
- 不要做成全白浮雕，也不要做成第206项那种平面多层纸片。

**适用用途：** 适合手作感三维产品图、手工艺展示或教学材料。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("20").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/212.txt`（SHA-256 `5ad43c2392ef82fd263f38ae759c1abe39f4f23229866b69f38efae5c1042551`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:213 · 黏土动画风

**上游检索名：** `213` / `clay-animation-style`（Clay animation style）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变成黏土制成的三维模型；表面保留指纹和黏土纹理。

**逐项动作规格：**
- 媒介：橡皮泥或造型黏土制作的 3D 模型。
- 造型圆润，表面可见按压指纹与黏土质地。

**适用用途：** 适合亲切、活泼的角色与场景。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("21").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/213.txt`（SHA-256 `e20aea7bf72bf58a0d6a69b79d2e9169116501f74d89ef17d9ccc293871325bd`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:214 · 刺绣

**上游检索名：** `214` / `embroidery`（Embroidery）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变为布料上的彩线刺绣；针脚走向和布面织纹都清晰可见。

**逐项动作规格：**
- 媒介：布料与彩色线。
- 保留每一针的走向以及织物纹理。

**适用用途：** 适合需要温暖手作感的周边、包装或节庆问候图。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("22").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/214.txt`（SHA-256 `55476a3de995d080183653bd819542e9e8dcfb095ece17e9b271f8ab1cdb5e39`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:215 · 合成器浪潮（Synthwave）

**上游检索名：** `215` / `synthwave`（Synthwave）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿转成 1980 年代霓虹未来感画面：地面是紫青发光网格，太阳成为横纹落日，房屋和树则由霓虹轮廓线构成。

**逐项动作规格：**
- 主色为紫、青与粉色霓虹。
- 地面使用发光网格，太阳呈大型横向条纹落日，其他形状以霓虹轮廓勾出。
- 整体指向 1980 年代复古未来主义；示例裁切比常规更高，以显示地面网格。

**适用用途：** 适合复古未来感的音乐、游戏或活动视觉。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("23").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/215.txt`（SHA-256 `be59b275bada3c74253cd7c3f0cf7ad8ad9816b183ee31e8172794d3cefd25ec`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:artstyle:216 · 蓝图

**上游检索名：** `216` / `blueprint`（Blueprint）；包：`artstyle`（图像生成常用的画风名称）。

**可见变化：** 同一幅线稿变成蓝底白线的技术制图；用少量尺寸线和构造线补充设计过程，但不出现数字或文字。

**逐项动作规格：**
- 画面以蓝色为底，用细白线绘图。
- 加入少量尺寸线与构造线；示例不放数字或文字。

**适用用途：** 适合说明产品如何工作，或呈现正在规划设计的感觉。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。artstyle 包依赖本地 [MIT WebP 资源](../../runtime/motion-vocabulary/assets/artstyle/base.webp)（共 27 张）；浏览器绘制前必须等待模块导出的 `ready` Promise。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/artstyle.mjs)，调用 `createElement("24").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/216.txt`（SHA-256 `d19e418d4f9912e97e96ad21e1a3aad0f8aa79018bcc47a5567ee152b1824e4f`），共享 kit `api/v1/kit/artstyle.js`（SHA-256 `48cf7a9c1a4f4fdef0b8c1353c947a1b5fdb71028c1fd3df66440d7ab78c9159`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:217 · 维恩图

**上游检索名：** `217` / `venn-diagram`（Venn diagram）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 两个圆从左右滑入并部分重叠，只有共享区域填为深蓝色。

**逐项动作规格：**
- 两个圆半径各 78 px；A 在左，浅蓝填充、蓝色描边，B 在右，浅灰填充、灰色描边；仅重叠区域填深蓝。
- 0.3–0.7 秒以 ease-out 淡入；0.5–1.6 秒两圆圆心从中心两侧 ±150 px 移到 ±44 px，使用三次 ease-in-out。
- 标签 A 与 B 各 26 px，分别放在圆的外侧。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合在一页中说明两项或多项内容的共同部分与差异。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("01").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/217.txt`（SHA-256 `624f7f09a2ff6f49127fa20e0894719053a348c200c6855c58e9c102a405a251`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:218 · 四象限矩阵（2×2）

**上游检索名：** `218` / `2x2-matrix`（2x2 matrix）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 先从中心长出横纵坐标轴并划分四象限，再依次显出区域和数据点；只有右上象限及其点为蓝色。

**逐项动作规格：**
- 坐标轴在 0.4–1.0 秒由中心向外长出：左右各 168 px、上下各 86 px，使用三次 ease-in-out；右端和上端带箭头。
- 四个区域各 154×78 px、圆角 10 px，距坐标轴 8 px；从 1.0 秒起每隔 0.08 秒按右上、左上、左下、右下次序渐显，单次持续 0.35 秒。右上浅蓝，其余浅灰。
- 7 个点从 1.45 秒开始，每隔 0.1 秒以 0.3 秒 ease-out-back 弹入；右上点半径 12 px 且为蓝色，其他点半径 8 px 且为灰色。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合按两个标准整理选项，并指出目标区域（右上象限）。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("02").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/218.txt`（SHA-256 `f4e95d3bbb6f88518641c320157698ea0f1b0610122a8fce1db48a85188127da`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:219 · 逻辑树

**上游检索名：** `219` / `logic-tree`（Logic tree (issue tree)）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 左侧“？”问题框向右分成两支，再各分成两支，以折线连接成 1→2→4 的逻辑树。

**逐项动作规格：**
- 根节点为 66×50 px 蓝框，位于左侧 x=82，内部白色“？”在 0.4 秒起以 0.3 秒 ease-out-back 弹入。
- 第二层有两个 76×34 px 中蓝框，x=248；连接折线 0.75–1.15 秒生长，框分别在 1.05、1.13 秒弹入。
- 第三层有四个 92×26 px 浅蓝框，x=426；连线从 1.35 秒起每条间隔 0.06 秒、各绘制 0.4 秒；框从 1.65 秒起每隔 0.08 秒弹入。
- 连线为 3 px 灰线，从父框右边缘出发，在上下方向中点转折后接入子框左边缘；绘制使用三次 ease-in-out。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合把问题或目标完整拆分，列出原因或行动分支。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("03").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/219.txt`（SHA-256 `f61e126541b7c6e20ce16bb4e7d9c588265553c72de6ece872424c4a592bfb1d`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:220 · 金字塔图

**上游检索名：** `220` / `pyramid-diagram`（Pyramid diagram）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 四层三角形从底部向上逐层落位，只有顶层为深蓝色。

**逐项动作规格：**
- 三角形从 y=16 的顶点延伸至 y=192 的底边，底宽 336 px，切成四层，各层之间留 6 px 间隙。
- 由底向上，每层间隔 0.32 秒（起始时点依次为 0.4、0.72、1.04、1.36 秒）；每层下落 34 px，在 0.4 秒内以 ease-out 落位并淡入。
- 从底到顶颜色依次是浅灰、浅蓝、中蓝、深蓝。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合表现逐层建立的阶段关系，或从底部到顶部逐渐收窄的层级。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("04").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/220.txt`（SHA-256 `b06f80809b37f2b84ae08f3f7d18343bafdf501d04e97ea21f9a27ddf5e1dea0`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:221 · 思维导图

**上游检索名：** `221` / `mind-map`（Mind map）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 中央“主题”节点先出现，六条弧形主枝向左右生长，再从枝端长出更细的支线和词语节点。

**逐项动作规格：**
- 中心是 100×44 px 蓝色圆角框，白字“主题”字号 19 px；0.4 秒起以 0.3 秒 ease-out-back 弹入。
- 6 条三次贝塞尔弧线各 3 px，左右各 3 条；从 0.7 秒起每隔 0.09 秒开始、各生长 0.5 秒，末端接 54×24 px 节点。中蓝与灰色交替。
- 细枝线宽 2.5 px，从 1.45 秒起各生长 0.35 秒，末端接 40×18 px 小节点。
- 形态是从中心发散的弯曲枝线和词语节点，区别于第240项同心圆的嵌套环形。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合围绕一个主题展开头脑风暴或整理关联想法。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("05").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/221.txt`（SHA-256 `8cb252ddb28f2ed278d5d0718df42f685fe0c978e77b03f8979eb10a0c06401b`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:222 · 流程图

**上游检索名：** `222` / `flowchart`（Flowchart）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 开始、步骤、菱形判断、步骤和结束节点横向显现，并画出判断回到前一步的循环箭头；随后圆点沿路径走一遍、回环后继续到终点。

**逐项动作规格：**
- 节点位于 y=80：开始/结束为 66×36 px 灰色胶囊，步骤为 72×40 px 浅蓝方框，判断为宽 92、高 72 px 的蓝色菱形，内部有白色“？”。
- 节点从 0.4、0.8、1.2、1.6、1.95 秒依次以 0.3 秒 ease-out-back 弹入；它们之间的箭头从 0.6、1.0、1.4、1.75 秒依次生长 0.22 秒，箭头头部 10 px。
- 判断节点底部连到 y=172 后折回并向上接入第一步骤，循环箭头在 2.0–2.45 秒绘出。
- 深灰色圆点半径 8 px，2.6–3.8 秒按开始→步骤→判断→回环→步骤→判断→步骤→结束移动，使用三次 ease-in-out；圆点 2.5–2.65 秒出现，3.8–4.0 秒离开。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合逐步说明程序流程及其条件分支。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("06").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/222.txt`（SHA-256 `239bf1c1597b5ed31cb06d4f34651f595238078585a3121a107fd65d2914993d`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:223 · 循环图

**上游检索名：** `223` / `cycle-diagram`（Cycle diagram）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 编号 1–4 的圆点依次落在椭圆轨道四周，箭头逐段闭合成环，之后蓝色高亮沿环跑一圈。

**逐项动作规格：**
- 椭圆轨道横向半径 128 px、纵向半径 70 px；四个浅蓝圆半径 26 px，分别位于顶部、右侧、底部、左侧并标 1–4。
- 圆点从 0.4 秒起每隔 0.32 秒弹入；中蓝弧形箭头线宽 3 px、箭头头部 13 px，从 0.7 秒起每隔 0.32 秒开始、各绘制 0.28 秒，1.94 秒闭合成环。
- 2.2–3.8 秒实心蓝色高亮依 1→2→3→4 顺序移动，每阶段 0.4 秒，边缘柔和。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合说明回到起点并持续重复的过程，例如 PDCA。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("07").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/223.txt`（SHA-256 `ec41801d54a1b9acd79136af5ca1b15c2d05ec33821813a6ce3b30ecfef9b671`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:224 · 鱼骨图

**上游检索名：** `224` / `fishbone-diagram`（Fishbone diagram）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 一条主脊线向右延伸至代表结果的鱼头框；斜骨从脊线上下伸出，各自再接出短支骨，形成因果骨架。

**逐项动作规格：**
- 主线先从尾端起步（0.35–0.6 秒），深灰色 3 px 线从 x=52 延长至 x=404，0.45–1.0 秒生长，箭头头部 14 px；表示结果的蓝框为 92×56 px，文字“结果”，0.95 秒弹入。
- 主脊线上 x=150、258、366 处各长出向左上与左下倾斜的支骨，共 6 根；每根宽 62 px、高 80 px、中蓝 3 px。1.1 秒起按每列 0.14 秒间隔、各 0.35 秒绘出，下一条下支骨再晚 0.07 秒。
- 每根支骨距起点 36% 与 68% 处各接一条向左的 26 px 灰色短线，线宽 2.5 px；紧随主支骨开始，以 0.22 秒绘出，彼此相隔 0.08 秒。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合按类别分组列出导致同一结果的可能原因。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("08").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/224.txt`（SHA-256 `b2424e61c13e641a4909af602daba9943990bb3b7e0add5bc20b8299a5b4d8c3`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:225 · 散点图

**上游检索名：** `225` / `scatter-plot`（Scatter plot）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 蓝点按横坐标从左向右逐个弹出，点位整体向右上方分布；最后画出虚线趋势线。

**逐项动作规格：**
- 坐标为 L 形，x=96–448、y=24–184，灰线宽 2.5 px，另有 3 条浅色水平网格线；坐标轴与网格全程保留。
- 共有 52 个半径 5 px 的蓝点，使用固定随机种子；在 0.4–1.65 秒间依横坐标由左向右，以 0.28 秒 ease-out-back 弹入。
- 灰色虚线趋势线从左下指向右上，虚线为 7 px、间隔 8 px；1.85–2.5 秒生长完成。
- 与第226项气泡图不同：本图点数多且大小一致。
- 4.15–4.55 秒仅数据点和趋势线淡出，坐标轴与网格留在画面中；单轮 4.7 秒。

**适用用途：** 适合查看两个数值是否相关，例如其中一项上升时另一项是否也上升。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("09").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/225.txt`（SHA-256 `098a80e3524022e21f9fa380fe8da528957b8eee6facf71e5ea82f400cd78f7e`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:226 · 气泡图

**上游检索名：** `226` / `bubble-chart`（Bubble chart）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 五个大小不同的半透明圆依次在 L 形坐标轴上长大，最大的圆用深蓝突出。

**逐项动作规格：**
- 沿用第225项相同的 L 形坐标轴和网格，整轮保持可见。
- 5 个圆半径在 14–44 px 之间，填充透明度 0.5；最大圆为深蓝（透明度 0.42），各自描边 2.5 px 且颜色与填充一致。
- 从 0.45 秒开始每隔 0.24 秒一个，各圆用 0.5 秒生长并轻微过冲（ease-out-back）。
- 与第225项散点图不同：点较少，圆的大小代表第三项数值。
- 4.15–4.55 秒仅数据淡出，坐标轴与网格保留；单轮 4.7 秒。

**适用用途：** 适合同时比较三个数值维度：横向位置、纵向位置和圆的大小。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("10").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/226.txt`（SHA-256 `62635e23774729d98acf22dc51ff2fa24c7ca12efa488ea8dba8624945e3ec57`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:227 · 热力图

**上游检索名：** `227` / `heatmap`（Heatmap）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 12 列、5 行表格的单元格从左上到右下按波浪顺序填入不同蓝色，再按相似的对角次序恢复为灰色。

**逐项动作规格：**
- 表格为 12 列×5 行，每格 30×28 px、圆角 4 px、间隔 4 px；左侧有短灰条作为行标签。
- 固定随机种子生成数值波形；单元格按值从浅灰映射到五档蓝色。
- 填色从 0.4 秒开始，每格持续 0.32 秒并使用 ease-out；起始延迟为列号×0.075 秒＋行号×0.06 秒，形成左上至右下的对角波。
- 清除从 3.95 秒开始，每格持续 0.22 秒并使用三次 ease-in-out；起始延迟为列号×0.025 秒＋行号×0.02 秒。单元格和行标签全程保留。

**适用用途：** 适合一眼比较表格中的高低分布，例如星期与小时的对应热度。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("11").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/227.txt`（SHA-256 `db7f50f70187b31db25e65cd0e9fd18f13f650369d81108e9b4f851475ae528a`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:228 · 雷达图

**上游检索名：** `228` / `radar-chart`（Radar chart）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 六轴蜘蛛网先显出灰色对照多边形，随后蓝色主多边形从中心向外扩张，并轻微越过后稳定。

**逐项动作规格：**
- 六边形蜘蛛网由 4 层嵌套六边形和 6 条辐射轴构成，外层颜色较深；网格整轮保留。
- 灰色对照多边形 0.4–1.1 秒从中心扩展开，使用 ease-out，顶点数据值为 0.46–0.74，填充不透明度 0.22。
- 蓝色主多边形顶点值依次为 0.92、0.58、0.84、0.4、0.76、0.52；填充不透明度 0.28、描边 3 px、顶点带圆点。0.95–1.85 秒从中心扩展，缓动按 55:45 混合 ease-out 与 ease-out-back，形成轻微过冲。
- 4.15–4.55 秒仅数据多边形淡出，坐标轴与网格留在画面中；单轮 4.7 秒。

**适用用途：** 适合比较多项指标的平衡，或两者的强项与弱项。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("12").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/228.txt`（SHA-256 `5360ac7915880e53f0d01334c7a29c4a136699f2aeac23780071838a74344d81`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:229 · 仪表图

**上游检索名：** `229` / `gauge-chart`（Gauge chart）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 半圆仪表的指针越过并摆过目标，逐渐停在 72%；蓝色弧带与百分比同步跟随指针。

**逐项动作规格：**
- 表盘为半圆弧带，半径 120 px、厚 30 px，底色灰；每 10% 一条刻度线，0、50、100% 的刻度较长。
- 指针从 0.5 秒开始按阻尼弹簧 1−e^(−3.2t)·cos(7.5t) 运动，先越过 72% 后摆动，再稳定到目标。
- 蓝色弧带填至指针位置；下方 26 px 百分比数字与指针同步。
- 4.1–4.5 秒间指针、弧带和数字用三次 ease-in-out 回到 0%；单轮 4.7 秒。

**适用用途：** 适合用一个数字说明距离明确目标还差多少。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("13").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/229.txt`（SHA-256 `736e3f92087604a45bc0892892aa7b9a778b3ebbb552cbcf463a0f9e8825ab16`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:230 · 组合图（柱形图＋折线图）

**上游检索名：** `230` / `combo-chart`（Combo chart (bar + line)）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 先按左侧刻度长出 6 根柱，再按右侧刻度从左至右绘出折线，两套单位分别使用灰色和蓝色标记。

**逐项动作规格：**
- 左右坐标轴与各 5 条刻度线分别为灰色（左）与蓝色（右），另有 3 条浅色网格线，全程保留。
- 6 根浅蓝柱宽 36 px，从 0.4 秒起每隔 0.12 秒以 0.36 秒 ease-out 向上生长。
- 蓝色 3.5 px 折线在 1.3–2.2 秒按匀速从左向右连起 6 个点；半径 7 px 的空心圆点从 1.25 秒起每隔 0.18 秒弹出。
- 4.15–4.55 秒只淡出数据，坐标轴和网格留在画面中；单轮 4.7 秒。

**适用用途：** 适合把使用不同单位的两组数值放在同一图中，例如销售额与利润率。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("14").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/230.txt`（SHA-256 `40215d59b43ab37d5471dca2ddcc157a929b1b4cdb38543cd0dc0675411ff357`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:231 · 象形图（图标阵列）

**上游检索名：** `231` / `pictogram-chart`（Pictogram chart (icon array)）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 一排十个人形图标先以灰色出现，前三个依次转蓝；旁边的“30%”从零计数，下方标明“10人中3人”。

**逐项动作规格：**
- 十个无面部的人形图标高 80 px，水平间距 32 px，排成单行；若排成网格会读成热度矩阵。
- 图标从 0.35 秒起每隔 0.06 秒以 0.3 秒 ease-out-back 弹入，初始均为灰色。
- 从 1.25 秒起，前三个图标每隔 0.22 秒在 0.25 秒内由灰变蓝。
- 46 px 蓝色“30%”从 1.25–1.94 秒由 0 递增；下方附“10人中3人”。
- 4.15–4.55 秒只淡出数据，坐标轴/网格或底层结构按源码保留；单轮 4.7 秒。

**适用用途：** 适合把比例转成具体人数来表达，尤其面向不喜欢抽象数字的读者。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("15").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/231.txt`（SHA-256 `2f8a682e8d87c4ceb5ade35237b125bce8c50e7bc8090e6ab6eaed043d9e9370`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:232 · 百分比堆积条形图

**上游检索名：** `232` / `100-stacked-bar-chart`（100% stacked bar chart）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 四条等长百分比条从左向右逐条填满；相邻条目的分界以点线连接，并在各条第一段显示百分数。

**逐项动作规格：**
- 4 条横条各长 390 px、高 28 px，间隔 16 px；各分为深蓝、中蓝、浅蓝和灰色四段，段间留 2 px。
- 从顶部向下逐条开始，间隔 0.16 秒；每条在 0.7 秒内以三次 ease-in-out 从左向右填充。
- 灰色点线（虚线长 4 px、间隔 4 px）连接相邻条的同一分界，从 1.6–2.0 秒淡入。
- 白色百分比字号 16 px，放在每条第一段中央；每条开始填充后 0.75 秒出现，淡入 0.25 秒。
- 4.15–4.55 秒仅数据淡出，底层坐标/网格保持；单轮 4.7 秒。

**适用用途：** 适合只比较各组内部构成比例，不比较组与组总量的场景。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("16").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/232.txt`（SHA-256 `a8b223fcb74530a1fc765b067eeeea08f350b5409c7035b00a5230808bdf4650`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:233 · 甘特图

**上游检索名：** `233` / `gantt-chart`（Gantt chart）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 上方日期刻度与左侧任务行保持不动，各任务条按先后逐个从起点向右延伸，能看出任务的持续时间与重叠。

**逐项动作规格：**
- 横向时间刻度标 1–8，格宽 52 px，带浅色竖向网格线；刻度全程保留。
- 左侧有 A–E 五行任务，行距 27 px；任务条高 20 px、圆角 6 px。条目范围依次为 A 0–2、B 1.5–3.5、C 3–4.5、D 3.5–6.5、E 6–8（按刻度列）。
- 从 0.4 秒起每隔 0.3 秒一条；每条用 0.5 秒 ease-out 从左端向右长出。D 用深蓝，其余用中蓝。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合说明项目任务的用时、重叠关系与前后衔接。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("17").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/233.txt`（SHA-256 `577fc5abc7935640b754261c0828a3a46368ac9ce2396b370a90ae8a2181582b`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:234 · 时间轴

**上游检索名：** `234` / `timeline`（Timeline）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 一条时间线从左向右画出，线头到达每个节点时圆点和月份标签同步显现；标签上下交替，最后一个节点为蓝色。

**逐项动作规格：**
- 深灰色时间线从 x=36 到 x=503，y=106，线宽 3 px；0.4–2.0 秒按三次 ease-in-out 绘制，末端有箭头。
- 5 个节点月份是 April、June、August、October、December（4月、6月、8月、10月、12月）；线头到达时各有 7 px 圆点弹出，最后一个为 10 px 蓝点。
- 每个点引出 22 px 竖线，再接 64×32 px 圆角标签，向上/向下交替；白底标签文字 18 px。最后标签为蓝底白字。各组件在 0.3 秒内长出。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合按时间顺序呈现事件，例如历史脉络、发展经过或计划安排。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("18").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/234.txt`（SHA-256 `d7ec95e7f1c7932693d08d79735af36f7f3a90f0a8800cd121c29d29ec2bd481`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:235 · 漏斗图

**上游检索名：** `235` / `funnel-chart`（Funnel chart）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 四条宽度递减的水平条从顶部起依次向外增长，条间以收窄的浅灰梯形相连，表现数量逐级减少。

**逐项动作规格：**
- 四条居中横条宽度依次为 470、350、236、132 px，高 34 px，垂直间距 10 px，圆角 7 px；颜色依次浅蓝、中蓝、中蓝、深蓝。
- 从顶部开始，每隔 0.36 秒一条（起始 0.4 秒），每条由中央向两侧在 0.45 秒内以 ease-out 展开。
- 条与条之间用不透明度 0.8 的浅灰梯形相连，梯形从上条宽度逐渐收至下条宽度。
- 每条中央数字分别为 100、58、27、9，字号 20 px；在该条开始后 0.3 秒起淡入 0.25 秒。
- 横条彼此分开并居中，避免看成倒置的第220项金字塔图。4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合显示数量在各阶段逐步下降，例如访问→注册→购买。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("19").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/235.txt`（SHA-256 `f2e64b489c415c5eadb97953f5d01f1ce04f9d69d8cb3b7bb51dc86431bfa316`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:236 · 客户旅程地图

**上游检索名：** `236` / `customer-journey-map`（Customer journey map）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 五个阶段标题与行动卡片先排成列，随后从左到右绘出情绪起伏线；每个数据点配有表示正负感受的表情符号。

**逐项动作规格：**
- 画面分五列，以竖线分隔；顶部阶段标题是普通圆角框而非箭头，中间列为灰色。标题从 0.35 秒起每隔 0.1 秒出现。
- 每个标题下方有白色行动卡片，以灰色短横线代替文字；从 0.6 秒起每隔 0.1 秒上升 8 px、在 0.3 秒内显现。
- 情绪曲线以 y=150 的灰色点线为中性基准，蓝色平滑 3.5 px 曲线依次经过 +0.35、+0.7、−0.6、+0.15、+0.85（×36 px）；1.25–2.25 秒从左向右绘制。
- 曲线经过节点时弹出半径 12 px 表情：中性线上方为蓝色笑脸，下方为灰色皱眉。
- 泳道间不画箭头；若要强调跨角色交接，参考第238项泳道图。4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合同时查看客户各阶段的行动，并定位其情绪下降的位置。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("20").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/236.txt`（SHA-256 `87312fe101054b9ef605da7d7947b494530c24ee5bc964b73070ba7b3d396ab2`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:237 · 矩形树图

**上游检索名：** `237` / `treemap`（Treemap）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 虚线外框内按面积从大到小逐一长出七个矩形，表示各组成部分在整体中的占比。

**逐项动作规格：**
- 外框 439×172 px，虚线节奏为 6 px线段、6 px间隔；整轮保持。
- 七个矩形均为 5 px 圆角；先出现左侧最大 A（206×172 px，深蓝），再依次出现 B（140×96 px）及 C、D、三个较小块。颜色在深蓝、中蓝、浅蓝、灰之间分配。
- 从 0.4 秒起每隔 0.22 秒一个；各块由 0.55 倍放大到原尺寸，在 0.4 秒内以 ease-out-back 轻微过冲并淡入。
- A–D 标字放在左上角：A 为白字 24 px，其他字母 20 px。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合一眼比较各部分在整体中的相对占比。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("21").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/237.txt`（SHA-256 `d8b69a6cb0d4547126ef4ea970a3168d72eebc384c852e8700c659f4c6649233`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:238 · 泳道图

**上游检索名：** `238` / `swimlane-diagram`（Swimlane diagram）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 三条泳道分别标出顾客、销售和制作；步骤框按角色间流转的顺序出现，并由折线箭头连接。

**逐项动作规格：**
- 三条白色泳道各高 60 px，左侧 62 px 栏放置灰色角色名：“顾客”“销售”“制作”；泳道全程保留。
- 5 个圆角步骤框为 56×30 px，横向从 x=138 排至 x=474；所属泳道依次是顾客→销售→制作→销售→顾客，最后一步深蓝。
- 步骤框从 0.4 秒起每隔 0.38 秒以 0.28 秒 ease-out-back 弹入。
- 每条深灰色 2.5 px 折线箭头从前一框右缘出发，横向后转向下一泳道并接入下一框，箭头头部 9 px；每个步骤出现前 0.24 秒开始绘制，绘制 0.26 秒。
- 不使用日期刻度；通过泳道名和跨泳道箭头表达职责交接，与第233项甘特图不同。4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合展示多人或多团队共同参与的流程中，谁在什么阶段做什么。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("22").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/238.txt`（SHA-256 `93b2c9a9a355363d0823e030d2cecb3190260f101fcf4159881d173e349f1149`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:239 · V 形流程图

**上游检索名：** `239` / `chevron-process`（Chevron process）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 五个编号箭羽形步骤从左侧依次滑入，步骤下方随即出现简短说明；蓝色由左向右逐渐加深。

**逐项动作规格：**
- 5 个箭羽各宽 104 px、高 74 px，尖端深 24 px、间隔 6 px；从第二个开始，左边缘切出凹口以嵌入前一项。
- 颜色从左向右依次为浅蓝、浅蓝、中蓝、中蓝、深蓝；中央显示 1–5，字号 24 px。
- 从 0.4 秒起每隔 0.3 秒一项；每项从左侧 34 px 处滑入，在 0.42 秒内以 ease-out 移位并淡入。
- 每项下方有 62 px 和 44 px 两条灰色短线代替说明文字；在步骤开始后 0.25 秒起淡入 0.3 秒。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合用一行展示相互衔接的步骤，例如培训安排或分阶段推出计划。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("23").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/239.txt`（SHA-256 `3a60402918555b700d8761fcbace5b95b1b258c796177d4b056f11b1291b576c`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。

## motion-prompt:diagram:240 · 同心圆图

**上游检索名：** `240` / `concentric-circle-diagram`（Concentric circle diagram）；包：`diagram`（资料中常用的图解与图表名称）。

**可见变化：** 外圈、中圈和内圈从同一中心依次长出，形成嵌套关系，并标注 TAM、SAM、SOM。

**逐项动作规格：**
- 三层实心圆共用同一圆心，半径依次为 91、61、31 px；由外至内使用浅蓝、中蓝、深蓝。外圈另有一条浅灰参考环，全程保留。
- 从外圈向内圈，分别在 0.4、0.85、1.3 秒开始，相邻间隔 0.45 秒；每圈在 0.5 秒内从中心长大，缓动为 60% ease-out 与 40% ease-out-back 混合，略微过冲。
- 标签 TAM 与 SAM 位于圆环夹层，SOM 放在内圆内，字号 18 px；每个圆开始生长后 0.55 秒起淡入 0.3 秒。
- 区别于第217项韦恩图：这里的圆彼此嵌套，不是并列相交。
- 4.1–4.5 秒整体淡出，至 4.7 秒循环前保持空画面。

**适用用途：** 适合表现从整体逐层缩小到目标部分的关系，例如 TAM、SAM、SOM。

**本地运行条件：** 这是 Canvas 时间函数，源画幅 539×208，源周期 4.7 秒；局部时间以秒传入，适配器按源比例等比 contain，不拉伸。本项源代码不依赖外部位图。

**L3 与来源：** [运行模块](../../runtime/motion-vocabulary/diagram.mjs)，调用 `createElement("24").draw(ctx,w,h,localSeconds,timing)`；对应英文源规格 `api/v1/en/e/240.txt`（SHA-256 `0a1d7aaf6d2f762e29e0d42a91903785aedbc49648d8e5fa3bc8fb338e9ac1af`），共享 kit `api/v1/kit/diagram.js`（SHA-256 `6df85af19af5e916c64f848a4723b320b585e6e6145dd67d27b786321e24a1c1`）。许可见 [MIT LICENSE](../../runtime/motion-vocabulary/LICENSE)。模块/资源已进入本地运行目录不等于本片效果已渲染验收。
