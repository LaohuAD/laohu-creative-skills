# 素笺 —— 阅读主题组件库

由主入口按主题索引选择后读取，并配合[阅读主题适配与装配](wedraft-adaptation.md)返回主入口第 4 步。ID：`wedraft-plain-paper`。这是 WeDraft 阅读模板的本地适配；来源与许可由入口目录台账维护。

## 设计变量速查表

| 变量 | 值与作用 |
|---|---|
| 主色 | `#756655`，章节与局部引线 |
| 正文 | `#3F3D39`，16px，行高 1.90 |
| 段距 | `0 8px 24px` |
| 浅底 | `#F8F6F1`，代码／表头与独立引文按各自样式 |
| 标题与编号 | `PingFang SC,Microsoft YaHei,Arial,sans-serif`；具体字重、边距见组件 |
| 分隔 | `1px solid #C8BFB2`，不新增正文没有的分隔 |

## 连续手机阅读的主题节奏

居中章节与独立编号；引文上下细线；短居中分割线。普通段落连读，不逐段套卡。 标题换行必须仍与编号归为一组；普通正文不加无来源角标或卡片名。375 CSS px 连读开头、正文、后段，320 CSS px 复查表格、长 URL 和代码。先保留本主题的章节与引文结构，再撤掉没有内容职责的新增强调；不通过改写文章掩盖溢出。

## 组件 1：文章标题

```html
<h1 style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:24px;line-height:1.55;font-weight:600;letter-spacing:0.5px;color:#3F3D39;margin:0 8px 28px;text-align:center;"><span leaf="">原文标题占位</span></h1>
```

## 组件 2：章节标题

```html
<h2 style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:21px;line-height:1.55;font-weight:600;letter-spacing:0.5px;color:#3F3D39;margin:0 8px 20px;text-align:center;margin-top:36px;"><span style="display:block;font-family:Songti SC,Noto Serif CJK SC,SimSun,serif;font-size:13px;font-weight:400;line-height:1.4;letter-spacing:1px;color:#756655;margin-bottom:6px;"><span leaf="">01</span></span><span style="display:block;"><span leaf="">原文章节占位</span></span></h2>
```

## 组件 3：小节标题

```html
<h3 style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:17px;line-height:1.7;font-weight:600;letter-spacing:0;color:#756655;margin:26px 8px 12px;"><span leaf="">原文小节占位</span></h3>
```

## 组件 4：连续正文

```html
<p style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:16px;line-height:1.90;font-weight:400;letter-spacing:0;text-align:left;color:#3F3D39;margin:0 8px 24px;"><span leaf="">原文段落占位。</span></p>
```

## 组件 5：原文引用

```html
<section style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:16px;line-height:1.86;font-weight:400;letter-spacing:0;text-align:left;color:#3F3D39;border-left:0;background-color:#FFFFFF;padding:12px 16px 12px 32px;margin:26px 8px;border-top:1px solid #E6E0D7;border-bottom:1px solid #E6E0D7;"><span leaf="">原文引句占位。</span></section>
```

## 组件 6：原文旁注

```html
<p style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:13px;line-height:1.8;color:#74706A;text-align:left;margin:12px 8px 22px;"><span leaf="">原文提示占位。</span></p>
```

## 组件 7：无序列表

```html
<ul style="padding-left:1.25em;margin:18px 8px 24px;"><li style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:16px;line-height:1.90;font-weight:400;letter-spacing:0;text-align:left;color:#3F3D39;margin:0 0 6px;"><span leaf="">原文列表项占位</span></li><li style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:16px;line-height:1.90;font-weight:400;letter-spacing:0;text-align:left;color:#3F3D39;margin:0 0 6px;"><span leaf="">下一项占位</span></li></ul>
```

## 组件 8：有序步骤

```html
<ol style="padding-left:1.25em;margin:18px 8px 24px;"><li style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:16px;line-height:1.90;font-weight:400;letter-spacing:0;text-align:left;color:#3F3D39;margin:0 0 6px;"><span leaf="">原文步骤占位</span></li><li style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:16px;line-height:1.90;font-weight:400;letter-spacing:0;text-align:left;color:#3F3D39;margin:0 0 6px;"><span leaf="">下一步占位</span></li></ol>
```

## 组件 9：代码与提示词

```html
<section style="margin:24px 8px 26px;"><p style="font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.75;color:#3F3D39;background-color:#FAF9F6;border:1px solid #E6E0D7;padding:14px 16px;margin:0;white-space:pre-wrap;overflow-x:auto;"><span leaf="">原始代码或提示词占位</span></p></section>
```

## 组件 10：图片与图注

```html
<section style="margin:26px 8px;"><img src="图片路径.png" alt="来源替代文本占位" style="display:block;max-width:100%;height:auto;margin:0 auto;"><p style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:12px;line-height:1.65;color:#74706A;text-align:right;margin:0 8px 26px;"><span leaf="">来源图注占位</span></p></section>
```

## 组件 11：数据表格

```html
<section style="margin:24px 8px 28px;border-top:1px solid #CFC5B7;overflow-x:auto;"><table style="display:table;width:100%;border-collapse:collapse;font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-variant-numeric:tabular-nums;"><thead><tr><th style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:13.5px;line-height:1.65;font-weight:600;letter-spacing:0;font-variant-numeric:tabular-nums;color:#756655;background-color:#F8F6F1;padding:10px 8px;text-align:left;vertical-align:middle;border-bottom:1px solid #E6E0D7;"><span leaf="">原文表头占位</span></th><th style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:13.5px;line-height:1.65;font-weight:600;letter-spacing:0;font-variant-numeric:tabular-nums;color:#756655;background-color:#F8F6F1;padding:10px 8px;text-align:left;vertical-align:middle;border-bottom:1px solid #E6E0D7;"><span leaf="">原文表头占位</span></th></tr></thead><tbody><tr><td style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:13.5px;line-height:1.7;font-weight:400;letter-spacing:0;font-variant-numeric:tabular-nums;color:#3F3D39;background-color:#FFFFFF;padding:10px 8px;text-align:left;vertical-align:middle;border-bottom:1px solid #E6E0D7;"><span leaf="">原文单元格占位</span></td><td style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:13.5px;line-height:1.7;font-weight:400;letter-spacing:0;font-variant-numeric:tabular-nums;color:#3F3D39;background-color:#FFFFFF;padding:10px 8px;text-align:left;vertical-align:middle;border-bottom:1px solid #E6E0D7;"><span leaf="">原文单元格占位</span></td></tr></tbody></table></section>
```

## 组件 12：原有来源区

```html
<section style="padding:2px 0 4px;margin:0 8px 22px;"><p style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:13px;line-height:1.8;color:#74706A;padding-left:0;margin:0 0 8px;white-space:pre-wrap;overflow-x:auto;"><span leaf="">原文完整来源与地址占位</span></p></section>
```

## 组件 13：原分割线

```html
<hr style="border:0;border-top:1px solid #C8BFB2;width:28px;font-size:0;line-height:0;height:0;margin:34px auto 16px;">
```

## 组件 14：行内语义

```html
<p style="font-family:PingFang SC,Microsoft YaHei,Arial,sans-serif;font-size:16px;line-height:1.90;font-weight:400;letter-spacing:0;text-align:left;color:#3F3D39;margin:0 8px 24px;"><span style="color:#3F3D39;font-weight:700;"><span leaf="">原文标记占位</span></span><span style="background-color:#F8F6F1;color:#3F3D39;font-weight:600;"><span leaf="">原文标记占位</span></span><span style="border-bottom:1px solid #756655;"><span leaf="">原文标记占位</span></span><span style="text-decoration:line-through;"><span leaf="">原文标记占位</span></span><span style="font-family:Menlo,Consolas,monospace;font-size:14px;white-space:pre-wrap;color:#756655;"><span leaf="">原文标记占位</span></span><span style="font-style:italic;"><span leaf="">原文标记占位</span></span></p>
```

## 完整文章模板骨架

全局 section → 原文章标题（存在时）→ 原有引言／正文 → 原有章节与其正文、列表、图表或代码 → 原有结束内容／来源。没有来源内容的区块不生成；无默认封面、目录、署名或 CTA。章节顺序按原文，不将标题重命名成组件名。语义块装配器负责输出完整全局容器，组件片段用于读取与必要结构扩展。

## 文章类型 → 组件组合配方

| 阅读任务 | 核心组合 | 条件性补充 |
|---|---|---|
| 连续论证／随笔 | 标题、章节、正文 | 仅原文有独立引文时用引用；不按段落逐项套卡 |
| 操作教程 | 章节、正文、有序步骤、代码 | 有真实结果图／参数时再加入图片／数据表 |
| 报道／人物 | 标题、正文、原文引用 | 图注按来源保留，出处区仅取原文 |
| 方法与数据说明 | 章节、正文、数据表 | 表格只承担真实行列比较；宽表局部滚动 |

## Markdown → 组件映射规则

| 源内容 | 组件／语义块 |
|---|---|
| #、##、### | title、chapter、subheading；保留原文字 |
| 普通段落、明确硬换行 | paragraph；硬换行输出 br |
| > 原引句 | quote，不补署名、引号或评语 |
| 原有提示 | note，不补默认 NOTE 标签 |
| - 项、数字步骤 | list；ordered 区分原有顺序 |
| 围栏代码／Prompt | code，原字符一个 leaf；无自动语言标签 |
| 图片／GIF | image，来源 alt 与可选 caption 分开 |
| 表格 | table，headers 与 rows 逐单元格保真 |
| 原有来源／分隔线 | references／divider；URL 保持可见可复制 |
| 加粗／高亮／下划线／删除／行内代码／斜体 | 行内 strong／mark／underline／delete／code／em，不互换语义 |

适用入口、JSON 字段、异常处理、便携图片与校验顺序统一见[阅读主题适配与装配](wedraft-adaptation.md)，不在各主题复制第二套。
