import { once } from "node:events";

import { render, type Instance } from "ink";

import { getCliAdapter } from "./agents/cli-adapters";
import type { CliId, DetectedCli } from "./models/cli";
import { launchInteractive, launchWithPrompt } from "./runtime/launcher";
import { scanCodingClis } from "./scanner/cli-scanner";
import {
  App,
  type LaunchRequest,
  type SessionOutcome,
} from "./ui/App";

let clis: DetectedCli[] = [];
let isScanning = true;
let initialId: CliId | undefined;
let session: SessionOutcome | null = null;
let app: Instance | undefined;

function tree() {
  return (
    <App
      clis={clis}
      isScanning={isScanning}
      initialId={initialId}
      session={session}
      onLaunch={(request) => {
        void launch(request);
      }}
      onExit={() => {
        app?.unmount();
        process.exit(0);
      }}
    />
  );
}

function mount(): void {
  app = render(tree(), { exitOnCtrlC: false });
}

async function waitForSession(
  request: LaunchRequest,
  detected: DetectedCli,
  adapter: ReturnType<typeof getCliAdapter>,
): Promise<SessionOutcome> {
  const startedAt = Date.now();

  try {
    const child = request.mode === "prompt"
      ? launchWithPrompt(adapter, request.prompt, {
          binPath: detected.path,
          cwd: process.cwd(),
        })
      : launchInteractive(adapter, {
          binPath: detected.path,
          cwd: process.cwd(),
        });

    const [code, signal] = (await once(child, "exit")) as [
      number | null,
      NodeJS.Signals | null,
    ];

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
  app?.unmount();
  session = await waitForSession(request, detected, adapter);
  initialId = request.id;
  mount();
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
