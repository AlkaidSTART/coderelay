# coderelay 架构文档

> 版本：v0.1.6（2026-09-16 整理，依据当前 `src/` 实际代码）
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
│   │   ├── adapter.ts        # AgentAdapter（buildArgs 核心）
│   │   ├── cli-adapters.ts   # 4 个 CLI 的底层元数据（bin/configDir/promptArgs）
│   │   ├── codex.ts          # Codex 专属适配器（当前透传通用实现）
│   │   ├── claude.ts         # Claude 专属适配器（当前透传通用实现）
│   │   └── registry.ts       # AGENT_REGISTRY / getAgentAdapter()
│   ├── models/               # 共享类型
│   │   ├── cli.ts            # CliId / DetectedCli / CliAdapter / SpawnRunner 等
│   │   ├── types.ts          # ModelStrength / ModelCost / parseModelRef 等
│   │   └── session.ts        # SessionRecord / SessionTurn
│   ├── router/               # 路由决策
│   │   ├── router.ts         # route() / buildRouteCandidates() / selectCandidate()
│   │   ├── rules.ts          # 规则匹配（keywords/patterns/language/files/长度）
│   │   ├── scorer.ts         # 评分（strength/default/cost/context + 关键词推断）
│   │   └── types.ts          # RouteRequest / Candidate / Decision / Strategy
│   ├── runtime/              # 进程执行
│   │   ├── process.ts        # Bun.spawn 封装（capture/stream/超时/Abort）
│   │   └── launcher.ts       # launchInteractive / launchWithPrompt / 捕获版启动
│   ├── session/              # 跨 CLI 会话记忆（bun:sqlite）
│   │   ├── store.ts          # sessions + turns 表，保留最近 20 个会话
│   │   └── context.ts        # buildPromptWithContext：历史 transcript 注入
│   └── ui/                   # Ink TUI
│       ├── App.tsx           # 屏状态机：scanning → mode → picker → chat/detail
│       ├── theme.ts          # 视觉 token（液态玻璃浅色主题）
│       ├── ink-theme.ts      # Ink 主题适配
│       ├── slash-commands.ts # /model /new /exit 等聊天命令
│       └── components/       # AppHeader / StageBar / CliList / ScanningView / ChatView / HintBar
├── tests/                    # bun test（scanner/launcher/adapters/session/ui）
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

流程（显式指定时跳过路由）：

1. `loadConfig({ cwd, path })` 读配置（缺失则用内置默认值）。
2. `scan()` 探测本机 CLI → `availableAgents()` 算出可用集合。
3. 若有 `--agent/--model` → `explicitTarget()` 直接定目标；否则构造 `RouteRequest{ prompt, files, language, contextSize, requiredStrengths }` 调 `route()`。
4. 校验目标 agent 已启用且已安装 → `getAgentAdapter()` 取适配器。
5. `resolveExecutable()` 定可执行路径（配置 `command` 覆盖优先，否则用扫描到的 `DetectedCli.path`）。
6. `adapter.buildArgs({ model, prompt, extraArgs })` 组装 argv → `stderr` 打印 `coderelay: routing to …`。
7. `run({ cmd, cwd, env, mode: "stream", signal, timeoutMs })` 启动子进程，透传 TTY；超时 / 信号 / 非零退出码分别给出诊断并透出退出码。

---

## 4. 配置层（`src/config/`）

### 4.1 Schema（`schema.ts`，Zod 全量校验、字段全可省略）

- `Config{ version: 1, defaultAgent: "codex", defaultModel?, agents: Record<string, AgentConfig>, routing }`
- `AgentConfig{ enabled, command?, models: ModelConfig[], extraArgs?, env? }`
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

### 8.1 `process.ts`（基于 `Bun.spawn`，唯一的外部进程出口）

- `runProcess({ cmd, cwd, env, input?, mode = "capture", signal?, timeoutMs? })`：
  - `capture` 静默收集 stdout/stderr；`stream` 边收集边镜像到父终端。
  - `timeoutMs` 到时 kill（`timedOut: true`），`signal` abort 时 kill（`aborted: true`），返回统一 `ProcessResult{ cmd, code（信号杀死时 −1）, signal, stdout, stderr, durationMs, timedOut, aborted, ok }`。
  - `cmd` 为空直接抛错；非零退出不抛错（由调用方解读），另有带 `result` 的 `ProcessError` 供需要抛错的场景。

### 8.2 `launcher.ts`（spawn 语义封装 + 可注入）

- `launchInteractive(adapter | binPath)`：`interactiveArgs + extraArgs`，`stdio: inherit`（TTY 透传，Windows 下 `shell: true`）。
- `launchWithPrompt(adapter, prompt, …)`：`buildPromptArgs = promptArgs(prompt) + extraArgs`，同样 `inherit`（`run` 命令走此路径）。
- `launchWithPromptCaptured(…)`：`stdio: [ignore, pipe, pipe]`，捕获输出尾部（默认每路 20k 字符，防长任务吃满内存），供 TUI prompt 模式渲染。
- `runOnce({ timeoutMs, maxBuffer, … })`：`execFile` 一次性执行（scanner/version 类短命令用）。
- `spawn` / `execFile` / `platform` 经 `LauncherDependencies` 注入，默认取 Node `child_process` 与 `process.platform`。

输出边界约定：Agent 进程输出走 stdout/TTY 直接透传；coderelay 自身的路由与诊断信息只写 stderr；`--timeout` 到时终止子进程并报超时。

---

## 9. 会话层（`src/session/`，`bun:sqlite`）

- `store.ts`：库文件 `<cwd>/.coderelay/sessions.db`（跟随仓库，跨 CLI 共享同一份事实），WAL 模式。
  - `sessions(id, cli_id, title, created_at, updated_at)`，`title` 取首条 prompt 前 60 字符。
  - `turns(id, session_id, cli_id, prompt, output, exit_code, signal, duration_ms, created_at)`，`(session_id, id)` 索引。
  - 启动时按 `updated_at` 保留最近 `SESSION_RETENTION = 20` 个会话，多余连同轮次删除。
- `context.ts`：`buildPromptWithContext()` 把历史轮次拼成 transcript 注入新 prompt 之前，实现跨 CLI 上下文继承（不依赖各 CLI 原生会话）：单轮输出留尾 1.5k 字符、总预算 8k 字符，超限从最旧轮丢弃。

---

## 10. 展示层 TUI（`src/ui/`，Ink + React）

状态机（`App.tsx`）：`scanning → mode → picker → chat ⇄ detail`，另有 `tab` 交互模式与 `esc` 返回。

- `scanning`（`ScanningView`）：展示 CLI 探测进度。
- `mode`：自动路由（根据任务并结合本机 CLI 自动选择合适的 CLI，当前先用首个可用 CLI 直进 chat）/ 手动（进 picker）。
- `picker`（`CliList`）：CLI 列表 + 未安装详情。
- `chat`（`ChatView`，常驻对话区）：多轮输入、加载态、每轮输出渲染在同一块圆角玻璃板，输入框常驻板底。
  - `↵` prompt 模式：UI 保持挂载，`launchWithPromptCaptured` 捕获输出 → 写会话 → 板内渲染；`ctrl+c` 经 `onAbort` 发 SIGTERM 中止。
  - `tab` 交互模式：Ink 先卸载、子进程继承 stdio 完整接管终端（REPL 需要 TTY），退出后重挂载；此模式输出不写入会话。
  - `/model` 切换 agent 后靠 `buildPromptWithContext` 继承上下文；`slash-commands.ts` 提供 `/model`、`/new`、`/exit` 等。
- `AppHeader` / `StageBar` / `HintBar`：品牌、步骤、快捷键提示。视觉 token 见 `theme.ts` 与 `docs/cli-ui-plan.md` 第 3 节（三色信号灯语义：粉 = 当前位置唯一色块，蓝 = 可操作，绿 = 单字符状态信号）。

---

## 11. 诊断命令

- `agents`：逐个 CLI 输出可用性 + 路径 + 版本（未安装标不可用）。
- `models`：输出配置中的模型、`defaultAgent` / `defaultModel`。
- `doctor`（`buildDoctorReport`）：检查项含 config 是否加载、default agent 是否合法启用、未知 agent id、重复 model id、每条 rule 的目标 agent/model 是否存在且启用、每个 CLI 是否可 resolve。状态分 `ok / warn / error`。

---

## 12. 测试与开发

```bash
bun install
bun test            # tests/：cli-scanner / launcher / cli-adapters / session / ui-app
bun run typecheck   # tsc --noEmit
bun run dev         # 本地跑 CLI（bun src/cli.tsx）
```

仓库规范（`AGENTS.md`）：禁止 `any` 类型；最小改动原则；拿不准的好功能先和用户讨论再实现。

---

## 13. 已知简化与扩展点

1. `codex.ts` / `claude.ts` 当前只是具名透传，`--model` 参数对 4 个 CLI 一视同仁；若某 CLI 模型 flag 不同，需在此分叉。
2. 评分关键词全为英文，中文 prompt 主要靠显式 `--strength` / `--lang` / `--file` 与规则补足。
3. TUI 的 `tab` 交互模式输出不进会话层（TTY 透传无法捕获），只有 `↵` prompt 模式可回放。
4. `doctor` 只返回第一页式检查，不做自动修复；`init` 占位（`configDirFor` 已预留“按需创建配置目录”语义）。
