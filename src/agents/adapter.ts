import type { CliAdapter, CliId } from "../models/cli";

export interface AgentBuildOptions {
  readonly model?: string;
  /** Omit for an interactive launch. */
  readonly prompt?: string;
  readonly extraArgs?: readonly string[];
}

/** Agent-level adapter built on the low-level CLI metadata adapter. */
export interface AgentAdapter {
  readonly id: CliId;
  readonly bin: string;
  readonly configDir: string;
  readonly defaultModel?: string;
  readonly cli: CliAdapter;
  /** Build argv after the executable name. */
  buildArgs(options?: AgentBuildOptions): string[];
}

export interface CreateAgentAdapterOptions {
  readonly defaultModel?: string;
}

export function createAgentAdapter(
  cli: CliAdapter,
  options: CreateAgentAdapterOptions = {},
): AgentAdapter {
  return {
    id: cli.id,
    bin: cli.bin,
    configDir: cli.configDir,
    defaultModel: options.defaultModel,
    cli,
    buildArgs(buildOptions = {}) {
      const args: string[] = [];

      if (buildOptions.model) {
        args.push("--model", buildOptions.model);
      }

      if (buildOptions.prompt !== undefined) {
        args.push(...cli.promptArgs(buildOptions.prompt));
      } else {
        args.push(...cli.interactiveArgs);
      }

      args.push(...(buildOptions.extraArgs ?? []));
      return args;
    },
  };
}

export function isCliId(value: string): value is CliId {
  return value === "codex" || value === "claude" || value === "pi" || value === "omp";
}
