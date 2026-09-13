import { render, type Instance } from "ink";
import type { ChildProcess } from "node:child_process";

import { getCliAdapter } from "./agents/cli-adapters";
import type { CliId, DetectedCli } from "./models/cli";
import {
  launchInteractive,
  launchWithPromptCaptured,
} from "./runtime/launcher";
import { scanCodingClis } from "./scanner/cli-scanner";
import {
  App,
  type LaunchRequest,
  type RunningTask,
  type SessionOutcome,
} from "./ui/App";

let clis: DetectedCli[] = [];
let isScanning = true;
let initialId: CliId | undefined;
let session: SessionOutcome | null = null;
let running: RunningTask | null = null;
let activeChild: ChildProcess | null = null;
let app: Instance | undefined;

function tree() {
  return (
    <App
      clis={clis}
      isScanning={isScanning}
      initialId={initialId}
      session={session}
      running={running}
      onLaunch={(request) => {
        void launch(request);
      }}
      onAbort={() => {
        activeChild?.kill("SIGTERM");
      }}
      onExit={() => {
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

/**
 * 交互模式必须继承 stdio：Ink 先卸载，把终端完整交给 agent 的 REPL，
 * 退出后重新挂载。此时拿不到结构化输出，结果屏只有退出状态。
 */
async function waitForInteractiveSession(
  request: LaunchRequest,
  detected: DetectedCli,
  adapter: ReturnType<typeof getCliAdapter>,
): Promise<SessionOutcome> {
  const startedAt = Date.now();

  try {
    const child = launchInteractive(adapter, {
      binPath: detected.path,
      cwd: process.cwd(),
    });

    const [code, signal] = await waitForChildExit(child);

    return {
      id: request.id,
      code,
      signal,
      durationMs: Date.now() - startedAt,
    };
  } catch {
    return {
      id: request.id,
      code: null,
      signal: null,
      durationMs: Date.now() - startedAt,
    };
  }
}

async function launch(request: LaunchRequest): Promise<void> {
  const detected = clis.find(
    (cli) => cli.id === request.id && cli.available,
  );

  if (!detected) {
    return;
  }

  const adapter = getCliAdapter(request.id);
  initialId = request.id;

  if (request.mode === "interactive") {
    app?.unmount();
    session = await waitForInteractiveSession(request, detected, adapter);
    running = null;
    mount();
    return;
  }

  // 渲染层模式：UI 保持挂载，先切到加载层，子进程输出被捕获，
  // 退出后由 result 屏渲染返回结果。ctrl c 通过 onAbort 中止任务。
  const startedAt = Date.now();
  running = { id: request.id, prompt: request.prompt, startedAt };
  app?.rerender(tree());

  try {
    const handle = launchWithPromptCaptured(adapter, request.prompt, {
      binPath: detected.path,
      cwd: process.cwd(),
    });
    activeChild = handle.child;
    const result = await handle.done;
    session = {
      id: request.id,
      code: result.code,
      signal: result.signal,
      durationMs: Date.now() - startedAt,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch {
    session = {
      id: request.id,
      code: null,
      signal: null,
      durationMs: Date.now() - startedAt,
    };
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
