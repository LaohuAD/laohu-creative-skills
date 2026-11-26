# 完整项目的 Git 更新操作

执行首次克隆、Git 仓库更新或无 Git 旧目录迁移时由 `laohu-update` 读取。`{SKILL_DIR}` 为当前真实目录，`{PROJECT_ROOT}` 为 `{SKILL_DIR}/../../..`；所有命令均须先替换真实路径并加引号，按步核对，不盲跑整段。

## 1. 首次安装与现状采样

- **首次安装**：在已确认的工作盘父目录下克隆到不存在的新目录（不稀疏检出、不只抽 `.agents/skills/`；若有子模块或 LFS 指针需核实获取）：
  ```bash
  git clone https://github.com/LaohuAD/laohu-creative-skills.git "{NEW_PROJECT_DIR}"
  ```
  完成后跑 `python3 "{NEW_PROJECT_DIR}/tools/check_project.py"`，再按 [入口安装](installation.md) 接入。
- **已有 Git 项目先采样现状**（文件名解析用 `-z`）：
  ```bash
  git -C "{PROJECT_ROOT}" status --porcelain=v1 -z --untracked-files=all
  git -C "{PROJECT_ROOT}" symbolic-ref --quiet --short HEAD
  git -C "{PROJECT_ROOT}" rev-parse HEAD
  git -C "{PROJECT_ROOT}" remote -v
  git -C "{PROJECT_ROOT}" diff --binary --full-index
  git -C "{PROJECT_ROOT}" diff --cached --binary --full-index
  git -C "{PROJECT_ROOT}" ls-files --others --exclude-standard -z
  git -C "{PROJECT_ROOT}" ls-files --others --ignored --exclude-standard -z
  ```
  若存在未结束的 merge/rebase/cherry-pick、未解决冲突或 detached HEAD，先向用户说明状态并确认目标分支，不强行启动合并。
- **获取并锁定精确目标提交**：沿用官方跟踪分支或默认分支（远端不符或锁定了发行标签时先确认）：
  ```bash
  git -C "{PROJECT_ROOT}" fetch --no-tags "{OFFICIAL_REMOTE}" "refs/heads/{TARGET_BRANCH}"
  git -C "{PROJECT_ROOT}" rev-parse FETCH_HEAD
  git -C "{PROJECT_ROOT}" merge-base "{ORIGINAL_HEAD}" "{TARGET_COMMIT}"
  git -C "{PROJECT_ROOT}" diff --name-status --find-renames "{BASE_COMMIT}" "{TARGET_COMMIT}"
  ```
  若 `{TARGET_COMMIT}` 已是本地 HEAD 祖先，说明官方提交已在历史中，保护本地文件并回主文核查全局入口同步即可。后续全程锁定精确 `{TARGET_COMMIT}`，不再用浮动的 `FETCH_HEAD` 或再次 `pull`。

## 2. 同盘备份与隔离副本试合并

所有备份、隔离副本与中间文件一律放在 `{PROJECT_ROOT}/.cache/tmp/` 或 `.cache/restore/` 下的新建子目录（确保在项目同一工作盘、受 `.gitignore` 保护，绝不落盘到系统临时目录；若目录名与远端新路径碰撞则改用同盘项目外目录）：

1. **保存可恢复现场**：保存原 HEAD、分支、索引、暂存/未暂存二进制补丁，以及会被改写/删除/碰撞路径的实际文件内容、权限与符号链接（暂存与工作区不同时分别备份；无关大作品不复制不扫描）。
2. **排查未跟踪/被忽略资产碰撞**：将远端增删改路径与本地未跟踪、被忽略路径比对（含大小写、文件/目录与重命名碰撞），冲突路径单独备份并备好保留/迁移方案，绝不覆盖用户知识库或纳入本地密钥。
3. **建隔离副本试合并**（绝不在原工作区试错）：
   ```bash
   git clone --no-hardlinks --no-checkout "{PROJECT_ROOT}" "{CANDIDATE_DIR}"
   ```
   检出 `{ORIGINAL_HEAD}` 到临时分支，确认 `{TARGET_COMMIT}` 对象齐全，用临时本地测试身份完成三层分步合并：
   - **已提交历史 `H → M`**：可快进用 `git merge --ff-only "{TARGET_COMMIT}"`；分叉用 `git merge --no-commit --no-ff "{TARGET_COMMIT}"`，逐项处理内容/删除/二进制/重命名/符号链接冲突（不盲用 ours/theirs）。
   - **暂存状态 `H→I` 合入 `M → I'`，再把工作区差异 `I→W` 合入 `I' → W'`**：普通文本可用 `git merge-file -p` 辅助三方比较；严防三层混并导致未提交实验误进合并提交。
4. **在副本做语义与结构双检**：检查跨文件规则冲突、入口删改、链接有效性并跑 `check_project.py`。

## 3. 冲突先征询，无冲突或获批后再应用

- 凡涉及文件冲突、语义冲突、路径碰撞或未决取舍，先向用户展示紧凑方案并等待确认（询问前原工作区、索引与分支一字不动）。用户拒绝则停止写入；无冲突无新取舍时原更新请求即可继续应用。
- **应用前复核现状**：对比当前 HEAD、索引与受影响文件内容与快照；若等待期间用户有新修改，重算差异绝不覆盖。
- **分步安全写入**：
  - 无本地未提交改动且可快进：直接 `git merge --ff-only "{TARGET_COMMIT}"`。
  - 有本地未提交改动：确认恢复材料完整后，仅对已备份的明确受阻/暂存路径清单临时还原至 `H`（`git restore --source="{ORIGINAL_HEAD}" --staged --worktree -- {TRACKED_PATHS}`，严禁对整仓运行），完成 `M` 的快进或显式合并提交（不 rebase、不混入个人实验、不改全局 Git 配置或绕过 Hook），再精确恢复 `I'` 到索引、`W'` 到工作区及原权限/符号链接，碰撞未跟踪文件按获批方案处理。
- **应用后核验**：核对工作区与候选一致、`git merge-base --is-ancestor "{TARGET_COMMIT}" HEAD` 成立、`check_project.py --test` 通过，不替个人修改擅自升官方版本号。

## 4. 安全禁令与无 Git 旧目录迁移

- **绝对禁止**：`git reset --hard`、`git clean`、自动 `git stash`、强制推送或整目录粗暴覆盖。中途中断时先核清已走到的步骤，再从快照安全恢复，绝不丢弃用户新改内容。
- **无 Git 历史的旧复制目录**：保留原目录不动，新克隆官方完整项目至新目录；核实旧基线或逐项比较个人修改，无法自动归属的内容按用户资产保留，方案确认后再切换宿主入口。
