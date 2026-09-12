import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  CLI_DEFINITIONS,
  DEFAULT_VERSION_ARGS,
  type CliId,
  type DetectedCli,
  type ExecFileRequestOptions,
  type ExecFileRunner,
  type HostAgent,
} from "../models/cli";

export type FileAccess = (path: string, mode?: number) => Promise<void>;

export interface ScannerOptions {
  readonly execFile?: ExecFileRunner;
  readonly access?: FileAccess;
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly resolveTimeoutMs?: number;
  readonly versionTimeoutMs?: number;
  readonly versionArgs?: readonly (readonly string[])[];
}

interface ResolvedScannerOptions {
  readonly execFile: ExecFileRunner;
  readonly access: FileAccess;
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
  readonly env: NodeJS.ProcessEnv;
  readonly resolveTimeoutMs: number;
  readonly versionTimeoutMs: number;
  readonly versionArgs: readonly (readonly string[])[];
}

const execFileAsync = promisify(execFile);

const defaultExecFile: ExecFileRunner = async (file, args, options = {}) => {
  const result = await execFileAsync(file, [...args], {
    ...options,
    encoding: "utf8",
  });

  return {
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  };
};

function resolveScannerOptions(
  options: ScannerOptions = {},
): ResolvedScannerOptions {
  return {
    execFile: options.execFile ?? defaultExecFile,
    access: options.access ?? access,
    platform: options.platform ?? process.platform,
    homeDir: options.homeDir ?? homedir(),
    env: options.env ?? process.env,
    resolveTimeoutMs: options.resolveTimeoutMs ?? 3_000,
    versionTimeoutMs: options.versionTimeoutMs ?? 5_000,
    versionArgs: options.versionArgs ?? DEFAULT_VERSION_ARGS,
  };
}

function firstNonEmptyLine(value: string): string | null {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null
  );
}

export async function resolveOnPath(
  bin: string,
  options: ScannerOptions = {},
): Promise<string | null> {
  const resolved = resolveScannerOptions(options);
  const lookupCommand = resolved.platform === "win32" ? "where" : "which";

  try {
    const { stdout } = await resolved.execFile(
      lookupCommand,
      [bin],
      {
        timeout: resolved.resolveTimeoutMs,
        windowsHide: true,
      } satisfies ExecFileRequestOptions,
    );

    return firstNonEmptyLine(stdout);
  } catch {
    return null;
  }
}

export async function getCliVersion(
  binPath: string,
  options: ScannerOptions = {},
): Promise<string | null> {
  const resolved = resolveScannerOptions(options);

  for (const args of resolved.versionArgs) {
    try {
      const { stdout, stderr } = await resolved.execFile(
        binPath,
        args,
        {
          timeout: resolved.versionTimeoutMs,
          windowsHide: true,
        } satisfies ExecFileRequestOptions,
      );
      const output = stdout.trim() ? stdout : stderr;
      const version = firstNonEmptyLine(output);
      if (version) {
        return version;
      }
    } catch {
      // Try the next documented flag; one failed probe never fails the scan.
    }
  }

  return null;
}

export async function getWindowsClaudeFallback(
  options: ScannerOptions = {},
): Promise<string | null> {
  const resolved = resolveScannerOptions(options);
  if (resolved.platform !== "win32") {
    return null;
  }

  const windowsPath = path.win32;
  const appData = resolved.env.APPDATA?.trim();
  const candidates = [
    windowsPath.join(resolved.homeDir, ".local", "bin", "claude.exe"),
    appData ? windowsPath.join(appData, "npm", "claude.cmd") : null,
    windowsPath.join(resolved.homeDir, ".bun", "bin", "claude.exe"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await resolved.access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through the documented fallback list.
    }
  }

  return null;
}

async function scanCli(
  id: CliId,
  bin: string,
  options: ScannerOptions,
): Promise<DetectedCli> {
  const resolved = resolveScannerOptions(options);
  let cliPath = await resolveOnPath(bin, options);

  if (!cliPath && id === "claude") {
    cliPath = await getWindowsClaudeFallback(options);
  }

  if (!cliPath) {
    return {
      id,
      bin,
      path: "",
      version: null,
      available: false,
    };
  }

  const version = await getCliVersion(cliPath, {
    ...options,
    versionTimeoutMs: resolved.versionTimeoutMs,
    versionArgs: resolved.versionArgs,
  });

  return {
    id,
    bin,
    path: cliPath,
    version,
    available: true,
  };
}

/** Scan supported CLIs concurrently while preserving canonical result order. */
export async function scanCodingClis(
  options: ScannerOptions = {},
): Promise<DetectedCli[]> {
  return Promise.all(
    CLI_DEFINITIONS.map((definition) =>
      scanCli(definition.id, definition.bin, options),
    ),
  );
}

/** Detect one of the runtime host markers documented for Claude Code and Pi. */
export function detectHostAgent(
  env: NodeJS.ProcessEnv = process.env,
): HostAgent | null {
  if (env.CLAUDECODE === "1" || env.CLAUDE_CODE_CHILD_SESSION === "1") {
    return "claude";
  }

  if (env.PI_CODING_AGENT === "true" || env.PI_CODING_AGENT === "1") {
    return "pi";
  }

  return null;
}
