# 动画资源浏览器

这是面向人的独立浏览页，依赖 Motion Skill 中的统一 L0 目录。它不参与普通生产输入，不产生可代替生产正文的设计提示。制作中只把选中的稳定资源 ID 交给 Motion；Motion 再通过正式入口读取该 ID 的完整中文生产 Markdown，并按来源状态选择可用的 MIT 运行模块。

## 打开

先运行资源维护方提供的目录构建与校验命令，再从仓库根目录启动本地只读服务：

```sh
node .agents/skills/laohu-motion/templates/styles/gallery/serve-gallery.mjs
```

终端会输出当前真实页面地址；服务默认只绑定本机 `127.0.0.1`，也可用 `--port 0` 请求系统分配空闲端口。页面启动时通过 `laohu-styles.py resource-overview --scope all` 读取统一目录，并核验 75 项视觉描述、504 项 Atlas 目录、240 项 Motion Prompt 与 20 项表达参考的覆盖数。目录未完成或源哈希失配时，服务会明确返回待处理状态，不退回旧 75 项索引。

## 浏览边界

- 75 项展示正式目录和长相证据字段，可展开查看各维度摘要，并可直接选中对应资源 ID。
- Atlas 家族卡片负责浏览导航；展开或搜索成员后，可选中具体 `atlas:<slug>`，再读取该成员的 L2 正文。成员是知识目录，没有在资源索引标成可执行的运行时预览，不显示虚构样片。
- 240 项 Motion Prompt 使用随仓库提供、已标 MIT 的 Canvas runtime。单次播放一个动作；依赖图片的包先等待模块 `ready`。画廊按需从 runtime 加载所选项，不复制或改写运行模块。
- 20 项 Overlay 内容仅展示授权可用的表达能力摘要；不会加载或复制受限 TSX。
- 搜索、来源/类别/可用状态筛选、分页和“选中 ID”都在页面内执行。有对应生产 Markdown 的视觉描述、Atlas 成员、Motion Prompt 与 Overlay 资源可从卡片选中；Atlas 家族 ID 仅作导航。稳定资源 ID 可复制给制作流程继续读对应中文正文。

## 更新

Gallery 页面直接消费 `resource-overview` 返回的 L0 JSON，不维护第二份资源库。新增或更新源资源后，重建统一 `catalog.json`，停止旧服务并重新启动页面，以读取新的清单和哈希状态。
