# coderelay 架构文档

> 版本：v0.2.0（2026-09-16 整理，依据当前 `src/` 实际代码）
>
> 一句话：coderelay 是“编码任务路由器 + 启动器”——扫描本机已安装的编码 Agent CLI（codex / claude / pi / omp），按配置中的**规则 + 评分**选出最合适的 `agent:model`，然后在本机终端直接启动它。不带参数时进入交互式 TUI。

可交互架构图见 [assets/architecture.html](../assets/architecture.html)，静态图见 `assets/architecture-light.png` / `architecture-dark.png`。

---

## 1. 目录结构

```text
coderelay/
├── index.ts                  # 包入口：export * from ./src/index
├── src/
│   ├── index.ts              # 公开 API：models / scanner / adapters / launcher
│   ├── cli.ts                # commander 命令定义（run / agents / models / doctor）
│   ├── cli.tsx               # 无参数入口：挂载 Ink TUI（App）
│   ├── commands/             # 每个子命令的实现
│   │   ├── run.ts            # run：路由 + 启动 Agent 进程
│   │   ├── agents.ts         # agents：列出支持的 Agent 与安装状态
│   │   ├── models.ts         # models：列出配置中的模型与路由默认值
│   │   └── doctor.ts         # doctor：配置 / 规则 / CLI 健康检查
│   ├── config/               # 声明式配置
│   │   ├── schema.ts         # Zod 全量 schema + defaultConfig()
│   │   └── loader.ts         # 配置发现与加载（向上查找）
│   ├── scanner/              # 本机 CLI 探测
│   │   └── cli-scanner.ts    # which/where + --version 探测
│   ├── agents/               # 适配器层
│   │   ├── adapter.ts        # AgentAdapter（buildArgs 核心，交互模式用）
│   │   ├── capabilities.ts   # 统一能力协议：CliCapabilities / ProbeResult
│   │   ├── model-catalog.ts  # 并行探测 + 统一模型目录（config 只叠加元数据）
│   │   ├── cli-adapters.ts   # 4 个 CLI 适配器（probeModels/能力/参数/事件解析）
│   │   ├── codex.ts          # Codex 专属适配器（当前透传通用实现）
│   │   ├── claude.ts         # Claude 专属适配器（当前透传通用实现）
│   │   └── registry.ts       # AGENT_REGISTRY / getAgentAdapter()
│   ├── models/               # 共享类型
│   │   ├── agent-events.ts   # 统一事件流（9 种事件 + 结构化解析 + 摘要）
│   │   ├── cli.ts            # CliId / DetectedCli / CliAdapter（含能力协议扩展）
│   │   ├── types.ts          # ModelStrength / ModelCost / parseModelRef 等
│   │   └── session.ts        # SessionRecord / SessionTurn
│   ├── router/               # 路由决策
│   │   ├── router.ts         # route() / buildRouteCandidates() / selectCandidate()
│   │   ├── rules.ts          # 规则匹配（keywords/patterns/language/files/长度）
│   │   ├── scorer.ts         # 评分（strength/default/cost/context + 关键词推断）
│   │   └── types.ts          # RouteRequest / Candidate / Decision / Strategy
│   ├── runtime/              # 进程执行
│   │   ├── process.ts        # Bun.spawn 封装（capture/stream/超时/Abort，短命令用）
│   │   ├── agent-run.ts      # 统一 prompt 生命周期 runAgentStream（事件流/进程组/取消）
│   │   └── launcher.ts       # launchInteractive（TTY 交互）/ 旧捕获版启动（兼容保留）
│   ├── session/              # 跨 CLI 会话记忆（bun:sqlite）
│   │   ├── store.ts          # sessions + turns 表，保留最近 20 个会话
│   │   └── context.ts        # buildPromptWithContext：历史 transcript 注入
│   └── ui/                   # Ink TUI
│       ├── App.tsx           # 屏状态机 + 统一 8 态 AgentPhase（idle/probing/selecting/…）
│       ├── theme.ts          # 视觉 token（液态玻璃浅色主题）
│       ├── ink-theme.ts      # Ink 主题适配
│       ├── slash-commands.ts # /model /activate /new 等聊天命令
│       └── components/       # AppHeader / StageBar / CliList / ScanningView / ChatView / HintBar
├── tests/                    # bun test（scanner/launcher/adapters/session/ui/agent-run/model-catalog/ui-phase + mock-cli fixture）
├── docs/
│   ├── architecture.md       # 本文档
│   ├── cli-ui-plan.md        # TUI 详细设计（视觉 token / 页面流 / 会话层）
│   └── codex等cli接入方式.md  # 各 CLI 检测与接入指南
├── assets/                   # 架构图（html/png）
└── .coderelay/               # 运行时数据：config.yaml + sessions.db（跟随仓库）
```

---

## 2. 分层架构

```text
┌─────────────────────────────────────────────────┐
│ 入口层  src/cli.ts · src/cli.tsx                 │  commander 解析 / Ink 挂载
├─────────────────────────────────────────────────┤
│ 命令层  src/commands/                           │  run / agents / models / doctor
├──────────┬──────────────┬────────────────────────┤
│ 配置层    │ 扫描层        │ 路由层                  │
│ config/  │ scanner/     │ router/                │  决策输入
├──────────┴──────────────┴────────────────────────┤
│ 适配器层  src/agents/                            │  agent:model → argv
├─────────────────────────────────────────────────┤
│ 运行时层  src/runtime/                           │  Bun.spawn 启动子进程
├─────────────────────────────────────────────────┤
│ 会话层    src/session/  + 展示层 src/ui/          │  记忆 + TUI
└─────────────────────────────────────────────────┘
基础类型：src/models/（cli / types / session）
```

依赖方向（单向，无环）：

`ui / commands → router + agents + scanner + session → config + models`
`agents → models`，`runtime → models`，`session → config(loader)`，谁都不反向依赖 `commands` / `ui`。

---

## 3. 入口层与命令层

### 3.1 CLI 定义（`src/cli.ts`）

- `coderelay run [prompt...]`：完整路由 → 启动。选项：`-a/--agent`、`-m/--model`（`agent:model` 形式）、`-C/--cwd`、`-c/--config`、`--file`（可重复）、`--lang`、`--context-size`、`--strength`（可重复，取值见 `MODEL_STRENGTHS`）、`--timeout`。
- `coderelay agents | models | doctor`：诊断类命令，共享 `-C/--cwd`、`-c/--config`。
- `coderelay` 无参数 → `src/cli.tsx` 挂载 Ink `App`，进入交互式 TUI（扫描 → 选择 → 写任务 → 执行 → 结果）。`cr` 为同功能快捷别名。

### 3.2 run 命令（`src/commands/run.ts`）

流程（显式指定时跳过路由，但仍走统一探测校验）：

1. `loadConfig({ cwd, path })` 读配置（缺失则用内置默认值）。
2. `scan()` 探测本机 CLI 安装状态 → `probeModelCatalog()` 对已安装且启用的 CLI 并行探测模型/能力（事实来源是 CLI 原生配置，失败带 `reason` 且禁止执行）。
3. 若有 `--agent/--model` → `validateExplicitTarget()` 校验目标确实存在于探测结果（不存在/不可探测直接报可读错误，不静默回退）；否则用 `toRouteCandidates()` 把已探测模型 + 配置元数据交给 `route()`（`rules/score/hybrid` 策略不变）。
4. 目标 CLI 优先用原生 resume 恢复会话（`buildPromptArgs` 携带 `nativeSessionId`）；不支持时用 `buildPromptWithContext()` 做 transcript 注入；跨 CLI 切换一律 transcript 注入。
5. `adapter.buildPromptArgs()` 组装 argv → `stderr` 打印 `coderelay: routing to …`。
6. `runAgentStream({ cmd, protocol, onEvent, signal, timeoutMs })` 启动子进程并消费统一事件流（stdout 实时透出，非零退出/超时/取消分别给出诊断并透出退出码）。

---

## 4. 配置层（`src/config/`）

### 4.1 Schema（`schema.ts`，Zod 全量校验、字段全可省略）

- `Config{ version: 1, defaultAgent: "codex", defaultModel?, agents: Record<string, AgentConfig>, routing }`
- `AgentConfig{ enabled, activationDecided, command?, models: ModelConfig[], extraArgs?, env? }`
- `ModelConfig{ id, label?, strengths: ModelStrength[], cost?: 1–5, default? }`
- `RouteRule{ name, priority（默认 0）, when?: RuleWhen, use: RuleUse }`
- `RuleWhen{ keywords?, patterns?（正则，i 匹配）, languages?, files?（glob）, minPromptLength?, maxPromptLength? }`
- `RuleUse{ agent?, model? }`（都省略即 catch-all）
- `RoutingConfig{ strategy: hybrid | rules | score（默认 hybrid）, rules: RouteRule[], weights{ strength, rule, default, cost, context } }`，默认权重 `{ strength: 1, rule: 1, default: 2, cost: 0.5, context: 1 }`。

### 4.2 加载（`loader.ts`）

查找顺序（从 `cwd` 向上，命中最近者；`-c` 显式路径时跳过发现）：

1. `.coderelay/config.yaml`
2. `.coderelay/config.yml`
3. `coderelay.config.yaml`
4. `coderelay.config.yml`

找不到时返回 `defaultConfig()`（`usedDefaults: true`，`path: null`）。YAML 解析失败 / Zod 校验失败抛 `ConfigError`（带 path + cause）。

### 4.3 激活决策（`activation.ts` + `loader.ts` 写路径）

`enabled` 是最终生效状态，但默认为 `true`，单靠它分不清「用户没答过」和「用户主动开启」。因此 `AgentConfig` 增加 `activationDecided`，只用于判断是否还需要询问：

- 需要询问 ⇔ `available === true && activationDecided !== true && enabled !== false`。
- 显式写下 `enabled: false` 本身就等于表过态，即使没有 `activationDecided`。

`toActivationOptions(detected, config)` 把扫描结果与配置合成每个 CLI 一行（`{ cliId, available, enabled, decided }`）；`activationConfirmTargets` 只取「可用且未决」（首次激活页），`activationManageTargets` 取全部（`/activate` 管理页）。

`saveActivationDecisions(decisions, { cwd?, path? })` 是配置的唯一写路径，默认写 `<cwd>/.coderelay/config.yaml`：

- **读原始 YAML 对象再合并**，而不是从解析后的 `Config` 重新序列化——`models` / `routing` / `extraArgs` / `env` 以及本版本 schema 不认识的键都原样保留。
- 只对 `agents.<cliId>` 合并 `{ enabled, activationDecided: true }`，其余内容一字不动。
- 用 `yaml` 包的 `stringify`（块状输出，便于用户手改）；`Bun.YAML.stringify` 只产 flow 风格的单行，不做此用。
- 解析失败 / 非 mapping 时抛 `ConfigError` 且不覆盖原文件。

---

## 5. 扫描层（`src/scanner/cli-scanner.ts`）

- 对 `CLI_IDS = [codex, claude, pi, omp]` 逐个探测：
  - `resolveOnPath(bin)`：POSIX 用 `which`，Windows 用 `where`（超时默认 3s）。
  - `getCliVersion(path)`：依次试 `DEFAULT_VERSION_ARGS = [--version, -v, -V]`（超时默认 5s），取 stdout（为空则取 stderr）首个非空行。
- 产物 `DetectedCli{ id, bin, path, version, available }`。全部依赖（`execFile` / `access` / `platform` / `homeDir` / `env`）经 `ScannerOptions` 注入，便于测试。
- `doctor` 在此基础上叠加配置 `command` 覆盖解析：已配置 `command` 且能 resolve 即视为可用（version 仅当路径与探测一致时沿用）。

---

## 6. 适配器层（`src/agents/` + `src/models/cli.ts`）

两级设计：

| 层级 | 类型 | 职责 |
|---|---|---|
| 底层 CLI 元数据 | `CliAdapter`（`cli-adapters.ts` 构造） | `bin`、`configDir`、`interactiveArgs`、`promptArgs(prompt)`、`versionArgs` |
| 上层 Agent 适配 | `AgentAdapter`（`adapter.ts` 构造） | `buildArgs({ model?, prompt?, extraArgs? })`：`--model <m>` + `extraArgs` + `promptArgs(prompt)` / `interactiveArgs` |

当前 4 个 CLI 的差异只在 `promptArgs` / `configDir`：

- `codex`：`promptArgs = ["exec", prompt]`（裸 `codex <prompt>` 是交互式 TUI，capture 下会报 `stdin is not a terminal`，故必须走 `exec` 子命令）；`configDir = ~/.codex`。
- `claude`：`promptArgs = ["-p", prompt]`；`configDir = $CLAUDE_CONFIG_DIR || ~/.claude`。
- `pi`：`promptArgs = ["-p", prompt]`；`configDir = ~/.pi/agent`。
- `omp`：`promptArgs = ["-p", prompt]`；`configDir = ~/.omp`。

`registry.ts` 提供 `createAgentRegistry(options)`（测试/嵌入用）与默认单例 `AGENT_REGISTRY`，`getAgentAdapter(id)` 做 id 校验。`codex.ts` / `claude.ts` 目前是具名透传（保留专属适配扩展点，pi/omp 直接用通用 `createAgentAdapter`）。

新增一个 Agent 的改动点：`models/cli.ts` 加 id（`CLI_IDS` / `CLI_DEFINITIONS`）→ `cli-adapters.ts` 加一条 → `registry.ts` 注册 → 补 scanner/doctor/launcher 测试。

---

## 7. 路由层（`src/router/`）

### 7.1 输入输出（`types.ts`）

- 输入 `RouteRequest{ prompt, files?, language?, contextSize?, requiredStrengths? }`。
- 候选 `RouteCandidate{ agent, model?, label?, strengths, cost?, isDefault }`，由 `buildRouteCandidates(config, { availableAgents })` 从配置生成：只保留 `enabled` 且已安装的 agent；无 models 的 agent 用顶层 `defaultModel` 回退出一个候选；按 `agent:model` 去重。
- 输出 `RouteDecision{ agent, model?, candidate, strategy, score, ruleMatches, reasons, matchedRule? }`。三种策略 `RoutingStrategy = rules | score | hybrid`。

### 7.2 规则匹配（`rules.ts`）

- `matchesRule`：`when` 缺省即命中；`keywords`（大小写不敏感包含，任一命中）、`patterns`（任一正则 `i` 命中）、`languages`（精确相等，大小写不敏感）、`files`（任一 glob 命中任一请求文件，`globToRegExp` 支持 `*`/`?`/`**`）、`minPromptLength`/`maxPromptLength` 之间是 **AND** 关系。
- `matchRules` 按 `priority` 降序、原顺序稳定排列返回 `RuleMatch[]`。
- `ruleMatchesCandidate`：`use.agent` / `use.model` 仅做过滤（不匹配即排除）。

### 7.3 评分（`scorer.ts`）

`scoreCandidate = strength 加分 + rule 加分 + default 加分 + context 加分 − cost 惩罚`：

- `strength`：`inferStrengths()` 先合并显式 `requiredStrengths`，再按 prompt 关键词推断（coding/reasoning/long-context/tool-use/fast/cheap/creative/multimodal 各有一组英文关键词；`contextSize ≥ 100k` 强制加 `long-context`），命中数 × `weights.strength`。
- `rule`：命中该候选的规则数 × `weights.rule`。
- `default`：`isDefault` 为真加 `weights.default`（默认 2，权重最大——无明确赢家时兜底）。
- `cost`：`(cost − 1) × weights.cost` 做惩罚，无 cost 不扣。
- `context`：需要长上下文（推断出 `long-context` 或 `contextSize ≥ 100k`）且候选带 `long-context` 时加 `weights.context`。
- `compareScores` 排序：分数降序 → 规则命中数 → default 优先 → `agent:model` 字典序，保证确定性。

### 7.4 策略（`router.ts` 的 `route()`）

- `rules`：按优先级遍历命中规则，取首个“有可用候选”的规则，在其候选内按评分取最优；全无命中则对默认候选评分回退（strategy 记 `rules`）。
- `score`：忽略规则纯评分取最优。
- `hybrid`（默认）：全候选评分（规则以加分形式参与），最优者若带规则命中则附 `matchedRule`。
- `selectCandidate(candidates, agent?, model?)`：显式 `--agent/--model` 路径，不算分，只做过滤 + 默认优先。

---

## 8. 运行时层（`src/runtime/`）

### 8.1 `agent-run.ts`（统一 prompt 生命周期，prompt 执行的唯一出口）

- `runAgentStream({ cmd, cwd, env, signal, timeoutMs, protocol, parseChunk?, onEvent })` → `{ child, done, abort }`：
  - `stdio: [pipe, pipe, pipe]`，stdout/stderr 实时消费（防缓冲区死锁）；`protocol: "structured"` 优先结构化事件流，解析失败回退文本事件 + 诊断 `status`，不丢用户可见输出；JSON 按流缓存残行，跨 chunk 拼接。
  - 状态：`completed`（零退出）/ `failed`（非零退出或信号）/ `timeout`（`timeoutMs` 到时）/ `aborted`（`abort()` 或外部 signal）/ `spawn-error`（启动失败）。
  - 取消语义 = 终止整个进程组：Unix 独立进程组（`detached`）先 `SIGTERM`，2s 后 `SIGKILL`；Windows 用 `taskkill /pid /t /f`；随后关闭 stdin、解绑全部监听器。
  - 结束统一结算：`AgentRunResult{ status, code, signal, durationMs, timedOut, text（事件摘要）, stderrTail（8k 截尾）, events }`。
- 适配器通过 `parseOutputChunk(chunk, source)` 声明文本解析器；`src/models/agent-events.ts` 提供 `parseStructuredLine` + `summarizeEvents`，事件共 9 种：`session_started / status / assistant_text / tool_started / tool_finished / stderr / completed / failed / aborted`。

### 8.2 `process.ts`（基于 `Bun.spawn`，短命令出口）

- `runProcess({ cmd, cwd, env, input?, mode = "capture", signal?, timeoutMs? })`：
  - `capture` 静默收集 stdout/stderr；`stream` 边收集边镜像到父终端。
  - `timeoutMs` 到时 kill（`timedOut: true`），`signal` abort 时 kill（`aborted: true`），返回统一 `ProcessResult{ cmd, code（信号杀死时 −1）, signal, stdout, stderr, durationMs, timedOut, aborted, ok }`。
  - `cmd` 为空直接抛错；非零退出不抛错（由调用方解读），另有带 `result` 的 `ProcessError` 供需要抛错的场景。

### 8.3 `launcher.ts`（TTY 交互模式 + 旧捕获版兼容保留）

- `launchInteractive(adapter | binPath)`：`interactiveArgs + extraArgs`，`stdio: inherit`（TTY 透传，Windows 下 `shell: true`）。
- `launchWithPrompt(adapter, prompt, …)`：`buildPromptArgs = promptArgs(prompt) + extraArgs`，同样 `inherit`（`run` 命令走此路径）。
- `launchWithPromptCaptured(…)`（兼容保留）：`stdio: [ignore, pipe, pipe]`，捕获输出尾部；新 prompt 执行路径已迁移到 `runAgentStream`。
- `runOnce({ timeoutMs, maxBuffer, … })`：`execFile` 一次性执行（scanner/version 类短命令用）。
- `spawn` / `execFile` / `platform` 经 `LauncherDependencies` 注入，默认取 Node `child_process` 与 `process.platform`。

输出边界约定：Agent 进程输出走统一事件流（TUI 渲染 / `run` 写 stdout）；coderelay 自身的路由与诊断信息只写 stderr；`--timeout` 触发统一进程组终止流程。交互式原生 CLI 模式（`tab`）暂不纳入结构化事件流：仍走“卸载 Ink → 继承 stdio → 退出后重挂载”。

---

## 9. 会话层（`src/session/`，`bun:sqlite`）

- `store.ts`：库文件 `<cwd>/.coderelay/sessions.db`（跟随仓库，跨 CLI 共享同一份事实），WAL 模式。
  - `sessions(id, cli_id, title, created_at, updated_at)`，`title` 取首条 prompt 前 60 字符。
  - `turns(id, session_id, cli_id, prompt, output, exit_code, signal, duration_ms, created_at)`，`(session_id, id)` 索引。
  - 启动时按 `updated_at` 保留最近 `SESSION_RETENTION = 20` 个会话，多余连同轮次删除。
- `context.ts`：`buildPromptWithContext()` 把历史轮次拼成 transcript 注入新 prompt 之前，实现跨 CLI 上下文继承（不依赖各 CLI 原生会话）：单轮输出留尾 1.5k 字符、总预算 8k 字符，超限从最旧轮丢弃。
- 上下文策略：同 CLI 优先原生 resume（`buildPromptArgs` 携带 `nativeSessionId`）；目标 CLI 不支持原生恢复或发生 CLI 切换时，用 transcript 注入；每轮落盘记录 `modelId / protocol / reusedNative / status / eventSummary / contextSource`，UI 标记“原生会话”或“transcript 上下文”。

---

## 10. 展示层 TUI（`src/ui/`，Ink + React）

状态机（`App.tsx` 的 `AgentPhase`）：`idle / probing / selecting / activating / starting / running / completed / failed / aborted`。

- `probing`：`phaseBanner` 显示 4 个 CLI 独立探测行（`扫描中 / 已找到 / 无法探测 / 未安装`），失败行附 `reason`。
- `activating`：扫描完成后的分支点——若存在「可用且未决」的 CLI 进首次激活页（`activationConfirmTargets`），否则直接进模式页；`/activate` 走同一屏但用管理页（`activationManageTargets`，含全部 CLI，未安装行不可切换）。Enter 写盘并刷新内存配置，Esc 不写盘。
- `selecting`：两段式选择器，先 CLI 后模型；CLI 步列出全部 4 个 CLI 及其探测状态，光标只停在被探测到的 CLI 上（已安装但探测失败、以及已禁用的 CLI 只显示不可进入），模型步只渲染 `option.cliId === pickedCliId` 的候选。键盘上下选择，不可用候选不可提交。
- `starting`：显示 `正在启动 <cli>:<model>`，等待子进程建立通信（`session_started` 前）。
- `running`（`ChatView` 常驻对话区）：保留等待动画，实时显示 `assistant_text`，显示当前 `status`；工具调用只显示简化状态（`正在执行工具：xxx`），参数默认不展开；已输出内容保留，不等整轮结束再渲染。
- `completed`：终端行显示最终输出和退出信息（绿色），落盘 SQLite（含 `eventSummary`），回到 `idle` 允许继续输入下一轮。
- `failed` / `aborted`：终端行明确区分启动失败（`spawn-error`）、CLI 失败（`failed`，非零退出）、超时（`timeout`）和用户取消（`aborted`），显示可读诊断，不残留 `running` 状态。

键盘约定：

- `Enter`：提交 prompt，默认走自动路由（已探测模型候选 + 配置元数据）；激活页为「保存」。
- `/model`：打开两段式 CLI + 模型选择器（`selecting`）；`Esc` 从模型步退回 CLI 步，在 CLI 步才取消。
- `/activate`：打开激活管理页（`activating`），可逐个启用/禁用 CLI，保存到 `.coderelay/config.yaml`。
- `Esc`（返回键）：退回上一层——`detail` / `chat` 回 CLI 列表、CLI 列表回首屏、模型选择器退一步（模型步→CLI 步，CLI 步才取消）、激活页取消（不写盘）；`probing` 取消探测；`starting` / `running` 中止当前任务回到输入态。首屏没有上一层，`Esc` 不做事。
- `Ctrl-C`（相位感知，退出键）：`idle`（首屏 / CLI 列表 / 对话区 / 未就绪页）退出 coderelay；`probing` / `selecting` / `activating` 取消当前操作；`starting` / `running` 经 `abort()` 终止整个子进程组并记 `aborted`——执行中不退出程序，避免把 agent 子进程留成孤儿进程。`q` 不再是退出键。
- `/new`：清理当前会话上下文并创建新会话（`slash-commands.ts`）。
- `tab` 交互模式（保留兼容）：Ink 先卸载、子进程继承 stdio 完整接管终端（REPL 需要 TTY），退出后重挂载；此模式暂不纳入结构化事件流，输出不写入会话。

自动路由只从「已激活且探测成功」的 CLI 的可用模型里选（`probeModelCatalog` 把 `enabled: false` 标成 `disabled` / `models: []`，`toRouteCandidates` 再过滤 `available`）；候选保留各自归属的 CLI，同名模型在不同 CLI 下是两条独立候选。全部 CLI 被禁用是合法状态，此时提示「暂无已激活 CLI，输入 /activate 启用后重试」，不自动恢复任何 CLI。

`AppHeader` / `StageBar` / `HintBar`：品牌、步骤、快捷键提示。视觉 token 见 `theme.ts` 与 `docs/cli-ui-plan.md` 第 3 节（三色信号灯语义：粉 = 当前位置唯一色块，蓝 = 可操作，绿 = 单字符状态信号）。

---

## 11. 诊断命令

- `agents`：逐个 CLI 输出可用性 + 路径 + 版本（未安装标不可用）。
- `models`：输出配置中的模型、`defaultAgent` / `defaultModel`。
- `doctor`（`buildDoctorReport`）：检查项含 config 是否加载、default agent 是否合法启用、未知 agent id、重复 model id、每条 rule 的目标 agent/model 是否存在且启用、每个 CLI 是否可 resolve。状态分 `ok / warn / error`。

---

## 12. 测试与开发

```bash
bun install
bun test            # tests/：cli-scanner / launcher / cli-adapters / session / ui-app / agent-run / model-catalog / ui-phase / activation / config-activation / ui-activation / ui-model-isolation
bun run typecheck   # tsc --noEmit
bun run dev         # 本地跑 CLI（bun src/cli.tsx）
```

`tests/fixtures/mock-cli.mjs` 为模拟 CLI：覆盖分块输出、工具状态、`split-json` 跨 chunk、`invalid-json` 回退、非零退出、`sleep` 超时、`child` 进程树取消、`stderr-flood` 流背压与流结束清理。

仓库规范（`AGENTS.md`）：禁止 `any` 类型；最小改动原则；拿不准的好功能先和用户讨论再实现。

---

## 13. 已知简化与扩展点

1. `codex.ts` / `claude.ts` 当前只是具名透传，`--model` 参数对 4 个 CLI 一视同仁；若某 CLI 模型 flag 不同，需在此分叉。
2. 评分关键词全为英文，中文 prompt 主要靠显式 `--strength` / `--lang` / `--file` 与规则补足。
3. TUI 的 `tab` 交互模式输出不进会话层（TTY 透传无法捕获），只有 `↵` prompt 模式可回放；prompt 模式统一走 `runAgentStream` 事件流（TUI 渲染 / `run` 写 stdout），`tab` 模式仍走继承 stdio 兼容路径。
4. `doctor` 只返回第一页式检查，不做自动修复；`init` 占位（`configDirFor` 已预留“按需创建配置目录”语义）。
