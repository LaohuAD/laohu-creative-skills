# ASR 剪后时间线审阅页契约

仅在处理 `laohu-asrcut` 交来的 `edit-plan` 与 `timeline` 审阅页（如 `review.html`）时读取；普通文章、报告、提示词或剧本展示页不加载本文件。

## 1. 唯一真相来源与时钟铁律

- `edit-plan` 保留编辑决定，`timeline` 保留唯一编译时钟。HTML 展示页只读取同版本 `timeline` 的 `units` / `clips`、`occurrence`、源/目标区间、词/句段精度、删除映射、待确认问题与版本信息。
- **严禁**在页面脚本里自行压缩静音、重排片段、改写原始口播或重算连续目标时间；也不把说明文字冒充成音画同步证据。
- 剪后顺序保留连续话语作为主阅读视图；需要核对时可展开查看源段、原始 ASR、删除线对照、删除理由与多来源时间，不把单个词拆成独立卡片，也不把每个词都当作动画触发点。
- 版本与哈希绑定：交接与反馈导出必须同时携带 `project id`、整型 `revision`、`planSha256` 与 `annotationSha256`（因为 Motion 注释层可在 `edit-plan` 冻结后独立更新）。旧版本反馈按对应哈希明确标为过期。

## 2. 注释分层与 Motion 绑定边界

若 `timeline.annotations[]` 存在，将每条注释关联到实际解析到的段落或词旁，并严格区分三个来源：

| 字段 | 含义 | 显示与隔离约束 |
|---|---|---|
| `userNote` | 用户备注 | 不得复制进 raw ASR、显示字幕或 spoken correction |
| `analysisNote` | 内容/观看解释 | 与原始口播与执行指令分开标识 |
| `motionDirection` | 导演/动画说明 | 说明文字本身不等于动画已执行 |

- 每条注释展示 `annotation.id`、实际 `source / segment / token / occurrence` 身份及 `resolvedTargets[].targetRange`，避免同词重复出现时串位。
- 当 `resolution=not-in-retained-timeline` 时，将注释留在源证据或删除对照区，绝不硬贴到邻近保留句上。
- 句段级精度时不虚构词级动画时间；只显示句段范围。
- **动画栏按真实消费显示**：仅当 `motionBinding` 存在真实 consumer、实际 `componentCalls / phases` 与同版本有效锚点时才展示动画栏；缺少真实绑定则直接省略，不留空栏制造已同步错觉。全视图沿用同一份 `annotations / timeline` 蓝图，不另造第二套低保真动画摘要。

## 3. 试听控件与反馈边界

- 原音区间试听与剪后拼接试听严格分开：前者只能播放真实 `source range`，绝不能标为剪后试听。
- 缺少真实可访问的剪后实体音频/视频时，禁用 join-preview 控件并明确说明缺少实体输出，不用 `timeline`、SRT 或静态波形图假装播放。
- 审阅反馈导出绑定当前 `timeline` 版本与哈希，仅作为待 Agent 复核的修改意见；HTML 按钮不直接应用剪切或重排、不改动 `timeline` 文件，也不冒充最终审批通过。
