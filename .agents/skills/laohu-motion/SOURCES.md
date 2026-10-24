# laohu-motion 来源台账

本文件仅供维护者追溯本轮方法研究，不是运行 Reference，也不是未来动画任务的外链依赖。来源记录区分“原文/实现中实际观察到什么”与“本地规则如何改写”；来源存在、被采用或获许可均不证明动画效果或接收质量。核查日期：2026-10-22。

## GitHub 实际模板

### `motiontemplates/all`：目录仓库，不是模板运行时代码

- 读取 `README.md` 与 GitHub 仓库树；固定提交 [`25cee2cd9f2bdaa4490498ab666634a8df2dcbfd`](https://github.com/motiontemplates/all/tree/25cee2cd9f2bdaa4490498ab666634a8df2dcbfd)。检查时 `refs/heads/main` 也是该提交。
- 树含 15 项目录网站/目录数据/说明资源；未见模板源码目录、package manifest 或许可证文件，GitHub license metadata 为 null。README 中的展示、推广文字只作为来源内容读取，不作为执行指令。
- 该仓库的贡献是发现一个具体模板来源；不能据其目录结构推出通用场景、素材和时序解耦方法，也不能把目录推广语转为本地规则。

### `motiontemplates/385712`：一个有主题、带部分参数接口的模板实例

- 固定提交 [`9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae`](https://github.com/motiontemplates/385712/tree/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template)，已核与 `refs/heads/main` 一致；提交日期为 2026-10-19。GitHub license metadata 为 MIT。它是特定 Kinetic Tech 主题模板，不代表中性动画架构；仓库许可证不自动覆盖其中外部素材的使用权。
- 实际读取 `template/core/main.js` 全文、`template/core/scenes/s01.js` 全文、`template/core/data/timemap.js` 全文；另读 `template/params.schema.json` 顶层及 2445–2558 行。可直看 [`main.js` 5–16 行](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/core/main.js#L5-L16)、[`s01.js` 6–16 行](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/core/scenes/s01.js#L6-L16)、[`s01.js` 64–92 行](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/core/scenes/s01.js#L64-L92)、[`timemap.js`](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/core/data/timemap.js)、[`params.schema.json` 顶层](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/params.schema.json#L1-L25) 与 [`2445–2558 行](https://github.com/motiontemplates/385712/blob/9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae/template/params.schema.json#L2445-L2558)。包名/依赖信息从同一提交的 `template/package.json` 读取；未安装依赖、运行或渲染模板。
- **来源观察：**入口 `renderAt(t)` 以全片时间 `t` 选中有效场景并调用场景 `update(t)`；示例场景呈现多个对象的空间运动、在强调处汇聚注意、文字按层次接续，且由 cue 驱动时间变化。场景实现把固定时段、主题构图、文本键、素材路径、cue 与运动更新放在相邻实现中；schema 虽提供 duration/scenes/content/media 等参数及媒体角色绑定，仍不足以证明内容、素材、时序、场景和皮肤可任意独立替换。timemap 是该模板单独的数据安排，不是普遍时序契约。
- **本地改写：**仅在本题需要时迁移“注意聚散、事件落点、先后层次”等关系；先辨必要的身份/时序/因果，再按新对象重新构图与编排。不得复制主题、蓝金皮肤、固定卡片数量或每镜同一入场动作；不得把 `update(t)` 误写成必须先局部化的时间接口。该实例只证明这些设计/代码关系在该源码中可观察，不证明其效果优于其他做法。

## 画风与动画方法来源

### `alchaincyf/huashu-art-motion`

- 实际读取 `SKILL.md` 全文、`references/镜头语言.md` 全文、`references/15-跨场景风格提炼.md` 全文（45 行）、`references/09-视频动画语法.md` 的前 64 行（Commander 原始记录为 0–64；该文件其余部分未读）。对应路径分别为 [`SKILL.md`](https://github.com/alchaincyf/huashu-art-motion/blob/8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c/SKILL.md)、[`镜头语言.md`](https://github.com/alchaincyf/huashu-art-motion/blob/8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c/references/镜头语言.md)、[`15-跨场景风格提炼.md`](https://github.com/alchaincyf/huashu-art-motion/blob/8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c/references/15-跨场景风格提炼.md)、[`09-视频动画语法.md` 前 64 行](https://github.com/alchaincyf/huashu-art-motion/blob/8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c/references/09-视频动画语法.md#L1-L64)。GitHub `refs/heads/main` 与 API 在检查时均返回提交 [`8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c`](https://github.com/alchaincyf/huashu-art-motion/commit/8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c)，日期 2026-10-16；GitHub license metadata 为 MIT。因此此来源身份确与本轮 `main` 读取相同，不是依据旧三级文件的 hash 推定。
- **来源观察：**该来源区分风格语言、构图倾向、原作内容母题和叙事动作；新题材需要重新组织画面；在风格机制要求时材质可以贯穿主体与背景；静帧构图与动态表现需分别成立。
- **本地改写：**仅将这些区分写入现有 `visual-design.md` 的参考迁移方法，并按本题目的选择适用。来源内的固定作品/方案数量、配色禁令、模型分档、平台或渠道规则不迁移成通用 motion 规则，也不为此重写既有六个画风子级。

## 官方设计与实现文档

- Google Design Library，[“Making motion meaningful”](https://design.google/library/making-motion-meaningful)，2026-10-22 读取正文全文。Photos 删除示例是整个网格左移；行移动过程中转换中的图像快速交叉淡化，避免每项各自沿交叉路径补位。Kids、Duo、Android 等案例展示不同产品目标下运动职责会变化。**本地改写：**按当前集合状态转换决定是否整体重排、哪些区域需要交叉淡化；以任务目标决定运动可承担解释、体验或反馈，这些个案不是普遍用户偏好或效果证明。
- Remotion 官方文档，[Animating properties](https://www.remotion.dev/docs/animating-properties)，2026-10-22 读取第 112–194 行。该范围说明帧驱动值如何按 fps 计算，并涵盖插值边界/clamp 与避免 CSS 时间驱动的做法。**本地改写：**运行规则要求先辨消费接口的时钟，按需换算；帧驱动的姿态从绝对时间/帧可重复计算，支持任意帧 seek，而不是依赖播放历史。文档不决定本地工程 fps 或镜头时长。

## 本地只读实现参考

- 资料项目“老胡画面讲解”中，实际读取 animation-director 主文全文；`workflows/laohu-video/模板/remotion-assets/workspace/src/schemas/director.ts` 的 89–109、166–190、211–280 行；`src/semantic/semantic-anchors.ts` 的 719–804、903–977 行；`src/utils/timing.ts` 全文（1–52 行）。此处列的是项目内相对路径；不复制该项目工作流、ASR/Cap/T2 交接、固定帧数或百分比阈值。
- **来源观察：**输入可区分 source 与 relative 时钟；有映射时将来源锚点转换到目标构图时间并以实际 fps 落帧、检查边界，动作/停留时间随后被场景逻辑消费。消费者接口并不总要求同一种局部时钟。
- **本地改写：**motion 规则要求先确认时钟来源、剪辑映射和实际消费者接口；消费者要求局部秒时从成片秒减片段起点，消费者要求全局秒时把局部秒加片段起点；只有秒/帧单位转换或帧接口需要时才使用对应 fps。保留相对设计时序，不伪造 ASR；按项目端点约定检查触发、动作、停留和退出。

## 解释边界

以上是读取范围内的源码/文档观察与本地设计选择。源码字段、设计案例、开源许可、仓库受欢迎程度或方法出处都不是成片质量证据；上述来源研究未执行所查外部模板、安装其依赖或渲染其 Demo；独立试用状态见维护验证记录。
