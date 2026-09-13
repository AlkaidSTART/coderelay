# coderelay CLI 界面规划（Ink）

> 依赖已就绪：`ink@7`、`react@19`、`@inkjs/ui@2`，测试用 `ink-testing-library@4`。
> 运行/验证一律使用 Bun：`bun test`、`bunx tsc --noEmit`。

## 1. 范围

只做「界面层」：检测结果的呈现、选择、prompt 输入、启动与回到界面。
扫描层 / 接入层 / 启动层已经完成，界面**只调用**以下既有 API，不得复制逻辑：

| 能力 | API | 来源 |
| --- | --- | --- |
| 扫描本机 CLI | `scanCodingClis(options?)` → `DetectedCli[]` | `src/scanner/cli-scanner.ts` |
| 宿主标记 | `detectHostAgent(env?)` | `src/scanner/cli-scanner.ts` |
| 适配器元数据 | `getCliAdapter(id)` / `CLI_ADAPTERS` | `src/agents/cli-adapters.ts` |
| 交互启动 | `launchInteractive(adapter, { binPath, cwd })` | `src/runtime/launcher.ts` |
| 带 prompt 启动 | `launchWithPrompt(adapter, prompt, { binPath })` | `src/runtime/launcher.ts` |

约束：`binPath` 必须传扫描得到的 `DetectedCli.path`，保证 PATH 未刷新时也能启动。

## 2. 页面流（状态机）

```
scanning ──▶ picker ──▶ composer ──▶ (Ink 卸下) 子进程 stdio: inherit ──▶ result ──▶ picker
                │            │                                                    ▲
                └── 未安装详情 ┘                                                    └── esc / ↵
```

- `scanning`：Spinner + 「正在扫描本机编码代理」，扫描完成自动进入 `picker`。
- `picker`：列出 codex / claude / pi / omp，显示可用状态、版本、路径（`~` 缩写）。
  - `↑ ↓` / `k j` 移动，`↵` 进入 composer；不可用项 `↵` 显示安装提示；`q` / `⌃C` 退出。
- `composer`：prompt 输入 + 启动方式。
  - `↵` 带 prompt 启动（`launchWithPrompt`）；`tab` 纯交互启动（`launchInteractive`）；`esc` 返回。
- `result`：会话结束卡片（exit code / signal / 耗时），`↵` 回到 picker，`q` 退出。

## 3. 视觉规范（简约高级 · 高级黑）

| Token | 值 | 用途 |
| --- | --- | --- |
| `bg` | `#050505` | 底色，`render(..., { })` 后由首屏留白承担，不铺满整屏 |
| `panel` | `#0B0B0C` | 输入区、会话卡片底色 |
| `line` | `#26262B` | 极细分隔线 |
| `text` | `#F2F2F5` | 主文本 |
| `muted` | `#77777F` | 次要信息、未安装项 |
| `dim` | `#4A4A52` | 路径、占位符 |
| `accent` | `#C8B892`（香槟）| 选中指示、强调；克制使用 |
| `ok` | `#7FB79B` | 可用状态点 |
| `warn` | `#C98B7A` | 失败状态 |

排版原则：
- 只用**细线 + 留白 + 字重对比**，不用重边框；区块之间最多一条 `line` 色细线。
- 选中态 = 左侧 `❯` 指示 + 文本提亮，不用反色块、不用整行高亮底。
- 状态点用 `●` / `○`，不用 emoji。
- 全局留白：左右 2 列，标题与内容之间 1 行。

### 输入框（重点：不要太方正）
- 外层：`paddingX={2}`、`backgroundColor={panel}`，**不画四边框**。
- 仅保留左右两条竖线（`borderStyle="round"` + `borderTop={false}` + `borderBottom={false}`，`borderColor={line}`），形成「软胶囊」观感而非方框。
- 左侧提示符 `❯`（`accent`），占位符用 `dim`。
- 聚焦时只把左右竖线提到 `accent`（或加一条极细上边框），不做整块反色。
- 光标由 `@inkjs/ui` 的 `TextInput` 提供，保持原生编辑键位（含中文输入回显）。

## 4. 文件结构

```
src/cli.tsx                    # 入口：扫描 → render(App) → 启动生命周期接管
src/ui/App.tsx                 # 状态机 + 键盘路由
src/ui/theme.ts                # 上面的 token
src/ui/components/AppHeader.tsx
src/ui/components/CliList.tsx
src/ui/components/PromptField.tsx
src/ui/components/HintBar.tsx
src/ui/components/ScanningView.tsx
src/ui/components/SessionResult.tsx
tests/ui-app.test.tsx          # ink-testing-library 驱动的界面测试
```

## 5. 启动生命周期（关键）

Ink 与 `stdio: "inherit"` 不能同时占用终端，必须**先卸下界面再让子进程接管**：

```tsx
const app = render(<App ... />);
// App 请求启动时：
app.unmount();                       // Ink 释放 stdin/stdout 并清除自己的帧
const child = launchWithPrompt(adapter, prompt, { binPath: detected.path });
const startedAt = Date.now();
await once(child, "exit");           // exit / error 都要回到界面
render(<App initialId={id} session={result} />);
```

- 子进程退出（含非 0、被信号终止、spawn error）后必须重新渲染界面，不能把用户丢在 shell。
- 交叉验证：`render` 返回值要保留在入口的闭包里，重进时复用「上次选中项」。

## 6. 键盘表

| 场景 | 按键 | 行为 |
| --- | --- | --- |
| picker | `↑ ↓` / `k j` | 移动选中 |
| picker | `↵` | 可用 → composer；不可用 → 安装提示 |
| picker | `q` / `⌃C` | 退出 |
| composer | `↵` | 带 prompt 启动 |
| composer | `tab` | 纯交互启动（忽略空 prompt） |
| composer | `esc` | 返回 picker |
| result | `↵` / `esc` | 回到 picker |
| result | `q` | 退出 |

## 7. 测试

- `App` 通过 props 注入 `clis`，不触发真实扫描；入口才调用 `scanCodingClis`。
- 用例：
  1. `scanning` 显示扫描文案；
  2. 扫描完成后显示全部四项，未安装项为 `○`；
  3. `↓` + `↵` 进入 composer，`TextInput` 收到输入；
  4. `↵` 触发 `onLaunch({ mode: "prompt", prompt })`；`tab` 触发 `mode: "interactive"`；
  5. `esc` 从 composer 回到 picker；`q` 触发 `onExit`。
- 快照断言用 `lastFrame()` 文本包含关系，不做全帧快照（避免颜色/宽度抖动）。

## 8. 验收

1. `bun test` 全绿，`bunx tsc --noEmit` 无错误。
2. `bun src/cli.tsx` 能扫描本机 CLI、进入 composer、启动真实 CLI 并在退出后回到界面。
3. 界面满足：高级黑、细线留白、输入框非方框、中文文案。
