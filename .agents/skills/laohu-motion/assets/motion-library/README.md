# 动效目录

找动作时，从希望观众看到的变化入手。例如想让观众看到资金流向，可以先查「分支、连线、流向」；想让上一镜的小孔变成下一镜的空间，可以查「透视、推进、通道」。同一查询可以比较新旧来源。

## 浏览和查询

在项目根目录运行以下命令。第一条展示来源、分类、条数和说明；第二条在官方库中查某类动作；最后一条取得指定条目。正式设计通过 Motion 的 `input-candidate` 读取采用项。

```sh
node .agents/skills/laohu-motion/scripts/laohu-showreel.mjs resource-overview --scope motion-library
node .agents/skills/laohu-motion/scripts/laohu-showreel.mjs resource-search --source openmotion --category 流程与关系图解
node .agents/skills/laohu-motion/scripts/laohu-showreel.mjs resource-get --id motion-prompt:diagram:219
```

|要找什么|查哪个来源|点开后能做什么|
|---|---|---|
|有原片可比的镜头、转场与空间运动|OpenMotion|本地浏览器打开同目录的 `openmotion/index.html`。先按中文指南比较候选。调用条目详情可取带时间码的六帧图，判断构图和跨段变化；路径、弹性、停顿和声画落点用视频验证，细字和工艺细节按原片或源码核对。|
|某种动作叫什么、图解怎样随时间呈现|Motion Prompt|读动作阶段和可见变化，有实现的可进一步取源码。|
|字幕、章节和其他画面呈现|Overlay|比较呈现用途，核对哪些能力已有原生消费者。|
|变形、出入场、跟踪、镜头和标注|Showreel 原配方、既有局部动效、旧 Remotion|按动作机制查原配方，进入实现前核对运行时、依赖和可调范围。|
|颜色、形状、材质和排版|Atlas 知识、原文字风格目录|找到视觉方向和可融合的属性，再把它们落实到本片动作。|
|局部实现所依赖的工具|动效支撑库|按已选方案查具体能力和调用条件。|

各类来源的实际条数由查询命令从当前数据生成。收录用户单独认可的样片及拆解时，从 Motion 入口旁的 `benchmark/` 检索。正式制作的读取和交接见[运行说明](../../references/showreel-runtime.md)。
