import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";

import type { CliCapabilities } from "../src/agents/capabilities";
import type { ModelOption, ProbeDisplay } from "../src/agents/model-catalog";
import type { DetectedCli } from "../src/models/cli";
import { App } from "../src/ui/App";

const CLIS: DetectedCli[] = [
  { id: "codex", bin: "codex", path: "/bin/codex", version: "1", available: true },
  { id: "claude", bin: "claude", path: "/bin/claude", version: "1", available: true },
  { id: "pi", bin: "pi", path: "", version: null, available: false },
  { id: "omp", bin: "omp", path: "/bin/omp", version: "1", available: true },
];

const CAPS: CliCapabilities = {
  structuredEvents: true,
  nativeResume: false,
  nonInteractivePrompt: true,
  explicitModel: true,
  toolEvents: true,
};

function option(
  cliId: ModelOption["cliId"],
  modelId: string,
  overrides: Partial<ModelOption> = {},
): ModelOption {
  return {
    cliId,
    modelId,
    label: modelId,
    isDefault: false,
    capabilities: CAPS,
    strengths: [],
    available: true,
    ...overrides,
  };
}

// codex 与 claude 都探测成功；pi 未安装；omp 装了但被禁用。
const PROBES: ProbeDisplay[] = [
  { cliId: "codex", status: "found", models: [] },
  { cliId: "claude", status: "found", models: [] },
  { cliId: "pi", status: "not-installed", models: [], reason: "未安装" },
  { cliId: "omp", status: "disabled", models: [], reason: "已在配置中禁用" },
];

const OPTIONS: ModelOption[] = [
  option("codex", "gpt-5"),
  option("claude", "claude-sonnet-4-5"),
  option("claude", "claude-opus-4-1"),
];

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

interface Harness {
  readonly frame: () => string;
  readonly press: (key: string) => Promise<void>;
  readonly cleanup: () => void;
}

async function renderPicker(): Promise<Harness> {
  const instance = render(
    <App
      clis={CLIS}
      initialId="codex"
      phase="selecting"
      probes={PROBES}
      modelOptions={OPTIONS}
      onLaunch={() => undefined}
      onExit={() => undefined}
    />,
  );
  await settle();
  return {
    frame: () => instance.lastFrame() ?? "",
    press: async (key: string) => {
      instance.stdin.write(key);
      await settle();
    },
    cleanup: () => instance.cleanup(),
  };
}

describe("model picker CLI isolation", () => {
  test("the first step lists every CLI with its probe state", async () => {
    const view = await renderPicker();
    const frame = view.frame();
    expect(frame).toContain("选择 CLI");
    expect(frame).toContain("Codex");
    expect(frame).toContain("Claude Code");
    expect(frame).toContain("Pi");
    expect(frame).toContain("OMP");
    expect(frame).toContain("已找到 0 个模型");
    expect(frame).toContain("未安装");
    expect(frame).toContain("已禁用");
    expect(frame).toContain("已在配置中禁用");
    view.cleanup();
  });

  test("a disabled CLI is listed but the cursor never lands on it", async () => {
    const view = await renderPicker();
    // 可进入的只有 codex 与 claude；从 claude 继续下移应当绕回 codex，跳过已禁用的 omp。
    await view.press("j");
    await view.press("j");
    await view.press("\r");
    expect(view.frame()).toContain("选择模型 · Codex");
    view.cleanup();
  });

  test("the model step shows only the picked CLI's models", async () => {
    const view = await renderPicker();
    await view.press("\r");
    const frame = view.frame();
    expect(frame).toContain("选择模型 · Codex");
    expect(frame).toContain("gpt-5");
    expect(frame).not.toContain("claude-sonnet-4-5");
    expect(frame).not.toContain("claude-opus-4-1");
    view.cleanup();
  });

  test("switching CLI in the first step switches the model list", async () => {
    const view = await renderPicker();
    await view.press("j");
    await view.press("\r");
    const frame = view.frame();
    expect(frame).toContain("选择模型 · Claude Code");
    expect(frame).toContain("claude-sonnet-4-5");
    expect(frame).toContain("claude-opus-4-1");
    expect(frame).not.toContain("gpt-5");
    view.cleanup();
  });

  test("esc in the model step returns to the CLI step instead of cancelling", async () => {
    let cancelled = 0;
    const instance = render(
      <App
        clis={CLIS}
        initialId="codex"
        phase="selecting"
        probes={PROBES}
        modelOptions={OPTIONS}
        onCancelSelecting={() => {
          cancelled += 1;
        }}
        onLaunch={() => undefined}
        onExit={() => undefined}
      />,
    );
    await settle();
    instance.stdin.write("\r");
    await settle();
    instance.stdin.write("\x1b");
    await settle();
    expect(instance.lastFrame()).toContain("选择 CLI");
    expect(cancelled).toBe(0);

    // 在第一步再按 Esc 才是真的取消。
    instance.stdin.write("\x1b");
    await settle();
    expect(cancelled).toBe(1);
    instance.cleanup();
  });

  test("only the model belonging to the picked CLI can be submitted", async () => {
    const submitted: ModelOption[] = [];
    const instance = render(
      <App
        clis={CLIS}
        initialId="codex"
        phase="selecting"
        probes={PROBES}
        modelOptions={OPTIONS}
        onSelectModel={(chosen) => {
          submitted.push(chosen);
        }}
        onLaunch={() => undefined}
        onExit={() => undefined}
      />,
    );
    await settle();
    // 进 Claude 的模型步，选中第二项。
    instance.stdin.write("j");
    await settle();
    instance.stdin.write("\r");
    await settle();
    instance.stdin.write("j");
    await settle();
    instance.stdin.write("\r");
    await settle();

    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({
      cliId: "claude",
      modelId: "claude-opus-4-1",
    });
    instance.cleanup();
  });
});
