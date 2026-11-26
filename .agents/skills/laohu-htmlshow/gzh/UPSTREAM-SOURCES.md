# 上游规则来源与许可记录

## WeDraft 阅读主题迁移

固定来源：`pafa/WeDraft`，commit `9663ce505c25d48c10ec6426ee1d106b8421ae06`，2026-10-30 核验。原文件为 `templates/reading-editions.ts`，含五套阅读版；源代码与版本可在 https://github.com/pafa/WeDraft/tree/9663ce505c25d48c10ec6426ee1d106b8421ae06 核对。许可 MIT，完整声明保留于 `WEDRAFT-LICENSE`。

保留：五套正文、章节／编号、引文、表格、代码与图注的样式及差别。改动：本地 ID 加 `wedraft-` 前缀；补 leaf；图片改 max-width 自适应而不强制放大；全局正文留白；编号宽度用 min-width 允许增长；链接目的地可见可复制；不默认生成引号、来源标题、脚注序号、署名或品牌文案。样式数据在 `assets/wedraft-reading.json`，装配实现为 Python 标准库本地编译器，不复制或冒充上游 Markdown 解析器、应用、MCP 或 CLI。

未单独迁入 `default-business.json` 和 `next-edition.json`：本轮先接入独立阅读方向的五套版本；两套品牌化基础模板保留在研究源快照，不新设相近常驻主题。以后若有明确需求，仍须比较实际结构和文字邻色对比，而非只登记名字。

新增预览统一使用 `assets/wedraft-preview.json`，文字整理自画梦枋现有原创产品介绍，表格只归组其中已核事实，不采用 WeDraft 的示例文章／署名。此样稿用于展示版式，不证明真实公众号粘贴效果。原六套画廊内容与样式保持不变。

## 结构检查来源

本地规则对照目标为第三方公开项目 `wechatjs/verify-article-structure-spec`，不是微信官方平台声明。记录固定到 commit `1340988eccbb63181a56141a5c2171d55cd42521`（2026-10-05 核验）；规范版本标记为 v0.2.17。本 Skill 重新表述适用条件并使用 Python 标准库作有限静态候选检查；本地没有复制其 TypeScript CLI 引擎代码，也未安装其 Puppeteer / `mp-darkmode` 依赖。

## 固定来源

- 仓库：<https://github.com/wechatjs/verify-article-structure-spec/tree/1340988eccbb63181a56141a5c2171d55cd42521>
- 规则文档：<https://github.com/wechatjs/verify-article-structure-spec/blob/1340988eccbb63181a56141a5c2171d55cd42521/verify_article_structure.md>
- 规则配置与正反例：<https://github.com/wechatjs/verify-article-structure-spec/blob/1340988eccbb63181a56141a5c2171d55cd42521/cases.config.js>
- width 候选收集：<https://github.com/wechatjs/verify-article-structure-spec/blob/1340988eccbb63181a56141a5c2171d55cd42521/cli/engine/rules/width.ts>
- 多屏布局测量：<https://github.com/wechatjs/verify-article-structure-spec/blob/1340988eccbb63181a56141a5c2171d55cd42521/cli/engine/layout.ts>
- dark mode 转换与结果验证：<https://github.com/wechatjs/verify-article-structure-spec/blob/1340988eccbb63181a56141a5c2171d55cd42521/cli/engine/darkmode.ts>
- 上游许可：<https://github.com/wechatjs/verify-article-structure-spec/blob/1340988eccbb63181a56141a5c2171d55cd42521/LICENSE>

## 上游 LICENSE 原文

```text
MIT License

Copyright (c) 2026 Tencent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The LICENSE was reviewed for this rule-localization task. The adapted prose and tests do not copy upstream implementation code; keep this attribution and notice with the source record if future maintenance copies substantial upstream material.
