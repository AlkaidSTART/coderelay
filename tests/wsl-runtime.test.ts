import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildWslArgs,
  decodeWslOutput,
  DEFAULT_WSL_MOUNT_ROOT,
  normalizeMountRoot,
  parseWslConfAutomount,
  parseWslDistros,
  resolveWslMountRoot,
  toWindowsPath,
  toWslPath,
  WSL_EXECUTABLE,
  WSL_MOUNT_ROOT,
} from "../src/runtime/wsl";

describe("buildWslArgs", () => {
  test("pins the distribution when one is known", () => {
    expect(buildWslArgs("Ubuntu", ["/home/me/.local/bin/pi", "-p", "hi"])).toEqual([
      "-d",
      "Ubuntu",
      "--",
      "/home/me/.local/bin/pi",
      "-p",
      "hi",
    ]);
  });

  test("omits -d so WSL uses its default distribution", () => {
    expect(buildWslArgs(undefined, ["/usr/bin/omp"])).toEqual([
      "--",
      "/usr/bin/omp",
    ]);
  });

  test("keeps the -- separator even without a command", () => {
    expect(buildWslArgs("Ubuntu", [])).toEqual(["-d", "Ubuntu", "--"]);
  });
});

describe("normalizeMountRoot", () => {
  test("normalises standard and custom mount roots", () => {
    expect(normalizeMountRoot("/mnt")).toBe("/mnt");
    expect(normalizeMountRoot("/mnt/")).toBe("/mnt");
    expect(normalizeMountRoot("/windir/")).toBe("/windir");
    expect(normalizeMountRoot("windir/")).toBe("/windir");
    expect(normalizeMountRoot('"//mnt//"')).toBe("/mnt");
  });

  test("normalises root slash to /", () => {
    expect(normalizeMountRoot("/")).toBe("/");
    expect(normalizeMountRoot("///")).toBe("/");
  });

  test("falls back to /mnt for empty input", () => {
    expect(normalizeMountRoot("")).toBe(DEFAULT_WSL_MOUNT_ROOT);
    expect(normalizeMountRoot("   ")).toBe(DEFAULT_WSL_MOUNT_ROOT);
  });
});

describe("parseWslConfAutomount", () => {
  test("parses root from [automount] section", () => {
    const conf = `
[automount]
enabled = true
root = /windir/
`;
    expect(parseWslConfAutomount(conf)).toEqual({
      enabled: true,
      root: "/windir",
    });
  });

  test("parses root = / without trailing slash", () => {
    const conf = `
[automount]
root = /
`;
    expect(parseWslConfAutomount(conf)).toEqual({
      enabled: true,
      root: "/",
    });
  });

  test("handles inline comments and quotes", () => {
    const conf = `
# System configuration
[automount]
root = "/c/" # custom root comment
enabled = false ; disabled comment
`;
    expect(parseWslConfAutomount(conf)).toEqual({
      enabled: false,
      root: "/c",
    });
  });

  test("returns defaults when [automount] is missing or empty", () => {
    expect(parseWslConfAutomount("")).toEqual({
      enabled: true,
      root: "/mnt",
    });
    expect(parseWslConfAutomount("[network]\ngenerateResolvConf = false")).toEqual({
      enabled: true,
      root: "/mnt",
    });
  });
});

describe("resolveWslMountRoot", () => {
  test("respects explicit mountRoot override", () => {
    expect(resolveWslMountRoot("/windir")).toBe("/windir");
    expect(resolveWslMountRoot({ mountRoot: "/custom/" })).toBe("/custom");
    expect(resolveWslMountRoot({ mountRoot: null })).toBeNull();
  });

  test("respects WSL_AUTOMOUNT_ROOT and WSL_MOUNT_ROOT env vars", () => {
    expect(
      resolveWslMountRoot({ env: { WSL_AUTOMOUNT_ROOT: "/windir" } }),
    ).toBe("/windir");
    expect(
      resolveWslMountRoot({ env: { WSL_MOUNT_ROOT: "/windir2" } }),
    ).toBe("/windir2");
  });

  test("reads and parses wslConfPath file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "wsl-conf-test-"));
    const confFile = join(tempDir, "wsl.conf");
    try {
      writeFileSync(confFile, "[automount]\nroot = /windir/\n");
      expect(resolveWslMountRoot({ wslConfPath: confFile })).toBe("/windir");

      writeFileSync(confFile, "[automount]\nenabled = false\n");
      expect(resolveWslMountRoot({ wslConfPath: confFile })).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("falls back to default /mnt", () => {
    expect(resolveWslMountRoot({ env: {} })).toBe(DEFAULT_WSL_MOUNT_ROOT);
  });
});

describe("toWslPath", () => {
  test("maps drive letters onto /mnt by default", () => {
    expect(toWslPath("C:\\Users\\tester\\project")).toBe(
      "/mnt/c/Users/tester/project",
    );
    expect(toWslPath("d:/work")).toBe("/mnt/d/work");
    expect(toWslPath("C:\\")).toBe("/mnt/c");
    expect(toWslPath("E:")).toBe("/mnt/e");
  });

  test("supports custom automount root via string parameter", () => {
    expect(toWslPath("C:\\Users\\tester\\project", "/windir")).toBe(
      "/windir/c/Users/tester/project",
    );
    expect(toWslPath("d:/work", "/windir/")).toBe("/windir/d/work");
  });

  test("supports root automount (/c/...)", () => {
    expect(toWslPath("C:\\Users\\tester\\project", "/")).toBe(
      "/c/Users/tester/project",
    );
    expect(toWslPath("C:\\", "/")).toBe("/c");
    expect(toWslPath("E:", "/")).toBe("/e");
  });

  test("supports custom automount root via options object", () => {
    expect(
      toWslPath("C:\\Users\\tester", { env: { WSL_AUTOMOUNT_ROOT: "/windir" } }),
    ).toBe("/windir/c/Users/tester");
  });

  test("returns null when automount is disabled", () => {
    expect(toWslPath("C:\\Users\\tester", { mountRoot: null })).toBeNull();
  });

  test("passes an already-Linux path through untouched", () => {
    expect(toWslPath("/home/me/project")).toBe("/home/me/project");
    expect(toWslPath("/home/me/project", { mountRoot: null })).toBe(
      "/home/me/project",
    );
  });

  test("returns null when no equivalent exists", () => {
    expect(toWslPath("\\\\server\\share\\project")).toBeNull();
    expect(toWslPath("relative\\dir")).toBeNull();
    expect(toWslPath("   ")).toBeNull();
  });
});

describe("toWindowsPath", () => {
  test("converts /mnt paths back into Windows paths", () => {
    expect(toWindowsPath("/mnt/c/Users/tester/project")).toBe(
      "C:\\Users\\tester\\project",
    );
    expect(toWindowsPath("/mnt/d/work")).toBe("D:\\work");
    expect(toWindowsPath("/mnt/c")).toBe("C:\\");
    expect(toWindowsPath("/mnt/c/")).toBe("C:\\");
  });

  test("supports custom mount root", () => {
    expect(toWindowsPath("/windir/c/Users/tester", "/windir")).toBe(
      "C:\\Users\\tester",
    );
    expect(toWindowsPath("/windir/d", "/windir")).toBe("D:\\");
  });

  test("supports root mount (/c/...)", () => {
    expect(toWindowsPath("/c/Users/tester", "/")).toBe("C:\\Users\\tester");
    expect(toWindowsPath("/c", "/")).toBe("C:\\");
  });

  test("falls back to /mnt when custom root does not match", () => {
    expect(
      toWindowsPath("/mnt/c/Users/tester", {
        env: { WSL_AUTOMOUNT_ROOT: "/windir" },
      }),
    ).toBe("C:\\Users\\tester");
  });

  test("returns null for non-mounted Linux paths", () => {
    expect(toWindowsPath("/usr/bin/bash")).toBeNull();
    expect(toWindowsPath("/home/tester")).toBeNull();
    expect(toWindowsPath("relative/path")).toBeNull();
  });
});

describe("decodeWslOutput", () => {
  test("strips the NUL padding of wsl.exe's UTF-16LE output", () => {
    expect(decodeWslOutput("U\u0000b\u0000u\u0000n\u0000t\u0000u\u0000")).toBe(
      "Ubuntu",
    );
  });
});

describe("parseWslDistros", () => {
  test("splits NUL-padded CRLF output and drops blanks", () => {
    const raw =
      "\u0000U\u0000b\u0000u\u0000n\u0000t\u0000u\u0000\r\u0000\n\u0000" +
      "\u0000D\u0000e\u0000b\u0000i\u0000a\u0000n\u0000\r\u0000\n\u0000" +
      "\r\u0000\n\u0000";

    expect(parseWslDistros(raw)).toEqual(["Ubuntu", "Debian"]);
  });

  test("returns nothing when WSL lists no distribution", () => {
    expect(parseWslDistros("")).toEqual([]);
    expect(parseWslDistros("\r\n")).toEqual([]);
  });
});

describe("WSL_EXECUTABLE", () => {
  test("is the documented launcher name, not a hard-coded path", () => {
    expect(WSL_EXECUTABLE).toBe("wsl.exe");
  });
});
