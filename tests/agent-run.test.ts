import { describe, expect, test } from "bun:test";

import type { AgentEvent } from "../src/models/agent-events";
import { runAgentStream } from "../src/runtime/agent-run";

const FIXTURE = new URL("./fixtures/mock-cli.ts", import.meta.url).pathname;
const NODE = process.execPath;

function collect(
  cmd: readonly string[],
  opts?: { readonly protocol?: "structured" | "text"; readonly timeoutMs?: number },
): { readonly events: AgentEvent[]; readonly done: Promise<Awaited<ReturnType<typeof runAgentStream>["done"]>>; readonly handle: ReturnType<typeof runAgentStream> } {
  const events: AgentEvent[] = [];
  const handle = runAgentStream({
    cmd,
    protocol: opts?.protocol ?? "text",
    timeoutMs: opts?.timeoutMs,
    onEvent: (event) => {
      events.push(event);
    },
  });
  return { events, done: handle.done, handle };
}

function assistantText(events: readonly AgentEvent[]): string {
  return events
    .filter((e) => e.kind === "assistant_text")
    .map((e) => (e.kind === "assistant_text" ? e.text : ""))
    .join("");
}

describe("runAgentStream", () => {
  test("emits assistant_text as stdout chunks arrive", async () => {
    const { events, done } = collect([NODE, FIXTURE, "chunked"]);
    const result = await done;
    expect(result.status).toBe("completed");
    const text = assistantText(events);
    expect(text).toContain("hello");
    expect(text).toContain("world");
  });

  test("stderr does not block stdout and still completes", async () => {
    const { events, done } = collect([NODE, FIXTURE, "stderr-flood"]);
    const result = await done;
    expect(result.status).toBe("completed");
    expect(events.some((e) => e.kind === "stderr")).toBe(true);
    expect(assistantText(events)).toContain("done");
  });

  test("joins JSON split across chunks into a tool event", async () => {
    const { events, done } = collect([NODE, FIXTURE, "split-json"], { protocol: "structured" });
    const result = await done;
    expect(result.status).toBe("completed");
    expect(events).toContainEqual({ kind: "tool_started", tool: "splitter" });
  });

  test("falls back to text events when structured parse fails", async () => {
    const { events, done } = collect([NODE, FIXTURE, "invalid-json"], { protocol: "structured" });
    const result = await done;
    expect(result.status).toBe("completed");
    expect(assistantText(events)).toContain("{not json");
    expect(events.some((e) => e.kind === "status")).toBe(true);
  });

  test("maps non-zero exit to failed", async () => {
    const { done } = collect([NODE, FIXTURE, "fail"]);
    const result = await done;
    expect(result.status).toBe("failed");
    expect(result.code).toBe(2);
  });

  test("maps missing binary to spawn-error", async () => {
    const { done } = collect(["__coderelay_no_such_bin__"]);
    const result = await done;
    expect(result.status).toBe("spawn-error");
  });

  test("maps timeout to timeout status", async () => {
    const { done } = collect([NODE, FIXTURE, "sleep"], { timeoutMs: 300 });
    const result = await done;
    expect(result.status).toBe("timeout");
    expect(result.timedOut).toBe(true);
  });

  test("abort settles as aborted and pushes no further events", async () => {
    const { events, done, handle } = collect([NODE, FIXTURE, "sleep"]);
    setTimeout(() => {
      handle.abort();
    }, 150);
    const result = await done;
    expect(result.status).toBe("aborted");
    const countAfterSettle = events.length;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(events.length).toBe(countAfterSettle);
  });

  test("cleans up streams and listeners after exit", async () => {
    const { done, handle } = collect([NODE, FIXTURE, "chunked"]);
    const result = await done;
    expect(result.status).toBe("completed");
    expect(handle.child.stdout?.listenerCount("data")).toBe(0);
    expect(handle.child.stderr?.listenerCount("data")).toBe(0);
    const stdin = handle.child.stdin;
    expect(stdin === null || stdin.destroyed || stdin.writableEnded).toBe(true);
  });

  test("abort terminates the whole process tree", async () => {
    if (process.platform === "win32") {
      return;
    }
    const { events, done, handle } = collect([NODE, FIXTURE, "child"]);
    // 等孙进程 pid 行到达后再取消，避免竞态。
    const deadline = Date.now() + 5000;
    let grandchildPid = -1;
    while (Date.now() < deadline) {
      const text = assistantText(events);
      const match = /grandchild:(\d+)/.exec(text);
      if (match?.[1]) {
        grandchildPid = Number(match[1]);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(grandchildPid).toBeGreaterThan(0);
    handle.abort();
    const result = await done;
    expect(result.status).toBe("aborted");
    await new Promise((resolve) => setTimeout(resolve, 500));
    let alive = true;
    try {
      process.kill(grandchildPid, 0);
    } catch {
      alive = false;
    }
    expect(alive).toBe(false);
  });
});
