# Atlas of Visual Effects：中文制作知识

> 本文件是按 Atlas 稳定 ID 定位的中文制作整理，保留每项实际可见效果、机制、使用条件与边界，不复制站点长文、prompt、画廊图或图片文件。原站页面内的图片、字体和例图许可各异；本仓库没有将其收入运行资产。
> Atlas 记录提供视觉知识，不代表当前仓库有对应可运行代码。拟采用项需要根据本片方法和实际工具接线；正式实现状态见 `effects/index.json` 与统一目录。
> 每条内容绑定来源 detail JSON 的快照 SHA-256，并链接 Atlas 条目。需要核对来源上下文或许可时再查来源记录；不把下载到本地当作公开再分发授权。
> **条件适用范围：** 源例图片、人物和场景用于解释效果机制，不是固定素材要求。只有声称呈现真实设备工艺、实测材料或算法运行结果时，相关真实输入与方法条件才是必要条件；只借用视觉外观或制作讲解示意，可按本片素材用人工/数字方式模拟，并标明为模拟或示意，不冒称真实测量、真实工艺或模型输出。

## atlas:1-bit-dithering · 1 位误差扩散抖色

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 只用纯黑、纯白，并把明暗差转成疏密不同的点阵；暗部点更密，轮廓呈像素阶梯。它用点的分布模拟灰阶，不是把像素放大。
**必要输入与条件：** 输入可为灰度或彩色图；先按亮度转成目标灰阶，再用误差扩散把舍入误差分给邻近像素，以黑白点疏密近似中间调。需要保留可读轮廓时，避免点密度吞没边缘。
**区别与边界：** 保留主体轮廓时仍会丢失连续灰阶；不要误标为印刷半调网。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/1-bit-dithering)；固定详情快照 `effects/1-bit-dithering.json`，SHA-256 `e7724d818faaa3068a863a4d53eba67f21f13c3bc19331283a34269c4ae990cb`。
**Atlas 所列参考：** [原始参考页面](https://computerhistory.org/blog/macpaint-and-quickdraw-source-code/)。

## atlas:1-bit-threshold · 1 位全局阈值

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 全图用同一个亮度门槛切成纯黑与纯白，形成大块阴影、硬边高光和简化细节；不保留灰阶或点阵过渡。
**必要输入与条件：** 输入图像可为灰度或彩色；按亮度阈值逐像素硬分为黑或白。若要呈现门槛的影响，可并列比较不同阈值；黑白阈值图是输出，不是先决输入。
**区别与边界：** 不能把局部自适应阈值或误差扩散抖色混为一谈。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/1-bit-threshold)；固定详情快照 `effects/1-bit-threshold.json`，SHA-256 `fda19a1d85bcb2edc9e1b8a7d1e7959f4f1770deb8ef96fa5b2876458f6a2fd7`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:2-5d-parallax · 2.5D 分层视差照片

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 前景、主体与背景图层或深度值按远近以不同速度偏移，形成有限视差；位移可能露出原图中被遮住的区域，需补全这些缺失信息。它不是可自由观看背面的完整三维对象。
**必要输入与条件：** 准备具有前后关系的图层或深度值，并对移动视角后会露出的遮挡区域进行补绘或估算。可以移动分层画面；移动幅度受可补信息约束，需检查新露出边缘是否连续、景深是否可信。
**区别与边界：** 视角移动会揭开原图没有的信息，补绘或估算区域可能露馅；位移越大越难保持可信。它不等同于完整三维重建，也不能提供未采集到的真实背面。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/2-5d-parallax)；固定详情快照 `effects/2-5d-parallax.json`，SHA-256 `70185bff1ff389e7b9bcf52e7231c22f0c728959d269de734adcc559a83f92d0`。
**Atlas 所列参考：** [原始参考页面](https://shihmengli.github.io/3D-Photo-Inpainting/)。

## atlas:360-panorama · 360° 球面全景

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 用等距柱状投影铺开展示空间，中央地平线保持水平，边缘与上下极区的形状逐渐拉伸；画面应体现环绕视野，而不是单纯横向加宽。
**必要输入与条件：** 需要全景或环视图像；接缝与光照需能闭合。
**区别与边界：** 顶部和底部变形属于球面投影特征，不要当成普通镜头畸变。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/360-panorama)；固定详情快照 `effects/360-panorama.json`，SHA-256 `c5a496789ae05e7b2a1e2ba687b4c22cad53f7765c0b84fba7a5f810c8e6124c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Capanna_Regina_Margherita_Spherical_Panorama.jpg)。

## atlas:3d-gaussian-splatting · 3D 高斯泼溅质感

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 主体保持写实，背景边缘出现半透明、彼此重叠的点状泼溅和云雾式深度过渡，呈现采集不确定的空间边界。
**必要输入与条件：** 若要真实可导航的高斯泼溅场景，需要多视角采集与相应重建；单张图只能做外观模拟。
**区别与边界：** 画面仿效不等于生成了可渲染的三维场景或重建数据。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/3d-gaussian-splatting)；固定详情快照 `effects/3d-gaussian-splatting.json`，SHA-256 `3a4cdc4785fca2715c11d3a0a15721057e60d9a79a9020fad4b15ef0adefc644`。
**Atlas 所列参考：** [原始参考页面](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)。

## atlas:active-contour-snake · 主动轮廓蛇形线

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 在主体外沿叠加一条闭合、平滑的轮廓线，并沿线标出控制点，让边界估计和迭代收敛过程变得可见。
**必要输入与条件：** 要演示真实主动轮廓计算，需主体边界清楚的图像、起始曲线并检查曲线如何随能量变化贴近边缘；注明曲线位置来自计算或人工标注。讲解图可手绘曲线并标为示意。
**区别与边界：** 装饰性描边不能冒充算法实际算出的轮廓。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/active-contour-snake)；固定详情快照 `effects/active-contour-snake.json`，SHA-256 `bdcf88683f2f815e8de0466fe5d9992ca21a01c7e5acf9a220637d95e13c4a1c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Architecture_in_Agra_(Unsplash).jpg)。

## atlas:adaptive-threshold · 局部自适应阈值

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 根据图像局部亮度而不是全图单一门槛，转换为黑白区域；阴影和亮部仍能保留细节，边缘呈清晰的不规则变化。
**必要输入与条件：** 适用于照明不均的单色阈值处理；需要明确局部窗口或统计方式。
**区别与边界：** 局部方法与全局阈值不同；来源未给定窗口参数时不虚构数值。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/adaptive-threshold)；固定详情快照 `effects/adaptive-threshold.json`，SHA-256 `2f030d52a04fa311ed634a59177cd3557094eb22445e52ec1545a37ad9ef8639`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:aerial-photography · 航空摄影质感

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 强调俯视几何、被压平的空间层次、远处雾霾和细密地表纹理；色调偏灰褐、反差克制，边缘略软。
**必要输入与条件：** 最好使用真实俯拍或航拍素材；视角和地形高度会改变比例与形状。
**区别与边界：** 航空照片不是地图，不能默认几何与测绘精度。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/aerial-photography)；固定详情快照 `effects/aerial-photography.json`，SHA-256 `67625cea4301cf2b78def153833eec07409c44da0926dac5799fc2581769773b`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Boston,_as_the_Eagle_and_the_Wild_Goose_See_It_-_DPLA_-_f038de20f279486a5dc8a64206171059.jpg)。

## atlas:affine-texture-warping · 仿射纹理扭曲

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 让后退平面的纹理在三角面片上出现拉伸和斜切，纹理尺度不一、线条折断，顶点有整像素级偏移，呈现早期多边形贴图的不稳定感。
**必要输入与条件：** 需要纹理平面、可见透视和清楚的多边形分区。
**区别与边界：** 与透视校正贴图相反，它刻意保留仿射拉伸；不要误称为真实透视纹理。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/affine-texture-warping)；固定详情快照 `effects/affine-texture-warping.json`，SHA-256 `e3a6fb4991934851a049481a28e623fa2fc86b2761dd540561597ff52308517c`。

## atlas:airbrush-illustration · 喷枪插画

**视觉家族：** 插画媒材与笔触（`atlas-family:illustration-material`）。
**可见效果与关键机制：** 用喷涂渐变、圆润理想化形体、抛光高光和绒面阴影塑造插画，同时保留清楚遮罩边缘、微小飞漆点与平滑表面。
**必要输入与条件：** 适合需要插画化而非照片写实的主体；喷涂渐变与硬轮廓要并存。
**区别与边界：** 与笔刷涂抹不同，喷枪的颗粒来自喷射颜料；避免把整图柔焦当作喷枪。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/airbrush-illustration)；固定详情快照 `effects/airbrush-illustration.json`，SHA-256 `3ebe5558038d786f83a7681d22d36a5068a2ff61b3e3d7825689ea9a007f4b67`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:F1_fireman_helmet.jpg)。

## atlas:albums-print · 蛋白印相

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 暖褐与蜂蜜色调落在奶油色纸面上，细节清晰、表层略带光泽，边缘可轻微褪色，颗粒不宜粗重。
**必要输入与条件：** 适合将照片处理成早期蛋白印相的纸基质感。
**区别与边界：** 暖色本身不能证明化学工艺；屏幕复现只能表现其外观。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/albums-print)；固定详情快照 `effects/albums-print.json`，SHA-256 `23d5126af80aa736060d350b8c6de7dee27115440993362dc7e0fb71255a1285`。
**Atlas 所列参考：** [原始参考页面](https://www.getty.edu/conservation/publications_resources/pdf_publications/pdf/atlas_albumen.pdf)。

## atlas:aliasing-jaggies · 锯齿与混叠

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 以粗像素网格显示阶梯状轮廓和块状斜线，细线断成不均匀短段，密集纹理可出现假重复图案。
**必要输入与条件：** 需要保留明显像素边缘，不启用平滑或额外颗粒。
**区别与边界：** 这不是一般低分辨率像素化的同义词；关键是采样混叠与锯齿。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/aliasing-jaggies)；固定详情快照 `effects/aliasing-jaggies.json`，SHA-256 `c86a09ad56858e33cb5d8498b31588c69d2a51985bc192001bb2a20d27086977`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Road_dust_under_setting_sun_(Unsplash).jpg)。

## atlas:alpha-matte · Alpha 透明度遮罩

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 以白色表示不透明前景、黑色表示透明背景、灰色表示半透明边缘，重点保留发丝、纤维与透光细节。
**必要输入与条件：** 若要真实抠像合成，需连续灰度 alpha 遮罩或可信的前景透明度估计，以保留柔软、半透明边缘。本条源例是原理示意，也可手绘渐变遮罩展示，并标明不是神经推理结果。
**区别与边界：** 黑白可视化遮罩不等同于已经合成好的透明素材。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/alpha-matte)；固定详情快照 `effects/alpha-matte.json`，SHA-256 `09050e0227b5f5353d1aea739d4cd150ca99e92a1bf7a162b2a6dc348dbc572b`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:ambient-occlusion · 环境遮蔽阴影

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 在凹槽、接触点、窄缝与相贴表面周围产生柔和局部暗部，以中性接触阴影加强体积和落地感。
**必要输入与条件：** 需有表面深度或可信的接触关系；阴影从局部向外平滑衰减。
**区别与边界：** 这是环境光可见度近似，不是完整全局照明；强度过大会形成脏边和黑晕。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/ambient-occlusion)；固定详情快照 `effects/ambient-occlusion.json`，SHA-256 `d8f38be2593841701e9d9f798f3f905d8068eb1192eabd2c80574ed063fdb5b4`。
**Atlas 所列参考：** [原始参考页面](https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-17-ambient-occlusion)。

## atlas:ambrotype · 湿版玻璃正片

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 把影像呈现为玻璃上的银灰正像，以深黑背衬显出浅色影调，带轻微表面反光、涂布边缘与细小划痕。
**必要输入与条件：** 深色背衬是正片观感成立的关键。
**区别与边界：** 普通正片扫描不会自然呈现玻璃背衬效果；屏幕处理只能模拟外观。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/ambrotype)；固定详情快照 `effects/ambrotype.json`，SHA-256 `1fb8edac5afb18bb44d1a73a3843fb84125c2e0300b68386ac86a562ad7bc86e`。
**Atlas 所列参考：** [原始参考页面](https://www.loc.gov/exhibits/civil-war-photographs/the-photographic-process.html)。

## atlas:anaglyph-stereo · 红青立体影像

**视觉家族：** 立体视觉与多视角（`atlas-family:stereoscopic-space`）。
**可见效果与关键机制：** 红色与青色视图略作水平错位，按深度改变分离量，近处轮廓出现可辨的重影；远处视图尽量对齐。
**必要输入与条件：** 真实立体需要左右视点的不同透视；若只有单图，必须说明是视觉模拟。
**区别与边界：** 单纯移动 RGB 色道并不等于正确的双目视差。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/anaglyph-stereo)；固定详情快照 `effects/anaglyph-stereo.json`，SHA-256 `27deab9f4636e633ded34e5c5a3201e18d17d9e98b49cc24810d294984ca13fb`。
**Atlas 所列参考：** [原始参考页面](https://science.nasa.gov/blogs/earth-matters/2016/11/21/what-on-earth-is-an-anaglyph/)。

## atlas:anamorphic-lens-flare · 变形宽银幕镜头光斑

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 从现有强光源延展细长蓝青横向光带，伴有淡色反射鬼影和局部雾化眩光，亮部有轻微光晕而细节仍清楚。
**必要输入与条件：** 需要画面中已有强光源；光带方向应与镜头表现一致。
**区别与边界：** 光晕、镜头反射和横向光带不是同一种现象；不要无源地铺满全画面。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/anamorphic-lens-flare)；固定详情快照 `effects/anamorphic-lens-flare.json`，SHA-256 `c8d1acfbef5bbec954a958eb3388cf47cd66c8671950cae5795671b5ccc927da`。
**Atlas 所列参考：** [原始参考页面](https://theasc.com/article/star-trek-50-part-xi-the-trek-feature-reboot/)。

## atlas:anamorphic-widescreen · 变形宽银幕镜头质感

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 以横向光带、纵向拉长的椭圆焦外光点、轻微边缘柔化和桶形畸变表现宽阔电影空间。
**必要输入与条件：** 需要镜头焦外与边缘透视特征，不是只加黑边。
**区别与边界：** 宽银幕是画幅格式；光斑和散景是可选镜头特征，黑边本身不构成变形镜头质感。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/anamorphic-widescreen)；固定详情快照 `effects/anamorphic-widescreen.json`，SHA-256 `1af7614a0197303314bf1ea419e91ec0ee8d9c3fe7900c5a558cb7a24485b1ae`。
**Atlas 所列参考：** [原始参考页面](https://theasc.com/article/cinemascope-what-it-is/)。

## atlas:animated-gif · 动画 GIF 复古画面

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 以不超过 256 色的受限调色板、硬像素边缘和平涂块面呈现代表帧，并可用少量相邻残影暗示循环运动。
**必要输入与条件：** 静帧只能呈现 GIF 的视觉样式；真正动画需有多帧循环。
**区别与边界：** 单帧不构成动画 GIF；GIF 通常也不承载标准音轨。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/animated-gif)；固定详情快照 `effects/animated-gif.json`，SHA-256 `fb10a8a432c91ff53e853f19f8824a4d1757b8a517522741abdea14541b399f7`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/GIF)。

## atlas:animatronics · 机械特效偶质感

**视觉家族：** 实拍、舞台与模型特效（`atlas-family:practical-effects`）。
**可见效果与关键机制：** 把主体塑造成可触摸的关节模型：硅胶皮肤、泡沫乳胶纹理、隐约拼缝和关节分区，配合嵌入细节与现场接触阴影。
**必要输入与条件：** 真实机械偶需实体模型连续动作并由摄影机记录；图像处理只可模拟外观。
**区别与边界：** 区别于逐格停格动画，也区别于纯 CGI；不能把静图模拟说成实体拍摄。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/animatronics)；固定详情快照 `effects/animatronics.json`，SHA-256 `30edfaec0851f5a4b59466762cba1a047dc67a58c8b22e628cf06f5140522f12`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Texas_Auto_Show_September_2019_09_(Hank_the_Robot).jpg)。

## atlas:anisotropic-diffusion · 各向异性扩散平滑

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 在相似色块内部平滑噪声和细微色差，同时沿强对比边缘停止，让平面更干净而重要轮廓保持清楚。
**必要输入与条件：** 需要保留主要边缘的降噪或平滑任务。
**区别与边界：** 过强会抹掉纹理；不应再叠加锐化造成光晕。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/anisotropic-diffusion)；固定详情快照 `effects/anisotropic-diffusion.json`，SHA-256 `13a0f9720b9c18cda813c06b1d9b44d75406168b241cb6048d85f28702730cb4`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Doorman_on_Leadenhall_Street_(Unsplash).jpg)。

## atlas:ansi-16-color-terminal · ANSI 16 色终端图形

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 用矩形字符单元和受限的 16 色调色板重绘图像，形成清晰台阶边缘和平涂明暗，不添加额外界面装饰。
**必要输入与条件：** 需要等宽字符网格与有限色板；文字单元是画面构件。
**区别与边界：** 不应把终端外框或按钮误当成效果必要条件。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/ansi-16-color-terminal)；固定详情快照 `effects/ansi-16-color-terminal.json`，SHA-256 `ffa9fcb88da245b7604a890dfa236b022e014808c1547219275a68018c4588e4`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:anthotype · 植物染料日光印相

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 以单一浅紫植物色料渗入吸水纸，形成日晒褪色、高光发白、低反差、柔软边缘和斑驳手工涂布痕迹。
**必要输入与条件：** 对应植物染料的纸面与光照褪色外观。
**区别与边界：** 植物染料不稳定且会持续感光；与铁盐蓝晒工艺不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/anthotype)；固定详情快照 `effects/anthotype.json`，SHA-256 `2fdfb81e0dfb7c9381bda6271245ef053fccbe2a7e80af3f471900201b6ae6e3`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Ahornblatt_(Anthotypie).jpg)。

## atlas:ar-face-filters · 增强现实人脸滤镜

**视觉家族：** 人脸、人物追踪与变换（`atlas-family:portrait-tracking`）。
**可见效果与关键机制：** 将动物耳朵、半透明面罩等图层贴合脸部关键点、头部角度与透视，眼部可略夸张但要保留遮挡和一致高光。
**必要输入与条件：** 实时人脸滤镜需检测/跟踪面部关键点或面部模型，并逐帧随头部姿态与表情更新。非交互演示可手动关键帧定位饰物或变形，需标为动画模拟。
**区别与边界：** 不是全图色彩滤镜；静态贴纸不具备脸部跟踪。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/ar-face-filters)；固定详情快照 `effects/ar-face-filters.json`，SHA-256 `cadf862b2c60d1a413993cca36740c8757d295fc601710d82480c7e4a490903b`。
**Atlas 所列参考：** [原始参考页面](https://www.snapchat.com/lens/147281cb79534a65bbfc6d6dcf94de21)。

## atlas:ascii-art · ASCII 字符画

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 用等宽英文字母、数字和标点重建可见形体，深色字簇表示阴影、稀疏符号表示亮部，形成象牙底黑字的台阶轮廓。
**必要输入与条件：** 限用 ASCII 范围字符时，字符选择和行距必须服从网格。
**区别与边界：** Unicode 方块、盲文等扩展字符不属于原始 ASCII 字符集。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/ascii-art)；固定详情快照 `effects/ascii-art.json`，SHA-256 `c2d6475bae3b8b1c3645bc6c0fd3dd9d36112ec4fc480424cb5812e0be3dd1ac`。

## atlas:ascii-art-render · ASCII 字符灰度渲染

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 用等宽字符铺成严格网格，以密集深色字形表现阴影、稀疏标点表现中间调、空白保留高光。
**必要输入与条件：** 需要等宽字形与固定字符网格。
**区别与边界：** 该版本以字形密度模拟影调，不等于保留照片细节。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/ascii-art-render)；固定详情快照 `effects/ascii-art-render.json`，SHA-256 `2eaf8adb1c6db255356572ace2cc0e748d2f2081d55c33915249a7064289d7d2`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:astrophotography · 天体摄影质感

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 深炭黑背景承托冷银色高光，细颗粒和亮点集中在原有明亮细节，辅以克制光晕与淡云状影调。
**必要输入与条件：** 真实天体照片需要长曝光采集；单图处理不能增加未经拍摄的天体事实。
**区别与边界：** 假彩色不是天体摄影的必要特征，不能把处理想象冒充观测数据。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/astrophotography)；固定详情快照 `effects/astrophotography.json`，SHA-256 `85416e81d8d64fc4c775d131ae732c4a63d35f4870095fa0f574166c57a6e4ad`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:036_Milky_Way_during_Perseids_seen_from_Oeschinensee_with_water_reflections_Photo_by_Giles_Laurent.jpg)。

## atlas:atkinson-dither · Atkinson 抖色

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 用纯黑白紧凑点簇替代连续明暗；高光留白较多，暗部有力，中间调信息少于均匀抖色。
**必要输入与条件：** 需要黑白像素点阵和清楚轮廓。
**区别与边界：** 不要混用灰像素或规则棋盘；与 Floyd–Steinberg 的误差扩散分配不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/atkinson-dither)；固定详情快照 `effects/atkinson-dither.json`，SHA-256 `9b9e723ea103fb81073764f3c654dccedd4ab808d024d4233e8ef7e8dd7c9beb`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Horse_herd_in_Wales_(Unsplash).jpg)。

## atlas:autochrome-lumiere · 卢米埃尔彩色麦粒板

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 以柔亮的综合色彩、低饱和绿、暖珊瑚红和淡紫阴影，配合细密淀粉色粒与透光玻璃般的柔和辉光表现早期彩色影像。
**必要输入与条件：** 需要彩色颗粒、玻璃背照感及适度柔焦。
**区别与边界：** 这是工艺外观的模拟；不可误称为首张彩色照片或后期滤镜。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/autochrome-lumiere)；固定详情快照 `effects/autochrome-lumiere.json`，SHA-256 `dfb599913f632325c47094de300ec3cc94f9570496092ab37c27a19bf0a96060`。
**Atlas 所列参考：** [原始参考页面](https://blog.scienceandmediamuseum.org.uk/autochromes-the-dawn-of-colour-photography/)。

## atlas:autostereogram · 单图隐藏立体图

**视觉家族：** 立体视觉与多视角（`atlas-family:stereoscopic-space`）。
**可见效果与关键机制：** 密集水平重复的彩色纹理中，以局部改变重复间距隐藏深度；近处视差较大，形体没有描边或清晰轮廓。
**必要输入与条件：** 需要深度图并把它转换为重复纹理间距。
**区别与边界：** 不同于左右眼并列的立体图；观看者需通过调焦读出深度。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/autostereogram)；固定详情快照 `effects/autostereogram.json`，SHA-256 `bb611f15210f4e7e75b97681c18791e0b285f6692b4da4ccdda22506d56a52e2`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Autostereogram_Leyla_on_water.jpg)。

## atlas:backlit-animation · 背光轮廓动画质感

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 将表面简化成深色剪影，并以青蓝、亮蓝和暖橙色发光轮廓包边，带锐利光芯、柔和光晕和细微胶片颗粒。
**必要输入与条件：** 需要明确主体轮廓与发光边缘；保留背景与主体的层次。
**区别与边界：** 发光晕、镜头眩光和霓虹实体光源不同；真实拍摄需有光源或背光布置。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/backlit-animation)；固定详情快照 `effects/backlit-animation.json`，SHA-256 `fe864daa4643eee37c10dd9d836c11d1af43df089caba40be3f6da1426be60dc`。
**Atlas 所列参考：** [原始参考页面](https://theasc.com/article/making-of-tron-1982/)。

## atlas:barrel-lens-warp · 桶形镜头畸变

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 让直线向画面边缘外凸弯曲，中央形体略扩张、周边间距收紧，形成平滑的凸透镜空间变化。
**必要输入与条件：** 保持颜色和锐度不变，畸变主要改变几何位置。
**区别与边界：** 不要与波浪扭曲或旋涡混淆；变形过度会破坏主体识别。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/barrel-lens-warp)；固定详情快照 `effects/barrel-lens-warp.json`，SHA-256 `432a1fe74a8dd1794240d5ca171ecb0bd1d1e25a787ab0102fdeb265d4260c1a`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:bayer-cfa-mosaic · 拜耳彩色滤光阵列采样

**视觉家族：** 传感器与成像信号（`atlas-family:sensor-signal`）。
**可见效果与关键机制：** 把图像显示为可见的 2×2 感光采样格：两个绿色、一个红色、一个蓝色通道，每格亮度依原图变化。
**必要输入与条件：** 需要保留单通道采样格，不先混成完整彩色像素。
**区别与边界：** 这是传感器马赛克采样，不是已经去马赛克的彩色输出。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/bayer-cfa-mosaic)；固定详情快照 `effects/bayer-cfa-mosaic.json`，SHA-256 `e3df336dd76d063bb20d739ea781d8e5fb2bd1eba9463ba2e9d4ba6dde5c13dc`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:White_Multnomah_Falls_(Unsplash).jpg)。

## atlas:bayer-ordered-dither · 拜耳有序抖色

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 只用黑白像素，通过重复阈值矩阵把连续渐变转成规则方格与阶梯影调；图案间距一致，轮廓仍可读。
**必要输入与条件：** 需要规则矩阵与硬像素边缘。
**区别与边界：** 它会显出重复棋盘结构，不等于蓝噪声的非重复点阵。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/bayer-ordered-dither)；固定详情快照 `effects/bayer-ordered-dither.json`，SHA-256 `b34666d6de1cdd60b7a07146276f3063da9fdf06e3f16ead57b5ebe650374e89`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:beauty-filter · 定向美颜滤镜

**视觉家族：** 人脸、人物追踪与变换（`atlas-family:portrait-tracking`）。
**可见效果与关键机制：** 只平滑皮肤、淡化毛孔和瑕疵、提亮眼下，同时保留睫毛、眉毛、唇缘等清楚细节。
**必要输入与条件：** 需要识别人脸与皮肤区域的局部处理。
**区别与边界：** 过度会显得塑料；不同于对整幅图像均匀柔焦，也不应擅自改脸型。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/beauty-filter)；固定详情快照 `effects/beauty-filter.json`，SHA-256 `d83c929c4e9543ca58dc95c9bee68f5859d863b4ed10c1bcebbc876323c5ae3d`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Meitu)。

## atlas:ben-day-dots · 本戴印刷网点

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 用尺寸均一、间距规则的彩色圆点填充色块，配合黑色轮廓、青品黄红平涂和轻微套印偏移。
**必要输入与条件：** 需要网点填色和纸面印刷边缘。
**区别与边界：** 不是摄影半调网的泛称；点阵结构与色块分区应保持可辨。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/ben-day-dots)；固定详情快照 `effects/ben-day-dots.json`，SHA-256 `7c37c2560bba432cb3f727c997cff6d2eecab29af185e696da253c11e670b3c3`。
**Atlas 所列参考：** [原始参考页面](https://www.nationalgalleries.org/art-and-artists/features/roy-lichtenstein-learning-resource)。

## atlas:bevel-and-chrome-look · 斜面镀铬质感

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 给主要形体加抛光银色表面、切角边缘、亮白高光与明暗反射带，以冷色环境反射和紧贴阴影暗示金属厚度。
**必要输入与条件：** 需要明确的体块边缘与可解释的反射方向。
**区别与边界：** 表面高光不能替代真实挤出几何；避免把所有区域都做成镜面。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/bevel-and-chrome-look)；固定详情快照 `effects/bevel-and-chrome-look.json`，SHA-256 `880ca35992634676129d08c68209057ddbbddc3983a7d1234f14635785ea1b59`。
**Atlas 所列参考：** [原始参考页面](https://www.adobe.com/de/aboutadobe/pressroom/pressmaterials/pdfs/psnfh.pdf)。

## atlas:bilateral-filter · 双边滤波

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 在相近颜色区域内平滑噪声和细纹，同时沿明显色差边界保留轮廓，得到干净、略扁平的色面。
**必要输入与条件：** 需要基于颜色相似度与空间距离的边缘保留平滑。
**区别与边界：** 不可用锐化补偿而产生边缘光晕；来源未提供参数时不自行补定。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/bilateral-filter)；固定详情快照 `effects/bilateral-filter.json`，SHA-256 `1b5944ff1679c078fb40f63233a9c361f270b75dd16f59e3f87651d4b35766a9`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:binary-object-mask · 二值物体遮罩

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 将主体显示为纯白、背景显示为纯黑，保持有意义的内部孔洞，去掉颜色、纹理和灰度过渡。
**必要输入与条件：** 若把遮罩作为真实分割结果，需明确前景/背景分割或人工标注区域。作为合成示意，可直接绘制黑白遮罩并标注未运行算法；合成时再说明白区显示、黑区隐藏的约定。
**区别与边界：** 硬边二值遮罩不保留半透明发丝和软边。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/binary-object-mask)；固定详情快照 `effects/binary-object-mask.json`，SHA-256 `8c1ec1c9a15f0b7b8fc16be51dbf5a8323ef02a0468343242787cf4daf440323`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:bit-plane-slicing · 位平面切片

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 把图像拆为多层黑白区域，组合大块阈值轮廓与细碎颗粒噪点，暗示高位结构和低位信息的区别。
**必要输入与条件：** 需要明确位平面层次，而不是统一灰度分割。
**区别与边界：** 不同位层含义不能仅凭纹理装饰伪造。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/bit-plane-slicing)；固定详情快照 `effects/bit-plane-slicing.json`，SHA-256 `8ed84dcdadabf0a5f777bc78c254d42f5ea23661fbea8a00bab34d23cfbe757c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Gazing_up_in_the_forest_(Unsplash).jpg)。

## atlas:black-and-white-infrared · 黑白红外摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 让植被呈雪白、蓝天显深黑、肤色异常变浅，形成材料反差强烈的单色影像，并带细颗粒和轻微高光晕。
**必要输入与条件：** 真实红外效果依赖红外感光和滤镜；后期模拟须依主体材质调整。
**区别与边界：** 不能把所有高亮物体都变白，忽略红外反射差异。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/black-and-white-infrared)；固定详情快照 `effects/black-and-white-infrared.json`，SHA-256 `273810d5772d394ea82067f1b1d463d258b99f83e0cff558793febb237c0a58d`。
**Atlas 所列参考：** [原始参考页面](https://www.ilfordphoto.com/using-ilford-sfx-part-1/)。

## atlas:bleach-bypass · 跳漂白银影质感

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 显著降低饱和度、压深炭黑阴影、加强反差和金属感高光，并叠加明显银盐颗粒但保留表面细节。
**必要输入与条件：** 需要控制阴影密度和高光层次，保留少量原色残留。
**区别与边界：** 不同胶片工艺阶段的化学效果有差异；黑位并非一律压死。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/bleach-bypass)；固定详情快照 `effects/bleach-bypass.json`，SHA-256 `b07106f74f532da17048f941cea8b11c92b542e4afd7c44375134b15ef2854a2`。
**Atlas 所列参考：** [原始参考页面](https://www.kodak.com/en/motion/page/processing-techniques/)。

## atlas:blob-detection · 斑块检测标记

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 在与周围明暗对比的紧凑区域中心叠加青色圆圈，圈径随估计斑块尺寸变化，底图仍保持自然。
**必要输入与条件：** 若将圆标称为算法检测结果，中心与尺度应来自检测器输出或人工核验；讲解图可手动放置示意圆并说明未执行检测。调阈值时观察弱响应与强响应区域的变化。
**区别与边界：** 圆圈是检测范围示意，不证明区域语义或身份。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/blob-detection)；固定详情快照 `effects/blob-detection.json`，SHA-256 `b4f0d6eba1d4ac8384cd26972e7f5276c67d9ecfcc71d0ba21695bceccb2eac2`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:San_Francisco_Skyline_and_Alcatraz_Island_seen_from_Sausalito_-_Isaak_Dury_2013_(Unsplash).jpg)。

## atlas:block-glitch · 矩形块错位故障

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 选取矩形图像块做水平或垂直位移，留下硬边接缝、重复碎片、错配纹理和窄像素条，其余画面仍可识别。
**必要输入与条件：** 需要明确位移块的范围与方向，保留足够未破坏区域作参照。
**区别与边界：** 均匀全屏噪点不是块状错位；效果要有可辨的故障结构。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/block-glitch)；固定详情快照 `effects/block-glitch.json`，SHA-256 `99402d8f4d446f69b52593cc621e13131931bc5cca6230e6ba2e650c2dcaaf60`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:bloom · 高光泛光

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 让最亮的高光向邻近区域扩散柔和光晕，沿亮度平滑衰减，阴影保持较清楚，不铺成均匀雾层。
**必要输入与条件：** 需要画面已有明确亮部，局部扩散并保留亮源形状。
**区别与边界：** 泛光不等于镜头鬼影或整体柔焦。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/bloom)；固定详情快照 `effects/bloom.json`，SHA-256 `f37fbd6c0dc33bb3da0334c07336ec334ecc00949e8cab4de622868e19347955`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:blue-noise-dither · 蓝噪声抖色

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 用分布均匀但不重复的黑白细点表达明暗，让远看影调连续，近看没有明显网格、方向拖尾或点簇。
**必要输入与条件：** 需要非周期、均匀分散的点位。
**区别与边界：** 与规则矩阵有序抖色不同；不能误加成棋盘纹。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/blue-noise-dither)；固定详情快照 `effects/blue-noise-dither.json`，SHA-256 `ae93dd28437ca8d9fa5791b9293f6257e0486073ac8bcf5e95ee0ba016ce4bab`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Farmer%27s_Market_Produce_(Unsplash).jpg)。

## atlas:bokeh · 焦外散景

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 主体保持清晰，远处背景明显虚化，点状光源变成柔亮光盘并可带光圈边缘；景深过渡需自然。
**必要输入与条件：** 需要主体与背景深度层次，离焦光源适合成为视觉元素。
**区别与边界：** 散景指虚化的呈现质量，不是任意模糊；浅景深需有空间依据。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/bokeh)；固定详情快照 `effects/bokeh.json`，SHA-256 `3af5cd43603c697a719203503e305e0609beae940cccbb15cf8a6c940597d5e9`。
**Atlas 所列参考：** [原始参考页面](https://www.nikonusa.com/learn-and-explore/c/tips-and-techniques/bokeh-for-beginners)。

## atlas:bounding-box-detection · 目标检测框

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 在可见对象周围叠加细彩色矩形框，并可配类别标签和置信比例，框线不遮住主体。
**必要输入与条件：** 类别和置信数值必须来自真实检测或明确标为示意。
**区别与边界：** 虚构标签/百分比会把视觉示意误作检测结论。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/bounding-box-detection)；固定详情快照 `effects/bounding-box-detection.json`，SHA-256 `6ce58f602d209f3fa19e538b2f620cd07ea78b7b73f9d18ca0e7540bafccc181`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:box-blur · 方框邻域模糊

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 以均匀方形邻域混合颜色，压低细纹和颗粒；高反差边缘会变软，并留下轻微方形边缘感。
**必要输入与条件：** 用于均值式邻域模糊，保留大块明暗关系。
**区别与边界：** 不像圆形散景；不要把方框边缘伪影误认成镜头光圈。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/box-blur)；固定详情快照 `effects/box-blur.json`，SHA-256 `7aba5bb200996a2d994b064c379c8da6c6e864cdc3b558ddf488b295f262e2ed`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Hungry_Rabbit_(Unsplash).jpg)。

## atlas:brick-mosaic · 错缝砖块马赛克

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 将图像化成水平排列的彩色长方砖块，相邻行错开，每块用对应区域的平均色填充并留浅色灰缝。
**必要输入与条件：** 需要块状采样和稳定砖缝宽度。
**区别与边界：** 砖块是矩形离散单元，不是圆点网或一般低分辨率像素。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/brick-mosaic)；固定详情快照 `effects/brick-mosaic.json`，SHA-256 `8ffeca0f56306746c5597515626be48aca6f6a52ca9ca0c12b8282c72e2e26a0`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Factory_Worker_Making_Clothes_(Unsplash).jpg)。

## atlas:bromoil-print · 溴油印相

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 以棕黑色绒面油墨、暖纸高光和选择性柔化轮廓表现颜料转印，保留粗细不同的颗粒与哑光纸面。
**必要输入与条件：** 需要油墨沉积与摄影影调同时存在。
**区别与边界：** 相关油印工艺并不完全相同；不能把所有绘画感照片都称为溴油印相。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/bromoil-print)；固定详情快照 `effects/bromoil-print.json`，SHA-256 `148a1ae3d4621b926f7e959c8b252480e9a309f97e0ae9b86907ca6f38712cdc`。
**Atlas 所列参考：** [原始参考页面](https://hnoc.org/virtual-exhibitions/from_daguerreotype_to_digital/bromoil-and-bromoil-transfer-processes)。

## atlas:brulage · 火烧乳剂影像

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 模拟热损伤照片乳剂的流动、气泡、波纹轮廓、焦痕与不规则融化边缘，严重损伤集中在局部或边缘。
**必要输入与条件：** 要让损伤落在照片/底片材料表面，并留出未损区域作对照。
**区别与边界：** 不是显影时受光反转的曝光技法；它强调物理热造成的变形。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/brulage)；固定详情快照 `effects/brulage.json`，SHA-256 `19a689bbf5c31f8e723bf085a23a7bd3beb4c3ccbfc5435093fc332032678b5d`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Frontispice_pour_La_Philosophie_dans_la_boudoire_(1944).jpg)。

## atlas:bullet-time · 子弹时间环绕视角

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 主体动作近乎冻结，镜头视角似乎绕主体移动，空中微粒保持清晰，远景才带克制弧形拖影以强调空间深度。
**必要输入与条件：** 真实子弹时间通常需要多机位或重建视点；单张图只能模拟停格与环绕感。
**区别与边界：** 单视角慢动作不等于视角发生环绕。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/bullet-time)；固定详情快照 `effects/bullet-time.json`，SHA-256 `6255306481a060bdf0ea78ce6e3eb1578e9a12f0af7b1092e7aa082545a0f35b`。
**Atlas 所列参考：** [原始参考页面](https://theasc.com/article/flashback-the-matrix-cinematography/)。

## atlas:bump-mapping · 凹凸贴图光照

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 用方向性高光和微小阴影让表面呈现细小颗粒、褶皱或刻痕，同时保持外轮廓平滑，体现表面而不鼓出几何。
**必要输入与条件：** 需要法线/高度变化与一致受光方向。
**区别与边界：** 它改变明暗而不改变几何；轮廓边缘和浅角度下的错觉会减弱。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/bump-mapping)；固定详情快照 `effects/bump-mapping.json`，SHA-256 `5432b792b4cafc421bfc3c7e26b5292675a20282faedf5eedb52d808e7cc9bdc`。
**Atlas 所列参考：** [原始参考页面](https://www.jimblinn.com/publications/)。

## atlas:busby-berkeley-top-shot · 巴斯比·伯克利顶拍队形

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 从俯视角组织同心环、放射线与花形队列，让真实舞者群体形成精确对称、扁平化的舞台图案。
**必要输入与条件：** 要复现实拍编舞，设计俯拍队形、同步动作与正上方视点，让径向变化清楚可读。动画或图解也可用人物图标/虚拟队列构造相同几何关系，不要求真实演员；将其标为示意或数字编排。
**区别与边界：** 镜面万花筒会复制反射图像；此类队形由多名真实表演者构成。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/busby-berkeley-top-shot)；固定详情快照 `effects/busby-berkeley-top-shot.json`，SHA-256 `d506521eccb6c5b13dc64d47c33d611a944872a09630cb3715821cbdb57a07d2`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Busby_Berkeley)。

## atlas:calotype · 卡罗式纸基负片

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 表现早期纸基负片的柔和细节、纸纹和低反差，再由负片关系形成独特的印相层次。
**必要输入与条件：** 需要纸基负片/正片关系的影像处理依据。
**区别与边界：** 此项作为工艺外观参考；来源没有给出可复刻所有纸张参数的完整配方。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/calotype)；固定详情快照 `effects/calotype.json`，SHA-256 `7a608543e659cf5332106930e6f5250a7c8b78e04b1b7524e3ec72a425ce24e1`。
**Atlas 所列参考：** [原始参考页面](https://www.metmuseum.org/essays/william-henry-fox-talbot-1800-1877-and-the-invention-of-photography)。

## atlas:canny-edge-detection · Canny 边缘检测

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 以平滑、梯度估计、非极大值抑制和双阈值连接得到细而连续的主要边缘。
**必要输入与条件：** 需要输入图像、平滑尺度与成对阈值；结果受参数和纹理影响。
**区别与边界：** 边缘图是图像结构提示，不等于完整对象轮廓。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/canny-edge-detection)；固定详情快照 `effects/canny-edge-detection.json`，SHA-256 `4a12b4bf49b009d27f3d97f960ba1b79cfb08bba53267297a38b4afc7e3ca006`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:canvas-extension-schematic · 画布外扩示意

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 展示原图边界以外的扩展区域，并明确哪些部分来自原图、哪些是待生成的补画范围。
**必要输入与条件：** 需要原图尺寸、扩展方向和必须保持的主体边界。
**区别与边界：** 若声称为实际 outpainting 结果，补画内容需来自真实图像工作流；本条来源分类为画布扩展示意，采用经典镜像填充而非神经推理。讲解示意可用人工或数字方式模拟扩展边界与补画区，并明确标为示意，不冒称模型输出。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/canvas-extension-schematic)；固定详情快照 `effects/canvas-extension-schematic.json`，SHA-256 `09ddcc71fb0a83058cb4c8fa50acc810938a18ded1177f25fcfb6f6782bfd827`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:carbon-print · 碳素印相

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 以深炭色颜料、暖中间调、清晰细节和宽影调表现纸基印相，浓密阴影可见轻微明胶浮雕。
**必要输入与条件：** 纸面纹理和颜料层需克制。
**区别与边界：** 屏幕模拟不能证明实际碳素工艺。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/carbon-print)；固定详情快照 `effects/carbon-print.json`，SHA-256 `8e22ba1492c2f465d50286d3d14d0254f5476a735a9dc27b9916d2738ee11020`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Adolphe_Braun_-_Sculptures_from_the_Parthenon,_British_Museum_-_1998.161_-_Cleveland_Museum_of_Art.tif)。

## atlas:carte-de-visite · 名片式肖像照

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 小幅暖褐照片置于较大的奶油色卡纸上，采用影楼式柔光、蛋白印相细节和轻微褪色高光。
**必要输入与条件：** 需要照片与卡纸的尺寸层级。
**区别与边界：** 纸卡装裱是格式特征，不只是棕色滤镜。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/carte-de-visite)；固定详情快照 `effects/carte-de-visite.json`，SHA-256 `d585142716241520f185f2423a9753fd6dbc03761940a5486066c970fbe69c13`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Andr%C3%A9-Adolphe-Eug%C3%A8ne_Disd%C3%A9ri_-_Duc_de_Coimbra_-_Google_Art_Project.jpg)。

## atlas:cel-animation · 赛璐珞动画帧

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 主体使用清楚墨线、平涂不透明色与少量两阶阴影，背景保留细致手绘场景，并呈现透明片材的套色质感。
**必要输入与条件：** 需区分前景动画层与背景绘景。
**区别与边界：** 单帧画面不代表已实现逐格运动。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/cel-animation)；固定详情快照 `effects/cel-animation.json`，SHA-256 `3232d3c3eca9d3bec8e1b8f45a61967cf5b99789361859c0ac84714f47d0de07`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:The_Monkey_King_in_Havoc_in_Heaven_(1961-1964_film)_-_Cel_Animation_Art.jpg)。

## atlas:cel-shading · 赛璐璐着色

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 以纯色块、两至三档明确光影带和清晰黑色外轮廓替代柔和渐变，表面纹理随之简化。
**必要输入与条件：** 阴影边界应服从形体和受光方向。
**区别与边界：** 不是赛璐珞动画的整套制作工艺。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/cel-shading)；固定详情快照 `effects/cel-shading.json`，SHA-256 `14997d5b1d21982ecde19199834332900e540996218fa15e5026e6a54cfab481`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Cel_shading_composite_final_image.png)。

## atlas:chan-vese-level-set · Chan–Vese 水平集分割

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 把照片约化为黑白两块区域，边界平滑并服从较大亮度区域，压掉细纹和小噪声。
**必要输入与条件：** 适合依据区域平均亮度分成两类的任务。
**区别与边界：** 不能把平滑二值轮廓当作语义物体识别。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/chan-vese-level-set)；固定详情快照 `effects/chan-vese-level-set.json`，SHA-256 `2285ba39668c34edccc0aad15f7fa0eee63f480290b5eb6c544d4fe0e68fdb9a`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Cheering-1031743.jpg)。

## atlas:channel-mixer · 通道混合

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 按重新组合的红绿蓝通道构成假彩色，亮度随通道来源改变但仍保留照片结构。
**必要输入与条件：** 每个输出色道的来源要明确记录。
**区别与边界：** 通道重新映射不是普通色相旋转。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/channel-mixer)；固定详情快照 `effects/channel-mixer.json`，SHA-256 `4d13d6640e2c6bb5d8d8a9addedd17d7b43754d4de1c853da2631fef9b9c6082`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Pink_flowers_on_branches_(Unsplash).jpg)。

## atlas:charcoal-contour · 炭笔轮廓

**视觉家族：** 插画媒材与笔触（`atlas-family:illustration-material`）。
**可见效果与关键机制：** 用粗粝黑轮廓、大片哑光阴影、烟灰色调与纸面颗粒表现炭笔，局部有断续笔痕和粉尘擦痕。
**必要输入与条件：** 需要保留主体明暗分组与纸面纹理。
**区别与边界：** 不是将图像简单描成均匀线稿。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/charcoal-contour)；固定详情快照 `effects/charcoal-contour.json`，SHA-256 `f2a24df3903c0b5a4ae5049ce811b1b13736b71b2abc1794677d75ee43422de9`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:chemigram · 化学绘影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 以化学扩散斑、蜡阻隔岛状区域、清楚遮罩边界和同心反应带呈现暗房实验印相。
**必要输入与条件：** 纹理需像化学反应留在相纸表面。
**区别与边界：** 该外观基于暗房化学过程，不宜称作数字液化。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/chemigram)；固定详情快照 `effects/chemigram.json`，SHA-256 `7871de467790c03898b2e0b3975634980cb0650bbd2daa5347845231f2f99f1b`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Paolo_Monti_-_Serie_fotografica_-_BEIC_6363655.jpg)。

## atlas:chroma-key · 色度键抠像

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 前景由色度背景分离，边缘略硬；另一个独立背景层置于后方，边缘可见克制色溢。
**必要输入与条件：** 若复现色度键抠像，以背景色生成前景遮罩并与独立背景层合成；检查发丝、半透明边与光向。纯视觉示意可使用手绘或预制遮罩，但不称为真实色度键处理结果。
**区别与边界：** 只有绿幕绿边而没有前后层，不构成完整合成。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/chroma-key)；固定详情快照 `effects/chroma-key.json`，SHA-256 `057774eba81bf8d6b76e6d42f9954dc519811e928cef3308653034ab5026831c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Chroma_key.png)。

## atlas:chroma-subsampling · 色度子采样

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 亮度边缘维持清晰，但颜色分辨率降低；高饱和边界出现轻微渗色，小色块围绕鲜艳轮廓。
**必要输入与条件：** 颜色与亮度采样需要区别处理。
**区别与边界：** 色度模糊不等于整体低分辨率。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/chroma-subsampling)；固定详情快照 `effects/chroma-subsampling.json`，SHA-256 `91b779a688bae6bd2041bc2db4db80d54df0cc6afc2c53d079eb1ece1b68989b`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Peaceful_landscape_in_Yosemite_(Unsplash).jpg)。

## atlas:chromadepth-3d · 色彩深度立体效果

**视觉家族：** 立体视觉与多视角（`atlas-family:stereoscopic-space`）。
**可见效果与关键机制：** 将近景映为红橙、中景为黄绿、远景为青蓝深蓝，并用清晰边界和黑色负空间强化前后层。
**必要输入与条件：** 颜色分配要跟实际深度顺序一致。
**区别与边界：** 仅改色不提供真实双眼视点，立体感依赖观看条件。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/chromadepth-3d)；固定详情快照 `effects/chromadepth-3d.json`，SHA-256 `35e03bd7fc2104042f3e30326adf5ee68ea79f0b4744db0e117d15deb7d6e697`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Katarzyna_Kobylarz_-_Drzewo_%C5%BBycia_Obraz_w_technologii_3D_Chromadepth_2017_r.jpg)。

## atlas:chromatic-aberration · 色差边缘

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 高反差轮廓出现细微红青蓝色边，离中心越远越明显；画面中心仍基本对齐锐利。
**必要输入与条件：** 色边沿边缘渐强，不覆盖主体细节。
**区别与边界：** 不要做成全画面 RGB 分离或故障撕裂。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/chromatic-aberration)；固定详情快照 `effects/chromatic-aberration.json`，SHA-256 `4547ccf51cd9dfeb513aad0db41a1519abfb3e80507332327a8ce87da9557688`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:chromolithography · 彩色石版套印

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 以高覆盖红、蓝、黄、绿颜料分层套印，边缘略错位，配合蜡笔点描和暖纸纹。
**必要输入与条件：** 需要多色层、套印关系与纸面底色。
**区别与边界：** 彩色复古感不等于石版印刷结构。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/chromolithography)；固定详情快照 `effects/chromolithography.json`，SHA-256 `089867abe5b7c1648b0b53748de0ab2b74348774f36ae41958631a8e7f0e439d`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Toussaint_L%27Ouverture_-_Corrie%27s_Detroit_Chromo_Lith._office._LCCN2014645197.tif)。

## atlas:chronophotography · 连续相位摄影

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 在同一画幅内重叠呈现主体运动的多个相位，以淡色单色轮廓、明确间隔和轻微摄影颗粒显示动作轨迹。
**必要输入与条件：** 需要连续时刻的姿态或明确动作分解。
**区别与边界：** 不是单纯运动拖影；每个相位都应能辨认。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/chronophotography)；固定详情快照 `effects/chronophotography.json`，SHA-256 `75e03010a51c87b6af003c913a6862b4057b244218a3067814163257f405304c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:%C3%89tienne-Jules_Marey_-_Chronophotograph_of_a_Flying_Heron_-_2009.349_-_Cleveland_Museum_of_Art.tif)。

## atlas:cinemagraph · 静止照片局部动效

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 整体像冻结照片，只有烟、水或松散布料等小区域呈现轻微循环运动，运动边界与静止部分无缝衔接。
**必要输入与条件：** 需要静止底图与局部循环运动层；运动层可取自短视频，也可独立制作后遮罩合成，首尾要自然衔接。若声称为实拍 cinemagraph，则使用静止机位拍摄的循环视频素材。
**区别与边界：** 静帧只能描述外观；局部运动须用连续素材验收。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/cinemagraph)；固定详情快照 `effects/cinemagraph.json`，SHA-256 `4c264cd79ada2f0fa7782ee31809b96106470b5d0e19002e8de777892658a9c6`。
**Atlas 所列参考：** [原始参考页面](https://www.cbsnews.com/pictures/cinemagraphs-still-images-that-move/)。

## atlas:cinerama · 三联宽银幕全景

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 画面由三块等宽垂直视区拼成，呈轻微弯幕与视差差异，接缝和曝光差克制可见。
**必要输入与条件：** 三幅画面须有空间承接关系。
**区别与边界：** 不是普通全景裁切或任意三栏分屏。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/cinerama)；固定详情快照 `effects/cinerama.json`，SHA-256 `94bb5a520aec318067ee475f636fd2f40f57ebed7bd35e0aa81cb2867d38c9b1`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:This_Is_Cinerama_02.jpg)。

## atlas:circle-packing-mosaic · 圆形填充马赛克

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 用大小不一但互不重叠的圆盘取样填色，小圆填入空隙，圆边与中性底色缝清楚可见。
**必要输入与条件：** 圆盘颜色来自对应局部图像。
**区别与边界：** 不要把圆点画成规则半调网格。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/circle-packing-mosaic)；固定详情快照 `effects/circle-packing-mosaic.json`，SHA-256 `0a0df35d552ab48643b9523a833b96b991556b17045a43cd86e47da255d36c53`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Coffee_cup_in_woman%27s_hands_(Unsplash).jpg)。

## atlas:clahe-local-contrast · CLAHE 局部对比度增强

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 分别提升不同影调区域的细节，让阴影纹理与亮面更清楚，同时保留自然颜色并限制高光过曝。
**必要输入与条件：** 按局部区域均衡，需约束对比增益。
**区别与边界：** 过度增强会显噪、出光晕；不等同于整体加对比。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/clahe-local-contrast)；固定详情快照 `effects/clahe-local-contrast.json`，SHA-256 `4d19da4e16a919c7f60c2e0fa97c9d663eeed587396f3ae3814ae4c54c70bf67`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:classical-image-inpainting · 传统图像修补

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 从邻近颜色、纹理和连续轮廓重建小块破损或干扰背景，让补片自然融合，局部可略软。
**必要输入与条件：** 适合小面积缺损，需有可延续的邻域信息。
**区别与边界：** 大面积语义内容不能靠局部补纹理可靠恢复。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/classical-image-inpainting)；固定详情快照 `effects/classical-image-inpainting.json`，SHA-256 `8e48bdcd29cdeb85342f9a893a21eee5780005f3f5f111e841ff3b1630c8fe44`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:cliche-verre · 玻璃刻线摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 以刮刻玻璃转印出的细黑线与斜线排线为主，线缘略带柔化，落在暖象牙色相纸上。
**必要输入与条件：** 需要刻线与照片转印的线条质感。
**区别与边界：** 不是直接在照片上画黑线。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/cliche-verre)；固定详情快照 `effects/cliche-verre.json`，SHA-256 `f9f217a613e05da37ee726be1f52817583aee063286701efbeee8b40b908f893`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Jean_Baptiste_Camille_Corot_-_A_Souvenir_of_the_Bas-Br%C3%A9au_-_1925.561_-_Cleveland_Museum_of_Art.tif)。

## atlas:collotype · 珂罗版印刷

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 单色油墨呈现丰富连续影调、深阴影和细腻高光，表面带微小蠕虫状网纹与哑光纸感。
**必要输入与条件：** 需保留连续调而非粗网点。
**区别与边界：** 不能以普通半调圆点替代珂罗版的网纹结构。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/collotype)；固定详情快照 `effects/collotype.json`，SHA-256 `cb6df503d472f5f02ee7a2afa8b8e30b324db150c4f34cdc22bc249bfa32303f`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Collotype_of_Cooking_Oil_Coupon,_Hangzhou_National_Archives_113.jpg)。

## atlas:color-blindness-simulation · 色觉缺陷模拟

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 按红绿色觉缺陷近似压缩红绿差异，使部分颜色转向相近的黄褐调，同时保留蓝黄区分。
**必要输入与条件：** 用途是检查可辨识度；保留原亮度关系供比较。
**区别与边界：** 模拟类型必须写明；不是通用调色风格。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/color-blindness-simulation)；固定详情快照 `effects/color-blindness-simulation.json`，SHA-256 `2f2307c16172215a429ddd8e8f3e975330d24664c33951a7c487a260a575549c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Namib_Desert,_Namibia_(Unsplash).jpg)。

## atlas:color-channel-noise · 分色道噪点

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 红绿蓝通道分别出现独立彩色细点，阴影和平滑表面更明显，偶有亮色单像素。
**必要输入与条件：** 噪声按通道独立产生，控制强度。
**区别与边界：** 不要变成均匀黑白胶片颗粒。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/color-channel-noise)；固定详情快照 `effects/color-channel-noise.json`，SHA-256 `b75beed5a96f224956f248b7e889fbfb09efd7c0afa123d54481c98a83c81338`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:color-inversion · RGB 数值反相

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 每个 RGB 通道精确从最大值减去原值，黑白互换，红青、绿洋红、蓝黄互补，保留原有边缘。
**必要输入与条件：** 按通道逐值反相。
**区别与边界：** 与胶片负片调色不同，这里强调确定的数值变换。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/color-inversion)；固定详情快照 `effects/color-inversion.json`，SHA-256 `2125a45afd2cb579905c0a510af8d529dd6713b8c2fb2cd42c8838cbcba78305`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Just_leaving_(Unsplash)_(cropped).jpg)。

## atlas:color-negative · 彩色负片外观

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 高光转暗、阴影转亮，颜色关系变成青品黄互补色调，呈现负片反转的视觉关系。
**必要输入与条件：** 可在反相之后再管理色彩和纸基观感。
**区别与边界：** 与数字精确 RGB 反相近似但非同一工作流程。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/color-negative)；固定详情快照 `effects/color-negative.json`，SHA-256 `44526b93992df4d6e8f90cfb312085493429095d6555636a3221a910945dc11e`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:combination-printing · 多底片合成印相

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 将不同影调区域无缝合印，局部曝光相互平衡，照明方向一致，保持暖单色银盐纸面与细颗粒。
**必要输入与条件：** 需要多个底片/遮罩或局部曝光来源。
**区别与边界：** 若合成来源不同，需避免光向和反差冲突。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/combination-printing)；固定详情快照 `effects/combination-printing.json`，SHA-256 `26333a83d9008eb1704acb089a08082db30af3858a7e22d23aab07dfb1d7d2c6`。
**Atlas 所列参考：** [原始参考页面](https://www.metmuseum.org/art/collection/search/294822)。

## atlas:composite-portraiture · 多重曝光肖像

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 同一人物的半透明影像略微错开，中心五官相对清楚，发丝、耳缘、下颌和外轮廓形成柔和重影。
**必要输入与条件：** 需同一主体多次曝光或可控的透明叠层。
**区别与边界：** 不同人物拼接不属于同一主体的复合肖像。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/composite-portraiture)；固定详情快照 `effects/composite-portraiture.json`，SHA-256 `bad7fd4d556297abb108a25514845963939c7c9a9ef46e8beef2b030f56231aa`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Galton_Composite_Photograph_of_Family.jpg)。

## atlas:computational-night-mode · 计算式夜景增强

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 夜景阴影仍可读、路灯不过曝，低照度颜色自然，颗粒克制且表面细节保留。
**必要输入与条件：** 真实计算夜景通常整合多帧曝光；静图只能模拟结果。
**区别与边界：** 避免蜡状过度降噪与超出原场景的信息补造。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/computational-night-mode)；固定详情快照 `effects/computational-night-mode.json`，SHA-256 `d3c5956614b998ee78c94b1387726641ff76ff218eeaa2c593b199d721f02373`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Aurora_Borealis_2024-05-10_from_Theydon_Bois,_Essex_03.jpg)。

## atlas:connected-components · 连通区域标色

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 按相邻像素的连通性拆分区域，以不同饱和色区分互不相连的块，并可显示区域编号。
**必要输入与条件：** 需要明确连通规则与区域依据。
**区别与边界：** 色块标签表示连通关系，不等于物体类别。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/connected-components)；固定详情快照 `effects/connected-components.json`，SHA-256 `ba4ce689286fe0f07f97fe11871cba01b39ed7d088718f06fe270931bd63d9a2`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Perched_blue_and_orange_bird_(Unsplash),_crop.jpg)。

## atlas:contour-extraction · 轮廓线提取

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 把照片压成黑底浅色细线，描出外轮廓、内部孔洞和嵌套区域边界。
**必要输入与条件：** 线条应由图像边缘/区域提取产生。
**区别与边界：** 所有可见边缘并非物体边界。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/contour-extraction)；固定详情快照 `effects/contour-extraction.json`，SHA-256 `8058917a7915d7b8afc399cc6423f442ab0d3def72403fbb9a7ed7c5f4985fd1`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:controlnet-conditioning · ControlNet 结构条件图

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 在照片旁并列显示对应轮廓或结构图，以黑底白线表示相同的形状和空间位置。
**必要输入与条件：** 结构面板需与原图对齐；实际生成需要可用的条件图工作流。
**区别与边界：** 条件图示意不等于已执行模型控制。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/controlnet-conditioning)；固定详情快照 `effects/controlnet-conditioning.json`，SHA-256 `cb44f4d597a141f97c152c1f482d80cfcafe7830e37fc3a0b35bc61490c080bf`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:convex-hull-mask · 凸包遮罩

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 以包住主体最外侧点的单一白色凸多边形表示范围，填平内凹并覆盖内部孔洞，轮廓转为直线折角。
**必要输入与条件：** 需要主体的外缘点集或遮罩。
**区别与边界：** 凸包会故意抹去轮廓凹口与内部空洞。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/convex-hull-mask)；固定详情快照 `effects/convex-hull-mask.json`，SHA-256 `f9fffd4030310efc048bab54e053197456bf0ef3bf410852d6ebad2c2bbb441b`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Downtown,_Las_Vegas,_United_States_(Unsplash).jpg)。

## atlas:conways-game-of-life · 康威生命游戏格网

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 在黑色方格网中以白色活细胞构成可识别图形，并可展示方块、闪烁器等局部模式。
**必要输入与条件：** 需要离散网格与明确初始状态/迭代。
**区别与边界：** 静态格网图不证明按规则运行过演化。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/conways-game-of-life)；固定详情快照 `effects/conways-game-of-life.json`，SHA-256 `ac5e368e52ce7c8ff5c8b57c2cebf74c595a71e0e99c188d6fcf81b699640bdb`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Conway's_Game_of_Life)。

## atlas:crash-zoom · 急速变焦瞬间

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 主体焦点保持锐利，周边细节沿径向拉成长线，并留下淡淡同心变焦回声，呈快速光学放大的截帧。
**必要输入与条件：** 需要指定稳定焦点与径向方向。
**区别与边界：** 截图效果不能替代真实镜头运动的连续过程。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/crash-zoom)；固定详情快照 `effects/crash-zoom.json`，SHA-256 `237656e15505bf83e838de1b8c91acd16f033c0808a8de64e6012f37e48dc327`。

## atlas:cross-processing · 交叉冲洗色调

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 阴影偏青绿、高光偏暖黄、红色意外饱和，反差增强并带细颗粒与不均匀色偏。
**必要输入与条件：** 保留明暗层次，色偏在各影调区有区别。
**区别与边界：** 不是随机套色；不应压成单一青橙 LUT。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/cross-processing)；固定详情快照 `effects/cross-processing.json`，SHA-256 `9044419108d6693021b91c9b93ef3f4a3c8ba19699728605900a2992711a6470`。
**Atlas 所列参考：** [原始参考页面](https://www.lomography.com/school/what-is-cross-processing-fa-bne2kolj)。

## atlas:cross-stitch-pattern · 十字绣格纹

**视觉家族：** 插画媒材与笔触（`atlas-family:illustration-material`）。
**可见效果与关键机制：** 用等距 X 形线迹在浅色织物网格上重建图像，每格取有限色，线迹间留出细小布底。
**必要输入与条件：** 需要针脚方向、织物底纹与色板网格一致。
**区别与边界：** 十字形线迹不是普通像素方格。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/cross-stitch-pattern)；固定详情快照 `effects/cross-stitch-pattern.json`，SHA-256 `231ec66df367e6e05f5751625a08d19326a1110f11ec7f1f66d55b1831064c0a`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Sunset_at_Times_Square,_New_York_City_(2017).jpg)。

## atlas:crosshatching · 交叉排线素描

**视觉家族：** 插画媒材与笔触（`atlas-family:illustration-material`）。
**可见效果与关键机制：** 用相交的平行黑线表现明暗，阴影区排线密集，中间调减少交叉，亮部保留白纸。
**必要输入与条件：** 线组的方向、密度应随形体和影调变化。
**区别与边界：** 不是整幅叠均匀网格。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/crosshatching)；固定详情快照 `effects/crosshatching.json`，SHA-256 `a041dc0717c3e51edc3afaa07e0cda71660d887ee6fa5ee67628d1d2dea5d63a`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:New_York_city_center_street_at_night-time_(Unsplash).jpg)。

## atlas:crowd-simulation · 人群模拟

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 在背景空间加入姿态、服饰、朝向和间距不同的小人物，形成密集但有路径逻辑的群体。
**必要输入与条件：** 需要场景空间、人数规模和活动方向。
**区别与边界：** 生成的人群若代表真实事件，数量和身份必须有依据。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/crowd-simulation)；固定详情快照 `effects/crowd-simulation.json`，SHA-256 `e81a017835a65a4b4e9ab3eaf45eb1f643eaa91fbeba9c2e575805d68e67334e`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Crowd_simulation,_Covent_Garden.jpg)。

## atlas:crt-scanlines · CRT 扫描线

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 画面覆盖细密交替的亮暗水平线，辅以轻微 RGB 荧光点阵、柔和泛光和略弯曲屏幕边缘。
**必要输入与条件：** 线距与屏幕弯曲需克制。
**区别与边界：** 扫描线不是 VHS 跟踪噪声或屏幕撕裂。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/crt-scanlines)；固定详情快照 `effects/crt-scanlines.json`，SHA-256 `f1d01678d9dd7b31aae31b52677909a2f2635cf34ba2b05d095915721639a50b`。

## atlas:crystal-ball-refraction · 水晶球折射

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 圆形玻璃区域弯曲放大其下方图像，边缘压缩，带细微球面高光与清楚外缘。
**必要输入与条件：** 需要圆形球体区域和球内外连续的底图。
**区别与边界：** 不能只叠一个透明圆形高光。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/crystal-ball-refraction)；固定详情快照 `effects/crystal-ball-refraction.json`，SHA-256 `6f5c797ac90d4c2e4a14c4ac485f6512fa3cedfd224c924a1ca0d7449d69d29c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Public_Transportation_(Unsplash).jpg)。

## atlas:crystoleum · 玻璃罩彩绘相片

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 细节照片位于轻微凸起的玻璃下，背面有柔和手绘粉彩，表面出现玻璃反光与粉彩融合边缘。
**必要输入与条件：** 需要照片层、背面手绘色层和凸面玻璃质感。
**区别与边界：** 不同于普通彩色照片滤镜，玻璃与背涂是关键。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/crystoleum)；固定详情快照 `effects/crystoleum.json`，SHA-256 `e3298711f8866f09046105aa5d0893f4b8356a5526a11f4de1987ec324259b2b`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Portret_in_lijst,_RP-F-F17623.jpg)。

## atlas:cyanotype · 蓝晒印相

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 用普鲁士蓝暗部、浅蓝中间调和纸白高光表现铁盐印相，带哑光水彩纸纤维与不均匀涂布痕迹。
**必要输入与条件：** 需纸基涂布与紫外曝光外观。
**区别与边界：** 蓝晒基于铁盐光化学，不是植物染料日光印相。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/cyanotype)；固定详情快照 `effects/cyanotype.json`，SHA-256 `0cb8fe974a19c2c8a87e0902b87901f007718c11e726c25a23eec155da5e0d3f`。
**Atlas 所列参考：** [原始参考页面](https://www.metmuseum.org/art/collection/search/286656)。

## atlas:cyanotype-simulation · 蓝晒外观模拟

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 将影调映为普鲁士蓝阴影、中间蓝与纸白高光，采用哑光相纸和轻微纤维纹理。
**必要输入与条件：** 保持蓝白层级和纸面质感。
**区别与边界：** 此条是数字模拟；与实际蓝晒化学印相区分。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/cyanotype-simulation)；固定详情快照 `effects/cyanotype-simulation.json`，SHA-256 `10e398612bcab5096b6efad5de563804cc6408dc7f9ba970aa8e56e2939b69ca`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:cymatics · 振动驻波图样

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 让浅色沙粒聚集成节点线、对称格网和同心环，铺在暗色振动表面上，辅以浅水纹理和局部波纹高光。
**必要输入与条件：** 图样需来自明确振动频率/介质或清楚标为示意。
**区别与边界：** 不能用任意纹样冒充真实声学测量。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/cymatics)；固定详情快照 `effects/cymatics.json`，SHA-256 `a808ff00b69f52000a2403ae8b3686c8d5ade8890a8b165027b48510ad57a10c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:1010_Hz.jpg)。

## atlas:daguerreotype · 银版摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 在镀银铜板上呈现极锐利单色细节和镜面反射，视角变化会改变明暗反差。
**必要输入与条件：** 需要镜面金属板和观看角度相关反光。
**区别与边界：** 普通纸面黑白照片没有银版的镜面观看条件。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/daguerreotype)；固定详情快照 `effects/daguerreotype.json`，SHA-256 `450504efdd70b188a1feddf1be5546d435f46f76e51197e55efd6b8736506570`。
**Atlas 所列参考：** [原始参考页面](https://www.metmuseum.org/essays/daguerre-1787-1851-and-the-invention-of-photography)。

## atlas:dark-channel-dehaze · 暗通道去雾

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 压低乳白雾幕，显出远景结构、深黑、自然饱和度与局部反差，同时保留真实空间深度和光向。
**必要输入与条件：** 适用于有大气雾霾的图像；雾层应有空间差别。
**区别与边界：** 去雾不能随意加黑或捏造远处细节。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/dark-channel-dehaze)；固定详情快照 `effects/dark-channel-dehaze.json`，SHA-256 `82b72c92b94f806222cb1f611513a9a51c8e79739d74993f492e15d51cb3af3c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Dragonfly_landing_(Unsplash).jpg)。

## atlas:databending · 数字文件弯折故障

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 出现突然水平错位、扫描带移位、色道破裂和块状损坏数据片段，完整照片区与锯齿断裂交替。
**必要输入与条件：** 需要有可辨的编码/信号异常区域。
**区别与边界：** 不要把普通 RGB 分色或全屏噪点叫作 databending。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/databending)；固定详情快照 `effects/databending.json`，SHA-256 `8cc1bcc93ee0368fe6d9fd6f138794daab74db837c8c0489054dcb01bc34b8d2`。
**Atlas 所列参考：** [原始参考页面](https://nickbriz.com/databending101/intro.html)。

## atlas:datamoshing · 压缩帧拖拽故障

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 压缩块与色块沿隐含运动方向被拖长，纹理像被拉走，部分边缘融入矩形拖尾。
**必要输入与条件：** 需要连续视频帧与压缩预测/运动信息；静帧只能模拟残影。
**区别与边界：** 区别于单帧块状错位；核心是时间与压缩运动残留。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/datamoshing)；固定详情快照 `effects/datamoshing.json`，SHA-256 `70594118ed2b7a0d5773288a0dd5499dde74282f1d935027c6a801f44fe47454`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:My_first_datamosh.webm)。

## atlas:day-for-night · 日景转夜景

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 降低曝光、把色温推向午夜蓝、压住天空亮度并加深阴影，同时保留主体细节和方向性日光的痕迹。
**必要输入与条件：** 需要控制天空、环境光和阴影关系；不能只加蓝色覆盖。
**区别与边界：** 日景模拟夜景不改变拍摄时刻，也不应让太阳光全部消失。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/day-for-night)；固定详情快照 `effects/day-for-night.json`，SHA-256 `ad62beadaccd21badbdaecbf85bd3dacda01d161d6d5b6ad77725b9fca3ca3b3`。
**Atlas 所列参考：** [原始参考页面](https://filmglossary.ccnmtl.columbia.edu/term/day-for-night/)。

## atlas:decalcomania · 转印颜料纹理

**视觉家族：** 插画媒材与笔触（`atlas-family:illustration-material`）。
**可见效果与关键机制：** 呈现压印颜料的分叉脉络、海绵状细胞斑块、厚颜料池与局部亮脊，综合色土绿、赭黄、奶油和深棕。
**必要输入与条件：** 需要有颜料压印的随机纹理和局部厚度。
**区别与边界：** 不是普通大理石纹或液体流动滤镜。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/decalcomania)；固定详情快照 `effects/decalcomania.json`，SHA-256 `a16e419733d3b7137443429134cd699a4bd7e364b88371a35fd54634c2249b60`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Decalcomanie-03_hg.jpg)。

## atlas:decorrelation-stretch · 颜色去相关拉伸

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 把原本接近的颜色差异拉开为鲜明青、洋红、黄、紫、绿，使低饱和表面内部细微色差更明显。
**必要输入与条件：** 用于增强光谱/通道差别，需保留对象轮廓。
**区别与边界：** 色彩变得夸张不等于真实颜色测量。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/decorrelation-stretch)；固定详情快照 `effects/decorrelation-stretch.json`，SHA-256 `5e2455c6d33e071822b408ee4750f222e89a9c0bcacd9bb191547615b2e2f83f`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Looking_Up_Architecture_(Unsplash).jpg)。

## atlas:deep-focus-photography · 全景深摄影

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 前景、中景和背景同时保持锐利，细纹理都能分辨；选择性焦外被压低，照明方向明确且层次干净。
**必要输入与条件：** 需要景深合成或足够光圈/景深条件。
**区别与边界：** 单张景深不足的素材需真实焦点堆栈，不靠全局锐化代替。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/deep-focus-photography)；固定详情快照 `effects/deep-focus-photography.json`，SHA-256 `eef2f559475d42b715f919c60ad38960a022f4d696ec7d7403009d86d7c85824`。
**Atlas 所列参考：** [原始参考页面](https://theasc.com/article/realism-for-citizen-kane/)。

## atlas:deep-fried-meme · 过度压缩网络迷因质感

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 极端饱和、压死阴影、刺亮黄白高光、粗压缩块和脆硬锐化光晕叠在一起，红橙可冲向霓虹。
**必要输入与条件：** 效果有意夸张，但主体仍需可辨。
**区别与边界：** 需避免把压缩故障当作真实图像来源或证据。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/deep-fried-meme)；固定详情快照 `effects/deep-fried-meme.json`，SHA-256 `bb6ace7b4834945a446811ef22f4bf16914f09ba084801e77328f5159acc5618`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Deep_fried_meme.jpg)。

## atlas:deepdream · 深度梦境与神经风格迁移

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** DeepDream反复放大网络已识别的纹理，眼睛、动物形状会在原图中层层递生；风格迁移则把另一张图的笔触统计带入内容图，两者方法不同。
**必要输入与条件：** 以有可识别纹理的图像为输入；DeepDream调迭代与尺度，风格迁移另需内容图和风格图。
**区别与边界：** 生成形态受模型特征与原图制约；风格迁移不是油画滤镜，DeepDream也不等同扩散文生图。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/deepdream)；固定详情快照 `effects/deepdream.json`，SHA-256 `f2f01d60f718779c32309513207928edaf48e4850d0d17da07d572650a87b6a6`。
**Atlas 所列参考：** [原始参考页面](https://research.google/blog/inceptionism-going-deeper-into-neural-networks/)。

## atlas:deepfake · 深度伪造与换脸

**视觉家族：** 人脸、人物追踪与变换（`atlas-family:portrait-tracking`）。
**可见效果与关键机制：** 既有影像中的身份或表情经人脸模型、几何变形或神经合成替换；换脸是身份交换任务，deepfake是更宽的统称。
**必要输入与条件：** 需源脸与目标视频，匹配姿态、光线并跟踪眼口和下颌；适合明确展示身份替换机制的近景。
**区别与边界：** 接缝、眼部反光和跨帧稳定性容易暴露合成；换脸、表情迁移与神经渲染不能混称同一种方法。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/deepfake)；固定详情快照 `effects/deepfake.json`，SHA-256 `93b3931385945152482d2e252151f8e3407fdcd1bc3c1626e41b54c7f22201cb`。
**Atlas 所列参考：** [原始参考页面](https://openaccess.thecvf.com/content_ICCV_2019/html/Rossler_FaceForensics_Learning_to_Detect_Manipulated_Facial_Images_ICCV_2019_paper.html)。

## atlas:delaunay-triangle-mosaic · 德洛内三角拼片

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 把采样点做德洛内三角剖分，再以各片采样色填充成无缝网格；强轮廓附近用小三角，平滑区域用大三角，保留原主体的概括形。
**必要输入与条件：** 需要图像颜色采样和可调采样点；点数决定细节，沿边缘加密可保住面部与物体轮廓。
**区别与边界：** 点过少会使身份和细节消失，点过多则接近原图；这是二维色片镶嵌，不是有体积的低模网格。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/delaunay-triangle-mosaic)；固定详情快照 `effects/delaunay-triangle-mosaic.json`，SHA-256 `2565d0855be1453c08c6a432b571cd090d16d7b9dd4802a8530e62a1657262f5`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Man_working_on_computer_(Unsplash).jpg)。

## atlas:depth-map-portrait · 深度图人像景深

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 用人像分割与估算深度控制模糊，主体脸部清晰、背景随距离渐虚；单纯人物蒙版只知道边界，不能表达人物前后的空间层次。
**必要输入与条件：** 需人像图及可靠深度估计或深度图；检查发丝、眼镜和身体前方物件的深度边界。
**区别与边界：** 深度错误会把发丝抹掉或让前景物件虚实反转；背景虚化是模拟光学效果，不会补出真实散景细节。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/depth-map-portrait)；固定详情快照 `effects/depth-map-portrait.json`，SHA-256 `c5d439b6625f181a60d8793c4b73cc73233870946c52524a45e20ac8f0a7ca4a`。
**Atlas 所列参考：** [原始参考页面](https://research.google/blog/portrait-mode-on-the-pixel-2-and-pixel-2-xl-smartphones/)。

## atlas:difference-of-gaussians · 高斯差分带通

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 将两种尺度的高斯模糊图相减，压低宽缓明暗和最细噪点，突出中等尺度纹理与明暗轮廓；其选频范围由两档模糊决定。
**必要输入与条件：** 需要灰度或彩色源图及两组不同模糊尺度；可用于纹理分析、轮廓显影或抽象质感。
**区别与边界：** 尺度相近会缺少分离感，过强会让噪声和光晕抢眼；它不是按方向检测边缘的 Sobel 算子。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/difference-of-gaussians)；固定详情快照 `effects/difference-of-gaussians.json`，SHA-256 `c387184a4864cc24165dff560e2692c709b120e3644515954ccb3be134d40894`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:digital-color-grading · 数字中间片调色

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 扫描胶片成为像素后，可用软件针对色相、区域和明暗分段调色，例如冷阴影、暖高光而保持肤色；比传统整体光学印片更可选择。
**必要输入与条件：** 以扫描或数字影像为源，先锁曝光与参考色，再用曲线、色彩分区或遮罩建立镜头间一致性。
**区别与边界：** 调色改变记录下来的颜色关系，不会重建现场光源；肤色、暗部与高光易互相污染，不能与全画面化学调色混为一谈。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/digital-color-grading)；固定详情快照 `effects/digital-color-grading.json`，SHA-256 `6f913bef16010b3f96df02b5a59028d7658fdcb31f2556802291320334b5d688`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Conjured_Memories_of_a_Grimm_Fairytale_Forest_I_-_Letterboxing.jpg)。

## atlas:digital-de-aging · 数字化年轻化

**视觉家族：** 人脸、人物追踪与变换（`atlas-family:portrait-tracking`）。
**可见效果与关键机制：** 逐帧调整演员面部几何并替换或修整皮肤纹理，使其接近年轻参考；靠人工建模和合成，不是自动换脸。
**必要输入与条件：** 需要清晰连续的面部素材、演员年轻时期参考及逐帧跟踪；重点核对嘴眼运动、侧脸和表情变化。
**区别与边界：** 嘴眼容易僵硬失重，皮肤次表面散射和肌肉动态难重现；高精度逐帧修整成本高，不能把皱纹抹平当作完整年轻化。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/digital-de-aging)；固定详情快照 `effects/digital-de-aging.json`，SHA-256 `777c68a6c73492172799ddbd328afc1f426fb6df0a1e6989ce54eee3abe47a46`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/De-aging_in_film_and_television)。

## atlas:digital-video-effects · 数字视频变形转场

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 数字帧缓存对画面像素做缩放、旋转、透视和位置重映射，再叠到背景上，形成漂浮屏幕、翻页或立体盒面；画面内容可继续运动。
**必要输入与条件：** 需要视频帧缓存、几何变换与合成层；可用于电视包装、画中画或空间化转场，先确定变形边界与背景。
**区别与边界：** 普通DVE改变的是平面影像的映射，不会自动生成真实三维物体；擦除转场只移动遮挡边界，可与DVE组合但原理不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/digital-video-effects)；固定详情快照 `effects/digital-video-effects.json`，SHA-256 `c40e62c731662f3ff98531a520b8f5e45f721aeacc34a4b2c36b0a50ac307287`。

## atlas:diorama-light-change · 透光布景昼夜变景

**视觉家族：** 实拍、舞台与模型特效（`atlas-family:practical-effects`）。
**可见效果与关键机制：** 在半透布景正反面绘制不同明暗细节，再切换前照与背照，让白昼渐变为夜景并显出隐藏图层；变化来自光穿过画布。
**必要输入与条件：** 需透光画布、正反面分层绘制、可控前后灯和遮光机构；适合可见实体布景的缓慢昼夜变化。
**区别与边界：** 依赖薄布与灯位，不是投影到空白幕布；背面的细节必须预先绘好，无法像数字合成那样任意逐物改动。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/diorama-light-change)；固定详情快照 `effects/diorama-light-change.json`，SHA-256 `278000f425ad2121d265ab2e2006516c803ce52d79a96d3dba4f24af4ad464ee`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Bry-sur-Marne_Diorama_de_Louis_Daguerre_01.jpg)。

## atlas:direct-animation-on-film · 胶片直接绘刮动画

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 逐格在透明胶片上涂绘，或刮去已曝光胶片的乳剂露出亮线，不经过摄影机；画面呈手工纹理、色块跳动与不稳定轮廓。
**必要输入与条件：** 需可处理的电影胶片、颜料或刻划工具，并按帧组织图形；放映时依赖胶片输送与光源。
**区别与边界：** 逐格手作劳动量大，形状难保持稳定，抖动是材料过程带来的特征；不同于在赛璐珞片上绘制再拍摄的传统动画。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/direct-animation-on-film)；固定详情快照 `effects/direct-animation-on-film.json`，SHA-256 `2091f703b716ff00bca451aff26b7d3c02c2edb70ed5c2fdb12733f682d08a67`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Mothlight_(1963)_title.jpg)。

## atlas:displacement-map · 置换贴图扭曲

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 把高度或噪声图当作位移场，按局部明暗偏移源图采样坐标，使轮廓产生起伏、错动和波纹；控制图决定扭曲发生在哪里。
**必要输入与条件：** 需要源图与独立位移贴图，校准贴图尺度、通道和位移幅度；适合局部表面波动或纹理扰动。
**区别与边界：** 位移过大可能拉裂边缘、露出空区或造成重复采样；二维贴图只改像素位置，不等同于真实几何变形。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/displacement-map)；固定详情快照 `effects/displacement-map.json`，SHA-256 `cffe6880aaea861fd1557e445b8c154b0ada02dd2bac2c8597e9ea7ea985a2c1`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:displacement-mapping · 置换映射

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 控制图的亮度推动图像坐标或网格顶点，形成纹理沟脊与表面弯曲；合成置换只移动像素，三维置换才改变几何。
**必要输入与条件：** 需灰度控制图与源图；二维合成调坐标偏移，材质映射则调UV或网格细分，需按目标决定实现路径。
**区别与边界：** 纯灰控制图只产生中性偏移，局部明暗变化才形成方向相反的起伏；凹凸/法线贴图只改光照，不应误称真实位移。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/displacement-mapping)；固定详情快照 `effects/displacement-mapping.json`，SHA-256 `12e3fad41e6fc4f58b7a9d08d5ab7bea63b5555abcb53b7912bf7bb6c9c89fbd`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Displacement_mapping_%E0%B8%81%E0%B8%82%E0%B8%84.png)。

## atlas:dissolve · 叠化转场

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 前一场景逐渐减弱、后一场景同时增强，在中点短暂重叠两段时间；这是随时间发生的转场，不是把多个主体永久叠在一帧里。
**必要输入与条件：** 需要前后两段影像和设定时长；可用于地点转换、时间流逝或记忆段落，按画面内容校准重叠点。
**区别与边界：** 过短近似闪换，过长会混淆主体；效果取决于前后镜头内容与时长，不能把叠化写成固定的梦幻滤镜。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/dissolve)；固定详情快照 `effects/dissolve.json`，SHA-256 `23942f087ab69525a38f02dc3219fb414d4256a7179f628990e47d9eaba42798`。
**Atlas 所列参考：** [原始参考页面](https://filmglossary.ccnmtl.columbia.edu/term/dissolve/)。

## atlas:dissolving-views · 双投影灯渐隐景

**视觉家族：** 实拍、舞台与模型特效（`atlas-family:practical-effects`）。
**可见效果与关键机制：** 两台魔术灯投影仪对准同一幕布，机械遮片一边压暗旧画、一边放亮新画，画面始终有光并连续换景。
**必要输入与条件：** 需两组对齐的幻灯片、重合镜头与可控遮片；适合实体投影演示或复现早期舞台景象。
**区别与边界：** 镜头不齐会出现双边重影，需同步控制两路亮度；与切黑再换片的幻灯片放映不同，不会中断照明。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/dissolving-views)；固定详情快照 `effects/dissolving-views.json`，SHA-256 `f24ef21a1f1680aed946ddd24d12056c897efa68d8a4cc25fb57004972d3bd0a`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Dissolving_views)。

## atlas:distance-fog · 基于距离的雾化

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 按相机深度把远景颜色和对比度混向统一雾色，近处仍清晰、远处逐渐融进背景；它改色与对比，不靠模糊边缘。
**必要输入与条件：** 需要场景深度或相机Z值、雾色和起止距离；用于三维场景远景融合或遮住有限绘制距离。
**区别与边界：** 普通深度雾不能表现局部雾团、烟柱或体积光，和景深模糊不同；起止范围设置不当会出现明显雾带或远景突变。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/distance-fog)；固定详情快照 `effects/distance-fog.json`，SHA-256 `76a7580c720f383f3e21c974651138775de6a8c8a4b4e5beeed2e60c4f8522a2`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Distance_fog)。

## atlas:distance-transform · 前景距离场

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 对二值前景内每个像素计算到最近背景零值的距离，再把边界向内的距离映成渐亮灰阶；亮度表达形状内部深浅，不是照片景深。
**必要输入与条件：** 输入需先有前景/背景掩码；调整距离度量与灰阶范围，可用于轮廓厚度、中心线或形状分析。
**区别与边界：** 掩码边缘决定距离场形状，漏分会生成错误亮带；输出不含物体真实远近，也不会自行找到语义主体。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/distance-transform)；固定详情快照 `effects/distance-transform.json`，SHA-256 `299359be37862608499e90b170986197bf4d508f0e8eff0b772dcc0d3480a31e`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:distortion-photography · 曲面镜像摄影变形

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 相机拍摄弯曲镜面中的倒影，因各处反射角与放大率不同，肢体被拉长、鼓起或压扁，但纹理和边缘仍可清晰。
**必要输入与条件：** 需弯曲或波纹反射面与相机；改变镜面朝向、距离和主体位置，可把变形集中在指定区域。
**区别与边界：** 这是曝光时记录的光学几何变化，不是重叠曝光或运动拖影；镜面曲率过强会让身体失去可辨形态。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/distortion-photography)；固定详情快照 `effects/distortion-photography.json`，SHA-256 `02182bb51504b27d405ff7ca66cde235aafa6045370afb31d4e9355d2d6009f3`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:V%C4%9Btru%C5%A1e,_zrcadlov%C3%A9_bludi%C5%A1t%C4%9B.jpg)。

## atlas:dolly-zoom · 推拉变焦

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 摄影机前后移动同时反向变焦，让中心主体大致保持同尺寸，而背景透视关系明显伸展或收缩；空间压缩感来自机位移动。
**必要输入与条件：** 需要连续镜头中的摄影机位移和反向变焦；楼梯、走廊或有远近参照的纵深线能显示空间变化。
**区别与边界：** 只改焦距的普通变焦不会改变透视；静帧径向拉伸也不能代替真实机位运动。主体距离和焦段需协同校准。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/dolly-zoom)；固定详情快照 `effects/dolly-zoom.json`，SHA-256 `f6900226bfdac14bd732b257f10f7ee6cc60ffc0d29dd9033892cefc43c18dd0`。
**Atlas 所列参考：** [原始参考页面](https://theasc.com/article/flashback-vertigo/)。

## atlas:dot-matrix-printout · 针式点阵打印

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 打印头针脚撞击色带，在连续纸上按规则点阵拼出字和图；弧线呈阶梯，墨点轻重不一。半调印刷通常靠网点面积模拟色阶，原理不同。
**必要输入与条件：** 需离散点阵字图、等距行列、连续纸与色带痕迹；可用于收据、终端输出或早期计算机画面复现。
**区别与边界：** 粗网格会牺牲曲线平滑与细节；不应把针击形成字符的点阵直接叫作印刷半调网点。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/dot-matrix-printout)；固定详情快照 `effects/dot-matrix-printout.json`，SHA-256 `5590f6f4e497628ff99612a16268c9578cab7e00b7520a42186fca57e3e655d8`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Dot_matrix_printing)。

## atlas:double-exposure · 双重曝光

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 在同一感光载体上多次曝光，使较弱的一次像半透明地穿入另一个场景；两套轮廓和纹理并占一张图，不等同于随时间换场的叠化。
**必要输入与条件：** 可复现为胶片多次曝光，或以两张对位影像控制透明度合成；选择能共同表达记忆、重影或空间叠合的主体。
**区别与边界：** 历史灵异照片属于图像处理现象，不证明超自然；个别早期图像的具体制作手法仍不确定。重叠易遮掉主体轮廓。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/double-exposure)；固定详情快照 `effects/double-exposure.json`，SHA-256 `327158d127bc3e66c0a0008009c009c4d0a2a2c80c4a80fdd8c8ddbc2ea81596`。
**Atlas 所列参考：** [原始参考页面](https://www.metmuseum.org/art/collection/search/296300)。

## atlas:droste-recursion · 德罗斯特递归

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 把图像经连续映射卷入自身，让画面内嵌越来越小的同一画面并螺旋向中心；区别于并排拼贴，重复结构在坐标变换中递归。
**必要输入与条件：** 需要边框或易辨认的主体图案作为缩入线索；设置递归中心、旋转方向、缩放比例和停止尺度。
**区别与边界：** 源图没有稳定重复纹理时递归会难以辨认；无限效果只能用有限分辨率与层数近似，中心裁切和畸变需控制。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/droste-recursion)；固定详情快照 `effects/droste-recursion.json`，SHA-256 `7aefaaf9c23961574a422cba9c17e2767dc3535e1aebc18d2aa56dd02d538894`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Thick_pine_forest_(Unsplash).jpg)。

## atlas:dunning-process · 邓宁摄影合成法

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 黄光照亮演员、演员站在蓝幕前，机内让黄色染料正片按背景影像滤掉蓝光，再把前后景一次曝光合成黑白画面。
**必要输入与条件：** 复现需蓝色背景、黄色前景照明、黄色染料正片、负片和机内套合；剪影边缘与照明必须精确配合。
**区别与边界：** 这是摄影机内的光学合成，不是后期数字抠像；色材或套准误差会留下边缘晕线，最终效果为黑白。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/dunning-process)；固定详情快照 `effects/dunning-process.json`，SHA-256 `b2c2795fc0e00c8efd1f1d9d64b36cf29b5dfe94f467909c4349238fb38bcec2`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Matte_(filmmaking))。

## atlas:duotone · 双色调印刷与模拟

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 用两种油墨分担阴影和亮部，让单色照片产生稳定的双色层次；RGB滤镜也可做近似观感，但不会生成真实的两套印刷分色。
**必要输入与条件：** 印刷需制作两色分版并分别控制浓度；数字设计则明确选定两端颜色和中间调映射。
**区别与边界：** 颜色通道与印刷分版是两种生产方法；两色不能保留完整自然色信息，暗部和亮部的混色关系要先校样。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/duotone)；固定详情快照 `effects/duotone.json`，SHA-256 `92f1182f6c6c755c62a614391a4d9ae8dbdb9314004a0ac624844d77a10419fb`。
**Atlas 所列参考：** [原始参考页面](https://helpx.adobe.com/photoshop/using/duotones.html)。

## atlas:duotone-mapping · 双色渐变映射

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 按像素亮度把整幅图映射到两端指定颜色之间，原有明暗层次仍在、自然色相被压成双色渐变；属于数字色彩映射。
**必要输入与条件：** 需亮度范围稳定的图像，并分别指定暗部色与亮部色；调中间调插值以兼顾轮廓和层次。
**区别与边界：** 双色限制会丢失原本不同色相的线索；这是 RGB 数字效果，不等同于真正双色印刷的分色与两块油墨。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/duotone-mapping)；固定详情快照 `effects/duotone-mapping.json`，SHA-256 `6d03936862e55f074df6e3125ac27a0bfb8b8fe511eaede0e8bd088ca40a50a3`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:dutch-angle · 倾斜机位

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 摄影机绕镜头视线轴旋转，使水平线倾斜、垂直线一起偏斜；这是整体画面取向变化，不是透视扭曲。
**必要输入与条件：** 选择要倾斜的地平线或建筑垂线，并留出旋转后边角的补画或裁切空间。
**区别与边界：** 倾斜本身不自动表示紧张、幽默或失衡；若画面本应水平，需区分有意构图与机位不正。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/dutch-angle)；固定详情快照 `effects/dutch-angle.json`，SHA-256 `28072ee81fa48c3dcb1be1dd3892103050d2040980a3bc8fe3492ef608a90bc4`。
**Atlas 所列参考：** [原始参考页面](https://filmglossary.ccnmtl.columbia.edu/term/canted-angle-dutch-angle/)。

## atlas:dynamation · Dynamation 前景遮挡合成

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 将定格模型与后投影实景逐格拍摄，再用分屏遮罩和多次曝光让现场前景挡住模型，产生模型真正进入实景纵深的遮挡关系。
**必要输入与条件：** 需要模型逐格动画、后投影背景、分区遮罩及精准曝光；让模型经过前景遮挡物时最能显示空间嵌入。
**区别与边界：** 比单纯把演员放在后投影前多了遮罩与多次曝光，制作与套准复杂，逐格运动也会显出步进感。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/dynamation)；固定详情快照 `effects/dynamation.json`，SHA-256 `b6d5bc9c996a99179b71f7fb0eb2f23efb5130b42a6fff27a6d416e094f1f221`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:20_million_miles_to_earth_(1957)_Ymir.png)。

## atlas:emboss · 浮雕式边缘滤镜

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 把相邻像素的亮度差转成定向亮暗边，使照片像压在灰色底材上的浅浮雕；视觉凸起来自光影编码而非实体压纹。
**必要输入与条件：** 使用含清楚轮廓的图像，设定浮雕角度、边缘强度与灰底；细纹理可保留为浅刻痕。
**区别与边界：** 没有真实凹凸几何或印刷压痕；旋转模拟光向可能反转凸凹，过强会让细节变成重复边线。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/emboss)；固定详情快照 `effects/emboss.json`，SHA-256 `02e1bde30f4acf1225f36dd6951b11e23f4e8e338007dc1b7d3356023cb02e49`。
**Atlas 所列参考：** [原始参考页面](https://docs.gimp.org/2.4/en/)。

## atlas:emboss-2 · 方向性浮雕滤镜

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 对局部亮度差作有方向的明暗折叠，把原图轮廓变为灰色浅浮雕，并以一侧亮边、另一侧暗边暗示凸起。
**必要输入与条件：** 输入含可辨边缘与纹理；设置模拟光照方向和核强度，适合技术示意或表面纹理化。
**区别与边界：** 仅计算边缘明暗，并未改变实际表面几何；方向翻转会让凸凹观感反转，也可能放大噪声。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/emboss-2)；固定详情快照 `effects/emboss-2.json`，SHA-256 `9a15b3e597530346397c3d6a070efcb4282ba3dffc71ead33348462ea7475dcc`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:false-color-infrared · 假彩色红外影像

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 把近红外反射分配到可见色通道，使植被显红或洋红、天空偏青、深色水体近黑；颜色代表波段信号，不是对象本色或温度。
**必要输入与条件：** 优先使用红外胶片、红外传感或多波段数据；数字近似需明确通道重映射，并保留波段对应说明。
**区别与边界：** 普通彩色照片套红滤镜不是红外记录；红树冠单一特征不能证明用了红外，模拟色彩也不具测温含义。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/false-color-infrared)；固定详情快照 `effects/false-color-infrared.json`，SHA-256 `eac280d54da527eadf11836e2826099ca692a8d1d37b7b828891a3618fa14b06`。
**Atlas 所列参考：** [原始参考页面](https://www.kodak.com/content/pdfs/amc/Specifications-and-Characteristics-of-KODAK-Aerial-Films-datasheet-EN.pdf)。

## atlas:fast-corners · FAST 角点检测

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 检测中心像素周围圆环上是否连续出现明显更亮或更暗的一段，据此标出角点与纹理交汇处；输出是稀疏特征点，不是主体识别框。
**必要输入与条件：** 需有局部纹理和灰度差的图像；调整环上连续点数及亮度阈值，可控制标记密度。
**区别与边界：** 柔和阴影和无纹理平面会少检，阈值过低会误标噪点；角点只表示局部结构，不说明它属于哪个对象。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/fast-corners)；固定详情快照 `effects/fast-corners.json`，SHA-256 `0e06d2d3debe09eb685efbef2009dcb80af83549bfbc9988f64d22030ba91977`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Monochrome_yin_yang_coffee_(Unsplash).jpg)。

## atlas:film-colorization · 黑白影片逐区上色

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 先保留黑白影像的明暗，再对逐帧区域赋色并将选择延续到连续画面；色彩是后加解释，不是原拍摄时记录下来的颜色。
**必要输入与条件：** 需黑白连续素材、区域选色与帧间跟踪；可查服装、场景或档案参照，也要标明无法核实处的推断。
**区别与边界：** 灰阶通常不能唯一还原原色，肤色和物体颜色有解释性；逐帧区域漂移会造成闪烁，区别于彩色胶片拍摄或整片染色。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/film-colorization)；固定详情快照 `effects/film-colorization.json`，SHA-256 `c59d5531c11460827a04aaea813ed213b62c008fe5df00eb2a606bca74762387`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:A_frame_depicting_Thomas_Hutter_from_moonflix.com_colorization_of_Nosferatu_(1922).jpg)。

## atlas:film-grain · 胶片颗粒

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 胶片显影后银粒或染料云形成不规则细颗粒，放大后可见，缩小观看则融入影像质感；它不是数码噪点或JPEG方块。
**必要输入与条件：** 以乳剂扫描或数字影像为底，按颗粒尺度、密度和明暗分布叠加；先在100%与目标小画幅同时检查。
**区别与边界：** 扫描锐化、压缩和曝光都会改变颗粒观感；全图均匀撒噪声不能自动模拟银盐或染料云结构。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/film-grain)；固定详情快照 `effects/film-grain.json`，SHA-256 `74c3dba62ab64f2592629e05aa4553b06932836c55280b9bf3b7a5959a7ada90`。
**Atlas 所列参考：** [原始参考页面](https://www.kodak.com/content/products-brochures/Film/kodak-essential-reference-guide-for-filmmakers.pdf)。

## atlas:film-noir-lighting · 黑色电影硬光

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 用未经柔化的硬光制造刺眼亮面和深黑阴影，百叶窗等遮挡物投下清楚条纹；关键是少补光形成的明暗切割，不只是黑白调色。
**必要输入与条件：** 需要硬光源、斜侧或逆向布光及旗板遮光；可让影纹落在墙面或脸部，但需保留表情辨认。
**区别与边界：** 补光过多会削弱黑影层次，条纹遮眼会损害阅读；硬光布景与三点柔光的均匀照明逻辑不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/film-noir-lighting)；固定详情快照 `effects/film-noir-lighting.json`，SHA-256 `ab40859ce529d9bb9eeaa513e647659db8be20f99dcdebe822ebf54384ec7897`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Self-Portrait_-16_(2757064302).jpg)。

## atlas:film-tinting · 早期胶片染色

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 对已显影黑白胶片的明亮明胶区域染上整片单一色调，密实暗部仍接近黑；不是给每个物体分别涂色。
**必要输入与条件：** 历史复现可用黑白片加均匀色层，或以数字方式统一染亮部；蓝色常用于模拟夜景，具体含义须看影片语境。
**区别与边界：** 整帧同色会压缩原有色彩差异；与把暗部银影换色的调色不同，也不同于逐物体手工着色。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/film-tinting)；固定详情快照 `effects/film-tinting.json`，SHA-256 `b1ef575e3a5db40f57068bbb8214bf8393bff6cd10c2dbafb8ab3aa1ef0cae54`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Yellow_tinted_nitrate_base.jpg)。

## atlas:fisheye-distortion · 数字鱼眼畸变

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 用径向坐标变换令中心鼓起、边缘压缩并使直线弯曲，模拟超广角鱼眼；这是对像素的后期扭曲。
**必要输入与条件：** 以有直线参照的图像测试中心与边缘的弯曲量；设定变形中心和径向强度后再检查画面边缘。
**区别与边界：** 边缘拉伸会改变比例并可能露出空角；数字畸变不等于鱼眼镜头的光学投影与取景范围。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/fisheye-distortion)；固定详情快照 `effects/fisheye-distortion.json`，SHA-256 `2005767d287439faa5a2c1e5163c8b62b932cdc7d568b986566fcd3f339270ec`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:fisheye-lens · 鱼眼镜头投影

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 超广视角通过特定投影保留大范围场景，画面边缘直线弯曲、中心区域显大；不是简单使用更短焦距的直线广角镜。
**必要输入与条件：** 需鱼眼光学或对应投影模型；把地平线、建筑线分别放在画面中心和边缘比较其弯曲变化。
**区别与边界：** 不同设计可形成圆形像场或填满矩形画幅；穿过画面中心的线在常见投影中可能仍较直，不能一概做球面膨胀。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/fisheye-lens)；固定详情快照 `effects/fisheye-lens.json`，SHA-256 `36c3139d42570e4780b23024d13ab990bf820e202929f0333466d8f81d426fcb`。
**Atlas 所列参考：** [原始参考页面](https://imaging.nikon.com/imaging/information/chronicle/history-f/)。

## atlas:flash-powder-photography · 镁粉闪光摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 早期摄影用瞬时强烈的正面闪光照亮暗室，冻结惊讶表情并留下硬阴影；原始闪光粉燃烧会有烟尘和火灾风险。
**必要输入与条件：** 生产复现使用数字闪光、历史器材影像或专业受控资料；可通过骤亮、硬阴影和暗背景表现瞬间曝光。
**区别与边界：** 历史化学闪光不是现代电子闪光；不可为复现效果自行引燃闪光粉，数字模拟也不会产生真实烟尘与曝光过程。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/flash-powder-photography)；固定详情快照 `effects/flash-powder-photography.json`，SHA-256 `2e3cef6f5e712811d505f0fc28ceb896f8dd99f15d029fad4a820ae6dded658d`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:One_of_four_pedlars_who_slept_in_the_celler_of_11_Ludlow_Street_rear.jpg)。

## atlas:flat-design · 扁平化设计

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 用纯色块、简化图标、清楚字体层级和留白组织界面，不靠渐变、材质、浮雕或投影塑造实体感；层级来自对比、尺寸与对齐。
**必要输入与条件：** 需要清楚的图标轮廓、统一色块、间距和文字层级；按钮若无立体线索，要用标签或边界说明其可操作性。
**区别与边界：** 扁平化不等于极简，也不要求内容少或只能用少数颜色；去掉阴影后若缺少点击线索，界面交互可能难以辨认。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/flat-design)；固定详情快照 `effects/flat-design.json`，SHA-256 `2fb3cd208d931453654bec75002b413d0132bfdae65e2df76bddf6d67926f54f`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:American_football_icon_simple_flat.svg)。

## atlas:flicker-film · 闪烁电影

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 按时间快速交替明暗甚至黑白帧，使脉冲节奏本身成为影像内容，观众可能感到不存在于单帧中的颜色或图案；静帧不能复现此效应。
**必要输入与条件：** 需明确帧序、亮度差和持续时间；先以静态序列预览节奏，正式播放应限制频率并核查观众安全。
**区别与边界：** 强烈闪烁可能诱发光敏不适或癫痫风险；普通放映机闪烁是设备副作用，不能与按帧组织的创作性闪烁混为一谈。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/flicker-film)；固定详情快照 `effects/flicker-film.json`，SHA-256 `b5df25ff0f270114125239ac0e05e9b3bb92c367da9519edde3d4c647c10a6f1`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Structural_film)。

## atlas:flip-book · 翻页动画书

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 每一页画出动作的一帧，拇指快速释放纸页后形成连续运动；页间位移决定动作，翻页速度带来停顿、跳跃或短促闪烁。
**必要输入与条件：** 按动作顺序准备多张略有差别的图，固定装订边并控制翻页节奏；适合手持近景或作为逐帧动画的实物呈现。
**区别与边界：** 帧数少或翻页不匀会显得断续；它依靠连续纸页，不同于在带狭缝旋转鼓内观看的西洋镜。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/flip-book)；固定详情快照 `effects/flip-book.json`，SHA-256 `c0cd853193df1060f4fa3205ee83ccd2038dce22b94ea9b056557314ce8640b3`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Filmmuseum_Berlin_-_Max_Skladanowsky_Flip_Book.jpg)。

## atlas:flood-fill · 边界容差填充

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 从种子像素向相邻像素扩展，只把颜色落在容差范围内的连通区域改成统一色块；停止位置由边界色差和连通性共同决定。
**必要输入与条件：** 需选定种子点、目标色和颜色容差；用有闭合边界的图像检查填充范围，可作为蒙版或区域着色操作。
**区别与边界：** 边界有裂缝会使填充外溢，容差过小则留下孔洞；它只处理连通相似像素，不是全图调色或语义分割。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/flood-fill)；固定详情快照 `effects/flood-fill.json`，SHA-256 `a43a9f61a78077d9cc7a9083a3a0c68d42d177bfb903d5eb9c9135ffba735254`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Verrazzano-Narrows_Bridge_at_night_by_Johnny_Lam,_2013_(Unsplash).jpg)。

## atlas:floydsteinberg-dither · 弗洛伊德—斯坦伯格误差扩散抖色

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 颜色量化后把像素取整误差分配给邻近像素，以不规则黑白点密度模拟灰阶；与按固定矩阵排列的有序抖色不同。
**必要输入与条件：** 先限定输出色数或黑白阈值，再逐像素扩散量化误差；保留轮廓和大面积明暗时比只缩小像素更有效。
**区别与边界：** 点状纹理可能呈方向性虫纹，细节和边缘会受误差传播影响；它用像素分布近似连续色调，不是照片颗粒。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/floydsteinberg-dither)；固定详情快照 `effects/floydsteinberg-dither.json`，SHA-256 `5e49cf86fca38ba4f683144dca355481cb4ec0919c9b72a5afe08b9c635b08f1`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:fluid-simulation · 流体数值模拟

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 让水、烟或火的状态按时间演化，形成连续流动、旋涡、飞溅和碎滴；变化来自计算出来的运动状态，不是逐帧手绘形状。
**必要输入与条件：** 需要连续时间的模拟输入和场景边界，设置流动、碰撞及与现有物体的关系；按镜头尺度决定观察水面、烟团或飞溅。
**区别与边界：** 复杂相互作用会增加计算成本；模拟只近似物理行为，边界、尺度或运动参数不合适会显得像黏液、粒子团或穿透物体。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/fluid-simulation)；固定详情快照 `effects/fluid-simulation.json`，SHA-256 `3d684fefa06175024aae3ad174f9fa407fe098334826e16e6b4e85e322199f53`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Render_final.png)。

## atlas:focus-stacking · 焦点堆栈

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 在不同对焦距离拍摄多张，再对齐并合并各帧清晰区域，让微小主体从近处到远处都清楚，同时仍可保留背景虚化。
**必要输入与条件：** 需同一静止主体的多个焦平面影像；保持构图和曝光稳定，先检查花蕊、昆虫触角等细小边界。
**区别与边界：** 主体或背景移动会造成重影、错边和融合接缝；不同于单次小光圈增加景深，堆栈也不能让每张原片本身更锐。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/focus-stacking)；固定详情快照 `effects/focus-stacking.json`，SHA-256 `e56d70ef913136d68274d61ad7aa3102cdfc99c903b9fb75441cce3f6edc7642`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Amegilla_stantoni,_f,_face,_Los_Banos_2021-11-10-18.57.33_ZS_PMax_UDR_copy_-_Flickr_-_Sam_Droege.jpg)。

## atlas:forced-perspective · 强制透视

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 通过主体与背景的距离、相对尺度和相机视线，制造巨大或微小的错觉；两者看似同处一个空间，其实景深与比例被布置。
**必要输入与条件：** 需预先安排演员、道具、缩放布景和固定机位；从目标观看角度检查轮廓重合与遮挡关系。
**区别与边界：** 横向移动相机、改变眼高或观看角度会暴露视差和尺度差；效果只在指定视点成立，不等于真实改变物体大小。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/forced-perspective)；固定详情快照 `effects/forced-perspective.json`，SHA-256 `8e38b0d22fc893e25bd3d047d208f9a77d55e174044926d418d38358cc08c944`。
**Atlas 所列参考：** [原始参考页面](https://d23.com/8-magical-facts-about-walt-disneys-darby-ogill-and-the-little-people/)。

## atlas:forward-diffusion-noising · 前向扩散加噪

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 按噪声日程逐步削弱图像信号并加入高斯噪声，轮廓、颜色和细节随步数被随机噪点淹没；这是扩散过程的经典计算示意，不需要训练模型。
**必要输入与条件：** 需要图像、噪声强度/步数和随机种子；并排观察多个时间步，区分早期细节消失与后期近噪声状态。
**区别与边界：** 过程会不可逆地损失可见信息，单帧只能显示某一步；不等同于模型生成图像时的反向去噪。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/forward-diffusion-noising)；固定详情快照 `effects/forward-diffusion-noising.json`，SHA-256 `088655de05adcc1f72d1d3c721cbfc37ef30c1f8b01013d2b5e17eec8baa8b91`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Bumper_cars_festival_(Unsplash).jpg)。

## atlas:fourier-high-pass-filter · 傅里叶高通滤波

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 将图像变换到频域并抑制低频分量，宽缓光照和大色块退去，细纹理与锐利边界占主导；不同于只在局部像素邻域计算的拉普拉斯滤波。
**必要输入与条件：** 需二维图像及截止半径/过渡带设置；观察频谱掩模如何留下发丝、颗粒与边界。
**区别与边界：** 截止范围过高会带回更多背景起伏，过低则连主体细节一起压掉；高频增强也会突出压缩噪声。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/fourier-high-pass-filter)；固定详情快照 `effects/fourier-high-pass-filter.json`，SHA-256 `5fb7585bab8ca93adf150c4e5aac8809839a35b1fe4042f8f637a6933e7d347c`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:fourier-low-pass-filter · 傅里叶低通滤波

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 在频域压制高频后，细纹理、颗粒和锐边消失，保留宽大的轮廓与色调团块；滤波半径决定平滑程度。
**必要输入与条件：** 输入图像后设定频域半径与过渡锐度；适合去细节、概括形状或制作柔和色块。
**区别与边界：** 半径过小会抹去关键轮廓，边缘可出现振铃；这不是按局部模糊核处理，需注意频域周期边界假设。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/fourier-low-pass-filter)；固定详情快照 `effects/fourier-low-pass-filter.json`，SHA-256 `9ad1c75bffe71fa8e6e3d6acb1a75871ffd104808a3a079a55a1eeac8e56e25c`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:fourier-magnitude-spectrum · 二维傅里叶幅度谱

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 把二维图像的空间频率幅度移到可视画面，中心聚集低频、外围表示较细结构；谱图对称方向可显出图像中占主导的线条方向。
**必要输入与条件：** 需要二维图像并计算傅里叶变换，显示前通常将零频移到中心并压缩动态范围。
**区别与边界：** 幅度谱不保留相位，不能单独还原原图；中央亮点和星纹是频率分布可视化，不是拍摄到的星形光斑。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/fourier-magnitude-spectrum)；固定详情快照 `effects/fourier-magnitude-spectrum.json`，SHA-256 `f741f31b908456e28279ad6f94debc24e79218fe85abf57279ca302db696136c`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:fractal-flames · 分形火焰

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 随机抽取非线性变换反复迭代点位置，再以访问密度绘出发光丝带、分叉扇形和螺旋；亮度映射让稀疏细线与密集亮结共存。
**必要输入与条件：** 需迭代变换组合、随机采样、密度图与对数亮度映射；调整变换和配色可改变丝带结构与层级。
**区别与边界：** 密度统计和色映射形成的是数学图样，不是真火焰或火光散射；参数改变可能让分支结构和随机种子大幅变化。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/fractal-flames)；固定详情快照 `effects/fractal-flames.json`，SHA-256 `16f725d912a5485b67264203103402977163fc16e7bc28fd62eb83d096c0af87`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Lines_Apophysis_Fractal_Flame.jpg)。

## atlas:fractal-landscape · 分形地形

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 递归细分三角面并随机抬高顶点，形成从山脊到碎石在不同尺度呼应的粗糙地形；与手绘背景不同，可构成供虚拟相机穿行的三维场景。
**必要输入与条件：** 需要地形网格、随机高度或分形噪声及光照；设置细分层数与尺度，按镜头视距控制细节。
**区别与边界：** 随机粗糙不等于真实地质结构，细分过多会增大几何量；若只做二维拼贴，就没有可穿行的三维表面。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/fractal-landscape)；固定详情快照 `effects/fractal-landscape.json`，SHA-256 `639657f065410d83913472d70e31efb3d116c32434d86732aed25505449b7ccc`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Fractal_terrain.jpg)。

## atlas:frame-differencing · 帧差检测

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 把时间上相邻的两帧逐像素相减，静止区域趋暗、发生变化的边缘亮起；它只显示变化量，不推断物体朝哪个方向移动。
**必要输入与条件：** 需要时间相邻且几何对齐的两帧；控制间隔并可视化差值阈值，观察运动轮廓或场景变化。
**区别与边界：** 相机抖动、闪光和噪声会让全画面都亮；无位移信息时不能把帧差结果当作光流或物体轨迹。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/frame-differencing)；固定详情快照 `effects/frame-differencing.json`，SHA-256 `73a82d98712ccf5f581b431518ea068afa0b16a1a5c8d3c227483c12b09948ec`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:frame-interpolation · 视频中间帧插值

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 从前后两帧估计一张中间时刻画面，常由光流或神经帧模型推断边缘如何移动；生成的是未实际拍摄的时间样本。
**必要输入与条件：** 要生成真实插帧，需时间相邻的源帧和目标时刻，并检查轮廓、遮挡与细纹理；讲解示意可用两张绘制状态展示中间变化，但不要称为模型推理结果。
**区别与边界：** 遮挡后新露出的内容没有真实观测，模型可能拉伸、重影或生成错误边缘；示意性静帧不能证明任何特定模型推理。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/frame-interpolation)；固定详情快照 `effects/frame-interpolation.json`，SHA-256 `21879105e8796a51d14a43dff3699228d11600e37446a1c76be49780c200dbec`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:frangi-ridge-filter · Frangi 管状脊线滤波

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 跨多个尺度计算局部 Hessian 矩阵的特征值，突出细长管状或分支脊线、压低平面和圆斑；响应极性决定显示亮脊还是暗脊。
**必要输入与条件：** 输入需包含目标尺度的血管、枝条或丝状结构；调尺度范围、极性和响应阈值以区分细线与粗分支。
**区别与边界：** 它测局部形状相似度，不识别结构的语义，也不等于真正分割血管；尺度选错会漏掉过细或过粗结构。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/frangi-ridge-filter)；固定详情快照 `effects/frangi-ridge-filter.json`，SHA-256 `1ea312cbd0025d51b882bcb92e65558b386b463d313b57c245f0bc024f35f20a`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Deep_Wild_Green_(Unsplash).jpg)。

## atlas:freelensing · 脱镜移轴摄影

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 镜头暂时脱离机身并轻微倾斜，改变焦平面，使一条清晰区域斜穿主体、其余部分柔焦；卡口漏光可能出现，但不是必要特征。
**必要输入与条件：** 需可拆镜头与稳定的机身/主体；在干净环境谨慎改变倾角，先观察焦平面，再决定是否保留漏光。
**区别与边界：** 对焦与光线难重复，开放卡口可能进尘；移轴镜可控且闭合卡口，不能把两种方式混为一谈。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/freelensing)；固定详情快照 `effects/freelensing.json`，SHA-256 `ff7d02029afab90b1d89512d1dd9109a98c47db1e4ffbb86c0ae2edb818ed859`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Nikki_...again_(5296923025).jpg)。

## atlas:freeze-frame · 冻结单帧

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 把动作某一帧重复铺在时间轴上，让连续影像突然停成静止图；原帧中的运动模糊仍然保留。
**必要输入与条件：** 选择动作信息清楚的单帧并延长其显示时段；如复现传统胶片可说明光学打印与拷贝颗粒变化。
**区别与边界：** 冻结不会恢复被运动模糊遮掉的细节；影片复制帧是制作结果，播放器暂停则是观看控制，两者来源不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/freeze-frame)；固定详情快照 `effects/freeze-frame.json`，SHA-256 `5361da30194404e221f7e5f9ee9515f793c5d056367931cc7e59124e7328c1c6`。

## atlas:front-projection · 正投影背景合成

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 投影机与摄影机近似共轴，经分光镜将背景打到逆反射幕布上，让演员前方投射的景物与实拍前景在机内结合。
**必要输入与条件：** 需匹配投影机/摄影机视线、逆反射幕和分光组件；固定镜位并分别检查演员边缘与背景清晰度。
**区别与边界：** 普通把投影仪放在演员前方不能得到同样合成；镜头角度、幕材质和光线不配会造成阴影或背景失真。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/front-projection)；固定详情快照 `effects/front-projection.json`，SHA-256 `707c643714118684f48b917ea70771a0c349587cf9d7d32e356fa90cc3ee33b9`。
**Atlas 所列参考：** [原始参考页面](https://theasc.com/article/filming-2001-a-space-odyssey/)。

## atlas:frosted-glass · 磨砂玻璃散射

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 先随机扰动邻近像素采样位置再模糊，形成透过粗糙半透明玻璃观看的颗粒散射、软边和云状高光。
**必要输入与条件：** 以图像为输入，控制位移噪声强度与模糊半径；让纹理细节逐步从轻雾到重磨砂变化。
**区别与边界：** 数字像素扰动不模拟完整光线折射；强度过高会抹平文字和轮廓，不能误认为真实玻璃的厚度或折射率计算。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/frosted-glass)；固定详情快照 `effects/frosted-glass.json`，SHA-256 `54169cc8610b9a6405fd62584eca87baddbaf1173214812c697540ddd5605c20`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Portrait_of_elderly_woman_(Unsplash).jpg)。

## atlas:frutiger-aero · Frutiger Aero 视觉风格

**视觉家族：** 插画媒材与笔触（`atlas-family:illustration-material`）。
**可见效果与关键机制：** 以明亮天空、草地、青蓝水滴、透明玻璃板和圆润图标组成乐观的数码视觉；高光、渐变与透明叠加营造光亮塑料和玻璃感。
**必要输入与条件：** 需把清新自然背景、圆角界面、透明层和明确白色高光放在同一调性中；气泡或面板适合做视觉锚点。
**区别与边界：** 外观借助渐变、模糊和高光暗示材质，不一定计算真实光学；与拟物化有重叠，但重点是亮泽表面和理想化自然场景。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/frutiger-aero)；固定详情快照 `effects/frutiger-aero.json`，SHA-256 `fc6ca76dc3dfed2faf2870c1df5a1d2e19739e2f2b5bff8933827ea2e8de50d8`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Frutiger_Aero_Composite.jpg)。

## atlas:fumage · 烟熏积炭绘画

**视觉家族：** 实拍、舞台与模型特效（`atlas-family:practical-effects`）。
**可见效果与关键机制：** 灯火产生的烟炱沉积在纸或画布上，留下半透明卷云、羽化黑边和可擦开的高光；形状由真实碳层构成，不是柔化笔触。
**必要输入与条件：** 需可沉积并固定碳粉的表面；实物制作需受控防火并固定易抹落的烟炱，也可用数字材质复现烟熏纹理。
**区别与边界：** 碳层容易被触碰破坏，需使用兼容底材并固色；它不同于以柔软笔触过渡边缘的 sfumato。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/fumage)；固定详情快照 `effects/fumage.json`，SHA-256 `1f6978a714c7b30c7f55def592c4a1b7178b9c26a5fe5590b46d1e4d05a0d37f`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Factory_Smoke_MET_MM70517.jpg)。

## atlas:fur-simulation · 毛发动力模拟

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 把每根毛发表示为带连接点的柔性曲线，再随风和角色运动计算摆动；成束、受光和根部阴影让毛发从平面贴图变成动态结构。
**必要输入与条件：** 需要带毛发的三维角色、毛发长度/密度分布和风力或运动输入；先核对主体轮廓、光泽方向与遮挡。
**区别与边界：** 高密度发丝会增加计算和渲染成本；贴图只画静态毛面，不具备逐束运动、互相遮挡或真实发丝阴影。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/fur-simulation)；固定详情快照 `effects/fur-simulation.json`，SHA-256 `620c2c50cad9f3c70abe7bf5f568b3ce0e992a0006cd894e468c0d84278e7849`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Blender3D_huelle_alles_zusammen.jpg)。

## atlas:gabor-filter-bank · Gabor 多方向滤波组

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 并行施加不同方向和空间频率的 Gabor 核，把图像拆成角度与纹理尺度响应层；各层突出的线条方向不同。
**必要输入与条件：** 需图像及一组方向、波长/频率和带宽参数；并排标注水平、垂直、斜向响应，便于比较纹理。
**区别与边界：** 响应表示局部纹理与方向，不是语义对象分割；角度或波长选得不合适会漏掉目标纹理或把噪声突出。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/gabor-filter-bank)；固定详情快照 `effects/gabor-filter-bank.json`，SHA-256 `0b4fb2af47a16f24fc6078e65ed12b8f7b4662e2080c2953ec47cca2a45a5438`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Two_seeding_dandelions_(Unsplash).jpg)。

## atlas:gamma-curve · 伽马曲线

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 用幂函数非线性重分配亮度，主要改变中间调而保持端点附近可控；能抬起阴影或压低中间亮度，不是整体等量曝光。
**必要输入与条件：** 输入带完整黑白阶调的图像；对照肤色、暗部和高光，调整曲线指数及基准空间。
**区别与边界：** 伽马过强会洗白中间调或压扁层次；若未说明编码色彩空间，同一数值对亮度的影响可能不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/gamma-curve)；固定详情快照 `effects/gamma-curve.json`，SHA-256 `688b34beab7449388027e10a48839d1860996e193d031b33546eef8d65343fa0`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:gan-portraits · GAN 合成人像

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 生成器与判别器在训练中相互优化，产出逼真人脸与摄影感光照；局部耳饰、发际和背景可能不对称或融化，反映统计生成而非显式三维建模。
**必要输入与条件：** 需训练数据与生成模型，输出后检查发丝、眼镜、饰物和背景边界；用于讨论合成人像时保留生成来源说明。
**区别与边界：** 模型学到的是训练数据中的视觉统计，不保证真实空间或对象常识；局部瑕疵可能随新样本出现，不能把一张图的缺陷写成GAN必然特征。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/gan-portraits)；固定详情快照 `effects/gan-portraits.json`，SHA-256 `5c87dbffeab88e57816f4d7b4cd0153b8da7142333aed6b420035ef4c191404f`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:GAN_Mensch_StyleGAN2.png)。

## atlas:gaussian-blur · 高斯模糊

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 以距离越远权重越低的高斯核平均邻近像素，各方向均匀柔化边缘和纹理；模糊尺度由 sigma 控制。
**必要输入与条件：** 输入图像并设定 sigma/核尺寸；适合柔化细节、模拟离焦前的均匀模糊或构造金字塔层级。
**区别与边界：** 过度模糊会让文字和物体边界不可读；它没有方向性，不等同于运动拖影或只模糊背景的景深效果。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/gaussian-blur)；固定详情快照 `effects/gaussian-blur.json`，SHA-256 `58cd67ec5cce06710ed0255b0b73fb4569136204d55ccd03f147156054a13d0f`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:gaussian-pyramid · 高斯图像金字塔

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 每层先对上一层做高斯模糊再降采样，形成由大到小的图像序列；越往下细节越少、宽形越突出。
**必要输入与条件：** 需要基准图像、金字塔层数和每层缩放比；降采样前先模糊以减少混叠伪纹。
**区别与边界：** 缩小层级舍弃了高频细节，不能从最小图像无损还原；层数过多会把主体形状也压成色块。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/gaussian-pyramid)；固定详情快照 `effects/gaussian-pyramid.json`，SHA-256 `9a79abb903ee7a94ebe319bf1751e2e9284620f303d89ee1d6e68db311c1d954`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Boston_Public_Library._Court_-_DPLA_-_14418fbd93fc9861130f58873cd70aca.jpg)。

## atlas:generative-image-to-video · 生成式图生视频

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 以单张图及可选文字指令为条件，模型合成连续新帧，让镜头、人物或环境出现运动；与Ken Burns或2.5D视差不同，它可以补出新的视角和内容。
**必要输入与条件：** 需要起始图、运动描述和目标片长/视角；逐段检查相机运动、物体轨迹与全片细节一致性。
**区别与边界：** 合成视角不代表原始场景真实存在，物体可能变形或身份漂移；这是方法家族，具体行为随模型和指令变化。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/generative-image-to-video)；固定详情快照 `effects/generative-image-to-video.json`，SHA-256 `b28a2e61d9ceb1696d18e6f3834fc6c66e7459e351c4c6e97b1e17c7dfe8bf6b`。
**Atlas 所列参考：** [原始参考页面](https://stability.ai/news/stable-video-diffusion-open-ai-video-model)。

## atlas:generative-inpainting · 生成式区域补绘

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 模型根据遮罩内外环境与可选文字提示，为被遮住区域合成看似连贯的新内容；它补的是合理候选，不是被遮挡内容的真实复原。
**必要输入与条件：** 需原图、精确遮罩与环境/文字条件；优先小范围修补，再检查纹理、阴影、透视和边缘连续。
**区别与边界：** 遮罩内真实信息已不可见，生成结果不能作为原物证据；纹理接缝或光照不一致需要人工检查。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/generative-inpainting)；固定详情快照 `effects/generative-inpainting.json`，SHA-256 `5785b50921a3780072c37e53b1362d425a95b3bbb65815e3a75a2efdeb68225c`。
**Atlas 所列参考：** [原始参考页面](https://advimman.github.io/lama-project/)。

## atlas:generative-outpainting · 生成式画布外扩

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 在原画布边缘外生成新的环境与构图，使透视、光线和纹理向扩展区域延续；新增部分是模型想象，不是原视野的记录。
**必要输入与条件：** 先标清原图边界，再决定向哪侧外扩；给模型边缘上下文和必要提示，检查扩展处的透视、纹理与照明。
**区别与边界：** 扩展内容不能当作原拍摄画幅之外的事实；放大分辨率只分配已有图像信息，不会等同于生成新的场景内容。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/generative-outpainting)；固定详情快照 `effects/generative-outpainting.json`，SHA-256 `6dbdf71ef51ebf182647aeb23f41af0d50064a64471ea030346ccb2dc84355f8`。
**Atlas 所列参考：** [原始参考页面](https://openai.com/index/dall-e-introducing-outpainting/)。

## atlas:glass-shot · 玻璃绘景合成

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 在摄影机前的玻璃上绘制远景或建筑，并与玻璃后方实景对齐拍摄，让有限布景看似辽阔；后来的 matte painting 是更广的分层合成家族。
**必要输入与条件：** 需要透明玻璃绘景、固定机位和清楚的地平线/屋顶拼接点；按镜头透视与景深对齐绘画和实景。
**区别与边界：** 机位移动会暴露绘景平面和视差；具体发明优先权并不完全确定，示例材料不应冒充每种后期遮罩技术。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/glass-shot)；固定详情快照 `effects/glass-shot.json`，SHA-256 `4e560609300c2942c2aee2a8a035daefc6dcd61209a884a42bee5c513e2f9042`。
**Atlas 所列参考：** [原始参考页面](https://www.bfi.org.uk/features/painted-backdrops-black-narcissus-raiders-lost-ark)。

## atlas:go-motion · Go Motion 动态定格

**视觉家族：** 实拍、舞台与模型特效（`atlas-family:practical-effects`）。
**可见效果与关键机制：** 电脑控制模型在曝光时稍微移动，再逐格拍摄，使快速部位带有真实快门拖影；静止模型普通定格则通常每帧锐利、运动显得频闪。
**必要输入与条件：** 需要可控模型关节/电机、逐格摄影和与曝光同步的运动；将模糊集中在快速运动部位。
**区别与边界：** 模型仍按帧推进，电机与相机同步复杂；单纯给定格画面后期加模糊不等同于曝光中运动。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/go-motion)；固定详情快照 `effects/go-motion.json`，SHA-256 `502f0a3957a4af868b6a5a6881a24ac5a2e34051dcf82f8714d96e39b5855f64`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Go_motion)。

## atlas:gouraud-shading · Gouraud 顶点插值着色

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 先在多边形顶点计算光照颜色，再沿面插值，低面数网格因此显得表面平滑；外轮廓仍由直边构成。
**必要输入与条件：** 需要多边形网格、顶点法线和顶点光照；检查曲面亮度渐变及跨面接缝。
**区别与边界：** 镜面高光若落在顶点之间容易消失；平面着色每面单色，Phong 着色则在像素级计算光照，精度和成本不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/gouraud-shading)；固定详情快照 `effects/gouraud-shading.json`，SHA-256 `4af19fbea3814012fa9bfd988afad1f55647ccaba07ce018b7b29892fce6bb0b`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Gouraudshading00.png)。

## atlas:grabcut-mask · GrabCut 前景蒙版

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 从用户给的大致框或前景/背景提示出发，建立颜色模型并用图割优化前景边界；输出主体蒙版，不只是固定框选。
**必要输入与条件：** 输入图像、初始矩形或少量前景/背景标记；主体边界与背景颜色有差异时更容易收敛。
**区别与边界：** 初始框若包入大量相似背景会误分，头发等细边界仍需修整；结果依赖色彩分离，不是通用语义识别。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/grabcut-mask)；固定详情快照 `effects/grabcut-mask.json`，SHA-256 `c1895d0b9a54e0a0109f3c4c82e4cd0fd50be05a4fdf0acf808e7fa546ade4c2`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:gradient-map · 明度渐变映射

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 按每个像素的亮度查一条指定色带，用阴影到高光的颜色序列替换色相；映射跟随明暗，不跟随颜色在画面中的空间位置。
**必要输入与条件：** 需要一条含多色标的渐变及输入亮度范围；移动中间色标可重新分配中间调的色相。
**区别与边界：** 相同亮度的不同物体会映成同一颜色，原色相差异被抹掉；叠加在画面上的普通空间渐变不是Gradient Map。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/gradient-map)；固定详情快照 `effects/gradient-map.json`，SHA-256 `d9453ef21ed435a5238b9d44ea8a0a77f3ff749a6edf8f53d55e0cfced43939f`。
**Atlas 所列参考：** [原始参考页面](https://helpx.adobe.com/photoshop/desktop/adjust-color/color-effects-techniques/apply-special-color-effects-to-images.html)。

## atlas:graduated-filter · 渐变减光滤镜

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 在镜头前放置一侧有色、向另一侧渐变透明的玻璃或树脂片，可柔和压暗或染色画面一半，常沿地平线控制天空。
**必要输入与条件：** 需渐变滤镜和可调滤镜架；上下移动并旋转过渡带，使其贴合地平线或预期区域边界。
**区别与边界：** 滤镜影响所有经过覆盖区域的内容；不同于依太阳角度改变天空反光的偏振镜，渐变滤镜不会识别天空。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/graduated-filter)；固定详情快照 `effects/graduated-filter.json`，SHA-256 `95cc4bd285377333f2971ab03ac993df70f52794cc15c4d26a2fcd1029a3933a`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Halftoned_filter.jpg)。

## atlas:graph-segmentation · 图论区域分割

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 把相邻且视觉相似的像素作为图节点连接，再按边权将图切成不规则连通区域；区域大小随颜色差和分割尺度变化。
**必要输入与条件：** 需要图像、像素相似度/邻接关系与分割粒度；与SLIC等规则超像素并排比较边界形状。
**区别与边界：** 输出区域贴合局部颜色而非物体语义，纹理噪声可能切得过碎；参数不同会改变区域数量和尺度。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/graph-segmentation)；固定详情快照 `effects/graph-segmentation.json`，SHA-256 `a206ae8c53bd301d57a387b9d0edb27fa710f4f5bf4bd74ba8f3c11f1d4db37a`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:grunge-typography · 粗粝解构字体编排

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 用复印损耗、刮擦、污渍或遮罩打断字形，再叠放、错位、裁切和混排，既让字面残损，也扰乱版面秩序。
**必要输入与条件：** 需有明确可读的文字底稿、破损纹理和叠层关系；先保留必要信息，再把粗粝处理放在外围或非关键字形。
**区别与边界：** 残损字形和失序版式是两层效果；普通字体也能通过遮罩、错位和纹理构成 grunge，不必使用特殊字体。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/grunge-typography)；固定详情快照 `effects/grunge-typography.json`，SHA-256 `2f60e7e0e69a572c2a77ff66cda93ef1f00cb87d1836cac43181fa1e99d11475`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Logo_bluesfestival_Luzern.jpg)。

## atlas:gum-bichromate · 树胶重铬酸盐印相

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 感光树胶承载颜料，经曝光、水洗和手工处理形成粉质、可见笔触的照片印相；绘制与洗印过程改变图像，而非简单模糊。
**必要输入与条件：** 需要相纸/承印层、树胶与颜料、曝光和水洗条件；数字复现可用哑光颜料、纸纹和局部手绘层。
**区别与边界：** 多次印层、刷痕和水洗会造成不均匀，精确复现受工艺控制影响；绘画感可以来自实体印相，不必是后期滤镜。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/gum-bichromate)；固定详情快照 `effects/gum-bichromate.json`，SHA-256 `d401090328281033d99980d711180a8aaf6af711623284214a3f67dee8108389`。
**Atlas 所列参考：** [原始参考页面](https://www.metmuseum.org/art/collection/search/269329)。

## atlas:halation · 胶片卤化光晕

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 过曝高亮附近出现窄的红橙边缘与向外柔光，来自光在胶片基底或压片板处反射；不是泛化模糊。
**必要输入与条件：** 需要强光源、逆光边缘和对应胶片/后期模拟；把光晕限制在高亮与暗部交界处，并检查高光是否仍清晰。
**区别与边界：** 颜色与强度取决于胶片结构、曝光和扫描；镜头散射或数字bloom可有相似外观，但不能因此统称halation。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/halation)；固定详情快照 `effects/halation.json`，SHA-256 `64d0ac2478103e24da5e4d3d25287d4818762e24c176fda4e014b10ff482cb20`。
**Atlas 所列参考：** [原始参考页面](https://help.cinestillfilm.com/hc/en-us/articles/360029185291-What-is-Halation)。

## atlas:halftone · 印刷半色调网屏

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 把连续色调拆成规则网点或线网，远看融合成灰阶，近看可辨重复的点线结构；是制版印刷对色调的离散编码。
**必要输入与条件：** 需要照片色调、网屏角度和可印刷网点；放大检查点距、网点面积及纸张吸墨变化。
**区别与边界：** 近看会暴露网点结构，网屏方向或印刷套准不当会干扰画面；与数字抖色用像素密度模拟灰阶的机制不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/halftone)；固定详情快照 `effects/halftone.json`，SHA-256 `3c3a57bf68695aae00e26ca01c7b29593f3d46580daa0a64b59d4990c0400674`。
**Atlas 所列参考：** [原始参考页面](https://www.loc.gov/preservation/resources/rt/illbk/ibs2.html)。

## atlas:halftone-dot-screen · 规则网点半色调

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 固定网格中的圆点按局部亮度改变大小，以黑白点面积近似连续灰阶；网格角度与间距形成可辨的印刷纹。
**必要输入与条件：** 需灰度/色版、规则网屏、网点角度和周期；控制点径范围避免高光消失或阴影糊成整片。
**区别与边界：** 规则网点可能产生摩尔纹，亮度变化靠点径而非不规则误差扩散；不可与抖色算法或针式点阵打印混用。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/halftone-dot-screen)；固定详情快照 `effects/halftone-dot-screen.json`，SHA-256 `592899a49ff50a823cd4db2879d5c4dbc53f621387084c6bf20eadf1538b7a15`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:hand-coloring · 黑白照片手工着色

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 在黑白照片表面选择性涂上颜料或染料，灰阶和纸面仍透出，衣料、脸部可带薄薄水彩色；这是后期上色，不是早期彩色摄影。
**必要输入与条件：** 需单色相片、颜料/数字色层与对象区域选择；控制透明度让原有明暗继续塑造体积。
**区别与边界：** 颜色来自着色者判断，黑白底片不能证明原物的真实色彩；与整帧均匀染色不同，它逐件选择上色。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/hand-coloring)；固定详情快照 `effects/hand-coloring.json`，SHA-256 `e17a696b94e431e9dbd9290ead4b4611a6682306496ab4e3bb4a90be8cf6dfac`。
**Atlas 所列参考：** [原始参考页面](https://www.getty.edu/art/exhibitions/beato/index.html)。

## atlas:harmonograph · 阻尼摆线谐振绘图

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 多个摆锤带动纸或笔形成套叠回环、交织网和收缩螺旋；摩擦与空气阻力使摆幅逐渐缩小，留下连续轨迹。
**必要输入与条件：** 需要摆锤/绘图机构、相对摆动方向、相位和阻尼；可视化线条密度与摆幅衰减。
**区别与边界：** 真实图样受机械长度和阻尼影响，不等同于恒幅Lissajous曲线；Spirograph靠齿轮约束轨迹，机制不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/harmonograph)；固定详情快照 `effects/harmonograph.json`，SHA-256 `c866110961f9e4979932967aedb00e37ab4beab0cc3942c1d19615bc83b1c1f4`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Harmon%C3%B3grafo.jpg)。

## atlas:harris-corner-detection · Harris 角点检测

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 利用局部亮度梯度矩阵评估两个方向的变化强度，在拐角处标出关键点；技术图层呈现稀疏彩色点。
**必要输入与条件：** 需要含角点、纹理交汇或建筑结构的图像；设定响应阈值与非极大值筛选，观察点的密度。
**区别与边界：** 输出是局部几何特征而非人脸/物体识别，阈值低会把噪声误标；与FAST环形亮度比较属于不同角点判据。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/harris-corner-detection)；固定详情快照 `effects/harris-corner-detection.json`，SHA-256 `dad9c282b16e40a432b8cea35e050d66e1f496e9a74039b3bda7b898588881f0`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:hdr-imaging · 高动态范围合成与映射

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 多档曝光提供更宽亮度信息，再由色调映射压进显示范围，让窗外高光和室内暗部同时保留细节；夸张局部对比只是流行外观。
**必要输入与条件：** 需曝光包围或等价高动态数据及对齐融合；分别检查自然映射、显示端HDR与夸张照片滤镜表现。
**区别与边界：** 移动主体会产生鬼影；HDR数据、HDR显示和重口味tone mapping不是一回事，HDR也远早于2000年代。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/hdr-imaging)；固定详情快照 `effects/hdr-imaging.json`，SHA-256 `c5629f1e87982185d45a949cab540351ddcf355f6bf9d285c8f890abe97d8bd0`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:HDRToneMap.jpg)。

## atlas:heliography · 日光蚀刻（Heliography）

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 光使金属板上的沥青感光层硬化，经极长曝光留下低反差烟灰状影像；斜掠照明能让金属表面与残留沥青的细节浮现。
**必要输入与条件：** 历史复现需金属底板、感光沥青层、长时间曝光和表面光照控制；数字展示应同时呈现原板与增强后的解释图。
**区别与边界：** 影像反差低且依观看角度显现，材质表面会遮蔽信息；现代高反差滤镜不能替代其光敏材料和长曝光过程。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/heliography)；固定详情快照 `effects/heliography.json`，SHA-256 `6e65cdd75e96cf4096b4cfa4e5a59cc5a8075ecf8659ddc898a87a4a959616fb`。
**Atlas 所列参考：** [原始参考页面](https://www.hrc.utexas.edu/niepce-heliograph/)。

## atlas:hexagonal-pixels · 六边形像素拼贴

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 在蜂巢六边网格中按每格采样颜色，以平涂色片替换纹理和细节；格子越大，脸、曲线和细线越被概括。
**必要输入与条件：** 需要图像采样、规则六边网格和单元尺寸；保持格子相邻共享边，检查主体轮廓与细线走向。
**区别与边界：** 大单元会吞掉小细节，边缘呈阶梯；它与方形像素马赛克形状不同，不能靠单纯放大原像素实现。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/hexagonal-pixels)；固定详情快照 `effects/hexagonal-pixels.json`，SHA-256 `b10334722e98b0533f0e22e181ae9958e316875a1801d45fe194518691daadf7`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Eiffel_Tower,_Paris,_France_(Unsplash_ZHP6JNIXtfQ).jpg)。

## atlas:histogram-equalization · 全局直方图均衡

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 按全图亮度直方图重新分配明暗，使集中在窄区间的灰阶铺开，增强整体对比；不是局部识别或逐对象调色。
**必要输入与条件：** 适用于亮度分布挤在窄范围、细节难辨的图像；检查肤色、暗部与天空是否一起被过度拉伸。
**区别与边界：** 全局映射可能把原本柔和的层次推成硬对比，也会显露噪声；与局部直方图增强需分开判断。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/histogram-equalization)；固定详情快照 `effects/histogram-equalization.json`，SHA-256 `4fca5b1312e76a667aff75ff3b10fa71ba8830ae9282da5b9c892485b2531016`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:hog-gradients · 方向梯度直方图

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 把画面分为小格，统计各局部最强边缘方向并画成线束星芒；格子组成后可见姿态与轮廓的方向结构。
**必要输入与条件：** 需要灰度图、网格单元尺寸和边缘方向统计；小格看细节，大格概括整体形状，适合特征描述示意。
**区别与边界：** HOG显示局部梯度方向，不保留自然色彩，也不直接输出类别；网格太粗会丢姿态细节，太细则增加噪声。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/hog-gradients)；固定详情快照 `effects/hog-gradients.json`，SHA-256 `df615e3d7cda67c6deff06d8d71991ce185b049b320b0dd65a2ec6d9bd8cc218`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:VARZAHEH_desert_-_ISFAHAN_(Unsplash).jpg)。

## atlas:hollywood-glamour-lighting · 好莱坞魅力人像光

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 镜头上方的主光在鼻下形成蝶形影，轮廓光提亮发丝，柔化高光并可配合修饰皮肤；脸部结构由布光塑形，而非只靠磨皮。
**必要输入与条件：** 需要近镜头的高位主光、可选发丝灯与适量柔光；检查鼻影、颧骨和肤质在目标曝光下的平衡。
**区别与边界：** 与侧向Rembrandt光形成的阴影三角不同；扩散只柔化明亮边缘，不能替代布光，过量磨皮会抹去真实表情质感。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/hollywood-glamour-lighting)；固定详情快照 `effects/hollywood-glamour-lighting.json`，SHA-256 `dd2425e1af0299198699931507ddff16a0a6798bfc405e6967c1c5ecacf19436`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Joan_Crawford_-_1936_-_Hurrell.JPG)。

## atlas:holography · 全息干涉记录

**视觉家族：** 立体视觉与多视角（`atlas-family:stereoscopic-space`）。
**可见效果与关键机制：** 把相干激光分成物光与参考光，记录两者波前干涉条纹；合适光照下，这组微细条纹能重建具有视差的三维光场，不是普通平面立体贴图。
**必要输入与条件：** 需相干光源、稳定光路、记录介质和后续照明；观看位置改变时检查物体视角是否连续变化。
**区别与边界：** 透镜光栅式柱镜图只在若干角度切换切片，与全息波前重建不同；静态插画不能证明已形成真实全息。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/holography)；固定详情快照 `effects/holography.json`，SHA-256 `0e8f1782f72a58895763b33c46298849e84896cea4d3da15568f839e463f80c8`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Transmission_hologram.jpg)。

## atlas:hot-pixel-noise · 热像素亮点噪声

**视觉家族：** 传感器与成像信号（`atlas-family:sensor-signal`）。
**可见效果与关键机制：** 只把稀疏像素点或个别颜色通道拉到高亮，在原图上形成白、红、绿或蓝色针尖斑点；不是整片增亮或连续胶片颗粒。
**必要输入与条件：** 设定点位密度、颜色通道与亮度，优先让点落在暗部附近以显出传感器缺陷感。
**区别与边界：** 高密度会像星尘或数字噪声；单个异常像素不能代表镜头污点，效果只改少量采样值。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/hot-pixel-noise)；固定详情快照 `effects/hot-pixel-noise.json`，SHA-256 `d2877fe0f4e190e7331e1eea6eecab4a278cce2359b0d23c2eff4093ebcd5725`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Carver_at_work_(Unsplash).jpg)。

## atlas:hough-circle-transform · 霍夫圆变换

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 从边缘像素向可能的圆心与半径投票，累积票数足够时标出圆形轮廓；可视化常用彩色圆环与中心点。
**必要输入与条件：** 先提取边缘，再设半径范围、圆心距离和投票阈值；适合检查孔洞、圆环或轮廓中的圆形结构。
**区别与边界：** 圆弧缺损、纹理噪声和重叠圆会产生误检；检测到几何圆不等于识别出对象是什么。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/hough-circle-transform)；固定详情快照 `effects/hough-circle-transform.json`，SHA-256 `dfe89c77aeb886e803372caae2c778d5b6fe7028204a6b5a0a8a4471e6799de8`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Artist_spray_painting_flowers_(Unsplash).jpg)。

## atlas:hough-line-transform · 霍夫直线变换

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 把图像边缘点映射到直线参数空间并累积投票，突出符合条件的直线段；结果可叠加在原图边界上。
**必要输入与条件：** 需要边缘图、最短线长、最大间隙和投票阈值；选建筑、道路或桌边等明显线段检查。
**区别与边界：** 重复纹理可能投出虚假线，断续边缘也会改变线段合并；它标记几何对齐，不判断线条的语义。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/hough-line-transform)；固定详情快照 `effects/hough-line-transform.json`，SHA-256 `a79841b3f834a1b325a6c723082ca401ce47f6331320b5e657ed85fdd5af988d`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:hsv-channel-split · HSV 色彩通道拆分

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 把RGB图像转换到HSV后分别显示色相、饱和度与明度图，显出色彩类别、纯度和亮暗分布各自承担的信息。
**必要输入与条件：** 需输入彩色图并生成三张通道视图；色相用循环色带呈现，饱和度和明度适合灰阶对照。
**区别与边界：** 低饱和区域的色相不稳定或无明确意义；HSV便于分通道查看，不代表感知均匀的颜色空间。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/hsv-channel-split)；固定详情快照 `effects/hsv-channel-split.json`，SHA-256 `0c79f0aa2012a46ebf73b21eda42667ecea1da5b8d0e56d889b0e6e3d3724d95`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:DeepInTheForest_cre8art4life_JulieGeiger.jpg)。

## atlas:hue-rotation · 色相环旋转

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 在色相环中统一平移色相角度，局部明暗和饱和度大致保留，红绿蓝等颜色关系整体换位。
**必要输入与条件：** 以色彩信息明确的图像为输入，设定旋转角度；单独检查肤色、灰色和高饱和物体。
**区别与边界：** 灰度像素没有稳定色相，肤色等语义色也可能失真；改变色相不等于改变光照或重建另一种材料。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/hue-rotation)；固定详情快照 `effects/hue-rotation.json`，SHA-256 `7a7cead7ba00a2ce8382cff4df69ec38c1c734dfbd26713b99098c23156a322d`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:hyperlapse · 移动延时摄影

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 相机跨越较长距离按间隔拍摄，再将照片对齐成快速连续行进；固定机位延时只看场景变化，hyperlapse还包含空间移动。
**必要输入与条件：** 需要沿路径定时拍摄、持续锁定远处参照点，并在后期稳定与裁切；建筑或街景可提供可追踪锚点。
**区别与边界：** 步幅、视差和曝光变化会造成抖动或边缘裁切；对齐只能掩饰部分机位不稳，不能把不同视点变成同一真实透视。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/hyperlapse)；固定详情快照 `effects/hyperlapse.json`，SHA-256 `5a61a8d8e6ee2cc90e1b524d9a111bf2d33160114c270dc5224690e240696eac`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Hyperlapse)。

## atlas:image-based-lighting · 图像式环境照明

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 用全景HDR环境图同时提供方向性亮光、柔和环境填充与反射，让三维物体的高光和阴影呼应实景；不只是把环境图贴到镜面上。
**必要输入与条件：** 需覆盖周围方向的HDR环境图、正确曝光和虚拟材质；检查高亮光源、反射和地面接触阴影是否协调。
**区别与边界：** 普通环境映射只模拟表面反射，未必参与真实照明；单张全景仍缺少局部遮挡与动态光源，材质参数不当会显假。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/image-based-lighting)；固定详情快照 `effects/image-based-lighting.json`，SHA-256 `24abd8585d42ade8b7ecef0c4e9841820e2a6e3fdb5ee96b12b532a84057add3`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Image-based_lighting)。

## atlas:image-morphing · 对应特征图像变形

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 在两张图上标记对应眼睛、嘴和轮廓点，同时扭曲几何并混合像素，使一个人脸连续变成另一个；溶解只改透明度，不改变形状。
**必要输入与条件：** 需要起止图及彼此对应的特征点/网格；先对齐眼口和轮廓，再按时间安排几何与颜色过渡。
**区别与边界：** 对应关系错位会让五官漂移或融化；生成式AI形变可不显式标点，不能把所有形状插值方法都说成同一算法。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/image-morphing)；固定详情快照 `effects/image-morphing.json`，SHA-256 `9545fadc29029d1468a201cf39107c6a8ea3e774cb0915e819fa58f88c560d5f`。
**Atlas 所列参考：** [原始参考页面](https://vfxvoice.com/over-30-years-willow-has-morphed-into-an-effects-classic/)。

## atlas:image-prompt-adapter · 图像提示适配器

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 把参考图特征作为生成模型的条件输入，并与结构图分开控制，让参考图影响外观而结构图约束布局；这是条件注入接口概念，不是滤镜。
**必要输入与条件：** 实际调用图像适配器需兼容的生成模型、参考图/结构图及相应权重；分别观察外观与构图结构如何受控。原理示意可并列标注外观和结构输入，不要求运行模型，且应标明示意。
**区别与边界：** 示例是条件接口示意，不证明某个模型实际推理；图像条件不能保证逐像素复制，也可能与文字条件争夺控制权。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/image-prompt-adapter)；固定详情快照 `effects/image-prompt-adapter.json`，SHA-256 `0e27299a05f4577f8250ff3d55df1ba1e552cf785f4a37192eaab9bd07862863`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:image-to-image-diffusion · 图生图扩散重绘

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 先对输入图像加噪，再按文字条件反向去噪生成新图；低去噪通常保留更多构图，高去噪会重绘更多区域。
**必要输入与条件：** 实际图生图需输入图、扩散模型、提示词和去噪强度；比较低/高强度下主体、构图与材质的保留。方法示意可展示参考图、噪声变化和提示的关系，但未运行模型时不称作推理输出。
**区别与边界：** 输入图只是条件而非像素锁定，细节可能被改写；具体行为依模型与参数，本条是概念示意而非指定模型输出。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/image-to-image-diffusion)；固定详情快照 `effects/image-to-image-diffusion.json`，SHA-256 `bbdf300c7296ea5f083b00e0034b631264f53fbac9c173568c162e5f852c743c`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:indexed-color-palette · 索引色调色板

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 为整幅图建立有限的自适应色表，每个像素只存调色板索引；色数降低后出现色阶跳变，可用抖色缓和渐变断层。
**必要输入与条件：** 先选调色板上限（示例为16色），再决定硬量化还是叠加有序抖色；检查天空、肤色等连续渐变。
**区别与边界：** 颜色数量减少会丢失渐变细节，调色板按图像内容变化；索引色只是色彩编码方式，不自动等于早期计算机风格。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/indexed-color-palette)；固定详情快照 `effects/indexed-color-palette.json`，SHA-256 `6a41126e337ee30feb683829f4a9df0c3db18e145ed57e60eb26bd4204eae591`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:ink-bleed · 纸纤维渗墨

**视觉家族：** 插画媒材与笔触（`atlas-family:illustration-material`）。
**可见效果与关键机制：** 液态墨沿吸水纸纤维不均匀扩散，使字画边缘羽化、相交笔画处积色；与均匀柔焦不同，扩散会顺着纸纹生长。
**必要输入与条件：** 需吸水纸纹、墨色和可控扩散强度；比较细线与粗线，细字周围留出防止闭口的空间。
**区别与边界：** 扩散宽度相对线条越大，小字内孔和间隙越容易闭合；统一高斯模糊不会产生沿纤维分叉的渗墨。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/ink-bleed)；固定详情快照 `effects/ink-bleed.json`，SHA-256 `7f6fc9366fc1b20a5d4a9822e70912b7d483e937600012ce04eca93f8e0a7949`。

## atlas:instagram-filters · 早期社交照片预设

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 数字预设以褪黑、暖色中间调、暗角、边框和轻微颗粒重映射像素，模拟旧快照外观；不改变拍摄时曝光或胶片化学过程。
**必要输入与条件：** 以数字照片和可调曲线/色彩预设为输入；逐项检查黑位、白面、蓝色和四角，避免把所有照片套成同一色偏。
**区别与边界：** 与交叉冲洗的化学过程不同，也不等同单色棕褐；旧照片的真实褪色各异，滤镜只能模拟选定外观。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/instagram-filters)；固定详情快照 `effects/instagram-filters.json`，SHA-256 `84dc48bdd05ee04cfe1774559532e7bd2dffce725ef90636698afb487b4e309e`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Instagram_versione_(santa_fiora,_peschiera).jpg)。

## atlas:instance-segmentation · 实例级目标分割

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 为图中每个独立对象输出单独轮廓和蒙版，即使多个对象属于同一类别也分开标色；关注逐个实例而非只给出类别区域。
**必要输入与条件：** 真实实例分割需模型与图像，并为每个对象给出类别和独立区域；检查重叠处边界。讲解图可手工着色标出多个对象并标为示意，不声明模型检测结果。
**区别与边界：** 被遮住的部分只能按可见证据估计，模型可能漏检或合并相邻实例；不同于把同类所有像素归为一块的语义分割。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/instance-segmentation)；固定详情快照 `effects/instance-segmentation.json`，SHA-256 `df038f52ad4f20b643a6f8df552db2cce49e1293e8dad283725251452aeafa6c`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:interlacing · 隔行场梳齿伪影

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 两组有时间差的隔行场被误当作同一完整帧显示，运动边缘出现交替错位的横线与梳齿；数码滤镜模拟线裂，不会真的生成隔行编码。
**必要输入与条件：** 需要运动边缘和相邻时场；标明行偏移与场间时差，可用移动轮廓展示梳齿。
**区别与边界：** 静止物体的两场位置一致时梳齿不明显；模拟破线不能替代真实隔行视频，也不具备去隔行功能。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/interlacing)；固定详情快照 `effects/interlacing.json`，SHA-256 `4f09f71f599dd14ed34bd035c0c4ae51f8196b9d87a0dcc4da29898d31669c22`。
**Atlas 所列参考：** [原始参考页面](https://helpx.adobe.com/premiere/desktop/edit-projects/modify-clip-properties/create-interlaced-or-non-interlaced-clips.html)。

## atlas:iris-shot · 圆形遮幅开合

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 圆形或自定义孔径由遮罩逐渐放大/缩小，让画面从局部显现或退入黑场；变化的是可见画面区域，不是镜头光圈。
**必要输入与条件：** 需动态遮罩、开合中心和时长；中心可落在关键细节而不必固定在画面中央。
**区别与边界：** 黑区会遮住边缘信息，孔径太小会截断主体；镜头收光圈改变曝光和景深，不等同于可见遮幅。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/iris-shot)；固定详情快照 `effects/iris-shot.json`，SHA-256 `018b700b20cabf8feffdeeeec7db7cd62e0896fe93636a30af77a78e4ee9dd5f`。
**Atlas 所列参考：** [原始参考页面](https://filmglossary.ccnmtl.columbia.edu/term/iris-shot/)。

## atlas:isometric-pixel-graphics · 等距像素图形

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 以无消失点的平行投影画三维感场景，物体远近保持同尺度，线条按固定像素阶梯排列；视角由绘制方向锁定。
**必要输入与条件：** 需像素网格与平行轴比例；先确定轴向阶梯规则，再按同一网格制作物体侧面与投影。
**区别与边界：** 不能像真实3D相机那样自由绕物体旋转；严格30度可能造成锯齿，常以像素网格比例近似角度。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/isometric-pixel-graphics)；固定详情快照 `effects/isometric-pixel-graphics.json`，SHA-256 `c9d1dc887196daf287f48ea85efa928a77137d3496517279f0d77ddcdd69e683`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:AoE_II_DE,_isometrische_Perspektive_Dorf_20210126_03.png)。

## atlas:jpeg-compression-artifacts · JPEG 有损压缩伪影

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 强量化舍弃DCT系数，使画面出现方块边界、细纹涂抹、色阶跳变和锐边振铃；反复以低质量保存会累积损伤。
**必要输入与条件：** 需图像做JPEG编码并调低质量；重点检查高反差边缘周围的蚊噪与色度块。
**区别与边界：** 细节丢失不可从同一压缩图完整恢复；伪影量取决于质量和内容，不能把它简化成任意数字故障。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/jpeg-compression-artifacts)；固定详情快照 `effects/jpeg-compression-artifacts.json`，SHA-256 `b1234bfddf0e662b230133c4d28fdb3cd4000272416850b20c260d38b13715d5`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:jpeg-glitch · JPEG 数据故障风格

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 把JPEG块、色度跳变、横条错位和边缘振铃显性化，模拟文件受损或压缩解码异常；普通有损压缩与数据损坏不是同一过程。
**必要输入与条件：** 可用受控压缩、文件数据扰动或后期模拟；标清哪些是实际 databend、哪些只是外观滤镜。
**区别与边界：** 正常JPEG压缩是预期编码，数据损坏才是异常解释；模拟条带不能证明原文件经历了真实字节损坏。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/jpeg-glitch)；固定详情快照 `effects/jpeg-glitch.json`，SHA-256 `27e1401c3c38008e681c8760dcd75efa452ac6f574f43172a91b3e59bca417f6`。

## atlas:jump-cut · 跳切

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 从同一机位连续镜头中删掉一段时间，再直接拼接前后片段，使人物位置或动作突然跳变；同一构图让缺失时间显眼。
**必要输入与条件：** 需同一场景连续素材和明确删去的时间段；在动作中断点切换，保留构图相似以突出跳跃。
**区别与边界：** 不同机位间普通剪切不自动成为跳切；单帧错位只能暗示动作断裂，真正效果须在连续播放中成立。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/jump-cut)；固定详情快照 `effects/jump-cut.json`，SHA-256 `7ddbcdd4bf5fc57c72ecbd13423487fef15e7844ec028cb590df7e5cc3de1787`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Continuity_editing)。

## atlas:k-means-color-quantization · K 均值颜色量化

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 把像素颜色聚成少数K个中心值，同一簇替换为统一色块；轮廓仍沿源图变化，但连续色调变成阶梯。
**必要输入与条件：** 需要RGB像素和设定的K值；比较6、12、24色或其他数量，观察细节与色块概括的平衡。
**区别与边界：** 色数太少会合并相近色和阴影，边界突然跳变；它不自动添加抖色或轮廓线。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/k-means-color-quantization)；固定详情快照 `effects/k-means-color-quantization.json`，SHA-256 `0dc257c0927197099dd67fa33144d7e93341c05308692e5a595493393e73f281`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:kaleidoscope · 实体镜筒万花筒

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 多个镜面把一个图像片段反射并绕中心重复，形成径向对称图案；每次转动彩色碎片会重新组合。
**必要输入与条件：** 需镜面段、可旋转彩色物片和透光观察端；用不同片数呈现中心节点与重复变化。
**区别与边界：** 重复方式围绕中心展开，不是方格平铺或单轴镜像；数字模拟外观不等于实体镜筒的反射光路。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/kaleidoscope)；固定详情快照 `effects/kaleidoscope.json`，SHA-256 `fbfb2576ab6a69dc5ed50ad938c4265922208671e6cb00803daaab06b1da8f2f`。
**Atlas 所列参考：** [原始参考页面](https://www.vam.ac.uk/dundee/articles/scottish-design-icons-kaleidoscope)。

## atlas:kaleidoscope-mirror · 数字万花筒镜像

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 截取一个角度扇区并镜像复制，形成放射对称的花窗；源图位置改变会重新组织中心节点和重复色块。
**必要输入与条件：** 需要图像扇区、中心点与分片数；测试5、8、12片等配置，检查主体在中心和边缘的变化。
**区别与边界：** 径向复制不等于矩形平铺或单纯左右翻转；片数过多会使源主体难辨，拼缝可能露出几何错位。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/kaleidoscope-mirror)；固定详情快照 `effects/kaleidoscope-mirror.json`，SHA-256 `866232716822a79f2ddab4fbbcd2c0a172dfcb391be6ae66981b48d328b8106d`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:kinemacolor · Kinemacolor 红绿加色电影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 黑白电影画格交替经过红、绿滤光片拍摄与放映，观众视觉把快速交替合成有限彩色；快速运动会出现红绿错边。
**必要输入与条件：** 历史复现需同步的红绿滤镜、黑白胶片与放映装置；动画示意可拆出交替色场和运动边缘位移。
**区别与边界：** 蓝色表现弱，颜色依赖放映滤光片，不是胶片本身记录的完整彩色；与将染料印在胶片上的Technicolor流程不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/kinemacolor)；固定详情快照 `effects/kinemacolor.json`，SHA-256 `af608b22cdf65baea0efd279b24aa9411e484f428bccac9451abd504fa120170`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:1911_George_V_Kinemacolor.png)。

## atlas:kinetic-typography · 动态文字编排

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 让文字随音频或节奏移动、缩放、旋转或分帧出现，字形本身承担情绪和节拍；它为表达服务，不是保持静止的对话字幕。
**必要输入与条件：** 需明确词句、时间锚点与动作层级；按音节或重音安排文字进出，并在目标播放尺寸核对阅读窗口。
**区别与边界：** 动作过快或过度拆字会破坏词义阅读；不能拿字幕的翻译功能替代动态文字的表达目标。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/kinetic-typography)；固定详情快照 `effects/kinetic-typography.json`，SHA-256 `c488551e881a62f7b27961e6c7ab44e9055ceaedac58373aeeffef72cd7b863e`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Il_segno_animato_(fotogrammi_selezionati,_1999).jpg)。

## atlas:kirlian-photography · 基尔利安电晕摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 高压电场在物体边缘产生电晕放电，直接照亮感光材料形成锯齿光环；成像来自放电，不是镜头拍到的物体内部生命能量。
**必要输入与条件：** 历史理解可使用档案图或数字模拟电晕；真实实验涉及高压装置，应由专业人员按规范操作。
**区别与边界：** 放电强弱会受接触、湿度和材料影响，光环不是超自然或生物活力证据；与外部光线投影形成的普通接触印相不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/kirlian-photography)；固定详情快照 `effects/kirlian-photography.json`，SHA-256 `96322f089c2c7261a91d18f6f1c973cfa734d985976aaeb4c8acd5a24e71beb4`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:A_Kirlian_Photography,_female_1989.jpg)。

## atlas:kirsch-compass-edges · Kirsch 八方向边缘

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 对八个罗盘方向分别卷积，再在每个像素保留响应最强的方向，形成黑底亮边图；斜线与横竖边都可被突出。
**必要输入与条件：** 需要灰度/亮度图和八方向核；调响应阈值后观察不同方向的轮廓与角点。
**区别与边界：** 只选择局部最强边缘，不判断线条属于何种物体；噪声、纹理和过强对比也会生成亮边。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/kirsch-compass-edges)；固定详情快照 `effects/kirsch-compass-edges.json`，SHA-256 `eb28f495badb9fe627e6cceea648b0788e155724aa277eaa651b5a028932926b`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Child_At_The_Ceremony_(Unsplash).jpg)。

## atlas:kodachrome-color · 柯达克罗姆彩色正片

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 多层感光乳剂分别记录红绿蓝信息，经复杂显影加入染料，形成浓郁红黄、深蓝和清晰阴影；色彩来自分层化学过程。
**必要输入与条件：** 复现可用档案正片或按高饱和红黄、温暖肤色与硬朗黑位模拟；区分胶片原片与数字预设。
**区别与边界：** 数字滤镜不能重现多层乳剂和特殊显影化学；与以染色淀粉颗粒成像的Autochrome不同，色彩边缘更清晰。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/kodachrome-color)；固定详情快照 `effects/kodachrome-color.json`，SHA-256 `e9e20fcd088e91325ba1ad782da02670907fa0d80a8085ee2f4ab82bade20e30`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Guide_at_Little_Norway,_Blue_Mounds,_Wis._LCCN2017878934.jpg)。

## atlas:kuwahara-filter · Kuwahara 低方差平滑

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 围绕像素取多个重叠子区域，计算各区方差并选最平滑的一块作均值，形成保留边缘的平涂色片和绘画化纹理。
**必要输入与条件：** 需要图像与邻域窗口尺寸；增大窗口可从轻微平滑过渡到较粗的块状笔触。
**区别与边界：** 窗口过大将抹掉细节或出现块状断层；视觉像笔触不代表真实绘画，也不等同全局高斯模糊。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/kuwahara-filter)；固定详情快照 `effects/kuwahara-filter.json`，SHA-256 `c4869cdb3c4c7ea2576d3f9ada151f0e3caab500aa4db2da96f4c568852e980e`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Snow_mountain_background_photo_(Unsplash).jpg)。

## atlas:l-system-plants · L 系统植物分枝

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 用并行符号改写规则逐轮替换指令，再由海龟路径解释为转向和分枝，生成角度重复的枝条与叶簇；不要求每个尺度完全相同。
**必要输入与条件：** 需设定初始符号串、改写规则、绘制角度和迭代轮数；控制枝条长度、线宽与叶片分布以适配植物形态。
**区别与边界：** 结构受符号规则驱动，不等于自然生长模拟；它与泛称分形树不同，分枝并不一定在各尺度精确自相似。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/l-system-plants)；固定详情快照 `effects/l-system-plants.json`，SHA-256 `b3ce203da7446c68478a0b1b3168df142d30466049fb6b0b130ea98c007005c7`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Fractal_tree_(Plate_b_-_2).jpg)。

## atlas:lab-opponent-channels · Lab 对立色彩通道

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 把图像转到CIELAB并分别显示L*明度、a*绿—红和b*蓝—黄通道；可看出某些边界来自亮度差，另一些主要来自色差。
**必要输入与条件：** 需要RGB转Lab并对三个通道分别缩放显示；对照中性灰、肤色和强彩色区域。
**区别与边界：** 显示缩放会改变原始通道数值的视觉比例；Lab分量便于分离亮度与色差，不表示画面有三层实体色版。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/lab-opponent-channels)；固定详情快照 `effects/lab-opponent-channels.json`，SHA-256 `e3e8b727f9c31ca3b61006da91037b02f62aa8b2eaf39e8bb35e531f1d046e66`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Vicky_Gu_2016_(Unsplash).jpg)。

## atlas:lantern-slide · 玻璃幻灯片投影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 把透明玻璃上的正像或手绘半透明色层置于光源前，经镜头放大投到屏幕；光要穿过图像，因此不透明颜料会变成黑块。
**必要输入与条件：** 需透明玻璃片、透射照明、投影镜头与暗室；检查边框、手绘颜色和投影亮度。
**区别与边界：** 它是供投射的透明正片，不同于直接观看的单件不透明银版照片；过度不透明的色层会挡光。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/lantern-slide)；固定详情快照 `effects/lantern-slide.json`，SHA-256 `0fae260b7c5f8f602c5e58a293fc2a62760ea70aa343a70b3658c47373ae7577`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:%22Lucea_and_Dolphin_Head,_Jamaica%22,_early_20th_century_(imp-cswc-GB-237-CSWC47-LS12-020).jpg)。

## atlas:laplacian-edge · 拉普拉斯二阶边缘

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 对亮度应用二阶空间导数，在局部梯度变化处形成相邻明暗双边；用于显示细纹理和锐利边界响应。
**必要输入与条件：** 输入亮度图并设置响应缩放/阈值；可与高斯预平滑版本对照噪声影响。
**区别与边界：** 二阶导数会放大高频噪声，边缘常以正负双线出现；未平滑版本不同于先降噪再计算的Laplacian of Gaussian。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/laplacian-edge)；固定详情快照 `effects/laplacian-edge.json`，SHA-256 `848c3e6d55d2c3d9fddaed60fb0c5101d211d5a50934a7b62faf2b2b087842fb`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:laplacian-of-gaussian · 高斯拉普拉斯边缘

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 先用高斯模糊压低细噪，再求二阶导数显示结构边缘；平滑尺度决定小纹理被滤掉多少。
**必要输入与条件：** 需要亮度图、Gaussian半径和零交叉/响应阈值；比较不同尺度下细节与大轮廓。
**区别与边界：** 半径过大将抹去小结构，过小仍保留噪声；与直接Laplacian的主要差别是计算前先平滑。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/laplacian-of-gaussian)；固定详情快照 `effects/laplacian-of-gaussian.json`，SHA-256 `9616fc256d1c07fff07a8e90815d95e2e0c3fa8dd73c568606cfe3845a46b351`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:latent-space · 生成模型潜空间形态过渡

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 在模型学到的潜表示或参数之间插值，可让脸、建筑与自然形态连续混合并出现新中间形；不同于只对像素交叉淡化。
**必要输入与条件：** 需要支持潜表示/参数插值的生成模型和起止条件；逐段检查中间形是否仍对应预期主题。
**区别与边界：** 生成中间态是模型合成而非真实时间运动；不等同光流帧插值，也不能把所有AI缩放效果都称为latent morph。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/latent-space)；固定详情快照 `effects/latent-space.json`，SHA-256 `a62557b1ecf618e18d165d6505f4a43bde854611477f96bbd24146d9b74d9965`。
**Atlas 所列参考：** [原始参考页面](https://kevin-thu.github.io/DiffMorpher_page/)。

## atlas:latent-space-interpolation · 潜空间插值示意

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 这条预览以两种影像状态的像素混合作为中间态示意；真实潜空间插值应在生成模型内部移动表示，不能把本示例混色当作神经推理。
**必要输入与条件：** 用于讲解时需标出起止图和中间位置；若要真实潜向量插值，另需能暴露对应latent的生成模型。
**区别与边界：** 条目分类为示意而非实际模型推断；像素溶解只混透明度，不会依据学习到的图像结构创造新形态。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/latent-space-interpolation)；固定详情快照 `effects/latent-space-interpolation.json`，SHA-256 `6f2e7d4a56e0bc1ed7e5eb28fd7e596ebde78d02fbbfefd5997eaffee3e8e929`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:lcd-subpixel-view · 液晶屏 RGB 子像素放大

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 把每个图像采样拆成相邻红、绿、蓝窄条，亮度各随对应通道变化，显出放大液晶屏像素的条纹结构。
**必要输入与条件：** 需要RGB图与规则子像素排列；调节条纹宽度和观看距离，观察颜色如何重新融合。
**区别与边界：** 真实显示器子像素排列随面板而异；静态模拟图案不代表特定屏幕实际发光结构，过粗会让图像难辨。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/lcd-subpixel-view)；固定详情快照 `effects/lcd-subpixel-view.json`，SHA-256 `91a6c77626fd5752c76fe8b8556fa2650e48f6c49875f6549bcb138de8993891`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Milky_Way_Glacier_Point_(Unsplash).jpg)。

## atlas:led-volume · LED 虚拟制片摄影棚

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 高分辨率LED屏环绕实体摄影棚显示实时三维环境，跟踪相机位置并同步改透视；屏幕光也照亮演员，反射可与背景匹配。
**必要输入与条件：** 需LED墙、实时渲染环境和相机跟踪数据；对齐镜头参数、屏幕亮度及反射道具。
**区别与边界：** 与绿幕后期抠除不同，背景在现场直接拍入；屏幕像素、刷新率、摩尔纹与实时延迟仍可能暴露合成边界。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/led-volume)；固定详情快照 `effects/led-volume.json`，SHA-256 `cee973193660d2fde0725589f2d5b82f529ed63c3b6460f1ebf40b1e4fc09d6b`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:University_of_Portsmouth_CCIXR_2_Virtual_Production_and_Mixed_Reality_Studio.jpg)。

## atlas:lenticular-print · 柱镜光栅印刷

**视觉家族：** 立体视觉与多视角（`atlas-family:stereoscopic-space`）。
**可见效果与关键机制：** 把多视角图像切成细条交错印在底图上，再覆盖柱状透镜；观看角度变化时会看到不同条带，形成视差或短促翻转。
**必要输入与条件：** 需要视图切片、准确交错栅格和匹配柱镜片距；从规定角度走动检查视差变化。
**区别与边界：** 视点只在有限方向可见，单张照片无法完整呈现视角切换；柱镜图像不通过光波干涉重建，不是全息。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/lenticular-print)；固定详情快照 `effects/lenticular-print.json`，SHA-256 `4ed1a465dc04cc5a0c8a8d46b99079279281ab145b731c9acb1f93d81d90ef6a`。
**Atlas 所列参考：** [原始参考页面](https://emuseum.mfah.org/objects/151779/parallax-panoramagram-by-look-magazine)。

## atlas:levels-stretch · 黑白场电平拉伸

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 将输入最暗和最亮端映射到黑与白，再线性拉开中间调，增强整体对比；黑白剪切点决定有效灰阶范围。
**必要输入与条件：** 先设黑场、白场输入点和输出端点；对低反差影像分别检查阴影细节与高光层次。
**区别与边界：** 输入端点选过窄会截掉暗部或亮部细节；这是全局色阶伸展，不是按局部区域单独增强。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/levels-stretch)；固定详情快照 `effects/levels-stretch.json`，SHA-256 `a9850ed79ac642c284df1938dafe9f171e6e8d9cf6b53f0ea04400a9890f471d`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Coffee_art_and_iphone_(Unsplash).jpg)。

## atlas:light-field-refocus · 光场照片后期重对焦

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 微透镜阵列在曝光时记录光线位置和方向，软件可从采样中重建不同对焦距离，让前后景清晰面在拍摄后切换。
**必要输入与条件：** 需要光场相机/微透镜阵列采集和对应重建软件；依次选择前景、主体和背景焦平面核对细节。
**区别与边界：** 普通单次照片没有足够方向采样，不能只靠普通模糊滤镜重建；与拍摄时移动焦点的rack focus时机不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/light-field-refocus)；固定详情快照 `effects/light-field-refocus.json`，SHA-256 `1d41973eca80eaf46b49cfb8395266d4aa87bca1bfbc4661232d232dd2e85ca4`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Lytro)。

## atlas:light-leaks · 胶片漏光

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 未按预期路径进入相机的光额外曝光胶片，常从边缘渗入彩色雾带或局部泛白；数字渐变可以模拟外观但不是相机故障证据。
**必要输入与条件：** 历史解释可用漏光底片或档案图；模拟时把半透明光带放在合理入光边缘并保留原画面主体。
**区别与边界：** 真实漏光不可精确控制且可能毁片；数字色带可以是有意装饰，不应据此推断拍摄时真的漏光。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/light-leaks)；固定详情快照 `effects/light-leaks.json`，SHA-256 `8012160efd2801e5f28ebaabcbc91e633acd17c86d4bd41bb0bffee7c90bee55`。
**Atlas 所列参考：** [原始参考页面](https://www.lomography.com/school/what-are-light-leaks-in-film-photography-fa-ver5orlj)。

## atlas:light-painting · 长曝光光绘

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 在长曝光期间移动小灯或逐次照亮主体，让光源轨迹成为画面中的绘线或局部补光；轨迹由有意编排的动作形成。
**必要输入与条件：** 需要固定相机、较暗环境与可控移动光源；可在画外移动光源来分段照亮不同主体区域。
**区别与边界：** 相机移动会使背景拖影，曝光过长会累积环境光；安全实现可用手电或LED，无需火焰。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/light-painting)；固定详情快照 `effects/light-painting.json`，SHA-256 `ef05b811a01be632528763cdf6648d9fb4c26284dad6698aac666a2a75e349fa`。
**Atlas 所列参考：** [原始参考页面](https://www.museoreinasofia.es/en/collections/artwork/space-writing/)。

## atlas:light-trails · 移动光源长曝光轨迹

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 固定相机敞开快门一段时间，移动灯光在画面里积成连续亮线；记录的是曝光期间光源经过的路径，不是空间里固定的线。
**必要输入与条件：** 需稳定机位、长曝光与运动灯源；在道路等场景选择安全位置，比较不同曝光时长。
**区别与边界：** 不移动相机，主要移动的是光源；车灯轨迹不同于主动绕主体作画的光绘，亮度过强会让路径失去层次。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/light-trails)；固定详情快照 `effects/light-trails.json`，SHA-256 `fd0b1cda8c8d58783738aaf0f924d49def4196095cb8c307230bbc25bd6146f0`。
**Atlas 所列参考：** [原始参考页面](https://nikonschool.co.uk/hints-and-tips/how-to-capture-light-trails)。

## atlas:limited-animation · 有限动画

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 用少量关键绘图、重复循环和分层局部运动来完成动作，其余姿势可保持多帧不变；节奏、剪辑和声音共同传达动作。
**必要输入与条件：** 先选出需要变化的眼口、手臂或道具，再设计停留帧、循环和切点；检查无声观看时动作是否仍清楚。
**区别与边界：** 静态图形化造型不自动等于有限动画；若保持姿势过久又缺少声音或节奏支撑，动作会显得停滞。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/limited-animation)；固定详情快照 `effects/limited-animation.json`，SHA-256 `8980f179b33ba964e9441cb180882a2a25e48e0f99dbeb1ddb8d31de9fbe1703`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Dover_boys_triple_knockout.png)。

## atlas:linear-motion-blur · 线性运动模糊

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 沿同一方向用线性核累积偏移像素，让所有细节产生平行拖尾；角度和长度控制模糊方向与距离。
**必要输入与条件：** 输入图像后设定运动方向、核长度和强度；适合示意单一方向的快速位移。
**区别与边界：** 整幅统一拖影是算法示意，不代表真实运动轨迹；圆周运动、不同物体速度或遮挡变化不能用一条线核准确表示。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/linear-motion-blur)；固定详情快照 `effects/linear-motion-blur.json`，SHA-256 `e4ea8c191e5a591c307e0c9b46571bbd60e0b2909e23a4b1b5a46fb215f684bf`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:lineart-control · 线稿控制图

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 平滑并简化边缘，再反相为白底黑色轮廓，保留主体外形和关键内部线条；输出可作为生成控制输入。
**必要输入与条件：** 需要原图与边缘阈值/简化强度；先删去不承担结构作用的纹理线，再检查脸部和服装轮廓。
**区别与边界：** 线稿是图像结构条件而非语义描述；细节过多会造成控制线拥挤，过少则丢失姿势和面部特征。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/lineart-control)；固定详情快照 `effects/lineart-control.json`，SHA-256 `12fec33ce6a2df67d422488f958790e40d7f12617df5c042aae87036788f8e93`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:lippmann-interference-photography · 李普曼干涉彩色摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 驻波在感光层内留下细微层状结构，显影后选择性反射特定波长，彩色随观看角度变化；颜色来自结构干涉而非染料。
**必要输入与条件：** 历史复现需要高分辨感光层、干涉记录与适当反射光；展示时以角度变化说明结构色。
**区别与边界：** 角度依赖且难由普通屏幕照片还原；不能与染料彩印、照片石印或一般彩虹叠色混淆。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/lippmann-interference-photography)；固定详情快照 `effects/lippmann-interference-photography.json`，SHA-256 `2100fb73721ea6123ed1b5a3f21fb8af858c115afa3024b47747577909cfc8bf`。
**Atlas 所列参考：** [原始参考页面](https://www.nobelprize.org/prizes/physics/1908/lippmann/facts/)。

## atlas:liquid-glass-interface · 液态玻璃界面

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 圆角半透明控件浮在内容上方，通过背景模糊、局部折射、明亮边缘和随交互变化的形状暗示厚玻璃；实际改变的是屏幕像素。
**必要输入与条件：** 需要可见背景、实时模糊/位移、高光边缘与交互状态；滚动内容时检查控件边缘变形和文字可读性。
**区别与边界：** 磨砂玻璃主要模糊透底，液态玻璃还强调折射、亮边与流动形变；视觉模拟不等于真实材料光路计算。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/liquid-glass-interface)；固定详情快照 `effects/liquid-glass-interface.json`，SHA-256 `abd2514165ffa31038b4b6e7878a4f027c4a7f1a55de1fb587e0423f51f651fb`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:IOS_App_8.0.0_Article.png)。

## atlas:liquid-light-show · 液体光影现场投影

**视觉家族：** 实拍、舞台与模型特效（`atlas-family:practical-effects`）。
**可见效果与关键机制：** 把油、水、甘油或染料夹在透明表面间并移动，再用多台投影叠合，形成持续变化的色岛、气泡和流动边界；是现场手法家族。
**必要输入与条件：** 实物需透明承载片、光源、投影设备和暗场；也可用录制素材与音乐同步作为投影背景。
**区别与边界：** 图样来自现场混合与移动，不是固定单一滤镜；控制和随机性并存，静态截图只能显示某个时刻。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/liquid-light-show)；固定详情快照 `effects/liquid-light-show.json`，SHA-256 `ead8950d8944d7ed595e8ee9544c9097b0af525b800648f1b97c66acfa71ca43`。
**Atlas 所列参考：** [原始参考页面](https://www.moma.org/collection/works/200467?classifications=12&include_uncataloged_works=1&locale=en&page=3)。

## atlas:liquify · 液化局部变形

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 通过一组局部形变笔刷推挤、膨胀、收缩或旋转像素区域；邻近直线也会随位移场弯曲。
**必要输入与条件：** 输入图像并对需要变形的区域划定笔刷范围；用背景边缘检查扭曲影响是否越界。
**区别与边界：** 液化不会自动识别人脸或身体结构；局部线条弯曲能暴露处理范围，不能把它当成真实物体体积变化。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/liquify)；固定详情快照 `effects/liquify.json`，SHA-256 `ed103bfe4bdfd1c818c6b6e7c78da5dad6916f14078cb02b88f6846b39301bf6`。
**Atlas 所列参考：** [原始参考页面](https://helpx.adobe.com/photoshop/desktop/effects-filters/artistic-stylize-filters/overview-of-liquify-filter.html)。

## atlas:liquify-brush · 局部液化笔刷

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 以笔刷中心和笔划方向建立有限范围的位移场，拖动邻近坐标并让形变向未处理区域渐隐；只移动图像像素。
**必要输入与条件：** 设置每笔刷的中心、半径、方向和强度；在多个位置分别施加局部推拉，保留背景参照线观察范围。
**区别与边界：** 它不理解物体边界，笔刷跨过轮廓时会一并扯歪背景；示意滤镜不是神经形状重建。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/liquify-brush)；固定详情快照 `effects/liquify-brush.json`，SHA-256 `d7a4b7da2093540ce63e8827ca399fa5008734133c1bf85c2babc0154f27e67a`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:lith-printing · Lith 慢显影印相

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 黑白相纸过曝后用稀释Lith显影液缓慢处理，暗部出现颗粒性化学增殖，亮部保留柔和暖色，形成深浅双重质感。
**必要输入与条件：** 需黑白相纸、稀释显影液、曝光与时间控制；数字模拟可分别组织暖亮部和粗颗粒暗部。
**区别与边界：** 颗粒和双色来自实际显影过程，不是整片棕褐染色；化学反应对时间与药液敏感，数字外观无法复现银盐生长。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/lith-printing)；固定详情快照 `effects/lith-printing.json`，SHA-256 `bb970ce34bf4bc2a6ab668556e049735d0d617dc0f388ddf8494258993bd7f0d`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Photographic_printing)。

## atlas:lithophane · 透光瓷板浮雕

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 瓷板厚度变化控制背光透过量，薄处发亮、厚处变暗，形成连续明暗影像；正面光下则可见浅浮雕。
**必要输入与条件：** 需有厚度映射的瓷板或3D打印浮雕和背光源；分别从正面照明与透射照明观察图像如何显现。
**区别与边界：** 明暗由材料厚度和透射光产生，不靠表面颜料；只有正面照明时图像层次会明显减弱。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/lithophane)；固定详情快照 `effects/lithophane.json`，SHA-256 `fdef90605d5657c57d3dc28d207427520b0b9d8e37e7d7987f3636d0a1e82611`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Lithophanie_%E2%80%93_St%C3%B6vchen,_Messing,_D2162.jpg)。

## atlas:local-binary-pattern · 局部二值纹理编码

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 把邻域像素逐个与中心亮度比较并编码为二进制纹理模式，形成密集浮雕状微图案；可区分皮肤、布料等局部纹理。
**必要输入与条件：** 设定邻域半径和采样点数；对照平滑皮肤与织物纹理，调整编码图显示范围。
**区别与边界：** 编码反映局部纹理而非物体身份，无法保留完整原始色调；邻域尺度改变会改变细纹理响应。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/local-binary-pattern)；固定详情快照 `effects/local-binary-pattern.json`，SHA-256 `2f92d497516427640d45ef8cb01b81350f0c4c555409e0d0ca6545ec93d947e8`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:lomography · Lomography 随拍实践

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 以玩具相机、胶片选择和随手取景进行实验性拍摄，可能出现强色彩、暗角、失焦或漏光；它是拍摄文化与多种做法，不是一种固定滤镜。
**必要输入与条件：** 可用不同相机和胶片做系列实验，保留每张的光线、曝光与取景差异；选择有意外性的单张而非套同一预设。
**区别与边界：** 暗角、饱和和漏光都不是必有特征；不能用单一数字滤镜概括多样实践，也不能承诺每次都会得到同一种缺陷。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/lomography)；固定详情快照 `effects/lomography.json`，SHA-256 `c57a06250838f7109af0540c8258b3220b358cb2f1af22c4e525da23748f0c45`。
**Atlas 所列参考：** [原始参考页面](https://www.lomography.com/about/history)。

## atlas:long-exposure-water · 慢门流水柔化

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 相机固定时用较长曝光累积水流亮度，涟漪和飞溅平均成雾状丝带，静止岩石与树木保持清晰。
**必要输入与条件：** 需要三脚架、秒级曝光和水流；日间常需减光滤镜避免过曝，并检查静物边缘是否稳定。
**区别与边界：** 模糊只出现在曝光期间移动的水体；有意移动相机会让整个画面拖影，不能与慢门水流效果混称。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/long-exposure-water)；固定详情快照 `effects/long-exposure-water.json`，SHA-256 `20d3eb17e0378777ce886e439893e18f3d16682f02b7a9d5f1babbf6cbff962e`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Tad_Hang_waterfalls_at_sunset,_Tad_Lo_village,_Bolaven_Plateau,_Laos.jpg)。

## atlas:lora-style-adapter · LoRA 风格适配器

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 低秩适配器以较小参数改动影响生成模型的风格倾向；条目用可调强度作类比展示，不代表示例图真的经过模型推理。
**必要输入与条件：** 实际使用需基础生成模型、已训练LoRA权重和权重强度；比较不同强度下风格与原主体的保留。
**区别与边界：** 本条是示意图而非神经网络执行结果；适配效果依具体训练集、基础模型与提示条件，不能把强度滑杆概念当通用接口。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/lora-style-adapter)；固定详情快照 `effects/lora-style-adapter.json`，SHA-256 `6818ef67549fe9af239015f730563bb173267bcdd6683be59ada32348b99b509`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:LoRA-Machine-Learning.png)。

## atlas:low-poly · 低多边形网格风格

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 用稀疏三角网格搭建三维表面并以平面着色暴露面片，让曲面成为锐角多边形和离散色阶；不同于二维方格像素艺术。
**必要输入与条件：** 需要低面数模型、三角网格与平面着色；按轮廓复杂度调面数，并让相邻面颜色承接光照方向。
**区别与边界：** 面数过低会破坏身份和外轮廓；它仍有三维空间网格，不是把图片缩成低分辨率像素块。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/low-poly)；固定详情快照 `effects/low-poly.json`，SHA-256 `813fded64587d86b6750466a6596ee91c8aa57a03001f7f3349b35a087e382ef`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Joe_low_poly.png)。

## atlas:luminance · 加权明度灰阶

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 按RGB各通道权重合成单一亮度值，再以黑白灰显示；色相消失，但不同亮度的形状关系可继续辨认。
**必要输入与条件：** 输入彩色图并选择亮度权重；对照哪些边缘由色差支撑、转成灰阶后仍然可见。
**区别与边界：** 相同亮度的异色区域会合并成相近灰度；权重决定主观明暗，不等于简单取RGB平均。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/luminance)；固定详情快照 `effects/luminance.json`，SHA-256 `2fba0d8738762998fa0ec78d61f1b838afebd5f962430b0c134e30e06e484fbd`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:m-lsd · M-LSD 长直线结构检测

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 从图像中提取较长的直线段，以少量结构线概括建筑、家具等轮廓；此条按霍夫线图作技术近似，不代表运行了M-LSD模型。
**必要输入与条件：** 使用含直线边缘的图像，设置线段长度与阈值；在建筑、桌椅等结构场景检查线段覆盖。
**区别与边界：** 真实曲线和短小细节不会被长线段表达；本条属于示意图，不可声称模型推理或精确M-LSD输出。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/m-lsd)；固定详情快照 `effects/m-lsd.json`，SHA-256 `1591724c0387be9d48599ad511fabe58af06ce4ecb98144154e529a13623147c`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:magnetic-crt-distortion · 磁场扰动 CRT 显像

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 外加磁场改变阴极射线管电子束偏转，使扫描影像弯成波浪和发光环；它是显示设备受扰，不是摄像机对屏幕形成的递归反馈。
**必要输入与条件：** 历史复现可用数字扫描线扭曲示意；表现时让扭曲局部绕虚拟磁场中心弯曲。
**区别与边界：** 不要把磁铁靠近现代电子设备；不同于摄像机对着显示器形成的反馈循环，数字效果也不说明具体CRT内部轨迹。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/magnetic-crt-distortion)；固定详情快照 `effects/magnetic-crt-distortion.json`，SHA-256 `cf34f3e38a56ae289aff71dee8160095cfce501e713f1d53c4d7a9a155940ee5`。
**Atlas 所列参考：** [原始参考页面](https://whitney.org/collection/works/6139)。

## atlas:mandelbrot-set · 曼德博集合迭代图

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 逐点迭代复数关系并按逃逸速度着色，核心集合常呈黑色，边界外形成细密螺旋与缩放重复结构；纹理来自严格数学计算。
**必要输入与条件：** 需要复平面坐标、迭代次数和逃逸阈值；递增缩放时提高采样分辨率以保留边界分枝。
**区别与边界：** 核心集合之外的彩色区域表示逃逸速度，不是集合本体；有限分辨率和迭代次数会限制无限细节。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/mandelbrot-set)；固定详情快照 `effects/mandelbrot-set.json`，SHA-256 `50c58fdb6a6baddd5c775ca76c20e6e97964d856e78cdacae56959c4d8792490`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Mandelbrot-Menge_mit_Regenbogenfarben_20201028.png)。

## atlas:masked-generation · 蒙版控制生成

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 用二值蒙版指定允许重绘的区域，生成系统只在该范围内合成候选内容；周围图像提供环境和纹理条件。
**必要输入与条件：** 实际局部生成需原图、边界清楚的蒙版及支持局部重绘的模型；检查透视、阴影与材质连接。原理示意可手工绘制蒙版展示允许修改的区域，不声称完成生成。
**区别与边界：** 示例分类为概念示意而非真实推理；蒙版内的新图像不恢复被遮挡的历史内容，只是根据上下文生成 看似连贯的续补。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/masked-generation)；固定详情快照 `effects/masked-generation.json`，SHA-256 `d8ef5e86aea337b4d6059e07d06ac840d7672158390061886a8e6691318cf36b`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:match-cut · 形状匹配剪接

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 在两个镜头间直接切换，使前后对象的大小、位置、轮廓或运动方向对齐，从视觉相似中建立思想联系；与同镜头跳切目的不同。
**必要输入与条件：** 需两个镜头和对齐参照点；在切点检查轮廓、尺度和屏幕位置是否连续。
**区别与边界：** 匹配关系若弱会像普通剪切；渐隐会放慢连接，跳切则强调同一构图中的时间缺口，不能互相替代。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/match-cut)；固定详情快照 `effects/match-cut.json`，SHA-256 `aa5921c1252efa977e0d54417fdbad755c5810c324fd7d9908bd78dd93a8ea35`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Match_cut)。

## atlas:matrix-digital-rain · 矩阵式数字雨

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 绿色字符沿独立竖列下落，列首更亮、尾迹渐暗且符号持续变化；它像发光文字流，不是整屏终端同步滚动。
**必要输入与条件：** 需要字符集、列位置、下落速度、亮度衰减和背景；保持列间速度与长度差异并留出识读空间。
**区别与边界：** 每列若同速同长会失去独立流动感；尾迹是程序化亮度图案，不是长曝光记录。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/matrix-digital-rain)；固定详情快照 `effects/matrix-digital-rain.json`，SHA-256 `3e26fa904e312cdee1d5f836bf63c0c42bf69c9b86efe63d2a023cdf35da2a0e`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Cmatrix.png)。

## atlas:mean-shift-segmentation · 均值漂移区域分割

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 在颜色与像素位置联合空间中寻找密集模式并将相近像素向簇中心移动，合并成大块均匀区域；视觉上简化纹理和色面。
**必要输入与条件：** 调整颜色半径与空间半径，比较小尺度纹理和大块色区的合并程度。
**区别与边界：** 带宽过大会把不同对象合并，过小则区域过碎；区域依颜色与位置聚类，不直接对应语义类别。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/mean-shift-segmentation)；固定详情快照 `effects/mean-shift-segmentation.json`，SHA-256 `71ee2b3f3d0e75480f2f71e822f180c3c51aebc86a9c9e5e7b1120c78edfb8d0`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Derelict_train_carriage_(Unsplash).jpg)。

## atlas:median-filter · 中值滤波

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 用邻域像素的中间排序值替换中心像素，可压掉孤立亮暗点并相对保留硬边；加入椒盐噪声后容易观察其效果。
**必要输入与条件：** 设定邻域窗口大小，优先处理孤立脉冲噪声；比较滤波前后的边缘与细纹。
**区别与边界：** 窗口过大会抹平细小纹理和窄线；它按排序取值，不是高斯平均，不能用来处理连续运动模糊。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/median-filter)；固定详情快照 `effects/median-filter.json`，SHA-256 `56eb2e2e2a7e637f924dad61add0bb2a994554d60201cdfa4c17768554b91f76`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:mezzotint · 数字 mezzotint 颗粒版画

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 用密集、非规则点粒构成天鹅绒暗部和连续中间调，模拟金属版凹点承墨的质感；本条是数字点纹输出。
**必要输入与条件：** 需要限定黑白点尺度、密度和纸底；让阴影聚点、亮部留白，中间调逐渐疏散。
**区别与边界：** 数字颗粒只是版画观感近似，不等同真实 mezzotint 版面粗化与刮亮工艺；点粒过大将退化为普通网点。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/mezzotint)；固定详情快照 `effects/mezzotint.json`，SHA-256 `f1540868fc47985c2491507b88cb999cf5fd393cbd58d7b8f0c8a2785a044dff`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Bocachico_(Unsplash).jpg)。

## atlas:miniature-effects · 实体微缩模型拍摄

**视觉家族：** 实拍、舞台与模型特效（`atlas-family:practical-effects`）。
**可见效果与关键机制：** 用精细搭建的缩小布景和合适机位、光线与拍摄速度拍成仿真大场景；相机贴近模型中人物的眼高可加强真实尺度。
**必要输入与条件：** 需要按画面尺度制作模型、匹配镜头视角与照明，并控制景深、重力表现和运动速度。
**区别与边界：** 水、火、重力和浅景深容易暴露模型比例；机位靠近模型不保证它自动显得巨大。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/miniature-effects)；固定详情快照 `effects/miniature-effects.json`，SHA-256 `75d9ec5a1e9152fac135420b4775ae97d970b7cef728f64048914a4f226095d3`。
**Atlas 所列参考：** [原始参考页面](https://www.wetaworkshop.com/projects/the-lord-of-the-rings-the-two-towers)。

## atlas:miniature-faking · 实景微缩错觉

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 把真实城市或景物拍出玩具感，常以高视角、窄焦平面、鲜明颜色和延时强化小尺度错觉；不是实际搭建的微缩模型。
**必要输入与条件：** 实拍移轴错觉需要有明显空间层次的远景与可控焦平面；数字场景可用深度蒙版或模糊带模拟，不必强制采用真实远景。分别检查前、中、后景过渡及焦点带是否自然。
**区别与边界：** 倾斜焦平面是微缩错觉关键，shift主要校正透视；真实模型拍摄与实景微缩错觉是两种制作。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/miniature-faking)；固定详情快照 `effects/miniature-faking.json`，SHA-256 `8bf57a54830c14c7aeb3e40ff8167fea0cf4f9f593280b4ef1b224f4fd9849b3`。
**Atlas 所列参考：** [原始参考页面](https://vimeo.com/1831024)。

## atlas:mirror-repeat · 镜像重复拼贴

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 将图像缩小成网格单元、偏移排列并交替镜像，使相邻副本形成不同的边缘对称关系；重复本身不必无缝。
**必要输入与条件：** 需要单元裁切、缩放和水平/垂直镜像规则；先做四格对照，再扩展网格和轴向。
**区别与边界：** 镜像重复与无缝平铺不是同一种边缘连接方式；单元轴线或尺寸不同会产生明显拼缝和方向跳变。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/mirror-repeat)；固定详情快照 `effects/mirror-repeat.json`，SHA-256 `debf94379fefcc616a346e7e0b68846fb12332cfa1704c9fd7661e493cfcfaac`。
**Atlas 所列参考：** [原始参考页面](https://testing.docs.gimp.org/2.4/en/plug-in-small-tiles.html)。

## atlas:mirror-tiling · 镜面对称网格铺排

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 将图像象限或矩形片段沿水平、垂直轴翻转并规则铺成对称纹样，格线两侧产生对应倒影。
**必要输入与条件：** 设定切分象限、镜像轴与平铺行列；检查共享边缘是否对齐并形成预期对称。
**区别与边界：** 它按固定四象限或矩形格重复，和任意缩放偏移的镜像拼贴不同；对称轴不匹配会出现接缝。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/mirror-tiling)；固定详情快照 `effects/mirror-tiling.json`，SHA-256 `2ab47a6c0ee14d0c1b9c88cad4fd2fd00518a67d511571ab5fe65af451f476c7`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:mobius-transformation · 莫比乌斯复变映射

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 用复平面分式映射把图像坐标弯成大弧与尺度压缩区；在分母非零处保持局部角度关系，图像通过逆映射采样。
**必要输入与条件：** 需要复数参数a、b、c、d并满足ad−bc不为零；调参数观察直线如何变成圆弧及区域尺度如何改变。
**区别与边界：** 接近映射极点时尺度会急剧放大，画面可能裁切或采样稀疏；它是二维坐标变换，不是把照片变成立体莫比乌斯带。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/mobius-transformation)；固定详情快照 `effects/mobius-transformation.json`，SHA-256 `1227c0c2c012841986c4e2ec7a5df111d0528cd2bcf93b01db7edbd61fd163b7`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Mainz,_Germany_(Unsplash_sMHhx5m3MbM).jpg)。

## atlas:mode-7 · Mode 7 平面透视变换

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 逐行变换一张二维地面贴图，让平面纹理随视角缩放、旋转并延伸到地平线；人物等角色通常仍是叠在上层的二维精灵。
**必要输入与条件：** 需要平面地图、扫描线坐标变换和覆盖精灵；以道路或地板纹理观察近大远小效果。
**区别与边界：** 不计算网格顶点的XYZ空间，也不能让平面物体自由绕转；只变换背景地面层，不等同完整三维场景。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/mode-7)；固定详情快照 `effects/mode-7.json`，SHA-256 `e6921ad75ae6ccbd5ce4ed884a60a3a92d60a95674ec233fcc8a316917c4c9df`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Mode_7_Test-0000.png)。

## atlas:moire-pattern · 摩尔纹干涉

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 两个接近周期或方向的细密网格叠合后形成缓慢起伏的大波纹；可由几何图样相叠，也可能由图样与传感器采样网格干涉。
**必要输入与条件：** 使用细密重复纹理并缓慢改变角度、间距或缩放，观察干涉波带移动。
**区别与边界：** 几何摩尔纹与数字色彩混叠有关但不完全相同；变化源于两种尺度之间的采样关系，不是物体表面真实产生大条纹。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/moire-pattern)；固定详情快照 `effects/moire-pattern.json`，SHA-256 `3d639f629de5ffc3d626fcccfd68f89cb9850286822ba4b7a7d7ac0dcb354b18`。
**Atlas 所列参考：** [原始参考页面](https://www.nikonusa.com/learn-and-explore/c/products-and-innovation/moire-false-color)。

## atlas:monocular-depth-map · 单目深度估计图

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 模型仅凭单张图推测像素间的相对远近，再把估计值显示成灰阶距离场；这是对深度的猜测示意，不是实测距离。
**必要输入与条件：** 真实单目深度估计需输入图像和相应模型；本条可用明确标注的示意深度图解释亮暗与远近约定，不将其说成模型输出。检查前景/背景边界处的深度跳变。
**区别与边界：** 单目深度有尺度与遮挡歧义，亮暗取决于显示设定；本条分类为示意，不应声称执行了具体神经模型推理。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/monocular-depth-map)；固定详情快照 `effects/monocular-depth-map.json`，SHA-256 `f85d2f951be19be9f6ee6f6e34c445f7f76e7fb7f2aeff4b4949eb28ab335efc`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:mordancage · Mordançage 明胶浮膜工艺

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 化学漂白使黑白相纸暗部的明胶乳剂软化并可被提起、推移，形成卷曲薄幕、撕裂纹和褪白区域；改变的是印相实体表面。
**必要输入与条件：** 真实工艺需相纸、专用化学处理与安全实验条件；可用档案作品或数字纹理解释暗部乳剂浮起的形态。
**区别与边界：** 它与用光造成色调反转的solarization不同；化学反应会破坏相纸并对处理条件敏感，不宜将数字滤镜说成真实印相操作。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/mordancage)；固定详情快照 `effects/mordancage.json`，SHA-256 `b2185a52dbf293e25d18b4978ff5b6abf3449983c79ce03529655168001cf6aa`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Self_portrait_(8618889472).jpg)。

## atlas:morphological-closing · 形态学闭运算

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 对亮前景先膨胀再腐蚀，连接邻近亮区并填平小暗孔、窄暗缝，整体区域外形大致保留。
**必要输入与条件：** 输入二值或灰度掩码并选结构元素形状与尺寸；按需填小孔或连通相邻亮片。
**区别与边界：** 结构元素过大可能把不应连接的对象粘在一起，细窄暗道也会被抹掉；它是区域形态操作，不是普通模糊。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/morphological-closing)；固定详情快照 `effects/morphological-closing.json`，SHA-256 `52160e9c614b8afbaa615b5524c15845e6d5c66436800a2518752814d6d2ed23`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:morphological-gradient · 形态学梯度边缘带

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 用平坦结构元素分别膨胀取邻域亮值、腐蚀取暗值，再相减得到局部明暗范围；物体边界和细纹理形成亮带，均匀区趋暗。
**必要输入与条件：** 设结构元素形状和邻域尺寸；增大尺寸会让边缘带变宽并合并邻近细节。
**区别与边界：** 结果显示局部差异大小，不显示梯度方向；结构元素过大容易吞并细轮廓。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/morphological-gradient)；固定详情快照 `effects/morphological-gradient.json`，SHA-256 `00e7f74f803811be90130f09d336def905c88f4ccd96665f9e2b90b58d88c2a9`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Dusk_on_beach_shore_(Unsplash).jpg)。

## atlas:morphological-opening · 形态学开运算

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 先腐蚀再膨胀亮前景，可去掉小亮点、窄亮突起和孤立噪声，同时大块亮区大致保留。
**必要输入与条件：** 选择二值/灰度掩码、结构元素形状和尺度；按噪声大小测试被移除的亮点范围。
**区别与边界：** 窄小物体或亮线也可能被删除；尺度过大会改变轮廓，不能把输出当成保留所有亮细节的降噪结果。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/morphological-opening)；固定详情快照 `effects/morphological-opening.json`，SHA-256 `e198bcdb4424268073954455187a0b552adbacbc69ff77db3ec408c01dc9350e`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:motion-blur · 曝光期间运动模糊

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 快门开启期间主体或相机移动，影像信息沿运动路径铺开成有方向的拖影；失焦则来自主体偏离对焦平面，成因不同。
**必要输入与条件：** 通过快门时长和主体/相机运动控制拖影；固定机位可保留背景清晰，只让移动物体模糊。
**区别与边界：** 相机移动会让全画面一起拖影，主体移动则可能只模糊主体；单一滤镜不能准确模拟遮挡变化和真实快门轨迹。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/motion-blur)；固定详情快照 `effects/motion-blur.json`，SHA-256 `0129ebb33b704efecab2349bdfd0d8c80593a865c9c1dc8cead481bdeceb570a`。
**Atlas 所列参考：** [原始参考页面](https://www.moma.org/artists/16790-anton-giulio-bragaglia)。

## atlas:motion-capture · 动作捕捉与骨架重定向

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 传感器或标记记录真人动作，再映射到数字骨架；映射后仍需校正姿势、比例、面部表情和渲染，捕捉数据不是成片。
**必要输入与条件：** 需要动作表演、标记/传感采集、骨架定义和目标角色；检查手脚接触、重心与转身动作。
**区别与边界：** 不同体型骨架的关节范围和比例不同，映射会失真；面部细节未必来自同一套捕捉数据。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/motion-capture)；固定详情快照 `effects/motion-capture.json`，SHA-256 `94f56bf21432617e77f80ed1adbb481a2d9345ac76e06ae7bf0e7962ac471af2`。
**Atlas 所列参考：** [原始参考页面](https://www.wetafx.co.nz/films/case-studies/gollum)。

## atlas:motion-control-photography · 重复路径运动控制摄影

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 马达让相机精确重复同一轨迹，分别拍摄模型、灯光或背景层后合成，使各层透视和移动可对齐；关键是可重复摄影机运动。
**必要输入与条件：** 需可编程摄影机轨迹、稳定模型/布景和分层曝光；每次拍摄记录同一镜头路径并做套准。
**区别与边界：** 它控制相机重复运动，不是记录表演动作的motion capture；轨迹误差会使叠层错位，不能等同普通自动摄像。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/motion-control-photography)；固定详情快照 `effects/motion-control-photography.json`，SHA-256 `2b751116d5b242dd29c27c405d3e281fb37b0009a1926b3a990671a0ea9c7d69`。
**Atlas 所列参考：** [原始参考页面](https://www.lucasfilm.com/news/lucasfilm-originals-the-dykstraflex/)。

## atlas:motion-sequence · 连续动作摄影序列

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 在连续时刻拍摄同一动作并排呈现，让动作阶段同时占据画面；也可再按序播放成运动，不是逐格操纵玩偶的定格动画。
**必要输入与条件：** 需要相机位置与尺度稳定的连续照片；按动作关键时刻排序，可拼成网格或简短序列。
**区别与边界：** 拍摄间隔过大会漏掉动作细节；静态网格把时间铺成空间，不能自动表现连续播放速度。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/motion-sequence)；固定详情快照 `effects/motion-sequence.json`，SHA-256 `5535b9b994d874a2ddebb4646ca4fe9add967ca59c5ced5c066a125dcf76da4d`。
**Atlas 所列参考：** [原始参考页面](https://www.loc.gov/item/2005684184/)。

## atlas:mser-regions · MSER 稳定极值区域

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 在多个亮度阈值下追踪连通明暗区域，选择面积在邻近阈值间变化最小的斑块；可突出文字、窗格等稳定区域而非所有边缘。
**必要输入与条件：** 需灰度图、阈值范围和区域稳定性参数；对照字形、建筑窗格与叶片纹理，筛选合适区域。
**区别与边界：** 稳定区域不等于语义对象，纹理可能产生大量重复斑块；照明变化或阈值区间不当会漏掉目标。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/mser-regions)；固定详情快照 `effects/mser-regions.json`，SHA-256 `39de41b3e564f5e15530ec41abb9af002e8063eab0ceaf86c4e2fb42f2ccb3f1`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Letchworth_Garden_City,_United_Kingdom_(Unsplash_PYpPX76yZ1A).jpg)。

## atlas:multi-scale-retinex · 多尺度 Retinex 光照校正

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 对多种模糊尺度的图像与原图对数值作差，再平均结果，以压低宽缓照明差、抬起阴影局部细节并增强局部对比。
**必要输入与条件：** 设置多档高斯尺度和输出色彩平衡；检查暗部纹理、亮边光晕和自然颜色是否协调。
**区别与边界：** 尺度选择不当会出现亮边halo、噪声放大或色偏；局部对比增强不会创造原图中不存在的真实细节。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/multi-scale-retinex)；固定详情快照 `effects/multi-scale-retinex.json`，SHA-256 `51a4cd9ba9d33e1c8e50ee81fe6ff06530b792f2eadc73a5ce6d323c4805379a`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Rusu_George_Lucian_2016-04-12_(Unsplash).jpg)。

## atlas:multiplane-camera · 多平面摄影机

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 把绘制好的前中后景分层放在不同距离的玻璃片上，移动摄影机产生不同速度的视差，让二维动画获得纵深。
**必要输入与条件：** 需要可分层的绘景、透明支架和相机运动；先设前后景间距，再安排推近或横移以显出视差。
**区别与边界：** 与放大一张平面图片的简单缩放不同；玻璃层距不足或移动幅度过大会露出分层边缘和空洞。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/multiplane-camera)；固定详情快照 `effects/multiplane-camera.json`，SHA-256 `a44a81a2082dd259a48af1ee4c75bce13a1934873d8bc4c14e0fb962211f695b`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Multiplane_camera)。

## atlas:neon-sign-glow · 霓虹灯管光效

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 低压气体放电使玻璃管连续发光，圆弯管线形成均匀笔画并在暗环境外扩出柔和光晕；LED仿制品使用半导体发光。
**必要输入与条件：** 历史复现可用真实霓虹招牌或数字管形描绘；设置连续笔画、圆滑弯折、管芯亮度和外围辉光。
**区别与边界：** 光色由气体和荧光涂层决定，并非只有红橙色；真实放电设备需专业制造，数字LED外观不能证明用了气体灯管。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/neon-sign-glow)；固定详情快照 `effects/neon-sign-glow.json`，SHA-256 `84e3d58ae8c168a50395332389385e312d25a3fc720b05ffc65219c277d3fa22`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Neon_sign_outside_a_bar,_not_Billy_Bob%27s,_which_is_a_separate_night_club_and_dance_hall_nearby,_in_the_Stockyards_District_of_Fort_Worth,_Texas_LCCN2014632898.tif)。

## atlas:neumorphism · 新拟态界面

**视觉家族：** 插画媒材与笔触（`atlas-family:illustration-material`）。
**可见效果与关键机制：** 在与控件同色的底面上用相反方向的柔和明暗投影，暗示按钮浅浅凸起或内凹；主要依靠阴影塑形，不模仿皮革金属等独立材料。
**必要输入与条件：** 需要同色背景、圆角控件和一致的光照方向；凸起与内凹状态分别测试，保留清楚的操作标签。
**区别与边界：** 阴影太轻会让控件像没有边界，层级和可操作性不明；不同于投影到独立卡片下方的常规阴影。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/neumorphism)；固定详情快照 `effects/neumorphism.json`，SHA-256 `031834d3b81019ad8dea1ef43fbb13e65fc982485caf1dbcc4cd1c880c93d123`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Neumorphism-fixed.jpg)。

## atlas:neural-radiance-fields · 神经辐射场 NeRF

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 用多视角照片拟合连续场景表示，再按新相机位置合成视图；视角变化可显露新的遮挡关系，不是仅在平面照片上做视差。
**必要输入与条件：** 需要覆盖场景的多角度影像、相机位姿与训练/重建流程；验证未见视角中的轮廓、深度和光照连续。
**区别与边界：** 输入视角缺失会使新视图漂移，反光、玻璃和透明体仍可能难重建；场表示不等于完美几何或物理光线模拟。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/neural-radiance-fields)；固定详情快照 `effects/neural-radiance-fields.json`，SHA-256 `15e1375dc41116d1c40fbaf2a0e4c01b3c9e06fecb868f2c725bbed00291ed16`。

## atlas:neural-relighting · 神经重打光

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 模型预测固定视角图像在另一种照明下的像素变化，重排阴影与高光；部分方法显式估计几何，另一些直接生成外观变化。
**必要输入与条件：** 需人像/场景图、指定光源方向与颜色条件；检查鼻影、面颊、眼睛反光和接触阴影是否一致。
**区别与边界：** 不重新拍摄或改变原始曝光；透明、反光材质可能被误判，局部阴影推断不代表真实物体几何。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/neural-relighting)；固定详情快照 `effects/neural-relighting.json`，SHA-256 `b98390fbe8c5bb9f0dd20b1af8115d86287f1b35ced47ad147b9225de65b56e1`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Neural_network_(machine_learning))。

## atlas:neural-style-transfer · 神经风格迁移

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 把内容图的结构特征与风格图的纹理统计组合，保留大体轮廓却重组表面笔触和色彩；不是只叠色或模糊的普通预设。
**必要输入与条件：** 需要内容图与风格参考图，并平衡两种特征权重；检查主体形状是否仍清楚、笔触是否跟随结构。
**区别与边界：** 风格权重过高会淹没内容结构；模型重构会改变原像素与细节，不能视为未损失的图像叠加。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/neural-style-transfer)；固定详情快照 `effects/neural-style-transfer.json`，SHA-256 `6a981915ca463849c02595e1ebd409a43207aebd36272a199dbd2151cefd714b`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Jimmy_Wales_in_France,_with_the_style_of_Munch%27s_%22The_Scream%22_applied_using_neural_style_transfer.jpg)。

## atlas:night-vision · 微光夜视影像

**视觉家族：** 传感器与成像信号（`atlas-family:sensor-signal`）。
**可见效果与关键机制：** 微光传感器放大可见环境光并经荧光屏显示成绿色颗粒画面；热成像读取热辐射，二者不是同一传感原理。
**必要输入与条件：** 需要真实微光记录或明确说明为数字模拟；设置绿色磷光、有限动态范围和传感噪声，并保留可见光条件。
**区别与边界：** 给黑暗照片涂绿不会产生未记录的信息；热成像显示温度辐射而非放大微光，不能用同一外观混淆。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/night-vision)；固定详情快照 `effects/night-vision.json`，SHA-256 `dd5a7a1edd87e061b60b2fc204b6f36ccb8a162659f4d59a00bb102101f1ca65`。
**Atlas 所列参考：** [原始参考页面](https://ntrs.nasa.gov/citations/19930043196)。

## atlas:non-local-means-denoise · 非局部均值降噪

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 搜索较大范围内与当前小块相似的图像片段，再按相似度加权平均，压低随机噪点同时保留重复纹理；不同于只看邻近像素的高斯模糊。
**必要输入与条件：** 设定搜索窗口、块尺寸和滤波强度；观察重复纹理、暗部颗粒和边缘细节的保留。
**区别与边界：** 运算量随搜索范围增加；强度过高会把相似但不同的纹理平均在一起，降噪不能恢复已丢失细节。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/non-local-means-denoise)；固定详情快照 `effects/non-local-means-denoise.json`，SHA-256 `51a3aa7b5dfe6ca32ea907856a7035dda98a52a16643fad4390d4983b7aa7469`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:normal-map · 法线贴图示意图

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 用RGB三通道编码合成表面的法线方向，呈现蓝紫底与彩色角度变化；它展示朝向数据，不是物体实际颜色。
**必要输入与条件：** 需要高度场或人工构造的表面法线并使用切线空间约定；检查正面、侧向和凹凸方向颜色。
**区别与边界：** 本条是方向可视化示意，不证明从照片中准确推断出了法线；坐标约定不一致会令光照方向错误。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/normal-map)；固定详情快照 `effects/normal-map.json`，SHA-256 `f487455568f46452cf4b0f037a870ee9de73552aa92db9c505dc97615a880d27`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:normal-mapping · 法线映射

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** RGB贴图编码微表面朝向并改变光照响应，让简单网格显出细小凹凸；基础顶点和轮廓不变。
**必要输入与条件：** 需网格、法线贴图、正确的色彩数据设置和方向光；旋转灯光观察表面细节如何响应。
**区别与边界：** 它改的是着色方向，不会产生新轮廓或真实位移；纹理若被当作普通sRGB颜色读取，法线方向会错误。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/normal-mapping)；固定详情快照 `effects/normal-mapping.json`，SHA-256 `f1c974452be79a23da9b5bfa8cfe974b9542ddfdbfa9ceb20287eac41308d9f1`。
**Atlas 所列参考：** [原始参考页面](https://doi.org/10.1145/280814.280832)。

## atlas:ntsc · 复合视频色度拖散示意

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 把色差通道做水平软化，使颜色越过锐利亮度边缘扩散，并可能带轻微彩虹边；这是NTSC复合色度处理的简化外观示意。
**必要输入与条件：** 以彩色图像为源，分离亮度和色差信号后主要模糊色度；可比较彩色细节与灰阶边缘。
**区别与边界：** 本条分类为示意，不等于真实NTSC编码、调制与解码；色度拖散不能单独解释所有模拟视频条纹。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/ntsc)；固定详情快照 `effects/ntsc.json`，SHA-256 `73adf96792e80a943d91f76159e341f674406fe42b54c91e4214658f5baaac3a`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:ntsc-composite-artifacts · NTSC 复合视频串色伪影

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 亮度与色度共享复合信号带宽，细密图样可能被误读为彩色并出现爬行点、游移波纹和边缘串色；NTSC是电视系统，不是所有模拟干扰的统称。
**必要输入与条件：** 需要高频黑白条纹或强色边缘，按复合信号带宽示意彩色混叠和点爬；明确是系统原理还是后期模拟。
**区别与边界：** 不同制式与解码器会产生不同伪影；将所有扫描线、噪点或信号故障都称NTSC会掩盖具体原因。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/ntsc-composite-artifacts)；固定详情快照 `effects/ntsc-composite-artifacts.json`，SHA-256 `4a9d512e0bfe0bf9c1001ffc26e441aee6da6e6cc983b7746cc088189a35ca8a`。

## atlas:op-art · 欧普艺术视觉错动

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 高对比静态几何纹样通过密度、重复和弯曲造成震动、波浪或深度错觉；图形没有实际运动，感知变化发生在观看者视觉系统中。
**必要输入与条件：** 控制黑白/明暗反差、重复间距和几何弯曲；让图案跟随主体结构而非任意铺满画面。
**区别与边界：** 与由马达移动雕塑的动态艺术不同；高密度闪动感可能令观众不适，避免以实际快速闪烁增强错觉。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/op-art)；固定详情快照 `effects/op-art.json`，SHA-256 `bf8bf1c0043a37cb91142174a48ef9ede53fa97e363a0d4908692cc65537180c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Ambigram_Future_tessellation.png)。

## atlas:openpose · 人体姿态关键点骨架

**视觉家族：** 人脸、人物追踪与变换（`atlas-family:portrait-tracking`）。
**可见效果与关键机制：** 姿态估计器将可见身体关节转成彩色点和连杆，抽象显示手脚、肩胯的相对位置；这是骨架结构，不是人物完整轮廓。
**必要输入与条件：** 真实姿态估计需对应模型、输入图像和关键点定义；检查人物重叠、肢体弯曲与遮挡关节。讲解图可手绘点线骨架并标为示意，不声明模型检测结果。
**区别与边界：** 隐藏关节只能估计，遮挡或多人交叉会导致连错骨架；条目属示意图，不表示执行了某个模型推理。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/openpose)；固定详情快照 `effects/openpose.json`，SHA-256 `f2d3ed534baf68ce2d9e0669eba5a7c42db7b2d61aaa1093604444c3b3a72150`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:optical-flow-frame-interpolation · 光流中间帧插值

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 根据前后帧估计像素位移并生成中间画面，让慢动作更连贯；新帧是算法推断，不是相机实际拍摄记录。
**必要输入与条件：** 需要时间相邻的两帧与目标时刻；检查交叉轮廓、前后景遮挡和快速运动处的形变。
**区别与边界：** 遮挡后露出的新区域没有可追踪样本，易出现橡皮拉伸、重影或模糊；与简单帧重复、交叉淡化分别处理。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/optical-flow-frame-interpolation)；固定详情快照 `effects/optical-flow-frame-interpolation.json`，SHA-256 `7b8f84ef9cd406b0b7a907a8b4b2fe4e12c75b3cb454ed42c270805c3c4a7952`。
**Atlas 所列参考：** [原始参考页面](https://helpx.adobe.com/archive/en/premiere-pro/cc/2015/premiere_pro_reference.pdf)。

## atlas:optical-flow-vector-field · 光流位移向量场

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 对两帧或轻微错位图像估计局部像素位移，用锚定在特征附近的箭头表示方向与幅度；它是运动估计图层。
**必要输入与条件：** 输入配对图像并设定Lucas–Kanade窗口、金字塔层级或采样密度；对照全局位移和局部运动。
**区别与边界：** 相同亮度区域缺少可追踪纹理时无法唯一确定运动，遮挡也会误导；向量显示不是物体识别或真实三维轨迹。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/optical-flow-vector-field)；固定详情快照 `effects/optical-flow-vector-field.json`，SHA-256 `a551880189b83e497bc077b4a0733819d73dd788d1cfe832f2c73b4032b4f7bc`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Optical_Flow_Moon_Landing.gif)。

## atlas:optical-printer · 光学印片机合成

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 用放映机和摄影机逐帧重拍既有胶片，可放大、叠合或重组影像；多次模拟拷贝会改变颗粒、反差和画面稳定性。
**必要输入与条件：** 需逐帧投影、摄影机对位和胶片传输同步；按合成目的设置放大倍率、遮罩与叠层。
**区别与边界：** 光学印片机是可制作多种效果的设备，不是单一视觉风格；反复拷贝产生的损耗与数字合成不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/optical-printer)；固定详情快照 `effects/optical-printer.json`，SHA-256 `bbde7b63386124898d6a194d5ec0b1f1200809cf822287dd743281de21dfa8c6`。
**Atlas 所列参考：** [原始参考页面](https://collection.sciencemuseumgroup.org.uk/objects/co8236963/oxberry-optical-printer)。

## atlas:orb-keypoints · ORB 方向特征点

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 结合定向FAST角点检测和旋转BRIEF二进制描述子，在显著纹理点画圆标记，并可用于比较旋转后的匹配稳定性。
**必要输入与条件：** 需有局部角点/纹理与图像尺度；设定特征数、金字塔层级和阈值，检查点的分布与方向。
**区别与边界：** 特征点是局部描述，不是物体识别；低纹理区域或强尺度变化仍可能失配，圆圈大小不代表物体真实尺寸。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/orb-keypoints)；固定详情快照 `effects/orb-keypoints.json`，SHA-256 `be323f69a242934d2ae3d5620397049dd2af76764d13e27b7175678f9165c534`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:orton-effect · Orton 柔光叠片

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 将同一场景的清晰正片与过曝失焦正片叠合，亮部泛出柔光但底层细节仍锐利；区别于整幅单纯失焦。
**必要输入与条件：** 准备对齐的清晰层和柔焦高亮层，控制曝光与透明度；让光晕集中于明亮区域而不盖掉主体轮廓。
**区别与边界：** 模糊层过强会淹没清晰细节并压低反差；数字叠层模拟的是观感，不等于实际幻灯片曝光组合。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/orton-effect)；固定详情快照 `effects/orton-effect.json`，SHA-256 `09fe631255c46a59036b04daf2faa123fbe04e4944d81a8a3edd870bdedb3524`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Orton_(PAC)_-_result_image.jpg)。

## atlas:oscilloscope-art · 示波器波形艺术

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 电信号驱动示波器电子束在水平与垂直方向偏转，形成发光环线和交织曲线；频率比、振幅与相位决定图形。
**必要输入与条件：** 需两路X/Y信号与磷光显示或数字模拟；比较1:1、1:2和2:3等频率关系。
**区别与边界：** Lissajous曲线早于电子示波器，但复杂波形不一定是单一Lissajous图；数字描线不产生真实荧光余辉。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/oscilloscope-art)；固定详情快照 `effects/oscilloscope-art.json`，SHA-256 `d9317c4726f02fc86372890cf4d52c99a1e666b518168dba2d68f64974920625`。
**Atlas 所列参考：** [原始参考页面](https://www.computerhistory.org/revolution/artifact/208/563)。

## atlas:otsu-binarization · Otsu 全局二值化

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 自动选择一个全图亮度阈值，使黑白两类之间的方差最大，再把像素分成纯黑和纯白。
**必要输入与条件：** 适用于前景与背景亮度可分的图像；检查直方图是否有明显双峰，并与局部阈值结果比较。
**区别与边界：** 只有一个全局阈值，光照不均时暗处与亮处可能被错误归类；灰阶和颜色信息会全部舍弃。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/otsu-binarization)；固定详情快照 `effects/otsu-binarization.json`，SHA-256 `8355ccfd714624da0c0256bacbf9c27a56b8aa7332b520a8df8b6a6c8d3433a9`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:paik-abe-video-synthesizer · 白南准—阿贝尔视频合成器

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 模拟电路在显示前改写输入视频信号，把亮度映射成可调人工色块并叠合偏移轮廓；色彩是电子信号操控，不是恢复原场景真实颜色。
**必要输入与条件：** 历史复现可用模拟电路资料或数字分色层；先确定亮度到颜色的映射，再调整轮廓偏移和叠层。
**区别与边界：** 同一信号可被映成多种色彩，不能把颜色说成原物色；外加光学滤镜只改变入射光，不等于电信号合成。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/paik-abe-video-synthesizer)；固定详情快照 `effects/paik-abe-video-synthesizer.json`，SHA-256 `dc2ea316572bd23bff7df8b387d28dc2fd4cace60d52a049660dc44734f06d7e`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Video_synthesizer)。

## atlas:paint-on-glass-animation · 玻璃上绘画逐格动画

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 在玻璃表面铺湿颜料，每次拍摄后继续推、抹或重画，再逐帧播放，使笔触和形体连续变形；变化发生在同一绘画表面。
**必要输入与条件：** 需要透明玻璃、可反复塑形颜料、固定机位和逐帧拍摄；慢干油彩便于在两次曝光间调整。
**区别与边界：** 动作靠拍摄帧序构成，不是曝光期间颜料自行流动；反复推画可能让角色轮廓与空间位置难以保持。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/paint-on-glass-animation)；固定详情快照 `effects/paint-on-glass-animation.json`，SHA-256 `9bb89a3188a4f42c07969c9beee49910011a9dcab52c96090bd003abb8e1f466`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Paint-on-glass_animation)。

## atlas:palette-cycling · 索引调色板循环动画

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 像素只存调色板索引，播放时循环调色板条目即可让瀑布、波纹或灯光变色流动，像素位置本身不动。
**必要输入与条件：** 需索引色图与按空间顺序排好的循环色带；设定循环方向、速度与首尾颜色过渡。
**区别与边界：** 只有颜色变化，没有几何运动；像素索引排列无规律时会出现闪烁而非流动，不能与逐帧动画或统一色相旋转混同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/palette-cycling)；固定详情快照 `effects/palette-cycling.json`，SHA-256 `247230ad124f2bc7f5260d2c270aceb698a115c0ba34cbe866817ce990dad145`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Color_cycling)。

## atlas:palette-glitch · 调色板错映故障

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 局部色索引被错配或通道偏移，出现块状错误色、硬性色阶和局部彩色错位；条目用示意模拟视觉，不是真实网络推理。
**必要输入与条件：** 需要索引色/量化图、局部故障蒙版和色彩偏移量；把故障限制在可识别区域。
**区别与边界：** 本条分类为示意，不证明文件曾损坏；局部错误色与普通调色板映射需分开说明。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/palette-glitch)；固定详情快照 `effects/palette-glitch.json`，SHA-256 `ed938ac36d9e2182c6d2afa02e502a933812694b1a59384a996e2349ad8bacdd`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:panning-shot · 跟拍摇摄拖背景

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 摄影机随快速主体平移并以稍长快门拍摄，使主体相对清晰、静止背景沿水平方向拖影；主体内部如车轮仍可能模糊。
**必要输入与条件：** 需主体持续横向运动、摄影机同步跟随和适当快门；匹配摇摄速度并稳定保持主体位置。
**区别与边界：** 跟随过慢会连主体一起模糊，过快会让背景停住；它与固定机位下主体模糊、背景清晰的普通运动模糊方向相反。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/panning-shot)；固定详情快照 `effects/panning-shot.json`，SHA-256 `3ab4bed11c01de156c5cfbfeac9752b45503af81c2a754a6974fa6b15de4d33c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Bicycle_ride_in_Dhaka.jpg)。

## atlas:panoramic-photography · 拼接式全景摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 通过旋转相机连续拍摄重叠底片，或用摆镜头相机扫过长片幅，覆盖远宽于单帧的视角；不同区域记录于不同时间。
**必要输入与条件：** 需重叠影像或扫摆镜头、稳定旋转中心和接缝校正；优先选光线与主体运动稳定的场景。
**区别与边界：** 云影或移动人物在不同片段间变化会产生接缝、变形或消失；与一次曝光的超广角镜头不同，它会扫过时间。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/panoramic-photography)；固定详情快照 `effects/panoramic-photography.json`，SHA-256 `beaa47f4d87490dfde751e83b88f348ff01623bc65bb97606498c888790950aa`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Cincinnati_Panorama_of_1848.jpg)。

## atlas:particle-systems · 粒子系统运动

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 程序生成大量独立点状元素，分别按速度、受力和寿命移动、生成与消失，可组成烟、火花、尘雾或魔法群集。
**必要输入与条件：** 需要发射器、粒子初速度、力场、寿命和外观参数；按镜头尺度控制密度与轨迹方向。
**区别与边界：** 点群不自动形成连续流体，也未必包含粒子间真实碰撞；粒子寿命过长会累积过量元素。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/particle-systems)；固定详情快照 `effects/particle-systems.json`，SHA-256 `5efb260fae65527ad96e626ac5ecbceaffac2c258ea4851a7885d80b4aa1d6a3`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Partikelsystem.jpg)。

## atlas:patch-tokenization-grid · 图像分块 token 网格示意

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 把照片划成等尺寸方形 patch 并画出边界，展示视觉 Transformer 可能接收的局部单元；原始图像内容保持不变。
**必要输入与条件：** 设定方块尺寸并观察主体跨越多少个 patch；用于解释图像分块输入概念。
**区别与边界：** 本条只画网格，不计算模型学习到的embedding；不能把可视化方格说成真实token特征或模型注意力。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/patch-tokenization-grid)；固定详情快照 `effects/patch-tokenization-grid.json`，SHA-256 `50798e6d88fb5af80f632eb060b9a110967e327e7e6b19694490794766490509`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Bass_player_in_black_and_white_(Unsplash).jpg)。

## atlas:pen-plotter-art · 绘图仪路径艺术

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 电脑把路径指令发送给机械绘图仪，由移动笔尖在纸上画出细线网格、轮廓和交叠阴影；图像靠连续笔路构成而非点阵喷印。
**必要输入与条件：** 需要纸面、绘图笔和可执行路径；可用网格、重复轮廓、排线或受控伪随机角度组织明暗。
**区别与边界：** 笔画无法像连续涂料那样覆盖大面积色块；随机变化是可选规则，不是所有绘图仪作品的必然特征。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pen-plotter-art)；固定详情快照 `effects/pen-plotter-art.json`，SHA-256 `d80cae3410403b3e6d88679e4f82378a421ac9a8ac7c180418933466d58d674b`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Automatisches_Zeichengeraet_ZUSE_Z64_ubt.JPG)。

## atlas:pencil-sketch · 数字铅笔素描滤镜

**视觉家族：** 插画媒材与笔触（`atlas-family:illustration-material`）。
**可见效果与关键机制：** 以反相模糊和减淡混合强化边缘，生成纸白底上的灰色线条与轻柔擦涂；线条硬度随模糊与边缘强度变化。
**必要输入与条件：** 输入照片并调节线条阈值、模糊半径和纸纹；检查面部轮廓、暗部排线和高光留白。
**区别与边界：** 滤镜提取的是图像边缘，不具手绘笔压、起笔收笔和结构理解；处理过强会把照片纹理变成杂乱线条。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pencil-sketch)；固定详情快照 `effects/pencil-sketch.json`，SHA-256 `6bc9b14f869997ef295298af19fd95351fd563ee2c5e3b9c9fe5b157fb2e1822`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:pepper-s-ghost · 佩珀尔幻影反射

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 把侧面暗室中受亮照明的物体经倾斜玻璃反射到舞台前方，观众仍能透过玻璃看到背景，形成悬浮半透明影像。
**必要输入与条件：** 需倾斜透明玻璃、隐藏侧景和明暗分区；压低竞争背景光，让反射像与舞台实景平衡。
**区别与边界：** 这是反射光路，不是全息显示；观看角度、环境黑度和亮度比决定影像能否悬浮。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pepper-s-ghost)；固定详情快照 `effects/pepper-s-ghost.json`，SHA-256 `6501e4fd7f2a687e0e250198ace918ee2bf95ff4d42518a67df19019362af654`。
**Atlas 所列参考：** [原始参考页面](https://www.vam.ac.uk/articles/alexander-mcqueen-an-introduction)。

## atlas:perlin-noise · Perlin 连续噪声

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 在网格点生成随机梯度，再平滑插值成连续起伏场，可呈云、石纹或水波；相邻位置平顺关联，不像独立像素的白噪声。
**必要输入与条件：** 调整频率、尺度与多层叠加幅度；让纹理沿场景表面流动，并避免重复周期过于明显。
**区别与边界：** 它是算法构造的连续随机场，不自带真实流体或石材物理；尺度过高会显得颗粒化，过低则趋于平滑色块。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/perlin-noise)；固定详情快照 `effects/perlin-noise.json`，SHA-256 `7160a13d709b26ae840a608732731f4ed8c13cdf15d451873e65483968026a88`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Perlin_noise_example.png)。

## atlas:perspective-warp · 四角透视扭曲

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 以四角控制点建立平面映射，将图像重采样到倾斜四边形，使一侧压缩、另一侧伸展并呈现新的透视收敛。
**必要输入与条件：** 指定图像四角或目标平面四角；用建筑平行线检查消失方向与远端压缩。
**区别与边界：** 变换会拉伸或压缩原像素，不能补出未拍到的侧面细节；它是后期平面坐标映射，不等于真实倾斜镜头拍摄。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/perspective-warp)；固定详情快照 `effects/perspective-warp.json`，SHA-256 `7ccf8f9d858794f9459ced6bdabd3dc752f09b245e113df692a0b2e996b2df08`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Orange_Fruit_(Unsplash).jpg)。

## atlas:petzval-swirl-bokeh · Petzval 旋涡散景

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 焦点主体保持清晰，离焦背景高光在画面边缘被镜筒遮成猫眼椭圆，沿像场形成旋涡；影响的是虚焦光斑，不是全图径向拖影。
**必要输入与条件：** 需要背景点光源与浅景深；检查中心与边缘散景形状及旋转方向。
**区别与边界：** 效果取决于镜头光学结构和光圈，只有离焦背景高光明显；数字径向模糊不会产生真实光学猫眼。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/petzval-swirl-bokeh)；固定详情快照 `effects/petzval-swirl-bokeh.json`，SHA-256 `b9f019594200b285bfd79afec69ee71094a4acb82243a748f0cff2683b444aee`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Rosa_Yellow_Fairy_-_Rosaleda_Parque_del_Oeste_-_Madrid_01.jpg)。

## atlas:phenakistiscope-loop · 费纳奇镜循环盘

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 圆盘上排一圈连续动作图，观众透过径向狭缝看镜中影像；盘转动时狭缝逐格遮光，短暂替换画面形成循环运动。
**必要输入与条件：** 需要按圆周排列的逐帧图、带狭缝的转盘、镜面和适当转速；检查动作首尾循环。
**区别与边界：** 狭缝需在眼前充当快门；西洋镜把图放在旋转鼓内，可供多人从侧面观看，结构不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/phenakistiscope-loop)；固定详情快照 `effects/phenakistiscope-loop.json`，SHA-256 `34e3d277e33346f2f074105975f55bcacef7392752dc7127bbd5084d8d9c3025`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Optical_Toy,_Phenakistiscope_Disc_with_Distorted_Man,_1833_(CH_18607979).jpg)。

## atlas:phong-shading · Phong 逐像素光照

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 在多边形顶点间插值表面法线，再对每个像素计算光照，能形成随曲面移动的锐利高光；网格轮廓仍由原多边形决定。
**必要输入与条件：** 需要网格法线、光源方向、材质反射参数和逐像素着色；移动光源检查高光在曲面上的连续变化。
**区别与边界：** 相比只插值顶点颜色的Gouraud着色更能保留小而亮的反光，但逐像素计算成本较高，不能自动增加几何细节。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/phong-shading)；固定详情快照 `effects/phong-shading.json`，SHA-256 `807a1efaa42d603669fa592fb11997caeaf67502f3de0a287ab3d774ffe7dde9`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Shading_models.png)。

## atlas:photo-booth-strip · 照相亭连拍纸条

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 固定机位按间隔拍下数次独立肖像，再把四张左右的照片排在窄纸条上；表情和小动作便于逐格比较。
**必要输入与条件：** 需要定时曝光、稳定视点、逐张记录和纸条排版；让被摄者在各格间改变表情或姿态。
**区别与边界：** 每格都是单独曝光，动作间隔不会在照片内部连续出现；与从底片直接贴纸制作的contact sheet不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photo-booth-strip)；固定详情快照 `effects/photo-booth-strip.json`，SHA-256 `7521f68edc15aef1b588f63eed3a1135ceabe216cd019fe410d1c1e6f68fb24f`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Photo_booth_strip_00001.jpg)。

## atlas:photochrom · 黑白底片石印彩照

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 以黑白底片提供精细明暗，再由多块套色石版印出鲜明颜色；颜色在印刷阶段解释生成，不是原始彩色曝光或简单手工着色。
**必要输入与条件：** 需要黑白底图、分色套印和多色石版/数字仿制层；按场景选择蓝、赭、红与绿色块。
**区别与边界：** 色层不能证明历史对象的真实原色；色彩会受制版与套准影响，不能把所有早期彩照都当作准确色彩记录。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photochrom)；固定详情快照 `effects/photochrom.json`，SHA-256 `e504b5491723be2c9e2e97dc7e94c7fe46bfeef7078abbcc3a9d708962632048`。
**Atlas 所列参考：** [原始参考页面](https://www.loc.gov/pictures/collection/pgz/process.html)。

## atlas:photocopy-aesthetic · 复印机复写质感

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 多次复印与强对比阈值削弱中间调，留下黑色墨粉块、脏点、断边和条纹；复制代数增加时细节逐步流失。
**必要输入与条件：** 可逐代复制实物或用数字阈值、噪点与纸纹模拟；记录每次复制后细节变化。
**区别与边界：** 仅转灰度不能得到复印痕迹；细节损失与污点依设备、纸张和代数变化，不应误作胶片颗粒。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photocopy-aesthetic)；固定详情快照 `effects/photocopy-aesthetic.json`，SHA-256 `755a312ff827bb20f3b04b1ce453ba74c5f2909e906ffb1154338860431d2f95`。
**Atlas 所列参考：** [原始参考页面](https://production-gcp.moma.org/explore/inside_out/2010/08/12/riot-on-the-page-thirty-years-of-zines-by-women/)。

## atlas:photodynamism · 连续运动曝光摄影

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 长曝光让移动人物在胶片上连续留下轨迹、叠影和半透明拖带，静止背景相对稳定；表现的是位置之间的连续运动，不是离散动作阶段。
**必要输入与条件：** 需固定相机、长曝光和移动主体；安排停留点可让某一姿态积累成较清晰锚点。
**区别与边界：** 与将动作分成一帧帧的chronophotography不同，模糊轨迹是核心；曝光过长会让主体形态消失。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photodynamism)；固定详情快照 `effects/photodynamism.json`，SHA-256 `5dd4520f4d8f0208e727b161592568ecce1f1192f84b1690e4e9f8457576135d`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:L%27Antiteatro._Il_cinematografo_come_arte_(page_135_crop).jpg)。

## atlas:photoelasticity · 应力光弹彩纹

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 透明塑料受力产生双折射，夹在交叉偏振片间后形成彩虹干涉条纹；条带围绕孔洞、尖角和受力接触处变密。
**必要输入与条件：** 需要透明受力材料、白光与交叉偏振片；缓慢改变载荷或观察角度，读取彩纹分布。
**区别与边界：** 色彩来自应力相关的双折射，不是塑料颜料或边缘衍射；经校准的平面模型主要显示主应力差，不能直接读成单一应力值。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photoelasticity)；固定详情快照 `effects/photoelasticity.json`，SHA-256 `40edf00c8c484d9d50f59211494a9c2c61e516efa448c561bbb75f8428904e63`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Photoelasticity_-_Gillette_Fusion_razor_holder.jpg)。

## atlas:photogram · 相纸接触成像

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 物体直接挡住投向感光纸的光，显影后留下白色轮廓、灰色半透明影和重叠形状；无需相机镜头。
**必要输入与条件：** 需要感光纸、光源和直接放置的物体；用透明、半透明与不透明材料比较影子边界。
**区别与边界：** Rayograph是曼·雷对其作品的称呼，不是photogram技术的发明；只有直接接触或靠近光路，记录才会形成。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photogram)；固定详情快照 `effects/photogram.json`，SHA-256 `d3dc5b53b937094d89d92632fbe8e14e6e2176118d5ac794d6add1035e04491c`。
**Atlas 所列参考：** [原始参考页面](https://www.moma.org/collection/works/46405)。

## atlas:photogrammetry · 摄影测量与三维重建

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 用多张重叠照片估计相机位置和表面深度，再生成带摄影纹理的三维模型；扫描质感只是可能的视觉外观，不是方法本身。
**必要输入与条件：** 需绕物体拍摄多角度且相邻视图有足够重叠，优先选哑光稳定对象；检查相机轨迹和表面网格。
**区别与边界：** 反光或透明表面随视角变化，难以建立稳定特征对应；重建网格和贴图可能有缺洞、拉伸，不能等同真实完整模型。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photogrammetry)；固定详情快照 `effects/photogrammetry.json`，SHA-256 `fb132a3701869b16a60e81b5afca44b54801dc104e812bc7355e26dcc5bb8c2c`。
**Atlas 所列参考：** [原始参考页面](https://alicevision.org/ladio/)。

## atlas:photographic-joiners · 多视点照片拼贴

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 把不同位置或时刻拍到的独立照片并置、重叠并保留接缝，使场景同时出现多视角、重复人物或不一致透视。
**必要输入与条件：** 需要同一对象的多角度/多时刻照片和可见边框；可按网格或自由拼贴安排各片。
**区别与边界：** 它保留错位和重复，不像全景拼接那样隐藏接缝；与在同一张底片上多次曝光的制作方式不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photographic-joiners)；固定详情快照 `effects/photographic-joiners.json`，SHA-256 `da8c47b05cf5b6993129d292b4dde8ae9891c25d3151da3a0cfab46947b0f1c0`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/David_Hockney)。

## atlas:photogravure · 照相凹版印刷

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 曝光使明胶层在铜板上形成保护深浅，酸蚀后不同深度容纳不同墨量，压印得到连续灰调、绒面黑和细微随机颗粒。
**必要输入与条件：** 需要感光明胶、铜版蚀刻、上墨与压印；以放大观察随机颗粒区别于规则半色调网点。
**区别与边界：** 凹版依靠蚀刻深度承墨，不是网点假造灰阶；制版、蚀刻和压印步骤复杂，数字颗粒无法等同真实版面。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photogravure)；固定详情快照 `effects/photogravure.json`，SHA-256 `472769a0df1f2e6bb827d170c07a7e89a58c67b5eeca3fd0f9ccb473ac440b07`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Andrew_Lang_by_Alvin_Langdon_Coburn,_August_27,_1904,_photogravure,_from_the_National_Portrait_Gallery_-_NPG-S-NPG_87_288_c.jpg)。

## atlas:photomicrography · 显微摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 通过显微镜形成放大光学像，再由感光材料或电子传感器记录，展示细胞、昆虫鳞片和矿物晶体等微观纹理。
**必要输入与条件：** 需显微镜、适配相机、合适照明和对焦；按目标结构选择倍率与视野，检查圆形视场边缘。
**区别与边界：** 可见细节受镜头分辨率、焦点和照明限制；放大只能放大已有信息，不能恢复光学系统未记录的细节。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photomicrography)；固定详情快照 `effects/photomicrography.json`，SHA-256 `5de05888c25b107ae48e300081c1e24408f11844184aa371842f72a44f7420b8`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Transverse_section_with_chronic_inflammation_(CP_2328),_National_Museum_of_Health_and_Medicine_(4777488210).jpg)。

## atlas:photomontage · 摄影蒙太奇拼贴

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 剪取照片和文字碎片，改变尺度、位置并重新组合，让原图之间的新并置改变含义；碰撞的比例和剪边通常可见。
**必要输入与条件：** 需要多张照片/文字片段、剪裁边缘和明确构图焦点；先决定并置关系，再安排层叠与留白。
**区别与边界：** 1920年代是艺术实践的重要发展阶段，不是复合摄影的发明日期；拼贴关系会改写语义，不能只按装饰碎片处理。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photomontage)；固定详情快照 `effects/photomontage.json`，SHA-256 `91760b4e7092fdec1fec924d99df90a6becd6ea72263830d83251492e97de4db`。
**Atlas 所列参考：** [原始参考页面](https://berlinischegalerie.de/en/collection/specialised-fields/prints-and-drawings/hannah-hoech/)。

## atlas:photorealistic-cgi · 照片级电脑生成影像

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 三维模型经材质、光照、阴影、运动模糊和透视处理后融入实拍环境，使数字生物看似真实存在；photorealism是目标，CGI是工具。
**必要输入与条件：** 需要模型、贴图、匹配机位和场景光照；核对地面接触、反射方向、阴影软硬与实拍运动模糊。
**区别与边界：** 非写实三维动画也属于CGI；数字模型存在不代表已与实拍无缝整合，效果依镜头和环境匹配。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photorealistic-cgi)；固定详情快照 `effects/photorealistic-cgi.json`，SHA-256 `7c79c4308b64563146e761c4bd3c3a5660481fe29140a9b1c2c70afe81b58ce9`。
**Atlas 所列参考：** [原始参考页面](https://www.ilm.com/vfx/jurassic-park/)。

## atlas:photosculpture · 多视角摄影雕塑

**视觉家族：** 实拍、舞台与模型特效（`atlas-family:practical-effects`）。
**可见效果与关键机制：** 围绕静止人物布置多台相机记录不同轮廓，再用轮廓线引导对黏土坯料逐层减材，最后手工补出衣褶和表面。
**必要输入与条件：** 若要复现Willème式实体照相雕塑，需稳定对象的多视角轮廓、转印/测绘过程与实体塑形，并检查视图间比例。数字雕塑或方法图解可示意多视角怎样约束体积，但不声称实际完成了照相雕塑工艺。
**区别与边界：** 轮廓只能说明外边界，凹陷和表面细节仍需人工判断；成品是实体雕塑，不是立体照片，也不同于加材3D打印。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/photosculpture)；固定详情快照 `effects/photosculpture.json`，SHA-256 `f327dce51d37ad5d8a7e4a7207c189c847e340b0e31d72e3a4a6da8b58099ea7`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Portrait_de_Jean-Baptiste-Fran%C3%A7ois_Bressant_(1815-1866),_acteur._S1577_(1_of_5).jpg)。

## atlas:pincushion-distortion · 枕形径向畸变

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 径向位移把像素向中心收拢，边缘位移更强，直线在画幅周边向内弯曲；中央变化相对较小。
**必要输入与条件：** 用规则网格或建筑线检查扭曲中心与强度，保持主体边缘不过度挤压。
**区别与边界：** 这是几何重映射，会拉伸边缘细节并可能留空；与桶形畸变的外鼓方向相反。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pincushion-distortion)；固定详情快照 `effects/pincushion-distortion.json`，SHA-256 `120f3e56969b3e633853a679bc030416d4180bad08f22a9c65985e17523f41d5`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Daring_(Unsplash).jpg)。

## atlas:pinhole-photography · 针孔成像摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 极小孔径把场景投影到感光面上，不用镜头；近远景可同时较清楚，但细节偏软且曝光时间常较长。
**必要输入与条件：** 需要遮光箱体、针孔与感光材料/传感器；记录孔径、距离和曝光时间并观察均匀柔软度。
**区别与边界：** 针孔不是任意高锐度的无镜头方案，衍射和孔径尺寸会限制清晰度；暗箱成像原理远早于摄影。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pinhole-photography)；固定详情快照 `effects/pinhole-photography.json`，SHA-256 `e503bf96a1a9003486437e1e8229726b11a76176991c6a0dae1b1b6b75d7bb20`。
**Atlas 所列参考：** [原始参考页面](https://blog.scienceandmediamuseum.org.uk/a-z-of-photography-george-davison-pictorialism-vs-straight-photography/)。

## atlas:pinscreen-animation · 针幕逐格动画

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 数千根可移动针从白板伸出不同高度，侧光照出长短阴影；针影密度构成黑白灰形体并逐帧变化。
**必要输入与条件：** 需要针幕、侧向硬光与逐格摄影；调整针高和光线角度，控制明暗渐变及动画连续性。
**区别与边界：** 灰阶来自实体针影，不是点阵贴图；伸出的长针会投下重叠阴影，层级过深容易堵成黑块。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pinscreen-animation)；固定详情快照 `effects/pinscreen-animation.json`，SHA-256 `f1faad3d10751d063ea08a060ee3309b0c66ed72010040bea9ef658e37ed46ee`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:%C3%89cran_d%27%C3%A9pingles_-_D%C3%A9tail_(face).jpg)。

## atlas:pixel-art · 手工像素艺术

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 在低分辨率方格上有意安排单个像素与有限色板，以清晰色簇、阶梯轮廓和简化阴影构成图像；不是随机压缩方块。
**必要输入与条件：** 需先定网格和调色板，再按轮廓、明暗簇和边缘方向手工布像素。
**区别与边界：** 自动缩小照片产生的块状不等于像素艺术；色板与网格尺度限制细节，意图需落在每个像素簇的安排。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pixel-art)；固定详情快照 `effects/pixel-art.json`，SHA-256 `8789eb7cde71c5f8a1a64075876d0b7794b860a17854c39f6826b7ec22002402`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Cree_woodlands_techno_pixel_art.jpg)。

## atlas:pixel-sorting · 像素排序拖带

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 在选定行列区段内按亮度或色值排序像素，形成有序水平或垂直色带；颜色数量大致不变，改变的是像素位置。
**必要输入与条件：** 设置排序方向、阈值、起止区间与分段长度；限定在高光或暗部区域可形成可控拖带。
**区别与边界：** 无需文件损坏或视频压缩，与datamosh不同；区段边界设置不当会吞并主体轮廓或形成大块色条。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pixel-sorting)；固定详情快照 `effects/pixel-sorting.json`，SHA-256 `6496e2beba22f21458e4905a8d7489df306b1a2eb4c35983cab0ff0fdacc5acc`。
**Atlas 所列参考：** [原始参考页面](https://github.com/kimasendorf/ASDFPixelSort)。

## atlas:pixelation · 马赛克像素化

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 把图像合并成更粗的矩形采样块，每块用一个代表色，轮廓和细节逐步被空间降采样取代。
**必要输入与条件：** 设定横纵采样列数或块尺寸；同一图比较多档分辨率，并保留主体主要明暗团块。
**区别与边界：** 像素化降低空间样本数量，posterization降低颜色数量；手工像素艺术则逐格有意绘制，三者不可混为一谈。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pixelation)；固定详情快照 `effects/pixelation.json`，SHA-256 `5d1484f8fd3283b1efbe204c5d84aea64d13628085a80e67a0eeadbf7527ca1b`。
**Atlas 所列参考：** [原始参考页面](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/stylize-effects.html)。

## atlas:pixelation-2 · 最近邻像素放大

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 先把图像降到较低采样宽度，再用最近邻放大，每个采样颜色成为硬边方块，像素尺寸一致。
**必要输入与条件：** 选择小图宽或网格间距，并用nearest-neighbor插值；对照16、32、64像素宽度观察块化程度。
**区别与边界：** 空间分辨率降低会丢失细节，但原有色彩值可保留；不等于只减少色阶的posterization。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pixelation-2)；固定详情快照 `effects/pixelation-2.json`，SHA-256 `b4a937f085de0f900acc1e8a11baeb8eb02b2470f0a2128740cce99dca0993e3`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:pixilation · 真人逐格定格动作

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 演员在每次曝光间换姿势，播放后出现滑步、悬浮和木偶般跳动；动作之间没有被拍下，只在帧间跳变。
**必要输入与条件：** 固定相机，让表演者逐格改变位置/姿势，再按正常帧率播放；预先标记落脚点与动作顺序。
**区别与边界：** 主体是真人演员而非木偶；名称与pixelation相近但机制完全不同，后者是把图像放大成可见像素块。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pixilation)；固定详情快照 `effects/pixilation.json`，SHA-256 `dc8f760ca8366290abb2c0718c889fe7feede37dade4bd853fc9065dd8bf9f60`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Neighbours_(1952_film))。

## atlas:plasma-effect · 正弦波等离子色场

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 叠加多组正弦与余弦函数计算每个位置的颜色，形成平滑流动的彩色斑块和重复干涉波纹；节奏可预测。
**必要输入与条件：** 设定波形频率、相位、中心和颜色映射；相位随时间变化可形成流动动画。
**区别与边界：** 规律波形与随机分形噪声不同；过多周期叠加会产生花纹混叠，不能当作真实等离子体或流体模拟。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/plasma-effect)；固定详情快照 `effects/plasma-effect.json`，SHA-256 `670576361384f98a0f890e61dfef543a60bc29a7c4be293eb1ec8327878f2871`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Plasma_fractal_theartproblem_3993.jpg)。

## atlas:platinum-print · 铂金印相

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 铁盐感光反应将铂影像永久结合到纸纤维中，呈哑光表面、细腻中性灰和绵长层次；不是单纯去色。
**必要输入与条件：** 需相纸、铁盐/铂化学体系、曝光与显影条件；用实物或高质量扫描呈现哑光纸面和细灰阶。
**区别与边界：** 扫描无法完全保留哑光材质和微妙色阶；不是所有柔和黑白照片都是铂印，数字灰度转换不具材料工艺。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/platinum-print)；固定详情快照 `effects/platinum-print.json`，SHA-256 `7e7808968c1d903b8d1709c97ce1395cda83d67c7cf7d60230cff09e6e50d58c`。
**Atlas 所列参考：** [原始参考页面](https://www.getty.edu/art/exhibitions/focus_platinum/)。

## atlas:pochoir-stencil-print · Pochoir 手工套色印刷

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 将金属或赛璐珞模板切出形状，人工把水彩或水粉刷过开口，形成鲜明哑光色块、厚薄变化与轻微越界。
**必要输入与条件：** 需要单色底图、分色模板、手刷颜料和逐色套准；每种颜色单独制作遮片。
**区别与边界：** 手刷颜料会有厚薄与边缘变化，过程慢且依赖技艺；不同于石版多色套印形成的均匀机械油墨层。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pochoir-stencil-print)；固定详情快照 `effects/pochoir-stencil-print.json`，SHA-256 `e926ceeae65080ff21ac4f3e0aabfa7537b8a050a30f8f463dd2db76f7493318`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:La_Guirlande_des_mois,_1917-1920_L%27Eau,_RP-P-2009-1823.jpg)。

## atlas:point-cloud-proxy · 点云空间代理示意

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 将采样像素放到图像坐标与示意深度位置上，再以离散彩点投影出主体碎片；本条是代理可视化，不代表神经重建。
**必要输入与条件：** 需要图像采样、点密度和相对深度映射；控制点大小/亮度以保留主要轮廓。
**区别与边界：** 没有真实测深或多视角数据时不构成完整三维点云；点的空间感只是示意，不能声称模型推理或精确几何。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/point-cloud-proxy)；固定详情快照 `effects/point-cloud-proxy.json`，SHA-256 `46f257c184457f4fda122840d4cf27b9f25834fce973f6884f65e227d602e410`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:point-cloud-rendering · 点云表面渲染

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 直接绘制采样空间点或小色斑来表示表面，而不先把点连接成多边形；点密度和尺寸共同决定轮廓连续度。
**必要输入与条件：** 需要带空间坐标的点集及投影相机；调整点密度、尺度与深度衰减，检查空隙和轮廓。
**区别与边界：** 点云指数据，point-based rendering指绘制表示；点云可以稀疏或高精度，不能仅凭点状外观判断数据粗糙。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/point-cloud-rendering)；固定详情快照 `effects/point-cloud-rendering.json`，SHA-256 `cdb49ea79ed8046b04cd08df56d85bd734ad21d0c8ac456ec2640dde2e26ccd6`。
**Atlas 所列参考：** [原始参考页面](https://graphics.stanford.edu/papers/qsplat/)。

## atlas:polar-coordinates · 图像极坐标包裹

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 把原图横向坐标换成角度、纵向坐标换成半径，将矩形图带围成圆环或小行星形；边缘首尾连接决定接缝。
**必要输入与条件：** 选择可首尾对接的横向全景或纹理，设定中心点和映射方向；先检查包裹缝再处理边缘。
**区别与边界：** 原图中相邻像素可能被挤到中心很小半径，造成汇聚和拉扯；首尾景物不一致会出现明显接缝。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/polar-coordinates)；固定详情快照 `effects/polar-coordinates.json`，SHA-256 `5744e727e063d4716f38ff66173e1d81aeb9b84d4486a12f4d0c002888524af1`。
**Atlas 所列参考：** [原始参考页面](https://docs.gimp.org/2.4/en/)。

## atlas:polaroid-manipulation · 宝丽来显影乳剂推画

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 在早期SX-70相纸尚未完全定影时按压表面，让内部湿乳剂移动成融化、拖抹和旋涡色块；原图像仍留在原相纸封装内。
**必要输入与条件：** 历史复现使用未完全显影的合适即显胶片与柔和压力；数字演示可把照片纹理做成表层湿画感。
**区别与边界：** 改变的是原相纸中的湿影像层，不是把完成影像转印到另一张纸；乳剂干燥后不再易于推移，不应对普通已干照片套用为同一工艺。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/polaroid-manipulation)；固定详情快照 `effects/polaroid-manipulation.json`，SHA-256 `3d74807221ea62253e2af66daede002eaaf8b196ccd808b6c2d68aa30053b06d`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Chevy_Nova_SX-70_manipulation.jpg)。

## atlas:polaroid-sx-70 · SX-70 一体式即时胶片

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 方形彩色相片配白色边框和较宽底边；出片滚轮压破内置药包，让显影化学物在密封层间铺开并在日光下成像。
**必要输入与条件：** 用真实一体式即显胶片或按方形白框和柔和化学色调模拟；区分相纸边框与图像有效区域。
**区别与边界：** 药包遮光剂随显影逐渐退去，一体式胶片不需要撕开底片；与早期剥离式胶片流程不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/polaroid-sx-70)；固定详情快照 `effects/polaroid-sx-70.json`，SHA-256 `0c9d6c14d3860fa9076e0c84b2c519da24a7c1525b4069554f75bcdb889710cc`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Polaroid_Big_Shot.jpg)。

## atlas:political-retouching · 政治照片修版删人

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 在负片乳剂上刮除人物，再用喷笔或墨料补画墙、水面等背景，批量印出一张看似自然却被篡改的历史照片。
**必要输入与条件：** 历史分析可对照原版与修版，观察被删人物位置及背景笔触；数字示意应标明其编辑来源。
**区别与边界：** 这是对记录的删改，不是叠加幽灵人物的双重曝光；背景涂抹可能留下痕迹，不能把修版结果当作完整史实。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/political-retouching)；固定详情快照 `effects/political-retouching.json`，SHA-256 `ec645c887bf9a71828bc5b32c5bece9e220cdc70cba6ec0ebf921883ad571eeb`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Soviet_censorship_with_Stalin2.jpg)。

## atlas:portrait-vignette · 肖像椭圆淡出版心

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 印相遮片让人像周边逐渐淡入浅纸色，形成柔和椭圆影像区；与镜头暗角造成的画面边角变暗是相关但不同的现象。
**必要输入与条件：** 需人像主体、椭圆羽化遮罩和浅色相纸背景；把过渡边界放在肩部或背景，而非切断面部。
**区别与边界：** 此类肖像边缘通常向亮纸淡出，不应与光学暗角混称；淡出过窄会像后期裁切框。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/portrait-vignette)；固定详情快照 `effects/portrait-vignette.json`，SHA-256 `20f4816454400313f560d3dbbf16d20db079fca50a5dbbcfc269955d0d69ae36`。
**Atlas 所列参考：** [原始参考页面](https://www.getty.edu/art/collection/object/107HCH)。

## atlas:posterization · 色阶海报化

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 把每个颜色通道连续值舍入为少数固定等级，使平滑渐变跳成清楚色带；空间采样分辨率仍可完全保留。
**必要输入与条件：** 分别设置每通道等级数，如2、4或8级；对照阴影、肤色和天空的色带断层。
**区别与边界：** 每通道等级数不同于全图总色数，RGB组合会产生更多颜色；不要把海报化误称为降低分辨率的像素化。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/posterization)；固定详情快照 `effects/posterization.json`，SHA-256 `7d82c24226d8a257b384ca4af4a64a0ea1152a1ee10cd6f8c2579fde0cafdec7`。
**Atlas 所列参考：** [原始参考页面](https://learn.microsoft.com/en-us/windows/win32/direct2d/posterize-effect)。

## atlas:praxinoscope · 镜盘式活动视镜

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 连续动作画带放在旋转鼓内侧，中央镜环随鼓转动并逐格反射图像，让运动稳定可见；它用镜面替代走马盘鼓壁上的观察狭缝。
**必要输入与条件：** 需要与画带逐格对应的中央镜片、连续动作画带和稳定转动；可对照鼓内画片与镜中影像的节奏。
**区别与边界：** 它以中央镜片反射画格，不靠走马盘的狭缝逐格遮光；镜片角度不稳会使反射动作抖动。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/praxinoscope)；固定详情快照 `effects/praxinoscope.json`，SHA-256 `d35e9d0d2694cf02dec0c778eba31f96b1c048f1486360491c1ac6cc2899ad64`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Toy_praxinoscope_by_Charles_%C3%89mile_Reynaud_-_CnAM_16696-2_-_01.jpg)。

## atlas:prewitt-edge · Prewitt 一阶边缘

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 用两组3×3卷积核估计水平和垂直亮度导数，显示方向性边缘；核内权重均匀，边带略宽。
**必要输入与条件：** 输入灰度图并计算X/Y响应，可组合为边缘强度；用窄织物边缘观察方向响应。
**区别与边界：** 对噪声和细纹理敏感；Sobel在邻近位置使用不同权重，边缘响应和抗噪表现并不相同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/prewitt-edge)；固定详情快照 `effects/prewitt-edge.json`，SHA-256 `3ec3616d06a9c49f0ddaf322196fe2f46233acf576ccce6312881f6e4551262f`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:psychedelic-poster-art · 迷幻海报图像字形

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 把弯曲字形、密集装饰、扭曲人物和高饱和互补色塞入海报构图；相近明度的异色边缘会产生视觉震颤。
**必要输入与条件：** 需要清楚的演出/信息层级、流动字形和互补色对；重要文字需用留白或明度差维持辨认。
**区别与边界：** 与Op Art的重复几何错觉不同，它结合文字、图像与装饰；相近明度的强色边会降低细字可读性。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/psychedelic-poster-art)；固定详情快照 `effects/psychedelic-poster-art.json`，SHA-256 `5f2d6fe1845f9413df302909d7400cca7c0fe78ef2843b8beef755d14f61225f`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Official_Film_Poster_for_The_Tale_of_the_Dog_Documentary_Film_(2021).jpg)。

## atlas:pulfrich-effect · Pulfrich 双眼时延错觉

**视觉家族：** 立体视觉与多视角（`atlas-family:stereoscopic-space`）。
**可见效果与关键机制：** 一只眼的亮度降低后视觉处理略滞后，物体横向移动时两眼看到不同时刻的位置，大脑将差异解释为椭圆式深度。
**必要输入与条件：** 需要双眼观看、明暗不对称和横向运动；可用摆动物体解释相位延迟如何变成视差。
**区别与边界：** 静止画面没有运动时差，因此不会产生该深度错觉；它不像anaglyph那样以颜色滤镜分离左右眼画面。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/pulfrich-effect)；固定详情快照 `effects/pulfrich-effect.json`，SHA-256 `2415a0c07cbec55f0d366bf895f16e2a874f48ba41f1a87b89d5edd9f7b3045d`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Pulfrich_effect_pendulum.svg)。

## atlas:push-processing · 胶片增感迫冲

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 拍摄时故意欠曝，再延长显影补偿，使胶片颗粒更粗、反差更高、阴影和高光更硬；变化发生在负片化学显影阶段。
**必要输入与条件：** 需可推显影的胶片与明确的欠曝档数/延长显影；记录胶片类型、显影时间与温度。
**区别与边界：** 推显影不能恢复欠曝时从未记录的暗部信息；与印相阶段局部加减曝光的dodging/burning不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/push-processing)；固定详情快照 `effects/push-processing.json`，SHA-256 `ff8c0be6d51dd48b5b938e161189e5af8892e0be804e76e0bde5d6c8d991f08d`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Vieira_Souto_-_Lagoa_Rodrigo_de_Freitas,_seagull.jpg)。

## atlas:quantel-paintbox · Quantel Paintbox 像素绘画

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 早期图形工作站以手写笔在帧缓存像素上绘画，电子混色能做柔和喷笔渐层和锐利遮罩边，服务电视包装与背景。
**必要输入与条件：** 历史复现可查设备与制作记录；数字示意可用像素画布、软笔刷和剪切遮罩组合。
**区别与边界：** 外观只能提示类似工作流，不能证明图像由Paintbox制作；与喷笔在实体表面沉积颜料或矢量描线不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/quantel-paintbox)；固定详情快照 `effects/quantel-paintbox.json`，SHA-256 `437e9bf8c512428ba6cc223efb2c941af72e9b8c93d240ff46a220216b10303a`。

## atlas:quickshift-superpixels · Quickshift 超像素分区

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 按颜色与空间位置估计局部密度，再将像素连向更高密度邻点；在距离阈值处切断后得到贴近颜色边界的不规则区域。
**必要输入与条件：** 需要色彩/位置联合空间、距离阈值和采样参数；比较小区域合并与分裂情况。
**区别与边界：** 超像素边界不等于对象语义；阈值过大可把不同色面合并，过小会生成过多碎块。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/quickshift-superpixels)；固定详情快照 `effects/quickshift-superpixels.json`，SHA-256 `cbfd3e9004aac7596fcc4f172f8dd3691d15085c38df9b64de74c78d7ba2e71e`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Tanaphong_Toochinda_2017_(Unsplash).jpg)。

## atlas:rack-focus · 焦点转移

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 在不同拍摄距离之间改变对焦平面，让原本清晰的主体退虚、另一深度上的主体变清；变的是焦点距离，不是焦距。
**必要输入与条件：** 安排前景与背景两个阅读目标，并以拉焦速度决定注意交接时机；检查两处景深和高光散景。
**区别与边界：** 某些镜头拉焦会有轻微focus breathing，使视角范围变化；焦点转移不需要移动机位，也不等同变焦。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/rack-focus)；固定详情快照 `effects/rack-focus.json`，SHA-256 `97fdebe300b4ce8f61d23a0fc3c138490e7a85530841f329cc54d3102c228955`。
**Atlas 所列参考：** [原始参考页面](https://www.filmmakersacademy.com/glossary/rack-focus/)。

## atlas:radial-zoom-blur · 中心向外缩放模糊

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 围绕选定中心叠混不同缩放版本，使纹理和高光沿放射方向拉成长线，中心较清晰、边缘拖曳明显。
**必要输入与条件：** 设置缩放中心与强度；把中心放在视觉逃逸点或运动方向起点，避免遮住关键主体。
**区别与边界：** 本条为视觉示意，不代表神经推理；放射拖影不等于真实相机变焦，中心偏移会改变运动感。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/radial-zoom-blur)；固定详情快照 `effects/radial-zoom-blur.json`，SHA-256 `85bf0eec85b05960ad303e6499a5300a208469e237f1d24acbe1f389fe3c28e2`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:radiosity · 漫反射能量交换

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 计算哑光表面之间相互反射的漫射光，使红墙的反射色染到白地板上；材质仍是白色，只是受环境反弹光照。
**必要输入与条件：** 需要场景几何、表面反照率和漫反射光源；检查墙面颜色是否自然落到相邻表面。
**区别与边界：** Radiosity指特定的漫射光求解方法，不是所有间接光照画面的制作标签；不处理镜面反射等全部光传输现象。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/radiosity)；固定详情快照 `effects/radiosity.json`，SHA-256 `029e47aff2aea4883a87339e300ce35506a8d474bad9eec806502292b5c1ee28`。
**Atlas 所列参考：** [原始参考页面](https://bowers.cornell.edu/cornell-box)。

## atlas:random-walker-segmentation · 随机游走图像分割

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 从已标注种子出发，计算像素随机游走最可能先到达哪个标签；相似邻像素更易相连，边界常落在亮度或颜色变化处。
**必要输入与条件：** 需要前景/背景种子及图像梯度；移动少量种子观察分割轮廓如何响应弱边缘。
**区别与边界：** 结果受种子位置和局部对比控制，弱边界容易串类；标签表示用户定义区域，不是自动语义理解。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/random-walker-segmentation)；固定详情快照 `effects/random-walker-segmentation.json`，SHA-256 `64e0b657f2ed5c23e56984df279840810b3a41ec7d11389e75a094fa3d14c690`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Timothy_Lamm_2017_(Unsplash).jpg)。

## atlas:raster-bars · 光栅扫描色带

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 程序在显示器电子束逐行扫描时同步切换背景调色板，生成上下移动的水平渐变色带，几乎不占用像素绘制内存。
**必要输入与条件：** 历史复现需与显示扫描同步的调色板中断或协处理逻辑；数字示意需控制横向渐变条带和移动节奏。
**区别与边界：** 原法依赖特定硬件扫描时序，不是预先画好再存入显存的普通渐变图；静态帧只能呈现色带的一刻。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/raster-bars)；固定详情快照 `effects/raster-bars.json`，SHA-256 `dba55a361990ffcee33e11f307e55ca6923a4d0d4b4251757fa1c5358b19b468`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Raster_bar)。

## atlas:raycasting · 列式光线投射

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 为每个屏幕列从二维地图发射一条射线，遇到墙面后按垂直距离计算墙条高度并贴纹理，快速营造直立走廊空间。
**必要输入与条件：** 需要二维墙体地图、逐列射线和垂直距离校正；以平行墙面和直角走廊检查透视。
**区别与边界：** 它不追踪反射或折射的次级光线，适合直立墙布局；不同于可处理复杂光传输的通用递归光线追踪。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/raycasting)；固定详情快照 `effects/raycasting.json`，SHA-256 `e14a853cf17f35a3d278e6473428982477ffc2fe834783d682f685429de571cb`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Exemple_de_rendu_en_raycasting.jpg)。

## atlas:reaction-diffusion-patterns · 反应—扩散斑纹

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 局部化学反应改变浓度、扩散又将其向周围传播，在合适条件下形成间距相近的圆斑、蜿蜒条纹和分叉迷宫。
**必要输入与条件：** 需要耦合反应/扩散规则、初始扰动与边界；调整反应速率观察斑点合并或转成条纹。
**区别与边界：** 图样来自相互作用过程，不靠颜料在液体中流动，也不是普通噪声纹理；参数区间变化会使形态从斑点转为条带。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/reaction-diffusion-patterns)；固定详情快照 `effects/reaction-diffusion-patterns.json`，SHA-256 `696d2fddccc8b094b998d31dce1db8ef8a21c4dd43cbb570a496b6e64bf9cd64`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Turin1.png)。

## atlas:rear-projection · 背投实景合成

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 把预先拍摄的背景从后方投到半透明屏幕，演员置于屏幕前，摄影机同时拍下演员和投影；常用于车内行驶背景。
**必要输入与条件：** 需背景片、后投影幕、投影机、前景演员与同步相机；让背景运动、演员光线和镜头视角相互匹配。
**区别与边界：** 投影亮度、屏幕颗粒、焦点或背景动作可能暴露制作痕迹；电影示例可能结合其他技术，不能把整镜都归为背投。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/rear-projection)；固定详情快照 `effects/rear-projection.json`，SHA-256 `c543df9d0946eeca8b80e6e6da2fe3f6544071f70c54e5a611b74032ee1aba83`。
**Atlas 所列参考：** [原始参考页面](https://www.film-foundation.org/king-kong-hfpa)。

## atlas:recursive-ray-tracing · 递归光线追踪

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 从相机射线判断可见表面，再递归发出反射、折射等次级射线求颜色，能呈现几何对应的镜面反射与玻璃折射。
**必要输入与条件：** 需要三维几何、材质反射/折射参数和光源；用玻璃球与图案背景观察折射、反射路径。
**区别与边界：** 光线追踪是计算原理，不对应唯一视觉风格；简单递归版本不会自动计算所有间接漫反射光照。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/recursive-ray-tracing)；固定详情快照 `effects/recursive-ray-tracing.json`，SHA-256 `ebf717ad448ed053824abae2f862d6e4c290eddd69178d81eb0d8b930e183ac9`。
**Atlas 所列参考：** [原始参考页面](https://my.eng.utah.edu/~cs6965/papers/p343-whitted.pdf)。

## atlas:redscale-film · 倒装彩色胶片红调

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 彩色胶片反向装载，使光先穿过红敏层再到其他层，画面偏红橙黄，天空可能呈暗黄或绿色；颜色来自层序改变。
**必要输入与条件：** 使用可倒装的彩色负片并控制曝光；比较欠曝、正常和过曝对红至黄调的移动。
**区别与边界：** 过曝会让更多光到达绿蓝层，色调可能向黄移；它不是把黑白照片统一染成棕色的sepia。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/redscale-film)；固定详情快照 `effects/redscale-film.json`，SHA-256 `1c582cdce5bb996ca279687cb50e240598862d8558bf721d76b1b523113d9df8`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:HK_Redscale_%E5%A4%A9%E6%98%9F%E7%A2%BC%E9%A0%AD_(4708320905).jpg)。

## atlas:reinhard-color-transfer · Reinhard 统计色彩迁移

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 在lαβ颜色空间分别匹配源图与参考图的通道均值和标准差，再转回RGB，使整体色彩分布靠近参考图而空间结构大体保留。
**必要输入与条件：** 需要内容图与色彩参考图；选取有相近明暗层次的参考，并检查肤色、天空与阴影映射。
**区别与边界：** 统计匹配不理解物体语义，肤色等局部颜色可能被整体拉偏；它改变全图颜色分布，不是自动逐对象配色。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/reinhard-color-transfer)；固定详情快照 `effects/reinhard-color-transfer.json`，SHA-256 `7f4db7746de808e45c089ee18563bc470e3b21e5f2bcb46067ef64fe3918160f`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Ceramics,_Cafe,_Camera_(Unsplash).jpg)。

## atlas:reverse-motion · 倒放动作

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 把视频帧的时间顺序反转，让水流回卷、碎片重组或烟雾逆向收缩；改变帧序本身不必改变播放速度。
**必要输入与条件：** 需要连续动作片段并明确反转范围；用可逆动作示例检查主体、背景和声音是否同步。
**区别与边界：** 生长、烟雾和嘴形等熟悉过程容易暴露倒放；静帧只能暗示回退，不能证明完整倒放时序。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/reverse-motion)；固定详情快照 `effects/reverse-motion.json`，SHA-256 `9e86bdab9d5b2af23078fd64867cf9cefe80f8b9a6cf5dfc2f98d64d6b0256d2`。
**Atlas 所列参考：** [原始参考页面](https://replay.bfi.org.uk/video/187/b1b55e08-03b5-5e60-8013-ea35f00f50b7)。

## atlas:rgb-channel-isolation · RGB 单通道隔离

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 只取红、绿或蓝中的一个通道并以灰阶强度显示，显出不同颜色区域在该通道的明暗差异。
**必要输入与条件：** 选定单一RGB通道并保留连续灰阶；并排比较红、绿、蓝通道对同一对象的响应。
**区别与边界：** 这是通道分离显示，不会移动颜色边缘；与把三通道错位叠合造成彩边的RGB split不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/rgb-channel-isolation)；固定详情快照 `effects/rgb-channel-isolation.json`，SHA-256 `d1f3cb7d63d7d7b55581678340857f0e9906eab2855b005c77ea2e089916d80b`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:rgb-channel-split · RGB 三通道错位

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 把红绿蓝通道分别向不同方向平移，使高反差轮廓出现彩色双边；偏移大小与方向决定重影形状。
**必要输入与条件：** 将通道分层并设置对称或非对称像素偏移；在文字、边缘和纹理处检查色边强度。
**区别与边界：** 这是可控的数字通道错位，不代表文件损坏；不同于光学色差由镜头波长折射差造成。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/rgb-channel-split)；固定详情快照 `effects/rgb-channel-split.json`，SHA-256 `7b3da8cbf6b41bf5bb366e6460407b360252361536851aa37692ca92ed81952f`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:rgb-split · RGB 故障式分离

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 将色彩通道错位与局部横线位移、块状错误和跳帧感叠加，形成数字信号故障外观；通道错位本身可独立控制。
**必要输入与条件：** 先设RGB通道偏移，再以蒙版加入少量条带/块错位；让故障集中在边缘或局部区域。
**区别与边界：** 光学色差由波长相关镜头成像引起，RGB split是数字处理；datamosh则操纵视频压缩帧依赖，原理不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/rgb-split)；固定详情快照 `effects/rgb-split.json`，SHA-256 `1d54ec093d9de186fcf918b61f67621fb1369428bb7195f5e10741a8ae77ce56`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Glitch_Art.jpg)。

## atlas:risograph · Risograph 孔版印刷

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 每种专色通过独立模板和滚筒套印，纸面呈颗粒油墨、鲜明专色与轻微套准偏差；屏幕上的riso look只是观感模拟。
**必要输入与条件：** 需要分色版、不同专色层与未涂布纸；逐色控制覆盖量、滚筒顺序和套准。
**区别与边界：** 屏幕模拟不能替代纸张和真实专色油墨；色层重叠会产生新的混色，效果取决于油墨覆盖与压印。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/risograph)；固定详情快照 `effects/risograph.json`，SHA-256 `f4ee2c0177ee1d64248eb7c58d4040ba4cb87f2b0450ab4946cdab0603059861`。
**Atlas 所列参考：** [原始参考页面](https://www.riso.co.jp/english/product/digital_dup/history/index.html)。

## atlas:risograph-register-error · 孔版印刷套色偏位示意

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 两层颗粒油墨轻微错位，边缘出现珊瑚红与深青色双影和叠印暗区；这是打印套准偏差的外观示意。
**必要输入与条件：** 需要两种独立色版、纸纹与可调水平/垂直偏移；检查重叠色与纸面边界。
**区别与边界：** 本条分类为示意，不证明真实Risograph印刷；真实印墨、纸吸收和套准偏差会因机器与纸张改变。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/risograph-register-error)；固定详情快照 `effects/risograph-register-error.json`，SHA-256 `cbf81edbf51b52647ab33463fa09e61c1a93b0410d752b07898f05277e1a8f5c`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:roberts-cross · Roberts 交叉边缘算子

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 用两组2×2对角差分核估计局部亮度变化，输出细小、常带噪点的斜向边缘线。
**必要输入与条件：** 输入灰度图并设置响应阈值；用细织物边缘或对角线观察极小核的局部响应。
**区别与边界：** 小核对噪声和微弱纹理很敏感；与多阶段边缘连接流程的Canny不同，不会自动获得稳定连贯轮廓。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/roberts-cross)；固定详情快照 `effects/roberts-cross.json`，SHA-256 `67ea606b51d9bb3b724593b429d7f477500d3e832402129caf023efc6b948601`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:rolling-ball-background · 滚动球背景扣除

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 把亮度看成起伏表面，用设定半径的虚拟球估计缓慢变化的背景，再从原图减去，使小尺度亮结构更突出。
**必要输入与条件：** 设定球半径并先判断背景起伏尺度；对比阴影、照明渐变与目标亮点是否被分别保留。
**区别与边界：** 球半径太小会留下背景阴影，太大则连目标结构一起扣掉；只能抑制估计出的宽缓背景变化。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/rolling-ball-background)；固定详情快照 `effects/rolling-ball-background.json`，SHA-256 `ec2f0b93f4022f234a80ce8e32a87d028f36c8ef77d1e97d393ec5483367ab99`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Man_with_his_smatphone_on_a_rooftop_in_Paris_(Unsplash).jpg)。

## atlas:rolling-shutter-wobble · 滚动快门逐行倾斜

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 传感器逐行曝光时相机或主体快速运动，不同行记录在不同时间，直立物因此弯曲、倾斜或拉伸。
**必要输入与条件：** 需要行扫描读出与快速相对运动；按行设置渐变位移，检查杆状物、机翼或建筑竖线。
**区别与边界：** 逐行读出产生的扭曲不同于全局快门整帧同刻曝光；后期行错位只模拟形态，不证明原相机使用滚动快门。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/rolling-shutter-wobble)；固定详情快照 `effects/rolling-shutter-wobble.json`，SHA-256 `57c8b1a7c466ca1bc4f10cc943b6765eec7c77199c928225b49c477d5fa1ab20`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_(Unsplash).jpg)。

## atlas:rotoscoping · 逐帧描摹动画

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 沿实拍动作逐帧描绘人物轮廓和姿态，保留真实动作节奏并转换为动画形体；数字rotoscoping也可逐帧制作遮罩。
**必要输入与条件：** 真实逐帧描摹需连续影像参考并逐帧跟踪轮廓；数字遮罩也可手工逐帧绘制。若只借用描线质感或动作节奏，可用绘制序列模拟，并说明不是从实拍逐帧描摹所得。
**区别与边界：** 它依赖人工描摹和帧间修整，不是自动AI视频传输；描线会把实拍比例与运动带入动画，但不自动增加新动作。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/rotoscoping)；固定详情快照 `effects/rotoscoping.json`，SHA-256 `034e1e918a23a1ce471067a232be2c0622cf64e57154c3d0442e8e1146c579df`。
**Atlas 所列参考：** [原始参考页面](https://www.moma.org/calendar/events/9438)。

## atlas:rutt-etra-scan-processing · Rutt/Etra 扫描线合成

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 让输入亮度改变模拟视频扫描网格的偏转，高亮区域鼓成起伏线性山脊、暗部压低，像电子线框地貌。
**必要输入与条件：** 需要视频亮度信号和可调扫描网格；先用人像或灰度图测试亮部峰值与水平线密度。
**区别与边界：** 空间感来自模拟扫描线弯曲，不是数字三维网格或顶点几何；数字仿制需明确只是模拟原理。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/rutt-etra-scan-processing)；固定详情快照 `effects/rutt-etra-scan-processing.json`，SHA-256 `99ffaa172b254c65a99cc46bf82958c7b728b67e61a12dedcd9a23715c745acf`。
**Atlas 所列参考：** [原始参考页面](https://www.fondation-langlois.org/html/e/page.php?NumPage=456)。

## atlas:saliency-map · 显著性注意力热图

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 按颜色差、局部对比和纹理等特征估计画面中突出的区域，白色表示相对显著、黑色表示较弱；这是一种计算模型的注意力图。
**必要输入与条件：** 输入图像并选定显著性算法；比较单一亮物体与复杂纹理场景，看注意区域如何转移。
**区别与边界：** 计算显著不等于所有观众实际看向哪里；不同模型的颜色、尺度与对比权重会改变结果。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/saliency-map)；固定详情快照 `effects/saliency-map.json`，SHA-256 `7fdb45353d67a33e5194e23312c057955e63a83a55d47795337d90e0e121cdf7`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Cake_store_(Unsplash).jpg)。

## atlas:salted-paper-print · 盐纸正片

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 纸面盐分与硝酸银形成感光氯化银，曝光后得到哑光、纸纤维可见且细节偏柔的正片。
**必要输入与条件：** 需要盐纸涂布、银盐感光、底片接触曝光和定影；以纸面纹理和柔和边缘识别工艺。
**区别与边界：** 盐纸印相是正片，calotype主要指纸负片流程；两者可有关联但处于不同成像阶段。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/salted-paper-print)；固定详情快照 `effects/salted-paper-print.json`，SHA-256 `4a2250c5010eb6a9c48bd41bc5c20cdb6f2b92f10e10f1ad27999a5ece7769ce`。
**Atlas 所列参考：** [原始参考页面](https://www.vam.ac.uk/articles/photographic-processes)。

## atlas:sand-animation · 沙粒逐格动画

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 在发光台上铺沙，较厚沙层遮光显暗、薄层透光显亮；逐格挪动沙粒，人物轮廓便融化、延展并变成新形。
**必要输入与条件：** 需要浅盘、细沙、透射光和逐帧记录；控制沙层厚度与手指扫出的高光。
**区别与边界：** 动作来自分帧调整松散材料，不同于连续拍摄的现场沙画手势，也不同于替换透明画片的赛璐珞动画。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/sand-animation)；固定详情快照 `effects/sand-animation.json`，SHA-256 `ba7fc03487c3ed69cfed69552bb6d4d366a5223e1769fdf1349c29f1dbde82f8`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Maharana_pratap_-_Sand_Animation.jpg)。

## atlas:saturation-boost · 饱和度增强

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 提高现有颜色的饱和度而不改变空间结构，红蓝绿更鲜艳，中性灰区域仍接近中性。
**必要输入与条件：** 对彩色图像调饱和度并观察高饱和橙、红和肤色区域；按输出色域逐步调整。
**区别与边界：** 通道接近色域边界时继续增加会剪切颜色；增强饱和度不等于提高亮度或重新指定色相。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/saturation-boost)；固定详情快照 `effects/saturation-boost.json`，SHA-256 `ce10f42fffaccfeede93357ad5118e64d2c2a2dbda3071a4801d4d0f496a41b9`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:scanimate-analog-animation · Scanimate 模拟视频形变

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 专用模拟视频系统实时扭曲拍摄的标志或图形，让轮廓弹性拉伸、翻卷并带电子辉光；它是制作系统和工作流，不是一种固定滤镜。
**必要输入与条件：** 历史复现需有原始信号处理设备或制作记录；数字模仿可用亮度遮罩、波形形变与色彩尾迹组合。
**区别与边界：** 数字复古效果只能模拟视觉语言的一部分，不能证明采用了Scanimate；原系统可实时操纵输入信号并重映射亮暗纹理。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/scanimate-analog-animation)；固定详情快照 `effects/scanimate-analog-animation.json`，SHA-256 `ea8a4a3fec6496273311db696aba1526141db82669501fb29ff2cbd1f32bcd24`。
**Atlas 所列参考：** [原始参考页面](https://www.siggraph.org/news/siggraph-pioneers-the-analog-animation-era-1969-1983/)。

## atlas:scanline-displacement · 逐行位移扭曲

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 逐行对图像施加不同水平偏移，偏移由正弦波或噪声驱动，造成横向撕裂、波浪边缘和画面抖动。
**必要输入与条件：** 设置行位移函数、幅度、周期和随机量；比较平滑波与突发跳变的视觉差异。
**区别与边界：** 这会扭曲整行几何，不一定对应真实传输故障；偏移过强会让文字和物体轮廓无法辨认。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/scanline-displacement)；固定详情快照 `effects/scanline-displacement.json`，SHA-256 `88e5a5ab34a6fecb87b2a13ba3ae35b19e48298d7aa0bbfd07e5172b95295096`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:scanning-electron-micrograph · 扫描电子显微图像

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 聚焦电子束逐点扫描样品，检测二次电子等信号并映成灰度；表面起伏显得立体，景深远大于普通光学显微图。
**必要输入与条件：** 若声称是SEM实测图像，需真实SEM成像或获准使用的档案图；若只讲解形态，可用明确标注的模拟显微示意。伪彩需另行说明，不把模拟纹理说成测量证据。
**区别与边界：** 单张灰阶图不是三维尺寸测量，阴影只提示表面形态；电子信号本身不记录可见颜色，彩色常为后期标注。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/scanning-electron-micrograph)；固定详情快照 `effects/scanning-electron-micrograph.json`，SHA-256 `681fb46da35abde96ee06b0f0465d9a402a40c7175c9f44e48e06ccbf0aa7e81`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Ebola_Virus_-_Electron_Micrograph.tiff)。

## atlas:scharr-filter · Scharr 梯度算子

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 用优化的3×3方向梯度核提取水平、垂直及斜向亮度边界，在小核范围内比普通差分更均匀地响应方向。
**必要输入与条件：** 输入灰度图并设响应尺度与阈值；用细斜线和织物纹理与Sobel输出对照。
**区别与边界：** 结果仍取决于局部对比和噪声，不具物体语义；它改善方向对称性，不会自动完成边缘分组或去噪。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/scharr-filter)；固定详情快照 `effects/scharr-filter.json`，SHA-256 `e190b567d63ba30a63e9cf974faec2402050c2e5f1642bbf856955bd05b11d2c`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:schlieren-photography · 施利伦折射率成像

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 空气密度变化让光线轻微偏折，刀口遮挡部分偏折光后将其转成明暗波纹，可见热流、气体或声波造成的透明扰动。
**必要输入与条件：** 需要均匀光路、被测透明介质和位于焦面的刀口；以中性背景呈现流线两侧的亮暗带。
**区别与边界：** 图像响应的是沿光路累积的折射率梯度，不是直接显示温度或气流速度；无刀口的阴影法灵敏度较低，机制不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/schlieren-photography)；固定详情快照 `effects/schlieren-photography.json`，SHA-256 `ef9783fc58a02e21c6537e693e3c0e4419019c64c3206ae6962745c9d8c26bbb`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Shockwave_pattern_around_a_T-38C_observed_with_Background-Oriented_Schlieren_photography_(1).jpg)。

## atlas:schufftan-process · 舒夫坦镜面合成

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 半透镀膜镜同时反射微缩建筑模型并透出镜后真人，使演员与巨大布景在同一摄影画面中对齐。
**必要输入与条件：** 需局部镀膜镜、微缩模型、镜后表演区和固定摄影机；沿相机视线校准模型透视、镜面和演员位置。
**区别与边界：** 机位或镜面稍移就会暴露拼接边界；这是实物镜面合成，不是可自由移动的数字拼贴。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/schufftan-process)；固定详情快照 `effects/schufftan-process.json`，SHA-256 `85f0a6173f05add4c2db00559f486097fa439bb5447fdd13f29d09208c5a8aad`。
**Atlas 所列参考：** [原始参考页面](https://www.filmportal.de/person/eugen-schuefftan_e65aa989b5bf4adabf0ee1a44b911f54)。

## atlas:screen-tearing · 屏幕撕裂错帧

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 画面在水平扫描处切成错位带，物体轮廓在断线位置跳开；模拟显示器仍在扫描旧帧时缓冲区已换新帧。
**必要输入与条件：** 选择一条或多条撕裂线、偏移方向和宽度；保留清晰像素边缘以显出错帧断裂。
**区别与边界：** 本条通过逐行偏移模拟，不代表真实显示器或视频信号经历了撕裂；过多断带会让主体失去连续性。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/screen-tearing)；固定详情快照 `effects/screen-tearing.json`，SHA-256 `5548afa4d946c07caa2180b2e638287056ac4e603661b1be26558512955bcbee`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Violet_flowers_on_a_cliff_(Unsplash).jpg)。

## atlas:scribble-control · 涂鸦线稿控制图

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 用少量粗略线条指定主体姿势、轮廓和关键内部结构，作为简化的图像控制输入；线条而非完整照片决定布局提示。
**必要输入与条件：** 从参考图或草图提取必要轮廓，用最少线条说明姿势、尺度和主要结构。
**区别与边界：** 控制线只提供粗略结构，不能单独生成目标画面或保证细节；线条过多会失去简洁控制作用。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/scribble-control)；固定详情快照 `effects/scribble-control.json`，SHA-256 `d3eea1610b9e7787dfc343a4d0f8569c313bafdc2fc0ea2a5a15bdc9b8e3aa5b`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:seam-carving · 内容感知缝合缩放

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 反复寻找贯穿图像、能量较低的像素缝并删除或复制，改变画幅尺寸时尽量保留高显著主体而压缩背景空区。
**必要输入与条件：** 指定目标宽高与能量/显著性计算；先缩小低细节区域，检查人脸、建筑和细直线的比例。
**区别与边界：** 连续移除缝线会扭曲重复纹理和相近主体；它不是均匀缩放，不能保证所有内容完全不变形。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/seam-carving)；固定详情快照 `effects/seam-carving.json`，SHA-256 `d4df52abfe2a9b0410166cda46c790aba30d10ffc85a54ecceeee197f61a15c4`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Flav_(Unsplash).jpg)。

## atlas:seamless-tiling · 无缝纹理平铺

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 通过环绕位移把原图边缘移到中心，再融合中心接缝，使重复平铺时对边颜色和纹理相接。
**必要输入与条件：** 需要可重复纹理与接缝融合，处理后用多行多列平铺检查四边连接。
**区别与边界：** 接缝平滑不代表没有重复特征；内容不适合循环时仍会看出明显周期或重复主体。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/seamless-tiling)；固定详情快照 `effects/seamless-tiling.json`，SHA-256 `d1951d98629e9840de21c22928f25961dcf35f3f4254dbaecf42024b935fdab2`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Sandbank_(Unsplash).jpg)。

## atlas:segmentation-boundaries · 超像素分割边界叠加

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 在原图上描出SLIC超像素分区的细小不规则边界，保留底下照片颜色与纹理，显示图像被切分的区域尺度。
**必要输入与条件：** 需要SLIC区域图并调节超像素数量、紧致度和边界颜色；在细纹理与物体外轮廓间检查粒度。
**区别与边界：** 区域边界不直接代表物体类别或实例；它是分区结果的可视叠加，不是语义分割图。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/segmentation-boundaries)；固定详情快照 `effects/segmentation-boundaries.json`，SHA-256 `7da93ec856313d5af87435afce5aa6ed9ab09b40c429d206b89feeb10c693c4f`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:selective-color · 局部保色与背景去色

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 以数字蒙版保留一个对象或区域的自然色彩，其余画面转为灰阶，让色彩成为局部视觉焦点。
**必要输入与条件：** 需要可跟踪对象蒙版或清晰区域选择；主体移动时逐帧检查遮罩边界和发丝。
**区别与边界：** 静止照片可手工圈选，连续视频需持续跟踪；与在黑白照片上新增颜料的手工着色过程相反。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/selective-color)；固定详情快照 `effects/selective-color.json`，SHA-256 `2e3a970391b80440e58dda1292ce6b2ab72076935b7cd2f4df4f6f125eb27f57`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Flag_of_Bangladesh_in_selective_color_against_a_monochrome_forest_background.jpg)。

## atlas:semantic-segmentation-map · 语义分割类别图示

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 把每个像素标为人、衣物、植物或背景等类别，并以类别色块覆盖；同一类别会共用颜色而不区分个体实例。
**必要输入与条件：** 要真实运行需有对应语义分割模型；类别映射和颜色图例需明确，本条预览仅示意。
**区别与边界：** 该条目注明为示意而非神经推理；分类色块不表示实例边界，也不能由颜色推断实际模型类别结果。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/semantic-segmentation-map)；固定详情快照 `effects/semantic-segmentation-map.json`，SHA-256 `b261611580b7b9f020d130a2b736850aafb2174541ea3694d92b45cf1a6a6fac`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:sepia-matrix · 数字棕褐矩阵映射

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 用线性RGB矩阵重混合通道，把图像映成暖褐阴影、铜色中间调和奶油高光，保留连续明暗。
**必要输入与条件：** 应用颜色矩阵并调节强度；检查肤色、黑位和高光是否仍有层次。
**区别与边界：** 数码矩阵只重排RGB值，不改变相纸或银盐材料；颜色相近的老照片也不一定采用了化学sepia调色。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/sepia-matrix)；固定详情快照 `effects/sepia-matrix.json`，SHA-256 `df27a9b9f0541f64a0aedcc147fb013423cf716217ecf4308cf6404a3977dc1c`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:sepia-toning · 银盐棕褐调色

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 化学调色改变黑白照片中的银影，例如生成棕褐硫化银，带来从奶油亮部到深棕暗部的连续暖色。
**必要输入与条件：** 历史工艺需黑白银盐印相和相容调色剂；数字模拟可映射棕色阶，但应说明只是外观复现。
**区别与边界：** 褐色照片也可能来自纸张、其他工艺或老化，单凭色调不能确定使用sepia；数字染色不改变材料性质。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/sepia-toning)；固定详情快照 `effects/sepia-toning.json`，SHA-256 `2bb50b2c454305533a92a31d40bd119c72532b3bd04e7eb23b2a19646360dabb`。
**Atlas 所列参考：** [原始参考页面](https://www.ilfordphoto.com/amfile/file/download/file/1861/product/717/)。

## atlas:shaky-cam · 手持晃动镜头

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 未稳定的摄影机令画框不规则抖动、地平线漂移和突然重构图；曝光期间的移动还可能带来局部运动模糊。
**必要输入与条件：** 控制抖动幅度、速度和停顿；在主体跟踪与背景参照间保留可读视觉锚点。
**区别与边界：** 快速剪辑是镜头之间的跳转，shaky cam是在同一镜头内改变机位；短快门仍可冻结单帧但序列依旧不稳定。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/shaky-cam)；固定详情快照 `effects/shaky-cam.json`，SHA-256 `bcde697fe1063a3cf43566745f42fc4473ceeeade091f8bc2c41e70c5795deb0`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:M%C3%BCnster,_Prinzipalmarkt_--_2024_--_6718.jpg)。

## atlas:shitomasi-corners · Shi–Tomasi 优质角点

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 根据局部结构矩阵最小特征值筛选两个方向都有明显变化的角点，标记高反差拐角和纹理交汇。
**必要输入与条件：** 设置响应阈值、点间最小距离和最大关键点数量；优先选择同时有水平/垂直变化的稳定位置。
**区别与边界：** 长边缘或平坦区域得分低，阈值太宽会密集误标；关键点是局部特征，不是对象检测结果。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/shitomasi-corners)；固定详情快照 `effects/shitomasi-corners.json`，SHA-256 `2d27d325c09abc5a21da6bc06be31bb1aab3b4dbf2b91890f28add33b71b9939`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:sift-scale-space · SIFT 多尺度特征点

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 在高斯尺度空间寻找不同尺寸下稳定的局部极值，并描述其周围纹理，可用不同半径圆标出角点、斑点和关键区域。
**必要输入与条件：** 需要多尺度高斯图、关键点阈值和方向描述；比较人物与室内纹理在不同尺度的特征分布。
**区别与边界：** 尺度与旋转稳定性不保证在遮挡、模糊或重复纹理下匹配成功；圆圈表示特征尺度，不是物体真实大小。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/sift-scale-space)；固定详情快照 `effects/sift-scale-space.json`，SHA-256 `5962a8f670e769c6d2aef4f482cca4a8ba861237500d53657ceedc33b3e9a3c8`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:silhouette-animation · 剪影逐格动画

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 用不透明纸片或金属关节偶放在玻璃台上，自上方逐帧拍摄并由下方照明，角色成为无内部细节的黑色形体。
**必要输入与条件：** 需要可活动剪纸/金属片、透明台面、背光和逐格摄影；通过关节重叠设计姿势与动作。
**区别与边界：** 这是拍摄的逐格动画，不是现场演出的影子戏；角色内部细节不可见，与赛璐珞绘制角色方式不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/silhouette-animation)；固定详情快照 `effects/silhouette-animation.json`，SHA-256 `ac9a743455a5057591ae7200ed44825620cceca4daff8d8308a0e8419956dfa0`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Lotte_Reiniger_Prinz_Achmed_002.jpg)。

## atlas:silkscreen-print · 丝网印刷

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 把墨料压过网版开孔转印到纸或布上，形成平涂色块和硬边；多色版稍错位会产生套色滑移。
**必要输入与条件：** 需要独立色版、网版、刮墨工具与承印材料；照片阴影可用半色调网点拆解。
**区别与边界：** 平面网版从开孔处转印油墨，不同于凸起木版压印；套色误差和墨层厚薄会随实际印刷工艺变化。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/silkscreen-print)；固定详情快照 `effects/silkscreen-print.json`，SHA-256 `16e7797c25f3fbd7994b6e985466b6ecde65ea21087d3ec97ed359d55170fac5`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:OSCAL_2017_silkscreen_printed_materials_07.jpg)。

## atlas:skeletonization · 二值形态骨架细化

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 从前景形状边界反复削去像素，直到只剩沿对象中心路径的细线网络，同时尽量保留分支、连通性和闭环。
**必要输入与条件：** 需要二值前景蒙版和细化算法；检查主干连续、分叉点和小孔环是否仍保留。
**区别与边界：** 输入边界的缺口会导致骨架断裂或多余枝杈；一像素线图表达拓扑骨架，不保留形状面积和边界宽度。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/skeletonization)；固定详情快照 `effects/skeletonization.json`，SHA-256 `1841c7165ed09922218e5528e15556a529ebd2f663f20c23482bef357c07aaed`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Forest_skyline_and_clouds_(Unsplash).jpg)。

## atlas:skeuomorphic-interface · 拟物化数字界面

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 用皮革缝线、木纹、金属边和熟悉物件细节，把按钮或面板设计成像实体物品；材质隐喻帮助理解功能，但实体无需真的存在。
**必要输入与条件：** 选取与交互功能相关的物件线索，例如笔记本纹理对应书写；保留清楚标签与点击状态。
**区别与边界：** 仅有真实感渐层不自动构成拟物化，需借用可辨的物件/材料特征；装饰细节不能取代操作反馈。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/skeuomorphic-interface)；固定详情快照 `effects/skeuomorphic-interface.json`，SHA-256 `1a474320e48cc579db0c295a6e295a3f9c7889811fc11085dacaa0279553c448`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Skeuomorph)。

## atlas:slic-superpixels · SLIC 紧致超像素

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 按颜色相似度和空间邻近度聚类像素，形成大小近似、紧凑且连通的色块，并尽量贴合图像边缘。
**必要输入与条件：** 设置超像素数量与紧致度；比较区域大小、边缘贴合和纹理简化程度。
**区别与边界：** 色块是算法分区而非对象类别；颗粒纹理、细窄物体或相邻同色区域可能被切碎或合并。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/slic-superpixels)；固定详情快照 `effects/slic-superpixels.json`，SHA-256 `506d817e2b60452304df9f9fc68fed130693b5a0a71187cd0d608c22caad728e`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:slit-scan-photography · 狭缝扫描摄影

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 狭窄开口在曝光或扫描期间记录不断变化的影像，运动会拉成长条光带和透视隧道；画面形状随时间而非单次空间曝光形成。
**必要输入与条件：** 需要窄缝、相机/原图移动和持续记录；沿消失点安排光带方向与纵深。
**区别与边界：** 一种电影特效可能把多种素材合成，抽象彩色通道不一定都是狭缝扫描；静帧只能展示扫描后的一刻。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/slit-scan-photography)；固定详情快照 `effects/slit-scan-photography.json`，SHA-256 `50189eaffa141acfb49e39b151d197a8465e811778664aad0b3a8c1e035693d2`。
**Atlas 所列参考：** [原始参考页面](https://www.bfi.org.uk/news/douglas-trumbull-1942-2022)。

## atlas:slow-motion · 高速拍摄慢放

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 拍摄帧率高于播放帧率，记录更多动作阶段后以较低帧率放映，使动作在时间上展开；100 fps按25 fps播放为四分之一速度。
**必要输入与条件：** 需高帧率连续采集、设定播放帧率和快门；检查动作细节与运动模糊是否匹配慢放速度。
**区别与边界：** 后期减速但没有高帧素材时不会增加真实动作阶段；补帧属于插值推断，不能当作原始捕捉。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/slow-motion)；固定详情快照 `effects/slow-motion.json`，SHA-256 `836cea80cf0b7fbc7563490053eefc1917e845a0d3c659ca3eb86bb43a4a13de`。
**Atlas 所列参考：** [原始参考页面](https://filmglossary.ccnmtl.columbia.edu/term/slow-motion/)。

## atlas:snorricam · 身体固定式 SnorriCam

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 摄影机固定在被摄者身体上并朝向人物，使脸部相对稳定，周围环境随身体运动摇摆；静帧只能暗示这种主客体关系。
**必要输入与条件：** 需要身体安装支架与固定视线；动作安排应让背景产生可读位移，同时保持主体表情可见。
**区别与边界：** 相机随人物身体而非由摄影师自由引导；快速环境摇动可能令人不适，静态画面不能证明运动轨迹。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/snorricam)；固定详情快照 `effects/snorricam.json`，SHA-256 `2b387352d178eee43f33ebc80d2bd1856284dc63be1e1e2529c2cd39d8577e9e`。
**Atlas 所列参考：** [原始参考页面](https://www.snorricam.com/)。

## atlas:sobel-magnitude · Sobel 梯度幅值

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 先用Sobel核计算水平与垂直亮度导数，再合成梯度幅值，使所有方向的强边界变亮、平坦区变暗。
**必要输入与条件：** 可先平滑输入再求导，设置幅值归一化与阈值；对照不同平滑强度下的细边缘。
**区别与边界：** 合成幅值去掉了边缘方向信息，噪声仍会形成响应；它不是带方向符号的X或Y单轴结果。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/sobel-magnitude)；固定详情快照 `effects/sobel-magnitude.json`，SHA-256 `a2132681bee186008e40bae49ba99a663da595d8ee68c4d3772c1afa20163a54`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:sobel-x · Sobel X 水平梯度

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 计算沿X轴的亮度变化，突出亮度左右变化形成的竖直边缘，弱化水平边界。
**必要输入与条件：** 输入灰度图并调整响应阈值；观察竖线、面部轮廓和竖直建筑边。
**区别与边界：** 噪声与细纹理也会产生强响应；这表示水平亮度导数，不是“图像沿水平方向的边缘”。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/sobel-x)；固定详情快照 `effects/sobel-x.json`，SHA-256 `b21b408928b093305c3dab596d264751c1dc83c46c01e166d2f7c57e24076b31`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:sobel-y · Sobel Y 垂直梯度

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 计算沿Y轴的亮度变化，突出亮度上下变化形成的水平边缘，弱化竖直边界。
**必要输入与条件：** 输入灰度图并调整响应阈值；检查脸部、衣领和房间横线等水平细节。
**区别与边界：** 只表示垂直亮度导数响应；和Sobel X合并成幅值后才不区分边缘方向。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/sobel-y)；固定详情快照 `effects/sobel-y.json`，SHA-256 `636244b55b9232d72f5c0ad01009aa5d2186e90eba0c9bbd23dade163e9805c7`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:sodium-vapor-process · 钠灯分色抠像

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 以单色钠蒸气灯照亮前景，再用棱镜把黄色钠光与彩色画面光学分离记录，得到可用于抠像的高质量遮罩，细发丝也能保留。
**必要输入与条件：** 需要钠灯、特殊分光棱镜、同步记录与后期合成；检查发丝、薄纱和半透明边缘。
**区别与边界：** 这是拍摄与光学分色流程，不是把画面染黄的滤镜；特殊设备和两路记录需精确同步。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/sodium-vapor-process)；固定详情快照 `effects/sodium-vapor-process.json`，SHA-256 `9799290430ca913b85764c5e781f48f669b79753f5ea022573e036469cf66ad4`。
**Atlas 所列参考：** [原始参考页面](https://thewaltdisneycompany.com/app/uploads/2025/08/C2E2-SVP-Image-2-1024x576.jpg)。

## atlas:soft-edge · 柔化边缘响应图

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 以浅灰渐变轮廓代替硬二值线，边缘强度随局部结构变化并淡化细纹，呈现软边控制图的样子。
**必要输入与条件：** 用于解释柔边图时，保持主要外轮廓和关键内部边缘，压低细碎纹理。
**区别与边界：** 该预览标为示意而非神经推理；浅灰轮廓不能证明调用了HED模型或得到其真实边缘输出。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/soft-edge)；固定详情快照 `effects/soft-edge.json`，SHA-256 `2314d0f220c3ee70de38ff55e4a804957f0f71e842779efabfc6b6d28cc95628`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:soft-focus · 柔焦镜头效果

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 通过成像扩散或柔焦光学让高光扩散、边缘过渡柔和，同时保留可辨的核心细节；与单纯失焦或运动拖影不同。
**必要输入与条件：** 通过柔光镜、镜头光学或局部扩散实现；让高光柔化但保留面部和关键纹理的清晰核心。
**区别与边界：** 柔焦是有意的成像风格，不等于主体离开焦平面，也不等于浅景深；扩散过强会让所有细节丢失。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/soft-focus)；固定详情快照 `effects/soft-focus.json`，SHA-256 `d50b65b640b4187a3a4f2dc35a811f465890dd69e200394ab3b4002dc95a6a73`。
**Atlas 所列参考：** [原始参考页面](https://www.vam.ac.uk/articles/julia-margaret-camerons-working-methods)。

## atlas:solarization · Sabattier 暗房反转

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 黑白负片或相纸在显影中再次见光，部分色调反转并沿明暗边界形成轮廓线，产生银亮而陌生的影像。
**必要输入与条件：** 历史复现需在显影阶段控制再次曝光；数字模拟可在局部色调反转并保留亮暗边线。
**区别与边界：** 技术上称Sabattier effect，艺术语境常叫solarization；不是强烈过曝，反转范围取决于中途曝光和显影状态。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/solarization)；固定详情快照 `effects/solarization.json`，SHA-256 `15ff09b4485db46ae614fbeda93cfad1bb6b56172268597f044fa38c4a7c944c`。
**Atlas 所列参考：** [原始参考页面](https://www.metmuseum.org/perspectives/man-ray-lee-miller)。

## atlas:solarization-filter · 数字阈值反相滤镜

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 保留较暗像素，只把超过亮度阈值的区域反转，生成局部负片高光和彩色反差边带；阈值决定反转范围。
**必要输入与条件：** 输入数字图像并设亮度阈值与边缘过渡；比较阈值上下变化对高光边界的影响。
**区别与边界：** 这是像素级数字运算，不经历暗房二次曝光；与历史Sabattier效果或整幅过曝不是同一过程。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/solarization-filter)；固定详情快照 `effects/solarization-filter.json`，SHA-256 `aa087f150e8656fa76c306498fd7104f2668cec0ee00bf01c2055e84ae645e39`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:special-effects-makeup · 特效化妆与义体塑形

**视觉家族：** 实拍、舞台与模型特效（`atlas-family:practical-effects`）。
**可见效果与关键机制：** 用涂绘阴影改变视觉深度，再以假体真实增加鼻梁、疤痕或皱纹体积；材料贴在演员脸上并随头部动作运动。
**必要输入与条件：** 需要按演员轮廓制作假体、融合边缘、涂绘色彩并匹配现场灯光；检查移动时的粘贴边界。
**区别与边界：** 涂绘凹陷不会随灯光改变投影，真实凸起会产生随光源移动的阴影；这是实物造型，不是两张脸溶解叠化。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/special-effects-makeup)；固定详情快照 `effects/special-effects-makeup.json`，SHA-256 `6566c796b98e113758e188725762920445e171961730e5fa086fea1c4217d1ac`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:As_a_film_Make-up_artist,_Creating_Zombies_is_something_I_enjoy_doing_at_SCARLET_STUDIOS.jpg)。

## atlas:speed-ramping · 速度曲线变速

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 在同一镜头内平滑改变播放速度，让动作经过正常、慢速和快速阶段；变化发生在片段时长映射中，不是切成不同速度的镜头。
**必要输入与条件：** 设定变速曲线和关键时刻；明显慢放段需高帧率素材，或明确使用计算插帧。
**区别与边界：** 恒定慢动作不是speed ramp；普通后期变速不会凭空记录新动作阶段，补出的中间帧属于推算。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/speed-ramping)；固定详情快照 `effects/speed-ramping.json`，SHA-256 `3ec0a93ebfc38d74fb42c4a8f4749a5d720e49c5b07455b5ae615f4a3af21184`。
**Atlas 所列参考：** [原始参考页面](https://helpx.adobe.com/premiere-pro/how-to/slow-down-video.html)。

## atlas:spiral-halftone · 螺旋线半色调

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 以一条连续向外旋绕的黑线重建图像，暗处线条变宽、亮处变细，从而用线宽覆盖比例模拟灰阶。
**必要输入与条件：** 调节螺旋圈距、线宽范围和中心位置；测试面部等细节在不同圈距下是否仍显现。
**区别与边界：** 这是程序计算的线宽半色调，不是灰墨；圈距过大或线宽变化过猛会让细节消失。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/spiral-halftone)；固定详情快照 `effects/spiral-halftone.json`，SHA-256 `38abc319454539c2f1a5f802dc3ced3ac1ad27d4f431fa5bff80ade489c0d6a4`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Blurry_bus_in_motion_(Unsplash).jpg)。

## atlas:spirit-duplicator · 酒精复写机

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 酒精溶解母版上的苯胺染料并转印到纸上，常呈紫色文字、柔软边缘与不均匀浓度；每份复印都会耗去一部分染料。
**必要输入与条件：** 需要含染料的母版、酒精润湿纸张和逐张压印；比较前后多份复印的颜色衰减。
**区别与边界：** 与让油墨穿过蜡纸模板的mimeograph不同；胶质转印也会用染料，但转印介质是明胶表面。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/spirit-duplicator)；固定详情快照 `effects/spirit-duplicator.json`，SHA-256 `042a6181a2418aa1f66cd93c58de0e89048faaddc8e7fcd1fa8bba0a0c854865`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Ditto_machine_copies_of_tests.jpg)。

## atlas:spirit-photography · 灵影双重曝光照片

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 在同一玻璃底片上两次曝光，把低透明度人物叠在正常肖像旁形成幽灵影像；是图像叠加手法，不是超自然证据。
**必要输入与条件：** 需要两次曝光与对位控制；可使第二次曝光主体较淡并让背景透过。
**区别与边界：** 添加的是另一个冻结时刻，不同于移动主体形成的拖影；亮度在感光材料上累加，透明度取决于曝光。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/spirit-photography)；固定详情快照 `effects/spirit-photography.json`，SHA-256 `ae10b2fe7e2b199a52de5fa9a75ff0eae39372856a873d25fc5c8055e803b96f`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Napoleon_III_%22ghost%22_photo.jpg)。

## atlas:spirograph · 齿轮曲线描图器

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 偏心画笔随齿轮在圆环内外滚动，画出规则花瓣、回环与星状留白；齿轮比例和笔孔位置决定曲线形态。
**必要输入与条件：** 需要齿轮、圆环和偏心笔孔；固定齿轮比例，仅改笔孔比较hypotrochoid/epitrochoid回环深浅。
**区别与边界：** 花纹规律来自齿轮约束，不是摆锤节奏和阻尼；笔孔离中心的改变主要影响环线深度。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/spirograph)；固定详情快照 `effects/spirograph.json`，SHA-256 `802cd9703427ff64266e415204da72c50c9c331ae0f97d28980cd8d1fe4f94de`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Spirograph_2019-01-20_to_21st_BDD_Front_Back_CC0_Rev_Daniel_Elis_Axelrod_2021.jpg)。

## atlas:split-field-diopter · 半片近摄附加镜

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 在镜头前加一半近摄镜，使画面一侧的近物与另一侧远景同时清晰；中间区域可能出现模糊或像差接缝。
**必要输入与条件：** 安装半片近摄镜并安排近远两个主体分处镜片覆盖区两侧；检查中间边界的焦点过渡。
**区别与边界：** 它产生两个分离的清晰区，不会扩大整个画面的连续景深；附加镜也不改变摄影机机位。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/split-field-diopter)；固定详情快照 `effects/split-field-diopter.json`，SHA-256 `a3eda1a4561dd9d6eb2291dfcba5f266d94e2cc05adcde3ab10216ae7483e89b`。
**Atlas 所列参考：** [原始参考页面](https://theasc.com/article/shot-craft-deep-focus-diopters/)。

## atlas:split-screen · 分屏并置

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 把多个独立画面同时排在同一画幅中，用边界分隔不同视角、对照或并行事件；同屏不代表同时拍摄。
**必要输入与条件：** 需要多个画面源、时间同步与分屏布局；按对比关系决定等宽、主次或错位窗口。
**区别与边界：** 同时展示与平行剪辑交替展示是两种时间结构；独立源的色温和动作节奏也可能不一致。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/split-screen)；固定详情快照 `effects/split-screen.json`，SHA-256 `78aaef5e1f1fb5d9a0ea5d5f5c4ff27909b3d65b760485a3b7b38b0612303352`。
**Atlas 所列参考：** [原始参考页面](https://filmglossary.ccnmtl.columbia.edu/term/split-screen/)。

## atlas:split-toning · 明暗分区双色调

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 按图像亮度范围分别给阴影和高光着不同颜色，中间调逐渐过渡；调整依据是像素明暗，不是对象蒙版。
**必要输入与条件：** 为阴影、高光各选一色并设过渡范围；同一图像可比较不同颜色组合的情绪变化。
**区别与边界：** 色彩分区不等于选择性保留某个物体颜色；多色图像的存在不能单独证明使用了split toning。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/split-toning)；固定详情快照 `effects/split-toning.json`，SHA-256 `38381db40c3e8937cec1d108f86a8d770e4f322949b99b80d142b2d2bc3467a1`。
**Atlas 所列参考：** [原始参考页面](https://www.adobe.com/us/learn/lightroom-classic/web/stylize-photo-with-split-toning)。

## atlas:sprite-scaling · 精灵图缩放模拟深度

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 硬件把平面位图精灵按距离放大或缩小，并配合屏幕位置变化制造迎面而来的感觉；剪影保持二维，不会显露新表面。
**必要输入与条件：** 需要角色/道具位图、随距离变化的比例与位置、图层遮挡顺序；为转向准备不同视图素材。
**区别与边界：** 与多边形渲染不同，精灵缩放不能自动重建对象背面；与背景滚动不同，它改变的是显示尺寸。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/sprite-scaling)；固定详情快照 `effects/sprite-scaling.json`，SHA-256 `d0ee5dbb346e6215f3a67338914aa1fc0cbb0c2c0ab331b7f33a9e49648285fc`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Sprite_(computer_graphics))。

## atlas:star-filter · 星芒滤镜

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 滤镜表面的交叉细纹使点状高光发生衍射，向外伸出对称针状星芒；射线数量由刻纹方向与数量决定。
**必要输入与条件：** 需要夜景点光源或强烈镜面反光及星芒滤镜；控制滤镜旋转和曝光，选择四点或六点等射线结构。
**区别与边界：** 这是外部栅纹造成的衍射，不是镜头内部反射型flare；画面中所有高光都会带芒，过多会抢主体。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/star-filter)；固定详情快照 `effects/star-filter.json`，SHA-256 `138e0ae312f2eebea42d14ac12a26dde785d875cf2f287381622a0c04a0aef04`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Pictures_With_Star_filter_03.jpg)。

## atlas:steadicam-float · Steadicam 稳定漂移

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 背心、支臂、弹簧和配重隔离步伐抖动，使摄影机可在走动中平稳跟拍、转弯并穿过狭窄空间。
**必要输入与条件：** 需要稳定器、配平与操作者训练；规划行进路线、地面障碍和主体速度。
**区别与边界：** 它可自由转向，不像轨道车只沿固定直线移动；仍有惯性和操作者路线限制，不是数字图像稳定万能修正。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/steadicam-float)；固定详情快照 `effects/steadicam-float.json`，SHA-256 `fdec44a8af4bf0c085aebff9535bb00cc52239618cb4270013fbacdaff5c41f8`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:1994_Ot_Pi_Dick_Crow_Steadicam_Athens.jpg)。

## atlas:steel-engraving · 钢版凹刻版画

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 把细线刻入钢版，擦净版面后让墨留在凹槽中，再以压力转印到湿纸；平行排线和交叉线在远看时融合成灰调。
**必要输入与条件：** 需刻版工具、凹版油墨、湿纸与压印；以放大观察交叉线及极细轮廓。
**区别与边界：** 铜版画采用相似凹版印刷原理但磨耗较快；细线外观不足以判断金属一定是钢。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/steel-engraving)；固定详情快照 `effects/steel-engraving.json`，SHA-256 `2f2c2ea2af3d1647bae80c9129cd56e80bb9f469b10ceeca7e4e0aecc91697f5`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Walt_Whitman,_steel_engraving,_July_1854.jpg)。

## atlas:stencil-coloring · 胶片逐格模板上色

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 在每帧胶片上逐件切出模板，把染料刷过开孔给选定物体着色；边缘可能因套准误差逐帧抖动。
**必要输入与条件：** 需要黑白胶片、对应帧模板和逐色涂布；检查数千帧间颜色边界是否追随物体。
**区别与边界：** 模板色块平整且可重复，与逐帧手绘的色差变化不同；大量模板易产生错位，颜色也不是摄影现场记录。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/stencil-coloring)；固定详情快照 `effects/stencil-coloring.json`，SHA-256 `d5131e96b4192b9422a5cd9e7cf9b29ffbfa06dd32623da2291154be13e5ed13`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:The_Life_and_Passion_of_Jesus_Christ_(1907).jpg)。

## atlas:stereo-day-night-tissue · 昼夜透光立体照片

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 一对立体照片背衬薄纸、彩色组织层并开少量小孔；正面光下呈日景，背光后颜色显现、窗孔发亮。
**必要输入与条件：** 需要左右眼照片、透光薄纸、选择性染色和局部针孔；对照正面光与背光的不同层次。
**区别与边界：** 外观随照明方向明显变化，与普通着色立体照片不同；不应穿刺或改动原件，演示用复制品。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/stereo-day-night-tissue)；固定详情快照 `effects/stereo-day-night-tissue.json`，SHA-256 `1904ec14aa8ebd34b727e71f5ed85395becd725f3732cb3e2db5798aee8cc832`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Diableries)。

## atlas:stereoscopic-3d-cinema · 双目立体电影

**视觉家族：** 立体视觉与多视角（`atlas-family:stereoscopic-space`）。
**可见效果与关键机制：** 左右眼分别接收略有视差的画面，经偏振、快门或其他分眼眼镜分离后，大脑将视差解释成屏幕前后深度；这是立体摄影，不等于CGI。
**必要输入与条件：** 需左右视图、对应放映/显示方式和分眼眼镜；控制前后视差并检查焦点与字幕深度。
**区别与边界：** 1950年代立体电影不只使用红青anaglyph，也采用偏振投影；视差过大或左右眼错配会造成融合困难。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/stereoscopic-3d-cinema)；固定详情快照 `effects/stereoscopic-3d-cinema.json`，SHA-256 `552b8613d3c745b0a481e63bb8f7f9083886ff3b86d46392e4a9912ee03f8440`。
**Atlas 所列参考：** [原始参考页面](https://www.bfi.org.uk/features/truly-madly-deepie-britains-first-fling-with-3d)。

## atlas:stereoscopy · 立体照片双目观看

**视觉家族：** 立体视觉与多视角（`atlas-family:stereoscopic-space`）。
**可见效果与关键机制：** 两张几乎相同但视点略有差别的照片分别送到左右眼，大脑利用前后景视差合成立体深度；并排图不是简单复制同一张图。
**必要输入与条件：** 从两个略微横移的机位拍摄静止主体，使用立体镜或左右眼分视方式观看。
**区别与边界：** 左右图视差过小不明显、过大会难以融合；单张照片本身不会产生双目深度。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/stereoscopy)；固定详情快照 `effects/stereoscopy.json`，SHA-256 `abfd49000d14f5add6c0f610c2cec066bff1d8f4b868831493a7f268a9fd53b2`。
**Atlas 所列参考：** [原始参考页面](https://blog.scienceandmediamuseum.org.uk/a-z-photography-l-is-for-london-stereoscopic-company/)。

## atlas:stipple-pointillism · 疏密点描

**视觉家族：** 色调量化与印刷网点（`atlas-family:tone-print`）。
**可见效果与关键机制：** 用大小近似的黑点按局部明暗改变密度，点群远看融合为灰阶；黑白点位置不按固定网格排列。
**必要输入与条件：** 控制点密度、点径和随机分布；阴影加密、亮部留白，并在实际输出尺寸检查细节。
**区别与边界：** 规则半色调靠网格点径，抖色靠像素量化误差；点描靠不规则墨点密度，三者纹理机制不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/stipple-pointillism)；固定详情快照 `effects/stipple-pointillism.json`，SHA-256 `1357890dbca4c99ae25d569eba0fd5bfcef0c34498bb126a7d69eaf081925686`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:stop-motion-animation · 实体逐格动画

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 真实物体每次只移动少量后单独拍一帧，连续播放后产生独立运动；手工模型的接缝和轻微抖动可见。
**必要输入与条件：** 实际定格动画需稳定机位、实体对象逐格微调和连续曝光；数字制作可以逐格改变姿态、位置与纹理来模拟其节奏和手作不齐，标明是定格风格模拟。
**区别与边界：** 1912是简要历史节点，不是发明年份；真人逐格拍摄叫pixilation，同样逐帧但主体是演员。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/stop-motion-animation)；固定详情快照 `effects/stop-motion-animation.json`，SHA-256 `78251f8b7353b2346628e415d1f5aabadf6148f5644f1afa6f760f349d9a1ea8`。
**Atlas 所列参考：** [原始参考页面](https://www.bfi.org.uk/features/stop-motion-imperfection-why-animation-needs-human-touch)。

## atlas:stop-trick · 停机替换剪接

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 锁定摄影机后停拍、替换或改变主体，再从同一画面继续拍摄，剪掉中断处便像物体突然消失或变形。
**必要输入与条件：** 需要固定机位、连续背景和精准替换位置；拍摄前标记主体、灯光和影子位置。
**区别与边界：** 效果来自一次不可见的时间跳跃，不是逐格移动物体的stop-motion；镜头或布景移动会暴露剪接。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/stop-trick)；固定详情快照 `effects/stop-trick.json`，SHA-256 `fa6fba952f46b45528c673ba1fee031913e42e38cc48f346f15802760866201a`。
**Atlas 所列参考：** [原始参考页面](https://www.cinematheque.fr/henri/film/52460-escamotage-d-une-dame-chez-robert-houdin-georges-melies-1896/)。

## atlas:stroboscopic-photography · 频闪多重曝光摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 黑暗环境中让快门保持开启，用快速闪光多次照亮移动主体，把多个清晰动作阶段曝光在同一张底片上。
**必要输入与条件：** 需要暗场、固定相机、运动主体和定时频闪；背景宜暗以避免每次闪光都叠亮。
**区别与边界：** 它用单张底片累积多个瞬间，chronophotography通常呈现分开的动作帧；强频闪可能造成视觉不适。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/stroboscopic-photography)；固定详情快照 `effects/stroboscopic-photography.json`，SHA-256 `1031c73f8e383fe675b1c325f1201e3d513fa503b5680b65c075ea6e8649d134`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Milk_Drop_Coronet,_1957_v2.jpg)。

## atlas:structure-tensor-orientation · 结构张量方向图

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 在邻域内平均梯度乘积并构成结构张量，以特征向量估计主要边缘方向及其垂直方向，适合用伪彩显示纹理走向。
**必要输入与条件：** 设置梯度平滑和局部平均尺度；比较细纹理方向与较宽轮廓的变化。
**区别与边界：** 输出是局部方向统计，不是物体轮廓语义；尺度和角度颜色映射需要在图例中说明。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/structure-tensor-orientation)；固定详情快照 `effects/structure-tensor-orientation.json`，SHA-256 `24caa187f225e114f85b4582b11dc93fdff31237351403b0a3f46e835646e476`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Cliff_rocks_on_the_coastline_(Unsplash).jpg)。

## atlas:subsurface-scattering · 次表面散射

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 光进入皮肤、蜡或石材内部后散射并从邻近位置逸出，使薄边和逆光区域柔和透亮；表面细节仍可清晰。
**必要输入与条件：** 需要支持次表面散射的材质模型、颜色/厚度参数和适配光照；观察耳缘、蜡面或薄石片的背光效果。
**区别与边界：** 它改变的是材质内部光传输，不是镜头柔焦或玻璃透明；强度过大会显得蜡状、失去表面质感。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/subsurface-scattering)；固定详情快照 `effects/subsurface-scattering.json`，SHA-256 `d21820e514cb2fc73c02d516abc76a7794e1aac717946e14abfc8efb0c38f997`。
**Atlas 所列参考：** [原始参考页面](https://graphics.stanford.edu/papers/bssrdf/)。

## atlas:super-resolution · 超分辨率放大

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 把低分辨率图扩成更高采样网格，插值或模型可能补出统计上合理的细节；原始结构应与新增纹理区分。
**必要输入与条件：** 要呈现真实超分结果，需低分辨率输入与具体插值/超分模型，并并排比较传统插值和模型输出。讲解图可用示意网格解释细节补全；未运行模型时不称为真实超分结果。
**区别与边界：** 本条预览是示意而非神经推理；模型新增的发丝或纹理只是合理预测，不能视为原始场景证据。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/super-resolution)；固定详情快照 `effects/super-resolution.json`，SHA-256 `92296fdd66a2a6307fd2ddf81b7e84703e85fd07a195ec768b33c88a98896ab1`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:swirl · 中心旋涡扭曲

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 像素旋转角度依赖其到中心的距离，中心附近转动最强并向外渐弱，形成螺旋形扭曲。
**必要输入与条件：** 设定中心、影响半径和角度衰减；观察中心纹理与外圈轮廓的连贯过渡。
**区别与边界：** 局部旋转会拉扯和重采样细节，可能使中心难辨；中心点偏移会改变旋涡形态。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/swirl)；固定详情快照 `effects/swirl.json`，SHA-256 `c33962fbe1e40b118673e219df304663e733357593a83f1d34aab05ad1c584e3`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:teal-and-orange-color-grading · 青橙电影调色

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 把暗部推向青蓝/青绿，把肤色、高光和实景灯推向橙金，利用互补色建立冷暖分区。
**必要输入与条件：** 根据原有曝光和光线决定阴影、肤色与灯光范围；先做轻微分区，再检查肤色与环境光关系。
**区别与边界：** 效果依赖原始光线和颜色分布，不是一个对所有场景等效的固定LUT；橙色肤色过重会显得假。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/teal-and-orange-color-grading)；固定详情快照 `effects/teal-and-orange-color-grading.json`，SHA-256 `cb0a5903e9e32b5501cc1959d3c71c20e6a94008934dad618f278156230cd782`。
**Atlas 所列参考：** [原始参考页面](https://www.adobe.com/creativecloud/video/hub/features/why-use-orange-teal-grading.html)。

## atlas:teletext-graphics · 图文电视块状图形

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 解码电视垂直消隐间隔中的字符数据后，以粗网格彩色方块和简单文字绘出低分辨率页面；字符由马赛克子块组合。
**必要输入与条件：** 使用固定字符网格、有限色板和块状字形；按40×24级别的粗分辨率安排图文。
**区别与边界：** 信息以字符编码和马赛克字形存储，不是逐像素栅格图；小网格会限制曲线、细字和色彩渐变。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/teletext-graphics)；固定详情快照 `effects/teletext-graphics.json`，SHA-256 `81f3eb5f7c1dcd64f030543afda1ee6200920d2982e092d03970454c4b69c905`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:RTL_Teletext_homepage.jpg)。

## atlas:template-matching-heatmap · 模板匹配相似度热图

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 将指定图像小块在整图上逐位置滑动并比较像素相似度，再把得分映成热图；红色热点表示更高匹配分。
**必要输入与条件：** 选择独特模板并设相似度算法；观察重复纹理中是否出现多个竞争热点。
**区别与边界：** 模板尺度或旋转变化会降低匹配，重复图案会造成误报；热图分数不等同语义对象检测。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/template-matching-heatmap)；固定详情快照 `effects/template-matching-heatmap.json`，SHA-256 `1a71ec08323fae3a82973181290a8affe9ed8a2798386c5e507fb870dfbcbb3e`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Autumn_carpathians_(Unsplash).jpg)。

## atlas:temporal-echo · 时间回声拖影

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 把多个时间点的画面按权重叠加成错位半透明轮廓，较早影像逐步淡出，形成运动轨迹感。
**必要输入与条件：** 需要视频帧历史、回看间隔、叠加数量和衰减权重；按动作方向安排回声。
**区别与边界：** 本条标注为示意而非神经推理；静态画面不能替代实际时间采样，回声过密会遮住主体。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/temporal-echo)；固定详情快照 `effects/temporal-echo.json`，SHA-256 `2db0c543574f6be56cc1906e71148a4c240321e540e0dc206158a4780c3cefe4`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:text-to-image-generation · 文字条件图像生成

**视觉家族：** AI 图像生成与模型流程（`atlas-family:ai-image-workflow`）。
**可见效果与关键机制：** 生成模型依据文字条件和学得的视觉模式合成新图，画面并非从显式三维几何搭建；细节可能出现手指或文字结构错误。
**必要输入与条件：** 需要具体模型、提示词和可控的采样设置；生成后检查手、文字、重复图案及其与提示的对应。
**区别与边界：** 输出是模型生成的候选图，不是文字所述对象的真实记录；模型架构和错误类型各异，不能将单一噪声去除流程概括所有生成法。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/text-to-image-generation)；固定详情快照 `effects/text-to-image-generation.json`，SHA-256 `28989d14c75a6878fe100712b9ffe3c136b97129700693bc403055830e1e11bb`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Th%C3%A9%C3%A2tre_D%E2%80%99op%C3%A9ra_Spatial.png)。

## atlas:texture-mapping · 三维表面纹理映射

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 用UV或表面坐标把二维图样采样到三维模型表面，使纹理随曲面和视角贴合；可控制颜色或其他材质参数。
**必要输入与条件：** 需要三维网格、UV坐标和纹理图；在球体、立方体或复杂曲面上检查接缝与拉伸。
**区别与边界：** 颜色纹理不会自动改变轮廓或真实起伏；UV展开不均会使图样拉伸，材质映射参数也可能不只是颜色。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/texture-mapping)；固定详情快照 `effects/texture-mapping.json`，SHA-256 `9297b1422adac9b571c159c91097107047b6e5c03e378104d69270972cbd4a55`。
**Atlas 所列参考：** [原始参考页面](https://www.jimblinn.com/publications/)。

## atlas:thaumatrope · 幻盘转盘玩具

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 旋转圆盘两面各有一幅静止图，快速翻转时两图在视觉上合成一个画面，例如鸟与空笼合为鸟在笼中。它展示的是两幅图的融合，不是连续动作。
**必要输入与条件：** 需准备彼此补全关系的正反两幅图，并按绕水平轴翻转的方向调整图像朝向；可用旋转动画表现合成过程。
**区别与边界：** 它只合并两幅静态图，不能替代由连续帧形成的走马盘运动幻觉；单帧展示难以说明合成效果。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/thaumatrope)；固定详情快照 `effects/thaumatrope.json`，SHA-256 `3eed691ea964e0bf4861b4d898497158a16f452be970f13d00f95accce7ceb73`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Humble_beginnings,_pt._1_(2150574179)_(2).jpg)。

## atlas:thermal-false-color-look · 热成像伪彩效果

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 把画面明暗映射到彩虹或冷暖分区后，形成类似温度分布的色带。色彩来自亮度到调色板的替换，视觉上像热区但仍是图像滤镜。
**必要输入与条件：** 需要清晰的明暗层次和明确的伪彩色表；可并列显示原图与不同色板，以说明映射选择会改变观感。
**区别与边界：** 普通照片上的伪彩滤镜没有测量温度，也没有探测热辐射；颜色及其温度含义必须由真实测量和图例共同定义。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/thermal-false-color-look)；固定详情快照 `effects/thermal-false-color-look.json`，SHA-256 `770f03b1df83e5c081b0c82b43860a437dea39123061421f06fbf5a976a4c504`。

## atlas:thin-plate-spline-warp · 薄板样条变形

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 图像地标被控制点牵引产生平滑弯曲，变形会从控制点向周围扩散，区域交界仍连续。算法拟合控制点对应的坐标映射，并以弯曲能量约束整体形变。
**必要输入与条件：** 需要成对的源点与目标点来定义映射，并对变形后的网格重采样；适合展示局部调整如何带动周边形状。
**区别与边界：** 控制点放置决定影响范围，点位过密或偏移过大可能扭曲轮廓；平滑连续不代表几何关系保持真实。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/thin-plate-spline-warp)；固定详情快照 `effects/thin-plate-spline-warp.json`，SHA-256 `9a4c4d5f50c0556b90d5ebc8267596ac9bac8d68446f944fc70d1c24c6ece2d8`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Asheville_crops.jpeg)。

## atlas:three-strip-technicolor · 三色条特艺彩色

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 经典彩色摄影制作流程以三条黑白胶片分别记录颜色分量，再在拷贝阶段合成为浓烈而受控的彩色画面；服装、布景和拍摄条件也需配合。
**必要输入与条件：** 若要说明历史工艺，应呈现分色记录与合成拷贝的过程；创作模拟需准备可分离的颜色信息和受控的造型、布景。
**区别与边界：** 它是一套拍摄与拷贝流程，不是单个色彩滤镜；片尾写有 Technicolor 不足以证明作品使用三色条摄影。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/three-strip-technicolor)；固定详情快照 `effects/three-strip-technicolor.json`，SHA-256 `591cbafacc3f7babedde2a12e7c6569741d1f32f7d0cb0cd02d046814ad6435b`。
**Atlas 所列参考：** [原始参考页面](https://www.eastman.org/technicolor/technology/three-strip-camera)。

## atlas:threshold · 阈值二值化

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 每个像素按亮度是否越过阈值被硬分为黑或白，中间灰度消失，边缘呈现清晰的明暗分界。改变阈值会让面部和物体细节显隐。
**必要输入与条件：** 需要亮度有可分结构的图像，并选择能保留所需轮廓或特征的阈值；可对比多个阈值看细节怎样变化。
**区别与边界：** 全局阈值不会用黑白点阵模拟中间调；它与抖动不同，灰度细节会被直接舍弃，结果也受光照不均影响。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/threshold)；固定详情快照 `effects/threshold.json`，SHA-256 `efa26a400558e1f2664fa7adda44e384ca6d2c6ac9bd164505e3cfae3a76d955`。
**Atlas 所列参考：** [原始参考页面](https://example.com/effects/threshold)。

## atlas:tilt-shift-miniature-look · 移轴微缩景观效果

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 画面只有一条窄区域清晰，上下周边逐渐模糊，像观看微缩模型。效果以空间变化的锐化与模糊分布模拟浅景深。
**必要输入与条件：** 适合从较高视角拍摄、主体与背景层次清楚的画面；需指定清晰带的位置、宽度和向两侧过渡的模糊。
**区别与边界：** 后期模糊只模拟浅景深感，不会改变真实透视或物体尺寸；清晰带过宽、过窄或穿过不合理区域时，微缩错觉会减弱。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/tilt-shift-miniature-look)；固定详情快照 `effects/tilt-shift-miniature-look.json`，SHA-256 `483bf55281ee9fdeec8c36bc70aa145ecf7a777f8e74a24418830518ca41399c`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:time-displacement · 时间位移

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 同一运动主体的不同画面区域同时呈现动作的不同时间阶段，像一具身体并列多个运动姿态。亮度图为各区域选择不同时间点，因此改变的是取样时刻。
**必要输入与条件：** 需要含有明显运动的视频、时间位移图和可访问的时间帧；中性灰值对应不产生时间偏移。
**区别与边界：** 它沿时间轴错开采样，不同于空间位移扫描；单独一张静态图没有可供挑选的动作阶段。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/time-displacement)；固定详情快照 `effects/time-displacement.json`，SHA-256 `09caa211337c74b2a592b399b3053963c8e269f4bda9e6540e32a73dc4f42c18`。
**Atlas 所列参考：** [原始参考页面](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/time-effects.html)。

## atlas:time-lapse · 延时摄影

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 以较长间隔拍摄的一系列画面被连续播放，使云层、植物或城市变化显著加快。效果来自时间采样和播放序列，不来自单帧处理。
**必要输入与条件：** 需要连续稳定的拍摄序列，并按变化速度设置拍摄间隔；评估时要查看完整序列或视频。
**区别与边界：** 单张静帧无法说明播放速度；相机移动、曝光变化或采样间隔不合适会干扰时间压缩的连贯感。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/time-lapse)；固定详情快照 `effects/time-lapse.json`，SHA-256 `9e1cbb85a9a0c049c594dad5e290c1ea0f4f97b02cd06ab502d3c265bccb66d5`。
**Atlas 所列参考：** [原始参考页面](https://www.nikonusa.com/learn-and-explore/c/tips-and-techniques/top-tips-for-capturing-time-lapse-video-with-a-dslr)。

## atlas:tintype · 锡版摄影（铁版）

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 成像通常偏暗并带金属质感，常见于小幅肖像。弱胶棉负片置于黑漆铁片上观看时呈正像，因此名称里的“锡”并不可靠地表示实际承载材料。
**必要输入与条件：** 要复现历史工艺需呈现黑漆铁片与湿版胶棉成像关系；数字模拟可保留暗色金属底和小幅肖像特征。
**区别与边界：** 单靠加暗、加金属光泽不能证明真实铁版工艺；不要据“锡版”名称把底材说成锡。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/tintype)；固定详情快照 `effects/tintype.json`，SHA-256 `4ce636756c74c6af137afd901af3716f299aa89ceab0a63184a9777aef17d33f`。
**Atlas 所列参考：** [原始参考页面](https://www.loc.gov/collections/liljenquist-civil-war-photographs/articles-and-essays/ambrotypes-and-tintypes/)。

## atlas:total-variation-denoising · 全变分降噪

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 细碎噪点和局部亮度波动被平滑，同时较强边缘相对保留；力度过大时细纹理会消失，柔和渐变可能变成平坦色块。算法在贴近输入与降低局部亮度变化总量之间求平衡。
**必要输入与条件：** 需要带有细碎噪声或纹理的图像，并调整降噪强度对照边缘、纹理与渐变的变化。
**区别与边界：** 去噪增强会损失真实细节，也可能造成阶梯状色调；强边缘保留不代表纹理或颜色细节仍准确。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/total-variation-denoising)；固定详情快照 `effects/total-variation-denoising.json`，SHA-256 `d35ad8ac6e8eb0cd386d882b6fad4366c495fd52b340a761fc17f741031ad805`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Jamie_Dench_2015_(Unsplash).jpg)。

## atlas:traveling-mat · 移动遮罩合成

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 人物等前景主体从背景中分离后，在另一条背景画面上运动。随动作变化的黑白遮罩划出主体区域，反遮罩为背景留出位置，再将主体填入。
**必要输入与条件：** 需要同步的主体素材、替换背景和随主体运动的遮罩；蓝幕或绿幕只是生成遮罩的具体办法之一。
**区别与边界：** 移动遮罩是通用合成方法，蓝幕和绿幕是取遮罩的方法；手工或自动分割仍需处理发丝、透明物和边缘漏底。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/traveling-mat)；固定详情快照 `effects/traveling-mat.json`，SHA-256 `c869b4f903e98987a429309cc27cb8f409db836a98ee6b35943083dfb7a24d78`。
**Atlas 所列参考：** [原始参考页面](https://www.film-foundation.org/king-kong-hfpa)。

## atlas:trimap · 三值前景引导图

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 用黑、白、灰三类区域分别表示背景、前景和不确定边界。将硬遮罩腐蚀、膨胀后留下的边缘带作为未知区，尤其用于指出发丝等难分区域。
**必要输入与条件：** 需要已有主体轮廓或粗遮罩，并明确标注确定前景、确定背景及待细化区域；可把灰区交给抠像算法继续估算。
**区别与边界：** 灰区是未知边界，不是半透明结果；三值图只提供约束，不能单独恢复真实发丝或复杂透明细节。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/trimap)；固定详情快照 `effects/trimap.json`，SHA-256 `fcdd2b26f727d65abb15ff230775bfa83f5211bfc061662d823bea8882c72ead`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:truchet-tiles · 特鲁谢拼砖纹样

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 简单图块在方格中旋转或排列，拼出连续的弧线路径；照片化版本可按局部亮度改变线宽，让底图明暗仍可辨。单纯旋转图块不会改变平均色调。
**必要输入与条件：** 需要规则网格与重复图案单元；小图块更容易保留照片细节，大图块会让曲线路径更醒目，可按需要调线宽承载明暗。
**区别与边界：** 只旋转同一图块无法表达照片明暗；图块过大或线宽变化不足会削弱底图可辨度。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/truchet-tiles)；固定详情快照 `effects/truchet-tiles.json`，SHA-256 `0bc066b7a10bcf994de049f2ce815ec65f827a3e1060e439c1ce1aaae9b31208`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Hands_holding_cocoa_beans.jpg)。

## atlas:tv-static-snow · 电视雪花噪声

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 快速闪烁的黑白灰随机点覆盖画面，像电视失去信号后的雪花。噪声图样随时间更新，强度增加时会逐渐遮住原有图像。
**必要输入与条件：** 需要连续变化的随机灰度噪声层，并控制覆盖强度；保留底图时要让噪声量与主体可读性相平衡。
**区别与边界：** 静态噪点不能表现快速闪烁；噪声太强会完全遮蔽底图，效果本身不表示真实接收故障来源。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/tv-static-snow)；固定详情快照 `effects/tv-static-snow.json`，SHA-256 `7f6b28cc2d4a12e389060ccc8ab62e7fee3e0e292c1fc210a18286bd83099757`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Snowy_mountain_lake_shore_(Unsplash).jpg)。

## atlas:two-color-technicolor · 双色特艺彩色

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 早期双色工艺分别记录红、绿分量，再用红橙与青色染料合成。肤色容易偏暖橙，天空可能偏青绿，真正的蓝色与鲜黄难以呈现。
**必要输入与条件：** 历史复现应说明两色记录和染料合成；视觉模拟需限制色彩范围并突出暖肤色、青绿天空等典型偏色。
**区别与边界：** 工艺没有蓝色记录，不能还原丰富蓝色；它与三色条特艺彩色的三路记录不同，也不同于需旋转色轮观看的运动色彩系统。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/two-color-technicolor)；固定详情快照 `effects/two-color-technicolor.json`，SHA-256 `98c4a66889ddb6c9265149648bc20465c77c1f9a5619e9de3c24f14f363950d6`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:The-Broadway-Melody-Technicolor-Frame.png)。

## atlas:ultraviolet-photography · 紫外线摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 花瓣会显出暗色吸收斑，叶片与熟悉风景也可能呈现迥异于可见光照片的面貌。专用滤镜阻挡可见光、让紫外线通过，由感光材料记录通常不可见的短波信息。
**必要输入与条件：** 需要适配紫外线的滤镜与感光或传感系统，并控制拍摄环境；如实拍需遵循设备和光源安全要求。
**区别与边界：** 结果取决于材料对紫外波段的响应；它与叶片常显亮白的红外摄影不同，不能把紫外图像当作普通可见光外观。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/ultraviolet-photography)；固定详情快照 `effects/ultraviolet-photography.json`，SHA-256 `0ea466958718160b3756d81af3b6a6a53844df9509c615edf35ff9d17271a44c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Third_of_three_panels_showing_UV_reflection_in_the_subfamily_of_tiger_moths_(Arctiinae).jpg)。

## atlas:undercranking · 低速拍摄加速

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 动作播放时显得更快、更有冲劲，因为拍摄时记录帧率低于后期播放帧率。它来自拍摄与播放速度的差值，而不是单纯把成片加速。
**必要输入与条件：** 需要在拍摄或时间映射中明确较低的记录频率，并以较高播放频率呈现；应先确定动作要被压缩到何种节奏。
**区别与边界：** 历史影片看起来快不一定是有意低速拍摄，放映机频率和现代转制也会改变速度；仅凭成片观感不能断定拍摄方法。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/undercranking)；固定详情快照 `effects/undercranking.json`，SHA-256 `f7522cff35eb9aaf8e649957a837707921b6a25caf1f8992760d980c2bb4a4c5`。
**Atlas 所列参考：** [原始参考页面](https://silentfilmmusic.com/undercranking-parallel-exit-1/)。

## atlas:unsharp-mask · 反锐化遮罩

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 边缘显得更清晰，强度过高时会出现明暗光晕。处理从原图生成柔化版本，再利用两者差异增强边缘对比。
**必要输入与条件：** 适合需要提升边缘清晰感的图像；应结合半径、强度和边缘对照逐步调整，并查看高反差轮廓。
**区别与边界：** 它提高边缘反差，不会恢复已经丢失的真实细节；过度处理会让轮廓发硬并产生明显光晕。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/unsharp-mask)；固定详情快照 `effects/unsharp-mask.json`，SHA-256 `697f547ee65cf09d8877949932d69147b9e3e30fae8f566d9f230ec6b1432d09`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:van-dyke-brown-print · 范戴克棕调印相

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 印相呈深棕色和哑光质地，图像仿佛落在纸纤维内部，而不是覆盖在光亮表层。紫外线将铁盐还原后进一步还原硝酸银，形成金属银影像。
**必要输入与条件：** 若要复现工艺需感光纸、含铁感光体系、硝酸银及紫外曝光；动画或数字模拟可展示纸纤维与深棕影像的关系。
**区别与边界：** 它与带蛋白表面结合层的光亮蛋白印相不同；数字棕色滤镜不会生成同样的纸内成像结构。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/van-dyke-brown-print)；固定详情快照 `effects/van-dyke-brown-print.json`，SHA-256 `e9ec091e440e64c77b34f001b11e07dde280d7f1f63b017c699642dff5340abd`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:VanDyke-feather.jpg)。

## atlas:vaporwave-aesthetic · 蒸汽波视觉风格

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 常见组合是粉青或洋红霓虹、低分辨率复古电脑图像、线框网格、古典雕像、日文和录像带故障纹理；柔和粉彩与超现实商业意象并置。
**必要输入与条件：** 需要将复古3D网格、雕像或商业图像、粉彩调色和数字采样故障组织成有意的拼贴关系；每种素材都应服务于同一时代错置感。
**区别与边界：** 它与偏暗霓虹格线和动作电影怀旧的合成波风格有区别；只叠粉青滤镜不足以构成其图像语境。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/vaporwave-aesthetic)；固定详情快照 `effects/vaporwave-aesthetic.json`，SHA-256 `9e5b3565b45bb92331ef41af8047cfc9f8ab6d8b5fca90d7094335445e1c2c48`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Wikiwave_00000.png)。

## atlas:vector-display-graphics · 矢量显示器图形

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 黑底上以连续发光线条勾勒几何形状，线条平滑而非由方形像素逐行组成，交叉位置的磷光更亮。传统矢量显示器以电子束直接逐点描线。
**必要输入与条件：** 需要黑色显示底、连续路径描绘和交点辉光；若模拟历史设备，应限制线条数量并体现逐线扫描的显示感。
**区别与边界：** 它不等同于现代任意分辨率矢量文件；传统显示器一次可描绘的线数有限，过多线条会闪烁，不能高效填充大面积背景。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/vector-display-graphics)；固定详情快照 `effects/vector-display-graphics.json`，SHA-256 `564ef9da3ece61453ecb381222d5e325cc9b3f4b3b8d3ca702704f16232bda20`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Vectrex_Spike_Controller.jpg)。

## atlas:vhs-tape-artifacts · VHS磁带伪影

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 画面出现抖动、色彩拖边、信号缺失和水平跟踪干扰，来源于磁带记录与播放机构对视频信号的影响。
**必要输入与条件：** 若模拟故障链，应分别控制磁带抖动、色彩串扰、掉磁和跟踪干扰，并让主体在故障中仍可辨。
**区别与边界：** VHS是记录与播放介质；NTSC是视频制式，CRT扫描线是显示特征，三者属于图像链的不同环节。单加扫描线不能代替磁带伪影。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/vhs-tape-artifacts)；固定详情快照 `effects/vhs-tape-artifacts.json`，SHA-256 `b4ad710ab5d5076bf4b37674acfa77024e40c68936c663450023a85339ae9523`。

## atlas:vhs-tracking-noise · VHS跟踪噪声

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 局部水平线错位、彩色边缘和信号缺口模拟录像机磁带跟踪不稳；干扰集中在特定扫描带，而非整幅统一叠加颗粒。
**必要输入与条件：** 需要区分干扰区域，并分别调节行偏移、噪声与色彩通道错位；移动或变化的故障带可说明播放跟踪问题。
**区别与边界：** 仅有随机颗粒并不能说明跟踪失准；它是VHS伪影中的一种，需与普遍的NTSC色彩编码或CRT扫描线区分。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/vhs-tracking-noise)；固定详情快照 `effects/vhs-tracking-noise.json`，SHA-256 `7d0454520eb895e78a4f24c9f1b5aa7bff2be0331250c0c5c3066ddf9807c3ff`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:video-feedback · 视频反馈

**视觉家族：** 视频信号与数字故障（`atlas-family:video-signal`）。
**可见效果与关键机制：** 画面形成发光隧道或螺旋，图像似乎不断向深处复制。摄像机拍摄正在显示自身实时画面的屏幕，镜头缩放、角度与亮度会改变递归图案。
**必要输入与条件：** 需要实时闭合的摄像机—显示屏影像回路，并通过机位角度、缩放和亮度控制图样；可先用屏幕与摄像机实测再模拟。
**区别与边界：** 闭合的实时画面回路本身不一定形成递归隧道；若镜头没有拍到正在显示自身画面的屏幕，就缺少这一图案的来源。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/video-feedback)；固定详情快照 `effects/video-feedback.json`，SHA-256 `246b74942dd1a38942034c21f41ee87d7562fc15b83e8e58e05e3f99005353b8`。
**Atlas 所列参考：** [原始参考页面](https://vdb.vdb.org/titles/illuminatin-sweeney)。

## atlas:volumetric-light · 体积光

**视觉家族：** 光照与表面材质（`atlas-family:lighting-material`）。
**可见效果与关键机制：** 尘埃、烟雾或薄雾中出现可见光束，光线沿空气体积散射而显形。三维算法计算悬浮微粒中的散射与受光区域。
**必要输入与条件：** 需要有可见体积的雾、烟或尘埃介质，以及穿过环境的方向性光源；三维模拟需让光束与空间遮挡关系一致。
**区别与边界：** 没有介质时光束难以显形；体积光模拟空气中的散射，镜头光晕则模拟镜头内部反射，两者来源不同。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/volumetric-light)；固定详情快照 `effects/volumetric-light.json`，SHA-256 `72934b277f5f9eb382336bb7ee327928f5ca441c8f72af8c288b45b64d93c21b`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Shaft_of_light_at_natural_entrance._(8a25cd96-de5c-4e5d-ac1b-be268f59b891).jpg)。

## atlas:voronoi-mosaic · 沃罗诺伊多边形马赛克

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 图像细节被不规则多边形色块替代；每个像素按距离分配到最近的随机种子点，形成邻近像素共享的分区。
**必要输入与条件：** 需要选择种子点数量与分布，并把分区结果映射回图像色彩；单元大小应配合主体轮廓和可读细节。
**区别与边界：** 种子太少会吞掉小轮廓，太多则恢复成细碎图像；分区只是按距离归属，不会自动识别物体边界。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/voronoi-mosaic)；固定详情快照 `effects/voronoi-mosaic.json`，SHA-256 `72af8fd28e5545012ae5d63ae7e38b3c9b57e04685d103766757c6e88d723496`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:vortograph · 涡形镜摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 三面镜子组成三角镜筒，将同一主体的多个反射视图送入镜头，在单次曝光中形成重叠三角面、明暗片段和抽象几何。图样在光学拍摄时生成。
**必要输入与条件：** 需要把三面镜片的反光面朝内排列成三角通道，并让有纹理的主体接受侧光；适合以单次曝光演示多重反射路径。
**区别与边界：** 它不等于多重曝光，也不是折射棱镜；图像靠镜面反射形成，重复反射过强时主体可能完全不可辨。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/vortograph)；固定详情快照 `effects/vortograph.json`，SHA-256 `bd9f3f53ab6275c09ee857448b3faae84682fa03d3a19415f9544081fd4b74ac`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Vorticism)。

## atlas:voxel-graphics · 体素图形

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 三维景观由一颗颗有颜色的立方体体素构成，曲面呈阶梯状、厚实起伏；体素是具有体积的三维数据点，渲染器再将其投影到屏幕。
**必要输入与条件：** 需要带颜色的三维体积网格和体素渲染方式；可通过地形或物体的阶梯曲面展示体积像素与平面图块的差异。
**区别与边界：** 体素表示占据的空间体积，多边形主要描述表面；体素分辨率过低会出现粗大阶梯，过高则增加计算与数据负担。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/voxel-graphics)；固定详情快照 `effects/voxel-graphics.json`，SHA-256 `a8d3154c6c16575b107a4ecccd754078f515b766326d80ce9d95c1190b9de7a1`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Voxels.svg)。

## atlas:watercolor-wash · 水彩晕染效果

**视觉家族：** 插画媒材与笔触（`atlas-family:illustration-material`）。
**可见效果与关键机制：** 照片被简化成柔和色彩水洗，细节减弱、边缘颜色加深，表面带轻微斑驳。常见数字做法用保边平滑简化细节，再以程序噪声模拟颜料覆盖不均。
**必要输入与条件：** 适合边界明确、面部和主体仍需辨认的图像；需控制平滑强度和纸面纹理，让天空等大色面出现轻微不均。
**区别与边界：** 这是数字化风格模拟，并非真实颜料流动；过强平滑会抹掉面部信息，过强纹理会让颜色显脏。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/watercolor-wash)；固定详情快照 `effects/watercolor-wash.json`，SHA-256 `b9ac796378cc24e3aeef234b6075bbc542588dd8039a11bccee170ae57d0b31f`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Lecture_Room_Stairs_(Unsplash).jpg)。

## atlas:watershed-regions · 分水岭区域分割

**视觉家族：** 遮罩、抠像与分割（`atlas-family:masks-segmentation`）。
**可见效果与关键机制：** 图像亮度梯度被想象成地形，区域边界如同分水线，将相邻盆地分开。通过标记点指定区域后，算法沿梯度结构扩展分区。
**必要输入与条件：** 需要图像梯度和用于引导分区的标记点；可调整标记数量与预平滑程度，观察边界是否落在目标轮廓上。
**区别与边界：** 标记过少会合并不同对象，过多或噪声较强时会过分割；结果是依赖输入梯度和标记的区域划分，不是语义识别。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/watershed-regions)；固定详情快照 `effects/watershed-regions.json`，SHA-256 `a97e092f8eb4ccf967c5d5496a9b8f31968cbdd7045cac6b1ff346dc3421ccd9`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:wave-displacement · 波形位移

**视觉家族：** 纹理变形与坐标扭曲（`atlas-family:texture-distortion`）。
**可见效果与关键机制：** 原本平直的轮廓弯成水波状，因为图像坐标按周期在水平和垂直方向偏移；波长决定重复起伏的间距。
**必要输入与条件：** 需要输入图像和周期性坐标偏移，可分别调节水平与垂直波长，选择要弯曲的区域。
**区别与边界：** 位移过强会压扁或撕裂细节；周期形变只制造规律波纹，不代表物体真实受力或液体运动。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/wave-displacement)；固定详情快照 `effects/wave-displacement.json`，SHA-256 `873475657f2f91b65324bfb7ddefe1590093f4497640d910683357f87b59c63e`。
**Atlas 所列参考：** [原始参考页面](https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html)。

## atlas:wet-plate-collodion · 湿版火棉胶摄影

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 玻璃负片可能保留手工涂布边缘。感光火棉胶层必须在仍湿润时完成曝光和显影，因此拍摄节奏受湿版流程限制。
**必要输入与条件：** 真实工艺需要玻璃板、火棉胶感光层，并在湿润状态下曝光和显影；影像说明应区分负片与由负片制作的蛋白印相。
**区别与边界：** 不规则边缘可能是操作痕迹，却不是每张湿版照片都必有的外观；数字划痕无法重建湿版工艺。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/wet-plate-collodion)；固定详情快照 `effects/wet-plate-collodion.json`，SHA-256 `1466255e8cdd68423d7aa8a44d4c7a312e68f3cfd77a88186a900709fad19fef`。
**Atlas 所列参考：** [原始参考页面](https://www.vam.ac.uk/articles/photographic-processes)。

## atlas:whip-pan · 甩镜摇摄

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 镜头快速水平转动时，画面短暂化成横向运动模糊。它可以是连续镜头内的快速摇摄，也可以把两个镜头接在模糊段两侧。
**必要输入与条件：** 需要明确的摇摄方向、速度和前后主体；若要藏剪辑点，应让两侧运动方向和模糊节奏相接。
**区别与边界：** 画面模糊本身不能证明中间有隐藏剪辑；速度和方向不匹配时，甩镜会显得像无目的的抖动。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/whip-pan)；固定详情快照 `effects/whip-pan.json`，SHA-256 `632a7a6f12b897efaf212bc997f1c9f3d0baf8191af999fb6db58bdcade458dd`。
**Atlas 所列参考：** [原始参考页面](https://filmglossary.ccnmtl.columbia.edu/term/swish-pan/)。

## atlas:white-balance-shift · 白平衡偏移

**视觉家族：** 色彩与光色关系（`atlas-family:color-light`）。
**可见效果与关键机制：** 整体画面向暖琥珀或冷蓝偏色。算法相对绿色通道缩放红、蓝通道，以补偿不同光源的色温，也可用来改变照片的冷暖观感。
**必要输入与条件：** 需要观察画面中应呈中性的参照物，并明确是校正光源色偏还是有意做冷暖风格变化。
**区别与边界：** 不经校准的暖蓝偏色不等于真实色温；仅调白平衡无法修复混合光源下不同区域的独立色偏。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/white-balance-shift)；固定详情快照 `effects/white-balance-shift.json`，SHA-256 `6264e301606597b3522b74198543fb7f03f9ff2b01f933ae612a637be16dde3c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:People_walking_across_urban_street_(Unsplash).jpg)。

## atlas:wiener-deblurring · 维纳去模糊

**视觉家族：** 数字图像处理（`atlas-family:digital-image-processing`）。
**可见效果与关键机制：** 模糊图像被估算成较清晰版本，可能伴有细颗粒。滤波器在反推已知模糊与放大数字噪声之间权衡，以降低整体统计误差。
**必要输入与条件：** 需要模糊核或模糊过程的估计，以及对噪声水平的估计；应对照锐度恢复与噪声颗粒调整参数。
**区别与边界：** 去模糊只能估算被模糊抹去的信息，不能保证恢复真实细节；模糊模型不准或噪声估计不当会带来颗粒和伪影。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/wiener-deblurring)；固定详情快照 `effects/wiener-deblurring.json`，SHA-256 `ddc15ccbe8093cd58e68e37c8dfbc1d6839454d91fb3a4e77653c2611da9671f`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Fluffy_Dandelion_Seeds_(Unsplash).jpg)。

## atlas:williams-process · 威廉姆斯移动遮罩工艺

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 活动人物保留清晰轮廓地出现在单独拍摄的环境中，接缝处偶有暗边或亮边。黑色背景提供亮度反差，经高反差复制制成互补移动遮罩，在印片时分别留出主体和背景区域。
**必要输入与条件：** 需要黑底拍摄的前景、单独拍摄的背景及随人物动作变化的互补遮罩；前景轮廓必须逐帧跟随动作。
**区别与边界：** 不同于简单双重曝光，它为前景预留区域；它依赖亮度反差而非蓝幕色差。动作改变形状时，固定遮罩会遮住人物或露出多余背景。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/williams-process)；固定详情快照 `effects/williams-process.json`，SHA-256 `ee607de4019db0026f96afa5a5a0d64f286bfdd156c9bb7778f2d3958e03203f`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/Matte_(filmmaking))。

## atlas:wipe · 划像转场

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 一条移动边界逐步带入下一幅画面，把当前画面空间替换掉。移动的遮罩边缘本身构成转场特征。
**必要输入与条件：** 需要两幅画面和移动遮罩，并控制边界方向、速度及起止位置；可借经过镜头的人物等物体形成自然遮挡。
**区别与边界：** 移动边缘是效果本身，不是额外装饰线；它比硬切更显眼。划像是空间边界移动，溶解则是全画面透明度逐渐交替。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/wipe)；固定详情快照 `effects/wipe.json`，SHA-256 `bb6f096d324bd3bc1414a03d2808b0dbaf62d8d7ab8474a30f3bbaf0001de77b`。
**Atlas 所列参考：** [原始参考页面](https://filmglossary.ccnmtl.columbia.edu/term/wipe/)。

## atlas:wire-removal · 威亚与支撑物擦除

**视觉家族：** 图层合成与转场（`atlas-family:compositing`）。
**可见效果与关键机制：** 人物或物体看似悬空，原先承托它的威亚等支撑物被遮罩并由合适背景补回。可靠修复还要重建支撑物遮挡的画面区域。
**必要输入与条件：** 需按时间追踪威亚、阴影和被遮挡区域，准备干净背景或逐帧补绘；摄像机、威亚与背景运动时，修补也必须同步。
**区别与边界：** 只去掉线条会留下断裂的运动模糊、阴影、反射和空洞；一帧修净不代表整段镜头稳定。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/wire-removal)；固定详情快照 `effects/wire-removal.json`，SHA-256 `db1c5d56ca082d65de97d316a9497419b8ac1126ea9b434898013ed4b6a33f0d`。
**Atlas 所列参考：** [原始参考页面](https://learn.foundry.com/nuke/content/reference_guide/draw_nodes/rotopaint.html)。

## atlas:wireframe-cgi · 线框三维图形

**视觉家族：** 深度、投影与空间视图（`atlas-family:depth-space`）。
**可见效果与关键机制：** 黑底上的发光边线勾勒透明技术物体，表面不填色但空间结构可见。计算机把三维模型边缘从虚拟摄影机视角投影到屏幕。
**必要输入与条件：** 真实CG线框投影需三维模型与虚拟摄影机；讲解空间结构也可手绘投影线框或旋转立方体，并明确是示意图，不冒称模型渲染结果。若要比较实体面与线框，应使用同一模型与视角。
**区别与边界：** 二维霓虹网格虽像线框，却不证明存在三维几何；线条过多或交叠会难以辨形，不能把经典案例称作三维图形的发明。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/wireframe-cgi)；固定详情快照 `effects/wireframe-cgi.json`，SHA-256 `7da73c15e28962a755be5ac1780ee7c794bc2ca2e1326672be747adf5fd85301`。
**Atlas 所列参考：** [原始参考页面](https://www.computerhistory.org/timeline/1977/)。

## atlas:wireframe-overlay · 线框网格叠加

**视觉家族：** 几何结构与生成图案（`atlas-family:geometric-pattern`）。
**可见效果与关键机制：** 图像表面覆盖由三角剖分生成的网状几何线，线条构成设计叠层，控制点移动时网格形状随之改变。
**必要输入与条件：** 需要二维图像、控制点及由点构成的三角连接关系；通过移动控制点调整网格密度或形状。
**区别与边界：** 表面网格叠层不等于真实三维模型线框；网格太密会遮住底图，过疏则难以形成连续结构。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/wireframe-overlay)；固定详情快照 `effects/wireframe-overlay.json`，SHA-256 `5d845e04bac4859d29cb3b2e585c9f89af56d0d67f838a4910c96c840b25baa8`。
**Atlas 所列参考：** [原始参考页面](https://github.com/lllyasviel/ControlNet/blob/main/docs/annotator.md)。

## atlas:woodburytype · 伍德伯里胶印

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 照片保留连续色调而没有网点，暗部略有凸起。不同厚度的含颜料明胶压印到纸面，暗部留下较厚颜料，产生轻微浮雕感。
**必要输入与条件：** 工艺复现需要金属模具、不同厚度的含颜料明胶及压印纸张；侧光可帮助观察暗部对应的微小起伏。
**区别与边界：** 它靠颜料厚薄产生连续色调，不像半色调以网点模拟灰阶；数字去网点或加浮雕不能证明采用了该印制工艺。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/woodburytype)；固定详情快照 `effects/woodburytype.json`，SHA-256 `67f1b6c50d9ee37527d79c2970093e76d13409c2dd2ad44767153de33157b917`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Aanplakkers_van_reclamebiljetten_in_Londen_Street_Advertising_(titel_op_object),_RP-F-F25486-B.jpg)。

## atlas:woodcut-print · 木刻版画效果

**视觉家族：** 插画媒材与笔触（`atlas-family:illustration-material`）。
**可见效果与关键机制：** 画面化为粗黑形状与留白刀痕，形成强烈、仿佛雕刻的图像。常见数字做法将阈值化与边缘检测结合，压缩色调同时保留主要轮廓。
**必要输入与条件：** 需要明暗对比和易识别的主体轮廓；可调整对比度与阈值，观察暗部形状合并和细节消失的位置。
**区别与边界：** 数字处理只模拟木刻外观，不会产生真实刻版和油墨转印；对比过高会吞没细节或让人物面部难以辨认。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/woodcut-print)；固定详情快照 `effects/woodcut-print.json`，SHA-256 `8fd455a1975406833f7783ea75cd6517c9495ee85b3b6d24cc38a61ee148067c`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:A_village_church_in_winter_(Unsplash).jpg)。

## atlas:wordart · 艺术字效果

**视觉家族：** 界面、字符与平面图形（`atlas-family:typographic-graphics`）。
**可见效果与关键机制：** 大字被弯曲或拉伸，常叠加彩虹渐变、粗描边、阴影、高光和模拟挤出，让平面字看起来有立体感。软件实际变换字形轮廓并组合填色与装饰。
**必要输入与条件：** 先选定要表达的词与字形，再分别加入曲线、渐变、描边或挤出效果；逐项开关处理，确认层级仍可读。
**区别与边界：** 艺术字是一组对字形的处理，不是一款字体；模拟挤出只是图像效果，不能当作实体厚度或真实三维物体。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/wordart)；固定详情快照 `effects/wordart.json`，SHA-256 `b5bc3e64af6ada510c067f4f3616d580fd60051842373fbdb7330313eed0f2aa`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Ambigram_The_art.png)。

## atlas:x-ray-radiograph · X射线影像

**视觉家族：** 传感器与成像信号（`atlas-family:sensor-signal`）。
**可见效果与关键机制：** 骨骼等较致密结构呈亮白，软组织则形成较暗的透射阴影。X射线穿过物体时被不同密度吸收，未被吸收的射线使成像介质曝光。
**必要输入与条件：** 真实影像需由适当设备记录透射射线；若只是视觉模拟，应明确它表现的是内部密度投影，并使用真实影像作为依据。
**区别与边界：** 与记录表面可见光的普通照片不同，影像不显示表面颜色和纹理；后期做出的幽灵效果不会揭示真实内部结构，也不能代替诊断影像。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/x-ray-radiograph)；固定详情快照 `effects/x-ray-radiograph.json`，SHA-256 `4ccb2d214db9d281c4b6928c0bd4b1484689107d5eee727740e2cdbb226d502f`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:First_medical_X-ray_by_Wilhelm_R%C3%B6ntgen_of_his_wife_Anna_Bertha_Ludwig%27s_hand_-_18951222.jpg)。

## atlas:xerographic-animation · 静电复印动画

**视觉家族：** 动画与手绘插画（`atlas-family:animation-illustration`）。
**可见效果与关键机制：** 动画保留略显粗糙的黑色手绘轮廓和偶尔的铅笔痕，色块则可保持平涂。静电曝光把画线转成墨粉图像，再转印固定到透明赛璐珞片，省去逐帧手工描线。
**必要输入与条件：** 复现静电复印转印需原始线稿经静电复印转到赛璐珞片，并另行绘制色块；数字画面可模拟粉末线条、粗细变化和纸笔痕迹，标明是风格模拟，不称作真实复印工艺。
**区别与边界：** 它转印原画线条，不等于描摹实拍动作的转描；颜色需另行填绘，粗粝线条也不是统一添加的数字噪点。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/xerographic-animation)；固定详情快照 `effects/xerographic-animation.json`，SHA-256 `ce9f33d4da0176e9291226f1d9c1236062f0c8fab4493aa1400702cf8f50e458`。
**Atlas 所列参考：** [原始参考页面](https://en.wikipedia.org/wiki/One_Hundred_and_One_Dalmatians)。

## atlas:zoetrope · 走马盘

**视觉家族：** 动作、运动与时间处理（`atlas-family:motion-time`）。
**可见效果与关键机制：** 带连续姿势的画带装入旋转圆筒，从狭缝中看时，人物或动物仿佛重复运动。狭缝让观看者短暂看到相邻画格，减少连续转动造成的视觉拖影。
**必要输入与条件：** 需要按动作顺序排列的循环画格、带狭缝的转筒和稳定旋转；可比较透过狭缝与直接看筒外时图像清晰度的差异。
**区别与边界：** 狭缝之外直接观看时，画格会横向掠过而难以读清；它使用圆筒，不像通常借镜面观看的活动视盘。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/zoetrope)；固定详情快照 `effects/zoetrope.json`，SHA-256 `d3a006416a70b114f0496bded4e64ddfbf62becdaf06b16163fd9f657feaf844`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Zoetrope_NN.jpg)。

## atlas:zone-system · 区域曝光系统

**视觉家族：** 摄影与传统影像工艺（`atlas-family:photographic-process`）。
**可见效果与关键机制：** 黑白照片的深黑、亮白与灰阶被有计划地分配，重要阴影和高光尽量保留纹理。该系统将测得的场景亮度映射到从黑到白的十一区域，并协调曝光、底片显影与印相。
**必要输入与条件：** 需要测量场景亮度并预先决定重要阴影和高光的区域位置；底片曝光主要决定阴影记录，显影可调整对比，最终印相完成灰阶呈现。
**区别与边界：** 仅凭强烈反差或黑白质感不能证明使用了区域曝光系统；曝光不足造成的阴影信息缺失，不能靠增加显影恢复。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/zone-system)；固定详情快照 `effects/zone-system.json`，SHA-256 `01fd6a325168ba5b5216f3d91e6aba6959595a304263c4cc7604093d3967e53d`。
**Atlas 所列参考：** [原始参考页面](https://commons.wikimedia.org/wiki/File:Ansel_Adams_-_National_Archives_79-AA-G01.jpg)。

## atlas:zoom-blur · 变焦爆炸模糊

**视觉家族：** 镜头与光学成像（`atlas-family:lens-optics`）。
**可见效果与关键机制：** 主体周围出现向外放射的拖痕，线条从共同中心展开。真实效果是在曝光过程中改变焦距，让影像尺度连续变化；数字滤镜只能模拟这段变焦轨迹。
**必要输入与条件：** 真实拍摄需在曝光期间变焦并选取有可读中心主体的画面；数字制作应以主体为中心生成径向拖痕。
**区别与边界：** 数字变焦模糊不等于镜头内真实变焦；它与滑动变焦不同，后者结合摄影机移动和焦距变化，造成另一种空间感。
**本地实现状态：** 仅有经来源整理的知识条目；本仓库没有该项专属运行代码或已授权素材。采用时须由实际拍摄、既有工具或已接通的本地消费者实现，不把目录命中视为已渲染。
**来源与核验：** [Atlas 条目](https://atlas.letz.ai/effect/zoom-blur)；固定详情快照 `effects/zoom-blur.json`，SHA-256 `a98782fcfd2f2b0714e2bce2c5fafeb1e0a6ee8e3fc280b9b99d928ac30bff33`。
**Atlas 所列参考：** [原始参考页面](https://helpx.adobe.com/uk/premiere-elements/desktop/special-effects-basics/effects-reference.html)。
