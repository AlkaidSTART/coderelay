# Rust Core + Tauri 迁移实施计划

> **执行要求：** 后续实现按任务顺序进行，每个任务先补测试，再写最小实现，完成验证后提交。

**目标：** 将 coderelay 从 Bun 优先的 CLI/TUI 产品迁移为桌面优先的 Rust Core + Tauri 2 产品，同时保留共享同一核心的轻量 CLI 与可演进 SDK。

**架构：** Rust workspace 提供唯一的扫描、配置、路由、执行与会话实现。Tauri 桌面端内嵌 `coderelay-core`，不再通过 Bun sidecar 运行核心；CLI 也直接链接同一核心。跨进程 SDK 通过版本化 `coderelay-protocol` 接入，后续需要跨客户端实时共享任务状态时再增加 `coderelayd`。

**技术栈：** Rust 1.95、Tauri 2、React 19、TypeScript、Bun、serde、clap、SQLite、Zod 仅保留在迁移期旧实现中。

---

## 1. 产品与架构决策

### 1.1 产品定位

- 桌面端是主产品，负责 Agent 发现、模型配置、任务编排、会话历史、运行监控和设置。
- CLI 是配套产品，负责自动化、CI、脚本调用、诊断和高级用户操作。
- Ink TUI 不再作为长期主界面；迁移完成后只保留必要命令，是否保留 TUI 单独评估。
- SDK 是控制平面的编程接口，不应要求桌面应用必须运行。

### 1.2 不可破坏的约束

1. `coderelay-core` 是业务事实的唯一实现，不允许桌面端和 CLI 各写一套扫描或路由。
2. 桌面端不启动 Bun sidecar，Tauri 进程直接调用 Rust core。
3. 前端不接收任意 argv 或 shell 命令，只能提交经过验证的领域请求。
4. 配置目录继续使用 `~/.coderelay`，迁移期必须兼容现有 `config.yaml` 和 `sessions.db`。
5. 所有枚举、合法取值集合和协议版本只能定义一次。
6. Rust 公共 API 禁止弱类型 `serde_json::Value` 扩散；协议边界允许 envelope 使用 JSON，但领域 API 必须使用具名类型。
7. 迁移期间旧 TypeScript 实现只能作为行为基准，不得新增与其重复的桌面业务逻辑。

### 1.3 目标目录

```text
Cargo.toml
rust-toolchain.toml
crates/
  coderelay-core/
  coderelay-protocol/
  coderelay-cli/
apps/
  desktop/
    package.json
    src/
    src-tauri/
src/                    # 迁移期旧 Bun 实现
tests/                  # 迁移期旧测试与行为基准
docs/plans/
```

未来按需求增加：

```text
crates/coderelay-daemon/   # 跨客户端任务共享需要时再引入
packages/sdk-ts/           # TypeScript 协议客户端
```

---

## 2. 分阶段实施

### Task 1：建立迁移基线

**Files:**
- Create: `docs/plans/2026-11-04-rust-tauri-migration.md`
- Keep: `src/**`
- Keep: `tests/**`

**Step 1：记录当前行为**

确认以下命令在迁移前全绿：

```bash
bun test
bun run typecheck
```

**Step 2：保存关键行为样本**

为扫描、路由、配置、Agent 事件和 WSL 路径转换挑选现有测试，作为 Rust 迁移的 fixture 来源。不要修改当前测试数据来迎合 Rust。

**Step 3：确定兼容版本**

- 产品版本：`0.3.2`
- 协议版本：`1`
- 配置 schema：沿用现有 YAML 字段名
- 数据库 schema：先只读兼容，迁移完成后再统一迁移入口

**验收：** 旧实现可运行，Rust 脚手架不改变现有 CLI 行为。

---

### Task 2：初始化 Rust workspace

**Files:**
- Create: `Cargo.toml`
- Create: `rust-toolchain.toml`
- Create: `crates/coderelay-core/Cargo.toml`
- Create: `crates/coderelay-core/src/lib.rs`
- Create: `crates/coderelay-protocol/Cargo.toml`
- Create: `crates/coderelay-protocol/src/lib.rs`
- Create: `crates/coderelay-cli/Cargo.toml`
- Create: `crates/coderelay-cli/src/main.rs`
- Create: `.gitignore` additions for `target/`

**Step 1：写核心 agent 目录测试**

```rust
#[test]
fn built_in_agents_are_non_empty_and_unique() {
    let agents = coderelay_core::supported_agents();
    assert!(!agents.is_empty());
    let unique: std::collections::HashSet<_> =
        agents.iter().map(|agent| agent.id).collect();
    assert_eq!(unique.len(), agents.len());
}
```

**Step 2：运行失败测试**

```bash
cargo test -p coderelay-core
```

预期：workspace 或 `supported_agents` 尚不存在。

**Step 3：实现最小 workspace**

`Cargo.toml` 使用 resolver 3、edition 2024，并把产品版本固定为 `0.3.2`。

`coderelay-core` 至少定义：

```rust
pub enum AgentId {
    Codex,
    Claude,
    Pi,
    Omp,
}

pub struct AgentDescriptor {
    pub id: AgentId,
    pub binary: String,
    pub display_name: String,
}
```

`coderelay-protocol` 至少定义：

```rust
pub const PROTOCOL_VERSION: u32 = 1;

pub struct RequestEnvelope {
    pub protocol_version: u32,
    pub request_id: String,
    pub method: String,
    pub params: serde_json::Value,
}
```

**Step 4：运行测试**

```bash
cargo test -p coderelay-core -p coderelay-protocol
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```

**验收：** Rust workspace 可编译，协议包有 JSON round-trip 测试，CLI 能输出内置 Agent 列表。

---

### Task 3：迁移领域模型与配置 schema

**Files:**
- Create: `crates/coderelay-core/src/config.rs`
- Create: `crates/coderelay-core/src/model.rs`
- Create: `crates/coderelay-core/src/routing.rs`
- Create: `crates/coderelay-core/tests/config_compat.rs`
- Reference: `src/config/schema.ts`
- Reference: `src/models/types.ts`
- Reference: `src/router/types.ts`

**Step 1：写兼容测试**

测试必须包含：

- `defaultAgent` 缺失时使用既有默认值。
- 合法 `local/manual/jev` 模式反序列化。
- 非法强度、模型成本、上下文窗口被拒绝。
- `strengths`、`cost`、`contextWindow` 有非空值透传。

**Step 2：实现具名类型**

Rust 使用 enum/newtype 表达所有枚举与合法集合：

```rust
pub enum RoutingMode {
    Local,
    Manual,
    Jev,
}

pub enum ModelStrength {
    Coding,
    Reasoning,
    LongContext,
    ToolUse,
    Fast,
    Cheap,
    Creative,
    Multimodal,
}
```

禁止在路由、CLI 和 Tauri 中重复硬编码这些值。

**Step 3：实现配置加载**

- YAML 使用 `serde_yaml` 或后续评估后的 YAML crate。
- 兼容项目级向上查找和全局 `~/.coderelay/config.yaml`。
- 配置错误必须带路径和字段上下文。
- 找不到配置时显式返回默认配置，不静默吞掉解析错误。

**验收：** 用旧测试中的合法/非法 YAML 运行 Rust 兼容测试，全部通过。

---

### Task 4：迁移路由引擎

**Files:**
- Create: `crates/coderelay-core/src/router/mod.rs`
- Create: `crates/coderelay-core/src/router/rules.rs`
- Create: `crates/coderelay-core/src/router/scorer.rs`
- Create: `crates/coderelay-core/tests/routing.rs`
- Reference: `src/router/router.ts`
- Reference: `src/router/rules.ts`
- Reference: `src/router/scorer.ts`
- Reference: `tests/router.test.ts`
- Reference: `tests/router-jev.test.ts`

**Step 1：先迁移测试用例**

至少覆盖：

- 规则命中。
- 规则目标不可用时拒绝静默回退。
- 分数相同时的稳定排序。
- 默认 Agent/模型加分。
- 成本、上下文、强度评分。
- 同名模型归属不同 Agent 时仍是两个候选。

**Step 2：实现纯函数 API**

```rust
pub fn route(
    request: &RouteRequest,
    config: &Config,
    options: RouteOptions<'_>,
) -> Result<RouteDecision, RouteError>;
```

路由层不得读取环境变量、文件或进程状态。

**Step 3：接通 Jev 边界**

Jev 网络调用放在 core 的显式 client trait 后面：

```rust
#[async_trait::async_trait]
pub trait JevClient {
    async fn decide(&self, request: JevRequest) -> Result<JevDecision, JevError>;
}
```

测试使用受控 fake client，不访问网络。

**验收：** Rust 路由测试与旧路由测试对同一 fixture 得到一致的 agent/model 和关键 reason。

---

### Task 5：迁移 CLI 扫描与模型探测

**Files:**
- Create: `crates/coderelay-core/src/scanner/mod.rs`
- Create: `crates/coderelay-core/src/scanner/paths.rs`
- Create: `crates/coderelay-core/src/scanner/wsl.rs`
- Create: `crates/coderelay-core/src/agents/mod.rs`
- Create: `crates/coderelay-core/src/agents/catalog.rs`
- Create: `crates/coderelay-core/tests/scanner.rs`
- Create: `crates/coderelay-core/tests/wsl_paths.rs`
- Reference: `src/scanner/**`
- Reference: `src/agents/model-catalog.ts`
- Reference: `tests/scanner-*.test.ts`
- Reference: `tests/wsl-runtime.test.ts`

**Step 1：定义可注入宿主接口**

```rust
pub trait CommandRunner {
    fn exec(&self, request: ExecRequest) -> Result<ExecOutput, ExecError>;
}

pub trait FileSystem {
    fn read(&self, path: &Path) -> Result<String, FsError>;
    fn read_dir(&self, path: &Path) -> Result<Vec<PathBuf>, FsError>;
    fn access(&self, path: &Path) -> bool;
}
```

生产实现使用真实 OS；测试使用可控 fake。

**Step 2：迁移扫描测试**

- PATH 多候选与来源分类。
- 版本探测超时。
- 未安装。
- macOS、Linux、Windows、WSL 路径。
- 自定义 WSL automount root。
- Windows `.cmd` shim。

**Step 3：迁移模型目录**

- CLI 原生配置是模型事实来源。
- `config.yaml` 只叠加元数据。
- 探测失败的 CLI 不产生候选。
- 禁用 CLI 不产生候选。

**验收：** 不访问真实用户 home 的测试可完整覆盖主干；集成测试通过显式 environment 运行。

---

### Task 6：迁移进程执行与事件流

**Files:**
- Create: `crates/coderelay-core/src/runtime/mod.rs`
- Create: `crates/coderelay-core/src/runtime/process.rs`
- Create: `crates/coderelay-core/src/runtime/agent_run.rs`
- Create: `crates/coderelay-core/src/events.rs`
- Create: `crates/coderelay-core/tests/agent_run.rs`
- Reference: `src/runtime/agent-run.ts`
- Reference: `src/models/agent-events.ts`
- Reference: `tests/agent-run.test.ts`
- Reference: `tests/fixtures/mock-cli.mjs`

**Step 1：迁移事件 union**

事件至少包括：

```rust
pub enum AgentEvent {
    SessionStarted(SessionStarted),
    Status(StatusEvent),
    AssistantText(AssistantText),
    ToolStarted(ToolStarted),
    ToolFinished(ToolFinished),
    Stderr(StderrEvent),
    Completed(Completed),
    Failed(Failed),
    Aborted(Aborted),
}
```

**Step 2：建立运行句柄**

```rust
pub struct AgentRun {
    pub run_id: RunId,
    pub events: tokio::sync::mpsc::Receiver<AgentEvent>,
    pub done: tokio::task::JoinHandle<AgentRunResult>,
}

impl AgentRun {
    pub fn abort(&self);
}
```

**Step 3：迁移生命周期测试**

- 分块输出。
- JSON 跨 chunk。
- 非结构化文本回退。
- 非零退出。
- 超时。
- 用户取消。
- Unix 子进程组回收。
- Windows `taskkill` 分支。
- stderr 背压和流关闭。

**验收：** 用现有 mock fixture 启动真实子进程，确认事件顺序、最终状态和退出码。

---

### Task 7：迁移 SQLite 会话

**Files:**
- Create: `crates/coderelay-core/src/session/mod.rs`
- Create: `crates/coderelay-core/src/session/store.rs`
- Create: `crates/coderelay-core/src/session/context.rs`
- Create: `crates/coderelay-core/tests/session_store.rs`
- Reference: `src/session/store.ts`
- Reference: `src/session/context.ts`
- Reference: `tests/session-store.test.ts`
- Reference: `tests/session-context.test.ts`

**Step 1：先做只读兼容**

连接现有 `~/.coderelay/sessions.db`，验证可读取 sessions/turns/preferences。迁移完成前不主动写入旧数据库。

**Step 2：实现 schema 版本表**

```sql
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- 写入前检查 schema 版本。
- 启用 foreign keys、WAL 和 busy timeout。
- 配置文件迁移和数据库迁移必须可回滚或在失败时保持旧库不变。

**Step 3：迁移测试**

- 会话创建、turn 追加、最近 workspace。
- 非空 `strengths`、`cost`、`contextWindow` 等元数据从 turn 到 UI/protocol 的透传。
- 空标题、缺失 session、非法状态。
- 20 条保留策略。
- 多实例并发写入。

**验收：** Rust 只读现有数据库成功；新建测试库完成读写和迁移；不能在并发写时静默丢数据。

---

### Task 8：实现正式 CLI

**Files:**
- Modify: `crates/coderelay-cli/src/main.rs`
- Add: `crates/coderelay-cli/tests/cli_smoke.rs`
- Reference: `src/cli.ts`
- Reference: `src/commands/**`

**命令范围：**

```text
coderelay agents [--json]
coderelay models [--json]
coderelay doctor [--json]
coderelay run [prompt] [--agent] [--model] [--mode] [--timeout]
```

**原则：**

- CLI 直接链接 `coderelay-core`，不调用 Tauri。
- 人类输出写 stdout，诊断写 stderr。
- `--json` 输出版本化稳定结构。
- 不要求第一版保留 Ink TUI。
- 退出码与旧 CLI 对齐：成功 0、普通失败 1、超时 124、取消 130。

**验收：** 同一 fixture 下，旧 CLI 与 Rust CLI 的 `agents --json`、路由结果和退出码一致。

---

### Task 9：Tauri 2 桌面骨架

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/scripts/dev.ts`
- Create: `apps/desktop/src/index.html`
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/styles.css`
- Create: `apps/desktop/src/types.ts`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/build.rs`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/capabilities/default.json`

**Step 1：实现只读 Tauri command**

```rust
#[tauri::command]
fn supported_agents() -> Vec<AgentDescriptor> {
    coderelay_core::supported_agents()
}

#[tauri::command]
fn runtime_status() -> RuntimeStatus {
    RuntimeStatus {
        core_version: env!("CARGO_PKG_VERSION").to_string(),
        protocol_version: coderelay_protocol::PROTOCOL_VERSION,
        transport: "in-process".to_string(),
    }
}
```

**Step 2：前端只消费类型化命令**

- 使用 `invoke<AgentDescriptor[]>("supported_agents")`。
- 不使用 `any`，不对错误做未检查属性访问。
- 不使用浏览器端 shell/fs 插件。
- 首屏展示真实 core 返回值，不写假数据。

**Step 3：验证开发与构建**

```bash
bun install
bun --cwd apps/desktop run build
bun --cwd apps/desktop run typecheck
cargo check -p coderelay-desktop
```

**验收：** Tauri 窗口能打开，显示 Rust core 的 Agent 列表和协议版本；前端无法直接执行 shell。

---

### Task 10：桌面主流程

优先级从高到低：

1. 项目工作区选择与最近项目。
2. Agent 扫描、状态与安装引导。
3. 模型目录与能力/成本矩阵。
4. 配置编辑与激活状态。
5. 路由预览与手动覆盖。
6. 任务执行、流式事件、取消和超时。
7. 会话历史与跨 CLI 上下文。
8. Doctor 与诊断导出。

所有业务调用必须经过 Tauri command 或版本化协议；React 组件不得直接落下业务规则。

---

### Task 11：SDK 协议与客户端

**Files:**
- Keep: `crates/coderelay-protocol`
- Future: `crates/coderelay-daemon`
- Future: `packages/sdk-ts`

第一阶段协议：

```text
discoverAgents
getModelCatalog
route
startRun
cancelRun
listSessions
getSession
loadConfig
saveConfig
doctor
```

事件：

```text
runStarted
assistantText
toolStarted
toolFinished
runCompleted
runFailed
runAborted
```

协议必须包含：

- `protocolVersion`
- 请求 id
- 幂等 key（写操作）
- 结构化错误码与可重试标志
- 取消语义
- 最大消息大小
- 日志与事件分离

本地 SDK 第一版优先使用 stdio JSON-RPC/NDJSON；只有出现远程或多进程实时共享需求时才引入 HTTP/WebSocket。

---

### Task 12：迁移与切换

**切换门槛：**

- Rust core 与旧 Bun 实现通过同一组 fixture。
- 旧配置可直接加载。
- 旧数据库可只读；写迁移有备份和回滚。
- 四个 Agent 的扫描、模型探测和启动均通过集成测试。
- macOS、Windows、Linux 中至少每个平台完成一次真实 smoke test。
- Tauri App 签名、更新、崩溃日志和权限策略完成。
- CLI 与桌面端版本通过协议与数据库兼容测试。

**切换顺序：**

1. Rust CLI 先内部可用。
2. Tauri 桌面端接入只读能力。
3. 桌面端接入任务执行。
4. 桌面端成为默认入口。
5. Bun CLI/TUI 停止新增功能。
6. 删除旧实现前至少保留一个版本的迁移兼容层。

---

## 3. 风险与控制

| 风险 | 控制方式 |
|---|---|
| Rust 重写导致行为漂移 | 旧实现作为 oracle；共享 fixture；黑盒 CLI 对拍 |
| Windows/WSL 回归 | 尽早建立平台 CI 和真实 smoke test |
| Tauri WebView 差异 | 在 macOS/Windows/Linux 分别验证 |
| 配置/数据库双写损坏 | 单写者、migration lock、备份、busy timeout |
| 前端绕过核心 | 禁止 shell/fs 插件；Tauri 命令只接受领域类型 |
| 过早引入 daemon | 第一版桌面内嵌 core，协议预留但不上 daemon |
| CLI 维护成本 | 不保留复杂 TUI，只保留自动化与诊断命令 |
| SDK 生态过早承诺 | 先稳定 TypeScript 客户端和本地协议，再扩语言 |

---

## 4. 初始脚手架验收

以下命令必须通过：

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
bun --cwd apps/desktop run typecheck
bun --cwd apps/desktop run build
cargo check -p coderelay-desktop
```

同时保留现有 Bun 实现，确保：

```bash
bun test
bun run typecheck
```

仍可作为迁移对照运行。

---

## 5. 首个里程碑

**M0：可运行骨架**

- Rust workspace 可编译。
- `coderelay agents --json` 输出四个内置 Agent。
- 协议 v1 有 serde round-trip 测试。
- Tauri 窗口通过类型化 command 读取同一核心的 Agent 列表。
- Bun 旧实现没有被删除或覆盖。
- 迁移计划进入版本控制。
