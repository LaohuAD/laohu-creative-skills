# 本地资料库的分层检索与回读

本文件是 `laohu-benchmark` **只读查库、分层回读与跨步骤复用**的唯一操作手册。来源归属与证据边界见 [SKILL.md](../SKILL.md)；写入、入库方案与 `log-usage` 见 [atom-recording-and-reuse.md](atom-recording-and-reuse.md)。

## 何时触发与只读底线

- **触发**：用户明确要加载、搜索或读取某个编号；或负责作者在具体作品面临开放的取材/表现选择时，在定案前做一次有界检索。
- **跳过**：概念解释、讨论规则、纯技术维护、用户明确排除资料库、任务只做已锁定内容的忠实修订、已有同目的新鲜查询与详情，或已确认无相关库。
- **只读铁律**：`info`、`query`、`get-atom`、`get-source`、`locate-source` 全程只读，**绝不隐式建目录、重建缓存、修改记录或记录 usage**；缺库或缓存失效时照实报告受影响范围，并继续用用户材料和领域方法推进工作。
- **按自然意图分层**：说“加载素材库”→ 只停在 `info`；说“找相关招数/素材”→ `query` 返回一页有界卡片；说“看这一条/编号”→ 只打开选中的 1–2 条详情。

## 1. 入口状态检查（`info`）

按 [选择研究库](../SKILL.md#选择研究库) 传入实际接收 Skill 的 `SKILL.md` 绝对路径（`--skill-file`）；查旧根库、已确认外部库或已知主库时传 `--library-root "<绝对路径>"`。当前任务尚未确认库状态时先执行：

```bash
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" info
```

- 返回状态为 `current`、`missing`、`stale`、`incompatible`、`invalid` 或 `pending`，并附清单检查时间、revision 与可靠统计计数。
- **`current` 仅表示文件 path/size/mtime_ns 与清单一致，不是内容审计，也不代表方法已核验**；材料卡计数可能包含 whole-source 回退，不等于同数量已验证独立单元。
- 根存在但 `catalog.sqlite3` 缺失且无待恢复事务时，仍可按已知 ID 直接回读 JSON 真源；缓存为 `stale/incompatible/invalid/pending` 时说明现状并停用缓存查询，待授权后由显式 `rebuild-index` 重建（含引用库随主库更新后的重建）。

## 2. 有界候选查询（`query`）

把当前决定压成一条简短自然查询，按需要选 `--kind all|material|method`，**先看一页有界卡片，严禁把整库描述一次灌进上下文**：

```bash
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" query "<当前决定短查询>" --kind all --for-consumer laohu-writing --limit 8
```

- **过滤参数契约**：
  - `--for-consumer C`：仅作软排序偏好，**不排除未登记的新消费者探索候选**（日常检索默认用它，**不要默认加 `--registered-only`**）；
  - `--registered-only`：必须配合 `--consumer C`，仅在明确限定“只要已登记用途”时使用；
  - `--consumer C`、`--decision D`、`--stage S`：严格过滤，同时传多个时必须由**同一条 binding** 共同满足；未指定的维度不虚构过滤值；
  - `--category X`、`--limit N`、`--cursor CURSOR`：游标严格绑定查询词、过滤条件、页大小与库 `revision`，任一变化须重查。
- **结果边界**：返回本页 `revision`、`returned_count`、typed cards、`has_more`、`next_cursor`（不返回总命中数；底层为词项扫描，非向量语义搜索，无命中不证明库中绝对没有）。单卡超元数据预算时工具报简短错误，视作查询失败并收窄条件重试，不截断 ID 或静默丢弃。
- **区分卡片类型**：`material` 候选（含 `source-only` 或 whole-source 回退）不等于方法 `binding`；无专用单元卡时不承诺正文任意词可检索。

## 3. 按选中条读取自足详情（`get-atom` / `get-source` / `locate-source`）

只读选中的 1 条或少数几条详情，不凭候选摘要直接采用：

```bash
# 方法原子（决策用 decision 视图，通读全文用 analysis 视图）
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" get-atom ATM-0123456789ABCDEF --view decision --consumer laohu-writing

# 来源材料单元（必须用卡片返回的稳定 unit 键，严禁用数组序号）
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" get-source SRC-0123456789ABCDEF --unit "<unit key>" --view material

# 核对跨库主来源路径与 SHA-256
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" locate-source SRC-0123456789ABCDEF
```

- **`get-atom`**：可按需传 `--category`、`--consumer`、`--decision`、`--stage`。目标用途未登记时返回 `not-registered` 与共同上下文——不合成假 binding，也不自动排除（**检索词 `terms` 含某媒介词不代表该用途已登记**），按目标 Skill 专业方法作探索判断（跨媒介转口播时按需核对 [language-analysis.md](language-analysis.md) 听觉顺序与术语大白话化）。若单元笔记与原子摘要在细节措辞上有出入，老实披露而不顺手揉平。区分本次视图 `revision` 与用于复用校验的 `record_revision` / `basis_revision`。
- **`get-source`**：支持 `identity` / `material` / `analysis` 视图；指定 `--unit` 时只读该单元，不倾倒整份合集。若 `material` 视图 `raw_excerpt_available=false` 且上下文缺材料，定向改读同一 unit 的 `analysis` 视图或按 `locator` 核对原件（分析视图不冒充逐字原文）。

## 4. 跨步骤复用、失效刷新与交回创作

- **轻量上下文状态（不写逐轮磁盘文件）**：同一任务跨入口流转时，在运行上下文沿用最小状态——已确认的库路径与 `revision`、查询目的与候选卡、选中 ID 与 `record_revision / basis_revision`、已读视图及当前仍可见文本范围、接手 `consumer/decision/stage` 与成品检查点。
- **复用与刷新规则**：
  - 目的相同且版本未变、正文仍在上下文 → 直接复用，不重复查库；
  - 任务目标或 `consumer` 改变 → 重新评估适用性；
  - 库 `generation/revision` 改变 → 刷新候选 `query`（弃旧 `cursor`），但 `record_revision / basis_revision` 未变且文本仍在上下文的已读详情无需重读；
  - 上下文压缩、换 worker 或跨对话后，**仍记得 ID 不等于全文仍在上下文** → 仅按该 ID / 稳定 `unit` 键有界回读所需详情，不重载整库，也不宣称系统自动清历史、永久记忆或计费缓存。
- **交回原创作流程**：由负责作者决定采用、拒绝、探索或待定，库结果绝不覆盖用户锁定项；选中的招数按主文“跨媒介换轨三笔账”落回实际作品并检查成品位置，**不因查库附送整篇 benchmark 报告或擅自写 usage**。
