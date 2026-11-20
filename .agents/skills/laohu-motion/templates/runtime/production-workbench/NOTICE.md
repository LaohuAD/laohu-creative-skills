# 制作工作台来源

老胡制作工作台采用 OpenMotion Studio 的下置多轨交互。共用秒尺和间距选择参考 nexu-io/openmotion 的 commit `d10c1c9985ec874625818a9628d06a111a8feae8`，主要参考 `studio/src/components/nle/TimelinePane.tsx` 和 `studio/src/player/components/timelineRulerGeometry.ts`。时间尺间距在 `client.js` 中改用本地工程秒数和窗口宽度，随附原 [Apache 2.0 许可](LICENSE.openmotion)。

本地工作台使用 Showreel 工程的 `render(t)`、时钟、媒体和发布回执。旧工作台、已发布的内容和波形读取沿用 [Showreel 运行闭包](../laohu-showreel/source-lock.json) 的实际模块，原闭包保有自己的许可。
