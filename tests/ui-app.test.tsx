import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";

import type { DetectedCli } from "../src/models/cli";
import {
  App,
  type LaunchRequest,
  type SessionOutcome,
} from "../src/ui/App";

const CLIS: DetectedCli[] = [
  {
    id: "codex",
    bin: "codex",
    path: "/opt/bin/codex",
    version: "codex-cli 0.1.0",
    available: true,
  },
  {
    id: "claude",
    bin: "claude",
    path: "/opt/bin/claude",
    version: "1.2.3",
    available: true,
  },
  {
    id: "pi",
    bin: "pi",
    path: "/opt/bin/pi",
    version: null,
    available: true,
  },
  {
    id: "omp",
    bin: "omp",
    path: "",
    version: null,
    available: false,
  },
];

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function afterEscapeFlush(): Promise<void> {
  // Ink buffers a lone ESC for 20ms so it can distinguish it from an ANSI key sequence.
  return new Promise((resolve) => setTimeout(resolve, 30));
}

function renderApp(
  overrides: Partial<{
    clis: readonly DetectedCli[];
    isScanning: boolean;
    initialId: DetectedCli["id"];
    session: SessionOutcome | null;
    onLaunch: (request: LaunchRequest) => void;
    onExit: () => void;
  }> = {},
) {
  let launches: LaunchRequest[] = [];
  let exits = 0;

  const instance = render(
    <App
      clis={overrides.clis ?? CLIS}
      isScanning={overrides.isScanning ?? false}
      initialId={overrides.initialId}
      session={overrides.session}
      onLaunch={(request) => {
        launches.push(request);
        overrides.onLaunch?.(request);
      }}
      onExit={() => {
        exits += 1;
        overrides.onExit?.();
      }}
    />,
  );

  return {
    ...instance,
    launches: () => launches,
    exits: () => exits,
  };
}

describe("App UI", () => {
  test("shows the scanning message while discovery is running", () => {
    const instance = renderApp({ clis: [], isScanning: true });

    expect(instance.lastFrame()).toContain("正在扫描本机编码代理");
    instance.cleanup();
  });

  test("renders all four CLIs and marks unavailable entries with ○", () => {
    const instance = renderApp();
    const frame = instance.lastFrame() ?? "";

    expect(frame).toContain("Codex");
    expect(frame).toContain("Claude Code");
    expect(frame).toContain("Pi");
    expect(frame).toContain("OMP");
    expect(frame).toContain("○");
    expect(frame).toContain("未检测到");
    instance.cleanup();
  });

  test("moves with ↓ and enters composer, then accepts text input", async () => {
    const instance = renderApp();

    instance.stdin.write("\u001B[B");
    await nextTick();
    instance.stdin.write("\r");
    await nextTick();

    expect(instance.lastFrame()).toContain("将任务交给 Claude Code");

    instance.stdin.write("hello agent");
    await nextTick();

    expect(instance.lastFrame()).toContain("hello agent");
    instance.cleanup();
  });

  test("Enter launches prompt mode and tab launches interactive mode", async () => {
    const first = renderApp();
    first.stdin.write("\r");
    await nextTick();
    first.stdin.write("do work");
    await nextTick();
    first.stdin.write("\r");
    await nextTick();

    expect(first.launches()).toEqual([
      { id: "codex", mode: "prompt", prompt: "do work" },
    ]);
    first.cleanup();

    const second = renderApp();
    second.stdin.write("\r");
    await nextTick();
    second.stdin.write("ignored");
    await nextTick();
    second.stdin.write("\t");
    await nextTick();

    expect(second.launches()).toEqual([
      { id: "codex", mode: "interactive" },
    ]);
    second.cleanup();
  });

  test("esc returns to picker and q exits", async () => {
    const instance = renderApp();

    instance.stdin.write("\r");
    await nextTick();
    expect(instance.lastFrame()).toContain("将任务交给 Codex");

    instance.stdin.write("\u001B");
    await afterEscapeFlush();
    expect(instance.lastFrame()).toContain("Claude Code");

    instance.stdin.write("q");
    await nextTick();
    expect(instance.exits()).toBe(1);
    instance.cleanup();
  });
});
