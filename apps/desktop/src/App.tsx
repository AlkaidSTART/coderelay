import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

import type {
  AgentEntry,
  AgentEvent,
  DiscoveryPayload,
  ModelOption,
  RoutePreview,
  RunCompletedPayload,
  RunEventPayload,
  RuntimeStatus,
  StartRunResponse,
} from "./types";

interface RouteForm {
  prompt: string;
  mode: string;
  agent: string;
  model: string;
}

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
      setState((current) => ({
        ...current,
        runtime,
        discovery,
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
          result: payload.result,
          output: payload.result.text || current.output,
        }));
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
        },
      });
      activeRunId.current = response.runId;
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

  return (
    <main className="shell">
      <header className="masthead">
        <div className="brand">
          <span className="mark">CR</span>
          <div>
            <p className="eyebrow">Local agent control plane</p>
            <h1>CodeRelay</h1>
          </div>
        </div>
        <div className="system-line">
          <span className={`signal signal--${state.error ? "error" : state.loading ? "loading" : "ready"}`}>
            {state.loading ? "Scanning" : state.error ? "Needs attention" : "Rust core connected"}
          </span>
          <span className="protocol">
            protocol {state.runtime?.protocolVersion ?? "—"}
          </span>
        </div>
      </header>

      <div className="workspace-row">
        <label htmlFor="workspace">Workspace</label>
        <input
          id="workspace"
          value={workspaceInput}
          onChange={(event) => setWorkspaceInput(event.target.value)}
          placeholder="当前工作区"
          spellCheck={false}
        />
        <button className="quiet-button" onClick={() => void loadDiscovery(workspaceInput)} disabled={state.loading}>
          重新扫描
        </button>
      </div>

      {state.error ? <div className="alert">{state.error}</div> : null}

      <div className="workbench">
        <aside className="agent-rail">
          <div className="section-heading">
            <div>
              <p className="section-label">Discovery</p>
              <h2>Agents</h2>
            </div>
            <span className="count">{agents.length.toString().padStart(2, "0")}</span>
          </div>

          <div className="agent-stack">
            {agents.map((agent, index) => (
              <button
                className={`agent-row ${form.agent === agent.id ? "agent-row--selected" : ""}`}
                key={agent.id}
                onClick={() => selectAgent(agent)}
              >
                <span className="ordinal">{(index + 1).toString().padStart(2, "0")}</span>
                <span className="agent-copy">
                  <strong>{agent.label}</strong>
                  <small>{agent.version ?? agent.command}</small>
                </span>
                <span className={`availability ${agent.available ? "availability--ready" : ""}`}>
                  {agent.available ? "ready" : "missing"}
                </span>
              </button>
            ))}
          </div>

          <div className="model-card">
            <p className="section-label">Selected model</p>
            <strong>{selectedAgent?.label ?? "Auto route"}</strong>
            <span>
              {selectedAgent
                ? `${selectedAgent.runtime} · ${selectedAgent.source}`
                : "由规则和评分选择最合适的 Agent"}
            </span>
          </div>
        </aside>

        <section className="main-stage">
          <div className="composer-card">
            <div className="composer-head">
              <div>
                <p className="section-label">Task</p>
                <h2>把任务交给最合适的 Agent。</h2>
              </div>
              <span className="runtime-chip">{state.runtime?.transport ?? "in-process"}</span>
            </div>

            <textarea
              value={form.prompt}
              onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
              placeholder="描述要完成的任务，例如：修复认证中间件测试并解释根因……"
              disabled={state.running}
            />

            <div className="controls">
              <label>
                Mode
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

              <label>
                Agent
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
                  <option value="">Auto route</option>
                  {agents.map((agent) => (
                    <option value={agent.id} key={agent.id}>
                      {agent.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Model
                <select
                  value={form.model}
                  onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                  disabled={state.running || models.length === 0}
                >
                  <option value="">Agent default</option>
                  {models.map((model) => (
                    <option value={modelValue(model)} key={`${model.cliId}:${model.modelId}`}>
                      {modelLabel(model)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="actions">
              <button className="quiet-button" onClick={() => void previewRoute()} disabled={state.running}>
                预览路由
              </button>
              {state.running ? (
                <button className="primary-button primary-button--stop" onClick={() => void cancelRun()}>
                  停止任务
                </button>
              ) : (
                <button className="primary-button" onClick={() => void startRun()} disabled={!form.prompt.trim()}>
                  开始执行
                </button>
              )}
            </div>
          </div>

          {state.preview ? (
            <div className="route-preview">
              <div>
                <p className="section-label">Route</p>
                <strong>
                  {state.preview.agent}
                  {state.preview.model ? `:${state.preview.model}` : ""}
                </strong>
              </div>
              <p>{state.preview.reasons.join(" · ") || "explicit target"}</p>
            </div>
          ) : null}

          <section className="output-panel">
            <div className="output-head">
              <div>
                <p className="section-label">Live stream</p>
                <h2>Agent output</h2>
              </div>
              <span className={`run-state ${state.running ? "run-state--running" : ""}`}>
                {state.running ? "running" : state.result?.status ?? "idle"}
              </span>
            </div>

            <pre className="terminal">{state.output || (state.running ? "等待 Agent 输出…" : "运行结果会在这里实时出现。")}</pre>

            <div className="activity">
              {state.activity.length === 0 ? (
                <span className="activity-empty">No activity yet</span>
              ) : (
                state.activity.map((entry, index) => (
                  <span key={`${index}-${entry}`}>{entry}</span>
                ))
              )}
            </div>

            {state.result ? (
              <div className="result-strip">
                <span>status: {state.result.status}</span>
                <span>exit: {state.result.code ?? "—"}</span>
                <span>duration: {state.result.durationMs}ms</span>
              </div>
            ) : null}
          </section>
        </section>
      </div>

      <footer>
        <span>Rust Core + Tauri 2</span>
        <span>No shell bridge · Domain commands only</span>
      </footer>
    </main>
  );
}
