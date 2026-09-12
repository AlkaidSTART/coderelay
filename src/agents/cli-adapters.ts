import { homedir } from "node:os";
import path from "node:path";

import {
  CLI_IDS,
  DEFAULT_VERSION_ARGS,
  type CliAdapter,
  type CliId,
} from "../models/cli";

export interface CliAdapterOptions {
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
}

function claudeConfigDir(homeDir: string, env: NodeJS.ProcessEnv): string {
  const configured = env.CLAUDE_CONFIG_DIR?.trim();
  return configured || path.join(homeDir, ".claude");
}

/** Build a fresh adapter registry, primarily for tests and embedded hosts. */
export function createCliAdapters(
  options: CliAdapterOptions = {},
): Readonly<Record<CliId, CliAdapter>> {
  const homeDir = options.homeDir ?? homedir();
  const env = options.env ?? process.env;

  return Object.freeze({
    codex: Object.freeze({
      id: "codex",
      bin: "codex",
      configDir: path.join(homeDir, ".codex"),
      versionArgs: DEFAULT_VERSION_ARGS,
      interactiveArgs: Object.freeze([]),
      promptArgs: (prompt: string) => [prompt],
    }),
    claude: Object.freeze({
      id: "claude",
      bin: "claude",
      configDir: claudeConfigDir(homeDir, env),
      versionArgs: DEFAULT_VERSION_ARGS,
      interactiveArgs: Object.freeze([]),
      promptArgs: (prompt: string) => ["-p", prompt],
    }),
    pi: Object.freeze({
      id: "pi",
      bin: "pi",
      configDir: path.join(homeDir, ".pi", "agent"),
      versionArgs: DEFAULT_VERSION_ARGS,
      interactiveArgs: Object.freeze([]),
      promptArgs: (prompt: string) => ["-p", prompt],
    }),
    omp: Object.freeze({
      id: "omp",
      bin: "omp",
      configDir: path.join(homeDir, ".omp"),
      versionArgs: DEFAULT_VERSION_ARGS,
      interactiveArgs: Object.freeze([]),
      promptArgs: (prompt: string) => ["-p", prompt],
    }),
  });
}

/** Default registry derived from the current user's home and environment. */
export const CLI_ADAPTERS: Readonly<Record<CliId, CliAdapter>> =
  createCliAdapters();

export function getCliAdapter(
  id: CliId,
  options?: CliAdapterOptions,
): CliAdapter {
  const adapters = options ? createCliAdapters(options) : CLI_ADAPTERS;
  return adapters[id];
}

export function getCliAdapters(
  options?: CliAdapterOptions,
): Readonly<Record<CliId, CliAdapter>> {
  return options ? createCliAdapters(options) : CLI_ADAPTERS;
}

export { CLI_IDS };
