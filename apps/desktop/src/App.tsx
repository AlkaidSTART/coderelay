import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type {
  AgentEntry,
  AgentEvent,
  ConfigSource,
  DiscoveryPayload,
  JevSettings,
  ModelOption,
  RoutePreview,
  RunCompletedPayload,
  RunEventPayload,
  RuntimeStatus,
  SessionDetail,
  SessionRecord,
  SessionUpdatedPayload,
  StartRunResponse,
} from "./types";

interface RouteForm {
  prompt: string;
  mode: string;
  agent: string;
  model: string;
}

type WorkspaceView = "workspace" | "sessions" | "config";

interface WorkbenchState {
  discovery: DiscoveryPayload | null;
  runtime: RuntimeStatus | null;
  loading: boolean;
  error: string | null;
  running: boolean;
  runId: string | null;
  output: string;
  activity: string[];
  result: RunCompletedPayload["result"] | null;
  preview: RoutePreview | null;
  view: WorkspaceView;
  recentWorkspaces: string[];
  sessions: SessionRecord[];
  sessionDetail: SessionDetail | null;
  activeSessionId: string | null;
  configSource: ConfigSource | null;
  configDraft: string;
  configBusy: boolean;
  jevSettings: JevSettings | null;
  jevApiKeyInput: string;
  jevBusy: boolean;
  configNotice: string | null;
}

const INITIAL_STATE: WorkbenchState = {
  discovery: null,
  runtime: null,
  loading: true,
  error: null,
  running: false,
  runId: null,
  output: "",
  activity: [],
  result: null,
  preview: null,
  view: "workspace",
  recentWorkspaces: [],
  sessions: [],
  sessionDetail: null,
  activeSessionId: null,
  configSource: null,
  configDraft: "",
  configBusy: false,
  jevSettings: null,
  jevApiKeyInput: "",
  jevBusy: false,
  configNotice: null,
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function modelValue(model: ModelOption): string {
  return model.modelId;
}

function modelLabel(model: ModelOption): string {
  const suffix = model.isDefault ? " · default" : "";
  const id = model.modelId || "adapter default";
  return `${model.label || id}${suffix}`;
}

function workspaceName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  if (!normalized) {
    return "未选择工作区";
  }
  const segments = normalized.split(/[\\/]/);
  return segments[segments.length - 1] || normalized;
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes} 分 ${remainingSeconds} 秒`;
}

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    >
      {children}
    </svg>
  );
}

function HomeIcon() {
  return (
    <Icon>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V20h11V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </Icon>
  );
}

function HistoryIcon() {
  return (
    <Icon>
      <path d="M4.6 9A8 8 0 1 1 4 12" />
      <path d="M4 5v4h4" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

function FolderIcon() {
  return (
    <Icon>
      <path d="M3.5 7.5h6l1.8 2h9.2v8.8a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7Z" />
      <path d="M3.5 9.5V6.2c0-.94.76-1.7 1.7-1.7h4.1l1.8 2h7.2c.94 0 1.7.76 1.7 1.7v1.3" />
    </Icon>
  );
}

function SettingsIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .55 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-1.55-1H2.5V10h.09A1.7 1.7 0 0 0 4.1 9a1.7 1.7 0 0 0-.34-1.88L3.7 7.06 6.56 4.2l.06.06A1.7 1.7 0 0 0 8.5 4.6a1.7 1.7 0 0 0 1-1.55V3h4v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1h.09v4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </Icon>
  );
}

function RefreshIcon() {
  return (
    <Icon size={15}>
      <path d="M20 11a8 8 0 1 0-2.34 5.66" />
      <path d="M20 5v6h-6" />
    </Icon>
  );
}

function TerminalIcon() {
  return (
    <Icon size={16}>
      <path d="m5 7 4 4-4 4" />
      <path d="M11 16h7" />
    </Icon>
  );
}

function RouteIcon() {
  return (
    <Icon size={15}>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3h-1" />
    </Icon>
  );
}

function ArrowUpIcon() {
  return (
    <Icon size={17}>
      <path d="M12 19V5" />
      <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
    </Icon>
  );
}

function StopIcon() {
  return (
    <Icon size={16}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
    </Icon>
  );
}

function eventActivity(event: AgentEvent): string | null {
  if (event.kind === "tool_started") {
    return `tool · ${event.tool ?? "unknown"}`;
  }
  if (event.kind === "status") {
    return `status · ${event.text ?? ""}`;
  }
  if (event.kind === "stderr") {
    return event.text?.trim() || null;
  }
  if (event.kind === "failed") {
    return `error · ${event.message ?? "agent failed"}`;
  }
  if (event.kind === "aborted") {
    return `aborted · ${event.reason ?? "process stopped"}`;
  }
  return null;
}

export function App() {
  const [state, setState] = useState<WorkbenchState>(INITIAL_STATE);
  const [form, setForm] = useState<RouteForm>({
    prompt: "",
    mode: "local",
    agent: "",
    model: "",
  });
  const [workspaceInput, setWorkspaceInput] = useState("");
  const activeRunId = useRef<string | null>(null);
  const currentWorkspace = useRef("");

  async function refreshRecentWorkspaces(): Promise<void> {
    const recentWorkspaces = await invoke<string[]>("list_recent_workspaces", {
      limit: 8,
    });
    setState((current) => ({ ...current, recentWorkspaces }));
  }

  async function refreshSessions(cwd: string): Promise<SessionRecord[]> {
    const sessions = await invoke<SessionRecord[]>("list_sessions", {
      request: {
        workspace: cwd.trim() || null,
        limit: 30,
      },
    });
    setState((current) => ({ ...current, sessions }));
    return sessions;
  }

  async function loadDiscovery(cwd?: string): Promise<void> {
    setState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));
    try {
      const [runtime, discovery] = await Promise.all([
        invoke<RuntimeStatus>("runtime_status"),
        invoke<DiscoveryPayload>("discover", {
          request: {
            cwd: cwd?.trim() || null,
            configPath: null,
          },
        }),
      ]);
      currentWorkspace.current = discovery.cwd;
      setWorkspaceInput(discovery.cwd);
      setForm((current) => ({
        ...current,
        mode: discovery.routingModes.includes(current.mode)
          ? current.mode
          : (discovery.routingModes[0] ?? "local"),
        agent: discovery.agents.some((agent) => agent.id === current.agent)
          ? current.agent
          : "",
        model: "",
      }));
      const sessions = await invoke<SessionRecord[]>("list_sessions", {
        request: {
          workspace: discovery.cwd,
          limit: 30,
        },
      });
      setState((current) => ({
        ...current,
        runtime,
        discovery,
        sessions,
        recentWorkspaces: discovery.recentWorkspaces,
        sessionDetail: null,
        activeSessionId: null,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: messageOf(error),
      }));
    }
  }

  async function openSession(sessionId: string): Promise<void> {
    try {
      const detail = await invoke<SessionDetail>("get_session", { sessionId });
      setState((current) => ({
        ...current,
        sessionDetail: detail,
        activeSessionId: sessionId,
        error: null,
      }));
    } catch (error) {
      setState((current) => ({ ...current, error: messageOf(error) }));
    }
  }

  async function loadJevSettings(): Promise<void> {
    try {
      const settings = await invoke<JevSettings>("get_jev_settings");
      setState((current) => ({
        ...current,
        jevSettings: settings,
      }));
    } catch (error) {
      setState((current) => ({ ...current, error: messageOf(error) }));
    }
  }

  async function saveJevApiKey(): Promise<void> {
    const apiKey = state.jevApiKeyInput.trim();
    if (!apiKey) {
      return;
    }
    setState((current) => ({
      ...current,
      jevBusy: true,
      error: null,
      configNotice: null,
    }));
    try {
      const settings = await invoke<JevSettings>("save_jev_api_key", { apiKey });
      setState((current) => ({
        ...current,
        jevSettings: settings,
        jevApiKeyInput: "",
        jevBusy: false,
        configNotice: "API Key 已保存到本地 SQLite。",
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        jevBusy: false,
        error: messageOf(error),
      }));
    }
  }

  async function clearJevApiKey(): Promise<void> {
    setState((current) => ({
      ...current,
      jevBusy: true,
      error: null,
      configNotice: null,
    }));
    try {
      const settings = await invoke<JevSettings>("clear_jev_api_key");
      setState((current) => ({
        ...current,
        jevSettings: settings,
        jevApiKeyInput: "",
        jevBusy: false,
        configNotice: "已从本地 SQLite 清除 API Key。",
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        jevBusy: false,
        error: messageOf(error),
      }));
    }
  }

  async function loadConfigSource(): Promise<void> {
    setState((current) => ({ ...current, configBusy: true, error: null }));
    try {
      const source = await invoke<ConfigSource>("read_config_source", {
        request: {
          cwd: workspaceInput.trim() || null,
          configPath: null,
        },
      });
      setState((current) => ({
        ...current,
        configSource: source,
        configDraft: source.raw,
        configBusy: false,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        configBusy: false,
        error: messageOf(error),
      }));
    }
  }

  async function saveConfig(): Promise<void> {
    setState((current) => ({ ...current, configBusy: true, error: null }));
    try {
      const path = await invoke<string>("save_config", {
        request: {
          workspace: {
            cwd: workspaceInput.trim() || null,
            configPath: null,
          },
          raw: state.configDraft,
        },
      });
      setState((current) => ({
        ...current,
        configBusy: false,
        configSource: current.configSource
          ? { ...current.configSource, path, exists: true, raw: current.configDraft }
          : { path, exists: true, raw: current.configDraft },
      }));
      await loadDiscovery(workspaceInput);
      setState((current) => ({ ...current, view: "config" }));
    } catch (error) {
      setState((current) => ({
        ...current,
        configBusy: false,
        error: messageOf(error),
      }));
    }
  }

  function startNewTask(): void {
    setForm((current) => ({ ...current, prompt: "" }));
    setState((current) => ({
      ...current,
      view: "workspace",
      activeSessionId: null,
      sessionDetail: null,
      output: "",
      activity: [],
      result: null,
      preview: null,
      error: null,
    }));
  }

  useEffect(() => {
    void loadDiscovery();
  }, []);

  useEffect(() => {
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];

    void Promise.all([
      listen<RunEventPayload>("run-event", ({ payload }) => {
        if (payload.runId !== activeRunId.current) {
          return;
        }
        setState((current) => {
          const nextActivity = eventActivity(payload.event);
          return {
            ...current,
            output:
              payload.event.kind === "assistant_text"
                ? current.output + (payload.event.text ?? "")
                : current.output,
            activity: nextActivity
              ? [...current.activity.slice(-99), nextActivity]
              : current.activity,
          };
        });
      }),
      listen<RunCompletedPayload>("run-completed", ({ payload }) => {
        if (payload.runId !== activeRunId.current) {
          return;
        }
        activeRunId.current = null;
        setState((current) => ({
          ...current,
          running: false,
          runId: null,
          activeSessionId: payload.sessionId,
          result: payload.result,
          output: payload.result.text || current.output,
        }));
        void refreshSessions(currentWorkspace.current);
      }),
      listen<SessionUpdatedPayload>("session-updated", () => {
        void refreshSessions(currentWorkspace.current);
        void refreshRecentWorkspaces();
      }),
    ]).then((registered) => {
      if (disposed) {
        registered.forEach((unlisten) => unlisten());
      } else {
        unlisteners.push(...registered);
      }
    });

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const discovery = state.discovery;
  const agents = discovery?.agents ?? [];
  const selectedAgent = agents.find((agent) => agent.id === form.agent);
  const models =
    discovery?.catalog.options.filter(
      (model) =>
        model.available &&
        (!form.agent || model.cliId === form.agent),
    ) ?? [];

  async function previewRoute(): Promise<void> {
    const prompt = form.prompt.trim();
    if (!prompt) {
      setState((current) => ({ ...current, error: "先输入任务内容。" }));
      return;
    }
    try {
      const preview = await invoke<RoutePreview>("route_preview", {
        request: {
          workspace: {
            cwd: workspaceInput.trim() || null,
            configPath: null,
          },
          request: { prompt },
          mode: form.mode,
          agent: form.agent || null,
          model: form.model || null,
        },
      });
      setState((current) => ({ ...current, preview, error: null }));
    } catch (error) {
      setState((current) => ({ ...current, error: messageOf(error) }));
    }
  }

  async function startRun(): Promise<void> {
    const prompt = form.prompt.trim();
    if (!prompt || state.running) {
      return;
    }
    try {
      const response = await invoke<StartRunResponse>("start_run", {
        request: {
          workspace: {
            cwd: workspaceInput.trim() || null,
            configPath: null,
          },
          request: { prompt },
          mode: form.mode,
          agent: form.agent || null,
          model: form.model || null,
          timeoutMs: null,
          sessionId: state.activeSessionId,
        },
      });
      activeRunId.current = response.runId;
      setState((current) => ({
        ...current,
        running: true,
        runId: response.runId,
        activeSessionId: response.sessionId,
        output: "",
        activity: [],
        result: null,
        preview: {
          agent: response.agent,
          model: response.model,
          reasons: response.reasons,
        },
        error: null,
      }));
    } catch (error) {
      setState((current) => ({ ...current, error: messageOf(error) }));
    }
  }

  async function cancelRun(): Promise<void> {
    if (!state.runId) {
      return;
    }
    try {
      await invoke<boolean>("cancel_run", { runId: state.runId });
    } catch (error) {
      setState((current) => ({ ...current, error: messageOf(error) }));
    }
  }

  function selectAgent(agent: AgentEntry): void {
    setForm((current) => ({
      ...current,
      agent: current.agent === agent.id ? "" : agent.id,
      model: "",
    }));
  }

  const activeTaskTitle = form.prompt.trim().split("\n")[0]?.trim() || "新任务";
  const statusTone = state.error ? "error" : state.loading ? "loading" : state.running ? "running" : "ready";
  const statusLabel = state.error
    ? "需要处理"
    : state.loading
      ? "正在扫描"
      : state.running
        ? "正在执行"
        : "Core 已连接";
  const showThread = Boolean(
    state.preview || state.output || state.activity.length > 0 || state.result || state.running,
  );

  return (
    <div className="app-frame">
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar-brand" data-tauri-drag-region />
        <button className="titlebar-document" onClick={startNewTask} type="button">
          <TerminalIcon />
          <span>{activeTaskTitle}</span>
        </button>
        <div className="titlebar-status" data-tauri-drag-region>
          <span className="status-dot" data-tone={statusTone} />
          <span>{statusLabel}</span>
        </div>
      </header>

      <div className="app-layout">
        <nav className="icon-rail" aria-label="工作台导航">
          <div className="rail-nav">
            <button
              aria-label="工作台"
              className={`rail-action ${state.view === "workspace" ? "rail-action--active" : ""}`}
              onClick={() => setState((current) => ({ ...current, view: "workspace" }))}
              title="工作台"
              type="button"
            >
              <HomeIcon />
            </button>
            <button
              aria-label="会话历史"
              className={`rail-action ${state.view === "sessions" ? "rail-action--active" : ""}`}
              onClick={() => {
                setState((current) => ({ ...current, view: "sessions" }));
                void refreshSessions(currentWorkspace.current);
              }}
              title="会话历史"
              type="button"
            >
              <HistoryIcon />
            </button>
            <button
              aria-label="新任务"
              className="rail-action"
              onClick={startNewTask}
              title="新任务"
              type="button"
            >
              <FolderIcon />
            </button>
          </div>
          <div className="rail-footer">
            <button
              aria-label="配置"
              className={`rail-action ${state.view === "config" ? "rail-action--active" : ""}`}
              onClick={() => {
                setState((current) => ({ ...current, view: "config" }));
                void Promise.all([loadConfigSource(), loadJevSettings()]);
              }}
              title="配置"
              type="button"
            >
              <SettingsIcon />
            </button>
          </div>
        </nav>

        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="brand-lockup">
              <h1>CodeRelay</h1>
              <p className="sidebar-kicker">Local coding agents</p>
            </div>
            <span className="local-chip">{state.loading ? "SYNC" : "LOCAL"}</span>
          </div>

          <div className="sidebar-thread">
            <span className="thread-icon"><TerminalIcon /></span>
            <span className="thread-copy">
              <strong>{activeTaskTitle}</strong>
              <small>{state.running ? "正在执行" : state.result ? "已完成" : "当前任务"}</small>
            </span>
            <span className={`thread-state ${state.running ? "thread-state--running" : ""}`} />
          </div>

          <div className="sidebar-scroll">
            <section className="sidebar-section">
              <div className="sidebar-section-title">
                <span>WORKSPACE</span>
                <span className="section-count">{state.loading ? "扫描中" : "已连接"}</span>
              </div>
              <div className="workspace-field">
                <FolderIcon />
                <input
                  id="workspace"
                  aria-label="工作区路径"
                  value={workspaceInput}
                  onChange={(event) => setWorkspaceInput(event.target.value)}
                  placeholder="选择或输入工作区"
                  spellCheck={false}
                />
                <button
                  aria-label="重新扫描工作区"
                  className="icon-button"
                  disabled={state.loading}
                  onClick={() => void loadDiscovery(workspaceInput)}
                  title="重新扫描"
                  type="button"
                >
                  <RefreshIcon />
                </button>
              </div>
              {state.recentWorkspaces.length > 0 ? (
                <div className="recent-workspaces">
                  {state.recentWorkspaces.slice(0, 4).map((workspace) => (
                    <button
                      className={`workspace-chip ${workspace === workspaceInput ? "workspace-chip--active" : ""}`}
                      key={workspace}
                      onClick={() => void loadDiscovery(workspace)}
                      title={workspace}
                      type="button"
                    >
                      {workspaceName(workspace)}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <div className="sidebar-footer">
            <span className="status-dot" data-tone={statusTone} />
            <div>
              <strong>Local runtime</strong>
              <span>{state.runtime?.coreVersion ? `Rust Core v${state.runtime.coreVersion}` : "正在连接"}</span>
            </div>
            <span className="protocol-pill">{state.runtime?.transport ?? "local"}</span>
          </div>
        </aside>

        <main className="main-panel" data-view={state.view}>
          <header className="main-toolbar">
            <div className="toolbar-breadcrumbs">
              <span className="breadcrumbs-root"><FolderIcon /> {workspaceName(workspaceInput)}</span>
              <span className="breadcrumbs-separator">/</span>
              <strong>{activeTaskTitle}</strong>
            </div>
            <div className="toolbar-right">
              <span className="route-chip"><RouteIcon /> {selectedAgent?.label ?? "Auto route"}</span>
              <span className={`connection-pill connection-pill--${statusTone}`}>{statusLabel}</span>
            </div>
          </header>

          <section className="secondary-view" aria-live="polite">
            {state.view === "sessions" ? (
              <div className="secondary-page">
                <div className="secondary-header">
                  <div>
                    <p className="sidebar-kicker">Conversation archive</p>
                    <h2>会话历史</h2>
                    <p>每次桌面任务都会写入共享 SQLite；选择历史会话后，下一条任务会带上它的上下文。</p>
                  </div>
                  <button
                    className="ghost-button"
                    onClick={() => void refreshSessions(currentWorkspace.current)}
                    type="button"
                  >
                    <RefreshIcon />
                    刷新
                  </button>
                </div>

                <div className="session-layout">
                  <div className="session-list">
                    {state.sessions.length === 0 ? (
                      <div className="secondary-empty">
                        <HistoryIcon />
                        <strong>还没有会话</strong>
                        <span>完成第一条任务后，这里会出现可续跑的历史。</span>
                      </div>
                    ) : (
                      state.sessions.map((session) => (
                        <button
                          className={`session-row ${state.activeSessionId === session.id ? "session-row--selected" : ""}`}
                          key={session.id}
                          onClick={() => void openSession(session.id)}
                          type="button"
                        >
                          <span className="session-agent">{session.cliId}</span>
                          <strong>{session.title}</strong>
                          <small>{formatTimestamp(session.updatedAt)}</small>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="session-detail">
                    {state.sessionDetail ? (
                      <>
                        <div className="session-detail-head">
                          <div>
                            <p className="sidebar-kicker">{state.sessionDetail.session.cliId}</p>
                            <h3>{state.sessionDetail.session.title}</h3>
                          </div>
                          <button
                            className="primary-button"
                            onClick={() => {
                              setState((current) => ({ ...current, view: "workspace" }));
                              setForm((current) => ({ ...current, prompt: "" }));
                            }}
                            type="button"
                          >
                            继续这个会话
                          </button>
                        </div>
                        <div className="turn-list">
                          {state.sessionDetail.turns.map((turn) => (
                            <article className="turn-card" key={turn.id}>
                              <div className="turn-meta">
                                <span>{turn.cliId}</span>
                                <span>{turn.modelId ?? "default model"}</span>
                                <span>{turn.status ?? "unknown"}</span>
                              </div>
                              <div className="turn-prompt">{turn.prompt}</div>
                              <pre className="turn-output">{turn.output || "（无文本输出）"}</pre>
                            </article>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="secondary-empty">
                        <TerminalIcon />
                        <strong>选择一个会话</strong>
                        <span>查看跨 CLI 的完整任务记录和运行元数据。</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="secondary-page config-page">
                <div className="secondary-header">
                  <div>
                    <p className="sidebar-kicker">Workspace configuration</p>
                    <h2>配置</h2>
                    <p>
                      {state.configSource?.path ?? "正在读取配置文件…"}
                    </p>
                  </div>
                  <div className="config-actions">
                    <button
                      className="ghost-button"
                      disabled={state.configBusy}
                      onClick={() => void loadConfigSource()}
                      type="button"
                    >
                      重新读取
                    </button>
                    <button
                      className="primary-button"
                      disabled={state.configBusy || !state.configDraft.trim()}
                      onClick={() => void saveConfig()}
                      type="button"
                    >
                      {state.configBusy ? "保存中…" : "保存配置"}
                    </button>
                  </div>
                </div>
                <section className="credential-panel" aria-labelledby="jev-credential-title">
                  <div className="credential-copy">
                    <p className="sidebar-kicker">Jev routing credential</p>
                    <h3 id="jev-credential-title">TypeSafe API Key</h3>
                    <p>
                      在界面填写后会保存到本机 SQLite。Jev 路由优先使用这里保存的密钥，
                      环境变量和本地配置文件只作为兼容兜底。
                    </p>
                  </div>
                  <span className={`credential-status ${state.jevSettings?.stored ? "credential-status--stored" : ""}`}>
                    {state.jevSettings?.stored
                      ? "已保存到 SQLite"
                      : state.jevSettings?.environmentConfigured
                        ? "正在使用环境变量"
                        : "未配置"}
                  </span>
                  <div className="credential-form">
                    <label htmlFor="jev-api-key">
                      <span>TYPESAFE_API_KEY</span>
                      <input
                        autoComplete="off"
                        disabled={state.jevBusy}
                        id="jev-api-key"
                        onChange={(event) =>
                          setState((current) => ({
                            ...current,
                            jevApiKeyInput: event.target.value,
                          }))
                        }
                        placeholder={state.jevSettings?.stored ? "已保存，输入新密钥可替换" : "粘贴 API Key"}
                        spellCheck={false}
                        type="password"
                        value={state.jevApiKeyInput}
                      />
                    </label>
                    <button
                      className="primary-button"
                      disabled={state.jevBusy || !state.jevApiKeyInput.trim()}
                      onClick={() => void saveJevApiKey()}
                      type="button"
                    >
                      {state.jevBusy ? "保存中…" : "保存密钥"}
                    </button>
                    <button
                      className="ghost-button"
                      disabled={state.jevBusy || !state.jevSettings?.stored}
                      onClick={() => void clearJevApiKey()}
                      type="button"
                    >
                      清除
                    </button>
                  </div>
                  {state.configNotice ? (
                    <p className="credential-notice" role="status">{state.configNotice}</p>
                  ) : null}
                </section>
                <div className="config-note">
                  <span className={state.configSource?.exists ? "config-state config-state--exists" : "config-state"}>
                    {state.configSource?.exists ? "workspace config" : "new workspace config"}
                  </span>
                  保存前会完整校验 YAML；校验失败不会覆盖现有文件。
                </div>
                <textarea
                  aria-label="配置文件内容"
                  className="config-editor"
                  onChange={(event) =>
                    setState((current) => ({ ...current, configDraft: event.target.value }))
                  }
                  spellCheck={false}
                  value={state.configDraft}
                />
              </div>
            )}
          </section>

          <section className="conversation" aria-live="polite">
            <div className="conversation-inner">
              {state.error ? (
                <div className="alert" role="alert">
                  <strong>连接出现问题</strong>
                  <span>{state.error}</span>
                </div>
              ) : null}

              {!showThread ? (
                <div className="empty-state">
                  <div className="empty-topline">
                    <span className="empty-kicker">LOCAL-FIRST CODING AGENT</span>
                  </div>
                  <h2>今天准备<br />构建什么？</h2>
                  <p className="empty-copy">
                    CodeRelay 会在本机发现可用的 Agent，把任务交给最合适的那一个，并保留完整的执行上下文。
                  </p>
                  <div className="empty-signals">
                    <span><FolderIcon /> {workspaceName(workspaceInput)}</span>
                    <span><span className="status-dot" data-tone={statusTone} /> {agents.filter((agent) => agent.available).length} agents ready</span>
                    <span><TerminalIcon /> {state.runtime?.transport ?? "in-process"}</span>
                  </div>
                </div>
              ) : (
                <article className="assistant-message">
                  <div className="message-header">
                    <div className="assistant-identity">
                      <span>
                        {state.running
                          ? "正在处理任务"
                          : state.result
                            ? `已处理 ${formatDuration(state.result.durationMs)}`
                            : "已准备路由"}
                      </span>
                    </div>
                    <span className={`run-state ${state.running ? "run-state--running" : ""}`}>
                      {state.running ? "running" : state.result?.status ?? "idle"}
                    </span>
                  </div>

                  {state.preview ? (
                    <div className="route-preview">
                      <span className="route-preview-label"><RouteIcon /> 路由</span>
                      <strong>
                        {state.preview.agent}
                        {state.preview.model ? ` / ${state.preview.model}` : ""}
                      </strong>
                      <span className="route-reasons">{state.preview.reasons.join(" · ") || "显式指定"}</span>
                    </div>
                  ) : null}

                  <div className={`message-copy ${state.running ? "message-copy--running" : ""}`}>
                    {state.output || (state.running ? "正在等待 Agent 返回结果…" : "任务已就绪。")}
                    {state.running && !state.output ? <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span> : null}
                  </div>

                  {state.activity.length > 0 ? (
                    <div className="activity-log">
                      <div className="activity-head">
                        <span className="activity-label"><TerminalIcon /> RUN LOG</span>
                        <span>{state.activity.length} events</span>
                      </div>
                      <div className="activity-body">
                        {state.activity.map((entry, index) => (
                          <div className="activity-row" key={`${index}-${entry}`}>
                            <span className="activity-prefix">›</span>
                            <span>{entry}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {state.result ? (
                    <div className="result-strip">
                      <span><b>状态</b> {state.result.status}</span>
                      <span><b>退出码</b> {state.result.code ?? "—"}</span>
                      <span><b>耗时</b> {formatDuration(state.result.durationMs)}</span>
                    </div>
                  ) : null}
                </article>
              )}
            </div>
          </section>

          <div className="composer-dock">
            <div className="composer">
              <div className="composer-head">
                <span>PROMPT</span>
                <span>{workspaceName(workspaceInput)}</span>
              </div>
              <textarea
                aria-label="任务内容"
                value={form.prompt}
                onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
                placeholder="描述需求，或粘贴一段代码…"
                disabled={state.running}
              />
              <div className="composer-bar">
                <div className="composer-controls">
                  <label className="composer-control">
                    <span>模式</span>
                    <select
                      value={form.mode}
                      onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value }))}
                      disabled={state.running}
                    >
                      {(discovery?.routingModes ?? []).map((mode) => (
                        <option value={mode} key={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="composer-control">
                    <span>Agent</span>
                    <select
                      value={form.agent}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          agent: event.target.value,
                          model: "",
                        }))
                      }
                      disabled={state.running}
                    >
                      <option value="">自动选择</option>
                      {agents.map((agent) => (
                        <option value={agent.id} key={agent.id}>
                          {agent.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="composer-control composer-control--model">
                    <span>模型</span>
                    <select
                      value={form.model}
                      onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                      disabled={state.running || models.length === 0}
                    >
                      <option value="">Agent 默认</option>
                      {models.map((model) => (
                        <option value={modelValue(model)} key={`${model.cliId}:${model.modelId}`}>
                          {modelLabel(model)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="composer-actions">
                  <button
                    className="preview-button"
                    disabled={state.running}
                    onClick={() => void previewRoute()}
                    type="button"
                  >
                    <RouteIcon />
                    <span>预览路由</span>
                  </button>
                  {state.running ? (
                    <button
                      aria-label="停止任务"
                      className="send-button send-button--stop"
                      onClick={() => void cancelRun()}
                      title="停止任务"
                      type="button"
                    >
                      <StopIcon />
                    </button>
                  ) : (
                    <button
                      aria-label="开始执行"
                      className="send-button"
                      disabled={!form.prompt.trim()}
                      onClick={() => void startRun()}
                      title="开始执行"
                      type="button"
                    >
                      <ArrowUpIcon />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <p className="composer-note">
              <span>LOCAL EXECUTION</span>
              <span>NO SHELL BRIDGE</span>
              <span>PROTOCOL {state.runtime?.protocolVersion ?? "—"}</span>
            </p>
          </div>
        </main>

        <aside className="sidebar sidebar--right" aria-label="Agent 选择">
          <div className="sidebar-scroll">
            <section className="sidebar-section sidebar-section--agents">
              <div className="sidebar-section-title">
                <span>AGENTS</span>
                <span className="section-count">{agents.filter((agent) => agent.available).length}/{agents.length}</span>
              </div>
              <div className="agent-list">
                {agents.length === 0 ? (
                  <p className="sidebar-empty">{state.loading ? "正在发现可用 Agent…" : "当前工作区没有可用的 Agent。"}</p>
                ) : (
                  agents.map((agent) => (
                    <button
                      className={`agent-row ${form.agent === agent.id ? "agent-row--selected" : ""}`}
                      key={agent.id}
                      onClick={() => selectAgent(agent)}
                      type="button"
                    >
                      <span className="agent-copy">
                        <strong>{agent.label}</strong>
                        <small>{agent.version ?? agent.command}</small>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="sidebar-section sidebar-section--context">
              <div className="sidebar-section-title">
                <span>ROUTING</span>
              </div>
              <div className="context-row">
                <span className="context-icon"><RouteIcon /></span>
                <div>
                  <strong>{selectedAgent?.label ?? "自动选择"}</strong>
                  <span>{form.mode} · {form.model || "default"}</span>
                </div>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
