# 公众号排版组件库 —— 摸鱼票据风

> **使用说明**：本组件库为「摸鱼票据风」主题（移植自 moyuticket 排版规范），所有组件使用**内联样式**，可直接复制粘贴到微信公众号编辑器。
>
> **设计风格**：票据/门票视觉隐喻——米黄纸感底 + 黑色实边框 + 硬阴影（`box-shadow` 无虚化偏移），配合绿色虚线"撕票线"和编号角标。来源/授权提供评分时才显示对应星级或等级。适合测评、工具对比、创意评测类文章，强调"这是一张值得收藏的凭证"的仪式感。
>
> **公众号平台限制须知**：
> - ❌ 不支持 `<style>`/`<script>`、CSS class/id、`position:fixed/absolute`、`float`、`@media`/`@keyframes`、`display:grid`
> - ✅ 支持内联 `style`、`display:flex`（有限）、`box-shadow`（含硬阴影偏移）、`border-radius`、`text-shadow`、`<svg>`（结尾互动区图标，微信支持）、`<section>/<p>/<span>/<strong>/<img>` 等基础标签
>
> **WeChat 兼容铁律**（本主题组件全部已按此写好，改动时必须遵守）：
> - 所有"装饰性空元素"（撕票虚线、头像占位框）**没有真实内容时整块删掉**，不留空 section
> - 正文字号固定 `14px`、行高 `1.9`——这是本主题的排版铁律，不与其它主题共用字号
> - 不要把 `font-size`/`border-bottom` 打在 `<strong>` 上，高亮样式统一挂在外层 `<span>` 上
> - `writing-mode:vertical-rl`（票据侧边竖排字）在个别老旧客户端可能渲染异常，如遇异常可退化为横排小字，不影响其余结构

---

## 设计变量速查表

```
主色调（绿）：   #059669
米黄纸感背景：   #fffef8
浅绿背景：       #F0FDF4
绿色虚线/撕票线：#A7F3D0
黑色描边/硬阴影：#1a1a1a
正文色：         #555
标题色：         #1a1a1a
次要文字：       #888 / #999
代码背景：       #F3F4F6
代码字色：       #1F2937
品牌紫色（AI 品牌专用，如 Claude/Obsidian/Gemini）：#7C3AED
正文字号：       14px（本主题铁律，不可改）
正文行高：       1.9
全局行高：       1.75
字间距：         0.5px
最大宽度：       677px
内容区边距：     0 20px（正文区块左右各 20px）
章节间距：       margin-bottom: 32px
```

字体栈：`-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif`

---

## 组件 1 全局容器

```html
<section style="max-width:677px;margin:0 auto;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:#374151;line-height:1.75;letter-spacing:0.5px;">

  <!-- 所有组件放在这里 -->

</section>
```

---

## 组件 2 票据封面 ticket-cover

**用途**：文章开头的票据视觉封面，适合测评/对比/创意类文章。编号与竖排小字营造凭证感；星级和等级只有来源或用户明确提供时才显示。

**文字来源**：大标题原样沿用文章标题或用户指定文字；副标题、简介、标签、作者信息、编号、竖排标签、摘要只取原文/用户提供内容。用户明确授权创作某字段时，仅按授权范围新增；无来源时删除对应文字槽。评分星级与等级以原文/用户明确提供为前提。

**可替换字段**：
- 头部标签、大标题、副标题、作者名/身份、简介段落、话题标签、编号、竖排文字、等级：分别使用原文已有信息或用户提供内容；无来源即删去字段。
- 评分星级与评级等级：只使用来源明确给出的评分/等级；缺少来源时删除相应组件。

```html
<section style="background:#fffef8;border:2px solid #1a1a1a;box-shadow:4px 4px 0 #1a1a1a;margin-bottom:32px;">
  <section style="background:#059669;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;">
    <section style="color:#fffef8;font-size:11px;letter-spacing:4px;font-weight:600;"><span leaf="">{{头部标签}}</span></section>
    <!-- 有原文/用户提供的评分时替换为对应星级；无评分来源时删除整个评分 section，不默认五星。 -->
    <section style="color:#fffef8;font-size:11px;letter-spacing:2px;"><span leaf="">{{来源评分星级}}</span></section>
  </section>
  <section style="display:flex;">
    <section style="flex:1;padding:24px 20px;border-right:2px dashed #A7F3D0;">
      <section style="font-size:24px;font-weight:900;color:#1a1a1a;letter-spacing:0.5px;margin-bottom:4px;text-shadow:0.5px 0 0 #1a1a1a;"><span leaf="">{{大标题}}</span></section>
      <section style="font-size:14px;color:#666;letter-spacing:1px;margin-bottom:20px;"><span leaf="">{{副标题}}</span></section>
      <section style="border-top:1px dashed #A7F3D0;margin-bottom:16px;"><span leaf=""><br></span></section>
      <section style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <!-- 有作者头像图时插入 <img> 到下面这个圆框里；无头像时整块删除该 section -->
        <section style="width:48px;height:48px;border-radius:50%;overflow:hidden;border:2px solid #059669;flex-shrink:0;"><span leaf=""><br></span></section>
        <section>
          <section style="font-size:15px;color:#1a1a1a;font-weight:700;"><span leaf="">{{作者名}}</span></section>
          <section style="font-size:12px;color:#888;"><span leaf="">{{作者身份}}</span></section>
        </section>
      </section>
      <section style="font-size:13px;color:#555;line-height:1.8;padding:12px;background:#F0FDF4;border:1px solid #A7F3D0;">
        <span leaf="">{{简介段落}}</span>
      </section>
      <section style="display:flex;gap:8px;margin-top:16px;">
        <section style="font-size:10px;color:#059669;border:1px solid #059669;padding:4px 10px;"><span leaf="">{{#标签1}}</span></section>
        <section style="font-size:10px;color:#059669;border:1px solid #059669;padding:4px 10px;"><span leaf="">{{#标签2}}</span></section>
        <section style="font-size:10px;color:#059669;border:1px solid #059669;padding:4px 10px;"><span leaf="">{{#标签3}}</span></section>
      </section>
    </section>
    <section style="width:48px;padding:14px 4px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;background:#F0FDF4;">
      <section style="text-align:center;">
        <section style="font-size:7px;color:#999;letter-spacing:1px;"><span leaf="">NO.</span></section>
        <section style="font-size:18px;font-weight:900;color:#059669;"><span leaf="">{{编号}}</span></section>
      </section>
      <section style="writing-mode:vertical-rl;font-size:9px;color:#888;letter-spacing:2px;"><span leaf="">{{竖排文字}}</span></section>
      <!-- 有来源/用户提供的评级时保留等级槽；否则删除整个 GRADE section。 -->
      <section style="text-align:center;">
        <section style="font-size:7px;color:#999;letter-spacing:1px;"><span leaf="">GRADE</span></section>
        <section style="font-size:14px;font-weight:900;color:#059669;"><span leaf="">{{来源等级}}</span></section>
      </section>
    </section>
  </section>
  <section style="display:flex;justify-content:space-between;align-items:center;padding:0 8px;">
    <section style="flex:1;border-top:2px dashed #A7F3D0;"><span leaf=""><br></span></section>
    <section style="padding:0 8px;font-size:10px;color:#A7F3D0;"><span leaf="">✂</span></section>
    <section style="flex:1;border-top:2px dashed #A7F3D0;"><span leaf=""><br></span></section>
  </section>
  <section style="padding:10px 20px;display:flex;justify-content:space-between;align-items:center;">
    <section style="font-size:10px;color:#999;letter-spacing:1px;"><span leaf="">VALID FOR ONE READ</span></section>
    <section style="font-size:10px;color:#999;letter-spacing:1px;"><span leaf="">ADMIT ONE 🎫</span></section>
  </section>
</section>
```

---

## 组件 3 章节标题 chapter-title

**用途**：大章节分隔，编号 01/02/03…

**可替换字段**：`{{编号}}` `{{标题}}` `{{副标题}}`

```html
<section style="margin-bottom:32px;padding:0 20px;">
  <section style="display:flex;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #1a1a1a;">
    <section style="background:#059669;color:#fff;font-size:12px;font-weight:800;padding:6px 12px;letter-spacing:2px;"><span leaf="">{{编号}}</span></section>
    <section style="font-size:18px;font-weight:800;color:#1a1a1a;letter-spacing:1px;"><span leaf="">{{标题}}</span></section>
    <section style="font-size:12px;color:#888;"><span leaf="">/ {{副标题}}</span></section>
  </section>

  <!-- 本章节正文内容放在这里 -->

</section>
```

---

## 组件 4 小节标题 subtitle

**用途**：章节内的二级标题。

**可替换字段**：`{{小节标题}}`

```html
<section style="margin-bottom:32px;padding:0 20px;">
  <section style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
    <section style="width:4px;height:16px;background:#059669;"><span leaf=""><br></span></section>
    <section style="font-size:15px;font-weight:700;color:#1a1a1a;"><span leaf="">{{小节标题}}</span></section>
  </section>
</section>
```

---

## 组件 5 正文段落 paragraph

**用途**：普通正文，可内嵌组件 6 文字强调。字号行高是本主题铁律，不要跟随其它主题改动。

**可替换字段**：`{{正文内容}}`

```html
<section style="margin-bottom:32px;padding:0 20px;">
  <p style="font-size:14px;color:#555;line-height:1.9;margin-bottom:16px;text-align:justify;">
    <span leaf="">{{正文内容}}</span>
  </p>
</section>
```

---

## 组件 6 文字强调（5 种子样式）

**用途**：在正文段落内使用，按需选择一种，一段文字不要叠加超过 2 种。

### 6a. 绿色加粗 —— 产品名/工具名

```html
<span style="color:#059669;font-weight:700;"><span leaf="">{{文字}}</span></span>
```

### 6b. 绿色高亮 —— 核心观点/关键数据

```html
<span style="background:linear-gradient(120deg,#A7F3D0 0%,rgba(167,243,208,0) 100%);padding:0 4px;font-weight:600;color:#111;"><span leaf="">{{文字}}</span></span>
```

### 6c. 绿色下划线 —— 原文下划线或按需新增强调的视觉样式

```html
<span style="border-bottom:2px solid #A7F3D0;font-weight:600;"><span leaf="">{{文字}}</span></span>
```

### 6d. 代码标签 —— 技术名词/模型名/命令

```html
<span style="background:#F3F4F6;color:#1F2937;padding:2px 6px;border-radius:4px;font-size:13px;font-weight:600;"><span leaf="">{{文字}}</span></span>
```

### 6e. 品牌紫色 —— Claude / Obsidian / Gemini 等 AI 品牌名专用

```html
<span style="color:#7C3AED;font-weight:700;"><span leaf="">{{文字}}</span></span>
```

**使用原则**：产品/工具名用 6a；核心观点/关键数据用 6b；原文下划线或按需新增的次要强调用 6c；技术名词/模型名用 6d；AI 品牌名专用 6e，不要把 6a 和 6e 混用在同一个词上。

---

## 组件 7 Case 标题 case-title

**用途**：案例/示例展示前的小标题，紧跟其后的内容是该案例的具体展开。

**可替换字段**：`{{case编号}}` `{{案例名称}}`

```html
<section style="margin-bottom:32px;padding:0 20px;">
  <p style="font-size:13px;color:#1a1a1a;font-weight:600;margin-bottom:0;">
    <span leaf="">case{{case编号}}: {{案例名称}}</span>
  </p>
</section>
```

---

## 组件 8 图片容器 image-ticket

**用途**：包裹图片，票据纸感边框（米黄底 + 细灰边）。**规则**：`<img>` 标签及其 `src`/`data-src` 原封不动复制，只套外层容器。

```html
<section style="margin-bottom:32px;padding:0 20px;">
  <section style="background:#fffef8;border:1px solid #eee;padding:6px;margin-bottom:0;">
    <figure style="margin:0;">
      <span leaf=""><img src="{{图片URL}}" style="max-width:100%;height:auto;display:block;margin:0 auto;"></span>
    </figure>
  </section>
</section>
```

---

## 组件 9 结论卡片 conclusion-card

**用途**：章节小结、观点总结。

**可替换字段**：`{{前缀}}` `{{结论内容}}`

```html
<section style="margin-bottom:32px;padding:0 20px;">
  <section style="background:#F0FDF4;border-left:4px solid #059669;padding:14px 16px;margin-bottom:0;">
    <p style="font-size:14px;color:#1a1a1a;font-weight:600;line-height:1.7;margin:0;">
      <span leaf="">{{前缀}}</span>
      <span style="color:#059669;"><span leaf="">{{结论内容}}</span></span>
    </p>
  </section>
</section>
```

---

## 组件 10 编号特点列表 numbered-feature-list

**用途**：特点、步骤、清单，每项独立一个卡片，可重复 N 次。

**可替换字段**：`{{序号}}` `{{小标题}}` `{{描述}}`

```html
<section style="margin-bottom:32px;padding:0 20px;">
  <section style="background:#fffef8;border:1px solid #eee;margin-bottom:12px;">
    <section style="display:flex;align-items:stretch;">
      <section style="width:36px;background:#059669;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800;"><span leaf="">{{序号}}</span></section>
      <section style="flex:1;padding:12px 16px;font-size:13px;color:#555;line-height:1.7;border-left:1px dashed #A7F3D0;">
        <span style="font-weight:600;color:#1a1a1a;"><span leaf="">{{小标题}}</span></span>
        <span leaf="">：{{描述}}</span>
      </section>
    </section>
  </section>
</section>
```

（本组件的 `border-left:1px dashed` 是撕票分隔线，属本主题风格特征，可直接使用，不受"正文强调不用虚线框"规则约束。）

---

## 组件 11 核心观点卡片 key-point-card

**用途**：全文核心金句、关键数据，适合章节高潮或中段强调。硬阴影描边呼应票据封面。

**可替换字段**：`{{金句前半}}` `{{大数字}}`（可选）`{{金句后半}}` `{{补充说明}}`

```html
<section style="margin-bottom:32px;padding:0 20px;">
  <section style="background:#fffef8;border:2px solid #1a1a1a;box-shadow:3px 3px 0 #1a1a1a;padding:20px;margin-bottom:0;">
    <p style="font-size:15px;color:#1a1a1a;font-weight:700;line-height:1.8;margin:0 0 12px;text-align:center;">
      <span leaf="">{{金句前半}}</span>
      <span style="color:#059669;font-size:24px;"><span leaf="">{{大数字}}</span></span>
      <span leaf="">{{金句后半}}</span>
    </p>
    <p style="font-size:14px;color:#555;line-height:1.8;margin:0;text-align:justify;">
      <span leaf="">{{补充说明}}</span>
    </p>
  </section>
</section>
```

无大数字时去掉中间那个 `font-size:24px` 的 `<span>`，整句金句合并放第一行 `<p>` 即可。

---

## 组件 12 标签组 tag-group

**用途**：#话题标签，可多个并排；也用于封面之外单独展示话题标签。

**可替换字段**：`{{#标签}}`

```html
<section style="margin-bottom:32px;padding:0 20px;">
  <section style="display:flex;gap:8px;flex-wrap:wrap;">
    <section style="font-size:10px;color:#059669;border:1px solid #059669;padding:4px 10px;"><span leaf="">{{#标签1}}</span></section>
    <section style="font-size:10px;color:#059669;border:1px solid #059669;padding:4px 10px;"><span leaf="">{{#标签2}}</span></section>
    <section style="font-size:10px;color:#059669;border:1px solid #059669;padding:4px 10px;"><span leaf="">{{#标签3}}</span></section>
  </section>
</section>
```

---

## 组件 13 可选结尾互动区 footer-cta

**用途**：承载原文已有或用户明确要求加入的结尾互动文案，采用票据风图标/标签布局与撕票虚线收尾；它不是每篇文章的必备区块。只有原文含 CTA 或用户明确要求新增 CTA 时才使用，无来源时整块省略。

**署名与动作适配**：署名是独立内容，仅原文已有或用户明确提供时才放在前面；CTA 文案只沿用原文或用户指定内容，不使用通用固定话术。组件内的动作图标/标签只是排版位置示意，逐项对应实际 CTA 中出现的动作；无对应动作就删去该图标项，不因组件示意额外增加点赞、在看、星标或转发。

**可替换字段**：`{{互动文案}}`

```html
<section style="padding:0 0 32px;">
  <section style="background:#fffef8;border:2px solid #1a1a1a;box-shadow:4px 4px 0 #1a1a1a;padding:24px 20px;text-align:center;">
    <p style="font-size:13px;font-weight:700;color:#1a1a1a;margin:0 0 20px;line-height:1.6;">
      <span leaf="">{{互动文案}}</span>
    </p>
    <section style="display:flex;justify-content:center;gap:24px;margin-bottom:16px;">
      <section style="text-align:center;color:#555;">
        <section style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;background:#fff;border:1px solid #1a1a1a;">
          <span style="font-size:18px;line-height:1;color:inherit;"><span leaf="">赞</span></span>
        </section>
        <span style="font-size:10px;font-weight:600;"><span leaf="">点赞</span></span>
      </section>
      <section style="text-align:center;color:#555;">
        <section style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;background:#fff;border:1px solid #1a1a1a;">
          <span style="font-size:18px;line-height:1;color:inherit;"><span leaf="">看</span></span>
        </section>
        <span style="font-size:10px;font-weight:600;"><span leaf="">在看</span></span>
      </section>
      <section style="text-align:center;color:#059669;">
        <section style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;background:#F0FDF4;border:2px solid #059669;">
          <span style="font-size:18px;line-height:1;color:inherit;"><span leaf="">★</span></span>
        </section>
        <span style="font-size:10px;font-weight:600;"><span leaf="">星标</span></span>
      </section>
    </section>
    <section style="border-top:1px dashed #ccc;padding-top:12px;">
      <p style="font-size:10px;color:#999;letter-spacing:2px;margin:0;">
        <span leaf="">THANKS FOR READING ✂</span>
      </p>
    </section>
  </section>
</section>
```

---

## 组件 14 结束符 end-mark

**用途**：文章最末尾收尾，放在外层容器（组件 1）内最后；若加入 footer-cta，则放在其后，无互动区时直接收尾。

```html
<p style="text-align:center;color:#D1D5DB;font-size:14px;margin:24px 0 0 0;">
  <span leaf="">/</span>
</p>
```

---

## 组件 15 隐藏标记 hidden-mark

**用途**：微信编辑器兼容标记，放在外层容器（组件 1）**之外**，是整篇产物的最后一个元素。

```html
<p style="display:none;">
  <mp-style-type data-value="3"></mp-style-type>
</p>
```

---

## 多行代码块 → 用通用增量库

本主题不设专属多行代码块组件；Markdown 的三反引号围栏代码块直接用 `common-components.md` 的 1a 深色代码块（默认）或 1b 浅色代码块，左竖条/强调色换成本主题主色 `#059669`；行内代码用本主题组件 6d。

---

## 完整文章模板骨架

```html
<section style="max-width:677px;margin:0 auto;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:#374151;line-height:1.75;letter-spacing:0.5px;">

  <!-- 1. 可选票据封面（组件2 ticket-cover；用原文标题，不自动新增营销文案；评分/等级无来源时删去） -->

  <!-- 2. 第一章（组件3 chapter-title） -->
  <!--    章内：组件5 正文 + 组件6 行内强调 + 组件7 Case标题 + 组件8 图片 + 组件9 结论卡片 + 组件4 小节标题 + 组件10 编号特点列表（多项） -->

  <!-- 3. 第二章…第N章（组件3，同上结构） -->

  <!-- 4. 可选核心观点卡片（组件11；只放原文已有的完整句/数据或用户指定文字，无内容来源时省略） -->

  <!-- 5. 标签组（组件12，可选，全文话题标签汇总） -->

  <!-- 6. 可选署名段落（组件5；仅原文已有或用户明确要求时加入） -->

  <!-- 7. 可选结尾互动区（组件13 footer-cta；仅原文已有或用户明确要求时加入） -->

  <!-- 8. 结束符（组件14 end-mark） -->

</section>

<!-- 9. 隐藏标记（组件15 hidden-mark，外层容器之外，全文最后一个元素） -->
```

**骨架铁律**：本主题**不设目录/导航组件**——票据风强调"一张凭证从头看到尾"的阅读仪式，不做分段跳读；组件 15 隐藏标记必须在组件 1 全局容器闭合**之后**，是整篇产物真正的最后一个元素。

---

## 视觉层级（3 层递进）

| 层级 | 样式 | 用途 | 频率 |
|------|------|------|------|
| **锚点层** | 硬阴影卡片（票据封面 2 / 核心观点卡片 11）、绿色加粗 6a | 封面信息、全文金句、产品名 | 新增锚点默认全文 ≤5 处；原文已有强调照语义保留且不计入新增配额 |
| **标记层** | 绿色下划线 6c（对应原文或按需新增的下划线）、绿色高亮 6b | 正文关键词强调 | 按需，可为 0 处；不按段配额添加 |
| **容器层** | 结论卡片 9、编号特点列表 10、标签组 12 | 小结、清单、话题标签 | 按需 |

**克制原则**：
- 硬阴影卡片（`box-shadow` 无虚化偏移）是本主题最强锚点，全文不超过 3 处；封面和核心观点卡片是推荐承载位置，结尾互动区仅在有来源或用户要求时加入。正文中段仅在内容确有需要时使用。
- 新增绿色高亮默认每段 1-2 处、同段不超过 2 种；原文标记照常保留且不计入新增配额
- 品牌紫色 6e 只用于 AI 品牌专名，不用于普通强调

---

## 文章类型 → 组件组合配方

按 SKILL.md 第 3 步判定的文章类型选配方；核心组件构成本篇的排版主旋律，点缀组件按内容出现处使用，一篇文章点缀组件种类 ≤3。

| 文章类型 | 核心组件组合 | 点缀组件 |
|---|---|---|
| 教程/操作指南 | 编号特点列表 10（步骤化）+ Case 标题 7 + 结论卡片 9 | 图片容器 8、代码标签 6d |
| 盘点/工具清单 | 标签组 12 + 编号特点列表 10 + 核心观点卡片 11 | 图片容器 8、结论卡片 9 |
| 观点/深度分析 | 正文段落 5 + 结论卡片 9 + 核心观点卡片 11 | 小节标题 4、绿色高亮 6b |
| 访谈/人物特稿 | 正文段落 5 + Case 标题 7（人物/场景切分）+ 结论卡片 9 | 核心观点卡片 11（引语金句） |
| 数据复盘/报告 | 核心观点卡片 11（大数字）+ 编号特点列表 10 + 结论卡片 9 | 代码标签 6d（术语/指标名） |
| 生活/情感随笔 | 正文段落 5 + 核心观点卡片 11（无大数字版）+ 结论卡片 9（少量） | 小节标题 4 |
| 案例实战 | Case 标题 7 + 图片容器 8 + 结论卡片 9 + 编号特点列表 10 | 核心观点卡片 11 |

所有类型共用章节标题 3 + 结束符 14 + 隐藏标记 15；有来源标题时可使用票据封面 2。核心观点卡片 11 仅承载原文现有句子/数据或用户指定文字。原文已有或用户明确要求时，才在结尾加入署名段落、互动区 13；两者分别判断，不互相推定。

---

## Markdown → 摸鱼票据风 映射规则

| Markdown 元素 | 对应组件 | 说明 |
|---|---|---|
| `# 标题` | 票据封面可沿用原题 | 保留原标题；仅用户明确授权时改写或另拟封面文案 |
| 文章开头 `> 引言` | 并入封面简介段落 | 票据封面无独立引言卡组件 |
| `## 章节标题` | 组件 3 chapter-title | 编号 01/02/03… |
| `### 子标题` | 组件 4 subtitle | 左竖条小标题 |
| 普通段落 | 组件 5 paragraph | 保留原文标记；确有排版需要时按主入口规则新增，允许 0 处 |
| `**加粗文字**` | 组件 6a 绿色加粗 | 产品名/工具名 |
| `==高亮文字==` | 组件 6b 绿色高亮 | 核心观点/关键数据，新增高亮每段默认 ≤2 处；原文标记照常保留且不计入新增配额 |
| `<u>下划线</u>` / `++文字++` | 组件 6c 绿色下划线 | 映射原文标记；新增时按需选择 |
| AI 品牌名（Claude/Obsidian/Gemini 等） | 组件 6e 品牌紫色 | 不与 6a 混用 |
| 案例/示例小标题 | 组件 7 case-title | case01/02… |
| `![](图片)` | 组件 8 image-ticket | `src`/`data-src` 原样保留，不改写 |
| 章节小结/观点 | 组件 9 conclusion-card | |
| 特点/步骤/清单 | 组件 10 numbered-feature-list | 每项一张卡片 |
| 原文已有完整句/关键数据 | 组件 11 key-point-card | 原文照用；无可承载内容时省略 |
| `> 引用段落`（非开头） | 组件 9 conclusion-card 或并入正文 | 本主题无独立引用块组件 |
| `#话题` 标签 | 组件 12 tag-group | |
| 行内 `` `code` `` / 技术名词/模型名 | 组件 6d 代码标签 | |
| ` ``` 多行代码块 ``` ` | 通用库 1a 深色（默认）/ 1b 浅色 | 左竖条换本主题主色 `#059669` |
| 文末 | 组件 13 footer-cta（可选）+ 14 end-mark | 仅原文已有/用户要求时保留对应署名或 CTA |
