# 在 Agent 对话里更新会员版

由 `laohu-update` 在用户主动检查或更新完整项目时读取。日常创作沿用公开版常规检查。在对话里呈现更新结果、配对指令与提醒偏好。泠月在飞书私聊确认这台设备，官网提供版本与权益说明。

## 1. 检查可以取得的版本

```bash
python3 "{SKILL_DIR}/scripts/member-update.py" status
```

- `state=active` 且 `target.channel=member`。仅查询时报告对应版本，用户已明确更新时，直接进入第 3 节。
- `state=unbound`。公开版可以照常更新。如果有 `reminder`，先说明公开版状态，然后给已购会员的绑定动作与 `detailsUrl`。身份尚未核实时，称设备尚未绑定。用户明确要求绑定，或明确选择抢先版时，再生成配对指令。
- `state=expired`。显示月卡到期和本机版本保留。用户仍可安装比本机版本更新的公开版。
- `state=unavailable`。告诉用户会员更新暂未核实，本机可继续使用。按公开渠道单独检查时，只有公开目标比本机版本新才可更新。
- `target=null`。保留现有版本。对本机已经装好的会员版不降级。`target.channel=public` 时，按[公开 Git 更新](git-update.md)核对公开目标。
- `reminder=null` 时保持安静。主动绑定设备和检查已授权的版本仍可使用。只提同一会员功能版一次，例如 2.1.1 与 2.1 分享提醒记录。

## 2. 已有会员首次绑定设备

```bash
python3 "{SKILL_DIR}/scripts/member-update.py" pair
python3 "{SKILL_DIR}/scripts/member-update.py" poll
```

先执行 `pair`。将它返回的 `message` 原样放在可复制文本中，附上 `botUrl`，引导用户打开泠月私聊、粘贴并发送。复制指令和发送由用户手动完成。配对码短时有效，同一次配对未过期可重复显示。用户完成确认后执行 `poll`，等待时至少间隔 5 秒，优先在用户返回对话后查一次。状态为 `approved` 后重新 `status`。状态为 `pending` 时保持现有版本。过期后仅在用户仍要绑定时重新生成。设备凭证由本机工具保存在仓库外，从不要求用户在对话里提供凭证。

用户说略过此版、关闭提醒或重新开启提醒时，依次映射到 `skip --feature <status 返回的 feature>`、`mute` 或 `unmute`。已显示的功能版保留记录。关闭只影响自动会员提示，用户仍可主动发起绑定与更新。

## 3. 获取并合并会员版

```bash
python3 "{SKILL_DIR}/scripts/member-update.py" fetch --version "{TARGET_VERSION}"
```

- 若完整仓库较旧，先按[公开 Git 更新](git-update.md)从核验过的官方远端获取公开基线，再试一次。下载返回的版本必须匹配当前选择。
- `fetch` 检验文件长度、SHA-256、Git 提交与完整仓库基线，将已核验对象导入当前仓库，并通过 `refs/laohu/member/<version>` 保留已核验提交。此操作不切分支或覆盖工作文件。以 `state=verified` 的 `commit` 做 `{TARGET_COMMIT}`，按 [Git 更新操作](git-update.md) 完成同盘试合并和真实落盘。隔离副本需要对象时，可从来源工作区取得已经验证的目标提交对象。会员发布内容留在本机，不随公开推送。
- 若中断、合并冲突或未通过检查，说明当前状态与用户可选动作。完成合并、结构检查和已登记入口同步后，报告实际安装的会员版本。界面文案见 [会员更新文案](member-update-copy.json)。
