# 本地作品与方法原子库

这个目录保存 `laohu-benchmark` 的方法、工具与数据说明。获准的新研究默认写入实际接收专业 Skill 的 `SKILL.md` 同级 `benchmark/`。跨项目调用沿用该库，旧项目根库仍可指定绝对路径访问。普通“拆解并收录”先交分析和入库方案，经确认后保存；也可按明确的直接写入授权执行。收录、跨领域归属与来源引用见 [Skill 主文](SKILL.md#保存授权与工具)。

JSON 来源、来源引用、原子和按月使用记录是可迁移真源。接收库的来源引用让不同领域沿同一个 ID 读取主库材料。库内 `catalog.sqlite3` 保存分层检索卡片和短元数据，类别 `index.sqlite3` 兼容原有检索，均为可重建缓存。`info` 与 `query` 保持只读，`put` 与显式 `rebuild-index` 维护缓存。类别随首条获准写入的原子按需创建，并按主要用途复用既有类别。

如果本轮明确授权保存来源，但尚无证据支持一条可复用的方法，`put` 可以只接收 `source` 或 `sources`，不传 `atom`/`atoms`，也可传 `atoms: []`。这只写来源 JSON，不会因这条来源新建空类别、atom 搜索项或 usage；用 `get-source` 读取。`put` 仍按既有流程维护当前 catalog 和已有类别缓存。来源材料/整来源回退可以作为 `material` 查询候选，但不伪装成方法 binding；`method` 卡只表示方法记录。用户显式提交了非法的原子类型或字段时，命令仍报错，不会悄悄降级成 source-only。

来源的简短 `notes` 可作为以后按普通问法查找的目录说明，不要把原文或长摘录塞入其中。新调用流程用只读 `query TEXT --kind all|material|method` 从全局 catalog 返回一页 typed cards；`--for-consumer` 只作排序偏好，严格 consumer/decision/stage 过滤由同一条 binding 满足。它不是语义/向量搜索，不返回总命中数，游标绑定查询条件、页大小和 revision。选中来源/材料或 atom 后，按需用 `get-source --unit ... --view ...` 或 `get-atom --view decision|analysis` 读取自足详情。旧 `search` / `search-sources` 接口和类别索引保留兼容；读路径不会因目录或缓存缺失而自动重建。

```bash
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" info
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" query "当前材料中的处理关系" --kind all --for-consumer laohu-writing --limit 8
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" get-atom ATM-0123456789ABCDEF --view decision --consumer laohu-writing
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" get-source SRC-0123456789ABCDEF --unit "<unit key>" --view material
```

`info` 只返回入口状态与可靠清点；`query` 返回有界卡片，实际筛选/排序由 catalog 执行，缺少/过期时明确报错而不静默修复。再按候选类型用 `get-source` / `get-atom` 读取所选内容；没有 verified span 的 unit 若当前上下文也没有材料，可读同一 unit 的 analysis 或核对其 locator，不为此展开整份合集。详情不是原作/成品效果证据。完整查询、版本和上下文复用契约见[分层检索与回读](references/library-retrieval.md)。

私有来源、原文和使用记录留在本地。仓库忽略专业 Skill 库的内容以及旧根库中的数据，根库的说明与实现文档可受版本管理。发布前仍需核对已经跟踪的文件和暂存清单；显式选择其他项目位置时按该项目的权限和共享约定处理。

完整判断与操作说明见 [SKILL.md](SKILL.md)、[原子记录与取用](references/atom-recording-and-reuse.md)、[本地资料库分层检索与回读](references/library-retrieval.md)、[专业方法来源台账](SOURCES.md)、[source schema](schemas/source.schema.json)、[atom schema](schemas/atom.schema.json)、[CLI usage input schema](schemas/usage-input.schema.json) 与 [canonical usage schema](schemas/usage.schema.json)。source_material 必须保留明确的原作引用及读取范围；只在用户提供或明确允许时保存必要材料摘录。记录真实采用时，除确保 `consumer`、`decision`、`stage` 精确匹配同一条既有 binding 外，也应为本次实际情境分别填写 `required_context`、`adaptation`、`return`、`check`，并以真实的 `case_ref`/`result_evidence` 支持；不要依赖默认复制通用 binding 充当本次反馈。
