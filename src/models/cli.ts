import type { ChildProcess } from "node:child_process";

/** Supported coding-agent CLI identifiers, in canonical scan order. */
export const CLI_IDS = ["codex", "claude", "pi", "omp"] as const;

export type CliId = (typeof CLI_IDS)[number];

/** Agents that expose a documented host-environment marker. */
export type HostAgent = Extract<CliId, "claude" | "pi">;

/** Version flags are attempted in this order for every CLI. */
export const DEFAULT_VERSION_ARGS: readonly (readonly string[])[] = [
  ["--version"],
  ["-v"],
  ["-V"],
];

/** Static metadata shared by scanners and adapters. */
export interface CliDefinition {
  readonly id: CliId;
  readonly bin: string;
  readonly versionArgs: readonly (readonly string[])[];
}

export const CLI_DEFINITIONS: readonly CliDefinition[] = [
  { id: "codex", bin: "codex", versionArgs: DEFAULT_VERSION_ARGS },
  { id: "claude", bin: "claude", versionArgs: DEFAULT_VERSION_ARGS },
  { id: "pi", bin: "pi", versionArgs: DEFAULT_VERSION_ARGS },
  { id: "omp", bin: "omp", versionArgs: DEFAULT_VERSION_ARGS },
];

/** Result of scanning the host for one supported CLI. */
export interface DetectedCli {
  readonly id: CliId;
  readonly bin: string;
  readonly path: string;
  readonly version: string | null;
  readonly available: boolean;
}

/** Uniform metadata and argument construction for one CLI. */
export interface CliAdapter {
  readonly id: CliId;
  readonly bin: string;
  readonly configDir: string;
  readonly versionArgs: readonly (readonly string[])[];
  readonly interactiveArgs: readonly string[];
  readonly promptArgs: (prompt: string) => readonly string[];
}

/** Options accepted by the Node `execFile` runner used by the scanner. */
export interface ExecFileRequestOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeout?: number;
  readonly maxBuffer?: number;
  readonly windowsHide?: boolean;
  readonly shell?: boolean;
}

export interface ExecFileResult {
  readonly stdout: string;
  readonly stderr: string;
}

export type ExecFileRunner = (
  file: string,
  args: readonly string[],
  options?: ExecFileRequestOptions,
) => Promise<ExecFileResult>;

/** Options accepted by the Node `spawn` runner used by the launcher. */
export interface SpawnRequestOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly stdio?: "inherit";
  readonly shell?: boolean;
  readonly windowsHide?: boolean;
}

export type SpawnRunner = (
  file: string,
  args: readonly string[],
  options?: SpawnRequestOptions,
) => ChildProcess;
