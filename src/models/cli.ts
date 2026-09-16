import type { ChildProcess } from "node:child_process";

import type { AgentEvent } from "./agent-events";
import type { CliCapabilities, ProbeResult } from "../agents/capabilities";

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

export interface PromptBuildOptions {
  readonly prompt: string;
  readonly model?: string;
  readonly extraArgs?: readonly string[];
  /** 原生会话 id（CLI 支持 resume 时使用）。 */
  readonly nativeSessionId?: string;
}

/** Uniform metadata and argument construction for one CLI. */
export interface CliAdapter {
  readonly id: CliId;
  readonly bin: string;
  readonly configDir: string;
  readonly versionArgs: readonly (readonly string[])[];
  readonly interactiveArgs: readonly string[];
  readonly promptArgs: (prompt: string) => readonly string[];
  /** 探测本机已配置模型；失败时带 reason，禁止静默转默认。 */
  readonly probeModels?: () => Promise<ProbeResult>;
  readonly probeCapabilities?: () => CliCapabilities;
  /** 非交互任务参数（含模型选择与原生恢复）。 */
  readonly buildPromptArgs?: (options: PromptBuildOptions) => readonly string[];
  /** 原生会话恢复参数；不支持时返回 null，调用方走 transcript 注入。 */
  readonly buildResumeArgs?: (
    sessionId: string,
    options?: Omit<PromptBuildOptions, "nativeSessionId" | "prompt"> & { readonly prompt?: string },
  ) => readonly string[] | null;
  /** 将原始 stdout/stderr 片段解析为统一事件。 */
  readonly parseOutputChunk?: (
    chunk: string,
    source: "stdout" | "stderr",
  ) => readonly AgentEvent[];
  readonly defaultModel?: () => string | undefined;
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

/** Per-fd stdio setting accepted by the Node `spawn` runner. */
export type SpawnStdio = "inherit" | "pipe" | "ignore";

/** Options accepted by the Node `spawn` runner used by the launcher. */
export interface SpawnRequestOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly stdio?: SpawnStdio | [SpawnStdio, SpawnStdio, SpawnStdio];
  readonly shell?: boolean;
  readonly windowsHide?: boolean;
}

export type SpawnRunner = (
  file: string,
  args: readonly string[],
  options?: SpawnRequestOptions,
) => ChildProcess;
