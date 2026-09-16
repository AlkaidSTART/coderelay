/**
 * WSL process helpers.
 *
 * WSL is a second-class runtime: a CLI inside a distribution is reachable only
 * through `wsl.exe`, and its Linux paths must never be handed to a native
 * Windows `spawn`.
 */

export const WSL_EXECUTABLE = "wsl.exe";

/** Mount root WSL uses for Windows drives unless `wsl.conf` overrides it. */
const WSL_MOUNT_ROOT = "/mnt";

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
 * This is the documented `/mnt/<drive>` mapping — the pure equivalent of
 * `wslpath -a`, kept dependency-free because the launch path is synchronous.
 * Returns `null` when no equivalent exists (UNC shares, relative paths).
 */
export function toWslPath(windowsPath: string): string | null {
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

  const rest = (drive[2] ?? "").replaceAll("\\", "/").replace(/^\/+/, "");
  return rest
    ? `${WSL_MOUNT_ROOT}/${letter}/${rest}`
    : `${WSL_MOUNT_ROOT}/${letter}`;
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
