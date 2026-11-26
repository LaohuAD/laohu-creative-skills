# 原生表现辅助器

本目录提供 Motion 实际调用的双语字幕 renderer 和绑定时间线事件的章节导航 helper。

## 双语字幕轨道

在 Brief 的 `<inputs>` 按[字幕源声明](../../../references/typography-and-legibility.md#原生双语讲解字幕)登记 `caption-manifest/2` 或 SRT。脚手架及 `text-inputs <project>` 生成项目内只读 `.cache/brief-text-map.json`、consumer 和原生字幕模块。在场景里按当前工程画幅挂载字幕容器，使用同一组编译数据创建字幕轨。

```js
import {createBriefTextRuntime} from './.cache/brief-text-contract.mjs';
import {createNativeCaptionTrack} from './.cache/native-caption-runtime.mjs';

const query = new URLSearchParams(location.search);
const map = await fetch('./.cache/brief-text-map.json').then(response => response.json());
const screenText = window.__laohuBriefText ?? createBriefTextRuntime(map, {
  allowCaptionCalibration: query.get('laohuCaptionCalibration') === '1',
});
const track = await createNativeCaptionTrack({
  element: captionOverlayElement,
  width, height,
  ...screenText.captionInput(selectedDirection, {
    profileId: query.get('laohuCaptionProfile') ?? 'native-16x9-standard',
  }),
});
// 从场景统一的 render(t) 调用，字幕与画面共享绝对秒。
track.render(timeSeconds);
```

字幕逐 cue、逐语言核对精确原文和显示区间，在实际 DOM 行写入后记录消费。源或译文过期、Brief 哈希不符、方向/画面/对象/时间错配、profile 未锁、画幅不符、超出固定行数、字体未加载或超出安全区域都会阻止轨道。旧项目沿用显式 `<screen-text-registry>` 字幕行时，继续把当前 ASRcut `/2` 绑定和登记上下文传给同一 helper。

```js
import {createNativeCaptionTrack} from './captions.mjs';

const expectedBinding = {
  projectId: plan.project.id,
  revision: plan.project.revision,
  planSha256,
  timelineSha256,
  manifestSha256: captionManifest.integrity.manifestSha256,
};
const textRuntime = window.__laohuBriefText; // 由受管 Motion wrapper 按当前 brief.md 编译并注入
const track = await createNativeCaptionTrack({
  element: captionOverlayElement,
  manifest: captionManifest,
  expectedBinding,
  width: 1920,
  height: 1080,
  profileId: 'native-16x9-standard',
  textRuntime,
  expectedBriefSha256: textRuntime.briefSha256,
  captionContext: ({cue, language}) => ({
    direction: selectedDirection,
    scene: sceneForCaption(cue),
    object: language === 'zh-CN' ? '中文字幕行' : '英文字幕行',
  }),
});

// 每帧都从同一个确定性播放器／渲染时钟调用。
track.render(timeSeconds);
```

宿主元素的 CSS 布局尺寸必须与声明的逻辑输出尺寸相同。先挂载宿主元素，再创建轨道。helper 会加载随包分发且带许可的思源黑体 CN Bold 字体，等待 `document.fonts.ready`，确认目标字体已加载，然后测量所有 cue 后才返回。溢出会作为错误返回，提示重新分组语义、翻译或构图；renderer 不会静默缩小字体。

Profile 真源是 helper 中共享的 `CAPTION_PROFILE_CATALOG`。工程通过 `profileId` 使用已有项。正式 16:9 profile `native-16x9-standard` 使用 Source Han Sans CN VF 700，中文 48px、英文为 0.7 倍，白字、黑描边 3.25px（英文 2.275px），黑色阴影 75% 不透明度、-45°、偏移 5px、模糊 7px。行高为 1.08，行间距为 2.5px，每种语言固定一行，水平安全区为画宽的 6%，字幕占用区域为画面下方 28%，无底板。以上长度以 1920×1080 为基准，按相同画幅比例换算。三个描边校准候选仍为 2.5 / 1.75、3.0 / 2.1、3.25 / 2.275px（中文 / 英文）。9:16 的 profile 等待独立校准。

正式 16:9 profile 的底部配置边距为画高的 1.95%，helper 再加固定的描边与阴影预留。在目标分辨率上使用真实 `render(t)` 帧检查视觉间距，从英文墨迹或清晰描边的最低一行像素量到画幅底边。可另截同一帧的透明字幕层，临时关掉阴影，用不透明度至少 50% 的像素确定描边边界，同时用保留阴影的合成帧检查外扩与裁切。抽查有无 `g`、`p`、`q`、`y` 等下伸字母的句子，核对共用的组锚点、基线和中英间距。

每个 profile 绑定画幅比例，并固定字体、字重、字号关系、颜色、描边、阴影、行距、锚点、安全区与各语言允许行数。正式调用不能再传 `style` 覆盖，只接受同画幅的比例缩放。profile 的 mode 为 `locked` 才能用于普通 render/build。`calibration-candidate` 只在受管 wrapper 为明确技术 `probe` 或 `--draft-probe` 注入校准许可时运行；报告会带出 ID、mode、profile 真源 hash、行数限制和实际 style 值，wrapper 会与共享目录复核。正式 build 与普通 render 不接受校准许可。

helper 按每种语言创建固定行数和高度的字幕槽位，cue 变化不改变字幕组高度、锚点或基线。采用 `native-16x9-standard` 后，工程不能随内容移动、改色、缩小字幕或临时加底板；主画面应避开固定字幕区域。标题、标签、解释文字等其他屏显文字继续按 Brief 和其视觉来源设计，不使用此字幕 profile。

未接入 screen-text contract 的既有工程仍可用原来的 `style` 参数，兼容其用户锁定样式。工程接入 Brief contract 后，profile 必须随之启用；不能以 legacy 覆盖入口绕过登记和固定字幕样式。

SRT 是仅包含时间与文字的交换格式，不携带字体样式。Motion 的原生字幕 consumer 应把 manifest 与本 helper 一起使用，才能消费固定表现样式。

## 章节索引与真实 seek

`chapters.mjs` 从当前时间线事件推导章节时间。章节 metadata 保存事件 ID，不另写自由时码。metadata binding、当前 timeline adapter binding 和 `expectedBinding` 必须在项目、revision、plan hash 与 timeline hash 上一致。

```js
import {buildChapterIndex} from './chapters.mjs';

const expectedBinding = {projectId, revision, planSha256, timelineSha256};
const chapterIndex = buildChapterIndex({
  timeline: {durationSeconds, events: currentEvents, binding: expectedBinding},
  chapters: chapterMetadata.chapters,
  binding: chapterMetadata.binding,
  expectedBinding,
  seek: (seconds) => { video.currentTime = seconds; },
});

const currentChapter = chapterIndex.at(video.currentTime);
chapterIndex.jumpTo('chapter-id'); // 使用绑定到事件的时码调用真实 seek
```

每个事件由当前 timeline adapter 提供绝对秒制 `{id,t0,t1}`。每个章节为 `{id,title,startEventId,endEventId,description?}`；开始时刻取起始事件的 `t0`，结束时刻取结束事件的 `t1`。章节范围必须按时间排列且不能重叠。`jumpTo` 会返回索引中的章节，并调用传入的实际 `seek` 回调。

## 本地检查

在仓库根目录运行以下命令，检查绑定、过期版本、事件索引和 seek hook：

```sh
node .agents/skills/laohu-motion/templates/runtime/native-presentation/native-presentation.test.mjs
```

该脚本覆盖 profile hash、画幅比例、候选/锁定状态、覆盖拒绝和旧 helper 接口保留；它不能替代真实 DOM 渲染与代表性动态背景的阅读检查。受控调用报告也只说明 registered cue 在 render(t) 采样时进入 live DOM consumer，不表示全帧 OCR 或观众质量结论。
