# Motion Vocabulary 资源来源与适配说明

- 来源项目：Motion Prompt（Shohei Ohtaki），MIT License，版权通知见本目录 `LICENSE`。
- 固定来源提交：`683ecca0548a1754ada141d10dc3a009d4c59bef`。
- 资源范围：10 个 pack，共 240 个 element 与对应共享 kit；每包源码置于独立 `.mjs` 模块作用域。
- 适配：保留源 kit 与 element 逻辑；通过 `core.mjs` 暴露 `createElement(number)`，返回确定性 `draw(ctx,w,h,t,timing)`。局部时钟使用秒；默认按源 cycle 循环；`once`、`hold`、`hold-exit` 显式映射源时间。画面按源宽高等比 contain，绝不把源画幅拉伸。
- 运行环境：使用 Canvas 2D context；有些 pack 在模块初始化时创建离屏 Canvas，需要浏览器或带 Canvas API 的环境。模块加载/源码存在不代表字体、输出画面或接收效果已验收。
- 上游示例可能含固定背景、颜色、文案或字体。替换前逐项检查源 element；不同 pack 不共享变量/缓存。
- artstyle 图片：源包说明写明 27 张图由作者生成，源 kit 注释注明以 MIT 发布；上游第三方通知仅排除第三方图片。图片与代码一并附上 MIT 通知，来源提交及数量记录在索引中。
- artstyle 运行：本目录 `assets/artstyle/` 随包保存作者提供的 27 张 WebP。浏览器使用本地 URL，渲染前等待模块导出的 `ready`；Node 无 `Image` 时只保留无图占位。
