import { describe, expect, test } from "bun:test";

import { defaultConfig } from "../src/config/schema";
import type { CliCapabilities, ProbeResult } from "../src/agents/capabilities";
import {
  probeModelCatalog,
  toRouteCandidates,
  validateExplicitTarget,
} from "../src/agents/model-catalog";
import { CLI_IDS, type CliAdapter, type CliId, type DetectedCli } from "../src/models/cli";

const CAPS: CliCapabilities = {
  structuredEvents: true,
  nativeResume: true,
  nonInteractivePrompt: true,
  explicitModel: true,
  toolEvents: true,
};

function baseAdapter(id: CliId): CliAdapter {
  return {
    id,
    bin: id,
    configDir: `/home/tester/.${id}`,
    versionArgs: [["--version"]],
    interactiveArgs: [],
    promptArgs: (prompt: string) => ["-p", prompt],
  };
}

function fakeAdapters(probes: Record<CliId, ProbeResult | "unsupported">): Record<CliId, CliAdapter> {
  const out = {} as Record<CliId, CliAdapter>;
  for (const id of CLI_IDS) {
    const probe = probes[id];
    const adapter = baseAdapter(id);
    out[id] =
      probe === "unsupported"
        ? adapter
        : { ...adapter, probeModels: async (): Promise<ProbeResult> => probe };
  }
  return out;
}

const DETECTED: DetectedCli[] = [
  { id: "codex", bin: "codex", path: "/bin/codex", version: "1", available: true },
  { id: "claude", bin: "claude", path: "/bin/claude", version: "1", available: true },
  { id: "pi", bin: "pi", path: "", version: null, available: false },
  { id: "omp", bin: "omp", path: "/bin/omp", version: "1", available: true },
];

describe("probeModelCatalog", () => {
  test("returns a unified catalog; failures carry reasons and no candidates", async () => {
    const config = defaultConfig();
    config.agents["omp"] = { enabled: false, models: [], extraArgs: [], env: {} };
    const adapters = fakeAdapters({
      codex: { ok: true, models: [{ id: "gpt-5" }, { id: "gpt-5-mini" }], capabilities: CAPS },
      claude: { ok: false, reason: "auth missing" },
      pi: { ok: true, models: [], capabilities: CAPS },
      omp: { ok: true, models: [{ id: "m" }], capabilities: CAPS },
    });
    const catalog = await probeModelCatalog(DETECTED, adapters, config);
    expect(catalog.probes).toHaveLength(4);
    expect(catalog.probes.find((p) => p.cliId === "codex")?.status).toBe("found");
    expect(catalog.probes.find((p) => p.cliId === "claude")?.status).toBe("unprobed");
    expect(catalog.probes.find((p) => p.cliId === "claude")?.reason).toBe("auth missing");
    expect(catalog.probes.find((p) => p.cliId === "pi")?.status).toBe("not-installed");
    expect(catalog.probes.find((p) => p.cliId === "omp")?.status).toBe("disabled");
    expect(catalog.options.map((o) => o.modelId)).toEqual(["gpt-5", "gpt-5-mini"]);
  });

  test("config overlays metadata and order but cannot invent models", async () => {
    const config = defaultConfig();
    config.agents["codex"] = {
      enabled: true,
      models: [
        { id: "gpt-5-mini", label: "Mini!", strengths: [], cost: 1 },
        { id: "ghost-model", label: "Ghost", strengths: [], cost: 1 },
      ],
      extraArgs: [],
      env: {},
    };
    const adapters = fakeAdapters({
      codex: { ok: true, models: [{ id: "gpt-5" }, { id: "gpt-5-mini" }], capabilities: CAPS },
      claude: { ok: false, reason: "x" },
      pi: { ok: false, reason: "x" },
      omp: { ok: false, reason: "x" },
    });
    const catalog = await probeModelCatalog(DETECTED, adapters, config);
    // ghost-model 不在探测结果中：不能被增补进来。
    expect(catalog.options.some((o) => o.modelId === "ghost-model")).toBe(false);
    // 真实模型的 label/cost 被覆盖，且按 config 数组顺序排在前面。
    expect(catalog.options.map((o) => o.modelId)).toEqual(["gpt-5-mini", "gpt-5"]);
    expect(catalog.options.find((o) => o.modelId === "gpt-5-mini")?.label).toBe("Mini!");
    expect(catalog.options.find((o) => o.modelId === "gpt-5-mini")?.cost).toBe(1);
  });

  test("validateExplicitTarget rejects unprobed and unknown models with reasons", async () => {
    const config = defaultConfig();
    const adapters = fakeAdapters({
      codex: { ok: true, models: [{ id: "gpt-5" }], capabilities: CAPS },
      claude: { ok: false, reason: "auth missing" },
      pi: { ok: false, reason: "nope" },
      omp: { ok: false, reason: "nope" },
    });
    const catalog = await probeModelCatalog(DETECTED, adapters, config);
    expect(() => validateExplicitTarget(catalog, "claude", undefined, "codex")).toThrow("auth missing");
    expect(() => validateExplicitTarget(catalog, "codex", "codex:nope", "codex")).toThrow("gpt-5");
    expect(validateExplicitTarget(catalog, "codex", "codex:gpt-5", "codex")).toEqual({
      cliId: "codex",
      modelId: "gpt-5",
    });
  });

  test("toRouteCandidates only exposes available options", async () => {
    const config = defaultConfig();
    const adapters = fakeAdapters({
      codex: { ok: true, models: [{ id: "gpt-5" }], capabilities: CAPS },
      claude: { ok: false, reason: "down" },
      pi: { ok: false, reason: "down" },
      omp: { ok: false, reason: "down" },
    });
    const catalog = await probeModelCatalog(DETECTED, adapters, config);
    const candidates = toRouteCandidates(catalog, config);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ agent: "codex", model: "gpt-5" });
  });
});
