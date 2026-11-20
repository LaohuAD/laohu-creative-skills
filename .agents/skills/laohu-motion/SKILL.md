---
name: laohu-motion
description: 当用户要构思、制作、修改或审查代码动画、动态图形、动态排版、UI 动效，或把这些画面与录屏、实拍、口播混合时调用；新项目默认使用本地 Motion Showreel 原生流程，已有工程按原技术栈兼容维护。
---

开始前解析本正式入口所在目录为 {SKILL_DIR}，读取 {SKILL_DIR}/../../../docs/runtime.md，恢复本轮材料、目标、授权、保护项与任务状态。制作交付以能实际查看的工程与媒体为准。只委托方案时给出可实施设计，只委托审查时交付定位证据和判断。保存位置依本轮授权。

# 动画导演职责

把主题、稿件、真实录音、录屏或已有工程落实成具体的视听选择。观众要理解什么、画面在何时让人发现变化、哪些状态必须跨段延续，都要能在具体镜头中看见。需要时组合代码画面、照片、实拍、录屏、文本和声音，分别核对来源与所呈现的事实。实际产品操作以真实状态为准，重绘或模拟标明其身份。旁白、音乐、音效和沉默各按本片职责决定，循环和无声动效使用自己的事件节奏。

新片从本地 Motion Showreel 入口形成同一份 `brief.md`、确定性页面、统一事件时钟与实际产物。既有工程的局部修订沿作品的实际输入、时间线、渲染和混音消费者走，核对改动如何进入当前版本。确需还原旧 API 时按对应[兼容文档](references/legacy/README.md)查询。新建与明确全新重做未指定画幅时取 16:9，明确规格优先。已确认的旧工程局部修订继续使用本轮所依的规格。设计、预览与导出核对同一画幅与帧率。

## 1. 从材料确定要解决的观看问题

从原稿、实际时间、现有素材和用户锁定项辨认对象、事实、数量、证据状态和因果。用材料决定所需的观察侧、揭示顺序、文字主次、运动或停留，按需处理兴趣和情绪。要复用真实口播时间时，读取与音源及剪辑版本匹配的 ASRcut 结果。句段使用句段精度，词级触发使用实际词时码或已核对的音频标注。先给观众所需的阅读语境，只有语义重点有贡献时才按词触发。连续动作可跨多句或多条字幕。同一成片时钟由本片已确认的音轨或画面事件决定，真实剪辑或重排按 ASRcut 的授权和接口执行。

完整新设计或重设主视听语言时，由 [Analysis](../laohu-analysis/SKILL.md) 接手视觉方向和导演稿，读取[动画视觉设计](../laohu-analysis/references/motion-design.md)。交给它具体内容、事实来源、可用素材、语音或页面时钟、用户锁定项和仍开放的决定。对局部技术探针、已锁定方向的忠实制作或既有工程修订，按受影响的观看单元复核即可。

新方向先接收 L0 星图。先看全库，按本片未决问题打开 L1 类别或比较一组候选，每个实际采用的 ID 读完整 L2；落实代码时按需查可用 L3。仅设计且未授权保存时，可直接用只读资源命令。检索包含新旧风格、图解效果、光色与材料、镜头/转场、源画面、排印和动效，先比较能够解决任务的分支，再决定是采用整体方法、完整动作组还是局部属性。候选多少由真实问题和差异决定。权衡具体外观、尺寸/布局、动作阶段、阅读和实际素材条件，选择之后保留与其职责相符的原版参数和例外。来源示范的镜头顺序、故事与固定时长只用于理解其机制。已指定风格或对标时，在相应范围忠实适配；多来源共同承担一镜时为各自确定具体对象、过程和边界。目录、视觉证据、可运行状态与许可各从对应来源核对。[资源查阅](references/showreel-runtime.md#设计输入与资源查阅)

新片要比较文字表现时，用真实原句和观看任务查字体及排印用法，在当前尺寸与目标画面上试排，核对繁简、英文、数字、标点和字重。主标题、关键信息、需要读清的标注按其职责确定内容、字形、位置与可读窗口；题眼和解释文案可按需交 Title 或 Writing。正文、图像里的字及双语字幕的相应消费者和检验见[字体、字幕与可读性](references/typography-and-legibility.md)。真实素材不足时把缺项留在它影响的镜头，沿允许的范围获取、标注替代来源或继续其他可完成的部分。

## 2. 先用真画面确认方向

确认 work root 和同卷缓存，按[运行入口](references/showreel-runtime.md)检查依赖，建立或打开同一项目的本地工作台，核验浏览器实际页面。阶段和可复查材料有变化时更新同一页。服务已起但页面无法核验时，报告实际状态和可访问的本机地址。

Analysis 在原版 [八 XML 块](templates/runtime/laohu-showreel/references/brief-template.md) 的同一个 `brief.md` 写方向探索输入。明确观众任务、事实与锁定项，写出拟采用资源对本片具体画面的贡献，确定整体构图、用字、颜色、材料、空间和镜头的性格。挑选能检验承重变化的代表时刻，说明每个时点应看见的对象、形态和来去关系。先按[探索与正式制作](references/production-collaboration.md)建探索工程，取得两到三张能显示差异的实帧或同一方向的代表状态，并按实际画面承担的连续动作发布可播放动态小样。只需目标图时明确其身份；用户明确委托实图或 Cover 方向帧时，按[两种方向帧](references/production-collaboration.md#方向帧的两种来源与回交)交接。在同一事件上可用目标图和工程实渲核对差距。

请用户按画面与事件确认方向，或记录明确豁免的原话及范围。方向选择的对象是可见画面和当前样片。确认范围涉及主风格、画幅或其他关键设计变化时，核对新的方向证据。具体方向帧、小样和工作台记录按[制作协作](references/production-collaboration.md)及[运行入口](references/showreel-runtime.md#方向帧与同一状态的工程实渲)办理。

## 3. 定案后扩到全片，制作与自查

在同一 Brief 展开每个观看单元的稿件/素材和起止，写出可见的对象与材料、触发、形态和位置变化、阶段、落定、反馈、读清时间及前后连接。按延续关系和实际节奏决定观看单元，声画角色明晰盖过目录套板。全片有可辨识的视觉身份，段落构图、景别、空间、密度和动作随观看任务发展。Analysis 汇总阶段结果，按[制作片段及工作台交接](references/production-collaboration.md#时间片段与工作台交接)补齐待制作范围并审稿。Motion 按片段核回原料、导演决定与预期画面。关键决定仍会改变观看结果时，带着片段 ID 和实际时点返给 Analysis 修改同一 Brief，再落实受影响的片段。

进入实现前读原版[页面契约](templates/runtime/laohu-showreel/references/stack.md)，按本片用途和镜头问题选择后面的原版参考。新建用本地入口管理、按同卷路径装依赖和生成媒体。页面提供 `window.DUR`、`window.render(t)` 和 `window.READY`，等字体、纹理、模型或实拍跳帧准备后才置就绪。任意重复、乱序或 seek 取帧都由同一时间、输入与种子决定。真实录屏和实拍用可定位的帧替代自然播放时钟。对象、镜头、转场、字幕和声音接到实际时间源，共享事件 ID 和具体相位。统一画风允许换景别和版式，跨镜按实际承担意义的身份、相对位置、动势、材料和因果接续。具备可独立验收的段落且用户已启用 Luna 时，由 Commander 按[可验收动作段](references/production-collaboration.md#按可验收的动作段并行)检验分工与实际接缝。

新建原生页面可直接采用适合本片的 HTML/CSS、Canvas、SVG、着色器、Three.js 或真实媒体。采用成熟实现前看必要的原始代码、已开放参数、真实输入和许可，按整镜、动作组或局部媒体的责任保留决定表现的布局、曲线、材质、运动收束与依赖。接口不可用时返回本片实际任务继续比较其他可行处理。样图或风格卡定义设计依据，实际代码与当前素材须实渲核验。[动作语言与接线](references/motion-language.md)

有声时先按本片情绪与叙事需要定各声部职责，长片依 Brief 的分段声音变化（`audio-arc`）推进选材。运行 `laohu-showreel.mjs audio-map` 浏览音乐与音效候选，再核对可用许可、画面相位、声源 hitpoint 和与旁白的距离。具备真实音频听审与情绪识别能力的多模态执行者，可将音乐库与音效库视作参考和可选素材池（同风格库/动效库），在用户未锁定曲目或禁止原创时，以把成片情绪辅助到位为核心，自由选用试听合适的成品，或参考其质感自行原创合成（`synth`/`tone`/`layer` 或与成品混搭），并实听迭代生成的音频与声画合片；不具备真实听审能力时仍守成品优先，原创生成须经用户明确授权。TTS 始终按授权文本执行，付费外部生成另需授权，静音片保持静音；导出当前编辑会话使用的最终混音。具体资产、时间和混音写法见[声音与 Arrangement 交接](references/showreel-sound.md)。多章节讲解在需要定位时为当前片章建立清楚又次要的章导航，以真实章节事件生成平台索引和工作台可跳转预览。规则见[成片片段与章节](references/showreel-runtime.md#可控制的成片片段)。

## 4. 在实际预览确认后导出

先核对片长、分辨率、帧率、资产就绪、重复渲染、字体读窗、字幕和声音。再连续看承重动作前中后与接缝，连听声画关系。长片按需要分章构建，另看代表性的中段和后段是否有与观看任务相称的构图、景别、层次和节奏发展；切换在章节边界前后连续评估。循环核对首尾两个媒介状态，口播核对真实同步和完整性。[原版审片](templates/runtime/laohu-showreel/references/review.md) · [长片与分章](templates/runtime/laohu-showreel/references/long-form.md)

发布同一版本的实际最终预览。取得本次预览的导出确认或明确范围的豁免后，才走正式导出。若用户提出修改，定位工程中的实际片段与版本，按反馈调整设计或实现，在当前预览核对受影响位置。交付同一工程的 Brief、代码、素材与来源授权、实际成片、适用技术与媒体检查结果。报告真实观看、试听和测量范围，自动检查结论限于实测技术条件，接收者效果另有对应证据。

## References

- [Showreel 运行](references/showreel-runtime.md)涵盖环境、目录命令、工作台、设计帧与媒体检查。
- [制作协作](references/production-collaboration.md)涵盖同一 Brief 的探索、交接、时间片段和正式制作。
- [动作语言](references/motion-language.md)、[内容到运动](references/meaning-to-motion.md)与[视觉构图](references/visual-design.md)按承重动作、解释关系和画面层次的具体问题读取。
- [字体与可读性](references/typography-and-legibility.md)及[原生字幕与章节](templates/runtime/native-presentation/README.md)给出真实消费与检查方法。需要真实词锚时读 [口播时间绑定](references/speech-cue-binding.md)。
- 原版 [formats](templates/runtime/laohu-showreel/references/formats.md)、[craft](templates/runtime/laohu-showreel/references/craft.md)、[recipes](templates/runtime/laohu-showreel/references/recipes.md)、[narration](templates/runtime/laohu-showreel/references/narration.md)、[editor](templates/runtime/laohu-showreel/references/editor.md)按作品用途、手法、录音与工作台问题选读。
- [动效目录](assets/motion-library/README.md)、[风格 Gallery](templates/styles/gallery/README.md)和[字体样张](assets/typography/README.md)可供人工比较；本地 `benchmark/` 按授权承接本用户对标来源与拆解证据。
