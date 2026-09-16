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

  test("prunes oldest sessions together with their turns", async () => {
    const store = createSessionStore(tempDbPath());
    const sessions = [];

    for (let index = 0; index < 5; index += 1) {
      const session = store.createSession("codex", `会话 ${index}`);
      store.appendTurn({
        sessionId: session.id,
        cliId: "codex",
        prompt: `第 ${index} 问`,
        output: `第 ${index} 答`,
        exitCode: 0,
        signal: null,
        durationMs: 100,
      });
      sessions.push(session);
      await Bun.sleep(3);
    }

    expect(store.pruneSessions(3)).toBe(2);
    for (const [index, session] of sessions.entries()) {
      if (index < 2) {
        expect(store.getSession(session.id)).toBeNull();
        expect(store.listTurns(session.id)).toEqual([]);
      } else {
        expect(store.getSession(session.id)?.id).toBe(session.id);
      }
    }
    store.close();
  });

  test("keeps every session when the database is below the limit", () => {
    const store = createSessionStore(tempDbPath());
    const first = store.createSession("codex", "第一会话");
    const second = store.createSession("claude", "第二会话");

    expect(store.pruneSessions(5)).toBe(0);
    expect(store.getSession(first.id)?.id).toBe(first.id);
    expect(store.getSession(second.id)?.id).toBe(second.id);
    store.close();
  });

  test("keeps the most recently active session instead of the newest created", async () => {
    const store = createSessionStore(tempDbPath());
    const older = store.createSession("codex", "旧会话");
    await Bun.sleep(3);
    const newer = store.createSession("claude", "新会话");
    await Bun.sleep(3);
    store.appendTurn({
      sessionId: older.id,
      cliId: "codex",
      prompt: "继续旧会话",
      output: "最近活跃",
      exitCode: 0,
      signal: null,
      durationMs: 100,
    });

    expect(store.pruneSessions(1)).toBe(1);
    expect(store.getSession(older.id)?.id).toBe(older.id);
    expect(store.listTurns(older.id)).toHaveLength(1);
    expect(store.getSession(newer.id)).toBeNull();
    store.close();
  });
});
