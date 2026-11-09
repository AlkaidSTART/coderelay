import { createInterface } from "node:readline";

import packageManifest from "../../package.json";

const lines = createInterface({ input: process.stdin });

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

lines.on("line", (line) => {
  let request: {
    protocolVersion: number;
    requestId: string;
    method: string;
    params?: unknown;
  };
  try {
    request = JSON.parse(line) as typeof request;
  } catch {
    return;
  }

  if (request.method === "status") {
    write({
      status: "ok",
      protocolVersion: 1,
      requestId: request.requestId,
      result: {
        coreVersion: packageManifest.version,
        protocolVersion: 1,
        transport: "stdio",
      },
    });
    return;
  }

  if (request.method === "discoverAgents") {
    write({
      status: "ok",
      protocolVersion: 1,
      requestId: request.requestId,
      result: {
        cwd: "/fixture/workspace",
        configPath: null,
        defaultAgent: "codex",
        routingModes: ["local", "manual", "jev"],
        detected: [
          {
            id: "codex",
            bin: "codex",
            path: "/fixture/codex",
            version: "1.2.3",
            available: true,
            runtime: "local",
            source: "path",
            candidates: [
              {
                path: "/fixture/codex",
                runtime: "local",
                source: "path",
                version: "1.2.3",
              },
            ],
            diagnostics: [],
          },
        ],
      },
    });
    return;
  }

  if (request.method === "startRun") {
    const runId = "run-fixture";
    const sessionId = "session-fixture";
    write({
      status: "ok",
      protocolVersion: 1,
      requestId: request.requestId,
      result: {
        runId,
        sessionId,
        agent: "codex",
        model: "gpt-5",
        reasons: ["fixture route"],
      },
    });
    if (process.env.CODERELAY_FIXTURE_RUN_MODE === "exit") {
      process.stdout.write("", () => process.exit(17));
      return;
    }
    if (process.env.CODERELAY_FIXTURE_RUN_MODE === "wait") {
      return;
    }
    write({
      protocolVersion: 1,
      runId,
      sessionId,
      event: { kind: "assistant_text", text: "hello " },
    });
    write({
      protocolVersion: 1,
      runId,
      sessionId,
      event: { kind: "assistant_text", text: "sdk" },
    });
    write({
      protocolVersion: 1,
      runId,
      sessionId,
      result: {
        status: "completed",
        code: 0,
        signal: null,
        durationMs: 25,
        timedOut: false,
        text: "hello sdk",
        stderrTail: "",
        events: [],
      },
    });
    return;
  }

  if (request.method === "cancelRun") {
    write({
      status: "ok",
      protocolVersion: 1,
      requestId: request.requestId,
      result: { cancelled: true },
    });
    return;
  }

  write({
    status: "error",
    protocolVersion: 1,
    requestId: request.requestId,
    error: {
      code: "invalidRequest",
      message: `unknown method ${request.method}`,
      retryable: false,
    },
  });
});
