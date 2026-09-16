import { describe, expect, test } from "bun:test";

import {
  buildWslArgs,
  decodeWslOutput,
  parseWslDistros,
  toWslPath,
  WSL_EXECUTABLE,
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

describe("toWslPath", () => {
  test("maps drive letters onto /mnt", () => {
    expect(toWslPath("C:\\Users\\tester\\project")).toBe(
      "/mnt/c/Users/tester/project",
    );
    expect(toWslPath("d:/work")).toBe("/mnt/d/work");
    expect(toWslPath("C:\\")).toBe("/mnt/c");
    expect(toWslPath("E:")).toBe("/mnt/e");
  });

  test("passes an already-Linux path through untouched", () => {
    expect(toWslPath("/home/me/project")).toBe("/home/me/project");
  });

  test("returns null when no equivalent exists", () => {
    expect(toWslPath("\\\\server\\share\\project")).toBeNull();
    expect(toWslPath("relative\\dir")).toBeNull();
    expect(toWslPath("   ")).toBeNull();
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
