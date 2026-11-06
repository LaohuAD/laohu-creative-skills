# laohu-motion 来源台账

本文件仅供维护者追溯方法研究，不是运行 Reference，也不是未来动画任务的外链依赖。来源记录区分“原文/实现中实际观察到什么”与“本地规则如何改写”；来源存在、被采用或获许可均不证明动画效果或接收质量。此前固定版本与文档条目记录核查至 2026-10-22；2026-10-26 的预览、声音/排版参考和本地接口条目，以及 2026-10-27 补列的固定提交源码范围，分别在对应小节注明。

## GitHub 实际模板

### `motiontemplates/all`：目录仓库，不是模板运行时代码

- 读取 `README.md` 与 GitHub 仓库树；固定提交 [`25cee2cd9f2bdaa4490498ab666634a8df2dcbfd`](https://github.com/motiontemplates/all/tree/25cee2cd9f2bdaa4490498ab666634a8df2dcbfd)。检查时 `refs/heads/main` 也是该提交。
- 树含 15 项目录网站/目录数据/说明资源；未见模板源码目录、package manifest 或许可证文件，GitHub license metadata 为 null。README 中的展示、推广文字只作为来源内容读取，不作为执行指令。
- 该仓库的贡献是发现一个具体模板来源；不能据其目录结构推出通用场景、素材和时序解耦方法，也不能把目录推广语转为本地规则。

### `motiontemplates/385712`：一个有主题、带部分参数接口的模板实例

- 固定提交 [`9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae`](https://github.com/motiontemplates/385712/tree/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template)，已核与 `refs/heads/main` 一致；提交日期为 2026-10-19。GitHub license metadata 为 MIT。它是特定 Kinetic Tech 主题模板，不代表中性动画架构；仓库许可证不自动覆盖其中外部素材的使用权。
- 实际读取 `template/core/main.js` 全文、`template/core/scenes/s01.js` 全文、`template/core/data/timemap.js` 全文；另读 `template/params.schema.json` 顶层及 2445–2558 行。可直看 [`main.js` 5–16 行](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/core/main.js#L5-L16)、[`s01.js` 6–16 行](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/core/scenes/s01.js#L6-L16)、[`s01.js` 64–92 行](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/core/scenes/s01.js#L64-L92)、[`timemap.js`](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/core/data/timemap.js)、[`params.schema.json` 顶层](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/params.schema.json#L1-L25) 与 [`2445–2558 行](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/params.schema.json#L2445-L2558)。包名/依赖信息从同一提交的 `template/package.json` 读取；未安装依赖、运行或渲染模板。
- **来源观察：**入口 `renderAt(t)` 以全片时间 `t` 选中有效场景并调用场景 `update(t)`；示例场景呈现多个对象的空间运动、在强调处汇聚注意、文字按层次接续，且由 cue 驱动时间变化。场景实现把固定时段、主题构图、文本键、素材路径、cue 与运动更新放在相邻实现中；schema 虽提供 duration/scenes/content/media 等参数及媒体角色绑定，仍不足以证明内容、素材、时序、场景和皮肤可任意独立替换。timemap 是该模板单独的数据安排，不是普遍时序契约。
- **本地改写：**仅在本题需要时迁移“注意聚散、事件落点、先后层次”等关系；先辨必要的身份/时序/因果，再按新对象重新构图与编排。不得复制主题、蓝金皮肤、固定卡片数量或每镜同一入场动作；不得把 `update(t)` 误写成必须先局部化的时间接口。该实例只证明这些设计/代码关系在该源码中可观察，不证明其效果优于其他做法。

## 画风与动画方法来源

### `alchaincyf/huashu-art-motion`

- 实际读取 `SKILL.md` 全文、`references/镜头语言.md` 全文、`references/15-跨场景风格提炼.md` 全文（45 行）、`references/09-视频动画语法.md` 的前 64 行（Commander 原始记录为 0–64；该文件其余部分未读）。对应路径分别为 [`SKILL.md`](https://github.com/alchaincyf/huashu-art-motion/blob/8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c/SKILL.md)、[`镜头语言.md`](https://github.com/alchaincyf/huashu-art-motion/blob/8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c/references/镜头语言.md)、[`15-跨场景风格提炼.md`](https://github.com/alchaincyf/huashu-art-motion/blob/8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c/references/15-跨场景风格提炼.md)、[`09-视频动画语法.md` 前 64 行](https://github.com/alchaincyf/huashu-art-motion/blob/8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c/references/09-视频动画语法.md#L1-L64)。GitHub `refs/heads/main` 与 API 在检查时均返回提交 [`8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c`](https://github.com/alchaincyf/huashu-art-motion/commit/8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c)，日期 2026-10-16；GitHub license metadata 为 MIT。因此此来源身份确与本轮 `main` 读取相同，不是依据旧三级文件的 hash 推定。
- **来源观察：**该来源区分风格语言、构图倾向、原作内容母题和叙事动作；新题材需要重新组织画面；在风格机制要求时材质可以贯穿主体与背景；静帧构图与动态表现需分别成立。
- **本地改写：**仅将这些区分写入现有 `visual-design.md` 的参考迁移方法，并按本题目的选择适用。来源内的固定作品/方案数量、配色禁令、模型分档、平台或渠道规则不迁移成通用 motion 规则；原有六个兼容 ID 在 2026-10-26 编译为按对象/动作触发的局部方法模块；详细路由与操作见主 Skill 和相应子级。

### `3b1b/videos`：注意力机制的逐步讲解实现

- 固定提交 [`85e18b48b17aafdf4cd351b9c4e437fed5eda512`](https://github.com/3b1b/videos/tree/85e18b48b17aafdf4cd351b9c4e437fed5eda512)；读取 `_2024/transformers/attention.py` 中 `AttentionPatterns.construct` 及相关注释单元。可定位的展示单元包括 [`Ask questions`](https://github.com/3b1b/videos/blob/85e18b48b17aafdf4cd351b9c4e437fed5eda512/_2024/transformers/attention.py#L312)、[`Show column of weights`](https://github.com/3b1b/videos/blob/85e18b48b17aafdf4cd351b9c4e437fed5eda512/_2024/transformers/attention.py#L1085) 与 [`Show Delta E`](https://github.com/3b1b/videos/blob/85e18b48b17aafdf4cd351b9c4e437fed5eda512/_2024/transformers/attention.py#L1176)。
- **来源观察：**代码围绕同一个目标词构造讲解：先显示它向来源词询问及相应关联权重，再将各来源词的 Value 按权重组成各项贡献、汇成 `ΔE`，最后回到同一目标更新为 `E′`。演示中有随机初始化，也手动设置部分示例分数；这些值用于代码讲解，不是模型实测结果。本轮只核对了源码与注释，没有独立观看其渲染视频。
- **本地改写：**若本题解释“其他位置与当前处理位置的关联会怎样影响组合结果”，就保留目标对象身份，让来源、不同贡献、组合结果和目标更新形成可追踪的动作链；关系差异须真正参与后续结果，不能只汇入不区分输入的泛化结果框。无来源实测数值时可用明确标注的示意关系，不能冒充精确权重。此方法是本地讲解选择，不要求短片照搬 Q/K/V 公式、英文示例句、源配色或逐阶段动画模板。
- **一手理论出处：**Vaswani 等人，《Attention Is All You Need》，§3.2 “Scaled Dot-Product Attention”，[arXiv:1706.03762](https://arxiv.org/abs/1706.03762)。该节说明按 query 与 key 的兼容度得到权重，并以这些权重对 value 求和。它支撑解释加权合成机制的依据，不证明 3b1b 教学代码中的分数或任何本地动画数值来自实际模型运行。

## 官方设计与实现文档

- Google Design Library，[“Making motion meaningful”](https://design.google/library/making-motion-meaningful)，2026-10-22 读取正文全文。Photos 删除示例是整个网格左移；行移动过程中转换中的图像快速交叉淡化，避免每项各自沿交叉路径补位。Kids、Duo、Android 等案例展示不同产品目标下运动职责会变化。**本地改写：**按当前集合状态转换决定是否整体重排、哪些区域需要交叉淡化；以任务目标决定运动可承担解释、体验或反馈，这些个案不是普遍用户偏好或效果证明。
- Remotion 官方文档，[Animating properties](https://www.remotion.dev/docs/animating-properties)，2026-10-22 读取第 112–194 行。该范围说明帧驱动值如何按 fps 计算，并涵盖插值边界/clamp 与避免 CSS 时间驱动的做法。**本地改写：**运行规则要求先辨消费接口的时钟，按需换算；帧驱动的姿态从绝对时间/帧可重复计算，支持任意帧 seek，而不是依赖播放历史。文档不决定本地工程 fps 或镜头时长。

## 画面参考与声音来源核对

### `motiontemplates/960723` 预览：全画幅协同变化的画面观察

- 查看预览 [`demo.mp4`](https://media.openaicut.com/previews/613/draft-en-e06d1f42b0b9.mp4) 的元数据和连续片段取帧。预览约 121.933 秒、1920×1080；在 4.46–13.16 秒范围取样，可见标题/人物/形状与色块切换成图表和另一套空间构图的连续变化。此条证据是**预览画面取帧**，不是其源码证明；不对未审阅时段作全片概括。
- 相关 GitHub [`motiontemplates/960723`](https://github.com/motiontemplates/960723) 当前可见仓库材料为说明/schema/静态资产，没有读到场景实现代码。因此只迁移预览里可观察的画面组织问题：标题、对象、背景、尺度、构图、颜色与动作可共同服务一个阶段并随内容变化；不推断不可见的参数、事件或内部架构。
- **声音状态：**本轮没有试听该预览音轨，不记录其音色、音乐、音效或听感判断。预览中是否存在音轨不构成“听过”的证据。

### `motiontemplates/385712` 实际预览：单个镜头的空间与构图变化

- 参考媒体 [`demo.mp4`](https://motiontemplates.github.io/385712/assets/demo.mp4)，约 24 秒、1280×720；在 1.07–8.19 秒范围查看连续画面，看到倾斜的信息面、尺度强调、标题/人物分区与网格图表等构图变化。该连续画面观察用于补充已核源码条目，不将预览时间直接当作源码全局时钟。
- **声音状态：**没有试听该预览音轨；其画面取样不支持任何音质判断。

### `motiontemplates/385712` 固定提交中的 S02 与音频事件表

- 固定提交 [`9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae`](https://github.com/motiontemplates/385712/tree/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae)；核读 [`template/core/scenes/s02_04.js`](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/core/scenes/s02_04.js) 的 S02 实现、[`template/core/audio-events.json`](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/core/audio-events.json) 的事件/混音记录，以及 [`template/mix.py` 第 15–79 行](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/mix.py#L15-L79) 的实际混音消费者；未运行模板或渲染源码。
- **来源观察与边界：**场景构图/动作与音频事件表共同进入模板的消费链。`mix.py` 读取 `settings.json`、`audio-events.json` 与 `runtime-events.json`；native 分支将 runtime 的 `sfxCalls`/`native`/`sfxOwners` 与 source 调用匹配，把 source 时间按选定 span 映射到 `outputTime`，合成/重采样并保留跨普通场景的尾音。旁白与音乐分轨解码；检测到非零旁白时，以约 40ms 能量窗和约 250ms 平滑控制音乐让位；随后合轨、做片尾淡变、按有无旁白选择响度目标、FFmpeg 限幅并封装 AAC。以上是源码读取到的消费者路径，不是运行或试听结论；模板中的固定响度/限幅参数不迁移为本地规则，预览声音没有试听。
- **本地改写：**把标题/对象/构图生命周期与音频 cue 都追到真实消费位置；新作品从同一内容/事件时钟安排画面和声音，再按当前任务重构，不复制模板布局或声音安排。

### `alchaincyf/huashu-motion` v0.2.0 视频样本

- 查看发布媒体 [`huashu-design-launch.mp4`](https://github.com/alchaincyf/huashu-motion/releases/download/v0.2.0/huashu-design-launch.mp4) 与 [`deepseek-v4.1-flash-specimen.mp4`](https://github.com/alchaincyf/huashu-motion/releases/download/v0.2.0/deepseek-v4.1-flash-specimen.mp4) 的短时段/样帧，作为全画幅主体、文字和对象重组的视觉样本。第二条文件名是 huashu-motion 发布的样本；不称其为 DeepSeek 官方作品或模型官方视频。
- **声音状态：**没有试听这两段发布视频的音轨，不推断其音乐、音效或听感。
- `motiontemplates/960723` 预览和上述 huashu-motion 发布视频均没有与生成源码建立可核实绑定；不得把这些视频的声音归因到某个仓库、合成器或声音库。当前仅记录画面取帧与未试听边界。

### 音效合成、中文排版与对比度核对

- `alchaincyf/huashu-motion` 固定 commit [`52467f99c602b76ba86d511d37acdfe93fa1e16e`](https://github.com/alchaincyf/huashu-motion/tree/52467f99c602b76ba86d511d37acdfe93fa1e16e)：读取 `cli/lib/sound.js` 与 `skills/huashu-motion/references/sound.md`。**代码/文本观察：**JavaScript 合成实现使用音调与噪声层，并由滤波、频率变化/riser、音量包络及 cue 时序组织提示和冲击；角色包括 `pop`、`impact` 等。它可作为“按事件结构不同生成波形”的实现参考。本次只核源码/规则，未运行、下载或试听生成物；不把合成算法当作音色或混音质量证据，也不要求本地复制这些音色/数量。
- 2026-10-27 独立补充读取：`alchaincyf/huashu-motion` v0.2.0 固定 commit [`42360539c10d35397b352461347c073a2966031b`](https://github.com/alchaincyf/huashu-motion/tree/42360539c10d35397b352461347c073a2966031b)：核读 [`examples/voice-demo/index.html`](https://github.com/alchaincyf/huashu-motion/blob/42360539c10d35397b352461347c073a2966031b/examples/voice-demo/index.html) 与 [`cli/lib/sound.js`](https://github.com/alchaincyf/huashu-motion/blob/42360539c10d35397b352461347c073a2966031b/cli/lib/sound.js)。**代码观察：**合成实现把短瞬态、滤波噪声、音调/共振、频率轨迹和 riser 等按事件角色组织，并由 cue 时点、起音提前量、包络及混音过程消费；voice-demo 是源码界面/演示材料，不作为本轮听感证明。未运行或试听其生成音频，不把代码结构当作混音质量，也不复制源代码或固定声效组合。在该提交的 [`renderSfx` 实现](https://github.com/alchaincyf/huashu-motion/blob/42360539c10d35397b352461347c073a2966031b/cli/lib/sound.js) 中，合成事件的 `SFX` 条目以 `at` 表示命中时点、以 `lead` 表示提前起音，消费 cue 时按 `at - lead` 排程；这是源码时间语义观察，不说明音色实际听感。
- Kenney [`Interface Sounds`](https://kenney.nl/assets/interface-sounds)：官方资源页声明包含 100 个接口声音且采用 CC0 许可。**范围限制：**仅记录潜在的有许可声音素材来源；本轮未下载、试听或将素材加入项目，使用者仍须核对具体资产、来源记录及项目当前许可状态。
- Wyzowl [`SFX Kit`](https://wyzowl.com/sfx-kit/) 与上游机器清单 [`sounds.json`](https://raw.githubusercontent.com/wyzowl/sfx-kit/main/sounds.json)，manifest version `1.0.0`；本轮下载清单 SHA-256 `67f4debfc7077d15391a896bac71a5d12c5c596dc194564e6054a844a98c9726`，并逐项核对五个本地 WAV 的 SHA-256 与清单一致。索引保留 `use_for`/`avoid_for`、`sync`（含相位）、`timing`、`adapt.rate/notes`、`under_voiceover_db`、`level`、`tuning` 与建议搭配；机器清单的 `level.lufs` 是最响 150 ms 的 K-weighted LUFS，不是整段 integrated LUFS。音频文件实测时长与清单声明时长分开记录。来源页面及附带 CC0-1.0 许可允许本地接入；五项均为 `candidate-unreviewed`，本轮没有听审，方法数据、许可和 hash 都不构成适配质量证明。清单链接仅供来源追溯，不是运行时依赖。
- W3C [`Chinese Layout Requirements`](https://www.w3.org/TR/clreq/)：参考中文行内标点、行首/行尾组织。2026-10-07 的文档身份为 **Group Note Draft**；这里只作排版参考，不称强制国标。
- W3C WCAG 2.2 [`Contrast Minimum`](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)：参考普通文本与大文本的对比度条目。4.5:1/3:1 只在口径适用于具体文字类别、实际显示尺寸和媒介时作为条件化工程告警；数字合规不能证明动画的阅读体验或审美。
- Adobe [`Using sounds`](https://helpx.adobe.com/animate/desktop/multimedia-and-video/using-sounds.html)：用于核对音效按 cue/keyframe 对齐与处理的工作方式。此方法来源不替代本地音频 renderer；最终仍要检查本工程真实事件表、混音和封装输出。

### `vibe-motion/sound` 固定快照：历史实现观察，已退出运行时

- 维护历史记录：曾核读 [`scripts/sfx.py`](https://github.com/vibe-motion/sound/blob/85a3715fc3ec7d1e765e4960643dcbacbc22f8dc/scripts/sfx.py)（commit `85a3715fc3ec7d1e765e4960643dcbacbc22f8dc`）及该提交 README；当时检查的源文件 SHA-256 为 `b487b981fcabd0c35e6ce2c8894d732a64894909370c418d095377637b986ca4`。旧脚本采用标准库做 HTML 检索、候选筛选与 MP3 预览下载。
- 上游下载失败可打印 `FAIL` 但进程仍返回 0，旧 DOM 选择器失配也可产生 `(none)`；使用固定 home 缓存，且该提交目录未提供 `LICENSE`。这些是对旧快照的历史观察。当前 `scripts/sfx-sources.py` 不再获取、导入、校验 hash 或执行该第三方脚本，不用其 HTML 抓取路径，也不继承其缓存/代理行为；这里保留版本、SHA 与缺陷记录用于追溯，不表示当前运行依赖或对上游代码授予任何许可。

### 2026-10-30 Freesound 官方 API：可选候选查询接口

- 按 Freesound 官方 [API 搜索与资源文档](https://freesound.org/docs/api/resources_apiv2.html)、[认证文档](https://freesound.org/docs/api/authentication.html) 和 [API 使用条款](https://freesound.org/docs/api/terms_of_use.html)核对当前接线边界。实现以 Python 标准库请求官方 `/apiv2/search/`，需要运行时 `FREESOUND_API_TOKEN`；API 的 `license` 字段是宽泛标签，不足以证明某一文件的精确许可 URL/版本。
- 搜索只在明确确认服务用途且配置凭据时进行。官方条款允许条件范围内的非商业 API 使用，商业 API 使用需按其个案流程取得 Freesound 批准；缺条件/凭据返回含具体原因的 `configuration_required` 及非空 `results`，不改用抓取、代理、付费服务或自动下载回退。
- 官方搜索元数据会缓存到本次工程 `.cache`。preview 来自 API 提供的 MP3 preview URI，明确不是上传者 original；请求 original 需单独的 OAuth2 `FREESOUND_OAUTH_ACCESS_TOKEN` 并访问 OAuth2-only endpoint。请求只允许 HTTPS Freesound 主机及 `cdn.freesound.org`，最多跟随 6 次重定向；每个目标在发送请求前核验，跨主机跳转移除 `Authorization` 与 `Proxy-Authorization`，避免 OAuth 凭据外泄。手动核验具体音效详情页与许可证 URL/版本后，才允许生成 `audioPlanAsset`；文件试听与 API 服务条款/音频许可分别判定。测试只对 HTTP 请求做 mock，本次维护没有向 Freesound 发起 API 或下载请求。

## 本地只读实现参考

- 资料项目“老胡画面讲解”中，实际读取 animation-director 主文全文；`workflows/laohu-video/模板/remotion-assets/workspace/src/schemas/director.ts` 的 89–109、166–190、211–280 行；`src/semantic/semantic-anchors.ts` 的 719–804、903–977 行；`src/utils/timing.ts` 全文（1–52 行）。此处列的是项目内相对路径；不复制该项目工作流、ASR/Cap/T2 交接、固定帧数或百分比阈值。
- **来源观察：**输入可区分 source 与 relative 时钟；有映射时将来源锚点转换到目标构图时间并以实际 fps 落帧、检查边界，动作/停留时间随后被场景逻辑消费。消费者接口并不总要求同一种局部时钟。
- **本地改写：**motion 规则要求先确认时钟来源、剪辑映射和实际消费者接口；消费者要求局部秒时从成片秒减片段起点，消费者要求全局秒时把局部秒加片段起点；只有秒/帧单位转换或帧接口需要时才使用对应 fps。保留相对设计时序，不伪造 ASR；按项目端点约定检查触发、动作、停留和退出。

## 解释边界

以上是读取范围内的源码/文档观察与本地设计选择。源码字段、设计案例、开源许可、仓库受欢迎程度或方法出处都不是成片质量证据；上述来源研究未执行所查外部模板、安装其依赖或渲染其 Demo；独立试用状态见维护验证记录。

## Canvas2D 本地实现的编译来源

本轮新增的 `scripts/motion-core.js`、`scripts/render.mjs` 是在本项目内独立编写的小型 Canvas2D 路线；不导入外部仓库源文件，也不以外部项目作为运行依赖。固定版本如下，适配前核对并实际读取的代码单元：

- `alchaincyf/huashu-art-motion`，commit [`8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c`](https://github.com/alchaincyf/huashu-art-motion/tree/8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c)：`scripts/engine/lib/camera.js`、`diagram.js`、`palettes.js`、`toon.js` 与 `demos/t1_3b1b/t1_s1.js`。可迁移的实现判断是相机/锚点坐标变换、图形按路径显现、颜色角色、图层及对象变换和稳定形变停留；本地以 Canvas 2D、显式对象/事件/属性接口重新实现，测试含真实像素检查。未复制源函数、示范对象、角色、配色、时长或数量。
- `motiontemplates/385712`，commit [`9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae`](https://github.com/motiontemplates/385712/tree/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae)：`template/core/main.js`。可迁移的实现判断是从绝对时间选择场景状态、允许独立 seek 的调用形式；本地实现不采用其主题、场景内容、字段命名或素材。

新增的接口范围、命令和限制在 [工具、渲染与媒介检查](references/toolchain-render-and-check.md)说明。`render.mjs` 使用宿主已经可用的 Playwright、浏览器与 FFmpeg；来源代码不参与帧渲染。许可证条目不能自动授权任何仓库素材或对其品牌/视觉作品的复制；本地实现的验证只证明对应技术动作在本次测试尺寸和夹具下发生，不证明美学或接收效果。

2026-10-26 检查本地 `scripts/motion-core.js` 实际接口：`layoutText` 以 Canvas `measureText` 排版并由 `text` renderer 消费；检查 font shorthand 与对象 `fontSize` 显式覆盖、显式换行、软换行和超宽不可拆项的行为；校验/求值仅接受 `linear`、`smooth`、`ease-in-out-cubic`、`ease-out-cubic`、`ease-in-cubic`，未知曲线报错，普通插值将进度限制于 `[0,1]`。本地 `scripts/render.mjs` 路线渲染无声 H.264，不能消费音频 scene 字段。具体 API 与媒介边界见 [工具、渲染与媒介检查](references/toolchain-render-and-check.md)；此项属于本地源码核实，不是声画成片测试或质量证明。


## 2026-10-26 内部方法编译

本轮把此前已记录的上游动画方法观察映射为六个兼容 ID 的局部操作模块，并新增内部关系图构建模块。此处不是新的外部仓库/成片观察：几何形变、块面与层级、路径构建、像素步进、笔墨分层、资料拼贴和持续注意/关系展开均来自上文已有的来源记录；主文按当前承重对象、动作或材料范围读取，用户锁定范围不扩大。新增 relations 将这些已记录的节点、线端点、方向、包含、比较、对象保留/移动与画面重组方法整理为本地操作规则，不宣称引用项目有一个可直接复用的通用 graph 引擎。

本轮同时以本地 motion-core.js 实际接口约束模块映射：内建基础对象、path/polygon morph、progress 事件、图层/相机变换、pixels cell 绘制及具名 custom renderer 按当前文件说明使用；另核对 cameraForAnchor(worldAnchor, screenAnchor, zoom, width, height, rotation)、worldToScreen(point, camera, width, height)、pointAt(points, progress, closed) 与 drawPathProgress(ctx, points, progress, options) 的实际签名/返回值，用于锚点跟随和路径显露步骤；没有新增公共引擎字段。方法规则的结构与映射可由本地检查验证，尚未证明普通制作任务因此会产生更受欢迎、更清楚或更美观的成片。此记录不增加对上文未试听的外部视频的声音判断，也不构成艺术效果或观众接收质量证据。

### 2026-11-03 OneTake 方法研究与本地动态跟随框边界

上游研究快照固定为 [`feitangyuan/onetake` commit `013a61ac8d98883c73733f59c06e49e9ba444f14`](https://github.com/feitangyuan/onetake/tree/013a61ac8d98883c73733f59c06e49e9ba444f14)，其许可为 PolyForm Noncommercial 1.0.0。本地研究与核读不授予商业运行/再分发权；没有复制、翻译或接入其代码，也没有把研究 cache 设为共享运行依赖。

本地 catalog 新增的 `laohu.motion-follow-box/1` 是独立实现的局部矩形强调操作：它消费 MotionCore 同一次 `drawFrame` 的 evaluated state，经目标、祖先 world layer 与现有 scene camera 求屏幕四角，再由根 screen overlay 绘制实际描边。它不另建相机、不移动目标、不提供 OneTake `zoomThrough` 的目标填充/推近机制，也不声称原效果保真。验证仅覆盖本地夹具里的目标矩形、父层、camera、文字和编码帧收据；不同源的许可与效果身份不得合并记录。

## 2026-10-27 补充源码观察

### `alchaincyf/huashu-art-motion`：同一材料转化与镜头衔接

- 固定提交 [`8f0a349a18b4bdf802b8d58715a2259c3e1ce709`](https://github.com/alchaincyf/huashu-art-motion/tree/8f0a349a18b4bdf802b8d58715a2259c3e1ce709)，本条只核读 [`scripts/engine/demos/t1_3b1b/t1_s1.js`](https://github.com/alchaincyf/huashu-art-motion/blob/8f0a349a18b4bdf802b8d58715a2259c3e1ce709/scripts/engine/demos/t1_3b1b/t1_s1.js)；这是新补的局部示例观察，不替换上文原有的 8a0d7 编译来源记录，也不声称核读该提交全部引擎。
- **来源观察：**同一个 10×10 猫像素对象先逐格显现并显示亮度，再将像素变为一列输入节点；100 项中展示 16 项，其余朝省略号收拢。转换完成时以实际神经元绘制替代过渡多边形，使下一镜头首帧可接续；镜头缓推、标题与说明也在该转化期间退场。以上为源码中的实现安排，未独立渲染或评估其审美效果。
- **本地改写：**若同一对象需在解释中改变表示法，保留身份/位置锚点并让前一形态逐步成为后一形态；对不能逐项展示的部分明确交代其压缩或省略。镜头边界检查转换对象的落态与下一镜头首态是否连续。只迁移这类转化与接续判断，不照搬猫、10×10、16 项、具体配色或时长，也不把连续变形强加给不适合的内容。


### 2026-10-27 字体资源、音效授权与视觉注意研究

- W3C [CSS Fonts Module Level 4](https://www.w3.org/TR/css-fonts-4/)（读取时为 Working Draft）用于核对字族匹配、字体资源、fallback 与字重选择语义；它不指定动画标题/字幕应选的字体，也不构成某种排版的审美推荐。MDN [`CanvasRenderingContext2D.font`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/font)、[`measureText()`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/measureText) 与 [`Document.fonts`](https://developer.mozilla.org/en-US/docs/Web/API/Document/fonts) 用于核对 Canvas 字体 shorthand、实际测量和字体加载接口；应以本地 renderer 与目标平台最终加载状态为准。
- [得意黑（Smiley Sans）官方仓库 README](https://github.com/atelier-anchor/smiley-sans)（2026-10-27 读取，未锁定仓库提交）：README 将字体描述为窄斜字身，列出 OTF、TTF 与网页 WOFF2 文件，并注明 OFL 1.1。此项仅记录字体包/许可资料的自述，不存在“官方推荐用于视频标题或字幕”的结论；具体字形、语言覆盖、实际文件、字重与许可仍需逐项目核验。
- [Sonniss GDC Bundle License](https://sonniss.com/gdc-bundle-license/)（Version 2.0，effective 2026-08-27）用于核对该 bundle 特定音效的同步使用与原始素材再分发边界：许可描述可将声音同步进商业作品，同时限制把原始素材独立提供/作为素材包、模板再分发。不得泛化到其他 Sonniss 产品或其他曲库；仍应按实际 bundle/条款版本记录。
- Freesound [FAQ: Licenses](https://freesound.org/help/faq/) 说明站内素材各自可能采用 CC0、CC BY 或 CC BY-NC 等许可，署名/商业用途和改编条件随具体文件许可不同；素材选择者须检查每个文件的 license 与作者要求，不能把整站当成单一授权。此项是许可核查来源，不表示本轮下载或试听任何素材。
- Mital、Smith、Hill 与 Henderson，2011，[“Clustering of Gaze During Dynamic Scene Viewing is Predicted by Motion”](https://doi.org/10.1007/s12559-010-9074-z)。2026-10-27 实际打开爱丁堡大学 [Research Explorer 论文记录](https://www.research.ed.ac.uk/en/publications/clustering-of-gaze-during-dynamic-scene-viewing-is-predicted-by-m/) 并读取其摘要（DOI 页面本次不可直接访问，未声称通读全文）。摘要称，在自由观看多种视频的研究中，测试的时间特征包括 flicker、motion 及其对比；这些特征对凝视位置有较强预测力，运动也能预测所有观看者凝视较集中时刻。摘要同时明确指出，尚不确定这种影响是非自主注意，还是与场景语义等高阶因素相关。此来源只支持把运动视为可能影响动态场景注意分布的一个因素；不证明运动必然吸引所有观众、运动越多越好，或动画应不停驱赶眼球。

## 2026-10-28 动画复用能力整合

### `Moessif/code-video-showcase` 固定源码快照与技术探针

- 核对只读源码快照 [`2a5fb1f754f988b31ff88ecb317ce282906a5488`](https://github.com/Moessif/code-video-showcase/tree/2a5fb1f754f988b31ff88ecb317ce282906a5488)，技术探针记录在 `.cache/validation/code-video-showcase-research/template-probe.json`。四个布局样本里 layout 0、1 的重复渲染与乱序 seek hash 一致，layout 2、3 不一致；四个样本均报告 `shared/fonts.css` 404，且没有声明字体。一次 8 秒 PCM float、48 kHz 立体声 demo 可解码，但明确未试听；另有 3 秒视频静态取帧检查记录，不是实时顺播。探针还发现示例中秒/采样单位的参数文档与非零起点样本用法不一致。以上是该固定快照和探针中的可复现技术观察，不是对源码全部模板或最终声音/画质的总结。
- 读取 README、`references/style-recipes.md` 与 `templates/`：README 所示 11 张风格展示图与 11 类风格配方是说明/展示材料；实际逐帧渲染入口由两个 HTML 场景样板 `templates/segment.html`、`templates/big-card.html` 配合 `render-segment.mjs` 和 `common.js` 提供，不应把 11 张展示图说成 11 个可运行镜头模板。其 61 秒展示片的剪辑/风格演示不等同于讲解动画默认结构。
- 另读 `templates/big-card.html` 的标题分层、`slam(localT)`、速度线、光晕与底线绘制。源码将第一组文字与第二组文字分开驱动：第一组从本地 `t=0` 开始，第二组从 `t=0.5` 开始；分别计算 `scale`、模糊过渡、`alpha` 与偏移，速度线/光晕另有各自时段，底线在第二拍推进。迁移的是“主体操作与辅助层分别绑定相位、各按职责推进”的组织方法：某些辅助效果可先于主要结果建立注意，也可在其后继续收束；可以错时、交叠、让位或退出，只有真实依赖才规定先后。未迁移颜色、绝对秒数、BPM、动作效果或配额，也不据此规定讲解模板。
- **本地改写：**只保留逐帧重复/乱序 seek、字体加载后再量字、素材/时钟映射、辅助层错时与主任务分离、音频命中点及样本精度等待本地消费者证明的工程问题；重新编写独立操作与脚本，不复制其全片布局/皮肤、固定时长与节拍、效果数量配额、依赖或源代码。每项本地能力以本仓库真实 consumer 和测试为准。

### `Moessif/code-video-showcase` 新快照与控制变量复核

- 2026-10-29 再读固定快照 [`decd75d0aaaf19f81a50b52d0d02e605178916e0`](https://github.com/Moessif/code-video-showcase/tree/decd75d0aaaf19f81a50b52d0d02e605178916e0) 的 README、`templates/big-card.html`、`templates/segment.html`、`templates/common.js`。README 明确仓库没有随附完成版样片；11 张 style tiles 是 11 个风格段的代表帧，`segment.html` 展示的是可替换内容的占位场景。它们不是 11 个可运行成片模板，也不是本项目可直接复用的画面答案。
- 在该新快照的 `big-card.html` 中，layout 注释称 2 为居中、3 为左对齐，但文字层 `makeLayers()` 对两组字都传入 `align:'center'`，y/锚点也相同。用相同文字（`判断` / `正确答案`）、主题（`amber-noir`）、序号（1）、1920×1080、同字体和相同 `renderFrame(0); renderFrame(.8)` 历史分别渲染 layout 2/3，Canvas PNG data URL 字符串的 SHA-256 均为 `299df75699c9113fc7f4930c085fc6fc02154523338b909be33035c490e42bd9`；这证明这一个固定输入与检查帧上两项配置没有产生像素差异，不推断其他文字、主题或时刻均相同。探针 `.cache/tmp/code-video-showcase-research/run/type-rhythm-probe.mjs` 的六秒本地排版诊断在该次运行中确认两套字体均已加载；输出为静音诊断视频，不是作品效果验证。受控对照文件重跑前后 SHA-256 均为 `1a9978a44a3cecf4081fb2c11b1f3815a71da4fdb5b4c76c8bce86d5bed8e6c4`，未改变已有缓存成品。
- 上一节的 commit `2a5fb1f754f988b31ff88ecb317ce282906a5488` 探针关注的是**同一配置重复渲染/乱序 seek 的稳定性**；本节 `decd75d...` 的受控 layout 对照关注的是**两个配置是否造成实际画面差异**。稳定与差异不可互相代替，也不能把前一快照的观察移作当前快照事实。
- **本地适配：**模板字段是否生效要分别检查同配置重复稳定性与不同配置的受控差异，再追踪到实际 renderer；从参考仓库只取经过验证的实现方法，不把其布局注释、模板序列或配色当成已经实现的能力或应沿用的默认风格。

### Remotion 与 Motion Canvas 的固定源码实现观察

- 核对 Remotion `template-tiktok` 固定 commit [`a6263081dd3d19a55ed79b49c12bd1a2cf1c81cb`](https://github.com/remotion-dev/template-tiktok/tree/a6263081dd3d19a55ed79b49c12bd1a2cf1c81cb) 的 [`SubtitlePage.tsx`](https://github.com/remotion-dev/template-tiktok/blob/a6263081dd3d19a55ed79b49c12bd1a2cf1c81cb/src/CaptionedVideo/SubtitlePage.tsx) 与 [`Page.tsx`](https://github.com/remotion-dev/template-tiktok/blob/a6263081dd3d19a55ed79b49c12bd1a2cf1c81cb/src/CaptionedVideo/Page.tsx)。前者用带 `durationInFrames:5`、`damping:200` 的 spring 得到字幕页入场进度；后者用 `fitText` 按 90% 画宽与目标字号测量拟合，组级 scale/translate 共用该进度，并按当前时间与每个 token 的 `fromMs/toMs` 显示当前文字高亮。它说明字幕页入场、组级运动和词级时间高亮可由同一进度/时间关系驱动；5 帧弹簧、白字黑描边与绿色高亮属于该短视频模板实现，不是所有中文讲解动画的推荐参数或规则。
- 核对 Motion Canvas examples 固定 commit [`8ffefed144368d33de4b0e451894c718eb95d574`](https://github.com/motion-canvas/examples/tree/8ffefed144368d33de4b0e451894c718eb95d574) 的 [`examples/anniversary/src/scenes/intro.tsx`](https://github.com/motion-canvas/examples/blob/8ffefed144368d33de4b0e451894c718eb95d574/examples/anniversary/src/scenes/intro.tsx)。该场景依次调度预览与卡片的尺度/位置，改变卡片背景色，并把 `imageMask` 的尺度变化用于揭示底层图像；片头元素、卡片、图像遮罩及说明文字各有自己的更新/退场关系。它提供“同一时序中多对象分别更新，并在镜头转场处重组/揭示”的源码例子；该代码来自 anniversary/提交展示场景，不证明其构图适合知识解释，也不要求本项目复刻其镜头、配色或工具。
- **本地适配：**只迁移可检验的通用结构——文本测量后再布局；同一语义进度驱动需要联动的文字/图形；独立层按当前职责进入、稳定、交接或退出；转场时重组对象关系并检查遮罩/焦点。使用时仍由本镜内容与本地 renderer 决定元素、节奏和画面，参考源码本身不作为运行时依赖。

### Kenney 本地候选音频索引

- 2026-10-28 依据 Kenney 官方 [Interface Sounds](https://kenney.nl/assets/interface-sounds)、[RPG Audio](https://kenney.nl/assets/rpg-audio)、[Casino Audio](https://kenney.nl/assets/casino-audio) 与 [Impact Sounds](https://kenney.nl/assets/impact-sounds) 页面及随包 License 文本核对本地十个源文件；资产 ID、原始相对路径、版本、归档 SHA-256、各 OGG 文件 SHA-256、CC0-1.0、再分发边界和 RMS 时间估计记录在 [`assets/audio/index.json`](assets/audio/index.json)，原始许可文件位于 `assets/audio/licenses/`。
- `onsetTimeSec`、`peakTimeSec` 与 `hitTimeSec` 由 5 ms RMS 帧信号分析得到；`hitTimeSec` 采用最大 RMS 帧中心，只是低置信度音频代理，不能视作人耳命中点。资源没有逐条实际听审，十项仍为 `candidate-unreviewed`；正式音频调用默认拒绝，技术预览必须显式允许并在 manifest 留存该状态。本轮不声称素材已 ready、音色适配或成片听感通过。
- **本地改写：**稳定资产 ID 可供作品查找和复用，运行时仍重新核 SHA-256 与许可/审核边界。素材候选是否适合当前语义、动作和混音须试听后另作决定；不能从文件名、波形或 CC0 许可推出声音质量。

### 本地可复用操作与音频消费者

- `scripts/motion-ops.js` 是本地独立实现，复用 `motion-core.js` 的相机/路径 API；没有移植外部函数。除影片/局部时间映射、稳定种子粒子、局部 mask、文字位图缓存及强调包络外，还导出 `samplePhase`、`sampleChannels`、`indexPhases` 与共享事件解析/映射函数。可选 `phases` 是真实 custom 消费者自有数据（可放场景或对象 `data`），不是 MotionCore 原生 scene 字段；共享事件可保留旧 `filmTimeSec`/`timeSec`/`time`，或用可选 `phaseId`/`phaseOffsetSec` 从所引用 phase 求值。`render.mjs` 将 `window.MotionOps` 提供给作品级 custom draw，实际签名为 `(ctx, object, t, scene)`；`t` 是渲染器传入的绝对时间，不从 `progress × 片长` 倒推。文字缓存支持按 `blurPx` 区分样式及 `getVariants(text, style, softBlurPx)` 生成清晰/柔化版本。详细消费约束见 [工具链 Reference](references/toolchain-render-and-check.md)。
- `scripts/audio.mjs` 以 Node 自带模块和本机现有 FFmpeg 消费作品导出的共享事件计划；对索引/项目 WAV 校验 hash、授权与 reviewStatus，要求事件时基明确，scene-local cue 必须有时间映射；支持 hit-time 对齐、SFX/music/voice 总线、时段自动化、锁定轨保护、48 kHz 立体声 WAV 与最终 mux。cue 命中点优先级是 cue 明确值→索引 asset 值→源文件绝对 0 秒；consumer 不用 `sourceInSec` 代替缺省命中点，若该回退值落在所选源区间之外就拒绝 cue。`candidate-unreviewed` 仅可用 `--allow-candidate` 做技术预览。recipe 现场生成的 WAV 一律标 `generated-unreviewed`，不能通过 plan 自填 `ready` 绕过试听；需 `--allow-generated-preview` 才可做技术预览，manifest 标 `technicalPreview`。实际试听审核过的生成 WAV 可作为具体文件/hash 与真实审核状态登记在 `plan.assets`，不应因生成来源而一概禁用。当前 recipe 仅限 tone/noise，缓存同时校验 recipe 元数据与输出文件 hash、格式和帧数。最终封装要求 picture-only 输入并验证输入/输出片长；若输入已有音轨会拒绝继续，锁定音轨需作为计划轨显式登记。代码还在写出前拒绝输入/输出及各输出间的路径别名。非零起点 duck、变速后多轨总长、锁定轨 RMS、静音 `-an`、候选/生成预览门禁、边界裁切与路径保护等技术行为由 `.agents/skills/laohu-motion/evals/motion-reuse.test.mjs` 及本轮验证报告记录；这些检查不替代实际听审或观众质量证据。

### Hypit 的词锚定视频工作流思路

- 2026-10-28 阅读 [hypit-ai/hypit README](https://github.com/hypit-ai/hypit)。README 描述其视频工作流将素材、字幕、B-roll 与效果关联到说出的词，并强调可从模板或普通描述开始。此处只依据 README 的项目自述，不声称审阅其全部 DSL、渲染器或工作流实现。
- **本地改写：**motion 先从语义蓝图中决定哪些内容值得成为动画动作，再将选定的保留词 occurrence 或句段边界绑定到 asrcut 的编译 `targetRange`。画面相位和声音事件由现有 `MotionOps.sampleChannels` / `audio.mjs` 消费；`edit-plan` 与编译 timeline 经 asrcut `hashPlan`/`compilePlan` 校验。保留的是“语义锚点跟随实际话语”的组织原则；不复制 Hypit 的 DSL、代码、模板、依赖、逐词触发策略或视觉风格。

### 2026-10-29 Canvas 字形边界、标注候选与布局关系

- MDN [`TextMetrics`](https://developer.mozilla.org/en-US/docs/Web/API/TextMetrics) 说明 `width` 是当前字体下的行内 advance，而 `actualBoundingBoxLeft/Right` 描述相对对齐锚点的字形边界；其示例指出斜体字形可能超出 advance。`actualBoundingBoxAscent/Descent` 则相对当前 baseline 测量。**本地适配：**保留有效的零值和有符号 bearing；把 advance、ink、描边/模糊 paint 与最终留白 occupancy 分开表示，缺少实际指标时明确标记估算。此 API 不能替代字体加载、行断、目标尺寸和真实背景复核。
- MapLibre GL JS 官方示例 [`Variable label placement`](https://maplibre.org/maplibre-gl-js/docs/examples/variable-label-placement/) 以优先级标签和 `text-variable-anchor` 的候选锚点，让标签选择位置以避开地图上的冲突。**本地适配：**保留导演排序的候选位置与受保护区域的几何比较，但候选框与保护框必须由本镜语义和真实变换提供；本地 helper 不计算动态轨迹、不推断标签的语义正确性，也不自动排版场景。全区间保护需要扫掠边界或披露采样，复杂变化按时段拆开复核。
- Motion Canvas 官方 [`Layouts`](https://motioncanvas.io/docs/layouts/) 将 Flexbox 布局描述为可选择启用的节点布局能力。**本地适配：**文字与图形共同参与占位/候选关系核对；布局可以只约束需要协同的局部组，其余构图仍由镜头蓝图决定，不要求全画面卡片化或使用固定流式模板。
- 上述资料仅提供 Canvas 几何、候选位与协同布局方法依据；本地实现独立编写，不导入这些项目代码或增加运行依赖。矩形检查为保守 AABB 诊断，不能证明像素没有遮挡、语义指向正确、文字可读或作品审美达标。

### 2026-10-29 完整标注组几何与语义指向复核

- 本轮继续按 MDN [`TextMetrics`](https://developer.mozilla.org/en-US/docs/Web/API/TextMetrics) 对 advance 与字形实际边界的区分，明确文本 paint、部件绘制几何与效果后 paint 范围的边界；按 MapLibre [`Variable label placement`](https://maplibre.org/maplibre-gl-js/docs/examples/variable-label-placement/) 的候选位置思路保留导演提供候选与保护区比较；按 Motion Canvas [`Layouts`](https://motioncanvas.io/docs/layouts/) 的可选局部布局思路，仅组合当前阅读单元所需部件。
- **本地适配：**在既有 MotionOps 增加小型 `composeLabelGeometry`，使文本、编号/底板、额外避碰范围分别计入完整组；测量结果再被候选选择、绘制锚点/部件位置与逐帧登记共同消费。该 helper 只计算调用方提供的矩形和纯填充底板，不自动推断部件形状、阴影/滤镜、屏幕遮挡、动态轨迹或语义正确性，不采用外部代码或运行时依赖。
- 以上文献说明不了完整动画的正确所指或审美。本地既有 C1/C2 复现只作为实现断点个例：曾分别观察到测量未决定文字位置，以及文字框消费后遗漏实际底板；它们支持检查绘制消费链完整性的工程判断，不代表每项作品都存在同样错误。关于原样片“训练目标”错指料箱的观察按独立语义核验记录，不由几何或引线交叉检查替代。

### 2026-10-30 解释内容选择与示范一致性

- Novak 与 Cañas, [*The Theory Underlying Concept Maps and How to Construct and Use Them*](https://cmap.ihmc.us/docs/theory-of-concept-maps.php), IHMC CmapTools Technical Report IHMC CmapTools 2006-01, Rev. 01-2008。文中用 focus question 组织概念图，并把有意义的命题视为概念关系的陈述。本地适配为先写本段要回答的问题，再决定观众需要哪些关系和中间解释；不要求每支动画都制作正式概念图，也不把相邻概念名称当成已解释的关系。
- Richard E. Mayer, [“Pre-training Principle,” Chapter 10 of *Multimedia Learning*, 2nd ed., pp. 189–199](https://www.cambridge.org/core/books/abs/multimedia-learning/pretraining-principle/01791D57F5D4164251269E6DF56A8BF1)。本地适配为：在承载复杂因果过程前，先检查目标观众是否缺少理解后续所需的概念名称、关键部件或特征；确有缺口才补，并与之后的实例/操作建立可见对应。书中原则不等于每个术语都要先讲，也不证明本项目应用后的实际接收效果。
- M. David Merrill, [“First Principles of Instruction,” *Educational Technology Research and Development*, 50(3), 43–59 (2002)](https://doi.org/10.1007/BF02505024); 作者提供的[论文文本](https://mdavidmerrill.wordpress.com/wp-content/uploads/2019/04/firstprinciplesbymerrill.pdf)。文中提出教学呈现与内容类型相配的 demonstration consistency，例如概念例/非例、程序演示和过程可视化。本地适配为按当前理解缺口选择概念辨认、关键操作或状态过程的呈现；不把某种教法套到所有镜头，不据此声称所有原则均有统一实证支持。

**本地边界：**以上来源只支撑本轮的内容选择、关系表达和示范一致性方法。它们不是本地作品已成功改善的证据，也不替代事实核查、实际 renderer 消费、最终媒体检查或接收者反馈。

## 2026-10-30 原生模板与局部效果接线政策

本节更新本地运行政策，不改写前面各日期的历史观察。此前“独立重写”“不复制源码”描述的是当时本地 renderer 的实现路线或来源范围，不是上游许可证的法律结论，也不再作为全模块当前禁令。现在允许将来源和代码许可已经核实的上游实现按原样、固定 commit 和逐文件 hash 收入 `templates/upstream/`，保留原始 LICENSE/NOTICE 和字体许可证，以原 runtime 或已登记适配器运行；不修改只读上游副本、不改写算法冒称原生效果。来源索引、schema、preview、recipe 或示例存在，不等于该项已接入可调用 renderer。

- [`templates/catalog.json`](templates/catalog.json) 是模板来源、pin/hash、许可范围、参数、固定机制、前置条件、renderer 与状态的机器真源；查找和接线流程见 [上游模板库](references/template-library.md)。本地是否可以调用只看 catalog 明确记录的 `availability` 与 renderer，不根据目录数或预览数量推断。
- `alchaincyf/huashu-art-motion` 当前固定 commit [`8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c`](https://github.com/alchaincyf/huashu-art-motion/tree/8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c)：代码/文档按 MIT 范围保留上游 LICENSE；原生 clip renderer 使用原始 Canvas2D/browser closure 与 grammar，不重写算法。所用字体及其 SIL Open Font License 1.1 文件随需保留。作者角色帧、形象、预览/演示视频和其他媒体不因代码许可一并授权；当前 y4 必须使用调用方有权提供的透明角色帧。具体源闭包和每个 grammar 的 schema 以 catalog、固定源码和 catalog 中的逐文件清单 为准。
- 同一来源的 `DG` 是可直接消费的局部 Canvas 效果库，不是整段模板；它保留源函数与全局符号。低层 `--template-effects huashu-art-motion-dg` 入口仍允许本地 draw-module按原函数调用；另有下方记录的本地 adapter 将限定的 catalog effect 实例接到 renderer。两种路径都按 catalog 的原加载顺序/函数签名核实，不把 `DG` 说成替代全局构图的 renderer。
- 2026-10-31 在原始六脚本 closure 上增加了 `templates/adapters/huashu-effects.js` 的显式消费路径，不复制或改写上游效果函数：实例由 `scripts/motion-ops.js` 校验、`scripts/render.mjs` 加载/注册；当前 catalog 提供四种 DG 局部描绘和一种 `MO.lagged` 静态矩形错峰显现。它们仅支持实际绑定的静态 screen-space 目标，原函数调用与 target/phase/参数证据进入 manifest。DG 项由浏览器源函数夹具验证；MO 目标显现另有真实 render CLI 与 MP4 最终帧验证。技术证据不表示作品质量或声音质量通过。
- `alchaincyf/huashu-motion`、`motiontemplates/385712`、Motion Canvas gallery、Code Video 等其他已核来源，按各自 commit、代码许可、素材许可、依赖和实际适配状态分别登记。代码授权不扩展到角色/品牌形象、照片、演示媒体或未附授权的字体；`source-only` 项作为可追溯的来源/源码记录，或按其已登记快照只读研究，不得称为一键可运行模板。`385712` 的 native scenes、音频事件表与 mix/source 合成器分开处理，源码/API证据不等于事件表泛化、实际渲染或声音试听。
- 视觉模板与声音是不同 consumer。当前 native-clip 只消费画面 spec/cue；`OM.sfx`、其他上游音效实现或候选组不会越过现有声音流程直接混入视频。音频索引在原十个资产事实外新增七个 `candidateGroups`，每个默认项/替代项只引用稳定 `assetId`，不复制审核、许可或文件状态。本地 `local-groups` 可用精确已知动作/材料标签或明确正向别名，以及力度、索引源时长筛选；`--query` 只作组级粗检索，否定/复合条件与组级 `excludeWhen` 不由脚本解释。命中只是发现入口，候选仍须再走 `local-search`、真实试听和现有 `audio-plan.v1`/ASR 时钟/音频 consumer，不能改变原审核或许可状态。

逐文件哈希、许可与源码闭包见本节所指的 catalog。源码索引、源码检查和实际运行是不同状态；静态来源检查不单独证明视觉行为、听感或成片质量。

## 2026-10-31 Huashu Motion 主仓库 t3/y5 原生 OM 接线

- 运行来源锁定到主仓库 commit [`52467f99c602b76ba86d511d37acdfe93fa1e16e`](https://github.com/alchaincyf/huashu-motion/tree/52467f99c602b76ba86d511d37acdfe93fa1e16e)。正式 vendor 根为 `templates/upstream/huashu-motion/`；`templates/catalog.json` 的 `huashu-motion` source ledger 当前 pin 95 个运行闭包/许可文件，逐项核对 SHA-256 和 Git blob。闭包包括 `package.json`、`cli/om.js`、`cli/lib` 的递归 ESM imports、`runtime/om.js` 与 `runtime/om-engine.js`、finance-chart/kinetic-type 的原 HTML、`template.json` copy map 指向的 main `runtime/clip`、GSAP、fonts 与原许可证。补入的 `runtime/om-engine.js` 直接来自该固定 commit 的 Git tree，SHA-256 为 `59d41ca9e6f1e35a1e2b8c9bbb3f7b665822b137939282cce8f6113aeb6873ce`；它不是 `huashu-art-motion` 同名文件替换。
- `scripts/templates.mjs` 通过正式 main `cli/om.js` 执行 `om new`、`om still` 与 `om render`，并用 main `cli/lib/project.js` 读取/校验/写入原 `data-composition-variables`。不调用调查缓存或全局安装的 OM；独立子进程设置 `OM_SAMPLES=off`，Playwright/Chrome profile 及其临时文件写到项目同卷显式 work root。原生项目输入文件在渲染前逐项复核 hash；官方 OM 每次运行追加的 `.om/renders.jsonl` 作为运行日志单独记录，不列入视觉源输入 hash。
- t3 finance-chart 与 y5 kinetic-type 目录状态保持 `conditional`：t3 需要有效非空数据系列、正确图表字段与范围内高亮；y5 需要原声明的文字和有效 palette；两者遵守原 1920×1080 构图与字段取值范围。已在本地 Chrome/FFmpeg 7 环境实际执行原生 prepare、preview 与 2 秒 render；两个 MP4 都为 1920×1080、30 fps、60 帧、H.264、无音轨。t3 原数据系列变更的同时间预览像素 hash 为 `d8a2b1f89a0afdba2b99a3521b7c48054011895bac3f2d8f87add0bd58b1de9c` 与 `792f423deb66fe26f77d640e86e309aeef0487b637cbb0ee2214fe3d70e810a9`；y5 title 内容变更也由专项 E2E 测试实测像素变化。
- 复核产物在 `.cache/validation/motion-huashu-integration/2026-10-31/`，包括 native render/preview receipts；真实 CLI 消费测试是 `evals/huashu-native.test.mjs`。以上证明当前工程闭包、原生调用、已测字段响应和媒体技术规格；未作主仓库原运行输出与本地输出的同输入逐像素 A/B，也未测声音、接收效果或成片质量。两项仍按实际条件列为 `conditional`，不能把技术 smoke test 说成质量通过。

## 2026-11-06 Video Shotcraft ListStackPress 来源改编

- 来源固定为 [`Vincentwei1021/video-shotcraft` commit `1266a3ec4831289c4d893d42dd5102723658039a`](https://github.com/Vincentwei1021/video-shotcraft/tree/1266a3ec4831289c4d893d42dd5102723658039a)，仓库代码许可为 Apache-2.0；正式快照及逐文件 SHA-256/Git blob 见 [`templates/catalog.json`](templates/catalog.json) 的 `video-shotcraft` source record。新增运行闭包限于 `demos/ui-entrance/list-stack-press/ListStackPress.tsx`、`demos/_fixtures/PageCam2D.tsx`、`demos/_fixtures/Polish.tsx` 与 `demos/_textures/live-layout.json`，原始 `LICENSE` 保留。代码许可不包括 demo 图像、品牌文案、字体或其他媒体；本地入口只消费调用者提供并声明许可的 PNG。
- 新的 `video-shotcraft-list-stack-five` 是单独的 `source-adapted-local` conditional 入口；原 `video-shotcraft-card-list-stack-press` 索引仍为不可调用 `source-only`。本地实现直接 import pin 的 `PageCam2D` 与 `Polish` 中字体/blur/shadow/easing/velocity 机制，并承接 ListStackPress 五卡/88 帧运动；只把已核实的页面与卡片素材、矩形、高亮和短计数文案映射给原机制。不复制 demo 资产，不开放卡数、相机、时序或 easing 任意参数。
- `evals/video-shotcraft-list-stack.test.mjs` 对 synthetic 几何 PNG 运行原组件与本地适配版各 88 帧；直接 renderer PNG 在 0、6、13、18、34、76、87 帧逐字节相同。H.264 解码后的两次独立 render 不逐帧全等（本次首个不同解码帧为 13，exact 33/88，PSNR mean 62.52 dB、min 53.55 dB）；其余未被无损抽帧覆盖的帧不据此宣称像素等同。证据和媒体位于被忽略的 `.cache/tmp/motion-source-integration/visual/`，汇总于 `.cache/validation/motion-source-integration/visual-report.md`。这是源码改编的技术 fixture 验证，不是知识动画样片、观众理解或人类质量证据。

## 2026-11-06 Huashu Motion 配乐、节拍与录音样本入口

- 上游音频源固定为 `alchaincyf/huashu-motion` commit [`52467f99c602b76ba86d511d37acdfe93fa1e16e`](https://github.com/alchaincyf/huashu-motion/tree/52467f99c602b76ba86d511d37acdfe93fa1e16e)，MIT；逐文件源闭包和 Git blob/hash 继续以本目录 `templates/catalog.json` 的 `huashu-motion` 记录为真源。相关文件本地 SHA-256：`cli/lib/score.js` `5e753eb638d4e0aee80cc9e878809bbb8344cfbecc947e2da6cbf4801fbc6215`，`cli/lib/sound.js` `2050c684ac0db4f9277be812a8a2bc7b731a29006fca2c0c6c70b71c1fa1eb7b`，`cli/lib/dsp.js` `2609e6d93ac51667f67345d3ba84d71d83c3b792656de97e95d12da57c6235fa`，`cli/lib/samples.js` `834a5eaa0f0ed954a64ba75efe6226b4fe9bbf383a46b86767256e09cbd06bd1`，`cli/lib/samples-build.js` `65fa21018f49d23ad7f2d2a81f2f43b4edecbf3a7fe3881616c1ba40a8515abc`。
- 本地 `.agents/skills/laohu-motion/scripts/laohu-audio-source.mjs` 的 `/2` product/style 入口继续执行源 `PRODUCTS`/`resolveStyle`、`score.plan`、`score.renderScore`，保留 source `pump`、style reverb、`buildSweep`、`rideEnergy`、music automation、fade、style `master` 与 `balanceLows` 顺序；不接管全片 `sound.mixdown`。不要求 ordinary music request 先写 ABC。被迁入的 private fragments 依源 hash/local DSP binding 适配，不表示为上游 export 或声称字节相同；选定 BGM 路只保留段落能量/事件动态，不套用新生成 preset 的染色链；source voice-duck 不执行，`audio.mjs` 仍唯一承接 voice-window duck 与 final mix。
- `samples build` 只绑定实际 pin 的 `buildSamples({out,only,log})`；运行前检查输出根和 instrument ID，运行后读取 manifest/许可并解码验证实际文件。回执分别记录实际 decoded 文件和 note/release selection，含实际 hash。当前契约测试使用本地生成的短技术 sample fixture（含 release layer），不下载/构建源仓大样本包；未知 ID 与越界/符号链接输出在写入前拒绝。
- `huashu-audio.test.mjs` 覆盖源 preset 音乐支路 PCM 对照、/1 SFX/audio-plan consumer 回归、/2 preset/stock BGM、minor source-default preset 的实际 chime key 回调/PCM 对照、选中 BGM 未知调性时的回执边界、样本身份与释放层、手动 automation 优先规则，以及 recorded-required 音乐和 synth-off SFX 隔离。具体检查命令与本轮计数留在 `.cache/validation/motion-source-integration/audio-report.md`。没有试听，不能据此评价音乐质量。
