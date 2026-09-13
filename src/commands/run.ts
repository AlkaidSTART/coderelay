import type { AgentAdapter } from "../agents/adapter";
import { getAgentAdapter, isAgentId } from "../agents/registry";
import type { CliAdapterOptions } from "../agents/cli-adapters";
import { loadConfig } from "../config/loader";
import type { Config } from "../config/schema";
import { CLI_IDS, type CliId, type DetectedCli } from "../models/cli";
import {
  parseModelRef,
  type ModelStrength,
} from "../models/types";
import { route } from "../router/router";
import type { RouteDecision } from "../router/types";
import {
  resolveCommand,
  runProcess,
  type ProcessOptions,
  type ProcessResult,
} from "../runtime/process";
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
  readonly run?: (options: ProcessOptions) => Promise<ProcessResult>;
  readonly resolve?: (command: string) => string | null;
  readonly adapters?: CliAdapterOptions;
  /** Diagnostic output, including routing and process errors. Defaults to stderr. */
  readonly write?: (text: string) => void;
}

interface ResolvedTarget {
  readonly agent: CliId;
  readonly model?: string;
  readonly decision?: RouteDecision;
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

function explicitTarget(
  options: RunCommandOptions,
  config: Config,
): ResolvedTarget | null {
  if (!options.agent && !options.model) {
    return null;
  }

  const reference = options.model
    ? parseModelRef(options.model, options.agent ?? config.defaultAgent)
    : undefined;

  if (
    options.agent &&
    reference?.agent &&
    reference.agent !== options.agent
  ) {
    throw new Error(
      `model reference targets ${reference.agent}, but --agent is ${options.agent}`,
    );
  }

  const agent = options.agent ?? reference?.agent;
  if (!agent) {
    throw new Error("an explicit model does not include an agent");
  }
  if (!isAgentId(agent)) {
    throw new Error(`unsupported agent: ${agent}`);
  }

  return {
    agent,
    model: reference?.model || undefined,
  };
}

function assertAgentEnabled(config: Config, agent: CliId): void {
  if (config.agents[agent]?.enabled === false) {
    throw new Error(`agent is disabled: ${agent}`);
  }
}

function assertAgentAvailable(
  agent: CliId,
  available: readonly CliId[],
): void {
  if (!available.includes(agent)) {
    throw new Error(
      `agent is not available: ${agent}; run "coderelay doctor" for details`,
    );
  }
}

function resolveExecutable(
  agent: CliId,
  config: Config,
  detected: readonly DetectedCli[],
  adapter: AgentAdapter,
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

  const resolved = resolve(adapter.bin);
  if (resolved) {
    return resolved;
  }

  throw new Error(`agent is not available: ${agent}`);
}

function targetDescription(target: ResolvedTarget): string {
  const model = target.model ? `:${target.model}` : "";
  return `${target.agent}${model}`;
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
  const scan = dependencies.scan ?? scanCodingClis;
  const run = dependencies.run ?? runProcess;
  const resolve = dependencies.resolve ?? resolveCommand;

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
    const available = availableAgents(config, detected, resolve);

    let target = explicitTarget(options, config);
    if (!target) {
      const decision = route(
        {
          prompt: options.prompt,
          files: options.files,
          language: options.language,
          contextSize: options.contextSize,
          requiredStrengths: options.requiredStrengths,
        },
        config,
        { availableAgents: available },
      );

      if (!isAgentId(decision.agent)) {
        throw new Error(`routing selected unsupported agent: ${decision.agent}`);
      }

      target = {
        agent: decision.agent,
        model: decision.model,
        decision,
      };
    }

    assertAgentEnabled(config, target.agent);
    assertAgentAvailable(target.agent, available);

    const adapter = getAgentAdapter(target.agent, dependencies.adapters);
    if (!adapter) {
      throw new Error(`unsupported agent: ${target.agent}`);
    }

    const executable = resolveExecutable(
      target.agent,
      config,
      detected,
      adapter,
      resolve,
    );
    const agentConfig = config.agents[target.agent];
    const args = adapter.buildArgs({
      model: target.model,
      prompt: options.prompt,
      extraArgs: agentConfig?.extraArgs,
    });

    write(`coderelay: routing to ${targetDescription(target)}\n`);

    const result = await run({
      cmd: [executable, ...args],
      cwd: options.cwd,
      env: { ...agentConfig?.env, ...options.env },
      mode: "stream",
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });

    if (result.ok) {
      return 0;
    }

    if (result.timedOut) {
      write(
        `coderelay run: process timed out after ${options.timeoutMs ?? 0}ms\n`,
      );
    } else if (result.signal) {
      write(`coderelay run: process terminated by ${result.signal}\n`);
    }

    return result.code > 0 ? result.code : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    write(`coderelay run: ${message}\n`);
    return 1;
  }
}
