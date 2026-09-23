/**
 * WSL process helpers.
 *
 * WSL is a second-class runtime: a CLI inside a distribution is reachable only
 * through `wsl.exe`, and its Linux paths must never be handed to a native
 * Windows `spawn`.
 */

import { existsSync, readFileSync } from "node:fs";

export const WSL_EXECUTABLE = "wsl.exe";

/** Default mount root WSL uses for Windows drives unless `wsl.conf` overrides it. */
export const DEFAULT_WSL_MOUNT_ROOT = "/mnt";
export const WSL_MOUNT_ROOT = DEFAULT_WSL_MOUNT_ROOT;

export interface WslAutomountConfig {
  readonly enabled: boolean;
  readonly root: string;
}

export interface ResolveWslMountRootOptions {
  readonly mountRoot?: string | null;
  readonly distro?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly wslConfPath?: string;
  readonly platform?: NodeJS.Platform;
}

export type WslPathOptions = string | ResolveWslMountRootOptions;

/**
 * Normalise a WSL mount root string.
 *
 * Leading slash is guaranteed, surrounding quotes and trailing slashes are
 * stripped, except for "/" which stays "/" (drives mounted directly at root).
 * Empty strings fall back to the documented default "/mnt".
 */
export function normalizeMountRoot(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "").trim();
  if (!trimmed) {
    return DEFAULT_WSL_MOUNT_ROOT;
  }
  const clean = trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
  return clean === "" ? "/" : `/${clean}`;
}

/**
 * Parse the `[automount]` section of a `wsl.conf` file.
 * Returns default values ({ enabled: true, root: "/mnt" }) for missing keys or sections.
 */
export function parseWslConfAutomount(content: string): WslAutomountConfig {
  let currentSection = "";
  let enabled = true;
  let root = DEFAULT_WSL_MOUNT_ROOT;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }

    const sectionMatch = /^\[([^\]]+)\]/.exec(line);
    if (sectionMatch) {
      currentSection = (sectionMatch[1] ?? "").trim().toLowerCase();
      continue;
    }

    if (currentSection === "automount") {
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) {
        continue;
      }
      const key = line.slice(0, eqIdx).trim().toLowerCase();
      const rawVal = line.slice(eqIdx + 1).trim();

      let val = "";
      const quoteMatch = /^("[^"]*"|'[^']*')/.exec(rawVal);
      if (quoteMatch) {
        val = (quoteMatch[1] ?? "").slice(1, -1).trim();
      } else {
        const commentIdx = rawVal.search(/[#;]/);
        const withoutComment =
          commentIdx !== -1 ? rawVal.slice(0, commentIdx) : rawVal;
        val = withoutComment.trim();
      }

      if (key === "enabled") {
        const lower = val.toLowerCase();
        if (
          lower === "false" ||
          lower === "0" ||
          lower === "no" ||
          lower === "off"
        ) {
          enabled = false;
        } else if (
          lower === "true" ||
          lower === "1" ||
          lower === "yes" ||
          lower === "on"
        ) {
          enabled = true;
        }
      } else if (key === "root") {
        if (val) {
          root = normalizeMountRoot(val);
        }
      }
    }
  }

  return { enabled, root };
}

function tryReadWslConf(filePath: string): WslAutomountConfig | null {
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8");
      return parseWslConfAutomount(content);
    }
  } catch {
    // Ignore filesystem or UNC access errors and fall back
  }
  return null;
}

/**
 * Resolve the active mount root for WSL.
 * Returns `null` if automount is disabled via `[automount] enabled = false`.
 */
export function resolveWslMountRoot(options?: WslPathOptions): string | null {
  if (typeof options === "string") {
    return normalizeMountRoot(options);
  }

  if (options?.mountRoot === null) {
    return null;
  }
  if (options?.mountRoot !== undefined) {
    return normalizeMountRoot(options.mountRoot);
  }

  const env = options?.env ?? process.env;
  const envRoot = env.WSL_AUTOMOUNT_ROOT?.trim() || env.WSL_MOUNT_ROOT?.trim();
  if (envRoot) {
    return normalizeMountRoot(envRoot);
  }

  if (options?.wslConfPath) {
    const parsed = tryReadWslConf(options.wslConfPath);
    if (parsed) {
      return parsed.enabled ? parsed.root : null;
    }
    return DEFAULT_WSL_MOUNT_ROOT;
  }

  const platform = options?.platform ?? process.platform;
  if (platform === "linux") {
    const parsed = tryReadWslConf("/etc/wsl.conf");
    if (parsed) {
      return parsed.enabled ? parsed.root : null;
    }
  } else if (platform === "win32") {
    const distro = options?.distro ?? env.WSL_DISTRO_NAME;
    if (distro) {
      const parsed =
        tryReadWslConf(`\\\\wsl.localhost\\${distro}\\etc\\wsl.conf`) ??
        tryReadWslConf(`\\\\wsl$\\${distro}\\etc\\wsl.conf`);
      if (parsed) {
        return parsed.enabled ? parsed.root : null;
      }
    }
  }

  return DEFAULT_WSL_MOUNT_ROOT;
}

/**
 * Build the argv for running `commandArgs` inside `distro`.
 * Without a distro name WSL uses its default distribution.
 */
export function buildWslArgs(
  distro: string | undefined,
  commandArgs: readonly string[],
): string[] {
  const args = distro ? ["-d", distro] : [];
  return [...args, "--", ...commandArgs];
}

/**
 * Convert a Windows path into the equivalent Linux path inside WSL.
 *
 * Honors `wsl.conf` `[automount] root` (defaulting to `/mnt`).
 * Returns `null` when no equivalent exists (UNC shares, relative paths,
 * or automount disabled).
 */
export function toWslPath(
  windowsPath: string,
  options?: WslPathOptions,
): string | null {
  const value = windowsPath.trim();
  if (!value) {
    return null;
  }

  // Already a Linux path (for example a path the user typed themselves).
  if (value.startsWith("/")) {
    return value;
  }

  // UNC share: \\server\share\... has no default WSL mount point.
  if (value.startsWith("\\\\")) {
    return null;
  }

  const drive = /^([A-Za-z]):(?:[\\/](.*))?$/.exec(value);
  if (!drive) {
    return null;
  }

  const letter = drive[1]?.toLowerCase();
  if (!letter) {
    return null;
  }

  const mountRoot = resolveWslMountRoot(options);
  if (mountRoot === null) {
    return null;
  }

  const prefix = mountRoot === "/" ? `/${letter}` : `${mountRoot}/${letter}`;
  const rest = (drive[2] ?? "").replaceAll("\\", "/").replace(/^\/+/, "");
  return rest ? `${prefix}/${rest}` : prefix;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchWindowsDrive(value: string, mountRoot: string): string | null {
  const root = normalizeMountRoot(mountRoot);
  const pattern =
    root === "/"
      ? /^\/([a-zA-Z])(?:\/(.*))?$/
      : new RegExp(`^${escapeRegExp(root)}\\/([a-zA-Z])(?:\\/(.*))?$`);
  const match = pattern.exec(value);
  if (!match) {
    return null;
  }
  const drive = match[1]?.toUpperCase();
  const rest = (match[2] ?? "").replaceAll("/", "\\");
  return rest ? `${drive}:\\${rest}` : `${drive}:\\`;
}

/**
 * Convert a WSL Linux path back into the equivalent Windows path.
 * Supports custom automount root and falls back to /mnt.
 * Returns null when not a mounted Windows drive.
 */
export function toWindowsPath(
  wslPath: string,
  options?: WslPathOptions,
): string | null {
  const value = wslPath.trim();
  const mountRoot = resolveWslMountRoot(options);

  if (mountRoot !== null) {
    const match = matchWindowsDrive(value, mountRoot);
    if (match) {
      return match;
    }
  }

  // Fallback to /mnt if custom root didn't match and options wasn't an explicit mountRoot
  const isExplicit =
    typeof options === "string" ||
    (typeof options === "object" && options?.mountRoot !== undefined);
  if (!isExplicit && mountRoot !== DEFAULT_WSL_MOUNT_ROOT) {
    const fallbackMatch = matchWindowsDrive(value, DEFAULT_WSL_MOUNT_ROOT);
    if (fallbackMatch) {
      return fallbackMatch;
    }
  }

  return null;
}

/**
 * `wsl.exe -l -q` writes UTF-16LE on most builds, which arrives as NUL-padded
 * text once decoded as UTF-8. Drop the padding and normalise line endings.
 */
export function decodeWslOutput(text: string): string {
  return text.replaceAll("\u0000", "");
}

/** Distribution names from `wsl.exe -l -q`, in the order WSL reports them. */
export function parseWslDistros(stdout: string): readonly string[] {
  return decodeWslOutput(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
