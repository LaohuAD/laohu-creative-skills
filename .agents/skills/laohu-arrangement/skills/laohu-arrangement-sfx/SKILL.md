---
name: laohu-arrangement-sfx
description: 当视听声音蓝图已决定某个事件需要 SFX，且需要选择、替换或重新选段时调用；从动作与材料检索真实本地或外部文件，核实来源与许可，可按需剪辑源 WAV 后交回唯一现有音频计划。
---

# Arrangement SFX 选材与源剪辑

本模块只处理已确定事件的 SFX 选材、来源/许可登记与必要的源 WAV 剪辑，不决定全片是否需要声音，不接管旁白、音乐轨迹、静音、电影时间线或最终混音。由父级先读取[视听声音设计与源音频处理](../../references/sound-editing-and-mixing.md)；若由新 Showreel Motion 调用，按[原生声音与 Arrangement 交接](../../../laohu-motion/references/showreel-sound.md)消费共享事件和 audio-plan；既有 Remotion/Film 工程按[旧声音合同](../../../laohu-motion/references/sound-design.md)兼容。普通 Motion 请求已授权的声音职责，不需要用户另选本模块或重复授权。

音效属于整段声音编排中的一件材料：先从动作和接触材料判断声音应传达重量、摩擦、气流、共振或轻触，再听候选的起音、主体与尾音；返回前在完整画面和配乐/旁白关系中试听命中点、占位与尾音，不能只按标签、波形或瞬态峰值匹配。源文件内部 peak/hitpoint 是待对齐材料属性，画面目标是语义相位，最终 mux offset 是另一条实测事实，分别记录并只在其所属阶段校正，不叠加两次补偿。连续小动作不要机械逐个加同一短音；保留主重音，其他动作留空、错开、交替/减轻素材，或合成一个连续动作声，并检查是否仍清楚表达对象和动作。公共候选池中的文件继续依逐文件 hash、适用语境与真实完整试听证据判定；新增编辑工具或混音控制不自动提升其 `ready` 状态。音频操作不借用视觉 `motionOperations`。Huashu 音效生成分支支持的 `sourcePan` 仍按源函数行为处理；它不等于 Motion audio-plan 的连续声像控制。

## 触发与输入

触发：一个已确定的视觉 `eventId`/相位确实需要音效，或已有音效需要更换、裁段后重选来源。仅 BGM、原样保留的锁定音轨、完全静音，以及只提到物体或声音但尚未决定加 SFX，都不触发。无旁白不代表静音；是否加音效仍由事件职责决定。

父级准备并传入现有镜头蓝图中的信息：

- 稳定的视觉 `eventId` 和事件相位；若已有时钟，给出成片秒或准确的 `timeMapId` 与局部秒。
- 可听动作、接触物与材料、力度/速度、期望的听觉作用、可用时长和需要避开的旁白/阅读窗口。
- 用户锁定的声音、项目根目录及可写入的项目素材目录；不能为了取得素材更改锁定轨或代理设置。

父级从具体动作和材料生成查询词并自行处理正常创作选择，不要求用户提供 asset ID、剪辑点、曲库筛选项或混音字段。没有合适素材时可报告依赖素材的声音部分暂停；不得冒充已有文件或以任意 tone 替代拟音。

在正常动画设计/制作任务中，为落地本片具体声音事件所需的常规、可恢复的免费成品素材，`laohu-analysis` 可直接使用本模块现有搜索、下载、许可核验和登记入口，不要求用户逐项说“下载”，也不必为了角色分工把获取机械交给 Motion。Analysis 仍负责素材为何适合该镜的判断，Motion 核对真实文件、接入最终 consumer 并做本片语境试听。当前任务明确限定为只讨论思路/审查，或明确限定本轮不实际获取，或用户明确禁止获取、工作目录未确认，或操作超出费用/账号/权利边界时，仅交付待检索/待取得任务，不实际获取。

## 先用候选组缩小本地范围，再核验具体文件

先从音频索引中的 `candidateGroups` 按声音职责查缺口，再用动作、材料、力度和可用源时长缩小候选。已登记的职责用 `local-groups --duty <duty-id>` 精确检查；候选组的 `duty.eligibleRoles` 是入口声明的职责边界，脚本会检查资产角色是否属于该职责。输出中的 `dutyCoverage` 会区分“有角色相符候选，仍要核文件/许可/试听”“事件条件仍不确定”和“本职责无可用本地候选”。文件数、组内引用、角色匹配或候选 metadata 命中都不能单独算作声音匹配。没有职责条目或职责筛选后没有角色相符候选时，结果会明确给出外部免费成品检索、获取并登记回同一索引的下一步。

`source-register` 新登记的资产若其 `role` 已属于该职责的 `eligibleRoles`，`local-groups --duty` 会把它作为“仅角色登记”候选返回，不要求复制维护第二份数据库。它没有组内动作/材料/力度条件时状态保持 `unconfirmed`；先读该资产来源与用途/排除说明，核实文件和许可并真实试听，再决定是否完善职责组的候选条件。不能因为登记成功或角色一致就自动把它当成适配结果。

示例：

```sh
python3 "$SFX_COMPAT_TOOL" local-groups \
  --duty music-explanation-bed --work-root "$WORK_ROOT"
python3 "$SFX_COMPAT_TOOL" local-groups \
  --duty short-contact-impact --action landing --material wood --intensity light \
  --max-source-duration-sec 0.5 --work-root "$WORK_ROOT"
```

CLI 的 `--action` 和 `--material` 只接受完整的已知标签或明确列出的正向别名，不按子串猜测，不解析否定或复合语义；如 `non-metal`、`no click`、`wood and metal` 这类表达会返回未确认，不能当作匹配。自然语言放在 `--query` 做粗略候选组查找；最终仍由主线结合事件判断。组级 `excludeWhen` 是交给主线结合事件判断的文字说明，不会由脚本自动解释。源时长上限只作索引元数据粗筛，不替代实际探针或人工选段。条件未知时保留为未确认，不随机抽选，也不把文件名、搜索命中、响度或技术波形当成听感结论。

截至 2026-11-12，项目音频索引含 101 项、27 个候选职责组；其中本轮新增 69 个免费成品 SFX，Kenney 25 项、Wyzowl 44 项。职责组覆盖快/中/慢空气扫动、swish/zip/reverse、揭示 riser/shimmer、轻中重与木/金属/玻璃/软接触变体、纸/木/布/玻璃手部动作、翻页、按钮/开关、pop，以及 carpet/concrete/grass/snow 四类脚步各两版。用 `local-groups --duty <duty-id>` 检查职责，再用完整的 `--action`、`--material`、`--intensity` 条件缩小范围；当前可直接按 `glass`、`carpet`、`concrete`、`grass`、`snow`、`soft-contact` 等精确标签筛选，否定和复合词仍不参与匹配。

候选描述须注明证据类型。Wyzowl 索引保留发布者 `use_for`/`avoid_for`、`sync`、`timing`、可用时长和变速说明；这些是来源指导与文件内时点，尚未本地试听。Kenney 的材料、动作或轻中重只从包名/文件名作检索分类，`_000`/`_001` 只表示包内版本编号；若包未提供 onset/body/tail、选段范围或命中点，这些信息保持未知。69 项都为 `candidate-unreviewed`；只有试听具体文件及完整语境后才可形成适配结论。
若来源索引保留了素材自己的 `use_for`/`avoid_for`、`sync`/`timing`、`adapt.rate`/`notes`、`under_voiceover_db`、`tuning` 或配搭建议，应按当前事件逐项核对这些具体说明；它们是该素材的来源指导，不是全部声音的硬性参数，也不能替代整段试听。`sync.at` 是源文件内命中点，`sync.meets/how` 说明它应该对应画面哪个运动阶段；二者都不是成片时间。若来源建议变速且明确说明音高随速率变化，按允许区间使用 `audio-edit` 的 `playbackRate`，不能用保音高的 `audio-plan.speed` 冒充同一种变化；`adapt.rate:[1,1]` 时不作速率调整。按编辑参数重算/使用回执中的派生 hitpoint。`under_voiceover_db` 只是素材在语音重叠时的来源级增益指引，仍须结合实际旁白试听；它不等于 Motion 自动 ducking 参数。

对选中的 `assetId` 精确运行 `local-search --asset-id <assetId>`，避免通用词条同时返回其他候选。它会重测实际文件格式、时长和 SHA-256，核对许可与再分发边界，并按当前事件范围检查既有审核记录。每个资产的真实 `reviewStatus` 始终来自索引与精确范围核对；候选组命中、候选顺序、索引标签或 `candidate-unreviewed` 状态都不等于听过或能直接用于正式输出。若索引、文件 hash、许可或审核记录无法对应，标记为待核并继续查其他候选。

如果该事件仍需要声音而本地没有已核验的合格候选，就必须继续尝试外部成品检索；不能把“是否值得搜索”留作省略必需声音的捷径。检索词由动作、材料/接触面、力度、速度和听觉目的共同确定；例如硬木缓慢合页与金属快速撞击的候选不能只因都含 `click` 就视为可互换。先比对描述、来源页、时长范围与许可筛选是否符合当前事件；下载量、评价和评分仅作辅助信息。搜索返回时长只作粗筛，实际剪辑时钟来自下载文件的探针结果和真实 audition。网络、provider、解析、许可或 audition 阻断分别记录，不能汇总成“没有来源”。

本地资产仍先走 Motion 的 `sfx-sources.py local-groups` 与 `local-search` 兼容入口，核对项目索引中的真实文件、hash、许可和审核记录。没有合适本地候选时，Arrangement 的常规外部选材入口是 `scripts/laohu-sound.py`：保留上游 Mixkit、Freesound、Pixabay 与 Kenney 的实际搜索/取材算法，输出稳定 schemaVersion 1 JSON。普通候选按动作、材料、查询词和请求时长匹配，再按用户明确的 provider 顺序及该 provider 原生顺序呈现；不同网站的下载数、点赞和评价不是共同质量单位。界面/交互音效将 Kenney 连贯包作为首选检索路线，同时保留用户明确选择或命令指定的其他 provider 作为候补。Kenney 不匹配、包内音色不合或用户选定其他来源时，继续查看明确可用的替代来源，不强制使用 Kenney。

`WORK_ROOT` 是宿主解析出的本轮实际工程根目录；source index、Kenney pack 与隔离依赖 venv 默认写入该工程 `.cache/sound/`，临时文件写入 `.cache/tmp/sound/`。显式指定 `--cache-dir` 或 `--tmp-dir` 时仍须位于工作工程 `.cache/` 下；不回退到 home/system cache。工具不联网获取或安装其上游源码，不自动运行网络/代理修复；搜索 JSON 会区分 `networkAttempted`、`networkStatus`、每 provider 状态与错误，Pixabay 缺少 `curl_cffi` 时明确提示在本地隔离 venv 中安装。Freesound 的现有官方 API、项目本地索引和锁定声音交接继续由 Motion 兼容入口负责；该入口是兼容/项目资产路径，不限制 Arrangement 使用其余正式 provider。

Dispatcher 在创建输出目录或开始下载前核验 provider key、实际解析后的目标文件与下载 `.part` 中间路径；cache/tmp 的现存路径祖先也会先解析符号链接。只要实际目标越出本轮 `WORK_ROOT` 或其 `.cache/`，就以结构化错误停止，不创建逃逸目录或文件。

需要测量外部音频文件时，可显式指定当前工程可用的 FFmpeg 与 ffprobe：设置 `LAOHU_FFMPEG`/`LAOHU_FFPROBE`，或在子命令前传 `--ffmpeg PATH --ffprobe PATH`。兼容环境变量 `MOTION_FFMPEG`/`MOTION_FFPROBE` 也会读取。`doctor` 实际检查两项工具，`get` 使用 ffprobe 记录下载文件的实测属性；`render`/`check` 接受这些配置但 source-kit 的 Python 渲染与检查不会调用它们。完整配置示例及 source-stage 的指标边界见父级声音 Reference。

```sh
WORK_ROOT="<宿主按 runtime 解析的本轮工程根目录>"
SOUND_CACHE="$WORK_ROOT/.cache/sound"
SOUND_TMP="$WORK_ROOT/.cache/tmp/sound"
SOUND_TOOL="$SKILL_DIR/scripts/laohu-sound.py"
SFX_COMPAT_TOOL="$SKILL_DIR/../laohu-motion/scripts/sfx-sources.py"

# 工程内有本地候选库时先查当前动作/材料；assetId 再由 local-search 核对实际文件与审核范围。
python3 "$SFX_COMPAT_TOOL" local-groups \
  --query "wood landing contact" --action landing --material wood --intensity light \
  --max-source-duration-sec 0.5 --work-root "$WORK_ROOT"
python3 "$SFX_COMPAT_TOOL" local-search \
  --asset-id '<上方候选组结果中的精确 assetId>' --review-scope "wood contact landing in the current visual event" \
  --work-root "$WORK_ROOT"

# 普通外部检索；search 会尝试列表中的全部 provider 并返回逐 provider 网络状态。
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" \
  --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" \
  search --query "wood hinge slow close" --action "close" --material "wood" \
  --min-duration-sec 0.15 --max-duration-sec 1.2 \
  --providers mixkit,freesound,pixabay --limit 12 --pages 2

# 界面事件优先检索 Kenney 的连贯包；保留明确指定的外部 provider 作为替代。
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" \
  --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" \
  search --query "soft interface button" --action "click" --material "plastic" \
  --role ui --providers mixkit,freesound,pixabay --limit 12 --pages 2

# 若搜索结果中存在符合事件的 Kenney pack，再将其缓存并列出具体音频文件供预览。
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" \
  --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" \
  search --query "interface button" --providers kenney --pack '<搜索结果中的 pack slug>'
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" \
  --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" \
  get --key 'kn:<pack slug>/<搜索结果中的文件路径>' --out-dir .cache/sound/incoming

# 其他 provider 使用搜索结果返回的真实 key；输出目录须在工作工程内且不得覆盖已有文件。
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" \
  --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" \
  get --key '<搜索结果中的 key>' --out-dir .cache/sound/incoming

# 用兼容桥接入口保存机器回执；它调用同一 Arrangement laohu-sound.py search/get，不另建 provider 或资产数据库。
mkdir -p "$WORK_ROOT/.cache/validation"
python3 "$SFX_COMPAT_TOOL" source-search --query "wood hinge slow close" \
  --action close --material wood --providers freesound --freesound-license cc0 \
  --work-root "$WORK_ROOT" --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" \
  --ffprobe "$MOTION_FFPROBE" > "$WORK_ROOT/.cache/validation/source-search.json"
python3 "$SFX_COMPAT_TOOL" source-get --key 'fs:<搜索结果中的 ID>' \
  --out-dir .cache/sound/incoming --work-root "$WORK_ROOT" \
  --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" \
  --ffprobe "$MOTION_FFPROBE" > "$WORK_ROOT/.cache/validation/source-get.json"

# 用 source-get/source-search 回执核实来源、许可、文件 hash 并登记到同一 audio index。
python3 "$SFX_COMPAT_TOOL" source-register \
  --source-get-receipt .cache/validation/source-get.json \
  --source-search-receipt .cache/validation/source-search.json \
  --key 'fs:<搜索结果中的 ID>' --asset-id '<稳定资产 ID>' \
  --index .agents/skills/laohu-motion/assets/audio/index.json \
  --file 'freesound-music/<新文件名>.mp3' --role 'music-explanation-bed' \
  --material 'metadata-derived; not auditioned' --energy 'unknown' \
  --tag music --tag explanation-bed --license-id CC0-1.0 \
  --license-proof .agents/skills/laohu-motion/assets/audio/licenses/freesound-cc0-source-evidence.json \
  --work-root "$WORK_ROOT" --ffprobe "$MOTION_FFPROBE"
```

CLI 精确支持全局 `--work-root`、`--cache-dir`、`--tmp-dir`；子命令 `doctor`、`setup pixabay|procedural [--python PYTHON]`、`library ...`、`search`、`get`、`find`、`render`、`probe`、`sfzmap`、`check`。`search` 接受 `--query`、逗号分隔 `--providers`、`--role general|ui`、Kenney `--pack`、`--action`、`--material`、时长上下限、`--freesound-license cc0|by|any`、`--limit` 与 `--pages`。Provider key 为 Mixkit `mk:<id>`、Freesound `fs:<id>`、Pixabay `px:<id>`、Kenney 缓存文件 `kn:<pack>/<file>`；`kenney_pack:<slug>` 用于 pack 候选，实际取文件需选中 pack 并传 `--pack <slug>`。`get` 对每项返回工作工程相对路径、SHA-256、字节数/扩展名、来源页、provider 原生统计、预览 URL/本地路径、来源页时长与本地 `ffprobe` 实测时长/codec/sample rate/channels。还会返回许可核验状态、`candidate-unreviewed`、`sourceHitpointSec:null`、`clipOperations:[]` 和 `networkAttempted/networkStatus`。这些字段记录来源与技术信息；不会伪造命中点、许可版本、人工审听或剪辑操作。无可用 `ffprobe` 时文件仍保留 hash 和来源信息，`probe.status` 明确为 unavailable；正式使用前必须实测探针值。新文件须人工打开具体来源页核验该文件的精确许可证和再分发边界，并对实际源段试听，再决定其是否可进入正式计划。

Motion 的兼容路径继续可用：`sfx-sources.py local-groups`/`local-search` 访问既有工程索引与审核记录；其 `freesound-search`/`download` 适用于明确使用条件与 API token 已配置的官方 API 流程，仍按该入口的 service-use 与 license 核验约束操作。它不会取代本节的 Mixkit、Pixabay、Kenney 或上游源 CLI。远端请求必须以 JSON 中的实际 `networkStatus` 判断成功/失败，不能把依赖缺失、空结果和网络失败混为一谈。

Motion 兼容入口的 `freesound-search` 使用 token-authenticated `/apiv2/search/` API，缓存官方 JSON 元数据、候选 ID、预览 URI、详情页和宽泛 license label。`configuration_required` 会带非空 `results` 和具体缺少项，可能表示服务用途未确认、API token 缺失、或商业批准记录缺失；不返回空候选冒充搜索成功。`empty` 只在 API 请求成功且确实无候选时成立；网络失败及 rights label 不支持各自保留状态。API 标签不是单文件确切许可，不能据此生成 `audioPlanAsset`。

`download` 只接受此前官方 API 搜索缓存中的 `fs:<数字 ID>`。默认 `--kind preview` 取得 API 提供的高质量 MP3 preview；它不是上传者原文件，也不需要伪称音源原始格式。只有传 `--kind original` 且提供 OAuth2 `FREESOUND_OAUTH_ACCESS_TOKEN` 时，才请求官方 OAuth2-only original download 端点；不能把 API token 当 OAuth 权限，也不能用 preview URL 代替原件。下载后检查实际格式/codec、时长与 SHA-256，并将音源放进工程目录。精确详情页的 licence URL 必须由人工核实后以 `--verified-license-url` 和 `--rights-verified-by` 提供；API 的源码许可证、音效文件许可证与 Freesound API 服务条款是三条独立权限。

API、preview 和 original 下载只允许 HTTPS 的 Freesound 主机及 `cdn.freesound.org`，最多跟随 6 次重定向，并在每次发出后续请求前检查目标。跨主机跳转会移除 `Authorization` 与 `Proxy-Authorization`；因此 OAuth2 凭据不会随 original 下载跳到 CDN。超出主机、协议或端口范围的跳转作为下载失败返回，不访问该地址。

只有 Motion 兼容入口的 Freesound API 适配器在精确 CC0 1.0 或 CC BY 1.0/2.0/2.5/3.0/4.0 URL 与 API 宽泛标签一致时，才生成带来源/许可字段的 `audioPlanAsset`；Arrangement `get` 返回 provider 来源资产 JSON，不生成 Motion 计划对象；其它许可或不确定结果返回 `rights_unverified`。新文件仍为 `candidate-unreviewed`，直到另有完整文件范围的真实试听记录；下载/探针/哈希成功不是声音质量证据。状态还区分网络失败、rights 待核、`probe_unavailable`（退出码 8）、`file_invalid` 与输出冲突。只有 API 实际返回空结果才能记 `empty`。下载成功也不能证明候选听起来合适。

`--review-scope` 由主线根据当前事件语境生成，只在准备检查既有真实审核记录时传入；不要求用户填写。只有当记录的文件 hash 与当前文件一致、适用范围与当前语境一致、源区间覆盖文件从 0 秒到实测完整时长、`reviewer` 是非占位的具体审核者标识且 `conclusion` 为 `pass` 时，适配器才会复用 `ready`。consumer 只检查资产状态和 hash，不读取审核区间；因此局部源区间的听审不能把整份文件交成 `ready`，必须保留 `candidate-unreviewed`。若仅听审部分区间、换用派生文件或事件语境改变，重新听审；确实听审过的派生文件可用它自己的文件 hash 与完整实测区间独立登记。

## 权限、文件和审核状态

每个外部候选至少保留：实际相对文件、实测时长/格式与 SHA-256、创作者、canonical 来源页、精确许可 ID/版本、许可页面标题与 URL、署名要求、同步使用与源文件再分发边界、下载种类及编码说明。默认 preview 是高质量 MP3 编码预览，不是上传者原始源文件；只有 OAuth2 original 端点才交付原件。只有精确核验且当前适用的 CC0 1.0 或 CC BY 具体版本可进入适配器的 `audioPlanAsset`；其它许可、空链接或不确定的边界都保留为待核并停止依赖该文件的正式混音。

新下载文件标记 `candidate-unreviewed`。代码与 hash 只能证明文件身份和技术属性，不代表已经试听；不能把适配器候选改写成 `ready`，不能编造选择后的听感、命中点或人工审核记录。完成真实试听的人可以按本地资产记录方式登记审核证据，至少绑定具体文件 hash、实际源区间、使用语境/适用范围、审核者和 `pass`/其他结论。程序只检查这些记录字段与当前文件/范围是否相符，不能证明记录者真的听过。只有完整覆盖该文件的听审记录才能让整份文件作为 `ready` 复用；局部试听继续是候选。派生文件需以自己的 hash 和完整区间建立记录，之后才可独立复用；事件语境改变时复核。最终混音的听感仍须独立检查。

真实试听后，将经验写回原资产索引的 `reviewRecord`，不要另建并行曲库或用临时聊天代替资产记录。`local-review` 会再次检查索引文件、SHA-256 与实测时长；完整试听可传 `--full-file`，局部试听传真实 `--in-sec/--out-sec`。记录必须有实际审核者、适用语境、结论及明确的 `--confirm-listened` 声明；只有结论 `pass` 且范围覆盖整份文件，工具才将状态设为 `ready`。局部范围、`conditional` 或 `fail` 仍保留候选状态，并留存上一条记录到同一资产的 `reviewHistory`。工具保存的是审核者的声明和资产身份，无法证明实际试听发生，也不能替其他接收者确认质量。

```sh
python3 "$SFX_COMPAT_TOOL" local-review \
  --asset-id '<已索引资产 ID>' --scope '当前画面动作和旁白关系' \
  --full-file --reviewer '<实际试听者标识>' --conclusion pass \
  --notes '<实际听到的起音、主体、尾部及是否适配>' --confirm-listened \
  --index .agents/skills/laohu-motion/assets/audio/index.json \
  --work-root "$WORK_ROOT" --ffprobe "$MOTION_FFPROBE"
```

### 选中真实源文件后，按实际需要剪辑并登记派生音频

只有来源、许可和实际文件已核对后，才决定是否需要把源素材裁到实际动作、淡入/淡出、作技术交叉循环，或把少量各有职责的源层合成一个派生 cue。先从素材起音、主体、尾巴中选择承担当前动作的区间；检查起音是否符合画面启动，主体材质/动作/力度是否符合接触或运动，尾巴是否在旁白和阅读窗口里自然结束。核心动作或质感不匹配时继续搜索并获取其他合格成品候选；工具/网络无法完成搜索时如实保留缺口，把素材任务交回创意设计判断，不准擅自替换为更弱近似物、改画面、删 cue 或静音。只有用户明确授权原创 SFX 并绑定适用范围时才运行程序合成。选段与变化参数按当前声音任务决定，不为每个候选强制剪辑。

`audio-edit.mjs` 只接受 PCM/float WAV。若已匹配的合法素材是 OGG/MP3 等格式，不能因此丢弃候选，也不能把文件扩展名改成 `.wav`；先从已有音频索引以 `assetId` 调用 `decode-indexed-source`。解码器会重新核对索引文件 SHA-256、来源探针和生成的 WAV，并写出包含父资产 ID/hash、作者、来源页、许可证与搜索/获取回执 hash 的机器回执。原压缩文件继续留在索引位置，不变更或手工改写来源元数据；解码 WAV 与回执放在本轮授权工作工程的缓存/派生位置。解码不会恢复原编码已丢失的信息。输出路径必须与源文件不同：

```sh
INDEX="$WORK_ROOT/.agents/skills/laohu-motion/assets/audio/index.json"
DECODED_WAV="$WORK_ROOT/.cache/tmp/audio-edit/soft-piano-decoded.wav"
DECODE_RECEIPT="$WORK_ROOT/.cache/tmp/audio-edit/soft-piano-decoded.receipt.json"
node "$SKILL_DIR/scripts/audio-edit.mjs" decode-indexed-source \
  --asset-index "$INDEX" --asset-id 'freesound.music-explanatory-soft-piano-710546' \
  --output "$DECODED_WAV" --receipt "$DECODE_RECEIPT" \
  --tmp-dir "$WORK_ROOT/.cache/tmp/audio-edit" --work-root "$WORK_ROOT" \
  --ffmpeg "$MOTION_FFMPEG" --ffprobe "$MOTION_FFPROBE"
```

在 `audio-edit/1` layer 中将 `file` 指向解码 WAV，并传 `sourceAssetReceipt` 指向其回执。`audio-edit` 会核验回执的解码 hash 与输入 WAV 实际 hash，并在派生回执中写出“原压缩资产→解码 WAV→编辑结果”的身份链；无需再手填 `sourceAsset`。旧 spec 的 `sourceAsset` 字段仍可用，并继续执行实际 WAV hash 对照，但新外部音源应优先使用索引解码回执。不可变更用户锁定轨或覆盖原素材。

需要编辑时，将已解析的 Arrangement `{SKILL_DIR}` 用于工具路径，将本轮授权工程 `{WORK_ROOT}` 用于源/派生素材，并将 spec 与工作临时文件放在运行约定授予的 `{TASK_TMP_DIR}`；读取[视听声音设计与源音频处理](../../references/sound-editing-and-mixing.md)生成 `audio-edit/1` spec 并调用 `$SKILL_DIR/scripts/audio-edit.mjs`。回执记录源 hash、所选区间、互斥 tempo 或 playbackRate、fade/loop/layer 参数、输出 hash/时长/峰值和按参数几何换算的 hitpoint；它不测真实瞬态，也不证明听感。向父级返回派生 WAV、回执、原资产来源与许可、派生文件自己的 hash/实测时长、语境和 `candidate-unreviewed` 状态。音乐循环还需在完整乐句/和声/尾音及长时间重复上下文判断能否成立。

许可边界分开表达：使用文件同步进动画的权利，与把音频源件随工程或素材包再分发的权利不是同一件事。已知许可证及其 URL 必须随资产一起进入 `plan.assets`；不确定时保留 `rights_unverified`，不得默认 CC0。用户锁定的文件/版本不替换；不接触其锁定音轨。

## 回到唯一音频计划

给主线返回实际文件路径、format/codec、实测时长、hash、canonical 来源页、作者、精确许可标题/版本/URL、署名与再分发边界、候选选择理由、实际可用的 source range，以及审核状态。新检索或下载且没有可引用来源 sync 或实测依据的素材保留 `hitTimeSec: null`；不能用搜索页的一位小数时长或文件开头冒充命中点。若来源给出 `sync.at`，可作为索引里的来源声明对齐估计，并保留 `hitTimeMethod` 与 `hitTimeConfidence`，清楚说明它是文件内时点、尚未试听，不是实际峰值或已听审命中点。比如 Wyzowl 的 `sync`/`timing` 是发布者指导；Kenney 新文件没有来源时点时仍保持未知。实际适配和语义相位须在真实试听后确定。

项目内已登记并可直接索引的素材使用其稳定 `assetId`。Arrangement `get` 的来源资产 JSON 不是 Motion 计划资产；Motion 主线核验精确许可后，按真实 `audio-plan.v1` consumer 的资产字段编译，并把来源 JSON 中的路径、SHA-256、作者、canonical 来源页、provider 原生统计、预览、实测 probe 与许可核验状态保留在对应资产/证据记录。该输出明确 `sourceHitpointSec:null`、`clipOperations:[]`，不可伪造源内命中点或编辑回执。只有 Motion 兼容入口的 Freesound API 路线才消费其自身返回的 `audioPlanAsset`，保留 `licenseTitle`、`licenseUrl`、`attribution`、`source.soundTitle`、`source.author` 与 `source.recommendedCredit`。主线在现有事件/资产说明中记录实际选择理由，例如动作/材料与候选描述、长度及许可怎样匹配；不编造评分公式。创建 `events` 时沿用视觉 `eventId`、已选择的相位时点或精确时间映射、源区间和命中点依据。现有 consumer 对 cue 的 `hitTimeSec` 优先用明确值；若 cue 为 `null` 或缺省，则回退到素材 asset 的 `hitTimeSec`；两者都没有时固定取原文件 0 秒，不会自动对齐到裁切的 `sourceInSec`。若选段从 0 秒之后开始而没有提供落在选段内的有效命中点，consumer 会因命中点在选段之外而拒绝；须按真实选段提供明确命中点，或在技术预览中记录覆盖值、假设及所用源区间。cue 设为 `null` 不能屏蔽已登记素材中的索引估算；确认应用估算时保留 `hitTimeMethod` 与 `hitTimeConfidence`，并确保它落在实际 `sourceRange` 内；新音源仍按 `null`/待听审处理。未听审项仍是候选，技术预览须使用现有 `--allow-candidate` 门禁；估算、回退或预览覆盖都不能把候选变成 `ready`。不得新造音频时间线、改动 `audio.mjs` 或要求用户手填内部字段。

适配器检查结果必须由实际计划消费：音效事件使用 `bus:"sfx"`，事件 ID 指向同一视觉事件；计划继续由当前工程的 audio-plan consumer 读取。新 Showreel 的成品计划按[原生声音交接](../../../laohu-motion/references/showreel-sound.md)经薄入口调用既有 mixer，工作区改轨后导出当前会话混音；旧 Remotion/Film 沿[旧 Motion 声音合同](../../../laohu-motion/references/sound-design.md)兼容。旁白窗口、music ducking、locked 轨保护、静音与最终导出由 Motion 按当前路径处理；本模块不替主线决定这些项。

画面模板或其 cue 不自动提供可复用音频。只有本地 catalog 明确登记了可调用的音频源/consumer，且本模块的真实事件接口与许可条件相符时，才按该接口使用；上游 `OM.sfx`、预览声轨或示例 mix 若仍是源码观察，就只作研究记录，不声称本地合成可用或已试听。只有未烘焙、需要独立渲染的事件才写入现有 `audio-plan.v1`；完整 source mixdown 已烘焙的事件仅保留 event ID 和来源对应关系用于追踪，不重复生成 SFX。由 Motion 主线依据实际声音来源决定最终计划与听审。
