# 老胡造梦技能

老胡造梦技能是面向老胡创作工作的可主动调用 Skill 工具箱。用户可以直接选择写歌词、做封面、写剧本、整理作品等入口；不知道该用哪个能力时，使用 `/laohu` 进行路由。

当前仓库只完成目录骨架，入口内容会按真实任务逐步建立。目录名称使用 ASCII，便于不同 Agent、插件和发布工具发现；中文说明放在规则和文档中。

## 当前入口

| 入口 | 用途 |
| --- | --- |
| `laohu` | 顶层路由与任务澄清 |
| `laohu-topic` | 选题 |
| `laohu-writing` | 写作 |
| `laohu-lyrics` | 歌词 |
| `laohu-title` | 标题 |
| `laohu-cover` | 封面 |
| `laohu-script` | 剧本 |
| `laohu-image` | 图片 |
| `laohu-assets` | 视觉与创作资产 |
| `laohu-story` | 故事脑洞 |
| `laohu-video` | 视频与视频提示词 |
| `laohu-update` | 工具箱更新 |
| `laohu-diagnosis` | 找出作品问题 |
| `laohu-archive` | 作品整理、收录与归档 |
| `laohu-arrangement` | 编曲 |
| `laohu-benchmark` | 对标拆解 |
| `laohu-evolution` | 自我进化与经验收录 |

## 目录

```text
老胡造梦技能/
├── AGENTS.md
├── README.md
├── skills/
│   ├── laohu/
│   ├── laohu-topic/
│   ├── laohu-writing/
│   ├── laohu-lyrics/
│   ├── laohu-title/
│   ├── laohu-cover/
│   ├── laohu-script/
│   ├── laohu-image/
│   ├── laohu-assets/
│   ├── laohu-story/
│   ├── laohu-video/
│   ├── laohu-update/
│   ├── laohu-diagnosis/
│   ├── laohu-archive/
│   ├── laohu-arrangement/
│   ├── laohu-benchmark/
│   └── laohu-evolution/
├── works/
└── knowledge/
```

空目录中的 `.gitkeep` 只是为了让 Git 保留目录，不代表该入口已经有可执行 Skill。后续每个入口会单独建立 `SKILL.md`，再按需要增加 `references/`、`templates/`、`scripts/` 或其他依赖。
