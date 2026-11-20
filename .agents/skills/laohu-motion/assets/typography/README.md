# 动画字体与排印库

打开[动画字体样张](index.html)可在浏览器里直接看实际字形。首屏用同一句中文并排比较九款书写、展示、圆体和像素字，也可切换到文楷、快乐体、宋体和黑体。下方按类列出全部字体，可按「行书」「手记」「像素」等词检索。输入自己的原句，拖动字号；展开单个字体的来源可试其实际可变字重。西文条目在中文不齐时显示自己的拉丁字母和数字样张。中文条目的原句缺字以空框和缺字说明标出。

本地文件页面适合快速看字形。用本机 HTTP 打开时，页面逐份核对展示字体与配对许可的 SHA-256。成片选字继续使用下文的正式资源入口。

从本轮原句、观众此刻怎样读和所需字形查起。比如作者从说明转向尚未回答的设问，可搜“个人设问”与“叙述转折”，再把真实台词交给 `--text`。操作片可搜“步骤标签”“指针”“状态反馈”。查询分数来自文字匹配和关联用法，具体选择由 [字体、字幕与可读性](../../references/typography-and-legibility.md) 中的原句试排和动态检查决定。

```sh
node .agents/skills/laohu-motion/scripts/laohu-showreel.mjs resource-overview --scope fonts
node .agents/skills/laohu-motion/scripts/laohu-showreel.mjs resource-search --source fonts --query '中文 个人设问' --text '如果有一天'
node .agents/skills/laohu-motion/scripts/laohu-showreel.mjs resource-get --id font:noto-serif-sc-variable --text '如果有一天'
node .agents/skills/laohu-motion/scripts/laohu-showreel.mjs resource-get --id type-use:tentative-question
```

| 条目 | 内容 |
|---|---|
| `font:…` | 逐份文件去重后的字族与字形资产。详情有实际字重或可变轴、字符覆盖、来源文件、相同字节的其他位置和许可。可按 `中文黑体`、`中文宋体`、`中文书写`、`中文展示`、`等宽字` 等类别浏览。 |
| `type-use:…` | 备选排印用法，含原作用途、适用条件、字形与排版、动作和误读条件。关联字体只是试排候选。原作品名称和片段供对照，正式运行只依赖本库及 Skill 内的实际资产。 |

目录和搜索显示当前能定位的文件。选中后用 `resource-get` 核对文件与配对许可的 SHA-256。实际用字符合所选字族时，`--text` 返回 `coverage.supported`，逐字缺失返回字符和码位。换行、回车、制表符看作布局指令；异体序列另核对其前置字。通过覆盖检查后仍应在最终大小看字腔、断行、合成、动作窗口和替代字形。带多语言内容时核对整个原句，包含标点与数字。

## 收录与维护

- 共享运行模板、已安装的 OpenMotion 包和本库 `vendor/` 下的字体按文件 SHA-256 合并，保持各来源路径。现场缺少可选资料包时，相关条目继续可查，文件状态以当前详情为准。
- `vendor/` 中的思源宋体 Noto Serif SC 2.003-H1 和霞鹜文楷 LXGW WenKai Regular 1.522 的原始字体字节，用于补齐原有小子集的覆盖缺口。各目录的 OFL 附在文件旁。宋体与 noto-cjk 固定来源字节匹配，文楷与上游 v1.522 release 资产摘要匹配。带 `subset` 的旧模板字仍可按实际用字选择。 [Noto Serif SC 原文件](https://github.com/notofonts/noto-cjk/blob/985fa52c81c1d6692ccdd82bc3656e8fb932fd89/google-fonts/NotoSerifSC%5Bwght%5D.ttf) · [霞鹜文楷 v1.522](https://github.com/lxgw/LxgwWenKai/releases/tag/v1.522)
- 本次收录的九款在[上游来源清单](vendor/sources.json)逐份记录固定提交或发行包、字体和配套许可的 SHA-256。文件旁的 `OFL.txt` 保留上游版权声明。jf open 粉圓沿用上游列出的汉字来源，随附许可还包含 Apache 2.0 全文。九款均可按 OFL 用于商业动画、封面、视频标题。交付字体文件时一并交付版权和许可文本，字体不能单独出售。[OFL 官方常见问题](https://openfontlicense.org/ofl-faq/)
- 新增资产先核对真实来源、许可和文件分发条件，放入对应运行时或 `vendor/` 的字族目录，由下面的维护工具取得文件哈希、字重、轴和 cmap。字形名称与分类属于目录维护内容，保留现有稳定 ID 并检查用法引用。无匹配许可的文件保留为线索，正式可复制文件须有配对声明。
- 新用法写入 `uses.json`，引用实际生产资源 ID 或定位到相关做法。原片观察、可试的替代设计及观看反馈按各自证据来写。

```sh
python3 -B .agents/skills/laohu-motion/scripts/refresh-typography-index.py
python3 -B .agents/skills/laohu-motion/scripts/refresh-typography-index.py --write
python3 -B .agents/skills/laohu-motion/scripts/refresh-typography-gallery.py --write
```

首条从本地字体复核目录。需要更新时先保留原表，运行第二条重建，再用第三条更新浏览器的样张目录。两条生成命令去掉 `--write` 可以检查差异。更新后复查普通查询和具体字符。维护工具需要 Python 的 FontTools 和 WOFF2 解码支持。正式查询、已发布的 cmap 核对及制作消费只用现有 Python／Node 运行环境。
