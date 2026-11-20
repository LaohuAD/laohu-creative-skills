# 来源与使用权

这个目录保存用于本地参考的 OpenMotion 资料。复用画面、声音、品牌标识或字体前，按目录里各条的 **原始声明** 和素材自己的许可核对使用范围。

## 287 条动效参考

- 源文件固定在 OpenMotion 提交 `d10c1c9985ec874625818a9628d06a111a8feae8`。条目身份和原始来源见每条的 `template.json`、`TEMPLATE.md` 和 `source/manifest.json`。[上游条目目录](https://github.com/nexu-io/openmotion/tree/d10c1c9985ec874625818a9628d06a111a8feae8/library/templates/catalog)
- 托管目录快照 `79be5088ba57a053bd956af277acb2550039db11` 含同一批 287 个条目。名称、简述和分类标签使用中文发布 `0.1.0-taxonomy.20261112` 的 286 项元数据。第 287 项 Orbit Launch 使用 [本地中文译本](templates/motion-orbit-launch/motion.zh-CN.md) 和原仓库演示。12 个视觉分类是本地检索用的编辑分类。
- [OpenMotion 项目许可证](LICENSE) 为 Apache-2.0。Orbit Launch 的原创几何和实现采用该许可。第三方原片、商标、截图、录音与字体仍适用各自条款。9 条带上游工程文件，工程文件本身也可能引用原片音轨或素材。
- `source/preview.html` 保留上游原样。108 条另有 `source/preview.offline.html`，把 CDN 图片地址换为相同的本地 WebP。原始 JPEG 按文件哈希定位到本地展开源。上游清单和页面中的来源链接指向原发布者，打开外链需要网络。
- 286 个官方说明归档的成员经逐项校验后已展开并去重。按条目 ID 可查成员原路径、SHA-256、对应本地文件和上游归档地址。四个含上游工作路径的旧文件在本机非发布缓存保留原字节，库内采用上游净化版本。[来源成员清单](source-members.json)
- Orbit Launch 由本地 Git 源文件、中文译本和 WebM 构成。九条带工程文件的条目可直接查阅源码和依赖，八条另载独立在线工程包地址。工程的编辑和导出以采用时的工具实测为准。

目录中的 `preview` 是本地播放路径，较小的源片可直接使用；压缩版本保留原比例、帧数及原 AAC 音轨。上游视频的 SHA-256 与地址保留在 `originalPreview`，Orbit Launch 随库提供。六帧图从原片生成，按 `sampleTimesSeconds` 从左至右、从上至下读取。

## 六组 Hyperframes 原作与改编

HeyGen Hyperframes 源码固定在 `070b964d7b8cd844a893f0abbe8e0b7f1ac6d879`。每组保留原作视频、上游发布的 OpenMotion 原文案与新文案并排对照、可编辑的例子源码和替换配置。对照 MP4 选取同一时段，画面为无声演示。

[来源和文件清单](remix/sources.json) · [原始声明](remix/NOTICE.md) · [源码许可](remix/LICENSE) · [脚本和字体许可](remix/vendor/NOTICE.md)

改编自己的文案时，可用 `remix/scripts/materialize.mjs` 把源码、预设和本地依赖复制到新的工作目录。相应示例需要浏览器或 Hyperframes，部分依赖 WebGL。

## 其他本地工程

### Presenter Tech

MotionGit / adunext 的 Kinetic Tech 英文公开版固定在 `9dfbe7d7c6a6d4aa03f6f8e2f2285e631099faae`。本地演示是同版公开演示的完整横版 MP4，文件哈希与上游宣传页清单中的原片一致。OpenMotion 的宣传页使用其中从第 6 秒开始的选段。[本地演示](extras/presenter-tech/preview.mp4) · [本地演示来源记录](extras/presenter-tech/media-source.json) · [上游宣传页清单](https://github.com/nexu-io/openmotion/blob/d10c1c9985ec874625818a9628d06a111a8feae8/docs/readme/people/manifest.json)

源码及纹理由 MIT 许可覆盖。工程目录包含专用运行器、字体、标记及各自声明。[展开的 Presenter Tech 工程](extras/presenter-tech/project/) · [上游版本与归档身份](extras/presenter-tech/source.json) · [归属与许可](extras/presenter-tech/NOTICE.md) · [第三方声明](extras/presenter-tech/THIRD-PARTY-NOTICES.md)

### Studio 内置实例

Product Promo、NYT Graph 和 Decision Tree 保留各自的依赖许可，OpenMotion Welcome 的专用声明包含源片背景和音轨归属。Welcome 的字体、品牌标记、Three.js 和 GSAP 随工程素材保留对应声明。[Studio 内置实例](index.html#extras) · [Hyperframes 示例声明](extras/studio-examples/NOTICE.md) · [OpenMotion Welcome 声明](extras/studio-examples/openmotion-welcome/NOTICE.md)

本地目录访问使用相对路径。场景改编请另存工作副本。在库根运行 `shasum -a 256 -c SHA256SUMS` 可核对文件完整性。
