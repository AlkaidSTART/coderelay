import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { LiquidRouteIndicator } from "./components/LiquidRouteIndicator";
import {
  isNewChatRouteActive,
  isSessionRouteActive,
  isSessionsRouteActive,
  useNavigationStore,
} from "./stores/navigationStore";
import type {
  AgentEntry,
  AgentEvent,
  ConfigSource,
  DiscoveryPayload,
  JevSettings,
  RouteForm,
  RoutePreview,
  RunCompletedPayload,
  RunEventPayload,
  RuntimeStatus,
  SessionDetail,
  SessionRecord,
  SessionUpdatedPayload,
  StartRunResponse,
} from "./types";

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
  recentWorkspaces: string[];
  sessions: SessionRecord[];
  sessionDetail: SessionDetail | null;
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
  recentWorkspaces: [],
  sessions: [],
  sessionDetail: null,
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

function workspaceName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  if (!normalized) {
    return "—";
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
  const seconds = (durationMs / 1000).toFixed(1).replace(/\.0$/, "");
  return `${seconds}s`;
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
      strokeWidth="1.65"
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

function FolderIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
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

function RefreshIcon({ size = 15 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
      <path d="M20 11a8 8 0 1 0-2.34 5.66" />
      <path d="M20 5v6h-6" />
    </Icon>
  );
}

function TerminalIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
      <path d="m5 7 4 4-4 4" />
      <path d="M11 16h7" />
    </Icon>
  );
}

function RouteIcon({ size = 15 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3h-1" />
    </Icon>
  );
}

function ArrowUpIcon({ size = 17 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
      <path d="M12 19V5" />
      <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
    </Icon>
  );
}

function StopIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
    </Icon>
  );
}

function PanelLeftIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M9 3v18" />
    </Icon>
  );
}

function PlusIcon({ size = 15 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  );
}

function ShieldIcon({ size = 14 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Icon>
  );
}

function ChevronDownIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

function CheckIcon({ size = 15 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

function CloseIcon({ size = 14 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

function KeyIcon({ size = 15 }: { size?: number } = {}) {
  return (
    <Icon size={size}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3" />
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

  const view = useNavigationStore((s) => s.view);
  const activeSessionId = useNavigationStore((s) => s.activeSessionId);
  const sidebarCollapsed = useNavigationStore((s) => s.sidebarCollapsed);
  const rightSidebarOpen = useNavigationStore((s) => s.rightSidebarOpen);
  const projectExpanded = useNavigationStore((s) => s.projectExpanded);
  const workspaceDropdownOpen = useNavigationStore((s) => s.workspaceDropdownOpen);

  const setView = useNavigationStore((s) => s.setView);
  const setActiveSessionId = useNavigationStore((s) => s.setActiveSessionId);
  const navigateToNewChat = useNavigationStore((s) => s.navigateToNewChat);
  const navigateToSession = useNavigationStore((s) => s.navigateToSession);
  const navigateToSessions = useNavigationStore((s) => s.navigateToSessions);
  const navigateToConfig = useNavigationStore((s) => s.navigateToConfig);
  const toggleSidebar = useNavigationStore((s) => s.toggleSidebar);
  const setSidebarCollapsed = useNavigationStore((s) => s.setSidebarCollapsed);
  const toggleRightSidebar = useNavigationStore((s) => s.toggleRightSidebar);
  const setWorkspaceDropdownOpen = useNavigationStore((s) => s.setWorkspaceDropdownOpen);

  const activeRunId = useRef<string | null>(null);
  const currentWorkspace = useRef("");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      setActiveSessionId(null);
      setState((current) => ({
        ...current,
        runtime,
        discovery,
        sessions,
        recentWorkspaces: discovery.recentWorkspaces,
        sessionDetail: null,
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
    navigateToSession(sessionId);
    try {
      const detail = await invoke<SessionDetail>("get_session", { sessionId });
      setState((current) => ({
        ...current,
        sessionDetail: detail,
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
        configNotice: "saved",
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
        configNotice: null,
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
      setView("config");
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
    navigateToNewChat();
    setState((current) => ({
      ...current,
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
        setActiveSessionId(payload.sessionId);
        setState((current) => ({
          ...current,
          running: false,
          runId: null,
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

  async function previewRoute(): Promise<void> {
    const prompt = form.prompt.trim();
    if (!prompt) {
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
          sessionId: activeSessionId,
        },
      });
      activeRunId.current = response.runId;
      setActiveSessionId(response.sessionId);
      setState((current) => ({
        ...current,
        running: true,
        runId: response.runId,
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

  const statusTone = state.error
    ? "error"
    : state.loading
      ? "loading"
      : state.running
        ? "running"
        : "ready";
  const showThread = Boolean(
    state.preview || state.output || state.activity.length > 0 || state.result || state.running,
  );

  function renderComposer(compact = false): ReactNode {
    return (
      <div className={`hero-composer-card ${compact ? "hero-composer-card--dock" : ""}`}>
        <textarea
          aria-label="Prompt"
          value={form.prompt}
          onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (form.prompt.trim() && !state.running) {
                void startRun();
              }
            }
          }}
          placeholder="›"
          disabled={state.running}
        />

        <div className="composer-toolbar">
          <div className="composer-toolbar-left">
            <button
              aria-label="Workspace"
              className="composer-action-btn"
              type="button"
              onClick={() => setWorkspaceDropdownOpen((prev) => !prev)}
              title={workspaceInput || "Workspace"}
            >
              <FolderIcon size={14} />
            </button>
            <button
              aria-label="Routing mode"
              className={`composer-action-btn ${form.mode !== "local" ? "composer-action-btn--active" : ""}`}
              type="button"
              onClick={() => {
                const modes = discovery?.routingModes ?? ["local"];
                const nextIdx = (modes.indexOf(form.mode) + 1) % modes.length;
                setForm((current) => ({ ...current, mode: modes[nextIdx] ?? "local" }));
              }}
              title={form.mode}
            >
              <ShieldIcon size={14} />
            </button>
            <button
              aria-label="Route preview"
              className="composer-action-btn"
              disabled={!form.prompt.trim()}
              type="button"
              onClick={() => void previewRoute()}
              title="Route preview"
            >
              <RouteIcon size={14} />
            </button>
          </div>

          <div className="composer-toolbar-right">
            <div className="model-select-capsule" title={form.model || selectedAgent?.label || "Auto"}>
              <select
                aria-label="Model"
                value={form.agent ? `${form.agent}:::${form.model}` : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setForm((c) => ({ ...c, agent: "", model: "" }));
                  } else {
                    const [agentId, modelId] = val.split(":::");
                    setForm((c) => ({ ...c, agent: agentId ?? "", model: modelId ?? "" }));
                  }
                }}
                disabled={state.running}
              >
                <option value="">Auto</option>
                {agents.map((agent) => (
                  <optgroup key={agent.id} label={agent.label}>
                    <option value={`${agent.id}:::`}>{agent.label}</option>
                    {discovery?.catalog.options
                      .filter((m) => m.cliId === agent.id && m.available)
                      .map((m) => (
                        <option key={`${agent.id}:::${m.modelId}`} value={`${agent.id}:::${m.modelId}`}>
                          {m.label || m.modelId}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <span className="model-capsule-label">
                {form.model ? form.model : selectedAgent ? selectedAgent.label : "Auto"}
              </span>
              <ChevronDownIcon size={11} />
            </div>

            {state.running ? (
              <motion.button
                aria-label="Stop"
                className="circle-send-btn circle-send-btn--stop"
                onClick={() => void cancelRun()}
                title="Stop"
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
              >
                <StopIcon size={12} />
              </motion.button>
            ) : (
              <motion.button
                aria-label="Run"
                className={`circle-send-btn ${form.prompt.trim() ? "circle-send-btn--active" : ""}`}
                disabled={!form.prompt.trim()}
                onClick={() => void startRun()}
                title="Run"
                type="button"
                whileHover={form.prompt.trim() ? { scale: 1.05 } : undefined}
                whileTap={form.prompt.trim() ? { scale: 0.94 } : undefined}
              >
                <ArrowUpIcon size={16} />
              </motion.button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar-brand" data-tauri-drag-region />
        <div className="titlebar-spacer" data-tauri-drag-region />
        <div className="titlebar-actions">
          <span
            className="status-dot"
            data-tone={statusTone}
            title={state.runtime?.coreVersion ? `v${state.runtime.coreVersion}` : statusTone}
          />
          <button
            aria-label="Agents"
            className={`icon-button ${rightSidebarOpen ? "icon-button--active" : ""}`}
            onClick={toggleRightSidebar}
            title="Agents"
            type="button"
          >
            <TerminalIcon size={15} />
          </button>
        </div>
      </header>

      <div
        className="app-layout"
        data-sidebar-collapsed={sidebarCollapsed}
        data-right-sidebar-open={rightSidebarOpen}
      >
        <nav className="icon-rail" aria-label="Navigation">
          <div className="rail-nav">
            <button
              aria-label="Toggle sidebar"
              className="rail-action rail-action--toggle"
              onClick={toggleSidebar}
              title="⌘B"
              type="button"
            >
              <PanelLeftIcon size={17} />
            </button>
            <button
              aria-label="Workspace"
              className={`rail-action ${state.view === "workspace" ? "rail-action--active" : ""}`}
              onClick={() => {
                setState((current) => ({ ...current, view: "workspace" }));
              }}
              title="Workspace"
              type="button"
            >
              {state.view === "workspace" ? (
                <motion.div
                  className="rail-action-bg"
                  layoutId="rail-active-pill"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                />
              ) : null}
              <HomeIcon />
            </button>
            <button
              aria-label="Sessions"
              className={`rail-action ${state.view === "sessions" ? "rail-action--active" : ""}`}
              onClick={() => {
                setState((current) => ({ ...current, view: "sessions" }));
                void refreshSessions(currentWorkspace.current);
              }}
              title="Sessions"
              type="button"
            >
              {state.view === "sessions" ? (
                <motion.div
                  className="rail-action-bg"
                  layoutId="rail-active-pill"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                />
              ) : null}
              <HistoryIcon />
            </button>
            <button
              aria-label="New"
              className="rail-action"
              onClick={startNewTask}
              title="New"
              type="button"
            >
              <PlusIcon size={16} />
            </button>
          </div>
          <div className="rail-footer">
            <button
              aria-label="Settings"
              className={`rail-action ${state.view === "config" ? "rail-action--active" : ""}`}
              onClick={() => {
                setState((current) => ({ ...current, view: "config" }));
                void Promise.all([loadConfigSource(), loadJevSettings()]);
              }}
              title="Settings"
              type="button"
            >
              {state.view === "config" ? (
                <motion.div
                  className="rail-action-bg"
                  layoutId="rail-active-pill"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                />
              ) : null}
              <SettingsIcon />
            </button>
          </div>
        </nav>

        <aside className={`sidebar ${sidebarCollapsed ? "sidebar--collapsed" : ""}`}>
          <div className="sidebar-header">
            <div className="brand-dropdown-wrap">
              <button
                className="brand-lockup-btn"
                type="button"
                onClick={() => setWorkspaceDropdownOpen((prev) => !prev)}
                title={workspaceInput}
              >
                <FolderIcon size={15} />
                <span className="brand-title">{workspaceName(workspaceInput)}</span>
                <ChevronDownIcon size={11} />
              </button>
              <AnimatePresence>
                {workspaceDropdownOpen ? (
                  <motion.div
                    className="workspace-dropdown"
                    initial={{ opacity: 0, scale: 0.96, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -4 }}
                    transition={{ duration: 0.14, ease: "easeOut" }}
                  >
                    <div className="workspace-dropdown-current" title={workspaceInput}>
                      <FolderIcon size={14} />
                      <span>{workspaceInput}</span>
                    </div>
                    {state.recentWorkspaces.length > 0 ? (
                      <div className="workspace-dropdown-list">
                        {state.recentWorkspaces.map((ws) => (
                          <button
                            key={ws}
                            type="button"
                            className={`workspace-dropdown-item ${ws === workspaceInput ? "workspace-dropdown-item--active" : ""}`}
                            onClick={() => {
                              setWorkspaceDropdownOpen(false);
                              void loadDiscovery(ws);
                            }}
                            title={ws}
                          >
                            <FolderIcon size={14} />
                            <span>{workspaceName(ws)}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="sidebar-header-actions">
              <button
                aria-label="New"
                className="icon-button"
                onClick={startNewTask}
                title="New"
                type="button"
              >
                <PlusIcon size={14} />
              </button>
              <button
                aria-label="Refresh"
                className="icon-button"
                disabled={state.loading}
                onClick={() => void loadDiscovery(workspaceInput)}
                title="Refresh"
                type="button"
              >
                <RefreshIcon size={14} />
              </button>
            </div>
          </div>

          <div className="sidebar-scroll">
            <div className="project-tree-section">
              <div className="tree-sub-list">
                {state.sessions.slice(0, 12).map((session) => (
                  <button
                    className={`tree-session-link ${state.activeSessionId === session.id ? "tree-session-link--active" : ""}`}
                    key={session.id}
                    onClick={() => {
                      setState((current) => ({ ...current, view: "workspace" }));
                      void openSession(session.id);
                    }}
                    title={session.title}
                    type="button"
                  >
                    <span className="tree-session-title">{session.title}</span>
                  </button>
                ))}
                {state.sessions.length > 12 ? (
                  <button
                    className="tree-session-more-btn"
                    onClick={() => {
                      setState((current) => ({ ...current, view: "sessions" }));
                      void refreshSessions(currentWorkspace.current);
                    }}
                    title={`${state.sessions.length}`}
                    type="button"
                  >
                    ···
                  </button>
                ) : null}
              </div>

              {state.recentWorkspaces
                .filter((ws) => ws !== workspaceInput)
                .slice(0, 4)
                .map((ws) => (
                  <div className="tree-project-item" key={ws}>
                    <button
                      className="tree-other-project-btn"
                      onClick={() => void loadDiscovery(ws)}
                      title={ws}
                      type="button"
                    >
                      <FolderIcon size={14} />
                      <span className="tree-project-name">{workspaceName(ws)}</span>
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </aside>

        <main className="main-panel" data-view={state.view}>
          <AnimatePresence mode="wait">
            {state.view === "workspace" ? (
              <motion.section
                key="workspace"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                className="conversation"
                aria-live="polite"
              >
                <div className="conversation-inner">
                  <AnimatePresence>
                    {state.error ? (
                      <motion.div
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -6, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="alert"
                        role="alert"
                      >
                        <span>{state.error}</span>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <AnimatePresence mode="wait">
                    {!showThread ? (
                      <motion.div
                        key="welcome-hero"
                        initial={{ opacity: 0, scale: 0.985, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.985, y: -10 }}
                        transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
                        className="welcome-hero-container"
                      >
                        {renderComposer(false)}
                      </motion.div>
                    ) : (
                      <motion.article
                        key="assistant-message"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
                        className="assistant-message"
                      >
                        <div className="message-header">
                          <span className="status-dot" data-tone={state.running ? "running" : "ready"} />
                          {state.result ? (
                            <span className="run-duration">{formatDuration(state.result.durationMs)}</span>
                          ) : null}
                          {state.result?.code !== undefined && state.result.code !== null && state.result.code !== 0 ? (
                            <span className="run-state">{state.result.code}</span>
                          ) : null}
                        </div>

                        <AnimatePresence>
                          {state.preview ? (
                            <motion.div
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 4 }}
                              transition={{ duration: 0.16 }}
                              className="route-preview"
                            >
                              <RouteIcon size={13} />
                              <strong>
                                {state.preview.agent}
                                {state.preview.model ? ` · ${state.preview.model}` : ""}
                              </strong>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>

                        <div className={`message-copy ${state.running ? "message-copy--running" : ""}`}>
                          {state.output}
                          {state.running && !state.output ? (
                            <span className="typing-dots" aria-hidden="true">
                              <i />
                              <i />
                              <i />
                            </span>
                          ) : null}
                        </div>

                        <AnimatePresence>
                          {state.activity.length > 0 ? (
                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 6 }}
                              transition={{ duration: 0.18 }}
                              className="activity-log"
                            >
                              <div className="activity-head">
                                <span className="activity-label">
                                  <TerminalIcon size={13} />
                                </span>
                                <span>{state.activity.length}</span>
                              </div>
                              <div className="activity-body">
                                {state.activity.map((entry, index) => (
                                  <div className="activity-row" key={`${index}-${entry}`}>
                                    <span className="activity-prefix">›</span>
                                    <span>{entry}</span>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </motion.article>
                    )}
                  </AnimatePresence>
                </div>
              </motion.section>
            ) : state.view === "sessions" ? (
              <motion.section
                key="sessions"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                className="secondary-view"
                aria-live="polite"
              >
                <div className="secondary-page">
                  <div className="secondary-header">
                    <span className="secondary-path">{workspaceName(workspaceInput)}</span>
                    <button
                      aria-label="Refresh"
                      className="icon-button"
                      onClick={() => void refreshSessions(currentWorkspace.current)}
                      title="Refresh"
                      type="button"
                    >
                      <RefreshIcon size={15} />
                    </button>
                  </div>

                  <div className="session-layout">
                    <div className="session-list">
                      {state.sessions.length === 0 ? (
                        <div className="secondary-empty">
                          <HistoryIcon />
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
                      <AnimatePresence mode="wait">
                        {state.sessionDetail ? (
                          <motion.div
                            key={state.sessionDetail.session.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                          >
                            <div className="session-detail-head">
                              <h3>{state.sessionDetail.session.title}</h3>
                              <button
                                aria-label="Continue"
                                className="circle-send-btn circle-send-btn--active"
                                onClick={() => {
                                  setState((current) => ({ ...current, view: "workspace" }));
                                  setForm((current) => ({ ...current, prompt: "" }));
                                }}
                                title="Continue"
                                type="button"
                              >
                                <ArrowUpIcon size={15} />
                              </button>
                            </div>
                            <div className="turn-list">
                              {state.sessionDetail.turns.map((turn) => (
                                <article className="turn-card" key={turn.id}>
                                  <div className="turn-meta">
                                    <span>{turn.cliId}</span>
                                    {turn.modelId ? <span>{turn.modelId}</span> : null}
                                  </div>
                                  <div className="turn-prompt">{turn.prompt}</div>
                                  {turn.output ? <pre className="turn-output">{turn.output}</pre> : null}
                                </article>
                              ))}
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="session-empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="secondary-empty"
                          >
                            <TerminalIcon />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </motion.section>
            ) : (
              <motion.section
                key="config"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                className="secondary-view config-page"
                aria-live="polite"
              >
                <div className="secondary-page config-page">
                  <div className="secondary-header">
                    <span className="secondary-path">{state.configSource?.path ?? ""}</span>
                    <div className="config-actions">
                      <button
                        aria-label="Reload"
                        className="icon-button"
                        disabled={state.configBusy}
                        onClick={() => void loadConfigSource()}
                        title="Reload"
                        type="button"
                      >
                        <RefreshIcon size={15} />
                      </button>
                      <button
                        aria-label="Save"
                        className="circle-send-btn circle-send-btn--active"
                        disabled={state.configBusy || !state.configDraft.trim()}
                        onClick={() => void saveConfig()}
                        title="Save"
                        type="button"
                      >
                        <CheckIcon size={15} />
                      </button>
                    </div>
                  </div>

                  <section className="credential-bar" aria-label="API Key">
                    <KeyIcon size={15} />
                    <span
                      className="status-dot"
                      data-tone={
                        state.jevSettings?.stored || state.jevSettings?.environmentConfigured
                          ? "ready"
                          : "idle"
                      }
                    />
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
                      placeholder="TYPESAFE_API_KEY"
                      spellCheck={false}
                      type="password"
                      value={state.jevApiKeyInput}
                    />
                    <button
                      aria-label="Save API Key"
                      className="icon-button"
                      disabled={state.jevBusy || !state.jevApiKeyInput.trim()}
                      onClick={() => void saveJevApiKey()}
                      title="Save"
                      type="button"
                    >
                      <CheckIcon size={14} />
                    </button>
                    {state.jevSettings?.stored ? (
                      <button
                        aria-label="Clear API Key"
                        className="icon-button"
                        disabled={state.jevBusy}
                        onClick={() => void clearJevApiKey()}
                        title="Clear"
                        type="button"
                      >
                        <CloseIcon size={14} />
                      </button>
                    ) : null}
                  </section>

                  <textarea
                    aria-label="Config YAML"
                    className="config-editor"
                    onChange={(event) =>
                      setState((current) => ({ ...current, configDraft: event.target.value }))
                    }
                    spellCheck={false}
                    value={state.configDraft}
                  />
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {state.view === "workspace" && showThread ? (
              <motion.div
                key="composer-dock"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                className="composer-dock"
              >
                {renderComposer(true)}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>

        <aside
          className={`sidebar sidebar--right ${rightSidebarOpen ? "sidebar--right-open" : "sidebar--right-collapsed"}`}
          aria-label="Agents"
        >
          <div className="sidebar-scroll">
            <div className="agent-list">
              {agents.map((agent) => (
                <button
                  className={`agent-row ${form.agent === agent.id ? "agent-row--selected" : ""}`}
                  key={agent.id}
                  onClick={() => selectAgent(agent)}
                  title={agent.version ?? agent.command}
                  type="button"
                >
                  <span className={`agent-status ${agent.available ? "agent-status--ready" : ""}`} />
                  <span className="agent-copy">
                    <strong>{agent.label}</strong>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
