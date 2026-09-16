/**
 * WSL discovery: which distributions exist, and which supported CLIs each one
 * can launch.
 *
 * Runs only on native Windows. Every failure is isolated into a diagnostic —
 * a broken WSL install must never affect native Windows CLI detection.
 */
import {
  CLI_DEFINITIONS,
  DEFAULT_VERSION_ARGS,
  type CliDiagnostic,
  type CliId,
  type ExecFileRequestOptions,
  type ExecFileRunner,
} from "../models/cli";
import {
  buildWslArgs,
  decodeWslOutput,
  parseWslDistros,
  WSL_EXECUTABLE,
} from "../runtime/wsl";
import { probeVersion } from "./version-probe";

/** One Linux executable found inside a WSL distribution. */
export interface WslCliLocation {
  readonly distro: string;
  readonly path: string;
  readonly version: string | null;
}

export interface WslScanResult {
  /** `wsl.exe` answered and reported at least one distribution. */
  readonly detected: boolean;
  /** Distribution names in the order `wsl.exe -l -q` returned them. */
  readonly distros: readonly string[];
  readonly locations: ReadonlyMap<CliId, readonly WslCliLocation[]>;
  readonly diagnostics: readonly CliDiagnostic[];
}

export interface WslScanOptions {
  readonly execFile: ExecFileRunner;
  readonly resolveTimeoutMs?: number;
  readonly versionTimeoutMs?: number;
  readonly versionArgs?: readonly (readonly string[])[];
  /** Overridable for tests; WSL is normally reached as `wsl.exe`. */
  readonly wslBin?: string;
}

function execOptions(timeout: number): ExecFileRequestOptions {
  return { timeout, windowsHide: true };
}

async function listDistros(
  wslBin: string,
  execFile: ExecFileRunner,
  timeoutMs: number,
): Promise<{ readonly distros: readonly string[]; readonly error: string | null }> {
  try {
    const { stdout } = await execFile(
      wslBin,
      ["-l", "-q"],
      execOptions(timeoutMs),
    );
    return { distros: parseWslDistros(stdout), error: null };
  } catch (error) {
    return {
      distros: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Resolve one CLI inside one distribution with `command -v`. */
async function locateInDistro(
  wslBin: string,
  distro: string,
  bin: string,
  execFile: ExecFileRunner,
  timeoutMs: number,
): Promise<string | null> {
  try {
    const { stdout } = await execFile(
      wslBin,
      buildWslArgs(distro, ["sh", "-lc", `command -v ${bin}`]),
      execOptions(timeoutMs),
    );
    const first = decodeWslOutput(stdout).split(/\r?\n/)[0]?.trim();
    return first ? first : null;
  } catch {
    return null;
  }
}

/**
 * Probe every distribution for every supported CLI. Distributions run in
 * parallel; within one distribution the probes stay sequential so a slow
 * `command -v` cannot fan out into an unbounded burst of `wsl.exe`.
 */
export async function scanWslClis(
  options: WslScanOptions,
): Promise<WslScanResult> {
  const wslBin = options.wslBin ?? WSL_EXECUTABLE;
  const resolveTimeoutMs = options.resolveTimeoutMs ?? 5_000;
  const versionTimeoutMs = options.versionTimeoutMs ?? 8_000;
  const versionArgs = options.versionArgs ?? DEFAULT_VERSION_ARGS;
  const diagnostics: CliDiagnostic[] = [];
  const empty: ReadonlyMap<CliId, readonly WslCliLocation[]> = new Map();

  const { distros, error } = await listDistros(
    wslBin,
    options.execFile,
    resolveTimeoutMs,
  );

  if (error !== null) {
    diagnostics.push({
      level: "info",
      message: `WSL 不可用（${wslBin} -l -q 失败）：${error}`,
    });
    return { detected: false, distros: [], locations: empty, diagnostics };
  }

  if (distros.length === 0) {
    diagnostics.push({
      level: "info",
      message: "已检测到 wsl.exe，但未安装任何 WSL 发行版。",
    });
    return { detected: false, distros: [], locations: empty, diagnostics };
  }

  const perDistro = await Promise.all(
    distros.map(async (distro) => {
      const found: Array<readonly [CliId, WslCliLocation]> = [];
      for (const definition of CLI_DEFINITIONS) {
        const linuxPath = await locateInDistro(
          wslBin,
          distro,
          definition.bin,
          options.execFile,
          resolveTimeoutMs,
        );
        if (!linuxPath) {
          continue;
        }
        const version = await probeVersion(buildWslArgs(distro, [linuxPath]), {
          execFile: options.execFile,
          timeoutMs: versionTimeoutMs,
          versionArgs,
        });
        found.push([definition.id, { distro, path: linuxPath, version }]);
      }
      return found;
    }),
  );

  const locations = new Map<CliId, readonly WslCliLocation[]>();
  for (const [id, location] of perDistro.flat()) {
    locations.set(id, [...(locations.get(id) ?? []), location]);
  }

  return { detected: true, distros, locations, diagnostics };
}
