import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSessionStore } from "../src/session/store";

function tempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), "coderelay-sessions-")), "sessions.db");
}

describe("session store", () => {
  test("creates sessions and appends turns in order", () => {
    const store = createSessionStore(tempDbPath());

    const session = store.createSession("claude", "修一个测试");
    expect(session.cliId).toBe("claude");
    expect(session.title).toBe("修一个测试");
    expect(store.getSession(session.id)?.title).toBe("修一个测试");

    store.appendTurn({
      sessionId: session.id,
      cliId: "claude",
      prompt: "第一问",
      output: "答案一",
      exitCode: 0,
      signal: null,
      durationMs: 1200,
    });
    store.appendTurn({
      sessionId: session.id,
      cliId: "codex",
      prompt: "第二问",
      output: "",
      exitCode: 2,
      signal: null,
      durationMs: 300,
    });

    const turns = store.listTurns(session.id);
    expect(turns.length).toBe(2);
    expect(turns[0]?.prompt).toBe("第一问");
    expect(turns[0]?.cliId).toBe("claude");
    expect(turns[1]?.cliId).toBe("codex");
    expect(turns[1]?.exitCode).toBe(2);
    store.close();
  });

  test("reopening the same database reads sessions across processes", () => {
    const path = tempDbPath();
    const first = createSessionStore(path);
    const session = first.createSession("codex", "跨进程接力");
    first.appendTurn({
      sessionId: session.id,
      cliId: "codex",
      prompt: "上一棒",
      output: "产出",
      exitCode: 0,
      signal: null,
      durationMs: 100,
    });
    first.close();

    const second = createSessionStore(path);
    expect(second.getSession(session.id)?.title).toBe("跨进程接力");
    const turns = second.listTurns(session.id);
    expect(turns.length).toBe(1);
    expect(turns[0]?.output).toBe("产出");
    second.close();
  });
});
