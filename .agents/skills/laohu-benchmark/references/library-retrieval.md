# 本地资料库的分层检索与回读

本 Reference 负责从已确认的 `benchmark/` 库找到材料片段或方法原子，并将选中的内容交回当前创作步骤。来源身份、专业归属、证据和写入授权沿用 [laohu-benchmark 主文](../SKILL.md)；跨入口的任务状态和权限见[共同运行约定](../../../../docs/runtime.md#作品方法库的检索与收录)。

## 何时读取与进入

用户明确要加载、搜索、读取某个编号，或负责作者正为一件具体作品/材料选择会改变其内容、组织或表现的材料/方法时，使用本流程。概念解释、仅讨论工具规则、一般聊天和纯技术维护不自动触发。进入实质取材或表现选择时，先查看负责该决定的专业 Skill 的资料库，可用时在定案前做一次有范围的相关检索。

用户明确排除资料库、任务只执行已锁定的选择、已经有同目的的新鲜检索和详情，或已核实对应库没有资料时，可以继续本轮工作。局部任务只检索会影响本次决定的内容。读库保持只读，缺库时也继续已有专业工作。

用户用自然说法即可表达读取层级：“加载素材库”只读取入口状态，不展开资料；“找一下跟这个关系有关的内容”返回有界候选；“读取这条/这个编号”才打开所选详情。不要要求固定命令句式，也不要把“读了库”理解为自动采用。

## 1. 入口状态：只看库是否可用

按[选择研究库](../SKILL.md#选择研究库)核实接收职责，以 `--skill-file` 传入实际接收 Skill 的 `SKILL.md` 绝对路径。同一个专业库可供不同项目使用。查用户指定的既有库、旧项目根库或交接中已定位的主库时，以 `--library-root` 传入确切绝对路径。用户给的是旧编号，或专业库未覆盖时，可按已知路径补查与本题相关的旧库。已确认位置和有效 revision 时直接检索。

用户只说“加载素材库”时执行只读 `info`，仅返回可用状态与库存概况。其他读取在库位置或状态尚未于当前任务确认时也先执行 `info`：

```bash
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<实际接收 Skill 的 SKILL.md 绝对路径>" info
```

结果的状态为 `current`、`missing`、`stale`、`incompatible`、`invalid` 或 `pending`，并在可靠时返回清单检查时间、资料库修订号和记录/卡片计数。`current` 只表示记录文件的路径、大小和 `mtime_ns` 与清单一致，不是内容审计，也不证明每条记录都可读或方法已核验。计数只说明能可靠统计到的条目；材料卡可能包含整来源回退，不代表已形成同数量的独立、已验证材料单元。条目存在、用途已登记、当前实际采用和效果证据是不同状态，不能互相推定。

`missing` 时先检查库路径和库存。根目录存在但检索缓存缺失，且没有待处理事务时，可直接回读已知 ID 的真源记录。缓存为 `stale`、`incompatible`、`invalid` 或 `pending` 时报告实际状态，继续不依赖缓存的工作。经授权可用 `rebuild-index` 重建派生检索缓存。引用库也检查主库来源的变化，重建引用库索引后才按新版本查询。

## 2. 候选卡：围绕当前决定做有界查询

将用户的普通说法、当前材料或待定选择压成一条短查询。查来源单元/素材时选择 `material`，找可迁移处理时选择 `method`，两者都可能有用时选择 `all`；不要把整段任务、抽象题材或固定关键词表塞进查询。需要时根据当前材料和第一轮命中中实际出现的词调整查询词。默认先看一页候选，只有候选仍不能区分或明显不足时才用 `next_cursor` 继续；不可一次载入所有描述卡。

```bash
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<实际接收 Skill 的 SKILL.md 绝对路径>" query "<当前决定对应的短查询>" --kind all --for-consumer laohu-writing --limit 8
```

示例中的类型、消费者和 `8` 只示范参数位置；按当前任务选用真实值和适当页数。常用参数为：`--kind all|material|method`、`--for-consumer C`（软偏好）、`--registered-only`、`--consumer C`、`--decision D`、`--stage S`、`--category X`、`--limit N` 和 `--cursor CURSOR`。`--registered-only` 必须同时指定目标 consumer；它只用于用户/调用者明确要求限定在已登记用途时。`--consumer`、`--decision`、`--stage` 是严格过滤；出现多个时必须由同一条 binding 同时满足。`--for-consumer` 只帮助排序，不排除未登记用途的探索候选。互相冲突的目标参数由工具拒绝，应改为单一、清楚的查询条件后再试。

查询返回本页 `revision`、`returned_count`、typed cards、`has_more` 和 `next_cursor`，不返回总命中数。卡片 `revision` 对应该记录 revision；若卡片关联来源版本，`source_revision` 单独表示来源修订。cursor 只对原查询、过滤条件、页大小和资料库修订号有效；条件或修订号变化时重做查询，不复用旧 cursor。筛选、排序与 SQL limit+1 在 SQLite 中完成；返回页数有界，单张候选卡的序列化元数据也有预算上限。若单卡超过预算，工具会返回简短错误；把它当作查询失败而非无命中，不截断稳定 ID，也不静默丢弃该卡，可缩小查询或过滤后重试。查询不是语义或向量搜索，底层可使用词项扫描；没有命中不证明资料库没有相关信息。读命令只使用已存在的 catalog；缺失或过期时照实返回，不隐式建立、修复或重建。`info` 状态只核 path/size/mtime_ns，不能替代对选中原始记录的详情核读。

卡片只用于找到值得打开的条目。材料候选和方法候选分开辨认；材料候选不自动等于已登记方法 binding，也不承诺没有专用卡的对白、画面或声音可以按其内容检索到。存在 source-only 来源或整来源回退时，按卡片实际给出的类型、来源 ID 和 unit key 读取，不把它伪装成方法原子。consumer-map 是导航，不是白名单；当前 consumer 没有 binding 时仍可探索，不补造登记。

## 3. 选中后读取自足详情

根据候选类型只读选中的一条或少数几条详情，不把候选页上的摘要当完整方法，也不为了探索把整个库读入上下文。

方法原子使用 `decision` 视图，将当前目标及指定 binding 的关键条件一并带回；需要通读原子正文时使用 `analysis`：

```bash
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<实际接收 Skill 的 SKILL.md 绝对路径>" get-atom ATM-0123456789ABCDEF --view decision --consumer laohu-writing
```

`get-atom` 可选 `--category`，并可选传入 `--consumer`、`--decision`、`--stage` 定位用途。`decision` 视图保留来源身份、定位与访问范围、材料关系及其依据、完整适用条件/固定项/开放项/限制、证据状态和实际相关的 binding/适配判断。若请求的用途没有现有 binding，结果明确标为 `not-registered` 并返回共同上下文；不合成 binding，也不因此自动拒绝该关系。详情的 `revision` 是本次 view/filter pack revision；另用 `record_revision` 和 `basis_revision` 核对记录及来源依据是否变化，供跨入口复用。

材料单元使用稳定 `unit` 键，不用数组序号。键取自现有 `provenance.independent_units[].unit`：

```bash
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<实际接收 Skill 的 SKILL.md 绝对路径>" get-source SRC-0123456789ABCDEF --unit "<候选卡返回的 unit key>" --view material
```

`get-source` 的 unit 详情支持 `identity`、`material`、`analysis` 视图。指定 unit 时只读该单元，不倾倒整份 provenance、其他独立单元或同来源的其他内容；即使省略 `--view` 也只返回所选单元。若省略 unit 和 view，则保持旧的完整来源读取行为。若资料没有稳定 unit，按候选标明的 whole-source 回退处理。只有定位和版本已核实时才报告原文摘录可用；否则保留实际定位并说明 `raw_excerpt_available=false`。unit 卡片与其 unit 详情以相同 `record_revision` 标识记录版本；来源或依据变化由 `source_revision`/`basis_revision` 识别。若 `material` 视图只给出身份、标题与 locator，且这些内容和当前上下文不足以判断该关系，就读取同一 unit 的 `analysis` 视图，或按真实 locator/授权核对原件；不要靠标题或候选卡采用，也不要为补一段材料打开整份合集。分析视图是保存的分析，不可当作逐字原文引用。

接收库的来源引用使用同一个稳定来源 ID，在该库执行 `get-source` 可读到主记录。下游需要实际来源 JSON 路径或 SHA-256 时，从同一个库运行 `locate-source SRC-ID`。已有 atom 缺少结构化 unit 引用时，结合来源身份与观察位置核对其对应单元。需要原作上下文或原文证据时，按详情 locator 与授权范围查看原件。

## 4. 评估候选并交回专业方法

负责作者始终决定候选是否适用于本轮目标。先核其证据范围、具体关系、适用条件、固定项、开放项、限制和用户锁定项；主题相近或卡片排序靠前不等于适用。缺少目标 binding 时，把关系作为探索候选，并按需读取当前消费者的主 Skill/专业 Reference，核实专业方法、输入、适用条件、返回位置与成品检查。不要因为查询使用了 `--for-consumer` 就声称用途已登记。

按需要把方法、材料或二者交回当前创作步骤；benchmark 检索不是强制全套报告、十六格输出或新 delegation。保留来源身份与授权边界，选中的方法由原负责作者落实到实际作品/成品，并按原 Skill 检查。可以采用、拒绝、继续探索或保持未定；“加载、搜索、推荐、读取详情”都不算实际采用，不写 usage，也不授权编辑或收录来源。

检索失败时说明实际库状态、失败查询和受影响决定。候选不足、缓存状态不适用或资料缺失时，继续调用者已有的用户材料、上下文及领域方法，不扩大到全量外搜，不为补资料创建目录。只有用户明确要求检索且路径本身未知、会改变读取对象时，才询问最小位置问题。

## 5. 跨步骤复用和失效

在当前任务的运行上下文中保留轻量状态：已确认的库路径与 revision、检索目的/查询及返回卡、选中的类型与 ID、record/source-basis revision、读取视图、实际载入的文本范围，以及接手的 consumer/decision/stage 和返回检查。不要把它写成每轮磁盘文件。

后续 Skill 处理同一目的时，复用仍在上下文中且版本一致的卡片、详情与真实材料，不重复整库查询。目标、consumer 或决定改变时重新评估该候选是否适用；资料库 generation 改变时刷新候选结果，但 record/source-basis revision 仍一致的已读详情可继续复用。已载入某个 ID 不代表其全文仍在当前上下文；若正文、选中单元或原文范围已不在上下文，按相同选中 ID 做一次有界回读，不重新载入整库。上下文压缩、任务换 worker 或开启新对话后，可能需要按当前目的重新核状态或回读所选详情。不要声称系统自动清除了旧历史、拥有永久记忆或模型计费缓存。
