# 本地作品与方法原子库

本目录承载 `laohu-benchmark` 的拆解方法、Schema 与本地库 CLI 工具。获准收录的新专业研究默认写入实际接收专业 Skill 的 `SKILL.md` 同级 `benchmark/`（跨项目调用亦沿用该库）；根目录 `benchmark/` 旧库继续通过 `--library-root` 兼容读取。普通“拆解并收录”先交付完整分析与可确认入库方案，经确认后写入；详见 [SKILL.md](SKILL.md#选择研究库)。

## 真源、检索缓存与只读边界

- **可迁移真源（JSON / JSONL）**：来源记录（`sources/SRC-*.json`）、跨库来源引用（`.source-links/SRC-*.json`）、方法原子（`<category>/atoms/ATM-*.json`）、原子引用（`.atom-links/ATM-*.json`）与按月使用日志（`<category>/usage/YYYY-MM.jsonl`）。机制未熟时 `put` 支持 `source-only`（省略 `atoms` 或传 `atoms: []`），不建空类别或伪造方法卡。
- **可重建缓存（SQLite）**：全局 `catalog.sqlite3` 与兼容类别 `index.sqlite3` 只存检索短卡与 binding 索引，不存原作正文。`info`、`query`、`get-atom`、`get-source`、`locate-source` 保持只读，不隐式建库或修复缓存；`put` 与显式 `rebuild-index` 维护缓存。
- **隐私保护**：私有来源、原文摘录与使用记录受仓库忽略规则保护留在本地；对外分享或发布前须逐项核对暂存清单。

## 常用只读与回读命令

```bash
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" info
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" query "<当前决定短查询>" --kind all --for-consumer laohu-writing --limit 8
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" get-atom ATM-0123456789ABCDEF --view decision --consumer laohu-writing
python3 "{SKILL_DIR}/scripts/library.py" --skill-file "<接收 Skill 的 SKILL.md 绝对路径>" get-source SRC-0123456789ABCDEF --unit "<unit key>" --view material
```

完整协议与接口见：[SKILL.md](SKILL.md)、[分层检索与回读](references/library-retrieval.md)、[原子记录与取用](references/atom-recording-and-reuse.md)、[方法来源台账](SOURCES.md)、[manifest.json](manifest.json) 及 `schemas/` 下 4 份 JSON Schema。
