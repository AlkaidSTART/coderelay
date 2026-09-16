import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import type { ChildProcess } from "node:child_process";
import { createCliAdapters } from "../src/agents/cli-adapters";
import type { LaunchTarget } from "../src/models/cli";
import {
  buildLaunchArgv,
  buildLaunchCmd,
  createSpawnOptions,
  launchInteractive,
  launchWithPrompt,
  launchWithPromptCaptured,
  resolveLaunchCwd,
  runOnce,
} from "../src/runtime/launcher";

const adapters = createCliAdapters({ homeDir: "/home/tester", env: {} });

const WSL_TARGET: LaunchTarget = {
  path: "/home/me/.local/bin/codex",
  runtime: "wsl",
  distro: "Ubuntu",
};

const LOCAL_TARGET: LaunchTarget = {
  path: "C:\\Program Files\\Codex\\codex.exe",
  runtime: "local",
};

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

describe("buildLaunchArgv", () => {
  test("uses the scanned path verbatim, spaces and all", () => {
    expect(buildLaunchArgv(LOCAL_TARGET, ["-p", "hi"])).toEqual({
      file: "C:\\Program Files\\Codex\\codex.exe",
      args: ["-p", "hi"],
    });
  });

  test("routes a WSL target through wsl.exe with the distro pinned", () => {
    expect(buildLaunchArgv(WSL_TARGET, ["-p", "hi"])).toEqual({
      file: "wsl.exe",
      args: ["-d", "Ubuntu", "--", "/home/me/.local/bin/codex", "-p", "hi"],
    });
  });

  test("a WSL target without a distro falls back to the default distribution", () => {
    expect(
      buildLaunchArgv({ path: "/usr/bin/omp", runtime: "wsl" }, ["--version"]),
    ).toEqual({
      file: "wsl.exe",
      args: ["--", "/usr/bin/omp", "--version"],
    });
  });

  test("buildLaunchCmd prefixes the executable for cmd[]-style runtimes", () => {
    expect(buildLaunchCmd(LOCAL_TARGET, ["exec"])).toEqual([
      "C:\\Program Files\\Codex\\codex.exe",
      "exec",
    ]);
    expect(buildLaunchCmd(WSL_TARGET)).toEqual([
      "wsl.exe",
      "-d",
      "Ubuntu",
      "--",
      "/home/me/.local/bin/codex",
    ]);
  });
});

describe("resolveLaunchCwd", () => {
  test("leaves a local working directory alone", () => {
    expect(resolveLaunchCwd("C:\\work", LOCAL_TARGET)).toBe("C:\\work");
    expect(resolveLaunchCwd("/work", undefined)).toBe("/work");
    expect(resolveLaunchCwd(undefined, WSL_TARGET)).toBeUndefined();
  });

  test("translates a Windows directory for WSL", () => {
    expect(resolveLaunchCwd("C:\\Users\\me\\project", WSL_TARGET)).toBe(
      "/mnt/c/Users/me/project",
    );
  });

  test("gives up on a directory WSL cannot express", () => {
    expect(resolveLaunchCwd("\\\\server\\share", WSL_TARGET)).toBeUndefined();
  });
});

describe("createSpawnOptions", () => {
  test("a WSL launch never goes through cmd.exe's re-parsing", () => {
    const local = createSpawnOptions({ cwd: "C:\\tmp", target: LOCAL_TARGET }, "win32");
    const wsl = createSpawnOptions(
      { cwd: "C:\\tmp", target: WSL_TARGET },
      "win32",
    );

    expect(local).toMatchObject({ shell: true, windowsHide: true });
    expect(wsl).toMatchObject({
      shell: false,
      windowsHide: true,
      cwd: "/mnt/c/tmp",
    });
  });
});

describe("launch entry points honour the scanned runtime", () => {
  test("interactive launch of a WSL CLI spawns wsl.exe", () => {
    let launched: { file: string; args: readonly string[] } | undefined;

    launchInteractive(adapters.codex, {
      target: WSL_TARGET,
      extraArgs: ["--json"],
      dependencies: {
        platform: "win32",
        spawn: (file, args) => {
          launched = { file, args };
          return {} as ChildProcess;
        },
      },
    });

    expect(launched).toEqual({
      file: "wsl.exe",
      args: ["-d", "Ubuntu", "--", "/home/me/.local/bin/codex", "--json"],
    });
  });

  test("prompt launch of a WSL CLI keeps the adapter's prompt args", () => {
    let launched: { file: string; args: readonly string[] } | undefined;

    launchWithPrompt(adapters.omp, "do work", {
      target: { path: "/usr/bin/omp", runtime: "wsl", distro: "Debian" },
      dependencies: {
        platform: "win32",
        spawn: (file, args) => {
          launched = { file, args };
          return {} as ChildProcess;
        },
      },
    });

    expect(launched).toEqual({
      file: "wsl.exe",
      args: ["-d", "Debian", "--", "/usr/bin/omp", "-p", "do work"],
    });
  });

  test("captured prompt launch uses the same argv as the interactive path", async () => {
    const child = fakeChild();
    let launched: readonly string[] | undefined;

    const handle = launchWithPromptCaptured(adapters.pi, "do work", {
      target: WSL_TARGET,
      dependencies: {
        platform: "win32",
        spawn: (_file, args) => {
          launched = args;
          return child;
        },
      },
    });
    child.emit("close", 0, null);
    await handle.done;

    expect(launched).toEqual([
      "-d",
      "Ubuntu",
      "--",
      "/home/me/.local/bin/codex",
      "-p",
      "do work",
    ]);
  });

  test("a launch without a target still runs the given path directly", () => {
    let launched: { file: string; args: readonly string[] } | undefined;

    launchInteractive("/opt/bin/codex", {
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

  test("runOnce executes a WSL CLI through wsl.exe", async () => {
    let executed: { file: string; args: readonly string[] } | undefined;

    await runOnce("/home/me/.local/bin/codex", ["exec", "hi"], {
      target: WSL_TARGET,
      cwd: "C:\\Users\\me\\project",
      dependencies: {
        platform: "win32",
        execFile: async (file, args, options) => {
          executed = { file, args };
          expect(options?.shell).toBe(false);
          expect(options?.cwd).toBe("/mnt/c/Users/me/project");
          return { stdout: "", stderr: "" };
        },
      },
    });

    expect(executed).toEqual({
      file: "wsl.exe",
      args: ["-d", "Ubuntu", "--", "/home/me/.local/bin/codex", "exec", "hi"],
    });
  });
});
