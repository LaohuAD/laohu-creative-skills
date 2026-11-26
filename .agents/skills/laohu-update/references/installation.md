# 完整仓库与全局入口安装

由 `laohu-update`（及询问安装用法时的 `/laohu`）按需读取；操作完成后回主文报告实际状态。只问用法时只解释不执行；阅读 README 或本文件不构成全局安装授权。

## 1. 一份仓库，项目内与全局共用

- 始终只维护一份完整 Git 仓库（需 Git 与 Python 3.9+），项目内与全局入口共享同一真源，不拆开发版/稳定版副本。
- **项目内使用**：在完整仓库内打开 Agent 即可（Codex 自动发现 `.agents/skills/`；未显示入口的宿主可直接读取 `.agents/skills/laohu/SKILL.md`）。
- **全局使用**：只为直接部署的一级、二级正式公开入口创建符号链接，保留仓库规则、工具与知识依赖；跳过预留目录、标题草案、`.local-only` 私有入口与嵌套内部三级子级（三级子级由所属二级按需读取，不单独注册）。
- **宿主目录**：内置适配 `--host codex`（`~/.agents/skills`）与 `--host claude`（`~/.claude/skills`），只安装用户明确选中的宿主；其他宿主核实真实目录与符号链接支持后改用 `--skills-dir "{实际技能目录}"`，链接不可用或工作盘离线时直接报错，不静默复制或换盘。

## 2. 预览、注册、检查、同步与卸载命令

解析 `{PROJECT_ROOT}` 为当前完整仓库路径；除只读 `status` 外，其余命令**默认只预览**，确认无冲突且获授权后加 `--write` 应用：

```bash
python3 "{PROJECT_ROOT}/tools/install.py" install --host codex
python3 "{PROJECT_ROOT}/tools/install.py" install --host codex --write
python3 "{PROJECT_ROOT}/tools/install.py" status
python3 "{PROJECT_ROOT}/tools/install.py" sync
python3 "{PROJECT_ROOT}/tools/install.py" sync --write
python3 "{PROJECT_ROOT}/tools/install.py" uninstall --host codex
python3 "{PROJECT_ROOT}/tools/install.py" uninstall --host codex --write
```

- **冲突保护**：登记记录存于被忽略的 `.laohu-install.json`。已有链接指向同一真源可登记复用；同名文件、真实目录或其他来源链接均报冲突并中止写入，绝不删除冲突对象。
- **区分文件系统状态与宿主发现**：执行后用 `status` 核对无待办并实读一条已链接入口的 `SKILL.md` 核验可访问，再提醒用户按宿主机制刷新或新开会话验证菜单发现，不将链接已建冒充宿主已加载。
- **同步、锁与搬迁**：`sync` 只维护已登记宿主，补新增/缺失链接并移除已退役的受管理链接（不动源文件与非托管项）；遇到锁文件先确认无并发进程再核查处理，不盲目删锁；卸载只移除匹配链接、保留仓库与作品；**搬迁仓库前先卸载旧链接，搬迁后再重新注册**。

## 3. 配合仓库更新同步入口

更新前先记录现有登记并对照隔离候选里的 Skill 增删改名检查全局目录碰撞（绝不在候选副本执行注册）。仓库合并与 `check_project.py --test` 通过后，在原仓库跑 `sync` 预览 → 无冲突跑 `sync --write` → `status` 复验（无全局登记时保持项目内使用）。即使官方目标已在本地历史中，也照常复核全局链接；仓库与入口两段状态分别如实回报。
