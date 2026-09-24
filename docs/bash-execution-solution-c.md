# Bash 命令执行方案 C：独立 Worker / Sandbox 执行层

> 状态：设计方案，尚未实施
>
> 调研与代码核对日期：2026-09-23
>
> 适用范围：coderelay 当前的 `codex / claude / pi / omp` 路由、启动、取消、超时与会话持久化链路

## 1. 结论摘要

方案 C 将 Bash 执行从 Agent CLI 的宿主进程中抽离出来，形成独立的执行监督层：

```text
coderelay TUI / CLI
        │
        ▼
Execution Supervisor                 # 权限、排队、超时、审计、回收
        │
        ▼
Ephemeral Worker                     # 一次执行一个 worker，默认不复用
        │
        ▼
Sandbox Adapter                      # host / container / WSL / platform adapter
        │
        ▼
/bin/bash -c <command>               # 或 Windows/WSL 对应 shell
        │
        ├── stdout / stderr / exit
        └── descendants / process group / cgroup / Job Object
```

核心结论：

1. **当前 coderelay 不是 Bash 执行器，而是 Agent CLI 路由器和启动器。** Bash 通常由被启动的 Agent CLI 在其自身工具循环内执行，coderelay 只能看到 Agent CLI 的 stdout/stderr 和有限的工具事件。
2. **不能只靠解析 stdout 统一接管四个 CLI 的 Bash 权限。** 当前事件协议没有命令文本、argv、cwd、PID、网络域名、退出码或命令级耗时；Codex、Claude Code 的当前 prompt/exec 启动方式也不会把每个 Bash 调用暴露给 coderelay。
3. **方案 C 的第一阶段应提供“粗粒度隔离”：把整个 Agent CLI 放进 worker/sandbox 中。** 这能统一进程回收、环境、工作目录、网络和资源边界，但不能凭空获得每条 Bash 命令的审批能力。
4. **命令级审批需要显式的执行协议。** 对 Pi，优先使用 RPC 的子进程边界和 Bash 执行事件；对 OMP，优先评估 ACP/terminal 能力；Codex、Claude Code 在当前适配方式下继续使用各自原生的审批/沙箱，或后续增加专用 adapter。
5. **回收的完成条件不是“主进程退出”，而是“主进程、后代进程、输出流、临时资源和 registry 状态都完成收敛”。** 方案必须覆盖正常结束、用户取消、超时、父进程退出、worker 崩溃和 daemonize/脱离进程组等情况。

本文件只提交方案文档，不修改运行时代码。

---

## 2. 目标与非目标

### 2.1 目标

- 为每次 Agent/Bash 执行建立可追踪的 execution id。
- 在启动前完成权限决策：允许、拒绝或等待审批。
- 让工作目录、环境变量、网络访问、文件写入和进程树成为显式策略，而不是隐含在当前 shell 环境中。
- 统一 stdout/stderr、退出码、信号、超时、取消和错误结果。
- 统一 Unix、Windows、WSL 的后代进程回收策略。
- 在 supervisor 重启后识别并清理残留 worker，而不是留下孤儿进程。
- 为后续 Agent 原生工具协议接入预留接口，而不依赖解析自然语言或不稳定的终端文本。
- 让审计记录能回答：谁、何时、以什么权限、在什么 cwd、执行了什么、产生了什么结果、何时回收。

### 2.2 非目标

- 本阶段不重新实现 Codex、Claude Code、Pi 或 OMP 的 Agent loop。
- 不把 `extraArgs` 里的原生 CLI 参数误认为 coderelay 的安全策略。
- 不承诺仅用字符串黑名单阻止所有恶意 shell 行为；shell 解析、sandbox 和 OS 权限必须分层。
- 不把“限制 cwd”描述成 sandbox。cwd 只是默认工作目录，不等于禁止访问其他路径。
- 不在没有用户确认的情况下默认启用网络、sudo、宿主机写入、后台常驻或危险删除。
- 不在本次文档提交中修改 `src/`、测试或配置 schema。

---

## 3. 当前代码事实

以下结论来自当前仓库代码，而不是目标设计。

### 3.1 coderelay 的主要执行路径

| 路径 | 当前实现 | 生命周期能力 | 与方案 C 的关系 |
| --- | --- | --- | --- |
| `src/runtime/agent-run.ts` `runAgentStream` | Node `spawn`，stdin/stdout/stderr 全部 pipe | 支持流式事件、AbortSignal、超时、Unix 进程组、Windows `taskkill`、2 秒终止宽限 | 应成为 supervisor 的现有生命周期基础，但需要抽成可复用执行内核 |
| `src/runtime/launcher.ts` `launchInteractive` | `stdio: "inherit"`，把 TTY 交给 Agent REPL | 没有统一 timeout/abort/registry；TUI 卸载后等待 child exit | 适合保留为“原生交互模式”，不应直接作为受控 Bash worker |
| `src/runtime/launcher.ts` `launchWithPromptCaptured` | 捕获 stdout/stderr，限制输出尾部 | 当前缺少 AbortSignal、进程组回收和 SIGTERM→SIGKILL 升级 | 应迁移到统一 supervisor，避免两套生命周期语义 |
| `src/runtime/launcher.ts` `runOnce` | Node `execFile`，有 timeout/maxBuffer | 适合短探测；没有显式 descendant/process-group cleanup | 继续用于版本探测等短命令，不用于长 Bash 任务 |
| `src/runtime/process.ts` `runProcess` | 旧 Bun `Bun.spawn` 封装，支持 capture/stream/timeout/abort | 目前只发 `SIGTERM`，无强杀升级、无进程组、无 Windows 进程树策略 | 作为兼容路径逐步收敛到 supervisor，不再扩展能力 |

### 3.2 `runAgentStream` 当前行为

`src/runtime/agent-run.ts` 已经有一套相对完整的 Agent 进程生命周期：

- `stdio` 是 `pipe / pipe / pipe`，并持续消费 stdout/stderr，避免管道写满后死锁。
- Unix 启动时 `detached: platform !== "win32"`，意图建立独立进程组。
- 终止时 Unix 对负 PID 发送信号；Windows 使用 `taskkill /pid <pid> /t /f`。
- 正常取消/超时先发送 `SIGTERM`，`KILL_GRACE_MS = 2_000` 后再强杀。
- 以 `close` 而不是 `exit` 作为最终 settle 时点，等待 stdio drain。
- cleanup 会清理 timeout/kill timer、Abort listener、stdin，并移除 child/stdout/stderr listener。
- 结果状态目前是：`completed | failed | timeout | aborted | spawn-error`。
- 结果保留 code、signal、duration、timeout 标记、文本、stderr 尾部和统一事件。

这些能力值得复用，但有几个方案层面的缺口：

1. `killProcessTree` / `forceKill` 内部直接读取全局 `process.platform`，而不是统一使用注入的依赖；跨平台测试和 sandbox adapter 测试会受到影响。
2. `spawn-error` 分支通过启动一个空的 Node child 作为占位返回值，这不是一个真正的 worker handle，后续 supervisor 不应延续这种语义。
3. 进程组策略无法保证 `setsid`、双重 fork、`nohup` 或容器外 daemon 已被回收。
4. 目前 lifecycle registry 是局部 Promise/状态，而不是可在 supervisor 重启后恢复的持久化执行登记。

### 3.3 Agent 适配器与 Bash 可见性

`src/agents/registry.ts` 注册四个 Agent：`codex`、`claude`、`pi`、`omp`。`src/agents/cli-adapters.ts` 当前构造的关键 argv 是：

- Codex：`codex exec ... <prompt>`，可选 `resume <id>`。
- Claude：`claude -p ... <prompt>`，可选 `--resume <id>`。
- Pi：`pi -p ... <prompt>`，可选 `--resume <id>`。
- OMP：`omp -p --mode json ... <prompt>`，可选 `--resume <id>`。

统一事件 `src/models/agent-events.ts` 目前包含 session、status、assistant text、tool started/finished、stderr、completed、failed、aborted 等类型。`tool_started`/`tool_finished` 只有工具名和成功标志，不包含：

- Bash 命令文本或 argv；
- 真实 cwd；
- worker PID/进程组/cgroup/Job Object；
- exit code、signal、duration；
- 访问的文件或网络域名；
- approval decision 和 policy rule id。

`parseStructuredLine()` 只识别通用 `tool_use` / `tool_result` 形状，不能安全地把任意字段当作命令元数据。因此，**向 stdout 解析器增加“猜测 Bash 命令”的逻辑不应作为方案 C 的基础**。

### 3.4 配置与权限事实

`src/config/schema.ts` 的 `AgentConfigSchema` 目前只有：

- `enabled`；
- `activationDecided`；
- `command`；
- `models`；
- `extraArgs`；
- `env`。

当前没有 command-level allow/ask/deny、sandbox mode、network allowlist、resource limit、approval timeout 或 cleanup policy。

特别需要注意：

- `extraArgs` 可以注入任意 Agent CLI 参数，可能改变 Agent 自己的审批或 sandbox 行为；它不是 coderelay 的强制安全层。
- `env` 可以改变 Agent 行为，也可能携带 token、proxy、sandbox 配置或其他敏感信息。
- `cwd` 通过 `resolveLaunchCwd()`（包括 WSL path 转换）决定启动位置，但不是文件系统隔离。
- `resolveAgentShell()` 只解决 Windows `.cmd/.bat` shim、WSL 直接启动等执行兼容性问题，不是安全边界。

### 3.5 TUI 取消与持久化事实

`src/cli.tsx` 当前使用：

- `activeAbort: AbortController | null` 保存当前 prompt 运行的取消入口；
- `flowSeq` 防止旧异步流程更新当前 UI；
- `/new` 和运行中 Ctrl-C 会 abort 当前执行；
- 完成、aborted、timeout 和失败结果会写入 SQLite session store；
- 交互模式先卸载 Ink，继承 terminal，等待 child 退出后重新挂载。

`flowSeq` 只防止 stale UI update，**不会自己杀掉进程**。方案 C 中必须让 `abort()` 触发 supervisor 的真实终止流程，并让 UI 只订阅 execution state，而不是把 UI 的 flow token 当作进程回收机制。

---

## 4. 四个 Agent 的 Bash 策略调研

调研以各项目官方文档为主，记录的是 2026-09-23 可见的产品行为；具体版本仍以用户本机安装版本和 `--help`/版本文档为准。

### 4.1 Codex CLI

Codex 将安全控制拆成两层：

1. **Sandbox mode**：技术上允许触达什么，例如工作区写权限、网络是否开启。
2. **Approval policy**：什么时候需要用户批准，例如离开 sandbox、使用网络或运行不在信任集合中的命令。

官方文档当前强调：

- 默认网络访问关闭；本地运行使用 OS 强制 sandbox，通常限制在当前 workspace 附近。
- CLI/IDE 可选择 `read-only`、`workspace-write` 等 sandbox 语义，并配合 `on-request` 等 approval policy。
- `codex exec` 适合脚本和 CI；非交互执行必须显式选择适合的 sandbox/approval 组合。
- `/permissions` 可查看/调整当前会话的权限边界。
- 存在绕过 approvals 和 sandbox 的高风险模式；coderelay 不应把它作为默认，也不应把 `extraArgs` 当作可信配置。
- Codex 还提供面向命令的 sandbox 测试/执行入口，说明其隔离边界在 Agent CLI 之下有独立实现，而不是依赖 stdout 文本。

对方案 C 的启示：

- Codex 的原生安全层已经有“技术边界 + 审批策略”的分层，coderelay 最稳妥的接入是把整个 `codex exec` 放进 worker，并让 worker policy 不弱于 Codex 原生 policy。
- 当前 coderelay 不应试图重写 Codex 的 native approval UI；应记录启动时的 effective policy 和 sandbox 参数。
- 如需统一 command-level audit，必须有 Codex 的结构化工具协议或专用 adapter，而不是从 `assistant_text` 反推。

### 4.2 Claude Code

Claude Code 的权限粒度比当前 coderelay 更细：

- 工具分层：只读、Bash、文件修改、网络访问等。
- Bash 可以按规则配置 `allow / ask / deny`，支持类似 `Bash(git log *)`、`Bash(git *)` 的规则。
- 复合命令会按子命令、管道、重定向、子 shell 等进行检查；不能把整串 shell 文本当作一个简单前缀。
- 内置只读命令集合可免确认，但重定向、可能改变目录/文件状态的形式会重新进入检查。
- permission rules 和实际执行前的 hook 可以参与决策。
- Bash sandbox 作用于 Bash、PowerShell、Monitor 及其子进程；macOS 使用 Seatbelt，Linux/WSL2 使用 bubblewrap 等依赖，Windows 原生不支持该 sandbox，需要 WSL2。
- sandbox 不可用时可以回退为普通 permission flow；若部署要求 sandbox 是硬门槛，应使用 `failIfUnavailable` 类策略关闭静默回退。
- 网络域名、可写目录、凭据环境变量也是 sandbox 配置的一部分；允许某一侧而忽略另一侧会造成边界穿透风险。

对方案 C 的启示：

- command matcher 必须先解析 shell 结构，再做规则匹配；不能只做 `startsWith` 黑名单。
- “sandboxed command”和“unsandboxed command”必须在审计中显式区分。
- coderelay 的 worker 应有 fail-closed 选项：所需 sandbox 不可用时直接拒绝，而不是降级为宿主机 shell。
- Claude 原生规则与 coderelay 规则同时存在时，采用最严格结果：任一层 deny，最终就是 deny；两层都 allow 才能无提示执行。

### 4.3 Pi

Pi 官方文档明确说明：

- Pi 的 tools 和 extensions 以 Pi 进程的 OS 权限运行。
- Pi 默认没有限制文件系统、进程、网络、凭据访问的内建 permission system；项目 trust 主要控制加载哪些项目资源，不是 tool sandbox。
- 直接运行时，bash、extensions、package installer、language server 和其他 child process 都继承该账户权限。
- 容器、VM 或其他 sandbox 是 Pi 文档推荐的更强隔离方式；工作目录本身不会阻止访问其他可见路径。
- Pi 支持 print、JSON event stream、RPC 和 SDK。RPC 以长期 child process 运行，通过 stdin/stdout 的 JSONL 控制；`bash_execution_update` 可关联 Bash 命令的执行更新，`agent_settled` 表示当前 agent run 不会继续自动推进。
- RPC 客户端必须持续读取 stdout，关闭 stdin 请求有序退出，但仍需处理 signal、unexpected exit、stderr、取消和自己的 deadline。

对方案 C 的启示：

- Pi 是四个目标中最适合首先接入“外部 supervisor + 显式执行事件”的对象：采用 RPC child boundary，而不是当前 `pi -p` 文本模式。
- Pi 的项目 trust 不能代替 worker sandbox；两者应分别记录。
- 如果使用第三方 permission extension，只能视为 Agent 内部策略，不应替代 coderelay 的 OS/container boundary。

### 4.4 OMP（oh-my-pi）

OMP 当前官方 approval 文档显示：

- 内置默认 `approvalMode` 是 `yolo`；交互式编码更安全的起点是 `write`。
- `always-ask`、`write`、`yolo` 表示哪些能力层级可直接执行：读、workspace/session write、executable actions。
- `tools.approval` 可按工具设置 `allow / prompt / deny`；`deny` 优先级高于 allow/prompt。
- `bash.patterns` 是有序规则，第一条匹配生效；`deny`/`prompt` 可以命中复合命令片段，`allow` 要求完整、非复合命令匹配。
- `eval` 可能产生 shell，但 Bash 规则不覆盖通过 eval 产生的 shell，因此需要单独约束 `eval`。
- headless 模式无法满足 prompt；没有明确 allow 或改成 deny 时，调用会失败而不是无限等待。
- ACP 通过客户端暴露 approval gate；拒绝、取消或无法呈现必要 prompt 会停止调用。
- approval 不是 sandbox。官方文档仍建议使用受限账户或 container，并把 tool policy 和 OS 权限分开设计。

对方案 C 的启示：

- OMP 的 `yolo` 只表示 OMP 层不因 tier 提示，不等于宿主机安全；worker 层不能因为发现 `yolo` 就放弃 sandbox。
- `bash` 和 `eval` 必须建模成不同 capability；不能只保护 Bash tool 名称。
- 对无 UI 的 coderelay 执行，prompt 必须定义 fail-closed 行为：没有可用 approval channel 时，执行应是 `approval-unavailable`/`denied`，不能假设用户会回答。

### 4.5 横向比较

| 维度 | Codex | Claude Code | Pi | OMP |
| --- | --- | --- | --- | --- |
| 默认/主策略 | sandbox + approval policy | 分层 permission rules + 可选 sandbox | OS 账户权限；无内建完整 tool permission | approvalMode，默认 yolo；可按 tool/pattern 覆盖 |
| OS 级隔离 | 有 | 有，macOS/Linux/WSL2 | 默认没有；依赖容器/VM/sandbox | approval 本身不隔离，依赖外部账户/container |
| 命令级匹配 | 原生 policy/approval，需以当前版本文档为准 | Bash 规则会解析复合 shell 结构 | 默认没有；扩展可提供 | `bash.patterns`，第一匹配；eval 单独处理 |
| 无 UI 行为 | 应显式指定 exec policy | 应显式配置 headless/permission/sandbox | print/JSON/RPC 不能弹内建 trust prompt | prompt 在 headless 下失败闭环 |
| 事件/外部控制 | `exec` 适合脚本，但当前 coderelay未暴露 command事件 | 当前适配路径为 prompt 文本，不暴露 command事件 | RPC 有 JSONL response/event 和 Bash execution update | ACP/terminal 可作为外部控制候选 |
| 主要风险 | bypass flags、workspace 外操作、网络 | sandbox unavailable fallback、规则误判、unsandboxed fallback | 进程账户权限过大、项目内容 prompt injection | yolo、eval 绕过 Bash pattern、headless prompt |
| 对方案 C 的重点 | 记录 effective policy，外层不弱化 | parser + sandbox hard gate | 优先 RPC adapter | 分离 bash/eval，外层容器化 |

---

## 5. 为什么选择方案 C

当前 coderelay 存在三个结构性问题：

### 5.1 责任边界不清

Agent CLI 负责“决定是否要使用 Bash”，操作系统负责“该用户能做什么”，coderelay 只负责“启动一个 CLI”。如果不引入 supervisor，取消、超时和权限策略会分散在四个 CLI、两个 runtime 封装和 TUI 中。

### 5.2 不能从输出流可靠推断命令

文本中可能出现：

- 模型描述的命令；
- 即将执行的命令；
- 命令执行结果；
- 用户 prompt 中的命令；
- 被截断或转义的命令。

把这些文本当成安全审计输入会造成误报、漏报和注入风险。必须使用显式事件/协议或在 worker 边界记录真正传给 shell 的 argv/script。

### 5.3 回收需要比当前 child 更高的边界

当前 `runAgentStream` 已经能杀 Unix process group 或 Windows process tree，但 Bash 子进程可能进一步创建 daemon、容器、WSL 进程或 detached child。只保存主 PID 不足以证明资源已经回收。Worker/cgroup/Job Object/container 才能让“回收对象”从单个 PID 升级为 execution scope。

---

## 6. 方案 C 总体架构

### 6.1 组件

#### A. Execution Supervisor

运行在 coderelay 控制面，负责：

- 创建 execution id；
- 校验 request；
- 解析/分类命令；
- 计算 effective policy；
- 审批、排队、并发限制；
- 启动 worker；
- 接收结构化生命周期事件；
- 触发 timeout/abort；
- 等待回收完成；
- 写审计与结果摘要；
- supervisor 退出前标记 active execution，并在下次启动恢复。

Supervisor 不直接执行用户提供的 shell 字符串。

#### B. Worker

默认“一次 execution 一个 worker”，先保证边界清晰，再评估 worker pool：

- 只接收结构化、版本化的 request；
- 校验 command、cwd、env、limits 的序列化格式；
- 设置进程组/Job Object/cgroup/container scope；
- 以最小环境启动 shell 或 Agent CLI；
- 持续读取 stdout/stderr；
- 发送事件，不把 stdout 当控制协议；
- 接受 abort/terminate；
- 在 scope 为空且流关闭后发送 terminal event。

Worker 不做模型判断，也不负责审批。

#### C. Sandbox Adapter

根据平台和部署级别选择：

1. `host-process-group`：Unix detached process group / Windows Job Object；最低隔离，兼容性最好。
2. `container`：Linux/macOS Docker/Podman 等；适合文件、网络、进程隔离，但引入运行时依赖。
3. `wsl`：复用当前 WSL target，但必须把 Linux scope、Windows `wsl.exe`、distro 生命周期分开追踪。
4. `platform-native`：接入 Agent/OS 原生 sandbox，例如 Codex/Claude 的 native boundary；仍需记录 effective policy。

`SandboxAdapter` 必须返回 scope handle，而不只是 child PID。没有可靠 scope 时，策略只能标为 best-effort，不得对用户声称“已清理全部后代”。

#### D. Approval Broker

- `allow`：策略静态允许，直接入队；
- `ask`：发送给 TUI/CLI/API 客户端，等待有超时的决定；
- `deny`：不 spawn worker；
- `approval-unavailable`：请求需要审批但当前没有可用 UI/客户端；fail closed。

#### E. Execution Registry

内存 registry 保存活跃句柄，持久化 journal/SQLite 保存最小恢复信息：

- execution id；
- parent session/turn id；
- worker pid 或平台 scope id；
- worker start time / nonce；
- target platform/runtime；
- sandbox profile；
- terminal state；
- cleanup attempt/result；
- temp root；
- redacted audit metadata。

PID 单独不足以作为恢复依据，需要配合 worker start time、scope nonce 或 OS handle，避免 PID reuse。

#### F. Audit Store

审计和对话 transcript 分开：session store 保存用户可见的轮次摘要，audit store 保存安全/运维所需字段。默认不保存完整 secret、token 或无限 stdout；输出采用尾部/上限/红action策略。

---

## 7. 权限模型

### 7.1 四层权限

执行权限按四层叠加，采用“最严格结果”：

```text
OS account / container boundary
        ∩
Sandbox filesystem + network
        ∩
Coderelay command policy
        ∩
Agent native policy
```

其中任一层 deny，最终 deny；任何一层无法确认，进入 ask 或 fail closed。

### 7.2 命令能力分类

分类不是最终安全边界，但用于默认策略、审批文案和资源限制。

| 类别 | 示例 | 默认 | 说明 |
| --- | --- | --- | --- |
| R0 只读本地 | `pwd`、`ls`、`git status`、测试读取 | allow | 仍受路径和输出上限约束 |
| R1 工作区写入 | 编译、格式化、生成文件、`git add` | ask 或 workspace policy allow | 只允许 workspace write root |
| R2 网络访问 | `curl`、包安装、git fetch、API 调用 | ask | 域名和端口 allowlist；没有网络需求默认 deny |
| R3 破坏性/权限变化 | `rm -rf`、`git reset --hard`、`chmod`、`chown`、磁盘/系统服务 | deny 或强确认 | 不允许通过普通前缀规则自动放行 |
| R4 持久化/脱离回收 | `nohup`、`setsid`、后台 daemon、服务安装、容器启动 | deny | 必须有专门的生命周期合同，不能作为普通 Bash 完成 |
| R5 提权/宿主机边界 | `sudo`、`doas`、root container、访问 SSH/cloud credentials | deny | 只有显式部署模式才可另行设计 |

### 7.3 默认 profile

#### `safe-read`

- cwd：当前 workspace；
- 文件：workspace read；不允许 workspace 外写；
- 网络：deny；
- R0：allow；
- R1/R2/R3/R4/R5：deny 或 ask（取决于交互模式，headless 直接 deny）；
- timeout：短；
- 输出：较小上限；
- sandbox 不可用：deny。

#### `workspace-write`

- cwd：当前 workspace；
- 文件：workspace 与受控 temp 可写；
- 网络：默认 deny，可配置域名 allowlist；
- R0：allow；
- R1：allow 或 ask；
- R2：ask；
- R3/R4/R5：deny；
- 允许 Agent native sandbox，但不允许它弱化 worker boundary。

#### `reviewed-automation`

- 只用于明确配置的 CI/自动化；
- request 必须带 policy id 和配置来源；
- 不显示 prompt 时，任何 `ask` 都转成 deny；
- 命令 allowlist 必须完整匹配，不能用通配符覆盖 R3/R4/R5；
- 使用受限账户、短期凭据和强制 sandbox。

### 7.4 审批决定模型

建议把“审批”建模为数据，而不是布尔值：

```text
pending
├── allowed_by_policy
├── awaiting_user
├── awaiting_external_client
└── expired

terminal decision
├── allowed
├── denied
├── approval-unavailable
└── policy-error
```

每次决定至少记录：

- `executionId`；
- `decision`；
- `policyProfile`；
- `matchedRuleId`；
- `requestedCapabilities`；
- `approver`（user / config / native-agent / external-client）；
- `timestamp`；
- `expiresAt`；
- `reason`；
- 命令摘要（敏感参数脱敏）。

---

## 8. Bash 命令请求与执行契约

### 8.1 请求的原则

- 内部使用 argv + command script 的显式结构；不拼接未经处理的 shell 字符串到 `spawn` 的 `shell: true`。
- 如果必须支持 Bash 语法，worker 使用固定 shell 入口，例如 Unix 的 `bash --noprofile --norc -c <script>`；login shell 是显式选项，不作为默认。
- 环境变量采用 allowlist/denylist 计算后的 snapshot，不直接透传全部 `process.env`。
- cwd 必须在策略允许的 root 下，使用 canonical path 检查；WSL 要对 Windows path 和 Linux path 分别 canonicalize。
- request 中的 `timeoutMs`、`maxOutputBytes`、`maxProcesses`、`maxFileBytes`、`networkPolicy` 必须有上限，用户不能通过命令本身覆盖。

### 8.2 建议的类型草案

以下是设计草案，不代表本次已经加入代码。实际实现时，状态和合法值必须放入核心定义模块，业务代码只导入 SSOT 常量；不得复制字符串联合，也不得使用 `any`。

```ts
type BashExecutionStatus =
  | "queued"
  | "awaiting-approval"
  | "spawning"
  | "running"
  | "terminating"
  | "reaping"
  | "completed"
  | "failed"
  | "timeout"
  | "aborted"
  | "denied"
  | "approval-unavailable"
  | "spawn-error"
  | "cleanup-failed";

type BashApprovalDecision = "allow" | "ask" | "deny";
type BashSandboxMode = "host-process-group" | "container" | "wsl" | "platform-native";

type BashExecutionRequest = {
  readonly executionId: string;
  readonly parentSessionId?: string;
  readonly parentTurnId?: string;
  readonly source: "direct" | "agent-tool" | "probe";
  readonly command: string;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly policyProfile: string;
  readonly sandboxMode: BashSandboxMode;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly network: "deny" | "allowlist";
};

type BashExecutionResult = {
  readonly executionId: string;
  readonly status: BashExecutionStatus;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly stdoutTail: string;
  readonly stderrTail: string;
  readonly cleanup: {
    readonly scopeEmpty: boolean;
    readonly streamsClosed: boolean;
    readonly tempRemoved: boolean;
  };
};
```

后续实现应把 `BashExecutionRequest` 拆成“用户请求”和“经过 policy 归一化的 effective request”，防止调用方伪造 `sandboxMode`、网络或 cleanup 结果。

### 8.3 Worker 协议

建议使用独立 JSONL 控制通道：

- supervisor → worker：`start`、`terminate`、`kill`、`health`；
- worker → supervisor：`started`、`stdout`、`stderr`、`exit`、`scope_empty`、`cleanup_started`、`cleanup_finished`、`fatal`。

控制通道与命令 stdout/stderr 分离：

- stdout/stderr 是不可信业务输出，只能作为事件 payload；
- worker control stdout 不能混入 shell stdout；
- 所有 event 带 `executionId` 和单调递增 `sequence`；
- supervisor 对缺失 terminal event 使用 child/OS 查询兜底；
- worker 崩溃后 supervisor 不能把“没有收到错误”当作成功。

---

## 9. 执行生命周期

### 9.1 状态机

```text
requested
   │
   ▼
validated ── invalid ───────────────► failed
   │
   ▼
classified ── deny ─────────────────► denied
   │
   ├── ask ─► awaiting-approval ── reject/expire ─► denied / approval-unavailable
   │
   ▼
queued
   │
   ▼
spawning ── spawn error ────────────► spawn-error
   │
   ▼
running
   ├── normal exit ─► reaping
   ├── timeout ─────► terminating
   ├── user abort ──► terminating
   ├── parent exit ─► terminating
   └── worker fault ─► reaping
                         │
                         ▼
                    terminal result
```

### 9.2 每一阶段的责任

1. **requested**：生成不可预测的 execution id，绑定 parent session/turn。
2. **validated**：检查非空 command、canonical cwd、env key/value、limits 范围和 request version。
3. **classified**：解析 shell 结构，识别复合命令、重定向、管道、subshell、后台执行、网络工具、提权工具和删除语义。
4. **approval**：把命令摘要、真实执行方式、cwd、写 root、网络域名和预计风险展示给用户；不展示完整 secret。
5. **queued**：应用并发、资源和公平性限制；拒绝同一 session 中无限并发。
6. **spawning**：先创建 sandbox scope，再启动 worker；登记 pid/start time/scope handle，再允许命令运行。
7. **running**：持续读取两个输出流，应用输出上限，更新 heartbeat 和 last-seen sequence。
8. **terminating**：记录原因，先优雅终止，启动 kill grace timer；禁止重复终止造成状态竞争。
9. **reaping**：等待主进程退出、scope 为空、streams drain、stdin closed、temp cleanup 完成。
10. **terminal**：只有当 cleanup 结果已知，才向 UI/Session Store 发布最终状态；若 cleanup 未完成，状态应是 `cleanup-failed` 或 `reaping`，不能伪装为 completed。

### 9.3 完成判定

`completed` 只表示命令 exit code 为 0 且：

- worker scope 已空；
- stdout/stderr 已 drain 并关闭；
- control channel 已关闭；
- timeout/abort timer 已清理；
- 临时目录已按策略删除或进入保留期；
- execution registry 已写 terminal state。

如果命令 code 为 0 但 scope 仍有后代进程，结果不能标记为普通完成，应标记为 `cleanup-failed`，并继续后台回收/报警。

---

## 10. 回收生命周期

### 10.1 正常结束

1. 收到 shell exit。
2. 停止接受新的 output，但继续 drain 已在管道中的数据。
3. 请求 worker scope 枚举/确认为空。
4. 关闭 stdin、control channel、timers 和 listeners。
5. 删除或保留 temp root。
6. 写入 `completed`/`failed` 和 cleanup summary。

### 10.2 用户取消

- TUI 的 AbortSignal 只能触发 supervisor `terminate(executionId, "user-abort")`。
- supervisor 向 worker 发 terminate；worker 向整个 scope 发送优雅信号。
- 等待 `KILL_GRACE_MS`（建议沿用当前 2 秒作为初始值，但以后按平台配置）。
- scope 未空时执行强杀；再确认 scope 为空。
- 结果以 `aborted` 为主状态；若回收失败，附带 `cleanup-failed` 标志或转入 recovery queue。

### 10.3 超时

超时分两类：

- **审批超时**：未 spawn，不存在 child cleanup；结果为 approval expired/denied。
- **运行超时**：已 spawn，必须执行完整 terminate → grace → kill → reap。

超时期间收到自然 exit 时，需要用一次确定性的状态优先级解决竞态：建议以先被 supervisor 观察到的 terminal cause 为主，并记录其他信号为 secondary cause。

### 10.4 supervisor/coderelay 退出

退出处理不能依赖 TUI 还存在：

1. supervisor 收到 SIGINT/SIGTERM 时停止接收新请求。
2. 对 active registry 发 terminate。
3. 在限定时间内等待各 scope reaping。
4. 无法回收时，把 scope id、pid、start time、nonce、temp root 写入 recovery journal。
5. 下次启动先恢复/清理 stale executions，再接受新任务。
6. recovery 过程中不根据旧 PID 直接 kill；先验证 marker、start time 或平台 scope owner。

如果产品未来支持“后台继续运行”，则必须显式选择 detached job 模式并拥有独立 job store；不能把 supervisor 崩溃后的孤儿进程误当成后台任务。

### 10.5 进程树脱离

#### Unix/macOS

- 低隔离模式：`detached` + 独立 process group，负 PID SIGTERM/SIGKILL。
- 问题：子进程可以 `setsid`、双重 fork 或转交给其他 supervisor，process group 不再覆盖全部后代。
- Linux 强隔离：使用 cgroup v2/systemd scope 或 container/pid namespace；以 cgroup empty 作为回收证据。
- macOS：优先使用受控 worker/container；process group 只能标为 best-effort，不能声明绝对清理。

#### Windows

- 优先使用 Job Object，设置 kill-on-job-close 和进程限制。
- 现有 `taskkill /t /f` 可作为兼容 fallback，但不应是长期唯一边界。
- WSL 进程必须同时追踪 Windows launcher、distro 内 Linux process scope 和 WSL shutdown 结果。

#### 容器

- 每次 worker 绑定独立 container/sandbox scope；终止时停止 scope，而不是只 kill shell PID。
- 资源限制必须在 container/cgroup 层设置，不能只依靠命令 timeout。
- 需要明确 volume、网络、凭据和临时目录映射；默认不挂载宿主机 home、SSH、cloud credentials。

### 10.6 资源回收清单

每次 execution 结束必须检查：

- shell/Agent child 是否退出；
- descendant scope 是否为空；
- stdout/stderr/control stream 是否关闭；
- stdin 是否 end；
- timeout/kill/approval timers 是否清理；
- Abort listener 是否移除；
- temp directory 是否删除或进入 TTL；
- 临时 socket、FIFO、lock、container、cgroup、Job Object 是否释放；
- audit 是否写入 terminal event；
- secrets 是否从日志、错误信息、command display 中脱敏；
- registry 是否不会保留 stale handle。

---

## 11. 与四个 CLI 的接入路线

### 11.1 第一阶段：整 Agent 粗粒度 worker

保持当前 adapter 的 prompt/exec 入口不变：

```text
coderelay supervisor
  └─ worker
      └─ codex exec / claude -p / pi -p / omp -p --mode json
          └─ Agent 自己执行 Bash/tool
```

这阶段能统一：

- Agent CLI 的 cwd、env、网络和文件边界；
- Agent 主进程及后代回收；
- 整个 execution 的 timeout/abort；
- 输出、审计和 session 结果。

但不能声称 coderelay 已经能逐条审批 Bash。四个 CLI 的 native approval 仍在 worker 内部生效，或在 headless 场景按各自 CLI 规则处理。

### 11.2 第二阶段：Pi RPC

- 把当前 `pi -p` 适配扩展为 `pi --mode rpc --no-session`；
- 由 supervisor 发送 JSONL prompt；
- 订阅 Bash execution update、agent_end/agent_settled、stderr；
- supervisor 负责 request id、deadline、cancel 和 child shutdown；
- 对 Pi permission extension 只做 native policy 的输入，不以此取代 worker sandbox。

### 11.3 第三阶段：OMP ACP/terminal

- 先确认本机 OMP 版本的 ACP/terminal schema；
- 把 approval request、bash/eval capability、terminal output 和 cancel 映射为 coderelay events；
- `eval` 与 `bash` 分开授权；
- 无交互 UI 时，prompt 不自动 allow，转为 approval-unavailable/denied；
- 外层 worker/container 仍然必须存在。

### 11.4 Codex 与 Claude Code

- 继续使用各自原生 sandbox/approval 作为 Agent 内部控制；
- coderelay 记录传入的 native flags、profile 和是否为 headless；
- worker policy 不得比 native policy 更宽；
- 后续如需要命令级统一审计，再增加官方结构化协议或受支持的 hook/adapter；
- 不通过 stdout regex 猜 Bash 命令，不把模型文本当作执行事实。

---

## 12. 分阶段实施计划

### Phase 0：合同与观测（先做）

范围：不改变默认执行行为，只建立统一类型和日志/测试合同。

- 建立 execution status、sandbox mode、approval decision 的 SSOT 常量。
- 统一 `AgentRunResult`、launcher result 和 legacy `ProcessResult` 的终止原因模型。
- 给每次执行增加 execution id、parent session/turn、target、cwd 摘要和 policy profile。
- 明确 secret redaction 和 output limit。
- 验收：现有 tests 全部通过；新增测试有非空 command/cwd/env/metadata，并断言边界值。

### Phase 1：Supervisor + Registry + 统一回收

- 把 `runAgentStream` 的 spawn、timeout、abort、stream drain 和 process-tree cleanup 提取为 supervisor 可调用的执行内核。
- 统一 interactive/captured/legacy 路径的生命周期语义；interactive TTY 作为明确的 unmanaged/native mode 标记。
- 引入 active registry 和 shutdown recovery journal。
- 先实现 Unix process group 与 Windows taskkill fallback，但把“是否可靠回收”作为字段记录。
- 验收：normal、abort、timeout、spawn error、stderr flood、grandchild、父进程退出各有测试。

### Phase 2：Ephemeral Worker + Platform Scope

- worker 进程接收 versioned JSONL request；control channel 与 command output 分离。
- Unix 使用 process group；Linux 增加 cgroup/container adapter；Windows 增加 Job Object adapter。
- WSL worker 明确记录 Windows launcher 与 Linux scope。
- 验收：worker 崩溃、scope 不为空、PID reuse、输出流未关闭、重复 terminate 均有可预测结果。

### Phase 3：Sandbox Profiles + Approval Broker

- 增加 `safe-read`、`workspace-write`、`reviewed-automation`。
- 增加 command parser/classifier、cwd canonicalization、network allowlist、resource caps。
- TUI 只负责呈现 approval request 和发送 decision；headless request 没有 UI 时 fail closed。
- 验收：allow/ask/deny、复合命令、重定向、管道、subshell、后台、网络域名、R3/R4/R5 边界测试。

### Phase 4：CLI 原生协议接入

优先级：

1. Pi RPC；
2. OMP ACP/terminal；
3. Codex/Claude 的官方结构化 hook/protocol（如果目标版本提供稳定支持）。

验收：每个 adapter 能把真正的工具 call、approval、tool result、abort、settled 映射到统一事件；无法提供命令级事件的 CLI 必须明确标记为 coarse-grained。

### Phase 5：生产化与治理

- 审计保留周期、敏感信息脱敏和用户可见 transcript 分离。
- 并发、队列、公平性、资源配额和恢复告警。
- sandbox capability 自检；硬隔离 profile 缺失时 fail closed。
- 文档化管理员策略和危险配置变更。

---

## 13. 测试策略

### 13.1 生命周期

- command 为空、cwd 不存在、cwd 越界、env 非法；
- spawn 前 abort；
- spawn 后立即 abort；
- 运行中 abort；
- timeout 与自然 exit 同时发生；
- SIGTERM 后正常退出；
- SIGTERM 不退出，2 秒后 SIGKILL；
- stdout/stderr 高频输出，验证无 pipe deadlock；
- 非零 exit、signal exit、worker 崩溃、控制通道断开；
- terminal event 重复、乱序、缺失；
- supervisor 重启后恢复 stale registry。

### 13.2 进程回收

- shell → child → grandchild；
- `sleep`/后台进程；
- `nohup`、`setsid`、双重 fork（验证 best-effort 与 hard boundary 的差异）；
- Linux cgroup/container scope empty；
- Windows Job Object/taskkill fallback；
- WSL Windows/ Linux 双层进程；
- PID reuse 防护；
- temp root、socket、lock 和 container cleanup。

### 13.3 权限与 parser

- R0/R1/R2/R3/R4/R5 各有真实非空命令样本；
- `cmd1 && cmd2`、管道、重定向、命令替换、子 shell、换行；
- `bash -c`、`sh -c`、`eval`、`xargs` 等 wrapper；
- allow/ask/deny 和第一匹配/最严格合并规则；
- `curl`/包管理器/SSH/云凭据环境；
- command text 中包含 token 时审计脱敏；
- 无 UI 的 ask 结果为 approval-unavailable/deny，而不是挂死。

### 13.4 Agent adapter

- Codex/Claude 保留 native flags 和 sandbox profile 的审计；
- Pi RPC：command id、Bash execution update、agent_settled、stdin close；
- OMP：bash 与 eval 分开、ACP rejection/cancel、headless prompt；
- 当前 prompt/text 模式明确没有 command metadata，不产生伪造 tool audit。

---

## 14. 风险与待决问题

1. **是否要求硬隔离？** 若要求防止任意宿主机读取，process group 不够，需要 container/VM/OS sandbox；这会影响安装、性能和跨平台支持。
2. **macOS 的长期进程边界选择什么？** Seatbelt/容器/worker process group 各有兼容性差异，必须实机验证。
3. **Windows 是否以 Job Object 为必选？** 若只用 taskkill fallback，无法把 cleanup 结果承诺为强一致。
4. **WSL 任务是否允许访问 Windows 文件？** 当前 path translation 只解决启动路径，不能自动等价为安全隔离。
5. **Agent native approval 与 coderelay approval 谁是最终裁决者？** 建议采用最严格合并，但要明确用户看到的提示来自哪一层。
6. **网络策略如何表达域名、IP、代理和 DNS？** 只过滤命令名不够，必须在 sandbox/network 层执行。
7. **是否允许后台服务？** 如果允许，必须单独建模 job/service lifecycle，不能复用 Bash one-shot。
8. **审计保留多久？** 命令、输出、环境和 prompt 可能包含源码/凭据，应设置默认 TTL 和脱敏策略。
9. **是否允许 `sudo`、root container、Docker socket、SSH agent forwarding？** 默认应 deny，并需要专门的部署方案。
10. **四个 CLI 的版本差异如何兼容？** 适配器应按 capability probe 选择协议，不根据名称假设版本行为。

---

## 15. 推荐的最小落地顺序

如果只实施一条最小可行路径，建议如下：

1. 不改变当前 prompt UX；先把 `runAgentStream` 统一成唯一受控 execution kernel。
2. 先实现每次执行一个 ephemeral worker + Unix process group / Windows Job Object（taskkill 仅 fallback）。
3. 默认 profile 为 `workspace-write + network deny + no daemon + no privilege escalation`。
4. 让 UI 的 abort、timeout、`/new` 和进程退出都走 supervisor registry，而不是直接依赖 child 或 `flowSeq`。
5. 把 cleanup 结果加入最终结果；scope 未空不算成功完成。
6. 先接 Pi RPC 获取 command-level 事件，再评估 OMP ACP；Codex/Claude 暂时保持 native approval + 外层粗粒度 sandbox。
7. 完成 Phase 0–2 的测试后，再讨论是否要将 command-level approval schema 暴露给用户配置。

---

## 16. 参考资料

以下是本次调研使用的官方或项目主仓库资料：

- OpenAI Codex CLI：<https://developers.openai.com/codex/cli>
- Codex agent approvals & security：<https://learn.chatgpt.com/docs/agent-approvals-security>
- Claude Code permissions：<https://code.claude.com/docs/en/permissions>
- Claude Code sandboxing：<https://code.claude.com/docs/en/sandboxing>
- Pi documentation：<https://pi.dev/docs/latest>
- Pi security：<https://pi.dev/docs/latest/security>
- Pi RPC：<https://pi.dev/docs/latest/rpc>
- Pi main repository：<https://github.com/earendil-works/pi>
- OMP tool approvals：<https://omp.sh/docs/approvals>
- coderelay 当前架构文档：[`docs/architecture.md`](./architecture.md)
- coderelay 当前 TUI 方案：[`docs/cli-ui-plan.md`](./cli-ui-plan.md)

> 说明：外部 CLI 的 approval、sandbox、ACP/RPC 选项会随版本变化。实施前应针对本机安装版本重新运行 capability probe，并把版本、有效配置和 fallback 结果写入 audit metadata。
