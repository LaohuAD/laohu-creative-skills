# 原子记录、入库方案与使用反馈

本文件是 `laohu-benchmark` **编译可回读记录、交付待确认入库方案、执行写入/维护 CLI 与记录真实 `log-usage`** 的唯一操作手册。只读查库见 [library-retrieval.md](library-retrieval.md)；来源身份、拆解方法与研究库归属见 [SKILL.md](../SKILL.md)。

## 1. 记录粒度与 `source-only` 退路

- **只做局部解释时不强制建卡**：只有确实要沉淀为长期可查素材或可迁移方法时，才进入记录与方案流程。
- **一条独立可采用的关系 = 一条原子**：必须耦合才生效的多步操作留在同一原子；只有能分别指导不同创作决定时才拆分，并各自保留理解关系所需的上下文。跨消费者复用同一机制只留**同一 `ATM-ID`**，用多条完整 7 字段 `consumer_bindings[]` 表达，绝不按媒介复制原子。
- **机制未熟走 `source-only`**：来源值得留存但尚无成立机制或采用条件时，在方案里明确提出只存来源（`put` 可省略 `atoms` 或传 `atoms: []`），绝不硬凑原子、空类别或 usage。必填来源身份缺失时如实说明缺口，绝不编造作品名、作者、版本或把构想伪装成已完成原作。
- **批量口述与变体处理**：按逐项拆解清单保留每条独立灵感的具体内容、定位与纠正依据；未形成原子的条目留在来源 `provenance.independent_units[]`（含完整 `analysis`），不因方法去重而删丢具体灵感。创意变体未改变底层关系时不复制新原子，形成新独立关系时另立候选。

## 2. 交付可拍板的入库方案（写入前硬门禁）

普通“拆解并收录”或资料沉淀请求，**同一轮交完完整分析后直接给出清晰可确认的入库方案**（先只读盘点库与查重，确认前绝不运行 `put`、`rebuild-index`、`log-usage` 或容器 `--write`，也不编造新 ID 或宣称已可检索）：

方案用自然清晰的语言交代 5 件事（不要只问一句“要不要存”，让用户盲批）：
1. **库位置与查重范围**：实际目标库路径（见 [选择研究库](../SKILL.md#选择研究库)）、拟用类别及查重结论——哪些拟新增、哪些复用已有 ID（引真实 ID）、哪些拟经授权更新或仅 `source-only` 暂留；
2. **来源与完整分析去向**：来源身份/读取范围、原文或摘录保存边界、完整分析放在哪个正式记录字段；若来源含剥离出来的未发生猜想或待发展独立分支，单列分支去向并配好自身材料检索词以便日后召回；
3. **拟拆出的原子草案与成熟度**：每条保留的承重关系、拆合理由、可换皮肤与不可丢前提（交付能独立看懂的完整内容，不只给标题或标签）；**仅基于二手转述、未核原片或构想提炼的方法，必须显式将证据成熟度降级为候选/观察级（不标 `method-ready`）**；
4. **未来适用场景与跨媒介转换**：帮哪个具体专业决定、进目标媒介要保留/重建/认损什么、何时不适用（内部对齐 7 字段 binding，面向人说直白话）；
5. **检索入口词与回读核验法**：拟放进来源/单元/原子检索卡的材料词、关系词与未来普通问法词，以及写入后如何用 `query` 和 `get-*` 核实找得回。

用户明确接受当前方案后，一次性完成写入与回读核验，不再逐条反复追问；只批准部分就只写部分；若用户明确要求跳过确认直接收录或正在执行已确认方案，按授权直接落盘。

## 3. 组装可独立回读的记录（不改既有 4 份 Schema）

严格遵守 `schemas/` 下 4 份既有 schema（`source`、`atom`、`usage-input`、`usage`），不增顶层非法字段，充分利用允许扩展的字段：

- **真源分工与防重复**：
  - `source_material`：只存明确来源引用、版本、读取范围及获准留存的必要原文/短摘录（受保护作品仅短引，原文整库只存一次，绝不塞入分析冒充原文）；
  - 完整分析：存 `source.provenance.full_analysis`；批量材料已在 `source.provenance.independent_units[].analysis` 逐项保存时直接沿用不重复；每条原子 `analysis` 保留理解该关系所需的上下文、细读、固定/开放变量与边界，绝不让正式记录依赖聊天或 `.cache/`；
  - 可选跨媒介对比：仅当多用途适配差异会影响未来采用时，在 `atom.analysis` 内使用可选数组 `transfer_assessments[]`（每项含 `consumer / decision / stage / binding_status(registered|exploratory) / source_relation / preserve / rebuild_or_change / cannot_transfer_or_loss / conditions / evidence`）。`registered` 须精确对应一条已有 7 字段 `consumer_bindings[]`；`transfer_assessments` 不替代也不放宽严格 binding。
- **独立材料单元与检索卡契约**：
  - 仅在来源确有需分别查找回读的独立子单元时写入 `provenance.independent_units[]`，每个单元赋唯一、非空、非序号的稳定 `unit` 键，并配自身 `index_card`（`title` 具象、`summary` ≤ 200 字符仅限摘要不压缩正文、`terms` 只收本单元材料词与未来普通问法词，**绝不复制或继承合集 `source.notes`**）；
  - 仅在源版本、精确起止偏移与 SHA-256 全部核验后才写 `verified_span`，否则留实际 `locator` 省略该字段；
  - `atom.analysis.observed_unit.source_unit_ref.unit_key` 仅在该原子明确对应单个单元时填写；
  - 合写口述来源自拟标题时只写准确身份说明，不把全部子素材关键词堆进标题（防检索污染）；真实作品原标题保持原真。`source.notes` 保持单行简短目录说明，不塞正文。
- **`index_card` 与标签边界**：`category` 管存放类别，`consumer/decision/stage` 管严格专业过滤，`terms` 管普通问法召回——三者不混用；未来问法词只进 `terms`，绝不倒灌为原作事实或机制证据；无固定词数配额。
- **写前原句回指校验**：写完来源、检索卡、机制、条件与 binding 后，回到当前源单元核对一遍：已确认的主体/时序有无被误降成未知、新增建议有无混进原话、字段间是否一致。

## 4. 归类、写入与写后回读核验（`library.py` 写入命令）

- **类别复用规则**：优先沿用用户指定或已有能承接主要用途的类别（先只读 `stats` 或 `query --kind method` 查看现状，常规同义词如 `lyrics/music` 复用已有类）；确无匹配类时拟简短小写 slug，随首条获准原子自动创建，不预建空类别。
- **已有记录防覆盖**：`put` 拒绝覆写已有记录。仅在明确获准修改既有原子（如追加新消费者 binding）时，先备份原 JSON，保留稳定 `ATM-ID` 与既有细读，更新后跑 `validate` 和 `rebuild-index`。
- **跨库提交顺序**：一源多域时，先向主库提交来源，再向接收库提交 `source_links`（含已核 `source_id` 与 `owner_root`，同仓自动存相对路径）及该库独立原子。

```bash
# 1. 按确认方案写入（新域库首写自动建立；source-only 可省 atoms）
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" put --input "<bundle.json>"
# 2. 校验真源完整性、引用与索引新鲜度
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" validate
# 3. 统计 / 显式重建缓存 / 显式回滚未完成事务
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" stats
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" rebuild-index
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" recover
```

- **写后必做回读验收**：`put` 与 `validate` 通过后，按 [library-retrieval.md](library-retrieval.md) 用有区分力的材料词/关系词实跑 `query --kind material|method`，并用返回的 `unit` 键或 `ATM-ID` 跑 `get-source` / `get-atom` 核实全文与条件均可完整取回；如发现本轮放错位置的词导致无关召回，修正本轮记录说明（不篡改真实来源或未授权旧记录）。
- **落地汇报**：交出真实文件位置与 ID、完整分析保存处、保留的方法与分支、实际查询命中范围及仍未验证的外部效果（已有完整分析不重复粘贴全文）。

## 5. 真实使用与反馈（`log-usage`）

仅在用户明确要求或任务已授权记录**真实采用结果**时执行（搜索、推荐、读卡、未采用绝不记 `applied`）：

```bash
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收或引用 Skill 的 SKILL.md 绝对路径>" log-usage --input "<event.json>"
```

- `consumer`、`decision`、`stage` 必须与同一条既有 `consumer_bindings[]` 精确匹配（引用库可按同 ID 提交，工具自动写入原子主库）；
- 按本次真实情境显式填写 `required_context`、`adaptation`、`return`、`check` 及可核对的 `case_ref` / `result_evidence`，绝不依赖默认复制通用 binding 制造虚假采用；
- 默认 `usage_id` 按内容生成幂等键，两次不同使用事件须给不同 `case_ref` 或调用方稳定 `usage_id`；
- 记录一次 `applied / adapted / rejected / not-used / pending` 只说明该次事实，不自动升级原子成熟状态，也不能回写成来源事实。
