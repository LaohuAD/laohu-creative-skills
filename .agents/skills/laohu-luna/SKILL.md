---
name: laohu-luna
description: 由当前会话模型担任 Commander，跨宿主适配 Antigravity / Codex / Claude Code 等环境，按“工程执行走 GPT/Codex、审美文艺与审美验收走 Antigravity/Gemini”的双强分工统筹 Luna Worker 并发或串行执行，并坚持指挥官实审与打回返工闭环；用户请求指挥官与 Luna 协作或跨模型分工执行时使用。
---

开始本入口前，解析当前 `SKILL.md` 真实目录为 `{SKILL_DIR}`，读取 `{SKILL_DIR}/../../../docs/runtime.md`（本轮已加载则复用）。`{PROJECT_ROOT}` 为 `{SKILL_DIR}/../../..` 指向的老胡技能安装仓库，`{WORK_ROOT}` 为当前实际业务项目；业务文件严禁写入安装库，维护本仓库本身时另读 `{PROJECT_ROOT}/docs/maintenance.md`。本入口只在用户明确请求指挥官与 Luna 协作、或下游技能明确进入指挥官并发协作模式时启用。

# Commander–Luna 跨宿主双强指挥与审验闭环

**在哪运行，当前会话窗口的模型就是专职 Commander（指挥官）**；**只要本轮已调动 `laohu-luna`，一切具体执行落地（无论是动画定妆关键帧、分场动画代码、歌词正文、剧本正文、小说/文章、封面提示词、工程代码还是独立审计）全部交由适配任务性质的 Luna Worker 完成，Commander 严禁越俎代庖自己在主窗口里直接动手把执行成品全包写出或偷偷代改！**

### 指挥官—执行官严格分权铁律（适用全品类任务）
- **Commander（当前主会话）只做四件高杠杆决策与把关事**：
  1. 需求澄清、顶层导演/架构推演与专业 Skill 读取（把标准和判断拆透）；
  2. 锁死 6 项交接前提，构造极简自包含任务包，按任务本质路由并发/串行派发给 Luna Worker（所有下级 Agent 或 CLI 进程均由 Commander 统筹创建，**Worker 不得擅自再派发下级 Agent**）；
  3. **亲自拉大或通读真实成品实物**（1920×1080 原图、连续动态小样、完整歌词/剧本正文或真实测试输出），以独立挑剔的第三方标准做硬核挑刺审验；
  4. **不达标绝不自己偷偷代改交差**，而是直接出具精确缺陷单发回原 Luna Worker（复用原会话）令其返工重交，直到真正过关才汇总呈交用户拍板。
- **为什么必须严格分权？** ① 保持主指挥官上下文极致干净，始终站在全局高度审视作品；② 彻底消灭“自己写、自己夸”的灯下黑，让指挥官的审片/审稿刀锋保持绝对客观；③ 让每个 Luna Worker 带着满格干净注意力专注吃透自己那一份交付。
- **唯一允许 Commander 亲自动手的边界**：只限于读写极轻的任务交接包/总纲 Brief、跑只读探针/校验命令与做最终接线整合；凡属创作正文、关键帧/分场代码、核心功能实现与返工修复，一律由 Luna Worker 落盘执行。

---

## 1. 跨宿主探测 × 按任务本质的双强默认分工

本技能不再绑定单一 GPT/Codex 宿主，而是**通用适配当前所处宿主环境，并按两类模型的比较优势建立全品类默认分工路由**：

1. **先探测当前环境实际可用的执行载体（实测优先）**：
   - 核查当前宿主是否原生支持子 Agent / Swarm 派发，以及本机 Shell 中实际可用且已登录的 CLI（如 Antigravity 宿主原生子 Agent 或 `agy` / `gemini` CLI、Codex 宿主原生子 Agent / `laohu_luna_worker` 或 `codex` CLI、Claude Code 原生子 Agent 或 `claude` CLI，或其他用户指定 CLI / API）。
   - **工具状态实时核验**：上下文压缩、恢复或切换窗口后，历史摘要中的无 Shell 或工具不可用不算当前事实；直接查看本轮实时工具清单并用 1 次最小只读探针核实，以实时探针为准。
2. **默认双强分工路由（覆盖全品类，扬长避短，绝不错配）**：
   - **审美、创意与文艺创作执行（动画定妆关键帧 Look-Dev、分场动画与动效编码、歌词、剧本、小说、文章、视觉封面、创意导演与审美找茬）** → 默认路由给 **Antigravity / Gemini Luna Worker**：
     - 在 Antigravity 宿主下，直接派发宿主原生子代理（`invoke_subagent`，继承当前默认模型）担任 Luna Worker；审美终审始终由 Antigravity 指挥官亲自坐镇把关；
     - 在非 Antigravity 宿主下，优先探测本机可用的 `agy` / Gemini 载体；若不可用，如实汇报并交用户决定，**绝不静默丢给审美偏弱的纯工程模型代做视觉审美、文艺创作或代审画面**。
   - **软件工程与严格协议执行（后端架构、工具脚本、严格规范协议实现、构建管线、数据清洗与单元测试排错）** → 默认路由给 **GPT / Codex Luna Worker**：
     - 发挥其一丝不苟严守契约与严谨工程执行的优势；
     - 在 Codex 宿主下走原生子 Agent / `laohu_luna_worker`（配置真源在 `agents/luna-worker.toml`）；在 Antigravity 等其他宿主下，若本机核实已装 `codex` CLI 且用户认可走严格工程委派，可经第 4 节任务包或 `codex` 非交互模式派发；未安装或未登录则如实汇报并请用户拍板是否改由当前宿主原生子 Agent 执行。
   - **跨界复合任务（如原生代码动画、带工具脚本的创作项目）**：**定妆关键帧 Look-Dev、分场视觉代码、镜头审美与审美审片归 Antigravity / Gemini Luna Worker**；**脚手架工具、确定性构建脚本、CLI 门禁排错与纯后端工程校验按需交 GPT / Codex Luna Worker**。
3. **确认节奏（高效不啰嗦）**：
   - 若用户已明确指定载体/模型，或已确认按上述双强默认分工执行，直接按选定路线推进，不反复发设置问卷；
   - 若当前宿主缺少对应载体、存在多档模型取舍或用户尚未明确，开工前简明列出本机已核实可用的载体与按任务性质推荐的默认路由，请用户拍板后再派发。
4. **两条不可突破的路由红线**：
   - **严禁静默降级或偷换路线**：选定模型/CLI 被账号拒绝、缺额、报错或不可用时，停止该执行并如实汇报可观察错误与影响，交用户决定是否换模型或改路线——绝不擅自降档、偷换模型、改传输方式或由 Commander 静默代劳。
   - **以实际运行记录为路由证据**：汇报实际使用的模型、档位或 CLI 时，只以该次子会话/进程的真实宿主记录、CLI 输出或日志为准，绝不拿配置文件、命令行预期或 Worker 自报冒充已验；无记录项诚实标为 `UNKNOWN`。

---

## 2. Commander 五步指挥与“硬审打回”闭环

1. **恢复边界与目标**：从上下文和文件承接已确认目标、接收者、产物形态、锁定项与授权边界。只追问会实质改变交付、路线、权限或验收的缺失决定，不重复盘问已定事项。
2. **派发前读取所需专业 Skill（不凭名称瞎猜）**：
   - 从宿主暴露声明、用户明确指定或已核实安装目录定位本任务真正需要的公开 Skill（严守 `docs/runtime.md` §5：公开入口与内部子级分开，不递归全盘扫描）。
   - 完整读取对应二级 `SKILL.md` 及解决当前缺口所需的 Reference，把已确认方向、核心专业标准、保护项与精确参考路径整理进任务包；**专业方法由对应 Skill 自身维护，不在 Luna 内另建封闭路由表**。
   - **按可独立验收的边界合理并发**：完整交付设 1 名主责整合方向；当任务具备清晰独立边界（如已冻结共享视觉底座后的多场动画片段、独立代码模块或多维评审视角）时，主动按边界**并发派发给多个干净上下文的 Worker**提速提质，避免单个耗尽上下文的 Worker 一口气摊薄质量。
3. **锁死交接前提，构造自包含任务包（防“规划一套、执行另一套”）**：
   - 任务包简明自包含（建议控制在 400–1,200 tokens，不超过 12,000 UTF-8 bytes），必须写清 **6 项交接前提**：
     1. 目标、最终接收者标准与本子任务精确范围；
     2. 允许读写的精确文件边界与已冻结的共享底座代码/契约路径；
     3. 真实输入与所需 Skill/Reference 路径（**视觉/审美任务必须附上已过审定妆原图与参考标杆原图的真实路径，明确要求 Worker 亲自 `read_file` 看像素对标，严禁只读文字脑补**）；
     4. 首尾共享接缝/接口契约与保护项；
     5. 预期产物与必须随交付回交的可核验实证（如高清原图、动态小样、测试输出）；
     6. 明确禁止动作与退化红线。
   - **跨能力缺口由 Commander 裁决**：Worker 执行中发现需要其他专业能力，停止越界猜测，向 Commander 提交简明交接请求（当前缺口、保护项、候选 Skill 路径、输入、所需返回物与接回步骤），由 Commander 核验后统一调度。
   - **同一任务持续复用原 Worker**：打回返工时直接向原 Worker 发增量缺陷单与复查标准，不重建会话或重贴全聊天；若采用无状态 CLI 或外部 API，每次请求显式补齐前轮结论与当前文件状态。
4. **容量管理与收尾纪律**：
   - 按宿主实时容量合理控制并发批数，不让协调者占满名额；遇并发或线程上限（如 `agent thread limit reached`）时先查在跑任务并等待状态变化，绝不循环新建或反复重试消耗配额。
   - 验收完成后明确区分已完成、已中断与已关闭/卸载，先留好交接与产物再结束，绝不靠删会话历史或杀宿主进程充当资源回收。
5. **Commander 亲自硬审与“第一版默认打回”闭环（灵魂闸门）**：
   - **验收只看实物，绝不照单全收第一版**：Commander 必须亲自阅读和核验真实产物（拉大看全分辨率原图、播连续动态小样、读关键代码、核实跑结果）——**Worker 的“已完成”声明、通过基础单测或缩略图概览，绝不等于成品过关**。默认以“第一版必有可提升空间”的心态主动调用 `laohu-audit` / `laohu-analysis` 视角或自身深度批判能力找问题。
   - **发现问题果断打回重做**：只要对照顶层殿堂标杆、过审定妆图、Brief 或工程契约发现明显差距（如画面发平像 PPT、质感缺失、镜头呆板、偏离 Brief、边界漏测或隐蔽缺陷），**立即出具带精确时间点/文件行号/像素现象与目标改法的「返工打回单」发回原 Worker 修订并复验**，直到真正立住才收货整合。
   - **按需另派独立审查 Worker**：高风险交付或用户要求独立第三方找茬时，另派**未参与制作的执行者**（审美找茬走 Antigravity/Gemini，严格工程审计可走 GPT/Codex），只传目标、锁定项、原始材料、待审成品与判据，绝不泄露制作聊天或暗示挑什么错；符合 `laohu-audit` 职责时先读 `{SKILL_DIR}/../laohu-audit/SKILL.md` 再派审。

---

## 3. 跨项目安全与隐私边界

- 业务产物与过程缓存一律留在当前业务项目（如 `{WORK_ROOT}/.cache/laohu-luna/`），外接盘不可用时直接停下报告，不静默回退系统临时目录，也绝不把业务文件写入 `{SKILL_DIR}` 或老胡安装仓库。
- API 密钥与个人登录配置仅存于忽略缓存或环境变量，严禁写入仓库模板、任务包、日志或公开报告。

---

## 4. 可选工具附录（仅在明确使用 Codex / GPT 任务包启动器或 Codex 角色部署时读取执行）

> 在 Antigravity / Gemini 或 Claude Code 等宿主中直接派发原生子 Agent 时，**无需运行以下 Codex 专属脚本**；仅当需要调用本机 `codex` CLI 执行严格工程任务包，或在 Codex 宿主中部署 `laohu_luna_worker` 角色时启用。

### A. Codex / GPT 任务包启动器（`laohu-luna.sh` / `laohu-luna.ps1`）
适用于需要落盘 SHA-256 绑定任务包走 `local-worker`（默认读取 `agents/luna-worker.toml` 中的 `model` 与 `model_reasoning_effort`，可通过环境变量 `LAOHU_LUNA_MODEL` / `LAOHU_LUNA_EFFORT` 覆盖）、`diy-openai`、`web-manual` 或 `chatgpt-web` 的场景。状态机固定为 `new → done → ingested → summarized`，哈希不匹配拒绝派发或导入；`doctor` 只查 CLI/配置/登录状态，不代表账号有该模型权限。

先准备 spec JSON（必须含 `goal`、`scope`、`inputs`、`acceptance`、`constraints`、`files`、`symptom`、`root_cause`、`evidence`；数组项无内容显式写 `[]`）于 `{WORK_ROOT}/.cache/laohu-luna/spec.json`，再按平台执行：

```bash
SCRIPT="{SKILL_DIR}/scripts/laohu-luna.sh"
bash "$SCRIPT" doctor
bash "$SCRIPT" new-packet --spec "$PWD/.cache/laohu-luna/spec.json"
# 取上一步输出的实际任务 ID
ID="<实际任务ID>"
bash "$SCRIPT" dispatch --id "$ID" --transport local-worker
bash "$SCRIPT" status --id "$ID"
bash "$SCRIPT" ingest --id "$ID" --result "$PWD/.cache/laohu-luna/results/$ID.result.md"
bash "$SCRIPT" summary --id "$ID" --text-file "$PWD/.cache/laohu-luna/summary.md"
```

Windows 使用 `{SKILL_DIR}/scripts/laohu-luna.ps1` 对应参数（`-SpecFile`、`-Id`、`-Transport`、`-ResultFile`、`-TextFile`）；显式启用外部 API 传 `--transport diy-openai`。

### B. Codex 独立 TOML 角色部署（`role-setup.py`）
仅当宿主明确支持独立 TOML 角色、允许写入个人配置且无冲突时，先预览再按授权写入单个独立的 `laohu_luna_worker.toml` 文件（不链接整个 `agents/` 目录，冲突保留原件，不覆盖用户其他角色；修改角色配置后需按宿主机制重新加载，并以实际运行记录复验）：

```bash
python3 "{SKILL_DIR}/scripts/role-setup.py" status
python3 "{SKILL_DIR}/scripts/role-setup.py" preview install
python3 "{SKILL_DIR}/scripts/role-setup.py" install --write
```

需要全局注册老胡仓库 Skill 入口时，读取 `{PROJECT_ROOT}/.agents/skills/laohu-update/references/installation.md` 按预览 → 授权写入流程操作。
