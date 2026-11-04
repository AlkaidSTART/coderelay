import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import type { AgentDescriptor, RuntimeStatus } from "./types";

interface ScaffoldState {
  readonly status: "loading" | "ready" | "error";
  readonly agents: readonly AgentDescriptor[];
  readonly runtime: RuntimeStatus | null;
  readonly error: string | null;
}

const INITIAL_STATE: ScaffoldState = {
  status: "loading",
  agents: [],
  runtime: null,
  error: null,
};

export function App() {
  const [state, setState] = useState<ScaffoldState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;

    Promise.all([
      invoke<RuntimeStatus>("runtime_status"),
      invoke<AgentDescriptor[]>("supported_agents"),
    ])
      .then(([runtime, agents]) => {
        if (!active) {
          return;
        }
        setState({ status: "ready", agents, runtime, error: null });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setState({
          status: "error",
          agents: [],
          runtime: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      active = false;
    };
  }, []);

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
        <span className={`signal signal--${state.status}`}>
          {state.status === "ready" ? "Rust core connected" : state.status}
        </span>
      </header>

      <section className="hero">
        <div>
          <p className="section-label">Desktop foundation</p>
          <h2>一个内核，两个入口。</h2>
          <p className="lede">
            Tauri 桌面端和轻量 CLI 直接共享 Rust 核心。当前页面只读取真实
            core 返回的 Agent 目录与协议版本。
          </p>
        </div>
        <dl className="runtime-card">
          <div>
            <dt>Core</dt>
            <dd>{state.runtime?.coreVersion ?? "—"}</dd>
          </div>
          <div>
            <dt>Protocol</dt>
            <dd>{state.runtime?.protocolVersion ?? "—"}</dd>
          </div>
          <div>
            <dt>Transport</dt>
            <dd>{state.runtime?.transport ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="agents" aria-labelledby="agents-title">
        <div className="section-heading">
          <div>
            <p className="section-label">Canonical catalog</p>
            <h2 id="agents-title">Supported agents</h2>
          </div>
          <span className="count">{state.agents.length.toString().padStart(2, "0")}</span>
        </div>

        {state.status === "loading" ? (
          <p className="notice">正在连接 Rust core…</p>
        ) : null}

        {state.error ? (
          <div className="notice notice--error">
            <strong>无法连接 Tauri command。</strong>
            <span>{state.error}</span>
            <span>请使用 `bun run desktop:dev` 从 Tauri 启动。</span>
          </div>
        ) : null}

        {state.status === "ready" ? (
          <div className="agent-grid">
            {state.agents.map((agent, index) => (
              <article className="agent-card" key={agent.id}>
                <span className="ordinal">
                  {(index + 1).toString().padStart(2, "0")}
                </span>
                <div>
                  <h3>{agent.displayName}</h3>
                  <code>{agent.binary}</code>
                </div>
                <span className="agent-state">ready</span>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <footer>
        <span>Rust Core + Tauri 2 scaffold</span>
        <span>No Bun sidecar · No duplicated routing</span>
      </footer>
    </main>
  );
}
