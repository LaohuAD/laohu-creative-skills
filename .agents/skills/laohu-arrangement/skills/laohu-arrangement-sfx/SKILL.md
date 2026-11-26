---
name: laohu-arrangement-sfx
description: 当视听声音蓝图已决定某个事件需要 SFX，且需要选择、替换或重新选段时调用；从动作与材料检索真实本地或外部文件，核实来源与许可，可按需剪辑源 WAV 后交回唯一现有音频计划。
---

# Arrangement SFX 选材与源剪辑

本模块承接**已确定画面事件**的音效材质设计、合规选材、许可核验、审核登记及必要源 WAV 剪辑，不决定全片音乐/旁白/静音架构，也不另建时间线或第二份终混。由父级配合 [视听声音设计与源音频处理](../../references/sound-editing-and-mixing.md) 及 Motion 原生真源 [showreel-sound.md](../../../laohu-motion/references/showreel-sound.md) 执行；Motion 已授权的整片声音职责直接调用本模块，不重复请示用户授权。

> **设计方案模式 vs 本地工程执行模式**：若本轮仅交付声音设计方案、禁止下载或落盘，只输出**第一部分（物理材质、分频解耦、受力相位对齐、外科源剪辑思路、可直接使用的中英文曲库检索关键词及商用授权/实听红线）**，严禁把下方仓库脚本命令行与内部 JSON 字段塞进面向通用后期团队的方案；仅当实际在工作区内检索、下载、注册或剪辑真实音频文件时，才执行第二至第四部分的本地工具链。

---

## 一、触发、输入与动作材质判断

- **触发**：蓝图已明确某个视觉事件/相位需要音效，或已有音效需替换、裁段重选。仅 BGM、保留锁定音轨、静音或尚未决定加声均不触发。
- **输入**：视觉事件与画面受力相位（起势预备、速度峰、接触、揭示、状态结果）、成片时间坐标、动作/接触材质/重量/力度/可用时长、需避让的旁白窗口及锁定轨列表（工作区执行时另带稳定 `eventId`、`WORK_ROOT`）。
- **SFX 动作选材与防疲劳准则**：
  - 按真实接触材质、物体体量、起音速度、主体共振与尾音衰减挑素材，绝不靠文件名、波形峰值或下载量猜听感；
  - 多层复合分频解耦、体量匹配、极性校验、过零点精裁（去双响回弹 / 去倒放爆破头）及三本独立时间账，统一沿用父级 [视听声音设计与源音频处理](../../references/sound-editing-and-mixing.md) 第一部分，本模块不另起冲突参数；
  - 连续密集小动作严防机枪式连发——保留主结构重音，其余留空、错开、交替不同素材或合并为连贯扫动声；前置加速滑扫仅在画面确有临撞加速冲刺时启用。

---

## 二、两步选源工作流：先查本地索引，再查外部合规成品

### 1. 第一顺位：本地音频索引（Motion `sfx-sources.py`）
先按声音职责查 `candidateGroups` 缩小范围，再对单个精确 `assetId` 运行 `local-search` 核验真实文件、SHA-256、许可与审核范围（候选组命中或序号不代表适配或已试听）：

```sh
SFX_COMPAT_TOOL="$SKILL_DIR/../laohu-motion/scripts/sfx-sources.py"

python3 "$SFX_COMPAT_TOOL" local-groups \
  --duty short-contact-impact --action landing --material wood --intensity light \
  --max-source-duration-sec 0.5 --work-root "$WORK_ROOT"

python3 "$SFX_COMPAT_TOOL" local-search \
  --asset-id '<候选组返回的精确 assetId>' \
  --review-scope '<当前画面动作与旁白语境>' --work-root "$WORK_ROOT"
```

- **筛选与证据边界**：`--action` 与 `--material` 只接受完整已知标签或正向别名（不解析否定词或复合短语，自然语言用 `--query`）；`source-register` 新入库且角色匹配 `eligibleRoles` 的条目在缺细分标签时返回 `unconfirmed`，仍须核实来源与实听。
- **本地素材说明口径**：Wyzowl 索引的 `use_for`/`avoid_for`、`sync.at`/`timing` 与 `adapt.rate` 属于发布者提供的文件内指引（非成片秒、非已试听证明；若 `adapt.rate` 要求音高随速变，改用 `audio-edit` `playbackRate`，不拿保音高 `speed` 冒充）；Kenney 包分类来自目录/文件名，未标注 onset/tail 时保持未知，不凭 `_000`/`_001` 编号猜听感。

### 2. 第二顺位：外部免费成品检索与下载（Arrangement `laohu-sound.py`）
本地无合适候选时，**必须继续执行外部成品检索**（不借缺本地素材擅自静音、删 cue 或直接用粗糙正弦糊弄物理拟音）。所有缓存与隔离 venv 落在 `$WORK_ROOT/.cache/sound/` 与 `$WORK_ROOT/.cache/tmp/sound/`，调度器会校验目标路径绝不逃逸 `$WORK_ROOT`；支持全局 `--ffmpeg`/`--ffprobe` 与 `LAOHU_FFMPEG`/`LAOHU_FFPROBE`（兼容 `MOTION_FFMPEG`/`MOTION_FFPROBE`）。

- **常规物理/氛围 SFX**：检索 Mixkit（`mk:<id>`）、Freesound（`fs:<id>`）、Pixabay（`px:<id>`，缺 `curl_cffi` 时按提示在本地隔离 venv 安装）。
- **界面/交互音效（`--role ui`）**：优先检索 Kenney 连贯素材包（先搜 `kenney_pack:<slug>`，选中 pack 再列包内文件并用 `kn:<pack>/<file>` 获取），同时保留其他 provider 作为替代。

```sh
SOUND_TOOL="$SKILL_DIR/scripts/laohu-sound.py"
SOUND_CACHE="$WORK_ROOT/.cache/sound"
SOUND_TMP="$WORK_ROOT/.cache/tmp/sound"

# 常规外部检索（UI 交互加 --role ui，Kenney 细查加 --providers kenney --pack <slug>）
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" \
  search --query "wood hinge slow close" --action "close" --material "wood" \
  --min-duration-sec 0.15 --max-duration-sec 1.2 \
  --providers mixkit,freesound,pixabay --limit 12 --pages 2

# 下载选中 key（输出须在工作工程内且不覆盖既有文件）
python3.12 "$SOUND_TOOL" --work-root "$WORK_ROOT" --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" \
  get --key '<搜索结果返回的精确 key>' --out-dir .cache/sound/incoming

# 需登记回同一音频索引时，经兼容桥保存机器回执并注册（仅允许明确可再分发许可如 CC0/CC-BY）
python3 "$SFX_COMPAT_TOOL" source-search --query "wood hinge slow close" \
  --action close --material wood --providers freesound --freesound-license cc0 \
  --work-root "$WORK_ROOT" --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" \
  --ffprobe "$MOTION_FFPROBE" > "$WORK_ROOT/.cache/validation/source-search.json"
python3 "$SFX_COMPAT_TOOL" source-get --key 'fs:<ID>' --out-dir .cache/sound/incoming \
  --work-root "$WORK_ROOT" --cache-dir "$SOUND_CACHE" --tmp-dir "$SOUND_TMP" \
  --ffprobe "$MOTION_FFPROBE" > "$WORK_ROOT/.cache/validation/source-get.json"
python3 "$SFX_COMPAT_TOOL" source-register \
  --source-get-receipt .cache/validation/source-get.json \
  --source-search-receipt .cache/validation/source-search.json \
  --key 'fs:<ID>' --asset-id '<稳定资产 ID>' \
  --index .agents/skills/laohu-motion/assets/audio/index.json \
  --file 'freesound-sfx/<文件名>.mp3' --role '<duty role>' \
  --material 'metadata-derived; not auditioned' --energy 'unknown' \
  --tag '<tag>' --license-id CC0-1.0 --license-proof '<证据路径>' \
  --work-root "$WORK_ROOT" --ffprobe "$MOTION_FFPROBE"
```

- **Freesound 官方 API 兼容路径**：配置了 API token 时可用 `sfx-sources.py freesound-search` / `download`（默认 `--kind preview` 取高质量 MP3 预览；`--kind original` 须另配 OAuth2 `FREESOUND_OAUTH_ACCESS_TOKEN`，跨主机跳转自动剥离认证头；仅核实精确 CC0 1.0 或 CC BY 具体版本且与 API 标签一致时生成 `audioPlanAsset`，其余返回 `rights_unverified`）。以 JSON 中真实 `networkStatus` 区分依赖缺失、配置缺失、网络失败与真正空结果。

---

## 三、许可边界、审核登记与源 WAV 剪辑

1. **许可与审核状态铁律**：
   - 分清同步进片权利与随库再分发权利；未知或不明确许可保留 `rights_unverified` 并停用正式混音，绝不默认 CC0；
   - 所有新下载、新登记或新派生文件初始均为 `candidate-unreviewed`（仅许可明确时经 `--allow-candidate` 供技术预览）。真实完整试听具体文件 hash 与当前语境后，用 `sfx-sources.py local-review --asset-id <id> --scope '<语境>' --full-file --reviewer '<标识>' --conclusion pass --notes '<实听起音/主体/尾音>' --confirm-listened` 写回原索引才升为 `ready`；局部区间、`conditional` 或 `fail` 仍维持候选状态并记入 `reviewHistory`。
2. **源 WAV 解码与剪辑**：
   - 核心动作匹配、仅需裁段/淡化/变速或少量有职责叠层时，按父级 [sound-editing-and-mixing.md](../../references/sound-editing-and-mixing.md) 第二部分操作——压缩索引素材（MP3/OGG）先用 `audio-edit.mjs decode-indexed-source` 生成 48 kHz float WAV 及身份链回执，再在 spec layer 以 `sourceAssetReceipt` 指向该回执执行编辑；绝不改扩展名冒充 WAV，不覆写原件或锁定轨。
   - 若核心材质不合，继续检索其他成品；具备真实音频听审能力的执行者在成品无法贴合定制相位且未禁原创时，可参考音库质感走原生合成或混搭并亲自实听校验（自然 Foley 仍优先真录成品）；无听审能力时不得擅转程序合成。

---

## 四、交回 Motion 唯一音频计划

向父级返回：真实源或派生文件路径、格式与实测时长、SHA-256、来源页/作者/精确许可与再分发边界、选材理由、实际 `sourceRange`、按参数换算的 hitpoint（新素材无依据保留 `hitTimeSec: null`，绝不拿搜索页近似时长或 0 秒冒充；注意消费端若选段起点 >0 且未给落在选段内的有效 hitpoint 会拒绝，须按真实选段提供或显式记录技术预览覆盖）及审核状态。所有音效事件写 `bus: "sfx"` 并绑定共享 `eventId`，交给 Motion `audio-plan/1` 唯一终混，不另造时间线或改动 `audio.mjs`。
