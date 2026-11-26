# 既有作品研究库

本目录是已迁移研究的兼容检索入口。把本目录的绝对路径传给 [laohu-benchmark CLI](../.agents/skills/laohu-benchmark/scripts/library.py) 的 `--library-root`，可按原 ID 读取及检索。索引读取接收 Skill 中的主记录，使用 `locate-source` 可以核对来源的实际文件和哈希。缓存缺失或过期时仍可按已知 ID 回读，重建索引须显式执行。

已收录的主记录按专业用途放在剧本、视频、图片与标题 Skill 的 `benchmark/`。新获准的专业研究也写入接收 Skill 的 `SKILL.md` 同级库。单篇独立分析作品按 `works/benchmark/` 的作品归档使用。 [研究库归属和写入流程](../.agents/skills/laohu-benchmark/SKILL.md#选择研究库)

来源、原文摘录、方法原子、使用记录、索引及导出均为本地资料。仓库的忽略规则保护本目录中的数据和 Skill 同级研究库，本说明可受版本管理；已跟踪或暂存的内容仍需核对。 [版本管理忽略规则](../.gitignore)

按需使用 [分层检索和回读](../.agents/skills/laohu-benchmark/references/library-retrieval.md)、[原子记录与取用](../.agents/skills/laohu-benchmark/references/atom-recording-and-reuse.md) 及[数据清单](../.agents/skills/laohu-benchmark/manifest.json)。
