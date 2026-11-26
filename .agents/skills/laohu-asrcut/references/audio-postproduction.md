# 口播声音诊断与后期处理

需要修复、清理、塑形或统一口播音质时读取。纯修音直接基于可访问的连续原音工作，无需 ASR 或虚拟剪辑；只有转写无原音时说明无法修音或测量，不阻断独立的虚拟剪辑。

## 1. 先核音源、证据与保护边界

沿用稳定来源身份、哈希、音轨、采样率与同步偏移；多轨、麦克风声和系统声分别识别，未知轨道或偏移保持未知不瞎猜。所有输出写全新路径。

- **默认保护底线**：保说话者本人音色身份、实际口语、精确总时长与同步关系。不自动变调、换声、神经重建、加配乐或混响、也不清光自然呼吸；背景音乐、系统提示音和演示声先核实用途，绝不混同为底噪粗暴清除。
- **区分证据来源与多模态实听**：具备真实听音能力的多模态执行者，先选代表性原音段（含底噪、正常发声、强发声、齿音、呼吸与剪口）直接实听诊断，并在处理后实听等响度 A/B 副本自主查伪影迭代；无法听音时严格区分测量指标、用户描述与推测，绝不冒称已听或听感通过。

## 2. 按可观察症状选处理（零默认预设）

每项处理仅在对应问题确有实听或测量依据时启用；干净录音保持旁路即可，绝不为显得干了活而硬套一整套滤波链。

| 实测或实听问题 | 谨慎试做方向 | 处理后必查损伤 |
|---|---|---|
| 持续平稳底噪 | 先参考 `probe-silence --noise-db auto` 实测底噪地板，用轻量 `denoise` 试探（取样前不先加门限或自动增益改变底噪） | 辅音、尾音与呼吸是否完整，有无金属水下感或抽吸，有用环境声是否被连带掏空 |
| 低频嗡声、低中频浑浊或频响偏暗 | 用 `highpass` 或窄带小幅 `equalizer` 定点试切，不套固定曲线；低音多本身不是自动削低频的理由，EQ 也变不出从未录到的高频 | 清晰度是否提升、底噪是否被放大、人声是否变薄发刺或不像本人 |
| 特定字词齿音刺耳 | 仅在确实妨碍聆听时轻试 `deesser`，不靠压暗全句高频掩盖单个齿音 | s / shi 辨字线索是否清晰，有无大舌头或局部发闷 |
| 句内强弱起伏过大妨碍听清 | 先完成源修复和音色处理，再按普通词与强发声电平轻设 `compressor` 阈值，守住有意强调 | 强调是否被压平、呼吸是否被抬太响、有无泵动感 |
| 情绪重音或瞬态峰值顶住响度天花板 | 结合轻量 `gain` 与柔和真峰值保护 `limiter`（`limitDbtp` 建议设在目标 `maxTruePeakDbtp` 下方约 0.5 dB 留出插值余量），再接 `normalize` 稳定达标 | 瞬态是否发毛削波、主体口播动态是否保持自然 |
| 明显混响、混轨语音分离或复杂爆音修复 | 当前本地 FFmpeg 白名单不支持神经去混响/语音隔离（RNNoise、DeepFilterNet、NARA-WPE、VoiceFixer 尚未接入执行器）；如实说明能力边界并退出受依赖分支，绝不拿普通降噪冒充语音隔离 | 保护原声不被过度降噪毁掉 |

## 3. 单步迭代、连续源先修与等响度 A/B

- **每次只动一个变量**：保留原声和当前有效版本，每次只启用一步或调一项参数，用等响度对比核对是否有净改善；无改善或出现伪影立刻减弱或撤回，绝不靠继续加大处理量盖伪影。回听须放回完整前后词句与无话背景，不只听孤立片段。
- **先修连续原音，再进剪辑时间线**：降噪、高通、均衡、去齿音、压缩都依赖连续底噪与尾音上下文，须在剪成小片前完成。脚本内置三点有声片段延迟校准，保证输出样本率、声道与精确总样本数零漂移；校准不通过则阻断绑定，不靠截尾或补零凑长度。
- **片段平衡与整片响度分开**：剪接后再统一各段主观电平与交付响度；有明确要求按要求办，无强制规范时可选可撤销工作目标或保持原响度试听，不强塞全用途统一 `-14 LUFS`。
- **等响度 A/B 比较铁律**：比较两版必须同一内容、同一范围且对齐响度并检查真峰值（任一版撞天花板就双双同降到共同安全响度），防止更响被误听成更好。多模态模型实听 `ab-source.wav` 与 `ab-match.wav` 复查吞字、金属音、泵动、音色变薄和本人相似度下降；交付时仍把 AI 实听自查与用户本人终听分开汇报。

## 4. Schema 白名单与执行命令

写入 `audio-plan.json` 前核对 [asrcut.schema.json](../schemas/asrcut.schema.json) 的 `$defs.audioPlan` 与 `$defs.audioPlanStep`（支持 `denoise`、`highpass`、`equalizer`、`deesser`、`compressor`、`limiter`、`gain`、`normalize`；`normalize` 最多一项且必在末尾）。

```bash
# 独立修音或先修连续原音（绑定既有剪辑时追加 --source-id）
node .agents/skills/laohu-asrcut/scripts/audio-postprocess.mjs create-plan \
  --input original.wav --out audio-plan.json
node .agents/skills/laohu-asrcut/scripts/audio-postprocess.mjs process \
  --plan audio-plan.json --out processed.wav --tmp-dir .cache/tmp/asrcut-audio
```

剪后整轨微调模式（仅允许 `gain`、`limiter`、`normalize`）：

```bash
node .agents/skills/laohu-asrcut/scripts/audio-postprocess.mjs create-plan \
  --mode compiled-timeline --input cut.wav \
  --edit-plan frozen-plan.json --timeline timeline.json \
  --receipt cut.wav.artifact.json --out cut-audio-plan.json
```

运行 `process` 交付五件套：新处理 WAV、回执 `processed.wav.audio.json`、等响度对照副本 `*.ab-source.wav` / `*.ab-match.wav` 以及可打开的 `processed.wav.review.html`（初始标 `not_auditioned`）。修好的连续原音接回剪辑导出方式见[已处理连续音源绑定](media-export.md#5-已处理连续音源绑定)。
