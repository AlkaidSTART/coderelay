import { describe, expect, test } from "bun:test";

import type { ChildProcess } from "node:child_process";
import { createCliAdapters } from "../src/agents/cli-adapters";
import {
  buildPromptArgs,
  CliProcessError,
  createSpawnOptions,
  launchInteractive,
  runOnce,
} from "../src/runtime/launcher";

describe("CLI launcher", () => {
  test("builds prompt args from adapters and appends extra args", () => {
    const adapters = createCliAdapters({ homeDir: "/home/tester", env: {} });

    expect(buildPromptArgs(adapters.codex, "do work")).toEqual(["do work"]);
    expect(buildPromptArgs(adapters.claude, "do work", ["--json"])).toEqual([
      "-p",
      "do work",
      "--json",
    ]);
    expect(buildPromptArgs(adapters.pi, "do work")).toEqual(["-p", "do work"]);
    expect(buildPromptArgs(adapters.omp, "do work")).toEqual(["-p", "do work"]);
  });

  test("creates inherited stdio options and uses shell on Windows", () => {
    const env = { PATH: "/bin" };
    const unix = createSpawnOptions({ cwd: "/tmp", env }, "linux");
    const windows = createSpawnOptions({ cwd: "C:\\tmp", env }, "win32");

    expect(unix).toMatchObject({
      cwd: "/tmp",
      env,
      stdio: "inherit",
      shell: false,
      windowsHide: false,
    });
    expect(windows).toMatchObject({
      cwd: "C:\\tmp",
      env,
      stdio: "inherit",
      shell: true,
      windowsHide: true,
    });
  });

  test("launches an adapter with the scanned executable path", () => {
    const adapters = createCliAdapters({ homeDir: "/home/tester", env: {} });
    let launched: { file: string; args: readonly string[] } | undefined;

    launchInteractive(adapters.codex, {
      binPath: "/opt/bin/codex",
      extraArgs: ["--json"],
      dependencies: {
        platform: "linux",
        spawn: (file, args) => {
          launched = { file, args };
          return {} as ChildProcess;
        },
      },
    });

    expect(launched).toEqual({ file: "/opt/bin/codex", args: ["--json"] });
  });

  test("runOnce returns stdout and stderr on success with documented limits", async () => {
    let capturedTimeout: number | undefined;
    let capturedMaxBuffer: number | undefined;

    const result = await runOnce("codex", ["exec", "hello"], {
      env: { PATH: "/bin" },
      dependencies: {
        platform: "linux",
        execFile: async (_file, _args, options) => {
          capturedTimeout = options?.timeout;
          capturedMaxBuffer = options?.maxBuffer;
          return { stdout: "done\n", stderr: "warning\n" };
        },
      },
    });

    expect(result).toEqual({
      ok: true,
      stdout: "done\n",
      stderr: "warning\n",
      code: 0,
      signal: null,
    });
    expect(capturedTimeout).toBe(120_000);
    expect(capturedMaxBuffer).toBe(10 * 1024 * 1024);
  });

  test("runOnce exposes non-zero exits as CliProcessError", async () => {
    const error = Object.assign(new Error("exit 2"), {
      code: 2,
      signal: null,
      stdout: "partial",
      stderr: "bad input",
    });

    try {
      await runOnce("codex", ["exec", "hello"], {
        dependencies: {
          platform: "linux",
          execFile: async () => {
            throw error;
          },
        },
      });
      throw new Error("runOnce should have rejected");
    } catch (caught) {
      expect(caught).toBeInstanceOf(CliProcessError);
      expect(caught).toMatchObject({
        code: 2,
        stdout: "partial",
        stderr: "bad input",
        timedOut: false,
      });
    }
  });

  test("runOnce identifies timeouts", async () => {
    const timeout = Object.assign(new Error("timed out"), {
      code: "ETIMEDOUT",
      signal: "SIGTERM",
      stdout: "",
      stderr: "",
    });

    try {
      await runOnce("codex", ["exec", "hello"], {
        timeoutMs: 25,
        dependencies: {
          platform: "linux",
          execFile: async () => {
            throw timeout;
          },
        },
      });
      throw new Error("runOnce should have rejected");
    } catch (caught) {
      expect(caught).toBeInstanceOf(CliProcessError);
      expect(caught).toMatchObject({ timedOut: true, signal: "SIGTERM" });
    }
  });
});
