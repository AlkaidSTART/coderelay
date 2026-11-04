import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import { CoderelayClient } from "../src";

const FIXTURE = fileURLToPath(new URL("./fixtures/fake-host.ts", import.meta.url));
const clients: CoderelayClient[] = [];

function client(): CoderelayClient {
  const instance = new CoderelayClient({
    command: process.execPath,
    args: [FIXTURE],
  });
  clients.push(instance);
  return instance;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((instance) => instance.close()));
});

describe("CoderelayClient", () => {
  test("performs typed requests and preserves camelCase fields", async () => {
    const sdk = client();
    const [status, discovery] = await Promise.all([
      sdk.status(),
      sdk.discoverAgents({ cwd: "/fixture/workspace" }),
    ]);

    expect(status.coreVersion).toBe("0.3.3");
    expect(status.protocolVersion).toBe(1);
    expect(status.transport).toBe("stdio");
    expect(discovery.defaultAgent).toBe("codex");
    expect(discovery.detected[0]?.candidates[0]?.path).toBe("/fixture/codex");
  });

  test("buffers run events even when they arrive before the caller receives the handle", async () => {
    const sdk = client();
    const run = await sdk.run({
      request: { prompt: "say hello" },
      mode: "manual",
      agent: "codex",
      model: "gpt-5",
    });

    expect(run.runId).toBe("run-fixture");
    expect(run.sessionId).toBe("session-fixture");
    expect(run.model).toBe("gpt-5");

    const observed: string[] = [];
    for await (const event of run) {
      if (event.kind === "assistant_text") {
        observed.push(event.text);
      }
    }
    expect(observed).toEqual(["hello ", "sdk"]);

    const result = await run.completed;
    expect(result.status).toBe("completed");
    expect(result.code).toBe(0);
    expect(result.text).toBe("hello sdk");
  });

  test("delegates cancellation to the host", async () => {
    const sdk = client();
    const response = await sdk.cancelRun("run-fixture");
    expect(response.cancelled).toBe(true);
  });
});
