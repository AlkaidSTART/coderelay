import { describe, expect, test } from "bun:test";

import { cliCandidates, cliLaunchTarget, type ExecFileRunner } from "../src/models/cli";
import { buildLaunchCmd } from "../src/runtime/launcher";
import { scanCodingClis, type ScannerOptions } from "../src/scanner/cli-scanner";

const WSL_LIST = "wsl.exe -l -q";

function locateCommand(distro: string, bin: string): string {
  return `wsl.exe -d ${distro} -- sh -lc command -v ${bin}`;
}

function wslVersionCommand(distro: string, path: string): string {
  return `wsl.exe -d ${distro} -- ${path} --version`;
}

interface FakeWindowsHost {
  readonly outputs?: Readonly<Record<string, string>>;
  readonly files?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly probeWsl?: boolean;
}

async function scanWindows(host: FakeWindowsHost = {}) {
  const outputs = host.outputs ?? {};
  const files = new Set(host.files ?? []);

  const options: ScannerOptions = {
    platform: "win32",
    homeDir: "C:\\Users\\tester",
    env: host.env ?? { PATH: "C:\\Windows" },
    probeWsl: host.probeWsl ?? true,
    execFile: async (file, args) => {
      const command = [file, ...args].join(" ");
      const stdout = outputs[command];
      if (stdout === undefined) {
        throw Object.assign(new Error(`no such command: ${command}`), {
          code: "ENOENT",
        });
      }
      return { stdout, stderr: "" };
    },
    access: async (candidate) => {
      if (!files.has(candidate)) {
        throw Object.assign(new Error(`missing: ${candidate}`), { code: "ENOENT" });
      }
    },
  };

  return scanCodingClis(options);
}

describe("WSL-isolated CLIs", () => {
  test("a CLI only present in WSL is selected as a WSL target", async () => {
    const detected = await scanWindows({
      outputs: {
        [WSL_LIST]: "U\u0000b\u0000u\u0000n\u0000t\u0000u\u0000\r\u0000\n\u0000",
        [locateCommand("Ubuntu", "codex")]: "/home/me/.local/bin/codex\n",
        [wslVersionCommand("Ubuntu", "/home/me/.local/bin/codex")]:
          "codex-cli 0.139.0\n",
      },
    });

    const codex = detected[0];
    expect(codex).toMatchObject({
      available: true,
      path: "/home/me/.local/bin/codex",
      version: "codex-cli 0.139.0",
      runtime: "wsl",
      distro: "Ubuntu",
    });
    expect(codex.diagnostics?.map((entry) => entry.message).join("\n")).toContain(
      "仅在 WSL:Ubuntu 中可用",
    );
    expect(cliLaunchTarget(codex)).toEqual({
      path: "/home/me/.local/bin/codex",
      runtime: "wsl",
      distro: "Ubuntu",
    });
  });

  test("a Linux path is never turned into a native Windows launch", async () => {
    const detected = await scanWindows({
      outputs: {
        [WSL_LIST]: "Ubuntu\r\n",
        [locateCommand("Ubuntu", "omp")]: "/usr/local/bin/omp\n",
        [wslVersionCommand("Ubuntu", "/usr/local/bin/omp")]: "omp 0.9.0\n",
      },
    });

    const target = cliLaunchTarget(detected[3]);
    expect(target).not.toBeNull();
    expect(buildLaunchCmd(target!, ["-p", "hi"])).toEqual([
      "wsl.exe",
      "-d",
      "Ubuntu",
      "--",
      "/usr/local/bin/omp",
      "-p",
      "hi",
    ]);
  });

  test("every WSL candidate is tagged wsl and carries its distro", async () => {
    const detected = await scanWindows({
      outputs: {
        [WSL_LIST]: "Ubuntu\r\n",
        [locateCommand("Ubuntu", "pi")]: "/home/me/.local/bin/pi\n",
      },
    });

    const candidates = cliCandidates(detected[2]);
    expect(candidates).toEqual([
      {
        path: "/home/me/.local/bin/pi",
        runtime: "wsl",
        source: "installer",
        distro: "Ubuntu",
        version: null,
      },
    ]);
  });
});

describe("native Windows wins over WSL", () => {
  test("a native executable is selected and the WSL copy is only reported", async () => {
    const detected = await scanWindows({
      files: ["C:\\Users\\tester\\AppData\\Roaming\\npm\\claude.cmd"],
      env: { PATH: "C:\\Windows", APPDATA: "C:\\Users\\tester\\AppData\\Roaming" },
      outputs: {
        [WSL_LIST]: "Ubuntu\r\n",
        [locateCommand("Ubuntu", "claude")]: "/home/me/.local/bin/claude\n",
        [wslVersionCommand("Ubuntu", "/home/me/.local/bin/claude")]: "2.0.0\n",
        "C:\\Users\\tester\\AppData\\Roaming\\npm\\claude.cmd --version":
          "2.0.1\r\n",
      },
    });

    const claude = detected[1];
    expect(claude).toMatchObject({
      available: true,
      runtime: "local",
      path: "C:\\Users\\tester\\AppData\\Roaming\\npm\\claude.cmd",
    });
    expect(cliCandidates(claude).map((candidate) => candidate.runtime)).toEqual([
      "local",
      "wsl",
    ]);
    expect(claude.diagnostics?.map((entry) => entry.message).join("\n")).toContain(
      "中也检测到 claude",
    );
  });
});

describe("multiple distributions", () => {
  test("the first distribution WSL reports provides the launch target", async () => {
    const detected = await scanWindows({
      outputs: {
        [WSL_LIST]:
          "\u0000U\u0000b\u0000u\u0000n\u0000t\u0000u\u0000\r\u0000\n\u0000" +
          "\u0000D\u0000e\u0000b\u0000i\u0000a\u0000n\u0000\r\u0000\n\u0000",
        [locateCommand("Ubuntu", "pi")]: "/home/me/.local/bin/pi\n",
        [locateCommand("Debian", "pi")]: "/usr/bin/pi\n",
      },
    });

    const pi = detected[2];
    expect(pi).toMatchObject({ runtime: "wsl", distro: "Ubuntu", path: "/home/me/.local/bin/pi" });
    expect(cliCandidates(pi).map((candidate) => candidate.distro)).toEqual([
      "Ubuntu",
      "Debian",
    ]);
  });
});

describe("WSL failures stay isolated", () => {
  test("a broken wsl.exe never affects native detection", async () => {
    const detected = await scanWindows({
      files: ["C:\\Users\\tester\\.local\\bin\\codex.exe"],
      outputs: {
        "C:\\Users\\tester\\.local\\bin\\codex.exe --version":
          "codex-cli 0.139.0\r\n",
      },
    });

    expect(detected[0]).toMatchObject({
      available: true,
      runtime: "local",
      path: "C:\\Users\\tester\\.local\\bin\\codex.exe",
    });
    const claudeDiagnostics =
      detected[1].diagnostics?.map((entry) => entry.message).join("\n") ?? "";
    expect(claudeDiagnostics).toContain("WSL 不可用");
  });

  test("wsl.exe reporting no distribution is reported as such", async () => {
    const detected = await scanWindows({ outputs: { [WSL_LIST]: "\r\n" } });

    const diagnostics =
      detected[0].diagnostics?.map((entry) => entry.message).join("\n") ?? "";
    expect(diagnostics).toContain("未安装任何 WSL 发行版");
  });

  test("a failing probe inside one distribution leaves the others usable", async () => {
    const detected = await scanWindows({
      outputs: {
        [WSL_LIST]: "Ubuntu\r\nDebian\r\n",
        [locateCommand("Debian", "omp")]: "/usr/bin/omp\n",
      },
    });

    expect(detected[3]).toMatchObject({
      available: true,
      runtime: "wsl",
      distro: "Debian",
      path: "/usr/bin/omp",
    });
  });
});

describe("WSL is only probed from native Windows", () => {
  test("a macOS or Linux host never invokes wsl.exe", async () => {
    const commands: string[] = [];
    const execFile: ExecFileRunner = async (file, args) => {
      commands.push([file, ...args].join(" "));
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    };

    await scanCodingClis({
      platform: "linux",
      homeDir: "/home/tester",
      env: { PATH: "/usr/bin" },
      execFile,
      access: async () => {
        throw new Error("missing");
      },
    });

    expect(commands.some((command) => command.startsWith("wsl"))).toBe(false);
  });

  test("probing can be switched off on Windows as well", async () => {
    const commands: string[] = [];
    const execFile: ExecFileRunner = async (file, args) => {
      commands.push([file, ...args].join(" "));
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    };

    await scanCodingClis({
      platform: "win32",
      homeDir: "C:\\Users\\tester",
      env: { PATH: "C:\\Windows" },
      probeWsl: false,
      execFile,
      access: async () => {
        throw new Error("missing");
      },
    });

    expect(commands.some((command) => command.startsWith("wsl"))).toBe(false);
  });
});
