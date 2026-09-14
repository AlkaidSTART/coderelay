#!/usr/bin/env bun
import { render, type Instance } from "ink";
import type { ChildProcess } from "node:child_process";

import { getCliAdapter } from "./agents/cli-adapters";
import type { CliId, DetectedCli } from "./models/cli";
import type { SessionTurn } from "./models/session";
import {
  launchInteractive,
  launchWithPromptCaptured,
} from "./runtime/launcher";
import { buildPromptWithContext } from "./session/context";
import {
  createSessionStore,
  defaultSessionDbPath,
  type SessionStore,
} from "./session/store";
import { scanCodingClis } from "./scanner/cli-scanner";
import { App, type LaunchRequest, type RunningTask } from "./ui/App";

let clis: DetectedCli[] = [];
let isScanning = true;
let initialId: CliId | undefined;
let turns: readonly SessionTurn[] = [];
let running: RunningTask | null = null;
let activeChild: ChildProcess | null = null;
let sessionId: string | null = null;
let store: SessionStore | undefined;
let app: Instance | undefined;

function getStore(): SessionStore {
  if (!store) {
    store = createSessionStore(defaultSessionDbPath());
  }
  return store;
}

function tree() {
  return (
    <App
      clis={clis}
      isScanning={isScanning}
      initialId={initialId}
      turns={turns}
      running={running}
      onLaunch={(request) => {
        void launch(request);
      }}
      onAbort={() => {
        activeChild?.kill("SIGTERM");
      }}
      onNewSession={() => {
        sessionId = null;
        turns = [];
        app?.rerender(tree());
      }}
      onExit={() => {
        store?.close();
        app?.unmount();
        process.exit(0);
      }}
    />
  );
}

function waitForChildExit(
  child: ReturnType<typeof launchInteractive>,
): Promise<[number | null, NodeJS.Signals | null]> {
  return new Promise((resolve, reject) => {
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      resolve([code, signal]);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      child.off("exit", onExit);
      child.off("error", onError);
    };

    child.once("exit", onExit);
    child.once("error", onError);
  });
}

function mount(): void {
  app = render(tree(), { exitOnCtrlC: false });
}

async function launch(request: LaunchRequest): Promise<void> {
  const detected = clis.find(
    (cli) => cli.id === request.id && cli.available,
  );

  if (!detected || running) {
    return;
  }

  const adapter = getCliAdapter(request.id);
  initialId = request.id;

  if (request.mode === "interactive") {
    // 交互模式必须继承 stdio：Ink 先卸载，把终端完整交给 agent 的
    // REPL，退出后重挂载。交互输出无法捕获，不写入会话层。
    app?.unmount();
    try {
      const child = launchInteractive(adapter, {
        binPath: detected.path,
        cwd: process.cwd(),
      });
      await waitForChildExit(child);
    } catch {
      // 启动失败不打断流程，回到界面由用户重试。
    }
    mount();
    return;
  }

  // 渲染层模式：UI 保持挂载，输出被捕获后写入会话层（SQLite）。
  // 跨 CLI 的上下文由 buildPromptWithContext 统一回放，切换 agent
  // （/model）后新 CLI 也能接上此前所有轮次。
  const sessionStore = getStore();
  const startedAt = Date.now();
  let currentSessionId = sessionId;
  if (!currentSessionId) {
    currentSessionId = sessionStore
      .createSession(request.id, request.prompt.slice(0, 60))
      .id;
    sessionId = currentSessionId;
  }

  const finalPrompt = buildPromptWithContext(
    sessionStore.listTurns(currentSessionId),
    request.prompt,
  );
  running = { id: request.id, prompt: request.prompt, startedAt };
  app?.rerender(tree());

  try {
    const handle = launchWithPromptCaptured(adapter, finalPrompt, {
      binPath: detected.path,
      cwd: process.cwd(),
    });
    activeChild = handle.child;
    const result = await handle.done;
    const failed =
      result.signal !== null ||
      (result.code !== null && result.code !== 0);
    const output =
      failed && result.stderr.trim() ? result.stderr : result.stdout;

    sessionStore.appendTurn({
      sessionId: currentSessionId,
      cliId: request.id,
      prompt: request.prompt,
      output,
      exitCode: result.code,
      signal: result.signal,
      durationMs: Date.now() - startedAt,
    });
    turns = sessionStore.listTurns(currentSessionId);
  } catch {
    // 启动或存储异常时不阻塞界面，回到输入态由用户重试。
  } finally {
    activeChild = null;
    running = null;
  }

  app?.rerender(tree());
}

mount();

void scanCodingClis()
  .then((detected) => {
    clis = detected;
    isScanning = false;
    app?.rerender(tree());
  })
  .catch(() => {
    clis = [];
    isScanning = false;
    app?.rerender(tree());
  });
