# Motion 复用目录：局部效果、整段模板与渲染

由 [laohu-motion 主文](../SKILL.md) 在观看单元与对象前后态明确后、最终构图和具体运动决定前读取；已有蓝图修改时也检查当前作用范围是否仍适合。它按复用尺度分别查询局部 `effects` 与整段/页面 `templates`：局部效果是对已登记目标、属性和时段的操作，整段模板的原生构图与机制仅在完整场景确实承担本段任务时作为布局输入。普通开放请求没有合适的可调用匹配时，先查 catalog 中精确的 `sourceImplementationIndex`，确认是否有适用于当前作用范围、且能在本作品工程内按授权接入的原实现；有则按真实接口尝试局部接入。没有适用项，或许可、素材、依赖/接口条件使原实现不能在本工程合法运行时，继续本地 Motion 路径，不强套；不调用 `source-only` 条目，也不由作品任务改共享 catalog/adapter。用户明确限定只复用时，无可调用匹配项应在授权范围内尝试接通许可允许的原源，仍不可运行就报告具体缺口，不自动转原创。用户不必先点名模板、先选画风或先填新字段表。

## 真源与调用状态

唯一机器目录是 [`templates/catalog.json`](../templates/catalog.json)。通过 [`scripts/templates.mjs`](../scripts/templates.mjs) 的实际接口查看与调用；不要用 `templates/upstream/` 的目录数、示例页、预览图、README、方法配方或仓库文件树推断某项已能渲染。`templates/upstream/<source>` 保存按 commit 固定的上游原文件，作为只读来源；catalog 中的 commit、逐文件 SHA-256、运行入口、许可、参数、固定机制、输入条件和状态才是本地登记依据。

状态按 catalog 的 `availability` 与 `runtimeVerification` 分开理解：

- `available` 表示该项已接到本地登记的 renderer，可进一步准备、预览或渲染；它不等于运行成功或成片质量通过。
- `conditional` 表示须先满足条目所列输入和许可条件。没有本地素材、角色帧或必要环境时，只暂停依赖该项的段落。
- `source-only` 表示目前只有来源/预览/结构记录，没有登记可调用的 renderer；不可对用户称为本地模板效果或传给 `prepare`、`preview`、`render`。
- `verify` 检查脚本声明纳入校验的源文件 SHA-256 与运行入口闭包；通过只证明这些登记源码与本地快照一致，不证明许可解释完整、浏览器启动、动态画面或接收质量。许可范围、素材权益与具体 schema 仍按 catalog、原许可证和真实源码核对。

调用候选、来源范围和字段以 catalog 中当前标为 `available` 或满足条件的 `conditional` 项为准；目录可能同时包含 `source-only` 的场景、素材/预览、配方和局部源码索引。新增索引不自动意味着源码已 vendored、许可已覆盖或 renderer 可用。每次按内容任务、可用 renderer 和前置条件筛选，不从项目名、ID、目录数量或缩略预览推断可运行性。

Video Shotcraft gallery index 当前有 124 个 card、150 个 style，全部是 `source-only`；另有 12 个由 adapter 登记的 `conditional` 候选，其中 11 个是原始 Shotcraft component adapter，ListStackPress 是固定五卡/88 帧的 `source-adapted-local`。这不是全部 gallery 的可调用化，也不代表每项都已验证为可用于本片。对普通开放请求，若没有可调用匹配但 catalog 的精确 `sourceImplementationIndex` 有适合当前镜头的原实现，可在作品工程内按授权做局部接入；不能调用 source-only 行，也不因作品任务改共享 catalog/adapter。要共享接通须有维护任务授权。要按完整镜头、局部组件或 Motion 方法三路决定复用范围，并核对 `PaperTitleCard` 同名不同路径、局部 placement、动作锚点、时钟和 Film `/2` 限制，读取 [Video Shotcraft 源接入规则](video-shotcraft-integration.md)。`catalog.json` 和运行时若变化，实际状态以当前条目为准；本段汇总不是替代运行检查的第二份登记表。

```sh
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --all
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --status available
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --type effect
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --type effect --intent focus
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --type effect --family relationship-mark
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --category local-effect
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" show huashu-mo-staggered-target-reveal
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --source huashu-art-motion
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" list --source video-shotcraft
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" show huashu-t3-finance-chart
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" show huashu-art-motion-dg
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" verify
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" verify --source huashu-art-motion
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" prepare <template-id> --input /absolute/spec.json --output /absolute/prepared.json
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" preview <template-id> --spec /absolute/spec.json --output /absolute/frame.png --time 1.5
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" render <template-id> --spec /absolute/spec.json --output /absolute/clip.mp4 --assets-root /absolute/media --cache-dir /absolute/project/.cache/tmp/template-render --browser /absolute/chrome --ffmpeg /absolute/ffmpeg --manifest /absolute/evidence.json
```

`list` 默认只列 `available` 与 `conditional` 条目；用 `--all` 检查 source-only 和 reference-index，或用 `--status`、`--source`、`--category` 缩小结果。普通局部组件先用 `--category local-effect`，它会列出登记在 `catalog.templates` 的本地组件（当前包含 Shotcraft 条目）。如果本镜也适合已实现的原子动作，再单独按精确标签用 `--type effect --intent <tag>` 查询 `catalog.effects`；当前这两种筛选不会自动合并。不同 renderer 保持不同接口，不能将 Shotcraft 组件当作旧 Canvas effect。再用 `show <id>` 读取具体来源、运行条件与字段。`show` 给出对应整段模板、局部 effect library 或来源索引的真实登记内容；整段 clip 的具体字段仍须核对原 schema 与源码。`verify` 检查声明 hash 的源文件、Git blob/source tree pin、运行入口闭包、effect library 加载列表和目录结构；通过只证明这些登记内容与本地快照一致，不证明浏览器启动、动态画面、许可解释或接收质量。

局部效果查询使用精确的 catalog 标签，不对 `intent` 做自然语言相似度猜测。当前可查询 `focus`、`emphasis`、`mark`、`draw-on`、`path-reveal`、`reveal`、`delimit`、`group`、`relationship-mark`、`pulse`、`sequence`、`staggered-appearance`；`--family`、`--target`、`--runtime` 也按 `show` 中登记的原值精确筛选。效果实例不是整段模板：`huashu-dg-draw-partial` 用原 `DG.drawPartial` 揭示与静态目标完全一致的屏幕路径/线；`huashu-dg-circumscribe` 用原 `DG.circumscribe` 对静态矩形做一次性圈注并在阶段结束清除；`huashu-dg-brace` 用原 `DG.brace` 沿矩形边缘长出括号并保留；`huashu-dg-indicate-frame-pulse` 用原 `DG.indicate` 的输出驱动圈注尺度/高亮，缩放的是强调轮廓，不是目标对象；`huashu-mo-staggered-target-reveal` 用原 `MO.lagged` 改变具名静态矩形自身的填充/描边透明度。几何、目标 ID 与静态 screen-space 对象须一致；四项 DG overlay 在每个活跃帧通过 `MotionOps.localEffectTargetState` 读取 `MotionCore.evaluateScene` 的当前状态，并按 `scene.styles → styleOverrides → evaluated object` 合并优先级。目标 `visible=false` 或最终 opacity≤0 时不绘制；半透明目标 opacity 只乘入继承 Canvas alpha 一次。目标 opacity/visible 可由已有事件、样式和绑定驱动，恢复可见时按绝对时间重新采样；MO 目标显现仍由 Core 应用目标对象 alpha，再乘原 reveal progress，adapter 不额外重复乘目标 alpha。几何事件/绑定、非中性解析变换会被拒绝；切换样式只有在解析后几何不变时可用。静态 Huashu effect 继续拒绝移动目标。若本镜确需矩形焦点跟随，可查本地 `laohu-motion-follow-box`：它只为当前 world-space rect 投影出强调框，目标仍由原对象绘制；需将 owner 放入实际后置的根 screen overlay，并读取[Motion 操作与绘制证据契约](motion-runtime-contract.md)。它不是 Huashu/OneTake 原效果，也不承接文字/image目标、path形变或相机推近。

画面效果放在现有 custom 对象 `data.motionEffects`，通过 `effectId`、`targetId`、静态 `geometry`、`parameters` 与 `phaseId` 接入；相位只登记一份在 `scene.phases[]` 或 `objects[].data.phases[]`，画面实例和 `audioEvents` 可以共同引用它，支持现有 `durationSec`/`endSec` 形式。四项 DG 局部描绘允许可选 `stagger`；目标显现项要求同组完整的 `groupId/index/count/ratio`。`MotionCore` 调用 custom renderer 前已把对象 `opacity` 乘入 Canvas alpha，adapter 不重复乘 owner opacity。四项 DG overlay 另按当前 Core 解析出的 target `visible`/`opacity` 跳过隐藏或零透明目标，并将半透明 target alpha 乘入继承 alpha 一次；目标状态使用 `evaluateScene` 与 `scene.styles → styleOverrides → evaluated object` 的既有优先级，因而事件/绑定造成的淡出、隐藏与恢复按绝对时间取样。原 `DG.brace` 会自行设置阶段 alpha；本地 adapter 保留其原始阶段因子，再乘回继承与 target alpha，避免盖掉 owner/父画布透明度。局部效果 owner 本身也必须是顶层 screen-space，且经同一 Core 优先级解析后的位移、旋转和缩放保持中性；改变这些值的事件/绑定、会把 owner 移出 screen-space 的绑定，以及切到非中性变换的样式都会被拒绝。只改 `opacity`、`visible`、`color` 等呈现状态的样式切换可保留；owner 的淡入淡出仍由 Core 应用一次。`render.mjs` 在发现这些实例后校验目标/字段、校验并加载 catalog pin 的 Huashu 原函数闭包、注册本地 adapter，并在 manifest 记录实例、目标、实际调用、相位及透明度合成证据；旧 `--template-effects huashu-art-motion-dg` 入口仍有效。`available` 只表示已接线；当前实际行为证据分别是 DG 的源函数浏览器夹具和 MO 目标显现的 render CLI 编码夹具，不代表整体作品效果或听感质量已通过。

`prepare` 按 entry 的实际 renderer 与原接口核对输入，验证对应源码 hash，并写出准备后的 spec 与 `.assets.json` 收据；clip 输入引用的图片或帧须在本地 `assets-root` 下且有权用于本片。`preview` 用原始入口按指定时点采样 PNG；需要多个状态时传 `--samples`。`render` 调用相应原始 `renderFrame(t)` 接口生成 PNG 或 MP4，可传 `--manifest` 记录证据。生成前核对输出、缓存目录及运行时；遵从项目实际工作盘约定，避免覆盖既有文件。只有 catalog 明确接到受支持 renderer 的条目可调用；不要把其他 renderer 或局部源码索引说成会自动运行。

Moessif/code-video-showcase 的两页使用 `native-html-canvas-template` renderer，调用原始 HTML 页、`common.js`/`themes.js` 与原 `window.renderFrame(t)`。`motion-code-video-showcase-big-card` 固定为 1920×1080、一秒，保留原 layout=0..3 分支（当前 2/3 都使用居中构图）、两次 slam 与 HUD；实际 query 控制是 `layout/index/total/color/first/keyword/brand/theme`，不接受 `t0/speed/dur/title/subtitle`。`motion-code-video-showcase-segment` 保留原 impact/主题/背景构图；`duration/t0/speed` 由原 `createSegment` 消费，品牌、标题、字幕与可选的胶囊名称/分类由适配层对源 HTML 文字作 JSON 安全替换。胶囊字段 `capsuleName` 默认“章节”，`capsuleCategory` 默认空文本；它们是本地适配字段，不是上游 query 控制。为隔离前序 Canvas 对齐状态，适配层在两处原 `drawCapsuleLabel` 调用外包 `save`、显式左对齐和 `restore`，不改上游绘图函数或 renderFrame；收据分别记录上游 HTML pin、派生 HTML hash、文字替换和调用点补丁。页面是单行文字布局；`aqua-morandi` 玻璃分支不读取 subtitle，故该主题下不能把字幕声称为有效字段。两页画布尺寸固定，duration × fps 必须整帧对齐。主题色会走原主题函数；主题 `type.fonts` 是元数据，页面并未据此改变 `ctx.font`。

`templates.mjs preview/render` 默认用本机 Chrome/Chromium 的 software/SwiftShader capture，并在原始画布创建时请求 `willReadFrequently`；manifest 会记录浏览器可执行程序、capture mode、源码校验、实际请求资源和采样结果。像素重复性证据只覆盖这一捕获条件。`--hardware` 允许诊断 GPU 路径，但它的渲染仍按当前 browser/driver 条件解释，不能继承默认软件路径的 seek/像素稳定结论；旧 `--software` 作为兼容写法保留。默认方式可直接运行，不需要额外加 flag。

具体前置条件按原接口字段判断，而不是按模板名猜素材需求。当前 `huashu-y2-vox` 的原 `init()` 会消费 `title` 和 `point` cue，因此纯文字索引卡也可独立调用；只有 spec 实际包含 `image`/`clip` cue 时，才须为该素材提供有权使用的本地图片或帧。相反，`huashu-y4-storytime` 原 renderer 会读取 `data.character.frames` 并在缺少角色帧时失败，所以它仍列为 conditional。`huashu-t3-finance-chart` 必须提供非空 `data.series`；不能因只写了标题就把空图当作成功预览。整段场景/页面记录与局部 effect 分别登记在 catalog 的 `templates` 和 `effects`；当前状态、数量及每项能否调用以 catalog 和 `list` 的筛选结果为准，不把 source-only 场景、原生工程、页面记录或可查询性说成可调用，也不把局部 effect 计作整段模板。

`huashu-art-motion-dg` 是另一个可直接预载的局部效果接口：

```sh
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/render.mjs" \
  --scene /absolute/scene.json \
  --output /absolute/effect-preview.mp4 \
  --cache-dir /absolute/project/.cache/tmp/motion-run \
  --draw-module /absolute/draw.js \
  --template-effects huashu-art-motion-dg
```

`render.mjs` 会先按 catalog 中的 SHA/Git blob pin 校验并按 `show huashu-art-motion-dg` 给出的原始顺序加载 classic script，再载入本地 draw-module。该模块须注册 `window.MOTION_RENDERERS["custom:<name>"]`，从源场景的 `custom:<name>` 对象绘制，并按适配器登记的签名调用 `window.DG` 原函数；具体函数与数量以 effect 条目及 `show` 为准。runner 对被接线的原函数加透传计数，不改 receiver、参数、返回值或算法，调用计数与 closure pin 写入 manifest。传入参数、场景构图、局部时钟及文字图形合成仍由调用方负责；这条接口不把 primitive 升格为整片模板，也不含字体文件、角色或其他演示素材。当前是代码/登记可调用状态；Chrome/MP4 实际调用仍以实现验证报告为准，未验证前不能宣称动态行为已通过。

## 按语义判断复用尺度，不让模板替内容编排

主线把用途、观众、发布场景、实际材料与证据先编入已有内容/素材蓝图，再从每个有序观看单元要说明、对照、展示或体验的关系，以及前后态、进入条件、信息先后、承重对象、素材权限/可用性、锁定范围和时间基准判断复用尺度。需要整片组织时，continuous、montage 或 hybrid 的选择由跨单元的对象接续、并置比较、转折，或纯体验任务中已定的形式/材质/节奏进程决定；切点要说明承接、比较、转折或体验变奏的作用，剪辑路线本身不替段落选画风。只需改变局部对象/图层时，优先从 `effects` 查询局部效果，用 `show` 核对目标、真实参数、共享 phase、结束行为和依赖；需要完整来源构图或整段机制时，才从 `templates` 查询场景/页面模板，并核对 `contentFit`、renderer/availability、cue/data 入口、固定机制、前置条件、source pin 与许可。把候选带入视觉设计，再检查所选作用范围内的机制是否表现本单元核心关系、状态变化与阅读时间；不按风格名称相似、目录类别、预览图好看或参数字段听起来相近来选。局部效果只约束已登记目标、属性和时段，场景模板的原生布局只约束被选中的整段范围；已有蓝图修改任务先判断对应范围是否仍合适，不因默认查库而无故更换。

先比较要完成的对象/状态变化、时间语义、固定行为和真实消费者，再比较来源；普通 Core 插值、静态 effect、可调用原版、本地专业实现与 source-only 研究记录必须保留各自身份。同名函数或相近参数不代表机制等价。catalog 中的状态、来源 pin、精确许可、输入/输出、固定机制、参数、完成行为与消费位置都须能核对；只有可调用且许可条件符合的原版才能按原效果使用。未授权或不可调用时，可选择有许可的本地实现或沿专业方法制作并标清其来源与差异，不能把重做称为原版保真。用户锁定来源或效果时维持该范围，真实能力不足就报告相应缺口。

整段场景模板可以承担整段，也可以只用于一组连续镜头；每段按自己的观看任务选，允许相邻段调用不同模板。不要把一句一句拆成一个模板调用，不要求每段换颜色/布局/模板，也不默认全片使用同一套模板。用户明确选择某个模板时，保留其原生组成与效果机制，调整范围只限于该模板实际消费的字段和用户锁定项；不因“需要原创”而重写效果，也不因为模板可用而替用户改换内容或成片方向。

上游模板内部固定的构图、标题位置、图表结构、字体层级、转场与运动可以是合法的设计结果。反对全片一成不变的单一外壳，只针对未承担内容或观看职责、把所有段落变成槽位陈列的处理；不能据此否决一个在当前段落中真实承载比较、数据阅读、路径构建或关系解释的原生版式。颜色也不预设锁定：只有用户锁定或模板字段确实控制时才固定/调整；不要声称不存在的自由度。

`sourceSchema` 保留上游声明的原始字段与必需项，但声明本身不证明 renderer 会读取它。实际可调参数以 catalog 的 `parameters`/`trueParameterization` 及对应源码消费证据为准；若两者不一致，catalog 须保留原声明并在 `declaredOnlyIgnoredSpecData` 标出未被消费的字段，主线与三级不得把这类字段当作有效参数传递或承诺画面会响应。例如 `data.camera` 虽被原 schema 声明，t1、t3、y3、y4、y5 renderer 未读取，只有 t2、y1、y2 有源码消费证据。整段模板可以固定其原生构图、动画曲线、版式、层级或交接方式；这些是效果的一部分，不要求每次重新设计。只填源码实际消费的字段，保持未暴露的部分不变；不要把局部 primitive、目录项或一个固定叙事实例说成整段通用模板。若固定机制与当前内容不合，主线再选另一个候选或沿普通 Motion 路径完成，不伪造参数、改写算法或强套模板。

`cueCommon` / `trueParameterization.cueFields` 是 clip runtime 接受的共用传输包络，不代表每个模板或每种 cue 都会把这些字段绘制出来；实际画面响应取决于所选 grammar、cue kind 和原实现分支，须按该条目的源码消费证据填写有效字段。

## 局部方法、工程输入与声音分开接线

主线按观看单元前后态判断复用尺度；局部变化优先从 `effects` 选择已有调用实例，只有完整来源构图或整段机制确实承担任务时才从 `templates` 选场景模板。三级方法从对应 `show` 与源接口核实局部对象、真实字段、共享 phase、时间范围和素材条件，返回目标绑定、`phaseId`、局部固定约束与未解冲突，接回同一段落蓝图供主线编排。局部效果只约束登记的对象/属性/时段，整段 `templateId` 仅用于场景模板分支。三级不另选全片皮肤、不调用兄弟模块、不改原算法；若目标或动作超出已接通接口，报告具体缺口，交主线决定换用候选、组合其他已接通方法或沿普通 Motion 路径完成。

`huashu-art-motion` 代码按 MIT 使用，保留上游 `LICENSE`；其字体按 SIL Open Font License 1.1 使用，并保留原字体许可证文件。保留 catalog 登记的 commit、逐文件 hash、入口与依赖闭包，不直接编辑 `templates/upstream/`；局部接线放适配/准备层或本地代码中，并记录与源接口的差异，不能把改过的算法仍标成原样上游效果。不得把上游演示视频、作者角色帧/形象或未随包的素材当作 MIT 资产；只有用户有权提供的本地素材可进入实际 spec。其他来源各自按 catalog 的许可和素材范围处理，不能从代码许可证推导照片/字体/角色资产许可。

Huashu Motion 主模板与 `huashu-art-motion` 的局部 effect/clip adapter 是两套运行闭包。主模板须按该模板自己的 copy map、运行入口及固定依赖准备工程；不能因文件名相同，就拿 art-motion 的 `clip.js`、lib 或 grammar 替代主模板 runtime。t3/y5 的字段和 cue 仍以各自真实源码消费为准；如果某段需要的 runtime、字体或素材不在对应闭包中，只暂停该候选并报告缺项，不把目录存在或源索引写成可运行。

当前主模板中 `huashu-motion-finance-chart` 与 `huashu-motion-kinetic-type` 使用 `native-om-template-source`，状态仍是 `conditional`；此状态不能因整片入口接线而提升。它们的 `prepare` 接口不同于上方通用模板示例：native `--output` 必须是一个尚不存在的工程目录，prepare 会在其中生成 `laohu-native-template.json`；示例中的通用 `prepare <template-id> --input ... --output /absolute/prepared.json` 不适用于 native 模板。

```sh
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" prepare huashu-motion-finance-chart --input /absolute/finance-spec.json --output /absolute/project/.cache/tmp/huashu/new-finance-project --work-root /absolute/project/.cache/tmp/huashu
node "{PROJECT_ROOT}/.agents/skills/laohu-motion/scripts/templates.mjs" render huashu-motion-finance-chart --spec /absolute/project/.cache/tmp/huashu/new-finance-project/laohu-native-template.json --output /absolute/project/.cache/tmp/huashu/finance-chart.mp4 --work-root /absolute/project/.cache/tmp/huashu
```

这里 native `--input` 使用 `laohu.huashu-native-template-spec/1`，`--spec` 可直接指向该原始 spec，也可指向 prepare 生成的工程内收据；直接传原始 spec 给 `render` 或 `preview` 时，命令会先准备隔离工程再执行目标动作。finance-chart 必须提交有效非空 series，kinetic-type 的字段依原 schema/source 消费。整片由工具链 Reference 定义的 `--film-blueprint` 入口调用 adapter。Huashu OM 与 Motion scene 保持 `/1` Film Blueprint 分支；Video Shotcraft 用隔离的 `laohu.huashu-film-blueprint/2` 分支，详见[源接入规则](video-shotcraft-integration.md)及[工具链 Reference](toolchain-render-and-check.md)。两路 renderer 闭包不混用，视频组装仍只产 picture-only；`/1` 为无声硬切且没有转场，`/2` 只支持其已登记的 FlashCut，不代表任何一路可以直接混音。

画面与声音是两条独立制作链。当前 `native-clip` renderer 只产画面，不自动处理原音、BGM、SFX 或 ASR timeline；选中某个视觉模板不代表应该配音效，也不能把模板示例中的声画时钟接入用户作品。先由 Motion 主线按现有 [声音设计](sound-design.md) 判断每条音轨的职责与授权，再由 [ASR 时间绑定](speech-cue-binding.md) 校验剪后时间轴；需要视听音乐、SFX 或源剪辑专业方法时，在 Motion 已授权范围内交接给 [Arrangement 主 Skill](../../laohu-arrangement/SKILL.md)，由其自身路由决定是否读取 SFX 子级，再将结果写入既有 audio-plan。Huashu Motion 的 `OM.sfx`/合成代码只有被 catalog 登记为可调用后才可作为本地音效接口；源码观察本身不等于本地 CLI 接通或已试听。

## 失败时停止依赖项并返回主线

- `verify` 报登记源 hash、Git blob、入口闭包、effect 加载顺序或目录内容不一致时，停止该候选，不手改上游副本来“修绿”；由维护负责人核查 pin 与恢复副本。`verify` 不判定许可证法律范围，许可须依据 catalog 登记、随包许可证与实际素材来源另行确认。
- `prepare` 报字段、cue 类型、素材路径或角色帧缺失时，只补用户有权提供且 schema 真正需要的输入；缺失素材不可从 preview/demo 名称猜文件。若仍不匹配，返回具体错误并换适用实现。
- `preview`/`render` 启动失败或运行时缺项时，先核对项目已有工具与本轮授权；可在既有授权、同盘和可恢复范围内处理普通本地接线或依赖。只有下一步涉及新增费用、全局配置、超出本轮范围的素材/服务或其他须由用户取舍的变化时，才暂停依赖该项的部分并说明具体影响；不因运行缺项一概要求用户重授权。
- 普通开放请求没有合适的可调用模板时，先按本 Reference 的 `sourceImplementationIndex` 条件检查是否有适用且获授权可接入的原实现；可接入时在本作品工程内按真实接口局部使用，否则按内容和本地 Motion 能力继续制作。明确限定只复用参考的请求按本 Reference 开头的接通/报告条件处理。不把源代码索引、预览、schema、效果 recipe 或风格说明升级成可运行模板，也不要求用户先选一个模板才继续。

把所选 `templateId`、commit/hash、适用片段、原生固定机制、实际可调字段、spec/cue 与素材路径/hash/许可、准备/预览/渲染命令和结果写入已有蓝图/工程记录。`verify` 是源码结构证据，`prepare` 是输入与本地素材证据，`preview` 是抽样状态，`render` 才形成目标媒体；均不替代 [工具、渲染与媒介检查](toolchain-render-and-check.md) 的字体/遮挡/全段播放检查。没有真实画面复查时不宣称效果通过；声音未实际试听仍须保持候选/未审核状态。
