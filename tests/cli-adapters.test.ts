import { describe, expect, test } from "bun:test";

import {
  CLI_IDS,
  createCliAdapters,
  getCliAdapter,
  getCliAdapters,
} from "../src/agents/cli-adapters";

describe("CLI adapters", () => {
  test("registry preserves the canonical CLI order", () => {
    expect(Object.keys(getCliAdapters())).toEqual([...CLI_IDS]);
  });

  test("uses the documented config directories", () => {
    const adapters = createCliAdapters({
      homeDir: "/home/tester",
      env: {},
    });

    expect(adapters.codex.configDir).toBe("/home/tester/.codex");
    expect(adapters.claude.configDir).toBe("/home/tester/.claude");
    expect(adapters.pi.configDir).toBe("/home/tester/.pi/agent");
    expect(adapters.omp.configDir).toBe("/home/tester/.omp");
  });

  test("honors CLAUDE_CONFIG_DIR", () => {
    const adapter = getCliAdapter("claude", {
      homeDir: "/home/tester",
      env: { CLAUDE_CONFIG_DIR: "/custom/claude" },
    });

    expect(adapter.configDir).toBe("/custom/claude");
  });

  test("builds prompt arguments for all four CLIs", () => {
    const adapters = createCliAdapters({ homeDir: "/home/tester", env: {} });

    expect(adapters.codex.promptArgs("hello")).toEqual(["hello"]);
    expect(adapters.claude.promptArgs("hello")).toEqual(["-p", "hello"]);
    expect(adapters.pi.promptArgs("hello")).toEqual(["-p", "hello"]);
    expect(adapters.omp.promptArgs("hello")).toEqual(["-p", "hello"]);
  });
});
