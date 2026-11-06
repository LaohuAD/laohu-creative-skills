# 本项目的作品方法原子库

项目根 `benchmark/` 是当前项目的本地作品来源、方法原子和使用记录容器。它与 `works/benchmark/` 中按作品建立的分析归档各有用途；技能代码和运行方法仍由 [laohu-benchmark](../.agents/skills/laohu-benchmark/SKILL.md) 维护。本目录不存放技能副本，也不会自动进入安装目录。

## 按需形成的数据结构

```text
benchmark/
├── README.md
├── sources/                    # 首次明确收录来源时按需创建
└── <category>/                 # 首次保存该类原子时按需创建
    ├── atoms/                  # 首次 put 原子时创建
    ├── usage/                  # 首次 log-usage 时创建
    └── index.sqlite3           # put 原子后尝试生成；可删除并重建
```

上图描述可能形成的结构，不代表这些数据目录已经创建。首次 `put` 某类原子时按需创建类别目录和 `atoms/`，并尝试构建类别索引；`usage/` 只在 `log-usage` 首次需要写入时创建。每个来源只在 `sources/` 保存一份来源身份、版本、读取范围及明确获准保存的必要材料；同一来源下的原子通过来源 ID 回连，不重复收录原文。类别优先采用用户指定；否则先盘点并复用能承接主要复用用途或原作工作类型的已有类别。五组分析适配是方法入口，不是存储分类；跨消费者沿用同一原子及获准 bindings。仅当现有类别均不适合时，才按已有命名习惯在首次保存获准原子时新增，不预建空类别；多种归属若会实质改变长期检索或既有组织，需只澄清归属。具体选择与原子修订边界见 [laohu-benchmark 主文](../.agents/skills/laohu-benchmark/SKILL.md#归类与原子复用)。原子与使用记录是可移植数据；SQLite 仅供检索，可从记录重建。

## 按需读取

确认当前项目的 `benchmark/` 位置后，可以先查看库是否可用，再按当前决定搜索少量来源材料或方法候选，并只打开选中单元/原子的详情。“加载”只看入口状态，“搜索”先给候选卡，“读取编号”才读详情；不需要预载整个库。查阅不会自动采用、修改或保存资料，缺少派生检索缓存时也不会在读取时静默重建。查询细节和返回创作步骤见 [本地资料库分层检索与回读](../.agents/skills/laohu-benchmark/references/library-retrieval.md)。

## 私有数据

来源、原文摘录、方法原子、数据库、导出和其他积累内容默认留在本地。此仓库的 [.gitignore](../.gitignore) 递归忽略根 `benchmark/` 下的全部内容，只有本 `README.md` 说明文件可被 Git 纳入；Skill 实现、manifest、schema 和运行文档位于独立技能目录。忽略规则不会自动解除既有跟踪，发布前仍须核对索引和 staged 清单。使用其他项目路径时，依那个项目的保存与共享约定处理；公开具体库资料须另行明确选择资料与目标。

## 方法与工具入口

- [laohu-benchmark 主文](../.agents/skills/laohu-benchmark/SKILL.md)：判断、细读、收录授权与检索采用流程。
- [本地资料库分层检索与回读](../.agents/skills/laohu-benchmark/references/library-retrieval.md)：只读入口、候选卡、选中详情及回到创作步骤。
- [数据清单](../.agents/skills/laohu-benchmark/manifest.json) 与 [source schema](../.agents/skills/laohu-benchmark/schemas/source.schema.json)、[atom schema](../.agents/skills/laohu-benchmark/schemas/atom.schema.json)、[usage schema](../.agents/skills/laohu-benchmark/schemas/usage.schema.json)：目录约定和数据字段。
- [本地库 CLI](../.agents/skills/laohu-benchmark/scripts/library.py)：来源、原子、搜索、使用记录与索引维护工具。
- [laohu-archive](../.agents/skills/laohu-archive/SKILL.md)：只负责返回或准备项目目录容器；方法分类与数据写入仍由 laohu-benchmark 负责。

完整操作条件和命令见技能主文，本文件只说明项目根目录中这份库的用途、布局和入口。
