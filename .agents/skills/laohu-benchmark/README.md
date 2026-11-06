# 本地作品与方法原子库

这个目录放 `laohu-benchmark` 的运行方法、适配参考与数据结构说明。当前项目的作品来源、方法原子和使用记录默认写入由 `laohu-archive` 返回的项目根目录 `benchmark/`；不会写回安装仓库的 Skill 目录。跨项目或项目外位置必须沿运行约定由用户指定或确认。普通“拆解并收录”先交完整分析和具体入库方案，经用户确认后再保存；已确认方案及用户明确要求直接执行的分支按 [Skill 主文](SKILL.md#保存授权与工具)处理。

JSON 来源、原子和按月使用记录是可迁移真源。全局 `catalog.sqlite3` 保存供分层检索使用的短元数据和卡片，类别目录内的 `index.sqlite3` 兼容既有类别检索；两者都是派生缓存，不存原作正文/完整分析，也不能代替 JSON 真源。`info` 与 `query` 只读，不建库、构建或修复缓存；受管理的 `put` 与显式 `rebuild-index` 维护 catalog 和兼容类别缓存。未创建任何类别目录。类别先尊重用户指定；否则先查看并复用能承接主要复用用途或原作工作类型的现有类别。五组分析适配是方法入口，不是存储类别；同一原子跨消费者通过获准的 bindings 复用。只有无合适类别时，才按已有命名习惯在首条获准原子保存时新增。

如果本轮明确授权保存来源，但尚无证据支持一条可复用的方法，`put` 可以只接收 `source` 或 `sources`，不传 `atom`/`atoms`，也可传 `atoms: []`。这只写来源 JSON，不会因这条来源新建空类别、atom 搜索项或 usage；用 `get-source` 读取。`put` 仍按既有流程维护当前 catalog 和已有类别缓存。来源材料/整来源回退可以作为 `material` 查询候选，但不伪装成方法 binding；`method` 卡只表示方法记录。用户显式提交了非法的原子类型或字段时，命令仍报错，不会悄悄降级成 source-only。

来源的简短 `notes` 可作为以后按普通问法查找的目录说明，不要把原文或长摘录塞入其中。新调用流程用只读 `query TEXT --kind all|material|method` 从全局 catalog 返回一页 typed cards；`--for-consumer` 只作排序偏好，严格 consumer/decision/stage 过滤由同一条 binding 满足。它不是语义/向量搜索，不返回总命中数，游标绑定查询条件、页大小和 revision。选中来源/材料或 atom 后，按需用 `get-source --unit ... --view ...` 或 `get-atom --view decision|analysis` 读取自足详情。旧 `search` / `search-sources` 接口和类别索引保留兼容；读路径不会因目录或缓存缺失而自动重建。

```bash
python3 "{SKILL_DIR}/scripts/library.py" --library-root "{已确认的项目根}/benchmark" info
python3 "{SKILL_DIR}/scripts/library.py" --library-root "{已确认的项目根}/benchmark" query "当前材料中的处理关系" --kind all --for-consumer laohu-writing --limit 8
python3 "{SKILL_DIR}/scripts/library.py" --library-root "{已确认的项目根}/benchmark" get-atom ATM-0123456789ABCDEF --view decision --consumer laohu-writing
python3 "{SKILL_DIR}/scripts/library.py" --library-root "{已确认的项目根}/benchmark" get-source SRC-0123456789ABCDEF --unit "<unit key>" --view material
```

`info` 只返回入口状态与可靠清点；`query` 返回有界卡片，实际筛选/排序由 catalog 执行，缺少/过期时明确报错而不静默修复。再按候选类型用 `get-source` / `get-atom` 读取所选内容；没有 verified span 的 unit 若当前上下文也没有材料，可读同一 unit 的 analysis 或核对其 locator，不为此展开整份合集。详情不是原作/成品效果证据。完整查询、版本和上下文复用契约见[分层检索与回读](references/library-retrieval.md)。

数据、原文和个人项目资料默认留在本地。此仓库将根 `benchmark/` 下全部积累内容递归忽略，只有 `benchmark/README.md` 说明文件可被 Git 纳入；本 Skill 的实现、manifest、schema 与方法文档位于技能目录。忽略规则不解除已跟踪文件，发布前须核对索引和 staged 清单。使用其他项目位置时另按该项目规则处理；不要仅凭忽略规则就把数据复制到共享仓库或外发。

完整判断与操作说明见 [SKILL.md](SKILL.md)、[原子记录与取用](references/atom-recording-and-reuse.md)、[本地资料库分层检索与回读](references/library-retrieval.md)、[专业方法来源台账](SOURCES.md)、[source schema](schemas/source.schema.json)、[atom schema](schemas/atom.schema.json)、[CLI usage input schema](schemas/usage-input.schema.json) 与 [canonical usage schema](schemas/usage.schema.json)。source_material 必须保留明确的原作引用及读取范围；只在用户提供或明确允许时保存必要材料摘录。记录真实采用时，除确保 `consumer`、`decision`、`stage` 精确匹配同一条既有 binding 外，也应为本次实际情境分别填写 `required_context`、`adaptation`、`return`、`check`，并以真实的 `case_ref`/`result_evidence` 支持；不要依赖默认复制通用 binding 充当本次反馈。
