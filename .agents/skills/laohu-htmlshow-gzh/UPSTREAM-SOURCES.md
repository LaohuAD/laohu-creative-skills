# 上游规则来源与许可记录

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
