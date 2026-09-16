import { createCliAdapters, type CliAdapterOptions } from "../agents/cli-adapters";
import {
  probeModelCatalog,
  toRouteCandidates,
  validateExplicitTarget,
} from "../agents/model-catalog";
import { isAgentId } from "../agents/registry";
import { loadConfig } from "../config/loader";
import type { Config } from "../config/schema";
import { CLI_IDS, type CliId, type DetectedCli } from "../models/cli";
import type { AgentEvent } from "../models/agent-events";
import type { ModelStrength } from "../models/types";
import { route } from "../router/router";
import type { RouteDecision } from "../router/types";
import { runAgentStream, type AgentRunHandle } from "../runtime/agent-run";
import { resolveCommand, type ProcessOptions, type ProcessResult } from "../runtime/process";
import { scanCodingClis, type ScannerOptions } from "../scanner/cli-scanner";

export interface RunCommandOptions {
  readonly prompt: string;
  readonly cwd?: string;
  readonly configPath?: string;
  readonly config?: Config;
  /** Explicit agent selection; skips routing when set. */
  readonly agent?: string;
  /** Explicit model or `agent:model` reference; skips routing when set. */
  readonly model?: string;
  readonly files?: readonly string[];
  readonly language?: string;
  readonly contextSize?: number;
  readonly requiredStrengths?: readonly ModelStrength[];
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly env?: Record<string, string | undefined>;
  readonly scanner?: ScannerOptions;
}

export interface RunCommandDependencies {
  readonly scan?: (options?: ScannerOptions) => Promise<DetectedCli[]>;
  /** 遗留注入点：统一生命周期落地后不再使用，保留兼容外部调用。 */
  readonly run?: (options: ProcessOptions) => Promise<ProcessResult>;
  readonly stream?: (
    options: Parameters<typeof runAgentStream>[0],
  ) => AgentRunHandle;
  readonly resolve?: (command: string) => string | null;
  readonly adapters?: CliAdapterOptions;
  /** Diagnostic output, including routing and process errors. Defaults to stderr. */
  readonly write?: (text: string) => void;
  /** Agent stdout（assistant 文本）。默认写 stdout。 */
  readonly writeOut?: (text: string) => void;
}

function findDetected(
  detected: readonly DetectedCli[],
  id: CliId,
): DetectedCli | undefined {
  return detected.find((item) => item.id === id);
}

function availableAgents(
  config: Config,
  detected: readonly DetectedCli[],
  resolve: (command: string) => string | null,
): CliId[] {
  return CLI_IDS.filter((id) => {
    if (config.agents[id]?.enabled === false) {
      return false;
    }

    const detectedCli = findDetected(detected, id);
    if (detectedCli?.available && detectedCli.path) {
      return true;
    }

    const configuredCommand = config.agents[id]?.command?.trim();
    return Boolean(configuredCommand && resolve(configuredCommand));
  });
}

function resolveExecutable(
  agent: CliId,
  config: Config,
  detected: readonly DetectedCli[],
  bin: string,
  resolve: (command: string) => string | null,
): string {
  const configuredCommand = config.agents[agent]?.command?.trim();
  if (configuredCommand) {
    const resolved = resolve(configuredCommand);
    if (!resolved) {
      throw new Error(
        `configured command for ${agent} was not found: ${configuredCommand}`,
      );
    }
    return resolved;
  }

  const detectedCli = findDetected(detected, agent);
  if (detectedCli?.available && detectedCli.path) {
    return detectedCli.path;
  }

  const resolved = resolve(bin);
  if (resolved) {
    return resolved;
  }

  throw new Error(`agent is not available: ${agent}`);
}

function targetDescription(agent: CliId, model?: string): string {
  return model ? `${agent}:${model}` : agent;
}

/**
 * Resolve a prompt to an agent and stream the selected CLI in the current
 * terminal. Explicit agent/model options bypass routing but still require the
 * selected agent to be enabled and installed.
 */
export async function runRunCommand(
  options: RunCommandOptions,
  dependencies: RunCommandDependencies = {},
): Promise<number> {
  const write =
    dependencies.write ?? ((text: string) => process.stderr.write(text));
  const writeOut =
    dependencies.writeOut ?? ((text: string) => process.stdout.write(text));
  const scan = dependencies.scan ?? scanCodingClis;
  const resolve = dependencies.resolve ?? resolveCommand;
  const startStream = dependencies.stream ?? runAgentStream;

  try {
    if (!options.prompt.trim()) {
      throw new Error("prompt must not be empty");
    }

    const loaded =
      options.config === undefined
        ? await loadConfig({ cwd: options.cwd, path: options.configPath })
        : { config: options.config };
    const config = loaded.config;
    const detected = await scan(options.scanner);
    const cliAdapters = createCliAdapters(dependencies.adapters);

    // 统一探测：以 CLI 原生配置为事实来源，失败带原因且禁止执行。
    const catalog = await probeModelCatalog(detected, cliAdapters, config);

    let agent: CliId;
    let model: string | undefined;
    let decision: RouteDecision | undefined;
    if (options.agent || options.model) {
      const explicit = validateExplicitTarget(
        catalog,
        options.agent,
        options.model,
        config.defaultAgent,
      );
      agent = explicit.cliId;
      model = explicit.modelId;
    } else {
      const candidates = toRouteCandidates(catalog, config);
      if (candidates.length === 0) {
        const reasons = catalog.probes
          .map((probe) => `${probe.cliId}: ${probe.reason ?? probe.status}`)
          .join("; ");
        throw new Error(`没有可用的已探测模型（${reasons}）`);
      }
      const routed = route(
        {
          prompt: options.prompt,
          files: options.files,
          language: options.language,
          contextSize: options.contextSize,
          requiredStrengths: options.requiredStrengths,
        },
        config,
        { candidates },
      );
      if (!isAgentId(routed.agent)) {
        throw new Error(`routing selected unsupported agent: ${routed.agent}`);
      }
      agent = routed.agent;
      model = routed.model;
      decision = routed;
    }
    void decision;

    const adapter = cliAdapters[agent];
    const probe = catalog.probes.find((item) => item.cliId === agent);
    const probed = probe?.models.find((item) => item.modelId === (model ?? item.modelId));
    const structured = probed?.capabilities.structuredEvents === true;
    const executable = resolveExecutable(agent, config, detected, adapter.bin, resolve);
    const agentConfig = config.agents[agent];
    const args = adapter.buildPromptArgs
      ? [...adapter.buildPromptArgs({ prompt: options.prompt, model, extraArgs: agentConfig?.extraArgs })]
      : [...adapter.promptArgs(options.prompt)];
    void CLI_IDS;

    write(`coderelay: routing to ${targetDescription(agent, model)}\n`);

    // 统一流式生命周期：assistant 文本写 stdout，诊断写 stderr。
    const onEvent = (event: AgentEvent): void => {
      if (event.kind === "assistant_text") {
        writeOut(event.text);
      } else if (event.kind === "stderr") {
        write(event.text);
      } else if (event.kind === "tool_started") {
        write(`coderelay: 正在执行工具：${event.tool}\n`);
      } else if (event.kind === "status") {
        write(`coderelay: ${event.text}\n`);
      }
    };
    const handle = startStream({
      cmd: [executable, ...args],
      cwd: options.cwd,
      env: { ...process.env, ...agentConfig?.env, ...options.env },
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      protocol: structured ? "structured" : "text",
      parseChunk: adapter.parseOutputChunk,
      onEvent,
    });
    const result = await handle.done;

    if (result.status === "completed") {
      return 0;
    }
    if (result.status === "timeout") {
      write(`coderelay run: process timed out after ${options.timeoutMs ?? 0}ms\n`);
      return 124;
    }
    if (result.status === "aborted") {
      write("coderelay run: process aborted\n");
      return 130;
    }
    if (result.stderrTail.trim()) {
      write(result.stderrTail.endsWith("\n") ? result.stderrTail : `${result.stderrTail}\n`);
    }
    return result.code !== null && result.code > 0 ? result.code : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    write(`coderelay run: ${message}\n`);
    return 1;
  }
}
